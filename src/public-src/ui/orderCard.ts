import type { OrderJSON } from "../api/client.js";
import type { OrderStatus } from "../../shared/status.js";
import { el } from "./dom.js";
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
}

export function createOrderCard({ order, onSaveStatus, onSavePrice }: OrderCardOptions): HTMLElement {
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
