"""Shared cluster-robust statistical inference primitives for PitchLab v5.1.

Eliminates i.i.d. bootstrap standard-error deflation when multiple evaluated rows
belong to the same match / game / matchday cluster (Finding B1) and guarantees
explicit ``None`` (serialized as JSON ``null``) instead of ``0.0`` when a slice
has zero observations (Finding D6).
"""

from __future__ import annotations

from typing import Any, Sequence
import math
import numpy as np


def _mulberry32_chunk(n_clusters: int, start_k: int, count: int, seed: int) -> np.ndarray:
    """Bit-exact vectorized mulberry32 indices for steps [start_k, start_k + count)."""
    k = np.arange(start_k, start_k + count, dtype=np.uint64)
    t = ((np.uint64(seed & 0xFFFFFFFF) + k * np.uint64(0x6D2B79F5)) & np.uint64(0xFFFFFFFF)).astype(np.uint32)
    t = (t ^ (t >> np.uint32(15))) * (t | np.uint32(1))
    t = t ^ (t + ((t ^ (t >> np.uint32(7))) * (t | np.uint32(61))))
    u = (t ^ (t >> np.uint32(14))).astype(np.float64) / 4294967296.0
    return (u * n_clusters).astype(np.int64)


def _mulberry32_indices(n_clusters: int, n_resamples: int, seed: int) -> np.ndarray:
    """Deterministic mulberry32 cluster index matrix of shape (n_resamples, n_clusters)."""
    if n_clusters <= 0 or n_resamples <= 0:
        return np.empty((0, 0), dtype=np.int64)
    return _mulberry32_chunk(n_clusters, 1, n_clusters * n_resamples, seed).reshape(n_resamples, n_clusters)


def _aggregate_by_cluster(
    cluster_ids: Sequence[Any] | np.ndarray,
    values: np.ndarray,
    weights: np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray, int]:
    """Aggregate row-level values and weights by unique cluster identifier."""
    c_arr = np.asarray(cluster_ids)
    v_arr = np.asarray(values, dtype=np.float64)
    if len(c_arr) != len(v_arr):
        raise ValueError(f"cluster_ids length ({len(c_arr)}) != values length ({len(v_arr)})")
    w_arr = np.ones(len(v_arr), dtype=np.float64) if weights is None else np.asarray(weights, dtype=np.float64)

    # Map arbitrary hashable IDs (str, int, tuple) to contiguous 0..C-1 codes cleanly.
    _, inv = np.unique(c_arr.astype(str), return_inverse=True)
    n_clusters = int(inv.max()) + 1 if len(inv) > 0 else 0
    sum_v = np.bincount(inv, weights=v_arr * w_arr, minlength=n_clusters).astype(np.float64)
    sum_w = np.bincount(inv, weights=w_arr, minlength=n_clusters).astype(np.float64)
    return sum_v, sum_w, n_clusters


