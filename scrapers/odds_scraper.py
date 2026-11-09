"""Scraper de Categoría 1 (odds_casinos) basado exclusivamente en Scrapling.

Fuentes implementadas:
1. `pinnacle`: `AsyncStealthySession(headless=True, solve_cloudflare=True, record_requests=True)`
   sobre Liga MX / NFL / Soccer en Pinnacle (Arcadia Guest API + DOM).
2. `caliente_mx`: `AsyncStealthySession(headless=True, solve_cloudflare=True, record_requests=True)`
   sobre `sports.caliente.mx` (DOM + respuestas de red JSON/XHR).
3. `action_network_splits`: `FetcherSession(impersonate="chrome", stealthy_headers=True)`
   sobre Action Network (`__NEXT_DATA__` con juegos, momios y splits públicos de tickets/dinero).
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
import re
import sys
from typing import Any

from scrapling.fetchers import AsyncStealthySession, FetcherSession
from scrapling.parser import Selector

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from scrapers.base_scraper import PitchLabScraplingBase, sha256_text  # noqa: E402


def _safe_json_loads(raw: bytes | str) -> Any | None:
    """Intenta parsear JSON desde bytes o str sin lanzar excepción."""
    try:
        text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else raw
        return json.loads(text)
    except Exception:
        return None


def _american_to_decimal(american: float | int | None) -> float | None:
    """Convierte cuota americana a decimal para cálculo de probabilidades implícitas."""
    if american is None:
        return None
    try:
        val = float(american)
    except (TypeError, ValueError):
        return None
    if val == 0:
        return None
    if val > 0:
        return round(1.0 + (val / 100.0), 4)
    return round(1.0 + (100.0 / abs(val)), 4)


class PinnacleOddsScraper(PitchLabScraplingBase):
    """Captura cuotas sharp y límites de Pinnacle vía `AsyncStealthySession`."""

    TARGET_URLS = [
        "https://www.pinnacle.com/es/soccer/mexico-liga-mx/matchups/",
        "https://www.pinnacle.com/es/football/nfl/matchups/",
        "https://www.pinnacle.com/es/soccer/matchups/highlights/",
    ]

    def __init__(self) -> None:
        super().__init__("pinnacle")

    async def run(self) -> dict[str, Any]:
        arcadia_endpoints: list[dict[str, Any]] = []
        matchups_extracted: list[dict[str, Any]] = []
        markets_extracted: list[dict[str, Any]] = []
        dom_pages: list[dict[str, Any]] = []

        async with AsyncStealthySession(
            headless=True,
            solve_cloudflare=True,
            record_requests=True,
            timeout=60000,
            max_recorded_requests=1000,
        ) as session:
            for url in self.TARGET_URLS:
                try:
                    page = await session.fetch(
                        url,
                        network_idle=True,
                        wait=5000,
                        google_search=False,
                    )
                    dom_pages.append(self._extract_dom_summary(page, url))
                except Exception as exc:
                    dom_pages.append({"url": url, "error": str(exc)})

            # Inspeccionar todo el tráfico grabado de Arcadia API y Pinnacle
            all_responses = session.network.search(
                url_pattern=r"(guest\.api\.arcadia\.pinnacle\.com|pinnacle\.com)",
                limit=None,
            )
            for resp in all_responses:
                if "arcadia.pinnacle.com" not in resp.url and resp.meta.get("resource_type") not in ("xhr", "fetch"):
                    continue
                parsed = _safe_json_loads(resp.body) if resp.body else None
                entry: dict[str, Any] = {
                    "network_id": resp.meta.get("network_id"),
                    "url": resp.url,
                    "status": resp.status,
                    "resource_type": resp.meta.get("resource_type"),
                }
                if parsed is not None:
                    entry["json_type"] = type(parsed).__name__
                    entry["record_count"] = len(parsed) if isinstance(parsed, (list, dict)) else 1
                    arcadia_endpoints.append(entry)

                    if "/matchups" in resp.url and isinstance(parsed, list):
                        for item in parsed:
                            if isinstance(item, dict) and item.get("participants"):
                                matchups_extracted.append(self._normalize_arcadia_matchup(item))
                    elif "/markets/" in resp.url and isinstance(parsed, list):
                        for mkt in parsed:
                            if isinstance(mkt, dict) and mkt.get("matchupId"):
                                markets_extracted.append(self._normalize_arcadia_market(mkt))

        payload = {
            "source": "pinnacle",
            "target_urls": self.TARGET_URLS,
            "summary": {
                "pages_visited": len(dom_pages),
                "arcadia_api_calls_captured": len(arcadia_endpoints),
                "matchups_count": len(matchups_extracted),
                "markets_count": len(markets_extracted),
                "dom_elements_count": sum(p.get("dom_odds_count", 0) + p.get("dom_matchup_links_count", 0) for p in dom_pages),
            },
            "arcadia_endpoints": arcadia_endpoints[:50],
            "matchups": matchups_extracted[:250],
            "markets": markets_extracted[:400],
            "dom_snapshots": dom_pages,
        }

        out_path = self.save_raw_snapshot(
            payload=payload,
            url=self.TARGET_URLS[0],
            label="pinnacle_arcadia_and_dom",
            extra_meta={
                "matchups_count": len(matchups_extracted),
                "markets_count": len(markets_extracted),
                "arcadia_api_calls_captured": len(arcadia_endpoints),
            },
        )
        return {
            "source_id": self.source_id,
            "path": str(out_path),
            "records": len(matchups_extracted) + len(markets_extracted) + sum(p.get("dom_odds_count", 0) for p in dom_pages),
            "matchups_count": len(matchups_extracted),
            "markets_count": len(markets_extracted),
            "arcadia_calls": len(arcadia_endpoints),
        }

    @staticmethod
    def _normalize_arcadia_matchup(item: dict[str, Any]) -> dict[str, Any]:
        participants = item.get("participants", [])
        home = next((p.get("name") for p in participants if p.get("alignment") == "home"), None)
        away = next((p.get("name") for p in participants if p.get("alignment") == "away"), None)
        if not home and len(participants) >= 2:
            home = participants[0].get("name")
            away = participants[1].get("name")
        league = item.get("league") or {}
        return {
            "matchup_id": item.get("id"),
            "parent_id": item.get("parentId"),
            "kickoff_utc": item.get("startTime"),
            "home_team": home,
            "away_team": away,
            "league_id": league.get("id"),
            "league_name": league.get("name"),
            "sport_name": (league.get("sport") or {}).get("name"),
            "is_live": item.get("isLive", False),
            "status": item.get("status"),
            "rotation": item.get("rotation"),
        }

    @staticmethod
    def _normalize_arcadia_market(mkt: dict[str, Any]) -> dict[str, Any]:
        prices = []
        for p in mkt.get("prices", []):
            am = p.get("price")
            prices.append(
                {
                    "designation": p.get("designation"),
                    "points": p.get("points"),
                    "american_odds": am,
                    "decimal_odds": _american_to_decimal(am),
                }
            )
        limits = mkt.get("limits", [])
        max_limit = None
        for lim in limits:
            if isinstance(lim, dict) and lim.get("amount"):
                max_limit = lim.get("amount")
                break
        return {
            "matchup_id": mkt.get("matchupId"),
            "market_type": mkt.get("type"),
            "period": mkt.get("period"),
            "is_alternate": mkt.get("isAlternate", False),
            "cutoff_at": mkt.get("cutoffAt"),
            "max_limit_usd": max_limit,
            "prices": prices,
        }

    @staticmethod
    def _extract_dom_summary(page: Selector, url: str) -> dict[str, Any]:
        title = page.css("title::text").get() or ""
        links = page.css("a::attr(href)").getall()
        matchup_links = [href for href in links if "/matchups/" in href or "/soccer/" in href or "/football/" in href]
        price_spans = [
            t.strip()
            for t in page.css("span::text, button::text").getall()
            if re.fullmatch(r"[+-]?\d+(\.\d+)?", t.strip())
        ]
        team_spans = [
            t.strip()
            for t in page.css("[class*='gameInfoLabel']::text, [class*='participant']::text, [class*='ellipsis']::text").getall()
            if len(t.strip()) >= 3
        ]
        return {
            "url": url,
            "status": getattr(page, "status", None),
            "title": title.strip(),
            "dom_matchup_links_count": len(matchup_links),
            "dom_matchup_links_sample": matchup_links[:30],
            "dom_odds_count": len(price_spans),
            "dom_odds_sample": price_spans[:50],
            "dom_teams_sample": team_spans[:40],
        }


class CalienteMxOddsScraper(PitchLabScraplingBase):
    """Captura eventos y cuotas de Caliente.mx vía `AsyncStealthySession`."""

    TARGET_URLS = [
        "https://sports.caliente.mx/es_MX/Futbol",
        "https://sports.caliente.mx/es_MX",
    ]

    def __init__(self) -> None:
        super().__init__("caliente_mx")

    async def run(self) -> dict[str, Any]:
        dom_pages: list[dict[str, Any]] = []
        all_events: list[dict[str, Any]] = []
        network_records: list[dict[str, Any]] = []

        async with AsyncStealthySession(
            headless=True,
            solve_cloudflare=True,
            record_requests=True,
            timeout=60000,
            max_recorded_requests=1000,
        ) as session:
            for url in self.TARGET_URLS:
                try:
                    page = await session.fetch(
                        url,
                        network_idle=True,
                        wait=5000,
                        google_search=False,
                    )
                    page_data = self._extract_caliente_dom(page, url)
                    dom_pages.append(page_data)
                    all_events.extend(page_data.get("events", []))
                except Exception as exc:
                    dom_pages.append({"url": url, "error": str(exc)})

            for resp in session.network.search(limit=None):
                rtype = resp.meta.get("resource_type")
                if rtype in ("xhr", "fetch", "document") or "json" in resp.url.lower():
                    parsed = _safe_json_loads(resp.body) if resp.body else None
                    rec: dict[str, Any] = {
                        "network_id": resp.meta.get("network_id"),
                        "url": resp.url,
                        "status": resp.status,
                        "resource_type": rtype,
                        "body_bytes": len(resp.body) if resp.body else 0,
                    }
                    if parsed is not None:
                        rec["has_json"] = True
                        rec["json_preview"] = parsed if len(str(parsed)) < 2000 else {"keys": list(parsed.keys())[:20] if isinstance(parsed, dict) else f"list[{len(parsed)}]"}
                    network_records.append(rec)

        # Deduplicar eventos por clave (home_team, away_team)
        dedup_events: dict[str, dict[str, Any]] = {}
        for ev in all_events:
            key = f"{ev.get('home_team', '')}_vs_{ev.get('away_team', '')}_{ev.get('event_url', '')}"
            if key not in dedup_events:
                dedup_events[key] = ev

        unique_events = list(dedup_events.values())

        payload = {
            "source": "caliente_mx",
            "target_urls": self.TARGET_URLS,
            "summary": {
                "pages_visited": len(dom_pages),
                "unique_events_extracted": len(unique_events),
                "total_odds_selections_extracted": sum(p.get("raw_odds_count", 0) for p in dom_pages),
                "network_requests_recorded": len(network_records),
            },
            "events": unique_events[:250],
            "dom_pages": [
                {k: v for k, v in p.items() if k != "events"} for p in dom_pages
            ],
            "network_requests": network_records[:100],
        }

        out_path = self.save_raw_snapshot(
            payload=payload,
            url=self.TARGET_URLS[0],
            label="caliente_mx_sportsbook",
            extra_meta={
                "unique_events_extracted": len(unique_events),
                "network_requests_recorded": len(network_records),
            },
        )
        return {
            "source_id": self.source_id,
            "path": str(out_path),
            "records": len(unique_events) or sum(p.get("raw_odds_count", 0) for p in dom_pages),
            "unique_events": len(unique_events),
            "network_requests": len(network_records),
        }

    @staticmethod
    def _extract_caliente_dom(page: Selector, url: str) -> dict[str, Any]:
        title = (page.css("title::text").get() or "").strip()
        events: list[dict[str, Any]] = []

        # Caliente usa tablas/filas de mercado (.mkt, tr.mkt-row, .sgl-market, .ev, etc.)
        rows = page.css("tr, .mkt, .ev-list li, [class*='event'], [class*='match']")
        for row in rows:
            team_nodes = row.css(
                ".seln-name::text, .team-name::text, .ev-name::text, a[href*='/es_MX/']::text"
            ).getall()
            teams = [t.strip() for t in team_nodes if t and len(t.strip()) >= 2 and not re.fullmatch(r"[+-]?\d+(\.\d+)?", t.strip())]
            dec_odds = [
                o.strip()
                for o in row.css(".price.dec::text, .dec::text, [class*='price']::text, button span::text").getall()
                if o and re.fullmatch(r"[+-]?\d+(\.\d+)?", o.strip())
            ]
            if len(teams) >= 2 and dec_odds:
                href = row.css("a::attr(href)").get() or ""
                events.append(
                    {
                        "home_team": teams[0],
                        "away_team": teams[1],
                        "extra_labels": teams[2:5],
                        "odds_values": dec_odds[:6],
                        "event_url": href,
                    }
                )

        # Fallback: extraer botones de selección (.seln / button) y enlaces de eventos deportivos
        seln_buttons = page.css("button, .seln, [class*='runner'], [class*='outcome']")
        raw_selections: list[dict[str, Any]] = []
        for btn in seln_buttons[:300]:
            texts = [t.strip() for t in btn.css("*::text, ::text").getall() if t.strip()]
            if not texts:
                continue
            odds_match = next((t for t in texts if re.fullmatch(r"[+-]\d{3,4}|\d+\.\d{2}", t)), None)
            label_match = next((t for t in texts if t != odds_match and len(t) >= 2), None)
            if odds_match:
                raw_selections.append({"label": label_match or "selection", "odds": odds_match})

        sport_links = [
            {"text": (a.css("::text").get() or "").strip(), "href": a.attrib.get("href", "")}
            for a in page.css("a[href]")
            if any(k in a.attrib.get("href", "") for k in ("Futbol", "Liga-MX", "NFL", "Soccer", "ev_id", "mkt_sort"))
        ]

        # Si `events` quedó vacío pero hay selecciones con cuota, agrupar pares/ternas 1X2
        if not events and len(raw_selections) >= 2:
            for idx in range(0, min(len(raw_selections) - 1, 150), 3):
                chunk = raw_selections[idx : idx + 3]
                events.append(
                    {
                        "home_team": chunk[0]["label"],
                        "away_team": chunk[-1]["label"],
                        "selections": chunk,
                        "odds_values": [c["odds"] for c in chunk],
                        "event_url": url,
                    }
                )

        return {
            "url": url,
            "status": getattr(page, "status", None),
            "title": title,
            "events_count": len(events),
            "raw_odds_count": len(raw_selections),
            "sport_links_count": len(sport_links),
            "sport_links_sample": sport_links[:40],
            "raw_selections_sample": raw_selections[:60],
            "events": events,
        }


class ActionNetworkSplitsScraper(PitchLabScraplingBase):
    """Captura momios, líneas de apertura/actuales y public betting splits vía `FetcherSession`."""

    TARGET_URLS = [
        "https://www.actionnetwork.com/nfl/public-betting",
        "https://www.actionnetwork.com/nfl/odds",
        "https://www.actionnetwork.com/soccer/odds",
        "https://www.actionnetwork.com/soccer/public-betting",
    ]

    def __init__(self) -> None:
        super().__init__("action_network_splits")

    def run(self) -> dict[str, Any]:
        pages_extracted: list[dict[str, Any]] = []
        all_games: list[dict[str, Any]] = []

        with FetcherSession(
            impersonate=self.config.get("impersonate", "chrome"),
            stealthy_headers=self.config.get("stealthy_headers", True),
        ) as session:
            for url in self.TARGET_URLS:
                try:
                    response = session.get(url)
                    page_summary, games = self._parse_action_network_page(response, url)
                    pages_extracted.append(page_summary)
                    all_games.extend(games)
                except Exception as exc:
                    pages_extracted.append({"url": url, "error": str(exc)})

        # Deduplicar por game_id
        games_by_id: dict[Any, dict[str, Any]] = {}
        for g in all_games:
            gid = g.get("game_id") or f"{g.get('away_team')}_{g.get('home_team')}_{g.get('start_time')}"
            if gid not in games_by_id:
                games_by_id[gid] = g

        unique_games = list(games_by_id.values())

        payload = {
            "source": "action_network_splits",
            "target_urls": self.TARGET_URLS,
            "summary": {
                "pages_fetched": len(pages_extracted),
                "unique_games_extracted": len(unique_games),
                "total_game_records_across_views": len(all_games),
            },
            "pages": pages_extracted,
            "games": unique_games,
        }

        out_path = self.save_raw_snapshot(
            payload=payload,
            url=self.TARGET_URLS[0],
            label="action_network_next_data_splits",
            extra_meta={
                "unique_games_extracted": len(unique_games),
                "pages_fetched": len(pages_extracted),
            },
        )
        return {
            "source_id": self.source_id,
            "path": str(out_path),
            "records": len(unique_games) or len(all_games),
            "unique_games": len(unique_games),
            "pages_fetched": len(pages_extracted),
        }

    @classmethod
    def _parse_action_network_page(
        cls, response: Selector, url: str
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        title = (response.css("title::text").get() or "").strip()
        next_data_raw = response.css("script#__NEXT_DATA__::text").get()
        games_normalized: list[dict[str, Any]] = []
        next_data_meta: dict[str, Any] = {}

        if next_data_raw:
            parsed = _safe_json_loads(next_data_raw)
            if isinstance(parsed, dict):
                page_props = (parsed.get("props") or {}).get("pageProps") or {}
                scoreboard = page_props.get("scoreboardResponse") or {}
                raw_games = scoreboard.get("games") or page_props.get("games") or []
                next_data_meta = {
                    "build_id": parsed.get("buildId"),
                    "page": parsed.get("page"),
                    "league": page_props.get("league"),
                    "date": scoreboard.get("date") or page_props.get("date"),
                    "raw_games_count": len(raw_games) if isinstance(raw_games, list) else 0,
                }
                if isinstance(raw_games, list):
                    for g in raw_games:
                        if isinstance(g, dict):
                            games_normalized.append(cls._normalize_game(g, url))

        # También extraer filas del DOM por si hay tablas renderizadas
        dom_rows = response.css("table tbody tr")
        dom_teams = [
            t.strip()
            for t in response.css("[class*='game-info']::text, [class*='team-name']::text, td a span::text").getall()
            if t.strip()
        ]

        page_summary = {
            "url": url,
            "status": getattr(response, "status", None),
            "title": title,
            "has_next_data": bool(next_data_raw),
            "next_data_meta": next_data_meta,
            "games_extracted_count": len(games_normalized),
            "dom_table_rows_count": len(dom_rows),
            "dom_teams_sample": dom_teams[:30],
        }
        return page_summary, games_normalized

    @staticmethod
    def _normalize_game(g: dict[str, Any], source_url: str) -> dict[str, Any]:
        teams = g.get("teams") or []
        home_id = g.get("home_team_id")
        away_id = g.get("away_team_id")
        home_team = next((t for t in teams if t.get("id") == home_id), teams[0] if teams else {})
        away_team = next((t for t in teams if t.get("id") == away_id), teams[1] if len(teams) > 1 else {})

        markets = g.get("markets") or {}
        odds_list = g.get("odds") or []
        extracted_markets: list[dict[str, Any]] = []

        # En Action Network v2+, `markets` es un dict por book_id -> event -> market_type
        if isinstance(markets, dict):
            for book_id, book_data in list(markets.items())[:10]:
                if not isinstance(book_data, dict):
                    continue
                event_mkts = book_data.get("event") or book_data
                if not isinstance(event_mkts, dict):
                    continue
                for mkt_type, outcomes in event_mkts.items():
                    if not isinstance(outcomes, list):
                        continue
                    for out in outcomes:
                        if not isinstance(out, dict):
                            continue
                        bet_info = out.get("bet_info") or {}
                        tickets = bet_info.get("tickets") or {}
                        money = bet_info.get("money") or {}
                        extracted_markets.append(
                            {
                                "book_id": book_id,
                                "market_type": mkt_type,
                                "side": out.get("side"),
                                "value": out.get("value"),
                                "odds": out.get("odds"),
                                "is_live": out.get("is_live"),
                                "tickets_pct": tickets.get("percent"),
                                "tickets_value": tickets.get("value"),
                                "money_pct": money.get("percent"),
                                "money_value": money.get("value"),
                            }
                        )

        # Fallback para estructura `odds` clásica
        if not extracted_markets and isinstance(odds_list, list):
            for odd in odds_list[:15]:
                if isinstance(odd, dict):
                    extracted_markets.append(
                        {
                            "book_id": odd.get("book_id"),
                            "type": odd.get("type"),
                            "ml_home": odd.get("ml_home"),
                            "ml_away": odd.get("ml_away"),
                            "ml_draw": odd.get("ml_draw"),
                            "spread_home": odd.get("spread_home"),
                            "spread_away": odd.get("spread_away"),
                            "total": odd.get("total"),
                            "ml_home_public": odd.get("ml_home_public"),
                            "ml_home_money": odd.get("ml_home_money"),
                            "spread_home_public": odd.get("spread_home_public"),
                            "spread_home_money": odd.get("spread_home_money"),
                            "total_over_public": odd.get("total_over_public"),
                            "total_over_money": odd.get("total_over_money"),
                        }
                    )

        return {
            "game_id": g.get("id"),
            "league_name": g.get("league_name"),
            "season": g.get("season"),
            "week": g.get("week"),
            "start_time": g.get("start_time"),
            "status": g.get("status"),
            "num_bets": g.get("num_bets"),
            "home_team": home_team.get("full_name") or home_team.get("display_name"),
            "away_team": away_team.get("full_name") or away_team.get("display_name"),
            "home_abbr": home_team.get("abbr"),
            "away_abbr": away_team.get("abbr"),
            "source_url": source_url,
            "markets_count": len(extracted_markets),
            "markets_sample": extracted_markets[:30],
        }


async def run_all_odds_scrapers(only_source: str | None = None) -> list[dict[str, Any]]:
    """Ejecuta los 3 scrapers de la Categoría 1 (`odds_casinos`) y devuelve el resumen."""
    results: list[dict[str, Any]] = []

    if only_source in (None, "all", "action_network_splits"):
        print("[1/3] Ejecutando ActionNetworkSplitsScraper (FetcherSession)...")
        an_scraper = ActionNetworkSplitsScraper()
        an_res = an_scraper.run()
        results.append(an_res)
        print(f"      -> Guardado: {an_res['path']} (records={an_res['records']})")

    if only_source in (None, "all", "pinnacle"):
        print("[2/3] Ejecutando PinnacleOddsScraper (AsyncStealthySession)...")
        pin_scraper = PinnacleOddsScraper()
        pin_res = await pin_scraper.run()
        results.append(pin_res)
        print(
            f"      -> Guardado: {pin_res['path']} "
            f"(matchups={pin_res['matchups_count']}, markets={pin_res['markets_count']}, arcadia_calls={pin_res['arcadia_calls']})"
        )

    if only_source in (None, "all", "caliente_mx"):
        print("[3/3] Ejecutando CalienteMxOddsScraper (AsyncStealthySession)...")
        cal_scraper = CalienteMxOddsScraper()
        cal_res = await cal_scraper.run()
        results.append(cal_res)
        print(
            f"      -> Guardado: {cal_res['path']} "
            f"(unique_events={cal_res['unique_events']}, network_requests={cal_res['network_requests']})"
        )

    return results


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Scraper Categoría 1: odds_casinos")
    parser.add_argument("--source", default="all", help="Fuente a ejecutar (all, action_network_splits, pinnacle, caliente_mx)")
    args = parser.parse_args()
    summary = asyncio.run(run_all_odds_scrapers(args.source))
    print("\n=== RESUMEN ODDS_CASINOS ===")
    print(json.dumps(summary, indent=2, ensure_ascii=False))
