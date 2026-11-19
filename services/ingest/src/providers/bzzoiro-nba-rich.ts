/**
 * NBA enriquecido desde Bzzoiro Basketball API (`/basketball/api/v2/`).
 *
 * Cubre los recursos adicionales disponibles en la cuenta:
 *  - `/basketball/api/v2/standings/?league=1` -> clasificación oficial Este/Oeste
 *  - `/basketball/api/v2/events/{id}/box-score/` y `/team-stats/` -> métricas de eficiencia NBA
 *  - `/basketball/api/v2/events/{id}/odds/` -> cuotas NBA (`moneyline`, `spread`, `totals`) con apertura y movimiento
 *  - `/basketball/api/v2/events/{id}/pregame/` -> contexto prepartido (árbitros/descanso/notas)
 *  - `/basketball/api/v2/players/{id}/games/` -> bitácora de últimos juegos para props de jugador NBA
 */
import type { StandingRow } from "@pitchlab/contracts";
import type { OddsLineMovement, OddsSnapshotRow } from "@pitchlab/spacetime";
import { normalizeLine } from "@pitchlab/spacetime";
import { resolveCanonicalTeam } from "../mappings.js";
import { PERMITTED_BOOK_IDS } from "../validation/snapshot-validator.js";
import { divisionMetaForTeam, finalizeConferenceStandings } from "../us-divisions.js";
import type { ProviderClient } from "./http.js";
import type { BzList } from "./bzzoiro-live.js";

const NBA_LEAGUE_ID = 1;

export interface BzNbaStandingRowRaw {
  team?: string | { id?: number | null; name?: string | null; short_name?: string | null } | null;
  team_name?: string | null;
  wins?: number | null;
  losses?: number | null;
  played?: number | null;
  win_pct?: number | null;
  points_for?: number | null;
  points_against?: number | null;
  games_behind?: string | number | null;
  seed?: number | null;
  rank?: number | null;
  conference?: string | null;
  division?: string | null;
}

export interface BzNbaTeamBoxRaw {
  fg_pct?: number | null;
  three_pt_pct?: number | null;
  ft_pct?: number | null;
  rebounds?: number | null;
  assists?: number | null;
  turnovers?: number | null;
  steals?: number | null;
  blocks?: number | null;
  points_in_paint?: number | null;
  pace?: number | null;
  offensive_rating?: number | null;
  defensive_rating?: number | null;
}

export interface BzNbaBoxScoreSummary {
  home: NbaBoxTeamMetrics;
  away: NbaBoxTeamMetrics;
}

export interface NbaBoxTeamMetrics {
  fgPct: number | null;
  threePtPct: number | null;
  ftPct: number | null;
  rebounds: number | null;
  assists: number | null;
  turnovers: number | null;
  steals: number | null;
  blocks: number | null;
  pointsInPaint: number | null;
  pace: number | null;
  offRating: number | null;
  defRating: number | null;
}

export interface BzNbaOddsRowRaw {
  market?: string | null;
  outcome?: string | null;
  selection?: string | null;
  line?: number | null;
  bookmaker_slug?: string | null;
  decimal_odds?: number | null;
  opening_odds?: number | null;
  movement?: string | null;
  is_live?: boolean | null;
}

export interface BzNbaPlayerGameRaw {
  game_date?: string | null;
  opponent?: string | null;
  minutes?: number | null;
  points?: number | null;
  pts?: number | null;
  rebounds?: number | null;
  reb?: number | null;
  assists?: number | null;
  ast?: number | null;
  three_pointers_made?: number | null;
  tpm?: number | null;
  steals?: number | null;
  blocks?: number | null;
}

