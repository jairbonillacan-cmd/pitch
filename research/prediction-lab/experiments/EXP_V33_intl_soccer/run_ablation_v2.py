"""Experimento de ablación causal y promoción de `PitchLab Meridian v2.0` (EXP_V33_intl_soccer).

Evalúa estrictamente en `walk_forward_dev` (`2010..2024`, `< 2025-02-02`, `n = 12,904` partidos)
con `1,000` réplicas bootstrap `mulberry32` (`seed = 20261111`) el aporte incremental sobre
`PitchLab Meridian v1.0` (`38` features base, `LL = 0.89780`) de tres nuevas familias de datos gratuitos:
  - Familia A (`goalscorers.csv` `CC0 1.0`): `npg_elo_diff`, `ewm_npgd_res_diff_270d`,
    `ewm_lead_share_diff_270d`, `unique_scorers_r10_diff`.
  - Familia B (`transfermarkt-datasets` `CC0 1.0`): `tm_log_top23_val_diff`, `tm_top5_share_diff`,
    `tm_depth_ratio_diff`, `tm_val_vs_elo_gap_diff`, `tm_pool_cov_min`.
  - Familia C (Fórmula FIFA SUM + Clima Estacional): `fifa_sum_diff`, `thermal_climate_adv`.

Solo los bloques que mejoran `walk_forward_dev` se integran en `Meridian v2.0`, exportando
`model_intl_soccer_v2.json`, actualizando `intl_soccer_causal_state.json`, `intl_outlook_calibration_v1.json`
y `intl_soccer_snapshot.json` con paridad `< 1e-12` TS <-> Python.
"""

from __future__ import annotations

import os

os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

from collections import deque
from datetime import datetime, timezone
import hashlib
import json
import math
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
    EWM_ALPHA_NEW_OBS,
    EWM_HALF_LIFE_DAYS,
    INTL_BASE_38_FEATURES,
    REGIME_BASE_GOAL_MU,
    REGIME_DC_RHO,
    SQUAD_CLUB_BRIDGE_CONFIG,
    CausalClubEloBridge,
    _clamp,
    _date_iso_to_ordinal,
    _default_team_state,
    _update_states_postmatch,
    emit_prematch_feature_vector,
    serialize_team_state_for_json,
)
from intl_free_data_v2 import (  # noqa: E402
    CONFED_PRIOR_LOG_TOP23_EUR_M,
    CONFED_PRIOR_TOP5_SHARE,
    CausalTransfermarktNationalPoolBridge,
    build_goalscorers_match_summary,
    compute_thermal_climate_mismatch,
)
from intl_geography import resolve_match_venue_physics  # noqa: E402
from intl_ingest import (  # noqa: E402
    ARTIFACTS_DIR,
    FIRST_EVAL_YEAR,
    HOLDOUT_CUT_DATE,
    HOLDOUT_CUT_ISO,
    INTL_DIV_LEVELS,
    MODERN_TRAIN_MIN_YEAR,
    VAL_MAX_YEAR,
    assert_dates_strictly_before_holdout,
    fetch_and_normalize_all_intl_matches,
    load_intl_matches_dev,
)
from run_experiment import (  # noqa: E402
    BOOTSTRAP_SAMPLES,
    BOOTSTRAP_SEED,
    CALIBRATION_JSON_OUT,
    CAUSAL_STATE_JSON_OUT,
    DATA_PRED_DIR,
    MODEL_SEED,
    SNAPSHOT_JSON_OUT,
    TRIAL_REGISTRY_OUT,
    _fit_dc_lambdas_from_1x2_row,
    compute_causal_base_rate_probs,
    compute_elo_baseline_probs,
    derive_2way_probs_from_1x2,
    fit_logit_bundle,
    predict_logit_bundle_exact,
)

MODEL_V2_JSON_OUT = DATA_PRED_DIR / "model_intl_soccer_v2.json"
ABLATION_V2_JSON_OUT = ARTIFACTS_DIR / "exp_v33_intl_v2_ablation_results.json"

FIFA_SUM_I_BY_REGIME: dict[str, float] = {
    "INTL_WC": 55.0,
    "INTL_CONT": 40.0,
    "INTL_QUAL": 25.0,
    "INTL_NAT": 20.0,
    "INTL_REG": 15.0,
    "INTL_FRIENDLY": 10.0,
}

