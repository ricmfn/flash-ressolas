import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDashboardMetrics } from "../src/shared/metrics.js";
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

test("cortesias (ENTREGUE - NÃO PAGA) sao contadas no mes da data de ENTREGA, nao do pedido", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  const orders = [
    // Cortesia entregue em junho/2026 (mes atual) -> conta no mes atual, mesmo pedida em maio.
    makeOrder({
      sheetRowIndex: 2,
      status: "ENTREGUE - NÃO PAGA",
      orderedAt: new Date("2026-05-20T00:00:00Z"),
      deliveryDate: new Date("2026-06-03T00:00:00Z"),
    }),
    // Cortesia entregue em abril/2026 -> conta em abril, nao no mes do pedido (marco).
    makeOrder({
      sheetRowIndex: 3,
      status: "ENTREGUE - NÃO PAGA",
      orderedAt: new Date("2026-03-25T00:00:00Z"),
      deliveryDate: new Date("2026-04-10T00:00:00Z"),
    }),
    // Entregue mas PAGA -> nunca conta como cortesia.
    makeOrder({
      sheetRowIndex: 4,
      status: "ENTREGUE - PAGA",
      deliveryDate: new Date("2026-06-05T00:00:00Z"),
      price: 80,
    }),
    // Ainda pendente -> nunca conta como cortesia.
    makeOrder({ sheetRowIndex: 5, status: "RECEBIDO" }),
  ];

  const metrics = computeDashboardMetrics(orders, now);

  assert.equal(metrics.courtesyMonthly.length, 6);
  assert.equal(metrics.courtesyMonthly[metrics.courtesyMonthly.length - 1]?.monthISO, "2026-06");
  assert.equal(metrics.courtesyThisMonth, 1);

  const april = metrics.courtesyMonthly.find((m) => m.monthISO === "2026-04");
  assert.equal(april?.count, 1);

  const march = metrics.courtesyMonthly.find((m) => m.monthISO === "2026-03");
  assert.equal(march?.count, 0);
});

test("cortesia sem data de entrega registrada usa a data do pedido como reserva", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  const orders = [
    makeOrder({
      sheetRowIndex: 2,
      status: "ENTREGUE - NÃO PAGA",
      orderedAt: new Date("2026-05-05T00:00:00Z"),
      deliveryDate: null,
    }),
  ];

  const metrics = computeDashboardMetrics(orders, now);
  const may = metrics.courtesyMonthly.find((m) => m.monthISO === "2026-05");
  assert.equal(may?.count, 1);
});

test("dashboard sem nenhuma cortesia retorna janela de 6 meses zerada, nunca null/NaN", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  const metrics = computeDashboardMetrics([], now);

  assert.equal(metrics.courtesyMonthly.length, 6);
  assert.equal(metrics.courtesyThisMonth, 0);
  for (const point of metrics.courtesyMonthly) {
    assert.equal(point.count, 0);
  }
});
