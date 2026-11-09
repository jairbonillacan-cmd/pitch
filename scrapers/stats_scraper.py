"""Scraper de Categoría 2 (`advanced_stats_xg`) con Scrapling exclusivo.

Extrae datos reales y guarda snapshots inmutables sellados con `captured_at_utc` y `sha256`
en `data/raw/advanced_stats_xg/{source_id}/`:
1. `statiskicks` (`https://www.statiskicks.com/`)
2. `opta_player_stats` (`https://optaplayerstats.statsperform.com/`)
3. `clubelo_transfermarkt_values` (`http://api.clubelo.com/...` / `https://clubelo.com/` + Transfermarkt Liga MX `MEXA`)
4. `understat` (`https://understat.com/league/EPL`)
"""

from __future__ import annotations

import asyncio
import csv
import io
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

from scrapers.base_scraper import DATA_RAW_DIR, PitchLabScraplingBase, utc_now_iso


def _response_text(resp: Any) -> str:
    """Convierte el cuerpo de un Response de Scrapling a texto UTF-8 seguro."""
    body = getattr(resp, "body", b"")
    if isinstance(body, bytes):
        return body.decode("utf-8", errors="replace")
    if isinstance(body, str):
        return body
    text = getattr(resp, "text", "")
    return str(text or "")


def _parse_eur_value(raw_val: str) -> float | None:
    """Convierte cadenas como '131.18 M€', '85,50 mill. €' o '450 mil €' a euros numéricos."""
    if not raw_val:
        return None
    cleaned = raw_val.strip().lower().replace("€", "").strip()
    multiplier = 1.0
    if "mill" in cleaned or re.search(r"\bm\b", cleaned):
        multiplier = 1_000_000.0
    elif "mil" in cleaned or re.search(r"\bk\b", cleaned):
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


def _decode_understat_js_var(escaped_str: str) -> Any:
    """Decodifica cadenas hexadecimales \\xNN de Understat (`JSON.parse('...')`)."""
    raw_bytes = escaped_str.encode("utf-8").decode("unicode_escape").encode("latin1")
    return json.loads(raw_bytes.decode("utf-8", errors="replace"))


async def scrape_statiskicks() -> dict[str, Any]:
    """1. Extrae estructura, métricas expuestas y tráfico de red de Statiskicks."""
    scraper = PitchLabScraplingBase("statiskicks")
    url = "https://www.statiskicks.com/"

    network_calls: list[dict[str, Any]] = []
    page = None

    async with AsyncStealthySession(
        headless=True,
        solve_cloudflare=True,
        record_requests=True,
        block_ads=True,
    ) as session:
        page = await session.fetch(url, network_idle=True)

    for net_resp in session.network.search(url_pattern=r".*", limit=None):
        rtype = net_resp.meta.get("resource_type", "")
        body_text = _response_text(net_resp)
        is_api_or_json = (
            rtype in {"xhr", "fetch"}
            or "json" in net_resp.url.lower()
            or "api" in net_resp.url.lower()
            or body_text.lstrip().startswith(("{", "["))
        )
        entry: dict[str, Any] = {
            "network_id": net_resp.meta.get("network_id"),
            "url": net_resp.url,
            "status": net_resp.status,
            "resource_type": rtype,
        }
        if is_api_or_json and body_text:
            try:
                entry["json_preview"] = json.loads(body_text[:50000])
            except Exception:
                entry["body_preview"] = body_text[:1000]
        network_calls.append(entry)

    title = page.css("title::text").get() if page else None
    headings = [
        h.strip()
        for h in (page.css("h1::text, h2::text, h3::text, h4::text").getall() if page else [])
        if h and h.strip()
    ]
    links = []
    if page:
        for a in page.css("a"):
            href = a.attrib.get("href", "").strip()
            text = " ".join(a.css("::text").getall()).strip()
            if href:
                links.append({"text": text, "href": href})

    scripts = []
    if page:
        for s in page.css("script"):
            src = s.attrib.get("src", "").strip()
            inline = (s.css("::text").get() or "").strip()
            if src or inline:
                scripts.append(
                    {
                        "src": src or None,
                        "inline_preview": inline[:500] if inline else None,
                    }
                )

    meta_tags = []
    if page:
        for m in page.css("meta"):
            name = m.attrib.get("name") or m.attrib.get("property")
            content = m.attrib.get("content")
            if name and content:
                meta_tags.append({"name": name, "content": content})

    sections_text = [
        t.strip()
        for t in (page.css("p::text, span::text, li::text, button::text").getall() if page else [])
        if t and len(t.strip()) > 3
    ]

    payload = {
        "site_title": title,
        "headings": headings,
        "meta_tags": meta_tags,
        "navigation_links": links[:100],
        "exposed_text_blocks": sections_text[:150],
        "scripts_summary": scripts[:50],
        "network_captured_count": len(network_calls),
        "network_requests": network_calls[:100],
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=url,
        label="statiskicks_portal",
        extra_meta={
            "headings_count": len(headings),
            "links_count": len(links),
            "network_captured_count": len(network_calls),
        },
    )
    return {
        "source_id": "statiskicks",
        "path": str(out_path),
        "records": len(links) + len(headings) + len(network_calls),
        "sha256": json.loads(out_path.read_text(encoding="utf-8"))["sha256"],
    }


