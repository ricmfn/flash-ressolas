/**
 * Normalizacao de telefone para o link do WhatsApp (wa.me/<digitos com codigo de pais>).
 * Numeros brasileiros sem DDI recebem o prefixo 55; numeros ja internacionais sao
 * preservados; qualquer coisa implausivel e marcada invalida para esconder/desabilitar
 * o botao em vez de abrir um link quebrado.
 */

export type PhoneNormalizeResult =
  | { ok: true; e164Digits: string; display: string }
  | { ok: false };

export function normalizePhoneForWhatsApp(raw: unknown): PhoneNormalizeResult {
  if (typeof raw !== "string" && typeof raw !== "number") return { ok: false };
  const digitsOnly = String(raw).replace(/\D/g, "").replace(/^0+/, "");

  if (digitsOnly.length === 0) return { ok: false };

  // Numero brasileiro com DDI 55 (DDD de 2 digitos + 8 ou 9 digitos = 12 ou 13 no total).
  if (digitsOnly.startsWith("55") && (digitsOnly.length === 12 || digitsOnly.length === 13)) {
    return { ok: true, e164Digits: digitsOnly, display: formatBRDisplay(digitsOnly.slice(2)) };
  }

  // Numero brasileiro sem DDI (DDD + numero = 10 ou 11 digitos).
  if (digitsOnly.length === 10 || digitsOnly.length === 11) {
    return { ok: true, e164Digits: `55${digitsOnly}`, display: formatBRDisplay(digitsOnly) };
  }

  // Numero internacional plausivel (com DDI de outro pais): mantem como veio.
  if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
    return { ok: true, e164Digits: digitsOnly, display: `+${digitsOnly}` };
  }

  return { ok: false };
}

function formatBRDisplay(localDigits: string): string {
  if (localDigits.length === 11) {
    return `(${localDigits.slice(0, 2)}) ${localDigits.slice(2, 7)}-${localDigits.slice(7)}`;
  }
  if (localDigits.length === 10) {
    return `(${localDigits.slice(0, 2)}) ${localDigits.slice(2, 6)}-${localDigits.slice(6)}`;
  }
  return localDigits;
}

export function whatsappLink(raw: unknown, message?: string): string | null {
  const result = normalizePhoneForWhatsApp(raw);
  if (!result.ok) return null;
  const base = `https://wa.me/${result.e164Digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
