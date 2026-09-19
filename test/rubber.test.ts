import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeRubber } from "../src/shared/rubber.js";
import type { RubberSheet } from "../src/shared/rubber.js";

function makeSheet(overrides: Partial<RubberSheet> & { sheetRowIndex: number }): RubberSheet {
  return {
    date: "",
    brand: "Marca",
    supplier: "",
    value: null,
    percentRemaining: null,
    notes: "",
    ...overrides,
  };
}

test("summarizeRubber: soma so valores informados, conta ativas (>0 ou null) e zeradas (=0) separadamente", () => {
  const sheets = [
    makeSheet({ sheetRowIndex: 2, value: 1600, percentRemaining: 0 }), // zerada
    makeSheet({ sheetRowIndex: 3, value: 1099, percentRemaining: 70 }), // ativa
    makeSheet({ sheetRowIndex: 4, value: null, percentRemaining: null }), // ativa (sem % informado ainda)
    makeSheet({ sheetRowIndex: 5, value: 419, percentRemaining: 100 }), // ativa
  ];

  const summary = summarizeRubber(sheets);

  assert.equal(summary.totalInvested, 1600 + 1099 + 419);
  assert.equal(summary.activeCount, 3);
  assert.equal(summary.finishedCount, 1);
  assert.equal(summary.sheets.length, 4);
});

test("summarizeRubber: lista vazia nunca quebra, tudo zerado", () => {
  const summary = summarizeRubber([]);
  assert.equal(summary.totalInvested, 0);
  assert.equal(summary.activeCount, 0);
  assert.equal(summary.finishedCount, 0);
});
