/**
 * `pnpm --filter @pitchlab/ingest history:link`
 *
 * Empareja lo bajado de Bzzoiro y 5Dollar con el corpus (`data/history/<liga>.jsonl`) y escribe,
 * siempre por `id` canónico (ignorado por Git):
 *
 *   data/history/research/provider-ids/<liga>.jsonl        { id, bzzoiro, fivedollar }
 *   data/history/research/provider-ids/<liga>.teams.json   mapa de equipos con votos
 *   data/history/research/xg-bzzoiro/<liga>.jsonl          xG medido (lo lee el backtest)
 *   data/history/research/match-context/<liga>.jsonl       bajas, córners, tarjetas y cierre Bet365
 *   data/history/research/extended/liga-mx.jsonl           partidos que openfootball no publica
 *                                                          (lo usa `backtest:history --extend-corpus`)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { BzzoiroMatchRow } from "./bzzoiro.js";
import type { FiveDollarMatchRow } from "./fivedollar.js";
import { buildLigaMxExtension } from "./extend-corpus.js";
import { linkProviderGames, type CorpusGame, type LinkResult, type ProviderGame } from "./link.js";

const ROOT_DIR = resolve(import.meta.dirname, "..", "..", "..", "..");
const HISTORY = join(ROOT_DIR, "data", "history");
const RESEARCH = join(HISTORY, "research");

/** Liga del proveedor → archivo del corpus. */
const CORPUS_FILE: Record<string, string> = {
  "liga-mx": "liga-mx",
  "premier-league": "premier-league",
  laliga: "la-liga",
  bundesliga: "bundesliga",
  "serie-a": "serie-a",
  "ligue-1": "ligue-1",
};

function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

function writeJsonl(file: string, rows: readonly unknown[]): void {
  mkdirSync(resolve(file, ".."), { recursive: true });
  writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), "utf8");
}

function asProviderGame(row: BzzoiroMatchRow | FiveDollarMatchRow): ProviderGame {
  const score = row.source === "bzzoiro" ? row.score : row.goals;
  return {
    providerMatchId: row.providerMatchId,
    kickoffUtc: row.kickoffUtc,
    home: { providerTeamId: row.home.providerTeamId, name: row.home.name },
    away: { providerTeamId: row.away.providerTeamId, name: row.away.name },
    homeScore: score.home,
    awayScore: score.away,
  };
}

function summarize(name: string, league: string, rows: number, result: LinkResult): void {
  const pct = rows ? ((100 * result.links.size) / rows).toFixed(1) : "0";
  console.log(
    `[link] ${league} · ${name}: ${result.links.size}/${rows} (${pct} %) · ancla ${result.stats.anchored}, ` +
      `segunda pasada ${result.stats.secondPass}, ambiguos ${result.stats.ambiguous}, equipos mapeados ${result.teamMap.size}`,
  );
}

