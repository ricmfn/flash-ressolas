import { test } from "node:test";
import assert from "node:assert/strict";
import { orderToJSON } from "../src/server/serialize.js";
import type { Order } from "../src/shared/types.js";

/** Cria um pedido minimo valido para os testes, com overrides pontuais. */
function makeOrder(overrides: Partial<Order> & { sheetRowIndex: number }): Order {
  return {
    statusCellIndex: 8,
    formId: String(overrides.sheetRowIndex),
    orderedAt: new Date("2026-01-10T10:00:00Z"),
    orderedAtRaw: "10/01/2026 10:00:00",
    customerName: `Cliente ${overrides.sheetRowIndex}`,
    customerPhone: "11999998888",
    shoeModel: "Scarpa Instinct",
    shoeSize: "40",
    photoUrl: "",
    detail: "Resolagem completa",
    status: "RECEBIDO",
    statusInferred: false,
    price: null,
    priceCellIndex: null,
    deliveryDate: null,
    deliveryDateRaw: "",
    deliveryDateCellIndex: null,
    internalNotes: "",
    ...overrides,
  };
}

test("whatsappUrl inclui o DDI 55 mesmo quando a planilha guarda o numero sem ele (bug do link errado)", () => {
  // Caso real reportado: "(11) 99489-8296" guardado na planilha sem DDI.
  const order = makeOrder({ sheetRowIndex: 2, customerPhone: "11994898296" });
  const json = orderToJSON(order);

  assert.equal(json.whatsappOk, true);
  assert.equal(json.whatsappUrl, "https://wa.me/5511994898296");
});

test("whatsappUrl preserva numero que ja vem com DDI 55 na planilha", () => {
  const order = makeOrder({ sheetRowIndex: 3, customerPhone: "5511994898296" });
  const json = orderToJSON(order);

  assert.equal(json.whatsappUrl, "https://wa.me/5511994898296");
});

test("whatsappUrl e null quando o telefone e invalido/vazio, e whatsappOk fica false", () => {
  const order = makeOrder({ sheetRowIndex: 4, customerPhone: "" });
  const json = orderToJSON(order);

  assert.equal(json.whatsappOk, false);
  assert.equal(json.whatsappUrl, null);
});
