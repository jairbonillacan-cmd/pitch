"""A28 (Ola 1 · Agente A2) — Ledger inmutable (JSONL espejo) + Tracker de CLV y Bootstrap.

Expone funciones puras importables por `a3-backtest` (`services/models/backtest.py`) y futuros
agentes (`A4`–`A8`), además de CLI ejecutable:

  - `compute_clv_metrics`: cálculo exacto por pick de `clv_pct`, `clv_prob` y `pnl_u`
  - `summarize_picks_bootstrap`: IC 95% bootstrap (`>= 1000` remuestreos por defecto) con PRNG
    determinista `mulberry32`, significancia estadística, `% picks CLV > 0`, `ROI` y `max_drawdown_u`
    desglosado globalmente y por `league`, `market`, `tier`, `book` y `league::market`
  - `generate_clv_markdown_report`: renderizador Markdown de tablas de auditoría CLV/PnL
  - Espejo criptográfico SHA-256 bit a bit con `src/domain/prediction/ledger.ts` y `clv.ts`

Uso CLI:
  python services/models/clv_report.py --ledger <picks.jsonl> --closings <odds_snapshots.parquet|closings.json> --out <report.json|report.md>
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
from typing import Any, Mapping, Sequence

import numpy as np
import pandas as pd

GENESIS_HASH: str = "0" * 64
VALID_PICK_TIERS: tuple[str, ...] = ("solido", "valor")
LEGACY_PICK_TIERS: tuple[str, ...] = ("baseline_v3_0", "especulativo")
HISTORICAL_PICK_TIERS: tuple[str, ...] = VALID_PICK_TIERS + LEGACY_PICK_TIERS
ALLOWED_SHARP_CLOSING_BOOKS: tuple[str, ...] = ("pinnacle", "smarkets")
SETTLEMENT_OUTCOMES: tuple[str, ...] = ("win", "loss", "push", "void", "half_win", "half_loss")

MIN_BOOTSTRAP_RESAMPLES: int = 1000
DEFAULT_BOOTSTRAP_RESAMPLES: int = 1000
DEFAULT_BOOTSTRAP_SEED: int = 42
DEFAULT_BOOTSTRAP_CI_LEVEL: float = 0.95

_VALID_TIER_SET = frozenset(VALID_PICK_TIERS)
_HISTORICAL_TIER_SET = frozenset(HISTORICAL_PICK_TIERS)
_SHARP_BOOK_SET = frozenset(ALLOWED_SHARP_CLOSING_BOOKS)
_SETTLEMENT_OUTCOME_SET = frozenset(SETTLEMENT_OUTCOMES)


class LedgerValidationError(ValueError):
    """Error de validación de campos, rangos finitos o reglas del ledger inmutable."""

    def __init__(self, message: str, code: str = "ledger_validation_error") -> None:
        super().__init__(message)
        self.code = code


class DuplicatePickError(LedgerValidationError):
    """Error lanzado al intentar insertar un `pick_id` duplicado en el ledger append-only."""

    def __init__(self, pick_id: str) -> None:
        super().__init__(
            f'pick_id duplicado rechazado por el ledger inmutable: "{pick_id}"',
            code="duplicate_pick_id",
        )


class LedgerIntegrityError(RuntimeError):
    """Error lanzado cuando la cadena SHA-256 (`prev_hash -> entry_hash`) fue alterada."""

    code = "ledger_integrity_error"


# ---------------------------------------------------------------------------
# Modelos de datos inmutables (`frozen=True`) espejo de `ledger.ts`
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PickLedgerEntry:
    record_type: str
    pick_id: str
    ts_emitido: str
    event_id: str
    sport: str
    league: str
    market: str
    line: float | None
    selection: str
    book: str
    price_tomado: float
    p_modelo: float
    p_mercado: float
    p_final: float
    ev: float
    stake_u: float
    tier: str
    version_modelo: str
    features_hash: str
    prev_hash: str
    entry_hash: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class PickClosingRecord:
    record_type: str
    pick_id: str
    ts_recorded: str
    closing_missing: bool
    closing_book: str | None
    closing_source: str | None
    ts_closing_captured: str | None
    price_cierre_bruto: float | None
    price_cierre_sin_margen: float | None
    p_cierre_sin_margen: float | None
    prev_hash: str
    entry_hash: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class PickSettlementRecord:
    record_type: str
    pick_id: str
    ts_liquidado: str
    outcome: str
    pnl_u: float
    prev_hash: str
    entry_hash: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


LedgerRecord = PickLedgerEntry | PickClosingRecord | PickSettlementRecord


# ---------------------------------------------------------------------------
# Primitivas criptográficas y numéricas canónicas (paridad bit a bit con TS)
# ---------------------------------------------------------------------------


def sha256_hex(text: str) -> str:
    """Digest SHA-256 hexadecimal en minúsculas (64 caracteres) sobre UTF-8."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def float64_to_canonical_hex(value: float) -> str:
    """Codifica un flotante IEEE-754 finito como 16 hex big-endian (normalizando `-0.0` a `+0.0`)."""
    if isinstance(value, bool) or not isinstance(value, (int, float, np.floating, np.integer)):
        raise LedgerValidationError(f"se esperaba número finito para hash canónico; recibido {value!r}")
    fval = float(value)
    if not math.isfinite(fval):
        raise LedgerValidationError(f"se esperaba número finito para hash canónico; recibido {value!r}")
    normalized = 0.0 if fval == 0.0 else fval
    return struct.pack(">d", normalized).hex()


def _canonicalize_for_features_hash(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, np.floating, np.integer)):
        fval = float(value)
        if not math.isfinite(fval):
            return "NaN_or_Inf"
        return float64_to_canonical_hex(fval)
    if isinstance(value, (list, tuple, np.ndarray)):
        return [_canonicalize_for_features_hash(item) for item in value]
    if isinstance(value, Mapping):
        return [
            [str(k), _canonicalize_for_features_hash(value[k])]
            for k in sorted(value.keys(), key=lambda x: str(x))
        ]
    return str(value)


