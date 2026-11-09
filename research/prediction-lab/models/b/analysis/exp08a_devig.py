#!/usr/bin/env python3
"""EXP08a — Comparación de métodos de de-vig (proporcional, power, Shin).

Pregunta
--------
¿Qué método de eliminación del margen produce las probabilidades 1X2 más
útiles para predecir el resultado? Se mide contra el resultado real (log-loss,
Brier, RPS) y se comprueba la calibración, por temporada y por división.

Poblaciones (todas en dev+val; **nunca** test)
----------------------------------------------
* ``close_ps``   cierre Pinnacle  (2012/13–2023/24) — referencia del brief.
* ``close_b365`` cierre Bet365    (2019/20–2023/24) — muestra menor, margen 2×.
* ``open_b365``  apertura Bet365  (2002/03–2023/24) — robustez con n grande.
* ``open_ps``    apertura Pinnacle(2012/13–2023/24) — robustez.

El de-vig es una transformación **fila a fila** sin parámetros estimados entre
partidos (alpha/z se resuelven dentro de cada partido), así que evaluarlo en
``dev`` no filtra información del objetivo: es selección de hiperparámetro
legítima. ``val`` (2023/24) se reporta aparte como confirmación no usada en la
elección.

Salidas (en ``models/b/analysis/artifacts/``)
---------------------------------------------
``exp08a_devig.json``, ``exp08a_by_season.csv``, ``exp08a_by_division.csv``,
``exp08a_bootstrap.csv``, ``exp08a_reliability.csv``, ``exp08a_margin.csv``,
``exp08a_tables.md``.

Uso::

    ./.venv/bin/python models/b/analysis/exp08a_devig.py
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import market_common as K  # noqa: E402

POPULATIONS = [
    {"key": "close_ps", "phase": "close", "src": "ps", "label": "Cierre Pinnacle",
     "role": "principal", "from_season": 2012},
    {"key": "close_b365", "phase": "close", "src": "b365", "label": "Cierre Bet365",
     "role": "principal", "from_season": 2019},
    {"key": "open_b365", "phase": "open", "src": "b365", "label": "Apertura Bet365",
     "role": "robustez", "from_season": 2002},
    {"key": "open_ps", "phase": "open", "src": "ps", "label": "Apertura Pinnacle",
     "role": "robustez", "from_season": 2012},
]

PAIRS = [("proportional", "power"), ("proportional", "shin"), ("power", "shin")]


def population_frame(df: pd.DataFrame, pop: dict) -> pd.DataFrame:
    mask = K.available(df, pop["phase"], pop["src"])
    out = df[mask].copy()
    out = out[out["season_start"] >= pop["from_season"]]
    return out.reset_index(drop=True)


def metrics_by_method(d: pd.DataFrame, pop: dict, part: str | None) -> dict:
    sub = d if part is None else d[d["partition"] == part]
    out = {}
    for method in K.METHODS:
        p = K.probs(sub, pop["phase"], pop["src"], method)
        out[method] = K.metrics_bundle(sub["y"].to_numpy(), p)
        out[method].update(K.brier_components(sub["y"].to_numpy(), p))
    return out


def season_table(d: pd.DataFrame, pop: dict) -> pd.DataFrame:
    rows = []
    for season, g in d.groupby("season", sort=False):
        if len(g) < K.MIN_CELL_N:
            continue
        rec = {"season": season, "season_start": int(g["season_start"].iloc[0]), "n": len(g),
               "margin": float(g[f"mkt_{pop['phase']}_{pop['src']}_margin"].mean())}
        for method in K.METHODS:
            m = K.metrics_bundle(g["y"].to_numpy(), K.probs(g, pop["phase"], pop["src"], method))
            rec[f"ll_{method}"] = m["log_loss"]
            rec[f"brier_{method}"] = m["brier"]
            rec[f"rps_{method}"] = m["rps"]
        best = min(K.METHODS, key=lambda x: rec[f"ll_{x}"])
        rec["best_ll"] = best
        rows.append(rec)
    out = pd.DataFrame(rows).sort_values(["season_start", "season"]).reset_index(drop=True)
    return out


def division_table(d: pd.DataFrame, pop: dict) -> pd.DataFrame:
    rows = []
    for div, g in d.groupby("div", sort=True):
        if len(g) < K.MIN_CELL_N:
            continue
        rec = {"div": div, "n": len(g),
               "margin": float(g[f"mkt_{pop['phase']}_{pop['src']}_margin"].mean()),
               "n_seasons": int(g["season"].nunique())}
        for method in K.METHODS:
            m = K.metrics_bundle(g["y"].to_numpy(), K.probs(g, pop["phase"], pop["src"], method))
            rec[f"ll_{method}"] = m["log_loss"]
            rec[f"brier_{method}"] = m["brier"]
            rec[f"rps_{method}"] = m["rps"]
            rec[f"ece_{method}"] = m["ece10"]
        rec["best_ll"] = min(K.METHODS, key=lambda x: rec[f"ll_{x}"])
        rows.append(rec)
    return pd.DataFrame(rows).sort_values("n", ascending=False).reset_index(drop=True)


def winner_counts(table: pd.DataFrame, key: str) -> dict:
    """Cuenta qué método gana (menor log-loss) en cada fila de ``table``.

    Se usa a nivel de **división** y de **temporada**, no de temporada×división:
    una celda temporada×división de una liga de 20 equipos tiene ~380 partidos,
    por debajo de :data:`market_common.MIN_CELL_N`; esas celdas no sostienen
    ninguna conclusión y solo se guardan como detalle.
    """
    if table.empty:
        return {"n_cells": 0}
    counts = table["best_ll"].value_counts().to_dict()
    return {
        "n_cells": int(len(table)),
        "n_matches": int(table["n"].sum()),
        "wins": {m: int(counts.get(m, 0)) for m in K.METHODS},
        "wins_share": {m: float(counts.get(m, 0) / len(table)) for m in K.METHODS},
    }


def season_div_detail(d: pd.DataFrame, pop: dict) -> pd.DataFrame:
    """Detalle temporada×división (solo celdas n>=MIN_CELL_N; casi todas son ligas
    de año natural). Sirve para inspección, no para el veredicto."""
    rows = []
    for (season, div), g in d.groupby(["season", "div"], sort=False):
        if len(g) < K.MIN_CELL_N:
            continue
        lls = {m: float(np.mean(K.per_sample_log_loss(
            g["y"].to_numpy(), K.probs(g, pop["phase"], pop["src"], m)))) for m in K.METHODS}
        rows.append({"season": season, "div": div, "n": len(g),
                     "best": min(lls, key=lls.get), **lls})
    return pd.DataFrame(rows)


def bootstrap_pairs(d: pd.DataFrame, pop: dict) -> list:
    rows = []
    blocks = K.blocks_season_div(d)
    for part in ("dev", "val", "all"):
        sub = d if part == "all" else d[d["partition"] == part]
        if len(sub) < 200:
            continue
        b = K.blocks_season_div(sub)
        for a, bmet in PAIRS:
            pa = K.probs(sub, pop["phase"], pop["src"], a)
            pb = K.probs(sub, pop["phase"], pop["src"], bmet)
            for metric in ("logloss", "brier", "rps"):
                res = K.block_bootstrap_delta(sub["y"].to_numpy(), pa, pb, b, metric=metric)
                rows.append({"population": pop["key"], "partition": part, "pair": f"{a}_vs_{bmet}",
                             "metric": metric, "n": res["n"], "n_blocks": res["n_blocks"],
                             "delta": res["delta"], "ci_lo": res["ci95"][0], "ci_hi": res["ci95"][1],
                             "frac_gt0": res["frac_gt0"],
                             "significant": bool(res["ci95"][0] > 0 or res["ci95"][1] < 0)})
    return rows


def reliability_frame(d: pd.DataFrame, pop: dict) -> pd.DataFrame:
    rows = []
    for method in K.METHODS:
        p = K.probs(d, pop["phase"], pop["src"], method)
        table = K.reliability_table(d["y"].to_numpy(), p)
        for rec in table:
            rows.append({"population": pop["key"], "method": method, **rec})
    return pd.DataFrame(rows)


def margin_strata(d: pd.DataFrame, pop: dict) -> pd.DataFrame:
    """ΔLL(power − proporcional) por cuartil de margen de la casa.

    Si la ventaja de power es real (corrige el sesgo favorito-longshot) debe
    crecer con el overround; si es ruido, no habrá gradiente.
    """
    margin = d[f"mkt_{pop['phase']}_{pop['src']}_margin"].to_numpy()
    edges = np.unique(np.quantile(margin, [0, 0.25, 0.5, 0.75, 1.0]))
    lab = np.digitize(margin, edges[1:-1], right=True)
    rows = []
    y = d["y"].to_numpy()
    p_prop = K.probs(d, pop["phase"], pop["src"], "proportional")
    p_pow = K.probs(d, pop["phase"], pop["src"], "power")
    p_shin = K.probs(d, pop["phase"], pop["src"], "shin")
    ll_prop = K.per_sample_log_loss(y, p_prop)
    ll_pow = K.per_sample_log_loss(y, p_pow)
    ll_shin = K.per_sample_log_loss(y, p_shin)
    for q in range(len(edges) - 1):
        mask = lab == q
        if mask.sum() < K.MIN_CELL_N:
            continue
        rows.append({
            "stratum": f"Q{q + 1}",
            "margin_range": f"{edges[q]:.2%}–{edges[q + 1]:.2%}",
            "n": int(mask.sum()),
            "margin_mean": float(margin[mask].mean()),
            "delta_power": float((ll_pow[mask] - ll_prop[mask]).mean()),
            "delta_shin": float((ll_shin[mask] - ll_prop[mask]).mean()),
        })
    return pd.DataFrame(rows)


def main() -> None:
    K.ART.mkdir(parents=True, exist_ok=True)
    df = K.dev_val(K.load_market())
    report: dict = {
        "experiment": "EXP08a",
        "title": "Comparación de métodos de de-vig (proporcional / power / Shin)",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": K.SEED,
        "min_cell_n": K.MIN_CELL_N,
        "partitions": "dev <= 2022/23 · val 2023/24 · test NUNCA usado",
        "note": ("El de-vig es una transformación fila a fila sin parámetros entre partidos; "
                 "evaluar en dev es selección de hiperparámetro legítima. val confirma."),
        "populations": {},
    }

    season_frames, division_frames, boot_rows, rel_frames, margin_frames = [], [], [], [], []
    tables = []

    for pop in POPULATIONS:
        d = population_frame(df, pop)
        stats = {
            "label": pop["label"], "phase": pop["phase"], "src": pop["src"], "role": pop["role"],
            "n_total": int(len(d)),
            "n_by_partition": d["partition"].value_counts().to_dict(),
            "n_seasons": int(d["season"].nunique()),
            "season_range": [d["season"].iloc[d["season_start"].argmin()] if len(d) else None,
                             d["season"].iloc[d["season_start"].argmax()] if len(d) else None],
            "mean_margin": float(d[f"mkt_{pop['phase']}_{pop['src']}_margin"].mean()),
            "metrics": {},
            "calibration_slope": {},
        }
        for part in (None, "dev", "val"):
            key = part or "all"
            stats["metrics"][key] = metrics_by_method(d, pop, part)
        for method in K.METHODS:
            stats["calibration_slope"][method] = K.calibration_slope(
                d["y"].to_numpy(), K.probs(d, pop["phase"], pop["src"], method))

        st = season_table(d, pop)
        if not st.empty:
            st.insert(0, "population", pop["key"])
            season_frames.append(st)
        dv = division_table(d, pop)
        if not dv.empty:
            dv.insert(0, "population", pop["key"])
            division_frames.append(dv)
        boot_rows.extend(bootstrap_pairs(d, pop))
        rel = reliability_frame(d, pop)
        rel_frames.append(rel)
        mr = margin_strata(d, pop)
        if not mr.empty:
            mr.insert(0, "population", pop["key"])
            margin_frames.append(mr)
        stats["winners_by_division"] = winner_counts(dv, "div")
        stats["winners_by_season"] = winner_counts(st, "season")
        detail = season_div_detail(d, pop)
        if not detail.empty:
            detail.to_csv(K.ART / f"exp08a_detail_cells_{pop['key']}.csv", index=False)
            stats["detail_cells"] = {"n_cells_season_x_div": int(len(detail)),
                                     "note": "celdas temporada×división; solo pasan n>=500 "
                                             "las ligas de año natural, no sostienen el veredicto"}
        # test de signos por temporada (power y shin vs proporcional, log-loss)
        if not st.empty:
            for a, b in (("power", "proportional"), ("shin", "proportional")):
                wins = int((st[f"ll_{a}"] < st[f"ll_{b}"]).sum())
                stats.setdefault("season_sign_test", {})[f"{a}_vs_{b}"] = {
                    "seasons": int(len(st)), "wins": wins, "p_value": K.sign_test(wins, len(st))}
            for a, b in (("power", "proportional"), ("shin", "proportional")):
                wins = int((dv[f"ll_{a}"] < dv[f"ll_{b}"]).sum())
                stats.setdefault("division_sign_test", {})[f"{a}_vs_{b}"] = {
                    "divisions": int(len(dv)), "wins": wins,
                    "p_value": K.sign_test(wins, len(dv))}
        report["populations"][pop["key"]] = stats

        # ---------------- tablas markdown ----------------
        m = stats["metrics"]
        rows = []
        for method in K.METHODS:
            row = {"method": method}
            for key in ("dev", "val", "all"):
                row[f"ll_{key}"] = m[key][method]["log_loss"]
                row[f"rps_{key}"] = m[key][method]["rps"]
            row["brier_all"] = m["all"][method]["brier"]
            row["ece10_all"] = m["all"][method]["ece10"]
            row["n_all"] = m["all"][method]["n"]
            rows.append(row)
        tables.append(f"### {pop['label']} — métricas globales (n={len(d):,})\n\n" +
                      K.md_table(pd.DataFrame(rows), digits=4))
        if not st.empty:
            show = st[["season", "n", "ll_proportional", "ll_power", "ll_shin", "best_ll"]].copy()
            tables.append(f"### {pop['label']} — log-loss por temporada (celdas n≥{K.MIN_CELL_N})\n\n" +
                          K.md_table(show, digits=4))
        if not dv.empty:
            show = dv[["div", "n", "ll_proportional", "ll_power", "ll_shin", "best_ll"]].copy()
            tables.append(f"### {pop['label']} — log-loss por división (dev+val, celdas n≥{K.MIN_CELL_N})\n\n" +
                          K.md_table(show, digits=4))

    # ---- consolidados ----
    boot = pd.DataFrame(boot_rows)
    K.write_csv(boot, K.ART / "exp08a_bootstrap.csv")
    seasons = pd.concat(season_frames, ignore_index=True) if season_frames else pd.DataFrame()
    divisions = pd.concat(division_frames, ignore_index=True) if division_frames else pd.DataFrame()
    rel = pd.concat(rel_frames, ignore_index=True) if rel_frames else pd.DataFrame()
    margins = pd.concat(margin_frames, ignore_index=True) if margin_frames else pd.DataFrame()
    K.write_csv(seasons, K.ART / "exp08a_by_season.csv")
    K.write_csv(divisions, K.ART / "exp08a_by_division.csv")
    K.write_csv(rel, K.ART / "exp08a_reliability.csv")
    K.write_csv(margins, K.ART / "exp08a_margin.csv")

    # ---- veredicto ----
    verdict = {}
    for pop in POPULATIONS:
        key = pop["key"]
        b = boot[(boot["population"] == key) & (boot["partition"] == "all")
                 & (boot["metric"] == "logloss")]
        wins = {row["pair"]: {"delta": row["delta"], "ci": [row["ci_lo"], row["ci_hi"]],
                              "significant": row["significant"]}
                for _, row in b.iterrows()}
        # método con menor log-loss pooled
        lls = {m: report["populations"][key]["metrics"]["all"][m]["log_loss"] for m in K.METHODS}
        best = min(lls, key=lls.get)
        verdict[key] = {"best_all_logloss": best, "logloss": lls,
                        "delta_pairs": wins,
                        "winners_by_division": report["populations"][key]["winners_by_division"],
                        "winners_by_season": report["populations"][key]["winners_by_season"],
                        "season_sign_test": report["populations"][key].get("season_sign_test"),
                        "division_sign_test": report["populations"][key].get("division_sign_test")}
    report["verdict"] = verdict
    report["md_tables"] = "\n\n".join(tables)
    K.write_json({k: v for k, v in report.items() if k != "md_tables"}, K.ART / "exp08a_devig.json")
    (K.ART / "exp08a_tables.md").write_text(report["md_tables"] + "\n", encoding="utf-8")

    print("\n\n".join(tables))
    print("\n=== BOOTSTRAP (log-loss, dev+val, pareado por bloques temporada×división) ===")
    show = boot[(boot["metric"] == "logloss") & (boot["partition"] == "all")]
    print(K.md_table(show[["population", "pair", "n", "n_blocks", "delta", "ci_lo", "ci_hi", "frac_gt0"]],
                     digits=5))
    print("\n=== VEREDICTO ===")
    print(K.jsonify(verdict))
    print("\nescrito -> artifacts/exp08a_*.{json,csv,md}")


if __name__ == "__main__":
    main()
