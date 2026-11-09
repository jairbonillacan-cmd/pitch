"""Features causales pre-partido para la NFL (Elo, descanso, forma, contexto).

Principio único: **cada fila usa solo información estrictamente anterior al
``gameday`` de ese partido**. Se implementa recorriendo los partidos en orden
cronológico y actualizando el estado *después* de emitir las features de todos
los partidos de una misma fecha. Esto es más estricto que un ``.shift(1)`` por
equipo: tampoco usa los partidos de la misma jornada.

Elo
---
* Arranque 1500, K configurable (def. 20), ventaja de campo en puntos Elo
  (def. 55 ≈ 2.5 puntos de spread), regresión a la media del 25 % al empezar
  cada temporada (``elo = 1500 + 0.75*(elo-1500)``).
* Multiplicador por margen de victoria estilo 538:
  ``mov = ln(|margen|+1) * 2.2 / (0.001*|Δelo_efectivo| + 2.2)``.
* Empate: ``S = 0.5`` para ambos.
* En sede neutral no se aplica HFA (``neutral_site``), documentado.

Forma reciente
--------------
Últimos 5 partidos *anteriores* a la fecha, sin reiniciar en el cambio de
temporada (en semana 1 es la única información disponible). Se emiten medias
por partido: win%, puntos a favor, puntos en contra y diferencial.

Uso::

    ./.venv/bin/python models/nfl/features.py            # construye el parquet
    ./.venv/bin/python models/nfl/features.py --verify   # test de causalidad
"""

from __future__ import annotations

import argparse
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

NUMERIC_FEATURES = [
    "elo_diff",
    "elo_home_win_prob",
    "elo_home_pre",
    "elo_away_pre",
    "rest_home",
    "rest_away",
    "rest_diff",
    "f5_win_home",
    "f5_win_away",
    "f5_pf_home",
    "f5_pa_home",
    "f5_pf_away",
    "f5_pa_away",
    "f5_diff_home",
    "f5_diff_away",
    "f5_diff_delta",
    "week",
    "div_game",
    "is_indoor",
    "neutral_site",
    "n_prior_home",
    "n_prior_away",
]
CATEGORICAL_FEATURES = ["surface"]
FEATURES_ALL = NUMERIC_FEATURES + CATEGORICAL_FEATURES


def _mov_multiplier(margin: int, elo_gap: float) -> float:
    return float(
        np.log(abs(margin) + 1.0) * ELO_MOV_SCALE / (0.001 * abs(elo_gap) + ELO_MOV_SCALE)
    )


