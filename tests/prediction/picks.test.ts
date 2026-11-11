import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeSegmentBlendedProbs,
  type BlendWeightsArtifact,
} from "../../src/domain/prediction/blend.js";
import { PickLedger, computeFeaturesHash } from "../../src/domain/prediction/ledger.js";
import {
  HARD_MAX_STAKE_PER_EVENT_U,
  HARD_MAX_STAKE_PER_GLOBAL_DATE_U,
  HARD_MAX_STAKE_PER_LEAGUE_DATE_U,
  HARD_MAX_STAKE_PER_PICK_U,
  ODDS_BUCKETS,
  PICK_TIERS,
  PickCausalityError,
  PickPolicyValidationError,
  classifyOddsBucket,
  computeAdverseSharpTicks1h,
  computeShrunkQuarterKelly,
  computeSubmodelDispersion,
  evaluatePickCandidates,
  selectApprovedPicks,
  toLedgerPickInput,
  validatePickPolicy,
  type PickCandidate,
  type PickPolicy,
  type PortfolioState,
} from "../../src/domain/prediction/picks.js";

function makeTestPolicy(overrides?: Partial<PickPolicy>): PickPolicy {
  return {
    schema_version: "pick_policy_v3_1",
    policy_version: "geodesic_v3.1_test",
    kelly_fraction: 0.25,
    bankroll_unit_pct: 0.01,
    sharp_steam_window_minutes: 60.0,
    sharp_implied_prob_tick: 0.005,
    max_sigma_p: 0.045,
    max_adverse_ticks_1h: 3.5,
    uncertainty_penalty_k: 0.5,
    rho_same_event: 0.35,
    min_stake_u: 0.05,
    allow_pure_market_arb: true,
    unknown_segment_model_picks_enabled: false,
    caps: {
      max_stake_per_pick_u: 2.0,
      max_stake_per_event_u: 2.0,
      max_stake_per_league_date_u: 3.0,
      max_stake_per_global_date_u: 5.0,
    },
    default_buckets: {
      short: { p_edge_min: 0.012, ev_threshold_solido: 0.022, ev_threshold_valor: 0.045 },
      even: { p_edge_min: 0.014, ev_threshold_solido: 0.028, ev_threshold_valor: 0.055 },
      plus: { p_edge_min: 0.015, ev_threshold_solido: 0.035, ev_threshold_valor: 0.068 },
      long: { p_edge_min: 0.016, ev_threshold_solido: 0.048, ev_threshold_valor: 0.085 },
    },
    segments: {
      "MEX::1x2": {
        league: "MEX",
        market: "1x2",
        model_picks_enabled: true,
        w_effective: 0.2,
        best_devig_method: "shin",
        segment_clv_mean: 0.019,
        segment_clv_ci95_low: 0.006,
        segment_clv_ci95_high: 0.032,
        buckets: {
          short: { p_edge_min: 0.012, ev_threshold_solido: 0.022, ev_threshold_valor: 0.045 },
          even: { p_edge_min: 0.014, ev_threshold_solido: 0.028, ev_threshold_valor: 0.055 },
          plus: { p_edge_min: 0.015, ev_threshold_solido: 0.035, ev_threshold_valor: 0.068 },
          long: { p_edge_min: 0.016, ev_threshold_solido: 0.048, ev_threshold_valor: 0.085 },
        },
      },
      "MEX::totals": {
        league: "MEX",
        market: "totals",
        model_picks_enabled: true,
        w_effective: 0.25,
        best_devig_method: "power",
        segment_clv_mean: 0.021,
        segment_clv_ci95_low: 0.005,
        segment_clv_ci95_high: 0.037,
      },
      "E0::1x2": {
        league: "E0",
        market: "1x2",
        model_picks_enabled: true,
        w_effective: 0.15,
        best_devig_method: "power",
        // CLV positivo puntual pero IC 95% cruza 0 -> NO elegible para "solido"
        segment_clv_mean: 0.008,
        segment_clv_ci95_low: -0.003,
        segment_clv_ci95_high: 0.019,
      },
      "NFL::moneyline": {
        league: "NFL",
        market: "moneyline",
        model_picks_enabled: false,
        disabled_reason: "closing_benchmark_unavailable_or_w_zero",
        w_effective: 0.0,
        segment_clv_mean: null,
        segment_clv_ci95_low: null,
      },
    },
    ...overrides,
  };
}

