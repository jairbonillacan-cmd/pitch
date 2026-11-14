import { describe, expect, it } from "vitest";
import type { LiveScoreboardEntry } from "@pitchlab/contracts";
import { createPollingStore } from "../src/platform/live/live-store";
import { buildLiveNotifications, type LiveAlertRow, type PlatformGame } from "../src/index";

/** Reloj y temporizadores falsos: permiten ver cuántas lecturas agenda el navegador. */
function harness(responses: { nextPollSeconds: number | null }[]) {
  let now = 0;
  let visible = true;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 1;
  const calls: string[] = [];
  let visibilityFn: (() => void) | null = null;
  const store = createPollingStore<{ nextPollSeconds: number | null }>("/api/live/scoreboard", {
    now: () => now,
    isVisible: () => visible,
    onVisibilityChange: (fn) => {
      visibilityFn = fn;
      return () => {
        visibilityFn = null;
      };
    },
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimer: (id) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    fetchImpl: (async (url: string) => {
      calls.push(url);
      const body = responses[Math.min(calls.length - 1, responses.length - 1)]!;
      return { ok: true, json: async () => body } as Response;
    }) as unknown as typeof fetch,
  });
  const flush = () => new Promise((r) => setTimeout(r, 0));
  /** Avanza el reloj y dispara lo vencido (sin contar los tiempos límite de 8 s ya resueltos). */
  const advance = async (ms: number) => {
    now += ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers.splice(timers.indexOf(due), 1);
      due.fn();
      await flush();
    }
  };
  return {
    store,
    calls,
    advance,
    flush,
    pending: () => timers.length,
    hide: () => {
      visible = false;
      visibilityFn?.();
    },
    show: () => {
      visible = true;
      visibilityFn?.();
    },
  };
}

describe("sondeo del navegador a nuestra API", () => {
  it("una sola lectura aunque haya varios suscriptores, y sigue la cadencia que dicta el servidor", async () => {
    const h = harness([{ nextPollSeconds: 15 }, { nextPollSeconds: 15 }, { nextPollSeconds: null }]);
    const off1 = h.store.subscribe(() => undefined);
    const off2 = h.store.subscribe(() => undefined);
    await h.flush();
    expect(h.calls).toHaveLength(1);
    await h.advance(15_000);
    expect(h.calls).toHaveLength(2);
    await h.advance(15_000);
    expect(h.calls).toHaveLength(3);
    // El servidor dijo `null` (partido terminado): no queda nada agendado.
    await h.advance(600_000);
    expect(h.calls).toHaveLength(3);
    expect(h.pending()).toBe(0);
    off1();
    off2();
  });

  it("se pausa con la pestaña oculta y al volver pregunta una sola vez", async () => {
    const h = harness([{ nextPollSeconds: 15 }]);
    const off = h.store.subscribe(() => undefined);
    await h.flush();
    h.hide();
    await h.advance(120_000);
    expect(h.calls).toHaveLength(1);
    h.show();
    await h.flush();
    expect(h.calls).toHaveLength(2);
    off();
  });

  it("al quedar sin suscriptores no deja temporizadores vivos", async () => {
    const h = harness([{ nextPollSeconds: 15 }]);
    const off = h.store.subscribe(() => undefined);
    await h.flush();
    off();
    expect(h.pending()).toBe(0);
    await h.advance(60_000);
    expect(h.calls).toHaveLength(1);
  });

  it("nunca pregunta más seguido que cada 10 s aunque el servidor pida menos", async () => {
    const h = harness([{ nextPollSeconds: 1 }]);
    const off = h.store.subscribe(() => undefined);
    await h.flush();
    await h.advance(9_000);
    expect(h.calls).toHaveLength(1);
    await h.advance(1_000);
    expect(h.calls).toHaveLength(2);
    off();
  });
});

const NOW = new Date("2026-11-14T23:40:00Z");
const GAME = {
  id: "mx-qro-mty",
  league: "liga-mx",
  leagueLabel: "Liga MX",
  sport: "football",
  kickoffUtc: "2026-11-14T23:00:00Z",
  home: { slug: "queretaro", name: "Querétaro", shortName: "Querétaro", code: "QRO", record: "" },
  away: { slug: "monterrey", name: "Rayados de Monterrey", shortName: "Monterrey", code: "MTY", record: "" },
} as unknown as PlatformGame;

const entry: LiveScoreboardEntry = {
  gameId: GAME.id,
  league: "liga-mx",
  phase: "live",
  clock: "34",
  minute: 34,
  score: { home: 0, away: 1 },
  htScore: null,
  redCards: null,
  kickoffUtc: "2026-11-14T23:00:00Z",
};

describe("avisos de «Siguiendo» en la campana", () => {
  const alerts: LiveAlertRow[] = [
    { id: "a1", gameId: GAME.id, kind: "kickoff", side: null, minute: 1, homeScore: 0, awayScore: 0, occurredAtIso: "2026-11-14T23:01:00Z" },
    { id: "a2", gameId: GAME.id, kind: "goal", side: "away", minute: 34, homeScore: 0, awayScore: 1, occurredAtIso: "2026-11-14T23:35:00Z" },
  ];

  it("con cuenta usa los avisos del servidor, con minuto y quién anotó", () => {
    const items = buildLiveNotifications({
      alerts,
      entries: [],
      games: [GAME],
      watchlistGameIds: [GAME.id],
      followAlerts: {},
      now: NOW,
    });
    expect(items.map((n) => n.title)).toEqual(["Gol de Monterrey · Querétaro 0–1 Monterrey", "Empezó Querétaro vs Monterrey"]);
    expect(items[0]).toMatchObject({ priority: "urgent", href: "/app/liga-mx/games/mx-qro-mty" });
    expect(items[0]!.context.text).toContain("Minuto 34");
  });

  it("respeta los avisos que el socio apagó", () => {
    const items = buildLiveNotifications({
      alerts,
      entries: [],
      games: [GAME],
      watchlistGameIds: [GAME.id],
      followAlerts: { [GAME.id]: { kickoff: true, goals: false, final: true } },
      now: NOW,
    });
    expect(items.map((n) => n.title)).toEqual(["Empezó Querétaro vs Monterrey"]);
  });

  it("solo avisa de partidos seguidos", () => {
    expect(
      buildLiveNotifications({ alerts, entries: [entry], games: [GAME], watchlistGameIds: [], followAlerts: {}, now: NOW }),
    ).toEqual([]);
  });

  it("con PIN los deriva del marcador con el mismo id que el servidor", () => {
    const local = buildLiveNotifications({
      alerts: null,
      entries: [entry],
      games: [GAME],
      watchlistGameIds: [GAME.id],
      followAlerts: {},
      now: NOW,
    });
    const server = buildLiveNotifications({
      alerts,
      entries: [],
      games: [GAME],
      watchlistGameIds: [GAME.id],
      followAlerts: {},
      now: NOW,
    });
    expect(local.map((n) => n.id).sort()).toEqual(server.map((n) => n.id).sort());
  });
});
