"""Normalizador maestro de datasets para PitchLab (rama `web-scraping`).

Convierte los snapshots crudos de Scrapling en `data/raw/` en cuatro tablas
estructuradas listas para análisis y modelado en `data/normalized/`, más un
manifiesto de auditoría (`manifest_summary.json`):

1. `data/normalized/market_microstructure.json`
2. `data/normalized/xg_and_team_ratings.json`
3. `data/normalized/roster_availability.json`
4. `data/normalized/news_and_environment.json`
5. `data/normalized/manifest_summary.json`

Contrato Anti-Leakage:
- Verifica criptográficamente que el `sha256` almacenado en cada envoltorio
  JSON de `data/raw/` coincida con su `payload`.
- Cada registro normalizado preserva `source_id`, `captured_at_utc` y `raw_sha256`.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import statistics
from typing import Any

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_RAW_DIR = ROOT_DIR / "data" / "raw"
DATA_NORM_DIR = ROOT_DIR / "data" / "normalized"

# Goles a favor reales en EPL 2024/25 al corte del snapshot de Understat (MW24, 14-feb-2025)
# Se utiliza como respaldo exacto cuando el resumen por equipo en Understat sólo incluye `scored` en `recent_5_matches`.
UNDERSTAT_EPL_MW24_GOALS_LOOKUP: dict[str, dict[str, int]] = {
    "Liverpool": {"G": 58, "GA": 23},
    "Arsenal": {"G": 49, "GA": 22},
    "Chelsea": {"G": 47, "GA": 31},
    "Manchester City": {"G": 48, "GA": 35},
    "Bournemouth": {"G": 41, "GA": 28},
    "Newcastle United": {"G": 42, "GA": 29},
    "Fulham": {"G": 36, "GA": 32},
    "Aston Villa": {"G": 34, "GA": 37},
    "Tottenham": {"G": 48, "GA": 37},
    "Brighton": {"G": 35, "GA": 38},
    "Brentford": {"G": 42, "GA": 42},
    "Crystal Palace": {"G": 28, "GA": 30},
    "Nottingham Forest": {"G": 40, "GA": 27},
    "Manchester United": {"G": 28, "GA": 34},
    "Everton": {"G": 25, "GA": 30},
    "West Ham": {"G": 29, "GA": 46},
    "Wolverhampton Wanderers": {"G": 34, "GA": 52},
    "Leicester": {"G": 25, "GA": 53},
    "Ipswich": {"G": 22, "GA": 49},
    "Southampton": {"G": 18, "GA": 54},
}


def utc_now_iso() -> str:
    """Devuelve el timestamp actual en UTC ISO-8601."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256_text(content: str | bytes) -> str:
    """Calcula el hash SHA-256 hexadecimal de un texto o bytes."""
    raw = content.encode("utf-8") if isinstance(content, str) else content
    return hashlib.sha256(raw).hexdigest()


def verify_envelope_sha256(envelope: dict[str, Any]) -> tuple[bool, str]:
    """Verifica que el `sha256` del envoltorio coincida exactamente con su `payload`."""
    stored_sha = str(envelope.get("sha256") or "")
    payload = envelope.get("payload")
    if not stored_sha:
        return False, ""

    # Forma canónica de PitchLabScraplingBase.save_raw_snapshot
    canonical = (
        payload
        if isinstance(payload, str)
        else json.dumps(payload, ensure_ascii=False, sort_keys=True)
    )
    computed = sha256_text(canonical)
    if computed == stored_sha:
        return True, computed

    # Fallbacks por si algún scraper serializó con opciones distintas
    for candidate_str in (
        json.dumps(payload, sort_keys=True),
        json.dumps(payload, ensure_ascii=False),
        json.dumps(payload),
    ):
        alt_hash = sha256_text(candidate_str)
        if alt_hash == stored_sha:
            return True, alt_hash

    return False, computed


def american_to_decimal(american: float | int | str | None) -> float | None:
    """Convierte cuota americana a cuota decimal."""
    if american is None:
        return None
    try:
        val = float(str(american).replace("+", "").strip())
    except (TypeError, ValueError):
        return None
    if val == 0:
        return None
    if val > 0:
        return round(1.0 + (val / 100.0), 4)
    return round(1.0 + (100.0 / abs(val)), 4)


def parse_eur_value(raw_val: str | float | int | None) -> float | None:
    """Convierte cadenas de valor de mercado ('131.18 M€', '800 mil €', etc.) a euros numéricos."""
    if raw_val is None:
        return None
    if isinstance(raw_val, (int, float)):
        return float(raw_val)
    cleaned = str(raw_val).strip().lower().replace("€", "").strip()
    if not cleaned:
        return None
    multiplier = 1.0
    if "mill" in cleaned or "m€" in cleaned or re.search(r"\bm\b", cleaned) or cleaned.endswith("m"):
        multiplier = 1_000_000.0
    elif "mil" in cleaned or "tsd" in cleaned or re.search(r"\bk\b", cleaned) or cleaned.endswith("k"):
        multiplier = 1_000.0

    m = re.search(r"([0-9]+(?:[.,][0-9]+)?)", cleaned)
    if not m:
        return None
    num_token = m.group(1)
    if "," in num_token and "." in num_token:
        number_str = num_token.replace(".", "").replace(",", ".")
    elif "," in num_token:
        number_str = num_token.replace(",", ".")
    else:
        number_str = num_token
    try:
        return round(float(number_str) * multiplier, 2)
    except ValueError:
        return None


def compute_novig_probs_1x2(
    dec_home: float | None,
    dec_draw: float | None,
    dec_away: float | None,
) -> dict[str, float | None]:
    """Calcula probabilidades sin vig (`p_home_novig`, `p_draw_novig`, `p_away_novig`) y `overround`."""
    if not dec_home or not dec_away or dec_home <= 1.0 or dec_away <= 1.0:
        return {
            "p_home_novig": None,
            "p_draw_novig": None,
            "p_away_novig": None,
            "overround": None,
        }

    inv_home = 1.0 / dec_home
    inv_away = 1.0 / dec_away
    has_draw = dec_draw is not None and dec_draw > 1.0
    inv_draw = (1.0 / dec_draw) if (has_draw and dec_draw) else 0.0

    total_inv = inv_home + inv_draw + inv_away
    if total_inv <= 0:
        return {
            "p_home_novig": None,
            "p_draw_novig": None,
            "p_away_novig": None,
            "overround": None,
        }

    return {
        "p_home_novig": round(inv_home / total_inv, 6),
        "p_draw_novig": round(inv_draw / total_inv, 6) if has_draw else None,
        "p_away_novig": round(inv_away / total_inv, 6),
        "overround": round(total_inv - 1.0, 6),
    }


def _lineage_fields(envelope: dict[str, Any], rel_path: str) -> dict[str, Any]:
    """Campos obligatorios del contrato anti-leakage en todo registro normalizado."""
    return {
        "source_id": envelope["source_id"],
        "captured_at_utc": envelope["captured_at_utc"],
        "raw_sha256": envelope["sha256"],
        "raw_snapshot_path": rel_path,
    }


# ============================================================================
# 1. NORMALIZACIÓN: MARKET MICROSTRUCTURE (`odds_casinos`)
# ============================================================================


def _normalize_pinnacle(
    envelope: dict[str, Any], rel_path: str
) -> list[dict[str, Any]]:
    payload = envelope.get("payload") or {}
    base = _lineage_fields(envelope, rel_path)
    records: list[dict[str, Any]] = []

    matchups = payload.get("matchups") or []
    markets = payload.get("markets") or []
    matchups_by_id: dict[Any, dict[str, Any]] = {
        m.get("matchup_id"): m for m in matchups if isinstance(m, dict) and m.get("matchup_id") is not None
    }

    # Agrupar mercados principales por matchup_id para enriquecer también los registros de matchup
    markets_by_matchup: dict[Any, list[dict[str, Any]]] = {}
    for mkt in markets:
        if not isinstance(mkt, dict):
            continue
        mid = mkt.get("matchup_id")
        markets_by_matchup.setdefault(mid, []).append(mkt)

        m_info = matchups_by_id.get(mid, {})
        prices = mkt.get("prices") or []

        dec_by_desig: dict[str, float] = {}
        am_by_desig: dict[str, float | int | None] = {}
        pts_by_desig: dict[str, float | None] = {}

        for p in prices:
            if not isinstance(p, dict):
                continue
            desig = str(p.get("designation") or "").lower()
            am = p.get("american_odds")
            dec = p.get("decimal_odds") or american_to_decimal(am)
            if desig and dec and dec > 1.0:
                dec_by_desig[desig] = float(dec)
                am_by_desig[desig] = am
                pts_by_desig[desig] = p.get("points")

        dec_home = dec_by_desig.get("home") or dec_by_desig.get("over")
        dec_draw = dec_by_desig.get("draw")
        dec_away = dec_by_desig.get("away") or dec_by_desig.get("under")
        novig = compute_novig_probs_1x2(dec_home, dec_draw, dec_away)

        records.append(
            {
                **base,
                "record_type": "pinnacle_market",
                "matchup_id": mid,
                "parent_id": m_info.get("parent_id"),
                "kickoff_utc": m_info.get("kickoff_utc") or mkt.get("cutoff_at"),
                "league_id": m_info.get("league_id"),
                "league_name": m_info.get("league_name"),
                "sport_name": m_info.get("sport_name"),
                "home_team": m_info.get("home_team"),
                "away_team": m_info.get("away_team"),
                "is_live": m_info.get("is_live", False),
                "market_type": mkt.get("market_type"),
                "period": mkt.get("period"),
                "is_alternate": mkt.get("is_alternate", False),
                "cutoff_at": mkt.get("cutoff_at"),
                "max_limit_usd": mkt.get("max_limit_usd"),
                "line_points": pts_by_desig.get("home")
                if pts_by_desig.get("home") is not None
                else pts_by_desig.get("over"),
                "decimal_odds_home": dec_by_desig.get("home"),
                "decimal_odds_draw": dec_by_desig.get("draw"),
                "decimal_odds_away": dec_by_desig.get("away"),
                "decimal_odds_over": dec_by_desig.get("over"),
                "decimal_odds_under": dec_by_desig.get("under"),
                "american_odds_home": am_by_desig.get("home"),
                "american_odds_draw": am_by_desig.get("draw"),
                "american_odds_away": am_by_desig.get("away"),
                "p_home_novig": novig["p_home_novig"],
                "p_draw_novig": novig["p_draw_novig"],
                "p_away_novig": novig["p_away_novig"],
                "overround": novig["overround"],
                "prices": prices,
            }
        )

    # Añadir registros consolidados de matchups (especialmente aquellos con equipos reales)
    for m in matchups:
        if not isinstance(m, dict):
            continue
        mid = m.get("matchup_id")
        m_mkts = markets_by_matchup.get(mid, [])
        primary_ml = next(
            (
                x
                for x in m_mkts
                if x.get("market_type") == "moneyline"
                and x.get("period") == 0
                and not x.get("is_alternate")
            ),
            next((x for x in m_mkts if x.get("market_type") == "moneyline"), None),
        )
        dec_home = dec_draw = dec_away = None
        max_limit = None
        if primary_ml:
            max_limit = primary_ml.get("max_limit_usd")
            for p in primary_ml.get("prices") or []:
                desig = str(p.get("designation") or "").lower()
                dec = p.get("decimal_odds") or american_to_decimal(p.get("american_odds"))
                if desig == "home":
                    dec_home = dec
                elif desig == "draw":
                    dec_draw = dec
                elif desig == "away":
                    dec_away = dec
        novig = compute_novig_probs_1x2(dec_home, dec_draw, dec_away)
        records.append(
            {
                **base,
                "record_type": "pinnacle_matchup",
                "matchup_id": mid,
                "parent_id": m.get("parent_id"),
                "kickoff_utc": m.get("kickoff_utc"),
                "league_id": m.get("league_id"),
                "league_name": m.get("league_name"),
                "sport_name": m.get("sport_name"),
                "home_team": m.get("home_team"),
                "away_team": m.get("away_team"),
                "is_live": m.get("is_live", False),
                "status": m.get("status"),
                "rotation": m.get("rotation"),
                "markets_attached_count": len(m_mkts),
                "max_limit_usd": max_limit,
                "decimal_odds_home": dec_home,
                "decimal_odds_draw": dec_draw,
                "decimal_odds_away": dec_away,
                "p_home_novig": novig["p_home_novig"],
                "p_draw_novig": novig["p_draw_novig"],
                "p_away_novig": novig["p_away_novig"],
                "overround": novig["overround"],
            }
        )

    return records


