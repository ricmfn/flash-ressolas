import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { config, loadServiceAccount } from "./config.js";
import { Router, parseCookies, readJsonBody, sendJson } from "./http/router.js";
import { serveStatic } from "./staticFiles.js";
import { SheetsClient } from "./google/sheetsClient.js";
import { OrdersRepository } from "./ordersRepository.js";
import { ExpensesRepository } from "./expensesRepository.js";
import { SyncService } from "./syncService.js";
import { verifyPassword } from "./auth/password.js";
import { createSessionToken } from "./auth/session.js";
import { requireAuth, SESSION_COOKIE } from "./auth/middleware.js";
import { orderToJSON } from "./serialize.js";
import { uploadPublicPhoto } from "./google/driveClient.js";
import { computeDashboardMetrics, summarizeExpenses } from "../shared/metrics.js";
import { isValidStatus, isPending } from "../shared/status.js";
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
const syncService = new SyncService(ordersRepo, config.autoSyncIntervalMs);

const router = new Router();

// ---------- Auth ----------

router.post("/api/login", async (ctx) => {
  const body = await readJsonBody<{ username?: string; password?: string }>(ctx.req);
  if (!body.username || !body.password) {
    return sendJson(ctx.res, 400, { error: "Informe usuário e senha." });
  }
  // Compara usuario sem diferenciar maiusculas/minusculas: teclados de celular costumam
  // capitalizar a primeira letra de um campo de texto automaticamente (autocapitalize),
  // o que faria "ricardo" virar "Ricardo" sem o usuario perceber e derrubar um login
  // com a senha certa. A senha continua comparada exatamente (case-sensitive).
  const usernameMatches = body.username.trim().toLowerCase() === config.authUsername.trim().toLowerCase();
  if (!usernameMatches || !verifyPassword(body.password, config.authPasswordHash)) {
    return sendJson(ctx.res, 401, { error: "Usuário ou senha incorretos." });
  }
  const normalizedUsername = config.authUsername.trim();
  const token = createSessionToken(normalizedUsername, config.sessionSecret);
  ctx.res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${30 * 24 * 60 * 60}; SameSite=Lax`,
  );
  sendJson(ctx.res, 200, { ok: true, username: normalizedUsername });
});

router.post("/api/logout", (ctx) => {
  ctx.res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
  sendJson(ctx.res, 200, { ok: true });
});

router.get("/api/me", (ctx) => {
  const session = requireAuth(ctx);
  if (!session) return;
  sendJson(ctx.res, 200, { username: session.username });
});

// ---------- Orders ----------

router.get("/api/orders", (ctx) => {
  if (!requireAuth(ctx)) return;
  const sortedOrders = syncService.store.listSorted();
  const orders = sortedOrders.map(orderToJSON);
  sendJson(ctx.res, 200, {
    orders,
    pendingCount: sortedOrders.filter((o) => isPending(o.status)).length,
    lastSyncedAt: syncService.store.getLastSyncedAt()?.toISOString() ?? null,
    lastSyncError: syncService.store.getLastSyncError(),
  });
});

router.post("/api/orders/:row/status", async (ctx) => {
  if (!requireAuth(ctx)) return;
  const sheetRowIndex = Number(ctx.params.row);
  if (!Number.isInteger(sheetRowIndex) || sheetRowIndex < 2) {
    return sendJson(ctx.res, 400, { error: "Linha inválida." });
  }
  const body = await readJsonBody<{ status?: string; deliveryDateISO?: string | null }>(ctx.req);
  if (!body.status || !isValidStatus(body.status)) {
    return sendJson(ctx.res, 400, { error: "Status inválido." });
  }
  try {
    const updated = await ordersRepo.updateStatus(sheetRowIndex, body.status, body.deliveryDateISO ?? null);
    syncService.store.upsertOne(updated);
    sendJson(ctx.res, 200, { order: orderToJSON(updated) });
  } catch (err) {
    sendJson(ctx.res, 500, { error: err instanceof Error ? err.message : "Erro ao salvar status." });
  }
});

router.post("/api/orders/:row/price", async (ctx) => {
  if (!requireAuth(ctx)) return;
  const sheetRowIndex = Number(ctx.params.row);
  if (!Number.isInteger(sheetRowIndex) || sheetRowIndex < 2) {
    return sendJson(ctx.res, 400, { error: "Linha inválida." });
  }
  const body = await readJsonBody<{ rawValue?: string }>(ctx.req);
  if (body.rawValue === undefined) {
    return sendJson(ctx.res, 400, { error: "Informe o valor do preço." });
  }
  try {
    const updated = await ordersRepo.updatePrice(sheetRowIndex, body.rawValue);
    syncService.store.upsertOne(updated);
    sendJson(ctx.res, 200, { order: orderToJSON(updated) });
  } catch (err) {
    // Nunca grava silenciosamente: erro de validação (ex: "?", data, texto) volta pro app.
    sendJson(ctx.res, 422, { error: err instanceof Error ? err.message : "Preço inválido." });
  }
});

// ---------- Sync ----------

router.post("/api/sync", async (ctx) => {
  if (!requireAuth(ctx)) return;
  const result = await syncService.sync();
  sendJson(ctx.res, result.error ? 200 : 200, {
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
  sendJson(ctx.res, 200, metrics);
});

router.get("/api/expenses", async (ctx) => {
  if (!requireAuth(ctx)) return;
  try {
    const rows = await expensesRepo.readAll();
    sendJson(ctx.res, 200, summarizeExpenses(rows));
  } catch (err) {
    sendJson(ctx.res, 502, { error: err instanceof Error ? err.message : "Erro ao ler despesas." });
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
    return sendJson(ctx.res, 400, { error: "Preencha nome, WhatsApp, marca/modelo e numeração." });
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
    return sendJson(ctx.res, 502, { error: err instanceof Error ? err.message : "Erro ao registrar na planilha." });
  }

  try {
    await syncService.sync();
  } catch {
    // A gravacao na planilha ja aconteceu (fonte da verdade); uma falha aqui so atrasa
    // o pedido aparecer no dashboard ate o proximo sync automatico.
  }

  sendJson(ctx.res, 200, { ok: true, photoUploaded: photoUrl !== null });
});

router.get("/api/health", (ctx) => {
  sendJson(ctx.res, 200, {
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

// Sincroniza uma vez no boot e liga o UNICO timer de sincronizacao automatica.
void syncService.sync();
syncService.startAutoSync();

server.listen(config.port, () => {
  console.log(`Flash Ressolas rodando na porta ${config.port}`);
  console.log(`Sincronização automática a cada ${config.autoSyncIntervalMs / 1000}s`);
});
