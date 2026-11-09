#!/usr/bin/env python3
"""Genera features causales (pre-partido) para el Motor A.

Regla de oro: para predecir el partido m solo se usa información de partidos con
`match_date < m.match_date` (estrictamente anterior). Todas las ventanas se construyen con
`.shift(1)` dentro de la historia de cada equipo, y el Elo se actualiza después de cada partido.

Uso:
    ./.venv/bin/python features/build_features.py

Salida:
    data/processed/features.parquet   (una fila por partido, features pre-partido + target)
    data/processed/features.csv
    reports/A05_feature_dictionary.md (catálogo generado)
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROC = os.path.join(ROOT, "data", "processed")

# Parámetros del Elo (EXP02 los variará; aquí quedan fijados y documentados)
ELO_START = 1500.0
ELO_K = 20.0
ELO_HFA = 65.0
ELO_SEASON_REGRESSION = 0.33  # fracción de regresión a la media entre temporadas
ELO_MOV = True                # multiplicador por diferencia de goles


def load_matches() -> pd.DataFrame:
    p = os.path.join(PROC, "matches.parquet")
    if not os.path.exists(p):
        raise SystemExit(f"Falta {p}: ejecuta antes etl/build_matches.py")
    df = pd.read_parquet(p)
    df["match_date"] = pd.to_datetime(df["match_date"])
    df = df[df.result.notna() & df.home_goals.notna()].copy()
    df["home_goals"] = df.home_goals.astype(int)
    df["away_goals"] = df.away_goals.astype(int)
    df["kickoff_time"] = df["kickoff_time"].fillna("")
    df = df.sort_values(["div", "match_date", "kickoff_time", "match_id"], kind="mergesort")
    return df.reset_index(drop=True)


def mov_multiplier(gd: int) -> float:
    gd = abs(int(gd))
    if gd <= 1:
        return 1.0
    if gd == 2:
        return 1.5
    return (11.0 + gd) / 8.0


def elo_block(df: pd.DataFrame, k: float = ELO_K, hfa: float = ELO_HFA,
              season_reg: float = ELO_SEASON_REGRESSION, mov: bool = ELO_MOV,
              prefix: str = "elo") -> pd.DataFrame:
    """Elo causal por (div, equipo). Devuelve columnas pre-partido y post-partido."""
    ratings: dict[tuple[str, str], float] = {}
    last_season: dict[tuple[str, str], str] = {}
    cols = {f"{prefix}_home": [], f"{prefix}_away": [], f"{prefix}_home_post": [],
            f"{prefix}_away_post": [], f"{prefix}_exp_home": []}
    for row in df.itertuples(index=False):
        div, season = row.div, row.season
        hk, ak = (div, row.home_team), (div, row.away_team)
        for key in (hk, ak):
            if key not in ratings:
                ratings[key] = ELO_START
                last_season[key] = season
            elif last_season[key] != season:
                ratings[key] = ELO_START + (ratings[key] - ELO_START) * (1.0 - season_reg)
                last_season[key] = season
        rh, ra = ratings[hk], ratings[ak]
        exp_home = 1.0 / (1.0 + 10.0 ** (-((rh + hfa) - ra) / 400.0))
        gd = int(row.home_goals) - int(row.away_goals)
        score_home = 1.0 if gd > 0 else (0.5 if gd == 0 else 0.0)
        delta = k * (mov_multiplier(gd) if mov else 1.0) * (score_home - exp_home)
        cols[f"{prefix}_home"].append(rh)
        cols[f"{prefix}_away"].append(ra)
        cols[f"{prefix}_exp_home"].append(exp_home)
        cols[f"{prefix}_home_post"].append(rh + delta)
        cols[f"{prefix}_away_post"].append(ra - delta)
        ratings[hk], ratings[ak] = rh + delta, ra - delta
    out = df.copy()
    for c, v in cols.items():
        out[c] = v
    out[f"{prefix}_diff"] = out[f"{prefix}_home"] + hfa - out[f"{prefix}_away"]
    out[f"{prefix}_diff_no_hfa"] = out[f"{prefix}_home"] - out[f"{prefix}_away"]
    return out


def rest_and_congestion(long: pd.DataFrame, lookback_days: int = 14) -> pd.DataFrame:
    """Días de descanso y partidos en los últimos N días, por equipo, estrictamente previos."""
    long = long.sort_values(["team", "match_date", "match_id"], kind="mergesort").copy()
    rest, cong = [], []
    for team, g in long.groupby("team", sort=False):
        dates = g.match_date.values.astype("datetime64[D]")
        prev = np.empty(len(g), dtype=float)
        prev[0] = np.nan
        prev[1:] = (dates[1:] - dates[:-1]) / np.timedelta64(1, "D")
        cnt = np.zeros(len(g), dtype=float)
        for i in range(1, len(g)):
            lo = dates[i] - np.timedelta64(lookback_days, "D")
            cnt[i] = int(((dates[:i] >= lo) & (dates[:i] < dates[i])).sum())
        rest.extend(zip(g.index, prev))
        cong.extend(zip(g.index, cnt))
    r = pd.Series(dict(rest))
    c = pd.Series(dict(cong))
    long["days_rest"] = r.reindex(long.index).astype(float)
    long["matches_last_14d"] = c.reindex(long.index).astype(float)
    return long


ROLL_COLS = ["points", "gf", "ga", "gd", "shots", "sot", "corners", "win", "draw", "loss",
             "goals_per_shot", "sot_rate"]


def build_long(df: pd.DataFrame) -> pd.DataFrame:
    home = pd.DataFrame({
        "match_id": df.match_id, "div": df["div"], "season": df.season, "match_date": df.match_date,
        "team": df.home_team, "opponent": df.away_team, "is_home": 1,
        "gf": df.home_goals, "ga": df.away_goals,
        "shots": df.shots_home, "sot": df.sot_home, "corners": df.corners_home,
        "elo_pre": df.elo_home, "opp_elo_pre": df.elo_away,
    })
    away = pd.DataFrame({
        "match_id": df.match_id, "div": df["div"], "season": df.season, "match_date": df.match_date,
        "team": df.away_team, "opponent": df.home_team, "is_home": 0,
        "gf": df.away_goals, "ga": df.home_goals,
        "shots": df.shots_away, "sot": df.sot_away, "corners": df.corners_away,
        "elo_pre": df.elo_away, "opp_elo_pre": df.elo_home,
    })
    long = pd.concat([home, away], ignore_index=True)
    long["points"] = np.where(long.gf > long.ga, 3, np.where(long.gf == long.ga, 1, 0))
    long["gd"] = long.gf - long.ga
    long["win"] = (long.gf > long.ga).astype(float)
    long["draw"] = (long.gf == long.ga).astype(float)
    long["loss"] = (long.gf < long.ga).astype(float)
    long["goals_per_shot"] = long.gf / long.shots.replace(0, np.nan)
    long["sot_rate"] = long.sot / long.shots.replace(0, np.nan)
    long = long.sort_values(["team", "match_date", "match_id"], kind="mergesort")
    return long


def rolling_features(long: pd.DataFrame, windows=(5, 10)) -> pd.DataFrame:
    long = long.sort_values(["team", "match_date", "match_id"], kind="mergesort").copy()
    g = long.groupby("team", sort=False)
    for w in windows:
        for col in ROLL_COLS:
            long[f"{col}_r{w}"] = g[col].transform(
                lambda s, w=w: s.shift(1).rolling(w, min_periods=1).mean())
    # Forma ponderada exponencial (halflife 5 partidos) sobre puntos y goles
    for col in ("points", "gf", "ga", "gd"):
        long[f"{col}_ewm5"] = g[col].transform(
            lambda s: s.shift(1).ewm(halflife=5, min_periods=1).mean())
    return long


def team_season_priors(long: pd.DataFrame) -> pd.DataFrame:
    """Agregados de la temporada ANTERIOR por equipo (causales: la temporada ya terminó)."""
    agg = (long.groupby(["div", "team", "season"], as_index=False)
           .agg(n=("match_id", "size"), gf=("gf", "sum"), ga=("ga", "sum"),
                pts=("points", "sum"), shots=("shots", "sum"), sot=("sot", "sum")))
    agg["ppg"] = agg.pts / agg.n
    agg["gf_pg"] = agg.gf / agg.n
    agg["ga_pg"] = agg.ga / agg.n
    agg["sot_pg"] = agg.sot / agg.n
    agg = agg.sort_values(["div", "team", "season"], kind="mergesort")
    # Se desplazan las estadísticas dentro de cada equipo: la fila de la temporada T pasa a
    # contener las de T-1 y se aplica a los partidos de T (target_season = T).
    # El join anterior usaba `prev_of` sin desplazar las estadísticas y emparejaba con S+1
    # (leakage detectado por A05; ver reports/A05_features.md y 14_AUDITORIA_ADVERSARIAL.md).
    stat_cols = ["n", "gf", "ga", "pts", "shots", "sot", "ppg", "gf_pg", "ga_pg", "sot_pg"]
    agg[stat_cols] = agg.groupby(["div", "team"])[stat_cols].shift(1)
    agg = agg.rename(columns={"n": "prev_n", "gf": "prev_gf", "ga": "prev_ga", "pts": "prev_pts",
                              "shots": "prev_shots", "sot": "prev_sot", "ppg": "prev_ppg",
                              "gf_pg": "prev_gf_pg", "ga_pg": "prev_ga_pg", "sot_pg": "prev_sot_pg",
                              "season": "target_season"})
    keep = ["div", "team", "target_season", "prev_n", "prev_ppg", "prev_gf_pg", "prev_ga_pg", "prev_sot_pg"]
    return agg[keep]


def league_priors(df: pd.DataFrame) -> pd.DataFrame:
    """Media de goles totales de la temporada anterior por división (causal)."""
    s = (df.groupby(["div", "season"], as_index=False)
         .agg(total_goals=("home_goals", "sum"), n=("match_id", "size"),
              home_win=("result", lambda x: (x == "H").mean())))
    s["avg_total"] = s.total_goals / s.n
    s = s.sort_values(["div", "season"], kind="mergesort")
    s["lg_avg_total_prev"] = s.groupby("div").avg_total.shift(1)
    s["lg_home_win_prev"] = s.groupby("div").home_win.shift(1)
    return s[["div", "season", "lg_avg_total_prev", "lg_home_win_prev"]]


def context_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.sort_values(["div", "season", "match_date", "kickoff_time", "match_id"],
                         kind="mergesort").copy()
    # Número de partido previo del equipo en la temporada (antes del actual)
    out["home_season_match_no"] = out.groupby(["div", "season", "home_team"]).cumcount()
    out["away_season_match_no"] = out.groupby(["div", "season", "away_team"]).cumcount()
    out["round_no"] = out[["home_season_match_no", "away_season_match_no"]].max(axis=1)
    # Progreso de temporada con calendario FIJO (no usa la fecha del último partido: eso es futuro).
    bounds = {}
    for season in out.season.unique():
        y = int(str(season)[:4])
        if "/" in str(season):
            bounds[season] = (pd.Timestamp(y, 7, 1), pd.Timestamp(y + 1, 6, 30))
        else:
            bounds[season] = (pd.Timestamp(y, 1, 1), pd.Timestamp(y, 12, 31))
    starts = out.season.map(lambda s: bounds[s][0])
    ends = out.season.map(lambda s: bounds[s][1])
    span = (ends - starts).dt.days.replace(0, np.nan)
    out["season_progress"] = ((out.match_date - starts).dt.days / span).clip(0, 1)
    return out


def main():
    df = load_matches()
    print(f"partidos con resultado: {len(df):,}")
    # Elo principal + variantes para ablación de EXP02
    df = elo_block(df, k=ELO_K, hfa=ELO_HFA, season_reg=ELO_SEASON_REGRESSION, mov=ELO_MOV, prefix="elo")
    df = elo_block(df, k=10, hfa=ELO_HFA, season_reg=ELO_SEASON_REGRESSION, mov=False, prefix="elo_k10")
    df = elo_block(df, k=40, hfa=ELO_HFA, season_reg=ELO_SEASON_REGRESSION, mov=True, prefix="elo_k40")
    long = build_long(df)
    long = rest_and_congestion(long)
    long = rolling_features(long)
    long = long.sort_values(["team", "match_date", "match_id"], kind="mergesort")
    # Flag de cambio de división respecto al partido anterior del equipo
    long["prev_div"] = long.groupby("team")["div"].shift(1)
    long["prev_season"] = long.groupby("team").season.shift(1)
    long["div_change"] = ((long.prev_div.notna()) & (long.prev_div != long["div"])).astype(int)
    long["season_break"] = ((long.prev_season.notna()) & (long.prev_season != long.season)).astype(int)

    feat_cols = [c for c in long.columns if any(c.endswith(s) for s in
                 ("_r5", "_r10", "_ewm5"))] + ["days_rest", "matches_last_14d", "div_change",
                                                "season_break", "is_home"]
    base = ["match_id", "team", "is_home"] + feat_cols
    home_feats = long[long.is_home == 1][base].add_prefix("h_").rename(columns={"h_match_id": "match_id"})
    away_feats = long[long.is_home == 0][base].add_prefix("a_").rename(columns={"a_match_id": "match_id"})
    home_feats = home_feats.drop(columns=["h_team", "h_is_home"])
    away_feats = away_feats.drop(columns=["a_team", "a_is_home"])

    out = df.merge(home_feats, on="match_id", how="left").merge(away_feats, on="match_id", how="left")
    out = context_features(out)
    # Priors de temporada anterior
    tp = team_season_priors(long)
    for side, team in (("home", "home_team"), ("away", "away_team")):
        m = out[["match_id", "div", team, "season"]].merge(
            tp, left_on=["div", team, "season"], right_on=["div", "team", "target_season"], how="left")
        m = m.set_index("match_id")
        for c in ("prev_n", "prev_ppg", "prev_gf_pg", "prev_ga_pg", "prev_sot_pg"):
            out[f"{side}_{c}"] = m[c].reindex(out.match_id).values
    lp = league_priors(df)
    out = out.merge(lp, on=["div", "season"], how="left")
    # Diferenciales clave
    for c in ("elo_diff", "elo_diff_no_hfa"):
        out[c] = out[c].astype(float)
    out["elo_prob_home_nodraw"] = 1.0 / (1.0 + 10.0 ** (-out.elo_diff / 400.0))
    out["elo_diff_x_progress"] = out.elo_diff * out.season_progress
    out["form_pts_diff_r5"] = out.h_points_r5 - out.a_points_r5
    out["form_gd_diff_r5"] = out.h_gd_r5 - out.a_gd_r5
    out["form_gd_diff_r10"] = out.h_gd_r10 - out.a_gd_r10
    out["rest_diff"] = out.h_days_rest - out.a_days_rest
    out["congestion_diff"] = out.h_matches_last_14d - out.a_matches_last_14d

    # Target y metadatos
    out["y"] = out.result.map({"H": 0, "D": 1, "A": 2}).astype("Int64")
    out["season_start"] = pd.to_numeric(out.season_start, errors="coerce").astype("Int64")
    out["goals_total"] = out.home_goals + out.away_goals
    out = out.sort_values(["div", "match_date", "match_id"], kind="mergesort").reset_index(drop=True)
    # Comprobación de leakage básica: el Elo pre-partido no puede coincidir siempre con el post
    assert not np.allclose(out.elo_home, out.elo_home_post), "Elo sin actualización"
    assert out[["h_points_r5", "a_points_r5"]].notna().any().all(), "rolling vacío"

    os.makedirs(PROC, exist_ok=True)
    out.to_parquet(os.path.join(PROC, "features.parquet"), index=False)
    out.to_csv(os.path.join(PROC, "features.csv"), index=False)
    # Diccionario generado
    num = out.select_dtypes(include=[np.number]).columns
    desc = out[num].describe().T
    lines = ["# Diccionario de features (generado)", "",
             f"Generado: {datetime.now(timezone.utc).isoformat(timespec='seconds')}",
             f"Filas: {len(out):,} · Columnas: {len(out.columns)}", "",
             "Todas las ventanas usan `.shift(1)` por equipo: solo partidos estrictamente anteriores.", "",
             "| Feature | n | media | std | min | max |", "|---|---|---|---|---|---|"]
    for c in num:
        r = desc.loc[c]
        lines.append(f"| `{c}` | {int(r['count']):,} | {r['mean']:.4f} | {r['std']:.4f} | "
                     f"{r['min']:.4f} | {r['max']:.4f} |")
    with open(os.path.join(ROOT, "reports", "A05_feature_dictionary.md"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"features: {len(out):,} filas x {len(out.columns)} columnas")
    print("nulls por bloque:")
    print(out[["elo_diff", "h_points_r5", "h_days_rest", "home_prev_ppg", "lg_avg_total_prev"]]
          .isna().mean().round(4).to_string())
    print(f"escrito -> {os.path.join(PROC, 'features.parquet')}")


if __name__ == "__main__":
    main()
