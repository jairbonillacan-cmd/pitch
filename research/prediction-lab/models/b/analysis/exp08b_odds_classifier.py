#!/usr/bin/env python3
"""EXP08b — ¿De-vig + corrección calibrada o clasificador que consume cuotas?

Evidencia para la recomendación del Motor B. Se comparan, **sobre el mismo
conjunto de partidos y en escenario de línea de cierre**:

===============  =====================================================  =========
modelo           descripción                                           parámetros
===============  =====================================================  =========
``M0_devig``     de-vig *power* (EXP08a), sin ajuste                    0
``M1_temp``      M0 con temperatura T ajustada en dev                   1
``M2_logit``     logística multinomial sobre log p (H,D,A)              12
``M3_logit_m``   M2 + margen de la casa                                 13
``M4_hgb``       HistGradientBoosting sobre log p + margen       ~cientos
``M5_motor_a``   Motor A (logit/HGB sin cuotas) como referencia          —
===============  =====================================================  =========

Todo se entrena en ``dev`` (≤2022/23) y se evalúa en ``val`` (2023/24). Los
hiperparámetros de M4 se eligen con una validación interna *dentro de dev*
(última temporada de dev), nunca con ``val``. Test no se toca.

La pregunta operativa es: ¿un clasificador entrenado con cuotas bate al de-vig
en log-loss/Brier/RPS? Si no, el Motor B debe partir del de-vig y, como mucho,
corregir la calibración con 1–13 parámetros.

Uso::

    ./.venv/bin/python models/b/analysis/exp08b_odds_classifier.py
"""
from __future__ import annotations

import os

# sklearn/OpenMP se sobre suscribe en este equipo (hasta 10x más lento con 4 hilos
# que con 1). Debe fijarse ANTES de importar sklearn/numpy.
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import minimize_scalar
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression

sys.path.insert(0, str(Path(__file__).resolve().parent))
import market_common as K  # noqa: E402

PHASE, SRC = "close", "ps"
INNER_VAL_YEAR = 2022  # última temporada de dev: solo para elegir hiperparámetros de M4
HGB_GRID = [
    {"max_iter": 150, "learning_rate": 0.06, "max_leaf_nodes": 15, "l2_regularization": 1.0},
    {"max_iter": 150, "learning_rate": 0.10, "max_leaf_nodes": 7, "l2_regularization": 1.0},
    {"max_iter": 150, "learning_rate": 0.05, "max_leaf_nodes": 31, "l2_regularization": 5.0},
]


def features(d: pd.DataFrame) -> np.ndarray:
    """log p (3) + margen (1). ``p`` es el de-vig power."""
    p = K.probs(d, PHASE, SRC, "power")
    logp = np.log(np.clip(p, 1e-9, 1.0))
    margin = d[f"mkt_{PHASE}_{SRC}_margin"].to_numpy().reshape(-1, 1)
    return np.hstack([logp, margin])


def temperature_fit(y, p, ) -> float:
    """T que minimiza el log-loss de ``softmax(log p / T)``."""
    logp = np.log(np.clip(p, 1e-12, 1.0))

    def loss(t: float) -> float:
        z = logp / t
        z = z - z.max(axis=1, keepdims=True)
        q = np.exp(z)
        q /= q.sum(axis=1, keepdims=True)
        return float(K.per_sample_log_loss(y, q).mean())

    res = minimize_scalar(loss, bounds=(0.5, 3.0), method="bounded",
                          options={"xatol": 1e-5})
    return float(res.x)


def temperature_apply(p, t: float) -> np.ndarray:
    logp = np.log(np.clip(p, 1e-12, 1.0))
    z = logp / t
    z = z - z.max(axis=1, keepdims=True)
    q = np.exp(z)
    return q / q.sum(axis=1, keepdims=True)


def evaluate(y, p) -> dict:
    m = K.metrics_bundle(y, p)
    return m


