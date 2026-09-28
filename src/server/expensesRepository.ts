import { SheetsClient } from "./google/sheetsClient.js";
import { config } from "./config.js";
import { parseBRLCurrency } from "../shared/currency.js";
import type { ExpenseClassification, ExpenseRow } from "../shared/metrics.js";

/** Aceita variações de acentuação/maiusculas ("variavel", "VARIÁVEL", " Fixo ", ...) —
 * nunca lanca excecao, celula fora do esperado (ou vazia) vira null (ver ExpenseRow.classification). */
function parseClassification(raw: unknown): ExpenseClassification | null {
  if (raw === null || raw === undefined) return null;
  const normalized = raw
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, ""); // remove acentos: "variável" -> "variavel" (NFD decompoe primeiro)
  if (normalized === "fixo") return "Fixo";
  if (normalized === "variavel") return "Variável";
  return null;
}

/**
 * Aba "Financeiro": Data | Tipo | Descrição | Valor | Classificação.
 *
 * readAll() e chamado por /api/expenses E por /api/profitability em toda carga do
 * dashboard (mais o refresh automatico do cliente a cada 60s) — sem cache, isso seria
 * 2 leituras ao vivo na planilha por carga, so pra aba Financeiro. Por isso cacheia o
 * resultado por CACHE_TTL_MS, igual em espirito ao SyncService dos pedidos (que ja
 * cacheia em memoria em vez de bater na planilha a cada request).
 *
 * O cache sozinho nao bastava: o dashboard chama /api/expenses e /api/profitability em
 * PARALELO (Promise.all no cliente), entao com o cache frio (expirado ou primeira carga)
 * as duas chamadas chegam antes de qualquer uma terminar de escrever this.cache — cada
 * uma via cache vazio e disparava a propria leitura ao vivo, voltando a ler a planilha 2x.
 * `pending` resolve isso: a 2a chamada que chega enquanto a 1a ainda esta em voo reaproveita
 * a MESMA promise em vez de iniciar outra leitura.
 */
const CACHE_TTL_MS = 60_000;

export class ExpensesRepository {
  private cache: { rows: ExpenseRow[]; fetchedAtMs: number } | null = null;
  private pending: Promise<ExpenseRow[]> | null = null;

  constructor(private readonly sheets: SheetsClient) {}

  async readAll(): Promise<ExpenseRow[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.fetchedAtMs < CACHE_TTL_MS) {
      return this.cache.rows;
    }
    if (this.pending) return this.pending;

    this.pending = (async () => {
      try {
        const rows = await this.sheets.getValues(`${config.expensesSheetName}!A2:E`);
        const out: ExpenseRow[] = [];
        for (const row of rows) {
          const [date, category, description, valueRaw, classificationRaw] = row;
          if (!date && !category && !description && !valueRaw) continue;
          const parsedValue = parseBRLCurrency(valueRaw);
          out.push({
            date: (date ?? "").toString().trim(),
            category: (category ?? "").toString().trim(),
            description: (description ?? "").toString().trim(),
            value: parsedValue.ok ? parsedValue.value : null,
            classification: parseClassification(classificationRaw),
          });
        }
        this.cache = { rows: out, fetchedAtMs: Date.now() };
        return out;
      } finally {
        this.pending = null;
      }
    })();
    return this.pending;
  }

  /**
   * Descarta o cache em memória sem reler nada — usado por quem escreve na planilha por
   * fora desta classe (ver migrations.ts), pra próxima leitura vir atualizada em vez de
   * servir o que foi lido ANTES da escrita.
   */
  invalidateCache(): void {
    this.cache = null;
  }

  /**
   * Adiciona uma despesa nova ao final da aba, sempre gravando a Classificação (coluna E)
   * explicitamente — mesmo pras categorias fixas, cuja classificação o CALLER (ver
   * server.ts) já deriva de VARIABLE_EXPENSE_CATEGORIES antes de chamar isto. Nunca deixa
   * essa coluna em branco num lançamento novo: só linhas ANTIGAS (de antes dessa coluna
   * existir) ficam sem ela, e caem no fallback por nome de categoria (ver computeProfitability).
   */
  async addExpense(input: {
    date: string;
    category: string;
    description: string;
    value: number;
    classification: ExpenseClassification;
  }): Promise<void> {
    await this.sheets.appendRow(config.expensesSheetName, [
      input.date,
      input.category,
      input.description,
      input.value,
      input.classification,
    ]);
    this.cache = null;
  }
}
