import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { asLeagueId, FORBIDDEN_PROVIDER_TOKENS, type LeagueId } from "@pitchlab/contracts";
import {
  clearClientJsonCache,
  getClientJsonCacheStats,
  invalidateClientJsonCache,
  prefetchClientJson,
  readClientJsonCache,
  useClientJsonSwr,
  writeClientJsonCache,
} from "../src/platform/hooks/useClientJsonCache";
import {
  HomeClubSkeleton,
  LeagueHubSkeleton,
  MatchDetailSkeleton,
  PicksSkeleton,
} from "../src/platform/components/RouteSkeletons";
import {
  ResultadosPageSurface,
  selectProjectedResultadosBoard,
  type LandingFinishedResultItem,
} from "../src/platform/public/PublicSiteSections";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TESTS_DIR, "../../..");

const SAMPLE_LEAGUES: readonly LeagueId[] = [
  asLeagueId("liga-mx"),
  asLeagueId("premier-league"),
  asLeagueId("laliga"),
  asLeagueId("serie-a"),
  asLeagueId("bundesliga"),
  asLeagueId("ligue-1"),
  asLeagueId("champions-league"),
  asLeagueId("nba"),
  asLeagueId("nfl"),
  asLeagueId("mlb"),
  asLeagueId("nhl"),
  asLeagueId("mls"),
];

function buildFinishedSampleFixtures(count: number): LandingFinishedResultItem[] {
  const rows: LandingFinishedResultItem[] = [];
  for (let idx = 0; idx < count; idx += 1) {
    const league = SAMPLE_LEAGUES[idx % SAMPLE_LEAGUES.length]!;
    const hit = idx % 3 !== 0;
    const homeGoals = (idx % 3) + 1;
    const awayGoals = idx % 2;
    rows.push({
      id: `${league}-match-${idx}`,
      league,
      leagueLabel: `Liga ${league}`,
      metaLabel: `Liga ${league} · Jornada ${idx + 1}`,
      scoreLabel: `Local ${idx} ${homeGoals}–${awayGoals} Visita ${idx}`,
      home: { slug: `local-${idx}`, name: `Local ${idx}` },
      away: { slug: `visita-${idx}`, name: `Visita ${idx}` },
      pickLabel: idx % 2 === 0 ? "Más de 2.5 goles" : "Local o Empate",
      p: 0.56 + (idx % 12) * 0.02,
      fairAmerican: idx % 2 === 0 ? "−135" : "−150",
      hit,
      kickoffUtc: "2026-11-18T20:00:00.000Z",
      score: { home: homeGoals, away: awayGoals },
    });
  }
  return rows;
}

function SwrProbe({
  url,
  cacheKey,
  enabled = true,
}: {
  url: string | null;
  cacheKey: string;
  enabled?: boolean;
}): React.JSX.Element {
  const result = useClientJsonSwr<{ label: string }>(url, {
    enabled,
    cacheKey,
    staleTimeMs: 30_000,
    ttlMs: 120_000,
  });
  return (
    <div
      data-loading={result.loading ? "1" : "0"}
      data-cached={result.isFromCache ? "1" : "0"}
      data-label={result.data?.label ?? "empty"}
    />
  );
}

