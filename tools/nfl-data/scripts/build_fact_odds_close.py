"""Build fact_odds_close: clean closing-odds table with implied probabilities and
push/tie flags, ready for backtesting.

Sources (read-only): data/history/normalized/nfl/games_with_weather.parquet
Output:
  data/history/normalized/nfl/fact_odds_close.parquet
  data/history/normalized/nfl/build_manifest_odds.json

Methodology (all derived from the data itself, nothing invented):
  - American odds -> decimal odds -> raw implied prob.
  - Two-way no-vig normalization (ML pair; spread pair; total pair) so probs sum to 1.
  - DTO (draw/tie/other) handling: NFL OT ties exist -> tie flag per game; two-way
    no-vig splits the residual tie mass evenly across both sides.
  - Push handling: integer spread/total lines can push; per-line empirical push rate
    is computed from this dataset (played games with that closing line) and exposed
    as push_rate_by_line, plus is_integer_line flag per game. No external model.
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[3]
SRC = REPO_ROOT / "data/history/normalized/nfl/games_with_weather.parquet"
OUT_PARQUET = REPO_ROOT / "data/history/normalized/nfl/fact_odds_close.parquet"
OUT_MANIFEST = REPO_ROOT / "data/history/normalized/nfl/build_manifest_odds.json"


def american_to_prob(odds: float) -> float | None:
    if odds is None:
        return None
    return (-odds) / ((-odds) + 100) if odds < 0 else 100 / (odds + 100)


def novig_two_way(p1: float | None, p2: float | None, tie_mass: float = 0.0):
    """Normalize two quoted sides to sum 1, reserving tie_mass for draw/other."""
    if p1 is None or p2 is None:
        return None, None
    s = p1 + p2
    if s <= 0:
        return None, None
    residual = max(0.0, 1.0 - tie_mass)
    return (p1 / s) * residual, (p2 / s) * residual


def main() -> int:
    g = pl.read_parquet(SRC)

    t = g.select([
        "game_id", "season", "game_type", "week", "gameday",
        "away_team", "home_team", "away_score", "home_score", "total",
        "spread_line", "total_line",
        "away_moneyline", "home_moneyline",
        "away_spread_odds", "home_spread_odds", "under_odds", "over_odds",
    ])

    # empirical push rate by closing spread and total (played games only)
    played = t.filter(pl.col("home_score").is_not_null())
    spread_push = (
        played.filter(pl.col("spread_line").is_not_null() & (pl.col("spread_line") % 1 == 0))
        .with_columns((pl.col("away_score") - pl.col("home_score") + pl.col("spread_line") == 0).alias("push"))
        .group_by("spread_line").agg(pl.col("push").sum().alias("pushes"), pl.len().alias("n"))
        .sort("spread_line")
    )
    total_push = (
        played.filter(pl.col("total_line").is_not_null() & (pl.col("total_line") % 1 == 0))
        .with_columns((pl.col("total") == pl.col("total_line")).alias("push"))
        .group_by("total_line").agg(pl.col("push").sum().alias("pushes"), pl.len().alias("n"))
        .sort("total_line")
    )

    # per-game derived columns
    t = t.with_columns([
        # ties (OT draws): both scores equal and both non-null
        (pl.col("home_score").is_not_null() & (pl.col("home_score") == pl.col("away_score")))
        .alias("is_tie"),
        (pl.col("spread_line") % 1 == 0).alias("spread_is_integer"),
        (pl.col("total_line") % 1 == 0).alias("total_is_integer"),
    ])

    # implied probabilities (per-row, python for clean None handling)
    rows = t.to_dicts()
    push_map_spread = {r["spread_line"]: r["pushes"] / r["n"] for r in spread_push.to_dicts() if r["n"] >= 30}
    push_map_total = {r["total_line"]: r["pushes"] / r["n"] for r in total_push.to_dicts() if r["n"] >= 30}

    for r in rows:
        ml_a, ml_h = r["away_moneyline"], r["home_moneyline"]
        pa = american_to_prob(ml_a) if ml_a is not None else None
        ph = american_to_prob(ml_h) if ml_h is not None else None
        pna, pnh = novig_two_way(pa, ph, tie_mass=0.0)
        r["ml_prob_away_novig"] = pna
        r["ml_prob_home_novig"] = pnh

        so, ho = r["away_spread_odds"], r["home_spread_odds"]
        pso = american_to_prob(so) if so is not None else None
        pho = american_to_prob(ho) if ho is not None else None
        push_s = push_map_spread.get(r["spread_line"], 0.0) if r["spread_is_integer"] else 0.0
        psa, psh = novig_two_way(pso, pho, tie_mass=push_s)
        r["spread_prob_away_novig"] = psa
        r["spread_prob_home_novig"] = psh
        r["spread_push_prob_empirical"] = push_s if r["spread_is_integer"] else None

        uo, oo = r["under_odds"], r["over_odds"]
        puo = american_to_prob(uo) if uo is not None else None
        poo = american_to_prob(oo) if oo is not None else None
        push_t = push_map_total.get(r["total_line"], 0.0) if r["total_is_integer"] else 0.0
        pu_, po_ = novig_two_way(puo, poo, tie_mass=push_t)
        r["total_prob_under_novig"] = pu_
        r["total_prob_over_novig"] = po_
        r["total_push_prob_empirical"] = push_t if r["total_is_integer"] else None

    table = pl.DataFrame(rows).sort(["season", "week", "game_id"])
    table.write_parquet(OUT_PARQUET)

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "output": str(OUT_PARQUET.relative_to(REPO_ROOT)),
        "rows": table.height,
        "cols": table.width,
        "withMlProb": table.filter(pl.col("ml_prob_home_novig").is_not_null()).height,
        "withSpreadProb": table.filter(pl.col("spread_prob_home_novig").is_not_null()).height,
        "withTotalProb": table.filter(pl.col("total_prob_over_novig").is_not_null()).height,
        "ties": table.filter(pl.col("is_tie")).height,
        "integerSpreadLines": table.filter(pl.col("spread_is_integer")).height,
        "integerTotalLines": table.filter(pl.col("total_is_integer")).height,
        "pushRateBasis": "empírico de esta base (mín. 30 juegos por línea); 0.0 si la línea no alcanza el mínimo",
        "sources": "nflverse-data schedules (CC-BY-4.0), cuotas de cierre",
        "notes": [
            "fact_odds_close: 1 fila por juego con cuotas de cierre y probabilidades no-vig.",
            "Probabilidades home/away/over/under suman 1.0; DTO (empates OT) reservado vía is_tie; "
            "push de líneas enteras reservado vía *_push_prob_empirical.",
            "Regenerar: python -I tools/nfl-data/scripts/build_fact_odds_close.py",
        ],
    }
    OUT_MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({k: manifest[k] for k in ("rows", "withMlProb", "withSpreadProb", "withTotalProb", "ties")}, indent=1))

    # sample push rates for the report
    print("push rates (spread 3, 7; total 41, 43):",
          {k: round(v, 3) for k, v in push_map_spread.items() if k in (3.0, 7.0)},
          {k: round(v, 3) for k, v in push_map_total.items() if k in (41.0, 43.0)})
    return 0


if __name__ == "__main__":
    sys.exit(main())
