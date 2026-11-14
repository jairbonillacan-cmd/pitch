import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadXgGames } from "../src/history-backtest.js";
import { linkProviderGames, teamSimilarity, type CorpusGame, type ProviderGame } from "../src/providers/link.js";

const corpus: CorpusGame[] = [
  { id: "mx:1", date: "2025-02-01", homeTeam: "liga-mx.leon", awayTeam: "liga-mx.gallos-blancos", homeScore: 2, awayScore: 1 },
  { id: "mx:2", date: "2025-02-08", homeTeam: "liga-mx.gallos-blancos", awayTeam: "liga-mx.deportivo-toluca", homeScore: 0, awayScore: 0 },
  { id: "mx:3", date: "2025-02-15", homeTeam: "liga-mx.uanl-tigres", awayTeam: "liga-mx.gallos-blancos", homeScore: 3, awayScore: 3 },
  { id: "mx:4", date: "2025-02-22", homeTeam: "liga-mx.gallos-blancos", awayTeam: "liga-mx.leon", homeScore: 1, awayScore: 1 },
  { id: "mx:5", date: "2025-03-01", homeTeam: "liga-mx.leon", awayTeam: "liga-mx.uanl-tigres", homeScore: 0, awayScore: 2 },
];

const team = (id: number, name: string) => ({ providerTeamId: id, name });
const LEON = team(318, "Club León");
const QRO = team(310, "Querétaro FC");
const TOL = team(312, "CD Toluca");
const TIG = team(315, "Tigres UANL");

// Fechas en UTC: un partido nocturno en México cae al día siguiente.
const rows: ProviderGame[] = [
  { providerMatchId: 1, kickoffUtc: "2025-02-02T03:00:00Z", home: LEON, away: QRO, homeScore: 2, awayScore: 1 },
  { providerMatchId: 2, kickoffUtc: "2025-02-09T01:00:00Z", home: QRO, away: TOL, homeScore: 0, awayScore: 0 },
  { providerMatchId: 3, kickoffUtc: "2025-02-15T23:00:00Z", home: TIG, away: QRO, homeScore: 3, awayScore: 3 },
  // Marcador corregido en el proveedor: entra por la segunda pasada con el mapa de equipos.
  { providerMatchId: 4, kickoffUtc: "2025-02-23T02:00:00Z", home: QRO, away: LEON, homeScore: 2, awayScore: 1 },
  { providerMatchId: 5, kickoffUtc: "2025-03-01T20:00:00Z", home: LEON, away: TIG, homeScore: 0, awayScore: 2 },
  // Partido que no está en el corpus.
  { providerMatchId: 6, kickoffUtc: "2025-04-01T20:00:00Z", home: LEON, away: TOL, homeScore: 1, awayScore: 0 },
];

describe("emparejamiento de proveedores con el corpus", () => {
  it("parecido de nombres", () => {
    expect(teamSimilarity("Club León", "liga-mx.leon")).toBeGreaterThanOrEqual(0.85);
    expect(teamSimilarity("Tigres UANL", "liga-mx.uanl-tigres")).toBeGreaterThanOrEqual(0.85);
    expect(teamSimilarity("Querétaro FC", "liga-mx.gallos-blancos")).toBe(0);
  });

  it("aprende «Querétaro FC» = gallos-blancos por anclas y empareja todo lo del corpus", () => {
    const result = linkProviderGames(corpus, rows);
    expect(result.links.get(1)).toBe("mx:1");
    expect(result.links.get(3)).toBe("mx:3");
    expect(result.links.get(4)).toBe("mx:4");
    expect(result.links.size).toBe(5);
    expect(result.teamMap.get(310)?.team).toBe("liga-mx.gallos-blancos");
    expect(result.unmatched.map((r) => r.providerMatchId)).toEqual([6]);
    expect(result.stats.secondPass).toBe(1);
  });

  it("no empareja dos filas con el mismo partido del corpus", () => {
    const dup = [...rows, { ...rows[0]!, providerMatchId: 99 }];
    const result = linkProviderGames(corpus, dup);
    const ids = [...result.links.values()];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("xG medido de Bzzoiro en el backtest", () => {
  let dir = "";
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("encima del xG base, salvo cuando Bzzoiro lo estimó", () => {
    dir = mkdtempSync(join(tmpdir(), "pl-xg-"));
    const research = join(dir, "data", "history", "research");
    mkdirSync(join(research, "xg"), { recursive: true });
    mkdirSync(join(research, "xg-bzzoiro"), { recursive: true });
    writeFileSync(
      join(research, "xg", "liga-mx.jsonl"),
      ['{"id":"a","homeXg":1,"awayXg":1}', '{"id":"b","homeXg":2,"awayXg":2}'].join("\n"),
    );
    writeFileSync(
      join(research, "xg-bzzoiro", "liga-mx.jsonl"),
      [
        '{"id":"a","homeXg":1.4,"awayXg":0.6,"estimated":false}',
        '{"id":"b","homeXg":9,"awayXg":9,"estimated":true}',
        '{"id":"c","homeXg":0.8,"awayXg":1.1,"estimated":false}',
      ].join("\n"),
    );
    const merged = loadXgGames(dir, "liga-mx");
    expect(merged.get("a")).toEqual({ homeXg: 1.4, awayXg: 0.6 });
    expect(merged.get("b")).toEqual({ homeXg: 2, awayXg: 2 });
    expect(merged.get("c")).toEqual({ homeXg: 0.8, awayXg: 1.1 });
    expect(loadXgGames(dir, "liga-mx", "base").get("a")).toEqual({ homeXg: 1, awayXg: 1 });
    expect(loadXgGames(dir, "liga-mx", "bzzoiro").has("b")).toBe(false);
    expect(loadXgGames(dir, "liga-mx", "merged-any").get("b")).toEqual({ homeXg: 9, awayXg: 9 });
  });
});
