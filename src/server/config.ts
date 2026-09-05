import { readFileSync } from "node:fs";

export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return v;
}

export function loadServiceAccount(): ServiceAccountKey {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inline) {
    const parsed = JSON.parse(inline);
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  }
  const path = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (path) {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  }
  throw new Error(
    "Configure GOOGLE_SERVICE_ACCOUNT_JSON (conteúdo do JSON) ou GOOGLE_SERVICE_ACCOUNT_FILE (caminho do arquivo).",
  );
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  spreadsheetId: process.env.SPREADSHEET_ID ?? "1ALKfPUPfywf1n6Y0hTlbLmmre7KAU48v-yXvvcQw19E",
  ordersSheetName: process.env.ORDERS_SHEET_NAME ?? "Respostas ao formulário 1",
  editsSheetName: process.env.EDITS_SHEET_NAME ?? "Edições",
  expensesSheetName: process.env.EXPENSES_SHEET_NAME ?? "Financeiro",
  /** Intervalo do timer de sincronizacao automatica, em ms. Default: 5 minutos. */
  autoSyncIntervalMs: Number(process.env.AUTO_SYNC_INTERVAL_MS ?? 5 * 60 * 1000),
  sessionSecret: process.env.SESSION_SECRET ?? required("SESSION_SECRET"),
  authUsername: process.env.APP_USERNAME ?? required("APP_USERNAME"),
  authPasswordHash: process.env.APP_PASSWORD_HASH ?? required("APP_PASSWORD_HASH"),
};
