import fs from "node:fs";
import path from "node:path";
import {
  asLeagueId,
  findNationalTeamDef,
  isNationalCompetition,
  LeagueSquadsFileSchema,
  sportForLeague,
  sportHasDraw,
  sportScoringUnit,
  type LeagueSnapshot,
  type LeagueSquadsFile,
  type TeamSquadEntry,
} from "@pitchlab/contracts";
import type { PlatformGame, PlayerPropItem } from "@pitchlab/ui";
import { resolveTeamVenueGeo } from "@pitchlab/ui/team-venues";
import type {
  PlatformSport,
  PlayerProfileData,
  TeamInjuryItem,
  TeamLeagueDirectoryItem,
  TeamMatchHistoryRow,
  TeamModelMetric,
  TeamPlayerPick,
  TeamProfileData,
  TeamRecentAverages,
  TeamSplitRecord,
  TeamSquadPlayer,
  TeamSquadSummary,
  TeamStandingSummary,
  TeamUpcomingFixtureRow,
  TeamVenueInfo,
} from "@pitchlab/ui/team-profile";
import {
  LEAGUE_LABELS,
  loadRawLeagueSnapshot,
  PRODUCT_LEAGUES,
  resolveSnapshotsRoot,
  type ProductLeague,
} from "./snapshots";
import { findSpacetimeTeamRecord } from "./spacetime";

interface SnapshotTeamRef {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  code: string;
}

interface InjuriesFilePayload {
  entries?: Array<{
    teamId?: string;
    player?: string;
    position?: string;
    status?: string;
    detail?: string;
    reportedAt?: string;
  }>;
}

interface HistoryJsonlEntry {
  id: string;
  season?: string;
  period?: number;
  stage?: string | null;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  neutralSite?: boolean;
}

interface InternalFinishedGame {
  id: string;
  gameHref: string | null;
  date: string;
  sortKey: string;
  round: string | null;
  homeTeamKey: string;
  awayTeamKey: string;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  neutralSite: boolean;
  resultNote: string | null;
  fromSnapshot: boolean;
}

const HISTORY_FILENAME_OVERRIDES: Readonly<Record<string, string>> = {
  laliga: "la-liga.jsonl",
  "uefa-nations": "international.jsonl",
  "concacaf-nations": "international.jsonl",
  amistosos: "international.jsonl",
  "copa-del-mundo": "international.jsonl",
  eliminatorias: "international.jsonl",
  "copa-america": "international.jsonl",
  eurocopa: "international.jsonl",
  "copa-oro": "international.jsonl",
  "copa-africana": "international.jsonl",
  "copa-asiatica": "international.jsonl",
};

/** Equivalencias entre slugs de snapshot y slugs históricos (sin exponer nombres de proveedores). */
const SLUG_CANONICAL_ALIASES: Readonly<Record<string, string>> = {
  "atlas-guadalajara": "atlas",
  "deportivo-guadalajara": "chivas",
  chivas: "chivas",
  guadalajara: "chivas",
  "gallos-blancos": "queretaro",
  juarez: "fc-juarez",
  "uanl-tigres": "tigres-uanl",
  "deportivo-toluca": "toluca",
  bournemouth: "afc-bournemouth",
  athletic: "athletic-club",
  celta: "celta-vigo",
  "espanyol-barcelona": "espanyol",
  "real-racing-santander": "racing-santander",
  atalanta: "atalanta-bc",
  inter: "internazionale-milano",
  lens: "racing-lens",
  strasbourg: "strasbourg-alsace",
  "estac-troyes": "es-troyes",
};

const SHORT_DATE_MX = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const KICKOFF_DAY_MX = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  weekday: "short",
  day: "numeric",
  month: "short",
});

const KICKOFF_TIME_MX = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const ENGINE_BY_SPORT: Readonly<Record<PlatformSport, string>> = {
  football: "Tachyon v3.0 · Índice de fuerza",
  "american-football": "Minkowski v3.0 · Eficiencia por jugada",
  basketball: "Motor NBA · Ritmo y eficiencia",
  "ice-hockey": "Motor NHL · Peligro y posesión",
};

const historyCache = new Map<string, { mtimeMs: number; entries: HistoryJsonlEntry[] }>();

export function isProductLeague(raw: string): raw is ProductLeague {
  return (PRODUCT_LEAGUES as readonly string[]).includes(raw);
}

function slugFromTeamId(teamId: string): string {
  const clean = teamId.trim().toLowerCase();
  return clean.includes(".") ? clean.split(".").slice(1).join(".") : clean;
}

function canonicalSlug(rawIdOrSlug: string): string {
  const bare = slugFromTeamId(rawIdOrSlug);
  return SLUG_CANONICAL_ALIASES[bare] ?? bare;
}

function toDisplaySport(contractSport: string): PlatformSport {
  if (contractSport === "soccer") return "football";
  if (contractSport === "hockey") return "ice-hockey";
  return contractSport as PlatformSport;
}

function resolveHistoryRoot(): string {
  return path.resolve(resolveSnapshotsRoot(), "..", "history");
}

interface SeasonResultEntry {
  id: string;
  date: string;
  startTime: string;
  round: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  neutralSite?: boolean;
}

const seasonResultsCache = new Map<string, { mtimeMs: number; entries: SeasonResultEntry[] }>();

function loadSeasonResultsEntries(league: ProductLeague): SeasonResultEntry[] {
  const fullPath = path.join(resolveSnapshotsRoot(), league, "season-results.json");
  if (!fs.existsSync(fullPath)) return [];

  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(fullPath).mtimeMs;
  } catch {
    return [];
  }

  const cached = seasonResultsCache.get(fullPath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.entries;

  try {
    const raw = JSON.parse(fs.readFileSync(fullPath, "utf8")) as {
      matches?: SeasonResultEntry[];
    };
    const entries = Array.isArray(raw.matches)
      ? raw.matches.filter(
          (m) =>
            m &&
            typeof m.date === "string" &&
            typeof m.homeScore === "number" &&
            typeof m.awayScore === "number",
        )
      : [];
    seasonResultsCache.set(fullPath, { mtimeMs, entries });
    return entries;
  } catch (err) {
    console.warn(`[team-profile] no se pudo leer season-results de ${league}:`, err);
    return [];
  }
}

function loadRecentHistoryEntries(league: ProductLeague): HistoryJsonlEntry[] {
  const filename = HISTORY_FILENAME_OVERRIDES[league] ?? `${league}.jsonl`;
  const fullPath = path.join(resolveHistoryRoot(), filename);
  if (!fs.existsSync(fullPath)) return [];

  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(fullPath).mtimeMs;
  } catch {
    return [];
  }

  const cached = historyCache.get(fullPath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.entries;

  try {
    const raw = fs.readFileSync(fullPath, "utf8");
    const lines = raw.trim().split(/\r?\n/);
    const tail = filename === "international.jsonl" ? lines : lines.slice(-900);
    const parsed: HistoryJsonlEntry[] = [];
    for (const line of tail) {
      if (!line) continue;
      const row = JSON.parse(line) as HistoryJsonlEntry;
      if (row && typeof row.date === "string" && typeof row.homeScore === "number") {
        parsed.push(row);
      }
    }
    historyCache.set(fullPath, { mtimeMs, entries: parsed });
    return parsed;
  } catch (err) {
    console.warn(`[team-profile] no se pudo leer histórico de ${league}:`, err);
    return [];
  }
}

