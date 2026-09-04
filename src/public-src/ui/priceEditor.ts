import { formatBRL } from "../../shared/currency.js";
import { el, clear } from "./dom.js";

interface PriceEditorOptions {
  currentPrice: number | null;
  onSave: (rawValue: string) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * Edicao inline do preco final. Aceita formatos BR (R$ 280,00 / 280,00 / 280.00 / 1.234,50),
 * rejeita "?"/data/texto sem nunca zerar silenciosamente — o erro fica visivel ate o
 * usuario corrigir ou cancelar.
 */
export function createPriceEditor(options: PriceEditorOptions): HTMLElement {
  let editing = false;
  let saving = false;
  let error: string | null = null;
  let draft = options.currentPrice !== null ? String(options.currentPrice).replace(".", ",") : "";

  const container = el("div", { class: "price-editor" });

  function render(): void {
    clear(container);

    if (!editing) {
      container.appendChild(
        el(
          "button",
          {
            class: "price-editor__display",
            onclick: () => {
              editing = true;
              error = null;
              draft = options.currentPrice !== null ? String(options.currentPrice).replace(".", ",") : "";
              render();
            },
          },
          [formatBRL(options.currentPrice), " ✎"],
        ),
      );
      return;
    }

    const input = el("input", {
      type: "text",
      inputmode: "decimal",
      class: "price-editor__input",
      placeholder: "Ex: 280,00",
      value: draft,
      disabled: saving,
      oninput: (ev) => {
        draft = (ev.target as HTMLInputElement).value;
      },
    }) as HTMLInputElement;

    const children: (Node | string)[] = [input];
    if (error) children.push(el("p", { class: "price-editor__error" }, [error]));

    children.push(
      el("div", { class: "price-editor__actions" }, [
        el(
          "button",
          {
            class: "btn btn--primary",
            disabled: saving,
            onclick: async () => {
              saving = true;
              error = null;
              render();
              const result = await options.onSave(draft);
              saving = false;
              if (result.ok) {
                editing = false;
                render();
              } else {
                // Nunca fecha nem zera o campo em erro: o usuario ve o motivo e corrige.
                error = result.error ?? "Valor de preço inválido.";
                render();
              }
            },
          },
          ["Salvar"],
        ),
        el(
          "button",
          {
            class: "btn btn--ghost",
            disabled: saving,
            onclick: () => {
              editing = false;
              error = null;
              render();
            },
          },
          ["Cancelar"],
        ),
      ]),
    );

    container.appendChild(el("div", { class: "price-editor__panel" }, children));
    input.focus();
  }

  render();
  return container;
}
