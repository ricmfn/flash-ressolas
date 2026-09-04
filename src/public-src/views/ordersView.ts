import { api, type OrderJSON } from "../api/client.js";
import { VALID_STATUSES, type OrderStatus } from "../../shared/status.js";
import { el, clear } from "../ui/dom.js";
import { createOrderCard } from "../ui/orderCard.js";
import { statusLabel } from "../ui/statusMenuUI.js";

interface OrdersViewHandle {
  root: HTMLElement;
  /** Reconsulta a API. Preserva a lista ja carregada em caso de erro (nunca esvazia a tela). */
  refresh: (showSpinner?: boolean) => Promise<void>;
}

export function renderOrdersView(container: Element): OrdersViewHandle {
  let orders: OrderJSON[] = [];
  let pendingCount = 0;
  let lastSyncedAt: string | null = null;
  let loading = true;
  let syncing = false;
  let loadError: string | null = null;
  let searchTerm = "";
  let statusFilter: OrderStatus | "TODOS" = "TODOS";
  let hasLoadedOnce = false;

  const root = el("div", { class: "orders-view" });
  container.appendChild(root);

  const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

  function normalize(text: string): string {
    return text.toLowerCase().normalize("NFD").replace(DIACRITICS_RE, "");
  }

  function filteredOrders(): OrderJSON[] {
    return orders.filter((o) => {
      if (statusFilter !== "TODOS" && o.status !== statusFilter) return false;
      if (!searchTerm) return true;
      const term = normalize(searchTerm);
      return (
        normalize(o.customerName).includes(term) ||
        normalize(o.customerPhone).includes(term) ||
        normalize(o.phoneDisplay ?? "").includes(term)
      );
    });
  }

  async function handleSaveStatus(sheetRowIndex: number, status: OrderStatus, deliveryDateISO: string | null) {
    const result = await api.updateStatus(sheetRowIndex, status, deliveryDateISO);
    if (result.ok) {
      const idx = orders.findIndex((o) => o.sheetRowIndex === sheetRowIndex);
      if (idx >= 0) orders[idx] = result.data.order;
      render();
      return { ok: true as const };
    }
    return { ok: false as const, error: result.error };
  }

  async function handleSavePrice(sheetRowIndex: number, rawValue: string) {
    const result = await api.updatePrice(sheetRowIndex, rawValue);
    if (result.ok) {
      const idx = orders.findIndex((o) => o.sheetRowIndex === sheetRowIndex);
      if (idx >= 0) orders[idx] = result.data.order;
      render();
      return { ok: true as const };
    }
    return { ok: false as const, error: result.error };
  }

  async function handleSyncClick(): Promise<void> {
    if (syncing) return; // impede duplo clique
    syncing = true;
    render();
    const result = await api.sync();
    syncing = false;
    if (result.ok) {
      await refresh(false);
    } else {
      loadError = result.error;
      render();
    }
  }

  function render(): void {
    clear(root);

    const toolbar = el("div", { class: "orders-toolbar" }, [
      el("input", {
        type: "search",
        class: "orders-toolbar__search",
        placeholder: "Buscar por nome ou telefone…",
        value: searchTerm,
        oninput: (ev) => {
          searchTerm = (ev.target as HTMLInputElement).value;
          render();
        },
      }),
      el(
        "select",
        {
          class: "orders-toolbar__filter",
          onchange: (ev) => {
            statusFilter = (ev.target as HTMLSelectElement).value as OrderStatus | "TODOS";
            render();
          },
        },
        [
          el("option", { value: "TODOS", selected: statusFilter === "TODOS" }, ["Todos os status"]),
          ...VALID_STATUSES.map((s) =>
            el("option", { value: s, selected: statusFilter === s }, [statusLabel(s)]),
          ),
        ],
      ),
      el(
        "button",
        {
          class: "btn btn--secondary",
          disabled: syncing,
          onclick: () => void handleSyncClick(),
        },
        [syncing ? "Sincronizando…" : "Atualizar / Sincronizar"],
      ),
    ]);

    const summary = el("div", { class: "orders-summary" }, [
      el("span", { class: "orders-summary__pending" }, [`${pendingCount} pendente(s)`]),
      lastSyncedAt
        ? el("span", { class: "orders-summary__synced" }, [
            `Última sincronização: ${new Date(lastSyncedAt).toLocaleString("pt-BR")}`,
          ])
        : null,
    ]);

    root.appendChild(toolbar);
    root.appendChild(summary);

    if (loadError) {
      root.appendChild(
        el("div", { class: "state-banner state-banner--error" }, [
          el("p", {}, [loadError]),
          el("button", { class: "btn btn--primary", onclick: () => void refresh(true) }, ["Tentar novamente"]),
        ]),
      );
      // Se ja havia pedidos carregados, continua mostrando a lista antiga abaixo do erro
      // (nunca esvazia a tela por causa de uma falha temporaria).
      if (orders.length === 0) return;
    }

    if (loading && !hasLoadedOnce) {
      root.appendChild(el("div", { class: "state-banner state-banner--loading" }, ["Carregando pedidos…"]));
      return;
    }

    const visible = filteredOrders();

    if (visible.length === 0) {
      root.appendChild(
        el("div", { class: "state-banner state-banner--empty" }, [
          orders.length === 0 ? "Nenhum pedido encontrado ainda." : "Nenhum pedido corresponde à busca/filtro.",
        ]),
      );
      return;
    }

    const list = el("div", { class: "orders-list" });
    for (const order of visible) {
      list.appendChild(
        createOrderCard({
          order,
          onSaveStatus: handleSaveStatus,
          onSavePrice: handleSavePrice,
        }),
      );
    }
    root.appendChild(list);
  }

  async function refresh(showSpinner = true): Promise<void> {
    if (showSpinner) loading = true;
    render();
    const result = await api.orders();
    loading = false;
    if (result.ok) {
      orders = result.data.orders;
      pendingCount = result.data.pendingCount;
      lastSyncedAt = result.data.lastSyncedAt;
      loadError = result.data.lastSyncError; // erro de sync de fundo, se houver, ainda mostra os dados
      hasLoadedOnce = true;
    } else {
      // Preserva os dados ja carregados; so mostra erro retry-avel.
      loadError = result.error;
    }
    render();
  }

  render();
  void refresh(true);

  return { root, refresh };
}
