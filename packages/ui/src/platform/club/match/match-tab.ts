import type { MatchTabKey } from "../../types";

export const VALID_MATCH_TABS: readonly MatchTabKey[] = ["resumen", "numeros", "contexto"];

/**
 * Normaliza `?tab=` desde SSR o barra de direcciones a una de las 3 pestañas de la ficha.
 * Conserva compatibilidad con enlaces previos (`picks`, `mercados`, `dinero`, `comunidad`).
 */
export function normalizeMatchTab(raw?: string | string[] | null): MatchTabKey {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const val = (first ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (val === "numeros" || val === "mercados" || val === "dinero") {
    return "numeros";
  }
  if (val === "contexto" || val === "comunidad") {
    return "contexto";
  }
  return "resumen";
}
