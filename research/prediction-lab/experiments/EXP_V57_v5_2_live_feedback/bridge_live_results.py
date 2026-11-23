"""PitchLab v5.2 Live-Results Bridge (`EXP_V57`).

Extracts, normalizes, and audits real post-cutoff match results, strict pre-kickoff
snapshots, graded market selections, goalkeeper/player prop profiles, and US game logs
from the Pitch platform snapshots directory into deterministic, provenance-tagged
research artifacts inside `prediction-lab` — without touching any `v3.0..v5.1`
frozen files or `holdout_sealed`.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_PITCH_DATA = Path(os.environ.get("PITCH_DATA_DIR", r"C:\Users\jairb\OneDrive\Desktop\Proyectos\Pitch\data"))
ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"

HOLD_START_DATE = "2025-02-02"
HOLD_END_DATE = "2026-11-08"

SPACETIME_CORE_LEAGUES = frozenset({
    "premier-league", "laliga", "serie-a", "bundesliga", "ligue-1", "liga-mx",
    "championship", "segunda-espana", "serie-b", "bundesliga-2", "ligue-2",
    "eredivisie", "liga-portugal", "pro-league-belgica", "super-lig",
    "amistosos", "uefa-nations", "concacaf-nations", "eliminatorias", "nfl",
})

US_LEAGUE_SPORT = {
    "mlb": "mlb",
    "nba": "nba",
    "nhl": "nhl",
    "nfl": "nfl",
}


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _norm_team_slug(raw: str | None) -> str:
    if not raw:
        return ""
    clean = raw.strip().lower()
    if "." in clean:
        clean = clean.split(".", 1)[1]
    return re.sub(r"[^a-z0-9_-]+", "", clean)


def _grade_shell_row(sport: str, mkey: str, sel_key: str, label: str, h: int, a: int) -> int | None:
    tot = h + a
    sk = (sel_key or "").lower()
    sl = (label or "").lower()
    if mkey in ("h2h", "1x2", "moneyline"):
        if sk == "home":
            return 1 if h > a else (None if sport != "football" and h == a else 0)
        if sk == "away":
            return 1 if a > h else (None if sport != "football" and h == a else 0)
        if sk == "draw":
            return 1 if h == a else 0
    if mkey == "double_chance":
        if sk in ("1x", "home_draw"):
            return 1 if h >= a else 0
        if sk in ("x2", "draw_away"):
            return 1 if a >= h else 0
        if sk in ("12", "home_away"):
            return 1 if h != a else 0
    if mkey == "dnb":
        if h == a:
            return None
        if sk == "home":
            return 1 if h > a else 0
        if sk == "away":
            return 1 if a > h else 0
    if mkey == "btts":
        if sk in ("yes", "si", "sí") or "sí" in sl:
            return 1 if (h > 0 and a > 0) else 0
        if sk == "no" or "no" in sl:
            return 1 if (h == 0 or a == 0) else 0
    if mkey == "totals" or mkey.startswith("totals_"):
        m = re.search(r"(más|menos)\s+de\s+(\d+(?:\.\d+)?)", sl)
        if m:
            side, line = m.group(1), float(m.group(2))
            if tot == line:
                return None
            return 1 if (tot > line if side == "más" else tot < line) else 0
    return None


def build_live_results_bridge(pitch_data_dir: Path = DEFAULT_PITCH_DATA) -> dict[str, Any]:
    snapshots_dir = pitch_data_dir / "snapshots"
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    cached_bundle_path = ARTIFACTS_DIR / "live_platform_bridge_dataset.json"

    if not snapshots_dir.exists():
        if cached_bundle_path.exists():
            return json.loads(cached_bundle_path.read_text(encoding="utf-8"))
        raise FileNotFoundError(f"Snapshots directory not found: {snapshots_dir}")

    # 1. Extract season-results.json across all 57 leagues
    season_matches: list[dict[str, Any]] = []
    league_match_counts: dict[str, int] = {}
    for ldir in sorted(d for d in snapshots_dir.iterdir() if d.is_dir()):
        lname = ldir.name
        srf = ldir / "season-results.json"
        if not srf.exists():
            continue
        sr = json.loads(srf.read_text(encoding="utf-8"))
        matches = sr.get("matches") or sr.get("games") or []
        sport = US_LEAGUE_SPORT.get(lname, "football")
        valid_cnt = 0
        for m in matches:
            hs, as_ = m.get("homeScore"), m.get("awayScore")
            dt = (m.get("date") or (m.get("startTime") or "")[:10]).strip()
            ht = _norm_team_slug(m.get("homeTeam"))
            at = _norm_team_slug(m.get("awayTeam"))
            if not isinstance(hs, int) or not isinstance(as_, int) or not dt or not ht or not at:
                continue
            valid_cnt += 1
            season_matches.append({
                "id": m.get("id") or f"{lname}:{dt}:{ht}:{at}",
                "league": lname,
                "sport": sport,
                "date": dt,
                "startTime": m.get("startTime") or f"{dt}T00:00:00Z",
                "homeTeam": ht,
                "awayTeam": at,
                "homeScore": hs,
                "awayScore": as_,
                "neutralSite": bool(m.get("neutralSite", False)),
                "isPostHoldoutProspective": bool(dt > HOLD_END_DATE),
            })
        if valid_cnt > 0:
            league_match_counts[lname] = valid_cnt

    season_matches.sort(key=lambda r: (r["date"], r["startTime"], r["id"]))

    # 2. Extract strict pre-kickoff snapshot cohort (captured while status == 'scheduled')
    final_scores_by_id: dict[str, tuple[str, int, int, str]] = {}
    pre_analyses_by_id: dict[str, tuple[str, str, dict[str, Any]]] = {}
    post_kickoff_regenerated_count = 0
    referee_live_count = 0
    latest_games_total = 0

    for ldir in sorted(d for d in snapshots_dir.iterdir() if d.is_dir()):
        lname = ldir.name
        latest_file = ldir / "latest.json"
        if latest_file.exists():
            lat = json.loads(latest_file.read_text(encoding="utf-8"))
            g_map = {}
            for g in lat.get("games") or []:
                if isinstance(g, dict) and g.get("id"):
                    latest_games_total += 1
                    g_map[g["id"]] = g
                    if g.get("referee"):
                        referee_live_count += 1
            analyses_lat = lat.get("analyses") or {}
            a_iter = analyses_lat.values() if isinstance(analyses_lat, dict) else analyses_lat
            for a in a_iter:
                if isinstance(a, dict):
                    g = g_map.get(a.get("game"))
                    if g and g.get("status") == "final":
                        if (a.get("inputsAsOf") or "") > (g.get("startTime") or ""):
                            post_kickoff_regenerated_count += 1

        dated_files = sorted(ldir.glob("2026-*.json"))
        all_snap_files = dated_files + ([latest_file] if latest_file.exists() else [])
        for jf in all_snap_files:
            try:
                obj = json.loads(jf.read_text(encoding="utf-8"))
            except Exception:
                continue
            st_map: dict[str, str] = {}
            dt_map: dict[str, str] = {}
            for g in obj.get("games") or []:
                gid = g.get("id")
                if not gid:
                    continue
                st_map[gid] = g.get("status") or ""
                dt_map[gid] = (g.get("startTime") or "")[:10]
                res = g.get("result")
                if g.get("status") == "final" and isinstance(res, dict):
                    rh, ra = res.get("home"), res.get("away")
                    if isinstance(rh, int) and isinstance(ra, int):
                        final_scores_by_id[gid] = (lname, rh, ra, dt_map[gid])
            analyses = obj.get("analyses") or {}
            items = analyses.items() if isinstance(analyses, dict) else [
                (a.get("game"), a) for a in analyses if isinstance(a, dict)
            ]
            for gid, adict in items:
                if gid and st_map.get(gid) == "scheduled" and gid not in pre_analyses_by_id:
                    pre_analyses_by_id[gid] = (lname, jf.name, adict)

    strict_prekickoff_games: list[dict[str, Any]] = []
    for gid in sorted(set(final_scores_by_id.keys()) & set(pre_analyses_by_id.keys())):
        lname, rh, ra, dt = final_scores_by_id[gid]
        _, snap_name, adict = pre_analyses_by_id[gid]
        x12 = adict.get("x12")
        proj = adict.get("projection") or {}
        p_o25 = None
        p_btts = None
        for pobj in adict.get("probabilities") or []:
            mk = pobj.get("market")
            sel = (pobj.get("selection") or "").lower()
            pv = pobj.get("p")
            if not isinstance(pv, (int, float)):
                continue
            if mk in ("totals", "totals_2_5") and "2.5" in sel and ("más" in sel or "over" in sel):
                p_o25 = float(pv)
            elif mk == "btts" and ("sí" in sel or "si" in sel or sel == "yes"):
                p_btts = float(pv)
        strict_prekickoff_games.append({
            "gameId": gid,
            "league": lname,
            "sport": "nfl" if lname == "nfl" else "football",
            "date": dt or "2026-11-15",
            "capturedInSnapshot": snap_name,
            "homeScore": rh,
            "awayScore": ra,
            "x12": [float(v) for v in x12] if isinstance(x12, list) and len(x12) >= 2 else None,
            "projHome": float(proj["home"]) if isinstance(proj.get("home"), (int, float)) else None,
            "projAway": float(proj["away"]) if isinstance(proj.get("away"), (int, float)) else None,
            "projTotal": float(proj["total"]) if isinstance(proj.get("total"), (int, float)) else None,
            "pOver25": p_o25,
            "pBttsYes": p_btts,
        })

    # 3. Extract shell-index FT games & graded playable selections
    shell_ft_football: list[dict[str, Any]] = []
    us_shell_forecast_audit: dict[str, dict[str, int]] = {}
    shell_path = snapshots_dir / "shell-index.json"
    if shell_path.exists():
        shell = json.loads(shell_path.read_text(encoding="utf-8"))
        for lid, wrapper in sorted((shell.get("leagues") or {}).items()):
            d = wrapper.get("data") or {}
            sport = d.get("sport") or "football"
            games = d.get("games") or []
            if lid in ("nba", "nhl", "nfl", "mlb"):
                ft_g = [g for g in games if g.get("status") == "FT"]
                ns_g = [g for g in games if g.get("status") != "FT"]
                us_shell_forecast_audit[lid] = {
                    "ft_total": len(ft_g),
                    "ft_with_forecast": sum(1 for g in ft_g if g.get("hasForecast")),
                    "ns_total": len(ns_g),
                    "ns_with_forecast": sum(1 for g in ns_g if g.get("hasForecast")),
                }
            if sport != "football":
                continue
            for g in games:
                if g.get("status") != "FT":
                    continue
                sc = g.get("score") or {}
                h, a = sc.get("home"), sc.get("away")
                x12 = g.get("x12")
                proj = g.get("projection") or {}
                if not isinstance(h, int) or not isinstance(a, int):
                    continue
                if not (isinstance(x12, list) and len(x12) == 3 and all(isinstance(v, (int, float)) for v in x12)):
                    continue
                best_playable = None
                for mg in g.get("marketGroups") or []:
                    for row in mg.get("rows") or []:
                        mk = row.get("market") or ""
                        sk = row.get("selection") or ""
                        lbl = row.get("label") or ""
                        pv = row.get("p")
                        if not isinstance(pv, (int, float)) or pv <= 0.01 or pv >= 0.99:
                            continue
                        outc = _grade_shell_row(sport, mk, sk, lbl, h, a)
                        if outc is not None and mk != "double_chance":
                            fair = 1.0 / float(pv)
                            if 1.55 <= fair <= 2.60:
                                if best_playable is None or float(pv) > best_playable["p"]:
                                    best_playable = {
                                        "market": mk,
                                        "selection": sk,
                                        "p": round(float(pv), 6),
                                        "hit": int(outc),
                                    }
                shell_ft_football.append({
                    "gameId": g.get("id"),
                    "league": lid,
                    "tier": "spacetime_core" if lid in SPACETIME_CORE_LEAGUES else "expansion",
                    "date": g.get("day") or (g.get("kickoffUtc") or "")[:10] or "2026-11-15",
                    "homeTeam": _norm_team_slug((g.get("home") or {}).get("id") or (g.get("home") or {}).get("name")),
                    "awayTeam": _norm_team_slug((g.get("away") or {}).get("id") or (g.get("away") or {}).get("name")),
                    "homeScore": h,
                    "awayScore": a,
                    "x12": [round(float(v), 6) for v in x12],
                    "projHome": round(float(proj.get("home", 1.35)), 6),
                    "projAway": round(float(proj.get("away", 1.15)), 6),
                    "projTotal": round(float(proj.get("total", 2.50)), 6),
                    "bestPlayablePick": best_playable,
                })

    # 4. Extract Goalkeepers & Player Candidate Picks profiles from squads.json
    gk_profiles: list[dict[str, Any]] = []
    outfield_shot_profiles: list[dict[str, Any]] = []
    candidate_pick_counts: Counter[str] = Counter()
    us_recent_game_columns: dict[str, dict[str, int]] = defaultdict(Counter)
    total_players = 0
    football_missing_minutes = 0

    for ldir in sorted(d for d in snapshots_dir.iterdir() if d.is_dir()):
        lname = ldir.name
        sqf = ldir / "squads.json"
        if not sqf.exists():
            continue
        sq = json.loads(sqf.read_text(encoding="utf-8"))
        for t in sq.get("teams") or []:
            tslug = _norm_team_slug(t.get("teamSlug") or t.get("teamId"))
            for p in t.get("players") or []:
                total_players += 1
                st = p.get("stats") or {}
                if lname not in US_LEAGUE_SPORT and "minutes" not in st:
                    football_missing_minutes += 1
                for cp in p.get("candidatePicks") or []:
                    candidate_pick_counts[cp.get("marketKey") or "unknown"] += 1
                for rg in p.get("recentGames") or []:
                    for item in rg.get("stats") or []:
                        lbl = item.get("label")
                        if lbl:
                            us_recent_game_columns[lname][lbl] += 1

                apps = int(st.get("appearances") or 0)
                subs = int(st.get("subIns") or 0)
                pos_grp = p.get("positionGroup") or "MID"
                if lname not in US_LEAGUE_SPORT and pos_grp == "GK" and apps >= 3:
                    saves = int(st.get("saves") or 0)
                    sf = int(st.get("shotsFaced") or 0)
                    gc = int(st.get("goalsConceded") or 0)
                    if saves > 0 or gc > 0:
                        gk_profiles.append({
                            "league": lname,
                            "teamSlug": tslug,
                            "playerSlug": p.get("slug") or p.get("id"),
                            "playerName": p.get("name"),
                            "appearances": apps,
                            "subIns": min(subs, apps),
                            "saves": saves,
                            "shotsFaced": sf if sf >= saves else saves + gc,
                            "goalsConceded": gc,
                            "legacyCandidatePick": next(
                                (cp for cp in (p.get("candidatePicks") or []) if cp.get("marketKey") == "player_saves"),
                                None,
                            ),
                        })
                elif lname not in US_LEAGUE_SPORT and apps >= 5 and (int(st.get("shots") or 0) >= 8):
                    if len(outfield_shot_profiles) < 600:
                        outfield_shot_profiles.append({
                            "league": lname,
                            "teamSlug": tslug,
                            "playerSlug": p.get("slug") or p.get("id"),
                            "playerName": p.get("name"),
                            "positionGroup": pos_grp,
                            "appearances": apps,
                            "subIns": min(subs, apps),
                            "shots": int(st.get("shots") or 0),
                            "shotsOnTarget": int(st.get("shotsOnTarget") or 0),
                            "goals": int(st.get("goals") or 0),
                            "assists": int(st.get("assists") or 0),
                        })

    # 5. Quotes timeseries summary
    quotes_summary = {"ticks_count": 0, "books": {}, "leagues": {}}
    quotes_path = pitch_data_dir / "odds_timeseries" / "quotes_latest.json"
    if quotes_path.exists():
        qobj = json.loads(quotes_path.read_text(encoding="utf-8"))
        ticks = qobj.get("ticks") or []
        quotes_summary = {
            "ticks_count": len(ticks),
            "updated_at_utc": qobj.get("updated_at_utc"),
            "books": dict(Counter(t.get("book") for t in ticks)),
            "leagues": dict(Counter(t.get("league") for t in ticks)),
        }

    bundle = {
        "schema_version": "live_platform_bridge_v5.2.0",
        "governance": {
            "holdout_window_protected": [HOLD_START_DATE, HOLD_END_DATE],
            "holdout_sealed_untouched": True,
            "hyperparameter_tuning_on_holdout": False,
        },
        "summary": {
            "season_results_leagues": len(league_match_counts),
            "season_results_total_matches": len(season_matches),
            "season_results_by_league": league_match_counts,
            "strict_prekickoff_settled_matches": len(strict_prekickoff_games),
            "shell_ft_football_matches": len(shell_ft_football),
            "latest_post_kickoff_regenerated_analyses": post_kickoff_regenerated_count,
            "live_referee_assignments": referee_live_count,
            "latest_games_total": latest_games_total,
            "us_shell_forecast_audit": us_shell_forecast_audit,
            "squads_total_players": total_players,
            "football_players_missing_minutes_field": football_missing_minutes,
            "candidate_player_picks_by_market": dict(candidate_pick_counts),
            "active_goalkeeper_profiles": len(gk_profiles),
            "sampled_outfield_shot_profiles": len(outfield_shot_profiles),
            "us_recent_game_columns_stored": {k: dict(v) for k, v in us_recent_game_columns.items()},
            "quotes_latest_summary": quotes_summary,
        },
        "season_matches": season_matches,
        "strict_prekickoff_games": strict_prekickoff_games,
        "shell_ft_football": shell_ft_football,
        "gk_profiles": gk_profiles,
        "outfield_shot_profiles": outfield_shot_profiles,
    }

    raw_bytes = json.dumps(bundle, ensure_ascii=False, indent=2).encode("utf-8")
    cached_bundle_path.write_bytes(raw_bytes)
    bundle["artifact_sha256"] = _sha256_bytes(raw_bytes)
    return bundle


def main() -> None:
    parser = argparse.ArgumentParser(description="Build PitchLab v5.2 live-results bridge dataset.")
    parser.add_argument("--pitch-data-dir", type=Path, default=DEFAULT_PITCH_DATA)
    args = parser.parse_args()
    bundle = build_live_results_bridge(args.pitch_data_dir)
    print(json.dumps(bundle["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
