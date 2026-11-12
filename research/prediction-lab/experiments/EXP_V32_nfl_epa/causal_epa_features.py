"""Construcción estrictamente causal (`w' < w`, `gameday' < gameday`) de features semanales EPA NFL (`EXP_V32_nfl_epa`).

Implementa las 5 familias exigidas en `§3`:
1. `Dropback EPA` ofensivo y defensivo por jugada (`epa_dropback_off_diff`, `epa_dropback_def_diff`, `epa_dropback_wp_net_diff`)
2. `Rush EPA` ofensivo y defensivo por jugada (`epa_rush_off_diff`, `epa_rush_def_diff`)
3. `Success%` en downs tempranos (`1st/2nd down`) y neto global (`ed_success_off_diff`, `ed_success_def_diff`, `global_success_net_diff`)
4. `Pressure` ofensiva permitida y defensiva generada vía proxy real `(sack | qb_hit) / dropbacks` (`pressure_gen_def_diff`, `pressure_allowed_off_diff`), más auditoría contra `pbp_participation.was_pressure` (`2016..2024`).
5. `QB CPOE + EPA` del mariscal titular (`qb_epa_per_db_diff`, `qb_cpoe_diff`), con encogimiento Bayesiano al prior causal de liga en Semana 1 o debut de QB (`starts == 0`).

Garantías auditables:
- Cero lecturas o evaluaciones sobre `holdout_sealed` (`>= 2025-02-02T17:30:00Z`).
- Guardia anti-fuga activa (`CausalLeakageError`): cualquier intento de actualizar el estado con `gameday' >= gameday` o `(season' == season and week' >= week)` aborta la ejecución.
- Invariancia por truncamiento temporal: truncar cualquier sufijo futuro de semanas/temporadas deja las features pasadas idénticas a `< 1e-12`.
"""

from __future__ import annotations

import math
import sys
from collections import defaultdict, deque
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"

if str(EXP_DIR) not in sys.path:
    sys.path.insert(0, str(EXP_DIR))

from pbp_ingest import (  # noqa: E402
    HOLDOUT_CUT_DATE,
    HOLDOUT_CUT_ISO,
    HOLDOUT_CUT_TS,
    HoldoutSealedAccessError,
    TEAM_CODE_ALIASES,
    assert_dates_strictly_before_holdout,
)


class CausalLeakageError(RuntimeError):
    """Error lanzado si una observación contemporánea o futura (`w' >= w` o `gameday' >= gameday`) entra al estado pre-partido."""


BASE_29_FEATURES: list[str] = [
    "elo_diff",
    "elo_fast_diff",
    "elo_momentum_diff",
    "qb_elo_diff",
    "qb_val_over_team_home",
    "qb_val_over_team_away",
    "qb_change_home",
    "qb_change_away",
    "qb_starts_diff",
    "coach_elo_diff",
    "coach_change_home",
    "coach_change_away",
    "composite_elo_diff",
    "comp_elo_logit",
    "elo_closeness",
    "rest_diff",
    "f5_adj_margin_diff",
    "f10_adj_margin_diff",
    "ewm_adj_margin_diff",
    "ewm_off_diff",
    "ewm_def_diff",
    "sos_elo_diff",
    "pyth_win_diff",
    "div_game",
    "is_indoor",
    "neutral_site",
    "wind_outdoor",
    "cold_outdoor",
    "prev_ot_diff",
]

EPA_12_FEATURES: list[str] = [
    "epa_dropback_off_diff",
    "epa_dropback_def_diff",
    "epa_dropback_wp_net_diff",
    "epa_rush_off_diff",
    "epa_rush_def_diff",
    "ed_success_off_diff",
    "ed_success_def_diff",
    "global_success_net_diff",
    "pressure_gen_def_diff",
    "pressure_allowed_off_diff",
    "qb_epa_per_db_diff",
    "qb_cpoe_diff",
]

CANDIDATE_41_FEATURES: list[str] = BASE_29_FEATURES + EPA_12_FEATURES

NFL_STADIUM_ELEVATION_M: dict[str, float] = {
    "ARI": 328.0, "ATL": 305.0, "BAL": 10.0, "BUF": 222.0, "CAR": 215.0, "CHI": 182.0,
    "CIN": 149.0, "CLE": 178.0, "DAL": 163.0, "DEN": 1588.0, "DET": 183.0, "GB": 195.0,
    "HOU": 15.0, "IND": 215.0, "JAX": 4.0, "KC": 250.0, "LA": 34.0, "LAC": 34.0,
    "LV": 615.0, "MIA": 3.0, "MIN": 254.0, "NE": 78.0, "NO": 1.0, "NYG": 2.0,
    "NYJ": 2.0, "PHI": 5.0, "PIT": 223.0, "SEA": 4.0, "SF": 14.0, "TB": 13.0,
    "TEN": 122.0, "WAS": 61.0, "STL": 142.0, "SD": 20.0, "OAK": 8.0,
}

NFL_DIVISIONS: dict[str, str] = {
    "BUF": "AFC_EAST", "MIA": "AFC_EAST", "NE": "AFC_EAST", "NYJ": "AFC_EAST",
    "BAL": "AFC_NORTH", "CIN": "AFC_NORTH", "CLE": "AFC_NORTH", "PIT": "AFC_NORTH",
    "HOU": "AFC_SOUTH", "IND": "AFC_SOUTH", "JAX": "AFC_SOUTH", "TEN": "AFC_SOUTH",
    "DEN": "AFC_WEST", "KC": "AFC_WEST", "LV": "AFC_WEST", "OAK": "AFC_WEST", "LAC": "AFC_WEST", "SD": "AFC_WEST",
    "DAL": "NFC_EAST", "NYG": "NFC_EAST", "PHI": "NFC_EAST", "WAS": "NFC_EAST",
    "CHI": "NFC_NORTH", "DET": "NFC_NORTH", "GB": "NFC_NORTH", "MIN": "NFC_NORTH",
    "ATL": "NFC_SOUTH", "CAR": "NFC_SOUTH", "NO": "NFC_SOUTH", "TB": "NFC_SOUTH",
    "ARI": "NFC_WEST", "LA": "NFC_WEST", "STL": "NFC_WEST", "SF": "NFC_WEST", "SEA": "NFC_WEST",
}

