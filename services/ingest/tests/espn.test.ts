import { describe, expect, it } from "vitest";
import { compactEspnSummary, parseEspnSummary } from "../src/index.js";

const payload = {
  boxscore: {
    teams: [
      {
        team: { id: "234", displayName: "Pachuca" },
        statistics: [
          { name: "totalShots", displayValue: "13", value: 13 },
          { name: "shotsOnTarget", displayValue: "5", value: 5 },
          { name: "wonCorners", displayValue: "6", value: 6 },
          { name: "possessionPct", displayValue: "54.2", value: 54.2 },
          { name: "yellowCards", displayValue: "2", value: 2 },
          { name: "redCards", displayValue: "0", value: 0 },
        ],
      },
      {
        team: { id: "227", displayName: "América" },
        statistics: [
          { name: "totalShots", displayValue: "9", value: 9 },
          { name: "shotsOnTarget", displayValue: "3", value: 3 },
          { name: "wonCorners", displayValue: "4", value: 4 },
          { name: "possessionPct", displayValue: "45.8", value: 45.8 },
          { name: "yellowCards", displayValue: "1", value: 1 },
          { name: "redCards", displayValue: "1", value: 1 },
        ],
      },
    ],
  },
};

describe("ESPN — estadísticas de Liga MX", () => {
  it("extrae tiros, córners, posesión y tarjetas por equipo", () => {
    const stats = parseEspnSummary(payload);
    expect(stats.size).toBe(2);
    expect(stats.get("234")).toEqual({
      shots: 13,
      shotsOnTarget: 5,
      corners: 6,
      possession: 54.2,
      yellow: 2,
      red: 0,
    });
    expect(stats.get("227")?.red).toBe(1);
  });

  it("tolera valores con porcentaje y equipos sin boxscore", () => {
    const stats = parseEspnSummary({
      boxscore: {
        teams: [
          {
            team: { id: "1" },
            statistics: [{ name: "possessionPct", displayValue: "61%" }],
          },
        ],
      },
    });
    expect(stats.get("1")?.possession).toBe(61);
    expect(stats.get("1")?.shots).toBeNull();
    expect(parseEspnSummary({}).size).toBe(0);
  });

  it("compacta el summary a nombres y estadísticas", () => {
    const compact = compactEspnSummary(payload)!;
    expect(compact.names["234"]).toBe("Pachuca");
    expect(compact.names["227"]).toBe("América");
    expect(compact.stats["234"]?.shots).toBe(13);
    expect(compact.stats["227"]?.red).toBe(1);
    expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(payload).length);
    expect(compactEspnSummary({ boxscore: { teams: [] } })).toBeNull();
  });
});
