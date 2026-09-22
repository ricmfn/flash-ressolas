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
    await this.appendRows(sheetName, [row]);
  }

  /** Lista os nomes (titulos) de todas as abas existentes na planilha. */
  async listSheetNames(): Promise<string[]> {
    const url = `${BASE}/${this.spreadsheetId}?fields=sheets.properties.title`;
    const res = await fetch(url, { headers: await authHeaders(this.account) });
    if (!res.ok) throw new Error(`Erro ao listar as abas da planilha: ${await parseErrorBody(res)}`);
    const json = (await res.json()) as { sheets?: { properties?: { title?: string } }[] };
    return (json.sheets ?? []).map((s) => s.properties?.title ?? "").filter((title) => title !== "");
  }

  /**
   * Cria uma aba nova com o nome dado, se ainda nao existir — idempotente (chamado a cada
   * boot, so faz algo na primeira vez). Usado pra abas 100% controladas pelo app (ex: "Uso
   * de Borracha"), pra nunca depender de alguem criar a aba manualmente na planilha antes
   * do deploy. Se `headerRow` for passado, so e' escrito quando a aba acabou de ser criada
   * agora — nunca sobrescreve o cabecalho de uma aba ja existente.
   */
  async ensureSheetExists(sheetName: string, headerRow?: (string | number)[]): Promise<void> {
    const names = await this.listSheetNames();
    if (names.includes(sheetName)) return;

    const url = `${BASE}/${this.spreadsheetId}:batchUpdate`;
    const res = await fetch(url, {
      method: "POST",
      headers: await authHeaders(this.account),
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetName } } }] }),
    });
    if (!res.ok) throw new Error(`Erro ao criar a aba "${sheetName}": ${await parseErrorBody(res)}`);

    if (headerRow) {
      await this.appendRow(sheetName, headerRow);
    }
  }

  /**
   * Adiciona varias linhas de uma vez ao final de uma aba, numa unica chamada (usado pela
   * carga inicial da aba "Financeiro" - ver expensesSeed.ts/seedExpensesIfEmpty).
   */
  async appendRows(sheetName: string, rows: (string | number)[][]): Promise<void> {
    if (rows.length === 0) return;
    const range = `${sheetName}!A1`;
    const url = `${BASE}/${this.spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const res = await fetch(url, {
      method: "POST",
      headers: await authHeaders(this.account),
      body: JSON.stringify({ values: rows }),
    });
    if (!res.ok) throw new Error(`Erro ao adicionar linhas em "${sheetName}": ${await parseErrorBody(res)}`);
  }
}