function formatDateYmdEs(ymd: string): string {
  const ms = Date.parse(`${ymd}T18:00:00Z`);
  return Number.isFinite(ms) ? SHORT_DATE_MX.format(ms) : ymd;
}

function formatIsoUpdatedEs(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return SHORT_DATE_MX.format(ms);
}

function formatPctValue(val: number, decimals = 1): string {
  const scaled = Math.abs(val) <= 1 ? val * 100 : val;
  return `${scaled.toFixed(decimals)} %`;
}

function formatSigned(val: number, decimals = 1): string {
  const prefix = val > 0 ? "+" : "";
  return `${prefix}${val.toFixed(decimals)}`;
}

function buildTeamMap(snapshot: LeagueSnapshot): {
  bySlug: Map<string, SnapshotTeamRef>;
  byCanonical: Map<string, SnapshotTeamRef>;
  rankById: Map<string, number>;
} {
  const bySlug = new Map<string, SnapshotTeamRef>();
  const upsert = (ref: {
    id: string;
    name: string;
    shortName: string;
    code: string;
  }) => {
    const slug = slugFromTeamId(ref.id);
    if (!bySlug.has(slug)) {
      bySlug.set(slug, {
        id: ref.id,
        slug,
        name: ref.name,
        shortName: ref.shortName,
        code: ref.code,
      });
    }
  };

  for (const row of snapshot.standings ?? []) {
    upsert({
      id: row.teamId,
      name: row.name,
      shortName: row.shortName,
      code: row.code,
    });
  }
  for (const game of snapshot.games) {
    upsert(game.home);
    upsert(game.away);
  }
  for (const rate of Object.values(snapshot.teamRates)) {
    upsert({
      id: rate.teamId,
      name: rate.name,
      shortName: rate.shortName,
      code: rate.code,
    });
  }

  const byCanonical = new Map<string, SnapshotTeamRef>();
  for (const team of bySlug.values()) {
    byCanonical.set(canonicalSlug(team.slug), team);
    byCanonical.set(team.slug, team);
  }

  const rankById = new Map<string, number>();
  (snapshot.standings ?? []).forEach((row, idx) => {
    rankById.set(row.teamId, idx + 1);
  });

  return { bySlug, byCanonical, rankById };
}

function loadLeagueDatedSnapshots(league: ProductLeague, latest: LeagueSnapshot): LeagueSnapshot[] {
  const dir = path.join(resolveSnapshotsRoot(), league);
  if (!fs.existsSync(dir)) return [latest];
  try {
    const dated = fs
      .readdirSync(dir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .slice(-8);
    const out: LeagueSnapshot[] = [latest];
    for (const file of dated) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as LeagueSnapshot;
        if (raw && Array.isArray(raw.games)) out.push(raw);
      } catch (err) {
        console.warn(`[team-profile] snapshot fechado inválido ${league}/${file}:`, err);
      }
    }
    return out;
  } catch (err) {
    console.warn(`[team-profile] error listando snapshots de ${league}:`, err);
    return [latest];
  }
}

function loadTeamInjuries(league: ProductLeague, teamId: string): TeamInjuryItem[] {
  const file = path.join(resolveSnapshotsRoot(), league, "injuries.json");
  if (!fs.existsSync(file)) return [];
  try {
    const payload = JSON.parse(fs.readFileSync(file, "utf8")) as InjuriesFilePayload;
    const entries = payload.entries ?? [];
    return entries
      .filter((e) => e.teamId === teamId && e.player)
      .slice(0, 12)
      .map((e) => ({
        player: e.player!.trim(),
        position: e.position?.trim() || null,
        status: e.status?.trim() || "Reportado",
        detail: e.detail?.trim() || null,
        reportedAt: formatIsoUpdatedEs(e.reportedAt),
      }));
  } catch (err) {
    console.warn(`[team-profile] no se pudo leer injuries.json de ${league}:`, err);
    return [];
  }
}

function computeSplitRecord(rows: InternalFinishedGame[], teamCanon: string): TeamSplitRecord {
  if (rows.length === 0) {
    return { games: 0, wins: 0, draws: 0, losses: 0, scoredAvg: null, concededAvg: null };
  }
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let scored = 0;
  let conceded = 0;
  for (const r of rows) {
    const isHome = r.homeTeamKey === teamCanon;
    const my = isHome ? r.homeScore : r.awayScore;
    const opp = isHome ? r.awayScore : r.homeScore;
    scored += my;
    conceded += opp;
    if (my > opp) wins += 1;
    else if (my === opp) draws += 1;
    else losses += 1;
  }
  return {
    games: rows.length,
    wins,
    draws,
    losses,
    scoredAvg: scored / rows.length,
    concededAvg: conceded / rows.length,
  };
}

function buildRecentAverages(
  finishedNewestFirst: InternalFinishedGame[],
  teamCanon: string,
  sport: PlatformSport,
): TeamRecentAverages {
  const window = finishedNewestFirst.slice(0, 10);
  const overall = computeSplitRecord(window, teamCanon);
  const homeRows = window.filter((r) => !r.neutralSite && r.homeTeamKey === teamCanon);
  const awayRows = window.filter((r) => !r.neutralSite && r.awayTeamKey === teamCanon);

  const streak = window
    .slice(0, 5)
    .reverse()
    .map<"G" | "E" | "P">((r) => {
      const isHome = r.homeTeamKey === teamCanon;
      const my = isHome ? r.homeScore : r.awayScore;
      const opp = isHome ? r.awayScore : r.homeScore;
      if (my > opp) return "G";
      if (my === opp) return "E";
      return "P";
    });

  let cleanSheets: number | null = null;
  if (sport === "football" && window.length > 0) {
    cleanSheets = window.filter((r) => {
      const opp = r.homeTeamKey === teamCanon ? r.awayScore : r.homeScore;
      return opp === 0;
    }).length;
  }

  return {
    sampleGames: window.length,
    scoredAvg: overall.scoredAvg,
    concededAvg: overall.concededAvg,
    marginAvg:
      overall.scoredAvg !== null && overall.concededAvg !== null
        ? overall.scoredAvg - overall.concededAvg
        : null,
    cleanSheets,
    wins: overall.wins,
    draws: overall.draws,
    losses: overall.losses,
    homeRecord: computeSplitRecord(homeRows, teamCanon),
    awayRecord: computeSplitRecord(awayRows, teamCanon),
    streak,
  };
}

