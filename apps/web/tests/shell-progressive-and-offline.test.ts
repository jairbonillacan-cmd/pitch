import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "../app/manifest";
import OfflinePage from "../app/offline/page";
import { resetScrapingVelocityForTests } from "../src/server/api-guards";
import {
  buildServerRawPlatformDataset,
  loadExtendedShellPayload,
  splitInitialShellDataset,
  upcomingPlusRecentFinished,
  withoutGameDetail,
} from "../src/server/platform-data";
import { resetRateLimitsForTests } from "../src/server/request-security";

const viewerAccessMock = vi.fn();

vi.mock("../src/server/viewer-access", () => ({
  getViewerAccess: () => viewerAccessMock(),
}));

describe("ADR-053 · Shell RSC progresivo, Cero-Fuga en /api/shell/extend y PWA /offline", () => {
  afterEach(() => {
    viewerAccessMock.mockReset();
    resetRateLimitsForTests();
    resetScrapingVelocityForTests();
  });

  it("recorta el tramo 1 del shell por debajo de 500 KB preservando LIVE/hoy y omitiendo parlayCandidates", () => {
    const raw = buildServerRawPlatformDataset();
    const fullSlim = withoutGameDetail(upcomingPlusRecentFinished(raw));
    const stage1 = splitInitialShellDataset(fullSlim);

    const fullBytes = Buffer.byteLength(JSON.stringify(fullSlim), "utf8");
    const stage1Bytes = Buffer.byteLength(JSON.stringify(stage1), "utf8");

    expect(stage1Bytes).toBeLessThan(500 * 1024);
    expect(stage1Bytes).toBeLessThan(fullBytes);
    expect(stage1.games.length).toBeGreaterThan(0);
    expect(stage1.games.length).toBeLessThanOrEqual(52);
    expect(stage1.games.every((g) => g.parlayCandidates === undefined)).toBe(true);

    const liveIds = fullSlim.games.filter((g) => g.status === "LIVE").map((g) => g.id);
    const stage1Ids = new Set(stage1.games.map((g) => g.id));
    for (const id of liveIds) {
      expect(stage1Ids.has(id)).toBe(true);
    }
  });

  it("GET /api/shell/extend exige sesión (401) y aplica Cero-Fuga estricta entre visitante y socio", async () => {
    const { GET } = await import("../app/api/shell/extend/route");

    viewerAccessMock.mockResolvedValueOnce({
      via: "none",
      signupComplete: false,
      fullAccess: false,
      isAdmin: false,
      isTipster: false,
      profile: null,
    });
    const unauth = await GET(new Request("http://localhost:9990/api/shell/extend"));
    expect(unauth.status).toBe(401);
    expect(unauth.headers.get("Cache-Control")).toBe("private, no-store");

    viewerAccessMock.mockResolvedValueOnce({
      via: "account",
      signupComplete: true,
      fullAccess: false,
      isAdmin: false,
      isTipster: false,
      profile: null,
    });
    const visitorRes = await GET(new Request("http://localhost:9990/api/shell/extend"));
    expect(visitorRes.status).toBe(200);
    expect(visitorRes.headers.get("Cache-Control")).toBe("private, no-store");
    const visitorBody = (await visitorRes.json()) as {
      games: Array<{ status: string; picks: Array<{ label: string; rationale: string }> }>;
      teams: unknown[];
    };
    expect(Array.isArray(visitorBody.games)).toBe(true);
    expect(Array.isArray(visitorBody.teams)).toBe(true);

    const memberPayload = loadExtendedShellPayload(true);
    const visitorPayload = loadExtendedShellPayload(false);
    expect(memberPayload.games.length).toBeGreaterThan(0);
    expect(visitorPayload.games.length).toBe(memberPayload.games.length);

    const sampleMember = memberPayload.games.find((g) => g.status === "NS" && g.picks.length > 1);
    if (sampleMember) {
      const sampleVisitor = visitorPayload.games.find((g) => g.id === sampleMember.id);
      expect(sampleVisitor).toBeDefined();
      const memberPick = sampleMember.picks.find((p) => p.slotIndex > 0);
      const lockedPick = sampleVisitor?.picks.find((p) => p.slotIndex > 0);
      if (lockedPick) {
        expect(lockedPick.label).toContain("Pase PitchLab Ultra");
        if (memberPick) {
          expect(lockedPick.label).not.toBe(memberPick.label);
        }
      }
    }
  });

  it("manifest, página /offline y sw.js cumplen PWA real sin cachear /app HTML ni romper localhost", () => {
    const mf = manifest();
    expect(mf.name).toBe("PitchLab");
    expect((mf as { display_override?: string[] }).display_override).toEqual(["standalone", "minimal-ui"]);

    const html = renderToStaticMarkup(React.createElement(OfflinePage));
    expect(html).toContain("No tienes conexión a internet");
    expect(html).toContain("Reintentar");
    expect(html).toContain("/app");

    const swPath = path.resolve(process.cwd(), "public/sw.js");
    const swSource = fs.readFileSync(swPath, "utf8");
    expect(swSource).toContain("isLocalDevHost");
    expect(swSource).toContain("127.0.0.1");
    expect(swSource).toContain("localhost");
    expect(swSource).toContain('"/offline"');
    expect(swSource).toContain("SKIP_WAITING");
    expect(swSource).not.toContain('cache.put("/app"');
  });
});
