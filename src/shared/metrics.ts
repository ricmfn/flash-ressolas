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
}

export interface WeeklyPoint {
  weekStartISO: string;
  orders: number;
  revenue: number;
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

  return {
    totalOrders: orders.length,
    pendingCount,
    deliveredCount,
    totalRevenue,
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
