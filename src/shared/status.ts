/**
 * Status validos do pedido, na ordem oficial do fluxo operacional.
 * NUNCA adicionar/alterar sem atualizar a planilha e os testes.
 */
export const VALID_STATUSES = [
  "RECEBIDO",
  "EM_CONSERTO",
  "PRONTO",
  "ENTREGUE - PAGA",
  "ENTREGUE - NÃO PAGA",
  "CANCELADO",
] as const;

export type OrderStatus = (typeof VALID_STATUSES)[number];

const VALID_STATUS_SET = new Set<string>(VALID_STATUSES);

/** Normaliza espacos/caixa para comparar com seguranca, sem mudar o valor armazenado. */
function normalizeForCompare(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase();
}

const NORMALIZED_TO_CANONICAL = new Map<string, OrderStatus>(
  VALID_STATUSES.map((s) => [normalizeForCompare(s), s]),
);

/**
 * Verifica se uma celula contem exatamente um status valido (ignorando espacos extras
 * nas bordas e variacao de maiusculas/minusculas), retornando a forma canonica.
 * Retorna null se a celula nao for um status reconhecido.
 */
export function matchValidStatus(cellValue: unknown): OrderStatus | null {
  if (typeof cellValue !== "string") return null;
  const normalized = normalizeForCompare(cellValue);
  if (normalized === "") return null;
  return NORMALIZED_TO_CANONICAL.get(normalized) ?? null;
}

export function isValidStatus(value: string): value is OrderStatus {
  return VALID_STATUS_SET.has(value);
}

export function isDeliveredStatus(status: OrderStatus | string): boolean {
  return status.startsWith("ENTREGUE");
}

/** Pedidos "nao entregues" = tudo que nao comeca com ENTREGUE. CANCELADO tambem conta como nao entregue
 * para fins de ordenacao (mas fica no fim da lista de nao entregues por prioridade operacional). */
export function isPending(status: OrderStatus | string): boolean {
  return !isDeliveredStatus(status);
}

/**
 * Prioridade operacional dentro do grupo "nao entregues" (menor numero = mais urgente).
 * PRONTO (esperando retirada) e EM_CONSERTO tem prioridade sobre RECEBIDO (ainda na fila de triagem).
 * CANCELADO fica por ultimo pois nao exige acao.
 */
const PENDING_PRIORITY: Record<string, number> = {
  PRONTO: 0,
  EM_CONSERTO: 1,
  RECEBIDO: 2,
  CANCELADO: 3,
};

export function pendingPriority(status: OrderStatus | string): number {
  return PENDING_PRIORITY[status] ?? 2;
}
