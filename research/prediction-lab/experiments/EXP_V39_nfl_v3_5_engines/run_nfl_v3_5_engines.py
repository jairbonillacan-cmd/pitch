"""EXP_V39 — Mejora arquitectónica integral de NFL (`PitchLab Minkowski v3.5`):
  1. Nuevas señales PBP estrictamente causales (`w' < w`, `< 2025-02-02T17:30:00Z`) desde el artefacto local
     `EXP_V32_nfl_epa/artifacts/nfl_pbp_team_game_1999_2024_dev.parquet` (`0` llamadas de red):
       - `clipped_epa_off_diff` / `clipped_epa_def_diff`: EPA winsorizado `[-0.24, +0.28]` que filtra partidos
         atípicos de 4–5 entregas fortuitas.
       - `turnover_luck_diff`: brecha `raw_epa - clipped_epa` (regresión a la media de suerte en entregas).
       - `opp_adj_epa_net_diff`: EPA ajustado causalmente por la defensa/ataque pre-partido del rival.
       - `ed_epa_off_diff` / `ed_epa_def_diff`: EPA continuo en `1st/2nd down`.
       - `sack_rate_net_diff`: diferencial neto de capturas generadas menos permitidas.
       - `fast_epa_mom_diff`: momentum corto (`decay = 0.72` vs `0.88`).
  2. `PitchLab Minkowski v3.5 Ensemble` (`Moneyline` / `Spread`):
     - Elevación hiperbólica exacta de `HistGradientBoostingClassifier` binario (`Home vs Away` sobre `y != 1`)
       al formato `3`-clases `[+0.5*T, 0, -0.5*T]` de `gbm.ts` (`gbm_nfl_v3_5_candidate.json`), preservando
       paridad `< 1e-14` con `clf_bin.predict_proba(X)[:, 1]` y permitiendo ejecutar el ensamble
       `Logit + HGB Calibrado` nativamente en TypeScript (`< 0.03 ms`/partido).
     - Selección estricta de subconjunto de features, `C`, temperatura `T` y `w_gbm` en `VAL 2010..2019` (`n = 2,552`).
  3. `PitchLab Minkowski Totals v3.5` (`Totals` O/U):
     - Regresor `Ridge` causal para `expectedTotal` + calibración de `sigma_total` en `VAL 2010..2019`
       frente al prior constante `44.5` de `v3.0`.
"""

from __future__ import annotations

import os

os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("LOKY_MAX_CPU_COUNT", "4")

from collections import defaultdict, deque
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys
from typing import Any, Mapping, Sequence

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.preprocessing import StandardScaler

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"
EXP_V32_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V32_nfl_epa"
ARTIFACTS_DIR = EXP_DIR / "artifacts"