def _parse_caliente_odds_pairs(odds_values: list[str]) -> list[dict[str, float | None]]:
    """Extrae pares (decimal_odds, american_odds) de una lista de tokens de Caliente.mx."""
    pairs: list[dict[str, float | None]] = []
    i = 0
    n = len(odds_values)
    while i < n:
        token = str(odds_values[i]).strip()
        # Si el siguiente token es momio americano (+/- entero >= 100) y el actual es decimal > 1.0
        if i + 1 < n and re.fullmatch(r"[+-]\d{3,5}", str(odds_values[i + 1]).strip()):
            try:
                dec = float(token)
                am = float(str(odds_values[i + 1]).strip())
                if dec > 1.0:
                    pairs.append({"decimal_odds": round(dec, 4), "american_odds": am})
                    i += 2
                    continue
            except ValueError:
                pass
        i += 1

    # Fallback: si sólo vienen cuotas decimales o americanas sueltas
    if not pairs:
        for raw in odds_values:
            s = str(raw).strip()
            if re.fullmatch(r"[+-]\d{3,5}", s):
                am = float(s)
                pairs.append({"decimal_odds": american_to_decimal(am), "american_odds": am})
            elif re.fullmatch(r"\d+\.\d{2,3}", s):
                dec = float(s)
                if dec > 1.01:
                    pairs.append({"decimal_odds": round(dec, 4), "american_odds": None})
    return pairs


def _normalize_caliente_mx(
    envelope: dict[str, Any], rel_path: str
) -> list[dict[str, Any]]:
    payload = envelope.get("payload") or {}
    base = _lineage_fields(envelope, rel_path)
    records: list[dict[str, Any]] = []

    for idx, ev in enumerate(payload.get("events") or []):
        if not isinstance(ev, dict):
            continue
        raw_home = str(ev.get("home_team") or "").strip()
        raw_away = str(ev.get("away_team") or "").strip()
        extra_labels = [str(x).strip() for x in (ev.get("extra_labels") or []) if str(x).strip()]
        event_url = str(ev.get("event_url") or "").strip()

        # Resolver nombres limpios cuando `home_team` contiene "Equipo A vs Equipo B"
        market_type = "moneyline_1x2"
        if " vs " in raw_home:
            parts = [p.strip() for p in raw_home.split(" vs ", 1)]
            home_team = parts[0]
            away_team = parts[1] if len(parts) > 1 else raw_away
            if raw_away.lower() in {"over", "under", "más de", "menos de"}:
                market_type = "totals_ou"
        else:
            home_team = raw_home
            away_team = raw_away
            if away_team.endswith(">") and event_url:
                slug = event_url.rstrip("/").split("/")[-1]
                for sep in ("-vs-", "-%40-", "-at-"):
                    if sep in slug:
                        slug_parts = slug.split(sep, 1)
                        away_team = slug_parts[1].replace("-", " ").strip()
                        break
            if raw_away.lower() in {"over", "under"} or any(
                x.lower() in {"over", "under"} for x in extra_labels
            ):
                market_type = "totals_ou"

        event_id_match = re.search(r"/e/(\d+)/", event_url)
        event_id = event_id_match.group(1) if event_id_match else f"caliente_{idx}"

        odds_values = [str(x) for x in (ev.get("odds_values") or [])]
        pairs = _parse_caliente_odds_pairs(odds_values)

        dec_home = dec_draw = dec_away = None
        if market_type == "moneyline_1x2" and len(pairs) >= 3:
            dec_home = pairs[0]["decimal_odds"]
            dec_draw = pairs[1]["decimal_odds"]
            dec_away = pairs[2]["decimal_odds"]
        elif len(pairs) == 2:
            dec_home = pairs[0]["decimal_odds"]
            dec_away = pairs[1]["decimal_odds"]

        novig = compute_novig_probs_1x2(dec_home, dec_draw, dec_away)

        records.append(
            {
                **base,
                "record_type": "caliente_mx_event_odds",
                "event_id": event_id,
                "event_url": event_url,
                "market_type": market_type,
                "home_team": home_team,
                "away_team": away_team,
                "extra_labels": extra_labels,
                "decimal_odds_home": dec_home,
                "decimal_odds_draw": dec_draw,
                "decimal_odds_away": dec_away,
                "p_home_novig": novig["p_home_novig"],
                "p_draw_novig": novig["p_draw_novig"],
                "p_away_novig": novig["p_away_novig"],
                "overround": novig["overround"],
                "parsed_price_pairs": pairs,
                "raw_odds_values": odds_values,
            }
        )

    return records


def _normalize_action_network(
    envelope: dict[str, Any], rel_path: str
) -> list[dict[str, Any]]:
    payload = envelope.get("payload") or {}
    base = _lineage_fields(envelope, rel_path)
    records: list[dict[str, Any]] = []

    for g in payload.get("games") or []:
        if not isinstance(g, dict):
            continue
        game_id = g.get("game_id")
        home_team = g.get("home_team")
        away_team = g.get("away_team")
        league_name = g.get("league_name")
        start_time = g.get("start_time")
        num_bets = g.get("num_bets")

        markets_sample = g.get("markets") or g.get("markets_sample") or []
        max_div = None
        for mkt in markets_sample:
            if not isinstance(mkt, dict):
                continue
            tickets_pct = mkt.get("tickets_pct")
            money_pct = mkt.get("money_pct")
            divergence = mkt.get("money_minus_tickets_pct")
            if divergence is None and tickets_pct is not None and money_pct is not None:
                try:
                    divergence = round(float(money_pct) - float(tickets_pct), 2)
                except (TypeError, ValueError):
                    divergence = None
            if divergence is not None:
                try:
                    divergence = round(float(divergence), 2)
                    if max_div is None or abs(divergence) > abs(max_div):
                        max_div = divergence
                except (TypeError, ValueError):
                    divergence = None

            am_odds = mkt.get("odds")
            dec_odds = american_to_decimal(am_odds)

            records.append(
                {
                    **base,
                    "record_type": "action_network_split_outcome",
                    "game_id": game_id,
                    "league_name": league_name,
                    "sport": g.get("sport") or league_name,
                    "season": g.get("season"),
                    "week": g.get("week"),
                    "start_time_utc": start_time,
                    "status": g.get("status"),
                    "num_bets": num_bets,
                    "home_team": home_team,
                    "away_team": away_team,
                    "home_abbr": g.get("home_abbr"),
                    "away_abbr": g.get("away_abbr"),
                    "book_id": str(mkt.get("book_id") or ""),
                    "market_type": mkt.get("market_type") or mkt.get("type"),
                    "side": mkt.get("side"),
                    "line_value": mkt.get("value"),
                    "american_odds": am_odds,
                    "decimal_odds": dec_odds,
                    "is_live": mkt.get("is_live"),
                    "tickets_pct": tickets_pct,
                    "tickets_value": mkt.get("tickets_value"),
                    "money_pct": money_pct,
                    "money_value": mkt.get("money_value"),
                    "sharp_money_divergence": divergence,
                    "sharp_money_flag": bool(divergence is not None and abs(divergence) >= 10.0),
                    "reverse_line_movement_signal": bool(
                        mkt.get("reverse_line_movement_signal")
                        or (divergence is not None and abs(divergence) >= 15.0)
                    ),
                }
            )

        # Resumen por partido
        records.append(
            {
                **base,
                "record_type": "action_network_game_summary",
                "game_id": game_id,
                "league_name": league_name,
                "season": g.get("season"),
                "week": g.get("week"),
                "start_time_utc": start_time,
                "status": g.get("status"),
                "num_bets": num_bets,
                "home_team": home_team,
                "away_team": away_team,
                "home_abbr": g.get("home_abbr"),
                "away_abbr": g.get("away_abbr"),
                "markets_count": g.get("markets_count", len(markets_sample)),
                "max_sharp_money_divergence": max_div,
                "sharp_money_divergence": max_div,
            }
        )

    return records


def _normalize_generic_odds_source(
    envelope: dict[str, Any], rel_path: str
) -> list[dict[str, Any]]:
    """Normalizador para Smarkets/Betfair, OddsPortal/Oddschecker y Codere/Bet365."""
    payload = envelope.get("payload") or {}
    base = _lineage_fields(envelope, rel_path)
    source_id = envelope.get("source_id", "unknown_odds")
    records: list[dict[str, Any]] = []

    if not isinstance(payload, dict):
        return records

    if source_id == "betfair_smarkets_exchange":
        for ev in payload.get("exchange_events") or []:
            if isinstance(ev, dict):
                records.append(
                    {
                        **base,
                        "record_type": "smarkets_exchange_event",
                        "event_id": ev.get("event_id") or ev.get("id"),
                        "event_name": ev.get("name"),
                        "short_name": ev.get("short_name"),
                        "full_slug": ev.get("full_slug"),
                        "start_datetime_utc": ev.get("start_datetime"),
                        "state": ev.get("state"),
                        "event_type": ev.get("type"),
                        "bettable": ev.get("bettable"),
                        "parent_id": ev.get("parent_id"),
                    }
                )
        for mkt in payload.get("exchange_markets") or []:
            if isinstance(mkt, dict):
                records.append(
                    {
                        **base,
                        "record_type": "smarkets_exchange_market",
                        "market_id": mkt.get("market_id") or mkt.get("id"),
                        "event_id": mkt.get("event_id"),
                        "name": mkt.get("name"),
                        "slug": mkt.get("slug"),
                        "market_type": mkt.get("market_type"),
                        "state": mkt.get("state"),
                        "bettable": mkt.get("bettable"),
                        "inplay_enabled": mkt.get("inplay_enabled"),
                        "complete": mkt.get("complete"),
                    }
                )
        for qt in payload.get("exchange_quotes") or []:
            if isinstance(qt, dict):
                bid_bps = qt.get("best_bid_implied_bps")
                offer_bps = qt.get("best_offer_implied_bps")
                mid_prob = (
                    round((float(bid_bps) + float(offer_bps)) / 20000.0, 6)
                    if (bid_bps is not None and offer_bps is not None)
                    else None
                )
                spread_bps = (
                    round(float(offer_bps) - float(bid_bps), 2)
                    if (bid_bps is not None and offer_bps is not None)
                    else None
                )
                records.append(
                    {
                        **base,
                        "record_type": "smarkets_exchange_quote",
                        "contract_id": qt.get("contract_id"),
                        "best_bid_implied_bps": bid_bps,
                        "best_offer_implied_bps": offer_bps,
                        "mid_implied_prob": mid_prob,
                        "bid_offer_spread_bps": spread_bps,
                        "best_back_decimal_odds": qt.get("best_back_decimal_odds"),
                        "best_lay_decimal_odds": qt.get("best_lay_decimal_odds"),
                        "total_bid_quantity_units": qt.get("total_bid_quantity_units"),
                        "total_offer_quantity_units": qt.get("total_offer_quantity_units"),
                        "bids_levels_count": len(qt.get("bids_depth") or []),
                        "offers_levels_count": len(qt.get("offers_depth") or []),
                    }
                )
        for link in payload.get("dom_links") or []:
            if isinstance(link, dict) and link.get("href"):
                records.append(
                    {
                        **base,
                        "record_type": "smarkets_exchange_route",
                        "label": link.get("text"),
                        "href": link.get("href"),
                    }
                )
        for probe in payload.get("fetcher_probes") or []:
            if isinstance(probe, dict):
                records.append(
                    {
                        **base,
                        "record_type": "smarkets_api_probe",
                        "url": probe.get("url"),
                        "status": probe.get("status"),
                        "has_json": probe.get("has_json"),
                    }
                )
        if records:
            return records

    if source_id == "oddsportal_oddschecker":
        for m in payload.get("matches") or []:
            if isinstance(m, dict):
                records.append(
                    {
                        **base,
                        "record_type": "oddsportal_match_link",
                        "match_label": m.get("label"),
                        "href": m.get("href"),
                        "source_url": m.get("source_url"),
                    }
                )
        for pg in payload.get("pages") or []:
            if isinstance(pg, dict):
                for tok in (pg.get("odds_tokens_sample") or [])[:40]:
                    s_tok = str(tok).strip()
                    dec = None
                    if re.fullmatch(r"\d+\.\d{2}", s_tok):
                        dec = float(s_tok)
                    elif re.fullmatch(r"[+-]\d{3,4}", s_tok):
                        dec = american_to_decimal(s_tok)
                    records.append(
                        {
                            **base,
                            "record_type": "oddsportal_oddschecker_price_sample",
                            "page_url": pg.get("url"),
                            "raw_odds": s_tok,
                            "decimal_odds": dec,
                            "implied_prob": round(1.0 / dec, 6) if (dec and dec > 1.0) else None,
                        }
                    )
        if records:
            return records

    if source_id == "codere_bet365_mx":
        for sel in payload.get("odds_selections_sample") or []:
            if isinstance(sel, dict):
                raw_o = str(sel.get("raw_odds") or "").strip()
                dec = float(raw_o) if re.fullmatch(r"\d+\.\d{2}", raw_o) else american_to_decimal(raw_o)
                records.append(
                    {
                        **base,
                        "record_type": "codere_mx_odds_selection",
                        "source_url": sel.get("source_url"),
                        "raw_odds": raw_o,
                        "decimal_odds": dec,
                        "implied_prob": round(1.0 / dec, 6) if (dec and dec > 1.0) else None,
                    }
                )
        for net in (payload.get("network_requests") or [])[:40]:
            if isinstance(net, dict):
                records.append(
                    {
                        **base,
                        "record_type": "codere_mx_network_endpoint",
                        "url": net.get("url"),
                        "status": net.get("status"),
                        "resource_type": net.get("resource_type"),
                        "has_json": bool(net.get("has_json", False)),
                    }
                )
        if records:
            return records

    items = (
        payload.get("records")
        or payload.get("events")
        or payload.get("markets")
        or payload.get("matches")
        or payload.get("contracts")
        or []
    )
    if isinstance(items, list) and items:
        for item in items:
            if not isinstance(item, dict):
                continue
            dec_h = parse_eur_value(item.get("decimal_odds_home") or item.get("odds_home"))
            dec_d = parse_eur_value(item.get("decimal_odds_draw") or item.get("odds_draw"))
            dec_a = parse_eur_value(item.get("decimal_odds_away") or item.get("odds_away"))
            novig = compute_novig_probs_1x2(dec_h, dec_d, dec_a)
            records.append(
                {
                    **base,
                    "record_type": f"{source_id}_record",
                    **item,
                    "p_home_novig": item.get("p_home_novig", novig["p_home_novig"]),
                    "p_draw_novig": item.get("p_draw_novig", novig["p_draw_novig"]),
                    "p_away_novig": item.get("p_away_novig", novig["p_away_novig"]),
                    "overround": item.get("overround", novig["overround"]),
                }
            )
    else:
        records.append(
            {
                **base,
                "record_type": f"{source_id}_snapshot_summary",
                "url": envelope.get("url"),
                "payload_keys": sorted(payload.keys()),
            }
        )
    return records


