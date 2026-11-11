#!/usr/bin/env python3
"""Arnés de backtest walk-forward estricto, anti-fuga y con Holdout Sellado (`PitchLab A3`).

Expone la función canónica `run_backtest(config) -> report` consumida por `A3` (Línea Base v3.0),
`A4`, `A5`, `A6` y `A8`. Integra:
  1. Verificación explícita anti-fuga (`DataLeakageError`):
     - `ts_disponible <= ts_decision <= ts_event_start` en toda fila de features/eventos.
     - `ts_captured <= ts_decision` en toda cuota evaluada en el instante de decisión.
     - Separación causal estricta en cada pliegue walk-forward (`ts_event_start < fold_decision_cut`).
  2. Simulación realista de ejecución:
     - Multi-tick (`source == "scraped_ws"`): llena al primer snapshot con
       `ts_captured >= ts_decision + timedelta(minutes=execution_delay_minutes)` (por defecto `2.0` min)
       y `ts_captured <= ts_event_start`.
     - Histórico 2-puntos (`source == "historical_fd"`, solo `open` y `close`): decide viendo únicamente
       `open` e interpola el precio ejecutado sobre probabilidad implícita de la misma casa:
       `p_exec = (1 - alpha) * (1 / price_open) + alpha * (1 / price_close)`, `price_tomado = 1 / p_exec`,
       con `historical_delay_alpha = 0.05` por defecto y sensibilidad en `0.0` y `0.10` (jamás `close`).
  3. Cuota de cierre sharp estricta:
     - `historical_fd`: exclusivamente `close` de `pinnacle` (`ts_captured <= ts_event_start`).
     - `scraped_ws`: último snapshot `pinnacle` (`ts_captured <= ts_event_start`), fallback único `smarkets`.
     - Si falta cierre sharp, `closing_missing = True` (jamás se rellena con casas recreativas ni `bfe`).
  4. Walk-forward estricto + Holdout Sellado (último 20% temporal):
     - Por defecto `eval_split = "walk_forward_dev"` evalúa solo el primer 80% cronológico.
     - Registra cada invocación en `services/models/artifacts/holdout_trial_registry.jsonl`.
     - Bloquea `holdout_sealed` salvo `unlock_holdout=True`, reportando `n_configs_tested_before_holdout`.
  5. Métricas con IC 95% bootstrap (`>= 1000` remuestreos):
     - `log_loss_model` vs `log_loss_closing_novig` (`delta_log_loss`) y `brier_model` vs
       `brier_closing_novig` (`delta_brier`), global y por `league × market`.
     - `n_picks`, `roi_pct`, `clv_pct_mean`, `clv_prob_mean`, `pct_picks_clv_positive`, `max_drawdown_u`.

Uso reproducible para generar la Línea Base v3.0 (Puerta 1):
    research/prediction-lab/.venv/Scripts/python.exe services/models/backtest.py --preset baseline_v3_0
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import sys
from typing import Any, Callable, Mapping

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"
DEFAULT_ODDS_PARQUET = PRED_LAB_ROOT / "data" / "processed" / "odds_snapshots.parquet"
DEFAULT_REGISTRY_PATH = REPO_ROOT / "services" / "models" / "artifacts" / "holdout_trial_registry.jsonl"
DEFAULT_BASELINE_OUT = REPO_ROOT / "services" / "models" / "artifacts" / "baseline_v3_0_backtest.json"

for _p in (
    str(REPO_ROOT),
    str(REPO_ROOT / "services" / "models"),
    str(PRED_LAB_ROOT),
    str(PRED_LAB_ROOT / "models" / "a"),
    str(PRED_LAB_ROOT / "models" / "b"),
    str(PRED_LAB_ROOT / "models" / "nfl"),
):
    if _p not in sys.path:
        sys.path.insert(0, _p)

__all__ = ["run_backtest"]


class DataLeakageError(RuntimeError):
    """Excepción lanzada ante cualquier violación causal (`ts_disponible` o `ts_captured` > `ts_decision`)."""


class HoldoutSealedError(PermissionError):
    """Excepción lanzada al intentar evaluar `holdout_sealed` sin `unlock_holdout=True`."""


# Casas reales válidas para simular ejecución (excluye agregados sintéticos `avg`, `max`, `nflverse` y `bfe` histórico)
DEFAULT_REAL_EXECUTION_BOOKS: tuple[str, ...] = (
    "b365",
    "bet365",
    "caliente",
    "caliente_mx",
    "codere",
    "codere_mx",
    "codere_bet365_mx",
    "pinnacle",
    "ps",
    "smarkets",
    "betfair_smarkets_exchange",
    "bw",
    "bwin",
    "wh",
    "william_hill",
    "draftkings",
    "fanduel",
    "betmgm",
    "betrivers",
)

BOOK_CANONICAL_MAP: dict[str, str] = {
    "ps": "pinnacle",
    "pinnacle": "pinnacle",
    "pinnacle_sports": "pinnacle",
    "smarkets": "smarkets",
    "betfair_smarkets_exchange": "smarkets",
    "b365": "b365",
    "bet365": "b365",
    "bw": "bw",
    "bwin": "bw",
    "wh": "wh",
    "william_hill": "wh",
    "caliente": "caliente",
    "caliente_mx": "caliente",
    "codere": "codere",
    "codere_mx": "codere",
    "codere_bet365_mx": "codere",
    "bfe": "bfe",
    "betfair_exchange": "bfe",
    "bf": "bf",
    "betfair_sportsbook": "bf",
    "avg": "avg",
    "market_avg": "avg",
    "max": "max",
    "market_max": "max",
    "nflverse": "nflverse",
}


def canonical_book(book: Any) -> str:
    raw = str(book or "").strip().lower()
    return BOOK_CANONICAL_MAP.get(raw, raw)


def canonical_sport(sport: Any) -> str:
    raw = str(sport or "").strip().lower()
    if raw in ("soccer", "football", "futbol", "fútbol"):
        return "football"
    return raw


def canonical_market(market: Any) -> str:
    raw = str(market or "").strip().lower()
    if raw in ("1x2", "h2h_3way", "match_odds", "3way"):
        return "1x2"
    if raw in ("moneyline", "ml", "h2h", "h2h_2way", "2way"):
        return "moneyline"
    if raw in ("ah", "asian_handicap"):
        return "ah"
    if raw in ("spread", "point_spread", "handicap"):
        return "spread"
    if raw in ("totals", "total", "ou", "over_under", "ou_2_5"):
        return "totals"
    if raw in ("btts", "both_teams_to_score"):
        return "btts"
    return raw


def canonical_selection(selection: Any) -> str:
    raw = str(selection or "").strip().lower()
    mapping = {
        "h": "home",
        "home": "home",
        "1": "home",
        "d": "draw",
        "draw": "draw",
        "tie": "draw",
        "t": "draw",
        "x": "draw",
        "a": "away",
        "away": "away",
        "2": "away",
        "o": "over",
        "over": "over",
        "u": "under",
        "under": "under",
        "yes": "yes",
        "si": "yes",
        "no": "no",
    }
    return mapping.get(raw, raw)


def _normalize_line_key(line: Any) -> float | None:
    if line is None or (isinstance(line, float) and math.isnan(line)) or pd.isna(line):
        return None
    val = float(line)
    if not math.isfinite(val):
        return None
    return round(val + 0.0, 4)


@dataclass
class BacktestConfig:
    """Configuración declarativa e inmutable en hash para `run_backtest`."""

    phase: str = "baseline_v3_0"
    preset: str = "baseline_v3_0"
    model_version: str = "spacetime_v3.0+geodesic_v2.0"
    eval_split: str = "walk_forward_dev"  # "walk_forward_dev" | "holdout_sealed" | "both"
    unlock_holdout: bool = False
    holdout_fraction: float = 0.20
    walk_forward_granularity: str = "season"  # "season" | "month"
    sports: tuple[str, ...] = ("football", "nfl")
    markets: tuple[str, ...] = ("1x2", "moneyline")
    first_eval_season_soccer: int = 2018
    first_eval_season_nfl: int = 2010
    execution_delay_minutes: float = 2.0
    historical_delay_alpha: float = 0.05
    decision_lead_minutes_ws: float = 60.0
    execution_books_priority: tuple[str, ...] = (
        "caliente",
        "codere",
        "b365",
        "bw",
        "wh",
        "pinnacle",
        "smarkets",
    )
    line_shopping: bool = False
    kelly_scale: float = 0.25
    min_ev: float = 0.02
    max_ev: float = 0.28
    max_disagreement: float = 0.11
    max_stake: float = 0.05
    tier_default: str = "baseline_v3_0"
    bootstrap_samples: int = 1000
    seed: int = 20261111
    retrain_from_features: bool = False
    odds_parquet_path: str | Path | None = None
    registry_path: str | Path | None = None
    extra_config_tag: dict[str, Any] = field(default_factory=dict)

    # Hooks en memoria para tests unitarios y agentes A4–A8 (excluidos del JSON directo, hasheados por metadato)
    events_df: pd.DataFrame | None = field(default=None, repr=False)
    odds_df: pd.DataFrame | None = field(default=None, repr=False)
    decision_odds_df: pd.DataFrame | None = field(default=None, repr=False)
    model_fn: Callable[[pd.DataFrame, pd.DataFrame, "BacktestConfig"], pd.DataFrame] | None = field(
        default=None, repr=False
    )
    pick_selector_fn: Callable[[dict[str, Any], list[dict[str, Any]], "BacktestConfig"], list[dict[str, Any]]] | None = (
        field(default=None, repr=False)
    )

    @classmethod
    def from_input(cls, raw: "BacktestConfig | Mapping[str, Any] | None") -> "BacktestConfig":
        if raw is None:
            return cls()
        if isinstance(raw, cls):
            return raw
        if not isinstance(raw, Mapping):
            raise TypeError(f"config debe ser BacktestConfig o Mapping; recibido {type(raw)!r}")
        kwargs = dict(raw)
        for tup_key in ("sports", "markets", "execution_books_priority"):
            if tup_key in kwargs and kwargs[tup_key] is not None:
                kwargs[tup_key] = tuple(kwargs[tup_key])
        if "extra_config_tag" in kwargs and kwargs["extra_config_tag"] is None:
            kwargs["extra_config_tag"] = {}
        return cls(**kwargs)

    def validate(self) -> None:
        if self.eval_split not in ("walk_forward_dev", "holdout_sealed", "both"):
            raise ValueError(f"eval_split inválido: {self.eval_split!r}")
        if self.eval_split in ("holdout_sealed", "both") and not self.unlock_holdout:
            raise HoldoutSealedError(
                f"Holdout sellado: eval_split={self.eval_split!r} requiere unlock_holdout=True explícito."
            )
        if not (0.20 - 1e-9 <= float(self.holdout_fraction) < 0.50):
            raise HoldoutSealedError(
                f"holdout_fraction debe reservar al menos el 20% final ([0.20, 0.50)); recibido {self.holdout_fraction}"
            )
        if float(self.execution_delay_minutes) < 0.0 or not math.isfinite(float(self.execution_delay_minutes)):
            raise ValueError(f"execution_delay_minutes inválido: {self.execution_delay_minutes}")
        alpha = float(self.historical_delay_alpha)
        if not math.isfinite(alpha) or alpha < 0.0:
            raise ValueError(f"historical_delay_alpha debe ser >= 0.0; recibido {alpha}")
        if alpha >= 1.0:
            raise DataLeakageError(
                f"historical_delay_alpha={alpha} prohibido: jamás se permite apostar a close como precio tomado (< 1.0)."
            )
        if int(self.bootstrap_samples) < 1000:
            raise ValueError(f"bootstrap_samples debe ser >= 1000 por contrato; recibido {self.bootstrap_samples}")
        if self.walk_forward_granularity not in ("season", "month"):
            raise ValueError(f"walk_forward_granularity inválido: {self.walk_forward_granularity!r}")

    def canonical_dict_for_hash(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "preset": self.preset,
            "model_version": self.model_version,
            "holdout_fraction": round(float(self.holdout_fraction), 6),
            "walk_forward_granularity": self.walk_forward_granularity,
            "sports": sorted(canonical_sport(s) for s in self.sports),
            "markets": sorted(canonical_market(m) for m in self.markets),
            "first_eval_season_soccer": int(self.first_eval_season_soccer),
            "first_eval_season_nfl": int(self.first_eval_season_nfl),
            "execution_delay_minutes": round(float(self.execution_delay_minutes), 6),
            "historical_delay_alpha": round(float(self.historical_delay_alpha), 6),
            "decision_lead_minutes_ws": round(float(self.decision_lead_minutes_ws), 6),
            "execution_books_priority": [canonical_book(b) for b in self.execution_books_priority],
            "line_shopping": bool(self.line_shopping),
            "kelly_scale": round(float(self.kelly_scale), 6),
            "min_ev": round(float(self.min_ev), 6),
            "max_ev": round(float(self.max_ev), 6),
            "max_disagreement": round(float(self.max_disagreement), 6),
            "max_stake": round(float(self.max_stake), 6),
            "tier_default": str(self.tier_default),
            "retrain_from_features": bool(self.retrain_from_features),
            "extra_config_tag": self.extra_config_tag,
            "custom_model_fn": getattr(self.model_fn, "__qualname__", None) if self.model_fn else None,
            "custom_pick_selector_fn": (
                getattr(self.pick_selector_fn, "__qualname__", None) if self.pick_selector_fn else None
            ),
        }
        return payload

    def config_hash(self) -> str:
        raw = json.dumps(self.canonical_dict_for_hash(), sort_keys=True, separators=(",", ":"), default=str)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Utilidades matemáticas de de-vig (Singularity v3.0) y liquidación multi-mercado
# ---------------------------------------------------------------------------
def _solve_power_tuple(q: tuple[float, ...], tolerance: float = 1e-12) -> tuple[float, ...]:
    lo, hi = 1e-6, 5.0
    alpha = 1.0
    if len(q) == 3:
        q0, q1, q2 = q
        for _ in range(200):
            alpha = 0.5 * (lo + hi)
            s = (q0 ** alpha) + (q1 ** alpha) + (q2 ** alpha)
            if abs(s - 1.0) <= tolerance:
                break
            if s > 1.0:
                lo = alpha
            else:
                hi = alpha
        p0, p1, p2 = q0 ** alpha, q1 ** alpha, q2 ** alpha
        tot = p0 + p1 + p2
        return (p0 / tot, p1 / tot, p2 / tot)
    if len(q) == 2:
        q0, q1 = q
        for _ in range(200):
            alpha = 0.5 * (lo + hi)
            s = (q0 ** alpha) + (q1 ** alpha)
            if abs(s - 1.0) <= tolerance:
                break
            if s > 1.0:
                lo = alpha
            else:
                hi = alpha
        p0, p1 = q0 ** alpha, q1 ** alpha
        tot = p0 + p1
        return (p0 / tot, p1 / tot)
    for _ in range(200):
        alpha = 0.5 * (lo + hi)
        s = sum(qi ** alpha for qi in q)
        if abs(s - 1.0) <= tolerance:
            break
        if s > 1.0:
            lo = alpha
        else:
            hi = alpha
    ps = [qi ** alpha for qi in q]
    tot = sum(ps)
    return tuple(pi / tot for pi in ps)


def _solve_shin_tuple(q: tuple[float, ...], tolerance: float = 1e-12) -> tuple[float, ...]:
    Q = sum(q)
    lo, hi = 0.0, 0.5
    z = 0.0
    sqrt = math.sqrt
    if len(q) == 3:
        q0s, q1s, q2s = q[0] * q[0], q[1] * q[1], q[2] * q[2]
        for _ in range(200):
            z = 0.5 * (lo + hi)
            omz = 1.0 - z
            f = 4.0 * omz / Q
            z2 = z * z
            inv_d = 1.0 / (2.0 * omz)
            s = (
                (sqrt(max(z2 + f * q0s, 0.0)) - z)
                + (sqrt(max(z2 + f * q1s, 0.0)) - z)
                + (sqrt(max(z2 + f * q2s, 0.0)) - z)
            ) * inv_d
            if abs(s - 1.0) <= tolerance:
                break
            if s > 1.0:
                lo = z
            else:
                hi = z
        omz = 1.0 - z
        f = 4.0 * omz / Q
        z2 = z * z
        p0 = sqrt(max(z2 + f * q0s, 0.0)) - z
        p1 = sqrt(max(z2 + f * q1s, 0.0)) - z
        p2 = sqrt(max(z2 + f * q2s, 0.0)) - z
        tot = p0 + p1 + p2
        return (p0 / tot, p1 / tot, p2 / tot)
    for _ in range(200):
        z = 0.5 * (lo + hi)
        omz = 1.0 - z
        f = 4.0 * omz / Q
        z2 = z * z
        inv_d = 1.0 / (2.0 * omz)
        s = sum((sqrt(max(z2 + f * qi * qi, 0.0)) - z) * inv_d for qi in q)
        if abs(s - 1.0) <= tolerance:
            break
        if s > 1.0:
            lo = z
        else:
            hi = z
    omz = 1.0 - z
    f = 4.0 * omz / Q
    z2 = z * z
    ps = [sqrt(max(z2 + f * qi * qi, 0.0)) - z for qi in q]
    tot = sum(ps)
    return tuple(pi / tot for pi in ps)


def _devig_probs_power(odds_arr: np.ndarray | list[float] | tuple[float, ...], tolerance: float = 1e-12) -> np.ndarray:
    """De-vig Power exacto (`|Δ| < 1e-12`) idéntico a `odds_snapshots.py`, `clv_report.py` y `devig.ts`."""
    q = tuple(1.0 / float(x) for x in odds_arr)
    return np.array(_solve_power_tuple(q, tolerance=tolerance), dtype=float)


def _devig_probs_adaptive(odds_arr: np.ndarray | list[float] | tuple[float, ...]) -> np.ndarray:
    """Desvigorización adaptativa Power/Shin idéntica bit a bit a `Singularity v3.0` (`devig.ts`)."""
    q = tuple(1.0 / float(x) for x in odds_arr)
    sum_imp = sum(q)
    if not (0.9 <= sum_imp <= 1.2) or len(q) not in (2, 3):
        return np.array([qi / sum_imp for qi in q], dtype=float)
    r = sum_imp - 1.0
    if r <= 0.0322:
        w_shin = 0.12
    elif r < 0.0662:
        u = max(0.0, min(1.0, (r - 0.0322) / (0.0662 - 0.0322)))
        w_shin = 0.12 + (0.85 - 0.12) * (u * u * (3.0 - 2.0 * u))
    else:
        u = max(0.0, min(1.0, (r - 0.0662) / (0.118 - 0.0662)))
        w_shin = 0.85 + (0.96 - 0.85) * (u * u * (3.0 - 2.0 * u))
    p_pow = _solve_power_tuple(q, tolerance=1e-12)
    p_shi = _solve_shin_tuple(q, tolerance=1e-12)
    raw = [(1.0 - w_shin) * pp + w_shin * ps for pp, ps in zip(p_pow, p_shi)]
    tot = sum(raw)
    return np.array([ri / tot for ri in raw], dtype=float)


def _selection_order_for_market(market: str) -> tuple[str, ...]:
    m = canonical_market(market)
    if m == "1x2":
        return ("home", "draw", "away")
    if m in ("moneyline", "ah", "spread"):
        return ("home", "away")
    if m == "totals":
        return ("over", "under")
    if m == "btts":
        return ("yes", "no")
    raise ValueError(f"Mercado no soportado para orden de selecciones: {market!r}")


def settle_selection_unit_return(
    market: str,
    selection: str,
    line: float | None,
    price_decimal: float,
    home_score: float,
    away_score: float,
    outcome_label: str | int | None = None,
) -> tuple[str, float]:
    """Calcula `(settlement_status, unit_pnl_per_1u)` soportando `win`, `loss`, `void`, `half_win`, `half_loss`."""
    m = canonical_market(market)
    sel = canonical_selection(selection)
    net_win = float(price_decimal) - 1.0

    if m == "1x2":
        if pd.notna(home_score) and pd.notna(away_score):
            actual = "home" if home_score > away_score else ("draw" if home_score == away_score else "away")
        else:
            lbl = str(outcome_label).strip().lower()
            actual = {"0": "home", "h": "home", "home": "home", "1": "draw", "d": "draw", "draw": "draw"}.get(
                lbl, "away"
            )
        return ("win", net_win) if sel == actual else ("loss", -1.0)

    if m == "moneyline":
        if pd.notna(home_score) and pd.notna(away_score):
            if home_score == away_score:
                return ("void", 0.0)
            actual = "home" if home_score > away_score else "away"
        else:
            lbl = str(outcome_label).strip().lower()
            if lbl in ("1", "d", "t", "tie", "draw", "void"):
                return ("void", 0.0)
            actual = "home" if lbl in ("0", "h", "home") else "away"
        return ("win", net_win) if sel == actual else ("loss", -1.0)

    if m in ("ah", "spread"):
        if line is None or not (pd.notna(home_score) and pd.notna(away_score)):
            raise ValueError(f"Liquidación {m} requiere line y marcador finito.")
        margin = (float(home_score) - float(away_score)) if sel == "home" else (float(away_score) - float(home_score))
        # Si `line` viene con convención local (p.ej. home line = -0.5 -> away handicap = +0.5)
        h_sel = float(line) if sel == "home" else -float(line)
        return _settle_asian_diff(margin + h_sel, net_win)

    if m == "totals":
        if line is None or not (pd.notna(home_score) and pd.notna(away_score)):
            raise ValueError("Liquidación totals requiere line y marcador finito.")
        tot = float(home_score) + float(away_score)
        diff = (tot - float(line)) if sel == "over" else (float(line) - tot)
        return _settle_asian_diff(diff, net_win)

    if m == "btts":
        both = (float(home_score) > 0.0) and (float(away_score) > 0.0)
        won = both if sel == "yes" else (not both)
        return ("win", net_win) if won else ("loss", -1.0)

    raise ValueError(f"Mercado desconocido en liquidación: {market!r}")


def _settle_asian_diff(diff: float, net_win: float) -> tuple[str, float]:
    """Liquida líneas enteras, medias y cuartos asiáticos (`.25` / `.75`)."""
    q = round(diff * 4.0)
    # Si diff es múltiplo impar de 0.25 (ej. +0.25 o -0.25), es media victoria o media derrota
    if abs(diff * 4.0 - q) < 1e-6 and (q % 2 != 0):
        if q == 1:
            return ("half_win", 0.5 * net_win)
        if q == -1:
            return ("half_loss", -0.5)
    if diff > 1e-9:
        return ("win", net_win)
    if diff < -1e-9:
        return ("loss", -1.0)
    return ("void", 0.0)


# ---------------------------------------------------------------------------
# Verificación explícita Anti-Leakage (`DataLeakageError`)
# ---------------------------------------------------------------------------
def _to_utc_ts(val: Any, field_name: str, context: str) -> pd.Timestamp:
    if isinstance(val, pd.Timestamp):
        if pd.isna(val):
            raise DataLeakageError(f"{context}: timestamp obligatorio `{field_name}` es NaT.")
        return val if val.tzinfo is not None else val.tz_localize("UTC")
    if val is None or pd.isna(val):
        raise DataLeakageError(f"{context}: timestamp obligatorio `{field_name}` es nulo/NaT.")
    ts = pd.Timestamp(val)
    if pd.isna(ts):
        raise DataLeakageError(f"{context}: timestamp inválido en `{field_name}`={val!r}.")
    if ts.tzinfo is None:
        return ts.tz_localize("UTC")
    return ts.tz_convert("UTC")


def verify_no_data_leakage(
    event_row: Mapping[str, Any],
    decision_quotes: list[Mapping[str, Any]],
    ts_decision: pd.Timestamp,
) -> None:
    """Verifica invariantes causales estrictos antes de emitir predicción o pick:
      1. `ts_disponible <= ts_decision`
      2. `ts_decision <= ts_event_start`
      3. `ts_captured <= ts_decision` para toda cuota evaluada en la decisión.
    """
    eid = str(event_row.get("event_id", "<unknown>"))
    ts_dec = _to_utc_ts(ts_decision, "ts_decision", f"event={eid}")
    ts_disp = _to_utc_ts(event_row.get("ts_disponible"), "ts_disponible", f"event={eid}")
    ts_start = _to_utc_ts(event_row.get("ts_event_start"), "ts_event_start", f"event={eid}")

    if ts_disp > ts_dec:
        raise DataLeakageError(
            f"Fuga de features detectada en event_id={eid}: ts_disponible ({ts_disp.isoformat()}) > "
            f"ts_decision ({ts_dec.isoformat()})."
        )
    if ts_dec > ts_start:
        raise DataLeakageError(
            f"Decisión post-kickoff detectada en event_id={eid}: ts_decision ({ts_dec.isoformat()}) > "
            f"ts_event_start ({ts_start.isoformat()})."
        )

    for q in decision_quotes:
        ts_cap = _to_utc_ts(q.get("ts_captured"), "ts_captured", f"event={eid} book={q.get('book')}")
        if ts_cap > ts_dec:
            raise DataLeakageError(
                f"Fuga de cuota en decisión detectada en event_id={eid} (book={q.get('book')}, "
                f"selection={q.get('selection')}): ts_captured ({ts_cap.isoformat()}) > "
                f"ts_decision ({ts_dec.isoformat()})."
            )


def verify_events_frame_no_leakage(events_df: pd.DataFrame) -> pd.DataFrame:
    """Vectoriza la validación `ts_disponible <= ts_decision <= ts_event_start` sobre todo el DataFrame."""
    required = ("event_id", "ts_disponible", "ts_decision", "ts_event_start")
    missing = [c for c in required if c not in events_df.columns]
    if missing:
        raise DataLeakageError(f"events_df carece de columnas temporales obligatorias: {missing}")
    if events_df.empty:
        return events_df.copy()

    out = events_df.copy()
    for col in ("ts_disponible", "ts_decision", "ts_event_start"):
        if out[col].isna().any():
            bad_row = out[out[col].isna()].iloc[0]
            raise DataLeakageError(
                f"Timestamp nulo en columna `{col}` para event_id={bad_row.get('event_id')!r}."
            )
        out[col] = pd.to_datetime(out[col], utc=True)

    leaked_feat = out["ts_disponible"] > out["ts_decision"]
    if leaked_feat.any():
        bad = out.loc[leaked_feat].iloc[0]
        raise DataLeakageError(
            f"Fuga de features detectada en event_id={bad['event_id']}: "
            f"ts_disponible ({bad['ts_disponible'].isoformat()}) > ts_decision ({bad['ts_decision'].isoformat()})."
        )

    post_kick = out["ts_decision"] > out["ts_event_start"]
    if post_kick.any():
        bad = out.loc[post_kick].iloc[0]
        raise DataLeakageError(
            f"Decisión post-kickoff en event_id={bad['event_id']}: "
            f"ts_decision ({bad['ts_decision'].isoformat()}) > ts_event_start ({bad['ts_event_start'].isoformat()})."
        )
    return out


# ---------------------------------------------------------------------------
# Resolución de Precio Ejecutado (2 min delay en `scraped_ws` / `alpha` en `historical_fd`)
# y Resolución Estricta de Cuota de Cierre Sharp
# ---------------------------------------------------------------------------
def resolve_execution_price(
    event_odds: list[dict[str, Any]],
    *,
    source: str,
    market: str,
    line: float | None,
    selection: str,
    book: str,
    price_decision: float,
    ts_decision: pd.Timestamp,
    ts_event_start: pd.Timestamp,
    execution_delay_minutes: float = 2.0,
    historical_delay_alpha: float = 0.05,
) -> tuple[float | None, pd.Timestamp | None, str]:
    """Resuelve `(price_tomado, ts_executed, exec_status)` respetando las reglas no negociables:
      - `scraped_ws`: primer snapshot con `ts_captured >= ts_decision + delay` y `<= ts_event_start`.
      - `historical_fd`: `p_exec = (1 - alpha) * (1 / price_open) + alpha * (1 / price_close)`,
        `price_tomado = 1 / p_exec` sobre la misma casa (jamás apostando a `close` como precio tomado).
    """
    alpha = float(historical_delay_alpha)
    if alpha >= 1.0:
        raise DataLeakageError("historical_delay_alpha >= 1.0 prohibido (apostaría a close).")
    if alpha < 0.0:
        raise ValueError("historical_delay_alpha < 0.0 inválido.")

    m_canon = canonical_market(market)
    l_key = _normalize_line_key(line)
    s_canon = canonical_selection(selection)
    b_canon = canonical_book(book)

    matching = [
        q
        for q in event_odds
        if canonical_market(q["market"]) == m_canon
        and _normalize_line_key(q.get("line")) == l_key
        and canonical_selection(q["selection"]) == s_canon
        and canonical_book(q["book"]) == b_canon
    ]

    src = str(source or "").strip().lower()
    if src == "scraped_ws":
        min_exec_ts = ts_decision + timedelta(minutes=float(execution_delay_minutes))
        eligible = [
            q
            for q in matching
            if (q["ts_captured"] >= min_exec_ts) and (q["ts_captured"] <= ts_event_start)
        ]
        if not eligible:
            return (None, None, "unfilled_no_post_delay_tick")
        eligible.sort(key=lambda r: r["ts_captured"])
        first_tick = eligible[0]
        return (float(first_tick["price_decimal"]), first_tick["ts_captured"], "filled_ws_delayed_tick")

    if src == "historical_fd":
        close_candidates = [
            q
            for q in matching
            if (
                str(q.get("snapshot_stage") or "").lower() == "close"
                or (q["ts_captured"] > ts_decision and q["ts_captured"] <= ts_event_start)
            )
        ]
        if not close_candidates:
            return (None, None, "unfilled_missing_book_close_for_interp")
        close_candidates.sort(key=lambda r: r["ts_captured"])
        price_close = float(close_candidates[-1]["price_decimal"])
        price_open = float(price_decision)
        if not (price_open > 1.0 and price_close > 1.0):
            return (None, None, "unfilled_invalid_odds")
        p_exec = (1.0 - alpha) * (1.0 / price_open) + alpha * (1.0 / price_close)
        price_tomado = 1.0 / p_exec
        return (float(price_tomado), ts_decision, f"filled_historical_interp_alpha_{alpha:.3f}")

    raise ValueError(f"source desconocido en resolve_execution_price: {source!r}")


def resolve_sharp_closing_market(
    event_odds: list[dict[str, Any]],
    *,
    market: str,
    line: float | None,
    ts_event_start: pd.Timestamp,
) -> dict[str, Any]:
    """Resuelve la línea de cierre sharp sin margen cumpliendo estrictamente el contrato A1/A9:
      - `historical_fd`: ÚNICAMENTE snapshot `close` de `pinnacle` con `ts_captured <= ts_event_start`
        (NUNCA `open` de Pinnacle, NUNCA `bfe`, NUNCA casas recreativas).
      - `scraped_ws`: último snapshot de `pinnacle` (`ts_captured <= ts_event_start`); fallback SOLO `smarkets`.
    """
    m_canon = canonical_market(market)
    l_key = _normalize_line_key(line)
    sel_order = _selection_order_for_market(m_canon)

    scoped = [
        q
        for q in event_odds
        if canonical_market(q["market"]) == m_canon
        and _normalize_line_key(q.get("line")) == l_key
        and q["ts_captured"] <= ts_event_start
        and 1.01 <= float(q["price_decimal"]) <= 1000.0
    ]
    if not scoped:
        return {
            "closing_missing": True,
            "closing_book": None,
            "closing_source": None,
            "probs_novig": None,
            "prices_novig": None,
        }

    # Preferencia por `scraped_ws` si existen capturas sharp reales; si no, `historical_fd`
    ws_rows = [q for q in scoped if str(q.get("source") or "").lower() == "scraped_ws"]
    if ws_rows:
        for sharp_book in ("pinnacle", "smarkets"):
            book_rows = [q for q in ws_rows if canonical_book(q["book"]) == sharp_book]
            if not book_rows:
                continue
            latest_by_sel: dict[str, dict[str, Any]] = {}
            for q in book_rows:
                s = canonical_selection(q["selection"])
                prev = latest_by_sel.get(s)
                if prev is None or q["ts_captured"] >= prev["ts_captured"]:
                    latest_by_sel[s] = q
            if all(s in latest_by_sel for s in sel_order):
                raw_prices = np.array([float(latest_by_sel[s]["price_decimal"]) for s in sel_order], dtype=float)
                sum_imp = float(np.sum(1.0 / raw_prices))
                if not (0.9 <= sum_imp <= 1.2):
                    continue
                p_novig = _devig_probs_power(raw_prices)
                if np.all(np.isfinite(p_novig)) and np.all(p_novig > 0.0):
                    return {
                        "closing_missing": False,
                        "closing_book": sharp_book,
                        "closing_source": "scraped_ws",
                        "probs_novig": {s: float(p_novig[i]) for i, s in enumerate(sel_order)},
                        "prices_novig": {s: float(1.0 / p_novig[i]) for i, s in enumerate(sel_order)},
                        "raw_prices": {s: float(raw_prices[i]) for i, s in enumerate(sel_order)},
                    }
        # En `scraped_ws`, si no hay Pinnacle ni Smarkets, `closing_missing = True` (salvo que también exista cierre Pinnacle histórico)

    hist_rows = [q for q in scoped if str(q.get("source") or "").lower() == "historical_fd"]
    if hist_rows:
        pin_close: dict[str, dict[str, Any]] = {}
        for q in hist_rows:
            if canonical_book(q["book"]) != "pinnacle":
                continue
            stage = str(q.get("snapshot_stage") or "").strip().lower()
            # Rechaza explícitamente `open`: exige `stage == "close"` o captura pegada al kickoff (<= 60s antes)
            if stage == "open":
                continue
            if stage != "close" and (ts_event_start - q["ts_captured"]) > timedelta(minutes=5):
                continue
            s = canonical_selection(q["selection"])
            prev = pin_close.get(s)
            if prev is None or q["ts_captured"] >= prev["ts_captured"]:
                pin_close[s] = q
        if all(s in pin_close for s in sel_order):
            raw_prices = np.array([float(pin_close[s]["price_decimal"]) for s in sel_order], dtype=float)
            sum_imp = float(np.sum(1.0 / raw_prices))
            if 0.9 <= sum_imp <= 1.2:
                p_novig = _devig_probs_power(raw_prices)
                if np.all(np.isfinite(p_novig)) and np.all(p_novig > 0.0):
                    return {
                        "closing_missing": False,
                        "closing_book": "pinnacle",
                        "closing_source": "historical_fd",
                        "probs_novig": {s: float(p_novig[i]) for i, s in enumerate(sel_order)},
                        "prices_novig": {s: float(1.0 / p_novig[i]) for i, s in enumerate(sel_order)},
                        "raw_prices": {s: float(raw_prices[i]) for i, s in enumerate(sel_order)},
                    }

    return {
        "closing_missing": True,
        "closing_book": None,
        "closing_source": None,
        "probs_novig": None,
        "prices_novig": None,
    }


# ---------------------------------------------------------------------------
# Partición Walk-Forward + Holdout Sellado (último 20% temporal) + Registro de Pruebas
# ---------------------------------------------------------------------------
def split_walk_forward_and_holdout(
    events_df: pd.DataFrame,
    holdout_fraction: float = 0.20,
) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    """Ordena cronológicamente por `(ts_event_start, event_id)` y separa el último 20% como `holdout_sealed`."""
    if not (0.20 - 1e-9 <= float(holdout_fraction) < 0.50):
        raise HoldoutSealedError(f"holdout_fraction={holdout_fraction} inválido; mínimo obligatorio 0.20.")
    if events_df.empty:
        empty = events_df.copy()
        return empty, empty, {"n_total": 0, "n_dev": 0, "n_holdout": 0, "holdout_cut_ts": None}

    ordered = events_df.sort_values(["ts_event_start", "event_id"], kind="mergesort").reset_index(drop=True)
    n_total = len(ordered)
    n_holdout_target = max(1, int(math.ceil(n_total * float(holdout_fraction) - 1e-12)))
    split_idx = max(1, n_total - n_holdout_target) if n_total >= 2 else 0

    cut_ts = ordered.iloc[split_idx]["ts_event_start"]
    # Si hay empates exactos de timestamp en la frontera, moverlos a holdout garantiza corte temporal estricto
    strict_dev_mask = ordered["ts_event_start"] < cut_ts
    n_strict_dev = int(strict_dev_mask.sum())
    if n_strict_dev >= 1 and (n_total - n_strict_dev) / n_total <= float(holdout_fraction) + 0.05:
        dev_df = ordered.loc[strict_dev_mask].reset_index(drop=True)
        holdout_df = ordered.loc[~strict_dev_mask].reset_index(drop=True)
    else:
        dev_df = ordered.iloc[:split_idx].reset_index(drop=True)
        holdout_df = ordered.iloc[split_idx:].reset_index(drop=True)

    meta = {
        "n_total": int(n_total),
        "n_dev": int(len(dev_df)),
        "n_holdout": int(len(holdout_df)),
        "holdout_fraction_target": float(holdout_fraction),
        "holdout_fraction_actual": float(len(holdout_df) / n_total) if n_total > 0 else 0.0,
        "dev_start_ts": dev_df["ts_event_start"].min().isoformat() if not dev_df.empty else None,
        "dev_end_ts": dev_df["ts_event_start"].max().isoformat() if not dev_df.empty else None,
        "holdout_cut_ts": holdout_df["ts_event_start"].min().isoformat() if not holdout_df.empty else None,
        "holdout_end_ts": holdout_df["ts_event_start"].max().isoformat() if not holdout_df.empty else None,
    }
    return dev_df, holdout_df, meta


def _register_trial(config: BacktestConfig) -> dict[str, Any]:
    """Registra apendizando en `holdout_trial_registry.jsonl` y calcula `n_configs_tested_before_holdout`."""
    reg_path = Path(config.registry_path) if config.registry_path is not None else DEFAULT_REGISTRY_PATH
    reg_path.parent.mkdir(parents=True, exist_ok=True)

    prior_entries: list[dict[str, Any]] = []
    if reg_path.exists():
        with reg_path.open("r", encoding="utf-8") as fh:
            for line in fh:
                s = line.strip()
                if s:
                    prior_entries.append(json.loads(s))

    cfg_hash = config.config_hash()
    prior_dev_hashes = {str(e["config_hash"]) for e in prior_entries if not e.get("unlock_holdout", False)}
    prior_all_hashes = {str(e["config_hash"]) for e in prior_entries}
    n_configs_before = len(prior_dev_hashes) if prior_dev_hashes else len(prior_all_hashes)

    all_hashes_now = set(prior_all_hashes) | {cfg_hash}
    entry = {
        "trial_seq": len(prior_entries) + 1,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "phase": str(config.phase),
        "preset": str(config.preset),
        "model_version": str(config.model_version),
        "eval_split": str(config.eval_split),
        "unlock_holdout": bool(config.unlock_holdout),
        "config_hash": cfg_hash,
        "execution_delay_minutes": float(config.execution_delay_minutes),
        "historical_delay_alpha": float(config.historical_delay_alpha),
        "n_configs_tested_before_this_call": int(n_configs_before),
        "n_distinct_configs_cumulative": int(len(all_hashes_now)),
    }
    with reg_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")

    return {
        "registry_path": str(reg_path),
        "trial_seq": entry["trial_seq"],
        "config_hash": cfg_hash,
        "unlock_holdout": bool(config.unlock_holdout),
        "n_configs_tested_before_holdout": int(n_configs_before),
        "n_trial_runs_before_this_call": len(prior_entries),
        "n_distinct_configs_cumulative": int(len(all_hashes_now)),
    }


# ---------------------------------------------------------------------------
# Bootstrap determinista (>= 1000 remuestreos) para calibración y picks/CLV
# ---------------------------------------------------------------------------
def _ci95_and_significance(boot_samples: np.ndarray) -> tuple[list[float], bool, str]:
    if len(boot_samples) == 0 or not np.all(np.isfinite(boot_samples)):
        return ([0.0, 0.0], False, "no significativa")
    lo, hi = np.percentile(boot_samples, [2.5, 97.5])
    lo_f, hi_f = float(lo), float(hi)
    sig = bool(lo_f > 0.0 or hi_f < 0.0)
    return ([lo_f, hi_f], sig, "significativa" if sig else "no significativa")


def compute_calibration_bootstrap(
    eval_records: list[dict[str, Any]],
    *,
    n_boot: int = 1000,
    seed: int = 20261111,
) -> dict[str, Any]:
    """Calcula `log_loss_model` vs `log_loss_closing_novig` y `brier_model` vs `brier_closing_novig` con IC 95%."""
    n_total = len(eval_records)
    if n_total == 0:
        return {
            "n_events_total": 0,
            "n_events_paired_closing": 0,
            "n_closing_missing": 0,
            "log_loss_model": None,
            "log_loss_closing_novig": None,
            "delta_log_loss": None,
            "delta_log_loss_ci95": [0.0, 0.0],
            "significant": False,
            "significance_label": "no significativa",
            "brier_model": None,
            "brier_closing_novig": None,
            "delta_brier": None,
            "delta_brier_ci95": [0.0, 0.0],
            "brier_significant": False,
            "brier_significance_label": "no significativa",
        }

    ll_all = np.array([float(r["loss_ll_model"]) for r in eval_records], dtype=float)
    br_all = np.array([float(r["loss_brier_model"]) for r in eval_records], dtype=float)

    paired = [r for r in eval_records if not r.get("closing_missing", True)]
    n_paired = len(paired)
    n_missing = n_total - n_paired

    rng_all = np.random.default_rng(seed)
    boot_ll_all = np.empty(n_boot, dtype=float)
    boot_br_all = np.empty(n_boot, dtype=float)
    chunk = 100
    for s in range(0, n_boot, chunk):
        e = min(s + chunk, n_boot)
        idx = rng_all.integers(0, n_total, size=(e - s, n_total))
        boot_ll_all[s:e] = ll_all[idx].mean(axis=1)
        boot_br_all[s:e] = br_all[idx].mean(axis=1)

    ll_all_ci, _, _ = _ci95_and_significance(boot_ll_all)
    br_all_ci, _, _ = _ci95_and_significance(boot_br_all)

    if n_paired == 0:
        return {
            "n_events_total": int(n_total),
            "n_events_paired_closing": 0,
            "n_closing_missing": int(n_missing),
            "log_loss_model_all_events": float(ll_all.mean()),
            "log_loss_model_all_ci95": ll_all_ci,
            "brier_model_all_events": float(br_all.mean()),
            "brier_model_all_ci95": br_all_ci,
            "log_loss_model": float(ll_all.mean()),
            "log_loss_model_ci95": ll_all_ci,
            "log_loss_closing_novig": None,
            "log_loss_closing_novig_ci95": None,
            "delta_log_loss": None,
            "delta_log_loss_ci95": [0.0, 0.0],
            "significant": False,
            "statistically_significant": False,
            "significance_label": "no significativa",
            "brier_model": float(br_all.mean()),
            "brier_model_ci95": br_all_ci,
            "brier_closing_novig": None,
            "brier_closing_novig_ci95": None,
            "delta_brier": None,
            "delta_brier_ci95": [0.0, 0.0],
            "brier_significant": False,
            "brier_significance_label": "no significativa",
        }

    ll_m = np.array([float(r["loss_ll_model"]) for r in paired], dtype=float)
    ll_c = np.array([float(r["loss_ll_closing"]) for r in paired], dtype=float)
    d_ll = ll_m - ll_c

    br_m = np.array([float(r["loss_brier_model"]) for r in paired], dtype=float)
    br_c = np.array([float(r["loss_brier_closing"]) for r in paired], dtype=float)
    d_br = br_m - br_c

    rng = np.random.default_rng(seed + 17)
    b_llm = np.empty(n_boot, dtype=float)
    b_llc = np.empty(n_boot, dtype=float)
    b_dll = np.empty(n_boot, dtype=float)
    b_brm = np.empty(n_boot, dtype=float)
    b_brc = np.empty(n_boot, dtype=float)
    b_dbr = np.empty(n_boot, dtype=float)

    for s in range(0, n_boot, chunk):
        e = min(s + chunk, n_boot)
        idx = rng.integers(0, n_paired, size=(e - s, n_paired))
        b_llm[s:e] = ll_m[idx].mean(axis=1)
        b_llc[s:e] = ll_c[idx].mean(axis=1)
        b_dll[s:e] = d_ll[idx].mean(axis=1)
        b_brm[s:e] = br_m[idx].mean(axis=1)
        b_brc[s:e] = br_c[idx].mean(axis=1)
        b_dbr[s:e] = d_br[idx].mean(axis=1)

    llm_ci, _, _ = _ci95_and_significance(b_llm)
    llc_ci, _, _ = _ci95_and_significance(b_llc)
    dll_ci, dll_sig, dll_lbl = _ci95_and_significance(b_dll)
    brm_ci, _, _ = _ci95_and_significance(b_brm)
    brc_ci, _, _ = _ci95_and_significance(b_brc)
    dbr_ci, dbr_sig, dbr_lbl = _ci95_and_significance(b_dbr)

    return {
        "n_events_total": int(n_total),
        "n_events_paired_closing": int(n_paired),
        "n_closing_missing": int(n_missing),
        "log_loss_model_all_events": float(ll_all.mean()),
        "log_loss_model_all_ci95": ll_all_ci,
        "brier_model_all_events": float(br_all.mean()),
        "brier_model_all_ci95": br_all_ci,
        "log_loss_model": float(ll_m.mean()),
        "log_loss_model_ci95": llm_ci,
        "log_loss_closing_novig": float(ll_c.mean()),
        "log_loss_closing_novig_ci95": llc_ci,
        "delta_log_loss": float(d_ll.mean()),
        "delta_log_loss_ci95": dll_ci,
        "significant": dll_sig,
        "statistically_significant": dll_sig,
        "significance_label": dll_lbl,
        "brier_model": float(br_m.mean()),
        "brier_model_ci95": brm_ci,
        "brier_closing_novig": float(br_c.mean()),
        "brier_closing_novig_ci95": brc_ci,
        "delta_brier": float(d_br.mean()),
        "delta_brier_ci95": dbr_ci,
        "brier_significant": dbr_sig,
        "brier_significance_label": dbr_lbl,
    }


def _max_drawdown_units(pnl_u: np.ndarray) -> float:
    if len(pnl_u) == 0:
        return 0.0
    cum = np.concatenate([[0.0], np.cumsum(pnl_u)])
    peaks = np.maximum.accumulate(cum)
    dd = peaks - cum
    return float(np.max(dd))


def _compute_single_pick_clv(
    price_tomado: float,
    price_cierre_sin_margen: float | None,
    closing_missing: bool,
    *,
    closing_book: str | None = None,
    closing_source: str | None = None,
) -> tuple[float | None, float | None]:
    """Delega a `services/models/clv_report.py` (`a2-ledger`) verificando el contrato exacto de CLV."""
    if closing_missing or price_cierre_sin_margen is None or not (price_cierre_sin_margen > 1.0):
        return (None, None)
    try:
        import clv_report  # type: ignore

        if hasattr(clv_report, "compute_clv_metrics"):
            res = clv_report.compute_clv_metrics(
                price_tomado=float(price_tomado),
                price_cierre_sin_margen=float(price_cierre_sin_margen),
                closing_missing=bool(closing_missing),
                closing_book=closing_book,
                closing_source=closing_source,
            )
            if isinstance(res, Mapping) and "clv_pct" in res and "clv_prob" in res:
                return (
                    float(res["clv_pct"]) if res["clv_pct"] is not None else None,
                    float(res["clv_prob"]) if res["clv_prob"] is not None else None,
                )
    except Exception:
        pass

    clv_pct = (float(price_tomado) / float(price_cierre_sin_margen)) - 1.0
    p_close_novig = 1.0 / float(price_cierre_sin_margen)
    clv_prob = p_close_novig - (1.0 / float(price_tomado))
    return (clv_pct, clv_prob)


def compute_picks_summary_bootstrap(
    picks: list[dict[str, Any]],
    *,
    n_boot: int = 1000,
    seed: int = 20261111,
    precomputed_ledger_glob: Mapping[str, Any] | None = None,
    use_ledger_bridge: bool = True,
) -> dict[str, Any]:
    """Resume métricas de picks (`roi_pct`, `clv_pct_mean`, `clv_prob_mean`, `pct_picks_clv_positive`,
    `max_drawdown_u`) con IC 95% bootstrap `>= 1000` remuestreos consumiendo `clv_report.summarize_picks_bootstrap`."""
    ordered = sorted(picks, key=lambda r: (r["ts_event_start"], r["ts_emitido"], r["pick_id"]))
    n_picks = len(ordered)

    ledger_glob: dict[str, Any] | None = dict(precomputed_ledger_glob) if precomputed_ledger_glob is not None else None
    if ledger_glob is None and use_ledger_bridge:
        try:
            import clv_report  # type: ignore

            if hasattr(clv_report, "summarize_picks_bootstrap"):
                bridge_res = clv_report.summarize_picks_bootstrap(ordered, n_resamples=int(n_boot), seed=int(seed))
                if isinstance(bridge_res, Mapping) and isinstance(bridge_res.get("global"), Mapping):
                    ledger_glob = dict(bridge_res["global"])
        except Exception:
            ledger_glob = None

    if n_picks == 0:
        return {
            "n_picks": 0,
            "n_picks_with_closing": 0,
            "n_closing_missing": 0,
            "total_staked_u": 0.0,
            "total_pnl_u": 0.0,
            "roi_pct": 0.0,
            "roi_pct_ci95": [0.0, 0.0],
            "roi_significant": False,
            "roi_significance_label": "no significativa",
            "clv_pct_mean": None,
            "clv_pct_ci95": [0.0, 0.0],
            "clv_pct_significant": False,
            "clv_pct_significance_label": "no significativa",
            "clv_prob_mean": None,
            "clv_prob_ci95": [0.0, 0.0],
            "clv_prob_significant": False,
            "clv_prob_significance_label": "no significativa",
            "pct_picks_clv_positive": None,
            "pct_picks_clv_positive_ci95": [0.0, 0.0],
            "max_drawdown_u": 0.0,
            "max_drawdown_u_ci95": [0.0, 0.0],
            "clv_report_connected": ledger_glob is not None,
        }

    stakes = np.array([float(p["stake_u"]) for p in ordered], dtype=float)
    pnls = np.array([float(p["pnl_u"]) for p in ordered], dtype=float)
    roi_val = float(pnls.sum() / max(1e-12, stakes.sum()))
    mdd_val = _max_drawdown_units(pnls)

    rng = np.random.default_rng(seed + 31)
    boot_roi = np.empty(n_boot, dtype=float)
    boot_mdd = np.empty(n_boot, dtype=float)
    chunk = 100
    for s in range(0, n_boot, chunk):
        e = min(s + chunk, n_boot)
        idx = rng.integers(0, n_picks, size=(e - s, n_picks))
        idx_sorted = np.sort(idx, axis=1)
        st_b = stakes[idx_sorted].sum(axis=1)
        pn_b = pnls[idx_sorted]
        boot_roi[s:e] = pn_b.sum(axis=1) / np.maximum(1e-12, st_b)
        cum_b = np.concatenate([np.zeros((e - s, 1)), np.cumsum(pn_b, axis=1)], axis=1)
        peaks_b = np.maximum.accumulate(cum_b, axis=1)
        boot_mdd[s:e] = np.max(peaks_b - cum_b, axis=1)

    roi_ci, roi_sig, roi_lbl = _ci95_and_significance(boot_roi)
    mdd_ci, _, _ = _ci95_and_significance(boot_mdd)

    with_clv = [p for p in ordered if p.get("clv_pct") is not None and p.get("clv_prob") is not None]
    n_with_clv = len(with_clv)
    n_clv_missing = n_picks - n_with_clv

    if n_with_clv > 0:
        clv_pct_arr = np.array([float(p["clv_pct"]) for p in with_clv], dtype=float)
        clv_prob_arr = np.array([float(p["clv_prob"]) for p in with_clv], dtype=float)
        clv_pos_arr = (clv_pct_arr > 0.0).astype(float)

        rng_c = np.random.default_rng(seed + 59)
        b_cpct = np.empty(n_boot, dtype=float)
        b_cprob = np.empty(n_boot, dtype=float)
        b_cpos = np.empty(n_boot, dtype=float)
        for s in range(0, n_boot, chunk):
            e = min(s + chunk, n_boot)
            idx = rng_c.integers(0, n_with_clv, size=(e - s, n_with_clv))
            b_cpct[s:e] = clv_pct_arr[idx].mean(axis=1)
            b_cprob[s:e] = clv_prob_arr[idx].mean(axis=1)
            b_cpos[s:e] = clv_pos_arr[idx].mean(axis=1)

        cpct_ci, cpct_sig, cpct_lbl = _ci95_and_significance(b_cpct)
        cprob_ci, cprob_sig, cprob_lbl = _ci95_and_significance(b_cprob)
        cpos_ci, _, _ = _ci95_and_significance(b_cpos)
        clv_pct_mean: float | None = float(clv_pct_arr.mean())
        clv_prob_mean: float | None = float(clv_prob_arr.mean())
        pct_pos: float | None = float(clv_pos_arr.mean())
    else:
        cpct_ci, cpct_sig, cpct_lbl = ([0.0, 0.0], False, "no significativa")
        cprob_ci, cprob_sig, cprob_lbl = ([0.0, 0.0], False, "no significativa")
        cpos_ci = [0.0, 0.0]
        clv_pct_mean = None
        clv_prob_mean = None
        pct_pos = None

    # Cuando `clv_report.summarize_picks_bootstrap` está disponible, adoptar sus estimadores e IC 95% exactos (`mulberry32`)
    if ledger_glob is not None:
        if ledger_glob.get("roi_pct") is not None and ledger_glob.get("roi_pct_ci95") is not None:
            roi_val = float(ledger_glob["roi_pct"])
            roi_ci = [float(x) for x in ledger_glob["roi_pct_ci95"]]
            roi_sig = bool(ledger_glob["roi_statistically_significant"])
            roi_lbl = str(ledger_glob["roi_significance_label"])
        if ledger_glob.get("clv_pct_mean") is not None and ledger_glob.get("clv_pct_ci95") is not None:
            clv_pct_mean = float(ledger_glob["clv_pct_mean"])
            cpct_ci = [float(x) for x in ledger_glob["clv_pct_ci95"]]
            cpct_sig = bool(ledger_glob["statistically_significant"])
            cpct_lbl = str(ledger_glob["significance_label"])
        if ledger_glob.get("clv_prob_mean") is not None and ledger_glob.get("clv_prob_ci95") is not None:
            clv_prob_mean = float(ledger_glob["clv_prob_mean"])
            cprob_ci = [float(x) for x in ledger_glob["clv_prob_ci95"]]
            cprob_boot = ledger_glob.get("clv_prob_bootstrap") or {}
            cprob_sig = bool(cprob_boot.get("statistically_significant", cprob_sig))
            cprob_lbl = str(cprob_boot.get("significance_label", cprob_lbl))
        if ledger_glob.get("pct_picks_clv_positive") is not None:
            pct_pos = float(ledger_glob["pct_picks_clv_positive"])
        if ledger_glob.get("max_drawdown_u") is not None:
            mdd_val = float(ledger_glob["max_drawdown_u"])

    return {
        "n_picks": int(n_picks),
        "n_picks_with_closing": int(n_with_clv),
        "n_closing_missing": int(n_clv_missing),
        "total_staked_u": float(stakes.sum()),
        "total_pnl_u": float(pnls.sum()),
        "roi_pct": roi_val,
        "roi_pct_ci95": roi_ci,
        "roi_significant": roi_sig,
        "roi_significance_label": roi_lbl,
        "clv_pct_mean": clv_pct_mean,
        "clv_pct_ci95": cpct_ci,
        "clv_pct_significant": cpct_sig,
        "clv_pct_significance_label": cpct_lbl,
        "clv_prob_mean": clv_prob_mean,
        "clv_prob_ci95": cprob_ci,
        "clv_prob_significant": cprob_sig,
        "clv_prob_significance_label": cprob_lbl,
        "pct_picks_clv_positive": pct_pos,
        "pct_picks_clv_positive_ci95": cpos_ci,
        "max_drawdown_u": mdd_val,
        "max_drawdown_u_ci95": mdd_ci,
        "clv_report_connected": ledger_glob is not None,
    }


# ---------------------------------------------------------------------------
# Carga y preparación causal de `baseline_v3_0` (Fútbol Tachyon/Singularity v3.0 + NFL Minkowski v3.0)
# ---------------------------------------------------------------------------
def _fast_canon_series(series: pd.Series, fn: Callable[[Any], str]) -> pd.Series:
    uniq = series.dropna().unique()
    mapping = {v: fn(v) for v in uniq}
    return series.map(mapping).fillna("")


def _load_odds_snapshots(config: BacktestConfig) -> pd.DataFrame:
    required_cols = (
        "event_id",
        "sport",
        "league",
        "market",
        "line",
        "selection",
        "book",
        "price_decimal",
        "ts_captured",
        "ts_event_start",
        "source",
    )
    if config.odds_df is not None:
        df = config.odds_df
        if all(c in df.columns for c in ("sport_canon", "market_canon", "selection_canon", "book_canon")):
            return df
        df = df.copy()
    else:
        path = Path(config.odds_parquet_path) if config.odds_parquet_path is not None else DEFAULT_ODDS_PARQUET
        if not path.exists():
            raise FileNotFoundError(
                f"No se encontró odds_snapshots.parquet en {path}. Ejecuta primero el pipeline de `a1-odds`."
            )
        # Verificar el esquema completo de 11 columnas en metadatos Parquet y aplicar pushdown seguro
        try:
            import pyarrow.parquet as pq

            schema_names = set(pq.read_schema(path).names)
            missing_schema = [c for c in required_cols if c not in schema_names]
            if missing_schema:
                raise ValueError(f"odds_snapshots incumple el esquema de 11 columnas; faltan: {missing_schema}")
            pq_filters: list[tuple[str, str, Any]] = []
            if config.events_df is None:
                min_year = min(int(config.first_eval_season_soccer), int(config.first_eval_season_nfl)) - 1
                pq_filters.append(("ts_event_start", ">=", pd.Timestamp(f"{min_year}-01-01T00:00:00Z")))
            if config.pick_selector_fn is None:
                wanted_m = {canonical_market(m) for m in config.markets}
                raw_m_aliases = set(wanted_m)
                if "1x2" in wanted_m:
                    raw_m_aliases.update({"1x2", "h2h_3way", "match_odds", "3way"})
                if "moneyline" in wanted_m:
                    raw_m_aliases.update({"moneyline", "ml", "h2h", "h2h_2way", "2way"})
                if "ah" in wanted_m:
                    raw_m_aliases.update({"ah", "asian_handicap"})
                if "spread" in wanted_m:
                    raw_m_aliases.update({"spread", "point_spread", "handicap"})
                if "totals" in wanted_m:
                    raw_m_aliases.update({"totals", "total", "ou", "over_under", "ou_2_5"})
                pq_filters.append(("market", "in", sorted(raw_m_aliases)))
            df = pd.read_parquet(path, filters=pq_filters or None)
        except ImportError:
            df = pd.read_parquet(path)

    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"odds_snapshots incumple el esquema de 11 columnas; faltan: {missing}")

    df = df.copy()
    df["ts_captured"] = pd.to_datetime(df["ts_captured"], utc=True)
    df["ts_event_start"] = pd.to_datetime(df["ts_event_start"], utc=True)
    df["sport_canon"] = _fast_canon_series(df["sport"], canonical_sport)
    df["market_canon"] = _fast_canon_series(df["market"], canonical_market)
    df["selection_canon"] = _fast_canon_series(df["selection"], canonical_selection)
    df["book_canon"] = _fast_canon_series(df["book"], canonical_book)
    return df


def _fit_causal_simplex_blend(preds_list: list[np.ndarray], y: np.ndarray) -> np.ndarray:
    """Ajusta pesos convexos óptimos minimizando log-loss estrictamente sobre pliegues pasados."""
    from scipy.optimize import minimize

    k = len(preds_list)
    if k == 1 or len(y) < 100:
        return np.full(k, 1.0 / k, dtype=float)
    P = np.stack(preds_list, axis=0)

    def obj(z: np.ndarray) -> float:
        w = np.exp(z - z.max())
        w = w / w.sum()
        mix = np.tensordot(w, P, axes=1)
        mix = np.clip(mix / np.maximum(1e-15, mix.sum(axis=1, keepdims=True)), 1e-15, 1.0)
        return float(-np.mean(np.log(mix[np.arange(len(y)), y])))

    res = minimize(obj, np.zeros(k), method="Nelder-Mead", options={"maxiter": 1500, "xatol": 1e-6})
    w = np.exp(res.x - res.x.max())
    return w / w.sum()


def _build_baseline_v3_0_events(config: BacktestConfig, odds_df: pd.DataFrame) -> pd.DataFrame:
    """Construye el universo causal `v3.0` (Fútbol + NFL) alineado 1:1 con `odds_snapshots.parquet`."""
    wanted_sports = {canonical_sport(s) for s in config.sports}

    # Mapa vectorizado `raw_id / prefixed_id -> (canonical_event_id_in_odds, ts_event_start, has_ws, min_open_ts)`
    min_eval_year = min(int(config.first_eval_season_soccer), int(config.first_eval_season_nfl)) - 1
    recent_odds = odds_df[odds_df["ts_event_start"] >= pd.Timestamp(f"{min_eval_year}-01-01T00:00:00Z")]
    open_mask = (
        recent_odds["snapshot_stage"].eq("open")
        if "snapshot_stage" in recent_odds.columns
        else (recent_odds["ts_event_start"] - recent_odds["ts_captured"]) >= pd.Timedelta(hours=1)
    )
    open_min_by_eid = recent_odds.loc[open_mask].groupby("event_id", sort=False)["ts_captured"].min().to_dict()
    ws_eids = set(recent_odds.loc[recent_odds["source"] == "scraped_ws", "event_id"].unique())
    odds_event_meta = recent_odds.drop_duplicates("event_id", keep="first")[["event_id", "ts_event_start"]]

    id_lookup: dict[str, tuple[str, pd.Timestamp, bool, pd.Timestamp | None]] = {}
    for eid_raw, ts_start_val in zip(odds_event_meta["event_id"].tolist(), odds_event_meta["ts_event_start"].tolist()):
        eid = str(eid_raw)
        entry = (eid, ts_start_val, eid in ws_eids, open_min_by_eid.get(eid_raw))
        id_lookup[eid] = entry
        for prefix in ("soccer:", "football:", "nfl:"):
            if eid.startswith(prefix):
                id_lookup[eid[len(prefix) :]] = entry

    frames: list[pd.DataFrame] = []

    # 1. Fútbol (`PitchLab Tachyon v3.0` walk-forward causal)
    if "football" in wanted_sports:
        frames.append(_load_soccer_v3_0_walk_forward(config, id_lookup))

    # 2. NFL (`PitchLab Minkowski v3.0` walk-forward causal)
    if "nfl" in wanted_sports:
        frames.append(_load_nfl_v3_0_walk_forward(config, id_lookup))

    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def _load_soccer_v3_0_walk_forward(
    config: BacktestConfig,
    id_lookup: dict[str, tuple[str, pd.Timestamp, bool, pd.Timestamp]],
) -> pd.DataFrame:
    art_dir = PRED_LAB_ROOT / "artifacts" / "EXP01_baselines_20261109"
    matches_path = PRED_LAB_ROOT / "data" / "processed" / "matches.parquet"
    matches = pd.read_parquet(
        matches_path,
        columns=["match_id", "div", "season", "match_date", "kickoff_time", "home_goals", "away_goals", "result"],
    )

    if not config.retrain_from_features and (art_dir / "pred_logit.csv").exists() and (art_dir / "pred_hgb.csv").exists():
        p_logit_df = pd.read_csv(art_dir / "pred_logit.csv")
        p_hgb_df = pd.read_csv(art_dir / "pred_hgb.csv")
        merged = p_logit_df.merge(
            p_hgb_df[["match_id", "p_home", "p_draw", "p_away"]],
            on="match_id",
            suffixes=("_logit", "_hgb"),
            how="inner",
        )
        merged["sstart"] = merged["season"].astype(str).str[:4].astype(int)
        merged = merged[merged["sstart"] >= int(config.first_eval_season_soccer)].copy()
        merged = merged.sort_values(["sstart", "match_date", "match_id"], kind="mergesort").reset_index(drop=True)

        # Pesos convexos estrictamente causales: temporada `s` ajusta SOLO con temporadas `< s` y `match_date < cut`
        p_ens = np.zeros((len(merged), 3), dtype=float)
        for s in sorted(merged["sstart"].unique()):
            mask_s = (merged["sstart"] == s).to_numpy()
            cut_date = merged.loc[mask_s, "match_date"].min()
            mask_prev = ((merged["sstart"] < s) & (merged["match_date"] < cut_date)).to_numpy()
            pl_s = merged.loc[mask_s, ["p_home_logit", "p_draw_logit", "p_away_logit"]].to_numpy(dtype=float)
            pg_s = merged.loc[mask_s, ["p_home_hgb", "p_draw_hgb", "p_away_hgb"]].to_numpy(dtype=float)
            if mask_prev.sum() >= 500:
                pl_pr = merged.loc[mask_prev, ["p_home_logit", "p_draw_logit", "p_away_logit"]].to_numpy(dtype=float)
                pg_pr = merged.loc[mask_prev, ["p_home_hgb", "p_draw_hgb", "p_away_hgb"]].to_numpy(dtype=float)
                y_pr = merged.loc[mask_prev, "y"].to_numpy(dtype=int)
                w = _fit_causal_simplex_blend([pl_pr, pg_pr], y_pr)
            else:
                w = np.array([0.55, 0.45], dtype=float)
            mix = w[0] * pl_s + w[1] * pg_s
            p_ens[mask_s] = mix / mix.sum(axis=1, keepdims=True)
        merged["p_home"] = p_ens[:, 0]
        merged["p_draw"] = p_ens[:, 1]
        merged["p_away"] = p_ens[:, 2]
    else:
        import train_motor_a as tma  # type: ignore

        feats = tma.load_features()
        pred_l = tma.run_walk_forward(
            feats,
            lambda tr: tma.fit_logit(tr),
            lambda mc, te: tma.predict_logit(mc[0], mc[1], te),
            folds_from=int(config.first_eval_season_soccer),
            use_rolling=True,
            rolling_seasons=12,
            verbose=False,
        )
        merged = pred_l.copy()
        merged["sstart"] = merged["season"].astype(str).str[:4].astype(int)

    merged = merged.merge(
        matches[["match_id", "kickoff_time", "home_goals", "away_goals"]],
        on="match_id",
        how="left",
    )

    eids: list[str] = []
    ts_starts: list[pd.Timestamp] = []
    ts_decs: list[pd.Timestamp] = []
    ts_disps: list[pd.Timestamp] = []
    sources: list[str] = []

    lead_ws = timedelta(minutes=float(config.decision_lead_minutes_ws))
    for r in merged.itertuples(index=False):
        mid = str(r.match_id)
        hit = id_lookup.get(mid)
        if hit is not None:
            eid, ts_start, has_ws, min_open_ts = hit
        else:
            eid = mid
            ko = str(r.kickoff_time).strip() if pd.notna(r.kickoff_time) and str(r.kickoff_time).strip() else "15:00"
            if len(ko) == 5 and ko[2] == ":":
                ts_start = pd.Timestamp(f"{str(r.match_date)[:10]}T{ko}:00Z")
            else:
                ts_start = pd.Timestamp(f"{str(r.match_date)[:10]}T15:00:00Z")
            has_ws = False
            min_open_ts = ts_start - timedelta(hours=24)

        if has_ws:
            ts_dec = ts_start - lead_ws
            ts_disp = min(ts_dec, ts_start - timedelta(hours=24))
            src = "scraped_ws"
        else:
            # En `historical_fd`, `open` se captura exactamente en `ts_event_start - 24h`
            ts_dec = ts_start - timedelta(hours=24)
            if min_open_ts is not None and min_open_ts <= ts_start - timedelta(minutes=30) and min_open_ts > ts_dec:
                ts_dec = min_open_ts
            ts_disp = ts_dec - timedelta(hours=1)
            src = "historical_fd"

        eids.append(eid)
        ts_starts.append(ts_start)
        ts_decs.append(ts_dec)
        ts_disps.append(ts_disp)
        sources.append(src)

    out = pd.DataFrame(
        {
            "event_id": eids,
            "raw_event_id": merged["match_id"].astype(str).to_numpy(),
            "sport": "football",
            "league": merged["div"].astype(str).to_numpy(),
            "season": merged["season"].astype(str).to_numpy(),
            "fold_key": merged["sstart"].astype(str).to_numpy(),
            "market": "1x2",
            "line": np.nan,
            "source_mode": sources,
            "ts_disponible": ts_disps,
            "ts_decision": ts_decs,
            "ts_event_start": ts_starts,
            "home_score": merged["home_goals"].to_numpy(dtype=float),
            "away_score": merged["away_goals"].to_numpy(dtype=float),
            "y": merged["y"].to_numpy(dtype=int),
            "p_model_home": merged["p_home"].to_numpy(dtype=float),
            "p_model_draw": merged["p_draw"].to_numpy(dtype=float),
            "p_model_away": merged["p_away"].to_numpy(dtype=float),
        }
    )
    return out


def _load_nfl_v3_0_walk_forward(
    config: BacktestConfig,
    id_lookup: dict[str, tuple[str, pd.Timestamp, bool, pd.Timestamp]],
) -> pd.DataFrame:
    nfl_pred_csv = PRED_LAB_ROOT / "models" / "nfl" / "artifacts" / "predictions.csv"
    nfl_games_path = PRED_LAB_ROOT / "data" / "nfl" / "processed" / "nfl_games.parquet"
    ng = pd.read_parquet(
        nfl_games_path,
        columns=["game_id", "season", "gameday", "home_score", "away_score", "result"],
    )

    if not config.retrain_from_features and nfl_pred_csv.exists():
        preds = pd.read_csv(nfl_pred_csv)
        blend = preds[preds["model"] == "blend"].copy()
        blend = blend[blend["season"] >= int(config.first_eval_season_nfl)].copy()
    else:
        import wf as nfl_wf  # type: ignore

        nf = pd.read_parquet(PRED_LAB_ROOT / "data" / "nfl" / "processed" / "nfl_features.parquet")
        nf = nf[nf["home_score"].notna() & nf["away_score"].notna()].copy()
        nf = nf[(nf["n_prior_home"] >= 3) & (nf["n_prior_away"] >= 3)].reset_index(drop=True)
        nf["y"] = nf["result"].map({"H": 0, "T": 1, "A": 2}).astype(int)
        seasons = [s for s in sorted(nf["season"].unique()) if s >= int(config.first_eval_season_nfl)]
        wf_all = nfl_wf.run_walk_forward(nf, seasons, logit_c=0.008, progress=False)
        blend = wf_all[wf_all["model"] == "blend"].copy()

    blend = blend.merge(ng[["game_id", "home_score", "away_score"]], on="game_id", how="left")
    blend = blend[blend["home_score"].notna() & blend["away_score"].notna()].reset_index(drop=True)

    eids: list[str] = []
    ts_starts: list[pd.Timestamp] = []
    ts_decs: list[pd.Timestamp] = []
    ts_disps: list[pd.Timestamp] = []
    sources: list[str] = []
    lead_ws = timedelta(minutes=float(config.decision_lead_minutes_ws))

    for r in blend.itertuples(index=False):
        gid = str(r.game_id)
        hit = id_lookup.get(gid) or id_lookup.get(f"nfl:{gid}")
        if hit is not None:
            eid, ts_start, has_ws, min_open_ts = hit
        else:
            eid = gid
            gday = str(r.gameday)[:10]
            ts_start = pd.Timestamp(f"{gday}T18:00:00Z")
            has_ws = False
            min_open_ts = ts_start - timedelta(hours=24)

        if has_ws:
            ts_dec = ts_start - lead_ws
            ts_disp = min(ts_dec, ts_start - timedelta(hours=24))
            src = "scraped_ws"
        else:
            ts_dec = ts_start - timedelta(hours=24)
            if min_open_ts is not None and min_open_ts <= ts_start - timedelta(minutes=30) and min_open_ts > ts_dec:
                ts_dec = min_open_ts
            ts_disp = ts_dec - timedelta(hours=1)
            src = "historical_fd"

        eids.append(eid)
        ts_starts.append(ts_start)
        ts_decs.append(ts_dec)
        ts_disps.append(ts_disp)
        sources.append(src)

    # En mercado `moneyline` 2-vías de NFL, normalizamos `(p_home, p_away)` condicional a no-empate
    ph3 = blend["p_home"].to_numpy(dtype=float)
    pa3 = blend["p_away"].to_numpy(dtype=float)
    denom2 = np.maximum(1e-12, ph3 + pa3)
    ph2 = ph3 / denom2
    pa2 = pa3 / denom2

    return pd.DataFrame(
        {
            "event_id": eids,
            "raw_event_id": blend["game_id"].astype(str).to_numpy(),
            "sport": "nfl",
            "league": "NFL",
            "season": blend["season"].astype(str).to_numpy(),
            "fold_key": blend["season"].astype(str).to_numpy(),
            "market": "moneyline",
            "line": np.nan,
            "source_mode": sources,
            "ts_disponible": ts_disps,
            "ts_decision": ts_decs,
            "ts_event_start": ts_starts,
            "home_score": blend["home_score"].to_numpy(dtype=float),
            "away_score": blend["away_score"].to_numpy(dtype=float),
            "y": blend["y"].to_numpy(dtype=int),
            "p_model_home": ph2,
            "p_model_draw": np.nan,
            "p_model_away": pa2,
        }
    )


# ---------------------------------------------------------------------------
# Selección de cuotas en `ts_decision`, combinación híbrida causal y política Geodesic v2.0
# ---------------------------------------------------------------------------
def _extract_decision_quotes_for_event(
    event_row: Mapping[str, Any],
    event_odds: list[dict[str, Any]],
    explicit_decision_odds: list[dict[str, Any]] | None,
    ts_decision: pd.Timestamp,
) -> list[dict[str, Any]]:
    """Obtiene las cuotas evaluables en la decisión SIN silenciar violaciones causales en snapshots de decisión."""
    if explicit_decision_odds is not None:
        return list(explicit_decision_odds)

    src_mode = str(event_row.get("source_mode") or "").lower()
    out: list[dict[str, Any]] = []
    for q in event_odds:
        stage = str(q.get("snapshot_stage") or "").strip().lower()
        q_src = str(q.get("source") or src_mode).strip().lower()

        if stage == "decision" or bool(q.get("evaluate_at_decision", False)):
            out.append(q)
            continue

        if q_src == "historical_fd":
            # En `historical_fd` solo el punto `open` existe para decidir; nunca se filtra en silencio su `ts_captured`
            # para que si un `open` trae `ts_captured > ts_decision`, `verify_no_data_leakage` lance `DataLeakageError`.
            if stage == "open":
                out.append(q)
            elif stage == "" and q["ts_captured"] <= ts_decision:
                out.append(q)
        else:
            # En `scraped_ws` multi-tick se toma el último tick capturado `<= ts_decision` por `(market, line, selection, book)`
            if q["ts_captured"] <= ts_decision:
                out.append(q)

    if not out:
        return out

    # En multi-tick quedarnos con la captura más reciente `<= ts_decision` por `(market, line, selection, book)`
    latest: dict[tuple[str, float | None, str, str], dict[str, Any]] = {}
    for q in out:
        key = (
            canonical_market(q["market"]),
            _normalize_line_key(q.get("line")),
            canonical_selection(q["selection"]),
            canonical_book(q["book"]),
        )
        prev = latest.get(key)
        if prev is None or q["ts_captured"] >= prev["ts_captured"]:
            latest[key] = q
    return list(latest.values())


_GEODESIC_GATE_FN: Callable[[dict[str, Any]], dict[str, Any]] | None = None


def _default_geodesic_v2_pick_selector(
    event_ctx: dict[str, Any],
    decision_quotes: list[dict[str, Any]],
    config: BacktestConfig,
) -> list[dict[str, Any]]:
    """Política actual `PitchLab Geodesic v2.0` (`Singularity v3.0` tilt + Quarter-Kelly + Gate Anti-RLM)."""
    global _GEODESIC_GATE_FN
    if _GEODESIC_GATE_FN is None:
        from market_microstructure_v3 import evaluate_geodesic_v2_value_gate  # type: ignore

        _GEODESIC_GATE_FN = evaluate_geodesic_v2_value_gate
    evaluate_geodesic_v2_value_gate = _GEODESIC_GATE_FN

    m_canon = canonical_market(event_ctx["market"])
    l_key = _normalize_line_key(event_ctx.get("line"))
    sel_order = _selection_order_for_market(m_canon)
    p_model_vec = np.asarray(event_ctx["p_model_vec"], dtype=float)

    # Agrupar cuotas de decisión por casa para el mercado `(m_canon, l_key)`
    by_book: dict[str, dict[str, dict[str, Any]]] = {}
    for q in decision_quotes:
        if canonical_market(q["market"]) != m_canon or _normalize_line_key(q.get("line")) != l_key:
            continue
        b = canonical_book(q["book"])
        s = canonical_selection(q["selection"])
        if s in sel_order and 1.01 <= float(q["price_decimal"]) <= 1000.0:
            by_book.setdefault(b, {})[s] = q

    complete_books = {b: sdict for b, sdict in by_book.items() if all(s in sdict for s in sel_order)}
    if not complete_books:
        return []

    # Consenso de mercado en `ts_decision`: prioriza `pinnacle` -> `smarkets` -> `b365` -> primera completa
    ref_probs: np.ndarray | None = None
    sharp_probs: np.ndarray | None = None
    for ref_b in ("pinnacle", "smarkets", "b365", "caliente", "codere", "bw", "wh"):
        if ref_b in complete_books:
            raw_o = np.array([float(complete_books[ref_b][s]["price_decimal"]) for s in sel_order], dtype=float)
            p_dv = _devig_probs_adaptive(raw_o)
            if ref_probs is None:
                ref_probs = p_dv
            if ref_b in ("pinnacle", "smarkets") and sharp_probs is None:
                sharp_probs = p_dv
    if ref_probs is None:
        first_b = next(iter(complete_books))
        ref_probs = _devig_probs_adaptive(
            np.array([float(complete_books[first_b][s]["price_decimal"]) for s in sel_order], dtype=float)
        )

    # Mezcla en espacio logit estilo `Singularity v3.0` usando únicamente información disponible en `ts_decision`
    eps = 1e-6
    alpha_mkt = 0.88 if sharp_probs is not None else 0.82
    anchor_mkt = sharp_probs if sharp_probs is not None else ref_probs
    z = alpha_mkt * np.log(np.clip(anchor_mkt, eps, 1.0 - eps)) + (1.0 - alpha_mkt) * np.log(
        np.clip(p_model_vec, eps, 1.0 - eps)
    )
    z = z - np.max(z)
    p_final_vec = np.exp(z)
    p_final_vec = p_final_vec / p_final_vec.sum()

    # Selección de casa ejecutable (prioridad determinista o line shopping sobre casas reales permitidas)
    allowed_books = [canonical_book(b) for b in config.execution_books_priority]
    avail_exec_books = [b for b in allowed_books if b in complete_books and b in DEFAULT_REAL_EXECUTION_BOOKS]
    if not avail_exec_books:
        return []

    if config.line_shopping and len(avail_exec_books) > 1:
        chosen_quotes: list[dict[str, Any]] = []
        for s in sel_order:
            best_b = max(avail_exec_books, key=lambda b: float(complete_books[b][s]["price_decimal"]))
            chosen_quotes.append(complete_books[best_b][s])
    else:
        # En histórico (`b365` apertura de referencia en Geodesic v2.0), usa la primera casa real disponible con liquidez
        primary_b = "b365" if ("b365" in avail_exec_books and event_ctx.get("source_mode") == "historical_fd") else avail_exec_books[0]
        chosen_quotes = [complete_books[primary_b][s] for s in sel_order]

    exec_odds_vec = [float(q["price_decimal"]) for q in chosen_quotes]
    soft_mkt_probs = _devig_probs_adaptive(np.asarray(exec_odds_vec, dtype=float))

    # Divergencia Sharp vs Soft observada en `ts_decision` (`1 pp prob ≈ 3.0 pp split gap`, igual que `train_motor_b.py`)
    if sharp_probs is not None:
        sharp_gap = (sharp_probs - soft_mkt_probs) * 300.0
    else:
        sharp_gap = np.zeros(len(sel_order), dtype=float)

    rlm_side = "none"
    if len(sel_order) >= 2:
        if sharp_gap[0] >= 12.0:
            rlm_side = "home"
        elif sharp_gap[-1] >= 12.0:
            rlm_side = "away"

    gate_in: dict[str, Any] = {
        "probs": p_final_vec.tolist(),
        "odds": exec_odds_vec,
        "marketProbs": soft_mkt_probs.tolist(),
        "kellyScale": float(config.kelly_scale),
        "minEv": float(config.min_ev),
        "maxEv": float(config.max_ev),
        "maxDisagreement": float(config.max_disagreement),
        "maxStake": float(config.max_stake),
        "reverseLineMovementSide": rlm_side,
        "sharpMoneyDivergenceHomePct": float(sharp_gap[0]),
        "sharpMoneyDivergenceAwayPct": float(sharp_gap[-1]),
    }
    if len(sel_order) == 3:
        gate_in["sharpMoneyDivergenceDrawPct"] = float(sharp_gap[1])

    gate = evaluate_geodesic_v2_value_gate(gate_in)
    best = gate.get("bestBet")
    if best is None or float(best.get("recommendedStake", 0.0)) <= 0.0:
        return []

    side_map = {"home": 0, "draw": 1, "away": -1 if len(sel_order) == 2 else 2}
    idx = side_map[str(best["side"])]
    if idx < 0:
        idx = len(sel_order) - 1
    q_sel = chosen_quotes[idx]

    return [
        {
            "market": m_canon,
            "line": l_key,
            "selection": sel_order[idx],
            "book": canonical_book(q_sel["book"]),
            "source": str(q_sel.get("source") or event_ctx.get("source_mode") or "historical_fd"),
            "price_decision": float(q_sel["price_decimal"]),
            "p_modelo": float(p_model_vec[idx]),
            "p_mercado": float(soft_mkt_probs[idx]),
            "p_final": float(p_final_vec[idx]),
            "stake_u": float(best["recommendedStake"]),
            "tier": str(config.tier_default),
        }
    ]


# ---------------------------------------------------------------------------
# Función Única Pública: `run_backtest(config) -> report`
# ---------------------------------------------------------------------------
def run_backtest(config: BacktestConfig | Mapping[str, Any] | None = None) -> dict[str, Any]:
    """Ejecuta el backtest walk-forward con verificación anti-leakage, ejecución con retraso realista,
    holdout sellado del último 20% temporal y métricas bootstrap (`>= 1000` remuestreos)."""
    cfg = BacktestConfig.from_input(config)
    cfg.validate()

    # 1. Registro obligatorio de cada ensayo en `holdout_trial_registry.jsonl`
    trial_audit = _register_trial(cfg)

    # 2. Carga de cuotas y eventos/features
    odds_df = _load_odds_snapshots(cfg)
    if cfg.events_df is not None:
        raw_events_df = cfg.events_df.copy()
    else:
        raw_events_df = _build_baseline_v3_0_events(cfg, odds_df)

    # Filtrar solo eventos evaluables con resultado conocido y deportes/mercados solicitados
    wanted_sports = {canonical_sport(s) for s in cfg.sports}
    wanted_markets = {canonical_market(m) for m in cfg.markets}
    raw_events_df["sport"] = raw_events_df["sport"].map(canonical_sport)
    raw_events_df["market"] = raw_events_df["market"].map(canonical_market)
    raw_events_df = raw_events_df[
        raw_events_df["sport"].isin(wanted_sports) & raw_events_df["market"].isin(wanted_markets)
    ].copy()
    if "y" in raw_events_df.columns:
        raw_events_df = raw_events_df[raw_events_df["y"].notna()].copy()

    # 3. Verificación global vectorizada de no-fuga en filas de features (`ts_disponible <= ts_decision <= ts_event_start`)
    events_checked = verify_events_frame_no_leakage(raw_events_df)

    # 4. Orden cronológico estricto y reserva del último 20% temporal como `holdout_sealed`
    dev_df, holdout_df, split_meta = split_walk_forward_and_holdout(
        events_checked, holdout_fraction=cfg.holdout_fraction
    )

    if cfg.eval_split == "walk_forward_dev":
        active_df = dev_df
    elif cfg.eval_split == "holdout_sealed":
        active_df = holdout_df
    else:
        active_df = pd.concat([dev_df, holdout_df], ignore_index=True)

    # 5. Si un agente A4/A5 suministra `model_fn`, ejecutar walk-forward estricto por temporada o mes
    if cfg.model_fn is not None and not active_df.empty:
        active_df = _execute_custom_walk_forward_model(
            all_causal_df=events_checked if cfg.unlock_holdout else dev_df,
            target_df=active_df,
            config=cfg,
        )

    # 6. Pre-filtrar e indexar cuotas por `event_id` activo para acceso O(1) incluso sobre millones de snapshots
    active_eids = set(active_df["event_id"].astype(str).unique())
    scoped_odds_df = odds_df[odds_df["event_id"].astype(str).isin(active_eids)]
    if cfg.pick_selector_fn is None:
        relevant_books = {"pinnacle", "smarkets", *(canonical_book(b) for b in cfg.execution_books_priority)}
        scoped_odds_df = scoped_odds_df[
            scoped_odds_df["market_canon"].isin(wanted_markets) & scoped_odds_df["book_canon"].isin(relevant_books)
        ]
    odds_by_event = _group_odds_records(scoped_odds_df)
    explicit_dec_by_event = (
        _group_odds_records(_normalize_decision_odds_df(cfg.decision_odds_df))
        if cfg.decision_odds_df is not None
        else None
    )

    selector_fn = cfg.pick_selector_fn or _default_geodesic_v2_pick_selector

    eval_records: list[dict[str, Any]] = []
    emitted_picks: list[dict[str, Any]] = []
    n_unfilled_execution = 0
    n_candidates_selected = 0

    # Columnas para construcción rápida de vector `p_model`
    cols_idx = {c: i for i, c in enumerate(active_df.columns)}

    for row_tuple in active_df.itertuples(index=False, name=None):
        eid = str(row_tuple[cols_idx["event_id"]])
        sport = str(row_tuple[cols_idx["sport"]])
        league = str(row_tuple[cols_idx["league"]])
        market = str(row_tuple[cols_idx["market"]])
        line_val = _normalize_line_key(row_tuple[cols_idx["line"]]) if "line" in cols_idx else None
        ts_disp: pd.Timestamp = row_tuple[cols_idx["ts_disponible"]]
        ts_dec: pd.Timestamp = row_tuple[cols_idx["ts_decision"]]
        ts_start: pd.Timestamp = row_tuple[cols_idx["ts_event_start"]]
        src_mode = str(row_tuple[cols_idx["source_mode"]]) if "source_mode" in cols_idx else "historical_fd"
        h_score = float(row_tuple[cols_idx["home_score"]]) if "home_score" in cols_idx else float("nan")
        a_score = float(row_tuple[cols_idx["away_score"]]) if "away_score" in cols_idx else float("nan")
        y_raw = int(row_tuple[cols_idx["y"]])

        ev_odds = odds_by_event.get(eid, [])
        exp_dec = explicit_dec_by_event.get(eid, []) if explicit_dec_by_event is not None else None
        dec_quotes = _extract_decision_quotes_for_event(
            {"event_id": eid, "source_mode": src_mode},
            ev_odds,
            exp_dec,
            ts_dec,
        )

        # VERIFICACIÓN EXPLÍCITA ANTI-LEAKAGE POR EVENTO ANTES DE CUALQUIER PREDICCIÓN/PICK
        verify_no_data_leakage(
            {"event_id": eid, "ts_disponible": ts_disp, "ts_event_start": ts_start},
            dec_quotes,
            ts_dec,
        )

        sel_order = _selection_order_for_market(market)
        p_model_vec = _extract_model_prob_vector(row_tuple, cols_idx, market)

        # Resolución de cierre sharp para calibración y CLV (estrictamente post-decisión)
        closing_info = resolve_sharp_closing_market(
            ev_odds, market=market, line=line_val, ts_event_start=ts_start
        )

        outcome_idx = _resolve_categorical_outcome_index(market, line_val, h_score, a_score, y_raw)
        if outcome_idx is not None:
            p_m_norm = np.clip(p_model_vec / np.maximum(1e-15, p_model_vec.sum()), 1e-15, 1.0)
            oh = np.zeros(len(sel_order), dtype=float)
            oh[outcome_idx] = 1.0
            ll_m = float(-math.log(float(p_m_norm[outcome_idx])))
            br_m = float(np.sum((p_m_norm - oh) ** 2))

            if not closing_info["closing_missing"]:
                p_c_vec = np.array([closing_info["probs_novig"][s] for s in sel_order], dtype=float)
                p_c_norm = np.clip(p_c_vec / np.maximum(1e-15, p_c_vec.sum()), 1e-15, 1.0)
                ll_c: float | None = float(-math.log(float(p_c_norm[outcome_idx])))
                br_c: float | None = float(np.sum((p_c_norm - oh) ** 2))
                c_miss = False
            else:
                ll_c = None
                br_c = None
                c_miss = True

            eval_records.append(
                {
                    "event_id": eid,
                    "sport": sport,
                    "league": league,
                    "market": market,
                    "closing_missing": c_miss,
                    "loss_ll_model": ll_m,
                    "loss_ll_closing": ll_c,
                    "loss_brier_model": br_m,
                    "loss_brier_closing": br_c,
                }
            )

        # Emisión de picks en `ts_decision` (únicamente con `dec_quotes` verificadas `<= ts_decision`)
        event_ctx = {
            "event_id": eid,
            "sport": sport,
            "league": league,
            "market": market,
            "line": line_val,
            "source_mode": src_mode,
            "ts_disponible": ts_disp,
            "ts_decision": ts_dec,
            "ts_event_start": ts_start,
            "p_model_vec": p_model_vec,
        }
        cand_picks = selector_fn(event_ctx, dec_quotes, cfg)
        dec_quote_keys = {
            (
                canonical_market(q["market"]),
                _normalize_line_key(q.get("line")),
                canonical_selection(q["selection"]),
                canonical_book(q["book"]),
            )
            for q in dec_quotes
        }
        for p_idx, cand in enumerate(cand_picks):
            n_candidates_selected += 1
            c_mkt = canonical_market(cand.get("market", market))
            c_line = _normalize_line_key(cand.get("line", line_val))
            c_sel = canonical_selection(cand["selection"])
            c_book = canonical_book(cand["book"])
            c_src = str(cand.get("source") or src_mode)
            price_dec = float(cand["price_decision"])

            if "ts_captured" in cand and cand["ts_captured"] is not None:
                cand_ts_cap = _to_utc_ts(cand["ts_captured"], "ts_captured", f"pick_candidate event={eid}")
                if cand_ts_cap > ts_dec:
                    raise DataLeakageError(
                        f"Fuga en pick seleccionado en event_id={eid}: ts_captured ({cand_ts_cap.isoformat()}) > "
                        f"ts_decision ({ts_dec.isoformat()})."
                    )
            if (c_mkt, c_line, c_sel, c_book) not in dec_quote_keys:
                raise DataLeakageError(
                    f"Fuga en pick seleccionado en event_id={eid}: no existe cuota capturada <= ts_decision "
                    f"para {(c_mkt, c_line, c_sel, c_book)}."
                )

            price_tomado, ts_exec, exec_status = resolve_execution_price(
                ev_odds,
                source=c_src,
                market=c_mkt,
                line=c_line,
                selection=c_sel,
                book=c_book,
                price_decision=price_dec,
                ts_decision=ts_dec,
                ts_event_start=ts_start,
                execution_delay_minutes=cfg.execution_delay_minutes,
                historical_delay_alpha=cfg.historical_delay_alpha,
            )
            if price_tomado is None or ts_exec is None or price_tomado < 1.01:
                n_unfilled_execution += 1
                continue

            # Cierre sharp para el mercado del pick
            pick_closing = (
                closing_info
                if (c_mkt == market and c_line == line_val)
                else resolve_sharp_closing_market(ev_odds, market=c_mkt, line=c_line, ts_event_start=ts_start)
            )
            c_missing = bool(pick_closing["closing_missing"])
            price_close_novig = (
                float(pick_closing["prices_novig"][c_sel])
                if (not c_missing and pick_closing["prices_novig"] and c_sel in pick_closing["prices_novig"])
                else None
            )
            clv_pct, clv_prob = _compute_single_pick_clv(
                price_tomado,
                price_close_novig,
                c_missing,
                closing_book=pick_closing.get("closing_book"),
                closing_source=pick_closing.get("closing_source"),
            )

            stake_u = float(cand["stake_u"])
            status_str, unit_ret = settle_selection_unit_return(
                c_mkt, c_sel, c_line, price_tomado, h_score, a_score, outcome_label=y_raw
            )
            pnl_u = stake_u * unit_ret
            p_modelo_c = float(np.clip(float(cand["p_modelo"]), 1e-6, 1.0 - 1e-6))
            p_mercado_c = float(np.clip(float(cand["p_mercado"]), 1e-6, 1.0 - 1e-6))
            p_final = float(np.clip(float(cand["p_final"]), 1e-6, 1.0 - 1e-6))
            ev_exec = p_final * price_tomado - 1.0

            try:
                import clv_report  # type: ignore

                feat_hash = clv_report.compute_features_hash(
                    {"event_id": eid, "ts_disponible": ts_disp.isoformat(), "p_model_vec": p_model_vec.tolist()}
                )
            except Exception:
                feat_hash = hashlib.sha256(
                    f"{eid}|{ts_disp.isoformat()}|{np.round(p_model_vec, 8).tolist()}".encode("utf-8")
                ).hexdigest()

            emitted_picks.append(
                {
                    "pick_id": f"{cfg.phase}:{eid}:{c_mkt}:{c_sel}:{p_idx}",
                    "ts_emitido": ts_dec.isoformat(),
                    "ts_executed": ts_exec.isoformat(),
                    "ts_event_start": ts_start.isoformat(),
                    "event_id": eid,
                    "sport": sport,
                    "league": league,
                    "market": c_mkt,
                    "line": c_line,
                    "selection": c_sel,
                    "book": c_book,
                    "source": c_src,
                    "execution_status": exec_status,
                    "price_decision": price_dec,
                    "price_tomado": price_tomado,
                    "price_cierre_sin_margen": price_close_novig,
                    "closing_missing": c_missing,
                    "closing_book": pick_closing.get("closing_book"),
                    "closing_source": pick_closing.get("closing_source"),
                    "p_modelo": p_modelo_c,
                    "p_mercado": p_mercado_c,
                    "p_final": p_final,
                    "ev": ev_exec,
                    "stake_u": stake_u,
                    "outcome": status_str,
                    "settlement": status_str,
                    "pnl_u": pnl_u,
                    "clv_pct": clv_pct,
                    "clv_prob": clv_prob,
                    "tier": str(cand.get("tier") or cfg.tier_default),
                    "version_modelo": str(cfg.model_version),
                    "features_hash": feat_hash,
                }
            )

    # 7. Agregación con Bootstrap (>= 1000 remuestreos) global y por `league × market`
    n_boot = int(cfg.bootstrap_samples)
    cal_global = compute_calibration_bootstrap(eval_records, n_boot=n_boot, seed=cfg.seed)

    ledger_full_summary: dict[str, Any] | None = None
    try:
        import clv_report  # type: ignore

        if hasattr(clv_report, "summarize_picks_bootstrap"):
            ordered_all = sorted(emitted_picks, key=lambda r: (r["ts_event_start"], r["ts_emitido"], r["pick_id"]))
            raw_sum = clv_report.summarize_picks_bootstrap(ordered_all, n_resamples=n_boot, seed=int(cfg.seed))
            if isinstance(raw_sum, Mapping):
                ledger_full_summary = dict(raw_sum)
    except Exception:
        ledger_full_summary = None

    picks_global = compute_picks_summary_bootstrap(
        emitted_picks,
        n_boot=n_boot,
        seed=cfg.seed,
        precomputed_ledger_glob=(ledger_full_summary.get("global") if ledger_full_summary else None),
        use_ledger_bridge=False,
    )

    cal_by_league_market: dict[str, dict[str, Any]] = {}
    groups_lm: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for rec in eval_records:
        groups_lm.setdefault((rec["league"], rec["market"]), []).append(rec)
    for idx_g, ((lg, mk), recs) in enumerate(sorted(groups_lm.items())):
        key = f"{lg}__{mk}"
        cal_by_league_market[key] = {
            "league": lg,
            "market": mk,
            **compute_calibration_bootstrap(recs, n_boot=n_boot, seed=cfg.seed + 101 + idx_g),
        }

    cal_by_sport: dict[str, dict[str, Any]] = {}
    groups_sp: dict[str, list[dict[str, Any]]] = {}
    for rec in eval_records:
        groups_sp.setdefault(rec["sport"], []).append(rec)
    for idx_s, (sp, recs) in enumerate(sorted(groups_sp.items())):
        cal_by_sport[sp] = compute_calibration_bootstrap(recs, n_boot=n_boot, seed=cfg.seed + 503 + idx_s)

    picks_by_league_market: dict[str, dict[str, Any]] = {}
    p_groups_lm: dict[tuple[str, str], list[dict[str, Any]]] = {}
    ledger_by_lm = (ledger_full_summary.get("by_league_market") or {}) if ledger_full_summary else {}
    for pk in emitted_picks:
        p_groups_lm.setdefault((pk["league"], pk["market"]), []).append(pk)
    for idx_p, ((lg, mk), pks) in enumerate(sorted(p_groups_lm.items())):
        picks_by_league_market[f"{lg}__{mk}"] = {
            "league": lg,
            "market": mk,
            **compute_picks_summary_bootstrap(
                pks,
                n_boot=n_boot,
                seed=cfg.seed + 907 + idx_p,
                precomputed_ledger_glob=ledger_by_lm.get(f"{lg}::{mk}"),
                use_ledger_bridge=False,
            ),
        }

    report: dict[str, Any] = {
        "schema_version": "a3_backtest_v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "phase": cfg.phase,
        "preset": cfg.preset,
        "model_version": cfg.model_version,
        "eval_split": cfg.eval_split,
        "unlock_holdout": bool(cfg.unlock_holdout),
        "config_hash": trial_audit["config_hash"],
        "config": cfg.canonical_dict_for_hash(),
        "split_summary": split_meta,
        "holdout_audit": trial_audit,
        "execution_summary": {
            "execution_delay_minutes": float(cfg.execution_delay_minutes),
            "historical_delay_alpha": float(cfg.historical_delay_alpha),
            "n_candidates_selected_at_decision": int(n_candidates_selected),
            "n_picks_filled": int(len(emitted_picks)),
            "n_unfilled_execution": int(n_unfilled_execution),
        },
        # Claves obligatorias de primer nivel exigidas por el contrato A3
        "log_loss_model": cal_global["log_loss_model"],
        "log_loss_model_ci95": cal_global.get("log_loss_model_ci95"),
        "log_loss_closing_novig": cal_global["log_loss_closing_novig"],
        "log_loss_closing_novig_ci95": cal_global.get("log_loss_closing_novig_ci95"),
        "delta_log_loss": cal_global["delta_log_loss"],
        "delta_log_loss_ci95": cal_global["delta_log_loss_ci95"],
        "delta_log_loss_significant": cal_global["significant"],
        "delta_log_loss_significance": cal_global["significance_label"],
        "brier_model": cal_global["brier_model"],
        "brier_model_ci95": cal_global.get("brier_model_ci95"),
        "brier_closing_novig": cal_global["brier_closing_novig"],
        "brier_closing_novig_ci95": cal_global.get("brier_closing_novig_ci95"),
        "delta_brier": cal_global["delta_brier"],
        "delta_brier_ci95": cal_global["delta_brier_ci95"],
        "delta_brier_significant": cal_global["brier_significant"],
        "delta_brier_significance": cal_global["brier_significance_label"],
        "n_picks": picks_global["n_picks"],
        "roi_pct": picks_global["roi_pct"],
        "roi_pct_ci95": picks_global["roi_pct_ci95"],
        "roi_significant": picks_global["roi_significant"],
        "roi_significance": picks_global["roi_significance_label"],
        "clv_pct_mean": picks_global["clv_pct_mean"],
        "clv_pct_ci95": picks_global["clv_pct_ci95"],
        "clv_pct_significant": picks_global["clv_pct_significant"],
        "clv_pct_significance": picks_global["clv_pct_significance_label"],
        "clv_prob_mean": picks_global["clv_prob_mean"],
        "clv_prob_ci95": picks_global["clv_prob_ci95"],
        "clv_prob_significant": picks_global["clv_prob_significant"],
        "clv_prob_significance": picks_global["clv_prob_significance_label"],
        "pct_picks_clv_positive": picks_global["pct_picks_clv_positive"],
        "pct_picks_clv_positive_ci95": picks_global["pct_picks_clv_positive_ci95"],
        "max_drawdown_u": picks_global["max_drawdown_u"],
        "max_drawdown_u_ci95": picks_global["max_drawdown_u_ci95"],
        "calibration": {
            "global": cal_global,
            "by_sport": cal_by_sport,
            "by_league_market": cal_by_league_market,
        },
        "betting": {
            "global": picks_global,
            "by_league_market": picks_by_league_market,
        },
    }
    if cfg.unlock_holdout:
        report["n_configs_tested_before_holdout"] = int(trial_audit["n_configs_tested_before_holdout"])
    return report


def _normalize_decision_odds_df(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    if "ts_captured" not in out.columns:
        raise DataLeakageError("decision_odds_df carece de la columna obligatoria `ts_captured`.")
    if out["ts_captured"].isna().any():
        raise DataLeakageError("decision_odds_df contiene filas con `ts_captured` nulo/NaT.")
    out["ts_captured"] = pd.to_datetime(out["ts_captured"], utc=True)
    if "ts_event_start" in out.columns and out["ts_event_start"].notna().all():
        out["ts_event_start"] = pd.to_datetime(out["ts_event_start"], utc=True)
    return out


def _group_odds_records(df: pd.DataFrame) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    if df.empty:
        return grouped
    n = len(df)
    eids = df["event_id"].astype(str).tolist()
    mkts = (df["market_canon"] if "market_canon" in df.columns else _fast_canon_series(df["market"], canonical_market)).tolist()
    lines_raw = df["line"].tolist() if "line" in df.columns else [None] * n
    sels = (df["selection_canon"] if "selection_canon" in df.columns else _fast_canon_series(df["selection"], canonical_selection)).tolist()
    books = (df["book_canon"] if "book_canon" in df.columns else _fast_canon_series(df["book"], canonical_book)).tolist()
    prices = df["price_decimal"].astype(float).tolist()
    ts_caps = list(df["ts_captured"])
    srcs = df["source"].astype(str).tolist() if "source" in df.columns else ["historical_fd"] * n
    stages = (
        df["snapshot_stage"].fillna("").astype(str).tolist()
        if "snapshot_stage" in df.columns
        else [""] * n
    )
    has_eval_flag = "evaluate_at_decision" in df.columns
    eval_flags = df["evaluate_at_decision"].astype(bool).tolist() if has_eval_flag else None

    for i in range(n):
        rec: dict[str, Any] = {
            "event_id": eids[i],
            "market": mkts[i],
            "line": lines_raw[i],
            "selection": sels[i],
            "book": books[i],
            "price_decimal": prices[i],
            "ts_captured": ts_caps[i],
            "source": srcs[i],
            "snapshot_stage": stages[i],
        }
        if eval_flags is not None and eval_flags[i]:
            rec["evaluate_at_decision"] = True
        eid_key = eids[i]
        bucket = grouped.get(eid_key)
        if bucket is None:
            grouped[eid_key] = [rec]
        else:
            bucket.append(rec)
    return grouped


def _extract_model_prob_vector(
    row_tuple: tuple[Any, ...],
    cols_idx: dict[str, int],
    market: str,
) -> np.ndarray:
    m = canonical_market(market)
    if m == "1x2":
        return np.array(
            [
                float(row_tuple[cols_idx["p_model_home"]]),
                float(row_tuple[cols_idx["p_model_draw"]]),
                float(row_tuple[cols_idx["p_model_away"]]),
            ],
            dtype=float,
        )
    if m in ("moneyline", "ah", "spread"):
        ph = float(row_tuple[cols_idx["p_model_home"]])
        pa = float(row_tuple[cols_idx["p_model_away"]])
        s = max(1e-12, ph + pa)
        return np.array([ph / s, pa / s], dtype=float)
    if m == "totals":
        po = float(row_tuple[cols_idx["p_model_over"]])
        pu = float(row_tuple[cols_idx["p_model_under"]])
        s = max(1e-12, po + pu)
        return np.array([po / s, pu / s], dtype=float)
    if m == "btts":
        py = float(row_tuple[cols_idx["p_model_yes"]])
        pn = float(row_tuple[cols_idx["p_model_no"]])
        s = max(1e-12, py + pn)
        return np.array([py / s, pn / s], dtype=float)
    raise ValueError(f"Mercado no soportado en _extract_model_prob_vector: {market!r}")


def _resolve_categorical_outcome_index(
    market: str,
    line: float | None,
    home_score: float,
    away_score: float,
    y_raw: int,
) -> int | None:
    m = canonical_market(market)
    if m == "1x2":
        if 0 <= int(y_raw) <= 2:
            return int(y_raw)
        if pd.notna(home_score) and pd.notna(away_score):
            return 0 if home_score > away_score else (1 if home_score == away_score else 2)
        return None
    if m == "moneyline":
        if pd.notna(home_score) and pd.notna(away_score):
            if home_score == away_score:
                return None  # Empate/push en 2-way no aplica a log-loss categórico binario
            return 0 if home_score > away_score else 1
        if y_raw == 1:
            return None
        return 0 if y_raw == 0 else 1
    if m in ("ah", "spread") and line is not None and pd.notna(home_score) and pd.notna(away_score):
        diff = (float(home_score) - float(away_score)) + float(line)
        if abs(diff) < 1e-9:
            return None
        return 0 if diff > 0.0 else 1
    if m == "totals" and line is not None and pd.notna(home_score) and pd.notna(away_score):
        diff = (float(home_score) + float(away_score)) - float(line)
        if abs(diff) < 1e-9:
            return None
        return 0 if diff > 0.0 else 1
    if m == "btts" and pd.notna(home_score) and pd.notna(away_score):
        return 0 if (home_score > 0 and away_score > 0) else 1
    return None


def _execute_custom_walk_forward_model(
    all_causal_df: pd.DataFrame,
    target_df: pd.DataFrame,
    config: BacktestConfig,
) -> pd.DataFrame:
    """Ejecuta `config.model_fn(train_df, test_fold_df, config)` pliegue a pliegue verificando cero fuga."""
    assert config.model_fn is not None
    df_all = all_causal_df.copy()
    tgt = target_df.copy()

    if config.walk_forward_granularity == "month":
        df_all["_wf_key"] = df_all["ts_event_start"].dt.strftime("%Y-%m")
        tgt["_wf_key"] = tgt["ts_event_start"].dt.strftime("%Y-%m")
    else:
        col = "fold_key" if "fold_key" in df_all.columns else "season"
        df_all["_wf_key"] = df_all[col].astype(str)
        tgt["_wf_key"] = tgt[col].astype(str)

    out_folds: list[pd.DataFrame] = []
    for fk in sorted(tgt["_wf_key"].unique()):
        fold_te = tgt[tgt["_wf_key"] == fk].copy()
        fold_cut_ts = fold_te["ts_decision"].min()
        fold_tr = df_all[df_all["ts_event_start"] < fold_cut_ts].copy()
        if (fold_tr["ts_event_start"] >= fold_cut_ts).any():
            raise DataLeakageError(f"Fuga en pliegue walk-forward {fk}: evento de train >= fold_cut_ts.")
        pred_fold = config.model_fn(fold_tr, fold_te, config)
        out_folds.append(pred_fold)

    return pd.concat(out_folds, ignore_index=True) if out_folds else tgt


# ---------------------------------------------------------------------------
# Suite Reproducible Línea Base `v3.0` (Puerta 1)
# ---------------------------------------------------------------------------
def run_baseline_v3_0_suite(
    *,
    odds_parquet_path: str | Path | None = None,
    registry_path: str | Path | None = None,
    out_json_path: str | Path = DEFAULT_BASELINE_OUT,
    bootstrap_samples: int = 1000,
    seed: int = 20261111,
) -> dict[str, Any]:
    """Ejecuta la Línea Base `v3.0` (Fútbol + NFL + política actual `Geodesic v2.0`) sobre `walk_forward_dev`
    (primer 80% temporal, dejando el 20% `holdout_sealed` 100% intacto) con `alpha = 0.05` por defecto
    más análisis de sensibilidad en `alpha = 0.0` y `alpha = 0.10`."""
    probe_cfg = BacktestConfig(
        odds_parquet_path=odds_parquet_path,
    )
    shared_odds = _load_odds_snapshots(probe_cfg)
    wanted_markets = {canonical_market(m) for m in probe_cfg.markets}
    min_year = min(int(probe_cfg.first_eval_season_soccer), int(probe_cfg.first_eval_season_nfl)) - 1
    shared_odds = shared_odds[
        (shared_odds["ts_event_start"] >= pd.Timestamp(f"{min_year}-01-01T00:00:00Z"))
        & shared_odds["market_canon"].isin(wanted_markets)
    ].reset_index(drop=True)
    shared_events = _build_baseline_v3_0_events(probe_cfg, shared_odds)

    primary_cfg = BacktestConfig(
        phase="ola1_puerta1_baseline_v3_0",
        preset="baseline_v3_0",
        model_version="spacetime_v3.0+geodesic_v2.0",
        eval_split="walk_forward_dev",
        unlock_holdout=False,
        historical_delay_alpha=0.05,
        execution_delay_minutes=2.0,
        bootstrap_samples=bootstrap_samples,
        seed=seed,
        odds_parquet_path=odds_parquet_path,
        registry_path=registry_path,
        odds_df=shared_odds,
        events_df=shared_events,
    )
    primary_report = run_backtest(primary_cfg)

    sensitivity: dict[str, Any] = {"alpha_0.05": primary_report}
    for alpha_val in (0.0, 0.10):
        sens_cfg = BacktestConfig(
            phase=f"ola1_puerta1_baseline_v3_0_sensitivity_alpha_{alpha_val:.2f}",
            preset="baseline_v3_0",
            model_version="spacetime_v3.0+geodesic_v2.0",
            eval_split="walk_forward_dev",
            unlock_holdout=False,
            historical_delay_alpha=alpha_val,
            execution_delay_minutes=2.0,
            bootstrap_samples=bootstrap_samples,
            seed=seed,
            odds_parquet_path=odds_parquet_path,
            registry_path=registry_path,
            odds_df=shared_odds,
            events_df=shared_events,
        )
        sens_rep = run_backtest(sens_cfg)
        sensitivity[f"alpha_{alpha_val:.2f}"] = {
            "historical_delay_alpha": alpha_val,
            "config_hash": sens_rep["config_hash"],
            "n_picks": sens_rep["n_picks"],
            "roi_pct": sens_rep["roi_pct"],
            "roi_pct_ci95": sens_rep["roi_pct_ci95"],
            "roi_significant": sens_rep["roi_significant"],
            "roi_significance": sens_rep["roi_significance"],
            "clv_pct_mean": sens_rep["clv_pct_mean"],
            "clv_pct_ci95": sens_rep["clv_pct_ci95"],
            "clv_pct_significant": sens_rep["clv_pct_significant"],
            "clv_prob_mean": sens_rep["clv_prob_mean"],
            "clv_prob_ci95": sens_rep["clv_prob_ci95"],
            "pct_picks_clv_positive": sens_rep["pct_picks_clv_positive"],
            "max_drawdown_u": sens_rep["max_drawdown_u"],
            "max_drawdown_u_ci95": sens_rep["max_drawdown_u_ci95"],
        }

    bundle = {
        "codename": "PitchLab Baseline v3.0 — Walk-Forward Backtest (Puerta 1)",
        "reproduction_command": (
            "research/prediction-lab/.venv/Scripts/python.exe services/models/backtest.py "
            "--preset baseline_v3_0 --out services/models/artifacts/baseline_v3_0_backtest.json"
        ),
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_sealed_untouched": True,
        "primary_alpha_0_05": primary_report,
        "alpha_sensitivity": {
            "alpha_0.00": sensitivity["alpha_0.00"],
            "alpha_0.05": {
                "historical_delay_alpha": 0.05,
                "config_hash": primary_report["config_hash"],
                "n_picks": primary_report["n_picks"],
                "roi_pct": primary_report["roi_pct"],
                "roi_pct_ci95": primary_report["roi_pct_ci95"],
                "roi_significant": primary_report["roi_significant"],
                "roi_significance": primary_report["roi_significance"],
                "clv_pct_mean": primary_report["clv_pct_mean"],
                "clv_pct_ci95": primary_report["clv_pct_ci95"],
                "clv_pct_significant": primary_report["clv_pct_significant"],
                "clv_prob_mean": primary_report["clv_prob_mean"],
                "clv_prob_ci95": primary_report["clv_prob_ci95"],
                "pct_picks_clv_positive": primary_report["pct_picks_clv_positive"],
                "max_drawdown_u": primary_report["max_drawdown_u"],
                "max_drawdown_u_ci95": primary_report["max_drawdown_u_ci95"],
            },
            "alpha_0.10": sensitivity["alpha_0.10"],
        },
    }

    out_path = Path(out_json_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(bundle, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return bundle


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Arnés de backtest walk-forward PitchLab A3.")
    parser.add_argument("--preset", default="baseline_v3_0", choices=["baseline_v3_0"])
    parser.add_argument("--odds", default=None, help="Ruta opcional a odds_snapshots.parquet")
    parser.add_argument("--registry", default=None, help="Ruta opcional a holdout_trial_registry.jsonl")
    parser.add_argument("--out", default=str(DEFAULT_BASELINE_OUT), help="Ruta JSON de salida")
    parser.add_argument("--bootstrap-samples", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=20261111)
    args = parser.parse_args()

    bundle = run_baseline_v3_0_suite(
        odds_parquet_path=args.odds,
        registry_path=args.registry,
        out_json_path=args.out,
        bootstrap_samples=args.bootstrap_samples,
        seed=args.seed,
    )
    prim = bundle["primary_alpha_0_05"]
    print(
        f"[A3 Baseline v3.0 · {prim['eval_split']}] "
        f"eventos_dev={prim['split_summary']['n_dev']:,} "
        f"(holdout_sellado={prim['split_summary']['n_holdout']:,}, intacto={bundle['holdout_sealed_untouched']})\n"
        f"  Calibración pareada vs cierre sharp (n={prim['calibration']['global']['n_events_paired_closing']:,}): "
        f"ll_model={prim['log_loss_model']:.5f} vs ll_close={prim['log_loss_closing_novig']:.5f} "
        f"(Δ={prim['delta_log_loss']:+.5f}, IC95={prim['delta_log_loss_ci95']}, {prim['delta_log_loss_significance']})\n"
        f"  Picks alpha=0.05 (n={prim['n_picks']:,}): ROI={prim['roi_pct']:+.4%} IC95={prim['roi_pct_ci95']} "
        f"({prim['roi_significance']}) | CLV%={prim['clv_pct_mean']} | MaxDD={prim['max_drawdown_u']:.3f}u\n"
        f"  Escrito -> {args.out}",
        flush=True,
    )


if __name__ == "__main__":
    main()