for _p in (str(REPO_ROOT), str(EXP_V32_DIR), str(EXP_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from services.models import export_gbm_ts as eg  # noqa: E402
from services.models import outlook_calibration as oc  # noqa: E402

from causal_epa_features import (  # noqa: E402
    BASE_29_FEATURES,
    CANDIDATE_41_FEATURES,
    NFL_DIVISIONS,
    NFL_STADIUM_ELEVATION_M,
    TEAM_IN_SEASON_DECAY,
    TEAM_OFFSEASON_RETENTION,
    TEAM_PRIOR_KAPPA_GAMES,
    canonical_franchise,
)
from pbp_ingest import (  # noqa: E402
    HOLDOUT_CUT_DATE,
    HOLDOUT_CUT_ISO,
    assert_dates_strictly_before_holdout,
)
from run_experiment import (  # noqa: E402
    BOOTSTRAP_SAMPLES,
    BOOTSTRAP_SEED,
    FIRST_EVAL_SEASON,
    FIRST_TRAIN_SEASON,
    HGB_PARAMS as V32_HGB_PARAMS,
    PROB_CLIP,
    TIE_RATE_FLOOR,
    VAL_MAX_SEASON,
    fit_minkowski_logit_pipeline,
    normalize_2way_from_3way,
    paired_delta_ll_mulberry32,
    predict_logit_3way_exact,
)

PROB_LOG_FLOOR = 1e-15
MODEL_SEED = 42

V35_EXTRA_8_NFL_FEATURES: list[str] = [
    "clipped_epa_off_diff",
    "clipped_epa_def_diff",
    "turnover_luck_diff",
    "opp_adj_epa_net_diff",
    "ed_epa_off_diff",
    "ed_epa_def_diff",
    "sack_rate_net_diff",
    "fast_epa_mom_diff",
]

NFL_TOTALS_12_FEATURES: list[str] = [
    "ewm_pts_total_sum",
    "pace_plays_sum",
    "clipped_epa_sum",
    "pass_rate_sum",
    "qb_epa_sum",
    "ewm_off_plus_def_sum",
    "abs_comp_elo_diff",
    "is_indoor",
    "wind_outdoor",
    "cold_outdoor",
    "div_game",
    "venue_elev_km",
]

GBM_NFL_V35_OUT = REPO_ROOT / "src" / "data" / "prediction" / "gbm_nfl_v3_5_candidate.json"
LOGIT_NFL_V35_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_nfl_v3_5_candidate.json"
TOTALS_NFL_V35_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_nfl_totals_v3_5_candidate.json"
STATE_NFL_V35_OUT = REPO_ROOT / "src" / "data" / "prediction" / "nfl_causal_state_v3_5.json"
SNAP_NFL_V35_OUT = REPO_ROOT / "src" / "data" / "prediction" / "nfl_v3_5_snapshot.json"
RESULTS_NFL_V35_OUT = ARTIFACTS_DIR / "exp_v39_nfl_v3_5_results.json"
TRIAL_REGISTRY_NFL_V35_OUT = EXP_DIR / "trial_registry_nfl_v35.jsonl"


def _normal_cdf_vec(x: np.ndarray) -> np.ndarray:
    from scipy.special import erf

    return 0.5 * (1.0 + erf(np.asarray(x, dtype=np.float64) / math.sqrt(2.0)))


def _compute_normal_totals_probs_vec(
    total_line: np.ndarray,
    expected_total: np.ndarray,
    sigma_total: float,
) -> np.ndarray:
    tl = np.asarray(total_line, dtype=np.float64)
    et = np.asarray(expected_total, dtype=np.float64)
    is_int = np.abs(tl - np.round(tl)) < 1e-9
    thr = np.round(tl)

    p_ov_int = 1.0 - _normal_cdf_vec((thr + 0.5 - et) / sigma_total)
    p_un_int = _normal_cdf_vec((thr - 0.5 - et) / sigma_total)
    act = np.maximum(p_ov_int + p_un_int, 1e-12)
    p_ov_from_int = np.where(p_ov_int + p_un_int > 1e-12, p_ov_int / act, 0.5)

    p_ov_half = np.clip(_normal_cdf_vec((et - tl) / sigma_total), 1e-9, 1.0 - 1e-9)
    p_ov = np.where(is_int, p_ov_from_int, p_ov_half)
    return np.column_stack([p_ov, 1.0 - p_ov])


def _apply_temperature_3way_exact(probs: np.ndarray, temperature: float) -> np.ndarray:
    if abs(float(temperature) - 1.0) < 1e-12:
        return np.asarray(probs, dtype=np.float64)
    inv_t = 1.0 / float(temperature)
    lg = np.log(np.maximum(np.asarray(probs, dtype=np.float64), PROB_LOG_FLOOR)) * inv_t
    lg -= np.max(lg, axis=1, keepdims=True)
    ez = np.exp(lg)
    return ez / np.sum(ez, axis=1, keepdims=True)


def _blend_3way_exact(
    probs_logit: np.ndarray,
    probs_gbm_cal: np.ndarray,
    w_logit: float,
    w_gbm: float,
    blend_space: str,
) -> np.ndarray:
    pl = np.asarray(probs_logit, dtype=np.float64)
    pg = np.asarray(probs_gbm_cal, dtype=np.float64)
    if blend_space == "logit":
        lg = float(w_logit) * np.log(np.maximum(pl, PROB_LOG_FLOOR)) + float(w_gbm) * np.log(
            np.maximum(pg, PROB_LOG_FLOOR)
        )
        lg -= np.max(lg, axis=1, keepdims=True)
        ez = np.exp(lg)
        return ez / np.sum(ez, axis=1, keepdims=True)
    raw = float(w_logit) * pl + float(w_gbm) * pg
    return raw / np.sum(raw, axis=1, keepdims=True)


def fit_binary_minkowski_hgb(
    X_arr: np.ndarray,
    y_arr: np.ndarray,
    sample_weight: np.ndarray | None = None,
) -> tuple[HistGradientBoostingClassifier, float]:
    """Entrena `HistGradientBoostingClassifier` binario sobre partidos sin empate (`y != 1`),
    donde `1 = Home (y==0)` y `0 = Away (y==2)`."""
    tau = float(max(np.mean(y_arr == 1), TIE_RATE_FLOOR))
    nt = y_arr != 1
    y_bin = (y_arr[nt] == 0).astype(int)
    sw = sample_weight[nt] if sample_weight is not None else None
    params = dict(V32_HGB_PARAMS)
    params["early_stopping"] = False
    hgb = HistGradientBoostingClassifier(**params)
    hgb.fit(X_arr[nt], y_bin, sample_weight=sw)
    return hgb, tau


def predict_binary_hgb_lifted_3way(
    hgb_bin: HistGradientBoostingClassifier,
    tau: float,
    X_arr: np.ndarray,
) -> np.ndarray:
    """Evalúa `softmax([+0.5*raw, b_tie, -0.5*raw])` exacto, idéntico a `serialize_binary_minkowski_hgb_to_3way_artifact`."""
    raw = np.asarray(hgb_bin.decision_function(X_arr), dtype=np.float64).reshape(-1)
    b_tie = math.log(2.0 * float(tau) * math.cosh(0.32) / (1.0 - float(tau)))
    logits = np.column_stack([0.5 * raw, np.full(len(raw), b_tie, dtype=np.float64), -0.5 * raw])
    logits -= np.max(logits, axis=1, keepdims=True)
    ez = np.exp(logits)
    return ez / np.sum(ez, axis=1, keepdims=True)


def serialize_binary_minkowski_hgb_to_3way_artifact(
    hgb_bin: HistGradientBoostingClassifier,
    tau: float,
    *,
    base_feature_names: Sequence[str],
    temperature: float,
    blend_space: str,
    w_logit: float,
    w_gbm: float,
    logit_companion: Mapping[str, Any],
    activation_verdict: Mapping[str, Any],
    training_window: Mapping[str, Any],
    calibrated_on_window: Mapping[str, Any],
    codename: str,
    version: str,
    seed: int = MODEL_SEED,
) -> dict[str, Any]:
    """Eleva un `HistGradientBoostingClassifier` binario (`1` árbol por iteración) al esquema exacto
    `GbmArtifact` de `3` clases (`[Home=0, Tie=1, Away=2]`) consumido por `src/domain/prediction/gbm.ts`:
      - Clase 0 (`Home`): `+0.5 * tree_bin`
      - Clase 1 (`Tie`) : hoja constante `0.0` (con `baseline[1] = b_tie`)
      - Clase 2 (`Away`): `-0.5 * tree_bin`
    Preserva `pHome / (pHome + pAway) == sigmoid(raw_pred)` a precisión IEEE-754 `< 1e-15`.
    """
    b0 = float(np.asarray(hgb_bin._baseline_prediction, dtype=np.float64).reshape(-1)[0])
    b_tie = math.log(2.0 * float(tau) * math.cosh(0.32) / (1.0 - float(tau)))
    predictors = hgb_bin._predictors
    n_iter = len(predictors)
    trees_out: list[dict[str, Any]] = []

    for it_idx, iter_preds in enumerate(predictors):
        tp = iter_preds[0]
        nodes = tp.nodes
        n_nodes = int(len(nodes))
        is_leaf = [int(v) for v in nodes["is_leaf"].tolist()]
        feat_idx = [-1 if lf == 1 else int(f) for lf, f in zip(is_leaf, nodes["feature_idx"].tolist())]
        num_thr = [0.0 if lf == 1 else float(th) for lf, th in zip(is_leaf, nodes["num_threshold"].tolist())]
        left_arr = [0 if lf == 1 else int(l_i) for lf, l_i in zip(is_leaf, nodes["left"].tolist())]
        right_arr = [0 if lf == 1 else int(r_i) for lf, r_i in zip(is_leaf, nodes["right"].tolist())]
        raw_vals = [float(val) if lf == 1 else 0.0 for lf, val in zip(is_leaf, nodes["value"].tolist())]
        miss_left = [0 if lf == 1 else int(ml) for lf, ml in zip(is_leaf, nodes["missing_go_to_left"].tolist())]

        # Clase 0: +0.5 * v
        trees_out.append(
            {
                "iteration": int(it_idx),
                "class_index": 0,
                "n_nodes": n_nodes,
                "is_leaf": is_leaf,
                "feature_idx": feat_idx,
                "num_threshold": num_thr,
                "left": left_arr,
                "right": right_arr,
                "value": [0.5 * v for v in raw_vals],
                "missing_go_to_left": miss_left,
            }
        )
        # Clase 1 (Tie): hoja constante 0.0
        trees_out.append(
            {
                "iteration": int(it_idx),
                "class_index": 1,
                "n_nodes": 1,
                "is_leaf": [1],
                "feature_idx": [-1],
                "num_threshold": [0.0],
                "left": [0],
                "right": [0],
                "value": [0.0],
                "missing_go_to_left": [0],
            }
        )
        # Clase 2: -0.5 * v
        trees_out.append(
            {
                "iteration": int(it_idx),
                "class_index": 2,
                "n_nodes": n_nodes,
                "is_leaf": is_leaf,
                "feature_idx": feat_idx,
                "num_threshold": num_thr,
                "left": left_arr,
                "right": right_arr,
                "value": [-0.5 * v for v in raw_vals],
                "missing_go_to_left": miss_left,
            }
        )

    return {
        "schema_version": eg.GBM_SCHEMA_VERSION,
        "type": "hist_gradient_boosting_multiclass",
        "codename": codename,
        "version": version,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": int(seed),
        "production_activated": False,
        "activation_verdict": dict(activation_verdict),
        "n_classes": 3,
        "classes": [0, 1, 2],
        "n_iter": int(n_iter),
        "n_trees": len(trees_out),
        "features": list(base_feature_names),
        "n_features_base": len(base_feature_names),
        "div_levels": [],
        "categorical_features": [],
        "baseline_prediction": [0.5 * b0, b_tie, -0.5 * b0],
        "calibration": {
            "temperature": float(temperature),
            "blend_space": str(blend_space),
            "w_logit": float(w_logit),
            "w_gbm": float(w_gbm),
            "calibrated_on_window": dict(calibrated_on_window),
        },
        "logit_companion": dict(logit_companion),
        "training_window": dict(training_window),
        "trees": trees_out,
    }


def build_or_load_v35_pbp_game_metrics() -> pd.DataFrame:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    tg = pd.read_parquet(EXP_V32_DIR / "artifacts" / "nfl_pbp_team_game_1999_2024_dev.parquet").copy()
    assert_dates_strictly_before_holdout(tg["game_date"], context="v35_pbp_team_game")

    off_raw = tg["off_epa_pp"].to_numpy(dtype=np.float64)
    def_raw = tg["def_epa_pp"].to_numpy(dtype=np.float64)
    off_clip = np.clip(off_raw, -0.24, 0.28)
    def_clip = np.clip(def_raw, -0.24, 0.28)

    n_pl = np.maximum(tg["n_plays"].fillna(62.0).to_numpy(dtype=np.float64), 1.0)
    def_n_pl = np.maximum(tg["def_n_plays"].fillna(62.0).to_numpy(dtype=np.float64), 1.0)
    n_db = tg["n_db"].fillna(34.0).to_numpy(dtype=np.float64)
    def_n_db = tg["def_n_db"].fillna(34.0).to_numpy(dtype=np.float64)

    tg["off_clip_epa_pp"] = off_clip
    tg["def_clip_epa_pp"] = def_clip
    tg["off_luck_epa_pp"] = np.where(np.isfinite(off_raw), off_raw - off_clip, 0.0)
    tg["def_luck_epa_pp"] = np.where(np.isfinite(def_raw), def_raw - def_clip, 0.0)
    tg["off_pass_rate"] = np.clip(n_db / n_pl, 0.15, 0.90)
    tg["def_pass_rate"] = np.clip(def_n_db / def_n_pl, 0.15, 0.90)
    tg["tot_scrim_plays"] = n_pl + def_n_pl
    return tg[
        [
            "game_id",
            "team",
            "game_date",
            "off_clip_epa_pp",
            "def_clip_epa_pp",
            "off_luck_epa_pp",
            "def_luck_epa_pp",
            "off_ed_epa_pp",
            "def_ed_epa_pp",
            "off_pass_rate",
            "def_pass_rate",
            "tot_scrim_plays",
            "off_sack_rate",
            "def_sack_rate",
        ]
    ]


def attach_causal_v35_nfl_features(
    dev_41_df: pd.DataFrame,
    v35_tg_df: pd.DataFrame,
) -> tuple[pd.DataFrame, dict[str, dict[str, float]]]:
    df = dev_41_df.sort_values(["gameday", "season", "week", "game_id"], kind="mergesort").reset_index(drop=True)
    assert_dates_strictly_before_holdout(df["gameday"], context="attach_causal_v35_nfl_features")

    tg_lookup: dict[tuple[str, str], dict[str, Any]] = {}
    for r in v35_tg_df.to_dict("records"):
        tm = canonical_franchise(str(r["team"]))
        tg_lookup[(str(r["game_id"]), tm)] = r

    priors = {
        "off_clip": 0.015,
        "def_clip": 0.015,
        "net_luck": 0.0,
        "opp_adj_net": 0.0,
        "off_ed": 0.005,
        "def_ed": 0.005,
        "off_pass": 0.560,
        "def_pass": 0.560,
        "off_sack": 0.066,
        "def_sack": 0.066,
        "pace_plays": 124.0,
        "pts_total": 44.0,
    }

    w_slow: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    s_slow: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    w_fast: dict[str, float] = defaultdict(float)
    s_fast: dict[str, float] = defaultdict(float)
    last_season: dict[str, int] = {}

    lg_buf: dict[str, deque[float]] = {k: deque([v] * 64, maxlen=1536) for k, v in priors.items()}

    def _post(fran: str, m: str, kappa: float = TEAM_PRIOR_KAPPA_GAMES) -> float:
        pr = float(np.mean(lg_buf[m]))
        w = w_slow[fran][m]
        s = s_slow[fran][m]
        return float((s + kappa * pr) / (w + kappa))

    def _post_fast(fran: str) -> float:
        return float(s_fast[fran] / (w_fast[fran] + 2.5))

    n = len(df)
    out = {c: np.zeros(n, dtype=np.float64) for c in V35_EXTRA_8_NFL_FEATURES + NFL_TOTALS_12_FEATURES}

    df["gameday_str"] = df["gameday"].astype(str).str[:10]
    for _, day_grp in df.groupby("gameday_str", sort=False):
        s_yr = int(day_grp["season"].iloc[0])
        day_indices = day_grp.index.to_list()

        touched_teams = {canonical_franchise(str(t)) for t in day_grp["home_team"]} | {
            canonical_franchise(str(t)) for t in day_grp["away_team"]
        }
        for fr in touched_teams:
            ps = last_season.get(fr)
            if ps is not None and s_yr > ps:
                for m in priors:
                    w_slow[fr][m] *= TEAM_OFFSEASON_RETENTION
                    s_slow[fr][m] *= TEAM_OFFSEASON_RETENTION
                w_fast[fr] *= 0.25
                s_fast[fr] *= 0.25
            last_season[fr] = s_yr

        pre_def_clip: dict[str, float] = {}
        pre_off_clip: dict[str, float] = {}
        for idx in day_indices:
            r = df.iloc[idx]
            hf = canonical_franchise(str(r["home_team"]))
            af = canonical_franchise(str(r["away_team"]))

            hc_off, hc_def = _post(hf, "off_clip"), _post(hf, "def_clip")
            ac_off, ac_def = _post(af, "off_clip"), _post(af, "def_clip")
            pre_def_clip[hf], pre_off_clip[hf] = hc_def, hc_off
            pre_def_clip[af], pre_off_clip[af] = ac_def, ac_off

            out["clipped_epa_off_diff"][idx] = hc_off - ac_off
            out["clipped_epa_def_diff"][idx] = ac_def - hc_def
            out["turnover_luck_diff"][idx] = _post(hf, "net_luck", 8.0) - _post(af, "net_luck", 8.0)
            out["opp_adj_epa_net_diff"][idx] = _post(hf, "opp_adj_net") - _post(af, "opp_adj_net")
            out["ed_epa_off_diff"][idx] = _post(hf, "off_ed") - _post(af, "off_ed")
            out["ed_epa_def_diff"][idx] = _post(af, "def_ed") - _post(hf, "def_ed")
            out["sack_rate_net_diff"][idx] = (_post(hf, "def_sack") - _post(hf, "off_sack")) - (
                _post(af, "def_sack") - _post(af, "off_sack")
            )
            out["fast_epa_mom_diff"][idx] = (_post_fast(hf) - (hc_off - hc_def)) - (_post_fast(af) - (ac_off - ac_def))

            out["ewm_pts_total_sum"][idx] = 0.5 * (_post(hf, "pts_total", 8.0) + _post(af, "pts_total", 8.0))
            out["pace_plays_sum"][idx] = 0.5 * (_post(hf, "pace_plays", 8.0) + _post(af, "pace_plays", 8.0))
            out["clipped_epa_sum"][idx] = (hc_off + ac_def) + (ac_off + hc_def)
            out["pass_rate_sum"][idx] = 0.5 * ((_post(hf, "off_pass") + _post(af, "def_pass")) + (_post(af, "off_pass") + _post(hf, "def_pass")))
            q_diff = float(r["qb_epa_per_db_diff"]) if pd.notna(r["qb_epa_per_db_diff"]) else 0.0
            out["qb_epa_sum"][idx] = abs(q_diff)
            ewm_o = float(r["ewm_off_diff"]) if pd.notna(r["ewm_off_diff"]) else 0.0
            ewm_d = float(r["ewm_def_diff"]) if pd.notna(r["ewm_def_diff"]) else 0.0
            out["ewm_off_plus_def_sum"][idx] = ewm_o - ewm_d
            comp_d = float(r["composite_elo_diff"]) if pd.notna(r["composite_elo_diff"]) else 0.0
            out["abs_comp_elo_diff"][idx] = abs(comp_d) / 200.0
            out["is_indoor"][idx] = float(r["is_indoor"]) if pd.notna(r["is_indoor"]) else 0.0
            out["wind_outdoor"][idx] = float(r["wind_outdoor"]) if pd.notna(r["wind_outdoor"]) else 0.0
            out["cold_outdoor"][idx] = float(r["cold_outdoor"]) if pd.notna(r["cold_outdoor"]) else 0.0
            out["div_game"][idx] = float(r["div_game"]) if pd.notna(r["div_game"]) else 0.0
            neut_f = float(r["neutral_site"]) if pd.notna(r["neutral_site"]) else 0.0
            out["venue_elev_km"][idx] = 0.1 if neut_f > 0.5 else NFL_STADIUM_ELEVATION_M.get(hf, 100.0) / 1000.0

        for idx in day_indices:
            r = df.iloc[idx]
            gid = str(r["game_id"])
            hf = canonical_franchise(str(r["home_team"]))
            af = canonical_franchise(str(r["away_team"]))
            hs = float(r["home_score"])
            as_ = float(r["away_score"])
            tot_pts = min(95.0, max(6.0, hs + as_))

            for fr, opp_fr in ((hf, af), (af, hf)):
                rec = tg_lookup.get((gid, fr))
                w_slow[fr]["pts_total"] = TEAM_IN_SEASON_DECAY * w_slow[fr]["pts_total"] + 1.0
                s_slow[fr]["pts_total"] = TEAM_IN_SEASON_DECAY * s_slow[fr]["pts_total"] + tot_pts
                lg_buf["pts_total"].append(tot_pts)

                if rec is None:
                    continue
                oc_v = float(rec["off_clip_epa_pp"])
                dc_v = float(rec["def_clip_epa_pp"])
                lk_v = float(rec["off_luck_epa_pp"]) - float(rec["def_luck_epa_pp"])
                opp_adj_v = (oc_v - pre_def_clip.get(opp_fr, 0.015)) - (dc_v - pre_off_clip.get(opp_fr, 0.015))

                obs_map = {
                    "off_clip": oc_v,
                    "def_clip": dc_v,
                    "net_luck": lk_v,
                    "opp_adj_net": opp_adj_v,
                    "off_ed": float(rec["off_ed_epa_pp"]),
                    "def_ed": float(rec["def_ed_epa_pp"]),
                    "off_pass": float(rec["off_pass_rate"]),
                    "def_pass": float(rec["def_pass_rate"]),
                    "off_sack": float(rec["off_sack_rate"]),
                    "def_sack": float(rec["def_sack_rate"]),
                    "pace_plays": float(rec["tot_scrim_plays"]),
                }
                for m_k, fv in obs_map.items():
                    if math.isfinite(fv):
                        w_slow[fr][m_k] = TEAM_IN_SEASON_DECAY * w_slow[fr][m_k] + 1.0
                        s_slow[fr][m_k] = TEAM_IN_SEASON_DECAY * s_slow[fr][m_k] + fv
                        lg_buf[m_k].append(fv)

                net_c = oc_v - dc_v
                if math.isfinite(net_c):
                    w_fast[fr] = 0.72 * w_fast[fr] + 1.0
                    s_fast[fr] = 0.72 * s_fast[fr] + net_c

    out_df = df.copy()
    for c_nm, arr in out.items():
        if c_nm not in ("is_indoor", "wind_outdoor", "cold_outdoor", "div_game"):
            out_df[c_nm] = arr
        elif c_nm not in out_df.columns:
            out_df[c_nm] = arr

    all_32 = sorted({canonical_franchise(t) for t in NFL_DIVISIONS if t not in ("STL", "SD", "OAK")})
    v35_state_by_fran: dict[str, dict[str, float]] = {}
    for fr in all_32:
        oc_p = _post(fr, "off_clip")
        dc_p = _post(fr, "def_clip")
        v35_state_by_fran[fr] = {
            "off_clip": round(oc_p, 6),
            "def_clip": round(dc_p, 6),
            "net_luck": round(_post(fr, "net_luck", 8.0), 6),
            "opp_adj_net": round(_post(fr, "opp_adj_net"), 6),
            "off_ed": round(_post(fr, "off_ed"), 6),
            "def_ed": round(_post(fr, "def_ed"), 6),
            "off_pass": round(_post(fr, "off_pass"), 6),
            "def_pass": round(_post(fr, "def_pass"), 6),
            "off_sack": round(_post(fr, "off_sack"), 6),
            "def_sack": round(_post(fr, "def_sack"), 6),
            "fast_epa_mom": round(_post_fast(fr) - (oc_p - dc_p), 6),
            "pace_plays": round(_post(fr, "pace_plays", 8.0), 4),
            "pts_total": round(_post(fr, "pts_total", 8.0), 4),
        }
    return out_df, v35_state_by_fran


def _run_logit_wf_cols(wf_df: pd.DataFrame, cols: list[str], c_reg: float) -> np.ndarray:
    eval_seasons = [s for s in sorted(wf_df["season"].unique()) if int(s) >= FIRST_EVAL_SEASON]
    parts: list[np.ndarray] = []
    for s in eval_seasons:
        tr = wf_df[(wf_df["season"] >= FIRST_TRAIN_SEASON) & (wf_df["season"] < s)]
        te = wf_df[wf_df["season"] == s]
        y_tr = tr["y"].to_numpy(dtype=int)
        sw = 0.5 ** ((s - 1 - tr["season"].to_numpy(dtype=np.float64)) / 10.0)
        imp = SimpleImputer(strategy="mean").fit(tr[cols].to_numpy(dtype=np.float64))
        pipe = fit_minkowski_logit_pipeline(imp.transform(tr[cols].to_numpy(dtype=np.float64)), y_tr, c_reg, sample_weight=sw)
        parts.append(predict_logit_3way_exact(pipe, imp.transform(te[cols].to_numpy(dtype=np.float64))))
    return np.vstack(parts)


def main() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    dev_41 = pd.read_parquet(EXP_V32_DIR / "artifacts" / "nfl_dev_causal_41_features.parquet")
    assert_dates_strictly_before_holdout(dev_41["gameday"], context="dev_41")
    v32_state = json.loads((EXP_V32_DIR / "artifacts" / "causal_state_dev.json").read_text(encoding="utf-8"))

    v35_tg = build_or_load_v35_pbp_game_metrics()
    wf_df, v35_fran_state = attach_causal_v35_nfl_features(dev_41, v35_tg)

    v30_preds_csv = pd.read_csv(PRED_LAB_ROOT / "models" / "nfl" / "artifacts" / "predictions.csv")
    v30_preds_dev = v30_preds_csv[
        (v30_preds_csv["model"] == "blend") & (v30_preds_csv["gameday"].astype(str).str[:10] < HOLDOUT_CUT_DATE)
    ].copy()
    v30_blend_map: dict[str, tuple[float, float, float]] = {
        str(r.game_id): (float(r.p_home), float(r.p_draw), float(r.p_away))
        for r in v30_preds_dev.itertuples(index=False)
    }

    eval_seasons = [s for s in sorted(wf_df["season"].unique()) if int(s) >= FIRST_EVAL_SEASON]
    oof_meta = wf_df[wf_df["season"] >= FIRST_EVAL_SEASON][
        ["game_id", "gameday", "season", "week", "home_team", "away_team", "home_score", "away_score", "y", "total_line"]
    ].reset_index(drop=True)
    y3_oof = oof_meta["y"].to_numpy(dtype=int)
    nt = y3_oof != 1
    y2_nt = np.where(y3_oof[nt] == 0, 0, 1)
    seasons_nt = oof_meta.loc[nt, "season"].to_numpy(dtype=int)
    val_nt = seasons_nt <= VAL_MAX_SEASON
    oos_nt = seasons_nt >= 2020

    def _ll2(p3_sub: np.ndarray, y2_sub: np.ndarray) -> float:
        p2 = normalize_2way_from_3way(p3_sub)
        return float(np.mean(-np.log(np.clip(p2[np.arange(len(y2_sub)), y2_sub], 1e-15, 1.0))))

    P3_v30_logit = _run_logit_wf_cols(wf_df, BASE_29_FEATURES, 0.008)
    P3_v32_logit = _run_logit_wf_cols(wf_df, CANDIDATE_41_FEATURES, 0.002)

    P3_v30_blend = np.array(
        [
            v30_blend_map.get(str(gid), (float(P3_v30_logit[i, 0]), float(P3_v30_logit[i, 1]), float(P3_v30_logit[i, 2])))
            for i, gid in enumerate(oof_meta["game_id"].astype(str).tolist())
        ],
        dtype=np.float64,
    )
    P3_v30_blend = np.clip(P3_v30_blend, PROB_CLIP, None)
    P3_v30_blend /= P3_v30_blend.sum(axis=1, keepdims=True)

    # Selección individual estricta en `VAL 2010..2019` de señales PBP `v3.5`
    val_base_ll = _ll2(P3_v32_logit[nt][val_nt], y2_nt[val_nt])
    accepted_extra: list[str] = []
    indiv_val_log: dict[str, float] = {"base_41": round(val_base_ll, 6)}
    for cand_f in V35_EXTRA_8_NFL_FEATURES:
        p_c = _run_logit_wf_cols(wf_df, CANDIDATE_41_FEATURES + [cand_f], 0.002)
        ll_c = _ll2(p_c[nt][val_nt], y2_nt[val_nt])
        indiv_val_log[cand_f] = round(ll_c, 6)
        if ll_c < val_base_ll - 1e-6:
            accepted_extra.append(cand_f)

    pruned_cols = CANDIDATE_41_FEATURES + accepted_extra
    print("[VAL 2010..2019 NFL Feature Screening]", indiv_val_log, "-> accepted:", accepted_extra)

    # Walk-forward de `41` y `pruned_cols` con el HGB Binario Minkowski elevado a 3 vías + Totals Ridge
    cand_col_sets: dict[str, list[str]] = {"41": CANDIDATE_41_FEATURES}
    if accepted_extra:
        cand_col_sets[f"pruned_{len(pruned_cols)}"] = pruned_cols

    oof_logit_sets: dict[tuple[str, float], list[np.ndarray]] = {}
    oof_hgb_sets: dict[str, list[np.ndarray]] = {}
    for k_tag in cand_col_sets:
        oof_hgb_sets[k_tag] = []
        for c_v in (0.0016, 0.0020, 0.0030):
            oof_logit_sets[(k_tag, c_v)] = []
    oof_tot_pred_by_alpha: dict[float, list[np.ndarray]] = {40.0: [], 150.0: [], 350.0: []}

    for s in eval_seasons:
        tr = wf_df[(wf_df["season"] >= FIRST_TRAIN_SEASON) & (wf_df["season"] < s)]
        te = wf_df[wf_df["season"] == s]
        y_tr = tr["y"].to_numpy(dtype=int)
        sw = 0.5 ** ((s - 1 - tr["season"].to_numpy(dtype=np.float64)) / 10.0)

        for k_tag, cols_k in cand_col_sets.items():
            X_tr_k = tr[cols_k].to_numpy(dtype=np.float64)
            X_te_k = te[cols_k].to_numpy(dtype=np.float64)
            imp_k = SimpleImputer(strategy="mean").fit(X_tr_k)
            X_tr_ki = imp_k.transform(X_tr_k)
            X_te_ki = imp_k.transform(X_te_k)
            for c_v in (0.0016, 0.0020, 0.0030):
                pipe_k = fit_minkowski_logit_pipeline(X_tr_ki, y_tr, c_v, sample_weight=sw)
                oof_logit_sets[(k_tag, c_v)].append(predict_logit_3way_exact(pipe_k, X_te_ki))

            hgb_b, tau_b = fit_binary_minkowski_hgb(X_tr_k, y_tr, sample_weight=sw)
            oof_hgb_sets[k_tag].append(predict_binary_hgb_lifted_3way(hgb_b, tau_b, X_te_k))

        Xt_tr = tr[NFL_TOTALS_12_FEATURES].to_numpy(dtype=np.float64)
        Xt_te = te[NFL_TOTALS_12_FEATURES].to_numpy(dtype=np.float64)
        impt = SimpleImputer(strategy="median").fit(Xt_tr)
        sct = StandardScaler().fit(impt.transform(Xt_tr))
        sct.scale_ = np.where(sct.scale_ == 0.0, 1.0, sct.scale_)
        Zt_tr = sct.transform(impt.transform(Xt_tr))
        Zt_te = sct.transform(impt.transform(Xt_te))
        y_pts_tr = tr["home_score"].to_numpy(dtype=np.float64) + tr["away_score"].to_numpy(dtype=np.float64)
        for a_r in oof_tot_pred_by_alpha:
            rg = Ridge(alpha=a_r)
            rg.fit(Zt_tr, y_pts_tr, sample_weight=sw)
            oof_tot_pred_by_alpha[a_r].append(np.clip(rg.predict(Zt_te), 26.0, 68.0))

    P3_log_map = {k: np.vstack(v) for k, v in oof_logit_sets.items()}
    P3_hgb_map = {k: np.vstack(v) for k, v in oof_hgb_sets.items()}

    # Selección estricta en `VAL 2010..2019` (`n = 2,552`)
    best_cfg = None
    best_val_ll = float("inf")
    val_grid_log: dict[str, float] = {}

    for (k_tag, c_v), P3_log_k in P3_log_map.items():
        P3_hgb_rk = P3_hgb_map[k_tag]
        best_t_k = min(
            (0.90, 1.0, 1.10, 1.20, 1.35, 1.50),
            key=lambda t: _ll2(_apply_temperature_3way_exact(P3_hgb_rk[nt][val_nt], t), y2_nt[val_nt]),
        )
        P3_hgb_ck = _apply_temperature_3way_exact(P3_hgb_rk, best_t_k)
        for b_sp in ("probability", "logit"):
            for wg in (0.0, 0.12, 0.20, 0.25, 0.32):
                wl = round(1.0 - wg, 6)
                P3_ens_val = _blend_3way_exact(P3_log_k[nt][val_nt], P3_hgb_ck[nt][val_nt], wl, wg, b_sp)
                ll_v = _ll2(P3_ens_val, y2_nt[val_nt])
                val_grid_log[f"{k_tag}:C={c_v}:{b_sp}:T={best_t_k}:wg={wg:.2f}"] = round(ll_v, 6)
                if ll_v < best_val_ll - 1e-7:
                    best_val_ll = ll_v
                    best_cfg = (k_tag, c_v, best_t_k, b_sp, wl, wg, P3_log_k, P3_hgb_ck)

    assert best_cfg is not None
    sel_ftag, sel_c, sel_temp, sel_bspace, sel_wl, sel_wg, P3_log_sel, P3_hgb_sel = best_cfg
    sel_cols = cand_col_sets[sel_ftag]
    P3_v35_ens = _blend_3way_exact(P3_log_sel, P3_hgb_sel, sel_wl, sel_wg, sel_bspace)

    P2_v30_logit = normalize_2way_from_3way(P3_v30_logit[nt])
    P2_v30_blend = normalize_2way_from_3way(P3_v30_blend[nt])
    P2_v32_logit = normalize_2way_from_3way(P3_v32_logit[nt])
    P2_v35_ens = normalize_2way_from_3way(P3_v35_ens[nt])

    ev_v35_vs_v30_blend = oc.evaluate_calibration_with_bootstrap(
        P2_v35_ens,
        y2_nt,
        benchmark_ll_vec=oc.compute_categorical_log_loss_vec(P2_v30_blend, y2_nt),
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    ev_v35_vs_v32_logit = oc.evaluate_calibration_with_bootstrap(
        P2_v35_ens,
        y2_nt,
        benchmark_ll_vec=oc.compute_categorical_log_loss_vec(P2_v32_logit, y2_nt),
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    cmp_oos_vs_v30_logit = paired_delta_ll_mulberry32(P2_v35_ens[oos_nt], P2_v30_logit[oos_nt], y2_nt[oos_nt])
    cmp_oos_vs_v30_blend = paired_delta_ll_mulberry32(P2_v35_ens[oos_nt], P2_v30_blend[oos_nt], y2_nt[oos_nt])
    cmp_oos_vs_v32_logit = paired_delta_ll_mulberry32(P2_v35_ens[oos_nt], P2_v32_logit[oos_nt], y2_nt[oos_nt])

    print(
        f"\n=== NFL MINKOWSKI v3.5 ({sel_ftag}, C={sel_c}, {sel_bspace}, T={sel_temp}, w_gbm={sel_wg}) ===\n"
        f"  walk_forward_dev 2010..2024 (n={len(y2_nt)}): v3.0 Blend={_ll2(P3_v30_blend[nt], y2_nt):.5f} | "
        f"v3.2 Logit={_ll2(P3_v32_logit[nt], y2_nt):.5f} | v3.5 Logit={_ll2(P3_log_sel[nt], y2_nt):.5f} | "
        f"v3.5 Ensemble={ev_v35_vs_v30_blend['log_loss']:.5f} (ECE={ev_v35_vs_v30_blend['ece']:.5f})\n"
        f"    ΔLL vs v3.0 Blend = {ev_v35_vs_v30_blend['delta_ll_vs_benchmark']:+.5f} {ev_v35_vs_v30_blend['delta_ll_ci95']} ({ev_v35_vs_v30_blend['significance']})\n"
        f"    ΔLL vs v3.2 Logit = {ev_v35_vs_v32_logit['delta_ll_vs_benchmark']:+.5f} {ev_v35_vs_v32_logit['delta_ll_ci95']} ({ev_v35_vs_v32_logit['significance']})\n"
        f"  DEV_OOS 2020..2024 (n={int(np.sum(oos_nt))}): LL={_ll2(P3_v35_ens[nt][oos_nt], y2_nt[oos_nt]):.5f}\n"
        f"    ΔLL vs v3.0 Logit = {cmp_oos_vs_v30_logit['delta_ll']:+.5f} {cmp_oos_vs_v30_logit['delta_ll_ci95']} ({cmp_oos_vs_v30_logit['significance']})\n"
        f"    ΔLL vs v3.0 Blend = {cmp_oos_vs_v30_blend['delta_ll']:+.5f} {cmp_oos_vs_v30_blend['delta_ll_ci95']} ({cmp_oos_vs_v30_blend['significance']})\n"
        f"    ΔLL vs v3.2 Logit = {cmp_oos_vs_v32_logit['delta_ll']:+.5f} {cmp_oos_vs_v32_logit['delta_ll_ci95']} ({cmp_oos_vs_v32_logit['significance']})"
    )

    # Calibrar `sigma_total` estrictamente en `VAL 2010..2019`
    tot_actual = oof_meta["home_score"].to_numpy(dtype=np.float64) + oof_meta["away_score"].to_numpy(dtype=np.float64)
    tot_line = pd.to_numeric(oof_meta["total_line"], errors="coerce").to_numpy(dtype=np.float64)
    val_all = oof_meta["season"].to_numpy(dtype=int) <= VAL_MAX_SEASON
    T_tot_grid = {a: np.concatenate(v) for a, v in oof_tot_pred_by_alpha.items()}
    best_alpha_tot = min(T_tot_grid.keys(), key=lambda a: float(np.mean((tot_actual[val_all] - T_tot_grid[a][val_all]) ** 2)))
    T_v35_pts = T_tot_grid[best_alpha_tot]

    valid_ou = np.isfinite(tot_line) & (np.abs(tot_actual - tot_line) > 1e-6)
    val_ou = valid_ou & val_all
    y_ou_val = np.where(tot_actual[val_ou] > tot_line[val_ou], 0, 1).astype(np.int64)
    best_sigma_tot = min(
        (13.5, 16.5, 19.5, 22.5, 26.0),
        key=lambda sg: float(
            np.mean(oc.compute_categorical_log_loss_vec(_compute_normal_totals_probs_vec(tot_line[val_ou], T_v35_pts[val_ou], sg), y_ou_val))
        ),
    )

    rmse_const = float(math.sqrt(np.mean((tot_actual - 44.5) ** 2)))
    rmse_v35 = float(math.sqrt(np.mean((tot_actual - T_v35_pts) ** 2)))
    y_ou = np.where(tot_actual[valid_ou] > tot_line[valid_ou], 0, 1).astype(np.int64)
    P_ou_const = _compute_normal_totals_probs_vec(tot_line[valid_ou], np.full(int(np.sum(valid_ou)), 44.5), 13.5)
    P_ou_v35 = _compute_normal_totals_probs_vec(tot_line[valid_ou], T_v35_pts[valid_ou], best_sigma_tot)
    ev_nfl_totals = oc.evaluate_calibration_with_bootstrap(
        P_ou_v35,
        y_ou,
        benchmark_ll_vec=oc.compute_categorical_log_loss_vec(P_ou_const, y_ou),
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    print(
        f"\n=== NFL MINKOWSKI TOTALS v3.5 (alpha={best_alpha_tot}, sigma={best_sigma_tot}, n={int(np.sum(valid_ou))}) ===\n"
        f"  RMSE Total Points: Constant(44.5)={rmse_const:.3f} -> v3.5={rmse_v35:.3f}\n"
        f"  Over/Under vs Line LL: Constant(44.5)={float(np.mean(oc.compute_categorical_log_loss_vec(P_ou_const, y_ou))):.5f} -> "
        f"v3.5={ev_nfl_totals['log_loss']:.5f} (ECE={ev_nfl_totals['ece']:.5f}) | "
        f"ΔLL={ev_nfl_totals['delta_ll_vs_benchmark']:+.5f} {ev_nfl_totals['delta_ll_ci95']} ({ev_nfl_totals['significance']})"
    )

    # Exportar artefactos finales `< 2025-02-02`
    tr_all = wf_df[wf_df["season"] >= FIRST_TRAIN_SEASON].copy().reset_index(drop=True)
    max_s = int(tr_all["season"].max())
    sw_f = 0.5 ** ((max_s - tr_all["season"].to_numpy(dtype=np.float64)) / 10.0)
    y_f = tr_all["y"].to_numpy(dtype=int)

    X_f = tr_all[sel_cols].to_numpy(dtype=np.float64)
    imp_f = SimpleImputer(strategy="mean").fit(X_f)
    X_fi = imp_f.transform(X_f)
    pipe_f = fit_minkowski_logit_pipeline(X_fi, y_f, sel_c, sample_weight=sw_f)
    sc_f: StandardScaler = pipe_f.named_steps["scale"]
    sc_f.scale_ = np.where(sc_f.scale_ == 0.0, 1.0, sc_f.scale_)
    clf_f: LogisticRegression = pipe_f.named_steps["clf"]

    hgb_bin_f, tau_f = fit_binary_minkowski_hgb(X_f, y_f, sample_weight=sw_f)
    logit_comp = eg.build_logit_companion_payload(
        imp_f, sc_f, clf_f, n_features_base=len(sel_cols), regularization_c=sel_c
    )
    gbm_nfl_art = serialize_binary_minkowski_hgb_to_3way_artifact(
        hgb_bin_f,
        tau_f,
        base_feature_names=list(sel_cols),
        temperature=sel_temp,
        blend_space=sel_bspace,
        w_logit=sel_wl,
        w_gbm=sel_wg,
        logit_companion=logit_comp,
        activation_verdict={
            "activated": False,
            "status": "candidate",
            "significance": ev_v35_vs_v30_blend["significance"],
            "criterion": "Candidato NFL Minkowski v3.5 validado en walk_forward_dev < 2025-02-02T17:30:00Z",
            "reason": (
                f"LL={ev_v35_vs_v30_blend['log_loss']:.5f}, "
                f"delta_ll_vs_v30_blend={ev_v35_vs_v30_blend['delta_ll_vs_benchmark']:+.5f} "
                f"({ev_v35_vs_v30_blend['significance']}), "
                f"oos_2020_2024_vs_v30_blend={cmp_oos_vs_v30_blend['delta_ll']:+.5f} ({cmp_oos_vs_v30_blend['significance']})."
            ),
        },
        training_window={
            "min_season": int(FIRST_TRAIN_SEASON),
            "max_date_exclusive": HOLDOUT_CUT_ISO,
            "n_games": int(len(tr_all)),
            "holdout_sealed_untouched": True,
        },
        calibrated_on_window={"val_seasons": "2010..2019", "n_val": int(np.sum(val_nt))},
        codename="PitchLab Minkowski v3.5 Ensemble",
        version="3.5.0-candidate",
        seed=MODEL_SEED,
    )
    GBM_NFL_V35_OUT.write_text(json.dumps(gbm_nfl_art, separators=(",", ":")), encoding="utf-8")

    nfl_logit_art = {
        "schema_version": "1.0",
        "sport": "nfl",
        "type": "minkowski_2way_hyperbolic_tie_logit",
        "codename": "PitchLab Minkowski v3.5 Logit Companion",
        "version": "3.5.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": MODEL_SEED,
        "regularization_C": float(sel_c),
        "classes": [0, 1, 2],
        "n_classes": 3,
        "n_features": len(sel_cols),
        "features": list(sel_cols),
        "scaler_mean": logit_comp["scaler_mean"],
        "scaler_scale": logit_comp["scaler_scale"],
        "coef": logit_comp["coef"],
        "intercept": logit_comp["intercept"],
        "training_window": {
            "min_season": int(FIRST_TRAIN_SEASON),
            "max_date_exclusive": HOLDOUT_CUT_ISO,
            "n_games": int(len(tr_all)),
            "holdout_sealed_untouched": True,
        },
    }
    LOGIT_NFL_V35_OUT.write_text(json.dumps(nfl_logit_art, indent=2), encoding="utf-8")

    Xt_f = tr_all[NFL_TOTALS_12_FEATURES].to_numpy(dtype=np.float64)
    impt_f = SimpleImputer(strategy="median").fit(Xt_f)
    sct_f = StandardScaler().fit(impt_f.transform(Xt_f))
    sct_f.scale_ = np.where(sct_f.scale_ == 0.0, 1.0, sct_f.scale_)
    Zt_f = sct_f.transform(impt_f.transform(Xt_f))
    rg_f = Ridge(alpha=best_alpha_tot)
    rg_f.fit(Zt_f, tr_all["home_score"].to_numpy(dtype=np.float64) + tr_all["away_score"].to_numpy(dtype=np.float64), sample_weight=sw_f)

    totals_nfl_art = {
        "schema_version": "nfl_totals_v3.5.0",
        "sport": "nfl",
        "type": "ridge_linear_expected_total",
        "codename": "PitchLab Minkowski Totals v3.5",
        "version": "3.5.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "alpha": float(best_alpha_tot),
        "sigma_total": float(best_sigma_tot),
        "min_total_points": 26.0,
        "max_total_points": 68.0,
        "n_features": len(NFL_TOTALS_12_FEATURES),
        "features": list(NFL_TOTALS_12_FEATURES),
        "imputer_statistics": [float(v) for v in impt_f.statistics_.tolist()],
        "scaler_mean": [float(v) for v in sct_f.mean_.tolist()],
        "scaler_scale": [float(v) for v in sct_f.scale_.tolist()],
        "coef": [float(v) for v in rg_f.coef_.tolist()],
        "intercept": float(rg_f.intercept_),
        "training_window": {
            "min_season": int(FIRST_TRAIN_SEASON),
            "max_date_exclusive": HOLDOUT_CUT_ISO,
            "n_games": int(len(tr_all)),
            "holdout_sealed_untouched": True,
        },
    }
    TOTALS_NFL_V35_OUT.write_text(json.dumps(totals_nfl_art, indent=2), encoding="utf-8")

    state_v35_payload = {
        "schema_version": "nfl_causal_state_v3.5.0",
        "as_of_cutoff_iso": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "max_dev_gameday": v32_state["max_dev_gameday"],
        "n_franchises": len(v35_fran_state),
        "selected_features": list(sel_cols),
        "totals_features": list(NFL_TOTALS_12_FEATURES),
        "franchise_base_state": v32_state["franchise_base_state"],
        "franchise_epa_state": v32_state["franchise_epa_state"],
        "franchise_v35_state": v35_fran_state,
    }
    STATE_NFL_V35_OUT.write_text(json.dumps(state_v35_payload, indent=2), encoding="utf-8")

    # Verificar paridad `< 1e-13` entre `predict_binary_hgb_lifted_3way` y `predict_serialized_gbm_python`
    rng = np.random.default_rng(MODEL_SEED)
    rec_pool = np.where(tr_all["season"].to_numpy(dtype=int) >= 2021)[0]
    ch_idx = np.sort(rng.choice(rec_pool, size=min(120, len(rec_pool)), replace=False))
    X_sn = X_f[ch_idx]
    Xt_sn = Xt_f[ch_idx]

    p_lifted = predict_binary_hgb_lifted_3way(hgb_bin_f, tau_f, X_sn)
    p_gbm_ser = eg.predict_serialized_gbm_python(X_sn, gbm_nfl_art, calibrated=False)
    max_ser_diff = float(np.max(np.abs(p_lifted - p_gbm_ser)))
    if max_ser_diff > 1e-12:
        raise RuntimeError(f"Desviación elevación hiperbólica GBM NFL: {max_ser_diff:.3e}")

    p_gbm_cal = _apply_temperature_3way_exact(p_gbm_ser, sel_temp)
    p_log_sn = predict_logit_3way_exact(pipe_f, imp_f.transform(X_sn))
    p_ens_sn = _blend_3way_exact(p_log_sn, p_gbm_cal, sel_wl, sel_wg, sel_bspace)
    t_pts_sn = np.clip(float(rg_f.intercept_) + sct_f.transform(impt_f.transform(Xt_sn)) @ rg_f.coef_, 26.0, 68.0)

    snap_rows: list[dict[str, Any]] = []
    for k_i, r_idx in enumerate(ch_idx):
        snap_rows.append(
            {
                "game_id": str(tr_all.iloc[r_idx]["game_id"]),
                "home_team": str(tr_all.iloc[r_idx]["home_team"]),
                "away_team": str(tr_all.iloc[r_idx]["away_team"]),
                "features": [None if not math.isfinite(float(v)) else float(v) for v in X_sn[k_i].tolist()],
                "totals_features": [None if not math.isfinite(float(v)) else float(v) for v in Xt_sn[k_i].tolist()],
                "python_logit_probs": [float(p_log_sn[k_i, 0]), float(p_log_sn[k_i, 1]), float(p_log_sn[k_i, 2])],
                "python_gbm_cal_probs": [float(p_gbm_cal[k_i, 0]), float(p_gbm_cal[k_i, 1]), float(p_gbm_cal[k_i, 2])],
                "python_ensemble_probs": [float(p_ens_sn[k_i, 0]), float(p_ens_sn[k_i, 1]), float(p_ens_sn[k_i, 2])],
                "python_expected_total": float(t_pts_sn[k_i]),
            }
        )

    SNAP_NFL_V35_OUT.write_text(
        json.dumps(
            {
                "schema_version": "nfl_v3.5_parity_snapshot",
                "codename": "PitchLab Minkowski v3.5 Ensemble + Totals v3.5",
                "holdout_sealed_untouched": True,
                "n": len(snap_rows),
                "rows": snap_rows,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    summary = {
        "experiment_id": "EXP_V39_nfl_v3_5_engines",
        "eval_split": "walk_forward_dev",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "val_feature_screening": indiv_val_log,
        "accepted_extra_features": accepted_extra,
        "selected_moneyline_config": {
            "feature_set": sel_ftag,
            "n_features": len(sel_cols),
            "regularization_C": float(sel_c),
            "hgb_temperature": float(sel_temp),
            "blend_space": sel_bspace,
            "w_logit": float(sel_wl),
            "w_gbm": float(sel_wg),
            "val_2010_2019_grid": val_grid_log,
            "max_hyperbolic_lifting_serialization_diff": max_ser_diff,
        },
        "metrics_moneyline": {
            "v3_5_vs_v3_0_blend_dev_2010_2024": ev_v35_vs_v30_blend,
            "v3_5_vs_v3_2_logit_dev_2010_2024": ev_v35_vs_v32_logit,
            "oos_2020_2024_vs_v3_0_logit": cmp_oos_vs_v30_logit,
            "oos_2020_2024_vs_v3_0_blend": cmp_oos_vs_v30_blend,
            "oos_2020_2024_vs_v3_2_logit": cmp_oos_vs_v32_logit,
        },
        "metrics_totals": {
            "ridge_alpha": float(best_alpha_tot),
            "calibrated_sigma_total": float(best_sigma_tot),
            "rmse_const_44_5": rmse_const,
            "rmse_v3_5": rmse_v35,
            "ou_vs_const_44_5": ev_nfl_totals,
        },
    }
    RESULTS_NFL_V35_OUT.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    with TRIAL_REGISTRY_NFL_V35_OUT.open("a", encoding="utf-8") as fh:
        fh.write(
            json.dumps(
                {
                    "recorded_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V39_nfl_v3_5_engines_hyperbolic_hgb",
                    "eval_split": "walk_forward_dev",
                    "holdout_touched": False,
                    "ll_moneyline_v35": round(ev_v35_vs_v30_blend["log_loss"], 6),
                    "delta_ll_vs_v30_blend": round(ev_v35_vs_v30_blend["delta_ll_vs_benchmark"], 6),
                    "delta_ll_oos20_24_vs_v30_blend": round(cmp_oos_vs_v30_blend["delta_ll"], 6),
                    "ll_totals_ou_v35": round(ev_nfl_totals["log_loss"], 6),
                }
            )
            + "\n"
        )
    print(f"\n[DONE] EXP_V39 Hyperbolic-HGB guardado en {RESULTS_NFL_V35_OUT.name} (max_ser_diff={max_ser_diff:.2e})")


if __name__ == "__main__":
    main()
