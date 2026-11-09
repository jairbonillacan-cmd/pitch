import fs from "node:fs";
import path from "node:path";
import {
  LeagueSnapshotSchema,
  assertNotDemoInProduction,
  snapshotToMatchAnalyses,
  asLeagueId,
  type LeagueId,
  type StandingRow,
  type MatchAnalysis,
} from "@pitchlab/contracts";

export interface ClientLeagueSnapshot {
  schemaVersion: 1;
  league: LeagueId;
  leagueLabel: string;
  sport: "football" | "american-football";
  season: string;
  roundLabel: string;
  generatedAt: string;
  days: Array<{ id: string; label: string }>;
  games: MatchAnalysis[];
  standings?: StandingRow[];
}

export interface SnapshotEnvelope {
  state: "ready" | "empty" | "error";
  data?: ClientLeagueSnapshot;
  generatedAt?: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

function resolveSnapshotsRoot(): string {
  const candidates = [
    path.resolve(process.cwd(), "data/snapshots"),
    path.resolve(process.cwd(), "../../data/snapshots"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[1] ?? candidates[0]!;
}

/** Ligas con producto en la beta (las que tienen snapshot propio). */
export const PRODUCT_LEAGUES = [
  "liga-mx",
  "premier-league",
  "laliga",
  "bundesliga",
  "serie-a",
  "ligue-1",
  "nfl",
] as const;

export type ProductLeague = (typeof PRODUCT_LEAGUES)[number];

/** Caché en memoria por archivo y fecha de modificación (se invalida al reescribir el snapshot). */
const snapshotCache = new Map<string, { mtimeMs: number; envelope: SnapshotEnvelope }>();

const LEAGUE_LABELS: Record<ProductLeague, string> = {
  "liga-mx": "Liga MX",
  "premier-league": "Premier League",
  laliga: "LaLiga",
  bundesliga: "Bundesliga",
  "serie-a": "Serie A",
  "ligue-1": "Ligue 1",
  nfl: "NFL",
};

const LEAGUE_SEASONS: Record<ProductLeague, string> = {
  "liga-mx": "Apertura 2026",
  "premier-league": "2026/27",
  laliga: "2026/27",
  bundesliga: "2026/27",
  "serie-a": "2026/27",
  "ligue-1": "2026/27",
  nfl: "2026",
};

export function loadLeagueSnapshotEnvelope(leagueKey: ProductLeague): SnapshotEnvelope {
  const root = resolveSnapshotsRoot();
  const latestPath = path.join(root, leagueKey, "latest.json");
  const league = asLeagueId(leagueKey);

  if (!fs.existsSync(latestPath)) {
    snapshotCache.delete(leagueKey);
    const emptySnapshot: ClientLeagueSnapshot = {
      schemaVersion: 1,
      league,
      leagueLabel: LEAGUE_LABELS[leagueKey],
      sport: leagueKey === "nfl" ? "american-football" : "football",
      season: LEAGUE_SEASONS[leagueKey],
      roundLabel: leagueKey === "nfl" ? "Semana 9" : "Jornada 16",
      generatedAt: new Date().toISOString(),
      days: [{ id: "all", label: `Toda la ${leagueKey === "nfl" ? "semana" : "jornada"}` }],
      games: [],
    };
    assertNotDemoInProduction("derived");
    return {
      state: "empty",
      data: emptySnapshot,
      generatedAt: emptySnapshot.generatedAt,
    };
  }

  // Caché por fecha de modificación: evita parsear y normalizar el mismo snapshot en cada
  // request (siete ligas por página) y se invalida solo cuando el job lo reescribe.
  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(latestPath).mtimeMs;
  } catch {
    mtimeMs = 0;
  }
  const cached = snapshotCache.get(leagueKey);
  if (cached && mtimeMs > 0 && cached.mtimeMs === mtimeMs) {
    return cached.envelope;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(latestPath, "utf8")) as unknown;
    const parsed = LeagueSnapshotSchema.parse(raw);
    assertNotDemoInProduction(parsed.provenance);

    const { days, matches } = snapshotToMatchAnalyses(parsed);
    const clientSafe: ClientLeagueSnapshot = {
      schemaVersion: 1,
      league: parsed.league,
      leagueLabel: LEAGUE_LABELS[parsed.league as ProductLeague] ?? parsed.league,
      sport: parsed.league === "nfl" ? "american-football" : "football",
      season: parsed.seasonLabel,
      roundLabel: parsed.periodLabel,
      generatedAt: parsed.updatedAt,
      days,
      games: matches,
      standings: parsed.standings,
    };

    const envelope: SnapshotEnvelope = {
      state: matches.length > 0 ? "ready" : "empty",
      data: clientSafe,
      generatedAt: clientSafe.generatedAt,
    };
    if (mtimeMs > 0) {
      snapshotCache.set(leagueKey, { mtimeMs, envelope });
    }
    return envelope;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error de lectura";
    return {
      state: "error",
      error: {
        code: "PARSE",
        message,
        retryable: true,
      },
    };
  }
}

export function loadAllActiveLeagueSnapshots(): Record<ProductLeague, SnapshotEnvelope> {
  const entries = PRODUCT_LEAGUES.map((league) => [
    league,
    loadLeagueSnapshotEnvelope(league),
  ]) as Array<[ProductLeague, SnapshotEnvelope]>;
  return Object.fromEntries(entries) as Record<ProductLeague, SnapshotEnvelope>;
}
