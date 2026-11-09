"""Scraper Wave 4: Plantillas Completas de Jugadores (Liga MX + Top Europa), Sofascore Multi-Liga Profundo e Histórico FBref.

REGLA DE INGENIERÍA:
Exclusivamente utiliza Scrapling (`FetcherSession`, `StealthySession`, `AsyncStealthySession`,
`Selector`) desde `.worktrees\\web-scraping\\.venv\\Scripts\\python.exe` y `PitchLabScraplingBase`
(`scrapers/base_scraper.py`).

Objetivos profundos (Wave 4):
1. `clubelo_transfermarkt_values` (label=`transfermarkt_all18_ligamx_full_player_rosters`):
   Plantillas completas jugador por jugador de los 18 clubes de Liga MX + 8 clubes élite europeos
   (~650-750 jugadores individuales con `club`, `league`, `shirt_number`, `player_name`, `position`,
   `age_or_dob`, `nationality`, `market_value_eur`).
2. `sofascore` (label=`sofascore_7leagues_standings_events_top_players`):
   Extracción multi-liga profunda (`Liga MX`, `Premier League`, `LaLiga`, `Bundesliga`, `Serie A`,
   `Ligue 1`, `NFL`) vía `AsyncStealthySession(record_requests=True)`: tablas de posiciones,
   top players con rating Sofascore y xG, partidos recientes/próximos y llamadas API.
3. `fbref` (label=`fbref_ligamx_historical_seasons_and_fixtures_xg`):
   Histórico multi-temporada de Liga MX (`2024-2025 Liga MX Stats`, `2023-2024 Liga MX Stats`,
   `2024-2025 Liga MX Scores & Fixtures` y `2023-2024 Liga MX Scores & Fixtures` con xG por partido).
"""

from __future__ import annotations

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

SCRIPT_DIR = Path(__file__).resolve().parent
WORKTREE_ROOT = SCRIPT_DIR.parent
if str(WORKTREE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKTREE_ROOT))

from scrapers.base_scraper import DATA_RAW_DIR, PitchLabScraplingBase, utc_now_iso  # noqa: E402


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


def _remove_previous_label_snapshots(category: str, source_id: str, label: str) -> None:
    """Elimina únicamente snapshots previos que tengan el mismo `label` de Wave 4."""
    src_dir = DATA_RAW_DIR / category / source_id
    if not src_dir.exists():
        return
    for json_file in src_dir.rglob(f"*_{label}_*.json"):
        json_file.unlink(missing_ok=True)


def parse_market_value_eur(raw_val: str | None) -> float | None:
    """Convierte cadenas de Transfermarkt ('1,498.30 M€', '180.00 M€', '800 mil €') a euros."""
    if not raw_val:
        return None
    cleaned = raw_val.strip().lower().replace("€", "").strip()
    if not cleaned or cleaned in {"-", "?"}:
        return None

    multiplier = 1.0
    if "mil mill" in cleaned or "mrd" in cleaned or "bn" in cleaned or "bill" in cleaned:
        multiplier = 1_000_000_000.0
    elif "mill" in cleaned or "m€" in raw_val.lower() or re.search(r"\d\s*m\b", cleaned):
        multiplier = 1_000_000.0
    elif "mil" in cleaned or "tsd" in cleaned or re.search(r"\d\s*k\b", cleaned):
        multiplier = 1_000_000.0 if "mill" in cleaned else 1_000.0

    m = re.search(r"([0-9][0-9.,]*)", cleaned)
    if not m:
        return None
    num_token = m.group(1).strip(".,")
    if "," in num_token and "." in num_token:
        if num_token.rfind(".") > num_token.rfind(","):
            number_str = num_token.replace(",", "")
        else:
            number_str = num_token.replace(".", "").replace(",", ".")
    elif "," in num_token:
        parts = num_token.split(",")
        if len(parts) == 2 and len(parts[1]) == 3:
            number_str = num_token.replace(",", "")
        else:
            number_str = num_token.replace(",", ".")
    else:
        number_str = num_token
    try:
        return round(float(number_str) * multiplier, 2)
    except ValueError:
        return None