def build_features(
    games: pd.DataFrame,
    elo_k: float = ELO_K,
    elo_hfa: float = ELO_HFA,
    window: int = FORM_WINDOW,
) -> pd.DataFrame:
    """Devuelve una copia de ``games`` con las columnas de features causales."""
    df = games.sort_values(["gameday", "game_id"]).reset_index(drop=True).copy()

    elo: dict[str, float] = defaultdict(lambda: ELO_START)
    last_season: dict[str, int] = {}
    hist: dict[str, deque] = defaultdict(lambda: deque(maxlen=window))

    out = {
        "elo_home_pre": np.full(len(df), np.nan),
        "elo_away_pre": np.full(len(df), np.nan),
        "elo_diff": np.full(len(df), np.nan),
        "elo_home_win_prob": np.full(len(df), np.nan),
        "f5_win_home": np.full(len(df), np.nan),
        "f5_win_away": np.full(len(df), np.nan),
        "f5_pf_home": np.full(len(df), np.nan),
        "f5_pa_home": np.full(len(df), np.nan),
        "f5_pf_away": np.full(len(df), np.nan),
        "f5_pa_away": np.full(len(df), np.nan),
        "f5_diff_home": np.full(len(df), np.nan),
        "f5_diff_away": np.full(len(df), np.nan),
        "n_prior_home": np.zeros(len(df), dtype=int),
        "n_prior_away": np.zeros(len(df), dtype=int),
    }

    def _regress(team: str, season: int) -> None:
        prev = last_season.get(team)
        if prev is not None and season > prev:
            elo[team] = ELO_START + ELO_SEASON_REGRESSION * (elo[team] - ELO_START)
        last_season[team] = season

    for gameday, day in df.groupby("gameday", sort=True):
        idx = day.index.to_numpy()
        # --- 1) emitir features con el estado ANTERIOR a la jornada ---
        for i in idx:
            row = df.loc[i]
            h, a = row["home_franchise"], row["away_franchise"]
            _regress(h, int(row["season"]))
            _regress(a, int(row["season"]))

            hfa = 0.0 if bool(row["neutral_site"]) else elo_hfa
            gap = (elo[h] + hfa) - elo[a]
            out["elo_home_pre"][i] = elo[h]
            out["elo_away_pre"][i] = elo[a]
            out["elo_diff"][i] = gap
            out["elo_home_win_prob"][i] = 1.0 / (1.0 + 10.0 ** (-gap / 400.0))

            out["n_prior_home"][i] = len(hist[h])
            out["n_prior_away"][i] = len(hist[a])
            for side, team in (("home", h), ("away", a)):
                games_ = list(hist[team])
                if games_:
                    out[f"f5_win_{side}"][i] = float(np.mean([g[0] for g in games_]))
                    out[f"f5_pf_{side}"][i] = float(np.mean([g[1] for g in games_]))
                    out[f"f5_pa_{side}"][i] = float(np.mean([g[2] for g in games_]))
                    out[f"f5_diff_{side}"][i] = float(np.mean([g[1] - g[2] for g in games_]))

        # --- 2) actualizar el estado con los resultados de la jornada ---
        for i in idx:
            row = df.loc[i]
            h, a = row["home_franchise"], row["away_franchise"]
            margin = int(row["home_margin"])
            hs, as_ = int(row["home_score"]), int(row["away_score"])
            s_home = 1.0 if margin > 0 else (0.5 if margin == 0 else 0.0)
            hfa = 0.0 if bool(row["neutral_site"]) else elo_hfa
            gap = (elo[h] + hfa) - elo[a]
            e_home = 1.0 / (1.0 + 10.0 ** (-gap / 400.0))
            delta = elo_k * _mov_multiplier(margin, gap) * (s_home - e_home)
            elo[h] += delta
            elo[a] -= delta
            hist[h].append((1.0 if margin > 0 else 0.0, hs, as_))
            hist[a].append((1.0 if margin < 0 else 0.0, as_, hs))

    feats = pd.DataFrame(out, index=df.index)
    for col in feats.columns:
        df[col] = feats[col]

    df["f5_diff_delta"] = df["f5_diff_home"] - df["f5_diff_away"]
    df["rest_diff"] = df["home_rest"].astype(int) - df["away_rest"].astype(int)
    df["rest_home"] = df["home_rest"].astype(float)
    df["rest_away"] = df["away_rest"].astype(float)
    df["week"] = df["week"].astype(float)
    df["div_game"] = df["div_game"].astype(float)
    df["is_indoor"] = df["is_indoor"].astype(float)
    df["neutral_site"] = df["neutral_site"].astype(float)
    df["surface"] = df["surface"].fillna("unknown").astype(str)
    df["label"] = df["result"].map({"H": "H", "T": "D", "A": "A"})  # T -> D (contrato del lab)
    df["y"] = df["label"].map({"H": 0, "D": 1, "A": 2}).astype(int)
    return df


def drop_warmup(df: pd.DataFrame, min_prior: int = MIN_PRIOR_GAMES) -> pd.DataFrame:
    """Descarta filas sin historia suficiente (solo afecta a 1999 semanas 1-5)."""
    keep = (df["n_prior_home"] >= min_prior) & (df["n_prior_away"] >= min_prior)
    return df[keep].reset_index(drop=True)


def check_causality(df: pd.DataFrame, elo_k: float = ELO_K, elo_hfa: float = ELO_HFA) -> dict:
    """Test de leakage: truncar el pasado no puede cambiar el presente.

    Se reconstruyen las features usando solo partidos anteriores a varias fechas
    de corte y se comparan con las del cálculo completo para esas mismas filas.
    Cualquier diferencia > 1e-12 indicaría uso de información futura.
    """
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
                continue  # columnas estáticas del partido
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
    ap = argparse.ArgumentParser(description="Construye features causales NFL")
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
        f"sd={trimmed['elo_diff'].std():.1f}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
