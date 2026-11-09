"""Evaluación walk-forward del motor NFL (A12) sobre 2010-2025.

* Reutiliza ``eval.metrics`` (log-loss, Brier multiclase, RPS H<D<A, accuracy,
  balanced accuracy, ECE top-label, matriz de confusión) y ``eval.compare``
  (bootstrap pareado por bloques) del laboratorio de fútbol.
* Particiones: VAL 2010-2019 (ya usada para elegir K/HFA/C) y TEST 2020-2025
  (no usada en ninguna decisión). El agregado 2010-2025 se reporta como
  "global" y se etiqueta como tal.
* Comparación con el mercado solo en los partidos donde existen ambas
  moneylines (desde 2010 la cobertura es ~100 %).

Artefactos en ``models/nfl/artifacts/``: ``predictions.csv``, ``metrics.json``,
``comparisons.json``, ``config_used.json``, ``run_metadata.json``,
``summary_tables.md``.

Uso::

    ./.venv/bin/python models/nfl/run_eval.py
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from config import (
    ARTIFACTS_DIR,
    DATASET,
    EVAL_SEASONS,
    LAB_ROOT,
    MANIFEST,
    N_BOOTSTRAP,
    SEED,
    TEST_SEASONS,
    VAL_SEASONS,
)
from features import build_features, drop_warmup
from wf import MODELS, run_walk_forward

if str(LAB_ROOT) not in sys.path:
    sys.path.insert(0, str(LAB_ROOT))

import eval.compare as C  # noqa: E402
import eval.metrics as M  # noqa: E402

PERIODS = {
    "val_2010_2019": tuple(VAL_SEASONS),
    "test_2020_2025": tuple(TEST_SEASONS),
    "global_2010_2025": tuple(EVAL_SEASONS),
}

COMPARISONS = [
    ("logit", "market_prop"),
    ("logit", "market_power"),
    ("hgb", "market_prop"),
    ("blend", "market_prop"),
    ("logit", "base_freq"),
    ("logit", "hgb"),
    ("market_power", "market_prop"),
]


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def prob_matrix(preds: pd.DataFrame, model: str) -> np.ndarray:
    sub = preds[preds["model"] == model].sort_values(["season", "gameday", "game_id"])
    return sub[["p_home", "p_draw", "p_away"]].to_numpy(dtype="float64")


def aligned(preds: pd.DataFrame, models: list[str]) -> tuple[pd.DataFrame, dict[str, np.ndarray]]:
    """Alinea todos los modelos por ``game_id`` y devuelve solo filas completas."""
    base = (
        preds[preds["model"] == models[0]][["game_id", "season", "week", "gameday", "y", "result"]]
        .sort_values(["season", "gameday", "game_id"])
        .reset_index(drop=True)
    )
    mats = {}
    for model in models:
        sub = preds[preds["model"] == model].set_index("game_id")
        mats[model] = sub.loc[base["game_id"], ["p_home", "p_draw", "p_away"]].to_numpy(dtype="float64")
    return base, mats


def binary_metrics(y: np.ndarray, p: np.ndarray) -> dict:
    """Métricas 2-clases (H vs A) excluyendo empates; suplementarias.

    ``p`` se renormaliza sobre {H, A}. Log-loss natural, Brier binario y
    accuracy. No forma parte del contrato del lab (que es 3-clases): se usa solo
    para interpretar el efecto del empate.
    """
    keep = y != 1
    yy = y[keep]
    pp = p[keep][:, [0, 2]]
    pp = np.clip(pp, 1e-6, None)
    pp = pp / pp.sum(axis=1, keepdims=True)
    y_bin = (yy == 2).astype(int)  # 1 = gana visitante
    ll = float(-np.mean(np.log(np.where(y_bin == 1, pp[:, 1], pp[:, 0]))))
    brier = float(np.mean((pp[:, 1] - y_bin) ** 2))
    acc = float(np.mean((pp[:, 1] > 0.5).astype(int) == y_bin))
    return {"n": int(keep.sum()), "log_loss": ll, "brier": brier, "accuracy": acc}


def metrics_block(y: np.ndarray, p: np.ndarray, with_tables: bool) -> dict:
    out = M.summary_metrics(y, p, bins=10, include_tables=with_tables)
    out["binary_no_ties"] = binary_metrics(y, p)
    return out


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> int:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    sens = json.loads((ARTIFACTS_DIR / "sensitivity.json").read_text(encoding="utf-8"))
    cfg = sens["best"]
    k, hfa, c = float(cfg["elo_k"]), float(cfg["elo_hfa"]), float(cfg["logit_c"])
    print(f"config congelada: K={k} HFA={hfa} C={c} (elegida en VAL 2010-2019)")

    games = pd.read_parquet(DATASET)
    feats = drop_warmup(build_features(games, elo_k=k, elo_hfa=hfa))
    n_eval = int(feats["season"].isin(EVAL_SEASONS).sum())
    print(f"evaluación: {n_eval} partidos {min(EVAL_SEASONS)}-{max(EVAL_SEASONS)} "
          f"(train disponible desde 1999: {len(feats)})")

    preds = run_walk_forward(feats, EVAL_SEASONS, logit_c=c, progress=True)
    preds.to_csv(ARTIFACTS_DIR / "predictions.csv", index=False)

    results: dict = {
        "config": {"elo_k": k, "elo_hfa": hfa, "logit_c": c},
        "n_games": int(n_eval),
        "seasons": list(EVAL_SEASONS),
        "periods": {},
        "by_season": {},
        "coverage": {},
    }

    for period, seasons in PERIODS.items():
        sub = preds[preds["season"].isin(seasons)]
        base, mats = aligned(sub, list(MODELS))
        y = base["y"].to_numpy(dtype=int)
        block = {}
        for model in MODELS:
            p = mats[model]
            ok = np.isfinite(p).all(axis=1)
            block[model] = metrics_block(y[ok], p[ok], with_tables=(period == "global_2010_2025"))
            block[model]["n_used"] = int(ok.sum())
        results["periods"][period] = block

    for season in EVAL_SEASONS:
        sub = preds[preds["season"] == season]
        base, mats = aligned(sub, list(MODELS))
        y = base["y"].to_numpy(dtype=int)
        row = {"n": int(len(base)), "tie_rate": float(np.mean(y == 1))}
        for model in MODELS:
            p = mats[model]
            ok = np.isfinite(p).all(axis=1)
            m = M.summary_metrics(y[ok], p[ok], include_tables=False)
            row[model] = {key: m[key] for key in ("n", "log_loss", "brier", "rps", "accuracy", "balanced_accuracy", "ece")}
        results["by_season"][str(season)] = row

    # Cobertura de mercado por temporada (solo partidos evaluados)
    cov = (
        preds[preds["model"] == "market_prop"]
        .assign(has_market=lambda d: d["p_home"].notna())
        .groupby("season")["has_market"]
        .agg(["size", "sum"])
        .rename(columns={"size": "n", "sum": "n_con_mercado"})
    )
    results["coverage"] = {
        "by_season": cov.to_dict(orient="index"),
        "share_global": float(cov["n_con_mercado"].sum() / cov["n"].sum()),
    }

    # ------------------------------------------------------------------
    # Bootstrap pareado por bloques (temporada) usando eval.compare
    # ------------------------------------------------------------------
    comparisons: dict = {}
    for period, seasons in PERIODS.items():
        sub = preds[preds["season"].isin(seasons)]
        base, mats = aligned(sub, list(MODELS))
        y = base["y"].to_numpy(dtype=int)
        blocks = base["season"].to_numpy()
        rows = []
        for a, b in COMPARISONS:
            ok = np.isfinite(mats[a]).all(axis=1) & np.isfinite(mats[b]).all(axis=1)
            if ok.sum() < 100:
                continue
            res = C.paired_bootstrap_delta(
                y[ok], mats[a][ok], mats[b][ok], blocks[ok], B=N_BOOTSTRAP, seed=SEED
            )
            res.update({"a": a, "b": b, "period": period, "n": int(ok.sum()),
                        "ll_a": float(M.multiclass_log_loss(y[ok], mats[a][ok])),
                        "ll_b": float(M.multiclass_log_loss(y[ok], mats[b][ok]))})
            rows.append(res)
        comparisons[period] = rows

    # Diagnósticos de mercado
    mp = preds[preds["model"] == "market_prop"]
    mkt = {
        "n_with_market": int(mp["p_home"].notna().sum()),
        "tie_prob_used_mean": float(mp["p_draw"].dropna().mean()),
        "home_prob_mean": float(mp["p_home"].dropna().mean()),
        "observed_home_share": float((mp["y"] == 0).mean()),
        "observed_tie_share": float((mp["y"] == 1).mean()),
        "observed_away_share": float((mp["y"] == 2).mean()),
    }

    # Base rates por temporada (para el informe)
    base_rates = (
        feats.groupby("season")["y"]
        .value_counts(normalize=True)
        .unstack(fill_value=0.0)
        .rename(columns={0: "H", 1: "T", 2: "A"})
    )
    results["base_rates"] = base_rates.round(4).to_dict(orient="index")

    (ARTIFACTS_DIR / "metrics.json").write_text(
        json.dumps(results, indent=2, ensure_ascii=False, default=float) + "\n", encoding="utf-8"
    )
    (ARTIFACTS_DIR / "comparisons.json").write_text(
        json.dumps({"comparisons": comparisons, "market_diagnostics": mkt}, indent=2,
                   ensure_ascii=False, default=float) + "\n", encoding="utf-8"
    )
    (ARTIFACTS_DIR / "config_used.json").write_text(
        json.dumps(
            {
                "elo_k": k,
                "elo_hfa": hfa,
                "logit_c": c,
                "seasons_eval": list(EVAL_SEASONS),
                "seasons_val": list(VAL_SEASONS),
                "seasons_test": list(TEST_SEASONS),
                "seed": SEED,
                "bootstrap_B": N_BOOTSTRAP,
                "models": list(MODELS),
                "selection_source": "models/nfl/artifacts/sensitivity.json",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    (ARTIFACTS_DIR / "run_metadata.json").write_text(
        json.dumps(
            {
                "ran_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "python": sys.version.split()[0],
                "pandas": pd.__version__,
                "numpy": np.__version__,
                "raw_sha256": manifest.get("sha256"),
                "raw_rows": manifest.get("rows"),
                "n_games_evaluated": int(n_eval),
                "n_predictions_rows": int(len(preds)),
                "seed": SEED,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    write_summary_tables(results, comparisons, mkt, cfg)
    print("artefactos escritos en", ARTIFACTS_DIR.relative_to(LAB_ROOT))
    return 0


def write_summary_tables(results: dict, comparisons: dict, mkt: dict, cfg: dict) -> None:
    """Tablas markdown con las cifras exactas que cita el informe."""
    lines: list[str] = []
    lines.append("# Tablas A12 (generadas por run_eval.py)\n")
    for period in ("val_2010_2019", "test_2020_2025", "global_2010_2025"):
        block = results["periods"][period]
        lines.append(f"\n## {period}\n")
        lines.append("| modelo | n | log-loss | Brier | RPS | acc | bal-acc | ECE | LL 2vías |")
        lines.append("|---|---|---|---|---|---|---|---|---|")
        for model, m in block.items():
            lines.append(
                f"| {model} | {m['n_used']} | {m['log_loss']:.5f} | {m['brier']:.5f} | "
                f"{m['rps']:.5f} | {m['accuracy']:.4f} | {m['balanced_accuracy']:.4f} | "
                f"{m['ece']:.4f} | {m['binary_no_ties']['log_loss']:.5f} |"
            )
    lines.append("\n## Por temporada (log-loss)\n")
    lines.append("| temporada | n | " + " | ".join(results["periods"]["global_2010_2025"].keys()) + " |")
    lines.append("|---" * (2 + len(results["periods"]["global_2010_2025"])) + "|")
    for season, row in results["by_season"].items():
        cells = [f"{row[m]['log_loss']:.5f}" for m in results["periods"]["global_2010_2025"]]
        lines.append(f"| {season} | {row['n']} | " + " | ".join(cells) + " |")
    lines.append("\n## Bootstrap pareado (Δ = loss(a) - loss(b); >0 => a peor)\n")
    lines.append("| periodo | a | b | n | Δlog-loss | IC95 | P(Δ>0) | ΔBrier | IC95 |")
    lines.append("|---|---|---|---|---|---|---|---|---|")
    for period, rows in comparisons.items():
        for r in rows:
            ci = f"[{r['ci95_logloss'][0]:+.5f}, {r['ci95_logloss'][1]:+.5f}]"
            cib = f"[{r['ci95_brier'][0]:+.5f}, {r['ci95_brier'][1]:+.5f}]"
            lines.append(
                f"| {period} | {r['a']} | {r['b']} | {r['n']} | {r['delta_logloss']:+.5f} | {ci} | "
                f"{r['frac_gt0_logloss']:.3f} | {r['delta_brier']:+.5f} | {cib} |"
            )
    lines.append("\n## Mercado\n")
    lines.append(f"- partidos con moneyline evaluados: {mkt['n_with_market']}")
    lines.append(f"- P(local) media mercado: {mkt['home_prob_mean']:.4f} vs observada {mkt['observed_home_share']:.4f}")
    lines.append(f"- P(empate) media inyectada: {mkt['tie_prob_used_mean']:.4f} vs observada {mkt['observed_tie_share']:.4f}")
    lines.append(f"- P(visitante) media mercado: {1 - mkt['home_prob_mean'] - mkt['tie_prob_used_mean']:.4f} vs observada {mkt['observed_away_share']:.4f}")
    lines.append(f"\n- config congelada: {cfg}")
    (ARTIFACTS_DIR / "summary_tables.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