# ===========================================================================
# 1. TRANSFERMARKT: FULL INDIVIDUAL PLAYER ROSTERS (ALL 18 LIGA MX + TOP EUROPEAN CLUBS)
# ===========================================================================
TOP_EUROPEAN_CLUB_TARGETS: list[tuple[str, str, str, int, str]] = [
    (
        "laliga",
        "ES1",
        "Real Madrid CF",
        418,
        "https://www.transfermarkt.mx/real-madrid/kader/verein/418/saison_id/2026/plus/1",
    ),
    (
        "laliga",
        "ES1",
        "FC Barcelona",
        131,
        "https://www.transfermarkt.mx/fc-barcelona/kader/verein/131/saison_id/2026/plus/1",
    ),
    (
        "epl",
        "GB1",
        "Manchester City",
        281,
        "https://www.transfermarkt.mx/manchester-city/kader/verein/281/saison_id/2026/plus/1",
    ),
    (
        "epl",
        "GB1",
        "Arsenal FC",
        11,
        "https://www.transfermarkt.mx/fc-arsenal/kader/verein/11/saison_id/2026/plus/1",
    ),
    (
        "epl",
        "GB1",
        "Liverpool FC",
        31,
        "https://www.transfermarkt.mx/fc-liverpool/kader/verein/31/saison_id/2026/plus/1",
    ),
    (
        "bundesliga",
        "L1",
        "FC Bayern München",
        27,
        "https://www.transfermarkt.mx/fc-bayern-munchen/kader/verein/27/saison_id/2026/plus/1",
    ),
    (
        "serie-a",
        "IT1",
        "Inter de Milán",
        46,
        "https://www.transfermarkt.mx/inter-mailand/kader/verein/46/saison_id/2026/plus/1",
    ),
    (
        "ligue-1",
        "FR1",
        "Paris Saint-Germain",
        583,
        "https://www.transfermarkt.mx/fc-paris-saint-germain/kader/verein/583/saison_id/2026/plus/1",
    ),
]


def _parse_tm_club_roster_players(
    resp: Any,
    club_name: str,
    club_id: int | None,
    league_slug: str,
    comp_code: str,
) -> list[dict[str, Any]]:
    """Extrae todos los jugadores de la plantilla desde `div#yw1 table.items > tbody > tr.odd, tr.even`."""
    players: list[dict[str, Any]] = []
    seen_players: set[str] = set()

    rows = resp.css("div#yw1 table.items > tbody > tr.odd, div#yw1 table.items > tbody > tr.even")
    if not rows:
        rows = resp.css("table.items > tbody > tr.odd, table.items > tbody > tr.even")

    for tr in rows:
        # Número de camiseta
        shirt_raw = (tr.css("div.rn_nummer::text").get() or "").strip()
        shirt_number = shirt_raw if (shirt_raw and shirt_raw != "-") else None

        # Nombre del jugador e ID
        player_links = tr.css("table.inline-table td.hauptlink a, td.hauptlink a")
        player_name = ""
        player_href = ""
        for a in player_links:
            txt = " ".join(a.css("::text").getall()).strip()
            href = a.attrib.get("href", "")
            if txt and ("/spieler/" in href or not player_name):
                player_name = txt
                player_href = href
                if "/spieler/" in href:
                    break

        if not player_name:
            continue

        spieler_match = re.search(r"/spieler/(\d+)", player_href)
        player_id = int(spieler_match.group(1)) if spieler_match else None
        dedup_key = f"{club_name}:{player_id or player_name}"
        if dedup_key in seen_players:
            continue
        seen_players.add(dedup_key)

        # Posición (segunda fila de table.inline-table)
        inline_trs = tr.css("table.inline-table tr")
        position = ""
        if len(inline_trs) >= 2:
            position = " ".join(inline_trs[-1].css("td::text, ::text").getall()).strip()
        if not position:
            pos_td = tr.css("td.posrela tr:last-child td::text").get()
            position = (pos_td or "").strip()

        # Celdas centradas (camiseta, fecha de nacimiento/edad, nacionalidad, altura, pie, fichaje, contrato)
        zentriert_tds = tr.css("td.zentriert")
        age_or_dob = None
        age_int = None
        height_raw = None
        foot = None
        contract_until = None

        for ztd in zentriert_tds[1:]:
            z_text = " ".join(ztd.css("::text").getall()).strip()
            if not z_text or z_text == "-":
                continue
            # Detectar fecha de nacimiento / edad: ej. "15/05/1997 (29)" o "(29)" o edad de 2 dígitos
            if age_or_dob is None and (
                re.search(r"\(\d{2}\)", z_text)
                or re.fullmatch(r"\d{2}/\d{2}/\d{4}", z_text)
                or re.fullmatch(r"\d{2}", z_text)
            ):
                age_or_dob = z_text
                age_m = re.search(r"\((\d{2})\)", z_text)
                if age_m:
                    age_int = int(age_m.group(1))
                elif z_text.isdigit():
                    age_int = int(z_text)
                continue
            if height_raw is None and ("m" in z_text.lower() and re.search(r"[12][,.]\d{2}", z_text)):
                height_raw = z_text
                continue
            if foot is None and z_text.lower() in {
                "derecho",
                "izquierdo",
                "ambidiestro",
                "right",
                "left",
                "both",
            }:
                foot = z_text
                continue
            if re.search(r"20[23]\d", z_text):
                contract_until = z_text

        # Nacionalidades (banderas en td.zentriert)
        nationalities: list[str] = []
        for flag_img in tr.css("td.zentriert img.flaggenrahmen"):
            nat = (flag_img.attrib.get("title") or flag_img.attrib.get("alt") or "").strip()
            if nat and nat not in nationalities:
                nationalities.append(nat)

        # Valor de mercado
        mv_texts = [
            " ".join(td.css("::text, a::text").getall()).strip()
            for td in tr.css("td.rechts.hauptlink, td.rechts")
        ]
        mv_raw = next((t for t in reversed(mv_texts) if t and t != "-"), None)
        mv_eur = parse_market_value_eur(mv_raw)

        players.append(
            {
                "league": league_slug,
                "competition_code": comp_code,
                "club": club_name,
                "club_id": club_id,
                "player_id": player_id,
                "player_name": player_name,
                "player_path": player_href or None,
                "shirt_number": shirt_number,
                "position": position or None,
                "age_or_dob": age_or_dob,
                "age": age_int,
                "nationality": nationalities[0] if nationalities else None,
                "nationalities": nationalities,
                "height": height_raw,
                "foot": foot,
                "contract_until": contract_until,
                "market_value_raw": mv_raw,
                "market_value_eur": mv_eur,
            }
        )
    return players


