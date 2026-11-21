import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LiveAveragePositionSchema,
  LiveShotSchema,
  LiveShotmapSummarySchema,
  type LiveAveragePosition,
  type LiveScoreboardEntry,
  type LiveShot,
} from "@pitchlab/contracts";
import {
  clockFrom,
  detectMoments,
  extractBzzoiroMatchTelemetry,
  linkLiveEvents,
  list,
  nextPollSeconds,
  normalizedAvgPositionsToLive,
  normalizedShotToLiveShot,
  parseBzzoiroAveragePositions,
  parseIncidents,
  parseLiveStats,
  phaseFrom,
  toScoreboardEntry,
  type BzLiveEvent,
  type BzLiveIncident,
  type BzLiveStats,
  type NormalizedShot,
} from "../src/providers/bzzoiro-live.js";

// Respuestas reales de Bzzoiro del 2026-11-14, recortadas (sin cadenas de pases ni posiciones).
const FIX = join(import.meta.dirname, "fixtures", "bzzoiro-live");
const read = <T,>(name: string): T => JSON.parse(readFileSync(join(FIX, name), "utf8")) as T;

const QRO_MTY = "mx-2026-j16-queretaro-monterrey-401876988";
const candidates = [
  {
    gameId: QRO_MTY,
    league: "liga-mx",
    kickoffUtc: "2026-11-14T23:00Z",
    homeName: "Querétaro",
    awayName: "Rayados de Monterrey",
  },
  {
    gameId: "mx-2026-j17-puebla-atletico-san-luis-401877054",
    league: "liga-mx",
    kickoffUtc: "2026-11-21T01:00Z",
    homeName: "Club Puebla",
    awayName: "Atlético de San Luis",
  },
];

describe("fase y reloj", () => {
  it("entiende los estados reales de v2 y los nombres de origen", () => {
    expect(phaseFrom("notstarted", "")).toBe("scheduled");
    expect(phaseFrom("inprogress", "1st_half")).toBe("live");
    expect(phaseFrom("inprogress", "halftime")).toBe("halftime");
    expect(phaseFrom("inprogress", "2nd_half")).toBe("live");
    expect(phaseFrom("finished", null)).toBe("final");
    expect(phaseFrom("postponed", null)).toBe("postponed");
    expect(phaseFrom("unresolved", null)).toBe("unknown");
    expect(phaseFrom("live", "penalties")).toBe("penalties");
  });

  it("arma el minuto visible", () => {
    expect(clockFrom(67, null, "live")).toBe("67");
    expect(clockFrom(45, 2, "live")).toBe("45+2");
    expect(clockFrom(45, null, "halftime")).toBe("MT");
    expect(clockFrom(null, null, "scheduled")).toBeNull();
  });
});

describe("marcador en vivo", () => {
  const live = list(read<{ events: BzLiveEvent[] }>("live.json"));

  it("lee la lista de `/events/live/` (llave `events`)", () => {
    expect(live).toHaveLength(3);
  });

  it("empareja con NUESTRO id por liga, hora e nombres, aunque el proveedor escriba distinto", () => {
    const links = linkLiveEvents(live, candidates);
    expect(links).toEqual([{ gameId: QRO_MTY, providerEventId: "602407", method: "kickoff+teams" }]);
  });

  it("no empareja si la hora no cuadra", () => {
    const moved = candidates.map((c) => ({ ...c, kickoffUtc: "2026-11-16T23:00Z" }));
    expect(linkLiveEvents(live, moved)).toEqual([]);
  });

  it("convierte el evento a la fila del contrato sin exponer el id del proveedor", () => {
    const qro = live.find((e) => e.id === 602407)!;
    const entry = toScoreboardEntry(qro, QRO_MTY, "liga-mx", "2026-11-14T23:00Z");
    expect(entry).toMatchObject({
      gameId: QRO_MTY,
      phase: "live",
      clock: "34",
      minute: 34,
      score: { home: 0, away: 1 },
    });
    expect(JSON.stringify(entry)).not.toContain("602407");
  });

  it("suma el tiempo extra al marcador", () => {
    const e: BzLiveEvent = {
      id: 1,
      status: "inprogress",
      period: "extratime",
      current_minute: 105,
      home_score: 1,
      away_score: 1,
      extra_time_score: { home: 1, away: 0 },
    };
    expect(toScoreboardEntry(e, "g", "liga-mx", "2026-11-14T23:00Z").score).toEqual({ home: 2, away: 1 });
  });
});