function makeBaseCandidate(overrides?: Partial<PickCandidate>): PickCandidate {
  return {
    candidate_id: "cand-base",
    event_id: "ev-mex-001",
    sport: "football",
    league: "MEX",
    market: "1x2",
    line: null,
    selection: "home",
    book: "caliente_mx",
    price_decimal: 2.0,
    ts_decision: "2026-08-15T18:00:00Z",
    ts_event_start: "2026-08-15T20:00:00Z",
    ts_captured: "2026-08-15T17:58:00Z",
    p_modelo: 0.54,
    p_mercado: 0.515,
    p_final: 0.52,
    submodel_probs: [0.51, 0.525, 0.525],
    sharp_quotes_1h: [
      { book: "pinnacle", price_decimal: 1.96, ts_captured: "2026-08-15T17:10:00Z", selection: "home" },
      { book: "pinnacle", price_decimal: 1.94, ts_captured: "2026-08-15T17:55:00Z", selection: "home" },
    ],
    ...overrides,
  };
}

describe("A5 Motor de decisión de picks (`picks.ts`)", () => {
  it("expone únicamente 2 niveles (`solido` y `valor`) y 4 buckets exactos de cuota", () => {
    expect(PICK_TIERS).toEqual(["solido", "valor"]);
    expect(ODDS_BUCKETS).toEqual(["short", "even", "plus", "long"]);

    expect(classifyOddsBucket(1.01)).toBe("short");
    expect(classifyOddsBucket(1.6499)).toBe("short");
    expect(classifyOddsBucket(1.65)).toBe("even");
    expect(classifyOddsBucket(2.1999)).toBe("even");
    expect(classifyOddsBucket(2.2)).toBe("plus");
    expect(classifyOddsBucket(2.8999)).toBe("plus");
    expect(classifyOddsBucket(2.9)).toBe("long");
    expect(classifyOddsBucket(1000.0)).toBe("long");
    expect(() => classifyOddsBucket(1.005)).toThrow(RangeError);
    expect(() => classifyOddsBucket(1000.1)).toThrow(RangeError);
  });

  it("aplica la Puerta de Segmento (`A4`): rechaza `segment_model_picks_disabled` salvo `allow_pure_market_arb`", () => {
    const policy = makeTestPolicy();
    const disabledCand = makeBaseCandidate({
      candidate_id: "nfl-blocked",
      event_id: "ev-nfl-10",
      sport: "nfl",
      league: "NFL",
      market: "moneyline",
      price_decimal: 2.1,
      p_modelo: 0.53,
      p_mercado: 0.52,
      p_final: 0.525,
    });
    const arbCand = makeBaseCandidate({
      candidate_id: "nfl-pure-arb",
      event_id: "ev-nfl-11",
      sport: "nfl",
      league: "NFL",
      market: "moneyline",
      price_decimal: 2.15,
      p_modelo: 0.5,
      p_mercado: 0.505,
      p_final: 0.505,
      allow_pure_market_arb: true,
    });

    const [resBlocked, resArb] = evaluatePickCandidates([disabledCand, arbCand], policy);
    expect(resBlocked!.approved).toBe(false);
    expect(resBlocked!.rejection_reason).toBe("segment_model_picks_disabled");

    expect(resArb!.approved).toBe(true);
    expect(resArb!.tier).toBe("valor");
    expect(resArb!.stake_u).toBeGreaterThan(0);
  });

  it("Corrección #1: rechaza `below_breakeven` incluso con 80% de probabilidad real si `p_final <= 1 / price_decimal`", () => {
    const policy = makeTestPolicy();
    const highWinRateNegativeEv = makeBaseCandidate({
      candidate_id: "high-prob-bad-price",
      price_decimal: 1.2, // 1 / 1.2 = 0.833333...
      p_modelo: 0.82,
      p_mercado: 0.81,
      p_final: 0.8, // 80% de acierto pero EV = -4%
    });
    const exactBreakeven = makeBaseCandidate({
      candidate_id: "exact-breakeven",
      price_decimal: 2.0,
      p_final: 0.5,
    });
    const tinyEdgeBelowThreshold = makeBaseCandidate({
      candidate_id: "tiny-edge",
      price_decimal: 2.0,
      p_final: 0.51, // EV = +2.0% < 2.8% calibrado en bucket "even"
    });

    const results = evaluatePickCandidates(
      [highWinRateNegativeEv, exactBreakeven, tinyEdgeBelowThreshold],
      policy,
    );
    expect(results[0]!.rejection_reason).toBe("below_breakeven");
    expect(results[1]!.rejection_reason).toBe("below_breakeven");
    expect(results[2]!.rejection_reason).toBe("below_calibrated_ev_threshold");
  });

  it("Corrección #2: elimina Tiro de Cuota Alta, exige `segment_clv_ci95_low > 0` para `solido` y dimensiona cuotas > 2.90 con Kelly ¼", () => {
    const policy = makeTestPolicy();

    // EV moderado (+4.0%) en MEX::1x2 (CLV IC95 low = +0.006 > 0) -> "solido"
    const mexSolido = makeBaseCandidate({
      candidate_id: "mex-solido",
      event_id: "ev-mex-sol",
      league: "MEX",
      price_decimal: 2.0,
      p_final: 0.52, // EV = +4.0% in [2.8%, 5.5%)
    });

    // Mismo EV moderado (+4.0%) en E0::1x2 (CLV IC95 low = -0.003 <= 0) -> rechazado
    const eplUnprovenClv = makeBaseCandidate({
      candidate_id: "epl-no-solido",
      event_id: "ev-epl-1",
      league: "E0",
      price_decimal: 2.0,
      p_final: 0.52,
    });

    // Cuota larga > 2.90 (bucket "long", 3.50) con EV alto (+12.0% >= 8.5%) en E0::1x2 -> "valor" con Kelly ¼
    const eplLongValor = makeBaseCandidate({
      candidate_id: "epl-long-valor",
      event_id: "ev-epl-2",
      league: "E0",
      price_decimal: 3.5,
      p_modelo: 0.33,
      p_mercado: 0.31,
      p_final: 0.32, // 1/3.5 = 0.285714..., EV = +12.0%
      submodel_probs: [0.315, 0.32, 0.325],
      sharp_quotes_1h: [
        { book: "pinnacle", price_decimal: 3.4, ts_captured: "2026-08-15T17:15:00Z", selection: "home" },
        { book: "pinnacle", price_decimal: 3.35, ts_captured: "2026-08-15T17:55:00Z", selection: "home" },
      ],
    });

    const [rMex, rEplRej, rEplLong] = evaluatePickCandidates(
      [mexSolido, eplUnprovenClv, eplLongValor],
      policy,
    );

    expect(rMex!.approved).toBe(true);
    expect(rMex!.tier).toBe("solido");

    expect(rEplRej!.approved).toBe(false);
    expect(rEplRej!.rejection_reason).toBe("solido_clv_ci95_not_positive");

    expect(rEplLong!.approved).toBe(true);
    expect(rEplLong!.odds_bucket).toBe("long");
    expect(rEplLong!.tier).toBe("valor");
    expect(rEplLong!.stake_u).toBeCloseTo(rEplLong!.stake_raw_u, 12);
  });

  it("filtra dispersión `sigma_p = std_pop(...)`, movimiento adverso sharp en 60m, incertidumbre y fugas causales", () => {
    const policy = makeTestPolicy();

    // std_pop([0.44, 0.52, 0.60]) = sqrt((( -0.08)^2 + 0 + 0.08^2)/3) = 0.0653197 > 0.045
    const highDisp = makeBaseCandidate({
      candidate_id: "disp-fail",
      event_id: "ev-d1",
      price_decimal: 2.05,
      p_final: 0.53,
      submodel_probs: { p_logit: 0.44, p_gbm: 0.52, p_dixon_coles: 0.6 },
    });
    expect(computeSubmodelDispersion(highDisp)).toBeCloseTo(Math.sqrt((0.0064 + 0 + 0.0064) / 3), 14);

    // Movimiento sharp EN CONTRA: Pinnacle sube de 1.95 (51.28%) a 2.06 (48.54%) -> caída 2.74 pp = 5.48 ticks > 3.5
    const adverseSteam = makeBaseCandidate({
      candidate_id: "steam-fail",
      event_id: "ev-s1",
      price_decimal: 2.05,
      p_final: 0.53,
      submodel_probs: [0.525, 0.53, 0.535],
      sharp_quotes_1h: [
        { book: "pinnacle", price_decimal: 1.95, ts_captured: "2026-08-15T17:05:00Z", selection: "home" },
        { book: "pinnacle", price_decimal: 2.06, ts_captured: "2026-08-15T17:58:00Z", selection: "home" },
      ],
    });

    // Incertidumbre borra el edge: p_final=0.515, price=2.00 (1/price=0.50, ev=+3.0% >= 2.8%),
    // sigma_p=0.035 (<= 0.045), k=0.5 => p_shrunk = 0.515 - 0.0175 = 0.4975 <= 0.50 -> uncertainty_erased_edge
    const erasedEdge = makeBaseCandidate({
      candidate_id: "uncertainty-erased",
      event_id: "ev-u1",
      price_decimal: 2.0,
      p_final: 0.515,
      sigma_p: 0.035,
      submodel_probs: null,
    });

    const [rDisp, rSteam, rErased] = evaluatePickCandidates([highDisp, adverseSteam, erasedEdge], policy);
    expect(rDisp!.rejection_reason).toBe("high_submodel_dispersion");
    expect(rSteam!.rejection_reason).toBe("adverse_sharp_steam");
    expect(rSteam!.adverse_ticks_1h).toBeCloseTo((1 / 1.95 - 1 / 2.06) / 0.005, 12);
    expect(rErased!.rejection_reason).toBe("uncertainty_erased_edge");

    // Guardia anti-fuga: tick sharp posterior a ts_decision lanza PickCausalityError
    expect(() =>
      computeAdverseSharpTicks1h(
        [{ book: "pinnacle", price_decimal: 2.0, ts_captured: "2026-08-15T18:00:01Z" }],
        "2026-08-15T18:00:00Z",
      ),
    ).toThrow(PickCausalityError);

    expect(() =>
      evaluatePickCandidates(
        [makeBaseCandidate({ ts_decision: "2026-08-15T20:01:00Z", ts_event_start: "2026-08-15T20:00:00Z" })],
        policy,
      ),
    ).toThrow(PickCausalityError);

    expect(() =>
      evaluatePickCandidates([makeBaseCandidate()], makeTestPolicy({ kelly_fraction: 0.5 })),
    ).toThrow(PickPolicyValidationError);
  });

  it("aplica correlación por `event_id` (mejor `g`, reducción `1 - |rho|`) y los 4 topes duros (`2u / 2u / 3u / 5u`)", () => {
    // Incluso si se intenta relajar caps en policy, los 4 techos duros mandan
    const policy = makeTestPolicy({
      caps: {
        max_stake_per_pick_u: 9.0,
        max_stake_per_event_u: 9.0,
        max_stake_per_league_date_u: 9.0,
        max_stake_per_global_date_u: 9.0,
      },
      segments: {
        ...makeTestPolicy().segments,
        "MEX::btts": {
          league: "MEX",
          market: "btts",
          model_picks_enabled: true,
          segment_clv_mean: 0.02,
          segment_clv_ci95_low: 0.004,
        },
        "BRA::1x2": {
          league: "BRA",
          market: "1x2",
          model_picks_enabled: true,
          segment_clv_mean: 0.025,
          segment_clv_ci95_low: 0.01,
        },
      },
    });

    const candidates: PickCandidate[] = [
      // #3 en g dentro de MEX: mismo partido ev-mex-100 y mismo mercado 1x2 -> correlated_same_event_market
      makeBaseCandidate({
        candidate_id: "ev100-1x2-weaker",
        event_id: "ev-mex-100",
        league: "MEX",
        market: "1x2",
        selection: "away",
        price_decimal: 2.0,
        p_final: 0.528,
        submodel_probs: [0.526, 0.528, 0.53],
      }),
      // #1 en g dentro de MEX: toma ~1.56u (< 2.0u) en ev-mex-100::1x2
      makeBaseCandidate({
        candidate_id: "ev100-1x2-strong",
        event_id: "ev-mex-100",
        league: "MEX",
        market: "1x2",
        selection: "home",
        price_decimal: 2.0,
        p_final: 0.532,
        submodel_probs: [0.53, 0.532, 0.534],
      }),
      // #2 en g dentro de MEX: 2do mercado totals en ev-mex-100 -> reducido por 0.65 y recortado a suma exacta 2.0u
      makeBaseCandidate({
        candidate_id: "ev100-totals",
        event_id: "ev-mex-100",
        league: "MEX",
        market: "totals",
        line: 2.5,
        selection: "over",
        price_decimal: 2.0,
        p_final: 0.53,
        submodel_probs: [0.528, 0.53, 0.532],
        sharp_quotes_1h: [],
      }),
      // #4 en g dentro de MEX: 3er mercado btts en ev-mex-100 -> evento ya alcanzó 2.0u -> cap_event_exhausted
      makeBaseCandidate({
        candidate_id: "ev100-btts-exhausted",
        event_id: "ev-mex-100",
        league: "MEX",
        market: "btts",
        line: null,
        selection: "yes",
        price_decimal: 2.0,
        p_final: 0.526,
        submodel_probs: [0.524, 0.526, 0.528],
        sharp_quotes_1h: [],
      }),
      // #5 en g dentro de MEX: otro partido ev-mex-101 -> completa MEX hasta 3.0u
      makeBaseCandidate({
        candidate_id: "ev101-mex-daycap",
        event_id: "ev-mex-101",
        league: "MEX",
        market: "1x2",
        selection: "home",
        price_decimal: 2.0,
        p_final: 0.525,
        submodel_probs: [0.523, 0.525, 0.527],
      }),
      // #6 en g dentro de MEX: liga MEX ya llegó a 3.0u -> cap_league_date_exhausted
      makeBaseCandidate({
        candidate_id: "ev102-mex-exhausted",
        event_id: "ev-mex-102",
        league: "MEX",
        market: "1x2",
        selection: "home",
        price_decimal: 2.0,
        p_final: 0.522,
        submodel_probs: [0.52, 0.522, 0.524],
      }),
      // Mayor g del día en BRA: stake_raw ~2.46u > 2.0u -> tope por pick <= 2.0u
      makeBaseCandidate({
        candidate_id: "ev201-bra-cap2u",
        event_id: "ev-bra-201",
        league: "BRA",
        market: "1x2",
        selection: "home",
        price_decimal: 2.0,
        p_final: 0.55,
        submodel_probs: [0.548, 0.55, 0.552],
      }),
      // Menor g global del día en BRA: BRA lleva 2.0u (< 3.0u), pero global día ya llegó a 5.0u (3.0 MEX + 2.0 BRA)
      makeBaseCandidate({
        candidate_id: "ev202-bra-global-exhausted",
        event_id: "ev-bra-202",
        league: "BRA",
        market: "1x2",
        selection: "home",
        price_decimal: 2.0,
        p_final: 0.521,
        submodel_probs: [0.519, 0.521, 0.523],
      }),
    ];

    const decisions = evaluatePickCandidates(candidates, policy);
    const byId = new Map(decisions.map((d) => [d.candidate_id, d]));

    expect(byId.get("ev100-1x2-weaker")!.rejection_reason).toBe("correlated_same_event_market");
    expect(byId.get("ev100-1x2-strong")!.approved).toBe(true);
    expect(byId.get("ev100-totals")!.approved).toBe(true);
    expect(byId.get("ev100-totals")!.correlation_multiplier).toBeCloseTo(0.65, 12);
    expect(byId.get("ev100-btts-exhausted")!.rejection_reason).toBe("cap_event_exhausted");

    const ev100Sum = byId.get("ev100-1x2-strong")!.stake_u + byId.get("ev100-totals")!.stake_u;
    expect(ev100Sum).toBeLessThanOrEqual(HARD_MAX_STAKE_PER_EVENT_U);
    expect(ev100Sum).toBeCloseTo(2.0, 12);

    expect(byId.get("ev101-mex-daycap")!.approved).toBe(true);
    const mexDaySum = ev100Sum + byId.get("ev101-mex-daycap")!.stake_u;
    expect(mexDaySum).toBeLessThanOrEqual(HARD_MAX_STAKE_PER_LEAGUE_DATE_U);
    expect(mexDaySum).toBeCloseTo(3.0, 12);

    expect(byId.get("ev102-mex-exhausted")!.rejection_reason).toBe("cap_league_date_exhausted");

    expect(byId.get("ev201-bra-cap2u")!.approved).toBe(true);
    expect(byId.get("ev201-bra-cap2u")!.stake_u).toBeLessThanOrEqual(HARD_MAX_STAKE_PER_PICK_U);
    expect(byId.get("ev201-bra-cap2u")!.stake_u).toBeCloseTo(2.0, 12);

    const globalDaySum = decisions.reduce((acc, d) => acc + d.stake_u, 0);
    expect(globalDaySum).toBeLessThanOrEqual(HARD_MAX_STAKE_PER_GLOBAL_DATE_U);
    expect(globalDaySum).toBeCloseTo(5.0, 12);
    expect(byId.get("ev202-bra-global-exhausted")!.rejection_reason).toBe("cap_global_date_exhausted");

    // Inmutabilidad y puente directo a `PickLedger` (`a2-ledger`)
    expect(Object.isFrozen(decisions[0])).toBe(true);
    const approved = selectApprovedPicks(candidates, policy);
    const ledger = new PickLedger();
    const fh = computeFeaturesHash({ test: 1 });
    const entry = ledger.appendPick(
      toLedgerPickInput(approved[0]!, {
        pick_id: "pk-a5-bridge-1",
        ts_emitido: "2026-08-15T18:00:00Z",
        version_modelo: "geodesic_v3.1",
        features_hash: fh,
      }),
    );
    expect(entry.tier).toBe("valor");
    expect(entry.stake_u).toBe(approved[0]!.stake_u);
  });

  it("verifica vector dorado exacto (`|Δ| < 1e-12`) idéntico a `services/models/test_picks_parity.py`", () => {
    const policy = makeTestPolicy();
    const portfolio: PortfolioState = {
      open_picks: [
        {
          event_id: "ev-prior-1",
          league: "MEX",
          market: "1x2",
          utc_date: "2026-08-20",
          stake_u: 1.25,
        },
      ],
    };

    const goldenCandidates: PickCandidate[] = [
      {
        candidate_id: "g1",
        event_id: "ev-g-1",
        sport: "football",
        league: "MEX",
        market: "1x2",
        line: null,
        selection: "home",
        book: "caliente_mx",
        price_decimal: 2.05,
        ts_decision: "2026-08-20T18:00:00Z",
        ts_event_start: "2026-08-20T20:00:00Z",
        p_modelo: 0.545,
        p_mercado: 0.515,
        p_final: 0.525,
        submodel_probs: [0.515, 0.525, 0.535],
        sharp_quotes_1h: [
          { book: "pinnacle", price_decimal: 1.98, ts_captured: "2026-08-20T17:10:00Z", selection: "home" },
          { book: "pinnacle", price_decimal: 2.0, ts_captured: "2026-08-20T17:55:00Z", selection: "home" },
        ],
      },
      {
        candidate_id: "g2",
        event_id: "ev-g-1",
        sport: "football",
        league: "MEX",
        market: "totals",
        line: 2.5,
        selection: "over",
        book: "b365",
        price_decimal: 1.95,
        ts_decision: "2026-08-20T18:00:00Z",
        ts_event_start: "2026-08-20T20:00:00Z",
        p_modelo: 0.56,
        p_mercado: 0.53,
        p_final: 0.54,
        submodel_probs: [0.535, 0.54, 0.545],
        sharp_quotes_1h: [],
      },
      {
        candidate_id: "g3",
        event_id: "ev-g-2",
        sport: "football",
        league: "E0",
        market: "1x2",
        line: null,
        selection: "away",
        book: "b365",
        price_decimal: 3.4,
        ts_decision: "2026-08-20T18:00:00Z",
        ts_event_start: "2026-08-20T20:00:00Z",
        p_modelo: 0.34,
        p_mercado: 0.315,
        p_final: 0.325,
        submodel_probs: [0.318, 0.325, 0.332],
        sharp_quotes_1h: [
          { book: "smarkets", price_decimal: 3.25, ts_captured: "2026-08-20T17:20:00Z", selection: "away" },
          { book: "smarkets", price_decimal: 3.3, ts_captured: "2026-08-20T17:50:00Z", selection: "away" },
        ],
      },
    ];

    const res = evaluatePickCandidates(goldenCandidates, policy, portfolio);
    const k0 = computeShrunkQuarterKelly(
      0.525,
      2.05,
      computeSubmodelDispersion(goldenCandidates[0]!)!,
      0.5,
    );
    expect(Math.abs(res[0]!.sigma_p - 0.008164965809277268)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(res[0]!.adverse_ticks_1h - 1.0101010101010166)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(res[0]!.p_shrunk - 0.5209175170953614)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(res[0]!.f_quarter - k0.f_quarter)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(res[0]!.stake_raw_u - 1.616212143940257)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(res[0]!.expected_log_growth_g - 0.00095967427269585)).toBeLessThanOrEqual(1e-12);
    expect(res[0]!.tier).toBe("valor");
    expect(res[0]!.allocation_rank).toBe(1);
    expect(Math.abs(res[0]!.stake_u - 1.616212143940257)).toBeLessThanOrEqual(1e-12);

    // g2 es el segundo mercado de ev-g-1 (corr_mult = 0.65), y además MEX::2026-08-20 ya tenía 1.25u + 1.616212143940257u = 2.866212143940257u -> queda 0.13378785605974297u!
    expect(res[1]!.approved).toBe(true);
    expect(res[1]!.tier).toBe("solido");
    expect(res[1]!.cap_applied).toBe(true);
    expect(res[1]!.allocation_rank).toBe(3);
    expect(Math.abs(res[1]!.correlation_multiplier - 0.65)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(res[1]!.stake_u - 0.13378785605974297)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(res[1]!.expected_log_growth_g - 0.00035977556240808804)).toBeLessThanOrEqual(1e-12);

    // g3 cuota 3.40 (bucket "long") en E0::1x2 -> aprobado como "valor" con Kelly ¼ exacto
    expect(res[2]!.approved).toBe(true);
    expect(res[2]!.odds_bucket).toBe("long");
    expect(res[2]!.tier).toBe("valor");
    expect(res[2]!.allocation_rank).toBe(2);
    expect(Math.abs(res[2]!.adverse_ticks_1h - 0.9324009324009341)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(res[2]!.stake_u - 0.9925384446558331)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(res[2]!.expected_log_growth_g - 0.0008221440727986615)).toBeLessThanOrEqual(1e-12);
  });

  it("8. Artefacto congelado pick_policy_v3_1.json mantiene copia exacta byte-a-byte entre Python y TS", () => {
    const pyPath = resolve(process.cwd(), "services/models/artifacts/pick_policy_v3_1.json");
    const tsPath = resolve(process.cwd(), "src/data/prediction/pick_policy_v3_1.json");
    if (existsSync(pyPath) || existsSync(tsPath)) {
      expect(existsSync(pyPath)).toBe(true);
      expect(existsSync(tsPath)).toBe(true);
      const rawPy = readFileSync(pyPath);
      const rawTs = readFileSync(tsPath);
      expect(rawPy.equals(rawTs)).toBe(true);

      const parsed = JSON.parse(rawTs.toString("utf8")) as PickPolicy & {
        holdout_sealed_untouched?: boolean;
      };
      validatePickPolicy(parsed);
      expect(parsed.holdout_sealed_untouched).toBe(true);

      // Verificar que evaluatePickCandidates consume el JSON congelado sin errores
      const out = evaluatePickCandidates([makeBaseCandidate()], parsed);
      expect(out).toHaveLength(1);
    }
  });

  it("9. Integración directa A4 (blend.ts) -> A5 (picks.ts) sobre artefactos reales v3.1", () => {
    const blendTsPath = resolve(process.cwd(), "src/data/prediction/blend_weights_v3_1.json");
    const policyTsPath = resolve(process.cwd(), "src/data/prediction/pick_policy_v3_1.json");
    if (existsSync(blendTsPath) && existsSync(policyTsPath)) {
      const blendArt = JSON.parse(readFileSync(blendTsPath, "utf8")) as BlendWeightsArtifact;
      const policyArt = JSON.parse(readFileSync(policyTsPath, "utf8")) as PickPolicy;

      // Segmento habilitado en A4 (G1::1x2)
      const g1Blend = computeSegmentBlendedProbs({
        artifact: blendArt,
        league: "G1",
        market: "1x2",
        modelProbs: { home: 0.62, draw: 0.22, away: 0.16 },
        marketRawOdds: { home: 1.98, draw: 3.45, away: 4.10 },
      });
      expect(g1Blend.model_picks_enabled).toBe(true);

      // Segmento apagado en A4 (NFL::moneyline) sin arbitraje puro
      const nflBlend = computeSegmentBlendedProbs({
        artifact: blendArt,
        league: "NFL",
        market: "moneyline",
        modelProbs: { home: 0.65, away: 0.35 },
        marketRawOdds: { home: 1.90, away: 1.92 },
      });
      expect(nflBlend.model_picks_enabled).toBe(false);

      const decisions = evaluatePickCandidates(
        [
          makeBaseCandidate({
            candidate_id: "g1-enabled",
            event_id: "ev-g1-900",
            league: "G1",
            market: "1x2",
            selection: "home",
            price_decimal: 2.18,
            p_modelo: g1Blend.model_probs_by_selection.home!,
            p_mercado: g1Blend.market_novig_by_selection.home!,
            p_final: g1Blend.probabilities_by_selection.home!,
            submodel_probs: [0.61, 0.62, 0.63],
            allow_pure_market_arb: false,
          }),
          makeBaseCandidate({
            candidate_id: "nfl-disabled",
            event_id: "ev-nfl-901",
            sport: "nfl",
            league: "NFL",
            market: "moneyline",
            selection: "home",
            price_decimal: 2.05,
            p_modelo: nflBlend.model_probs_by_selection.home!,
            p_mercado: nflBlend.market_novig_by_selection.home!,
            p_final: 0.56,
            submodel_probs: [0.55, 0.56, 0.57],
            allow_pure_market_arb: false,
          }),
        ],
        policyArt,
      );

      expect(decisions[0]!.approved).toBe(true);
      expect(decisions[0]!.tier === "solido" || decisions[0]!.tier === "valor").toBe(true);
      expect(decisions[1]!.approved).toBe(false);
      expect(decisions[1]!.rejection_reason).toBe("segment_model_picks_disabled");
    }
  });
});