def main() -> None:
    K.ART.mkdir(parents=True, exist_ok=True)
    df = K.dev_val(K.load_market(
        columns=["match_id", "div", "season", "match_date", "y",
                 f"mkt_{PHASE}_{SRC}_valid", f"mkt_{PHASE}_{SRC}_margin"]
        + [f"mkt_{PHASE}_{SRC}_power_{k}" for k in "hda"]))
    d = df[K.available(df, PHASE, SRC) & (df["season_start"] >= 2012)].reset_index(drop=True)
    is_dev = (d["partition"] == "dev").to_numpy()
    is_val = (d["partition"] == "val").to_numpy()
    X = features(d)
    p0 = K.probs(d, PHASE, SRC, "power")
    y = d["y"].to_numpy()

    models: dict = {}
    rows = []

    def add(key: str, label: str, pred_dev: np.ndarray, pred_val: np.ndarray,
            n_params: str, note: str = "") -> None:
        models[key] = {
            "label": label, "n_params": n_params, "note": note,
            "dev": evaluate(y[is_dev], pred_dev),
            "val": evaluate(y[is_val], pred_val),
        }

    # M0 — de-vig sin ajuste
    add("M0_devig", "De-vig power (sin ajuste)", p0[is_dev], p0[is_val], "0",
        "referencia de EXP08a")

    # M1 — temperatura ajustada en dev
    t_star = temperature_fit(y[is_dev], p0[is_dev])
    add("M1_temp", "De-vig + temperatura", temperature_apply(p0[is_dev], t_star),
        temperature_apply(p0[is_val], t_star), "1", f"T*={t_star:.4f} (ajustado en dev)")

    # M2 — logística multinomial sobre log p
    lr2 = LogisticRegression(C=1e6, max_iter=2000, solver="lbfgs")
    lr2.fit(X[is_dev][:, :3], y[is_dev])
    add("M2_logit", "Logística multinomial (log p)", lr2.predict_proba(X[is_dev][:, :3]),
        lr2.predict_proba(X[is_val][:, :3]), "12", "sin margen")

    # M3 — logística multinomial sobre log p + margen
    lr3 = LogisticRegression(C=1e6, max_iter=2000, solver="lbfgs")
    lr3.fit(X[is_dev], y[is_dev])
    add("M3_logit_m", "Logística multinomial (log p + margen)",
        lr3.predict_proba(X[is_dev]), lr3.predict_proba(X[is_val]), "13")

    # M4 — HGB con hiperparámetros elegidos en dev (validación interna)
    inner_tr = is_dev & (d["season_start"].to_numpy() < INNER_VAL_YEAR)
    inner_va = is_dev & (d["season_start"].to_numpy() == INNER_VAL_YEAR)
    best_cfg, best_score = None, np.inf
    grid_rows = []
    if inner_va.sum() >= K.MIN_CELL_N:
        for cfg in HGB_GRID:
            h = HistGradientBoostingClassifier(random_state=K.SEED, early_stopping=False, **cfg)
            h.fit(X[inner_tr], y[inner_tr])
            score = float(K.per_sample_log_loss(y[inner_va], h.predict_proba(X[inner_va])).mean())
            grid_rows.append({**cfg, "inner_val_logloss": score})
            if score < best_score:
                best_cfg, best_score = cfg, score
    else:  # pragma: no cover
        best_cfg = HGB_GRID[0]
    hgb = HistGradientBoostingClassifier(random_state=K.SEED, early_stopping=False, **best_cfg)
    hgb.fit(X[is_dev], y[is_dev])
    add("M4_hgb", "HistGradientBoosting (log p + margen)",
        hgb.predict_proba(X[is_dev]), hgb.predict_proba(X[is_val]),
        "~10^2–10^3", f"cfg elegida en dev: {best_cfg}; inner-val LL={best_score:.5f}")

    # M5 — referencia Motor A (sin cuotas), misma población
    motor = {}
    for name in ("logit", "hgb"):
        pred = pd.read_csv(K.ARTIFACTS_EXP01 / f"pred_{name}.csv",
                           usecols=["match_id", "y", "p_home", "p_draw", "p_away"])
        sub = d[["match_id"]].merge(pred, on="match_id", how="left")
        assert sub["match_id"].is_unique
        p_m = sub[["p_home", "p_draw", "p_away"]].to_numpy()
        ok = np.all(np.isfinite(p_m), axis=1)
        motor[name] = {"coverage": float(ok.mean()), "p": p_m, "ok": ok}
        add(f"M5_motor_{name}", f"Motor A ({name}, sin cuotas)",
            p_m[is_dev & ok], p_m[is_val & ok], "—",
            "no consume cuotas; referencia")

    # ---------------- comparaciones pareadas en val ----------------
    val_blocks = K.blocks_season_div(d[is_val])
    comparisons = []
    base_val = models["M0_devig"]["val"]
    for key, res in models.items():
        if key == "M0_devig":
            continue
        p_val = {"M1_temp": temperature_apply(p0[is_val], t_star),
                 "M2_logit": lr2.predict_proba(X[is_val][:, :3]),
                 "M3_logit_m": lr3.predict_proba(X[is_val]),
                 "M4_hgb": hgb.predict_proba(X[is_val])}.get(key)
        if p_val is None:
            continue
        for metric in ("logloss", "brier", "rps"):
            r = K.block_bootstrap_delta(y[is_val], p_val, p0[is_val], val_blocks,
                                        metric=metric, B=2000)
            comparisons.append({"model": key, "metric": metric, "n": r["n"],
                                "n_blocks": r["n_blocks"], "delta": r["delta"],
                                "ci_lo": r["ci95"][0], "ci_hi": r["ci95"][1],
                                "significant": bool(r["ci95"][0] > 0 or r["ci95"][1] < 0),
                                "model_worse": bool(r["delta"] > 0)})

    # ---- estabilidad de M2 dentro de dev (walk-forward, sin tocar val/test) ----
    years = d["season_start"].to_numpy()
    wf = []
    for eval_year in (2019, 2020, 2021, 2022):
        tr = is_dev & (years < eval_year)
        ev = is_dev & (years == eval_year)
        if tr.sum() < 5000 or ev.sum() < K.MIN_CELL_N:
            continue
        lr_wf = LogisticRegression(C=1e6, max_iter=2000, solver="lbfgs")
        lr_wf.fit(X[tr][:, :3], y[tr])
        p2 = lr_wf.predict_proba(X[ev][:, :3])
        ll0 = float(K.per_sample_log_loss(y[ev], p0[ev]).mean())
        ll2 = float(K.per_sample_log_loss(y[ev], p2).mean())
        wf.append({"eval_season": int(eval_year), "n": int(ev.sum()),
                   "ll_devig": ll0, "ll_m2": ll2, "delta": ll2 - ll0,
                   "brier_delta": float(K.per_sample_brier(y[ev], p2).mean()
                                        - K.per_sample_brier(y[ev], p0[ev]).mean()),
                   "rps_delta": float(K.per_sample_rps(y[ev], p2).mean()
                                      - K.per_sample_rps(y[ev], p0[ev]).mean())})
    wf_df = pd.DataFrame(wf)

    report = {
        "experiment": "EXP08b",
        "title": "De-vig + corrección calibrada vs clasificador que consume cuotas",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": K.SEED,
        "scenario": "closing_line (cierre Pinnacle); no operable con antelación",
        "n": {"dev": int(is_dev.sum()), "val": int(is_val.sum())},
        "market": {"phase": PHASE, "source": SRC, "devig": "power"},
        "temperature": t_star,
        "hgb_grid": grid_rows,
        "hgb_chosen": best_cfg,
        "models": models,
        "comparisons_val": comparisons,
        "walk_forward_dev": wf,
        "verdict": {},
    }

    # veredicto: ¿algún modelo bate a M0 en val con IC excluyendo 0?
    beats = [c for c in comparisons if c["metric"] == "logloss" and c["delta"] < 0
             and c["significant"]]
    report["verdict"] = {
        "de_vig_val_logloss": models["M0_devig"]["val"]["log_loss"],
        "best_val_logloss_model": min(models, key=lambda k: models[k]["val"]["log_loss"]),
        "models_beating_devig_val": [c["model"] for c in beats],
        "motor_a_val_logloss": {k: models[k]["val"]["log_loss"]
                                for k in models if k.startswith("M5_")},
    }
    K.write_json(report, K.ART / "exp08b_odds_classifier.json")
    K.write_csv(pd.DataFrame(comparisons), K.ART / "exp08b_comparisons.csv")

    # ---------------- tabla markdown ----------------
    rows = []
    for key, res in models.items():
        rows.append({"model": key, "descripcion": res["label"], "params": res["n_params"],
                     "ll_dev": res["dev"]["log_loss"], "ll_val": res["val"]["log_loss"],
                     "brier_val": res["val"]["brier"], "rps_val": res["val"]["rps"],
                     "ece_val": res["val"]["ece10"], "n_val": res["val"]["n"]})
    table = K.md_table(pd.DataFrame(rows), digits=4)
    rows = [{"model": c["model"], "metric": c["metric"], "n": c["n"], "n_blocks": c["n_blocks"],
             "delta": c["delta"], "lo": c["ci_lo"], "hi": c["ci_hi"]}
            for c in comparisons]
    table2 = K.md_table(pd.DataFrame(rows), digits=5)
    table3 = ""
    if not wf_df.empty:
        show = wf_df.rename(columns={"eval_season": "temporada", "brier_delta": "dBrier",
                                     "rps_delta": "dRPS"}).copy()
        show["temporada"] = show["temporada"].astype(int)
        show["n"] = show["n"].astype(int)
        table3 = K.md_table(show[["temporada", "n", "ll_devig", "ll_m2", "delta", "dBrier", "dRPS"]],
                            digits=5)
    (K.ART / "exp08b_tables.md").write_text(
        "### Modelos (entrenados en dev, evaluados en val)\n\n" + table +
        "\n\n### Δ vs de-vig power en val (Δ = modelo − de-vig; >0 ⇒ peor)\n\n" + table2 +
        "\n\n### Estabilidad de M2: walk-forward dentro de dev\n\n" + table3 + "\n",
        encoding="utf-8")
    print(table)
    print("\nΔ vs de-vig (val):\n")
    print(table2)
    if table3:
        print("\nWalk-forward dentro de dev (Δ = M2 − de-vig):\n")
        print(table3)
    print("\nT* =", round(t_star, 4), "| HGB elegido:", best_cfg)
    print("veredicto:", K.jsonify(report["verdict"]))


if __name__ == "__main__":
    main()
