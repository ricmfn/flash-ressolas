import { test } from "node:test";
import assert from "node:assert/strict";
import type { SheetsClient } from "../src/server/google/sheetsClient.js";

// Mesmo motivo do expensesRepository.test.ts: rubberRepository.ts importa config.ts, que
// exige essas env vars so pra carregar o modulo. Import dinamico depois de setar as env
// vars, porque um import estatico seria hoisted antes delas.
process.env.SESSION_SECRET ??= "test-secret";
process.env.APP_USERNAME ??= "test-user";
process.env.APP_PASSWORD_HASH ??= "test-hash";
const { RubberRepository } = await import("../src/server/rubberRepository.js");

/** Mesmo fake minimo usado em expensesRepository.test.ts. */
function makeFakeSheets(rows: string[][], delayMs = 5): { sheets: SheetsClient; callCount: () => number } {
  let calls = 0;
  const fake = {
    getValues: async (_range: string) => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return rows;
    },
  };
  return { sheets: fake as unknown as SheetsClient, callCount: () => calls };
}

test("RubberRepository.readAll: parseia linhas com sheetRowIndex 1-based a partir da linha 2", async () => {
  const { sheets } = makeFakeSheets([
    ["10/06/2026", "Elite", "Turim", "R$ 100,00", "60", "obs"],
    ["", "", "", "", "", ""],
  ]);
  const repo = new RubberRepository(sheets);
  const rows = await repo.readAll();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.sheetRowIndex, 2);
  assert.equal(rows[0]?.value, 100);
  assert.equal(rows[0]?.percentRemaining, 60);
});

test("RubberRepository.readAll: duas chamadas concorrentes com cache frio batem na planilha so 1 vez (dedup de in-flight)", async () => {
  const { sheets, callCount } = makeFakeSheets([["10/06/2026", "Elite", "Turim", "100", "60", ""]]);
  const repo = new RubberRepository(sheets);

  const [a, b] = await Promise.all([repo.readAll(), repo.readAll()]);

  assert.equal(callCount(), 1); // sem o dedup, /api/rubber + /api/profitability concorrentes leriam 2x
  assert.deepEqual(a, b);
});

test("RubberRepository.readAll: dentro do TTL serve do cache, sem nova leitura", async () => {
  const { sheets, callCount } = makeFakeSheets([["10/06/2026", "Elite", "Turim", "100", "60", ""]]);
  const repo = new RubberRepository(sheets);

  await repo.readAll();
  await repo.readAll();

  assert.equal(callCount(), 1);
});

test("RubberRepository.invalidateCache: forca uma leitura nova mesmo dentro do TTL", async () => {
  const { sheets, callCount } = makeFakeSheets([["10/06/2026", "Elite", "Turim", "100", "60", ""]]);
  const repo = new RubberRepository(sheets);

  await repo.readAll();
  repo.invalidateCache();
  await repo.readAll();

  assert.equal(callCount(), 2);
});
