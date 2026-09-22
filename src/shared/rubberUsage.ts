/**
 * Um registro de "qual folha de borracha foi usada nesse pedido" — aba "Uso de Borracha".
 * Append-only, igual ao log de auditoria "Edições": cada linha e' um EVENTO de atribuicao,
 * nunca uma linha que se sobrescreve. Pra saber a atribuicao ATUAL de um pedido, pega a
 * ULTIMA linha daquele pedido (ver currentRubberAssignments) — assim trocar de ideia sobre
 * qual folha foi usada e' so registrar um novo evento, sem precisar localizar e escrever
 * por cima de uma linha especifica (mesmo cuidado de "nunca escrever as cegas" do resto
 * do app).
 */
export interface RubberUsageEntry {
  logRowIndex: number;
  timestampISO: string;
  orderFormId: string | null;
  orderSheetRowIndex: number;
  /** null = pedido explicitamente desmarcado ("nenhuma folha selecionada"). */
  rubberSheetRowIndex: number | null;
  /** Marca/fornecedor da folha no momento da atribuicao — so um retrato pro historico; a
   * tela sempre prioriza o dado AO VIVO da aba Borrachas quando disponivel. */
  rubberLabel: string;
}

/**
 * Pra cada pedido, so a atribuicao MAIS RECENTE conta. Como o log e' append-only e lido em
 * ordem de linha (= ordem no tempo), a ultima ocorrencia de cada orderSheetRowIndex no
 * array sempre vence.
 */
export function currentRubberAssignments(entries: readonly RubberUsageEntry[]): Map<number, RubberUsageEntry> {
  const byOrder = new Map<number, RubberUsageEntry>();
  for (const e of entries) {
    byOrder.set(e.orderSheetRowIndex, e);
  }
  return byOrder;
}

/**
 * Quantos pedidos (pares) estao ATUALMENTE atribuidos a cada folha de borracha — a base
 * pra "quantas sapatilhas em média cabem por folha", calculada com o tempo à medida que
 * mais folhas forem sendo zeradas.
 */
export function countPairsPerRubberSheet(entries: readonly RubberUsageEntry[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const entry of currentRubberAssignments(entries).values()) {
    if (entry.rubberSheetRowIndex === null) continue;
    counts.set(entry.rubberSheetRowIndex, (counts.get(entry.rubberSheetRowIndex) ?? 0) + 1);
  }
  return counts;
}
