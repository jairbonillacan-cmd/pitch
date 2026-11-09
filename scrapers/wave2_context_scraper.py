"""Scrapers de Contexto Ola 2 (Categorías 3, 4 y 5) para PitchLab usando exclusivamente Scrapling.

Cubre las 6 fuentes restantes de contexto en `config/sources_catalog.json`:
1. `premierinjuries_sportsgambler` (`injuries_lineups`): Jugadores lesionados/suspendidos, partidos perdidos, probabilidad de retorno y XI predicho desde PremierInjuries y SportsGambler.
2. `nfl_official_injuries_depth` (`injuries_lineups`): Reporte oficial de lesiones de NFL.com y tablas de titulares/suplentes (depth charts) de Ourlads.
3. `ffs_bbc_press_conferences` (`news_press_sentiment`): Ruedas de prensa, bajas confirmadas, dudas de última hora y titulares de Premier League desde Fantasy Football Scout y BBC Sport (`extract_markdown_cli` --ai-targeted + `FetcherSession`).
4. `marca_as_laliga_news` (`news_press_sentiment`): Noticias de LaLiga, partes médicos y convocatorias desde Marca (`extract_markdown_cli` --ai-targeted + `FetcherSession`).
5. `profootballtalk_nfl_news` (`news_press_sentiment`): Reportes de beat writers de NFL, límites de snaps y cambios de entrenadores desde ProFootballTalk / NBC Sports (`extract_markdown_cli` --ai-targeted + `FetcherSession`).
6. `worldfootball_nflpenalties_referees` (`environment_referees`): Estadísticas arbitrales de tarjetas/penales por partido en WorldFootball y castigos/yardas por partido por cuadrilla arbitral en NFLPenalties.
"""

from __future__ import annotations

import json
from pathlib import Path
import re
import sys
from typing import Any

from scrapling.fetchers import FetcherSession, StealthySession

# Permitir ejecución directa desde la raíz del repositorio o desde scrapers/
SCRIPT_DIR = Path(__file__).resolve().parent
WORKTREE_ROOT = SCRIPT_DIR.parent
if str(WORKTREE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKTREE_ROOT))

from scrapers.base_scraper import PitchLabScraplingBase, utc_now_iso  # noqa: E402


EPL_CLUB_KEYWORDS: dict[str, list[str]] = {
    "Arsenal": ["arsenal", "gunners", "arteta"],
    "Aston Villa": ["aston villa", "villa", "emery"],
    "Bournemouth": ["bournemouth", "cherries", "iraola"],
    "Brentford": ["brentford", "bees"],
    "Brighton": ["brighton", "seagulls"],
    "Chelsea": ["chelsea", "blues", "maresca"],
    "Crystal Palace": ["crystal palace", "palace", "glasner"],
    "Everton": ["everton", "toffees", "moyes"],
    "Fulham": ["fulham", "cottagers", "marco silva"],
    "Liverpool": ["liverpool", "reds", "slot"],
    "Manchester City": ["manchester city", "man city", "guardiola"],
    "Manchester United": ["manchester united", "man utd", "amorim"],
    "Newcastle United": ["newcastle", "magpies", "howe"],
    "Nottingham Forest": ["nottingham forest", "forest"],
    "Tottenham Hotspur": ["tottenham", "spurs"],
    "West Ham United": ["west ham", "hammers"],
    "Wolverhampton": ["wolves", "wolverhampton"],
}

LALIGA_CLUB_KEYWORDS: dict[str, list[str]] = {
    "Real Madrid": ["real madrid", "madrid", "madridista", "valdebebas", "bernabeu", "bernabéu"],
    "Barcelona": ["barcelona", "barça", "barca", "blaugrana", "flick", "camp nou"],
    "Atlético de Madrid": ["atlético", "atletico", "simeone", "cholo", "rojiblanco", "metropolitano"],
    "Athletic Club": ["athletic", "valverde", "san mamés", "san mames", "leones"],
    "Real Sociedad": ["real sociedad", "txuri-urdin", "anoeta", "donostia"],
    "Villarreal": ["villarreal", "submarino amarillo", "marcelino"],
    "Real Betis": ["betis", "bético", "betico", "pellegrini", "villamarín"],
    "Sevilla": ["sevilla", "nervión", "nervion", "pizjuán"],
    "Valencia": ["valencia", "mestalla", "che"],
    "Girona": ["girona", "míchel", "michel", "montilivi"],
    "Celta de Vigo": ["celta", "balaídos", "balaidos"],
    "Osasuna": ["osasuna", "sadar", "rojillos"],
    "Mallorca": ["mallorca", "son moix", "bermellones"],
    "Rayo Vallecano": ["rayo", "vallecas"],
    "Getafe": ["getafe", "bordalás", "bordalas", "coliseum"],
    "Espanyol": ["espanyol", "pericos"],
    "Alavés": ["alavés", "alaves", "mendizorroza"],
    "Las Palmas": ["las palmas", "ud las palmas"],
    "Leganés": ["leganés", "leganes", "butarque"],
    "Valladolid": ["valladolid", "pucela", "zorrilla"],
}

