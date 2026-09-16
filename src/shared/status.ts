/**
 * Status validos do pedido, na ordem oficial do fluxo operacional.
 * NUNCA adicionar/alterar sem atualizar a planilha e os testes.
 */
export const VALID_STATUSES = [
  "AGUARDANDO SAPATILHA",
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

/** Pedido cujo formulario ja foi preenchido mas o cliente ainda nao trouxe a sapatilha
 * fisicamente. Fica "pausado": nao conta como pendente de conserto e nao entra no calculo
 * de tempo medio de entrega ate que o status mude para RECEBIDO de fato. */
export function isAwaitingDropoff(status: OrderStatus | string): boolean {
  return status === "AGUARDANDO SAPATILHA";
}

/**
 * Prioridade operacional dentro do grupo "nao entregues" (menor numero = mais urgente).
 * RECEBIDO e EM_CONSERTO andam juntos no topo (sao a fila real de conserto: o que ja
 * chegou e ainda precisa ser trabalhado), seguidos por PRONTO (so falta a retirada).
 * CANCELADO e AGUARDANDO SAPATILHA ficam por ultimo pois nao exigem acao de conserto —
 * AGUARDANDO SAPATILHA depois de CANCELADO, pois nem chegou fisicamente ainda.
 */
const PENDING_PRIORITY: Record<string, number> = {
  RECEBIDO: 0,
  EM_CONSERTO: 0,
  PRONTO: 1,
  CANCELADO: 2,
  "AGUARDANDO SAPATILHA": 3,
};

export function pendingPriority(status: OrderStatus | string): number {
  return PENDING_PRIORITY[status] ?? 0;
}

/**
 * Fila FIFO real de trabalho: dentro de RECEBIDO/EM_CONSERTO/PRONTO, o pedido mais
 * ANTIGO aparece primeiro (e o proximo que precisa ser resolvido/entregue). CANCELADO e
 * AGUARDANDO SAPATILHA nao fazem parte do fluxo ativo de conserto, entao continuam
 * ordenados com o mais recente primeiro (como o app sempre mostrou pra esses casos).
 */
const OLDEST_FIRST_STATUSES = new Set<string>(["RECEBIDO", "EM_CONSERTO", "PRONTO"]);

export function pendingSortsOldestFirst(status: OrderStatus | string): boolean {
  return OLDEST_FIRST_STATUSES.has(status);
}

/**
 * Grupo de cor do card na tela de pedidos (fundo clarinho e baixa opacidade):
 * amarelo = recebido/em conserto (precisa de trabalho), verde = pronto (aguardando
 * retirada), azul = entregue (paga ou nao paga). Cancelado e aguardando sapatilha nao
 * tem cor especial — nao fazem parte do fluxo ativo de conserto/entrega.
 */
export type OrderCardColorGroup = "recebido" | "pronto" | "entregue" | null;

export function orderCardColorGroup(status: OrderStatus | string): OrderCardColorGroup {
  if (status === "RECEBIDO" || status === "EM_CONSERTO") return "recebido";
  if (status === "PRONTO") return "pronto";
  if (isDeliveredStatus(status)) return "entregue";
  return null;
}
