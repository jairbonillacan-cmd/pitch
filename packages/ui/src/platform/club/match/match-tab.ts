import type { MatchTabKey } from "../../types";

export const VALID_MATCH_TABS: readonly MatchTabKey[] = [
  "picks",
  "resumen",
  "alineaciones",
  "enfrentamientos",
  "lesiones",
  "ia",
  "numeros",
  "dinero",
];

export function normalizeMatchTab(raw?: string | string[] | null): MatchTabKey {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const val = (first ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (val === "resumen" || val === "overview" || val === "contexto" || val === "comunidad") {
    return "resumen";
  }
  if (val === "alineaciones" || val === "lineups" || val === "xi") {
    return "alineaciones";
  }
  if (val === "enfrentamientos" || val === "h2h") {
    return "enfrentamientos";
  }
  if (val === "lesiones" || val === "bajas" || val === "injuries") {
    return "lesiones";
  }
  if (val === "ia" || val === "ai" || val === "cortex" || val === "analisis" || val === "analisis-ia") {
    return "ia";
  }
  if (val === "dinero" || val === "money" || val === "flujo" || val === "donde-esta-el-dinero") {
    return "dinero";
  }
  if (val === "numeros" || val === "mercados") {
    return "numeros";
  }
  return "picks";
}
