/**
 * Parser de valores monetarios no formato brasileiro, tolerante a como as pessoas
 * realmente digitam ("R$ 280,00", "280,00", "280.00", "1.234,50") mas estrito o
 * suficiente para nunca aceitar "?", datas ou texto solto como preco.
 *
 * Nunca retorna 0 silenciosamente para entrada invalida: o chamador SEMPRE recebe
 * ok:false com o motivo, e deve rejeitar a gravacao.
 */

export type CurrencyParseResult =
  | { ok: true; value: number | null } // value === null significa "campo vazio", nao um erro
  | { ok: false; error: string };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;
const BR_DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}([ ]\d{1,2}:\d{2}(:\d{2})?)?$/;

export function parseBRLCurrency(raw: unknown): CurrencyParseResult {
  if (raw === null || raw === undefined) {
    return { ok: true, value: null };
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) {
      return { ok: false, error: "Valor numérico inválido para preço." };
    }
    return { ok: true, value: Math.round(raw * 100) / 100 };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: "Tipo de valor não suportado para preço." };
  }

  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: true, value: null };
  }
  if (trimmed === "?" || trimmed === "-" || trimmed.toLowerCase() === "n/a") {
    return { ok: false, error: `Valor "${raw}" não é um preço válido.` };
  }

  // Datas nunca sao preco, mesmo que so tenham digitos e separadores.
  if (ISO_DATE_RE.test(trimmed) || BR_DATE_RE.test(trimmed)) {
    return { ok: false, error: `"${raw}" parece uma data, não um preço.` };
  }

  // Remove prefixo de moeda e espacos internos ("R$ 1.234,50" -> "1.234,50").
  let cleaned = trimmed.replace(/^r\$\s*/i, "").replace(/\s+/g, "");

  if (cleaned === "") {
    return { ok: false, error: `Valor "${raw}" não é um preço válido.` };
  }

  // Qualquer letra remanescente (fora "R$") invalida o valor.
  if (/[a-zA-Z]/.test(cleaned)) {
    return { ok: false, error: `"${raw}" contém texto não numérico.` };
  }

  const isNegative = cleaned.startsWith("-");
  if (isNegative) {
    return { ok: false, error: "Preço não pode ser negativo." };
  }

  // Apenas digitos, pontos e virgulas sao permitidos a partir daqui.
  if (!/^[\d.,]+$/.test(cleaned)) {
    return { ok: false, error: `"${raw}" não é um preço válido.` };
  }

  const hasDot = cleaned.includes(".");
  const hasComma = cleaned.includes(",");
  let normalized: string;

  if (hasDot && hasComma) {
    // Formato BR completo: "." separador de milhar, "," separador decimal.
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // "280,00" -> "280.00". So pode haver uma virgula (decimal).
    const parts = cleaned.split(",");
    if (parts.length !== 2) {
      return { ok: false, error: `"${raw}" não é um preço válido.` };
    }
    normalized = `${parts[0]}.${parts[1]}`;
  } else if (hasDot) {
    const parts = cleaned.split(".");
    if (parts.length > 2) {
      // Mais de um ponto sem virgula: assume separador de milhar repetido ("1.234.567").
      normalized = parts.join("");
    } else {
      const decimals = parts[1] ?? "";
      // "280.00" (2 casas) -> decimal. "1.234" (3 casas, sem outras pistas) -> milhar.
      normalized = decimals.length === 3 ? parts.join("") : cleaned;
    }
  } else {
    normalized = cleaned;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return { ok: false, error: `"${raw}" não é um preço válido.` };
  }

  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) {
    return { ok: false, error: `"${raw}" não é um preço válido.` };
  }

  return { ok: true, value: Math.round(value * 100) / 100 };
}

/** Formata um numero como moeda brasileira para exibicao ("1234.5" -> "R$ 1.234,50"). */
export function formatBRL(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
