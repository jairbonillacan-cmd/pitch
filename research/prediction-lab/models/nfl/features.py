"""Features causales pre-partido de 2ª generación (v2.1) para la NFL (Elo multi-velocidad,
QB Value/Continuity, Head Coach Dynamic Elo, forma EWMA/10-partidos ajustada por calendario,
clima exterior y fatiga de tiempo extra).

Principio único: **cada fila usa solo información estrictamente anterior al
``gameday`` de ese partido**. Se implementa recorriendo los partidos en orden
cronológico y actualizando el estado *después* de emitir las features de todos
los partidos de una misma fecha.

Uso::

    ./.venv/bin/python models/nfl/features.py            # construye el parquet
    ./.venv/bin/python models/nfl/features.py --verify   # test de causalidad
"""

from __future__ import annotations

import argparse
import math
import sys
from collections import defaultdict, deque

import numpy as np
import pandas as pd

from config import (
    DATASET,
    ELO_HFA,
    ELO_K,
    ELO_MOV_SCALE,
    ELO_SEASON_REGRESSION,
    ELO_START,
    FEATURES,
    FORM_WINDOW,
    MIN_PRIOR_GAMES,
    PROCESSED_DIR,
)

QB_ELO_ROOKIE = 1445.0
QB_ELO_K = 22.0
QB_SEASON_REGRESSION = 0.85

COACH_ELO_START = 1500.0
COACH_ELO_K = 12.0
COACH_SEASON_REGRESSION = 0.85

