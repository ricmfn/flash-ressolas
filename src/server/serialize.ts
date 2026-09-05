import { buildDrivePhoto } from "../shared/drive.js";
import { normalizePhoneForWhatsApp, whatsappLink } from "../shared/phone.js";
import type { Order } from "../shared/types.js";

export function orderToJSON(order: Order) {
  const photo = buildDrivePhoto(order.photoUrl);
  const phone = normalizePhoneForWhatsApp(order.customerPhone);
  return {
    sheetRowIndex: order.sheetRowIndex,
    formId: order.formId,
    orderedAt: order.orderedAt ? order.orderedAt.toISOString() : null,
    orderedAtRaw: order.orderedAtRaw,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    phoneDisplay: phone.ok ? phone.display : null,
    whatsappOk: phone.ok,
    // Link ja pronto (com o DDI 55 quando necessario) — o cliente NUNCA deve
    // reconstruir isso a partir de customerPhone (numero cru da planilha, as
    // vezes sem DDI), senao o WhatsApp abre para um contato errado.
    whatsappUrl: whatsappLink(order.customerPhone),
    shoeModel: order.shoeModel,
    shoeSize: order.shoeSize,
    photo: photo, // { fileId, viewUrl, driveUrl } | null
    detail: order.detail,
    status: order.status,
    statusInferred: order.statusInferred,
    price: order.price,
    deliveryDate: order.deliveryDate ? order.deliveryDate.toISOString() : null,
    deliveryDateRaw: order.deliveryDateRaw,
    internalNotes: order.internalNotes,
  };
}

export type OrderJSON = ReturnType<typeof orderToJSON>;
