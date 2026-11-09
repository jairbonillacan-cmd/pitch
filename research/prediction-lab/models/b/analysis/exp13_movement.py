#!/usr/bin/env python3
"""EXP13 — Movimiento de cuotas apertura→cierre (escenario *closing-line*).

**Limitación estructural (no se puede sortear):** football-data.co.uk no publica
timestamps de captura. La apertura se supone disponible antes del día del
partido (CONTRACT_DATASET.md §3.3) y el cierre es la última cuota previa al
inicio (§3.4). Por tanto:

* el movimiento se analiza **solo como escenario de línea de cierre**;
* **no** se puede simular una predicción hecha con antelación que use el
  movimiento: para observar el cierre hay que esperar al cierre;
* ninguna cifra de este script es un backtest operable.

Bloques
-------
1. **Magnitud** del movimiento (|Δlog p| por resultado y L1 del partido) y su
   distribución por temporada.
2. **Dirección** y relación con el resultado: cambio de probabilidad del
   resultado finalmente observado, tasas de acierto por quintil de movimiento.
3. **¿Aporta el movimiento algo más allá del cierre?** logística multinomial
   ``log p_close`` vs ``log p_close + movimiento``, entrenada en dev y evaluada
   en val.
4. **Apertura vs cierre**: ¿es el cierre más afilado? (Δ log-loss pareado) y en
   qué subconjuntos (movimiento grande vs pequeño).

Uso::

    ./.venv/bin/python models/b/analysis/exp13_movement.py
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
from sklearn.linear_model import LogisticRegression

sys.path.insert(0, str(Path(__file__).resolve().parent))
import market_common as K  # noqa: E402

PHASE_OPEN, PHASE_CLOSE, SRC, METHOD = "open", "close", "ps", "power"
CLIP = 1.0  # |Δlog p| se recorta a ±1 (factor e) para el modelo y las medias


def movement_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Población con apertura y cierre Pinnacle válidos, más el movimiento."""
    ok = (K.available(df, PHASE_OPEN, SRC, METHOD)
          & K.available(df, PHASE_CLOSE, SRC, METHOD))
    d = df[ok].copy().reset_index(drop=True)
    p_o = K.probs(d, PHASE_OPEN, SRC, METHOD)
    p_c = K.probs(d, PHASE_CLOSE, SRC, METHOD)
    for i, k in enumerate(K.OUTCOMES):
        d[f"mv_{k}"] = np.log(p_c[:, i] / p_o[:, i])
    d["mv_l1"] = np.sum(np.abs(d[["mv_h", "mv_d", "mv_a"]].to_numpy()), axis=1)
    d["p_open_h"], d["p_open_d"], d["p_open_a"] = p_o[:, 0], p_o[:, 1], p_o[:, 2]
    d["p_close_h"], d["p_close_d"], d["p_close_a"] = p_c[:, 0], p_c[:, 1], p_c[:, 2]
    return d


def magnitude_block(d: pd.DataFrame) -> dict:
    out = {"n": int(len(d)), "l1": {}, "by_outcome": {}, "by_season": [], "share_large": {}}
    l1 = d["mv_l1"].to_numpy()
    out["l1"] = {"mean": float(l1.mean()), "median": float(np.median(l1)),
                 "p90": float(np.quantile(l1, 0.90)), "p99": float(np.quantile(l1, 0.99)),
                 "max": float(l1.max())}
    for k in K.OUTCOMES:
        v = d[f"mv_{k}"].to_numpy()
        out["by_outcome"][k] = {"mean_abs": float(np.abs(v).mean()),
                                "p90_abs": float(np.quantile(np.abs(v), 0.90)),
                                "mean_signed": float(v.mean())}
    for season, g in d.groupby("season", sort=False):
        if len(g) < K.MIN_CELL_N:
            continue
        out["by_season"].append({"season": season, "n": int(len(g)),
                                 "l1_mean": float(g["mv_l1"].mean()),
                                 "l1_p90": float(g["mv_l1"].quantile(0.90)),
                                 "abs_mv_h": float(g["mv_h"].abs().mean())})
    for thr in (0.05, 0.10, 0.20, 0.30):
        out["share_large"][f"l1>{thr}"] = float((l1 > thr).mean())
    return out


