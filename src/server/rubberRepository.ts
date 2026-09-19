import { SheetsClient } from "./google/sheetsClient.js";
import { config } from "./config.js";
import { parseBRLCurrency } from "../shared/currency.js";
import type { RubberSheet } from "../shared/rubber.js";

/** Aceita "60", "60%", "60,5", "60.5" — sempre limitado a [0, 100]. Nunca lanca excecao. */
function parsePercent(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const str = raw.toString().trim();
  if (str === "") return null;
  const cleaned = str.replace("%", "").replace(",", ".").trim();
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}

/** Aba "Borrachas": Data | Marca | Fornecedor | Valor | % restante | Observações. */
export class RubberRepository {
  constructor(private readonly sheets: SheetsClient) {}

  async readAll(): Promise<RubberSheet[]> {
    const rows = await this.sheets.getValues(`${config.rubberSheetName}!A2:F`);
    const out: RubberSheet[] = [];
    rows.forEach((row, i) => {
      const [date, brand, supplier, valueRaw, percentRaw, notes] = row;
      if (!date && !brand && !supplier && !valueRaw && !percentRaw && !notes) return;
      const parsedValue = parseBRLCurrency(valueRaw);
      out.push({
        sheetRowIndex: i + 2,
        date: (date ?? "").toString().trim(),
        brand: (brand ?? "").toString().trim(),
        supplier: (supplier ?? "").toString().trim(),
        value: parsedValue.ok ? parsedValue.value : null,
        percentRemaining: parsePercent(percentRaw),
        notes: (notes ?? "").toString().trim(),
      });
    });
    return out;
  }

  /**
   * Atualiza so a coluna "% restante" de uma folha (linha real na planilha, ver
   * sheetRowIndex). Nunca escreve as outras colunas — mesmo cuidado do updateCell do
   * preco dos pedidos: uma unica celula por vez, nunca sobrescreve vizinhas.
   */
  async updatePercent(sheetRowIndex: number, percent: number): Promise<void> {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new Error("Percentual precisa estar entre 0 e 100.");
    }
    await this.sheets.updateCell(config.rubberSheetName, `E${sheetRowIndex}`, percent, true);
  }

  /** Adiciona uma folha nova ao final da aba. */
  async addSheet(input: {
    date: string;
    brand: string;
    supplier: string;
    value: number | null;
    percentRemaining: number | null;
    notes: string;
  }): Promise<void> {
    await this.sheets.appendRow(config.rubberSheetName, [
      input.date,
      input.brand,
      input.supplier,
      input.value ?? "",
      input.percentRemaining ?? "",
      input.notes,
    ]);
  }
}
