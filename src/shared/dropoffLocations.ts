/**
 * Caixas de drop-off físicas conhecidas: slug (usado na URL/QR code) -> rótulo completo
 * gravado na planilha como origem do pedido. Autoritativo no SERVIDOR — o slug que chega
 * do cliente é só uma chave de busca aqui, nunca texto livre gravado direto na planilha.
 */
export const DROPOFF_LOCATIONS: Record<string, string> = {
  "vila-madalena": "Drop-off Box — Fábrica Escalada Vila Madalena",
};

export const DEFAULT_DROPOFF_SLUG = "vila-madalena";

export function resolveDropoffLabel(slug: string | null | undefined): string {
  const key = (slug ?? "").trim().toLowerCase();
  return DROPOFF_LOCATIONS[key] ?? DROPOFF_LOCATIONS[DEFAULT_DROPOFF_SLUG]!;
}