def direction_block(d: pd.DataFrame) -> dict:
    """Dirección del movimiento y su relación con el resultado."""
    y = d["y"].to_numpy()
    mv = d[["mv_h", "mv_d", "mv_a"]].to_numpy()  # + ⇒ la prob subió hacia el cierre
    p_o = d[["p_open_h", "p_open_d", "p_open_a"]].to_numpy()
    p_c = d[["p_close_h", "p_close_d", "p_close_a"]].to_numpy()
    idx = np.arange(len(y))
    out = {
        "n": int(len(d)),
        "mean_move_h_by_result": {name: float(mv[y == k, 0].mean()) for k, name in enumerate("HDA")},
        "mean_move_of_realized_outcome": float(mv[idx, y].mean()),
        "mean_move_of_unrealized_outcomes": float(
            np.mean([mv[i, [j for j in range(3) if j != y[i]]].mean() for i in range(len(y))])),
        "share_close_higher_than_open_for_winner": float((mv[idx, y] > 0).mean()),
        "mean_p_open_winner": float(p_o[idx, y].mean()),
        "mean_p_close_winner": float(p_c[idx, y].mean()),
        "quintiles_move_h": [],
    }
    q = pd.qcut(d["mv_h"], 5, labels=False, duplicates="drop")
    for quintile, g in d.groupby(q):
        pos = g.index.to_numpy()
        yy = y[pos]
        rec = {"quintile": int(quintile) + 1, "n": int(len(g)),
               "mv_h_range": f"{g['mv_h'].min():+.3f}..{g['mv_h'].max():+.3f}",
               "mv_h_mean": float(g["mv_h"].mean()),
               "p_close_h_mean": float(g["p_close_h"].mean()),
               "home_win_rate": float((yy == 0).mean()),
               "draw_rate": float((yy == 1).mean()),
               "away_win_rate": float((yy == 2).mean())}
        out["quintiles_move_h"].append(rec)
    return out


def _logit_features(d: pd.DataFrame, with_moves: bool) -> np.ndarray:
    close = np.log(np.clip(d[["p_close_h", "p_close_d", "p_close_a"]].to_numpy(), 1e-9, 1.0))
    if not with_moves:
        return close
    mv = np.clip(d[["mv_h", "mv_d", "mv_a"]].to_numpy(), -CLIP, CLIP)
    return np.hstack([close, mv])


def info_beyond_close(d: pd.DataFrame) -> dict:
    """LL(cierre) vs LL(cierre + movimiento), ajustado en dev y evaluado en val."""
    y = d["y"].to_numpy()
    is_dev = (d["partition"] == "dev").to_numpy()
    is_val = (d["partition"] == "val").to_numpy()
    X0 = _logit_features(d, False)
    X1 = _logit_features(d, True)
    res = {"n_dev": int(is_dev.sum()), "n_val": int(is_val.sum()), "models": {}}
    preds = {}
    for key, X in (("close_only", X0), ("close_plus_move", X1)):
        lr = LogisticRegression(C=1e6, max_iter=2000, solver="lbfgs")
        lr.fit(X[is_dev], y[is_dev])
        preds[key] = (lr.predict_proba(X[is_dev]), lr.predict_proba(X[is_val]))
        res["models"][key] = {"dev": K.metrics_bundle(y[is_dev], preds[key][0]),
                              "val": K.metrics_bundle(y[is_val], preds[key][1]),
                              "n_features": int(X.shape[1])}
    # referencia: de-vig crudo (sin ajuste) en la misma población val
    p_close = d[["p_close_h", "p_close_d", "p_close_a"]].to_numpy()
    res["models"]["devig_close_raw"] = {"val": K.metrics_bundle(y[is_val], p_close[is_val])}
    blocks = K.blocks_season_div(d[is_val])
    res["delta_val"] = {}
    for metric in ("logloss", "brier", "rps"):
        r = K.block_bootstrap_delta(y[is_val], preds["close_plus_move"][1],
                                    preds["close_only"][1], blocks, metric=metric, B=2000)
        res["delta_val"][metric] = {"delta": r["delta"], "ci95": r["ci95"],
                                    "n_blocks": r["n_blocks"],
                                    "significant": bool(r["ci95"][0] > 0 or r["ci95"][1] < 0)}
    # EL FINAL: ¿bate el modelo con movimiento al closing raw? (mismo test pareado)
    res["delta_vs_raw_devig"] = {}
    for metric in ("logloss", "brier", "rps"):
        r = K.block_bootstrap_delta(y[is_val], preds["close_plus_move"][1],
                                    p_close[is_val], blocks, metric=metric, B=2000)
        res["delta_vs_raw_devig"][metric] = {"delta": r["delta"], "ci95": r["ci95"],
                                             "n_blocks": r["n_blocks"]}
    return res


