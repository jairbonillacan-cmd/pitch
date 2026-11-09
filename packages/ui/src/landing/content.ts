import type { LandingPlan, LandingV2Props } from "./landing-v2.js";

/**
 * Contenido comercial de la landing: fuente única para la app y Storybook.
 * Precios confirmados por el fundador (2026-11-09): Pro $199 y Elite $399 MXN/mes,
 * IVA incluido. Las funciones siguen INFORMATION_ARCHITECTURE.md §4 (provisional) y
 * solo nombran lo que entra en el MVP: IA, backtesting y alertas llegan después.
 */
export const LANDING_PLANS: LandingPlan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    blurb: "Para seguir la jornada.",
    features: [
      "Calendario, resultados y posiciones",
      "Un análisis completo al día",
      "Pick Journal y perfil público",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 199,
    blurb: "Para investigar cada partido.",
    features: [
      "Análisis completo de todos los partidos",
      "Cuotas de todas las casas, con su hora",
      "Apertura, cierre y movimiento de la temporada",
      "Prop Lab NFL sin límite",
    ],
  },
  {
    id: "elite",
    name: "Elite",
    price: 399,
    blurb: "Para quien lleva su propio registro.",
    features: ["Todo lo de Pro", "Histórico completo de cuotas", "Exportación a CSV"],
  },
];

/** Matriz comercial del MVP. El orden de las columnas se identifica por plan. */
export const LANDING_PLAN_COMPARISON: {
  feature: string;
  plans: Record<LandingPlan["id"], string | boolean>;
}[] = [
  { feature: "Calendario, resultados y posiciones", plans: { free: true, pro: true, elite: true } },
  { feature: "Lo más probable y cuota justa", plans: { free: "1 partido al día", pro: "Todos", elite: "Todos" } },
  { feature: "Mercados por partido", plans: { free: "1 partido al día", pro: "Todos", elite: "Todos" } },
  { feature: "Cuotas actuales", plans: { free: "Mejor cuota y 2 casas", pro: "Todas las casas", elite: "Todas las casas" } },
  { feature: "Apertura, cierre y movimiento", plans: { free: false, pro: "Temporada actual", elite: "Todo el histórico" } },
  { feature: "Prop Lab NFL", plans: { free: "3 al día", pro: "Sin límite", elite: "Sin límite" } },
  { feature: "Pick Journal y perfil público", plans: { free: true, pro: true, elite: true } },
  { feature: "Leaderboards", plans: { free: "Ver", pro: "Ver y aparecer", elite: "Ver y aparecer" } },
  { feature: "Exportación a CSV", plans: { free: false, pro: false, elite: true } },
];

export const LANDING_COVERAGE: LandingV2Props["coverage"] = [
  { slug: "liga-mx", label: "Liga MX" },
  { slug: "nfl", label: "NFL" },
  { slug: "premier-league", label: "Premier League" },
  { slug: "laliga", label: "LaLiga" },
  { slug: "bundesliga", label: "Bundesliga" },
  { slug: "serie-a", label: "Serie A" },
  { slug: "ligue-1", label: "Ligue 1" },
  { slug: "nhl", label: "NHL", soon: true },
  { slug: "mlb", label: "MLB", soon: true },
];
