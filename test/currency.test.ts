import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBRLCurrency } from "../src/shared/currency.js";

test("aceita R$ 280,00", () => {
  const r = parseBRLCurrency("R$ 280,00");
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.value, 280);
});

test("aceita 280,00", () => {
  const r = parseBRLCurrency("280,00");
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.value, 280);
});

test("aceita 280.00", () => {
  const r = parseBRLCurrency("280.00");
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.value, 280);
});

test("aceita 1.234,50 (milhar BR + decimal)", () => {
  const r = parseBRLCurrency("1.234,50");
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.value, 1234.5);
});

test("aceita 0 como preco valido (nao e erro)", () => {
  const r = parseBRLCurrency("0");
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.value, 0);
});

test("campo vazio e valido com value null (nao e erro)", () => {
  const r = parseBRLCurrency("   ");
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.value, null);
});

test("rejeita ?", () => {
  const r = parseBRLCurrency("?");
  assert.equal(r.ok, false);
});

test("rejeita data ISO no campo preco", () => {
  const r = parseBRLCurrency("2026-03-11");
  assert.equal(r.ok, false);
});

test("rejeita data BR no campo preco", () => {
  const r = parseBRLCurrency("11/03/2026 14:00:00");
  assert.equal(r.ok, false);
});

test("rejeita texto nao numerico", () => {
  const r = parseBRLCurrency("kmooon");
  assert.equal(r.ok, false);
});

test("rejeita texto misto com numero", () => {
  const r = parseBRLCurrency("de boa 280");
  assert.equal(r.ok, false);
});

test("nunca converte invalido para zero silenciosamente", () => {
  const r = parseBRLCurrency("abc");
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.error.length > 0);
  }
});

test("rejeita valor negativo", () => {
  const r = parseBRLCurrency("-280");
  assert.equal(r.ok, false);
});
