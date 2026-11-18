"""EXP_V44 — Micro-Mercados Bivariados de Fútbol `v4.0`: Split Local/Visita, Física Cruzada y Cópula Sarmanov `(H, A)`.

Resuelve los tres cuellos de botella diagnosticados en `EXP_V40 (v3.6)`:
  1. Elimina el sesgo de mezcla de sede (`team_for_ewm` único) normalizando cada observación por la media
     contemporánea de liga-sede (`obs_h / dh`, `obs_a / da`) ajustada iterativamente por la defensa del rival,
     y combinando el perfil global normalizado con el perfil específico de estadio (`Home-Only` vs `Away-Only`).
  2. Incorpora física cruzada entre mercados (`8` features exactas alineadas con `soccer_micro_markets.ts`):
       * `corners`     <- `non_sot_shots_ratio` (`shots - sot` bloqueados/desviados) + `siege_asym` no lineal.
       * `yellow_cards`<- `expected_fouls_ratio * global_referee_cards_per_foul` + `season_crunch`.
       * `fouls`       <- `opp_shots_pressure_ratio` + `global_referee_fouls_mult`.
       * `sot`         <- `shots_volume_ratio` (estabilización por volumen total de remate).
       * `shots`       <- `corners_pressure_ratio` (estabilización territorial).
  3. Acopla `(K_H, K_A)` mediante un núcleo bivariado discreto acotado de Sarmanov sobre marginales Binomial Negativa:
       `P(K_H = i, K_A = j) ∝ P_NB(i | mu_H, r_H) * P_NB(j | mu_A, r_A) * (1 + omega * phi_H(i) * phi_A(j))`
     capturando correlación negativa en asedio de córners/tiros (`omega < 0`) y correlación positiva por contagio
     disciplinario en tarjetas/faltas (`omega > 0`), además de habilitar `Most Corners / Cards 1X2` y `Handicaps`.
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
from sklearn.linear_model import PoissonRegressor

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"
EXP_V40_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V40_soccer_micro_markets"
ARTIFACTS_DIR = EXP_DIR / "artifacts"

for _p in (str(REPO_ROOT), str(EXP_V40_DIR), str(EXP_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from services.models import outlook_calibration as oc  # noqa: E402
from run_micro_markets_experiment import (  # noqa: E402
    BOOTSTRAP_SAMPLES,
    BOOTSTRAP_SEED,
    HOLDOUT_CUT_DATE,
    HOLDOUT_CUT_ISO,
    METRIC_SPECS,
    MIN_MODERN_SEASON,
    MODEL_SEED,
    OOS_MIN_SEASON,
    VAL_MAX_SEASON,
    _estimate_nb_dispersion_mom,
    build_dc_matrix_small,
    convolve_pmf_exact,
    line_probs_from_pmf,
    nb_pmf_exact,
    normalize_referee_name,
    paired_bootstrap_binary,
)

MICRO_V4_MODEL_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_soccer_micro_v4_0_candidate.json"
OFFICIAL_V4_PRIORS_OUT = REPO_ROOT / "src" / "data" / "prediction" / "official_priors_v4_0.json"
MICRO_V4_SNAPSHOT_OUT = REPO_ROOT / "src" / "data" / "prediction" / "soccer_micro_v4_0_snapshot.json"
RESULTS_OUT = ARTIFACTS_DIR / "exp_v44_micro_markets_v4_0_results.json"
TRIAL_REGISTRY_OUT = EXP_DIR / "trial_registry_micro_v40.jsonl"

HANDICAP_LINES_BY_METRIC: dict[str, list[float]] = {
    "corners": [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5],
    "yellow_cards": [-1.5, -0.5, 0.5, 1.5],
    "fouls": [-2.5, -1.5, 1.5, 2.5],
    "shots_on_target": [-1.5, -0.5, 0.5, 1.5],
    "shots": [-3.5, -1.5, 1.5, 3.5],
}

FEATURE_NAMES_V4_8: list[str] = [
    "log_venue_opp_adj_base",
    "goal_supremacy_side",
    "siege_asymmetry_nonlinear",
    "tempo_excess_ft",
    "match_tightness_index",
    "log_cross_metric_driver",
    "season_crunch_tension",
    "log_global_referee_mult",
]


def build_centered_sarmanov_basis_exact(pmf: np.ndarray, mu: float, r_disp: float) -> np.ndarray:
    """Base acotada centrada `phi(k)` en `[-1, 1]` con media nula exacta bajo `pmf` (paridad `< 1e-15` con TS)."""
    n = len(pmf)
    raw = np.empty(n, dtype=np.float64)
    sigma = math.sqrt(max(mu + (mu * mu) / max(r_disp, 0.5), 0.25))
    mean_val = 0.0
    for k in range(n):
        z = (float(k) - mu) / sigma
        e2 = math.exp(-2.0 * abs(z))
        th = (1.0 - e2) / (1.0 + e2) if z >= 0.0 else -(1.0 - e2) / (1.0 + e2)
        raw[k] = th
        mean_val += float(pmf[k]) * th
    max_abs = 1e-9
    for k in range(n):
        c = float(raw[k]) - mean_val
        raw[k] = c
        if abs(c) > max_abs:
            max_abs = abs(c)
    return raw / max_abs


def bivariate_sarmanov_summary_exact(
    mu_h: float,
    mu_a: float,
    r_h: float,
    r_a: float,
    max_k_side: int,
    copula_omega: float,
    handicap_lines: list[float],
) -> dict[str, Any]:
    """Réplica escalar exacta de `buildBivariateSarmanovNbSummaryV4` en `soccer_micro_markets.ts`."""
    pmf_h = nb_pmf_exact(mu_h, r_h, max_k_side)
    pmf_a = nb_pmf_exact(mu_a, r_a, max_k_side)
    phi_h = build_centered_sarmanov_basis_exact(pmf_h, mu_h, r_h)
    phi_a = build_centered_sarmanov_basis_exact(pmf_a, mu_a, r_a)
    omega = min(max(float(copula_omega), -0.85), 0.85)

    nh = len(pmf_h)
    na = len(pmf_a)
    pmf_tot = np.zeros(nh + na - 1, dtype=np.float64)
    diff_offset = na - 1
    pmf_diff = np.zeros(nh + na - 1, dtype=np.float64)

    p_home_most = 0.0
    p_tie = 0.0
    p_away_most = 0.0
    tot_mass = 0.0

    for i in range(nh):
        ph = float(pmf_h[i])
        if ph <= 0.0:
            continue
        fh = float(phi_h[i])
        for j in range(na):
            pa = float(pmf_a[j])
            if pa <= 0.0:
                continue
            w = max(0.0, 1.0 + omega * fh * float(phi_a[j]))
            pij = ph * pa * w
            tot_mass += pij
            pmf_tot[i + j] += pij
            pmf_diff[i - j + diff_offset] += pij
            if i > j:
                p_home_most += pij
            elif i == j:
                p_tie += pij
            else:
                p_away_most += pij

    inv_m = 1.0 / tot_mass if tot_mass > 0.0 else 1.0
    pmf_tot *= inv_m
    pmf_diff *= inv_m
    p_home_most *= inv_m
    p_tie *= inv_m
    p_away_most *= inv_m

    hc_out: list[dict[str, float]] = []
    for hc in handicap_lines:
        ph_cov = 0.0
        pa_cov = 0.0
        p_push = 0.0
        for idx in range(len(pmf_diff)):
            p = float(pmf_diff[idx])
            if p <= 0.0:
                continue
            dv = float(idx - diff_offset) + float(hc)
            if abs(dv) < 1e-9:
                p_push += p
            elif dv > 0.0:
                ph_cov += p
            else:
                pa_cov += p
        act = ph_cov + pa_cov
        ph_cond = min(max(ph_cov / act, 0.001), 0.999) if act > 1e-12 else 0.5
        hc_out.append(
            {
                "handicapHome": float(hc),
                "pHomeCover": ph_cov,
                "pAwayCover": pa_cov,
                "pPush": p_push,
                "pHomeCoverNoPush": ph_cond,
                "pAwayCoverNoPush": 1.0 - ph_cond,
            }
        )

    return {
        "pmf_home": pmf_h,
        "pmf_away": pmf_a,
        "pmf_total": pmf_tot,
        "p_home_most": p_home_most,
        "p_tie": p_tie,
        "p_away_most": p_away_most,
        "handicaps": hc_out,
    }


def _batch_sarmanov_over_and_1x2_probs(
    mu_h_vec: np.ndarray,
    mu_a_vec: np.ndarray,
    r_h: float,
    r_a: float,
    max_k: int,
    omega: float,
    canon_line: float,
) -> tuple[np.ndarray, np.ndarray]:
    """Evaluación rápida vectorizada por matriz `(max_k+1)x(max_k+1)` para N partidos."""
    n = len(mu_h_vec)
    p_over = np.empty(n, dtype=np.float64)
    p_1x2 = np.empty((n, 3), dtype=np.float64)
    ks = np.arange(max_k + 1, dtype=np.float64)
    sum_grid = ks[:, None] + ks[None, :]
    over_mask = sum_grid > canon_line
    h_most_mask = ks[:, None] > ks[None, :]
    tie_mask = ks[:, None] == ks[None, :]
    a_most_mask = ks[:, None] < ks[None, :]
    om = min(max(float(omega), -0.85), 0.85)

    for idx in range(n):
        mh = float(mu_h_vec[idx])
        ma = float(mu_a_vec[idx])
        pmf_h = nb_pmf_exact(mh, r_h, max_k)
        pmf_a = nb_pmf_exact(ma, r_a, max_k)
        if abs(om) < 1e-9:
            mat = np.outer(pmf_h, pmf_a)
        else:
            sh = math.sqrt(max(mh + (mh * mh) / max(r_h, 0.5), 0.25))
            sa = math.sqrt(max(ma + (ma * ma) / max(r_a, 0.5), 0.25))
            th_h = np.tanh((ks - mh) / sh)
            th_a = np.tanh((ks - ma) / sa)
            ch = th_h - float(np.dot(pmf_h, th_h))
            ca = th_a - float(np.dot(pmf_a, th_a))
            fh = ch / max(float(np.max(np.abs(ch))), 1e-9)
            fa = ca / max(float(np.max(np.abs(ca))), 1e-9)
            w = np.maximum(0.0, 1.0 + om * np.outer(fh, fa))
            mat = np.outer(pmf_h, pmf_a) * w
            s = float(np.sum(mat))
            if s > 0.0:
                mat /= s
        p_over[idx] = float(np.sum(mat[over_mask]))
        p_1x2[idx, 0] = float(np.sum(mat[h_most_mask]))
        p_1x2[idx, 1] = float(np.sum(mat[tie_mask]))
        p_1x2[idx, 2] = float(np.sum(mat[a_most_mask]))
    return p_over, p_1x2


def main() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    matches_path = PRED_LAB_ROOT / "data" / "processed" / "matches.parquet"
    features_path = PRED_LAB_ROOT / "data" / "processed" / "features.parquet"

    m_df = pd.read_parquet(matches_path)
    m_df["match_date_str"] = m_df["match_date"].astype(str).str.slice(0, 10)
    m_df = m_df[m_df["match_date_str"] < HOLDOUT_CUT_DATE].copy()
    if bool((m_df["match_date_str"] >= HOLDOUT_CUT_DATE).any()):
        raise RuntimeError("HoldoutSealedAccessError en EXP_V44")

    if features_path.exists():
        f_cols = pd.read_parquet(
            features_path,
            columns=["match_id", "dc_lam_home", "dc_lam_away", "elo_diff_no_hfa", "season_progress"],
        )
        m_df = m_df.merge(f_cols, on="match_id", how="left")
    else:
        m_df["dc_lam_home"] = np.nan
        m_df["dc_lam_away"] = np.nan
        m_df["elo_diff_no_hfa"] = 0.0
        m_df["season_progress"] = 0.5

    m_df["sstart"] = pd.to_numeric(m_df["season_start"], errors="coerce").fillna(2000).astype(int)
    m_df = m_df.sort_values(["match_date_str", "kickoff_time", "match_id"], kind="mergesort").reset_index(drop=True)

    n_all = len(m_df)
    print(f"[EXP_V44] Partidos pre-holdout (< {HOLDOUT_CUT_DATE}): {n_all:,}")

    # Acumuladores causales `t' < t`:
    #   - `alpha_all` (span=18) sobre ratios normalizados por liga-sede y defensa rival (elimina sesgo H/A y ruido)
    #   - `alpha_venue` (span=16) sobre ratios puros en casa / visita (geometría de estadio / altitud / afición)
    alpha_all = 2.0 / 19.0
    alpha_venue = 2.0 / 17.0
    alpha_div = 2.0 / 181.0
    kappa_all = 8.0
    kappa_venue = 10.0
    kappa_ref_global = 14.0

    div_stat_ewm: dict[tuple[str, str], float] = {}

    # Estado v4.0 (ratios multiplicativos centrados en 1.0 -> cero sesgo de mezcla local/visita)
    tm_att_all: dict[tuple[str, str], float] = {}
    tm_def_all: dict[tuple[str, str], float] = {}
    tm_n_all: dict[tuple[str, str], int] = {}

    tm_att_home: dict[tuple[str, str], float] = {}
    tm_def_home: dict[tuple[str, str], float] = {}
    tm_n_home: dict[tuple[str, str], int] = {}

    tm_att_away: dict[tuple[str, str], float] = {}
    tm_def_away: dict[tuple[str, str], float] = {}
    tm_n_away: dict[tuple[str, str], int] = {}

    # Estado v3.6 original (para comparación head-to-head exacta en el mismo split OOS)
    alpha_v36 = 2.0 / 13.0
    v36_for: dict[tuple[str, str], float] = {}
    v36_ag: dict[tuple[str, str], float] = {}
    v36_n: dict[tuple[str, str], int] = {}
    team_last10_tot: dict[tuple[str, str], list[float]] = {}

    # Árbitros globales (rastreando a cada árbitro a través de ligas/copas/temporadas con ratio sobre media de división)
    gref_yel_n: dict[str, int] = {}
    gref_yel_ratio_sum: dict[str, float] = {}
    gref_red_sum: dict[str, float] = {}
    gref_fls_n: dict[str, int] = {}
    gref_fls_ratio_sum: dict[str, float] = {}
    gref_cpf_n: dict[str, int] = {}
    gref_cpf_ratio_sum: dict[str, float] = {}

    gf_ewm: dict[str, float] = {}
    ga_ewm: dict[str, float] = {}
    div_ht_share_ewm: dict[str, float] = {}

    lam_h_arr = np.empty(n_all, dtype=np.float64)
    lam_a_arr = np.empty(n_all, dtype=np.float64)
    sprog_arr = pd.to_numeric(m_df["season_progress"], errors="coerce").fillna(0.5).to_numpy(dtype=np.float64)

    gref_yel_mult_arr = np.ones(n_all, dtype=np.float64)
    gref_fls_mult_arr = np.ones(n_all, dtype=np.float64)
    gref_cpf_mult_arr = np.ones(n_all, dtype=np.float64)

    base_v4_h: dict[str, np.ndarray] = {q: np.empty(n_all, dtype=np.float64) for q in METRIC_SPECS}
    base_v4_a: dict[str, np.ndarray] = {q: np.empty(n_all, dtype=np.float64) for q in METRIC_SPECS}
    ratio_v4_h: dict[str, np.ndarray] = {q: np.ones(n_all, dtype=np.float64) for q in METRIC_SPECS}
    ratio_v4_a: dict[str, np.ndarray] = {q: np.ones(n_all, dtype=np.float64) for q in METRIC_SPECS}

    base_v36_h: dict[str, np.ndarray] = {q: np.empty(n_all, dtype=np.float64) for q in METRIC_SPECS}
    base_v36_a: dict[str, np.ndarray] = {q: np.empty(n_all, dtype=np.float64) for q in METRIC_SPECS}
    div_mean_h_arr: dict[str, np.ndarray] = {q: np.empty(n_all, dtype=np.float64) for q in METRIC_SPECS}
    div_mean_a_arr: dict[str, np.ndarray] = {q: np.empty(n_all, dtype=np.float64) for q in METRIC_SPECS}
    raw_l10_over_prob: dict[str, np.ndarray] = {q: np.full(n_all, np.nan, dtype=np.float64) for q in METRIC_SPECS}

    # Ratio físico de tiros bloqueados/desviados (`shots - sot`) para córners
    blk_att_all: dict[str, float] = {}
    blk_def_all: dict[str, float] = {}
    blk_n_all: dict[str, int] = {}
    div_blk_h: dict[str, float] = {}
    div_blk_a: dict[str, float] = {}
    blk_ratio_h_arr = np.ones(n_all, dtype=np.float64)
    blk_ratio_a_arr = np.ones(n_all, dtype=np.float64)

    divs = m_df["div"].astype(str).to_numpy()
    homes = m_df["home_team"].astype(str).to_numpy()
    aways = m_df["away_team"].astype(str).to_numpy()
    refs = [normalize_referee_name(x) for x in m_df["referee"].tolist()]
    hg_vec = pd.to_numeric(m_df["home_goals"], errors="coerce").to_numpy(dtype=np.float64)
    ag_vec = pd.to_numeric(m_df["away_goals"], errors="coerce").to_numpy(dtype=np.float64)
    ht_hg_vec = pd.to_numeric(m_df["ht_home_goals"], errors="coerce").to_numpy(dtype=np.float64)
    ht_ag_vec = pd.to_numeric(m_df["ht_away_goals"], errors="coerce").to_numpy(dtype=np.float64)
    dc_lh_vec = pd.to_numeric(m_df["dc_lam_home"], errors="coerce").to_numpy(dtype=np.float64)
    dc_la_vec = pd.to_numeric(m_df["dc_lam_away"], errors="coerce").to_numpy(dtype=np.float64)
    reds_h_vec = pd.to_numeric(m_df["reds_home"], errors="coerce").to_numpy(dtype=np.float64)
    reds_a_vec = pd.to_numeric(m_df["reds_away"], errors="coerce").to_numpy(dtype=np.float64)

    obs_cols_h: dict[str, np.ndarray] = {}
    obs_cols_a: dict[str, np.ndarray] = {}
    for q, sp in METRIC_SPECS.items():
        obs_cols_h[q] = pd.to_numeric(m_df[sp["h_col"]], errors="coerce").to_numpy(dtype=np.float64)
        obs_cols_a[q] = pd.to_numeric(m_df[sp["a_col"]], errors="coerce").to_numpy(dtype=np.float64)

    for i in range(n_all):
        dv = divs[i]
        hk = f"{dv}::{homes[i]}"
        ak = f"{dv}::{aways[i]}"
        rf = refs[i]

        gfh = gf_ewm.get(hk, 1.45)
        gah = ga_ewm.get(hk, 1.18)
        gfa = gf_ewm.get(ak, 1.18)
        gaa = ga_ewm.get(ak, 1.45)
        fb_lh = min(max(0.5 * (gfh + gaa), 0.25), 4.5)
        fb_la = min(max(0.5 * (gfa + gah), 0.25), 4.5)

        lh = float(dc_lh_vec[i]) if math.isfinite(float(dc_lh_vec[i])) and dc_lh_vec[i] > 0.05 else fb_lh
        la = float(dc_la_vec[i]) if math.isfinite(float(dc_la_vec[i])) and dc_la_vec[i] > 0.05 else fb_la
        lam_h_arr[i] = lh
        lam_a_arr[i] = la

        # Árbitro global normalizado por liga contemporánea (`t' < t`)
        div_yel_tot = div_stat_ewm.get((dv, "yellow_cards_h"), 1.85) + div_stat_ewm.get((dv, "yellow_cards_a"), 2.15)
        div_fls_tot = div_stat_ewm.get((dv, "fouls_h"), 11.80) + div_stat_ewm.get((dv, "fouls_a"), 12.20)
        div_cpf = div_yel_tot / max(div_fls_tot, 6.0)

        if rf:
            ny = gref_yel_n.get(rf, 0)
            if ny > 0:
                eb_ry = (gref_yel_ratio_sum[rf] + kappa_ref_global * 1.0) / (ny + kappa_ref_global)
                gref_yel_mult_arr[i] = min(max(eb_ry, 0.66), 1.45)
            nf = gref_fls_n.get(rf, 0)
            if nf > 0:
                eb_rf = (gref_fls_ratio_sum[rf] + kappa_ref_global * 1.0) / (nf + kappa_ref_global)
                gref_fls_mult_arr[i] = min(max(eb_rf, 0.74), 1.34)
            nc = gref_cpf_n.get(rf, 0)
            if nc > 0:
                eb_rc = (gref_cpf_ratio_sum[rf] + kappa_ref_global * 1.0) / (nc + kappa_ref_global)
                gref_cpf_mult_arr[i] = min(max(eb_rc, 0.68), 1.44)

        # Ratio de tiros bloqueados/desviados pre-partido
        nb_h = blk_n_all.get(hk, 0)
        nb_a = blk_n_all.get(ak, 0)
        ba_h = (nb_h * blk_att_all.get(hk, 1.0) + kappa_all) / (nb_h + kappa_all)
        bd_h = (nb_h * blk_def_all.get(hk, 1.0) + kappa_all) / (nb_h + kappa_all)
        ba_a = (nb_a * blk_att_all.get(ak, 1.0) + kappa_all) / (nb_a + kappa_all)
        bd_a = (nb_a * blk_def_all.get(ak, 1.0) + kappa_all) / (nb_a + kappa_all)
        blk_ratio_h_arr[i] = min(max(math.sqrt(max(ba_h * bd_a, 0.15)), 0.45), 2.10)
        blk_ratio_a_arr[i] = min(max(math.sqrt(max(ba_a * bd_h, 0.15)), 0.45), 2.10)

        pre_att_eb: dict[tuple[str, str], float] = {}
        pre_def_eb: dict[tuple[str, str], float] = {}

        for q, sp in METRIC_SPECS.items():
            dh = div_stat_ewm.get((dv, f"{q}_h"), sp["default_h"])
            da = div_stat_ewm.get((dv, f"{q}_a"), sp["default_a"])
            div_mean_h_arr[q][i] = dh
            div_mean_a_arr[q][i] = da

            # --- Tasa v4.0 (sin sesgo de sede + ajustada por rival) ---
            nh_all = tm_n_all.get((hk, q), 0)
            na_all = tm_n_all.get((ak, q), 0)
            nh_hm = tm_n_home.get((hk, q), 0)
            na_aw = tm_n_away.get((ak, q), 0)

            att_h_all_eb = (nh_all * tm_att_all.get((hk, q), 1.0) + kappa_all) / (nh_all + kappa_all)
            def_h_all_eb = (nh_all * tm_def_all.get((hk, q), 1.0) + kappa_all) / (nh_all + kappa_all)
            att_a_all_eb = (na_all * tm_att_all.get((ak, q), 1.0) + kappa_all) / (na_all + kappa_all)
            def_a_all_eb = (na_all * tm_def_all.get((ak, q), 1.0) + kappa_all) / (na_all + kappa_all)

            att_h_ven_eb = (nh_hm * tm_att_home.get((hk, q), 1.0) + kappa_venue) / (nh_hm + kappa_venue)
            def_h_ven_eb = (nh_hm * tm_def_home.get((hk, q), 1.0) + kappa_venue) / (nh_hm + kappa_venue)
            att_a_ven_eb = (na_aw * tm_att_away.get((ak, q), 1.0) + kappa_venue) / (na_aw + kappa_venue)
            def_a_ven_eb = (na_aw * tm_def_away.get((ak, q), 1.0) + kappa_venue) / (na_aw + kappa_venue)

            att_h_comb = 0.62 * att_h_all_eb + 0.38 * att_h_ven_eb
            def_h_comb = 0.62 * def_h_all_eb + 0.38 * def_h_ven_eb
            att_a_comb = 0.62 * att_a_all_eb + 0.38 * att_a_ven_eb
            def_a_comb = 0.62 * def_a_all_eb + 0.38 * def_a_ven_eb

            pre_att_eb[(hk, q)] = att_h_all_eb
            pre_def_eb[(hk, q)] = def_h_all_eb
            pre_att_eb[(ak, q)] = att_a_all_eb
            pre_def_eb[(ak, q)] = def_a_all_eb

            rh_mult = (max(att_h_comb, 0.25) ** 0.72) * (max(def_a_comb, 0.25) ** 0.62)
            ra_mult = (max(att_a_comb, 0.25) ** 0.72) * (max(def_h_comb, 0.25) ** 0.62)
            ratio_v4_h[q][i] = min(max(rh_mult, 0.40), 2.35)
            ratio_v4_a[q][i] = min(max(ra_mult, 0.40), 2.35)
            base_v4_h[q][i] = min(max(dh * ratio_v4_h[q][i], 0.15), 32.0)
            base_v4_a[q][i] = min(max(da * ratio_v4_a[q][i], 0.15), 32.0)

            # --- Reproducción exacta tasa v3.6 para benchmark directo ---
            d_neut = 0.5 * (dh + da)
            nh36 = v36_n.get((hk, q), 0)
            na36 = v36_n.get((ak, q), 0)
            fh36 = (nh36 * v36_for.get((hk, q), dh) + 6.0 * dh) / (nh36 + 6.0)
            ah36 = (nh36 * v36_ag.get((hk, q), da) + 6.0 * da) / (nh36 + 6.0)
            fa36 = (na36 * v36_for.get((ak, q), da) + 6.0 * da) / (na36 + 6.0)
            aa36 = (na36 * v36_ag.get((ak, q), dh) + 6.0 * dh) / (na36 + 6.0)
            base_v36_h[q][i] = min(max(dh * math.sqrt((fh36 / max(dh, 0.2)) * (aa36 / max(dh, 0.2))) * ((fh36 / max(d_neut, 0.2)) ** 0.35), 0.15), 30.0)
            base_v36_a[q][i] = min(max(da * math.sqrt((fa36 / max(da, 0.2)) * (ah36 / max(da, 0.2))) * ((fa36 / max(d_neut, 0.2)) ** 0.35), 0.15), 30.0)

            lh_hist = team_last10_tot.get((hk, q))
            la_hist = team_last10_tot.get((ak, q))
            if lh_hist and la_hist and len(lh_hist) >= 5 and len(la_hist) >= 5:
                cline = sp["canonical_total_line"]
                hr_h = sum(1.0 for v in lh_hist[-10:] if v > cline) / len(lh_hist[-10:])
                hr_a = sum(1.0 for v in la_hist[-10:] if v > cline) / len(la_hist[-10:])
                raw_l10_over_prob[q][i] = 0.5 * (hr_h + hr_a)

        # --- Actualización estrictamente POST-partido (`t' < t`) ---
        if math.isfinite(hg_vec[i]) and math.isfinite(ag_vec[i]):
            hg_v = float(hg_vec[i])
            ag_v = float(ag_vec[i])
            gf_ewm[hk] = alpha_all * hg_v + (1.0 - alpha_all) * gf_ewm.get(hk, 1.45)
            ga_ewm[hk] = alpha_all * ag_v + (1.0 - alpha_all) * ga_ewm.get(hk, 1.18)
            gf_ewm[ak] = alpha_all * ag_v + (1.0 - alpha_all) * gf_ewm.get(ak, 1.18)
            ga_ewm[ak] = alpha_all * hg_v + (1.0 - alpha_all) * ga_ewm.get(ak, 1.45)
            if math.isfinite(ht_hg_vec[i]) and math.isfinite(ht_ag_vec[i]) and (hg_v + ag_v) > 0.0:
                obs_sh = min(max((float(ht_hg_vec[i]) + float(ht_ag_vec[i])) / (hg_v + ag_v), 0.0), 1.0)
                div_ht_share_ewm[dv] = alpha_div * obs_sh + (1.0 - alpha_div) * div_ht_share_ewm.get(dv, 0.442)

        # Actualizar tiros bloqueados/desviados (`shots - sot`)
        sh_hv = obs_cols_h["shots"][i]
        sh_av = obs_cols_a["shots"][i]
        st_hv = obs_cols_h["shots_on_target"][i]
        st_av = obs_cols_a["shots_on_target"][i]
        if math.isfinite(sh_hv) and math.isfinite(sh_av) and math.isfinite(st_hv) and math.isfinite(st_av):
            bh_obs = max(0.0, float(sh_hv) - float(st_hv))
            ba_obs = max(0.0, float(sh_av) - float(st_av))
            dbh = div_blk_h.get(dv, 8.75)
            dba = div_blk_a.get(dv, 7.05)
            rh_b = min(max(bh_obs / max(dbh, 1.0), 0.2), 3.0)
            ra_b = min(max(ba_obs / max(dba, 1.0), 0.2), 3.0)
            blk_att_all[hk] = alpha_all * rh_b + (1.0 - alpha_all) * blk_att_all.get(hk, 1.0)
            blk_def_all[hk] = alpha_all * ra_b + (1.0 - alpha_all) * blk_def_all.get(hk, 1.0)
            blk_att_all[ak] = alpha_all * ra_b + (1.0 - alpha_all) * blk_att_all.get(ak, 1.0)
            blk_def_all[ak] = alpha_all * rh_b + (1.0 - alpha_all) * blk_def_all.get(ak, 1.0)
            blk_n_all[hk] = blk_n_all.get(hk, 0) + 1
            blk_n_all[ak] = blk_n_all.get(ak, 0) + 1
            div_blk_h[dv] = alpha_div * bh_obs + (1.0 - alpha_div) * dbh
            div_blk_a[dv] = alpha_div * ba_obs + (1.0 - alpha_div) * dba

        yel_tot_obs = float("nan")
        fls_tot_obs = float("nan")

        for q, sp in METRIC_SPECS.items():
            vh = obs_cols_h[q][i]
            va = obs_cols_a[q][i]
            if math.isfinite(vh) and math.isfinite(va) and vh >= 0.0 and va >= 0.0:
                vh_f = float(vh)
                va_f = float(va)
                dh_cur = div_stat_ewm.get((dv, f"{q}_h"), sp["default_h"])
                da_cur = div_stat_ewm.get((dv, f"{q}_a"), sp["default_a"])

                # Ratio observado normalizado por sede de liga Y ajustado por el rival enfrentado (`sqrt(opp)`)
                opp_def_for_h = math.sqrt(max(pre_def_eb[(ak, q)], 0.4))
                opp_att_for_h = math.sqrt(max(pre_att_eb[(ak, q)], 0.4))
                opp_def_for_a = math.sqrt(max(pre_def_eb[(hk, q)], 0.4))
                opp_att_for_a = math.sqrt(max(pre_att_eb[(hk, q)], 0.4))

                r_att_h = min(max((vh_f / max(dh_cur, 0.25)) / opp_def_for_h, 0.15), 3.20)
                r_def_h = min(max((va_f / max(da_cur, 0.25)) / opp_att_for_h, 0.15), 3.20)
                r_att_a = min(max((va_f / max(da_cur, 0.25)) / opp_def_for_a, 0.15), 3.20)
                r_def_a = min(max((vh_f / max(dh_cur, 0.25)) / opp_att_for_a, 0.15), 3.20)

                tm_att_all[(hk, q)] = alpha_all * r_att_h + (1.0 - alpha_all) * tm_att_all.get((hk, q), 1.0)
                tm_def_all[(hk, q)] = alpha_all * r_def_h + (1.0 - alpha_all) * tm_def_all.get((hk, q), 1.0)
                tm_att_all[(ak, q)] = alpha_all * r_att_a + (1.0 - alpha_all) * tm_att_all.get((ak, q), 1.0)
                tm_def_all[(ak, q)] = alpha_all * r_def_a + (1.0 - alpha_all) * tm_def_all.get((ak, q), 1.0)
                tm_n_all[(hk, q)] = tm_n_all.get((hk, q), 0) + 1
                tm_n_all[(ak, q)] = tm_n_all.get((ak, q), 0) + 1

                tm_att_home[(hk, q)] = alpha_venue * r_att_h + (1.0 - alpha_venue) * tm_att_home.get((hk, q), 1.0)
                tm_def_home[(hk, q)] = alpha_venue * r_def_h + (1.0 - alpha_venue) * tm_def_home.get((hk, q), 1.0)
                tm_n_home[(hk, q)] = tm_n_home.get((hk, q), 0) + 1

                tm_att_away[(ak, q)] = alpha_venue * r_att_a + (1.0 - alpha_venue) * tm_att_away.get((ak, q), 1.0)
                tm_def_away[(ak, q)] = alpha_venue * r_def_a + (1.0 - alpha_venue) * tm_def_away.get((ak, q), 1.0)
                tm_n_away[(ak, q)] = tm_n_away.get((ak, q), 0) + 1

                # Actualizar liga post-partido
                div_stat_ewm[(dv, f"{q}_h")] = alpha_div * vh_f + (1.0 - alpha_div) * dh_cur
                div_stat_ewm[(dv, f"{q}_a")] = alpha_div * va_f + (1.0 - alpha_div) * da_cur

                # Actualizar estado v3.6 de referencia
                v36_for[(hk, q)] = alpha_v36 * vh_f + (1.0 - alpha_v36) * v36_for.get((hk, q), dh_cur)
                v36_ag[(hk, q)] = alpha_v36 * va_f + (1.0 - alpha_v36) * v36_ag.get((hk, q), da_cur)
                v36_for[(ak, q)] = alpha_v36 * va_f + (1.0 - alpha_v36) * v36_for.get((ak, q), da_cur)
                v36_ag[(ak, q)] = alpha_v36 * vh_f + (1.0 - alpha_v36) * v36_ag.get((ak, q), dh_cur)
                v36_n[(hk, q)] = v36_n.get((hk, q), 0) + 1
                v36_n[(ak, q)] = v36_n.get((ak, q), 0) + 1

                tot_q = vh_f + va_f
                lst_h = team_last10_tot.setdefault((hk, q), [])
                lst_h.append(tot_q)
                if len(lst_h) > 20:
                    del lst_h[:-20]
                lst_a = team_last10_tot.setdefault((ak, q), [])
                lst_a.append(tot_q)
                if len(lst_a) > 20:
                    del lst_a[:-20]

                if q == "yellow_cards":
                    yel_tot_obs = tot_q
                elif q == "fouls":
                    fls_tot_obs = tot_q

        if rf:
            if math.isfinite(yel_tot_obs):
                gref_yel_n[rf] = gref_yel_n.get(rf, 0) + 1
                gref_yel_ratio_sum[rf] = gref_yel_ratio_sum.get(rf, 0.0) + min(max(yel_tot_obs / max(div_yel_tot, 0.8), 0.1), 3.5)
                rh_v = float(reds_h_vec[i]) if math.isfinite(reds_h_vec[i]) else 0.0
                ra_v = float(reds_a_vec[i]) if math.isfinite(reds_a_vec[i]) else 0.0
                gref_red_sum[rf] = gref_red_sum.get(rf, 0.0) + rh_v + ra_v
            if math.isfinite(fls_tot_obs):
                gref_fls_n[rf] = gref_fls_n.get(rf, 0) + 1
                gref_fls_ratio_sum[rf] = gref_fls_ratio_sum.get(rf, 0.0) + min(max(fls_tot_obs / max(div_fls_tot, 6.0), 0.3), 2.5)
            if math.isfinite(yel_tot_obs) and math.isfinite(fls_tot_obs) and fls_tot_obs >= 6.0:
                obs_cpf = yel_tot_obs / fls_tot_obs
                gref_cpf_n[rf] = gref_cpf_n.get(rf, 0) + 1
                gref_cpf_ratio_sum[rf] = gref_cpf_ratio_sum.get(rf, 0.0) + min(max(obs_cpf / max(div_cpf, 0.05), 0.2), 3.2)

    # Construcción de las 8 features exactas `v4.0`
    sup_h = lam_h_arr - lam_a_arr
    sup_a = -sup_h
    siege_h = np.maximum(0.0, sup_h) ** 1.4 - 0.5 * (np.maximum(0.0, -sup_h) ** 1.2)
    siege_a = np.maximum(0.0, sup_a) ** 1.4 - 0.5 * (np.maximum(0.0, -sup_a) ** 1.2)
    tempo_exc = (lam_h_arr + lam_a_arr) - 2.65
    tightness = np.exp(-np.abs(sup_h)) - 0.55
    season_crunch = np.maximum(0.0, sprog_arr - 0.70) * np.exp(-np.abs(sup_h))
    sstart = m_df["sstart"].to_numpy(dtype=int)

    def _build_8_features(q: str) -> tuple[np.ndarray, np.ndarray]:
        log_bh = np.log(np.maximum(base_v4_h[q], 0.12))
        log_ba = np.log(np.maximum(base_v4_a[q], 0.12))
        if q == "corners":
            cr_h = np.log(blk_ratio_h_arr)
            cr_a = np.log(blk_ratio_a_arr)
            rf_v = np.zeros(n_all, dtype=np.float64)
        elif q == "yellow_cards":
            # Física cruzada: faltas esperadas del lado × tarjetas-por-falta del árbitro global
            cr_h = np.log(np.clip(ratio_v4_h["fouls"] * gref_cpf_mult_arr, 0.35, 2.80))
            cr_a = np.log(np.clip(ratio_v4_a["fouls"] * gref_cpf_mult_arr, 0.35, 2.80))
            rf_v = np.log(gref_yel_mult_arr)
        elif q == "fouls":
            # Equipos sometidos al volumen de tiro rival cometen más faltas tácticas
            cr_h = np.log(ratio_v4_a["shots"])
            cr_a = np.log(ratio_v4_h["shots"])
            rf_v = np.log(gref_fls_mult_arr)
        elif q == "shots_on_target":
            cr_h = np.log(ratio_v4_h["shots"])
            cr_a = np.log(ratio_v4_a["shots"])
            rf_v = np.zeros(n_all, dtype=np.float64)
        else:  # shots
            cr_h = np.log(ratio_v4_h["corners"])
            cr_a = np.log(ratio_v4_a["corners"])
            rf_v = np.zeros(n_all, dtype=np.float64)

        Xh = np.column_stack([log_bh, sup_h, siege_h, tempo_exc, tightness, cr_h, season_crunch, rf_v])
        Xa = np.column_stack([log_ba, sup_a, siege_a, tempo_exc, tightness, cr_a, season_crunch, rf_v])
        return Xh, Xa

    metric_models_v4: dict[str, Any] = {}
    eval_summary: dict[str, Any] = {}
    cached_X: dict[str, tuple[np.ndarray, np.ndarray]] = {}

    for q, sp in METRIC_SPECS.items():
        Xh_all, Xa_all = _build_8_features(q)
        cached_X[q] = (Xh_all, Xa_all)

        yh = obs_cols_h[q]
        ya = obs_cols_a[q]
        valid = (sstart >= MIN_MODERN_SEASON) & np.isfinite(yh) & np.isfinite(ya) & (yh >= 0.0) & (ya >= 0.0)
        idx_v = np.where(valid)[0]
        ss_v = sstart[idx_v]
        yh_v = yh[idx_v]
        ya_v = ya[idx_v]
        ytot_v = yh_v + ya_v

        Xh_v = Xh_all[idx_v]
        Xa_v = Xa_all[idx_v]

        # Matriz v3.6 de 5 features para benchmark head-to-head exacto
        log_ref_36 = (
            np.log(gref_yel_mult_arr[idx_v])
            if q == "yellow_cards"
            else (np.log(gref_fls_mult_arr[idx_v]) if q == "fouls" else np.zeros(len(idx_v), dtype=np.float64))
        )
        Xh36_v = np.column_stack([np.log(np.maximum(base_v36_h[q][idx_v], 0.1)), sup_h[idx_v], tempo_exc[idx_v], tightness[idx_v], log_ref_36])
        Xa36_v = np.column_stack([np.log(np.maximum(base_v36_a[q][idx_v], 0.1)), sup_a[idx_v], tempo_exc[idx_v], tightness[idx_v], log_ref_36])

        val_m = ss_v <= VAL_MAX_SEASON
        oos_m = ss_v >= OOS_MIN_SEASON

        # Seleccionar regularización `alpha_reg` en VAL <= 2019 (usando 2012..2017 -> 2018..2019)
        sub_tr = ss_v <= 2017
        sub_vl = (ss_v >= 2018) & (ss_v <= 2019)
        best_alpha = 0.02
        best_dev = float("inf")
        for a_try in (0.002, 0.02, 0.10, 0.35):
            mh_t = PoissonRegressor(alpha=a_try, max_iter=600).fit(Xh_v[sub_tr], yh_v[sub_tr]).predict(Xh_v[sub_vl])
            ma_t = PoissonRegressor(alpha=a_try, max_iter=600).fit(Xa_v[sub_tr], ya_v[sub_tr]).predict(Xa_v[sub_vl])
            mse_v = float(np.mean(((mh_t + ma_t) - ytot_v[sub_vl]) ** 2))
            if mse_v < best_dev:
                best_dev = mse_v
                best_alpha = a_try

        pr_h_val = PoissonRegressor(alpha=best_alpha, max_iter=600).fit(Xh_v[val_m], yh_v[val_m])
        pr_a_val = PoissonRegressor(alpha=best_alpha, max_iter=600).fit(Xa_v[val_m], ya_v[val_m])
        mu_h_val = np.clip(pr_h_val.predict(Xh_v[val_m]), 0.15, 35.0)
        mu_a_val = np.clip(pr_a_val.predict(Xa_v[val_m]), 0.15, 35.0)
        r_h = _estimate_nb_dispersion_mom(yh_v[val_m], mu_h_val)
        r_a = _estimate_nb_dispersion_mom(ya_v[val_m], mu_a_val)

        cline = float(sp["canonical_total_line"])
        max_k = int(sp["max_k_side"])
        y_over_val = (ytot_v[val_m] > cline).astype(np.float64)
        y_1x2_val = np.where(yh_v[val_m] > ya_v[val_m], 0, np.where(yh_v[val_m] == ya_v[val_m], 1, 2)).astype(np.int64)

        # Calibrar `copula_omega` de Sarmanov estrictamente en `2018..2019` (dentro de VAL <= 2019)
        best_omega = 0.0
        best_cop_ll = float("inf")
        omega_grid = (-0.36, -0.24, -0.14, -0.06, 0.0, 0.06, 0.14, 0.24, 0.36)
        for om_try in omega_grid:
            po_vl, p1x2_vl = _batch_sarmanov_over_and_1x2_probs(
                mu_h_val[ss_v[val_m] >= 2018],
                mu_a_val[ss_v[val_m] >= 2018],
                r_h,
                r_a,
                max_k,
                om_try,
                cline,
            )
            yo_sub = y_over_val[ss_v[val_m] >= 2018]
            y3_sub = y_1x2_val[ss_v[val_m] >= 2018]
            po_c = np.clip(po_vl, 1e-12, 1.0 - 1e-12)
            ll_tot = float(-np.mean(yo_sub * np.log(po_c) + (1.0 - yo_sub) * np.log(1.0 - po_c)))
            ll_side = float(np.mean(oc.compute_categorical_log_loss_vec(p1x2_vl, y3_sub)))
            score_c = ll_tot + 0.35 * ll_side
            if score_c < best_cop_ll:
                best_cop_ll = score_c
                best_omega = om_try

        # Walk-forward anual estricto `s < yr -> yr` sobre `OOS 2020..2024`
        n_oos = int(np.sum(oos_m))
        mu_h_oos = np.empty(n_oos, dtype=np.float64)
        mu_a_oos = np.empty(n_oos, dtype=np.float64)
        mu36_h_oos = np.empty(n_oos, dtype=np.float64)
        mu36_a_oos = np.empty(n_oos, dtype=np.float64)

        oos_years = sorted(set(int(x) for x in ss_v[oos_m].tolist()))
        pos = 0
        for yr in oos_years:
            tr_f = ss_v < yr
            te_f = ss_v == yr
            cnt = int(np.sum(te_f))
            if cnt == 0:
                continue
            ph4 = PoissonRegressor(alpha=best_alpha, max_iter=600).fit(Xh_v[tr_f], yh_v[tr_f])
            pa4 = PoissonRegressor(alpha=best_alpha, max_iter=600).fit(Xa_v[tr_f], ya_v[tr_f])
            mu_h_oos[pos : pos + cnt] = np.clip(ph4.predict(Xh_v[te_f]), 0.15, 35.0)
            mu_a_oos[pos : pos + cnt] = np.clip(pa4.predict(Xa_v[te_f]), 0.15, 35.0)

            ph36 = PoissonRegressor(alpha=1e-3, max_iter=500).fit(Xh36_v[tr_f], yh_v[tr_f])
            pa36 = PoissonRegressor(alpha=1e-3, max_iter=500).fit(Xa36_v[tr_f], ya_v[tr_f])
            mu36_h_oos[pos : pos + cnt] = np.clip(ph36.predict(Xh36_v[te_f]), 0.15, 35.0)
            mu36_a_oos[pos : pos + cnt] = np.clip(pa36.predict(Xa36_v[te_f]), 0.15, 35.0)
            pos += cnt

        yh_oos = yh_v[oos_m]
        ya_oos = ya_v[oos_m]
        ytot_oos = ytot_v[oos_m]
        y_over_oos = (ytot_oos > cline).astype(np.float64)
        y_1x2_oos = np.where(yh_oos > ya_oos, 0, np.where(yh_oos == ya_oos, 1, 2)).astype(np.int64)

        p_over_v4, p_1x2_v4 = _batch_sarmanov_over_and_1x2_probs(mu_h_oos, mu_a_oos, r_h, r_a, max_k, best_omega, cline)
        p_over_v36, p_1x2_indep = _batch_sarmanov_over_and_1x2_probs(mu36_h_oos, mu36_a_oos, r_h, r_a, max_k, 0.0, cline)

        dh_oos = div_mean_h_arr[q][idx_v[oos_m]]
        da_oos = div_mean_a_arr[q][idx_v[oos_m]]
        p_over_clim, _ = _batch_sarmanov_over_and_1x2_probs(dh_oos, da_oos, r_h, r_a, max_k, 0.0, cline)

        boot_vs_v36 = paired_bootstrap_binary(y_over_oos, p_over_v4, p_over_v36)
        boot_vs_clim = paired_bootstrap_binary(y_over_oos, p_over_v4, p_over_clim)
        ev_side_1x2 = oc.evaluate_calibration_with_bootstrap(
            p_1x2_v4,
            y_1x2_oos,
            benchmark_ll_vec=oc.compute_categorical_log_loss_vec(p_1x2_indep, y_1x2_oos),
            n_resamples=BOOTSTRAP_SAMPLES,
            seed=BOOTSTRAP_SEED,
            include_bins=False,
        )

        l10_oos = raw_l10_over_prob[q][idx_v[oos_m]]
        has_l10 = np.isfinite(l10_oos)
        boot_vs_l10 = paired_bootstrap_binary(y_over_oos[has_l10], p_over_v4[has_l10], np.clip(l10_oos[has_l10], 0.02, 0.98))

        mae_v4 = float(np.mean(np.abs((mu_h_oos + mu_a_oos) - ytot_oos)))
        mae_v36 = float(np.mean(np.abs((mu36_h_oos + mu36_a_oos) - ytot_oos)))
        mae_clim = float(np.mean(np.abs((dh_oos + da_oos) - ytot_oos)))

        print(
            f"  [{q:15s}] OOS n={n_oos:,} | omega={best_omega:+.2f} | MAE: v4.0={mae_v4:.4f} vs v3.6={mae_v36:.4f} vs Clim={mae_clim:.4f} | "
            f"dLL vs v3.6={boot_vs_v36['delta_ll']:+.5f} ({boot_vs_v36['significance']}) | "
            f"dLL vs Clim={boot_vs_clim['delta_ll']:+.5f} ({boot_vs_clim['significance']}) | "
            f"1X2 Side dLL={ev_side_1x2['delta_ll_vs_benchmark']:+.5f} ({ev_side_1x2['significance']})"
        )

        # Ajuste final sobre `< 2025-02-02`
        pr_h_full = PoissonRegressor(alpha=best_alpha, max_iter=600).fit(Xh_v, yh_v)
        pr_a_full = PoissonRegressor(alpha=best_alpha, max_iter=600).fit(Xa_v, ya_v)

        metric_models_v4[q] = {
            "canonical_total_line": cline,
            "alt_total_lines": sp["alt_total_lines"],
            "handicap_lines": HANDICAP_LINES_BY_METRIC[q],
            "side_line": float(sp["side_line"]),
            "max_k_side": max_k,
            "default_home_rate": float(sp["default_h"]),
            "default_away_rate": float(sp["default_a"]),
            "dispersion_r_home": round(r_h, 6),
            "dispersion_r_away": round(r_a, 6),
            "copula_omega": float(best_omega),
            "feature_names": FEATURE_NAMES_V4_8,
            "home_coef": [float(v) for v in pr_h_full.coef_.tolist()],
            "home_intercept": float(pr_h_full.intercept_),
            "away_coef": [float(v) for v in pr_a_full.coef_.tolist()],
            "away_intercept": float(pr_a_full.intercept_),
        }

        eval_summary[q] = {
            "n_oos": n_oos,
            "selected_alpha": best_alpha,
            "selected_copula_omega": best_omega,
            "dispersion_r_home": round(r_h, 5),
            "dispersion_r_away": round(r_a, 5),
            "mae_total_v4_0": round(mae_v4, 5),
            "mae_total_v3_6": round(mae_v36, 5),
            "mae_total_dynamic_clim": round(mae_clim, 5),
            "vs_v3_6": boot_vs_v36,
            "vs_dynamic_league_clim": boot_vs_clim,
            "vs_scout_picks_raw_l10": boot_vs_l10,
            "side_1x2_vs_v3_6_indep": ev_side_1x2,
        }

    # Cargar `halves_config` y `div_priors` validados de `v3.6` (o construir desde estado actual)
    v36_art_path = REPO_ROOT / "src" / "data" / "prediction" / "model_soccer_micro_v3_6_candidate.json"
    v36_art = json.loads(v36_art_path.read_text(encoding="utf-8"))
    halves_cfg = v36_art["halves_config"]
    div_priors_out = v36_art["div_priors"]

    model_v4_art = {
        "schema_version": "soccer_micro_markets_v4.0.0",
        "codename": "PitchLab Bivariate Sarmanov Micro-Markets v4.0",
        "version": "4.0.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "halves_config": halves_cfg,
        "div_priors": div_priors_out,
        "metrics": metric_models_v4,
    }
    MICRO_V4_MODEL_OUT.write_text(json.dumps(model_v4_art, indent=2), encoding="utf-8")

    # Exportar priors globales de árbitros `v4.0`
    official_v4_entries: dict[str, Any] = {}
    for rf_nm, ny in sorted(gref_yel_n.items()):
        if ny < 8:
            continue
        cm = min(max((gref_yel_ratio_sum[rf_nm] + kappa_ref_global) / (ny + kappa_ref_global), 0.66), 1.45)
        nf = gref_fls_n.get(rf_nm, 0)
        fm = min(max((gref_fls_ratio_sum.get(rf_nm, 0.0) + kappa_ref_global) / (nf + kappa_ref_global), 0.74), 1.34) if nf > 0 else 1.0
        nc = gref_cpf_n.get(rf_nm, 0)
        cpfm = min(max((gref_cpf_ratio_sum.get(rf_nm, 0.0) + kappa_ref_global) / (nc + kappa_ref_global), 0.68), 1.44) if nc > 0 else 1.0
        official_v4_entries[rf_nm] = {
            "referee": rf_nm,
            "n_matches_global": int(ny),
            "cards_multiplier": round(float(cm), 6),
            "fouls_multiplier": round(float(fm), 6),
            "cards_per_foul_multiplier": round(float(cpfm), 6),
            "red_cards_per_match": round(float(gref_red_sum.get(rf_nm, 0.0) / max(ny, 1)), 5),
        }

    OFFICIAL_V4_PRIORS_OUT.write_text(
        json.dumps(
            {
                "schema_version": "official_priors_v4.0.0",
                "status": "candidate",
                "production_activated": False,
                "holdout_cut_utc": HOLDOUT_CUT_ISO,
                "holdout_sealed_untouched": True,
                "n_global_officials_tracked": len(official_v4_entries),
                "officials": official_v4_entries,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    # Snapshot de paridad exacta Python <-> TypeScript (`80` partidos OOS `< 2025-02-02`)
    cand_mask = (
        (sstart >= 2022)
        & np.isfinite(obs_cols_h["corners"])
        & np.isfinite(obs_cols_h["yellow_cards"])
        & np.isfinite(obs_cols_h["shots"])
    )
    cand_idx = np.where(cand_mask)[0]
    rng = np.random.default_rng(MODEL_SEED)
    chosen = np.sort(rng.choice(cand_idx, size=min(80, len(cand_idx)), replace=False))

    snap_rows: list[dict[str, Any]] = []
    for idx in chosen:
        dv = str(divs[idx])
        lh = min(max(float(lam_h_arr[idx]), 0.05), 8.0)
        la = min(max(float(lam_a_arr[idx]), 0.05), 8.0)

        feats_by_q: dict[str, Any] = {}
        exp_by_q: dict[str, Any] = {}
        for q in METRIC_SPECS:
            sp_m = metric_models_v4[q]
            xh8 = [float(v) for v in cached_X[q][0][idx].tolist()]
            xa8 = [float(v) for v in cached_X[q][1][idx].tolist()]
            feats_by_q[q] = {"homeFeatures8": xh8, "awayFeatures8": xa8}

            eta_h = float(sp_m["home_intercept"])
            eta_a = float(sp_m["away_intercept"])
            for k_c in range(len(sp_m["home_coef"])):
                eta_h += float(sp_m["home_coef"][k_c]) * xh8[k_c]
                eta_a += float(sp_m["away_coef"][k_c]) * xa8[k_c]
            mu_h = min(max(math.exp(eta_h), 0.15), 35.0)
            mu_a = min(max(math.exp(eta_a), 0.15), 35.0)

            biv = bivariate_sarmanov_summary_exact(
                mu_h,
                mu_a,
                float(sp_m["dispersion_r_home"]),
                float(sp_m["dispersion_r_away"]),
                int(sp_m["max_k_side"]),
                float(sp_m["copula_omega"]),
                list(sp_m["handicap_lines"]),
            )
            po_c, pu_c, pp_c = line_probs_from_pmf(biv["pmf_total"], float(sp_m["canonical_total_line"]))
            exp_by_q[q] = {
                "mu_home": mu_h,
                "mu_away": mu_a,
                "p_over_canonical": po_c,
                "p_under_canonical": pu_c,
                "p_push_canonical": pp_c,
                "p_home_most": biv["p_home_most"],
                "p_tie": biv["p_tie"],
                "p_away_most": biv["p_away_most"],
                "p_hc_first_no_push": biv["handicaps"][0]["pHomeCoverNoPush"],
            }

        snap_rows.append(
            {
                "match_id": str(m_df.iloc[idx]["match_id"]),
                "div": dv,
                "home_team": str(homes[idx]),
                "away_team": str(aways[idx]),
                "lam_home": lh,
                "lam_away": la,
                "features_by_metric": feats_by_q,
                "expected": exp_by_q,
            }
        )

    MICRO_V4_SNAPSHOT_OUT.write_text(
        json.dumps(
            {
                "schema_version": "soccer_micro_v4.0_parity_snapshot",
                "holdout_sealed_untouched": True,
                "n": len(snap_rows),
                "rows": snap_rows,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    results_payload = {
        "experiment_id": "EXP_V44_micro_markets_v4_0",
        "eval_split": "walk_forward_oos_2020_2024",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "n_global_officials_tracked": len(official_v4_entries),
        "metrics_oos": eval_summary,
        "artifacts": {
            "model_soccer_micro_v4_0_sha256": hashlib.sha256(MICRO_V4_MODEL_OUT.read_bytes()).hexdigest(),
            "official_priors_v4_0_sha256": hashlib.sha256(OFFICIAL_V4_PRIORS_OUT.read_bytes()).hexdigest(),
        },
    }
    RESULTS_OUT.write_text(json.dumps(results_payload, indent=2), encoding="utf-8")

    with TRIAL_REGISTRY_OUT.open("a", encoding="utf-8") as fh:
        fh.write(
            json.dumps(
                {
                    "recorded_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V44_micro_markets_v4_0",
                    "holdout_touched": False,
                    "corners_dll_vs_v36": round(eval_summary["corners"]["vs_v3_6"]["delta_ll"], 6),
                    "corners_dll_vs_clim": round(eval_summary["corners"]["vs_dynamic_league_clim"]["delta_ll"], 6),
                    "yellows_dll_vs_v36": round(eval_summary["yellow_cards"]["vs_v3_6"]["delta_ll"], 6),
                    "yellows_dll_vs_clim": round(eval_summary["yellow_cards"]["vs_dynamic_league_clim"]["delta_ll"], 6),
                }
            )
            + "\n"
        )
    print(f"[DONE] EXP_V44 guardado en {RESULTS_OUT.name}")


if __name__ == "__main__":
    main()
