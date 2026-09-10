import type { OrderJSON } from "../api/client.js";
import type { OrderStatus } from "../../shared/status.js";
import { el, clear } from "./dom.js";
import { createStatusMenu } from "./statusMenuUI.js";
import { createPriceEditor } from "./priceEditor.js";
import { openPhotoViewer } from "./photoViewer.js";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

interface OrderCardOptions {
  order: OrderJSON;
  onSaveStatus: (
    sheetRowIndex: number,
    status: OrderStatus,
    deliveryDateISO: string | null,
  ) => Promise<{ ok: boolean; error?: string }>;
  onSavePrice: (sheetRowIndex: number, rawValue: string) => Promise<{ ok: boolean; error?: string }>;
  onMarkReceived: (sheetRowIndex: number) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * Botao "pausar" (some quando o pedido ainda esta em RECEBIDO, ou seja, antes de qualquer
 * triagem/conserto) — usado quando o cliente preencheu o formulario mas ainda nao trouxe a
 * sapatilha fisicamente. So muda o status pra AGUARDANDO SAPATILHA (reaproveita onSaveStatus,
 * sem mexer no carimbo de data/hora — nao houve entrega real ainda).
 */
function createPauseTrigger(
  order: OrderJSON,
  onSaveStatus: OrderCardOptions["onSaveStatus"],
): HTMLElement | null {
  if (order.status !== "RECEBIDO") return null;

  let saving = false;
  let error: string | null = null;
  const container = el("div", { class: "dropoff-pause-trigger" });

  function render(): void {
    clear(container);
    const children: (Node | string | null)[] = [
      el(
        "button",
        {
          class: "btn btn--secondary btn--small",
          disabled: saving,
          onclick: async () => {
            saving = true;
            error = null;
            render();
            const result = await onSaveStatus(order.sheetRowIndex, "AGUARDANDO SAPATILHA", null);
            saving = false;
            if (!result.ok) {
              error = result.error ?? "Não foi possível pausar o pedido.";
              render();
            }
            // Em caso de sucesso o card inteiro e recriado no proximo render da lista.
          },
        },
        [saving ? "Pausando…" : "Cliente ainda não trouxe a sapatilha"],
      ),
      error ? el("p", { class: "dropoff-pause__error" }, [error]) : null,
    ];
    container.appendChild(el("div", { class: "dropoff-pause-trigger__panel" }, children));
  }

  render();
  return container;
}

/**
 * Banner + botao "recebi a sapatilha" — aparece quando o pedido esta pausado (AGUARDANDO
 * SAPATILHA). Chama onMarkReceived, que volta o status pra RECEBIDO E reseta o carimbo de
 * data/hora pro momento atual (pra nao inflar o tempo medio de entrega).
 */
function createResumeBanner(
  order: OrderJSON,
  onMarkReceived: OrderCardOptions["onMarkReceived"],
): HTMLElement | null {
  if (order.status !== "AGUARDANDO SAPATILHA") return null;

  let saving = false;
  let error: string | null = null;
  const container = el("div", { class: "dropoff-pause" });

  function render(): void {
    clear(container);
    const children: (Node | string | null)[] = [
      el("p", { class: "dropoff-pause__banner" }, [
        "⏸ Aguardando o cliente trazer a sapatilha — não conta como pendente nem no tempo médio de entrega.",
      ]),
      error ? el("p", { class: "dropoff-pause__error" }, [error]) : null,
      el(
        "button",
        {
          class: "btn btn--primary btn--small",
          disabled: saving,
          onclick: async () => {
            saving = true;
            error = null;
            render();
            const result = await onMarkReceived(order.sheetRowIndex);
            saving = false;
            if (!result.ok) {
              error = result.error ?? "Não foi possível marcar como recebido.";
              render();
            }
          },
        },
        [saving ? "Salvando…" : "Recebi a sapatilha"],
      ),
    ];
    container.appendChild(el("div", { class: "dropoff-pause__panel" }, children));
  }

  render();
  return container;
}

export function createOrderCard({ order, onSaveStatus, onSavePrice, onMarkReceived }: OrderCardOptions): HTMLElement {
  const photoBlock = order.photo
    ? el("button", {
        class: "order-card__photo-btn",
        onclick: () => openPhotoViewer(order.photo!.viewUrl, `Foto do pedido de ${order.customerName}`),
      }, [
        el("img", {
          src: order.photo.viewUrl,
          alt: `Foto do pedido de ${order.customerName}`,
          class: "order-card__photo",
          loading: "lazy",
        }),
      ])
    : el("div", { class: "order-card__photo order-card__photo--placeholder" }, ["Foto indisponível"]);

  // Usa o link ja normalizado pelo servidor (com DDI 55 quando o numero na planilha
  // nao tem): reconstruir isso aqui a partir de customerPhone bruto foi o bug que
  // mandava o WhatsApp para o contato errado.
  const whatsappBtn = order.whatsappOk && order.whatsappUrl
    ? el(
        "a",
        {
          class: "btn btn--whatsapp",
          href: order.whatsappUrl,
          target: "_blank",
          rel: "noopener noreferrer",
        },
        ["WhatsApp"],
      )
    : el("span", { class: "btn btn--whatsapp btn--disabled", "aria-disabled": "true" }, ["WhatsApp indisponível"]);

  const statusMenu = createStatusMenu({
    currentStatus: order.status as OrderStatus,
    currentDeliveryDateISO: order.deliveryDate,
    onSave: (status, deliveryDateISO) => onSaveStatus(order.sheetRowIndex, status, deliveryDateISO),
  });

  const priceEditor = createPriceEditor({
    currentPrice: order.price,
    onSave: (rawValue) => onSavePrice(order.sheetRowIndex, rawValue),
  });

  return el("article", { class: "order-card" }, [
    photoBlock,
    el("div", { class: "order-card__body" }, [
      el("div", { class: "order-card__header" }, [
        el("h3", { class: "order-card__name" }, [order.customerName || "(sem nome)"]),
        statusMenu,
      ]),
      el("p", { class: "order-card__meta" }, [
        `${order.shoeModel || "Modelo não informado"} · Tam. ${order.shoeSize || "—"}`,
      ]),
      order.detail ? el("p", { class: "order-card__detail" }, [order.detail]) : null,
      order.statusInferred
        ? el("p", { class: "order-card__hint" }, ["Status não encontrado na planilha — tratado como Recebido."])
        : null,
      createResumeBanner(order, onMarkReceived),
      createPauseTrigger(order, onSaveStatus),
      el("div", { class: "order-card__row" }, [
        el("span", { class: "order-card__label" }, ["Preço final"]),
        priceEditor,
      ]),
      el("div", { class: "order-card__dates" }, [
        el("span", {}, [`Entrada: ${formatDate(order.orderedAt)}`]),
        el("span", {}, [`Entrega: ${formatDate(order.deliveryDate)}`]),
      ]),
      order.internalNotes ? el("p", { class: "order-card__notes" }, [`Obs: ${order.internalNotes}`]) : null,
      el("div", { class: "order-card__footer" }, [
        el("span", { class: "order-card__phone" }, [order.phoneDisplay ?? order.customerPhone]),
        whatsappBtn,
      ]),
    ]),
  ]);
}
