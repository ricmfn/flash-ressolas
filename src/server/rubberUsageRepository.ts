import { SheetsClient } from "./google/sheetsClient.js";
import { config } from "./config.js";
import type { RubberUsageEntry } from "../shared/rubberUsage.js";

/** Cabecalho escrito automaticamente so quando a aba e' criada pela primeira vez (ver
 * SheetsClient.ensureSheetExists, chamado no boot do server.ts). */
export const RUBBER_USAGE_HEADER = [
  "Data/Hora",
  "ID do Pedido",
  "Linha do Pedido",
  "Linha da Folha",
  "Folha (rótulo)",
];

function parseIntOrNull(raw: unknown): number | null {
  const s = (raw ?? "").toString().trim();
  if (s === "") return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Aba "Uso de Borracha": Data/Hora | ID do Pedido | Linha do Pedido | Linha da Folha |
 * Folha (rótulo). Log append-only (ver rubberUsage.ts) — assign() sempre adiciona uma
 * linha nova, nunca escreve por cima de uma existente.
 *
 * Mesmo cache com TTL + dedup de leitura em voo do ExpensesRepository/RubberRepository
 * (ver o comentario detalhado la): evita reler a planilha 2x quando /api/rubber-usage e
 * outro endpoint (ou duas abas/dispositivos com auto-refresh sincronizado) chegam ao
 * mesmo tempo com o cache frio.
 */
const CACHE_TTL_MS = 60_000;

export class RubberUsageRepository {
  private cache: { entries: RubberUsageEntry[]; fetchedAtMs: number } | null = null;
  private pending: Promise<RubberUsageEntry[]> | null = null;

  constructor(private readonly sheets: SheetsClient) {}

  async readAll(): Promise<RubberUsageEntry[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.fetchedAtMs < CACHE_TTL_MS) {
      return this.cache.entries;
    }
    if (this.pending) return this.pending;

    this.pending = (async () => {
      try {
        const rows = await this.sheets.getValues(`${config.rubberUsageSheetName}!A2:E`);
        const out: RubberUsageEntry[] = [];
        rows.forEach((row, i) => {
          const [timestampISO, orderFormIdRaw, orderRowRaw, rubberRowRaw, rubberLabelRaw] = row;
          const orderSheetRowIndex = parseIntOrNull(orderRowRaw);
          const isBlankRow =
            !timestampISO && !orderFormIdRaw && orderSheetRowIndex === null && !rubberRowRaw && !rubberLabelRaw;
          if (isBlankRow) return;
          // Linha sem "linha do pedido" valida nunca deveria acontecer (so o app escreve
          // aqui), mas se acontecer (edicao manual, corrupcao) so ignora — nunca quebra a
          // leitura inteira por causa de uma linha ruim.
          if (orderSheetRowIndex === null) return;
          out.push({
            logRowIndex: i + 2,
            timestampISO: (timestampISO ?? "").toString().trim(),
            orderFormId: (orderFormIdRaw ?? "").toString().trim() || null,
            orderSheetRowIndex,
            rubberSheetRowIndex: parseIntOrNull(rubberRowRaw),
            rubberLabel: (rubberLabelRaw ?? "").toString().trim(),
          });
        });
        this.cache = { entries: out, fetchedAtMs: Date.now() };
        return out;
      } finally {
        this.pending = null;
      }
    })();
    return this.pending;
  }

  /**
   * Registra qual folha foi usada num pedido (ou desmarca, passando rubberSheetRowIndex
   * null) — sempre um APPEND novo (ver rubberUsage.ts: so a entrada mais recente de cada
   * pedido conta na leitura).
   */
  async assign(
    orderSheetRowIndex: number,
    orderFormId: string | null,
    rubberSheetRowIndex: number | null,
    rubberLabel: string,
  ): Promise<void> {
    await this.sheets.appendRow(config.rubberUsageSheetName, [
      new Date().toISOString(),
      orderFormId ?? "",
      orderSheetRowIndex,
      rubberSheetRowIndex ?? "",
      rubberLabel,
    ]);
    this.cache = null;
  }

  invalidateCache(): void {
    this.cache = null;
  }
}