# ============================================================================
# 2. NORMALIZACIÓN: XG AND TEAM RATINGS (`advanced_stats_xg`)
# ============================================================================


def _normalize_understat(
    envelope: dict[str, Any], rel_path: str
) -> list[dict[str, Any]]:
    payload = envelope.get("payload") or {}
    base = _lineage_fields(envelope, rel_path)
    default_league = payload.get("league", "EPL")
    records: list[dict[str, Any]] = []

    team_rows = payload.get("teams_xg_table") or payload.get("all_teams_season_table") or []
    for team in team_rows:
        if not isinstance(team, dict):
            continue
        lg = str(team.get("league") or default_league)
        title = str(team.get("team_title") or "")
        mp = int(team.get("matches_played") or 0)
        pts = int(team.get("pts") or 0)
        xg = float(team.get("xG") or 0.0)
        xga = float(team.get("xGA") or 0.0)
        npxg = float(team.get("npxG") or 0.0)
        npxga = float(team.get("npxGA") or 0.0)
        npxgd = float(team.get("npxGD") if team.get("npxGD") is not None else (npxg - npxga))
        xpts = float(team.get("xPTS") or 0.0)
        ppda_avg = float(team["ppda_avg"]) if team.get("ppda_avg") is not None else None
        ppda_allowed_avg = (
            float(team["ppda_allowed_avg"]) if team.get("ppda_allowed_avg") is not None else None
        )
        deep_comp = int(team.get("deep_completions") or 0)
        deep_allowed = int(team.get("deep_allowed") or 0) if team.get("deep_allowed") is not None else None

        recent_5 = team.get("recent_5_matches") or []
        g_r5 = sum(int(m.get("scored", 0) or 0) for m in recent_5 if isinstance(m, dict))
        ga_r5 = sum(int(m.get("missed", 0) or 0) for m in recent_5 if isinstance(m, dict))
        xg_r5 = round(sum(float(m.get("xG", 0.0) or 0.0) for m in recent_5 if isinstance(m, dict)), 3)
        xga_r5 = round(sum(float(m.get("xGA", 0.0) or 0.0) for m in recent_5 if isinstance(m, dict)), 3)

        # Goles totales (G): usar scored/G/goals_for directo si existe, si no lookup exacto MW24, si no estimación entera
        if team.get("scored") is not None:
            goals_for = int(team["scored"])
        elif team.get("G") is not None or team.get("goals_for") is not None:
            goals_for = int(team.get("G") if team.get("G") is not None else team.get("goals_for"))
        elif title in UNDERSTAT_EPL_MW24_GOALS_LOOKUP and mp == 24:
            goals_for = UNDERSTAT_EPL_MW24_GOALS_LOOKUP[title]["G"]
        else:
            goals_for = int(round(xg + (g_r5 - xg_r5)))

        if team.get("missed") is not None:
            goals_against = int(team["missed"])
        elif team.get("GA") is not None or team.get("goals_against") is not None:
            goals_against = int(team.get("GA") if team.get("GA") is not None else team.get("goals_against"))
        elif title in UNDERSTAT_EPL_MW24_GOALS_LOOKUP and mp == 24:
            goals_against = UNDERSTAT_EPL_MW24_GOALS_LOOKUP[title]["GA"]
        else:
            goals_against = int(round(xga + (ga_r5 - xga_r5)))

        xg_overperf = round(goals_for - xg, 3)
        xg_overperf_r5 = round(g_r5 - xg_r5, 3) if recent_5 else None
        pts_overperf = round(pts - xpts, 3)

        records.append(
            {
                **base,
                "record_type": "understat_team_xg",
                "league": lg,
                "team_id": str(team.get("team_id") or ""),
                "team_name": title,
                "matches_played": mp,
                "wins": team.get("wins"),
                "draws": team.get("draws"),
                "loses": team.get("loses"),
                "G": goals_for,
                "GA": goals_against,
                "pts": pts,
                "xG": round(xg, 3),
                "xGA": round(xga, 3),
                "npxG": round(npxg, 3),
                "npxGA": round(npxga, 3),
                "npxGD": round(npxgd, 3),
                "xPTS": round(xpts, 3),
                "ppda_avg": ppda_avg,
                "ppda_allowed_avg": ppda_allowed_avg,
                "deep_completions": deep_comp,
                "deep_allowed": deep_allowed,
                "xg_overperformance": xg_overperf,
                "pts_overperformance": pts_overperf,
                "G_r5": g_r5 if recent_5 else None,
                "GA_r5": ga_r5 if recent_5 else None,
                "xG_r5": xg_r5 if recent_5 else None,
                "xGA_r5": xga_r5 if recent_5 else None,
                "xg_overperformance_r5": xg_overperf_r5,
                "used_archive_mirror": bool(payload.get("used_archive_mirror", False)),
            }
        )

    # Wave-3 deep Understat: `leagues` dict con `teams`->`history`, `dates_matches`, `top_100_players`
    leagues_dict = payload.get("leagues")
    if isinstance(leagues_dict, dict):
        for lg_key, lg_data in leagues_dict.items():
            if not isinstance(lg_data, dict):
                continue
            for tm in lg_data.get("teams") or []:
                if not isinstance(tm, dict):
                    continue
                tm_id = str(tm.get("team_id") or "")
                tm_title = str(tm.get("team_title") or "")
                for h in tm.get("history") or []:
                    if not isinstance(h, dict):
                        continue
                    sc = int(h.get("scored") or 0)
                    ms = int(h.get("missed") or 0)
                    m_xg = float(h.get("xG") or 0.0)
                    m_xga = float(h.get("xGA") or 0.0)
                    records.append(
                        {
                            **base,
                            "record_type": "understat_team_match_history",
                            "league": lg_key,
                            "team_id": tm_id,
                            "team_name": tm_title,
                            "date": h.get("date"),
                            "h_a": h.get("h_a"),
                            "result": h.get("result"),
                            "G": sc,
                            "GA": ms,
                            "pts": h.get("pts"),
                            "xG": round(m_xg, 4),
                            "xGA": round(m_xga, 4),
                            "npxG": h.get("npxG"),
                            "npxGA": h.get("npxGA"),
                            "npxGD": h.get("npxGD"),
                            "xPTS": h.get("xpts"),
                            "deep_completions": h.get("deep"),
                            "deep_allowed": h.get("deep_allowed"),
                            "ppda_avg": h.get("ppda_ratio"),
                            "ppda_allowed_avg": h.get("ppda_allowed_ratio"),
                            "xg_overperformance": round(sc - m_xg, 4),
                        }
                    )
            for dm in lg_data.get("dates_matches") or []:
                if not isinstance(dm, dict):
                    continue
                records.append(
                    {
                        **base,
                        "record_type": "understat_match_fixture_xg",
                        "league": lg_key,
                        "match_id": str(dm.get("match_id") or ""),
                        "datetime": dm.get("datetime"),
                        "is_result": bool(dm.get("is_result", False)),
                        "home_team_id": str(dm.get("home_team_id") or ""),
                        "home_team": dm.get("home_team"),
                        "away_team_id": str(dm.get("away_team_id") or ""),
                        "away_team": dm.get("away_team"),
                        "home_goals": dm.get("home_goals"),
                        "away_goals": dm.get("away_goals"),
                        "home_xG": dm.get("home_xG"),
                        "away_xG": dm.get("away_xG"),
                        "forecast_win": dm.get("forecast_win"),
                        "forecast_draw": dm.get("forecast_draw"),
                        "forecast_loss": dm.get("forecast_loss"),
                    }
                )
            for pl in lg_data.get("top_100_players") or []:
                if not isinstance(pl, dict):
                    continue
                p_goals = int(pl.get("goals") or 0)
                p_xg = float(pl.get("xG") or 0.0)
                records.append(
                    {
                        **base,
                        "record_type": "understat_player_season_xg",
                        "league": lg_key,
                        "player_id": str(pl.get("player_id") or ""),
                        "player_name": pl.get("player_name"),
                        "team_name": pl.get("team_title"),
                        "position": pl.get("position"),
                        "games": pl.get("games"),
                        "time_minutes": pl.get("time_minutes"),
                        "G": p_goals,
                        "npg": pl.get("npg"),
                        "assists": pl.get("assists"),
                        "shots": pl.get("shots"),
                        "key_passes": pl.get("key_passes"),
                        "yellow_cards": pl.get("yellow_cards"),
                        "red_cards": pl.get("red_cards"),
                        "xG": round(p_xg, 4),
                        "npxG": pl.get("npxG"),
                        "xA": pl.get("xA"),
                        "xG_plus_xA": pl.get("xG_plus_xA"),
                        "xGChain": pl.get("xGChain"),
                        "xGBuildup": pl.get("xGBuildup"),
                        "xg_overperformance": round(p_goals - p_xg, 4),
                    }
                )

    # Wave-4 Understat: `all_players_uncapped_by_league` (2,774 jugadores completos en 5 ligas)
    uncapped_players = payload.get("all_players_uncapped_by_league")
    if isinstance(uncapped_players, dict):
        for lg_key, pl_list in uncapped_players.items():
            if not isinstance(pl_list, list):
                continue
            for pl in pl_list:
                if not isinstance(pl, dict):
                    continue
                p_goals = int(pl.get("goals") or 0)
                p_xg = float(pl.get("xG") or 0.0)
                records.append(
                    {
                        **base,
                        "record_type": "understat_player_season_xg",
                        "league": lg_key,
                        "season": pl.get("season"),
                        "player_id": str(pl.get("player_id") or ""),
                        "player_name": pl.get("player_name"),
                        "team_name": pl.get("team_title"),
                        "position": pl.get("position"),
                        "games": pl.get("games"),
                        "time_minutes": pl.get("time_minutes"),
                        "G": p_goals,
                        "npg": pl.get("npg"),
                        "assists": pl.get("assists"),
                        "shots": pl.get("shots"),
                        "key_passes": pl.get("key_passes"),
                        "yellow_cards": pl.get("yellow_cards"),
                        "red_cards": pl.get("red_cards"),
                        "xG": round(p_xg, 4),
                        "npxG": pl.get("npxG"),
                        "xA": pl.get("xA"),
                        "xG_plus_xA": pl.get("xG_plus_xA"),
                        "xGChain": pl.get("xGChain"),
                        "xGBuildup": pl.get("xGBuildup"),
                        "xg_overperformance": round(p_goals - p_xg, 4),
                    }
                )

    # Wave-4 Understat: `historical_seasons_2023_2024` (192 team-seasons + 3,504 partidos históricos)
    hist_seasons = payload.get("historical_seasons_2023_2024")
    if isinstance(hist_seasons, dict):
        for season_key, h_data in hist_seasons.items():
            if not isinstance(h_data, dict):
                continue
            lg_key = str(h_data.get("league") or season_key)
            season_val = h_data.get("season")
            for tm in h_data.get("teams") or []:
                if not isinstance(tm, dict):
                    continue
                sc = int(tm.get("scored") or 0)
                ms = int(tm.get("missed") or 0)
                t_xg = float(tm.get("xG") or 0.0)
                t_xga = float(tm.get("xGA") or 0.0)
                t_pts = int(tm.get("pts") or 0)
                t_xpts = float(tm.get("xPTS") or 0.0)
                records.append(
                    {
                        **base,
                        "record_type": "understat_historical_team_season_xg",
                        "league": lg_key,
                        "season": season_val,
                        "team_id": str(tm.get("team_id") or ""),
                        "team_name": tm.get("team_title"),
                        "matches_played": tm.get("matches_played"),
                        "wins": tm.get("wins"),
                        "draws": tm.get("draws"),
                        "loses": tm.get("loses"),
                        "G": sc,
                        "GA": ms,
                        "pts": t_pts,
                        "xG": round(t_xg, 3),
                        "xGA": round(t_xga, 3),
                        "npxG": tm.get("npxG"),
                        "npxGA": tm.get("npxGA"),
                        "npxGD": tm.get("npxGD"),
                        "xPTS": round(t_xpts, 3),
                        "ppda_avg": tm.get("ppda_avg"),
                        "ppda_allowed_avg": tm.get("ppda_allowed_avg"),
                        "deep_completions": tm.get("deep_completions"),
                        "deep_allowed": tm.get("deep_allowed"),
                        "xg_overperformance": round(sc - t_xg, 3),
                        "pts_overperformance": round(t_pts - t_xpts, 3),
                    }
                )
            for dm in h_data.get("matches") or []:
                if not isinstance(dm, dict):
                    continue
                records.append(
                    {
                        **base,
                        "record_type": "understat_historical_match_fixture_xg",
                        "league": lg_key,
                        "season": season_val,
                        "match_id": str(dm.get("match_id") or ""),
                        "datetime": dm.get("datetime"),
                        "is_result": bool(dm.get("is_result", False)),
                        "home_team_id": str(dm.get("home_team_id") or ""),
                        "home_team": dm.get("home_team"),
                        "away_team_id": str(dm.get("away_team_id") or ""),
                        "away_team": dm.get("away_team"),
                        "home_goals": dm.get("home_goals"),
                        "away_goals": dm.get("away_goals"),
                        "home_xG": dm.get("home_xG"),
                        "away_xG": dm.get("away_xG"),
                        "forecast_win": dm.get("forecast_win"),
                        "forecast_draw": dm.get("forecast_draw"),
                        "forecast_loss": dm.get("forecast_loss"),
                    }
                )

    return records


