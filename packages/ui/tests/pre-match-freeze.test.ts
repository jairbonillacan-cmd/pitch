import { describe, expect, it } from "vitest";
import { asLeagueId } from "@pitchlab/contracts";
import {
  CONFIRMED_LINEUP_OFF_BADGE,
  createFrozenMainPickSnapshot,
  formatClockHour24,
  HONEST_NO_ABSENCES_COPY,
  parseKickoffUtcMs,
  resolveConfirmedLineupSlotState,
  resolvePreMatchAbsencesState,
  resolvePreMatchFreezeState,
} from "../src/platform/club/match/pre-match-logic";
import type { MatchPick, PlatformGame, PreGameIntel } from "../src/platform/types";

function makePick(overrides: Partial<MatchPick> = {}): MatchPick {
  return {
    id: "game-1__pick-1",
    gameId: "game-1",
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    matchLabel: "Querétaro vs Monterrey",
    kickoffLocal: "19:00",
    gameStatus: "NS",
    slotIndex: 0,
    category: "principal",
    categoryLabel: "Doble oportunidad",
    risk: "conservador",
    engineKey: "tachyon",
    engineName: "PitchLab Tachyon",
    marketGroup: "Doble oportunidad",
    selectionKey: "1x",
    conflictGroup: "home_side",
    label: "Querétaro o empate",
    rationale: "Frecuencia histórica favorable en casa.",
    p: 0.654,
    fairDecimal: 1.53,
    fairAmerican: -189,
    marketDecimal: null,
    marketAmerican: null,
    edgePts: null,
    confidenceScore: 68,
    suggestedUnits: 1,
    ...overrides,
  };
}

function makeBasePreGame(overrides: Partial<PreGameIntel> = {}): PreGameIntel {
  return {
    cortexSynthesis: "Partido parejo con ligera ventaja territorial local.",
    tacticalKeys: ["Descanso: Querétaro 7d vs Monterrey 4d"],
    lineupStatusLabel: "Alineaciones oficiales pendientes",
    lineupsConfirmed60m: false,
    confirmedLineups: null,
    absences: [],
    moneyFlow: null,
    ...overrides,
  };
}

function makeGame(
  overrides: Partial<Pick<PlatformGame, "id" | "kickoffUtc" | "status" | "picks" | "preGame">> = {},
): Pick<PlatformGame, "id" | "kickoffUtc" | "status" | "picks" | "preGame"> {
  // 2026-11-15T01:00:00Z = 19:00 en America/Mexico_City (UTC-6).
  // Límite de congelado (T - 60 min): 2026-11-15T00:00:00Z = 18:00 en America/Mexico_City.
  return {
    id: "game-1",
    kickoffUtc: "2026-11-15T01:00:00Z",
    status: "NS",
    picks: [makePick()],
    preGame: makeBasePreGame(),
    ...overrides,
  };
}

