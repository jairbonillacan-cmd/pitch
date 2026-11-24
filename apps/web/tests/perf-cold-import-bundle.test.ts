import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import createNextConfig from "../next.config.mjs";
import { OUTLOOK_SNAPSHOT_GENERATED_AT, findOutlook } from "../src/server/outlook";
import {
  SPACETIME_SNAPSHOT_GENERATED_AT,
  readLiveSnapshotGeneratedAtFast,
  readSpacetimeDataJson,
  resolveSpacetimeDataDir,
  spacetimeSignalFor,
} from "../src/server/spacetime";
import {
  SOCCER_57_LEAGUE_IDS_V6,
  evaluatePlayerLinkedSgpV6,
  getSpacetimeV6RegistrySummary,
} from "../src/server/spacetime-v6";

const REPO_ROOT = path.resolve(process.cwd(), "..", "..");
const RUNTIME_SPACETIME_JSON_FILES = [
  "live_matchday_v3_snapshot.json",
  "model_motor_a.json",
  "model_multisport.json",
  "model_nfl.json",
  "candidate_registry_v6_0.json",
  "model_epistemic_conformal_v5_1_candidate.json",
  "model_inplay_early_payout_v5_0_candidate.json",
  "model_multisport_v6_0_candidate.json",
  "model_officials_freeze_v6_0_candidate.json",
  "model_props_v6_0_candidate.json",
  "model_soccer_57_v6_0_candidate.json",
  "model_soccer_micro_v5_0_candidate.json",
  "model_v5_2_live_feedback_candidate.json",
  "sgp_copula_v5_0_candidate.json",
] as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Cold import & server bundle elimination for Spacetime JSON", () => {
  it("keeps zero static JSON imports from @pitchlab/spacetime/data in server modules", () => {
    const serverFiles = [
      path.join(REPO_ROOT, "apps", "web", "src", "server", "outlook.ts"),
      path.join(REPO_ROOT, "apps", "web", "src", "server", "spacetime.ts"),
      path.join(REPO_ROOT, "apps", "web", "src", "server", "spacetime-v6.ts"),
    ];
    for (const filePath of serverFiles) {
      const source = fs.readFileSync(filePath, "utf8");
      expect(source).not.toMatch(
        /from\s+["']@pitchlab\/spacetime\/data\/[^"']+\.json["']/,
      );
      expect(source).not.toMatch(
        /require\(\s*["']@pitchlab\/spacetime\/data\/[^"']+\.json["']\s*\)/,
      );
    }
  });

  it("resolves @pitchlab/spacetime/data dynamically even when process.cwd() is isolated", () => {
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(os.tmpdir());
    const resolvedDir = resolveSpacetimeDataDir();
    expect(cwdSpy).toHaveBeenCalledTimes(0);
    expect(fs.existsSync(path.join(resolvedDir, "live_matchday_v3_snapshot.json"))).toBe(true);
    for (const fileName of RUNTIME_SPACETIME_JSON_FILES) {
      expect(fs.existsSync(path.join(resolvedDir, fileName))).toBe(true);
    }
  });

  it("reads snapshot generated_at fast without full parse and preserves memoized parity", () => {
    const dataDir = resolveSpacetimeDataDir();
    const rawHeaderParsed = JSON.parse(
      fs.readFileSync(path.join(dataDir, "live_matchday_v3_snapshot.json"), "utf8"),
    ) as { generated_at?: string };
    const fastGeneratedAt = readLiveSnapshotGeneratedAtFast();
    expect(fastGeneratedAt).toBeTruthy();
    expect(fastGeneratedAt).toBe(rawHeaderParsed.generated_at);
    expect(OUTLOOK_SNAPSHOT_GENERATED_AT).toBe(fastGeneratedAt);
    expect(SPACETIME_SNAPSHOT_GENERATED_AT).toBe(fastGeneratedAt);

    const first = readSpacetimeDataJson<{ schema_version?: string }>("candidate_registry_v6_0.json");
    const second = readSpacetimeDataJson<{ schema_version?: string }>(
      "candidate_registry_v6_0.json",
    );
    expect(first).toBe(second);
    expect(SOCCER_57_LEAGUE_IDS_V6).toHaveLength(53);

    const registrySummary = getSpacetimeV6RegistrySummary();
    expect(registrySummary.activeArtifactsCount).toBe(14);
    expect(registrySummary.activeArtifactIds.length).toBeGreaterThan(0);

    const sgpEval = evaluatePlayerLinkedSgpV6({
      pPlayerAnytimeGoal: 0.42,
      teamExpectedGoals: 1.85,
      opponentExpectedGoals: 0.95,
      teamOutcome: "team_win",
      matchTotalOverLine: 2.5,
      offeredCombinedDecimalOdds: 3.1,
    });
    expect(sgpEval.fairCombinedDecimal).toBeGreaterThan(1);
    expect(typeof findOutlook).toBe("function");
    expect(typeof spacetimeSignalFor).toBe("function");
  });

  it("traces only the required 14 runtime Spacetime JSONs in next.config.mjs well below 250 MB", async () => {
    const configModule = (await import(
      pathToFileURL(path.join(REPO_ROOT, "apps", "web", "next.config.mjs")).href
    )) as { default?: typeof createNextConfig };
    const factory = configModule.default ?? createNextConfig;
    const config = factory("phase-production-build");
    const includes = config.outputFileTracingIncludes ?? {};
    const excludes = config.outputFileTracingExcludes ?? {};

    const expectedPaths = RUNTIME_SPACETIME_JSON_FILES.map(
      (fileName) => `../../packages/spacetime/data/${fileName}`,
    );
    for (const routePattern of [
      "/app",
      "/app/**",
      "/api/**",
      "/",
      "/resultados",
      "/precio",
    ] as const) {
      const routeIncludes = includes[routePattern] ?? [];
      for (const expectedPath of expectedPaths) {
        expect(routeIncludes).toContain(expectedPath);
      }
    }
    expect(includes["/blog"]).toContain("./content/blog/**/*");
    expect(excludes["*"]).toContain("../../data/history/**");

    const dataDir = resolveSpacetimeDataDir();
    let totalBytes = 0;
    for (const fileName of RUNTIME_SPACETIME_JSON_FILES) {
      totalBytes += fs.statSync(path.join(dataDir, fileName)).size;
    }
    expect(totalBytes).toBeLessThan(20 * 1024 * 1024);
  });

  it("uses React.lazy + Suspense on heavy client secondary views without barrel imports", () => {
    const matchViews = fs.readFileSync(
      path.join(REPO_ROOT, "packages", "ui", "src", "platform", "club", "CoreMatchViews.tsx"),
      "utf8",
    );
    expect(matchViews).not.toMatch(/from\s+["']\.\/match\/sport-outlook["']/);
    expect(matchViews).toContain("LazyMatchPlayerPicksBoard");
    expect(matchViews).toContain("LazyMatchLineupsPanel");
    expect(matchViews).toContain("LazyMatchEnfrentamientosPanel");
    expect(matchViews).toContain("LazyMatchInjuriesPanel");
    expect(matchViews).toContain("LazySportOutlookCard");
    expect(matchViews).toContain('isTabMounted("resumen") && (liveSupported || liveDetailOverride)');

    const leagueHub = fs.readFileSync(
      path.join(
        REPO_ROOT,
        "packages",
        "ui",
        "src",
        "platform",
        "club",
        "league",
        "LeagueHubClubView.tsx",
      ),
      "utf8",
    );
    expect(leagueHub).not.toMatch(/from\s+["']\.\.\/\.\.\/atomic["']/);
    expect(leagueHub).toContain('from "../../atomic/AtomicFormStrip"');
    expect(leagueHub).toContain("LazyKnockoutBracketSvgPanel");
    expect(leagueHub).toContain("LazyRefereeRigorBadge");
    expect(leagueHub).toContain("LazyTopLayerModalDialog");

    const picksFinder = fs.readFileSync(
      path.join(REPO_ROOT, "packages", "ui", "src", "platform", "club", "PicksFinderView.tsx"),
      "utf8",
    );
    expect(picksFinder).not.toMatch(/from\s+["']\.\.\/atomic["']/);
    expect(picksFinder).toContain("LazyLivePickProgressBar");
    expect(picksFinder).toContain("LazyNonLinearOddsSlider");
    expect(picksFinder).toContain("LazyPickEvidenceLabDrawer");
    expect(picksFinder).toContain("LazyBetBuilderDrawer");
  });
});
