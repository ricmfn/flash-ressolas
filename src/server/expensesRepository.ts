import { SheetsClient } from "./google/sheetsClient.js";
import { config } from "./config.js";
import { parseBRLCurrency } from "../shared/currency.js";
import type { ExpenseRow } from "../shared/metrics.js";

/**
 * Aba "Financeiro": Data | Tipo | Descrição | Valor.
 *
 * readAll() e chamado por /api/expenses E por /api/profitability em toda carga do
 * dashboard (mais o refresh automatico do cliente a cada 60s) — sem cache, isso seria
 * 2 leituras ao vivo na planilha por carga, so pra aba Financeiro. Por isso cacheia o
 * resultado por CACHE_TTL_MS, igual em espirito ao SyncService dos pedidos (que ja
 * cacheia em memoria em vez de bater na planilha a cada request).
 */
const CACHE_TTL_MS = 60_000;

export class ExpensesRepository {
  private cache: { rows: ExpenseRow[]; fetchedAtMs: number } | null = null;

  constructor(private readonly sheets: SheetsClient) {}

  async readAll(): Promise<ExpenseRow[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.fetchedAtMs < CACHE_TTL_MS) {
      return this.cache.rows;
    }
    const rows = await this.sheets.getValues(`${config.expensesSheetName}!A2:D`);
    const out: ExpenseRow[] = [];
    for (const row of rows) {
      const [date, category, description, valueRaw] = row;
      if (!date && !category && !description && !valueRaw) continue;
      const parsedValue = parseBRLCurrency(valueRaw);
      out.push({
        date: (date ?? "").toString().trim(),
        category: (category ?? "").toString().trim(),
        description: (description ?? "").toString().trim(),
        value: parsedValue.ok ? parsedValue.value : null,
      });
    }
    this.cache = { rows: out, fetchedAtMs: now };
    return out;
  }

  /**
   * Descarta o cache em memória sem reler nada — usado por quem escreve na planilha por
   * fora desta classe (ver migrations.ts), pra próxima leitura vir atualizada em vez de
   * servir o que foi lido ANTES da escrita.
   */
  invalidateCache(): void {
    this.cache = null;
  }
}