def open_vs_close(d: pd.DataFrame) -> dict:
    """¿Es el cierre más afilado que la apertura? Δ = LL(apertura) − LL(cierre) > 0 ⇒ cierre mejor."""
    y = d["y"].to_numpy()
    p_o = d[["p_open_h", "p_open_d", "p_open_a"]].to_numpy()
    p_c = d[["p_close_h", "p_close_d", "p_close_a"]].to_numpy()
    out = {"n": int(len(d)), "ll_open": float(K.per_sample_log_loss(y, p_o).mean()),
           "ll_close": float(K.per_sample_log_loss(y, p_c).mean()),
           "brier_open": float(K.per_sample_brier(y, p_o).mean()),
           "brier_close": float(K.per_sample_brier(y, p_c).mean()),
           "rps_open": float(K.per_sample_rps(y, p_o).mean()),
           "rps_close": float(K.per_sample_rps(y, p_c).mean())}
    for part in ("dev", "val"):
        m = (d["partition"] == part).to_numpy()
        r = K.block_bootstrap_delta(y[m], p_o[m], p_c[m], K.blocks_season_div(d[m]),
                                    metric="logloss", B=2000)
        out[f"delta_open_minus_close_{part}"] = {"delta": r["delta"], "ci95": r["ci95"],
                                                 "n": r["n"], "n_blocks": r["n_blocks"]}
    # por magnitud de movimiento
    q90 = float(d["mv_l1"].quantile(0.90))
    for label, mask in (("grandes", (d["mv_l1"] > q90).to_numpy()),
                        ("resto", (d["mv_l1"] <= q90).to_numpy())):
        if mask.sum() < K.MIN_CELL_N:
            continue
        out[f"delta_{label}"] = {
            "n": int(mask.sum()),
            "ll_open": float(K.per_sample_log_loss(y[mask], p_o[mask]).mean()),
            "ll_close": float(K.per_sample_log_loss(y[mask], p_c[mask]).mean()),
            "delta": float(K.per_sample_log_loss(y[mask], p_o[mask]).mean()
                           - K.per_sample_log_loss(y[mask], p_c[mask]).mean()),
        }
    out["threshold_l1_p90"] = q90
    return out


