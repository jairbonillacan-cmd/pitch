#!/usr/bin/env python3
"""EXP03 — Modelos de goles: Poisson independiente vs Dixon-Coles (ρ estimado por división).

Diseño:
  - Ataque/defensa por equipo y división, ajustados con `PoissonRegressor` (L2) sobre goles
    de local y visitante apilados, con pesos temporales exponenciales (half-life en días).
  - λ_home y λ_away -> matriz de marcadores 0..10 -> P(H), P(D), P(A).
  - Variante Poisson: ρ = 0. Variante Dixon-Coles: ρ estimado por división (rejilla
    -0.30..0.30) maximizando la verosimilitud ponderada de las 4 celdas bajas.
  - Walk-forward expanding desde 2010/11: para cada temporada S se entrena con < S.
    Se reporta dev (2010-2022) y val (2023/24). Test nunca se toca.

Rejilla de alpha: la pedida {0.1, 1.0, 10.0} más una rejilla extendida {0.003, 0.01, 0.03}.
`PoissonRegressor` divide la verosimilitud por n_samples, así que alpha=1 ya es una
regularización enorme para ~40 coeficientes y 20k filas: aplasta el ataque/defensa a ~0 y el
modelo degenera en la frecuencia base. La rejilla extendida documenta ese hallazgo y permite
comparar Poisson vs Dixon-Coles en un régimen no degenerado.

Uso:
    ./.venv/bin/python models/a/experiments/exp03_goals.py            # 18 combinaciones
    ./.venv/bin/python models/a/experiments/exp03_goals.py --quick    # 2 combinaciones
"""
from __future__ import annotations

import argparse
import multiprocessing as mp
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import pandas as pd
from scipy.stats import poisson
from sklearn.linear_model import PoissonRegressor

LAB_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, LAB_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common import (ART, SEED, VAL, load_features, paired_bootstrap_blocks,  # noqa: E402
                    per_match_log_loss, summarize, utc_now, write_json, write_predictions)

TAG = "A06_EXP03_goals_20261109"
OUT = os.path.join(ART, TAG)
EVAL_FROM = 2010
HALF_LIVES = [180.0, 365.0, 730.0]
ALPHAS = [0.1, 1.0, 10.0]
ALPHAS_EXT = [0.003, 0.01, 0.03]
RHO_GRID = np.round(np.arange(-0.30, 0.3001, 0.005), 4)
MAX_GOALS = 10
COLS = ["match_id", "div", "season", "match_date", "home_team", "away_team",
        "home_goals", "away_goals", "y"]
METRICS = ("log_loss", "brier", "rps", "accuracy", "ece_top", "ece_draw")

_DF: pd.DataFrame | None = None


