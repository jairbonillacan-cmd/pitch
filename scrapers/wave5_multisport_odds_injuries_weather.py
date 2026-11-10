"""Scraper Profundo Ola 5 (Wave 5 Multi-Sport Odds, Injuries/Starters & 60 MLB/NCAAF Ballparks) con Scrapling.

REGLA DE INGENIERÍA ESTRICTA:
Toda extracción se realiza exclusivamente con Scrapling (`FetcherSession`, `Selector`) a través de
`PitchLabScraplingBase` (`scrapers/base_scraper.py`). Cada captura queda sellada con
`captured_at_utc` (ISO-8601 UTC) y `sha256` verificable.

Cubre 4 fuentes multi-deporte norteamericanas (`NBA`, `NHL`, `MLB`, `NCAAF`, `NFL`):
1. `action_network_splits` (`odds_casinos`):
   - Extrae `script#__NEXT_DATA__` desde `/public-betting` y `/odds` para `nba`, `nhl`, `mlb`, `ncaaf` y `nfl`.
   - Captura líneas `open` (`book_id=30`) vs `current` (`book_id=15` Consensus / sportsbooks),
     `% tickets` vs `% money`, `sharp_divergence` y `rlm_flag` (Reverse Line Movement).
   - Label: `action_network_multisport_nba_nhl_mlb_ncaaf_splits`.
2. `betfair_smarkets_exchange` (`odds_casinos`):
   - Consulta `api.smarkets.com/v3/events/...` (categorías `basketball`, `ice-hockey`, `baseball`,
     `american-football`) con `FetcherSession` para extraer contratos y cotizaciones `back`/`lay`/`mid`
     y `spread_bps` para `NBA`, `NHL`, `MLB`, `NCAAF` y `NFL` (registrando bloqueo anti-bot si aplica,
     sin evadir ni resolver retos de seguridad).
   - Label: `smarkets_multisport_nba_nhl_mlb_ncaaf_exchange`.
3. `rotowire_lineups_injuries` (`injuries_lineups`):
   - Combina partes oficiales de lesionados y titulares/abridores de `NBA`, `NHL`, `MLB` y `NCAAF`
     desde CBS Sports, ESPN API (injuries + scoreboards con probable pitchers/goalies), RotoWire
     (lineups + injury tables) y Covers NCAAF Injuries vía `FetcherSession`.
   - Label: `espn_cbs_rotowire_multisport_injuries_starters`.
4. `open_meteo_nflweather` (`environment_referees`):
   - Catálogo exacto de los 30 estadios de MLB + los 30 principales estadios abiertos de NCAAF (60 total).
   - Pronóstico horario de 7 días (`168h` × `60` = `10,080` puntos horarios) con `elevation` (m),
     `temperature_2m`, `relative_humidity_2m`, `precipitation`, `wind_speed_10m` (`mph`),
     `wind_gusts_10m` (`mph`), `wind_direction_10m` y `surface_pressure`.
   - Label: `open_meteo_30_mlb_ballparks_and_30_ncaaf_stadiums_7d`.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys
from typing import Any

from scrapling.fetchers import FetcherSession
from scrapling.parser import Selector

SCRIPT_DIR = Path(__file__).resolve().parent
WORKTREE_ROOT = SCRIPT_DIR.parent
if str(WORKTREE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKTREE_ROOT))

from scrapers.base_scraper import DATA_RAW_DIR, PitchLabScraplingBase, utc_now_iso  # noqa: E402


WAVE5_LABELS = {
    "action_network_splits": "action_network_multisport_nba_nhl_mlb_ncaaf_splits",
    "betfair_smarkets_exchange": "smarkets_multisport_nba_nhl_mlb_ncaaf_exchange",
    "rotowire_lineups_injuries": "espn_cbs_rotowire_multisport_injuries_starters",
    "open_meteo_nflweather": "open_meteo_30_mlb_ballparks_and_30_ncaaf_stadiums_7d",
}


def _safe_json_loads(raw: bytes | str | None) -> Any | None:
    if not raw:
        return None
    try:
        text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else raw
        return json.loads(text)
    except Exception:
        return None


def _response_text(resp: Any) -> str:
    if resp is None:
        return ""
    body = getattr(resp, "body", b"")
    if isinstance(body, bytes):
        return body.decode("utf-8", errors="replace")
    if isinstance(body, str) and body:
        return body
    return str(getattr(resp, "text", "") or "")


def _clean_own_wave5_label_snapshots(category: str, source_id: str, label: str) -> int:
    """Limpia únicamente snapshots previos del mismo label de Wave 5, preservando Waves 1–4."""
    if label not in WAVE5_LABELS.values():
        raise ValueError(f"Label '{label}' fuera del alcance autorizado de Wave 5.")
    src_dir = DATA_RAW_DIR / category / source_id
    if not src_dir.exists():
        return 0
    removed = 0
    for existing in src_dir.rglob(f"*_{label}_*.json"):
        existing.unlink(missing_ok=True)
        removed += 1
    return removed


def _to_float(val: Any) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _american_to_implied_prob(american: Any) -> float | None:
    odds = _to_float(american)
    if odds is None or odds == 0:
        return None
    if odds > 0:
        return round(100.0 / (odds + 100.0), 6)
    return round(abs(odds) / (abs(odds) + 100.0), 6)


# ===========================================================================
# 1. ACTION NETWORK SPLITS & OPEN VS CURRENT LINES (NBA, NHL, MLB, NCAAF, NFL)
# ===========================================================================

ACTION_NETWORK_SPORTS = ("nba", "nhl", "mlb", "ncaaf", "nfl")

ACTION_NETWORK_WAVE5_URLS: list[tuple[str, str, str]] = [
    (sport, view, f"https://www.actionnetwork.com/{sport}/{view}")
    for sport in ACTION_NETWORK_SPORTS
    for view in ("public-betting", "odds")
]


def _extract_book_market_summary(book_event_mkts: dict[str, Any]) -> dict[str, Any]:
    """Extrae líneas y splits (spread, total, moneyline) desde un bloque `markets[book_id]['event']`."""
    summary: dict[str, Any] = {
        "spread": {},
        "total": {},
        "moneyline": {},
    }
    if not isinstance(book_event_mkts, dict):
        return summary

    # Spread
    for out in book_event_mkts.get("spread") or []:
        if not isinstance(out, dict):
            continue
        side = str(out.get("side") or "").lower()
        if side not in ("home", "away"):
            continue
        bet_info = out.get("bet_info") or {}
        t_pct = _to_float((bet_info.get("tickets") or {}).get("percent"))
        m_pct = _to_float((bet_info.get("money") or {}).get("percent"))
        summary["spread"][f"{side}_line"] = _to_float(out.get("value"))
        summary["spread"][f"{side}_odds"] = _to_float(out.get("odds"))
        if t_pct is not None:
            summary["spread"][f"{side}_tickets_pct"] = t_pct
        if m_pct is not None:
            summary["spread"][f"{side}_money_pct"] = m_pct

    # Total
    for out in book_event_mkts.get("total") or []:
        if not isinstance(out, dict):
            continue
        side = str(out.get("side") or "").lower()
        if side not in ("over", "under"):
            continue
        bet_info = out.get("bet_info") or {}
        t_pct = _to_float((bet_info.get("tickets") or {}).get("percent"))
        m_pct = _to_float((bet_info.get("money") or {}).get("percent"))
        if out.get("value") is not None:
            summary["total"]["line"] = _to_float(out.get("value"))
        summary["total"][f"{side}_odds"] = _to_float(out.get("odds"))
        if t_pct is not None:
            summary["total"][f"{side}_tickets_pct"] = t_pct
        if m_pct is not None:
            summary["total"][f"{side}_money_pct"] = m_pct

    # Moneyline
    for out in book_event_mkts.get("moneyline") or []:
        if not isinstance(out, dict):
            continue
        side = str(out.get("side") or "").lower()
        if side not in ("home", "away", "draw"):
            continue
        bet_info = out.get("bet_info") or {}
        t_pct = _to_float((bet_info.get("tickets") or {}).get("percent"))
        m_pct = _to_float((bet_info.get("money") or {}).get("percent"))
        summary["moneyline"][f"{side}_odds"] = _to_float(out.get("odds"))
        if t_pct is not None:
            summary["moneyline"][f"{side}_tickets_pct"] = t_pct
        if m_pct is not None:
            summary["moneyline"][f"{side}_money_pct"] = m_pct

    return summary


def _parse_action_network_game(
    g: dict[str, Any],
    sport_slug: str,
    source_url: str,
    book_names: dict[str, str],
) -> dict[str, Any]:
    teams = g.get("teams") or []
    home_id = g.get("home_team_id")
    away_id = g.get("away_team_id")
    home_team_obj = next(
        (t for t in teams if isinstance(t, dict) and t.get("id") == home_id),
        teams[0] if teams and isinstance(teams[0], dict) else {},
    )
    away_team_obj = next(
        (t for t in teams if isinstance(t, dict) and t.get("id") == away_id),
        teams[1] if len(teams) > 1 and isinstance(teams[1], dict) else {},
    )

    markets = g.get("markets") or {}
    extracted_markets: list[dict[str, Any]] = []
    per_book_summaries: dict[str, dict[str, Any]] = {}

    if isinstance(markets, dict):
        for book_id, book_data in markets.items():
            if not isinstance(book_data, dict):
                continue
            event_mkts = book_data.get("event") if isinstance(book_data.get("event"), dict) else book_data
            if not isinstance(event_mkts, dict):
                continue
            b_str = str(book_id)
            per_book_summaries[b_str] = _extract_book_market_summary(event_mkts)

            for mkt_type, outcomes in event_mkts.items():
                if not isinstance(outcomes, list):
                    continue
                for out in outcomes:
                    if not isinstance(out, dict):
                        continue
                    bet_info = out.get("bet_info") or {}
                    tickets = bet_info.get("tickets") or {}
                    money = bet_info.get("money") or {}
                    t_pct = _to_float(tickets.get("percent"))
                    m_pct = _to_float(money.get("percent"))
                    divergence = (
                        round(m_pct - t_pct, 2)
                        if (t_pct is not None and m_pct is not None)
                        else None
                    )
                    extracted_markets.append(
                        {
                            "book_id": b_str,
                            "book_name": book_names.get(b_str, f"book_{b_str}"),
                            "market_type": mkt_type,
                            "side": out.get("side"),
                            "value": out.get("value"),
                            "odds": out.get("odds"),
                            "is_live": out.get("is_live"),
                            "tickets_pct": t_pct,
                            "tickets_value": tickets.get("value"),
                            "money_pct": m_pct,
                            "money_value": money.get("value"),
                            "money_minus_tickets_pct": divergence,
                            "reverse_line_movement_signal": bool(
                                divergence is not None and abs(divergence) >= 15.0
                            ),
                        }
                    )

    # Book 30 en Action Network es la línea de apertura ("Open"); Book 15 es "Consensus" actual
    open_summary = per_book_summaries.get("30", {"spread": {}, "total": {}, "moneyline": {}})
    current_book_order = ["15", "68", "69", "75", "79", "71"]
    current_summary: dict[str, Any] = {"spread": {}, "total": {}, "moneyline": {}}
    for candidate_bid in current_book_order:
        cand = per_book_summaries.get(candidate_bid)
        if not cand:
            continue
        for mtype in ("spread", "total", "moneyline"):
            for k, val in cand.get(mtype, {}).items():
                if val is not None and k not in current_summary[mtype]:
                    current_summary[mtype][k] = val

    # También rescatar splits si otro book tenía tickets_pct / money_pct
    for cand in per_book_summaries.values():
        for mtype in ("spread", "total", "moneyline"):
            for k, val in cand.get(mtype, {}).items():
                if ("tickets_pct" in k or "money_pct" in k) and val is not None and k not in current_summary[mtype]:
                    current_summary[mtype][k] = val

    open_lines = {
        "spread": {
            "home_line": open_summary["spread"].get("home_line"),
            "home_odds": open_summary["spread"].get("home_odds"),
            "away_line": open_summary["spread"].get("away_line"),
            "away_odds": open_summary["spread"].get("away_odds"),
        },
        "total": {
            "line": open_summary["total"].get("line"),
            "over_odds": open_summary["total"].get("over_odds"),
            "under_odds": open_summary["total"].get("under_odds"),
        },
        "moneyline": {
            "home_odds": open_summary["moneyline"].get("home_odds"),
            "away_odds": open_summary["moneyline"].get("away_odds"),
        },
    }

    current_lines = {
        "spread": {
            "home_line": current_summary["spread"].get("home_line"),
            "home_odds": current_summary["spread"].get("home_odds"),
            "away_line": current_summary["spread"].get("away_line"),
            "away_odds": current_summary["spread"].get("away_odds"),
        },
        "total": {
            "line": current_summary["total"].get("line"),
            "over_odds": current_summary["total"].get("over_odds"),
            "under_odds": current_summary["total"].get("under_odds"),
        },
        "moneyline": {
            "home_odds": current_summary["moneyline"].get("home_odds"),
            "away_odds": current_summary["moneyline"].get("away_odds"),
        },
    }

    def _diff(m: float | None, t: float | None) -> float | None:
        return round(m - t, 2) if (m is not None and t is not None) else None

    sp_ht = current_summary["spread"].get("home_tickets_pct")
    sp_hm = current_summary["spread"].get("home_money_pct")
    sp_at = current_summary["spread"].get("away_tickets_pct")
    sp_am = current_summary["spread"].get("away_money_pct")

    tot_ot = current_summary["total"].get("over_tickets_pct")
    tot_om = current_summary["total"].get("over_money_pct")
    tot_ut = current_summary["total"].get("under_tickets_pct")
    tot_um = current_summary["total"].get("under_money_pct")

    ml_ht = current_summary["moneyline"].get("home_tickets_pct")
    ml_hm = current_summary["moneyline"].get("home_money_pct")
    ml_at = current_summary["moneyline"].get("away_tickets_pct")
    ml_am = current_summary["moneyline"].get("away_money_pct")

    splits = {
        "spread": {
            "home_tickets_pct": sp_ht,
            "home_money_pct": sp_hm,
            "away_tickets_pct": sp_at,
            "away_money_pct": sp_am,
            "home_sharp_divergence": _diff(sp_hm, sp_ht),
            "away_sharp_divergence": _diff(sp_am, sp_at),
        },
        "total": {
            "over_tickets_pct": tot_ot,
            "over_money_pct": tot_om,
            "under_tickets_pct": tot_ut,
            "under_money_pct": tot_um,
            "over_sharp_divergence": _diff(tot_om, tot_ot),
            "under_sharp_divergence": _diff(tot_um, tot_ut),
        },
        "moneyline": {
            "home_tickets_pct": ml_ht,
            "home_money_pct": ml_hm,
            "away_tickets_pct": ml_at,
            "away_money_pct": ml_am,
            "home_sharp_divergence": _diff(ml_hm, ml_ht),
            "away_sharp_divergence": _diff(ml_am, ml_at),
        },
    }

    candidate_divs = [
        d
        for d in (
            splits["spread"]["home_sharp_divergence"],
            splits["spread"]["away_sharp_divergence"],
            splits["total"]["over_sharp_divergence"],
            splits["total"]["under_sharp_divergence"],
            splits["moneyline"]["home_sharp_divergence"],
            splits["moneyline"]["away_sharp_divergence"],
        )
        if d is not None
    ]
    for mkt in extracted_markets:
        d = mkt.get("money_minus_tickets_pct")
        if isinstance(d, (int, float)):
            candidate_divs.append(float(d))

    sharp_divergence = (
        max(candidate_divs, key=lambda x: abs(x)) if candidate_divs else None
    )

    # Detección real de Reverse Line Movement (RLM): línea moviéndose en contra de >55% de tickets públicos
    open_sp = open_lines["spread"]["home_line"]
    curr_sp = current_lines["spread"]["home_line"]
    spread_rlm = False
    if open_sp is not None and curr_sp is not None and open_sp != curr_sp:
        if sp_ht is not None and sp_ht > 55.0 and curr_sp > open_sp:
            spread_rlm = True
        elif sp_at is not None and sp_at > 55.0 and curr_sp < open_sp:
            spread_rlm = True

    open_tot = open_lines["total"]["line"]
    curr_tot = current_lines["total"]["line"]
    total_rlm = False
    if open_tot is not None and curr_tot is not None and open_tot != curr_tot:
        if tot_ot is not None and tot_ot > 55.0 and curr_tot < open_tot:
            total_rlm = True
        elif tot_ut is not None and tot_ut > 55.0 and curr_tot > open_tot:
            total_rlm = True

    open_ml_h_prob = _american_to_implied_prob(open_lines["moneyline"]["home_odds"])
    curr_ml_h_prob = _american_to_implied_prob(current_lines["moneyline"]["home_odds"])
    ml_rlm = False
    if open_ml_h_prob is not None and curr_ml_h_prob is not None:
        if ml_ht is not None and ml_ht > 55.0 and (curr_ml_h_prob - open_ml_h_prob) <= -0.015:
            ml_rlm = True
        elif ml_at is not None and ml_at > 55.0 and (curr_ml_h_prob - open_ml_h_prob) >= 0.015:
            ml_rlm = True

    sharp_div_flag = bool(sharp_divergence is not None and abs(sharp_divergence) >= 15.0)
    rlm_flag = bool(spread_rlm or total_rlm or ml_rlm or sharp_div_flag)

    league_code = (g.get("league_name") or sport_slug).lower()

    return {
        "game_id": g.get("id"),
        "league": league_code,
        "league_name": g.get("league_name") or sport_slug.upper(),
        "sport": sport_slug,
        "season": g.get("season"),
        "week": g.get("week"),
        "start_time": g.get("start_time"),
        "status": g.get("status"),
        "num_bets": g.get("num_bets"),
        "home_team": home_team_obj.get("full_name") or home_team_obj.get("display_name"),
        "away_team": away_team_obj.get("full_name") or away_team_obj.get("display_name"),
        "home_abbr": home_team_obj.get("abbr"),
        "away_abbr": away_team_obj.get("abbr"),
        "lines": {
            "open": open_lines,
            "current": current_lines,
        },
        "open_lines": open_lines,
        "current_lines": current_lines,
        "splits": splits,
        "sharp_divergence": sharp_divergence,
        "rlm_flag": rlm_flag,
        "rlm_signals": {
            "spread_rlm": spread_rlm,
            "total_rlm": total_rlm,
            "moneyline_rlm": ml_rlm,
            "sharp_divergence_ge_15pct": sharp_div_flag,
        },
        "source_url": source_url,
        "markets_count": len(extracted_markets),
        "markets": extracted_markets[:120],
    }


def _merge_action_network_games(existing: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    """Combina `/public-betting` y `/odds` conservando splits y el mayor desglose de casas."""
    primary, secondary = (
        (incoming, existing)
        if incoming.get("markets_count", 0) > existing.get("markets_count", 0)
        else (existing, incoming)
    )
    merged = dict(primary)
    if merged.get("sharp_divergence") is None and secondary.get("sharp_divergence") is not None:
        merged["sharp_divergence"] = secondary["sharp_divergence"]
    merged["rlm_flag"] = bool(primary.get("rlm_flag") or secondary.get("rlm_flag"))
    if not merged.get("num_bets") and secondary.get("num_bets"):
        merged["num_bets"] = secondary["num_bets"]

    # Preservar splits si estaban en `/public-betting`
    for mtype in ("spread", "total", "moneyline"):
        p_s = (merged.get("splits") or {}).get(mtype) or {}
        s_s = (secondary.get("splits") or {}).get(mtype) or {}
        for k, v in s_s.items():
            if p_s.get(k) is None and v is not None:
                p_s[k] = v
    return merged


def scrape_action_network_multisport_splits() -> dict[str, Any]:
    """1. Extrae Action Network `/public-betting` y `/odds` para NBA, NHL, MLB, NCAAF y NFL."""
    scraper = PitchLabScraplingBase("action_network_splits")
    label = WAVE5_LABELS["action_network_splits"]

    pages_trace: list[dict[str, Any]] = []
    games_by_id: dict[Any, dict[str, Any]] = {}

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        for sport_slug, view_type, url in ACTION_NETWORK_WAVE5_URLS:
            try:
                resp = session.get(url, timeout=25)
                title = (resp.css("title::text").get() or "").strip()
                next_data_raw = resp.css("script#__NEXT_DATA__::text").get()
                extracted_count = 0
                markets_count = 0

                if next_data_raw:
                    parsed = _safe_json_loads(next_data_raw)
                    if isinstance(parsed, dict):
                        page_props = (parsed.get("props") or {}).get("pageProps") or {}
                        all_books_raw = page_props.get("allBooks") or {}
                        book_names: dict[str, str] = {}
                        if isinstance(all_books_raw, dict):
                            for bid, bmeta in all_books_raw.items():
                                if isinstance(bmeta, dict):
                                    book_names[str(bid)] = (
                                        bmeta.get("display_name")
                                        or bmeta.get("source_name")
                                        or f"book_{bid}"
                                    )

                        scoreboard = page_props.get("scoreboardResponse") or {}
                        raw_games = scoreboard.get("games") or page_props.get("games") or []
                        if isinstance(raw_games, list):
                            for g in raw_games:
                                if not isinstance(g, dict):
                                    continue
                                norm_g = _parse_action_network_game(g, sport_slug, url, book_names)
                                extracted_count += 1
                                markets_count += norm_g["markets_count"]
                                gid = norm_g.get("game_id") or (
                                    f"{sport_slug}_{norm_g.get('away_team')}_{norm_g.get('home_team')}_{norm_g.get('start_time')}"
                                )
                                if gid in games_by_id:
                                    games_by_id[gid] = _merge_action_network_games(
                                        games_by_id[gid], norm_g
                                    )
                                else:
                                    games_by_id[gid] = norm_g

                pages_trace.append(
                    {
                        "sport": sport_slug,
                        "view": view_type,
                        "url": url,
                        "status": resp.status,
                        "title": title,
                        "games_extracted": extracted_count,
                        "markets_extracted": markets_count,
                    }
                )
            except Exception as exc:
                pages_trace.append(
                    {"sport": sport_slug, "view": view_type, "url": url, "error": str(exc)}
                )

    unique_games = list(games_by_id.values())
    games_by_league: dict[str, int] = {}
    rlm_games_count = 0
    for g in unique_games:
        lg = g.get("sport") or g.get("league") or "unknown"
        games_by_league[lg] = games_by_league.get(lg, 0) + 1
        if g.get("rlm_flag"):
            rlm_games_count += 1

    total_market_outcomes = sum(g.get("markets_count", 0) for g in unique_games)
    total_records = len(unique_games) + total_market_outcomes

    payload = {
        "captured_at_utc": utc_now_iso(),
        "source_id": "action_network_splits",
        "target_urls": [u for _, _, u in ACTION_NETWORK_WAVE5_URLS],
        "summary": {
            "pages_fetched": len(pages_trace),
            "unique_games_extracted": len(unique_games),
            "games_by_league": games_by_league,
            "rlm_flagged_games_count": rlm_games_count,
            "total_bookmaker_market_outcomes": total_market_outcomes,
            "total_records": total_records,
        },
        "pages": pages_trace,
        "games": unique_games,
    }

    _clean_own_wave5_label_snapshots(scraper.category, scraper.source_id, label)
    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=ACTION_NETWORK_WAVE5_URLS[0][2],
        label=label,
        extra_meta=payload["summary"],
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": scraper.source_id,
        "category": scraper.category,
        "label": label,
        "path": str(out_path),
        "unique_games_count": len(unique_games),
        "games_by_league": games_by_league,
        "rlm_flagged_games_count": rlm_games_count,
        "total_bookmaker_market_outcomes": total_market_outcomes,
        "record_count": total_records,
        "sha256": sha256_val,
    }


# ===========================================================================
# 2. SMARKETS P2P EXCHANGE (BASKETBALL / ICE-HOCKEY / BASEBALL / AM-FOOTBALL)
# ===========================================================================

SMARKETS_MULTISPORT_ENDPOINTS: list[tuple[str, str, str]] = [
    (
        "basketball",
        "nba",
        "https://api.smarkets.com/v3/events/?state=new&state=upcoming&state=live&type=basketball_match&limit=50",
    ),
    (
        "ice-hockey",
        "nhl",
        "https://api.smarkets.com/v3/events/?state=new&state=upcoming&state=live&type=ice_hockey_match&limit=50",
    ),
    (
        "baseball",
        "mlb",
        "https://api.smarkets.com/v3/events/?state=new&state=upcoming&state=live&type=baseball_match&limit=50",
    ),
    (
        "american-football",
        "nfl_ncaaf",
        "https://api.smarkets.com/v3/events/?state=new&state=upcoming&state=live&type=american_football_match&limit=50",
    ),
]


def _classify_smarkets_league(full_slug: str | None, default_hint: str) -> str:
    slug = (full_slug or "").lower()
    if "nba" in slug:
        return "nba"
    if "nhl" in slug:
        return "nhl"
    if "mlb" in slug:
        return "mlb"
    if "ncaa" in slug or "college" in slug or "cfb" in slug:
        return "ncaaf"
    if "nfl" in slug:
        return "nfl"
    return default_hint


def _is_anti_bot_security_gate(status: int | None, text: str, title: str) -> bool:
    if status not in (401, 403, 429, 503):
        return False
    combined = f"{title} {text[:2000]}".lower()
    gate_markers = (
        "security check",
        "checking your browser",
        "verify you are human",
        "cloudflare",
        "turnstile",
        "captcha",
        "enable javascript and cookies to continue",
    )
    return any(m in combined for m in gate_markers)


def scrape_smarkets_multisport_exchange() -> dict[str, Any]:
    """2. Extrae eventos, contratos y cotizaciones P2P de Smarkets API v3 con FetcherSession.

    Respeta estrictamente la política de seguridad: si `api.smarkets.com` interpone un
    reto anti-bot (`Security Check` / HTTP 403), NO intenta resolverlo, esperarlo ni evadirlo;
    registra el bloqueo de forma transparente en `fetcher_probes` y `summary`.
    """
    scraper = PitchLabScraplingBase("betfair_smarkets_exchange")
    label = WAVE5_LABELS["betfair_smarkets_exchange"]

    http_trace: list[dict[str, Any]] = []
    fetcher_probes: list[dict[str, Any]] = []
    events_extracted: list[dict[str, Any]] = []
    markets_extracted: list[dict[str, Any]] = []
    contracts_by_id: dict[str, dict[str, Any]] = {}
    quotes_extracted: list[dict[str, Any]] = []
    blocked_by_anti_bot_gate = False
    anti_bot_gate_detail: str | None = None

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        for category_slug, league_hint, url in SMARKETS_MULTISPORT_ENDPOINTS:
            try:
                resp = session.get(url, timeout=20)
                text = _response_text(resp)
                title = (resp.css("title::text").get() or "").strip()
                parsed = _safe_json_loads(text)
                has_json = isinstance(parsed, dict)

                gate_detected = _is_anti_bot_security_gate(resp.status, text, title)
                probe_entry = {
                    "category": category_slug,
                    "league_hint": league_hint,
                    "url": url,
                    "status": resp.status,
                    "title": title,
                    "has_json": has_json,
                    "blocked_by_anti_bot_gate": gate_detected,
                }
                fetcher_probes.append(probe_entry)
                http_trace.append(probe_entry)

                if gate_detected:
                    blocked_by_anti_bot_gate = True
                    anti_bot_gate_detail = (
                        f"HTTP {resp.status} en {url} bloqueado por '{title or 'Security Check'}' "
                        "(anti-bot browser challenge; no se evade ni resuelve por política estricta)."
                    )
                    # Detener sondeos adicionales si el dominio exige reto anti-bot
                    break

                evs = parsed.get("events", []) if isinstance(parsed, dict) else []
                for ev in evs:
                    if not isinstance(ev, dict):
                        continue
                    league_code = _classify_smarkets_league(ev.get("full_slug"), league_hint)
                    events_extracted.append(
                        {
                            "event_id": str(ev.get("id")),
                            "name": ev.get("name"),
                            "short_name": ev.get("short_name"),
                            "full_slug": ev.get("full_slug"),
                            "league": league_code,
                            "category": category_slug,
                            "start_datetime": ev.get("start_datetime"),
                            "state": ev.get("state"),
                            "type": ev.get("type"),
                            "bettable": ev.get("bettable"),
                            "parent_id": str(ev.get("parent_id")),
                        }
                    )
            except Exception as exc:
                err_entry = {
                    "category": category_slug,
                    "url": url,
                    "status": None,
                    "has_json": False,
                    "error": str(exc),
                }
                fetcher_probes.append(err_entry)
                http_trace.append(err_entry)

        # Si `api.smarkets.com` respondió 200 JSON sin reto anti-bot, extraer markets, contracts y quotes
        if events_extracted and not blocked_by_anti_bot_gate:
            event_league_map = {e["event_id"]: e["league"] for e in events_extracted}
            selected_eids = [e["event_id"] for e in events_extracted[:40]]
            for start_i in range(0, len(selected_eids), 10):
                batch_eids = selected_eids[start_i : start_i + 10]
                eid_csv = ",".join(batch_eids)
                mkts_url = f"https://api.smarkets.com/v3/events/{eid_csv}/markets/"
                try:
                    m_resp = session.get(mkts_url, timeout=20)
                    m_parsed = _safe_json_loads(_response_text(m_resp))
                    mkts = m_parsed.get("markets", []) if isinstance(m_parsed, dict) else []
                    http_trace.append(
                        {"url": mkts_url, "status": m_resp.status, "markets_count": len(mkts)}
                    )
                    for m in mkts:
                        if not isinstance(m, dict):
                            continue
                        ev_id = str(m.get("event_id"))
                        markets_extracted.append(
                            {
                                "market_id": str(m.get("id")),
                                "event_id": ev_id,
                                "league": event_league_map.get(ev_id, "unknown"),
                                "name": m.get("name"),
                                "slug": m.get("slug"),
                                "market_type": (
                                    (m.get("market_type") or {}).get("name")
                                    if isinstance(m.get("market_type"), dict)
                                    else m.get("market_type")
                                ),
                                "state": m.get("state"),
                                "bettable": m.get("bettable"),
                                "inplay_enabled": m.get("inplay_enabled"),
                                "complete": m.get("complete"),
                            }
                        )
                except Exception as exc:
                    http_trace.append({"url": mkts_url, "error": str(exc)})

            priority_kw = ("winner", "moneyline", "to win", "spread", "handicap", "total", "over/under")
            priority_mids = [
                m["market_id"]
                for m in markets_extracted
                if any(
                    k in (m.get("name") or "").lower() or k in (m.get("slug") or "").lower()
                    for k in priority_kw
                )
            ][:60]
            market_map = {m["market_id"]: m for m in markets_extracted}

            for q_i in range(0, len(priority_mids), 15):
                batch_mids = priority_mids[q_i : q_i + 15]
                mid_csv = ",".join(batch_mids)
                contracts_url = f"https://api.smarkets.com/v3/markets/{mid_csv}/contracts/"
                quotes_url = f"https://api.smarkets.com/v3/markets/{mid_csv}/quotes/"
                try:
                    c_resp = session.get(contracts_url, timeout=20)
                    c_parsed = _safe_json_loads(_response_text(c_resp))
                    if isinstance(c_parsed, dict):
                        for c in c_parsed.get("contracts") or []:
                            if isinstance(c, dict) and c.get("id") is not None:
                                contracts_by_id[str(c["id"])] = c
                except Exception:
                    pass

                try:
                    q_resp = session.get(quotes_url, timeout=20)
                    q_parsed = _safe_json_loads(_response_text(q_resp))
                    http_trace.append(
                        {
                            "url": quotes_url,
                            "status": q_resp.status,
                            "contracts_quoted": len(q_parsed) if isinstance(q_parsed, dict) else 0,
                        }
                    )
                    if isinstance(q_parsed, dict):
                        for cid, q_data in q_parsed.items():
                            if not isinstance(q_data, dict):
                                continue
                            bids = q_data.get("bids") or []
                            offers = q_data.get("offers") or []
                            if not bids and not offers:
                                continue
                            # En Smarkets v3: `offers` = mejor probabilidad para apostador BACK; `bids` = LAY
                            bid_bps = (
                                _to_float(bids[0].get("price"))
                                if bids and isinstance(bids[0], dict)
                                else None
                            )
                            offer_bps = (
                                _to_float(offers[0].get("price"))
                                if offers and isinstance(offers[0], dict)
                                else None
                            )
                            back_prob = round(offer_bps / 10000.0, 6) if offer_bps else None
                            lay_prob = round(bid_bps / 10000.0, 6) if bid_bps else None
                            mid_prob = (
                                round((offer_bps + bid_bps) / 20000.0, 6)
                                if (offer_bps is not None and bid_bps is not None)
                                else (back_prob or lay_prob)
                            )
                            spread_bps = (
                                round(abs(offer_bps - bid_bps), 2)
                                if (offer_bps is not None and bid_bps is not None)
                                else None
                            )
                            back_dec = (
                                round(10000.0 / offer_bps, 4)
                                if offer_bps and offer_bps > 0
                                else None
                            )
                            lay_dec = (
                                round(10000.0 / bid_bps, 4)
                                if bid_bps and bid_bps > 0
                                else None
                            )
                            total_bid_qty = sum(
                                int(b.get("quantity", 0)) for b in bids if isinstance(b, dict)
                            )
                            total_offer_qty = sum(
                                int(o.get("quantity", 0)) for o in offers if isinstance(o, dict)
                            )
                            c_meta = contracts_by_id.get(str(cid), {})
                            m_id = str(c_meta.get("market_id") or "")
                            m_meta = market_map.get(m_id, {})

                            quotes_extracted.append(
                                {
                                    "contract_id": str(cid),
                                    "contract_name": c_meta.get("name"),
                                    "market_id": m_id or None,
                                    "event_id": m_meta.get("event_id"),
                                    "league": m_meta.get("league"),
                                    "best_bid_implied_bps": bid_bps,
                                    "best_offer_implied_bps": offer_bps,
                                    "back_prob": back_prob,
                                    "lay_prob": lay_prob,
                                    "mid_prob": mid_prob,
                                    "spread_bps": spread_bps,
                                    "best_back_decimal_odds": back_dec,
                                    "best_lay_decimal_odds": lay_dec,
                                    "total_bid_quantity_units": total_bid_qty,
                                    "total_offer_quantity_units": total_offer_qty,
                                    "liquidity_depth_bps_units": total_bid_qty + total_offer_qty,
                                    "bids_depth": bids[:5],
                                    "offers_depth": offers[:5],
                                }
                            )
                except Exception as exc:
                    http_trace.append({"url": quotes_url, "error": str(exc)})

    events_by_league: dict[str, int] = {}
    for ev in events_extracted:
        lg = ev.get("league") or "unknown"
        events_by_league[lg] = events_by_league.get(lg, 0) + 1

    total_records = (
        len(events_extracted)
        + len(markets_extracted)
        + len(quotes_extracted)
        + (len(fetcher_probes) if not events_extracted else 0)
    )

    payload = {
        "captured_at_utc": utc_now_iso(),
        "source_id": "betfair_smarkets_exchange",
        "target_urls": [u for _, _, u in SMARKETS_MULTISPORT_ENDPOINTS],
        "summary": {
            "events_extracted_count": len(events_extracted),
            "events_by_league": events_by_league,
            "markets_extracted_count": len(markets_extracted),
            "active_contract_quotes_count": len(quotes_extracted),
            "fetcher_probes_count": len(fetcher_probes),
            "blocked_by_anti_bot_gate": blocked_by_anti_bot_gate,
            "anti_bot_gate_detail": anti_bot_gate_detail,
            "total_records": total_records,
        },
        "http_trace": http_trace,
        "fetcher_probes": fetcher_probes,
        "exchange_events": events_extracted,
        "exchange_markets": markets_extracted[:500],
        "exchange_quotes": quotes_extracted,
    }

    _clean_own_wave5_label_snapshots(scraper.category, scraper.source_id, label)
    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=SMARKETS_MULTISPORT_ENDPOINTS[0][2],
        label=label,
        extra_meta=payload["summary"],
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": scraper.source_id,
        "category": scraper.category,
        "label": label,
        "path": str(out_path),
        "events_count": len(events_extracted),
        "markets_count": len(markets_extracted),
        "quotes_count": len(quotes_extracted),
        "blocked_by_anti_bot_gate": blocked_by_anti_bot_gate,
        "anti_bot_gate_detail": anti_bot_gate_detail,
        "record_count": total_records,
        "sha256": sha256_val,
    }


# ===========================================================================
# 3. MULTISPORT INJURIES & STARTERS (ESPN + CBS SPORTS + ROTOWIRE + COVERS CFB)
# ===========================================================================

CBS_INJURY_TARGETS: list[tuple[str, str, str]] = [
    ("basketball", "nba", "https://www.cbssports.com/nba/injuries/"),
    ("hockey", "nhl", "https://www.cbssports.com/nhl/injuries/"),
    ("baseball", "mlb", "https://www.cbssports.com/mlb/injuries/"),
    ("football", "ncaaf", "https://www.cbssports.com/college-football/injuries/"),
]

ESPN_SPORT_LEAGUE_TARGETS: list[tuple[str, str, str]] = [
    ("basketball", "nba", "nba"),
    ("hockey", "nhl", "nhl"),
    ("baseball", "mlb", "mlb"),
    ("football", "college-football", "ncaaf"),
]

ROTOWIRE_US_LINEUP_PAGES: list[tuple[str, str, str]] = [
    ("basketball", "nba", "https://www.rotowire.com/basketball/nba-lineups.php"),
    ("hockey", "nhl", "https://www.rotowire.com/hockey/nhl-lineups.php"),
    ("baseball", "mlb", "https://www.rotowire.com/baseball/daily-lineups.php"),
]

ROTOWIRE_US_INJURY_TABLES: list[tuple[str, str, str]] = [
    ("basketball", "nba", "https://www.rotowire.com/basketball/tables/injury-report.php?team=ALL&pos=ALL"),
    ("hockey", "nhl", "https://www.rotowire.com/hockey/tables/injury-report.php?team=ALL&pos=ALL"),
    ("baseball", "mlb", "https://www.rotowire.com/baseball/tables/injury-report.php?team=ALL&pos=ALL"),
    ("football", "ncaaf", "https://www.rotowire.com/cfootball/tables/injury-report.php?team=ALL&pos=ALL"),
]

COVERS_NCAAF_INJURIES_URL = "https://www.covers.com/sport/football/ncaaf/injuries"


def _normalize_player_key(name: str | None) -> str:
    if not name:
        return ""
    cleaned = re.sub(r"[^a-z0-9 ]+", "", name.lower()).strip()
    return re.sub(r"\s+", " ", cleaned)


def _extract_cbs_expected_return_and_status(status_text: str) -> tuple[str, str | None]:
    """Separa designación corta y fecha estimada de retorno desde el texto CBS."""
    if not status_text:
        return "Questionable", None
    txt = status_text.strip()
    m = re.search(r"out until at least ([A-Za-z]{3,9}\s+\d{1,2})", txt, flags=re.IGNORECASE)
    est_ret = m.group(1) if m else None
    lower = txt.lower()
    if "game time decision" in lower or "day-to-day" in lower:
        short_status = "Game Time Decision"
    elif lower.startswith("ir") or "injured reserve" in lower:
        short_status = "IR"
    elif "60-day il" in lower:
        short_status = "IL-60"
    elif "15-day il" in lower or "10-day il" in lower:
        short_status = "IL"
    elif "out for season" in lower or "out indefinitely" in lower:
        short_status = "Out"
    elif "expected to be out" in lower or lower == "out":
        short_status = "Out"
    elif "questionable" in lower:
        short_status = "Questionable"
    elif "doubtful" in lower:
        short_status = "Doubtful"
    elif "probable" in lower:
        short_status = "Probable"
    else:
        short_status = txt.split(".")[0][:40]
    return short_status, est_ret


def _parse_cbs_injuries_page(resp: Any, sport: str, league: str) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for wrapper in resp.css(".TableBaseWrapper"):
        team_candidates = [
            t.strip()
            for t in wrapper.css(
                ".TeamName a::text, .TeamLogoNameLockup-name::text, h4::text"
            ).getall()
            if t and t.strip()
        ]
        team_name = team_candidates[0] if team_candidates else "Unknown Team"
        for tr in wrapper.css("tbody tr"):
            tds = [td.get_all_text(strip=True) for td in tr.css("td")]
            if len(tds) < 5:
                continue
            long_name = (tr.css(".CellPlayerName--long a::text").get() or "").strip()
            if not long_name:
                raw_lines = [ln.strip() for ln in tds[0].splitlines() if ln.strip()]
                long_name = raw_lines[-1] if raw_lines else ""
            if not long_name:
                continue
            pos = tds[1].strip()
            updated_str = tds[2].strip()
            injury_type = tds[3].strip()
            raw_status = tds[4].strip()
            short_status, est_return = _extract_cbs_expected_return_and_status(raw_status)
            records.append(
                {
                    "sport": sport,
                    "league": league,
                    "team": team_name,
                    "player_name": long_name,
                    "position": pos,
                    "status": short_status,
                    "injury_type": injury_type or "Undisclosed",
                    "expected_return": est_return,
                    "notes": f"{raw_status} (CBS updated {updated_str})".strip(),
                    "source_provider": "cbs_sports",
                }
            )
    return records


def _parse_espn_injuries_json(parsed: Any, sport: str, league: str) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    if not isinstance(parsed, dict):
        return records
    for team_block in parsed.get("injuries") or []:
        if not isinstance(team_block, dict):
            continue
        team_name = team_block.get("displayName") or "Unknown Team"
        for inj in team_block.get("injuries") or []:
            if not isinstance(inj, dict):
                continue
            athlete = inj.get("athlete") or {}
            player_name = athlete.get("displayName") or athlete.get("fullName")
            if not player_name:
                continue
            pos_obj = athlete.get("position") or {}
            pos = pos_obj.get("abbreviation") or pos_obj.get("name") or ""
            details = inj.get("details") or {}
            inj_parts = [
                p
                for p in (
                    details.get("side"),
                    details.get("type"),
                    details.get("detail"),
                )
                if p
            ]
            injury_type = " ".join(str(p) for p in inj_parts) if inj_parts else "Undisclosed"
            fantasy_status = (details.get("fantasyStatus") or {}).get("abbreviation")
            status = inj.get("status") or fantasy_status or "Questionable"
            return_date = details.get("returnDate")
            notes = inj.get("longComment") or inj.get("shortComment") or ""
            records.append(
                {
                    "sport": sport,
                    "league": league,
                    "team": team_name,
                    "player_id": str(athlete.get("id") or inj.get("id") or ""),
                    "player_name": player_name,
                    "position": pos,
                    "status": status,
                    "injury_type": injury_type,
                    "expected_return": return_date,
                    "notes": notes,
                    "reported_at_utc": inj.get("date"),
                    "source_provider": "espn",
                }
            )
    return records


def _parse_espn_scoreboard_starters(
    parsed: Any, sport: str, league: str
) -> list[dict[str, Any]]:
    starters: list[dict[str, Any]] = []
    if not isinstance(parsed, dict):
        return starters
    for ev in parsed.get("events") or []:
        if not isinstance(ev, dict):
            continue
        ev_name = ev.get("name")
        ev_date = ev.get("date")
        for comp in ev.get("competitions") or []:
            if not isinstance(comp, dict):
                continue
            for competitor in comp.get("competitors") or []:
                if not isinstance(competitor, dict):
                    continue
                team_obj = competitor.get("team") or {}
                team_name = team_obj.get("displayName") or team_obj.get("name")
                home_away = competitor.get("homeAway")

                # Abridores probables (MLB pitchers / NHL goalies)
                for prob in competitor.get("probables") or []:
                    if not isinstance(prob, dict):
                        continue
                    ath = prob.get("athlete") or {}
                    p_name = ath.get("displayName") or ath.get("fullName")
                    if not p_name:
                        continue
                    pos_abbr = ((ath.get("position") or {}).get("abbreviation")) or prob.get(
                        "abbreviation", "SP"
                    )
                    stat_summary = ", ".join(
                        f"{st.get('name')}={st.get('displayValue')}"
                        for st in (prob.get("statistics") or [])
                        if isinstance(st, dict) and st.get("name")
                    )
                    starters.append(
                        {
                            "sport": sport,
                            "league": league,
                            "event_name": ev_name,
                            "kickoff_utc": ev_date,
                            "team": team_name,
                            "home_away": home_away,
                            "player_name": p_name,
                            "position": pos_abbr,
                            "role": prob.get("displayName") or "Probable Starter",
                            "status": (prob.get("status") or {}).get("name") or "Probable",
                            "notes": stat_summary,
                            "source_provider": "espn_scoreboard",
                        }
                    )

                # Líderes / titulares clave del partido cuando aún no hay `probables`
                for ldr_cat in (competitor.get("leaders") or [])[:2]:
                    if not isinstance(ldr_cat, dict):
                        continue
                    cat_name = ldr_cat.get("displayName") or ldr_cat.get("name") or "Leader"
                    for ldr in (ldr_cat.get("leaders") or [])[:1]:
                        if not isinstance(ldr, dict):
                            continue
                        ath = ldr.get("athlete") or {}
                        p_name = ath.get("displayName") or ath.get("fullName")
                        if not p_name:
                            continue
                        pos_abbr = ((ath.get("position") or {}).get("abbreviation")) or ""
                        starters.append(
                            {
                                "sport": sport,
                                "league": league,
                                "event_name": ev_name,
                                "kickoff_utc": ev_date,
                                "team": team_name,
                                "home_away": home_away,
                                "player_name": p_name,
                                "position": pos_abbr,
                                "role": f"Key Starter ({cat_name})",
                                "status": "Active Leader",
                                "notes": ldr.get("displayValue") or "",
                                "source_provider": "espn_scoreboard",
                            }
                        )
    return starters


def _parse_rotowire_lineup_box_list(ul_node: Any) -> dict[str, Any]:
    status_nodes = ul_node.css("li.lineup__status")
    status_text = status_nodes[0].get_all_text(strip=True) if status_nodes else "Expected"
    confirmed_status = "confirmed" if "confirm" in status_text.lower() else "predicted"

    starters: list[dict[str, str]] = []
    injured_out: list[dict[str, str]] = []
    questionable: list[dict[str, str]] = []

    in_injuries = False
    for li in ul_node.css("li"):
        li_class = li.attrib.get("class", "")
        if "lineup__title" in li_class:
            in_injuries = True
            continue
        if "lineup__player" not in li_class:
            continue
        parts = [p.strip() for p in li.get_all_text(strip=True).splitlines() if p.strip()]
        if not parts:
            continue
        pos = parts[0] if len(parts) >= 2 else ""
        player_name = parts[1] if len(parts) >= 2 else parts[0]
        designation = parts[2] if len(parts) >= 3 else ""
        entry = {
            "player_name": player_name,
            "position": pos,
            "designation": designation or ("STARTER" if not in_injuries else "OUT"),
            "injury_status": designation or ("STARTER" if not in_injuries else "OUT"),
        }
        if not in_injuries:
            starters.append(entry)
            if designation.upper() in {"QUES", "DOUBT", "GTD", "DTD"}:
                questionable.append(entry)
        else:
            if designation.upper() in {"OUT", "SUS", "INJ", "IR", "IL", "OFS"}:
                injured_out.append(entry)
            else:
                questionable.append(entry)

    return {
        "confirmed_status": confirmed_status,
        "raw_status_label": status_text,
        "starters": starters,
        "injured_out_players": injured_out,
        "questionable_players": questionable,
    }


def _parse_covers_ncaaf_injuries(resp: Any) -> list[dict[str, Any]]:
    """Extrae el parte público completo de lesionados FBS de NCAAF en Covers (HTTP 200)."""
    records: list[dict[str, Any]] = []
    for table in resp.css("table"):
        # Primera tabla de cabecera de equipo o bloque padre suele tener el nombre de la universidad
        parent_txt = table.parent.get_all_text(strip=True) if table.parent else ""
        parent_lines = [ln.strip() for ln in parent_txt.splitlines() if ln.strip()]
        team_name = parent_lines[0] if parent_lines else "NCAAF Team"
        if len(parent_lines) >= 2 and not parent_lines[1].startswith("("):
            team_name = f"{parent_lines[0]} {parent_lines[1]}"

        rows = table.css("tbody tr")
        idx = 0
        while idx < len(rows):
            tds = [td.get_all_text(strip=True) for td in rows[idx].css("td")]
            if len(tds) >= 3 and tds[1] and len(tds[1]) <= 6 and tds[0]:
                raw_player = re.sub(r"\s+", " ", tds[0]).strip()
                pos = tds[1].strip()
                status_raw = re.sub(r"\s+", " ", tds[2]).strip()
                notes = ""
                if idx + 1 < len(rows):
                    next_tds = [td.get_all_text(strip=True) for td in rows[idx + 1].css("td")]
                    if len(next_tds) == 1 and len(next_tds[0]) > 15:
                        notes = re.sub(r"\s+", " ", next_tds[0]).strip()
                        idx += 1

                # Ejemplo de `status_raw`: "Questionable - Undisclosed ( Sun, Oct 18)"
                status_clean = status_raw.split("(")[0].strip()
                if " - " in status_clean:
                    st_part, inj_part = status_clean.split(" - ", 1)
                else:
                    st_part, inj_part = status_clean, "Undisclosed"

                records.append(
                    {
                        "sport": "football",
                        "league": "ncaaf",
                        "team": team_name,
                        "player_name": raw_player,
                        "position": pos,
                        "status": st_part.strip() or "Questionable",
                        "injury_type": inj_part.strip() or "Undisclosed",
                        "expected_return": None,
                        "notes": notes or status_raw,
                        "source_provider": "covers_ncaaf",
                    }
                )
            idx += 1
    return records


def scrape_multisport_injuries_and_starters() -> dict[str, Any]:
    """3. Combina CBS Sports, ESPN (injuries + scoreboards), RotoWire y Covers NCAAF vía FetcherSession."""
    scraper = PitchLabScraplingBase("rotowire_lineups_injuries")
    label = WAVE5_LABELS["rotowire_lineups_injuries"]

    http_trace: list[dict[str, Any]] = []
    raw_injury_records: list[dict[str, Any]] = []
    starters_and_probables: list[dict[str, Any]] = []
    lineup_matchups: list[dict[str, Any]] = []

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        # A. CBS Sports Injuries (NBA, NHL, MLB, NCAAF)
        for sport, league_code, cbs_url in CBS_INJURY_TARGETS:
            try:
                resp = session.get(cbs_url, timeout=25)
                cbs_rows = _parse_cbs_injuries_page(resp, sport, league_code)
                raw_injury_records.extend(cbs_rows)
                http_trace.append(
                    {
                        "provider": "cbs_sports",
                        "league": league_code,
                        "url": cbs_url,
                        "status": resp.status,
                        "records_extracted": len(cbs_rows),
                    }
                )
            except Exception as exc:
                http_trace.append(
                    {"provider": "cbs_sports", "league": league_code, "url": cbs_url, "error": str(exc)}
                )

        # B. ESPN Injuries API + Scoreboards (NBA, NHL, MLB, NCAAF)
        for sport, espn_league_slug, league_code in ESPN_SPORT_LEAGUE_TARGETS:
            inj_url = f"https://site.api.espn.com/apis/site/v2/sports/{sport}/{espn_league_slug}/injuries"
            sb_url = f"https://site.api.espn.com/apis/site/v2/sports/{sport}/{espn_league_slug}/scoreboard"
            try:
                r_inj = session.get(inj_url, timeout=25)
                espn_rows = _parse_espn_injuries_json(
                    _safe_json_loads(r_inj.body), sport, league_code
                )
                raw_injury_records.extend(espn_rows)
                http_trace.append(
                    {
                        "provider": "espn_injuries",
                        "league": league_code,
                        "url": inj_url,
                        "status": r_inj.status,
                        "records_extracted": len(espn_rows),
                    }
                )
            except Exception as exc:
                http_trace.append(
                    {"provider": "espn_injuries", "league": league_code, "url": inj_url, "error": str(exc)}
                )

            try:
                r_sb = session.get(sb_url, timeout=25)
                sb_starters = _parse_espn_scoreboard_starters(
                    _safe_json_loads(r_sb.body), sport, league_code
                )
                starters_and_probables.extend(sb_starters)
                http_trace.append(
                    {
                        "provider": "espn_scoreboard",
                        "league": league_code,
                        "url": sb_url,
                        "status": r_sb.status,
                        "starters_extracted": len(sb_starters),
                    }
                )
            except Exception as exc:
                http_trace.append(
                    {"provider": "espn_scoreboard", "league": league_code, "url": sb_url, "error": str(exc)}
                )

        # C. RotoWire Lineups (NBA, NHL, MLB) + RotoWire Injury JSON Tables (NBA, NHL, MLB, NCAAF)
        for sport, league_code, rw_url in ROTOWIRE_US_LINEUP_PAGES:
            try:
                r_rw = session.get(rw_url, timeout=25)
                boxes = r_rw.css(".lineup__box")
                box_count = 0
                for box in boxes:
                    teams = [t.get_all_text(strip=True) for t in box.css(".lineup__mteam")]
                    abbrs = [a.get_all_text(strip=True) for a in box.css(".lineup__abbr")]
                    home_team = (
                        teams[1]
                        if len(teams) >= 2
                        else (abbrs[1] if len(abbrs) >= 2 else "Home")
                    )
                    away_team = (
                        teams[0]
                        if len(teams) >= 1
                        else (abbrs[0] if len(abbrs) >= 1 else "Away")
                    )
                    home_ul = box.css("ul.lineup__list.is-home")
                    visit_ul = box.css("ul.lineup__list.is-visit")
                    if not home_ul and not visit_ul:
                        continue
                    home_data = _parse_rotowire_lineup_box_list(home_ul[0]) if home_ul else {}
                    away_data = _parse_rotowire_lineup_box_list(visit_ul[0]) if visit_ul else {}
                    box_count += 1
                    lineup_matchups.append(
                        {
                            "sport": sport,
                            "league": league_code,
                            "home_team": home_team,
                            "away_team": away_team,
                            "home_lineup": home_data,
                            "away_lineup": away_data,
                        }
                    )
                    for t_name, l_data in ((home_team, home_data), (away_team, away_data)):
                        for st in l_data.get("starters") or []:
                            starters_and_probables.append(
                                {
                                    "sport": sport,
                                    "league": league_code,
                                    "team": t_name,
                                    "player_name": st.get("player_name"),
                                    "position": st.get("position"),
                                    "role": "Projected Starter",
                                    "status": l_data.get("confirmed_status", "predicted"),
                                    "notes": l_data.get("raw_status_label", ""),
                                    "source_provider": "rotowire_lineups",
                                }
                            )
                http_trace.append(
                    {
                        "provider": "rotowire_lineups",
                        "league": league_code,
                        "url": rw_url,
                        "status": r_rw.status,
                        "matchups_extracted": box_count,
                    }
                )
            except Exception as exc:
                http_trace.append(
                    {"provider": "rotowire_lineups", "league": league_code, "url": rw_url, "error": str(exc)}
                )

        for sport, league_code, rw_inj_url in ROTOWIRE_US_INJURY_TABLES:
            try:
                r_rwi = session.get(rw_inj_url, timeout=25)
                parsed_rwi = _safe_json_loads(r_rwi.body)
                rwi_count = 0
                if isinstance(parsed_rwi, list):
                    for item in parsed_rwi:
                        if not isinstance(item, dict) or not item.get("player"):
                            continue
                        rwi_count += 1
                        raw_injury_records.append(
                            {
                                "sport": sport,
                                "league": league_code,
                                "player_id": str(item.get("ID") or ""),
                                "team": item.get("RotoSchoolName") or item.get("team") or "Unknown",
                                "player_name": item.get("player"),
                                "position": item.get("position") or "",
                                "status": item.get("status") or item.get("IR") or "Questionable",
                                "injury_type": item.get("injury") or item.get("injury_type") or "Undisclosed",
                                "expected_return": item.get("rdate") or item.get("ReturnDate"),
                                "notes": (
                                    f"RotoWire injury table ({item.get('date') or 'active'})"
                                    if item.get("date")
                                    else "RotoWire official injury table"
                                ),
                                "source_provider": "rotowire_injuries",
                            }
                        )
                http_trace.append(
                    {
                        "provider": "rotowire_injuries",
                        "league": league_code,
                        "url": rw_inj_url,
                        "status": r_rwi.status,
                        "records_extracted": rwi_count,
                    }
                )
            except Exception as exc:
                http_trace.append(
                    {
                        "provider": "rotowire_injuries",
                        "league": league_code,
                        "url": rw_inj_url,
                        "error": str(exc),
                    }
                )

        # D. Covers NCAAF Injuries (cobertura profunda de las universidades FBS en NCAAF)
        try:
            r_cov = session.get(COVERS_NCAAF_INJURIES_URL, timeout=25)
            cov_rows = _parse_covers_ncaaf_injuries(r_cov)
            raw_injury_records.extend(cov_rows)
            http_trace.append(
                {
                    "provider": "covers_ncaaf",
                    "league": "ncaaf",
                    "url": COVERS_NCAAF_INJURIES_URL,
                    "status": r_cov.status,
                    "records_extracted": len(cov_rows),
                }
            )
        except Exception as exc:
            http_trace.append(
                {
                    "provider": "covers_ncaaf",
                    "league": "ncaaf",
                    "url": COVERS_NCAAF_INJURIES_URL,
                    "error": str(exc),
                }
            )

    # Fusión y deduplicación por `(league, player_key)` enriqueciendo campos entre ESPN, CBS, RotoWire y Covers
    merged_injuries_map: dict[tuple[str, str], dict[str, Any]] = {}
    for rec in raw_injury_records:
        lg = str(rec.get("league") or "unknown").lower()
        pkey = _normalize_player_key(rec.get("player_name"))
        if not pkey:
            continue
        dedup_key = (lg, pkey)
        provider = rec.get("source_provider") or "unknown"
        if dedup_key not in merged_injuries_map:
            merged_injuries_map[dedup_key] = {
                "sport": rec.get("sport"),
                "league": lg,
                "team": rec.get("team"),
                "player_id": rec.get("player_id") or "",
                "player_name": rec.get("player_name"),
                "position": rec.get("position") or "",
                "status": rec.get("status") or "Questionable",
                "game_status_designation": rec.get("status") or "Questionable",
                "injury_type": rec.get("injury_type") or "Undisclosed",
                "injury": rec.get("injury_type") or "Undisclosed",
                "expected_return": rec.get("expected_return"),
                "notes": rec.get("notes") or "",
                "sources": [provider],
            }
        else:
            cur = merged_injuries_map[dedup_key]
            if provider not in cur["sources"]:
                cur["sources"].append(provider)
            if (not cur.get("expected_return")) and rec.get("expected_return"):
                cur["expected_return"] = rec["expected_return"]
            if cur.get("injury_type") in ("", "Undisclosed") and rec.get("injury_type") not in (
                None,
                "",
                "Undisclosed",
            ):
                cur["injury_type"] = rec["injury_type"]
                cur["injury"] = rec["injury_type"]
            if (not cur.get("position")) and rec.get("position"):
                cur["position"] = rec["position"]
            if rec.get("notes") and len(str(rec["notes"])) > len(str(cur.get("notes") or "")):
                cur["notes"] = rec["notes"]

    merged_injuries = list(merged_injuries_map.values())

    injuries_by_league: dict[str, int] = {}
    for item in merged_injuries:
        lg = item["league"]
        injuries_by_league[lg] = injuries_by_league.get(lg, 0) + 1

    starters_by_league: dict[str, int] = {}
    for st in starters_and_probables:
        lg = str(st.get("league") or "unknown")
        starters_by_league[lg] = starters_by_league.get(lg, 0) + 1

    total_records = len(merged_injuries) + len(starters_and_probables) + len(lineup_matchups)

    payload = {
        "captured_at_utc": utc_now_iso(),
        "source_id": "rotowire_lineups_injuries",
        "summary": {
            "unique_injured_players_count": len(merged_injuries),
            "raw_injury_mentions_across_providers": len(raw_injury_records),
            "injuries_by_league": injuries_by_league,
            "starters_and_probables_count": len(starters_and_probables),
            "starters_by_league": starters_by_league,
            "lineup_matchups_count": len(lineup_matchups),
            "total_records": total_records,
        },
        "http_trace": http_trace,
        "lineup_matchups": lineup_matchups,
        "starters_and_probables": starters_and_probables,
        "injuries": merged_injuries,
        "injury_table_records": merged_injuries,
    }

    _clean_own_wave5_label_snapshots(scraper.category, scraper.source_id, label)
    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=CBS_INJURY_TARGETS[0][2],
        label=label,
        extra_meta=payload["summary"],
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": scraper.source_id,
        "category": scraper.category,
        "label": label,
        "path": str(out_path),
        "unique_injuries_count": len(merged_injuries),
        "injuries_by_league": injuries_by_league,
        "starters_count": len(starters_and_probables),
        "lineup_matchups_count": len(lineup_matchups),
        "record_count": total_records,
        "sha256": sha256_val,
    }


# ===========================================================================
# 4. OPEN-METEO 30 MLB BALLPARKS + 30 NCAAF OUTDOOR STADIUMS (7D HOURLY)
# ===========================================================================

MLB_30_AND_NCAAF_30_STADIUMS_CATALOG: list[dict[str, Any]] = [
    # --- 30 Estadios de Major League Baseball (MLB) ---
    {"stadium_id": "mlb_coors_field_rockies", "name": "Coors Field", "league": "mlb", "city": "Denver, CO", "teams": ["Colorado Rockies"], "roof_type": "open", "latitude": 39.7559, "longitude": -104.9942},
    {"stadium_id": "mlb_fenway_park_red_sox", "name": "Fenway Park", "league": "mlb", "city": "Boston, MA", "teams": ["Boston Red Sox"], "roof_type": "open", "latitude": 42.3467, "longitude": -71.0972},
    {"stadium_id": "mlb_wrigley_field_cubs", "name": "Wrigley Field", "league": "mlb", "city": "Chicago, IL", "teams": ["Chicago Cubs"], "roof_type": "open", "latitude": 41.9484, "longitude": -87.6553},
    {"stadium_id": "mlb_dodger_stadium_dodgers", "name": "Dodger Stadium", "league": "mlb", "city": "Los Angeles, CA", "teams": ["Los Angeles Dodgers"], "roof_type": "open", "latitude": 34.0739, "longitude": -118.2400},
    {"stadium_id": "mlb_yankee_stadium_yankees", "name": "Yankee Stadium", "league": "mlb", "city": "Bronx, NY", "teams": ["New York Yankees"], "roof_type": "open", "latitude": 40.8296, "longitude": -73.9262},
    {"stadium_id": "mlb_citi_field_mets", "name": "Citi Field", "league": "mlb", "city": "Queens, NY", "teams": ["New York Mets"], "roof_type": "open", "latitude": 40.7571, "longitude": -73.8458},
    {"stadium_id": "mlb_oracle_park_giants", "name": "Oracle Park", "league": "mlb", "city": "San Francisco, CA", "teams": ["San Francisco Giants"], "roof_type": "open", "latitude": 37.7786, "longitude": -122.3893},
    {"stadium_id": "mlb_petco_park_padres", "name": "Petco Park", "league": "mlb", "city": "San Diego, CA", "teams": ["San Diego Padres"], "roof_type": "open", "latitude": 32.7076, "longitude": -117.1570},
    {"stadium_id": "mlb_truist_park_braves", "name": "Truist Park", "league": "mlb", "city": "Atlanta, GA", "teams": ["Atlanta Braves"], "roof_type": "open", "latitude": 33.8908, "longitude": -84.4678},
    {"stadium_id": "mlb_citizens_bank_phillies", "name": "Citizens Bank Park", "league": "mlb", "city": "Philadelphia, PA", "teams": ["Philadelphia Phillies"], "roof_type": "open", "latitude": 39.9061, "longitude": -75.1665},
    {"stadium_id": "mlb_camden_yards_orioles", "name": "Oriole Park at Camden Yards", "league": "mlb", "city": "Baltimore, MD", "teams": ["Baltimore Orioles"], "roof_type": "open", "latitude": 39.2838, "longitude": -76.6217},
    {"stadium_id": "mlb_busch_stadium_cardinals", "name": "Busch Stadium", "league": "mlb", "city": "St. Louis, MO", "teams": ["St. Louis Cardinals"], "roof_type": "open", "latitude": 38.6226, "longitude": -90.1928},
    {"stadium_id": "mlb_globe_life_rangers", "name": "Globe Life Field", "league": "mlb", "city": "Arlington, TX", "teams": ["Texas Rangers"], "roof_type": "retractable", "latitude": 32.7473, "longitude": -97.0842},
    {"stadium_id": "mlb_daikin_park_astros", "name": "Daikin Park (Minute Maid Park)", "league": "mlb", "city": "Houston, TX", "teams": ["Houston Astros"], "roof_type": "retractable", "latitude": 29.7573, "longitude": -95.3555},
    {"stadium_id": "mlb_chase_field_diamondbacks", "name": "Chase Field", "league": "mlb", "city": "Phoenix, AZ", "teams": ["Arizona Diamondbacks"], "roof_type": "retractable", "latitude": 33.4455, "longitude": -112.0667},
    {"stadium_id": "mlb_tmobile_park_mariners", "name": "T-Mobile Park", "league": "mlb", "city": "Seattle, WA", "teams": ["Seattle Mariners"], "roof_type": "retractable", "latitude": 47.5914, "longitude": -122.3325},
    {"stadium_id": "mlb_rogers_centre_blue_jays", "name": "Rogers Centre", "league": "mlb", "city": "Toronto, ON", "teams": ["Toronto Blue Jays"], "roof_type": "retractable", "latitude": 43.6414, "longitude": -79.3894},
    {"stadium_id": "mlb_loandepot_park_marlins", "name": "loanDepot park", "league": "mlb", "city": "Miami, FL", "teams": ["Miami Marlins"], "roof_type": "retractable", "latitude": 25.7781, "longitude": -80.2197},
    {"stadium_id": "mlb_american_family_brewers", "name": "American Family Field", "league": "mlb", "city": "Milwaukee, WI", "teams": ["Milwaukee Brewers"], "roof_type": "retractable", "latitude": 43.0280, "longitude": -87.9712},
    {"stadium_id": "mlb_steinbrenner_tropicana_rays", "name": "George M. Steinbrenner Field / Tropicana", "league": "mlb", "city": "Tampa, FL", "teams": ["Tampa Bay Rays"], "roof_type": "open", "latitude": 27.9803, "longitude": -82.5067},
    {"stadium_id": "mlb_target_field_twins", "name": "Target Field", "league": "mlb", "city": "Minneapolis, MN", "teams": ["Minnesota Twins"], "roof_type": "open", "latitude": 44.9817, "longitude": -93.2776},
    {"stadium_id": "mlb_comerica_park_tigers", "name": "Comerica Park", "league": "mlb", "city": "Detroit, MI", "teams": ["Detroit Tigers"], "roof_type": "open", "latitude": 42.3390, "longitude": -83.0485},
    {"stadium_id": "mlb_progressive_field_guardians", "name": "Progressive Field", "league": "mlb", "city": "Cleveland, OH", "teams": ["Cleveland Guardians"], "roof_type": "open", "latitude": 41.4962, "longitude": -81.6852},
    {"stadium_id": "mlb_kauffman_stadium_royals", "name": "Kauffman Stadium", "league": "mlb", "city": "Kansas City, MO", "teams": ["Kansas City Royals"], "roof_type": "open", "latitude": 39.0517, "longitude": -94.4803},
    {"stadium_id": "mlb_rate_field_white_sox", "name": "Rate Field", "league": "mlb", "city": "Chicago, IL", "teams": ["Chicago White Sox"], "roof_type": "open", "latitude": 41.8299, "longitude": -87.6338},
    {"stadium_id": "mlb_great_american_reds", "name": "Great American Ball Park", "league": "mlb", "city": "Cincinnati, OH", "teams": ["Cincinnati Reds"], "roof_type": "open", "latitude": 39.0979, "longitude": -84.5082},
    {"stadium_id": "mlb_pnc_park_pirates", "name": "PNC Park", "league": "mlb", "city": "Pittsburgh, PA", "teams": ["Pittsburgh Pirates"], "roof_type": "open", "latitude": 40.4469, "longitude": -80.0057},
    {"stadium_id": "mlb_nationals_park_nationals", "name": "Nationals Park", "league": "mlb", "city": "Washington, DC", "teams": ["Washington Nationals"], "roof_type": "open", "latitude": 38.8730, "longitude": -77.0074},
    {"stadium_id": "mlb_angel_stadium_angels", "name": "Angel Stadium", "league": "mlb", "city": "Anaheim, CA", "teams": ["Los Angeles Angels"], "roof_type": "open", "latitude": 33.8003, "longitude": -117.8827},
    {"stadium_id": "mlb_sutter_health_athletics", "name": "Sutter Health Park", "league": "mlb", "city": "West Sacramento, CA", "teams": ["Athletics"], "roof_type": "open", "latitude": 38.5804, "longitude": -121.5138},

    # --- 30 Principales Estadios Abiertos de NCAAF (FBS + Alta Montaña) ---
    {"stadium_id": "ncaaf_michigan_stadium", "name": "Michigan Stadium", "league": "ncaaf", "city": "Ann Arbor, MI", "teams": ["Michigan Wolverines"], "roof_type": "open", "latitude": 42.2658, "longitude": -83.7487},
    {"stadium_id": "ncaaf_beaver_stadium_penn_state", "name": "Beaver Stadium", "league": "ncaaf", "city": "University Park, PA", "teams": ["Penn State Nittany Lions"], "roof_type": "open", "latitude": 40.8122, "longitude": -77.8561},
    {"stadium_id": "ncaaf_ohio_stadium_buckeyes", "name": "Ohio Stadium", "league": "ncaaf", "city": "Columbus, OH", "teams": ["Ohio State Buckeyes"], "roof_type": "open", "latitude": 40.0017, "longitude": -83.0197},
    {"stadium_id": "ncaaf_kyle_field_texas_am", "name": "Kyle Field", "league": "ncaaf", "city": "College Station, TX", "teams": ["Texas A&M Aggies"], "roof_type": "open", "latitude": 30.6102, "longitude": -96.3398},
    {"stadium_id": "ncaaf_tiger_stadium_lsu", "name": "Tiger Stadium", "league": "ncaaf", "city": "Baton Rouge, LA", "teams": ["LSU Tigers"], "roof_type": "open", "latitude": 30.4120, "longitude": -91.1838},
    {"stadium_id": "ncaaf_neyland_stadium_tennessee", "name": "Neyland Stadium", "league": "ncaaf", "city": "Knoxville, TN", "teams": ["Tennessee Volunteers"], "roof_type": "open", "latitude": 35.9550, "longitude": -83.9250},
    {"stadium_id": "ncaaf_dkr_memorial_texas", "name": "Darrell K Royal-Texas Memorial Stadium", "league": "ncaaf", "city": "Austin, TX", "teams": ["Texas Longhorns"], "roof_type": "open", "latitude": 30.2836, "longitude": -97.7325},
    {"stadium_id": "ncaaf_bryant_denny_alabama", "name": "Saban Field at Bryant-Denny Stadium", "league": "ncaaf", "city": "Tuscaloosa, AL", "teams": ["Alabama Crimson Tide"], "roof_type": "open", "latitude": 33.2083, "longitude": -87.5504},
    {"stadium_id": "ncaaf_sanford_stadium_georgia", "name": "Sanford Stadium", "league": "ncaaf", "city": "Athens, GA", "teams": ["Georgia Bulldogs"], "roof_type": "open", "latitude": 33.9498, "longitude": -83.3734},
    {"stadium_id": "ncaaf_ben_hill_griffin_florida", "name": "Ben Hill Griffin Stadium", "league": "ncaaf", "city": "Gainesville, FL", "teams": ["Florida Gators"], "roof_type": "open", "latitude": 29.6500, "longitude": -82.3486},
    {"stadium_id": "ncaaf_jordan_hare_auburn", "name": "Jordan-Hare Stadium", "league": "ncaaf", "city": "Auburn, AL", "teams": ["Auburn Tigers"], "roof_type": "open", "latitude": 32.6022, "longitude": -85.4892},
    {"stadium_id": "ncaaf_gaylord_memorial_oklahoma", "name": "Gaylord Family Oklahoma Memorial Stadium", "league": "ncaaf", "city": "Norman, OK", "teams": ["Oklahoma Sooners"], "roof_type": "open", "latitude": 35.2059, "longitude": -97.4424},
    {"stadium_id": "ncaaf_memorial_stadium_nebraska", "name": "Memorial Stadium (Lincoln)", "league": "ncaaf", "city": "Lincoln, NE", "teams": ["Nebraska Cornhuskers"], "roof_type": "open", "latitude": 40.8206, "longitude": -96.7056},
    {"stadium_id": "ncaaf_memorial_stadium_clemson", "name": "Memorial Stadium (Clemson)", "league": "ncaaf", "city": "Clemson, SC", "teams": ["Clemson Tigers"], "roof_type": "open", "latitude": 34.6787, "longitude": -82.8432},
    {"stadium_id": "ncaaf_notre_dame_stadium", "name": "Notre Dame Stadium", "league": "ncaaf", "city": "Notre Dame, IN", "teams": ["Notre Dame Fighting Irish"], "roof_type": "open", "latitude": 41.6984, "longitude": -86.2339},
    {"stadium_id": "ncaaf_camp_randall_wisconsin", "name": "Camp Randall Stadium", "league": "ncaaf", "city": "Madison, WI", "teams": ["Wisconsin Badgers"], "roof_type": "open", "latitude": 43.0700, "longitude": -89.4127},
    {"stadium_id": "ncaaf_kinnick_stadium_iowa", "name": "Kinnick Stadium", "league": "ncaaf", "city": "Iowa City, IA", "teams": ["Iowa Hawkeyes"], "roof_type": "open", "latitude": 41.6586, "longitude": -91.5511},
    {"stadium_id": "ncaaf_spartan_stadium_michigan_st", "name": "Spartan Stadium", "league": "ncaaf", "city": "East Lansing, MI", "teams": ["Michigan State Spartans"], "roof_type": "open", "latitude": 42.7281, "longitude": -84.4849},
    {"stadium_id": "ncaaf_husky_stadium_washington", "name": "Husky Stadium", "league": "ncaaf", "city": "Seattle, WA", "teams": ["Washington Huskies"], "roof_type": "open", "latitude": 47.6503, "longitude": -122.3016},
    {"stadium_id": "ncaaf_autzen_stadium_oregon", "name": "Autzen Stadium", "league": "ncaaf", "city": "Eugene, OR", "teams": ["Oregon Ducks"], "roof_type": "open", "latitude": 44.0583, "longitude": -123.0686},
    {"stadium_id": "ncaaf_la_coliseum_usc", "name": "Los Angeles Memorial Coliseum", "league": "ncaaf", "city": "Los Angeles, CA", "teams": ["USC Trojans"], "roof_type": "open", "latitude": 34.0141, "longitude": -118.2879},
    {"stadium_id": "ncaaf_rose_bowl_ucla", "name": "Rose Bowl", "league": "ncaaf", "city": "Pasadena, CA", "teams": ["UCLA Bruins"], "roof_type": "open", "latitude": 34.1613, "longitude": -118.1676},
    {"stadium_id": "ncaaf_doak_campbell_fsu", "name": "Doak Campbell Stadium", "league": "ncaaf", "city": "Tallahassee, FL", "teams": ["Florida State Seminoles"], "roof_type": "open", "latitude": 30.4381, "longitude": -84.3044},
    {"stadium_id": "ncaaf_williams_brice_south_carolina", "name": "Williams-Brice Stadium", "league": "ncaaf", "city": "Columbia, SC", "teams": ["South Carolina Gamecocks"], "roof_type": "open", "latitude": 33.9731, "longitude": -81.0192},
    {"stadium_id": "ncaaf_folsom_field_colorado", "name": "Folsom Field", "league": "ncaaf", "city": "Boulder, CO", "teams": ["Colorado Buffaloes"], "roof_type": "open", "latitude": 40.0095, "longitude": -105.2669},
    {"stadium_id": "ncaaf_lavell_edwards_byu", "name": "LaVell Edwards Stadium", "league": "ncaaf", "city": "Provo, UT", "teams": ["BYU Cougars"], "roof_type": "open", "latitude": 40.2575, "longitude": -111.6545},
    {"stadium_id": "ncaaf_war_memorial_wyoming", "name": "War Memorial Stadium", "league": "ncaaf", "city": "Laramie, WY", "teams": ["Wyoming Cowboys"], "roof_type": "open", "latitude": 41.3119, "longitude": -105.5691},
    {"stadium_id": "ncaaf_falcon_stadium_air_force", "name": "Falcon Stadium", "league": "ncaaf", "city": "Colorado Springs, CO", "teams": ["Air Force Falcons"], "roof_type": "open", "latitude": 38.9969, "longitude": -104.8437},
    {"stadium_id": "ncaaf_rice_eccles_utah", "name": "Rice-Eccles Stadium", "league": "ncaaf", "city": "Salt Lake City, UT", "teams": ["Utah Utes"], "roof_type": "open", "latitude": 40.7600, "longitude": -111.8489},
    {"stadium_id": "ncaaf_albertsons_boise_state", "name": "Albertsons Stadium", "league": "ncaaf", "city": "Boise, ID", "teams": ["Boise State Broncos"], "roof_type": "open", "latitude": 43.6028, "longitude": -116.1959},
]


def scrape_open_meteo_60_mlb_ncaaf_stadiums() -> dict[str, Any]:
    """4. Pronóstico horario de 7 días (168h) + presión superficial + dirección de viento + altitud para 60 estadios."""
    if len(MLB_30_AND_NCAAF_30_STADIUMS_CATALOG) != 60:
        raise AssertionError(
            f"El catálogo debe contener exactamente 60 estadios; tiene {len(MLB_30_AND_NCAAF_30_STADIUMS_CATALOG)}"
        )

    scraper = PitchLabScraplingBase("open_meteo_nflweather")
    label = WAVE5_LABELS["open_meteo_nflweather"]
    base_url = "https://api.open-meteo.com/v1/forecast"

    stadium_forecasts: list[dict[str, Any]] = []
    http_trace: list[dict[str, Any]] = []
    total_hourly_points = 0

    batch_size = 12
    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        for start_idx in range(0, len(MLB_30_AND_NCAAF_30_STADIUMS_CATALOG), batch_size):
            batch = MLB_30_AND_NCAAF_30_STADIUMS_CATALOG[start_idx : start_idx + batch_size]
            lats = ",".join(str(s["latitude"]) for s in batch)
            lons = ",".join(str(s["longitude"]) for s in batch)
            query_url = (
                f"{base_url}?latitude={lats}&longitude={lons}"
                "&hourly=temperature_2m,relative_humidity_2m,precipitation,"
                "wind_speed_10m,wind_gusts_10m,wind_direction_10m,surface_pressure"
                "&wind_speed_unit=mph&forecast_days=7&timezone=UTC"
            )
            resp = session.get(query_url, timeout=30)
            http_trace.append(
                {
                    "batch_start": start_idx,
                    "batch_count": len(batch),
                    "status": resp.status,
                    "url": query_url,
                }
            )
            parsed = _safe_json_loads(resp.body)
            results_list = (
                parsed
                if isinstance(parsed, list)
                else ([parsed] if isinstance(parsed, dict) else [])
            )

            for idx, stadium in enumerate(batch):
                loc_data = (
                    results_list[idx]
                    if idx < len(results_list) and isinstance(results_list[idx], dict)
                    else {}
                )
                hourly = loc_data.get("hourly") or {}
                times = hourly.get("time") or []
                temps = hourly.get("temperature_2m") or []
                humidities = hourly.get("relative_humidity_2m") or []
                precips = hourly.get("precipitation") or []
                winds = hourly.get("wind_speed_10m") or []
                gusts = hourly.get("wind_gusts_10m") or []
                wind_dirs = hourly.get("wind_direction_10m") or []
                pressures = hourly.get("surface_pressure") or []

                hourly_points: list[dict[str, Any]] = []
                for h_idx, ts in enumerate(times[:168]):
                    t_val = temps[h_idx] if h_idx < len(temps) else None
                    rh_val = humidities[h_idx] if h_idx < len(humidities) else None
                    pr_val = precips[h_idx] if h_idx < len(precips) else None
                    ws_val = winds[h_idx] if h_idx < len(winds) else None
                    wg_val = gusts[h_idx] if h_idx < len(gusts) else None
                    wd_val = wind_dirs[h_idx] if h_idx < len(wind_dirs) else None
                    sp_val = pressures[h_idx] if h_idx < len(pressures) else None

                    hourly_points.append(
                        {
                            "timestamp_utc": ts,
                            "temperature_c": t_val,
                            "temperature_2m": t_val,
                            "humidity_pct": rh_val,
                            "relative_humidity_2m": rh_val,
                            "precipitation_mm": pr_val,
                            "precipitation": pr_val,
                            "wind_speed_mph": ws_val,
                            "wind_speed_10m": ws_val,
                            "wind_gusts_mph": wg_val,
                            "wind_gusts_10m": wg_val,
                            "wind_direction_10m": wd_val,
                            "surface_pressure": sp_val,
                        }
                    )

                total_hourly_points += len(hourly_points)
                elevation_m = float(loc_data.get("elevation") or 0.0)
                roof_type = stadium["roof_type"]
                is_dome_or_retractable = roof_type in ("dome", "retractable")
                clean_winds = [float(w) for w in winds[:168] if w is not None]
                clean_gusts = [float(g) for g in gusts[:168] if g is not None]
                clean_precips = [float(p) for p in precips[:168] if p is not None]
                clean_temps = [float(t) for t in temps[:168] if t is not None]
                clean_pressures = [float(sp) for sp in pressures[:168] if sp is not None]
                clean_dirs = [float(d) for d in wind_dirs[:168] if d is not None]

                stadium_forecasts.append(
                    {
                        "stadium_id": stadium["stadium_id"],
                        "stadium_name": stadium["name"],
                        "league": stadium["league"],
                        "city": stadium["city"],
                        "teams": stadium["teams"],
                        "roof_type": roof_type,
                        "is_dome_or_retractable": is_dome_or_retractable,
                        "latitude": loc_data.get("latitude", stadium["latitude"]),
                        "longitude": loc_data.get("longitude", stadium["longitude"]),
                        "elevation_m": elevation_m,
                        "is_high_altitude_gt_1500m": elevation_m >= 1500.0,
                        "max_wind_mph_7d": round(max(clean_winds), 2) if clean_winds else None,
                        "max_gust_mph_7d": round(max(clean_gusts), 2) if clean_gusts else None,
                        "total_precip_mm_7d": round(sum(clean_precips), 2) if clean_precips else 0.0,
                        "min_temp_c_7d": round(min(clean_temps), 2) if clean_temps else None,
                        "max_temp_c_7d": round(max(clean_temps), 2) if clean_temps else None,
                        "mean_surface_pressure_hpa_7d": (
                            round(sum(clean_pressures) / len(clean_pressures), 2)
                            if clean_pressures
                            else None
                        ),
                        "mean_wind_direction_deg_7d": (
                            round(sum(clean_dirs) / len(clean_dirs), 1)
                            if clean_dirs
                            else None
                        ),
                        "hourly_points_count": len(hourly_points),
                        "hourly_forecast_7d": hourly_points,
                    }
                )

    leagues_breakdown: dict[str, int] = {}
    high_alt_stadiums: list[dict[str, Any]] = []
    for s in stadium_forecasts:
        lg = s["league"]
        leagues_breakdown[lg] = leagues_breakdown.get(lg, 0) + 1
        if s["elevation_m"] >= 1400.0:
            high_alt_stadiums.append(
                {
                    "stadium_id": s["stadium_id"],
                    "stadium_name": s["stadium_name"],
                    "league": s["league"],
                    "elevation_m": s["elevation_m"],
                    "mean_surface_pressure_hpa_7d": s["mean_surface_pressure_hpa_7d"],
                }
            )

    payload = {
        "captured_at_utc": utc_now_iso(),
        "source_id": "open_meteo_nflweather",
        "summary": {
            "total_stadiums": len(stadium_forecasts),
            "leagues_breakdown": leagues_breakdown,
            "high_altitude_gt_1400m_count": len(high_alt_stadiums),
            "high_altitude_stadiums": high_alt_stadiums,
            "total_hourly_weather_points": total_hourly_points,
        },
        "http_trace": http_trace,
        "stadiums": stadium_forecasts,
    }

    _clean_own_wave5_label_snapshots(scraper.category, scraper.source_id, label)
    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=base_url,
        label=label,
        extra_meta={
            "record_count": len(stadium_forecasts),
            "total_hourly_weather_points": total_hourly_points,
            "leagues_breakdown": leagues_breakdown,
            "high_altitude_gt_1400m_count": len(high_alt_stadiums),
        },
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": scraper.source_id,
        "category": scraper.category,
        "label": label,
        "path": str(out_path),
        "stadiums_count": len(stadium_forecasts),
        "leagues_breakdown": leagues_breakdown,
        "high_altitude_stadiums": high_alt_stadiums,
        "hourly_points_count": total_hourly_points,
        "record_count": len(stadium_forecasts),
        "sha256": sha256_val,
    }


def run_wave5_scrapers(only_source: str = "all") -> list[dict[str, Any]]:
    """Ejecuta los 4 scrapers multi-deporte de Wave 5 y devuelve el resumen auditable."""
    results: list[dict[str, Any]] = []

    if only_source in ("all", "action_network_splits"):
        print("-> [1/4] Extrayendo Action Network Splits & Open/Current Lines (NBA, NHL, MLB, NCAAF, NFL)...")
        res = scrape_action_network_multisport_splits()
        results.append(res)
        print(
            f"   OK action_network_splits: games={res['unique_games_count']} "
            f"(rlm={res['rlm_flagged_games_count']}, mkt_outcomes={res['total_bookmaker_market_outcomes']}) "
            f"| sha256={res['sha256'][:12]}"
        )

    if only_source in ("all", "betfair_smarkets_exchange"):
        print("-> [2/4] Extrayendo Smarkets Exchange P2P Multi-Sport (NBA, NHL, MLB, NCAAF, NFL)...")
        res = scrape_smarkets_multisport_exchange()
        results.append(res)
        print(
            f"   OK betfair_smarkets_exchange: events={res['events_count']}, "
            f"quotes={res['quotes_count']}, anti_bot_blocked={res['blocked_by_anti_bot_gate']} "
            f"| sha256={res['sha256'][:12]}"
        )

    if only_source in ("all", "rotowire_lineups_injuries"):
        print("-> [3/4] Extrayendo Lesiones y Titulares/Abridores (CBS + ESPN + RotoWire + Covers NCAAF)...")
        res = scrape_multisport_injuries_and_starters()
        results.append(res)
        print(
            f"   OK rotowire_lineups_injuries: unique_injuries={res['unique_injuries_count']}, "
            f"starters={res['starters_count']}, lineup_matchups={res['lineup_matchups_count']} "
            f"| sha256={res['sha256'][:12]}"
        )

    if only_source in ("all", "open_meteo_nflweather"):
        print("-> [4/4] Extrayendo Open-Meteo 30 MLB Ballparks + 30 NCAAF Outdoor Stadiums (7d × 168h)...")
        res = scrape_open_meteo_60_mlb_ncaaf_stadiums()
        results.append(res)
        print(
            f"   OK open_meteo_nflweather: stadiums={res['stadiums_count']} "
            f"(hourly_pts={res['hourly_points_count']}) | sha256={res['sha256'][:12]}"
        )

    return results


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Wave 5 Multi-Sport Scraper: Action Network Splits, Smarkets Exchange, "
            "ESPN/CBS/RotoWire Injuries & Starters, and Open-Meteo 60 MLB/NCAAF Stadiums."
        )
    )
    parser.add_argument(
        "--source",
        default="all",
        choices=[
            "all",
            "action_network_splits",
            "betfair_smarkets_exchange",
            "rotowire_lineups_injuries",
            "open_meteo_nflweather",
        ],
        help="Fuente específica de Wave 5 a ejecutar o 'all'.",
    )
    args = parser.parse_args()
    summary = run_wave5_scrapers(args.source)
    print("\n=== RESUMEN WAVE 5 MULTISPORT ODDS, INJURIES & BALLPARKS ===")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
