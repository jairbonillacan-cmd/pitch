#!/usr/bin/env python3
"""Features de mercado (Motor B): probabilidades sin margen, márgenes y movimiento.

Métodos de eliminación del margen implementados (EXP08 los compara):
  - proporcional (normalización simple)
  - power (Shin/Power: p_i = q_i^alpha con sum p = 1)
  - Shin (1993) con z resuelto numéricamente

Nota de disponibilidad (ver CONTRACT_DATASET.md): football-data.co.uk no publica timestamps.
"open" = cuota de apertura; "close" = cuota de cierre. El cierre NO se usa como feature de un
modelo operable con antelación: se usa como benchmark y como escenario "línea de cierre".

Uso:
    ./.venv/bin/python features/build_market_features.py
Salida:
    data/processed/features_market.parquet / .csv
    reports/A07_market_features.md
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from scipy.optimize import brentq

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROC = os.path.join(ROOT, "data", "processed")


def proportional(odds: np.ndarray) -> np.ndarray:
    q = 1.0 / odds
    return q / q.sum(axis=-1, keepdims=True)


def power(odds: np.ndarray) -> np.ndarray:
    q = 1.0 / odds

    def f(alpha, row):
        return np.power(row, alpha).sum() - 1.0

    out = np.full_like(q, np.nan)
    for i, row in enumerate(q):
        if not np.all(np.isfinite(row)) or np.any(row <= 0):
            continue
        try:
            a = brentq(lambda a: f(a, row), 1e-6, 5.0, xtol=1e-10)
        except ValueError:
            continue
        out[i] = np.power(row, a)
    return out


def shin(odds: np.ndarray) -> np.ndarray:
    q = 1.0 / odds
    out = np.full_like(q, np.nan)
    for i, row in enumerate(q):
        if not np.all(np.isfinite(row)) or np.any(row <= 0):
            continue
        Q = row.sum()

        def f(z):
            return np.sum((np.sqrt(z * z + 4 * (1 - z) * row * row / Q) - z) / (2 * (1 - z))) - 1.0

        try:
            z = brentq(f, 0.0, 0.5, xtol=1e-12)
            out[i] = (np.sqrt(z * z + 4 * (1 - z) * row * row / Q) - z) / (2 * (1 - z))
        except ValueError:
            continue
    return out


def add_source(df: pd.DataFrame, phase: str, src: str, method: str = "proportional") -> pd.DataFrame:
    cols = [f"odds_{phase}_{src}_{k}" for k in "hda"]
    if not all(c in df.columns for c in cols):
        return df
    odds = df[cols].to_numpy(dtype=float)
    valid = np.all(np.isfinite(odds), axis=1) & np.all(odds > 1.0, axis=1)
    probs = np.full((len(df), 3), np.nan)
    if valid.any():
        fn = {"proportional": proportional, "power": power, "shin": shin}[method]
        probs[valid] = fn(odds[valid])
    for j, k in enumerate("hda"):
        df[f"mkt_{phase}_{src}_{method}_{k}"] = probs[:, j]
    df[f"mkt_{phase}_{src}_margin"] = np.where(valid, odds.sum(axis=1) * 0 + (1 / odds).sum(axis=1) - 1, np.nan)
    df[f"mkt_{phase}_{src}_valid"] = valid.astype(int)
    return df


def build() -> pd.DataFrame:
    feats = pd.read_parquet(os.path.join(PROC, "features.parquet"))
    matches = pd.read_parquet(os.path.join(PROC, "matches.parquet"))
    odds_cols = [c for c in matches.columns if c.startswith("odds_")]
    mm = matches[["match_id"] + odds_cols]
    df = feats[["match_id", "div", "season", "match_date", "result", "y"]].merge(mm, on="match_id", how="left")

    for phase in ("open", "close"):
        for src in ("b365", "ps", "avg", "max", "bf", "bfe"):
            for method in ("proportional", "power", "shin"):
                df = add_source(df, phase, src, method)

    # Margen medio y dispersión entre B365 / Pinnacle / Betfair (método proporcional)
    for phase in ("open", "close"):
        mat = np.stack([df[f"mkt_{phase}_{s}_proportional_{k}"].to_numpy() for s in ("b365", "ps", "bf")
                        for k in "hda"], axis=1).reshape(len(df), 3, 3)
        df[f"mkt_{phase}_book_std"] = np.nanstd(mat, axis=1).mean(axis=1)
        df[f"mkt_{phase}_books_available"] = np.sum(np.all(np.isfinite(mat), axis=2), axis=1)

    # Movimiento apertura -> cierre (solo escenario closing-line)
    for src in ("ps", "b365", "avg"):
        for k in "hda":
            o = df[f"mkt_open_{src}_proportional_{k}"]
            c = df[f"mkt_close_{src}_proportional_{k}"]
            df[f"mkt_move_{src}_{k}"] = np.log(c / o)
        df[f"mkt_move_{src}_l1"] = sum(df[f"mkt_move_{src}_{k}"].abs() for k in "hda")

    df["mkt_close_ps_fav_prob"] = df[[f"mkt_close_ps_proportional_{k}" for k in "hda"]].max(axis=1)
    df["mkt_close_ps_entropy"] = -(df[[f"mkt_close_ps_proportional_{k}" for k in "hda"]]
                                  .clip(1e-9, 1) * np.log(
                                      df[[f"mkt_close_ps_proportional_{k}" for k in "hda"]].clip(1e-9, 1))).sum(axis=1)
    return df


def report(df: pd.DataFrame) -> str:
    n = len(df)
    lines = ["# Features de mercado — generación y validación", "",
             f"Generado: {datetime.now(timezone.utc).isoformat(timespec='seconds')}", "",
             "## Cobertura de cuotas", "",
             "| Bloque | Partidos | % del total |", "|---|---|---|"]
    for phase in ("open", "close"):
        for src in ("b365", "ps", "avg", "max", "bf", "bfe"):
            c = f"mkt_{phase}_{src}_valid"
            if c in df:
                lines.append(f"| {phase} {src} | {int(df[c].sum()):,} | {df[c].mean():.2%} |")
    lines += ["", "## Propiedades de los métodos de de-vig (cierre, B365)", "",
              "| Método | Suma media | Error máx. de suma | % válidos |", "|---|---|---|---|"]
    for method in ("proportional", "power", "shin"):
        cols = [f"mkt_close_b365_{method}_{k}" for k in "hda"]
        s = df[cols].sum(axis=1, min_count=3)
        lines.append(f"| {method} | {s.mean():.8f} | {np.nanmax(np.abs(s - 1)):.2e} | {s.notna().mean():.1%} |")
    lines += ["", "## Margen medio de la casa (overround, 1X2)", "",
              "| Fuente | Apertura | Cierre |", "|---|---|---|"]
    for src in ("b365", "ps", "avg", "max", "bf", "bfe"):
        o = df[f"mkt_open_{src}_margin"].mean() if f"mkt_open_{src}_margin" in df else np.nan
        c = df[f"mkt_close_{src}_margin"].mean() if f"mkt_close_{src}_margin" in df else np.nan
        lines.append(f"| {src} | {o:.3%} | {c:.3%} |")
    lines += ["", "## Nota de disponibilidad", "",
              "`open` se supone disponible antes del partido (no hay timestamp en la fuente). "
              "`close` es la última cuota previa al inicio: se usa como benchmark de mercado y como "
              "escenario de línea de cierre, nunca como feature de un modelo operable con antelación. "
              "Los movimientos apertura→cierre se evalúan solo en ese escenario (EXP13)."]
    return "\n".join(lines) + "\n"


def main():
    df = build()
    df.to_parquet(os.path.join(PROC, "features_market.parquet"), index=False)
    df.to_csv(os.path.join(PROC, "features_market.csv"), index=False)
    rep = report(df)
    with open(os.path.join(ROOT, "reports", "A07_market_features.md"), "w") as f:
        f.write(rep)
    print(rep[:2000])
    print(f"escrito -> {os.path.join(PROC, 'features_market.parquet')} ({len(df):,} filas)")


if __name__ == "__main__":
    main()
