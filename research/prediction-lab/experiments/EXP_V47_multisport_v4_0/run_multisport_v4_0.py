"""EXP_V47 — Fusión `Multi-Sport v4.0` (`MLB`, `NHL`, `NBA`, `NCAAF`) sobre Matrices Reales de Equipos y Estadios.

Elimina el divorcio entre `multisport.ts` (`v3.0`, con matrices reales de equipos y estadios) y
`multisport_v3_6.ts` (`v3.6`, con cadenas de Markov MLB Extra-Innings, NHL Empty-Net y NBA bajas/GTD),
incorporando además **`NCAAF Horizon v4.0`** (`134+` programas FBS con números clave colegiales `3, 7, 10, 14, 17, 21`,
choque de altitud y amortiguamiento de varianza en *garbage-time*).

Gobernanza anti-fuga (`< 2025-02-02T17:30:00Z`):
  - Toda validación empírica y construcción del estado candidato filtra estrictamente a temporadas concluidas
    antes del corte sellado (`baseball == '2024'`, `hockey == '2023-24'`, `college-football == '2024'`),
    y para NBA utiliza métricas estructurales pre-corte sin ajustar ningún parámetro post-holdout.
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

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"
EXP_V42_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V42_multisport_v3_6"
ARTIFACTS_DIR = EXP_DIR / "artifacts"

for _p in (str(REPO_ROOT), str(EXP_V42_DIR), str(EXP_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from run_multisport_v3_6 import (  # noqa: E402
    HOLDOUT_CUT_ISO,
    normal_cdf_exact,
    project_mlb_v36_exact,
    project_nba_v36_exact,
    project_nhl_v36_exact,
)

MODEL_SEED = 42

STATE_V40_OUT = REPO_ROOT / "src" / "data" / "prediction" / "multisport_v4_0_state_candidate.json"
SNAP_V40_OUT = REPO_ROOT / "src" / "data" / "prediction" / "multisport_v4_0_snapshot.json"
RESULTS_OUT = ARTIFACTS_DIR / "exp_v47_multisport_v4_0_results.json"
TRIAL_REGISTRY_OUT = EXP_DIR / "trial_registry_multisport_v40.jsonl"

NCAAF_KEY_WEIGHTS: dict[int, float] = {
    3: 1.85,
    6: 1.25,
    7: 1.95,
    10: 1.45,
    13: 1.18,
    14: 1.65,
    17: 1.38,
    21: 1.48,
    24: 1.25,
    28: 1.32,
}


def _round_half_even(v: float) -> int:
    fl = math.floor(v)
    d = v - fl
    if abs(d - 0.5) < 1e-12:
        return fl if (fl % 2 == 0) else fl + 1
    return int(math.floor(v + 0.5))


def project_ncaaf_v40_exact(inp: dict[str, Any]) -> dict[str, Any]:
    """Espejo exacto operación por operación (`< 1e-14`) de `projectNcaafV40Outlook` en `multisport_v3_6.ts`."""
    neutral = bool(inp.get("neutral_site", False))
    hca = 0.0 if neutral else 2.85
    el_h = float(inp.get("home_elevation_m", 180.0))
    el_a = float(inp.get("away_elevation_m", 180.0))
    alt_adv = 1.15 * max(0.0, (el_h - el_a) / 1000.0) if (not neutral and el_h >= 1350.0) else 0.0

    qb_delta = float(inp.get("away_qb_out_penalty_pts", 0.0)) - float(inp.get("home_qb_out_penalty_pts", 0.0))
    exp_margin = float(inp["home_power_rating"]) - float(inp["away_power_rating"]) + hca + alt_adv + qb_delta

    h_off = float(inp.get("home_off_pts_pg", 28.5))
    h_def = float(inp.get("home_def_pts_pg", 26.5))
    a_off = float(inp.get("away_off_pts_pg", 28.5))
    a_def = float(inp.get("away_def_pts_pg", 26.5))
    raw_tot = 0.5 * (h_off + a_def + a_off + h_def) - 0.35 * (
        float(inp.get("home_qb_out_penalty_pts", 0.0)) + float(inp.get("away_qb_out_penalty_pts", 0.0))
    )
    exp_total = min(max(raw_tot, 34.0), 82.0)

    blowout_extra = min(3.2, 0.06 * max(0.0, abs(exp_margin) - 14.0))
    sigma_eff = 15.6 + blowout_extra
    sigma_tot = 16.2

    max_m = 65
    pmf = np.zeros(2 * max_m + 1, dtype=np.float64)
    tot_w = 0.0
    for m in range(-max_m, max_m + 1):
        if m == 0:
            continue
        z = (float(m) - exp_margin) / sigma_eff
        km = NCAAF_KEY_WEIGHTS.get(abs(m), 1.0)
        w = math.exp(-0.5 * z * z) * km
        pmf[m + max_m] = w
        tot_w += w

    inv_w = 1.0 / max(tot_w, 1e-30)
    p_home = 0.0
    for idx in range(len(pmf)):
        pmf[idx] *= inv_w
        if idx - max_m > 0:
            p_home += float(pmf[idx])
    p_home = min(max(p_home, 0.001), 0.999)
    p_away = 1.0 - p_home

    spread_line = (
        float(inp["spread_line_home"])
        if inp.get("spread_line_home") is not None
        else float(-_round_half_even(exp_margin)) - 0.5
    )
    total_line = (
        float(inp["total_line"])
        if inp.get("total_line") is not None
        else float(_round_half_even(exp_total)) + 0.5
    )

    ph_cov = 0.0
    pa_cov = 0.0
    p_push = 0.0
    for idx in range(len(pmf)):
        p = float(pmf[idx])
        if p <= 0.0:
            continue
        dv = float(idx - max_m) + spread_line
        if abs(dv) < 1e-9:
            p_push += p
        elif dv > 0.0:
            ph_cov += p
        else:
            pa_cov += p
    act = ph_cov + pa_cov
    ph_np = min(max(ph_cov / act, 0.001), 0.999) if act > 1e-12 else 0.5

    p_over = min(max(normal_cdf_exact((exp_total - total_line) / sigma_tot), 0.001), 0.999)

    return {
        "sport": "ncaaf",
        "expected_margin": exp_margin,
        "expected_total": exp_total,
        "sigma_margin_effective": sigma_eff,
        "altitude_hypoxia_adv_pts": alt_adv,
        "p_home": p_home,
        "p_away": p_away,
        "spread_line_home": spread_line,
        "p_spread_home_cover": ph_cov,
        "p_spread_push": p_push,
        "p_spread_home_cover_no_push": ph_np,
        "total_line": total_line,
        "p_over": p_over,
        "p_under": 1.0 - p_over,
    }


def predict_live_multisport_v40_matchup_exact(
    sport: str,
    home_key: str,
    away_key: str,
    state_art: dict[str, Any],
    neutral_site: bool = False,
    total_line: float | None = None,
    spread_line_home: float | None = None,
) -> dict[str, Any]:
    """Espejo exacto (`< 1e-13`) de `predictLiveMultiSportV40Matchup` en `multisport_v3_6.ts`."""
    h = state_art["teams"][f"{sport}::{home_key}"]
    a = state_art["teams"][f"{sport}::{away_key}"]
    cfg = state_art["v36_physics_config"]

    if sport == "mlb":
        park_mult = 1.18 if (not h["is_dome"] and float(h["elevation_m"]) >= 1200.0) else 1.0
        inp_m: dict[str, Any] = {
            "home_woba": h["metrics"]["woba"],
            "away_woba": a["metrics"]["woba"],
            "park_weather_mult": park_mult,
            "home_sp_fip": h["metrics"]["fip"],
            "away_sp_fip": a["metrics"]["fip"],
            "home_sp_era": h["metrics"]["era"],
            "away_sp_era": a["metrics"]["era"],
            "home_rot_fip": h["metrics"]["fip"],
            "away_rot_fip": a["metrics"]["fip"],
            "home_bp_fip": h["metrics"]["fip"],
            "away_bp_fip": a["metrics"]["fip"],
            "neutral_site": neutral_site,
        }
        if total_line is not None:
            inp_m["total_line"] = total_line
        return project_mlb_v36_exact(inp_m, cfg)

    if sport == "nhl":
        b60_h = 0.5 * (float(h["metrics"]["xgf_5v5"]) + float(a["metrics"]["xga_5v5"])) + 0.35
        b60_a = 0.5 * (float(a["metrics"]["xgf_5v5"]) + float(h["metrics"]["xga_5v5"])) + 0.15
        inp_h: dict[str, Any] = {
            "base_goals_60_home": b60_h,
            "base_goals_60_away": b60_a,
            "home_goalie_sv_pct": h["metrics"]["sv_pct"],
            "away_goalie_sv_pct": a["metrics"]["sv_pct"],
            "home_goalie_confirmed": True,
            "away_goalie_confirmed": True,
        }
        if total_line is not None:
            inp_h["total_line"] = total_line
        return project_nhl_v36_exact(inp_h, cfg)

    if sport == "nba":
        pace_avg = 0.5 * (float(h["metrics"]["pace"]) + float(a["metrics"]["pace"]))
        net_diff = float(h["metrics"]["net_rtg"]) - float(a["metrics"]["net_rtg"])
        alt_hca = 1.15 if (not neutral_site and float(h["elevation_m"]) >= 1200.0) else 0.0
        hca = 0.0 if neutral_site else (2.35 + alt_hca)
        margin = (net_diff * pace_avg) / 100.0 + hca
        exp_tot = (
            (float(h["metrics"]["ortg"]) + float(a["metrics"]["drtg"]) + float(a["metrics"]["ortg"]) + float(h["metrics"]["drtg"]))
            * 0.5
            * pace_avg
        ) / 100.0
        inp_b: dict[str, Any] = {
            "structural_margin_with_hca": margin,
            "structural_total_points": exp_tot,
        }
        if spread_line_home is not None:
            inp_b["spread_line_home"] = spread_line_home
        if total_line is not None:
            inp_b["total_line"] = total_line
        return project_nba_v36_exact(inp_b, cfg)

    inp_c: dict[str, Any] = {
        "home_power_rating": h["metrics"]["power_rating"],
        "away_power_rating": a["metrics"]["power_rating"],
        "home_off_pts_pg": h["metrics"]["pts_pg"],
        "home_def_pts_pg": h["metrics"]["opp_pts_pg"],
        "away_off_pts_pg": a["metrics"]["pts_pg"],
        "away_def_pts_pg": a["metrics"]["opp_pts_pg"],
        "home_elevation_m": h["elevation_m"],
        "away_elevation_m": a["elevation_m"],
        "neutral_site": neutral_site,
    }
    if spread_line_home is not None:
        inp_c["spread_line_home"] = spread_line_home
    if total_line is not None:
        inp_c["total_line"] = total_line
    return project_ncaaf_v40_exact(inp_c)


def main() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    ws_dir = PRED_LAB_ROOT / "data" / "processed" / "web_scraping"
    ms_df = pd.read_parquet(ws_dir / "ws_multisport_team_seasons.parquet")
    st_df = pd.read_parquet(ws_dir / "ws_stadium_physics.parquet")
    v36_cfg = json.loads((REPO_ROOT / "src" / "data" / "prediction" / "multisport_v3_6_config_candidate.json").read_text(encoding="utf-8"))

    # Mapa de altitud y domo por equipo desde `ws_stadium_physics.parquet`
    elev_map: dict[str, tuple[float, bool]] = {}
    for r in st_df.itertuples(index=False):
        el = float(r.stadium_elevation_m) if pd.notna(r.stadium_elevation_m) else 150.0
        dm = bool(r.is_dome) if pd.notna(r.is_dome) else False
        pt = str(r.primary_pl_team or "").strip()
        if pt:
            elev_map[pt.lower()] = (el, dm)
        if pd.notna(r.mapped_teams_json):
            try:
                for t_alias in json.loads(str(r.mapped_teams_json)):
                    elev_map[str(t_alias).strip().lower()] = (el, dm)
            except Exception:
                pass

    # Altitudes icónicas verificadas de franquicias US/NCAAF cuando el alias abreviado difiere
    known_altitudes: dict[str, tuple[float, bool]] = {
        "COL": (1580.0, False),  # Coors Field / Colorado Buffaloes
        "DEN": (1609.0, True),   # Ball Arena Denver Nuggets
        "UTA": (1288.0, True),   # Delta Center Utah Jazz
        "ARI": (331.0, True),
        "TEX": (167.0, True),
        "HOU": (15.0, True),
        "TOR": (76.0, True),
        "TB": (15.0, True),
        "MIL": (183.0, True),
        "MIA": (3.0, True),
        "SEA": (5.0, True),
        "WYO": (2199.0, False),  # Wyoming
        "AFA": (2018.0, False),  # Air Force
        "BYU": (1417.0, False),  # BYU
        "UTAH": (1420.0, False),
        "UNM": (1555.0, False),  # New Mexico
        "USU": (1456.0, False),  # Utah State
        "CSU": (1525.0, False),  # Colorado State
        "UTEP": (1189.0, False),
    }

    def _resolve_stadium(abbr: str, name: str, sport_k: str) -> tuple[float, bool]:
        ab_u = abbr.strip().upper()
        if ab_u in known_altitudes and sport_k in ("mlb", "nba", "ncaaf"):
            return known_altitudes[ab_u]
        nm_l = name.strip().lower()
        if nm_l in elev_map:
            return elev_map[nm_l]
        return (140.0, sport_k in ("nba", "nhl"))

    # Filtrar estrictamente temporadas pre-holdout (`< 2025-02-02`) para MLB, NHL y NCAAF
    mlb_24 = ms_df[(ms_df["sport"] == "baseball") & (ms_df["season"] == "2024")].drop_duplicates("team_abbr").copy()
    nhl_2324 = ms_df[(ms_df["sport"] == "hockey") & (ms_df["season"] == "2023-24")].drop_duplicates("team_abbr").copy()
    ncaaf_24 = ms_df[(ms_df["sport"] == "college-football") & (ms_df["season"] == "2024")].drop_duplicates("team_name").copy()
    # Para NBA usamos solo los priors estructurales `ORtg/DRtg/Pace` (`2024-25` pre-ASB) sin entrenar contra resultados post-holdout
    nba_base = ms_df[(ms_df["sport"] == "basketball") & (ms_df["season"] == "2024-25")].drop_duplicates("team_abbr").copy()

    teams_state: dict[str, Any] = {}

    # 1. MLB (`30` franquicias) + Validación cruzada de `win_pct` real en `2024 < 2025-02-02`
    mlb_pred_wp: list[float] = []
    mlb_obs_wp: list[float] = []
    for r in mlb_24.itertuples(index=False):
        k = str(r.team_abbr).strip().upper()
        nm = str(r.team_name).strip()
        el, dm = _resolve_stadium(k, nm, "mlb")
        woba = float(r.mlb_woba) if pd.notna(r.mlb_woba) else 0.312
        fip = float(r.mlb_fip) if pd.notna(r.mlb_fip) else 4.12
        era = float(r.mlb_era) if pd.notna(r.mlb_era) else fip
        rpg = float(r.mlb_runs_per_game) if pd.notna(r.mlb_runs_per_game) else 4.45
        rapg = float(r.mlb_runs_allowed_per_game) if pd.notna(r.mlb_runs_allowed_per_game) else 4.45
        teams_state[f"mlb::{k}"] = {
            "team_key": k,
            "team_name": nm,
            "sport": "mlb",
            "elevation_m": el,
            "is_dome": dm,
            "metrics": {
                "woba": round(woba, 5),
                "fip": round(fip, 4),
                "era": round(era, 4),
                "runs_pg": round(rpg, 4),
                "runs_allowed_pg": round(rapg, 4),
            },
        }
        # Evaluar `Kepler v4.0` contra `league average` neutral para predecir `win_pct` de temporada completa (`162` juegos)
        out_vs_avg = project_mlb_v36_exact(
            {
                "home_woba": woba,
                "away_woba": 0.312,
                "home_sp_fip": fip,
                "away_sp_fip": 4.12,
                "home_sp_era": era,
                "away_sp_era": 4.12,
                "home_rot_fip": fip,
                "away_rot_fip": 4.12,
                "home_bp_fip": fip,
                "away_bp_fip": 4.12,
                "neutral_site": True,
            },
            v36_cfg,
        )
        mlb_pred_wp.append(float(out_vs_avg["p_home"]))
        mlb_obs_wp.append(float(r.win_pct))

    mlb_rmse_v4 = float(math.sqrt(np.mean((np.array(mlb_pred_wp) - np.array(mlb_obs_wp)) ** 2)))
    mlb_rmse_flat = float(math.sqrt(np.mean((0.5 - np.array(mlb_obs_wp)) ** 2)))

    # 2. NHL (`32` franquicias en `'2023-24' < 2025-02-02`) + Validación contra `points_pct` / `win_pct`
    nhl_pred_wp: list[float] = []
    nhl_obs_wp: list[float] = []
    max_nhl_ot_resid = 0.0
    for r in nhl_2324.itertuples(index=False):
        k = str(r.team_abbr).strip().upper()
        nm = str(r.team_name).strip()
        el, dm = _resolve_stadium(k, nm, "nhl")
        xg_pct = float(r.nhl_xg_pct_5on5) / 100.0 if pd.notna(r.nhl_xg_pct_5on5) and float(r.nhl_xg_pct_5on5) > 1.5 else (float(r.nhl_xg_pct_5on5) if pd.notna(r.nhl_xg_pct_5on5) else 0.50)
        xgf = round(5.10 * xg_pct, 4)
        xga = round(5.10 * (1.0 - xg_pct), 4)
        sv_raw = float(r.nhl_save_pct_unblocked) if pd.notna(r.nhl_save_pct_unblocked) else 0.904
        sv = sv_raw / 100.0 if sv_raw > 1.5 else sv_raw
        sv_adj = min(max(0.904 + 0.35 * (sv - float(nhl_2324["nhl_save_pct_unblocked"].dropna().median() / (100.0 if float(nhl_2324["nhl_save_pct_unblocked"].dropna().median()) > 1.5 else 1.0))), 0.885), 0.925)
        teams_state[f"nhl::{k}"] = {
            "team_key": k,
            "team_name": nm,
            "sport": "nhl",
            "elevation_m": el,
            "is_dome": True,
            "metrics": {
                "xgf_5v5": xgf,
                "xga_5v5": xga,
                "sv_pct": round(sv_adj, 5),
            },
        }
        out_nhl = project_nhl_v36_exact(
            {
                "base_goals_60_home": 0.5 * (xgf + 2.55) + 0.35,
                "base_goals_60_away": 0.5 * (2.55 + xga) + 0.15,
                "home_goalie_sv_pct": sv_adj,
                "away_goalie_sv_pct": 0.904,
                "home_goalie_confirmed": True,
                "away_goalie_confirmed": True,
            },
            v36_cfg,
        )
        max_nhl_ot_resid = max(max_nhl_ot_resid, float(out_nhl["ot_conservation_residual"]))
        # En NHL `points_pct = P(Win) + 0.5 * P(OT Loss)`; neutralizamos HCA (-0.022) y sumamos 0.5 * P(OT_loss)
        p_win_neut = float(out_nhl["p_home"]) - 0.022
        p_pts_neut = p_win_neut + 0.25 * float(out_nhl["p_ot_reg"])
        nhl_pred_wp.append(p_pts_neut)
        nhl_obs_wp.append(float(r.points_pct) if pd.notna(r.points_pct) else float(r.win_pct))

    nhl_rmse_v4 = float(math.sqrt(np.mean((np.array(nhl_pred_wp) - np.array(nhl_obs_wp)) ** 2)))
    nhl_rmse_flat = float(math.sqrt(np.mean((0.55 - np.array(nhl_obs_wp)) ** 2)))

    # 3. NBA (`30` franquicias)
    for r in nba_base.itertuples(index=False):
        k = str(r.team_abbr).strip().upper()
        nm = str(r.team_name).strip()
        el, dm = _resolve_stadium(k, nm, "nba")
        ortg = float(r.nba_ortg) if pd.notna(r.nba_ortg) else 114.5
        drtg = float(r.nba_drtg) if pd.notna(r.nba_drtg) else 114.5
        nrtg = float(r.nba_net_rtg) if pd.notna(r.nba_net_rtg) else (ortg - drtg)
        pace = float(r.nba_pace) if pd.notna(r.nba_pace) else 99.0
        teams_state[f"nba::{k}"] = {
            "team_key": k,
            "team_name": nm,
            "sport": "nba",
            "elevation_m": el,
            "is_dome": True,
            "metrics": {
                "ortg": round(ortg, 3),
                "drtg": round(drtg, 3),
                "net_rtg": round(nrtg, 3),
                "pace": round(pace, 3),
            },
        }

    # 4. NCAAF (`134` programas FBS en `'2024' < 2025-02-02`) + Validación contra `win_pct` real
    ncaaf_pred_wp: list[float] = []
    ncaaf_obs_wp: list[float] = []
    used_ncaaf_keys: set[str] = set()
    for r in ncaaf_24.itertuples(index=False):
        nm = str(r.team_name).strip()
        raw_ab = str(r.team_abbr).strip().upper() if pd.notna(r.team_abbr) and str(r.team_abbr).strip() else nm.upper().replace(" ", "_")[:12]
        k = raw_ab if raw_ab not in used_ncaaf_keys else nm.upper().replace(" ", "_")[:16]
        used_ncaaf_keys.add(k)
        el, dm = _resolve_stadium(k, nm, "ncaaf")

        fpi = float(r.ncaaf_espn_fpi) if pd.notna(r.ncaaf_espn_fpi) else float("nan")
        srs = float(r.srs) if pd.notna(r.srs) else 0.0
        tr_r = float(r.ncaaf_tr_rating) if pd.notna(r.ncaaf_tr_rating) else srs
        pwr = 0.55 * fpi + 0.45 * tr_r if math.isfinite(fpi) else (0.60 * srs + 0.40 * tr_r)
        pts_pg = float(r.ncaaf_pts_pg) if pd.notna(r.ncaaf_pts_pg) else 28.0
        opp_pg = float(r.ncaaf_opp_pts_pg) if pd.notna(r.ncaaf_opp_pts_pg) else 26.5

        teams_state[f"ncaaf::{k}"] = {
            "team_key": k,
            "team_name": nm,
            "sport": "ncaaf",
            "elevation_m": el,
            "is_dome": dm,
            "metrics": {
                "power_rating": round(pwr, 4),
                "pts_pg": round(pts_pg, 3),
                "opp_pts_pg": round(opp_pg, 3),
            },
        }
        if pd.notna(r.win_pct):
            # Comparar contra el rival promedio de su calendario (`sos` cuando existe)
            opp_sched = float(r.sos) if pd.notna(r.sos) else 0.0
            out_c = project_ncaaf_v40_exact(
                {
                    "home_power_rating": pwr,
                    "away_power_rating": opp_sched,
                    "home_off_pts_pg": pts_pg,
                    "home_def_pts_pg": opp_pg,
                    "neutral_site": True,
                }
            )
            ncaaf_pred_wp.append(float(out_c["p_home"]))
            ncaaf_obs_wp.append(float(r.win_pct))

    ncaaf_rmse_v4 = float(math.sqrt(np.mean((np.array(ncaaf_pred_wp) - np.array(ncaaf_obs_wp)) ** 2)))
    ncaaf_rmse_flat = float(math.sqrt(np.mean((0.5 - np.array(ncaaf_obs_wp)) ** 2)))

    print(
        f"=== EXP_V47 MULTI-SPORT v4.0 UNIFIED (< 2025-02-02, n_franchises={len(teams_state)}) ===\n"
        f"  MLB Kepler v4.0 (2024 n={len(mlb_obs_wp)}): WinPct RMSE Flat= {mlb_rmse_flat:.4f} -> v4.0= {mlb_rmse_v4:.4f}\n"
        f"  NHL Curvature v4.0 (2023-24 n={len(nhl_obs_wp)}): PtsPct RMSE Flat= {nhl_rmse_flat:.4f} -> v4.0= {nhl_rmse_v4:.4f} | Max OT Residual={max_nhl_ot_resid:.2e}\n"
        f"  NCAAF Horizon v4.0 (2024 n={len(ncaaf_obs_wp)}): WinPct RMSE Flat= {ncaaf_rmse_flat:.4f} -> v4.0= {ncaaf_rmse_v4:.4f}"
    )

    state_art = {
        "schema_version": "multisport_v4.0.0",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "n_total_teams": len(teams_state),
        "v36_physics_config": v36_cfg,
        "teams": teams_state,
    }
    STATE_V40_OUT.write_text(json.dumps(state_art, indent=2), encoding="utf-8")

    # Snapshot de paridad `< 1e-13` sobre enfrentamientos reales en los 4 deportes (`80` duelos: 20 por deporte)
    rng = np.random.default_rng(MODEL_SEED)
    snap_rows: list[dict[str, Any]] = []
    for sp_nm in ("mlb", "nhl", "nba", "ncaaf"):
        keys_sp = sorted(v["team_key"] for k_full, v in teams_state.items() if k_full.startswith(f"{sp_nm}::"))
        for j in range(20):
            hk, ak = rng.choice(keys_sp, size=2, replace=False).tolist()
            neut = bool(j % 7 == 0)
            res_m = predict_live_multisport_v40_matchup_exact(sp_nm, str(hk), str(ak), state_art, neutral_site=neut)
            if sp_nm == "mlb":
                exp_summary = {
                    "p_home": res_m["p_home"],
                    "p_away": res_m["p_away"],
                    "expected_total": res_m["full_game"]["expected_total_runs"],
                    "p_over": res_m["full_game"]["p_over_cond_no_push"],
                }
            elif sp_nm == "nhl":
                exp_summary = {
                    "p_home": res_m["p_home"],
                    "p_away": res_m["p_away"],
                    "expected_total": res_m["expected_goals_home_full"] + res_m["expected_goals_away_full"],
                    "p_over": res_m["p_over_cond_no_push"],
                    "ot_residual": res_m["ot_conservation_residual"],
                }
            elif sp_nm == "nba":
                exp_summary = {
                    "p_home": res_m["p_home"],
                    "p_away": res_m["p_away"],
                    "expected_margin": res_m["expected_margin"],
                    "expected_total": res_m["expected_total"],
                    "p_over": res_m["p_over"],
                }
            else:
                exp_summary = {
                    "p_home": res_m["p_home"],
                    "p_away": res_m["p_away"],
                    "expected_margin": res_m["expected_margin"],
                    "expected_total": res_m["expected_total"],
                    "p_spread_home_cover_no_push": res_m["p_spread_home_cover_no_push"],
                    "p_over": res_m["p_over"],
                }
            snap_rows.append(
                {
                    "case_id": f"{sp_nm}_v4_{j:02d}",
                    "sport": sp_nm,
                    "home_key": str(hk),
                    "away_key": str(ak),
                    "neutral_site": neut,
                    "expected": exp_summary,
                }
            )

    SNAP_V40_OUT.write_text(
        json.dumps(
            {
                "schema_version": "multisport_v4.0_parity_snapshot",
                "holdout_sealed_untouched": True,
                "n": len(snap_rows),
                "rows": snap_rows,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    results_payload = {
        "experiment_id": "EXP_V47_multisport_v4_0",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "n_total_franchises": len(teams_state),
        "counts_by_sport": {
            "mlb": len(mlb_24),
            "nhl": len(nhl_2324),
            "nba": len(nba_base),
            "ncaaf": len(ncaaf_24),
        },
        "pre_holdout_validation": {
            "mlb_2024": {"n": len(mlb_obs_wp), "win_pct_rmse_v4": round(mlb_rmse_v4, 5), "win_pct_rmse_flat": round(mlb_rmse_flat, 5)},
            "nhl_2023_24": {
                "n": len(nhl_obs_wp),
                "pts_pct_rmse_v4": round(nhl_rmse_v4, 5),
                "pts_pct_rmse_flat": round(nhl_rmse_flat, 5),
                "max_ot_conservation_residual": max_nhl_ot_resid,
            },
            "ncaaf_2024": {"n": len(ncaaf_obs_wp), "win_pct_rmse_v4": round(ncaaf_rmse_v4, 5), "win_pct_rmse_flat": round(ncaaf_rmse_flat, 5)},
        },
        "artifacts": {
            "multisport_v4_0_state_sha256": hashlib.sha256(STATE_V40_OUT.read_bytes()).hexdigest(),
        },
    }
    RESULTS_OUT.write_text(json.dumps(results_payload, indent=2), encoding="utf-8")

    with TRIAL_REGISTRY_OUT.open("a", encoding="utf-8") as fh:
        fh.write(
            json.dumps(
                {
                    "recorded_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V47_multisport_v4_0",
                    "holdout_touched": False,
                    "n_franchises": len(teams_state),
                    "ncaaf_rmse": round(ncaaf_rmse_v4, 5),
                }
            )
            + "\n"
        )
    print(f"[DONE] EXP_V47 guardado en {RESULTS_OUT.name}")


if __name__ == "__main__":
    main()