function buildModelMetrics(
  league: ProductLeague,
  sport: PlatformSport,
  snapshot: LeagueSnapshot,
  team: SnapshotTeamRef,
  fullAccess: boolean,
  finishedSorted: InternalFinishedGame[] = [],
  teamCanon = "",
): TeamProfileData["modelSection"] {
  const engineLabel = ENGINE_BY_SPORT[sport] ?? "Modelo PitchLab";
  if (!fullAccess) {
    return {
      locked: true,
      engineLabel,
      sampleNote: null,
      updatedLabel: null,
      metrics: [],
      unavailableReason: null,
    };
  }

  const rate = snapshot.teamRates[team.id];
  const master = findSpacetimeTeamRecord(league, team.name, team.slug);
  const metrics: TeamModelMetric[] = [];
  const decimals = sportScoringUnit(sport).decimals;

  if (sport === "football") {
    if (rate) {
      metrics.push({
        id: "adj-for",
        label: "Ataque ajustado",
        value: `${rate.adjustedFor.toFixed(decimals)} goles/p`,
        detail: `Crudo: ${rate.forPerGame.toFixed(decimals)} goles/p`,
        tone: "positive",
      });
      metrics.push({
        id: "adj-against",
        label: "Defensa ajustada",
        value: `${rate.adjustedAgainst.toFixed(decimals)} goles/p`,
        detail: `Crudo concedido: ${rate.againstPerGame.toFixed(decimals)}/p`,
        tone: rate.adjustedAgainst <= rate.againstPerGame ? "positive" : "neutral",
      });
    }
    if (master?.club_elo_rating != null) {
      metrics.push({
        id: "strength",
        label: "Índice de fuerza",
        value: `${Math.round(master.club_elo_rating).toLocaleString("es-MX")} pts`,
        detail: "Fuerza relativa de equipo",
        tone: "brand",
      });
    }
    if (master?.xg_for != null && master?.xg_against != null) {
      metrics.push({
        id: "xg-for",
        label: "Goles esperados (xG)",
        value: master.xg_for.toFixed(1),
        detail: master.npxg_for != null ? `Sin penales: ${master.npxg_for.toFixed(1)}` : "Acumulado de temporada",
        tone: "positive",
      });
      metrics.push({
        id: "xg-against",
        label: "xG concedidos",
        value: master.xg_against.toFixed(1),
        detail:
          master.npxg_against != null ? `Sin penales: ${master.npxg_against.toFixed(1)}` : "Calidad de tiro rival",
      });
    }
    if (master?.xpts != null) {
      metrics.push({
        id: "xpts",
        label: "Puntos esperados (xPts)",
        value: master.xpts.toFixed(1),
        detail:
          master.xpts_overperformance != null
            ? `Diferencia vs tabla: ${formatSigned(master.xpts_overperformance, 1)}`
            : undefined,
      });
    }
    if (master?.ppda_avg != null) {
      metrics.push({
        id: "ppda",
        label: "Presión (PPDA)",
        value: master.ppda_avg.toFixed(1),
        detail: "Menor indica presión más alta",
      });
    }
    if (isNationalCompetition(league)) {
      if (rate) {
        const netAdj = rate.adjustedFor - rate.adjustedAgainst;
        const intlPower = Math.round(1500 + netAdj * 145);
        metrics.push({
          id: "intl-power-index",
          label: "Índice de fuerza internacional",
          value: `${intlPower} pts`,
          detail: "Calibración relativa frente al universo FIFA",
          tone: intlPower >= 1620 ? "positive" : intlPower >= 1490 ? "brand" : "neutral",
        });
      }
      if (finishedSorted.length > 0 && teamCanon) {
        let intlWins = 0;
        let intlDraws = 0;
        let intlLosses = 0;
        let intlCleanSheets = 0;
        let intlGf = 0;
        let intlGa = 0;
        for (const r of finishedSorted) {
          const isHome = r.homeTeamKey === teamCanon;
          const my = isHome ? r.homeScore : r.awayScore;
          const opp = isHome ? r.awayScore : r.homeScore;
          intlGf += my;
          intlGa += opp;
          if (opp === 0) intlCleanSheets += 1;
          if (my > opp) intlWins += 1;
          else if (my === opp) intlDraws += 1;
          else intlLosses += 1;
        }
        const total = finishedSorted.length;
        const cleanSheetPct = (intlCleanSheets / total) * 100;
        const diffPerGame = (intlGf - intlGa) / total;
        metrics.push({
          id: "intl-clean-sheets",
          label: "Arco en cero internacional",
          value: `${cleanSheetPct.toFixed(0)}%`,
          detail: `${intlCleanSheets} de ${total} partidos oficiales y amistosos`,
          tone: cleanSheetPct >= 40 ? "positive" : "neutral",
        });
        metrics.push({
          id: "intl-margin",
          label: "Diferencial global por juego",
          value: `${formatSigned(diffPerGame, 2)} goles/p`,
          detail: `${intlWins}G-${intlDraws}E-${intlLosses}P en muestra internacional`,
          tone: diffPerGame > 0.25 ? "positive" : diffPerGame < -0.25 ? "warning" : "neutral",
        });
      }
    }
  } else if (sport === "american-football") {
    if (rate) {
      metrics.push({
        id: "adj-for",
        label: "Ataque ajustado",
        value: `${rate.adjustedFor.toFixed(1)} pts/p`,
        detail: `Crudo: ${rate.forPerGame.toFixed(1)} pts/p`,
        tone: "positive",
      });
      metrics.push({
        id: "adj-against",
        label: "Defensa ajustada",
        value: `${rate.adjustedAgainst.toFixed(1)} pts/p`,
        detail: `Crudo permitido: ${rate.againstPerGame.toFixed(1)} pts/p`,
      });
    }
    if (master?.nfl_off_epa_per_play != null) {
      metrics.push({
        id: "epa-off",
        label: "EPA ofensivo / jugada",
        value: formatSigned(master.nfl_off_epa_per_play, 3),
        detail: "Valor esperado añadido por jugada",
        tone: master.nfl_off_epa_per_play >= 0 ? "positive" : "warning",
      });
    }
    if (master?.nfl_def_epa_per_play != null) {
      metrics.push({
        id: "epa-def",
        label: "EPA defensivo permitido",
        value: formatSigned(master.nfl_def_epa_per_play, 3),
        detail: "Negativo favorece a la defensa",
        tone: master.nfl_def_epa_per_play <= 0 ? "positive" : "warning",
      });
    }
    if (master?.nfl_off_success_pct != null) {
      metrics.push({
        id: "succ-off",
        label: "Éxito ofensivo",
        value: formatPctValue(master.nfl_off_success_pct),
        detail: "Jugadas con avance positivo esperado",
      });
    }
    if (master?.nfl_def_success_pct != null) {
      metrics.push({
        id: "succ-def",
        label: "Éxito defensivo rival",
        value: formatPctValue(master.nfl_def_success_pct),
        detail: "% de jugadas exitosas concedidas",
      });
    }
  } else if (sport === "basketball") {
    if (master?.nba_ortg != null) {
      metrics.push({
        id: "ortg",
        label: "Rating ofensivo (ORtg)",
        value: master.nba_ortg.toFixed(1),
        detail: "Puntos por cada 100 posesiones",
        tone: "positive",
      });
    }
    if (master?.nba_drtg != null) {
      metrics.push({
        id: "drtg",
        label: "Rating defensivo (DRtg)",
        value: master.nba_drtg.toFixed(1),
        detail: "Puntos permitidos por 100 pos.",
      });
    }
    if (master?.nba_net_rtg != null) {
      metrics.push({
        id: "net",
        label: "Diferencial neto (Net Rtg)",
        value: formatSigned(master.nba_net_rtg, 1),
        detail: "Balance por 100 posesiones",
        tone: master.nba_net_rtg >= 0 ? "positive" : "warning",
      });
    }
    if (master?.nba_pace != null) {
      metrics.push({
        id: "pace",
        label: "Ritmo (Pace)",
        value: master.nba_pace.toFixed(1),
        detail: "Posesiones por 48 minutos",
      });
    }
    if (master?.nba_srs != null) {
      metrics.push({
        id: "srs",
        label: "Índice SRS ajustado",
        value: formatSigned(master.nba_srs, 2),
        detail: "Margen ajustado por dificultad de rivales",
        tone: "brand",
      });
    }
    if (master?.nba_efg_pct != null) {
      metrics.push({
        id: "efg",
        label: "Tiro efectivo (eFG%)",
        value: formatPctValue(master.nba_efg_pct),
        detail:
          master.nba_opp_efg_pct != null
            ? `Rival permitido: ${formatPctValue(master.nba_opp_efg_pct)}`
            : undefined,
      });
    }
    if (rate && metrics.length < 4) {
      metrics.push({
        id: "rate-nba",
        label: "Promedio de anotación",
        value: `${rate.forPerGame.toFixed(1)} pts/p`,
        detail: `Permite ${rate.againstPerGame.toFixed(1)} pts/p (${rate.gamesPlayed} JJ)`,
      });
    }
  } else if (sport === "ice-hockey") {
    if (master?.nhl_xg_pct != null) {
      metrics.push({
        id: "xg-pct",
        label: "Control de peligro (xG%)",
        value: formatPctValue(master.nhl_xg_pct),
        detail: "Proporción de goles esperados a favor",
        tone: master.nhl_xg_pct >= 50 ? "positive" : "warning",
      });
    }
    if (master?.xg_for != null && master?.xg_against != null) {
      metrics.push({
        id: "xg-tot",
        label: "Goles esperados (xG)",
        value: master.xg_for.toFixed(1),
        detail: `En contra: ${master.xg_against.toFixed(1)}`,
      });
    }
    if (master?.nhl_corsi_for_pct != null) {
      metrics.push({
        id: "corsi",
        label: "Posesión de tiro (Corsi %)",
        value: formatPctValue(master.nhl_corsi_for_pct),
        detail: "Volumen total de intentos al arco",
      });
    }
    if (master?.nhl_fenwick_for_pct != null) {
      metrics.push({
        id: "fenwick",
        label: "Tiros sin bloqueo (Fenwick %)",
        value: formatPctValue(master.nhl_fenwick_for_pct),
        detail: "Intentos que alcanzan zona de tiro",
      });
    }
    if (master?.nhl_high_danger_xg_for != null) {
      metrics.push({
        id: "hd-xg",
        label: "xG de alto peligro",
        value: master.nhl_high_danger_xg_for.toFixed(1),
        detail: "Ocasiones generadas frente a portería",
        tone: "brand",
      });
    }
    if (rate) {
      metrics.push({
        id: "rate-nhl",
        label: "Goles por partido",
        value: `${rate.forPerGame.toFixed(2)} a favor`,
        detail: `En contra: ${rate.againstPerGame.toFixed(2)} (${rate.gamesPlayed} JJ)`,
      });
    }
  }

  const isNational = isNationalCompetition(league);
  const sampleGames =
    isNational && finishedSorted.length > 0 ? finishedSorted.length : (rate?.gamesPlayed ?? null);
  const sampleNote = sampleGames
    ? isNational && finishedSorted.length > 0
      ? `Calibración con ${sampleGames} partidos internacionales verificados en el ciclo vigente`
      : `Calibración con ${sampleGames} partidos registrados en la temporada vigente`
    : null;
  const updatedLabel = formatIsoUpdatedEs(master?.as_of_utc ?? snapshot.updatedAt);

  return {
    locked: false,
    engineLabel,
    sampleNote,
    updatedLabel,
    metrics,
    unavailableReason:
      metrics.length === 0
        ? "Este corte aún no incluye métricas ajustadas del modelo para este equipo."
        : null,
  };
}