NFL_TEAM_KEYWORDS: dict[str, list[str]] = {
    "Arizona Cardinals": ["cardinals", "arizona"],
    "Atlanta Falcons": ["falcons", "atlanta"],
    "Baltimore Ravens": ["ravens", "baltimore", "lamar jackson"],
    "Buffalo Bills": ["bills", "buffalo", "josh allen"],
    "Carolina Panthers": ["panthers", "carolina"],
    "Chicago Bears": ["bears", "chicago", "caleb williams"],
    "Cincinnati Bengals": ["bengals", "cincinnati", "burrow"],
    "Cleveland Browns": ["browns", "cleveland"],
    "Dallas Cowboys": ["cowboys", "dallas", "dak prescott"],
    "Denver Broncos": ["broncos", "denver", "bo nix"],
    "Detroit Lions": ["lions", "detroit", "dan campbell", "goff"],
    "Green Bay Packers": ["packers", "green bay", "jordan love"],
    "Houston Texans": ["texans", "houston", "stroud"],
    "Indianapolis Colts": ["colts", "indianapolis"],
    "Jacksonville Jaguars": ["jaguars", "jacksonville"],
    "Kansas City Chiefs": ["chiefs", "kansas city", "mahomes", "andy reid"],
    "Las Vegas Raiders": ["raiders", "las vegas"],
    "Los Angeles Chargers": ["chargers", "herbert", "harbaugh"],
    "Los Angeles Rams": ["rams", "mcvay", "stafford"],
    "Miami Dolphins": ["dolphins", "miami", "tua"],
    "Minnesota Vikings": ["vikings", "minnesota"],
    "New England Patriots": ["patriots", "new england", "drake maye"],
    "New Orleans Saints": ["saints", "new orleans"],
    "New York Giants": ["giants", "new york giants"],
    "New York Jets": ["jets", "new york jets"],
    "Philadelphia Eagles": ["eagles", "philadelphia", "hurts"],
    "Pittsburgh Steelers": ["steelers", "pittsburgh", "tomlin"],
    "San Francisco 49ers": ["49ers", "niners", "san francisco", "shanahan", "purdy", "aiyuk"],
    "Seattle Seahawks": ["seahawks", "seattle"],
    "Tampa Bay Buccaneers": ["buccaneers", "bucs", "tampa bay", "bowles"],
    "Tennessee Titans": ["titans", "tennessee"],
    "Washington Commanders": ["commanders", "washington", "jayden daniels"],
}


def _parse_status_probability_pct(status_text: str, record_type: str = "") -> int:
    """Convierte etiquetas de estado ('75%', '50%', 'Ruled Out', 'doubtful', 'redcard') a probabilidad 0-100."""
    combined = f"{status_text} {record_type}".lower()
    pct_match = re.search(r"(\d{1,3})\s*%", combined)
    if pct_match:
        return min(100, max(0, int(pct_match.group(1))))
    if any(k in combined for k in ["ruled out", "suspended", "red card", "redcard", "out"]):
        return 0
    if "major doubt" in combined or "25" in combined:
        return 25
    if any(k in combined for k in ["doubt", "questionable", "late fitness", "50"]):
        return 50
    if "slight doubt" in combined or "minor" in combined or "75" in combined:
        return 75
    if "available" in combined or "fit" in combined:
        return 100
    return 0


def _clean_prefixed_cell(text: str, prefix: str) -> str:
    """Limpia prefijos de celdas de tabla de PremierInjuries como 'Player\\nBukayo Saka'."""
    cleaned = text.strip()
    if cleaned.lower().startswith(prefix.lower()):
        cleaned = cleaned[len(prefix) :].strip()
    return cleaned


def _parse_sportsgambler_injuries(response) -> list[dict[str, Any]]:
    """Extrae jugadores lesionados y suspendidos de `https://www.sportsgambler.com/injuries/football/`."""
    records: list[dict[str, Any]] = []
    league_headers = [
        h.get_all_text(strip=True) for h in response.css("h2.title-bordered, h1")
    ]
    default_league = "epl"
    if league_headers and "la liga" in league_headers[0].lower():
        default_league = "laliga"

    for block in response.css("div.injury-block"):
        titles = [t.get_all_text(strip=True) for t in block.css("h3.injuries-title, h3")]
        club_name = titles[0] if titles else "Unknown Club"

        for row in block.css("div.inj-row"):
            player_nodes = row.css("span.inj-player")
            player_name = player_nodes[0].get_all_text(strip=True) if player_nodes else ""
            if not player_name or player_name.lower() == "name":
                continue

            type_nodes = row.css("span.inj-type")
            type_class = type_nodes[0].attrib.get("class", "") if type_nodes else ""
            if "redcard" in type_class or "suspension" in type_class:
                absence_type = "suspended"
            elif "doubt" in type_class or "question" in type_class:
                absence_type = "doubtful"
            else:
                absence_type = "injured"

            pos_nodes = row.css("span.inj-position")
            matches_nodes = row.css("span.inj-game")
            goals_nodes = row.css("span.inj-goals")
            assists_nodes = row.css("span.inj-assist")
            info_nodes = row.css("span.inj-info")
            return_nodes = row.css("span.inj-return")

            position = pos_nodes[0].get_all_text(strip=True) if pos_nodes else ""
            matches_raw = matches_nodes[0].get_all_text(strip=True) if matches_nodes else ""
            goals_raw = goals_nodes[0].get_all_text(strip=True) if goals_nodes else ""
            assists_raw = assists_nodes[0].get_all_text(strip=True) if assists_nodes else ""
            info_text = info_nodes[0].get_all_text(strip=True) if info_nodes else ""
            expected_return = return_nodes[0].get_all_text(strip=True) if return_nodes else ""

            prob_pct = _parse_status_probability_pct(info_text, absence_type)

            records.append(
                {
                    "provider": "sportsgambler",
                    "league": default_league,
                    "club": club_name,
                    "player_name": player_name,
                    "position": position,
                    "absence_type": absence_type,
                    "reason": info_text,
                    "expected_return": expected_return or None,
                    "status_probability_pct": prob_pct,
                    "matches_season": int(matches_raw) if matches_raw.isdigit() else None,
                    "goals_season": int(goals_raw) if goals_raw.isdigit() else 0,
                    "assists_season": int(assists_raw) if assists_raw.isdigit() else 0,
                }
            )
    return records


