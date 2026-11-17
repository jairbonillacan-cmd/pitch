"""Ablación estricta en `VAL 2010..2019`, evaluación bootstrap `mulberry32` y promoción condicional de `PitchLab Meridian v3.0` (`EXP_V33_intl_soccer`).

Compara sobre `walk_forward_dev` (`2010..2024`, `< 2025-02-02`, `n = 12,904` partidos):
  - `meridian_v1_0` (`38` base)
  - `meridian_v2_0` (`49` base = `v1 + Goalscorers + TM Pool + FIFA SUM/Clima`)
  - `v2_plus_blockD_appearances` (`+4` `tm_appearances.csv.gz` `CC0`: minutos activos `90d`, copas continentales `180d`, `G+A/90` en clubes, ritmo competitivo)
  - `v2_plus_blockE_worldbank` (`+2` Banco Mundial `PDDL`/`CC-BY-4.0` rezagado `Year <= match_year - 1`: `log10(Pop)`, `log10(GDP_pc)`)
  - `meridian_v3_candidate` (bloques aceptados exclusivamente en `VAL 2010..2019`)
"""

from __future__ import annotations

import os

os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
from typing import Any, Mapping

import numpy as np
import pandas as pd

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
for _p in (str(REPO_ROOT), str(EXP_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from services.models import outlook_calibration as oc  # noqa: E402

from intl_causal_features import (  # noqa: E402
    ELO_HFA_POINTS,
    ELO_K_BY_REGIME,
    INTL_BASE_38_FEATURES,
    REGIME_BASE_GOAL_MU,
    REGIME_DC_RHO,
    SQUAD_CLUB_BRIDGE_CONFIG,
    _date_iso_to_ordinal,
)
from intl_geography import FEDERATION_CATALOG  # noqa: E402
from intl_ingest import (  # noqa: E402
    ARTIFACTS_DIR,
    HOLDOUT_CUT_DATE,
    HOLDOUT_CUT_ISO,
    INTL_DIV_LEVELS,
    MODERN_TRAIN_MIN_YEAR,
    VAL_MAX_YEAR,
    fetch_and_normalize_all_intl_matches,
    load_intl_matches_dev,
)
from intl_wave2_sources import (  # noqa: E402
    CONFED_PRIOR_ACTIVE_90S,
    CONFED_PRIOR_LOG10_GDP_PC,
    CONFED_PRIOR_LOG10_POP,
    CausalNationalAppearancesBridge,
    CausalWorldBankMacroBridge,
)
from run_ablation_v2 import (  # noqa: E402
    ALL_V2_EXTRA_COLS,
    TRIAL_REGISTRY_OUT,
    _eval_feature_subset_walk_forward,
    build_intl_v2_causal_dataset,
    synthesize_live_intl_v2_row,
)
from run_experiment import (  # noqa: E402
    BOOTSTRAP_SAMPLES,
    BOOTSTRAP_SEED,
    DATA_PRED_DIR,
    MODEL_SEED,
    compute_elo_baseline_probs,
    derive_2way_probs_from_1x2,
    fit_logit_bundle,
    predict_logit_bundle_exact,
)

BLOCK_D_APP_COLS: tuple[str, ...] = (
    "tm_active_90s_diff",
    "tm_elite_cup_90s_diff",
    "tm_club_ga_per90_diff",
    "tm_match_fit_share_diff",
)

BLOCK_E_WB_COLS: tuple[str, ...] = (
    "wb_log10_pop_diff",
    "wb_log10_gdp_pc_diff",
)

MODEL_V3_JSON_OUT = DATA_PRED_DIR / "model_intl_soccer_v3.json"
CAUSAL_STATE_V3_JSON_OUT = DATA_PRED_DIR / "intl_soccer_causal_state_v3.json"
CALIBRATION_V3_JSON_OUT = DATA_PRED_DIR / "intl_outlook_calibration_v3.json"
SNAPSHOT_V3_JSON_OUT = DATA_PRED_DIR / "intl_soccer_snapshot_v3.json"
MERIDIAN_V3_RESULTS_OUT = ARTIFACTS_DIR / "exp_v33_meridian_v3_results.json"


def attach_wave2_intl_features(
    df: pd.DataFrame,
    *,
    max_date_exclusive: str | None = HOLDOUT_CUT_DATE,
    max_wb_year_inclusive: int = 2024,
) -> tuple[pd.DataFrame, CausalNationalAppearancesBridge, CausalWorldBankMacroBridge]:
    app_bridge = CausalNationalAppearancesBridge(max_date_exclusive=max_date_exclusive)
    wb_bridge = CausalWorldBankMacroBridge(max_year_inclusive=max_wb_year_inclusive)

    n = len(df)
    d_mat = np.zeros((n, 4), dtype=np.float64)
    e_mat = np.zeros((n, 2), dtype=np.float64)

    for i, r in enumerate(df.itertuples(index=False)):
        d_iso = str(r.date_str)[:10]
        m_ord = _date_iso_to_ordinal(d_iso)
        m_yr = int(d_iso[:4])
        hc = str(r.home_code)
        ac = str(r.away_code)
        ch = FEDERATION_CATALOG.get(hc, ("OFC", 0, 0, 0, ""))[0]
        ca = FEDERATION_CATALOG.get(ac, ("OFC", 0, 0, 0, ""))[0]
        eh = 1500.0 + 0.5 * float(r.elo_diff_raw)
        ea = 1500.0 - 0.5 * float(r.elo_diff_raw)

        ah = app_bridge.lookup_appearances(hc, m_ord, ch, eh)
        aa = app_bridge.lookup_appearances(ac, m_ord, ca, ea)
        d_mat[i, 0] = ah["tm_active_log_90s"] - aa["tm_active_log_90s"]
        d_mat[i, 1] = ah["tm_elite_cup_log_90s"] - aa["tm_elite_cup_log_90s"]
        d_mat[i, 2] = ah["tm_club_ga_per90"] - aa["tm_club_ga_per90"]
        d_mat[i, 3] = ah["tm_match_fit_share"] - aa["tm_match_fit_share"]

        wh = wb_bridge.lookup_macro(hc, m_yr, ch)
        wa = wb_bridge.lookup_macro(ac, m_yr, ca)
        e_mat[i, 0] = wh["wb_log10_pop"] - wa["wb_log10_pop"]
        e_mat[i, 1] = wh["wb_log10_gdp_pc"] - wa["wb_log10_gdp_pc"]

    out = df.copy()
    for j, c_nm in enumerate(BLOCK_D_APP_COLS):
        out[c_nm] = d_mat[:, j]
    for j, c_nm in enumerate(BLOCK_E_WB_COLS):
        out[c_nm] = e_mat[:, j]
    return out, app_bridge, wb_bridge


def synthesize_live_intl_v3_row(
    *,
    home_team: str,
    away_team: str,
    regime: str,
    match_date_iso: str,
    causal_states_v3: Mapping[str, Mapping[str, Any]],
    selected_extra_v3_cols: tuple[str, ...],
    city: str | None = None,
    country: str | None = None,
    is_neutral: bool | None = None,
    explicit_lat: float | None = None,
    explicit_lon: float | None = None,
    explicit_elev_m: float | None = None,
) -> dict[str, Any]:
    """Sintetiza en vivo el vector completo de `PitchLab Meridian v3.0` desde `intl_soccer_causal_state_v3.json`."""
    row_v2 = synthesize_live_intl_v2_row(
        home_team=home_team,
        away_team=away_team,
        regime=regime,
        match_date_iso=match_date_iso,
        causal_states_v2=causal_states_v3,
        city=city,
        country=country,
        is_neutral=is_neutral,
        explicit_lat=explicit_lat,
        explicit_lon=explicit_lon,
        explicit_elev_m=explicit_elev_m,
    )
    hc = str(row_v2["home_code"])
    ac = str(row_v2["away_code"])
    st_h = dict(causal_states_v3.get(hc, {}))
    st_a = dict(causal_states_v3.get(ac, {}))
    ch = str(st_h.get("confed") or FEDERATION_CATALOG.get(hc, ("OFC", 0, 0, 0, ""))[0])
    ca = str(st_a.get("confed") or FEDERATION_CATALOG.get(ac, ("OFC", 0, 0, 0, ""))[0])
    eh = float(st_h.get("elo", 1500.0))
    ea = float(st_a.get("elo", 1500.0))

    col_lookup = {
        "tm_active_90s_diff": float(st_h.get("tm_active_log_90s", CONFED_PRIOR_ACTIVE_90S.get(ch, 3.0)))
        - float(st_a.get("tm_active_log_90s", CONFED_PRIOR_ACTIVE_90S.get(ca, 3.0))),
        "tm_elite_cup_90s_diff": float(st_h.get("tm_elite_cup_log_90s", 0.0)) - float(st_a.get("tm_elite_cup_log_90s", 0.0)),
        "tm_club_ga_per90_diff": float(st_h.get("tm_club_ga_per90", 0.30)) - float(st_a.get("tm_club_ga_per90", 0.30)),
        "tm_match_fit_share_diff": float(st_h.get("tm_match_fit_share", 0.38 + (eh - 1500.0) / 650.0))
        - float(st_a.get("tm_match_fit_share", 0.38 + (ea - 1500.0) / 650.0)),
        "wb_log10_pop_diff": float(st_h.get("wb_log10_pop", CONFED_PRIOR_LOG10_POP.get(ch, 6.80)))
        - float(st_a.get("wb_log10_pop", CONFED_PRIOR_LOG10_POP.get(ca, 6.80))),
        "wb_log10_gdp_pc_diff": float(st_h.get("wb_log10_gdp_pc", CONFED_PRIOR_LOG10_GDP_PC.get(ch, 3.80)))
        - float(st_a.get("wb_log10_gdp_pc", CONFED_PRIOR_LOG10_GDP_PC.get(ca, 3.80))),
    }
    row_v2["features"] = list(row_v2["features"]) + [col_lookup[c] for c in selected_extra_v3_cols]
    return row_v2


def main() -> None:
    dev_matches_df, _ = load_intl_matches_dev(force_download=False)
    v2_df, _ = build_intl_v2_causal_dataset(
        dev_matches_df,
        enforce_before_holdout=True,
        max_source_date_exclusive=HOLDOUT_CUT_DATE,
    )
    v3_df, _, _ = attach_wave2_intl_features(
        v2_df,
        max_date_exclusive=HOLDOUT_CUT_DATE,
        max_wb_year_inclusive=2024,
    )
    modern_df = v3_df[v3_df["year"] >= MODERN_TRAIN_MIN_YEAR].copy().reset_index(drop=True)

    cols_v1 = INTL_BASE_38_FEATURES
    cols_v2 = INTL_BASE_38_FEATURES + ALL_V2_EXTRA_COLS

    P_v1, y_oof, oof_meta = _eval_feature_subset_walk_forward(modern_df, cols_v1, 0.02, 4380.0)
    P_v2, _, _ = _eval_feature_subset_walk_forward(modern_df, cols_v2, 0.02, 4380.0)
    P_v2_D, _, _ = _eval_feature_subset_walk_forward(modern_df, cols_v2 + BLOCK_D_APP_COLS, 0.02, 4380.0)
    P_v2_E, _, _ = _eval_feature_subset_walk_forward(modern_df, cols_v2 + BLOCK_E_WB_COLS, 0.02, 4380.0)
    P_v2_DE, _, _ = _eval_feature_subset_walk_forward(modern_df, cols_v2 + BLOCK_D_APP_COLS + BLOCK_E_WB_COLS, 0.02, 4380.0)

    val_m = oof_meta["year"].to_numpy(dtype=int) <= VAL_MAX_YEAR
    rec_m = oof_meta["year"].to_numpy(dtype=int) >= 2020

    val_scores = {
        "v1_base_38": float(np.mean(oc.compute_categorical_log_loss_vec(P_v1[val_m], y_oof[val_m]))),
        "v2_base_49": float(np.mean(oc.compute_categorical_log_loss_vec(P_v2[val_m], y_oof[val_m]))),
        "v2_plus_D_appearances": float(np.mean(oc.compute_categorical_log_loss_vec(P_v2_D[val_m], y_oof[val_m]))),
        "v2_plus_E_worldbank": float(np.mean(oc.compute_categorical_log_loss_vec(P_v2_E[val_m], y_oof[val_m]))),
        "v2_plus_DE_both": float(np.mean(oc.compute_categorical_log_loss_vec(P_v2_DE[val_m], y_oof[val_m]))),
    }

    # También evaluar selección individual de columnas en `VAL 2010..2019` por si alguna señal de D o E aporta sin ruido
    indiv_accepted: list[str] = []
    for cand_c in BLOCK_D_APP_COLS + BLOCK_E_WB_COLS:
        P_single, _, _ = _eval_feature_subset_walk_forward(modern_df, cols_v2 + (cand_c,), 0.02, 4380.0)
        ll_s = float(np.mean(oc.compute_categorical_log_loss_vec(P_single[val_m], y_oof[val_m])))
        val_scores[f"v2_plus_{cand_c}"] = ll_s
        if ll_s < val_scores["v2_base_49"] - 1e-6:
            indiv_accepted.append(cand_c)

    P_indiv: np.ndarray | None = None
    if indiv_accepted:
        P_indiv, _, _ = _eval_feature_subset_walk_forward(modern_df, cols_v2 + tuple(indiv_accepted), 0.02, 4380.0)
        val_scores["v2_plus_val_pruned"] = float(np.mean(oc.compute_categorical_log_loss_vec(P_indiv[val_m], y_oof[val_m])))

    print("[VAL 2010..2019 Scores]")
    for k_s, v_s in val_scores.items():
        print(f"  {k_s:32s}: {v_s:.6f}")

    # Elegir estrictamente la mejor configuración según `VAL 2010..2019`
    best_extra: tuple[str, ...] = ()
    best_P = P_v2
    best_val_ll = val_scores["v2_base_49"]

    candidate_options: list[tuple[str, tuple[str, ...], np.ndarray, float]] = [
        ("v2_plus_D_appearances", BLOCK_D_APP_COLS, P_v2_D, val_scores["v2_plus_D_appearances"]),
        ("v2_plus_E_worldbank", BLOCK_E_WB_COLS, P_v2_E, val_scores["v2_plus_E_worldbank"]),
        ("v2_plus_DE_both", BLOCK_D_APP_COLS + BLOCK_E_WB_COLS, P_v2_DE, val_scores["v2_plus_DE_both"]),
    ]
    if P_indiv is not None:
        candidate_options.append(("v2_plus_val_pruned", tuple(indiv_accepted), P_indiv, val_scores["v2_plus_val_pruned"]))

    best_label = "retain_meridian_v2"
    for lbl, ex_cols, p_mat, v_ll in candidate_options:
        if v_ll < best_val_ll - 1e-6:
            best_val_ll = v_ll
            best_extra = ex_cols
            best_P = p_mat
            best_label = lbl

    ll_v2_vec = oc.compute_categorical_log_loss_vec(P_v2, y_oof)
    ll_v1_vec = oc.compute_categorical_log_loss_vec(P_v1, y_oof)
    P_elo = compute_elo_baseline_probs(oof_meta.merge(modern_df[["match_id", "elo_diff_eff"]], on="match_id", how="left")["elo_diff_eff"].to_numpy())
    ll_elo_vec = oc.compute_categorical_log_loss_vec(P_elo, y_oof)

    ablation_2010_24: dict[str, Any] = {}
    ablation_2020_24: dict[str, Any] = {}
    print(f"\n=== WALK-FORWARD DEV 2010..2024 vs Meridian v2.0 (n={len(y_oof)}) ===")
    eval_named = [
        ("v2_base_49", P_v2),
        ("v2_plus_D_appearances", P_v2_D),
        ("v2_plus_E_worldbank", P_v2_E),
        ("v2_plus_DE_both", P_v2_DE),
    ]
    if P_indiv is not None and best_label == "v2_plus_val_pruned":
        eval_named.append(("v2_plus_val_pruned", P_indiv))

    for nm, pm in eval_named:
        ev_all = oc.evaluate_calibration_with_bootstrap(
            pm, y_oof, benchmark_ll_vec=ll_v2_vec, benchmark_is_self=(nm == "v2_base_49"), n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
        )
        ev_20 = oc.evaluate_calibration_with_bootstrap(
            pm[rec_m], y_oof[rec_m], benchmark_ll_vec=ll_v2_vec[rec_m], benchmark_is_self=(nm == "v2_base_49"), n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
        )
        ablation_2010_24[nm] = ev_all
        ablation_2020_24[nm] = ev_20
        print(
            f"  {nm:26s} | 2010-24 LL={ev_all['log_loss']:.5f} ΔLL vs v2={ev_all['delta_ll_vs_benchmark']:+.5f} {ev_all['delta_ll_ci95']} ({ev_all['significance']})"
            f" | 2020-24 LL={ev_20['log_loss']:.5f} ΔLL vs v2={ev_20['delta_ll_vs_benchmark']:+.5f} ({ev_20['significance']})"
        )

    ev_best_vs_v2 = oc.evaluate_calibration_with_bootstrap(
        best_P, y_oof, benchmark_ll_vec=ll_v2_vec, benchmark_is_self=(len(best_extra) == 0), n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=True
    )
    ev_best_vs_v1 = oc.evaluate_calibration_with_bootstrap(
        best_P, y_oof, benchmark_ll_vec=ll_v1_vec, n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
    )
    ev_best_vs_elo = oc.evaluate_calibration_with_bootstrap(
        best_P, y_oof, benchmark_ll_vec=ll_elo_vec, n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
    )

    promoted = bool(len(best_extra) > 0 and ev_best_vs_v2["delta_ll_vs_benchmark"] < 0.0)
    artifacts_sha: dict[str, str] = {}

    if promoted:
        selected_cols = cols_v2 + best_extra
        X_base_f = modern_df[list(selected_cols)].to_numpy(dtype=np.float64)
        div_vals = modern_df["div"].astype(str).to_numpy()
        dummies_f = np.column_stack([(div_vals == lvl).astype(np.float64) for lvl in INTL_DIV_LEVELS])
        X_final = np.hstack([X_base_f, dummies_f])
        y_final = modern_df["y"].to_numpy(dtype=np.int64)
        dates_f = pd.to_datetime(modern_df["match_date"])
        sw_final = 0.5 ** ((dates_f.max() - dates_f).dt.days.to_numpy(dtype=np.float64) / 4380.0)

        imp_f, sc_f, lr_f = fit_logit_bundle(X_final, y_final, 0.02, sw_final)
        P_train = predict_logit_bundle_exact(imp_f, sc_f, lr_f, X_final)
        train_ll = float(-np.mean(np.log(np.clip(P_train[np.arange(len(y_final)), y_final], 1e-15, 1.0))))

        feat_names_full = list(selected_cols) + [f"div_{d}" for d in INTL_DIV_LEVELS]
        model_v3 = {
            "type": "multinomial_logistic",
            "codename": "PitchLab Meridian v3.0",
            "version": "3.0.0",
            "status": "candidate",
            "production_activated": False,
            "production_enabled": False,
            "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "seed": MODEL_SEED,
            "regularization_C": 0.02,
            "sample_half_life_days": 4380.0,
            "features": feat_names_full,
            "n_features_base": len(selected_cols),
            "div_levels": list(INTL_DIV_LEVELS),
            "imputer": {"strategy": "median", "statistics": [float(v) for v in imp_f.statistics_.tolist()]},
            "scaler": {"mean": [float(v) for v in sc_f.mean_.tolist()], "scale": [float(v) for v in sc_f.scale_.tolist()]},
            "coef": [[float(x) for x in r] for r in lr_f.coef_.tolist()],
            "intercept": [float(x) for x in lr_f.intercept_.tolist()],
            "classes": [int(c) for c in lr_f.classes_.tolist()],
            "intl_physics_config": {
                "elo_hfa_points": ELO_HFA_POINTS,
                "elo_k_by_regime": ELO_K_BY_REGIME,
                "regime_base_goal_mu": REGIME_BASE_GOAL_MU,
                "regime_dc_rho": REGIME_DC_RHO,
                "squad_club_bridge": SQUAD_CLUB_BRIDGE_CONFIG,
                "v3_extra_features": list(best_extra),
            },
            "metadata": {
                "trained_on": "Meridian v2.0 (49 cols) + Wave 2 Open Stack (< 2025-02-02): " + ", ".join(best_extra),
                "n_matches": int(len(modern_df)),
                "seasons": [str(modern_df["season"].min()), str(modern_df["season"].max())],
                "target": "0=H, 1=D, 2=A (90-min regulation)",
                "train_log_loss": round(train_ll, 6),
                "notes": "PitchLab Meridian v3.0 promovido por mejora en VAL 2010..2019 y walk_forward_dev.",
            },
        }
        MODEL_V3_JSON_OUT.write_text(json.dumps(model_v3, indent=1), encoding="utf-8")

        # Calibración v3
        P_ou25, P_btts = derive_2way_probs_from_1x2(best_P, oof_meta["div"].tolist())
        y_ou25 = np.where((oof_meta["home_goals"] + oof_meta["away_goals"]).to_numpy() > 2.5, 0, 1).astype(np.int64)
        y_btts = np.where((oof_meta["home_goals"].to_numpy() > 0) & (oof_meta["away_goals"].to_numpy() > 0), 0, 1).astype(np.int64)

        def _mk_seg(lg: str, mkt: str, res_c: dict[str, Any], note: str) -> dict[str, Any]:
            return {
                "sport": "football",
                "league": lg,
                "market": mkt,
                "selected_source_when_sharp_present": "market_sharp_novig",
                "fallback_order": ["market_sharp_novig", "model", "base_rate"],
                "benchmark_note": note,
                "n": res_c["n"],
                "ece": res_c["ece"],
                "ece_ci95": res_c["ece_ci95"],
                "log_loss": res_c["log_loss"],
                "log_loss_ci95": res_c["log_loss_ci95"],
                "brier": res_c["brier"],
                "brier_ci95": res_c["brier_ci95"],
                "rps": res_c["rps"],
                "rps_ci95": res_c["rps_ci95"],
                "delta_ll_vs_benchmark": res_c["delta_ll_vs_benchmark"],
                "delta_ll_ci95": res_c["delta_ll_ci95"],
                "significance": res_c["significance"],
                "reliability_bins": res_c["reliability_bins"],
            }

        cal_segs = {
            "GLOBAL::football::1x2": _mk_seg("GLOBAL", "1x2", ev_best_vs_v2, "Meridian v3.0 vs v2.0"),
            "GLOBAL::football::totals": _mk_seg(
                "GLOBAL", "totals", oc.evaluate_calibration_with_bootstrap(P_ou25, y_ou25, benchmark_is_self=True, n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=True), "Meridian v3.0 DC"
            ),
            "GLOBAL::football::btts": _mk_seg(
                "GLOBAL", "btts", oc.evaluate_calibration_with_bootstrap(P_btts, y_btts, benchmark_is_self=True, n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=True), "Meridian v3.0 DC"
            ),
        }
        div_oof = oof_meta["div"].astype(str).to_numpy()
        for reg in INTL_DIV_LEVELS:
            rm = div_oof == reg
            if int(np.sum(rm)) >= 25:
                rc = oc.evaluate_calibration_with_bootstrap(best_P[rm], y_oof[rm], benchmark_ll_vec=ll_v2_vec[rm], n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=True)
                cal_segs[f"{reg}::1x2"] = _mk_seg(reg, "1x2", rc, f"Meridian v3.0 vs v2.0 en {reg}")

        cal_v3_art = {
            "schema_version": oc.SCHEMA_VERSION,
            "eval_split": "walk_forward_dev",
            "holdout_cut_utc": HOLDOUT_CUT_ISO,
            "holdout_sealed_untouched": True,
            "bootstrap_samples": BOOTSTRAP_SAMPLES,
            "max_sharp_age_minutes": oc.MAX_SHARP_AGE_MINUTES,
            "segments": cal_segs,
        }
        oc.assert_no_forbidden_public_fields(cal_v3_art)
        CALIBRATION_V3_JSON_OUT.write_text(json.dumps(cal_v3_art, indent=2), encoding="utf-8")

        # Snapshot paridad v3 (`200` partidos `< 2025-02-02`)
        rng = np.random.default_rng(MODEL_SEED)
        pool_s = modern_df[modern_df["year"] >= 2022].copy()
        chosen = np.sort(rng.choice(len(pool_s), size=min(200, len(pool_s)), replace=False))
        snap_df = pool_s.iloc[chosen].copy()
        X_sn = np.hstack([
            snap_df[list(selected_cols)].to_numpy(dtype=np.float64),
            np.column_stack([(snap_df["div"].astype(str).to_numpy() == lvl).astype(np.float64) for lvl in INTL_DIV_LEVELS]),
        ])
        P_sn = predict_logit_bundle_exact(imp_f, sc_f, lr_f, X_sn)
        snap_rows = {}
        for idx_s, row_s in enumerate(snap_df.itertuples(index=False)):
            reg_s = str(row_s.div)
            snap_rows[str(row_s.match_id)] = {
                "div": reg_s,
                "season": str(row_s.season),
                "match_date": str(row_s.date_str),
                "home_code": str(row_s.home_code),
                "away_code": str(row_s.away_code),
                "features": [float(getattr(row_s, col)) for col in selected_cols],
                "div_onehot": [1 if lvl == reg_s else 0 for lvl in INTL_DIV_LEVELS],
                "probs_python": [float(P_sn[idx_s, 0]), float(P_sn[idx_s, 1]), float(P_sn[idx_s, 2])],
            }
        SNAPSHOT_V3_JSON_OUT.write_text(
            json.dumps({"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "model_version": "3.0.0", "n": len(snap_rows), "rows": snap_rows}, indent=1),
            encoding="utf-8",
        )

        # Estado causal vivo v3
        all_matches_df, _ = fetch_and_normalize_all_intl_matches(export_history_jsonl=False)
        _, live_states_v2 = build_intl_v2_causal_dataset(all_matches_df, enforce_before_holdout=False, max_source_date_exclusive=None)
        app_live = CausalNationalAppearancesBridge(max_date_exclusive=None)
        wb_live = CausalWorldBankMacroBridge(max_year_inclusive=2026)
        live_ord = datetime(2026, 11, 17).toordinal()

        for code_k, st_d in live_states_v2.items():
            ap_m = app_live.lookup_appearances(code_k, live_ord, str(st_d["confed"]), float(st_d["elo"]))
            wb_m = wb_live.lookup_macro(code_k, 2026, str(st_d["confed"]))
            st_d["tm_active_log_90s"] = round(float(ap_m["tm_active_log_90s"]), 6)
            st_d["tm_elite_cup_log_90s"] = round(float(ap_m["tm_elite_cup_log_90s"]), 6)
            st_d["tm_club_ga_per90"] = round(float(ap_m["tm_club_ga_per90"]), 6)
            st_d["tm_match_fit_share"] = round(float(ap_m["tm_match_fit_share"]), 6)
            st_d["wb_log10_pop"] = round(float(wb_m["wb_log10_pop"]), 6)
            st_d["wb_log10_gdp_pc"] = round(float(wb_m["wb_log10_gdp_pc"]), 6)

        CAUSAL_STATE_V3_JSON_OUT.write_text(
            json.dumps(
                {
                    "schema_version": "intl_causal_state_v3.0.0",
                    "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "max_observed_match_date": str(all_matches_df["date_str"].max()),
                    "weights_trained_strictly_before": HOLDOUT_CUT_DATE,
                    "n_federations": len(live_states_v2),
                    "n_features_base": len(selected_cols),
                    "v3_extra_features": list(best_extra),
                    "regime_dc_rho": REGIME_DC_RHO,
                    "regime_base_goal_mu": REGIME_BASE_GOAL_MU,
                    "teams": live_states_v2,
                },
                indent=1,
            ),
            encoding="utf-8",
        )
        artifacts_sha = {
            "model_intl_soccer_v3.json": hashlib.sha256(MODEL_V3_JSON_OUT.read_bytes()).hexdigest(),
            "intl_soccer_causal_state_v3.json": hashlib.sha256(CAUSAL_STATE_V3_JSON_OUT.read_bytes()).hexdigest(),
            "intl_outlook_calibration_v3.json": hashlib.sha256(CALIBRATION_V3_JSON_OUT.read_bytes()).hexdigest(),
            "intl_soccer_snapshot_v3.json": hashlib.sha256(SNAPSHOT_V3_JSON_OUT.read_bytes()).hexdigest(),
        }
        print(f"[PROMOTED PitchLab Meridian v3.0] cols={len(selected_cols)} extra={list(best_extra)}")
    else:
        print("[DECISION] Meridian v2.0 retenido como óptimo tras chequeo VAL 2010..2019.")

    summary_v3 = {
        "experiment_id": "EXP_V35_meridian_v3_wave2",
        "eval_split": "walk_forward_dev",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "promoted_v3": promoted,
        "selected_label": best_label,
        "selected_extra_features": list(best_extra),
        "val_2010_2019_scores": {k: round(v, 6) for k, v in val_scores.items()},
        "ablation_2010_2024_vs_v2": ablation_2010_24,
        "ablation_2020_2024_vs_v2": ablation_2020_24,
        "best_vs_v2_2010_2024": {k: v for k, v in ev_best_vs_v2.items() if k != "reliability_bins"},
        "best_vs_v1_2010_2024": ev_best_vs_v1,
        "best_vs_elo_2010_2024": ev_best_vs_elo,
        "artifacts_sha256": artifacts_sha,
    }
    MERIDIAN_V3_RESULTS_OUT.write_text(json.dumps(summary_v3, indent=2), encoding="utf-8")

    with TRIAL_REGISTRY_OUT.open("a", encoding="utf-8") as rfh:
        rfh.write(
            json.dumps(
                {
                    "timestamp_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V35_meridian_v3_wave2",
                    "eval_split": "walk_forward_dev",
                    "unlock_holdout": False,
                    "promoted": promoted,
                    "selected_extra": list(best_extra),
                    "log_loss": ev_best_vs_v2["log_loss"],
                    "delta_ll_vs_v2": ev_best_vs_v2["delta_ll_vs_benchmark"],
                    "delta_ll_vs_v2_ci95": ev_best_vs_v2["delta_ll_ci95"],
                }
            )
            + "\n"
        )


if __name__ == "__main__":
    main()
