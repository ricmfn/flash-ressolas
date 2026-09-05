import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOrderRow } from "../src/shared/rowParser.js";

// Casos baseados em linhas REAIS observadas na planilha FLASH GESTÃO (nomes/valores
// mantidos identicos aos originais para garantir que o parser cobre a variacao real).

test("status na coluna I (indice 8) - padrao das linhas mais antigas", () => {
  const row = [
    "1",
    "04/12/2025 16:16:54",
    "Leandro Noel",
    "11998362963",
    "La Sportiva Solution",
    "42 EUR",
    "https://drive.google.com/open?id=178PXZVPbUSKDnfG5pbWG-g4u5DC7ufh7",
    "kmooon",
    "ENTREGUE - PAGA",
    "280",
    "",
    "",
    "",
  ];
  const order = parseOrderRow(row, 2);
  assert.equal(order.status, "ENTREGUE - PAGA");
  assert.equal(order.statusCellIndex, 8);
  assert.equal(order.statusInferred, false);
  assert.equal(order.detail, "kmooon");
  assert.equal(order.price, 280);
  assert.equal(order.sheetRowIndex, 2);
});

test("status na coluna H (indice 7) - padrao das linhas mais novas, data em vez de preco logo depois", () => {
  const row = [
    "65",
    "30/03/2026 15:46:34",
    "Arthur Andrade",
    "",
    "La Sportiva Mandala",
    "40 BR",
    "https://drive.google.com/open?id=1BaLYBPJZZtDF34RUHPp9WFW-5v8MVlKX",
    "ENTREGUE - PAGA",
    "ENTREGUE - PAGA",
    "2026-04-22",
    "",
    "",
    "",
  ];
  const order = parseOrderRow(row, 66);
  assert.equal(order.status, "ENTREGUE - PAGA");
  assert.equal(order.statusCellIndex, 7);
  assert.equal(order.price, null); // celula seguinte era outro status repetido, nao um preco
  assert.ok(order.deliveryDate);
  assert.equal(order.deliveryDate!.getFullYear(), 2026);
  assert.equal(order.deliveryDate!.getMonth(), 3); // abril
  assert.equal(order.deliveryDate!.getDate(), 22);
});

test("linha sem nenhum status reconhecido vira RECEBIDO so na aplicacao, preserva texto como detalhe", () => {
  const row = [
    "",
    "28/04/2026 19:41:26",
    "Vinicius Pereira",
    "11988964552",
    "ADIDDAS 5.10 NIAD",
    "9 US",
    "https://drive.google.com/open?id=1s0Jmd3MPg6K1dguqhQ-uUU4eoJa1cXt9",
    "Ela ta já bem judiada, infelizmente chegou a furar, gostaria se saber se ainda existe esperanças.",
    "",
    "",
    "",
    "",
    "",
  ];
  const order = parseOrderRow(row, 80);
  assert.equal(order.status, "RECEBIDO");
  assert.equal(order.statusInferred, true);
  assert.equal(order.statusCellIndex, null);
  assert.match(order.detail, /esperanças/);
  assert.equal(order.price, null);
  assert.equal(order.formId, null); // coluna ID vazia (linha apos o gap do 74) — nunca usar como chave
});

test("linha totalmente vazia depois da foto (pedido novo, sem nada preenchido)", () => {
  const row = [
    "74",
    "12/04/2026 13:12:39",
    "Franklin de Souza Moura",
    "11966129773",
    "Madrock Drone Black",
    "43",
    "https://drive.google.com/open?id=1KwWE6wpPgH-tZrx_IV0ApjoWafljrxCN",
    " ",
    " ",
    " ",
    " ",
    " ",
    " ",
  ];
  const order = parseOrderRow(row, 75);
  assert.equal(order.status, "RECEBIDO");
  assert.equal(order.statusInferred, true);
  assert.equal(order.detail, "");
  assert.equal(order.formId, "74");
});

test("status com espacos extras nas bordas ainda e reconhecido", () => {
  const row = [
    "3",
    "04/12/2025 16:16:54",
    "Caliel",
    "",
    "La Sportiva - Theory",
    "37 Eu",
    "https://drive.google.com/open?id=1MzDsZ2p-InBOyNrMmjIxo8yr5R7aFpTM",
    "Se não valer a pena ressolar, faço um vaso de flor",
    " ENTREGUE - NÃO PAGA ",
    "0",
    "2026-03-11",
    "",
    "",
  ];
  const order = parseOrderRow(row, 4);
  assert.equal(order.status, "ENTREGUE - NÃO PAGA");
  assert.equal(order.price, 0); // preco 0 e valido, nao deve ser confundido com "sem preco"
  assert.ok(order.deliveryDate);
});
