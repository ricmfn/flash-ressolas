import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialStatusMenuState,
  statusMenuReducer,
} from "../src/shared/statusMenuState.js";

test("selecionar um status NAO fecha o menu nem salva", () => {
  let state = initialStatusMenuState();
  state = statusMenuReducer(state, { type: "open", currentStatus: "RECEBIDO" });
  assert.equal(state.open, true);

  state = statusMenuReducer(state, { type: "select", status: "PRONTO" });
  assert.equal(state.open, true); // continua aberto
  assert.equal(state.selected, "PRONTO");
  assert.equal(state.saving, false); // nada foi salvo ainda
});

test("so fecha o menu depois de requestSave + saveSucceeded", () => {
  let state = initialStatusMenuState();
  state = statusMenuReducer(state, { type: "open", currentStatus: "RECEBIDO" });
  state = statusMenuReducer(state, { type: "select", status: "EM_CONSERTO" });
  assert.equal(state.open, true);

  state = statusMenuReducer(state, { type: "requestSave" });
  assert.equal(state.saving, true);
  assert.equal(state.open, true); // ainda aberto enquanto salva

  state = statusMenuReducer(state, { type: "saveSucceeded" });
  assert.equal(state.open, false); // so fecha apos sucesso confirmado
});

test("requestSave sem nada selecionado nao faz nada", () => {
  let state = initialStatusMenuState();
  state = statusMenuReducer(state, { type: "open", currentStatus: "RECEBIDO" });
  const before = state;
  state = statusMenuReducer({ ...state, selected: null }, { type: "requestSave" });
  assert.equal(state.saving, false);
});

test("erro ao salvar mantem o menu aberto para nova tentativa", () => {
  let state = initialStatusMenuState();
  state = statusMenuReducer(state, { type: "open", currentStatus: "RECEBIDO" });
  state = statusMenuReducer(state, { type: "select", status: "PRONTO" });
  state = statusMenuReducer(state, { type: "requestSave" });
  state = statusMenuReducer(state, { type: "saveFailed", error: "rede caiu" });
  assert.equal(state.open, true);
  assert.equal(state.saving, false);
  assert.equal(state.error, "rede caiu");
  assert.equal(state.selected, "PRONTO"); // escolha nao se perde no erro
});

test("cancelar fecha e reseta sem salvar", () => {
  let state = initialStatusMenuState();
  state = statusMenuReducer(state, { type: "open", currentStatus: "RECEBIDO" });
  state = statusMenuReducer(state, { type: "select", status: "CANCELADO" });
  state = statusMenuReducer(state, { type: "cancel" });
  assert.equal(state.open, false);
  assert.equal(state.selected, null);
});
