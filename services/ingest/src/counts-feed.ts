/**
 * Córners, faltas y amarillas esperados para el análisis de fútbol (`@pitchlab/models` counts,
 * validado en `backtest:counts`, docs/architecture/PLAN_MOTORES_Y_FUENTES_2026_11.md §10).
 *
 * Fuentes (research-only, fuera de Git; en Actions se descargan en el mismo corte):
 *  - Ligas europeas: `data/history/research/<archivo-corpus>.jsonl` de football-data.co.uk
 *    (`pnpm history:odds`), con ids de equipo del corpus.
 *  - Liga MX: `research/bzzoiro/liga-mx.jsonl` + el mapa de equipos de `history:link`.
 *
 * Si faltan los archivos o un equipo no tiene al menos `MIN_SAMPLE` partidos con el dato, ese
 * conteo no se publica: el motor nunca rellena con promedios de liga como si fueran del partido.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  asMarketKey,
  type AnalysisMarketGroup,
  type CountProjection,
  type GameAnalysis,
  type GameDTO,
} from "@pitchlab/contracts";
import {
  COUNT_DEFAULTS,
  COUNT_DISPERSION,
  balancedLine,
  createCountTracker,
  overProbability,
  sumDispersion,
  type CountStat,
  type CountTracker,
} from "@pitchlab/models";
import type { BzzoiroMatchRow } from "./providers/bzzoiro.js";
import { remapTeam } from "./prior-season.js";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const RESEARCH = resolve(ROOT, "data", "history", "research");

export const MIN_SAMPLE = 5;
const STATS: readonly CountStat[] = ["corners", "fouls", "yellow"];

const CORPUS_FILE: Record<string, string> = {
  "premier-league": "premier-league",
  laliga: "la-liga",
  bundesliga: "bundesliga",
  "serie-a": "serie-a",
  "ligue-1": "ligue-1",
  "liga-mx": "liga-mx",
};

export interface CountRow {
  date: string;
  season: string;
  home: string;
  away: string;
  counts: Partial<Record<CountStat, [number, number]>>;
}

export interface CountFeed {
  readonly games: number;
  predict(home: string, away: string): Partial<Record<CountStat, CountProjection>>;
}

const pair = (h: number | null | undefined, a: number | null | undefined): [number, number] | undefined =>
  typeof h === "number" && typeof a === "number" ? [h, a] : undefined;

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

/** Corre los tres trackers sobre toda la historia y predice con lo último. */
export function buildCountFeed(rows: readonly CountRow[]): CountFeed {
  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const season = ordered.at(-1)?.season ?? "";
  const trackers = Object.fromEntries(STATS.map((s) => [s, createCountTracker(COUNT_DEFAULTS[s])])) as Record<
    CountStat,
    CountTracker
  >;
  for (const r of ordered) {
    for (const s of STATS) {
      const c = r.counts[s];
      if (c) trackers[s].update({ ...r, homeCount: c[0], awayCount: c[1] });
    }
  }
  return {
    games: ordered.length,
    predict(home, away) {
      const out: Partial<Record<CountStat, CountProjection>> = {};
      for (const s of STATS) {
        const p = trackers[s].predict({ home, away, season });
        if (p.homeGames < MIN_SAMPLE || p.awayGames < MIN_SAMPLE) continue;
        const size = sumDispersion(p.home, p.away, COUNT_DISPERSION[s]);
        const line = balancedLine(p.total, size);
        out[s] = {
          home: round(p.home, 2),
          away: round(p.away, 2),
          total: round(p.total, 2),
          line,
          pOver: round(overProbability(p.total, size, line), 4),
          sample: { home: p.homeGames, away: p.awayGames },
        };
      }
      return out;
    },
  };
}