describe("incidentes", () => {
  const incidents = parseIncidents(read<{ incidents: BzLiveIncident[] }>("incidents.json"));

  it("ordena por minuto y respeta el tiempo agregado del primer tiempo", () => {
    const minutes = incidents.map((i) => i.minute ?? 0);
    expect([...minutes].sort((a, b) => a - b)).toEqual(minutes);
    const ht = incidents.findIndex((i) => i.kind === "period" && i.note === "Medio tiempo");
    const card45 = incidents.findIndex((i) => i.kind === "yellow" && i.minute === 45);
    expect(card45).toBeLessThan(ht);
    expect(incidents[card45]!.addedTime).toBe(7);
  });

  it("lee goles con asistencia y marcador, cambios, segunda amarilla y VAR", () => {
    const goal = incidents.find((i) => i.kind === "goal" && i.minute === 84)!;
    expect(goal).toMatchObject({ side: "home", player: "S. Rodríguez", secondary: "A. Manyoma", score: { home: 2, away: 2 } });
    const sub = incidents.find((i) => i.kind === "sub" && i.minute === 85)!;
    expect(sub).toMatchObject({ player: "K. Suárez", secondary: "A. Manyoma", side: "home" });
    expect(incidents.some((i) => i.kind === "second_yellow" && i.player === "J. Mera")).toBe(true);
    expect(incidents.find((i) => i.kind === "var" && i.minute === 57)?.note).toBe("VAR: penal concedido");
  });

  it("ignora el marcador del periodo en curso y el aviso de tiempo agregado", () => {
    expect(incidents.some((i) => i.kind === "period" && i.minute === 90)).toBe(false);
    expect(incidents.filter((i) => i.kind === "period")).toHaveLength(1);
  });
});

describe("estadísticas, xG y momentum", () => {
  const parsed = parseLiveStats(read<BzLiveStats>("stats.json"));

  it("lee tiros, xG medido, córners y posesión", () => {
    expect(parsed.stats?.home).toMatchObject({ xg: 1.81, shots: 20, shotsOnTarget: 6, corners: 4, possessionPct: 61 });
    expect(parsed.xgEstimated).toBe(false);
  });

  it("deja la curva de momentum ordenada y acotada a ±100", () => {
    expect(parsed.momentum.length).toBeGreaterThan(80);
    expect(parsed.momentum.every((p) => p.value >= -100 && p.value <= 100)).toBe(true);
    const ms = parsed.momentum.map((p) => p.minute);
    expect([...ms].sort((a, b) => a - b)).toEqual(ms);
  });

  it("acumula el xG por minuto", () => {
    const last = parsed.xgTimeline.at(-1)!;
    expect(last).toEqual({ minute: 84, home: 1.815, away: 0.348 });
  });

  it("responde vacío sin estadísticas", () => {
    expect(parseLiveStats(null)).toEqual({ stats: null, xgEstimated: null, momentum: [], xgTimeline: [], shots: [] });
  });
});

describe("momentos del partido (avisos)", () => {
  const base: LiveScoreboardEntry = {
    gameId: QRO_MTY,
    league: "liga-mx",
    phase: "scheduled",
    clock: null,
    minute: null,
    score: null,
    htScore: null,
    redCards: null,
    kickoffUtc: "2026-11-14T23:00Z",
  };

  it("detecta inicio y goles, uno por tanto", () => {
    const next = { ...base, phase: "live" as const, minute: 20, clock: "20", score: { home: 2, away: 0 } };
    const moments = detectMoments(base, next);
    expect(moments.map((m) => `${m.kind}:${m.homeScore}-${m.awayScore}`)).toEqual([
      "kickoff:0-0",
      "goal:1-0",
      "goal:2-0",
    ]);
  });

  it("detecta medio tiempo y final sin repetir goles", () => {
    const live = { ...base, phase: "live" as const, minute: 44, score: { home: 1, away: 0 } };
    expect(detectMoments(live, { ...live, phase: "halftime" }).map((m) => m.kind)).toEqual(["halftime"]);
    expect(detectMoments(live, { ...live, phase: "final", score: { home: 1, away: 1 } }).map((m) => m.kind)).toEqual([
      "goal",
      "final",
    ]);
  });

  it("si lo primero que ve es un partido terminado, solo avisa el final", () => {
    const fin = { ...base, phase: "final" as const, score: { home: 3, away: 1 } };
    expect(detectMoments(undefined, fin).map((m) => m.kind)).toEqual(["final"]);
  });
});

