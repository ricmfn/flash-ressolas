import { isPending, pendingPriority } from "./status.js";
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
   * Lista ordenada: pedidos NAO entregues antes dos entregues; dentro de cada grupo,
   * por prioridade operacional e depois por data do pedido (mais recente primeiro,
   * para que quem acabou de chegar sempre apareca no topo da tela).
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
      }

      // Sem data conhecida vai para o final do grupo (nunca "furando fila" por acaso).
      const aTime = a.orderedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      const bTime = b.orderedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      return bTime - aTime;
    });
  }
}
