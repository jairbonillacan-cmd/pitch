import fs from "node:fs";
import path from "node:path";
import {
  LeagueSnapshotSchema,
  assertNotDemoInProduction,
  snapshotToMatchAnalyses,
  asLeagueId,
  type LeagueId,
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

export function loadLeagueSnapshotEnvelope(
  leagueKey: "liga-mx" | "premier-league" | "laliga" | "nfl",
): SnapshotEnvelope {
  const root = resolveSnapshotsRoot();
  const latestPath = path.join(root, leagueKey, "latest.json");
  const league = asLeagueId(leagueKey);

  if (!fs.existsSync(latestPath)) {
    const emptySnapshot: ClientLeagueSnapshot = {
      schemaVersion: 1,
      league,
      leagueLabel:
        leagueKey === "liga-mx"
          ? "Liga MX"
          : leagueKey === "premier-league" || leagueKey === "laliga"
            ? (leagueKey === "laliga" ? "LaLiga" : "Premier League")
            : "NFL",
      sport: leagueKey === "nfl" ? "american-football" : "football",
      season:
        leagueKey === "liga-mx"
          ? "Apertura 2026"
          : leagueKey === "nfl"
            ? "2026"
            : "2026/27",
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

  try {
    const raw = JSON.parse(fs.readFileSync(latestPath, "utf8")) as unknown;
    const parsed = LeagueSnapshotSchema.parse(raw);
    assertNotDemoInProduction(parsed.provenance);

    const { days, matches } = snapshotToMatchAnalyses(parsed);
    const clientSafe: ClientLeagueSnapshot = {
      schemaVersion: 1,
      league: parsed.league,
      leagueLabel:
        parsed.league === "liga-mx"
          ? "Liga MX"
          : parsed.league === "premier-league" || parsed.league === "laliga"
            ? (parsed.league === "laliga" ? "LaLiga" : "Premier League")
            : "NFL",
      sport: parsed.league === "nfl" ? "american-football" : "football",
      season: parsed.seasonLabel,
      roundLabel: parsed.periodLabel,
      generatedAt: parsed.updatedAt,
      days,
      games: matches,
    };

    return {
      state: matches.length > 0 ? "ready" : "empty",
      data: clientSafe,
      generatedAt: clientSafe.generatedAt,
    };
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

export function loadAllActiveLeagueSnapshots(): Record<
  "liga-mx" | "premier-league" | "laliga" | "nfl",
  SnapshotEnvelope
> {
  return {
    "liga-mx": loadLeagueSnapshotEnvelope("liga-mx"),
    "premier-league": loadLeagueSnapshotEnvelope("premier-league"),
    laliga: loadLeagueSnapshotEnvelope("laliga"),
    nfl: loadLeagueSnapshotEnvelope("nfl"),
  };
}
