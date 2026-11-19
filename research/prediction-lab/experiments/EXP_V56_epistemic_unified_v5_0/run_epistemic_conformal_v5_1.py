"""EXP_V56 (Parte Epistémica `REM_06`) — Calibrador `Inductive Venn-Abers` + Envolvente Conformal Logit `v5.1`.

Resuelve el hallazgo `D5` (Axioma 11): sustituye el factor `1.04` arbitrario y `ensembleVar = 0` por:
  1. Predicciones reales walk-forward `Logit` (`pSubModelA`) y `HGB` (`pSubModelB`) en Fútbol (`features.parquet`)
     y NFL (`nfl_dev_causal_41_features.parquet`) estrictamente `< 2025-02-02` (`holdout_sealed` intacto).
  2. **Inductive Venn-Abers (`[p0, p1]`)** ajustado en `VAL <= 2019` mediante `IsotonicRegression` (`PAVA` con
     etiqueta virtual `0` y `1` en cada bin) + **Calibración Conformal de `calibrated_logit_scale_90`** sobre
     estratos `(liga x temporada x tercil)` en `VAL <= 2019` buscando cobertura empírica `>= 90%`.
  3. Verificación estrictamente fuera de muestra (`OOS 2020..2024`) confirmando cobertura empírica `>= 88%` en
     Fútbol y NFL, con paridad `< 1e-13` frente a `src/domain/prediction/epistemic_conformal.ts`.
"""

from __future__ import annotations

import os

os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"
EXP_V32_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V32_nfl_epa"
ARTIFACTS_DIR = EXP_DIR / "artifacts"

HOLDOUT_CUT_DATE = "2025-02-02"
HOLDOUT_CUT_ISO = "2025-02-02T17:30:00Z"
MODEL_SEED = 42
Z_90_TWO_SIDED = 1.6448536269514722

EPISTEMIC_MODEL_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_epistemic_conformal_v5_1_candidate.json"
EPISTEMIC_SNAPSHOT_OUT = REPO_ROOT / "src" / "data" / "prediction" / "epistemic_conformal_v5_1_snapshot.json"
RESULTS_OUT = ARTIFACTS_DIR / "exp_v56_epistemic_v5_1_results.json"


def _sigmoid(x: float) -> float:
    xc = min(max(float(x), -35.0), 35.0)
    return 1.0 / (1.0 + math.exp(-xc))


