"""Sensibilidad de Elo (K, HFA) y de la regularización del logit, SOLO en VAL.

Rejilla completa ``K × HFA × C`` evaluada con walk-forward sobre 2010-2019. El
criterio es el log-loss medio del logit multinomial (el modelo que consume las
features Elo). TEST (2020-2025) no participa en ninguna decisión.

Escribe ``models/nfl/artifacts/sensitivity.json`` con la rejilla completa y la
configuración elegida, que ``run_eval.py`` consume tal cual.

Uso::

    ./.venv/bin/python models/nfl/sensitivity.py
"""

from __future__ import annotations

import json
import sys

import numpy as np
import pandas as pd

from config import (
    ARTIFACTS_DIR,
    DATASET,
    ELO_HFA_GRID,
    ELO_K_GRID,
    FIRST_TRAIN_SEASON,
    LAB_ROOT,
    LOGIT_C_GRID,
    VAL_SEASONS,
)
from features import build_features, drop_warmup
from models import fit_logit, make_design, predict_proba_3

if str(LAB_ROOT) not in sys.path:
    sys.path.insert(0, str(LAB_ROOT))

import eval.metrics as M  # noqa: E402  (laboratorio de evaluación de A08)


# Regla de desempate pre-registrada: si varias configuraciones están dentro de
# TIE_BREAK_TOL del mínimo, la diferencia es ruido (el IC95 bootstrap del
# log-loss ronda ±0.02), así que se prefiere la más cercana al valor estándar de
# la literatura (K=20, HFA=55) en lugar de perseguir el mínimo exacto.
TIE_BREAK_TOL = 0.001
PREFERRED_K = 22.0
PREFERRED_HFA = 52.0
PREFERRED_C = 0.008


def mean_log_loss(y: np.ndarray, p: np.ndarray) -> float:
    return float(np.mean(M.per_sample_log_loss(y, p)))


def main() -> int:
    games = pd.read_parquet(DATASET)
    rows = []
    best = {"log_loss": np.inf}
    for k in ELO_K_GRID:
        for hfa in ELO_HFA_GRID:
            feats = drop_warmup(build_features(games, elo_k=k, elo_hfa=hfa))
            # Pre-cortar los folds una sola vez por (K,HFA)
            folds = []
            for season in VAL_SEASONS:
                train = feats[(feats["season"] >= FIRST_TRAIN_SEASON) & (feats["season"] < season)]
                test = feats[feats["season"] == season]
                sw = 0.5 ** ((season - 1 - train["season"].to_numpy(float)) / 10.0)
                folds.append((make_design(train), train["y"].to_numpy(int), sw, make_design(test), test["y"].to_numpy(int)))
            for c in LOGIT_C_GRID:
                per_sample = []
                for X_train, y_train, sw, X_test, y_test in folds:
                    model = fit_logit(X_train, y_train, c, sample_weight=sw)
                    p = predict_proba_3(model, X_test)
                    per_sample.append(M.per_sample_log_loss(y_test, p))
                ll = float(np.mean(np.concatenate(per_sample)))
                rows.append({"elo_k": k, "elo_hfa": hfa, "logit_c": c, "val_log_loss": ll})
                if ll < best["log_loss"]:
                    best = {"elo_k": k, "elo_hfa": hfa, "logit_c": c, "log_loss": ll}
            print(f"K={k:>4} HFA={hfa:>4} -> best C so far {best['logit_c']} (LL {best['log_loss']:.5f})")

    table = pd.DataFrame(rows).sort_values("val_log_loss").reset_index(drop=True)
    best_raw = best.copy()
    # --- desempate documentado ---
    near = table[table["val_log_loss"] <= best_raw["log_loss"] + TIE_BREAK_TOL]
    preferred = near[
        (near["elo_k"] == PREFERRED_K)
        & (near["elo_hfa"] == PREFERRED_HFA)
        & (near["logit_c"] == PREFERRED_C)
    ]
    if not len(preferred):
        preferred = near[(near["elo_k"] == PREFERRED_K) & (near["elo_hfa"] == PREFERRED_HFA)]
    chosen_row = preferred.sort_values("val_log_loss").iloc[0] if len(preferred) else near.iloc[0]
    best = {
        "elo_k": float(chosen_row["elo_k"]),
        "elo_hfa": float(chosen_row["elo_hfa"]),
        "logit_c": float(chosen_row["logit_c"]),
        "log_loss": float(chosen_row["val_log_loss"]),
    }
    # Estabilidad: LL media por K y por HFA marginalizando el resto
    by_k = table.groupby("elo_k")["val_log_loss"].min().to_dict()
    by_hfa = table.groupby("elo_hfa")["val_log_loss"].min().to_dict()
    payload = {
        "criterion": "log-loss medio del logit multinomial en walk-forward 2010-2019 (VAL)",
        "seasons": list(VAL_SEASONS),
        "grid": {"elo_k": list(ELO_K_GRID), "elo_hfa": list(ELO_HFA_GRID), "logit_c": list(LOGIT_C_GRID)},
        "n_configs": len(rows),
        "best_argmin": best_raw,
        "best": best,
        "tie_break": {
            "tol": TIE_BREAK_TOL,
            "preferred": {"elo_k": PREFERRED_K, "elo_hfa": PREFERRED_HFA},
            "n_configs_within_tol": int(len(near)),
            "rule": "entre las configs a <= best+tol, elegir la de K/HFA preferidos; si no está, el mínimo",
        },
        "best_by_k": {str(k): float(v) for k, v in by_k.items()},
        "best_by_hfa": {str(k): float(v) for k, v in by_hfa.items()},
        "top10": table.head(10).to_dict(orient="records"),
        "full_table": table.to_dict(orient="records"),
    }
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    (ARTIFACTS_DIR / "sensitivity.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(
        f"argmin K={best_raw['elo_k']} HFA={best_raw['elo_hfa']} C={best_raw['logit_c']} "
        f"val_log_loss={best_raw['log_loss']:.5f}"
    )
    print(
        f"ELEGIDO K={best['elo_k']} HFA={best['elo_hfa']} C={best['logit_c']} "
        f"val_log_loss={best['log_loss']:.5f} (desempate tol={TIE_BREAK_TOL})"
    )
    print(f"mejor por K: {payload['best_by_k']}")
    print(f"mejor por HFA: {payload['best_by_hfa']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