def scrape_transfermarkt_full_player_rosters() -> dict[str, Any]:
    """1. Extrae las plantillas completas de jugadores de los 18 clubes de Liga MX + 8 clubes europeos."""
    scraper = PitchLabScraplingBase("clubelo_transfermarkt_values")
    label = "transfermarkt_all18_ligamx_full_player_rosters"
    _remove_previous_label_snapshots(scraper.category, scraper.source_id, label)

    mexa_startseite_url = (
        "https://www.transfermarkt.mx/liga-mx-apertura/startseite/wettbewerb/MEXA"
    )
    mexa_club_targets: list[tuple[str, str, str, int, str]] = []
    http_trace: list[dict[str, Any]] = []
    all_players: list[dict[str, Any]] = []
    clubs_roster_summary: list[dict[str, Any]] = []

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        # 1A. Obtener las URLs de los 18 clubes de Liga MX desde la página principal de MEXA
        resp_mexa = session.get(mexa_startseite_url, timeout=30)
        http_trace.append(
            {
                "step": "discover_mexa_clubs",
                "url": mexa_startseite_url,
                "status": getattr(resp_mexa, "status", None),
            }
        )
        seen_club_ids: set[int] = set()
        for tr in resp_mexa.css("div#yw1 table.items > tbody > tr, table.items > tbody > tr"):
            a_nodes = tr.css("td.hauptlink a")
            for a in a_nodes:
                c_name = " ".join(a.css("::text").getall()).strip()
                c_href = a.attrib.get("href", "")
                m_ver = re.search(r"/([^/]+)/startseite/verein/(\d+)", c_href)
                if c_name and m_ver:
                    c_slug, cid_str = m_ver.group(1), m_ver.group(2)
                    cid = int(cid_str)
                    if cid not in seen_club_ids:
                        seen_club_ids.add(cid)
                        kader_url = f"https://www.transfermarkt.mx/{c_slug}/kader/verein/{cid}/saison_id/2026/plus/1"
                        mexa_club_targets.append(("liga-mx", "MEXA", c_name, cid, kader_url))
                    break

        all_club_targets = mexa_club_targets + TOP_EUROPEAN_CLUB_TARGETS

        # 1B. Extraer la plantilla detallada (`/kader/verein/{id}/saison_id/2026/plus/1`) de cada club
        for league_slug, comp_code, club_name, club_id, kader_url in all_club_targets:
            resp_club = session.get(kader_url, timeout=30)
            st_club = getattr(resp_club, "status", None)
            http_trace.append(
                {
                    "league": league_slug,
                    "competition_code": comp_code,
                    "club": club_name,
                    "club_id": club_id,
                    "url": kader_url,
                    "status": st_club,
                }
            )
            club_players = (
                _parse_tm_club_roster_players(
                    resp_club, club_name, club_id, league_slug, comp_code
                )
                if st_club == 200
                else []
            )
            all_players.extend(club_players)

            total_val_eur = round(
                sum(
                    float(p["market_value_eur"])
                    for p in club_players
                    if p.get("market_value_eur") is not None
                ),
                2,
            )
            avg_val_eur = (
                round(total_val_eur / len(club_players), 2) if club_players else None
            )
            ages = [int(p["age"]) for p in club_players if p.get("age") is not None]
            avg_age = round(sum(ages) / len(ages), 2) if ages else None

            clubs_roster_summary.append(
                {
                    "league": league_slug,
                    "competition_code": comp_code,
                    "competition": "Liga MX Apertura (MEXA)"
                    if comp_code == "MEXA"
                    else f"European Elite ({comp_code})",
                    "club_id": club_id,
                    "club_name": club_name,
                    "club_path": kader_url.replace("https://www.transfermarkt.mx", ""),
                    "squad_size": len(club_players),
                    "average_age": avg_age,
                    "foreigners_count": sum(
                        1
                        for p in club_players
                        if comp_code == "MEXA"
                        and p.get("nationality")
                        and "méxico" not in str(p.get("nationality")).lower()
                        and "mexico" not in str(p.get("nationality")).lower()
                    )
                    if comp_code == "MEXA"
                    else None,
                    "average_player_value_eur": avg_val_eur,
                    "total_squad_market_value_eur": total_val_eur,
                }
            )

    ligamx_players_count = sum(1 for p in all_players if p.get("league") == "liga-mx")
    euro_players_count = len(all_players) - ligamx_players_count

    payload = {
        "captured_at_utc": utc_now_iso(),
        "competition": "Liga MX (18 Clubs Full Rosters) + Top European Clubs (8 Clubs)",
        "total_players_extracted": len(all_players),
        "ligamx_players_extracted": ligamx_players_count,
        "european_elite_players_extracted": euro_players_count,
        "ligamx_clubs_scraped": len(mexa_club_targets),
        "total_clubs_scraped": len(clubs_roster_summary),
        "http_trace": http_trace,
        "clubs": clubs_roster_summary,
        "players": all_players,
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=mexa_startseite_url,
        label=label,
        extra_meta={
            "total_players_extracted": len(all_players),
            "ligamx_players_extracted": ligamx_players_count,
            "european_elite_players_extracted": euro_players_count,
            "ligamx_clubs_scraped": len(mexa_club_targets),
            "total_clubs_scraped": len(clubs_roster_summary),
        },
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": scraper.source_id,
        "label": label,
        "category": scraper.category,
        "path": str(out_path),
        "records": len(all_players),
        "sha256": sha256_val,
    }


