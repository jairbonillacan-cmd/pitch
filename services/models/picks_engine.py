#!/usr/bin/env python3
"""A28 (Ola 2 · Agente A5) — Motor de decisión de picks y calibrador walk-forward (`Geodesic v3.1`).

Espejo exacto 1:1 (`|Δ| < 1e-12`) de `src/domain/prediction/picks.ts` e integrador de calibración
estrictamente causal sobre `walk_forward_dev` (`unlock_holdout=False` SIEMPRE en Ola 2) usando
`services/models/backtest.py` (`run_backtest`) y `services/models/artifacts/blend_weights_v3_1.json`.

Las 5 correcciones obligatorias del contrato A5:
  1. Puerta de segmento (`A4`): si `model_picks_enabled == False` y no trae autorización explícita
     `allow_pure_market_arb`, rechaza con `"segment_model_picks_disabled"`.
  2. Punto de equilibrio estricto (Corrección #1): prohibido usar `% de acierto` para aprobar o
     clasificar picks. Rechaza de inmediato `p_final <= 1 / price_decimal` (`"below_breakeven"`) y
     exige `p_final > (1 / price_decimal) + p_edge_min` y `ev >= ev_threshold` calibrado por
     `league × market × odds_bucket` (`"short" | "even" | "plus" | "long"`).
  3. Eliminación total de `"Tiro de Cuota Alta"` (Corrección #2): solo existen dos niveles
     (`PickTier = "solido" | "valor"`). `"solido"` exige `segment_clv_ci95_low > 0` en walk-forward;
     `"valor"` exige `ev >= ev_threshold_valor > ev_threshold_solido`.
  4. Filtros de dispersión entre submodelos (`sigma_p = std_pop(...) > max_sigma_p` ->
     `"high_submodel_dispersion"`) y movimiento adverso sharp en `[ts_decision - 60m, ts_decision]`
     (`1 tick = 0.005` prob implícita -> `"adverse_sharp_steam"`).
  5. Quarter-Kelly contraído por incertidumbre (`p_shrunk = max(0, p_final - k * sigma_p)`,
     `p_shrunk <= 1 / price_decimal` -> `"uncertainty_erased_edge"`), correlación por `event_id`
     ordenando por crecimiento logarítmico `g`, y 4 topes duros obligatorios:
     `<= 2.0u` por pick, `<= 2.0u` por `event_id`, `<= 3.0u` por `(league, utc_date)` y `<= 5.0u` por `utc_date`.
"""

from __future__ import annotations

import argparse
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
import json
import math
from pathlib import Path
import re
import shutil
import sys
from typing import Any

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"
MODELS_DIR = REPO_ROOT / "services" / "models"
ARTIFACTS_DIR = MODELS_DIR / "artifacts"
TS_DATA_PREDICTION_DIR = REPO_ROOT / "src" / "data" / "prediction"

DEFAULT_BLEND_WEIGHTS_PATH = ARTIFACTS_DIR / "blend_weights_v3_1.json"
DEFAULT_POLICY_ARTIFACT_PATH = ARTIFACTS_DIR / "pick_policy_v3_1.json"
DEFAULT_TS_POLICY_COPY_PATH = TS_DATA_PREDICTION_DIR / "pick_policy_v3_1.json"
DEFAULT_OLA2_BACKTEST_OUT = ARTIFACTS_DIR / "ola2_picks_backtest_dev.json"