function main(): void {
  for (const [providerLeague, corpusLeague] of Object.entries(CORPUS_FILE)) {
    const corpus = readJsonl<CorpusGame>(join(HISTORY, `${corpusLeague}.jsonl`));
    const bz = readJsonl<BzzoiroMatchRow>(join(RESEARCH, "bzzoiro", `${providerLeague}.jsonl`));
    const fd = readJsonl<FiveDollarMatchRow>(join(RESEARCH, "fivedollar", `${providerLeague}.jsonl`));
    if (corpus.length === 0 || (bz.length === 0 && fd.length === 0)) continue;

    const bzLink = linkProviderGames(corpus, bz.map(asProviderGame));
    const fdLink = linkProviderGames(corpus, fd.map(asProviderGame));
    if (bz.length) summarize("bzzoiro", corpusLeague, bz.length, bzLink);
    if (fd.length) summarize("fivedollar", corpusLeague, fd.length, fdLink);

    const byId = new Map<string, { id: string; bzzoiro?: number; fivedollar?: number }>();
    for (const [pid, id] of bzLink.links) byId.set(id, { ...(byId.get(id) ?? { id }), bzzoiro: pid });
    for (const [pid, id] of fdLink.links) byId.set(id, { ...(byId.get(id) ?? { id }), fivedollar: pid });

    // Liga MX: partidos que openfootball no publica → extensión research-only del corpus.
    if (corpusLeague === "liga-mx" && bz.length) {
      const extension = buildLigaMxExtension(bz, {
        teamMap: new Map([...bzLink.teamMap].map(([pid, t]) => [pid, t.team])),
        linked: new Set(bzLink.links.keys()),
        corpusIds: new Set(corpus.map((g) => g.id)),
      });
      writeJsonl(join(RESEARCH, "extended", `${corpusLeague}.jsonl`), extension);
      for (const game of extension) {
        byId.set(game.id, { id: game.id, bzzoiro: Number(game.sourceId.slice("bzzoiro:".length)) });
      }
      const seasons = [...new Set(extension.map((g) => g.season))].sort().join(", ");
      console.log(`[link] ${corpusLeague}: extensión research-only con ${extension.length} partidos (${seasons})`);
    }

    const ids = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
    writeJsonl(join(RESEARCH, "provider-ids", `${corpusLeague}.jsonl`), ids);
    writeFileSync(
      join(RESEARCH, "provider-ids", `${corpusLeague}.teams.json`),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          bzzoiro: Object.fromEntries(bzLink.teamMap),
          fivedollar: Object.fromEntries(fdLink.teamMap),
          unmatched: {
            bzzoiro: bzLink.unmatched.length,
            fivedollar: fdLink.unmatched.length,
          },
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    const bzById = new Map(bz.map((r) => [r.providerMatchId, r]));
    const fdById = new Map(fd.map((r) => [r.providerMatchId, r]));

    const xgRows = [];
    const contextRows = [];
    for (const link of ids) {
      const b = link.bzzoiro !== undefined ? bzById.get(link.bzzoiro) : undefined;
      const f = link.fivedollar !== undefined ? fdById.get(link.fivedollar) : undefined;
      const hs = b?.stats?.home;
      const as = b?.stats?.away;
      if (hs?.xg != null && as?.xg != null) {
        xgRows.push({
          id: link.id,
          homeXg: hs.xg,
          awayXg: as.xg,
          estimated: hs.xgEstimated === true || as.xgEstimated === true,
          source: "bzzoiro",
        });
      }
      contextRows.push({
        id: link.id,
        homeUnavailable: b?.lineups ? b.lineups.home.unavailable.length : null,
        awayUnavailable: b?.lineups ? b.lineups.away.unavailable.length : null,
        lineupConfirmed: b?.lineups?.status === "confirmed",
        homeCorners: hs?.corners ?? f?.corners.home ?? null,
        awayCorners: as?.corners ?? f?.corners.away ?? null,
        homeYellow: hs?.yellowCards ?? f?.cards.homeYellow ?? null,
        awayYellow: as?.yellowCards ?? f?.cards.awayYellow ?? null,
        homeShotsOnTarget: hs?.shotsOnTarget ?? null,
        awayShotsOnTarget: as?.shotsOnTarget ?? null,
        refereeId: b?.context.refereeId ?? null,
        travelKm: b?.context.travelKm ?? null,
        bet365Closing1x2: f?.odds?.oneXTwo.closing ?? null,
        bet365ClosingCorners: f?.odds?.cornerLine.closing ?? null,
        bet365ClosingCards: f?.odds?.cardLine.closing ?? null,
      });
    }
    writeJsonl(join(RESEARCH, "xg-bzzoiro", `${corpusLeague}.jsonl`), xgRows);
    writeJsonl(join(RESEARCH, "match-context", `${corpusLeague}.jsonl`), contextRows);
    console.log(`[link] ${corpusLeague}: ${xgRows.length} partidos con xG medido · ${contextRows.length} con contexto`);
  }
}

main();
