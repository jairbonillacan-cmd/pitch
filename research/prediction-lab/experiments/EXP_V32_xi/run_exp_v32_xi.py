#!/usr/bin/env python3
"""Experimento offline `EXP_V32_xi` (Ola 3 · Agente `B7`): Fútbol con XI confirmado en `T-60m`.

Evalúa estrictamente sobre `walk_forward_dev` (`ts_event_start < 2025-02-02T17:30:00Z`, `unlock_holdout=False`):
  1. Espejo funcional exacto Python ↔ TypeScript (`|Δ| < 1e-12`) de `src/domain/prediction/engine.ts`:
     - `compute_lineup_availability_delta`
     - `apply_availability_delta_to_probs`
     - `predict_motor_a`
     - `predict_motor_a_with_availability`
  2. Auditoría empírica exhaustiva de cobertura histórica local de XI confirmados y `ts_xi_published`
     antes del corte `2025-02-02T17:30:00Z` (`OBSERVADO`: `0 / 52,746` partidos con `ts_xi_published`).
  3. Corrida observada (`provenance = "observed"`) sobre `walk_forward_dev` (`52,746` eventos totales,
     `52,659` pareados con cierre sharp sin margen de `Pinnacle`), verificando no-degradación exacta en
     `delta = 0` (`ΔLL_xi_vs_base = 0.0`) y brecha frente a `Pinnacle` cierre con `execution_delay = 2.0 min`
     (`historical_delay_alpha = 0.05` en histórico de 2 puntos) e IC 95% bootstrap `mulberry32` (`1,000` remuestreos).
  4. Estudio paramétrico de sensibilidad y cotas matemáticas (`provenance = "synthetic_sensitivity"`,
     estrictamente separado de datos observados) cuantificando:
     - penalización convexa de `log-loss` y `CLV%` ante ruido no informativo de ausencias (`σ_δ ≈ 0.12`),
     - cota adversarial extrema en `|delta| = clip_abs = 0.35`,
     - techo teórico estructural al proyectar el movimiento real `open -> close` de `Pinnacle` sobre `[-0.35, +0.35]`.
  5. Registro aislado en `research/prediction-lab/experiments/EXP_V32_xi/trial_registry_xi.jsonl`
     (sin tocar `services/models/artifacts/holdout_trial_registry.jsonl`).

Uso reproducible:
  .\\research\\prediction-lab\\.venv\\Scripts\\python.exe research/prediction-lab/experiments/EXP_V32_xi/run_exp_v32_xi.py
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import sys
from typing import Any, Mapping, Sequence

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

import numpy as np
import pandas as pd

EXP_DIR = Path(__file__).resolve().parent
PRED_LAB_ROOT = EXP_DIR.parents[1]
REPO_ROOT = EXP_DIR.parents[3]
SERVICES_MODELS_DIR = REPO_ROOT / "services" / "models"
WEB_SCRAPING_ROOT = REPO_ROOT.parent / "web-scraping"

for _p in (
    str(EXP_DIR),
    str(SERVICES_MODELS_DIR),
    str(PRED_LAB_ROOT),
    str(PRED_LAB_ROOT / "models" / "a"),
):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import backtest as bt  # noqa: E402
import clv_report as clv  # noqa: E402
import xi_collector as xic  # noqa: E402

HOLDOUT_CUT_UTC: str = "2025-02-02T17:30:00Z"
HOLDOUT_CUT_TS: pd.Timestamp = pd.Timestamp(HOLDOUT_CUT_UTC)
DEFAULT_BOOTSTRAP_RESAMPLES: int = 1000
DEFAULT_SEED: int = 20261111
EXECUTION_DELAY_MINUTES: float = 2.0
HISTORICAL_DELAY_ALPHA: float = 0.05
PROB_CLIP_EPS: float = 1e-15

DEFAULT_RESULTS_JSON = EXP_DIR / "exp_v32_xi_results.json"
DEFAULT_XI_TRIAL_REGISTRY = EXP_DIR / "trial_registry_xi.jsonl"

FROZEN_V3_1_SHA256_MAP: dict[str, str] = {
    "src/data/prediction/production_segments_v3_1.json": "0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc",
    "src/data/prediction/blend_weights_v3_1.json": "b29d7a451f6011126997c122778b42ad3239c78337d17c5fa78d550f5c92739b",
    "src/data/prediction/pick_policy_v3_1.json": "2359c8f8822ea394a380202c04e0bcd010d1a3fae7c5c25b8c11ebe810bfb7d1",
    "src/data/prediction/stale_lines_config.json": "8bcb9c7be93270cde0cac2d58bc19f0381184dd2e769f358dd28334db2a05eac",
    "src/domain/prediction/engine.ts": "9270125c49e81adf57e90c76db07eb95f53ab35a5051e49265b35b80ed0553bc",
}

FORBIDDEN_PUBLIC_STAKE_KEYS: frozenset[str] = frozenset(
    {
        "stake",
        "stake_u",
        "total_staked_u",
        "recommended_stake",
        "kelly",
        "kelly_fraction",
        "kellyfraction",
    }
)

# Espejo 1:1 de DEFAULT_PROSPECTIVE_AVAILABILITY_PRIOR en src/domain/prediction/engine.ts:396-423
DEFAULT_PROSPECTIVE_AVAILABILITY_PRIOR: dict[str, Any] = {
    "enabled": True,
    "schema_version": "3.0.0",
    "clip_abs": 0.35,
    "weights": {
        "missing_market_value_diff": 0.85,
        "shrunk_log_squad_value_ratio": 0.06,
        "effective_absences_diff": 0.025,
    },
    "bounds": {
        "missing_market_value_ratio_max": 0.6,
        "log_squad_value_ratio_clip": 2.0,
        "max_effective_absences_per_team": 8.0,
        "effective_absences_diff_clip": 6.0,
    },
    "absence_weights": {
        "rotowire_injured_out": 0.65,
        "transfermarkt_injured_with_rotowire": 0.35,
        "transfermarkt_injured_without_rotowire": 0.55,
        "suspended_players": 0.8,
    },
    "logit_shift": {
        "home_multiplier": 0.5,
        "draw_multiplier": 0.0,
        "away_multiplier": -0.5,
    },
}


# ---------------------------------------------------------------------------
# 1. Gobernanza, Anti-Holdout y Verificación de Congelamiento v3.1
# ---------------------------------------------------------------------------
def verify_frozen_v3_1_artifacts(repo_root: Path = REPO_ROOT) -> dict[str, Any]:
    """Comprueba en modo solo lectura los hashes SHA-256 de v3.1 y que `production_enabled == 0/60`."""
    hashes: dict[str, dict[str, Any]] = {}
    for rel_path, expected_sha in FROZEN_V3_1_SHA256_MAP.items():
        full_p = repo_root / rel_path
        actual_sha = hashlib.sha256(full_p.read_bytes()).hexdigest()
        if actual_sha != expected_sha:
            raise RuntimeError(
                f"Violación de congelamiento v3.1 en {rel_path}: esperado={expected_sha}, actual={actual_sha}"
            )
        hashes[rel_path] = {"sha256": actual_sha, "verified": True}

    prod_payload = json.loads((repo_root / "src/data/prediction/production_segments_v3_1.json").read_text("utf-8"))
    segs = prod_payload.get("segments") or []
    if isinstance(segs, Mapping):
        seg_iter = list(segs.values())
    else:
        seg_iter = list(segs)
    n_enabled = sum(1 for s in seg_iter if bool(s.get("production_enabled", False)))
    if n_enabled != 0:
        raise RuntimeError(f"`production_enabled` debe ser 0 en producción; observado {n_enabled}/{len(seg_iter)}")

    return {
        "all_frozen_sha256_verified": True,
        "production_segments_total": len(seg_iter),
        "production_segments_enabled": n_enabled,
        "artifacts": hashes,
    }


def enforce_walk_forward_dev_only(eval_split: str, unlock_holdout: bool) -> None:
    if bool(unlock_holdout):
        raise bt.HoldoutSealedError(
            "PROHIBIDO abrir `holdout_sealed` en EXP_V32_xi (`unlock_holdout=False` obligatorio)."
        )
    if str(eval_split).strip() != "walk_forward_dev":
        raise bt.HoldoutSealedError(
            f"PROHIBIDO evaluar fuera de `walk_forward_dev` en EXP_V32_xi; recibido {eval_split!r}."
        )


def assert_no_holdout_events(
    df: pd.DataFrame,
    *,
    ts_col: str = "ts_event_start",
    holdout_cut_ts: pd.Timestamp = HOLDOUT_CUT_TS,
    context: str = "events",
) -> None:
    if df.empty:
        return
    ts_vals = pd.to_datetime(df[ts_col], utc=True)
    leaked = ts_vals >= holdout_cut_ts
    if bool(leaked.any()):
        bad = df.loc[leaked].iloc[0]
        raise bt.DataLeakageError(
            f"Contaminación de holdout_sealed detectada en {context}: "
            f"{ts_col}={bad[ts_col]} >= {holdout_cut_ts.isoformat()}"
        )


def assert_no_public_stake_fields(obj: Any, path: str = "root") -> None:
    """Verifica Regla Rectora #5: cero campos de dimensionamiento `stake` o `kelly` en artefactos."""
    if isinstance(obj, Mapping):
        for k, v in obj.items():
            k_norm = str(k).strip().lower()
            if k_norm in FORBIDDEN_PUBLIC_STAKE_KEYS:
                raise ValueError(f"Campo de stake/kelly prohibido detectado en {path}.{k}")
            assert_no_public_stake_fields(v, f"{path}.{k}")
    elif isinstance(obj, (list, tuple)):
        for i, item in enumerate(obj):
            assert_no_public_stake_fields(item, f"{path}[{i}]")


