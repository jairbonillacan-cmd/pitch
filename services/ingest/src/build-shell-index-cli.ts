/**
 * Precompila `data/snapshots/shell-index.json` a partir de todos los snapshots vigentes
 * (`data/snapshots/<league>/latest.json`, `injuries.json` y `market-pulse.json`) para
 * que el arranque en frío serverless (Vercel) cargue las 57 competencias en 1 sola lectura.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMPETITION_BY_ID,
  LeagueInjuriesFileSchema,
  LeagueSnapshotSchema,
  MarketPulseFileSchema,
  snapshotToMatchAnalyses,
  sportForLeague,
  toMarketPulseView,
  type MarketPulseView,
  type MatchAnalysis,
  type TeamInjuryEntry,
} from "@pitchlab/contracts";
import {
  getBzzoiroLeagueEmblemUrl,
  getBzzoiroTeamEmblemUrl,
  getOfficialEspnLeagueLogoUrl,
  getOfficialEspnTeamLogoUrl,
} from "@pitchlab/sports-assets";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const SNAPSHOTS_ROOT = join(REPO_ROOT, "data/snapshots");

const MATCH_CONTEXT_FACTORS = new Set([
  "Forma local",
  "Forma visitante",
  "Posición local",
  "Posición visitante",
  "Local",
  "Visitante",
  "Descanso",
  "Tiempo extra",
]);

function trimMatchForClient({ steps: _steps, why: _why, ...match }: MatchAnalysis): MatchAnalysis {
  return {
    ...match,
    factors: match.factors.filter(({ label }) => MATCH_CONTEXT_FACTORS.has(label)),
    trace: [],
    confidence: match.confidence ? { ...match.confidence, reasons: [] } : undefined,
  };
}

function loadPulseMap(file: string): Map<string, MarketPulseView> {
  const map = new Map<string, MarketPulseView>();
  if (!existsSync(file)) return map;
  try {
    const parsed = MarketPulseFileSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    for (const entry of parsed.entries) map.set(entry.gameId, toMarketPulseView(entry));
  } catch (err) {
    void err;
  }
  return map;
}

function loadInjuriesMap(file: string): Map<string, TeamInjuryEntry[]> {
  const map = new Map<string, TeamInjuryEntry[]>();
  if (!existsSync(file)) return map;
  try {
    const parsed = LeagueInjuriesFileSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    for (const entry of parsed.entries) {
      const bucket = map.get(entry.teamId) ?? [];
      bucket.push(entry);
      map.set(entry.teamId, bucket);
    }
  } catch (err) {
    void err;
  }
  return map;
}

function main(): void {
  const started = Date.now();
  const builtAt = new Date().toISOString();
  const dirs = readdirSync(SNAPSHOTS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const leagues: Record<string, unknown> = {};
  let readyCount = 0;
  let totalGames = 0;

  for (const leagueKey of dirs) {
    const dir = join(SNAPSHOTS_ROOT, leagueKey);
    const latestPath = join(dir, "latest.json");
    if (!existsSync(latestPath)) continue;

    try {
      const raw = JSON.parse(readFileSync(latestPath, "utf8")) as unknown;
      const parsed = LeagueSnapshotSchema.parse(raw);
      const { days, matches } = snapshotToMatchAnalyses(parsed);
      const pulses = loadPulseMap(join(dir, "market-pulse.json"));
      const injuriesByTeam = loadInjuriesMap(join(dir, "injuries.json"));

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

      const games = matches.map((m) => {
        const marketPulse = pulses.get(m.id);
        const homeTeamId = `${parsed.league}.${m.home.slug}`;
        const awayTeamId = `${parsed.league}.${m.away.slug}`;
        const homeInjuries = injuriesByTeam.get(homeTeamId) ?? injuriesByTeam.get(m.home.slug) ?? [];
        const awayInjuries = injuriesByTeam.get(awayTeamId) ?? injuriesByTeam.get(m.away.slug) ?? [];
        const hasInjuries = homeInjuries.length > 0 || awayInjuries.length > 0;
        const base = trimMatchForClient(m);
        const homeLogo = teamLogo(base.home.slug, base.home.logoUrl);
        const awayLogo = teamLogo(base.away.slug, base.away.logoUrl);
        const resolvedLeagueLogo = base.leagueLogoUrl ?? leagueLogoUrl;
        const resolvedLeagueLabel = COMPETITION_BY_ID[parsed.league]?.label ?? base.leagueLabel;
        return {
          ...base,
          leagueLabel: resolvedLeagueLabel,
          ...(resolvedLeagueLogo ? { leagueLogoUrl: resolvedLeagueLogo } : {}),
          home: { ...base.home, ...(homeLogo ? { logoUrl: homeLogo } : {}) },
          away: { ...base.away, ...(awayLogo ? { logoUrl: awayLogo } : {}) },
          ...(marketPulse ? { marketPulse } : {}),
          ...(hasInjuries ? { injuries: { home: homeInjuries, away: awayInjuries } } : {}),
        };
      });

      const clientSafe = {
        schemaVersion: 1 as const,
        league: parsed.league,
        leagueLabel: COMPETITION_BY_ID[parsed.league]?.label ?? parsed.league,
        ...(leagueLogoUrl ? { logoUrl: leagueLogoUrl } : {}),
        sport: sportForLeague(parsed.league),
        season: parsed.seasonLabel,
        roundLabel: parsed.periodLabel,
        generatedAt: parsed.updatedAt,
        days,
        games,
        ...(standingsWithLogos ? { standings: standingsWithLogos } : {}),
      };

      leagues[leagueKey] = {
        state: games.length > 0 ? "ready" : "empty",
        data: clientSafe,
        generatedAt: clientSafe.generatedAt,
      };
      if (games.length > 0) readyCount += 1;
      totalGames += games.length;
    } catch (err) {
      console.warn(`[shell-index] omitido ${leagueKey}:`, err instanceof Error ? err.message : String(err));
    }
  }

  const outPath = join(SNAPSHOTS_ROOT, "shell-index.json");
  const json = JSON.stringify({
    schemaVersion: 1,
    builtAt,
    leagueCount: Object.keys(leagues).length,
    leagues,
  });
  writeFileSync(outPath, json);
  const sizeKb = Math.round(Buffer.byteLength(json, "utf8") / 1024);
  console.log(
    `[shell-index] Generado ${outPath}: ${Object.keys(leagues).length} ligas (${readyCount} con partidos, ${totalGames} partidos, ${sizeKb} KB) en ${Date.now() - started} ms.`,
  );
}

main();
