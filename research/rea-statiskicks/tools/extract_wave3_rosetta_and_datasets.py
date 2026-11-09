import html
import json
import re
from pathlib import Path

ROOT = Path(r"c:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\REA-stats")
EVIDENCE = ROOT / "evidence"
CAPTURES = EVIDENCE / "captures"
SCHEMAS = EVIDENCE / "network-schemas"


def read_doc(name: str) -> str:
    p = CAPTURES / name
    if p.exists():
        return p.read_text(encoding="utf-8", errors="replace")
    raise FileNotFoundError(str(p))


def decode_js_single_quoted_json(s: str):
    s2 = s.replace(r"\/", "/").encode("raw_unicode_escape").decode("unicode_escape")
    return json.loads(s2)


# 1. Extract playersFilterDraft from 07-players.html
phtml = html.unescape(read_doc("07-players.html"))
m = re.search(r"playersFilterDraft\(JSON\.parse\('([^']+)'\)\)", phtml)
draft = {}
scout_meta = {}
if m:
    draft = decode_js_single_quoted_json(m.group(1))
    (SCHEMAS / "players-filter-draft-config.json").write_text(
        json.dumps(draft, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print("Saved players-filter-draft-config.json")
    for reg_obj in draft.get("leagueCatalogGrouped", []):
        region = reg_obj.get("region")
        for c_obj in reg_obj.get("countries", []):
            for lg in c_obj.get("leagues", []):
                oid = lg.get("id")
                scout_meta[oid] = {
                    "region": region,
                    "country_opta": c_obj.get("country"),
                    "country_es": c_obj.get("label"),
                    "flag_alpha2": c_obj.get("alpha2"),
                    "gender": lg.get("gender"),
                    "is_scout_free_tier": lg.get("is_scout", True),
                    "default_season": (draft.get("leagueDefaultSeasonLabel") or {}).get(oid),
                    "season_coverage": (draft.get("leagueSeasonCoverage") or {}).get(oid),
                }

# 2. Parse all 40 league cards from 10-leagues.html
lhtml = read_doc("10-leagues.html")
nav_end = lhtml.find("</nav>")
leagues_by_oid = {}
for m_card in re.finditer(
    r'<a[^>]*class="[^"]*league-card[^"]*"[^>]*wire:key="league-([^"]+)"[^>]*>(.*?)</a>',
    lhtml[nav_end:],
    re.S,
):
    oid, body = m_card.group(1), m_card.group(2)
    m_img = re.search(r"/storage/media/leagues/(\d+)\.png", body)
    api_id = int(m_img.group(1)) if m_img else None
    locked = ("league-card--locked" in body) or ("bi-lock" in body)
    m_name = re.search(r'class="[^"]*league-card__name[^"]*"[^>]*>(.*?)</', body, re.S)
    m_country = re.search(r'class="[^"]*league-card__(?:country|meta)[^"]*"[^>]*>(.*?)</', body, re.S)
    clean_text = [re.sub(r"<[^>]+>", "", x).strip() for x in re.findall(r">([^<]+)<", body) if re.sub(r"<[^>]+>", "", x).strip()]
    name_txt = re.sub(r"<[^>]+>|\s+", " ", m_name.group(1)).strip() if m_name else (clean_text[0] if clean_text else oid)
    country_txt = re.sub(r"<[^>]+>|\s+", " ", m_country.group(1)).strip() if m_country else (clean_text[1] if len(clean_text) > 1 else None)
    sm = scout_meta.get(oid, {})
    leagues_by_oid[oid] = {
        "opta_competition_uuid": oid,
        "api_football_league_id": api_id,
        "name": name_txt,
        "country": country_txt or sm.get("country_opta"),
        "country_es": sm.get("country_es"),
        "region": sm.get("region"),
        "flag_alpha2": sm.get("flag_alpha2"),
        "gender": sm.get("gender") or ("female" if "Femen" in name_txt or "Women" in name_txt or "NWSL" in name_txt else "male"),
        "is_scout_free_tier": not locked,
        "locked_in_fan_tier": locked,
        "logo_url": f"https://www.statiskicks.com/storage/media/leagues/{api_id}.png" if api_id else None,
        "url": f"https://www.statiskicks.com/league/{oid}",
        "default_season": sm.get("default_season"),
        "season_coverage": sm.get("season_coverage"),
    }

leagues_list = sorted(leagues_by_oid.values(), key=lambda x: (x["locked_in_fan_tier"], x["name"]))
out_file = SCHEMAS / "rosetta-40-leagues-opta-apifootball.json"
out_file.write_text(
    json.dumps(
        {
            "total_leagues": len(leagues_list),
            "free_fan_leagues_count": sum(1 for x in leagues_list if not x["locked_in_fan_tier"]),
            "locked_plus_leagues_count": sum(1 for x in leagues_list if x["locked_in_fan_tier"]),
            "defaultLeagueId": draft.get("defaultLeagueId"),
            "leagues": leagues_list,
        },
        indent=2,
        ensure_ascii=False,
    ),
    encoding="utf-8",
)
print(f"Saved {out_file.name} ({len(leagues_list)} leagues: {sum(1 for x in leagues_list if not x['locked_in_fan_tier'])} free, {sum(1 for x in leagues_list if x['locked_in_fan_tier'])} locked)")

# 3. Extract Team America embedded JSON datasets from 03b-team-full.html
team_raw = read_doc("03b-team-full.html")
for attr_name, out_name in [
    ("data-team-xg-rolling-payload", "team-america-54matches-xg-rolling.json"),
    ("data-team-profile-payload", "team-america-profile-percentiles.json"),
    ("data-team-age-profile-payload", "team-america-age-profile.json"),
    ("data-attribute-charts-payload", "team-america-attribute-charts.json"),
]:
    m_sc = re.search(rf'<script[^>]*{attr_name}[^>]*>(.*?)</script>', team_raw, re.S)
    if m_sc and m_sc.group(1).strip():
        val = m_sc.group(1).strip()
    else:
        m_at = re.search(rf'{attr_name}="(&quot;[^"]+)"', team_raw)
        val = html.unescape(m_at.group(1)).strip() if m_at else ""
    if val:
        data = json.loads(val)
        (SCHEMAS / out_name).write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Saved {out_name} ({len(val)} chars)")