NUMERIC_FEATURES = [
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
CATEGORICAL_FEATURES = ["surface"]
FEATURES_ALL = NUMERIC_FEATURES + CATEGORICAL_FEATURES


def _mov_multiplier(margin: int, elo_gap: float) -> float:
    return float(
        np.log(abs(margin) + 1.0) * ELO_MOV_SCALE / (0.001 * abs(elo_gap) + ELO_MOV_SCALE)
    )


def _pyth_expectation(pf_list: list[float], pa_list: list[float]) -> float:
    pf = max(1.0, sum(pf_list))
    pa = max(1.0, sum(pa_list))
    pf_p = pf ** 2.37
    pa_p = pa ** 2.37
    return float(pf_p / (pf_p + pa_p))


def build_features(
    games: pd.DataFrame,
    elo_k: float = ELO_K,
    elo_hfa: float = ELO_HFA,
    window: int = FORM_WINDOW,
) -> pd.DataFrame:
    """Devuelve una copia de ``games`` con las columnas de features causales (v2.1)."""
    df = games.sort_values(["gameday", "game_id"]).reset_index(drop=True).copy()

    elo: dict[str, float] = defaultdict(lambda: ELO_START)
    elo_fast: dict[str, float] = defaultdict(lambda: ELO_START)
    last_season: dict[str, int] = {}
    hist: dict[str, deque] = defaultdict(lambda: deque(maxlen=window))
    hist10: dict[str, deque] = defaultdict(lambda: deque(maxlen=10))
    ewm_margin: dict[str, float] = defaultdict(float)
    ewm_off: dict[str, float] = defaultdict(float)
    ewm_def: dict[str, float] = defaultdict(float)
    last_ot: dict[str, float] = defaultdict(float)

    # Estado causal de Quarterbacks
    qb_elo: dict[str, float] = defaultdict(lambda: QB_ELO_ROOKIE)
    qb_starts: dict[str, int] = defaultdict(int)
    qb_last_season: dict[str, int] = {}
    team_last_qb: dict[str, str] = {}

    # Estado causal de Head Coaches
    coach_elo: dict[str, float] = defaultdict(lambda: COACH_ELO_START)
    coach_last_season: dict[str, int] = {}
    team_last_coach: dict[str, str] = {}
    recent_margins: deque = deque([2.2] * 250, maxlen=500)

    n_rows = len(df)
    out = {
        "elo_home_pre": np.full(n_rows, np.nan),
        "elo_away_pre": np.full(n_rows, np.nan),
        "elo_diff": np.full(n_rows, np.nan),
        "elo_fast_diff": np.full(n_rows, np.nan),
        "elo_momentum_diff": np.zeros(n_rows, dtype=float),
        "elo_home_win_prob": np.full(n_rows, np.nan),
        "qb_elo_home": np.full(n_rows, np.nan),
        "qb_elo_away": np.full(n_rows, np.nan),
        "qb_elo_diff": np.full(n_rows, np.nan),
        "qb_val_over_team_home": np.full(n_rows, np.nan),
        "qb_val_over_team_away": np.full(n_rows, np.nan),
        "qb_change_home": np.zeros(n_rows, dtype=float),
        "qb_change_away": np.zeros(n_rows, dtype=float),
        "qb_starts_diff": np.zeros(n_rows, dtype=float),
        "coach_elo_diff": np.zeros(n_rows, dtype=float),
        "coach_change_home": np.zeros(n_rows, dtype=float),
        "coach_change_away": np.zeros(n_rows, dtype=float),
        "composite_elo_diff": np.full(n_rows, np.nan),
        "comp_elo_logit": np.zeros(n_rows, dtype=float),
        "elo_closeness": np.zeros(n_rows, dtype=float),
        "f5_win_home": np.full(n_rows, np.nan),
        "f5_win_away": np.full(n_rows, np.nan),
        "f5_pf_home": np.full(n_rows, np.nan),
        "f5_pa_home": np.full(n_rows, np.nan),
        "f5_pf_away": np.full(n_rows, np.nan),
        "f5_pa_away": np.full(n_rows, np.nan),
        "f5_diff_home": np.full(n_rows, np.nan),
        "f5_diff_away": np.full(n_rows, np.nan),
        "f5_adj_margin_home": np.full(n_rows, np.nan),
        "f5_adj_margin_away": np.full(n_rows, np.nan),
        "f10_adj_margin_diff": np.zeros(n_rows, dtype=float),
        "ewm_adj_margin_diff": np.zeros(n_rows, dtype=float),
        "ewm_off_diff": np.zeros(n_rows, dtype=float),
        "ewm_def_diff": np.zeros(n_rows, dtype=float),
        "sos_elo_diff": np.zeros(n_rows, dtype=float),
        "pyth_win_diff": np.zeros(n_rows, dtype=float),
        "wind_outdoor": np.zeros(n_rows, dtype=float),
        "cold_outdoor": np.zeros(n_rows, dtype=float),
        "prev_ot_diff": np.zeros(n_rows, dtype=float),
        "n_prior_home": np.zeros(n_rows, dtype=int),
        "n_prior_away": np.zeros(n_rows, dtype=int),
    }

    def _regress(team: str, season: int) -> None:
        prev = last_season.get(team)
        if prev is not None and season > prev:
            elo[team] = ELO_START + ELO_SEASON_REGRESSION * (elo[team] - ELO_START)
            elo_fast[team] = ELO_START + 0.65 * (elo_fast[team] - ELO_START)
            ewm_margin[team] *= 0.65
            ewm_off[team] *= 0.65
            ewm_def[team] *= 0.65
        last_season[team] = season

    def _regress_qb(qbid: str, season: int) -> None:
        if not qbid or qbid == "unknown":
            return
        prev = qb_last_season.get(qbid)
        if prev is not None and season > prev:
            qb_elo[qbid] = ELO_START + QB_SEASON_REGRESSION * (qb_elo[qbid] - ELO_START)
        qb_last_season[qbid] = season

    def _regress_coach(cid: str, season: int) -> None:
        if not cid or cid == "unknown":
            return
        prev = coach_last_season.get(cid)
        if prev is not None and season > prev:
            coach_elo[cid] = COACH_ELO_START + COACH_SEASON_REGRESSION * (coach_elo[cid] - COACH_ELO_START)
        coach_last_season[cid] = season

    has_qb_cols = "home_qb_id" in df.columns and "away_qb_id" in df.columns
    has_coach_cols = "home_coach" in df.columns and "away_coach" in df.columns

    for gameday, day in df.groupby("gameday", sort=True):
        idx = day.index.to_numpy()
        dyn_hfa_base = float(np.clip(np.mean(recent_margins) * 24.0, 28.0, 65.0))
        eff_hfa_base = 0.55 * elo_hfa + 0.45 * dyn_hfa_base
        # --- 1) emitir features con el estado ANTERIOR a la jornada ---
        for i in idx:
            row = df.loc[i]
            h, a = row["home_franchise"], row["away_franchise"]
            s_yr = int(row["season"])
            _regress(h, s_yr)
            _regress(a, s_yr)

            qbh = str(row["home_qb_id"]) if (has_qb_cols and pd.notna(row["home_qb_id"])) else "unknown"
            qba = str(row["away_qb_id"]) if (has_qb_cols and pd.notna(row["away_qb_id"])) else "unknown"
            _regress_qb(qbh, s_yr)
            _regress_qb(qba, s_yr)

            ch_h = str(row["home_coach"]) if (has_coach_cols and pd.notna(row["home_coach"])) else "unknown"
            ch_a = str(row["away_coach"]) if (has_coach_cols and pd.notna(row["away_coach"])) else "unknown"
            _regress_coach(ch_h, s_yr)
            _regress_coach(ch_a, s_yr)

            hfa = 0.0 if bool(row["neutral_site"]) else eff_hfa_base
            gap = (elo[h] + hfa) - elo[a]
            gap_fast = (elo_fast[h] + hfa) - elo_fast[a]
            out["elo_home_pre"][i] = elo[h]
            out["elo_away_pre"][i] = elo[a]
            out["elo_diff"][i] = gap
            out["elo_fast_diff"][i] = gap_fast
            out["elo_momentum_diff"][i] = gap_fast - gap

            # QB features
            qeh = qb_elo[qbh] if (qbh and qbh != "unknown") else elo[h]
            qea = qb_elo[qba] if (qba and qba != "unknown") else elo[a]
            out["qb_elo_home"][i] = qeh
            out["qb_elo_away"][i] = qea
            out["qb_elo_diff"][i] = (qeh + hfa) - qea

            val_h = qeh - elo[h]
            val_a = qea - elo[a]
            out["qb_val_over_team_home"][i] = val_h
            out["qb_val_over_team_away"][i] = val_a

            prev_qbh = team_last_qb.get(h)
            prev_qba = team_last_qb.get(a)
            out["qb_change_home"][i] = 1.0 if (prev_qbh is not None and qbh != "unknown" and qbh != prev_qbh) else 0.0
            out["qb_change_away"][i] = 1.0 if (prev_qba is not None and qba != "unknown" and qba != prev_qba) else 0.0

            st_h = math.log1p(qb_starts[qbh]) if (qbh and qbh != "unknown") else 2.5
            st_a = math.log1p(qb_starts[qba]) if (qba and qba != "unknown") else 2.5
            out["qb_starts_diff"][i] = st_h - st_a

            # Head Coach features
            ceh = coach_elo[ch_h] if (ch_h and ch_h != "unknown") else COACH_ELO_START
            cea = coach_elo[ch_a] if (ch_a and ch_a != "unknown") else COACH_ELO_START
            out["coach_elo_diff"][i] = ceh - cea
            prev_ch_h = team_last_coach.get(h)
            prev_ch_a = team_last_coach.get(a)
            out["coach_change_home"][i] = 1.0 if (prev_ch_h is not None and ch_h != prev_ch_h) else 0.0
            out["coach_change_away"][i] = 1.0 if (prev_ch_a is not None and ch_a != prev_ch_a) else 0.0

            # Elo compuesto (equipo + QB titular + Head Coach)
            comp_gap = gap + 0.38 * (val_h - val_a) + 0.12 * (ceh - cea)
            out["composite_elo_diff"][i] = comp_gap
            p_elo = 1.0 / (1.0 + 10.0 ** (-comp_gap / 400.0))
            out["elo_home_win_prob"][i] = p_elo
            out["comp_elo_logit"][i] = math.log(max(1e-6, p_elo) / max(1e-6, 1.0 - p_elo))
            out["elo_closeness"][i] = math.exp(-((comp_gap / 135.0) ** 2))

            out["n_prior_home"][i] = len(hist[h])
            out["n_prior_away"][i] = len(hist[a])
            pyth_h, pyth_a = 0.5, 0.5
            for side, team in (("home", h), ("away", a)):
                games_ = list(hist[team])
                if games_:
                    out[f"f5_win_{side}"][i] = float(np.mean([g[0] for g in games_]))
                    out[f"f5_pf_{side}"][i] = float(np.mean([g[1] for g in games_]))
                    out[f"f5_pa_{side}"][i] = float(np.mean([g[2] for g in games_]))
                    out[f"f5_diff_{side}"][i] = float(np.mean([g[1] - g[2] for g in games_]))
                    out[f"f5_adj_margin_{side}"][i] = float(np.mean([g[3] for g in games_]))
                g10_t = list(hist10[team])
                if g10_t:
                    pyth_v = _pyth_expectation([g[1] for g in g10_t], [g[2] for g in g10_t])
                    if side == "home":
                        pyth_h = pyth_v
                    else:
                        pyth_a = pyth_v
            out["pyth_win_diff"][i] = pyth_h - pyth_a

            g10_h = list(hist10[h])
            g10_a = list(hist10[a])
            f10_h = float(np.mean([g[3] for g in g10_h])) if g10_h else 0.0
            f10_a = float(np.mean([g[3] for g in g10_a])) if g10_a else 0.0
            out["f10_adj_margin_diff"][i] = f10_h - f10_a
            out["ewm_adj_margin_diff"][i] = ewm_margin[h] - ewm_margin[a]
            out["ewm_off_diff"][i] = ewm_off[h] - ewm_off[a]
            out["ewm_def_diff"][i] = ewm_def[h] - ewm_def[a]
            sos_h = float(np.mean([g[4] for g in g10_h])) if g10_h else ELO_START
            sos_a = float(np.mean([g[4] for g in g10_a])) if g10_a else ELO_START
            out["sos_elo_diff"][i] = (sos_h - sos_a) / 100.0

            is_ind = float(row["is_indoor"])
            wind_v = float(row["wind"]) if (is_ind == 0 and "wind" in row and pd.notna(row["wind"])) else 0.0
            temp_v = float(row["temp"]) if (is_ind == 0 and "temp" in row and pd.notna(row["temp"])) else 70.0
            out["wind_outdoor"][i] = max(0.0, wind_v - 10.0) if is_ind == 0 else 0.0
            out["cold_outdoor"][i] = max(0.0, 40.0 - temp_v) if is_ind == 0 else 0.0
            out["prev_ot_diff"][i] = last_ot[h] - last_ot[a]

        # --- 2) actualizar el estado con los resultados de la jornada ---
        for i in idx:
            row = df.loc[i]
            h, a = row["home_franchise"], row["away_franchise"]
            qbh = str(row["home_qb_id"]) if (has_qb_cols and pd.notna(row["home_qb_id"])) else "unknown"
            qba = str(row["away_qb_id"]) if (has_qb_cols and pd.notna(row["away_qb_id"])) else "unknown"
            ch_h = str(row["home_coach"]) if (has_coach_cols and pd.notna(row["home_coach"])) else "unknown"
            ch_a = str(row["away_coach"]) if (has_coach_cols and pd.notna(row["away_coach"])) else "unknown"

            margin = int(row["home_margin"])
            hs, as_ = int(row["home_score"]), int(row["away_score"])
            if not bool(row["neutral_site"]):
                recent_margins.append(float(margin))
            s_home = 1.0 if margin > 0 else (0.5 if margin == 0 else 0.0)
            hfa = 0.0 if bool(row["neutral_site"]) else eff_hfa_base
            gap = (elo[h] + hfa) - elo[a]
            e_home = 1.0 / (1.0 + 10.0 ** (-gap / 400.0))
            mov = _mov_multiplier(margin, gap)
            delta = elo_k * mov * (s_home - e_home)

            elo_h_pre, elo_a_pre = elo[h], elo[a]

            # Margen esperado por Elo (~25 puntos Elo por punto de spread)
            exp_margin_h = gap / 25.0
            adj_margin_h = float(margin) - exp_margin_h

            elo[h] += delta
            elo[a] -= delta

            gap_fast = (elo_fast[h] + hfa) - elo_fast[a]
            e_fast = 1.0 / (1.0 + 10.0 ** (-gap_fast / 400.0))
            elo_fast[h] += 32.0 * mov * (s_home - e_fast)
            elo_fast[a] -= 32.0 * mov * (s_home - e_fast)

            hist[h].append((1.0 if margin > 0 else 0.0, hs, as_, adj_margin_h, elo_a_pre))
            hist[a].append((1.0 if margin < 0 else 0.0, as_, hs, -adj_margin_h, elo_h_pre))
            hist10[h].append((1.0 if margin > 0 else 0.0, hs, as_, adj_margin_h, elo_a_pre))
            hist10[a].append((1.0 if margin < 0 else 0.0, as_, hs, -adj_margin_h, elo_h_pre))

            alpha_ewm = 0.20
            ewm_margin[h] = (1.0 - alpha_ewm) * ewm_margin[h] + alpha_ewm * adj_margin_h
            ewm_margin[a] = (1.0 - alpha_ewm) * ewm_margin[a] + alpha_ewm * (-adj_margin_h)
            ewm_off[h] = (1.0 - alpha_ewm) * ewm_off[h] + alpha_ewm * (hs - 22.0)
            ewm_off[a] = (1.0 - alpha_ewm) * ewm_off[a] + alpha_ewm * (as_ - 21.0)
            ewm_def[h] = (1.0 - alpha_ewm) * ewm_def[h] + alpha_ewm * (21.0 - as_)
            ewm_def[a] = (1.0 - alpha_ewm) * ewm_def[a] + alpha_ewm * (22.0 - hs)

            # Actualizar Elo individual del QB titular
            qeh = qb_elo[qbh] if (qbh and qbh != "unknown") else elo_h_pre
            qea = qb_elo[qba] if (qba and qba != "unknown") else elo_a_pre
            qb_gap = (0.5 * (qeh + elo_h_pre) + hfa) - 0.5 * (qea + elo_a_pre)
            e_qb_home = 1.0 / (1.0 + 10.0 ** (-qb_gap / 400.0))
            delta_qb = QB_ELO_K * mov * (s_home - e_qb_home)
            if qbh and qbh != "unknown":
                qb_elo[qbh] = qeh + delta_qb
                qb_starts[qbh] += 1
                team_last_qb[h] = qbh
            if qba and qba != "unknown":
                qb_elo[qba] = qea - delta_qb
                qb_starts[qba] += 1
                team_last_qb[a] = qba

            # Actualizar Elo individual del Head Coach
            ceh = coach_elo[ch_h] if (ch_h and ch_h != "unknown") else COACH_ELO_START
            cea = coach_elo[ch_a] if (ch_a and ch_a != "unknown") else COACH_ELO_START
            c_gap = (0.5 * (ceh + elo_h_pre) + hfa) - 0.5 * (cea + elo_a_pre)
            e_c_home = 1.0 / (1.0 + 10.0 ** (-c_gap / 400.0))
            delta_c = COACH_ELO_K * mov * (s_home - e_c_home)
            if ch_h and ch_h != "unknown":
                coach_elo[ch_h] = ceh + delta_c
                team_last_coach[h] = ch_h
            if ch_a and ch_a != "unknown":
                coach_elo[ch_a] = cea - delta_c
                team_last_coach[a] = ch_a

            ot = 1.0 if ("overtime" in row and pd.notna(row["overtime"]) and float(row["overtime"]) > 0) else 0.0
            last_ot[h] = ot
            last_ot[a] = ot

    feats = pd.DataFrame(out, index=df.index)
    for col in feats.columns:
        df[col] = feats[col]

    df["f5_diff_delta"] = df["f5_diff_home"] - df["f5_diff_away"]
    df["f5_adj_margin_diff"] = df["f5_adj_margin_home"] - df["f5_adj_margin_away"]
    df["rest_diff"] = np.clip(df["home_rest"].astype(float) - df["away_rest"].astype(float), -7.0, 7.0)
    df["rest_home"] = np.clip(df["home_rest"].astype(float), 4.0, 14.0)
    df["rest_away"] = np.clip(df["away_rest"].astype(float), 4.0, 14.0)
    df["week"] = df["week"].astype(float)
    df["div_game"] = df["div_game"].astype(float)
    df["is_indoor"] = df["is_indoor"].astype(float)
    df["neutral_site"] = df["neutral_site"].astype(float)
    df["surface"] = df["surface"].fillna("unknown").astype(str)
    df["label"] = df["result"].map({"H": "H", "T": "D", "A": "A"})
    df["y"] = df["label"].map({"H": 0, "D": 1, "A": 2}).astype(int)
    return df


def drop_warmup(df: pd.DataFrame, min_prior: int = MIN_PRIOR_GAMES) -> pd.DataFrame:
    """Descarta filas sin historia suficiente (solo afecta a 1999 semanas 1-5)."""
    keep = (df["n_prior_home"] >= min_prior) & (df["n_prior_away"] >= min_prior)
    return df[keep].reset_index(drop=True)


def check_causality(df: pd.DataFrame, elo_k: float = ELO_K, elo_hfa: float = ELO_HFA) -> dict:
    """Test de leakage: truncar el pasado no puede cambiar el presente."""
    cuts = ["2003-11-01", "2011-10-15", "2016-01-03", "2019-12-29", "2023-10-01", "2025-11-01"]
    full = build_features(df, elo_k=elo_k, elo_hfa=elo_hfa)
    report = {"cuts": [], "max_abs_diff": 0.0, "passed": True}
    for cut in cuts:
        cut_ts = pd.Timestamp(cut)
        past = df[df["gameday"] < cut_ts]
        if len(past) < 100:
            continue
        part = build_features(past, elo_k=elo_k, elo_hfa=elo_hfa)
        merged = full[full["gameday"] < cut_ts].merge(
            part, on="game_id", suffixes=("", "_trunc")
        )
        diff = 0.0
        for col in NUMERIC_FEATURES:
            if col in ("week", "div_game", "is_indoor", "neutral_site", "rest_home", "rest_away"):
                continue
            a = merged[col].to_numpy(dtype="float64")
            b = merged[f"{col}_trunc"].to_numpy(dtype="float64")
            both_nan = np.isnan(a) & np.isnan(b)
            if not np.all(both_nan | np.isclose(a, b, atol=1e-12, rtol=0)):
                diff = max(diff, float(np.nanmax(np.abs(a - b))))
        report["cuts"].append({"cut": cut, "n_rows": int(len(merged)), "max_abs_diff": diff})
        report["max_abs_diff"] = max(report["max_abs_diff"], diff)
        report["passed"] = report["passed"] and diff <= 1e-12
    return report


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Construye features causales NFL (v2.1 con QB/Coach/EWMA/Weather)")
    ap.add_argument("--verify", action="store_true", help="solo ejecuta el test de causalidad")
    ap.add_argument("--k", type=float, default=ELO_K)
    ap.add_argument("--hfa", type=float, default=ELO_HFA)
    args = ap.parse_args(argv)

    games = pd.read_parquet(DATASET)
    if args.verify:
        rep = check_causality(games, elo_k=args.k, elo_hfa=args.hfa)
        print(f"causalidad: passed={rep['passed']} max_abs_diff={rep['max_abs_diff']:.2e}")
        for c in rep["cuts"]:
            print(f"  {c['cut']} n={c['n_rows']} diff={c['max_abs_diff']:.2e}")
        return 0 if rep["passed"] else 1

    feats = build_features(games, elo_k=args.k, elo_hfa=args.hfa)
    trimmed = drop_warmup(feats)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    trimmed.to_parquet(FEATURES, index=False)
    print(
        f"OK {FEATURES.relative_to(FEATURES.parents[2])} rows={len(trimmed)} "
        f"cols={trimmed.shape[1]} (descartadas {len(feats) - len(trimmed)} por warm-up)"
    )
    print(
        f"Elo K={args.k} HFA={args.hfa} -> elo_diff mean={trimmed['elo_diff'].mean():.1f} "
        f"qb_elo_diff sd={trimmed['qb_elo_diff'].std():.1f} coach_elo_diff sd={trimmed['coach_elo_diff'].std():.1f}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
