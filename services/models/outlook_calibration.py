"""Ola 1 · Agente B4 (`b4-calibration`) — Probabilidad publicada calibrada (`v3.2`).

Decide de forma estrictamente causal sobre `walk_forward_dev` (`ts_event_start < 2025-02-02T17:30:00Z`),
por `liga × mercado`, de qué fuente sale la probabilidad pública mostrada al usuario en `MatchOutlook`:
  `market_sharp_novig` / `blend_v3_1` > `model` > `base_rate`

Reglas rectoras cumplidas e instrumentadas con guardas duras:
  1. Cero re-tuneo de `v3.1`: `blend_weights_v3_1.json` se consume congelado en modo solo lectura.
  2. Cero evaluaciones sobre `holdout_sealed` (`>= 2025-02-02T17:30:00Z`).
  3. Cero cuotas inventadas: cuando un mercado carece de cuotas históricas sharp pre-decisión
     (`ts_captured <= ts_decision`), queda marcado explícitamente `DESCONOCIDO` y se evalúan
     honestamente los escalones `model` y `base_rate` sobre marcadores reales (`OBSERVADO`).
  4. Cero campos de dimensionamiento/apuesta (`stake`, `kelly`, `ev`, `tier`, `value`, `"pick seguro"`).
  5. Bootstrap determinista `mulberry32` (`>= 1,000` remuestreos, semilla fija `20261111`) para
     `log-loss`, `Brier`, `RPS`, curva de fiabilidad de `10` bins y `ECE`, etiquetando `"no significativa"`
     siempre que el IC 95% de `delta_ll_vs_benchmark` cruce `0`.
  6. Paridad bit a bit SHA-256 entre `services/models/artifacts/outlook_calibration_v3_2.json` y
     `src/data/prediction/outlook_calibration_v3_2.json` conforme a `CONTRACT_OUTLOOK.md` §3.

Uso CLI:
  .\\research\\prediction-lab\\.venv\\Scripts\\python.exe services/models/outlook_calibration.py --record-trial
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import shutil
import sys
from typing import Any, Mapping, Sequence

import numpy as np
import pandas as pd

MODELS_DIR = Path(__file__).resolve().parent
SERVICES_DIR = MODELS_DIR.parent
WORKTREE_ROOT = SERVICES_DIR.parent
PRED_LAB_ROOT = WORKTREE_ROOT / "research" / "prediction-lab"

if str(MODELS_DIR) not in sys.path:
    sys.path.insert(0, str(MODELS_DIR))

import backtest as bt  # noqa: E402
import blend_calibration as bc  # noqa: E402
import markets_2way as m2w  # noqa: E402

SCHEMA_VERSION: str = "outlook_calibration_v3.2.0"
HOLDOUT_CUT_UTC: str = "2025-02-02T17:30:00Z"
DEFAULT_BOOTSTRAP_SAMPLES: int = 1000
MIN_BOOTSTRAP_SAMPLES: int = 1000
DEFAULT_SEED: int = 20261111
DEFAULT_CI_LEVEL: float = 0.95
MAX_SHARP_AGE_MINUTES: float = 180.0
W_EFFECTIVE_MIN_FOR_BLEND: float = 0.05
NUM_RELIABILITY_BINS: int = 10

SHARP_BOOKS: tuple[str, ...] = ("pinnacle", "smarkets")
PUBLISHED_PROB_SOURCES: tuple[str, ...] = (
    "market_sharp_novig",
    "blend_v3_1",
    "model",
    "base_rate",
)
FOOTBALL_MARKETS_V3_2: tuple[str, ...] = ("1x2", "totals", "btts", "ah")
NFL_MARKETS_V3_2: tuple[str, ...] = ("moneyline",)

CANONICAL_TOTALS_LINE: float = 2.5
CANONICAL_AH_FALLBACK_LINE: float = -0.5

FORBIDDEN_PUBLIC_KEYS_LOWER: frozenset[str] = frozenset(
    {
        "stake",
        "stake_u",
        "kelly",
        "kellyfraction",
        "kelly_fraction",
        "expectededge",
        "expected_edge",
        "ev",
        "value",
        "tier",
        "pick seguro",
        "pick_seguro",
    }
)

DEFAULT_ARTIFACT_PATH: Path = MODELS_DIR / "artifacts" / "outlook_calibration_v3_2.json"
DEFAULT_TS_MIRROR_PATH: Path = WORKTREE_ROOT / "src" / "data" / "prediction" / "outlook_calibration_v3_2.json"
FROZEN_BLEND_WEIGHTS_PATH: Path = WORKTREE_ROOT / "src" / "data" / "prediction" / "blend_weights_v3_1.json"
DEFAULT_REGISTRY_PATH: Path = MODELS_DIR / "artifacts" / "holdout_trial_registry.jsonl"

TRIAL_PHASE_NAME: str = "ola1_b4_outlook_calibration_v3_2"
TRIAL_PRESET_NAME: str = "outlook_calibration_v3_2_frozen_v3_1"
TRIAL_MODEL_VERSION: str = "spacetime_v3.2_outlook_calibration"


class OutlookCalibrationError(ValueError):
    """Error de validación matemática, de esquema o de gobernanza en `outlook_calibration`."""


# ---------------------------------------------------------------------------
# 1. Gobernanza, Anti-Fuga y Paridad SHA-256
# ---------------------------------------------------------------------------


def file_sha256(path: str | Path) -> str:
    p = Path(path)
    return hashlib.sha256(p.read_bytes()).hexdigest()


def enforce_walk_forward_dev_only(eval_split: str, unlock_holdout: bool) -> None:
    """Bloquea cualquier intento de abrir o evaluar `holdout_sealed` (Regla Rectora #2)."""
    if bool(unlock_holdout):
        raise bt.HoldoutSealedError(
            "PROHIBIDO ABRIR EL HOLDOUT CONSUMIDO en v3.2 B4 (`unlock_holdout=False` obligatorio)."
        )
    if str(eval_split).strip() != "walk_forward_dev":
        raise bt.HoldoutSealedError(
            f"PROHIBIDO evaluar fuera de 'walk_forward_dev' en v3.2 B4; recibido eval_split={eval_split!r}."
        )


def assert_no_holdout_events(df: pd.DataFrame, holdout_cut_ts: pd.Timestamp, context: str = "events") -> None:
    if df.empty:
        return
    ts_col = pd.to_datetime(df["ts_event_start"], utc=True)
    if bool((ts_col >= holdout_cut_ts).any()):
        bad = df.loc[ts_col >= holdout_cut_ts].iloc[0]
        raise bt.DataLeakageError(
            f"Fuga hacia holdout_sealed detectada en {context}: event_id={bad.get('event_id')} "
            f"ts_event_start={bad.get('ts_event_start')} >= {holdout_cut_ts.isoformat()}"
        )


def assert_no_forbidden_public_fields(obj: Any, path: str = "root") -> None:
    """Garantiza cero campos de stake, Kelly, EV, value, tier o 'pick seguro' (CONTRACT_OUTLOOK §1.1)."""
    if isinstance(obj, Mapping):
        for raw_k, v in obj.items():
            k_str = str(raw_k)
            if k_str.strip().lower() in FORBIDDEN_PUBLIC_KEYS_LOWER:
                raise OutlookCalibrationError(
                    f"Campo prohibido por CONTRACT_OUTLOOK §1.1 detectado en {path}.{k_str}"
                )
            assert_no_forbidden_public_fields(v, f"{path}.{k_str}")
    elif isinstance(obj, (list, tuple)):
        for idx, item in enumerate(obj):
            assert_no_forbidden_public_fields(item, f"{path}[{idx}]")
    elif isinstance(obj, str):
        if "pick seguro" in obj.lower():
            raise OutlookCalibrationError(f"Texto prohibido 'pick seguro' detectado en {path}")


# ---------------------------------------------------------------------------
# 2. PRNG Determinista `mulberry32` y Primitivas Vectorizadas de Calibración
# ---------------------------------------------------------------------------


def mulberry32_uniforms_range(seed: int, start_step: int, count: int) -> np.ndarray:
    """Genera `count` uniformes en `[0, 1)` desde `start_step` (`>= 1`) con aritmética idéntica
    bit a bit a `clv_report.mulberry32_uniforms` y `createMulberry32` en TypeScript."""
    if count <= 0:
        return np.empty(0, dtype=np.float64)
    if start_step < 1:
        raise OutlookCalibrationError(f"start_step debe ser >= 1; recibido {start_step}")

    mask = np.uint64(0xFFFFFFFF)
    s0 = int(seed) & 0xFFFFFFFF
    if s0 == 0:
        s0 = 0x12345678

    steps = np.arange(start_step, start_step + count, dtype=np.uint64)
    s = (np.uint64(s0) + steps * np.uint64(0x6D2B79F5)) & mask

    a1 = s ^ (s >> np.uint64(15))
    b1 = np.uint64(1) | s
    t = (a1 * b1) & mask

    a2 = t ^ (t >> np.uint64(7))
    b2 = np.uint64(61) | t
    prod2 = (a2 * b2) & mask
    t = ((t + prod2) & mask) ^ t

    out_u32 = (t ^ (t >> np.uint64(14))) & mask
    return out_u32.astype(np.float64) / 4294967296.0


def mulberry32_uniforms(seed: int, count: int) -> np.ndarray:
    return mulberry32_uniforms_range(seed, 1, count)


def quantile_linear_sorted(sorted_arr: np.ndarray, q: float) -> float:
    """Cuantil lineal Type-7 idéntico a `clv_report.quantile_linear_sorted`."""
    n = int(sorted_arr.shape[0])
    if n == 0:
        raise OutlookCalibrationError("No se puede calcular cuantil sobre arreglo vacío.")
    if n == 1:
        return float(sorted_arr[0])
    cq = min(1.0, max(0.0, float(q)))
    pos = cq * (n - 1)
    lo = int(math.floor(pos))
    hi = int(math.ceil(pos))
    frac = pos - lo
    v_lo = float(sorted_arr[lo])
    v_hi = float(sorted_arr[hi])
    return v_lo + frac * (v_hi - v_lo)


def normalize_simplex_rows(probs_mat: np.ndarray) -> np.ndarray:
    arr = np.asarray(probs_mat, dtype=np.float64)
    if arr.ndim != 2 or arr.shape[1] < 2:
        raise OutlookCalibrationError(f"probs_mat debe ser 2D con K>=2; recibido shape={arr.shape}")
    if arr.shape[0] == 0:
        return arr.copy()
    if not np.all(np.isfinite(arr)) or bool(np.any(arr < -1e-12)):
        raise OutlookCalibrationError("probs_mat contiene probabilidades no finitas o negativas.")
    clipped = np.maximum(0.0, arr)
    row_sums = clipped.sum(axis=1, keepdims=True)
    if bool(np.any(row_sums <= 1e-12)):
        raise OutlookCalibrationError("probs_mat contiene filas con suma <= 0.")
    return clipped / row_sums


def compute_categorical_log_loss_vec(probs_mat: np.ndarray, y_vec: np.ndarray) -> np.ndarray:
    """Log-loss categórico por evento: `-ln(clip(p_{i, y_i}, 1e-15, 1.0))`."""
    p_norm = normalize_simplex_rows(probs_mat)
    y_arr = np.asarray(y_vec, dtype=np.int64)
    n, k = p_norm.shape
    if y_arr.shape != (n,):
        raise OutlookCalibrationError(f"y_vec shape={y_arr.shape} incompatible con probs_mat shape={p_norm.shape}")
    if n == 0:
        return np.empty(0, dtype=np.float64)
    if bool(np.any((y_arr < 0) | (y_arr >= k))):
        raise OutlookCalibrationError(f"y_vec contiene índices fuera de [0, {k - 1}].")
    chosen = np.clip(p_norm[np.arange(n), y_arr], 1e-15, 1.0)
    return -np.log(chosen)


def compute_brier_vec(probs_mat: np.ndarray, y_vec: np.ndarray) -> np.ndarray:
    """Brier multiclase/2-vías por evento: `sum_{k=0}^{K-1} (p_{i,k} - I[y_i == k])^2`."""
    p_norm = normalize_simplex_rows(probs_mat)
    y_arr = np.asarray(y_vec, dtype=np.int64)
    n, k = p_norm.shape
    if y_arr.shape != (n,):
        raise OutlookCalibrationError(f"y_vec shape={y_arr.shape} incompatible con probs_mat shape={p_norm.shape}")
    if n == 0:
        return np.empty(0, dtype=np.float64)
    if bool(np.any((y_arr < 0) | (y_arr >= k))):
        raise OutlookCalibrationError(f"y_vec contiene índices fuera de [0, {k - 1}].")
    oh = np.zeros_like(p_norm)
    oh[np.arange(n), y_arr] = 1.0
    return np.sum((p_norm - oh) ** 2, axis=1)


def compute_rps_vec(probs_mat: np.ndarray, y_vec: np.ndarray) -> np.ndarray:
    """Ranked Probability Score (Epstein 1969) exacto en `[0, 1]`:
    `RPS(p, y) = (1 / (K - 1)) * sum_{r=0}^{K-2} (sum_{j<=r} p_j - sum_{j<=r} I[y == j])^2`.
    En K=3 (`1x2` ordenado home, draw, away): media de los 2 cortes acumulados `(H)` y `(H+D)`.
    En K=2 (`totals`, `btts`, `ah`, `moneyline`): `(p_0 - I[y == 0])^2`."""
    p_norm = normalize_simplex_rows(probs_mat)
    y_arr = np.asarray(y_vec, dtype=np.int64)
    n, k = p_norm.shape
    if y_arr.shape != (n,):
        raise OutlookCalibrationError(f"y_vec shape={y_arr.shape} incompatible con probs_mat shape={p_norm.shape}")
    if n == 0:
        return np.empty(0, dtype=np.float64)
    if bool(np.any((y_arr < 0) | (y_arr >= k))):
        raise OutlookCalibrationError(f"y_vec contiene índices fuera de [0, {k - 1}].")
    oh = np.zeros_like(p_norm)
    oh[np.arange(n), y_arr] = 1.0
    cum_p = np.cumsum(p_norm, axis=1)[:, :-1]
    cum_y = np.cumsum(oh, axis=1)[:, :-1]
    return np.mean((cum_p - cum_y) ** 2, axis=1)


def _build_event_reliability_matrices(
    p_norm: np.ndarray,
    y_arr: np.ndarray,
    active_w: np.ndarray,
    n_bins: int = NUM_RELIABILITY_BINS,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Construye estadísticas suficientes por evento `(N, n_bins)` para los `K` resultados de cada partido:
    - `raw_cnt_ev[i, b]`: conteo entero de selecciones del evento `i` en el bin `b` (`sum == N * K`)
    - `w_cnt_ev[i, b]`: peso activo acumulado en el bin `b`
    - `w_psum_ev[i, b]`: `w_i * p_{i,k}` acumulado en el bin `b`
    - `w_ysum_ev[i, b]`: `w_i * I[y_i == k]` acumulado en el bin `b`
    """
    n, k = p_norm.shape
    raw_cnt_ev = np.zeros((n, n_bins), dtype=np.int64)
    w_cnt_ev = np.zeros((n, n_bins), dtype=np.float64)
    w_psum_ev = np.zeros((n, n_bins), dtype=np.float64)
    w_ysum_ev = np.zeros((n, n_bins), dtype=np.float64)
    if n == 0:
        return raw_cnt_ev, w_cnt_ev, w_psum_ev, w_ysum_ev

    oh = np.zeros_like(p_norm)
    oh[np.arange(n), y_arr] = 1.0
    bin_idx = np.clip(np.floor(p_norm * float(n_bins)).astype(np.int64), 0, n_bins - 1)
    rows = np.arange(n, dtype=np.int64)

    for col_k in range(k):
        b_col = bin_idx[:, col_k]
        raw_cnt_ev[rows, b_col] += 1
        w_cnt_ev[rows, b_col] += active_w
        w_psum_ev[rows, b_col] += active_w * p_norm[:, col_k]
        w_ysum_ev[rows, b_col] += active_w * oh[:, col_k]

    return raw_cnt_ev, w_cnt_ev, w_psum_ev, w_ysum_ev


def empty_reliability_bins(n_bins: int = NUM_RELIABILITY_BINS) -> list[dict[str, Any]]:
    return [
        {
            "bin_index": b,
            "p_min": round(b / float(n_bins), 4),
            "p_max": round((b + 1) / float(n_bins), 4),
            "n": 0,
            "mean_pred": None,
            "empirical_freq": None,
            "ci95_low": None,
            "ci95_high": None,
        }
        for b in range(n_bins)
    ]


def evaluate_calibration_with_bootstrap(
    probs_mat: np.ndarray,
    y_vec: np.ndarray,
    *,
    active_weights: np.ndarray | None = None,
    benchmark_ll_vec: np.ndarray | None = None,
    benchmark_is_self: bool = False,
    n_resamples: int = DEFAULT_BOOTSTRAP_SAMPLES,
    seed: int = DEFAULT_SEED,
    ci_level: float = DEFAULT_CI_LEVEL,
    include_bins: bool = True,
) -> dict[str, Any]:
    """Calcula `log_loss`, `brier`, `rps`, `ece`, `delta_ll_vs_benchmark` y la curva de fiabilidad
    de `10` bins (`[0.0, 0.1), ..., [0.9, 1.0]`) con IC 95% bootstrap determinista (`mulberry32`)
    agrupado por partido (conservando dependencia intra-partido entre las `K` selecciones)."""
    if int(n_resamples) < MIN_BOOTSTRAP_SAMPLES:
        raise OutlookCalibrationError(
            f"n_resamples debe ser >= {MIN_BOOTSTRAP_SAMPLES}; recibido {n_resamples}"
        )

    p_norm = normalize_simplex_rows(probs_mat)
    y_arr = np.asarray(y_vec, dtype=np.int64)
    n, k = p_norm.shape
    if y_arr.shape != (n,):
        raise OutlookCalibrationError("Dimensiones incompatibles entre probs_mat e y_vec.")

    if n == 0:
        out_empty: dict[str, Any] = {
            "n": 0,
            "ece": None,
            "ece_ci95": None,
            "log_loss": None,
            "log_loss_ci95": None,
            "brier": None,
            "brier_ci95": None,
            "rps": None,
            "rps_ci95": None,
            "delta_ll_vs_benchmark": None,
            "delta_ll_ci95": None,
            "significance": "no significativa",
        }
        if include_bins:
            out_empty["reliability_bins"] = empty_reliability_bins()
        return out_empty

    if active_weights is None:
        w_arr = np.ones(n, dtype=np.float64)
    else:
        w_arr = np.asarray(active_weights, dtype=np.float64)
        if w_arr.shape != (n,) or not np.all(np.isfinite(w_arr)) or bool(np.any(w_arr <= 0.0)):
            raise OutlookCalibrationError("active_weights debe ser finito y > 0 en cada evento activo.")

    ll_raw = compute_categorical_log_loss_vec(p_norm, y_arr)
    br_raw = compute_brier_vec(p_norm, y_arr)
    rps_raw = compute_rps_vec(p_norm, y_arr)

    if benchmark_is_self or benchmark_ll_vec is None:
        delta_raw = np.zeros(n, dtype=np.float64)
    else:
        bm_arr = np.asarray(benchmark_ll_vec, dtype=np.float64)
        if bm_arr.shape != (n,) or not np.all(np.isfinite(bm_arr)):
            raise OutlookCalibrationError("benchmark_ll_vec inválido o de longitud distinta a probs_mat.")
        delta_raw = ll_raw - bm_arr

    raw_cnt_ev, w_cnt_ev, w_psum_ev, w_ysum_ev = _build_event_reliability_matrices(
        p_norm, y_arr, w_arr, NUM_RELIABILITY_BINS
    )
    if int(raw_cnt_ev.sum()) != n * k:
        raise AssertionError(f"Conservación de bins violada: {int(raw_cnt_ev.sum())} != {n * k}")

    w_sum = float(w_arr.sum())
    ll_hat = float(np.dot(w_arr, ll_raw) / w_sum)
    br_hat = float(np.dot(w_arr, br_raw) / w_sum)
    rps_hat = float(np.dot(w_arr, rps_raw) / w_sum)
    delta_hat = 0.0 if (benchmark_is_self or benchmark_ll_vec is None) else float(np.dot(w_arr, delta_raw) / w_sum)

    bin_n_total = raw_cnt_ev.sum(axis=0)
    bin_w_total = w_cnt_ev.sum(axis=0)
    bin_psum_total = w_psum_ev.sum(axis=0)
    bin_ysum_total = w_ysum_ev.sum(axis=0)
    ece_hat = float(np.sum(np.abs(bin_psum_total - bin_ysum_total)) / (float(k) * w_sum))

    # Matriz compacta (N, 35) para bootstrap BLAS por lotes deterministas de `mulberry32`
    stats_mat = np.column_stack(
        [
            w_arr,
            w_arr * ll_raw,
            w_arr * br_raw,
            w_arr * rps_raw,
            w_arr * delta_raw,
            w_cnt_ev,
            w_psum_ev,
            w_ysum_ev,
        ]
    )

    n_res = int(n_resamples)
    boot_ll = np.empty(n_res, dtype=np.float64)
    boot_br = np.empty(n_res, dtype=np.float64)
    boot_rps = np.empty(n_res, dtype=np.float64)
    boot_delta = np.empty(n_res, dtype=np.float64)
    boot_ece = np.empty(n_res, dtype=np.float64)
    boot_bin_w = np.empty((n_res, NUM_RELIABILITY_BINS), dtype=np.float64) if include_bins else None
    boot_bin_ysum = np.empty((n_res, NUM_RELIABILITY_BINS), dtype=np.float64) if include_bins else None

    batch_size = 200
    for b_start in range(0, n_res, batch_size):
        b_cur = min(batch_size, n_res - b_start)
        step_offset = b_start * n + 1
        unifs = mulberry32_uniforms_range(int(seed), step_offset, b_cur * n)
        idx = np.minimum(n - 1, np.floor(unifs * n).astype(np.int64)).reshape((b_cur, n))
        row_offsets = (np.arange(b_cur, dtype=np.int64) * n)[:, None]
        flat_idx = (row_offsets + idx).ravel()
        w_boot = np.bincount(flat_idx, minlength=b_cur * n).reshape((b_cur, n)).astype(np.float64)

        agg = w_boot @ stats_mat  # (b_cur, 35)
        b_wsum = np.maximum(1e-15, agg[:, 0])
        sl = slice(b_start, b_start + b_cur)
        boot_ll[sl] = agg[:, 1] / b_wsum
        boot_br[sl] = agg[:, 2] / b_wsum
        boot_rps[sl] = agg[:, 3] / b_wsum
        boot_delta[sl] = agg[:, 4] / b_wsum

        b_w_bins = agg[:, 5:15]
        b_p_bins = agg[:, 15:25]
        b_y_bins = agg[:, 25:35]
        boot_ece[sl] = np.sum(np.abs(b_p_bins - b_y_bins), axis=1) / (float(k) * b_wsum)
        if include_bins and boot_bin_w is not None and boot_bin_ysum is not None:
            boot_bin_w[sl] = b_w_bins
            boot_bin_ysum[sl] = b_y_bins

    alpha_half = 0.5 * (1.0 - float(ci_level))
    q_lo = alpha_half
    q_hi = 1.0 - alpha_half

    def _ci_pair(samples: np.ndarray) -> list[float]:
        s_sorted = np.sort(samples)
        return [
            quantile_linear_sorted(s_sorted, q_lo),
            quantile_linear_sorted(s_sorted, q_hi),
        ]

    ll_ci = _ci_pair(boot_ll)
    br_ci = _ci_pair(boot_br)
    rps_ci = _ci_pair(boot_rps)
    ece_ci = _ci_pair(boot_ece)

    if benchmark_is_self or benchmark_ll_vec is None:
        delta_ci = [0.0, 0.0]
        sig_label = "no significativa"
    else:
        delta_ci = _ci_pair(boot_delta)
        is_sig = bool(n >= 2 and (delta_ci[0] > 0.0 or delta_ci[1] < 0.0))
        sig_label = "significativa" if is_sig else "no significativa"

    result: dict[str, Any] = {
        "n": int(n),
        "ece": ece_hat,
        "ece_ci95": ece_ci,
        "log_loss": ll_hat,
        "log_loss_ci95": ll_ci,
        "brier": br_hat,
        "brier_ci95": br_ci,
        "rps": rps_hat,
        "rps_ci95": rps_ci,
        "delta_ll_vs_benchmark": delta_hat,
        "delta_ll_ci95": delta_ci,
        "significance": sig_label,
    }

    if include_bins and boot_bin_w is not None and boot_bin_ysum is not None:
        bins_out: list[dict[str, Any]] = []
        for b in range(NUM_RELIABILITY_BINS):
            cnt_b = int(bin_n_total[b])
            w_b = float(bin_w_total[b])
            p_min = round(b / float(NUM_RELIABILITY_BINS), 4)
            p_max = round((b + 1) / float(NUM_RELIABILITY_BINS), 4)
            if cnt_b == 0 or w_b <= 0.0:
                bins_out.append(
                    {
                        "bin_index": b,
                        "p_min": p_min,
                        "p_max": p_max,
                        "n": 0,
                        "mean_pred": None,
                        "empirical_freq": None,
                        "ci95_low": None,
                        "ci95_high": None,
                    }
                )
            else:
                mean_p = float(bin_psum_total[b] / w_b)
                emp_f = float(bin_ysum_total[b] / w_b)
                valid_res = boot_bin_w[:, b] > 0.0
                if int(valid_res.sum()) >= 2:
                    emp_boot = np.sort(boot_bin_ysum[valid_res, b] / boot_bin_w[valid_res, b])
                    b_lo = quantile_linear_sorted(emp_boot, q_lo)
                    b_hi = quantile_linear_sorted(emp_boot, q_hi)
                else:
                    b_lo = emp_f
                    b_hi = emp_f
                bins_out.append(
                    {
                        "bin_index": b,
                        "p_min": p_min,
                        "p_max": p_max,
                        "n": cnt_b,
                        "mean_pred": mean_p,
                        "empirical_freq": emp_f,
                        "ci95_low": b_lo,
                        "ci95_high": b_hi,
                    }
                )
        result["reliability_bins"] = bins_out

    return result


# ---------------------------------------------------------------------------
# 3. Escalones Causales (`base_rate`, `model`, `market_sharp_novig`, `blend_v3_1`)
# ---------------------------------------------------------------------------


def compute_causal_base_rate_matrix(
    *,
    fold_keys: np.ndarray,
    ts_event_starts: np.ndarray,
    ts_decisions: np.ndarray,
    outcomes_y: np.ndarray,
    active_weights: np.ndarray,
    n_classes: int,
    global_ts_starts: np.ndarray | None = None,
    global_outcomes_y: np.ndarray | None = None,
    global_active_weights: np.ndarray | None = None,
    default_prior: Sequence[float] | None = None,
    min_league_past: int = 30,
    laplace_alpha: float = 1.0,
) -> np.ndarray:
    """Calcula la frecuencia base empírica estrictamente causal (`ts_event_start < fold_cut_ts`)
    por pliegue temporal, con suavizado de Laplace y fallback al pasado global del deporte."""
    n = len(outcomes_y)
    if n == 0:
        return np.empty((0, n_classes), dtype=np.float64)

    prior = (
        np.asarray(default_prior, dtype=np.float64)
        if default_prior is not None
        else np.full(n_classes, 1.0 / float(n_classes), dtype=np.float64)
    )
    prior = prior / prior.sum()

    out = np.repeat(prior[None, :], n, axis=0)
    unique_folds = sorted(np.unique(fold_keys.astype(str)))

    for fk in unique_folds:
        te_mask = fold_keys.astype(str) == fk
        fold_cut_ts = ts_decisions[te_mask].min()
        tr_mask = (ts_event_starts < fold_cut_ts) & (outcomes_y >= 0) & (active_weights > 0.0)
        n_tr = int(tr_mask.sum())

        if n_tr >= int(min_league_past):
            y_tr = outcomes_y[tr_mask]
            w_tr = active_weights[tr_mask]
            counts = np.array(
                [float(w_tr[y_tr == c].sum()) + float(laplace_alpha) for c in range(n_classes)],
                dtype=np.float64,
            )
            probs = counts / counts.sum()
        elif (
            global_ts_starts is not None
            and global_outcomes_y is not None
            and global_active_weights is not None
        ):
            g_mask = (global_ts_starts < fold_cut_ts) & (global_outcomes_y >= 0) & (global_active_weights > 0.0)
            if int(g_mask.sum()) >= int(min_league_past):
                gy = global_outcomes_y[g_mask]
                gw = global_active_weights[g_mask]
                counts = np.array(
                    [float(gw[gy == c].sum()) + float(laplace_alpha) for c in range(n_classes)],
                    dtype=np.float64,
                )
                probs = counts / counts.sum()
            else:
                probs = prior
        else:
            probs = prior

        out[te_mask] = probs

    return normalize_simplex_rows(out)


def _devig_matrix_by_method(odds_mat: np.ndarray, method: str) -> np.ndarray:
    m = str(method).strip().lower()
    if m == "proportional":
        return bc._devig_matrix_proportional(odds_mat)
    if m == "power":
        return bc._devig_matrix_power(odds_mat)
    if m == "shin":
        return bc._devig_matrix_shin(odds_mat)
    raise OutlookCalibrationError(f"Método de-vig no soportado: {method!r}")


def _compute_walk_forward_causal_blend_probs(
    *,
    fold_keys: np.ndarray,
    ts_event_starts: np.ndarray,
    ts_decisions: np.ndarray,
    p_model_mat: np.ndarray,
    sharp_odds_mat: np.ndarray,
    outcomes_y: np.ndarray,
    active_weights: np.ndarray,
    n0_shrinkage: int = bc.DEFAULT_N0_SHRINKAGE,
) -> np.ndarray:
    """Evalúa de forma estrictamente causal pliegue a pliegue (`ts_event_start < fold_cut_ts`) la mezcla
    logit aprendida solo en el pasado para verificar que `blend_v3_1` no gane por sobreajuste OOF."""
    n = len(outcomes_y)
    if n == 0:
        return np.empty_like(p_model_mat)

    devig_mats = {
        m: _devig_matrix_by_method(sharp_odds_mat, m)
        for m in bc.CORE_DEVIG_METHODS
    }
    devig_raw_ll = {
        m: compute_categorical_log_loss_vec(devig_mats[m], outcomes_y)
        for m in bc.CORE_DEVIG_METHODS
    }

    wf_probs = np.empty_like(p_model_mat, dtype=np.float64)
    for fk in sorted(np.unique(fold_keys.astype(str))):
        te_mask = fold_keys.astype(str) == fk
        fold_cut_ts = ts_decisions[te_mask].min()
        tr_mask = (ts_event_starts < fold_cut_ts) & (outcomes_y >= 0) & (active_weights > 0.0)
        n_tr = int(tr_mask.sum())

        if n_tr >= 50:
            w_tr = active_weights[tr_mask]
            w_tr_sum = float(w_tr.sum())
            best_m_past = min(
                bc.CORE_DEVIG_METHODS,
                key=lambda m: float(np.dot(w_tr, devig_raw_ll[m][tr_mask]) / w_tr_sum),
            )
            p_mod_tr = p_model_mat[tr_mask]
            p_mkt_tr = devig_mats[best_m_past][tr_mask]
            y_tr = outcomes_y[tr_mask]

            best_w_past = 0.0
            best_ll_past = float(np.dot(w_tr, devig_raw_ll[best_m_past][tr_mask]) / w_tr_sum)
            for w_cand in bc.BLEND_WEIGHT_GRID:
                if w_cand == 0.0:
                    continue
                cand_mat = bc._blend_logit_matrix(p_mod_tr, p_mkt_tr, w_cand)
                cand_ll = float(np.dot(w_tr, compute_categorical_log_loss_vec(cand_mat, y_tr)) / w_tr_sum)
                if cand_ll < best_ll_past - 1e-12:
                    best_ll_past = cand_ll
                    best_w_past = float(w_cand)
            w_fold_eff = float(
                bc.shrink_blend_weight(best_w_past, n_tr, n0_shrinkage, bc.BLEND_WEIGHT_STEP)["w_effective"]
            )
        else:
            best_m_past = "power"
            w_fold_eff = 0.0

        p_mkt_te = devig_mats[best_m_past][te_mask]
        wf_probs[te_mask] = (
            p_mkt_te.copy()
            if w_fold_eff <= 0.0
            else bc._blend_logit_matrix(p_model_mat[te_mask], p_mkt_te, w_fold_eff)
        )

    return normalize_simplex_rows(wf_probs)


def decide_published_source_when_sharp_present(
    *,
    frozen_w_effective: float,
    has_pre_decision_sharp_quotes: bool,
    ll_sharp_open: float | None,
    ll_blend_frozen: float | None,
    ll_blend_wf_causal: float | None,
) -> dict[str, Any]:
    """Regla de decisión causal en `walk_forward_dev` (Ficha B4 §3 + CONTRACT_OUTLOOK §2.1):
    Selecciona `'blend_v3_1'` con los pesos congelados de `blend_weights_v3_1.json` únicamente cuando:
      1. `frozen_w_effective > 0.05`
      2. Existen cuotas sharp pre-decisión evaluables en `walk_forward_dev`
      3. `blend_v3_1` supera o iguala a `market_sharp_novig` en `walk_forward_dev` (`ll_blend_frozen <= ll_sharp_open`)
      4. La mejora se sostiene causalmente fuera de muestra (`ll_blend_wf_causal <= ll_sharp_open`)
    En caso contrario selecciona `'market_sharp_novig'`."""
    w_gt = bool(math.isfinite(float(frozen_w_effective)) and float(frozen_w_effective) > W_EFFECTIVE_MIN_FOR_BLEND + 1e-12)

    if not has_pre_decision_sharp_quotes or ll_sharp_open is None or ll_blend_frozen is None or ll_blend_wf_causal is None:
        return {
            "selected_source_when_sharp_present": "market_sharp_novig",
            "fallback_order": ["market_sharp_novig", "blend_v3_1", "model", "base_rate"],
            "w_effective_gt_0_05": w_gt,
            "frozen_blend_beats_or_ties_sharp_open": None,
            "wf_causal_blend_beats_or_ties_sharp_open": None,
            "log_loss_sharp_open": None,
            "log_loss_blend_frozen": None,
            "log_loss_blend_wf_causal": None,
            "decision_reason": (
                "no_pre_decision_sharp_quotes_in_walk_forward_dev_default_sharp_novig"
                if w_gt
                else "w_effective_le_0_05_and_no_pre_decision_sharp_quotes"
            ),
        }

    frozen_ok = bool(float(ll_blend_frozen) <= float(ll_sharp_open) + 1e-12)
    wf_ok = bool(float(ll_blend_wf_causal) <= float(ll_sharp_open) + 1e-12)

    if not w_gt:
        reason = "frozen_w_effective_le_0_05_pure_sharp_novig"
        selected = "market_sharp_novig"
    elif not frozen_ok:
        reason = "frozen_blend_does_not_beat_or_tie_sharp_open_in_dev"
        selected = "market_sharp_novig"
    elif not wf_ok:
        reason = "walk_forward_causal_blend_does_not_beat_or_tie_sharp_open_in_dev"
        selected = "market_sharp_novig"
    else:
        reason = "frozen_and_walk_forward_causal_blend_beats_or_ties_sharp_open"
        selected = "blend_v3_1"

    fallback_order = (
        ["blend_v3_1", "market_sharp_novig", "model", "base_rate"]
        if selected == "blend_v3_1"
        else ["market_sharp_novig", "blend_v3_1", "model", "base_rate"]
    )

    return {
        "selected_source_when_sharp_present": selected,
        "fallback_order": fallback_order,
        "w_effective_gt_0_05": w_gt,
        "frozen_blend_beats_or_ties_sharp_open": frozen_ok,
        "wf_causal_blend_beats_or_ties_sharp_open": wf_ok,
        "log_loss_sharp_open": float(ll_sharp_open),
        "log_loss_blend_frozen": float(ll_blend_frozen),
        "log_loss_blend_wf_causal": float(ll_blend_wf_causal),
        "decision_reason": reason,
    }


def _compute_causal_dc_rho_vector(soc_dev: pd.DataFrame) -> np.ndarray:
    """Ajusta `dc_rho` por `(league, fold_key)` exclusivamente con partidos pasados `< fold_cut_ts`."""
    n = len(soc_dev)
    rho_vec = np.full(n, m2w.DEFAULT_DC_RHO, dtype=np.float64)
    if n == 0:
        return rho_vec

    leagues = soc_dev["league"].astype(str).to_numpy()
    folds = soc_dev["fold_key"].astype(str).to_numpy()
    ts_starts = soc_dev["ts_event_start"].to_numpy()
    ts_decs = soc_dev["ts_decision"].to_numpy()
    lam_h = soc_dev["dc_lam_home"].to_numpy(dtype=np.float64)
    lam_a = soc_dev["dc_lam_away"].to_numpy(dtype=np.float64)
    hg = soc_dev["home_score"].to_numpy(dtype=np.float64)
    ag = soc_dev["away_score"].to_numpy(dtype=np.float64)

    for lg in sorted(np.unique(leagues)):
        lg_mask = leagues == lg
        for fk in sorted(np.unique(folds[lg_mask])):
            te_mask = lg_mask & (folds == fk)
            cut_ts = ts_decs[te_mask].min()
            tr_mask = lg_mask & (ts_starts < cut_ts)
            rho_fit = m2w._fit_dc_rho_past_only(
                lam_h[tr_mask],
                lam_a[tr_mask],
                hg[tr_mask],
                ag[tr_mask],
                default_rho=m2w.DEFAULT_DC_RHO,
            )
            rho_vec[te_mask] = rho_fit

    return rho_vec


# ---------------------------------------------------------------------------
# 4. Construcción de Segmentos (`liga × mercado` + `GLOBAL::<sport>::<market>`)
# ---------------------------------------------------------------------------


def _build_segment_record(
    *,
    sport: str,
    league: str,
    market: str,
    frozen_w_effective: float,
    frozen_devig_method: str,
    fold_keys: np.ndarray,
    ts_event_starts: np.ndarray,
    ts_decisions: np.ndarray,
    p_model_all: np.ndarray,
    p_base_all: np.ndarray,
    y_all: np.ndarray,
    w_all: np.ndarray,
    has_sharp_open: np.ndarray,
    sharp_open_odds: np.ndarray | None,
    has_closing_ref: np.ndarray,
    closing_ref_odds: np.ndarray | None,
    closing_ref_kind: str,
    empty_odds_benchmark_note: str,
    n_bootstrap: int,
    seed_base: int,
    include_source_bins: bool,
) -> dict[str, Any]:
    """Evalúa todos los escalones disponibles de un segmento `liga × mercado` en `walk_forward_dev`."""
    valid_model_mask = (y_all >= 0) & (w_all > 0.0)
    y_mod = y_all[valid_model_mask]
    w_mod = w_all[valid_model_mask]
    p_mod = p_model_all[valid_model_mask]
    p_bas = p_base_all[valid_model_mask]

    ll_base_vec_all = compute_categorical_log_loss_vec(p_bas, y_mod) if len(y_mod) > 0 else np.empty(0, dtype=np.float64)

    # Escalón `base_rate` sobre todos los eventos activos del segmento
    base_metrics = evaluate_calibration_with_bootstrap(
        p_bas,
        y_mod,
        active_weights=w_mod,
        benchmark_ll_vec=None,
        benchmark_is_self=True,
        n_resamples=n_bootstrap,
        seed=seed_base + 11,
        include_bins=include_source_bins,
    )

    # Escalón `model` sobre todos los eventos activos del segmento (comparado contra `base_rate` cuando no hay cuotas)
    model_vs_base_metrics = evaluate_calibration_with_bootstrap(
        p_mod,
        y_mod,
        active_weights=w_mod,
        benchmark_ll_vec=ll_base_vec_all,
        benchmark_is_self=False,
        n_resamples=n_bootstrap,
        seed=seed_base + 23,
        include_bins=True,
    )

    sharp_open_mask = valid_model_mask & has_sharp_open
    n_sharp_open = int(sharp_open_mask.sum())

    closing_mask = valid_model_mask & has_closing_ref
    n_closing = int(closing_mask.sum())

    sharp_metrics: dict[str, Any] | None = None
    blend_metrics: dict[str, Any] | None = None
    closing_metrics: dict[str, Any] | None = None
    ll_sharp_open_val: float | None = None
    ll_blend_frozen_val: float | None = None
    ll_blend_wf_val: float | None = None

    if n_sharp_open > 0 and sharp_open_odds is not None:
        o_sh = sharp_open_odds[sharp_open_mask]
        y_sh = y_all[sharp_open_mask]
        w_sh = w_all[sharp_open_mask]
        p_mod_sh = p_model_all[sharp_open_mask]
        p_sh_novig = _devig_matrix_by_method(o_sh, frozen_devig_method)
        p_bl_frozen = (
            p_sh_novig.copy()
            if float(frozen_w_effective) <= 0.0
            else bc._blend_logit_matrix(p_mod_sh, p_sh_novig, float(frozen_w_effective))
        )
        p_bl_wf = _compute_walk_forward_causal_blend_probs(
            fold_keys=fold_keys[sharp_open_mask],
            ts_event_starts=ts_event_starts[sharp_open_mask],
            ts_decisions=ts_decisions[sharp_open_mask],
            p_model_mat=p_mod_sh,
            sharp_odds_mat=o_sh,
            outcomes_y=y_sh,
            active_weights=w_sh,
        )

        ll_sh_vec = compute_categorical_log_loss_vec(p_sh_novig, y_sh)
        ll_bl_vec = compute_categorical_log_loss_vec(p_bl_frozen, y_sh)
        ll_wf_vec = compute_categorical_log_loss_vec(p_bl_wf, y_sh)
        w_sh_sum = float(w_sh.sum())

        ll_sharp_open_val = float(np.dot(w_sh, ll_sh_vec) / w_sh_sum)
        ll_blend_frozen_val = float(np.dot(w_sh, ll_bl_vec) / w_sh_sum)
        ll_blend_wf_val = float(np.dot(w_sh, ll_wf_vec) / w_sh_sum)

        sharp_metrics = evaluate_calibration_with_bootstrap(
            p_sh_novig,
            y_sh,
            active_weights=w_sh,
            benchmark_ll_vec=ll_sh_vec,
            benchmark_is_self=True,
            n_resamples=n_bootstrap,
            seed=seed_base + 37,
            include_bins=True,
        )
        blend_metrics = evaluate_calibration_with_bootstrap(
            p_bl_frozen,
            y_sh,
            active_weights=w_sh,
            benchmark_ll_vec=ll_sh_vec,
            benchmark_is_self=(float(frozen_w_effective) <= 0.0),
            n_resamples=n_bootstrap,
            seed=seed_base + 53,
            include_bins=True,
        )

    if n_closing > 0 and closing_ref_odds is not None:
        o_cl = closing_ref_odds[closing_mask]
        y_cl = y_all[closing_mask]
        w_cl = w_all[closing_mask]
        p_cl_novig = _devig_matrix_by_method(o_cl, frozen_devig_method)
        closing_metrics = evaluate_calibration_with_bootstrap(
            p_cl_novig,
            y_cl,
            active_weights=w_cl,
            benchmark_ll_vec=None,
            benchmark_is_self=True,
            n_resamples=n_bootstrap,
            seed=seed_base + 71,
            include_bins=include_source_bins,
        )

    decision = decide_published_source_when_sharp_present(
        frozen_w_effective=frozen_w_effective,
        has_pre_decision_sharp_quotes=(n_sharp_open > 0),
        ll_sharp_open=ll_sharp_open_val,
        ll_blend_frozen=ll_blend_frozen_val,
        ll_blend_wf_causal=ll_blend_wf_val,
    )
    selected_src = decision["selected_source_when_sharp_present"]
    fallback_order = decision["fallback_order"]

    # Determinación transparente de las métricas publicadas a nivel de segmento en `walk_forward_dev`
    if n_sharp_open > 0 and sharp_metrics is not None and blend_metrics is not None:
        primary_metrics = blend_metrics if selected_src == "blend_v3_1" else sharp_metrics
        evaluated_source_in_dev = selected_src
        benchmark_note = "pinnacle_sharp_open_novig"
        pre_dec_status = "OBSERVADO"
    elif closing_ref_kind == "nflverse_consensus" and n_closing > 0 and closing_ref_odds is not None:
        # NFL::moneyline: sin cierre sharp histórico; se evalúa el escalón causal pre-decisión `model`
        # comparado directamente contra la línea de consenso `nflverse` llevando "sin cierre sharp"
        y_cl = y_all[closing_mask]
        w_cl = w_all[closing_mask]
        p_mod_cl = p_model_all[closing_mask]
        p_cons_novig = _devig_matrix_by_method(closing_ref_odds[closing_mask], frozen_devig_method)
        ll_cons_vec = compute_categorical_log_loss_vec(p_cons_novig, y_cl)
        primary_metrics = evaluate_calibration_with_bootstrap(
            p_mod_cl,
            y_cl,
            active_weights=w_cl,
            benchmark_ll_vec=ll_cons_vec,
            benchmark_is_self=False,
            n_resamples=n_bootstrap,
            seed=seed_base + 89,
            include_bins=True,
        )
        evaluated_source_in_dev = "model"
        benchmark_note = "nflverse_consensus_novig (sin cierre sharp)"
        pre_dec_status = "DESCONOCIDO"
    elif closing_ref_kind == "pinnacle_close_only" and n_closing > 0 and closing_ref_odds is not None:
        # Ligas Extra en 1x2 donde football-data solo publicó cierre Pinnacle (sin open T-6h):
        # cero fuga post-decisión -> evaluamos `model` pre-decisión contra `pinnacle_closing_novig`
        y_cl = y_all[closing_mask]
        w_cl = w_all[closing_mask]
        p_mod_cl = p_model_all[closing_mask]
        p_pin_cl = _devig_matrix_by_method(closing_ref_odds[closing_mask], frozen_devig_method)
        ll_pin_cl_vec = compute_categorical_log_loss_vec(p_pin_cl, y_cl)
        primary_metrics = evaluate_calibration_with_bootstrap(
            p_mod_cl,
            y_cl,
            active_weights=w_cl,
            benchmark_ll_vec=ll_pin_cl_vec,
            benchmark_is_self=False,
            n_resamples=n_bootstrap,
            seed=seed_base + 97,
            include_bins=True,
        )
        evaluated_source_in_dev = "model"
        benchmark_note = "pinnacle_closing_novig (sin cuota sharp open pre-decision en historical_fd)"
        pre_dec_status = "DESCONOCIDO"
    else:
        # Mercados sin cuotas históricas en el dataset (`btts`, `totals`/`ah` en ligas Extra):
        # evaluamos `model` vs `base_rate` causal sobre goles reales sin inventar ningún precio
        primary_metrics = model_vs_base_metrics
        evaluated_source_in_dev = "model"
        benchmark_note = empty_odds_benchmark_note
        pre_dec_status = "DESCONOCIDO"

    if closing_ref_kind == "nflverse_consensus":
        sharp_closing_status = "sin cierre sharp"
    elif n_closing > 0:
        sharp_closing_status = "OBSERVADO"
    else:
        sharp_closing_status = "DESCONOCIDO"

    def _compact_or_full(m_dict: dict[str, Any] | None) -> dict[str, Any] | None:
        if m_dict is None:
            return None
        if include_source_bins:
            return m_dict
        return {k: v for k, v in m_dict.items() if k != "reliability_bins"}

    sources_block: dict[str, Any] = {
        "market_sharp_novig": _compact_or_full(sharp_metrics),
        "blend_v3_1": _compact_or_full(blend_metrics),
        "model": _compact_or_full(model_vs_base_metrics),
        "base_rate": _compact_or_full(base_metrics),
    }
    if closing_ref_kind == "nflverse_consensus":
        sources_block["nflverse_consensus_novig_sin_cierre_sharp"] = _compact_or_full(closing_metrics)
    else:
        sources_block["pinnacle_closing_novig"] = _compact_or_full(closing_metrics)

    return {
        "sport": sport,
        "league": league,
        "market": market,
        "selected_source_when_sharp_present": selected_src,
        "fallback_order": fallback_order,
        "evaluated_source_in_dev": evaluated_source_in_dev,
        "benchmark_note": benchmark_note,
        "sharp_closing_status": sharp_closing_status,
        "frozen_w_effective": float(frozen_w_effective),
        "frozen_devig_method": frozen_devig_method,
        "coverage_epistemic": {
            "pre_decision_sharp_quotes": pre_dec_status,
            "sharp_closing_quotes": sharp_closing_status,
            "model_probs": "OBSERVADO",
            "match_outcomes": "OBSERVADO",
        },
        "n": primary_metrics["n"],
        "ece": primary_metrics["ece"],
        "ece_ci95": primary_metrics["ece_ci95"],
        "log_loss": primary_metrics["log_loss"],
        "log_loss_ci95": primary_metrics["log_loss_ci95"],
        "brier": primary_metrics["brier"],
        "brier_ci95": primary_metrics["brier_ci95"],
        "rps": primary_metrics["rps"],
        "rps_ci95": primary_metrics["rps_ci95"],
        "delta_ll_vs_benchmark": primary_metrics["delta_ll_vs_benchmark"],
        "delta_ll_ci95": primary_metrics["delta_ll_ci95"],
        "significance": primary_metrics["significance"],
        "reliability_bins": primary_metrics["reliability_bins"],
        "causal_selection_audit": {
            "w_effective_gt_0_05": decision["w_effective_gt_0_05"],
            "frozen_blend_beats_or_ties_sharp_open": decision["frozen_blend_beats_or_ties_sharp_open"],
            "wf_causal_blend_beats_or_ties_sharp_open": decision["wf_causal_blend_beats_or_ties_sharp_open"],
            "log_loss_sharp_open": decision["log_loss_sharp_open"],
            "log_loss_blend_frozen": decision["log_loss_blend_frozen"],
            "log_loss_blend_wf_causal": decision["log_loss_blend_wf_causal"],
            "decision_reason": decision["decision_reason"],
        },
        "sources": sources_block,
    }


# ---------------------------------------------------------------------------
# 5. Registro Append-Only en `holdout_trial_registry.jsonl`
# ---------------------------------------------------------------------------


def append_walk_forward_trial_registry(
    *,
    registry_path: str | Path = DEFAULT_REGISTRY_PATH,
    config_hash: str,
    phase: str = TRIAL_PHASE_NAME,
    preset: str = TRIAL_PRESET_NAME,
    model_version: str = TRIAL_MODEL_VERSION,
    eval_split: str = "walk_forward_dev",
    unlock_holdout: bool = False,
) -> dict[str, Any]:
    """Registra la corrida de calibración publicada en `holdout_trial_registry.jsonl` conservando
    intactas las 29 líneas previas de v3.1 (`eval_split='walk_forward_dev'`, `unlock_holdout=False`).
    Idempotente si la última entrada ya corresponde exactamente a `(phase, config_hash)`."""
    enforce_walk_forward_dev_only(eval_split, unlock_holdout)
    reg_file = Path(registry_path)
    existing_lines: list[str] = []
    entries: list[dict[str, Any]] = []
    if reg_file.exists():
        raw_text = reg_file.read_text(encoding="utf-8")
        existing_lines = [ln for ln in raw_text.splitlines() if ln.strip()]
        entries = [json.loads(ln) for ln in existing_lines]

    if entries:
        last = entries[-1]
        if (
            str(last.get("phase")) == str(phase)
            and str(last.get("config_hash")) == str(config_hash)
            and str(last.get("eval_split")) == "walk_forward_dev"
            and last.get("unlock_holdout") is False
        ):
            return last

    next_seq = (int(entries[-1]["trial_seq"]) + 1) if entries else 1
    prev_distinct = int(entries[-1].get("n_distinct_configs_cumulative", len(entries))) if entries else 0
    seen_hashes = {str(e.get("config_hash")) for e in entries if e.get("config_hash")}
    new_distinct = prev_distinct if str(config_hash) in seen_hashes else (prev_distinct + 1)

    new_entry: dict[str, Any] = {
        "trial_seq": next_seq,
        "timestamp_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00"),
        "phase": str(phase),
        "preset": str(preset),
        "model_version": str(model_version),
        "eval_split": "walk_forward_dev",
        "unlock_holdout": False,
        "config_hash": str(config_hash),
        "execution_delay_minutes": 2.0,
        "historical_delay_alpha": 0.05,
        "n_configs_tested_before_this_call": prev_distinct,
        "n_distinct_configs_cumulative": new_distinct,
    }

    reg_file.parent.mkdir(parents=True, exist_ok=True)
    with reg_file.open("a", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps(new_entry, ensure_ascii=False) + "\n")
    return new_entry


# ---------------------------------------------------------------------------
# 6. Pipeline Principal Reproducible (`run_outlook_calibration_pipeline`)
# ---------------------------------------------------------------------------


def run_outlook_calibration_pipeline(
    *,
    out_artifact_path: str | Path = DEFAULT_ARTIFACT_PATH,
    ts_mirror_path: str | Path | None = DEFAULT_TS_MIRROR_PATH,
    frozen_blend_path: str | Path = FROZEN_BLEND_WEIGHTS_PATH,
    bootstrap_samples: int = DEFAULT_BOOTSTRAP_SAMPLES,
    seed: int = DEFAULT_SEED,
    eval_split: str = "walk_forward_dev",
    unlock_holdout: bool = False,
    record_trial: bool = False,
    registry_path: str | Path = DEFAULT_REGISTRY_PATH,
) -> dict[str, Any]:
    """Ejecuta la calibración publicada `v3.2` estrictamente sobre `walk_forward_dev` y materializa
    `outlook_calibration_v3_2.json` con espejo SHA-256 idéntico para TypeScript."""
    enforce_walk_forward_dev_only(eval_split, unlock_holdout)
    if int(bootstrap_samples) < MIN_BOOTSTRAP_SAMPLES:
        raise OutlookCalibrationError(
            f"bootstrap_samples debe ser >= {MIN_BOOTSTRAP_SAMPLES}; recibido {bootstrap_samples}"
        )

    blend_path = Path(frozen_blend_path)
    if not blend_path.exists():
        raise FileNotFoundError(f"No existe el artefacto congelado {blend_path}")
    frozen_blend_bytes = blend_path.read_bytes()
    frozen_blend_sha256 = hashlib.sha256(frozen_blend_bytes).hexdigest()
    frozen_blend_artifact = json.loads(frozen_blend_bytes.decode("utf-8"))

    # 1. Cargar snapshots de cuotas y universo causal v3.0 aislando `walk_forward_dev` (`< 2025-02-02T17:30:00Z`)
    odds_cfg = bt.BacktestConfig(
        phase=TRIAL_PHASE_NAME,
        preset=TRIAL_PRESET_NAME,
        model_version=TRIAL_MODEL_VERSION,
        eval_split="walk_forward_dev",
        unlock_holdout=False,
        sports=("football", "nfl"),
        markets=("1x2", "moneyline", "ah", "totals", "spread", "btts"),
        bootstrap_samples=int(bootstrap_samples),
        seed=int(seed),
    )
    odds_cfg.validate()
    odds_all = bt._load_odds_snapshots(odds_cfg)

    events_cfg = bt.BacktestConfig(
        phase=TRIAL_PHASE_NAME,
        preset=TRIAL_PRESET_NAME,
        model_version=TRIAL_MODEL_VERSION,
        eval_split="walk_forward_dev",
        unlock_holdout=False,
        sports=("football", "nfl"),
        markets=("1x2", "moneyline"),
        bootstrap_samples=int(bootstrap_samples),
        seed=int(seed),
    )
    raw_events = bt._build_baseline_v3_0_events(events_cfg, odds_all)
    raw_events = raw_events[raw_events["y"].notna()].copy()
    events_checked = bt.verify_events_frame_no_leakage(raw_events)
    dev_df, _sealed_holdout_unused, split_meta = bt.split_walk_forward_and_holdout(
        events_checked, holdout_fraction=events_cfg.holdout_fraction
    )
    n_holdout_untouched = int(len(_sealed_holdout_unused))
    del _sealed_holdout_unused  # Jamás se evalúa ni inspecciona el holdout consumido

    holdout_cut_ts = pd.Timestamp(split_meta["holdout_cut_ts"])
    assert_no_holdout_events(dev_df, holdout_cut_ts, context="dev_df")

    dev_eids = set(dev_df["event_id"].astype(str).unique())
    dev_odds = odds_all[
        (odds_all["ts_event_start"] < holdout_cut_ts) & (odds_all["event_id"].astype(str).isin(dev_eids))
    ].copy()
    assert_no_holdout_events(dev_odds, holdout_cut_ts, context="dev_odds")
    dev_odds["snapshot_stage"] = dev_odds["snapshot_stage"].fillna("").astype(str).str.lower()

    # Verificación estricta anti-fuga sobre todas las cuotas pre-decisión (`snapshot_stage == "open"`)
    dec_ts_by_eid = dict(zip(dev_df["event_id"].astype(str), dev_df["ts_decision"]))
    open_rows = dev_odds[dev_odds["snapshot_stage"] == "open"]
    if not open_rows.empty:
        mapped_dec = open_rows["event_id"].astype(str).map(dec_ts_by_eid)
        leaked_open = open_rows["ts_captured"] > mapped_dec
        if bool(leaked_open.any()):
            bad_r = open_rows.loc[leaked_open].iloc[0]
            raise bt.DataLeakageError(
                f"Fuga temporal en cuota open de event_id={bad_r['event_id']}: ts_captured > ts_decision"
            )

    segments_out: dict[str, dict[str, Any]] = {}
    seg_seed_idx = 0

    # -----------------------------------------------------------------------
    # A. Fútbol (`52,746` partidos en `walk_forward_dev`, 23 ligas × 4 mercados)
    # -----------------------------------------------------------------------
    soc_dev = dev_df[dev_df["sport"] == "football"].copy().reset_index(drop=True)
    soc_odds = dev_odds[dev_odds["sport_canon"] == "football"].copy()

    soc_feats = pd.read_parquet(
        PRED_LAB_ROOT / "data" / "processed" / "features.parquet",
        columns=["match_id", "dc_lam_home", "dc_lam_away"],
    ).drop_duplicates("match_id")
    soc_dev = soc_dev.merge(soc_feats, left_on="raw_event_id", right_on="match_id", how="left")

    lam_h_all = soc_dev["dc_lam_home"].fillna(1.45).to_numpy(dtype=np.float64)
    lam_a_all = soc_dev["dc_lam_away"].fillna(1.15).to_numpy(dtype=np.float64)
    rho_causal_all = _compute_causal_dc_rho_vector(soc_dev)

    eids_soc_all = soc_dev["event_id"].astype(str).tolist()
    folds_soc_all = soc_dev["fold_key"].astype(str).to_numpy()
    ts_st_soc_all = soc_dev["ts_event_start"].to_numpy()
    ts_dc_soc_all = soc_dev["ts_decision"].to_numpy()
    hg_soc_all = soc_dev["home_score"].to_numpy(dtype=np.float64)
    ag_soc_all = soc_dev["away_score"].to_numpy(dtype=np.float64)
    n_soc_all = len(soc_dev)

    # Cuotas sharp (`pinnacle`, `smarkets`) estrictamente pre-decisión (`open`) y cierres sharp (`close`)
    sharp_open_1x2, _ = bc._pivot_market_quotes_for_events(
        soc_odds, "1x2", ("home", "draw", "away"), "open", SHARP_BOOKS
    )
    sharp_close_1x2, _ = bc._pivot_market_quotes_for_events(
        soc_odds, "1x2", ("home", "draw", "away"), "close", SHARP_BOOKS
    )
    sharp_open_tot, sharp_open_tot_lines = bc._pivot_market_quotes_for_events(
        soc_odds, "totals", ("over", "under"), "open", SHARP_BOOKS
    )
    sharp_close_tot, sharp_close_tot_lines = bc._pivot_market_quotes_for_events(
        soc_odds, "totals", ("over", "under"), "close", SHARP_BOOKS
    )
    sharp_open_ah, sharp_open_ah_lines = bc._pivot_market_quotes_for_events(
        soc_odds, "ah", ("home", "away"), "open", SHARP_BOOKS
    )
    sharp_close_ah, sharp_close_ah_lines = bc._pivot_market_quotes_for_events(
        soc_odds, "ah", ("home", "away"), "close", SHARP_BOOKS
    )

    #Vectores globales fútbol por mercado
    # 1) 1x2
    p_mod_soc_1x2 = normalize_simplex_rows(
        soc_dev[["p_model_home", "p_model_draw", "p_model_away"]].to_numpy(dtype=np.float64)
    )
    y_soc_1x2 = soc_dev["y"].to_numpy(dtype=np.int64)
    w_soc_1x2 = np.ones(n_soc_all, dtype=np.float64)
    has_op_1x2_all = np.zeros(n_soc_all, dtype=bool)
    o_op_1x2_all = np.full((n_soc_all, 3), 2.5, dtype=np.float64)
    has_cl_1x2_all = np.zeros(n_soc_all, dtype=bool)
    o_cl_1x2_all = np.full((n_soc_all, 3), 2.5, dtype=np.float64)
    for i, eid in enumerate(eids_soc_all):
        q_op = sharp_open_1x2.get(eid)
        if q_op is not None:
            o_op_1x2_all[i] = q_op
            has_op_1x2_all[i] = True
        q_cl = sharp_close_1x2.get(eid)
        if q_cl is not None:
            o_cl_1x2_all[i] = q_cl
            has_cl_1x2_all[i] = True

    # 2) totals (2.5)
    lines_tot_all = np.full(n_soc_all, CANONICAL_TOTALS_LINE, dtype=np.float64)
    has_op_tot_all = np.zeros(n_soc_all, dtype=bool)
    o_op_tot_all = np.full((n_soc_all, 2), 1.95, dtype=np.float64)
    has_cl_tot_all = np.zeros(n_soc_all, dtype=bool)
    o_cl_tot_all = np.full((n_soc_all, 2), 1.95, dtype=np.float64)
    for i, eid in enumerate(eids_soc_all):
        q_op = sharp_open_tot.get(eid)
        ln_op = sharp_open_tot_lines.get(eid, CANONICAL_TOTALS_LINE)
        if q_op is not None and abs(ln_op - CANONICAL_TOTALS_LINE) <= 1e-6:
            o_op_tot_all[i] = q_op
            has_op_tot_all[i] = True
            lines_tot_all[i] = ln_op
            q_cl = sharp_close_tot.get(eid)
            ln_cl = sharp_close_tot_lines.get(eid, CANONICAL_TOTALS_LINE)
            if q_cl is not None and abs(ln_cl - ln_op) <= 1e-6:
                o_cl_tot_all[i] = q_cl
                has_cl_tot_all[i] = True

    dc_tot_all = m2w._vectorized_dc_2way_settlement_and_probs(
        lam_h_all, lam_a_all, rho_causal_all, lines_tot_all, "totals"
    )
    p_mod_soc_tot = normalize_simplex_rows(dc_tot_all["p_model_mat"])
    _, w_soc_tot, y_soc_tot = m2w._compute_split_line_outcome_targets(
        hg_soc_all, ag_soc_all, lines_tot_all, "totals"
    )

    # 3) btts (0 cuotas históricas en odds_snapshots; evaluado sobre goles reales)
    dc_btts_all = m2w._vectorized_dc_2way_settlement_and_probs(
        lam_h_all, lam_a_all, rho_causal_all, np.zeros(n_soc_all, dtype=np.float64), "btts"
    )
    p_mod_soc_btts = normalize_simplex_rows(dc_btts_all["p_model_mat"])
    _, w_soc_btts, y_soc_btts = m2w._compute_split_line_outcome_targets(
        hg_soc_all, ag_soc_all, np.zeros(n_soc_all, dtype=np.float64), "btts"
    )

    # 4) ah (usa la línea sharp open real cuando existe; línea canónica -0.5 cuando no hay cuotas en la liga)
    lines_ah_all = np.full(n_soc_all, CANONICAL_AH_FALLBACK_LINE, dtype=np.float64)
    has_op_ah_all = np.zeros(n_soc_all, dtype=bool)
    o_op_ah_all = np.full((n_soc_all, 2), 1.95, dtype=np.float64)
    has_cl_ah_all = np.zeros(n_soc_all, dtype=bool)
    o_cl_ah_all = np.full((n_soc_all, 2), 1.95, dtype=np.float64)
    for i, eid in enumerate(eids_soc_all):
        q_op = sharp_open_ah.get(eid)
        ln_op = sharp_open_ah_lines.get(eid)
        if q_op is not None and ln_op is not None and bool(m2w._is_valid_quarter_array(np.array([ln_op]))[0]):
            o_op_ah_all[i] = q_op
            has_op_ah_all[i] = True
            lines_ah_all[i] = float(ln_op)
            q_cl = sharp_close_ah.get(eid)
            ln_cl = sharp_close_ah_lines.get(eid)
            if q_cl is not None and ln_cl is not None and abs(float(ln_cl) - float(ln_op)) <= 1e-6:
                o_cl_ah_all[i] = q_cl
                has_cl_ah_all[i] = True

    dc_ah_all = m2w._vectorized_dc_2way_settlement_and_probs(
        lam_h_all, lam_a_all, rho_causal_all, lines_ah_all, "ah"
    )
    p_mod_soc_ah = normalize_simplex_rows(dc_ah_all["p_model_mat"])
    _, w_soc_ah, y_soc_ah = m2w._compute_split_line_outcome_targets(
        hg_soc_all, ag_soc_all, lines_ah_all, "ah"
    )

    # Pre-calcular `base_rate` causal por liga y mercado
    p_base_soc_1x2 = np.empty_like(p_mod_soc_1x2)
    p_base_soc_tot = np.empty_like(p_mod_soc_tot)
    p_base_soc_btts = np.empty_like(p_mod_soc_btts)
    p_base_soc_ah = np.empty_like(p_mod_soc_ah)

    soc_leagues = sorted(soc_dev["league"].astype(str).unique().tolist())
    leagues_arr = soc_dev["league"].astype(str).to_numpy()

    for lg in soc_leagues:
        lg_mask = leagues_arr == lg
        fk_lg = folds_soc_all[lg_mask]
        ts_st_lg = ts_st_soc_all[lg_mask]
        ts_dc_lg = ts_dc_soc_all[lg_mask]

        p_base_soc_1x2[lg_mask] = compute_causal_base_rate_matrix(
            fold_keys=fk_lg,
            ts_event_starts=ts_st_lg,
            ts_decisions=ts_dc_lg,
            outcomes_y=y_soc_1x2[lg_mask],
            active_weights=w_soc_1x2[lg_mask],
            n_classes=3,
            global_ts_starts=ts_st_soc_all,
            global_outcomes_y=y_soc_1x2,
            global_active_weights=w_soc_1x2,
            default_prior=(0.45, 0.27, 0.28),
        )
        p_base_soc_tot[lg_mask] = compute_causal_base_rate_matrix(
            fold_keys=fk_lg,
            ts_event_starts=ts_st_lg,
            ts_decisions=ts_dc_lg,
            outcomes_y=y_soc_tot[lg_mask],
            active_weights=w_soc_tot[lg_mask],
            n_classes=2,
            global_ts_starts=ts_st_soc_all,
            global_outcomes_y=y_soc_tot,
            global_active_weights=w_soc_tot,
            default_prior=(0.50, 0.50),
        )
        p_base_soc_btts[lg_mask] = compute_causal_base_rate_matrix(
            fold_keys=fk_lg,
            ts_event_starts=ts_st_lg,
            ts_decisions=ts_dc_lg,
            outcomes_y=y_soc_btts[lg_mask],
            active_weights=w_soc_btts[lg_mask],
            n_classes=2,
            global_ts_starts=ts_st_soc_all,
            global_outcomes_y=y_soc_btts,
            global_active_weights=w_soc_btts,
            default_prior=(0.50, 0.50),
        )
        p_base_soc_ah[lg_mask] = compute_causal_base_rate_matrix(
            fold_keys=fk_lg,
            ts_event_starts=ts_st_lg,
            ts_decisions=ts_dc_lg,
            outcomes_y=y_soc_ah[lg_mask],
            active_weights=w_soc_ah[lg_mask],
            n_classes=2,
            global_ts_starts=ts_st_soc_all,
            global_outcomes_y=y_soc_ah,
            global_active_weights=w_soc_ah,
            default_prior=(0.50, 0.50),
        )

        # Construir los 4 segmentos `lg × {1x2, totals, btts, ah}`
        # 1x2
        seg_1x2_frozen = bc.resolve_blend_segment(frozen_blend_artifact, lg, "1x2")["entry"]
        has_lg_op_1x2 = has_op_1x2_all[lg_mask]
        has_lg_cl_1x2 = has_cl_1x2_all[lg_mask]
        closing_kind_1x2 = "pinnacle_close" if bool(has_lg_op_1x2.any()) else "pinnacle_close_only"
        seg_seed_idx += 1
        segments_out[f"{lg}::1x2"] = _build_segment_record(
            sport="football",
            league=lg,
            market="1x2",
            frozen_w_effective=float(seg_1x2_frozen.get("w_effective", 0.0)),
            frozen_devig_method=str(seg_1x2_frozen.get("best_devig_method", "power")),
            fold_keys=fk_lg,
            ts_event_starts=ts_st_lg,
            ts_decisions=ts_dc_lg,
            p_model_all=p_mod_soc_1x2[lg_mask],
            p_base_all=p_base_soc_1x2[lg_mask],
            y_all=y_soc_1x2[lg_mask],
            w_all=w_soc_1x2[lg_mask],
            has_sharp_open=has_lg_op_1x2,
            sharp_open_odds=o_op_1x2_all[lg_mask] if bool(has_lg_op_1x2.any()) else None,
            has_closing_ref=has_lg_cl_1x2,
            closing_ref_odds=o_cl_1x2_all[lg_mask] if bool(has_lg_cl_1x2.any()) else None,
            closing_ref_kind=closing_kind_1x2,
            empty_odds_benchmark_note="causal_base_rate_no_historical_1x2_odds",
            n_bootstrap=int(bootstrap_samples),
            seed_base=int(seed) + 1000 * seg_seed_idx,
            include_source_bins=False,
        )

        # totals (2.5)
        seg_tot_frozen = bc.resolve_blend_segment(frozen_blend_artifact, lg, "totals")["entry"]
        has_lg_op_tot = has_op_tot_all[lg_mask]
        has_lg_cl_tot = has_cl_tot_all[lg_mask]
        seg_seed_idx += 1
        segments_out[f"{lg}::totals"] = _build_segment_record(
            sport="football",
            league=lg,
            market="totals",
            frozen_w_effective=float(seg_tot_frozen.get("w_effective", 0.0)),
            frozen_devig_method=str(seg_tot_frozen.get("best_devig_method", "power")),
            fold_keys=fk_lg,
            ts_event_starts=ts_st_lg,
            ts_decisions=ts_dc_lg,
            p_model_all=p_mod_soc_tot[lg_mask],
            p_base_all=p_base_soc_tot[lg_mask],
            y_all=y_soc_tot[lg_mask],
            w_all=w_soc_tot[lg_mask],
            has_sharp_open=has_lg_op_tot,
            sharp_open_odds=o_op_tot_all[lg_mask] if bool(has_lg_op_tot.any()) else None,
            has_closing_ref=has_lg_cl_tot,
            closing_ref_odds=o_cl_tot_all[lg_mask] if bool(has_lg_cl_tot.any()) else None,
            closing_ref_kind="pinnacle_close",
            empty_odds_benchmark_note=(
                "causal_base_rate_totals_2_5 (sin cuotas historicas totals en esta liga; "
                "evaluado model DC vs base_rate causal sobre goles reales)"
            ),
            n_bootstrap=int(bootstrap_samples),
            seed_base=int(seed) + 1000 * seg_seed_idx,
            include_source_bins=False,
        )

        # btts
        seg_seed_idx += 1
        segments_out[f"{lg}::btts"] = _build_segment_record(
            sport="football",
            league=lg,
            market="btts",
            frozen_w_effective=0.0,
            frozen_devig_method="power",
            fold_keys=fk_lg,
            ts_event_starts=ts_st_lg,
            ts_decisions=ts_dc_lg,
            p_model_all=p_mod_soc_btts[lg_mask],
            p_base_all=p_base_soc_btts[lg_mask],
            y_all=y_soc_btts[lg_mask],
            w_all=w_soc_btts[lg_mask],
            has_sharp_open=np.zeros(int(lg_mask.sum()), dtype=bool),
            sharp_open_odds=None,
            has_closing_ref=np.zeros(int(lg_mask.sum()), dtype=bool),
            closing_ref_odds=None,
            closing_ref_kind="none",
            empty_odds_benchmark_note=(
                "causal_base_rate_btts (sin cuotas historicas BTTS en odds_snapshots; "
                "evaluado model DC vs base_rate causal sobre goles reales)"
            ),
            n_bootstrap=int(bootstrap_samples),
            seed_base=int(seed) + 1000 * seg_seed_idx,
            include_source_bins=False,
        )

        # ah
        seg_ah_frozen = bc.resolve_blend_segment(frozen_blend_artifact, lg, "ah")["entry"]
        has_lg_op_ah = has_op_ah_all[lg_mask]
        has_lg_cl_ah = has_cl_ah_all[lg_mask]
        seg_seed_idx += 1
        segments_out[f"{lg}::ah"] = _build_segment_record(
            sport="football",
            league=lg,
            market="ah",
            frozen_w_effective=float(seg_ah_frozen.get("w_effective", 0.0)),
            frozen_devig_method=str(seg_ah_frozen.get("best_devig_method", "power")),
            fold_keys=fk_lg,
            ts_event_starts=ts_st_lg,
            ts_decisions=ts_dc_lg,
            p_model_all=p_mod_soc_ah[lg_mask],
            p_base_all=p_base_soc_ah[lg_mask],
            y_all=y_soc_ah[lg_mask],
            w_all=w_soc_ah[lg_mask],
            has_sharp_open=has_lg_op_ah,
            sharp_open_odds=o_op_ah_all[lg_mask] if bool(has_lg_op_ah.any()) else None,
            has_closing_ref=has_lg_cl_ah,
            closing_ref_odds=o_cl_ah_all[lg_mask] if bool(has_lg_cl_ah.any()) else None,
            closing_ref_kind="pinnacle_close",
            empty_odds_benchmark_note=(
                "causal_base_rate_ah_minus_0_5 (sin cuotas historicas AH en esta liga; "
                "evaluado model DC vs base_rate causal en linea canonica -0.5)"
            ),
            n_bootstrap=int(bootstrap_samples),
            seed_base=int(seed) + 1000 * seg_seed_idx,
            include_source_bins=False,
        )

    # Rollups `GLOBAL::football::{1x2,totals,btts,ah}` (CONTRACT_OUTLOOK.md §3 línea 135)
    for g_mkt, p_mod_g, p_bas_g, y_g, w_g, has_op_g, o_op_g, has_cl_g, o_cl_g, bm_empty in [
        (
            "1x2",
            p_mod_soc_1x2,
            p_base_soc_1x2,
            y_soc_1x2,
            w_soc_1x2,
            has_op_1x2_all,
            o_op_1x2_all,
            has_cl_1x2_all,
            o_cl_1x2_all,
            "causal_base_rate_1x2",
        ),
        (
            "totals",
            p_mod_soc_tot,
            p_base_soc_tot,
            y_soc_tot,
            w_soc_tot,
            has_op_tot_all,
            o_op_tot_all,
            has_cl_tot_all,
            o_cl_tot_all,
            "causal_base_rate_totals_2_5",
        ),
        (
            "btts",
            p_mod_soc_btts,
            p_base_soc_btts,
            y_soc_btts,
            w_soc_btts,
            np.zeros(n_soc_all, dtype=bool),
            None,
            np.zeros(n_soc_all, dtype=bool),
            None,
            (
                "causal_base_rate_btts (sin cuotas historicas BTTS en odds_snapshots; "
                "evaluado model DC vs base_rate causal sobre goles reales)"
            ),
        ),
        (
            "ah",
            p_mod_soc_ah,
            p_base_soc_ah,
            y_soc_ah,
            w_soc_ah,
            has_op_ah_all,
            o_op_ah_all,
            has_cl_ah_all,
            o_cl_ah_all,
            "causal_base_rate_ah_minus_0_5",
        ),
    ]:
        seg_seed_idx += 1
        segments_out[f"GLOBAL::football::{g_mkt}"] = _build_segment_record(
            sport="football",
            league="GLOBAL",
            market=g_mkt,
            frozen_w_effective=0.0,
            frozen_devig_method="power",
            fold_keys=folds_soc_all,
            ts_event_starts=ts_st_soc_all,
            ts_decisions=ts_dc_soc_all,
            p_model_all=p_mod_g,
            p_base_all=p_bas_g,
            y_all=y_g,
            w_all=w_g,
            has_sharp_open=has_op_g,
            sharp_open_odds=o_op_g if (o_op_g is not None and bool(has_op_g.any())) else None,
            has_closing_ref=has_cl_g,
            closing_ref_odds=o_cl_g if (o_cl_g is not None and bool(has_cl_g.any())) else None,
            closing_ref_kind="pinnacle_close" if bool(has_cl_g.any()) else "none",
            empty_odds_benchmark_note=bm_empty,
            n_bootstrap=int(bootstrap_samples),
            seed_base=int(seed) + 1000 * seg_seed_idx,
            include_source_bins=True,
        )

    # -----------------------------------------------------------------------
    # B. NFL (`3,903` eventos en `walk_forward_dev`, `moneyline` vs consenso `nflverse` "sin cierre sharp")
    # -----------------------------------------------------------------------
    nfl_dev = dev_df[dev_df["sport"] == "nfl"].copy().reset_index(drop=True)
    nfl_odds = dev_odds[dev_odds["sport_canon"] == "nfl"].copy()

    n_nfl = len(nfl_dev)
    eids_nfl = nfl_dev["event_id"].astype(str).tolist()
    folds_nfl = nfl_dev["fold_key"].astype(str).to_numpy()
    ts_st_nfl = nfl_dev["ts_event_start"].to_numpy()
    ts_dc_nfl = nfl_dev["ts_decision"].to_numpy()
    h_sc_nfl = nfl_dev["home_score"].to_numpy(dtype=np.float64)
    a_sc_nfl = nfl_dev["away_score"].to_numpy(dtype=np.float64)

    nfl_sharp_open_ml, _ = bc._pivot_market_quotes_for_events(
        nfl_odds, "moneyline", ("home", "away"), "open", SHARP_BOOKS
    )
    nfl_cons_ml, _ = bc._pivot_market_quotes_for_events(
        nfl_odds, "moneyline", ("home", "away"), "close", ("nflverse",)
    )

    p_mod_nfl_ml = normalize_simplex_rows(
        nfl_dev[["p_model_home", "p_model_away"]].to_numpy(dtype=np.float64)
    )
    y_nfl_ml = np.full(n_nfl, -1, dtype=np.int64)
    w_nfl_ml = np.zeros(n_nfl, dtype=np.float64)
    has_nfl_sharp_op = np.zeros(n_nfl, dtype=bool)
    o_nfl_sharp_op = np.full((n_nfl, 2), 1.91, dtype=np.float64)
    has_nfl_cons = np.zeros(n_nfl, dtype=bool)
    o_nfl_cons = np.full((n_nfl, 2), 1.91, dtype=np.float64)

    for i, eid in enumerate(eids_nfl):
        if abs(h_sc_nfl[i] - a_sc_nfl[i]) > 1e-9:
            y_nfl_ml[i] = 0 if h_sc_nfl[i] > a_sc_nfl[i] else 1
            w_nfl_ml[i] = 1.0
        q_sh = nfl_sharp_open_ml.get(eid)
        if q_sh is not None:
            o_nfl_sharp_op[i] = q_sh
            has_nfl_sharp_op[i] = True
        q_cons = nfl_cons_ml.get(eid)
        if q_cons is not None:
            o_nfl_cons[i] = q_cons
            has_nfl_cons[i] = True

    p_base_nfl_ml = compute_causal_base_rate_matrix(
        fold_keys=folds_nfl,
        ts_event_starts=ts_st_nfl,
        ts_decisions=ts_dc_nfl,
        outcomes_y=y_nfl_ml,
        active_weights=w_nfl_ml,
        n_classes=2,
        default_prior=(0.56, 0.44),
    )

    nfl_seg_frozen = bc.resolve_blend_segment(frozen_blend_artifact, "NFL", "moneyline")["entry"]
    seg_seed_idx += 1
    nfl_ml_record = _build_segment_record(
        sport="nfl",
        league="NFL",
        market="moneyline",
        frozen_w_effective=float(nfl_seg_frozen.get("w_effective", 0.05)),
        frozen_devig_method=str(nfl_seg_frozen.get("best_devig_method", "power")),
        fold_keys=folds_nfl,
        ts_event_starts=ts_st_nfl,
        ts_decisions=ts_dc_nfl,
        p_model_all=p_mod_nfl_ml,
        p_base_all=p_base_nfl_ml,
        y_all=y_nfl_ml,
        w_all=w_nfl_ml,
        has_sharp_open=has_nfl_sharp_op,
        sharp_open_odds=o_nfl_sharp_op if bool(has_nfl_sharp_op.any()) else None,
        has_closing_ref=has_nfl_cons,
        closing_ref_odds=o_nfl_cons if bool(has_nfl_cons.any()) else None,
        closing_ref_kind="nflverse_consensus",
        empty_odds_benchmark_note="nflverse_consensus_novig (sin cierre sharp)",
        n_bootstrap=int(bootstrap_samples),
        seed_base=int(seed) + 1000 * seg_seed_idx,
        include_source_bins=True,
    )
    # También auditar explícitamente la mezcla congelada w=0.05 sobre el consenso nflverse ("sin cierre sharp")
    valid_nfl_cons = (y_nfl_ml >= 0) & (w_nfl_ml > 0.0) & has_nfl_cons
    if bool(valid_nfl_cons.any()):
        p_cons_nv = _devig_matrix_by_method(
            o_nfl_cons[valid_nfl_cons], str(nfl_seg_frozen.get("best_devig_method", "power"))
        )
        p_nfl_blend_cons = bc._blend_logit_matrix(
            p_mod_nfl_ml[valid_nfl_cons],
            p_cons_nv,
            float(nfl_seg_frozen.get("w_effective", 0.05)),
        )
        ll_cons_nv = compute_categorical_log_loss_vec(p_cons_nv, y_nfl_ml[valid_nfl_cons])
        nfl_ml_record["sources"]["blend_v3_1_on_nflverse_sin_cierre_sharp"] = evaluate_calibration_with_bootstrap(
            p_nfl_blend_cons,
            y_nfl_ml[valid_nfl_cons],
            active_weights=w_nfl_ml[valid_nfl_cons],
            benchmark_ll_vec=ll_cons_nv,
            benchmark_is_self=False,
            n_resamples=int(bootstrap_samples),
            seed=int(seed) + 1000 * seg_seed_idx + 131,
            include_bins=True,
        )

    segments_out["NFL::moneyline"] = nfl_ml_record
    nfl_global_copy = json.loads(json.dumps(nfl_ml_record))
    nfl_global_copy["league"] = "GLOBAL"
    segments_out["GLOBAL::nfl::moneyline"] = nfl_global_copy

    ordered_segments = {k: segments_out[k] for k in sorted(segments_out.keys())}
    non_global_keys = [k for k in ordered_segments if not k.startswith("GLOBAL::")]
    blend_selected_keys = sorted(
        k
        for k in non_global_keys
        if ordered_segments[k]["selected_source_when_sharp_present"] == "blend_v3_1"
    )
    sharp_selected_keys = sorted(
        k
        for k in non_global_keys
        if ordered_segments[k]["selected_source_when_sharp_present"] == "market_sharp_novig"
    )

    artifact: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "eval_split": "walk_forward_dev",
        "holdout_cut_utc": HOLDOUT_CUT_UTC,
        "holdout_sealed_untouched": True,
        "bootstrap_samples": int(bootstrap_samples),
        "seed": int(seed),
        "prng": "mulberry32",
        "max_sharp_age_minutes": float(MAX_SHARP_AGE_MINUTES),
        "frozen_blend_weights_sha256": frozen_blend_sha256,
        "split_summary": {
            "n_total_universe": int(split_meta["n_total"]),
            "n_walk_forward_dev": int(len(dev_df)),
            "n_football_dev": int(len(soc_dev)),
            "n_nfl_dev": int(len(nfl_dev)),
            "n_holdout_sealed_untouched": n_holdout_untouched,
        },
        "selection_summary": {
            "n_league_market_segments": len(non_global_keys),
            "n_global_rollups": len(ordered_segments) - len(non_global_keys),
            "n_selected_blend_v3_1": len(blend_selected_keys),
            "n_selected_market_sharp_novig": len(sharp_selected_keys),
            "blend_v3_1_segments": blend_selected_keys,
        },
        "segments": ordered_segments,
    }

    assert_no_forbidden_public_fields(artifact)

    # Serialización determinista UTF-8 LF y espejo idéntico SHA-256
    out_p = Path(out_artifact_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(artifact, ensure_ascii=False, indent=2) + "\n"
    out_p.write_bytes(serialized.encode("utf-8"))

    if ts_mirror_path is not None:
        mirror_p = Path(ts_mirror_path)
        mirror_p.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(out_p, mirror_p)
        if file_sha256(out_p) != file_sha256(mirror_p):
            raise OutlookCalibrationError(
                "Error crítico de paridad SHA-256 entre artefacto Python y espejo TypeScript."
            )

    if record_trial:
        cfg_payload = json.dumps(
            {
                "schema_version": SCHEMA_VERSION,
                "frozen_blend_weights_sha256": frozen_blend_sha256,
                "bootstrap_samples": int(bootstrap_samples),
                "seed": int(seed),
                "max_sharp_age_minutes": float(MAX_SHARP_AGE_MINUTES),
                "w_effective_min_for_blend": float(W_EFFECTIVE_MIN_FOR_BLEND),
            },
            sort_keys=True,
            separators=(",", ":"),
        )
        cfg_hash = hashlib.sha256(cfg_payload.encode("utf-8")).hexdigest()
        append_walk_forward_trial_registry(
            registry_path=registry_path,
            config_hash=cfg_hash,
            eval_split="walk_forward_dev",
            unlock_holdout=False,
        )

    return artifact


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Calibración publicada v3.2 por liga × mercado sobre walk_forward_dev (B4)."
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_ARTIFACT_PATH,
        help="Ruta de salida en services/models/artifacts/outlook_calibration_v3_2.json",
    )
    parser.add_argument(
        "--ts-mirror",
        type=Path,
        default=DEFAULT_TS_MIRROR_PATH,
        help="Ruta espejo idéntica SHA-256 en src/data/prediction/outlook_calibration_v3_2.json",
    )
    parser.add_argument(
        "--bootstrap-samples",
        type=int,
        default=DEFAULT_BOOTSTRAP_SAMPLES,
        help="Número de remuestreos bootstrap deterministas mulberry32 (>= 1000).",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=DEFAULT_SEED,
        help="Semilla fija para mulberry32.",
    )
    parser.add_argument(
        "--record-trial",
        action="store_true",
        help="Registra append-only la evaluación dev en holdout_trial_registry.jsonl.",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    artifact = run_outlook_calibration_pipeline(
        out_artifact_path=args.out,
        ts_mirror_path=args.ts_mirror,
        bootstrap_samples=args.bootstrap_samples,
        seed=args.seed,
        eval_split="walk_forward_dev",
        unlock_holdout=False,
        record_trial=bool(args.record_trial),
    )
    sha_py = file_sha256(args.out)
    sha_ts = file_sha256(args.ts_mirror)
    sel_sum = artifact["selection_summary"]
    print(f"outlook_calibration_v3_2.json generado exitosamente.")
    print(f"  SHA-256 services/models/artifacts : {sha_py}")
    print(f"  SHA-256 src/data/prediction       : {sha_ts}")
    print(
        f"  Segmentos liga×mercado            : {sel_sum['n_league_market_segments']} "
        f"(blend_v3_1={sel_sum['n_selected_blend_v3_1']}, "
        f"market_sharp_novig={sel_sum['n_selected_market_sharp_novig']})"
    )
    print(f"  Segmentos blend_v3_1              : {sel_sum['blend_v3_1_segments']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