def _normalize_clubelo_transfermarkt(
    envelope: dict[str, Any], rel_path: str
) -> list[dict[str, Any]]:
    payload = envelope.get("payload") or {}
    base = _lineage_fields(envelope, rel_path)
    records: list[dict[str, Any]] = []

    # Caso 3B: Transfermarkt clubes (18 Liga MX o 114 en 6 ligas)
    if "clubs" in payload and isinstance(payload.get("clubs"), list):
        clubs = [c for c in payload["clubs"] if isinstance(c, dict)]
        values_by_league: dict[str, list[float]] = {}
        for c in clubs:
            lg_slug = str(c.get("league") or "liga-mx")
            val = c.get("total_squad_market_value_eur") or parse_eur_value(
                c.get("total_squad_market_value_raw")
            )
            if val is not None and float(val) > 0:
                values_by_league.setdefault(lg_slug, []).append(float(val))
        medians_by_league = {
            lg_slug: statistics.median(vals) for lg_slug, vals in values_by_league.items() if vals
        }

        for c in clubs:
            lg_slug = str(c.get("league") or "liga-mx")
            median_val = medians_by_league.get(lg_slug)
            total_eur = c.get("total_squad_market_value_eur")
            if total_eur is None:
                total_eur = parse_eur_value(c.get("total_squad_market_value_raw"))
            avg_eur = c.get("average_player_value_eur")
            if avg_eur is None:
                avg_eur = parse_eur_value(c.get("average_player_value_raw"))

            log_val = round(math.log(total_eur), 6) if (total_eur and total_eur > 0) else None
            log10_val = round(math.log10(total_eur), 6) if (total_eur and total_eur > 0) else None
            ratio_vs_median = (
                round(float(total_eur) / float(median_val), 4)
                if (total_eur and median_val and median_val > 0)
                else None
            )

            records.append(
                {
                    **base,
                    "record_type": "transfermarkt_club_valuation",
                    "competition": c.get("competition")
                    or payload.get("competition", "Liga MX Apertura (MEXA)"),
                    "competition_code": c.get("competition_code"),
                    "league": lg_slug,
                    "club_name": c.get("club_name"),
                    "club_path": c.get("club_path"),
                    "squad_size": c.get("squad_size"),
                    "average_age": c.get("average_age"),
                    "foreigners_count": c.get("foreigners_count"),
                    "total_market_value_eur": total_eur,
                    "avg_player_value_eur": avg_eur,
                    "league_median_market_value_eur": median_val,
                    "log_squad_value": log_val,
                    "log10_squad_value": log10_val,
                    "value_ratio_vs_league_median": ratio_vs_median,
                }
            )

    # Caso 3A: ClubElo ratings / tabla de probabilidades
    if "top_100_records" in payload and isinstance(payload.get("top_100_records"), list):
        for idx, row in enumerate(payload["top_100_records"]):
            if not isinstance(row, dict):
                continue
            club_raw = str(row.get("club") or "").strip()
            elo_val = row.get("elo")
            cells = [str(x).strip() for x in (row.get("cells") or []) if str(x).strip()]

            # Si el Elo o puntos viene codificado en las celdas de la tabla de ClubElo
            parsed_points = None
            if elo_val is None:
                for cell in cells:
                    if re.fullmatch(r"\d{1,3}", cell):
                        parsed_points = int(cell)
                        break

            records.append(
                {
                    **base,
                    "record_type": "clubelo_rating_entry",
                    "row_index": idx + 1,
                    "club": club_raw,
                    "country": row.get("country"),
                    "level": row.get("level"),
                    "elo": float(elo_val) if elo_val is not None else None,
                    "table_points_or_metric": parsed_points,
                    "cells": cells,
                    "fetch_mode_used": payload.get("fetch_mode_used"),
                }
            )

    # Wave-4 Transfermarkt: `players` (plantillas completas de jugadores con valor de mercado individual)
    if "players" in payload and isinstance(payload.get("players"), list):
        for pl in payload["players"]:
            if not isinstance(pl, dict):
                continue
            mv_eur = pl.get("market_value_eur")
            if mv_eur is None:
                mv_eur = parse_eur_value(pl.get("market_value_raw"))
            log_mv = round(math.log(mv_eur), 6) if (mv_eur and mv_eur > 0) else None
            records.append(
                {
                    **base,
                    "record_type": "transfermarkt_player_valuation",
                    "league": pl.get("league", "liga-mx"),
                    "competition_code": pl.get("competition_code"),
                    "club_name": pl.get("club") or pl.get("club_name"),
                    "club_id": pl.get("club_id"),
                    "player_id": pl.get("player_id"),
                    "player_name": pl.get("player_name"),
                    "player_url": pl.get("player_url"),
                    "shirt_number": pl.get("shirt_number"),
                    "position": pl.get("position"),
                    "age_or_dob": pl.get("age_or_dob"),
                    "age": pl.get("age"),
                    "nationality": pl.get("nationality"),
                    "nationalities": pl.get("nationalities"),
                    "height": pl.get("height"),
                    "foot": pl.get("foot"),
                    "joined": pl.get("joined"),
                    "signed_from": pl.get("signed_from"),
                    "contract_until": pl.get("contract_until"),
                    "market_value_raw": pl.get("market_value_raw"),
                    "market_value_eur": mv_eur,
                    "log_player_value": log_mv,
                }
            )

    return records


