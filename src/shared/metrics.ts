import { averageDeliveryDays, parseFlexibleDate } from "./dates.js";
import { isAwaitingDropoff, isDeliveredStatus, isPending } from "./status.js";
import type { Order } from "./types.js";
import type { RubberSheet } from "./rubber.js";

export interface DashboardMetrics {
  totalOrders: number;
  pendingCount: number;
  awaitingDropoffCount: number;
  deliveredCount: number;
  totalRevenue: number;
  averageTicket: number | null;
  averageDeliveryDays: number | null;
  weekly: WeeklyPoint[];
  weekComparison: { thisWeek: number; lastWeek: number; deltaPct: number | null };
  courtesyMonthly: MonthlyCourtesyPoint[];
  courtesyThisMonth: number;
  monthlyRevenue: MonthlyRevenuePoint[];
}

export interface WeeklyPoint {
  weekStartISO: string;
  orders: number;
  revenue: number;
}

export interface MonthlyCourtesyPoint {
  monthISO: string;
  count: number;
}

/** Uma semana DENTRO de um mes especifico (semana 1 = dias 1-7, semana 2 = dias 8-14, ...). */
export interface WeekOfMonthPoint {
  label: string;
  startDay: number;
  endDay: number;
  orders: number;
  revenue: number;
}

export interface MonthlyRevenuePoint {
  monthISO: string;
  orders: number;
  revenue: number;
  weeks: WeekOfMonthPoint[];
}

const COURTESY_STATUS = "ENTREGUE - NÃO PAGA";
/** Quantos meses (incluindo o atual) aparecem no grafico de cortesias do dashboard. */
const COURTESY_MONTHS_WINDOW = 6;
/** Quantos meses (incluindo o atual) ficam disponiveis no historico de faturamento mensal. */
const MONTHLY_REVENUE_MONTHS_WINDOW = 12;
/**
 * Em 05/09/2026 varios pedidos foram atualizados em lote na planilha e todos ficaram com essa
 * MESMA data de entrega, mesmo os que nao foram de fato entregues/pagos nesse dia especifico —
 * entao essa data, quando aparece como data de entrega, e' tratada como nao confiavel para fins
 * de faturamento e o pedido usa a data de ENTRADA (do pedido) em vez dela. Pedidos com qualquer
 * outra data de entrega (de antes ou de depois desse dia) continuam usando a data de entrega
 * normalmente.
 */
const UNRELIABLE_BULK_DELIVERY_DATE_ISO = "2026-09-05";

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isoMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0 = domingo
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

/**
 * Data de referencia usada para atribuir o faturamento de um pedido a um mes/semana: a data de
 * ENTREGA normalmente, com o pedido como reserva se nao houver data de entrega registrada — MAS
 * se a data de entrega for exatamente UNRELIABLE_BULK_DELIVERY_DATE_ISO (a data "carimbada" na
 * atualizacao em lote), usa a data de ENTRADA do pedido em vez dela, pois essa data de entrega
 * especifica nao reflete uma entrega/pagamento real.
 */
export function revenueRefDate(o: Order): Date | null {
  if (o.deliveryDate !== null && isoDate(o.deliveryDate) === UNRELIABLE_BULK_DELIVERY_DATE_ISO) {
    return o.orderedAt;
  }
  return o.deliveryDate ?? o.orderedAt;
}

/**
 * Divide um mes em blocos de 7 dias (semana 1 = dias 1-7, semana 2 = dias 8-14, ...; o
 * ultimo bloco pode ter menos de 7 dias) e soma pedidos ENTREGUE - PAGA em cada bloco,
 * usando revenueRefDate() como data de referencia (ver acima).
 */
