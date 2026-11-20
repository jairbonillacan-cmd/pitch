/**
 * Cargador SSR de tendencias y props estructurados de jugadores (`NBA` + `Fútbol` + ligas activas)
 * combinando Bzzoiro Unlimited (`loadNbaGuardedPropsBridge`, `loadNbaInjuriesBridge`) y snapshots
 * verificados en `data/snapshots/<league>/squads.json` + `latest.json`.
 *
 * Reglas:
 * - Licencia Bzzoiro v4.0: toda línea siempre ligada a proyección Spacetime y `fairOdds (1/p)`.
 * - Guardia de muestra mínima: `minMinutes >= 45` (fútbol) / rotación `>= 18 min/p` y `>= 45 min` acumulados (NBA).
 * - `Cero-Fuga`: devuelve `[]` si `fullAccess` es `false`.
 * - `FD-16`: cero IDs crudos de proveedor ni URLs externas.
 */
import fs from "node:fs";
import path from "node:path";
import {
  COMPETITION_BY_ID,
  LeagueSnapshotSchema,
  LeagueSquadsFileSchema,
  asLeagueId,
  canonicalPlayerHref,
  slugifyPlayerName,
  sportForLeague,
  type LeagueId,
  type LeagueSnapshot,
  type LeagueSquadsFile,
  type PlatformSport,
} from "@pitchlab/contracts";
import type {
  NbaPropStatCode,
  PropsLabPlayerPropItem,
  PropsLabRefereeSummary,
  PropsStreakExplorerItem,
} from "@pitchlab/ui/parlays";
import type { PropMetricSeries } from "@pitchlab/ui/prop-streak-card";
import type { PlayerPropItem } from "@pitchlab/ui/types";
import {
  loadNbaGuardedPropsBridge,
  loadNbaInjuriesBridge,
  type NbaGuardedPlayerProp,
  type NbaRealInjuryBridgeItem,
} from "./player-live-stats";
import { PRODUCT_LEAGUES, resolveSnapshotsRoot, type ProductLeague } from "./snapshots";

export interface ExplorerStreakCard extends PropsStreakExplorerItem {
  readonly id: string;
  readonly sport: PlatformSport;
  readonly leagueLabel: string;
}

const FOOTBALL_MIN_MINUTES = 45;
const NBA_MIN_MINUTES_PER_GAME = 18;

const METRIC_PRIORITY: Record<PlatformSport, readonly string[]> = {
  football: ["Tiros a puerta", "Tiros", "Goles", "Asistencias", "Faltas", "Amarillas"],
  basketball: ["PTS", "REB", "AST", "3PM", "Puntos", "Rebotes", "Asistencias", "Triples"],
  "american-football": ["Yds", "Rec", "TD", "Car", "Cmp", "Pass Yds", "Rush Yds", "Rec Yds"],
  "ice-hockey": ["SOG", "PTS", "G", "A", "Tiros", "Puntos", "Goles"],
  baseball: ["H", "TB", "K", "R", "RBI", "HR", "Hits", "Ponches"],
};

const NON_PROP_STAT_LABELS = new Set([
  "MIN",
  "MINS",
  "MINUTOS",
  "%TC",
  "%3P",
  "%TL",
  "%CMP",
  "FG%",
  "3P%",
  "FT%",
  "AVG",
  "OBP",
  "SLG",
  "OPS",
]);

const NBA_STAT_LABEL_MAP: Readonly<Record<NbaPropStatCode, string>> = {
  PTS: "Puntos (PTS)",
  REB: "Rebotes (REB)",
  AST: "Asistencias (AST)",
  "3PM": "Triples (3PM)",
};

function normKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function teamSlugFromId(teamId: string): string {
  const clean = teamId.trim().toLowerCase();
  return clean.includes(".") ? clean.split(".").slice(1).join(".") : clean;
}

