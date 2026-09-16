import { isPending, pendingPriority, pendingSortsOldestFirst } from "./status.js";
import type { Order } from "./types.js";

/**
 * Cache em memoria dos pedidos, indexado por sheetRowIndex (nunca por ID auto-incremental
 * da planilha, que nem sempre existe). Reprocessar a mesma leitura da planilha varias
 * vezes (sync repetida) sempre resulta no mesmo conjunto de linhas — nunca duplica.
 */
export class OrderStore {
  private byRow = new Map<number, Order>();
  private lastSyncedAt: Date | null = null;
  private lastSyncError: string | null = null;

  /** Substitui o conteudo pelo resultado de uma leitura completa da planilha. */
  replaceAll(orders: Order[]): void {
    const next = new Map<number, Order>();
    for (const order of orders) {
      next.set(order.sheetRowIndex, order); // Map: mesma chave nunca duplica.
    }
    this.byRow = next;
    this.lastSyncedAt = new Date();
    this.lastSyncError = null;
  }

  markSyncError(message: string): void {
    this.lastSyncError = message;
  }

  upsertOne(order: Order): void {
    this.byRow.set(order.sheetRowIndex, order);
  }

  get(sheetRowIndex: number): Order | undefined {
    return this.byRow.get(sheetRowIndex);
  }

  size(): number {
    return this.byRow.size;
  }

  getLastSyncedAt(): Date | null {
    return this.lastSyncedAt;
  }

  getLastSyncError(): string | null {
    return this.lastSyncError;
  }

  /**
   * Lista ordenada pela prioridade real de trabalho: pedidos NAO entregues antes dos
   * entregues; dentro do grupo nao entregue, por prioridade operacional (RECEBIDO +
   * EM_CONSERTO primeiro, depois PRONTO, depois CANCELADO/AGUARDANDO SAPATILHA).
   * Dentro de RECEBIDO/EM_CONSERTO/PRONTO a ordem e FIFO (pedido mais antigo primeiro —
   * e o proximo que precisa ser resolvido). Nos demais grupos (cancelado/aguardando
   * sapatilha e entregues) o pedido mais recente aparece primeiro, como sempre foi.
   */
  listSorted(): Order[] {
    const all = Array.from(this.byRow.values());
    return all.sort((a, b) => {
      const aPending = isPending(a.status);
      const bPending = isPending(b.status);
      if (aPending !== bPending) return aPending ? -1 : 1;

      if (aPending && bPending) {
        const prio = pendingPriority(a.status) - pendingPriority(b.status);
        if (prio !== 0) return prio;

        if (pendingSortsOldestFirst(a.status)) {
          // Fila FIFO: sem data conhecida vai pro final da fila (nunca "fura fila" por acaso).
          const aFifo = a.orderedAt?.getTime() ?? Number.POSITIVE_INFINITY;
          const bFifo = b.orderedAt?.getTime() ?? Number.POSITIVE_INFINITY;
          return aFifo - bFifo;
        }
      }

      // Sem data conhecida vai para o final do grupo (nunca "furando fila" por acaso).
      const aTime = a.orderedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      const bTime = b.orderedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      return bTime - aTime;
    });
  }
}
