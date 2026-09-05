import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveWriteTargets, columnIndexToA1 } from "../src/shared/writeTarget.js";

test("escreve na coluna real do status quando ele esta em I (linha antiga)", () => {
  const row = [
    "1",
    "04/12/2025 16:16:54",
    "Leandro Noel",
    "11998362963",
    "La Sportiva Solution",
    "42 EUR",
    "https://drive...",
    "kmooon",
    "ENTREGUE - PAGA",
    "280",
    "",
    "",
    "",
  ];
  const targets = resolveWriteTargets(row, 2);
  assert.equal(targets.statusCol, 8); // I
  assert.equal(columnIndexToA1(targets.statusCol), "I");
});

test("escreve na coluna real do status quando ele esta em H (linha nova)", () => {
  const row = [
    "65",
    "30/03/2026 15:46:34",
    "Arthur Andrade",
    "",
    "La Sportiva Mandala",
    "40 BR",
    "https://drive...",
    "ENTREGUE - PAGA",
    "ENTREGUE - PAGA",
    "2026-04-22",
    "",
    "",
    "",
  ];
  const targets = resolveWriteTargets(row, 66);
  assert.equal(targets.statusCol, 7); // H
  assert.equal(columnIndexToA1(targets.statusCol), "H");
});

test("pedido novo sem status ainda usa a coluna nominal J (Status do Pedido)", () => {
  const row = [
    "74",
    "12/04/2026 13:12:39",
    "Franklin de Souza Moura",
    "11966129773",
    "Madrock Drone Black",
    "43",
    "https://drive...",
    "",
    "",
    "",
    "",
    "",
    "",
  ];
  const targets = resolveWriteTargets(row, 75);
  assert.equal(targets.statusCol, 9); // J nominal, vazia
  assert.equal(columnIndexToA1(targets.statusCol), "J");
});

test("nunca aponta para uma coluna ja ocupada por outro dado (nao sobrescreve as cegas)", () => {
  const row = [
    "10",
    "28/12/2025 20:24:46",
    "Diego",
    "",
    "Acopa - Gama",
    "40EU",
    "https://drive...",
    "", // H vazio
    "ENTREGUE - PAGA", // I = status
    "320", // J = preco
    "", // K vazio
    "",
    "",
  ];
  const targets = resolveWriteTargets(row, 11);
  assert.equal(targets.statusCol, 8); // I, onde o status realmente esta
  assert.equal(targets.priceCol, 9); // J, onde o preco realmente esta
  assert.notEqual(targets.priceCol, targets.statusCol);
});

test("columnIndexToA1 converte indices 0-indexados para letras", () => {
  assert.equal(columnIndexToA1(0), "A");
  assert.equal(columnIndexToA1(7), "H");
  assert.equal(columnIndexToA1(9), "J");
  assert.equal(columnIndexToA1(25), "Z");
  assert.equal(columnIndexToA1(26), "AA");
});