async def scrape_opta_player_stats() -> dict[str, Any]:
    """2. Extrae portal Opta Player Stats (Stats Perform), llamadas performfeeds/statsperform y DOM."""
    scraper = PitchLabScraplingBase("opta_player_stats")
    url = "https://optaplayerstats.statsperform.com/"

    page = None
    all_network: list[dict[str, Any]] = []
    perform_feeds: list[dict[str, Any]] = []

    async with AsyncStealthySession(
        headless=True,
        solve_cloudflare=True,
        record_requests=True,
        block_ads=True,
    ) as session:
        page = await session.fetch(url, network_idle=True)

    for net_resp in session.network.search(url_pattern=r".*", limit=None):
        rtype = net_resp.meta.get("resource_type", "")
        body_text = _response_text(net_resp)
        item: dict[str, Any] = {
            "network_id": net_resp.meta.get("network_id"),
            "url": net_resp.url,
            "status": net_resp.status,
            "resource_type": rtype,
        }
        if (
            "performfeeds.com" in net_resp.url
            or "statsperform.com" in net_resp.url
            or "opta" in net_resp.url.lower()
            or rtype in {"xhr", "fetch"}
        ):
            if body_text:
                try:
                    item["parsed_json"] = json.loads(body_text[:100000])
                except Exception:
                    item["body_preview"] = body_text[:1500]
            perform_feeds.append(item)
        all_network.append(
            {
                "network_id": net_resp.meta.get("network_id"),
                "url": net_resp.url,
                "status": net_resp.status,
                "resource_type": rtype,
            }
        )

    title = page.css("title::text").get() if page else None
    headings = [
        h.strip()
        for h in (page.css("h1::text, h2::text, h3::text, h4::text").getall() if page else [])
        if h and h.strip()
    ]

    widgets_and_configs = []
    if page:
        for el in page.css("[class*='opta'], [id*='opta'], [data-widget], opta-widget, iframe"):
            widgets_and_configs.append(
                {
                    "tag": getattr(el, "tag", None),
                    "attrib": dict(el.attrib),
                    "text": " ".join(el.css("::text").getall()).strip()[:300],
                }
            )

    tables_extracted = []
    if page:
        for tbl in page.css("table"):
            headers = [th.strip() for th in tbl.css("th::text").getall() if th.strip()]
            rows = []
            for tr in tbl.css("tbody tr")[:50]:
                cells = [
                    " ".join(td.css("::text").getall()).strip()
                    for td in tr.css("td, th")
                ]
                if any(cells):
                    rows.append(cells)
            tables_extracted.append({"headers": headers, "rows": rows})

    links = []
    if page:
        for a in page.css("a"):
            href = a.attrib.get("href", "").strip()
            text = " ".join(a.css("::text").getall()).strip()
            if href:
                links.append({"text": text, "href": href})

    scripts = []
    if page:
        for s in page.css("script"):
            src = s.attrib.get("src", "").strip()
            inline = (s.css("::text").get() or "").strip()
            if src or inline:
                scripts.append(
                    {
                        "src": src or None,
                        "inline_preview": inline[:800] if inline else None,
                    }
                )

    dom_text_blocks = [
        t.strip()
        for t in (page.css("p::text, span::text, li::text, div::text").getall() if page else [])
        if t and len(t.strip()) > 3
    ]

    payload = {
        "site_title": title,
        "headings": headings,
        "widgets_and_configs": widgets_and_configs,
        "tables": tables_extracted,
        "links": links[:100],
        "scripts": scripts[:60],
        "dom_text_blocks": dom_text_blocks[:150],
        "perform_and_opta_network_responses": perform_feeds[:80],
        "all_network_requests_count": len(all_network),
        "all_network_requests": all_network[:100],
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=url,
        label="opta_player_stats_portal",
        extra_meta={
            "perform_feeds_captured": len(perform_feeds),
            "total_network_requests": len(all_network),
            "tables_count": len(tables_extracted),
            "links_count": len(links),
        },
    )
    return {
        "source_id": "opta_player_stats",
        "path": str(out_path),
        "records": len(perform_feeds) + len(links) + len(tables_extracted),
        "sha256": json.loads(out_path.read_text(encoding="utf-8"))["sha256"],
    }


