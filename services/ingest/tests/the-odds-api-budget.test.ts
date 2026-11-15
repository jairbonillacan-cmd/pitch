import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CleanHttpTransport } from "../src/odds/legal-registry.js";
import { buildPermittedActiveOddsAdapters } from "../src/odds/betfair-exchange.js";
import {
  DEFAULT_THE_ODDS_API_MARKETS,
  DEFAULT_THE_ODDS_API_REGIONS,
  OddsApiBudget,
  resolveOddsApiBudgetConfig,
  TheOddsApiAdapter,
  UNLIMITED_ODDS_API_BUDGET,
} from "../src/odds/the-odds-api.js";

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("The Odds API · presupuesto gratuito y prechequeo /events", () => {
  it("usa regions=eu y markets=h2h por defecto (1 crédito) y respeta overrides de entorno", () => {
    expect(DEFAULT_THE_ODDS_API_REGIONS).toBe("eu");
    expect(DEFAULT_THE_ODDS_API_MARKETS).toBe("h2h");

    const freeAdapter = new TheOddsApiAdapter({ env: { THE_ODDS_API_KEY: "test_key" } });
    expect(freeAdapter.creditsPerCall).toBe(1);

    const expanded = new TheOddsApiAdapter({
      env: {
        THE_ODDS_API_KEY: "test_key",
        THE_ODDS_API_REGIONS: "eu,us",
        THE_ODDS_API_MARKETS: "h2h,spreads,totals",
      },
    });
    expect(expanded.creditsPerCall).toBe(6);

    const unlimited = resolveOddsApiBudgetConfig({ THE_ODDS_API_MONTHLY_CREDITS: "0" });
    expect(unlimited.monthlyCredits).toBeNull();
  });

  it("consulta gratis /events y omite /odds cuando no hay partidos en la ventana de 48 h", async () => {
    const calls: string[] = [];
    const transport = new CleanHttpTransport({
      rateLimitRps: 1000,
      requester: async (req) => {
        calls.push(req.url);
        if (req.url.includes("/events")) {
          return { url: req.url, status: 200, headers: {}, bodyText: "[]", sha256: "" };
        }
        return { url: req.url, status: 200, headers: {}, bodyText: "[]", sha256: "" };
      },
    });

    const adapter = new TheOddsApiAdapter({
      env: { THE_ODDS_API_KEY: "test_key" },
      transport,
    });
    const rows = await adapter.fetchSnapshots({
      activeLeagues: ["nfl"],
      capturedAtIso: "2026-11-15T12:00:00Z",
    });

    expect(rows).toEqual([]);
    expect(calls.some((u) => u.includes("/events"))).toBe(true);
    expect(calls.some((u) => u.includes("/odds"))).toBe(false);
    expect(adapter.lastBudgetReport?.leaguesSkipped).toEqual({
      americanfootball_nfl: "sin_partidos_en_ventana",
    });
    expect(adapter.lastBudgetReport?.monthCreditsUsed).toBe(0);
  });

  it("persiste el gasto en JSON, aplica cooldown de 180 min y respeta reserva de 25 créditos", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "pl-toa-budget-"));
    tempDirs.push(tmp);
    const budgetPath = join(tmp, "the_odds_api_budget.json");

    let oddsCalls = 0;
    let remainingHeader = "25";
    const sampleOdds = JSON.stringify([
      {
        home_team: "1. FC Union Berlin",
        away_team: "RB Leipzig",
        commence_time: "2026-11-16T15:00:00Z",
        bookmakers: [
          {
            key: "pinnacle",
            markets: [
              {
                key: "h2h",
                outcomes: [
                  { name: "1. FC Union Berlin", price: 2.4 },
                  { name: "Draw", price: 3.3 },
                  { name: "RB Leipzig", price: 3.1 },
                ],
              },
            ],
          },
        ],
      },
    ]);

    const transport = new CleanHttpTransport({
      rateLimitRps: 1000,
      requester: async (req) => {
        if (req.url.includes("/events")) {
          return {
            url: req.url,
            status: 200,
            headers: {} as Record<string, string>,
            bodyText: "[{\"id\":\"evt-1\"}]",
            sha256: "",
          };
        }
        oddsCalls += 1;
        return {
          url: req.url,
          status: 200,
          headers: {
            "x-requests-remaining": remainingHeader,
            "x-requests-used": "475",
            "x-requests-last": "1",
          } as Record<string, string>,
          bodyText: sampleOdds,
          sha256: "",
        };
      },
    });

    const adapter = new TheOddsApiAdapter({
      env: { THE_ODDS_API_KEY: "test_key" },
      transport,
      budgetPath,
    });

    // 1. Primera llamada a las 12:00Z -> consume 1 crédito y deja remaining_header=25
    const rows1 = await adapter.fetchSnapshots({
      activeLeagues: ["bundesliga"],
      capturedAtIso: "2026-11-15T12:00:00Z",
    });
    expect(rows1.length).toBeGreaterThanOrEqual(1);
    expect(oddsCalls).toBe(1);
    expect(adapter.lastBudgetReport?.leaguesFetched).toEqual(["soccer_germany_bundesliga"]);
    expect(adapter.lastBudgetReport?.remainingHeader).toBe(25);

    const persisted = JSON.parse(readFileSync(budgetPath, "utf8")) as Record<string, unknown>;
    expect(persisted.month).toBe("2026-11");
    expect(persisted.credits_used).toBe(1);
    expect(persisted.remaining_header).toBe(25);

    // 2. Recarga tras 60 min (< 180 min) -> intervalo_minimo sin llamar /odds
    const adapterSoon = new TheOddsApiAdapter({
      env: { THE_ODDS_API_KEY: "test_key" },
      transport,
      budgetPath,
    });
    await adapterSoon.fetchSnapshots({
      activeLeagues: ["bundesliga"],
      capturedAtIso: "2026-11-15T13:00:00Z",
    });
    expect(oddsCalls).toBe(1);
    expect(adapterSoon.lastBudgetReport?.leaguesSkipped).toEqual({
      soccer_germany_bundesliga: "intervalo_minimo",
    });

    // 3. Recarga tras 4 horas (>= 180 min), pero remaining_header=25 - 1 < 25 -> reserva_mensual
    const adapterLow = new TheOddsApiAdapter({
      env: { THE_ODDS_API_KEY: "test_key" },
      transport,
      budgetPath,
    });
    await adapterLow.fetchSnapshots({
      activeLeagues: ["bundesliga"],
      capturedAtIso: "2026-11-15T16:00:00Z",
    });
    expect(oddsCalls).toBe(1);
    expect(adapterLow.lastBudgetReport?.leaguesSkipped).toEqual({
      soccer_germany_bundesliga: "reserva_mensual",
    });
  });

  it("respeta tope diario, cambia de mes y permite modo sin tope", () => {
    const budget = new OddsApiBudget({
      monthlyCredits: 325,
      reserveCredits: 25,
      minIntervalMinutes: 0,
      lookaheadHours: 48,
    });
    // 2026-11-16: quedan 15 días de noviembre, disponible = 300 -> 20/día
    const nov16 = Date.parse("2026-11-16T10:00:00Z");
    expect(budget.dailyAllowance(nov16)).toBeCloseTo(20, 5);

    budget.record("soccer_epl", 20, nov16, 480);
    expect(budget.check("soccer_epl", 1, nov16)).toBe("tope_diario");

    // Cambio de mes reinicia credits_used y by_day
    const dec01 = Date.parse("2026-12-01T10:00:00Z");
    expect(budget.check("soccer_epl", 1, dec01)).toBeNull();
    expect(budget.creditsUsed).toBe(0);

    const unlimited = new OddsApiBudget(UNLIMITED_ODDS_API_BUDGET);
    expect(unlimited.dailyAllowance(nov16)).toBeNull();
    expect(unlimited.check("soccer_epl", 99, nov16)).toBeNull();
  });

  it("propaga theOddsApiBudgetPath desde buildPermittedActiveOddsAdapters", () => {
    const { adapters } = buildPermittedActiveOddsAdapters(
      { THE_ODDS_API_KEY: "a" },
      { theOddsApiBudgetPath: "/tmp/custom_budget.json" },
    );
    const theOdds = adapters[0] as TheOddsApiAdapter;
    expect(
      (theOdds as unknown as { budgetPath: string | null }).budgetPath,
    ).toBe("/tmp/custom_budget.json");
  });
});