def _parse_premierinjuries_table(response) -> list[dict[str, Any]]:
    """Extrae filas de la tabla de `https://www.premierinjuries.com/injury-table.php`."""
    records: list[dict[str, Any]] = []
    current_club = "Premier League Club"

    for tr in response.css("table tr, tr"):
        cells = [c.get_all_text(strip=True) for c in tr.css("th, td")]
        if not cells:
            continue

        if len(cells) == 1 and cells[0]:
            header_lines = [ln.strip() for ln in cells[0].splitlines() if ln.strip()]
            if header_lines and header_lines[0].lower() != "player":
                current_club = header_lines[0]
            continue

        if len(cells) >= 6:
            first_col = _clean_prefixed_cell(cells[0], "Player")
            if not first_col or first_col.lower() == "player":
                continue

            reason = _clean_prefixed_cell(cells[1], "Reason")
            detail = _clean_prefixed_cell(cells[2], "Further Detail")
            potential_return = _clean_prefixed_cell(cells[3], "Potential Return")
            condition = _clean_prefixed_cell(cells[4], "Condition")
            status_raw = _clean_prefixed_cell(cells[5], "Status")

            records.append(
                {
                    "provider": "premierinjuries",
                    "league": "epl",
                    "club": current_club,
                    "player_name": first_col,
                    "reason": reason,
                    "further_detail": detail,
                    "expected_return": potential_return,
                    "condition": condition,
                    "status_raw": status_raw,
                    "status_probability_pct": _parse_status_probability_pct(
                        status_raw, condition
                    ),
                }
            )
    return records


def scrape_premierinjuries_sportsgambler() -> dict[str, Any]:
    """1. Extrae lesiones, sanciones y probabilidades de retorno en PremierInjuries y SportsGambler."""
    scraper = PitchLabScraplingBase("premierinjuries_sportsgambler")
    pi_url = "https://www.premierinjuries.com/injury-table.php"
    sg_urls = [
        ("epl", "https://www.sportsgambler.com/injuries/football/"),
        ("laliga", "https://www.sportsgambler.com/injuries/football/spain-la-liga/"),
        ("liga-mx", "https://www.sportsgambler.com/injuries/football/mexico-liga-mx/"),
    ]

    http_trace: list[dict[str, Any]] = []
    sportsgambler_records: list[dict[str, Any]] = []
    premierinjuries_records: list[dict[str, Any]] = []

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        # 1. Probar PremierInjuries con FetcherSession
        pi_resp = session.get(pi_url)
        http_trace.append(
            {"url": pi_url, "mode": "FetcherSession", "status": pi_resp.status}
        )
        if pi_resp.status == 200:
            premierinjuries_records.extend(_parse_premierinjuries_table(pi_resp))

        # 2. Extraer SportsGambler con FetcherSession
        for league_code, sg_url in sg_urls:
            sg_resp = session.get(sg_url)
            http_trace.append(
                {"url": sg_url, "mode": "FetcherSession", "status": sg_resp.status}
            )
            if sg_resp.status == 200:
                parsed = _parse_sportsgambler_injuries(sg_resp)
                for item in parsed:
                    item["league"] = league_code
                sportsgambler_records.extend(parsed)

    # Fallback a StealthySession si PremierInjuries devolvió 403/Challenge
    if not premierinjuries_records:
        try:
            with StealthySession(
                headless=True, solve_cloudflare=True, network_idle=True, block_ads=True
            ) as stealth_session:
                pi_stealth_resp = stealth_session.fetch(pi_url, google_search=False)
                http_trace.append(
                    {
                        "url": pi_url,
                        "mode": "StealthySession",
                        "status": pi_stealth_resp.status,
                    }
                )
                if pi_stealth_resp.status == 200:
                    premierinjuries_records.extend(
                        _parse_premierinjuries_table(pi_stealth_resp)
                    )
        except Exception as exc:
            http_trace.append(
                {"url": pi_url, "mode": "StealthySession", "error": str(exc)}
            )

    all_records = premierinjuries_records + sportsgambler_records
    payload = {
        "captured_at_utc": utc_now_iso(),
        "total_records": len(all_records),
        "premierinjuries_count": len(premierinjuries_records),
        "sportsgambler_count": len(sportsgambler_records),
        "http_trace": http_trace,
        "premierinjuries_records": premierinjuries_records,
        "sportsgambler_records": sportsgambler_records,
    }
    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=sg_urls[0][1],
        label="premierinjuries_sportsgambler_injuries",
        extra_meta={
            "record_count": len(all_records),
            "premierinjuries_count": len(premierinjuries_records),
            "sportsgambler_count": len(sportsgambler_records),
        },
    )
    return {
        "source_id": scraper.source_id,
        "category": scraper.category,
        "path": str(out_path),
        "record_count": len(all_records),
        "sha256": json.loads(out_path.read_text(encoding="utf-8"))["sha256"],
    }


