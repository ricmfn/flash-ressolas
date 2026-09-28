import { api, type ExpensesResponse } from "../api/client.js";
import { formatBRL } from "../../shared/currency.js";
import { parseFlexibleDate } from "../../shared/dates.js";
import { EXPENSE_CATEGORIES, VARIABLE_EXPENSE_CATEGORIES } from "../../shared/metrics.js";
import { el, clear } from "../ui/dom.js";

interface ExpensesViewHandle {
  root: HTMLElement;
  refresh: () => Promise<void>;
}

/** Sentinela do <select> pra "categoria fora da lista fechada" — nunca é gravado como
 * categoria de verdade (o texto digitado ao lado é que vira a categoria). */
const OTHER_CATEGORY = "__OUTRA__";

function statCard(label: string, value: string): HTMLElement {
  return el("div", { class: "stat-card" }, [
    el("span", { class: "stat-card__label" }, [label]),
    el("strong", { class: "stat-card__value" }, [value]),
  ]);
}

/** Mesma logica de classificacao usada no servidor (ver computeProfitability em
 * shared/metrics.ts): classificacao explicita da linha tem prioridade; linhas antigas sem
 * ela (gravadas antes dessa coluna existir) caem no fallback por nome de categoria. */
function isVariable(row: { category: string; classification: "Fixo" | "Variável" | null }): boolean {
  return row.classification !== null ? row.classification === "Variável" : VARIABLE_EXPENSE_CATEGORIES.has(row.category);
}

function todayBR(): string {
  return new Date().toLocaleDateString("pt-BR");
}

