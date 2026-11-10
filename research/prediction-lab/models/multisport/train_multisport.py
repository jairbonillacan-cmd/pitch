#!/usr/bin/env python3
"""Entrenamiento causal S-1 -> S e inferencia determinista de Spacetime Multi-Sport v3.0.

Motores incluidos (0 data leakage temporal, paridad IEEE-754 |Δ| < 1e-12 con `multisport.ts`):
  1. NHL (`PitchLab Curvature NHL v3.0`, 32 equipos)
  2. MLB (`PitchLab Kepler MLB v3.0`, 30 equipos)
  3. NBA (`PitchLab Tensor NBA v3.0`, 30 equipos)
  4. NCAAF (`PitchLab Horizon NCAAF v3.0`, 138 programas FBS)
"""
from __future__ import annotations

import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge

MULTISPORT_VERSION = "3.0.0"
MULTISPORT_SUITE_CODENAME = "PitchLab Spacetime Multi-Sport v3.0"
MULTISPORT_CODENAMES: dict[str, str] = {
    "nhl": "PitchLab Curvature NHL v3.0",
    "mlb": "PitchLab Kepler MLB v3.0",
    "nba": "PitchLab Tensor NBA v3.0",
    "ncaaf": "PitchLab Horizon NCAAF v3.0",
}

ROOT_PL = Path(__file__).resolve().parents[2]
WORKTREE_ROOT = ROOT_PL.parents[1]
WEB_SCRAPING_ROOT = WORKTREE_ROOT.parent / "web-scraping"
SEED = 20261110


# ============================================================================
# Primitivas matemáticas IEEE-754 exactas (espejo 1:1 con `multisport.ts`)
# ============================================================================

def clamp(val: float, lo: float, hi: float) -> float:
    if val < lo:
        return lo
    if val > hi:
        return hi
    return val


def logistic(z: float) -> float:
    zc = clamp(z, -35.0, 35.0)
    return 1.0 / (1.0 + math.exp(-zc))


def logit_fn(p: float) -> float:
    pc = clamp(p, 1e-6, 1.0 - 1e-6)
    return math.log(pc / (1.0 - pc))


def safe_pow(base: float, exp_val: float) -> float:
    b = max(base, 1e-9)
    return math.exp(exp_val * math.log(b))


def log5(pa: float, pb: float) -> float:
    x = clamp(pa, 0.001, 0.999)
    y = clamp(pb, 0.001, 0.999)
    denom = x + y - 2.0 * x * y
    if denom <= 1e-12:
        return 0.5
    return (x - x * y) / denom