# ===========================================================================
# 2. SOFASCORE (DEEP MULTI-LEAGUE API & TOURNAMENT DATA — 6 SOCCER LEAGUES + NFL)
# ===========================================================================
SOFASCORE_TOURNAMENT_TARGETS: list[tuple[str, int, int | None, str]] = [
    (
        "liga-mx-apertura",
        11621,
        None,
        "https://www.sofascore.com/tournament/football/mexico/liga-mx-apertura/11621",
    ),
    (
        "premier-league",
        17,
        96668,
        "https://www.sofascore.com/tournament/football/england/premier-league/17",
    ),
    (
        "laliga",
        8,
        97268,
        "https://www.sofascore.com/tournament/football/spain/laliga/8",
    ),
    (
        "bundesliga",
        35,
        97464,
        "https://www.sofascore.com/tournament/football/germany/bundesliga/35",
    ),
    (
        "serie-a",
        23,
        95836,
        "https://www.sofascore.com/tournament/football/italy/serie-a/23",
    ),
    (
        "ligue-1",
        34,
        96127,
        "https://www.sofascore.com/tournament/football/france/ligue-1/34",
    ),
    (
        "nfl",
        9464,
        None,
        "https://www.sofascore.com/tournament/american-football/usa/nfl/9464",
    ),
]


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


def _extract_sofascore_standings(parsed_json: dict[str, Any], league_slug: str, tid: int, sid: int | None) -> list[dict[str, Any]]:
    rows_out: list[dict[str, Any]] = []
    standings_list = parsed_json.get("standings") or []
    if not isinstance(standings_list, list):
        return rows_out
    for st_group in standings_list:
        if not isinstance(st_group, dict):
            continue
        group_name = st_group.get("name") or st_group.get("type") or "total"
        for r in st_group.get("rows") or []:
            if not isinstance(r, dict):
                continue
            team = r.get("team") or {}
            rows_out.append(
                {
                    "league": league_slug,
                    "unique_tournament_id": tid,
                    "season_id": sid,
                    "group_name": group_name,
                    "position": r.get("position"),
                    "team_id": team.get("id"),
                    "team_name": team.get("name") or team.get("shortName"),
                    "matches": r.get("matches"),
                    "wins": r.get("wins"),
                    "draws": r.get("draws"),
                    "losses": r.get("losses"),
                    "scores_for": r.get("scoresFor"),
                    "scores_against": r.get("scoresAgainst"),
                    "points": r.get("points"),
                    "percentage": r.get("percentage"),
                }
            )
    return rows_out