def _parse_nfl_official_injuries(response) -> list[dict[str, Any]]:
    """Extrae filas de las tablas oficiales de lesiones en `https://www.nfl.com/injuries/`."""
    records: list[dict[str, Any]] = []
    team_titles = [
        el.get_all_text(strip=True)
        for el in response.css(".d3-o-section-sub-title")
        if el.get_all_text(strip=True)
    ]
    tables = response.css("table")

    for idx, table in enumerate(tables):
        team_name = team_titles[idx] if idx < len(team_titles) else f"NFL_Team_{idx + 1}"
        for tr in table.css("tbody tr"):
            tds = [td.get_all_text(strip=True) for td in tr.css("td")]
            if len(tds) < 4:
                continue
            player_name = tds[0]
            if not player_name or player_name.lower() == "player":
                continue
            records.append(
                {
                    "team": team_name,
                    "player_name": player_name,
                    "position": tds[1] if len(tds) > 1 else "",
                    "injuries": tds[2] if len(tds) > 2 else "",
                    "practice_status": tds[3] if len(tds) > 3 else "",
                    "game_status_designation": tds[4] if len(tds) > 4 else "",
                }
            )
    return records


def _parse_ourlads_depth_charts(response) -> list[dict[str, Any]]:
    """Extrae titulares (rank 1) y suplentes (rank 2/3) por posición de Ourlads NFL Depth Charts."""
    records: list[dict[str, Any]] = []
    for tr in response.css("table tbody tr"):
        tds = [td.get_all_text(strip=True) for td in tr.css("td")]
        if len(tds) < 6:
            continue
        team_abbr = tds[0].strip()
        position = tds[1].strip()
        starter = tds[3].strip()
        if not team_abbr or len(team_abbr) > 4 or not position or not starter:
            continue

        backup_2 = tds[5].strip() if len(tds) > 5 else ""
        backup_3 = tds[7].strip() if len(tds) > 7 else ""
        records.append(
            {
                "team": team_abbr,
                "position": position,
                "starter_rank_1": starter,
                "starter_jersey": tds[2].strip(),
                "backup_rank_2": backup_2 or None,
                "backup_2_jersey": tds[4].strip() if len(tds) > 4 else None,
                "backup_rank_3": backup_3 or None,
            }
        )
    return records


def scrape_nfl_official_injuries_depth() -> dict[str, Any]:
    """2. Extrae el reporte oficial de lesiones de NFL.com y los Depth Charts de Ourlads."""
    scraper = PitchLabScraplingBase("nfl_official_injuries_depth")
    nfl_injuries_url = "https://www.nfl.com/injuries/"
    ourlads_index_url = "https://www.ourlads.com/nfldepthcharts/"
    ourlads_all_url = "https://www.ourlads.com/nfldepthcharts/depthcharts.aspx"

    http_trace: list[dict[str, Any]] = []
    injury_rows: list[dict[str, Any]] = []
    depth_chart_rows: list[dict[str, Any]] = []
    ourlads_team_links: list[str] = []

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        nfl_resp = session.get(nfl_injuries_url)
        http_trace.append(
            {"url": nfl_injuries_url, "mode": "FetcherSession", "status": nfl_resp.status}
        )
        if nfl_resp.status == 200:
            injury_rows = _parse_nfl_official_injuries(nfl_resp)

        ol_index_resp = session.get(ourlads_index_url)
        http_trace.append(
            {
                "url": ourlads_index_url,
                "mode": "FetcherSession",
                "status": ol_index_resp.status,
            }
        )
        if ol_index_resp.status == 200:
            for a in ol_index_resp.css("a[href*='depthchart/']"):
                href = a.attrib.get("href", "")
                if href and href not in ourlads_team_links:
                    ourlads_team_links.append(href)

        ol_all_resp = session.get(ourlads_all_url)
        http_trace.append(
            {
                "url": ourlads_all_url,
                "mode": "FetcherSession",
                "status": ol_all_resp.status,
            }
        )
        if ol_all_resp.status == 200:
            depth_chart_rows = _parse_ourlads_depth_charts(ol_all_resp)

    total_records = len(injury_rows) + len(depth_chart_rows)
    payload = {
        "captured_at_utc": utc_now_iso(),
        "nfl_injuries_url": nfl_injuries_url,
        "ourlads_index_url": ourlads_index_url,
        "ourlads_all_teams_url": ourlads_all_url,
        "http_trace": http_trace,
        "nfl_injuries_count": len(injury_rows),
        "ourlads_depth_chart_rows_count": len(depth_chart_rows),
        "ourlads_discovered_team_links": ourlads_team_links[:32],
        "nfl_official_injuries": injury_rows,
        "ourlads_depth_charts": depth_chart_rows,
    }
    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=nfl_injuries_url,
        label="nfl_official_injuries_and_ourlads_depth",
        extra_meta={
            "record_count": total_records,
            "nfl_injuries_count": len(injury_rows),
            "ourlads_depth_chart_rows_count": len(depth_chart_rows),
        },
    )
    return {
        "source_id": scraper.source_id,
        "category": scraper.category,
        "path": str(out_path),
        "record_count": total_records,
        "sha256": json.loads(out_path.read_text(encoding="utf-8"))["sha256"],
    }


