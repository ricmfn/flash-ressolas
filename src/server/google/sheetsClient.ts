import { getAccessToken } from "./auth.js";
import type { ServiceAccountKey } from "../config.js";

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

async function authHeaders(account: ServiceAccountKey): Promise<HeadersInit> {
  const token = await getAccessToken(account);
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function parseErrorBody(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { error?: { message?: string } };
    return json.error?.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export class SheetsClient {
  constructor(
    private readonly account: ServiceAccountKey,
    private readonly spreadsheetId: string,
  ) {}

  /** Le um intervalo como valores formatados (texto igual ao exibido na planilha). */
  async getValues(range: string): Promise<string[][]> {
    const url = `${BASE}/${this.spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
    const res = await fetch(url, { headers: await authHeaders(this.account) });
    if (!res.ok) throw new Error(`Erro ao ler "${range}": ${await parseErrorBody(res)}`);
    const json = (await res.json()) as { values?: string[][] };
    return json.values ?? [];
  }

  /** Le varios intervalos numa unica chamada. */
  async batchGetValues(ranges: string[]): Promise<Record<string, string[][]>> {
    const qs = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
    const url = `${BASE}/${this.spreadsheetId}/values:batchGet?${qs}&valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
    const res = await fetch(url, { headers: await authHeaders(this.account) });
    if (!res.ok) throw new Error(`Erro ao ler múltiplos intervalos: ${await parseErrorBody(res)}`);
    const json = (await res.json()) as { valueRanges?: { range: string; values?: string[][] }[] };
    const out: Record<string, string[][]> = {};
    for (const vr of json.valueRanges ?? []) {
      out[vr.range] = vr.values ?? [];
    }
    return out;
  }

  /**
   * Escreve um UNICO valor numa UNICA celula. Usado sempre para gravacoes do app —
   * nunca escreve ranges largos, para nunca arriscar sobrescrever colunas vizinhas.
   */
  async updateCell(sheetName: string, a1Cell: string, value: string | number, userEntered: boolean): Promise<void> {
    const range = `${sheetName}!${a1Cell}`;
    const url = `${BASE}/${this.spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=${userEntered ? "USER_ENTERED" : "RAW"}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: await authHeaders(this.account),
      body: JSON.stringify({ range, majorDimension: "ROWS", values: [[value]] }),
    });
    if (!res.ok) throw new Error(`Erro ao escrever em "${range}": ${await parseErrorBody(res)}`);
  }

  /** Adiciona uma linha ao final de uma aba (usado so para o log de auditoria "Edições"). */
  async appendRow(sheetName: string, row: (string | number)[]): Promise<void> {
    const range = `${sheetName}!A1`;
    const url = `${BASE}/${this.spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const res = await fetch(url, {
      method: "POST",
      headers: await authHeaders(this.account),
      body: JSON.stringify({ values: [row] }),
    });
    if (!res.ok) throw new Error(`Erro ao adicionar linha em "${sheetName}": ${await parseErrorBody(res)}`);
  }
}
