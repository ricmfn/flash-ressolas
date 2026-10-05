import { el } from "./dom.js";
import { formatBRL } from "../../shared/currency.js";
import type { CostBreakdown } from "../../shared/metrics.js";

/**
 * Janela que abre ao clicar em "Custo fixo por par"/"Custo variável por par" no Dashboard:
 * mostra, categoria por categoria, os lançamentos REAIS que compõem aquele grupo (descrição
 * de cada um, exatamente como lançado — nunca um texto genérico inventado) e a % que cada
 * categoria representa do custo total por par (fixo + variável somados). Mesmo padrão de
 * overlay do photoViewer.ts (fecha no X, no Escape, ou clicando fora do cartão).
 */
export function openCostBreakdownModal(title: string, subtitle: string, breakdown: CostBreakdown): void {
  const card = el("div", { class: "cost-modal__card", role: "document" }, [
    el("div", { class: "cost-modal__header" }, [
      el("h2", { class: "cost-modal__title" }, [title]),
      el("button", {
        class: "cost-modal__close",
        "aria-label": "Fechar",
        onclick: () => close(),
      }, ["✕"]),
    ]),
    el("p", { class: "cost-modal__subtitle" }, [subtitle]),
    breakdown.categories.length === 0
      ? el("p", { class: "state-banner state-banner--empty" }, ["Nenhum lançamento nesse grupo ainda."])
      : el(
          "div",
          { class: "cost-modal__categories" },
          breakdown.categories.map((cat) =>
            el("div", { class: "cost-modal__category" }, [
              el("div", { class: "cost-modal__category-head" }, [
                el("strong", {}, [cat.category]),
                el("span", { class: "cost-modal__category-pct" }, [
                  cat.pctOfTotalCost !== null
                    ? `${cat.pctOfTotalCost.toFixed(1)}% do custo total por par`
                    : "—",
                ]),
              ]),
              el("div", { class: "cost-modal__category-total" }, [formatBRL(cat.total)]),
              el(
                "ul",
                { class: "cost-modal__items" },
                cat.items.map((item) =>
                  el("li", { class: "cost-modal__item" }, [
                    el("span", { class: "cost-modal__item-desc" }, [item.description]),
                    el("span", { class: "cost-modal__item-value" }, [formatBRL(item.value)]),
                  ]),
                ),
              ),
            ]),
          ),
        ),
  ]);

  const overlay = el("div", { class: "cost-modal", role: "dialog", "aria-modal": "true" }, [card]);

  function close(): void {
    overlay.remove();
    document.removeEventListener("keydown", onKeyDown);
  }

  function onKeyDown(ev: KeyboardEvent): void {
    if (ev.key === "Escape") close();
  }

  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) close();
  });
  document.addEventListener("keydown", onKeyDown);

  document.body.appendChild(overlay);
}
