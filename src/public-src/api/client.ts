/**
 * Cliente HTTP para a API do Flash Ressolas. Sempre inclui os cookies de sessao
 * (credentials: "include") e nunca lanca excecao "crua" para a UI: toda chamada
 * retorna um resultado tipado {ok:true,data} | {ok:false,status,error} para que
 * a tela sempre tenha algo tratavel e nunca fique com a "tela preta".
 */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      const message =
        body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
          ? (body as { error: string }).error
          : `Erro ${res.status} ao comunicar com o servidor.`;
      return { ok: false, status: res.status, error: message };
    }
    return { ok: true, data: body as T };
  } catch {
    // Falha de rede (offline, timeout, DNS, etc.) - nunca deixa a tela travada sem explicacao.
    return { ok: false, status: 0, error: "Falha de conexão. Verifique sua internet e tente novamente." };
  }
}

// ---------- Tipos de resposta ----------

export interface OrderPhotoJSON {
  fileId: string;
  viewUrl: string;
  driveUrl: string;
}

export interface OrderJSON {
  sheetRowIndex: number;
  formId: string | null;
  orderedAt: string | null;
  orderedAtRaw: string;
  customerName: string;
  customerPhone: string;
  phoneDisplay: string | null;
  whatsappOk: boolean;
  shoeModel: string;
  shoeSize: string;
  detail: string;
  status: string;
  statusInferred: boolean;
  price: number | null;
  deliveryDate: string | null;
  deliveryDateRaw: string;
  internalNotes: string;
  photo: OrderPhotoJSON | null;
}

export interface OrdersResponse {
  orders: OrderJSON[];
  pendingCount: number;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

export interface SyncResponse {
  ranNow: boolean;
  error: string | null;
  lastSyncedAt: string | null;
  ordersCount: number;
}

export interface DashboardWeek {
  weekStartISO: string;
  orders: number;
  revenue: number;
}

export interface DashboardCourtesyMonth {
  monthISO: string;
  count: number;
}

export interface DashboardResponse {
  totalOrders: number;
  pendingCount: number;
  deliveredCount: number;
  totalRevenue: number;
  averageTicket: number | null;
  averageDeliveryDays: number | null;
  weekly: DashboardWeek[];
  weekComparison: { thisWeek: number; lastWeek: number; deltaPct: number | null };
  courtesyMonthly: DashboardCourtesyMonth[];
  courtesyThisMonth: number;
}

export interface ExpenseRowJSON {
  date: string;
  category: string;
  description: string;
  value: number | null;
}

export interface ExpensesResponse {
  rows: ExpenseRowJSON[];
  totalByCategory: Record<string, number>;
  total: number;
}

export const api = {
  me: () => request<{ username: string }>("/api/me"),
  login: (username: string, password: string) =>
    request<{ ok: true; username: string }>("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: true }>("/api/logout", { method: "POST" }),
  orders: () => request<OrdersResponse>("/api/orders"),
  updateStatus: (sheetRowIndex: number, status: string, deliveryDateISO: string | null) =>
    request<{ order: OrderJSON }>(`/api/orders/${sheetRowIndex}/status`, {
      method: "POST",
      body: JSON.stringify({ status, deliveryDateISO }),
    }),
  updatePrice: (sheetRowIndex: number, rawValue: string) =>
    request<{ order: OrderJSON }>(`/api/orders/${sheetRowIndex}/price`, {
      method: "POST",
      body: JSON.stringify({ rawValue }),
    }),
  sync: () => request<SyncResponse>("/api/sync", { method: "POST" }),
  dashboard: () => request<DashboardResponse>("/api/dashboard"),
  expenses: () => request<ExpensesResponse>("/api/expenses"),
};