def _parse_ffs_team_news_items(response) -> list[dict[str, Any]]:
    """Extrae notas de ruedas de prensa, bajas, dudas y XI probable por club en Fantasy Football Scout."""
    clubs_news: list[dict[str, Any]] = []
    for item in response.css("li.team-news-item"):
        h2_nodes = item.css("h2")
        club_name = h2_nodes[0].get_all_text(strip=True) if h2_nodes else ""
        if not club_name:
            continue

        raw_text = item.get_all_text(strip=True)
        lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]

        def _extract_section(start_label: str, stop_labels: set[str]) -> list[str]:
            collected: list[str] = []
            active = False
            for ln in lines:
                if ln.lower().startswith(start_label.lower()):
                    active = True
                    remainder = ln[len(start_label) :].strip(" :")
                    if remainder:
                        collected.append(remainder)
                    continue
                if active:
                    if any(ln.lower().startswith(s.lower()) for s in stop_labels):
                        break
                    collected.append(ln)
            return collected

        stop_tokens = {"next match:", "out:", "doubts:", "banned:", "latest", "predicted"}
        next_match = _extract_section("Next Match:", stop_tokens)
        confirmed_out = _extract_section("Out:", stop_tokens)
        doubts = _extract_section("Doubts:", stop_tokens)
        banned = _extract_section("Banned:", stop_tokens)
        manager_notes = _extract_section("Latest", stop_tokens)

        pitch_players = [
            li.get_all_text(strip=True)
            for li in item.css("ul li")
            if li.get_all_text(strip=True)
        ]

        clubs_news.append(
            {
                "club": club_name,
                "next_match": next_match[0] if next_match else None,
                "predicted_xi": pitch_players[:11],
                "confirmed_absentees": confirmed_out,
                "late_fitness_test_players": doubts,
                "suspended_players": banned,
                "manager_quotes_and_notes": " ".join(manager_notes)[:800],
            }
        )
    return clubs_news


def scrape_ffs_bbc_press_conferences() -> dict[str, Any]:
    """3. Extrae team news y ruedas de prensa de EPL con `extract_markdown_cli` (--ai-targeted) y `FetcherSession`."""
    scraper = PitchLabScraplingBase("ffs_bbc_press_conferences")
    ffs_url = "https://www.fantasyfootballscout.co.uk/team-news/"
    bbc_url = "https://www.bbc.com/sport/football"

    # 1. Ejecutar CLI con --ai-targeted
    md_path = scraper.extract_markdown_cli(
        url=ffs_url, out_name="ffs_epl_team_news_ai_targeted.md"
    )
    markdown_content = md_path.read_text(encoding="utf-8") if md_path.exists() else ""

    # 2. Extraer datos estructurados con FetcherSession en FFS y BBC Sport
    ffs_clubs: list[dict[str, Any]] = []
    bbc_headlines: list[dict[str, Any]] = []
    seen_titles: set[str] = set()

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        ffs_resp = session.get(ffs_url)
        if ffs_resp.status == 200:
            ffs_clubs = _parse_ffs_team_news_items(ffs_resp)

        bbc_resp = session.get(bbc_url)
        if bbc_resp.status == 200:
            for node in bbc_resp.css("h2, h3, a[href*='/sport/football/']"):
                title = node.get_all_text(strip=True)
                if not title or len(title) < 22 or title in seen_titles:
                    continue
                href = node.attrib.get("href", "")
                if not href:
                    links = node.css("a")
                    href = links[0].attrib.get("href", "") if links else ""
                if href.startswith("/"):
                    href = f"https://www.bbc.com{href}"

                seen_titles.add(title)
                lower = title.lower()
                clubs_mentioned = [
                    club
                    for club, kws in EPL_CLUB_KEYWORDS.items()
                    if any(kw in lower for kw in kws)
                ]
                bbc_headlines.append(
                    {
                        "headline": title,
                        "url": href or bbc_url,
                        "clubs_mentioned": clubs_mentioned,
                        "injury_or_press_signal": any(
                            k in lower
                            for k in [
                                "injur",
                                "doubt",
                                "fit",
                                "boss",
                                "manager",
                                "press",
                                "line-up",
                                "suspended",
                                "out",
                            ]
                        ),
                    }
                )

    total_records = len(ffs_clubs) + len(bbc_headlines)
    payload = {
        "captured_at_utc": utc_now_iso(),
        "ffs_url": ffs_url,
        "bbc_url": bbc_url,
        "cli_markdown_file": md_path.name,
        "cli_markdown_char_length": len(markdown_content),
        "cli_markdown_excerpt": markdown_content[:2500],
        "ffs_clubs_count": len(ffs_clubs),
        "bbc_headlines_count": len(bbc_headlines),
        "ffs_team_news": ffs_clubs,
        "bbc_football_headlines": bbc_headlines,
    }
    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=ffs_url,
        label="ffs_bbc_epl_press_conferences",
        extra_meta={
            "record_count": total_records,
            "ffs_clubs_count": len(ffs_clubs),
            "bbc_headlines_count": len(bbc_headlines),
            "cli_markdown_path": str(md_path),
        },
    )
    return {
        "source_id": scraper.source_id,
        "category": scraper.category,
        "path": str(out_path),
        "markdown_path": str(md_path),
        "record_count": total_records,
        "sha256": json.loads(out_path.read_text(encoding="utf-8"))["sha256"],
    }