async def scrape_clubelo_and_transfermarkt() -> list[dict[str, Any]]:
    """3. Extrae ratings ClubElo y valores de plantilla de los 18 clubes de Liga MX en Transfermarkt."""
    scraper = PitchLabScraplingBase("clubelo_transfermarkt_values")
    results: list[dict[str, Any]] = []

    # 3A: ClubElo (intento vía API CSV con FetcherSession + fallback Cloudflare Turnstile con AsyncStealthySession)
    clubelo_api_url = "http://api.clubelo.com/2026-11-09"
    all_clubs: list[dict[str, Any]] = []
    used_url = clubelo_api_url
    fetch_mode_used = "FetcherSession"

    with FetcherSession(impersonate="chrome") as session:
        elo_resp = session.get(clubelo_api_url)
        csv_text = _response_text(elo_resp) if elo_resp.status == 200 else ""

    if csv_text and "Rank,Club" in csv_text:
        reader = csv.DictReader(io.StringIO(csv_text.strip()))
        for row in reader:
            if not row or not row.get("Club"):
                continue
            try:
                elo_val = round(float(row["Elo"]), 2) if row.get("Elo") else None
            except ValueError:
                elo_val = None
            all_clubs.append(
                {
                    "rank": int(row["Rank"]) if (row.get("Rank") or "").isdigit() else row.get("Rank"),
                    "club": row.get("Club"),
                    "country": row.get("Country"),
                    "level": int(row["Level"]) if (row.get("Level") or "").isdigit() else row.get("Level"),
                    "elo": elo_val,
                    "from": row.get("From"),
                    "to": row.get("To"),
                }
            )
    else:
        # Fallback: resolver Cloudflare Turnstile en https://clubelo.com/ con AsyncStealthySession
        used_url = "https://clubelo.com/"
        fetch_mode_used = "AsyncStealthySession(solve_cloudflare=True)"
        async with AsyncStealthySession(
            headless=True, solve_cloudflare=True, block_ads=True
        ) as stealth:
            elo_page = await stealth.fetch(used_url, google_search=False)

        for tr in elo_page.css("table tr"):
            cells = [
                " ".join(td.css("::text").getall()).strip()
                for td in tr.css("td, th")
            ]
            non_empty = [c for c in cells if c]
            if len(non_empty) >= 2:
                # Detectar filas de ranking ClubElo (ej. ['1', 'Liverpool', '1998'] o filas de partidos/equipos)
                elo_match = None
                for c in non_empty:
                    if re.match(r"^[12][0-9]{3}(\.[0-9]+)?$", c.strip()):
                        elo_match = float(c.strip())
                        break
                club_links = [
                    " ".join(a.css("::text").getall()).strip()
                    for a in tr.css("a")
                    if " ".join(a.css("::text").getall()).strip()
                ]
                if elo_match is not None or club_links:
                    all_clubs.append(
                        {
                            "club": club_links[0] if club_links else non_empty[0],
                            "elo": elo_match,
                            "cells": non_empty[:8],
                        }
                    )

    elo_payload = {
        "requested_api_url": clubelo_api_url,
        "resolved_url": used_url,
        "fetch_mode_used": fetch_mode_used,
        "api_status_code": elo_resp.status,
        "total_extracted_rows": len(all_clubs),
        "top_100_records": all_clubs[:100],
    }
    elo_path = scraper.save_raw_snapshot(
        payload=elo_payload,
        url=used_url,
        label="clubelo_ratings",
        extra_meta={
            "requested_api_url": clubelo_api_url,
            "api_status_code": elo_resp.status,
            "fetch_mode_used": fetch_mode_used,
            "total_extracted_rows": len(all_clubs),
        },
    )
    results.append(
        {
            "source_id": "clubelo_transfermarkt_values (clubelo)",
            "path": str(elo_path),
            "records": len(all_clubs),
            "sha256": json.loads(elo_path.read_text(encoding="utf-8"))["sha256"],
        }
    )

    # 3B: Transfermarkt Liga MX Squad Market Values (18 clubes)
    tm_url = "https://www.transfermarkt.mx/liga-mx-apertura/startseite/wettbewerb/MEXA"
    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        tm_page = session.get(tm_url, stealthy_headers=True)

    clubs_market_values: list[dict[str, Any]] = []
    seen_clubs: set[str] = set()

    rows = tm_page.css("div#yw1 table.items tbody tr")
    if not rows:
        rows = tm_page.css("table.items tbody tr")

    for tr in rows:
        name_links = tr.css("td.hauptlink a::text").getall()
        club_name = next((n.strip() for n in name_links if n and n.strip()), None)
        if not club_name or club_name in seen_clubs:
            continue

        club_href = tr.css("td.hauptlink a::attr(href)").get()
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

        squad_size = zentriert_cells[1] if len(zentriert_cells) > 1 else None
        avg_age = zentriert_cells[2] if len(zentriert_cells) > 2 else None
        foreigners = zentriert_cells[3] if len(zentriert_cells) > 3 else None

        seen_clubs.add(club_name)
        clubs_market_values.append(
            {
                "club_name": club_name,
                "club_path": club_href,
                "squad_size": int(squad_size) if (squad_size and squad_size.isdigit()) else squad_size,
                "average_age": float(avg_age.replace(",", "."))
                if (avg_age and re.match(r"^[0-9]+([.,][0-9]+)?$", avg_age))
                else avg_age,
                "foreigners_count": int(foreigners)
                if (foreigners and foreigners.isdigit())
                else foreigners,
                "average_player_value_raw": avg_val_raw,
                "average_player_value_eur": _parse_eur_value(avg_val_raw or ""),
                "total_squad_market_value_raw": total_val_raw,
                "total_squad_market_value_eur": _parse_eur_value(total_val_raw or ""),
            }
        )

    tm_payload = {
        "competition": "Liga MX Apertura (MEXA)",
        "url": tm_url,
        "clubs_count": len(clubs_market_values),
        "clubs": clubs_market_values,
    }
    tm_path = scraper.save_raw_snapshot(
        payload=tm_payload,
        url=tm_url,
        label="transfermarkt_ligamx_values",
        extra_meta={"clubs_count": len(clubs_market_values)},
    )
    results.append(
        {
            "source_id": "clubelo_transfermarkt_values (transfermarkt_ligamx)",
            "path": str(tm_path),
            "records": len(clubs_market_values),
            "sha256": json.loads(tm_path.read_text(encoding="utf-8"))["sha256"],
        }
    )
    return results


