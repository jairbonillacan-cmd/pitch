import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProgressiveImage } from "../../../packages/ui/src/platform/components/ProgressiveImage";
import { loadGameDetail, loadScreenerApiPage, clearPlatformDataCachesForTests } from "../src/server/platform-data";
import { clearSnapshotCausalityCachesForTests } from "../src/server/snapshots";
import type { ViewerAccess } from "../src/server/viewer-access";

const mocks = vi.hoisted(() => ({
  getViewerAccess: vi.fn(),
  resolveServerFrozenMainPick: vi.fn(),
}));

vi.mock("../src/server/viewer-access", () => ({
  getViewerAccess: mocks.getViewerAccess,
}));

vi.mock("../src/server/frozen-picks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/frozen-picks")>()),
  resolveServerFrozenMainPick: mocks.resolveServerFrozenMainPick,
}));

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(TESTS_DIR, "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "../..");
const UI_ROOT = path.join(REPO_ROOT, "packages/ui/src/platform");

const ACCESS_VISITOR: ViewerAccess = {
  via: "account",
  signupComplete: true,
  fullAccess: false,
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

function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function readWebpSize(filePath: string): { readonly width: number; readonly height: number; readonly bytes: number } {
  const buf = fs.readFileSync(filePath);
  const riff = buf.toString("ascii", 0, 4);
  const webp = buf.toString("ascii", 8, 12);
  expect(riff).toBe("RIFF");
  expect(webp).toBe("WEBP");
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    const width = 1 + (buf[24]! | (buf[25]! << 8) | (buf[26]! << 16));
    const height = 1 + (buf[27]! | (buf[28]! << 8) | (buf[29]! << 16));
    return { width, height, bytes: buf.length };
  }
  if (chunk === "VP8 ") {
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return { width, height, bytes: buf.length };
  }
  if (chunk === "VP8L") {
    const bits = buf.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height, bytes: buf.length };
  }
  throw new Error(`Unsupported WebP chunk ${chunk}`);
}