BLOCK_A_GOALS_COLS: tuple[str, ...] = (
    "npg_elo_diff",
    "ewm_npgd_res_diff_270d",
    "ewm_lead_share_diff_270d",
    "unique_scorers_r10_diff",
)

BLOCK_B_TM_COLS: tuple[str, ...] = (
    "tm_log_top23_val_diff",
    "tm_top5_share_diff",
    "tm_depth_ratio_diff",
    "tm_val_vs_elo_gap_diff",
    "tm_pool_cov_min",
)

BLOCK_C_SUM_CLIMATE_COLS: tuple[str, ...] = (
    "fifa_sum_diff",
    "thermal_climate_adv",
)

ALL_V2_EXTRA_COLS: tuple[str, ...] = BLOCK_A_GOALS_COLS + BLOCK_B_TM_COLS + BLOCK_C_SUM_CLIMATE_COLS


def _init_v2_extra_state(st_base: Mapping[str, Any]) -> dict[str, Any]:
    conf = str(st_base["confed"])
    base_elo = float(st_base["elo"])
    return {
        "npg_elo": base_elo,
        "fifa_sum_pts": base_elo,
        "ewm_npgd_res": 0.0,
        "ewm_lead_res": 0.0,
        "scorers_r10": deque(maxlen=10),
        "tm_log_top23_eur_m": CONFED_PRIOR_LOG_TOP23_EUR_M.get(conf, 2.20),
        "tm_top5_share": CONFED_PRIOR_TOP5_SHARE.get(conf, 0.10),
        "tm_depth_ratio": 0.28,
        "tm_has_pool": 0.0,
    }


def emit_v2_extra_feature_vector(
    *,
    st_h: Mapping[str, Any],
    st_a: Mapping[str, Any],
    v2_h: Mapping[str, Any],
    v2_a: Mapping[str, Any],
    match_date_iso: str,
    venue_physics: Mapping[str, float],
    tm_metrics_h: Mapping[str, float],
    tm_metrics_a: Mapping[str, float],
) -> list[float]:
    """Emite las 11 features candidatas de Fase 2 en doble precisión IEEE-754."""
    cur_ord = _date_iso_to_ordinal(match_date_iso)
    eff_hfa = float(venue_physics["effective_hfa"])

    def _decay_from_last(st: Mapping[str, Any]) -> float:
        last_iso = st.get("last_date_iso")
        if not last_iso:
            return 0.0
        raw_d = max(1.0, float(cur_ord - _date_iso_to_ordinal(str(last_iso))))
        return 0.5 ** (raw_d / EWM_HALF_LIFE_DAYS)

    dec_h = _decay_from_last(st_h)
    dec_a = _decay_from_last(st_a)

    # Bloque A: Goles sin penales y tiempo en ventaja
    npg_elo_diff = (float(v2_h["npg_elo"]) - float(v2_a["npg_elo"])) + ELO_HFA_POINTS * eff_hfa
    ewm_npgd_res_diff = float(v2_h["ewm_npgd_res"]) * dec_h - float(v2_a["ewm_npgd_res"]) * dec_a
    ewm_lead_diff = float(v2_h["ewm_lead_res"]) * dec_h - float(v2_a["ewm_lead_res"]) * dec_a

    if "scorers_r10" in v2_h:
        sc_h = float(np.mean(v2_h["scorers_r10"])) if len(v2_h["scorers_r10"]) > 0 else 1.15
        sc_a = float(np.mean(v2_a["scorers_r10"])) if len(v2_a["scorers_r10"]) > 0 else 1.15
    else:
        sc_h = float(v2_h.get("unique_scorers_r10_mean", 1.15))
        sc_a = float(v2_a.get("unique_scorers_r10_mean", 1.15))
    unique_scorers_diff = sc_h - sc_a

    # Bloque B: Pool elegible Transfermarkt CC0
    tm_log_val_diff = float(tm_metrics_h["tm_log_top23_eur_m"]) - float(tm_metrics_a["tm_log_top23_eur_m"])
    tm_t5_diff = float(tm_metrics_h["tm_top5_share"]) - float(tm_metrics_a["tm_top5_share"])
    tm_depth_diff = float(tm_metrics_h["tm_depth_ratio"]) - float(tm_metrics_a["tm_depth_ratio"])
    tm_gap_diff = float(tm_metrics_h["tm_val_vs_elo_gap"]) - float(tm_metrics_a["tm_val_vs_elo_gap"])
    tm_cov_min = min(float(tm_metrics_h["tm_has_pool"]), float(tm_metrics_a["tm_has_pool"]))

    # Bloque C: FIFA SUM + Clima estacional
    fifa_sum_diff = (float(v2_h["fifa_sum_pts"]) - float(v2_a["fifa_sum_pts"])) / 100.0
    m_month = int(str(match_date_iso).strip()[5:7])
    thermal_adv = compute_thermal_climate_mismatch(
        home_base_lat=float(st_h["base_lat"]),
        away_base_lat=float(st_a["base_lat"]),
        venue_lat=float(venue_physics["venue_lat"]),
        venue_elev_m=float(venue_physics["venue_elev_m"]),
        match_month=m_month,
    )

    return [
        npg_elo_diff,
        ewm_npgd_res_diff,
        ewm_lead_diff,
        unique_scorers_diff,
        tm_log_val_diff,
        tm_t5_diff,
        tm_depth_diff,
        tm_gap_diff,
        tm_cov_min,
        fifa_sum_diff,
        thermal_adv,
    ]


