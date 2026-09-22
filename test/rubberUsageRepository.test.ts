import { test } from "node:test";
import assert from "node:assert/strict";
import type { SheetsClient } from "../src/server/google/sheetsClient.js";

// Mesmo motivo do expensesRepository.test.ts/rubberRepository.test.ts: o repositorio
// importa config.ts, que exige essas env vars so pra CARREGAR o modulo.
process.env.SESSION_SECRET ??= "test-secret";
process.env.APP_USERNAME ??= "test-user";
process.env.APP_PASSWORD_HASH ??= "test-hash";
const { RubberUsageRepository } = await import("../src/server/rubberUsageRepository.js");

function makeFakeSheets(
  rows: string[][],
  delayMs = 5,
): { sheets: SheetsClient; callCount: () => number; appended: (string | number)[][] } {
  let calls = 0;
  const appended: (string | number)[][] = [];
  const fake = {
    getValues: async (_range: string) => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return rows;
    },
    appendRow: async (_sheetName: string, row: (string | number)[]) => {
      appended.push(row);
    },
  };
  return { sheets: fake as unknown as SheetsClient, callCount: () => calls, appended };
}

test("RubberUsageRepository.readAll: parseia linhas e ignora linha sem 'linha do pedido' valida", async () => {
  const { sheets } = makeFakeSheets([
    ["2026-09-20T10:00:00.000Z", "F123", "5", "3", "Stick Evolution Nero"],
    ["", "", "", "", ""], // linha vazia
    ["2026-09-20T11:00:00.000Z", "", "não é número", "3", "x"], // linha corrompida: ignora, nunca quebra
  ]);
  const repo = new RubberUsageRepository(sheets);
  const entries = await repo.readAll();

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.orderSheetRowIndex, 5);
  assert.equal(entries[0]?.rubberSheetRowIndex, 3);
  assert.equal(entries[0]?.orderFormId, "F123");
});

test("RubberUsageRepository.readAll: 'linha da folha' vazia vira rubberSheetRowIndex null (pedido desmarcado)", async () => {
  const { sheets } = makeFakeSheets([["2026-09-20T10:00:00.000Z", "F123", "5", "", "x"]]);
  const repo = new RubberUsageRepository(sheets);
  const entries = await repo.readAll();
  assert.equal(entries[0]?.rubberSheetRowIndex, null);
});

test("RubberUsageRepository.assign: sempre APPEND (nunca sobrescreve uma linha existente) e invalida o cache", async () => {
  const { sheets, appended } = makeFakeSheets([]);
  const repo = new RubberUsageRepository(sheets);

  await repo.readAll(); // popula o cache com []
  await repo.assign(5, "F123", 3, "Stick Evolution Nero");

  assert.equal(appended.length, 1);
  assert.equal(appended[0]?.[2], 5); // linha do pedido
  assert.equal(appended[0]?.[3], 3); // linha da folha
});

test("RubberUsageRepository.readAll: duas chamadas concorrentes com cache frio batem na planilha so 1 vez (dedup de in-flight)", async () => {
  const { sheets, callCount } = makeFakeSheets([["2026-09-20T10:00:00.000Z", "F123", "5", "3", "x"]]);
  const repo = new RubberUsageRepository(sheets);

  const [a, b] = await Promise.all([repo.readAll(), repo.readAll()]);

  assert.equal(callCount(), 1);
  assert.deepEqual(a, b);
});