def normal_cdf(x: float) -> float:
    """Aproximación racional Abramowitz & Stegun 7.1.26 idéntica bit a bit a TypeScript."""
    sign = -1.0 if x < 0.0 else 1.0
    z = abs(x) * 0.7071067811865475
    t = 1.0 / (1.0 + 0.3275911 * z)
    poly = (
        (((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592
    ) * t
    erf_val = sign * (1.0 - poly * math.exp(-(z * z)))
    return 0.5 * (1.0 + erf_val)


def _num(val: Any, fallback: float | None = None) -> float | None:
    if val is None or isinstance(val, bool):
        return fallback
    try:
        f = float(val)
        return f if math.isfinite(f) else fallback
    except (TypeError, ValueError):
        return fallback


def _slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", str(text).lower().strip())
    return s.strip("_")


def canonical_franchise_key(sport: str, team_name: str, team_abbr: str = "") -> str:
    n = str(team_name or "").lower().strip()
    ab = str(team_abbr or "").upper().strip()
    if sport == "nhl":
        if ab in ("ARI", "UTA") or "coyotes" in n or "utah" in n or "mammoth" in n:
            return "nhl_uta"
        if ab:
            return f"nhl_{ab.lower()}"
        return f"nhl_{_slug(n)}"
    if sport == "mlb":
        if ab in ("OAK", "ATH") or "athletics" in n:
            return "mlb_ath"
        if ab:
            return f"mlb_{ab.lower()}"
        return f"mlb_{_slug(n)}"
    if sport == "nba":
        if ab:
            return f"nba_{ab.lower()}"
        return f"nba_{_slug(n)}"
    return f"ncaaf_{_slug(n)}"


# ============================================================================
# Carga de datos normalizados (web_scraping + read-only normalized JSON)
# ============================================================================

def load_normalized_sources() -> dict[str, Any]:
    ws_dir = ROOT_PL / "data" / "processed" / "web_scraping"
    seasons_pq = pd.read_parquet(ws_dir / "ws_multisport_team_seasons.parquet")
    stadiums_pq = pd.read_parquet(ws_dir / "ws_stadium_physics.parquet")
    live_ctx = json.loads((ws_dir / "ws_live_inference_context.json").read_text(encoding="utf-8"))

    xg_path = WEB_SCRAPING_ROOT / "data" / "normalized" / "xg_and_team_ratings.json"
    ra_path = WEB_SCRAPING_ROOT / "data" / "normalized" / "roster_availability.json"
    ne_path = WEB_SCRAPING_ROOT / "data" / "normalized" / "news_and_environment.json"

    xg_records = json.loads(xg_path.read_text(encoding="utf-8"))["records"] if xg_path.exists() else []
    ra_records = json.loads(ra_path.read_text(encoding="utf-8"))["records"] if ra_path.exists() else []
    ne_records = json.loads(ne_path.read_text(encoding="utf-8"))["records"] if ne_path.exists() else []

    return {
        "seasons_pq": seasons_pq,
        "stadiums_pq": stadiums_pq,
        "live_ctx": live_ctx,
        "xg_records": xg_records,
        "ra_records": ra_records,
        "ne_records": ne_records,
    }


def _fit_standardized_ridge(
    X: np.ndarray,
    y: np.ndarray,
    alpha: float,
    sample_weight: np.ndarray | None = None,
) -> dict[str, Any]:
    mean = np.mean(X, axis=0)
    scale = np.std(X, axis=0)
    scale = np.where(scale < 1e-8, 1.0, scale)
    Xs = (X - mean) / scale
    reg = Ridge(alpha=alpha, fit_intercept=True, random_state=SEED)
    reg.fit(Xs, y, sample_weight=sample_weight)
    return {
        "alpha": float(alpha),
        "mean": [float(v) for v in mean],
        "scale": [float(v) for v in scale],
        "coef": [float(v) for v in reg.coef_],
        "intercept": float(reg.intercept_),
    }


def _predict_linear(model_spec: Mapping[str, Any], x_vec: list[float] | np.ndarray) -> float:
    mean = model_spec["mean"]
    scale = model_spec["scale"]
    coef = model_spec["coef"]
    acc = float(model_spec["intercept"])
    for i in range(len(coef)):
        acc += float(coef[i]) * ((float(x_vec[i]) - float(mean[i])) / float(scale[i]))
    return acc


# ============================================================================
# Métricas Out-of-Sample S-1 -> S + Bootstrap 95% CI
# ============================================================================

def compute_season_oos_metrics(
    y_true_win_pct: np.ndarray,
    y_pred_win_pct: np.ndarray,
    games_played: np.ndarray,
    baseline_naive: np.ndarray,
    baseline_legacy: np.ndarray,
    n_boot: int = 2000,
    seed: int = SEED,
) -> dict[str, Any]:
    p_pred = np.clip(y_pred_win_pct, 1e-4, 1.0 - 1e-4)
    p_naive = np.clip(baseline_naive, 1e-4, 1.0 - 1e-4)
    p_leg = np.clip(baseline_legacy, 1e-4, 1.0 - 1e-4)
    y = np.clip(y_true_win_pct, 0.0, 1.0)
    gp = np.maximum(games_played.astype(float), 1.0)

    def _eval_vec(yt: np.ndarray, yp: np.ndarray, w: np.ndarray) -> dict[str, float]:
        err = yp - yt
        rmse = float(np.sqrt(np.average(err * err, weights=w)))
        mae = float(np.average(np.abs(err), weights=w))
        if len(yt) > 2 and np.std(yp) > 1e-9 and np.std(yt) > 1e-9:
            pearson_r = float(np.corrcoef(yt, yp)[0, 1])
        else:
            pearson_r = 0.0
        # Binomial game-level Log-Loss & Brier across all team-games in season S:
        # E[-(y*log(p) + (1-y)*log(1-p))] y E[y*(1-p)^2 + (1-y)*p^2]
        ll_team = -(yt * np.log(yp) + (1.0 - yt) * np.log(1.0 - yp))
        brier_team = yt * ((1.0 - yp) ** 2) + (1.0 - yt) * (yp ** 2)
        return {
            "rmse_win_pct": rmse,
            "mae_win_pct": mae,
            "pearson_r": pearson_r,
            "game_log_loss": float(np.average(ll_team, weights=w)),
            "game_brier": float(np.average(brier_team, weights=w)),
            "team_win_pct_brier": float(np.average(err * err, weights=w)),
        }

    m_model = _eval_vec(y, p_pred, gp)
    m_naive = _eval_vec(y, p_naive, gp)
    m_legacy = _eval_vec(y, p_leg, gp)

    rng = np.random.default_rng(seed)
    n = len(y)
    boot_rmse, boot_ll, boot_brier, boot_r = [], [], [], []
    boot_delta_ll_naive, boot_delta_ll_legacy = [], []
    boot_delta_rmse_naive, boot_delta_rmse_legacy = [], []
    for _ in range(n_boot):
        idx = rng.integers(0, n, size=n)
        yb, pb, pnb, plb, wb = y[idx], p_pred[idx], p_naive[idx], p_leg[idx], gp[idx]
        mb = _eval_vec(yb, pb, wb)
        mnb = _eval_vec(yb, pnb, wb)
        mlb = _eval_vec(yb, plb, wb)
        boot_rmse.append(mb["rmse_win_pct"])
        boot_ll.append(mb["game_log_loss"])
        boot_brier.append(mb["game_brier"])
        boot_r.append(mb["pearson_r"])
        boot_delta_ll_naive.append(mb["game_log_loss"] - mnb["game_log_loss"])
        boot_delta_ll_legacy.append(mb["game_log_loss"] - mlb["game_log_loss"])
        boot_delta_rmse_naive.append(mb["rmse_win_pct"] - mnb["rmse_win_pct"])
        boot_delta_rmse_legacy.append(mb["rmse_win_pct"] - mlb["rmse_win_pct"])

    def _ci(arr: list[float]) -> list[float]:
        q = np.percentile(arr, [2.5, 97.5])
        return [round(float(q[0]), 6), round(float(q[1]), 6)]

    return {
        "n_team_seasons": int(n),
        "total_team_games": int(np.sum(gp)),
        "model": {k: round(v, 6) for k, v in m_model.items()},
        "naive_win_pct_s1": {k: round(v, 6) for k, v in m_naive.items()},
        "legacy_static_heuristic": {k: round(v, 6) for k, v in m_legacy.items()},
        "bootstrap_95_ci": {
            "rmse_win_pct": _ci(boot_rmse),
            "game_log_loss": _ci(boot_ll),
            "game_brier": _ci(boot_brier),
            "pearson_r": _ci(boot_r),
            "delta_log_loss_vs_naive": _ci(boot_delta_ll_naive),
            "delta_log_loss_vs_legacy": _ci(boot_delta_ll_legacy),
            "delta_rmse_vs_naive": _ci(boot_delta_rmse_naive),
            "delta_rmse_vs_legacy": _ci(boot_delta_rmse_legacy),
        },
    }


# ============================================================================
# Entrenamiento de los 4 Motores S-1 -> S
# ============================================================================

def _build_stadium_lookup(stadiums_pq: pd.DataFrame, live_ctx: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    by_team: dict[str, dict[str, Any]] = {}
    for _, r in stadiums_pq.iterrows():
        lg = str(r["league"]).lower()
        info = {
            "stadium_name": str(r["stadium_name"]) if pd.notna(r["stadium_name"]) else "",
            "stadium_elevation_m": float(r["stadium_elevation_m"]) if pd.notna(r["stadium_elevation_m"]) else 100.0,
            "structural_pressure_hpa": float(r["structural_pressure_hpa"]) if pd.notna(r["structural_pressure_hpa"]) else 1001.0,
            "roof_type": str(r["roof_type"]) if pd.notna(r["roof_type"]) else "open",
            "is_dome": bool(r["is_dome"]) if pd.notna(r["is_dome"]) else False,
        }
        for t in json.loads(str(r["mapped_teams_json"])):
            by_team[f"{lg}:{_slug(t)}"] = info

    for t in live_ctx.get("teams", []):
        lg = str(t.get("league", "")).lower()
        if lg not in ("nhl", "mlb", "nba", "ncaaf"):
            continue
        elev = _num(t.get("stadium_elevation_m"), 120.0) or 120.0
        pres = _num(t.get("structural_pressure_hpa"), _num(t.get("surface_pressure_hpa")))
        if pres is None:
            pres = 1013.25 * math.exp(-elev / 8434.5)
        roof = str(t.get("roof_type") or ("indoor_arena" if lg in ("nhl", "nba") else "open")).lower()
        is_dome = roof in ("dome", "indoor", "closed", "indoor_arena")
        info = {
            "stadium_name": str(t.get("stadium_name") or ""),
            "stadium_elevation_m": float(elev),
            "structural_pressure_hpa": float(pres),
            "roof_type": roof,
            "is_dome": is_dome,
            "max_wind_speed_mph_7d": float(_num(t.get("max_wind_speed_mph_7d"), 0.0) or 0.0),
            "total_precipitation_mm_7d": float(_num(t.get("total_precipitation_mm_7d"), 0.0) or 0.0),
        }
        for alias in (t.get("team_id"), t.get("team_name"), t.get("pl_team")):
            if alias:
                by_team[f"{lg}:{_slug(str(alias))}"] = info
    return by_team


def _build_injury_and_starter_lookup(ra_records: list[dict[str, Any]]) -> dict[str, Any]:
    injuries: dict[str, dict[str, int]] = {}
    starters: dict[str, list[dict[str, Any]]] = {}

    for r in ra_records:
        lg = str(r.get("league") or "").lower()
        rt = str(r.get("record_type") or "")
        if lg not in ("nhl", "mlb", "nba", "ncaaf"):
            continue
        raw_team = str(r.get("team") or "").split("\n")[0].strip()
        if not raw_team:
            continue
        key = f"{lg}:{_slug(raw_team)}"

        if rt == "multisport_player_injury":
            bucket = injuries.setdefault(key, {"out": 0, "questionable": 0, "qb_out": 0})
            st = str(r.get("game_status_designation") or r.get("status") or "").lower()
            pos = str(r.get("position") or "").upper()
            notes = str(r.get("notes") or "").lower()
            # Filtrar IL de 60 días puramente procedimental cuando ya está fuera toda la campaña
            is_60d_proc = "60-day" in notes and "merely procedural" in notes
            if any(k in st for k in ("out", "ir", "injured reserve", "10-day", "15-day")) and not is_60d_proc:
                bucket["out"] += 1
                if lg == "ncaaf" and pos == "QB" and "hasn't seen the field" not in notes:
                    bucket["qb_out"] = 1
            elif any(k in st for k in ("doubtful", "questionable", "game time", "day-to-day", "dtd")):
                bucket["questionable"] += 1

        elif rt == "multisport_probable_starter":
            lst = starters.setdefault(key, [])
            if lg == "nhl":
                # En rotowire NHL el nombre del portero viene en `position` y el estatus en `player_name`
                goalie_name = str(r.get("position") or "").strip()
                conf_raw = str(r.get("player_name") or r.get("notes") or "Expected").strip()
                lst.append(
                    {
                        "player_name": goalie_name,
                        "position": "G",
                        "confirmed": conf_raw.lower() == "confirmed",
                        "status": conf_raw,
                    }
                )
            else:
                lst.append(
                    {
                        "player_name": str(r.get("player_name") or "").strip(),
                        "position": str(r.get("position") or "").strip(),
                        "confirmed": "confirm" in str(r.get("status") or "").lower()
                        or "active" in str(r.get("status") or "").lower(),
                        "status": str(r.get("status") or ""),
                        "notes": str(r.get("notes") or ""),
                    }
                )

    return {"injuries": injuries, "starters": starters}


def _match_team_aux(lookup: Mapping[str, Any], lg: str, candidates: list[str], default: Any) -> Any:
    for c in candidates:
        if not c:
            continue
        s = _slug(c)
        k = f"{lg}:{s}"
        if k in lookup:
            return lookup[k]
    for c in candidates:
        if not c:
            continue
        s = _slug(c)
        for k, v in lookup.items():
            if not k.startswith(f"{lg}:"):
                continue
            ks = k.split(":", 1)[1]
            if ks and (ks in s or s in ks):
                return v
    return default


def train_nhl_engine(
    xg_records: list[dict[str, Any]],
    stadium_lookup: Mapping[str, Any],
    ra_lookup: Mapping[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    rows = [r for r in xg_records if r.get("record_type") == "nhl_team_season_advanced"]
    df = pd.DataFrame(rows)
    df["fk"] = [canonical_franchise_key("nhl", r["team_name"], r["team_abbr"]) for _, r in df.iterrows()]
    df["gp"] = df["games_played"].astype(float)
    df["win_pct"] = df["wins"].astype(float) / df["gp"]
    df["gf_pg"] = df["goals_for"].astype(float) / df["gp"]
    df["ga_pg"] = df["goals_against"].astype(float) / df["gp"]
    df["xgf_pg"] = df["xg_for"].astype(float) / df["gp"]
    df["xga_pg"] = df["xg_against"].astype(float) / df["gp"]
    df["hd_xgf_pg"] = df["high_danger_xg_for"].astype(float) / df["gp"]
    df["xg_pct"] = df["xg_pct_5on5"].astype(float)
    df["corsi_pct"] = df["corsi_for_pct_5on5"].astype(float)
    df["fenwick_pct"] = df["fenwick_for_pct_5on5"].astype(float)
    df["pythag_215"] = df["pythag_win_pct_215"].astype(float)

    feat_cols = ["xg_pct", "corsi_pct", "fenwick_pct", "hd_xgf_pg", "pythag_215"]
    off_cols = ["xgf_pg", "gf_pg", "hd_xgf_pg", "xg_pct"]
    def_cols = ["xga_pg", "ga_pg", "xg_pct", "pythag_215"]

    seasons = ["2023-24", "2024-25", "2025-26", "2026-27"]
    pairs = []
    for s_prev, s_curr in zip(seasons[:-1], seasons[1:]):
        p = df[df["season"] == s_prev]
        c = df[df["season"] == s_curr]
        m = p.merge(c, on="fk", suffixes=("_prev", "_curr"))
        m["transition"] = f"{s_prev}->{s_curr}"
        pairs.append(m)
    tr_df = pd.concat(pairs, ignore_index=True)

    # Walk-forward causal estricto:
    # Fold 1: entrena 2023-24->2024-25, evalúa 2024-25->2025-26
    # Fold 2: entrena <=2025-26, evalúa 2025-26->2026-27
    alpha_nhl = 28.0
    wf_preds, wf_true, wf_gp, wf_naive, wf_legacy = [], [], [], [], []
    for eval_tr, train_trs in [
        ("2024-25->2025-26", ["2023-24->2024-25"]),
        ("2025-26->2026-27", ["2023-24->2024-25", "2024-25->2025-26"]),
    ]:
        sub_tr = tr_df[tr_df["transition"].isin(train_trs)]
        sub_te = tr_df[tr_df["transition"] == eval_tr]
        X_tr = sub_tr[[f"{c}_prev" for c in feat_cols]].to_numpy(float)
        y_tr = np.array([logit_fn(v) for v in sub_tr["win_pct_curr"].to_numpy(float)])
        w_tr = sub_tr["gp_curr"].to_numpy(float)
        m_fold = _fit_standardized_ridge(X_tr, y_tr, alpha=alpha_nhl, sample_weight=w_tr)

        X_te = sub_te[[f"{c}_prev" for c in feat_cols]].to_numpy(float)
        p_hat = np.array([logistic(_predict_linear(m_fold, row)) for row in X_te])
        wf_preds.append(p_hat)
        wf_true.append(sub_te["win_pct_curr"].to_numpy(float))
        wf_gp.append(sub_te["gp_curr"].to_numpy(float))
        wf_naive.append(sub_te["win_pct_prev"].to_numpy(float))
        # Legacy hockey.ts usa Pitágoras 2.15 crudo sobre goles anotados/recibidos con encogimiento 0.82
        leg = 0.5 + 0.82 * (sub_te["pythag_215_prev"].to_numpy(float) - 0.5)
        wf_legacy.append(leg)

    oos_metrics = compute_season_oos_metrics(
        np.concatenate(wf_true),
        np.concatenate(wf_preds),
        np.concatenate(wf_gp),
        np.concatenate(wf_naive),
        np.concatenate(wf_legacy),
    )

    # Ajuste final sobre todas las transiciones observadas ponderadas por GP
    X_all = tr_df[[f"{c}_prev" for c in feat_cols]].to_numpy(float)
    y_all_logit = np.array([logit_fn(v) for v in tr_df["win_pct_curr"].to_numpy(float)])
    w_all = tr_df["gp_curr"].to_numpy(float)
    strength_model = _fit_standardized_ridge(X_all, y_all_logit, alpha=alpha_nhl, sample_weight=w_all)
    gf_model = _fit_standardized_ridge(
        tr_df[[f"{c}_prev" for c in off_cols]].to_numpy(float),
        tr_df["gf_pg_curr"].to_numpy(float),
        alpha=32.0,
        sample_weight=w_all,
    )
    ga_model = _fit_standardized_ridge(
        tr_df[[f"{c}_prev" for c in def_cols]].to_numpy(float),
        tr_df["ga_pg_curr"].to_numpy(float),
        alpha=32.0,
        sample_weight=w_all,
    )

    # Construir registro canónico de los 32 equipos NHL (2025-26 prior + actualización Bayesiana 2026-27)
    s25 = df[df["season"] == "2025-26"].set_index("fk")
    s26 = df[df["season"] == "2026-27"].set_index("fk")
    teams_dict: dict[str, dict[str, Any]] = {}
    aliases: dict[str, str] = {}

    # Mapa de SV% empírico de porteros titulares (unblocked/save proxy escalado a estándar NHL .905)
    for fk in sorted(set(s25.index).union(set(s26.index))):
        r25 = s25.loc[fk] if fk in s25.index else s26.loc[fk]
        r26 = s26.loc[fk] if fk in s26.index else r25
        gp26 = float(r26["gp"]) if fk in s26.index else 0.0
        w_curr = gp26 / (gp26 + 28.0)

        def _blend_col(col: str) -> float:
            return (1.0 - w_curr) * float(r25[col]) + w_curr * float(r26[col])

        t_name = str(r26["team_name"])
        t_abbr = "UTA" if fk == "nhl_uta" else str(r26["team_abbr"]).upper()
        nickname = t_name.split()[-1]
        city_part = t_name.rsplit(" ", 1)[0]

        stad = _match_team_aux(
            stadium_lookup,
            "nhl",
            [t_name, t_abbr, city_part, "Utah Hockey Club" if fk == "nhl_uta" else ""],
            {"stadium_name": "", "stadium_elevation_m": 120.0, "roof_type": "indoor_arena", "is_dome": True},
        )
        inj = _match_team_aux(ra_lookup["injuries"], "nhl", [t_name, city_part, nickname], {"out": 0, "questionable": 0})
        st_list = _match_team_aux(ra_lookup["starters"], "nhl", [t_name, nickname, city_part], [])

        # Estimación conservadora de SV% de equipo en torno a .905 según xGA - GA
        ga_vs_xga = (_blend_col("xga_pg") - _blend_col("ga_pg")) / 29.5
        est_goalie_sv = clamp(0.905 + 0.45 * ga_vs_xga, 0.892, 0.922)
        est_goalie_gaa = clamp(_blend_col("ga_pg") * 0.94, 2.15, 3.65)
        starter_goalie = st_list[0]["player_name"] if st_list else None
        starter_confirmed = bool(st_list[0]["confirmed"]) if st_list else False

        feat_map = {c: round(_blend_col(c), 6) for c in set(feat_cols + off_cols + def_cols)}
        strength_p = logistic(_predict_linear(strength_model, [feat_map[c] for c in feat_cols]))
        proj_gf = clamp(_predict_linear(gf_model, [feat_map[c] for c in off_cols]), 2.15, 4.15)
        proj_ga = clamp(_predict_linear(ga_model, [feat_map[c] for c in def_cols]), 2.15, 4.15)

        teams_dict[t_abbr] = {
            "team_id": fk,
            "team_abbr": t_abbr,
            "team_name": t_name,
            "strength_prob": round(strength_p, 8),
            "proj_gf_pg": round(proj_gf, 6),
            "proj_ga_pg": round(proj_ga, 6),
            "xg_pct": feat_map["xg_pct"],
            "corsi_pct": feat_map["corsi_pct"],
            "fenwick_pct": feat_map["fenwick_pct"],
            "hd_xgf_pg": feat_map["hd_xgf_pg"],
            "pythag_215": feat_map["pythag_215"],
            "xgf_pg": feat_map["xgf_pg"],
            "xga_pg": feat_map["xga_pg"],
            "gf_pg": feat_map["gf_pg"],
            "ga_pg": feat_map["ga_pg"],
            "default_goalie_name": starter_goalie,
            "default_goalie_sv_pct": round(est_goalie_sv, 5),
            "default_goalie_gaa": round(est_goalie_gaa, 4),
            "default_goalie_confirmed": starter_confirmed,
            "active_injuries_out": int(inj["out"]),
            "active_injuries_questionable": int(inj["questionable"]),
            "stadium_name": stad.get("stadium_name", ""),
            "stadium_elevation_m": float(stad.get("stadium_elevation_m", 120.0)),
            "is_dome": True,
        }
        for al in (t_abbr, fk, t_name, nickname, city_part):
            if al:
                aliases[_slug(al)] = t_abbr
        if t_abbr in ("TBL", "TB"):
            aliases["tb"] = t_abbr
            aliases["tbl"] = t_abbr
        elif t_abbr in ("NJD", "NJ"):
            aliases["nj"] = t_abbr
            aliases["njd"] = t_abbr
        elif t_abbr in ("SJS", "SJ"):
            aliases["sj"] = t_abbr
            aliases["sjs"] = t_abbr
        elif t_abbr in ("LAK", "LA"):
            aliases["la"] = t_abbr
            aliases["lak"] = t_abbr
        elif t_abbr in ("MTL", "MON"):
            aliases["mtl"] = t_abbr
            aliases["mon"] = t_abbr
        elif t_abbr in ("WSH", "WAS"):
            aliases["wsh"] = t_abbr
            aliases["was"] = t_abbr
        elif t_abbr in ("VGK", "VEG"):
            aliases["vgk"] = t_abbr
            aliases["veg"] = t_abbr
        elif t_abbr == "UTA":
            aliases["ari"] = "UTA"
            aliases["utah_hockey_club"] = "UTA"
            aliases["utah_mammoth"] = "UTA"

    league_gf = float(np.mean([v["proj_gf_pg"] for v in teams_dict.values()]))
    artifact_nhl = {
        "sport": "nhl",
        "codename": MULTISPORT_CODENAMES["nhl"],
        "version": MULTISPORT_VERSION,
        "feature_order": feat_cols,
        "off_feature_order": off_cols,
        "def_feature_order": def_cols,
        "strength_model": strength_model,
        "gf_model": gf_model,
        "ga_model": ga_model,
        "priors": {
            "league_goals_per_team": round(league_gf, 6),
            "league_sv_pct": 0.905,
            "league_gaa": 2.92,
            "shots_per_game": 29.5,
            "goalie_sv_shrink": 0.55,
            "goalie_confirmed_weight": 1.0,
            "goalie_projected_weight": 0.70,
            "goalie_logit_per_goal": 0.31,
            "injury_out_goal_pen": 0.042,
            "injury_quest_goal_pen": 0.018,
            "injury_max_goal_pen": 0.32,
            "injury_logit_per_goal": 0.29,
            "home_ice_prob": 0.545,
            "home_ice_logit": round(logit_fn(0.545), 8),
            "home_goal_boost": 0.13,
            "away_goal_Drag": -0.08,
            "altitude_threshold_m": 1200.0,
            "altitude_diff_min_m": 800.0,
            "w_altitude_logit": 0.055,
            "w_altitude_goals": 0.07,
            "ot_base_rate": 0.238,
            "ot_logit_decay": 0.32,
            "ot_total_goals_anchor": 6.15,
            "ot_total_goals_decay": 0.04,
            "ot_home_edge_share": 0.35,
        },
        "teams": teams_dict,
        "aliases": aliases,
    }
    return artifact_nhl, oos_metrics


def train_mlb_engine(
    xg_records: list[dict[str, Any]],
    stadium_lookup: Mapping[str, Any],
    ra_lookup: Mapping[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    rows = [r for r in xg_records if r.get("record_type") == "mlb_team_season_advanced"]
    df = pd.DataFrame(rows)
    df["fk"] = [canonical_franchise_key("mlb", r["team_name"], r["team_abbr"]) for _, r in df.iterrows()]
    df["season"] = df["season"].astype(int)
    df["gp"] = df["games_played"].astype(float)
    df["win_pct"] = df["wins"].astype(float) / df["gp"]
    df["rs_pg"] = df["runs_per_game"].astype(float)
    df["ra_pg"] = df["runs_allowed_per_game"].astype(float)
    df["ops_plus"] = df["ops_plus"].astype(float)
    df["woba_est"] = df["woba_est"].astype(float)
    df["fip"] = df["fip"].astype(float)
    df["era"] = df["era"].astype(float)
    df["whip"] = df["whip"].astype(float)
    df["era_minus_fip"] = df["era"] - df["fip"]
    df["pythag_183"] = df["pythag_win_pct_183"].astype(float)

    off_cols = ["woba_est", "ops_plus", "rs_pg"]
    def_cols = ["fip", "era_minus_fip", "whip", "ra_pg"]
    win_cols = ["pythag_183", "fip", "era_minus_fip", "whip", "woba_est", "ops_plus"]

    pairs = []
    for s_prev, s_curr in [(2024, 2025), (2025, 2026)]:
        p = df[df["season"] == s_prev]
        c = df[df["season"] == s_curr]
        m = p.merge(c, on="fk", suffixes=("_prev", "_curr"))
        m["transition"] = f"{s_prev}->{s_curr}"
        pairs.append(m)
    tr_df = pd.concat(pairs, ignore_index=True)

    # Walk-forward causal estricto: entrena en 2024->2025, prueba estrictamente OOS en 2025->2026 (n=30, 4860 juegos)
    alpha_mlb = 24.0
    tr_1 = tr_df[tr_df["transition"] == "2024->2025"]
    te_2 = tr_df[tr_df["transition"] == "2025->2026"]

    rs_m1 = _fit_standardized_ridge(
        tr_1[[f"{c}_prev" for c in off_cols]].to_numpy(float),
        tr_1["rs_pg_curr"].to_numpy(float),
        alpha=alpha_mlb,
        sample_weight=tr_1["gp_curr"].to_numpy(float),
    )
    ra_m1 = _fit_standardized_ridge(
        tr_1[[f"{c}_prev" for c in def_cols]].to_numpy(float),
        tr_1["ra_pg_curr"].to_numpy(float),
        alpha=alpha_mlb,
        sample_weight=tr_1["gp_curr"].to_numpy(float),
    )
    win_m1 = _fit_standardized_ridge(
        tr_1[[f"{c}_prev" for c in win_cols]].to_numpy(float),
        tr_1["win_pct_curr"].to_numpy(float),
        alpha=alpha_mlb,
        sample_weight=tr_1["gp_curr"].to_numpy(float),
    )

    p_hat_oos = []
    for _, r in te_2.iterrows():
        rs_h = clamp(_predict_linear(rs_m1, [float(r[f"{c}_prev"]) for c in off_cols]), 3.2, 5.8)
        ra_h = clamp(_predict_linear(ra_m1, [float(r[f"{c}_prev"]) for c in def_cols]), 3.2, 5.8)
        py_h = safe_pow(rs_h, 1.83) / (safe_pow(rs_h, 1.83) + safe_pow(ra_h, 1.83))
        w_lin = clamp(_predict_linear(win_m1, [float(r[f"{c}_prev"]) for c in win_cols]), 0.32, 0.68)
        p_hat_oos.append(0.55 * py_h + 0.45 * w_lin)

    # Legacy baseball.ts usa 0.60 * pyth_183 + 0.40 * win_pct sin encogimiento a .500 ni FIP
    leg_oos = 0.60 * te_2["pythag_183_prev"].to_numpy(float) + 0.40 * te_2["win_pct_prev"].to_numpy(float)
    oos_metrics = compute_season_oos_metrics(
        te_2["win_pct_curr"].to_numpy(float),
        np.array(p_hat_oos),
        te_2["gp_curr"].to_numpy(float),
        te_2["win_pct_prev"].to_numpy(float),
        leg_oos,
    )

    # Ajuste final en las dos transiciones completas (2024->2025 + 2025->2026)
    w_all = tr_df["gp_curr"].to_numpy(float)
    rs_model = _fit_standardized_ridge(
        tr_df[[f"{c}_prev" for c in off_cols]].to_numpy(float),
        tr_df["rs_pg_curr"].to_numpy(float),
        alpha=alpha_mlb,
        sample_weight=w_all,
    )
    ra_model = _fit_standardized_ridge(
        tr_df[[f"{c}_prev" for c in def_cols]].to_numpy(float),
        tr_df["ra_pg_curr"].to_numpy(float),
        alpha=alpha_mlb,
        sample_weight=w_all,
    )
    win_model = _fit_standardized_ridge(
        tr_df[[f"{c}_prev" for c in win_cols]].to_numpy(float),
        tr_df["win_pct_curr"].to_numpy(float),
        alpha=alpha_mlb,
        sample_weight=w_all,
    )

    s26 = df[df["season"] == 2026].set_index("fk")
    teams_dict: dict[str, dict[str, Any]] = {}
    aliases: dict[str, str] = {}
    for fk, r in sorted(s26.iterrows()):
        t_name = str(r["team_name"])
        t_abbr = "ATH" if fk == "mlb_ath" else str(r["team_abbr"]).upper()
        nickname = t_name.split()[-1]
        city_part = t_name.rsplit(" ", 1)[0]

        stad = _match_team_aux(
            stadium_lookup,
            "mlb",
            [t_name, t_abbr, city_part, "Oakland Athletics" if fk == "mlb_ath" else ""],
            {
                "stadium_name": "",
                "stadium_elevation_m": 100.0,
                "structural_pressure_hpa": 1001.0,
                "roof_type": "open",
                "is_dome": False,
            },
        )
        inj = _match_team_aux(ra_lookup["injuries"], "mlb", [t_name, city_part, nickname], {"out": 0, "questionable": 0})

        rs_proj = clamp(_predict_linear(rs_model, [float(r[c]) for c in off_cols]), 3.3, 5.7)
        ra_proj = clamp(_predict_linear(ra_model, [float(r[c]) for c in def_cols]), 3.3, 5.7)
        py_proj = safe_pow(rs_proj, 1.83) / (safe_pow(rs_proj, 1.83) + safe_pow(ra_proj, 1.83))
        w_proj = clamp(_predict_linear(win_model, [float(r[c]) for c in win_cols]), 0.34, 0.66)
        talent_wp = 0.55 * py_proj + 0.45 * w_proj

        # Coors Field y estadios con presión barométrica explícita
        elev_m = float(stad.get("stadium_elevation_m", 100.0))
        pres_hpa = float(stad.get("structural_pressure_hpa", 1013.25 * math.exp(-elev_m / 8434.5)))
        roof_type = str(stad.get("roof_type", "open")).lower()
        is_dome = roof_type in ("dome", "indoor", "closed")

        teams_dict[t_abbr] = {
            "team_id": fk,
            "team_abbr": t_abbr,
            "team_name": t_name,
            "talent_win_pct": round(talent_wp, 8),
            "proj_rs_pg": round(rs_proj, 6),
            "proj_ra_pg": round(ra_proj, 6),
            "woba_est": round(float(r["woba_est"]), 5),
            "ops_plus": round(float(r["ops_plus"]), 3),
            "fip": round(float(r["fip"]), 4),
            "era": round(float(r["era"]), 4),
            "era_minus_fip": round(float(r["era_minus_fip"]), 4),
            "whip": round(float(r["whip"]), 4),
            "pythag_183": round(float(r["pythag_183"]), 6),
            "rs_pg": round(float(r["rs_pg"]), 4),
            "ra_pg": round(float(r["ra_pg"]), 4),
            "rotation_baseline_era": round(0.65 * float(r["fip"]) + 0.35 * float(r["era"]), 4),
            "active_injuries_out": int(inj["out"]),
            "active_injuries_questionable": int(inj["questionable"]),
            "stadium_name": stad.get("stadium_name", ""),
            "stadium_elevation_m": elev_m,
            "structural_pressure_hpa": round(pres_hpa, 3),
            "roof_type": roof_type,
            "is_dome": is_dome,
        }
        for al in (t_abbr, fk, t_name, nickname, city_part):
            if al:
                aliases[_slug(al)] = t_abbr
        if t_abbr == "ATH":
            aliases["oak"] = "ATH"
            aliases["oakland_athletics"] = "ATH"
        elif t_abbr in ("AZ", "ARI"):
            aliases["ari"] = t_abbr
            aliases["az"] = t_abbr
        elif t_abbr in ("CHW", "CWS"):
            aliases["cws"] = t_abbr
            aliases["chw"] = t_abbr
            aliases["cha"] = t_abbr
        elif t_abbr == "CHC":
            aliases["chn"] = "CHC"
        elif t_abbr in ("KCR", "KC"):
            aliases["kc"] = t_abbr
            aliases["kcr"] = t_abbr
            aliases["kca"] = t_abbr
        elif t_abbr in ("SDP", "SD"):
            aliases["sd"] = t_abbr
            aliases["sdp"] = t_abbr
            aliases["sdn"] = t_abbr
        elif t_abbr in ("SFG", "SF"):
            aliases["sf"] = t_abbr
            aliases["sfg"] = t_abbr
            aliases["sfn"] = t_abbr
        elif t_abbr in ("TBR", "TB"):
            aliases["tb"] = t_abbr
            aliases["tbr"] = t_abbr
            aliases["tba"] = t_abbr
        elif t_abbr in ("WSN", "WSH", "WAS"):
            aliases["wsh"] = t_abbr
            aliases["was"] = t_abbr
            aliases["wsn"] = t_abbr
        elif t_abbr == "LAD":
            aliases["lan"] = "LAD"
        elif t_abbr == "LAA":
            aliases["ana"] = "LAA"
        elif t_abbr == "NYM":
            aliases["nyn"] = "NYM"
        elif t_abbr == "NYY":
            aliases["nya"] = "NYY"
        elif t_abbr == "STL":
            aliases["sln"] = "STL"
        elif t_abbr == "MIA":
            aliases["fla"] = "MIA"

    lg_runs = float(np.mean([v["proj_rs_pg"] for v in teams_dict.values()]))
    artifact_mlb = {
        "sport": "mlb",
        "codename": MULTISPORT_CODENAMES["mlb"],
        "version": MULTISPORT_VERSION,
        "off_feature_order": off_cols,
        "def_feature_order": def_cols,
        "win_feature_order": win_cols,
        "rs_model": rs_model,
        "ra_model": ra_model,
        "win_model": win_model,
        "priors": {
            "league_runs_per_team": round(lg_runs, 6),
            "league_fip": 4.12,
            "pythag_static_exp": 1.83,
            "pythagenpat_power": 0.287,
            "starter_innings_weight": 0.46,
            "starter_confirmed_weight": 1.0,
            "starter_projected_weight": 0.70,
            "injury_out_run_pen": 0.028,
            "injury_quest_run_pen": 0.012,
            "injury_max_run_pen": 0.35,
            "home_field_prob": 0.538,
            "coors_acclimation_prob_boost": 0.012,
            "pressure_anchor_hpa": 995.0,
            "barometric_run_slope_per_hpa": 0.00118,
            "wind_threshold_mph": 12.0,
            "wind_out_slope_per_mph": 0.0040,
            "wind_cross_in_slope_per_mph": -0.0020,
            "precip_threshold_mm": 1.0,
            "precip_run_slope_per_mm": -0.0050,
            "home_run_split_boost": 0.09,
            "away_run_split_drag": -0.06,
        },
        "teams": teams_dict,
        "aliases": aliases,
    }
    return artifact_mlb, oos_metrics


def train_nba_engine(
    xg_records: list[dict[str, Any]],
    stadium_lookup: Mapping[str, Any],
    ra_lookup: Mapping[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    rows = [r for r in xg_records if r.get("record_type") == "nba_team_season_advanced"]
    df = pd.DataFrame(rows)
    df["fk"] = [canonical_franchise_key("nba", r["team_name"], r["team_abbr"]) for _, r in df.iterrows()]
    df["gp"] = df["games_played"].astype(float)
    df["win_pct"] = df["wins"].astype(float) / df["gp"]
    df["net_rtg"] = df["net_rtg"].astype(float)
    df["ortg"] = df["ortg"].astype(float)
    df["drtg"] = df["drtg"].astype(float)
    df["srs"] = df["srs"].astype(float)
    df["pace"] = df["pace"].astype(float)
    df["efg_pct"] = df["efg_pct"].astype(float)
    df["opp_efg_pct"] = df["opp_efg_pct"].astype(float)
    df["efg_diff"] = (df["efg_pct"] - df["opp_efg_pct"]) * 100.0
    df["tov_diff"] = df["opp_tov_pct"].astype(float) - df["tov_pct"].astype(float)
    df["reb_ft_comp"] = (
        0.35 * (df["orb_pct"].astype(float) - (100.0 - df["drb_pct"].astype(float)))
        + 12.0 * (df["ft_per_fga"].astype(float) - df["opp_ft_per_fga"].astype(float))
    )
    df["four_factors_aux"] = 0.60 * df["tov_diff"] + df["reb_ft_comp"]
    df["pythag_1391"] = df["pythag_win_pct_1391"].astype(float)
    df["pythag_pts_proxy"] = (df["pythag_1391"] - 0.5) * 30.0
    df["margin_pg"] = df["pts_per_game"].astype(float) - df["opp_pts_per_game"].astype(float)

    feat_cols = ["net_rtg", "srs", "pythag_pts_proxy", "efg_diff", "four_factors_aux"]

    pairs = []
    for s_prev, s_curr in [("2024-25", "2025-26"), ("2025-26", "2026-27")]:
        p = df[df["season"] == s_prev]
        c = df[df["season"] == s_curr]
        m = p.merge(c, on="fk", suffixes=("_prev", "_curr"))
        m["transition"] = f"{s_prev}->{s_curr}"
        pairs.append(m)
    tr_df = pd.concat(pairs, ignore_index=True)

    # Walk-forward causal estricto:
    # 1) CV 5-fold sobre 2024-25->2025-26 (temporada completa 82 GP) +
    # 2) Entrena 2024-25->2025-26 -> Prueba estricta OOS en 2025-26->2026-27
    alpha_nba = 22.0
    sigma_nba = 11.8
    season_margin_sigma = 14.5  # conversión margen esperado por partido -> win_pct anual NBA

    tr_full = tr_df[tr_df["transition"] == "2024-25->2025-26"].reset_index(drop=True)
    te_live = tr_df[tr_df["transition"] == "2025-26->2026-27"].reset_index(drop=True)

    # Predicciones OOS en ambos cortes: 5-fold OOS sobre 2024-25->2025-26 + walk-forward puro sobre 2025-26->2026-27
    oos_pred_list, oos_true_list, oos_gp_list, oos_naive_list, oos_leg_list = [], [], [], [], []
    n_f = len(tr_full)
    fold_ids = np.arange(n_f) % 5
    for k in range(5):
        tr_k = tr_full[fold_ids != k]
        te_k = tr_full[fold_ids == k]
        mk = _fit_standardized_ridge(
            tr_k[[f"{c}_prev" for c in feat_cols]].to_numpy(float),
            tr_k["margin_pg_curr"].to_numpy(float),
            alpha=alpha_nba,
            sample_weight=tr_k["gp_curr"].to_numpy(float),
        )
        m_hat = np.array([_predict_linear(mk, [float(r[f"{c}_prev"]) for c in feat_cols]) for _, r in te_k.iterrows()])
        p_hat = np.array([normal_cdf(v / season_margin_sigma) for v in m_hat])
        oos_pred_list.append(p_hat)
        oos_true_list.append(te_k["win_pct_curr"].to_numpy(float))
        oos_gp_list.append(te_k["gp_curr"].to_numpy(float))
        oos_naive_list.append(te_k["win_pct_prev"].to_numpy(float))
        # Heurística estática legacy: diferencial PPG crudo sin SRS/Four Factors ni encogimiento
        leg_p = np.array([normal_cdf(v / season_margin_sigma) for v in te_k["margin_pg_prev"].to_numpy(float)])
        oos_leg_list.append(leg_p)

    m_wf = _fit_standardized_ridge(
        tr_full[[f"{c}_prev" for c in feat_cols]].to_numpy(float),
        tr_full["margin_pg_curr"].to_numpy(float),
        alpha=alpha_nba,
        sample_weight=tr_full["gp_curr"].to_numpy(float),
    )
    m_hat_26 = np.array([_predict_linear(m_wf, [float(r[f"{c}_prev"]) for c in feat_cols]) for _, r in te_live.iterrows()])
    p_hat_26 = np.array([normal_cdf(v / season_margin_sigma) for v in m_hat_26])
    oos_pred_list.append(p_hat_26)
    oos_true_list.append(te_live["win_pct_curr"].to_numpy(float))
    oos_gp_list.append(te_live["gp_curr"].to_numpy(float))
    oos_naive_list.append(te_live["win_pct_prev"].to_numpy(float))
    oos_leg_list.append(
        np.array([normal_cdf(v / season_margin_sigma) for v in te_live["margin_pg_prev"].to_numpy(float)])
    )

    oos_metrics = compute_season_oos_metrics(
        np.concatenate(oos_true_list),
        np.concatenate(oos_pred_list),
        np.concatenate(oos_gp_list),
        np.concatenate(oos_naive_list),
        np.concatenate(oos_leg_list),
    )

    # Modelo final ponderado por GP (82 GP pesa ~8x más que 10 GP)
    w_all = tr_df["gp_curr"].to_numpy(float)
    rating_model = _fit_standardized_ridge(
        tr_df[[f"{c}_prev" for c in feat_cols]].to_numpy(float),
        tr_df["margin_pg_curr"].to_numpy(float),
        alpha=alpha_nba,
        sample_weight=w_all,
    )

    s25 = df[df["season"] == "2025-26"].set_index("fk")
    s26 = df[df["season"] == "2026-27"].set_index("fk")
    lg_ortg = float(s25["ortg"].mean())
    lg_pace = float(s25["pace"].mean())

    # Elevaciones canónicas exactas para Denver (1609 m) y Utah (1288 m) cuando ws_stadium_physics usa arena genérica
    nba_elev_overrides = {
        "DEN": 1609.0,
        "UTA": 1288.0,
        "PHX": 331.0,
        "OKC": 366.0,
        "ATL": 320.0,
        "SAS": 198.0,
    }

    teams_dict: dict[str, dict[str, Any]] = {}
    aliases: dict[str, str] = {}
    for fk in sorted(set(s25.index).union(set(s26.index))):
        r25 = s25.loc[fk] if fk in s25.index else s26.loc[fk]
        r26 = s26.loc[fk] if fk in s26.index else r25
        gp26 = float(r26["gp"]) if fk in s26.index else 0.0
        w_curr = gp26 / (gp26 + 24.0)

        def _b(col: str) -> float:
            return (1.0 - w_curr) * float(r25[col]) + w_curr * float(r26[col])

        t_name = str(r26["team_name"])
        t_abbr = str(r26["team_abbr"]).upper()
        nickname = t_name.split()[-1]
        city_part = t_name.rsplit(" ", 1)[0]

        stad = _match_team_aux(
            stadium_lookup,
            "nba",
            [t_name, t_abbr, city_part],
            {"stadium_name": "", "stadium_elevation_m": 150.0},
        )
        elev_m = nba_elev_overrides.get(t_abbr, float(stad.get("stadium_elevation_m", 150.0)))
        inj = _match_team_aux(ra_lookup["injuries"], "nba", [t_name, city_part, nickname], {"out": 0, "questionable": 0})

        f_vec = [_b(c) for c in feat_cols]
        power_rtg = _predict_linear(rating_model, f_vec)
        shrunk_ortg = 0.72 * _b("ortg") + 0.28 * lg_ortg
        shrunk_drtg = 0.72 * _b("drtg") + 0.28 * lg_ortg

        teams_dict[t_abbr] = {
            "team_id": fk,
            "team_abbr": t_abbr,
            "team_name": t_name,
            "power_rating_pts": round(power_rtg, 6),
            "net_rtg": round(_b("net_rtg"), 4),
            "ortg": round(shrunk_ortg, 4),
            "drtg": round(shrunk_drtg, 4),
            "srs": round(_b("srs"), 4),
            "pace": round(_b("pace"), 4),
            "efg_pct": round(_b("efg_pct"), 5),
            "opp_efg_pct": round(_b("opp_efg_pct"), 5),
            "efg_diff": round(_b("efg_diff"), 4),
            "four_factors_aux": round(_b("four_factors_aux"), 4),
            "pythag_1391": round(_b("pythag_1391"), 6),
            "active_injuries_out": int(inj["out"]),
            "active_injuries_questionable": int(inj["questionable"]),
            "stadium_elevation_m": elev_m,
            "is_dome": True,
        }
        for al in (t_abbr, fk, t_name, nickname, city_part):
            if al:
                aliases[_slug(al)] = t_abbr
        if t_abbr in ("PHX", "PHO"):
            aliases["pho"] = t_abbr
            aliases["phx"] = t_abbr
        elif t_abbr in ("BKN", "BRK"):
            aliases["brk"] = t_abbr
            aliases["bkn"] = t_abbr
        elif t_abbr in ("CHA", "CHO"):
            aliases["cho"] = t_abbr
            aliases["cha"] = t_abbr
        elif t_abbr in ("NOP", "NO"):
            aliases["no"] = t_abbr
            aliases["nop"] = t_abbr
        elif t_abbr in ("NYK", "NY"):
            aliases["ny"] = t_abbr
            aliases["nyk"] = t_abbr
        elif t_abbr in ("GSW", "GS"):
            aliases["gs"] = t_abbr
            aliases["gsw"] = t_abbr
        elif t_abbr in ("SAS", "SA"):
            aliases["sa"] = t_abbr
            aliases["sas"] = t_abbr
        elif t_abbr in ("WAS", "WSH"):
            aliases["was"] = t_abbr
            aliases["wsh"] = t_abbr
        elif t_abbr in ("UTA", "UTH"):
            aliases["uta"] = t_abbr
            aliases["uth"] = t_abbr

    artifact_nba = {
        "sport": "nba",
        "codename": MULTISPORT_CODENAMES["nba"],
        "version": MULTISPORT_VERSION,
        "feature_order": feat_cols,
        "rating_model": rating_model,
        "priors": {
            "sigma_margin": sigma_nba,
            "home_court_pts": 2.40,
            "league_pace": round(lg_pace, 4),
            "league_ortg": round(lg_ortg, 4),
            "pace_shrink": 0.65,
            "altitude_threshold_m": 1200.0,
            "altitude_diff_min_m": 800.0,
            "denver_altitude_anchor_m": 1609.0,
            "w_altitude_pts": 1.65,
            "injury_out_pts_pen": 0.85,
            "injury_doubtful_pts_pen": 0.38,
            "injury_max_margin_pts": 7.50,
            "injury_total_pts_drag": 0.45,
        },
        "teams": teams_dict,
        "aliases": aliases,
    }
    return artifact_nba, oos_metrics


def train_ncaaf_engine(
    xg_records: list[dict[str, Any]],
    stadium_lookup: Mapping[str, Any],
    ra_lookup: Mapping[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    rows = [r for r in xg_records if r.get("record_type") == "ncaaf_team_season_advanced"]
    df = pd.DataFrame(rows)
    df["fk"] = [canonical_franchise_key("ncaaf", r["team_name"], r.get("team_abbr") or "") for _, r in df.iterrows()]
    df["season"] = df["season"].astype(int)
    df["gp"] = df["games_played"].astype(float)
    df["win_pct"] = df["wins"].astype(float) / np.maximum(df["gp"], 1.0)
    df["ppg"] = df["points_per_game"].astype(float)
    df["oppg"] = df["opp_points_per_game"].astype(float)
    df["margin_pg"] = df["ppg"] - df["oppg"]
    df["espn_fpi"] = df["espn_fpi"].fillna(df["srs"]).astype(float)
    df["srs"] = df["srs"].fillna(0.0).astype(float)
    df["sos"] = df["sos"].fillna(0.0).astype(float)
    df["off_ypp"] = df["off_yards_per_play"].fillna(5.6).astype(float)
    df["def_ypp"] = df["def_yards_per_play"].fillna(5.6).astype(float)
    df["net_ypp"] = df["off_ypp"] - df["def_ypp"]
    df["pythag_237"] = df["pythag_win_pct_237"].fillna(0.5).astype(float)
    df["pythag_pts_proxy"] = (df["pythag_237"] - 0.5) * 28.0

    feat_cols = ["espn_fpi", "srs", "sos", "net_ypp", "pythag_pts_proxy"]

    pairs = []
    for s_prev, s_curr in [(2024, 2025), (2025, 2026)]:
        p = df[df["season"] == s_prev]
        c = df[df["season"] == s_curr]
        m = p.merge(c, on="fk", suffixes=("_prev", "_curr"))
        m["transition"] = f"{s_prev}->{s_curr}"
        pairs.append(m)
    tr_df = pd.concat(pairs, ignore_index=True)

    # Walk-forward causal estricto:
    # Entrena en 2024->2025 (n=134 programas FBS) -> Evalúa OOS en 2025->2026 (n=136 programas FBS!)
    alpha_ncaaf = 35.0
    sigma_ncaaf = 13.8
    season_margin_sigma_cfb = 17.5

    tr_1 = tr_df[tr_df["transition"] == "2024->2025"]
    te_2 = tr_df[tr_df["transition"] == "2025->2026"]

    # Modelo para predecir SRS/rating real de temporada S y win_pct S ajustado por SOS
    win_m1 = _fit_standardized_ridge(
        tr_1[[f"{c}_prev" for c in feat_cols]].to_numpy(float),
        tr_1["win_pct_curr"].to_numpy(float),
        alpha=alpha_ncaaf,
        sample_weight=tr_1["gp_curr"].to_numpy(float),
    )
    srs_m1 = _fit_standardized_ridge(
        tr_1[[f"{c}_prev" for c in feat_cols]].to_numpy(float),
        tr_1["srs_curr"].to_numpy(float),
        alpha=alpha_ncaaf,
        sample_weight=tr_1["gp_curr"].to_numpy(float),
    )

    p_hat_oos = []
    leg_oos = []
    for _, r in te_2.iterrows():
        x_v = [float(r[f"{c}_prev"]) for c in feat_cols]
        w_lin = clamp(_predict_linear(win_m1, x_v), 0.08, 0.92)
        srs_proj = _predict_linear(srs_m1, x_v)
        # Margen esperado contra el calendario medio del programa (srs_proj - sos_prev*0.55)
        w_norm = normal_cdf((srs_proj - 0.55 * float(r["sos_prev"])) / season_margin_sigma_cfb)
        p_hat_oos.append(0.55 * w_lin + 0.45 * w_norm)
        # Legacy engine-ncaa.ts usa únicamente (PPG - LG) + (LG - OPPG) = PPG - OPPG sin SOS ni FPI
        leg_oos.append(normal_cdf(float(r["margin_pg_prev"]) / season_margin_sigma_cfb))

    oos_metrics = compute_season_oos_metrics(
        te_2["win_pct_curr"].to_numpy(float),
        np.array(p_hat_oos),
        te_2["gp_curr"].to_numpy(float),
        te_2["win_pct_prev"].to_numpy(float),
        np.array(leg_oos),
    )

    w_all = tr_df["gp_curr"].to_numpy(float)
    srs_model = _fit_standardized_ridge(
        tr_df[[f"{c}_prev" for c in feat_cols]].to_numpy(float),
        tr_df["srs_curr"].to_numpy(float),
        alpha=alpha_ncaaf,
        sample_weight=w_all,
    )

    s25 = df[df["season"] == 2025].set_index("fk")
    s26 = df[df["season"] == 2026].set_index("fk")
    lg_ppg = float(s25["ppg"].mean())
    lg_ypp = float(s25["off_ypp"].mean())

    # Elevaciones exactas verificadas para estadios universitarios de gran altitud (>= 1150 m)
    high_alt_cfb_m = {
        "ncaaf_wyoming_cowboys": 2199.0,
        "ncaaf_air_force_falcons": 2029.0,
        "ncaaf_colorado_buffaloes": 1634.0,
        "ncaaf_new_mexico_lobos": 1554.0,
        "ncaaf_colorado_state_rams": 1525.0,
        "ncaaf_utah_state_aggies": 1436.0,
        "ncaaf_byu_cougars": 1417.0,
        "ncaaf_utah_utes": 1415.0,
        "ncaaf_nevada_wolf_pack": 1405.0,
        "ncaaf_new_mexico_state_aggies": 1196.0,
        "ncaaf_utep_miners": 1190.0,
    }

    teams_dict: dict[str, dict[str, Any]] = {}
    aliases: dict[str, str] = {}
    for fk, r26 in sorted(s26.iterrows()):
        r25 = s25.loc[fk] if fk in s25.index else r26
        gp26 = float(r26["gp"])
        w_curr = gp26 / (gp26 + 6.0) if fk in s25.index else 0.75

        def _b(col: str) -> float:
            return (1.0 - w_curr) * float(r25[col]) + w_curr * float(r26[col])

        t_name = str(r26["team_name"])
        school_short = t_name.rsplit(" ", 1)[0] if " " in t_name else t_name
        stad = _match_team_aux(
            stadium_lookup,
            "ncaaf",
            [fk, t_name, school_short],
            {"stadium_name": "", "stadium_elevation_m": 180.0, "roof_type": "open", "is_dome": False},
        )
        elev_m = high_alt_cfb_m.get(fk, float(stad.get("stadium_elevation_m", 180.0)))
        roof_type = str(stad.get("roof_type", "open")).lower()
        is_dome = roof_type in ("dome", "indoor", "closed")
        inj = _match_team_aux(
            ra_lookup["injuries"],
            "ncaaf",
            [t_name, school_short],
            {"out": 0, "questionable": 0, "qb_out": 0},
        )

        f_vec = [_b(c) for c in feat_cols]
        srs_proj = _predict_linear(srs_model, f_vec)
        # Rating estructural híbrido: combina regresión causal S-1->S con FPI/SRS/SOS actual
        power_rtg = 0.50 * srs_proj + 0.30 * _b("espn_fpi") + 0.20 * (_b("srs") + 0.25 * _b("sos"))
        p4_flag = _b("sos") >= 1.5

        shrunk_ppg = 0.68 * _b("ppg") + 0.32 * lg_ppg
        shrunk_oppg = 0.68 * _b("oppg") + 0.32 * lg_ppg

        teams_dict[fk] = {
            "team_id": fk,
            "team_name": t_name,
            "power_rating_pts": round(power_rtg, 6),
            "espn_fpi": round(_b("espn_fpi"), 4),
            "srs": round(_b("srs"), 4),
            "sos": round(_b("sos"), 4),
            "is_power_conference_schedule": bool(p4_flag),
            "off_ypp": round(_b("off_ypp"), 4),
            "def_ypp": round(_b("def_ypp"), 4),
            "net_ypp": round(_b("net_ypp"), 4),
            "pythag_237": round(_b("pythag_237"), 6),
            "ppg": round(shrunk_ppg, 4),
            "oppg": round(shrunk_oppg, 4),
            "active_qb_injured": int(inj.get("qb_out", 0)),
            "active_injuries_out": int(inj["out"]),
            "active_injuries_questionable": int(inj["questionable"]),
            "stadium_name": stad.get("stadium_name", ""),
            "stadium_elevation_m": elev_m,
            "roof_type": roof_type,
            "is_dome": is_dome,
            "max_wind_speed_mph_7d": float(stad.get("max_wind_speed_mph_7d", 0.0)),
            "total_precipitation_mm_7d": float(stad.get("total_precipitation_mm_7d", 0.0)),
        }
        aliases[_slug(fk)] = fk
        aliases[_slug(t_name)] = fk
        aliases[_slug(school_short)] = fk
        # Variantes ASCII / sin apóstrofes (ej. "Hawai'i" -> "Hawaii", "San José" -> "San Jose")
        import unicodedata
        ascii_name = unicodedata.normalize("NFKD", t_name).encode("ascii", "ignore").decode("ascii")
        ascii_no_apos = re.sub(r"['’`]", "", ascii_name)
        ascii_short = ascii_no_apos.rsplit(" ", 1)[0] if " " in ascii_no_apos else ascii_no_apos
        for v_al in (ascii_name, ascii_no_apos, ascii_short):
            if v_al:
                aliases[_slug(v_al)] = fk
        # Mascotas de dos palabras (ej. "Rainbow Warriors", "Fighting Irish", "Crimson Tide", "Red Raiders", "Nittany Lions")
        words_clean = ascii_no_apos.split()
        if len(words_clean) >= 3:
            two_word_drop = " ".join(words_clean[:-2])
            if len(two_word_drop) >= 3 and _slug(two_word_drop) not in aliases:
                aliases[_slug(two_word_drop)] = fk
        extra_cfb_aliases = {
            "ncaaf_app_state_mountaineers": ["appalachian_state", "appalachian_state_mountaineers"],
            "ncaaf_uconn_huskies": ["connecticut", "connecticut_huskies"],
            "ncaaf_massachusetts_minutemen": ["umass", "umass_minutemen"],
            "ncaaf_ul_monroe_warhawks": ["louisiana_monroe", "ulm", "ulm_warhawks"],
            "ncaaf_southern_miss_golden_eagles": ["southern_mississippi", "usm"],
            "ncaaf_ole_miss_rebels": ["mississippi", "mississippi_rebels"],
            "ncaaf_miami_hurricanes": ["miami_fl", "miami_fl_hurricanes"],
            "ncaaf_nc_state_wolfpack": ["north_carolina_state"],
            "ncaaf_utep_miners": ["texas_el_paso"],
            "ncaaf_utsa_roadrunners": ["texas_san_antonio"],
            "ncaaf_fiu_panthers": ["florida_international"],
            "ncaaf_florida_international_panthers": ["fiu", "fiu_panthers"],
            "ncaaf_florida_atlantic_owls": ["fau", "fau_owls"],
            "ncaaf_south_florida_bulls": ["usf", "usf_bulls"],
            "ncaaf_central_michigan_chippewas": ["cmu"],
            "ncaaf_western_michigan_broncos": ["wmu"],
            "ncaaf_eastern_michigan_eagles": ["emu"],
            "ncaaf_northern_illinois_huskies": ["niu"],
            "ncaaf_middle_tennessee_blue_raiders": ["mtsu"],
            "ncaaf_western_kentucky_hilltoppers": ["wku"],
        }
        for ex_al in extra_cfb_aliases.get(fk, []):
            aliases[ex_al] = fk

    # Registrar también todas las abreviaturas cortas de `src/data/ncaa-teams.json` (ej. UGA, ALA, OSU, WYO, AF, HAW)
    ncaa_legacy_path = WORKTREE_ROOT / "src" / "data" / "ncaa-teams.json"
    if ncaa_legacy_path.exists():
        legacy_ncaa = json.loads(ncaa_legacy_path.read_text(encoding="utf-8"))
        for short_code, meta in legacy_ncaa.items():
            school_label = str(meta[0]) if isinstance(meta, list) and meta else ""
            sc_slug = _slug(short_code)
            target_sl = _slug(school_label)
            if sc_slug and target_sl in aliases:
                aliases[sc_slug] = aliases[target_sl]

    artifact_ncaaf = {
        "sport": "ncaaf",
        "codename": MULTISPORT_CODENAMES["ncaaf"],
        "version": MULTISPORT_VERSION,
        "feature_order": feat_cols,
        "srs_model": srs_model,
        "priors": {
            "sigma_margin": sigma_ncaaf,
            "home_field_pts": 2.80,
            "league_ppg": round(lg_ppg, 4),
            "league_ypp": round(lg_ypp, 4),
            "ypp_total_pts_scale": 3.20,
            "altitude_threshold_m": 1150.0,
            "altitude_diff_min_m": 750.0,
            "altitude_anchor_m": 1600.0,
            "w_altitude_outdoor_pts": 2.15,
            "dome_altitude_mult": 0.65,
            "qb_injured_pts_pen": 3.40,
            "injury_out_pts_pen": 0.32,
            "injury_quest_pts_pen": 0.14,
            "injury_max_margin_pts": 8.50,
            "wind_threshold_mph": 15.0,
            "wind_total_pts_per_mph": -0.24,
            "precip_threshold_mm": 1.5,
            "precip_total_pts_per_mm": -0.20,
            "weather_margin_damping_wind": 0.0035,
            "weather_margin_damping_precip": 0.0025,
            "weather_max_damping": 0.12,
        },
        "teams": teams_dict,
        "aliases": aliases,
    }
    return artifact_ncaaf, oos_metrics


# ============================================================================
# Inferencia Determinista Exacta (espejo 1:1 con `src/domain/prediction/multisport.ts`)
# ============================================================================

def _resolve_team_entry(sport_cfg: Mapping[str, Any], team_id_or_name: str) -> dict[str, Any]:
    teams = sport_cfg["teams"]
    aliases = sport_cfg.get("aliases", {})
    raw = str(team_id_or_name or "").strip()
    if raw in teams:
        return dict(teams[raw])
    up = raw.upper()
    if up in teams:
        return dict(teams[up])
    sl = _slug(raw)
    if sl in teams:
        return dict(teams[sl])
    if sl in aliases and aliases[sl] in teams:
        return dict(teams[aliases[sl]])
    raise KeyError(f"Unknown {sport_cfg.get('sport')} team: {team_id_or_name!r}")


def predict_nhl(matchup: Mapping[str, Any], artifact: Mapping[str, Any]) -> dict[str, Any]:
    cfg = artifact["sports"]["nhl"] if "sports" in artifact else artifact
    p = cfg["priors"]
    h = _resolve_team_entry(cfg, str(matchup.get("homeTeam", matchup.get("home_team", ""))))
    a = _resolve_team_entry(cfg, str(matchup.get("awayTeam", matchup.get("away_team", ""))))

    neutral_site = bool(matchup.get("neutralSite", matchup.get("neutral_site", False)))

    # Si se pasan métricas en vivo ad-hoc del equipo, recalcular fuerza estructural al vuelo
    for side_prefix, entry in (("home", h), ("away", a)):
        ov_xg_pct = _num(matchup.get(f"{side_prefix}XgPct", matchup.get(f"{side_prefix}_xg_pct")))
        ov_corsi = _num(matchup.get(f"{side_prefix}CorsiPct", matchup.get(f"{side_prefix}_corsi_pct")))
        ov_fenwick = _num(matchup.get(f"{side_prefix}FenwickPct", matchup.get(f"{side_prefix}_fenwick_pct")))
        ov_hd = _num(matchup.get(f"{side_prefix}HighDangerXgFor", matchup.get(f"{side_prefix}_high_danger_xg_for")))
        ov_pyth = _num(matchup.get(f"{side_prefix}Pythag215", matchup.get(f"{side_prefix}_pythag_215")))
        if any(v is not None for v in (ov_xg_pct, ov_corsi, ov_fenwick, ov_hd, ov_pyth)):
            gp_ov = _num(matchup.get(f"{side_prefix}GamesPlayed", matchup.get(f"{side_prefix}_games_played")), 82.0) or 82.0
            if ov_xg_pct is not None:
                entry["xg_pct"] = ov_xg_pct * 100.0 if ov_xg_pct <= 1.5 else ov_xg_pct
            if ov_corsi is not None:
                entry["corsi_pct"] = ov_corsi * 100.0 if ov_corsi <= 1.5 else ov_corsi
            if ov_fenwick is not None:
                entry["fenwick_pct"] = ov_fenwick * 100.0 if ov_fenwick <= 1.5 else ov_fenwick
            if ov_hd is not None:
                entry["hd_xgf_pg"] = ov_hd / gp_ov if ov_hd > 10.0 else ov_hd
            if ov_pyth is not None:
                entry["pythag_215"] = ov_pyth / 100.0 if ov_pyth > 1.5 else ov_pyth
            f_vec = [float(entry[c]) for c in cfg["feature_order"]]
            entry["strength_prob"] = logistic(_predict_linear(cfg["strength_model"], f_vec))
            entry["proj_gf_pg"] = clamp(
                _predict_linear(cfg["gf_model"], [float(entry[c]) for c in cfg["off_feature_order"]]),
                2.15,
                4.15,
            )
            entry["proj_ga_pg"] = clamp(
                _predict_linear(cfg["ga_model"], [float(entry[c]) for c in cfg["def_feature_order"]]),
                2.15,
                4.15,
            )

    strength_h = float(h["strength_prob"])
    strength_a = float(a["strength_prob"])
    p_neutral = log5(strength_h, strength_a)
    structural_logit = logit_fn(p_neutral)

    # Ajuste de portero titular (SV% y/o GAA respecto a media de liga .905 / 2.92)
    def _goalie_gsaa(prefix: str, entry: Mapping[str, Any]) -> float:
        sv = _num(
            matchup.get(f"{prefix}GoalieSvPct", matchup.get(f"{prefix}_goalie_sv_pct")),
            float(entry.get("default_goalie_sv_pct", p["league_sv_pct"])),
        )
        gaa = _num(
            matchup.get(f"{prefix}GoalieGaa", matchup.get(f"{prefix}_goalie_gaa")),
            None,
        )
        conf_raw = matchup.get(f"{prefix}GoalieConfirmed", matchup.get(f"{prefix}_goalie_confirmed"))
        if conf_raw is None:
            is_conf = bool(entry.get("default_goalie_confirmed", False))
        else:
            is_conf = bool(conf_raw)
        conf_w = float(p["goalie_confirmed_weight"]) if is_conf else float(p["goalie_projected_weight"])
        sv_val = float(sv if sv is not None else p["league_sv_pct"])
        if sv_val > 1.5:
            sv_val = sv_val / 100.0
        gsaa_sv = (
            clamp(sv_val - float(p["league_sv_pct"]), -0.035, 0.030)
            * float(p["shots_per_game"])
            * float(p["goalie_sv_shrink"])
        )
        if gaa is not None:
            gsaa_gaa = clamp(float(p["league_gaa"]) - float(gaa), -1.20, 1.20) * 0.40
            raw_gsaa = 0.70 * gsaa_sv + 0.30 * gsaa_gaa
        else:
            raw_gsaa = gsaa_sv
        return conf_w * raw_gsaa

    gsaa_h = _goalie_gsaa("home", h)
    gsaa_a = _goalie_gsaa("away", a)
    goalie_logit_delta = float(p["goalie_logit_per_goal"]) * (gsaa_h - gsaa_a)

    # Penalización por bajas
    h_out = _num(matchup.get("homeInjuriesOut", matchup.get("home_injuries_out")), float(h["active_injuries_out"])) or 0.0
    a_out = _num(matchup.get("awayInjuriesOut", matchup.get("away_injuries_out")), float(a["active_injuries_out"])) or 0.0
    h_q = _num(
        matchup.get("homeInjuriesQuestionable", matchup.get("home_injuries_questionable")),
        float(h["active_injuries_questionable"]),
    ) or 0.0
    a_q = _num(
        matchup.get("awayInjuriesQuestionable", matchup.get("away_injuries_questionable")),
        float(a["active_injuries_questionable"]),
    ) or 0.0

    pen_h = min(float(p["injury_max_goal_pen"]), float(p["injury_out_goal_pen"]) * h_out + float(p["injury_quest_goal_pen"]) * h_q)
    pen_a = min(float(p["injury_max_goal_pen"]), float(p["injury_out_goal_pen"]) * a_out + float(p["injury_quest_goal_pen"]) * a_q)
    injury_logit_delta = float(p["injury_logit_per_goal"]) * (pen_a - pen_h)

    # Ventaja de hielo local + altitud (Colorado / Utah)
    h_elev = _num(matchup.get("stadiumElevationM", matchup.get("stadium_elevation_m")), float(h["stadium_elevation_m"])) or 120.0
    a_elev = _num(matchup.get("awayElevationM", matchup.get("away_elevation_m")), float(a["stadium_elevation_m"])) or 120.0
    alt_diff = max(0.0, h_elev - a_elev)

    if neutral_site:
        hfa_logit = 0.0
        alt_logit = 0.0
        h_goal_hfa = 0.0
        a_goal_hfa = 0.0
        alt_goals = 0.0
    else:
        hfa_logit = float(p["home_ice_logit"])
        h_goal_hfa = float(p["home_goal_boost"])
        a_goal_hfa = float(p["away_goal_Drag"])
        if h_elev >= float(p["altitude_threshold_m"]) and alt_diff >= float(p["altitude_diff_min_m"]):
            alt_logit = clamp(float(p["w_altitude_logit"]) * (alt_diff / 1500.0), 0.0, 0.08)
            alt_goals = clamp(float(p["w_altitude_goals"]) * (alt_diff / 1500.0), 0.0, 0.10)
        else:
            alt_logit = 0.0
            alt_goals = 0.0

    lg_goals = float(p["league_goals_per_team"])
    raw_gf_h = (
        (float(h["proj_gf_pg"]) * float(a["proj_ga_pg"])) / lg_goals
        + h_goal_hfa
        + alt_goals
        - gsaa_a
        - 0.65 * pen_h
        + 0.35 * pen_a
    )
    raw_gf_a = (
        (float(a["proj_gf_pg"]) * float(h["proj_ga_pg"])) / lg_goals
        + a_goal_hfa
        - gsaa_h
        - 0.65 * pen_a
        + 0.35 * pen_h
    )

    exp_goals_home = clamp(raw_gf_h, 1.50, 5.20)
    exp_goals_away = clamp(raw_gf_a, 1.50, 5.20)
    exp_total_goals = exp_goals_home + exp_goals_away

    logit_2way = structural_logit + hfa_logit + alt_logit + goalie_logit_delta + injury_logit_delta
    p_home = clamp(logistic(logit_2way), 1e-6, 1.0 - 1e-6)
    p_away = 1.0 - p_home

    p_ot_reg = clamp(
        float(p["ot_base_rate"])
        * math.exp(-float(p["ot_logit_decay"]) * logit_2way * logit_2way)
        * math.exp(-float(p["ot_total_goals_decay"]) * (exp_total_goals - float(p["ot_total_goals_anchor"]))),
        0.10,
        0.30,
    )
    ot_home_share = clamp(0.5 + float(p["ot_home_edge_share"]) * (p_home - 0.5), 0.35, 0.65)
    p_home_reg = clamp(p_home - p_ot_reg * ot_home_share, 0.01, 1.0 - p_ot_reg - 0.01)
    p_away_reg = 1.0 - p_home_reg - p_ot_reg

    drivers = [
        {
            "factor": "even_strength_xg_possession",
            "label": "5v5 xG%, Corsi%, Fenwick%, High-Danger xG/60 & Pythag 2.15",
            "homeValue": float(h["xg_pct"]),
            "awayValue": float(a["xg_pct"]),
            "impactLogit": structural_logit,
            "impactUnits": float(h["proj_gf_pg"]) - float(a["proj_gf_pg"]),
        },
        {
            "factor": "starting_goalie_matchup",
            "label": "Starting Goalie SV% / GAA vs .905 NHL Baseline",
            "homeValue": gsaa_h,
            "awayValue": gsaa_a,
            "impactLogit": goalie_logit_delta,
            "impactUnits": gsaa_h - gsaa_a,
        },
        {
            "factor": "skater_injuries",
            "label": "Active Roster Absences (Out/IR & Day-to-Day)",
            "homeValue": -pen_h,
            "awayValue": -pen_a,
            "impactLogit": injury_logit_delta,
            "impactUnits": pen_a - pen_h,
        },
        {
            "factor": "home_ice_and_altitude",
            "label": "Home Ice Advantage (~54.5%) & High-Altitude Shock",
            "homeValue": h_elev,
            "awayValue": a_elev,
            "impactLogit": hfa_logit + alt_logit,
            "impactUnits": (h_goal_hfa - a_goal_hfa) + alt_goals,
        },
    ]

    return {
        "sport": "nhl",
        "modelId": MULTISPORT_CODENAMES["nhl"],
        "homeTeam": h["team_abbr"],
        "awayTeam": a["team_abbr"],
        "pHome": p_home,
        "pAway": p_away,
        "pHomeReg": p_home_reg,
        "pOtReg": p_ot_reg,
        "pAwayReg": p_away_reg,
        "expectedGoalsHome": exp_goals_home,
        "expectedGoalsAway": exp_goals_away,
        "expectedTotalGoals": exp_total_goals,
        "drivers": drivers,
    }


def predict_mlb(matchup: Mapping[str, Any], artifact: Mapping[str, Any]) -> dict[str, Any]:
    cfg = artifact["sports"]["mlb"] if "sports" in artifact else artifact
    p = cfg["priors"]
    h = _resolve_team_entry(cfg, str(matchup.get("homeTeam", matchup.get("home_team", ""))))
    a = _resolve_team_entry(cfg, str(matchup.get("awayTeam", matchup.get("away_team", ""))))
    neutral_site = bool(matchup.get("neutralSite", matchup.get("neutral_site", False)))

    # Ajuste de pitcher abridor confirmado / proyectado
    def _starter_run_delta(prefix: str, entry: Mapping[str, Any]) -> float:
        sp_fip = _num(matchup.get(f"{prefix}StarterFip", matchup.get(f"{prefix}_starter_fip")))
        sp_era = _num(matchup.get(f"{prefix}StarterEra", matchup.get(f"{prefix}_starter_era")))
        if sp_fip is None and sp_era is None:
            return 0.0
        if sp_fip is not None and sp_era is not None:
            eff_sp = 0.65 * sp_fip + 0.35 * sp_era
        elif sp_fip is not None:
            eff_sp = sp_fip
        else:
            eff_sp = float(sp_era)
        conf_raw = matchup.get(f"{prefix}StarterConfirmed", matchup.get(f"{prefix}_starter_confirmed"))
        conf_w = (
            float(p["starter_confirmed_weight"])
            if (conf_raw is None or bool(conf_raw))
            else float(p["starter_projected_weight"])
        )
        base_rot = float(entry.get("rotation_baseline_era", p["league_fip"]))
        return clamp(float(p["starter_innings_weight"]) * conf_w * (eff_sp - base_rot), -1.15, 1.15)

    sp_delta_h = _starter_run_delta("home", h)  # >0 = peor que rotación base => rival anota más
    sp_delta_a = _starter_run_delta("away", a)

    # Lesiones de lineup/bullpen
    h_out = min(
        8.0,
        _num(matchup.get("homeInjuriesOut", matchup.get("home_injuries_out")), float(h["active_injuries_out"])) or 0.0,
    )
    a_out = min(
        8.0,
        _num(matchup.get("awayInjuriesOut", matchup.get("away_injuries_out")), float(a["active_injuries_out"])) or 0.0,
    )
    h_q = _num(
        matchup.get("homeInjuriesQuestionable", matchup.get("home_injuries_questionable")),
        float(h["active_injuries_questionable"]),
    ) or 0.0
    a_q = _num(
        matchup.get("awayInjuriesQuestionable", matchup.get("away_injuries_questionable")),
        float(a["active_injuries_questionable"]),
    ) or 0.0

    inj_h = min(float(p["injury_max_run_pen"]), float(p["injury_out_run_pen"]) * h_out + float(p["injury_quest_run_pen"]) * h_q)
    inj_a = min(float(p["injury_max_run_pen"]), float(p["injury_out_run_pen"]) * a_out + float(p["injury_quest_run_pen"]) * a_q)

    # Física barométrica del parque y clima Open-Meteo
    explicit_dome = matchup.get("isDome", matchup.get("is_dome"))
    roof_open = matchup.get("roofOpen", matchup.get("roof_open"))
    if isinstance(explicit_dome, bool):
        is_dome = explicit_dome
    elif isinstance(roof_open, bool):
        is_dome = not roof_open
    else:
        is_dome = bool(h["is_dome"])

    h_elev = _num(matchup.get("stadiumElevationM", matchup.get("stadium_elevation_m")), float(h["stadium_elevation_m"])) or 100.0
    a_elev = _num(matchup.get("awayElevationM", matchup.get("away_elevation_m")), float(a["stadium_elevation_m"])) or 100.0
    pres_hpa = _num(
        matchup.get("surfacePressureHpa", matchup.get("surface_pressure_hpa")),
        1013.25 * math.exp(-h_elev / 8434.5)
        if matchup.get("stadiumElevationM", matchup.get("stadium_elevation_m")) is not None
        else float(h["structural_pressure_hpa"]),
    ) or 1001.0

    if is_dome:
        park_mult = 1.0
        weather_mult = 1.0
    else:
        low_p_delta = max(0.0, float(p["pressure_anchor_hpa"]) - pres_hpa)
        park_mult = clamp(1.0 + float(p["barometric_run_slope_per_hpa"]) * low_p_delta, 0.96, 1.24)
        wind_mph = _num(matchup.get("windMph", matchup.get("wind_mph", matchup.get("max_wind_speed_mph"))), 0.0) or 0.0
        precip_mm = _num(matchup.get("precipitationMm", matchup.get("precipitation_mm")), 0.0) or 0.0
        wind_out = bool(matchup.get("windBlowingOut", matchup.get("wind_blowing_out", False)))
        if wind_mph > float(p["wind_threshold_mph"]):
            slope = float(p["wind_out_slope_per_mph"]) if wind_out else float(p["wind_cross_in_slope_per_mph"])
            w_adj = slope * min(20.0, wind_mph - float(p["wind_threshold_mph"]))
        else:
            w_adj = 0.0
        p_adj = (
            float(p["precip_run_slope_per_mm"]) * min(12.0, precip_mm - float(p["precip_threshold_mm"]))
            if precip_mm > float(p["precip_threshold_mm"])
            else 0.0
        )
        weather_mult = clamp(1.0 + w_adj + p_adj, 0.88, 1.12)

    env_mult = park_mult * weather_mult
    lg_runs = float(p["league_runs_per_team"])

    h_split = 0.0 if neutral_site else float(p["home_run_split_boost"])
    a_split = 0.0 if neutral_site else float(p["away_run_split_drag"])

    eff_rs_h = clamp(float(h["proj_rs_pg"]) - 0.65 * inj_h, 2.5, 6.8)
    eff_ra_h = clamp(float(h["proj_ra_pg"]) + sp_delta_h + 0.35 * inj_h, 2.3, 6.8)
    eff_rs_a = clamp(float(a["proj_rs_pg"]) - 0.65 * inj_a, 2.5, 6.8)
    eff_ra_a = clamp(float(a["proj_ra_pg"]) + sp_delta_a + 0.35 * inj_a, 2.3, 6.8)

    raw_runs_h = ((eff_rs_h * eff_ra_a) / lg_runs + h_split) * env_mult
    raw_runs_a = ((eff_rs_a * eff_ra_h) / lg_runs + a_split) * env_mult

    exp_runs_home = clamp(raw_runs_h, 1.60, 9.80)
    exp_runs_away = clamp(raw_runs_a, 1.60, 9.80)
    exp_total_runs = exp_runs_home + exp_runs_away
    exp_run_margin = exp_runs_home - exp_runs_away

    # Exponente dinámico Pythagenpat + Bill James Log5
    pythagenpat_exp = clamp(safe_pow(exp_total_runs, float(p["pythagenpat_power"])), 1.65, 2.15)
    py_h_eff = safe_pow(eff_rs_h, pythagenpat_exp) / (
        safe_pow(eff_rs_h, pythagenpat_exp) + safe_pow(eff_ra_h, pythagenpat_exp)
    )
    py_a_eff = safe_pow(eff_rs_a, pythagenpat_exp) / (
        safe_pow(eff_rs_a, pythagenpat_exp) + safe_pow(eff_ra_a, pythagenpat_exp)
    )
    # Mezcla fuerza estructural S-1->S con fuerza del partido ajustada por abridor y lesiones
    s_home = 0.65 * py_h_eff + 0.35 * float(h["talent_win_pct"])
    s_away = 0.65 * py_a_eff + 0.35 * float(a["talent_win_pct"])
    p_neutral = log5(s_home, s_away)

    if neutral_site:
        hfa_prob = 0.5
    else:
        coors_boost = (
            float(p["coors_acclimation_prob_boost"])
            if (h_elev >= 1500.0 and (h_elev - a_elev) >= 800.0)
            else 0.0
        )
        hfa_prob = float(p["home_field_prob"]) + coors_boost

    p_home = clamp(log5(p_neutral, hfa_prob), 1e-6, 1.0 - 1e-6)
    p_away = 1.0 - p_home

    drivers = [
        {
            "factor": "fip_woba_pythag_structure",
            "label": "Pythagorean 1.83 + FIP / (ERA-FIP) Regression + wOBA / OPS+",
            "homeValue": float(h["talent_win_pct"]),
            "awayValue": float(a["talent_win_pct"]),
            "impactLogit": logit_fn(log5(float(h["talent_win_pct"]), float(a["talent_win_pct"]))),
            "impactUnits": (float(h["proj_rs_pg"]) - float(h["proj_ra_pg"]))
            - (float(a["proj_rs_pg"]) - float(a["proj_ra_pg"])),
        },
        {
            "factor": "starting_pitcher_matchup",
            "label": "Confirmed/Projected Starting Pitcher FIP & ERA vs Rotation",
            "homeValue": -sp_delta_h,
            "awayValue": -sp_delta_a,
            "impactLogit": logit_fn(p_neutral) - logit_fn(log5(float(h["talent_win_pct"]), float(a["talent_win_pct"]))),
            "impactUnits": sp_delta_a - sp_delta_h,
        },
        {
            "factor": "park_barometric_and_weather",
            "label": f"Ballpark Barometric Physics ({pres_hpa:.1f} hPa) & Open-Meteo",
            "homeValue": env_mult,
            "awayValue": pythagenpat_exp,
            "impactLogit": logit_fn(p_home) - logit_fn(p_neutral),
            "impactUnits": (env_mult - 1.0) * (exp_total_runs / max(env_mult, 0.5)),
        },
        {
            "factor": "roster_injuries",
            "label": "Active Lineup & Bullpen Injuries",
            "homeValue": -inj_h,
            "awayValue": -inj_a,
            "impactLogit": 0.18 * (inj_a - inj_h),
            "impactUnits": inj_a - inj_h,
        },
    ]

    return {
        "sport": "mlb",
        "modelId": MULTISPORT_CODENAMES["mlb"],
        "homeTeam": h["team_abbr"],
        "awayTeam": a["team_abbr"],
        "pHome": p_home,
        "pAway": p_away,
        "pythagenpatExponent": pythagenpat_exp,
        "parkRunMultiplier": env_mult,
        "expectedRunsHome": exp_runs_home,
        "expectedRunsAway": exp_runs_away,
        "expectedTotalRuns": exp_total_runs,
        "expectedRunMargin": exp_run_margin,
        "drivers": drivers,
    }


def predict_nba(matchup: Mapping[str, Any], artifact: Mapping[str, Any]) -> dict[str, Any]:
    cfg = artifact["sports"]["nba"] if "sports" in artifact else artifact
    p = cfg["priors"]
    h = _resolve_team_entry(cfg, str(matchup.get("homeTeam", matchup.get("home_team", ""))))
    a = _resolve_team_entry(cfg, str(matchup.get("awayTeam", matchup.get("away_team", ""))))
    neutral_site = bool(matchup.get("neutralSite", matchup.get("neutral_site", False)))

    # Interacción de ritmo (possessions/48m)
    h_pace = _num(matchup.get("homePace", matchup.get("home_pace")), float(h["pace"])) or float(p["league_pace"])
    a_pace = _num(matchup.get("awayPace", matchup.get("away_pace")), float(a["pace"])) or float(p["league_pace"])
    exp_pace = clamp(
        float(p["pace_shrink"]) * (0.5 * (h_pace + a_pace)) + (1.0 - float(p["pace_shrink"])) * float(p["league_pace"]),
        92.0,
        106.5,
    )
    pace_scale = exp_pace / 100.0

    rtg_h = float(h["power_rating_pts"])
    rtg_a = float(a["power_rating_pts"])
    structural_margin = pace_scale * (rtg_h - rtg_a)

    # Ventaja de localía NBA (~+2.4 pts) + fatiga fisiológica de altitud (Denver 1609 m / Utah 1288 m)
    h_elev = _num(matchup.get("stadiumElevationM", matchup.get("stadium_elevation_m")), float(h["stadium_elevation_m"])) or 150.0
    a_elev = _num(matchup.get("awayElevationM", matchup.get("away_elevation_m")), float(a["stadium_elevation_m"])) or 150.0
    alt_diff = max(0.0, h_elev - a_elev)

    if neutral_site:
        hca_pts = 0.0
        alt_pts = 0.0
    else:
        hca_pts = float(p["home_court_pts"])
        if h_elev >= float(p["altitude_threshold_m"]) and alt_diff >= float(p["altitude_diff_min_m"]):
            alt_pts = clamp(
                float(p["w_altitude_pts"]) * (alt_diff / float(p["denver_altitude_anchor_m"])),
                0.0,
                2.10,
            )
        else:
            alt_pts = 0.0

    # Lesiones confirmadas (Out y Doubtful/GTD)
    h_out = _num(matchup.get("homeInjuriesOut", matchup.get("home_injuries_out")), float(h["active_injuries_out"])) or 0.0
    a_out = _num(matchup.get("awayInjuriesOut", matchup.get("away_injuries_out")), float(a["active_injuries_out"])) or 0.0
    h_q = _num(
        matchup.get("homeInjuriesQuestionable", matchup.get("home_injuries_questionable")),
        float(h["active_injuries_questionable"]),
    ) or 0.0
    a_q = _num(
        matchup.get("awayInjuriesQuestionable", matchup.get("away_injuries_questionable")),
        float(a["active_injuries_questionable"]),
    ) or 0.0

    injury_margin = clamp(
        float(p["injury_out_pts_pen"]) * (a_out - h_out) + float(p["injury_doubtful_pts_pen"]) * (a_q - h_q),
        -float(p["injury_max_margin_pts"]),
        float(p["injury_max_margin_pts"]),
    )

    exp_margin = structural_margin + hca_pts + alt_pts + injury_margin
    base_total = (
        exp_pace * ((float(h["ortg"]) + float(a["drtg"]) + float(a["ortg"]) + float(h["drtg"])) / 200.0)
        - float(p["injury_total_pts_drag"]) * min(10.0, h_out + a_out)
    )
    exp_total_pts = clamp(base_total, 198.0, 254.0)
    exp_pts_home = 0.5 * (exp_total_pts + exp_margin)
    exp_pts_away = exp_total_pts - exp_pts_home

    sigma = float(p["sigma_margin"])
    p_home = clamp(normal_cdf(exp_margin / sigma), 1e-6, 1.0 - 1e-6)
    p_away = 1.0 - p_home

    drivers = [
        {
            "factor": "net_rtg_srs_four_factors",
            "label": "Net Rating, SRS, Pythag 13.91, Pace & Four Factors (eFG%, TOV%, ORB%, FT/FGA)",
            "homeValue": rtg_h,
            "awayValue": rtg_a,
            "impactLogit": structural_margin / sigma,
            "impactUnits": structural_margin,
        },
        {
            "factor": "nba_hca_and_altitude",
            "label": "NBA Home Court (+2.4 pts) & Altitude Fatigue (Denver/Utah)",
            "homeValue": h_elev,
            "awayValue": a_elev,
            "impactLogit": (hca_pts + alt_pts) / sigma,
            "impactUnits": hca_pts + alt_pts,
        },
        {
            "factor": "rotation_injuries",
            "label": "Confirmed Rotation Absences (Out & Doubtful/GTD)",
            "homeValue": -h_out,
            "awayValue": -a_out,
            "impactLogit": injury_margin / sigma,
            "impactUnits": injury_margin,
        },
    ]

    return {
        "sport": "nba",
        "modelId": MULTISPORT_CODENAMES["nba"],
        "homeTeam": h["team_abbr"],
        "awayTeam": a["team_abbr"],
        "pHome": p_home,
        "pAway": p_away,
        "expectedPace": exp_pace,
        "expectedMargin": exp_margin,
        "expectedPointsHome": exp_pts_home,
        "expectedPointsAway": exp_pts_away,
        "expectedTotalPoints": exp_total_pts,
        "drivers": drivers,
    }


def predict_ncaaf(matchup: Mapping[str, Any], artifact: Mapping[str, Any]) -> dict[str, Any]:
    cfg = artifact["sports"]["ncaaf"] if "sports" in artifact else artifact
    p = cfg["priors"]
    h = _resolve_team_entry(cfg, str(matchup.get("homeTeam", matchup.get("home_team", ""))))
    a = _resolve_team_entry(cfg, str(matchup.get("awayTeam", matchup.get("away_team", ""))))
    neutral_site = bool(matchup.get("neutralSite", matchup.get("neutral_site", False)))

    rtg_h = float(h["power_rating_pts"])
    rtg_a = float(a["power_rating_pts"])
    structural_margin = rtg_h - rtg_a

    explicit_dome = matchup.get("isDome", matchup.get("is_dome"))
    is_dome = bool(explicit_dome) if isinstance(explicit_dome, bool) else bool(h["is_dome"])

    h_elev = _num(matchup.get("stadiumElevationM", matchup.get("stadium_elevation_m")), float(h["stadium_elevation_m"])) or 180.0
    a_elev = _num(matchup.get("awayElevationM", matchup.get("away_elevation_m")), float(a["stadium_elevation_m"])) or 180.0
    alt_diff = max(0.0, h_elev - a_elev)

    if neutral_site:
        hfa_pts = 0.0
        alt_pts = 0.0
    else:
        hfa_pts = float(p["home_field_pts"])
        if h_elev >= float(p["altitude_threshold_m"]) and alt_diff >= float(p["altitude_diff_min_m"]):
            dome_mult = float(p["dome_altitude_mult"]) if is_dome else 1.0
            alt_pts = clamp(
                dome_mult * float(p["w_altitude_outdoor_pts"]) * (alt_diff / float(p["altitude_anchor_m"])),
                0.0,
                3.10,
            )
        else:
            alt_pts = 0.0

    # Bajas (QB + plantilla)
    h_qb = _num(matchup.get("homeQbInjured", matchup.get("home_qb_injured")), float(h["active_qb_injured"])) or 0.0
    a_qb = _num(matchup.get("awayQbInjured", matchup.get("away_qb_injured")), float(a["active_qb_injured"])) or 0.0
    h_out = _num(matchup.get("homeInjuriesOut", matchup.get("home_injuries_out")), float(h["active_injuries_out"])) or 0.0
    a_out = _num(matchup.get("awayInjuriesOut", matchup.get("away_injuries_out")), float(a["active_injuries_out"])) or 0.0
    h_q = _num(
        matchup.get("homeInjuriesQuestionable", matchup.get("home_injuries_questionable")),
        float(h["active_injuries_questionable"]),
    ) or 0.0
    a_q = _num(
        matchup.get("awayInjuriesQuestionable", matchup.get("away_injuries_questionable")),
        float(a["active_injuries_questionable"]),
    ) or 0.0

    injury_margin = clamp(
        float(p["qb_injured_pts_pen"]) * (a_qb - h_qb)
        + float(p["injury_out_pts_pen"]) * clamp(a_out - h_out, -12.0, 12.0)
        + float(p["injury_quest_pts_pen"]) * clamp(a_q - h_q, -12.0, 12.0),
        -float(p["injury_max_margin_pts"]),
        float(p["injury_max_margin_pts"]),
    )

    # Clima Open-Meteo en estadios abiertos (viento >= 15 mph, lluvia)
    wind_mph = _num(
        matchup.get("windMph", matchup.get("wind_mph", matchup.get("max_wind_speed_mph"))),
        0.0,
    ) or 0.0
    precip_mm = _num(
        matchup.get("precipitationMm", matchup.get("precipitation_mm", matchup.get("total_precipitation_mm"))),
        0.0,
    ) or 0.0

    excess_wind = 0.0 if is_dome else clamp(wind_mph - float(p["wind_threshold_mph"]), 0.0, 30.0)
    excess_precip = 0.0 if is_dome else clamp(precip_mm - float(p["precip_threshold_mm"]), 0.0, 25.0)

    weather_total_suppression = clamp(
        float(p["wind_total_pts_per_mph"]) * excess_wind + float(p["precip_total_pts_per_mm"]) * excess_precip,
        -9.0,
        0.0,
    )
    weather_damping = 1.0 - min(
        float(p["weather_max_damping"]),
        float(p["weather_margin_damping_wind"]) * excess_wind
        + float(p["weather_margin_damping_precip"]) * excess_precip,
    )

    exp_margin = weather_damping * (structural_margin + hfa_pts + alt_pts + injury_margin)

    ypp_sum_delta = (float(h["off_ypp"]) - float(a["def_ypp"])) + (float(a["off_ypp"]) - float(h["def_ypp"]))
    raw_total = (
        0.5 * (float(h["ppg"]) + float(a["oppg"]) + float(a["ppg"]) + float(h["oppg"]))
        + float(p["ypp_total_pts_scale"]) * ypp_sum_delta
        + weather_total_suppression
        - 2.20 * (h_qb + a_qb)
    )
    clamped_total = clamp(raw_total, 31.0, 82.0)
    exp_pts_home = max(3.0, 0.5 * (clamped_total + exp_margin))
    exp_pts_away = max(3.0, clamped_total - exp_pts_home)
    exp_total_pts = exp_pts_home + exp_pts_away
    exp_margin_final = exp_pts_home - exp_pts_away

    sigma = float(p["sigma_margin"])
    p_home = clamp(normal_cdf(exp_margin_final / sigma), 1e-6, 1.0 - 1e-6)
    p_away = 1.0 - p_home

    drivers = [
        {
            "factor": "fpi_srs_sos_ypp_power",
            "label": "ESPN FPI, SRS, Power-4 vs G5 SOS, Net YPP & Pythag 2.37",
            "homeValue": rtg_h,
            "awayValue": rtg_a,
            "impactLogit": structural_margin / sigma,
            "impactUnits": structural_margin,
        },
        {
            "factor": "cfb_hfa_and_altitude_shock",
            "label": "College HFA (+2.8 pts) & High-Altitude Shock (WYO/AFA/BYU/COL/UTA/UNM/UTEP)",
            "homeValue": h_elev,
            "awayValue": a_elev,
            "impactLogit": (hfa_pts + alt_pts) / sigma,
            "impactUnits": hfa_pts + alt_pts,
        },
        {
            "factor": "open_meteo_wind_precip",
            "label": "Open-Meteo Wind & Rain Suppression (Outdoor Stadiums)",
            "homeValue": wind_mph,
            "awayValue": precip_mm,
            "impactLogit": (exp_margin - (structural_margin + hfa_pts + alt_pts + injury_margin)) / sigma,
            "impactUnits": weather_total_suppression,
        },
        {
            "factor": "cfb_roster_injuries",
            "label": "QB & Depth Chart Injuries",
            "homeValue": -h_out,
            "awayValue": -a_out,
            "impactLogit": injury_margin / sigma,
            "impactUnits": injury_margin,
        },
    ]

    return {
        "sport": "ncaaf",
        "modelId": MULTISPORT_CODENAMES["ncaaf"],
        "homeTeam": h["team_id"],
        "awayTeam": a["team_id"],
        "homeTeamName": h["team_name"],
        "awayTeamName": a["team_name"],
        "pHome": p_home,
        "pAway": p_away,
        "expectedMargin": exp_margin_final,
        "expectedPointsHome": exp_pts_home,
        "expectedPointsAway": exp_pts_away,
        "expectedTotalPoints": exp_total_pts,
        "drivers": drivers,
    }


def predict_multisport(sport: str, matchup: Mapping[str, Any], artifact: Mapping[str, Any]) -> dict[str, Any]:
    s = str(sport).strip().lower()
    if s == "nhl":
        return predict_nhl(matchup, artifact)
    if s == "mlb":
        return predict_mlb(matchup, artifact)
    if s == "nba":
        return predict_nba(matchup, artifact)
    if s in ("ncaaf", "cfb"):
        return predict_ncaaf(matchup, artifact)
    raise ValueError(f"Unsupported multisport league: {sport!r}")


def build_multisport_artifact() -> tuple[dict[str, Any], dict[str, Any]]:
    data = load_normalized_sources()
    stadium_lookup = _build_stadium_lookup(data["stadiums_pq"], data["live_ctx"])
    ra_lookup = _build_injury_and_starter_lookup(data["ra_records"])

    art_nhl, oos_nhl = train_nhl_engine(data["xg_records"], stadium_lookup, ra_lookup)
    art_mlb, oos_mlb = train_mlb_engine(data["xg_records"], stadium_lookup, ra_lookup)
    art_nba, oos_nba = train_nba_engine(data["xg_records"], stadium_lookup, ra_lookup)
    art_ncaaf, oos_ncaaf = train_ncaaf_engine(data["xg_records"], stadium_lookup, ra_lookup)

    artifact = {
        "schema_version": "3.0.0",
        "suite_codename": MULTISPORT_SUITE_CODENAME,
        "version": MULTISPORT_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": SEED,
        "anti_leakage_contract": "strict_inter_season_S_minus_1_to_S_walk_forward",
        "sports": {
            "nhl": art_nhl,
            "mlb": art_mlb,
            "nba": art_nba,
            "ncaaf": art_ncaaf,
        },
    }
    metrics = {
        "nhl": oos_nhl,
        "mlb": oos_mlb,
        "nba": oos_nba,
        "ncaaf": oos_ncaaf,
    }
    return artifact, metrics


if __name__ == "__main__":
    art, met = build_multisport_artifact()
    for sp_k, m in met.items():
        print(
            f"[{sp_k.upper()}] n={m['n_team_seasons']} ({m['total_team_games']} team-games) | "
            f"RMSE={m['model']['rmse_win_pct']:.4f} (naive={m['naive_win_pct_s1']['rmse_win_pct']:.4f}, "
            f"legacy={m['legacy_static_heuristic']['rmse_win_pct']:.4f}) | "
            f"r={m['model']['pearson_r']:.4f} | "
            f"LL={m['model']['game_log_loss']:.5f} (naive={m['naive_win_pct_s1']['game_log_loss']:.5f}, "
            f"legacy={m['legacy_static_heuristic']['game_log_loss']:.5f})"
        )
