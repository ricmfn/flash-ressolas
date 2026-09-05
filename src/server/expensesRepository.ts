import { SheetsClient } from "./google/sheetsClient.js";
import { config } from "./config.js";
import { parseBRLCurrency } from "../shared/currency.js";
import type { ExpenseRow } from "../shared/metrics.js";

/** Aba "Financeiro": Data | Tipo | Descrição | Valor. Hoje vazia — retorna [] sem inventar nada. */
export class ExpensesRepository {
  constructor(private readonly sheets: SheetsClient) {}

  async readAll(): Promise<ExpenseRow[]> {
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
    return out;
  }
}
