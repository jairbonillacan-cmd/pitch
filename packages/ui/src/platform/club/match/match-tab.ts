import type { MatchTabKey } from "../../types";

export const VALID_MATCH_TABS: readonly MatchTabKey[] = [
  "resumen",
  "ia",
  "numeros",
  "dinero",
  "contexto",
];

/**
 * Normaliza `?tab=` desde SSR o barra de direcciones a una de las 5 pestañas de la ficha.
 * Conserva compatibilidad con enlaces previos (`picks`, `analisis`, `cortex`, `mercados`, `dinero`, `comunidad`).
 */
export function normalizeMatchTab(raw?: string | string[] | null): MatchTabKey {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const val = (first ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (val === "ia" || val === "ai" || val === "cortex" || val === "analisis" || val === "analisis-ia") {
    return "ia";
  }
  if (val === "dinero" || val === "money" || val === "flujo" || val === "donde-esta-el-dinero") {
    return "dinero";
  }
  if (val === "numeros" || val === "mercados") {
    return "numeros";
  }
  if (val === "contexto" || val === "comunidad") {
    return "contexto";
  }
  return "resumen";
}