def compute_features_hash(features: Any) -> str:
    """Calcula `features_hash` SHA-256 idéntico a `computeFeaturesHash` en TypeScript."""
    canonical_json = json.dumps(
        _canonicalize_for_features_hash(features),
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return sha256_hex(canonical_json)


def compute_entry_hash(record: Mapping[str, Any] | LedgerRecord) -> str:
    """Calcula `entry_hash` SHA-256 encadenado idéntico a `computeLedgerEntryHash` en TypeScript."""
    data = record.to_dict() if hasattr(record, "to_dict") else dict(record)  # type: ignore[union-attr]
    rec_type = data.get("record_type", "pick")

    if rec_type == "pick":
        line_val = data.get("line")
        canonical_tuple: list[Any] = [
            "pick",
            data["prev_hash"],
            data["pick_id"],
            data["ts_emitido"],
            data["event_id"],
            data["sport"],
            data["league"],
            data["market"],
            None if line_val is None else float64_to_canonical_hex(float(line_val)),
            data["selection"],
            data["book"],
            float64_to_canonical_hex(float(data["price_tomado"])),
            float64_to_canonical_hex(float(data["p_modelo"])),
            float64_to_canonical_hex(float(data["p_mercado"])),
            float64_to_canonical_hex(float(data["p_final"])),
            float64_to_canonical_hex(float(data["ev"])),
            float64_to_canonical_hex(float(data["stake_u"])),
            data["tier"],
            data["version_modelo"],
            data["features_hash"],
        ]
    elif rec_type == "closing":
        p_bruto = data.get("price_cierre_bruto")
        p_novig = data.get("price_cierre_sin_margen")
        prob_novig = data.get("p_cierre_sin_margen")
        canonical_tuple = [
            "closing",
            data["prev_hash"],
            data["pick_id"],
            data["ts_recorded"],
            bool(data["closing_missing"]),
            data.get("closing_book"),
            data.get("closing_source"),
            data.get("ts_closing_captured"),
            None if p_bruto is None else float64_to_canonical_hex(float(p_bruto)),
            None if p_novig is None else float64_to_canonical_hex(float(p_novig)),
            None if prob_novig is None else float64_to_canonical_hex(float(prob_novig)),
        ]
    elif rec_type == "settlement":
        canonical_tuple = [
            "settlement",
            data["prev_hash"],
            data["pick_id"],
            data["ts_liquidado"],
            data["outcome"],
            float64_to_canonical_hex(float(data["pnl_u"])),
        ]
    else:
        raise LedgerValidationError(f"record_type inválido al calcular entry_hash: {rec_type!r}")

    payload = json.dumps(canonical_tuple, ensure_ascii=False, separators=(",", ":"))
    return sha256_hex(payload)


# ---------------------------------------------------------------------------
# Validaciones de negocio, casas sharp y liquidación exacta de PnL
# ---------------------------------------------------------------------------


def is_valid_sharp_closing_book(book: str | None, source: str | None = None) -> bool:
    """Verifica que la casa de cierre sea sharp válida (jamás recreativa ni `bfe` en histórico)."""
    if book is None:
        return False
    norm_book = str(book).strip().lower()
    if norm_book not in _SHARP_BOOK_SET:
        return False
    norm_source = str(source).strip().lower() if source is not None else ""
    if norm_source == "historical_fd":
        return norm_book == "pinnacle"
    return True


def settle_pick_pnl(stake_u: float, price_tomado: float, outcome: str) -> float:
    """Liquidación exacta de PnL en unidades (`pnl_u`), incluyendo `void`/`push` y medias líneas asiáticas."""
    if isinstance(stake_u, bool) or not math.isfinite(float(stake_u)) or float(stake_u) <= 0.0:
        raise LedgerValidationError(f"stake_u inválido en liquidación: {stake_u!r}")
    if isinstance(price_tomado, bool) or not math.isfinite(float(price_tomado)) or float(price_tomado) < 1.01:
        raise LedgerValidationError(f"price_tomado inválido en liquidación: {price_tomado!r}")

    out_norm = str(outcome).strip().lower()
    if out_norm not in _SETTLEMENT_OUTCOME_SET:
        raise LedgerValidationError(f"outcome de liquidación desconocido: {outcome!r}")

    s_val = float(stake_u)
    p_val = float(price_tomado)
    if out_norm == "win":
        return s_val * (p_val - 1.0)
    if out_norm == "loss":
        return -s_val
    if out_norm in ("push", "void"):
        return 0.0
    if out_norm == "half_win":
        return 0.5 * s_val * (p_val - 1.0)
    if out_norm == "half_loss":
        return -0.5 * s_val
    raise LedgerValidationError(f"outcome no soportado: {outcome!r}")


def _grade_asian_diff(diff: float) -> str:
    if diff > 0.25 + 1e-9:
        return "win"
    if abs(diff - 0.25) <= 1e-9:
        return "half_win"
    if abs(diff) <= 1e-9:
        return "void"
    if abs(diff + 0.25) <= 1e-9:
        return "half_loss"
    return "loss"


def grade_market_outcome(
    market: str,
    selection: str,
    home_score: float,
    away_score: float,
    line: float | None = None,
) -> str:
    """Califica `win`, `loss`, `void`, `half_win`, `half_loss` para 1X2, 2-way/DNB/ML, AH/Spread, OU/Totals y BTTS."""
    if not math.isfinite(float(home_score)) or not math.isfinite(float(away_score)):
        raise LedgerValidationError("home_score y away_score deben ser números finitos")

    hs = float(home_score)
    as_ = float(away_score)
    mkt = str(market).strip().lower()
    sel = str(selection).strip().lower()

    if mkt in ("1x2", "h2h", "match_odds"):
        if sel in ("home", "1", "h"):
            return "win" if hs > as_ else "loss"
        if sel in ("draw", "x", "d", "tie"):
            return "win" if hs == as_ else "loss"
        if sel in ("away", "2", "a"):
            return "win" if as_ > hs else "loss"
        raise LedgerValidationError(f'selección 1X2 desconocida: "{selection}"')

    if mkt in ("dnb", "draw_no_bet", "moneyline", "ml", "2way"):
        if hs == as_:
            return "void"
        if sel in ("home", "1", "h"):
            return "win" if hs > as_ else "loss"
        if sel in ("away", "2", "a"):
            return "win" if as_ > hs else "loss"
        raise LedgerValidationError(f'selección 2-way desconocida: "{selection}"')

    if mkt in ("ah", "asian_handicap", "spread", "handicap"):
        if line is None or not math.isfinite(float(line)):
            raise LedgerValidationError(f'el mercado "{market}" requiere una línea numérica finita')
        ln = float(line)
        if sel in ("home", "1", "h"):
            return _grade_asian_diff(hs - as_ + ln)
        if sel in ("away", "2", "a"):
            return _grade_asian_diff(as_ - hs + ln)
        raise LedgerValidationError(f'selección de hándicap desconocida: "{selection}"')

    if mkt in ("ou", "totals", "total", "over_under"):
        if line is None or not math.isfinite(float(line)):
            raise LedgerValidationError(f'el mercado "{market}" requiere una línea numérica finita')
        ln = float(line)
        tot = hs + as_
        if sel in ("over", "o"):
            return _grade_asian_diff(tot - ln)
        if sel in ("under", "u"):
            return _grade_asian_diff(ln - tot)
        raise LedgerValidationError(f'selección de totales desconocida: "{selection}"')

    if mkt in ("btts", "both_teams_to_score"):
        both = hs > 0.0 and as_ > 0.0
        if sel in ("yes", "si", "y"):
            return "win" if both else "loss"
        if sel in ("no", "n"):
            return "win" if not both else "loss"
        raise LedgerValidationError(f'selección BTTS desconocida: "{selection}"')

    raise LedgerValidationError(f'mercado deportivo no soportado en grade_market_outcome: "{market}"')


def _require_non_empty_str(value: Any, field_name: str) -> str:
    if not isinstance(value, str):
        raise LedgerValidationError(f'el campo "{field_name}" debe ser str')
    trimmed = value.strip()
    if not trimmed:
        raise LedgerValidationError(f'el campo "{field_name}" no puede estar vacío')
    return trimmed


def _parse_iso_to_epoch(ts: str, field_name: str = "timestamp") -> float:
    s = _require_non_empty_str(ts, field_name)
    norm = s[:-1] + "+00:00" if s.endswith(("Z", "z")) else s
    try:
        dt = datetime.fromisoformat(norm)
    except ValueError as exc:
        raise LedgerValidationError(f'timestamp ISO inválido en "{field_name}": "{s}"') from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


def _require_iso_timestamp(value: Any, field_name: str) -> str:
    s = _require_non_empty_str(value, field_name)
    _parse_iso_to_epoch(s, field_name)
    return s


def _require_finite_prob_open01(value: Any, field_name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float, np.floating, np.integer)):
        raise LedgerValidationError(f'el campo "{field_name}" debe ser numérico en (0, 1)')
    fval = float(value)
    if not math.isfinite(fval) or fval <= 0.0 or fval >= 1.0:
        raise LedgerValidationError(
            f'el campo "{field_name}" debe cumplir 0 < {field_name} < 1 finito; recibido {value!r}'
        )
    return fval


def _require_sha256_hex64(value: Any, field_name: str) -> str:
    if not isinstance(value, str) or len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
        raise LedgerIntegrityError(
            f'hash SHA-256 inválido en "{field_name}": se esperaban 64 caracteres hex en minúsculas'
        )
    return value