def _extract_sofascore_top_players(parsed_json: dict[str, Any], league_slug: str, tid: int, sid: int | None) -> list[dict[str, Any]]:
    players_out: list[dict[str, Any]] = []
    # Caso 1: `/player-of-the-season-race` (`topPlayers` es lista)
    top_players_list = parsed_json.get("topPlayers")
    if isinstance(top_players_list, list):
        for item in top_players_list[:30]:
            if not isinstance(item, dict):
                continue
            player = item.get("player") or {}
            team = item.get("team") or {}
            stat = item.get("statistics") or {}
            players_out.append(
                {
                    "league": league_slug,
                    "unique_tournament_id": tid,
                    "season_id": sid,
                    "stat_category": "player_of_the_season_rating",
                    "player_id": player.get("id"),
                    "player_name": player.get("name"),
                    "position": player.get("position"),
                    "team_id": team.get("id"),
                    "team_name": team.get("name"),
                    "rating": stat.get("rating") or item.get("rating"),
                    "goals": stat.get("goals"),
                    "assists": stat.get("assists"),
                    "expected_goals": stat.get("expectedGoals"),
                    "appearances": stat.get("appearances"),
                }
            )
    # Caso 2: `/top-players/overall` (`topPlayers` es dict por categoría: rating, goals, expectedGoals, assists...)
    elif isinstance(top_players_list, dict):
        for cat_key, cat_items in top_players_list.items():
            if not isinstance(cat_items, list):
                continue
            for item in cat_items[:15]:
                if not isinstance(item, dict):
                    continue
                player = item.get("player") or {}
                team = item.get("team") or {}
                stat = item.get("statistics") or {}
                players_out.append(
                    {
                        "league": league_slug,
                        "unique_tournament_id": tid,
                        "season_id": sid,
                        "stat_category": cat_key,
                        "player_id": player.get("id"),
                        "player_name": player.get("name"),
                        "position": player.get("position"),
                        "team_id": team.get("id"),
                        "team_name": team.get("name"),
                        "rating": stat.get("rating"),
                        "goals": stat.get("goals"),
                        "assists": stat.get("assists"),
                        "expected_goals": stat.get("expectedGoals"),
                        "expected_assists": stat.get("expectedAssists"),
                        "appearances": stat.get("appearances"),
                    }
                )
    return players_out


async def _fetch_sofascore_json_endpoint(session: Any, api_url: str) -> dict[str, Any] | None:
    """Consulta un endpoint `https://www.sofascore.com/api/v1/...` dentro de la sesión browser activa."""
    try:
        api_page = await session.fetch(
            api_url,
            wait_until="domcontentloaded",
            wait=800,
            google_search=False,
        )
        raw_text = api_page.css("pre::text, body::text").get() or _response_text(api_page)
        parsed = _safe_json_loads(raw_text)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


