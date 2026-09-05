import type { OrderStatus } from "./status.js";

export interface Order {
  /** Numero da linha REAL na planilha (1-indexado, igual ao Google Sheets). Chave de sincronizacao. */
  sheetRowIndex: number;
  /** Coluna (0-indexada, absoluta na linha) onde o status foi encontrado. null = pedido sem status ainda. */
  statusCellIndex: number | null;
  /** ID do formulario (coluna A), so para exibicao — NUNCA usar como chave. Pode faltar (linhas apos a 74). */
  formId: string | null;
  orderedAt: Date | null;
  orderedAtRaw: string;
  customerName: string;
  customerPhone: string;
  shoeModel: string;
  shoeSize: string;
  photoUrl: string;
  detail: string;
  status: OrderStatus;
  /** true quando a linha nao tinha nenhum status reconhecido na planilha (tratada como RECEBIDO so na app). */
  statusInferred: boolean;
  /** Preco final (unica coluna monetaria real da planilha — nao existe "orcamento" separado). */
  price: number | null;
  /** Coluna onde o preco foi encontrado, para saber onde regravar. null = nao encontrado/nao preenchido. */
  priceCellIndex: number | null;
  deliveryDate: Date | null;
  deliveryDateRaw: string;
  /** Coluna onde a data de entrega foi encontrada. null = nao encontrada. */
  deliveryDateCellIndex: number | null;
  internalNotes: string;
}

export interface OrderUpdateStatusInput {
  sheetRowIndex: number;
  newStatus: OrderStatus;
  /** Data de entrega fornecida manualmente pelo usuario (opcional). Se ausente e status contiver
   * ENTREGUE, o backend preenche a data atual — mas so se a celula de data estiver vazia. */
  deliveryDateISO?: string | null;
}

export interface OrderUpdatePriceInput {
  sheetRowIndex: number;
  field: "price";
  rawValue: string;
}
