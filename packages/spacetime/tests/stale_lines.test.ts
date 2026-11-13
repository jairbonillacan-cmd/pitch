import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { computeFeaturesHash, PickLedger } from "../src/ledger";
import {
  HARD_MAX_STAKE_PER_EVENT_U,
  HARD_MAX_STAKE_PER_GLOBAL_DATE_U,
  HARD_MAX_STAKE_PER_LEAGUE_DATE_U,
  HARD_MAX_STAKE_PER_PICK_U,
} from "../src/picks";
import {
  StaleLineCausalityError,
  StaleLineConfigValidationError,
  blendConfirmationProbabilities,
  blendScalarConfirmationProb,
  canonicalStaleBook,
  computeExpectedEdgeSurvival,
  computePollingSurvivalFactor,
  deriveRecommendedScrapingCadence,
  devigSharpMarketPrices,
  evaluateStaleLineBatch,
  evaluateStaleLineCandidate,
  isRecreationalBook,
  isSharpReferenceBook,
  measureSnapshotCaptureCadence,
  staleDecisionToLedgerPickInput,
  validateStaleLinesConfig,
  type ScrapingCadenceFormulaInput,
  type SnapshotTimestampRecord,
  type StaleLineCandidate,
  type StaleLineDecisionResult,
  type StaleLinesConfig,
} from "../src/stale_lines";

function makeTestStaleConfig(overrides?: Partial<StaleLinesConfig>): StaleLinesConfig {
  return {
    schema_version: "stale_lines_v1.0.0",
    config_version: "stale_lines_test_v1",
    holdout_sealed_untouched: true,
    signal_mode: "double_confirmation",
    stale_prob_margin: 0.015,
    stale_ev_threshold: 0.035,
    stale_ev_threshold_valor: 0.065,
    min_model_prob_edge: 0.002,
    model_agreement_tolerance: 0.05,
    default_model_blend_weight: 0.3,
    default_devig_method: "power",
    max_sharp_quote_age_minutes: 180.0,
    max_sigma_p: 0.06,
    max_adverse_ticks_1h: 3.0,
    sharp_steam_window_minutes: 60.0,
    sharp_implied_prob_tick: 0.005,
    uncertainty_penalty_k: 0.5,
    kelly_fraction: 0.25,
    bankroll_unit_pct: 0.01,
    min_stake_u: 0.05,
    rho_same_event: 0.35,
    fallback_sigma_p: 0.02,
    allow_unlisted_segments: true,
    caps: {
      max_stake_per_pick_u: 2.0,
      max_stake_per_event_u: 2.0,
      max_stake_per_league_date_u: 3.0,
      max_stake_per_global_date_u: 5.0,
    },
    segments: {
      "E0::1x2": {
        league: "E0",
        market: "1x2",
        enabled: true,
        best_devig_method: "power",
        w_model: 0.25,
        segment_clv_mean: 0.052,
        segment_clv_ci95_low: 0.018,
        segment_clv_ci95_high: 0.086,
      },
      "NFL::moneyline": {
        league: "NFL",
        market: "moneyline",
        enabled: true,
        best_devig_method: "power",
        w_model: 0.2,
        segment_clv_mean: 0.041,
        segment_clv_ci95_low: -0.004,
        segment_clv_ci95_high: 0.089,
      },
    },
    ...overrides,
  };
}

function makeBaseStaleCandidate(overrides?: Partial<StaleLineCandidate>): StaleLineCandidate {
  return {
    candidate_id: "cand-e0-stale-1",
    event_id: "football:e0_ars_che_2024",
    sport: "football",
    league: "E0",
    market: "1x2",
    line: null,
    selection: "home",
    recreational_book: "bet365",
    price_recreational: 2.15,
    ts_decision: "2024-11-10T15:30:00Z",
    ts_event_start: "2024-11-10T16:30:00Z",
    ts_recreational_captured: "2024-11-10T15:25:00Z",
    sharp_book: "pinnacle",
    ts_sharp_captured: "2024-11-10T15:28:00Z",
    sharp_market_odds: [1.95, 3.6, 4.1],
    devig_method: "power",
    p_modelo: 0.51,
    model_market_probs: [0.51, 0.27, 0.22],
    submodel_probs: [0.5, 0.51, 0.52],
    sharp_quotes_1h: [
      { book: "pinnacle", price_decimal: 1.98, ts_captured: "2024-11-10T14:40:00Z" },
      { book: "pinnacle", price_decimal: 1.95, ts_captured: "2024-11-10T15:28:00Z" },
    ],
    ...overrides,
  };
}