async def scrape_sofascore_7leagues() -> dict[str, Any]:
    """2. Extrae tablas, eventos, temporadas y top players de 7 ligas (6 fútbol + NFL) en Sofascore."""
    scraper = PitchLabScraplingBase("sofascore")
    label = "sofascore_7leagues_standings_events_top_players"
    _remove_previous_label_snapshots(scraper.category, scraper.source_id, label)

    scheduled_events: list[dict[str, Any]] = []
    standings_rows: list[dict[str, Any]] = []
    top_players: list[dict[str, Any]] = []
    ligamx_seasons: list[dict[str, Any]] = []
    tournaments_summary: list[dict[str, Any]] = []
    recorded_api_calls: list[dict[str, Any]] = []

    async with AsyncStealthySession(
        headless=True,
        solve_cloudflare=True,
        record_requests=True,
        block_ads=True,
        timeout=45000,
        max_recorded_requests=1500,
    ) as session:
        # 2A. Visitar páginas de torneos clave para inicializar cookies/turnstile y capturar XHR nativo
        for league_slug, tid, default_sid, web_url in SOFASCORE_TOURNAMENT_TARGETS:
            dom_links_count = 0
            page_title = None
            page_status = None
            try:
                page = await session.fetch(
                    web_url,
                    wait_until="domcontentloaded",
                    wait=2000,
                    google_search=False,
                )
                page_status = getattr(page, "status", None)
                page_title = (page.css("title::text").get() or "").strip()
                dom_links_count = len(page.css("a[href]"))
            except Exception:
                pass

            # 2B. Consultar `/seasons` en `www.sofascore.com/api/v1` para obtener el `season_id` activo
            seasons_url = f"https://www.sofascore.com/api/v1/unique-tournament/{tid}/seasons"
            seasons_json = await _fetch_sofascore_json_endpoint(session, seasons_url)
            seasons_list = (seasons_json or {}).get("seasons") or []
            active_sid = default_sid
            if isinstance(seasons_list, list) and seasons_list:
                first_s = seasons_list[0]
                if isinstance(first_s, dict) and first_s.get("id"):
                    active_sid = int(first_s["id"])
                if tid in (11621, 11620):
                    ligamx_seasons = seasons_list[:25]

            t_standings_count = 0
            t_players_count = 0
            t_events_count = 0

            if active_sid:
                # Standings
                st_url = f"https://www.sofascore.com/api/v1/unique-tournament/{tid}/season/{active_sid}/standings/total"
                st_json = await _fetch_sofascore_json_endpoint(session, st_url)
                if st_json:
                    st_rows = _extract_sofascore_standings(st_json, league_slug, tid, active_sid)
                    standings_rows.extend(st_rows)
                    t_standings_count += len(st_rows)

                # Top players (overall + player-of-the-season-race)
                tp_url = f"https://www.sofascore.com/api/v1/unique-tournament/{tid}/season/{active_sid}/top-players/overall"
                tp_json = await _fetch_sofascore_json_endpoint(session, tp_url)
                if tp_json:
                    tp_rows = _extract_sofascore_top_players(tp_json, league_slug, tid, active_sid)
                    top_players.extend(tp_rows)
                    t_players_count += len(tp_rows)

                pots_url = f"https://www.sofascore.com/api/v1/unique-tournament/{tid}/season/{active_sid}/player-of-the-season-race"
                pots_json = await _fetch_sofascore_json_endpoint(session, pots_url)
                if pots_json:
                    pots_rows = _extract_sofascore_top_players(pots_json, league_slug, tid, active_sid)
                    top_players.extend(pots_rows)
                    t_players_count += len(pots_rows)

                # Eventos recientes (`events/last/0`) y próximos (`events/next/0`)
                for ev_kind in ("last/0", "next/0"):
                    ev_url = f"https://www.sofascore.com/api/v1/unique-tournament/{tid}/season/{active_sid}/events/{ev_kind}"
                    ev_json = await _fetch_sofascore_json_endpoint(session, ev_url)
                    if ev_json and isinstance(ev_json.get("events"), list):
                        for ev in ev_json["events"][:50]:
                            if isinstance(ev, dict):
                                scheduled_events.append(_normalize_sofascore_event(ev))
                                t_events_count += 1

            tournaments_summary.append(
                {
                    "league": league_slug,
                    "unique_tournament_id": tid,
                    "season_id": active_sid,
                    "web_url": web_url,
                    "status": page_status,
                    "title": page_title,
                    "dom_links_count": dom_links_count,
                    "standings_rows_extracted": t_standings_count,
                    "top_players_extracted": t_players_count,
                    "events_extracted": t_events_count,
                }
            )

        # 2C. Inspeccionar todas las respuestas de red grabadas por `AsyncStealthySession`
        for resp in session.network.search(url_pattern=r"(sofascore\.com|api/v1)", limit=None):
            rtype = resp.meta.get("resource_type", "")
            parsed = _safe_json_loads(resp.body) if resp.body else None
            if parsed is not None or rtype in ("xhr", "fetch") or "/api/v1/" in resp.url:
                entry: dict[str, Any] = {
                    "network_id": resp.meta.get("network_id"),
                    "url": resp.url,
                    "status": resp.status,
                    "resource_type": rtype,
                }
                if isinstance(parsed, dict):
                    entry["json_keys"] = list(parsed.keys())[:15]
                    if "events" in parsed and isinstance(parsed["events"], list):
                        for ev in parsed["events"][:60]:
                            if isinstance(ev, dict):
                                scheduled_events.append(_normalize_sofascore_event(ev))
                recorded_api_calls.append(entry)

    # Deduplicar eventos por event_id
    dedup_events: dict[Any, dict[str, Any]] = {}
    for ev in scheduled_events:
        eid = ev.get("event_id") or f"{ev.get('home_team')}_{ev.get('away_team')}_{ev.get('start_timestamp')}"
        if eid not in dedup_events:
            dedup_events[eid] = ev
    unique_events = list(dedup_events.values())

    # Deduplicar filas de standings por (unique_tournament_id, group_name, team_id)
    dedup_standings: dict[tuple[Any, Any, Any], dict[str, Any]] = {}
    for st_row in standings_rows:
        s_key = (
            st_row.get("unique_tournament_id"),
            st_row.get("group_name"),
            st_row.get("team_id") or st_row.get("team_name"),
        )
        dedup_standings[s_key] = st_row
    unique_standings = list(dedup_standings.values())

    # Deduplicar top players por (unique_tournament_id, stat_category, player_id)
    dedup_tp: dict[tuple[Any, Any, Any], dict[str, Any]] = {}
    for tp_row in top_players:
        tp_key = (
            tp_row.get("unique_tournament_id"),
            tp_row.get("stat_category"),
            tp_row.get("player_id") or tp_row.get("player_name"),
        )
        dedup_tp[tp_key] = tp_row
    unique_top_players = list(dedup_tp.values())

    total_records = (
        len(unique_standings)
        + len(unique_top_players)
        + len(unique_events)
        + len(ligamx_seasons)
    )

    payload = {
        "source": "sofascore",
        "captured_at_utc": utc_now_iso(),
        "target_urls": [u for _, _, _, u in SOFASCORE_TOURNAMENT_TARGETS],
        "summary": {
            "tournaments_scraped": len(tournaments_summary),
            "standings_rows_extracted": len(unique_standings),
            "top_players_extracted": len(unique_top_players),
            "scheduled_events_extracted": len(unique_events),
            "ligamx_seasons_extracted": len(ligamx_seasons),
            "network_api_calls_captured": len(recorded_api_calls),
            "total_records": total_records,
        },
        "tournaments_summary": tournaments_summary,
        "standings_rows": unique_standings,
        "top_players": unique_top_players,
        "scheduled_events": unique_events,
        "ligamx_seasons": ligamx_seasons,
        "recorded_api_calls": recorded_api_calls[:120],
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=SOFASCORE_TOURNAMENT_TARGETS[0][3],
        label=label,
        extra_meta=payload["summary"],
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": scraper.source_id,
        "label": label,
        "category": scraper.category,
        "path": str(out_path),
        "records": total_records,
        "sha256": sha256_val,
    }


