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
  // Debounce da busca: digitar nunca deve travar a tela (o input em si nunca e recriado —
  // so o conteudo abaixo dele e atualizado, e com um pequeno atraso para nao re-renderizar
  // a lista inteira a cada tecla).
  let searchDebounceHandle: ReturnType<typeof setTimeout> | null = null;
  const SEARCH_DEBOUNCE_MS = 120;

  const root = el("div", { class: "orders-view" });
  container.appendChild(root);

  // Containers persistentes: criados uma unica vez e nunca recriados (nem limpos) enquanto
  // o usuario digita na busca — isso e o que elimina o travamento a cada letra, porque o
  // <input> nunca perde foco/estado e a lista so e recalculada, nao o toolbar inteiro.
  const toolbar = el("div", { class: "orders-toolbar" });
  const summary = el("div", { class: "orders-summary" });
  const content = el("div", { class: "orders-content" });
  root.appendChild(toolbar);
  root.appendChild(summary);
  root.appendChild(content);

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
      // So o conteudo muda aqui (status/preco de um pedido) — nunca o toolbar, para nao
      // atrapalhar o usuario se ele estiver com texto digitado na busca.
      renderContent();
      return { ok: true as const };
    }
    return { ok: false as const, error: result.error };
  }

  async function handleSavePrice(sheetRowIndex: number, rawValue: string) {
    const result = await api.updatePrice(sheetRowIndex, rawValue);
    if (result.ok) {
      const idx = orders.findIndex((o) => o.sheetRowIndex === sheetRowIndex);
      if (idx >= 0) orders[idx] = result.data.order;
      renderContent();
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

  /**
   * Reconstroi so o toolbar (busca + filtro + botao de sync). So deve ser chamado quando algo
   * fora da busca muda (estado de sincronizacao, filtro, carga inicial) — nunca a cada tecla
   * digitada, senao o <input> e recriado e a digitacao trava/perde fluidez.
   */
  function renderToolbar(): void {
    clear(toolbar);
    toolbar.appendChild(
      el("input", {
        type: "search",
        class: "orders-toolbar__search",
        placeholder: "Buscar por nome ou telefone…",
        value: searchTerm,
        oninput: (ev) => {
          searchTerm = (ev.target as HTMLInputElement).value;
          // Debounce leve: a lista so e refeita um pouco depois de parar de digitar, para que
          // a digitacao em si nunca seja bloqueada por um re-render pesado (efeito "instantaneo",
          // tipo Spotlight). O input nunca e tocado aqui — so o conteudo abaixo dele.
          if (searchDebounceHandle !== null) clearTimeout(searchDebounceHandle);
          searchDebounceHandle = setTimeout(() => {
            searchDebounceHandle = null;
            renderContent();
          }, SEARCH_DEBOUNCE_MS);
        },
      }),
    );
    toolbar.appendChild(
      el(
        "select",
        {
          class: "orders-toolbar__filter",
          onchange: (ev) => {
            statusFilter = (ev.target as HTMLSelectElement).value as OrderStatus | "TODOS";
            renderContent();
          },
        },
        [
          el("option", { value: "TODOS", selected: statusFilter === "TODOS" }, ["Todos os status"]),
          ...VALID_STATUSES.map((s) =>
            el("option", { value: s, selected: statusFilter === s }, [statusLabel(s)]),
          ),
        ],
      ),
    );
    toolbar.appendChild(
      el(
        "button",
        {
          class: "btn btn--secondary",
          disabled: syncing,
          onclick: () => void handleSyncClick(),
        },
        [syncing ? "Sincronizando…" : "Atualizar / Sincronizar"],
      ),
    );
  }

  /** Reconstroi o resumo + a lista de pedidos (nunca o toolbar/input de busca). */
  function renderContent(): void {
    clear(summary);
    summary.appendChild(el("span", { class: "orders-summary__pending" }, [`${pendingCount} pendente(s)`]));
    if (lastSyncedAt) {
      summary.appendChild(
        el("span", { class: "orders-summary__synced" }, [
          `Última sincronização: ${new Date(lastSyncedAt).toLocaleString("pt-BR")}`,
        ]),
      );
    }

    clear(content);

    if (loadError) {
      content.appendChild(
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
      content.appendChild(el("div", { class: "state-banner state-banner--loading" }, ["Carregando pedidos…"]));
      return;
    }

    const visible = filteredOrders();

    if (visible.length === 0) {
      content.appendChild(
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
    content.appendChild(list);
  }

  /** Reconstroi tudo: toolbar + resumo/lista. So usar fora do fluxo de digitacao na busca. */
  function render(): void {
    renderToolbar();
    renderContent();
  }

  async function refresh(showSpinner = true): Promise<void> {
    if (showSpinner) loading = true;
    // renderContent (nao render) — refresh nunca muda estado do toolbar, e isso evita
    // recriar o <input> de busca (e perder foco/cursor) durante o auto-refresh periodico
    // enquanto o usuario esta digitando.
    renderContent();
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
    renderContent();
  }

  render();
  void refresh(true);

  return { root, refresh };
}
