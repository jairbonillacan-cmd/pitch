/**
 * xG de Bzzoiro para las ratings de largo plazo del pipeline de producción.
 *
 * El backtest walk-forward (docs/architecture/PLAN_MOTORES_Y_FUENTES_2026_11.md §6) mostró que
 * en la Premier League el Elo alimentado con xG le gana a la mezcla con Elo de goles de forma
 * significativa (Δ −0.0014 [−0.0022, −0.0005] solo con Bzzoiro). Por eso solo las ligas de
 * `XG_ELO_LEAGUES` lo usan; las demás siguen con goles hasta que su comparación lo justifique.
 *
 * Fuente: `data/history/research/bzzoiro/<liga>.jsonl` (lo escribe `history:providers`) y el mapa
 * de equipos `research/provider-ids/<archivo-corpus>.teams.json` (lo escribe `history:link`).
 * Ninguno está en Git; en Actions se generan en el mismo corte con caché. Si faltan, el
 * pipeline sigue con goles: nunca falla por no tener xG.
 *
 * Solo entra xG **medido** (`xgEstimated === false`).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BzzoiroMatchRow } from "./providers/bzzoiro.js";
import { remapTeam } from "./prior-season.js";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const RESEARCH = resolve(ROOT, "data", "history", "research");

/** Ligas cuyo Elo de producción usa xG (validado en el backtest contra la mezcla de producción). */
export const XG_ELO_LEAGUES: ReadonlySet<string> = new Set(["premier-league"]);

/** Liga del producto → archivo del corpus (mismo criterio que `prior-season.ts`). */
const CORPUS_FILE: Record<string, string> = {
  "premier-league": "premier-league",
  laliga: "la-liga",
  "liga-mx": "liga-mx",
  bundesliga: "bundesliga",
  "serie-a": "serie-a",
  "ligue-1": "ligue-1",
};

export interface MatchXg {
  homeXg: number;
  awayXg: number;
}

export interface XgLookup {
  /** xG del partido por fecha (±1 día) y equipos en ids del pipeline; `null` si no hay. */
  get(date: string, home: string, away: string): MatchXg | null;
  readonly size: number;
}

const DAY_MS = 86_400_000;

function shiftDay(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function createXgLookup(entries: Iterable<{ date: string; home: string; away: string } & MatchXg>): XgLookup {
  const map = new Map<string, MatchXg>();
  for (const e of entries) map.set(`${e.date}|${e.home}|${e.away}`, { homeXg: e.homeXg, awayXg: e.awayXg });
  return {
    size: map.size,
    get(date, home, away) {
      for (const d of [date, shiftDay(date, -1), shiftDay(date, 1)]) {
        const hit = map.get(`${d}|${home}|${away}`);
        if (hit) return hit;
      }
      return null;
    },
  };
}

/** Arma la búsqueda desde filas de Bzzoiro y el mapa de equipos aprendido por `history:link`. */
export function buildXgLookup(
  league: string,
  rows: readonly BzzoiroMatchRow[],
  teamMap: Readonly<Record<string, { team: string }>>,
): XgLookup {
  const entries = [];
  for (const row of rows) {
    const hs = row.stats?.home;
    const as = row.stats?.away;
    if (hs?.xg == null || as?.xg == null) continue;
    if (hs.xgEstimated !== false || as.xgEstimated !== false) continue;
    const home = teamMap[String(row.home.providerTeamId)]?.team;
    const away = teamMap[String(row.away.providerTeamId)]?.team;
    if (!home || !away) continue;
    entries.push({
      date: row.kickoffUtc.slice(0, 10),
      home: remapTeam(home, league),
      away: remapTeam(away, league),
      homeXg: hs.xg,
      awayXg: as.xg,
    });
  }
  return createXgLookup(entries);
}

/** Carga la búsqueda de una liga, o `null` si la liga no usa xG o faltan los archivos. */
export function loadXgLookup(league: string, researchDir: string = RESEARCH): XgLookup | null {
  if (!XG_ELO_LEAGUES.has(league)) return null;
  const corpusFile = CORPUS_FILE[league];
  if (!corpusFile) return null;
  const rowsPath = resolve(researchDir, "bzzoiro", `${league}.jsonl`);
  const teamsPath = resolve(researchDir, "provider-ids", `${corpusFile}.teams.json`);
  if (!existsSync(rowsPath) || !existsSync(teamsPath)) return null;
  try {
    const rows = readFileSync(rowsPath, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as BzzoiroMatchRow);
    const teams = JSON.parse(readFileSync(teamsPath, "utf8")) as {
      bzzoiro?: Record<string, { team: string }>;
    };
    const lookup = buildXgLookup(league, rows, teams.bzzoiro ?? {});
    return lookup.size > 0 ? lookup : null;
  } catch (error) {
    console.warn(
      `[xg] No se pudo leer el xG de ${league}; sigo con goles: ${error instanceof Error ? error.message : error}`,
    );
    return null;
  }
}