# ===========================================================================
# 3. FBREF (HISTORICAL LIGA MX SEASONS 2024-2025 & 2023-2024 + SCORES & FIXTURES XG)
# ===========================================================================
FBREF_HISTORICAL_TARGETS: list[tuple[str, str, str]] = [
    (
        "liga-mx-2024-2025-stats",
        "https://fbref.com/en/comps/31/2024-2025/2024-2025-Liga-MX-Stats",
        "https://web.archive.org/web/20250501000000/https://fbref.com/en/comps/31/2024-2025/2024-2025-Liga-MX-Stats",
    ),
    (
        "liga-mx-2023-2024-stats",
        "https://fbref.com/en/comps/31/2023-2024/2023-2024-Liga-MX-Stats",
        "https://web.archive.org/web/20241201000000/https://fbref.com/en/comps/31/2023-2024/2023-2024-Liga-MX-Stats",
    ),
    (
        "liga-mx-2024-2025-fixtures-xg",
        "https://fbref.com/en/comps/31/2024-2025/schedule/2024-2025-Liga-MX-Scores-and-Fixtures",
        "https://web.archive.org/web/20250501000000/https://fbref.com/en/comps/31/2024-2025/schedule/2024-2025-Liga-MX-Scores-and-Fixtures",
    ),
    (
        "liga-mx-2023-2024-fixtures-xg",
        "https://fbref.com/en/comps/31/2023-2024/schedule/2023-2024-Liga-MX-Scores-and-Fixtures",
        "https://web.archive.org/web/20241201000000/https://fbref.com/en/comps/31/2023-2024/schedule/2023-2024-Liga-MX-Scores-and-Fixtures",
    ),
]


def _parse_fbref_historical_tables(page: Selector) -> list[dict[str, Any]]:
    """Extrae todas las tablas `table.stats_table` (estadísticas de equipo y fixtures con xG)."""
    tables_out: list[dict[str, Any]] = []
    raw_tables = page.css(
        "table.stats_table, table[id*='sched'], table[id*='results'], table[id*='stats_squads']"
    )

    if not raw_tables:
        html_text = _response_text(page)
        for comment_match in re.finditer(
            r"<!--(.*?<table[^>]*stats_table.*?</table>.*?)-->", html_text, re.DOTALL
        ):
            sub_sel = Selector(comment_match.group(1))
            raw_tables.extend(sub_sel.css("table"))

    seen_table_ids: set[str] = set()
    for idx, tbl in enumerate(raw_tables[:20]):
        table_id = tbl.attrib.get("id") or f"stats_table_{idx + 1}"
        if table_id in seen_table_ids:
            continue
        seen_table_ids.add(table_id)

        caption = " ".join(tbl.css("caption::text").getall()).strip()
        rows_data: list[dict[str, Any]] = []
        for tr in tbl.css("tbody tr"):
            tr_class = tr.attrib.get("class") or ""
            if "thead" in tr_class or "spacer" in tr_class or "partial_table" in tr_class:
                continue
            row_dict: dict[str, Any] = {}
            for cell in tr.css("th, td"):
                stat_name = cell.attrib.get("data-stat")
                val = " ".join(cell.css("::text, *::text").getall()).strip()
                if stat_name and val:
                    row_dict[stat_name] = val

            if not row_dict:
                continue

            if row_dict.get("home_team") and row_dict.get("away_team"):
                if not row_dict.get("team"):
                    row_dict["team"] = f"{row_dict['home_team']} vs {row_dict['away_team']}"
                rows_data.append(row_dict)
            elif row_dict.get("team") or row_dict.get("squad") or len(row_dict) >= 4:
                rows_data.append(row_dict)

        if rows_data:
            tables_out.append(
                {
                    "table_id": table_id,
                    "caption": caption,
                    "rows_count": len(rows_data),
                    "rows": rows_data[:450],
                }
            )
    return tables_out


