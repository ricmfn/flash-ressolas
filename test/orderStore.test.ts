import { test } from "node:test";
import assert from "node:assert/strict";
import { OrderStore } from "../src/shared/orderStore.js";
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

test("sincronizacao repetida com os mesmos dados nunca duplica pedidos", () => {
  const store = new OrderStore();
  const batch = [makeOrder({ sheetRowIndex: 2 }), makeOrder({ sheetRowIndex: 3 }), makeOrder({ sheetRowIndex: 4 })];

  store.replaceAll(batch);
  assert.equal(store.size(), 3);

  // Reprocessa a MESMA leitura da planilha varias vezes seguidas (ex: sync automatica repetida).
  store.replaceAll(batch);
  store.replaceAll(batch);
  store.replaceAll(batch);

  assert.equal(store.size(), 3);
  assert.equal(store.listSorted().length, 3);
});

test("replaceAll com a mesma linha sheetRowIndex repetida no array de entrada nao duplica (Map por chave)", () => {
  const store = new OrderStore();
  // Simula uma leitura da planilha que, por algum motivo, contem a linha 5 duas vezes.
  const batch = [
    makeOrder({ sheetRowIndex: 5, customerName: "Versao antiga" }),
    makeOrder({ sheetRowIndex: 5, customerName: "Versao nova" }),
  ];
  store.replaceAll(batch);

  assert.equal(store.size(), 1);
  assert.equal(store.get(5)?.customerName, "Versao nova"); // ultima leitura da mesma linha prevalece
});

test("sync sucessivas com linhas novas na planilha acumulam sem apagar as antigas nem duplicar", () => {
  const store = new OrderStore();
  store.replaceAll([makeOrder({ sheetRowIndex: 2 }), makeOrder({ sheetRowIndex: 3 })]);
  assert.equal(store.size(), 2);

  // Planilha cresceu: mais pedidos chegaram via Google Forms.
  store.replaceAll([
    makeOrder({ sheetRowIndex: 2 }),
    makeOrder({ sheetRowIndex: 3 }),
    makeOrder({ sheetRowIndex: 4 }),
    makeOrder({ sheetRowIndex: 5 }),
  ]);

  assert.equal(store.size(), 4);
});

test("linha removida da planilha entre duas sincronizacoes some do store (replaceAll reflete a leitura real)", () => {
  const store = new OrderStore();
  store.replaceAll([makeOrder({ sheetRowIndex: 2 }), makeOrder({ sheetRowIndex: 3 }), makeOrder({ sheetRowIndex: 4 })]);
  assert.equal(store.size(), 3);

  store.replaceAll([makeOrder({ sheetRowIndex: 2 }), makeOrder({ sheetRowIndex: 4 })]);
  assert.equal(store.size(), 2);
  assert.equal(store.get(3), undefined);
});

test("upsertOne (salvar status/preco) nao cria linha duplicada e sobrevive a proxima sync", () => {
  const store = new OrderStore();
  store.replaceAll([makeOrder({ sheetRowIndex: 2, status: "RECEBIDO" })]);

  const edited = makeOrder({ sheetRowIndex: 2, status: "PRONTO" });
  store.upsertOne(edited);
  assert.equal(store.size(), 1);
  assert.equal(store.get(2)?.status, "PRONTO");

  // Sync automatica seguinte relê a planilha (que agora tambem reflete o novo status).
  store.replaceAll([makeOrder({ sheetRowIndex: 2, status: "PRONTO" })]);
  assert.equal(store.size(), 1);
  assert.equal(store.get(2)?.status, "PRONTO");
});

test("pedidos nao entregues aparecem antes dos entregues, e cada grupo ordenado por prioridade/data", () => {
  const store = new OrderStore();
  store.replaceAll([
    makeOrder({ sheetRowIndex: 2, status: "ENTREGUE - PAGA", orderedAt: new Date("2026-01-01T00:00:00Z") }),
    makeOrder({ sheetRowIndex: 3, status: "RECEBIDO", orderedAt: new Date("2026-01-05T00:00:00Z") }),
    makeOrder({ sheetRowIndex: 4, status: "PRONTO", orderedAt: new Date("2026-01-03T00:00:00Z") }),
    makeOrder({ sheetRowIndex: 5, status: "EM_CONSERTO", orderedAt: new Date("2026-01-02T00:00:00Z") }),
  ]);

  const rows = store.listSorted().map((o) => o.sheetRowIndex);
  // Nao entregues primeiro (4=PRONTO prioridade 0, 5=EM_CONSERTO prioridade 1, 3=RECEBIDO prioridade 2),
  // entregues por ultimo (2).
  assert.deepEqual(rows, [4, 5, 3, 2]);
});

test("markSyncError preserva os dados ja carregados (nao esvazia a lista em falha temporaria)", () => {
  const store = new OrderStore();
  store.replaceAll([makeOrder({ sheetRowIndex: 2 }), makeOrder({ sheetRowIndex: 3 })]);
  assert.equal(store.size(), 2);

  store.markSyncError("Falha temporaria de rede");

  assert.equal(store.size(), 2); // dados anteriores continuam intactos
  assert.equal(store.getLastSyncError(), "Falha temporaria de rede");
});
