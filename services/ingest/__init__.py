"""Paquete de ingesta y normalización de snapshots de cuotas (A1 · Prediction Lab)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

__all__ = [
    "ALL_SNAPSHOT_COLUMNS",
    "AUXILIARY_COLUMNS",
    "DEDUP_KEY_COLUMNS",
    "GAP_GROUP_COLUMNS",
    "MAX_GAP_MINUTES",
    "MAX_OVERROUND",
    "MAX_PRICE_DECIMAL",
    "MIN_OVERROUND",
    "MIN_PRICE_DECIMAL",
    "REQUIRED_COLUMNS",
    "SHARP_BOOKS_SCRAPED_FALLBACK_ORDER",
    "build_odds_snapshots",
    "detect_snapshot_gaps",
    "devig_market_prices",
    "ingest_historical_fd",
    "ingest_scraped_ws",
    "is_valid_price_decimal",
    "resolve_closing_for_market",
    "resolve_closing_odds",
    "validate_and_deduplicate_snapshots",
]

if TYPE_CHECKING:
    from .odds_snapshots import (
        ALL_SNAPSHOT_COLUMNS,
        AUXILIARY_COLUMNS,
        DEDUP_KEY_COLUMNS,
        GAP_GROUP_COLUMNS,
        MAX_GAP_MINUTES,
        MAX_OVERROUND,
        MAX_PRICE_DECIMAL,
        MIN_OVERROUND,
        MIN_PRICE_DECIMAL,
        REQUIRED_COLUMNS,
        SHARP_BOOKS_SCRAPED_FALLBACK_ORDER,
        build_odds_snapshots,
        detect_snapshot_gaps,
        devig_market_prices,
        ingest_historical_fd,
        ingest_scraped_ws,
        is_valid_price_decimal,
        resolve_closing_for_market,
        resolve_closing_odds,
        validate_and_deduplicate_snapshots,
    )


def __getattr__(name: str) -> Any:
    if name in __all__:
        from . import odds_snapshots as _mod

        return getattr(_mod, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
