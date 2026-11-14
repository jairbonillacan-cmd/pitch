import { describe, expect, it } from "vitest";
import { devig, devig2Way, devigAdaptive1X2 } from "../src/devig";
import {
  DEDUP_NATURAL_KEY_COLUMNS,
  detectSnapshotGaps,
  devigClosingMarket,
  isValidPriceDecimal,
  MAX_GAP_MINUTES,
  MAX_PRICE_DECIMAL,
  MIN_PRICE_DECIMAL,
  type OddsSnapshotRow,
  REQUIRED_ODDS_SNAPSHOT_COLUMNS,
  resolveClosingMarket,
  resolveClosingSnapshots,
  validateAndDeduplicateSnapshots,
} from "../src/odds";

function makeRow(overrides: Partial<OddsSnapshotRow>): OddsSnapshotRow {
  return {
    event_id: "E0:20250510:arsenal:liverpool",
    sport: "football",
    league: "E0",
    market: "1x2",
    line: null,
    selection: "home",
    book: "pinnacle",
    price_decimal: 2.1,
    ts_captured: "2025-05-10T14:59:59Z",
    ts_event_start: "2025-05-10T15:00:00Z",
    source: "historical_fd",
    snapshot_stage: "close",
    ...overrides,
  };
}

describe("Contrato A1 · odds_snapshots (TypeScript)", () => {
  it("expone exactamente las 11 columnas requeridas y la clave natural de 7 campos", () => {
    expect(REQUIRED_ODDS_SNAPSHOT_COLUMNS).toEqual([
      "event_id",
      "sport",
      "league",
      "market",
      "line",
      "selection",
      "book",
      "price_decimal",
      "ts_captured",
      "ts_event_start",
      "source",
    ]);
    expect(REQUIRED_ODDS_SNAPSHOT_COLUMNS).toHaveLength(11);
    expect(DEDUP_NATURAL_KEY_COLUMNS).toEqual([
      "event_id",
      "market",
      "line",
      "selection",
      "book",
      "ts_captured",
      "source",
    ]);
    expect(MIN_PRICE_DECIMAL).toBe(1.01);
    expect(MAX_PRICE_DECIMAL).toBe(1000.0);
    expect(MAX_GAP_MINUTES).toBe(60.0);
  });

  it("valida límites cerrados de cuota decimal en [1.01, 1000.0]", () => {
    expect(isValidPriceDecimal(1.01)).toBe(true);
    expect(isValidPriceDecimal(1000.0)).toBe(true);
    expect(isValidPriceDecimal(1.9091)).toBe(true);

    expect(isValidPriceDecimal(1.0)).toBe(false);
    expect(isValidPriceDecimal(1.0099)).toBe(false);
    expect(isValidPriceDecimal(1000.0001)).toBe(false);
    expect(isValidPriceDecimal(0)).toBe(false);
    expect(isValidPriceDecimal(-1.5)).toBe(false);
    expect(isValidPriceDecimal(Number.NaN)).toBe(false);
    expect(isValidPriceDecimal(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("descarta fuera de rango, post-kickoff y deduplica por clave natural incluyendo line=null y -0", () => {
    const input: OddsSnapshotRow[] = [
      // Válidas en bordes exactos
      makeRow({ selection: "home", price_decimal: 1.01 }),
      makeRow({ selection: "draw", price_decimal: 15.0 }),
      makeRow({ selection: "away", price_decimal: 1000.0 }),
      // Duplicado exacto con formato ISO equivalente (.000Z) y line=null
      makeRow({ selection: "home", price_decimal: 1.05, ts_captured: "2025-05-10T14:59:59.000Z" }),
      // Duplicado con -0 vs +0 en hándicap asiático
      makeRow({ market: "ah", line: -0, selection: "home", price_decimal: 1.92 }),
      makeRow({ market: "ah", line: 0, selection: "home", price_decimal: 1.93 }),
      // Fuera de rango (<1.01 y >1000)
      makeRow({ selection: "home", book: "bet365", price_decimal: 1.0 }),
      makeRow({ selection: "away", book: "bet365", price_decimal: 1000.5 }),
      // Post-kickoff en scraped_ws (ts_captured > ts_event_start)
      makeRow({
        source: "scraped_ws",
        snapshot_stage: "intraday",
        ts_captured: "2025-05-10T15:00:01Z",
        ts_event_start: "2025-05-10T15:00:00Z",
        price_decimal: 2.05,
      }),
      // Exactamente en ts_captured == ts_event_start sí es pre-partido válido
      makeRow({
        source: "scraped_ws",
        snapshot_stage: "intraday",
        ts_captured: "2025-05-10T15:00:00Z",
        ts_event_start: "2025-05-10T15:00:00Z",
        price_decimal: 2.05,
      }),
    ];

    const { rows, stats } = validateAndDeduplicateSnapshots(input);
    expect(stats.n_raw).toBe(10);
    expect(stats.n_out_of_range).toBe(2);
    expect(stats.n_post_kickoff_discarded).toBe(1);
    expect(stats.n_duplicates_removed).toBe(2);
    expect(stats.n_valid).toBe(5);
    expect(rows).toHaveLength(5);

    const ahRow = rows.find((r) => r.market === "ah");
    expect(ahRow?.line).toBe(0);
    expect(Object.is(ahRow?.line, -0)).toBe(false);
  });

  it("detecta huecos estrictamente mayores a 60 minutos por (event_id, market, line, book)", () => {
    const rows: OddsSnapshotRow[] = [
      // Captura 1 a las 10:00Z (3 selecciones simultáneas = 1 sola captura, 0 huecos entre ellas)
      makeRow({ source: "scraped_ws", selection: "home", ts_captured: "2025-05-10T10:00:00Z", price_decimal: 2.1 }),
      makeRow({ source: "scraped_ws", selection: "draw", ts_captured: "2025-05-10T10:00:00Z", price_decimal: 3.4 }),
      makeRow({ source: "scraped_ws", selection: "away", ts_captured: "2025-05-10T10:00:00Z", price_decimal: 3.6 }),
      // Captura 2 a las 11:00Z (exactamente 60.0 min -> NO es hueco > 60 min)
      makeRow({ source: "scraped_ws", selection: "home", ts_captured: "2025-05-10T11:00:00Z", price_decimal: 2.08 }),
      // Captura 3 a las 12:15Z (75.0 min > 60 min -> SÍ se reporta hueco)
      makeRow({ source: "scraped_ws", selection: "home", ts_captured: "2025-05-10T12:15:00Z", price_decimal: 2.04 }),
      // Otra casa con una sola captura a las 09:00Z -> ignorada (< 2 capturas)
      makeRow({ source: "scraped_ws", book: "smarkets", selection: "home", ts_captured: "2025-05-10T09:00:00Z", price_decimal: 2.12 }),
    ];

    const gaps = detectSnapshotGaps(rows);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      event_id: "E0:20250510:arsenal:liverpool",
      book: "pinnacle",
      market: "1x2",
      line: null,
      n_captures: 3,
      prev_ts_captured: "2025-05-10T11:00:00Z",
      next_ts_captured: "2025-05-10T12:15:00Z",
    });
    expect(gaps[0]!.gap_minutes).toBeCloseTo(75.0, 9);
  });

  describe("Regla humana estricta de Cuota de Cierre (historical_fd)", () => {
    it("resuelve cierre de Pinnacle cuando snapshot_stage=='close' y calcula cuota justa sin margen", () => {
      const rows: OddsSnapshotRow[] = [
        // Open de Pinnacle (-24h)
        makeRow({ selection: "home", price_decimal: 2.2, ts_captured: "2025-05-09T15:00:00Z", snapshot_stage: "open" }),
        makeRow({ selection: "draw", price_decimal: 3.5, ts_captured: "2025-05-09T15:00:00Z", snapshot_stage: "open" }),
        makeRow({ selection: "away", price_decimal: 3.3, ts_captured: "2025-05-09T15:00:00Z", snapshot_stage: "open" }),
        // Close de Pinnacle (-1s)
        makeRow({ selection: "home", price_decimal: 2.05, ts_captured: "2025-05-10T14:59:59Z", snapshot_stage: "close" }),
        makeRow({ selection: "draw", price_decimal: 3.5, ts_captured: "2025-05-10T14:59:59Z", snapshot_stage: "close" }),
        makeRow({ selection: "away", price_decimal: 3.85, ts_captured: "2025-05-10T14:59:59Z", snapshot_stage: "close" }),
      ];

      const res = resolveClosingMarket(rows, { devigMethod: "power" });
      expect(res.closing_missing).toBe(false);
      expect(res.closing_book).toBe("pinnacle");
      expect(res.ts_closing).toBe("2025-05-10T14:59:59Z");

      const expectedProbs = devig([2.05, 3.5, 3.85], "power");
      expect(res.selections.home!.p_novig).toBeCloseTo(expectedProbs[0]!, 12);
      expect(res.selections.draw!.p_novig).toBeCloseTo(expectedProbs[1]!, 12);
      expect(res.selections.away!.p_novig).toBeCloseTo(expectedProbs[2]!, 12);
      expect(res.selections.home!.price_novig).toBeCloseTo(1 / expectedProbs[0]!, 12);
      expect(
        res.selections.home!.p_novig + res.selections.draw!.p_novig + res.selections.away!.p_novig,
      ).toBeCloseTo(1.0, 12);
    });

    it("NUNCA usa el open de Pinnacle como cierre si falta el close (con o sin snapshot_stage)", () => {
      const withExplicitStage: OddsSnapshotRow[] = [
        makeRow({ selection: "home", price_decimal: 2.1, ts_captured: "2025-05-09T15:00:00Z", snapshot_stage: "open" }),
        makeRow({ selection: "draw", price_decimal: 3.4, ts_captured: "2025-05-09T15:00:00Z", snapshot_stage: "open" }),
        makeRow({ selection: "away", price_decimal: 3.6, ts_captured: "2025-05-09T15:00:00Z", snapshot_stage: "open" }),
      ];
      const resExplicit = resolveClosingMarket(withExplicitStage);
      expect(resExplicit.closing_missing).toBe(true);
      expect(resExplicit.closing_book).toBeNull();
      expect(resExplicit.missing_reason).toBe("missing_pinnacle_close");

      // Incluso si un fixture crudo de 11 columnas omite `snapshot_stage`, -24h jamás se acepta como cierre
      const withoutStage: OddsSnapshotRow[] = withExplicitStage.map(({ snapshot_stage: _, ...rest }) => rest);
      const resInferred = resolveClosingMarket(withoutStage);
      expect(resInferred.closing_missing).toBe(true);
      expect(resInferred.closing_book).toBeNull();
    });

    it("NUNCA usa betfair_exchange (bfe), bet365, market_avg ni nflverse como cierre en historical_fd", () => {
      const nonPinnacleCloses: OddsSnapshotRow[] = [
        makeRow({ book: "betfair_exchange", selection: "home", price_decimal: 2.08 }),
        makeRow({ book: "betfair_exchange", selection: "draw", price_decimal: 3.55 }),
        makeRow({ book: "betfair_exchange", selection: "away", price_decimal: 3.9 }),
        makeRow({ book: "bet365", selection: "home", price_decimal: 2.0 }),
        makeRow({ book: "bet365", selection: "draw", price_decimal: 3.4 }),
        makeRow({ book: "bet365", selection: "away", price_decimal: 3.75 }),
        makeRow({ book: "market_avg", selection: "home", price_decimal: 2.02 }),
        makeRow({ book: "market_avg", selection: "draw", price_decimal: 3.42 }),
        makeRow({ book: "market_avg", selection: "away", price_decimal: 3.8 }),
      ];

      const res = resolveClosingMarket(nonPinnacleCloses);
      expect(res.closing_missing).toBe(true);
      expect(res.closing_book).toBeNull();
      expect(res.missing_reason).toBe("missing_pinnacle_close");
      expect(Object.keys(res.selections)).toHaveLength(0);
    });
  });

  describe("Regla humana estricta de Cuota de Cierre (scraped_ws)", () => {
    it("elige el último snapshot pre-partido de Pinnacle e ignora ticks post-kickoff", () => {
      const rows: OddsSnapshotRow[] = [
        // T-90 min Pinnacle
        makeRow({
          event_id: "ws:nfl:NFL:20261115:new_orleans_saints:carolina_panthers",
          sport: "nfl",
          league: "NFL",
          market: "moneyline",
          source: "scraped_ws",
          snapshot_stage: "intraday",
          book: "pinnacle",
          selection: "home",
          price_decimal: 1.9,
          ts_captured: "2026-11-15T16:30:00Z",
          ts_event_start: "2026-11-15T18:00:00Z",
        }),
        makeRow({
          event_id: "ws:nfl:NFL:20261115:new_orleans_saints:carolina_panthers",
          sport: "nfl",
          league: "NFL",
          market: "moneyline",
          source: "scraped_ws",
          snapshot_stage: "intraday",
          book: "pinnacle",
          selection: "away",
          price_decimal: 2.0,
          ts_captured: "2026-11-15T16:30:00Z",
          ts_event_start: "2026-11-15T18:00:00Z",
        }),
        // T-5 min Pinnacle (debe ganar este)
        makeRow({
          event_id: "ws:nfl:NFL:20261115:new_orleans_saints:carolina_panthers",
          sport: "nfl",
          league: "NFL",
          market: "moneyline",
          source: "scraped_ws",
          snapshot_stage: "intraday",
          book: "pinnacle",
          selection: "home",
          price_decimal: 1.8547,
          ts_captured: "2026-11-15T17:55:00Z",
          ts_event_start: "2026-11-15T18:00:00Z",
        }),
        makeRow({
          event_id: "ws:nfl:NFL:20261115:new_orleans_saints:carolina_panthers",
          sport: "nfl",
          league: "NFL",
          market: "moneyline",
          source: "scraped_ws",
          snapshot_stage: "intraday",
          book: "pinnacle",
          selection: "away",
          price_decimal: 2.04,
          ts_captured: "2026-11-15T17:55:00Z",
          ts_event_start: "2026-11-15T18:00:00Z",
        }),
        // T+2 min post-kickoff (debe ignorarse)
        makeRow({
          event_id: "ws:nfl:NFL:20261115:new_orleans_saints:carolina_panthers",
          sport: "nfl",
          league: "NFL",
          market: "moneyline",
          source: "scraped_ws",
          snapshot_stage: "intraday",
          book: "pinnacle",
          selection: "home",
          price_decimal: 1.5,
          ts_captured: "2026-11-15T18:02:00Z",
          ts_event_start: "2026-11-15T18:00:00Z",
        }),
        makeRow({
          event_id: "ws:nfl:NFL:20261115:new_orleans_saints:carolina_panthers",
          sport: "nfl",
          league: "NFL",
          market: "moneyline",
          source: "scraped_ws",
          snapshot_stage: "intraday",
          book: "pinnacle",
          selection: "away",
          price_decimal: 2.7,
          ts_captured: "2026-11-15T18:02:00Z",
          ts_event_start: "2026-11-15T18:00:00Z",
        }),
      ];

      const res = resolveClosingMarket(rows, { devigMethod: "power" });
      expect(res.closing_missing).toBe(false);
      expect(res.closing_book).toBe("pinnacle");
      expect(res.ts_closing).toBe("2026-11-15T17:55:00Z");

      const exp2Way = devig2Way(1.8547, 2.04, "power");
      expect(res.selections.home!.p_novig).toBeCloseTo(exp2Way.pHome, 12);
      expect(res.selections.away!.p_novig).toBeCloseTo(exp2Way.pAway, 12);
    });

    it("hace fallback ÚNICAMENTE a smarkets cuando falta Pinnacle y rechaza casas recreativas", () => {
      const smarketsAndRec: OddsSnapshotRow[] = [
        makeRow({
          source: "scraped_ws",
          snapshot_stage: "intraday",
          book: "smarkets",
          selection: "home",
          price_decimal: 1.98,
          ts_captured: "2025-05-10T14:40:00Z",
        }),
        makeRow({
          source: "scraped_ws",
          snapshot_stage: "intraday",
          book: "smarkets",
          selection: "draw",
          price_decimal: 3.6,
          ts_captured: "2025-05-10T14:40:00Z",
        }),
        makeRow({
          source: "scraped_ws",
          snapshot_stage: "intraday",
          book: "smarkets",
          selection: "away",
          price_decimal: 4.1,
          ts_captured: "2025-05-10T14:40:00Z",
        }),
        makeRow({
          source: "scraped_ws",
          snapshot_stage: "intraday",
          book: "caliente",
          selection: "home",
          price_decimal: 1.85,
          ts_captured: "2025-05-10T14:55:00Z",
        }),
      ];

      const resFallback = resolveClosingMarket(smarketsAndRec);
      expect(resFallback.closing_missing).toBe(false);
      expect(resFallback.closing_book).toBe("smarkets");
      expect(resFallback.ts_closing).toBe("2025-05-10T14:40:00Z");

      // Solo casas recreativas (Caliente, DraftKings, FanDuel, Bet365) -> closing_missing = true
      const recOnly: OddsSnapshotRow[] = [
        makeRow({ source: "scraped_ws", snapshot_stage: "intraday", book: "caliente", selection: "home", price_decimal: 1.9 }),
        makeRow({ source: "scraped_ws", snapshot_stage: "intraday", book: "caliente", selection: "draw", price_decimal: 3.4 }),
        makeRow({ source: "scraped_ws", snapshot_stage: "intraday", book: "caliente", selection: "away", price_decimal: 3.8 }),
        makeRow({ source: "scraped_ws", snapshot_stage: "intraday", book: "draftkings", selection: "home", price_decimal: 1.91 }),
        makeRow({ source: "scraped_ws", snapshot_stage: "intraday", book: "draftkings", selection: "draw", price_decimal: 3.45 }),
        makeRow({ source: "scraped_ws", snapshot_stage: "intraday", book: "draftkings", selection: "away", price_decimal: 3.85 }),
      ];

      const resRecOnly = resolveClosingMarket(recOnly);
      expect(resRecOnly.closing_missing).toBe(true);
      expect(resRecOnly.closing_book).toBeNull();
      expect(resRecOnly.missing_reason).toBe("missing_pinnacle_and_smarkets");
    });
  });

  it("mantiene paridad exacta con devig.ts en métodos power, proportional, shin y adaptive (3-way y totals)", () => {
    const d1x2 = devigClosingMarket({ home: 1.95, draw: 3.6, away: 4.2 }, "1x2", "adaptive");
    const refAdaptive = devigAdaptive1X2([1.95, 3.6, 4.2]);
    expect(d1x2.probabilities.home).toBeCloseTo(refAdaptive.pHome, 12);
    expect(d1x2.probabilities.draw).toBeCloseTo(refAdaptive.pDraw, 12);
    expect(d1x2.probabilities.away).toBeCloseTo(refAdaptive.pAway, 12);
    expect(d1x2.fair_prices.home).toBeCloseTo(1 / refAdaptive.pHome, 12);

    const dTotals = devigClosingMarket({ over: 1.91, under: 1.95 }, "totals", "shin");
    const refTotals = devig2Way(1.91, 1.95, "shin");
    expect(dTotals.probabilities.over).toBeCloseTo(refTotals.pHome, 12);
    expect(dTotals.probabilities.under).toBeCloseTo(refTotals.pAway, 12);

    // Resolución multi-mercado en lote
    const batch = resolveClosingSnapshots([
      makeRow({ market: "totals", line: 2.5, selection: "over", price_decimal: 1.91 }),
      makeRow({ market: "totals", line: 2.5, selection: "under", price_decimal: 1.95 }),
      makeRow({ market: "ah", line: -0.5, selection: "home", book: "bet365", price_decimal: 1.9 }),
      makeRow({ market: "ah", line: -0.5, selection: "away", book: "bet365", price_decimal: 1.95 }),
    ]);
    expect(batch).toHaveLength(2);
    const ahRes = batch.find((b) => b.market === "ah")!;
    const totRes = batch.find((b) => b.market === "totals")!;
    expect(ahRes.closing_missing).toBe(true);
    expect(totRes.closing_missing).toBe(false);
    expect(totRes.closing_book).toBe("pinnacle");
  });
});