function computeWeeksOfMonth(orders: Order[], monthStart: Date): MonthlyRevenuePoint {
  const year = monthStart.getFullYear();
  const monthIndex = monthStart.getMonth();
  const totalDays = daysInMonth(year, monthIndex);
  const monthEnd = new Date(year, monthIndex + 1, 1);

  const paidInMonth = orders.filter((o) => {
    if (o.status !== "ENTREGUE - PAGA" || o.price === null) return false;
    const refDate = revenueRefDate(o);
    return refDate !== null && refDate >= monthStart && refDate < monthEnd;
  });

  const weeks: WeekOfMonthPoint[] = [];
  let monthOrders = 0;
  let monthRevenue = 0;
  for (let startDay = 1; startDay <= totalDays; startDay += 7) {
    const endDay = Math.min(startDay + 6, totalDays);
    const inWeek = paidInMonth.filter((o) => {
      const day = revenueRefDate(o)!.getDate();
      return day >= startDay && day <= endDay;
    });
    const revenue = inWeek.reduce((sum, o) => sum + (o.price ?? 0), 0);
    weeks.push({
      label: `Semana ${weeks.length + 1} (${String(startDay).padStart(2, "0")}–${String(endDay).padStart(2, "0")})`,
      startDay,
      endDay,
      orders: inWeek.length,
      revenue,
    });
    monthOrders += inWeek.length;
    monthRevenue += revenue;
  }

  return { monthISO: isoMonth(monthStart), orders: monthOrders, revenue: monthRevenue, weeks };
}

export function computeDashboardMetrics(orders: Order[], now: Date = new Date()): DashboardMetrics {
  // "Aguardando sapatilha" (formulario preenchido, mas o cliente ainda nao trouxe o item) nao
  // conta como pendente de conserto — fica separado para nao inflar o numero de pedidos que
  // realmente precisam de acao na oficina.
  const pendingCount = orders.filter((o) => isPending(o.status) && !isAwaitingDropoff(o.status)).length;
  const awaitingDropoffCount = orders.filter((o) => isAwaitingDropoff(o.status)).length;
  const delivered = orders.filter((o) => isDeliveredStatus(o.status));
  const deliveredCount = delivered.length;

  const paidDelivered = delivered.filter((o) => o.status === "ENTREGUE - PAGA" && o.price !== null);
  const totalRevenue = paidDelivered.reduce((sum, o) => sum + (o.price ?? 0), 0);
  const averageTicket = paidDelivered.length > 0 ? totalRevenue / paidDelivered.length : null;

  const avgDelivery = averageDeliveryDays(
    delivered.map((o) => ({ orderedAt: o.orderedAt, deliveredAt: o.deliveryDate })),
  );

  // Agrupamento semanal das ultimas 8 semanas (baseado na data ORIGINAL do pedido).
  const weeks: WeeklyPoint[] = [];
  const currentWeekStart = startOfWeek(now);
  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(weekStart.getDate() - i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const inWeek = orders.filter((o) => o.orderedAt && o.orderedAt >= weekStart && o.orderedAt < weekEnd);
    const revenue = inWeek
      .filter((o) => o.status === "ENTREGUE - PAGA" && o.price !== null)
      .reduce((sum, o) => sum + (o.price ?? 0), 0);
    weeks.push({ weekStartISO: isoDate(weekStart), orders: inWeek.length, revenue });
  }

  const thisWeek = weeks[weeks.length - 1]?.orders ?? 0;
  const lastWeek = weeks[weeks.length - 2]?.orders ?? 0;
  const deltaPct = lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek) * 100 : null;

  // Cortesias (ENTREGUE - NAO PAGA) dos ultimos N meses, agrupadas pela data de ENTREGA
  // (cai no mes em que o par de sapatilhas efetivamente saiu sem cobranca; usa a data do
  // pedido so como reserva, caso a entrega nao tenha data registrada).
  const courtesyMonthly: MonthlyCourtesyPoint[] = [];
  const currentMonthStart = startOfMonth(now);
  for (let i = COURTESY_MONTHS_WINDOW - 1; i >= 0; i--) {
    const monthStart = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - i, 1);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
    const count = orders.filter((o) => {
      if (o.status !== COURTESY_STATUS) return false;
      const refDate = o.deliveryDate ?? o.orderedAt;
      return refDate !== null && refDate >= monthStart && refDate < monthEnd;
    }).length;
    courtesyMonthly.push({ monthISO: isoMonth(monthStart), count });
  }
  const courtesyThisMonth = courtesyMonthly[courtesyMonthly.length - 1]?.count ?? 0;

  // Faturamento mensal (ultimos N meses), cada mes dividido em semanas de 7 dias.
  const monthlyRevenue: MonthlyRevenuePoint[] = [];
  for (let i = MONTHLY_REVENUE_MONTHS_WINDOW - 1; i >= 0; i--) {
    const monthStart = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - i, 1);
    monthlyRevenue.push(computeWeeksOfMonth(orders, monthStart));
  }

  return {
    totalOrders: orders.length,
    pendingCount,
    awaitingDropoffCount,
    deliveredCount,
    totalRevenue,
    courtesyMonthly,
    courtesyThisMonth,
    monthlyRevenue,
    averageTicket,
    averageDeliveryDays: avgDelivery,
    weekly: weeks,
    weekComparison: { thisWeek, lastWeek, deltaPct },
  };
}

