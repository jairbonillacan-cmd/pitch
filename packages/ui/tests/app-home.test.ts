import { describe, expect, it } from "vitest";
import { LeagueSnapshotSchema, snapshotToMatchAnalyses } from "@pitchlab/contracts";
import nfl from "../../../data/snapshots/nfl/latest.json";
import { buildAppHome } from "../src/app/data.js";

const snapshot = LeagueSnapshotSchema.parse(nfl);
const match = snapshotToMatchAnalyses(snapshot).matches.find((game) => game.publicationLabel)!;
const now = new Date("2026-11-10T04:00:00Z");
const base = {
  league: "nfl",
  leagueLabel: "NFL",
  generatedAt: "2026-11-09T16:35:00Z",
};

describe("Inicio a partir de snapshots", () => {
  it("elige los cuatro líderes de h2h y respeta la cuota publicada", () => {
    const games = [0.61, 0.88, 0.77, 0.69, 0.74].map((p, index) => ({
      ...match,
      id: String(index),
      status: "NS" as const,
      scheduleStatus: "scheduled" as const,
      kickoffUtc: "2026-11-20T12:00:00Z",
      marketGroups: [{
        group: "Ganador",
        rows: [{ ...match.marketGroups![0]!.rows[0]!, p, fairOdds: 1.123 }],
      }, {
        group: "Otro mercado",
        rows: [{ ...match.marketGroups![0]!.rows[0]!, p: 0.99, fairOdds: 1.01 }],
      }],
    }));
    const home = buildAppHome([{ ...base, games }], now);
    expect(home.ranked.map(({ outcome }) => outcome.p)).toEqual([0.88, 0.77, 0.74, 0.69]);
    expect(home.ranked[0]?.outcome.fairOdds).toBe(1.123);
  });

  it("resuelve la fecha de México y excluye cancelaciones y probabilidades de relleno", () => {
    const upcoming = {
      ...match,
      status: "NS" as const,
      scheduleStatus: "scheduled" as const,
      kickoffUtc: "2026-11-10T05:15:00Z",
    };
    const home = buildAppHome([{ ...base, games: [
      { ...upcoming, id: "cancelado", scheduleStatus: "canceled", kickoffUtc: "2026-11-10T04:30:00Z" },
      { ...upcoming, id: "sin-pronostico", publicationLabel: undefined },
      { ...upcoming, id: "publicado", kickoffUtc: "2026-11-10T16:00:00Z" },
    ] }], now);
    expect(home.tonight).toMatchObject({ id: "sin-pronostico", time: "23:15" });
    expect(home.tonight?.outcome).toBeUndefined();
    expect(home.upcoming.map(({ id }) => id)).toEqual(["sin-pronostico", "publicado"]);
    expect(home.ranked.map(({ id }) => id)).toEqual(["publicado"]);
  });
});
