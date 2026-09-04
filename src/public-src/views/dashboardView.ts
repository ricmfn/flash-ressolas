import { api, type DashboardResponse, type ExpensesResponse } from "../api/client.js";
import { formatBRL } from "../../shared/currency.js";
import { el, clear } from "../ui/dom.js";

interface DashboardViewHandle {
  root: HTMLElement;
  refresh: () => Promise<void>;
}

function weekBarChart(dashboard: DashboardResponse): SVGSVGElement {
  const width = 560;
  const height = 180;
  const padding = 24;
  const weeks = dashboard.weekly;
  const maxOrders = Math.max(1, ...weeks.map((w) => w.orders));
  const barWidth = (width - padding * 2) / weeks.length - 8;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "week-chart");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Pedidos por semana, últimas 8 semanas");

  weeks.forEach((w, i) => {
    const barHeight = ((height - padding * 2) * w.orders) / maxOrders;
    const x = padding + i * ((width - padding * 2) / weeks.length);
    const y = height - padding - barHeight;

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(y));
    rect.setAttribute("width", String(Math.max(4, barWidth)));
    rect.setAttribute("height", String(Math.max(0, barHeight)));
    rect.setAttribute("class", "week-chart__bar");
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${w.weekStartISO}: ${w.orders} pedido(s), ${formatBRL(w.revenue)}`;
    rect.appendChild(title);
    svg.appendChild(rect);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(x + barWidth / 2));
    label.setAttribute("y", String(height - 6));
    label.setAttribute("class", "week-chart__label");
    label.textContent = w.weekStartISO.slice(5); // MM-DD
    svg.appendChild(label);
  });

  return svg;
}

export function renderDashboardView(container: Element): DashboardViewHandle {
  let dashboard: DashboardResponse | null = null;
  let expenses: ExpensesResponse | null = null;
  let loading = true;
  let error: string | null = null;

  const root = el("div", { class: "dashboard-view" });
  container.appendChild(root);

  function render(): void {
    clear(root);

    if (loading && !dashboard) {
      root.appendChild(el("div", { class: "state-banner state-banner--loading" }, ["Carregando dashboard…"]));
      return;
    }

    if (error && !dashboard) {
      root.appendChild(
        el("div", { class: "state-banner state-banner--error" }, [
          el("p", {}, [error]),
          el("button", { class: "btn btn--primary", onclick: () => void refresh() }, ["Tentar novamente"]),
        ]),
      );
      return;
    }

    if (!dashboard) return;

    // ---------- Pedidos ----------
    root.appendChild(
      el("section", { class: "dashboard-section" }, [
        el("h2", {}, ["Pedidos"]),
        el("div", { class: "stat-grid" }, [
          statCard("Total de pedidos", String(dashboard.totalOrders)),
          statCard("Pendentes", String(dashboard.pendingCount)),
          statCard("Entregues", String(dashboard.deliveredCount)),
          statCard(
            "Tempo médio de entrega",
            dashboard.averageDeliveryDays !== null ? `${dashboard.averageDeliveryDays.toFixed(1)} dias` : "—",
          ),
        ]),
      ]),
    );

    // ---------- Faturamento ----------
    const deltaText =
      dashboard.weekComparison.deltaPct === null
        ? "sem semana anterior para comparar"
        : `${dashboard.weekComparison.deltaPct >= 0 ? "+" : ""}${dashboard.weekComparison.deltaPct.toFixed(0)}% vs. semana anterior`;

    root.appendChild(
      el("section", { class: "dashboard-section" }, [
        el("h2", {}, ["Faturamento"]),
        el("div", { class: "stat-grid" }, [
          statCard("Receita total (paga)", formatBRL(dashboard.totalRevenue)),
          statCard("Ticket médio", formatBRL(dashboard.averageTicket)),
          statCard(
            "Esta semana",
            `${dashboard.weekComparison.thisWeek} pedido(s)`,
            deltaText,
          ),
        ]),
        weekBarChart(dashboard),
      ]),
    );

    // ---------- Despesas ----------
    root.appendChild(
      el("section", { class: "dashboard-section" }, [
        el("h2", {}, ["Despesas"]),
        expenses && expenses.rows.length > 0
          ? el("div", {}, [
              el("p", { class: "dashboard-total" }, [`Total: ${formatBRL(expenses.total)}`]),
              el(
                "ul",
                { class: "expense-list" },
                Object.entries(expenses.totalByCategory).map(([cat, val]) =>
                  el("li", {}, [`${cat}: ${formatBRL(val)}`]),
                ),
              ),
            ])
          : el("p", { class: "state-banner state-banner--empty" }, [
              "Nenhuma despesa registrada na aba Financeiro ainda.",
            ]),
      ]),
    );
  }

  function statCard(label: string, value: string, sub?: string): HTMLElement {
    return el("div", { class: "stat-card" }, [
      el("span", { class: "stat-card__label" }, [label]),
      el("strong", { class: "stat-card__value" }, [value]),
      sub ? el("span", { class: "stat-card__sub" }, [sub]) : null,
    ]);
  }

  async function refresh(): Promise<void> {
    loading = true;
    render();
    const [dashRes, expRes] = await Promise.all([api.dashboard(), api.expenses()]);
    loading = false;
    if (dashRes.ok) {
      dashboard = dashRes.data;
      error = null;
    } else {
      error = dashRes.error;
    }
    if (expRes.ok) {
      expenses = expRes.data;
    }
    render();
  }

  render();
  void refresh();

  return { root, refresh };
}