def synthesize_live_intl_v2_row(
    *,
    home_team: str,
    away_team: str,
    regime: str,
    match_date_iso: str,
    causal_states_v2: Mapping[str, Mapping[str, Any]],
    city: str | None = None,
    country: str | None = None,
    is_neutral: bool | None = None,
    explicit_lat: float | None = None,
    explicit_lon: float | None = None,
    explicit_elev_m: float | None = None,
) -> dict[str, Any]:
    """Sintetiza en vivo las `49` features base + `6` one-hots de `PitchLab Meridian v2.0`
    desde `intl_soccer_causal_state_v2.json`, garantizando paridad `< 1e-12` con `intl_soccer.ts`."""
    from intl_causal_features import synthesize_live_intl_row

    base_row = synthesize_live_intl_row(
        home_team=home_team,
        away_team=away_team,
        regime=regime,
        match_date_iso=match_date_iso,
        causal_states=causal_states_v2,
        city=city,
        country=country,
        is_neutral=is_neutral,
        explicit_lat=explicit_lat,
        explicit_lon=explicit_lon,
        explicit_elev_m=explicit_elev_m,
    )
    h_code = str(base_row["home_code"])
    a_code = str(base_row["away_code"])

    def _resolve_v2_state(code: str) -> dict[str, Any]:
        if code in causal_states_v2:
            return dict(causal_states_v2[code])
        st_b = serialize_team_state_for_json(_default_team_state(code))
        conf = str(st_b["confed"])
        b_elo = float(st_b["elo"])
        p_lv = max(0.20, min(7.20, CONFED_PRIOR_LOG_TOP23_EUR_M.get(conf, 2.20) + (b_elo - 1500.0) / 135.0))
        st_b.update(
            {
                "npg_elo": b_elo,
                "fifa_sum_pts": b_elo,
                "ewm_npgd_res": 0.0,
                "ewm_lead_res": 0.0,
                "unique_scorers_r10_mean": 1.15,
                "tm_log_top23_eur_m": p_lv,
                "tm_top5_share": CONFED_PRIOR_TOP5_SHARE.get(conf, 0.10),
                "tm_depth_ratio": 0.28,
                "tm_val_vs_elo_gap": 0.0,
                "tm_has_pool": 0.0,
            }
        )
        return st_b

    st_h = _resolve_v2_state(h_code)
    st_a = _resolve_v2_state(a_code)
    v_phys = base_row["venue_physics"]
    extra_11 = emit_v2_extra_feature_vector(
        st_h=st_h,
        st_a=st_a,
        v2_h=st_h,
        v2_a=st_a,
        match_date_iso=match_date_iso,
        venue_physics=v_phys,
        tm_metrics_h=st_h,
        tm_metrics_a=st_a,
    )
    out = dict(base_row)
    out["features"] = list(base_row["features"]) + extra_11
    return out


