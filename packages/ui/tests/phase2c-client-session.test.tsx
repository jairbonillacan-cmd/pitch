import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { asLeagueId } from "@pitchlab/contracts";
import { BitacoraClubView } from "../src/platform/club/BitacoraClubView";
import {
  ClubResponsiblePlayView,
  resolveStoredPauseUntilIso,
} from "../src/platform/club/ClubResponsiblePlayView";
import { PrefsTab } from "../src/platform/club/account/PrefsTab";
import { CanjearCouponView } from "../src/platform/components/CanjearCouponView";
import {
  clearClientJsonCache,
  getClientJsonCacheScope,
  prefetchClientJson,
  readClientJsonCache,
  setClientJsonCacheScope,
  writeClientJsonCache,
} from "../src/platform/hooks/useClientJsonCache";
import { matchDevicePushSubscription } from "../src/platform/hooks/usePwaInstallAndPush";
import { buildPlatformDataset } from "../src/platform/match-picks-engine";
import {
  PlatformGamesSupplement,
  PlatformProvider,
  clearClientSessionArtifacts,
} from "../src/platform/platform-provider";
import { mergeSupplementalDataset } from "../src/platform/platform-storage";

const EMPTY_DATASET = buildPlatformDataset([
  {
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    season: "2026",
    roundLabel: "",
    generatedAt: "2026-11-15T12:00:00Z",
    games: [],
    standings: [],
  },
]);

function createMemoryStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

function createWindowMock(
  localStorage: Storage,
  sessionStorage: Storage,
): EventTarget & {
  localStorage: Storage;
  sessionStorage: Storage;
} {
  const target = new EventTarget();
  return Object.assign(target, {
    localStorage,
    sessionStorage,
  });
}

const REPO_ROOT = path.resolve(__dirname, "../../..");

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearClientJsonCache();
  setClientJsonCacheScope("visitor");
});

