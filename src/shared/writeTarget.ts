import { parseOrderRow } from "./rowParser.js";

/**
 * Colunas nominais do cabecalho (0-indexadas), usadas apenas como FALLBACK quando uma
 * linha ainda nao tem status/preco/data nenhum (ex: pedido novo, ainda sem triagem).
 * Nunca usadas para sobrescrever uma celula que ja existe em outra posicao — nesse caso
 * a posicao real (achada pelo parser lendo a linha) sempre vence.
 */
export const NOMINAL_STATUS_COL = 9; // J "Status do Pedido"
export const NOMINAL_PRICE_COL = 10; // K "Preço"
export const NOMINAL_DATE_COL = 11; // L "Data prevista pra entrega"

function isEmpty(row: readonly string[], col: number): boolean {
  return (row[col] ?? "").toString().trim() === "";
}

/** Primeira coluna vazia a partir de `from` (inclusive), nunca abaixo do prefixo fixo (7). */
function firstEmptyFrom(row: readonly string[], from: number): number {
  let col = Math.max(from, 7);
  while (!isEmpty(row, col) && col < from + 10) col++;
  return col;
}

export interface WriteTargets {
  statusCol: number;
  priceCol: number;
  dateCol: number;
}

/**
 * Recebe a linha REAL e atual (recem-lida da planilha, nunca do cache) e devolve em qual
 * coluna cada campo deve ser escrito — reusando a posicao existente sempre que ela ja
 * tiver um valor, e so caindo para a coluna nominal do cabecalho quando a celula
 * correspondente ainda estiver vazia.
 */
export function resolveWriteTargets(freshRow: readonly string[], sheetRowIndex: number): WriteTargets {
  const parsed = parseOrderRow(freshRow, sheetRowIndex);

  const statusCol =
    parsed.statusCellIndex ??
    (isEmpty(freshRow, NOMINAL_STATUS_COL) ? NOMINAL_STATUS_COL : firstEmptyFrom(freshRow, 7));

  const priceCol =
    parsed.priceCellIndex ??
    (isEmpty(freshRow, NOMINAL_PRICE_COL) ? NOMINAL_PRICE_COL : firstEmptyFrom(freshRow, statusCol + 1));

  // Preferir uma celula que JA contenha uma data (mesmo que o parser nao tenha
  // classificado como "data de entrega" por algum motivo). Cai para o nominal se vazio.
  const dateCol =
    parsed.deliveryDateCellIndex ??
    (isEmpty(freshRow, NOMINAL_DATE_COL) ? NOMINAL_DATE_COL : firstEmptyFrom(freshRow, priceCol + 1));

  return { statusCol, priceCol, dateCol };
}

export function columnIndexToA1(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}