TEAM_TO_FRANCHISE: dict[str, str] = {
    "STL": "LA",
    "SD": "LAC",
    "OAK": "LV",
    "LAR": "LA",
    "JAC": "JAX",
    "WSH": "WAS",
}

TEAM_METRICS_SPEC: dict[str, float] = {
    "off_dropback_epa_pp": 0.020,
    "def_dropback_epa_pp": 0.020,
    "off_dropback_epa_wp_pp": 0.020,
    "def_dropback_epa_wp_pp": 0.020,
    "off_rush_epa_pp": -0.065,
    "def_rush_epa_pp": -0.065,
    "off_ed_success_rate": 0.455,
    "def_ed_success_rate": 0.455,
    "off_success_rate": 0.440,
    "def_success_rate": 0.440,
    "off_pressure_proxy_rate": 0.195,
    "def_pressure_proxy_rate": 0.195,
    "off_sack_rate": 0.066,
    "def_sack_rate": 0.066,
    "team_cpoe": 0.0,
}

# Hiperparámetros físicos fijos (no tuneados sobre holdout)
TEAM_IN_SEASON_DECAY = 0.88
TEAM_OFFSEASON_RETENTION = 0.45
TEAM_PRIOR_KAPPA_GAMES = 6.0

QB_GAME_DECAY = 0.92
QB_OFFSEASON_RETENTION = 0.70
QB_PRIOR_KAPPA_DROPBACKS = 120.0
QB_PRIOR_KAPPA_CPOE_PASSES = 140.0


def canonical_franchise(team_abbr: str) -> str:
    t = str(team_abbr).strip().upper()
    t = TEAM_CODE_ALIASES.get(t, t)
    return TEAM_TO_FRANCHISE.get(t, t)


def load_dev_nfl_base_features(features_parquet_path: Path | None = None) -> pd.DataFrame:
    """Carga únicamente filas `< 2025-02-02` de `nfl_features.parquet`, descartando `holdout_sealed` al instante."""
    p = features_parquet_path or (PRED_LAB_ROOT / "data" / "nfl" / "processed" / "nfl_features.parquet")
    df = pd.read_parquet(p)
    gday_str = df["gameday"].astype(str).str[:10]
    dev = df.loc[(gday_str < HOLDOUT_CUT_DATE) & df["home_score"].notna() & df["away_score"].notna()].copy()
    del df
    assert_dates_strictly_before_holdout(dev["gameday"], context="load_dev_nfl_base_features")

    # Verificar también corte exacto `ts_event_start < 2025-02-02T17:30:00Z`
    ts_approx = pd.to_datetime(dev["gameday"].astype(str).str[:10] + "T18:00:00Z", utc=True)
    if bool((ts_approx >= HOLDOUT_CUT_TS).any()):
        raise HoldoutSealedAccessError("Se detectó un partido >= HOLDOUT_CUT_TS tras el filtrado inicial.")

    dev["y"] = dev["result"].map({"H": 0, "T": 1, "A": 2}).astype(int)
    dev = dev.sort_values(["gameday", "season", "week", "game_id"], kind="mergesort").reset_index(drop=True)
    return dev


def apply_venue_physics_hfa(df: pd.DataFrame, alt_elo: float = 18.0) -> pd.DataFrame:
    """Idéntica a `research/prediction-lab/models/nfl/features.py::apply_venue_physics_hfa`."""
    if df.attrs.get("venue_physics_applied"):
        return df
    d = df.copy()
    eh = d["home_team"].map(lambda x: NFL_STADIUM_ELEVATION_M.get(str(x), 100.0)).to_numpy(dtype=float)
    ea = d["away_team"].map(lambda x: NFL_STADIUM_ELEVATION_M.get(str(x), 100.0)).to_numpy(dtype=float)
    neut = d["neutral_site"].to_numpy(dtype=float) > 0.5
    alt_diff_km = np.where(neut, 0.0, np.maximum(0.0, eh - ea) / 1000.0)
    bonus = np.where(neut, 0.0, alt_elo * alt_diff_km)

    for col in ("elo_diff", "elo_fast_diff", "qb_elo_diff", "composite_elo_diff"):
        d[col] = d[col].to_numpy(dtype=float) + bonus
    p_elo = 1.0 / (1.0 + 10.0 ** (-d["composite_elo_diff"].to_numpy(dtype=float) / 400.0))
    d["comp_elo_logit"] = np.log(np.clip(p_elo, 1e-6, 1.0 - 1e-6) / np.clip(1.0 - p_elo, 1e-6, 1.0 - 1e-6))
    d["elo_closeness"] = np.exp(-((d["composite_elo_diff"].to_numpy(dtype=float) / 135.0) ** 2))
    d.attrs["venue_physics_applied"] = True
    return d


