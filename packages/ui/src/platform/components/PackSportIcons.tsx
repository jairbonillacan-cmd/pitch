"use client";

import React from "react";
import { buildPackIconSources, usePackIconBase } from "../../pack-icon-theme";
import { MAESTRO_INTERFACE_PACK_SLUGS } from "./MaestroPrimitives";
import { SPORT_EVENT_PACK_ASSETS } from "./SportEventIcons";

export type MarketCategoryIconName =
  | "corners"
  | "double-chance"
  | "fouls"
  | "handicap-balance"
  | "offsides"
  | "over-under"
  | "shots"
  | "shots-on-target"
  | "xg-radar"
  | "both-teams-to-score"
  | "draw-no-bet"
  | "result-1x2"
  | "result-goals-combo"
  | "team-goals"
  | "total-cards"
  | "win-to-nil"
  | "half-time-result"
  | "second-half-result"
  | "expected-value"
  | "closing-line-value"
  | "steam-move"
  | "bankroll-curve"
  | "bankroll-roi"
  | "yield-percent"
  | "basketball-points"
  | "basketball-rebounds"
  | "basketball-assists"
  | "basketball-three-pointers"
  | "american-football-total-points"
  | "baseball-first-five"
  | "baseball-run-line"
  | "baseball-total-runs"
  | "hockey-puck-line"
  | "big-chances"
  | "expected-assists"
  | "goals-prevented"
  | "key-passes"
  | "pass-accuracy"
  | "possession"
  | "tackles"
  | "touches-in-box";

export type PlayerMetaIconName =
  | "birthday-cake"
  | "boot-foot"
  | "height-ruler"
  | "jersey"
  | "player-minutes"
  | "weight-scale";

export type MatchContextIconName =
  | "national-teams"
  | "pitch-field"
  | "weather-clear"
  | "weather-rain"
  | "weather-snow"
  | "weather-wind";

export const MARKET_CATEGORY_ICON_NAMES: readonly MarketCategoryIconName[] = Object.freeze([
  "corners",
  "double-chance",
  "fouls",
  "handicap-balance",
  "offsides",
  "over-under",
  "shots",
  "shots-on-target",
  "xg-radar",
  "both-teams-to-score",
  "draw-no-bet",
  "result-1x2",
  "result-goals-combo",
  "team-goals",
  "total-cards",
  "win-to-nil",
  "half-time-result",
  "second-half-result",
  "expected-value",
  "closing-line-value",
  "steam-move",
  "bankroll-curve",
  "bankroll-roi",
  "yield-percent",
  "basketball-points",
  "basketball-rebounds",
  "basketball-assists",
  "basketball-three-pointers",
  "american-football-total-points",
  "baseball-first-five",
  "baseball-run-line",
  "baseball-total-runs",
  "hockey-puck-line",
  "big-chances",
  "expected-assists",
  "goals-prevented",
  "key-passes",
  "pass-accuracy",
  "possession",
  "tackles",
  "touches-in-box",
]);

export const PLAYER_META_ICON_NAMES: readonly PlayerMetaIconName[] = Object.freeze([
  "birthday-cake",
  "boot-foot",
  "height-ruler",
  "jersey",
  "player-minutes",
  "weight-scale",
]);

export const MATCH_CONTEXT_ICON_NAMES: readonly MatchContextIconName[] = Object.freeze([
  "national-teams",
  "pitch-field",
  "weather-clear",
  "weather-rain",
  "weather-snow",
  "weather-wind",
]);

const MARKET_CATEGORY_DIRECT_MAP: ReadonlyMap<string, MarketCategoryIconName> = new Map(
  MARKET_CATEGORY_ICON_NAMES.map((name) => [name, name] as const),
);

