/**
 * Extensión **research-only** del corpus de Liga MX con partidos de Bzzoiro que openfootball
 * no publica (2021-22 a 2023-24, liguillas y de 2025-26 en adelante).
 *
 * Las filas tienen la misma forma e `id` que el corpus (`liga-mx:<temporada>:<torneo>:<local>:<visitante>`)
 * para que el backtest pueda evaluarlas con `--extend-corpus`, pero viven en
 * `data/history/research/extended/` (ignorado por Git): la licencia de Bzzoiro no permite
 * redistribuir el dato crudo, así que nunca entran al corpus publicable.
 */
import type { BzzoiroMatchRow } from "./bzzoiro.js";

export interface ExtendedGame {
  id: string;
  sport: "soccer";
  league: "liga-mx";
  season: string;
  period: number;
  stage: string;
  phase: "regular" | "postseason";
  date: string;
  kickoff: string | null;
  kickoffZone: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  neutralSite: boolean;
  source: "bzzoiro";
  sourceId: string;
  availableAt: string;
  usage: "research-only";
}

/** Ids de liga de Bzzoiro para Liga MX. */
const APERTURA_LEAGUE = 19;
const CLAUSURA_LEAGUE = 20;
const REGULAR_STAGES = new Set(["regular-season", "league-phase"]);

const MX_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Mexico_City",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Fecha y hora civil en Ciudad de México (el corpus usa la fecha local del partido). */
export function mexicoCityDateTime(iso: string): { date: string; time: string } {
  const parts = Object.fromEntries(MX_FORMAT.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** Temporada y torneo: Apertura jul–dic del año Y → `Y-(Y+1)`; Clausura ene–may del año Y → `(Y-1)-Y`. */
export function ligaMxSeason(row: Pick<BzzoiroMatchRow, "providerLeagueId" | "kickoffUtc">): {
  season: string;
  tournament: "Apertura" | "Clausura";
} | null {
  const { date } = mexicoCityDateTime(row.kickoffUtc);
  const year = Number.parseInt(date.slice(0, 4), 10);
  const label = (start: number): string => `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
  if (row.providerLeagueId === APERTURA_LEAGUE) return { season: label(year), tournament: "Apertura" };
  if (row.providerLeagueId === CLAUSURA_LEAGUE) return { season: label(year - 1), tournament: "Clausura" };
  return null;
}

function slugOf(team: string): string {
  return team.slice(team.indexOf(".") + 1);
}

export interface ExtendOptions {
  /** providerTeamId → equipo del corpus (`liga-mx.<slug>`), aprendido por `linkProviderGames`. */
  readonly teamMap: ReadonlyMap<number, string>;
  /** providerMatchIds ya emparejados con el corpus (no se duplican). */
  readonly linked: ReadonlySet<number>;
  /** ids del corpus, para no chocar. */
  readonly corpusIds: ReadonlySet<string>;
}

export function buildLigaMxExtension(rows: readonly BzzoiroMatchRow[], options: ExtendOptions): ExtendedGame[] {
  const finished = rows.filter(
    (r) =>
      !options.linked.has(r.providerMatchId) &&
      r.status === "finished" &&
      r.score.home !== null &&
      r.score.away !== null,
  );

  // Orden de las fases de liguilla dentro de cada torneo, por fecha de su primer partido.
  const stageStart = new Map<string, string>();
  for (const r of finished) {
    const s = ligaMxSeason(r);
    if (!s || REGULAR_STAGES.has(r.stage ?? "")) continue;
    const key = `${s.season}|${s.tournament}|${r.stage}`;
    const prev = stageStart.get(key);
    if (!prev || r.kickoffUtc < prev) stageStart.set(key, r.kickoffUtc);
  }
  const playoffPeriod = (season: string, tournament: string, stage: string): number => {
    const key = `${season}|${tournament}|${stage}`;
    const mine = stageStart.get(key) ?? "";
    let order = 1;
    for (const [k, start] of stageStart) {
      if (k.startsWith(`${season}|${tournament}|`) && start < mine) order++;
    }
    return order;
  };

  const out: ExtendedGame[] = [];
  const usedIds = new Set(options.corpusIds);
  for (const r of [...finished].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc))) {
    const s = ligaMxSeason(r);
    if (!s) continue;
    const homeTeam = options.teamMap.get(r.home.providerTeamId) ?? `liga-mx.${r.home.slug}`;
    const awayTeam = options.teamMap.get(r.away.providerTeamId) ?? `liga-mx.${r.away.slug}`;
    const regular = REGULAR_STAGES.has(r.stage ?? "");
    const stage = regular ? s.tournament : `${s.tournament} Playoffs`;
    const stageSlug = stage.toLowerCase().replace(/\s+/g, "-");
    let id = `liga-mx:${s.season}:${stageSlug}:${slugOf(homeTeam)}:${slugOf(awayTeam)}`;
    for (let n = 2; usedIds.has(id); n++) id = `${id.replace(/#\d+$/, "")}#${n}`;
    usedIds.add(id);
    const { date, time } = mexicoCityDateTime(r.kickoffUtc);
    out.push({
      id,
      sport: "soccer",
      league: "liga-mx",
      season: s.season,
      period: regular ? Math.max(1, r.round ?? 1) : playoffPeriod(s.season, s.tournament, r.stage ?? ""),
      stage,
      phase: regular ? "regular" : "postseason",
      date,
      kickoff: time,
      kickoffZone: "America/Mexico_City",
      homeTeam,
      awayTeam,
      homeScore: r.score.home!,
      awayScore: r.score.away!,
      neutralSite: r.context.neutral,
      source: "bzzoiro",
      sourceId: `bzzoiro:${r.providerMatchId}`,
      availableAt: new Date(Date.parse(`${date}T23:59:59.000Z`) + 86_400_000).toISOString(),
      usage: "research-only",
    });
  }
  return out;
}
