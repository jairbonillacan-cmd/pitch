"""Scraper Wave 3: Extracción profunda multi-liga (6 Ligas Core + Champions League) con Scrapling exclusivo.

REGLA DE INGENIERÍA:
Exclusivamente utiliza Scrapling (`FetcherSession`, `StealthySession`, `AsyncStealthySession`,
`Selector`) desde `.worktrees\\web-scraping\\.venv\\Scripts\\python.exe` y `PitchLabScraplingBase`
(`scrapers/base_scraper.py`).

Objetivos profundos (Wave 3):
1. `clubelo_transfermarkt_values` (label=`transfermarkt_6leagues_all_clubs_values`):
   Valores de mercado de plantilla completos (~114 clubes) en las 6 ligas (`MEXA`, `GB1`, `ES1`, `L1`, `IT1`, `FR1`).
2. `transfermarkt_injuries` (label=`transfermarkt_6leagues_all_injuries`):
   Todos los jugadores lesionados y sancionados en las 6 ligas (`MEXA`, `GB1`, `ES1`, `L1`, `IT1`, `FR1` + clubes Liga MX).
3. `fotmob` (label=`fotmob_7competitions_full_overview`):
   `__NEXT_DATA__` completo (clasificación, xG, calendario/resultados, estadísticas de equipo y líderes individuales)
   para las 7 competiciones (`Liga MX`, `Premier League`, `LaLiga`, `Bundesliga`, `Serie A`, `Ligue 1`, `Champions League`).
4. `fbref` (label=`fbref_6leagues_and_ligamx_fixtures_xg`):
   Tablas `table.stats_table` completas para `Liga MX Scores & Fixtures` (xG por partido), `LaLiga`, `Bundesliga`,
   `Serie A`, `Ligue 1` y `Champions League`.
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
    """Elimina únicamente snapshots previos que tengan el mismo `label` de Wave 3."""
    src_dir = DATA_RAW_DIR / category / source_id
    if not src_dir.exists():
        return
    for json_file in src_dir.rglob(f"*_{label}_*.json"):
        json_file.unlink(missing_ok=True)


def parse_market_value_eur(raw_val: str | None) -> float | None:
    """Convierte cadenas de Transfermarkt ('1,498.30 M€', '1,36 mil mill. €', '131.18 M€', '450 mil €') a euros."""
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
        # Ej. "1,498.30" (coma miles, punto decimal) vs "1.498,30" (punto miles, coma decimal)
        if num_token.rfind(".") > num_token.rfind(","):
            number_str = num_token.replace(",", "")
        else:
            number_str = num_token.replace(".", "").replace(",", ".")
    elif "," in num_token:
        # Si termina en ,ddd (3 dígitos exactos), es separador de miles; si no (,dd), es decimal
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
# 1. TRANSFERMARKT SQUAD MARKET VALUES (ALL 6 LEAGUES — ~114 CLUBS)
# ===========================================================================
TM_SIX_LEAGUES_STARTSEITE: list[tuple[str, str, str, str]] = [
    (
        "liga-mx",
        "MEXA",
        "Liga MX Apertura",
        "https://www.transfermarkt.mx/liga-mx-apertura/startseite/wettbewerb/MEXA",
    ),
    (
        "epl",
        "GB1",
        "Premier League",
        "https://www.transfermarkt.mx/premier-league/startseite/wettbewerb/GB1",
    ),
    (
        "laliga",
        "ES1",
        "LaLiga",
        "https://www.transfermarkt.mx/laliga/startseite/wettbewerb/ES1",
    ),
    (
        "bundesliga",
        "L1",
        "Bundesliga",
        "https://www.transfermarkt.mx/bundesliga/startseite/wettbewerb/L1",
    ),
    (
        "serie-a",
        "IT1",
        "Serie A",
        "https://www.transfermarkt.mx/serie-a/startseite/wettbewerb/IT1",
    ),
    (
        "ligue-1",
        "FR1",
        "Ligue 1",
        "https://www.transfermarkt.mx/ligue-1/startseite/wettbewerb/FR1",
    ),
]


def _parse_tm_league_clubs_values(
    resp: Any, league_slug: str, comp_code: str, comp_name: str
) -> list[dict[str, Any]]:
    """Extrae todos los clubes y valores de mercado desde `div#yw1 table.items tbody tr`."""
    clubs: list[dict[str, Any]] = []
    seen_clubs: set[str] = set()

    rows = resp.css("div#yw1 table.items > tbody > tr")
    if not rows:
        rows = resp.css("table.items > tbody > tr")

    for tr in rows:
        name_links = [
            n.strip()
            for n in tr.css("td.hauptlink a::text").getall()
            if n and n.strip()
        ]
        club_name = name_links[0] if name_links else None
        if not club_name or club_name in seen_clubs:
            continue

        # Evitar filas de resumen o jugadores individuales si hubiera otra tabla
        club_href = tr.css("td.hauptlink a::attr(href)").get() or ""
        if "/verein/" not in club_href and "/startseite/" not in club_href:
            continue

        zentriert_cells = [
            " ".join(td.css("::text").getall()).strip()
            for td in tr.css("td.zentriert")
        ]
        rechts_cells = [
            " ".join(td.css("::text").getall()).strip()
            for td in tr.css("td.rechts")
        ]
        if not rechts_cells:
            continue

        avg_val_raw = rechts_cells[0] if len(rechts_cells) >= 2 else None
        total_val_raw = rechts_cells[-1] if rechts_cells else None

        # En Transfermarkt: zentriert[0] = escudo (vacío), [1] = plantilla, [2] = edad media, [3] = extranjeros
        non_empty_zentriert = [c for c in zentriert_cells if c]
        if len(zentriert_cells) >= 4:
            squad_raw = zentriert_cells[1]
            age_raw = zentriert_cells[2]
            foreigners_raw = zentriert_cells[3]
        elif len(non_empty_zentriert) >= 3:
            squad_raw, age_raw, foreigners_raw = non_empty_zentriert[:3]
        else:
            squad_raw = non_empty_zentriert[0] if non_empty_zentriert else None
            age_raw = non_empty_zentriert[1] if len(non_empty_zentriert) > 1 else None
            foreigners_raw = non_empty_zentriert[2] if len(non_empty_zentriert) > 2 else None

        squad_size = int(squad_raw) if (squad_raw and squad_raw.isdigit()) else squad_raw
        avg_age = (
            float(age_raw.replace(",", "."))
            if (age_raw and re.match(r"^[0-9]+([.,][0-9]+)?$", age_raw))
            else age_raw
        )
        foreigners = (
            int(foreigners_raw)
            if (foreigners_raw and foreigners_raw.isdigit())
            else foreigners_raw
        )

        verein_match = re.search(r"/verein/(\d+)", club_href)
        club_id = int(verein_match.group(1)) if verein_match else None

        seen_clubs.add(club_name)
        clubs.append(
            {
                "league": league_slug,
                "competition_code": comp_code,
                "competition": comp_name,
                "club_id": club_id,
                "club_name": club_name,
                "club_path": club_href,
                "squad_size": squad_size,
                "average_age": avg_age,
                "foreigners_count": foreigners,
                "average_player_value_raw": avg_val_raw,
                "average_player_value_eur": parse_market_value_eur(avg_val_raw),
                "total_squad_market_value_raw": total_val_raw,
                "total_squad_market_value_eur": parse_market_value_eur(total_val_raw),
            }
        )
    return clubs


def scrape_transfermarkt_6leagues_values() -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """1. Extrae valores de mercado de todos los clubes (~114) de las 6 ligas en Transfermarkt."""
    scraper = PitchLabScraplingBase("clubelo_transfermarkt_values")
    label = "transfermarkt_6leagues_all_clubs_values"
    _remove_previous_label_snapshots(scraper.category, scraper.source_id, label)

    all_clubs: list[dict[str, Any]] = []
    leagues_summary: list[dict[str, Any]] = []
    http_trace: list[dict[str, Any]] = []

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        for league_slug, comp_code, comp_name, url in TM_SIX_LEAGUES_STARTSEITE:
            resp = session.get(url, timeout=30)
            status = getattr(resp, "status", None)
            http_trace.append(
                {
                    "league": league_slug,
                    "competition_code": comp_code,
                    "url": url,
                    "status": status,
                }
            )
            league_clubs = (
                _parse_tm_league_clubs_values(resp, league_slug, comp_code, comp_name)
                if status == 200
                else []
            )
            all_clubs.extend(league_clubs)

            total_league_eur = round(
                sum(
                    float(c["total_squad_market_value_eur"])
                    for c in league_clubs
                    if c.get("total_squad_market_value_eur") is not None
                ),
                2,
            )
            leagues_summary.append(
                {
                    "league": league_slug,
                    "competition_code": comp_code,
                    "competition": comp_name,
                    "url": url,
                    "status": status,
                    "clubs_count": len(league_clubs),
                    "total_league_market_value_eur": total_league_eur,
                }
            )

    payload = {
        "captured_at_utc": utc_now_iso(),
        "competition": "6 Core Leagues (MEXA, GB1, ES1, L1, IT1, FR1)",
        "leagues_count": len(leagues_summary),
        "clubs_count": len(all_clubs),
        "leagues_summary": leagues_summary,
        "http_trace": http_trace,
        "clubs": all_clubs,
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=TM_SIX_LEAGUES_STARTSEITE[0][3],
        label=label,
        extra_meta={
            "leagues_count": len(leagues_summary),
            "clubs_count": len(all_clubs),
            "clubs_per_league": {lg["league"]: lg["clubs_count"] for lg in leagues_summary},
        },
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    mexa_clubs = [c for c in all_clubs if c.get("competition_code") == "MEXA"]
    return (
        {
            "source_id": scraper.source_id,
            "label": label,
            "category": scraper.category,
            "path": str(out_path),
            "records": len(all_clubs),
            "sha256": sha256_val,
        },
        mexa_clubs,
    )


# ===========================================================================
# 2. TRANSFERMARKT INJURIES & SUSPENSIONS (ALL 6 LEAGUES)
# ===========================================================================
TM_SIX_LEAGUES_INJURIES: list[tuple[str, str, str, str, str]] = [
    (
        "epl",
        "GB1",
        "https://www.transfermarkt.mx/premier-league/sperrenundverletzungen/wettbewerb/GB1",
        "https://www.transfermarkt.mx/premier-league/verletztespieler/wettbewerb/GB1/plus/1",
        "https://www.transfermarkt.mx/premier-league/gesperrtespieler/wettbewerb/GB1/plus/1",
    ),
    (
        "laliga",
        "ES1",
        "https://www.transfermarkt.mx/laliga/sperrenundverletzungen/wettbewerb/ES1",
        "https://www.transfermarkt.mx/laliga/verletztespieler/wettbewerb/ES1/plus/1",
        "https://www.transfermarkt.mx/laliga/gesperrtespieler/wettbewerb/ES1/plus/1",
    ),
    (
        "bundesliga",
        "L1",
        "https://www.transfermarkt.mx/bundesliga/sperrenundverletzungen/wettbewerb/L1",
        "https://www.transfermarkt.mx/bundesliga/verletztespieler/wettbewerb/L1/plus/1",
        "https://www.transfermarkt.mx/bundesliga/gesperrtespieler/wettbewerb/L1/plus/1",
    ),
    (
        "serie-a",
        "IT1",
        "https://www.transfermarkt.mx/serie-a/sperrenundverletzungen/wettbewerb/IT1",
        "https://www.transfermarkt.mx/serie-a/verletztespieler/wettbewerb/IT1/plus/1",
        "https://www.transfermarkt.mx/serie-a/gesperrtespieler/wettbewerb/IT1/plus/1",
    ),
    (
        "ligue-1",
        "FR1",
        "https://www.transfermarkt.mx/ligue-1/sperrenundverletzungen/wettbewerb/FR1",
        "https://www.transfermarkt.mx/ligue-1/verletztespieler/wettbewerb/FR1/plus/1",
        "https://www.transfermarkt.mx/ligue-1/gesperrtespieler/wettbewerb/FR1/plus/1",
    ),
    (
        "liga-mx",
        "MEXA",
        "https://www.transfermarkt.mx/liga-mx-apertura/sperrenundverletzungen/wettbewerb/MEXA",
        "https://www.transfermarkt.mx/liga-mx-apertura/verletztespieler/wettbewerb/MEXA/plus/1",
        "https://www.transfermarkt.mx/liga-mx-apertura/gesperrtespieler/wettbewerb/MEXA/plus/1",
    ),
]


def _parse_tm_league_absence_rows(
    response: Any, league_slug: str, comp_code: str, record_type: str = "injury"
) -> list[dict[str, Any]]:
    """Extrae filas de jugadores lesionados o sancionados de `table.items > tbody > tr`."""
    records: list[dict[str, Any]] = []
    for tr in response.css("table.items > tbody > tr"):
        tds = [td.get_all_text(strip=True) for td in tr.css("td")]
        if len(tds) < 7:
            continue

        player_links = [
            a.get_all_text(strip=True)
            for a in tr.css("td.hauptlink a")
            if a.get_all_text(strip=True)
        ]
        player_name = (
            player_links[0]
            if player_links
            else (tds[2] if len(tds) > 2 else tds[0])
        )
        if not player_name:
            continue

        position = tds[3] if len(tds) > 3 else ""

        club_imgs = tr.css("td.zentriert a img")
        club_name = ""
        for img in club_imgs:
            candidate = (img.attrib.get("title") or img.attrib.get("alt") or "").strip()
            if candidate and candidate != player_name:
                club_name = candidate
                break

        age_val: int | None = None
        reason = ""
        since_date: str | None = None
        expected_return: str | None = None
        matches_missed: int | None = None
        raw_mv: str | None = None

        if len(tds) >= 11:
            age_str = tds[5]
            age_val = int(age_str) if age_str.isdigit() else None
            reason = tds[7]
            since_date = tds[8] if tds[8] and tds[8] != "-" else None
            expected_return = tds[9] if tds[9] and tds[9] != "-" else None
            # Revisar columnas finales (pueden incluir partidos perdidos y/o valor de mercado)
            for tail_cell in tds[10:]:
                c_str = tail_cell.strip()
                if not c_str or c_str == "-":
                    continue
                if "€" in c_str or "mil" in c_str.lower() or "mill" in c_str.lower():
                    raw_mv = c_str
                elif c_str.isdigit() and matches_missed is None:
                    matches_missed = int(c_str)
            if raw_mv is None and tds[10] and tds[10] != "-":
                raw_mv = tds[10]
        else:
            reason = tds[5] if len(tds) > 5 else ""
            expected_return = tds[6] if (len(tds) > 6 and tds[6] != "-") else None
            raw_mv = tds[7] if (len(tds) > 7 and tds[7] != "-") else None

        records.append(
            {
                "league": league_slug,
                "competition_code": comp_code,
                "record_type": record_type,
                "player_name": player_name,
                "club": club_name or "Unknown Club",
                "position": position,
                "age": age_val,
                "injury_or_suspension_reason": reason,
                "since_date": since_date,
                "expected_return_date": expected_return,
                "matches_missed": matches_missed,
                "market_value_raw": raw_mv,
                "market_value_eur": parse_market_value_eur(raw_mv),
            }
        )
    return records


def _parse_tm_club_sperren_rows(
    response: Any, club_name: str, league_slug: str, comp_code: str
) -> list[dict[str, Any]]:
    """Extrae bajas por lesión y sanción desde `sperrenundverletzungen/verein/{id}/plus/1`."""
    records: list[dict[str, Any]] = []
    current_section = "injury"
    for tr in response.css("table.items > tbody > tr"):
        tds = [td.get_all_text(strip=True) for td in tr.css("td")]
        if len(tds) == 1 and tds[0]:
            label_lower = tds[0].lower()
            if any(k in label_lower for k in ("riesgo", "risk", "drohend", "apercibid", "tarjetas")):
                current_section = "yellow_card_risk"
            elif any(k in label_lower for k in ("lesion", "injur", "verletz", "bajas")):
                current_section = "injury"
            elif any(k in label_lower for k in ("sancion", "ausf", "suspens", "sperr")):
                current_section = "suspension"
            else:
                current_section = "yellow_card_risk"
            continue

        if len(tds) < 9 or current_section == "yellow_card_risk":
            continue

        player_links = [
            a.get_all_text(strip=True)
            for a in tr.css("td.hauptlink a")
            if a.get_all_text(strip=True)
        ]
        player_name = player_links[0] if player_links else (tds[2] if len(tds) > 2 else "")
        position = tds[3] if len(tds) > 3 else ""
        age = tds[4] if len(tds) > 4 else ""
        reason = tds[5] if len(tds) > 5 else ""
        since_date = tds[6] if len(tds) > 6 else ""
        expected_return = tds[7] if len(tds) > 7 else ""
        matches_missed = tds[8] if len(tds) > 8 else ""
        raw_mv = tds[-1] if tds else ""

        # Descartar filas donde `reason` es un conteo numérico de tarjetas amarillas
        if not player_name or reason.isdigit():
            continue

        records.append(
            {
                "league": league_slug,
                "competition_code": comp_code,
                "record_type": current_section,
                "player_name": player_name,
                "club": club_name,
                "position": position,
                "age": int(age) if age.isdigit() else None,
                "injury_or_suspension_reason": reason,
                "since_date": since_date if (since_date and since_date != "-") else None,
                "expected_return_date": expected_return if (expected_return and expected_return != "-") else None,
                "matches_missed": int(matches_missed) if matches_missed.isdigit() else None,
                "market_value_raw": raw_mv if (raw_mv and raw_mv != "-") else None,
                "market_value_eur": parse_market_value_eur(raw_mv),
            }
        )
    return records


def scrape_transfermarkt_6leagues_injuries(
    mexa_clubs: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """2. Extrae todos los lesionados y sancionados de las 6 ligas en Transfermarkt."""
    scraper = PitchLabScraplingBase("transfermarkt_injuries")
    label = "transfermarkt_6leagues_all_injuries"
    _remove_previous_label_snapshots(scraper.category, scraper.source_id, label)

    raw_records: list[dict[str, Any]] = []
    http_trace: list[dict[str, Any]] = []

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        for (
            league_slug,
            comp_code,
            sperren_url,
            verletzte_url,
            gesperrte_url,
        ) in TM_SIX_LEAGUES_INJURIES:
            # 2A. Sondear la ruta solicitada `/sperrenundverletzungen/wettbewerb/{CODE}`
            resp_sperren = session.get(sperren_url, timeout=25)
            st_sperren = getattr(resp_sperren, "status", None)
            http_trace.append(
                {
                    "league": league_slug,
                    "competition_code": comp_code,
                    "endpoint_type": "sperrenundverletzungen_wettbewerb",
                    "url": sperren_url,
                    "status": st_sperren,
                }
            )
            if st_sperren == 200:
                raw_records.extend(
                    _parse_tm_league_absence_rows(resp_sperren, league_slug, comp_code, "injury")
                )

            # 2B. Extraer tabla detallada de lesionados `/verletztespieler/wettbewerb/{CODE}/plus/1` (páginas 1..3)
            for page_num in (1, 2, 3):
                page_url = (
                    verletzte_url
                    if page_num == 1
                    else f"{verletzte_url}/page/{page_num}"
                )
                resp_inj = session.get(page_url, timeout=25)
                st_inj = getattr(resp_inj, "status", None)
                http_trace.append(
                    {
                        "league": league_slug,
                        "competition_code": comp_code,
                        "endpoint_type": f"verletztespieler_page_{page_num}",
                        "url": page_url,
                        "status": st_inj,
                    }
                )
                if st_inj != 200:
                    break
                page_rows = _parse_tm_league_absence_rows(
                    resp_inj, league_slug, comp_code, "injury"
                )
                raw_records.extend(page_rows)
                # Si hay menos de 25 filas o no existe enlace a la siguiente página, terminar paginación
                has_next_page = bool(
                    resp_inj.css(f"li.tm-pagination__list-item a[href*='page/{page_num + 1}']")
                )
                if len(page_rows) < 25 or not has_next_page:
                    break

            # 2C. Extraer tabla detallada de suspendidos `/gesperrtespieler/wettbewerb/{CODE}/plus/1`
            resp_susp = session.get(gesperrte_url, timeout=25)
            st_susp = getattr(resp_susp, "status", None)
            http_trace.append(
                {
                    "league": league_slug,
                    "competition_code": comp_code,
                    "endpoint_type": "gesperrtespieler_plus_1",
                    "url": gesperrte_url,
                    "status": st_susp,
                }
            )
            if st_susp == 200:
                raw_records.extend(
                    _parse_tm_league_absence_rows(
                        resp_susp, league_slug, comp_code, "suspension"
                    )
                )

        # 2D. Extraer páginas por club de Liga MX (`sperrenundverletzungen/verein/{id}/plus/1`) para obtener `matches_missed`
        mexa_club_targets: list[tuple[str, str]] = []
        if mexa_clubs:
            for c in mexa_clubs:
                c_name = str(c.get("club_name") or "").strip()
                c_path = str(c.get("club_path") or "").strip()
                m_ver = re.search(r"/([^/]+)/startseite/verein/(\d+)", c_path)
                if c_name and m_ver:
                    slug_part, cid = m_ver.group(1), m_ver.group(2)
                    mexa_club_targets.append(
                        (
                            c_name,
                            f"https://www.transfermarkt.mx/{slug_part}/sperrenundverletzungen/verein/{cid}/plus/1",
                        )
                    )
        if not mexa_club_targets:
            mexa_club_targets = [
                (
                    "CF América",
                    "https://www.transfermarkt.mx/cf-america/sperrenundverletzungen/verein/3631/plus/1",
                ),
                (
                    "CD Guadalajara",
                    "https://www.transfermarkt.mx/cd-guadalajara/sperrenundverletzungen/verein/6711/plus/1",
                ),
                (
                    "CD Cruz Azul",
                    "https://www.transfermarkt.mx/cd-cruz-azul/sperrenundverletzungen/verein/3711/plus/1",
                ),
                (
                    "CF Monterrey",
                    "https://www.transfermarkt.mx/cf-monterrey/sperrenundverletzungen/verein/2407/plus/1",
                ),
                (
                    "Tigres UANL",
                    "https://www.transfermarkt.mx/tigres-uanl/sperrenundverletzungen/verein/7055/plus/1",
                ),
            ]

        for club_name, club_url in mexa_club_targets:
            resp_club = session.get(club_url, timeout=25)
            st_club = getattr(resp_club, "status", None)
            http_trace.append(
                {
                    "league": "liga-mx",
                    "competition_code": "MEXA",
                    "endpoint_type": "club_sperrenundverletzungen",
                    "club": club_name,
                    "url": club_url,
                    "status": st_club,
                }
            )
            if st_club == 200:
                raw_records.extend(
                    _parse_tm_club_sperren_rows(resp_club, club_name, "liga-mx", "MEXA")
                )

    # Deduplicar por (league, player_name, record_type) conservando el registro más enriquecido (ej. matches_missed)
    dedup_map: dict[tuple[str, str, str], dict[str, Any]] = {}
    for rec in raw_records:
        key = (
            str(rec.get("league") or ""),
            str(rec.get("player_name") or "").strip().lower(),
            str(rec.get("record_type") or "injury"),
        )
        if not key[1]:
            continue
        existing = dedup_map.get(key)
        if not existing:
            dedup_map[key] = rec
        else:
            # Enriquecer campos faltantes
            for field in (
                "matches_missed",
                "expected_return_date",
                "since_date",
                "market_value_raw",
                "market_value_eur",
                "age",
                "position",
            ):
                if existing.get(field) is None and rec.get(field) is not None:
                    existing[field] = rec[field]
            if existing.get("club") in ("", "Unknown Club") and rec.get("club") not in ("", "Unknown Club"):
                existing["club"] = rec["club"]

    dedup_records = list(dedup_map.values())
    counts_by_league: dict[str, int] = {}
    for r in dedup_records:
        lg = str(r.get("league") or "unknown")
        counts_by_league[lg] = counts_by_league.get(lg, 0) + 1

    payload = {
        "captured_at_utc": utc_now_iso(),
        "total_records": len(dedup_records),
        "raw_extracted_rows": len(raw_records),
        "leagues_covered": [x[0] for x in TM_SIX_LEAGUES_INJURIES],
        "counts_by_league": counts_by_league,
        "http_trace": http_trace,
        "records": dedup_records,
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=TM_SIX_LEAGUES_INJURIES[0][2],
        label=label,
        extra_meta={
            "record_count": len(dedup_records),
            "raw_extracted_rows": len(raw_records),
            "counts_by_league": counts_by_league,
        },
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": scraper.source_id,
        "label": label,
        "category": scraper.category,
        "path": str(out_path),
        "records": len(dedup_records),
        "sha256": sha256_val,
    }


# ===========================================================================
# 3. FOTMOB (ALL 7 COMPETITIONS — LIGA MX, EPL, LALIGA, BUNDESLIGA, SERIE A, LIGUE 1, UCL)
# ===========================================================================
FOTMOB_SEVEN_COMPETITIONS: list[tuple[str, int, str]] = [
    ("liga-mx", 230, "https://www.fotmob.com/leagues/230/overview/liga-mx"),
    ("premier-league", 47, "https://www.fotmob.com/leagues/47/overview/premier-league"),
    ("laliga", 87, "https://www.fotmob.com/leagues/87/overview/laliga"),
    ("bundesliga", 54, "https://www.fotmob.com/leagues/54/overview/bundesliga"),
    ("serie-a", 55, "https://www.fotmob.com/leagues/55/overview/serie-a"),
    ("ligue-1", 53, "https://www.fotmob.com/leagues/53/overview/ligue-1"),
    ("champions-league", 42, "https://www.fotmob.com/leagues/42/overview/champions-league"),
]


def _extract_stat_leader_entries(raw_stat_list: Any, kind: str) -> list[dict[str, Any]]:
    """Normaliza categorías de líderes de jugadores o equipos desde `stats.players` / `stats.teams`."""
    extracted: list[dict[str, Any]] = []
    if not isinstance(raw_stat_list, list):
        return extracted
    for cat in raw_stat_list:
        if not isinstance(cat, dict):
            continue
        top_three = cat.get("topThree") or cat.get("participant") or []
        leaders = []
        if isinstance(top_three, list):
            for p in top_three[:10]:
                if not isinstance(p, dict):
                    continue
                stat_obj = p.get("stat") if isinstance(p.get("stat"), dict) else {}
                leaders.append(
                    {
                        "id": p.get("id"),
                        "name": p.get("name"),
                        "team_id": p.get("teamId"),
                        "team_name": p.get("teamName"),
                        "value": stat_obj.get("value") if stat_obj else p.get("value"),
                        "sub_value": stat_obj.get("subValue") if stat_obj else p.get("subValue"),
                    }
                )
        extracted.append(
            {
                "stat_kind": kind,
                "header": cat.get("header") or cat.get("name") or cat.get("title"),
                "category": cat.get("category") or kind,
                "fetch_all_url": cat.get("fetchAllUrl"),
                "leaders": leaders,
            }
        )
    return extracted


def _extract_fotmob_competition_payload(
    parsed: Any, slug: str, league_id: int, url: str, status_code: int | None
) -> dict[str, Any]:
    if not isinstance(parsed, dict):
        return {
            "league_slug": slug,
            "league_id": league_id,
            "url": url,
            "status": status_code,
            "standings_rows": [],
            "matches": [],
            "top_stat_lists": [],
        }

    page_props = (parsed.get("props") or {}).get("pageProps") or {}
    details = page_props.get("details") or {}
    overview = page_props.get("overview") or {}
    fixtures = page_props.get("fixtures") or {}
    stats_block = page_props.get("stats") or {}
    table_list = page_props.get("table") or overview.get("table") or []

    # 1. Extraer tablas de clasificación (incluyendo xG table si FotMob la incluye en `table.xg`)
    standings_rows: list[dict[str, Any]] = []
    xg_by_team_id: dict[Any, dict[str, Any]] = {}

    if isinstance(table_list, list):
        for tbl_wrapper in table_list:
            if not isinstance(tbl_wrapper, dict):
                continue
            data_obj = tbl_wrapper.get("data") or tbl_wrapper
            inner_table = (data_obj.get("table") or {}) if isinstance(data_obj, dict) else {}

            # Si existe subtabla `xg`, indexar xG y xGA por team_id
            xg_rows = inner_table.get("xg") or []
            if isinstance(xg_rows, list):
                for xr in xg_rows:
                    if isinstance(xr, dict) and xr.get("id") is not None:
                        xg_by_team_id[xr["id"]] = xr

            all_rows = inner_table.get("all") or inner_table.get("home") or []
            if not all_rows and isinstance(data_obj.get("tables"), list):
                for sub_tbl in data_obj["tables"]:
                    if isinstance(sub_tbl, dict):
                        sub_inner = sub_tbl.get("table") or {}
                        for xr in sub_inner.get("xg") or []:
                            if isinstance(xr, dict) and xr.get("id") is not None:
                                xg_by_team_id[xr["id"]] = xr
                        all_rows.extend(sub_inner.get("all") or [])

            for r in all_rows:
                if not isinstance(r, dict):
                    continue
                tid = r.get("id")
                xg_row = xg_by_team_id.get(tid, {})
                standings_rows.append(
                    {
                        "idx": r.get("idx"),
                        "team_id": tid,
                        "team_name": r.get("name") or r.get("shortName"),
                        "played": r.get("played"),
                        "wins": r.get("wins"),
                        "draws": r.get("draws"),
                        "losses": r.get("losses"),
                        "scores_str": r.get("scoresStr"),
                        "goal_conceded": r.get("goalConDiff"),
                        "pts": r.get("pts"),
                        "xg": r.get("xg") if r.get("xg") is not None else xg_row.get("xg"),
                        "xg_conceded": (
                            r.get("xgConceded")
                            if r.get("xgConceded") is not None
                            else xg_row.get("xgConceded")
                        ),
                        "xpts": r.get("xPoints") or xg_row.get("xPoints") or xg_row.get("pts"),
                    }
                )

    # 2. Extraer partidos / fixtures (todos los disponibles o hasta 150 por competición)
    raw_matches = (
        fixtures.get("allMatches")
        or overview.get("leagueOverviewMatches")
        or []
    )
    matches: list[dict[str, Any]] = []
    if isinstance(raw_matches, list):
        for m in raw_matches[:150]:
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

    # 3. Extraer líderes de estadísticas de jugadores Y de equipos
    player_stat_lists = _extract_stat_leader_entries(
        stats_block.get("players") or overview.get("topPlayers") or [],
        kind="player",
    )
    team_stat_lists = _extract_stat_leader_entries(
        stats_block.get("teams") or [],
        kind="team",
    )
    top_stat_lists = player_stat_lists + team_stat_lists

    return {
        "league_slug": slug,
        "league_id": details.get("id") or league_id,
        "league_name": details.get("name") or slug,
        "country": details.get("country"),
        "selected_season": details.get("selectedSeason") or page_props.get("selectedSeason"),
        "url": url,
        "status": status_code,
        "standings_count": len(standings_rows),
        "standings_rows": standings_rows,
        "matches_count": len(matches),
        "matches": matches,
        "player_stat_lists_count": len(player_stat_lists),
        "team_stat_lists_count": len(team_stat_lists),
        "top_stat_lists_count": len(top_stat_lists),
        "player_stat_lists": player_stat_lists,
        "team_stat_lists": team_stat_lists,
        "top_stat_lists": top_stat_lists,
    }


async def scrape_fotmob_7competitions() -> dict[str, Any]:
    """3. Extrae `__NEXT_DATA__` de las 7 competiciones en FotMob (`FetcherSession` + fallback `AsyncStealthySession`)."""
    scraper = PitchLabScraplingBase("fotmob")
    label = "fotmob_7competitions_full_overview"
    _remove_previous_label_snapshots(scraper.category, scraper.source_id, label)

    leagues_data: list[dict[str, Any]] = []
    missing_for_fallback: list[tuple[str, int, str]] = []

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        for slug, league_id, url in FOTMOB_SEVEN_COMPETITIONS:
            try:
                resp = session.get(url, timeout=30)
                nd_raw = resp.css("script#__NEXT_DATA__::text").get()
                parsed = _safe_json_loads(nd_raw)
                entry = _extract_fotmob_competition_payload(
                    parsed, slug, league_id, url, getattr(resp, "status", None)
                )
                if entry.get("standings_count", 0) > 0 or entry.get("matches_count", 0) > 0:
                    leagues_data.append(entry)
                else:
                    missing_for_fallback.append((slug, league_id, url))
            except Exception:
                missing_for_fallback.append((slug, league_id, url))

    if missing_for_fallback:
        async with AsyncStealthySession(
            headless=True, solve_cloudflare=True, block_ads=True, timeout=45000
        ) as stealth_session:
            for slug, league_id, url in missing_for_fallback:
                try:
                    page = await stealth_session.fetch(
                        url,
                        wait_until="domcontentloaded",
                        wait=2500,
                        google_search=False,
                    )
                    nd_raw = page.css("script#__NEXT_DATA__::text").get()
                    parsed = _safe_json_loads(nd_raw)
                    entry = _extract_fotmob_competition_payload(
                        parsed, slug, league_id, url, getattr(page, "status", None)
                    )
                    leagues_data.append(entry)
                except Exception as exc:
                    leagues_data.append(
                        {
                            "league_slug": slug,
                            "league_id": league_id,
                            "url": url,
                            "error": str(exc),
                            "standings_rows": [],
                            "matches": [],
                            "top_stat_lists": [],
                        }
                    )

    total_standings = sum(len(lg.get("standings_rows", [])) for lg in leagues_data)
    total_matches = sum(len(lg.get("matches", [])) for lg in leagues_data)
    total_stats = sum(len(lg.get("top_stat_lists", [])) for lg in leagues_data)
    total_records = total_standings + total_matches + total_stats

    payload = {
        "source": "fotmob",
        "captured_at_utc": utc_now_iso(),
        "target_urls": [u for _, _, u in FOTMOB_SEVEN_COMPETITIONS],
        "summary": {
            "leagues_scraped": len(leagues_data),
            "total_standings_rows": total_standings,
            "total_matches_extracted": total_matches,
            "total_stat_categories": total_stats,
            "total_records": total_records,
        },
        "leagues": leagues_data,
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=FOTMOB_SEVEN_COMPETITIONS[0][2],
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
# 4. FBREF (LIGA MX FIXTURES/SCORES WITH XG + LALIGA, BUNDESLIGA, SERIE A, LIGUE 1, UCL)
# ===========================================================================
FBREF_DEEP_TARGETS: list[tuple[str, str, str]] = [
    (
        "liga-mx-fixtures-xg",
        "https://fbref.com/en/comps/31/schedule/Liga-MX-Scores-and-Fixtures",
        "https://web.archive.org/web/20250212011227/https://fbref.com/en/comps/31/schedule/Liga-MX-Scores-and-Fixtures",
    ),
    (
        "laliga",
        "https://fbref.com/en/comps/12/La-Liga-Stats",
        "https://web.archive.org/web/20250214000000/https://fbref.com/en/comps/12/La-Liga-Stats",
    ),
    (
        "bundesliga",
        "https://fbref.com/en/comps/20/Bundesliga-Stats",
        "https://web.archive.org/web/20250214000000/https://fbref.com/en/comps/20/Bundesliga-Stats",
    ),
    (
        "serie-a",
        "https://fbref.com/en/comps/11/Serie-A-Stats",
        "https://web.archive.org/web/20250214000000/https://fbref.com/en/comps/11/Serie-A-Stats",
    ),
    (
        "ligue-1",
        "https://fbref.com/en/comps/13/Ligue-1-Stats",
        "https://web.archive.org/web/20250214000000/https://fbref.com/en/comps/13/Ligue-1-Stats",
    ),
    (
        "champions-league",
        "https://fbref.com/en/comps/8/Champions-League-Stats",
        "https://web.archive.org/web/20250214000000/https://fbref.com/en/comps/8/Champions-League-Stats",
    ),
]


def _parse_fbref_deep_tables(page: Selector) -> list[dict[str, Any]]:
    """Extrae tanto tablas de estadísticas por equipo (`stats_squads`, `results`) como fixtures (`sched_`)."""
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
    for idx, tbl in enumerate(raw_tables[:15]):
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

            # Si es una fila de partido (Scores & Fixtures con `home_team` y `away_team`)
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
                    "rows": rows_data[:400],
                }
            )
    return tables_out


def scrape_fbref_6leagues_and_fixtures() -> dict[str, Any]:
    """4. Extrae `table.stats_table` de FBref (Liga MX Fixtures xG + LaLiga, Bundesliga, Serie A, Ligue 1, UCL)."""
    scraper = PitchLabScraplingBase("fbref")
    label = "fbref_6leagues_and_ligamx_fixtures_xg"
    _remove_previous_label_snapshots(scraper.category, scraper.source_id, label)

    comps_extracted: list[dict[str, Any]] = []
    total_rows = 0
    fixture_rows_count = 0

    with StealthySession(
        headless=True,
        solve_cloudflare=True,
        network_idle=True,
        block_ads=True,
        timeout=60000,
    ) as stealth_session:
        for comp_slug, live_url, archive_url in FBREF_DEEP_TARGETS:
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

            tables = _parse_fbref_deep_tables(page) if page else []

            if not tables:
                try:
                    with FetcherSession(impersonate="chrome", stealthy_headers=True) as fs:
                        arch_resp = fs.get(archive_url, timeout=30)
                        tables = _parse_fbref_deep_tables(arch_resp)
                        if tables:
                            page = arch_resp
                            used_archive = True
                except Exception:
                    pass

            comp_rows_count = sum(len(t.get("rows", [])) for t in tables)
            total_rows += comp_rows_count
            if "fixtures" in comp_slug or "schedule" in live_url:
                fixture_rows_count += comp_rows_count

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
        "target_urls": [u for _, u, _ in FBREF_DEEP_TARGETS],
        "summary": {
            "competitions_scraped": len(comps_extracted),
            "total_tables_extracted": sum(c.get("tables_count", 0) for c in comps_extracted),
            "ligamx_fixture_rows_extracted": fixture_rows_count,
            "total_stat_and_fixture_rows": total_rows,
        },
        "competitions": comps_extracted,
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=FBREF_DEEP_TARGETS[0][1],
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
    print(f"[{utc_now_iso()}] Iniciando Wave 3 Deep Six Leagues Extraction con Scrapling...")
    results: list[dict[str, Any]] = []

    print("-> [1/4] Transfermarkt: Valores de mercado de plantillas en las 6 ligas (~114 clubes)...")
    tm_val_res, mexa_clubs = scrape_transfermarkt_6leagues_values()
    results.append(tm_val_res)
    print(
        f"   OK: {tm_val_res['records']} clubes extraídos | sha256={tm_val_res['sha256'][:12]}"
    )

    print("-> [2/4] Transfermarkt: Lesionados y sancionados en las 6 ligas...")
    tm_inj_res = scrape_transfermarkt_6leagues_injuries(mexa_clubs=mexa_clubs)
    results.append(tm_inj_res)
    print(
        f"   OK: {tm_inj_res['records']} bajas extraídas | sha256={tm_inj_res['sha256'][:12]}"
    )

    print("-> [3/4] FotMob: 7 competiciones completas (__NEXT_DATA__ tablas, partidos, líderes)...")
    fotmob_res = asyncio.run(scrape_fotmob_7competitions())
    results.append(fotmob_res)
    print(
        f"   OK: {fotmob_res['records']} registros extraídos | sha256={fotmob_res['sha256'][:12]}"
    )

    print("-> [4/4] FBref: Liga MX Scores & Fixtures (xG) + LaLiga, Bundesliga, Serie A, Ligue 1, UCL...")
    fbref_res = scrape_fbref_6leagues_and_fixtures()
    results.append(fbref_res)
    print(
        f"   OK: {fbref_res['records']} filas extraídas | sha256={fbref_res['sha256'][:12]}"
    )

    print("\n=== RESUMEN WAVE 3 DEEP SIX LEAGUES ===")
    for r in results:
        print(
            f"- {r['source_id']} ({r['label']}): records={r['records']} | "
            f"sha256={r['sha256']} | path={r['path']}"
        )


if __name__ == "__main__":
    main()