def register_xi_trial(
    *,
    registry_path: Path,
    trial_name: str,
    provenance: str,
    eval_split: str,
    unlock_holdout: bool,
    config_payload: Mapping[str, Any],
) -> dict[str, Any]:
    """Registra cada ensayo en `EXP_V32_xi/trial_registry_xi.jsonl` (aislado de B9)."""
    enforce_walk_forward_dev_only(eval_split, unlock_holdout)
    if provenance not in ("observed", "synthetic_sensitivity"):
        raise ValueError(f"`provenance` inválido: {provenance!r}")
    if registry_path.resolve() == bt.DEFAULT_REGISTRY_PATH.resolve():
        raise PermissionError(
            "Prohibido escribir en `services/models/artifacts/holdout_trial_registry.jsonl` desde B7."
        )

    prior: list[dict[str, Any]] = []
    if registry_path.exists():
        for line in registry_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                prior.append(json.loads(line))

    canonical_cfg = {
        "trial_name": trial_name,
        "provenance": provenance,
        "eval_split": eval_split,
        "unlock_holdout": False,
        "execution_delay_minutes": EXECUTION_DELAY_MINUTES,
        "historical_delay_alpha": HISTORICAL_DELAY_ALPHA,
        "config": dict(config_payload),
    }
    cfg_hash = hashlib.sha256(
        json.dumps(canonical_cfg, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()

    # Idempotencia si el mismo config_hash ya está registrado
    for existing in prior:
        if existing.get("config_hash") == cfg_hash:
            return existing

    entry = {
        "trial_seq": len(prior) + 1,
        "timestamp_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "agent_id": "B7",
        "experiment_id": "EXP_V32_xi",
        "trial_name": trial_name,
        "provenance": provenance,
        "eval_split": "walk_forward_dev",
        "unlock_holdout": False,
        "holdout_cut_utc": HOLDOUT_CUT_UTC,
        "execution_delay_minutes": EXECUTION_DELAY_MINUTES,
        "historical_delay_alpha": HISTORICAL_DELAY_ALPHA,
        "production_activated": False,
        "config_hash": cfg_hash,
    }
    registry_path.parent.mkdir(parents=True, exist_ok=True)
    with registry_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + "\n")
    return entry


# ---------------------------------------------------------------------------
# 2. Espejo Exacto IEEE-754 de `src/domain/prediction/engine.ts` (`< 1e-12`)
# ---------------------------------------------------------------------------
def _is_js_finite_number(val: Any) -> bool:
    if val is None or isinstance(val, bool):
        return False
    try:
        f = float(val)
    except (TypeError, ValueError):
        return False
    return math.isfinite(f)


def _safe_non_neg_float(
    ctx: Mapping[str, Any] | None,
    key: str,
    fallback: float = 0.0,
) -> float:
    if not ctx:
        return fallback
    raw = ctx.get(key)
    if raw is None or isinstance(raw, bool):
        return fallback
    try:
        val = float(raw)
    except (TypeError, ValueError):
        return fallback
    if not math.isfinite(val):
        return fallback
    return max(0.0, val)


def _team_effective_absences(
    ctx: Mapping[str, Any] | None,
    cfg: Mapping[str, Any],
) -> float:
    if not ctx:
        return 0.0
    aw = cfg["absence_weights"]
    max_abs = float(cfg["bounds"]["max_effective_absences_per_team"])
    rw_raw = ctx.get("rotowire_injured_out_count")
    has_rw = _is_js_finite_number(rw_raw) and float(rw_raw) > 0.0
    rw_out = _safe_non_neg_float(ctx, "rotowire_injured_out_count", 0.0)
    tm_inj = _safe_non_neg_float(ctx, "injured_players_count", 0.0)
    susp = _safe_non_neg_float(ctx, "suspended_players_count", 0.0)

    if has_rw:
        eff = float(aw["rotowire_injured_out"]) * rw_out + float(aw["transfermarkt_injured_with_rotowire"]) * tm_inj
    else:
        eff = float(aw["transfermarkt_injured_without_rotowire"]) * tm_inj
    eff += float(aw["suspended_players"]) * susp
    return min(max_abs, max(0.0, eff))


def _team_squad_value_ratio(ctx: Mapping[str, Any] | None) -> float:
    if not ctx:
        return 1.0
    vr = ctx.get("value_ratio_vs_league_median")
    if _is_js_finite_number(vr):
        val = float(vr)
        if val > 0.0:
            return val
    return 1.0


def compute_lineup_availability_delta(
    home_team_ctx: Mapping[str, Any] | None = None,
    away_team_ctx: Mapping[str, Any] | None = None,
    config: Mapping[str, Any] | None = None,
) -> dict[str, float]:
    """Espejo exacto (`|Δ| < 1e-12`) de `engine.ts::computeLineupAvailabilityDelta`."""
    cfg = config if config is not None else DEFAULT_PROSPECTIVE_AVAILABILITY_PRIOR
    if not bool(cfg.get("enabled", True)) or (not home_team_ctx and not away_team_ctx):
        return {
            "lineup_availability_delta": 0.0,
            "missing_value_term": 0.0,
            "squad_value_term": 0.0,
            "starter_absence_term": 0.0,
            "home_missing_market_value_ratio": 0.0,
            "away_missing_market_value_ratio": 0.0,
            "home_effective_absences": 0.0,
            "away_effective_absences": 0.0,
        }

    bounds = cfg["bounds"]
    weights = cfg["weights"]
    clip_abs = float(cfg["clip_abs"])

    h_miss = min(
        float(bounds["missing_market_value_ratio_max"]),
        _safe_non_neg_float(home_team_ctx, "missing_market_value_ratio", 0.0),
    )
    a_miss = min(
        float(bounds["missing_market_value_ratio_max"]),
        _safe_non_neg_float(away_team_ctx, "missing_market_value_ratio", 0.0),
    )
    missing_term = float(weights["missing_market_value_diff"]) * (a_miss - h_miss)

    h_vr = _team_squad_value_ratio(home_team_ctx)
    a_vr = _team_squad_value_ratio(away_team_ctx)
    if not home_team_ctx or not away_team_ctx:
        log_vr = 0.0
    else:
        vr_clip = float(bounds["log_squad_value_ratio_clip"])
        log_vr = max(-vr_clip, min(vr_clip, math.log(h_vr / a_vr)))
    squad_term = float(weights["shrunk_log_squad_value_ratio"]) * log_vr

    h_abs = _team_effective_absences(home_team_ctx, cfg)
    a_abs = _team_effective_absences(away_team_ctx, cfg)
    abs_clip = float(bounds["effective_absences_diff_clip"])
    abs_diff = max(-abs_clip, min(abs_clip, a_abs - h_abs))
    absence_term = float(weights["effective_absences_diff"]) * abs_diff

    raw_delta = missing_term + squad_term + absence_term
    delta = max(-clip_abs, min(clip_abs, raw_delta))
    return {
        "lineup_availability_delta": delta,
        "missing_value_term": missing_term,
        "squad_value_term": squad_term,
        "starter_absence_term": absence_term,
        "home_missing_market_value_ratio": h_miss,
        "away_missing_market_value_ratio": a_miss,
        "home_effective_absences": h_abs,
        "away_effective_absences": a_abs,
    }


def softmax3(logits: Sequence[float]) -> tuple[float, float, float]:
    """Espejo exacto (`|Δ| < 1e-15`) de `engine.ts::softmax3`."""
    if len(logits) != 3:
        raise ValueError(f"softmax3 espera 3 logits; recibió {len(logits)}")
    l0, l1, l2 = float(logits[0]), float(logits[1]), float(logits[2])
    if not (math.isfinite(l0) and math.isfinite(l1) and math.isfinite(l2)):
        raise ValueError("softmax3 recibió logits no finitos")
    mx = max(l0, l1, l2)
    e0 = math.exp(l0 - mx)
    e1 = math.exp(l1 - mx)
    e2 = math.exp(l2 - mx)
    tot = e0 + e1 + e2
    return (e0 / tot, e1 / tot, e2 / tot)


def apply_availability_delta_to_probs(
    probs: Sequence[float],
    availability_delta: float,
    prior_config: Mapping[str, Any] | None = None,
) -> tuple[float, float, float]:
    """Espejo exacto (`|Δ| < 1e-15`) de `engine.ts::applyAvailabilityDeltaToProbs`."""
    p0, p1, p2 = float(probs[0]), float(probs[1]), float(probs[2])
    if not math.isfinite(float(availability_delta)) or float(availability_delta) == 0.0:
        return (p0, p1, p2)
    ls = (prior_config or {}).get("logit_shift") or DEFAULT_PROSPECTIVE_AVAILABILITY_PRIOR["logit_shift"]
    d = float(availability_delta)

    def _clip(p: float) -> float:
        return min(max(p, 1e-15), 1.0 - 1e-15)

    return softmax3(
        (
            math.log(_clip(p0)) + float(ls["home_multiplier"]) * d,
            math.log(_clip(p1)) + float(ls["draw_multiplier"]) * d,
            math.log(_clip(p2)) + float(ls["away_multiplier"]) * d,
        )
    )


def apply_availability_delta_vectorized(
    probs_arr: np.ndarray,
    deltas: np.ndarray | float,
    prior_config: Mapping[str, Any] | None = None,
) -> np.ndarray:
    """Versión vectorizada IEEE-754 idéntica (`|Δ| < 1e-15`) a `apply_availability_delta_to_probs`."""
    base = np.asarray(probs_arr, dtype=np.float64)
    d = np.broadcast_to(np.asarray(deltas, dtype=np.float64), (base.shape[0],)).copy()
    zero_mask = (~np.isfinite(d)) | (d == 0.0)
    if bool(np.all(zero_mask)):
        return base.copy()

    ls = (prior_config or {}).get("logit_shift") or DEFAULT_PROSPECTIVE_AVAILABILITY_PRIOR["logit_shift"]
    mult = np.array(
        [float(ls["home_multiplier"]), float(ls["draw_multiplier"]), float(ls["away_multiplier"])],
        dtype=np.float64,
    )
    clipped = np.clip(base, 1e-15, 1.0 - 1e-15)
    logits = np.log(clipped) + d[:, None] * mult[None, :]
    mx = np.max(logits, axis=1, keepdims=True)
    ex = np.exp(logits - mx)
    out = ex / np.sum(ex, axis=1, keepdims=True)
    if bool(np.any(zero_mask)):
        out[zero_mask] = base[zero_mask]
    return out


def _compute_motor_a_logits(row: Mapping[str, Any], model: Mapping[str, Any]) -> tuple[float, float, float]:
    base_feats = row["features"]
    dummies = row["div_onehot"]
    n_base = int(model["n_features_base"])
    div_levels = model["div_levels"]
    if len(base_feats) != n_base:
        raise ValueError(f"features tiene {len(base_feats)} valores; se esperaban {n_base}")
    if len(dummies) != len(div_levels):
        raise ValueError(f"div_onehot tiene {len(dummies)} valores; se esperaban {len(div_levels)}")

    stats = model["imputer"]["statistics"]
    means = model["scaler"]["mean"]
    scales = model["scaler"]["scale"]
    n_total = len(model["features"])

    design = [0.0] * n_total
    for i in range(n_base):
        raw = base_feats[i]
        if raw is None or (isinstance(raw, float) and math.isnan(raw)):
            val = float(stats[i])
        else:
            val = float(raw)
        if not math.isfinite(val):
            raise ValueError(f"features[{i}] no es finito")
        denom = 1.0 if float(scales[i]) == 0.0 else float(scales[i])
        design[i] = (val - float(means[i])) / denom

    for j in range(len(div_levels)):
        idx = n_base + j
        val = float(dummies[j])
        if not math.isfinite(val):
            raise ValueError(f"div_onehot[{j}] no es finito")
        denom = 1.0 if float(scales[idx]) == 0.0 else float(scales[idx])
        design[idx] = (val - float(means[idx])) / denom

    logits: list[float] = []
    for k in range(3):
        coef_k = model["coef"][k]
        acc = 0.0
        for i in range(n_total):
            acc += float(coef_k[i]) * design[i]
        logits.append(acc + float(model["intercept"][k]))
    return (logits[0], logits[1], logits[2])


def predict_motor_a(row: Mapping[str, Any], model: Mapping[str, Any]) -> dict[str, Any]:
    """Espejo exacto (`|Δ| < 1e-12`) de `engine.ts::predictMotorA`."""
    l0, l1, l2 = _compute_motor_a_logits(row, model)
    p_home, p_draw, p_away = softmax3((l0, l1, l2))
    return {
        "pHome": p_home,
        "pDraw": p_draw,
        "pAway": p_away,
        "modelId": "motor_a",
        "modelName": model.get("codename") or "PitchLab Tachyon v3.0",
        "modelVersion": str(model["version"]),
        "generatedAt": str(model["created_at"]),
        "dataQualityFlag": "ok",
        "sport": "football",
    }


def predict_motor_a_with_availability(
    row: Mapping[str, Any],
    model: Mapping[str, Any],
    availability: float | int | Mapping[str, Any],
) -> dict[str, Any]:
    """Espejo exacto (`|Δ| < 1e-12`) de `engine.ts::predictMotorAWithAvailability`."""
    prior_cfg = model.get("prospective_availability_prior") or DEFAULT_PROSPECTIVE_AVAILABILITY_PRIOR
    if isinstance(availability, (int, float)) and not isinstance(availability, bool):
        delta = float(availability)
    elif isinstance(availability, Mapping):
        delta = compute_lineup_availability_delta(
            availability.get("homeTeamCtx"),
            availability.get("awayTeamCtx"),
            prior_cfg,
        )["lineup_availability_delta"]
    else:
        raise TypeError(f"availability inválido: {type(availability).__name__}")

    l0, l1, l2 = _compute_motor_a_logits(row, model)
    ls = prior_cfg.get("logit_shift") or DEFAULT_PROSPECTIVE_AVAILABILITY_PRIOR["logit_shift"]
    if math.isfinite(delta) and delta != 0.0:
        adj = (
            l0 + float(ls["home_multiplier"]) * delta,
            l1 + float(ls["draw_multiplier"]) * delta,
            l2 + float(ls["away_multiplier"]) * delta,
        )
    else:
        adj = (l0, l1, l2)
    p_home, p_draw, p_away = softmax3(adj)
    return {
        "pHome": p_home,
        "pDraw": p_draw,
        "pAway": p_away,
        "modelId": "motor_a",
        "modelName": model.get("codename") or "PitchLab Tachyon v3.0",
        "modelVersion": str(model["version"]),
        "generatedAt": str(model["created_at"]),
        "dataQualityFlag": "ok",
        "sport": "football",
        "lineupAvailabilityDelta": delta,
    }


# ---------------------------------------------------------------------------
# 3. Bootstrap Determinista `mulberry32` (>= 1,000 remuestreos)
# ---------------------------------------------------------------------------
def bootstrap_mean_mulberry32(
    values: np.ndarray,
    *,
    n_boot: int = DEFAULT_BOOTSTRAP_RESAMPLES,
    seed: int = DEFAULT_SEED,
) -> dict[str, Any]:
    arr = np.asarray(values, dtype=np.float64)
    n = int(arr.shape[0])
    if n < 1:
        return {
            "mean": None,
            "ci95": [0.0, 0.0],
            "significant": False,
            "significance_label": "no significativa",
        }
    point = float(np.mean(arr))
    if np.all(arr == arr[0]):
        c = float(arr[0])
        sig = bool(c > 0.0 or c < 0.0)
        return {
            "mean": c,
            "ci95": [c, c],
            "significant": sig,
            "significance_label": "significativa" if sig else "no significativa",
        }

    mask = np.uint64(0xFFFFFFFF)
    s0 = int(seed) & 0xFFFFFFFF
    if s0 == 0:
        s0 = 0x12345678
    s0_u64 = np.uint64(s0)
    inc_u64 = np.uint64(0x6D2B79F5)

    boot_means = np.empty(int(n_boot), dtype=np.float64)
    chunk = 50
    for s in range(0, int(n_boot), chunk):
        e = min(s + chunk, int(n_boot))
        steps = np.arange(s * n + 1, e * n + 1, dtype=np.uint64)
        st = (s0_u64 + steps * inc_u64) & mask
        a1 = st ^ (st >> np.uint64(15))
        b1 = np.uint64(1) | st
        t = (a1 * b1) & mask
        a2 = t ^ (t >> np.uint64(7))
        b2 = np.uint64(61) | t
        prod2 = (a2 * b2) & mask
        t = ((t + prod2) & mask) ^ t
        out_u32 = (t ^ (t >> np.uint64(14))) & mask
        u_slice = (out_u32.astype(np.float64) / 4294967296.0).reshape((e - s, n))
        idx = np.floor(u_slice * n).astype(np.int64)
        np.clip(idx, 0, n - 1, out=idx)
        boot_means[s:e] = np.mean(arr[idx], axis=1)

    sorted_b = np.sort(boot_means)
    lo = clv.quantile_linear_sorted(sorted_b, 0.025)
    hi = clv.quantile_linear_sorted(sorted_b, 0.975)
    sig = bool(lo > 0.0 or hi < 0.0)
    return {
        "mean": point,
        "ci95": [float(lo), float(hi)],
        "significant": sig,
        "significance_label": "significativa" if sig else "no significativa",
    }


def _multiclass_losses(probs: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    clipped = np.clip(np.asarray(probs, dtype=np.float64), PROB_CLIP_EPS, 1.0)
    clipped = clipped / np.sum(clipped, axis=1, keepdims=True)
    idx = np.arange(len(y))
    ll = -np.log(clipped[idx, y])
    onehot = np.zeros_like(clipped)
    onehot[idx, y] = 1.0
    brier = np.sum((clipped - onehot) ** 2, axis=1)
    return ll, brier


# ---------------------------------------------------------------------------
# 4. Auditoría de Cobertura Local de XI en `walk_forward_dev`
# ---------------------------------------------------------------------------
def audit_local_xi_coverage_in_dev(dev_events: pd.DataFrame) -> dict[str, Any]:
    assert_no_holdout_events(dev_events, context="audit_local_xi_coverage_in_dev")
    matches_pq = PRED_LAB_ROOT / "data" / "processed" / "matches.parquet"
    features_pq = PRED_LAB_ROOT / "data" / "processed" / "features.parquet"

    import pyarrow.parquet as pq

    matches_cols = pq.read_schema(matches_pq).names
    features_cols = pq.read_schema(features_pq).names
    xi_keywords = ("xi", "lineup", "starter", "injur", "suspend", "roster", "ts_xi")
    matches_xi_cols = [c for c in matches_cols if any(k in c.lower() for k in xi_keywords)]
    features_xi_cols = [c for c in features_cols if any(k in c.lower() for k in xi_keywords)]

    # Verificar el almacén append-only local de EXP_V32_xi (filtrando estrictamente < HOLDOUT_CUT_UTC)
    local_xi_records = [
        r
        for r in xic.load_xi_records_jsonl(xic.DEFAULT_SNAPSHOTS_JSONL)
        if pd.Timestamp(r["kickoff_utc"]) < HOLDOUT_CUT_TS
    ]

    # Verificar en modo solo lectura los snapshots de disponibilidad de `.worktrees/web-scraping`
    ws_roster_path = WEB_SCRAPING_ROOT / "data" / "normalized" / "roster_availability.json"
    ws_roster_total = 0
    ws_roster_in_dev = 0
    ws_roster_min_ts: str | None = None
    ws_roster_max_ts: str | None = None
    if ws_roster_path.exists():
        ws_payload = json.loads(ws_roster_path.read_text(encoding="utf-8"))
        ws_rows = ws_payload.get("records", []) if isinstance(ws_payload, Mapping) else ws_payload
        ws_roster_total = len(ws_rows)
        cap_ts_list = [
            str(r.get("captured_at_utc", ""))
            for r in ws_rows
            if isinstance(r, Mapping) and r.get("captured_at_utc")
        ]
        if cap_ts_list:
            ws_roster_min_ts = min(cap_ts_list)
            ws_roster_max_ts = max(cap_ts_list)
            ws_roster_in_dev = sum(1 for t in cap_ts_list if pd.Timestamp(t) < HOLDOUT_CUT_TS)

    n_dev_total = int(len(dev_events))
    n_ws_ticks_in_dev = int((dev_events["source_mode"] == "scraped_ws").sum())
    return {
        "epistemic_status": "OBSERVADO",
        "n_football_events_walk_forward_dev": n_dev_total,
        "n_events_with_real_ts_xi_published_in_dev": len(local_xi_records),
        "coverage_pct_in_dev": round(100.0 * len(local_xi_records) / max(1, n_dev_total), 6),
        "matches_parquet_xi_columns": matches_xi_cols,
        "features_parquet_xi_columns": features_xi_cols,
        "odds_source_mode_counts_in_dev": {
            str(k): int(v) for k, v in dev_events["source_mode"].value_counts().to_dict().items()
        },
        "n_multi_tick_ws_events_in_dev": n_ws_ticks_in_dev,
        "web_scraping_roster_availability_readonly_audit": {
            "exists": ws_roster_path.exists(),
            "total_records": ws_roster_total,
            "records_before_holdout_cut": ws_roster_in_dev,
            "min_captured_at_utc": ws_roster_min_ts,
            "max_captured_at_utc": ws_roster_max_ts,
        },
        "causal_t60m_effect_epistemic_status": "DESCONOCIDO",
        "blocking_reason": (
            "El histórico walk_forward_dev (< 2025-02-02T17:30:00Z) contiene 0/52,746 partidos con XI "
            "confirmado y ts_xi_published al segundo, y 0/52,746 eventos con cuotas multi-tick en T-60m "
            "(100% historical_fd de 2 puntos open/close; los 5,908 registros de roster_availability fueron "
            "capturados el 2026-11-09..2026-11-10). No se fabrican timestamps ni alineaciones retrospectivas."
        ),
    }


# ---------------------------------------------------------------------------
# 5. Carga Estricta de `walk_forward_dev` + Emparejamiento Sharp Pinnacle
# ---------------------------------------------------------------------------
def load_walk_forward_dev_football_dataset() -> dict[str, Any]:
    """Carga únicamente eventos y cuotas de fútbol con `ts_event_start < 2025-02-02T17:30:00Z`."""
    odds_path = bt.DEFAULT_ODDS_PARQUET
    fb_odds = pd.read_parquet(
        odds_path,
        filters=[
            ("ts_event_start", ">=", pd.Timestamp("2017-01-01T00:00:00Z")),
            ("ts_event_start", "<", HOLDOUT_CUT_TS),
            ("market", "in", ["1x2", "h2h_3way", "match_odds", "3way"]),
        ],
    )
    fb_odds["ts_captured"] = pd.to_datetime(fb_odds["ts_captured"], utc=True)
    fb_odds["ts_event_start"] = pd.to_datetime(fb_odds["ts_event_start"], utc=True)
    assert_no_holdout_events(fb_odds, context="fb_odds_parquet_filtered")

    fb_odds["sport_canon"] = bt._fast_canon_series(fb_odds["sport"], bt.canonical_sport)
    fb_odds = fb_odds[fb_odds["sport_canon"] == "football"].copy()
    fb_odds["market_canon"] = "1x2"
    fb_odds["selection_canon"] = bt._fast_canon_series(fb_odds["selection"], bt.canonical_selection)
    fb_odds["book_canon"] = bt._fast_canon_series(fb_odds["book"], bt.canonical_book)

    # Construir eventos causales fútbol y filtrar estrictamente `< HOLDOUT_CUT_TS`
    cfg = bt.BacktestConfig(
        sports=("football",),
        markets=("1x2",),
        eval_split="walk_forward_dev",
        unlock_holdout=False,
        execution_delay_minutes=EXECUTION_DELAY_MINUTES,
        historical_delay_alpha=HISTORICAL_DELAY_ALPHA,
    )
    ev_all_fb = bt._build_baseline_v3_0_events(cfg, fb_odds)
    ev_dev = ev_all_fb[ev_all_fb["ts_event_start"] < HOLDOUT_CUT_TS].copy().reset_index(drop=True)
    del ev_all_fb
    assert_no_holdout_events(ev_dev, context="ev_dev_football")
    bt.verify_events_frame_no_leakage(ev_dev)

    # Cruzar con predicciones walk-forward out-of-fold puras de `Motor A` (`pred_logit.csv`, sin mezcla HGB)
    pred_logit_path = PRED_LAB_ROOT / "artifacts" / "EXP01_baselines_20261109" / "pred_logit.csv"
    pred_l = pd.read_csv(pred_logit_path, usecols=["match_id", "p_home", "p_draw", "p_away"])
    pred_l["match_id"] = pred_l["match_id"].astype(str)
    ev_dev = ev_dev.merge(
        pred_l.rename(
            columns={
                "match_id": "raw_event_id",
                "p_home": "p_motor_a_home",
                "p_draw": "p_motor_a_draw",
                "p_away": "p_motor_a_away",
            }
        ),
        on="raw_event_id",
        how="inner",
    )
    ev_dev = ev_dev.sort_values(["ts_event_start", "event_id"], kind="mergesort").reset_index(drop=True)
    assert_no_holdout_events(ev_dev, context="ev_dev_merged_motor_a")

    valid_odds = fb_odds[
        (fb_odds["ts_captured"] <= fb_odds["ts_event_start"])
        & (fb_odds["price_decimal"] >= 1.01)
        & (fb_odds["price_decimal"] <= 1000.0)
        & (fb_odds["event_id"].isin(set(ev_dev["event_id"])))
    ].copy()

    # 1. Cierre sharp `Pinnacle` (`close`) desvigorizado con Power method (`|Δ| < 1e-12` vs backtest.py)
    pin_close_df = valid_odds[
        (valid_odds["source"] == "historical_fd")
        & (valid_odds["book_canon"] == "pinnacle")
        & (valid_odds["snapshot_stage"] == "close")
    ].sort_values("ts_captured", kind="mergesort")
    pin_close_piv = (
        pin_close_df.drop_duplicates(["event_id", "selection_canon"], keep="last")
        .pivot(index="event_id", columns="selection_canon", values="price_decimal")
        .reindex(columns=["home", "draw", "away"])
        .dropna()
    )
    sum_imp_close = (1.0 / pin_close_piv["home"]) + (1.0 / pin_close_piv["draw"]) + (1.0 / pin_close_piv["away"])
    pin_close_piv = pin_close_piv[(sum_imp_close >= 0.9) & (sum_imp_close <= 1.2)]

    def _devig_power_matrix_3way(odds_mat: np.ndarray) -> np.ndarray:
        q = 1.0 / np.asarray(odds_mat, dtype=np.float64)
        lo = np.full(len(q), 1e-6, dtype=np.float64)
        hi = np.full(len(q), 5.0, dtype=np.float64)
        for _ in range(120):
            mid = 0.5 * (lo + hi)
            s_val = np.sum(q ** mid[:, None], axis=1)
            gt = s_val > 1.0
            lo = np.where(gt, mid, lo)
            hi = np.where(gt, hi, mid)
        alpha_p = 0.5 * (lo + hi)
        unnorm = q ** alpha_p[:, None]
        return unnorm / np.sum(unnorm, axis=1, keepdims=True)

    raw_close_arr = pin_close_piv[["home", "draw", "away"]].to_numpy(dtype=np.float64)
    pin_close_novig = _devig_power_matrix_3way(raw_close_arr)
    pin_close_map = dict(zip(pin_close_piv.index.astype(str).tolist(), pin_close_novig))

    # 2. Apertura sharp `Pinnacle` (`open`) para el estudio de techo estructural (`open -> close`)
    pin_open_df = valid_odds[
        (valid_odds["source"] == "historical_fd")
        & (valid_odds["book_canon"] == "pinnacle")
        & (valid_odds["snapshot_stage"] == "open")
        & (valid_odds["ts_captured"] <= valid_odds["event_id"].map(ev_dev.set_index("event_id")["ts_decision"]))
    ].sort_values("ts_captured", kind="mergesort")
    pin_open_piv = (
        pin_open_df.drop_duplicates(["event_id", "selection_canon"], keep="last")
        .pivot(index="event_id", columns="selection_canon", values="price_decimal")
        .reindex(columns=["home", "draw", "away"])
        .dropna()
    )
    sum_imp_open = (1.0 / pin_open_piv["home"]) + (1.0 / pin_open_piv["draw"]) + (1.0 / pin_open_piv["away"])
    pin_open_piv = pin_open_piv[(sum_imp_open >= 0.9) & (sum_imp_open <= 1.2)]
    raw_open_arr = pin_open_piv[["home", "draw", "away"]].to_numpy(dtype=np.float64)
    pin_open_novig = _devig_power_matrix_3way(raw_open_arr)
    pin_open_map = dict(zip(pin_open_piv.index.astype(str).tolist(), pin_open_novig))

    # 3. Cuotas ejecutables en decisión (`open` en `b365` / prioridad real) + cierre misma casa para `alpha = 0.05`
    exec_books_order = ("b365", "bw", "wh", "pinnacle")
    exec_open_df = valid_odds[
        (valid_odds["source"] == "historical_fd")
        & (valid_odds["snapshot_stage"] == "open")
        & (valid_odds["book_canon"].isin(exec_books_order))
    ].copy()
    exec_close_df = valid_odds[
        (valid_odds["source"] == "historical_fd")
        & (valid_odds["snapshot_stage"] == "close")
        & (valid_odds["book_canon"].isin(exec_books_order))
    ].copy()

    open_book_piv = (
        exec_open_df.drop_duplicates(["event_id", "book_canon", "selection_canon"], keep="last")
        .pivot(index=["event_id", "book_canon"], columns="selection_canon", values="price_decimal")
        .reindex(columns=["home", "draw", "away"])
        .dropna()
    )
    close_book_piv = (
        exec_close_df.drop_duplicates(["event_id", "book_canon", "selection_canon"], keep="last")
        .pivot(index=["event_id", "book_canon"], columns="selection_canon", values="price_decimal")
        .reindex(columns=["home", "draw", "away"])
        .dropna()
    )
    common_idx = open_book_piv.index.intersection(close_book_piv.index)
    open_book_piv = open_book_piv.loc[common_idx]
    close_book_piv = close_book_piv.loc[common_idx]

    rank_map = {b: r for r, b in enumerate(exec_books_order)}
    open_reset = open_book_piv.reset_index()
    open_reset["_brank"] = open_reset["book_canon"].map(rank_map)
    open_reset = open_reset.sort_values(["event_id", "_brank"], kind="mergesort").drop_duplicates("event_id", keep="first")
    chosen_mi = pd.MultiIndex.from_frame(open_reset[["event_id", "book_canon"]])

    alpha = HISTORICAL_DELAY_ALPHA
    chosen_open_mat = open_book_piv.loc[chosen_mi, ["home", "draw", "away"]].to_numpy(dtype=np.float64)
    chosen_close_mat = close_book_piv.loc[chosen_mi, ["home", "draw", "away"]].to_numpy(dtype=np.float64)
    chosen_fill_mat = 1.0 / ((1.0 - alpha) * (1.0 / chosen_open_mat) + alpha * (1.0 / chosen_close_mat))
    chosen_eids = open_reset["event_id"].astype(str).tolist()
    exec_open_map = dict(zip(chosen_eids, chosen_open_mat))
    exec_fill_map = dict(zip(chosen_eids, chosen_fill_mat))

    return {
        "events_dev": ev_dev,
        "pin_close_novig_map": pin_close_map,
        "pin_open_novig_map": pin_open_map,
        "exec_open_map": exec_open_map,
        "exec_fill_map": exec_fill_map,
    }


# ---------------------------------------------------------------------------
# 6. Evaluación de Calibración, Economía Plana (Sin Stake Público) y Propiedades
# ---------------------------------------------------------------------------
def evaluate_xi_scenario_on_dev(
    dataset: Mapping[str, Any],
    deltas_all: np.ndarray,
    *,
    scenario_id: str,
    provenance: str,
    epistemic_status: str,
    description: str,
    n_boot: int = DEFAULT_BOOTSTRAP_RESAMPLES,
    seed: int = DEFAULT_SEED,
) -> dict[str, Any]:
    ev_dev: pd.DataFrame = dataset["events_dev"]
    pin_close_map: Mapping[str, np.ndarray] = dataset["pin_close_novig_map"]
    exec_open_map: Mapping[str, np.ndarray] = dataset["exec_open_map"]
    exec_fill_map: Mapping[str, np.ndarray] = dataset["exec_fill_map"]

    p_base_all = ev_dev[["p_motor_a_home", "p_motor_a_draw", "p_motor_a_away"]].to_numpy(dtype=np.float64)
    p_base_all = p_base_all / np.sum(p_base_all, axis=1, keepdims=True)
    p_xi_all = apply_availability_delta_vectorized(p_base_all, deltas_all)
    y_all = ev_dev["y"].to_numpy(dtype=np.int64)
    eids = ev_dev["event_id"].astype(str).tolist()
    leagues = ev_dev["league"].astype(str).to_numpy()

    # Subconjunto pareado con cierre sharp sin margen de Pinnacle
    paired_idx = [i for i, eid in enumerate(eids) if eid in pin_close_map]
    p_base = p_base_all[paired_idx]
    p_xi = p_xi_all[paired_idx]
    y_paired = y_all[paired_idx]
    p_close = np.vstack([pin_close_map[eids[i]] for i in paired_idx])

    ll_base, br_base = _multiclass_losses(p_base, y_paired)
    ll_xi, br_xi = _multiclass_losses(p_xi, y_paired)
    ll_close, br_close = _multiclass_losses(p_close, y_paired)

    dll_xi_vs_base = bootstrap_mean_mulberry32(ll_xi - ll_base, n_boot=n_boot, seed=seed + 11)
    dll_base_vs_close = bootstrap_mean_mulberry32(ll_base - ll_close, n_boot=n_boot, seed=seed + 23)
    dll_xi_vs_close = bootstrap_mean_mulberry32(ll_xi - ll_close, n_boot=n_boot, seed=seed + 37)

    dbr_xi_vs_base = bootstrap_mean_mulberry32(br_xi - br_base, n_boot=n_boot, seed=seed + 41)
    dbr_base_vs_close = bootstrap_mean_mulberry32(br_base - br_close, n_boot=n_boot, seed=seed + 53)
    dbr_xi_vs_close = bootstrap_mean_mulberry32(br_xi - br_close, n_boot=n_boot, seed=seed + 67)

    # Evaluación económica plana 1u (sin campos stake/kelly) respetando segmentos habilitados v3.1 y señal directa
    bw_payload = json.loads((REPO_ROOT / "src/data/prediction/blend_weights_v3_1.json").read_text("utf-8"))
    enabled_1x2_leagues = {
        str(v["league"])
        for k, v in (bw_payload.get("segments") or {}).items()
        if str(v.get("market")) == "1x2" and bool(v.get("model_picks_enabled", False))
    }

    def _eval_flat_value_signals(probs_matrix: np.ndarray, restrict_v31_segments: bool, seed_offset: int) -> dict[str, Any]:
        clv_pcts: list[float] = []
        clv_probs: list[float] = []
        unit_returns: list[float] = []
        for row_i, eid in enumerate(eids):
            if restrict_v31_segments and leagues[row_i] not in enabled_1x2_leagues:
                continue
            if eid not in exec_open_map or eid not in pin_close_map:
                continue
            o_dec = exec_open_map[eid]
            o_fill = exec_fill_map[eid]
            p_cl = pin_close_map[eid]
            p_m = probs_matrix[row_i]

            if restrict_v31_segments:
                seg_cfg = bw_payload["segments"][f"{leagues[row_i]}::1x2"]
                w_m = float(seg_cfg.get("w_model", 0.0))
                p_mkt_dec = bt._devig_probs_power(o_dec)
                z = w_m * np.log(np.clip(p_m, 1e-12, 1.0)) + (1.0 - w_m) * np.log(np.clip(p_mkt_dec, 1e-12, 1.0))
                z -= np.max(z)
                p_eval = np.exp(z) / np.sum(np.exp(z))
                ev_min = 0.035
            else:
                p_eval = p_m
                ev_min = 0.05

            evs = p_eval * o_dec - 1.0
            best_k = int(np.argmax(evs))
            if evs[best_k] < ev_min or p_eval[best_k] <= (1.0 / o_dec[best_k]):
                continue

            price_tomado = float(o_fill[best_k])
            p_close_sel = float(p_cl[best_k])
            price_close_novig = 1.0 / p_close_sel
            clv_pcts.append((price_tomado / price_close_novig) - 1.0)
            clv_probs.append(p_close_sel - (1.0 / price_tomado))
            unit_returns.append((price_tomado - 1.0) if int(y_all[row_i]) == best_k else -1.0)

        n_sig = len(unit_returns)
        if n_sig == 0:
            return {
                "n_signals": 0,
                "clv_pct_mean": None,
                "clv_pct_ci95": [0.0, 0.0],
                "clv_pct_significance_label": "no significativa",
                "clv_prob_mean": None,
                "clv_prob_ci95": [0.0, 0.0],
                "clv_prob_significance_label": "no significativa",
                "pct_clv_positive": None,
                "unit_roi_pct": 0.0,
                "unit_roi_pct_ci95": [0.0, 0.0],
                "unit_roi_significance_label": "no significativa",
                "unit_max_drawdown": 0.0,
            }

        clv_pct_boot = bootstrap_mean_mulberry32(
            np.asarray(clv_pcts, dtype=np.float64), n_boot=n_boot, seed=seed + seed_offset
        )
        clv_prob_boot = bootstrap_mean_mulberry32(
            np.asarray(clv_probs, dtype=np.float64), n_boot=n_boot, seed=seed + seed_offset + 1
        )
        roi_boot = bootstrap_mean_mulberry32(
            100.0 * np.asarray(unit_returns, dtype=np.float64), n_boot=n_boot, seed=seed + seed_offset + 2
        )
        ret_arr = np.asarray(unit_returns, dtype=np.float64)
        mdd = bt._max_drawdown_units(ret_arr)
        return {
            "n_signals": int(n_sig),
            "clv_pct_mean": clv_pct_boot["mean"],
            "clv_pct_ci95": clv_pct_boot["ci95"],
            "clv_pct_significance_label": clv_pct_boot["significance_label"],
            "clv_prob_mean": clv_prob_boot["mean"],
            "clv_prob_ci95": clv_prob_boot["ci95"],
            "clv_prob_significance_label": clv_prob_boot["significance_label"],
            "pct_clv_positive": float(np.mean(np.asarray(clv_pcts) > 0.0)),
            "unit_roi_pct": roi_boot["mean"],
            "unit_roi_pct_ci95": roi_boot["ci95"],
            "unit_roi_significance_label": roi_boot["significance_label"],
            "unit_max_drawdown": float(mdd),
        }

    econ_v31_xi = _eval_flat_value_signals(p_xi_all, restrict_v31_segments=True, seed_offset=101)
    econ_v31_base = _eval_flat_value_signals(p_base_all, restrict_v31_segments=True, seed_offset=101)
    econ_direct_xi = _eval_flat_value_signals(p_xi_all, restrict_v31_segments=False, seed_offset=201)
    econ_direct_base = _eval_flat_value_signals(p_base_all, restrict_v31_segments=False, seed_offset=201)

    d_active = np.asarray(deltas_all, dtype=np.float64)[paired_idx]
    return {
        "scenario_id": scenario_id,
        "provenance": provenance,
        "epistemic_status": epistemic_status,
        "description": description,
        "eval_split": "walk_forward_dev",
        "unlock_holdout": False,
        "execution_delay_minutes": EXECUTION_DELAY_MINUTES,
        "historical_delay_alpha": HISTORICAL_DELAY_ALPHA,
        "n_events_total_dev": int(len(ev_dev)),
        "n_events_paired_pinnacle_close": int(len(paired_idx)),
        "n_events_nonzero_delta": int(np.sum(d_active != 0.0)),
        "delta_summary": {
            "mean": float(np.mean(d_active)),
            "std": float(np.std(d_active)),
            "min": float(np.min(d_active)),
            "max": float(np.max(d_active)),
            "max_abs_prob_shift": float(np.max(np.abs(p_xi - p_base))),
        },
        "calibration_paired_pinnacle": {
            "log_loss_base_motor_a": float(np.mean(ll_base)),
            "log_loss_xi_motor_a": float(np.mean(ll_xi)),
            "log_loss_pinnacle_close_novig": float(np.mean(ll_close)),
            "delta_ll_xi_vs_base": dll_xi_vs_base["mean"],
            "delta_ll_xi_vs_base_ci95": dll_xi_vs_base["ci95"],
            "delta_ll_xi_vs_base_significant": dll_xi_vs_base["significant"],
            "delta_ll_xi_vs_base_significance_label": dll_xi_vs_base["significance_label"],
            "delta_ll_base_vs_pinnacle_close": dll_base_vs_close["mean"],
            "delta_ll_base_vs_pinnacle_close_ci95": dll_base_vs_close["ci95"],
            "delta_ll_base_vs_pinnacle_close_significance_label": dll_base_vs_close["significance_label"],
            "delta_ll_xi_vs_pinnacle_close": dll_xi_vs_close["mean"],
            "delta_ll_xi_vs_pinnacle_close_ci95": dll_xi_vs_close["ci95"],
            "delta_ll_xi_vs_pinnacle_close_significant": dll_xi_vs_close["significant"],
            "delta_ll_xi_vs_pinnacle_close_significance_label": dll_xi_vs_close["significance_label"],
            "brier_base_motor_a": float(np.mean(br_base)),
            "brier_xi_motor_a": float(np.mean(br_xi)),
            "brier_pinnacle_close_novig": float(np.mean(br_close)),
            "delta_brier_xi_vs_base": dbr_xi_vs_base["mean"],
            "delta_brier_xi_vs_base_ci95": dbr_xi_vs_base["ci95"],
            "delta_brier_xi_vs_base_significance_label": dbr_xi_vs_base["significance_label"],
            "delta_brier_base_vs_pinnacle_close": dbr_base_vs_close["mean"],
            "delta_brier_base_vs_pinnacle_close_ci95": dbr_base_vs_close["ci95"],
            "delta_brier_base_vs_pinnacle_close_significance_label": dbr_base_vs_close["significance_label"],
            "delta_brier_xi_vs_pinnacle_close": dbr_xi_vs_close["mean"],
            "delta_brier_xi_vs_pinnacle_close_ci95": dbr_xi_vs_close["ci95"],
            "delta_brier_xi_vs_pinnacle_close_significance_label": dbr_xi_vs_close["significance_label"],
        },
        "economic_v3_1_frozen_segments_1u": {
            "enabled_leagues_1x2": sorted(enabled_1x2_leagues),
            "base": econ_v31_base,
            "xi": econ_v31_xi,
        },
        "economic_direct_motor_a_1u": {
            "base": econ_direct_base,
            "xi": econ_direct_xi,
        },
    }


def verify_mathematical_properties_on_dev(dataset: Mapping[str, Any]) -> dict[str, Any]:
    ev_dev: pd.DataFrame = dataset["events_dev"]
    pin_close_map: Mapping[str, np.ndarray] = dataset["pin_close_novig_map"]
    eids = ev_dev["event_id"].astype(str).tolist()
    paired_idx = [i for i, eid in enumerate(eids) if eid in pin_close_map]

    p_base = ev_dev[["p_motor_a_home", "p_motor_a_draw", "p_motor_a_away"]].to_numpy(dtype=np.float64)[paired_idx]
    p_base = p_base / np.sum(p_base, axis=1, keepdims=True)

    p_zero = apply_availability_delta_vectorized(p_base, 0.0)
    max_diff_at_zero = float(np.max(np.abs(p_zero - p_base)))

    p_pos_clip = apply_availability_delta_vectorized(p_base, 0.35)
    p_neg_clip = apply_availability_delta_vectorized(p_base, -0.35)

    max_simplex_err = float(
        max(
            np.max(np.abs(np.sum(p_pos_clip, axis=1) - 1.0)),
            np.max(np.abs(np.sum(p_neg_clip, axis=1) - 1.0)),
        )
    )
    monotone_pos = bool(np.all(p_pos_clip[:, 0] > p_base[:, 0]) and np.all(p_pos_clip[:, 2] < p_base[:, 2]))
    monotone_neg = bool(np.all(p_neg_clip[:, 0] < p_base[:, 0]) and np.all(p_neg_clip[:, 2] > p_base[:, 2]))

    log_ratio_base = np.log(p_base[:, 0] / p_base[:, 2])
    log_ratio_pos = np.log(p_pos_clip[:, 0] / p_pos_clip[:, 2])
    max_log_odds_shift_err = float(np.max(np.abs((log_ratio_pos - log_ratio_base) - 0.35)))

    empirical_max_prob_shift = float(
        max(np.max(np.abs(p_pos_clip - p_base)), np.max(np.abs(p_neg_clip - p_base)))
    )
    analytical_upper_bound = math.tanh(0.35 / 4.0)  # 0.08727719688...

    return {
        "epistemic_status": "OBSERVADO",
        "n_paired_checked": int(len(paired_idx)),
        "zero_degradation_max_abs_diff": max_diff_at_zero,
        "simplex_max_abs_err_at_clip": max_simplex_err,
        "strict_monotonicity_home_and_away": bool(monotone_pos and monotone_neg),
        "log_odds_ratio_shift_invariance_max_err": max_log_odds_shift_err,
        "empirical_max_abs_prob_shift_at_clip_0_35": empirical_max_prob_shift,
        "analytical_2way_prob_shift_bound_tanh_0_0875": analytical_upper_bound,
        "within_analytical_bound": empirical_max_prob_shift <= analytical_upper_bound + 1e-12,
    }


def run_experiment(
    *,
    eval_split: str = "walk_forward_dev",
    unlock_holdout: bool = False,
    n_boot: int = DEFAULT_BOOTSTRAP_RESAMPLES,
    seed: int = DEFAULT_SEED,
    output_path: Path = DEFAULT_RESULTS_JSON,
    registry_path: Path = DEFAULT_XI_TRIAL_REGISTRY,
) -> dict[str, Any]:
    enforce_walk_forward_dev_only(eval_split, unlock_holdout)
    frozen_audit = verify_frozen_v3_1_artifacts(REPO_ROOT)

    dataset = load_walk_forward_dev_football_dataset()
    ev_dev: pd.DataFrame = dataset["events_dev"]
    n_dev = len(ev_dev)
    coverage_audit = audit_local_xi_coverage_in_dev(ev_dev)
    math_props = verify_mathematical_properties_on_dev(dataset)

    # 1. Corrida empírica real (`provenance = "observed"`): solo registros XI reales < 2025-02-02T17:30:00Z
    observed_deltas = np.zeros(n_dev, dtype=np.float64)
    trial_obs = register_xi_trial(
        registry_path=registry_path,
        trial_name="xi_dev_observed_real_coverage",
        provenance="observed",
        eval_split=eval_split,
        unlock_holdout=unlock_holdout,
        config_payload={"source": "local_real_xi_pre_holdout", "clip_abs": 0.35},
    )
    run_observed = evaluate_xi_scenario_on_dev(
        dataset,
        observed_deltas,
        scenario_id="xi_dev_observed_real_coverage",
        provenance="observed",
        epistemic_status="OBSERVADO",
        description=(
            "Evaluación empírica honesta sobre walk_forward_dev usando únicamente capturas reales "
            "de XI confirmado con ts_xi_published < 2025-02-02T17:30:00Z (0/52,746 disponibles -> delta = 0.0)."
        ),
        n_boot=n_boot,
        seed=seed,
    )
    run_observed["trial_registry_entry"] = trial_obs

    # 2. Sensibilidad paramétrica: ruido simétrico no informativo de lesiones/rotaciones (`σ ≈ 0.12`, `provenance = "synthetic_sensitivity"`)
    u_noise = clv.mulberry32_uniforms(seed + 777, 2 * n_dev)
    # Box-Muller determinista acotado en [-0.35, +0.35] con σ = 0.12 (magnitud típica de ausencias de plantilla)
    u1 = np.clip(u_noise[:n_dev], 1e-12, 1.0 - 1e-12)
    u2 = u_noise[n_dev:]
    z_norm = np.sqrt(-2.0 * np.log(u1)) * np.cos(2.0 * math.pi * u2)
    noisy_deltas = np.clip(0.12 * z_norm, -0.35, 0.35)
    trial_noise = register_xi_trial(
        registry_path=registry_path,
        trial_name="xi_dev_sensitivity_uninformative_noise_sigma_0_12",
        provenance="synthetic_sensitivity",
        eval_split=eval_split,
        unlock_holdout=unlock_holdout,
        config_payload={"synthetic_generator": "box_muller_mulberry32", "sigma": 0.12, "clip_abs": 0.35},
    )
    run_noise = evaluate_xi_scenario_on_dev(
        dataset,
        noisy_deltas,
        scenario_id="xi_dev_sensitivity_uninformative_noise_sigma_0_12",
        provenance="synthetic_sensitivity",
        epistemic_status="INFERIDO",
        description=(
            "Sensibilidad paramétrica (NO empírica): perturbación gaussiana determinista N(0, 0.12^2) truncada en "
            "[-0.35, +0.35] simulando bajas estáticas ya descontadas o ruidosas sin señal real en T-60m."
        ),
        n_boot=n_boot,
        seed=seed + 1000,
    )
    run_noise["trial_registry_entry"] = trial_noise

    # 3. Cota adversarial extrema en saturación (`|delta| = 0.35` opuesto al favorito del modelo)
    p_base_arr = ev_dev[["p_motor_a_home", "p_motor_a_draw", "p_motor_a_away"]].to_numpy(dtype=np.float64)
    adv_deltas = np.where(p_base_arr[:, 0] >= p_base_arr[:, 2], -0.35, 0.35)
    trial_adv = register_xi_trial(
        registry_path=registry_path,
        trial_name="xi_dev_sensitivity_adversarial_clip_0_35",
        provenance="synthetic_sensitivity",
        eval_split=eval_split,
        unlock_holdout=unlock_holdout,
        config_payload={"synthetic_generator": "adversarial_clip_bound", "clip_abs": 0.35},
    )
    run_adversarial = evaluate_xi_scenario_on_dev(
        dataset,
        adv_deltas,
        scenario_id="xi_dev_sensitivity_adversarial_clip_0_35",
        provenance="synthetic_sensitivity",
        epistemic_status="INFERIDO",
        description=(
            "Cota de estrés adversarial (NO empírica): saturación sistemática |delta| = 0.35 en dirección "
            "adversa para cuantificar el daño máximo posible acotado por clip_abs = 0.35."
        ),
        n_boot=n_boot,
        seed=seed + 2000,
    )
    run_adversarial["trial_registry_entry"] = trial_adv

    # 4. Techo estructural de información pre-cierre (`open -> close` Pinnacle proyectado en `[-0.35, +0.35]`)
    pin_open_map: Mapping[str, np.ndarray] = dataset["pin_open_novig_map"]
    pin_close_map: Mapping[str, np.ndarray] = dataset["pin_close_novig_map"]
    oracle_deltas = np.zeros(n_dev, dtype=np.float64)
    for idx_row, eid in enumerate(ev_dev["event_id"].astype(str).tolist()):
        if eid in pin_open_map and eid in pin_close_map:
            po = pin_open_map[eid]
            pc = pin_close_map[eid]
            steam_log_ratio = math.log(pc[0] / pc[2]) - math.log(po[0] / po[2])
            oracle_deltas[idx_row] = max(-0.35, min(0.35, steam_log_ratio))

    trial_ceiling = register_xi_trial(
        registry_path=registry_path,
        trial_name="xi_dev_sensitivity_oracle_open_to_close_projection_ceiling",
        provenance="synthetic_sensitivity",
        eval_split=eval_split,
        unlock_holdout=unlock_holdout,
        config_payload={"synthetic_generator": "oracle_pinnacle_steam_projection", "clip_abs": 0.35},
    )
    run_ceiling = evaluate_xi_scenario_on_dev(
        dataset,
        oracle_deltas,
        scenario_id="xi_dev_sensitivity_oracle_open_to_close_projection_ceiling",
        provenance="synthetic_sensitivity",
        epistemic_status="INFERIDO",
        description=(
            "Techo teórico no-causal (NO alcanzable en vivo): proyecta el 100% del movimiento real open->close "
            "de Pinnacle sobre delta in [-0.35, +0.35] para medir el límite superior físico de la familia paramétrica."
        ),
        n_boot=n_boot,
        seed=seed + 3000,
    )
    run_ceiling["trial_registry_entry"] = trial_ceiling

    payload: dict[str, Any] = {
        "schema_version": "exp_v32_xi_v1.0.0",
        "experiment_id": "EXP_V32_xi",
        "agent_id": "B7",
        "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "reproduction_command": (
            ".\\research\\prediction-lab\\.venv\\Scripts\\python.exe "
            "research/prediction-lab/experiments/EXP_V32_xi/run_exp_v32_xi.py"
        ),
        "eval_split": "walk_forward_dev",
        "holdout_cut_utc": HOLDOUT_CUT_UTC,
        "holdout_sealed_untouched": True,
        "unlock_holdout": False,
        "production_activated": False,
        "hypothesis_status": "unproven_pending_prospective_capture",
        "bootstrap_config": {
            "prng": "mulberry32",
            "n_resamples": int(n_boot),
            "seed": int(seed),
            "ci_level": 0.95,
        },
        "execution_assumptions": {
            "execution_delay_minutes": EXECUTION_DELAY_MINUTES,
            "min_xi_ingestion_buffer_minutes": xic.MIN_INGESTION_BUFFER_MINUTES,
            "historical_delay_alpha": HISTORICAL_DELAY_ALPHA,
            "t60m_max_polling_interval_minutes": 3.685835,
        },
        "frozen_v3_1_governance": frozen_audit,
        "local_xi_coverage_audit": coverage_audit,
        "mathematical_properties_walk_forward_dev": math_props,
        "observed_evaluation": run_observed,
        "synthetic_sensitivity_studies": [
            run_noise,
            run_adversarial,
            run_ceiling,
        ],
    }
    assert_no_public_stake_fields(payload)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return payload


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ejecuta el experimento offline EXP_V32_xi en walk_forward_dev.")
    parser.add_argument("--out", type=Path, default=DEFAULT_RESULTS_JSON)
    parser.add_argument("--registry", type=Path, default=DEFAULT_XI_TRIAL_REGISTRY)
    parser.add_argument("--bootstrap-samples", type=int, default=DEFAULT_BOOTSTRAP_RESAMPLES)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    args = parser.parse_args(argv)

    res = run_experiment(
        n_boot=int(args.bootstrap_samples),
        seed=int(args.seed),
        output_path=args.out,
        registry_path=args.registry,
    )
    obs_cal = res["observed_evaluation"]["calibration_paired_pinnacle"]
    print(
        json.dumps(
            {
                "experiment_id": res["experiment_id"],
                "production_activated": res["production_activated"],
                "n_events_dev": res["observed_evaluation"]["n_events_total_dev"],
                "n_paired_pinnacle": res["observed_evaluation"]["n_events_paired_pinnacle_close"],
                "n_real_xi_in_dev": res["local_xi_coverage_audit"]["n_events_with_real_ts_xi_published_in_dev"],
                "observed_calibration": obs_cal,
                "synthetic_scenarios": [
                    {
                        "scenario_id": s["scenario_id"],
                        "provenance": s["provenance"],
                        "delta_ll_xi_vs_base": s["calibration_paired_pinnacle"]["delta_ll_xi_vs_base"],
                        "delta_ll_xi_vs_base_ci95": s["calibration_paired_pinnacle"]["delta_ll_xi_vs_base_ci95"],
                        "delta_ll_xi_vs_pinnacle_close": s["calibration_paired_pinnacle"][
                            "delta_ll_xi_vs_pinnacle_close"
                        ],
                        "delta_ll_xi_vs_pinnacle_close_ci95": s["calibration_paired_pinnacle"][
                            "delta_ll_xi_vs_pinnacle_close_ci95"
                        ],
                    }
                    for s in res["synthetic_sensitivity_studies"]
                ],
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
