"""Exporta `src/data/prediction/club_free_open_state_v3_4.json` con los acumuladores causales vivos (`2026`)
por club y división para que `club_v3_3.ts` pueble `52 / 52 = 100.0%` de las features de
`PitchLab Tachyon v3.4 Live-Complete` en `< 0.1 ms` sin I/O de red (con pesos congelados en `< 2025-02-02`)."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys
from typing import Any, Mapping

import pandas as pd

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"

for _p in (str(REPO_ROOT), str(PRED_LAB_ROOT / "models" / "a"), str(EXP_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from club_free_sources import (  # noqa: E402
    HOLDOUT_CUT_DATE,
    CausalClubTransfermarktBridge,
    calibrate_statsbomb_p1_1_shot_xg,
)
from club_wave2_sources import CausalClubWave2Bridge  # noqa: E402
from run_club_experiment import BASE_113_FEATURES, LIVE_V30_POPULATED_SET, SB_1_COL, TM_6_COLS  # noqa: E402
from run_club_v3_4_experiment import ALL_W2_CLUB_COLS  # noqa: E402

CLUB_STATE_JSON_OUT = REPO_ROOT / "src" / "data" / "prediction" / "club_free_open_state_v3_4.json"
LIVE_BASE_38_ORDERED: tuple[str, ...] = tuple(c for c in BASE_113_FEATURES if c in LIVE_V30_POPULATED_SET)
FREE_OPEN_14_ORDERED: tuple[str, ...] = SB_1_COL + TM_6_COLS + ALL_W2_CLUB_COLS


def compute_live_club_free_14_vector(
    *,
    div: str,
    home_team: str,
    away_team: str,
    elo_diff_no_hfa: float,
    h_div_change: float,
    a_div_change: float,
    club_state_art: Mapping[str, Any],
) -> list[float]:
    """Calcula de forma determinista las `14` features abiertas de `Tachyon v3.4` desde `club_free_open_state_v3_4.json`
    con paridad IEEE-754 `< 1e-12` frente a `club_v3_3.ts`."""
    clubs = club_state_art["clubs"]
    div_meds = club_state_art["div_ewm_log_val"]
    div_xi_meds = club_state_art["div_ewm_xi_val"]

    hk = f"{div}::{home_team}"
    ak = f"{div}::{away_team}"
    sh = clubs.get(hk, {})
    sa = clubs.get(ak, {})

    eh = 1525.0 + 0.5 * float(elo_diff_no_hfa)
    ea = 1525.0 - 0.5 * float(elo_diff_no_hfa)
    elo_rel_h = (eh - 1525.0) / 145.0
    elo_rel_a = (ea - 1525.0) / 145.0

    sb_diff = float(sh.get("sb_xg_ewm8", 0.0)) - float(sa.get("sb_xg_ewm8", 0.0))

    has_h = float(sh.get("tm_has_val", 0.0)) > 0.0
    has_a = float(sa.get("tm_has_val", 0.0)) > 0.0
    cur_div_med = float(div_meds.get(div, 3.80))

    if has_h and has_a:
        rel_h = float(sh["tm_raw_log_val"]) - cur_div_med
        rel_a = float(sa["tm_raw_log_val"]) - cur_div_med
        val_diff = float(sh["tm_raw_log_val"]) - float(sa["tm_raw_log_val"])
        depth_diff = float(sh["tm_depth_ratio"]) - float(sa["tm_depth_ratio"])
        gap_diff = (rel_h - elo_rel_h) - (rel_a - elo_rel_a)
    elif has_h and not has_a:
        rel_h = float(sh["tm_raw_log_val"]) - cur_div_med
        imp_a = -0.35 + 0.30 * elo_rel_a
        rel_a = imp_a
        val_diff = 0.65 * (rel_h - imp_a)
        depth_diff = 0.50 * (float(sh["tm_depth_ratio"]) - 0.26)
        gap_diff = 0.65 * (rel_h - elo_rel_h)
    elif has_a and not has_h:
        rel_a = float(sa["tm_raw_log_val"]) - cur_div_med
        imp_h = -0.35 + 0.30 * elo_rel_h
        rel_h = imp_h
        val_diff = 0.65 * (imp_h - rel_a)
        depth_diff = 0.50 * (0.26 - float(sa["tm_depth_ratio"]))
        gap_diff = -0.65 * (rel_a - elo_rel_a)
    else:
        rel_h, rel_a, val_diff, depth_diff, gap_diff = 0.0, 0.0, 0.0, 0.0, 0.0

    prom_boost_diff = float(h_div_change) * rel_h - float(a_div_change) * rel_a
    new_mgr_diff = float(sh.get("tm_new_mgr_flag", 0.0)) - float(sa.get("tm_new_mgr_flag", 0.0))
    mgr_pae_diff = float(sh.get("tm_mgr_pae", 0.0)) - float(sa.get("tm_mgr_pae", 0.0))

    cup_adv = float(sa.get("midweek_cup_load", 0.0)) - float(sh.get("midweek_cup_load", 0.0))
    g14_adv = float(sa.get("games_14d_allcomps", 1.5)) - float(sh.get("games_14d_allcomps", 1.5))

    hx = float(sh.get("has_realized_xi", 0.0)) > 0.0
    ax = float(sa.get("has_realized_xi", 0.0)) > 0.0
    cur_xi_med = float(div_xi_meds.get(div, 3.20))

    if hx and ax:
        xi_val_diff = float(sh["realized_xi_log_val"]) - float(sa["realized_xi_log_val"])
        avail_diff = float(sh["injury_avail_ratio"]) - float(sa["injury_avail_ratio"])
        ga90_diff = float(sh["xi_ga90_allcomps"]) - float(sa["xi_ga90_allcomps"])
    elif hx and not ax:
        xi_val_diff = 0.55 * ((float(sh["realized_xi_log_val"]) - cur_xi_med) - (-0.30))
        avail_diff = 0.55 * (float(sh["injury_avail_ratio"]) - 0.85)
        ga90_diff = 0.55 * (float(sh["xi_ga90_allcomps"]) - 2.10)
    elif ax and not hx:
        xi_val_diff = 0.55 * ((-0.30) - (float(sa["realized_xi_log_val"]) - cur_xi_med))
        avail_diff = 0.55 * (0.85 - float(sa["injury_avail_ratio"]))
        ga90_diff = 0.55 * (2.10 - float(sa["xi_ga90_allcomps"]))
    else:
        xi_val_diff, avail_diff, ga90_diff = 0.0, 0.0, 0.0

    net_tr_diff = float(sh.get("net_transfer_val_120d", 0.0)) - float(sa.get("net_transfer_val_120d", 0.0))
    in_fee_diff = float(sh.get("inbound_fee_120d", 0.0)) - float(sa.get("inbound_fee_120d", 0.0))

    return [
        sb_diff,
        val_diff,
        depth_diff,
        gap_diff,
        prom_boost_diff,
        new_mgr_diff,
        mgr_pae_diff,
        cup_adv,
        g14_adv,
        xi_val_diff,
        avail_diff,
        ga90_diff,
        net_tr_diff,
        in_fee_diff,
    ]


def main() -> None:
    sb_cal = calibrate_statsbomb_p1_1_shot_xg(max_matches_sample=180)
    matches_p = PRED_LAB_ROOT / "data" / "processed" / "matches.parquet"
    m_df = pd.read_parquet(matches_p)
    m_df["match_date"] = pd.to_datetime(m_df["match_date"])
    m_df = m_df[m_df["result"].notna()].sort_values(["match_date", "kickoff_time", "match_id"], kind="mergesort").reset_index(drop=True)

    # Acumular `sb_xg_ewm8` sobre el historial observado completo (los pesos del modelo ya están congelados en `< 2025-02-02`)
    bh, ba = sb_cal["home"], sb_cal["away"]
    alpha8 = 2.0 / 9.0
    sb_ewm: dict[str, float] = {}
    latest_season_by_div: dict[str, str] = {}
    active_clubs: dict[str, tuple[str, str, int]] = {}  # key -> (div, team_name, last_ord)

    for r in m_df.itertuples(index=False):
        dv = str(r.div)
        ht = str(r.home_team)
        at = str(r.away_team)
        hk = f"{dv}::{ht}"
        ak = f"{dv}::{at}"
        d_ord = r.match_date.toordinal()
        latest_season_by_div[dv] = str(r.season)
        active_clubs[hk] = (dv, ht, d_ord)
        active_clubs[ak] = (dv, at, d_ord)

        sh_h = float(r.shots_home) if pd.notna(r.shots_home) else float("nan")
        sh_a = float(r.shots_away) if pd.notna(r.shots_away) else float("nan")
        sot_h = float(r.sot_home) if pd.notna(r.sot_home) else float("nan")
        sot_a = float(r.sot_away) if pd.notna(r.sot_away) else float("nan")
        cor_h = float(r.corners_home) if pd.notna(r.corners_home) else 4.8
        cor_a = float(r.corners_away) if pd.notna(r.corners_away) else 4.0
        hg = float(r.home_goals)
        ag = float(r.away_goals)

        if math.isfinite(sot_h) and math.isfinite(sot_a) and math.isfinite(sh_h) and math.isfinite(sh_a):
            xgh = bh["intercept"] + bh["w_sot"] * sot_h + bh["w_soff"] * max(0.0, sh_h - sot_h) + bh["w_corners"] * cor_h
            xga = ba["intercept"] + ba["w_sot"] * sot_a + ba["w_soff"] * max(0.0, sh_a - sot_a) + ba["w_corners"] * cor_a
            xgd = max(-4.0, min(4.0, xgh - xga))
        else:
            xgd = 0.65 * max(-4.0, min(4.0, hg - ag))

        sb_ewm[hk] = (1.0 - alpha8) * sb_ewm.get(hk, 0.0) + alpha8 * xgd
        sb_ewm[ak] = (1.0 - alpha8) * sb_ewm.get(ak, 0.0) - alpha8 * xgd

    # Retener clubes activos en los últimos 3 años (~750 clubes en las 23 divisiones)
    max_ord_obs = int(m_df["match_date"].max().toordinal())
    min_active_ord = max_ord_obs - 1095

    tm_live = CausalClubTransfermarktBridge(max_date_exclusive=None)
    w2_live = CausalClubWave2Bridge(max_date_exclusive=None)
    ref_ord = max_ord_obs + 1

    clubs_out: dict[str, dict[str, Any]] = {}
    div_vals_acc: dict[str, list[float]] = {}
    div_xi_acc: dict[str, list[float]] = {}

    for ck in sorted(active_clubs.keys()):
        dv, tname, last_o = active_clubs[ck]
        if last_o < min_active_ord:
            continue
        tm_m = tm_live.lookup_prematch_club_tm(dv, tname, ref_ord, 1525.0)
        cid = tm_live.resolve_club_id(dv, tname)
        w2_m = w2_live.lookup_club_wave2(cid, ref_ord)
        if tm_m["tm_has_val"] > 0.0:
            div_vals_acc.setdefault(dv, []).append(float(tm_m["tm_raw_log_val"]))
        if w2_m["has_realized_xi"] > 0.0:
            div_xi_acc.setdefault(dv, []).append(float(w2_m["realized_xi_log_val"]))

        clubs_out[ck] = {
            "div": dv,
            "team": tname,
            "tm_club_id": cid,
            "sb_xg_ewm8": round(float(sb_ewm.get(ck, 0.0)), 6),
            "tm_has_val": float(tm_m["tm_has_val"]),
            "tm_raw_log_val": round(float(tm_m["tm_raw_log_val"]), 6),
            "tm_depth_ratio": round(float(tm_m["tm_depth_ratio"]), 6),
            "tm_new_mgr_flag": float(tm_m["tm_new_mgr_flag"]),
            "tm_mgr_pae": round(float(tm_m["tm_mgr_pae"]), 6),
            "midweek_cup_load": round(float(w2_m["midweek_cup_load"]), 4),
            "games_14d_allcomps": round(float(w2_m["games_14d_allcomps"]), 4),
            "has_realized_xi": float(w2_m["has_realized_xi"]),
            "realized_xi_log_val": round(float(w2_m["realized_xi_log_val"]), 6),
            "injury_avail_ratio": round(float(w2_m["injury_avail_ratio"]), 6),
            "xi_ga90_allcomps": round(float(w2_m["xi_ga90_allcomps"]), 6),
            "net_transfer_val_120d": round(float(w2_m["net_transfer_val_120d"]), 6),
            "inbound_fee_120d": round(float(w2_m["inbound_fee_120d"]), 6),
        }

    div_meds_out = {dv: round(float(pd.Series(vs).median()), 6) for dv, vs in sorted(div_vals_acc.items()) if vs}
    div_xi_out = {dv: round(float(pd.Series(vs).median()), 6) for dv, vs in sorted(div_xi_acc.items()) if vs}

    payload = {
        "schema_version": "club_free_open_state_v3.4.0",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "weights_trained_strictly_before": HOLDOUT_CUT_DATE,
        "max_observed_match_date": str(m_df["match_date"].max())[:10],
        "n_active_clubs": len(clubs_out),
        "live_base_38_features": list(LIVE_BASE_38_ORDERED),
        "free_open_14_features": list(FREE_OPEN_14_ORDERED),
        "div_ewm_log_val": div_meds_out,
        "div_ewm_xi_val": div_xi_out,
        "clubs": clubs_out,
    }
    CLUB_STATE_JSON_OUT.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    sha = hashlib.sha256(CLUB_STATE_JSON_OUT.read_bytes()).hexdigest()
    print(f"[EXPORTED] club_free_open_state_v3_4.json clubs={len(clubs_out)} sha256={sha}")


if __name__ == "__main__":
    main()
