import { test } from "node:test";
import assert from "node:assert/strict";
import { currentRubberAssignments, countPairsPerRubberSheet } from "../src/shared/rubberUsage.js";
import type { RubberUsageEntry } from "../src/shared/rubberUsage.js";

function makeEntry(overrides: Partial<RubberUsageEntry> & { logRowIndex: number }): RubberUsageEntry {
  return {
    timestampISO: "2026-09-20T10:00:00.000Z",
    orderFormId: null,
    orderSheetRowIndex: 2,
    rubberSheetRowIndex: 3,
    rubberLabel: "Marca",
    ...overrides,
  };
}

test("currentRubberAssignments: so a entrada MAIS RECENTE de cada pedido conta (log append-only)", () => {
  const entries = [
    makeEntry({ logRowIndex: 2, orderSheetRowIndex: 5, rubberSheetRowIndex: 3 }),
    makeEntry({ logRowIndex: 3, orderSheetRowIndex: 5, rubberSheetRowIndex: 7 }), // trocou de ideia
    makeEntry({ logRowIndex: 4, orderSheetRowIndex: 6, rubberSheetRowIndex: 3 }),
  ];

  const current = currentRubberAssignments(entries);

  assert.equal(current.size, 2);
  assert.equal(current.get(5)?.rubberSheetRowIndex, 7); // vence a mais recente
  assert.equal(current.get(6)?.rubberSheetRowIndex, 3);
});

test("currentRubberAssignments: desmarcar (rubberSheetRowIndex null) tambem conta como a atribuicao atual", () => {
  const entries = [
    makeEntry({ logRowIndex: 2, orderSheetRowIndex: 5, rubberSheetRowIndex: 3 }),
    makeEntry({ logRowIndex: 3, orderSheetRowIndex: 5, rubberSheetRowIndex: null }), // desmarcou depois
  ];

  const current = currentRubberAssignments(entries);

  assert.equal(current.get(5)?.rubberSheetRowIndex, null);
});

test("countPairsPerRubberSheet: conta pedidos DISTINTOS atualmente atribuidos a cada folha", () => {
  const entries = [
    makeEntry({ logRowIndex: 2, orderSheetRowIndex: 5, rubberSheetRowIndex: 3 }),
    makeEntry({ logRowIndex: 3, orderSheetRowIndex: 6, rubberSheetRowIndex: 3 }),
    makeEntry({ logRowIndex: 4, orderSheetRowIndex: 7, rubberSheetRowIndex: 9 }),
    // pedido 5 trocou de 3 pra 9 depois — so a atribuicao atual (9) deve contar, nunca as duas
    makeEntry({ logRowIndex: 5, orderSheetRowIndex: 5, rubberSheetRowIndex: 9 }),
  ];

  const counts = countPairsPerRubberSheet(entries);

  assert.equal(counts.get(3), 1); // so o pedido 6 ainda aponta pra folha 3
  assert.equal(counts.get(9), 2); // pedidos 7 e 5
});

test("countPairsPerRubberSheet: pedidos desmarcados (null) nunca contam pra nenhuma folha", () => {
  const entries = [makeEntry({ logRowIndex: 2, orderSheetRowIndex: 5, rubberSheetRowIndex: null })];
  const counts = countPairsPerRubberSheet(entries);
  assert.equal(counts.size, 0);
});
