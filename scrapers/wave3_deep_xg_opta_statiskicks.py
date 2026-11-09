"""Scraper Wave 3 (Deep Extraction) para `understat`, `opta_player_stats` y `statiskicks`.

REGLA DE INGENIERÍA:
Exclusivamente utiliza Scrapling (`FetcherSession`, `StealthySession`, `AsyncStealthySession`,
`Selector`) a través de `PitchLabScraplingBase` (`scrapers/base_scraper.py`).
Cada captura queda sellada con `captured_at_utc` y `sha256` en `data/raw/advanced_stats_xg/`.

Objetivos de extracción profunda:
1. `understat`:
   - Las 5 grandes ligas europeas (`EPL`, `La_liga`, `Bundesliga`, `Serie_A`, `Ligue_1`).
   - Decodificación íntegra de `teamsData` (96 equipos con totales de temporada e historial
     partido a partido de `xG`, `xGA`, `npxG`, `npxGA`, `ppda`, `ppda_allowed`, `deep`,
     `deep_allowed`, `xpts`, `result`, `scored`, `missed`), `datesData` (1,752 partidos con
     `id`, `datetime`, `h`, `a`, `goals`, `xG` y `forecast` win/draw/loss) y `playersData`
     (top 100 jugadores por liga = 500 jugadores con `games`, `time`, `goals`, `xG`,
     `assists`, `xA`, `shots`, `key_passes`, `npg`, `npxG`, `xGChain`, `xGBuildup`,
     `position`, `team_title`).
   - Label: `understat_5leagues_teams_matches_players`.

2. `opta_player_stats`:
   - Navegación profunda en `https://optaplayerstats.statsperform.com/` con
     `AsyncStealthySession(headless=True, solve_cloudflare=True, record_requests=True)`
     hacia subpáginas de competiciones, calendario, estadísticas Opta y definiciones de eventos.
   - Extracción del token activo (`sdapi_key` / `outletAuthKey` y `_rt=c`) desde el tráfico
     de red y configuración del portal, y captura directa de los feeds JSON de
     `api.performfeeds.com/soccerdata/...` (`tournamentcalendar`, `standings`, `match`,
     `squads`, `seasonstats`, `matchstats`) para Liga MX y Premier League, además de las
     tablas estadísticas renderizadas en el DOM.
   - Label: `opta_deep_feeds_and_stats`.

3. `statiskicks`:
   - Crawl profundo de 20 URLs internas y endpoints de `https://www.statiskicks.com/`
     combinando `AsyncStealthySession(headless=True, solve_cloudflare=True, record_requests=True)`
     y `FetcherSession(impersonate="chrome", stealthy_headers=True)`.
   - Extracción de tablas de clasificación con puntos esperados (`xP`), tablas de scouting y
     `SKore` (Total y p90), payloads JSON embebidos (`data-team-xg-rolling-payload` con series
     de 60 partidos de xG/xGA, `data-team-profile-payload`, `data-attribute-charts-payload`,
     `data-team-age-profile-payload`), estados `wire:snapshot` de Livewire y respuestas XHR
     de `/search`.
   - Label: `statiskicks_deep_subpages_crawl`.
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


def _response_text(resp: Any) -> str:
    """Convierte el cuerpo de un Response de Scrapling a texto UTF-8 seguro."""
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
    """Parsea JSON de forma segura devolviendo None si falla."""
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


def _clean_previous_label_snapshots(category: str, source_id: str, label: str) -> None:
    """Elimina snapshots previos con el mismo `label` para mantener idempotencia."""
    src_dir = DATA_RAW_DIR / category / source_id
    if src_dir.exists():
        for json_file in src_dir.rglob(f"*_{label}_*.json"):
            json_file.unlink(missing_ok=True)


def _decode_understat_js_var(escaped_str: str) -> Any:
    """Decodifica cadenas hexadecimales \\xNN de Understat (`JSON.parse('...')`)."""
    raw_bytes = escaped_str.encode("utf-8").decode("unicode_escape").encode("latin1")
    return json.loads(raw_bytes.decode("utf-8", errors="replace"))


def _safe_float(val: Any, default: float = 0.0) -> float:
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _safe_int(val: Any, default: int = 0) -> int:
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return default


# ===========================================================================
# 1. UNDERSTAT DEEP EXTRACTION (5 GRANDES LIGAS EUROPEAS)
# ===========================================================================
UNDERSTAT_LEAGUES: list[tuple[str, str, str]] = [
    (
        "EPL",
        "https://understat.com/league/EPL",
        "https://web.archive.org/web/20250525210919/https://understat.com/league/EPL",
    ),
    (
        "La_liga",
        "https://understat.com/league/La_liga",
        "https://web.archive.org/web/20250525210744/https://understat.com/league/La_liga",
    ),
    (
        "Bundesliga",
        "https://understat.com/league/Bundesliga",
        "https://web.archive.org/web/20250525210920/https://understat.com/league/Bundesliga",
    ),
    (
        "Serie_A",
        "https://understat.com/league/Serie_A",
        "https://web.archive.org/web/20250525210924/https://understat.com/league/Serie_A",
    ),
    (
        "Ligue_1",
        "https://understat.com/league/Ligue_1",
        "https://web.archive.org/web/20250525210826/https://understat.com/league/Ligue_1",
    ),
]


async def scrape_understat_deep() -> dict[str, Any]:
    """Extrae `teamsData`, `datesData` y `playersData` de las 5 grandes ligas en Understat."""
    scraper = PitchLabScraplingBase("understat")
    label = "understat_5leagues_teams_matches_players"
    _clean_previous_label_snapshots(scraper.category, scraper.source_id, label)

    leagues_payload: dict[str, Any] = {}
    all_teams_flat: list[dict[str, Any]] = []
    total_matches_count = 0
    total_team_history_rows = 0
    total_players_extracted = 0
    total_players_discovered = 0

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        for league_code, live_url, archive_url in UNDERSTAT_LEAGUES:
            live_resp = session.get(live_url, stealthy_headers=True, timeout=20)
            live_status = getattr(live_resp, "status", None)
            html_text = _response_text(live_resp)
            used_archive_mirror = False

            if "teamsData" not in html_text:
                arch_resp = session.get(archive_url, stealthy_headers=True, timeout=30)
                html_text = _response_text(arch_resp)
                used_archive_mirror = True

            teams_match = re.search(
                r"var\s+teamsData\s*=\s*JSON\.parse\('([^']+)'\)", html_text
            )
            dates_match = re.search(
                r"var\s+datesData\s*=\s*JSON\.parse\('([^']+)'\)", html_text
            )
            players_match = re.search(
                r"var\s+playersData\s*=\s*JSON\.parse\('([^']+)'\)", html_text
            )

            raw_teams = (
                _decode_understat_js_var(teams_match.group(1))
                if teams_match
                else {}
            )
            raw_dates = (
                _decode_understat_js_var(dates_match.group(1))
                if dates_match
                else []
            )
            raw_players = (
                _decode_understat_js_var(players_match.group(1))
                if players_match
                else []
            )

            # 1A. Procesar equipos + serie histórica completa partido a partido
            league_teams: list[dict[str, Any]] = []
            if isinstance(raw_teams, dict):
                for team_id, team_obj in raw_teams.items():
                    if not isinstance(team_obj, dict):
                        continue
                    history_raw = team_obj.get("history") or []
                    normalized_history: list[dict[str, Any]] = []
                    ppda_vals: list[float] = []
                    ppda_allowed_vals: list[float] = []

                    for h in history_raw:
                        if not isinstance(h, dict):
                            continue
                        ppda_obj = h.get("ppda") if isinstance(h.get("ppda"), dict) else {}
                        ppda_all_obj = (
                            h.get("ppda_allowed")
                            if isinstance(h.get("ppda_allowed"), dict)
                            else {}
                        )
                        ppda_ratio = None
                        if _safe_float(ppda_obj.get("def")) > 0:
                            ppda_ratio = round(
                                _safe_float(ppda_obj.get("att"))
                                / _safe_float(ppda_obj.get("def")),
                                3,
                            )
                            ppda_vals.append(ppda_ratio)

                        ppda_allowed_ratio = None
                        if _safe_float(ppda_all_obj.get("def")) > 0:
                            ppda_allowed_ratio = round(
                                _safe_float(ppda_all_obj.get("att"))
                                / _safe_float(ppda_all_obj.get("def")),
                                3,
                            )
                            ppda_allowed_vals.append(ppda_allowed_ratio)

                        normalized_history.append(
                            {
                                "date": h.get("date"),
                                "h_a": h.get("h_a"),
                                "result": h.get("result"),
                                "scored": _safe_int(h.get("scored")),
                                "missed": _safe_int(h.get("missed")),
                                "pts": _safe_int(h.get("pts")),
                                "xG": round(_safe_float(h.get("xG")), 4),
                                "xGA": round(_safe_float(h.get("xGA")), 4),
                                "npxG": round(_safe_float(h.get("npxG")), 4),
                                "npxGA": round(_safe_float(h.get("npxGA")), 4),
                                "npxGD": round(_safe_float(h.get("npxGD")), 4),
                                "xpts": round(_safe_float(h.get("xpts")), 4),
                                "deep": _safe_int(h.get("deep")),
                                "deep_allowed": _safe_int(h.get("deep_allowed")),
                                "wins": _safe_int(h.get("wins")),
                                "draws": _safe_int(h.get("draws")),
                                "loses": _safe_int(h.get("loses")),
                                "ppda": ppda_obj,
                                "ppda_ratio": ppda_ratio,
                                "ppda_allowed": ppda_all_obj,
                                "ppda_allowed_ratio": ppda_allowed_ratio,
                            }
                        )

                    xg_sum = round(sum(m["xG"] for m in normalized_history), 3)
                    xga_sum = round(sum(m["xGA"] for m in normalized_history), 3)
                    npxg_sum = round(sum(m["npxG"] for m in normalized_history), 3)
                    npxga_sum = round(sum(m["npxGA"] for m in normalized_history), 3)
                    xpts_sum = round(sum(m["xpts"] for m in normalized_history), 3)
                    pts_sum = sum(m["pts"] for m in normalized_history)
                    scored_sum = sum(m["scored"] for m in normalized_history)
                    missed_sum = sum(m["missed"] for m in normalized_history)
                    wins_sum = sum(m["wins"] for m in normalized_history)
                    draws_sum = sum(m["draws"] for m in normalized_history)
                    loses_sum = sum(m["loses"] for m in normalized_history)
                    deep_sum = sum(m["deep"] for m in normalized_history)
                    deep_all_sum = sum(m["deep_allowed"] for m in normalized_history)

                    team_entry = {
                        "league": league_code,
                        "team_id": str(team_obj.get("id") or team_id),
                        "team_title": team_obj.get("title"),
                        "matches_played": len(normalized_history),
                        "wins": wins_sum,
                        "draws": draws_sum,
                        "loses": loses_sum,
                        "scored": scored_sum,
                        "missed": missed_sum,
                        "pts": pts_sum,
                        "xPTS": xpts_sum,
                        "xPTS_diff": round(xpts_sum - pts_sum, 3),
                        "xG": xg_sum,
                        "xGA": xga_sum,
                        "npxG": npxg_sum,
                        "npxGA": npxga_sum,
                        "npxGD": round(npxg_sum - npxga_sum, 3),
                        "deep_completions": deep_sum,
                        "deep_allowed": deep_all_sum,
                        "ppda_avg": round(sum(ppda_vals) / len(ppda_vals), 3)
                        if ppda_vals
                        else None,
                        "ppda_allowed_avg": round(
                            sum(ppda_allowed_vals) / len(ppda_allowed_vals), 3
                        )
                        if ppda_allowed_vals
                        else None,
                        "history": normalized_history,
                    }
                    league_teams.append(team_entry)
                    all_teams_flat.append(
                        {k: v for k, v in team_entry.items() if k != "history"}
                    )
                    total_team_history_rows += len(normalized_history)

            league_teams.sort(key=lambda t: t["xPTS"], reverse=True)

            # 1B. Procesar `datesData` (todos los partidos con xG y forecast win/draw/loss)
            league_matches: list[dict[str, Any]] = []
            if isinstance(raw_dates, list):
                for m in raw_dates:
                    if not isinstance(m, dict):
                        continue
                    h_obj = m.get("h") if isinstance(m.get("h"), dict) else {}
                    a_obj = m.get("a") if isinstance(m.get("a"), dict) else {}
                    goals_obj = m.get("goals") if isinstance(m.get("goals"), dict) else {}
                    xg_obj = m.get("xG") if isinstance(m.get("xG"), dict) else {}
                    fc_obj = (
                        m.get("forecast") if isinstance(m.get("forecast"), dict) else {}
                    )
                    league_matches.append(
                        {
                            "match_id": str(m.get("id")),
                            "league": league_code,
                            "datetime": m.get("datetime"),
                            "is_result": bool(m.get("isResult")),
                            "home_team_id": str(h_obj.get("id") or ""),
                            "home_team": h_obj.get("title"),
                            "home_short_title": h_obj.get("short_title"),
                            "away_team_id": str(a_obj.get("id") or ""),
                            "away_team": a_obj.get("title"),
                            "away_short_title": a_obj.get("short_title"),
                            "home_goals": _safe_int(goals_obj.get("h"))
                            if goals_obj.get("h") is not None
                            else None,
                            "away_goals": _safe_int(goals_obj.get("a"))
                            if goals_obj.get("a") is not None
                            else None,
                            "home_xG": round(_safe_float(xg_obj.get("h")), 4)
                            if xg_obj.get("h") is not None
                            else None,
                            "away_xG": round(_safe_float(xg_obj.get("a")), 4)
                            if xg_obj.get("a") is not None
                            else None,
                            "forecast_win": round(_safe_float(fc_obj.get("w")), 4)
                            if fc_obj.get("w") is not None
                            else None,
                            "forecast_draw": round(_safe_float(fc_obj.get("d")), 4)
                            if fc_obj.get("d") is not None
                            else None,
                            "forecast_loss": round(_safe_float(fc_obj.get("l")), 4)
                            if fc_obj.get("l") is not None
                            else None,
                        }
                    )
            total_matches_count += len(league_matches)

            # 1C. Procesar `playersData` (top 100 jugadores por liga ordenados por xG + xA)
            league_players_all: list[dict[str, Any]] = []
            if isinstance(raw_players, list):
                total_players_discovered += len(raw_players)
                for p in raw_players:
                    if not isinstance(p, dict):
                        continue
                    xg_val = round(_safe_float(p.get("xG")), 4)
                    xa_val = round(_safe_float(p.get("xA")), 4)
                    npxg_val = round(_safe_float(p.get("npxG")), 4)
                    xg_chain = round(_safe_float(p.get("xGChain")), 4)
                    xg_buildup = round(_safe_float(p.get("xGBuildup")), 4)
                    league_players_all.append(
                        {
                            "player_id": str(p.get("id")),
                            "player_name": p.get("player_name"),
                            "league": league_code,
                            "team_title": p.get("team_title"),
                            "position": p.get("position"),
                            "games": _safe_int(p.get("games")),
                            "time_minutes": _safe_int(p.get("time")),
                            "goals": _safe_int(p.get("goals")),
                            "npg": _safe_int(p.get("npg")),
                            "assists": _safe_int(p.get("assists")),
                            "shots": _safe_int(p.get("shots")),
                            "key_passes": _safe_int(p.get("key_passes")),
                            "yellow_cards": _safe_int(p.get("yellow_cards")),
                            "red_cards": _safe_int(p.get("red_cards")),
                            "xG": xg_val,
                            "npxG": npxg_val,
                            "xA": xa_val,
                            "xG_plus_xA": round(xg_val + xa_val, 4),
                            "xGChain": xg_chain,
                            "xGBuildup": xg_buildup,
                        }
                    )

            league_players_all.sort(
                key=lambda p: (p["xG_plus_xA"], p["xG"], p["time_minutes"]),
                reverse=True,
            )
            top_100_players = league_players_all[:100]
            total_players_extracted += len(top_100_players)

            leagues_payload[league_code] = {
                "league": league_code,
                "live_url": live_url,
                "live_http_status": live_status,
                "used_archive_mirror": used_archive_mirror,
                "archive_url": archive_url if used_archive_mirror else None,
                "teams_count": len(league_teams),
                "matches_count": len(league_matches),
                "total_league_players_discovered": len(league_players_all),
                "top_players_extracted_count": len(top_100_players),
                "teams": league_teams,
                "dates_matches": league_matches,
                "top_100_players": top_100_players,
            }

    total_records = (
        len(all_teams_flat)
        + total_team_history_rows
        + total_matches_count
        + total_players_extracted
    )

    payload = {
        "source": "understat",
        "target_leagues": [lg for lg, _, _ in UNDERSTAT_LEAGUES],
        "summary": {
            "leagues_count": len(leagues_payload),
            "teams_count": len(all_teams_flat),
            "team_match_history_records": total_team_history_rows,
            "season_fixtures_datesData_records": total_matches_count,
            "total_players_in_leagues": total_players_discovered,
            "top_players_extracted": total_players_extracted,
            "total_records": total_records,
        },
        "all_teams_season_table": all_teams_flat,
        "leagues": leagues_payload,
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url="https://understat.com/league/EPL",
        label=label,
        extra_meta=payload["summary"],
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": "understat",
        "label": label,
        "path": str(out_path),
        "records": total_records,
        "summary": payload["summary"],
        "sha256": sha256_val,
    }


# ===========================================================================
# 2. OPTA PLAYER STATS DEEP NAVIGATION & PERFORMFEEDS CAPTURE
# ===========================================================================
OPTA_NAVIGATION_URLS: list[str] = [
    "https://optaplayerstats.statsperform.com/",
    "https://optaplayerstats.statsperform.com/en_GB/soccer/premier-league-2026-2027/6pdwluctev9iebv00r4qqukno/opta-player-stats",
    "https://optaplayerstats.statsperform.com/en_GB/soccer/premier-league-2026-2027/6pdwluctev9iebv00r4qqukno/fixtures",
    "https://optaplayerstats.statsperform.com/en_GB/soccer/championship-2026-2027/al48ooi8acoibema226051250/fixtures",
    "https://optaplayerstats.statsperform.com/en_GB/soccer/competitions",
    "https://optaplayerstats.statsperform.com/en_GB/soccer/opta-points",
    "https://optaplayerstats.statsperform.com/en_GB/opta-event-definitions",
]

# Competiciones clave en PerformFeeds (Liga MX y las 5 grandes ligas europeas)
OPTA_TARGET_COMPETITIONS: list[tuple[str, str, str]] = [
    ("Liga MX", "2hsidwomhjsaaytdy9u5niyi4", "9zum4nxferygj8bb0ldcavxn8"),
    ("Premier League", "2kwbbcootiqqgmrzs6o5inle5", "6pdwluctev9iebv00r4qqukno"),
]

# Clubes clave para extracción profunda de `seasonstats` (estadísticas detalladas de jugadores y equipo)
OPTA_SEASONSTATS_CLUBS: list[tuple[str, str, str, str]] = [
    ("Liga MX", "9zum4nxferygj8bb0ldcavxn8", "Cruz Azul", "1aw67co8uut64yckd3wbhy9t2"),
    ("Liga MX", "9zum4nxferygj8bb0ldcavxn8", "Club América", "eu8c408f59yx7egaqossbv25e"),
    ("Liga MX", "9zum4nxferygj8bb0ldcavxn8", "Guadalajara", "e603sojy77s4u0ypqds2v2a1g"),
    ("Liga MX", "9zum4nxferygj8bb0ldcavxn8", "Toluca", "3390h9hdgoxzzofnrpyktanuz"),
    ("Liga MX", "9zum4nxferygj8bb0ldcavxn8", "Monterrey", "233335xtoe3e3phg3hp91xguq"),
    ("Liga MX", "9zum4nxferygj8bb0ldcavxn8", "Tigres UANL", "6hmo9mrlz73nwxkshwuu5vsfm"),
    ("Premier League", "6pdwluctev9iebv00r4qqukno", "AFC Bournemouth", "1pse9ta7a45pi2w2grjim70ge"),
    ("Premier League", "6pdwluctev9iebv00r4qqukno", "Arsenal", "4dsgumo7d4zupm2ugsvm4zm4d"),
]


async def scrape_opta_player_stats_deep() -> dict[str, Any]:
    """Navega Opta Player Stats y extrae feeds JSON completos de `api.performfeeds.com`."""
    scraper = PitchLabScraplingBase("opta_player_stats")
    label = "opta_deep_feeds_and_stats"
    _clean_previous_label_snapshots(scraper.category, scraper.source_id, label)

    dom_pages: list[dict[str, Any]] = []
    dom_tables: list[dict[str, Any]] = []
    event_definitions: list[dict[str, str]] = []
    discovered_competitions_links: list[dict[str, str]] = []
    recorded_network_feeds: list[dict[str, Any]] = []
    discovered_sdapi_key = "ft1tiv1inq7v1sk3y9tv12yh5"
    discovered_outlet_key = "14wphx3a371oc1lghwzveu1ldj"

    async with AsyncStealthySession(
        headless=True,
        solve_cloudflare=True,
        record_requests=True,
        block_ads=True,
        timeout=45000,
        max_recorded_requests=1200,
    ) as session:
        for nav_url in OPTA_NAVIGATION_URLS:
            try:
                page = await session.fetch(
                    nav_url,
                    wait_until="networkidle",
                    wait=2500,
                    google_search=False,
                )
                title = (page.css("title::text").get() or "").strip()
                headings = [
                    h.strip()
                    for h in page.css("h1::text, h2::text, h3::text, h4::text").getall()
                    if h and h.strip()
                ]

                # Extraer configuración kickstartWidgetsConfig si existe
                html_raw = _response_text(page)
                m_outlet = re.search(r'sdapi_outlet_key\s*:\s*"([^"]+)"', html_raw)
                if m_outlet:
                    discovered_outlet_key = m_outlet.group(1)

                # Extraer tablas renderizadas en el DOM (standings, fixtures, opta-player-stats)
                page_tables_count = 0
                for tbl_idx, tbl in enumerate(page.css("table")[:35]):
                    headers = [
                        " ".join(th.css("::text, *::text").getall()).strip()
                        for th in tbl.css("thead th, tr:first-child th")
                    ]
                    headers = [h for h in headers if h]
                    rows: list[list[str]] = []
                    for tr in tbl.css("tbody tr, tr")[:60]:
                        cells = [
                            " ".join(td.css("::text, *::text").getall()).strip()
                            for td in tr.css("td, th")
                        ]
                        if any(cells) and cells != headers:
                            rows.append(cells)
                    if rows:
                        page_tables_count += 1
                        dom_tables.append(
                            {
                                "source_url": nav_url,
                                "table_index": tbl_idx,
                                "headers": headers,
                                "rows_count": len(rows),
                                "rows": rows,
                            }
                        )

                # Extraer enlaces de competiciones y partidos
                page_links: list[dict[str, str]] = []
                for a in page.css("a[href]"):
                    href = a.attrib.get("href", "").strip()
                    text = " ".join(a.css("::text, *::text").getall()).strip()
                    if href and any(
                        k in href
                        for k in ("/soccer/", "/match/", "/fixtures", "/results", "/opta")
                    ):
                        link_obj = {"text": text[:120], "href": href}
                        page_links.append(link_obj)
                        if "/soccer/" in href and href not in {
                            x["href"] for x in discovered_competitions_links
                        }:
                            discovered_competitions_links.append(link_obj)

                # Extraer definiciones de eventos Opta en /opta-event-definitions
                if "opta-event-definitions" in nav_url:
                    for item in page.css("h2, h3, h4, dt, strong, p, li"):
                        txt = " ".join(item.css("::text, *::text").getall()).strip()
                        if txt and len(txt) > 10:
                            event_definitions.append(
                                {"tag": getattr(item, "tag", "p"), "text": txt[:500]}
                            )

                dom_pages.append(
                    {
                        "url": nav_url,
                        "status": getattr(page, "status", None),
                        "title": title,
                        "headings": headings[:30],
                        "tables_extracted": page_tables_count,
                        "links_count": len(page_links),
                        "links_sample": page_links[:40],
                    }
                )
            except Exception as exc:
                dom_pages.append({"url": nav_url, "error": str(exc)})

        # Recorrer el tráfico de red capturado por AsyncStealthySession
        for net_resp in session.network.search(limit=None):
            url_str = net_resp.url
            m_key = re.search(r"soccerdata/[a-z]+/([a-z0-9]{20,30})/", url_str)
            if m_key:
                discovered_sdapi_key = m_key.group(1)

            rtype = net_resp.meta.get("resource_type", "")
            if any(
                k in url_str
                for k in (
                    "performfeeds.com",
                    "/api/",
                    "subscriptions/",
                    "translations_v2",
                    "opta-widgets",
                )
            ) or rtype in {"xhr", "fetch"}:
                body_text = _response_text(net_resp)
                parsed = _safe_json_loads(body_text)
                entry: dict[str, Any] = {
                    "network_id": net_resp.meta.get("network_id"),
                    "url": url_str,
                    "status": net_resp.status,
                    "resource_type": rtype,
                    "body_bytes": len(net_resp.body) if net_resp.body else 0,
                }
                if isinstance(parsed, dict):
                    entry["json_keys"] = list(parsed.keys())[:20]
                    if "matches" in parsed and isinstance(parsed["matches"], list):
                        entry["livescores_matches_count"] = len(parsed["matches"])
                        entry["livescores_matches"] = parsed["matches"][:60]
                recorded_network_feeds.append(entry)

    # Ahora usamos el token `discovered_sdapi_key` activo con FetcherSession para extraer
    # los payloads completos de `api.performfeeds.com/soccerdata/...`
    opta_headers = {
        "Referer": "https://optaplayerstats.statsperform.com/",
        "Origin": "https://optaplayerstats.statsperform.com",
        "Accept": "application/json",
    }

    performfeeds_competitions: list[dict[str, Any]] = []
    performfeeds_standings: dict[str, list[dict[str, Any]]] = {}
    performfeeds_matches: dict[str, list[dict[str, Any]]] = {}
    performfeeds_squads: dict[str, list[dict[str, Any]]] = {}
    performfeeds_seasonstats: list[dict[str, Any]] = []
    performfeeds_matchstats: list[dict[str, Any]] = []
    livescores_api_matches: list[dict[str, Any]] = []

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as fs:
        # 2A. Livescores endpoint interno del portal
        try:
            ls_resp = fs.get(
                "https://optaplayerstats.statsperform.com/api/en_GB/soccer/livescores?offset=360",
                headers=opta_headers,
                timeout=20,
            )
            ls_json = _safe_json_loads(_response_text(ls_resp))
            if isinstance(ls_json, dict) and isinstance(ls_json.get("matches"), list):
                livescores_api_matches = ls_json["matches"]
        except Exception:
            pass

        # 2B. Tournament Calendar (catálogo global Opta de competiciones y temporadas activas)
        tc_url = (
            f"https://api.performfeeds.com/soccerdata/tournamentcalendar/"
            f"{discovered_sdapi_key}/?_rt=c&_lcl=en&_fmt=json"
        )
        tc_resp = fs.get(tc_url, headers=opta_headers, timeout=25)
        tc_json = _safe_json_loads(_response_text(tc_resp))
        if isinstance(tc_json, dict) and isinstance(tc_json.get("competition"), list):
            for comp in tc_json["competition"]:
                if not isinstance(comp, dict):
                    continue
                t_cals = comp.get("tournamentCalendar") or []
                active_cal = next(
                    (
                        c
                        for c in t_cals
                        if isinstance(c, dict) and c.get("active") == "yes"
                    ),
                    t_cals[0] if t_cals else {},
                )
                performfeeds_competitions.append(
                    {
                        "competition_id": comp.get("id"),
                        "oc_id": comp.get("ocId"),
                        "op_id": comp.get("opId"),
                        "name": comp.get("name"),
                        "known_name": comp.get("knownName"),
                        "code": comp.get("competitionCode"),
                        "country": comp.get("country"),
                        "country_code": comp.get("countryCode"),
                        "format": comp.get("competitionFormat"),
                        "type": comp.get("type"),
                        "active_tmcl_id": active_cal.get("id")
                        if isinstance(active_cal, dict)
                        else None,
                        "active_season": active_cal.get("name")
                        if isinstance(active_cal, dict)
                        else None,
                        "start_date": active_cal.get("startDate")
                        if isinstance(active_cal, dict)
                        else None,
                        "end_date": active_cal.get("endDate")
                        if isinstance(active_cal, dict)
                        else None,
                    }
                )

        # 2C. Standings, Matches y Squads para Liga MX y Premier League
        played_match_ids_for_stats: list[tuple[str, str]] = []

        for comp_name, comp_id, tmcl_id in OPTA_TARGET_COMPETITIONS:
            # Standings
            st_url = (
                f"https://api.performfeeds.com/soccerdata/standings/"
                f"{discovered_sdapi_key}/?_rt=c&tmcl={tmcl_id}&live=yes&_lcl=en&_fmt=json"
            )
            st_resp = fs.get(st_url, headers=opta_headers, timeout=20)
            st_json = _safe_json_loads(_response_text(st_resp))
            st_rows: list[dict[str, Any]] = []
            if isinstance(st_json, dict):
                for stage in st_json.get("stage") or []:
                    if not isinstance(stage, dict):
                        continue
                    for div in stage.get("division") or []:
                        if not isinstance(div, dict):
                            continue
                        div_type = div.get("type", "total")
                        for r in div.get("ranking") or []:
                            if not isinstance(r, dict):
                                continue
                            st_rows.append(
                                {
                                    "division_type": div_type,
                                    "rank": r.get("rank"),
                                    "rank_status": r.get("rankStatus"),
                                    "contestant_id": r.get("contestantId"),
                                    "contestant_name": r.get("contestantName"),
                                    "contestant_short_name": r.get("contestantShortName"),
                                    "contestant_code": r.get("contestantCode"),
                                    "points": r.get("points"),
                                    "matches_played": r.get("matchesPlayed"),
                                    "matches_won": r.get("matchesWon"),
                                    "matches_drawn": r.get("matchesDrawn"),
                                    "matches_lost": r.get("matchesLost"),
                                    "goals_for": r.get("goalsFor"),
                                    "goals_against": r.get("goalsAgainst"),
                                    "goaldifference": r.get("goaldifference"),
                                    "last_six": r.get("lastSix"),
                                }
                            )
            performfeeds_standings[comp_name] = st_rows

            # Matches
            m_url = (
                f"https://api.performfeeds.com/soccerdata/match/"
                f"{discovered_sdapi_key}/?_rt=c&tmcl={tmcl_id}&live=yes&_pgSz=100&_ordSrt=asc&_lcl=en&_fmt=json"
            )
            m_resp = fs.get(m_url, headers=opta_headers, timeout=25)
            m_json = _safe_json_loads(_response_text(m_resp))
            comp_matches: list[dict[str, Any]] = []
            if isinstance(m_json, dict) and isinstance(m_json.get("match"), list):
                for m_item in m_json["match"]:
                    if not isinstance(m_item, dict):
                        continue
                    m_info = m_item.get("matchInfo") or {}
                    live_data = m_item.get("liveData") or {}
                    m_details = live_data.get("matchDetails") or {}
                    scores = (m_details.get("scores") or {}).get("total") or {}
                    contestants = m_info.get("contestant") or []
                    home_c = next(
                        (
                            c
                            for c in contestants
                            if isinstance(c, dict) and c.get("position") == "home"
                        ),
                        {},
                    )
                    away_c = next(
                        (
                            c
                            for c in contestants
                            if isinstance(c, dict) and c.get("position") == "away"
                        ),
                        {},
                    )
                    m_status = m_details.get("matchStatus")
                    mid = m_info.get("id")
                    if (
                        m_status == "Played"
                        and mid
                        and len(played_match_ids_for_stats) < 8
                    ):
                        played_match_ids_for_stats.append((comp_name, mid))

                    comp_matches.append(
                        {
                            "match_id": mid,
                            "date": m_info.get("date"),
                            "time": m_info.get("time"),
                            "week": m_info.get("week"),
                            "description": m_info.get("description"),
                            "venue": (m_info.get("venue") or {}).get("longName"),
                            "home_team_id": home_c.get("id"),
                            "home_team": home_c.get("name"),
                            "away_team_id": away_c.get("id"),
                            "away_team": away_c.get("name"),
                            "match_status": m_status,
                            "winner": m_details.get("winner"),
                            "home_score": scores.get("home"),
                            "away_score": scores.get("away"),
                            "goals_events_count": len(live_data.get("goal") or []),
                            "cards_events_count": len(live_data.get("card") or []),
                        }
                    )
            performfeeds_matches[comp_name] = comp_matches

            # Squads (plantillas completas con todos los jugadores y metadatos Opta)
            sq_url = (
                f"https://api.performfeeds.com/soccerdata/squads/"
                f"{discovered_sdapi_key}/?_rt=c&tmcl={tmcl_id}&_pgSz=50&_lcl=en&_fmt=json"
            )
            sq_resp = fs.get(sq_url, headers=opta_headers, timeout=25)
            sq_json = _safe_json_loads(_response_text(sq_resp))
            comp_squads: list[dict[str, Any]] = []
            if isinstance(sq_json, dict) and isinstance(sq_json.get("squad"), list):
                for sq in sq_json["squad"]:
                    if not isinstance(sq, dict):
                        continue
                    persons = sq.get("person") or []
                    players_list = [
                        {
                            "person_id": p.get("id"),
                            "first_name": p.get("firstName"),
                            "last_name": p.get("lastName"),
                            "match_name": p.get("matchName"),
                            "type": p.get("type"),
                            "position": p.get("position"),
                            "shirt_number": p.get("shirtNumber"),
                            "nationality": p.get("nationality"),
                            "nationality_id": p.get("nationalityId"),
                            "date_of_birth": p.get("dateOfBirth"),
                            "height": p.get("height"),
                            "weight": p.get("weight"),
                            "foot": p.get("foot"),
                        }
                        for p in persons
                        if isinstance(p, dict)
                    ]
                    comp_squads.append(
                        {
                            "contestant_id": sq.get("contestantId"),
                            "contestant_name": sq.get("contestantName"),
                            "contestant_short_name": sq.get("contestantShortName"),
                            "contestant_code": sq.get("contestantCode"),
                            "venue_name": sq.get("venueName"),
                            "persons_count": len(players_list),
                            "persons": players_list,
                        }
                    )
            performfeeds_squads[comp_name] = comp_squads

        # 2D. Seasonstats detallados por equipo y jugador (`detailed=yes`)
        for comp_name, tmcl_id, club_name, ctst_id in OPTA_SEASONSTATS_CLUBS:
            ss_url = (
                f"https://api.performfeeds.com/soccerdata/seasonstats/"
                f"{discovered_sdapi_key}/?_rt=c&tmcl={tmcl_id}&ctst={ctst_id}&detailed=yes&_lcl=en&_fmt=json"
            )
            ss_resp = fs.get(ss_url, headers=opta_headers, timeout=20)
            ss_json = _safe_json_loads(_response_text(ss_resp))
            if not isinstance(ss_json, dict):
                continue

            team_stats_raw = (ss_json.get("contestant") or {}).get("stat") or []
            team_stats = {
                s.get("name"): s.get("value")
                for s in team_stats_raw
                if isinstance(s, dict) and s.get("name")
            }

            players_season_stats: list[dict[str, Any]] = []
            for pl in ss_json.get("player") or []:
                if not isinstance(pl, dict):
                    continue
                p_stats = {
                    s.get("name"): s.get("value")
                    for s in (pl.get("stat") or [])
                    if isinstance(s, dict) and s.get("name")
                }
                players_season_stats.append(
                    {
                        "player_id": pl.get("id"),
                        "match_name": pl.get("matchName"),
                        "first_name": pl.get("firstName"),
                        "last_name": pl.get("lastName"),
                        "position": pl.get("position"),
                        "shirt_number": pl.get("shirtNumber"),
                        "stats_count": len(p_stats),
                        "stats": p_stats,
                    }
                )

            performfeeds_seasonstats.append(
                {
                    "competition": comp_name,
                    "tmcl_id": tmcl_id,
                    "contestant_id": ctst_id,
                    "club_name": club_name,
                    "team_stats_count": len(team_stats),
                    "team_stats": team_stats,
                    "players_count": len(players_season_stats),
                    "players": players_season_stats,
                }
            )

        # 2E. Matchstats detallados (`detailed=yes`) para partidos jugados
        for comp_name, fx_id in played_match_ids_for_stats[:6]:
            ms_url = (
                f"https://api.performfeeds.com/soccerdata/matchstats/"
                f"{discovered_sdapi_key}/?_rt=c&fx={fx_id}&detailed=yes&_lcl=en&_fmt=json"
            )
            ms_resp = fs.get(ms_url, headers=opta_headers, timeout=20)
            ms_json = _safe_json_loads(_response_text(ms_resp))
            if not isinstance(ms_json, dict):
                continue

            m_info = ms_json.get("matchInfo") or {}
            live_data = ms_json.get("liveData") or {}
            lineups = live_data.get("lineUp") or []
            teams_boxscore: list[dict[str, Any]] = []
            for lu in lineups:
                if not isinstance(lu, dict):
                    continue
                t_stats = {
                    s.get("type"): s.get("value")
                    for s in (lu.get("stat") or [])
                    if isinstance(s, dict) and s.get("type")
                }
                p_rows: list[dict[str, Any]] = []
                for p in lu.get("player") or []:
                    if not isinstance(p, dict):
                        continue
                    p_st = {
                        s.get("type"): s.get("value")
                        for s in (p.get("stat") or [])
                        if isinstance(s, dict) and s.get("type")
                    }
                    p_rows.append(
                        {
                            "player_id": p.get("playerId"),
                            "match_name": p.get("matchName"),
                            "shirt_number": p.get("shirtNumber"),
                            "position": p.get("position"),
                            "position_side": p.get("positionSide"),
                            "formation_place": p.get("formationPlace"),
                            "stats_count": len(p_st),
                            "stats": p_st,
                        }
                    )
                teams_boxscore.append(
                    {
                        "contestant_id": lu.get("contestantId"),
                        "formation_used": lu.get("formationUsed"),
                        "team_stats_count": len(t_stats),
                        "team_stats": t_stats,
                        "players_count": len(p_rows),
                        "players": p_rows,
                    }
                )

            performfeeds_matchstats.append(
                {
                    "competition": comp_name,
                    "match_id": fx_id,
                    "description": m_info.get("description"),
                    "date": m_info.get("date"),
                    "teams_boxscore": teams_boxscore,
                }
            )

    total_standings_rows = sum(len(v) for v in performfeeds_standings.values())
    total_matches_rows = sum(len(v) for v in performfeeds_matches.values())
    total_squad_persons = sum(
        sum(sq.get("persons_count", 0) for sq in v)
        for v in performfeeds_squads.values()
    )
    total_seasonstats_players = sum(
        c.get("players_count", 0) for c in performfeeds_seasonstats
    )
    total_matchstats_players = sum(
        sum(tb.get("players_count", 0) for tb in ms.get("teams_boxscore", []))
        for ms in performfeeds_matchstats
    )
    total_dom_table_rows = sum(t.get("rows_count", 0) for t in dom_tables)

    total_records = (
        len(performfeeds_competitions)
        + total_standings_rows
        + total_matches_rows
        + total_squad_persons
        + total_seasonstats_players
        + total_matchstats_players
        + len(livescores_api_matches)
        + total_dom_table_rows
    )

    payload = {
        "source": "opta_player_stats",
        "navigated_urls": OPTA_NAVIGATION_URLS,
        "auth_metadata": {
            "sdapi_widget_key": discovered_sdapi_key,
            "kickstart_outlet_key": discovered_outlet_key,
            "rt_mode": "c",
        },
        "summary": {
            "dom_pages_visited": len(dom_pages),
            "dom_tables_extracted": len(dom_tables),
            "dom_table_rows_extracted": total_dom_table_rows,
            "performfeeds_competitions_count": len(performfeeds_competitions),
            "performfeeds_standings_rows": total_standings_rows,
            "performfeeds_matches_extracted": total_matches_rows,
            "performfeeds_squad_persons_extracted": total_squad_persons,
            "performfeeds_seasonstats_clubs": len(performfeeds_seasonstats),
            "performfeeds_seasonstats_players": total_seasonstats_players,
            "performfeeds_matchstats_matches": len(performfeeds_matchstats),
            "performfeeds_matchstats_player_rows": total_matchstats_players,
            "livescores_api_matches_count": len(livescores_api_matches),
            "opta_event_definitions_count": len(event_definitions),
            "recorded_network_requests": len(recorded_network_feeds),
            "total_records": total_records,
        },
        "dom_pages": dom_pages,
        "dom_tables": dom_tables,
        "discovered_competitions_links": discovered_competitions_links,
        "opta_event_definitions": event_definitions[:120],
        "livescores_api_matches": livescores_api_matches,
        "performfeeds_tournament_calendars": performfeeds_competitions,
        "performfeeds_standings": performfeeds_standings,
        "performfeeds_matches": performfeeds_matches,
        "performfeeds_squads": performfeeds_squads,
        "performfeeds_seasonstats": performfeeds_seasonstats,
        "performfeeds_matchstats": performfeeds_matchstats,
        "recorded_network_feeds": recorded_network_feeds[:100],
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url="https://optaplayerstats.statsperform.com/",
        label=label,
        extra_meta=payload["summary"],
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": "opta_player_stats",
        "label": label,
        "path": str(out_path),
        "records": total_records,
        "summary": payload["summary"],
        "sha256": sha256_val,
    }


# ===========================================================================
# 3. STATISKICKS DEEP SUBPAGES & EMBEDDED ANALYTICS CRAWL
# ===========================================================================
STATISKICKS_SUBPAGES: list[tuple[str, str]] = [
    ("home", "https://www.statiskicks.com/"),
    ("leagues_catalog", "https://www.statiskicks.com/leagues"),
    ("players_scouting", "https://www.statiskicks.com/players"),
    (
        "players_ligamx_2026_2027",
        "https://www.statiskicks.com/players?liga=2hsidwomhjsaaytdy9u5niyi4&temporada=2026%2F2027&buscar=1",
    ),
    ("matches_today", "https://www.statiskicks.com/partidos"),
    ("matches_finished", "https://www.statiskicks.com/partidos?estado=finalizados"),
    ("matches_upcoming", "https://www.statiskicks.com/partidos?estado=por-jugar"),
    ("plans_metadata", "https://www.statiskicks.com/planes"),
    ("league_liga_mx", "https://www.statiskicks.com/league/2hsidwomhjsaaytdy9u5niyi4"),
    (
        "league_liga_mx_femenil",
        "https://www.statiskicks.com/league/7ut48s80k421xixh6ev5i6h62",
    ),
    (
        "league_premier_league",
        "https://www.statiskicks.com/league/2kwbbcootiqqgmrzs6o5inle5",
    ),
    ("league_la_liga", "https://www.statiskicks.com/league/34pl8szyvrbwcmfkuocjm3r6t"),
    (
        "league_bundesliga",
        "https://www.statiskicks.com/league/6by3h89i2eykc341oz7lv1ddd",
    ),
    ("league_serie_a", "https://www.statiskicks.com/league/1r097lpxe0xn03ihb7wi98kao"),
    ("league_ligue_1", "https://www.statiskicks.com/league/dm5ka0os1e3dxcp3vh05kmp33"),
    (
        "team_cruz_azul",
        "https://www.statiskicks.com/team/cruz-azul-1aw67co8uut64yckd3wbhy9t2",
    ),
    (
        "team_club_america",
        "https://www.statiskicks.com/team/club-america-eu8c408f59yx7egaqossbv25e",
    ),
    (
        "team_guadalajara",
        "https://www.statiskicks.com/team/guadalajara-e603sojy77s4u0ypqds2v2a1g",
    ),
    (
        "team_toluca",
        "https://www.statiskicks.com/team/toluca-3390h9hdgoxzzofnrpyktanuz",
    ),
    (
        "team_monterrey",
        "https://www.statiskicks.com/team/monterrey-233335xtoe3e3phg3hp91xguq",
    ),
    (
        "team_tigres_uanl",
        "https://www.statiskicks.com/team/tigres-uanl-6hmo9mrlz73nwxkshwuu5vsfm",
    ),
    (
        "player_luis_romo",
        "https://www.statiskicks.com/player/1cyhpfi77dom7gmpuownxlcrt/luis-romo",
    ),
    (
        "player_juan_brunetta",
        "https://www.statiskicks.com/player/auegpd36ras84mp8q6j6gs8a1/juan-brunetta",
    ),
    (
        "match_tigres_vs_cruz_azul",
        "https://www.statiskicks.com/partido/tigres-uanl-vs-cruz-azul-9d8j34de4vnr5dp0qt93duplg",
    ),
]

STATISKICKS_SEARCH_QUERIES: list[str] = [
    "Cruz Azul",
    "América",
    "Guadalajara",
    "Monterrey",
    "Toluca",
    "Tigres",
]


def _extract_statiskicks_page_data(page: Selector, slug: str, url: str) -> dict[str, Any]:
    """Extrae tablas, scripts JSON (`data-*-payload`), Livewire snapshots y textos de una subpágina."""
    title = (page.css("title::text").get() or "").strip()
    headings = [
        " ".join(h.css("::text, *::text").getall()).strip()
        for h in page.css("h1, h2, h3, h4")
    ]
    headings = [h for h in headings if h]

    # 1. Tablas estadísticas (clasificación con xP, plantillas SKore Total/p90, líderes)
    tables: list[dict[str, Any]] = []
    for tbl_idx, tbl in enumerate(page.css("table")):
        headers = [
            " ".join(th.css("::text, *::text").getall()).strip()
            for th in tbl.css("thead th, tr:first-child th")
        ]
        headers = [re.sub(r"\s+", " ", h) for h in headers if h]
        rows: list[Any] = []
        for tr in tbl.css("tbody tr, tr"):
            cells = [
                re.sub(r"\s+", " ", " ".join(td.css("::text, *::text").getall()).strip())
                for td in tr.css("td, th")
            ]
            if not any(cells) or cells == headers:
                continue
            if headers and len(headers) == len(cells):
                rows.append(dict(zip(headers, cells)))
            else:
                rows.append(cells)
        if rows:
            tables.append(
                {
                    "table_index": tbl_idx,
                    "headers": headers,
                    "rows_count": len(rows),
                    "rows": rows,
                }
            )

    # 2. Payloads JSON embebidos en `<script type="application/json" data-*-payload>`
    embedded_json_payloads: list[dict[str, Any]] = []
    for sc in page.css("script[type='application/json']"):
        raw_txt = (sc.css("::text").get() or "").strip()
        parsed_json = _safe_json_loads(raw_txt)
        payload_type = next(
            (k for k in sc.attrib.keys() if k.startswith("data-")),
            sc.attrib.get("id", "json_script"),
        )
        if parsed_json is not None:
            embedded_json_payloads.append(
                {
                    "payload_type": payload_type,
                    "data": parsed_json,
                }
            )

    # 3. Snapshots de Livewire (`wire:snapshot`)
    livewire_snapshots: list[dict[str, Any]] = []
    for el in page.css("[wire\\:snapshot]"):
        raw_snap = el.attrib.get("wire:snapshot")
        parsed_snap = _safe_json_loads(raw_snap)
        if isinstance(parsed_snap, dict):
            livewire_snapshots.append(
                {
                    "memo": parsed_snap.get("memo"),
                    "data": parsed_snap.get("data"),
                }
            )

    # 4. Enlaces internos descubiertos
    internal_links: list[dict[str, str]] = []
    seen_hrefs: set[str] = set()
    for a in page.css("a[href]"):
        href = a.attrib.get("href", "").strip()
        if not href or href in seen_hrefs:
            continue
        if "statiskicks.com" in href or href.startswith("/"):
            seen_hrefs.add(href)
            text = re.sub(
                r"\s+", " ", " ".join(a.css("::text, *::text").getall()).strip()
            )
            internal_links.append({"text": text[:100], "href": href})

    return {
        "slug": slug,
        "url": url,
        "status": getattr(page, "status", 200),
        "title": title,
        "headings": headings[:30],
        "tables_count": len(tables),
        "tables": tables,
        "embedded_json_payloads_count": len(embedded_json_payloads),
        "embedded_json_payloads": embedded_json_payloads,
        "livewire_snapshots_count": len(livewire_snapshots),
        "livewire_snapshots": livewire_snapshots,
        "internal_links_count": len(internal_links),
        "internal_links": internal_links[:80],
    }


async def scrape_statiskicks_deep() -> dict[str, Any]:
    """Realiza el crawl profundo de 24 subpáginas y endpoints XHR de Statiskicks."""
    scraper = PitchLabScraplingBase("statiskicks")
    label = "statiskicks_deep_subpages_crawl"
    _clean_previous_label_snapshots(scraper.category, scraper.source_id, label)

    subpages_extracted: list[dict[str, Any]] = []
    recorded_network_calls: list[dict[str, Any]] = []
    search_xhr_results: dict[str, Any] = {}

    # Paso 1: Capturar sesión principal y llamadas de red con AsyncStealthySession
    async with AsyncStealthySession(
        headless=True,
        solve_cloudflare=True,
        record_requests=True,
        block_ads=True,
        timeout=45000,
        max_recorded_requests=800,
    ) as stealth_session:
        for slug, url in STATISKICKS_SUBPAGES[:3]:
            try:
                page = await stealth_session.fetch(
                    url,
                    wait_until="domcontentloaded",
                    wait=2000,
                    google_search=False,
                )
                subpages_extracted.append(_extract_statiskicks_page_data(page, slug, url))
            except Exception as exc:
                subpages_extracted.append({"slug": slug, "url": url, "error": str(exc)})

        for net_resp in stealth_session.network.search(limit=None):
            rtype = net_resp.meta.get("resource_type", "")
            recorded_network_calls.append(
                {
                    "network_id": net_resp.meta.get("network_id"),
                    "url": net_resp.url,
                    "status": net_resp.status,
                    "resource_type": rtype,
                    "body_bytes": len(net_resp.body) if net_resp.body else 0,
                }
            )

    # Paso 2: Crawl de las demás subpáginas (ligas con xP, clubes Liga MX con xG rolling,
    # jugadores y partidos) + endpoints XHR `/search` usando FetcherSession
    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        for slug, url in STATISKICKS_SUBPAGES[3:]:
            try:
                resp = session.get(url, stealthy_headers=True, timeout=25)
                subpages_extracted.append(_extract_statiskicks_page_data(resp, slug, url))
            except Exception as exc:
                subpages_extracted.append({"slug": slug, "url": url, "error": str(exc)})

        for q in STATISKICKS_SEARCH_QUERIES:
            try:
                s_url = f"https://www.statiskicks.com/search?q={q}"
                s_resp = session.get(
                    s_url,
                    headers={
                        "Accept": "application/json, text/plain, */*",
                        "X-Requested-With": "XMLHttpRequest",
                        "Referer": "https://www.statiskicks.com/",
                    },
                    timeout=15,
                )
                parsed_s = _safe_json_loads(_response_text(s_resp))
                if isinstance(parsed_s, dict):
                    search_xhr_results[q] = parsed_s
            except Exception:
                pass

    # Consolidar métricas clave extraídas a través de las subpáginas
    league_xp_tables: dict[str, list[Any]] = {}
    team_xg_rolling_series: dict[str, Any] = {}
    team_profile_metrics: dict[str, Any] = {}
    total_table_rows = 0
    total_xg_rolling_points = 0
    total_embedded_payloads = 0

    for sp in subpages_extracted:
        slug = sp.get("slug", "")
        for tbl in sp.get("tables") or []:
            rows = tbl.get("rows") or []
            total_table_rows += len(rows)
            if slug.startswith("league_") and rows:
                league_xp_tables[slug] = rows

        for emb in sp.get("embedded_json_payloads") or []:
            total_embedded_payloads += 1
            ptype = emb.get("payload_type", "")
            pdata = emb.get("data")
            if ptype == "data-team-xg-rolling-payload" and isinstance(pdata, dict):
                pts = pdata.get("points") or []
                total_xg_rolling_points += len(pts)
                team_xg_rolling_series[slug] = pdata
            elif ptype == "data-team-profile-payload" and isinstance(pdata, dict):
                team_profile_metrics[slug] = pdata

    total_search_entities = sum(
        len(v.get("leagues", [])) + len(v.get("teams", [])) + len(v.get("players", []))
        for v in search_xhr_results.values()
        if isinstance(v, dict)
    )

    total_records = (
        len(subpages_extracted)
        + total_table_rows
        + total_xg_rolling_points
        + total_embedded_payloads
        + total_search_entities
        + len(recorded_network_calls)
    )

    payload = {
        "source": "statiskicks",
        "crawled_urls": [u for _, u in STATISKICKS_SUBPAGES],
        "summary": {
            "subpages_crawled": len(subpages_extracted),
            "leagues_with_xp_standings": len(league_xp_tables),
            "teams_with_xg_rolling_series": len(team_xg_rolling_series),
            "total_xg_rolling_match_points": total_xg_rolling_points,
            "total_table_rows_extracted": total_table_rows,
            "total_embedded_json_payloads": total_embedded_payloads,
            "search_xhr_entities_extracted": total_search_entities,
            "recorded_network_requests": len(recorded_network_calls),
            "total_records": total_records,
        },
        "league_xp_standings_tables": league_xp_tables,
        "ligamx_team_xg_rolling_series": team_xg_rolling_series,
        "ligamx_team_profile_percentile_metrics": team_profile_metrics,
        "search_xhr_results": search_xhr_results,
        "subpages": subpages_extracted,
        "recorded_network_calls": recorded_network_calls[:100],
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url="https://www.statiskicks.com/",
        label=label,
        extra_meta=payload["summary"],
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": "statiskicks",
        "label": label,
        "path": str(out_path),
        "records": total_records,
        "summary": payload["summary"],
        "sha256": sha256_val,
    }


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Wave 3 Deep Scraper para understat, opta_player_stats y statiskicks."
    )
    parser.add_argument(
        "--source",
        choices=["all", "understat", "opta_player_stats", "statiskicks"],
        default="all",
        help="Fuente a ejecutar (por defecto: all).",
    )
    args = parser.parse_args()

    print(
        f"[{utc_now_iso()}] Iniciando Wave 3 Deep Extraction (advanced_stats_xg) con Scrapling..."
    )
    results: list[dict[str, Any]] = []

    if args.source in ("all", "understat"):
        print("-> [1/3] Extrayendo Understat (5 ligas europeas: equipos, partidos xG y jugadores)...")
        res_u = await scrape_understat_deep()
        results.append(res_u)
        print(
            f"   OK understat: records={res_u['records']} | sha256={res_u['sha256']} | path={res_u['path']}"
        )

    if args.source in ("all", "opta_player_stats"):
        print("-> [2/3] Extrayendo Opta Player Stats (DOM + api.performfeeds.com JSON feeds)...")
        res_o = await scrape_opta_player_stats_deep()
        results.append(res_o)
        print(
            f"   OK opta_player_stats: records={res_o['records']} | sha256={res_o['sha256']} | path={res_o['path']}"
        )

    if args.source in ("all", "statiskicks"):
        print("-> [3/3] Extrayendo Statiskicks (Crawl profundo de 24 subpáginas, tablas xP/SKore y series xG)...")
        res_s = await scrape_statiskicks_deep()
        results.append(res_s)
        print(
            f"   OK statiskicks: records={res_s['records']} | sha256={res_s['sha256']} | path={res_s['path']}"
        )

    print("\n=== RESUMEN WAVE 3 (advanced_stats_xg) ===")
    for item in results:
        print(
            f"- {item['source_id']} ({item['label']}): records={item['records']} | "
            f"sha256={item['sha256']} | path={item['path']}"
        )


if __name__ == "__main__":
    asyncio.run(main())
