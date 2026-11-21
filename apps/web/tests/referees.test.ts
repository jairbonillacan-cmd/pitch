import { afterEach, describe, expect, it, vi } from "vitest";
import { containsForbiddenFd16Term, isSafePublicLabel } from "@pitchlab/contracts";
import { GET as searchRefereesGET } from "../app/api/search/referees/route";
import { resetScrapingVelocityForTests } from "../src/server/api-guards";
import {
  classifyRefereeProfileTier,
  loadLeagueRefereeRanking,
  loadRefereeProfile,
  MAX_REFEREE_RECENT_MATCHES,
  MAX_REFEREE_SEARCH_LIMIT,
  REFEREE_EB_KAPPA,
  resetRefereesCacheForTests,
  searchRefereesDirectory,
  shrinkRefereeMetricEb,
  type RefereeSearchHit,
} from "../src/server/referees";
import { resetRateLimitsForTests } from "../src/server/request-security";
import type { ViewerAccess } from "../src/server/viewer-access";

const mocks = vi.hoisted(() => ({
  getViewerAccess: vi.fn(),
}));

vi.mock("../src/server/viewer-access", () => ({
  getViewerAccess: mocks.getViewerAccess,
}));

const ACCESS_NONE: ViewerAccess = {
  via: "none",
  signupComplete: false,
  fullAccess: false,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const ACCESS_BETA: ViewerAccess = {
  via: "beta",
  signupComplete: true,
  fullAccess: true,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const ACCESS_MEMBER: ViewerAccess = {
  via: "account",
  signupComplete: true,
  fullAccess: true,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

afterEach(() => {
  vi.resetAllMocks();
  resetRateLimitsForTests();
  resetScrapingVelocityForTests();
  resetRefereesCacheForTests();
});

describe("Árbitros · Empirical Bayes κ=15, perfiles, tarjeteables y búsqueda protegida", () => {
  it("aplica contracción Empirical Bayes κ=15 exacta y clasifica perfiles de rigurosidad", () => {
    expect(REFEREE_EB_KAPPA).toBe(15);
    expect(shrinkRefereeMetricEb(6.0, 5, 4.0, 15)).toBe(4.5);
    expect(shrinkRefereeMetricEb(6.0, 45, 4.0, 15)).toBe(5.5);
    expect(shrinkRefereeMetricEb(2.0, 0, 4.15, 15)).toBe(4.15);

    const smallSample = shrinkRefereeMetricEb(7.0, 3, 4.0, 15);
    const largeSample = shrinkRefereeMetricEb(7.0, 60, 4.0, 15);
    expect(smallSample).toBeLessThan(largeSample);
    expect(smallSample).toBeGreaterThan(4.0);

    expect(classifyRefereeProfileTier(4.6, 4.1, 85, 15).tier).toBe("estricto");
    expect(classifyRefereeProfileTier(3.6, 4.1, 15, 15).tier).toBe("permisivo");
    expect(classifyRefereeProfileTier(4.12, 4.1, 50, 15).tier).toBe("promedio");
    expect(classifyRefereeProfileTier(null, 4.1, 50, 15).tier).toBe("promedio");
  });

  it("construye rankings reales en premier-league, liga-mx y libertadores con EB κ=15 y 0 fugas FD-16", () => {
    const prem = loadLeagueRefereeRanking("premier-league");
    expect(prem).not.toBeNull();
    expect(prem?.kappa).toBe(15);
    expect(prem!.referees.length).toBeGreaterThanOrEqual(10);
    expect(prem!.totalReferees).toBe(prem!.referees.length);

    for (let i = 0; i < prem!.referees.length; i += 1) {
      const ref = prem!.referees[i]!;
      expect(ref.rank).toBe(i + 1);
      expect(isSafePublicLabel(ref.name)).toBe(true);
      expect(["estricto", "promedio", "permisivo"]).toContain(ref.tier);
      if (ref.avgYellow !== null) {
        expect(ref.ebYellow).toBe(
          shrinkRefereeMetricEb(ref.avgYellow, ref.matches, prem!.leagueMeanYellow, 15),
        );
      }
      if (i > 0 && ref.ebYellow !== null && prem!.referees[i - 1]!.ebYellow !== null) {
        expect(prem!.referees[i - 1]!.ebYellow!).toBeGreaterThanOrEqual(ref.ebYellow);
      }
    }
    expect(containsForbiddenFd16Term(JSON.stringify(prem))).toBe(false);

    const mx = loadLeagueRefereeRanking("liga-mx");
    expect(mx).not.toBeNull();
    expect(mx?.kappa).toBe(15);
    expect(mx!.referees.length).toBeGreaterThanOrEqual(1);
    expect(mx!.referees[0]!.lastMatch).not.toBeNull();
    expect(containsForbiddenFd16Term(JSON.stringify(mx))).toBe(false);

    const lib = loadLeagueRefereeRanking("libertadores");
    expect(lib).not.toBeNull();
    expect(lib!.referees.length).toBeGreaterThanOrEqual(5);
    expect(containsForbiddenFd16Term(JSON.stringify(lib))).toBe(false);

    expect(loadLeagueRefereeRanking("liga-inexistente")).toBeNull();
  });

  it("carga perfil completo con <= 20 jornadas, desglose por competición, próximo encuentro y bookablePlayers reales", () => {
    const prem = loadLeagueRefereeRanking("premier-league");
    expect(prem).not.toBeNull();
    const withNext = prem!.referees.find((r) => r.nextAssignment !== null);
    expect(withNext).toBeDefined();

    const profile = loadRefereeProfile(withNext!.slug, "premier-league");
    expect(profile).not.toBeNull();
    expect(profile!.kappa).toBe(15);
    expect(profile!.primaryLeague).toBe("premier-league");
    expect(profile!.recentMatches.length).toBeLessThanOrEqual(MAX_REFEREE_RECENT_MATCHES);
    expect(profile!.competitionBreakdown.length).toBeGreaterThanOrEqual(1);
    expect(profile!.competitionBreakdown[0]!.league).toBe("premier-league");
    expect(profile!.nextAssignment).not.toBeNull();
    expect(profile!.nextAssignment!.league).toBe("premier-league");
    expect(profile!.bookablePlayers.length).toBeGreaterThan(0);

    for (let i = 0; i < profile!.bookablePlayers.length; i += 1) {
      const player = profile!.bookablePlayers[i]!;
      expect(player.appearances).toBeGreaterThanOrEqual(3);
      expect(isSafePublicLabel(player.name)).toBe(true);
      expect(player.href).toMatch(/^\/app\/premier-league\/t\/[^/]+\/p\/.+$/);
      if (i > 0) {
        const prev = profile!.bookablePlayers[i - 1]!;
        const ordered =
          prev.yellowCards > player.yellowCards ||
          (prev.yellowCards === player.yellowCards &&
            prev.foulsCommitted >= player.foulsCommitted);
        expect(ordered).toBe(true);
      }
    }
    expect(containsForbiddenFd16Term(JSON.stringify(profile))).toBe(false);

    const mxRef = loadLeagueRefereeRanking("liga-mx")!.referees[0]!;
    const mxProfile = loadRefereeProfile(mxRef.slug, "liga-mx");
    expect(mxProfile).not.toBeNull();
    expect(mxProfile!.recentMatches.length).toBeGreaterThanOrEqual(1);
    expect(mxProfile!.recentMatches.length).toBeLessThanOrEqual(20);
    expect(containsForbiddenFd16Term(JSON.stringify(mxProfile))).toBe(false);

    expect(loadRefereeProfile("arbitro-fantasma-inexistente")).toBeNull();
  });

  it("busca árbitros en directorio cacheado con límite <= 40, filtros válidos y 0 fugas FD-16", () => {
    const oliver = searchRefereesDirectory("Oliver", { limit: 10 });
    expect(oliver.length).toBeGreaterThan(0);
    expect(oliver[0]!.name.toLowerCase()).toContain("oliver");
    expect(containsForbiddenFd16Term(JSON.stringify(oliver))).toBe(false);

    const bounded = searchRefereesDirectory("", { league: "premier-league", limit: 250 });
    expect(bounded.length).toBeGreaterThan(0);
    expect(bounded.length).toBeLessThanOrEqual(MAX_REFEREE_SEARCH_LIMIT);
    expect(bounded.every((hit) => hit.league === "premier-league")).toBe(true);

    const strictHits = searchRefereesDirectory("", { tier: "estricto", limit: 15 });
    expect(strictHits.length).toBeGreaterThan(0);
    expect(strictHits.every((hit) => hit.tier === "estricto")).toBe(true);

    expect(searchRefereesDirectory("Oliver", { league: "liga-no-permitida" })).toEqual([]);
    expect(searchRefereesDirectory("")).toEqual([]);
  });

  it("GET /api/search/referees exige sesión (401), permite beta/miembro (200), aplica allowlist y private, no-store", async () => {
    mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_NONE);
    const anonRes = await searchRefereesGET(
      new Request("http://localhost:9990/api/search/referees?q=Oliver"),
    );
    expect(anonRes.status).toBe(401);
    expect(anonRes.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await anonRes.json()).toEqual({ error: "unauthorized" });

    mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_BETA);
    const betaRes = await searchRefereesGET(
      new Request("http://localhost:9990/api/search/referees?q=Oliver&limit=120"),
    );
    expect(betaRes.status).toBe(200);
    expect(betaRes.headers.get("Cache-Control")).toBe("private, no-store");
    const betaBody = (await betaRes.json()) as { items: RefereeSearchHit[] };
    expect(betaBody.items.length).toBeGreaterThan(0);
    expect(betaBody.items.length).toBeLessThanOrEqual(40);
    expect(containsForbiddenFd16Term(JSON.stringify(betaBody))).toBe(false);

    mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_MEMBER);
    const invalidLeagueRes = await searchRefereesGET(
      new Request("http://localhost:9990/api/search/referees?q=Oliver&league=liga-hack"),
    );
    expect(invalidLeagueRes.status).toBe(400);
    expect(invalidLeagueRes.headers.get("Cache-Control")).toBe("private, no-store");

    mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_MEMBER);
    const invalidTierRes = await searchRefereesGET(
      new Request("http://localhost:9990/api/search/referees?q=Oliver&tier=rigor_falso"),
    );
    expect(invalidTierRes.status).toBe(400);

    mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_MEMBER);
    const shortRes = await searchRefereesGET(
      new Request("http://localhost:9990/api/search/referees?q=a"),
    );
    expect(shortRes.status).toBe(200);
    expect(await shortRes.json()).toEqual({ items: [] });
  });
});