/** Comprueba si existe un equipo dentro de los snapshots activos de una liga. */
export function teamExistsInSnapshots(leagueRaw: string, teamSlugOrId: string): boolean {
  if (!isProductLeague(leagueRaw)) return false;
  const snapshot = loadRawLeagueSnapshot(leagueRaw);
  if (!snapshot) return false;
  const target = slugFromTeamId(teamSlugOrId);
  const { bySlug } = buildTeamMap(snapshot);
  return bySlug.has(target);
}

/** Devuelve el directorio ordenado de todos los clubes/franquicias de una o todas las ligas activas. */
export function loadLeagueTeamsDirectory(
  onlyLeague?: ProductLeague,
): TeamLeagueDirectoryItem[] {
  const leagues = onlyLeague ? [onlyLeague] : PRODUCT_LEAGUES;
  const items: TeamLeagueDirectoryItem[] = [];

  for (const lg of leagues) {
    const snapshot = loadRawLeagueSnapshot(lg);
    if (!snapshot) continue;
    const { bySlug, rankById } = buildTeamMap(snapshot);
    const leagueLabel = LEAGUE_LABELS[lg];
    const leagueItems: TeamLeagueDirectoryItem[] = [...bySlug.values()].map((t) => ({
      id: t.id,
      league: asLeagueId(lg),
      leagueLabel,
      slug: t.slug,
      name: t.name,
      shortName: t.shortName,
      code: t.code,
      rank: rankById.get(t.id) ?? null,
      href: `/app/${lg}/teams/${t.slug}`,
    }));

    leagueItems.sort((a, b) => {
      if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
      if (a.rank !== null) return -1;
      if (b.rank !== null) return 1;
      return a.name.localeCompare(b.name, "es-MX");
    });

    items.push(...leagueItems);
  }

  return items;
}

