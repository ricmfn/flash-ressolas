import { VALID_STATUSES, isDeliveredStatus, type OrderStatus } from "../../shared/status.js";
import {
  initialStatusMenuState,
  statusMenuReducer,
  type StatusMenuState,
} from "../../shared/statusMenuState.js";
import { el, clear } from "./dom.js";

const STATUS_LABELS: Record<OrderStatus, string> = {
  RECEBIDO: "Recebido",
  EM_CONSERTO: "Em conserto",
  PRONTO: "Pronto",
  "ENTREGUE - PAGA": "Entregue — paga",
  "ENTREGUE - NÃO PAGA": "Entregue — não paga",
  CANCELADO: "Cancelado",
};

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");
const NON_ALNUM_RUN_RE = /[^a-zA-Z0-9]+/g;
const EDGE_DASH_RE = /^-+|-+$/g;

/** Gera um slug estavel e previsivel de classe CSS a partir do texto do status
 * (sem acento, sem espacos, hifens simples e sem repetir), ex: "ENTREGUE - NÃO PAGA"
 * -> "entregue-nao-paga". */
export function statusBadgeClass(status: string): string {
  const key = status
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .replace(NON_ALNUM_RUN_RE, "-")
    .replace(EDGE_DASH_RE, "")
    .toLowerCase();
  return `status-badge status-badge--${key}`;
}

export function statusLabel(status: string): string {
  return (STATUS_LABELS as Record<string, string>)[status] ?? status;
}

interface StatusMenuOptions {
  currentStatus: OrderStatus;
  currentDeliveryDateISO: string | null;
  onSave: (newStatus: OrderStatus, deliveryDateISO: string | null) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * Componente do seletor de status controlado: escolher uma opcao NUNCA salva nem fecha
 * o menu sozinho. So o botao explicito "Salvar status" dispara a gravacao.
 */
export function createStatusMenu(options: StatusMenuOptions): HTMLElement {
  let state: StatusMenuState = initialStatusMenuState();
  let deliveryDateOverride = "";

  const container = el("div", { class: "status-menu" });

  function dispatch(action: Parameters<typeof statusMenuReducer>[1]): void {
    state = statusMenuReducer(state, action);
    render();
  }

  async function handleSave(): Promise<void> {
    if (!state.selected) return;
    dispatch({ type: "requestSave" });
    const deliveryDateISO = deliveryDateOverride
      ? new Date(`${deliveryDateOverride}T00:00:00`).toISOString()
      : null;
    const result = await options.onSave(state.selected, deliveryDateISO);
    if (result.ok) {
      dispatch({ type: "saveSucceeded" });
    } else {
      dispatch({ type: "saveFailed", error: result.error ?? "Não foi possível salvar o status." });
    }
  }

  function render(): void {
    clear(container);

    if (!state.open) {
      container.appendChild(
        el(
          "button",
          {
            class: statusBadgeClass(options.currentStatus) + " status-menu__trigger",
            onclick: () => {
              deliveryDateOverride = "";
              dispatch({ type: "open", currentStatus: options.currentStatus });
            },
          },
          [statusLabel(options.currentStatus), " ▾"],
        ),
      );
      return;
    }

    const select = el("select", {
      class: "status-menu__select",
      disabled: state.saving,
      onchange: (ev) => {
        const value = (ev.target as HTMLSelectElement).value as OrderStatus;
        dispatch({ type: "select", status: value });
      },
    }) as HTMLSelectElement;
    for (const s of VALID_STATUSES) {
      const opt = el("option", { value: s }, [statusLabel(s)]) as HTMLOptionElement;
      if (s === state.selected) opt.selected = true;
      select.appendChild(opt);
    }

    const showDateField = state.selected ? isDeliveredStatus(state.selected) : false;

    const children: (Node | string)[] = [select];

    if (showDateField) {
      children.push(
        el("label", { class: "status-menu__date-label" }, [
          "Data de entrega (opcional — deixe em branco para usar hoje se ainda não houver data)",
          el("input", {
            type: "date",
            class: "status-menu__date",
            value: deliveryDateOverride,
            disabled: state.saving,
            oninput: (ev) => {
              deliveryDateOverride = (ev.target as HTMLInputElement).value;
            },
          }),
        ]),
      );
    }

    if (state.error) {
      children.push(el("p", { class: "status-menu__error" }, [state.error]));
    }

    children.push(
      el("div", { class: "status-menu__actions" }, [
        el(
          "button",
          {
            class: "btn btn--primary",
            disabled: state.saving || !state.selected,
            onclick: () => void handleSave(),
          },
          [state.saving ? "Salvando…" : "Salvar status"],
        ),
        el(
          "button",
          {
            class: "btn btn--ghost",
            disabled: state.saving,
            onclick: () => dispatch({ type: "cancel" }),
          },
          ["Cancelar"],
        ),
      ]),
    );

    container.appendChild(el("div", { class: "status-menu__panel" }, children));
  }

  render();
  return container;
}
