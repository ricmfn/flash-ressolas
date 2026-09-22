import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { config, loadServiceAccount } from "./config.js";
import { Router, parseCookies, readJsonBody, sendJson } from "./http/router.js";
import { serveStatic } from "./staticFiles.js";
import { SheetsClient } from "./google/sheetsClient.js";
import { OrdersRepository } from "./ordersRepository.js";
import { ExpensesRepository } from "./expensesRepository.js";
import { EXPENSES_SEED } from "./expensesSeed.js";
import { RubberRepository } from "./rubberRepository.js";
import { RUBBER_SEED } from "./rubberSeed.js";
import { RubberUsageRepository, RUBBER_USAGE_HEADER } from "./rubberUsageRepository.js";
import { fixRubberSeedV1, addLegacyInvestmentIfMissing } from "./migrations.js";
import { SyncService } from "./syncService.js";
import { verifyPassword } from "./auth/password.js";
import { createSessionToken } from "./auth/session.js";
import { requireAuth, SESSION_COOKIE } from "./auth/middleware.js";
import { orderToJSON } from "./serialize.js";
import { uploadPublicPhoto } from "./google/driveClient.js";
import { computeDashboardMetrics, computeProfitability, summarizeExpenses } from "../shared/metrics.js";
import { summarizeRubber } from "../shared/rubber.js";
import { currentRubberAssignments, countPairsPerRubberSheet } from "../shared/rubberUsage.js";
import { isValidStatus, isPending, isAwaitingDropoff } from "../shared/status.js";
import { resolveDropoffLabel } from "../shared/dropoffLocations.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// O frontend (src/public-src) compila diretamente para src/public/js, e os demais
// arquivos estaticos (index.html, css, manifest, sw.js, icones) sao autorados direto
// em src/public — nao existe (nem precisa existir) um "dist/public". Por isso o
// diretorio estatico servido e sempre src/public, mesmo a partir do build em dist/.
const PUBLIC_DIR = join(__dirname, "..", "..", "src", "public");

const account = loadServiceAccount();
const sheets = new SheetsClient(account, config.spreadsheetId);
const ordersRepo = new OrdersRepository(sheets);
const expensesRepo = new ExpensesRepository(sheets);
const rubberRepo = new RubberRepository(sheets);
const rubberUsageRepo = new RubberUsageRepository(sheets);
const syncService = new SyncService(ordersRepo, config.autoSyncIntervalMs);

const router = new Router();

// ---------- Auth ----------