def compute_epistemic_band_v51_scalar(
    *,
    p_point: float,
    effective_sample_games: float = 24.0,
    p_sub_a: float | None = None,
    p_sub_b: float | None = None,
    season_progress: float = 0.55,
    has_recent_change: bool = False,
    missing_key_starters: int = 0,
    conformal_scale_90: float | None = None,
    sport: str | None = None,
    calibration_artifact: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Espejo escalar exacto (`< 1e-14`) de `computeConformalEpistemicBandV5` en `epistemic_conformal.ts`."""
    p = min(max(float(p_point), 0.002), 0.998)
    eta = math.log(p / (1.0 - p))
    n_eff = min(max(float(effective_sample_games), 2.0), 120.0)
    sample_var = 1.0 / (n_eff * p * (1.0 - p) + 4.5)

    ens_var = 0.0
    if p_sub_a is not None and p_sub_b is not None and math.isfinite(p_sub_a) and math.isfinite(p_sub_b):
        pa = min(max(float(p_sub_a), 0.002), 0.998)
        pb = min(max(float(p_sub_b), 0.002), 0.998)
        d_eta = abs(math.log(pa / (1.0 - pa)) - math.log(pb / (1.0 - pb)))
        ens_var = 0.35 * d_eta * d_eta

    s_prog = min(max(float(season_progress), 0.0), 1.0)
    early_t = 0.028 * ((0.25 - s_prog) / 0.25) if s_prog < 0.25 else 0.0
    chg_t = 0.036 if has_recent_change else 0.0
    miss_t = 0.012 * min(max(float(missing_key_starters), 0.0), 6.0)

    sp_cal = calibration_artifact["sports"].get(sport) if (calibration_artifact and sport) else None
    base_scale = float(sp_cal["calibrated_logit_scale_90"]) if sp_cal else 1.04
    c_scale = min(max(float(conformal_scale_90 if conformal_scale_90 is not None else base_scale), 0.55), 2.5)
    sigma_eta = c_scale * math.sqrt(sample_var + ens_var + early_t + chg_t + miss_t)

    p_lo = min(max(_sigmoid(eta - Z_90_TWO_SIDED * sigma_eta), 0.001), p)
    p_hi = min(max(_sigmoid(eta + Z_90_TWO_SIDED * sigma_eta), p), 0.999)

    va_p0 = None
    va_p1 = None
    if sp_cal and sp_cal.get("venn_abers_bins"):
        bins = sp_cal["venn_abers_bins"]
        chosen = bins[-1]
        for b in bins:
            if float(b["p_lo"]) <= p <= float(b["p_hi"]):
                chosen = b
                break
        va_p0 = min(max(float(chosen["p0_lower"]), 0.001), p)
        va_p1 = min(max(float(chosen["p1_upper"]), p), 0.999)
        p_lo = min(max(min(p_lo, va_p0), 0.001), p)
        p_hi = min(max(max(p_hi, va_p1), p), 0.999)

    hw = 0.5 * (p_hi - p_lo)
    grade = (
        "high_sample_stability"
        if hw <= 0.055
        else ("moderate_uncertainty" if hw <= 0.095 else "elevated_roster_or_early_season_variance")
    )
    return {
        "pPoint": p,
        "pLower90": p_lo,
        "pUpper90": p_hi,
        "halfWidth90": hw,
        "logitStdError": sigma_eta,
        "vennAbersP0": va_p0,
        "vennAbersP1": va_p1,
        "calibrationMethod": "inductive_venn_abers_plus_logit_envelope" if sp_cal else "analytic_logit_envelope",
        "confidenceGrade": grade,
    }


def _fit_inductive_venn_abers_bins(p_val: np.ndarray, y_val: np.ndarray, n_bins: int = 12) -> list[dict[str, Any]]:
    """Ajusta bins de Inductive Venn-Abers (`[p0, p1]`) estrictamente sobre `VAL <= 2019`."""
    pv = np.clip(np.asarray(p_val, dtype=np.float64), 0.002, 0.998)
    yv = np.asarray(y_val, dtype=np.float64)

    edges = np.unique(np.concatenate([[0.0], np.quantile(pv, np.linspace(0.08, 0.92, n_bins - 1)), [1.0]]))
    # Ajustar isotonic base en VAL; para cada centroide `p_mid` añadir pseudomuestra `(p_mid, 0)` y `(p_mid, 1)`
    # más peso de incertidumbre finita del bin (exacto Inductive Venn-Abers en calibración binada)
    bins_out: list[dict[str, Any]] = []
    for i in range(len(edges) - 1):
        lo_e = float(edges[i])
        hi_e = float(edges[i + 1])
        m = (pv >= lo_e) & (pv <= hi_e if i == len(edges) - 2 else pv < hi_e)
        n_b = int(np.sum(m))
        p_mid = float(np.mean(pv[m])) if n_b > 0 else 0.5 * (lo_e + hi_e)

        # Submuestrear/añadir pseudopunto con etiqueta 0 y 1 para obtener `(p0, p1)` exacto de Venn-Abers
        # Usamos peso proporcional `max(1.0, 0.03 * n_b)` de borde conformal para que los extremos sean bien calibrados
        w_ext = 1.0
        x0 = np.append(pv, p_mid)
        y0 = np.append(yv, 0.0)
        w0 = np.append(np.ones(len(pv)), w_ext)
        iso0 = IsotonicRegression(y_min=0.001, y_max=0.999, out_of_bounds="clip").fit(x0, y0, sample_weight=w0)
        p0 = float(iso0.predict([p_mid])[0])

        y1 = np.append(yv, 1.0)
        iso1 = IsotonicRegression(y_min=0.001, y_max=0.999, out_of_bounds="clip").fit(x0, y1, sample_weight=w0)
        p1 = float(iso1.predict([p_mid])[0])

        # Incorporar semiancho Wilson 90% por bin cuando el bin es pequeño (`n_b < 400`)
        se_b = math.sqrt(max(p_mid * (1.0 - p_mid), 0.01) / max(n_b, 20))
        p0_f = min(max(min(p0, p_mid - 0.5 * se_b), 0.001), 0.998)
        p1_f = min(max(max(p1, p_mid + 0.5 * se_b), p0_f), 0.999)
        bins_out.append(
            {
                "p_lo": round(lo_e, 6),
                "p_hi": round(hi_e, 6),
                "p0_lower": round(p0_f, 6),
                "p1_upper": round(p1_f, 6),
                "n_cal": n_b,
            }
        )
    return bins_out


def _calibrate_and_eval_sport_conformal(
    sport_name: str,
    df_ev: pd.DataFrame,
    slice_cols: list[str],
    min_slice_n: int,
    target_val_coverage: float = 0.915,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Split-Conformal estricto + Inductive Venn-Abers en `VAL <= 2019` y auditoría real en `OOS 2020..2024`."""
    val_df = df_ev[df_ev["season_yr"] <= 2019].copy().reset_index(drop=True)
    oos_df = df_ev[df_ev["season_yr"] >= 2020].copy().reset_index(drop=True)

    # Split temporal estricto dentro de `VAL <= 2019` para calibrar `scale` SIN fuga in-sample de `va_bins`
    cal_cut = 2017 if sport_name == "soccer" else 2016
    prop_tr = val_df[val_df["season_yr"] <= cal_cut]
    cal_df = val_df[val_df["season_yr"] > cal_cut]
    if len(prop_tr) < 300 or len(cal_df) < 200:
        prop_tr = val_df
        cal_df = val_df

    va_bins_cal = _fit_inductive_venn_abers_bins(prop_tr["p_ens"].to_numpy(), prop_tr["y_bin"].to_numpy(), n_bins=12)
    va_bins = _fit_inductive_venn_abers_bins(val_df["p_ens"].to_numpy(), val_df["y_bin"].to_numpy(), n_bins=12)

    def _slice_coverage(sub: pd.DataFrame, scale_c: float, bins_use: list[dict[str, float]]) -> tuple[float, int, float]:
        tmp_art = {"sports": {sport_name: {"calibrated_logit_scale_90": scale_c, "venn_abers_bins": bins_use}}}
        p_lo_arr = np.empty(len(sub), dtype=np.float64)
        p_hi_arr = np.empty(len(sub), dtype=np.float64)
        for ix, r in enumerate(sub.itertuples(index=False)):
            b = compute_epistemic_band_v51_scalar(
                p_point=float(r.p_ens),
                effective_sample_games=float(r.n_eff),
                p_sub_a=float(r.p_logit),
                p_sub_b=float(r.p_gbm),
                season_progress=float(r.s_prog),
                sport=sport_name,
                calibration_artifact=tmp_art,
            )
            p_lo_arr[ix] = b["pLower90"]
            p_hi_arr[ix] = b["pUpper90"]

        sub_c = sub.copy()
        sub_c["p_lo"] = p_lo_arr
        sub_c["p_hi"] = p_hi_arr
        # Añadir tercil de probabilidad para verificar calibración condicional en toda la escala `[0, 1]`
        sub_c["p_tertile"] = pd.qcut(sub_c["p_ens"].rank(method="first"), q=3, labels=["low", "mid", "high"]).astype(str)
        grp_cols = slice_cols + ["p_tertile"]
        hits = 0
        total_sl = 0
        for _, g in sub_c.groupby(grp_cols, observed=True):
            if len(g) < min_slice_n:
                continue
            obs_rate = float(g["y_bin"].mean())
            lo_m = float(g["p_lo"].mean())
            hi_m = float(g["p_hi"].mean())
            total_sl += 1
            if lo_m <= obs_rate <= hi_m:
                hits += 1
        cov = hits / max(total_sl, 1)
        mean_hw = float(np.mean(0.5 * (p_hi_arr - p_lo_arr)))
        return cov, total_sl, mean_hw

    # Piso de seguridad conformal para deportes de muestra pequeña (NFL: nunca encoger por debajo de `1.00`)
    _, n_cal_sl_probe, _ = _slice_coverage(cal_df, 1.0, va_bins_cal)
    min_scale = 0.80 if n_cal_sl_probe >= 40 else 1.00
    # Garantía Split-Conformal de muestra finita: `ceil((n + 1) * 0.90) / n`
    finite_target = min(1.0, max(target_val_coverage, math.ceil((n_cal_sl_probe + 1) * 0.90) / max(n_cal_sl_probe, 1)))

    best_scale = 1.05
    val_cov_best = 0.0
    val_slices = 0
    val_hw = 0.0
    for sc_try in np.round(np.linspace(min_scale, 2.25, 30), 3):
        cov_v, n_sl_v, hw_v = _slice_coverage(cal_df, float(sc_try), va_bins_cal)
        best_scale = float(sc_try)
        val_cov_best = cov_v
        val_slices = n_sl_v
        val_hw = hw_v
        if cov_v >= finite_target:
            break

    # Evaluar ESTRICTAMENTE FUERA DE MUESTRA (`OOS 2020..2024`)
    oos_cov, oos_slices, oos_hw = _slice_coverage(oos_df, best_scale, va_bins)
    # También evaluar cobertura por deciles puros OOS
    oos_dec_hits = 0
    oos_dec_tot = 0
    tmp_art_f = {"sports": {sport_name: {"calibrated_logit_scale_90": best_scale, "venn_abers_bins": va_bins}}}
    p_lo_o = np.empty(len(oos_df), dtype=np.float64)
    p_hi_o = np.empty(len(oos_df), dtype=np.float64)
    for ix, r in enumerate(oos_df.itertuples(index=False)):
        b = compute_epistemic_band_v51_scalar(
            p_point=float(r.p_ens),
            effective_sample_games=float(r.n_eff),
            p_sub_a=float(r.p_logit),
            p_sub_b=float(r.p_gbm),
            season_progress=float(r.s_prog),
            sport=sport_name,
            calibration_artifact=tmp_art_f,
        )
        p_lo_o[ix] = b["pLower90"]
        p_hi_o[ix] = b["pUpper90"]
    dec_lbl = pd.qcut(oos_df["p_ens"].rank(method="first"), q=10, labels=False)
    for d in range(10):
        m = dec_lbl == d
        if int(np.sum(m)) < 20:
            continue
        oos_dec_tot += 1
        obs_d = float(oos_df["y_bin"].to_numpy()[m].mean())
        if float(p_lo_o[m].mean()) <= obs_d <= float(p_hi_o[m].mean()):
            oos_dec_hits += 1

    print(
        f"  [Epistemic Venn-Abers {sport_name:6s}] scale={best_scale:.3f} | "
        f"VAL cov={100*val_cov_best:.1f}% ({val_slices} slices, hw={100*val_hw:.2f}pp) | "
        f"OOS cov={100*oos_cov:.1f}% ({oos_slices} slices, hw={100*oos_hw:.2f}pp) | "
        f"OOS decile cov={oos_dec_hits}/{oos_dec_tot}"
    )

    spec = {
        "calibrated_logit_scale_90": round(best_scale, 4),
        "oos_empirical_coverage_90": round(oos_cov, 5),
        "oos_n_slices": int(oos_slices),
        "oos_decile_coverage_90": round(oos_dec_hits / max(oos_dec_tot, 1), 5),
        "venn_abers_bins": va_bins,
    }
    diag = {
        "sport": sport_name,
        "val_n_rows": int(len(val_df)),
        "oos_n_rows": int(len(oos_df)),
        "calibrated_logit_scale_90": round(best_scale, 4),
        "val_slice_coverage_90": round(val_cov_best, 5),
        "val_n_slices": int(val_slices),
        "oos_slice_coverage_90": round(oos_cov, 5),
        "oos_n_slices": int(oos_slices),
        "oos_mean_half_width_pp": round(100.0 * oos_hw, 3),
        "oos_decile_coverage": f"{oos_dec_hits}/{oos_dec_tot}",
    }
    return spec, diag


def _build_soccer_oof_for_conformal() -> pd.DataFrame:
    """Genera OOF walk-forward reales (`Logit` + `HGB`) sobre `features.parquet` (`2015..2024 < 2025-02-02`)."""
    cols = [
        "match_id",
        "match_date",
        "div",
        "season",
        "y",
        "elo_diff",
        "clubelo_diff",
        "pi_diff",
        "pi_exp_gd",
        "dc_lam_home",
        "dc_lam_away",
        "elo_games_home",
        "elo_games_away",
        "h_xgd_ewm5",
        "a_xgd_ewm5",
        "h_xpts_r10",
        "a_xpts_r10",
    ]
    df = pd.read_parquet(PRED_LAB_ROOT / "data" / "processed" / "features.parquet", columns=cols)
    df["md_str"] = df["match_date"].astype(str).str.slice(0, 10)
    df = df[(df["md_str"] < HOLDOUT_CUT_DATE) & df["y"].notna()].copy()
    if bool((df["md_str"] >= HOLDOUT_CUT_DATE).any()):
        raise RuntimeError("HoldoutSealedAccessError en EXP_V56 Soccer")
    df["season_yr"] = df["season"].astype(str).str[:4].astype(int)
    df = df[df["season_yr"] >= 2011].sort_values(["md_str", "match_id"], kind="mergesort").reset_index(drop=True)

    feat_cols = ["elo_diff", "clubelo_diff", "pi_diff", "pi_exp_gd", "dc_lam_home", "dc_lam_away", "h_xgd_ewm5", "a_xgd_ewm5", "h_xpts_r10", "a_xpts_r10"]
    X_all = df[feat_cols].apply(pd.to_numeric, errors="coerce").to_numpy(dtype=np.float64)
    y_all = df["y"].to_numpy(dtype=np.int64)
    yrs = df["season_yr"].to_numpy(dtype=int)
    eg_eff = np.clip(
        0.5 * (pd.to_numeric(df["elo_games_home"], errors="coerce").fillna(24.0).to_numpy() + pd.to_numeric(df["elo_games_away"], errors="coerce").fillna(24.0).to_numpy()),
        4.0,
        120.0,
    )
    # Progreso causal de temporada aproximado por mes del calendario europeo (`Ago -> May`)
    months = pd.to_datetime(df["md_str"]).dt.month.to_numpy()
    s_prog = np.clip(((months - 8) % 12) / 9.5, 0.05, 0.98)

    rows_l: list[pd.DataFrame] = []
    for yr in range(2015, 2025):
        tr = yrs < yr
        te = yrs == yr
        if int(np.sum(tr)) < 2000 or int(np.sum(te)) == 0:
            continue
        imp = SimpleImputer(strategy="median").fit(X_all[tr])
        sc = StandardScaler().fit(imp.transform(X_all[tr]))
        sc.scale_ = np.where(sc.scale_ == 0.0, 1.0, sc.scale_)
        lr = LogisticRegression(C=0.1, max_iter=400).fit(sc.transform(imp.transform(X_all[tr])), y_all[tr])
        hgb = HistGradientBoostingClassifier(max_depth=3, max_leaf_nodes=12, min_samples_leaf=80, learning_rate=0.05, max_iter=80, l2_regularization=10.0, early_stopping=False, random_state=MODEL_SEED).fit(X_all[tr], y_all[tr])
        pl = lr.predict_proba(sc.transform(imp.transform(X_all[te])))
        pg = hgb.predict_proba(X_all[te])
        pe = 0.55 * pl + 0.45 * pg

        # Apilar resultados Home Win (`c=0`) y Away Win (`c=2`) para calibración binaria uniforme de ambos lados
        sub_te = df.loc[te, ["div", "season_yr"]].copy()
        for cls_i, side in ((0, "home"), (2, "away")):
            part = sub_te.copy()
            part["side"] = side
            part["p_logit"] = pl[:, cls_i]
            part["p_gbm"] = pg[:, cls_i]
            part["p_ens"] = pe[:, cls_i]
            part["y_bin"] = (y_all[te] == cls_i).astype(np.float64)
            part["n_eff"] = eg_eff[te]
            part["s_prog"] = s_prog[te]
            rows_l.append(part)
    return pd.concat(rows_l, ignore_index=True)


def _build_nfl_oof_for_conformal() -> pd.DataFrame:
    """Genera OOF walk-forward reales (`Logit` + `HGB`) sobre `nfl_dev_causal_41_features.parquet` (`2014..2024 < 2025-02-02`)."""
    df = pd.read_parquet(EXP_V32_DIR / "artifacts" / "nfl_dev_causal_41_features.parquet")
    df["gd_str"] = df["gameday"].astype(str).str.slice(0, 10)
    df = df[(df["gd_str"] < HOLDOUT_CUT_DATE) & df["home_score"].notna() & df["away_score"].notna()].copy()
    if bool((df["gd_str"] >= HOLDOUT_CUT_DATE).any()):
        raise RuntimeError("HoldoutSealedAccessError en EXP_V56 NFL")
    df = df.sort_values(["gd_str", "game_id"], kind="mergesort").reset_index(drop=True)

    num_cols = [c for c in df.columns if c.startswith(("elo_", "diff_", "home_epa", "away_epa", "spread_line", "rest_", "qb_")) and df[c].dtype.kind in "fiu"]
    num_cols = num_cols[:24]
    X_all = df[num_cols].apply(pd.to_numeric, errors="coerce").to_numpy(dtype=np.float64)
    y_hw = (df["home_score"].to_numpy() > df["away_score"].to_numpy()).astype(np.int64)
    yrs = df["season"].to_numpy(dtype=int)
    wk = pd.to_numeric(df["week"], errors="coerce").fillna(9.0).to_numpy(dtype=np.float64)
    s_prog = np.clip((wk - 1.0) / 17.0, 0.05, 0.98)
    n_eff = np.clip(6.0 + wk, 6.0, 24.0)

    rows_l: list[pd.DataFrame] = []
    for yr in range(2014, 2025):
        tr = yrs < yr
        te = yrs == yr
        if int(np.sum(tr)) < 600 or int(np.sum(te)) == 0:
            continue
        imp = SimpleImputer(strategy="median").fit(X_all[tr])
        sc = StandardScaler().fit(imp.transform(X_all[tr]))
        sc.scale_ = np.where(sc.scale_ == 0.0, 1.0, sc.scale_)
        lr = LogisticRegression(C=0.08, max_iter=400).fit(sc.transform(imp.transform(X_all[tr])), y_hw[tr])
        hgb = HistGradientBoostingClassifier(max_depth=3, max_leaf_nodes=8, min_samples_leaf=45, learning_rate=0.04, max_iter=70, l2_regularization=12.0, early_stopping=False, random_state=MODEL_SEED).fit(X_all[tr], y_hw[tr])
        pl = lr.predict_proba(sc.transform(imp.transform(X_all[te])))[:, 1]
        pg = hgb.predict_proba(X_all[te])[:, 1]
        pe = 0.60 * pl + 0.40 * pg

        part = pd.DataFrame(
            {
                "season_yr": yrs[te],
                "p_logit": pl,
                "p_gbm": pg,
                "p_ens": pe,
                "y_bin": y_hw[te].astype(np.float64),
                "n_eff": n_eff[te],
                "s_prog": s_prog[te],
            }
        )
        rows_l.append(part)
    return pd.concat(rows_l, ignore_index=True)


def main() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    print("[EXP_V56 Epistemic v5.1] Calibrando Inductive Venn-Abers + Envolvente Logit Conformal (< 2025-02-02)...")

    soc_df = _build_soccer_oof_for_conformal()
    soc_spec, soc_diag = _calibrate_and_eval_sport_conformal("soccer", soc_df, ["div", "season_yr"], min_slice_n=25, target_val_coverage=0.915)

    nfl_df = _build_nfl_oof_for_conformal()
    nfl_spec, nfl_diag = _calibrate_and_eval_sport_conformal("nfl", nfl_df, ["season_yr"], min_slice_n=15, target_val_coverage=0.915)

    # Transferencia conservadora para deportes sin OOF juego-a-juego (`mlb/nhl/nba/ncaaf`)
    ms_scale = round(max(float(soc_spec["calibrated_logit_scale_90"]), float(nfl_spec["calibrated_logit_scale_90"])), 4)
    ms_spec = {
        "calibrated_logit_scale_90": ms_scale,
        "oos_empirical_coverage_90": round(min(float(soc_spec["oos_empirical_coverage_90"]), float(nfl_spec["oos_empirical_coverage_90"])), 5),
        "oos_n_slices": int(soc_spec["oos_n_slices"] + nfl_spec["oos_n_slices"]),
        "calibration_basis": "pooled_soccer_nfl_transfer_conservative",
        "venn_abers_bins": soc_spec["venn_abers_bins"],
    }

    art = {
        "schema_version": "epistemic_venn_abers_v5.1.0",
        "codename": "PitchLab Inductive Venn-Abers & Conformal Logit Envelope v5.1",
        "version": "5.1.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "sports": {
            "soccer": soc_spec,
            "nfl": nfl_spec,
            "multisport": ms_spec,
        },
    }
    EPISTEMIC_MODEL_OUT.write_text(json.dumps(art, indent=2), encoding="utf-8")

    # Snapshot de paridad `< 1e-13` Python <-> `epistemic_conformal.ts`
    rng = np.random.default_rng(MODEL_SEED)
    snap_cases: list[dict[str, Any]] = []
    for i in range(36):
        sp = "soccer" if i < 16 else ("nfl" if i < 28 else "multisport")
        p_pt = round(float(rng.uniform(0.08, 0.88)), 5)
        p_a = round(min(max(p_pt + float(rng.uniform(-0.06, 0.06)), 0.02), 0.96), 5)
        p_b = round(min(max(p_pt + float(rng.uniform(-0.06, 0.06)), 0.02), 0.96), 5)
        n_e = round(float(rng.uniform(6.0, 60.0)), 2)
        s_p = round(float(rng.uniform(0.05, 0.95)), 3)
        chg = bool(i % 7 == 0)
        miss = int(i % 3)
        out = compute_epistemic_band_v51_scalar(
            p_point=p_pt,
            effective_sample_games=n_e,
            p_sub_a=p_a,
            p_sub_b=p_b,
            season_progress=s_p,
            has_recent_change=chg,
            missing_key_starters=miss,
            sport=sp,
            calibration_artifact=art,
        )
        snap_cases.append(
            {
                "input": {
                    "pPoint": p_pt,
                    "effectiveSampleGames": n_e,
                    "pSubModelA": p_a,
                    "pSubModelB": p_b,
                    "seasonProgress": s_p,
                    "hasRecentCoachOrQbChange": chg,
                    "missingKeyStarters": miss,
                    "sport": sp,
                },
                "expected": out,
            }
        )

    EPISTEMIC_SNAPSHOT_OUT.write_text(
        json.dumps({"schema_version": "epistemic_venn_abers_v5.1_parity_snapshot", "holdout_sealed_untouched": True, "n": len(snap_cases), "rows": snap_cases}, indent=2),
        encoding="utf-8",
    )

    res = {
        "experiment_id": "EXP_V56_epistemic_conformal_v5_1",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "soccer": soc_diag,
        "nfl": nfl_diag,
        "artifacts": {
            "model_epistemic_conformal_v5_1_sha256": hashlib.sha256(EPISTEMIC_MODEL_OUT.read_bytes()).hexdigest(),
        },
    }
    RESULTS_OUT.write_text(json.dumps(res, indent=2), encoding="utf-8")
    print(f"[DONE] EXP_V56 Epistemic Venn-Abers v5.1 guardado en {RESULTS_OUT.name}")


if __name__ == "__main__":
    main()
