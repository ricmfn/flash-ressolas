import { api, type RubberResponse } from "../api/client.js";
import { formatBRL } from "../../shared/currency.js";
import { el, clear } from "../ui/dom.js";
import { createPercentEditor } from "../ui/percentEditor.js";

interface RubberViewHandle {
  root: HTMLElement;
  refresh: () => Promise<void>;
}

function statCard(label: string, value: string): HTMLElement {
  return el("div", { class: "stat-card" }, [
    el("span", { class: "stat-card__label" }, [label]),
    el("strong", { class: "stat-card__value" }, [value]),
  ]);
}

export function renderRubberView(container: Element): RubberViewHandle {
  let data: RubberResponse | null = null;
  let loading = true;
  let error: string | null = null;

  // ---------- Formulário "adicionar folha" ----------
  let formOpen = false;
  let formSaving = false;
  let formError: string | null = null;
  let draft = { date: "", brand: "", supplier: "", value: "", percentRemaining: "100", notes: "" };

  const root = el("div", { class: "rubber-view" });
  container.appendChild(root);

  function resetDraft(): void {
    draft = { date: "", brand: "", supplier: "", value: "", percentRemaining: "100", notes: "" };
  }

  function render(): void {
    clear(root);

    if (loading && !data) {
      root.appendChild(el("div", { class: "state-banner state-banner--loading" }, ["Carregando borrachas…"]));
      return;
    }

    if (error && !data) {
      root.appendChild(
        el("div", { class: "state-banner state-banner--error" }, [
          el("p", {}, [error]),
          el("button", { class: "btn btn--primary", onclick: () => void refresh() }, ["Tentar novamente"]),
        ]),
      );
      return;
    }

    if (!data) return;

    root.appendChild(
      el("section", { class: "dashboard-section" }, [
        el("h2", {}, ["Estoque de borracha"]),
        el("div", { class: "stat-grid" }, [
          statCard("Investido em borracha", formatBRL(data.totalInvested)),
          statCard("Folhas em uso", String(data.activeCount)),
          statCard("Folhas zeradas", String(data.finishedCount)),
        ]),
      ]),
    );

    // Folhas ainda em uso (ou sem % informado) primeiro; zeradas (0%) no final.
    const active = data.sheets.filter((s) => s.percentRemaining !== 0);
    const finished = data.sheets.filter((s) => s.percentRemaining === 0);
    const ordered = [...active, ...finished];

    root.appendChild(
      el("section", { class: "dashboard-section" }, [
        el("h2", {}, ["Folhas"]),
        data.sheets.length === 0
          ? el("p", { class: "state-banner state-banner--empty" }, ["Nenhuma folha registrada ainda."])
          : el("table", { class: "weeks-table rubber-table" }, [
              el("thead", {}, [
                el("tr", {}, [
                  el("th", {}, ["Marca"]),
                  el("th", {}, ["Fornecedor"]),
                  el("th", {}, ["Data"]),
                  el("th", {}, ["Valor"]),
                  el("th", {}, ["% restante"]),
                  el("th", {}, ["Observações"]),
                ]),
              ]),
              el(
                "tbody",
                {},
                ordered.map((sheet) =>
                  el("tr", { class: sheet.percentRemaining === 0 ? "rubber-row--finished" : "" }, [
                    el("td", {}, [sheet.brand || "—"]),
                    el("td", {}, [sheet.supplier || "—"]),
                    el("td", {}, [sheet.date || "—"]),
                    el("td", {}, [formatBRL(sheet.value)]),
                    el("td", {}, [
                      createPercentEditor({
                        currentPercent: sheet.percentRemaining,
                        onSave: async (percent) => {
                          const res = await api.updateRubberPercent(sheet.sheetRowIndex, percent);
                          if (res.ok) {
                            data = res.data;
                            render();
                            return { ok: true };
                          }
                          return { ok: false, error: res.error };
                        },
                      }),
                    ]),
                    el("td", { class: "rubber-table__notes" }, [sheet.notes || "—"]),
                  ]),
                ),
              ),
            ]),
      ]),
    );

    // ---------- Adicionar folha ----------
    root.appendChild(
      el("section", { class: "dashboard-section" }, [
        el("h2", {}, ["Adicionar folha"]),
        formOpen
          ? el("div", { class: "rubber-form" }, [
              el("div", { class: "rubber-form__grid" }, [
                labeledInput("Marca/tipo *", draft.brand, (v) => (draft.brand = v)),
                labeledInput("Fornecedor", draft.supplier, (v) => (draft.supplier = v)),
                labeledInput("Data (ex: 15/09/2026)", draft.date, (v) => (draft.date = v)),
                labeledInput("Valor (R$)", draft.value, (v) => (draft.value = v)),
                labeledInput("% restante inicial", draft.percentRemaining, (v) => (draft.percentRemaining = v)),
              ]),
              labeledTextarea("Observações", draft.notes, (v) => (draft.notes = v)),
              formError ? el("p", { class: "percent-editor__error" }, [formError]) : null,
              el("div", { class: "rubber-form__actions" }, [
                el(
                  "button",
                  {
                    class: "btn btn--primary",
                    disabled: formSaving,
                    onclick: async () => {
                      if (!draft.brand.trim()) {
                        formError = "Informe a marca/tipo da borracha.";
                        render();
                        return;
                      }
                      formSaving = true;
                      formError = null;
                      render();
                      const res = await api.addRubberSheet({
                        date: draft.date,
                        brand: draft.brand,
                        supplier: draft.supplier,
                        value: draft.value.trim() === "" ? null : Number(draft.value.replace(",", ".")),
                        percentRemaining:
                          draft.percentRemaining.trim() === ""
                            ? null
                            : Number(draft.percentRemaining.replace(",", ".")),
                        notes: draft.notes,
                      });
                      formSaving = false;
                      if (res.ok) {
                        data = res.data;
                        formOpen = false;
                        resetDraft();
                        render();
                      } else {
                        formError = res.error;
                        render();
                      }
                    },
                  },
                  ["Salvar folha"],
                ),
                el(
                  "button",
                  {
                    class: "btn btn--ghost",
                    disabled: formSaving,
                    onclick: () => {
                      formOpen = false;
                      formError = null;
                      resetDraft();
                      render();
                    },
                  },
                  ["Cancelar"],
                ),
              ]),
            ])
          : el(
              "button",
              {
                class: "btn btn--primary",
                onclick: () => {
                  formOpen = true;
                  render();
                },
              },
              ["+ Nova folha"],
            ),
      ]),
    );
  }

  function labeledInput(label: string, value: string, onChange: (v: string) => void): HTMLElement {
    return el("label", { class: "rubber-form__field" }, [
      el("span", {}, [label]),
      el("input", {
        type: "text",
        value,
        oninput: (ev) => onChange((ev.target as HTMLInputElement).value),
      }),
    ]);
  }

  function labeledTextarea(label: string, value: string, onChange: (v: string) => void): HTMLElement {
    return el("label", { class: "rubber-form__field rubber-form__field--wide" }, [
      el("span", {}, [label]),
      el("textarea", {
        rows: "2",
        value,
        oninput: (ev) => onChange((ev.target as HTMLTextAreaElement).value),
      }),
    ]);
  }

  async function refresh(): Promise<void> {
    loading = true;
    render();
    const res = await api.rubber();
    loading = false;
    if (res.ok) {
      data = res.data;
      error = null;
    } else {
      error = res.error;
    }
    render();
  }

  render();
  void refresh();

  return { root, refresh };
}