def cluster_bootstrap_diff(
    cluster_ids: Sequence[Any] | np.ndarray,
    loss_cand: np.ndarray,
    loss_bench: np.ndarray,
    n_resamples: int = 1000,
    seed: int = 20261111,
    weights: np.ndarray | None = None,
) -> dict[str, Any]:
    """Cluster-bootstrap mean loss difference: mean(loss_cand - loss_bench).

    Negative ``delta_mean`` means ``cand`` improves over ``bench``.
    Significant improvement requires ``ci95_hi < 0.0``.
    """
    lc = np.asarray(loss_cand, dtype=np.float64)
    lb = np.asarray(loss_bench, dtype=np.float64)
    n_rows = int(len(lc))
    if n_rows == 0:
        return {
            "n_rows": 0,
            "n_clusters": 0,
            "cand_mean": None,
            "bench_mean": None,
            "delta_mean": None,
            "se": None,
            "ci95_lo": None,
            "ci95_hi": None,
            "p_value_one_sided": None,
            "significant_improvement": False,
            "bootstrap_method": "cluster_mulberry32",
            "n_resamples": int(n_resamples),
            "seed": int(seed),
        }

    w = np.ones(n_rows, dtype=np.float64) if weights is None else np.asarray(weights, dtype=np.float64)
    w_tot = float(np.sum(w))
    cand_mean = float(np.sum(lc * w) / w_tot)
    bench_mean = float(np.sum(lb * w) / w_tot)
    diff = lc - lb
    delta_mean = float(np.sum(diff * w) / w_tot)

    sum_d, sum_w, n_clusters = _aggregate_by_cluster(cluster_ids, diff, w)
    if n_clusters < 2:
        return {
            "n_rows": n_rows,
            "n_clusters": n_clusters,
            "cand_mean": cand_mean,
            "bench_mean": bench_mean,
            "delta_mean": delta_mean,
            "se": None,
            "ci95_lo": None,
            "ci95_hi": None,
            "p_value_one_sided": None,
            "significant_improvement": False,
            "bootstrap_method": "cluster_mulberry32",
            "n_resamples": int(n_resamples),
            "seed": int(seed),
        }

    boot = np.empty(n_resamples, dtype=np.float64)
    chunk_b = max(1, min(n_resamples, max(1, 2_500_000 // max(1, n_clusters))))
    offset_b = 0
    while offset_b < n_resamples:
        cur_b = min(chunk_b, n_resamples - offset_b)
        start_k = 1 + offset_b * n_clusters
        idx = _mulberry32_chunk(n_clusters, start_k, cur_b * n_clusters, seed).reshape(cur_b, n_clusters)
        boot_num = sum_d[idx].sum(axis=1)
        boot_den = np.maximum(sum_w[idx].sum(axis=1), 1e-12)
        boot[offset_b : offset_b + cur_b] = boot_num / boot_den
        offset_b += cur_b

    ci_lo = float(np.quantile(boot, 0.025))
    ci_hi = float(np.quantile(boot, 0.975))
    se = float(np.std(boot, ddof=1))
    p_one = float(np.mean(boot >= 0.0))
    return {
        "n_rows": n_rows,
        "n_clusters": n_clusters,
        "cand_mean": round(cand_mean, 8),
        "bench_mean": round(bench_mean, 8),
        "delta_mean": round(delta_mean, 8),
        "se": round(se, 8),
        "ci95_lo": round(ci_lo, 8),
        "ci95_hi": round(ci_hi, 8),
        "p_value_one_sided": round(p_one, 6),
        "significant_improvement": bool(ci_hi < 0.0),
        "bootstrap_method": "cluster_mulberry32",
        "n_resamples": int(n_resamples),
        "seed": int(seed),
    }


def binary_logloss_vec(y_true: np.ndarray, p: np.ndarray, eps: float = 1e-15) -> np.ndarray:
    y = np.asarray(y_true, dtype=np.float64)
    pc = np.clip(np.asarray(p, dtype=np.float64), eps, 1.0 - eps)
    return -(y * np.log(pc) + (1.0 - y) * np.log(1.0 - pc))


def binary_brier_vec(y_true: np.ndarray, p: np.ndarray) -> np.ndarray:
    y = np.asarray(y_true, dtype=np.float64)
    pc = np.clip(np.asarray(p, dtype=np.float64), 0.0, 1.0)
    return (pc - y) ** 2


def multiclass_logloss_vec(y_idx: np.ndarray, probs: np.ndarray, eps: float = 1e-15) -> np.ndarray:
    yi = np.asarray(y_idx, dtype=np.int64)
    pr = np.asarray(probs, dtype=np.float64)
    chosen = np.clip(pr[np.arange(len(yi)), yi], eps, 1.0)
    return -np.log(chosen)


def multiclass_brier_vec(y_idx: np.ndarray, probs: np.ndarray) -> np.ndarray:
    yi = np.asarray(y_idx, dtype=np.int64)
    pr = np.asarray(probs, dtype=np.float64)
    n, k = pr.shape
    oh = np.zeros((n, k), dtype=np.float64)
    oh[np.arange(n), yi] = 1.0
    return np.sum((pr - oh) ** 2, axis=1)


def cluster_bootstrap_binary(
    cluster_ids: Sequence[Any] | np.ndarray,
    y_true: np.ndarray,
    p_cand: np.ndarray,
    p_bench: np.ndarray,
    n_resamples: int = 1000,
    seed: int = 20261111,
) -> dict[str, Any]:
    """Cluster-bootstrap binary Log-Loss and Brier comparison."""
    ll_c = binary_logloss_vec(y_true, p_cand)
    ll_b = binary_logloss_vec(y_true, p_bench)
    br_c = binary_brier_vec(y_true, p_cand)
    br_b = binary_brier_vec(y_true, p_bench)

    ll_res = cluster_bootstrap_diff(cluster_ids, ll_c, ll_b, n_resamples=n_resamples, seed=seed)
    br_res = cluster_bootstrap_diff(cluster_ids, br_c, br_b, n_resamples=n_resamples, seed=seed + 17)
    base_brier = float(np.var(np.asarray(y_true, dtype=np.float64))) if len(y_true) > 0 else 0.0
    bss_cand = (1.0 - float(np.mean(br_c)) / base_brier) if base_brier > 1e-12 else None
    bss_bench = (1.0 - float(np.mean(br_b)) / base_brier) if base_brier > 1e-12 else None

    ece_cand = safe_ece_binary(y_true, p_cand)
    ece_bench = safe_ece_binary(y_true, p_bench)
    prom = safe_promoted_ece(y_true, p_cand, threshold=0.50)

    return {
        "n_rows": ll_res["n_rows"],
        "n_clusters": ll_res["n_clusters"],
        "logloss_cand": ll_res["cand_mean"],
        "logloss_bench": ll_res["bench_mean"],
        "delta_logloss": ll_res["delta_mean"],
        "se_delta_logloss": ll_res["se"],
        "ci95_lo": ll_res["ci95_lo"],
        "ci95_hi": ll_res["ci95_hi"],
        "p_value_one_sided": ll_res["p_value_one_sided"],
        "significant_improvement": ll_res["significant_improvement"],
        "brier_cand": br_res["cand_mean"],
        "brier_bench": br_res["bench_mean"],
        "delta_brier": br_res["delta_mean"],
        "brier_ci95_lo": br_res["ci95_lo"],
        "brier_ci95_hi": br_res["ci95_hi"],
        "bss_cand": round(bss_cand, 6) if bss_cand is not None else None,
        "bss_bench": round(bss_bench, 6) if bss_bench is not None else None,
        "ece_cand": round(ece_cand, 6) if ece_cand is not None else None,
        "ece_bench": round(ece_bench, 6) if ece_bench is not None else None,
        "promoted_n_ge_50pct": prom["promoted_n_ge_50pct"],
        "promoted_ece_ge_50pct": prom["promoted_ece_ge_50pct"],
        "bootstrap_method": "cluster_mulberry32",
        "n_resamples": int(n_resamples),
        "seed": int(seed),
    }


def cluster_bootstrap_multiclass(
    cluster_ids: Sequence[Any] | np.ndarray,
    y_idx: np.ndarray,
    probs_cand: np.ndarray,
    probs_bench: np.ndarray,
    n_resamples: int = 1000,
    seed: int = 20261111,
) -> dict[str, Any]:
    """Cluster-bootstrap multiclass Log-Loss and Brier comparison (e.g., 1X2)."""
    ll_c = multiclass_logloss_vec(y_idx, probs_cand)
    ll_b = multiclass_logloss_vec(y_idx, probs_bench)
    br_c = multiclass_brier_vec(y_idx, probs_cand)
    br_b = multiclass_brier_vec(y_idx, probs_bench)

    ll_res = cluster_bootstrap_diff(cluster_ids, ll_c, ll_b, n_resamples=n_resamples, seed=seed)
    br_res = cluster_bootstrap_diff(cluster_ids, br_c, br_b, n_resamples=n_resamples, seed=seed + 17)
    yi = np.asarray(y_idx, dtype=np.int64)
    pc = np.asarray(probs_cand, dtype=np.float64)
    if len(yi) > 0 and pc.ndim == 2 and pc.shape[1] > 0:
        class_eces = [
            e
            for c in range(pc.shape[1])
            if (e := safe_ece_binary((yi == c).astype(np.float64), pc[:, c])) is not None
        ]
        ece_mc = float(np.mean(class_eces)) if class_eces else None
    else:
        ece_mc = None
    return {
        "n_rows": ll_res["n_rows"],
        "n_clusters": ll_res["n_clusters"],
        "logloss_cand": ll_res["cand_mean"],
        "logloss_bench": ll_res["bench_mean"],
        "delta_logloss": ll_res["delta_mean"],
        "se_delta_logloss": ll_res["se"],
        "ci95_lo": ll_res["ci95_lo"],
        "ci95_hi": ll_res["ci95_hi"],
        "p_value_one_sided": ll_res["p_value_one_sided"],
        "significant_improvement": ll_res["significant_improvement"],
        "brier_cand": br_res["cand_mean"],
        "brier_bench": br_res["bench_mean"],
        "delta_brier": br_res["delta_mean"],
        "brier_ci95_lo": br_res["ci95_lo"],
        "brier_ci95_hi": br_res["ci95_hi"],
        "ece_cand": round(ece_mc, 6) if ece_mc is not None else None,
        "bootstrap_method": "cluster_mulberry32",
        "n_resamples": int(n_resamples),
        "seed": int(seed),
    }


def safe_ece_binary(
    y_true: np.ndarray,
    p: np.ndarray,
    n_bins: int = 10,
) -> float | None:
    """Expected Calibration Error returning ``None`` (never ``0.0``) when empty."""
    y = np.asarray(y_true, dtype=np.float64)
    pr = np.asarray(p, dtype=np.float64)
    n = len(y)
    if n == 0:
        return None
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    for i in range(n_bins):
        lo, hi = edges[i], edges[i + 1]
        if i == n_bins - 1:
            mask = (pr >= lo) & (pr <= hi)
        else:
            mask = (pr >= lo) & (pr < hi)
        cnt = int(np.sum(mask))
        if cnt > 0:
            ece += (cnt / n) * abs(float(np.mean(pr[mask])) - float(np.mean(y[mask])))
    return float(ece)


def safe_promoted_ece(
    y_true: np.ndarray,
    p: np.ndarray,
    threshold: float = 0.50,
    n_bins: int = 5,
) -> dict[str, Any]:
    """Compute high-confidence (>= threshold) slice count & ECE, returning None on n == 0."""
    y = np.asarray(y_true, dtype=np.float64)
    pr = np.asarray(p, dtype=np.float64)
    mask = pr >= threshold
    n_prom = int(np.sum(mask))
    if n_prom == 0:
        return {
            "promoted_n_ge_50pct": 0,
            "promoted_ece_ge_50pct": None,
            "promoted_mean_pred": None,
            "promoted_mean_obs": None,
        }
    ece = safe_ece_binary(y[mask], pr[mask], n_bins=min(n_bins, max(1, n_prom // 20)))
    return {
        "promoted_n_ge_50pct": n_prom,
        "promoted_ece_ge_50pct": round(ece, 6) if ece is not None else None,
        "promoted_mean_pred": round(float(np.mean(pr[mask])), 6),
        "promoted_mean_obs": round(float(np.mean(y[mask])), 6),
    }


def sanitize_finite_float(val: float | None, default: float | None = None) -> float | None:
    if val is None or not math.isfinite(float(val)):
        return default
    return float(val)
