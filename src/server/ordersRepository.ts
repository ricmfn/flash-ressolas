import { SheetsClient } from "./google/sheetsClient.js";
import { config } from "./config.js";
import { parseOrderRow } from "../shared/rowParser.js";
import { resolveWriteTargets, columnIndexToA1 } from "../shared/writeTarget.js";
import { parseBRLCurrency } from "../shared/currency.js";
import { toISODateString } from "../shared/dates.js";
import { VALID_STATUSES, isDeliveredStatus, type OrderStatus } from "../shared/status.js";
import type { Order } from "../shared/types.js";

const ORDERS_RANGE_ALL = `${config.ordersSheetName}!A2:M`;

function rowRange(sheetRowIndex: number): string {
  return `${config.ordersSheetName}!A${sheetRowIndex}:M${sheetRowIndex}`;
}

export class OrdersRepository {
  constructor(private readonly sheets: SheetsClient) {}

  /** Le a planilha inteira (a partir da linha 2) e devolve todos os pedidos parseados. */
  async readAll(): Promise<Order[]> {
    const rows = await this.sheets.getValues(ORDERS_RANGE_ALL);
    const orders: Order[] = [];
    rows.forEach((row, i) => {
      const sheetRowIndex = i + 2; // linha 1 = cabecalho
      // Linha completamente vazia (fim real dos dados) — nao vira um "pedido fantasma".
      if (row.every((c) => (c ?? "").toString().trim() === "")) return;
      orders.push(parseOrderRow(row, sheetRowIndex));
    });
    return orders;
  }

  /** Relê APENAS a linha indicada, direto da planilha — nunca do cache — antes de escrever. */
  private async readFreshRow(sheetRowIndex: number): Promise<string[]> {
    const rows = await this.sheets.getValues(rowRange(sheetRowIndex));
    return rows[0] ?? [];
  }

  private async logEdit(orderFormId: string | null, sheetRowIndex: number, column: string, newValue: string) {
    try {
      await this.sheets.appendRow(config.editsSheetName, [
        orderFormId ?? `linha-${sheetRowIndex}`,
        sheetRowIndex,
        column,
        newValue,
        new Date().toISOString(),
        "sim",
      ]);
    } catch {
      // Log de auditoria é best-effort: uma falha aqui nunca deve impedir a gravação real.
    }
  }

  async updateStatus(
    sheetRowIndex: number,
    newStatus: OrderStatus,
    deliveryDateISO?: string | null,
  ): Promise<Order> {
    if (!VALID_STATUSES.includes(newStatus)) {
      throw new Error(`Status inválido: "${newStatus}".`);
    }

    const freshRow = await this.readFreshRow(sheetRowIndex);
    if (freshRow.length === 0) {
      throw new Error(`Linha ${sheetRowIndex} não encontrada na planilha (pode ter sido alterada).`);
    }
    const targets = resolveWriteTargets(freshRow, sheetRowIndex);

    await this.sheets.updateCell(config.ordersSheetName, `${columnIndexToA1(targets.statusCol)}${sheetRowIndex}`, newStatus, false);

    const parsedFresh = parseOrderRow(freshRow, sheetRowIndex);
    let dateToWrite: string | null = null;
    if (deliveryDateISO) {
      // Usuario forneceu a data explicitamente: respeita, mesmo que ja houvesse uma.
      dateToWrite = deliveryDateISO;
    } else if (isDeliveredStatus(newStatus) && !parsedFresh.deliveryDate) {
      // So preenche automaticamente se o status é de entrega E a célula está vazia.
      dateToWrite = toISODateString(new Date());
    }

    if (dateToWrite) {
      await this.sheets.updateCell(
        config.ordersSheetName,
        `${columnIndexToA1(targets.dateCol)}${sheetRowIndex}`,
        dateToWrite,
        true, // USER_ENTERED para o Sheets reconhecer como data
      );
    }

    await this.logEdit(parsedFresh.formId, sheetRowIndex, columnIndexToA1(targets.statusCol), newStatus);

    const rowAfter = await this.readFreshRow(sheetRowIndex);
    return parseOrderRow(rowAfter, sheetRowIndex);
  }

  async updatePrice(sheetRowIndex: number, rawValue: string): Promise<Order> {
    const parsed = parseBRLCurrency(rawValue);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    if (parsed.value === null) {
      throw new Error("Preço não pode ser salvo vazio.");
    }

    const freshRow = await this.readFreshRow(sheetRowIndex);
    if (freshRow.length === 0) {
      throw new Error(`Linha ${sheetRowIndex} não encontrada na planilha (pode ter sido alterada).`);
    }
    const targets = resolveWriteTargets(freshRow, sheetRowIndex);

    await this.sheets.updateCell(
      config.ordersSheetName,
      `${columnIndexToA1(targets.priceCol)}${sheetRowIndex}`,
      parsed.value,
      false,
    );

    const parsedFresh = parseOrderRow(freshRow, sheetRowIndex);
    await this.logEdit(parsedFresh.formId, sheetRowIndex, columnIndexToA1(targets.priceCol), String(parsed.value));

    const rowAfter = await this.readFreshRow(sheetRowIndex);
    return parseOrderRow(rowAfter, sheetRowIndex);
  }
}
