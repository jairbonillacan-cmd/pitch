"""ETL NFL: games.csv (nflverse) -> data/nfl/processed/nfl_games.parquet.

Decisiones (todas documentadas en reports/A12_nfl.md):

1. **Solo partidos con marcador**. El calendario 2026 llega sin scores; se
   descarta (nunca se rellena).
2. **Solo temporada regular** (``game_type == "REG"``). Playoffs quedan fuera
   del dataset modelable (sedes neutrales, descansos atípicos, mercado con otra
   liquidez); se contabilizan en el informe.
3. ``result`` se normaliza a ``H``/``A``/``T`` desde los marcadores (la columna
   homónima del CSV es el margen local y se verifica, no se asume).
4. Moneylines americanas -> decimal -> probabilidad implícita -> de-vig
   proporcional y de-vig potencia (``k`` tal que ``Σ imp^k = 1``).
5. ``spread_line`` se conserva con el signo de nflverse, verificado
   empíricamente: **positivo = el local es favorito** por esos puntos.

Uso::

    ./.venv/bin/python models/nfl/build_dataset.py
"""

from __future__ import annotations

import json
import sys

import numpy as np
import pandas as pd
from scipy.optimize import brentq

from config import DATASET, FRANCHISE_MAP, GAME_TYPE, PROCESSED_DIR, RAW_CSV

OUTPUT_COLUMNS = [
    "game_id",
    "season",
    "game_type",
    "week",
    "gameday",
    "weekday",
    "home_team",
    "away_team",
    "home_franchise",
    "away_franchise",
    "home_score",
    "away_score",
    "home_margin",
    "result",
    "home_win",
    "tie",
    "total",
    "overtime",
    "location",
    "neutral_site",
    "div_game",
    "home_rest",
    "away_rest",
    "rest_diff",
    "roof",
    "is_indoor",
    "surface",
    "surface_raw",
    "temp",
    "wind",
    "spread_line",
    "total_line",
    "home_moneyline",
    "away_moneyline",
    "home_ml_dec",
    "away_ml_dec",
    "home_ml_imp",
    "away_ml_imp",
    "ml_overround",
    "home_ml_devig_prop",
    "away_ml_devig_prop",
    "home_ml_devig_power",
    "away_ml_devig_power",
    "has_moneyline",
]


def american_to_decimal(ml: pd.Series) -> pd.Series:
    """Cuota americana -> decimal. ``+150`` -> 2.5; ``-200`` -> 1.5."""
    ml = pd.to_numeric(ml, errors="coerce")
    dec = pd.Series(np.nan, index=ml.index, dtype="float64")
    pos = ml >= 100.0
    neg = ml <= -100.0
    dec[pos] = 1.0 + ml[pos] / 100.0
    dec[neg] = 1.0 + 100.0 / ml[neg].abs()
    return dec


def _power_k(imp: np.ndarray) -> float:
    """Exponente ``k`` con ``Σ imp_i^k = 1`` (de-vig potencia)."""
    imp = np.clip(imp, 1e-9, 1.0 - 1e-9)
    if imp.size < 2:
        return np.nan
    f = lambda k: float(np.sum(imp**k) - 1.0)
    lo, hi = 0.05, 20.0
    if f(lo) < 0:  # mercado infravalorado (raro): no hay raíz en el rango
        return np.nan
    if f(hi) > 0:
        return np.nan
    return float(brentq(f, lo, hi, xtol=1e-10, maxiter=200))


def devig_pair(home_imp: float, away_imp: float) -> tuple[float, float, float, float]:
    """Devuelve (prop_h, prop_a, power_h, power_a) para un mercado 2-vías."""
    imp = np.array([home_imp, away_imp], dtype="float64")
    if not np.all(np.isfinite(imp)) or np.any(imp <= 0):
        return (np.nan,) * 4
    prop = imp / imp.sum()
    k = _power_k(imp)
    if not np.isfinite(k):
        power = prop
    else:
        power = imp**k
        power = power / power.sum()
    return float(prop[0]), float(prop[1]), float(power[0]), float(power[1])


def normalize_surface(value) -> str:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return "unknown"
    text = str(value).strip().lower().replace("-", "").replace(" ", "")
    if text in {"grass", "dessograss", "naturalgrass"}:
        return "grass"
    if text in {"fieldturf", "sportturf", "matrixturf", "astroplay", "astroturf", "aturf", "turf"}:
        return "turf"
    return "unknown"