def _is_nullish(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    if isinstance(value, np.floating) and np.isnan(value):
        return True
    return False


# ---------------------------------------------------------------------------
# Ledger Append-Only en Python y serialización/verificación JSONL
# ---------------------------------------------------------------------------


def verify_ledger_integrity(records: Sequence[Mapping[str, Any] | LedgerRecord]) -> bool:
    """Verifica la cadena SHA-256 completa, unicidad de `pick_id` y consistencia de cierres/PnL."""
    expected_prev = GENESIS_HASH
    seen_picks: dict[str, Mapping[str, Any]] = {}
    seen_closings: set[str] = set()
    seen_settlements: set[str] = set()

    for idx, raw_rec in enumerate(records):
        rec = raw_rec.to_dict() if hasattr(raw_rec, "to_dict") else dict(raw_rec)  # type: ignore[union-attr]
        prev_hash = _require_sha256_hex64(rec.get("prev_hash"), f"records[{idx}].prev_hash")
        entry_hash = _require_sha256_hex64(rec.get("entry_hash"), f"records[{idx}].entry_hash")

        if prev_hash != expected_prev:
            raise LedgerIntegrityError(
                f"cadena rota en posición {idx}: prev_hash={prev_hash} != esperado={expected_prev}"
            )

        recomputed = compute_entry_hash(rec)
        if recomputed != entry_hash:
            raise LedgerIntegrityError(
                f'entry_hash alterado en posición {idx} (pick_id="{rec.get("pick_id")}"): '
                f"esperado={recomputed}, encontrado={entry_hash}"
            )

        rec_type = rec.get("record_type", "pick")
        pick_id = str(rec.get("pick_id", ""))
        if rec_type == "pick":
            if rec.get("tier") not in _HISTORICAL_TIER_SET:
                raise LedgerIntegrityError(
                    f'tier inválido detectado en cadena en posición {idx}: "{rec.get("tier")}"'
                )
            if pick_id in seen_picks:
                raise LedgerIntegrityError(f'pick_id duplicado en posición {idx}: "{pick_id}"')
            seen_picks[pick_id] = rec
        elif rec_type == "closing":
            if pick_id not in seen_picks:
                raise LedgerIntegrityError(f'cierre huérfano en posición {idx}: "{pick_id}"')
            if pick_id in seen_closings:
                raise LedgerIntegrityError(f'cierre duplicado en posición {idx}: "{pick_id}"')
            seen_closings.add(pick_id)
        elif rec_type == "settlement":
            parent = seen_picks.get(pick_id)
            if parent is None:
                raise LedgerIntegrityError(f'liquidación huérfana en posición {idx}: "{pick_id}"')
            if pick_id in seen_settlements:
                raise LedgerIntegrityError(f'liquidación duplicada en posición {idx}: "{pick_id}"')
            expected_pnl = settle_pick_pnl(
                float(parent["stake_u"]),
                float(parent["price_tomado"]),
                str(rec["outcome"]),
            )
            if abs(float(rec["pnl_u"]) - expected_pnl) > 1e-12:
                raise LedgerIntegrityError(
                    f'pnl_u inconsistente en posición {idx} (pick_id="{pick_id}"): '
                    f"esperado={expected_pnl}, encontrado={rec['pnl_u']}"
                )
            seen_settlements.add(pick_id)
        else:
            raise LedgerIntegrityError(f"record_type desconocido en posición {idx}: {rec_type!r}")

        expected_prev = entry_hash

    return True


class PickLedger:
    """Ledger estrictamente append-only en memoria con espejo exacto a `src/domain/prediction/ledger.ts`."""

    def __init__(self) -> None:
        self._records: list[LedgerRecord] = []
        self._picks: list[PickLedgerEntry] = []
        self._picks_by_id: dict[str, PickLedgerEntry] = {}
        self._closings_by_id: dict[str, PickClosingRecord] = {}
        self._settlements_by_id: dict[str, PickSettlementRecord] = {}
        self._head_hash: str = GENESIS_HASH

    @property
    def head_hash(self) -> str:
        return self._head_hash

    @property
    def size(self) -> int:
        return len(self._picks)

    @property
    def record_count(self) -> int:
        return len(self._records)

    def append_pick(
        self,
        data: Mapping[str, Any],
        *,
        allow_legacy_tiers: bool = False,
    ) -> PickLedgerEntry:
        pick_id = _require_non_empty_str(data.get("pick_id"), "pick_id")
        if pick_id in self._picks_by_id:
            raise DuplicatePickError(pick_id)

        ts_emitido = _require_iso_timestamp(data.get("ts_emitido"), "ts_emitido")
        event_id = _require_non_empty_str(data.get("event_id"), "event_id")
        sport = _require_non_empty_str(data.get("sport"), "sport")
        league = _require_non_empty_str(data.get("league"), "league")
        market = _require_non_empty_str(data.get("market"), "market")

        raw_line = data.get("line")
        line: float | None = None
        if raw_line is not None:
            if isinstance(raw_line, bool) or not isinstance(raw_line, (int, float, np.floating, np.integer)):
                raise LedgerValidationError(f'el campo "line" debe ser numérico o None; recibido {raw_line!r}')
            fline = float(raw_line)
            if not math.isfinite(fline):
                raise LedgerValidationError(f'el campo "line" debe ser finito; recibido {raw_line!r}')
            line = 0.0 if fline == 0.0 else fline

        selection = _require_non_empty_str(data.get("selection"), "selection")
        book = _require_non_empty_str(data.get("book"), "book")

        raw_price = data.get("price_tomado")
        if isinstance(raw_price, bool) or not isinstance(raw_price, (int, float, np.floating, np.integer)):
            raise LedgerValidationError(f"price_tomado inválido: {raw_price!r}")
        price_tomado = float(raw_price)
        if not math.isfinite(price_tomado) or price_tomado < 1.01:
            raise LedgerValidationError(f"price_tomado debe ser finito y >= 1.01; recibido {raw_price!r}")

        p_modelo = _require_finite_prob_open01(data.get("p_modelo"), "p_modelo")
        p_mercado = _require_finite_prob_open01(data.get("p_mercado"), "p_mercado")
        p_final = _require_finite_prob_open01(data.get("p_final"), "p_final")

        raw_ev = data.get("ev")
        if isinstance(raw_ev, bool) or not isinstance(raw_ev, (int, float, np.floating, np.integer)):
            raise LedgerValidationError(f"ev debe ser numérico finito; recibido {raw_ev!r}")
        ev = float(raw_ev)
        if not math.isfinite(ev):
            raise LedgerValidationError(f"ev debe ser finito; recibido {raw_ev!r}")
        ev = 0.0 if ev == 0.0 else ev

        raw_stake = data.get("stake_u")
        if isinstance(raw_stake, bool) or not isinstance(raw_stake, (int, float, np.floating, np.integer)):
            raise LedgerValidationError(f"stake_u debe ser numérico finito > 0; recibido {raw_stake!r}")
        stake_u = float(raw_stake)
        if not math.isfinite(stake_u) or stake_u <= 0.0:
            raise LedgerValidationError(f"stake_u debe ser finito y > 0; recibido {raw_stake!r}")

        tier = _require_non_empty_str(data.get("tier"), "tier")
        allowed_tier_set = _HISTORICAL_TIER_SET if allow_legacy_tiers else _VALID_TIER_SET
        if tier not in allowed_tier_set:
            allowed_list = HISTORICAL_PICK_TIERS if allow_legacy_tiers else VALID_PICK_TIERS
            raise LedgerValidationError(
                f'tier inválido "{tier}"; permitidos: {", ".join(allowed_list)}',
                code="invalid_pick_tier",
            )

        version_modelo = _require_non_empty_str(data.get("version_modelo"), "version_modelo")
        features_hash = _require_non_empty_str(data.get("features_hash"), "features_hash")

        draft: dict[str, Any] = {
            "record_type": "pick",
            "pick_id": pick_id,
            "ts_emitido": ts_emitido,
            "event_id": event_id,
            "sport": sport,
            "league": league,
            "market": market,
            "line": line,
            "selection": selection,
            "book": book,
            "price_tomado": price_tomado,
            "p_modelo": p_modelo,
            "p_mercado": p_mercado,
            "p_final": p_final,
            "ev": ev,
            "stake_u": stake_u,
            "tier": tier,
            "version_modelo": version_modelo,
            "features_hash": features_hash,
            "prev_hash": self._head_hash,
        }
        entry_hash = compute_entry_hash(draft)
        entry = PickLedgerEntry(**draft, entry_hash=entry_hash)

        self._records.append(entry)
        self._picks.append(entry)
        self._picks_by_id[pick_id] = entry
        self._head_hash = entry_hash
        return entry

    def append_closing(self, data: Mapping[str, Any]) -> PickClosingRecord:
        pick_id = _require_non_empty_str(data.get("pick_id"), "pick_id")
        if pick_id not in self._picks_by_id:
            raise LedgerValidationError(
                f'no se puede adjuntar cierre a pick_id inexistente: "{pick_id}"',
                code="unknown_pick_id",
            )
        if pick_id in self._closings_by_id:
            raise LedgerValidationError(
                f'el pick_id "{pick_id}" ya tiene un registro de cierre inmutable',
                code="duplicate_closing",
            )

        ts_recorded = _require_iso_timestamp(data.get("ts_recorded"), "ts_recorded")
        raw_missing = data.get("closing_missing")
        if not isinstance(raw_missing, bool):
            raise LedgerValidationError('el campo "closing_missing" debe ser bool')

        raw_source = data.get("closing_source")
        closing_source = str(raw_source).strip() if raw_source is not None and str(raw_source).strip() else None

        raw_ts_cap = data.get("ts_closing_captured")
        ts_closing_captured = (
            _require_iso_timestamp(raw_ts_cap, "ts_closing_captured")
            if raw_ts_cap is not None
            else None
        )

        raw_book = data.get("closing_book")
        closing_book = str(raw_book).strip().lower() if raw_book is not None and str(raw_book).strip() else None

        price_cierre_bruto: float | None = None
        price_cierre_sin_margen: float | None = None
        p_cierre_sin_margen: float | None = None

        if raw_missing:
            closing_book = None
        else:
            if closing_book is None or not is_valid_sharp_closing_book(closing_book, closing_source):
                raise LedgerValidationError(
                    f'cierre rechazado para pick_id="{pick_id}": casa "{raw_book}" no es sharp válida '
                    "(jamás se rellena con casas recreativas)",
                    code="invalid_closing_book",
                )

            if data.get("price_cierre_bruto") is not None:
                p_bruto = float(data["price_cierre_bruto"])
                if not math.isfinite(p_bruto) or p_bruto < 1.01:
                    raise LedgerValidationError(f"price_cierre_bruto inválido: {p_bruto!r}")
                price_cierre_bruto = p_bruto

            raw_p_novig = data.get("price_cierre_sin_margen")
            raw_prob_novig = data.get("p_cierre_sin_margen")
            if raw_p_novig is not None:
                p_novig = float(raw_p_novig)
                if not math.isfinite(p_novig) or p_novig <= 1.0:
                    raise LedgerValidationError(
                        f"price_cierre_sin_margen debe ser finito y > 1.0; recibido {raw_p_novig!r}"
                    )
                price_cierre_sin_margen = p_novig
                p_cierre_sin_margen = 1.0 / p_novig
                if raw_prob_novig is not None:
                    prob_nv = float(raw_prob_novig)
                    if not math.isfinite(prob_nv) or abs(prob_nv - p_cierre_sin_margen) > 1e-6:
                        raise LedgerValidationError(
                            f"p_cierre_sin_margen ({prob_nv}) inconsistente con 1/price ({p_cierre_sin_margen})"
                        )
            elif raw_prob_novig is not None:
                prob_nv = float(raw_prob_novig)
                if not math.isfinite(prob_nv) or prob_nv <= 0.0 or prob_nv >= 1.0:
                    raise LedgerValidationError(f"p_cierre_sin_margen debe estar en (0, 1); recibido {raw_prob_novig!r}")
                p_cierre_sin_margen = prob_nv
                price_cierre_sin_margen = 1.0 / prob_nv
            else:
                raise LedgerValidationError(
                    "cuando closing_missing=False se requiere price_cierre_sin_margen o p_cierre_sin_margen"
                )

        draft: dict[str, Any] = {
            "record_type": "closing",
            "pick_id": pick_id,
            "ts_recorded": ts_recorded,
            "closing_missing": raw_missing,
            "closing_book": closing_book,
            "closing_source": closing_source,
            "ts_closing_captured": ts_closing_captured,
            "price_cierre_bruto": price_cierre_bruto,
            "price_cierre_sin_margen": price_cierre_sin_margen,
            "p_cierre_sin_margen": p_cierre_sin_margen,
            "prev_hash": self._head_hash,
        }
        entry_hash = compute_entry_hash(draft)
        record = PickClosingRecord(**draft, entry_hash=entry_hash)

        self._records.append(record)
        self._closings_by_id[pick_id] = record
        self._head_hash = entry_hash
        return record

    def append_settlement(self, data: Mapping[str, Any]) -> PickSettlementRecord:
        pick_id = _require_non_empty_str(data.get("pick_id"), "pick_id")
        parent = self._picks_by_id.get(pick_id)
        if parent is None:
            raise LedgerValidationError(
                f'no se puede liquidar un pick_id inexistente: "{pick_id}"',
                code="unknown_pick_id",
            )
        if pick_id in self._settlements_by_id:
            raise LedgerValidationError(
                f'el pick_id "{pick_id}" ya tiene un registro de liquidación inmutable',
                code="duplicate_settlement",
            )

        ts_liquidado = _require_iso_timestamp(data.get("ts_liquidado"), "ts_liquidado")
        outcome = _require_non_empty_str(data.get("outcome"), "outcome").lower()
        pnl_raw = settle_pick_pnl(parent.stake_u, parent.price_tomado, outcome)
        pnl_u = 0.0 if pnl_raw == 0.0 else pnl_raw

        draft: dict[str, Any] = {
            "record_type": "settlement",
            "pick_id": pick_id,
            "ts_liquidado": ts_liquidado,
            "outcome": outcome,
            "pnl_u": pnl_u,
            "prev_hash": self._head_hash,
        }
        entry_hash = compute_entry_hash(draft)
        record = PickSettlementRecord(**draft, entry_hash=entry_hash)

        self._records.append(record)
        self._settlements_by_id[pick_id] = record
        self._head_hash = entry_hash
        return record

    def get_pick(self, pick_id: str) -> PickLedgerEntry | None:
        return self._picks_by_id.get(pick_id)

    def get_closing(self, pick_id: str) -> PickClosingRecord | None:
        return self._closings_by_id.get(pick_id)

    def get_settlement(self, pick_id: str) -> PickSettlementRecord | None:
        return self._settlements_by_id.get(pick_id)

    def get_picks(self) -> tuple[PickLedgerEntry, ...]:
        return tuple(self._picks)

    def get_closings(self) -> tuple[PickClosingRecord, ...]:
        return tuple(self._closings_by_id.values())

    def get_settlements(self) -> tuple[PickSettlementRecord, ...]:
        return tuple(self._settlements_by_id.values())

    def get_records(self) -> tuple[LedgerRecord, ...]:
        return tuple(self._records)

    def get_resolved_picks(self) -> tuple[dict[str, Any], ...]:
        return tuple(
            {
                "pick": pick,
                "closing": self._closings_by_id.get(pick.pick_id),
                "settlement": self._settlements_by_id.get(pick.pick_id),
            }
            for pick in self._picks
        )

    def verify_integrity(self) -> bool:
        return verify_ledger_integrity(self._records)

    def to_jsonl(self) -> str:
        if not self._records:
            return ""
        lines = [
            json.dumps(rec.to_dict(), ensure_ascii=False, separators=(",", ":"))
            for rec in self._records
        ]
        return "\n".join(lines) + "\n"

    @classmethod
    def from_jsonl(cls, jsonl_text: str) -> "PickLedger":
        ledger = cls()
        for line_no, raw_line in enumerate(jsonl_text.splitlines(), start=1):
            trimmed = raw_line.strip()
            if not trimmed:
                continue
            try:
                parsed = json.loads(trimmed)
            except json.JSONDecodeError as exc:
                raise LedgerValidationError(f"JSON inválido en línea {line_no}: {exc}") from exc

            if not isinstance(parsed, dict):
                raise LedgerValidationError(f"se esperaba objeto JSON en línea {line_no}")

            file_prev = _require_sha256_hex64(parsed.get("prev_hash"), f"line[{line_no}].prev_hash")
            file_hash = _require_sha256_hex64(parsed.get("entry_hash"), f"line[{line_no}].entry_hash")

            if file_prev != ledger.head_hash:
                raise LedgerIntegrityError(
                    f"cadena SHA-256 rota en línea {line_no}: prev_hash={file_prev} != esperado={ledger.head_hash}"
                )

            rec_type = parsed.get("record_type", "pick")
            if rec_type == "pick":
                appended: LedgerRecord = ledger.append_pick(parsed, allow_legacy_tiers=True)
            elif rec_type == "closing":
                appended = ledger.append_closing(parsed)
            elif rec_type == "settlement":
                appended = ledger.append_settlement(parsed)
                if "pnl_u" in parsed and abs(float(parsed["pnl_u"]) - appended.pnl_u) > 1e-12:
                    raise LedgerIntegrityError(
                        f"pnl_u alterado en línea {line_no}: archivo={parsed['pnl_u']}, recalculado={appended.pnl_u}"
                    )
            else:
                raise LedgerValidationError(f"record_type desconocido en línea {line_no}: {rec_type!r}")

            if appended.entry_hash != file_hash:
                raise LedgerIntegrityError(
                    f'entry_hash alterado en línea {line_no} (pick_id="{appended.pick_id}"): '
                    f"esperado={appended.entry_hash}, archivo={file_hash}"
                )

        return ledger


def load_ledger_jsonl(path: str | Path) -> PickLedger:
    """Carga y verifica criptográficamente un archivo `.jsonl` de ledger."""
    p = Path(path)
    if not p.exists():
        return PickLedger()
    return PickLedger.from_jsonl(p.read_text(encoding="utf-8"))


def save_ledger_jsonl(path: str | Path, ledger: PickLedger) -> None:
    """Persiste un `PickLedger` verificado a disco en formato `.jsonl`."""
    ledger.verify_integrity()
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(ledger.to_jsonl(), encoding="utf-8")


def append_pick_to_jsonl(path: str | Path, pick_data: Mapping[str, Any]) -> PickLedgerEntry:
    """Lee y verifica el ledger existente en `path`, añade `pick_data` en modo append-only y escribe la nueva línea."""
    p = Path(path)
    ledger = load_ledger_jsonl(p)
    entry = ledger.append_pick(pick_data)
    p.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(entry.to_dict(), ensure_ascii=False, separators=(",", ":")) + "\n"
    with p.open("a", encoding="utf-8") as handle:
        handle.write(line)
    return entry


# ---------------------------------------------------------------------------
# PRNG `mulberry32` vectorizado en uint64 (cero warnings NumPy 2.x) + Cuantiles
# ---------------------------------------------------------------------------


def mulberry32_uniforms(seed: int, count: int) -> np.ndarray:
    """Genera `count` uniformes en `[0, 1)` bit a bit idénticos a `createMulberry32(seed)` en TS."""
    if count <= 0:
        return np.empty(0, dtype=np.float64)

    mask = np.uint64(0xFFFFFFFF)
    s0 = int(seed) & 0xFFFFFFFF
    if s0 == 0:
        s0 = 0x12345678

    steps = np.arange(1, count + 1, dtype=np.uint64)
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


def quantile_linear_sorted(sorted_arr: np.ndarray, q: float) -> float:
    """Cuantil lineal Type-7 sobre arreglo 1D ya ordenado ascendentemente."""
    n = int(sorted_arr.shape[0])
    if n == 0:
        raise LedgerValidationError("no se puede calcular cuantil de arreglo vacío")
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


# ---------------------------------------------------------------------------
# Resolución de cierres sharp desde `odds_snapshots` (Pinnacle / Smarkets)
# ---------------------------------------------------------------------------


def _solve_power_devig(odds: Sequence[float], tolerance: float = 1e-12) -> list[float]:
    q = [1.0 / float(o) for o in odds]
    lo = 1e-6
    hi = 5.0
    alpha = 1.0
    for _ in range(200):
        alpha = 0.5 * (lo + hi)
        s = sum(qi ** alpha for qi in q)
        if abs(s - 1.0) <= tolerance:
            break
        if s > 1.0:
            lo = alpha
        else:
            hi = alpha
    p = [qi ** alpha for qi in q]
    tot = sum(p)
    return [pi / tot for pi in p]


def resolve_closings_from_snapshots(
    picks: Sequence[Mapping[str, Any] | PickLedgerEntry],
    snapshots: pd.DataFrame | Sequence[Mapping[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Cruza picks contra `odds_snapshots` aplicando la definición estricta de cierre sharp (A1/A2):
    - `historical_fd`: ÚNICAMENTE `book == "pinnacle"` en etapa `close` (jamás `open`, jamás `bfe`, jamás recreativas).
    - `scraped_ws`: último snapshot con `ts_captured <= ts_event_start` de `pinnacle`, fallback SOLO a `smarkets`.
    Elimina el margen con Power de-vig sobre las selecciones del mercado.
    """
    df = snapshots if isinstance(snapshots, pd.DataFrame) else pd.DataFrame(list(snapshots))
    result: dict[str, dict[str, Any]] = {}
    if df.empty:
        for raw_p in picks:
            p = raw_p.to_dict() if hasattr(raw_p, "to_dict") else dict(raw_p)  # type: ignore[union-attr]
            result[str(p["pick_id"])] = {"closing_missing": True, "closing_book": None, "price_cierre_sin_margen": None}
        return result

    work = df.copy()
    work["_event_id"] = work["event_id"].astype(str)
    work["_market"] = work["market"].astype(str).str.strip().str.lower()
    work["_selection"] = work["selection"].astype(str).str.strip().str.lower()
    work["_book"] = work["book"].astype(str).str.strip().str.lower()
    work["_source"] = work["source"].astype(str).str.strip().str.lower() if "source" in work.columns else "scraped_ws"
    if "snapshot_stage" in work.columns:
        work["_stage"] = work["snapshot_stage"].astype(str).str.strip().str.lower()
    else:
        work["_stage"] = ""

    work["_ts_cap"] = pd.to_datetime(work["ts_captured"], utc=True, errors="coerce")
    work["_ts_start"] = pd.to_datetime(work["ts_event_start"], utc=True, errors="coerce")
    work = work[work["_ts_cap"].notna() & work["_ts_start"].notna() & (work["_ts_cap"] <= work["_ts_start"])]
    work = work[work["_book"].isin(["pinnacle", "smarkets"])]

    grouped_by_event = {eid: grp for eid, grp in work.groupby("_event_id", sort=False)}

    for raw_p in picks:
        p = raw_p.to_dict() if hasattr(raw_p, "to_dict") else dict(raw_p)  # type: ignore[union-attr]
        pid = str(p["pick_id"])
        eid = str(p["event_id"])
        mkt = str(p["market"]).strip().lower()
        sel = str(p["selection"]).strip().lower()
        line_val = p.get("line")

        ev_df = grouped_by_event.get(eid)
        if ev_df is None or ev_df.empty:
            result[pid] = {"closing_missing": True, "closing_book": None, "price_cierre_sin_margen": None}
            continue

        mkt_df = ev_df[ev_df["_market"] == mkt]
        if line_val is not None and not _is_nullish(line_val) and "line" in mkt_df.columns:
            ln = float(line_val)
            same_line = mkt_df[np.isclose(pd.to_numeric(mkt_df["line"], errors="coerce"), ln, atol=1e-6)]
            if mkt in ("ah", "asian_handicap", "spread", "handicap") and same_line["_selection"].nunique() < 2:
                opp_sel = "away" if sel in ("home", "1", "h") else "home"
                opp_line = mkt_df[
                    (mkt_df["_selection"] == opp_sel)
                    & np.isclose(pd.to_numeric(mkt_df["line"], errors="coerce"), -ln, atol=1e-6)
                ]
                mkt_df = pd.concat([same_line, opp_line], ignore_index=True)
            else:
                mkt_df = same_line

        if mkt_df.empty:
            result[pid] = {"closing_missing": True, "closing_book": None, "price_cierre_sin_margen": None}
            continue

        expected_k = 3 if mkt in ("1x2", "h2h", "match_odds") else 2
        resolved_entry: dict[str, Any] | None = None

        for candidate_book in ("pinnacle", "smarkets"):
            b_df = mkt_df[mkt_df["_book"] == candidate_book]
            if b_df.empty:
                continue
            # En `historical_fd` solo se acepta `pinnacle` y nunca `open`
            b_df = b_df[
                ~(
                    (b_df["_source"] == "historical_fd")
                    & ((candidate_book != "pinnacle") | (b_df["_stage"] == "open"))
                )
            ]
            if "_stage" in b_df.columns:
                hist_mask = b_df["_source"] == "historical_fd"
                if hist_mask.any() and (b_df.loc[hist_mask, "_stage"] != "").any():
                    b_df = b_df[~hist_mask | (b_df["_stage"] == "close")]
            if b_df.empty:
                continue

            latest_per_sel = b_df.sort_values("_ts_cap").groupby("_selection", as_index=False).last()
            if len(latest_per_sel) < expected_k or sel not in set(latest_per_sel["_selection"]):
                continue

            odds_list = latest_per_sel["price_decimal"].astype(float).tolist()
            if any((not math.isfinite(o) or o <= 1.0) for o in odds_list):
                continue

            probs_novig = _solve_power_devig(odds_list)
            sels_list = latest_per_sel["_selection"].tolist()
            sel_idx = sels_list.index(sel)
            p_nv = probs_novig[sel_idx]
            row_sel = latest_per_sel.iloc[sel_idx]
            resolved_entry = {
                "closing_missing": False,
                "closing_book": candidate_book,
                "closing_source": str(row_sel["_source"]),
                "price_cierre_bruto": float(row_sel["price_decimal"]),
                "price_cierre_sin_margen": 1.0 / p_nv,
                "p_cierre_sin_margen": p_nv,
            }
            break

        if resolved_entry is None:
            result[pid] = {"closing_missing": True, "closing_book": None, "price_cierre_sin_margen": None}
        else:
            result[pid] = resolved_entry

    return result


# ---------------------------------------------------------------------------
# Funciones puras de métricas CLV y Bootstrap exportadas a `a3-backtest`
# ---------------------------------------------------------------------------


def compute_single_pick_clv(
    price_tomado: float,
    price_cierre_sin_margen: float | None = None,
    *,
    p_cierre_sin_margen: float | None = None,
    closing_missing: bool = False,
    closing_book: str | None = None,
    closing_source: str | None = None,
) -> dict[str, Any]:
    """Calcula `clv_pct` y `clv_prob` exactos de un pick individual con bloqueo de casas recreativas."""
    if isinstance(price_tomado, bool) or not math.isfinite(float(price_tomado)) or float(price_tomado) < 1.01:
        raise LedgerValidationError(f"price_tomado inválido en compute_single_pick_clv: {price_tomado!r}")

    p_taken = float(price_tomado)
    p_tomado_imp = 1.0 / p_taken

    if bool(closing_missing):
        return {
            "clv_pct": None,
            "clv_prob": None,
            "p_tomado_implicita": p_tomado_imp,
            "price_cierre_sin_margen": None,
            "p_cierre_sin_margen": None,
            "closing_missing": True,
        }

    if closing_book is not None and str(closing_book).strip() != "":
        if not is_valid_sharp_closing_book(closing_book, closing_source):
            return {
                "clv_pct": None,
                "clv_prob": None,
                "p_tomado_implicita": p_tomado_imp,
                "price_cierre_sin_margen": None,
                "p_cierre_sin_margen": None,
                "closing_missing": True,
            }

    price_nv: float | None = None
    prob_nv: float | None = None

    if not _is_nullish(price_cierre_sin_margen):
        cand_price = float(price_cierre_sin_margen)  # type: ignore[arg-type]
        if math.isfinite(cand_price) and cand_price > 1.0:
            price_nv = cand_price
            prob_nv = 1.0 / cand_price
            if not _is_nullish(p_cierre_sin_margen):
                cand_prob = float(p_cierre_sin_margen)  # type: ignore[arg-type]
                if math.isfinite(cand_prob) and abs(cand_prob - prob_nv) > 1e-6:
                    raise LedgerValidationError(
                        f"p_cierre_sin_margen ({cand_prob}) inconsistente con 1/price ({prob_nv})"
                    )
    elif not _is_nullish(p_cierre_sin_margen):
        cand_prob = float(p_cierre_sin_margen)  # type: ignore[arg-type]
        if math.isfinite(cand_prob) and 0.0 < cand_prob < 1.0:
            prob_nv = cand_prob
            price_nv = 1.0 / cand_prob

    if price_nv is None or prob_nv is None:
        return {
            "clv_pct": None,
            "clv_prob": None,
            "p_tomado_implicita": p_tomado_imp,
            "price_cierre_sin_margen": None,
            "p_cierre_sin_margen": None,
            "closing_missing": True,
        }

    clv_pct = (p_taken / price_nv) - 1.0
    clv_prob = prob_nv - p_tomado_imp

    return {
        "clv_pct": clv_pct,
        "clv_prob": clv_prob,
        "p_tomado_implicita": p_tomado_imp,
        "price_cierre_sin_margen": price_nv,
        "p_cierre_sin_margen": prob_nv,
        "closing_missing": False,
    }


def _index_aux_records_by_pick_id(
    aux: Mapping[str, Any] | Sequence[Mapping[str, Any]] | pd.DataFrame | None,
    picks_list: Sequence[Mapping[str, Any]],
) -> dict[str, dict[str, Any]]:
    if aux is None:
        return {}
    if isinstance(aux, pd.DataFrame):
        if "pick_id" in aux.columns:
            return {str(row["pick_id"]): dict(row) for row in aux.to_dict(orient="records")}
        if {"event_id", "market", "selection", "price_decimal"}.issubset(set(aux.columns)):
            return resolve_closings_from_snapshots(picks_list, aux)
        return {}
    if isinstance(aux, Mapping):
        out: dict[str, dict[str, Any]] = {}
        for k, v in aux.items():
            if hasattr(v, "to_dict"):
                out[str(k)] = v.to_dict()  # type: ignore[union-attr]
            elif isinstance(v, Mapping):
                out[str(k)] = dict(v)
        return out
    seq = list(aux)
    if not seq:
        return {}
    first = seq[0].to_dict() if hasattr(seq[0], "to_dict") else dict(seq[0])  # type: ignore[union-attr]
    if "pick_id" in first:
        return {
            str((item.to_dict() if hasattr(item, "to_dict") else item)["pick_id"]): (  # type: ignore[union-attr]
                item.to_dict() if hasattr(item, "to_dict") else dict(item)  # type: ignore[union-attr]
            )
            for item in seq
        }
    if {"event_id", "market", "selection", "price_decimal"}.issubset(set(first.keys())):
        return resolve_closings_from_snapshots(picks_list, seq)
    return {}


def compute_clv_metrics(
    picks: PickLedger | pd.DataFrame | Sequence[Mapping[str, Any]] | Mapping[str, Any] | PickLedgerEntry | None = None,
    closings: Mapping[str, Any] | Sequence[Mapping[str, Any]] | pd.DataFrame | None = None,
    settlements: Mapping[str, Any] | Sequence[Mapping[str, Any]] | pd.DataFrame | None = None,
    *,
    price_tomado: float | None = None,
    price_cierre_sin_margen: float | None = None,
    p_cierre_sin_margen: float | None = None,
    closing_missing: bool = False,
    closing_book: str | None = None,
    closing_source: str | None = None,
    stake_u: float | None = None,
    outcome: str | None = None,
) -> dict[str, Any] | list[dict[str, Any]]:
    """Función pura importable por `a3-backtest` para calcular métricas exactas de CLV y PnL.

    Modos soportados:
      1. Escalar por kwargs: `compute_clv_metrics(price_tomado=2.10, price_cierre_sin_margen=2.00, ...)` -> `dict`
      2. Un solo pick (`dict` o `PickLedgerEntry`) -> `dict` enriquecido
      3. Colección (`PickLedger`, `DataFrame` o `list[dict]`) + `closings`/`settlements` opcionales -> `list[dict]`
    """
    if picks is None:
        if price_tomado is None:
            raise LedgerValidationError("se requiere `picks` o `price_tomado` en compute_clv_metrics")
        res = compute_single_pick_clv(
            price_tomado,
            price_cierre_sin_margen,
            p_cierre_sin_margen=p_cierre_sin_margen,
            closing_missing=closing_missing,
            closing_book=closing_book,
            closing_source=closing_source,
        )
        res["outcome"] = outcome
        res["pnl_u"] = (
            settle_pick_pnl(float(stake_u), float(price_tomado), outcome)
            if (stake_u is not None and outcome is not None)
            else None
        )
        return res

    single_mode = False
    raw_items: list[dict[str, Any]] = []

    if isinstance(picks, PickLedger):
        for resolved in picks.get_resolved_picks():
            merged = resolved["pick"].to_dict()
            if resolved["closing"] is not None:
                c_dict = resolved["closing"].to_dict()
                for ck in (
                    "closing_missing",
                    "closing_book",
                    "closing_source",
                    "price_cierre_bruto",
                    "price_cierre_sin_margen",
                    "p_cierre_sin_margen",
                ):
                    merged[ck] = c_dict.get(ck)
            if resolved["settlement"] is not None:
                s_dict = resolved["settlement"].to_dict()
                merged["outcome"] = s_dict.get("outcome")
                merged["pnl_u"] = s_dict.get("pnl_u")
            raw_items.append(merged)
    elif isinstance(picks, PickLedgerEntry):
        single_mode = True
        raw_items = [picks.to_dict()]
    elif isinstance(picks, Mapping):
        single_mode = True
        raw_items = [dict(picks)]
    elif isinstance(picks, pd.DataFrame):
        raw_items = [dict(r) for r in picks.to_dict(orient="records")]
    else:
        for item in picks:
            if isinstance(item, Mapping) and "pick" in item and isinstance(item["pick"], (Mapping, PickLedgerEntry)):
                p_base = item["pick"].to_dict() if hasattr(item["pick"], "to_dict") else dict(item["pick"])  # type: ignore[union-attr]
                c_sub = item.get("closing")
                s_sub = item.get("settlement")
                if c_sub is not None:
                    c_d = c_sub.to_dict() if hasattr(c_sub, "to_dict") else dict(c_sub)
                    for ck in (
                        "closing_missing",
                        "closing_book",
                        "closing_source",
                        "price_cierre_sin_margen",
                        "p_cierre_sin_margen",
                    ):
                        p_base[ck] = c_d.get(ck)
                if s_sub is not None:
                    s_d = s_sub.to_dict() if hasattr(s_sub, "to_dict") else dict(s_sub)
                    p_base["outcome"] = s_d.get("outcome")
                    p_base["pnl_u"] = s_d.get("pnl_u")
                raw_items.append(p_base)
            elif hasattr(item, "to_dict"):
                raw_items.append(item.to_dict())  # type: ignore[union-attr]
            else:
                raw_items.append(dict(item))

    closings_map = _index_aux_records_by_pick_id(closings, raw_items)
    settlements_map = _index_aux_records_by_pick_id(settlements, raw_items)

    evaluated: list[dict[str, Any]] = []
    for idx, p in enumerate(raw_items):
        pid = str(p.get("pick_id", f"pick_{idx}"))
        c_rec = closings_map.get(pid, {})
        s_rec = settlements_map.get(pid, {})

        c_missing = c_rec.get("closing_missing", p.get("closing_missing", False))
        if _is_nullish(c_missing):
            c_missing = False

        c_book = c_rec.get("closing_book", p.get("closing_book"))
        if _is_nullish(c_book):
            c_book = None

        c_source = c_rec.get("closing_source", p.get("closing_source"))
        if _is_nullish(c_source):
            c_source = None

        p_novig = c_rec.get("price_cierre_sin_margen", p.get("price_cierre_sin_margen"))
        if _is_nullish(p_novig):
            p_novig = None

        prob_novig = c_rec.get("p_cierre_sin_margen", p.get("p_cierre_sin_margen"))
        if _is_nullish(prob_novig):
            prob_novig = None

        p_taken = float(p["price_tomado"])
        s_taken = float(p.get("stake_u", 1.0))

        clv_res = compute_single_pick_clv(
            p_taken,
            p_novig,
            p_cierre_sin_margen=prob_novig,
            closing_missing=bool(c_missing),
            closing_book=str(c_book) if c_book is not None else None,
            closing_source=str(c_source) if c_source is not None else None,
        )

        out_val = s_rec.get("outcome", p.get("outcome"))
        if _is_nullish(out_val):
            out_val = None
        else:
            out_val = str(out_val).strip().lower()

        pnl_val: float | None = None
        if out_val is not None:
            pnl_val = settle_pick_pnl(s_taken, p_taken, out_val)
            prov_pnl = s_rec.get("pnl_u")
            if not _is_nullish(prov_pnl) and abs(float(prov_pnl) - pnl_val) > 1e-9:
                raise LedgerValidationError(
                    f'pnl_u inconsistente para pick_id="{pid}": provisto={prov_pnl}, esperado={pnl_val}'
                )
        else:
            raw_pnl = p.get("pnl_u")
            if not _is_nullish(raw_pnl):
                pnl_val = float(raw_pnl)

        line_raw = p.get("line")
        line_clean = None if _is_nullish(line_raw) else float(line_raw)

        evaluated.append(
            {
                "pick_id": pid,
                "ts_emitido": str(p.get("ts_emitido", "1970-01-01T00:00:00Z")),
                "event_id": str(p.get("event_id", "")),
                "sport": str(p.get("sport", "unknown")),
                "league": str(p.get("league", "unknown")),
                "market": str(p.get("market", "unknown")),
                "line": line_clean,
                "selection": str(p.get("selection", "unknown")),
                "book": str(p.get("book", "unknown")),
                "tier": str(p.get("tier", "baseline_v3_0")),
                "price_tomado": p_taken,
                "stake_u": s_taken,
                "p_tomado_implicita": clv_res["p_tomado_implicita"],
                "closing_missing": clv_res["closing_missing"],
                "closing_book": None if clv_res["closing_missing"] else (str(c_book).lower() if c_book else None),
                "price_cierre_sin_margen": clv_res["price_cierre_sin_margen"],
                "p_cierre_sin_margen": clv_res["p_cierre_sin_margen"],
                "clv_pct": clv_res["clv_pct"],
                "clv_prob": clv_res["clv_prob"],
                "outcome": out_val,
                "pnl_u": pnl_val,
            }
        )

    if single_mode:
        return evaluated[0]
    return evaluated


def compute_max_drawdown_u(pnl_sequence: Sequence[float] | np.ndarray) -> float:
    """Calcula `max_drawdown_u >= 0.0` sobre una serie cronológica de `pnl_u` con pico base en `0.0`."""
    arr = np.asarray(pnl_sequence, dtype=np.float64)
    if arr.size == 0:
        return 0.0
    if not np.all(np.isfinite(arr)):
        raise LedgerValidationError("compute_max_drawdown_u recibió valores no finitos")
    cum = np.cumsum(arr)
    peaks = np.maximum(0.0, np.maximum.accumulate(cum))
    drawdowns = peaks - cum
    return float(np.max(drawdowns))


def _build_significance(sample_size: int, ci_low: float, ci_high: float) -> tuple[bool, str]:
    if sample_size >= 2 and ci_low > 0.0:
        return True, "significativa_positiva"
    if sample_size >= 2 and ci_high < 0.0:
        return True, "significativa_negativa"
    return False, "no significativa"


def _empty_bootstrap_summary() -> dict[str, Any]:
    return {
        "mean": None,
        "ci95_low": None,
        "ci95_high": None,
        "ci95": None,
        "statistically_significant": False,
        "significance_label": "no significativa",
        "prob_gt_zero": None,
    }


def bootstrap_mean_ci(
    values: Sequence[float] | np.ndarray,
    *,
    n_resamples: int = DEFAULT_BOOTSTRAP_RESAMPLES,
    seed: int = DEFAULT_BOOTSTRAP_SEED,
    ci_level: float = DEFAULT_BOOTSTRAP_CI_LEVEL,
) -> dict[str, Any]:
    """Bootstrap determinista (`mulberry32`) de la media de un vector 1D (reutilizable por `a3-backtest`)."""
    if int(n_resamples) < MIN_BOOTSTRAP_RESAMPLES:
        raise LedgerValidationError(
            f"n_resamples debe ser >= {MIN_BOOTSTRAP_RESAMPLES}; recibido {n_resamples!r}"
        )
    arr = np.asarray(values, dtype=np.float64)
    arr = arr[np.isfinite(arr)]
    m = int(arr.size)
    if m == 0:
        return _empty_bootstrap_summary()

    alpha = 0.5 * (1.0 - float(ci_level))
    u = mulberry32_uniforms(seed, int(n_resamples) * m).reshape((int(n_resamples), m))
    idx = np.minimum(m - 1, np.floor(u * m).astype(np.int64))
    boot_means = arr[idx].mean(axis=1)
    boot_sorted = np.sort(boot_means)

    ci_low = quantile_linear_sorted(boot_sorted, alpha)
    ci_high = quantile_linear_sorted(boot_sorted, 1.0 - alpha)
    sig, label = _build_significance(m, ci_low, ci_high)

    return {
        "mean": float(arr.mean()),
        "ci95_low": ci_low,
        "ci95_high": ci_high,
        "ci95": [ci_low, ci_high],
        "statistically_significant": sig,
        "significance_label": label,
        "prob_gt_zero": float(np.mean(boot_means > 0.0)),
    }


def bootstrap_paired_delta_ci(
    values_model: Sequence[float] | np.ndarray,
    values_baseline: Sequence[float] | np.ndarray,
    *,
    n_resamples: int = DEFAULT_BOOTSTRAP_RESAMPLES,
    seed: int = DEFAULT_BOOTSTRAP_SEED,
    ci_level: float = DEFAULT_BOOTSTRAP_CI_LEVEL,
) -> dict[str, Any]:
    """Bootstrap pareado determinista de `mean(values_model - values_baseline)` (útil para `delta_log_loss` / `delta_brier`)."""
    a = np.asarray(values_model, dtype=np.float64)
    b = np.asarray(values_baseline, dtype=np.float64)
    if a.shape != b.shape:
        raise LedgerValidationError("values_model y values_baseline deben tener la misma longitud")
    return bootstrap_mean_ci(a - b, n_resamples=n_resamples, seed=seed, ci_level=ci_level)


def _summarize_single_group(
    picks: Sequence[Mapping[str, Any]],
    n_resamples: int,
    seed: int,
    ci_level: float,
) -> dict[str, Any]:
    n_picks = len(picks)
    alpha = 0.5 * (1.0 - ci_level)
    q_low = alpha
    q_high = 1.0 - alpha

    valid_clv = [
        p for p in picks if (not p["closing_missing"]) and (p["clv_pct"] is not None) and (p["clv_prob"] is not None)
    ]
    n_with_closing = len(valid_clv)
    n_closing_missing = n_picks - n_with_closing

    total_stake_u = float(sum(float(p["stake_u"]) for p in picks))
    settled = [p for p in picks if p["pnl_u"] is not None]
    n_settled = len(settled)

    n_wins = sum(1 for p in settled if p["outcome"] == "win")
    n_losses = sum(1 for p in settled if p["outcome"] == "loss")
    n_pushes = sum(1 for p in settled if p["outcome"] in ("push", "void"))
    n_half_wins = sum(1 for p in settled if p["outcome"] == "half_win")
    n_half_losses = sum(1 for p in settled if p["outcome"] == "half_loss")
    settled_stake_u = float(sum(float(p["stake_u"]) for p in settled))
    total_pnl_u = float(sum(float(p["pnl_u"]) for p in settled))

    clv_pct_bootstrap = _empty_bootstrap_summary()
    clv_prob_bootstrap = _empty_bootstrap_summary()
    pct_picks_clv_positive: float | None = None

    if n_with_closing > 0:
        pct_arr = np.array([float(p["clv_pct"]) for p in valid_clv], dtype=np.float64)
        prob_arr = np.array([float(p["clv_prob"]) for p in valid_clv], dtype=np.float64)

        mean_pct = float(np.sum(pct_arr) / n_with_closing)
        mean_prob = float(np.sum(prob_arr) / n_with_closing)
        pct_picks_clv_positive = float(np.sum(pct_arr > 0.0) / n_with_closing)

        u_clv = mulberry32_uniforms(seed, n_resamples * n_with_closing).reshape((n_resamples, n_with_closing))
        idx_clv = np.minimum(n_with_closing - 1, np.floor(u_clv * n_with_closing).astype(np.int64))

        boot_pct = pct_arr[idx_clv].sum(axis=1) / n_with_closing
        boot_prob = prob_arr[idx_clv].sum(axis=1) / n_with_closing

        gt_zero_pct = float(np.sum(boot_pct > 0.0) / n_resamples)
        gt_zero_prob = float(np.sum(boot_prob > 0.0) / n_resamples)

        boot_pct_sorted = np.sort(boot_pct)
        boot_prob_sorted = np.sort(boot_prob)

        pct_low = quantile_linear_sorted(boot_pct_sorted, q_low)
        pct_high = quantile_linear_sorted(boot_pct_sorted, q_high)
        pct_sig, pct_label = _build_significance(n_with_closing, pct_low, pct_high)

        prob_low = quantile_linear_sorted(boot_prob_sorted, q_low)
        prob_high = quantile_linear_sorted(boot_prob_sorted, q_high)
        prob_sig, prob_label = _build_significance(n_with_closing, prob_low, prob_high)

        clv_pct_bootstrap = {
            "mean": mean_pct,
            "ci95_low": pct_low,
            "ci95_high": pct_high,
            "ci95": [pct_low, pct_high],
            "statistically_significant": pct_sig,
            "significance_label": pct_label,
            "prob_gt_zero": gt_zero_pct,
        }
        clv_prob_bootstrap = {
            "mean": mean_prob,
            "ci95_low": prob_low,
            "ci95_high": prob_high,
            "ci95": [prob_low, prob_high],
            "statistically_significant": prob_sig,
            "significance_label": prob_label,
            "prob_gt_zero": gt_zero_prob,
        }

    roi_bootstrap = _empty_bootstrap_summary()
    if n_settled > 0 and settled_stake_u > 0.0:
        pnl_arr = np.array([float(p["pnl_u"]) for p in settled], dtype=np.float64)
        stake_arr = np.array([float(p["stake_u"]) for p in settled], dtype=np.float64)
        roi_point = total_pnl_u / settled_stake_u

        roi_seed = (int(seed) ^ 0x9E3779B9) & 0xFFFFFFFF
        u_roi = mulberry32_uniforms(roi_seed, n_resamples * n_settled).reshape((n_resamples, n_settled))
        idx_roi = np.minimum(n_settled - 1, np.floor(u_roi * n_settled).astype(np.int64))

        boot_roi = pnl_arr[idx_roi].sum(axis=1) / stake_arr[idx_roi].sum(axis=1)
        gt_zero_roi = float(np.sum(boot_roi > 0.0) / n_resamples)
        boot_roi_sorted = np.sort(boot_roi)

        roi_low = quantile_linear_sorted(boot_roi_sorted, q_low)
        roi_high = quantile_linear_sorted(boot_roi_sorted, q_high)
        roi_sig, roi_label = _build_significance(n_settled, roi_low, roi_high)

        roi_bootstrap = {
            "mean": roi_point,
            "ci95_low": roi_low,
            "ci95_high": roi_high,
            "ci95": [roi_low, roi_high],
            "statistically_significant": roi_sig,
            "significance_label": roi_label,
            "prob_gt_zero": gt_zero_roi,
        }

    def _sort_key(item: Mapping[str, Any]) -> tuple[float, str, str]:
        ts_str = str(item.get("ts_emitido", ""))
        try:
            epoch = _parse_iso_to_epoch(ts_str, "ts_emitido")
        except LedgerValidationError:
            epoch = float("inf")
        return (epoch, ts_str, str(item.get("pick_id", "")))

    chronological_settled = sorted(settled, key=_sort_key)
    max_drawdown_u = compute_max_drawdown_u([float(p["pnl_u"]) for p in chronological_settled])

    return {
        "n_picks": n_picks,
        "n_with_closing": n_with_closing,
        "n_closing_missing": n_closing_missing,
        "n_settled": n_settled,
        "n_wins": n_wins,
        "n_losses": n_losses,
        "n_pushes": n_pushes,
        "n_half_wins": n_half_wins,
        "n_half_losses": n_half_losses,
        "total_stake_u": total_stake_u,
        "settled_stake_u": settled_stake_u,
        "total_pnl_u": total_pnl_u,
        "clv_mean": clv_pct_bootstrap["mean"],
        "clv_pct_mean": clv_pct_bootstrap["mean"],
        "clv_pct_ci95": clv_pct_bootstrap["ci95"],
        "clv_prob_mean": clv_prob_bootstrap["mean"],
        "clv_prob_ci95": clv_prob_bootstrap["ci95"],
        "statistically_significant": clv_pct_bootstrap["statistically_significant"],
        "significance_label": clv_pct_bootstrap["significance_label"],
        "pct_picks_clv_positive": pct_picks_clv_positive,
        "roi_pct": roi_bootstrap["mean"],
        "roi_pct_ci95": roi_bootstrap["ci95"],
        "roi_statistically_significant": roi_bootstrap["statistically_significant"],
        "roi_significance_label": roi_bootstrap["significance_label"],
        "max_drawdown_u": max_drawdown_u,
        "clv_pct_bootstrap": clv_pct_bootstrap,
        "clv_prob_bootstrap": clv_prob_bootstrap,
        "roi_bootstrap": roi_bootstrap,
    }


def _group_by_dimension(
    evaluated: Sequence[Mapping[str, Any]],
    key_fn: Any,
    n_resamples: int,
    seed: int,
    ci_level: float,
) -> dict[str, dict[str, Any]]:
    buckets: dict[str, list[Mapping[str, Any]]] = {}
    for p in evaluated:
        k = str(key_fn(p))
        buckets.setdefault(k, []).append(p)
    return {
        k: _summarize_single_group(buckets[k], n_resamples, seed, ci_level)
        for k in sorted(buckets.keys())
    }


def summarize_picks_bootstrap(
    picks: PickLedger | pd.DataFrame | Sequence[Mapping[str, Any]],
    closings: Mapping[str, Any] | Sequence[Mapping[str, Any]] | pd.DataFrame | None = None,
    settlements: Mapping[str, Any] | Sequence[Mapping[str, Any]] | pd.DataFrame | None = None,
    *,
    n_resamples: int = DEFAULT_BOOTSTRAP_RESAMPLES,
    seed: int = DEFAULT_BOOTSTRAP_SEED,
    ci_level: float = DEFAULT_BOOTSTRAP_CI_LEVEL,
) -> dict[str, Any]:
    """Función pura importable por `a3-backtest`: calcula CLV, ROI, IC 95% bootstrap (`>= 1000`
    remuestreos por defecto) y `max_drawdown_u`, global y desglosado por `league`, `market`, `tier`,
    `book` y `league::market`.
    """
    if not isinstance(n_resamples, (int, np.integer)) or isinstance(n_resamples, bool) or int(n_resamples) < MIN_BOOTSTRAP_RESAMPLES:
        raise LedgerValidationError(
            f"n_resamples debe ser entero >= {MIN_BOOTSTRAP_RESAMPLES}; recibido {n_resamples!r}"
        )
    if not math.isfinite(float(ci_level)) or float(ci_level) <= 0.0 or float(ci_level) >= 1.0:
        raise LedgerValidationError(f"ci_level debe estar en (0, 1); recibido {ci_level!r}")

    n_res = int(n_resamples)
    c_lvl = float(ci_level)
    seed_i32 = int(seed)
    if seed_i32 >= 0x80000000:
        seed_i32 -= 0x100000000

    evaluated = compute_clv_metrics(picks, closings=closings, settlements=settlements)
    assert isinstance(evaluated, list)

    return {
        "meta": {
            "n_resamples": n_res,
            "seed": seed_i32,
            "ci_level": c_lvl,
            "prng": "mulberry32",
        },
        "global": _summarize_single_group(evaluated, n_res, int(seed), c_lvl),
        "by_league": _group_by_dimension(evaluated, lambda p: p["league"], n_res, int(seed), c_lvl),
        "by_market": _group_by_dimension(evaluated, lambda p: p["market"], n_res, int(seed), c_lvl),
        "by_tier": _group_by_dimension(evaluated, lambda p: p["tier"], n_res, int(seed), c_lvl),
        "by_book": _group_by_dimension(evaluated, lambda p: p["book"], n_res, int(seed), c_lvl),
        "by_league_market": _group_by_dimension(
            evaluated,
            lambda p: f'{p["league"]}::{p["market"]}',
            n_res,
            int(seed),
            c_lvl,
        ),
    }


# ---------------------------------------------------------------------------
# Generador puro de reporte Markdown (`generate_clv_markdown_report`)
# ---------------------------------------------------------------------------


def _fmt_pct(val: float | None) -> str:
    return "N/A" if val is None else f"{val:+.2%}"


def _fmt_ratio(val: float | None) -> str:
    return "N/A" if val is None else f"{val:.1%}"


def _fmt_ci(ci: Sequence[float] | None) -> str:
    if ci is None or len(ci) != 2:
        return "N/A"
    return f"[{ci[0]:+.2%}, {ci[1]:+.2%}]"


def _render_breakdown_table(section_title: str, dim_label: str, groups: Mapping[str, Mapping[str, Any]]) -> list[str]:
    lines = [
        f"## {section_title}",
        "",
        f"| {dim_label} | Picks | Con Cierre | Sin Cierre | CLV% Medio | IC 95% CLV% | Significancia CLV | % CLV > 0 | ROI | IC 95% ROI | PnL (u) | Max DD (u) |",
        "| :--- | ---: | ---: | ---: | ---: | :---: | :---: | ---: | ---: | :---: | ---: | ---: |",
    ]
    if not groups:
        lines.append("| *(sin registros)* | 0 | 0 | 0 | N/A | N/A | no significativa | N/A | N/A | N/A | +0.00u | 0.00u |")
        lines.append("")
        return lines

    for key, g in groups.items():
        lines.append(
            f"| `{key}` | {g['n_picks']} | {g['n_with_closing']} | {g['n_closing_missing']} | "
            f"{_fmt_pct(g['clv_pct_mean'])} | {_fmt_ci(g['clv_pct_ci95'])} | {g['significance_label']} | "
            f"{_fmt_ratio(g['pct_picks_clv_positive'])} | {_fmt_pct(g['roi_pct'])} | {_fmt_ci(g['roi_pct_ci95'])} | "
            f"{g['total_pnl_u']:+.2f}u | {g['max_drawdown_u']:.2f}u |"
        )
    lines.append("")
    return lines


def generate_clv_markdown_report(
    summary: Mapping[str, Any],
    *,
    title: str = "Reporte de Auditoría de CLV y Liquidación de Picks",
) -> str:
    """Genera un documento Markdown completo a partir de la salida de `summarize_picks_bootstrap`."""
    meta = summary.get("meta", {})
    glob = summary["global"]

    lines: list[str] = [
        f"# {title}",
        "",
        f"- **Bootstrap:** `{meta.get('n_resamples', DEFAULT_BOOTSTRAP_RESAMPLES)}` remuestreos "
        f"(`PRNG={meta.get('prng', 'mulberry32')}`, `seed={meta.get('seed', DEFAULT_BOOTSTRAP_SEED)}`, "
        f"`IC={meta.get('ci_level', DEFAULT_BOOTSTRAP_CI_LEVEL):.0%}`)",
        f"- **Picks Totales:** `{glob['n_picks']}` (`{glob['n_with_closing']}` con cierre sharp válido, "
        f"`{glob['n_closing_missing']}` con `closing_missing`)",
        f"- **CLV% Global:** `{_fmt_pct(glob['clv_pct_mean'])}` (IC 95%: `{_fmt_ci(glob['clv_pct_ci95'])}` — **{glob['significance_label']}**)",
        f"- **CLV Probabilidad Global:** `{_fmt_pct(glob['clv_prob_mean'])}` (IC 95%: `{_fmt_ci(glob['clv_prob_ci95'])}`)",
        f"- **% Picks con CLV > 0:** `{_fmt_ratio(glob['pct_picks_clv_positive'])}`",
        f"- **ROI Global (`sum(pnl_u)/sum(stake_u)`):** `{_fmt_pct(glob['roi_pct'])}` "
        f"(IC 95%: `{_fmt_ci(glob['roi_pct_ci95'])}` — **{glob['roi_significance_label']}**)",
        f"- **PnL Acumulado / Max Drawdown:** `{glob['total_pnl_u']:+.2f}u` / `{glob['max_drawdown_u']:.2f}u`",
        "",
    ]

    lines.extend(_render_breakdown_table("1. Desglose por Liga (`league`)", "Liga", summary.get("by_league", {})))
    lines.extend(_render_breakdown_table("2. Desglose por Mercado (`market`)", "Mercado", summary.get("by_market", {})))
    lines.extend(_render_breakdown_table("3. Desglose por Nivel de Pick (`tier`)", "Tier", summary.get("by_tier", {})))
    lines.extend(_render_breakdown_table("4. Desglose por Casa (`book`)", "Casa", summary.get("by_book", {})))

    return "\n".join(lines).rstrip() + "\n"


# ---------------------------------------------------------------------------
# Interfaz de línea de comandos (CLI)
# ---------------------------------------------------------------------------


def _load_external_closings_or_settlements(path_str: str | None) -> pd.DataFrame | list[dict[str, Any]] | dict[str, Any] | None:
    if not path_str:
        return None
    p = Path(path_str)
    if not p.exists():
        raise FileNotFoundError(f"archivo no encontrado: {p}")
    suffix = p.suffix.lower()
    if suffix == ".parquet":
        return pd.read_parquet(p)
    if suffix == ".jsonl":
        rows = [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]
        return rows
    if suffix == ".json":
        return json.loads(p.read_text(encoding="utf-8"))
    raise LedgerValidationError(f"formato de archivo no soportado ({suffix}): se esperaba .parquet, .json o .jsonl")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Genera el reporte de CLV y liquidación con Bootstrap determinista sobre un ledger JSONL."
    )
    parser.add_argument("--ledger", required=True, help="Ruta al archivo JSONL del ledger inmutable de picks.")
    parser.add_argument(
        "--closings",
        default=None,
        help="Ruta opcional a cierres externos (.parquet de odds_snapshots o .json/.jsonl por pick_id).",
    )
    parser.add_argument(
        "--settlements",
        default=None,
        help="Ruta opcional a liquidaciones externas (.json/.jsonl por pick_id).",
    )
    parser.add_argument(
        "--out",
        required=True,
        help="Ruta de salida del reporte (.json o .md).",
    )
    parser.add_argument(
        "--n-resamples",
        type=int,
        default=DEFAULT_BOOTSTRAP_RESAMPLES,
        help=f"Número de remuestreos bootstrap (>= {MIN_BOOTSTRAP_RESAMPLES}, default={DEFAULT_BOOTSTRAP_RESAMPLES}).",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=DEFAULT_BOOTSTRAP_SEED,
        help=f"Semilla determinista mulberry32 (default={DEFAULT_BOOTSTRAP_SEED}).",
    )
    args = parser.parse_args(argv)

    ledger = load_ledger_jsonl(args.ledger)
    ext_closings = _load_external_closings_or_settlements(args.closings)
    ext_settlements = _load_external_closings_or_settlements(args.settlements)

    summary = summarize_picks_bootstrap(
        ledger,
        closings=ext_closings,
        settlements=ext_settlements,
        n_resamples=args.n_resamples,
        seed=args.seed,
    )

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.suffix.lower() in (".md", ".markdown"):
        content = generate_clv_markdown_report(summary)
        out_path.write_text(content, encoding="utf-8")
    else:
        out_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    return 0


if __name__ == "__main__":
    sys.exit(main())
