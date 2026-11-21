import fs from "node:fs";
import path from "node:path";
import {
  CLIENT_MATCH_CONTEXT_FACTOR_LABELS,
  COMPETITION_BY_ID,
  LEAGUE_CAPABILITY_LIST,
  LeagueSnapshotSchema,
  LeagueInjuriesFileSchema,
  MarketPulseFileSchema,
  toMarketPulseView,
  assertNotDemoInProduction,
  snapshotToMatchAnalyses,
  sportForLeague,
  asLeagueId,
  CortexWriteupSchema,
  type CortexWriteup,
  type LeagueId,
  type LeagueSnapshot,
  type PlatformSport,
  type ProductLeagueKey,
  type StandingRow,
  type MatchAnalysis,
  type MarketPulseView,
  type TeamInjuryEntry,
} from "@pitchlab/contracts";
import {
  getBzzoiroLeagueEmblemUrl,
  getBzzoiroTeamEmblemUrl,
  getOfficialEspnLeagueLogoUrl,
  getOfficialEspnTeamLogoUrl,
} from "@pitchlab/sports-assets";

export interface ClientLeagueSnapshot {
  schemaVersion: 1;
  league: LeagueId;
  leagueLabel: string;
  logoUrl?: string;
  sport: PlatformSport;
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

export function resolveSnapshotsRoot(): string {
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

export const PRODUCT_LEAGUES: readonly ProductLeagueKey[] = Object.freeze(
  LEAGUE_CAPABILITY_LIST.map((entry) => entry.id),
);

export type ProductLeague = (typeof PRODUCT_LEAGUES)[number];

const snapshotCache = new Map<string, { key: string; envelope: SnapshotEnvelope }>();

function fileMtime(file: string): number {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

function loadMarketPulse(file: string): Map<string, MarketPulseView> {
  const byGame = new Map<string, MarketPulseView>();
  if (!fs.existsSync(file)) return byGame;
  try {
    const parsed = MarketPulseFileSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
    for (const entry of parsed.entries) byGame.set(entry.gameId, toMarketPulseView(entry));
  } catch (err) {
    void err;
    byGame.clear();
  }
  return byGame;
}

function loadLeagueInjuries(file: string): Map<string, TeamInjuryEntry[]> {
  const byTeam = new Map<string, TeamInjuryEntry[]>();
  if (!fs.existsSync(file)) return byTeam;
  try {
    const parsed = LeagueInjuriesFileSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
    for (const entry of parsed.entries) {
      const bucket = byTeam.get(entry.teamId) ?? [];
      bucket.push(entry);
      byTeam.set(entry.teamId, bucket);
    }
  } catch (err) {
    void err;
    byTeam.clear();
  }
  return byTeam;
}

const matchContext: ReadonlySet<string> = new Set(CLIENT_MATCH_CONTEXT_FACTOR_LABELS);

function matchForClient({ steps: _steps, why: _why, ...match }: MatchAnalysis): MatchAnalysis {
  return {
    ...match,
    factors: match.factors.filter(({ label }) => matchContext.has(label)),
    trace: [],
    confidence: match.confidence ? { ...match.confidence, reasons: [] } : undefined,
  };
}

export const LEAGUE_LABELS: Record<ProductLeague, string> = Object.fromEntries(
  PRODUCT_LEAGUES.map((id) => [id, COMPETITION_BY_ID[id]?.label ?? id]),
) as Record<ProductLeague, string>;

const LEAGUE_SEASONS: Record<ProductLeague, string> = Object.fromEntries(
  PRODUCT_LEAGUES.map((id) => [id, COMPETITION_BY_ID[id]?.season ?? "2026"]),
) as Record<ProductLeague, string>;

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
      sport: sportForLeague(leagueKey),
      season: LEAGUE_SEASONS[leagueKey],
      roundLabel:
        leagueKey === "nfl"
          ? "Semana 9"
          : leagueKey === "nba" || leagueKey === "nhl" || leagueKey === "mlb"
            ? ""
            : "Jornada 16",
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

  const pulsePath = path.join(root, leagueKey, "market-pulse.json");
  const injuriesPath = path.join(root, leagueKey, "injuries.json");
  const snapshotMtime = fileMtime(latestPath);
  const cacheKey =
    snapshotMtime > 0
      ? `${snapshotMtime}:${fileMtime(pulsePath)}:${fileMtime(injuriesPath)}`
      : "";
  const cached = snapshotCache.get(leagueKey);
  if (cached && cacheKey && cached.key === cacheKey) {
    return cached.envelope;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(latestPath, "utf8")) as unknown;
    const parsed = LeagueSnapshotSchema.parse(raw);
    assertNotDemoInProduction(parsed.provenance);

    const { days, matches } = snapshotToMatchAnalyses(parsed);
    const pulses = loadMarketPulse(pulsePath);
    const injuriesByTeam = loadLeagueInjuries(injuriesPath);
    const leagueLogoUrl =
      parsed.logoUrl ??
      getBzzoiroLeagueEmblemUrl(parsed.league) ??
      getOfficialEspnLeagueLogoUrl(parsed.league) ??
      undefined;
    const teamLogo = (slug: string, existing?: string): string | undefined =>
      existing ??
      getBzzoiroTeamEmblemUrl(parsed.league, slug) ??
      getOfficialEspnTeamLogoUrl(parsed.league, slug) ??
      undefined;
    const standingsWithLogos = parsed.standings?.map((row) => {
      const slug = row.teamId.includes(".") ? row.teamId.split(".")[1]! : row.teamId;
      const logoUrl = teamLogo(slug, row.logoUrl);
      return logoUrl ? { ...row, logoUrl } : row;
    });
    const clientSafe: ClientLeagueSnapshot = {
      schemaVersion: 1,
      league: parsed.league,
      leagueLabel: LEAGUE_LABELS[parsed.league as ProductLeague] ?? parsed.league,
      ...(leagueLogoUrl ? { logoUrl: leagueLogoUrl } : {}),
      sport: sportForLeague(parsed.league),
      season: parsed.seasonLabel,
      roundLabel: parsed.periodLabel,
      generatedAt: parsed.updatedAt,
      days,
      games: matches.map((m) => {
        const marketPulse = pulses.get(m.id);
        const homeTeamId = `${parsed.league}.${m.home.slug}`;
        const awayTeamId = `${parsed.league}.${m.away.slug}`;
        const homeInjuries = injuriesByTeam.get(homeTeamId) ?? injuriesByTeam.get(m.home.slug) ?? [];
        const awayInjuries = injuriesByTeam.get(awayTeamId) ?? injuriesByTeam.get(m.away.slug) ?? [];
        const hasInjuries = homeInjuries.length > 0 || awayInjuries.length > 0;
        const base = matchForClient(m);
        const homeLogo = teamLogo(base.home.slug, base.home.logoUrl);
        const awayLogo = teamLogo(base.away.slug, base.away.logoUrl);
        const resolvedLeagueLogo = base.leagueLogoUrl ?? leagueLogoUrl;
        return {
          ...base,
          ...(resolvedLeagueLogo ? { leagueLogoUrl: resolvedLeagueLogo } : {}),
          home: { ...base.home, ...(homeLogo ? { logoUrl: homeLogo } : {}) },
          away: { ...base.away, ...(awayLogo ? { logoUrl: awayLogo } : {}) },
          ...(marketPulse ? { marketPulse } : {}),
          ...(hasInjuries ? { injuries: { home: homeInjuries, away: awayInjuries } } : {}),
        };
      }),
      standings: standingsWithLogos,
    };

    const envelope: SnapshotEnvelope = {
      state: matches.length > 0 ? "ready" : "empty",
      data: clientSafe,
      generatedAt: clientSafe.generatedAt,
    };
    if (cacheKey) {
      snapshotCache.set(leagueKey, { key: cacheKey, envelope });
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

interface ShellIndexFile {
  schemaVersion?: number;
  builtAt?: string;
  leagues?: Record<string, SnapshotEnvelope>;
}

let shellIndexCache: { mtime: number; leagues: Record<string, SnapshotEnvelope> } | null = null;

function readFreshShellIndex(root: string): { mtime: number; leagues: Record<string, SnapshotEnvelope> } | null {
  const indexPath = path.join(root, "shell-index.json");
  const mtime = fileMtime(indexPath);
  if (!mtime) {
    shellIndexCache = null;
    return null;
  }
  if (shellIndexCache && shellIndexCache.mtime === mtime) {
    return shellIndexCache;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, "utf8")) as ShellIndexFile;
    if (parsed?.schemaVersion === 1 && parsed.leagues && typeof parsed.leagues === "object") {
      shellIndexCache = { mtime, leagues: parsed.leagues };
      return shellIndexCache;
    }
  } catch (err) {
    void err;
  }
  return null;
}

const ALL_SNAPSHOTS_TTL_MS = 15_000;
let allSnapshotsMemo: {
  root: string;
  at: number;
  envelopes: Record<ProductLeague, SnapshotEnvelope>;
} | null = null;

export function loadAllActiveLeagueSnapshots(): Record<ProductLeague, SnapshotEnvelope> {
  const root = resolveSnapshotsRoot();
  const now = Date.now();
  if (
    allSnapshotsMemo &&
    allSnapshotsMemo.root === root &&
    now - allSnapshotsMemo.at < ALL_SNAPSHOTS_TTL_MS
  ) {
    return allSnapshotsMemo.envelopes;
  }

  const precompiled = readFreshShellIndex(root);
  const entries = PRODUCT_LEAGUES.map((league) => {
    if (precompiled) {
      const pre = precompiled.leagues[league];
      if (pre) {
        const latestM = fileMtime(path.join(root, league, "latest.json"));
        const injuriesM = fileMtime(path.join(root, league, "injuries.json"));
        const pulseM = fileMtime(path.join(root, league, "market-pulse.json"));
        if (latestM <= precompiled.mtime && injuriesM <= precompiled.mtime && pulseM <= precompiled.mtime) {
          return [league, pre] as [ProductLeague, SnapshotEnvelope];
        }
      }
    }
    return [league, loadLeagueSnapshotEnvelope(league)] as [ProductLeague, SnapshotEnvelope];
  });
  const envelopes = Object.fromEntries(entries) as Record<ProductLeague, SnapshotEnvelope>;
  allSnapshotsMemo = { root, at: now, envelopes };
  return envelopes;
}

const cortexWriteupCache = new Map<
  string,
  { mtime: number; byGame: Map<string, CortexWriteup | null> }
>();

export function loadCortexWriteup(leagueKey: ProductLeague, gameId: string): CortexWriteup | null {
  try {
    const latestPath = path.join(resolveSnapshotsRoot(), leagueKey, "latest.json");
    const mtime = fileMtime(latestPath);
    if (!mtime) {
      cortexWriteupCache.delete(leagueKey);
      return null;
    }

    const cached = cortexWriteupCache.get(leagueKey);
    if (cached && cached.mtime === mtime) {
      return cached.byGame.get(gameId) ?? null;
    }

    const rawCached = rawSnapshotCache.get(leagueKey);
    const analyses =
      rawCached && rawCached.mtime === mtime
        ? (rawCached.snapshot.analyses as Record<string, { cortex?: unknown }> | undefined)
        : (JSON.parse(fs.readFileSync(latestPath, "utf8")) as {
            analyses?: Record<string, { cortex?: unknown }>;
          }).analyses;

    const byGame = new Map<string, CortexWriteup | null>();
    if (analyses && typeof analyses === "object") {
      for (const [id, entry] of Object.entries(analyses)) {
        if (!entry || entry.cortex === undefined) continue;
        const parsed = CortexWriteupSchema.safeParse(entry.cortex);
        if (parsed.success) byGame.set(id, parsed.data);
      }
    }
    cortexWriteupCache.set(leagueKey, { mtime, byGame });
    return byGame.get(gameId) ?? null;
  } catch (err) {
    void err;
    return null;
  }
}

const rawSnapshotCache = new Map<string, { mtime: number; snapshot: LeagueSnapshot }>();

export function loadRawLeagueSnapshot(leagueKey: ProductLeague): LeagueSnapshot | null {
  try {
    const latestPath = path.join(resolveSnapshotsRoot(), leagueKey, "latest.json");
    const mtime = fileMtime(latestPath);
    if (!mtime) {
      rawSnapshotCache.delete(leagueKey);
      return null;
    }
    const cached = rawSnapshotCache.get(leagueKey);
    if (cached && cached.mtime === mtime) return cached.snapshot;

    const raw = JSON.parse(fs.readFileSync(latestPath, "utf8"));
    const parsed = LeagueSnapshotSchema.parse(raw);
    rawSnapshotCache.set(leagueKey, { mtime, snapshot: parsed });
    return parsed;
  } catch (err) {
    console.warn(`[snapshots] error leyendo snapshot crudo de ${leagueKey}:`, err);
    return null;
  }
}