export interface ExpenseRow {
  date: string;
  category: string;
  description: string;
  value: number | null;
}

export interface ExpensesSummary {
  rows: ExpenseRow[];
  totalByCategory: Record<string, number>;
  total: number;
}

export function summarizeExpenses(rows: ExpenseRow[]): ExpensesSummary {
  const totalByCategory: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    if (row.value === null) continue;
    const key = row.category || "Sem categoria";
    totalByCategory[key] = (totalByCategory[key] ?? 0) + row.value;
    total += row.value;
  }
  return { rows, totalByCategory, total };
}

/**
 * Categorias (coluna "Tipo" da aba Financeiro) tratadas como custo VARIAVEL de producao —
 * o que e efetivamente consumido pra ressolar um par: materiais (cola Vipal/Vipafix e
 * afins) e ferramentas e insumos. Usado pra calcular o "custo variavel por par", somado
 * ao valor das folhas de borracha da aba Borrachas (ver computeProfitability). Fôrmas
 * ficou de fora a pedido do Ricardo: e' investimento inicial (nao se gasta uma fôrma nova
 * por par), igual equipamento/treinamento/transporte — todos custo fixo, nao algo que
 * cresce proporcionalmente a cada par ressolado.
 *
 * Ajustavel: se novas categorias forem usadas na planilha, so incluir/tirar daqui.
 */
export const VARIABLE_EXPENSE_CATEGORIES = new Set<string>(["Materiais", "Ferramentas e Insumos"]);

export interface ProfitabilityMonthPoint {
  monthISO: string;
  revenue: number;
  expenses: number;
  profit: number;
}

export interface Profitability {
  /** Faturamento total (pedidos ENTREGUE - PAGA) desde o inicio. */
  totalRevenue: number;
  /** Soma de TODAS as despesas da aba Financeiro + folhas de borracha da aba Borrachas
   * (variavel + fixo/investimento). */
  totalExpenses: number;
  /** totalRevenue - totalExpenses. */
  profit: number;
  /** profit / totalRevenue em %, ou null se nao houve faturamento ainda. */
  marginPct: number | null;
  /** Numero de pares ENTREGUE - PAGA (usado como denominador do custo por par). */
  pairsDelivered: number;
  variableExpenses: number;
  fixedExpenses: number;
  /** variableExpenses / pairsDelivered — custo so de material (inclusive borracha) por par. */
  variableCostPerPair: number | null;
  /** totalExpenses / pairsDelivered — custo "tudo incluso" por par, ate agora. */
  totalCostPerPair: number | null;
  /** Ultimos 12 meses (mes atual por ultimo), faturamento x despesas lancadas naquele mes. */
  monthly: ProfitabilityMonthPoint[];
}