export interface NbaPlayerPropSeed {
  readonly player: string;
  readonly teamSlug: string;
  readonly teamName: string;
  readonly position: string;
  readonly statKey: "pts" | "reb" | "ast" | "tpm" | "pra";
  readonly statLabel: string;
  readonly baseLine: number;
  readonly projectionMean: number;
  readonly projectionSd: number;
  readonly last10: number[];
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapConferenceEs(raw: string | null | undefined, fallback?: string): string | undefined {
  const v = (raw ?? "").trim().toLowerCase();
  if (v.includes("east") || v === "este") return "Este";
  if (v.includes("west") || v === "oeste") return "Oeste";
  return fallback;
}

function teamSlugOf(teamId: string): string {
  return teamId.includes(".") ? teamId.split(".").slice(1).join(".") : teamId;
}

/** Convierte `/basketball/api/v2/standings/?league=1` a `StandingRow[]` canónicos NBA. */
export function parseBzzoiroNbaStandings(
  raw: BzList<BzNbaStandingRowRaw> | { east?: BzNbaStandingRowRaw[]; west?: BzNbaStandingRowRaw[] } | null,
): StandingRow[] {
  if (!raw) return [];
  const entries: Array<{ row: BzNbaStandingRowRaw; forcedConf?: string }> = [];
  if (typeof raw === "object" && !Array.isArray(raw) && ("east" in raw || "west" in raw)) {
    const conf = raw as { east?: BzNbaStandingRowRaw[]; west?: BzNbaStandingRowRaw[] };
    for (const row of conf.east ?? []) entries.push({ row, forcedConf: "Este" });
    for (const row of conf.west ?? []) entries.push({ row, forcedConf: "Oeste" });
  } else {
    const listObj = raw as { results?: BzNbaStandingRowRaw[] };
    const arr = Array.isArray(raw) ? raw : (listObj.results ?? []);
    for (const row of arr) entries.push({ row });
  }

  const parsed: StandingRow[] = [];
  for (const { row, forcedConf } of entries) {
    const rawName =
      typeof row.team === "string"
        ? row.team
        : row.team?.name ?? row.team_name ?? "";
    if (!rawName.trim()) continue;
    let resolved: ReturnType<typeof resolveCanonicalTeam>;
    try {
      resolved = resolveCanonicalTeam("nba", rawName);
    } catch (err) {
      void err;
      continue;
    }

    const won = num(row.wins) ?? 0;
    const lost = num(row.losses) ?? 0;
    const played = num(row.played) ?? won + lost;
    const meta = divisionMetaForTeam("nba", teamSlugOf(resolved.id));
    const conference = forcedConf ?? mapConferenceEs(row.conference, meta?.conference);
    const winPctRaw = num(row.win_pct);
    const winPct =
      winPctRaw !== null
        ? Math.round((winPctRaw > 1 ? winPctRaw / 100 : winPctRaw) * 1000) / 1000
        : played > 0
          ? Math.round((won / played) * 1000) / 1000
          : 0;
    const gbRaw = row.games_behind != null ? String(row.games_behind).trim() : "";
    const gamesBehind = gbRaw === "0" || gbRaw === "0.0" || gbRaw === "-" ? "-" : gbRaw || undefined;
    const seed = num(row.seed ?? row.rank);

    parsed.push({
      teamId: resolved.id,
      name: resolved.name,
      shortName: resolved.shortName,
      code: resolved.code,
      played,
      won,
      drawn: 0,
      lost,
      goalsFor: num(row.points_for) ?? 0,
      goalsAgainst: num(row.points_against) ?? 0,
      points: won * 2,
      winPct,
      ...(conference ? { conference } : {}),
      ...(meta?.division || row.division ? { division: row.division?.trim() || meta?.division } : {}),
      ...(gamesBehind ? { gamesBehind } : {}),
      ...(seed !== null && seed >= 1 ? { seed: Math.round(seed) } : {}),
    });
  }

  return finalizeConferenceStandings("nba", parsed, { computeGamesBehind: true });
}

function parseNbaSideBox(raw: BzNbaTeamBoxRaw | null | undefined): NbaBoxTeamMetrics {
  return {
    fgPct: num(raw?.fg_pct),
    threePtPct: num(raw?.three_pt_pct),
    ftPct: num(raw?.ft_pct),
    rebounds: num(raw?.rebounds),
    assists: num(raw?.assists),
    turnovers: num(raw?.turnovers),
    steals: num(raw?.steals),
    blocks: num(raw?.blocks),
    pointsInPaint: num(raw?.points_in_paint),
    pace: num(raw?.pace),
    offRating: num(raw?.offensive_rating),
    defRating: num(raw?.defensive_rating),
  };
}

/** Interpreta `/basketball/api/v2/events/{id}/box-score/` y `/team-stats/`. */
export function parseBzzoiroNbaBoxScore(
  raw: { home?: BzNbaTeamBoxRaw | null; away?: BzNbaTeamBoxRaw | null; team_stats?: { home?: BzNbaTeamBoxRaw; away?: BzNbaTeamBoxRaw } } | null,
): BzNbaBoxScoreSummary | null {
  if (!raw) return null;
  const h = raw.team_stats?.home ?? raw.home;
  const a = raw.team_stats?.away ?? raw.away;
  if (!h && !a) return null;
  return { home: parseNbaSideBox(h), away: parseNbaSideBox(a) };
}

const NBA_BOOK_MAP: Readonly<Record<string, string>> = {
  pinnacle: "pinnacle",
  bet365: "bet365",
  codere: "codere",
  betcris: "betcris",
  draftkings: "draftkings",
  fanduel: "fanduel",
  betmgm: "betmgm",
  bwin: "bwin",
  "william-hill": "william_hill",
  unibet: "unibet",
  betonline: "betonline",
};

/** Interpreta `/basketball/api/v2/events/{id}/odds/` en filas `OddsSnapshotRow` canónicas para NBA. */
export function parseBzzoiroNbaOdds(params: {
  homeTeamRaw: string;
  awayTeamRaw: string;
  kickoffUtc: string;
  capturedAtUtc: string;
  odds: readonly BzNbaOddsRowRaw[];
}): OddsSnapshotRow[] {
  let home: ReturnType<typeof resolveCanonicalTeam>;
  let away: ReturnType<typeof resolveCanonicalTeam>;
  try {
    home = resolveCanonicalTeam("nba", params.homeTeamRaw);
    away = resolveCanonicalTeam("nba", params.awayTeamRaw);
  } catch (err) {
    void err;
    return [];
  }
  const homeSlug = teamSlugOf(home.id);
  const awaySlug = teamSlugOf(away.id);
  if (homeSlug === awaySlug) return [];

  const ymd = params.kickoffUtc.slice(0, 10).replace(/-/g, "");
  const eventId = `ws:basketball:NBA:${ymd}:${homeSlug}:${awaySlug}`;
  const out: OddsSnapshotRow[] = [];

  for (const row of params.odds) {
    if (row.is_live === true) continue;
    const bookSlug = String(row.bookmaker_slug ?? "").trim().toLowerCase();
    const book = NBA_BOOK_MAP[bookSlug];
    if (!book || !PERMITTED_BOOK_IDS.has(book)) continue;

    const price = num(row.decimal_odds);
    if (price === null || price < 1.01 || price > 1000) continue;

    const rawMkt = String(row.market ?? "").trim().toLowerCase();
    const rawSel = String(row.outcome ?? row.selection ?? "").trim().toLowerCase();
    let market: string | null = null;
    let selection: string | null = null;
    let line: number | null = null;

    if (rawMkt === "moneyline" || rawMkt === "h2h" || rawMkt === "winner") {
      if (rawSel === "home" || rawSel === "away") {
        market = "moneyline";
        selection = rawSel;
      }
    } else if (rawMkt === "spread" || rawMkt === "handicap") {
      line = normalizeLine(Number(row.line));
      if (line !== null && (rawSel === "home" || rawSel === "away")) {
        market = "spread";
        selection = rawSel;
      }
    } else if (rawMkt === "totals" || rawMkt === "over_under" || rawMkt === "total_points") {
      line = normalizeLine(Number(row.line));
      if (line !== null && (rawSel === "over" || rawSel === "under")) {
        market = "totals";
        selection = rawSel;
      }
    }
    if (!market || !selection) continue;

    const open = num(row.opening_odds);
    const movStr = String(row.movement ?? "").trim().toUpperCase();
    const movement: OddsLineMovement | undefined =
      movStr === "SHORTENING"
        ? "shortening"
        : movStr === "DRIFTING"
          ? "drifting"
          : open !== null && open > 1.01
            ? price - open <= -0.02
              ? "shortening"
              : price - open >= 0.02
                ? "drifting"
                : "stable"
            : undefined;

    out.push({
      event_id: eventId,
      sport: "basketball",
      league: "NBA",
      market,
      line,
      selection,
      book,
      price_decimal: price,
      ...(open !== null && open >= 1.01 && open <= 1000 ? { opening_price: open } : {}),
      ...(movement ? { movement_direction: movement } : {}),
      ts_captured: params.capturedAtUtc,
      ts_event_start: params.kickoffUtc,
      source: "scraped_ws",
    });
  }

  return out;
}

function meanAndSd(values: readonly number[]): { mean: number; sd: number } {
  if (values.length === 0) return { mean: 0, sd: 1 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return {
    mean: Math.round(mean * 100) / 100,
    sd: Math.max(0.6, Math.round(Math.sqrt(variance) * 100) / 100),
  };
}

function roundHalfLine(mean: number): number {
  return Math.max(0.5, Math.floor(mean) + 0.5);
}

/**
 * Construye seeds de props NBA (`PTS`, `REB`, `AST`, `3PM`, `P+R+A`) a partir de `/basketball/api/v2/players/{id}/games/`.
 */
export function buildNbaPlayerPropSeeds(params: {
  player: string;
  teamSlug: string;
  teamName: string;
  position?: string;
  games: readonly BzNbaPlayerGameRaw[];
}): NbaPlayerPropSeed[] {
  const recent = params.games.slice(0, 10);
  if (recent.length < 3) return [];

  const defs: Array<{
    key: NbaPlayerPropSeed["statKey"];
    label: string;
    extract: (g: BzNbaPlayerGameRaw) => number | null;
  }> = [
    { key: "pts", label: "Puntos anotados", extract: (g) => num(g.points ?? g.pts) },
    { key: "reb", label: "Rebotes totales", extract: (g) => num(g.rebounds ?? g.reb) },
    { key: "ast", label: "Asistencias", extract: (g) => num(g.assists ?? g.ast) },
    { key: "tpm", label: "Triples anotados", extract: (g) => num(g.three_pointers_made ?? g.tpm) },
    {
      key: "pra",
      label: "Puntos + Rebotes + Asistencias",
      extract: (g) => {
        const p = num(g.points ?? g.pts);
        const r = num(g.rebounds ?? g.reb);
        const a = num(g.assists ?? g.ast);
        return p !== null && r !== null && a !== null ? p + r + a : null;
      },
    },
  ];

  const seeds: NbaPlayerPropSeed[] = [];
  for (const d of defs) {
    const vals = recent.map(d.extract).filter((v): v is number => v !== null && v >= 0);
    if (vals.length < 3) continue;
    const { mean, sd } = meanAndSd(vals);
    if (mean < 0.8) continue;
    seeds.push({
      player: params.player,
      teamSlug: params.teamSlug,
      teamName: params.teamName,
      position: params.position ?? "NBA",
      statKey: d.key,
      statLabel: d.label,
      baseLine: roundHalfLine(mean),
      projectionMean: mean,
      projectionSd: sd,
      last10: vals.slice(0, 10),
    });
  }
  return seeds;
}

/** Fetchers de alto nivel sobre `ProviderClient` (para us-snapshot / scripts con clave). */
export async function fetchBzzoiroNbaStandings(client: ProviderClient): Promise<StandingRow[]> {
  const raw = await client.get<BzList<BzNbaStandingRowRaw> | { east?: BzNbaStandingRowRaw[]; west?: BzNbaStandingRowRaw[] }>(
    `/basketball/api/v2/standings/?league=${NBA_LEAGUE_ID}`,
    { cache: false },
  );
  return parseBzzoiroNbaStandings(raw);
}

export async function fetchBzzoiroNbaPlayerGames(
  client: ProviderClient,
  providerPlayerId: number,
): Promise<BzNbaPlayerGameRaw[]> {
  const raw = await client.get<BzList<BzNbaPlayerGameRaw>>(
    `/basketball/api/v2/players/${providerPlayerId}/games/?limit=15`,
    { cache: false },
  );
  if (!raw) return [];
  return Array.isArray(raw) ? raw : (raw.results ?? []);
}