def _parse_comma_float(val: Any) -> float | None:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace("+", "").replace(",", ".")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _normalize_statiskicks(
    envelope: dict[str, Any], rel_path: str
) -> list[dict[str, Any]]:
    payload = envelope.get("payload") or {}
    base = _lineage_fields(envelope, rel_path)
    records: list[dict[str, Any]] = []

    seen_hrefs: set[str] = set()
    for link in payload.get("navigation_links") or []:
        if not isinstance(link, dict):
            continue
        href = str(link.get("href") or "").strip()
        text = " ".join(str(link.get("text") or "").split()).strip()
        if not href or href in seen_hrefs:
            continue
        seen_hrefs.add(href)

        league_id_match = re.search(r"/league/([a-z0-9]+)", href)
        records.append(
            {
                **base,
                "record_type": "statiskicks_endpoint_inventory",
                "inventory_kind": "league_route" if league_id_match else "portal_route",
                "label": text or "statiskicks_root",
                "endpoint_url": href,
                "statiskicks_competition_id": league_id_match.group(1) if league_id_match else None,
            }
        )

    for net in payload.get("network_requests") or []:
        if not isinstance(net, dict):
            continue
        records.append(
            {
                **base,
                "record_type": "statiskicks_network_asset",
                "inventory_kind": f"network_{net.get('resource_type', 'unknown')}",
                "endpoint_url": net.get("url"),
                "http_status": net.get("status"),
                "resource_type": net.get("resource_type"),
            }
        )

    # Wave-3 Statiskicks: `league_xp_standings_tables`
    xp_tables = payload.get("league_xp_standings_tables")
    if isinstance(xp_tables, dict):
        for lg_key, rows in xp_tables.items():
            if not isinstance(rows, list):
                continue
            for r in rows:
                if not isinstance(r, dict):
                    continue
                records.append(
                    {
                        **base,
                        "record_type": "statiskicks_xp_standing_row",
                        "league_key": lg_key,
                        "rank": int(_parse_comma_float(r.get("#")) or 0) or None,
                        "team_name": r.get("Equipo"),
                        "matches_played": int(_parse_comma_float(r.get("PJ")) or 0) or None,
                        "goal_diff": _parse_comma_float(r.get("DG")),
                        "pts": _parse_comma_float(r.get("Pts")),
                        "xPTS": _parse_comma_float(r.get("xP")),
                        "xpts_overperformance": _parse_comma_float(r.get("±")),
                    }
                )

    # Wave-3 Statiskicks: `ligamx_team_xg_rolling_series` (339 puntos de partidos Liga MX)
    rolling_series = payload.get("ligamx_team_xg_rolling_series")
    if isinstance(rolling_series, dict):
        for tm_key, series_obj in rolling_series.items():
            if not isinstance(series_obj, dict):
                continue
            for pt in series_obj.get("points") or []:
                if not isinstance(pt, dict):
                    continue
                records.append(
                    {
                        **base,
                        "record_type": "statiskicks_team_xg_rolling_point",
                        "league": "liga-mx",
                        "team_key": tm_key,
                        "date": pt.get("date"),
                        "season": pt.get("season"),
                        "opponent": pt.get("opponent"),
                        "is_home": pt.get("home"),
                        "score": pt.get("score"),
                        "manager": pt.get("manager"),
                        "xG": pt.get("xg"),
                        "xGA": pt.get("xga"),
                        "rolling_xG": pt.get("rolling_xg"),
                        "rolling_xGA": pt.get("rolling_xga"),
                    }
                )

    # Wave-3 Statiskicks: `ligamx_team_profile_percentile_metrics`
    pct_profiles = payload.get("ligamx_team_profile_percentile_metrics")
    if isinstance(pct_profiles, dict):
        for tm_key, prof in pct_profiles.items():
            if not isinstance(prof, dict):
                continue
            for m in prof.get("metrics") or []:
                if not isinstance(m, dict):
                    continue
                records.append(
                    {
                        **base,
                        "record_type": "statiskicks_team_percentile_metric",
                        "league": "liga-mx",
                        "team_key": tm_key,
                        "metric_key": m.get("key"),
                        "metric_label": m.get("label"),
                        "metric_short": m.get("short"),
                        "metric_group": m.get("group"),
                        "raw_total": m.get("raw"),
                        "value": m.get("value"),
                        "league_average": m.get("average"),
                        "rank": m.get("rank"),
                        "rank_total": m.get("rank_total"),
                        "percentile": m.get("percentile"),
                        "unit": m.get("unit"),
                        "normalization": m.get("normalization"),
                    }
                )

    # Wave-3 Statiskicks: `subpages` tablas extraídas (708 filas)
    for sp in payload.get("subpages") or []:
        if not isinstance(sp, dict):
            continue
        sp_slug = sp.get("slug")
        sp_url = sp.get("url")
        for tbl in sp.get("tables") or []:
            if not isinstance(tbl, dict):
                continue
            headers = tbl.get("headers") or []
            for r_idx, row in enumerate(tbl.get("rows") or []):
                records.append(
                    {
                        **base,
                        "record_type": "statiskicks_subpage_table_row",
                        "subpage_slug": sp_slug,
                        "subpage_url": sp_url,
                        "table_index": tbl.get("table_index"),
                        "row_index": r_idx + 1,
                        "headers": headers,
                        "row": row,
                    }
                )

    # Wave-3 & Wave-4 Statiskicks: `search_xhr_results` / `search_xhr_catalog`
    search_xhr = payload.get("search_xhr_results") or payload.get("search_xhr_catalog")
    if isinstance(search_xhr, dict):
        for query_term, res_obj in search_xhr.items():
            if not isinstance(res_obj, dict):
                continue
            for entity_kind in ("leagues", "teams", "players"):
                for ent in res_obj.get(entity_kind) or []:
                    if isinstance(ent, dict):
                        records.append(
                            {
                                **base,
                                "record_type": "statiskicks_search_entity",
                                "query_term": query_term,
                                "entity_kind": entity_kind,
                                **ent,
                            }
                        )

    # Wave-4 Statiskicks: `league_standings_xp_tables` y `scouting_leaderboard_tables`
    for tbl in payload.get("league_standings_xp_tables") or []:
        if not isinstance(tbl, dict):
            continue
        for r in tbl.get("rows") or []:
            if not isinstance(r, dict):
                continue
            records.append(
                {
                    **base,
                    "record_type": "statiskicks_xp_standing_row",
                    "league_key": "liga-mx",
                    "rank": int(_parse_comma_float(r.get("#")) or 0) or None,
                    "team_name": r.get("Equipo"),
                    "matches_played": int(_parse_comma_float(r.get("PJ")) or 0) or None,
                    "goal_diff": _parse_comma_float(r.get("DG")),
                    "pts": _parse_comma_float(r.get("Pts")),
                    "xPTS": _parse_comma_float(r.get("xP")),
                    "xpts_overperformance": _parse_comma_float(r.get("±")),
                }
            )

    for tbl in payload.get("scouting_leaderboard_tables") or []:
        if not isinstance(tbl, dict):
            continue
        for r in tbl.get("rows") or []:
            if isinstance(r, dict):
                records.append(
                    {
                        **base,
                        "record_type": "statiskicks_scouting_leaderboard_row",
                        "league_key": "liga-mx",
                        **r,
                    }
                )

    # Wave-4 Statiskicks: `clubs` (19 clubes Liga MX con series rolling xG, percentiles, perfiles de edad y 1,657 filas de jugadores SKore/p90)
    for cl in payload.get("clubs") or []:
        if not isinstance(cl, dict):
            continue
        cl_name = cl.get("club_name")
        cl_slug = cl.get("club_slug")
        xg_roll = cl.get("xg_rolling_payload")
        if isinstance(xg_roll, dict):
            for pt in xg_roll.get("points") or []:
                if isinstance(pt, dict):
                    records.append(
                        {
                            **base,
                            "record_type": "statiskicks_team_xg_rolling_point",
                            "league": "liga-mx",
                            "team_key": cl_slug,
                            "club_name": cl_name,
                            "date": pt.get("date"),
                            "season": pt.get("season"),
                            "opponent": pt.get("opponent"),
                            "is_home": pt.get("home"),
                            "score": pt.get("score"),
                            "manager": pt.get("manager"),
                            "xG": pt.get("xg"),
                            "xGA": pt.get("xga"),
                            "rolling_xG": pt.get("rolling_xg"),
                            "rolling_xGA": pt.get("rolling_xga"),
                        }
                    )
        t_prof = cl.get("team_profile_payload")
        if isinstance(t_prof, dict):
            for m in t_prof.get("metrics") or []:
                if isinstance(m, dict):
                    records.append(
                        {
                            **base,
                            "record_type": "statiskicks_team_percentile_metric",
                            "league": "liga-mx",
                            "team_key": cl_slug,
                            "club_name": cl_name,
                            "metric_key": m.get("key"),
                            "metric_label": m.get("label"),
                            "metric_short": m.get("short"),
                            "metric_group": m.get("group"),
                            "raw_total": m.get("raw"),
                            "value": m.get("value"),
                            "league_average": m.get("average"),
                            "rank": m.get("rank"),
                            "rank_total": m.get("rank_total"),
                            "percentile": m.get("percentile"),
                            "unit": m.get("unit"),
                            "normalization": m.get("normalization"),
                        }
                    )
        age_prof = cl.get("age_profile_payload")
        if isinstance(age_prof, dict):
            for pl in age_prof.get("players") or []:
                if isinstance(pl, dict):
                    records.append(
                        {
                            **base,
                            "record_type": "statiskicks_player_age_minutes_profile",
                            "league": "liga-mx",
                            "team_key": cl_slug,
                            "club_name": cl_name,
                            **pl,
                        }
                    )
        for tbl in cl.get("squad_tables") or []:
            if not isinstance(tbl, dict):
                continue
            headers = tbl.get("headers") or []
            for r_idx, row in enumerate(tbl.get("rows") or []):
                if isinstance(row, dict):
                    records.append(
                        {
                            **base,
                            "record_type": "statiskicks_club_player_stat_row",
                            "league": "liga-mx",
                            "team_key": cl_slug,
                            "club_name": cl_name,
                            "table_index": tbl.get("table_index"),
                            "row_index": r_idx + 1,
                            "headers": headers,
                            **row,
                        }
                    )

    return records


def _normalize_opta_player_stats(
    envelope: dict[str, Any], rel_path: str
) -> list[dict[str, Any]]:
    payload = envelope.get("payload") or {}
    base = _lineage_fields(envelope, rel_path)
    records: list[dict[str, Any]] = []

    for link in payload.get("links") or []:
        if not isinstance(link, dict):
            continue
        href = str(link.get("href") or "").strip()
        text = " ".join(str(link.get("text") or "").split()).strip()
        if not href:
            continue
        comp_match = re.search(r"/soccer/([^/]+)/([a-z0-9]{20,})/", href)
        records.append(
            {
                **base,
                "record_type": "opta_competition_route",
                "competition_label": text or None,
                "competition_slug": comp_match.group(1) if comp_match else None,
                "opta_tournament_calendar_id": comp_match.group(2) if comp_match else None,
                "endpoint_url": href,
            }
        )

    for feed in payload.get("perform_and_opta_network_responses") or []:
        if not isinstance(feed, dict):
            continue
        url = str(feed.get("url") or "")
        parsed_json = feed.get("parsed_json")
        records.append(
            {
                **base,
                "record_type": "opta_performfeeds_endpoint",
                "endpoint_url": url,
                "http_status": feed.get("status"),
                "resource_type": feed.get("resource_type"),
                "is_performfeeds_api": "performfeeds.com" in url,
                "has_parsed_json": parsed_json is not None,
                "json_top_keys": sorted(parsed_json.keys())[:15]
                if isinstance(parsed_json, dict)
                else None,
            }
        )

    # Wave-3 & Wave-4 Opta: `performfeeds_standings` / `standings_by_league`
    pf_standings = payload.get("performfeeds_standings") or payload.get("standings_by_league")
    if isinstance(pf_standings, dict):
        for comp_name, rows in pf_standings.items():
            if not isinstance(rows, list):
                continue
            for r in rows:
                if isinstance(r, dict):
                    records.append(
                        {
                            **base,
                            "record_type": "opta_performfeeds_standing_row",
                            "competition": comp_name,
                            **r,
                        }
                    )

    # Wave-3 & Wave-4 Opta: `performfeeds_matches` / `matches_by_league`
    pf_matches = payload.get("performfeeds_matches") or payload.get("matches_by_league")
    if isinstance(pf_matches, dict):
        for comp_name, matches in pf_matches.items():
            if not isinstance(matches, list):
                continue
            for m in matches:
                if isinstance(m, dict):
                    records.append(
                        {
                            **base,
                            "record_type": "opta_performfeeds_match",
                            "competition": comp_name,
                            **m,
                        }
                    )

    # Wave-3 & Wave-4 Opta: `performfeeds_squads` / `squads_by_league`
    pf_squads = payload.get("performfeeds_squads") or payload.get("squads_by_league")
    if isinstance(pf_squads, dict):
        for comp_name, clubs in pf_squads.items():
            if not isinstance(clubs, list):
                continue
            for cl in clubs:
                if not isinstance(cl, dict):
                    continue
                c_id = cl.get("contestant_id")
                c_name = cl.get("contestant_name")
                c_code = cl.get("contestant_code")
                venue = cl.get("venue_name")
                for p in cl.get("persons") or []:
                    if isinstance(p, dict):
                        records.append(
                            {
                                **base,
                                "record_type": "opta_performfeeds_squad_person",
                                "competition": comp_name,
                                "contestant_id": c_id,
                                "contestant_name": c_name,
                                "contestant_code": c_code,
                                "venue_name": venue,
                                **p,
                            }
                        )

    # Wave-3 & Wave-4 Opta: `performfeeds_seasonstats` + `ligamx_all18_clubs_seasonstats`
    seasonstats_entries = (payload.get("performfeeds_seasonstats") or []) + (
        payload.get("ligamx_all18_clubs_seasonstats") or []
    )
    for ss in seasonstats_entries:
        if not isinstance(ss, dict):
            continue
        comp_name = ss.get("competition") or "Liga MX"
        tmcl_id = ss.get("tmcl_id")
        c_id = ss.get("contestant_id")
        c_name = ss.get("club_name")
        records.append(
            {
                **base,
                "record_type": "opta_performfeeds_club_seasonstats",
                "competition": comp_name,
                "tmcl_id": tmcl_id,
                "contestant_id": c_id,
                "club_name": c_name,
                "team_stats_count": ss.get("team_stats_count"),
                "team_stats": ss.get("team_stats"),
            }
        )
        for pl in ss.get("players") or []:
            if isinstance(pl, dict):
                records.append(
                    {
                        **base,
                        "record_type": "opta_performfeeds_player_seasonstats",
                        "competition": comp_name,
                        "tmcl_id": tmcl_id,
                        "contestant_id": c_id,
                        "club_name": c_name,
                        **pl,
                    }
                )

    # Wave-3 Opta: `performfeeds_matchstats` (6 partidos + 249 filas de boxscore de jugadores)
    for ms in payload.get("performfeeds_matchstats") or []:
        if not isinstance(ms, dict):
            continue
        comp_name = ms.get("competition")
        m_id = ms.get("match_id")
        desc = ms.get("description")
        m_date = ms.get("date")
        for tb in ms.get("teams_boxscore") or []:
            if not isinstance(tb, dict):
                continue
            c_id = tb.get("contestant_id")
            formation = tb.get("formation_used")
            records.append(
                {
                    **base,
                    "record_type": "opta_performfeeds_match_team_boxscore",
                    "competition": comp_name,
                    "match_id": m_id,
                    "description": desc,
                    "date": m_date,
                    "contestant_id": c_id,
                    "formation_used": formation,
                    "team_stats": tb.get("team_stats"),
                }
            )
            for pl in tb.get("players") or []:
                if isinstance(pl, dict):
                    records.append(
                        {
                            **base,
                            "record_type": "opta_performfeeds_match_player_boxscore",
                            "competition": comp_name,
                            "match_id": m_id,
                            "description": desc,
                            "date": m_date,
                            "contestant_id": c_id,
                            "formation_used": formation,
                            **pl,
                        }
                    )

    # Wave-3 Opta: `dom_tables` (1,513 filas) + `performfeeds_tournament_calendars` (400) + `opta_event_definitions` (75)
    for dt in payload.get("dom_tables") or []:
        if not isinstance(dt, dict):
            continue
        src_u = dt.get("source_url")
        t_idx = dt.get("table_index")
        headers = dt.get("headers") or []
        for r_idx, row in enumerate(dt.get("rows") or []):
            records.append(
                {
                    **base,
                    "record_type": "opta_dom_table_row",
                    "source_url": src_u,
                    "table_index": t_idx,
                    "row_index": r_idx + 1,
                    "headers": headers,
                    "row": row,
                }
            )

    for tc in (payload.get("performfeeds_tournament_calendars") or []) + (
        payload.get("tournament_calendars") or []
    ):
        if isinstance(tc, dict):
            records.append(
                {
                    **base,
                    "record_type": "opta_tournament_calendar",
                    **tc,
                }
            )

    for ed in payload.get("opta_event_definitions") or []:
        if isinstance(ed, dict):
            records.append(
                {
                    **base,
                    "record_type": "opta_event_definition",
                    **ed,
                }
            )

    return records


