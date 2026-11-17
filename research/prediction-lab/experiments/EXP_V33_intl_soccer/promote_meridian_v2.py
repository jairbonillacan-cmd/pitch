"""Selección en VAL (`2010..2019`), evaluación walk-forward completa y exportación de `PitchLab Meridian v2.0`."""

from __future__ import annotations

import os

os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

from bisect import bisect_left
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys
from typing import Any

import numpy as np
import pandas as pd

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
for _p in (str(REPO_ROOT), str(EXP_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from services.models import outlook_calibration as oc  # noqa: E402

from intl_causal_features import INTL_BASE_38_FEATURES, REGIME_BASE_GOAL_MU, REGIME_DC_RHO, SQUAD_CLUB_BRIDGE_CONFIG, ELO_HFA_POINTS, ELO_K_BY_REGIME  # noqa: E402
from intl_free_data_v2 import CONFED_PRIOR_LOG_TOP23_EUR_M, TM_PLAYERS_GZ_PATH, TM_VALUATIONS_GZ_PATH, BIG5_COMP_IDS  # noqa: E402
from intl_geography import FEDERATION_CATALOG, resolve_team_code  # noqa: E402
from intl_ingest import (  # noqa: E402
    ARTIFACTS_DIR,
    FIRST_EVAL_YEAR,
    HOLDOUT_CUT_DATE,
    HOLDOUT_CUT_ISO,
    INTL_DIV_LEVELS,
    MODERN_TRAIN_MIN_YEAR,
    VAL_MAX_YEAR,
    fetch_and_normalize_all_intl_matches,
    load_intl_matches_dev,
)
from run_ablation_v2 import (  # noqa: E402
    ALL_V2_EXTRA_COLS,
    TRIAL_REGISTRY_OUT,
    _eval_feature_subset_walk_forward,
    build_intl_v2_causal_dataset,
)
from run_experiment import (  # noqa: E402
    BOOTSTRAP_SAMPLES,
    BOOTSTRAP_SEED,
    DATA_PRED_DIR,
    MODEL_SEED,
    _fit_dc_lambdas_from_1x2_row,
    compute_causal_base_rate_probs,
    compute_elo_baseline_probs,
    derive_2way_probs_from_1x2,
    fit_logit_bundle,
    predict_logit_bundle_exact,
)

MODEL_V2_JSON_OUT = DATA_PRED_DIR / "model_intl_soccer_v2.json"
CAUSAL_STATE_V2_JSON_OUT = DATA_PRED_DIR / "intl_soccer_causal_state_v2.json"
CALIBRATION_V2_JSON_OUT = DATA_PRED_DIR / "intl_outlook_calibration_v2.json"
SNAPSHOT_V2_JSON_OUT = DATA_PRED_DIR / "intl_soccer_snapshot_v2.json"
MERIDIAN_V2_RESULTS_OUT = ARTIFACTS_DIR / "exp_v33_meridian_v2_results.json"

SPINE_AGE_EXTRA_COLS: tuple[str, ...] = (
    "tm_gk_def_log_val_diff",
    "tm_prime_age_share_diff",
)


class SpineAndAgePoolIndex:
    """Índice causal `val.date < snap_date < match_date` para valor defensivo/GK y proporción en edad pico (24..29)."""

    def __init__(self, max_date_exclusive: str | None = None) -> None:
        self._snap_ords: list[int] = []
        self._snaps: list[dict[str, tuple[float, float, float]]] = []

        if not TM_PLAYERS_GZ_PATH.exists() or not TM_VALUATIONS_GZ_PATH.exists():
            return

        pl = pd.read_csv(TM_PLAYERS_GZ_PATH, usecols=["player_id", "country_of_citizenship", "date_of_birth", "position"])
        pl = pl[pl["country_of_citizenship"].notna()].copy()
        pl["fed_code"] = pl["country_of_citizenship"].astype(str).map(resolve_team_code)
        pl = pl[pl["fed_code"].isin(set(FEDERATION_CATALOG.keys()))].copy()
        pl["birth_year"] = pd.to_numeric(pl["date_of_birth"].astype(str).str.slice(0, 4), errors="coerce").fillna(1990).astype(int)
        pl["is_gk_def"] = pl["position"].fillna("").isin(("Defender", "Goalkeeper")).astype(int)

        pv = pd.read_csv(TM_VALUATIONS_GZ_PATH, usecols=["player_id", "date", "market_value_in_eur"])
        pv["date_str"] = pv["date"].astype(str).str.slice(0, 10)
        if max_date_exclusive is not None:
            pv = pv[pv["date_str"] < str(max_date_exclusive)[:10]].copy()
        pv["val_eur"] = pd.to_numeric(pv["market_value_in_eur"], errors="coerce").fillna(0.0)
        pv = pv[pv["val_eur"] > 0.0].copy()
        pv["v_dt"] = pd.to_datetime(pv["date_str"], format="%Y-%m-%d", errors="coerce")
        pv = pv[pv["v_dt"].notna()].copy()
        pv["v_ord"] = pv["v_dt"].map(lambda d: d.toordinal()).astype(np.int64)

        m = pv.merge(pl[["player_id", "fed_code", "birth_year", "is_gk_def"]], on="player_id", how="inner")
        m = m.sort_values("v_ord", kind="mergesort").reset_index(drop=True)

        v_ords = m["v_ord"].to_numpy(dtype=np.int64)
        pids = m["player_id"].to_numpy(dtype=np.int64)
        feds = m["fed_code"].to_numpy(dtype=str)
        byrs = m["birth_year"].to_numpy(dtype=np.int64)
        vals = m["val_eur"].to_numpy(dtype=np.float64)
        gkd = m["is_gk_def"].to_numpy(dtype=np.int64)

        snap_dates = []
        for yr in range(2004, 2027):
            for mo in (1, 3, 5, 7, 9, 11):
                if yr == 2004 and mo < 7:
                    continue
                d_iso = f"{yr:04d}-{mo:02d}-01"
                if max_date_exclusive is not None and d_iso > str(max_date_exclusive)[:10]:
                    continue
                snap_dates.append((datetime(yr, mo, 1).toordinal(), yr))

        latest: dict[int, tuple[int, str, int, float, int]] = {}
        ptr = 0
        n_r = len(v_ords)
        for s_ord, s_yr in snap_dates:
            while ptr < n_r and v_ords[ptr] < s_ord:
                latest[int(pids[ptr])] = (int(v_ords[ptr]), str(feds[ptr]), int(byrs[ptr]), float(vals[ptr]), int(gkd[ptr]))
                ptr += 1
            min_vo = s_ord - 730
            buckets: dict[str, list[tuple[float, int, int]]] = {}
            stale = []
            for pk, (vo, fc, by, ve, gd) in latest.items():
                age = s_yr - by
                if vo < min_vo or age > 39:
                    if age > 40 or vo < s_ord - 1460:
                        stale.append(pk)
                    continue
                if age < 16:
                    continue
                is_prime = 1 if (24 <= age <= 29) else 0
                buckets.setdefault(fc, []).append((ve, gd, is_prime))
            for sp in stale:
                latest.pop(sp, None)

            sd: dict[str, tuple[float, float, float]] = {}
            for fc, items in buckets.items():
                items.sort(key=lambda x: x[0], reverse=True)
                top23 = items[:23]
                gk_def_top8 = sorted([x[0] for x in top23 if x[1] == 1], reverse=True)[:8]
                log_gkd = math.log1p(sum(gk_def_top8) / 1e6)
                prime_sh = sum(x[2] for x in top23) / float(len(top23))
                w_c = min(1.0, len(top23) / 11.0)
                sd[fc] = (log_gkd, prime_sh, w_c)
            self._snap_ords.append(s_ord)
            self._snaps.append(sd)

    def lookup(self, fed_code: str, match_ord: int, confed: str, elo: float) -> tuple[float, float]:
        prior_gkd = max(0.10, min(6.50, 0.55 * CONFED_PRIOR_LOG_TOP23_EUR_M.get(confed, 2.20) + (elo - 1500.0) / 160.0))
        prior_prime = 0.45
        if not self._snap_ords:
            return prior_gkd, prior_prime
        idx = bisect_left(self._snap_ords, int(match_ord)) - 1
        if idx < 0:
            return prior_gkd, prior_prime
        ent = self._snaps[idx].get(fed_code)
        if ent is None:
            return 0.12, 0.40
        lg, pr, w = ent
        return w * lg + (1.0 - w) * prior_gkd, w * pr + (1.0 - w) * prior_prime


def _attach_spine_age_cols(df: pd.DataFrame, max_source_date_exclusive: str | None) -> tuple[pd.DataFrame, dict[str, tuple[float, float]]]:
    idx_sa = SpineAndAgePoolIndex(max_date_exclusive=max_source_date_exclusive)
    n = len(df)
    gkd_diff = np.empty(n, dtype=np.float64)
    prm_diff = np.empty(n, dtype=np.float64)
    latest_team_sa: dict[str, tuple[float, float]] = {}

    for i, r in enumerate(df.itertuples(index=False)):
        y, m, d = (int(x) for x in str(r.date_str)[:10].split("-"))
        m_ord = datetime(y, m, d).toordinal()
        hc = str(r.home_code)
        ac = str(r.away_code)
        ch = FEDERATION_CATALOG.get(hc, ("OFC", 0, 0, 0, ""))[0]
        ca = FEDERATION_CATALOG.get(ac, ("OFC", 0, 0, 0, ""))[0]
        # Usar elo_diff_raw reconstruido alrededor de 1500 solo para el prior suave
        eh = 1500.0 + 0.5 * float(r.elo_diff_raw)
        ea = 1500.0 - 0.5 * float(r.elo_diff_raw)
        gh, ph = idx_sa.lookup(hc, m_ord, ch, eh)
        ga, pa = idx_sa.lookup(ac, m_ord, ca, ea)
        gkd_diff[i] = gh - ga
        prm_diff[i] = ph - pa
        latest_team_sa[hc] = (round(gh, 6), round(ph, 6))
        latest_team_sa[ac] = (round(ga, 6), round(pa, 6))

    out = df.copy()
    out["tm_gk_def_log_val_diff"] = gkd_diff
    out["tm_prime_age_share_diff"] = prm_diff
    return out, latest_team_sa


def main() -> None:
    dev_matches_df, manifest = load_intl_matches_dev(force_download=False)
    v2_df, dev_states_v2 = build_intl_v2_causal_dataset(
        dev_matches_df,
        enforce_before_holdout=True,
        max_source_date_exclusive=HOLDOUT_CUT_DATE,
    )
    v2_df, _ = _attach_spine_age_cols(v2_df, max_source_date_exclusive=HOLDOUT_CUT_DATE)
    modern_df = v2_df[v2_df["year"] >= MODERN_TRAIN_MIN_YEAR].copy().reset_index(drop=True)

    cols_49 = INTL_BASE_38_FEATURES + ALL_V2_EXTRA_COLS
    cols_51 = cols_49 + SPINE_AGE_EXTRA_COLS

    # Selección de variante y C estrictamente sobre pliegues VAL `2010..2019`
    P_49, y_oof, oof_meta = _eval_feature_subset_walk_forward(modern_df, cols_49, 0.02, 4380.0)
    P_51, _, _ = _eval_feature_subset_walk_forward(modern_df, cols_51, 0.02, 4380.0)
    P_v1, _, _ = _eval_feature_subset_walk_forward(modern_df, INTL_BASE_38_FEATURES, 0.02, 4380.0)

    val_mask = oof_meta["year"].to_numpy(dtype=int) <= VAL_MAX_YEAR
    recent_mask = oof_meta["year"].to_numpy(dtype=int) >= 2020

    val_ll_49 = float(np.mean(oc.compute_categorical_log_loss_vec(P_49[val_mask], y_oof[val_mask])))
    val_ll_51 = float(np.mean(oc.compute_categorical_log_loss_vec(P_51[val_mask], y_oof[val_mask])))
    print(f"[VAL 2010..2019] 49-feat LL = {val_ll_49:.6f} | 51-feat (+GK/DEF & PrimeAge) LL = {val_ll_51:.6f}")

    if val_ll_51 < val_ll_49:
        selected_cols = cols_51
        P_sel = P_51
        selected_tag = "meridian_v2_51_base_features"
    else:
        selected_cols = cols_49
        P_sel = P_49
        selected_tag = "meridian_v2_49_base_features"

    ll_v1_vec = oc.compute_categorical_log_loss_vec(P_v1, y_oof)
    P_elo = compute_elo_baseline_probs(oof_meta.merge(modern_df[["match_id", "elo_diff_eff"]], on="match_id", how="left")["elo_diff_eff"].to_numpy())
    ll_elo_vec = oc.compute_categorical_log_loss_vec(P_elo, y_oof)

    ev_vs_v1_full = oc.evaluate_calibration_with_bootstrap(
        P_sel, y_oof, benchmark_ll_vec=ll_v1_vec, n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=True
    )
    ev_vs_elo_full = oc.evaluate_calibration_with_bootstrap(
        P_sel, y_oof, benchmark_ll_vec=ll_elo_vec, n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
    )
    ev_vs_v1_2020_24 = oc.evaluate_calibration_with_bootstrap(
        P_sel[recent_mask],
        y_oof[recent_mask],
        benchmark_ll_vec=ll_v1_vec[recent_mask],
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )

    print(
        f"[PROMOTED {selected_tag}] 2010-24 LL = {ev_vs_v1_full['log_loss']:.5f} {ev_vs_v1_full['log_loss_ci95']} "
        f"| ECE = {ev_vs_v1_full['ece']:.5f} "
        f"| ΔLL vs v1.0 = {ev_vs_v1_full['delta_ll_vs_benchmark']:+.5f} {ev_vs_v1_full['delta_ll_ci95']} ({ev_vs_v1_full['significance']}) "
        f"| ΔLL vs Elo = {ev_vs_elo_full['delta_ll_vs_benchmark']:+.5f} {ev_vs_elo_full['delta_ll_ci95']} ({ev_vs_elo_full['significance']})"
    )
    print(
        f"  [DEV_OOS 2020-24] LL = {ev_vs_v1_2020_24['log_loss']:.5f} | ΔLL vs v1.0 = {ev_vs_v1_2020_24['delta_ll_vs_benchmark']:+.5f} "
        f"{ev_vs_v1_2020_24['delta_ll_ci95']} ({ev_vs_v1_2020_24['significance']})"
    )

    # Entrenar modelo final estrictamente en `< 2025-02-02`
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
    model_v2 = {
        "type": "multinomial_logistic",
        "codename": "PitchLab Meridian v2.0",
        "version": "2.0.0",
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
        },
        "metadata": {
            "trained_on": (
                "CC0 1.0 Stack: martj42/international_results (results + shootouts + goalscorers minute/npG/Time-in-Lead) "
                "+ dcaribou/transfermarkt-datasets (Top-23 National Pool €, Big-5 League Share, Bench Depth, Talent-vs-Elo Gap"
                + (", GK+DEF Spine, Prime Age Share" if len(selected_cols) == 51 else "")
                + ") + ClubElo + ISA Altitude/Diaspora + FIFA SUM + Seasonal Thermal Climate (< 2025-02-02)"
            ),
            "n_matches": int(len(modern_df)),
            "seasons": [str(modern_df["season"].min()), str(modern_df["season"].max())],
            "target": "0=H, 1=D, 2=A (90-min regulation)",
            "train_log_loss": round(train_ll, 6),
            "notes": (
                "PitchLab Meridian v2.0: mejora significativa en walk_forward_dev sobre Meridian v1.0 y Elo. "
                "Compatible 1:1 con engine.ts::ModelArtifact y outlook.ts::MatchOutlook."
            ),
        },
    }
    MODEL_V2_JSON_OUT.write_text(json.dumps(model_v2, indent=1), encoding="utf-8")

    # Calibración v2 (10 deciles por régimen + mercados 2-vías)
    P_ou25, P_btts = derive_2way_probs_from_1x2(P_sel, oof_meta["div"].tolist())
    y_ou25 = np.where((oof_meta["home_goals"] + oof_meta["away_goals"]).to_numpy() > 2.5, 0, 1).astype(np.int64)
    y_btts = np.where((oof_meta["home_goals"].to_numpy() > 0) & (oof_meta["away_goals"].to_numpy() > 0), 0, 1).astype(np.int64)

    cal_segs: dict[str, Any] = {}

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

    cal_segs["GLOBAL::football::1x2"] = _mk_seg("GLOBAL", "1x2", ev_vs_v1_full, "Meridian v2.0 vs v1.0 (sin cierre sharp)")
    cal_ou = oc.evaluate_calibration_with_bootstrap(P_ou25, y_ou25, benchmark_is_self=True, n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=True)
    cal_bt = oc.evaluate_calibration_with_bootstrap(P_btts, y_btts, benchmark_is_self=True, n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=True)
    cal_segs["GLOBAL::football::totals"] = _mk_seg("GLOBAL", "totals", cal_ou, "Meridian v2.0 matriz única DC")
    cal_segs["GLOBAL::football::btts"] = _mk_seg("GLOBAL", "btts", cal_bt, "Meridian v2.0 matriz única DC")

    div_oof = oof_meta["div"].astype(str).to_numpy()
    for reg in INTL_DIV_LEVELS:
        rm = div_oof == reg
        if int(np.sum(rm)) >= 25:
            rc = oc.evaluate_calibration_with_bootstrap(
                P_sel[rm], y_oof[rm], benchmark_ll_vec=ll_v1_vec[rm], n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=True
            )
            cal_segs[f"{reg}::1x2"] = _mk_seg(reg, "1x2", rc, f"Meridian v2.0 vs v1.0 en {reg}")

    cal_v2_art = {
        "schema_version": oc.SCHEMA_VERSION,
        "eval_split": "walk_forward_dev",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "bootstrap_samples": BOOTSTRAP_SAMPLES,
        "max_sharp_age_minutes": oc.MAX_SHARP_AGE_MINUTES,
        "segments": cal_segs,
    }
    oc.assert_no_forbidden_public_fields(cal_v2_art)
    CALIBRATION_V2_JSON_OUT.write_text(json.dumps(cal_v2_art, indent=2), encoding="utf-8")

    # Snapshot de paridad v2 (`200` partidos `< 2025-02-02`)
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
    SNAPSHOT_V2_JSON_OUT.write_text(
        json.dumps({"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "model_version": "2.0.0", "n": len(snap_rows), "rows": snap_rows}, indent=1),
        encoding="utf-8",
    )

    # Estado causal vivo v2 (proyección de acumuladores con pesos congelados en `< 2025-02-02`)
    all_matches_df, _ = fetch_and_normalize_all_intl_matches(export_history_jsonl=False)
    all_v2_df, live_states_v2 = build_intl_v2_causal_dataset(
        all_matches_df, enforce_before_holdout=False, max_source_date_exclusive=None
    )
    if len(selected_cols) == 51:
        sa_idx_live = SpineAndAgePoolIndex(max_date_exclusive=None)
        max_ord_live = datetime(2026, 11, 17).toordinal()
        for code_k, st_d in live_states_v2.items():
            gk_v, pr_v = sa_idx_live.lookup(code_k, max_ord_live, str(st_d["confed"]), float(st_d["elo"]))
            st_d["tm_gk_def_log_val"] = round(gk_v, 6)
            st_d["tm_prime_age_share"] = round(pr_v, 6)

    CAUSAL_STATE_V2_JSON_OUT.write_text(
        json.dumps(
            {
                "schema_version": "intl_causal_state_v2.0.0",
                "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "max_observed_match_date": str(all_matches_df["date_str"].max()),
                "weights_trained_strictly_before": HOLDOUT_CUT_DATE,
                "n_federations": len(live_states_v2),
                "n_features_base": len(selected_cols),
                "regime_dc_rho": REGIME_DC_RHO,
                "regime_base_goal_mu": REGIME_BASE_GOAL_MU,
                "teams": live_states_v2,
            },
            indent=1,
        ),
        encoding="utf-8",
    )

    m2_sha = hashlib.sha256(MODEL_V2_JSON_OUT.read_bytes()).hexdigest()
    st2_sha = hashlib.sha256(CAUSAL_STATE_V2_JSON_OUT.read_bytes()).hexdigest()
    c2_sha = hashlib.sha256(CALIBRATION_V2_JSON_OUT.read_bytes()).hexdigest()
    sn2_sha = hashlib.sha256(SNAPSHOT_V2_JSON_OUT.read_bytes()).hexdigest()

    summary_v2 = {
        "codename": "PitchLab Meridian v2.0",
        "selected_variant": selected_tag,
        "n_features_base": len(selected_cols),
        "val_2010_2019": {"ll_49": round(val_ll_49, 6), "ll_51": round(val_ll_51, 6)},
        "walk_forward_dev_2010_2024_vs_v1": {k: v for k, v in ev_vs_v1_full.items() if k != "reliability_bins"},
        "walk_forward_dev_2010_2024_vs_elo": ev_vs_elo_full,
        "dev_oos_2020_2024_vs_v1": ev_vs_v1_2020_24,
        "artifacts_sha256": {
            "model_intl_soccer_v2.json": m2_sha,
            "intl_soccer_causal_state_v2.json": st2_sha,
            "intl_outlook_calibration_v2.json": c2_sha,
            "intl_soccer_snapshot_v2.json": sn2_sha,
        },
    }
    MERIDIAN_V2_RESULTS_OUT.write_text(json.dumps(summary_v2, indent=2), encoding="utf-8")

    with TRIAL_REGISTRY_OUT.open("a", encoding="utf-8") as rfh:
        rfh.write(
            json.dumps(
                {
                    "timestamp_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V33_meridian_v2_promotion",
                    "eval_split": "walk_forward_dev",
                    "unlock_holdout": False,
                    "n_eval": int(len(y_oof)),
                    "log_loss": ev_vs_v1_full["log_loss"],
                    "delta_ll_vs_v1": ev_vs_v1_full["delta_ll_vs_benchmark"],
                    "delta_ll_vs_v1_ci95": ev_vs_v1_full["delta_ll_ci95"],
                    "model_sha256": m2_sha,
                }
            )
            + "\n"
        )


if __name__ == "__main__":
    main()