/** Carga el perfil integral de un equipo desde snapshots reales, histórico, bajas y ficha maestra. */
export function loadTeamProfile(
  leagueRaw: string,
  teamSlugOrId: string,
  options: { fullAccess: boolean },
): TeamProfileData | null {
  if (!isProductLeague(leagueRaw)) return null;
  const snapshot = loadRawLeagueSnapshot(leagueRaw);
  if (!snapshot) return null;

  const sport = toDisplaySport(sportForLeague(snapshot.league));
  const leagueLabel = LEAGUE_LABELS[leagueRaw];
  const { bySlug, byCanonical } = buildTeamMap(snapshot);

  const requestedSlug = slugFromTeamId(teamSlugOrId);
  const team = bySlug.get(requestedSlug);
  if (!team) return null;

  const teamCanon = canonicalSlug(team.slug);
  const latestGameIds = new Set<string>(snapshot.games.map((g) => String(g.id)));
  const snapshots = loadLeagueDatedSnapshots(leagueRaw, snapshot);

  // 1. Standing row (cuando la liga incluye clasificación tabular).
  let standing: TeamStandingSummary | null = null;
  const standings = snapshot.standings ?? [];
  const standingIdx = standings.findIndex((s) => s.teamId === team.id);
  if (standingIdx >= 0) {
    const s = standings[standingIdx]!;
    standing = {
      rank: standingIdx + 1,
      totalTeams: standings.length,
      played: s.played,
      won: s.won,
      drawn: s.drawn,
      lost: s.lost,
      goalsFor: s.goalsFor,
      goalsAgainst: s.goalsAgainst,
      goalDiff: s.goalsFor - s.goalsAgainst,
      points: s.points,
    };
  }

  // 2. Próximos partidos en latest.json (Cero-Fuga si !options.fullAccess).
  const hasDraw = sportHasDraw(sport);
  const upcomingFixtures: TeamUpcomingFixtureRow[] = snapshot.games
    .filter(
      (g) =>
        (g.status === "scheduled" || g.status === "in_progress") &&
        (g.home.id === team.id || g.away.id === team.id),
    )
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((g) => {
      const isHome = g.home.id === team.id;
      const opp = isHome ? g.away : g.home;
      const oppSlug = slugFromTeamId(opp.id);
      const analysis = snapshot.analyses[g.id];
      const hasForecast = Boolean(analysis?.projection && analysis?.x12);
      const ms = Date.parse(g.startTime);
      const dateLabel = Number.isFinite(ms) ? KICKOFF_DAY_MX.format(ms) : g.startTime.slice(0, 10);
      const kickoffLocal = Number.isFinite(ms) ? KICKOFF_TIME_MX.format(ms) : "--:--";

      let projectedTeamScore: number | null = null;
      let projectedOpponentScore: number | null = null;
      let winProbability: number | null = null;
      let confidenceLabel: string | null = null;

      if (options.fullAccess && hasForecast && analysis) {
        if (analysis.projection) {
          projectedTeamScore = isHome ? analysis.projection.home : analysis.projection.away;
          projectedOpponentScore = isHome ? analysis.projection.away : analysis.projection.home;
        }
        if (analysis.x12) {
          winProbability = isHome ? analysis.x12[0] : analysis.x12[2];
        }
        if (analysis.confidence) {
          confidenceLabel = `Confianza ${analysis.confidence.level}`;
        }
      }

      return {
        id: g.id,
        gameHref: `/app/${leagueRaw}/games/${g.id}`,
        dateLabel,
        kickoffLocal,
        round: g.round ?? (g.week ? `Semana ${g.week}` : null),
        venue: g.venue ?? null,
        isHome,
        neutralSite: g.neutralSite,
        opponent: {
          slug: oppSlug,
          name: opp.name,
          shortName: opp.shortName,
          href: bySlug.has(oppSlug) ? `/app/${leagueRaw}/teams/${oppSlug}` : null,
        },
        hasForecast,
        isRedacted: !options.fullAccess && hasForecast,
        projectedTeamScore,
        projectedOpponentScore,
        winProbability,
        confidenceLabel,
      };
    });

  // 3. Partidos finalizados deduplicados entre snapshots cerrados e histórico jsonl.
  const finishedMap = new Map<string, InternalFinishedGame>();

  for (const snap of snapshots) {
    for (const g of snap.games) {
      if (g.status !== "final" || !g.result) continue;
      const hKey = canonicalSlug(g.home.id);
      const aKey = canonicalSlug(g.away.id);
      if (hKey !== teamCanon && aKey !== teamCanon) continue;

      const date = g.startTime.slice(0, 10);
      const dedupeKey = `${date}|${hKey}|${aKey}`;
      const existing = finishedMap.get(dedupeKey);
      const inLatest = latestGameIds.has(g.id);
      if (existing && (!inLatest || existing.gameHref)) continue;

      const hasOtInfo = Boolean(g.result.periods && g.result.periods.length > (sport === "basketball" ? 4 : sport === "ice-hockey" ? 3 : 2));
      finishedMap.set(dedupeKey, {
        id: g.id,
        gameHref: inLatest ? `/app/${leagueRaw}/games/${g.id}` : null,
        date,
        sortKey: g.startTime,
        round: g.round ?? (g.week ? `Semana ${g.week}` : null),
        homeTeamKey: hKey,
        awayTeamKey: aKey,
        homeName: g.home.shortName || g.home.name,
        awayName: g.away.shortName || g.away.name,
        homeScore: g.result.home,
        awayScore: g.result.away,
        neutralSite: g.neutralSite,
        resultNote: hasOtInfo && sport !== "football" ? "En prórroga" : null,
        fromSnapshot: true,
      });
    }
  }

  for (const s of loadSeasonResultsEntries(leagueRaw)) {
    const hKey = canonicalSlug(s.homeTeam);
    const aKey = canonicalSlug(s.awayTeam);
    if (hKey !== teamCanon && aKey !== teamCanon) continue;

    const dedupeKey = `${s.date}|${hKey}|${aKey}`;
    if (finishedMap.has(dedupeKey)) continue;

    const homeRef = byCanonical.get(hKey);
    const awayRef = byCanonical.get(aKey);
    finishedMap.set(dedupeKey, {
      id: s.id,
      gameHref: latestGameIds.has(s.id) ? `/app/${leagueRaw}/games/${s.id}` : null,
      date: s.date,
      sortKey: s.startTime || `${s.date}T12:00:00Z`,
      round: s.round,
      homeTeamKey: hKey,
      awayTeamKey: aKey,
      homeName: homeRef?.shortName ?? slugFromTeamId(s.homeTeam).replace(/-/g, " "),
      awayName: awayRef?.shortName ?? slugFromTeamId(s.awayTeam).replace(/-/g, " "),
      homeScore: s.homeScore,
      awayScore: s.awayScore,
      neutralSite: Boolean(s.neutralSite),
      resultNote: null,
      fromSnapshot: true,
    });
  }

  for (const h of loadRecentHistoryEntries(leagueRaw)) {
    const hKey = canonicalSlug(h.homeTeam);
    const aKey = canonicalSlug(h.awayTeam);
    if (hKey !== teamCanon && aKey !== teamCanon) continue;

    const dedupeKey = `${h.date}|${hKey}|${aKey}`;
    if (finishedMap.has(dedupeKey)) continue;

    const homeRef = byCanonical.get(hKey);
    const awayRef = byCanonical.get(aKey);
    const homeNat = !homeRef ? findNationalTeamDef(hKey) : null;
    const awayNat = !awayRef ? findNationalTeamDef(aKey) : null;
    const roundLabel =
      h.stage ??
      (typeof h.period === "number"
        ? `${sport === "american-football" ? "Semana" : "Jornada"} ${h.period}`
        : null);

    finishedMap.set(dedupeKey, {
      id: h.id,
      gameHref: null,
      date: h.date,
      sortKey: `${h.date}T12:00:00Z`,
      round: roundLabel,
      homeTeamKey: hKey,
      awayTeamKey: aKey,
      homeName:
        homeRef?.shortName ??
        homeNat?.shortEs ??
        slugFromTeamId(h.homeTeam).replace(/-/g, " "),
      awayName:
        awayRef?.shortName ??
        awayNat?.shortEs ??
        slugFromTeamId(h.awayTeam).replace(/-/g, " "),
      homeScore: h.homeScore,
      awayScore: h.awayScore,
      neutralSite: Boolean(h.neutralSite),
      resultNote: null,
      fromSnapshot: false,
    });
  }

  const finishedSorted = [...finishedMap.values()].sort((a, b) =>
    b.sortKey.localeCompare(a.sortKey),
  );

  const seenRecentKeys = new Set<string>();
  const recentMatches: TeamMatchHistoryRow[] = [];
  for (const m of finishedSorted) {
    if (recentMatches.length >= 20) break;
    const isHome = m.homeTeamKey === teamCanon;
    const oppCanon = isHome ? m.awayTeamKey : m.homeTeamKey;
    const oppRef = byCanonical.get(oppCanon);
    const oppSlug = oppRef?.slug ?? oppCanon;
    const myScore = isHome ? m.homeScore : m.awayScore;
    const oppScore = isHome ? m.awayScore : m.homeScore;
    const uniqueRowKey = `${m.date}|${oppSlug}|${myScore}-${oppScore}`;
    if (seenRecentKeys.has(uniqueRowKey)) continue;
    seenRecentKeys.add(uniqueRowKey);

    const outcome: "G" | "E" | "P" =
      myScore > oppScore ? "G" : myScore === oppScore && hasDraw ? "E" : myScore === oppScore ? "E" : "P";

    recentMatches.push({
      id: m.id,
      gameHref: m.gameHref,
      date: m.date,
      dateLabel: formatDateYmdEs(m.date),
      round: m.round,
      isHome,
      neutralSite: m.neutralSite,
      opponent: {
        slug: oppSlug,
        name: oppRef?.name ?? (isHome ? m.awayName : m.homeName),
        shortName: oppRef?.shortName ?? (isHome ? m.awayName : m.homeName),
        href: oppRef ? `/app/${leagueRaw}/teams/${oppRef.slug}` : null,
      },
      teamScore: myScore,
      opponentScore: oppScore,
      outcome,
      resultNote: m.resultNote,
    });
  }

  // 4. Sede y altitud reales (prioriza el directorio canónico del club y descarta nombres genéricos de país).
  const homeSnapshotVenue =
    snapshot.games.find((g) => g.home.id === team.id && !g.neutralSite && g.venue)?.venue ?? null;
  const master = findSpacetimeTeamRecord(leagueRaw, team.name, team.slug);
  const resolvedGeo = resolveTeamVenueGeo(
    leagueRaw,
    team.slug,
    team.name,
    homeSnapshotVenue ?? master?.stadium_name ?? null,
  );
  const venueName = resolvedGeo?.stadium ?? master?.stadium_name ?? homeSnapshotVenue ?? null;
  const venue: TeamVenueInfo | null =
    venueName || master?.stadium_elevation_m != null || master?.roof_type
      ? {
          name: venueName,
          // Altitud y tipo de techo vienen de la ficha maestra: se reservan a sesiones con acceso completo.
          elevationM: options.fullAccess ? (master?.stadium_elevation_m ?? null) : null,
          roofType: !options.fullAccess
            ? null
            : master?.roof_type === "open" ||
                master?.roof_type === "retractable" ||
                master?.roof_type === "dome" ||
                master?.roof_type === "indoor_arena"
              ? master.roof_type
              : null,
        }
      : null;

  // 5. Equipos de la misma liga para navegación rápida.
  const relatedTeams = loadLeagueTeamsDirectory(leagueRaw)
    .filter((item) => item.slug !== team.slug)
    .slice(0, 12)
    .map((item) => ({
      slug: item.slug,
      name: item.name,
      shortName: item.shortName,
      rank: item.rank,
      href: item.href,
    }));

  // 6. Calcular promedios recientes sobre hasta 10 partidos finalizados recientes.
  const recentAverages = buildRecentAverages(finishedSorted, teamCanon, sport);
  const updatedLabel = formatIsoUpdatedEs(snapshot.updatedAt) ?? snapshot.updatedAt.slice(0, 10);
  const squad = loadTeamSquadSummary(leagueRaw, team, options.fullAccess);

  const mergedInjuries: TeamInjuryItem[] = options.fullAccess
    ? (() => {
        const base = loadTeamInjuries(leagueRaw, team.id);
        const seen = new Set(base.map((i) => i.player.trim().toLowerCase()));
        for (const p of squad?.players ?? []) {
          if (
            (p.availability === "injured" ||
              p.availability === "doubtful" ||
              p.availability === "suspended") &&
            !seen.has(p.name.trim().toLowerCase())
          ) {
            seen.add(p.name.trim().toLowerCase());
            base.push({
              player: p.name,
              position: p.positionLabel,
              status:
                p.availability === "suspended"
                  ? "Suspendido"
                  : p.availability === "doubtful"
                    ? "En duda"
                    : "Lesionado",
              detail: p.injuryDetail ?? null,
              reportedAt: p.expectedReturn ? `Regreso est.: ${p.expectedReturn}` : null,
            });
          }
        }
        return base;
      })()
    : [];

  return {
    league: asLeagueId(leagueRaw),
    leagueLabel,
    sport,
    seasonLabel: snapshot.seasonLabel,
    updatedAt: updatedLabel,
    team: {
      id: team.id,
      slug: team.slug,
      name: team.name,
      shortName: team.shortName,
      code: team.code,
    },
    standing,
    venue,
    injuries: mergedInjuries,
    recentAverages,
    modelSection: buildModelMetrics(
      leagueRaw,
      sport,
      snapshot,
      team,
      options.fullAccess,
      finishedSorted,
      teamCanon,
    ),
    upcomingFixtures,
    recentMatches,
    squad,
    relatedTeams,
  };
}