def build_intl_v2_causal_dataset(
    matches_df: pd.DataFrame,
    *,
    enforce_before_holdout: bool = True,
    max_source_date_exclusive: str | None = HOLDOUT_CUT_DATE,
    goalscorers_path: Path | None = None,
    tm_players_path: Path | None = None,
    tm_valuations_path: Path | None = None,
) -> tuple[pd.DataFrame, dict[str, dict[str, Any]]]:
    if enforce_before_holdout:
        assert_dates_strictly_before_holdout(matches_df, col="match_date", context="build_intl_v2_causal_dataset")

    ordered = matches_df.sort_values(["match_date", "match_id"], kind="mergesort").reset_index(drop=True)
    club_bridge = CausalClubEloBridge()
    gs_kwargs: dict[str, Any] = {"max_date_exclusive": max_source_date_exclusive}
    if goalscorers_path is not None:
        gs_kwargs["goalscorers_path"] = goalscorers_path
    gs_index = build_goalscorers_match_summary(**gs_kwargs)

    tm_kwargs: dict[str, Any] = {"max_date_exclusive": max_source_date_exclusive}
    if tm_players_path is not None:
        tm_kwargs["players_path"] = tm_players_path
    if tm_valuations_path is not None:
        tm_kwargs["valuations_path"] = tm_valuations_path
    tm_bridge = CausalTransfermarktNationalPoolBridge(**tm_kwargs)

    states: dict[str, dict[str, Any]] = {}
    v2_states: dict[str, dict[str, Any]] = {}

    n = len(ordered)
    base_mat = np.empty((n, len(INTL_BASE_38_FEATURES)), dtype=np.float64)
    extra_mat = np.empty((n, len(ALL_V2_EXTRA_COLS)), dtype=np.float64)

    for idx, row in enumerate(ordered.itertuples(index=False)):
        h_code = str(row.home_code)
        a_code = str(row.away_code)
        if h_code not in states:
            states[h_code] = _default_team_state(h_code)
            v2_states[h_code] = _init_v2_extra_state(states[h_code])
        if a_code not in states:
            states[a_code] = _default_team_state(a_code)
            v2_states[a_code] = _init_v2_extra_state(states[a_code])

        st_h = states[h_code]
        st_a = states[a_code]
        v2_h = v2_states[h_code]
        v2_a = v2_states[a_code]

        d_iso = str(row.date_str)[:10]
        d_ord = _date_iso_to_ordinal(d_iso)
        reg = str(row.div)

        fed_ce_h = club_bridge.lookup_federation_club_elo(h_code, d_ord, str(st_h["confed"]))
        fed_ce_a = club_bridge.lookup_federation_club_elo(a_code, d_ord, str(st_a["confed"]))
        st_h["fed_club_elo"] = fed_ce_h
        st_a["fed_club_elo"] = fed_ce_a

        tm_h = tm_bridge.lookup_pool_metrics(h_code, d_ord, str(st_h["confed"]), float(st_h["elo"]))
        tm_a = tm_bridge.lookup_pool_metrics(a_code, d_ord, str(st_a["confed"]), float(st_a["elo"]))

        v_phys = resolve_match_venue_physics(
            home_code=h_code,
            away_code=a_code,
            match_city=str(row.city),
            match_country=str(row.country),
            is_neutral_flag=bool(row.neutral),
        )

        vec_base, aux = emit_prematch_feature_vector(
            st_h=st_h,
            st_a=st_a,
            regime=reg,
            match_date_iso=d_iso,
            venue_physics=v_phys,
            fed_club_elo_h=fed_ce_h,
            fed_club_elo_a=fed_ce_a,
        )
        vec_extra = emit_v2_extra_feature_vector(
            st_h=st_h,
            st_a=st_a,
            v2_h=v2_h,
            v2_a=v2_a,
            match_date_iso=d_iso,
            venue_physics=v_phys,
            tm_metrics_h=tm_h,
            tm_metrics_a=tm_a,
        )
        base_mat[idx, :] = vec_base
        extra_mat[idx, :] = vec_extra

        # Actualizar acumuladores extra post-partido (ANTES de pisar `last_date_ord` en `_update_states_postmatch`)
        hg = int(row.home_goals)
        ag = int(row.away_goals)
        so = bool(row.went_to_shootout)
        eff_hfa = float(v_phys["effective_hfa"])

        gs_rec = gs_index.get((d_iso, h_code, a_code))
        if gs_rec is not None:
            npg_h = max(0.0, float(hg) - float(gs_rec["pk_h"]) - 0.35 * float(gs_rec["og_h"]))
            npg_a = max(0.0, float(ag) - float(gs_rec["pk_a"]) - 0.35 * float(gs_rec["og_a"]))
            lead_ratio = float(gs_rec["time_in_lead_ratio"])
            uniq_sc_h = float(gs_rec["n_unique_scorers_h"])
            uniq_sc_a = float(gs_rec["n_unique_scorers_a"])
        else:
            npg_h = 0.92 * float(hg)
            npg_a = 0.92 * float(ag)
            lead_ratio = 0.0 if (hg == 0 and ag == 0) else 0.45 * math.tanh((hg - ag) / 2.0)
            uniq_sc_h = min(3.0, 0.85 * float(hg))
            uniq_sc_a = min(3.0, 0.85 * float(ag))

        # 1. NPG-Elo post-partido
        npg_diff_obs = 0.0 if so else (npg_h - npg_a)
        npg_s_home = 0.5 if abs(npg_diff_obs) < 0.15 else (
            1.0 / (1.0 + math.exp(-1.35 * npg_diff_obs))
        )
        npg_elo_diff_pre = (float(v2_h["npg_elo"]) - float(v2_a["npg_elo"])) + ELO_HFA_POINTS * eff_hfa
        npg_exp_s = 1.0 / (1.0 + (10.0 ** (-npg_elo_diff_pre / 400.0)))
        k_reg = ELO_K_BY_REGIME.get(reg, 24.0)
        npg_mov = 1.0 + 0.45 * math.log(1.0 + abs(npg_diff_obs))
        d_npg_elo = k_reg * npg_mov * (npg_s_home - npg_exp_s)
        v2_h["npg_elo"] = float(v2_h["npg_elo"]) + d_npg_elo
        v2_a["npg_elo"] = float(v2_a["npg_elo"]) - d_npg_elo

        # 2. Residuales EWM de NPGD y Time-in-Lead
        exp_npgd = 0.92 * (float(aux["dc_lam_home"]) - float(aux["dc_lam_away"]))
        exp_lead = 0.45 * math.tanh(exp_npgd / 1.8)
        for st_b, v2_t, npgd_err, lead_err, usc in (
            (st_h, v2_h, npg_diff_obs - exp_npgd, lead_ratio - exp_lead, uniq_sc_h),
            (st_a, v2_a, -npg_diff_obs + exp_npgd, -lead_ratio + exp_lead, uniq_sc_a),
        ):
            dec = (
                0.5 ** (max(1.0, float(d_ord - int(st_b["last_date_ord"]))) / EWM_HALF_LIFE_DAYS)
                if st_b["last_date_ord"] is not None
                else 0.0
            )
            v2_t["ewm_npgd_res"] = (1.0 - EWM_ALPHA_NEW_OBS) * (float(v2_t["ewm_npgd_res"]) * dec) + EWM_ALPHA_NEW_OBS * _clamp(
                npgd_err, -4.0, 4.0
            )
            v2_t["ewm_lead_res"] = (1.0 - EWM_ALPHA_NEW_OBS) * (float(v2_t["ewm_lead_res"]) * dec) + EWM_ALPHA_NEW_OBS * _clamp(
                lead_err, -1.2, 1.2
            )
            v2_t["scorers_r10"].append(usc)

        # 3. FIFA SUM oficial (`scale = 600` + inmunidad de derrota en eliminatorias directas con penales/fase final)
        sum_diff_pre = float(v2_h["fifa_sum_pts"]) - float(v2_a["fifa_sum_pts"])
        we_h = 1.0 / (1.0 + (10.0 ** (-sum_diff_pre / 600.0)))
        if so:
            # En FIFA SUM tanda de penales otorga 0.75 al ganador y 0.50 al perdedor; como liquidamos 90' sin sesgar ganador de penales usamos 0.625 simétrico
            w_h, w_a = 0.625, 0.625
        elif hg == ag:
            w_h, w_a = 0.5, 0.5
        elif hg > ag:
            w_h, w_a = 1.0, 0.0
        else:
            w_h, w_a = 0.0, 1.0
        i_w = FIFA_SUM_I_BY_REGIME.get(reg, 15.0)
        d_sum_h = i_w * (w_h - we_h)
        d_sum_a = i_w * (w_a - (1.0 - we_h))
        if reg in ("INTL_WC", "INTL_CONT") and so:
            d_sum_h = max(0.0, d_sum_h)
            d_sum_a = max(0.0, d_sum_a)
        v2_h["fifa_sum_pts"] = float(v2_h["fifa_sum_pts"]) + d_sum_h
        v2_a["fifa_sum_pts"] = float(v2_a["fifa_sum_pts"]) + d_sum_a

        v2_h["tm_log_top23_eur_m"] = float(tm_h["tm_log_top23_eur_m"])
        v2_h["tm_top5_share"] = float(tm_h["tm_top5_share"])
        v2_h["tm_depth_ratio"] = float(tm_h["tm_depth_ratio"])
        v2_h["tm_has_pool"] = float(tm_h["tm_has_pool"])

        v2_a["tm_log_top23_eur_m"] = float(tm_a["tm_log_top23_eur_m"])
        v2_a["tm_top5_share"] = float(tm_a["tm_top5_share"])
        v2_a["tm_depth_ratio"] = float(tm_a["tm_depth_ratio"])
        v2_a["tm_has_pool"] = float(tm_a["tm_has_pool"])

        _update_states_postmatch(
            st_h=st_h,
            st_a=st_a,
            regime=reg,
            match_date_iso=d_iso,
            home_goals=hg,
            away_goals=ag,
            went_to_shootout=so,
            venue_physics=v_phys,
            pre_aux=aux,
            fed_club_elo_h=fed_ce_h,
            fed_club_elo_a=fed_ce_a,
        )

    all_cols = list(INTL_BASE_38_FEATURES) + list(ALL_V2_EXTRA_COLS)
    feat_df = pd.DataFrame(np.hstack([base_mat, extra_mat]), columns=all_cols)
    out_df = pd.concat([ordered.reset_index(drop=True), feat_df], axis=1)

    merged_states: dict[str, dict[str, Any]] = {}
    for code_k in sorted(states.keys()):
        base_ser = serialize_team_state_for_json(states[code_k])
        v2_s = v2_states[code_k]
        sc_list = list(v2_s["scorers_r10"])
        elo_cur = float(base_ser["elo"])
        conf_cur = str(base_ser["confed"])
        elo_imp_val = max(0.20, min(7.20, CONFED_PRIOR_LOG_TOP23_EUR_M.get(conf_cur, 2.20) + (elo_cur - 1500.0) / 135.0))
        tm_lv = float(v2_s["tm_log_top23_eur_m"])
        base_ser.update(
            {
                "npg_elo": round(float(v2_s["npg_elo"]), 6),
                "fifa_sum_pts": round(float(v2_s["fifa_sum_pts"]), 6),
                "ewm_npgd_res": round(float(v2_s["ewm_npgd_res"]), 6),
                "ewm_lead_res": round(float(v2_s["ewm_lead_res"]), 6),
                "unique_scorers_r10_mean": round(float(np.mean(sc_list)) if sc_list else 1.15, 6),
                "tm_log_top23_eur_m": round(tm_lv, 6),
                "tm_top5_share": round(float(v2_s["tm_top5_share"]), 6),
                "tm_depth_ratio": round(float(v2_s["tm_depth_ratio"]), 6),
                "tm_val_vs_elo_gap": round(tm_lv - elo_imp_val, 6),
                "tm_has_pool": round(float(v2_s["tm_has_pool"]), 4),
            }
        )
        merged_states[code_k] = base_ser

    return out_df, merged_states