def scrape_marca_as_laliga_news() -> dict[str, Any]:
    """4. Extrae noticias, partes médicos y convocatorias de LaLiga desde Marca con `extract_markdown_cli` y `FetcherSession`."""
    scraper = PitchLabScraplingBase("marca_as_laliga_news")
    marca_url = "https://www.marca.com/futbol/primera-division.html"

    # 1. Ejecutar CLI con --ai-targeted
    md_path = scraper.extract_markdown_cli(
        url=marca_url, out_name="marca_laliga_ai_targeted.md"
    )
    markdown_content = md_path.read_text(encoding="utf-8") if md_path.exists() else ""

    # 2. Extraer titulares estructurados con FetcherSession
    articles: list[dict[str, Any]] = []
    seen_titles: set[str] = set()

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        resp = session.get(marca_url)
        if resp.status == 200:
            for heading in resp.css("h1, h2, h3, a.ue-c-cover-content__link"):
                title = heading.get_all_text(strip=True)
                if not title or len(title) < 20 or title in seen_titles:
                    continue

                href = heading.attrib.get("href", "")
                if not href:
                    links = heading.css("a")
                    if not links and heading.parent:
                        links = heading.parent.css("a")
                    href = links[0].attrib.get("href", "") if links else ""

                seen_titles.add(title)
                lower = title.lower()
                clubs = [
                    club
                    for club, kws in LALIGA_CLUB_KEYWORDS.items()
                    if any(kw in lower for kw in kws)
                ]
                is_medical = any(
                    k in lower
                    for k in [
                        "lesión",
                        "lesion",
                        "parte médico",
                        "parte medico",
                        "baja",
                        "rotura",
                        "molestias",
                        "quirófano",
                        "recupera",
                    ]
                )
                is_callup_or_xi = any(
                    k in lower
                    for k in [
                        "convocatoria",
                        "convocados",
                        "once",
                        "alineación",
                        "alineacion",
                        "titular",
                        "suplente",
                        "lista",
                    ]
                )
                articles.append(
                    {
                        "headline": title,
                        "url": href or marca_url,
                        "published_at_utc": utc_now_iso(),
                        "clubs_mentioned": clubs,
                        "medical_report_signal": is_medical,
                        "squad_callup_or_lineup_signal": is_callup_or_xi,
                    }
                )

    payload = {
        "captured_at_utc": utc_now_iso(),
        "source_url": marca_url,
        "cli_markdown_file": md_path.name,
        "cli_markdown_char_length": len(markdown_content),
        "cli_markdown_excerpt": markdown_content[:2500],
        "articles_count": len(articles),
        "articles": articles,
    }
    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=marca_url,
        label="marca_laliga_news_medical_callups",
        extra_meta={
            "record_count": len(articles),
            "cli_markdown_path": str(md_path),
            "cli_markdown_chars": len(markdown_content),
        },
    )
    return {
        "source_id": scraper.source_id,
        "category": scraper.category,
        "path": str(out_path),
        "markdown_path": str(md_path),
        "record_count": len(articles),
        "sha256": json.loads(out_path.read_text(encoding="utf-8"))["sha256"],
    }


def scrape_profootballtalk_nfl_news() -> dict[str, Any]:
    """5. Extrae reportes de NFL en ProFootballTalk (NBC Sports) con `extract_markdown_cli` y `FetcherSession`."""
    scraper = PitchLabScraplingBase("profootballtalk_nfl_news")
    pft_url = "https://www.nbcsports.com/nfl/profootballtalk"

    # 1. Ejecutar CLI con --ai-targeted
    md_path = scraper.extract_markdown_cli(
        url=pft_url, out_name="profootballtalk_nfl_ai_targeted.md"
    )
    markdown_content = md_path.read_text(encoding="utf-8") if md_path.exists() else ""

    # 2. Extraer artículos y notas de beat writers con FetcherSession
    reports: list[dict[str, Any]] = []
    seen_titles: set[str] = set()

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        resp = session.get(pft_url)
        if resp.status == 200:
            for node in resp.css("h1, h2, h3, a[href*='/nfl/profootballtalk/']"):
                title = node.get_all_text(strip=True)
                if not title or len(title) < 22 or title in seen_titles:
                    continue

                href = node.attrib.get("href", "")
                if not href:
                    links = node.css("a")
                    href = links[0].attrib.get("href", "") if links else ""

                seen_titles.add(title)
                lower = title.lower()
                teams = [
                    team
                    for team, kws in NFL_TEAM_KEYWORDS.items()
                    if any(kw in lower for kw in kws)
                ]
                injury_or_snap_signal = any(
                    k in lower
                    for k in [
                        "injur",
                        "ir",
                        "questionable",
                        "out",
                        "snap",
                        "pitch count",
                        "limited",
                        "concussion",
                        "hamstring",
                        "ankle",
                        "knee",
                        "practice",
                    ]
                )
                coach_or_coord_signal = any(
                    k in lower
                    for k in [
                        "coach",
                        "coordinator",
                        "fired",
                        "interim",
                        "playcaller",
                        "bench",
                        "starter",
                    ]
                )
                reports.append(
                    {
                        "headline": title,
                        "url": href or pft_url,
                        "published_at_utc": utc_now_iso(),
                        "teams_mentioned": teams,
                        "injury_or_snap_limit_signal": injury_or_snap_signal,
                        "coach_or_coordinator_signal": coach_or_coord_signal,
                    }
                )

    payload = {
        "captured_at_utc": utc_now_iso(),
        "source_url": pft_url,
        "cli_markdown_file": md_path.name,
        "cli_markdown_char_length": len(markdown_content),
        "cli_markdown_excerpt": markdown_content[:2500],
        "reports_count": len(reports),
        "reports": reports,
    }
    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=pft_url,
        label="profootballtalk_nfl_beat_reports",
        extra_meta={
            "record_count": len(reports),
            "cli_markdown_path": str(md_path),
            "cli_markdown_chars": len(markdown_content),
        },
    )
    return {
        "source_id": scraper.source_id,
        "category": scraper.category,
        "path": str(out_path),
        "markdown_path": str(md_path),
        "record_count": len(reports),
        "sha256": json.loads(out_path.read_text(encoding="utf-8"))["sha256"],
    }


