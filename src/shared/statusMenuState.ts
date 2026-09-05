import type { OrderStatus } from "./status.js";

/**
 * Maquina de estados do menu de status de um pedido. Regra de negocio central: escolher
 * uma opcao NUNCA salva nem fecha o menu sozinho — so a acao explicita "requestSave"
 * dispara a gravacao, e so "saveSucceeded" fecha o menu. Isolado como funcao pura para
 * poder ser testado sem UI.
 */
export interface StatusMenuState {
  open: boolean;
  selected: OrderStatus | null;
  saving: boolean;
  error: string | null;
}

export type StatusMenuAction =
  | { type: "open"; currentStatus: OrderStatus }
  | { type: "select"; status: OrderStatus }
  | { type: "cancel" }
  | { type: "requestSave" }
  | { type: "saveSucceeded" }
  | { type: "saveFailed"; error: string };

export function initialStatusMenuState(): StatusMenuState {
  return { open: false, selected: null, saving: false, error: null };
}

export function statusMenuReducer(state: StatusMenuState, action: StatusMenuAction): StatusMenuState {
  switch (action.type) {
    case "open":
      return { open: true, selected: action.currentStatus, saving: false, error: null };
    case "select":
      // Selecionar SO atualiza a escolha em memoria. Menu continua aberto, nada e salvo.
      return { ...state, selected: action.status, error: null };
    case "cancel":
      return initialStatusMenuState();
    case "requestSave":
      if (!state.selected) return state; // nada selecionado, nao ha o que salvar
      return { ...state, saving: true, error: null };
    case "saveSucceeded":
      return initialStatusMenuState();
    case "saveFailed":
      // Em erro o menu permanece ABERTO para o usuario tentar de novo.
      return { ...state, saving: false, error: action.error };
    default:
      return state;
  }
}