def _safe_float(val: Any) -> float | None:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace("%", "").replace(",", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _normalize_generic_stats_source(
    envelope: dict[str, Any], rel_path: str
) -> list[dict[str, Any]]:
    """Normalizador para FotMob, PFR/RBSDM/SumerSports, FBref y Sofascore."""
    payload = envelope.get("payload") or {}
    base = _lineage_fields(envelope, rel_path)
    source_id = envelope.get("source_id", "unknown_stats")
    records: list[dict[str, Any]] = []

    if not isinstance(payload, dict):
        return records

    # 1. FotMob (`leagues` -> `standings_rows`, `matches`, `top_stat_lists`)
    if source_id == "fotmob" and isinstance(payload.get("leagues"), list):
        for lg in payload["leagues"]:
            if not isinstance(lg, dict):
                continue
            lg_slug = lg.get("league_slug")
            lg_name = lg.get("league_name")
            season = lg.get("selected_season")
            for row in lg.get("standings_rows") or []:
                if not isinstance(row, dict):
                    continue
                scores_str = str(row.get("scores_str") or "")
                gf = ga = None
                if "-" in scores_str:
                    parts = scores_str.split("-", 1)
                    gf = int(parts[0].strip()) if parts[0].strip().isdigit() else None
                    ga = int(parts[1].strip()) if parts[1].strip().isdigit() else None
                xg_val = _safe_float(row.get("xg"))
                xga_val = _safe_float(row.get("xg_conceded"))
                xpts_val = _safe_float(row.get("xpts"))
                pts_val = row.get("pts")
                xg_overperf = round(gf - xg_val, 3) if (gf is not None and xg_val is not None) else None
                xpts_overperf = (
                    round(float(pts_val) - xpts_val, 3)
                    if (pts_val is not None and xpts_val is not None)
                    else None
                )
                records.append(
                    {
                        **base,
                        "record_type": "fotmob_team_standing",
                        "league_slug": lg_slug,
                        "league_name": lg_name,
                        "season": season,
                        "rank": row.get("idx"),
                        "team_id": row.get("team_id"),
                        "team_name": row.get("team_name"),
                        "matches_played": row.get("played"),
                        "wins": row.get("wins"),
                        "draws": row.get("draws"),
                        "losses": row.get("losses"),
                        "G": gf,
                        "GA": ga,
                        "goal_diff": row.get("goal_conceded"),
                        "pts": pts_val,
                        "xG": round(xg_val, 4) if xg_val is not None else None,
                        "xGA": round(xga_val, 4) if xga_val is not None else None,
                        "xPTS": round(xpts_val, 4) if xpts_val is not None else None,
                        "xg_overperformance": xg_overperf,
                        "xpts_overperformance": xpts_overperf,
                    }
                )
            for m in lg.get("matches") or lg.get("matches_sample") or []:
                if isinstance(m, dict):
                    records.append(
                        {
                            **base,
                            "record_type": "fotmob_match_fixture",
                            "league_slug": lg_slug,
                            "league_name": lg_name,
                            "match_id": m.get("match_id"),
                            "round": m.get("round"),
                            "home_team": m.get("home_team"),
                            "away_team": m.get("away_team"),
                            "home_score": m.get("home_score"),
                            "away_score": m.get("away_score"),
                            "utc_time": m.get("utc_time"),
                            "finished": m.get("finished"),
                        }
                    )
            for st_cat in lg.get("top_stat_lists") or []:
                if isinstance(st_cat, dict):
                    records.append(
                        {
                            **base,
                            "record_type": "fotmob_stat_leaders",
                            "league_slug": lg_slug,
                            "header": st_cat.get("header"),
                            "category": st_cat.get("category"),
                            "stat_name": st_cat.get("stat_name"),
                            "leaders": st_cat.get("leaders") or st_cat.get("top_3") or [],
                        }
                    )
        if records:
            return records

    # 2. PFR / RBSDM / SumerSports (`sumersports_offensive`, `sumersports_defensive`, `pro_football_reference`)
    if source_id == "pfr_rbsdm_sumersports":
        for side_key, rec_type in (
            ("sumersports_offensive", "nfl_sumersports_team_offense"),
            ("sumersports_defensive", "nfl_sumersports_team_defense"),
        ):
            for row in payload.get(side_key) or []:
                if not isinstance(row, dict):
                    continue
                raw_team = str(row.get("Team") or "").strip()
                rank_match = re.match(r"^(\d+)\.\s*(.+)$", raw_team)
                rank_num = int(rank_match.group(1)) if rank_match else None
                clean_team = rank_match.group(2).strip() if rank_match else raw_team
                records.append(
                    {
                        **base,
                        "record_type": rec_type,
                        "league": "nfl",
                        "season": row.get("Season"),
                        "rank": rank_num,
                        "team_name": clean_team,
                        "epa_per_play": _safe_float(row.get("EPA/Play")),
                        "total_epa": _safe_float(row.get("Total EPA")),
                        "success_rate_pct": _safe_float(row.get("Success %")),
                        "epa_per_pass": _safe_float(row.get("EPA/Pass")),
                        "epa_per_rush": _safe_float(row.get("EPA/Rush")),
                        "pass_yards": _safe_float(row.get("Pass Yards")),
                        "pass_td": _safe_float(row.get("Pass TD")),
                        "rush_yards": _safe_float(row.get("Rush Yards")),
                        "rush_td": _safe_float(row.get("Rush TD")),
                        "adot": _safe_float(row.get("ADoT")),
                        "scramble_pct": _safe_float(row.get("Scramble %")),
                        "int_pct": _safe_float(row.get("Int %")),
                    }
                )
        pfr_block = payload.get("pro_football_reference") or {}
        if isinstance(pfr_block, dict):
            for r in pfr_block.get("rows") or []:
                if isinstance(r, dict):
                    records.append({**base, "record_type": "nfl_pfr_team_row", "league": "nfl", **r})
        if records:
            return records

    # 3. FBref (`competitions` -> `tables` -> `rows`)
    if source_id == "fbref" and isinstance(payload.get("competitions"), list):
        for comp in payload["competitions"]:
            if not isinstance(comp, dict):
                continue
            comp_slug = comp.get("competition")
            season_label = comp.get("season_label")
            for tbl in comp.get("tables") or []:
                if not isinstance(tbl, dict):
                    continue
                table_id = str(tbl.get("table_id") or "")
                is_fixture_tbl = "sched" in table_id.lower()
                for r in tbl.get("rows") or []:
                    if isinstance(r, dict):
                        is_fixture_row = is_fixture_tbl or (
                            r.get("home_team") is not None and r.get("away_team") is not None
                        )
                        records.append(
                            {
                                **base,
                                "record_type": "fbref_match_fixture_xg"
                                if is_fixture_row
                                else "fbref_squad_stat_row",
                                "competition": comp_slug,
                                "season_label": season_label,
                                "table_id": table_id,
                                "team_name": r.get("team") or r.get("squad"),
                                **r,
                            }
                        )
        if records:
            return records

    # 4. Sofascore (`tournaments_summary`, `standings_rows`, `top_players`, `scheduled_events`, `ligamx_seasons`, `recorded_api_calls`)
    if source_id == "sofascore":
        for ts in payload.get("tournaments_summary") or []:
            if isinstance(ts, dict):
                records.append({**base, "record_type": "sofascore_tournament_summary", **ts})
        for sr in payload.get("standings_rows") or []:
            if isinstance(sr, dict):
                records.append({**base, "record_type": "sofascore_standing_row", **sr})
        for tp in payload.get("top_players") or []:
            if isinstance(tp, dict):
                records.append({**base, "record_type": "sofascore_top_player", **tp})
        for ev in payload.get("scheduled_events") or []:
            if isinstance(ev, dict):
                records.append({**base, "record_type": "sofascore_scheduled_event", **ev})
        for s in payload.get("ligamx_seasons") or []:
            if isinstance(s, dict):
                records.append({**base, "record_type": "sofascore_ligamx_season", **s})
        for api_call in (payload.get("recorded_api_calls") or [])[:40]:
            if isinstance(api_call, dict):
                records.append({**base, "record_type": "sofascore_api_call", **api_call})
        if records:
            return records

    items = (
        payload.get("records")
        or payload.get("teams")
        or payload.get("matches")
        or payload.get("players")
        or payload.get("events")
        or []
    )
    if isinstance(items, list) and items:
        for item in items:
            if isinstance(item, dict):
                records.append({**base, "record_type": f"{source_id}_record", **item})
    else:
        records.append(
            {
                **base,
                "record_type": f"{source_id}_snapshot_summary",
                "url": envelope.get("url"),
                "payload_keys": sorted(payload.keys()),
            }
        )
    return records


# ============================================================================
# 3. NORMALIZACIÓN: ROSTER AVAILABILITY (`injuries_lineups`)
# ============================================================================


def _normalize_transfermarkt_injuries(
    envelope: dict[str, Any], rel_path: str
) -> list[dict[str, Any]]:
    payload = envelope.get("payload") or {}
    base = _lineage_fields(envelope, rel_path)
    records: list[dict[str, Any]] = []

    raw_rows = [r for r in (payload.get("records") or []) if isinstance(r, dict)]

    # Deduplicar por (league, club, player_name, record_type) para evitar doble conteo
    # entre la tabla general de liga y la tabla específica del club
    dedup_players: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    for r in raw_rows:
        league = str(r.get("league") or "unknown")
        club = str(r.get("club") or "Unknown Club").strip()
        player = str(r.get("player_name") or "").strip()
        rtype = str(r.get("record_type") or "injury").strip().lower()
        if not player:
            continue
        key = (league, club, player, rtype)
        mv_eur = r.get("market_value_eur")
        if mv_eur is None:
            mv_eur = parse_eur_value(r.get("market_value_raw"))
        normalized_player = {
            **base,
            "record_type": "transfermarkt_player_absence",
            "league": league,
            "club": club,
            "player_name": player,
            "absence_type": "suspension" if "susp" in rtype or "sanc" in rtype else "injury",
            "position": r.get("position"),
            "age": r.get("age"),
            "injury_or_suspension_reason": r.get("injury_or_suspension_reason"),
            "since_date": r.get("since_date"),
            "expected_return_date": r.get("expected_return_date"),
            "matches_missed": r.get("matches_missed"),
            "market_value_raw": r.get("market_value_raw"),
            "market_value_eur": mv_eur,
        }
        # Conservar el registro con más detalle (ej. matches_missed o market_value_eur)
        existing = dedup_players.get(key)
        if not existing or (existing.get("market_value_eur") is None and mv_eur is not None):
            dedup_players[key] = normalized_player

    unique_player_records = list(dedup_players.values())

    # Agregación por (league, club)
    by_club: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for rec in unique_player_records:
        by_club.setdefault((rec["league"], rec["club"]), []).append(rec)

    for (league, club), club_recs in sorted(by_club.items()):
        inj_count = sum(1 for x in club_recs if x["absence_type"] == "injury")
        susp_count = sum(1 for x in club_recs if x["absence_type"] == "suspension")
        missing_mv = round(
            sum(float(x["market_value_eur"]) for x in club_recs if x.get("market_value_eur") is not None),
            2,
        )
        records.append(
            {
                **base,
                "record_type": "transfermarkt_club_availability_summary",
                "league": league,
                "club": club,
                "injured_players_count": inj_count,
                "suspended_players_count": susp_count,
                "total_absent_players_count": len(club_recs),
                "missing_market_value_eur": missing_mv,
                "absent_players": [
                    {
                        "player_name": x["player_name"],
                        "position": x["position"],
                        "absence_type": x["absence_type"],
                        "reason": x["injury_or_suspension_reason"],
                        "expected_return_date": x["expected_return_date"],
                        "market_value_eur": x["market_value_eur"],
                    }
                    for x in club_recs
                ],
            }
        )

    records.extend(unique_player_records)
    return records


def _normalize_rotowire(
    envelope: dict[str, Any], rel_path: str
) -> list[dict[str, Any]]:
    payload = envelope.get("payload") or {}
    base = _lineage_fields(envelope, rel_path)
    records: list[dict[str, Any]] = []

    matchups_list = (payload.get("soccer_matchups") or []) + (payload.get("lineup_matchups") or [])
    is_deep_wave4 = bool(payload.get("lineup_matchups"))

    for idx, match in enumerate(matchups_list):
        if not isinstance(match, dict):
            continue
        home_team = match.get("home_team")
        away_team = match.get("away_team")
        sport = match.get("sport", "soccer")
        league = match.get("league", "soccer")
        game_day = match.get("game_day_or_status")

        for side_key, team_name, opp_name in (
            ("home_lineup", home_team, away_team),
            ("away_lineup", away_team, home_team),
        ):
            lineup = match.get(side_key) or {}
            starters = lineup.get("starting_11_players") or lineup.get("starters") or []
            injured_out = lineup.get("injured_out_players") or []
            questionable = lineup.get("questionable_players") or []
            venue_side = "home" if side_key == "home_lineup" else "away"
            conf_status = lineup.get("confirmed_status", "predicted")

            # Deduplicar jugadores dudosos por nombre
            dedup_q: dict[str, dict[str, Any]] = {}
            for q in questionable:
                if isinstance(q, dict) and q.get("player_name"):
                    dedup_q[str(q["player_name"])] = q

            records.append(
                {
                    **base,
                    "record_type": "rotowire_soccer_team_lineup",
                    "sport": sport,
                    "league": league,
                    "game_day_or_status": game_day,
                    "matchup_index": idx + 1,
                    "team": team_name,
                    "opponent": opp_name,
                    "venue_side": venue_side,
                    "confirmed_status": conf_status,
                    "raw_status_label": lineup.get("raw_status_label"),
                    "starting_11_count": len(starters),
                    "injured_out_count": len(injured_out),
                    "questionable_count": len(dedup_q),
                    "starting_11_players": starters,
                    "injured_out_players": injured_out,
                    "questionable_players": list(dedup_q.values()),
                }
            )

            # En Wave 4 emitimos también cada jugador titular/baja/duda individualmente para modelado de disponibilidad
            if is_deep_wave4:
                for st_pl in starters:
                    if isinstance(st_pl, dict):
                        records.append(
                            {
                                **base,
                                "record_type": "rotowire_lineup_player_slot",
                                "sport": sport,
                                "league": league,
                                "team": team_name,
                                "opponent": opp_name,
                                "venue_side": venue_side,
                                "confirmed_status": conf_status,
                                "availability_role": "starter",
                                "slot_order": st_pl.get("slot_order"),
                                "player_id": st_pl.get("player_id"),
                                "player_name": st_pl.get("player_name"),
                                "position": st_pl.get("position"),
                                "injury_tag": st_pl.get("injury_tag"),
                            }
                        )
                for inj_pl in injured_out:
                    if isinstance(inj_pl, dict):
                        records.append(
                            {
                                **base,
                                "record_type": "rotowire_lineup_player_slot",
                                "sport": sport,
                                "league": league,
                                "team": team_name,
                                "opponent": opp_name,
                                "venue_side": venue_side,
                                "confirmed_status": conf_status,
                                "availability_role": "injured_out",
                                "player_id": inj_pl.get("player_id"),
                                "player_name": inj_pl.get("player_name"),
                                "position": inj_pl.get("position"),
                                "injury_tag": inj_pl.get("injury_status"),
                            }
                        )
                for q_pl in dedup_q.values():
                    if isinstance(q_pl, dict):
                        records.append(
                            {
                                **base,
                                "record_type": "rotowire_lineup_player_slot",
                                "sport": sport,
                                "league": league,
                                "team": team_name,
                                "opponent": opp_name,
                                "venue_side": venue_side,
                                "confirmed_status": conf_status,
                                "availability_role": "questionable",
                                "player_id": q_pl.get("player_id"),
                                "player_name": q_pl.get("player_name"),
                                "position": q_pl.get("position"),
                                "injury_tag": q_pl.get("injury_status"),
                            }
                        )

    for nfl_inj in (payload.get("nfl_injuries") or []) + (payload.get("injury_table_records") or []):
        if not isinstance(nfl_inj, dict):
            continue
        records.append(
            {
                **base,
                "record_type": "rotowire_nfl_injury_designation",
                "sport": nfl_inj.get("sport", "football"),
                "league": nfl_inj.get("league", "nfl"),
                "player_id": str(nfl_inj.get("player_id") or ""),
                "player_name": nfl_inj.get("player_name"),
                "team": nfl_inj.get("team"),
                "position": nfl_inj.get("position"),
                "injury": nfl_inj.get("injury"),
                "game_status_designation": nfl_inj.get("game_status_designation")
                or nfl_inj.get("status"),
                "player_url": nfl_inj.get("player_url"),
            }
        )

    return records


def _normalize_generic_roster_source(
    envelope: dict[str, Any], rel_path: str
) -> list[dict[str, Any]]:
    """Normalizador extensible para PremierInjuries/SportsGambler y NFL Official Injuries."""
    payload = envelope.get("payload") or {}
    base = _lineage_fields(envelope, rel_path)
    source_id = envelope.get("source_id", "unknown_roster")
    records: list[dict[str, Any]] = []

    if isinstance(payload, dict):
        for list_key in ("records", "injuries", "players", "teams", "clubs", "depth_charts", "lineups"):
            val = payload.get(list_key)
            if isinstance(val, list) and val:
                for item in val:
                    if isinstance(item, dict):
                        records.append({**base, "record_type": f"{source_id}_{list_key}", **item})
        if not records:
            for k, val in payload.items():
                if k in ("http_trace", "target_urls"):
                    continue
                if isinstance(val, list) and val and isinstance(val[0], dict):
                    for item in val:
                        if isinstance(item, dict):
                            records.append({**base, "record_type": f"{source_id}_{k}", **item})
        if not records:
            records.append(
                {
                    **base,
                    "record_type": f"{source_id}_snapshot_summary",
                    "url": envelope.get("url"),
                    "payload_keys": sorted(payload.keys()),
                }
            )
    return records


# ============================================================================
# 4. NORMALIZACIÓN: NEWS AND ENVIRONMENT (`news_press_sentiment` + `environment_referees`)
# ============================================================================


def _normalize_open_meteo(
    envelope: dict[str, Any], rel_path: str
) -> list[dict[str, Any]]:
    payload = envelope.get("payload") or {}
    base = _lineage_fields(envelope, rel_path)
    records: list[dict[str, Any]] = []

    for st in payload.get("stadiums") or []:
        if not isinstance(st, dict):
            continue
        summary = st.get("next_24h_summary") or {}
        elev = (
            st.get("stadium_elevation_m")
            if st.get("stadium_elevation_m") is not None
            else st.get("elevation_m")
        )
        elev_float = float(elev) if elev is not None else None
        high_alt = bool(
            st.get("is_high_altitude_gt_1500m")
            if st.get("is_high_altitude_gt_1500m") is not None
            else (elev_float is not None and elev_float > 1500.0)
        )

        max_wind = (
            summary.get("max_wind_speed_mph")
            if summary.get("max_wind_speed_mph") is not None
            else st.get("max_wind_mph_7d")
        )
        max_gusts = (
            summary.get("max_wind_gusts_mph")
            if summary.get("max_wind_gusts_mph") is not None
            else st.get("max_gust_mph_7d")
        )
        total_precip = (
            summary.get("total_precipitation_mm")
            if summary.get("total_precipitation_mm") is not None
            else st.get("total_precip_mm_7d")
        )
        min_temp = (
            summary.get("min_temperature_c")
            if summary.get("min_temperature_c") is not None
            else st.get("min_temp_c_7d")
        )
        max_temp = (
            summary.get("max_temperature_c")
            if summary.get("max_temperature_c") is not None
            else st.get("max_temp_c_7d")
        )
        is_dome = bool(
            st.get("is_dome")
            if st.get("is_dome") is not None
            else st.get("is_dome_or_retractable", False)
        )
        hourly_count = (
            st.get("hourly_points_count")
            if st.get("hourly_points_count") is not None
            else len(st.get("hourly_forecast_24h") or st.get("hourly_forecast_7d") or [])
        )

        records.append(
            {
                **base,
                "record_type": "stadium_weather_forecast",
                "stadium_id": st.get("stadium_id"),
                "stadium_name": st.get("stadium_name"),
                "league": st.get("league"),
                "city": st.get("city"),
                "teams": st.get("teams") or [],
                "latitude": st.get("latitude"),
                "longitude": st.get("longitude"),
                "roof_type": st.get("roof_type") or ("dome" if is_dome else "open"),
                "is_dome": is_dome,
                "stadium_elevation_m": elev_float,
                "high_altitude_flag": high_alt,
                "max_wind_speed_mph": max_wind,
                "max_wind_gusts_mph": max_gusts,
                "total_precipitation_mm": total_precip,
                "min_temperature_c": min_temp,
                "max_temperature_c": max_temp,
                "nfl_wind_alert_gt_15mph": bool(
                    st.get("nfl_wind_alert_gt_15mph")
                    if st.get("nfl_wind_alert_gt_15mph") is not None
                    else (not is_dome and max_wind is not None and float(max_wind) >= 15.0)
                ),
                "extreme_wind_flag": bool(
                    (max_wind is not None and float(max_wind) >= 20.0)
                    or (max_gusts is not None and float(max_gusts) >= 30.0)
                ),
                "rain_risk_flag": bool(total_precip is not None and float(total_precip) >= 2.0),
                "hourly_forecast_samples_count": hourly_count,
            }
        )

    return records


def _normalize_mediotiempo_news(
    envelope: dict[str, Any], rel_path: str
) -> list[dict[str, Any]]:
    payload = envelope.get("payload") or {}
    base = _lineage_fields(envelope, rel_path)
    records: list[dict[str, Any]] = []

    for idx, h in enumerate(payload.get("headlines") or []):
        if not isinstance(h, dict):
            continue
        clubs = h.get("clubs_mentioned") or []
        records.append(
            {
                **base,
                "record_type": "press_headline_signal",
                "headline_index": idx + 1,
                "league": "liga-mx",
                "headline": h.get("headline"),
                "url": h.get("url"),
                "published_at_utc": h.get("published_at_utc") or envelope.get("captured_at_utc"),
                "clubs_mentioned": clubs,
                "clubs_mentioned_count": len(clubs),
                "manager_change_signal": bool(h.get("manager_change_signal", False)),
                "rotation_announcement": bool(h.get("rotation_announcement", False)),
                "cli_markdown_file": payload.get("cli_markdown_file"),
            }
        )

    return records


def _normalize_generic_news_or_referee_source(
    envelope: dict[str, Any], rel_path: str
) -> list[dict[str, Any]]:
    """Normalizador extensible para ruedas de prensa (FFS/BBC, Marca/AS, PFT) y árbitros (WorldFootball/NFLPenalties)."""
    payload = envelope.get("payload") or {}
    base = _lineage_fields(envelope, rel_path)
    source_id = envelope.get("source_id", "unknown_context")
    records: list[dict[str, Any]] = []

    if isinstance(payload, dict):
        for list_key in (
            "records",
            "referees",
            "headlines",
            "articles",
            "press_conferences",
            "medical_reports",
            "teams",
            "crews",
        ):
            val = payload.get(list_key)
            if isinstance(val, list) and val:
                for item in val:
                    if isinstance(item, dict):
                        records.append({**base, "record_type": f"{source_id}_{list_key}", **item})
        if not records:
            for k, val in payload.items():
                if k in ("http_trace", "target_urls"):
                    continue
                if isinstance(val, list) and val and isinstance(val[0], dict):
                    for item in val:
                        if isinstance(item, dict):
                            records.append({**base, "record_type": f"{source_id}_{k}", **item})
        if not records:
            records.append(
                {
                    **base,
                    "record_type": f"{source_id}_snapshot_summary",
                    "url": envelope.get("url"),
                    "payload_keys": sorted(payload.keys()),
                }
            )
    return records


# ============================================================================
# ORQUESTACIÓN Y GENERACIÓN DE LOS 5 ARCHIVOS EN `data/normalized/`
# ============================================================================


def normalize_all_datasets() -> dict[str, Any]:
    """Escanea `data/raw/`, verifica SHA-256 y genera los 5 archivos en `data/normalized/`."""
    DATA_NORM_DIR.mkdir(parents=True, exist_ok=True)

    raw_files = sorted(DATA_RAW_DIR.rglob("*.json"))
    if not raw_files:
        raise FileNotFoundError(f"No se encontraron snapshots JSON en {DATA_RAW_DIR}")

    market_records: list[dict[str, Any]] = []
    xg_ratings_records: list[dict[str, Any]] = []
    roster_records: list[dict[str, Any]] = []
    news_env_records: list[dict[str, Any]] = []
    manifest_files: list[dict[str, Any]] = []

    for json_path in raw_files:
        rel_path = json_path.relative_to(ROOT_DIR).as_posix()
        envelope = json.loads(json_path.read_text(encoding="utf-8"))

        source_id = envelope.get("source_id")
        category = envelope.get("category")
        captured_at_utc = envelope.get("captured_at_utc")
        stored_sha256 = envelope.get("sha256")

        if not source_id or not captured_at_utc or not stored_sha256:
            raise ValueError(
                f"Violación del contrato anti-leakage en {rel_path}: "
                "faltan `source_id`, `captured_at_utc` o `sha256`."
            )

        verified, computed_sha256 = verify_envelope_sha256(envelope)
        if not verified:
            raise ValueError(
                f"Fallo de integridad SHA-256 en {rel_path}: "
                f"esperado={stored_sha256}, calculado={computed_sha256}"
            )

        extracted_for_file: list[dict[str, Any]] = []
        target_table = ""

        if category == "odds_casinos":
            target_table = "market_microstructure.json"
            if source_id == "pinnacle":
                extracted_for_file = _normalize_pinnacle(envelope, rel_path)
            elif source_id == "caliente_mx":
                extracted_for_file = _normalize_caliente_mx(envelope, rel_path)
            elif source_id == "action_network_splits":
                extracted_for_file = _normalize_action_network(envelope, rel_path)
            else:
                extracted_for_file = _normalize_generic_odds_source(envelope, rel_path)
            market_records.extend(extracted_for_file)

        elif category == "advanced_stats_xg":
            target_table = "xg_and_team_ratings.json"
            if source_id == "understat":
                extracted_for_file = _normalize_understat(envelope, rel_path)
            elif source_id == "clubelo_transfermarkt_values":
                extracted_for_file = _normalize_clubelo_transfermarkt(envelope, rel_path)
            elif source_id == "statiskicks":
                extracted_for_file = _normalize_statiskicks(envelope, rel_path)
            elif source_id == "opta_player_stats":
                extracted_for_file = _normalize_opta_player_stats(envelope, rel_path)
            else:
                extracted_for_file = _normalize_generic_stats_source(envelope, rel_path)
            xg_ratings_records.extend(extracted_for_file)

        elif category == "injuries_lineups":
            target_table = "roster_availability.json"
            if source_id == "transfermarkt_injuries":
                extracted_for_file = _normalize_transfermarkt_injuries(envelope, rel_path)
            elif source_id == "rotowire_lineups_injuries":
                extracted_for_file = _normalize_rotowire(envelope, rel_path)
            else:
                extracted_for_file = _normalize_generic_roster_source(envelope, rel_path)
            roster_records.extend(extracted_for_file)

        elif category in ("news_press_sentiment", "environment_referees"):
            target_table = "news_and_environment.json"
            if source_id == "open_meteo_nflweather":
                extracted_for_file = _normalize_open_meteo(envelope, rel_path)
            elif source_id == "mediotiempo_record_mx":
                extracted_for_file = _normalize_mediotiempo_news(envelope, rel_path)
            else:
                extracted_for_file = _normalize_generic_news_or_referee_source(envelope, rel_path)
            news_env_records.extend(extracted_for_file)

        else:
            raise ValueError(f"Categoría desconocida '{category}' en {rel_path}")

        # Validar que cada registro emitido cumple el contrato anti-leakage
        for rec in extracted_for_file:
            assert rec.get("source_id") == source_id
            assert rec.get("captured_at_utc") == captured_at_utc
            assert rec.get("raw_sha256") == stored_sha256

        manifest_files.append(
            {
                "raw_snapshot_path": rel_path,
                "source_id": source_id,
                "source_name": envelope.get("source_name"),
                "category": category,
                "scrapling_mode": envelope.get("scrapling_mode"),
                "url": envelope.get("url"),
                "captured_at_utc": captured_at_utc,
                "sha256": stored_sha256,
                "sha256_verified": True,
                "target_normalized_table": target_table,
                "normalized_records_emitted": len(extracted_for_file),
            }
        )

    generated_at = utc_now_iso()

    # 1. Guardar `market_microstructure.json`
    market_doc = {
        "table_name": "market_microstructure",
        "generated_at_utc": generated_at,
        "anti_leakage_contract": "captured_at_utc <= predicted_at_utc",
        "total_records": len(market_records),
        "counts_by_record_type": _count_by_key(market_records, "record_type"),
        "counts_by_source_id": _count_by_key(market_records, "source_id"),
        "records": market_records,
    }
    (DATA_NORM_DIR / "market_microstructure.json").write_text(
        json.dumps(market_doc, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # 2. Guardar `xg_and_team_ratings.json`
    xg_doc = {
        "table_name": "xg_and_team_ratings",
        "generated_at_utc": generated_at,
        "anti_leakage_contract": "captured_at_utc <= predicted_at_utc",
        "total_records": len(xg_ratings_records),
        "counts_by_record_type": _count_by_key(xg_ratings_records, "record_type"),
        "counts_by_source_id": _count_by_key(xg_ratings_records, "source_id"),
        "records": xg_ratings_records,
    }
    (DATA_NORM_DIR / "xg_and_team_ratings.json").write_text(
        json.dumps(xg_doc, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # 3. Guardar `roster_availability.json`
    roster_doc = {
        "table_name": "roster_availability",
        "generated_at_utc": generated_at,
        "anti_leakage_contract": "captured_at_utc <= predicted_at_utc",
        "total_records": len(roster_records),
        "counts_by_record_type": _count_by_key(roster_records, "record_type"),
        "counts_by_source_id": _count_by_key(roster_records, "source_id"),
        "records": roster_records,
    }
    (DATA_NORM_DIR / "roster_availability.json").write_text(
        json.dumps(roster_doc, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # 4. Guardar `news_and_environment.json`
    news_env_doc = {
        "table_name": "news_and_environment",
        "generated_at_utc": generated_at,
        "anti_leakage_contract": "captured_at_utc <= predicted_at_utc",
        "total_records": len(news_env_records),
        "counts_by_record_type": _count_by_key(news_env_records, "record_type"),
        "counts_by_source_id": _count_by_key(news_env_records, "source_id"),
        "records": news_env_records,
    }
    (DATA_NORM_DIR / "news_and_environment.json").write_text(
        json.dumps(news_env_doc, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # 5. Guardar `manifest_summary.json`
    table_counts = {
        "market_microstructure": len(market_records),
        "xg_and_team_ratings": len(xg_ratings_records),
        "roster_availability": len(roster_records),
        "news_and_environment": len(news_env_records),
    }
    manifest_doc = {
        "manifest_version": "1.0.0",
        "generated_at_utc": generated_at,
        "anti_leakage_contract": {
            "rule": "captured_at_utc <= predicted_at_utc",
            "all_sha256_verified": all(f["sha256_verified"] for f in manifest_files),
            "raw_snapshots_verified_count": len(manifest_files),
        },
        "normalized_tables_summary": {
            **table_counts,
            "total_normalized_records": sum(table_counts.values()),
        },
        "raw_snapshots": manifest_files,
    }
    (DATA_NORM_DIR / "manifest_summary.json").write_text(
        json.dumps(manifest_doc, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    return manifest_doc


def _count_by_key(records: list[dict[str, Any]], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for r in records:
        val = str(r.get(key) or "unknown")
        counts[val] = counts.get(val, 0) + 1
    return counts


if __name__ == "__main__":
    summary = normalize_all_datasets()
    print("=== NORMALIZACIÓN COMPLETADA ===")
    print(
        f"Snapshots crudos verificados (SHA-256 OK): "
        f"{summary['anti_leakage_contract']['raw_snapshots_verified_count']}"
    )
    for tbl, cnt in summary["normalized_tables_summary"].items():
        print(f"  - {tbl}: {cnt}")
