"""Scraper Wave 4 (Full Coverage) para `statiskicks`, `opta_player_stats` y `understat`.

REGLA DE INGENIERÍA:
Exclusivamente utiliza Scrapling (`FetcherSession`, `StealthySession`, `AsyncStealthySession`,
`Selector`) a través de `PitchLabScraplingBase` (`scrapers/base_scraper.py`).
Cada captura queda sellada con `captured_at_utc` y `sha256` en `data/raw/advanced_stats_xg/`.

Objetivos Wave 4:
1. `statiskicks` (`label="statiskicks_all18_ligamx_clubs_and_players"`):
   - Descubre los 18 clubes actuales de Liga MX desde `/league/2hsidwomhjsaaytdy9u5niyi4`
     más Mazatlán vía `/search?q=Mazatlan` (19 clubes en total: América, Cruz Azul, Toluca,
     Tigres UANL, Monterrey, Guadalajara, Pumas UNAM, León, Pachuca, Santos Laguna, Atlas,
     Querétaro, Puebla, Necaxa, Atlético San Luis, Tijuana, Juárez, Atlante y Mazatlán).
   - Visita todas las páginas de club y extrae sus payloads JSON completos:
     `data-team-xg-rolling-payload` (series partido a partido de xG/xGA),
     `data-team-profile-payload` (percentiles tácticos),
     `data-attribute-charts-payload`, `data-team-age-profile-payload`,
     `data-team-formation-profile-payload` y todas las filas de jugadores (`SKore`,
     estadísticas `Total` y `p90`), además de las tablas de clasificación con `xP`.

2. `opta_player_stats` (`label="opta_all18_ligamx_players_and_6leagues"`):
   - Obtiene el token activo (`sdapi_key` / `_rt=c`) con `AsyncStealthySession` desde
     `https://optaplayerstats.statsperform.com/`.
   - Extrae `seasonstats?detailed=yes` de `api.performfeeds.com/soccerdata/...` para
     TODOS los 18 clubes de Liga MX (~500+ jugadores con decenas de métricas Opta por jugador
     y totales de equipo).
   - Extrae `tournamentcalendar`, `standings`, `match` y `squads` para Liga MX, Premier League,
     LaLiga, Serie A, Bundesliga, Ligue 1 y UEFA Champions League (7 competiciones).

3. `understat` (`label="understat_5leagues_all_players_and_2023_2024_history"`):
   - Extrae TODOS los ~2,774 jugadores (sin límite top-100) de la temporada actual en
     `EPL`, `La_liga`, `Bundesliga`, `Serie_A` y `Ligue_1`.
   - Extrae las temporadas históricas `/league/{league}/2024` y `/league/{league}/2023`
     en las 5 ligas (10 páginas liga-temporada), decodificando `teamsData` (totales e historial
     partido a partido) y `datesData` (3,500+ partidos históricos con `xG` y probabilidades
     `forecast` win/draw/loss).
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
# 1. STATISKICKS: ALL 18 LIGA MX CLUBS (+ MAZATLÁN) + PLAYERS & HISTORICAL TABLES
# ===========================================================================
STATISKICKS_FALLBACK_CLUBS: list[tuple[str, str]] = [
    ("Cruz Azul", "https://www.statiskicks.com/team/cruz-azul-1aw67co8uut64yckd3wbhy9t2"),
    ("Club América", "https://www.statiskicks.com/team/club-america-eu8c408f59yx7egaqossbv25e"),
    ("Guadalajara", "https://www.statiskicks.com/team/guadalajara-e603sojy77s4u0ypqds2v2a1g"),
    ("Toluca", "https://www.statiskicks.com/team/toluca-3390h9hdgoxzzofnrpyktanuz"),
    ("Atlas", "https://www.statiskicks.com/team/atlas-8jjxbd5vr23vhu1v5r21rzkrn"),
    ("Santos Laguna", "https://www.statiskicks.com/team/santos-laguna-8yn3l36qkq1fxbw4ufmwyfyt9"),
    ("León", "https://www.statiskicks.com/team/leon-2ei66pjfsrr6uxqp1bywq31lo"),
    ("Pachuca", "https://www.statiskicks.com/team/pachuca-cynfvfb31rml7xrlsnejf8r6j"),
    ("Tijuana", "https://www.statiskicks.com/team/tijuana-c1wcescnsnfuyv06enhwaoqr6"),
    ("Monterrey", "https://www.statiskicks.com/team/monterrey-233335xtoe3e3phg3hp91xguq"),
    ("Pumas UNAM", "https://www.statiskicks.com/team/pumas-unam-ayabrorjqa1bj7jk1fdqu1t57"),
    ("Querétaro", "https://www.statiskicks.com/team/queretaro-ccye1b5fvtq8tzlz0gosyw10b"),
    ("Puebla", "https://www.statiskicks.com/team/puebla-4kw25nmgmacpbvo24ttr994k5"),
    ("Atlético San Luis", "https://www.statiskicks.com/team/atletico-san-luis-54ph1k82y99hhjsf7m2usns8u"),
    ("Tigres UANL", "https://www.statiskicks.com/team/tigres-uanl-6hmo9mrlz73nwxkshwuu5vsfm"),
    ("Atlante", "https://www.statiskicks.com/team/atlante-evyhlelybkbj2vry2xhct08pb"),
    ("Necaxa", "https://www.statiskicks.com/team/necaxa-b7hn6knkuxbpj1i8rmzapns7b"),
    ("Juárez", "https://www.statiskicks.com/team/juarez-ecphe4bqgmin2tzsohf50egvd"),
    ("Mazatlán", "https://www.statiskicks.com/team/mazatlan-dsm1dxw4j3f973w7kzhe2n816"),
]


def _extract_statiskicks_tables(page: Selector) -> list[dict[str, Any]]:
    tables: list[dict[str, Any]] = []
    for tbl_idx, tbl in enumerate(page.css("table")):
        headers = [
            re.sub(r"\s+", " ", " ".join(th.css("::text, *::text").getall()).strip())
            for th in tbl.css("thead th, tr:first-child th")
        ]
        headers = [h for h in headers if h]
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
    return tables


async def scrape_statiskicks_wave4() -> dict[str, Any]:
    """Extrae los 18+ clubes de Liga MX en Statiskicks con sus plantillas SKore y series xG."""
    scraper = PitchLabScraplingBase("statiskicks")
    label = "statiskicks_all18_ligamx_clubs_and_players"
    _clean_previous_label_snapshots(scraper.category, scraper.source_id, label)

    ligamx_league_url = "https://www.statiskicks.com/league/2hsidwomhjsaaytdy9u5niyi4"
    scouting_ligamx_url = (
        "https://www.statiskicks.com/players?liga=2hsidwomhjsaaytdy9u5niyi4&temporada=2026%2F2027&buscar=1"
    )

    discovered_club_urls: dict[str, str] = {}
    league_standings_tables: list[dict[str, Any]] = []
    scouting_tables: list[dict[str, Any]] = []
    search_xhr_catalog: dict[str, Any] = {}
    clubs_extracted: list[dict[str, Any]] = []

    # Paso 1: Descubrir clubes en la página de Liga MX con AsyncStealthySession
    async with AsyncStealthySession(
        headless=True,
        solve_cloudflare=True,
        record_requests=True,
        block_ads=True,
        timeout=45000,
    ) as stealth_session:
        league_page = await stealth_session.fetch(
            ligamx_league_url,
            wait_until="domcontentloaded",
            wait=2000,
            google_search=False,
        )
        league_standings_tables = _extract_statiskicks_tables(league_page)
        for a in league_page.css("a[href*='/team/']"):
            href = a.attrib.get("href", "").strip()
            name = re.sub(
                r"\s+", " ", " ".join(a.css("::text, *::text").getall()).strip()
            )
            if href:
                full_url = (
                    href
                    if href.startswith("http")
                    else f"https://www.statiskicks.com{href}"
                )
                discovered_club_urls[full_url] = name or full_url.rsplit("/", 1)[-1]

    # Paso 2: Completar el catálogo de los 18 clubes actuales + Mazatlán vía `/search` XHR y fallback
    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        for query in ["Mazatlan", "America", "Cruz Azul", "Guadalajara", "Pumas", "Tigres", "Monterrey", "Toluca", "Leon", "Pachuca", "Santos", "Atlas", "Queretaro", "Puebla", "Necaxa", "San Luis", "Tijuana", "Juarez"]:
            try:
                s_resp = session.get(
                    f"https://www.statiskicks.com/search?q={query}",
                    headers={
                        "Accept": "application/json, text/plain, */*",
                        "X-Requested-With": "XMLHttpRequest",
                        "Referer": "https://www.statiskicks.com/",
                    },
                    timeout=15,
                )
                s_json = _safe_json_loads(_response_text(s_resp))
                if isinstance(s_json, dict):
                    search_xhr_catalog[query] = s_json
                    for t in s_json.get("teams") or []:
                        if isinstance(t, dict) and t.get("competition") == "Liga MX" and t.get("url"):
                            u = str(t["url"]).replace("\\/", "/")
                            if u not in discovered_club_urls:
                                discovered_club_urls[u] = t.get("name") or query
            except Exception:
                pass

        for fallback_name, fallback_url in STATISKICKS_FALLBACK_CLUBS:
            if fallback_url not in discovered_club_urls:
                discovered_club_urls[fallback_url] = fallback_name

        # Extraer tabla general de scouting de Liga MX
        try:
            sc_resp = session.get(scouting_ligamx_url, stealthy_headers=True, timeout=20)
            scouting_tables = _extract_statiskicks_tables(sc_resp)
        except Exception:
            pass

        # Paso 3: Visitar cada uno de los clubes de Liga MX y extraer todas sus tablas y JSON embebidos
        for club_url, club_label in discovered_club_urls.items():
            try:
                c_resp = session.get(club_url, stealthy_headers=True, timeout=25)
                c_tables = _extract_statiskicks_tables(c_resp)

                payloads_by_type: dict[str, Any] = {}
                for sc in c_resp.css("script[type='application/json']"):
                    raw_txt = (sc.css("::text").get() or "").strip()
                    parsed_json = _safe_json_loads(raw_txt)
                    ptype = next(
                        (k for k in sc.attrib.keys() if k.startswith("data-")),
                        sc.attrib.get("id", "json_script"),
                    )
                    if parsed_json is not None:
                        payloads_by_type[ptype] = parsed_json

                livewire_data = None
                for el in c_resp.css("[wire\\:snapshot]"):
                    snap = _safe_json_loads(el.attrib.get("wire:snapshot"))
                    if isinstance(snap, dict):
                        livewire_data = snap.get("data")
                        break

                xg_rolling = payloads_by_type.get("data-team-xg-rolling-payload") or {}
                profile_payload = payloads_by_type.get("data-team-profile-payload") or {}
                attr_charts = payloads_by_type.get("data-attribute-charts-payload") or {}
                age_profile = payloads_by_type.get("data-team-age-profile-payload") or {}
                formation_profile = (
                    payloads_by_type.get("data-team-formation-profile-payload") or {}
                )

                # Consolidar jugadores únicos del club (de tablas SKore/Total/p90 y age_profile)
                squad_table_rows_count = sum(t.get("rows_count", 0) for t in c_tables)
                xg_points = (
                    xg_rolling.get("points") if isinstance(xg_rolling, dict) else []
                ) or []
                metrics_list = (
                    profile_payload.get("metrics")
                    if isinstance(profile_payload, dict)
                    else []
                ) or []
                traits_list = (
                    attr_charts.get("traits") if isinstance(attr_charts, dict) else []
                ) or []
                age_players = (
                    age_profile.get("players") if isinstance(age_profile, dict) else []
                ) or []

                clubs_extracted.append(
                    {
                        "club_name": club_label,
                        "club_slug": club_url.rsplit("/", 1)[-1],
                        "url": club_url,
                        "status": getattr(c_resp, "status", 200),
                        "tables_count": len(c_tables),
                        "squad_table_rows_count": squad_table_rows_count,
                        "xg_rolling_matches_count": len(xg_points),
                        "tactical_metrics_count": len(metrics_list),
                        "attribute_traits_count": len(traits_list),
                        "age_profile_players_count": len(age_players),
                        "livewire_state": livewire_data,
                        "xg_rolling_payload": xg_rolling,
                        "team_profile_payload": profile_payload,
                        "attribute_charts_payload": attr_charts,
                        "age_profile_payload": age_profile,
                        "formation_profile_payload": formation_profile,
                        "squad_tables": c_tables,
                    }
                )
            except Exception as exc:
                clubs_extracted.append(
                    {"club_name": club_label, "url": club_url, "error": str(exc)}
                )

    total_squad_table_rows = sum(
        c.get("squad_table_rows_count", 0) for c in clubs_extracted
    )
    total_xg_rolling_points = sum(
        c.get("xg_rolling_matches_count", 0) for c in clubs_extracted
    )
    total_tactical_metrics = sum(
        c.get("tactical_metrics_count", 0) for c in clubs_extracted
    )
    total_age_profile_players = sum(
        c.get("age_profile_players_count", 0) for c in clubs_extracted
    )
    total_standings_rows = sum(
        t.get("rows_count", 0) for t in league_standings_tables
    )
    total_scouting_rows = sum(t.get("rows_count", 0) for t in scouting_tables)

    total_records = (
        len(clubs_extracted)
        + total_squad_table_rows
        + total_xg_rolling_points
        + total_tactical_metrics
        + total_age_profile_players
        + total_standings_rows
        + total_scouting_rows
    )

    payload = {
        "source": "statiskicks",
        "league_url": ligamx_league_url,
        "summary": {
            "ligamx_clubs_scraped": len(clubs_extracted),
            "total_squad_table_rows": total_squad_table_rows,
            "total_xg_rolling_match_points": total_xg_rolling_points,
            "total_tactical_percentile_metrics": total_tactical_metrics,
            "total_age_profile_players": total_age_profile_players,
            "league_standings_xp_rows": total_standings_rows,
            "scouting_leaderboard_rows": total_scouting_rows,
            "total_records": total_records,
        },
        "league_standings_xp_tables": league_standings_tables,
        "scouting_leaderboard_tables": scouting_tables,
        "search_xhr_catalog": search_xhr_catalog,
        "clubs": clubs_extracted,
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=ligamx_league_url,
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


# ===========================================================================
# 2. OPTA PLAYER STATS: ALL 18 LIGA MX CLUBS SEASONSTATS + 7 LEAGUES FEEDS
# ===========================================================================
OPTA_7_COMPETITIONS: list[tuple[str, str, str]] = [
    ("Liga MX", "2hsidwomhjsaaytdy9u5niyi4", "9zum4nxferygj8bb0ldcavxn8"),
    ("Premier League", "2kwbbcootiqqgmrzs6o5inle5", "6pdwluctev9iebv00r4qqukno"),
    ("LaLiga", "34pl8szyvrbwcmfkuocjm3r6t", "830epggffy1nfkfyrtpqdwhlg"),
    ("Serie A", "1r097lpxe0xn03ihb7wi98kao", "60cryos85i4bp5ul34tt0brx0"),
    ("Bundesliga", "6by3h89i2eykc341oz7lv1ddd", "8h5xijv2u4mlf5028gso6kw7o"),
    ("Ligue 1", "dm5ka0os1e3dxcp3vh05kmp33", "bqnc4ccgnrp6pb3bktqet0yz8"),
    ("UEFA Champions League", "4oogyu6o156iphvdvphwpck10", "99jev9kv55deht65t6myggxlg"),
]


async def scrape_opta_wave4() -> dict[str, Any]:
    """Extrae `seasonstats?detailed=yes` de los 18 clubes de Liga MX y feeds de 7 ligas."""
    scraper = PitchLabScraplingBase("opta_player_stats")
    label = "opta_all18_ligamx_players_and_6leagues"
    _clean_previous_label_snapshots(scraper.category, scraper.source_id, label)

    discovered_sdapi_key = "ft1tiv1inq7v1sk3y9tv12yh5"
    portal_url = "https://optaplayerstats.statsperform.com/en_GB/soccer/premier-league-2026-2027/6pdwluctev9iebv00r4qqukno/opta-player-stats"

    async with AsyncStealthySession(
        headless=True,
        solve_cloudflare=True,
        record_requests=True,
        block_ads=True,
        timeout=45000,
    ) as session:
        await session.fetch(
            portal_url,
            wait_until="networkidle",
            wait=2000,
            google_search=False,
        )
        for net_resp in session.network.search(limit=None):
            m_key = re.search(r"soccerdata/[a-z]+/([a-z0-9]{20,30})/", net_resp.url)
            if m_key:
                discovered_sdapi_key = m_key.group(1)
                break

    opta_headers = {
        "Referer": "https://optaplayerstats.statsperform.com/",
        "Origin": "https://optaplayerstats.statsperform.com",
        "Accept": "application/json",
    }

    tournament_calendars: list[dict[str, Any]] = []
    standings_by_league: dict[str, list[dict[str, Any]]] = {}
    matches_by_league: dict[str, list[dict[str, Any]]] = {}
    squads_by_league: dict[str, list[dict[str, Any]]] = {}
    ligamx_all18_seasonstats: list[dict[str, Any]] = []
    ligamx_contestants: list[tuple[str, str]] = []

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as fs:
        for comp_name, comp_id, default_tmcl in OPTA_7_COMPETITIONS:
            # 2A. Confirmar `tmcl` activo en `tournamentcalendar`
            tc_url = (
                f"https://api.performfeeds.com/soccerdata/tournamentcalendar/"
                f"{discovered_sdapi_key}/?_rt=c&comp={comp_id}&_lcl=en&_fmt=json"
            )
            tc_resp = fs.get(tc_url, headers=opta_headers, timeout=20)
            tc_json = _safe_json_loads(_response_text(tc_resp))
            tmcl_id = default_tmcl
            if isinstance(tc_json, dict) and isinstance(tc_json.get("competition"), list):
                for c_obj in tc_json["competition"]:
                    if not isinstance(c_obj, dict):
                        continue
                    cals = c_obj.get("tournamentCalendar") or []
                    active_cal = next(
                        (
                            c
                            for c in cals
                            if isinstance(c, dict) and c.get("active") == "yes"
                        ),
                        cals[0] if cals else {},
                    )
                    if isinstance(active_cal, dict) and active_cal.get("id"):
                        tmcl_id = active_cal["id"]
                    tournament_calendars.append(
                        {
                            "competition_name": comp_name,
                            "competition_id": c_obj.get("id") or comp_id,
                            "country": c_obj.get("country"),
                            "code": c_obj.get("competitionCode"),
                            "active_tmcl_id": tmcl_id,
                            "season_name": active_cal.get("name")
                            if isinstance(active_cal, dict)
                            else None,
                            "start_date": active_cal.get("startDate")
                            if isinstance(active_cal, dict)
                            else None,
                            "end_date": active_cal.get("endDate")
                            if isinstance(active_cal, dict)
                            else None,
                            "all_calendars_count": len(cals),
                        }
                    )

            # 2B. Standings de la competición
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
                            cid = r.get("contestantId")
                            cname = (
                                r.get("contestantName")
                                or r.get("contestantShortName")
                                or ""
                            )
                            if (
                                comp_name == "Liga MX"
                                and cid
                                and cid not in {x[0] for x in ligamx_contestants}
                            ):
                                ligamx_contestants.append((cid, cname))
                            st_rows.append(
                                {
                                    "division_type": div_type,
                                    "group_name": div.get("groupName"),
                                    "rank": r.get("rank"),
                                    "contestant_id": cid,
                                    "contestant_name": cname,
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
            standings_by_league[comp_name] = st_rows

            # 2C. Matches de la competición
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
                    comp_matches.append(
                        {
                            "match_id": m_info.get("id"),
                            "date": m_info.get("date"),
                            "time": m_info.get("time"),
                            "week": m_info.get("week"),
                            "description": m_info.get("description"),
                            "home_team_id": home_c.get("id"),
                            "home_team": home_c.get("name"),
                            "away_team_id": away_c.get("id"),
                            "away_team": away_c.get("name"),
                            "match_status": m_details.get("matchStatus"),
                            "winner": m_details.get("winner"),
                            "home_score": scores.get("home"),
                            "away_score": scores.get("away"),
                        }
                    )
            matches_by_league[comp_name] = comp_matches

            # 2D. Squads de la competición
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
                    cid = sq.get("contestantId")
                    cname = sq.get("contestantName") or ""
                    if (
                        comp_name == "Liga MX"
                        and cid
                        and cid not in {x[0] for x in ligamx_contestants}
                    ):
                        ligamx_contestants.append((cid, cname))
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
                            "date_of_birth": p.get("dateOfBirth"),
                        }
                        for p in persons
                        if isinstance(p, dict)
                    ]
                    comp_squads.append(
                        {
                            "contestant_id": cid,
                            "contestant_name": cname,
                            "contestant_code": sq.get("contestantCode"),
                            "venue_name": sq.get("venueName"),
                            "persons_count": len(players_list),
                            "persons": players_list,
                        }
                    )
            squads_by_league[comp_name] = comp_squads

        # 2E. Extraer `seasonstats?detailed=yes` para TODOS los 18 clubes de Liga MX
        ligamx_tmcl = "9zum4nxferygj8bb0ldcavxn8"
        for ctst_id, ctst_name in ligamx_contestants:
            ss_url = (
                f"https://api.performfeeds.com/soccerdata/seasonstats/"
                f"{discovered_sdapi_key}/?_rt=c&tmcl={ligamx_tmcl}&ctst={ctst_id}&detailed=yes&_lcl=en&_fmt=json"
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

            ligamx_all18_seasonstats.append(
                {
                    "competition": "Liga MX",
                    "tmcl_id": ligamx_tmcl,
                    "contestant_id": ctst_id,
                    "club_name": ctst_name,
                    "team_stats_count": len(team_stats),
                    "team_stats": team_stats,
                    "players_count": len(players_season_stats),
                    "players": players_season_stats,
                }
            )

    total_standings_rows = sum(len(v) for v in standings_by_league.values())
    total_matches_rows = sum(len(v) for v in matches_by_league.values())
    total_squad_persons = sum(
        sum(sq.get("persons_count", 0) for sq in v) for v in squads_by_league.values()
    )
    total_ligamx_seasonstats_players = sum(
        c.get("players_count", 0) for c in ligamx_all18_seasonstats
    )

    total_records = (
        len(tournament_calendars)
        + total_standings_rows
        + total_matches_rows
        + total_squad_persons
        + total_ligamx_seasonstats_players
    )

    payload = {
        "source": "opta_player_stats",
        "auth_metadata": {
            "sdapi_widget_key": discovered_sdapi_key,
            "rt_mode": "c",
        },
        "summary": {
            "competitions_covered": len(tournament_calendars),
            "ligamx_seasonstats_clubs_count": len(ligamx_all18_seasonstats),
            "ligamx_seasonstats_players_count": total_ligamx_seasonstats_players,
            "total_standings_rows_7leagues": total_standings_rows,
            "total_matches_extracted_7leagues": total_matches_rows,
            "total_squad_persons_7leagues": total_squad_persons,
            "total_records": total_records,
        },
        "tournament_calendars": tournament_calendars,
        "ligamx_all18_clubs_seasonstats": ligamx_all18_seasonstats,
        "standings_by_league": standings_by_league,
        "matches_by_league": matches_by_league,
        "squads_by_league": squads_by_league,
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
# 3. UNDERSTAT: ALL ~2,774 PLAYERS UNCAPPED + 2023 & 2024 HISTORICAL SEASONS
# ===========================================================================
UNDERSTAT_CURRENT_SEASON_PAGES: list[tuple[str, str, str]] = [
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

UNDERSTAT_HISTORICAL_PAGES: list[tuple[str, str, str, str]] = [
    (
        "EPL",
        "2024",
        "https://understat.com/league/EPL/2024",
        "https://web.archive.org/web/20250920125149/https://understat.com/league/EPL/2024",
    ),
    (
        "EPL",
        "2023",
        "https://understat.com/league/EPL/2023",
        "https://web.archive.org/web/20251107150410/https://understat.com/league/EPL/2023",
    ),
    (
        "La_liga",
        "2024",
        "https://understat.com/league/La_liga/2024",
        "https://web.archive.org/web/20250525232349/https://understat.com/league/La_liga/2024",
    ),
    (
        "La_liga",
        "2023",
        "https://understat.com/league/La_liga/2023",
        "https://web.archive.org/web/20240804234915/https://understat.com/league/La_liga/2023",
    ),
    (
        "Bundesliga",
        "2024",
        "https://understat.com/league/Bundesliga/2024",
        "https://web.archive.org/web/20251008164908/https://understat.com/league/Bundesliga/2024",
    ),
    (
        "Bundesliga",
        "2023",
        "https://understat.com/league/Bundesliga/2023",
        "https://web.archive.org/web/20250916052339/https://understat.com/league/Bundesliga/2023",
    ),
    (
        "Serie_A",
        "2024",
        "https://understat.com/league/Serie_A/2024",
        "https://web.archive.org/web/20250717150543/https://understat.com/league/Serie_A/2024",
    ),
    (
        "Serie_A",
        "2023",
        "https://understat.com/league/Serie_A/2023",
        "https://web.archive.org/web/20250617140613/https://understat.com/league/Serie_A/2023",
    ),
    (
        "Ligue_1",
        "2024",
        "https://understat.com/league/Ligue_1/2024",
        "https://web.archive.org/web/20250131173528/https://understat.com/league/Ligue_1/2024",
    ),
    (
        "Ligue_1",
        "2023",
        "https://understat.com/league/Ligue_1/2023",
        "https://web.archive.org/web/20250717161353/https://understat.com/league/Ligue_1/2023",
    ),
]


def _parse_understat_teams_and_dates(
    html_text: str, league_code: str, season_label: str
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
    """Extrae equipos (con su `history`) y `datesData` desde el HTML de Understat."""
    teams_match = re.search(
        r"var\s+teamsData\s*=\s*JSON\.parse\('([^']+)'\)", html_text
    )
    dates_match = re.search(
        r"var\s+datesData\s*=\s*JSON\.parse\('([^']+)'\)", html_text
    )
    raw_teams = _decode_understat_js_var(teams_match.group(1)) if teams_match else {}
    raw_dates = _decode_understat_js_var(dates_match.group(1)) if dates_match else []

    teams_list: list[dict[str, Any]] = []
    history_rows_count = 0

    if isinstance(raw_teams, dict):
        for team_id, team_obj in raw_teams.items():
            if not isinstance(team_obj, dict):
                continue
            history_raw = team_obj.get("history") or []
            history_rows_count += len(history_raw)
            xg_sum = round(
                sum(_safe_float(h.get("xG")) for h in history_raw if isinstance(h, dict)),
                3,
            )
            xga_sum = round(
                sum(_safe_float(h.get("xGA")) for h in history_raw if isinstance(h, dict)),
                3,
            )
            npxg_sum = round(
                sum(_safe_float(h.get("npxG")) for h in history_raw if isinstance(h, dict)),
                3,
            )
            npxga_sum = round(
                sum(
                    _safe_float(h.get("npxGA"))
                    for h in history_raw
                    if isinstance(h, dict)
                ),
                3,
            )
            xpts_sum = round(
                sum(_safe_float(h.get("xpts")) for h in history_raw if isinstance(h, dict)),
                3,
            )
            pts_sum = sum(
                _safe_int(h.get("pts")) for h in history_raw if isinstance(h, dict)
            )
            scored_sum = sum(
                _safe_int(h.get("scored")) for h in history_raw if isinstance(h, dict)
            )
            missed_sum = sum(
                _safe_int(h.get("missed")) for h in history_raw if isinstance(h, dict)
            )

            teams_list.append(
                {
                    "league": league_code,
                    "season": season_label,
                    "team_id": str(team_obj.get("id") or team_id),
                    "team_title": team_obj.get("title"),
                    "matches_played": len(history_raw),
                    "pts": pts_sum,
                    "xPTS": xpts_sum,
                    "scored": scored_sum,
                    "missed": missed_sum,
                    "xG": xg_sum,
                    "xGA": xga_sum,
                    "npxG": npxg_sum,
                    "npxGA": npxga_sum,
                    "npxGD": round(npxg_sum - npxga_sum, 3),
                }
            )

    matches_list: list[dict[str, Any]] = []
    if isinstance(raw_dates, list):
        for m in raw_dates:
            if not isinstance(m, dict):
                continue
            h_obj = m.get("h") if isinstance(m.get("h"), dict) else {}
            a_obj = m.get("a") if isinstance(m.get("a"), dict) else {}
            goals_obj = m.get("goals") if isinstance(m.get("goals"), dict) else {}
            xg_obj = m.get("xG") if isinstance(m.get("xG"), dict) else {}
            fc_obj = m.get("forecast") if isinstance(m.get("forecast"), dict) else {}
            matches_list.append(
                {
                    "match_id": str(m.get("id")),
                    "league": league_code,
                    "season": season_label,
                    "datetime": m.get("datetime"),
                    "is_result": bool(m.get("isResult")),
                    "home_team_id": str(h_obj.get("id") or ""),
                    "home_team": h_obj.get("title"),
                    "away_team_id": str(a_obj.get("id") or ""),
                    "away_team": a_obj.get("title"),
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

    return teams_list, matches_list, history_rows_count


async def scrape_understat_wave4() -> dict[str, Any]:
    """Extrae los ~2,774 jugadores sin límite y las temporadas 2023 y 2024 de las 5 ligas."""
    scraper = PitchLabScraplingBase("understat")
    label = "understat_5leagues_all_players_and_2023_2024_history"
    _clean_previous_label_snapshots(scraper.category, scraper.source_id, label)

    all_players_by_league: dict[str, list[dict[str, Any]]] = {}
    historical_seasons_data: dict[str, dict[str, Any]] = {}
    total_players_uncapped = 0
    total_historical_teams = 0
    total_historical_matches = 0
    total_historical_team_history_rows = 0

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        # 3A. Extraer TODOS los ~2,774 jugadores sin límite de las 5 ligas
        for league_code, live_url, archive_url in UNDERSTAT_CURRENT_SEASON_PAGES:
            resp = session.get(live_url, stealthy_headers=True, timeout=20)
            html_text = _response_text(resp)
            if "playersData" not in html_text:
                arch_resp = session.get(archive_url, stealthy_headers=True, timeout=30)
                html_text = _response_text(arch_resp)

            players_match = re.search(
                r"var\s+playersData\s*=\s*JSON\.parse\('([^']+)'\)", html_text
            )
            raw_players = (
                _decode_understat_js_var(players_match.group(1))
                if players_match
                else []
            )

            league_players: list[dict[str, Any]] = []
            if isinstance(raw_players, list):
                for p in raw_players:
                    if not isinstance(p, dict):
                        continue
                    xg_val = round(_safe_float(p.get("xG")), 4)
                    xa_val = round(_safe_float(p.get("xA")), 4)
                    league_players.append(
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
                            "npxG": round(_safe_float(p.get("npxG")), 4),
                            "xA": xa_val,
                            "xG_plus_xA": round(xg_val + xa_val, 4),
                            "xGChain": round(_safe_float(p.get("xGChain")), 4),
                            "xGBuildup": round(_safe_float(p.get("xGBuildup")), 4),
                        }
                    )

            league_players.sort(
                key=lambda x: (x["xG_plus_xA"], x["xG"], x["time_minutes"]),
                reverse=True,
            )
            all_players_by_league[league_code] = league_players
            total_players_uncapped += len(league_players)

        # 3B. Extraer temporadas históricas 2024 y 2023 en las 5 ligas (10 páginas)
        for league_code, season_yr, live_url, archive_url in UNDERSTAT_HISTORICAL_PAGES:
            resp = session.get(live_url, stealthy_headers=True, timeout=20)
            html_text = _response_text(resp)
            used_archive = False
            if "teamsData" not in html_text:
                arch_resp = session.get(archive_url, stealthy_headers=True, timeout=30)
                html_text = _response_text(arch_resp)
                used_archive = True

            teams_list, matches_list, hist_rows = _parse_understat_teams_and_dates(
                html_text, league_code, season_yr
            )
            key = f"{league_code}_{season_yr}"
            historical_seasons_data[key] = {
                "league": league_code,
                "season": season_yr,
                "live_url": live_url,
                "used_archive_mirror": used_archive,
                "archive_url": archive_url if used_archive else None,
                "teams_count": len(teams_list),
                "team_match_history_rows": hist_rows,
                "matches_count": len(matches_list),
                "teams": teams_list,
                "matches": matches_list,
            }
            total_historical_teams += len(teams_list)
            total_historical_matches += len(matches_list)
            total_historical_team_history_rows += hist_rows

    total_records = (
        total_players_uncapped
        + total_historical_teams
        + total_historical_matches
        + total_historical_team_history_rows
    )

    payload = {
        "source": "understat",
        "summary": {
            "leagues_count": len(all_players_by_league),
            "all_players_uncapped_count": total_players_uncapped,
            "historical_league_seasons_scraped": len(historical_seasons_data),
            "historical_teams_extracted": total_historical_teams,
            "historical_team_history_rows": total_historical_team_history_rows,
            "historical_matches_datesData_extracted": total_historical_matches,
            "total_records": total_records,
        },
        "all_players_uncapped_by_league": all_players_by_league,
        "historical_seasons_2023_2024": historical_seasons_data,
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


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Wave 4 Full Scraper para statiskicks, opta_player_stats y understat."
    )
    parser.add_argument(
        "--source",
        choices=["all", "statiskicks", "opta_player_stats", "understat"],
        default="all",
        help="Fuente a ejecutar (por defecto: all).",
    )
    args = parser.parse_args()

    print(
        f"[{utc_now_iso()}] Iniciando Wave 4 Full Extraction (advanced_stats_xg) con Scrapling..."
    )
    results: list[dict[str, Any]] = []

    if args.source in ("all", "statiskicks"):
        print(
            "-> [1/3] Extrayendo Statiskicks (18+ clubes Liga MX con series xG rolling, percentiles y tablas SKore)..."
        )
        res_s = await scrape_statiskicks_wave4()
        results.append(res_s)
        print(
            f"   OK statiskicks: records={res_s['records']} | sha256={res_s['sha256']} | path={res_s['path']}"
        )

    if args.source in ("all", "opta_player_stats"):
        print(
            "-> [2/3] Extrayendo Opta Player Stats (18 clubes Liga MX seasonstats?detailed=yes + 7 ligas)..."
        )
        res_o = await scrape_opta_wave4()
        results.append(res_o)
        print(
            f"   OK opta_player_stats: records={res_o['records']} | sha256={res_o['sha256']} | path={res_o['path']}"
        )

    if args.source in ("all", "understat"):
        print(
            "-> [3/3] Extrayendo Understat (~2,774 jugadores sin límite + temporadas históricas 2023 y 2024)..."
        )
        res_u = await scrape_understat_wave4()
        results.append(res_u)
        print(
            f"   OK understat: records={res_u['records']} | sha256={res_u['sha256']} | path={res_u['path']}"
        )

    print("\n=== RESUMEN WAVE 4 (advanced_stats_xg) ===")
    for item in results:
        print(
            f"- {item['source_id']} ({item['label']}): records={item['records']} | "
            f"sha256={item['sha256']} | path={item['path']}"
        )


if __name__ == "__main__":
    asyncio.run(main())