def _parse_worldfootball_referees(response, league_code: str) -> list[dict[str, Any]]:
    """Extrae árbitros y promedios de tarjetas/penales por partido de WorldFootball."""
    referees: list[dict[str, Any]] = []
    for tr in response.css("table tr"):
        tds = [c.get_all_text(strip=True) for c in tr.css("td")]
        if len(tds) < 8:
            continue
        name = tds[2] if len(tds) > 2 else ""
        matches_str = tds[4] if len(tds) > 4 else ""
        if not name or not matches_str.isdigit():
            continue

        matches = int(matches_str)
        yellow = int(tds[5]) if len(tds) > 5 and tds[5].isdigit() else 0
        yellow_red = int(tds[6]) if len(tds) > 6 and tds[6].isdigit() else 0
        red = int(tds[7]) if len(tds) > 7 and tds[7].isdigit() else 0
        penalties = int(tds[8]) if len(tds) > 8 and tds[8].isdigit() else 0

        denom = max(1, matches)
        referees.append(
            {
                "league": league_code,
                "referee_name": name,
                "country": tds[3] if len(tds) > 3 else "",
                "games_officiated": matches,
                "yellow_cards_total": yellow,
                "second_yellow_red_total": yellow_red,
                "direct_red_cards_total": red,
                "penalties_total": penalties,
                "yellow_cards_per_game": round(yellow / denom, 3),
                "red_cards_per_game": round((yellow_red + red) / denom, 3),
                "penalties_per_game": round(penalties / denom, 3),
            }
        )
    return referees


def _parse_nflpenalties_referees(response) -> list[dict[str, Any]]:
    """Extrae estadísticas por cuadrilla arbitral en `https://www.nflpenalties.com/all-referees.php`."""
    crews: list[dict[str, Any]] = []
    for tr in response.css("table tbody tr, table tr"):
        tds = [c.get_all_text(strip=True) for c in tr.css("td")]
        if len(tds) < 12:
            continue
        ref_name = tds[0]
        games_str = tds[1]
        if not ref_name or not games_str.isdigit():
            continue

        def _to_float(val: str) -> float | None:
            try:
                return float(val)
            except (ValueError, TypeError):
                return None

        crews.append(
            {
                "league": "nfl",
                "referee_name": ref_name,
                "games_officiated": int(games_str),
                "total_penalties": int(tds[2]) if tds[2].isdigit() else None,
                "total_yards": int(tds[3]) if tds[3].isdigit() else None,
                "total_dismissed": int(tds[4]) if tds[4].isdigit() else None,
                "total_flags": int(tds[5]) if tds[5].isdigit() else None,
                "home_penalties_total": int(tds[6]) if tds[6].isdigit() else None,
                "away_penalties_total": int(tds[7]) if tds[7].isdigit() else None,
                "nfl_penalties_per_game": _to_float(tds[8]),
                "nfl_penalty_yards_per_game": _to_float(tds[9]),
                "dismissed_per_game": _to_float(tds[10]),
                "total_flags_per_game": _to_float(tds[11]),
                "home_penalties_per_game": _to_float(tds[12]) if len(tds) > 12 else None,
                "away_penalties_per_game": _to_float(tds[13]) if len(tds) > 13 else None,
            }
        )
    return crews


def _parse_nflpenalties_teams(response) -> list[dict[str, Any]]:
    """Extrae resumen de castigos por equipo en `https://www.nflpenalties.com/`."""
    teams: list[dict[str, Any]] = []
    for tr in response.css("table tbody tr, table tr"):
        tds = [c.get_all_text(strip=True) for c in tr.css("td")]
        if len(tds) < 13:
            continue
        team_name = tds[0]
        games_str = tds[1]
        if not team_name or not games_str.isdigit():
            continue
        games = max(1, int(games_str))
        against_count = int(tds[3]) if tds[3].isdigit() else 0
        against_yards = int(tds[4]) if tds[4].isdigit() else 0
        teams.append(
            {
                "team": team_name,
                "games": int(games_str),
                "plays": int(tds[2]) if tds[2].isdigit() else None,
                "penalties_against_count": against_count,
                "penalties_against_yards": against_yards,
                "penalties_beneficiary_count": int(tds[5]) if tds[5].isdigit() else None,
                "penalties_per_game": round(against_count / games, 2),
                "penalty_yards_per_game": round(against_yards / games, 2),
            }
        )
    return teams