describe("cadencia del navegador", () => {
  const now = Date.parse("2026-11-14T22:30:00Z");
  const entry = (phase: LiveScoreboardEntry["phase"], kickoffUtc = "2026-11-14T23:00:00Z"): LiveScoreboardEntry => ({
    gameId: "g",
    league: "liga-mx",
    phase,
    clock: null,
    minute: null,
    score: null,
    htScore: null,
    redCards: null,
    kickoffUtc,
  });

  it("pregunta cada 15 s con partidos en juego", () => {
    expect(nextPollSeconds([entry("final"), entry("live")], now)).toBe(15);
  });

  it("espacia las preguntas antes del inicio y en el medio tiempo", () => {
    expect(nextPollSeconds([entry("scheduled", "2026-11-14T22:40:00Z")], now)).toBe(30);
    expect(nextPollSeconds([entry("scheduled")], now)).toBe(300);
    expect(nextPollSeconds([entry("halftime")], now)).toBe(60);
  });

  it("no deja intervalos activos cuando todo terminó o nada empieza pronto", () => {
    expect(nextPollSeconds([entry("final"), entry("final")], now)).toBeNull();
    expect(nextPollSeconds([entry("scheduled", "2026-11-21T01:00:00Z")], now)).toBeNull();
    expect(nextPollSeconds([], now)).toBeNull();
  });
});