function parseNumericStat(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed || trimmed === "-" || trimmed === "—" || trimmed === "--") return null;
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    const mins = Number(parts[0]);
    const secs = Number(parts[1] ?? "0");
    if (Number.isFinite(mins) && mins >= 0) {
      return mins + (Number.isFinite(secs) && secs >= 0 ? secs / 60 : 0);
    }
    return null;
  }
  if (trimmed.includes("/")) {
    const first = Number(trimmed.split("/")[0]);
    return Number.isFinite(first) && first >= 0 ? first : null;
  }
  const n = Number(trimmed.replace(/%$/, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function clampProb(p: number): number {
  return Math.round(Math.min(0.92, Math.max(0.08, p)) * 1000) / 1000;
}

function evaluateOverProb(mean: number, sd: number, line: number): {
  pOver: number;
  pUnder: number;
  fairOverDecimal: number;
  fairUnderDecimal: number;
} {
  const z = (line - mean) / Math.max(0.45, sd);
  const cdf = 1 / (1 + Math.exp(-1.702 * z));
  const pOver = clampProb(1 - cdf);
  const pUnder = clampProb(1 - pOver);
  return {
    pOver,
    pUnder,
    fairOverDecimal: Math.max(1.05, Math.round((1 / pOver) * 100) / 100),
    fairUnderDecimal: Math.max(1.05, Math.round((1 / pUnder) * 100) / 100),
  };
}

function defaultLineFromValues(values: readonly number[]): {
  defaultLine: number;
  minLine: number;
  maxLine: number;
  step: number;
} {
  const avg = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  const maxVal = Math.max(...values, 1);
  if (maxVal >= 40) {
    const step = 5;
    const base = Math.max(4.5, Math.floor(avg / step) * step - 0.5);
    return {
      defaultLine: base,
      minLine: Math.max(0.5, base - 25),
      maxLine: Math.ceil(maxVal / step) * step + 4.5,
      step,
    };
  }
  if (maxVal >= 12) {
    const step = 1;
    const base = Math.max(0.5, Math.floor(avg) - 0.5);
    return {
      defaultLine: base,
      minLine: Math.max(0.5, base - 6),
      maxLine: Math.ceil(maxVal) + 2.5,
      step,
    };
  }
  const base = Math.max(0.5, Math.floor(avg) + 0.5);
  return {
    defaultLine: base,
    minLine: 0.5,
    maxLine: Math.max(3.5, Math.ceil(maxVal) + 0.5),
    step: 0.5,
  };
}

function formatKickoffMx(startTimeIso: string): string {
  try {
    const d = new Date(startTimeIso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Mexico_City",
    }).format(d);
  } catch (err) {
    void err;
    return "";
  }
}

function readSquadsFile(root: string, league: string): LeagueSquadsFile | null {
  const squadsPath = path.join(root, league, "squads.json");
  if (!fs.existsSync(squadsPath)) return null;
  try {
    const parsed = LeagueSquadsFileSchema.safeParse(
      JSON.parse(fs.readFileSync(squadsPath, "utf8")),
    );
    return parsed.success ? parsed.data : null;
  } catch (err) {
    void err;
    return null;
  }
}

function readSnapshotFile(root: string, league: string): LeagueSnapshot | null {
  const snapPath = path.join(root, league, "latest.json");
  if (!fs.existsSync(snapPath)) return null;
  try {
    const parsed = LeagueSnapshotSchema.safeParse(
      JSON.parse(fs.readFileSync(snapPath, "utf8")),
    );
    return parsed.success ? parsed.data : null;
  } catch (err) {
    void err;
    return null;
  }
}

function mapBridgeStatKeyToCode(statKey: NbaGuardedPlayerProp["statKey"]): NbaPropStatCode | null {
  if (statKey === "pts") return "PTS";
  if (statKey === "reb") return "REB";
  if (statKey === "ast") return "AST";
  if (statKey === "tpm") return "3PM";
  return null;
}

function normalizeSeasonMinutesPerGame(
  sport: PlatformSport,
  seasonMinMetric: { readonly key: string; readonly label: string; readonly value: string } | undefined,
  seasonGp: number,
  avgFromLogs: number | null,
): number | null {
  if (!seasonMinMetric) return null;
  const raw = parseNumericStat(seasonMinMetric.value);
  if (raw === null) return null;

  const k = seasonMinMetric.key.trim().toLowerCase();
  const l = seasonMinMetric.label.trim().toUpperCase();
  const isExplicitPerGame =
    k.includes("per_game") ||
    k.includes("avg") ||
    k === "mpg" ||
    l.includes("/P") ||
    l.includes("MPG");
  const isExplicitTotal = k.includes("total") || l.includes("TOTAL");

  if (sport === "basketball") {
    // NBA `seasonMetrics.min` suele venir por partido (p. ej. 31.9); si llega acumulado
    // (> 48 min/p, marcado total o múltiplo de `seasonGp` frente a logs), normalizar entre `seasonGp`.
    if (
      !isExplicitPerGame &&
      seasonGp > 1 &&
      (isExplicitTotal ||
        raw > 48 ||
        (avgFromLogs !== null && avgFromLogs > 0 && raw / avgFromLogs >= Math.max(2, seasonGp * 0.6)))
    ) {
      return Math.round((raw / seasonGp) * 10) / 10;
    }
    return Math.round(raw * 10) / 10;
  }

  // En fútbol (y resto de deportes), `seasonMetrics.min` representa suma acumulada de temporada
  // salvo indicación explícita por partido: dividir entre `seasonGp` para obtener minutos reales por partido.
  if (!isExplicitPerGame && seasonGp > 1) {
    return Math.round((raw / seasonGp) * 10) / 10;
  }
  return Math.round(raw * 10) / 10;
}

function extractPlayerMinutesMeta(
  player: LeagueSquadsFile["teams"][number]["players"][number],
  sport: PlatformSport,
): { avgMinutes: number | null; minMinutesGuard: boolean; sampleGames: number } {
  const logs = player.recentGames ?? [];
  const logMins = logs
    .map((g) => {
      const hit = g.stats.find((s) => {
        const lbl = s.label.trim().toUpperCase();
        return lbl === "MIN" || lbl === "MINS" || lbl === "MINUTOS";
      });
      return hit ? parseNumericStat(hit.value) : null;
    })
    .filter((v): v is number => v !== null);

  const seasonMinMetric = player.seasonMetrics?.find((m) => {
    const k = m.key.trim().toLowerCase();
    const l = m.label.trim().toUpperCase();
    return k === "min" || l === "MIN" || k === "min_per_game" || k === "mpg";
  });
  const seasonGpMetric = player.seasonMetrics?.find((m) => {
    const k = m.key.trim().toLowerCase();
    const l = m.label.trim().toUpperCase();
    return k === "gp" || l === "JJ" || l === "PJ";
  });

  const seasonGp =
    (seasonGpMetric ? parseNumericStat(seasonGpMetric.value) : null) ??
    player.stats.appearances;
  const avgFromLogs =
    logMins.length > 0
      ? Math.round((logMins.reduce((a, b) => a + b, 0) / logMins.length) * 10) / 10
      : null;
  const seasonMinPerGame = normalizeSeasonMinutesPerGame(
    sport,
    seasonMinMetric,
    seasonGp,
    avgFromLogs,
  );

  if (sport === "basketball") {
    const avgMinutes = logMins.length >= 3 ? avgFromLogs : (seasonMinPerGame ?? avgFromLogs);
    const sampleGames = Math.max(logMins.length, Math.round(seasonGp));
    const qualifiedLogs = logMins.filter((m) => m >= NBA_MIN_MINUTES_PER_GAME).length;
    const totalSampleMin =
      logMins.length > 0
        ? logMins.reduce((a, b) => a + b, 0)
        : avgMinutes !== null && sampleGames > 0
          ? avgMinutes * sampleGames
          : 0;
    const minMinutesGuard =
      avgMinutes !== null &&
      avgMinutes >= NBA_MIN_MINUTES_PER_GAME &&
      sampleGames >= 3 &&
      totalSampleMin >= FOOTBALL_MIN_MINUTES &&
      (logMins.length < 3 || qualifiedLogs >= 3);
    return { avgMinutes, minMinutesGuard, sampleGames };
  }

  const avgMinutes = avgFromLogs ?? seasonMinPerGame;
  if (logMins.length > 0) {
    const qualifiedCount = logMins.filter((m) => m >= FOOTBALL_MIN_MINUTES).length;
    const minMinutesGuard =
      qualifiedCount >= 3 &&
      avgFromLogs !== null &&
      avgFromLogs >= FOOTBALL_MIN_MINUTES;
    return { avgMinutes: avgFromLogs, minMinutesGuard, sampleGames: qualifiedCount };
  }

  if (seasonMinPerGame !== null) {
    const sampleGames = Math.max(0, Math.round(seasonGp));
    const minMinutesGuard =
      seasonMinPerGame >= FOOTBALL_MIN_MINUTES && sampleGames >= 3;
    return { avgMinutes: seasonMinPerGame, minMinutesGuard, sampleGames };
  }

  const apps = player.stats.appearances;
  if (sport === "football") {
    // Sin minutos verificados en logs ni temporada: fallar cerrado para guardia >= 45 min.
    return { avgMinutes: null, minMinutesGuard: false, sampleGames: apps };
  }

  const starts = Math.max(0, apps - player.stats.subIns);
  const starterRatio = apps > 0 ? starts / apps : 0;
  const minMinutesGuard = apps >= 3 && (starts >= 3 || starterRatio >= 0.5);
  return { avgMinutes, minMinutesGuard, sampleGames: apps };
}

function classifyRigorFromAvgYellow(avgYellow: number | null | undefined): string | null {
  if (avgYellow == null || !Number.isFinite(avgYellow)) return null;
  if (avgYellow >= 4.6) return "Estricto";
  if (avgYellow <= 3.6) return "Permisivo";
  return "Promedio";
}

function findLineupStatusInSnapshot(
  snapshot: LeagueSnapshot | null,
  gameId: string,
  teamSlug: string,
  playerName: string,
): "confirmed" | "probable" | null {
  if (!snapshot) return null;
  const game = snapshot.games.find((g) => g.id === gameId);
  const lineups = snapshot.analyses[gameId]?.lineups;
  if (!game || !lineups) return null;

  const targetTeam = teamSlug.trim().toLowerCase();
  const isHome = teamSlugFromId(game.home.id) === targetTeam;
  const isAway = teamSlugFromId(game.away.id) === targetTeam;
  if (!isHome && !isAway) return null;

  const starters = isHome ? lineups.home.starters : lineups.away.starters;
  const pKey = normKey(playerName);
  const pLast = pKey.split(" ").pop() ?? "";
  const matched = starters.some((s) => {
    const sKey = normKey(s.name);
    if (!sKey) return false;
    if (sKey === pKey) return true;
    const sLast = sKey.split(" ").pop() ?? "";
    return pLast.length >= 5 && pLast === sLast;
  });
  if (!matched) return null;
  return lineups.status === "confirmed" ? "confirmed" : "probable";
}

function extractRefereeSummaryFromSnapshot(
  snapshot: LeagueSnapshot | null,
  gameId: string,
): PropsLabRefereeSummary | null {
  if (!snapshot) return null;
  const game = snapshot.games.find((g) => g.id === gameId);
  const ctx = snapshot.analyses[gameId]?.matchContext;
  const refName = (game?.referee ?? ctx?.referee ?? "").trim();
  if (!refName) return null;
  const stats = ctx?.refereeStats;
  const avgYellow = stats?.avgYellow ?? null;
  const avgFouls = stats?.avgFouls ?? null;
  if (avgYellow === null && avgFouls === null) return null;
  return {
    name: refName,
    avgYellow,
    avgFouls,
    rigorLabel: classifyRigorFromAvgYellow(avgYellow),
  };
}

let cachedExplorer: { at: number; items: ExplorerStreakCard[] } | null = null;
const EXPLORER_TTL_MS = 10 * 60_000;

export function loadPlayerPropStreakCards(maxCards = 36): ExplorerStreakCard[] {
  const now = Date.now();
  if (cachedExplorer && now - cachedExplorer.at < EXPLORER_TTL_MS) {
    return cachedExplorer.items.slice(0, maxCards);
  }

  const root = resolveSnapshotsRoot();
  const cards: ExplorerStreakCard[] = [];
  const seenCardIds = new Set<string>();

  // 1) Priorizar props NBA enriquecidos de Bzzoiro Unlimited (`player-props.json`) con guardia de minutos y bajas
  const nbaInjuries = loadNbaInjuriesBridge();
  const nbaInjuryByKey = new Map<string, NbaRealInjuryBridgeItem>();
  for (const inj of nbaInjuries) {
    nbaInjuryByKey.set(`${inj.teamSlug}|${normKey(inj.player)}`, inj);
  }

  const nbaBridgeProps = loadNbaGuardedPropsBridge({ injuries: nbaInjuries });
  if (nbaBridgeProps.length > 0) {
    const grouped = new Map<
      string,
      {
        player: string;
        teamSlug: string;
        teamName: string;
        position: string;
        avgMinutes: number | null;
        availabilityStatus: "available" | "doubtful";
        series: PropMetricSeries[];
      }
    >();

    for (const bp of nbaBridgeProps) {
      const code = mapBridgeStatKeyToCode(bp.statKey);
      if (!code || bp.last10.length < 3) continue;
      const gKey = `${bp.teamSlug}|${normKey(bp.player)}`;
      const bucket = grouped.get(gKey) ?? {
        player: bp.player,
        teamSlug: bp.teamSlug,
        teamName: bp.teamName,
        position: bp.position,
        avgMinutes: bp.avgMinutes,
        availabilityStatus: bp.availabilityStatus,
        series: [],
      };
      if (!bucket.series.some((s) => s.key === code.toLowerCase())) {
        const bounds = defaultLineFromValues(bp.last10);
        bucket.series.push({
          key: code.toLowerCase(),
          label: code,
          unit: code.toLowerCase(),
          defaultLine: bp.baseLine,
          minLine: bounds.minLine,
          maxLine: bounds.maxLine,
          step: code === "PTS" ? 1 : 0.5,
          points: bp.last10
            .slice()
            .reverse()
            .map((value, idx) => ({
              label: `J${idx + 1}`,
              value,
            })),
        });
      }
      grouped.set(gKey, bucket);
    }

    const nbaLeagueId = asLeagueId("nba") as LeagueId;
    let nbaBridgeCount = 0;
    for (const item of grouped.values()) {
      if (item.series.length === 0) continue;
      const playerSlug = slugifyPlayerName(item.player);
      const id = `nba:${item.teamSlug}:${playerSlug}`;
      if (seenCardIds.has(id)) continue;
      seenCardIds.add(id);
      cards.push({
        id,
        sport: "basketball",
        league: nbaLeagueId,
        leagueLabel: COMPETITION_BY_ID["nba"]?.label ?? "NBA",
        playerName: item.player,
        teamName: item.teamName,
        teamSlug: item.teamSlug,
        positionLabel: item.position,
        series: item.series.slice(0, 4),
        playerHref: canonicalPlayerHref(nbaLeagueId, item.teamSlug, playerSlug),
        avgMinutes: item.avgMinutes,
        minMinutesGuard: true,
        availabilityStatus: item.availabilityStatus,
      });
      nbaBridgeCount += 1;
      if (nbaBridgeCount >= 8) break;
    }
  }

  // 2) Tendencias verificadas en `squads.json` por liga (excluyendo bajas y aplicando guardia de minutos)
  const prioritizedLeagues: readonly ProductLeague[] = [
    "nba",
    "nfl",
    "mlb",
    "nhl",
    "liga-mx",
    "premier-league",
    "laliga",
    "champions-league",
    "mls",
    ...PRODUCT_LEAGUES,
  ];
  const seenLeagues = new Set<string>();

  for (const lg of prioritizedLeagues) {
    if (seenLeagues.has(lg)) continue;
    seenLeagues.add(lg);
    const squads = readSquadsFile(root, lg);
    if (!squads) continue;

    let perLeagueCount = 0;
    const leagueId = asLeagueId(lg) as LeagueId;
    const sport = sportForLeague(lg);
    const leagueLabel = COMPETITION_BY_ID[lg]?.label ?? lg;
    const prefLabels = METRIC_PRIORITY[sport] ?? [];

    for (const team of squads.teams) {
      for (const player of team.players) {
        if (player.availability === "injured" || player.availability === "suspended") {
          continue;
        }
        const nbaInj =
          lg === "nba"
            ? nbaInjuryByKey.get(`${team.teamSlug.toLowerCase()}|${normKey(player.name)}`)
            : undefined;
        if (nbaInj?.status === "Baja") continue;

        const logs = player.recentGames;
        if (!logs || logs.length < 3) continue;

        const minutesMeta = extractPlayerMinutesMeta(player, sport);
        if ((sport === "football" || sport === "basketball") && !minutesMeta.minMinutesGuard) {
          continue;
        }

        const id = `${lg}:${team.teamSlug}:${player.slug}`;
        if (seenCardIds.has(id)) continue;

        const allLabels = Array.from(
          new Set(logs.flatMap((g) => g.stats.map((s) => s.label))),
        );
        const countingLabels = allLabels.filter(
          (lbl) => !NON_PROP_STAT_LABELS.has(lbl.trim().toUpperCase()),
        );
        const statLabels = countingLabels.length > 0 ? countingLabels : allLabels;
        const orderedLabels = [
          ...prefLabels.filter((lbl) => statLabels.includes(lbl)),
          ...statLabels.filter((lbl) => !prefLabels.includes(lbl)),
        ].slice(0, 4);

        const series: PropMetricSeries[] = [];
        for (const lbl of orderedLabels) {
          const pts = logs
            .slice()
            .reverse()
            .map((g) => {
              if (sport === "football") {
                const minHit = g.stats.find((s) => {
                  const u = s.label.trim().toUpperCase();
                  return u === "MIN" || u === "MINS" || u === "MINUTOS";
                });
                const minVal = minHit ? parseNumericStat(minHit.value) : null;
                if (minVal === null || minVal < FOOTBALL_MIN_MINUTES) return null;
              }
              const hit = g.stats.find((s) => s.label === lbl);
              const val = hit ? parseNumericStat(hit.value) : null;
              if (val === null) return null;
              return {
                label: (g.opponentAbbr ?? g.opponent).slice(0, 8),
                opponent: g.opponent,
                date: g.dateIso,
                value: val,
              };
            })
            .filter((p): p is NonNullable<typeof p> => p !== null);

          if (pts.length < 3) continue;
          const values = pts.map((p) => p.value);
          if (Math.max(...values) <= 0) continue;
          const bounds = defaultLineFromValues(values);
          series.push({
            key: lbl.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
            label: lbl,
            unit: lbl.toLowerCase(),
            defaultLine: bounds.defaultLine,
            minLine: bounds.minLine,
            maxLine: bounds.maxLine,
            step: bounds.step,
            points: pts,
          });
        }

        if (series.length === 0) continue;
        seenCardIds.add(id);

        cards.push({
          id,
          sport,
          league: leagueId,
          leagueLabel,
          playerName: player.name,
          teamName: team.teamName,
          teamSlug: team.teamSlug,
          photoKey: player.photoKey,
          positionLabel: player.positionLabel,
          series,
          playerHref: canonicalPlayerHref(leagueId, team.teamSlug, player.slug),
          avgMinutes: minutesMeta.avgMinutes,
          minMinutesGuard: minutesMeta.minMinutesGuard,
          availabilityStatus:
            player.availability === "doubtful" || nbaInj?.status === "Duda"
              ? "doubtful"
              : "available",
        });
        perLeagueCount += 1;
        if (perLeagueCount >= 6) break;
      }
      if (perLeagueCount >= 6) break;
    }

    if (cards.length >= 48) break;
  }

  cachedExplorer = { at: now, items: cards };
  return cards.slice(0, maxCards);
}

/**
 * Construye el catálogo estructurado de Props para `/app/props` combinando:
 * 1) Props NBA estructurados (`PTS`, `REB`, `AST`, `3PM`) de Bzzoiro Unlimited (`player-props.json`)
 *    y `data/snapshots/nba/squads.json` ligados a proyección Spacetime + `fairOdds (1/p)`.
 * 2) Props de fútbol enriquecidos con guardia `minMinutes >= 45`, estado de alineación
 *    (`confirmed | probable`) y contexto arbitral real desde `latest.json`.
 *
 * Respeta estrictamente `Cero-Fuga` (vacío para visitantes) y `FD-16` (cero IDs/URLs de proveedor).
 */
export function loadStructuredPlayerProps(options: {
  fullAccess: boolean;
  baseProps?: readonly PlayerPropItem[];
  maxItems?: number;
}): PropsLabPlayerPropItem[] {
  if (!options.fullAccess) {
    return [];
  }

  const maxItems = options.maxItems ?? 120;
  const root = resolveSnapshotsRoot();
  const out: PropsLabPlayerPropItem[] = [];
  const seenIds = new Set<string>();

  const nbaLeagueId = asLeagueId("nba") as LeagueId;
  const nbaLeagueLabel = COMPETITION_BY_ID["nba"]?.label ?? "NBA";
  const nbaSnapshot = readSnapshotFile(root, "nba");
  const nbaSquads = readSquadsFile(root, "nba");
  const nbaInjuries = loadNbaInjuriesBridge();
  const nbaInjuryByKey = new Map<string, NbaRealInjuryBridgeItem>();
  for (const inj of nbaInjuries) {
    nbaInjuryByKey.set(`${inj.teamSlug}|${normKey(inj.player)}`, inj);
  }

  const upcomingNbaGames = (nbaSnapshot?.games ?? []).filter(
    (g) => g.status === "scheduled" || g.status === "in_progress",
  );
  const upcomingNbaByTeam = new Map<
    string,
    { gameId: string; matchLabel: string; kickoffLocal: string; opponentShort: string }
  >();
  for (const g of upcomingNbaGames) {
    const hSlug = teamSlugFromId(g.home.id);
    const aSlug = teamSlugFromId(g.away.id);
    const matchLabel = `${g.away.shortName} @ ${g.home.shortName}`;
    const kickoffLocal = formatKickoffMx(g.startTime);
    if (!upcomingNbaByTeam.has(hSlug)) {
      upcomingNbaByTeam.set(hSlug, {
        gameId: g.id,
        matchLabel,
        kickoffLocal,
        opponentShort: g.away.shortName,
      });
    }
    if (!upcomingNbaByTeam.has(aSlug)) {
      upcomingNbaByTeam.set(aSlug, {
        gameId: g.id,
        matchLabel,
        kickoffLocal,
        opponentShort: g.home.shortName,
      });
    }
  }

  const nbaPlayerSlugByKey = new Map<string, string>();
  if (nbaSquads) {
    for (const team of nbaSquads.teams) {
      for (const p of team.players) {
        nbaPlayerSlugByKey.set(`${team.teamSlug.toLowerCase()}|${normKey(p.name)}`, p.slug);
      }
    }
  }

  // 1) Bzzoiro NBA Unlimited (`player-props.json`) con guardia de minutos y filtro de bajas reales
  const guardedNbaBridge = loadNbaGuardedPropsBridge({ injuries: nbaInjuries });
  for (const bp of guardedNbaBridge) {
    const code = mapBridgeStatKeyToCode(bp.statKey);
    if (!code) continue;
    const matchInfo = upcomingNbaByTeam.get(bp.teamSlug.toLowerCase());
    if (!matchInfo) continue;

    const pSlug =
      nbaPlayerSlugByKey.get(`${bp.teamSlug.toLowerCase()}|${normKey(bp.player)}`) ??
      slugifyPlayerName(bp.player);
    const id = `nba-prop:${matchInfo.gameId}:${bp.teamSlug}:${pSlug}:${code.toLowerCase()}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const isPts = code === "PTS";
    const step = isPts ? 1 : 0.5;
    const span = isPts ? 5 : 2.5;
    const minNote = bp.avgMinutes !== null ? ` · ${bp.avgMinutes.toFixed(1)} min/p` : "";

    out.push({
      id,
      league: nbaLeagueId,
      leagueLabel: nbaLeagueLabel,
      sport: "basketball",
      gameId: matchInfo.gameId,
      matchLabel: matchInfo.matchLabel,
      kickoffLocal: matchInfo.kickoffLocal,
      player: bp.player,
      teamSlug: bp.teamSlug,
      teamName: bp.teamName,
      position: bp.position || "NBA",
      statLabel: NBA_STAT_LABEL_MAP[code],
      statCode: code,
      baseLine: bp.baseLine,
      step,
      minLine: Math.max(0.5, Number((bp.baseLine - span).toFixed(1))),
      maxLine: Number((bp.baseLine + span).toFixed(1)),
      projectionMean: bp.projectionMean,
      projectionSd: Math.max(0.6, bp.projectionSd),
      engineName: "Tachyon NBA Lab",
      marketOverDecimal: bp.fairOverDecimal,
      marketUnderDecimal: bp.fairUnderDecimal,
      hasVerifiedMarketQuote: false,
      last10: bp.last10.slice(0, 10),
      contextNote: `Proyección Spacetime NBA con muestra de ${bp.sampleGames} juegos${minNote} frente a ${matchInfo.opponentShort}.`,
      avgMinutes: bp.avgMinutes,
      sampleGames: bp.sampleGames,
      minMinutesGuard: true,
      availabilityStatus: bp.availabilityStatus,
      injuryNote: bp.injuryNote ?? null,
      playerHref: canonicalPlayerHref(nbaLeagueId, bp.teamSlug, pSlug),
    });
  }

  // 2) Props NBA estructurados verificados desde `data/snapshots/nba/squads.json` para partidos próximos
  if (nbaSquads && upcomingNbaGames.length > 0) {
    const statDefs: ReadonlyArray<{
      code: NbaPropStatCode;
      keys: readonly string[];
      minVal: number;
      sdFactor: number;
      minSd: number;
    }> = [
      { code: "PTS", keys: ["pts", "puntos"], minVal: 12, sdFactor: 0.28, minSd: 3.4 },
      { code: "REB", keys: ["reb", "rebotes"], minVal: 4.5, sdFactor: 0.34, minSd: 1.5 },
      { code: "AST", keys: ["ast", "asistencias"], minVal: 3.5, sdFactor: 0.36, minSd: 1.3 },
      { code: "3PM", keys: ["3pm", "tpm", "triples"], minVal: 1.5, sdFactor: 0.45, minSd: 0.9 },
    ];

    let nbaDerivedCount = 0;
    for (const game of upcomingNbaGames.slice(0, 14)) {
      const sides = [
        { slug: teamSlugFromId(game.home.id), opponent: game.away.shortName },
        { slug: teamSlugFromId(game.away.id), opponent: game.home.shortName },
      ];
      const matchLabel = `${game.away.shortName} @ ${game.home.shortName}`;
      const kickoffLocal = formatKickoffMx(game.startTime);

      for (const side of sides) {
        const teamEntry = nbaSquads.teams.find(
          (t) => t.teamSlug.toLowerCase() === side.slug,
        );
        if (!teamEntry) continue;

        const rankedPlayers = teamEntry.players
          .filter((p) => {
            if (p.availability === "injured" || p.availability === "suspended") return false;
            const inj = nbaInjuryByKey.get(`${side.slug}|${normKey(p.name)}`);
            if (inj?.status === "Baja") return false;
            const meta = extractPlayerMinutesMeta(p, "basketball");
            return meta.minMinutesGuard;
          })
          .sort((a, b) => {
            const aPts = parseNumericStat(
              a.seasonMetrics?.find((m) => m.key === "pts" || m.label === "PTS")?.value ?? "",
            ) ?? 0;
            const bPts = parseNumericStat(
              b.seasonMetrics?.find((m) => m.key === "pts" || m.label === "PTS")?.value ?? "",
            ) ?? 0;
            return bPts - aPts;
          })
          .slice(0, 2);

        for (const player of rankedPlayers) {
          const minutesMeta = extractPlayerMinutesMeta(player, "basketball");
          const inj = nbaInjuryByKey.get(`${side.slug}|${normKey(player.name)}`);
          const availabilityStatus: "available" | "doubtful" =
            player.availability === "doubtful" || inj?.status === "Duda"
              ? "doubtful"
              : "available";

          for (const def of statDefs) {
            const metricHit = player.seasonMetrics?.find(
              (m) =>
                def.keys.includes(m.key.trim().toLowerCase()) ||
                def.keys.includes(m.label.trim().toLowerCase()),
            );
            const rawMean = metricHit ? parseNumericStat(metricHit.value) : null;
            if (rawMean === null || rawMean < def.minVal) continue;

            const id = `nba-prop:${game.id}:${teamEntry.teamSlug}:${player.slug}:${def.code.toLowerCase()}`;
            if (seenIds.has(id)) continue;

            const logVals = (player.recentGames ?? [])
              .map((g) => {
                const hit = g.stats.find((s) =>
                  def.keys.includes(s.label.trim().toLowerCase()),
                );
                return hit ? parseNumericStat(hit.value) : null;
              })
              .filter((v): v is number => v !== null);

            let mean = Math.round(rawMean * 100) / 100;
            let sd = Math.max(def.minSd, Math.round(rawMean * def.sdFactor * 100) / 100);
            if (logVals.length >= 3) {
              const logAvg = logVals.reduce((a, b) => a + b, 0) / logVals.length;
              mean = Math.round((rawMean * 0.65 + logAvg * 0.35) * 100) / 100;
              const variance =
                logVals.reduce((acc, v) => acc + (v - logAvg) ** 2, 0) / logVals.length;
              sd = Math.max(def.minSd, Math.round(Math.sqrt(variance) * 100) / 100);
            }

            const isPts = def.code === "PTS";
            const baseLine = isPts
              ? Math.max(4.5, Math.floor(mean) - 0.5)
              : mean >= 4
                ? Math.max(0.5, Math.floor(mean) - 0.5)
                : Math.max(0.5, Math.floor(mean) + 0.5);
            const ev = evaluateOverProb(mean, sd, baseLine);
            const step = isPts ? 1 : 0.5;
            const span = isPts ? 5 : 2.5;
            const minNote =
              minutesMeta.avgMinutes !== null
                ? ` · ${minutesMeta.avgMinutes.toFixed(1)} min/p`
                : "";

            seenIds.add(id);
            out.push({
              id,
              league: nbaLeagueId,
              leagueLabel: nbaLeagueLabel,
              sport: "basketball",
              gameId: game.id,
              matchLabel,
              kickoffLocal,
              player: player.name,
              teamSlug: teamEntry.teamSlug,
              teamName: teamEntry.teamName,
              position: player.positionLabel || "NBA",
              statLabel: NBA_STAT_LABEL_MAP[def.code],
              statCode: def.code,
              baseLine,
              step,
              minLine: Math.max(0.5, Number((baseLine - span).toFixed(1))),
              maxLine: Number((baseLine + span).toFixed(1)),
              projectionMean: mean,
              projectionSd: sd,
              engineName: "Tachyon NBA Lab",
              marketOverDecimal: ev.fairOverDecimal,
              marketUnderDecimal: ev.fairUnderDecimal,
              hasVerifiedMarketQuote: false,
              last10: logVals.slice(0, 10),
              contextNote: `Promedio verificado ${rawMean.toFixed(1)} ${def.code} en ${minutesMeta.sampleGames} JJ${minNote} frente a ${side.opponent}.`,
              avgMinutes: minutesMeta.avgMinutes,
              sampleGames: minutesMeta.sampleGames,
              minMinutesGuard: true,
              availabilityStatus,
              injuryNote: inj?.detail ?? player.injuryDetail ?? null,
              playerHref: canonicalPlayerHref(nbaLeagueId, teamEntry.teamSlug, player.slug),
            });
            nbaDerivedCount += 1;
            if (nbaDerivedCount >= 44) break;
          }
          if (nbaDerivedCount >= 44) break;
        }
        if (nbaDerivedCount >= 44) break;
      }
      if (nbaDerivedCount >= 44) break;
    }
  }

  // 3) Enriquecer props base (fútbol y otras ligas) con guardia >= 45 min, alineación y árbitro
  const squadsByLeague = new Map<string, LeagueSquadsFile | null>();
  const snapshotByLeague = new Map<string, LeagueSnapshot | null>();

  for (const rawProp of options.baseProps ?? []) {
    const sport = sportForLeague(String(rawProp.league));
    if (sport === "basketball") {
      // Evitar duplicar con los props NBA estructurados y evitar momios hardcoded 1.91 sin análisis
      continue;
    }
    if (seenIds.has(rawProp.id)) continue;

    const lgKey = String(rawProp.league);
    let squads = squadsByLeague.get(lgKey);
    if (squads === undefined) {
      squads = readSquadsFile(root, lgKey);
      squadsByLeague.set(lgKey, squads);
    }
    let snapshot = snapshotByLeague.get(lgKey);
    if (snapshot === undefined) {
      snapshot = readSnapshotFile(root, lgKey);
      snapshotByLeague.set(lgKey, snapshot);
    }

    const teamEntry = squads?.teams.find(
      (t) => t.teamSlug.toLowerCase() === rawProp.teamSlug.toLowerCase(),
    );
    const matchedPlayer = teamEntry?.players.find(
      (p) => normKey(p.name) === normKey(rawProp.player),
    );
    if (
      matchedPlayer &&
      (matchedPlayer.availability === "injured" || matchedPlayer.availability === "suspended")
    ) {
      continue;
    }

    const minutesMeta = matchedPlayer
      ? extractPlayerMinutesMeta(matchedPlayer, sport)
      : { avgMinutes: null, minMinutesGuard: false, sampleGames: 0 };
    if (!minutesMeta.minMinutesGuard) {
      continue;
    }

    const lineupStatus = findLineupStatusInSnapshot(
      snapshot,
      rawProp.gameId,
      rawProp.teamSlug,
      rawProp.player,
    );
    const refereeSummary =
      sport === "football"
        ? extractRefereeSummaryFromSnapshot(snapshot, rawProp.gameId)
        : null;
    const ev = evaluateOverProb(
      rawProp.projectionMean,
      rawProp.projectionSd,
      rawProp.baseLine,
    );

    seenIds.add(rawProp.id);
    out.push({
      ...rawProp,
      sport,
      marketOverDecimal: ev.fairOverDecimal,
      marketUnderDecimal: ev.fairUnderDecimal,
      hasVerifiedMarketQuote: false,
      avgMinutes: minutesMeta.avgMinutes,
      sampleGames: minutesMeta.sampleGames > 0 ? minutesMeta.sampleGames : null,
      minMinutesGuard: minutesMeta.minMinutesGuard,
      lineupStatus,
      availabilityStatus: matchedPlayer?.availability === "doubtful" ? "doubtful" : "available",
      injuryNote: matchedPlayer?.injuryDetail ?? null,
      playerHref: matchedPlayer
        ? canonicalPlayerHref(rawProp.league, rawProp.teamSlug, matchedPlayer.slug)
        : null,
      refereeSummary,
    });

    if (out.length >= maxItems) break;
  }

  return out.slice(0, maxItems);
}