export function renderExpensesView(container: Element): ExpensesViewHandle {
  let data: ExpensesResponse | null = null;
  let loading = true;
  let error: string | null = null;

  // ---------- Formulário "adicionar despesa" ----------
  let formOpen = false;
  let formSaving = false;
  let formError: string | null = null;
  let draft = {
    date: todayBR(),
    category: EXPENSE_CATEGORIES[0] as string,
    otherCategory: "",
    otherClassification: "Fixo" as "Fixo" | "Variável",
    description: "",
    value: "",
  };

  const root = el("div", { class: "expenses-view" });
  container.appendChild(root);

  function resetDraft(): void {
    draft = {
      date: todayBR(),
      category: EXPENSE_CATEGORIES[0] as string,
      otherCategory: "",
      otherClassification: "Fixo",
      description: "",
      value: "",
    };
  }

  function render(): void {
    clear(root);

    if (loading && !data) {
      root.appendChild(el("div", { class: "state-banner state-banner--loading" }, ["Carregando despesas…"]));
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

    // Mais recente primeiro. Linha sem data valida (investimento legado sem data exata)
    // vai pro final, em vez de bagunçar a ordenação das que têm data real.
    const ordered = [...data.rows].sort((a, b) => {
      const da = parseFlexibleDate(a.date);
      const db = parseFlexibleDate(b.date);
      if (da && db) return db.getTime() - da.getTime();
      if (da) return -1;
      if (db) return 1;
      return 0;
    });

    let totalFixo = 0;
    let totalVariavel = 0;
    for (const row of data.rows) {
      if (row.value === null) continue;
      if (isVariable(row)) totalVariavel += row.value;
      else totalFixo += row.value;
    }

    root.appendChild(
      el("section", { class: "dashboard-section" }, [
        el("h2", {}, ["Despesas"]),
        el("div", { class: "stat-grid" }, [
          statCard("Total", formatBRL(data.total)),
          statCard("Custo fixo", formatBRL(totalFixo)),
          statCard("Custo variável", formatBRL(totalVariavel)),
        ]),
      ]),
    );

    root.appendChild(
      el("section", { class: "dashboard-section" }, [
        el("h2", {}, ["Lançamentos"]),
        ordered.length === 0
          ? el("p", { class: "state-banner state-banner--empty" }, ["Nenhuma despesa registrada ainda."])
          : el("table", { class: "weeks-table expenses-table" }, [
              el("thead", {}, [
                el("tr", {}, [
                  el("th", {}, ["Data"]),
                  el("th", {}, ["Categoria"]),
                  el("th", {}, ["Descrição"]),
                  el("th", {}, ["Valor"]),
                  el("th", {}, ["Classificação"]),
                ]),
              ]),
              el(
                "tbody",
                {},
                ordered.map((row) =>
                  el("tr", {}, [
                    el("td", {}, [row.date || "—"]),
                    el("td", {}, [row.category || "—"]),
                    el("td", { class: "expenses-table__description" }, [row.description || "—"]),
                    el("td", {}, [formatBRL(row.value)]),
                    el("td", {}, [row.classification ?? (isVariable(row) ? "Variável" : "Fixo")]),
                  ]),
                ),
              ),
            ]),
      ]),
    );

    // ---------- Adicionar despesa ----------
    const isOther = draft.category === OTHER_CATEGORY;
    root.appendChild(
      el("section", { class: "dashboard-section" }, [
        el("h2", {}, ["Adicionar despesa"]),
        formOpen
          ? el("div", { class: "rubber-form" }, [
              el("div", { class: "rubber-form__grid" }, [
                el("label", { class: "rubber-form__field" }, [
                  el("span", {}, ["Data"]),
                  el("input", {
                    type: "text",
                    value: draft.date,
                    oninput: (ev) => (draft.date = (ev.target as HTMLInputElement).value),
                  }),
                ]),
                el("label", { class: "rubber-form__field" }, [
                  el("span", {}, ["Categoria *"]),
                  el(
                    "select",
                    {
                      onchange: (ev) => {
                        draft.category = (ev.target as HTMLSelectElement).value;
                        render();
                      },
                    },
                    [
                      ...EXPENSE_CATEGORIES.map((cat) =>
                        el("option", { value: cat, selected: draft.category === cat }, [cat]),
                      ),
                      el("option", { value: OTHER_CATEGORY, selected: draft.category === OTHER_CATEGORY }, ["Outra…"]),
                    ],
                  ),
                ]),
                isOther
                  ? el("label", { class: "rubber-form__field" }, [
                      el("span", {}, ["Qual categoria?"]),
                      el("input", {
                        type: "text",
                        value: draft.otherCategory,
                        oninput: (ev) => (draft.otherCategory = (ev.target as HTMLInputElement).value),
                      }),
                    ])
                  : null,
                isOther
                  ? el("label", { class: "rubber-form__field" }, [
                      el("span", {}, ["Esse custo é fixo ou variável?"]),
                      el(
                        "select",
                        {
                          onchange: (ev) => {
                            draft.otherClassification = (ev.target as HTMLSelectElement).value as "Fixo" | "Variável";
                          },
                        },
                        [
                          el("option", { value: "Fixo", selected: draft.otherClassification === "Fixo" }, ["Fixo"]),
                          el("option", { value: "Variável", selected: draft.otherClassification === "Variável" }, [
                            "Variável",
                          ]),
                        ],
                      ),
                    ])
                  : null,
                el("label", { class: "rubber-form__field" }, [
                  el("span", {}, ["Valor (R$) *"]),
                  el("input", {
                    type: "text",
                    value: draft.value,
                    oninput: (ev) => (draft.value = (ev.target as HTMLInputElement).value),
                  }),
                ]),
              ]),
              el("label", { class: "rubber-form__field rubber-form__field--wide" }, [
                el("span", {}, ["Descrição *"]),
                el("textarea", {
                  rows: "2",
                  value: draft.description,
                  oninput: (ev) => (draft.description = (ev.target as HTMLTextAreaElement).value),
                }),
              ]),
              formError ? el("p", { class: "percent-editor__error" }, [formError]) : null,
              el("div", { class: "rubber-form__actions" }, [
                el(
                  "button",
                  {
                    class: "btn btn--primary",
                    disabled: formSaving,
                    onclick: async () => {
                      const category = isOther ? draft.otherCategory.trim() : draft.category;
                      if (!category) {
                        formError = "Informe a categoria da despesa.";
                        render();
                        return;
                      }
                      if (!draft.description.trim()) {
                        formError = "Informe a descrição da despesa.";
                        render();
                        return;
                      }
                      if (draft.value.trim() === "") {
                        formError = "Informe o valor da despesa.";
                        render();
                        return;
                      }
                      const value = Number(draft.value.replace(",", "."));
                      if (!Number.isFinite(value) || value < 0) {
                        formError = "Valor inválido.";
                        render();
                        return;
                      }
                      formSaving = true;
                      formError = null;
                      render();
                      const res = await api.addExpense({
                        date: draft.date.trim(),
                        category,
                        description: draft.description.trim(),
                        value,
                        classification: isOther ? draft.otherClassification : undefined,
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
                  ["Salvar despesa"],
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
              ["+ Nova despesa"],
            ),
      ]),
    );
  }

  async function refresh(): Promise<void> {
    loading = true;
    render();
    const res = await api.expenses();
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