const squadsCache = new Map<string, { mtimeMs: number; data: LeagueSquadsFile }>();

export function loadRawLeagueSquads(leagueRaw: string): LeagueSquadsFile | null {
  if (!isProductLeague(leagueRaw)) return null;
  const filePath = path.join(resolveSnapshotsRoot(), leagueRaw, "squads.json");
  if (!fs.existsSync(filePath)) return null;
  try {
    const stat = fs.statSync(filePath);
    const cached = squadsCache.get(leagueRaw);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.data;
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    const parsed = LeagueSquadsFileSchema.safeParse(raw);
    if (!parsed.success) return null;
    squadsCache.set(leagueRaw, { mtimeMs: stat.mtimeMs, data: parsed.data });
    return parsed.data;
  } catch {
    return null;
  }
}

function mapSquadEntryToSummary(
  entry: TeamSquadEntry,
  fullAccess: boolean,
): TeamSquadSummary {
  const players: TeamSquadPlayer[] = entry.players.map((p) => {
    const candidatePicks: TeamPlayerPick[] = p.candidatePicks.map((pick) =>
      fullAccess
        ? {
            id: pick.id,
            marketKey: pick.marketKey,
            marketLabel: pick.marketLabel,
            selectionLabel: pick.selectionLabel,
            locked: false,
            line: pick.line,
            projectionMean: pick.projectionMean,
            projectionSd: pick.projectionSd,
            p: pick.p,
            fairDecimal: pick.fairDecimal,
            fairAmerican: pick.fairAmerican,
            rationale: pick.rationale,
          }
        : {
            id: pick.id,
            marketKey: pick.marketKey,
            marketLabel: pick.marketLabel,
            selectionLabel: "Proyección reservada (Ultra)",
            locked: true,
            line: null,
            projectionMean: null,
            projectionSd: null,
            p: null,
            fairDecimal: null,
            fairAmerican: null,
            rationale: null,
          },
    );

    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      shortName: p.shortName,
      jersey: p.jersey,
      positionGroup: p.positionGroup,
      positionLabel: p.positionLabel,
      age: p.age,
      birthDate: p.birthDate ?? null,
      heightCm: p.heightCm,
      weightKg: p.weightKg,
      preferredFoot: p.preferredFoot ?? null,
      nationality: p.nationality,
      nationalityCode: p.nationalityCode,
      photoKey: p.photoKey ?? null,
      fallbackPhotoKey: p.fallbackPhotoKey ?? null,
      availability: fullAccess ? (p.availability ?? null) : null,
      injuryDetail: fullAccess ? (p.injuryDetail ?? null) : null,
      expectedReturn: fullAccess ? (p.expectedReturn ?? null) : null,
      stats: { ...p.stats },
      candidatePicks,
    };
  });

  return {
    coachName: entry.coach?.name ?? entry.coachName,
    coach: entry.coach
      ? {
          name: entry.coach.name,
          shortName: entry.coach.shortName ?? null,
          photoKey: entry.coach.photoKey ?? null,
          nationality: entry.coach.nationality ?? null,
          nationalityCode: entry.coach.nationalityCode ?? null,
          birthDate: entry.coach.birthDate ?? null,
          preferredFormation: entry.coach.preferredFormation ?? null,
          styleLabel: entry.coach.styleLabel ?? null,
          careerRecord: entry.coach.careerRecord ?? null,
        }
      : entry.coachName
        ? { name: entry.coachName }
        : null,
    updatedAt: formatIsoUpdatedEs(entry.updatedAt) ?? entry.updatedAt.slice(0, 10),
    players,
  };
}