def build_causal_epa_dataset(
    base_dev_df: pd.DataFrame,
    pbp_team_game_df: pd.DataFrame,
    pbp_qb_game_df: pd.DataFrame,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Construye las 12 features EPA semanales estrictamente causales (`w' < w`, `gameday' < gameday`)
    y devuelve `(df_con_41_features, causal_state_snapshot)`.
    """
    assert_dates_strictly_before_holdout(base_dev_df["gameday"], context="build_causal_epa_dataset.base")
    assert_dates_strictly_before_holdout(pbp_team_game_df["game_date"], context="build_causal_epa_dataset.tg")
    assert_dates_strictly_before_holdout(pbp_qb_game_df["game_date"], context="build_causal_epa_dataset.qb")

    df = apply_venue_physics_hfa(base_dev_df).sort_values(
        ["gameday", "season", "week", "game_id"], kind="mergesort"
    ).reset_index(drop=True)
    df["gameday_str"] = df["gameday"].astype(str).str[:10]

    # Indexar PBP por `(game_id, team)` y `(game_id, qb_id)` para acceso O(1), pero
    # NUNCA leeremos el registro de `game_id` hasta DESPUÉS de emitir todas las features de `gameday`!
    tg_lookup: dict[tuple[str, str], dict[str, Any]] = {}
    for r in pbp_team_game_df.to_dict("records"):
        gid = str(r["game_id"])
        tm = TEAM_CODE_ALIASES.get(str(r["team"]).strip().upper(), str(r["team"]).strip().upper())
        tg_lookup[(gid, tm)] = r

    qb_lookup: dict[tuple[str, str], dict[str, Any]] = {}
    for r in pbp_qb_game_df.to_dict("records"):
        gid = str(r["game_id"])
        qid = str(r["qb_id"]).strip()
        qb_lookup[(gid, qid)] = r

    # Estado causal por franquicia
    team_w: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    team_s: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    team_last_season: dict[str, int] = {}
    team_last_obs_meta: dict[str, tuple[int, int, str]] = {}  # (season, week, gameday_str)

    # Prior causal móvil de liga por métrica de equipo (ventana de ~1500 equipo-partidos pasados)
    league_recent: dict[str, deque[float]] = {
        m: deque([prior0] * 64, maxlen=1536) for m, prior0 in TEAM_METRICS_SPEC.items()
    }

    # Estado causal por QB (`qb_id`)
    qb_db_w: dict[str, float] = defaultdict(float)
    qb_db_epa_s: dict[str, float] = defaultdict(float)
    qb_cpoe_w: dict[str, float] = defaultdict(float)
    qb_cpoe_s: dict[str, float] = defaultdict(float)
    qb_career_raw_db: dict[str, float] = defaultdict(float)
    qb_last_season: dict[str, int] = {}
    qb_last_obs_meta: dict[str, tuple[int, int, str]] = {}

    league_qb_epa_recent: deque[float] = deque([0.02] * 64, maxlen=1536)
    rookie_qb_epa_recent: deque[float] = deque([-0.045] * 64, maxlen=512)
    league_qb_cpoe_recent: deque[float] = deque([0.0] * 64, maxlen=1536)

    def _regress_franchise_if_new_season(fran: str, season: int) -> None:
        prev_s = team_last_season.get(fran)
        if prev_s is not None and season > prev_s:
            for m in TEAM_METRICS_SPEC:
                team_w[fran][m] = min(team_w[fran][m] * TEAM_OFFSEASON_RETENTION, 5.0)
                ratio = (team_w[fran][m] / max(1e-12, team_w[fran][m] / TEAM_OFFSEASON_RETENTION)) if team_w[fran][m] > 0 else 0.0
                team_s[fran][m] *= TEAM_OFFSEASON_RETENTION
                # Si se truncó a 5.0, reescalar suma proporcionalmente
                # Mejor: conservar media exacta antes del tope
        team_last_season[fran] = season

    def _regress_franchise_clean(fran: str, season: int) -> None:
        prev_s = team_last_season.get(fran)
        if prev_s is not None and season > prev_s:
            for m in TEAM_METRICS_SPEC:
                w_old = team_w[fran][m]
                if w_old > 1e-12:
                    mean_old = team_s[fran][m] / w_old
                    w_new = min(w_old * TEAM_OFFSEASON_RETENTION, 4.5)
                    team_w[fran][m] = w_new
                    team_s[fran][m] = mean_old * w_new
        team_last_season[fran] = season

    def _regress_qb_clean(qid: str, season: int) -> None:
        if not qid or qid == "unknown":
            return
        prev_s = qb_last_season.get(qid)
        if prev_s is not None and season > prev_s:
            if qb_db_w[qid] > 1e-12:
                m_epa = qb_db_epa_s[qid] / qb_db_w[qid]
                qb_db_w[qid] *= QB_OFFSEASON_RETENTION
                qb_db_epa_s[qid] = m_epa * qb_db_w[qid]
            if qb_cpoe_w[qid] > 1e-12:
                m_cp = qb_cpoe_s[qid] / qb_cpoe_w[qid]
                qb_cpoe_w[qid] *= QB_OFFSEASON_RETENTION
                qb_cpoe_s[qid] = m_cp * qb_cpoe_w[qid]
        qb_last_season[qid] = season

    def _posterior_team(fran: str, metric: str, lg_prior: float) -> float:
        w = team_w[fran][metric]
        s = team_s[fran][metric]
        return float((s + TEAM_PRIOR_KAPPA_GAMES * lg_prior) / (w + TEAM_PRIOR_KAPPA_GAMES))

    def _posterior_qb(qid: str, lg_epa_prior: float, rk_epa_prior: float, lg_cpoe_prior: float) -> tuple[float, float]:
        if not qid or qid == "unknown":
            return float(lg_epa_prior), float(lg_cpoe_prior)
        # En debut de QB o mariscal con < 60 dropbacks históricos, interpolar prior hacia `rk_epa_prior`
        raw_db = qb_career_raw_db[qid]
        vet_frac = min(1.0, raw_db / 90.0)
        eff_epa_prior = vet_frac * lg_epa_prior + (1.0 - vet_frac) * rk_epa_prior
        w_e = qb_db_w[qid]
        s_e = qb_db_epa_s[qid]
        post_epa = (s_e + QB_PRIOR_KAPPA_DROPBACKS * eff_epa_prior) / (w_e + QB_PRIOR_KAPPA_DROPBACKS)

        w_c = qb_cpoe_w[qid]
        s_c = qb_cpoe_s[qid]
        post_cpoe = (s_c + QB_PRIOR_KAPPA_CPOE_PASSES * lg_cpoe_prior) / (w_c + QB_PRIOR_KAPPA_CPOE_PASSES)
        return float(post_epa), float(post_cpoe)

    n_rows = len(df)
    out_cols: dict[str, np.ndarray] = {c: np.zeros(n_rows, dtype=np.float64) for c in EPA_12_FEATURES}
    # Columnas auxiliares diagnósticas para trazabilidad y live context
    diag_cols = [
        "home_off_epa_causal",
        "home_def_epa_causal",
        "away_off_epa_causal",
        "away_def_epa_causal",
        "home_off_succ_causal",
        "away_off_succ_causal",
        "home_qb_epa_causal",
        "away_qb_epa_causal",
        "home_qb_cpoe_causal",
        "away_qb_cpoe_causal",
    ]
    for dc in diag_cols:
        out_cols[dc] = np.zeros(n_rows, dtype=np.float64)

    for gday_str, day_df in df.groupby("gameday_str", sort=True):
        day_tuples = list(day_df.itertuples(index=True))
        lg_priors = {m: float(np.mean(league_recent[m])) for m in TEAM_METRICS_SPEC}
        lg_qb_epa = float(np.mean(league_qb_epa_recent))
        rk_qb_epa = float(np.mean(rookie_qb_epa_recent))
        lg_qb_cpoe = float(np.mean(league_qb_cpoe_recent))

        # --- FASE 1: Emitir features estrictamente ANTES de procesar resultados de `gday_str` ---
        for row in day_tuples:
            idx = int(row.Index)
            s_yr = int(row.season)
            wk = int(row.week)
            h_team = TEAM_CODE_ALIASES.get(str(row.home_team).strip().upper(), str(row.home_team).strip().upper())
            a_team = TEAM_CODE_ALIASES.get(str(row.away_team).strip().upper(), str(row.away_team).strip().upper())
            h_fran = canonical_franchise(str(row.home_franchise))
            a_fran = canonical_franchise(str(row.away_franchise))

            # Guardia activa anti-fuga w' < w y gameday' < gameday
            for fran in (h_fran, a_fran):
                last_meta = team_last_obs_meta.get(fran)
                if last_meta is not None:
                    ls, lw, lgd = last_meta
                    if lgd >= gday_str or (ls == s_yr and lw >= wk):
                        raise CausalLeakageError(
                            f"Violación causal en franquicia {fran} para game_id={row.game_id}: "
                            f"última obs={last_meta} no es estrictamente anterior a {(s_yr, wk, gday_str)}."
                        )

            _regress_franchise_clean(h_fran, s_yr)
            _regress_franchise_clean(a_fran, s_yr)

            qbh = str(row.home_qb_id).strip() if pd.notna(row.home_qb_id) else "unknown"
            qba = str(row.away_qb_id).strip() if pd.notna(row.away_qb_id) else "unknown"
            for qid in (qbh, qba):
                if qid and qid != "unknown":
                    q_meta = qb_last_obs_meta.get(qid)
                    if q_meta is not None:
                        qs, qw, qgd = q_meta
                        if qgd >= gday_str or (qs == s_yr and qw >= wk):
                            raise CausalLeakageError(
                                f"Violación causal en QB {qid} para game_id={row.game_id}: "
                                f"última obs={q_meta} no es estrictamente anterior a {(s_yr, wk, gday_str)}."
                            )
            _regress_qb_clean(qbh, s_yr)
            _regress_qb_clean(qba, s_yr)

            h_db_off = _posterior_team(h_fran, "off_dropback_epa_pp", lg_priors["off_dropback_epa_pp"])
            a_db_off = _posterior_team(a_fran, "off_dropback_epa_pp", lg_priors["off_dropback_epa_pp"])
            h_db_def = _posterior_team(h_fran, "def_dropback_epa_pp", lg_priors["def_dropback_epa_pp"])
            a_db_def = _posterior_team(a_fran, "def_dropback_epa_pp", lg_priors["def_dropback_epa_pp"])

            h_db_wp_off = _posterior_team(h_fran, "off_dropback_epa_wp_pp", lg_priors["off_dropback_epa_wp_pp"])
            a_db_wp_off = _posterior_team(a_fran, "off_dropback_epa_wp_pp", lg_priors["off_dropback_epa_wp_pp"])
            h_db_wp_def = _posterior_team(h_fran, "def_dropback_epa_wp_pp", lg_priors["def_dropback_epa_wp_pp"])
            a_db_wp_def = _posterior_team(a_fran, "def_dropback_epa_wp_pp", lg_priors["def_dropback_epa_wp_pp"])

            h_ru_off = _posterior_team(h_fran, "off_rush_epa_pp", lg_priors["off_rush_epa_pp"])
            a_ru_off = _posterior_team(a_fran, "off_rush_epa_pp", lg_priors["off_rush_epa_pp"])
            h_ru_def = _posterior_team(h_fran, "def_rush_epa_pp", lg_priors["def_rush_epa_pp"])
            a_ru_def = _posterior_team(a_fran, "def_rush_epa_pp", lg_priors["def_rush_epa_pp"])

            h_ed_off = _posterior_team(h_fran, "off_ed_success_rate", lg_priors["off_ed_success_rate"])
            a_ed_off = _posterior_team(a_fran, "off_ed_success_rate", lg_priors["off_ed_success_rate"])
            h_ed_def = _posterior_team(h_fran, "def_ed_success_rate", lg_priors["def_ed_success_rate"])
            a_ed_def = _posterior_team(a_fran, "def_ed_success_rate", lg_priors["def_ed_success_rate"])

            h_su_off = _posterior_team(h_fran, "off_success_rate", lg_priors["off_success_rate"])
            a_su_off = _posterior_team(a_fran, "off_success_rate", lg_priors["off_success_rate"])
            h_su_def = _posterior_team(h_fran, "def_success_rate", lg_priors["def_success_rate"])
            a_su_def = _posterior_team(a_fran, "def_success_rate", lg_priors["def_success_rate"])

            h_pr_gen = _posterior_team(h_fran, "def_pressure_proxy_rate", lg_priors["def_pressure_proxy_rate"])
            a_pr_gen = _posterior_team(a_fran, "def_pressure_proxy_rate", lg_priors["def_pressure_proxy_rate"])
            h_pr_all = _posterior_team(h_fran, "off_pressure_proxy_rate", lg_priors["off_pressure_proxy_rate"])
            a_pr_all = _posterior_team(a_fran, "off_pressure_proxy_rate", lg_priors["off_pressure_proxy_rate"])

            qbh_epa, qbh_cpoe = _posterior_qb(qbh, lg_qb_epa, rk_qb_epa, lg_qb_cpoe)
            qba_epa, qba_cpoe = _posterior_qb(qba, lg_qb_epa, rk_qb_epa, lg_qb_cpoe)

            out_cols["epa_dropback_off_diff"][idx] = h_db_off - a_db_off
            out_cols["epa_dropback_def_diff"][idx] = a_db_def - h_db_def
            out_cols["epa_dropback_wp_net_diff"][idx] = (h_db_wp_off - h_db_wp_def) - (a_db_wp_off - a_db_wp_def)
            out_cols["epa_rush_off_diff"][idx] = h_ru_off - a_ru_off
            out_cols["epa_rush_def_diff"][idx] = a_ru_def - h_ru_def
            out_cols["ed_success_off_diff"][idx] = h_ed_off - a_ed_off
            out_cols["ed_success_def_diff"][idx] = a_ed_def - h_ed_def
            out_cols["global_success_net_diff"][idx] = (h_su_off - h_su_def) - (a_su_off - a_su_def)
            out_cols["pressure_gen_def_diff"][idx] = h_pr_gen - a_pr_gen
            out_cols["pressure_allowed_off_diff"][idx] = a_pr_all - h_pr_all
            out_cols["qb_epa_per_db_diff"][idx] = qbh_epa - qba_epa
            out_cols["qb_cpoe_diff"][idx] = (qbh_cpoe - qba_cpoe) / 100.0  # escalado de puntos porcentuales a fracción

            out_cols["home_off_epa_causal"][idx] = 0.62 * h_db_off + 0.38 * h_ru_off
            out_cols["home_def_epa_causal"][idx] = 0.62 * h_db_def + 0.38 * h_ru_def
            out_cols["away_off_epa_causal"][idx] = 0.62 * a_db_off + 0.38 * a_ru_off
            out_cols["away_def_epa_causal"][idx] = 0.62 * a_db_def + 0.38 * a_ru_def
            out_cols["home_off_succ_causal"][idx] = h_su_off * 100.0
            out_cols["away_off_succ_causal"][idx] = a_su_off * 100.0
            out_cols["home_qb_epa_causal"][idx] = qbh_epa
            out_cols["away_qb_epa_causal"][idx] = qba_epa
            out_cols["home_qb_cpoe_causal"][idx] = qbh_cpoe
            out_cols["away_qb_cpoe_causal"][idx] = qba_cpoe

        # --- FASE 2: Actualizar el estado DESPUÉS de que terminaron todos los juegos de `gday_str` ---
        for row in day_tuples:
            gid = str(row.game_id)
            s_yr = int(row.season)
            wk = int(row.week)
            h_team = TEAM_CODE_ALIASES.get(str(row.home_team).strip().upper(), str(row.home_team).strip().upper())
            a_team = TEAM_CODE_ALIASES.get(str(row.away_team).strip().upper(), str(row.away_team).strip().upper())
            h_fran = canonical_franchise(str(row.home_franchise))
            a_fran = canonical_franchise(str(row.away_franchise))

            for tm_code, fran in ((h_team, h_fran), (a_team, a_fran)):
                rec = tg_lookup.get((gid, tm_code))
                if rec is not None:
                    for m in TEAM_METRICS_SPEC:
                        val = rec.get(m, np.nan)
                        if val is not None and np.isfinite(float(val)):
                            fv = float(val)
                            team_w[fran][m] = TEAM_IN_SEASON_DECAY * team_w[fran][m] + 1.0
                            team_s[fran][m] = TEAM_IN_SEASON_DECAY * team_s[fran][m] + fv
                            league_recent[m].append(fv)
                    team_last_obs_meta[fran] = (s_yr, wk, gday_str)

            qbh = str(row.home_qb_id).strip() if pd.notna(row.home_qb_id) else "unknown"
            qba = str(row.away_qb_id).strip() if pd.notna(row.away_qb_id) else "unknown"
            for qid in (qbh, qba):
                if not qid or qid == "unknown":
                    continue
                qrec = qb_lookup.get((gid, qid))
                if qrec is not None:
                    n_db = float(qrec.get("qb_dropbacks", 0.0) or 0.0)
                    epa_s = float(qrec.get("qb_db_epa_sum", 0.0) or 0.0)
                    if n_db >= 1.0 and np.isfinite(epa_s):
                        was_rookie = qb_career_raw_db[qid] < 30.0
                        qb_db_w[qid] = QB_GAME_DECAY * qb_db_w[qid] + n_db
                        qb_db_epa_s[qid] = QB_GAME_DECAY * qb_db_epa_s[qid] + epa_s
                        qb_career_raw_db[qid] += n_db
                        epa_pp = epa_s / n_db
                        league_qb_epa_recent.append(epa_pp)
                        if was_rookie and n_db >= 10.0:
                            rookie_qb_epa_recent.append(epa_pp)

                    n_cp = float(qrec.get("qb_cpoe_n", 0.0) or 0.0)
                    cp_s = float(qrec.get("qb_cpoe_sum", 0.0) or 0.0)
                    cp_mean = qrec.get("qb_cpoe_mean", np.nan)
                    if n_cp >= 1.0 and cp_mean is not None and np.isfinite(float(cp_mean)):
                        qb_cpoe_w[qid] = QB_GAME_DECAY * qb_cpoe_w[qid] + n_cp
                        qb_cpoe_s[qid] = QB_GAME_DECAY * qb_cpoe_s[qid] + cp_s
                        league_qb_cpoe_recent.append(float(cp_mean))

                    qb_last_obs_meta[qid] = (s_yr, wk, gday_str)

    for k, arr in out_cols.items():
        df[k] = arr

    # Extraer el estado causal por franquicia al cierre de `walk_forward_dev` (< 2025-02-02)
    # para síntesis causal en vivo de cualquier enfrentamiento NFL sin leer `holdout_sealed`
    final_lg_priors = {m: float(np.mean(league_recent[m])) for m in TEAM_METRICS_SPEC}
    final_lg_qb_epa = float(np.mean(league_qb_epa_recent))
    final_rk_qb_epa = float(np.mean(rookie_qb_epa_recent))
    final_lg_qb_cpoe = float(np.mean(league_qb_cpoe_recent))

    # También capturar el último estado Elo/forma base post-partido por franquicia en dev
    franchise_base_state = _extract_end_of_dev_base_franchise_state(df)
    franchise_epa_state: dict[str, dict[str, float]] = {}
    all_32 = sorted({canonical_franchise(t) for t in NFL_DIVISIONS if t not in ("STL", "SD", "OAK")})
    for fran in all_32:
        franchise_epa_state[fran] = {
            m: _posterior_team(fran, m, final_lg_priors[m]) for m in TEAM_METRICS_SPEC
        }
        # Guardar también el último QB titular conocido en dev para métricas QB de equipo cuando no hay anuncio vivo
        last_qb = franchise_base_state.get(fran, {}).get("last_qb_id", "unknown")
        q_epa, q_cpoe = _posterior_qb(str(last_qb), final_lg_qb_epa, final_rk_qb_epa, final_lg_qb_cpoe)
        franchise_epa_state[fran]["last_qb_epa_per_db"] = q_epa
        franchise_epa_state[fran]["last_qb_cpoe"] = q_cpoe

    causal_state_snapshot = {
        "as_of_cutoff_iso": HOLDOUT_CUT_ISO,
        "max_dev_gameday": str(df["gameday_str"].max()),
        "league_priors": final_lg_priors,
        "qb_priors": {
            "league_qb_epa_per_db": final_lg_qb_epa,
            "rookie_qb_epa_per_db": final_rk_qb_epa,
            "league_qb_cpoe": final_lg_qb_cpoe,
        },
        "franchise_base_state": franchise_base_state,
        "franchise_epa_state": franchise_epa_state,
    }
    return df, causal_state_snapshot


def _extract_end_of_dev_base_franchise_state(dev_df: pd.DataFrame) -> dict[str, dict[str, Any]]:
    """Reconstruye el estado causal exacto post-partido (Elo, F5/F10, EWMA, SOS, Pyth, QB, Coach)
    de las 32 franquicias NFL usando únicamente partidos `< 2025-02-02` (`walk_forward_dev`).
    """
    assert_dates_strictly_before_holdout(dev_df["gameday"], context="_extract_end_of_dev_base_franchise_state")
    elo: dict[str, float] = defaultdict(lambda: 1500.0)
    elo_fast: dict[str, float] = defaultdict(lambda: 1500.0)
    last_season: dict[str, int] = {}
    hist5: dict[str, deque[tuple[float, float, float, float, float]]] = defaultdict(lambda: deque(maxlen=5))
    hist10: dict[str, deque[tuple[float, float, float, float, float]]] = defaultdict(lambda: deque(maxlen=10))
    ewm_margin: dict[str, float] = defaultdict(float)
    ewm_off: dict[str, float] = defaultdict(float)
    ewm_def: dict[str, float] = defaultdict(float)
    qb_elo: dict[str, float] = defaultdict(lambda: 1445.0)
    qb_starts: dict[str, int] = defaultdict(int)
    qb_last_season: dict[str, int] = {}
    team_last_qb: dict[str, str] = {}
    coach_elo: dict[str, float] = defaultdict(lambda: 1500.0)
    coach_last_season: dict[str, int] = {}
    team_last_coach: dict[str, str] = {}
    team_indoor: dict[str, float] = defaultdict(float)
    recent_margins: deque[float] = deque([2.2] * 250, maxlen=500)

    ordered = dev_df.sort_values(["gameday", "game_id"], kind="mergesort").reset_index(drop=True)
    for _, day in ordered.groupby("gameday", sort=True):
        dyn_hfa = float(np.clip(np.mean(recent_margins) * 24.0, 28.0, 65.0))
        eff_hfa = 0.55 * 48.0 + 0.45 * dyn_hfa
        for r in day.itertuples(index=False):
            h = canonical_franchise(str(r.home_franchise))
            a = canonical_franchise(str(r.away_franchise))
            s_yr = int(r.season)
            for t in (h, a):
                ps = last_season.get(t)
                if ps is not None and s_yr > ps:
                    elo[t] = 1500.0 + 0.67 * (elo[t] - 1500.0)
                    elo_fast[t] = 1500.0 + 0.65 * (elo_fast[t] - 1500.0)
                    ewm_margin[t] *= 0.65
                    ewm_off[t] *= 0.65
                    ewm_def[t] *= 0.65
                last_season[t] = s_yr

            qbh = str(r.home_qb_id).strip() if pd.notna(r.home_qb_id) else "unknown"
            qba = str(r.away_qb_id).strip() if pd.notna(r.away_qb_id) else "unknown"
            for q in (qbh, qba):
                if q and q != "unknown":
                    qs = qb_last_season.get(q)
                    if qs is not None and s_yr > qs:
                        qb_elo[q] = 1500.0 + 0.85 * (qb_elo[q] - 1500.0)
                    qb_last_season[q] = s_yr

            ch_h = str(r.home_coach).strip() if pd.notna(r.home_coach) else "unknown"
            ch_a = str(r.away_coach).strip() if pd.notna(r.away_coach) else "unknown"
            for c in (ch_h, ch_a):
                if c and c != "unknown":
                    cs = coach_last_season.get(c)
                    if cs is not None and s_yr > cs:
                        coach_elo[c] = 1500.0 + 0.85 * (coach_elo[c] - 1500.0)
                    coach_last_season[c] = s_yr

            margin = int(r.home_margin)
            hs, as_ = float(r.home_score), float(r.away_score)
            neut = bool(r.neutral_site)
            if not neut:
                recent_margins.append(float(margin))
                team_indoor[h] = float(r.is_indoor)
            s_home = 1.0 if margin > 0 else (0.5 if margin == 0 else 0.0)
            hfa = 0.0 if neut else eff_hfa
            gap = (elo[h] + hfa) - elo[a]
            e_home = 1.0 / (1.0 + 10.0 ** (-gap / 400.0))
            mov = float(math.log(abs(margin) + 1.0) * 2.2 / (0.001 * abs(gap) + 2.2))
            delta = 20.0 * mov * (s_home - e_home)

            elo_h_pre, elo_a_pre = elo[h], elo[a]
            adj_m_h = float(margin) - (gap / 25.0)
            elo[h] += delta
            elo[a] -= delta

            gap_f = (elo_fast[h] + hfa) - elo_fast[a]
            e_fast = 1.0 / (1.0 + 10.0 ** (-gap_f / 400.0))
            elo_fast[h] += 32.0 * mov * (s_home - e_fast)
            elo_fast[a] -= 32.0 * mov * (s_home - e_fast)

            hist5[h].append((1.0 if margin > 0 else 0.0, hs, as_, adj_m_h, elo_a_pre))
            hist5[a].append((1.0 if margin < 0 else 0.0, as_, hs, -adj_m_h, elo_h_pre))
            hist10[h].append((1.0 if margin > 0 else 0.0, hs, as_, adj_m_h, elo_a_pre))
            hist10[a].append((1.0 if margin < 0 else 0.0, as_, hs, -adj_m_h, elo_h_pre))

            ewm_margin[h] = 0.80 * ewm_margin[h] + 0.20 * adj_m_h
            ewm_margin[a] = 0.80 * ewm_margin[a] + 0.20 * (-adj_m_h)
            ewm_off[h] = 0.80 * ewm_off[h] + 0.20 * (hs - 22.0)
            ewm_off[a] = 0.80 * ewm_off[a] + 0.20 * (as_ - 21.0)
            ewm_def[h] = 0.80 * ewm_def[h] + 0.20 * (21.0 - as_)
            ewm_def[a] = 0.80 * ewm_def[a] + 0.20 * (22.0 - hs)

            qeh = qb_elo[qbh] if (qbh and qbh != "unknown") else elo_h_pre
            qea = qb_elo[qba] if (qba and qba != "unknown") else elo_a_pre
            qb_gap = (0.5 * (qeh + elo_h_pre) + hfa) - 0.5 * (qea + elo_a_pre)
            e_qb = 1.0 / (1.0 + 10.0 ** (-qb_gap / 400.0))
            d_qb = 22.0 * mov * (s_home - e_qb)
            if qbh and qbh != "unknown":
                qb_elo[qbh] = qeh + d_qb
                qb_starts[qbh] += 1
                team_last_qb[h] = qbh
            if qba and qba != "unknown":
                qb_elo[qba] = qea - d_qb
                qb_starts[qba] += 1
                team_last_qb[a] = qba

            ceh = coach_elo[ch_h] if (ch_h and ch_h != "unknown") else 1500.0
            cea = coach_elo[ch_a] if (ch_a and ch_a != "unknown") else 1500.0
            c_gap = (0.5 * (ceh + elo_h_pre) + hfa) - 0.5 * (cea + elo_a_pre)
            e_c = 1.0 / (1.0 + 10.0 ** (-c_gap / 400.0))
            d_c = 12.0 * mov * (s_home - e_c)
            if ch_h and ch_h != "unknown":
                coach_elo[ch_h] = ceh + d_c
                team_last_coach[h] = ch_h
            if ch_a and ch_a != "unknown":
                coach_elo[ch_a] = cea - d_c
                team_last_coach[a] = ch_a

    def _pyth(g_list: list[tuple[float, float, float, float, float]]) -> float:
        if not g_list:
            return 0.5
        pf = max(1.0, sum(g[1] for g in g_list)) ** 2.37
        pa = max(1.0, sum(g[2] for g in g_list)) ** 2.37
        return float(pf / (pf + pa))

    eff_hfa_final = 0.55 * 48.0 + 0.45 * float(np.clip(np.mean(recent_margins) * 24.0, 28.0, 65.0))
    state: dict[str, dict[str, Any]] = {}
    all_32 = sorted({canonical_franchise(t) for t in NFL_DIVISIONS if t not in ("STL", "SD", "OAK")})
    for fran in all_32:
        g5 = list(hist5[fran])
        g10 = list(hist10[fran])
        l_qb = team_last_qb.get(fran, "unknown")
        l_ch = team_last_coach.get(fran, "unknown")
        reg_elo = 1500.0 + 0.67 * (elo[fran] - 1500.0)
        reg_elo_fast = 1500.0 + 0.65 * (elo_fast[fran] - 1500.0)
        reg_qb_elo = 1500.0 + 0.85 * (qb_elo[l_qb] - 1500.0) if l_qb != "unknown" else reg_elo
        reg_coach_elo = 1500.0 + 0.85 * (coach_elo[l_ch] - 1500.0) if l_ch != "unknown" else 1500.0
        state[fran] = {
            "elo": float(reg_elo),
            "elo_fast": float(reg_elo_fast),
            "qb_elo": float(reg_qb_elo),
            "qb_starts": int(qb_starts[l_qb]) if l_qb != "unknown" else 0,
            "last_qb_id": str(l_qb),
            "coach_elo": float(reg_coach_elo),
            "last_coach": str(l_ch),
            "f5_adj_margin": float(np.mean([g[3] for g in g5])) * 0.65 if g5 else 0.0,
            "f10_adj_margin": float(np.mean([g[3] for g in g10])) * 0.65 if g10 else 0.0,
            "ewm_adj_margin": float(ewm_margin[fran] * 0.65),
            "ewm_off": float(ewm_off[fran] * 0.65),
            "ewm_def": float(ewm_def[fran] * 0.65),
            "sos_elo": float(np.mean([g[4] for g in g10])) if g10 else 1500.0,
            "pyth_win": float(0.5 + 0.65 * (_pyth(g10) - 0.5)),
            "is_indoor_home": float(team_indoor[fran]),
            "elevation_m": float(NFL_STADIUM_ELEVATION_M.get(fran, 100.0)),
            "division": NFL_DIVISIONS.get(fran, ""),
            "eff_hfa": float(eff_hfa_final),
        }
    return state


def synthesize_live_row_from_causal_state(
    home_abbr: str,
    away_abbr: str,
    causal_state: dict[str, Any],
    *,
    is_indoor: float | None = None,
    neutral_site: float = 0.0,
    wind_mph: float = 0.0,
    temp_f: float | None = None,
    include_incumbent_qb_coach: bool = True,
) -> list[float | None]:
    """Construye el vector de `41` features (`CANDIDATE_41_FEATURES`) para un partido NFL en vivo
    usando únicamente el estado causal precomputado (`< 2025-02-02T17:30:00Z`) + física de sede/clima.

    No inventa datos faltantes: los campos propios del calendario semanal no presentes en el snapshot
    en vivo (`rest_diff`, `prev_ot_diff`, `qb_change_*`, `coach_change_*`, y `cold_outdoor` si no hay
    temperatura observada) se dejan honestamente en `None` (`null` en JSON -> imputación por media del scaler).
    """
    hf = canonical_franchise(home_abbr)
    af = canonical_franchise(away_abbr)
    b_map = causal_state["franchise_base_state"]
    e_map = causal_state["franchise_epa_state"]
    hb = b_map.get(hf)
    ab = b_map.get(af)
    he = e_map.get(hf)
    ae = e_map.get(af)
    if hb is None or ab is None or he is None or ae is None:
        return [None] * len(CANDIDATE_41_FEATURES)

    ind = float(hb["is_indoor_home"]) if is_indoor is None else float(is_indoor)
    neut = float(neutral_site)
    hfa = 0.0 if neut > 0.5 else float(hb.get("eff_hfa", 48.0))
    eh = float(hb["elevation_m"])
    ea = float(ab["elevation_m"])
    alt_bonus = 0.0 if neut > 0.5 else 18.0 * max(0.0, eh - ea) / 1000.0

    elo_diff = (float(hb["elo"]) + hfa - float(ab["elo"])) + alt_bonus
    elo_fast_diff = (float(hb["elo_fast"]) + hfa - float(ab["elo_fast"])) + alt_bonus
    elo_mom = (float(hb["elo_fast"]) - float(ab["elo_fast"])) - (float(hb["elo"]) - float(ab["elo"]))

    div_game = 1.0 if (hb["division"] and hb["division"] == ab["division"]) else 0.0
    wind_outdoor = 0.0 if ind > 0.5 else max(0.0, float(wind_mph) - 10.0)
    cold_outdoor: float | None = 0.0 if ind > 0.5 else (max(0.0, 40.0 - float(temp_f)) if temp_f is not None else None)

    vals: dict[str, float | None] = {
        "elo_diff": elo_diff,
        "elo_fast_diff": elo_fast_diff,
        "elo_momentum_diff": elo_mom,
        "qb_elo_diff": None,
        "qb_val_over_team_home": None,
        "qb_val_over_team_away": None,
        "qb_change_home": None,
        "qb_change_away": None,
        "qb_starts_diff": None,
        "coach_elo_diff": None,
        "coach_change_home": None,
        "coach_change_away": None,
        "composite_elo_diff": elo_diff,
        "comp_elo_logit": math.log(
            max(1e-6, 1.0 / (1.0 + 10.0 ** (-elo_diff / 400.0)))
            / max(1e-6, 1.0 - 1.0 / (1.0 + 10.0 ** (-elo_diff / 400.0)))
        ),
        "elo_closeness": math.exp(-((elo_diff / 135.0) ** 2)),
        "rest_diff": None,
        "f5_adj_margin_diff": float(hb["f5_adj_margin"]) - float(ab["f5_adj_margin"]),
        "f10_adj_margin_diff": float(hb["f10_adj_margin"]) - float(ab["f10_adj_margin"]),
        "ewm_adj_margin_diff": float(hb["ewm_adj_margin"]) - float(ab["ewm_adj_margin"]),
        "ewm_off_diff": float(hb["ewm_off"]) - float(ab["ewm_off"]),
        "ewm_def_diff": float(hb["ewm_def"]) - float(ab["ewm_def"]),
        "sos_elo_diff": (float(hb["sos_elo"]) - float(ab["sos_elo"])) / 100.0,
        "pyth_win_diff": float(hb["pyth_win"]) - float(ab["pyth_win"]),
        "div_game": div_game,
        "is_indoor": ind,
        "neutral_site": neut,
        "wind_outdoor": wind_outdoor,
        "cold_outdoor": cold_outdoor,
        "prev_ot_diff": None,
        "epa_dropback_off_diff": float(he["off_dropback_epa_pp"]) - float(ae["off_dropback_epa_pp"]),
        "epa_dropback_def_diff": float(ae["def_dropback_epa_pp"]) - float(he["def_dropback_epa_pp"]),
        "epa_dropback_wp_net_diff": (
            (float(he["off_dropback_epa_wp_pp"]) - float(he["def_dropback_epa_wp_pp"]))
            - (float(ae["off_dropback_epa_wp_pp"]) - float(ae["def_dropback_epa_wp_pp"]))
        ),
        "epa_rush_off_diff": float(he["off_rush_epa_pp"]) - float(ae["off_rush_epa_pp"]),
        "epa_rush_def_diff": float(ae["def_rush_epa_pp"]) - float(he["def_rush_epa_pp"]),
        "ed_success_off_diff": float(he["off_ed_success_rate"]) - float(ae["off_ed_success_rate"]),
        "ed_success_def_diff": float(ae["def_ed_success_rate"]) - float(he["def_ed_success_rate"]),
        "global_success_net_diff": (
            (float(he["off_success_rate"]) - float(he["def_success_rate"]))
            - (float(ae["off_success_rate"]) - float(ae["def_success_rate"]))
        ),
        "pressure_gen_def_diff": float(he["def_pressure_proxy_rate"]) - float(ae["def_pressure_proxy_rate"]),
        "pressure_allowed_off_diff": float(ae["off_pressure_proxy_rate"]) - float(he["off_pressure_proxy_rate"]),
        "qb_epa_per_db_diff": None,
        "qb_cpoe_diff": None,
    }

    if include_incumbent_qb_coach:
        val_h = float(hb["qb_elo"]) - float(hb["elo"])
        val_a = float(ab["qb_elo"]) - float(ab["elo"])
        ce_diff = float(hb["coach_elo"]) - float(ab["coach_elo"])
        comp_diff = elo_diff + 0.38 * (val_h - val_a) + 0.12 * ce_diff
        p_comp = 1.0 / (1.0 + 10.0 ** (-comp_diff / 400.0))
        vals["qb_elo_diff"] = (float(hb["qb_elo"]) + hfa - float(ab["qb_elo"])) + alt_bonus
        vals["qb_val_over_team_home"] = val_h
        vals["qb_val_over_team_away"] = val_a
        vals["qb_starts_diff"] = math.log1p(int(hb["qb_starts"])) - math.log1p(int(ab["qb_starts"]))
        vals["coach_elo_diff"] = ce_diff
        vals["composite_elo_diff"] = comp_diff
        vals["comp_elo_logit"] = math.log(max(1e-6, p_comp) / max(1e-6, 1.0 - p_comp))
        vals["elo_closeness"] = math.exp(-((comp_diff / 135.0) ** 2))
        vals["qb_epa_per_db_diff"] = float(he["last_qb_epa_per_db"]) - float(ae["last_qb_epa_per_db"])
        vals["qb_cpoe_diff"] = (float(he["last_qb_cpoe"]) - float(ae["last_qb_cpoe"])) / 100.0

    return [vals[col] for col in CANDIDATE_41_FEATURES]

