import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFlexibleDate, averageDeliveryDays, daysBetween } from "../src/shared/dates.js";

test("parseia dd/mm/aaaa hh:mm:ss", () => {
  const d = parseFlexibleDate("04/12/2025 16:16:54");
  assert.ok(d);
  assert.equal(d!.getFullYear(), 2025);
  assert.equal(d!.getMonth(), 11); // dezembro = indice 11
  assert.equal(d!.getDate(), 4);
  assert.equal(d!.getHours(), 16);
  assert.equal(d!.getMinutes(), 16);
});

test("parseia ISO yyyy-mm-dd", () => {
  const d = parseFlexibleDate("2026-03-11");
  assert.ok(d);
  assert.equal(d!.getFullYear(), 2026);
  assert.equal(d!.getMonth(), 2);
  assert.equal(d!.getDate(), 11);
});

test("parseia dd/mm/aaaa sem hora", () => {
  const d = parseFlexibleDate("28/12/2025");
  assert.ok(d);
  assert.equal(d!.getDate(), 28);
  assert.equal(d!.getMonth(), 11);
});

test("rejeita data invertida/absurda (mes 13)", () => {
  const d = parseFlexibleDate("28/13/2025");
  assert.equal(d, null);
});

test("rejeita dia invalido (31 de fevereiro)", () => {
  const d = parseFlexibleDate("31/02/2026");
  assert.equal(d, null);
});

test("rejeita texto que nao e data", () => {
  const d = parseFlexibleDate("kmooon");
  assert.equal(d, null);
});

test("rejeita vazio", () => {
  assert.equal(parseFlexibleDate(""), null);
  assert.equal(parseFlexibleDate("   "), null);
});

test("daysBetween nunca retorna negativo (datas invertidas -> null)", () => {
  const start = parseFlexibleDate("10/03/2026");
  const end = parseFlexibleDate("01/03/2026"); // entrega ANTES do pedido: invalido
  assert.equal(daysBetween(start, end), null);
});

test("averageDeliveryDays ignora pares invalidos e nunca da NaN", () => {
  const pairs = [
    { orderedAt: parseFlexibleDate("01/03/2026"), deliveredAt: parseFlexibleDate("05/03/2026") }, // 4 dias
    { orderedAt: parseFlexibleDate("01/03/2026"), deliveredAt: null }, // ainda nao entregue -> ignora
    { orderedAt: null, deliveredAt: parseFlexibleDate("05/03/2026") }, // sem data original -> ignora
    { orderedAt: parseFlexibleDate("10/03/2026"), deliveredAt: parseFlexibleDate("08/03/2026") }, // invertido -> ignora
  ];
  const avg = averageDeliveryDays(pairs);
  assert.equal(avg, 4);
  assert.ok(Number.isFinite(avg!));
  assert.ok(avg! >= 0);
});

test("averageDeliveryDays retorna null (nunca NaN) quando nao ha par valido", () => {
  const avg = averageDeliveryDays([{ orderedAt: null, deliveredAt: null }]);
  assert.equal(avg, null);
});
