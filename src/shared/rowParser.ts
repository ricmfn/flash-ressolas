import { parseBRLCurrency } from "./currency.js";
import { parseFlexibleDate } from "./dates.js";
import { matchValidStatus } from "./status.js";
import type { Order } from "./types.js";

/**
 * Indices FIXOS e confiaveis (A..G) — nunca mudam de posicao nos dados reais:
 *   0 ID | 1 Carimbo de data/hora | 2 Nome | 3 Telefone | 4 Modelo | 5 Tamanho | 6 Foto
 * A partir do indice 7 (H em diante) a posicao de status/preco/data VARIA de linha para
 * linha (confirmado na planilha real: status aparece em H para umas linhas e em I para
 * outras). Por isso a partir daqui a leitura busca pelo CONTEUDO, nunca por posicao fixa.
 */
const FIXED_PREFIX_LEN = 7;

function cell(row: readonly string[], index: number): string {
  return (row[index] ?? "").toString().trim();
}

/**
 * Converte uma linha crua da planilha (array de strings, na ordem das colunas) em um
 * Order tipado. `sheetRowIndex` deve ser o numero real da linha na planilha (1-indexado,
 * cabecalho = linha 1), calculado por quem le a planilha — nunca inferido daqui.
 */
export function parseOrderRow(row: readonly string[], sheetRowIndex: number): Order {
  const formIdRaw = cell(row, 0);
  const orderedAtRaw = cell(row, 1);
  const customerName = cell(row, 2);
  const customerPhone = cell(row, 3);
  const shoeModel = cell(row, 4);
  const shoeSize = cell(row, 5);
  const photoUrl = cell(row, 6);

  const tail = row.slice(FIXED_PREFIX_LEN);

  let statusTailIdx = -1;
  for (let i = 0; i < tail.length; i++) {
    if (matchValidStatus(tail[i]) !== null) {
      statusTailIdx = i;
      break;
    }
  }

  let status: Order["status"];
  let statusCellIndex: number | null;
  let statusInferred: boolean;
  let detailParts: string[];
  let searchZoneStart: number; // indice (em `tail`) a partir do qual procurar preco/data

  if (statusTailIdx === -1) {
    // Nenhum status reconhecido: RECEBIDO so na aplicacao, preserva todo texto como detalhe.
    status = "RECEBIDO";
    statusCellIndex = null;
    statusInferred = true;
    detailParts = tail.map((v) => (v ?? "").toString().trim()).filter((v) => v !== "");
    searchZoneStart = 0;
  } else {
    status = matchValidStatus(tail[statusTailIdx])!;
    statusCellIndex = FIXED_PREFIX_LEN + statusTailIdx;
    statusInferred = false;
    detailParts = tail
      .slice(0, statusTailIdx)
      .map((v) => (v ?? "").toString().trim())
      .filter((v) => v !== "");
    searchZoneStart = statusTailIdx + 1;
  }

  const searchZone = tail.slice(searchZoneStart);
  const usedInSearchZone = new Set<number>();

  let price: number | null = null;
  let priceCellIndex: number | null = null;
  for (let i = 0; i < searchZone.length; i++) {
    const raw = searchZone[i];
    if ((raw ?? "").toString().trim() === "") continue;
    const parsed = parseBRLCurrency(raw);
    if (parsed.ok && parsed.value !== null) {
      price = parsed.value;
      priceCellIndex = FIXED_PREFIX_LEN + searchZoneStart + i;
      usedInSearchZone.add(i);
      break;
    }
  }

  let deliveryDate: Date | null = null;
  let deliveryDateRaw = "";
  let deliveryDateCellIndex: number | null = null;
  for (let i = 0; i < searchZone.length; i++) {
    if (usedInSearchZone.has(i)) continue;
    const raw = searchZone[i];
    if ((raw ?? "").toString().trim() === "") continue;
    const parsed = parseFlexibleDate(raw);
    if (parsed !== null) {
      deliveryDate = parsed;
      deliveryDateRaw = (raw ?? "").toString().trim();
      deliveryDateCellIndex = FIXED_PREFIX_LEN + searchZoneStart + i;
      usedInSearchZone.add(i);
      break;
    }
  }

  const leftoverNotes: string[] = [];
  for (let i = 0; i < searchZone.length; i++) {
    if (usedInSearchZone.has(i)) continue;
    const raw = (searchZone[i] ?? "").toString().trim();
    if (raw !== "") leftoverNotes.push(raw);
  }

  return {
    sheetRowIndex,
    statusCellIndex,
    formId: formIdRaw === "" ? null : formIdRaw,
    orderedAt: parseFlexibleDate(orderedAtRaw),
    orderedAtRaw,
    customerName,
    customerPhone,
    shoeModel,
    shoeSize,
    photoUrl,
    detail: detailParts.join(" | "),
    status,
    statusInferred,
    price,
    priceCellIndex,
    deliveryDate,
    deliveryDateRaw,
    deliveryDateCellIndex,
    internalNotes: leftoverNotes.join(" | "),
  };
}
