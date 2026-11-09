"""Features causales pre-partido de 2ª generación para la NFL (Elo, QB Value/Continuity,
descanso, forma ajustada por oponente, expectativa pitagórica y contexto).

Principio único: **cada fila usa solo información estrictamente anterior al
``gameday`` de ese partido**. Se implementa recorriendo los partidos en orden
cronológico y actualizando el estado *después* de emitir las features de todos
los partidos de una misma fecha.

Nuevas señales de 2ª generación (NFL v2):
-----------------------------------------
1. **Quarterback Dynamic Elo & Continuity (`qb_elo_diff`, `qb_val_over_team_*`, `qb_change_*`)**:
   - Un QB debutante o suplente arranca en `QB_ELO_ROOKIE = 1445.0` (nivel reemplazo, -55 pts Elo ≈ -2.2 pts de spread respecto a un titular medio).
   - Se actualiza partido a partido según el resultado y el margen ajustado por la fuerza del rival.
   - `qb_change_home` / `qb_change_away`: indica si el QB titular cambió respecto al partido previo de la franquicia (captura lesiones/bajas de QB).
   - `qb_elo_Composite`: combina 65% Elo de franquicia + 35% valor del QB titular sobre su equipo.
2. **Forma Ajustada por Oponente (`f5_adj_margin_home`, `f5_adj_margin_away`, `f5_adj_margin_diff`)**:
   - Margen de puntos observado menos el margen esperado por el diferencial Elo pre-partido (`gap / 25.0`).
3. **Expectativa Pitagórica (`pyth_win_diff`)**:
   - `PF^2.37 / (PF^2.37 + PA^2.37)` sobre la ventana reciente.

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

NUMERIC_FEATURES = [
    "elo_diff",
    "elo_home_win_prob",
    "elo_home_pre",
    "elo_away_pre",
    "qb_elo_home",
    "qb_elo_away",
    "qb_elo_diff",
    "qb_val_over_team_home",
    "qb_val_over_team_away",
    "qb_change_home",
    "qb_change_away",
    "qb_starts_diff",
    "composite_elo_diff",
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
    "f5_adj_margin_home",
    "f5_adj_margin_away",
    "f5_adj_margin_diff",
    "pyth_win_diff",
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
    """Devuelve una copia de ``games`` con las columnas de features causales (1ª + 2ª gen)."""
    df = games.sort_values(["gameday", "game_id"]).reset_index(drop=True).copy()

    elo: dict[str, float] = defaultdict(lambda: ELO_START)
    last_season: dict[str, int] = {}
    hist: dict[str, deque] = defaultdict(lambda: deque(maxlen=window))

    # Estado causal de Quarterbacks
    qb_elo: dict[str, float] = defaultdict(lambda: QB_ELO_ROOKIE)
    qb_starts: dict[str, int] = defaultdict(int)
    qb_last_season: dict[str, int] = {}
    team_last_qb: dict[str, str] = {}

    n_rows = len(df)
    out = {
        "elo_home_pre": np.full(n_rows, np.nan),
        "elo_away_pre": np.full(n_rows, np.nan),
        "elo_diff": np.full(n_rows, np.nan),
        "elo_home_win_prob": np.full(n_rows, np.nan),
        "qb_elo_home": np.full(n_rows, np.nan),
        "qb_elo_away": np.full(n_rows, np.nan),
        "qb_elo_diff": np.full(n_rows, np.nan),
        "qb_val_over_team_home": np.full(n_rows, np.nan),
        "qb_val_over_team_away": np.full(n_rows, np.nan),
        "qb_change_home": np.zeros(n_rows, dtype=float),
        "qb_change_away": np.zeros(n_rows, dtype=float),
        "qb_starts_diff": np.zeros(n_rows, dtype=float),
        "composite_elo_diff": np.full(n_rows, np.nan),
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
        "pyth_win_diff": np.zeros(n_rows, dtype=float),
        "n_prior_home": np.zeros(n_rows, dtype=int),
        "n_prior_away": np.zeros(n_rows, dtype=int),
    }

    def _regress(team: str, season: int) -> None:
        prev = last_season.get(team)
        if prev is not None and season > prev:
            elo[team] = ELO_START + ELO_SEASON_REGRESSION * (elo[team] - ELO_START)
        last_season[team] = season

    def _regress_qb(qbid: str, season: int) -> None:
        if not qbid or qbid == "unknown":
            return
        prev = qb_last_season.get(qbid)
        if prev is not None and season > prev:
            qb_elo[qbid] = ELO_START + QB_SEASON_REGRESSION * (qb_elo[qbid] - ELO_START)
        qb_last_season[qbid] = season

    has_qb_cols = "home_qb_id" in df.columns and "away_qb_id" in df.columns

    for gameday, day in df.groupby("gameday", sort=True):
        idx = day.index.to_numpy()
        # --- 1) emitir features con el estado ANTERIOR a la jornada ---
        for i in idx:
            row = df.loc[i]
            h, a = row["home_franchise"], row["away_franchise"]
            s_yr = int(row["season"])
            _regress(h, s_yr)
            _regress(a, s_yr)

            qbh = str(row["home_qb_id"]) if has_qb_cols else "unknown"
            qba = str(row["away_qb_id"]) if has_qb_cols else "unknown"
            _regress_qb(qbh, s_yr)
            _regress_qb(qba, s_yr)

            hfa = 0.0 if bool(row["neutral_site"]) else elo_hfa
            gap = (elo[h] + hfa) - elo[a]
            out["elo_home_pre"][i] = elo[h]
            out["elo_away_pre"][i] = elo[a]
            out["elo_diff"][i] = gap

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

            # Elo compuesto (equipo + ajuste de QB titular)
            comp_gap = gap + 0.35 * (val_h - val_a)
            out["composite_elo_diff"][i] = comp_gap
            out["elo_home_win_prob"][i] = 1.0 / (1.0 + 10.0 ** (-comp_gap / 400.0))

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
                    if side == "home":
                        pyth_h = _pyth_expectation([g[1] for g in games_], [g[2] for g in games_])
                    else:
                        pyth_a = _pyth_expectation([g[1] for g in games_], [g[2] for g in games_])
            out["pyth_win_diff"][i] = pyth_h - pyth_a

        # --- 2) actualizar el estado con los resultados de la jornada ---
        for i in idx:
            row = df.loc[i]
            h, a = row["home_franchise"], row["away_franchise"]
            qbh = str(row["home_qb_id"]) if has_qb_cols else "unknown"
            qba = str(row["away_qb_id"]) if has_qb_cols else "unknown"

            margin = int(row["home_margin"])
            hs, as_ = int(row["home_score"]), int(row["away_score"])
            s_home = 1.0 if margin > 0 else (0.5 if margin == 0 else 0.0)
            hfa = 0.0 if bool(row["neutral_site"]) else elo_hfa
            gap = (elo[h] + hfa) - elo[a]
            e_home = 1.0 / (1.0 + 10.0 ** (-gap / 400.0))
            mov = _mov_multiplier(margin, gap)
            delta = elo_k * mov * (s_home - e_home)

            # Margen esperado por Elo (~25 puntos Elo por punto de spread)
            exp_margin_h = gap / 25.0
            adj_margin_h = float(margin) - exp_margin_h

            elo[h] += delta
            elo[a] -= delta
            hist[h].append((1.0 if margin > 0 else 0.0, hs, as_, adj_margin_h))
            hist[a].append((1.0 if margin < 0 else 0.0, as_, hs, -adj_margin_h))

            # Actualizar Elo individual del QB titular
            qeh = qb_elo[qbh] if (qbh and qbh != "unknown") else elo[h]
            qea = qb_elo[qba] if (qba and qba != "unknown") else elo[a]
            qb_gap = (0.5 * (qeh + elo[h]) + hfa) - 0.5 * (qea + elo[a])
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

    feats = pd.DataFrame(out, index=df.index)
    for col in feats.columns:
        df[col] = feats[col]

    df["f5_diff_delta"] = df["f5_diff_home"] - df["f5_diff_away"]
    df["f5_adj_margin_diff"] = df["f5_adj_margin_home"] - df["f5_adj_margin_away"]
    df["rest_diff"] = df["home_rest"].astype(int) - df["away_rest"].astype(int)
    df["rest_home"] = df["home_rest"].astype(float)
    df["rest_away"] = df["away_rest"].astype(float)
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
    ap = argparse.ArgumentParser(description="Construye features causales NFL (v2 con QB Value)")
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
        f"qb_elo_diff sd={trimmed['qb_elo_diff'].std():.1f}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
