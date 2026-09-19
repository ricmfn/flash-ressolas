import { api, type DashboardResponse, type ExpensesResponse, type ProfitabilityResponse } from "../api/client.js";
import { formatBRL } from "../../shared/currency.js";
import { el, clear } from "../ui/dom.js";

interface DashboardViewHandle {
  root: HTMLElement;
  refresh: () => Promise<void>;
}

const MONTH_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function monthLabel(monthISO: string): string {
  const [year, month] = monthISO.split("-");
  const abbr = MONTH_ABBR[Number(month) - 1] ?? month;
  return `${abbr}/${(year ?? "").slice(2)}`;
}

function courtesyBarChart(dashboard: DashboardResponse): SVGSVGElement {
  const width = 560;
  const height = 180;
  const padding = 24;
  const months = dashboard.courtesyMonthly;
  const maxCount = Math.max(1, ...months.map((m) => m.count));
  const barWidth = (width - padding * 2) / months.length - 8;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "week-chart");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Cortesias por mês, últimos 6 meses");

  months.forEach((m, i) => {
    const barHeight = ((height - padding * 2) * m.count) / maxCount;
    const x = padding + i * ((width - padding * 2) / months.length);
    const y = height - padding - barHeight;

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(y));
    rect.setAttribute("width", String(Math.max(4, barWidth)));
    rect.setAttribute("height", String(Math.max(0, barHeight)));
    rect.setAttribute("class", "week-chart__bar");
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${monthLabel(m.monthISO)}: ${m.count} cortesia(s)`;
    rect.appendChild(title);
    svg.appendChild(rect);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(x + barWidth / 2));
    label.setAttribute("y", String(height - 6));
    label.setAttribute("class", "week-chart__label");
    label.textContent = monthLabel(m.monthISO);
    svg.appendChild(label);
  });

  return svg;
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

function monthlyRevenuePanel(
  dashboard: DashboardResponse,
  selectedMonthIndex: number,
  onSelectIndex: (index: number) => void,
): HTMLElement {
  const months = dashboard.monthlyRevenue;
  const index = Math.min(Math.max(selectedMonthIndex, 0), months.length - 1);
  const month = months[index];
  if (!month) {
    return el("p", { class: "state-banner state-banner--empty" }, ["Sem histórico de faturamento ainda."]);
  }

  const canGoPrev = index > 0;
  const canGoNext = index < months.length - 1;

  return el("div", { class: "month-revenue-panel" }, [
    el("div", { class: "month-nav" }, [
      el(
        "button",
        {
          class: "btn btn--ghost month-nav__btn",
          disabled: !canGoPrev,
          onclick: () => onSelectIndex(index - 1),
        },
        ["◀ Mês anterior"],
      ),
      el("strong", { class: "month-nav__label" }, [monthLabel(month.monthISO)]),
      el(
        "button",
        {
          class: "btn btn--ghost month-nav__btn",
          disabled: !canGoNext,
          onclick: () => onSelectIndex(index + 1),
        },
        ["Próximo mês ▶"],
      ),
    ]),
    el("div", { class: "stat-grid" }, [
      statCardPlain("Faturamento do mês", formatBRL(month.revenue)),
      statCardPlain("Pedidos pagos no mês", String(month.orders)),
    ]),
    el("table", { class: "weeks-table" }, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", {}, ["Semana"]),
          el("th", {}, ["Pedidos"]),
          el("th", {}, ["Faturamento"]),
        ]),
      ]),
      el(
        "tbody",
        {},
        month.weeks.map((w) =>
          el("tr", {}, [
            el("td", {}, [w.label]),
            el("td", {}, [String(w.orders)]),
            el("td", {}, [formatBRL(w.revenue)]),
          ]),
        ),
      ),
    ]),
  ]);
}

function formatPct(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(1)}%`;
}

function profitabilityMonthlyTable(profitability: ProfitabilityResponse): HTMLElement {
  // Mostra so os meses que ja tiveram faturamento ou despesa, do mais recente pro mais
  // antigo — os ultimos 12 meses inteiros ficariam quase todos vazios no inicio do negocio.
  const monthsWithData = profitability.monthly.filter((m) => m.revenue !== 0 || m.expenses !== 0);
  const months = (monthsWithData.length > 0 ? monthsWithData : profitability.monthly).slice().reverse();

  return el("table", { class: "weeks-table" }, [
    el("thead", {}, [
      el("tr", {}, [
        el("th", {}, ["Mês"]),
        el("th", {}, ["Faturamento"]),
        el("th", {}, ["Despesas"]),
        el("th", {}, ["Lucro"]),
      ]),
    ]),
    el(
      "tbody",
      {},
      months.map((m) =>
        el("tr", {}, [
          el("td", {}, [monthLabel(m.monthISO)]),
          el("td", {}, [formatBRL(m.revenue)]),
          el("td", {}, [formatBRL(m.expenses)]),
          el("td", { class: m.profit < 0 ? "profit-negative" : "profit-positive" }, [formatBRL(m.profit)]),
        ]),
      ),
    ),
  ]);
}