const MARKET_CATEGORY_EXACT_ALIASES: Readonly<Record<string, MarketCategoryIconName>> = {
  "1x2": "result-1x2",
  moneyline: "result-1x2",
  ml: "result-1x2",
  h2h: "result-1x2",
  winner: "result-1x2",
  ganador: "result-1x2",
  resultado: "result-1x2",
  "result-ft": "result-1x2",
  "nba-moneyline": "result-1x2",
  "mlb-moneyline": "result-1x2",
  "nhl-moneyline": "result-1x2",
  "nfl-moneyline": "result-1x2",
  "double-chance": "double-chance",
  "doble-oportunidad": "double-chance",
  dc: "double-chance",
  "1x": "double-chance",
  x2: "double-chance",
  "12": "double-chance",
  dnb: "draw-no-bet",
  "empate-no-accion": "draw-no-bet",
  "sin-empate": "draw-no-bet",
  btts: "both-teams-to-score",
  "ambos-anotan": "both-teams-to-score",
  "ambos-equipos-anotan": "both-teams-to-score",
  "ambos-porteria": "both-teams-to-score",
  gg: "both-teams-to-score",
  totals: "over-under",
  totales: "over-under",
  "goals-total": "over-under",
  "goles-totales": "over-under",
  "total-goals": "over-under",
  "nhl-totals": "over-under",
  "team-totals": "team-goals",
  "team-goals-home": "team-goals",
  "team-goals-away": "team-goals",
  "goles-equipo": "team-goals",
  "goles-por-equipo": "team-goals",
  "result-ht": "half-time-result",
  "1t": "half-time-result",
  ht: "half-time-result",
  "first-half": "half-time-result",
  "medio-tiempo": "half-time-result",
  "result-2h": "second-half-result",
  "2t": "second-half-result",
  "2h": "second-half-result",
  "second-half": "second-half-result",
  "segundo-tiempo": "second-half-result",
  "combo-1x2-over": "result-goals-combo",
  "combo-1x2-btts": "result-goals-combo",
  "combo-result-goals": "result-goals-combo",
  "combo-result-btts": "result-goals-combo",
  "exact-score": "result-goals-combo",
  combinada: "result-goals-combo",
  "asian-handicap": "handicap-balance",
  handicap: "handicap-balance",
  "handicap-combos": "handicap-balance",
  spread: "handicap-balance",
  "nba-spread": "handicap-balance",
  "nfl-spread": "handicap-balance",
  "clean-sheet": "win-to-nil",
  "clean-sheet-home": "win-to-nil",
  "clean-sheet-away": "win-to-nil",
  "porteria-a-cero": "win-to-nil",
  "gana-a-cero": "win-to-nil",
  "corners-total": "corners",
  "corners-team": "corners",
  "corners-home": "corners",
  "corners-away": "corners",
  "tiros-de-esquina": "corners",
  "shots-total": "shots",
  remates: "shots",
  tiros: "shots",
  sot: "shots-on-target",
  "sot-total": "shots-on-target",
  "on-target": "shots-on-target",
  "remates-a-puerta": "shots-on-target",
  "tiros-a-puerta": "shots-on-target",
  "player-props-football": "shots-on-target",
  "fouls-total": "fouls",
  faltas: "fouls",
  "conteos-arbitro": "fouls",
  "cards-total": "total-cards",
  cards: "total-cards",
  "yellow-total": "total-cards",
  "yellow-cards": "total-cards",
  "red-cards": "total-cards",
  tarjetas: "total-cards",
  amarillas: "total-cards",
  "fuera-de-juego": "offsides",
  "fueras-de-juego": "offsides",
  xg: "xg-radar",
  "expected-goals": "xg-radar",
  "goles-esperados": "xg-radar",
  xa: "expected-assists",
  "goal-or-assist": "expected-assists",
  "asistencias-esperadas": "expected-assists",
  ev: "expected-value",
  "ev-plus": "expected-value",
  "valor-esperado": "expected-value",
  edge: "expected-value",
  clv: "closing-line-value",
  cierre: "closing-line-value",
  "linea-de-cierre": "closing-line-value",
  steam: "steam-move",
  shortening: "steam-move",
  drifting: "steam-move",
  "movimiento-de-linea": "steam-move",
  "curva-bankroll": "bankroll-curve",
  equity: "bankroll-curve",
  roi: "bankroll-roi",
  retorno: "bankroll-roi",
  yield: "yield-percent",
  rendimiento: "yield-percent",
  "nba-totals": "basketball-points",
  "nba-player-props": "basketball-points",
  "points-total": "basketball-points",
  pts: "basketball-points",
  points: "basketball-points",
  puntos: "basketball-points",
  reb: "basketball-rebounds",
  rebounds: "basketball-rebounds",
  rebotes: "basketball-rebounds",
  ast: "basketball-assists",
  assists: "basketball-assists",
  asistencias: "basketball-assists",
  "3pm": "basketball-three-pointers",
  "3pt": "basketball-three-pointers",
  threes: "basketball-three-pointers",
  triples: "basketball-three-pointers",
  "nfl-totals": "american-football-total-points",
  "nfl-points": "american-football-total-points",
  "puntos-nfl": "american-football-total-points",
  "mlb-f5": "baseball-first-five",
  f5: "baseball-first-five",
  "result-f5": "baseball-first-five",
  "f5-totals": "baseball-first-five",
  "first-five": "baseball-first-five",
  "mlb-run-line": "baseball-run-line",
  "run-line": "baseball-run-line",
  runline: "baseball-run-line",
  "mlb-totals": "baseball-total-runs",
  "runs-total": "baseball-total-runs",
  runs: "baseball-total-runs",
  carreras: "baseball-total-runs",
  "nhl-puck-line": "hockey-puck-line",
  "puck-line": "hockey-puck-line",
  puckline: "hockey-puck-line",
  "ocasiones-claras": "big-chances",
  "grandes-ocasiones": "big-chances",
  "goles-evitados": "goals-prevented",
  psxg: "goals-prevented",
  "pases-clave": "key-passes",
  "precision-de-pase": "pass-accuracy",
  "precision-pases": "pass-accuracy",
  "pass-accuracy-pct": "pass-accuracy",
  posesion: "possession",
  "possession-pct": "possession",
  entradas: "tackles",
  tacleadas: "tackles",
  "toques-en-area": "touches-in-box",
  "toques-area": "touches-in-box",
};