const PROFITABILITY_MONTHS_WINDOW = 12;

/**
 * orders + despesas da aba Financeiro + folhas da aba Borrachas (rubberSheets, opcional —
 * cada folha comprada entra inteira no custo VARIAVEL, junto com Materiais/Ferramentas e
 * Insumos: e' o mesmo tipo de gasto, so que rastreado numa aba separada pra acompanhar
 * estoque/consumo de cada folha, em vez de na aba Financeiro).
 */
export function computeProfitability(
  orders: Order[],
  expenseRows: ExpenseRow[],
  rubberSheets: RubberSheet[] = [],
  now: Date = new Date(),
): Profitability {
  const paidDelivered = orders.filter((o) => o.status === "ENTREGUE - PAGA" && o.price !== null);
  const totalRevenue = paidDelivered.reduce((sum, o) => sum + (o.price ?? 0), 0);
  const pairsDelivered = paidDelivered.length;

  let totalExpenses = 0;
  let variableExpenses = 0;
  let fixedExpenses = 0;
  for (const row of expenseRows) {
    if (row.value === null) continue;
    totalExpenses += row.value;
    if (VARIABLE_EXPENSE_CATEGORIES.has(row.category)) {
      variableExpenses += row.value;
    } else {
      fixedExpenses += row.value;
    }
  }
  // Borracha e' material consumido por par, mesmo rastreada numa aba a parte: entra
  // inteira no custo variavel (nunca no fixo).
  for (const sheet of rubberSheets) {
    if (sheet.value === null) continue;
    totalExpenses += sheet.value;
    variableExpenses += sheet.value;
  }

  const profit = totalRevenue - totalExpenses;
  const marginPct = totalRevenue > 0 ? (profit / totalRevenue) * 100 : null;
  const variableCostPerPair = pairsDelivered > 0 ? variableExpenses / pairsDelivered : null;
  const totalCostPerPair = pairsDelivered > 0 ? totalExpenses / pairsDelivered : null;

  // Agrupamento mensal (ultimos 12 meses, mes atual por ultimo) — faturamento pela mesma
  // data de referencia usada no resto do dashboard (revenueRefDate), despesas pela data
  // lancada na coluna "Data" da aba Financeiro/Borrachas.
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthly: ProfitabilityMonthPoint[] = [];
  for (let i = PROFITABILITY_MONTHS_WINDOW - 1; i >= 0; i--) {
    const monthStart = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - i, 1);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
    const monthISO = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;

    const revenue = paidDelivered
      .filter((o) => {
        const refDate = revenueRefDate(o);
        return refDate !== null && refDate >= monthStart && refDate < monthEnd;
      })
      .reduce((sum, o) => sum + (o.price ?? 0), 0);

    const expensesInMonth = expenseRows
      .filter((row) => {
        if (row.value === null) return false;
        const d = parseFlexibleDate(row.date);
        return d !== null && d >= monthStart && d < monthEnd;
      })
      .reduce((sum, row) => sum + (row.value ?? 0), 0);

    const rubberInMonth = rubberSheets
      .filter((sheet) => {
        if (sheet.value === null) return false;
        const d = parseFlexibleDate(sheet.date);
        return d !== null && d >= monthStart && d < monthEnd;
      })
      .reduce((sum, sheet) => sum + (sheet.value ?? 0), 0);

    const expenses = expensesInMonth + rubberInMonth;

    monthly.push({ monthISO, revenue, expenses, profit: revenue - expenses });
  }

  return {
    totalRevenue,
    totalExpenses,
    profit,
    marginPct,
    pairsDelivered,
    variableExpenses,
    fixedExpenses,
    variableCostPerPair,
    totalCostPerPair,
    monthly,
  };
}