describe("Phase 2C · Client session isolation, PWA push & 6a5a5af8 fixes", () => {
  it("clearClientSessionArtifacts purges all private storage & JSON cache while preserving pl-theme", () => {
    const ls = createMemoryStorage({
      "pl-journal-v1": '[{"id":"j1"}]',
      "pl-watchlist-v1": '["g1"]',
      "pl-follow-alerts-v1": '["u1"]',
      "pl-own-posts-v1": '[{"id":"p1"}]',
      "pl-prefs-v1": '{"oddsFormat":"decimal"}',
      "pl-screener-views-v1": "[]",
      "pl-responsible-play-v1": '{"pauseChoice":"7d"}',
      "pitchlab.signup.details": '{"handle":"jair"}',
      "pl-theme": "dark",
      "pl-theme-updated-at": "2026-11-27T10:00:00Z",
      "unrelated-external-key": "keep",
    });
    const ss = createMemoryStorage({
      "pl-spei-preview-v1": '{"sku":"mensual"}',
      "pl-route-scroll-v1": '{"/app":240}',
      "pl-picks-page-cursor": "3",
      "pitchlab.nav.last": "/app",
      "unrelated-session-key": "keep-ss",
    });

    vi.stubGlobal("window", createWindowMock(ls, ss));
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("sessionStorage", ss);

    setClientJsonCacheScope("member:acc-1");
    writeClientJsonCache("/api/me/preferences", { ok: true }, { viewerScope: "member:acc-1" });
    expect(readClientJsonCache("/api/me/preferences", Date.now(), "member:acc-1")?.data).toEqual({
      ok: true,
    });

    clearClientSessionArtifacts();

    expect(ls.getItem("pl-journal-v1")).toBeNull();
    expect(ls.getItem("pl-watchlist-v1")).toBeNull();
    expect(ls.getItem("pl-follow-alerts-v1")).toBeNull();
    expect(ls.getItem("pl-own-posts-v1")).toBeNull();
    expect(ls.getItem("pl-prefs-v1")).toBeNull();
    expect(ls.getItem("pl-screener-views-v1")).toBeNull();
    expect(ls.getItem("pl-responsible-play-v1")).toBeNull();
    expect(ls.getItem("pitchlab.signup.details")).toBeNull();

    expect(ls.getItem("pl-theme")).toBe("dark");
    expect(ls.getItem("pl-theme-updated-at")).toBe("2026-11-27T10:00:00Z");
    expect(ls.getItem("unrelated-external-key")).toBe("keep");

    expect(ss.getItem("pl-spei-preview-v1")).toBeNull();
    expect(ss.getItem("pl-route-scroll-v1")).toBeNull();
    expect(ss.getItem("pl-picks-page-cursor")).toBeNull();
    expect(ss.getItem("pitchlab.nav.last")).toBeNull();
    expect(ss.getItem("unrelated-session-key")).toBe("keep-ss");

    expect(readClientJsonCache("/api/me/preferences", Date.now(), "member:acc-1")).toBeNull();
  });

  it("useClientJsonCache isolates cache entries per viewerScope and emits pitchlab:plan-updated on 403 pase_requerido", async () => {
    const ls = createMemoryStorage();
    const ss = createMemoryStorage();
    const win = createWindowMock(ls, ss);
    vi.stubGlobal("window", win);

    const receivedEvents: string[] = [];
    win.addEventListener("pitchlab:plan-updated", (evt) => {
      receivedEvents.push(evt.type);
    });

    setClientJsonCacheScope("member:user-a");
    expect(getClientJsonCacheScope()).toBe("member:user-a");
    writeClientJsonCache("/api/picks/screener", { items: ["pick-a"] }, { viewerScope: "member:user-a" });

    setClientJsonCacheScope("member:user-b");
    expect(getClientJsonCacheScope()).toBe("member:user-b");
    expect(readClientJsonCache("/api/picks/screener", Date.now(), "member:user-b")).toBeNull();
    writeClientJsonCache("/api/picks/screener", { items: ["pick-b"] }, { viewerScope: "member:user-b" });

    expect(
      readClientJsonCache<{ items: string[] }>("/api/picks/screener", Date.now(), "member:user-a")?.data.items,
    ).toEqual(["pick-a"]);
    expect(
      readClientJsonCache<{ items: string[] }>("/api/picks/screener", Date.now(), "member:user-b")?.data.items,
    ).toEqual(["pick-b"]);

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: "pase_requerido" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await prefetchClientJson("/api/picks/screener", {
      force: true,
      viewerScope: "member:user-b",
    });

    expect(res).toBeNull();
    expect(receivedEvents).toEqual(["pitchlab:plan-updated"]);
    expect(readClientJsonCache("/api/picks/screener", Date.now(), "member:user-b")).toBeNull();
  });

  it("matchDevicePushSubscription verifies current device endpoint against server subscriptions", () => {
    const subs = [
      {
        endpoint: "https://push.example/device-other",
        topicPicks: true,
        topicLive: false,
        topicSocial: true,
      },
      {
        endpoint: "https://push.example/device-this",
        topicPicks: false,
        topicLive: true,
        topicSocial: false,
      },
    ];

    expect(matchDevicePushSubscription(subs, "https://push.example/device-this")).toEqual(subs[1]);
    expect(matchDevicePushSubscription(subs, "https://push.example/unregistered")).toBeNull();
    expect(matchDevicePushSubscription(subs, null)).toBeNull();
    expect(matchDevicePushSubscription([], "https://push.example/device-this")).toBeNull();
  });

  it("resolveStoredPauseUntilIso avoids double-adding PAUSE_DURATIONS_MS and clears expired pauses", () => {
    const nowMs = Date.parse("2026-11-27T12:00:00.000Z");
    const activeUntilIso = "2026-12-04T12:00:00.000Z";
    const expiredUntilIso = "2026-11-20T12:00:00.000Z";

    expect(resolveStoredPauseUntilIso("7d", activeUntilIso, nowMs)).toBe(activeUntilIso);
    expect(resolveStoredPauseUntilIso("7d", expiredUntilIso, nowMs)).toBeNull();
    expect(resolveStoredPauseUntilIso(null, activeUntilIso, nowMs)).toBeNull();
    expect(resolveStoredPauseUntilIso("24h", "not-a-date", nowMs)).toBeNull();
  });

  it("renders Responsible Play, Bitacora, CanjearCoupon, and PrefsTab under PlatformProvider without network duplication", () => {
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={EMPTY_DATASET} initialRole="member" accountsEnabled={true}>
        <PlatformGamesSupplement games={[]}>
          <ClubResponsiblePlayView disableNetwork />
          <BitacoraClubView />
          <CanjearCouponView mode="club" />
          <PrefsTab
            identity={{
              cleanHandle: "tester",
              atHandle: "@tester",
              initials: "TS",
              displayName: "Tester",
              isTipster: false,
              avatarGrad: "linear-gradient(135deg, var(--pl-accent), var(--pl-accent-strong))",
              avatarUrl: null,
            }}
          />
        </PlatformGamesSupplement>
      </PlatformProvider>,
    );

    expect(html).toContain("Juego responsable");
    expect(html).toContain("Rendimiento / ROI");
    expect(html).toContain("Canjea un cupón de acceso");
    expect(html).toContain("Zona horaria para toda la app");
  });

  it("enforces Phase 2C structural guarantees across provider, views, styles, and club-shell-bridge", () => {
    const providerSrc = readRepoFile("packages/ui/src/platform/platform-provider.tsx");
    const responsiblePlaySrc = readRepoFile("packages/ui/src/platform/club/ClubResponsiblePlayView.tsx");
    const bitacoraSrc = readRepoFile("packages/ui/src/platform/club/BitacoraClubView.tsx");
    const prefsSrc = readRepoFile("packages/ui/src/platform/club/account/PrefsTab.tsx");
    const accountCss = readRepoFile("apps/web/app/account-v2.css");
    const canjearSrc = readRepoFile("packages/ui/src/platform/components/CanjearCouponView.tsx");
    const shellBridgeSrc = readRepoFile("apps/web/src/client/club-shell-bridge.tsx");

    expect(providerSrc).toContain("inFlightSealIdsRef");
    expect(providerSrc).toContain('res.reason === "ya_sellado"');
    expect(providerSrc).toContain("likeQueueRef");
    expect(providerSrc).toContain("helpfulQueueRef");
    expect(providerSrc).toContain("document.body.appendChild(a)");
    expect(providerSrc).toContain("URL.revokeObjectURL(url)");
    expect(providerSrc).toContain("Promise.all([");
    expect(providerSrc).toContain("requestIdleCallback");
    expect(providerSrc).toContain("DELETE");
    expect(providerSrc).toContain("/api/me/push");
    expect(providerSrc).toContain('window.location.assign("/")');
    expect(providerSrc).not.toContain('window.localStorage.removeItem("pl-theme")');

    expect(responsiblePlaySrc).toContain("serverPreferences");
    expect(bitacoraSrc).toContain("serverPreferences");

    expect(prefsSrc).toContain("prefsModalBodyRef");
    expect(prefsSrc).toContain("scrollContainerRef={prefsModalBodyRef}");
    expect(prefsSrc).toContain("exportBusyRef");
    expect(prefsSrc).toContain("deleteBusyRef");

    expect(accountCss).toContain(".pl-prefs-modal-body");
    expect(accountCss).toContain("-webkit-overflow-scrolling: touch");
    expect(accountCss).toContain("touch-action: pan-y");

    expect(canjearSrc).toContain("submitBusyRef");
    expect(canjearSrc).toContain("if (busy || submitBusyRef.current) return");
    expect(canjearSrc).toContain("checkingPreviewRef");

    expect(shellBridgeSrc).toContain("pitchlab:plan-updated");
    expect(shellBridgeSrc).toContain("router.refresh()");
    expect(shellBridgeSrc).toContain("popstate");
    expect(shellBridgeSrc).toContain("window.scrollTo");

    expect(providerSrc).not.toContain("if (alreadyMergedInRoot)");
  });

  it("mergeSupplementalDataset preserva y fusiona home.form/away.form sin descartar rachas", () => {
    const baseSample = buildPlatformDataset([
      {
        league: asLeagueId("liga-mx"),
        leagueLabel: "Liga MX",
        sport: "football",
        season: "2026",
        roundLabel: "Jornada 1",
        generatedAt: "2026-11-27T12:00:00Z",
        games: [
          {
            id: "lmx-form-1",
            league: asLeagueId("liga-mx"),
            leagueLabel: "Liga MX",
            sport: "football",
            round: "J1",
            day: "2026-11-27",
            dayLabel: "Hoy",
            kickoffUtc: "2026-11-27T20:00:00Z",
            kickoffLocal: "14:00",
            venue: "Azteca",
            status: "NS",
            home: {
              slug: "america",
              name: "América",
              shortName: "América",
              code: "AME",
              record: "5G-1E-1P",
            },
            away: {
              slug: "chivas",
              name: "Chivas",
              shortName: "Chivas",
              code: "CHV",
              record: "4G-2E-1P",
            },
            x12: [0.5, 0.25, 0.25],
            projection: { home: 1.7, away: 1.1, total: 2.8 },
            outcomes: [],
            marketGroups: [],
            factors: [],
            trace: [],
            picks: [],
          },
        ],
        standings: [],
      },
    ]);

    const baseGame = baseSample.games[0]!;
    const baseNoForm = {
      ...baseSample,
      games: [
        {
          ...baseGame,
          home: { ...baseGame.home, form: undefined },
          away: { ...baseGame.away, form: undefined },
        },
      ],
    };
    const incomingWithForm = {
      ...baseGame,
      home: { ...baseGame.home, form: ["W", "W", "D", "W", "W"] },
      away: { ...baseGame.away, form: ["L", "W", "D", "L", "W"] },
    };

    const merged = mergeSupplementalDataset(baseNoForm, [incomingWithForm], false, "");
    expect(merged.games[0]?.home.form).toEqual(["W", "W", "D", "W", "W"]);
    expect(merged.games[0]?.away.form).toEqual(["L", "W", "D", "L", "W"]);
  });
});