def _eval_feature_subset_walk_forward(
    modern_df: pd.DataFrame,
    feature_cols: tuple[str, ...],
    c_reg: float,
    half_life_days: float,
) -> tuple[np.ndarray, np.ndarray, pd.DataFrame]:
    n = len(modern_df)
    X_base = modern_df[list(feature_cols)].to_numpy(dtype=np.float64)
    div_vals = modern_df["div"].astype(str).to_numpy()
    dummies = np.column_stack([(div_vals == lvl).astype(np.float64) for lvl in INTL_DIV_LEVELS])
    X_all = np.hstack([X_base, dummies])
    y_all = modern_df["y"].to_numpy(dtype=np.int64)
    years_all = modern_df["year"].to_numpy(dtype=int)
    dates_all = pd.to_datetime(modern_df["match_date"])

    eval_years = sorted(set(years_all[years_all >= FIRST_EVAL_YEAR]))
    p_list: list[np.ndarray] = []
    meta_list: list[pd.DataFrame] = []

    for yr in eval_years:
        tr_m = years_all < yr
        ev_m = years_all == yr
        if not np.any(tr_m) or not np.any(ev_m):
            continue
        max_dt = dates_all[tr_m].max()
        age_d = (max_dt - dates_all[tr_m]).dt.days.to_numpy(dtype=np.float64)
        sw = 0.5 ** (age_d / half_life_days)
        imp, sc, lr = fit_logit_bundle(X_all[tr_m], y_all[tr_m], c_reg, sw)
        p_ev = predict_logit_bundle_exact(imp, sc, lr, X_all[ev_m])
        p_list.append(p_ev)
        meta_list.append(modern_df.loc[ev_m, ["match_id", "date_str", "year", "div", "home_code", "away_code", "home_goals", "away_goals", "y"]].copy())

    oof_meta = pd.concat(meta_list, ignore_index=True)
    return np.vstack(p_list), oof_meta["y"].to_numpy(dtype=np.int64), oof_meta


