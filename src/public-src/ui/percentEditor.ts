import { el, clear } from "./dom.js";

interface PercentEditorOptions {
  currentPercent: number | null;
  onSave: (percent: number) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * Edicao inline de um percentual (0-100), no mesmo espirito do createPriceEditor: clique
 * pra editar, nunca fecha nem zera em caso de erro, erro fica visivel ate corrigir ou
 * cancelar.
 */
export function createPercentEditor(options: PercentEditorOptions): HTMLElement {
  let editing = false;
  let saving = false;
  let error: string | null = null;
  let draft = options.currentPercent !== null ? String(options.currentPercent) : "";

  const container = el("div", { class: "percent-editor" });

  function display(): string {
    return options.currentPercent !== null ? `${options.currentPercent}%` : "—";
  }

  function render(): void {
    clear(container);

    if (!editing) {
      container.appendChild(
        el(
          "button",
          {
            class: "percent-editor__display",
            onclick: () => {
              editing = true;
              error = null;
              draft = options.currentPercent !== null ? String(options.currentPercent) : "";
              render();
            },
          },
          [display(), " ✎"],
        ),
      );
      return;
    }

    const input = el("input", {
      type: "number",
      inputmode: "decimal",
      min: "0",
      max: "100",
      step: "1",
      class: "percent-editor__input",
      placeholder: "Ex: 60",
      value: draft,
      disabled: saving,
      oninput: (ev) => {
        draft = (ev.target as HTMLInputElement).value;
      },
    }) as HTMLInputElement;

    const children: (Node | string)[] = [input];
    if (error) children.push(el("p", { class: "percent-editor__error" }, [error]));

    children.push(
      el("div", { class: "percent-editor__actions" }, [
        el(
          "button",
          {
            class: "btn btn--primary",
            disabled: saving,
            onclick: async () => {
              const parsed = Number.parseFloat(draft.replace(",", "."));
              if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
                error = "Informe um número entre 0 e 100.";
                render();
                return;
              }
              saving = true;
              error = null;
              render();
              const result = await options.onSave(parsed);
              saving = false;
              if (result.ok) {
                editing = false;
                render();
              } else {
                error = result.error ?? "Não foi possível salvar.";
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

    container.appendChild(el("div", { class: "percent-editor__panel" }, children));
    input.focus();
  }

  render();
  return container;
}