describe("pre-match-logic: congelado determinista 60 min antes del saque inicial", () => {
  it("normaliza fechas ISO con o sin sufijo Z y formatea horas en 24 h", () => {
    expect(parseKickoffUtcMs("2026-11-15T01:00:00Z")).toBe(
      parseKickoffUtcMs("2026-11-15T01:00:00"),
    );
    expect(
      formatClockHour24(Date.parse("2026-11-15T00:00:00Z"), "America/Mexico_City"),
    ).toBe("18:00");
    expect(
      formatClockHour24(Date.parse("2026-11-15T06:00:00Z"), "America/Mexico_City"),
    ).toBe("00:00");
  });

  it("antes del límite (T - 60 min): muestra «Se congela a las 18:00» y usa el pick en vivo sin congelarlo", () => {
    const game = makeGame();
    const res = resolvePreMatchFreezeState({
      game,
      now: new Date("2026-11-14T22:30:00Z"), // 2.5 h antes del inicio
      timeZone: "America/Mexico_City",
    });

    expect(res.phase).toBe("before_freeze");
    expect(res.isFrozen).toBe(false);
    expect(res.matchStarted).toBe(false);
    expect(res.sealLabel).toBe("Se congela a las 18:00");
    expect(res.snapshotToPersist).toBeNull();
    expect(res.pick?.label).toBe("Querétaro o empate");
    expect(res.pick?.p).toBeCloseTo(0.654, 5);

    // 1 milisegundo antes del límite sigue sin congelar:
    const oneMsBefore = resolvePreMatchFreezeState({
      game,
      now: Date.parse("2026-11-15T00:00:00Z") - 1,
      timeZone: "America/Mexico_City",
    });
    expect(oneMsBefore.isFrozen).toBe(false);
    expect(oneMsBefore.sealLabel).toBe("Se congela a las 18:00");
  });

  it("justo en el límite exacto (T - 60 min): congela el pick con sello «Congelado a las 18:00»", () => {
    const game = makeGame();
    const atBoundary = resolvePreMatchFreezeState({
      game,
      now: new Date("2026-11-15T00:00:00.000Z"), // Exactamente 60 min antes
      timeZone: "America/Mexico_City",
    });

    expect(atBoundary.phase).toBe("frozen");
    expect(atBoundary.isFrozen).toBe(true);
    expect(atBoundary.matchStarted).toBe(false);
    expect(atBoundary.sealLabel).toBe("Congelado a las 18:00");
    expect(atBoundary.freezeAtUtc).toBe("2026-11-15T00:00:00.000Z");
    expect(atBoundary.minutesUntilKickoff).toBe(60);
    expect(atBoundary.snapshotToPersist).not.toBeNull();
    expect(atBoundary.pick?.label).toBe("Querétaro o empate");
    expect(atBoundary.pick?.p).toBeCloseTo(0.654, 5);
  });

  it("después del límite (T - 20 min): mantiene lo congelado aunque el motor se recalcule con otro pick y otra probabilidad", () => {
    const initialGame = makeGame();
    const frozenSnapshot = createFrozenMainPickSnapshot(initialGame);
    expect(frozenSnapshot).not.toBeNull();

    // El motor vuelve a calcularse a T - 20 min cambiando selección, probabilidad y momio justo:
    const recalculatedGame = makeGame({
      picks: [
        makePick({
          id: "game-1__pick-recalculated",
          label: "Monterrey gana",
          categoryLabel: "Resultado",
          marketGroup: "Resultado",
          selectionKey: "away",
          p: 0.512,
          fairDecimal: 1.95,
          fairAmerican: -105,
        }),
      ],
    });

    const afterRecalc = resolvePreMatchFreezeState({
      game: recalculatedGame,
      now: new Date("2026-11-15T00:40:00Z"), // 20 min antes del inicio
      existingFrozen: frozenSnapshot,
      timeZone: "America/Mexico_City",
    });

    expect(afterRecalc.phase).toBe("frozen");
    expect(afterRecalc.isFrozen).toBe(true);
    expect(afterRecalc.sealLabel).toBe("Congelado a las 18:00");
    // Invariante crítica: NO cambia aunque el motor haya recalculado game.picks[0]
    expect(afterRecalc.pick?.pickId).toBe("game-1__pick-1");
    expect(afterRecalc.pick?.label).toBe("Querétaro o empate");
    expect(afterRecalc.pick?.p).toBeCloseTo(0.654, 5);
    expect(afterRecalc.pick?.fairDecimal).toBeCloseTo(1.53, 2);
    expect(afterRecalc.pick?.fairAmerican).toBe(-189);
  });

  it("partido ya iniciado (por hora o estado LIVE/FT): marca matchStarted y conserva intacto el pick congelado", () => {
    const initialGame = makeGame();
    const frozenSnapshot = createFrozenMainPickSnapshot(initialGame);

    const startedByClock = resolvePreMatchFreezeState({
      game: makeGame({
        picks: [makePick({ label: "Más de 2.5 goles", p: 0.72, fairDecimal: 1.39 })],
      }),
      now: new Date("2026-11-15T01:05:00Z"), // 5 min después del inicio
      existingFrozen: frozenSnapshot,
      timeZone: "America/Mexico_City",
    });

    expect(startedByClock.phase).toBe("match_started");
    expect(startedByClock.isFrozen).toBe(true);
    expect(startedByClock.matchStarted).toBe(true);
    expect(startedByClock.sealLabel).toBe("Congelado a las 18:00");
    expect(startedByClock.pick?.label).toBe("Querétaro o empate");
    expect(startedByClock.pick?.p).toBeCloseTo(0.654, 5);

    const startedByLiveStatus = resolvePreMatchFreezeState({
      game: makeGame({ status: "LIVE" }),
      now: new Date("2026-11-15T00:58:00Z"), // Saque adelantado con estado LIVE
      existingFrozen: frozenSnapshot,
      timeZone: "America/Mexico_City",
    });

    expect(startedByLiveStatus.phase).toBe("match_started");
    expect(startedByLiveStatus.matchStarted).toBe(true);
    expect(startedByLiveStatus.isFrozen).toBe(true);
  });

  it("bajas y ranura de alineación: honestidad total sin bajas y alineación APAGADA sin fuente verificada", () => {
    const noAbsences = resolvePreMatchAbsencesState(makeGame(), true);
    expect(noAbsences.state).toBe("no_absences");
    expect(noAbsences.honestEmptyLabel).toBe(HONEST_NO_ABSENCES_COPY);
    expect(noAbsences.items).toHaveLength(0);

    const offDefault = resolveConfirmedLineupSlotState(makeBasePreGame(), true);
    expect(offDefault.enabled).toBe(false);
    expect(offDefault.statusBadge).toBe(CONFIRMED_LINEUP_OFF_BADGE);
    expect(offDefault.lineups).toBeNull();

    // Incluso si alguien marca lineupsConfirmed60m=true sin fuente ni 11 titulares reales, permanece apagada:
    const incomplete = resolveConfirmedLineupSlotState(
      makeBasePreGame({
        lineupsConfirmed60m: true,
        confirmedLineups: {
          sourceLabel: "",
          verifiedAtUtc: "2026-11-15T00:05:00Z",
          homeStarters: [{ name: "Jugador 1" }],
          awayStarters: [{ name: "Jugador 2" }],
        },
      }),
      true,
    );
    expect(incomplete.enabled).toBe(false);
  });
});
