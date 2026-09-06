import { averageDeliveryDays } from "./dates.js";
import { isDeliveredStatus, isPending } from "./status.js";
import type { Order } from "./types.js";

export interface DashboardMetrics {
  totalOrders: number;
  pendingCount: number;
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
 * Divide um mes em blocos de 7 dias (semana 1 = dias 1-7, semana 2 = dias 8-14, ...; o
 * ultimo bloco pode ter menos de 7 dias) e soma pedidos ENTREGUE - PAGA em cada bloco,
 * usando a data de ENTREGA (com o pedido como reserva) - mesmo criterio do faturamento
 * usado nas cortesias, para que "faturamento do mes" reflita quando o dinheiro entrou.
 */
function computeWeeksOfMonth(orders: Order[], monthStart: Date): MonthlyRevenuePoint {
  const year = monthStart.getFullYear();
  const monthIndex = monthStart.getMonth();
  const totalDays = daysInMonth(year, monthIndex);
  const monthEnd = new Date(year, monthIndex + 1, 1);

  const paidInMonth = orders.filter((o) => {
    if (o.status !== "ENTREGUE - PAGA" || o.price === null) return false;
    const refDate = o.deliveryDate ?? o.orderedAt;
    return refDate !== null && refDate >= monthStart && refDate < monthEnd;
  });

  const weeks: WeekOfMonthPoint[] = [];
  let monthOrders = 0;
  let monthRevenue = 0;
  for (let startDay = 1; startDay <= totalDays; startDay += 7) {
    const endDay = Math.min(startDay + 6, totalDays);
    const inWeek = paidInMonth.filter((o) => {
      const day = (o.deliveryDate ?? o.orderedAt)!.getDate();
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
  const pendingCount = orders.filter((o) => isPending(o.status)).length;
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