function statCardPlain(label: string, value: string): HTMLElement {
  return el("div", { class: "stat-card" }, [
    el("span", { class: "stat-card__label" }, [label]),
    el("strong", { class: "stat-card__value" }, [value]),
  ]);
}

export function renderDashboardView(container: Element): DashboardViewHandle {
  let dashboard: DashboardResponse | null = null;
  let expenses: ExpensesResponse | null = null;
  let profitability: ProfitabilityResponse | null = null;
  let loading = true;
  let error: string | null = null;
  // Indice selecionado dentro de dashboard.monthlyRevenue (historico de faturamento mensal).
  // null = ainda nao inicializado; sera ajustado para o ultimo mes (atual) no primeiro render com dados.
  let selectedMonthIndex: number | null = null;

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

    if (selectedMonthIndex === null && dashboard.monthlyRevenue.length > 0) {
      selectedMonthIndex = dashboard.monthlyRevenue.length - 1; // mes atual por padrao
    }

    // ---------- Pedidos ----------
    root.appendChild(
      el("section", { class: "dashboard-section" }, [
        el("h2", {}, ["Pedidos"]),
        el("div", { class: "stat-grid" }, [
          statCard("Total de pedidos", String(dashboard.totalOrders)),
          statCard("Pendentes", String(dashboard.pendingCount)),
          statCard("Aguardando sapatilha", String(dashboard.awaitingDropoffCount)),
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

    // ---------- Faturamento mensal (historico semanal e mensal) ----------
    root.appendChild(
      el("section", { class: "dashboard-section" }, [
        el("h2", {}, ["Faturamento mensal"]),
        monthlyRevenuePanel(dashboard, selectedMonthIndex ?? 0, (index) => {
          selectedMonthIndex = index;
          render();
        }),
      ]),
    );

    // ---------- Cortesias ----------
    root.appendChild(
      el("section", { class: "dashboard-section" }, [
        el("h2", {}, ["Cortesias"]),
        el("div", { class: "stat-grid" }, [
          statCard("Cortesias este mês", String(dashboard.courtesyThisMonth)),
        ]),
        courtesyBarChart(dashboard),
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

    // ---------- Rentabilidade e custo por par ----------
    if (profitability) {
      const hasPairs = profitability.pairsDelivered > 0;
      root.appendChild(
        el("section", { class: "dashboard-section" }, [
          el("h2", {}, ["Rentabilidade"]),
          el("div", { class: "stat-grid" }, [
            statCard("Faturamento total", formatBRL(profitability.totalRevenue)),
            statCard("Despesas totais", formatBRL(profitability.totalExpenses)),
            statCard(
              "Lucro acumulado",
              formatBRL(profitability.profit),
              `margem: ${formatPct(profitability.marginPct)}`,
            ),
            statCard("Pares entregues e pagos", String(profitability.pairsDelivered)),
          ]),
          el("h3", { class: "dashboard-subheading" }, ["Custo por par ressolado"]),
          el("div", { class: "stat-grid" }, [
            statCard(
              "Custo variável por par (só material)",
              hasPairs ? formatBRL(profitability.variableCostPerPair) : "—",
              hasPairs ? undefined : "ainda sem pares entregues e pagos",
            ),
            statCard(
              "Custo total por par (tudo incluso, até agora)",
              hasPairs ? formatBRL(profitability.totalCostPerPair) : "—",
              hasPairs
                ? "inclui equipamento, treinamento e transporte, diluídos pelos pares feitos até agora"
                : "ainda sem pares entregues e pagos",
            ),
          ]),
          el("h3", { class: "dashboard-subheading" }, ["Rentabilidade por mês"]),
          profitabilityMonthlyTable(profitability),
        ]),
      );
    }
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
    const [dashRes, expRes, profRes] = await Promise.all([api.dashboard(), api.expenses(), api.profitability()]);
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
    if (profRes.ok) {
      profitability = profRes.data;
    }
    render();
  }

  render();
  void refresh();

  return { root, refresh };
}
