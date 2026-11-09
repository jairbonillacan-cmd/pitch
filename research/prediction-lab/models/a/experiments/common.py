#!/usr/bin/env python3
"""Utilidades compartidas por los experimentos A06 (Motor A, sin cuotas).

Contiene:
  - métricas del CONTRACT_PREDICTIONS (log-loss, Brier, RPS, accuracy, ECE, fiabilidad);
  - un logit ordenado 1X2 sobre Elo equivalente a `EloOrderedModel` (mismo esquema de 3
    parámetros) pero con gradiente analítico y L-BFGS, ~50x más rápido, necesario para
    barrer 96 configuraciones de Elo;
  - bootstrap pareado por bloques (temporada x división) para las diferencias de pérdida;
  - escritura de predicciones en el formato del contrato.

Convención de etiqueta: y = 0 (H), 1 (D), 2 (A)  [CONTRACT_PREDICTIONS §2].
Ninguna función de este módulo puede leer la partición de test: los cargadores filtran
`season_start <= 2023` y lo verifican con un assert.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.special import expit

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
PROC = os.path.join(ROOT, "data", "processed")
ART = os.path.join(ROOT, "artifacts")

SEED = 20261109
DEV_END = 2022          # dev: temporadas <= 2022/23
VAL = 2023              # val: 2023/24 (única para elegir)
TEST = (2024, 2025)     # PROHIBIDO para decidir
EVAL_FROM = 2008        # primera temporada evaluada en EXP02 (walk-forward)
CALIB_FROM = 2010       # primera temporada calibrada fuera de muestra en EXP06


# ------------------------------------------------------------------ temporadas / datos
def season_start(series: pd.Series) -> pd.Series:
    """'2023/24' -> 2023 ; '2023' (ligas de año natural) -> 2023."""
    return series.map(lambda s: int(str(s)[:4])).astype(int)


def load_features(columns=None) -> pd.DataFrame:
    """features.parquet ordenado por división y fecha (orden que exige `elo_block`)."""
    df = pd.read_parquet(os.path.join(PROC, "features.parquet"), columns=columns)
    df["match_date"] = pd.to_datetime(df["match_date"])
    if "y" in df.columns:
        df = df[df["y"].notna()].copy()
        df["y"] = df["y"].astype(int)
    if "season" in df.columns:
        df["sstart"] = season_start(df["season"])
        df = df[df["sstart"] <= VAL].copy()   # dev + val; test/live jamás entran al lab
        assert df["sstart"].max() == VAL
    assert not df.match_id.duplicated().any()
    return df.sort_values(["div", "match_date", "match_id"], kind="mergesort").reset_index(drop=True)


def exp01_dir() -> tuple[str, str]:
    """Devuelve (directorio, etiqueta) de las predicciones base de EXP01.

    Prefiere `EXP01_final_*` (Motor A limpio, dataset v1.1). Si no existe o está incompleto,
    cae a `EXP01_baselines_*` y lo marca como 'contaminado' (priors con leakage).
    """
    finals = sorted(d for d in os.listdir(ART) if d.startswith("EXP01_final_")
                    and os.path.isdir(os.path.join(ART, d)))
    for d in reversed(finals):
        full = os.path.join(ART, d)
        if all(os.path.exists(os.path.join(full, f"pred_{m}.csv"))
               for m in ("elo_ordered", "logit", "hgb")):
            return full, d
    return os.path.join(ART, "EXP01_baselines_20261109"), "EXP01_baselines_20261109"


def find_clean_predictions(model: str) -> tuple[str | None, str]:
    """Localiza `pred_<model>.csv` en un artefacto limpio (dataset v1.1).

    Orden: EXP01_final (Elo/logit/ensemble) -> EXP05_hgb_final (hgb aislado) -> None.
    NUNCA devuelve EXP01_baselines: sus predicciones usan priors con leakage.
    """
    candidates = []
    for d in sorted(os.listdir(ART)):
        full = os.path.join(ART, d)
        if not os.path.isdir(full):
            continue
        if d.startswith("EXP01_final") or d.startswith("EXP05_hgb_final"):
            f = os.path.join(full, f"pred_{model}.csv")
            if os.path.exists(f) and os.path.getsize(f) > 1_000_000:
                candidates.append((f, d))
    if not candidates:
        return None, "no_disponible"
    candidates.sort(key=lambda x: 0 if "EXP05" in x[1] and model == "hgb" else 1)
    return candidates[0][0], candidates[0][1]


def load_exp01_predictions(model: str, part: str = "dev_val",
                           allow_contaminated: bool = True) -> pd.DataFrame:
    """Predicciones walk-forward out-of-sample por temporada, solo dev+val."""
    path, label = find_clean_predictions(model)
    if path is None:
        d, label = exp01_dir()
        if label == "EXP01_baselines_20261109" and not allow_contaminated:
            raise SystemExit("No hay predicciones limpias (v1.1) para "
                             f"{model}: no se deben usar las de EXP01_baselines.")
        path = os.path.join(d, f"pred_{model}.csv")
    p = path
    d = pd.read_csv(p)
    d["match_date"] = pd.to_datetime(d["match_date"])
    d["sstart"] = season_start(d["season"])
    d = d[d["sstart"] <= VAL].copy()          # test/live jamás entran al lab
    assert d["sstart"].max() == VAL, "EXP01 predictions no cubren val"
    pcols = ["p_home", "p_draw", "p_away"]
    assert np.allclose(d[pcols].sum(axis=1), 1.0, atol=1e-6)
    return d


# ------------------------------------------------------------------ métricas del contrato
def _prep(y, p):
    y = np.asarray(y, dtype=int)
    p = np.asarray(p, dtype=float)
    p = np.clip(p, 1e-15, 1.0)
    p = p / p.sum(axis=1, keepdims=True)
    return y, p


def log_loss(y, p) -> float:
    y, p = _prep(y, p)
    return float(-np.mean(np.log(p[np.arange(len(y)), y])))


def per_match_log_loss(y, p) -> np.ndarray:
    y, p = _prep(y, p)
    return -np.log(p[np.arange(len(y)), y])


def brier(y, p) -> float:
    y, p = _prep(y, p)
    o = np.eye(3)[y]
    return float(np.mean(np.sum((p - o) ** 2, axis=1)))


def rps(y, p) -> float:
    y, p = _prep(y, p)
    o = np.eye(3)[y]
    cp = np.cumsum(p, axis=1)[:, :2]
    co = np.cumsum(o, axis=1)[:, :2]
    return float(np.mean(np.sum((cp - co) ** 2, axis=1) / 2.0))


def accuracy(y, p) -> float:
    y, p = _prep(y, p)
    return float(np.mean(np.argmax(p, axis=1) == y))


def balanced_accuracy(y, p) -> float:
    y, p = _prep(y, p)
    pred = np.argmax(p, axis=1)
    rec = [np.mean(pred[y == k] == k) for k in range(3) if (y == k).any()]
    return float(np.mean(rec))


def ece_top(y, p, n_bins: int = 10) -> float:
    """ECE de la clase predicha: |acc_b - conf_b| ponderado (CONTRACT_PREDICTIONS §3)."""
    y, p = _prep(y, p)
    conf = p.max(axis=1)
    pred = p.argmax(axis=1)
    hit = (pred == y).astype(float)
    bins = np.clip((conf * n_bins).astype(int), 0, n_bins - 1)
    e = 0.0
    for b in range(n_bins):
        m = bins == b
        if m.sum() == 0:
            continue
        e += m.mean() * abs(hit[m].mean() - conf[m].mean())
    return float(e)


def ece_class(y, p, k: int, n_bins: int = 10) -> float:
    """ECE one-vs-rest de la clase k (fiabilidad de p_k)."""
    y, p = _prep(y, p)
    pk = p[:, k]
    ok = (y == k).astype(float)
    bins = np.clip((pk * n_bins).astype(int), 0, n_bins - 1)
    e = 0.0
    for b in range(n_bins):
        m = bins == b
        if m.sum() == 0:
            continue
        e += m.mean() * abs(ok[m].mean() - pk[m].mean())
    return float(e)


def reliability(y, p, n_bins: int = 10) -> pd.DataFrame:
    """Curva de fiabilidad one-vs-rest para las 3 clases (una fila por bin y clase)."""
    y, p = _prep(y, p)
    rows = []
    names = ["H", "D", "A"]
    for k in range(3):
        pk = p[:, k]
        ok = (y == k).astype(float)
        bins = np.clip((pk * n_bins).astype(int), 0, n_bins - 1)
        for b in range(n_bins):
            m = bins == b
            if m.sum() == 0:
                continue
            rows.append({"class": names[k], "bin": b, "lo": b / n_bins, "hi": (b + 1) / n_bins,
                         "n": int(m.sum()), "pred_mean": float(pk[m].mean()),
                         "obs_rate": float(ok[m].mean()),
                         "abs_gap": float(abs(pk[m].mean() - ok[m].mean()))})
    return pd.DataFrame(rows)


def summarize(y, p) -> dict:
    y, p = _prep(y, p)
    out = {
        "n": int(len(y)),
        "log_loss": log_loss(y, p),
        "brier": brier(y, p),
        "rps": rps(y, p),
        "accuracy": accuracy(y, p),
        "balanced_accuracy": balanced_accuracy(y, p),
        "ece_top": ece_top(y, p),
        "ece_home": ece_class(y, p, 0),
        "ece_draw": ece_class(y, p, 1),
        "ece_away": ece_class(y, p, 2),
        "draw_pred_mean": float(np.mean(p[:, 1])),
        "draw_obs_rate": float(np.mean(y == 1)),
    }
    return out


# ------------------------------------------------------------------ logit ordenado (Elo)
def fit_ordered_logit(x: np.ndarray, y: np.ndarray, x0=(1.0, -0.5, 0.6)) -> np.ndarray:
    """Ajusta p(H)=σ(c1-bx), p(D)=σ(c2-bx)-σ(c1-bx), p(A)=1-σ(c2-bx).

    Idéntico modelo que `EloOrderedModel` de models/a/train_motor_a.py, reparametrizado
    c2 = c1 + exp(d) para garantizar c1 < c2, con gradiente analítico y L-BFGS-B.
    Devuelve (b, c1, c2).
    """
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=int)
    n = len(y)
    m0, m1, m2 = (y == 0), (y == 1), (y == 2)

    def nll_grad(theta):
        b, c1, d = theta
        gap = np.exp(d)
        u1 = c1 - b * x
        u2 = c1 + gap - b * x
        s1 = expit(u1)
        s2 = expit(u2)
        pD = np.maximum(s2 - s1, 1e-12)
        ll = np.where(m0, np.log(np.maximum(s1, 1e-12)),
                      np.where(m1, np.log(pD), np.log(np.maximum(1.0 - s2, 1e-12))))
        val = -ll.mean()
        g1 = np.zeros(n)
        g2 = np.zeros(n)
        g1[m0] = 1.0 - s1[m0]
        g1[m1] = -s1[m1] * (1.0 - s1[m1]) / pD[m1]
        g2[m1] = s2[m1] * (1.0 - s2[m1]) / pD[m1]
        g2[m2] = -s2[m2]                     # d/du2 log(1-s2) = -s2
        tot = g1 + g2
        gb = np.sum(x * tot) / n   # dNLL/db = +mean(x*(g1+g2)); du/db = -x
        gc1 = -np.sum(tot) / n
        gd = -np.sum(gap * g2) / n
        return val, np.array([gb, gc1, gd])

    res = minimize(nll_grad, np.asarray(x0, dtype=float), jac=True, method="L-BFGS-B",
                   options={"maxiter": 500, "ftol": 1e-14, "gtol": 1e-10})
    b, c1, d = res.x
    return np.array([b, c1, c1 + np.exp(d)])


def predict_ordered_logit(params: np.ndarray, x: np.ndarray) -> np.ndarray:
    b, c1, c2 = params
    x = np.asarray(x, dtype=float)
    s1 = expit(c1 - b * x)
    s2 = expit(c2 - b * x)
    p = np.column_stack([s1, np.clip(s2 - s1, 1e-12, None), 1.0 - s2])
    p = np.clip(p, 1e-12, None)
    return p / p.sum(axis=1, keepdims=True)


# ------------------------------------------------------------------ inferencia
def paired_bootstrap_blocks(loss_a: np.ndarray, loss_b: np.ndarray, blocks: np.ndarray,
                            B: int = 2000, seed: int = SEED) -> dict:
    """IC95 % bootstrap pareado por bloques de mean(loss_a - loss_b)."""
    loss_a = np.asarray(loss_a, dtype=float)
    loss_b = np.asarray(loss_b, dtype=float)
    diff = loss_a - loss_b
    codes, uniques = pd.factorize(np.asarray(blocks))
    n_blocks = len(uniques)
    sums = np.bincount(codes, weights=diff, minlength=n_blocks)
    cnts = np.bincount(codes, minlength=n_blocks).astype(float)
    rng = np.random.default_rng(seed)
    stats = np.empty(B)
    for i in range(B):
        pick = rng.integers(0, n_blocks, size=n_blocks)
        stats[i] = sums[pick].sum() / cnts[pick].sum()
    return {"mean_diff": float(diff.mean()),
            "ci95_lo": float(np.percentile(stats, 2.5)),
            "ci95_hi": float(np.percentile(stats, 97.5)),
            "frac_gt0": float(np.mean(stats > 0))}


def perm_test_paired(loss_a: np.ndarray, loss_b: np.ndarray, n_perm: int = 10000,
                     seed: int = SEED) -> float:
    """p-valor de permutación pareada para H0: E[loss_a - loss_b] = 0 (dos colas)."""
    diff = np.asarray(loss_a) - np.asarray(loss_b)
    obs = abs(diff.mean())
    rng = np.random.default_rng(seed)
    cnt = 0
    for _ in range(n_perm):
        s = rng.choice([-1.0, 1.0], size=len(diff))
        if abs((diff * s).mean()) >= obs:
            cnt += 1
    return float((cnt + 1) / (n_perm + 1))


# ------------------------------------------------------------------ artefactos
def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def write_predictions(path: str, df: pd.DataFrame, p: np.ndarray, model_id: str,
                      version: str, fold_ids: pd.Series | None = None) -> None:
    """Escribe predicciones con el esquema de CONTRACT_PREDICTIONS §1."""
    out = pd.DataFrame({
        "match_id": df["match_id"].to_numpy(),
        "div": df["div"].to_numpy(),
        "season": df["season"].to_numpy(),
        "match_date": pd.to_datetime(df["match_date"]).dt.strftime("%Y-%m-%d"),
        "model_id": model_id,
        "model_version": version,
        "p_home": p[:, 0],
        "p_draw": p[:, 1],
        "p_away": p[:, 2],
        "fold_id": (fold_ids if fold_ids is not None
                    else df["sstart"].map(lambda s: f"wf_{s}")).astype(str).to_numpy(),
        "generated_at": utc_now(),
        "data_quality_flag": "ok",
    })
    assert np.allclose(out[["p_home", "p_draw", "p_away"]].sum(axis=1), 1.0, atol=1e-6)
    assert not out[["p_home", "p_draw", "p_away"]].isna().any().any()
    assert not out.duplicated(["match_id", "model_id"]).any()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out.to_csv(path, index=False)


def write_json(path: str, payload: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(payload, f, indent=1, default=float, ensure_ascii=False)