def scrape_fbref_historical_ligamx() -> dict[str, Any]:
    """3. Extrae temporadas históricas de Liga MX (2024-2025 y 2023-2024 Stats + Scores & Fixtures con xG)."""
    scraper = PitchLabScraplingBase("fbref")
    label = "fbref_ligamx_historical_seasons_and_fixtures_xg"
    _remove_previous_label_snapshots(scraper.category, scraper.source_id, label)

    comps_extracted: list[dict[str, Any]] = []
    total_rows = 0
    historical_fixture_rows = 0
    matches_with_xg = 0

    with StealthySession(
        headless=True,
        solve_cloudflare=True,
        network_idle=True,
        block_ads=True,
        timeout=60000,
    ) as stealth_session:
        for comp_slug, live_url, archive_url in FBREF_HISTORICAL_TARGETS:
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

            tables = _parse_fbref_historical_tables(page) if page else []

            if not tables:
                try:
                    with FetcherSession(impersonate="chrome", stealthy_headers=True) as fs:
                        arch_resp = fs.get(archive_url, timeout=30)
                        tables = _parse_fbref_historical_tables(arch_resp)
                        if tables:
                            page = arch_resp
                            used_archive = True
                except Exception:
                    pass

            comp_rows_count = sum(len(t.get("rows", [])) for t in tables)
            total_rows += comp_rows_count
            if "fixtures" in comp_slug or "schedule" in live_url:
                historical_fixture_rows += comp_rows_count
                for t in tables:
                    for r in t.get("rows", []):
                        if r.get("home_xg") is not None or r.get("away_xg") is not None:
                            matches_with_xg += 1

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
                    "tables": tables,
                }
            )

    payload = {
        "source": "fbref",
        "captured_at_utc": utc_now_iso(),
        "target_urls": [u for _, u, _ in FBREF_HISTORICAL_TARGETS],
        "summary": {
            "competitions_scraped": len(comps_extracted),
            "total_tables_extracted": sum(c.get("tables_count", 0) for c in comps_extracted),
            "historical_fixture_rows_extracted": historical_fixture_rows,
            "historical_matches_with_xg": matches_with_xg,
            "total_stat_and_fixture_rows": total_rows,
        },
        "competitions": comps_extracted,
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=FBREF_HISTORICAL_TARGETS[0][1],
        label=label,
        extra_meta=payload["summary"],
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": scraper.source_id,
        "label": label,
        "category": scraper.category,
        "path": str(out_path),
        "records": total_rows,
        "sha256": sha256_val,
    }


def main() -> None:
    print(f"[{utc_now_iso()}] Iniciando Wave 4 Full Rosters & Historical Data con Scrapling...")
    results: list[dict[str, Any]] = []

    print("-> [1/3] Transfermarkt: Plantillas completas de los 18 clubes de Liga MX + 8 clubes élite europeos...")
    tm_rosters_res = scrape_transfermarkt_full_player_rosters()
    results.append(tm_rosters_res)
    print(
        f"   OK: {tm_rosters_res['records']} jugadores extraídos | sha256={tm_rosters_res['sha256'][:12]}"
    )

    print("-> [2/3] Sofascore: 7 ligas (Liga MX, EPL, LaLiga, Bundesliga, Serie A, Ligue 1, NFL)...")
    sofascore_res = asyncio.run(scrape_sofascore_7leagues())
    results.append(sofascore_res)
    print(
        f"   OK: {sofascore_res['records']} registros extraídos | sha256={sofascore_res['sha256'][:12]}"
    )

    print("-> [3/3] FBref: Histórico Liga MX (2024-2025 & 2023-2024 Stats + Scores & Fixtures con xG)...")
    fbref_hist_res = scrape_fbref_historical_ligamx()
    results.append(fbref_hist_res)
    print(
        f"   OK: {fbref_hist_res['records']} filas históricas extraídas | sha256={fbref_hist_res['sha256'][:12]}"
    )

    print("\n=== RESUMEN WAVE 4 FULL ROSTERS & HISTORY ===")
    for r in results:
        print(
            f"- {r['source_id']} ({r['label']}): records={r['records']} | "
            f"sha256={r['sha256']} | path={r['path']}"
        )


if __name__ == "__main__":
    main()