describe("Fase 2B · Performance web/móvil, contratos C1/C3/C4, lazy views, drawers CSS y WebP", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearPlatformDataCachesForTests();
    clearSnapshotCausalityCachesForTests();
  });

  it("Contrato C1 redacta enrichedLineups en loadGameDetail cuando !fullAccess en NS y lo permite en FT / member", async () => {
    mocks.resolveServerFrozenMainPick.mockResolvedValue(null);
    const screener = loadScreenerApiPage({ fullAccess: true, page: 1, pageSize: 10, tab: "upcoming" });
    const upcomingId = Object.keys(screener.games).find((id) => screener.games[id]?.sport === "football")
      ?? Object.keys(screener.games)[0];
    expect(upcomingId).toBeDefined();

    mocks.getViewerAccess.mockResolvedValue(ACCESS_VISITOR);
    const visitorDetail = await loadGameDetail(upcomingId!);
    expect(visitorDetail).not.toBeNull();
    expect(visitorDetail!.enrichedLineups).toBeNull();
    expect(visitorDetail!.playerPicks).toEqual([]);

    mocks.getViewerAccess.mockResolvedValue(ACCESS_MEMBER);
    const memberDetail = await loadGameDetail(upcomingId!);
    expect(memberDetail).not.toBeNull();
    expect(memberDetail!.picksCatalog?.picks.length ?? 0).toBeGreaterThan(0);

    const settled = loadScreenerApiPage({ fullAccess: true, page: 1, pageSize: 10, tab: "settled" });
    const settledFootballId = Object.keys(settled.games).find(
      (id) => settled.games[id]?.sport === "football",
    );
    if (settledFootballId) {
      mocks.getViewerAccess.mockResolvedValue(ACCESS_VISITOR);
      const ftVisitorDetail = await loadGameDetail(settledFootballId);
      expect(ftVisitorDetail).not.toBeNull();
      expect(ftVisitorDetail!.picksCatalog?.isRedactedForVisitor).toBe(false);
    }
  });

  it("ProgressiveImage con loading eager evita flash data-loaded=false y elimina useEffect", () => {
    const eagerHtml = renderToStaticMarkup(
      React.createElement(ProgressiveImage, {
        src: "/landing/hero-light.webp",
        alt: "Vista principal",
        width: 1536,
        height: 1024,
        loading: "eager",
      }),
    );
    expect(eagerHtml).toContain('data-loaded="true"');

    const lazyHtml = renderToStaticMarkup(
      React.createElement(ProgressiveImage, {
        src: "/landing/cta-ball-cards.webp",
        alt: "Tarjetas",
        width: 1480,
        height: 1010,
        loading: "lazy",
      }),
    );
    expect(lazyHtml).toContain('data-loaded="false"');

    const src = readText(path.join(UI_ROOT, "components/ProgressiveImage.tsx"));
    expect(src).not.toContain("useEffect");
  });

  it("DashboardEntry, CommandPaletteModal, OddsCompareView, ParlayAndQuantViews, HomeClubView, HomeMatchDetailPanel y PicksFinderView cumplen optimizaciones 2B", () => {
    const dashboardSrc = readText(path.join(WEB_ROOT, "src/client/dashboard-entry.tsx"));
    expect(dashboardSrc).not.toContain("ENTRY_REVEAL_MS");
    expect(dashboardSrc).not.toContain("680");
    expect(dashboardSrc).not.toContain("inert={visible}");

    const cmdkSrc = readText(path.join(UI_ROOT, "components/CommandPaletteModal.tsx"));
    expect(cmdkSrc).toContain("CommandPaletteModalBody");
    expect(cmdkSrc).toContain("indexedGames");
    expect(cmdkSrc).toContain("indexedLeagues");
    expect(cmdkSrc).toContain("{cmdkOpen ? (");

    const oddsSrc = readText(path.join(UI_ROOT, "club/OddsCompareView.tsx"));
    expect(oddsSrc).toContain("activeLeagues30d");
    expect(oddsSrc).not.toContain("isLeagueActiveInWindow");

    const parlaysSrc = readText(path.join(UI_ROOT, "club/ParlayAndQuantViews.tsx"));
    expect(parlaysSrc).toContain("LazyOddsCompareClubView");
    expect(parlaysSrc).toContain('import("./OddsCompareView")');

    const homeClubSrc = readText(path.join(UI_ROOT, "club/home/HomeClubView.tsx"));
    expect(homeClubSrc).not.toContain("/api/me/preferences");
    expect(homeClubSrc).toContain("savedScreenerViews");

    const detailSrc = readText(path.join(UI_ROOT, "club/home/HomeMatchDetailPanel.tsx"));
    expect(detailSrc).toContain("LazyMomentumChart");
    expect(detailSrc).toContain("LazyAtomicShotmapPitch");
    expect(detailSrc).toContain("LazyAtomicLineupPitch");
    expect(detailSrc).toContain("LazyMatchPlayerPicksBoard");
    expect(detailSrc).toContain("LazyMatchLineupsPanel");
    expect(detailSrc).toContain("LazyMatchEnfrentamientosPanel");
    expect(detailSrc).toContain("LazyStandingsBracketsSection");
    expect(detailSrc).toContain("LazyMatchInjuriesPanel");

    const screenerSrc = readText(path.join(UI_ROOT, "club/PicksFinderView.tsx"));
    expect(screenerSrc).not.toContain("requestFullShell");
    expect(screenerSrc).toContain("useDebouncedValue(searchQuery, 180)");
    expect(screenerSrc).toContain("useDebouncedValue(minOddsStep, 180)");
    expect(screenerSrc).toContain("useDebouncedValue(maxOddsStep, 180)");
    expect(screenerSrc).toContain("singlePassEvaluation");
    expect(screenerSrc).toContain('pageSize: "24"');
  });

  it("picks-screener.css elimina transición content-visibility y aplica animación top-layer y overscroll-behavior-y", () => {
    const css = readText(path.join(WEB_ROOT, "app/picks-screener.css"));
    expect(css).not.toContain("block-size, content-visibility");
    expect(css).toContain(":where(:not([data-closing]))");
    expect(css).toContain(".pl-bb-dialog");
    expect(css).toContain(".pl-pick-lab-dialog");
    expect(css).toContain(".pl-pick-lab-backdrop");
    expect(css).toContain("overscroll-behavior-y: contain");
    expect(css).toContain("@starting-style");
    expect(css).not.toMatch(/backdrop-filter\s*:/i);
  });

  it("cta-ball-cards.webp y hero-light.webp están comprimidas <= 95 KB conservando dimensiones intrínsecas", () => {
    const cta = readWebpSize(path.join(WEB_ROOT, "public/landing/cta-ball-cards.webp"));
    const hero = readWebpSize(path.join(WEB_ROOT, "public/landing/hero-light.webp"));
    expect(cta.width).toBe(1480);
    expect(cta.height).toBe(1010);
    expect(cta.bytes).toBeLessThanOrEqual(95 * 1024);
    expect(hero.width).toBe(1536);
    expect(hero.height).toBe(1024);
    expect(hero.bytes).toBeLessThanOrEqual(95 * 1024);
  });
});