async def scrape_understat() -> dict[str, Any]:
    """4. Extrae datos de xG/NPxG/xPTS por equipo de Understat EPL."""
    scraper = PitchLabScraplingBase("understat")
    url = "https://understat.com/league/EPL"
    archive_url = "https://web.archive.org/web/20250214144036/https://understat.com/league/EPL"

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        live_page = session.get(url, stealthy_headers=True)
        html_text = _response_text(live_page)
        live_status = live_page.status
        used_archive_fallback = False

        if "teamsData" not in html_text:
            # El servidor en vivo de Understat muestra página de mantenimiento temporal ("We will come back soon");
            # recuperamos el snapshot íntegro de Understat EPL vía Wayback Machine con FetcherSession.
            archive_page = session.get(archive_url, stealthy_headers=True)
            html_text = _response_text(archive_page)
            used_archive_fallback = True

    teams_summary: list[dict[str, Any]] = []
    matches_sample: list[dict[str, Any]] = []

    teams_match = re.search(r"var\s+teamsData\s*=\s*JSON\.parse\('([^']+)'\)", html_text)
    dates_match = re.search(r"var\s+datesData\s*=\s*JSON\.parse\('([^']+)'\)", html_text)

    if teams_match:
        raw_teams = _decode_understat_js_var(teams_match.group(1))
        for team_id, team_obj in raw_teams.items():
            history = team_obj.get("history", [])
            xg_total = round(sum(float(m.get("xG", 0)) for m in history), 3)
            xga_total = round(sum(float(m.get("xGA", 0)) for m in history), 3)
            npxg_total = round(sum(float(m.get("npxG", 0)) for m in history), 3)
            npxga_total = round(sum(float(m.get("npxGA", 0)) for m in history), 3)
            xpts_total = round(sum(float(m.get("xpts", 0)) for m in history), 3)
            pts_total = sum(int(m.get("pts", 0)) for m in history)
            deep_total = sum(int(m.get("deep", 0)) for m in history)
            ppda_vals = [
                float(m["ppda"]["att"]) / float(m["ppda"]["def"])
                for m in history
                if isinstance(m.get("ppda"), dict) and float(m["ppda"].get("def", 0) or 0) > 0
            ]
            avg_ppda = round(sum(ppda_vals) / len(ppda_vals), 3) if ppda_vals else None

            teams_summary.append(
                {
                    "team_id": team_id,
                    "team_title": team_obj.get("title"),
                    "matches_played": len(history),
                    "pts": pts_total,
                    "xG": xg_total,
                    "xGA": xga_total,
                    "npxG": npxg_total,
                    "npxGA": npxga_total,
                    "npxGD": round(npxg_total - npxga_total, 3),
                    "xPTS": xpts_total,
                    "ppda_avg": avg_ppda,
                    "deep_completions": deep_total,
                    "recent_5_matches": history[-5:],
                }
            )

    if dates_match:
        raw_dates = _decode_understat_js_var(dates_match.group(1))
        if isinstance(raw_dates, list):
            completed = [m for m in raw_dates if m.get("isResult")]
            matches_sample = (completed or raw_dates)[-25:]

    teams_summary.sort(key=lambda x: float(x.get("xPTS", 0) or 0), reverse=True)

    payload = {
        "league": "EPL",
        "primary_url": url,
        "live_http_status": live_status,
        "used_archive_mirror": used_archive_fallback,
        "archive_url": archive_url if used_archive_fallback else None,
        "teams_count": len(teams_summary),
        "teams_xg_table": teams_summary,
        "recent_matches_sample_count": len(matches_sample),
        "recent_matches_sample": matches_sample,
    }
    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=url,
        label="understat_epl_xg",
        extra_meta={
            "teams_count": len(teams_summary),
            "recent_matches_sample_count": len(matches_sample),
            "used_archive_mirror": used_archive_fallback,
        },
    )
    return {
        "source_id": "understat",
        "path": str(out_path),
        "records": len(teams_summary),
        "sha256": json.loads(out_path.read_text(encoding="utf-8"))["sha256"],
    }


