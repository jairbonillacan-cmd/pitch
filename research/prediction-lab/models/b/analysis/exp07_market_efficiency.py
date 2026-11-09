#!/usr/bin/env python3
"""EXP07 — Eficiencia del mercado y sesgos (y comparación con el Motor A).

Bloques
-------
1. **Curva de calibración** del mercado (probabilidad implícita vs frecuencia
   observada) con IC de Wilson, por partición, y pendiente de calibración.
2. **Sesgo favorito-longshot**: bandas de probabilidad y bandas de favoritismo
   del partido (favorito claro / igualado / muy abierto).
3. **Eficiencia por división y temporada** (log-loss, Brier, RPS) con la
   ganancia frente a una tasa base fija estimada en ``dev`` (referencia común).
4. **Mercado vs Motor A** en los mismos partidos (``pred_logit``/``pred_hgb``),
   con bootstrap por bloques en cada subconjunto, tasa de victoria por partido
   y mezclas mercado+modelo.

Población: cierre Pinnacle con de-vig *power* (mejor método en EXP08a), solo
``dev``+``val``. Test nunca se toca. El cierre es un **escenario de línea de
cierre** (no operable con antelación, ver CONTRACT_DATASET.md §3.4).

Uso::

    ./.venv/bin/python models/b/analysis/exp07_market_efficiency.py
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
import market_common as K  # noqa: E402

PHASE, SRC, METHOD = "close", "ps", "power"
FAV_ORDER = list(K.FAV_LABELS)


# ---------------------------------------------------------------------------
# 1-2. Calibración y sesgo favorito-longshot
# ---------------------------------------------------------------------------
def calibration_block(d: pd.DataFrame) -> dict:
    y = d["y"].to_numpy()
    p = K.probs(d, PHASE, SRC, METHOD)
    out = {"method": METHOD, "source": SRC, "phase": PHASE, "reliability": {}, "ece10": {},
           "slope": {}}
    for part in ("all", "dev", "val"):
        sub = d if part == "all" else d[d["partition"] == part]
        ys = sub["y"].to_numpy()
        ps = K.probs(sub, PHASE, SRC, METHOD)
        out["reliability"][part] = K.reliability_table(ys, ps)
        out["ece10"][part] = float(K.M.ece(ys, ps, 10))
        out["slope"][part] = K.calibration_slope(ys, ps)
    # deciles (misma anchura) para la curva completa
    out["reliability_deciles"] = K.reliability_table(
        y, p, edges=np.round(np.linspace(0, 1, 11), 10),
        labels=[f"{i/10:.1f}-{(i+1)/10:.1f}" for i in range(10)])
    return out


def fav_band_block(d: pd.DataFrame) -> pd.DataFrame:
    """Por banda de favoritismo: implícito vs observado de cada resultado."""
    y = d["y"].to_numpy()
    p = K.probs(d, PHASE, SRC, METHOD)
    bands = K.fav_band(p)
    rows = []
    for band in FAV_ORDER:
        mask = bands == band
        n = int(mask.sum())
        if n == 0:
            continue
        for k, name in enumerate(K.OUTCOMES):
            imp = float(p[mask, k].mean())
            hit = int((y[mask] == k).sum())
            lo, hi = K.wilson_ci(hit, n)
            rows.append({"fav_band": band, "outcome": name, "n": n, "implied": imp,
                         "observed": hit / n, "gap": hit / n - imp, "ci95_lo": lo, "ci95_hi": hi})
        # el favorito (argmax) acierta?
        fav_idx = p[mask].argmax(axis=1)
        hit = int((y[mask] == fav_idx).sum())
        lo, hi = K.wilson_ci(hit, n)
        rows.append({"fav_band": band, "outcome": "argmax", "n": n,
                     "implied": float(p[mask].max(axis=1).mean()),
                     "observed": hit / n, "gap": hit / n - float(p[mask].max(axis=1).mean()),
                     "ci95_lo": lo, "ci95_hi": hi})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 3. Eficiencia por división / temporada
# ---------------------------------------------------------------------------
def base_rates(df_all: pd.DataFrame) -> np.ndarray:
    """Tasas base H/D/A estimadas **solo en dev** (constante de referencia)."""
    dev = df_all[df_all["partition"] == "dev"]
    counts = np.bincount(dev["y"].to_numpy().astype(int), minlength=3).astype(float)
    return counts / counts.sum()


def efficiency_table(d: pd.DataFrame, key: str, p_base: np.ndarray) -> pd.DataFrame:
    y = d["y"].to_numpy()
    p = K.probs(d, PHASE, SRC, METHOD)
    ll = K.per_sample_log_loss(y, p)
    br = K.per_sample_brier(y, p)
    rp = K.per_sample_rps(y, p)
    ll_base = K.per_sample_log_loss(y, np.tile(p_base, (len(y), 1)))
    # d tiene índice 0..n-1 (reset_index en main): índice == posición
    rows = []
    for value, g in d.groupby(key, sort=True):
        if len(g) < K.MIN_CELL_N:
            continue
        pos = g.index.to_numpy()
        rows.append({"value": value, "n": int(len(g)),
                     "log_loss": float(ll[pos].mean()),
                     "brier": float(br[pos].mean()),
                     "rps": float(rp[pos].mean()),
                     "ll_base": float(ll_base[pos].mean()),
                     "market_gain": float((ll_base - ll)[pos].mean()),
                     "draw_rate": float((g["y"] == 1).mean()),
                     "home_rate": float((g["y"] == 0).mean())})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 4. Mercado vs Motor A
# ---------------------------------------------------------------------------
def load_motor_a(name: str) -> pd.DataFrame:
    pred = pd.read_csv(K.ARTIFACTS_EXP01 / f"pred_{name}.csv",
                       usecols=["match_id", "div", "season", "y", "p_home", "p_draw", "p_away"])
    pred["season_start"] = pred["season"].map(K.season_year).astype(int)
    pred = pred[pred["season_start"] <= K.VAL_SEASON].copy()  # nunca test/live
    pred["partition"] = pred["season_start"].map(K.partition_for_year)
    assert set(pred["partition"].unique()) <= {"dev", "val"}
    return pred.rename(columns={"p_home": "m_h", "p_draw": "m_d", "p_away": "m_a"})


def compare_to_motor_a(d: pd.DataFrame, name: str, p_base: np.ndarray) -> dict:
    pred = load_motor_a(name)
    dfm = d[["match_id", "div", "season", "season_start", "partition", "y"]].copy()
    dfm["p_h"] = K.probs(d, PHASE, SRC, METHOD)[:, 0]
    dfm["p_d"] = K.probs(d, PHASE, SRC, METHOD)[:, 1]
    dfm["p_a"] = K.probs(d, PHASE, SRC, METHOD)[:, 2]
    merged = dfm.merge(pred, on="match_id", how="inner", suffixes=("", "_pred"))
    if merged.empty:
        return {"model": name, "n": 0}
    # coherencia de etiquetas entre artefacto y datos canónicos
    assert (merged["y"] == merged["y_pred"]).all(), "y inconsistente entre artefacto y features"
    assert (merged["div"] == merged["div_pred"]).all()

    p_mar = merged[["p_h", "p_d", "p_a"]].to_numpy()
    p_mod = merged[["m_h", "m_d", "m_a"]].to_numpy()
    y = merged["y"].to_numpy()

    def subset_stats(sub: pd.DataFrame) -> dict:
        if len(sub) < 2:
            return {"n": 0}
        yy = sub["y"].to_numpy()
        pm = sub[["p_h", "p_d", "p_a"]].to_numpy()
        pd_ = sub[["m_h", "m_d", "m_a"]].to_numpy()
        blocks = K.blocks_season_div(sub)
        out = {"n": int(len(sub)),
               "market": {k: v for k, v in K.metrics_bundle(yy, pm).items()},
               "motor_a": {k: v for k, v in K.metrics_bundle(yy, pd_).items()}}
        for metric in ("logloss", "brier", "rps"):
            res = K.block_bootstrap_delta(yy, pd_, pm, blocks, metric=metric, B=1000)
            out[f"delta_{metric}"] = {"delta": res["delta"], "ci95": res["ci95"],
                                      "n_blocks": res["n_blocks"],
                                      "beats": bool(res["ci95"][1] < 0)}
        # victoria por partido (log-loss menor)
        ll_m = K.per_sample_log_loss(yy, pm)
        ll_a = K.per_sample_log_loss(yy, pd_)
        out["win_rate_motor_a"] = float(np.mean(ll_a < ll_m))
        out["ties"] = float(np.mean(np.isclose(ll_a, ll_m)))
        out["mean_ll_gap_when_win"] = float(np.mean((ll_m - ll_a)[ll_a < ll_m])) if (ll_a < ll_m).any() else 0.0
        out["mean_ll_gap_when_loss"] = float(np.mean((ll_m - ll_a)[ll_a > ll_m])) if (ll_a > ll_m).any() else 0.0
        return out

    result = {
        "model": name,
        "n_total_market": int(len(dfm)),
        "n_predictions_model": int(len(pred)),
        "n_joined": int(len(merged)),
        "coverage_of_market": float(len(merged) / len(dfm)),
        "overall": subset_stats(merged),
        "by_partition": {part: subset_stats(merged[merged["partition"] == part])
                         for part in ("dev", "val")},
        "by_division": [], "by_fav_band": [], "by_season": [],
    }
    pmax = p_mar.max(axis=1)
    merged["fav_band"] = K.fav_band(p_mar)
    for band in FAV_ORDER:
        sub = merged[merged["fav_band"] == band]
        st = subset_stats(sub)
        if st["n"] >= K.MIN_CELL_N:
            result["by_fav_band"].append({"fav_band": band, **st})
    for div, sub in merged.groupby("div"):
        if len(sub) >= K.MIN_CELL_N:
            result["by_division"].append({"div": div, **subset_stats(sub)})
    for season, sub in merged.groupby("season"):
        if len(sub) >= K.MIN_CELL_N:
            result["by_season"].append({"season": season, **subset_stats(sub)})

    # ---- mezclas mercado + Motor A (peso w sobre el mercado), ajuste en dev ----
    grid = np.round(np.arange(0.0, 1.0001, 0.05), 2)
    dev = merged[merged["partition"] == "dev"]
    val = merged[merged["partition"] == "val"]
    blend = {"grid": [], "best_w_dev": None, "best_w_val": None}
    if len(dev) and len(val):
        for w in grid:
            p_b_dev = w * dev[["p_h", "p_d", "p_a"]].to_numpy() + (1 - w) * dev[["m_h", "m_d", "m_a"]].to_numpy()
            p_b_val = w * val[["p_h", "p_d", "p_a"]].to_numpy() + (1 - w) * val[["m_h", "m_d", "m_a"]].to_numpy()
            blend["grid"].append({"w_market": float(w),
                                  "ll_dev": float(K.per_sample_log_loss(dev["y"].to_numpy(), p_b_dev).mean()),
                                  "ll_val": float(K.per_sample_log_loss(val["y"].to_numpy(), p_b_val).mean())})
        g = pd.DataFrame(blend["grid"])
        blend["best_w_dev"] = float(g.loc[g["ll_dev"].idxmin(), "w_market"])
        blend["best_w_val"] = float(g.loc[g["ll_val"].idxmin(), "w_market"])
        w = blend["best_w_dev"]
        p_b_val = w * val[["p_h", "p_d", "p_a"]].to_numpy() + (1 - w) * val[["m_h", "m_d", "m_a"]].to_numpy()
        res = K.block_bootstrap_delta(val["y"].to_numpy(), p_b_val,
                                      val[["p_h", "p_d", "p_a"]].to_numpy(),
                                      K.blocks_season_div(val), metric="logloss", B=1000)
        blend["val_vs_market_at_best_w"] = {"w": w, "delta": res["delta"], "ci95": res["ci95"],
                                            "ll_val": float(K.per_sample_log_loss(
                                                val["y"].to_numpy(), p_b_val).mean())}
    result["blend"] = blend
    result["base_rate_reference"] = {"p_base": p_base.tolist()}
    return result


# ---------------------------------------------------------------------------
def main() -> None:
    K.ART.mkdir(parents=True, exist_ok=True)
    df = K.dev_val(K.load_market())
    mask = K.available(df, PHASE, SRC, METHOD) & (df["season_start"] >= 2012)
    d = df[mask].reset_index(drop=True)
    p_base = base_rates(df)

    report: dict = {
        "experiment": "EXP07",
        "title": "Eficiencia del mercado, sesgos y comparación con el Motor A",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": K.SEED,
        "market": {"phase": PHASE, "source": SRC, "method": METHOD},
        "n_market_matches": int(len(d)),
        "n_by_partition": d["partition"].value_counts().to_dict(),
        "scenario": "closing_line (benchmark; no operable con antelación: sin timestamps)",
        "min_cell_n": K.MIN_CELL_N,
        "base_rate_p": p_base.tolist(),
        "base_rate_log_loss": float(K.per_sample_log_loss(
            d["y"].to_numpy(), np.tile(p_base, (len(d), 1))).mean()),
    }

    # 1-2 calibración
    report["calibration"] = calibration_block(d)
    fav = fav_band_block(d)
    K.write_csv(fav, K.ART / "exp07_fav_bands.csv")
    report["fav_bands"] = fav.to_dict(orient="records")

    # 3 eficiencia
    eff_div = efficiency_table(d, "div", p_base)
    eff_sea = efficiency_table(d, "season", p_base)
    K.write_csv(eff_div, K.ART / "exp07_efficiency_division.csv")
    K.write_csv(eff_sea, K.ART / "exp07_efficiency_season.csv")
    report["efficiency_division"] = eff_div.to_dict(orient="records")
    report["efficiency_season"] = eff_sea.to_dict(orient="records")

    # 4 vs Motor A
    report["vs_motor_a"] = {name: compare_to_motor_a(d, name, p_base) for name in ("logit", "hgb")}
    K.write_json(report, K.ART / "exp07_market_efficiency.json")

    # comparativa de mercado en la intersección (misma población que Motor A)
    logit = report["vs_motor_a"]["logit"]
    hgb = report["vs_motor_a"]["hgb"]

    # ---------------- tablas markdown ----------------
    tables = []
    rel = pd.DataFrame(report["calibration"]["reliability"]["all"])
    rel["solo_n"] = ""
    tables.append("### Curva de calibración del mercado (cierre Pinnacle, power; dev+val)\n\n"
                  "Cada partido aporta 3 observaciones (H/D/A); n en observaciones.\n\n" +
                  K.md_table(rel[["band", "n", "implied", "observed", "gap"]], digits=4))

    rows = []
    for band in FAV_ORDER:
        sub = fav[fav.fav_band == band]
        rec = {"fav_band": band, "n": int(sub["n"].iloc[0])}
        for _, r in sub.iterrows():
            if r["outcome"] == "argmax":
                rec["pmax_imp"] = r["implied"]; rec["pmax_obs"] = r["observed"]
                rec["pmax_gap"] = r["gap"]
            else:
                rec[f"imp_{r['outcome']}"] = r["implied"]
                rec[f"obs_{r['outcome']}"] = r["observed"]
                rec[f"gap_{r['outcome']}"] = r["gap"]
        rows.append(rec)
    tables.append("### Implícito vs observado por banda de favoritismo\n\n" +
                  K.md_table(pd.DataFrame(rows), digits=4))

    show = eff_div.sort_values("log_loss")[["value", "n", "log_loss", "brier", "rps", "ll_base",
                                            "market_gain", "draw_rate"]]
    show.columns = ["div", "n", "log_loss", "brier", "rps", "ll_base", "ganancia", "pct_empate"]
    tables.append("### Eficiencia por división (dev+val, n≥500)\n\n" + K.md_table(show, digits=4))

    show = eff_sea.sort_values("log_loss")[["value", "n", "log_loss", "brier", "rps", "market_gain"]]
    show.columns = ["season", "n", "log_loss", "brier", "rps", "ganancia"]
    tables.append("### Eficiencia por temporada (n≥500)\n\n" + K.md_table(show, digits=4))

    cmp_rows = []
    for name, res in (("logit", logit), ("hgb", hgb)):
        for part in ("dev", "val"):
            st = res["by_partition"][part]
            if st.get("n", 0) < K.MIN_CELL_N:
                continue
            cmp_rows.append({
                "model": name, "partition": part, "n": st["n"],
                "ll_market": st["market"]["log_loss"], "ll_motor": st["motor_a"]["log_loss"],
                "d_ll": st["delta_logloss"]["delta"],
                "d_ll_lo": st["delta_logloss"]["ci95"][0], "d_ll_hi": st["delta_logloss"]["ci95"][1],
                "d_brier": st["delta_brier"]["delta"],
                "d_rps": st["delta_rps"]["delta"],
                "win_rate": st["win_rate_motor_a"]})
    tables.append("### Motor A vs mercado en los mismos partidos (Δ = Motor A − mercado; <0 ⇒ Motor A mejor)\n\n" +
                  K.md_table(pd.DataFrame(cmp_rows), digits=4))

    rows = []
    for name, res in (("logit", logit), ("hgb", hgb)):
        for rec in res["by_fav_band"]:
            rows.append({"model": name, "fav_band": rec["fav_band"], "n": rec["n"],
                         "ll_market": rec["market"]["log_loss"], "ll_motor": rec["motor_a"]["log_loss"],
                         "d_ll": rec["delta_logloss"]["delta"],
                         "lo": rec["delta_logloss"]["ci95"][0], "hi": rec["delta_logloss"]["ci95"][1],
                         "win_rate": rec["win_rate_motor_a"]})
    tables.append("### Motor A vs mercado por banda de favoritismo (Δ = Motor A − mercado)\n\n" +
                  K.md_table(pd.DataFrame(rows), digits=4))

    rows = []
    for name, res in (("logit", logit), ("hgb", hgb)):
        for rec in res["by_division"]:
            rows.append({"model": name, "div": rec["div"], "n": rec["n"],
                         "ll_market": rec["market"]["log_loss"], "ll_motor": rec["motor_a"]["log_loss"],
                         "d_ll": rec["delta_logloss"]["delta"],
                         "lo": rec["delta_logloss"]["ci95"][0], "hi": rec["delta_logloss"]["ci95"][1]})
    tables.append("### Motor A vs mercado por división (dev+val, n≥500)\n\n" +
                  K.md_table(pd.DataFrame(rows), digits=4))

    (K.ART / "exp07_tables.md").write_text("\n\n".join(tables) + "\n", encoding="utf-8")
    print("\n\n".join(tables[:4]))
    print("\n\n".join(tables[4:]))
    print("\n\nescrito -> artifacts/exp07_*")


if __name__ == "__main__":
    main()