describe("Experiencia progresiva, caché corta SWR y proyección /resultados", () => {
  afterEach(() => {
    clearClientJsonCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("maneja frescura, estado stale, expiración TTL y limpieza selectiva por alcance", () => {
    const t0 = 1_700_000_000_000;
    writeClientJsonCache(
      "preview:guest:1:g1",
      { gameId: "g1", tier: "guest" },
      { staleTimeMs: 15_000, ttlMs: 60_000, now: t0 },
    );
    writeClientJsonCache(
      "preview:member:1:g1",
      { gameId: "g1", tier: "member" },
      { staleTimeMs: 15_000, ttlMs: 60_000, now: t0 },
    );

    const freshGuest = readClientJsonCache<{ tier: string }>("preview:guest:1:g1", t0 + 5_000);
    expect(freshGuest?.data.tier).toBe("guest");
    expect(freshGuest?.isStale).toBe(false);

    const staleGuest = readClientJsonCache<{ tier: string }>("preview:guest:1:g1", t0 + 25_000);
    expect(staleGuest?.data.tier).toBe("guest");
    expect(staleGuest?.isStale).toBe(true);

    const expiredGuest = readClientJsonCache<{ tier: string }>("preview:guest:1:g1", t0 + 60_001);
    expect(expiredGuest).toBeNull();

    const memberStillAlive = readClientJsonCache<{ tier: string }>("preview:member:1:g1", t0 + 10_000);
    expect(memberStillAlive?.data.tier).toBe("member");

    writeClientJsonCache("preview:guest:1:g2", { gameId: "g2" }, { now: t0 });
    const removedCount = invalidateClientJsonCache("preview:guest:");
    expect(removedCount).toBe(1);
    expect(readClientJsonCache("preview:member:1:g1", t0 + 10_000)).not.toBeNull();
  });

  it("deduplica peticiones prefetch concurrentes en vuelo y sirve hits sincrónicos en useClientJsonSwr", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ label: "América vs Chivas" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const [a, b] = await Promise.all([
      prefetchClientJson<{ label: string }>("/api/games/lmx-1/preview", {
        cacheKey: "preview:member:1:lmx-1",
      }),
      prefetchClientJson<{ label: string }>("/api/games/lmx-1/preview", {
        cacheKey: "preview:member:1:lmx-1",
      }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a?.label).toBe("América vs Chivas");
    expect(b?.label).toBe("América vs Chivas");
    expect(getClientJsonCacheStats().size).toBe(1);

    const cachedMarkup = renderToStaticMarkup(
      <SwrProbe url="/api/games/lmx-1/preview" cacheKey="preview:member:1:lmx-1" />,
    );
    expect(cachedMarkup).toContain('data-cached="1"');
    expect(cachedMarkup).toContain('data-loading="0"');
    expect(cachedMarkup).toContain('data-label="América vs Chivas"');

    const missMarkup = renderToStaticMarkup(
      <SwrProbe url="/api/games/lmx-2/preview" cacheKey="preview:member:1:lmx-2" />,
    );
    expect(missMarkup).toContain('data-cached="0"');
    expect(missMarkup).toContain('data-loading="1"');
  });

  it("esqueletos geométricos preservan geometría de layout sin fuga de tokens ni marcas prohibidas", () => {
    const homeHtml = renderToStaticMarkup(<HomeClubSkeleton />);
    const picksHtml = renderToStaticMarkup(<PicksSkeleton />);
    const leagueHtml = renderToStaticMarkup(<LeagueHubSkeleton />);
    const matchHtml = renderToStaticMarkup(<MatchDetailSkeleton />);

    expect(homeHtml).toContain("pl-route-skel");
    expect(homeHtml).toContain("pl-home-md-workspace");
    expect(homeHtml).toContain("pl-home-md-master");
    expect(homeHtml).toContain("pl-home-md-detail-pane");
    expect(picksHtml).toContain("lg:grid-cols-[minmax(0,74fr)_minmax(276px,26fr)]");
    expect(leagueHtml).toContain("lg:grid-cols-[minmax(320px,372px)_minmax(0,1fr)]");
    expect(matchHtml).toContain("min-[1080px]:grid-cols-[minmax(300px,344px)_minmax(0,1fr)]");

    for (const html of [homeHtml, picksHtml, leagueHtml, matchHtml]) {
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-busy="true"');
      const lower = html.toLowerCase();
      for (const token of FORBIDDEN_PROVIDER_TOKENS) {
        expect(lower).not.toContain(token);
      }
      expect(lower).not.toContain("bzzoiro");
      expect(lower).not.toContain("espncdn");
    }
  });

  it("proyecta la ventana inicial de /resultados cubriendo todas las ligas y conservando KPIs completos", () => {
    const allResults = buildFinishedSampleFixtures(240);
    const projected = selectProjectedResultadosBoard(allResults, 36);

    expect(projected).toHaveLength(36);
    expect(projected.slice(0, 20).map((r) => r.id)).toEqual(
      allResults.slice(0, 20).map((r) => r.id),
    );
    const coveredLeagues = new Set(projected.map((r) => r.league));
    expect(coveredLeagues.size).toBe(SAMPLE_LEAGUES.length);

    const surfaceHtml = renderToStaticMarkup(
      <ResultadosPageSurface results={allResults} boardResults={projected} />,
    );
    expect(surfaceHtml).toContain("240");
    expect(surfaceHtml).toContain("Ventana interactiva");
    expect(surfaceHtml).toContain("36");
  });

  it("valida límites Streaming RSC Suspense, startTransition en shell-extend y CSS sin backdrop-filter", () => {
    const appLoading = fs.readFileSync(path.join(REPO_ROOT, "apps/web/app/app/loading.tsx"), "utf8");
    expect(appLoading).toContain("HomeClubSkeleton");
    expect(appLoading).not.toContain("LaunchScreen");

    for (const rel of [
      "apps/web/app/app/page.tsx",
      "apps/web/app/app/picks/page.tsx",
      "apps/web/app/app/[league]/page.tsx",
      "apps/web/app/app/[league]/g/[gameSlug]/page.tsx",
      "apps/web/app/resultados/page.tsx",
    ]) {
      const src = fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
      expect(src, `${rel} debe declarar Suspense`).toContain("Suspense");
    }

    const resultadosSrc = fs.readFileSync(
      path.join(REPO_ROOT, "apps/web/app/resultados/page.tsx"),
      "utf8",
    );
    expect(resultadosSrc).toMatch(/export const revalidate\s*=\s*\d+/);
    expect(resultadosSrc).toContain("selectProjectedResultadosBoard");
    expect(resultadosSrc).not.toContain("cookies(");

    const bridgeSrc = fs.readFileSync(
      path.join(REPO_ROOT, "apps/web/src/client/platform-client-bridge.tsx"),
      "utf8",
    );
    expect(bridgeSrc).toContain("startBackgroundTransition(() => {");
    expect(bridgeSrc).toContain("mergeShellExtension");

    const shellCss = fs.readFileSync(
      path.join(REPO_ROOT, "apps/web/app/shell-ergonomics.css"),
      "utf8",
    );
    expect(shellCss).toContain("@starting-style");
    expect(shellCss).toContain("prefers-reduced-motion: reduce");
    expect(shellCss).not.toMatch(/backdrop-filter\s*:/i);
    expect(shellCss).not.toMatch(/transition[^;]*box-shadow/i);
  });
});
