import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDropoffLabel, DROPOFF_LOCATIONS, DEFAULT_DROPOFF_SLUG } from "../src/shared/dropoffLocations.js";

test("resolve o slug conhecido pro rotulo completo", () => {
  assert.equal(resolveDropoffLabel("vila-madalena"), DROPOFF_LOCATIONS["vila-madalena"]);
});

test("e' case-insensitive e ignora espacos (QR code digitado a mao, por exemplo)", () => {
  assert.equal(resolveDropoffLabel(" Vila-Madalena "), DROPOFF_LOCATIONS["vila-madalena"]);
});

test("cai no rotulo padrao quando o slug e' desconhecido, nulo ou vazio", () => {
  const fallback = DROPOFF_LOCATIONS[DEFAULT_DROPOFF_SLUG];
  assert.equal(resolveDropoffLabel("caixa-que-nao-existe"), fallback);
  assert.equal(resolveDropoffLabel(null), fallback);
  assert.equal(resolveDropoffLabel(undefined), fallback);
  assert.equal(resolveDropoffLabel(""), fallback);
});