def _clean_previous_snapshots() -> None:
    """Limpia snapshots previos de `advanced_stats_xg` para dejar una corrida limpia y reproducible."""
    cat_dir = DATA_RAW_DIR / "advanced_stats_xg"
    if cat_dir.exists():
        for json_file in cat_dir.rglob("*.json"):
            json_file.unlink(missing_ok=True)


async def main() -> None:
    _clean_previous_snapshots()
    print(f"[{utc_now_iso()}] Iniciando extracción Categoría 2 (advanced_stats_xg) con Scrapling...")
    summaries: list[dict[str, Any]] = []

    print("-> [1/4] Extrayendo Statiskicks...")
    summaries.append(await scrape_statiskicks())

    print("-> [2/4] Extrayendo Opta Player Stats...")
    summaries.append(await scrape_opta_player_stats())

    print("-> [3/4] Extrayendo ClubElo & Transfermarkt Liga MX...")
    summaries.extend(await scrape_clubelo_and_transfermarkt())

    print("-> [4/4] Extrayendo Understat EPL...")
    summaries.append(await scrape_understat())

    print("\n=== RESUMEN DE SNAPSHOTS GUARDADOS ===")
    for item in summaries:
        print(
            f"- {item['source_id']}: records={item['records']} | "
            f"sha256={item['sha256']} | path={item['path']}"
        )


if __name__ == "__main__":
    asyncio.run(main())