const NATIONAL_SQUAD_POOL_LEAGUES: readonly ProductLeague[] = [
  "copa-del-mundo",
  "uefa-nations",
  "concacaf-nations",
  "copa-america",
  "eurocopa",
  "copa-oro",
  "copa-africana",
  "copa-asiatica",
];

function loadTeamSquadSummary(
  leagueRaw: string,
  team: SnapshotTeamRef,
  fullAccess: boolean,
): TeamSquadSummary | null {
  const file = loadRawLeagueSquads(leagueRaw);
  const directEntry =
    file?.teams.find((t) => t.teamSlug === team.slug || t.teamId === team.id) ?? null;
  if (directEntry) return mapSquadEntryToSummary(directEntry, fullAccess);

  if (isNationalCompetition(leagueRaw)) {
    for (const poolLeague of NATIONAL_SQUAD_POOL_LEAGUES) {
      if (poolLeague === leagueRaw) continue;
      const poolFile = loadRawLeagueSquads(poolLeague);
      const match = poolFile?.teams.find((t) => t.teamSlug === team.slug) ?? null;
      if (match) return mapSquadEntryToSummary(match, fullAccess);
    }
  }

  return null;
}

/** Carga la ficha individual de un jugador con bio, estadísticas de temporada y picks aplicables. */
export function loadPlayerProfile(
  leagueRaw: string,
  teamSlugOrId: string,
  playerSlugRaw: string,
  options: { fullAccess: boolean },
): PlayerProfileData | null {
  const teamProfile = loadTeamProfile(leagueRaw, teamSlugOrId, options);
  if (!teamProfile || !teamProfile.squad) return null;
  const targetSlug = playerSlugRaw.trim().toLowerCase();
  const player =
    teamProfile.squad.players.find((p) => p.slug.toLowerCase() === targetSlug) ?? null;
  if (!player) return null;

  const teammates = teamProfile.squad.players
    .filter((p) => p.slug !== player.slug)
    .slice(0, 12)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      shortName: p.shortName,
      jersey: p.jersey,
      positionGroup: p.positionGroup,
      photoKey: p.photoKey ?? null,
      fallbackPhotoKey: p.fallbackPhotoKey ?? null,
      href: `/app/${teamProfile.league}/teams/${teamProfile.team.slug}/players/${p.slug}`,
    }));

  return {
    league: teamProfile.league,
    leagueLabel: teamProfile.leagueLabel,
    sport: teamProfile.sport,
    seasonLabel: teamProfile.seasonLabel,
    updatedAt: teamProfile.squad.updatedAt || teamProfile.updatedAt,
    team: { ...teamProfile.team },
    coachName: teamProfile.squad.coachName,
    coach: teamProfile.squad.coach ?? null,
    player,
    picksLocked: !options.fullAccess,
    lastMatch: teamProfile.recentMatches[0] ?? null,
    nextFixture: teamProfile.upcomingFixtures[0] ?? null,
    teammates,
  };
}

/** Construye props individuales de jugadores de fútbol para próximos partidos a partir de `squads.json`. */
export function loadLeaguePlayerProps(games: readonly PlatformGame[]): PlayerPropItem[] {
  const items: PlayerPropItem[] = [];
  const soccerUpcoming = games
    .filter((g) => g.sport === "football" && g.status !== "FT")
    .slice(0, 36);

  const seenIds = new Set<string>();
  const squadsByLeague = new Map<string, LeagueSquadsFile | null>();

  for (const game of soccerUpcoming) {
    let squadsFile = squadsByLeague.get(game.league);
    if (squadsFile === undefined) {
      squadsFile = loadRawLeagueSquads(game.league);
      squadsByLeague.set(game.league, squadsFile);
    }
    if (!squadsFile) continue;

    const sides: Array<{
      slug: string;
      name: string;
      opponent: string;
    }> = [
      { slug: game.home.slug, name: game.home.name, opponent: game.away.shortName },
      { slug: game.away.slug, name: game.away.name, opponent: game.home.shortName },
    ];

    for (const side of sides) {
      const teamEntry = squadsFile.teams.find((t) => t.teamSlug === side.slug);
      if (!teamEntry) continue;

      let pickedForSide = 0;
      for (const player of teamEntry.players) {
        if (pickedForSide >= 3) break;
        const primary =
          player.candidatePicks.find(
            (pk) =>
              pk.line != null &&
              (pk.marketKey === "player_sot" ||
                pk.marketKey === "player_shots" ||
                pk.marketKey === "player_saves" ||
                pk.marketKey === "player_goal_or_assist"),
          ) ?? player.candidatePicks.find((pk) => pk.line != null);

        if (!primary || primary.line == null) continue;

        const baseLine = primary.line;
        const step = 0.5;
        const minLine = 0.5;
        const maxLine = Math.max(baseLine + 1.5, Number((baseLine + 2).toFixed(1)));
        const priorRefProb = 0.52 * primary.p + 0.48 * 0.5;
        const overRef = Math.min(0.88, Math.max(0.14, priorRefProb));
        const marketOverDecimal = Math.max(
          1.12,
          Math.min(8.5, Math.round((1 / (overRef * 1.03)) * 100) / 100),
        );
        const marketUnderDecimal = Math.max(
          1.12,
          Math.min(8.5, Math.round((1 / ((1 - overRef) * 1.03)) * 100) / 100),
        );

        const propId = `prop:${game.id}:${side.slug}:${player.slug}:${primary.marketKey}`;
        if (seenIds.has(propId)) continue;
        seenIds.add(propId);

        items.push({
          id: propId,
          league: game.league,
          leagueLabel: LEAGUE_LABELS[game.league as ProductLeague] ?? game.league,
          gameId: game.id,
          matchLabel: `${game.away.shortName} @ ${game.home.shortName}`,
          kickoffLocal: game.kickoffLocal,
          player: player.name,
          teamSlug: side.slug,
          teamName: side.name,
          position: player.positionGroup,
          statLabel: primary.marketLabel,
          baseLine,
          step,
          minLine,
          maxLine,
          projectionMean: primary.projectionMean,
          projectionSd: primary.projectionSd,
          engineName: "Tachyon Player Lab",
          marketOverDecimal,
          marketUnderDecimal,
          last10: [],
          contextNote: `${primary.rationale} Frente a ${side.opponent}.`,
        });
        pickedForSide += 1;
      }
    }
  }

  return items.slice(0, 120);
}