def main() -> None:
    K.ART.mkdir(parents=True, exist_ok=True)
    df = K.dev_val(K.load_market())
    d = movement_frame(df)
    d = d[d["season_start"] >= 2012].reset_index(drop=True)

    report = {
        "experiment": "EXP13",
        "title": "Movimiento de cuotas apertura→cierre (escenario closing-line)",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": K.SEED,
        "market": {"source": SRC, "method": METHOD},
        "n": int(len(d)),
        "n_by_partition": d["partition"].value_counts().to_dict(),
        "caveat": ("SIN TIMESTAMPS: la apertura se supone pre-partido y el cierre es la última "
                   "cuota previa al inicio. El movimiento se evalúa solo como escenario de línea "
                   "de cierre; NO permite simular una predicción hecha con antelación. Ninguna "
                   "cifra es un backtest operable."),
        "magnitude": magnitude_block(d),
        "direction": direction_block(d),
        "info_beyond_close": info_beyond_close(d),
        "open_vs_close": open_vs_close(d),
    }
    K.write_json(report, K.ART / "exp13_movement.json")
    K.write_csv(pd.DataFrame(report["magnitude"]["by_season"]), K.ART / "exp13_magnitude_by_season.csv")
    K.write_csv(pd.DataFrame(report["direction"]["quintiles_move_h"]),
                K.ART / "exp13_direction_quintiles.csv")

    # ------------- tablas ----------------
    mag = report["magnitude"]
    rows = [{"métrica": "L1 medio", "valor": mag["l1"]["mean"]},
            {"métrica": "L1 mediano", "valor": mag["l1"]["median"]},
            {"métrica": "L1 p90", "valor": mag["l1"]["p90"]},
            {"métrica": "L1 p99", "valor": mag["l1"]["p99"]},
            {"métrica": "|Δlog p| medio (local)", "valor": mag["by_outcome"]["h"]["mean_abs"]},
            {"métrica": "|Δlog p| medio (empate)", "valor": mag["by_outcome"]["d"]["mean_abs"]},
            {"métrica": "|Δlog p| medio (visitante)", "valor": mag["by_outcome"]["a"]["mean_abs"]}]
    t1 = K.md_table(pd.DataFrame(rows), digits=4)

    rows = [{"season": r["season"], "n": r["n"], "l1_medio": r["l1_mean"], "l1_p90": r["l1_p90"],
             "abs_mv_h": r["abs_mv_h"]} for r in mag["by_season"]]
    t2 = K.md_table(pd.DataFrame(rows), digits=4)

    dirn = report["direction"]
    rows = [{"quintil": r["quintile"], "n": r["n"], "rango_mv_h": r["mv_h_range"],
             "mv_h_medio": r["mv_h_mean"], "p_close_h": r["p_close_h_mean"],
             "gana_H": r["home_win_rate"], "empate": r["draw_rate"], "gana_A": r["away_win_rate"]}
            for r in dirn["quintiles_move_h"]]
    t3 = K.md_table(pd.DataFrame(rows), digits=4)

    ibl = report["info_beyond_close"]
    rows = []
    for key, res in ibl["models"].items():
        if key == "devig_close_raw":
            rows.append({"modelo": key, "features": 0, "ll_val": res["val"]["log_loss"],
                         "brier_val": res["val"]["brier"], "rps_val": res["val"]["rps"]})
        else:
            rows.append({"modelo": key, "features": res["n_features"],
                         "ll_val": res["val"]["log_loss"], "brier_val": res["val"]["brier"],
                         "rps_val": res["val"]["rps"]})
    t4 = K.md_table(pd.DataFrame(rows), digits=5)

    rows = [{"métrica": m, "delta": ibl["delta_val"][m]["delta"],
             "lo": ibl["delta_val"][m]["ci95"][0], "hi": ibl["delta_val"][m]["ci95"][1]}
            for m in ("logloss", "brier", "rps")]
    t5 = K.md_table(pd.DataFrame(rows), digits=5)

    ovc = report["open_vs_close"]
    t6 = K.md_table(pd.DataFrame([
        {"medida": "log-loss", "apertura": ovc["ll_open"], "cierre": ovc["ll_close"]},
        {"medida": "Brier", "apertura": ovc["brier_open"], "cierre": ovc["brier_close"]},
        {"medida": "RPS", "apertura": ovc["rps_open"], "cierre": ovc["rps_close"]}]), digits=4)

    tables = ["### Magnitud del movimiento (dev+val, n=%d)\n\n" % len(d) + t1,
              "### Movimiento por temporada\n\n" + t2,
              "### Resultado observado por quintil de movimiento del local\n\n" + t3,
              "### Apertura vs cierre en los mismos partidos\n\n" + t6,
              "### ¿Aporta el movimiento más allá del cierre?\n\n" + t4 +
              "\n\nΔ (cierre+movimiento − cierre) en val; >0 ⇒ el movimiento empeora.\n\n" + t5]
    (K.ART / "exp13_tables.md").write_text("\n\n".join(tables) + "\n", encoding="utf-8")
    print("\n\n".join(tables))
    print("\nescrito -> artifacts/exp13_*")


if __name__ == "__main__":
    main()