def build(raw: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    audit: dict = {"raw_rows": int(len(raw)), "raw_columns": int(raw.shape[1])}

    df = raw.copy()
    audit["by_game_type"] = df["game_type"].value_counts().to_dict()
    audit["missing_score_rows"] = int(df["home_score"].isna().sum())
    given_margin = pd.to_numeric(df["result"], errors="coerce")  # margen local según nflverse
    scored = df["home_score"].notna() & df["away_score"].notna()
    computed = df.loc[scored, "home_score"] - df.loc[scored, "away_score"]
    audit["result_column_matches_margin"] = bool(
        np.allclose(computed.to_numpy(), given_margin.loc[scored].to_numpy())
    )
    audit["result_column_n_mismatch"] = int(
        (computed.to_numpy() != given_margin.loc[scored].to_numpy()).sum()
    )

    # 1) solo partidos con resultado
    df = df[df["home_score"].notna() & df["away_score"].notna()].copy()
    # 2) solo temporada regular
    df = df[df["game_type"] == GAME_TYPE].copy()
    df["gameday"] = pd.to_datetime(df["gameday"], errors="coerce")
    df = df[df["gameday"].notna()].copy()
    df = df.sort_values(["gameday", "game_id"]).reset_index(drop=True)

    # 3) resultado normalizado + verificación de la columna `result` del CSV
    df["home_score"] = df["home_score"].astype("int64")
    df["away_score"] = df["away_score"].astype("int64")
    df["home_margin"] = df["home_score"] - df["away_score"]
    df["result"] = np.select(
        [df["home_margin"] > 0, df["home_margin"] < 0], ["H", "A"], default="T"
    )
    df["home_win"] = df["home_margin"] > 0
    df["tie"] = df["home_margin"] == 0
    audit["result_counts"] = df["result"].value_counts().to_dict()

    # 4) contexto
    df["neutral_site"] = (df["location"].astype(str).str.strip() != "Home")
    df["roof"] = df["roof"].fillna("unknown").astype(str).str.strip().str.lower()
    df["is_indoor"] = df["roof"].isin(["dome", "closed"]).astype("int8")
    df["surface_raw"] = df["surface"]
    df["surface"] = df["surface"].map(normalize_surface)
    # Continuidad de franquicia para Elo/forma: STL->LA, SD->LAC, OAK->LV.
    df["home_franchise"] = df["home_team"].replace(FRANCHISE_MAP)
    df["away_franchise"] = df["away_team"].replace(FRANCHISE_MAP)
    df["rest_diff"] = df["home_rest"] - df["away_rest"]
    df["div_game"] = df["div_game"].fillna(0).astype("int8")

    # 5) moneylines
    df["home_ml_dec"] = american_to_decimal(df["home_moneyline"])
    df["away_ml_dec"] = american_to_decimal(df["away_moneyline"])
    df["home_ml_imp"] = 1.0 / df["home_ml_dec"]
    df["away_ml_imp"] = 1.0 / df["away_ml_dec"]
    df["has_moneyline"] = (df["home_ml_imp"].notna() & df["away_ml_imp"].notna())
    df["ml_overround"] = np.where(
        df["has_moneyline"], df["home_ml_imp"] + df["away_ml_imp"] - 1.0, np.nan
    )
    prop = df.apply(
        lambda r: devig_pair(r["home_ml_imp"], r["away_ml_imp"])
        if r["has_moneyline"]
        else (np.nan, np.nan, np.nan, np.nan),
        axis=1,
        result_type="expand",
    )
    prop.columns = ["home_ml_devig_prop", "away_ml_devig_prop", "home_ml_devig_power", "away_ml_devig_power"]
    df = pd.concat([df, prop], axis=1)

    # Verificación empírica del signo de spread_line (positivo = local favorito)
    sub = df.dropna(subset=["spread_line"])
    if len(sub) > 100:
        audit["spread_line_sign"] = {
            "corr_with_margin": float(np.corrcoef(sub["spread_line"], sub["home_margin"])[0, 1]),
            "home_win_rate_fav": float(sub.loc[sub["spread_line"] > 0, "home_win"].mean()),
            "home_win_rate_dog": float(sub.loc[sub["spread_line"] < 0, "home_win"].mean()),
            "interpretation": "positivo = local favorito",
        }
    audit["moneyline_overround_median"] = float(df["ml_overround"].median())
    audit["moneyline_coverage_by_season"] = (
        df.groupby("season")["has_moneyline"].mean().round(4).to_dict()
    )
    audit["neutral_site_rows"] = int(df["neutral_site"].sum())
    audit["rest_anomalies"] = {
        "min": int(df["home_rest"].min()),
        "max": int(df["home_rest"].max()),
        "n_rest_ne_7": int((df["rest_diff"].abs() > 0).sum()),
    }
    audit["processed_rows"] = int(len(df))
    audit["seasons"] = [int(df["season"].min()), int(df["season"].max())]
    audit["duplicate_game_id"] = int(df["game_id"].duplicated().sum())
    audit["n_teams"] = int(pd.concat([df["home_team"], df["away_team"]]).nunique())

    return df[OUTPUT_COLUMNS].reset_index(drop=True), audit


def main() -> int:
    if not RAW_CSV.exists():
        print("Falta data/nfl/raw/games.csv: ejecuta models/nfl/download.py", file=sys.stderr)
        return 2
    raw = pd.read_csv(RAW_CSV)
    out, audit = build(raw)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    out.to_parquet(DATASET, index=False)
    (PROCESSED_DIR / "nfl_games_audit.json").write_text(
        json.dumps(audit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"OK {DATASET.relative_to(DATASET.parents[2])} rows={len(out)} cols={out.shape[1]}")
    print(f"seasons={audit['seasons']} ties={audit['result_counts'].get('T', 0)} "
          f"moneyline_coverage={out['has_moneyline'].mean():.3f}")
    print(f"overround_median={audit['moneyline_overround_median']:.4f} "
          f"spread_sign_corr={audit.get('spread_line_sign', {}).get('corr_with_margin', float('nan')):.3f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