router.post("/api/login", async (ctx) => {
  const body = await readJsonBody<{ username?: string; password?: string }>(ctx.req);
  if (!body.username || !body.password) {
    return sendJson(ctx, 400, { error: "Informe usuário e senha." });
  }
  // Compara usuario sem diferenciar maiusculas/minusculas: teclados de celular costumam
  // capitalizar a primeira letra de um campo de texto automaticamente (autocapitalize),
  // o que faria "ricardo" virar "Ricardo" sem o usuario perceber e derrubar um login
  // com a senha certa. A senha continua comparada exatamente (case-sensitive).
  const usernameMatches = body.username.trim().toLowerCase() === config.authUsername.trim().toLowerCase();
  if (!usernameMatches || !verifyPassword(body.password, config.authPasswordHash)) {
    return sendJson(ctx, 401, { error: "Usuário ou senha incorretos." });
  }
  const normalizedUsername = config.authUsername.trim();
  const token = createSessionToken(normalizedUsername, config.sessionSecret);
  ctx.res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${30 * 24 * 60 * 60}; SameSite=Lax`,
  );
  sendJson(ctx, 200, { ok: true, username: normalizedUsername });
});

router.post("/api/logout", (ctx) => {
  ctx.res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
  sendJson(ctx, 200, { ok: true });
});

router.get("/api/me", (ctx) => {
  const session = requireAuth(ctx);
  if (!session) return;
  sendJson(ctx, 200, { username: session.username });
});

// ---------- Orders ----------

router.get("/api/orders", (ctx) => {
  if (!requireAuth(ctx)) return;
  const sortedOrders = syncService.store.listSorted();
  const orders = sortedOrders.map(orderToJSON);
  sendJson(ctx, 200, {
    orders,
    // "Aguardando sapatilha" fica de fora do contador de pendentes: o formulario ja foi
    // preenchido mas o cliente ainda nao trouxe o item fisicamente, entao nao e' um pedido
    // esperando triagem/conserto de verdade ainda.
    pendingCount: sortedOrders.filter((o) => isPending(o.status) && !isAwaitingDropoff(o.status)).length,
    awaitingDropoffCount: sortedOrders.filter((o) => isAwaitingDropoff(o.status)).length,
    lastSyncedAt: syncService.store.getLastSyncedAt()?.toISOString() ?? null,
    lastSyncError: syncService.store.getLastSyncError(),
  });
});

router.post("/api/orders/:row/status", async (ctx) => {
  if (!requireAuth(ctx)) return;
  const sheetRowIndex = Number(ctx.params.row);
  if (!Number.isInteger(sheetRowIndex) || sheetRowIndex < 2) {
    return sendJson(ctx, 400, { error: "Linha inválida." });
  }
  const body = await readJsonBody<{ status?: string; deliveryDateISO?: string | null }>(ctx.req);
  if (!body.status || !isValidStatus(body.status)) {
    return sendJson(ctx, 400, { error: "Status inválido." });
  }
  try {
    const updated = await ordersRepo.updateStatus(sheetRowIndex, body.status, body.deliveryDateISO ?? null);
    syncService.store.upsertOne(updated);
    sendJson(ctx, 200, { order: orderToJSON(updated) });
  } catch (err) {
    sendJson(ctx, 500, { error: err instanceof Error ? err.message : "Erro ao salvar status." });
  }
});

router.post("/api/orders/:row/price", async (ctx) => {
  if (!requireAuth(ctx)) return;
  const sheetRowIndex = Number(ctx.params.row);
  if (!Number.isInteger(sheetRowIndex) || sheetRowIndex < 2) {
    return sendJson(ctx, 400, { error: "Linha inválida." });
  }
  const body = await readJsonBody<{ rawValue?: string }>(ctx.req);
  if (body.rawValue === undefined) {
    return sendJson(ctx, 400, { error: "Informe o valor do preço." });
  }
  try {
    const updated = await ordersRepo.updatePrice(sheetRowIndex, body.rawValue);
    syncService.store.upsertOne(updated);
    sendJson(ctx, 200, { order: orderToJSON(updated) });
  } catch (err) {
    // Nunca grava silenciosamente: erro de validação (ex: "?", data, texto) volta pro app.
    sendJson(ctx, 422, { error: err instanceof Error ? err.message : "Preço inválido." });
  }
});

router.post("/api/orders/:row/receive", async (ctx) => {
  if (!requireAuth(ctx)) return;
  const sheetRowIndex = Number(ctx.params.row);
  if (!Number.isInteger(sheetRowIndex) || sheetRowIndex < 2) {
    return sendJson(ctx, 400, { error: "Linha inválida." });
  }
  try {
    const updated = await ordersRepo.markReceived(sheetRowIndex);
    syncService.store.upsertOne(updated);
    sendJson(ctx, 200, { order: orderToJSON(updated) });
  } catch (err) {
    sendJson(ctx, 500, { error: err instanceof Error ? err.message : "Erro ao marcar como recebido." });
  }
});

// ---------- Sync ----------

router.post("/api/sync", async (ctx) => {
  if (!requireAuth(ctx)) return;
  const result = await syncService.sync();
  sendJson(ctx, result.error ? 200 : 200, {
    ranNow: result.ranNow,
    error: result.error,
    lastSyncedAt: syncService.store.getLastSyncedAt()?.toISOString() ?? null,
    ordersCount: syncService.store.size(),
  });
});

// ---------- Dashboard & Despesas ----------

router.get("/api/dashboard", (ctx) => {
  if (!requireAuth(ctx)) return;
  const orders = syncService.store.listSorted();
  const metrics = computeDashboardMetrics(orders);
  sendJson(ctx, 200, metrics);
});

router.get("/api/expenses", async (ctx) => {
  if (!requireAuth(ctx)) return;
  try {
    const rows = await expensesRepo.readAll();
    sendJson(ctx, 200, summarizeExpenses(rows));
  } catch (err) {
    sendJson(ctx, 502, { error: err instanceof Error ? err.message : "Erro ao ler despesas." });
  }
});

router.get("/api/profitability", async (ctx) => {
  if (!requireAuth(ctx)) return;
  try {
    const orders = syncService.store.listSorted();
    const expenseRows = await expensesRepo.readAll();
    const rubberSheets = await rubberRepo.readAll();
    sendJson(ctx, 200, computeProfitability(orders, expenseRows, rubberSheets));
  } catch (err) {
    sendJson(ctx, 502, { error: err instanceof Error ? err.message : "Erro ao calcular rentabilidade." });
  }
});

// ---------- Borrachas (estoque de folhas de borracha) ----------

router.get("/api/rubber", async (ctx) => {
  if (!requireAuth(ctx)) return;
  try {
    const sheets_ = await rubberRepo.readAll();
    sendJson(ctx, 200, summarizeRubber(sheets_));
  } catch (err) {
    sendJson(ctx, 502, { error: err instanceof Error ? err.message : "Erro ao ler borrachas." });
  }
});

router.post("/api/rubber", async (ctx) => {
  if (!requireAuth(ctx)) return;
  const body = await readJsonBody<{
    date?: string;
    brand?: string;
    supplier?: string;
    value?: number | string | null;
    percentRemaining?: number | string | null;
    notes?: string;
  }>(ctx.req);
  if (!body.brand || !body.brand.trim()) {
    return sendJson(ctx, 400, { error: "Informe a marca/tipo da borracha." });
  }
  try {
    const parsedValue =
      body.value === null || body.value === undefined || body.value === "" ? null : Number(body.value);
    if (parsedValue !== null && !Number.isFinite(parsedValue)) {
      return sendJson(ctx, 422, { error: "Valor inválido." });
    }
    const parsedPercent =
      body.percentRemaining === null || body.percentRemaining === undefined || body.percentRemaining === ""
        ? null
        : Number(body.percentRemaining);
    if (parsedPercent !== null && (!Number.isFinite(parsedPercent) || parsedPercent < 0 || parsedPercent > 100)) {
      return sendJson(ctx, 422, { error: "Percentual restante precisa estar entre 0 e 100." });
    }
    await rubberRepo.addSheet({
      date: (body.date ?? "").trim(),
      brand: body.brand.trim(),
      supplier: (body.supplier ?? "").trim(),
      value: parsedValue,
      percentRemaining: parsedPercent,
      notes: (body.notes ?? "").trim(),
    });
    const sheets_ = await rubberRepo.readAll();
    sendJson(ctx, 200, summarizeRubber(sheets_));
  } catch (err) {
    sendJson(ctx, 422, { error: err instanceof Error ? err.message : "Erro ao adicionar folha." });
  }
});

router.post("/api/rubber/:row/percent", async (ctx) => {
  if (!requireAuth(ctx)) return;
  const sheetRowIndex = Number(ctx.params.row);
  if (!Number.isInteger(sheetRowIndex) || sheetRowIndex < 2) {
    return sendJson(ctx, 400, { error: "Linha inválida." });
  }
  const body = await readJsonBody<{ percent?: number }>(ctx.req);
  if (body.percent === undefined || !Number.isFinite(body.percent)) {
    return sendJson(ctx, 400, { error: "Informe o percentual restante." });
  }
  try {
    await rubberRepo.updatePercent(sheetRowIndex, body.percent);
    const sheets_ = await rubberRepo.readAll();
    sendJson(ctx, 200, summarizeRubber(sheets_));
  } catch (err) {
    sendJson(ctx, 422, { error: err instanceof Error ? err.message : "Percentual inválido." });
  }
});

// ---------- Uso de borracha por pedido (qual folha ressolou qual par) ----------

router.get("/api/rubber-usage", async (ctx) => {
  if (!requireAuth(ctx)) return;
  try {
    const entries = await rubberUsageRepo.readAll();
    const current = currentRubberAssignments(entries);
    const currentJSON: Record<string, { rubberSheetRowIndex: number | null; rubberLabel: string }> = {};
    for (const [orderRow, entry] of current) {
      currentJSON[orderRow] = { rubberSheetRowIndex: entry.rubberSheetRowIndex, rubberLabel: entry.rubberLabel };
    }
    const pairsCounts = countPairsPerRubberSheet(entries);
    const pairsPerRubberSheet: Record<string, number> = {};
    for (const [rubberRow, count] of pairsCounts) {
      pairsPerRubberSheet[rubberRow] = count;
    }
    sendJson(ctx, 200, { current: currentJSON, pairsPerRubberSheet });
  } catch (err) {
    sendJson(ctx, 502, { error: err instanceof Error ? err.message : "Erro ao ler uso de borracha." });
  }
});

router.post("/api/orders/:row/rubber-sheet", async (ctx) => {
  if (!requireAuth(ctx)) return;
  const sheetRowIndex = Number(ctx.params.row);
  if (!Number.isInteger(sheetRowIndex) || sheetRowIndex < 2) {
    return sendJson(ctx, 400, { error: "Linha inválida." });
  }
  const body = await readJsonBody<{ rubberSheetRowIndex?: number | string | null }>(ctx.req);
  const rubberSheetRowIndex =
    body.rubberSheetRowIndex === undefined || body.rubberSheetRowIndex === null || body.rubberSheetRowIndex === ""
      ? null
      : Number(body.rubberSheetRowIndex);
  if (rubberSheetRowIndex !== null && (!Number.isInteger(rubberSheetRowIndex) || rubberSheetRowIndex < 2)) {
    return sendJson(ctx, 400, { error: "Folha inválida." });
  }

  try {
    let rubberLabel = "";
    if (rubberSheetRowIndex !== null) {
      const sheets_ = await rubberRepo.readAll();
      const match = sheets_.find((s) => s.sheetRowIndex === rubberSheetRowIndex);
      if (!match) return sendJson(ctx, 404, { error: "Folha de borracha não encontrada." });
      rubberLabel = [match.brand, match.supplier].filter((v) => v.trim() !== "").join(" — ");
    }

    const order = syncService.store.get(sheetRowIndex);
    await rubberUsageRepo.assign(sheetRowIndex, order?.formId ?? null, rubberSheetRowIndex, rubberLabel);

    const entries = await rubberUsageRepo.readAll();
    const assigned = currentRubberAssignments(entries).get(sheetRowIndex) ?? null;
    sendJson(ctx, 200, {
      rubberSheetRowIndex: assigned?.rubberSheetRowIndex ?? null,
      rubberLabel: assigned?.rubberLabel ?? "",
    });
  } catch (err) {
    sendJson(ctx, 500, { error: err instanceof Error ? err.message : "Erro ao salvar a folha usada." });
  }
});

// ---------- Drop-off box (formulário público, sem login, pra QR code na loja) ----------

router.post("/api/dropoff", async (ctx) => {
  const body = await readJsonBody<{
    customerName?: string;
    customerPhone?: string;
    brandModel?: string;
    sizeEU?: string;
    photoBase64?: string;
    photoMime?: string;
    local?: string;
  }>(ctx.req, 8_000_000);

  const customerName = (body.customerName ?? "").trim();
  const customerPhone = (body.customerPhone ?? "").trim();
  const brandModel = (body.brandModel ?? "").trim();
  const sizeRaw = (body.sizeEU ?? "").trim();

  if (!customerName || !customerPhone || !brandModel || !sizeRaw) {
    return sendJson(ctx, 400, { error: "Preencha nome, WhatsApp, marca/modelo e numeração." });
  }

  const sizeEU = /^eu\b/i.test(sizeRaw) ? sizeRaw : `EU ${sizeRaw}`;
  const originLabel = resolveDropoffLabel(body.local);

  let photoUrl: string | null = null;
  if (body.photoBase64) {
    try {
      const commaIdx = body.photoBase64.indexOf(",");
      const base64 =
        commaIdx !== -1 && body.photoBase64.startsWith("data:") ? body.photoBase64.slice(commaIdx + 1) : body.photoBase64;
      const bytes = Buffer.from(base64, "base64");
      const mime = body.photoMime && body.photoMime.startsWith("image/") ? body.photoMime : "image/jpeg";
      const ext = mime === "image/png" ? "png" : "jpg";
      photoUrl = await uploadPublicPhoto(account, bytes, mime, `dropoff-${Date.now()}.${ext}`);
    } catch (err) {
      // Nao bloqueia a entrega do pedido por causa da foto — melhor registrar sem foto
      // (o lojista pede por WhatsApp depois) do que perder o pedido inteiro.
      console.error("Falha ao enviar foto da drop-off box para o Drive:", err);
    }
  }

  try {
    await ordersRepo.appendDropoff({ customerName, customerPhone, brandModel, sizeEU, photoUrl, originLabel });
  } catch (err) {
    return sendJson(ctx, 502, { error: err instanceof Error ? err.message : "Erro ao registrar na planilha." });
  }

  try {
    await syncService.sync();
  } catch {
    // A gravacao na planilha ja aconteceu (fonte da verdade); uma falha aqui so atrasa
    // o pedido aparecer no dashboard ate o proximo sync automatico.
  }

  sendJson(ctx, 200, { ok: true, photoUploaded: photoUrl !== null });
});

router.get("/api/health", (ctx) => {
  sendJson(ctx, 200, {
    ok: true,
    autoSyncIntervalMs: config.autoSyncIntervalMs,
    lastSyncedAt: syncService.store.getLastSyncedAt()?.toISOString() ?? null,
  });
});

// ---------- HTTP entrypoint ----------

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const match = router.match(req.method ?? "GET", url.pathname);
    if (match) {
      const ctx = {
        req,
        res,
        params: match.params,
        query: url.searchParams,
        cookies: parseCookies(req.headers.cookie),
      };
      await match.handler(ctx);
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      sendJson(res, 404, { error: "Rota não encontrada." });
      return;
    }

    if (!serveStatic(PUBLIC_DIR, req, res, url.pathname)) {
      // SPA fallback: qualquer rota nao-API nao encontrada cai no index.html.
      // Se ate o fallback falhar (ex: build estatico ausente), responde 404 em vez de
      // deixar a requisicao pendurada para sempre sem resposta.
      if (!serveStatic(PUBLIC_DIR, req, res, "/index.html") && !res.headersSent) {
        sendJson(res, 404, { error: "Arquivo estático não encontrado." });
      }
    }
  } catch (err) {
    if (!res.headersSent) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : "Erro interno." });
    }
  }
});

/**
 * Carga unica (bootstrap) da aba "Financeiro": so escreve se a aba estiver 100% vazia,
 * pra nunca duplicar linhas a cada deploy/restart do servidor. Ve expensesSeed.ts pro
 * detalhe de quais linhas e por que. Nao derruba o servidor se falhar (ex: sem acesso a
 * planilha no momento do boot) - so loga o erro e segue.
 */
async function seedExpensesIfEmpty(): Promise<void> {
  try {
    const current = await expensesRepo.readAll();
    if (current.length > 0) return;
    await sheets.appendRows(config.expensesSheetName, EXPENSES_SEED);
    console.log(`Aba "${config.expensesSheetName}" estava vazia - ${EXPENSES_SEED.length} despesas iniciais gravadas.`);
  } catch (err) {
    console.error("Falha ao popular carga inicial de despesas:", err instanceof Error ? err.message : err);
  }
}

/** Mesma logica de bootstrap do seedExpensesIfEmpty, pra aba "Borrachas". */
async function seedRubberIfEmpty(): Promise<void> {
  try {
    const current = await rubberRepo.readAll();
    if (current.length > 0) return;
    await sheets.appendRows(
      config.rubberSheetName,
      RUBBER_SEED.map((r) => [r.date, r.brand, r.supplier, r.value ?? "", r.percentRemaining ?? "", r.notes]),
    );
    console.log(`Aba "${config.rubberSheetName}" estava vazia - ${RUBBER_SEED.length} folhas iniciais gravadas.`);
  } catch (err) {
    console.error("Falha ao popular carga inicial de borrachas:", err instanceof Error ? err.message : err);
  }
}

// Sincroniza uma vez no boot e liga o UNICO timer de sincronizacao automatica.
void syncService.sync();
syncService.startAutoSync();

// Roda em sequencia (nao em paralelo) pra migrations.ts sempre ver o resultado do seed
// deste boot, nao um estado no meio da escrita. Cada uma delas ja se protege sozinha
// (seed so escreve se a aba estiver vazia; migration so escreve se achar o fingerprint
// antigo; ensureSheetExists so cria se a aba ainda nao existir), entao rodar de novo a
// cada restart/deploy e sempre seguro.
void (async () => {
  try {
    await sheets.ensureSheetExists(config.rubberUsageSheetName, RUBBER_USAGE_HEADER);
  } catch (err) {
    // "Uso de Borracha" so e' necessaria pro botao de folha no card do pedido — uma falha
    // aqui (ex: sem acesso a planilha no boot) nunca deve impedir o resto do app de subir.
    console.error('Falha ao garantir a aba "Uso de Borracha":', err instanceof Error ? err.message : err);
  }
  await seedExpensesIfEmpty();
  await seedRubberIfEmpty();
  await fixRubberSeedV1(sheets, rubberRepo);
  await addLegacyInvestmentIfMissing(sheets, expensesRepo);
})();

server.listen(config.port, () => {
  console.log(`Flash Ressolas rodando na porta ${config.port}`);
  console.log(`Sincronização automática a cada ${config.autoSyncIntervalMs / 1000}s`);
});