function resolvePythonExe(): string | null {
  const candidates = [
    resolve(process.cwd(), "research/prediction-lab/.venv/Scripts/python.exe"),
    resolve(process.cwd(), "research/prediction-lab/.venv/bin/python"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

describe("A8 · Detector de líneas rezagadas (stale_lines.ts) y cadencia matemática", () => {
  it("1. Normaliza skins recreativas MX/US/EU y separa estrictamente casas sharp vs recreativas", () => {
    expect(canonicalStaleBook("Caliente_MX")).toBe("caliente");
    expect(canonicalStaleBook("codere.mx")).toBe("codere");
    expect(canonicalStaleBook("bet365 nj")).toBe("b365");
    expect(canonicalStaleBook("dk nj")).toBe("draftkings");
    expect(canonicalStaleBook("fanduel nj")).toBe("fanduel");
    expect(canonicalStaleBook("william_hill")).toBe("wh");
    expect(canonicalStaleBook("Pinnacle_Sports")).toBe("pinnacle");

    expect(isSharpReferenceBook("pinnacle")).toBe(true);
    expect(isSharpReferenceBook("smarkets")).toBe(true);
    expect(isSharpReferenceBook("caliente")).toBe(false);

    expect(isRecreationalBook("caliente")).toBe(true);
    expect(isRecreationalBook("bet365 nj")).toBe(true);
    expect(isRecreationalBook("pinnacle")).toBe(false);
    expect(isRecreationalBook("bfe")).toBe(false);
    expect(isRecreationalBook("polymarket")).toBe(false);
  });

  it("2. Guardias duras de causalidad rechazan fugas temporales a microsegundos UTC", () => {
    const cfg = makeTestStaleConfig();

    // Captura sharp posterior a ts_decision -> StaleLineCausalityError
    expect(() =>
      evaluateStaleLineCandidate(
        makeBaseStaleCandidate({ ts_sharp_captured: "2024-11-10T15:30:00.000001Z" }),
        cfg,
      ),
    ).toThrow(StaleLineCausalityError);

    // Captura recreativa posterior a ts_decision -> StaleLineCausalityError
    expect(() =>
      evaluateStaleLineCandidate(
        makeBaseStaleCandidate({ ts_recreational_captured: "2024-11-10T15:30:01Z" }),
        cfg,
      ),
    ).toThrow(StaleLineCausalityError);

    // ts_decision posterior al inicio del partido -> StaleLineCausalityError
    expect(() =>
      evaluateStaleLineCandidate(
        makeBaseStaleCandidate({
          ts_decision: "2024-11-10T16:30:01Z",
          ts_event_start: "2024-11-10T16:30:00Z",
        }),
        cfg,
      ),
    ).toThrow(StaleLineCausalityError);

    // Fuga en sharp_quotes_1h -> StaleLineCausalityError
    expect(() =>
      evaluateStaleLineCandidate(
        makeBaseStaleCandidate({
          sharp_quotes_1h: [
            { book: "pinnacle", price_decimal: 1.95, ts_captured: "2024-11-10T15:31:00Z" },
          ],
        }),
        cfg,
      ),
    ).toThrow(StaleLineCausalityError);
  });

  it("3. Compara Señal Simple (solo-sharp) vs Doble Confirmación (sharp + modelo) sobre el mismo candidato", () => {
    const cfg = makeTestStaleConfig();

    // Caso A: Tanto Pinnacle (p_sharp_novig ~ 0.4959 vs 1/2.15 = 0.4651 -> +3.08pp, EV +6.62%) como el modelo (0.51) confirman
    const bothConfirm = evaluateStaleLineCandidate(makeBaseStaleCandidate(), cfg);
    expect(bothConfirm.approved).toBe(true);
    expect(bothConfirm.cond1_stale_line).toBe(true);
    expect(bothConfirm.cond2_model_confirms).toBe(true);
    expect(bothConfirm.tier === "solido" || bothConfirm.tier === "valor").toBe(true);
    expect(bothConfirm.stale_prob_margin_obs).toBeGreaterThan(0.03);
    expect(bothConfirm.stale_ev_sharp).toBeGreaterThan(0.065);

    // Caso B: Línea recreativa rezagada frente a Pinnacle, pero el modelo está DEBAJO del punto de equilibrio (0.45 <= 1/2.15)
    const modelDisagreesCand = makeBaseStaleCandidate({
      candidate_id: "cand-model-below-be",
      p_modelo: 0.45,
      model_market_probs: [0.45, 0.3, 0.25],
    });
    const resDouble = evaluateStaleLineCandidate(modelDisagreesCand, cfg, {
      overrideSignalMode: "double_confirmation",
    });
    const resSimple = evaluateStaleLineCandidate(modelDisagreesCand, cfg, {
      overrideSignalMode: "simple_sharp",
    });

    expect(resDouble.approved).toBe(false);
    expect(resDouble.cond1_stale_line).toBe(true);
    expect(resDouble.cond2_model_confirms).toBe(false);
    expect(resDouble.rejection_reason).toBe("model_below_recreational_breakeven");

    // En modo Señal Simple solo-sharp sí se aprueba porque Condición 1 se cumple
    expect(resSimple.approved).toBe(true);
    expect(resSimple.cond1_stale_line).toBe(true);
    expect(resSimple.cond2_model_confirms).toBe(false);

    // Caso C: Modelo supera breakeven pero contradice fuertemente a sharp más allá de model_agreement_tolerance
    const strongContradiction = evaluateStaleLineCandidate(
      makeBaseStaleCandidate({
        p_sharp_novig: 0.62,
        sharp_market_novig_probs: [0.62, 0.22, 0.16],
        price_recreational: 2.05,
        p_modelo: 0.5, // > 1/2.05 (0.4878), pero 0.50 < 0.62 - 0.05 = 0.57
        model_market_probs: [0.5, 0.28, 0.22],
      }),
      cfg,
    );
    expect(strongContradiction.approved).toBe(false);
    expect(strongContradiction.rejection_reason).toBe("model_contradicts_sharp");
  });

  it("4. Respeta guardia de vejez sharp, topes duros A5 (2u/2u/3u/5u), Kelly <= 0.25 e integración con ledger", () => {
    expect(() => makeTestStaleConfig({ kelly_fraction: 0.3 })).not.toThrow();
    expect(() => validateStaleLinesConfig(makeTestStaleConfig({ kelly_fraction: 0.3 }))).toThrow(
      StaleLineConfigValidationError,
    );

    const cfg = makeTestStaleConfig();

    // Ancla sharp de hace 1200 min (> 180 min) es rechazada con sharp_reference_too_old
    const oldSharp = evaluateStaleLineCandidate(
      makeBaseStaleCandidate({
        ts_sharp_captured: "2024-11-09T19:00:00Z",
        ts_decision: "2024-11-10T15:30:00Z",
      }),
      cfg,
    );
    expect(oldSharp.approved).toBe(false);
    expect(oldSharp.rejection_reason).toBe("sharp_reference_too_old");

    // Verificar topes de portafolio en lote de 4 eventos de la misma liga y fecha
    const batchCands: StaleLineCandidate[] = [0, 1, 2, 3].map((i) =>
      makeBaseStaleCandidate({
        candidate_id: `batch-${i}`,
        event_id: `ev-cap-${i}`,
        price_recreational: 2.35,
        p_sharp_novig: 0.56,
        sharp_market_novig_probs: [0.56, 0.24, 0.2],
        p_modelo: 0.58,
        model_market_probs: [0.58, 0.23, 0.19],
        submodel_probs: [0.575, 0.58, 0.585],
      }),
    );

    const batchRes = evaluateStaleLineBatch(batchCands, cfg);
    const approved = batchRes.filter((d) => d.approved);
    const totalLeagueStake = approved.reduce((acc, d) => acc + d.stake_u, 0);

    for (const d of approved) {
      expect(d.stake_u).toBeLessThanOrEqual(HARD_MAX_STAKE_PER_PICK_U + 1e-12);
      expect(d.stake_u).toBeLessThanOrEqual(HARD_MAX_STAKE_PER_EVENT_U + 1e-12);
    }
    expect(totalLeagueStake).toBeLessThanOrEqual(HARD_MAX_STAKE_PER_LEAGUE_DATE_U + 1e-12);
    expect(totalLeagueStake).toBeLessThanOrEqual(HARD_MAX_STAKE_PER_GLOBAL_DATE_U + 1e-12);
    expect(batchRes.some((d) => d.rejection_reason === "cap_league_date_exhausted")).toBe(true);

    // Verificar conversión limpia a PickLedger inmutable
    const ledger = new PickLedger();
    const firstApproved = approved[0]!;
    const ledgerInput = staleDecisionToLedgerPickInput(firstApproved, {
      pick_id: "pick-a8-001",
      ts_emitido: "2024-11-10T15:30:00Z",
      version_modelo: "spacetime_v3.1_stale_lines_a8",
      features_hash: computeFeaturesHash({ cand: firstApproved.candidate_id }),
    });
    const entry = ledger.appendPick(ledgerInput);
    expect(entry.book).toBe("b365");
    expect(ledger.verifyIntegrity()).toBe(true);
  });

  it("5. Mide intervalos reales entre capturas y deriva matemáticamente la cadencia óptima sin números mágicos", () => {
    const sampleSnaps: SnapshotTimestampRecord[] = [
      {
        event_id: "ws:nfl:20261115:ari:sea",
        market: "moneyline",
        line: null,
        selection: "home",
        book: "pinnacle",
        price_decimal: 4.35,
        ts_captured: "2026-11-09T18:46:13Z",
        ts_event_start: "2026-11-15T21:05:00Z",
      },
      {
        event_id: "ws:nfl:20261115:ari:sea",
        market: "moneyline",
        line: null,
        selection: "home",
        book: "pinnacle",
        price_decimal: 4.42,
        ts_captured: "2026-11-09T20:05:00Z",
        ts_event_start: "2026-11-15T21:05:00Z",
      },
      {
        event_id: "ws:nfl:20261115:ari:sea",
        market: "moneyline",
        line: null,
        selection: "home",
        book: "bet365 nj",
        price_decimal: 4.65,
        ts_captured: "2026-11-10T16:00:06Z",
        ts_event_start: "2026-11-15T21:05:00Z",
      },
    ];

    const meas = measureSnapshotCaptureCadence(sampleSnaps);
    expect(meas.by_book.pinnacle!.intra_series_intervals_minutes.median).toBeCloseTo(4727 / 60, 10);
    expect(meas.by_book.b365!.single_capture_only).toBe(true);
    expect(meas.paired_recreational_vs_sharp.n_causal_pairs).toBe(1);
    expect(meas.paired_recreational_vs_sharp.causal_lag_minutes.median).toBeCloseTo(1195.1, 10);

    const cadenceInput: ScrapingCadenceFormulaInput = {
      sharp_live_gap_median_minutes: 4727 / 60,
      sharp_live_move_fraction: 68 / 326,
      sharp_reference_horizon_minutes: 8515.0,
      horizon_acceleration_exponent: 0.25,
      recreational_convergence_beta: 0.56,
      execution_delay_minutes: 2.0,
      max_polling_decay_fraction: 0.05,
      regimes: [
        { regime_id: "closing_60m", description: "T-60m", horizon_minutes: 60.0 },
        { regime_id: "matchday_510m", description: "q10 TTC", horizon_minutes: 509.9 },
        { regime_id: "early_week_6270m", description: "q50 TTC", horizon_minutes: 6269.9 },
      ],
    };

    const cadence = deriveRecommendedScrapingCadence(cadenceInput);
    expect(cadence.regimes).toHaveLength(3);
    // Monotonía física estricta: a menor tiempo al kickoff, mayor decaimiento y menor intervalo recomendado
    expect(cadence.regimes[0]!.recommended_interval_minutes).toBeLessThan(
      cadence.regimes[1]!.recommended_interval_minutes,
    );
    expect(cadence.regimes[1]!.recommended_interval_minutes).toBeLessThan(
      cadence.regimes[2]!.recommended_interval_minutes,
    );
    // La cadencia recomendada captura estrictamente más edge que el hueco actual de 78.78 min
    for (const r of cadence.regimes) {
      expect(r.expected_edge_survival_at_recommended).toBeGreaterThan(
        r.expected_edge_survival_at_current_sharp_gap,
      );
      expect(Math.abs(r.polling_survival_factor_at_recommended - 0.95)).toBeLessThan(1e-6);
    }
    // Verificar Taylor exacto cuando pollingInterval -> 0
    expect(computePollingSurvivalFactor(0, 0.05)).toBe(1.0);
    expect(computeExpectedEdgeSurvival(0, 0.05, 2.0)).toBeCloseTo(Math.exp(-0.1), 12);
  });

  it("6. Paridad numérica cruzada < 1e-12 entre stale_lines.ts y stale_lines.py (puente JSON)", () => {
    const pyExe = resolvePythonExe();
    if (!pyExe) {
      // Si el entorno no tiene el venv Python montado, validar identidad algebraica interna `< 1e-14`
      const bVec = blendConfirmationProbabilities([0.54, 0.46], [0.51, 0.49], 0.35);
      const bSc = blendScalarConfirmationProb(0.54, 0.51, 0.35);
      expect(Math.abs(bVec[0]! - bSc)).toBeLessThan(1e-14);
      return;
    }

    const cfg = makeTestStaleConfig();
    const candidates: StaleLineCandidate[] = [
      makeBaseStaleCandidate({ candidate_id: "par-1" }),
      makeBaseStaleCandidate({
        candidate_id: "par-2-totals",
        market: "totals",
        line: 2.5,
        selection: "over",
        recreational_book: "bwin",
        price_recreational: 2.08,
        sharp_market_odds: [1.91, 1.99],
        devig_method: "adaptive",
        p_modelo: 0.535,
        model_market_probs: [0.535, 0.465],
        submodel_probs: [0.52, 0.535, 0.55],
      }),
      makeBaseStaleCandidate({
        candidate_id: "par-3-rejected-breakeven",
        event_id: "football:e0_liv_mci",
        price_recreational: 2.12,
        p_modelo: 0.46,
        model_market_probs: [0.46, 0.29, 0.25],
      }),
    ];

    const tsDouble = evaluateStaleLineBatch(candidates, cfg, {
      overrideSignalMode: "double_confirmation",
    });
    const tsSimple = evaluateStaleLineBatch(candidates, cfg, {
      overrideSignalMode: "simple_sharp",
    });

    const scriptPath = resolve(process.cwd(), "services/models/stale_lines.py");
    const runPy = (payload: unknown) => {
      const proc = spawnSync(pyExe, [scriptPath, "--eval-json-stdin"], {
        input: JSON.stringify(payload),
        encoding: "utf8",
      });
      expect(proc.status).toBe(0);
      return JSON.parse(proc.stdout);
    };

    const pyDouble = runPy({
      action: "evaluate_batch",
      candidates,
      config: cfg,
      override_signal_mode: "double_confirmation",
    }).decisions as StaleLineDecisionResult[];

    const pySimple = runPy({
      action: "evaluate_batch",
      candidates,
      config: cfg,
      override_signal_mode: "simple_sharp",
    }).decisions as StaleLineDecisionResult[];

    const numericKeys: Array<keyof StaleLineDecisionResult> = [
      "price_recreational",
      "p_recreational_implied",
      "p_sharp_novig",
      "price_sharp_novig",
      "stale_prob_margin_obs",
      "stale_ev_sharp",
      "price_ratio_vs_sharp_novig",
      "p_effective",
      "sigma_p",
      "p_shrunk",
      "adverse_ticks_1h",
      "f_quarter",
      "stake_raw_u",
      "correlation_multiplier",
      "stake_u",
      "expected_log_growth_g",
    ];

    for (const [tsList, pyList] of [
      [tsDouble, pyDouble],
      [tsSimple, pySimple],
    ] as const) {
      expect(tsList).toHaveLength(pyList.length);
      for (let i = 0; i < tsList.length; i += 1) {
        const t = tsList[i]!;
        const p = pyList[i]!;
        expect(t.approved).toBe(p.approved);
        expect(t.rejection_reason).toBe(p.rejection_reason);
        expect(t.tier).toBe(p.tier);
        expect(t.cond1_stale_line).toBe(p.cond1_stale_line);
        expect(t.cond2_model_confirms).toBe(p.cond2_model_confirms);
        expect(t.allocation_rank).toBe(p.allocation_rank);
        for (const k of numericKeys) {
          const tv = t[k] as number;
          const pv = p[k] as number;
          expect(Math.abs(tv - pv)).toBeLessThan(1e-12);
        }
      }
    }

    // Paridad `< 1e-12` en de-vig 3-vías adaptive y derivación matemática de cadencia
    const tsAdaptive = devigSharpMarketPrices([1.95, 3.6, 4.1], "adaptive");
    const pyAdaptive = runPy({
      action: "devig",
      raw_prices: [1.95, 3.6, 4.1],
      method: "adaptive",
    }).probs as number[];
    for (let j = 0; j < tsAdaptive.length; j += 1) {
      expect(Math.abs(tsAdaptive[j]! - pyAdaptive[j]!)).toBeLessThan(1e-12);
    }

    const cadenceParams: ScrapingCadenceFormulaInput = {
      sharp_live_gap_median_minutes: 4727 / 60,
      sharp_live_move_fraction: 68 / 326,
      sharp_reference_horizon_minutes: 8515.0,
      horizon_acceleration_exponent: 0.25,
      recreational_convergence_beta: 0.56,
      execution_delay_minutes: 2.0,
      max_polling_decay_fraction: 0.05,
      regimes: [{ regime_id: "r1", description: "T-60m", horizon_minutes: 60.0 }],
    };
    const tsCad = deriveRecommendedScrapingCadence(cadenceParams);
    const pyCad = runPy({ action: "derive_cadence", params: cadenceParams }).cadence;
    expect(
      Math.abs(
        tsCad.regimes[0]!.recommended_interval_minutes -
          pyCad.regimes[0].recommended_interval_minutes,
      ),
    ).toBeLessThan(1e-12);
    expect(
      Math.abs(
        tsCad.regimes[0]!.expected_edge_survival_at_recommended -
          pyCad.regimes[0].expected_edge_survival_at_recommended,
      ),
    ).toBeLessThan(1e-12);
  });

  it("7. Valida el artefacto congelado src/data/prediction/stale_lines_config.json cuando está generado", () => {
    const cfgPath = resolve(process.cwd(), "data/stale_lines_config.json");
    if (existsSync(cfgPath)) {
      const cfg = JSON.parse(readFileSync(cfgPath, "utf8")) as StaleLinesConfig;
      validateStaleLinesConfig(cfg);
      expect(cfg.holdout_sealed_untouched).toBe(true);
      expect(cfg.signal_mode).toBe("double_confirmation");
      expect(cfg.kelly_fraction).toBeLessThanOrEqual(0.25);

      const decision = evaluateStaleLineCandidate(makeBaseStaleCandidate(), cfg);
      expect(typeof decision.approved).toBe("boolean");
    }
  });
});