class GoalsModel:
    """Poisson bivariado por división con corrección Dixon-Coles opcional."""

    def __init__(self, half_life: float = 365.0, alpha: float = 1.0,
                 use_dc: bool = True, max_goals: int = MAX_GOALS):
        self.half_life = half_life
        self.alpha = alpha
        self.use_dc = use_dc
        self.max_goals = max_goals
        self.fits: dict[str, dict] = {}
        self.rho: dict[str, float] = {}

    # ---------------------------------------------------------------- ajuste
    def fit(self, train: pd.DataFrame):
        self.fits, self.rho = {}, {}
        ref_date = train.match_date.max()
        for div, g in train.groupby("div", sort=False):
            if len(g) < 200:
                continue
            teams = pd.Index(sorted(set(g.home_team) | set(g.away_team)))
            idx = {t: i for i, t in enumerate(teams)}
            n = len(teams)
            hi = g.home_team.map(idx).to_numpy()
            ai = g.away_team.map(idx).to_numpy()
            rows = np.arange(len(g))
            # att(T) + def(T) + localía; intercepto NO penalizado (fit_intercept=True)
            X = np.zeros((2 * len(g), 2 * n + 1))
            X[rows, hi] = 1.0
            X[rows, n + ai] = 1.0
            X[rows, -1] = 1.0                      # localía
            X[len(g) + rows, ai] = 1.0
            X[len(g) + rows, n + hi] = 1.0
            y = np.concatenate([g.home_goals.to_numpy(float), g.away_goals.to_numpy(float)])
            age = (ref_date - g.match_date).dt.days.to_numpy(dtype=float)
            w = 0.5 ** (age / self.half_life)
            # Con pesos que suman ~n_eff << n, la penalización de sklearn (dividida por
            # n_samples) domina y aplasta los coeficientes. Se normaliza a media 1.
            w = w / w.mean()
            model = PoissonRegressor(alpha=self.alpha, max_iter=400, tol=1e-6,
                                     fit_intercept=True)
            model.fit(X, y, sample_weight=np.concatenate([w, w]))
            self.fits[div] = {"model": model, "teams": idx, "n": n, "ref_date": ref_date}
        return self

    @staticmethod
    def _estimate_rho(g: pd.DataFrame, lh: np.ndarray, la: np.ndarray,
                      w: np.ndarray) -> float:
        hg = g.home_goals.to_numpy()
        ag = g.away_goals.to_numpy()
        # Solo las 4 celdas bajas dependen de rho; el resto aporta una constante.
        # Se evalúa toda la rejilla de rho de una vez (121 x n_celdas) en vez de 121 pasadas.
        m00 = (hg == 0) & (ag == 0)
        m01 = (hg == 0) & (ag == 1)
        m10 = (hg == 1) & (ag == 0)
        m11 = (hg == 1) & (ag == 1)
        r = RHO_GRID[:, None]
        ll = np.zeros(len(RHO_GRID))
        for mask, arg in ((m00, -lh[m00] * la[m00]), (m01, lh[m01]),
                          (m10, la[m10]), (m11, -np.ones(int(m11.sum())))):
            if mask.sum() == 0:
                continue
            t = np.maximum(1.0 + r * arg[None, :], 1e-9)
            ll += np.log(t) @ w[mask]
        return float(RHO_GRID[int(np.argmax(ll))])

    def estimate_rho_by_div(self, train: pd.DataFrame):
        """ρ por división con λ in-sample del propio entrenamiento (pesos temporales)."""
        self.rho = {}
        for div, g in train.groupby("div", sort=False):
            if div not in self.fits:
                continue
            g = g.reset_index(drop=True)
            lh, la = self._lambdas_single(g)
            age = (self.fits[div]["ref_date"] - g.match_date).dt.days.to_numpy(float)
            w = 0.5 ** (age / self.half_life)
            self.rho[div] = float(self._estimate_rho(g, lh, la, w))
        return self

    # ---------------------------------------------------------------- predicción
    def _design(self, g: pd.DataFrame) -> np.ndarray:
        fit = self.fits[g["div"].iloc[0]]
        n = fit["n"]
        X = np.zeros((2 * len(g), 2 * n + 1))
        rows = np.arange(len(g))
        X[rows, -1] = 1.0                          # localía
        hi = g.home_team.map(fit["teams"]).to_numpy(dtype=float)
        ai = g.away_team.map(fit["teams"]).to_numpy(dtype=float)
        known = np.isfinite(hi) & np.isfinite(ai)
        if known.any():
            hk = hi[known].astype(int)
            ak = ai[known].astype(int)
            X[rows[known], hk] = 1.0
            X[rows[known], n + ak] = 1.0
            X[len(g) + rows[known], ak] = 1.0
            X[len(g) + rows[known], n + hk] = 1.0
        return X

    def _lambdas_single(self, g: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        fit = self.fits[g["div"].iloc[0]]
        X = self._design(g)
        lh = np.clip(fit["model"].predict(X[: len(g)]), 0.02, 8.0)
        la = np.clip(fit["model"].predict(X[len(g):]), 0.02, 8.0)
        return lh, la

    def _lambdas(self, df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        lh = np.full(len(df), np.nan)
        la = np.full(len(df), np.nan)
        rho = np.zeros(len(df))
        for div, g in df.groupby("div", sort=False):
            if div not in self.fits:
                continue
            pos = np.where((df["div"] == div).to_numpy())[0]
            lh[pos], la[pos] = self._lambdas_single(g.reset_index(drop=True))
            rho[pos] = self.rho.get(div, 0.0)
        return lh, la, rho

    def predict_proba(self, df: pd.DataFrame) -> np.ndarray:
        lh, la, rho = self._lambdas(df)
        if not np.isfinite(lh).all():
            raise RuntimeError("λ no finitas: división no vista en entrenamiento")
        k = np.arange(self.max_goals + 1)
        ph = poisson.pmf(k[None, :], lh[:, None])
        pa = poisson.pmf(k[None, :], la[:, None])
        ph /= ph.sum(axis=1, keepdims=True)
        pa /= pa.sum(axis=1, keepdims=True)
        outer = ph[:, :, None] * pa[:, None, :]
        tri = np.tril_indices(self.max_goals + 1, -1)
        ph_win = outer[:, tri[0], tri[1]].sum(axis=1)
        dr = np.einsum("ij,ij->i", ph, pa)         # diagonal = empate
        pa_win = 1.0 - ph_win - dr
        # celdas bajas y corrección τ de Dixon-Coles
        m00 = ph[:, 0] * pa[:, 0]
        m01 = ph[:, 0] * pa[:, 1]
        m10 = ph[:, 1] * pa[:, 0]
        m11 = ph[:, 1] * pa[:, 1]
        t00 = np.maximum(1.0 - lh * la * rho, 1e-9)
        t01 = np.maximum(1.0 + lh * rho, 1e-9)
        t10 = np.maximum(1.0 + la * rho, 1e-9)
        t11 = np.maximum(1.0 - rho, 1e-9)
        adj_h = (t00 - 1.0) * m00 + (t10 - 1.0) * m10
        adj_d = (t00 - 1.0) * m00 + (t11 - 1.0) * m11
        adj_a = (t01 - 1.0) * m01 + (t11 - 1.0) * m11
        Z = 1.0 + adj_h + adj_d + adj_a
        p = np.column_stack([np.maximum(ph_win + adj_h, 1e-12),
                             np.maximum(dr + adj_d, 1e-12),
                             np.maximum(pa_win + adj_a, 1e-12)]) / Z[:, None]
        return p / p.sum(axis=1, keepdims=True)


def _init(df):
    global _DF
    _DF = df


def run_combo(cfg):
    """Ajusta (half_life, alpha) y evalúa Poisson y DC walk-forward. Devuelve métricas."""
    hl, alpha = cfg
    df = _DF
    rows, rhos, preds_val = [], {}, {}
    t0 = time.time()
    for season in range(EVAL_FROM, VAL + 1):
        train = df[df.sstart < season]
        test = df[df.sstart == season].reset_index(drop=True)
        if train.sstart.nunique() < 3 or len(test) == 0:
            continue
        mp_ = GoalsModel(half_life=hl, alpha=alpha, use_dc=False).fit(train)
        # divisiones sin historia previa (JPN/SWE en su primera temporada) se excluyen
        test = test[test["div"].isin(mp_.fits)].reset_index(drop=True)
        if len(test) == 0:
            continue
        p_pois = mp_.predict_proba(test)
        mp_.estimate_rho_by_div(train)
        rhos[season] = dict(mp_.rho)
        p_dc = mp_.predict_proba(test)
        y = test.y.to_numpy(int)
        for label, p in (("poisson", p_pois), ("dixon_coles", p_dc)):
            mt = summarize(y, p)
            mt.update({"half_life": hl, "alpha": alpha, "variant": label,
                       "season": int(season), "n": int(len(y)),
                       "match_id": None})
            mt.pop("match_id")
            rows.append(mt)
            if season == VAL:
                preds_val[label] = (test[["match_id", "div", "season", "match_date"]].copy(), p)
    return {"hl": hl, "alpha": alpha, "rows": rows, "rhos": rhos,
            "preds_val": preds_val, "seconds": time.time() - t0}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--workers", type=int, default=max(1, min(7, mp.cpu_count() - 1)))
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)

    df = load_features(COLS)
    print(f"[EXP03] partidos dev+val: {len(df):,} | divisiones: {df['div'].nunique()} | "
          f"temporadas evaluadas {EVAL_FROM}-{VAL}")

    if args.quick:
        combos = [(365.0, 1.0), (365.0, 0.01)]
    else:
        combos = [(h, a) for h in HALF_LIVES for a in ALPHAS + ALPHAS_EXT]
    print(f"[EXP03] combinaciones (half_life, alpha): {len(combos)} | workers={args.workers}")

    t_all = time.time()
    out = []
    if args.workers > 1:
        ctx = mp.get_context("fork")
        with ProcessPoolExecutor(max_workers=args.workers, mp_context=ctx,
                                 initializer=_init, initargs=(df,)) as ex:
            for i, r in enumerate(ex.map(run_combo, combos), 1):
                out.append(r)
                ll = np.mean([x["log_loss"] for x in r["rows"] if x["variant"] == "poisson"])
                print(f"  [{i:2d}/{len(combos)}] hl={r['hl']:5.0f} alpha={r['alpha']:6.3f} "
                      f"poisson_ll={ll:.5f} ({r['seconds']:.0f}s)", flush=True)
    else:
        _init(df)
        for i, cfg in enumerate(combos, 1):
            r = run_combo(cfg)
            out.append(r)
            ll = np.mean([x["log_loss"] for x in r["rows"] if x["variant"] == "poisson"])
            print(f"  [{i:2d}/{len(combos)}] hl={r['hl']:5.0f} alpha={r['alpha']:6.3f} "
                  f"poisson_ll={ll:.5f} ({r['seconds']:.0f}s)", flush=True)
    elapsed = time.time() - t_all

    rows = [x for r in out for x in r["rows"]]
    res = pd.DataFrame(rows)
    res.to_csv(os.path.join(OUT, "metrics_by_season.csv"), index=False)

    def agg(sub):
        w = sub.n.to_numpy()
        return {k: float(np.average(sub[k], weights=w)) for k in METRICS} | {"n": int(w.sum())}

    summary = []
    for (hl, alpha), g in res.groupby(["half_life", "alpha"]):
        for variant in ("poisson", "dixon_coles"):
            sub = g[g.variant == variant]
            dev, val = sub[sub.season <= 2022], sub[sub.season == VAL]
            summary.append({"half_life": hl, "alpha": alpha, "variant": variant,
                            "grid": "pedida" if alpha in ALPHAS else "extendida",
                            **{f"dev_{k}": v for k, v in agg(dev).items()},
                            **{f"val_{k}": v for k, v in agg(val).items()}})
    summ = pd.DataFrame(summary).sort_values("val_log_loss").reset_index(drop=True)
    summ.to_csv(os.path.join(OUT, "summary_val.csv"), index=False)

    best = summ.iloc[0]
    key = (float(best.half_life), float(best.alpha))
    combo = [r for r in out if r["hl"] == key[0] and r["alpha"] == key[1]][0]
    test_val, p_dc = combo["preds_val"]["dixon_coles"]
    _, p_pois = combo["preds_val"]["poisson"]
    yv = (test_val[["match_id"]].merge(df[["match_id", "y"]], on="match_id", how="left")
          ["y"].to_numpy(int))
    boot = {"dc_vs_poisson_val": paired_bootstrap_blocks(
        per_match_log_loss(yv, p_pois), per_match_log_loss(yv, p_dc),
        test_val["div"].to_numpy(), B=2000)}

    rho_rows = [{"div": d, "rho": r, "season": s} for s, dd in combo["rhos"].items()
                for d, r in dd.items()]
    rho_df = pd.DataFrame(rho_rows)
    rho_df.to_csv(os.path.join(OUT, "rho_by_div.csv"), index=False)
    rho_val = rho_df[rho_df.season == VAL].set_index("div")["rho"].sort_values()

    mid = f"poisson_{best.variant}_hl{int(key[0])}_a{key[1]}"
    write_predictions(os.path.join(OUT, "predictions.csv"), test_val.reset_index(drop=True), p_dc,
                      model_id=mid, version="exp03_v1",
                      fold_ids=pd.Series(["val_2023"] * len(test_val)))

    payload = {
        "experiment": "EXP03_goals_poisson_vs_dc",
        "generated_at": utc_now(), "seed": SEED,
        "protocol": {"walk_forward_from": EVAL_FROM, "val": VAL, "test_used": False,
                     "half_lives": HALF_LIVES, "alphas": ALPHAS, "alphas_ext": ALPHAS_EXT,
                     "max_goals": MAX_GOALS,
                     "rho_grid": [-0.30, 0.30, 0.005],
                     "weights": "0.5**(edad_dias/half_life), normalizados a media 1"},
        "best": {"half_life": key[0], "alpha": key[1], "variant": best.variant,
                 "dev_log_loss": float(best.dev_log_loss),
                 "val_log_loss": float(best.val_log_loss),
                 "val_brier": float(best.val_brier), "val_rps": float(best.val_rps),
                 "val_n": int(best.val_n)},
        "best_by_mandatory_grid": None,
        "bootstrap_val": boot,
        "rho_by_div_val": {d: float(v) for d, v in rho_val.items()},
        "rho_mean_val": float(rho_val.mean()),
        "rho_median_val": float(rho_val.median()),
        "rho_frac_negative_val": float((rho_val < 0).mean()),
        "summary": summ.to_dict(orient="records"),
        "elapsed_seconds": elapsed,
    }
    mand = summ[summ.grid == "pedida"]
    if len(mand):
        bm = mand.iloc[0]
        payload["best_by_mandatory_grid"] = {
            "half_life": float(bm.half_life), "alpha": float(bm.alpha),
            "variant": bm.variant, "val_log_loss": float(bm.val_log_loss)}
    write_json(os.path.join(OUT, "metrics.json"), payload)
    write_json(os.path.join(OUT, "config.json"), {
        "half_lives": HALF_LIVES, "alphas": ALPHAS, "alphas_ext": ALPHAS_EXT,
        "max_goals": MAX_GOALS, "rho_grid": "[-0.30, 0.30] paso 0.005",
        "eval_from": EVAL_FROM, "val": VAL, "seed": SEED, "test_used": False,
    })

    cols = ["half_life", "alpha", "grid", "variant", "dev_log_loss", "val_log_loss",
            "val_brier", "val_rps", "val_ece_draw"]
    print("\n=== EXP03 resumen (ordenado por val log-loss) ===")
    print(summ[cols].to_string(index=False))
    print(f"\n[EXP03] mejor global: hl={key[0]} alpha={key[1]} {best.variant} "
          f"dev={best.dev_log_loss:.4f} val={best.val_log_loss:.4f}")
    if payload["best_by_mandatory_grid"]:
        bmg = payload["best_by_mandatory_grid"]
        print(f"[EXP03] mejor de la rejilla pedida: hl={bmg['half_life']} alpha={bmg['alpha']} "
              f"{bmg['variant']} val={bmg['val_log_loss']:.4f} "
              f"(degenerado: alpha grande aplasta ataque/defensa)")
    print(f"[EXP03] ρ val: media={rho_val.mean():.3f} mediana={rho_val.median():.3f} "
          f"frac_neg={float((rho_val<0).mean()):.2f} rango={rho_val.min():.3f}..{rho_val.max():.3f}")
    print(f"[EXP03] DC vs Poisson (val, mismo modelo de λ): {boot['dc_vs_poisson_val']}")
    print(f"[EXP03] artefactos -> {OUT} ({elapsed:.0f}s)")


if __name__ == "__main__":
    main()
