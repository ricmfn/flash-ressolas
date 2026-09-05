/**
 * Parsing de datas tolerante aos dois formatos que aparecem na planilha real:
 *  - ISO: "2026-03-11" ou "2026-03-11T00:00:00"
 *  - BR:  "dd/mm/aaaa hh:mm:ss" ou apenas "dd/mm/aaaa"
 *
 * Datas invalidas, invertidas (mes > 12, dia > 31) ou absurdas (fora de uma janela
 * razoavel) retornam null em vez de um Date incorreto, para nunca virar NaN/negativo
 * nas metricas.
 */

const MIN_REASONABLE_YEAR = 2000;
const MAX_REASONABLE_YEAR = 2100;

function isReasonable(date: Date): boolean {
  const y = date.getFullYear();
  return Number.isFinite(date.getTime()) && y >= MIN_REASONABLE_YEAR && y <= MAX_REASONABLE_YEAR;
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;
const BR_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

export function parseFlexibleDate(raw: unknown): Date | null {
  if (raw instanceof Date) {
    return isReasonable(raw) ? raw : null;
  }
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const iso = ISO_RE.exec(trimmed);
  if (iso) {
    const [, y, mo, d, h, mi, s] = iso;
    const year = Number(y);
    const month = Number(mo);
    const day = Number(d);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(
      year,
      month - 1,
      day,
      h ? Number(h) : 0,
      mi ? Number(mi) : 0,
      s ? Number(s) : 0,
    );
    if (date.getMonth() !== month - 1 || date.getDate() !== day) return null; // ex: 31/02
    return isReasonable(date) ? date : null;
  }

  const br = BR_RE.exec(trimmed);
  if (br) {
    const [, d, mo, y, h, mi, s] = br;
    const day = Number(d);
    const month = Number(mo);
    let year = Number(y);
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(year, month - 1, day, h ? Number(h) : 0, mi ? Number(mi) : 0, s ? Number(s) : 0);
    if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return isReasonable(date) ? date : null;
  }

  // Ultimo recurso: deixa o proprio Date tentar (cobre variacoes minor), mas so aceita
  // se for razoavel — nunca propaga "Invalid Date" adiante.
  const fallback = new Date(trimmed);
  return isReasonable(fallback) ? fallback : null;
}

/** dias corridos entre duas datas, ou null se a ordem for invertida ou alguma data for invalida. */
export function daysBetween(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return null; // invertido: data de entrega antes do pedido -> ignora, nunca negativo
  return ms / (1000 * 60 * 60 * 24);
}

/**
 * Tempo medio de entrega (em dias) a partir de pares [dataDoPedido, dataDeEntrega].
 * Ignora silenciosamente pares com data invalida, invertida ou pedidos ainda sem entrega.
 * Retorna null (nunca NaN) se nao houver nenhum par valido.
 */
export function averageDeliveryDays(
  pairs: Array<{ orderedAt: Date | null; deliveredAt: Date | null }>,
): number | null {
  const durations: number[] = [];
  for (const pair of pairs) {
    const d = daysBetween(pair.orderedAt, pair.deliveredAt);
    if (d !== null && Number.isFinite(d)) durations.push(d);
  }
  if (durations.length === 0) return null;
  const sum = durations.reduce((a, b) => a + b, 0);
  return sum / durations.length;
}

export function toISODateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