export interface ServerStandingsSplitRow {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  form: Array<"G" | "E" | "P">;
}

export interface ServerLeagueStandingsMeta {
  formBySlug: Record<string, Array<"G" | "E" | "P">>;
  homeBySlug: Record<string, ServerStandingsSplitRow>;
  awayBySlug: Record<string, ServerStandingsSplitRow>;
}

/**
 * Calcula la racha reciente real (últimos 5 partidos) y las tablas Local / Visitante
 * de la temporada vigente combinando el histórico cerrado y el snapshot activo.
 */
export function loadLeagueStandingsMeta(leagueRaw: string): ServerLeagueStandingsMeta | null {
  if (!isProductLeague(leagueRaw)) return null;
  const snapshot = loadRawLeagueSnapshot(leagueRaw);
  if (!snapshot || !snapshot.standings || snapshot.standings.length === 0) return null;

  const sport = toDisplaySport(sportForLeague(asLeagueId(leagueRaw)));
  const hasDraw = sportHasDraw(sport);
  const winPoints = hasDraw ? 3 : 2;
  const { byCanonical } = buildTeamMap(snapshot);

  const emptySplit = (): ServerStandingsSplitRow => ({
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
    form: [],
  });

  const formBySlug: Record<string, Array<"G" | "E" | "P">> = {};
  const homeBySlug: Record<string, ServerStandingsSplitRow> = {};
  const awayBySlug: Record<string, ServerStandingsSplitRow> = {};

  const snapshotFormBySlug: Record<string, Array<"G" | "E" | "P">> = {};
  for (const row of snapshot.standings) {
    const slug = slugFromTeamId(row.teamId);
    formBySlug[slug] = [];
    homeBySlug[slug] = emptySplit();
    awayBySlug[slug] = emptySplit();
    if (Array.isArray(row.form) && row.form.length > 0) {
      snapshotFormBySlug[slug] = row.form.map((t) => (t === "W" ? "G" : t === "L" ? "P" : "E"));
    }
  }

  const refDateMs = Date.parse(snapshot.updatedAt) || Date.now();
  const seasonWindowMs = 240 * 86_400_000;
  const deduped = new Map<
    string,
    { sortKey: string; homeSlug: string; awaySlug: string; hs: number; as: number }
  >();

  for (const h of loadRecentHistoryEntries(leagueRaw)) {
    const matchesSeason = h.season && snapshot.season ? h.season === snapshot.season : false;
    const dateMs = Date.parse(`${h.date}T12:00:00Z`);
    const withinWindow =
      Number.isFinite(dateMs) &&
      refDateMs - dateMs <= seasonWindowMs &&
      refDateMs - dateMs >= -7 * 86_400_000;
    if (!matchesSeason && !withinWindow) continue;

    const hCanon = canonicalSlug(h.homeTeam);
    const aCanon = canonicalSlug(h.awayTeam);
    const hRef = byCanonical.get(hCanon);
    const aRef = byCanonical.get(aCanon);
    if (!hRef && !aRef) continue;

    const key = `${h.date}|${hCanon}|${aCanon}`;
    deduped.set(key, {
      sortKey: `${h.date}T12:00:00Z`,
      homeSlug: hRef?.slug ?? hCanon,
      awaySlug: aRef?.slug ?? aCanon,
      hs: h.homeScore,
      as: h.awayScore,
    });
  }

  for (const s of loadSeasonResultsEntries(leagueRaw)) {
    const hCanon = canonicalSlug(s.homeTeam);
    const aCanon = canonicalSlug(s.awayTeam);
    const hRef = byCanonical.get(hCanon);
    const aRef = byCanonical.get(aCanon);
    if (!hRef && !aRef) continue;

    const key = `${s.date}|${hCanon}|${aCanon}`;
    deduped.set(key, {
      sortKey: s.startTime || `${s.date}T12:00:00Z`,
      homeSlug: hRef?.slug ?? hCanon,
      awaySlug: aRef?.slug ?? aCanon,
      hs: s.homeScore,
      as: s.awayScore,
    });
  }

  for (const snap of loadLeagueDatedSnapshots(leagueRaw, snapshot)) {
    for (const g of snap.games) {
      if (g.status !== "final" || !g.result) continue;
      const hCanon = canonicalSlug(g.home.id);
      const aCanon = canonicalSlug(g.away.id);
      const hRef = byCanonical.get(hCanon);
      const aRef = byCanonical.get(aCanon);
      const date = g.startTime.slice(0, 10);
      const key = `${date}|${hCanon}|${aCanon}`;
      deduped.set(key, {
        sortKey: g.startTime,
        homeSlug: hRef?.slug ?? slugFromTeamId(g.home.id),
        awaySlug: aRef?.slug ?? slugFromTeamId(g.away.id),
        hs: g.result.home,
        as: g.result.away,
      });
    }
  }

  const chronological = [...deduped.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  for (const m of chronological) {
    const hRes: "G" | "E" | "P" = m.hs > m.as ? "G" : m.hs < m.as ? "P" : "E";
    const aRes: "G" | "E" | "P" = m.as > m.hs ? "G" : m.as < m.hs ? "P" : "E";

    if (formBySlug[m.homeSlug]) {
      formBySlug[m.homeSlug] = [...formBySlug[m.homeSlug]!, hRes].slice(-5);
    }
    if (formBySlug[m.awaySlug]) {
      formBySlug[m.awaySlug] = [...formBySlug[m.awaySlug]!, aRes].slice(-5);
    }

    const hSplit = homeBySlug[m.homeSlug];
    if (hSplit) {
      hSplit.played += 1;
      hSplit.goalsFor += m.hs;
      hSplit.goalsAgainst += m.as;
      if (hRes === "G") {
        hSplit.won += 1;
        hSplit.points += winPoints;
      } else if (hRes === "E") {
        hSplit.drawn += 1;
        if (hasDraw) hSplit.points += 1;
      } else {
        hSplit.lost += 1;
      }
      hSplit.form = [...hSplit.form, hRes].slice(-5);
    }

    const aSplit = awayBySlug[m.awaySlug];
    if (aSplit) {
      aSplit.played += 1;
      aSplit.goalsFor += m.as;
      aSplit.goalsAgainst += m.hs;
      if (aRes === "G") {
        aSplit.won += 1;
        aSplit.points += winPoints;
      } else if (aRes === "E") {
        aSplit.drawn += 1;
        if (hasDraw) aSplit.points += 1;
      } else {
        aSplit.lost += 1;
      }
      aSplit.form = [...aSplit.form, aRes].slice(-5);
    }
  }

  for (const [slug, snapForm] of Object.entries(snapshotFormBySlug)) {
    if (snapForm.length > (formBySlug[slug]?.length ?? 0)) {
      formBySlug[slug] = snapForm.slice(-5);
    }
  }

  return { formBySlug, homeBySlug, awayBySlug };
}
