"""Scraper Wave 2 para Categoría 1 (`odds_casinos`) y Categoría 2 (`advanced_stats_xg`).

REGLA DE INGENIERÍA:
Exclusivamente utiliza Scrapling (`FetcherSession`, `StealthySession`, `AsyncStealthySession`,
`Selector`) a través de `PitchLabScraplingBase` (`scrapers/base_scraper.py`).
Cada captura se sella con `captured_at_utc` y `sha256`.

Fuentes cubiertas (7):
1. `sofascore` (advanced_stats_xg)
2. `fotmob` (advanced_stats_xg)
3. `fbref` (advanced_stats_xg)
4. `pfr_rbsdm_sumersports` (advanced_stats_xg)
5. `codere_bet365_mx` (odds_casinos)
6. `oddsportal_oddschecker` (odds_casinos)
7. `betfair_smarkets_exchange` (odds_casinos)
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
import re
import sys
from typing import Any

from scrapling.fetchers import (
    AsyncStealthySession,
    FetcherSession,
    StealthySession,
)
from scrapling.parser import Selector

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from scrapers.base_scraper import DATA_RAW_DIR, PitchLabScraplingBase, utc_now_iso  # noqa: E402

WAVE2_SOURCES = (
    "sofascore",
    "fotmob",
    "fbref",
    "pfr_rbsdm_sumersports",
    "codere_bet365_mx",
    "oddsportal_oddschecker",
    "betfair_smarkets_exchange",
)


def _response_text(resp: Any) -> str:
    """Extrae texto UTF-8 seguro desde un Response de Scrapling."""
    if resp is None:
        return ""
    body = getattr(resp, "body", b"")
    if isinstance(body, bytes):
        return body.decode("utf-8", errors="replace")
    if isinstance(body, str) and body:
        return body
    text = getattr(resp, "text", "")
    return str(text or "")


def _safe_json_loads(raw: bytes | str | None) -> Any | None:
    """Parsea JSON de forma segura sin lanzar excepción."""
    if not raw:
        return None
    try:
        text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else raw
        text_stripped = text.strip()
        if not text_stripped:
            return None
        return json.loads(text_stripped)
    except Exception:
        return None


def _clean_wave2_source_dir(category: str, source_id: str) -> None:
    """Limpia snapshots previos únicamente de la fuente Wave 2 indicada."""
    src_dir = DATA_RAW_DIR / category / source_id
    if src_dir.exists():
        for f in src_dir.rglob("*.json"):
            f.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# 1. SOFASCORE (advanced_stats_xg)
# ---------------------------------------------------------------------------
async def scrape_sofascore() -> dict[str, Any]:
    """Captura eventos programados, torneos y respuestas API de Sofascore vía AsyncStealthySession."""
    scraper = PitchLabScraplingBase("sofascore")
    _clean_wave2_source_dir(scraper.category, scraper.source_id)

    web_url = "https://www.sofascore.com/football"
    api_urls = [
        "https://api.sofascore.com/api/v1/sport/football/scheduled-events/2026-11-09",
        "https://api.sofascore.com/api/v1/unique-tournament/11621/seasons",
    ]

    scheduled_events: list[dict[str, Any]] = []
    ligamx_seasons: list[dict[str, Any]] = []
    recorded_api_calls: list[dict[str, Any]] = []
    dom_summary: dict[str, Any] = {}

    async with AsyncStealthySession(
        headless=True,
        solve_cloudflare=True,
        record_requests=True,
        block_ads=True,
        timeout=45000,
        max_recorded_requests=800,
    ) as session:
        try:
            page = await session.fetch(
                web_url,
                wait_until="domcontentloaded",
                wait=3000,
                google_search=False,
            )
            title = (page.css("title::text").get() or "").strip()
            next_data_raw = page.css("script#__NEXT_DATA__::text").get()
            next_data = _safe_json_loads(next_data_raw)
            links = [
                {
                    "text": " ".join(a.css("::text").getall()).strip(),
                    "href": a.attrib.get("href", ""),
                }
                for a in page.css("a[href]")
                if any(
                    k in a.attrib.get("href", "")
                    for k in ("/football/", "/tournament/", "/match/", "/team/")
                )
            ]
            dom_summary = {
                "url": web_url,
                "status": getattr(page, "status", None),
                "title": title,
                "has_next_data": bool(next_data),
                "next_data_keys": list(next_data.keys()) if isinstance(next_data, dict) else [],
                "football_links_count": len(links),
                "football_links_sample": links[:50],
            }
            if isinstance(next_data, dict):
                props = (next_data.get("props") or {}).get("pageProps") or {}
                initial_events = (
                    props.get("events")
                    or props.get("scheduledEvents")
                    or (props.get("initialProps") or {}).get("events")
                    or []
                )
                if isinstance(initial_events, list):
                    for ev in initial_events[:100]:
                        if isinstance(ev, dict):
                            scheduled_events.append(_normalize_sofascore_event(ev))
        except Exception as exc:
            dom_summary = {"url": web_url, "error": str(exc)}

        # Consultar endpoints JSON dentro de la misma sesión autenticada con Turnstile
        for api_url in api_urls:
            try:
                api_page = await session.fetch(
                    api_url,
                    wait_until="domcontentloaded",
                    wait=1500,
                    google_search=False,
                )
                raw_text = api_page.css("pre::text, body::text").get() or _response_text(api_page)
                parsed = _safe_json_loads(raw_text)
                if isinstance(parsed, dict):
                    if "events" in parsed and isinstance(parsed["events"], list):
                        for ev in parsed["events"][:150]:
                            if isinstance(ev, dict):
                                scheduled_events.append(_normalize_sofascore_event(ev))
                    if "seasons" in parsed and isinstance(parsed["seasons"], list):
                        ligamx_seasons = parsed["seasons"][:25]
            except Exception as exc:
                recorded_api_calls.append({"url": api_url, "error": str(exc)})

        for resp in session.network.search(url_pattern=r"(sofascore\.com|api/v1)", limit=None):
            rtype = resp.meta.get("resource_type", "")
            parsed = _safe_json_loads(resp.body) if resp.body else None
            if parsed is not None or rtype in ("xhr", "fetch") or "api.sofascore.com" in resp.url:
                entry: dict[str, Any] = {
                    "network_id": resp.meta.get("network_id"),
                    "url": resp.url,
                    "status": resp.status,
                    "resource_type": rtype,
                }
                if isinstance(parsed, dict):
                    entry["json_keys"] = list(parsed.keys())[:15]
                    if "events" in parsed and isinstance(parsed["events"], list) and not scheduled_events:
                        for ev in parsed["events"][:150]:
                            if isinstance(ev, dict):
                                scheduled_events.append(_normalize_sofascore_event(ev))
                recorded_api_calls.append(entry)

    # Deduplicar eventos por event_id
    dedup_events: dict[Any, dict[str, Any]] = {}
    for ev in scheduled_events:
        eid = ev.get("event_id") or f"{ev.get('home_team')}_{ev.get('away_team')}"
        if eid not in dedup_events:
            dedup_events[eid] = ev
    unique_events = list(dedup_events.values())

    records_count = (
        len(unique_events)
        + len(ligamx_seasons)
        + dom_summary.get("football_links_count", 0)
        + len(recorded_api_calls)
    )

    payload = {
        "source": "sofascore",
        "target_urls": [web_url, *api_urls],
        "summary": {
            "scheduled_events_extracted": len(unique_events),
            "ligamx_seasons_extracted": len(ligamx_seasons),
            "football_dom_links_count": dom_summary.get("football_links_count", 0),
            "network_api_calls_captured": len(recorded_api_calls),
            "total_records": records_count,
        },
        "dom_summary": dom_summary,
        "scheduled_events": unique_events[:150],
        "ligamx_seasons": ligamx_seasons,
        "recorded_api_calls": recorded_api_calls[:80],
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=web_url,
        label="sofascore_football_events",
        extra_meta=payload["summary"],
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": "sofascore",
        "category": scraper.category,
        "path": str(out_path),
        "records": records_count,
        "sha256": sha256_val,
    }


def _normalize_sofascore_event(ev: dict[str, Any]) -> dict[str, Any]:
    tournament = ev.get("tournament") or {}
    unique_tour = tournament.get("uniqueTournament") or {}
    home = ev.get("homeTeam") or {}
    away = ev.get("awayTeam") or {}
    home_score = ev.get("homeScore") or {}
    away_score = ev.get("awayScore") or {}
    status = ev.get("status") or {}
    return {
        "event_id": ev.get("id"),
        "slug": ev.get("slug"),
        "start_timestamp": ev.get("startTimestamp"),
        "tournament_name": tournament.get("name"),
        "unique_tournament_id": unique_tour.get("id"),
        "unique_tournament_name": unique_tour.get("name"),
        "country": ((tournament.get("category") or {}).get("name")),
        "home_team": home.get("name"),
        "home_team_id": home.get("id"),
        "away_team": away.get("name"),
        "away_team_id": away.get("id"),
        "home_score": home_score.get("current"),
        "away_score": away_score.get("current"),
        "status_type": status.get("type"),
        "status_description": status.get("description"),
        "has_xg": ev.get("hasXg"),
        "has_event_player_statistics": ev.get("hasEventPlayerStatistics"),
    }


# ---------------------------------------------------------------------------
# 2. FOTMOB (advanced_stats_xg)
# ---------------------------------------------------------------------------
async def scrape_fotmob() -> dict[str, Any]:
    """Extrae `__NEXT_DATA__` (tablas, partidos, xG y líderes) de Liga MX y Premier League en FotMob."""
    scraper = PitchLabScraplingBase("fotmob")
    _clean_wave2_source_dir(scraper.category, scraper.source_id)

    target_leagues = [
        ("liga-mx", 230, "https://www.fotmob.com/leagues/230/overview/liga-mx"),
        ("premier-league", 47, "https://www.fotmob.com/leagues/47/overview/premier-league"),
    ]

    leagues_data: list[dict[str, Any]] = []
    total_records = 0

    with FetcherSession(
        impersonate="chrome",
        stealthy_headers=True,
    ) as session:
        for slug, league_id, url in target_leagues:
            resp = session.get(url, timeout=25)
            nd_raw = resp.css("script#__NEXT_DATA__::text").get()
            parsed = _safe_json_loads(nd_raw)
            league_entry = _extract_fotmob_league_payload(parsed, slug, league_id, url, resp.status)
            total_records += (
                len(league_entry.get("standings_rows", []))
                + len(league_entry.get("matches", []))
                + len(league_entry.get("top_stat_lists", []))
            )
            leagues_data.append(league_entry)

    payload = {
        "source": "fotmob",
        "target_urls": [u for _, _, u in target_leagues],
        "summary": {
            "leagues_scraped": len(leagues_data),
            "total_standings_rows": sum(len(lg.get("standings_rows", [])) for lg in leagues_data),
            "total_matches_extracted": sum(len(lg.get("matches", [])) for lg in leagues_data),
            "total_stat_categories": sum(len(lg.get("top_stat_lists", [])) for lg in leagues_data),
            "total_records": total_records,
        },
        "leagues": leagues_data,
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=target_leagues[0][2],
        label="fotmob_ligamx_epl_next_data",
        extra_meta=payload["summary"],
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": "fotmob",
        "category": scraper.category,
        "path": str(out_path),
        "records": total_records,
        "sha256": sha256_val,
    }


def _extract_fotmob_league_payload(
    parsed: Any, slug: str, league_id: int, url: str, status_code: int | None
) -> dict[str, Any]:
    if not isinstance(parsed, dict):
        return {"league_slug": slug, "league_id": league_id, "url": url, "status": status_code}

    page_props = (parsed.get("props") or {}).get("pageProps") or {}
    details = page_props.get("details") or {}
    overview = page_props.get("overview") or {}
    fixtures = page_props.get("fixtures") or {}
    stats_block = page_props.get("stats") or {}
    table_list = page_props.get("table") or overview.get("table") or []

    # Extraer filas de clasificación
    standings_rows: list[dict[str, Any]] = []
    if isinstance(table_list, list):
        for tbl_wrapper in table_list:
            if not isinstance(tbl_wrapper, dict):
                continue
            data_obj = tbl_wrapper.get("data") or tbl_wrapper
            inner_table = (data_obj.get("table") or {}) if isinstance(data_obj, dict) else {}
            all_rows = inner_table.get("all") or inner_table.get("home") or []
            if not all_rows and isinstance(data_obj.get("tables"), list):
                for sub_tbl in data_obj["tables"]:
                    if isinstance(sub_tbl, dict):
                        all_rows.extend((sub_tbl.get("table") or {}).get("all") or [])
            for r in all_rows:
                if isinstance(r, dict):
                    standings_rows.append(
                        {
                            "idx": r.get("idx"),
                            "team_id": r.get("id"),
                            "team_name": r.get("name") or r.get("shortName"),
                            "played": r.get("played"),
                            "wins": r.get("wins"),
                            "draws": r.get("draws"),
                            "losses": r.get("losses"),
                            "scores_str": r.get("scoresStr"),
                            "goal_conceded": r.get("goalConDiff"),
                            "pts": r.get("pts"),
                            "xg": r.get("xg"),
                            "xg_conceded": r.get("xgConceded"),
                        }
                    )

    # Extraer partidos (allMatches / overviewMatches)
    raw_matches = (
        fixtures.get("allMatches")
        or overview.get("leagueOverviewMatches")
        or []
    )
    matches: list[dict[str, Any]] = []
    if isinstance(raw_matches, list):
        for m in raw_matches[:80]:
            if isinstance(m, dict):
                home = m.get("home") or {}
                away = m.get("away") or {}
                st = m.get("status") or {}
                matches.append(
                    {
                        "match_id": m.get("id"),
                        "round": m.get("round") or m.get("roundName"),
                        "page_url": m.get("pageUrl"),
                        "home_team": home.get("name"),
                        "home_id": home.get("id"),
                        "home_score": home.get("score"),
                        "away_team": away.get("name"),
                        "away_id": away.get("id"),
                        "away_score": away.get("score"),
                        "utc_time": st.get("utcTime"),
                        "finished": st.get("finished"),
                        "started": st.get("started"),
                        "score_str": st.get("scoreStr"),
                    }
                )

    # Extraer estadísticas de jugadores y equipos (xG, rating, goles, asistencias)
    top_stat_lists: list[dict[str, Any]] = []
    raw_players_stats = (
        stats_block.get("players")
        or stats_block.get("teams")
        or overview.get("topPlayers")
        or []
    )
    if isinstance(raw_players_stats, list):
        for cat in raw_players_stats[:20]:
            if isinstance(cat, dict):
                top_three = cat.get("topThree") or cat.get("participant") or []
                top_stat_lists.append(
                    {
                        "header": cat.get("header") or cat.get("name"),
                        "category": cat.get("category"),
                        "fetch_all_url": cat.get("fetchAllUrl"),
                        "leaders": [
                            {
                                "id": p.get("id"),
                                "name": p.get("name"),
                                "team_id": p.get("teamId"),
                                "team_name": p.get("teamName"),
                                "value": (p.get("stat") or {}).get("value") if isinstance(p.get("stat"), dict) else p.get("value"),
                            }
                            for p in (top_three if isinstance(top_three, list) else [])[:5]
                            if isinstance(p, dict)
                        ],
                    }
                )

    return {
        "league_slug": slug,
        "league_id": details.get("id") or league_id,
        "league_name": details.get("name"),
        "country": details.get("country"),
        "selected_season": details.get("selectedSeason") or page_props.get("selectedSeason"),
        "url": url,
        "status": status_code,
        "standings_count": len(standings_rows),
        "standings_rows": standings_rows,
        "matches_count": len(matches),
        "matches": matches,
        "top_stat_lists_count": len(top_stat_lists),
        "top_stat_lists": top_stat_lists,
    }


# ---------------------------------------------------------------------------
# 3. FBREF (advanced_stats_xg)
# ---------------------------------------------------------------------------
def scrape_fbref() -> dict[str, Any]:
    """Extrae tablas estadísticas (`table.stats_table`) de FBref para Liga MX y Premier League."""
    scraper = PitchLabScraplingBase("fbref")
    _clean_wave2_source_dir(scraper.category, scraper.source_id)

    targets = [
        (
            "liga-mx",
            "https://fbref.com/en/comps/31/Liga-MX-Stats",
            "https://web.archive.org/web/20250212011227/https://fbref.com/en/comps/31/Liga-MX-Stats",
        ),
        (
            "premier-league",
            "https://fbref.com/en/comps/9/Premier-League-Stats",
            "https://web.archive.org/web/20250215061818/https://fbref.com/en/comps/9/Premier-League-Stats",
        ),
    ]

    comps_extracted: list[dict[str, Any]] = []
    total_rows = 0

    with StealthySession(
        headless=True,
        solve_cloudflare=True,
        network_idle=True,
        block_ads=True,
        timeout=45000,
    ) as stealth_session:
        for comp_slug, live_url, archive_url in targets:
            page = None
            used_archive = False
            try:
                page = stealth_session.fetch(
                    live_url,
                    wait_until="domcontentloaded",
                    wait=3000,
                    google_search=False,
                )
            except Exception:
                page = None

            tables = _parse_fbref_tables(page) if page else []

            # Si Cloudflare o rate-limit impidió renderizar `table.stats_table`, usar snapshot Wayback con FetcherSession
            if not tables:
                try:
                    with FetcherSession(impersonate="chrome", stealthy_headers=True) as fs:
                        arch_resp = fs.get(archive_url, timeout=25)
                        tables = _parse_fbref_tables(arch_resp)
                        if tables:
                            page = arch_resp
                            used_archive = True
                except Exception:
                    pass

            comp_rows_count = sum(len(t.get("rows", [])) for t in tables)
            total_rows += comp_rows_count
            comps_extracted.append(
                {
                    "competition": comp_slug,
                    "live_url": live_url,
                    "used_archive_fallback": used_archive,
                    "archive_url": archive_url if used_archive else None,
                    "status": getattr(page, "status", None) if page else None,
                    "title": (page.css("title::text").get() or "").strip() if page else None,
                    "tables_count": len(tables),
                    "total_rows": comp_rows_count,
                    "tables": tables[:8],
                }
            )

    payload = {
        "source": "fbref",
        "target_urls": [u for _, u, _ in targets],
        "summary": {
            "competitions_scraped": len(comps_extracted),
            "total_tables_extracted": sum(c.get("tables_count", 0) for c in comps_extracted),
            "total_team_stat_rows": total_rows,
        },
        "competitions": comps_extracted,
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=targets[0][1],
        label="fbref_ligamx_epl_stats_tables",
        extra_meta=payload["summary"],
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": "fbref",
        "category": scraper.category,
        "path": str(out_path),
        "records": total_rows,
        "sha256": sha256_val,
    }


def _parse_fbref_tables(page: Selector) -> list[dict[str, Any]]:
    tables_out: list[dict[str, Any]] = []
    raw_tables = page.css("table.stats_table, table[id*='results'], table[id*='stats_squads']")

    # Si están comentadas en HTML (`<!-- <table class="stats_table"...>`), extraerlas con Selector
    if not raw_tables:
        html_text = _response_text(page)
        for comment_match in re.finditer(r"<!--(.*?<table[^>]*stats_table.*?</table>.*?)-->", html_text, re.DOTALL):
            sub_sel = Selector(comment_match.group(1))
            raw_tables.extend(sub_sel.css("table"))

    for tbl in raw_tables[:10]:
        table_id = tbl.attrib.get("id", "stats_table")
        caption = " ".join(tbl.css("caption::text").getall()).strip()
        rows_data: list[dict[str, Any]] = []
        for tr in tbl.css("tbody tr"):
            if "thead" in (tr.attrib.get("class") or ""):
                continue
            row_dict: dict[str, Any] = {}
            for cell in tr.css("th, td"):
                stat_name = cell.attrib.get("data-stat")
                val = " ".join(cell.css("::text, *::text").getall()).strip()
                if stat_name and val:
                    row_dict[stat_name] = val
            if row_dict and (row_dict.get("team") or row_dict.get("squad") or len(row_dict) >= 4):
                rows_data.append(row_dict)
        if rows_data:
            tables_out.append(
                {
                    "table_id": table_id,
                    "caption": caption,
                    "rows_count": len(rows_data),
                    "rows": rows_data[:40],
                }
            )
    return tables_out


# ---------------------------------------------------------------------------
# 4. PFR / RBSDM / SUMERSPORTS (advanced_stats_xg)
# ---------------------------------------------------------------------------
def scrape_pfr_rbsdm_sumersports() -> dict[str, Any]:
    """Extrae eficiencia ofensiva/defensiva NFL (EPA/play, Success %, CPOE/ADoT) de SumerSports y PFR."""
    scraper = PitchLabScraplingBase("pfr_rbsdm_sumersports")
    _clean_wave2_source_dir(scraper.category, scraper.source_id)

    sumer_urls = [
        ("offensive", "https://sumersports.com/teams/offensive/"),
        ("defensive", "https://sumersports.com/teams/defensive/"),
    ]
    pfr_url = "https://www.pro-football-reference.com/years/2026/"

    sumer_tables: dict[str, list[dict[str, Any]]] = {}
    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        for side, url in sumer_urls:
            resp = session.get(url, timeout=25)
            headers = [
                " ".join(th.css("::text, *::text").getall()).strip()
                for th in resp.css("table thead th")
            ]
            rows_extracted: list[dict[str, Any]] = []
            for tr in resp.css("table tbody tr"):
                cells = [
                    " ".join(td.css("::text, *::text").getall()).strip()
                    for td in tr.css("td")
                ]
                if not cells:
                    continue
                if headers and len(headers) == len(cells):
                    row_obj = dict(zip(headers, cells))
                else:
                    row_obj = {f"col_{i}": val for i, val in enumerate(cells)}
                rows_extracted.append(row_obj)
            sumer_tables[side] = rows_extracted

    # Pro-Football-Reference con StealthySession
    pfr_rows: list[dict[str, Any]] = []
    pfr_meta: dict[str, Any] = {"url": pfr_url}
    try:
        with StealthySession(
            headless=True,
            solve_cloudflare=True,
            block_ads=True,
            timeout=40000,
        ) as stealth:
            pfr_page = stealth.fetch(
                pfr_url,
                wait_until="domcontentloaded",
                wait=2500,
                google_search=False,
            )
            pfr_meta["status"] = getattr(pfr_page, "status", None)
            pfr_meta["title"] = (pfr_page.css("title::text").get() or "").strip()
            for tr in pfr_page.css("table#AFC tbody tr, table#NFC tbody tr, table.stats_table tbody tr"):
                row_dict: dict[str, Any] = {}
                for cell in tr.css("th, td"):
                    stat_key = cell.attrib.get("data-stat")
                    val = " ".join(cell.css("::text, *::text").getall()).strip()
                    if stat_key and val:
                        row_dict[stat_key] = val
                if row_dict.get("team"):
                    pfr_rows.append(row_dict)
    except Exception as exc:
        pfr_meta["error"] = str(exc)

    total_records = (
        len(sumer_tables.get("offensive", []))
        + len(sumer_tables.get("defensive", []))
        + len(pfr_rows)
    )

    payload = {
        "source": "pfr_rbsdm_sumersports",
        "target_urls": [u for _, u in sumer_urls] + [pfr_url],
        "summary": {
            "sumersports_offensive_teams": len(sumer_tables.get("offensive", [])),
            "sumersports_defensive_teams": len(sumer_tables.get("defensive", [])),
            "pfr_standings_rows": len(pfr_rows),
            "total_records": total_records,
        },
        "sumersports_offensive": sumer_tables.get("offensive", []),
        "sumersports_defensive": sumer_tables.get("defensive", []),
        "pro_football_reference": {
            "meta": pfr_meta,
            "rows": pfr_rows[:64],
        },
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=sumer_urls[0][1],
        label="nfl_sumersports_pfr_epa_efficiency",
        extra_meta=payload["summary"],
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": "pfr_rbsdm_sumersports",
        "category": scraper.category,
        "path": str(out_path),
        "records": total_records,
        "sha256": sha256_val,
    }


# ---------------------------------------------------------------------------
# 5. CODERE / BET365 MX (odds_casinos)
# ---------------------------------------------------------------------------
async def scrape_codere_bet365_mx() -> dict[str, Any]:
    """Captura mercados, eventos y llamadas XHR de Codere.mx vía AsyncStealthySession."""
    scraper = PitchLabScraplingBase("codere_bet365_mx")
    _clean_wave2_source_dir(scraper.category, scraper.source_id)

    target_urls = [
        "https://www.codere.mx/",
        "https://m.codere.mx/deportes/#/HomePage",
    ]

    dom_pages: list[dict[str, Any]] = []
    network_calls: list[dict[str, Any]] = []
    odds_selections: list[dict[str, Any]] = []

    async with AsyncStealthySession(
        headless=True,
        solve_cloudflare=True,
        record_requests=True,
        block_ads=True,
        timeout=45000,
        max_recorded_requests=800,
    ) as session:
        for url in target_urls:
            try:
                page = await session.fetch(
                    url,
                    wait_until="domcontentloaded",
                    wait=3500,
                    google_search=False,
                )
                title = (page.css("title::text").get() or "").strip()
                links = [
                    {
                        "text": " ".join(a.css("::text, *::text").getall()).strip()[:100],
                        "href": a.attrib.get("href", ""),
                    }
                    for a in page.css("a[href]")
                    if a.attrib.get("href")
                ]
                buttons_and_odds = [
                    t.strip()
                    for t in page.css("button::text, span::text, div::text, h1::text, h2::text, h3::text").getall()
                    if t and len(t.strip()) >= 2
                ]
                for tok in buttons_and_odds:
                    if re.fullmatch(r"[+-]\d{3,4}|\d+\.\d{2}", tok):
                        odds_selections.append({"raw_odds": tok, "source_url": url})

                dom_pages.append(
                    {
                        "url": url,
                        "status": getattr(page, "status", None),
                        "title": title,
                        "links_count": len(links),
                        "links_sample": links[:40],
                        "text_tokens_count": len(buttons_and_odds),
                        "text_tokens_sample": buttons_and_odds[:60],
                    }
                )
            except Exception as exc:
                dom_pages.append({"url": url, "error": str(exc)})

        for resp in session.network.search(limit=None):
            rtype = resp.meta.get("resource_type", "")
            parsed = _safe_json_loads(resp.body) if resp.body else None
            if rtype in ("xhr", "fetch", "document") or parsed is not None or "codere" in resp.url.lower():
                rec: dict[str, Any] = {
                    "network_id": resp.meta.get("network_id"),
                    "url": resp.url,
                    "status": resp.status,
                    "resource_type": rtype,
                    "body_bytes": len(resp.body) if resp.body else 0,
                }
                if parsed is not None:
                    rec["has_json"] = True
                    rec["json_preview"] = (
                        {"keys": list(parsed.keys())[:15]}
                        if isinstance(parsed, dict)
                        else f"list[{len(parsed)}]"
                        if isinstance(parsed, list)
                        else str(parsed)[:300]
                    )
                network_calls.append(rec)

    total_records = (
        len(odds_selections)
        + sum(p.get("links_count", 0) + p.get("text_tokens_count", 0) for p in dom_pages)
        + len(network_calls)
    )

    payload = {
        "source": "codere_bet365_mx",
        "target_urls": target_urls,
        "summary": {
            "pages_visited": len(dom_pages),
            "odds_tokens_detected": len(odds_selections),
            "dom_links_extracted": sum(p.get("links_count", 0) for p in dom_pages),
            "network_requests_recorded": len(network_calls),
            "total_records": total_records,
        },
        "dom_pages": dom_pages,
        "odds_selections_sample": odds_selections[:100],
        "network_requests": network_calls[:100],
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=target_urls[0],
        label="codere_mx_sportsbook_snapshot",
        extra_meta=payload["summary"],
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": "codere_bet365_mx",
        "category": scraper.category,
        "path": str(out_path),
        "records": total_records,
        "sha256": sha256_val,
    }


# ---------------------------------------------------------------------------
# 6. ODDSPORTAL / ODDSCHECKER (odds_casinos)
# ---------------------------------------------------------------------------
async def scrape_oddsportal_oddschecker() -> dict[str, Any]:
    """Captura partidos, momios y respuestas XHR de OddsPortal (Liga MX) y Oddschecker."""
    scraper = PitchLabScraplingBase("oddsportal_oddschecker")
    _clean_wave2_source_dir(scraper.category, scraper.source_id)

    target_urls = [
        "https://www.oddsportal.com/football/mexico/liga-mx/",
        "https://www.oddschecker.com/football",
    ]

    pages_summary: list[dict[str, Any]] = []
    extracted_matches: list[dict[str, Any]] = []
    network_xhr: list[dict[str, Any]] = []

    async with AsyncStealthySession(
        headless=True,
        solve_cloudflare=True,
        record_requests=True,
        block_ads=True,
        timeout=45000,
        max_recorded_requests=800,
    ) as session:
        for url in target_urls:
            try:
                page = await session.fetch(
                    url,
                    wait_until="domcontentloaded",
                    wait=3500,
                    google_search=False,
                )
                title = (page.css("title::text").get() or "").strip()

                # Extraer enlaces de partidos y cuotas visibles en DOM
                match_links = []
                for a in page.css("a[href]"):
                    href = a.attrib.get("href", "")
                    text = " ".join(a.css("::text, *::text").getall()).strip()
                    if any(k in href for k in ("/mexico/liga-mx/", "/football/", "-vs-", "/match/")):
                        if text and len(text) >= 3:
                            match_links.append({"text": text[:120], "href": href})

                odds_tokens = [
                    t.strip()
                    for t in page.css("p::text, span::text, td::text, button::text, a::text").getall()
                    if t and re.fullmatch(r"\d+\.\d{2}|[+-]\d{3,4}|\d+/\d+", t.strip())
                ]

                # Extraer componentes Vue/JSON embebidos en atributos `:data` de OddsPortal
                vue_comps = []
                for el in page.css("[data-v-app] *, [id='app'] *"):
                    for attr_k, attr_v in el.attrib.items():
                        if attr_k.startswith(":") and len(attr_v) > 20 and attr_v.startswith("{"):
                            parsed_attr = _safe_json_loads(attr_v)
                            if isinstance(parsed_attr, dict):
                                vue_comps.append({"attr": attr_k, "keys": list(parsed_attr.keys())[:15]})

                for ml in match_links[:60]:
                    extracted_matches.append(
                        {
                            "label": ml["text"],
                            "href": ml["href"],
                            "source_url": url,
                        }
                    )

                pages_summary.append(
                    {
                        "url": url,
                        "status": getattr(page, "status", None),
                        "title": title,
                        "match_links_count": len(match_links),
                        "odds_tokens_count": len(odds_tokens),
                        "odds_tokens_sample": odds_tokens[:50],
                        "vue_components_count": len(vue_comps),
                        "vue_components_sample": vue_comps[:15],
                    }
                )
            except Exception as exc:
                pages_summary.append({"url": url, "error": str(exc)})

        for resp in session.network.search(limit=None):
            rtype = resp.meta.get("resource_type", "")
            parsed = _safe_json_loads(resp.body) if resp.body else None
            if rtype in ("xhr", "fetch") or "ajax" in resp.url.lower() or "feed" in resp.url.lower() or parsed is not None:
                entry: dict[str, Any] = {
                    "network_id": resp.meta.get("network_id"),
                    "url": resp.url,
                    "status": resp.status,
                    "resource_type": rtype,
                    "body_bytes": len(resp.body) if resp.body else 0,
                }
                if parsed is not None:
                    entry["has_json"] = True
                    entry["json_preview"] = (
                        {"keys": list(parsed.keys())[:15]}
                        if isinstance(parsed, dict)
                        else f"list[{len(parsed)}]"
                        if isinstance(parsed, list)
                        else str(parsed)[:250]
                    )
                network_xhr.append(entry)

    total_records = (
        len(extracted_matches)
        + sum(p.get("odds_tokens_count", 0) for p in pages_summary)
        + len(network_xhr)
    )

    payload = {
        "source": "oddsportal_oddschecker",
        "target_urls": target_urls,
        "summary": {
            "pages_visited": len(pages_summary),
            "matches_extracted": len(extracted_matches),
            "odds_tokens_extracted": sum(p.get("odds_tokens_count", 0) for p in pages_summary),
            "network_xhr_captured": len(network_xhr),
            "total_records": total_records,
        },
        "pages": pages_summary,
        "matches": extracted_matches[:120],
        "network_xhr": network_xhr[:100],
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=target_urls[0],
        label="oddsportal_oddschecker_liga_mx",
        extra_meta=payload["summary"],
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": "oddsportal_oddschecker",
        "category": scraper.category,
        "path": str(out_path),
        "records": total_records,
        "sha256": sha256_val,
    }


# ---------------------------------------------------------------------------
# 7. BETFAIR / SMARKETS EXCHANGE (odds_casinos)
# ---------------------------------------------------------------------------
async def scrape_betfair_smarkets_exchange() -> dict[str, Any]:
    """Extrae eventos de exchange y liquidez de Smarkets (`api.smarkets.com/v3/events/` + web)."""
    scraper = PitchLabScraplingBase("betfair_smarkets_exchange")
    _clean_wave2_source_dir(scraper.category, scraper.source_id)

    api_url = "https://api.smarkets.com/v3/events/?state=upcoming&type=football_match&limit=50"
    web_url = "https://smarkets.com/sport/football"

    fetcher_probes: list[dict[str, Any]] = []
    exchange_events: list[dict[str, Any]] = []
    dom_links: list[dict[str, Any]] = []
    network_calls: list[dict[str, Any]] = []

    # Paso 1: FetcherSession(impersonate="chrome", stealthy_headers=True) según especificación
    with FetcherSession(
        impersonate="chrome",
        stealthy_headers=True,
    ) as session:
        for target in (api_url, web_url):
            try:
                resp = session.get(target, timeout=20)
                text = _response_text(resp)
                parsed = _safe_json_loads(text)
                fetcher_probes.append(
                    {
                        "url": target,
                        "status": resp.status,
                        "title": (resp.css("title::text").get() or "").strip(),
                        "body_bytes": len(text),
                        "has_json": isinstance(parsed, dict),
                    }
                )
                if isinstance(parsed, dict) and isinstance(parsed.get("events"), list):
                    for ev in parsed["events"]:
                        if isinstance(ev, dict):
                            exchange_events.append(_normalize_smarkets_event(ev))
            except Exception as exc:
                fetcher_probes.append({"url": target, "error": str(exc)})

    # Paso 2: Si el WAF devolvió Security Check en FetcherSession, usar AsyncStealthySession(solve_cloudflare=True)
    if not exchange_events:
        async with AsyncStealthySession(
            headless=True,
            solve_cloudflare=True,
            record_requests=True,
            block_ads=True,
            timeout=45000,
            max_recorded_requests=600,
        ) as stealth:
            for target in (api_url, web_url):
                try:
                    page = await stealth.fetch(
                        target,
                        wait_until="domcontentloaded",
                        wait=3000,
                        google_search=False,
                    )
                    raw_text = page.css("pre::text, body::text").get() or _response_text(page)
                    parsed = _safe_json_loads(raw_text)
                    if isinstance(parsed, dict) and isinstance(parsed.get("events"), list):
                        for ev in parsed["events"]:
                            if isinstance(ev, dict):
                                exchange_events.append(_normalize_smarkets_event(ev))
                    for a in page.css("a[href]"):
                        href = a.attrib.get("href", "")
                        txt = " ".join(a.css("::text, *::text").getall()).strip()
                        if href and any(k in href for k in ("/event/", "/sport/", "/football", "/listing/")):
                            dom_links.append({"text": txt[:100], "href": href})
                except Exception as exc:
                    network_calls.append({"url": target, "error": str(exc)})

            for resp in stealth.network.search(limit=None):
                rtype = resp.meta.get("resource_type", "")
                parsed = _safe_json_loads(resp.body) if resp.body else None
                if parsed is not None or rtype in ("xhr", "fetch") or "smarkets" in resp.url:
                    if isinstance(parsed, dict) and isinstance(parsed.get("events"), list) and not exchange_events:
                        for ev in parsed["events"]:
                            if isinstance(ev, dict):
                                exchange_events.append(_normalize_smarkets_event(ev))
                    network_calls.append(
                        {
                            "network_id": resp.meta.get("network_id"),
                            "url": resp.url,
                            "status": resp.status,
                            "resource_type": rtype,
                            "body_bytes": len(resp.body) if resp.body else 0,
                        }
                    )

    total_records = (
        len(exchange_events)
        + len(dom_links)
        + len(network_calls)
        + len(fetcher_probes)
    )

    payload = {
        "source": "betfair_smarkets_exchange",
        "target_urls": [api_url, web_url],
        "summary": {
            "fetcher_probes_count": len(fetcher_probes),
            "exchange_events_extracted": len(exchange_events),
            "dom_links_extracted": len(dom_links),
            "network_calls_captured": len(network_calls),
            "total_records": total_records,
        },
        "fetcher_probes": fetcher_probes,
        "exchange_events": exchange_events[:100],
        "dom_links": dom_links[:80],
        "network_calls": network_calls[:80],
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=api_url,
        label="smarkets_exchange_football_events",
        extra_meta=payload["summary"],
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": "betfair_smarkets_exchange",
        "category": scraper.category,
        "path": str(out_path),
        "records": total_records,
        "sha256": sha256_val,
    }


def _normalize_smarkets_event(ev: dict[str, Any]) -> dict[str, Any]:
    return {
        "event_id": ev.get("id"),
        "name": ev.get("name"),
        "short_name": ev.get("short_name"),
        "full_slug": ev.get("full_slug"),
        "start_datetime": ev.get("start_datetime"),
        "state": ev.get("state"),
        "type": ev.get("type"),
        "bettable": ev.get("bettable"),
        "parent_id": ev.get("parent_id"),
    }


def run_wave2_scrapers(only_source: str = "all") -> list[dict[str, Any]]:
    """Ejecuta las 7 fuentes de Wave 2 (`odds_casinos` y `advanced_stats_xg`)."""
    results: list[dict[str, Any]] = []

    if only_source in ("all", "fotmob"):
        print("-> [1/7] Extrayendo FotMob (Liga MX + Premier League)...")
        res = asyncio.run(scrape_fotmob())
        results.append(res)
        print(f"   OK fotmob: records={res['records']} | sha256={res['sha256'][:12]} | {res['path']}")

    if only_source in ("all", "pfr_rbsdm_sumersports"):
        print("-> [2/7] Extrayendo PFR / RBSDM / SumerSports (NFL EPA/Play)...")
        res = scrape_pfr_rbsdm_sumersports()
        results.append(res)
        print(f"   OK pfr_rbsdm_sumersports: records={res['records']} | sha256={res['sha256'][:12]} | {res['path']}")

    if only_source in ("all", "fbref"):
        print("-> [3/7] Extrayendo FBref (Liga MX + Premier League stats_table)...")
        res = scrape_fbref()
        results.append(res)
        print(f"   OK fbref: records={res['records']} | sha256={res['sha256'][:12]} | {res['path']}")

    if only_source in ("all", "sofascore"):
        print("-> [4/7] Extrayendo Sofascore (scheduled-events + Liga MX)...")
        res = asyncio.run(scrape_sofascore())
        results.append(res)
        print(f"   OK sofascore: records={res['records']} | sha256={res['sha256'][:12]} | {res['path']}")

    if only_source in ("all", "codere_bet365_mx"):
        print("-> [5/7] Extrayendo Codere.mx Sportsbook...")
        res = asyncio.run(scrape_codere_bet365_mx())
        results.append(res)
        print(f"   OK codere_bet365_mx: records={res['records']} | sha256={res['sha256'][:12]} | {res['path']}")

    if only_source in ("all", "oddsportal_oddschecker"):
        print("-> [6/7] Extrayendo OddsPortal / Oddschecker (Liga MX + Football)...")
        res = asyncio.run(scrape_oddsportal_oddschecker())
        results.append(res)
        print(f"   OK oddsportal_oddschecker: records={res['records']} | sha256={res['sha256'][:12]} | {res['path']}")

    if only_source in ("all", "betfair_smarkets_exchange"):
        print("-> [7/7] Extrayendo Betfair / Smarkets Exchange...")
        res = asyncio.run(scrape_betfair_smarkets_exchange())
        results.append(res)
        print(f"   OK betfair_smarkets_exchange: records={res['records']} | sha256={res['sha256'][:12]} | {res['path']}")

    return results


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Wave 2 Scraper: remaining Category 1 (odds_casinos) and Category 2 (advanced_stats_xg)"
    )
    parser.add_argument(
        "--source",
        default="all",
        choices=["all", *WAVE2_SOURCES],
        help="Fuente específica a ejecutar o 'all'",
    )
    args = parser.parse_args()
    print(f"[{utc_now_iso()}] Iniciando Wave 2 Scraper (source={args.source})...")
    summary = run_wave2_scrapers(args.source)
    print("\n=== RESUMEN WAVE 2 (ODDS_CASINOS + ADVANCED_STATS_XG) ===")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
