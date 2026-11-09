import { describe, expect, it } from "vitest";
import type { GameDTO } from "@pitchlab/contracts";
import { marketPulseLean, toMarketPulseView } from "@pitchlab/contracts";
import {
  matchKalshiEvents,
  matchPolymarketEvents,
  mergeMarketPulse,
  type KalshiEvent,
  type PolymarketEvent,
} from "../src/adapters/market-pulse.js";

const team = (league: string, slug: string, name: string, code: string) => ({
  id: `${league}.${slug}`,
  league,
  name,
  shortName: name,
  code,
});

const game = (id: string, startTime: string, home: ReturnType<typeof team>, away: ReturnType<typeof team>) =>
  ({
    id,
    league: home.league,
    season: "s",
    week: 1,
    round: "Jornada 1",
    startTime,
    status: "scheduled",
    home,
    away,
    venue: "",
    neutralSite: false,
  }) as unknown as GameDTO;

const OBS = "2026-11-09T12:00:00.000Z";

describe("matchPolymarketEvents", () => {
  const games = [
    game(
      "pl-city-fulham",
      "2026-11-21T12:30:00Z",
      team("premier-league", "manchester-city", "Manchester City", "MCI"),
      team("premier-league", "fulham", "Fulham", "FUL"),
    ),
    game(
      "pl-utd-city",
      "2026-11-22T16:30:00Z",
      team("premier-league", "manchester-united", "Manchester United", "MUN"),
      team("premier-league", "everton", "Everton", "EVE"),
    ),
  ];

  const event: PolymarketEvent = {
    title: "Manchester City FC vs. Fulham FC",
    endDate: "2026-11-21T12:30:00Z",
    markets: [
      { groupItemTitle: "Fulham FC", volume: 20, outcomePrices: '["0.14","0.86"]', sportsMarketType: "moneyline", gameStartTime: "2026-11-21 12:30:00+00" },
      { groupItemTitle: "Draw (Manchester City FC vs. Fulham FC)", volume: 60, outcomePrices: '["0.185","0.815"]', sportsMarketType: "moneyline", gameStartTime: "2026-11-21 12:30:00+00" },
      { groupItemTitle: "Manchester City FC", volume: 1120, outcomePrices: '["0.675","0.325"]', sportsMarketType: "moneyline", gameStartTime: "2026-11-21 12:30:00+00" },
    ],
  };

  it("asigna local, empate y visitante por nombre, sin confundir clubes de la misma ciudad", () => {
    const [entry] = matchPolymarketEvents([event], games, OBS);
    expect(entry?.gameId).toBe("pl-city-fulham");
    expect(entry?.unit).toBe("usd");
    expect(entry?.outcomes).toEqual([
      { side: "away", volume: 20, price: 0.14 },
      { side: "draw", volume: 60, price: 0.185 },
      { side: "home", volume: 1120, price: 0.675 },
    ]);
  });

  it("ignora eventos fuera de la ventana de fecha o sin los tres resultados", () => {
    const old = { ...event, markets: event.markets.map((m) => ({ ...m, gameStartTime: "2025-05-25 15:00:00+00" })) };
    const partial = { ...event, markets: event.markets.slice(0, 2) };
    expect(matchPolymarketEvents([old, partial], games, OBS)).toEqual([]);
  });
});

describe("matchKalshiEvents", () => {
  const games = [
    game(
      "nfl-bills-vikings",
      "2026-11-09T20:15:00",
      team("nfl", "minnesota-vikings", "Minnesota Vikings", "MIN"),
      team("nfl", "buffalo-bills", "Buffalo Bills", "BUF"),
    ),
    game(
      "nfl-jags-colts",
      "2026-11-15T13:00:00",
      team("nfl", "indianapolis-colts", "Indianapolis Colts", "IND"),
      team("nfl", "jacksonville-jaguars", "Jacksonville Jaguars", "JAX"),
    ),
  ];
  const events: KalshiEvent[] = [
    {
      event_ticker: "KXNFLGAME-26NOV09BUFMIN",
      markets: [
        { ticker: "KXNFLGAME-26NOV09BUFMIN-MIN", volume_fp: 600, last_price_dollars: 0.39 },
        { ticker: "KXNFLGAME-26NOV09BUFMIN-BUF", volume_fp: 880, last_price_dollars: 0.62 },
      ],
    },
    {
      event_ticker: "KXNFLGAME-26NOV15JACIND",
      markets: [
        { ticker: "KXNFLGAME-26NOV15JACIND-JAC", volume_fp: 10, last_price_dollars: 0.3 },
        { ticker: "KXNFLGAME-26NOV15JACIND-IND", volume_fp: 30, last_price_dollars: 0.7 },
      ],
    },
  ];

  it("empareja por código de equipo, incluido el alias JAC → JAX", () => {
    const entries = matchKalshiEvents(events, games, OBS);
    expect(entries.map((e) => e.gameId)).toEqual(["nfl-bills-vikings", "nfl-jags-colts"]);
    expect(entries[0]?.outcomes).toEqual([
      { side: "home", volume: 600, price: 0.39 },
      { side: "away", volume: 880, price: 0.62 },
    ]);
    expect(entries[0]?.unit).toBe("contracts");
  });
});

describe("mergeMarketPulse y vista", () => {
  const entry = (gameId: string, volume: number) => ({
    gameId,
    source: "polymarket" as const,
    unit: "usd" as const,
    observedAt: OBS,
    outcomes: [
      { side: "home" as const, volume: volume * 0.7, price: 0.5 },
      { side: "draw" as const, volume: volume * 0.1, price: 0.25 },
      { side: "away" as const, volume: volume * 0.2, price: 0.25 },
    ],
  });

  it("conserva la última lectura de un partido que ya empezó y descarta partidos ajenos", () => {
    const merged = mergeMarketPulse([entry("a", 100), entry("old", 5)], [entry("b", 50)], new Set(["a", "b"]));
    expect(merged.map((e) => e.gameId)).toEqual(["a", "b"]);
  });

  it("marca el mercado cargado solo con volumen suficiente", () => {
    const thick = toMarketPulseView(entry("a", 50_000));
    expect(thick.thin).toBe(false);
    expect(thick.sides[0]?.share).toBeCloseTo(0.7);
    expect(marketPulseLean(thick, { home: 0.5, draw: 0.25, away: 0.25 })?.side).toBe("home");
    expect(marketPulseLean(thick, { home: 0.65, draw: 0.15, away: 0.2 })).toBeNull();

    const thin = toMarketPulseView(entry("a", 900));
    expect(thin.thin).toBe(true);
    expect(marketPulseLean(thin, { home: 0.3 })).toBeNull();
  });
});
