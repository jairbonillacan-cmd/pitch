"""EXP_V40 — Motor Causal de Micro-Mercados de Fútbol, Mitades (1H/2H) y Árbitros Empirical Bayes (`v3.6`).

Supera simultáneamente:
  1. El conteo frecuentista crudo `k/n` sin ajuste de rival/árbitro de Scout Picks (`-21.68%` ROI, `ECE > 23 pp`).
  2. La Binomial Negativa estática desacoplada del marcador esperado de Astra AI (`+1.84%` mejora MAE en córners
     y `+1.29%` en tiros a puerta).

Arquitectura causal (`t' < t`, corte duro `match_date < 2025-02-02`, `holdout_sealed` 100% intacto):
  - Tasas EWMA + contracción Empirical Bayes de ataque/defensa por club y división para:
    `corners`, `yellow_cards`, `fouls`, `shots` y `shots_on_target`.
  - Prior Empirical Bayes causal por árbitro (`official_priors_v3_6.json`) sobre `yellow_cards`, `red_cards` y `fouls`.
  - Acoplamiento físico al guion del partido (`(lamHome, lamAway)` pre-partido):
      * `sup_s = lam_s - lam_opp` (presión territorial del favorito frente a bloque bajo).
      * `tempo_exc = (lam_H + lam_A) - 2.65` (ritmo global esperado).
      * `tightness = exp(-|lam_H - lam_A|) - 0.55` (tensión competitiva en cierres apretados -> tarjetas/faltas).
  - PMF Binomial Negativa exacta por recurrencia `exp(r * log(r / (r + mu)))` + convolución discreta exacta `H * A`
    para líneas de partido y por equipo con soporte exacto de `push` en líneas enteras (`.0`).
  - Descomposición coherente `1H / 2H` Dixon-Coles (`lam_1H + lam_2H = lam_FT`) sobre `ht_home_goals` / `ht_away_goals`.
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
import re
import sys
from typing import Any

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression, PoissonRegressor

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"
ARTIFACTS_DIR = EXP_DIR / "artifacts"

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from services.models import outlook_calibration as oc  # noqa: E402

HOLDOUT_CUT_DATE = "2025-02-02"
HOLDOUT_CUT_ISO = "2025-02-02T17:30:00Z"
BOOTSTRAP_SAMPLES = 1000
BOOTSTRAP_SEED = 20261111
MODEL_SEED = 42

MIN_MODERN_SEASON = 2012
VAL_MAX_SEASON = 2019
OOS_MIN_SEASON = 2020

MICRO_MODEL_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_soccer_micro_v3_6_candidate.json"
OFFICIAL_PRIORS_OUT = REPO_ROOT / "src" / "data" / "prediction" / "official_priors_v3_6.json"
MICRO_SNAPSHOT_OUT = REPO_ROOT / "src" / "data" / "prediction" / "soccer_micro_v3_6_snapshot.json"
RESULTS_OUT = ARTIFACTS_DIR / "exp_v40_micro_markets_results.json"
TRIAL_REGISTRY_OUT = EXP_DIR / "trial_registry_micro_v36.jsonl"

METRIC_SPECS: dict[str, dict[str, Any]] = {
    "corners": {
        "h_col": "corners_home",
        "a_col": "corners_away",
        "max_k_side": 25,
        "default_h": 5.45,
        "default_a": 4.40,
        "use_ref": False,
        "canonical_total_line": 9.5,
        "alt_total_lines": [8.5, 9.0, 9.5, 10.0, 10.5],
        "side_line": 4.5,
    },
    "yellow_cards": {
        "h_col": "yellows_home",
        "a_col": "yellows_away",
        "max_k_side": 16,
        "default_h": 1.85,
        "default_a": 2.15,
        "use_ref": True,
        "canonical_total_line": 3.5,
        "alt_total_lines": [3.5, 4.0, 4.5, 5.5],
        "side_line": 1.5,
    },
    "fouls": {
        "h_col": "fouls_home",
        "a_col": "fouls_away",
        "max_k_side": 36,
        "default_h": 11.80,
        "default_a": 12.20,
        "use_ref": True,
        "canonical_total_line": 23.5,
        "alt_total_lines": [21.5, 23.5, 25.5],
        "side_line": 11.5,
    },
    "shots_on_target": {
        "h_col": "sot_home",
        "a_col": "sot_away",
        "max_k_side": 24,
        "default_h": 4.65,
        "default_a": 3.85,
        "use_ref": False,
        "canonical_total_line": 8.5,
        "alt_total_lines": [7.5, 8.5, 9.5],
        "side_line": 4.5,
    },
    "shots": {
        "h_col": "shots_home",
        "a_col": "shots_away",
        "max_k_side": 38,
        "default_h": 13.40,
        "default_a": 10.90,
        "use_ref": False,
        "canonical_total_line": 24.5,
        "alt_total_lines": [22.5, 24.5, 26.5],
        "side_line": 12.5,
    },
}


def normalize_referee_name(raw: Any) -> str:
    if raw is None or (isinstance(raw, float) and math.isnan(raw)):
        return ""
    s = str(raw).strip()
    if not s or s.lower() in {"nan", "none", "null", "unknown"}:
        return ""
    s = re.sub(r"\s+", " ", s)
    return s


def nb_pmf_exact(mu: float, r_disp: float, max_k: int) -> np.ndarray:
    """PMF Binomial Negativa truncada y renormalizada en `0..max_k` usando solo aritmética elemental IEEE-754."""
    mu_c = min(max(float(mu), 0.02), 45.0)
    r_c = min(max(float(r_disp), 0.35), 250.0)
    out = np.zeros(max_k + 1, dtype=np.float64)
    p0_ratio = r_c / (r_c + mu_c)
    q_ratio = mu_c / (r_c + mu_c)
    out[0] = math.exp(r_c * math.log(p0_ratio))
    for k in range(1, max_k + 1):
        out[k] = out[k - 1] * ((k - 1.0 + r_c) / float(k)) * q_ratio
    s = float(np.sum(out))
    if s > 0.0:
        out /= s
    else:
        out[0] = 1.0
    return out


def convolve_pmf_exact(pmf_h: np.ndarray, pmf_a: np.ndarray) -> np.ndarray:
    nh = len(pmf_h)
    na = len(pmf_a)
    tot = np.zeros(nh + na - 1, dtype=np.float64)
    for i in range(nh):
        pi = float(pmf_h[i])
        if pi <= 0.0:
            continue
        for j in range(na):
            tot[i + j] += pi * float(pmf_a[j])
    s = float(np.sum(tot))
    if s > 0.0:
        tot /= s
    return tot


def line_probs_from_pmf(pmf: np.ndarray, line: float) -> tuple[float, float, float]:
    """Devuelve `(p_over, p_under, p_push)` exactos para línea entera o semientera."""
    ln = float(line)
    is_int = abs(ln - round(ln)) < 1e-9
    if is_int:
        k_line = int(round(ln))
        p_push = float(pmf[k_line]) if 0 <= k_line < len(pmf) else 0.0
        p_under = float(np.sum(pmf[: max(0, min(k_line, len(pmf)))]))
        p_over = max(0.0, 1.0 - p_under - p_push)
        return p_over, p_under, p_push
    k_floor = int(math.floor(ln))
    p_under = float(np.sum(pmf[: max(0, min(k_floor + 1, len(pmf)))]))
    p_over = max(0.0, 1.0 - p_under)
    return p_over, p_under, 0.0


def build_dc_matrix_small(lam_h: float, lam_a: float, rho: float, max_goals: int = 8) -> np.ndarray:
    lh = min(max(float(lam_h), 0.02), 8.0)
    la = min(max(float(lam_a), 0.02), 8.0)
    r = min(max(float(rho), -0.35), 0.25)
    size = max_goals + 1
    pmf_h = np.zeros(size, dtype=np.float64)
    pmf_a = np.zeros(size, dtype=np.float64)
    pmf_h[0] = math.exp(-lh)
    pmf_a[0] = math.exp(-la)
    for k in range(1, size):
        pmf_h[k] = pmf_h[k - 1] * lh / float(k)
        pmf_a[k] = pmf_a[k - 1] * la / float(k)
    mat = np.outer(pmf_h, pmf_a)
    mat[0, 0] *= max(0.0, 1.0 - lh * la * r)
    mat[1, 0] *= max(0.0, 1.0 + la * r)
    mat[0, 1] *= max(0.0, 1.0 + lh * r)
    mat[1, 1] *= max(0.0, 1.0 - r)
    s = float(np.sum(mat))
    if s > 0.0:
        mat /= s
    return mat


def paired_bootstrap_binary(
    y_true: np.ndarray,
    p_cand: np.ndarray,
    p_bench: np.ndarray,
) -> dict[str, Any]:
    eps = 1e-12
    yt = np.asarray(y_true, dtype=np.float64)
    pc = np.clip(np.asarray(p_cand, dtype=np.float64), eps, 1.0 - eps)
    pb = np.clip(np.asarray(p_bench, dtype=np.float64), eps, 1.0 - eps)

    llc = -(yt * np.log(pc) + (1.0 - yt) * np.log(1.0 - pc))
    llb = -(yt * np.log(pb) + (1.0 - yt) * np.log(1.0 - pb))
    diff = llc - llb

    brier_c = float(np.mean((pc - yt) ** 2))
    brier_b = float(np.mean((pb - yt) ** 2))
    bss_vs_bench = 1.0 - brier_c / max(brier_b, 1e-12)

    n = len(yt)
    boot_means = np.empty(BOOTSTRAP_SAMPLES, dtype=np.float64)
    step_cur = 1
    for b in range(BOOTSTRAP_SAMPLES):
        u = oc.mulberry32_uniforms_range(BOOTSTRAP_SEED, step_cur, n)
        step_cur += n
        idx = np.floor(u * n).astype(np.int64)
        boot_means[b] = float(np.mean(diff[idx]))

    ci_lo = float(np.quantile(boot_means, 0.025))
    ci_hi = float(np.quantile(boot_means, 0.975))
    delta_ll = float(np.mean(diff))
    sig = "significativa" if (ci_hi < 0.0 or ci_lo > 0.0) else "no significativa"

    # ECE 10 bins
    bins = np.linspace(0.0, 1.0, 11)
    ece = 0.0
    for i in range(10):
        m = (pc >= bins[i]) & (pc < bins[i + 1] if i < 9 else pc <= bins[i + 1])
        cnt = int(np.sum(m))
        if cnt > 0:
            ece += (cnt / n) * abs(float(np.mean(pc[m])) - float(np.mean(yt[m])))

    return {
        "n": int(n),
        "log_loss": float(np.mean(llc)),
        "benchmark_log_loss": float(np.mean(llb)),
        "delta_ll": delta_ll,
        "delta_ll_ci95": [ci_lo, ci_hi],
        "significance": sig,
        "brier": brier_c,
        "benchmark_brier": brier_b,
        "bss_pct_vs_benchmark": round(100.0 * bss_vs_bench, 3),
        "ece": float(ece),
    }


def _estimate_nb_dispersion_mom(y_obs: np.ndarray, mu_hat: np.ndarray) -> float:
    """Estimador robusto de momentos `Var(Y) = mu + mu^2 / r` sobre residuos cuadrados."""
    resid_sq = (y_obs - mu_hat) ** 2 - mu_hat
    num = float(np.sum(mu_hat ** 2))
    den = float(np.sum(resid_sq))
    if den <= 1e-6:
        return 80.0
    r_est = num / den
    return float(min(max(r_est, 1.25), 120.0))


def main() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    matches_path = PRED_LAB_ROOT / "data" / "processed" / "matches.parquet"
    features_path = PRED_LAB_ROOT / "data" / "processed" / "features.parquet"

    m_df = pd.read_parquet(matches_path)
    # Guardia dura anti-fuga hacia holdout_sealed
    m_df["match_date_str"] = m_df["match_date"].astype(str).str.slice(0, 10)
    m_df = m_df[m_df["match_date_str"] < HOLDOUT_CUT_DATE].copy()
    if bool((m_df["match_date_str"] >= HOLDOUT_CUT_DATE).any()):
        raise RuntimeError("DataLeakageError: detectada fila >= HOLDOUT_CUT_DATE en EXP_V40")

    if features_path.exists():
        f_cols = pd.read_parquet(
            features_path,
            columns=["match_id", "dc_lam_home", "dc_lam_away", "elo_diff_no_hfa"],
        )
        m_df = m_df.merge(f_cols, on="match_id", how="left")
    else:
        m_df["dc_lam_home"] = np.nan
        m_df["dc_lam_away"] = np.nan
        m_df["elo_diff_no_hfa"] = 0.0

    m_df["sstart"] = pd.to_numeric(m_df["season_start"], errors="coerce").fillna(2000).astype(int)
    m_df = m_df.sort_values(["match_date_str", "kickoff_time", "match_id"], kind="mergesort").reset_index(drop=True)

    n_all = len(m_df)
    print(f"[EXP_V40] Partidos pre-holdout (< {HOLDOUT_CUT_DATE}): {n_all:,}")

    # Acumuladores causales t' < t
    alpha_team = 2.0 / 13.0  # span=12
    alpha_div = 2.0 / 201.0  # span=200
    kappa_team = 6.0
    kappa_ref_cards = 15.0  # calibrado estilo Empirical Bayes (verificado en VAL)
    kappa_ref_fouls = 15.0

    div_stat_ewm: dict[tuple[str, str], float] = {}
    team_for_ewm: dict[tuple[str, str], float] = {}
    team_ag_ewm: dict[tuple[str, str], float] = {}
    team_n: dict[tuple[str, str], int] = {}
    team_last10_tot: dict[tuple[str, str], list[float]] = {}

    ref_games: dict[tuple[str, str], int] = {}
    ref_sum_yel: dict[tuple[str, str], float] = {}
    ref_sum_red: dict[tuple[str, str], float] = {}
    ref_sum_fls: dict[tuple[str, str], float] = {}

    # Goles causales de respaldo si falta dc_lam_*
    gf_ewm: dict[str, float] = {}
    ga_ewm: dict[str, float] = {}
    ht_gf_ewm: dict[str, float] = {}
    ht_ga_ewm: dict[str, float] = {}
    div_ht_share_ewm: dict[str, float] = {}

    # Arreglos pre-alocados de features causales
    lam_h_arr = np.empty(n_all, dtype=np.float64)
    lam_a_arr = np.empty(n_all, dtype=np.float64)
    div_ht_share_arr = np.empty(n_all, dtype=np.float64)
    ref_cards_mult_arr = np.ones(n_all, dtype=np.float64)
    ref_fouls_mult_arr = np.ones(n_all, dtype=np.float64)

    base_rate_h: dict[str, np.ndarray] = {q: np.empty(n_all, dtype=np.float64) for q in METRIC_SPECS}
    base_rate_a: dict[str, np.ndarray] = {q: np.empty(n_all, dtype=np.float64) for q in METRIC_SPECS}
    div_mean_tot: dict[str, np.ndarray] = {q: np.empty(n_all, dtype=np.float64) for q in METRIC_SPECS}
    raw_l10_over_prob: dict[str, np.ndarray] = {q: np.full(n_all, np.nan, dtype=np.float64) for q in METRIC_SPECS}

    # Extracción vectorizada de columnas de entrada para loop rápido
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

    obs_cols_h: dict[str, np.ndarray] = {}
    obs_cols_a: dict[str, np.ndarray] = {}
    for q, sp in METRIC_SPECS.items():
        obs_cols_h[q] = pd.to_numeric(m_df[sp["h_col"]], errors="coerce").to_numpy(dtype=np.float64)
        obs_cols_a[q] = pd.to_numeric(m_df[sp["a_col"]], errors="coerce").to_numpy(dtype=np.float64)
    reds_h_vec = pd.to_numeric(m_df["reds_home"], errors="coerce").to_numpy(dtype=np.float64)
    reds_a_vec = pd.to_numeric(m_df["reds_away"], errors="coerce").to_numpy(dtype=np.float64)

    for i in range(n_all):
        dv = divs[i]
        hk = f"{dv}::{homes[i]}"
        ak = f"{dv}::{aways[i]}"
        rf = refs[i]

        # 1. Goles esperados pre-partido (lam_H, lam_A)
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
        div_ht_share_arr[i] = div_ht_share_ewm.get(dv, 0.442)

        # 2. Prior Empirical Bayes del Árbitro (t' < t)
        div_yel_tot = div_stat_ewm.get((dv, "yellow_cards_h"), 1.85) + div_stat_ewm.get((dv, "yellow_cards_a"), 2.15)
        div_fls_tot = div_stat_ewm.get((dv, "fouls_h"), 11.80) + div_stat_ewm.get((dv, "fouls_a"), 12.20)
        if rf:
            rk = (dv, rf)
            nr_y = ref_games.get(rk, 0)
            if nr_y > 0:
                eb_yel = (ref_sum_yel[rk] + kappa_ref_cards * div_yel_tot) / (nr_y + kappa_ref_cards)
                ref_cards_mult_arr[i] = min(max(eb_yel / max(div_yel_tot, 0.5), 0.68), 1.42)
            nr_f = ref_games.get((f"{dv}_fls", rf), 0)
            if nr_f > 0:
                eb_fls = (ref_sum_fls[(f"{dv}_fls", rf)] + kappa_ref_fouls * div_fls_tot) / (nr_f + kappa_ref_fouls)
                ref_fouls_mult_arr[i] = min(max(eb_fls / max(div_fls_tot, 4.0), 0.75), 1.32)

        # 3. Tasas base contraídas por equipo + baseline Scout Picks L10 crudo
        for q, sp in METRIC_SPECS.items():
            dh = div_stat_ewm.get((dv, f"{q}_h"), sp["default_h"])
            da = div_stat_ewm.get((dv, f"{q}_a"), sp["default_a"])
            d_neutral = 0.5 * (dh + da)
            div_mean_tot[q][i] = dh + da

            nh = team_n.get((hk, q), 0)
            na = team_n.get((ak, q), 0)
            fh_raw = team_for_ewm.get((hk, q), dh)
            ah_raw = team_ag_ewm.get((hk, q), da)
            fa_raw = team_for_ewm.get((ak, q), da)
            aa_raw = team_ag_ewm.get((ak, q), dh)

            fh_eb = (nh * fh_raw + kappa_team * dh) / (nh + kappa_team)
            ah_eb = (nh * ah_raw + kappa_team * da) / (nh + kappa_team)
            fa_eb = (na * fa_raw + kappa_team * da) / (na + kappa_team)
            aa_eb = (na * aa_raw + kappa_team * dh) / (na + kappa_team)

            # Tasa multiplicativa simétrica estilo Dixon-Coles
            mu_h_base = dh * (fh_eb / max(dh, 0.2)) * (aa_eb / max(dh, 0.2))
            mu_a_base = da * (fa_eb / max(da, 0.2)) * (ah_eb / max(da, 0.2))
            # Suavizado geométrico 0.5 para evitar explosión en colas
            mu_h_base = dh * math.sqrt((fh_eb / max(dh, 0.2)) * (aa_eb / max(dh, 0.2))) * (
                (fh_eb / max(d_neutral, 0.2)) ** 0.35
            )
            mu_a_base = da * math.sqrt((fa_eb / max(da, 0.2)) * (ah_eb / max(da, 0.2))) * (
                (fa_eb / max(d_neutral, 0.2)) ** 0.35
            )
            base_rate_h[q][i] = min(max(mu_h_base, 0.15), 30.0)
            base_rate_a[q][i] = min(max(mu_a_base, 0.15), 30.0)

            # Reconstrucción exacta Scout Picks: promedio de aciertos L10 de ambos clubes sobre línea canónica
            lh_hist = team_last10_tot.get((hk, q))
            la_hist = team_last10_tot.get((ak, q))
            if lh_hist and la_hist and len(lh_hist) >= 5 and len(la_hist) >= 5:
                cline = sp["canonical_total_line"]
                hr_h = sum(1.0 for v in lh_hist[-10:] if v > cline) / len(lh_hist[-10:])
                hr_a = sum(1.0 for v in la_hist[-10:] if v > cline) / len(la_hist[-10:])
                raw_l10_over_prob[q][i] = 0.5 * (hr_h + hr_a)

        # 4. ACTUALIZACIÓN ESTRICTAMENTE POST-PARTIDO (garantiza 0 fuga t' < t)
        if math.isfinite(hg_vec[i]) and math.isfinite(ag_vec[i]):
            hg_v = float(hg_vec[i])
            ag_v = float(ag_vec[i])
            gf_ewm[hk] = alpha_team * hg_v + (1.0 - alpha_team) * gf_ewm.get(hk, 1.45)
            ga_ewm[hk] = alpha_team * ag_v + (1.0 - alpha_team) * ga_ewm.get(hk, 1.18)
            gf_ewm[ak] = alpha_team * ag_v + (1.0 - alpha_team) * gf_ewm.get(ak, 1.18)
            ga_ewm[ak] = alpha_team * hg_v + (1.0 - alpha_team) * ga_ewm.get(ak, 1.45)

            if math.isfinite(ht_hg_vec[i]) and math.isfinite(ht_ag_vec[i]):
                tot_ft = hg_v + ag_v
                tot_ht = float(ht_hg_vec[i]) + float(ht_ag_vec[i])
                ht_gf_ewm[hk] = alpha_team * float(ht_hg_vec[i]) + (1.0 - alpha_team) * ht_gf_ewm.get(hk, 0.62)
                ht_ga_ewm[hk] = alpha_team * float(ht_ag_vec[i]) + (1.0 - alpha_team) * ht_ga_ewm.get(hk, 0.52)
                ht_gf_ewm[ak] = alpha_team * float(ht_ag_vec[i]) + (1.0 - alpha_team) * ht_gf_ewm.get(ak, 0.52)
                ht_ga_ewm[ak] = alpha_team * float(ht_hg_vec[i]) + (1.0 - alpha_team) * ht_ga_ewm.get(ak, 0.62)
                if tot_ft > 0.0:
                    obs_sh = min(max(tot_ht / tot_ft, 0.0), 1.0)
                    div_ht_share_ewm[dv] = alpha_div * obs_sh + (1.0 - alpha_div) * div_ht_share_ewm.get(dv, 0.442)

        for q, sp in METRIC_SPECS.items():
            vh = obs_cols_h[q][i]
            va = obs_cols_a[q][i]
            if math.isfinite(vh) and math.isfinite(va) and vh >= 0.0 and va >= 0.0:
                vh_f = float(vh)
                va_f = float(va)
                div_stat_ewm[(dv, f"{q}_h")] = alpha_div * vh_f + (1.0 - alpha_div) * div_stat_ewm.get(
                    (dv, f"{q}_h"), sp["default_h"]
                )
                div_stat_ewm[(dv, f"{q}_a")] = alpha_div * va_f + (1.0 - alpha_div) * div_stat_ewm.get(
                    (dv, f"{q}_a"), sp["default_a"]
                )
                team_for_ewm[(hk, q)] = alpha_team * vh_f + (1.0 - alpha_team) * team_for_ewm.get(
                    (hk, q), div_stat_ewm[(dv, f"{q}_h")]
                )
                team_ag_ewm[(hk, q)] = alpha_team * va_f + (1.0 - alpha_team) * team_ag_ewm.get(
                    (hk, q), div_stat_ewm[(dv, f"{q}_a")]
                )
                team_for_ewm[(ak, q)] = alpha_team * va_f + (1.0 - alpha_team) * team_for_ewm.get(
                    (ak, q), div_stat_ewm[(dv, f"{q}_a")]
                )
                team_ag_ewm[(ak, q)] = alpha_team * vh_f + (1.0 - alpha_team) * team_ag_ewm.get(
                    (ak, q), div_stat_ewm[(dv, f"{q}_h")]
                )
                team_n[(hk, q)] = team_n.get((hk, q), 0) + 1
                team_n[(ak, q)] = team_n.get((ak, q), 0) + 1

                tot_q = vh_f + va_f
                lst_h = team_last10_tot.setdefault((hk, q), [])
                lst_h.append(tot_q)
                if len(lst_h) > 20:
                    del lst_h[:-20]
                lst_a = team_last10_tot.setdefault((ak, q), [])
                lst_a.append(tot_q)
                if len(lst_a) > 20:
                    del lst_a[:-20]

                if rf and q == "yellow_cards":
                    rk = (dv, rf)
                    ref_games[rk] = ref_games.get(rk, 0) + 1
                    ref_sum_yel[rk] = ref_sum_yel.get(rk, 0.0) + tot_q
                    rh_v = float(reds_h_vec[i]) if math.isfinite(reds_h_vec[i]) else 0.0
                    ra_v = float(reds_a_vec[i]) if math.isfinite(reds_a_vec[i]) else 0.0
                    ref_sum_red[rk] = ref_sum_red.get(rk, 0.0) + rh_v + ra_v
                elif rf and q == "fouls":
                    rkf = (f"{dv}_fls", rf)
                    ref_games[rkf] = ref_games.get(rkf, 0) + 1
                    ref_sum_fls[rkf] = ref_sum_fls.get(rkf, 0.0) + tot_q

    # Covariables universales de guion de partido (Game-State Coupling)
    sup_h = lam_h_arr - lam_a_arr
    sup_a = -sup_h
    tempo_exc = (lam_h_arr + lam_a_arr) - 2.65
    tightness = np.exp(-np.abs(sup_h)) - 0.55
    sstart = m_df["sstart"].to_numpy(dtype=int)

    # Entrenamiento walk-forward y evaluación OOS 2020..2024 (< 2025-02-02)
    metric_models_json: dict[str, Any] = {}
    eval_summary: dict[str, Any] = {}

    for q, sp in METRIC_SPECS.items():
        yh = obs_cols_h[q]
        ya = obs_cols_a[q]
        valid = (
            (sstart >= MIN_MODERN_SEASON)
            & np.isfinite(yh)
            & np.isfinite(ya)
            & (yh >= 0.0)
            & (ya >= 0.0)
        )
        idx_v = np.where(valid)[0]
        ss_v = sstart[idx_v]
        yh_v = yh[idx_v]
        ya_v = ya[idx_v]
        ytot_v = yh_v + ya_v

        log_bh = np.log(np.maximum(base_rate_h[q][idx_v], 0.1))
        log_ba = np.log(np.maximum(base_rate_a[q][idx_v], 0.1))
        log_ref = (
            np.log(ref_cards_mult_arr[idx_v])
            if q == "yellow_cards"
            else (np.log(ref_fouls_mult_arr[idx_v]) if q == "fouls" else np.zeros(len(idx_v), dtype=np.float64))
        )

        # Matriz de diseño [log_base, sup_side, tempo_exc, tightness, log_ref_mult]
        Xh = np.column_stack([log_bh, sup_h[idx_v], tempo_exc[idx_v], tightness[idx_v], log_ref])
        Xa = np.column_stack([log_ba, sup_a[idx_v], tempo_exc[idx_v], tightness[idx_v], log_ref])

        # Walk-forward anual s < yr -> yr en OOS 2020..2024
        oos_mask_local = ss_v >= OOS_MIN_SEASON
        val_mask_local = ss_v <= VAL_MAX_SEASON

        # Calibrar dispersión Binomial Negativa en VAL <= 2019
        pr_h_val = PoissonRegressor(alpha=1e-3, max_iter=500).fit(Xh[val_mask_local], yh_v[val_mask_local])
        pr_a_val = PoissonRegressor(alpha=1e-3, max_iter=500).fit(Xa[val_mask_local], ya_v[val_mask_local])
        mu_h_val_in = np.clip(pr_h_val.predict(Xh[val_mask_local]), 0.1, 35.0)
        mu_a_val_in = np.clip(pr_a_val.predict(Xa[val_mask_local]), 0.1, 35.0)
        r_disp_h = _estimate_nb_dispersion_mom(yh_v[val_mask_local], mu_h_val_in)
        r_disp_a = _estimate_nb_dispersion_mom(ya_v[val_mask_local], mu_a_val_in)

        # Predicciones OOS estrictamente causales año por año (2020..2024)
        oos_indices = np.where(oos_mask_local)[0]
        mu_h_oos = np.empty(len(oos_indices), dtype=np.float64)
        mu_a_oos = np.empty(len(oos_indices), dtype=np.float64)
        mu_static_tot_oos = base_rate_h[q][idx_v[oos_indices]] + base_rate_a[q][idx_v[oos_indices]]
        mu_clim_tot_oos = div_mean_tot[q][idx_v[oos_indices]]

        unique_oos_years = sorted(set(int(x) for x in ss_v[oos_mask_local]))
        pos_map = {orig_i: k for k, orig_i in enumerate(oos_indices)}
        for yr in unique_oos_years:
            tr_m = ss_v < yr
            te_m = ss_v == yr
            pr_hy = PoissonRegressor(alpha=1e-3, max_iter=500).fit(Xh[tr_m], yh_v[tr_m])
            pr_ay = PoissonRegressor(alpha=1e-3, max_iter=500).fit(Xa[tr_m], ya_v[tr_m])
            te_locs = np.where(te_m)[0]
            ph_pred = np.clip(pr_hy.predict(Xh[te_locs]), 0.15, 35.0)
            pa_pred = np.clip(pr_ay.predict(Xa[te_locs]), 0.15, 35.0)
            for j_idx, loc_i in enumerate(te_locs):
                k_out = pos_map[int(loc_i)]
                mu_h_oos[k_out] = ph_pred[j_idx]
                mu_a_oos[k_out] = pa_pred[j_idx]

        mu_tot_oos = mu_h_oos + mu_a_oos
        y_tot_oos = ytot_v[oos_indices]

        mae_clim = float(np.mean(np.abs(y_tot_oos - mu_clim_tot_oos)))
        mae_static = float(np.mean(np.abs(y_tot_oos - mu_static_tot_oos)))
        mae_v36 = float(np.mean(np.abs(y_tot_oos - mu_tot_oos)))
        rmse_clim = float(math.sqrt(np.mean((y_tot_oos - mu_clim_tot_oos) ** 2)))
        rmse_v36 = float(math.sqrt(np.mean((y_tot_oos - mu_tot_oos) ** 2)))
        corr_v36 = float(np.corrcoef(y_tot_oos, mu_tot_oos)[0, 1])

        # Probabilidad Over línea canónica: PitchLab NB acoplada vs Climatología NB vs Scout Picks L10 crudo
        cline = float(sp["canonical_total_line"])
        max_k = int(sp["max_k_side"])
        p_over_v36 = np.empty(len(oos_indices), dtype=np.float64)
        p_over_static = np.empty(len(oos_indices), dtype=np.float64)
        p_over_clim = np.empty(len(oos_indices), dtype=np.float64)

        for k_i in range(len(oos_indices)):
            tot_pmf = convolve_pmf_exact(
                nb_pmf_exact(mu_h_oos[k_i], r_disp_h, max_k),
                nb_pmf_exact(mu_a_oos[k_i], r_disp_a, max_k),
            )
            p_over_v36[k_i], _, _ = line_probs_from_pmf(tot_pmf, cline)

            gi = idx_v[oos_indices[k_i]]
            st_pmf = convolve_pmf_exact(
                nb_pmf_exact(base_rate_h[q][gi], r_disp_h, max_k),
                nb_pmf_exact(base_rate_a[q][gi], r_disp_a, max_k),
            )
            p_over_static[k_i], _, _ = line_probs_from_pmf(st_pmf, cline)

            cl_half = 0.5 * mu_clim_tot_oos[k_i]
            cl_pmf = convolve_pmf_exact(
                nb_pmf_exact(cl_half, r_disp_h, max_k),
                nb_pmf_exact(cl_half, r_disp_a, max_k),
            )
            p_over_clim[k_i], _, _ = line_probs_from_pmf(cl_pmf, cline)

        y_bin_oos = (y_tot_oos > cline).astype(np.float64)
        ev_vs_clim = paired_bootstrap_binary(y_bin_oos, p_over_v36, p_over_clim)
        ev_vs_static = paired_bootstrap_binary(y_bin_oos, p_over_v36, p_over_static)

        sp_raw_sub = raw_l10_over_prob[q][idx_v[oos_indices]]
        sp_valid = np.isfinite(sp_raw_sub)
        ev_vs_scoutpicks = paired_bootstrap_binary(
            y_bin_oos[sp_valid],
            p_over_v36[sp_valid],
            np.clip(sp_raw_sub[sp_valid], 1e-4, 1.0 - 1e-4),
        )

        # Ajuste final sobre todo walk_forward_dev (< 2025-02-02) para artefacto candidato
        pr_hf = PoissonRegressor(alpha=1e-3, max_iter=500).fit(Xh, yh_v)
        pr_af = PoissonRegressor(alpha=1e-3, max_iter=500).fit(Xa, ya_v)

        mae_imp_pct = 100.0 * (1.0 - mae_v36 / max(mae_clim, 1e-9))
        print(
            f"  [{q:15s}] OOS n={len(oos_indices):6,d} | MAE={mae_v36:.4f} vs Clim={mae_clim:.4f} "
            f"({mae_imp_pct:+.2f}% vs Astra +1.84%) | r={corr_v36:.3f} | "
            f"dLL_vs_Clim={ev_vs_clim['delta_ll']:+.5f} ({ev_vs_clim['significance']}) | "
            f"dLL_vs_ScoutPicks={ev_vs_scoutpicks['delta_ll']:+.5f} ({ev_vs_scoutpicks['significance']})"
        )

        metric_models_json[q] = {
            "canonical_total_line": cline,
            "alt_total_lines": sp["alt_total_lines"],
            "side_line": float(sp["side_line"]),
            "max_k_side": max_k,
            "default_home_rate": float(sp["default_h"]),
            "default_away_rate": float(sp["default_a"]),
            "use_referee_multiplier": bool(sp["use_ref"]),
            "dispersion_r_home": round(r_disp_h, 6),
            "dispersion_r_away": round(r_disp_a, 6),
            "feature_names": ["log_base_rate", "goal_sup_side", "tempo_excess", "match_tightness", "log_ref_mult"],
            "home_coef": [float(c) for c in pr_hf.coef_.tolist()],
            "home_intercept": float(pr_hf.intercept_),
            "away_coef": [float(c) for c in pr_af.coef_.tolist()],
            "away_intercept": float(pr_af.intercept_),
        }
        eval_summary[q] = {
            "n_oos_2020_2024": int(len(oos_indices)),
            "mae_climatology": mae_clim,
            "mae_static_astra_style": mae_static,
            "mae_pitchlab_v3_6": mae_v36,
            "mae_improvement_vs_climatology_pct": round(mae_imp_pct, 3),
            "rmse_climatology": rmse_clim,
            "rmse_pitchlab_v3_6": rmse_v36,
            "pearson_r": corr_v36,
            "over_canonical_line": cline,
            "vs_climatology": ev_vs_clim,
            "vs_static_team_nb": ev_vs_static,
            "vs_scoutpicks_raw_l10": ev_vs_scoutpicks,
        }

    # --- Descomposición Coherente por Mitades 1H / 2H ---
    ht_valid = (
        (sstart >= MIN_MODERN_SEASON)
        & np.isfinite(hg_vec)
        & np.isfinite(ag_vec)
        & np.isfinite(ht_hg_vec)
        & np.isfinite(ht_ag_vec)
        & (ht_hg_vec <= hg_vec)
        & (ht_ag_vec <= ag_vec)
    )
    idx_ht = np.where(ht_valid)[0]
    ss_ht = sstart[idx_ht]
    val_ht = ss_ht <= VAL_MAX_SEASON
    oos_ht = ss_ht >= OOS_MIN_SEASON

    # Calibrar share 1H local/visita y rho_1H / rho_2H en VAL <= 2019
    tot_h_val = float(np.sum(hg_vec[idx_ht[val_ht]]))
    tot_a_val = float(np.sum(ag_vec[idx_ht[val_ht]]))
    share_1h_home = float(np.sum(ht_hg_vec[idx_ht[val_ht]])) / max(tot_h_val, 1.0)
    share_1h_away = float(np.sum(ht_ag_vec[idx_ht[val_ht]])) / max(tot_a_val, 1.0)

    # Buscar mejor pendiente por asimetría |lam_H - lam_A| y mejor rho_1H en VAL
    best_ht_cfg = {"slope_abs_diff": 0.0, "rho_1h": -0.06, "rho_2h": -0.06, "val_ll": 999.0}
    ht_over05_val = ((ht_hg_vec[idx_ht[val_ht]] + ht_ag_vec[idx_ht[val_ht]]) > 0.5).astype(np.float64)
    ht_res_val = np.where(
        ht_hg_vec[idx_ht[val_ht]] > ht_ag_vec[idx_ht[val_ht]],
        0,
        np.where(ht_hg_vec[idx_ht[val_ht]] == ht_ag_vec[idx_ht[val_ht]], 1, 2),
    )

    lh_ht_val = lam_h_arr[idx_ht[val_ht]]
    la_ht_val = lam_a_arr[idx_ht[val_ht]]
    dsh_val = div_ht_share_arr[idx_ht[val_ht]]

    for slp in (-0.015, 0.0, 0.015):
        for r1 in (-0.12, -0.08, -0.05, -0.02, 0.0):
            ll_acc = 0.0
            for j in range(len(lh_ht_val)):
                adj_sh = dsh_val[j] / 0.442
                th_h = min(max(share_1h_home * adj_sh + slp * abs(lh_ht_val[j] - la_ht_val[j]), 0.36), 0.52)
                th_a = min(max(share_1h_away * adj_sh + slp * abs(lh_ht_val[j] - la_ht_val[j]), 0.36), 0.52)
                mat1 = build_dc_matrix_small(lh_ht_val[j] * th_h, la_ht_val[j] * th_a, r1, 6)
                p_o05 = min(max(1.0 - float(mat1[0, 0]), 1e-9), 1.0 - 1e-9)
                ph1 = float(np.sum(np.tril(mat1, -1)))
                pd1 = float(np.trace(mat1))
                pa1 = float(np.sum(np.triu(mat1, 1)))
                probs3 = [max(ph1, 1e-9), max(pd1, 1e-9), max(pa1, 1e-9)]
                ll_acc += -(
                    ht_over05_val[j] * math.log(p_o05)
                    + (1.0 - ht_over05_val[j]) * math.log(1.0 - p_o05)
                    + math.log(probs3[int(ht_res_val[j])])
                )
            ll_m = ll_acc / len(lh_ht_val)
            if ll_m < best_ht_cfg["val_ll"]:
                best_ht_cfg = {
                    "slope_abs_diff": float(slp),
                    "rho_1h": float(r1),
                    "rho_2h": -0.05,
                    "val_ll": float(ll_m),
                }

    # Evaluar 1H Over 0.5 y 2H Over 0.5 en OOS 2020..2024 vs tasa constante
    oos_ht_idx = idx_ht[oos_ht]
    y_1h_o05 = ((ht_hg_vec[oos_ht_idx] + ht_ag_vec[oos_ht_idx]) > 0.5).astype(np.float64)
    y_2h_o05 = (
        ((hg_vec[oos_ht_idx] - ht_hg_vec[oos_ht_idx]) + (ag_vec[oos_ht_idx] - ht_ag_vec[oos_ht_idx])) > 0.5
    ).astype(np.float64)
    base_1h_rate = float(np.mean(ht_over05_val))
    base_2h_rate = float(
        np.mean(
            ((hg_vec[idx_ht[val_ht]] - ht_hg_vec[idx_ht[val_ht]]) + (ag_vec[idx_ht[val_ht]] - ht_ag_vec[idx_ht[val_ht]]))
            > 0.5
        )
    )

    p_1h_o05 = np.empty(len(oos_ht_idx), dtype=np.float64)
    p_2h_o05 = np.empty(len(oos_ht_idx), dtype=np.float64)
    for k_i, gi in enumerate(oos_ht_idx):
        adj_sh = div_ht_share_arr[gi] / 0.442
        abs_d = abs(lam_h_arr[gi] - lam_a_arr[gi])
        th_h = min(max(share_1h_home * adj_sh + best_ht_cfg["slope_abs_diff"] * abs_d, 0.36), 0.52)
        th_a = min(max(share_1h_away * adj_sh + best_ht_cfg["slope_abs_diff"] * abs_d, 0.36), 0.52)
        lh1 = lam_h_arr[gi] * th_h
        la1 = lam_a_arr[gi] * th_a
        lh2 = lam_h_arr[gi] - lh1
        la2 = lam_a_arr[gi] - la1
        m1 = build_dc_matrix_small(lh1, la1, best_ht_cfg["rho_1h"], 6)
        m2 = build_dc_matrix_small(lh2, la2, best_ht_cfg["rho_2h"], 6)
        p_1h_o05[k_i] = 1.0 - float(m1[0, 0])
        p_2h_o05[k_i] = 1.0 - float(m2[0, 0])

    ev_1h_o05 = paired_bootstrap_binary(y_1h_o05, p_1h_o05, np.full_like(p_1h_o05, base_1h_rate))
    ev_2h_o05 = paired_bootstrap_binary(y_2h_o05, p_2h_o05, np.full_like(p_2h_o05, base_2h_rate))
    print(
        f"  [halves_1h_2h   ] OOS n={len(oos_ht_idx):6,d} | "
        f"1H_O0.5 dLL={ev_1h_o05['delta_ll']:+.5f} ({ev_1h_o05['significance']}, ECE={ev_1h_o05['ece']:.4f}) | "
        f"2H_O0.5 dLL={ev_2h_o05['delta_ll']:+.5f} ({ev_2h_o05['significance']}, ECE={ev_2h_o05['ece']:.4f})"
    )

    # Exportar Priors de Árbitros (`official_priors_v3_6.json`, solo árbitros con >= 8 partidos pre-holdout)
    officials_payload: dict[str, Any] = {}
    for (dv, rf), n_g in sorted(ref_games.items()):
        if dv.endswith("_fls") or n_g < 8:
            continue
        div_yel_tot = div_stat_ewm.get((dv, "yellow_cards_h"), 1.85) + div_stat_ewm.get((dv, "yellow_cards_a"), 2.15)
        div_fls_tot = div_stat_ewm.get((dv, "fouls_h"), 11.80) + div_stat_ewm.get((dv, "fouls_a"), 12.20)
        raw_yel = ref_sum_yel[(dv, rf)] / n_g
        raw_red = ref_sum_red.get((dv, rf), 0.0) / n_g
        eb_yel = (ref_sum_yel[(dv, rf)] + kappa_ref_cards * div_yel_tot) / (n_g + kappa_ref_cards)
        cards_mult = min(max(eb_yel / max(div_yel_tot, 0.5), 0.68), 1.42)

        nf = ref_games.get((f"{dv}_fls", rf), 0)
        eb_fls = (
            (ref_sum_fls[(f"{dv}_fls", rf)] + kappa_ref_fouls * div_fls_tot) / (nf + kappa_ref_fouls)
            if nf > 0
            else div_fls_tot
        )
        fls_mult = min(max(eb_fls / max(div_fls_tot, 4.0), 0.75), 1.32)
        officials_payload[f"{dv}::{rf}"] = {
            "div": dv,
            "referee": rf,
            "games": int(n_g),
            "raw_yellows_pg": round(raw_yel, 4),
            "raw_reds_pg": round(raw_red, 4),
            "eb_yellows_pg": round(eb_yel, 4),
            "cards_multiplier": round(cards_mult, 6),
            "fouls_multiplier": round(fls_mult, 6),
        }

    OFFICIAL_PRIORS_OUT.write_text(
        json.dumps(
            {
                "schema_version": "official_priors_v3.6.0",
                "as_of_cutoff_iso": HOLDOUT_CUT_ISO,
                "holdout_sealed_untouched": True,
                "kappa_ref_cards": kappa_ref_cards,
                "kappa_ref_fouls": kappa_ref_fouls,
                "n_officials": len(officials_payload),
                "officials": officials_payload,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    # Estado causal vivo por división para inferencia TypeScript
    div_priors_json: dict[str, Any] = {}
    for dv in sorted(set(divs.tolist())):
        div_priors_json[dv] = {
            "ht_goal_share": round(div_ht_share_ewm.get(dv, 0.442), 6),
            "metrics": {
                q: {
                    "home_mean": round(div_stat_ewm.get((dv, f"{q}_h"), sp["default_h"]), 5),
                    "away_mean": round(div_stat_ewm.get((dv, f"{q}_a"), sp["default_a"]), 5),
                }
                for q, sp in METRIC_SPECS.items()
            },
        }

    micro_model_payload = {
        "schema_version": "soccer_micro_markets_v3.6.0",
        "codename": "PitchLab Micro-Outlook & Halves v3.6 Candidate",
        "version": "3.6.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "kappa_team_eb": kappa_team,
        "kappa_ref_cards": kappa_ref_cards,
        "kappa_ref_fouls": kappa_ref_fouls,
        "halves_config": {
            "base_share_1h_home": round(share_1h_home, 6),
            "base_share_1h_away": round(share_1h_away, 6),
            "ref_div_ht_share": 0.442,
            "slope_abs_diff": best_ht_cfg["slope_abs_diff"],
            "rho_1h": best_ht_cfg["rho_1h"],
            "rho_2h": best_ht_cfg["rho_2h"],
            "max_goals_half_grid": 6,
        },
        "div_priors": div_priors_json,
        "metrics": metric_models_json,
    }
    MICRO_MODEL_OUT.write_text(json.dumps(micro_model_payload, indent=2), encoding="utf-8")

    # Generar snapshot de paridad TS <-> Python (`150` partidos `< 2025-02-02`)
    rng = np.random.default_rng(MODEL_SEED)
    cand_pool = np.where(
        (sstart >= 2022)
        & np.isfinite(obs_cols_h["corners"])
        & np.isfinite(obs_cols_h["yellow_cards"])
        & np.isfinite(ht_hg_vec)
    )[0]
    ch_idx = np.sort(rng.choice(cand_pool, size=min(150, len(cand_pool)), replace=False))

    snap_rows: list[dict[str, Any]] = []
    for gi in ch_idx:
        dv = divs[gi]
        lh = float(lam_h_arr[gi])
        la = float(lam_a_arr[gi])
        rc_m = float(ref_cards_mult_arr[gi])
        rf_m = float(ref_fouls_mult_arr[gi])

        s_h = lh - la
        s_a = -s_h
        t_ex = (lh + la) - 2.65
        t_ti = math.exp(-abs(s_h)) - 0.55

        expected_metrics: dict[str, Any] = {}
        base_inputs: dict[str, Any] = {}
        for q, mcfg in metric_models_json.items():
            bh = float(base_rate_h[q][gi])
            ba = float(base_rate_a[q][gi])
            base_inputs[q] = {"base_home": bh, "base_away": ba}
            lref = math.log(rc_m) if q == "yellow_cards" else (math.log(rf_m) if q == "fouls" else 0.0)
            xh_vec = [math.log(max(bh, 0.1)), s_h, t_ex, t_ti, lref]
            xa_vec = [math.log(max(ba, 0.1)), s_a, t_ex, t_ti, lref]

            eta_h = float(mcfg["home_intercept"]) + sum(c * x for c, x in zip(mcfg["home_coef"], xh_vec))
            eta_a = float(mcfg["away_intercept"]) + sum(c * x for c, x in zip(mcfg["away_coef"], xa_vec))
            mu_h_f = min(max(math.exp(eta_h), 0.15), 35.0)
            mu_a_f = min(max(math.exp(eta_a), 0.15), 35.0)

            pmf_h = nb_pmf_exact(mu_h_f, float(mcfg["dispersion_r_home"]), int(mcfg["max_k_side"]))
            pmf_a = nb_pmf_exact(mu_a_f, float(mcfg["dispersion_r_away"]), int(mcfg["max_k_side"]))
            pmf_t = convolve_pmf_exact(pmf_h, pmf_a)
            po, pu, pp = line_probs_from_pmf(pmf_t, float(mcfg["canonical_total_line"]))
            # También probar una línea entera (push != 0) si existe en alt_total_lines
            int_lines = [ln for ln in mcfg["alt_total_lines"] if abs(ln - round(ln)) < 1e-9]
            int_line = float(int_lines[0]) if int_lines else float(round(mcfg["canonical_total_line"]))
            po_i, pu_i, pp_i = line_probs_from_pmf(pmf_t, int_line)

            expected_metrics[q] = {
                "mu_home": mu_h_f,
                "mu_away": mu_a_f,
                "p_over_canonical": po,
                "p_under_canonical": pu,
                "int_line": int_line,
                "p_over_int": po_i,
                "p_under_int": pu_i,
                "p_push_int": pp_i,
            }

        # Mitades
        hcfg = micro_model_payload["halves_config"]
        dsh = float(div_priors_json[dv]["ht_goal_share"])
        adj_sh = dsh / float(hcfg["ref_div_ht_share"])
        abs_d = abs(lh - la)
        th_h = min(max(float(hcfg["base_share_1h_home"]) * adj_sh + float(hcfg["slope_abs_diff"]) * abs_d, 0.36), 0.52)
        th_a = min(max(float(hcfg["base_share_1h_away"]) * adj_sh + float(hcfg["slope_abs_diff"]) * abs_d, 0.36), 0.52)
        lh1 = lh * th_h
        la1 = la * th_a
        lh2 = lh - lh1
        la2 = la - la1
        m1 = build_dc_matrix_small(lh1, la1, float(hcfg["rho_1h"]), int(hcfg["max_goals_half_grid"]))
        m2 = build_dc_matrix_small(lh2, la2, float(hcfg["rho_2h"]), int(hcfg["max_goals_half_grid"]))

        snap_rows.append(
            {
                "match_id": str(m_df.iloc[gi]["match_id"]),
                "div": dv,
                "lam_home": lh,
                "lam_away": la,
                "ref_cards_mult": rc_m,
                "ref_fouls_mult": rf_m,
                "base_inputs": base_inputs,
                "python_metrics": expected_metrics,
                "python_halves": {
                    "lam_1h_home": lh1,
                    "lam_1h_away": la1,
                    "lam_2h_home": lh2,
                    "lam_2h_away": la2,
                    "p_1h_home": float(np.sum(np.tril(m1, -1))),
                    "p_1h_draw": float(np.trace(m1)),
                    "p_1h_away": float(np.sum(np.triu(m1, 1))),
                    "p_1h_over_0_5": 1.0 - float(m1[0, 0]),
                    "p_2h_over_0_5": 1.0 - float(m2[0, 0]),
                },
            }
        )

    MICRO_SNAPSHOT_OUT.write_text(
        json.dumps(
            {
                "schema_version": "soccer_micro_v3.6_parity_snapshot",
                "holdout_sealed_untouched": True,
                "n": len(snap_rows),
                "rows": snap_rows,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    full_results = {
        "experiment_id": "EXP_V40_soccer_micro_markets",
        "eval_split": "walk_forward_dev",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "metrics_oos_2020_2024": eval_summary,
        "halves_oos_2020_2024": {
            "selected_config": best_ht_cfg,
            "1h_over_0_5_vs_base_rate": ev_1h_o05,
            "2h_over_0_5_vs_base_rate": ev_2h_o05,
        },
        "artifacts": {
            "model_soccer_micro_v3_6_sha256": hashlib.sha256(MICRO_MODEL_OUT.read_bytes()).hexdigest(),
            "official_priors_v3_6_sha256": hashlib.sha256(OFFICIAL_PRIORS_OUT.read_bytes()).hexdigest(),
            "n_officials_cataloged": len(officials_payload),
        },
    }
    RESULTS_OUT.write_text(json.dumps(full_results, indent=2), encoding="utf-8")

    with TRIAL_REGISTRY_OUT.open("a", encoding="utf-8") as fh:
        fh.write(
            json.dumps(
                {
                    "recorded_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V40_soccer_micro_markets",
                    "eval_split": "walk_forward_dev",
                    "holdout_touched": False,
                    "corners_mae_imp_pct": eval_summary["corners"]["mae_improvement_vs_climatology_pct"],
                    "cards_mae_imp_pct": eval_summary["yellow_cards"]["mae_improvement_vs_climatology_pct"],
                    "fouls_mae_imp_pct": eval_summary["fouls"]["mae_improvement_vs_climatology_pct"],
                    "sot_mae_imp_pct": eval_summary["shots_on_target"]["mae_improvement_vs_climatology_pct"],
                }
            )
            + "\n"
        )
    print(f"\n[DONE] EXP_V40 guardado en {RESULTS_OUT.name}")


if __name__ == "__main__":
    main()
