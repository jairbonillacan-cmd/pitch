import { describe, expect, it } from "vitest";
import { GameAnalysisSchema, type GameAnalysis, type GameDTO } from "@pitchlab/contracts";
import { MIN_SAMPLE, buildCountFeed, withCountProjections, type CountRow } from "../src/counts-feed.js";

function rows(n: number): CountRow[] {
  const out: CountRow[] = [];
  for (let i = 0; i < n; i++) {
    const day = `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, "0")}`;
    out.push({ date: day, season: "2026-27", home: "liga-mx.monterrey", away: "liga-mx.queretaro", counts: { corners: [7, 3], fouls: [10, 13] } });
    out.push({ date: day, season: "2026-27", home: "liga-mx.queretaro", away: "liga-mx.monterrey", counts: { corners: [4, 6], fouls: [12, 11] } });
  }
  return out;
}

const game = {
  id: "liga-mx-test",
  home: { id: "liga-mx.monterrey", shortName: "Monterrey" },
  away: { id: "liga-mx.queretaro", shortName: "Querétaro" },
} as unknown as GameDTO;

const base = {
  game: "liga-mx-test",
  model: { id: "m", version: "1", status: "candidate", label: "x" },
  projection: { home: 1.5, away: 1, total: 2.5 },
  x12: [0.5, 0.25, 0.25],
  probabilities: [{ market: "h2h", selection: "home", p: 0.5, fairOdds: 2 }],
  marketGroups: [{ group: "1X2", rows: [{ market: "h2h", selection: "home", label: "Local", p: 0.5, fairOdds: 2 }] }],
  factors: [{ key: "k", label: "L", value: "v" }],
  steps: ["1", "2", "3", "4", "5", "6"],
  inputsAsOf: "2026-11-14T00:00:00Z",
  publishedAt: "2026-11-14T00:00:00Z",
  source: "test",
} as unknown as GameAnalysis;

describe("córners y faltas en el análisis", () => {
  it("agrega conteos, mercado y factor, y el análisis sigue pasando el esquema", () => {
    const out = withCountProjections(base, game, buildCountFeed(rows(20)));
    expect(out.counts?.corners?.home).toBeGreaterThan(out.counts!.corners!.away);
    expect(out.counts?.corners?.line).toBeDefined();
    expect(out.counts?.yellow).toBeUndefined();
    expect(out.marketGroups.map((g) => g.group.split(" ")[0])).toEqual(["1X2", "Tiros", "Faltas"]);
    expect(out.factors.some((f) => f.key === "corners_expected")).toBe(true);
    expect(() => GameAnalysisSchema.parse(out)).not.toThrow();
  });

  it("sin muestra suficiente no publica nada (no inventa números)", () => {
    const few = rows(Math.floor((MIN_SAMPLE - 1) / 2));
    expect(withCountProjections(base, game, buildCountFeed(few))).toBe(base);
    expect(withCountProjections(base, game, null)).toBe(base);
  });

  it("aplica el multiplicador del árbitro en faltas y amarillas tras superar el mínimo sin tocar córners", () => {
    const history: CountRow[] = [];
    for (let i = 0; i < 18; i++) {
      const day = `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, "0")}`;
      history.push({
        date: day,
        season: "2026-27",
        home: "liga-mx.monterrey",
        away: "liga-mx.queretaro",
        referee: "Árbitro Estricto",
        counts: { corners: [6, 5], fouls: [20, 20], yellow: [4, 4] },
      });
    }
    const feed = buildCountFeed(history);
    const neutral = feed.predict("liga-mx.monterrey", "liga-mx.queretaro");
    const withStrict = feed.predict("liga-mx.monterrey", "liga-mx.queretaro", "Árbitro Estricto");
    expect(withStrict.corners?.total).toBe(neutral.corners?.total);
    expect(withStrict.fouls!.total).toBeGreaterThan(neutral.fouls!.total);
    expect(withStrict.yellow!.total).toBeGreaterThan(neutral.yellow!.total);
  });
});