def scrape_worldfootball_nflpenalties_referees() -> dict[str, Any]:
    """6. Extrae estadísticas arbitrales en WorldFootball (EPL/Liga MX) y NFLPenalties."""
    scraper = PitchLabScraplingBase("worldfootball_nflpenalties_referees")
    wf_urls = [
        ("epl", "https://www.worldfootball.net/referees/eng-premier-league-2025-2026/1/"),
        ("liga-mx", "https://www.worldfootball.net/referees/mex-primera-division-2025-2026-apertura/1/"),
    ]
    nflp_home_url = "https://www.nflpenalties.com/"
    nflp_refs_url = "https://www.nflpenalties.com/all-referees.php?year=2025"

    http_trace: list[dict[str, Any]] = []
    soccer_referees: list[dict[str, Any]] = []
    nfl_referee_crews: list[dict[str, Any]] = []
    nfl_team_penalties: list[dict[str, Any]] = []

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        # 1. Probar WorldFootball con FetcherSession
        for league_code, wf_url in wf_urls:
            wf_resp = session.get(wf_url)
            http_trace.append(
                {"url": wf_url, "mode": "FetcherSession", "status": wf_resp.status}
            )
            if wf_resp.status == 200:
                soccer_referees.extend(_parse_worldfootball_referees(wf_resp, league_code))

        # 2. Extraer NFLPenalties (home + all-referees)
        np_home_resp = session.get(nflp_home_url)
        http_trace.append(
            {
                "url": nflp_home_url,
                "mode": "FetcherSession",
                "status": np_home_resp.status,
            }
        )
        if np_home_resp.status == 200:
            nfl_team_penalties = _parse_nflpenalties_teams(np_home_resp)

        np_refs_resp = session.get(nflp_refs_url)
        http_trace.append(
            {
                "url": nflp_refs_url,
                "mode": "FetcherSession",
                "status": np_refs_resp.status,
            }
        )
        if np_refs_resp.status == 200:
            nfl_referee_crews = _parse_nflpenalties_referees(np_refs_resp)

    # Fallback a StealthySession si WorldFootball devolvió 403/Turnstile
    if not soccer_referees:
        try:
            with StealthySession(
                headless=True, solve_cloudflare=True, network_idle=True, block_ads=True
            ) as stealth_session:
                for league_code, wf_url in wf_urls:
                    try:
                        wf_stealth = stealth_session.fetch(wf_url, google_search=False)
                        http_trace.append(
                            {
                                "url": wf_url,
                                "mode": "StealthySession",
                                "status": wf_stealth.status,
                            }
                        )
                        if wf_stealth.status == 200:
                            soccer_referees.extend(
                                _parse_worldfootball_referees(wf_stealth, league_code)
                            )
                    except Exception as inner_exc:
                        http_trace.append(
                            {
                                "url": wf_url,
                                "mode": "StealthySession",
                                "error": str(inner_exc),
                            }
                        )
        except Exception as exc:
            http_trace.append(
                {"url": wf_urls[0][1], "mode": "StealthySession", "error": str(exc)}
            )

    total_records = (
        len(soccer_referees) + len(nfl_referee_crews) + len(nfl_team_penalties)
    )
    payload = {
        "captured_at_utc": utc_now_iso(),
        "worldfootball_urls": [u for _, u in wf_urls],
        "nflpenalties_urls": [nflp_home_url, nflp_refs_url],
        "http_trace": http_trace,
        "soccer_referees_count": len(soccer_referees),
        "nfl_referee_crews_count": len(nfl_referee_crews),
        "nfl_team_penalties_count": len(nfl_team_penalties),
        "soccer_referees": soccer_referees,
        "nfl_referee_crews": nfl_referee_crews,
        "nfl_team_penalties": nfl_team_penalties,
    }
    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=wf_urls[0][1],
        label="worldfootball_nflpenalties_referees",
        extra_meta={
            "record_count": total_records,
            "soccer_referees_count": len(soccer_referees),
            "nfl_referee_crews_count": len(nfl_referee_crews),
            "nfl_team_penalties_count": len(nfl_team_penalties),
        },
    )
    return {
        "source_id": scraper.source_id,
        "category": scraper.category,
        "path": str(out_path),
        "record_count": total_records,
        "sha256": json.loads(out_path.read_text(encoding="utf-8"))["sha256"],
    }


def run_wave2_context_scrapers() -> list[dict[str, Any]]:
    """Ejecuta los 6 scrapers de contexto de la Ola 2 (Categorías 3, 4 y 5) y devuelve el resumen."""
    results = [
        scrape_premierinjuries_sportsgambler(),
        scrape_nfl_official_injuries_depth(),
        scrape_ffs_bbc_press_conferences(),
        scrape_marca_as_laliga_news(),
        scrape_profootballtalk_nfl_news(),
        scrape_worldfootball_nflpenalties_referees(),
    ]
    print(json.dumps(results, indent=2, ensure_ascii=False))
    return results


if __name__ == "__main__":
    run_wave2_context_scrapers()
