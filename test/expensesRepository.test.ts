import { test } from "node:test";
import assert from "node:assert/strict";
import type { SheetsClient } from "../src/server/google/sheetsClient.js";

// expensesRepository.ts importa config.ts, que exige essas 3 env vars so pra CARREGAR o
// modulo (mesmo sem usa-las aqui — config.expensesSheetName ja tem default). Sem isso o
// import quebraria o teste com "Variável de ambiente obrigatória ausente". Precisa vir
// antes do import de ExpensesRepository, por isso o import dinamico abaixo em vez de
// um import estatico no topo (que seria hoisted antes desse process.env.X ??= ...).
process.env.SESSION_SECRET ??= "test-secret";
process.env.APP_USERNAME ??= "test-user";
process.env.APP_PASSWORD_HASH ??= "test-hash";
const { ExpensesRepository } = await import("../src/server/expensesRepository.js");

/** Fake minimo de SheetsClient: so getValues, com contador de chamadas e atraso
 * configuravel pra simular a latencia real da API (necessario pra forcar a corrida entre
 * duas leituras concorrentes nos testes de dedup abaixo). */
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

test("ExpensesRepository.readAll: parseia linhas e ignora linhas 100% vazias", async () => {
  const { sheets } = makeFakeSheets([
    ["10/06/2026", "Materiais", "Cola Vipal", "R$ 40,00"],
    ["", "", "", ""],
  ]);
  const repo = new ExpensesRepository(sheets);
  const rows = await repo.readAll();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.category, "Materiais");
  assert.equal(rows[0]?.value, 40);
});

test("ExpensesRepository.readAll: duas chamadas concorrentes com cache frio batem na planilha so 1 vez (dedup de in-flight)", async () => {
  const { sheets, callCount } = makeFakeSheets([["10/06/2026", "Materiais", "x", "10"]]);
  const repo = new ExpensesRepository(sheets);

  const [a, b] = await Promise.all([repo.readAll(), repo.readAll()]);

  assert.equal(callCount(), 1); // sem o dedup, seriam 2 leituras ao vivo pro mesmo par de requests
  assert.deepEqual(a, b);
});

test("ExpensesRepository.readAll: dentro do TTL serve do cache, sem nova leitura", async () => {
  const { sheets, callCount } = makeFakeSheets([["10/06/2026", "Materiais", "x", "10"]]);
  const repo = new ExpensesRepository(sheets);

  await repo.readAll();
  await repo.readAll();
  await repo.readAll();

  assert.equal(callCount(), 1);
});

test("ExpensesRepository.invalidateCache: forca uma leitura nova mesmo dentro do TTL", async () => {
  const { sheets, callCount } = makeFakeSheets([["10/06/2026", "Materiais", "x", "10"]]);
  const repo = new ExpensesRepository(sheets);

  await repo.readAll();
  repo.invalidateCache();
  await repo.readAll();

  assert.equal(callCount(), 2);
});