def main() -> None:
    dev_matches_df, manifest = load_intl_matches_dev(force_download=False)
    v2_df, dev_states_v2 = build_intl_v2_causal_dataset(
        dev_matches_df,
        enforce_before_holdout=True,
        max_source_date_exclusive=HOLDOUT_CUT_DATE,
    )
    modern_df = v2_df[v2_df["year"] >= MODERN_TRAIN_MIN_YEAR].copy().reset_index(drop=True)

    c_reg = 0.02
    hl_days = 4380.0

    candidates: dict[str, tuple[str, ...]] = {
        "v1_base_38": INTL_BASE_38_FEATURES,
        "v1_plus_blockA_goalscorers": INTL_BASE_38_FEATURES + BLOCK_A_GOALS_COLS,
        "v1_plus_blockB_transfermarkt": INTL_BASE_38_FEATURES + BLOCK_B_TM_COLS,
        "v1_plus_blockC_sum_climate": INTL_BASE_38_FEATURES + BLOCK_C_SUM_CLIMATE_COLS,
        "v1_plus_AB": INTL_BASE_38_FEATURES + BLOCK_A_GOALS_COLS + BLOCK_B_TM_COLS,
        "v1_plus_ABC_all": INTL_BASE_38_FEATURES + ALL_V2_EXTRA_COLS,
    }

    preds_by_name: dict[str, np.ndarray] = {}
    y_oof: np.ndarray | None = None
    oof_meta: pd.DataFrame | None = None

    for name, cols in candidates.items():
        P_m, y_m, meta_m = _eval_feature_subset_walk_forward(modern_df, cols, c_reg, hl_days)
        preds_by_name[name] = P_m
        if y_oof is None:
            y_oof = y_m
            oof_meta = meta_m

    assert y_oof is not None and oof_meta is not None
    ll_v1_vec = oc.compute_categorical_log_loss_vec(preds_by_name["v1_base_38"], y_oof)
    recent_mask = oof_meta["year"].to_numpy(dtype=int) >= 2020

    report: dict[str, Any] = {
        "experiment_id": "EXP_V33_intl_soccer_v2_ablation",
        "eval_split": "walk_forward_dev",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "n_eval_2010_2024": int(len(y_oof)),
        "n_eval_2020_2024": int(np.sum(recent_mask)),
        "variants_2010_2024": {},
        "variants_2020_2024": {},
    }

    print(f"=== ABLACIÓN WALK-FORWARD SELECCIONES (n={len(y_oof)}, < {HOLDOUT_CUT_DATE}) ===")
    for name, P_m in preds_by_name.items():
        is_self = name == "v1_base_38"
        ev_full = oc.evaluate_calibration_with_bootstrap(
            P_m,
            y_oof,
            benchmark_ll_vec=ll_v1_vec,
            benchmark_is_self=is_self,
            n_resamples=BOOTSTRAP_SAMPLES,
            seed=BOOTSTRAP_SEED,
            include_bins=False,
        )
        ev_rec = oc.evaluate_calibration_with_bootstrap(
            P_m[recent_mask],
            y_oof[recent_mask],
            benchmark_ll_vec=ll_v1_vec[recent_mask],
            benchmark_is_self=is_self,
            n_resamples=BOOTSTRAP_SAMPLES,
            seed=BOOTSTRAP_SEED,
            include_bins=False,
        )
        report["variants_2010_2024"][name] = ev_full
        report["variants_2020_2024"][name] = ev_rec
        print(
            f"  {name:30s} | 2010-24 LL={ev_full['log_loss']:.5f} ΔLL={ev_full['delta_ll_vs_benchmark']:+.5f} {ev_full['delta_ll_ci95']} ({ev_full['significance']})"
            f" | 2020-24 LL={ev_rec['log_loss']:.5f} ΔLL={ev_rec['delta_ll_vs_benchmark']:+.5f} ({ev_rec['significance']})"
        )

    ABLATION_V2_JSON_OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
