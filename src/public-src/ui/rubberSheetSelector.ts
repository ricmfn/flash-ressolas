import type { RubberSheetJSON } from "../api/client.js";
import { el, clear } from "./dom.js";

interface RubberSheetSelectorOptions {
  sheets: RubberSheetJSON[];
  /** Chave = sheetRowIndex da folha (como string); valor = quantos pedidos usam ela hoje —
   * mostrado junto de cada opção pra já dar uma ideia de "quantos pares essa folha já
   * fez" enquanto o Ricardo escolhe. */
  pairsPerRubberSheet: Record<string, number>;
  currentRubberSheetRowIndex: number | null;
  onSave: (rubberSheetRowIndex: number | null) => Promise<{ ok: boolean; error?: string }>;
}

function sheetLabel(sheet: RubberSheetJSON, pairsPerRubberSheet: Record<string, number>): string {
  const parts = [sheet.brand || "Sem marca"];
  if (sheet.supplier) parts.push(sheet.supplier);
  if (sheet.date) parts.push(sheet.date);
  let label = parts.join(" — ");
  if (sheet.percentRemaining !== null) label += ` (${sheet.percentRemaining}%${sheet.percentRemaining === 0 ? " — zerada" : ""})`;
  const count = pairsPerRubberSheet[sheet.sheetRowIndex] ?? 0;
  if (count > 0) label += ` · ${count} par${count === 1 ? "" : "es"}`;
  return label;
}

/**
 * Seletor de "qual folha de borracha foi usada nesse par" no card do pedido. Um <select>
 * nativo (em vez de um menu customizado tipo o de status): a lista de folhas pode crescer
 * bastante com o tempo, e o <select> do navegador já resolve busca/scroll/acessibilidade
 * de graça. Salva direto ao trocar (sem botão "Salvar" separado) — se falhar, volta pro
 * valor anterior e mostra o erro, nunca finge que salvou.
 */
export function createRubberSheetSelector(options: RubberSheetSelectorOptions): HTMLElement {
  let saving = false;
  let error: string | null = null;
  let currentValue = options.currentRubberSheetRowIndex;

  const container = el("div", { class: "rubber-sheet-selector" });

  function render(): void {
    clear(container);

    // Folhas ainda em uso (ou sem % informado) primeiro, na ordem em que foram compradas;
    // zeradas por último — mesmo critério da aba Borrachas, pra achar rápido a folha atual.
    const active = options.sheets.filter((s) => s.percentRemaining !== 0);
    const finished = options.sheets.filter((s) => s.percentRemaining === 0);
    const ordered = [...active, ...finished];

    const select = el(
      "select",
      {
        class: "rubber-sheet-selector__select",
        disabled: saving,
        onchange: async (ev) => {
          const raw = (ev.target as HTMLSelectElement).value;
          const next = raw === "" ? null : Number(raw);
          const previous = currentValue;
          currentValue = next;
          saving = true;
          error = null;
          render();
          const result = await options.onSave(next);
          saving = false;
          if (!result.ok) {
            currentValue = previous; // nunca finge que salvou: volta pro valor anterior
            error = result.error ?? "Não foi possível salvar a folha usada.";
          }
          render();
        },
      },
      [
        el("option", { value: "", selected: currentValue === null }, ["— nenhuma folha selecionada —"]),
        ...ordered.map((sheet) =>
          el("option", { value: String(sheet.sheetRowIndex), selected: currentValue === sheet.sheetRowIndex }, [
            sheetLabel(sheet, options.pairsPerRubberSheet),
          ]),
        ),
      ],
    );

    const children: (Node | string | null)[] = [select];
    if (saving) children.push(el("span", { class: "rubber-sheet-selector__hint" }, ["salvando…"]));
    // Lista vazia quase sempre significa que a busca da aba Borrachas falhou ou ainda não
    // chegou (nunca que não há folhas cadastradas — a aba raramente fica vazia de verdade).
    // Sem essa pista, o seletor parece "funcionar" mas nunca mostra nenhuma opção real, o
    // que é justamente confuso demais pra descobrir sozinho.
    if (!saving && ordered.length === 0) {
      children.push(
        el("span", { class: "rubber-sheet-selector__hint" }, [
          "Nenhuma folha carregada — toque em \"Atualizar / Sincronizar\" no topo da tela.",
        ]),
      );
    }
    if (error) children.push(el("p", { class: "rubber-sheet-selector__error" }, [error]));

    container.appendChild(el("div", { class: "rubber-sheet-selector__panel" }, children));
  }

  render();
  return container;
}
