import { OrderStore } from "../shared/orderStore.js";
import type { OrdersRepository } from "./ordersRepository.js";

/**
 * Orquestra a sincronizacao com a planilha: mantem o cache em memoria (OrderStore),
 * garante que so exista UM timer automatico, e que nunca haja duas sincronizacoes
 * concorrentes (clique duplo / timer + clique manual ao mesmo tempo). Em falha,
 * preserva os dados ja carregados — nunca esvazia a lista.
 */
export class SyncService {
  readonly store = new OrderStore();
  private syncing = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly repo: OrdersRepository,
    private readonly intervalMs: number,
  ) {}

  isSyncing(): boolean {
    return this.syncing;
  }

  /** true = sincronizou agora; false = ja havia uma sincronizacao em andamento (ignorado). */
  async sync(): Promise<{ ranNow: boolean; error: string | null }> {
    if (this.syncing) {
      return { ranNow: false, error: null };
    }
    this.syncing = true;
    try {
      const orders = await this.repo.readAll();
      this.store.replaceAll(orders); // Map por sheetRowIndex: nunca duplica em syncs repetidas.
      return { ranNow: true, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.store.markSyncError(message);
      // Propositalmente NAO limpa o store: os dados ja carregados continuam disponiveis.
      return { ranNow: true, error: message };
    } finally {
      this.syncing = false;
    }
  }

  /** Configura exatamente UM timer de sincronizacao automatica. Chamar so uma vez. */
  startAutoSync(): void {
    if (this.timer) return; // ja iniciado — nunca cria um segundo timer
    this.timer = setInterval(() => {
      void this.sync();
    }, this.intervalMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  stopAutoSync(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