describe("mappers Bzzoiro a contrato en vivo (shotmap, posiciones medias y FD-16)", () => {
  it("normalizedShotToLiveShot mapea saved/blocked a save/block, conserva player/addedTime/bodyPart y limpia URLs", () => {
    const samples: readonly NormalizedShot[] = [
      {
        x: 88,
        y: 49,
        minute: 24,
        addedTime: 2,
        xg: 0.312,
        outcome: "saved",
        side: "home",
        playerName: "Henry Martín https://sports.bzzoiro.com/img/player/88776655/",
        bodyPart: "right_foot",
      },
      {
        x: 78,
        y: 54,
        minute: 41,
        xg: 0.145,
        outcome: "blocked",
        side: "away",
        playerName: "Sergio Canales",
        bodyPart: "head",
      },
      {
        x: 92,
        y: 50,
        minute: 67,
        xg: 0.44,
        outcome: "goal",
        side: "home",
        playerName: "Álvaro Fidalgo",
        bodyPart: "left_foot",
      },
      {
        x: 81,
        y: 35,
        minute: 72,
        xg: 0.08,
        outcome: "miss",
        side: "away",
        playerName: "Germán Berterame",
      },
      {
        x: 89,
        y: 52,
        minute: 85,
        xg: 0.21,
        outcome: "post",
        side: "home",
        playerName: "Alejandro Zendejas",
        bodyPart: "other",
      },
    ];

    const mapped: LiveShot[] = samples.map(normalizedShotToLiveShot);
    expect(mapped[0]).toEqual({
      minute: 24,
      addedTime: 2,
      side: "home",
      outcome: "save",
      xg: 0.312,
      x: 88,
      y: 49,
      player: "Henry Martín",
      bodyPart: "right_foot",
    });
    expect(mapped[1]).toEqual({
      minute: 41,
      side: "away",
      outcome: "block",
      xg: 0.145,
      x: 78,
      y: 54,
      player: "Sergio Canales",
      bodyPart: "head",
    });
    expect(mapped.map((s) => s.outcome)).toEqual(["save", "block", "goal", "miss", "post"]);
    for (const shot of mapped) {
      expect(() => LiveShotSchema.parse(shot)).not.toThrow();
    }
  });

  it("normalizedAvgPositionsToLive aplana home/away con side, name, number, position, touches y rating", () => {
    const rawStats: BzLiveStats = {
      event_id: 987654321,
      average_positions: {
        home: [
          {
            id: 88776656,
            player_id: 88776656,
            external_id: "ext-987654321",
            player: {
              id: 88776656,
              name: "Álvaro Fidalgo https://sports.bzzoiro.com/img/player/88776656/",
              shirt_number: 8,
            },
            average_x: 56.4,
            average_y: 41.2,
            touches: 78,
            photo_url: "https://sports.bzzoiro.com/img/player/88776656/",
          },
        ],
        away: [],
      },
    };
    const playerStats = {
      home: [
        {
          player_id: 88776656,
          player: { id: 88776656, name: "Álvaro Fidalgo" },
          position: "CM",
          rating: 8.35,
          touches: 78,
        },
      ],
      away: [
        {
          player_id: 77665544,
          player: {
            id: 77665544,
            name: "Sergio Canales www.bzzoiro.com/p/77665544",
            jersey_number: 10,
          },
          position: "AM",
          avg_x: 64.5,
          avg_y: 53.1,
          touches: 69,
          rating: 7.9,
          image_url: "https://a.espncdn.com/headshots/77665544.png",
        },
      ],
    };

    const grouped = parseBzzoiroAveragePositions(rawStats, playerStats);
    const flat: LiveAveragePosition[] = normalizedAvgPositionsToLive(grouped);
    expect(flat).toEqual([
      {
        side: "home",
        name: "Álvaro Fidalgo",
        number: 8,
        position: "CM",
        x: 56.4,
        y: 41.2,
        touches: 78,
        rating: 8.35,
      },
      {
        side: "away",
        name: "Sergio Canales",
        number: 10,
        position: "AM",
        x: 64.5,
        y: 53.1,
        touches: 69,
        rating: 7.9,
      },
    ]);
    for (const pos of flat) {
      expect(() => LiveAveragePositionSchema.parse(pos)).not.toThrow();
    }
    expect(normalizedAvgPositionsToLive({ home: [], away: [] })).toEqual([]);
  });

  it("extractBzzoiroMatchTelemetry + mappers producen shotmap, xG y posiciones medias libres de fugas FD-16", () => {
    const poisonedStats: BzLiveStats = {
      event_id: 987654321,
      shotmap: [
        {
          min: 24,
          added_time: 2,
          home: true,
          type: "save",
          xg: 0.312,
          pos: { x: 0.88, y: 0.49 },
          player_id: 88776655,
          body_part: "right_foot",
        },
        {
          minute: 41,
          is_home: false,
          outcome: "block",
          expected_goals: 0.145,
          coordinates: { x: 0.78, y: 0.54 },
          player: {
            id: 77665544,
            name: "Sergio Canales https://sports.bzzoiro.com/img/player/77665544/",
          },
          bodyPart: "head",
        },
      ],
      average_positions: {
        home: [
          {
            id: 88776656,
            player_id: 88776656,
            external_id: "ext-987654321",
            player: { id: 88776656, name: "Álvaro Fidalgo", shirt_number: 8 },
            average_x: 56.4,
            average_y: 41.2,
            touches: 78,
            photo_url: "https://sports.bzzoiro.com/img/player/88776656/",
          },
        ],
        away: [],
      },
    };
    const poisonedPlayerStats = {
      home: [
        {
          player_id: 88776655,
          player: { id: 88776655, name: "Henry Martín" },
          position: "ST",
          rating: 8.1,
          photo_url: "https://a.espncdn.com/headshots/88776655.png",
        },
        {
          player_id: 88776656,
          player: { id: 88776656, name: "Álvaro Fidalgo" },
          position: "CM",
          rating: 8.35,
          touches: 78,
        },
      ],
      away: [
        {
          player_id: 77665544,
          player: { id: 77665544, name: "Sergio Canales", jersey_number: 10 },
          position: "AM",
          avg_x: 64.5,
          avg_y: 53.1,
          touches: 69,
          rating: 7.9,
          image_url: "https://sports.bzzoiro.com/img/player/77665544/",
        },
      ],
    };

    const telemetry = extractBzzoiroMatchTelemetry(poisonedStats, poisonedPlayerStats);
    const shots = telemetry.shotmap.shots.map(normalizedShotToLiveShot);
    const averagePositions = normalizedAvgPositionsToLive(telemetry.averagePositions);
    const shotmapSummary = LiveShotmapSummarySchema.parse({
      xgHome: telemetry.shotmap.xgHome,
      xgAway: telemetry.shotmap.xgAway,
      shotsHome: telemetry.shotmap.shotsHome,
      shotsAway: telemetry.shotmap.shotsAway,
    });

    expect(shots).toHaveLength(2);
    expect(shots[0]).toMatchObject({
      minute: 24,
      addedTime: 2,
      side: "home",
      outcome: "save",
      player: "Henry Martín",
      bodyPart: "right_foot",
      x: 88,
      y: 49,
    });
    expect(shots[1]).toMatchObject({
      minute: 41,
      side: "away",
      outcome: "block",
      player: "Sergio Canales",
      bodyPart: "head",
      x: 78,
      y: 54,
    });
    expect(shotmapSummary).toEqual({
      xgHome: 0.312,
      xgAway: 0.145,
      shotsHome: 1,
      shotsAway: 1,
    });
    expect(averagePositions).toHaveLength(2);

    const serialized = JSON.stringify({
      shots,
      averagePositions,
      shotmapSummary,
      xgTimeline: telemetry.shotmap.xgTimeline,
    });
    for (const forbidden of [
      "987654321",
      "88776655",
      "88776656",
      "77665544",
      "ext-987654321",
      "bzzoiro.com",
      "espncdn",
      "https://",
      "http://",
      "www.",
      "photo_url",
      "image_url",
      "player_id",
      "external_id",
      "event_id",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