for _p in (str(REPO_ROOT), str(MODELS_DIR), str(PRED_LAB_ROOT)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

# ---------------------------------------------------------------------------
# Constantes contractuales idénticas a `src/domain/prediction/picks.ts`
# ---------------------------------------------------------------------------

ODDS_BUCKETS: tuple[str, ...] = ("short", "even", "plus", "long")
PICK_TIERS: tuple[str, ...] = ("solido", "valor")

HARD_MAX_STAKE_PER_PICK_U: float = 2.0
HARD_MAX_STAKE_PER_EVENT_U: float = 2.0
HARD_MAX_STAKE_PER_LEAGUE_DATE_U: float = 3.0
HARD_MAX_STAKE_PER_GLOBAL_DATE_U: float = 5.0

MIN_PICK_PRICE_DECIMAL: float = 1.01
MAX_PICK_PRICE_DECIMAL: float = 1000.0

DEFAULT_KELLY_FRACTION: float = 0.25
DEFAULT_BANKROLL_UNIT_PCT: float = 0.01
DEFAULT_SHARP_STEAM_WINDOW_MINUTES: float = 60.0
DEFAULT_SHARP_IMPLIED_PROB_TICK: float = 0.005
DEFAULT_MIN_STAKE_U: float = 0.05

_CAP_EPSILON: float = 1e-12
_EPOCH_UTC = datetime(1970, 1, 1, tzinfo=timezone.utc)

PICK_REJECTION_REASONS: tuple[str, ...] = (
    "invalid_candidate_input",
    "segment_model_picks_disabled",
    "below_breakeven",
    "below_calibrated_ev_threshold",
    "solido_clv_ci95_not_positive",
    "high_submodel_dispersion",
    "adverse_sharp_steam",
    "uncertainty_erased_edge",
    "correlated_same_event_market",
    "cap_event_exhausted",
    "cap_league_date_exhausted",
    "cap_global_date_exhausted",
    "stake_below_min_unit",
)


class PickPolicyValidationError(ValueError):
    """Error de validación estructural sobre `PickPolicy`."""

    code = "pick_policy_validation_error"


class PickCausalityError(RuntimeError):
    """Error lanzado ante cualquier violación causal (`ts_captured > ts_decision` o post-kickoff)."""

    code = "pick_causality_error"


@dataclass(frozen=True)
class PickDecisionResult(Mapping[str, Any]):
    """Resultado inmutable de evaluación de un candidato, accesible tanto por atributo como por llave."""

    candidate_id: str
    input_index: int
    approved: bool
    rejection_reason: str | None
    tier: str | None
    event_id: str
    sport: str
    league: str
    market: str
    line: float | None
    selection: str
    book: str
    utc_date: str
    segment_key: str
    odds_bucket: str
    price_decimal: float
    p_implied: float
    p_modelo: float
    p_mercado: float
    p_final: float
    p_edge: float
    ev: float
    sigma_p: float
    p_shrunk: float
    adverse_ticks_1h: float
    f_quarter: float
    stake_raw_u: float
    correlation_multiplier: float
    stake_u: float
    expected_log_growth_g: float
    allocation_rank: int | None
    cap_applied: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def __getitem__(self, key: str) -> Any:
        try:
            return getattr(self, key)
        except AttributeError as exc:
            raise KeyError(key) from exc

    def __iter__(self) -> Iterator[str]:
        return iter(self.__dataclass_fields__)

    def __len__(self) -> int:
        return len(self.__dataclass_fields__)


# ---------------------------------------------------------------------------
# Normalización canónica 1:1 con `picks.ts` y `backtest.py`
# ---------------------------------------------------------------------------

_BOOK_CANONICAL_MAP: dict[str, str] = {
    "ps": "pinnacle",
    "p": "pinnacle",
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

_SELECTION_CANONICAL_MAP: dict[str, str] = {
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


def canonical_pick_market(market: Any) -> str:
    raw = str("" if market is None else market).strip().lower()
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
    if raw in ("dnb", "draw_no_bet"):
        return "dnb"
    return raw


def canonical_pick_selection(selection: Any) -> str:
    raw = str("" if selection is None else selection).strip().lower()
    return _SELECTION_CANONICAL_MAP.get(raw, raw)


def canonical_pick_book(book: Any) -> str:
    raw = str("" if book is None else book).strip().lower()
    return _BOOK_CANONICAL_MAP.get(raw, raw)


def _is_real_number(val: Any) -> bool:
    return (
        not isinstance(val, bool)
        and isinstance(val, (int, float, np.integer, np.floating))
        and math.isfinite(float(val))
    )


def normalize_pick_line(line: Any) -> float | None:
    if line is None or not _is_real_number(line):
        return None
    fval = float(line)
    if fval == 0.0:
        return 0.0
    # `Math.round(x * 10000) / 10000` en JS redondea `.5` hacia `+inf`
    scaled = fval * 10000.0
    rounded = math.floor(scaled + 0.5) / 10000.0
    return 0.0 if rounded == 0.0 else rounded


def build_segment_key(league: Any, market: Any) -> str:
    return f"{str('' if league is None else league).strip()}::{canonical_pick_market(market)}"


# ---------------------------------------------------------------------------
# Timestamps ISO-8601 a microsegundos UTC exactos (paridad bit a bit con TS)
# ---------------------------------------------------------------------------

_ISO_UTC_RE = re.compile(
    r"^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:?\d{2})?$",
    re.IGNORECASE,
)
_DATE_ONLY_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")


def parse_iso_utc_micros(iso_timestamp: Any) -> int | None:
    if isinstance(iso_timestamp, pd.Timestamp):
        if pd.isna(iso_timestamp):
            return None
        ts = iso_timestamp.tz_localize("UTC") if iso_timestamp.tzinfo is None else iso_timestamp.tz_convert("UTC")
        iso_timestamp = ts.isoformat()
    elif isinstance(iso_timestamp, datetime):
        dt = iso_timestamp.replace(tzinfo=timezone.utc) if iso_timestamp.tzinfo is None else iso_timestamp.astimezone(timezone.utc)
        iso_timestamp = dt.isoformat()

    if not isinstance(iso_timestamp, str):
        return None
    s = iso_timestamp.strip()
    if not s:
        return None

    m = _ISO_UTC_RE.match(s)
    if m:
        year, month, day, hour, minute, second = (int(m.group(i)) for i in range(1, 7))
        frac_raw = m.group(7) or ""
        tz_raw = m.group(8) or "Z"
        try:
            dt_base = datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc)
        except ValueError:
            return None

        frac6 = (frac_raw[:6]).ljust(6, "0")
        micros = int(frac6) if frac6 else 0

        offset_minutes = 0
        if tz_raw.upper() != "Z":
            sign = -1 if tz_raw.startswith("-") else 1
            clean_tz = tz_raw[1:].replace(":", "")
            tz_h = int(clean_tz[:2])
            tz_m = int(clean_tz[2:4])
            if tz_h > 23 or tz_m > 59:
                return None
            offset_minutes = sign * (tz_h * 60 + tz_m)

        delta = dt_base - _EPOCH_UTC
        base_sec = delta.days * 86400 + delta.seconds
        return base_sec * 1_000_000 + micros - offset_minutes * 60_000_000

    try:
        ts_fb = pd.Timestamp(s)
        if pd.isna(ts_fb):
            return None
        ts_fb = ts_fb.tz_localize("UTC") if ts_fb.tzinfo is None else ts_fb.tz_convert("UTC")
        ms = int(math.floor(ts_fb.timestamp() * 1000.0))
        return ms * 1000
    except Exception:
        return None


def format_utc_date_from_micros(epoch_micros: int) -> str:
    ms = epoch_micros // 1000
    dt = _EPOCH_UTC + timedelta(milliseconds=ms)
    return dt.strftime("%Y-%m-%d")


def resolve_candidate_utc_date(candidate: Mapping[str, Any]) -> str:
    raw_ud = candidate.get("utc_date")
    if isinstance(raw_ud, str) and _DATE_ONLY_RE.match(raw_ud.strip()):
        return raw_ud.strip()
    start_us = parse_iso_utc_micros(candidate.get("ts_event_start"))
    if start_us is not None:
        return format_utc_date_from_micros(start_us)
    dec_us = parse_iso_utc_micros(candidate.get("ts_decision"))
    if dec_us is not None:
        return format_utc_date_from_micros(dec_us)
    raise PickCausalityError("No se pudo derivar utc_date válida desde utc_date, ts_event_start ni ts_decision.")


# ---------------------------------------------------------------------------
# Primitivas matemáticas puras (paridad IEEE-754 `< 1e-12` con TypeScript)
# ---------------------------------------------------------------------------


def classify_odds_bucket(price_decimal: float) -> str:
    """Clasifica una cuota decimal en `"short" | "even" | "plus" | "long"`."""
    if not _is_real_number(price_decimal):
        raise ValueError(f"price_decimal inválido: {price_decimal!r}")
    p = float(price_decimal)
    if p < MIN_PICK_PRICE_DECIMAL or p > MAX_PICK_PRICE_DECIMAL:
        raise ValueError(
            f"price_decimal fuera de rango [{MIN_PICK_PRICE_DECIMAL}, {MAX_PICK_PRICE_DECIMAL}]: {p}"
        )
    if p < 1.65:
        return "short"
    if p < 2.20:
        return "even"
    if p < 2.90:
        return "plus"
    return "long"


def _is_finite_prob_01(val: Any) -> bool:
    if not _is_real_number(val):
        return False
    f = float(val)
    return 0.0 <= f <= 1.0


def compute_submodel_dispersion(candidate: Mapping[str, Any]) -> float | None:
    """Calcula `sigma_p = std_pop([p_logit, p_gbm, p_dixon_coles, ...])` (`ddof=0`) con suma IEEE-754 idéntica a TS."""
    extracted: list[float] = []
    sub = candidate.get("submodel_probs")

    if isinstance(sub, (list, tuple, np.ndarray)):
        for v in sub:
            if _is_finite_prob_01(v):
                extracted.append(float(v))
    elif isinstance(sub, Mapping):
        priority_keys = ("p_logit", "p_gbm", "p_dixon_coles")
        seen = set(priority_keys)
        for k in priority_keys:
            v = sub.get(k)
            if _is_finite_prob_01(v):
                extracted.append(float(v))
        for k in sorted(str( key ) for key in sub.keys() if str(key) not in seen):
            v = sub.get(k)
            if _is_finite_prob_01(v):
                extracted.append(float(v))
    else:
        for k in ("p_logit", "p_gbm", "p_dixon_coles"):
            v = candidate.get(k)
            if _is_finite_prob_01(v):
                extracted.append(float(v))

    if len(extracted) >= 2:
        n = float(len(extracted))
        acc = 0.0
        for x in extracted:
            acc += x
        mean = acc / n
        sq_acc = 0.0
        for x in extracted:
            diff = x - mean
            sq_acc += diff * diff
        return math.sqrt(sq_acc / n)

    raw_sigma = candidate.get("sigma_p")
    if _is_real_number(raw_sigma) and float(raw_sigma) >= 0.0:
        return float(raw_sigma)

    return None


def compute_adverse_sharp_ticks_1h(
    sharp_quotes: Sequence[Mapping[str, Any]] | None,
    ts_decision: Any,
    *,
    market: str | None = None,
    line: float | None = None,
    line_specified: bool = False,
    selection: str | None = None,
    window_minutes: float = DEFAULT_SHARP_STEAM_WINDOW_MINUTES,
    sharp_implied_prob_tick: float = DEFAULT_SHARP_IMPLIED_PROB_TICK,
    precomputed_adverse_ticks: float | None = None,
) -> float:
    """Calcula ticks de movimiento adverso sharp (`1 tick = 0.005` prob implícita) en `[ts_decision - 60m, ts_decision]`."""
    dec_us = parse_iso_utc_micros(ts_decision)
    if dec_us is None:
        raise PickCausalityError(f"ts_decision inválido en compute_adverse_sharp_ticks_1h: {ts_decision!r}")

    if not _is_real_number(sharp_implied_prob_tick) or float(sharp_implied_prob_tick) <= 0.0:
        raise PickPolicyValidationError(f"sharp_implied_prob_tick inválido: {sharp_implied_prob_tick!r}")
    prob_tick = float(sharp_implied_prob_tick)
    window_start_us = dec_us - int(math.floor(float(window_minutes) * 60_000_000.0 + 0.5))

    target_market = canonical_pick_market(market) if market is not None else None
    target_line = normalize_pick_line(line) if line_specified else None
    target_sel = canonical_pick_selection(selection) if selection is not None else None

    if sharp_quotes is not None and len(sharp_quotes) > 0:
        by_book: dict[str, list[tuple[int, int, float]]] = {"pinnacle": [], "smarkets": []}
        for idx, q in enumerate(sharp_quotes):
            cap_us = parse_iso_utc_micros(q.get("ts_captured"))
            if cap_us is None:
                raise PickCausalityError(f"ts_captured inválido en sharp_quotes_1h[{idx}]: {q.get('ts_captured')!r}")
            if cap_us > dec_us:
                raise PickCausalityError(
                    f"Fuga temporal en sharp_quotes_1h[{idx}]: ts_captured ({q.get('ts_captured')}) > ts_decision ({ts_decision})."
                )
            if cap_us < window_start_us:
                continue

            b_canon = canonical_pick_book(q.get("book"))
            if b_canon not in ("pinnacle", "smarkets"):
                continue

            raw_p = q.get("price_decimal")
            if not _is_real_number(raw_p):
                continue
            price = float(raw_p)
            if price < MIN_PICK_PRICE_DECIMAL or price > MAX_PICK_PRICE_DECIMAL:
                continue

            if target_market is not None and "market" in q and q["market"] is not None:
                if canonical_pick_market(q["market"]) != target_market:
                    continue
            if line_specified and "line" in q:
                if normalize_pick_line(q.get("line")) != target_line:
                    continue
            if target_sel is not None and "selection" in q and q["selection"] is not None:
                if canonical_pick_selection(q["selection"]) != target_sel:
                    continue

            by_book[b_canon].append((cap_us, idx, price))

        for sharp_book in ("pinnacle", "smarkets"):
            ticks = by_book[sharp_book]
            if len(ticks) >= 2:
                ticks.sort(key=lambda item: (item[0], item[1]))
                q_earliest = 1.0 / ticks[0][2]
                q_latest = 1.0 / ticks[-1][2]
                adverse_drop = max(0.0, q_earliest - q_latest)
                return adverse_drop / prob_tick

    if _is_real_number(precomputed_adverse_ticks) and float(precomputed_adverse_ticks) >= 0.0:  # type: ignore[arg-type]
        return float(precomputed_adverse_ticks)  # type: ignore[arg-type]

    return 0.0


def compute_shrunk_quarter_kelly(
    p_final: float,
    price_decimal: float,
    sigma_p: float,
    uncertainty_penalty_k: float,
    kelly_fraction: float = DEFAULT_KELLY_FRACTION,
    bankroll_unit_pct: float = DEFAULT_BANKROLL_UNIT_PCT,
) -> dict[str, Any]:
    """Calcula `p_shrunk`, `f_quarter`, `stake_raw_u` y crecimiento logarítmico `g`."""
    p_implied = 1.0 / float(price_decimal)
    p_shrunk = max(0.0, float(p_final) - float(uncertainty_penalty_k) * float(sigma_p))
    b = float(price_decimal) - 1.0

    if p_shrunk <= p_implied or b <= 0.0:
        return {
            "p_implied": p_implied,
            "p_shrunk": p_shrunk,
            "edge_erased": True,
            "b": b,
            "f_quarter": 0.0,
            "stake_raw_u": 0.0,
            "expected_log_growth_g": 0.0,
        }

    f_quarter = float(kelly_fraction) * ((p_shrunk * b - (1.0 - p_shrunk)) / b)
    unit_scale = 100.0 if float(bankroll_unit_pct) == 0.01 else (1.0 / float(bankroll_unit_pct))
    stake_raw_u = unit_scale * f_quarter
    expected_log_growth_g = (
        p_shrunk * math.log(1.0 + f_quarter * b) + (1.0 - p_shrunk) * math.log(1.0 - f_quarter)
    )
    return {
        "p_implied": p_implied,
        "p_shrunk": p_shrunk,
        "edge_erased": False,
        "b": b,
        "f_quarter": f_quarter,
        "stake_raw_u": stake_raw_u,
        "expected_log_growth_g": expected_log_growth_g,
    }


# ---------------------------------------------------------------------------
# Validación de política y evaluación pura `evaluate_pick_candidates`
# ---------------------------------------------------------------------------


def _validate_bucket_thresholds(label: str, t: Mapping[str, Any]) -> None:
    p_edge_min = t.get("p_edge_min")
    ev_sol = t.get("ev_threshold_solido")
    ev_val = t.get("ev_threshold_valor")
    if (
        not _is_real_number(p_edge_min)
        or float(p_edge_min) < 0.0
        or not _is_real_number(ev_sol)
        or float(ev_sol) <= 0.0
        or not _is_real_number(ev_val)
        or float(ev_val) <= float(ev_sol)
    ):
        raise PickPolicyValidationError(
            f"Umbrales inválidos en {label}: se exige p_edge_min >= 0 y 0 < ev_threshold_solido < ev_threshold_valor."
        )


def validate_pick_policy(policy: Mapping[str, Any]) -> None:
    if not isinstance(policy, Mapping):
        raise PickPolicyValidationError("PickPolicy inválida o ausente.")

    kelly_frac = policy.get("kelly_fraction", DEFAULT_KELLY_FRACTION)
    if not _is_real_number(kelly_frac) or float(kelly_frac) <= 0.0 or float(kelly_frac) > 0.25 + 1e-12:
        raise PickPolicyValidationError(
            f"kelly_fraction inválida ({kelly_frac!r}): el contrato A5 exige Quarter-Kelly (<= 0.25)."
        )
    unit_pct = policy.get("bankroll_unit_pct", DEFAULT_BANKROLL_UNIT_PCT)
    if not _is_real_number(unit_pct) or float(unit_pct) <= 0.0 or float(unit_pct) > 1.0:
        raise PickPolicyValidationError(f"bankroll_unit_pct inválido: {unit_pct!r}")

    for key in ("max_sigma_p", "max_adverse_ticks_1h", "uncertainty_penalty_k"):
        val = policy.get(key)
        if not _is_real_number(val) or float(val) < 0.0:
            raise PickPolicyValidationError(f"{key} inválido: {val!r}")

    rho = policy.get("rho_same_event")
    if not _is_real_number(rho) or abs(float(rho)) > 1.0:
        raise PickPolicyValidationError(f"rho_same_event debe estar en [-1, 1]: {rho!r}")

    def_buckets = policy.get("default_buckets")
    if not isinstance(def_buckets, Mapping):
        raise PickPolicyValidationError("default_buckets es obligatorio en PickPolicy.")
    for b in ODDS_BUCKETS:
        bt = def_buckets.get(b)
        if not isinstance(bt, Mapping):
            raise PickPolicyValidationError(f"Falta bucket por defecto '{b}' en PickPolicy.")
        _validate_bucket_thresholds(f"default_buckets.{b}", bt)

    segments = policy.get("segments")
    if isinstance(segments, Mapping):
        for seg_key, seg in segments.items():
            if isinstance(seg, Mapping) and isinstance(seg.get("buckets"), Mapping):
                for b in ODDS_BUCKETS:
                    bt = seg["buckets"].get(b)
                    if bt is not None:
                        if not isinstance(bt, Mapping):
                            raise PickPolicyValidationError(f"Bucket inválido en segments[{seg_key}].buckets.{b}")
                        _validate_bucket_thresholds(f"segments[{seg_key}].buckets.{b}", bt)


def _lookup_segment_config(
    policy: Mapping[str, Any],
    league: str,
    market_canon: str,
) -> tuple[str, Mapping[str, Any] | None]:
    exact_key = f"{league.strip()}::{market_canon}"
    segments = policy.get("segments") or {}
    if exact_key in segments:
        return exact_key, segments[exact_key]
    lower_key = exact_key.lower()
    for k, v in segments.items():
        if str(k).lower() == lower_key:
            return str(k), v
    return exact_key, None


def _resolve_thresholds_for_candidate(
    policy: Mapping[str, Any],
    segment: Mapping[str, Any] | None,
    market_canon: str,
    bucket: str,
) -> tuple[Mapping[str, Any], float, float, float]:
    seg_buckets = (segment.get("buckets") if segment else None) or {}
    mkt_defaults = (policy.get("market_default_buckets") or {}).get(market_canon) or {}
    thresholds = seg_buckets.get(bucket) or mkt_defaults.get(bucket) or policy["default_buckets"][bucket]

    max_sigma_p = float(
        thresholds.get("max_sigma_p")
        if thresholds.get("max_sigma_p") is not None
        else (
            segment.get("max_sigma_p")
            if (segment is not None and segment.get("max_sigma_p") is not None)
            else policy["max_sigma_p"]
        )
    )
    max_adverse_ticks = float(
        thresholds.get("max_adverse_ticks_1h")
        if thresholds.get("max_adverse_ticks_1h") is not None
        else (
            segment.get("max_adverse_ticks_1h")
            if (segment is not None and segment.get("max_adverse_ticks_1h") is not None)
            else policy["max_adverse_ticks_1h"]
        )
    )
    uncertainty_k = float(
        segment.get("uncertainty_penalty_k")
        if (segment is not None and segment.get("uncertainty_penalty_k") is not None)
        else policy["uncertainty_penalty_k"]
    )
    return thresholds, max_sigma_p, max_adverse_ticks, uncertainty_k


def _init_portfolio_tracker(
    portfolio_state: Mapping[str, Any] | None,
) -> tuple[dict[str, float], dict[str, set[str]], dict[str, int], dict[str, float], dict[str, float]]:
    event_exp: dict[str, float] = {}
    event_mkts: dict[str, set[str]] = {}
    event_counts: dict[str, int] = {}
    league_date_exp: dict[str, float] = {}
    global_date_exp: dict[str, float] = {}

    if not portfolio_state:
        return event_exp, event_mkts, event_counts, league_date_exp, global_date_exp

    for eid, val in (portfolio_state.get("event_exposure_u") or {}).items():
        if _is_real_number(val) and float(val) > 0.0:
            event_exp[str(eid)] = float(val)

    for eid, mkts in (portfolio_state.get("event_markets_taken") or {}).items():
        if mkts:
            m_set = {canonical_pick_market(m) for m in mkts}
            event_mkts[str(eid)] = m_set
            event_counts[str(eid)] = len(m_set)

    for eid, cnt in (portfolio_state.get("event_pick_counts") or {}).items():
        if _is_real_number(cnt) and int(cnt) > 0:
            event_counts[str(eid)] = max(event_counts.get(str(eid), 0), int(math.floor(float(cnt))))

    for k, val in (portfolio_state.get("league_date_exposure_u") or {}).items():
        if _is_real_number(val) and float(val) > 0.0:
            league_date_exp[str(k)] = float(val)

    for k, val in (portfolio_state.get("global_date_exposure_u") or {}).items():
        if _is_real_number(val) and float(val) > 0.0:
            global_date_exp[str(k)] = float(val)

    for op in portfolio_state.get("open_picks") or ():
        if not isinstance(op, Mapping):
            continue
        st = op.get("stake_u")
        if not _is_real_number(st) or float(st) <= 0.0:
            continue
        stake_f = float(st)
        eid = str(op.get("event_id") or "").strip()
        lg = str(op.get("league") or "").strip()
        u_date = resolve_candidate_utc_date(op)
        ld_key = f"{lg}::{u_date}"

        event_exp[eid] = event_exp.get(eid, 0.0) + stake_f
        league_date_exp[ld_key] = league_date_exp.get(ld_key, 0.0) + stake_f
        global_date_exp[u_date] = global_date_exp.get(u_date, 0.0) + stake_f
        event_counts[eid] = event_counts.get(eid, 0) + 1

        raw_m = op.get("market")
        if isinstance(raw_m, str) and raw_m.strip():
            event_mkts.setdefault(eid, set()).add(canonical_pick_market(raw_m))

    return event_exp, event_mkts, event_counts, league_date_exp, global_date_exp


def _clamp_safe_addition(used: float, proposed: float, hard_cap: float) -> float:
    stake = min(proposed, max(0.0, hard_cap - used))
    if used + stake > hard_cap:
        stake = max(0.0, (hard_cap - used) * (1.0 - 1e-15))
    return stake


def evaluate_pick_candidates(
    candidates: Sequence[Mapping[str, Any]],
    policy: Mapping[str, Any],
    portfolio_state: Mapping[str, Any] | None = None,
    *,
    _trusted_validated_policy: bool = False,
) -> list[PickDecisionResult]:
    """Evalúa de forma pura y determinista candidatos de apuesta contra `policy` y `portfolio_state`."""
    if not _trusted_validated_policy:
        validate_pick_policy(policy)

    kelly_fraction = float(policy.get("kelly_fraction", DEFAULT_KELLY_FRACTION))
    bankroll_unit_pct = float(policy.get("bankroll_unit_pct", DEFAULT_BANKROLL_UNIT_PCT))
    sharp_window_minutes = float(policy.get("sharp_steam_window_minutes", DEFAULT_SHARP_STEAM_WINDOW_MINUTES))
    sharp_prob_tick = float(policy.get("sharp_implied_prob_tick", DEFAULT_SHARP_IMPLIED_PROB_TICK))
    min_stake_u = float(policy.get("min_stake_u", DEFAULT_MIN_STAKE_U))
    fallback_sigma_p = float(policy.get("fallback_sigma_p", 0.0))
    require_dispersion = bool(policy.get("require_submodel_dispersion", False))
    global_allow_pure_arb = bool(policy.get("allow_pure_market_arb", True))
    unknown_seg_enabled = bool(policy.get("unknown_segment_model_picks_enabled", False))

    caps_cfg = policy.get("caps") or {}
    cap_pick_max = min(
        HARD_MAX_STAKE_PER_PICK_U,
        max(0.0, float(caps_cfg.get("max_stake_per_pick_u", HARD_MAX_STAKE_PER_PICK_U))),
    )
    cap_event_max = min(
        HARD_MAX_STAKE_PER_EVENT_U,
        max(0.0, float(caps_cfg.get("max_stake_per_event_u", HARD_MAX_STAKE_PER_EVENT_U))),
    )
    cap_league_date_max = min(
        HARD_MAX_STAKE_PER_LEAGUE_DATE_U,
        max(0.0, float(caps_cfg.get("max_stake_per_league_date_u", HARD_MAX_STAKE_PER_LEAGUE_DATE_U))),
    )
    cap_global_date_max = min(
        HARD_MAX_STAKE_PER_GLOBAL_DATE_U,
        max(0.0, float(caps_cfg.get("max_stake_per_global_date_u", HARD_MAX_STAKE_PER_GLOBAL_DATE_U))),
    )

    decisions: list[PickDecisionResult | None] = [None] * len(candidates)
    survivors: list[dict[str, Any]] = []

    for i, c in enumerate(candidates):
        event_id = str(c.get("event_id") or "").strip()
        sport = str(c.get("sport") or "").strip().lower()
        league = str(c.get("league") or "").strip()
        market_canon = canonical_pick_market(c.get("market"))
        line_norm = normalize_pick_line(c.get("line"))
        selection_canon = canonical_pick_selection(c.get("selection"))
        book_canon = canonical_pick_book(c.get("book"))
        raw_cid = c.get("candidate_id")
        candidate_id = (
            raw_cid.strip()
            if isinstance(raw_cid, str) and raw_cid.strip()
            else f"{event_id}:{market_canon}:{selection_canon}:{book_canon}:{i}"
        )

        dec_us = parse_iso_utc_micros(c.get("ts_decision"))
        start_us = parse_iso_utc_micros(c.get("ts_event_start"))
        if dec_us is None or start_us is None:
            raise PickCausalityError(
                f"Timestamps obligatorios inválidos en candidato '{candidate_id}': "
                f"ts_decision={c.get('ts_decision')!r}, ts_event_start={c.get('ts_event_start')!r}"
            )
        if dec_us > start_us:
            raise PickCausalityError(
                f"Decisión post-kickoff prohibida en '{candidate_id}': "
                f"ts_decision ({c.get('ts_decision')}) > ts_event_start ({c.get('ts_event_start')})."
            )
        if c.get("ts_captured") is not None:
            cap_us = parse_iso_utc_micros(c.get("ts_captured"))
            if cap_us is None or cap_us > dec_us:
                raise PickCausalityError(
                    f"Fuga de cuota en candidato '{candidate_id}': "
                    f"ts_captured ({c.get('ts_captured')!r}) > ts_decision ({c.get('ts_decision')})."
                )

        utc_date = resolve_candidate_utc_date(c)
        segment_key, segment = _lookup_segment_config(policy, league, market_canon)

        raw_price = c.get("price_decimal")
        raw_pm = c.get("p_modelo")
        raw_pmkt = c.get("p_mercado")
        raw_pf = c.get("p_final")

        def _make_rejected(
            reason: str,
            *,
            odds_bucket: str = "even",
            p_implied: float = 0.0,
            p_edge: float = 0.0,
            ev_val: float = 0.0,
            sigma_val: float = 0.0,
            p_shrunk_val: float = 0.0,
            adverse_val: float = 0.0,
        ) -> PickDecisionResult:
            return PickDecisionResult(
                candidate_id=candidate_id,
                input_index=i,
                approved=False,
                rejection_reason=reason,
                tier=None,
                event_id=event_id,
                sport=sport,
                league=league,
                market=market_canon,
                line=line_norm,
                selection=selection_canon,
                book=book_canon,
                utc_date=utc_date,
                segment_key=segment_key,
                odds_bucket=odds_bucket,
                price_decimal=float(raw_price) if _is_real_number(raw_price) else 0.0,
                p_implied=p_implied,
                p_modelo=float(raw_pm) if _is_real_number(raw_pm) else 0.0,
                p_mercado=float(raw_pmkt) if _is_real_number(raw_pmkt) else 0.0,
                p_final=float(raw_pf) if _is_real_number(raw_pf) else 0.0,
                p_edge=p_edge,
                ev=ev_val,
                sigma_p=sigma_val,
                p_shrunk=p_shrunk_val,
                adverse_ticks_1h=adverse_val,
                f_quarter=0.0,
                stake_raw_u=0.0,
                correlation_multiplier=1.0,
                stake_u=0.0,
                expected_log_growth_g=0.0,
                allocation_rank=None,
                cap_applied=False,
            )

        if (
            not event_id
            or not league
            or not market_canon
            or not selection_canon
            or not book_canon
            or not _is_real_number(raw_price)
            or float(raw_price) < MIN_PICK_PRICE_DECIMAL
            or float(raw_price) > MAX_PICK_PRICE_DECIMAL
            or not _is_real_number(raw_pf)
            or float(raw_pf) <= 0.0
            or float(raw_pf) >= 1.0
            or not _is_real_number(raw_pm)
            or float(raw_pm) <= 0.0
            or float(raw_pm) >= 1.0
            or not _is_real_number(raw_pmkt)
            or float(raw_pmkt) <= 0.0
            or float(raw_pmkt) >= 1.0
        ):
            decisions[i] = _make_rejected("invalid_candidate_input")
            continue

        price_decimal = float(raw_price)
        p_modelo = float(raw_pm)
        p_mercado = float(raw_pmkt)
        p_final = float(raw_pf)

        odds_bucket = classify_odds_bucket(price_decimal)
        p_implied = 1.0 / price_decimal
        p_edge = p_final - p_implied
        ev = p_final * price_decimal - 1.0

        # 1. Puerta de segmento (`A4`)
        seg_enabled = bool(segment["model_picks_enabled"]) if segment is not None else unknown_seg_enabled
        seg_arb_cfg = (
            bool(segment["allow_pure_market_arb"])
            if (segment is not None and segment.get("allow_pure_market_arb") is not None)
            else global_allow_pure_arb
        )
        seg_allows_arb = seg_arb_cfg and bool(c.get("allow_pure_market_arb", False))
        if not seg_enabled and not seg_allows_arb:
            decisions[i] = _make_rejected(
                "segment_model_picks_disabled",
                odds_bucket=odds_bucket,
                p_implied=p_implied,
                p_edge=p_edge,
                ev_val=ev,
            )
            continue

        # 2. Punto de equilibrio estricto (Corrección #1)
        if p_final <= p_implied:
            decisions[i] = _make_rejected(
                "below_breakeven",
                odds_bucket=odds_bucket,
                p_implied=p_implied,
                p_edge=p_edge,
                ev_val=ev,
            )
            continue

        thresholds, max_sigma_p, max_adverse_ticks_1h, uncertainty_penalty_k = _resolve_thresholds_for_candidate(
            policy, segment, market_canon, odds_bucket
        )

        # 3. Umbrales calibrados por `league × market × odds_bucket` y `PickTier = "solido" | "valor"`
        p_edge_min = float(thresholds["p_edge_min"])
        ev_solido = float(thresholds["ev_threshold_solido"])
        ev_valor = float(thresholds["ev_threshold_valor"])

        if p_edge <= p_edge_min or ev < ev_solido:
            decisions[i] = _make_rejected(
                "below_calibrated_ev_threshold",
                odds_bucket=odds_bucket,
                p_implied=p_implied,
                p_edge=p_edge,
                ev_val=ev,
            )
            continue

        if ev >= ev_valor:
            tier = "valor"
        else:
            seg_clv_mean = segment.get("segment_clv_mean") if segment is not None else None
            seg_clv_ci_low = segment.get("segment_clv_ci95_low") if segment is not None else None
            has_sig_pos_clv = (
                _is_real_number(seg_clv_mean)
                and float(seg_clv_mean) > 0.0
                and _is_real_number(seg_clv_ci_low)
                and float(seg_clv_ci_low) > 0.0
            )
            if not has_sig_pos_clv:
                decisions[i] = _make_rejected(
                    "solido_clv_ci95_not_positive",
                    odds_bucket=odds_bucket,
                    p_implied=p_implied,
                    p_edge=p_edge,
                    ev_val=ev,
                )
                continue
            tier = "solido"

        # 4. Dispersión entre submodelos (`sigma_p = std_pop(...)`)
        raw_sigma_p = compute_submodel_dispersion(c)
        if raw_sigma_p is None and require_dispersion:
            decisions[i] = _make_rejected(
                "high_submodel_dispersion",
                odds_bucket=odds_bucket,
                p_implied=p_implied,
                p_edge=p_edge,
                ev_val=ev,
                sigma_val=float("inf"),
            )
            continue
        sigma_p = raw_sigma_p if raw_sigma_p is not None else fallback_sigma_p
        if sigma_p > max_sigma_p:
            decisions[i] = _make_rejected(
                "high_submodel_dispersion",
                odds_bucket=odds_bucket,
                p_implied=p_implied,
                p_edge=p_edge,
                ev_val=ev,
                sigma_val=sigma_p,
            )
            continue

        # 5. Movimiento adverso sharp en `[ts_decision - 60 min, ts_decision]`
        adverse_ticks_1h = compute_adverse_sharp_ticks_1h(
            c.get("sharp_quotes_1h"),
            c.get("ts_decision"),
            market=market_canon,
            line=line_norm,
            line_specified=True,
            selection=selection_canon,
            window_minutes=sharp_window_minutes,
            sharp_implied_prob_tick=sharp_prob_tick,
            precomputed_adverse_ticks=c.get("adverse_ticks_1h"),
        )
        if adverse_ticks_1h > max_adverse_ticks_1h:
            decisions[i] = _make_rejected(
                "adverse_sharp_steam",
                odds_bucket=odds_bucket,
                p_implied=p_implied,
                p_edge=p_edge,
                ev_val=ev,
                sigma_val=sigma_p,
                adverse_val=adverse_ticks_1h,
            )
            continue

        # 6. Quarter-Kelly contraído por incertidumbre
        kelly = compute_shrunk_quarter_kelly(
            p_final,
            price_decimal,
            sigma_p,
            uncertainty_penalty_k,
            kelly_fraction=kelly_fraction,
            bankroll_unit_pct=bankroll_unit_pct,
        )
        if kelly["edge_erased"]:
            decisions[i] = _make_rejected(
                "uncertainty_erased_edge",
                odds_bucket=odds_bucket,
                p_implied=p_implied,
                p_edge=p_edge,
                ev_val=ev,
                sigma_val=sigma_p,
                p_shrunk_val=kelly["p_shrunk"],
                adverse_val=adverse_ticks_1h,
            )
            continue

        survivors.append(
            {
                "input_index": i,
                "candidate_id": candidate_id,
                "event_id": event_id,
                "sport": sport,
                "league": league,
                "market_canon": market_canon,
                "line_norm": line_norm,
                "selection_canon": selection_canon,
                "book_canon": book_canon,
                "utc_date": utc_date,
                "segment_key": segment_key,
                "odds_bucket": odds_bucket,
                "tier": tier,
                "price_decimal": price_decimal,
                "p_implied": p_implied,
                "p_modelo": p_modelo,
                "p_mercado": p_mercado,
                "p_final": p_final,
                "p_edge": p_edge,
                "ev": ev,
                "sigma_p": sigma_p,
                "p_shrunk": kelly["p_shrunk"],
                "adverse_ticks_1h": adverse_ticks_1h,
                "f_quarter": kelly["f_quarter"],
                "stake_raw_u": kelly["stake_raw_u"],
                "expected_log_growth_g": kelly["expected_log_growth_g"],
            }
        )

    # 7. Orden determinista por `(utc_date ASC, -expected_log_growth_g, event_id, market, selection, input_index)`
    survivors.sort(
        key=lambda s: (
            s["utc_date"],
            -s["expected_log_growth_g"],
            s["event_id"],
            s["market_canon"],
            s["selection_canon"],
            s["input_index"],
        )
    )

    event_exp, event_mkts, event_counts, league_date_exp, global_date_exp = _init_portfolio_tracker(portfolio_state)
    abs_rho = min(1.0, max(0.0, abs(float(policy["rho_same_event"]))))
    next_rank = 1

    for s in survivors:
        eid = s["event_id"]
        taken_mkts = event_mkts.get(eid)
        prior_same_event = event_counts.get(eid, 0)

        def _finalize_survivor(
            approved: bool,
            reason: str | None,
            corr_mult: float,
            stake_u: float,
            rank: int | None,
            cap_applied: bool,
        ) -> PickDecisionResult:
            return PickDecisionResult(
                candidate_id=s["candidate_id"],
                input_index=s["input_index"],
                approved=approved,
                rejection_reason=reason,
                tier=s["tier"] if approved else None,
                event_id=eid,
                sport=s["sport"],
                league=s["league"],
                market=s["market_canon"],
                line=s["line_norm"],
                selection=s["selection_canon"],
                book=s["book_canon"],
                utc_date=s["utc_date"],
                segment_key=s["segment_key"],
                odds_bucket=s["odds_bucket"],
                price_decimal=s["price_decimal"],
                p_implied=s["p_implied"],
                p_modelo=s["p_modelo"],
                p_mercado=s["p_mercado"],
                p_final=s["p_final"],
                p_edge=s["p_edge"],
                ev=s["ev"],
                sigma_p=s["sigma_p"],
                p_shrunk=s["p_shrunk"],
                adverse_ticks_1h=s["adverse_ticks_1h"],
                f_quarter=s["f_quarter"],
                stake_raw_u=s["stake_raw_u"],
                correlation_multiplier=corr_mult,
                stake_u=stake_u,
                expected_log_growth_g=s["expected_log_growth_g"] * corr_mult,
                allocation_rank=rank,
                cap_applied=cap_applied,
            )

        if taken_mkts is not None and s["market_canon"] in taken_mkts:
            decisions[s["input_index"]] = _finalize_survivor(
                False, "correlated_same_event_market", 0.0, 0.0, None, False
            )
            continue

        corr_mult = ((1.0 - abs_rho) ** prior_same_event) if prior_same_event > 0 else 1.0
        if corr_mult <= _CAP_EPSILON:
            decisions[s["input_index"]] = _finalize_survivor(
                False, "correlated_same_event_market", 0.0, 0.0, None, False
            )
            continue

        stake_corr_u = s["stake_raw_u"] * corr_mult
        ld_key = f"{s['league']}::{s['utc_date']}"

        used_event_u = event_exp.get(eid, 0.0)
        used_ld_u = league_date_exp.get(ld_key, 0.0)
        used_gd_u = global_date_exp.get(s["utc_date"], 0.0)

        if cap_event_max - used_event_u <= _CAP_EPSILON:
            decisions[s["input_index"]] = _finalize_survivor(False, "cap_event_exhausted", corr_mult, 0.0, None, True)
            continue
        if cap_league_date_max - used_ld_u <= _CAP_EPSILON:
            decisions[s["input_index"]] = _finalize_survivor(
                False, "cap_league_date_exhausted", corr_mult, 0.0, None, True
            )
            continue
        if cap_global_date_max - used_gd_u <= _CAP_EPSILON:
            decisions[s["input_index"]] = _finalize_survivor(
                False, "cap_global_date_exhausted", corr_mult, 0.0, None, True
            )
            continue

        stake_u = min(stake_corr_u, cap_pick_max)
        stake_u = _clamp_safe_addition(used_event_u, stake_u, cap_event_max)
        stake_u = _clamp_safe_addition(used_ld_u, stake_u, cap_league_date_max)
        stake_u = _clamp_safe_addition(used_gd_u, stake_u, cap_global_date_max)

        cap_applied = (stake_u + 1e-15) < stake_corr_u

        if stake_u < min_stake_u:
            decisions[s["input_index"]] = _finalize_survivor(
                False, "stake_below_min_unit", corr_mult, 0.0, None, cap_applied
            )
            continue

        rank = next_rank
        next_rank += 1

        event_exp[eid] = used_event_u + stake_u
        league_date_exp[ld_key] = used_ld_u + stake_u
        global_date_exp[s["utc_date"]] = used_gd_u + stake_u
        event_counts[eid] = prior_same_event + 1
        event_mkts.setdefault(eid, set()).add(s["market_canon"])

        decisions[s["input_index"]] = _finalize_survivor(True, None, corr_mult, stake_u, rank, cap_applied)

    return [d for d in decisions if d is not None]


# Alias camelCase para ergonomía cruzada con TS
evaluatePickCandidates = evaluate_pick_candidates


def select_approved_picks(
    candidates: Sequence[Mapping[str, Any]],
    policy: Mapping[str, Any],
    portfolio_state: Mapping[str, Any] | None = None,
) -> list[PickDecisionResult]:
    approved = [d for d in evaluate_pick_candidates(candidates, policy, portfolio_state) if d.approved]
    approved.sort(key=lambda d: d.allocation_rank or 0)
    return approved


def to_ledger_pick_input(
    decision: PickDecisionResult | Mapping[str, Any],
    *,
    pick_id: str,
    ts_emitido: str,
    version_modelo: str,
    features_hash: str,
    price_tomado: float | None = None,
) -> dict[str, Any]:
    if not decision["approved"] or decision["tier"] is None:
        raise ValueError(f"No se puede registrar en ledger un candidato rechazado ({decision['candidate_id']}).")
    exec_price = float(price_tomado) if price_tomado is not None else float(decision["price_decimal"])
    exec_ev = float(decision["p_final"]) * exec_price - 1.0
    return {
        "pick_id": pick_id,
        "ts_emitido": ts_emitido,
        "event_id": decision["event_id"],
        "sport": decision["sport"],
        "league": decision["league"],
        "market": decision["market"],
        "line": decision["line"],
        "selection": decision["selection"],
        "book": decision["book"],
        "price_tomado": exec_price,
        "p_modelo": float(decision["p_modelo"]),
        "p_mercado": float(decision["p_mercado"]),
        "p_final": float(decision["p_final"]),
        "ev": exec_ev,
        "stake_u": float(decision["stake_u"]),
        "tier": str(decision["tier"]),
        "version_modelo": version_modelo,
        "features_hash": features_hash,
    }


# ---------------------------------------------------------------------------
# Utilidades de De-Vig y Mezcla Logit (`A4 -> A5`) para Backtest Walk-Forward
# ---------------------------------------------------------------------------


def _logit_clipped(p: np.ndarray | float, eps: float = 1e-6) -> np.ndarray:
    arr = np.clip(np.asarray(p, dtype=float), eps, 1.0 - eps)
    return np.log(arr / (1.0 - arr))


def _sigmoid_arr(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def blend_probs_logit_simplex(
    p_model_vec: Sequence[float] | np.ndarray,
    p_market_novig_vec: Sequence[float] | np.ndarray,
    w_model: float,
    eps: float = 1e-6,
) -> np.ndarray:
    """Mezcla unificada 2-vías y 3-vías en espacio logit (`u_k = σ(w·logit(p_m) + (1-w)·logit(p_mkt))`, `u / sum(u)`)."""
    w = float(np.clip(float(w_model), 0.0, 1.0))
    lm = _logit_clipped(p_model_vec, eps=eps)
    lk = _logit_clipped(p_market_novig_vec, eps=eps)
    u = _sigmoid_arr(w * lm + (1.0 - w) * lk)
    tot = float(np.sum(u))
    return u / max(1e-15, tot)


_DEVIG_MEMO_CACHE: dict[tuple[tuple[float, ...], str], np.ndarray] = {}


def devig_prices_by_method(odds_vec: Sequence[float] | np.ndarray, method: str) -> np.ndarray:
    """Desvigoriza un vector completo de cuotas usando `proportional`, `power`, `shin` o `adaptive`."""
    import backtest as bt

    m = str(method or "power").strip().lower()
    arr = tuple(float(x) for x in odds_vec)
    cache_key = (arr, m)
    cached = _DEVIG_MEMO_CACHE.get(cache_key)
    if cached is not None:
        return cached

    q = tuple(1.0 / x for x in arr)
    if m in ("proportional", "multiplicative"):
        s = sum(q)
        res = np.array([qi / s for qi in q], dtype=float)
    elif m == "power":
        res = np.array(bt._solve_power_tuple(q, tolerance=1e-12), dtype=float)
    elif m == "shin":
        res = np.array(bt._solve_shin_tuple(q, tolerance=1e-12), dtype=float)
    else:
        res = bt._devig_probs_adaptive(list(arr))

    if len(_DEVIG_MEMO_CACHE) < 250_000:
        _DEVIG_MEMO_CACHE[cache_key] = res
    return res


# ---------------------------------------------------------------------------
# Carga causal de Submodelos (`p_logit`, `p_gbm`, `p_dixon_coles`) para `sigma_p`
# ---------------------------------------------------------------------------


def load_submodel_dispersion_lookup(
    first_eval_season_soccer: int = 2018,
    first_eval_season_nfl: int = 2010,
) -> dict[str, dict[str, list[float]]]:
    """Construye un índice causal `raw_event_id -> {selection: [p_sub1, p_sub2, ...]}`
    usando los submodelos walk-forward preentrenados de Fútbol (`logit`, `hgb`, `poisson_dc`)
    y NFL (`logit`, `hgb`, `logit_elo`)."""
    lookup: dict[str, dict[str, list[float]]] = {}

    art_dir = PRED_LAB_ROOT / "artifacts" / "EXP01_baselines_20261109"
    p_logit_path = art_dir / "pred_logit.csv"
    p_hgb_path = art_dir / "pred_hgb.csv"
    p_dc_path = art_dir / "pred_poisson_dc.csv"

    if p_logit_path.exists() and p_hgb_path.exists():
        df_l = pd.read_csv(p_logit_path, usecols=["match_id", "season", "p_home", "p_draw", "p_away"])
        df_l = df_l[df_l["season"].astype(str).str[:4].astype(int) >= int(first_eval_season_soccer)]
        df_g = pd.read_csv(p_hgb_path, usecols=["match_id", "p_home", "p_draw", "p_away"])
        merged = df_l.merge(df_g, on="match_id", suffixes=("_l", "_g"), how="inner")
        has_dc = p_dc_path.exists()
        if has_dc:
            df_dc = pd.read_csv(p_dc_path, usecols=["match_id", "p_home", "p_draw", "p_away"]).rename(
                columns={"p_home": "p_home_dc", "p_draw": "p_draw_dc", "p_away": "p_away_dc"}
            )
            merged = merged.merge(df_dc, on="match_id", how="left")

        mids = merged["match_id"].astype(str).tolist()
        hl = merged["p_home_l"].to_numpy(dtype=float)
        dl = merged["p_draw_l"].to_numpy(dtype=float)
        al = merged["p_away_l"].to_numpy(dtype=float)
        hg = merged["p_home_g"].to_numpy(dtype=float)
        dg = merged["p_draw_g"].to_numpy(dtype=float)
        ag = merged["p_away_g"].to_numpy(dtype=float)
        hdc = merged["p_home_dc"].to_numpy(dtype=float) if has_dc else None
        ddc = merged["p_draw_dc"].to_numpy(dtype=float) if has_dc else None
        adc = merged["p_away_dc"].to_numpy(dtype=float) if has_dc else None

        for idx, mid in enumerate(mids):
            if hdc is not None and math.isfinite(float(hdc[idx])):
                h_list = [float(hl[idx]), float(hg[idx]), float(hdc[idx])]
                d_list = [float(dl[idx]), float(dg[idx]), float(ddc[idx])]  # type: ignore[index]
                a_list = [float(al[idx]), float(ag[idx]), float(adc[idx])]  # type: ignore[index]
            else:
                h_list = [float(hl[idx]), float(hg[idx])]
                d_list = [float(dl[idx]), float(dg[idx])]
                a_list = [float(al[idx]), float(ag[idx])]
            entry = {"home": h_list, "draw": d_list, "away": a_list}
            lookup[mid] = entry
            lookup[f"football:{mid}"] = entry
            lookup[f"soccer:{mid}"] = entry

    nfl_csv = PRED_LAB_ROOT / "models" / "nfl" / "artifacts" / "predictions.csv"
    if nfl_csv.exists():
        nfl_df = pd.read_csv(nfl_csv, usecols=["game_id", "season", "model", "p_home", "p_away"])
        nfl_df = nfl_df[
            (nfl_df["season"] >= int(first_eval_season_nfl))
            & nfl_df["model"].isin(["logit", "hgb", "logit_elo"])
        ]
        piv_h = nfl_df.pivot(index="game_id", columns="model", values="p_home")
        piv_a = nfl_df.pivot(index="game_id", columns="model", values="p_away")
        model_cols = [c for c in ("logit", "hgb", "logit_elo") if c in piv_h.columns]
        for gid in piv_h.index:
            h_probs: list[float] = []
            a_probs: list[float] = []
            for mc in model_cols:
                vh = piv_h.at[gid, mc]
                va = piv_a.at[gid, mc]
                if pd.notna(vh) and pd.notna(va):
                    denom = max(1e-12, float(vh) + float(va))
                    h_probs.append(float(vh) / denom)
                    a_probs.append(float(va) / denom)
            if len(h_probs) >= 2:
                gid_s = str(gid)
                entry_nfl = {"home": h_probs, "away": a_probs}
                lookup[gid_s] = entry_nfl
                lookup[f"nfl:{gid_s}"] = entry_nfl

    return lookup


# ---------------------------------------------------------------------------
# Selector Stateful de Portafolio para `services/models/backtest.py` (`run_backtest`)
# ---------------------------------------------------------------------------


class StatefulBacktestPolicySelector:
    """Adaptador causal para `BacktestConfig.pick_selector_fn` que conecta:
      - `blend_weights_v3_1.json` (`a4-blend`: `best_devig_method`, `w_effective`, `model_picks_enabled`)
      - `evaluate_pick_candidates` (`picks_engine.py`), evaluando simultáneamente todos los mercados del `event_id`
      - Exposición acumulada real de portafolio (`<= 2.0u` pick, `<= 2.0u` evento, `<= 3.0u` liga-día, `<= 5.0u` día global)
      - Ticks reales de movimiento sharp en `[ts_decision - 60m, ts_decision]` cuando existen múltiples capturas."""

    def __init__(
        self,
        policy: Mapping[str, Any],
        blend_segments: Mapping[str, Mapping[str, Any]],
        submodel_lookup: Mapping[str, Mapping[str, list[float]]],
        odds_by_event: Mapping[str, list[dict[str, Any]]] | None = None,
        *,
        secondary_specs_by_event: Mapping[str, Sequence[Mapping[str, Any]]] | None = None,
        fold_causal_policies: Mapping[str, Mapping[str, Any]] | None = None,
        fold_causal_clv_by_fold_seg: Mapping[tuple[str, str], tuple[float | None, float | None]] | None = None,
        event_fold_lookup: Mapping[str, str] | None = None,
        allow_stale_sharp_arb: bool = False,
        stale_arb_min_sharp_edge: float = 0.025,
    ) -> None:
        validate_pick_policy(policy)
        self.base_policy = dict(policy)
        self.blend_segments = blend_segments
        self.submodel_lookup = submodel_lookup
        self.odds_by_event = odds_by_event or {}
        self.secondary_specs_by_event = secondary_specs_by_event or {}
        self.fold_causal_policies = fold_causal_policies
        self.fold_causal_clv = fold_causal_clv_by_fold_seg
        self.event_fold_lookup = event_fold_lookup or {}
        self.allow_stale_sharp_arb = bool(allow_stale_sharp_arb)
        self.stale_arb_min_sharp_edge = float(stale_arb_min_sharp_edge)

        self.event_exposure_u: dict[str, float] = {}
        self.event_markets_taken: dict[str, list[str]] = {}
        self.event_pick_counts: dict[str, int] = {}
        self.league_date_exposure_u: dict[str, float] = {}
        self.global_date_exposure_u: dict[str, float] = {}

        self.total_candidates_evaluated: int = 0
        self.rejection_counts: dict[str, int] = {}
        self.selected_decisions_log: list[PickDecisionResult] = []
        self.__qualname__ = "StatefulBacktestPolicySelector.__call__"

    def _build_market_candidates_for_event(
        self,
        *,
        eid: str,
        sport: str,
        league: str,
        source_mode: str,
        m_canon: str,
        l_key: float | None,
        p_model_vec: np.ndarray,
        sub_by_sel: Mapping[str, list[float]],
        decision_quotes: list[dict[str, Any]],
        ev_all_odds: list[dict[str, Any]],
        ts_dec: pd.Timestamp,
        ts_dec_iso: str,
        ts_start_iso: str,
        sharp_window_minutes: float,
        allowed_books: list[str],
        line_shopping: bool,
        real_exec_books: Sequence[str],
    ) -> list[dict[str, Any]]:
        import backtest as bt

        sel_order = bt._selection_order_for_market(m_canon)
        seg_Lookup_m = "totals" if m_canon == "ou" else m_canon
        seg_key = f"{league}::{seg_Lookup_m}"
        b_seg = self.blend_segments.get(seg_key)
        seg_pol = (self.base_policy.get("segments") or {}).get(seg_key)
        seg_enabled = (
            bool(seg_pol["model_picks_enabled"])
            if seg_pol is not None
            else (bool(b_seg.get("model_picks_enabled", False)) if b_seg else False)
        )
        if not seg_enabled and not self.allow_stale_sharp_arb:
            n_sels = len(sel_order)
            self.total_candidates_evaluated += n_sels
            self.rejection_counts["segment_model_picks_disabled"] = (
                self.rejection_counts.get("segment_model_picks_disabled", 0) + n_sels
            )
            return []

        devig_method = str(b_seg.get("best_devig_method", "power")) if b_seg else "power"
        w_eff = float(b_seg.get("w_effective", 0.0)) if b_seg else 0.0

        by_book: dict[str, dict[str, dict[str, Any]]] = {}
        for q in decision_quotes:
            if canonical_pick_market(q["market"]) != m_canon or normalize_pick_line(q.get("line")) != l_key:
                continue
            b = canonical_pick_book(q["book"])
            s = canonical_pick_selection(q["selection"])
            price_f = float(q["price_decimal"])
            if s in sel_order and MIN_PICK_PRICE_DECIMAL <= price_f <= MAX_PICK_PRICE_DECIMAL:
                by_book.setdefault(b, {})[s] = q

        complete_books = {b: sdict for b, sdict in by_book.items() if all(s in sdict for s in sel_order)}
        if not complete_books:
            return []

        sharp_novig_vec: np.ndarray | None = None
        anchor_novig_vec: np.ndarray | None = None
        for ref_b in ("pinnacle", "smarkets", "b365", "caliente", "codere", "bw", "wh"):
            if ref_b in complete_books:
                raw_o = [float(complete_books[ref_b][s]["price_decimal"]) for s in sel_order]
                sum_imp = sum(1.0 / x for x in raw_o)
                if not (0.9 <= sum_imp <= 1.2):
                    continue
                p_dv = devig_prices_by_method(raw_o, devig_method)
                if anchor_novig_vec is None:
                    anchor_novig_vec = p_dv
                if ref_b in ("pinnacle", "smarkets") and sharp_novig_vec is None:
                    sharp_novig_vec = p_dv

        if anchor_novig_vec is None:
            first_b = next(iter(complete_books))
            raw_o = [float(complete_books[first_b][s]["price_decimal"]) for s in sel_order]
            sum_imp = sum(1.0 / x for x in raw_o)
            if not (0.9 <= sum_imp <= 1.2):
                return []
            anchor_novig_vec = devig_prices_by_method(raw_o, devig_method)

        mkt_ref_vec = sharp_novig_vec if sharp_novig_vec is not None else anchor_novig_vec
        p_final_vec = blend_probs_logit_simplex(p_model_vec, mkt_ref_vec, w_eff)

        avail_exec_books = [b for b in allowed_books if b in complete_books and b in real_exec_books]
        if not avail_exec_books:
            return []

        if line_shopping and len(avail_exec_books) > 1:
            chosen_quotes = [
                max((complete_books[b][s] for b in avail_exec_books), key=lambda q: float(q["price_decimal"]))
                for s in sel_order
            ]
        else:
            primary_b = (
                "b365"
                if ("b365" in avail_exec_books and source_mode == "historical_fd")
                else avail_exec_books[0]
            )
            chosen_quotes = [complete_books[primary_b][s] for s in sel_order]

        win_start = ts_dec - timedelta(minutes=sharp_window_minutes)
        causal_sharp_1h: list[dict[str, Any]] = []
        if ev_all_odds:
            for q in ev_all_odds:
                if (
                    q["ts_captured"] <= ts_dec
                    and q["ts_captured"] >= win_start
                    and canonical_pick_book(q["book"]) in ("pinnacle", "smarkets")
                    and canonical_pick_market(q["market"]) == m_canon
                    and normalize_pick_line(q.get("line")) == l_key
                ):
                    causal_sharp_1h.append(
                        {
                            "book": canonical_pick_book(q["book"]),
                            "price_decimal": float(q["price_decimal"]),
                            "ts_captured": q["ts_captured"].isoformat(),
                            "market": m_canon,
                            "line": l_key,
                            "selection": canonical_pick_selection(q["selection"]),
                        }
                    )

        mkt_candidates: list[dict[str, Any]] = []
        for idx, s_name in enumerate(sel_order):
            q_sel = chosen_quotes[idx]
            price_dec = float(q_sel["price_decimal"])
            b_sel = canonical_pick_book(q_sel["book"])

            pure_arb = False
            p_eval_final = float(p_final_vec[idx])
            if (
                self.allow_stale_sharp_arb
                and sharp_novig_vec is not None
                and b_sel not in ("pinnacle", "smarkets")
                and (float(sharp_novig_vec[idx]) - (1.0 / price_dec)) >= self.stale_arb_min_sharp_edge
            ):
                pure_arb = True
                if w_eff <= 0.05:
                    p_eval_final = float(sharp_novig_vec[idx])

            mkt_candidates.append(
                {
                    "candidate_id": f"{eid}:{m_canon}:{l_key}:{s_name}:{b_sel}",
                    "event_id": eid,
                    "sport": sport,
                    "league": league,
                    "market": m_canon,
                    "line": l_key,
                    "selection": s_name,
                    "book": b_sel,
                    "source": str(q_sel.get("source") or source_mode or "historical_fd"),
                    "price_decimal": price_dec,
                    "ts_decision": ts_dec_iso,
                    "ts_event_start": ts_start_iso,
                    "ts_captured": (
                        q_sel["ts_captured"].isoformat()
                        if "ts_captured" in q_sel and q_sel["ts_captured"] is not None
                        else None
                    ),
                    "p_modelo": float(np.clip(p_model_vec[idx], 1e-6, 1.0 - 1e-6)),
                    "p_mercado": float(np.clip(mkt_ref_vec[idx], 1e-6, 1.0 - 1e-6)),
                    "p_final": float(np.clip(p_eval_final, 1e-6, 1.0 - 1e-6)),
                    "submodel_probs": sub_by_sel.get(s_name),
                    "sharp_quotes_1h": causal_sharp_1h if causal_sharp_1h else None,
                    "allow_pure_market_arb": pure_arb,
                }
            )
        return mkt_candidates

    def __call__(
        self,
        event_ctx: dict[str, Any],
        decision_quotes: list[dict[str, Any]],
        config: Any,
    ) -> list[dict[str, Any]]:
        import backtest as bt

        if not decision_quotes:
            return []

        eid = str(event_ctx["event_id"])
        sport = str(event_ctx["sport"])
        league = str(event_ctx["league"])
        source_mode = str(event_ctx.get("source_mode") or "historical_fd")
        m_canon = canonical_pick_market(event_ctx["market"])
        l_key = normalize_pick_line(event_ctx.get("line"))
        p_model_vec = np.asarray(event_ctx["p_model_vec"], dtype=float)
        ts_dec: pd.Timestamp = event_ctx["ts_decision"]
        ts_start: pd.Timestamp = event_ctx["ts_event_start"]
        ts_dec_iso = ts_dec.isoformat()
        ts_start_iso = ts_start.isoformat()

        fk = self.event_fold_lookup.get(eid, "")
        if self.fold_causal_policies is not None and fk in self.fold_causal_policies:
            effective_policy: Mapping[str, Any] = self.fold_causal_policies[fk]
        elif self.fold_causal_clv is not None:
            segs_orig = self.base_policy.get("segments") or {}
            new_segs = dict(segs_orig)
            changed = False
            for s_k, s_cfg in segs_orig.items():
                if str(s_k).startswith(f"{league}::"):
                    past_clv_mean, past_clv_low = self.fold_causal_clv.get((fk, str(s_k)), (None, None))
                    seg_copy = dict(s_cfg)
                    seg_copy["segment_clv_mean"] = past_clv_mean
                    seg_copy["segment_clv_ci95_low"] = past_clv_low
                    new_segs[str(s_k)] = seg_copy
                    changed = True
            effective_policy = {**self.base_policy, "segments": new_segs} if changed else self.base_policy
        else:
            effective_policy = self.base_policy

        sharp_win_min = float(effective_policy.get("sharp_steam_window_minutes", 60.0))
        allowed_books = [canonical_pick_book(b) for b in config.execution_books_priority]
        ev_all_odds = self.odds_by_event.get(eid, [])
        primary_sub = self.submodel_lookup.get(eid) or {}

        candidates: list[dict[str, Any]] = self._build_market_candidates_for_event(
            eid=eid,
            sport=sport,
            league=league,
            source_mode=source_mode,
            m_canon=m_canon,
            l_key=l_key,
            p_model_vec=p_model_vec,
            sub_by_sel=primary_sub,
            decision_quotes=decision_quotes,
            ev_all_odds=ev_all_odds,
            ts_dec=ts_dec,
            ts_dec_iso=ts_dec_iso,
            ts_start_iso=ts_start_iso,
            sharp_window_minutes=sharp_win_min,
            allowed_books=allowed_books,
            line_shopping=bool(config.line_shopping),
            real_exec_books=bt.DEFAULT_REAL_EXECUTION_BOOKS,
        )

        for sec_spec in self.secondary_specs_by_event.get(eid) or ():
            sec_mkt = canonical_pick_market(sec_spec["market"])
            sec_line = normalize_pick_line(sec_spec.get("line"))
            sec_p_mod = np.asarray(sec_spec["p_model_vec"], dtype=float)
            sec_sub = sec_spec.get("submodel_probs") or {}
            candidates.extend(
                self._build_market_candidates_for_event(
                    eid=eid,
                    sport=sport,
                    league=league,
                    source_mode=source_mode,
                    m_canon=sec_mkt,
                    l_key=sec_line,
                    p_model_vec=sec_p_mod,
                    sub_by_sel=sec_sub,
                    decision_quotes=decision_quotes,
                    ev_all_odds=ev_all_odds,
                    ts_dec=ts_dec,
                    ts_dec_iso=ts_dec_iso,
                    ts_start_iso=ts_start_iso,
                    sharp_window_minutes=sharp_win_min,
                    allowed_books=allowed_books,
                    line_shopping=bool(config.line_shopping),
                    real_exec_books=bt.DEFAULT_REAL_EXECUTION_BOOKS,
                )
            )

        if not candidates:
            return []

        p_state = {
            "event_exposure_u": self.event_exposure_u,
            "event_markets_taken": self.event_markets_taken,
            "event_pick_counts": self.event_pick_counts,
            "league_date_exposure_u": self.league_date_exposure_u,
            "global_date_exposure_u": self.global_date_exposure_u,
        }
        all_decisions = evaluate_pick_candidates(
            candidates, effective_policy, p_state, _trusted_validated_policy=True
        )
        self.total_candidates_evaluated += len(all_decisions)
        for d in all_decisions:
            if not d.approved and d.rejection_reason is not None:
                self.rejection_counts[d.rejection_reason] = self.rejection_counts.get(d.rejection_reason, 0) + 1

        approved_decisions = [d for d in all_decisions if d.approved]
        if not approved_decisions:
            return []
        approved_decisions.sort(key=lambda d: d.allocation_rank or 0)

        out_picks: list[dict[str, Any]] = []
        for dec in approved_decisions:
            ld_key = f"{dec.league}::{dec.utc_date}"
            self.event_exposure_u[dec.event_id] = self.event_exposure_u.get(dec.event_id, 0.0) + dec.stake_u
            self.league_date_exposure_u[ld_key] = self.league_date_exposure_u.get(ld_key, 0.0) + dec.stake_u
            self.global_date_exposure_u[dec.utc_date] = (
                self.global_date_exposure_u.get(dec.utc_date, 0.0) + dec.stake_u
            )
            self.event_pick_counts[dec.event_id] = self.event_pick_counts.get(dec.event_id, 0) + 1
            self.event_markets_taken.setdefault(dec.event_id, []).append(dec.market)
            self.selected_decisions_log.append(dec)

            orig_cand = candidates[dec.input_index]
            out_picks.append(
                {
                    "market": dec.market,
                    "line": dec.line,
                    "selection": dec.selection,
                    "book": dec.book,
                    "source": orig_cand["source"],
                    "price_decision": dec.price_decimal,
                    "p_modelo": dec.p_modelo,
                    "p_mercado": dec.p_mercado,
                    "p_final": dec.p_final,
                    "stake_u": dec.stake_u,
                    "tier": dec.tier,
                }
            )
        return out_picks


# ---------------------------------------------------------------------------
# Calibración Walk-Forward Causal (`unlock_holdout=False`) y Backtest Ola 2
# ---------------------------------------------------------------------------

_RELEVANT_BACKTEST_BOOKS: frozenset[str] = frozenset(
    {
        "pinnacle",
        "smarkets",
        "b365",
        "caliente",
        "codere",
        "bw",
        "wh",
        "draftkings",
        "fanduel",
        "betmgm",
        "betrivers",
        "nflverse",
    }
)

_PRIOR_BUCKET_BASE: dict[str, dict[str, float]] = {
    "short": {"p_edge_min": 0.012, "ev_threshold_solido": 0.022, "ev_threshold_valor": 0.045},
    "even": {"p_edge_min": 0.015, "ev_threshold_solido": 0.030, "ev_threshold_valor": 0.060},
    "plus": {"p_edge_min": 0.016, "ev_threshold_solido": 0.042, "ev_threshold_valor": 0.080},
    "long": {"p_edge_min": 0.018, "ev_threshold_solido": 0.065, "ev_threshold_valor": 0.120},
}


def _dixon_coles_2way_matrix(
    lam_home: np.ndarray,
    lam_away: np.ndarray,
    lines: np.ndarray,
    market: str,
    rho: float = -0.08,
    max_goals: int = 12,
) -> np.ndarray:
    """Probabilidades `(p_primary, p_opposite)` condicionales a no-push sobre rejilla `0..max_goals`."""
    from scipy.stats import poisson

    n = len(lam_home)
    out = np.full((n, 2), 0.5, dtype=np.float64)
    if n == 0:
        return out

    lh = np.clip(np.asarray(lam_home, dtype=np.float64), 0.05, 8.0)
    la = np.clip(np.asarray(lam_away, dtype=np.float64), 0.05, 8.0)
    ln_arr = np.asarray(lines, dtype=np.float64)

    g = np.arange(max_goals + 1, dtype=np.int64)
    pmf_h = poisson.pmf(g[None, :], lh[:, None])
    pmf_a = poisson.pmf(g[None, :], la[:, None])
    mat = pmf_h[:, :, None] * pmf_a[:, None, :]

    if abs(rho) > 1e-12:
        mat[:, 0, 0] *= np.clip(1.0 - lh * la * rho, 0.1, 2.5)
        mat[:, 0, 1] *= np.clip(1.0 + lh * rho, 0.1, 2.5)
        mat[:, 1, 0] *= np.clip(1.0 + la * rho, 0.1, 2.5)
        mat[:, 1, 1] *= np.clip(1.0 - rho, 0.1, 2.5)
    mat /= np.maximum(1e-15, mat.sum(axis=(1, 2), keepdims=True))

    gh = g[None, :, None].astype(np.float64)
    ga = g[None, None, :].astype(np.float64)
    diff = ((gh + ga) - ln_arr[:, None, None]) if market == "totals" else ((gh - ga) + ln_arr[:, None, None])

    p_pos = np.sum(np.where(diff > 1e-9, mat, 0.0), axis=(1, 2))
    p_neg = np.sum(np.where(diff < -1e-9, mat, 0.0), axis=(1, 2))
    p0 = np.clip(p_pos / np.maximum(1e-12, p_pos + p_neg), 1e-6, 1.0 - 1e-6)
    out[:, 0] = p0
    out[:, 1] = 1.0 - p0
    return out


def _build_secondary_market_specs_for_dev(
    dev_df: pd.DataFrame,
    dev_odds: pd.DataFrame,
    submodel_lookup: Mapping[str, Mapping[str, list[float]]],
) -> dict[str, list[dict[str, Any]]]:
    """Construye especificaciones pre-partido causales para mercados secundarios (`ah`, `totals`) en `dev_df`."""
    specs: dict[str, list[dict[str, Any]]] = {}
    soc_dev = dev_df[dev_df["sport"] == "football"].copy().reset_index(drop=True)
    if soc_dev.empty:
        return specs

    feats_path = PRED_LAB_ROOT / "data" / "processed" / "features.parquet"
    if not feats_path.exists():
        return specs

    soc_feats = pd.read_parquet(
        feats_path,
        columns=["match_id", "dc_lam_home", "dc_lam_away"],
    ).drop_duplicates("match_id")
    soc_dev = soc_dev.merge(soc_feats, left_on="raw_event_id", right_on="match_id", how="left")

    dec_ts_by_eid = dict(zip(soc_dev["event_id"].astype(str), soc_dev["ts_decision"]))
    soc_odds = dev_odds[
        (dev_odds["sport_canon"] == "football")
        & (dev_odds["market_canon"].isin(["ah", "totals"]))
        & (dev_odds["line"].notna())
    ].copy()
    if soc_odds.empty:
        return specs

    mapped_dec = soc_odds["event_id"].astype(str).map(dec_ts_by_eid)
    is_pre_dec = (soc_odds["snapshot_stage"] == "open") | (
        (soc_odds["source"].astype(str).str.lower() == "scraped_ws") & (soc_odds["ts_captured"] <= mapped_dec)
    )
    pre_odds = soc_odds[is_pre_dec].copy()
    if pre_odds.empty:
        return specs

    book_prio = {"pinnacle": 0, "smarkets": 1, "b365": 2, "bw": 3, "wh": 4, "caliente": 5, "codere": 6}
    pre_odds["_brank"] = pre_odds["book_canon"].map(lambda b: book_prio.get(str(b), 99))
    best_lines_df = (
        pre_odds.sort_values(["event_id", "market_canon", "_brank", "ts_captured"], kind="mergesort")
        .drop_duplicates(["event_id", "market_canon"], keep="first")[["event_id", "market_canon", "line"]]
    )

    line_lookup: dict[tuple[str, str], float] = {
        (str(r.event_id), str(r.market_canon)): float(r.line)
        for r in best_lines_df.itertuples(index=False)
    }

    eids = soc_dev["event_id"].astype(str).tolist()
    lam_h_all = soc_dev["dc_lam_home"].fillna(1.45).to_numpy(dtype=np.float64)
    lam_a_all = soc_dev["dc_lam_away"].fillna(1.15).to_numpy(dtype=np.float64)

    for mkt_name, sel_pair in (("ah", ("home", "away")), ("totals", ("over", "under"))):
        idx_valid = [i for i, e in enumerate(eids) if (e, mkt_name) in line_lookup]
        if not idx_valid:
            continue
        lh_sub = lam_h_all[idx_valid]
        la_sub = lam_a_all[idx_valid]
        ln_sub = np.array([line_lookup[(eids[i], mkt_name)] for i in idx_valid], dtype=np.float64)

        p_dc = _dixon_coles_2way_matrix(lh_sub, la_sub, ln_sub, mkt_name, rho=-0.08)
        p_indep = _dixon_coles_2way_matrix(lh_sub, la_sub, ln_sub, mkt_name, rho=0.0)

        # Escalar intensidades según desacuerdo entre submodelos 1x2 (`logit`, `hgb`, `dc`) para reflejar incertidumbre real
        lh_l = lh_sub.copy()
        la_l = la_sub.copy()
        lh_g = lh_sub.copy()
        la_g = la_sub.copy()
        for k_pos, orig_i in enumerate(idx_valid):
            eid_s = eids[orig_i]
            sub_1x2 = submodel_lookup.get(eid_s)
            if sub_1x2 and len(sub_1x2.get("home", ())) >= 3:
                ph_l, ph_g, ph_dc = sub_1x2["home"][0], sub_1x2["home"][1], max(1e-4, sub_1x2["home"][2])
                pd_l, pd_g, pd_dc = sub_1x2["draw"][0], sub_1x2["draw"][1], max(1e-4, sub_1x2["draw"][2])
                if mkt_name == "ah":
                    rl = float(np.clip((ph_l / ph_dc) ** 0.5, 0.72, 1.38))
                    rg = float(np.clip((ph_g / ph_dc) ** 0.5, 0.72, 1.38))
                    lh_l[k_pos], la_l[k_pos] = lh_sub[k_pos] * rl, la_sub[k_pos] / rl
                    lh_g[k_pos], la_g[k_pos] = lh_sub[k_pos] * rg, la_sub[k_pos] / rg
                else:
                    tl = float(
                        np.clip(
                            -math.log(max(0.05, min(0.65, pd_l))) / max(0.25, -math.log(max(0.05, min(0.65, pd_dc)))),
                            0.75,
                            1.35,
                        )
                    )
                    tg = float(
                        np.clip(
                            -math.log(max(0.05, min(0.65, pd_g))) / max(0.25, -math.log(max(0.05, min(0.65, pd_dc)))),
                            0.75,
                            1.35,
                        )
                    )
                    lh_l[k_pos], la_l[k_pos] = lh_sub[k_pos] * tl, la_sub[k_pos] * tl
                    lh_g[k_pos], la_g[k_pos] = lh_sub[k_pos] * tg, la_sub[k_pos] * tg

        p_mod_l = _dixon_coles_2way_matrix(lh_l, la_l, ln_sub, mkt_name, rho=-0.04)
        p_mod_g = _dixon_coles_2way_matrix(lh_g, la_g, ln_sub, mkt_name, rho=-0.04)

        for k_pos, orig_i in enumerate(idx_valid):
            eid_s = eids[orig_i]
            s0, s1 = sel_pair
            sub_map = {
                s0: [float(p_mod_l[k_pos, 0]), float(p_mod_g[k_pos, 0]), float(p_dc[k_pos, 0]), float(p_indep[k_pos, 0])][:3],
                s1: [float(p_mod_l[k_pos, 1]), float(p_mod_g[k_pos, 1]), float(p_dc[k_pos, 1]), float(p_indep[k_pos, 1])][:3],
            }
            specs.setdefault(eid_s, []).append(
                {
                    "market": mkt_name,
                    "line": float(ln_sub[k_pos]),
                    "p_model_vec": (float(p_dc[k_pos, 0]), float(p_dc[k_pos, 1])),
                    "submodel_probs": sub_map,
                }
            )

    return specs


def _prescan_dev_candidate_observations(
    dev_df: pd.DataFrame,
    odds_by_event: Mapping[str, list[dict[str, Any]]],
    blend_segments: Mapping[str, Mapping[str, Any]],
    submodel_lookup: Mapping[str, Mapping[str, list[float]]],
    secondary_specs_by_event: Mapping[str, Sequence[Mapping[str, Any]]],
    *,
    historical_delay_alpha: float = 0.05,
    execution_delay_minutes: float = 2.0,
    line_shopping: bool = True,
) -> pd.DataFrame:
    """Extrae observaciones pre-filtro `(ev > 0)` en `walk_forward_dev` con su cierre sharp post-partido
    estrictamente separado por `fold_key` y `ts_event_start` para calibrar umbrales por `league × market × odds_bucket`."""
    import backtest as bt

    rows: list[dict[str, Any]] = []
    allowed_books = [canonical_pick_book(b) for b in bt.BacktestConfig().execution_books_priority]
    cols_idx = {c: i for i, c in enumerate(dev_df.columns)}

    for row_tuple in dev_df.itertuples(index=False, name=None):
        eid = str(row_tuple[cols_idx["event_id"]])
        sport = str(row_tuple[cols_idx["sport"]])
        league = str(row_tuple[cols_idx["league"]])
        fold_key = str(row_tuple[cols_idx["fold_key"]])
        mkt_primary = canonical_pick_market(row_tuple[cols_idx["market"]])
        line_primary = normalize_pick_line(row_tuple[cols_idx["line"]]) if "line" in cols_idx else None
        src_mode = str(row_tuple[cols_idx["source_mode"]]) if "source_mode" in cols_idx else "historical_fd"
        ts_dec: pd.Timestamp = row_tuple[cols_idx["ts_decision"]]
        ts_start: pd.Timestamp = row_tuple[cols_idx["ts_event_start"]]
        p_mod_primary = bt._extract_model_prob_vector(row_tuple, cols_idx, mkt_primary)

        ev_odds = odds_by_event.get(eid, [])
        if not ev_odds:
            continue
        dec_quotes = bt._extract_decision_quotes_for_event(
            {"event_id": eid, "source_mode": src_mode}, ev_odds, None, ts_dec
        )
        if not dec_quotes:
            continue

        mkt_tasks: list[tuple[str, float | None, np.ndarray, Mapping[str, list[float]]]] = [
            (mkt_primary, line_primary, p_mod_primary, submodel_lookup.get(eid) or {})
        ]
        for sec in secondary_specs_by_event.get(eid) or ():
            mkt_tasks.append(
                (
                    canonical_pick_market(sec["market"]),
                    normalize_pick_line(sec.get("line")),
                    np.asarray(sec["p_model_vec"], dtype=float),
                    sec.get("submodel_probs") or {},
                )
            )

        for m_canon, l_key, p_m_vec, sub_map in mkt_tasks:
            seg_key = f"{league}::{'totals' if m_canon == 'ou' else m_canon}"
            b_seg = blend_segments.get(seg_key)
            if b_seg is None:
                continue
            devig_m = str(b_seg.get("best_devig_method", "power"))
            w_eff = float(b_seg.get("w_effective", 0.0))
            seg_enabled = bool(b_seg.get("model_picks_enabled", False))

            sel_order = bt._selection_order_for_market(m_canon)
            by_book: dict[str, dict[str, dict[str, Any]]] = {}
            for q in dec_quotes:
                if canonical_pick_market(q["market"]) != m_canon or normalize_pick_line(q.get("line")) != l_key:
                    continue
                b = canonical_pick_book(q["book"])
                s = canonical_pick_selection(q["selection"])
                pf = float(q["price_decimal"])
                if s in sel_order and MIN_PICK_PRICE_DECIMAL <= pf <= MAX_PICK_PRICE_DECIMAL:
                    by_book.setdefault(b, {})[s] = q
            complete_books = {b: sd for b, sd in by_book.items() if all(s in sd for s in sel_order)}
            if not complete_books:
                continue

            sharp_nv: np.ndarray | None = None
            anchor_nv: np.ndarray | None = None
            for rb in ("pinnacle", "smarkets", "b365", "caliente", "codere", "bw", "wh"):
                if rb in complete_books:
                    ro = [float(complete_books[rb][s]["price_decimal"]) for s in sel_order]
                    if not (0.9 <= sum(1.0 / x for x in ro) <= 1.2):
                        continue
                    pdv = devig_prices_by_method(ro, devig_m)
                    if anchor_nv is None:
                        anchor_nv = pdv
                    if rb in ("pinnacle", "smarkets") and sharp_nv is None:
                        sharp_nv = pdv
            if anchor_nv is None:
                continue

            mkt_ref = sharp_nv if sharp_nv is not None else anchor_nv
            p_fin_vec = blend_probs_logit_simplex(p_m_vec, mkt_ref, w_eff)
            avail_exec = [b for b in allowed_books if b in complete_books and b in bt.DEFAULT_REAL_EXECUTION_BOOKS]
            if not avail_exec:
                continue

            if line_shopping and len(avail_exec) > 1:
                chosen = [
                    max((complete_books[b][s] for b in avail_exec), key=lambda q: float(q["price_decimal"]))
                    for s in sel_order
                ]
            else:
                pb = "b365" if ("b365" in avail_exec and src_mode == "historical_fd") else avail_exec[0]
                chosen = [complete_books[pb][s] for s in sel_order]

            closing_info = bt.resolve_sharp_closing_market(
                ev_odds, market=m_canon, line=l_key, ts_event_start=ts_start
            )
            c_miss = bool(closing_info["closing_missing"])

            for idx, s_name in enumerate(sel_order):
                q_sel = chosen[idx]
                price_dec = float(q_sel["price_decimal"])
                b_sel = canonical_pick_book(q_sel["book"])
                p_fin = float(p_fin_vec[idx])
                sharp_edge = (float(sharp_nv[idx]) - (1.0 / price_dec)) if sharp_nv is not None else -1.0

                # Solo registrar observaciones con algún indicio positivo de valor pre-partido
                if p_fin <= (1.0 / price_dec) and sharp_edge <= 0.015:
                    continue

                price_tomado, ts_exec, _ = bt.resolve_execution_price(
                    ev_odds,
                    source=str(q_sel.get("source") or src_mode),
                    market=m_canon,
                    line=l_key,
                    selection=s_name,
                    book=b_sel,
                    price_decision=price_dec,
                    ts_decision=ts_dec,
                    ts_event_start=ts_start,
                    execution_delay_minutes=execution_delay_minutes,
                    historical_delay_alpha=historical_delay_alpha,
                )
                if price_tomado is None or ts_exec is None:
                    continue

                price_cl_nv = (
                    float(closing_info["prices_novig"][s_name])
                    if (not c_miss and closing_info["prices_novig"] and s_name in closing_info["prices_novig"])
                    else None
                )
                clv_pct, clv_prob = bt._compute_single_pick_clv(
                    price_tomado,
                    price_cl_nv,
                    c_miss,
                    closing_book=closing_info.get("closing_book"),
                    closing_source=closing_info.get("closing_source"),
                )
                sub_p = sub_map.get(s_name)
                sig_p = compute_submodel_dispersion({"submodel_probs": sub_p}) if sub_p else None

                rows.append(
                    {
                        "event_id": eid,
                        "sport": sport,
                        "league": league,
                        "market": "totals" if m_canon == "ou" else m_canon,
                        "segment_key": seg_key,
                        "fold_key": fold_key,
                        "ts_decision": ts_dec,
                        "ts_event_start": ts_start,
                        "book": b_sel,
                        "odds_bucket": classify_odds_bucket(price_dec),
                        "price_decimal": price_dec,
                        "p_final": p_fin,
                        "p_edge": p_fin - (1.0 / price_dec),
                        "ev": p_fin * price_dec - 1.0,
                        "sharp_edge": sharp_edge,
                        "is_soft_book": b_sel not in ("pinnacle", "smarkets"),
                        "sigma_p": float(sig_p) if sig_p is not None else 0.02,
                        "model_picks_enabled": seg_enabled,
                        "clv_pct": clv_pct,
                        "clv_prob": clv_prob,
                    }
                )
    return pd.DataFrame(rows)


def _calibrate_policy_from_observations(
    obs_df: pd.DataFrame,
    blend_segments: Mapping[str, Mapping[str, Any]],
    *,
    ev_scale: float = 1.0,
    max_sigma_p: float = 0.065,
    uncertainty_penalty_k: float = 0.50,
    max_adverse_ticks_1h: float = 3.0,
    rho_same_event: float = 0.35,
    allow_pure_market_arb: bool = False,
    stale_arb_min_sharp_edge: float = 0.025,
    n_bootstrap: int = 1000,
    seed: int = 20261111,
) -> dict[str, Any]:
    """Aprende los umbrales `(p_edge_min, ev_threshold_solido, ev_threshold_valor)` por
    `league × market × odds_bucket` con contracción empírica (`m0 = 60`) y calcula `segment_clv_ci95_low`
    con bootstrap determinista (`>= 1000` remuestreos)."""
    import clv_report

    def _scaled_prior(bucket_name: str) -> dict[str, float]:
        base = _PRIOR_BUCKET_BASE[bucket_name]
        ev_s = round(max(0.010, base["ev_threshold_solido"] * ev_scale), 5)
        ev_v = round(max(ev_s + 0.015, base["ev_threshold_valor"] * ev_scale), 5)
        pe = round(max(0.005, base["p_edge_min"] * ev_scale), 5)
        return {
            "p_edge_min": pe,
            "ev_threshold_solido": ev_s,
            "ev_threshold_valor": ev_v,
        }

    default_buckets = {b: _scaled_prior(b) for b in ODDS_BUCKETS}

    # Filtrar observaciones elegibles bajo los hiperparámetros de candidato
    if not obs_df.empty:
        elig_mask = obs_df["sigma_p"] <= max_sigma_p
        if allow_pure_market_arb:
            elig_mask = elig_mask & (
                obs_df["model_picks_enabled"]
                | (obs_df["is_soft_book"] & (obs_df["sharp_edge"] >= stale_arb_min_sharp_edge))
            )
        else:
            elig_mask = elig_mask & obs_df["model_picks_enabled"]
        elig = obs_df[elig_mask & obs_df["clv_pct"].notna()].copy()
    else:
        elig = pd.DataFrame()

    cand_ev_grid = (0.018, 0.025, 0.032, 0.040, 0.050, 0.065, 0.085, 0.110)

    def _learn_cell_ev(sub_cell: pd.DataFrame, prior_d: dict[str, float], m0: float = 60.0) -> dict[str, float]:
        if sub_cell.empty or len(sub_cell) < 8:
            return dict(prior_d)
        evs = sub_cell["ev"].to_numpy(dtype=np.float64)
        clvs = sub_cell["clv_pct"].to_numpy(dtype=np.float64)
        best_thr = prior_d["ev_threshold_solido"]
        best_score = -1e9
        for thr in cand_ev_grid:
            m = evs >= thr
            cnt = int(m.sum())
            if cnt < 8:
                continue
            mean_clv = float(clvs[m].mean())
            # Objetivo regularizado: maximizar CLV medio penalizando varianza muestral `1 / sqrt(cnt)`
            score = mean_clv - (0.008 / math.sqrt(cnt))
            if score > best_score:
                best_score = score
                best_thr = thr
        n_c = float(len(sub_cell))
        w_shrink = n_c / (n_c + m0)
        ev_sol = round(max(0.012, w_shrink * best_thr + (1.0 - w_shrink) * prior_d["ev_threshold_solido"]), 5)
        ev_val = round(max(ev_sol + 0.018, 1.75 * ev_sol, w_shrink * (1.75 * best_thr) + (1.0 - w_shrink) * prior_d["ev_threshold_valor"]), 5)
        p_edge = round(max(0.006, min(0.035, prior_d["p_edge_min"] * (ev_sol / max(0.01, prior_d["ev_threshold_solido"])))), 5)
        return {
            "p_edge_min": p_edge,
            "ev_threshold_solido": ev_sol,
            "ev_threshold_valor": ev_val,
        }

    market_default_buckets: dict[str, dict[str, dict[str, float]]] = {}
    for mkt in ("1x2", "ah", "totals", "moneyline", "spread"):
        mkt_sub = elig[elig["market"] == mkt] if not elig.empty else pd.DataFrame()
        market_default_buckets[mkt] = {}
        for b_name in ODDS_BUCKETS:
            b_sub = mkt_sub[mkt_sub["odds_bucket"] == b_name] if not mkt_sub.empty else pd.DataFrame()
            market_default_buckets[mkt][b_name] = _learn_cell_ev(b_sub, default_buckets[b_name], m0=100.0)

    segments_policy: dict[str, dict[str, Any]] = {}
    for idx_seg, seg_key in enumerate(sorted(blend_segments.keys())):
        b_seg = blend_segments[seg_key]
        lg = str(b_seg["league"])
        mk = str(b_seg["market"])
        seg_sub = elig[elig["segment_key"] == seg_key] if not elig.empty else pd.DataFrame()

        seg_buckets: dict[str, dict[str, float]] = {}
        mkt_priors = market_default_buckets.get(mk, default_buckets)
        for b_name in ODDS_BUCKETS:
            cell_sub = seg_sub[seg_sub["odds_bucket"] == b_name] if not seg_sub.empty else pd.DataFrame()
            seg_buckets[b_name] = _learn_cell_ev(cell_sub, mkt_priors[b_name], m0=60.0)

        # Calcular CLV histórico del segmento sobre candidatos que pasan su umbral `ev_threshold_solido`
        clv_vals: list[float] = []
        if not seg_sub.empty:
            for r in seg_sub.itertuples(index=False):
                bt_cfg = seg_buckets[str(r.odds_bucket)]
                p_shrunk_r = max(0.0, float(r.p_final) - uncertainty_penalty_k * float(r.sigma_p))
                if (
                    float(r.p_edge) > bt_cfg["p_edge_min"]
                    and float(r.ev) >= bt_cfg["ev_threshold_solido"]
                    and p_shrunk_r > (1.0 / float(r.price_decimal))
                ):
                    clv_vals.append(float(r.clv_pct))

        if len(clv_vals) >= 15:
            arr_clv = np.asarray(clv_vals, dtype=np.float64)
            unifs = clv_report.mulberry32_uniforms(int(seed + 31 * (idx_seg + 1)), int(n_bootstrap) * len(arr_clv))
            boot_idx = np.floor(unifs * len(arr_clv)).astype(np.int64).reshape(int(n_bootstrap), len(arr_clv))
            boot_means = np.sort(arr_clv[boot_idx].mean(axis=1))
            clv_mean: float | None = round(float(arr_clv.mean()), 8)
            clv_low: float | None = round(float(clv_report.quantile_linear_sorted(boot_means, 0.025)), 8)
            clv_high: float | None = round(float(clv_report.quantile_linear_sorted(boot_means, 0.975)), 8)
        elif len(clv_vals) > 0:
            # Con muestra `< 15`, no otorgar nunca `segment_clv_ci95_low > 0` para evitar falsos "solido"
            clv_mean = round(float(np.mean(clv_vals)), 8)
            clv_low = -abs(clv_mean) - 0.01
            clv_high = abs(clv_mean) + 0.01
        else:
            clv_mean = None
            clv_low = None
            clv_high = None

        segments_policy[seg_key] = {
            "league": lg,
            "market": mk,
            "model_picks_enabled": bool(b_seg["model_picks_enabled"]),
            "disabled_reason": b_seg.get("disabled_reason"),
            "w_effective": float(b_seg.get("w_effective", 0.0)),
            "best_devig_method": str(b_seg.get("best_devig_method", "power")),
            "allow_pure_market_arb": bool(allow_pure_market_arb),
            "segment_clv_mean": clv_mean,
            "segment_clv_ci95_low": clv_low,
            "segment_clv_ci95_high": clv_high,
            "n_picks_clv_dev": len(clv_vals),
            "buckets": seg_buckets,
        }

    policy: dict[str, Any] = {
        "schema_version": "pick_policy_v3.1.0",
        "policy_version": "pick_policy_v3.1_ola2",
        "kelly_fraction": DEFAULT_KELLY_FRACTION,
        "bankroll_unit_pct": DEFAULT_BANKROLL_UNIT_PCT,
        "caps": {
            "max_stake_per_pick_u": HARD_MAX_STAKE_PER_PICK_U,
            "max_stake_per_event_u": HARD_MAX_STAKE_PER_EVENT_U,
            "max_stake_per_league_date_u": HARD_MAX_STAKE_PER_LEAGUE_DATE_U,
            "max_stake_per_global_date_u": HARD_MAX_STAKE_PER_GLOBAL_DATE_U,
        },
        "min_stake_u": DEFAULT_MIN_STAKE_U,
        "max_sigma_p": float(max_sigma_p),
        "max_adverse_ticks_1h": float(max_adverse_ticks_1h),
        "sharp_steam_window_minutes": DEFAULT_SHARP_STEAM_WINDOW_MINUTES,
        "sharp_implied_prob_tick": DEFAULT_SHARP_IMPLIED_PROB_TICK,
        "uncertainty_penalty_k": float(uncertainty_penalty_k),
        "rho_same_event": float(rho_same_event),
        "allow_pure_market_arb": bool(allow_pure_market_arb),
        "stale_arb_min_sharp_edge": float(stale_arb_min_sharp_edge),
        "require_submodel_dispersion": False,
        "fallback_sigma_p": 0.025,
        "unknown_segment_model_picks_enabled": False,
        "tier_classification_rule": (
            "Solo existen 2 niveles ('solido' | 'valor'); 'Tiro de Cuota Alta' eliminado al 100% y "
            "prohibido usar % de acierto. Si ev >= ev_threshold_valor -> 'valor'; si ev_threshold_solido <= ev < "
            "ev_threshold_valor y segment_clv_ci95_low > 0 -> 'solido'; en otro caso se rechaza."
        ),
        "default_buckets": default_buckets,
        "market_default_buckets": market_default_buckets,
        "segments": segments_policy,
    }
    validate_pick_policy(policy)
    return policy


def _build_fold_causal_policies(
    obs_df: pd.DataFrame,
    dev_df: pd.DataFrame,
    blend_segments: Mapping[str, Mapping[str, Any]],
    *,
    ev_scale: float,
    max_sigma_p: float,
    uncertainty_penalty_k: float,
    max_adverse_ticks_1h: float,
    rho_same_event: float,
    allow_pure_market_arb: bool,
    stale_arb_min_sharp_edge: float,
    n_bootstrap: int = 1000,
    seed: int = 20261111,
) -> dict[str, dict[str, Any]]:
    """Construye una política estrictamente causal por `fold_key` usando SOLO observaciones con
    `ts_event_start < fold_cut_ts` (cero lookahead dentro de `walk_forward_dev`)."""
    fold_policies: dict[str, dict[str, Any]] = {}
    unique_folds = sorted(dev_df["fold_key"].astype(str).unique())
    for idx_f, fk in enumerate(unique_folds):
        fold_cut_ts = dev_df.loc[dev_df["fold_key"].astype(str) == fk, "ts_decision"].min()
        past_obs = obs_df[obs_df["ts_event_start"] < fold_cut_ts] if not obs_df.empty else pd.DataFrame()
        fold_policies[fk] = _calibrate_policy_from_observations(
            past_obs,
            blend_segments,
            ev_scale=ev_scale,
            max_sigma_p=max_sigma_p,
            uncertainty_penalty_k=uncertainty_penalty_k,
            max_adverse_ticks_1h=max_adverse_ticks_1h,
            rho_same_event=rho_same_event,
            allow_pure_market_arb=allow_pure_market_arb,
            stale_arb_min_sharp_edge=stale_arb_min_sharp_edge,
            n_bootstrap=n_bootstrap,
            seed=seed + 700 * (idx_f + 1),
        )
    return fold_policies


def _reconstruct_settled_picks_with_audit(
    selected_decisions: Sequence[PickDecisionResult],
    dev_df: pd.DataFrame,
    odds_by_event: Mapping[str, list[dict[str, Any]]],
    *,
    phase: str,
    model_version: str,
    execution_delay_minutes: float = 2.0,
    historical_delay_alpha: float = 0.05,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Reconstruye los picks efectivamente ejecutados para auditar los 4 topes duros de portafolio
    y calcular métricas con IC 95% bootstrap por `tier` (`solido`, `valor`) y `odds_bucket`."""
    import backtest as bt

    ev_meta: dict[str, tuple[pd.Timestamp, pd.Timestamp, str, float, float, int]] = {}
    for r in dev_df.itertuples(index=False):
        ev_meta[str(r.event_id)] = (
            r.ts_decision,
            r.ts_event_start,
            str(getattr(r, "source_mode", "historical_fd")),
            float(r.home_score),
            float(r.away_score),
            int(r.y),
        )

    settled: list[dict[str, Any]] = []
    event_totals: dict[str, float] = {}
    ld_totals: dict[str, float] = {}
    gd_totals: dict[str, float] = {}
    max_pick_u = 0.0

    for idx_d, dec in enumerate(selected_decisions):
        meta = ev_meta.get(dec.event_id)
        if meta is None:
            continue
        ts_dec, ts_start, src_mode, h_sc, a_sc, y_raw = meta
        ev_odds = odds_by_event.get(dec.event_id, [])
        q_src = src_mode
        for q in ev_odds:
            if (
                canonical_pick_market(q["market"]) == dec.market
                and normalize_pick_line(q.get("line")) == dec.line
                and canonical_pick_selection(q["selection"]) == dec.selection
                and canonical_pick_book(q["book"]) == dec.book
                and q["ts_captured"] <= ts_dec
            ):
                q_src = str(q.get("source") or src_mode)
                break

        price_tomado, ts_exec, exec_status = bt.resolve_execution_price(
            ev_odds,
            source=q_src,
            market=dec.market,
            line=dec.line,
            selection=dec.selection,
            book=dec.book,
            price_decision=dec.price_decimal,
            ts_decision=ts_dec,
            ts_event_start=ts_start,
            execution_delay_minutes=execution_delay_minutes,
            historical_delay_alpha=historical_delay_alpha,
        )
        if price_tomado is None or ts_exec is None or price_tomado < 1.01:
            continue

        pick_cl = bt.resolve_sharp_closing_market(ev_odds, market=dec.market, line=dec.line, ts_event_start=ts_start)
        c_miss = bool(pick_cl["closing_missing"])
        p_cl_nv = (
            float(pick_cl["prices_novig"][dec.selection])
            if (not c_miss and pick_cl["prices_novig"] and dec.selection in pick_cl["prices_novig"])
            else None
        )
        clv_pct, clv_prob = bt._compute_single_pick_clv(
            price_tomado,
            p_cl_nv,
            c_miss,
            closing_book=pick_cl.get("closing_book"),
            closing_source=pick_cl.get("closing_source"),
        )
        status_s, unit_ret = bt.settle_selection_unit_return(
            dec.market, dec.selection, dec.line, price_tomado, h_sc, a_sc, outcome_label=y_raw
        )
        pnl_u = dec.stake_u * unit_ret

        max_pick_u = max(max_pick_u, dec.stake_u)
        event_totals[dec.event_id] = event_totals.get(dec.event_id, 0.0) + dec.stake_u
        ld_k = f"{dec.league}::{dec.utc_date}"
        ld_totals[ld_k] = ld_totals.get(ld_k, 0.0) + dec.stake_u
        gd_totals[dec.utc_date] = gd_totals.get(dec.utc_date, 0.0) + dec.stake_u

        settled.append(
            {
                "pick_id": f"{phase}:{dec.event_id}:{dec.market}:{dec.selection}:{idx_d}",
                "ts_emitido": ts_dec.isoformat(),
                "ts_executed": ts_exec.isoformat(),
                "ts_event_start": ts_start.isoformat(),
                "event_id": dec.event_id,
                "sport": dec.sport,
                "league": dec.league,
                "market": dec.market,
                "line": dec.line,
                "selection": dec.selection,
                "book": dec.book,
                "source": q_src,
                "execution_status": exec_status,
                "price_decision": dec.price_decimal,
                "price_tomado": price_tomado,
                "price_cierre_sin_margen": p_cl_nv,
                "closing_missing": c_miss,
                "p_modelo": dec.p_modelo,
                "p_mercado": dec.p_mercado,
                "p_final": dec.p_final,
                "ev": dec.p_final * price_tomado - 1.0,
                "stake_u": dec.stake_u,
                "outcome": status_s,
                "settlement": status_s,
                "pnl_u": pnl_u,
                "clv_pct": clv_pct,
                "clv_prob": clv_prob,
                "tier": dec.tier,
                "odds_bucket": dec.odds_bucket,
                "sigma_p": dec.sigma_p,
                "p_shrunk": dec.p_shrunk,
                "adverse_ticks_1h": dec.adverse_ticks_1h,
                "expected_log_growth_g": dec.expected_log_growth_g,
                "version_modelo": model_version,
                "features_hash": "0" * 64,
            }
        )

    max_ev_u = max(event_totals.values(), default=0.0)
    max_ld_u = max(ld_totals.values(), default=0.0)
    max_gd_u = max(gd_totals.values(), default=0.0)
    tol = 1e-9
    n_viol = (
        int(max_pick_u > HARD_MAX_STAKE_PER_PICK_U + tol)
        + sum(1 for v in event_totals.values() if v > HARD_MAX_STAKE_PER_EVENT_U + tol)
        + sum(1 for v in ld_totals.values() if v > HARD_MAX_STAKE_PER_LEAGUE_DATE_U + tol)
        + sum(1 for v in gd_totals.values() if v > HARD_MAX_STAKE_PER_GLOBAL_DATE_U + tol)
    )
    caps_audit = {
        "hard_limits_u": {
            "per_pick": HARD_MAX_STAKE_PER_PICK_U,
            "per_event": HARD_MAX_STAKE_PER_EVENT_U,
            "per_league_date": HARD_MAX_STAKE_PER_LEAGUE_DATE_U,
            "per_global_date": HARD_MAX_STAKE_PER_GLOBAL_DATE_U,
        },
        "observed_max_u": {
            "per_pick": round(max_pick_u, 8),
            "per_event": round(max_ev_u, 8),
            "per_league_date": round(max_ld_u, 8),
            "per_global_date": round(max_gd_u, 8),
        },
        "n_violations": n_viol,
        "all_caps_respected": n_viol == 0,
    }
    return settled, caps_audit


def calibrate_and_evaluate_ola2_picks(
    *,
    blend_artifact_path: str | Path = DEFAULT_BLEND_WEIGHTS_PATH,
    policy_out_path: str | Path = DEFAULT_POLICY_ARTIFACT_PATH,
    ts_policy_out_path: str | Path | None = DEFAULT_TS_POLICY_COPY_PATH,
    backtest_out_path: str | Path = DEFAULT_OLA2_BACKTEST_OUT,
    registry_path: str | Path | None = None,
    bootstrap_samples: int = 1000,
    seed: int = 20261111,
    unlock_holdout: bool = False,
) -> dict[str, Any]:
    """Ejecuta la calibración walk-forward (`unlock_holdout=False`) de `pick_policy_v3_1.json`
    y genera el reporte completo `ola2_picks_backtest_dev.json` usando `services/models/backtest.py`."""
    import backtest as bt

    if unlock_holdout:
        raise bt.HoldoutSealedError(
            "PROHIBIDO ABRIR EL HOLDOUT SELLADO en Ola 2 (`unlock_holdout=False` obligatorio en A5)."
        )
    if int(bootstrap_samples) < 1000:
        raise ValueError("bootstrap_samples debe ser >= 1000.")

    blend_p = Path(blend_artifact_path)
    if not blend_p.exists():
        raise FileNotFoundError(f"No se encontró blend_weights_v3_1.json en: {blend_p}")
    blend_artifact = json.loads(blend_p.read_text(encoding="utf-8"))
    blend_segments: dict[str, dict[str, Any]] = dict(blend_artifact["segments"])

    eff_reg_path = Path(registry_path) if registry_path is not None else bt.DEFAULT_REGISTRY_PATH

    # 1. Cargar cuotas y eventos causales una sola vez (`walk_forward_dev` = 56,649 eventos; holdout 14,163 sellado)
    load_cfg = bt.BacktestConfig(
        phase="ola2_a5_picks_load",
        preset="picks_v3_1_calibration",
        model_version="spacetime_v3.1_geodesic_picks",
        eval_split="walk_forward_dev",
        unlock_holdout=False,
        sports=("football", "nfl"),
        markets=("1x2", "moneyline", "ah", "totals", "spread"),
        bootstrap_samples=int(bootstrap_samples),
        seed=int(seed),
    )
    load_cfg.validate()
    odds_all = bt._load_odds_snapshots(load_cfg)

    base_ev_cfg = bt.BacktestConfig(
        phase="ola2_a5_picks_load",
        preset="picks_v3_1_calibration",
        model_version="spacetime_v3.1_geodesic_picks",
        eval_split="walk_forward_dev",
        unlock_holdout=False,
        sports=("football", "nfl"),
        markets=("1x2", "moneyline"),
        bootstrap_samples=int(bootstrap_samples),
        seed=int(seed),
    )
    raw_events = bt._build_baseline_v3_0_events(base_ev_cfg, odds_all)
    raw_events = raw_events[raw_events["y"].notna()].copy()
    events_checked = bt.verify_events_frame_no_leakage(raw_events)
    dev_df, _sealed_unused, split_meta = bt.split_walk_forward_and_holdout(
        events_checked, holdout_fraction=base_ev_cfg.holdout_fraction
    )
    del _sealed_unused  # Holdout 20% jamás tocado

    holdout_cut_ts = pd.Timestamp(split_meta["holdout_cut_ts"])
    dev_eids = set(dev_df["event_id"].astype(str).unique())
    scoped_dev_odds = odds_all[
        (odds_all["ts_event_start"] < holdout_cut_ts)
        & (odds_all["event_id"].astype(str).isin(dev_eids))
        & (odds_all["book_canon"].isin(_RELEVANT_BACKTEST_BOOKS))
        & (odds_all["market_canon"].isin(["1x2", "moneyline", "ah", "totals", "spread"]))
    ].copy()
    scoped_dev_odds["snapshot_stage"] = scoped_dev_odds["snapshot_stage"].fillna("").astype(str).str.lower()
    odds_by_event_dev = bt._group_odds_records(scoped_dev_odds)

    # 2. Submodelos pre-partido (`sigma_p`) + especificaciones secundarias (`ah`, `totals`)
    submodel_lookup = load_submodel_dispersion_lookup()
    secondary_specs = _build_secondary_market_specs_for_dev(dev_df, scoped_dev_odds, submodel_lookup)
    event_fold_lookup = dict(zip(dev_df["event_id"].astype(str), dev_df["fold_key"].astype(str)))

    # 3. Pre-escaneo único de candidatos en `walk_forward_dev` para ajuste causal de umbrales por celda
    obs_ls = _prescan_dev_candidate_observations(
        dev_df, odds_by_event_dev, blend_segments, submodel_lookup, secondary_specs, line_shopping=True
    )

    # 4. Rejilla estructurada de configuraciones probadas en walk-forward OOF (`< fold_cut_ts`) vía `run_backtest`
    #    Cada configuración probada queda registrada en `holdout_trial_registry.jsonl` con `unlock_holdout=False`.
    has_enabled_blend_segs = any(bool(v.get("model_picks_enabled")) for v in blend_segments.values())
    candidate_grid: list[dict[str, Any]] = [
        {
            "trial_name": "wf_cfg1_model_strict_ls",
            "ev_scale": 1.00,
            "max_sigma_p": 0.060,
            "uncertainty_penalty_k": 0.50,
            "max_adverse_ticks_1h": 3.0,
            "rho_same_event": 0.35,
            "allow_pure_market_arb": not has_enabled_blend_segs,
            "stale_arb_min_sharp_edge": 0.025,
            "line_shopping": True,
        },
        {
            "trial_name": "wf_cfg2_model_conservative_ls",
            "ev_scale": 1.25,
            "max_sigma_p": 0.050,
            "uncertainty_penalty_k": 0.65,
            "max_adverse_ticks_1h": 2.0,
            "rho_same_event": 0.40,
            "allow_pure_market_arb": not has_enabled_blend_segs,
            "stale_arb_min_sharp_edge": 0.030,
            "line_shopping": True,
        },
        {
            "trial_name": "wf_cfg3_hybrid_sharp_arb_ls",
            "ev_scale": 1.10,
            "max_sigma_p": 0.060,
            "uncertainty_penalty_k": 0.50,
            "max_adverse_ticks_1h": 3.0,
            "rho_same_event": 0.35,
            "allow_pure_market_arb": True,
            "stale_arb_min_sharp_edge": 0.028,
            "line_shopping": True,
        },
    ]

    calibration_trials: list[dict[str, Any]] = []
    best_cfg: dict[str, Any] = candidate_grid[0]
    best_objective = -1e9
    best_oof_report: dict[str, Any] | None = None

    for idx_t, cand_cfg in enumerate(candidate_grid):
        active_obs = obs_ls
        base_pol_cand = _calibrate_policy_from_observations(
            active_obs,
            blend_segments,
            ev_scale=cand_cfg["ev_scale"],
            max_sigma_p=cand_cfg["max_sigma_p"],
            uncertainty_penalty_k=cand_cfg["uncertainty_penalty_k"],
            max_adverse_ticks_1h=cand_cfg["max_adverse_ticks_1h"],
            rho_same_event=cand_cfg["rho_same_event"],
            allow_pure_market_arb=cand_cfg["allow_pure_market_arb"],
            stale_arb_min_sharp_edge=cand_cfg["stale_arb_min_sharp_edge"],
            n_bootstrap=int(bootstrap_samples),
            seed=int(seed + idx_t * 17),
        )
        fold_pols = _build_fold_causal_policies(
            active_obs,
            dev_df,
            blend_segments,
            ev_scale=cand_cfg["ev_scale"],
            max_sigma_p=cand_cfg["max_sigma_p"],
            uncertainty_penalty_k=cand_cfg["uncertainty_penalty_k"],
            max_adverse_ticks_1h=cand_cfg["max_adverse_ticks_1h"],
            rho_same_event=cand_cfg["rho_same_event"],
            allow_pure_market_arb=cand_cfg["allow_pure_market_arb"],
            stale_arb_min_sharp_edge=cand_cfg["stale_arb_min_sharp_edge"],
            n_bootstrap=int(bootstrap_samples),
            seed=int(seed + idx_t * 17),
        )
        sel_oof = StatefulBacktestPolicySelector(
            base_pol_cand,
            blend_segments,
            submodel_lookup,
            odds_by_event_dev,
            secondary_specs_by_event=secondary_specs,
            fold_causal_policies=fold_pols,
            event_fold_lookup=event_fold_lookup,
            allow_stale_sharp_arb=cand_cfg["allow_pure_market_arb"],
            stale_arb_min_sharp_edge=cand_cfg["stale_arb_min_sharp_edge"],
        )
        bt_cfg_trial = bt.BacktestConfig(
            phase=f"ola2_a5_calibration_{cand_cfg['trial_name']}",
            preset="pick_policy_v3_1_wf_search",
            model_version="spacetime_v3.1_geodesic_picks",
            eval_split="walk_forward_dev",
            unlock_holdout=False,
            sports=("football", "nfl"),
            markets=("1x2", "moneyline"),
            line_shopping=bool(cand_cfg["line_shopping"]),
            execution_delay_minutes=2.0,
            historical_delay_alpha=0.05,
            bootstrap_samples=int(bootstrap_samples),
            seed=int(seed + idx_t),
            registry_path=eff_reg_path,
            events_df=events_checked,
            odds_df=scoped_dev_odds,
            pick_selector_fn=sel_oof,
            extra_config_tag=cand_cfg,
        )
        rep_t = bt.run_backtest(bt_cfg_trial)

        n_pk = int(rep_t["n_picks"])
        clv_m = float(rep_t["clv_pct_mean"]) if rep_t["clv_pct_mean"] is not None else -1.0
        clv_lo = float(rep_t["clv_pct_ci95"][0]) if rep_t["clv_pct_ci95"] is not None else -1.0
        roi_m = float(rep_t["roi_pct"]) if rep_t["roi_pct"] is not None else -1.0
        mdd_u = float(rep_t["max_drawdown_u"]) if rep_t["max_drawdown_u"] is not None else 999.0

        # Criterio causal primario: cota inferior IC95% de CLV% + media CLV% (exigiendo volumen >= 50 picks)
        if n_pk >= 50:
            obj_score = (0.65 * clv_lo) + (0.35 * clv_m) - (0.0002 * max(0.0, mdd_u - 25.0))
        elif n_pk > 0:
            obj_score = -0.50 + 0.001 * n_pk + clv_m
        else:
            obj_score = -1.0

        calibration_trials.append(
            {
                "trial_name": cand_cfg["trial_name"],
                "trial_seq": rep_t["holdout_audit"]["trial_seq"],
                "config_hash": rep_t["config_hash"],
                "params": cand_cfg,
                "n_picks_oof": n_pk,
                "clv_pct_mean_oof": rep_t["clv_pct_mean"],
                "clv_pct_ci95_oof": rep_t["clv_pct_ci95"],
                "clv_prob_mean_oof": rep_t["clv_prob_mean"],
                "roi_pct_oof": rep_t["roi_pct"],
                "roi_pct_ci95_oof": rep_t["roi_pct_ci95"],
                "max_drawdown_u_oof": rep_t["max_drawdown_u"],
                "objective_score": round(obj_score, 8),
            }
        )
        if obj_score > best_objective:
            best_objective = obj_score
            best_cfg = cand_cfg
            best_oof_report = rep_t

    # 5. Congelar `pick_policy_v3_1.json` sobre `walk_forward_dev` completo con `best_cfg`
    best_obs = obs_ls
    frozen_policy = _calibrate_policy_from_observations(
        best_obs,
        blend_segments,
        ev_scale=best_cfg["ev_scale"],
        max_sigma_p=best_cfg["max_sigma_p"],
        uncertainty_penalty_k=best_cfg["uncertainty_penalty_k"],
        max_adverse_ticks_1h=best_cfg["max_adverse_ticks_1h"],
        rho_same_event=best_cfg["rho_same_event"],
        allow_pure_market_arb=best_cfg["allow_pure_market_arb"],
        stale_arb_min_sharp_edge=best_cfg["stale_arb_min_sharp_edge"],
        n_bootstrap=int(bootstrap_samples),
        seed=int(seed),
    )
    frozen_policy = {
        "schema_version": frozen_policy["schema_version"],
        "policy_version": frozen_policy["policy_version"],
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "reproduction_command": (
            "research/prediction-lab/.venv/Scripts/python.exe services/models/picks_engine.json_cli "
        ).replace(
            ".json_cli ",
            (
                "services/models/picks_engine.py "
                "--blend services/models/artifacts/blend_weights_v3_1.json "
                "--policy-out services/models/artifacts/pick_policy_v3_1.json "
                "--ts-policy-out src/data/prediction/pick_policy_v3_1.json "
                "--backtest-out services/models/artifacts/ola2_picks_backtest_dev.json"
            ),
        ),
        "blend_weights_source": "services/models/artifacts/blend_weights_v3_1.json",
        "blend_schema_version": blend_artifact.get("schema_version"),
        "holdout_sealed_untouched": True,
        "selected_walk_forward_trial": best_cfg["trial_name"],
        "line_shopping_enabled": bool(best_cfg["line_shopping"]),
        **{k: v for k, v in frozen_policy.items() if k not in ("schema_version", "policy_version")},
    }
    # Corregir reproducción limpia
    frozen_policy["reproduction_command"] = (
        "research/prediction-lab/.venv/Scripts/python.exe services/models/picks_engine.py "
        "--blend services/models/artifacts/blend_weights_v3_1.json "
        "--policy-out services/models/artifacts/pick_policy_v3_1.json "
        "--ts-policy-out src/data/prediction/pick_policy_v3_1.json "
        "--backtest-out services/models/artifacts/ola2_picks_backtest_dev.json"
    )
    validate_pick_policy(frozen_policy)

    # 6. Evaluación completa en `walk_forward_dev` con sensibilidad `alpha = 0.05` (primario), `0.00` y `0.10`
    alpha_reports: dict[str, dict[str, Any]] = {}
    primary_selector: StatefulBacktestPolicySelector | None = None

    for alpha_val, alpha_key in ((0.05, "0.05"), (0.00, "0.00"), (0.10, "0.10")):
        sel_eval = StatefulBacktestPolicySelector(
            frozen_policy,
            blend_segments,
            submodel_lookup,
            odds_by_event_dev,
            secondary_specs_by_event=secondary_specs,
            allow_stale_sharp_arb=bool(frozen_policy["allow_pure_market_arb"]),
            stale_arb_min_sharp_edge=float(frozen_policy["stale_arb_min_sharp_edge"]),
        )
        phase_lbl = (
            "ola2_puerta2_picks_v3_1"
            if alpha_key == "0.05"
            else f"ola2_puerta2_picks_v3_1_sensitivity_alpha_{alpha_key}"
        )
        bt_eval_cfg = bt.BacktestConfig(
            phase=phase_lbl,
            preset="pick_policy_v3_1",
            model_version="spacetime_v3.1_geodesic_picks",
            eval_split="walk_forward_dev",
            unlock_holdout=False,
            sports=("football", "nfl"),
            markets=("1x2", "moneyline"),
            line_shopping=bool(best_cfg["line_shopping"]),
            execution_delay_minutes=2.0,
            historical_delay_alpha=alpha_val,
            bootstrap_samples=int(bootstrap_samples),
            seed=int(seed),
            registry_path=eff_reg_path,
            events_df=events_checked,
            odds_df=scoped_dev_odds,
            pick_selector_fn=sel_eval,
            extra_config_tag={"policy_version": frozen_policy["policy_version"], "alpha": alpha_val},
        )
        alpha_reports[alpha_key] = bt.run_backtest(bt_eval_cfg)
        if alpha_key == "0.05":
            primary_selector = sel_eval

    assert primary_selector is not None
    primary_rep = alpha_reports["0.05"]

    # 7. Desgloses con IC 95% bootstrap (`>= 1000` remuestreos) por `tier`, `odds_bucket` y auditoría de 4 topes duros
    settled_picks, portfolio_caps_audit = _reconstruct_settled_picks_with_audit(
        primary_selector.selected_decisions_log,
        dev_df,
        odds_by_event_dev,
        phase="ola2_puerta2_picks_v3_1",
        model_version="spacetime_v3.1_geodesic_picks",
        execution_delay_minutes=2.0,
        historical_delay_alpha=0.05,
    )
    if len(settled_picks) != int(primary_rep["n_picks"]):
        raise RuntimeError(
            f"Inconsistencia en conteo de picks reconstruidos ({len(settled_picks)}) vs run_backtest ({primary_rep['n_picks']})."
        )
    if not portfolio_caps_audit["all_caps_respected"]:
        raise RuntimeError(f"Violación de topes duros de portafolio detectada: {portfolio_caps_audit}")

    by_tier_summary: dict[str, Any] = {}
    for idx_tr, tier_name in enumerate(PICK_TIERS):
        t_picks = [p for p in settled_picks if p["tier"] == tier_name]
        by_tier_summary[tier_name] = bt.compute_picks_summary_bootstrap(
            t_picks, n_boot=int(bootstrap_samples), seed=int(seed + 1301 + idx_tr)
        )

    by_bucket_summary: dict[str, Any] = {}
    for idx_bk, bk_name in enumerate(ODDS_BUCKETS):
        b_picks = [p for p in settled_picks if p["odds_bucket"] == bk_name]
        by_bucket_summary[bk_name] = bt.compute_picks_summary_bootstrap(
            b_picks, n_boot=int(bootstrap_samples), seed=int(seed + 1709 + idx_bk)
        )

    # Comparativa contra `baseline_v3_0_backtest.json` si existe
    baseline_comp: dict[str, Any] | None = None
    base_v3_path = ARTIFACTS_DIR / "baseline_v3_0_backtest.json"
    if base_v3_path.exists():
        b3 = json.loads(base_v3_path.read_text(encoding="utf-8"))
        baseline_comp = {
            "baseline_n_picks": b3.get("n_picks"),
            "ola2_n_picks": primary_rep["n_picks"],
            "baseline_clv_pct_mean": b3.get("clv_pct_mean"),
            "ola2_clv_pct_mean": primary_rep["clv_pct_mean"],
            "delta_clv_pct_mean": (
                (float(primary_rep["clv_pct_mean"]) - float(b3["clv_pct_mean"]))
                if (primary_rep["clv_pct_mean"] is not None and b3.get("clv_pct_mean") is not None)
                else None
            ),
            "baseline_roi_pct": b3.get("roi_pct"),
            "ola2_roi_pct": primary_rep["roi_pct"],
            "baseline_max_drawdown_u": b3.get("max_drawdown_u"),
            "ola2_max_drawdown_u": primary_rep["max_drawdown_u"],
        }

    ola2_report: dict[str, Any] = {
        **primary_rep,
        "schema_version": "ola2_a5_picks_backtest_v3.1.0",
        "reproduction_command": frozen_policy["reproduction_command"],
        "holdout_sealed_untouched": True,
        "policy_version": frozen_policy["policy_version"],
        "selected_walk_forward_trial": best_cfg["trial_name"],
        "legacy_tiro_cuota_alta_eliminated": True,
        "raw_hit_rate_used_for_approval": False,
        "portfolio_caps_audit": portfolio_caps_audit,
        "decision_funnel": {
            "total_candidates_evaluated": primary_selector.total_candidates_evaluated,
            "total_approved_at_decision": len(primary_selector.selected_decisions_log),
            "total_filled_after_delay": len(settled_picks),
            "rejection_reasons_count": dict(sorted(primary_selector.rejection_counts.items())),
        },
        "betting_by_tier": by_tier_summary,
        "betting_by_odds_bucket": by_bucket_summary,
        "causal_oof_verification": {
            "description": (
                "Evaluación estrictamente fuera de pliegue (< fold_cut_ts) donde tanto umbrales EV como "
                "segment_clv_ci95_low se aprenden solo de pliegues pasados."
            ),
            "trial_name": best_cfg["trial_name"],
            "n_picks": best_oof_report["n_picks"] if best_oof_report else 0,
            "clv_pct_mean": best_oof_report["clv_pct_mean"] if best_oof_report else None,
            "clv_pct_ci95": best_oof_report["clv_pct_ci95"] if best_oof_report else None,
            "clv_prob_mean": best_oof_report["clv_prob_mean"] if best_oof_report else None,
            "clv_prob_ci95": best_oof_report["clv_prob_ci95"] if best_oof_report else None,
            "roi_pct": best_oof_report["roi_pct"] if best_oof_report else None,
            "roi_pct_ci95": best_oof_report["roi_pct_ci95"] if best_oof_report else None,
            "max_drawdown_u": best_oof_report["max_drawdown_u"] if best_oof_report else None,
        },
        "historical_delay_alpha_sensitivity": {
            ak: {
                "historical_delay_alpha": float(ak),
                "trial_seq": ar["holdout_audit"]["trial_seq"],
                "config_hash": ar["config_hash"],
                "n_picks": ar["n_picks"],
                "roi_pct": ar["roi_pct"],
                "roi_pct_ci95": ar["roi_pct_ci95"],
                "roi_significance": ar["roi_significance"],
                "clv_pct_mean": ar["clv_pct_mean"],
                "clv_pct_ci95": ar["clv_pct_ci95"],
                "clv_pct_significance": ar["clv_pct_significance"],
                "clv_prob_mean": ar["clv_prob_mean"],
                "clv_prob_ci95": ar["clv_prob_ci95"],
                "pct_picks_clv_positive": ar["pct_picks_clv_positive"],
                "max_drawdown_u": ar["max_drawdown_u"],
            }
            for ak, ar in alpha_reports.items()
        },
        "comparison_vs_baseline_v3_0": baseline_comp,
        "calibration_trials_walk_forward_dev": calibration_trials,
    }

    pol_p = Path(policy_out_path)
    pol_p.parent.mkdir(parents=True, exist_ok=True)
    pol_p.write_text(json.dumps(frozen_policy, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    if ts_policy_out_path is not None:
        ts_p = Path(ts_policy_out_path)
        ts_p.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(pol_p, ts_p)

    bt_p = Path(backtest_out_path)
    bt_p.parent.mkdir(parents=True, exist_ok=True)
    bt_p.write_text(json.dumps(ola2_report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    return ola2_report


def _parse_cli_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Calibración walk-forward A5 (pick_policy_v3_1.json + ola2_picks_backtest_dev.json)."
    )
    parser.add_argument("--blend", type=Path, default=DEFAULT_BLEND_WEIGHTS_PATH)
    parser.add_argument("--policy-out", type=Path, default=DEFAULT_POLICY_ARTIFACT_PATH)
    parser.add_argument("--ts-policy-out", type=Path, default=DEFAULT_TS_POLICY_COPY_PATH)
    parser.add_argument("--backtest-out", type=Path, default=DEFAULT_OLA2_BACKTEST_OUT)
    parser.add_argument("--registry-path", type=Path, default=None)
    parser.add_argument("--bootstrap-samples", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=20261111)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_cli_args(argv)
    rep = calibrate_and_evaluate_ola2_picks(
        blend_artifact_path=args.blend,
        policy_out_path=args.policy_out,
        ts_policy_out_path=args.ts_policy_out,
        backtest_out_path=args.backtest_out,
        registry_path=args.registry_path,
        bootstrap_samples=args.bootstrap_samples,
        seed=args.seed,
        unlock_holdout=False,
    )
    print(
        f"[A5 picks_engine] OK — trial={rep['selected_walk_forward_trial']}, "
        f"n_picks={rep['n_picks']}, CLV%={rep['clv_pct_mean']}, "
        f"CLV%_CI95={rep['clv_pct_ci95']}, ROI%={rep['roi_pct']}, "
        f"caps_ok={rep['portfolio_caps_audit']['all_caps_respected']}, "
        f"holdout_untouched={rep['holdout_sealed_untouched']}"
    )
    return 0


__all__ = [
    "ODDS_BUCKETS",
    "PICK_TIERS",
    "PICK_REJECTION_REASONS",
    "HARD_MAX_STAKE_PER_PICK_U",
    "HARD_MAX_STAKE_PER_EVENT_U",
    "HARD_MAX_STAKE_PER_LEAGUE_DATE_U",
    "HARD_MAX_STAKE_PER_GLOBAL_DATE_U",
    "PickPolicyValidationError",
    "PickCausalityError",
    "PickDecisionResult",
    "StatefulBacktestPolicySelector",
    "canonical_pick_market",
    "canonical_pick_selection",
    "canonical_pick_book",
    "normalize_pick_line",
    "build_segment_key",
    "parse_iso_utc_micros",
    "format_utc_date_from_micros",
    "resolve_candidate_utc_date",
    "classify_odds_bucket",
    "compute_submodel_dispersion",
    "compute_adverse_sharp_ticks_1h",
    "compute_shrunk_quarter_kelly",
    "validate_pick_policy",
    "evaluate_pick_candidates",
    "evaluatePickCandidates",
    "select_approved_picks",
    "to_ledger_pick_input",
    "blend_probs_logit_simplex",
    "devig_prices_by_method",
    "load_submodel_dispersion_lookup",
    "calibrate_and_evaluate_ola2_picks",
]


if __name__ == "__main__":
    raise SystemExit(main())