function normalizeMarketQuery(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toMarketSlug(normalized: string): string {
  return normalized
    .replace(/\+/g, "-plus")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function resolveMarketCategoryIconKey(familyOrMetric: string): MarketCategoryIconName {
  const normalized = normalizeMarketQuery(familyOrMetric);
  if (!normalized) return "result-1x2";

  const slug = toMarketSlug(normalized);
  const direct = MARKET_CATEGORY_DIRECT_MAP.get(slug);
  if (direct) return direct;

  const exact = MARKET_CATEGORY_EXACT_ALIASES[slug];
  if (exact) return exact;

  if (normalized.includes("puck")) return "hockey-puck-line";
  if (normalized.includes("run line") || normalized.includes("run-line") || normalized.includes("runline")) {
    return "baseball-run-line";
  }
  if (
    normalized.includes("first five") ||
    normalized.includes("primeras 5") ||
    normalized.includes("5 entradas") ||
    /\bf5\b/.test(normalized)
  ) {
    return "baseball-first-five";
  }
  if (normalized.includes("carrera") || normalized.includes("runs") || normalized.includes("mlb")) {
    return "baseball-total-runs";
  }
  if (
    normalized.includes("triple") ||
    normalized.includes("three-pointer") ||
    normalized.includes("three pointer") ||
    /\b3p[mt]\b/.test(normalized)
  ) {
    return "basketball-three-pointers";
  }
  if (normalized.includes("rebote") || normalized.includes("rebound") || /\breb\b/.test(normalized)) {
    return "basketball-rebounds";
  }
  if (
    normalized.includes("expected assist") ||
    normalized.includes("asistencias esperadas") ||
    normalized.includes("asistencia esperada") ||
    /\bxa\b/.test(normalized)
  ) {
    return "expected-assists";
  }
  if (normalized.includes("asistencia") || normalized.includes("assist") || /\bast\b/.test(normalized)) {
    return "basketball-assists";
  }
  if (
    normalized.includes("nfl") ||
    normalized.includes("american football") ||
    normalized.includes("futbol americano") ||
    normalized.includes("touchdown")
  ) {
    return "american-football-total-points";
  }
  if (
    normalized.includes("nba") ||
    normalized.includes("basket") ||
    normalized.includes("baloncesto") ||
    /\bpts\b/.test(normalized) ||
    normalized.includes("puntos")
  ) {
    return "basketball-points";
  }
  if (
    normalized.includes("a puerta") ||
    normalized.includes("al arco") ||
    normalized.includes("on target") ||
    normalized.includes("on-target") ||
    /\bsot\b/.test(normalized)
  ) {
    return "shots-on-target";
  }
  if (normalized.includes("remate") || normalized.includes("tiro") || normalized.includes("shot")) {
    return "shots";
  }
  if (normalized.includes("corner") || normalized.includes("esquina")) {
    return "corners";
  }
  if (normalized.includes("offside") || normalized.includes("fuera de juego") || normalized.includes("fueras de juego")) {
    return "offsides";
  }
  if (normalized.includes("tarjeta") || normalized.includes("amarilla") || normalized.includes("card")) {
    return "total-cards";
  }
  if (normalized.includes("falta") || normalized.includes("foul")) {
    return "fouls";
  }
  if (normalized.includes("combo") || normalized.includes("combinada") || normalized.includes("1x2 +") || normalized.includes("resultado +")) {
    return "result-goals-combo";
  }
  if (normalized.includes("ambos") || normalized.includes("btts") || normalized.includes("both teams")) {
    return "both-teams-to-score";
  }
  if (normalized.includes("doble oportunidad") || normalized.includes("double chance") || normalized.includes("doble op")) {
    return "double-chance";
  }
  if (normalized.includes("empate no") || normalized.includes("draw no bet") || normalized.includes("sin empate") || /\bdnb\b/.test(normalized)) {
    return "draw-no-bet";
  }
  if (
    normalized.includes("porteria a cero") ||
    normalized.includes("porteria cero") ||
    normalized.includes("clean sheet") ||
    normalized.includes("sin recibir") ||
    normalized.includes("win to nil") ||
    normalized.includes("a cero")
  ) {
    return "win-to-nil";
  }
  if (
    normalized.includes("1.er tiempo") ||
    normalized.includes("1er tiempo") ||
    normalized.includes("primer tiempo") ||
    normalized.includes("half time") ||
    normalized.includes("halftime") ||
    normalized.includes("al descanso") ||
    /\b1t\b/.test(normalized)
  ) {
    return "half-time-result";
  }
  if (
    normalized.includes("2.o tiempo") ||
    normalized.includes("2o tiempo") ||
    normalized.includes("segundo tiempo") ||
    normalized.includes("second half") ||
    normalized.includes("complemento") ||
    /\b2t\b/.test(normalized)
  ) {
    return "second-half-result";
  }
  if (normalized.includes("handicap") || normalized.includes("spread") || normalized.includes("asiatico")) {
    return "handicap-balance";
  }
  if (normalized.includes("goles por equipo") || normalized.includes("goles equipo") || normalized.includes("team goal") || normalized.includes("team total")) {
    return "team-goals";
  }
  if (normalized.includes("goles evitados") || normalized.includes("goals prevented") || normalized.includes("psxg")) {
    return "goals-prevented";
  }
  if (normalized.includes("goles esperados") || normalized.includes("expected goal") || /\bxg\b/.test(normalized)) {
    return "xg-radar";
  }
  if (normalized.includes("ocasion") || normalized.includes("big chance")) {
    return "big-chances";
  }
  if (normalized.includes("pase clave") || normalized.includes("pases clave") || normalized.includes("key pass")) {
    return "key-passes";
  }
  if (normalized.includes("precision") || normalized.includes("pass accuracy")) {
    return "pass-accuracy";
  }
  if (normalized.includes("posesion") || normalized.includes("possession")) {
    return "possession";
  }
  if (normalized.includes("entrada") || normalized.includes("tackle") || normalized.includes("tacle")) {
    return "tackles";
  }
  if (normalized.includes("toque") || normalized.includes("touches") || normalized.includes("en el area") || normalized.includes("in box")) {
    return "touches-in-box";
  }
  if (normalized.includes("clv") || normalized.includes("closing line") || normalized.includes("linea de cierre")) {
    return "closing-line-value";
  }
  if (normalized.includes("steam") || normalized.includes("movimiento") || normalized.includes("shorten") || normalized.includes("drift")) {
    return "steam-move";
  }
  if (normalized.includes("yield") || normalized.includes("rendimiento")) {
    return "yield-percent";
  }
  if (/\broi\b/.test(normalized) || normalized.includes("retorno")) {
    return "bankroll-roi";
  }
  if (normalized.includes("bankroll") || normalized.includes("curva") || normalized.includes("equity")) {
    return "bankroll-curve";
  }
  if (normalized.includes("expected value") || normalized.includes("valor esperado") || normalized.includes("ev+") || /\bev\b/.test(normalized) || /\bedge\b/.test(normalized)) {
    return "expected-value";
  }
  if (
    normalized.includes("over") ||
    normalized.includes("under") ||
    normalized.includes("mas de") ||
    normalized.includes("menos de") ||
    normalized.includes("total") ||
    normalized.includes("gol")
  ) {
    return "over-under";
  }

  return "result-1x2";
}

function PackAssetImg({
  assetPath,
  size,
  className,
  label,
}: {
  readonly assetPath: string;
  readonly size: number;
  readonly className: string;
  readonly label?: string;
}): React.JSX.Element {
  const iconBase = usePackIconBase();
  const sources = buildPackIconSources(iconBase, assetPath);
  const accessibleLabel = label?.trim() ?? "";

  return (
    <img
      src={sources.src}
      srcSet={sources.srcSet}
      width={size}
      height={size}
      alt={accessibleLabel}
      aria-hidden={accessibleLabel ? undefined : true}
      decoding="async"
      draggable={false}
      className={className}
    />
  );
}

export function MarketCategoryIcon({
  name,
  family,
  size = 18,
  className,
  label,
}: {
  readonly name?: MarketCategoryIconName;
  readonly family?: string;
  readonly size?: number;
  readonly className?: string;
  readonly label?: string;
}): React.JSX.Element {
  const resolvedKey: MarketCategoryIconName =
    name ?? (family ? resolveMarketCategoryIconKey(family) : "result-1x2");
  const cls = [
    "pl-maestro-icon",
    "pl-pack-icon",
    "pl-pack-icon--market",
    "inline-block",
    "shrink-0",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <PackAssetImg
      assetPath={`mercados/${resolvedKey}`}
      size={size}
      className={cls}
      label={label}
    />
  );
}

export function PlayerMetaIcon({
  name,
  size = 16,
  className,
  label,
}: {
  readonly name: PlayerMetaIconName;
  readonly size?: number;
  readonly className?: string;
  readonly label?: string;
}): React.JSX.Element {
  const cls = [
    "pl-maestro-icon",
    "pl-pack-icon",
    "pl-pack-icon--player",
    "inline-block",
    "shrink-0",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <PackAssetImg
      assetPath={`jugador/${name}`}
      size={size}
      className={cls}
      label={label}
    />
  );
}

export function MatchContextIcon({
  name,
  size = 16,
  className,
  label,
}: {
  readonly name: MatchContextIconName;
  readonly size?: number;
  readonly className?: string;
  readonly label?: string;
}): React.JSX.Element {
  const cls = [
    "pl-maestro-icon",
    "pl-pack-icon",
    "pl-pack-icon--context",
    "inline-block",
    "shrink-0",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <PackAssetImg
      assetPath={`contexto/${name}`}
      size={size}
      className={cls}
      label={label}
    />
  );
}

export const PACK_ICON_ASSET_MANIFEST: readonly string[] = Object.freeze([
  ...MATCH_CONTEXT_ICON_NAMES.map((slug) => `contexto/${slug}.webp`),
  ...SPORT_EVENT_PACK_ASSETS.map((slug) => `eventos/${slug}.webp`),
  ...MAESTRO_INTERFACE_PACK_SLUGS.map((slug) => `interfaz/${slug}.webp`),
  ...PLAYER_META_ICON_NAMES.map((slug) => `jugador/${slug}.webp`),
  ...MARKET_CATEGORY_ICON_NAMES.map((slug) => `mercados/${slug}.webp`),
]);