function readJsonl<T>(file: string): T[] {
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

/** Filas de football-data.co.uk (`history:odds`) con ids del pipeline. */
export function countRowsFromFootballData(league: string, file: string): CountRow[] {
  type R = {
    date: string;
    season: string;
    homeTeam: string;
    awayTeam: string;
    stats?: {
      cornersHome: number | null;
      cornersAway: number | null;
      foulsHome?: number | null;
      foulsAway?: number | null;
      yellowHome: number | null;
      yellowAway: number | null;
    };
  };
  return readJsonl<R>(file)
    .filter((r) => r.stats)
    .map((r) => ({
      date: r.date,
      season: r.season,
      home: remapTeam(r.homeTeam, league),
      away: remapTeam(r.awayTeam, league),
      counts: {
        corners: pair(r.stats!.cornersHome, r.stats!.cornersAway),
        fouls: pair(r.stats!.foulsHome, r.stats!.foulsAway),
        yellow: pair(r.stats!.yellowHome, r.stats!.yellowAway),
      },
    }));
}

/** Filas de Bzzoiro con el mapa de equipos aprendido por `history:link`. */
export function countRowsFromBzzoiro(
  league: string,
  rows: readonly BzzoiroMatchRow[],
  teamMap: Readonly<Record<string, { team: string }>>,
): CountRow[] {
  const out: CountRow[] = [];
  for (const r of rows) {
    if (r.status !== "finished" || !r.stats) continue;
    const home = teamMap[String(r.home.providerTeamId)]?.team;
    const away = teamMap[String(r.away.providerTeamId)]?.team;
    if (!home || !away) continue;
    const hs = r.stats.home;
    const as = r.stats.away;
    out.push({
      date: r.kickoffUtc.slice(0, 10),
      season: String(r.providerSeasonId),
      home: remapTeam(home, league),
      away: remapTeam(away, league),
      counts: {
        corners: pair(hs.corners, as.corners),
        fouls: pair(hs.fouls, as.fouls),
        yellow: pair(hs.yellowCards, as.yellowCards),
      },
    });
  }
  return out;
}

/** Carga el feed de una liga, o `null` si faltan los archivos (el análisis sigue sin conteos). */
export function loadCountFeed(league: string, researchDir: string = RESEARCH): CountFeed | null {
  const corpusFile = CORPUS_FILE[league];
  if (!corpusFile) return null;
  try {
    let rows: CountRow[] = [];
    if (league === "liga-mx") {
      const rowsPath = resolve(researchDir, "bzzoiro", "liga-mx.jsonl");
      const teamsPath = resolve(researchDir, "provider-ids", "liga-mx.teams.json");
      if (!existsSync(rowsPath) || !existsSync(teamsPath)) return null;
      const teams = JSON.parse(readFileSync(teamsPath, "utf8")) as { bzzoiro?: Record<string, { team: string }> };
      rows = countRowsFromBzzoiro(league, readJsonl<BzzoiroMatchRow>(rowsPath), teams.bzzoiro ?? {});
    } else {
      const file = resolve(researchDir, `${corpusFile}.jsonl`);
      if (!existsSync(file)) return null;
      rows = countRowsFromFootballData(league, file);
    }
    return rows.length > 0 ? buildCountFeed(rows) : null;
  } catch (error) {
    console.warn(`[conteos] No se pudo leer ${league}; sigo sin córners/faltas: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

const LABELS: Record<CountStat, { group: string; noun: string; key: string }> = {
  corners: { group: "Tiros de esquina", noun: "tiros de esquina", key: "corners_total" },
  fouls: { group: "Faltas", noun: "faltas", key: "fouls_total" },
  yellow: { group: "Tarjetas amarillas", noun: "amarillas", key: "yellow_total" },
};

/**
 * Agrega los conteos al análisis: campo `counts`, un grupo de mercado por conteo (más/menos en
 * la línea equilibrada) y un factor legible. No toca picks, 1X2 ni la confianza.
 */
export function withCountProjections(analysis: GameAnalysis, game: GameDTO, feed: CountFeed | null): GameAnalysis {
  if (!feed) return analysis;
  const counts = feed.predict(game.home.id, game.away.id);
  const stats = STATS.filter((s) => counts[s]);
  if (stats.length === 0) return analysis;

  const groups: AnalysisMarketGroup[] = [];
  const factors: GameAnalysis["factors"] = [];
  for (const s of stats) {
    const c = counts[s]!;
    const l = LABELS[s];
    const lineText = c.line.toFixed(1);
    groups.push({
      group: `${l.group} ${lineText}`,
      rows: [
        { market: asMarketKey(l.key), selection: "over", label: `Más de ${lineText}`, line: c.line, p: c.pOver, fairOdds: 1 / c.pOver },
        { market: asMarketKey(l.key), selection: "under", label: `Menos de ${lineText}`, line: c.line, p: 1 - c.pOver, fairOdds: 1 / (1 - c.pOver) },
      ],
    });
    factors.push({
      key: `${s}_expected`,
      label: l.group,
      value: `${c.total.toFixed(1)} ${l.noun} esperados`,
      detail: `${game.home.shortName} ${c.home.toFixed(1)} · ${game.away.shortName} ${c.away.toFixed(1)}`,
    });
  }
  return {
    ...analysis,
    counts,
    marketGroups: [...analysis.marketGroups, ...groups],
    probabilities: [
      ...analysis.probabilities,
      ...groups.flatMap((g) => g.rows.map((r) => ({ market: r.market, selection: r.label, line: r.line, p: r.p, fairOdds: r.fairOdds }))),
    ],
    factors: [...analysis.factors, ...factors],
  };
}
