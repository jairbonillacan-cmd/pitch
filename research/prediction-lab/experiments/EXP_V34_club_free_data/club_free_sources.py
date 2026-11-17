"""Extractores causales `t' < t` sobre fuentes gratuitas abiertas para Fútbol de Clubes (`EXP_V34_club_free_data`).

Integra 3 familias de señales gratuitas 100% legales y libres de fuga temporal (`< 2025-02-02`):
  1. `StatsBomb Open Data` (`P1-1` pendiente en `03_FUENTES_DATOS_GRATUITOS.md`):
     - Descarga eventos reales `Shot` / `Pass(Corner)` de Big-5 `2015/2016` (`season_id=27`, `< 2020`, `0` fuga)
       y calibra pesos empíricos `(SOT, tiros fuera, córners) -> statsbomb_xg`.
  2. `dcaribou/transfermarkt-datasets` (`CC0 1.0 Universal` verificado):
     - Valor relativo de plantilla pre-partido (`valuation.date < snap_date < match_date`) centrado por
       mediana contemporánea de su liga (`tm_club_rel_log_val`, invariante a inflación 2005->2024),
       profundidad `12..22 / 1..11`, prior de recién ascendidos y brecha `Talento € vs Elo`.
     - Historial causal de entrenadores desde `tm_games.csv.gz` (`date < match_date`): efecto nuevo DT
       (`<= 4` partidos) y rendimiento bayesiano encogido del entrenador (`manager_pae`).
  3. Señales causales internas de `matches.parquet` (`182,562` partidos, `0` costo externo, no usadas en `Tachyon v3.0`):
     - Sanción automática por tarjeta roja en la jornada inmediata anterior (`prev_reds_diff`).
     - Forma limpia descontando distorsión `11v10` por expulsiones (`rc_clean_gd_ewm8_diff`).
     - Dominio estructural al descanso 45' (`ht_gd_ewm8_diff`, `ht_lead_rate_r10_diff`).
     - Perfil causal pre-partido del árbitro designado (`ref_home_bias_prior`, `ref_draw_bias_prior`).
"""

from __future__ import annotations

from bisect import bisect_left
from collections import deque
import concurrent.futures
from datetime import datetime
import json
import math
from pathlib import Path
import re
import unicodedata
import urllib.request
from typing import Any

import numpy as np
import pandas as pd

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
FREE_CACHE_DIR = REPO_ROOT / "research" / "prediction-lab" / "data" / "raw" / "free_open_v33"
SB_CACHE_DIR = EXP_DIR / "raw_cache" / "statsbomb_s27"
ARTIFACTS_DIR = EXP_DIR / "artifacts"

TM_CLUBS_GZ = FREE_CACHE_DIR / "tm_clubs.csv.gz"
TM_VALS_GZ = FREE_CACHE_DIR / "tm_player_valuations.csv.gz"
TM_GAMES_GZ = FREE_CACHE_DIR / "tm_games.csv.gz"

HOLDOUT_CUT_DATE = "2025-02-02"
UA = {"User-Agent": "PitchLab-PredictionLab/3.3 (CC0 & Open Data Research)"}

# Mapeo de división PitchLab (`matches.parquet`) -> prefijos de competición Transfermarkt (incluyendo copas domésticas para cubrir 2ª división)
EURO_CUPS = ("CL", "EL", "ECL", "UEFA", "UI")
DIV_TO_TM_COMP_PREFIX: dict[str, tuple[str, ...]] = {
    "E0": ("GB", "FAC", "CGB") + EURO_CUPS,
    "E1": ("GB", "FAC", "CGB") + EURO_CUPS,
    "SP1": ("ES", "CDR", "SUC") + EURO_CUPS,
    "SP2": ("ES", "CDR", "SUC") + EURO_CUPS,
    "D1": ("L1", "L2", "DFB", "DFL") + EURO_CUPS,
    "D2": ("L1", "L2", "DFB", "DFL") + EURO_CUPS,
    "I1": ("IT", "CIT", "SCI") + EURO_CUPS,
    "I2": ("IT", "CIT", "SCI") + EURO_CUPS,
    "F1": ("FR", "FRC") + EURO_CUPS,
    "F2": ("FR", "FRC") + EURO_CUPS,
    "P1": ("PO", "POP") + EURO_CUPS,
    "N1": ("NL", "NLP") + EURO_CUPS,
    "B1": ("BE", "BESC") + EURO_CUPS,
    "T1": ("TR",) + EURO_CUPS,
    "G1": ("GR",) + EURO_CUPS,
    "SC0": ("SC", "SFA") + EURO_CUPS,
    "SC1": ("SC", "SFA") + EURO_CUPS,
    "BRA": ("BRA", "CLI", "CS"),
    "ARG": ("ARG", "CLI", "CS"),
    "MEX": ("MEX",),
    "USA": ("MLS",),
    "JPN": ("JAP",),
    "SWE": ("SE",) + EURO_CUPS,
}

# Alias deterministas de abreviaturas clásicas de `football-data.co.uk` -> nombre limpio en Transfermarkt
FD_CLUB_ALIASES: dict[str, str] = {
    "man united": "manchester united",
    "man city": "manchester city",
    "spurs": "tottenham hotspur",
    "tottenham": "tottenham hotspur",
    "wolves": "wolverhampton wanderers",
    "nott m forest": "nottingham forest",
    "newcastle": "newcastle united",
    "west ham": "west ham united",
    "west brom": "west bromwich albion",
    "brighton": "brighton and hove albion",
    "leicester": "leicester city",
    "leeds": "leeds united",
    "norwich": "norwich city",
    "sheffield united": "sheffield united",
    "qpr": "queens park rangers",
    "ath madrid": "atletico de madrid",
    "ath bilbao": "athletic bilbao",
    "sociedad": "real sociedad",
    "betis": "real betis",
    "celta": "celta de vigo",
    "espanol": "rcd espanyol barcelona",
    "valladolid": "real valladolid",
    "alaves": "deportivo alaves",
    "la coruna": "deportivo de la coruna",
    "sp gijon": "sporting gijon",
    "bayern munich": "bayern munich",
    "dortmund": "borussia dortmund",
    "leverkusen": "bayer 04 leverkusen",
    "m gladbach": "borussia monchengladbach",
    "ein frankfurt": "eintracht frankfurt",
    "rb leipzig": "rb leipzig",
    "mainz": "1 fsv mainz 05",
    "fc koln": "1 fc koln",
    "hertha": "hertha bsc",
    "stuttgart": "vfb stuttgart",
    "wolfsburg": "vfl wolfsburg",
    "schalke 04": "fc schalke 04",
    "werder bremen": "sv werder bremen",
    "augsburg": "fc augsburg",
    "freiburg": "sc freiburg",
    "hoffenheim": "tsg 1899 hoffenheim",
    "bochum": "vfl bochum",
    "heidenheim": "1 fc heidenheim 1846",
    "inter": "inter milan",
    "milan": "ac milan",
    "verona": "hellas verona",
    "roma": "as roma",
    "lazio": "ss lazio",
    "napoli": "ssc napoli",
    "atalanta": "atalanta bc",
    "fiorentina": "acf fiorentina",
    "juventus": "juventus fc",
    "paris sg": "paris saint germain",
    "st etienne": "as saint etienne",
    "marseille": "olympique marseille",
    "lyon": "olympique lyon",
    "monaco": "as monaco",
    "lille": "losc lille",
    "nice": "ogc nice",
    "rennes": "stade rennais fc",
    "lens": "rc lens",
    "sp lisbon": "sporting cp",
    "sp braga": "sc braga",
    "benfica": "sl benfica",
    "porto": "fc porto",
    "guimaraes": "vitoria guimaraes sc",
    "psv eindhoven": "psv eindhoven",
    "feyenoord": "feyenoord rotterdam",
    "ajax": "ajax amsterdam",
    "az alkmaar": "az alkmaar",
    "twente": "fc twente enschede",
    "club brugge": "club brugge kv",
    "anderlecht": "rsc anderlecht",
    "standard": "standard liege",
    "genk": "krc genk",
    "gent": "kaa gent",
    "galatasaray": "galatasaray",
    "fenerbahce": "fenerbahce",
    "besiktas": "besiktas jk",
    "trabzonspor": "trabzonspor",
    "olympiakos": "olympiacos piraeus",
    "panathinaikos": "panathinaikos fc",
    "paok": "paok thessaloniki",
    "aek": "aek athens",
    "celtic": "celtic fc",
    "rangers": "rangers fc",
    "sheffield weds": "sheffield wednesday",
    "middlesbrough": "middlesbrough fc",
    "blackburn": "blackburn rovers",
    "coventry": "coventry city",
    "preston": "preston north end",
    "west brom": "west bromwich albion",
    "hamburg": "hamburger sv",
    "nurnberg": "1 fc nurnberg",
    "kaiserslautern": "1 fc kaiserslautern",
    "karlsruhe": "karlsruher sc",
    "munich 1860": "tsv 1860 munich",
    "duisburg": "msv duisburg",
    "fortuna dusseldorf": "fortuna dusseldorf",
    "st pauli": "fc st pauli",
    "hannover": "hannover 96",
    "paderborn": "sc paderborn 07",
    "greuther furth": "spvgg greuther furth",
    "darmstadt": "sv darmstadt 98",
    "bielefeld": "arminia bielefeld",
    "st gilloise": "royale union saint gilloise",
    "st truiden": "sint truidense vv",
    "waasland beveren": "waasland beveren",
    "flamengo rj": "clube de regatas do flamengo",
    "atletico mg": "clube atletico mineiro",
    "athletico pr": "club athletico paranaense",
    "atletico pr": "club athletico paranaense",
    "america mg": "america futebol clube",
    "atletico go": "atletico clube goianiense",
    "chapecoense sc": "associacao chapecoense de futebol",
    "vasco": "club de regatas vasco da gama",
    "botafogo rj": "botafogo de futebol e regatas",
    "argentinos jrs": "argentinos juniors",
    "gimnasia l p": "club de gimnasia y esgrima la plata",
    "talleres cordoba": "club atletico talleres",
    "atl tucuman": "club atletico tucuman",
    "union de santa fe": "club atletico union",
    "colon santa fe": "club atletico colon",
}

STOP_TOKENS = frozenset({"fc", "cf", "sc", "ac", "as", "rc", "cd", "ud", "sd", "de", "del", "la", "el", "club", "real", "1", "04", "05", "1899", "1846", "kv", "krc", "kaa", "rsc", "sl", "ssc", "acf", "vfl", "vfb", "tsg", "sv", "fsv", "bsc"})


def _slug_club(raw: str) -> str:
    s = unicodedata.normalize("NFKD", str(raw or "")).encode("ascii", "ignore").decode("ascii").lower()
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    s = re.sub(r"\s+", " ", s)
    return FD_CLUB_ALIASES.get(s, s)


def _core_tokens(slug: str) -> set[str]:
    toks = [t for t in slug.split() if t and t not in STOP_TOKENS and len(t) >= 2]
    return set(toks) if toks else set(slug.split())


def calibrate_statsbomb_p1_1_shot_xg(max_matches_sample: int = 180) -> dict[str, Any]:
    """Ejecuta la tarea pendiente `P1-1` (`03_FUENTES_DATOS_GRATUITOS.md`):
    descarga partidos de las 5 grandes ligas `2015/2016` (`season_id=27`, `< 2020`, `0` fuga a test/holdout)
    desde `statsbomb/open-data` y calibra OLS no negativo `(SOT_open_play, SOFF_open_play, Corners) -> npxG + xG`."""
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    out_json = ARTIFACTS_DIR / "statsbomb_p1_1_xg_calibration.json"
    if out_json.exists():
        return json.loads(out_json.read_text(encoding="utf-8"))

    SB_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    base_sb = "https://raw.githubusercontent.com/statsbomb/open-data/master/data"
    comp_ids = (2, 11, 9, 12, 7)  # EPL, LaLiga, Bundesliga, Serie A, Ligue 1 (2015/2016 = season 27)
    match_Meta: list[tuple[int, str, str]] = []

    for cid in comp_ids:
        m_url = f"{base_sb}/matches/{cid}/27.json"
        m_file = SB_CACHE_DIR / f"matches_{cid}_27.json"
        if not m_file.exists():
            req = urllib.request.Request(m_url, headers=UA)
            with urllib.request.urlopen(req, timeout=25) as r:
                m_file.write_bytes(r.read())
        m_list = json.loads(m_file.read_text(encoding="utf-8"))
        # Muestreo determinista equiespaciado por liga
        step = max(1, len(m_list) // (max_matches_sample // len(comp_ids)))
        for m_obj in m_list[::step]:
            mid = int(m_obj["match_id"])
            ht = str(m_obj["home_team"]["home_team_name"])
            at = str(m_obj["away_team"]["away_team_name"])
            match_Meta.append((mid, ht, at))

    match_Meta = match_Meta[:max_matches_sample]

    def _fetch_team_shot_rows(item: tuple[int, str, str]) -> list[tuple[int, float, float, float, float, float]]:
        mid, ht, at = item
        ev_file = SB_CACHE_DIR / f"ev_{mid}.json"
        if not ev_file.exists():
            ev_url = f"{base_sb}/events/{mid}.json"
            req = urllib.request.Request(ev_url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                raw_b = r.read()
            # Guardar solo resumen compacto para no ocupar cientos de MB en disco
            evs = json.loads(raw_b.decode("utf-8"))
            stats = {ht: [0.0, 0.0, 0.0, 0.0, 0.0], at: [0.0, 0.0, 0.0, 0.0, 0.0]}
            on_target_outcomes = {"Goal", "Saved", "Saved to Post"}
            for ev in evs:
                tname = ev.get("team", {}).get("name")
                if tname not in stats:
                    continue
                etype = ev.get("type", {}).get("name")
                if etype == "Shot":
                    sh = ev.get("shot", {})
                    xg = float(sh.get("statsbomb_xg", 0.0))
                    is_pk = sh.get("type", {}).get("name") == "Penalty"
                    outc = sh.get("outcome", {}).get("name", "")
                    stats[tname][3] += xg
                    if not is_pk:
                        stats[tname][4] += xg
                    if outc in on_target_outcomes:
                        stats[tname][0] += 1.0
                    else:
                        stats[tname][1] += 1.0
                elif etype == "Pass":
                    if ev.get("pass", {}).get("type", {}).get("name") == "Corner":
                        stats[tname][2] += 1.0
            ev_file.write_text(json.dumps(stats), encoding="utf-8")
        else:
            stats = json.loads(ev_file.read_text(encoding="utf-8"))

        h_s = stats[ht]
        a_s = stats[at]
        return [
            (1, h_s[0], h_s[1], h_s[2], h_s[3], h_s[4]),
            (0, a_s[0], a_s[1], a_s[2], a_s[3], a_s[4]),
        ]

    rows_all: list[tuple[int, float, float, float, float, float]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for res in pool.map(_fetch_team_shot_rows, match_Meta):
            rows_all.extend(res)

    arr = np.array(rows_all, dtype=np.float64)
    # Columnas: 0=is_home, 1=sot, 2=soff, 3=corners, 4=total_xg, 5=npxg
    res_dict: dict[str, Any] = {
        "source": "statsbomb/open-data (season_id=27, 2015/2016 Big-5 Europe, < 2020 train-only)",
        "n_matches_sampled": len(match_Meta),
        "n_team_innings": len(arr),
    }
    for side_val, tag in ((1, "home"), (0, "away")):
        sub = arr[arr[:, 0] == side_val]
        X_ols = np.column_stack([np.ones(len(sub)), sub[:, 1], sub[:, 2], sub[:, 3]])
        y_xg = sub[:, 4]
        beta, _, _, _ = np.linalg.lstsq(X_ols, y_xg, rcond=None)
        beta = np.maximum(0.0, beta)
        pred = X_ols @ beta
        ss_res = float(np.sum((y_xg - pred) ** 2))
        ss_tot = float(np.sum((y_xg - np.mean(y_xg)) ** 2))
        res_dict[tag] = {
            "intercept": round(float(beta[0]), 5),
            "w_sot": round(float(beta[1]), 5),
            "w_soff": round(float(beta[2]), 5),
            "w_corners": round(float(beta[3]), 5),
            "r2_vs_statsbomb_xg": round(1.0 - ss_res / max(1e-9, ss_tot), 4),
            "mae_xg": round(float(np.mean(np.abs(y_xg - pred))), 4),
        }

    out_json.write_text(json.dumps(res_dict, indent=2), encoding="utf-8")
    return res_dict


class CausalClubTransfermarktBridge:
    """Cruza `(div, team_name)` de `matches.parquet` contra `tm_clubs.csv.gz`, `tm_player_valuations.csv.gz`
    y `tm_games.csv.gz` (`CC0 1.0`) garantizando causalidad estricta (`date < match_date`)."""

    def __init__(self, max_date_exclusive: str | None = HOLDOUT_CUT_DATE) -> None:
        self._club_catalog: list[tuple[int, str, str, set[str]]] = []
        self._resolved_cache: dict[tuple[str, str], int | None] = {}
        self._snap_ords: list[int] = []
        self._club_val_snaps: list[dict[int, tuple[float, float]]] = []
        self._comp_median_snaps: list[dict[str, float]] = []
        self._club_comp_map: dict[int, str] = {}
        # Historial de entrenadores por club: club_id -> (ords_sorted, manager_names, new_mgr_flags, mgr_pae_pre)
        self._mgr_timeline: dict[int, tuple[list[int], list[float], list[float]]] = {}

        if not TM_CLUBS_GZ.exists() or not TM_VALS_GZ.exists():
            return

        cl = pd.read_csv(TM_CLUBS_GZ, usecols=["club_id", "club_code", "name", "domestic_competition_id"])
        for r in cl.itertuples(index=False):
            cid = int(r.club_id)
            comp = str(r.domestic_competition_id or "").strip()
            sl = _slug_club(str(r.name or ""))
            sl_code = _slug_club(str(r.club_code or "").replace("-", " "))
            self._club_comp_map[cid] = comp
            self._club_catalog.append((cid, comp, sl, _core_tokens(sl)))
            if sl_code and sl_code != sl:
                self._club_catalog.append((cid, comp, sl_code, _core_tokens(sl_code)))

        # Agregar también nombres de clubes históricos de `tm_games.csv.gz` (cubre equipos descendidos antes de 2021)
        gm: pd.DataFrame | None = None
        if TM_GAMES_GZ.exists():
            gm = pd.read_csv(
                TM_GAMES_GZ,
                usecols=[
                    "competition_id",
                    "date",
                    "home_club_id",
                    "away_club_id",
                    "home_club_goals",
                    "away_club_goals",
                    "home_club_name",
                    "away_club_name",
                    "home_club_manager_name",
                    "away_club_manager_name",
                ],
            )
            gm["date_str"] = gm["date"].astype(str).str.slice(0, 10)
            if max_date_exclusive is not None:
                gm = gm[gm["date_str"] < str(max_date_exclusive)[:10]].copy()
            known_cids = set(self._club_comp_map.keys())
            for id_col, nm_col in (("home_club_id", "home_club_name"), ("away_club_id", "away_club_name")):
                sub_g = gm[[id_col, "competition_id", nm_col]].dropna().drop_duplicates(subset=[id_col])
                for r in sub_g.itertuples(index=False):
                    cid = int(getattr(r, id_col))
                    if cid not in known_cids:
                        comp = str(r.competition_id).strip()
                        sl = _slug_club(str(getattr(r, nm_col)))
                        self._club_comp_map[cid] = comp
                        self._club_catalog.append((cid, comp, sl, _core_tokens(sl)))
                        known_cids.add(cid)

        # 1. Snapshots bimensuales causales de valor de plantilla (`valuation.date < snap_date`)
        pv = pd.read_csv(
            TM_VALS_GZ,
            usecols=["player_id", "date", "market_value_in_eur", "current_club_id", "player_club_domestic_competition_id"],
        )
        pv["date_str"] = pv["date"].astype(str).str.slice(0, 10)
        if max_date_exclusive is not None:
            pv = pv[pv["date_str"] < str(max_date_exclusive)[:10]].copy()
        pv["val_eur"] = pd.to_numeric(pv["market_value_in_eur"], errors="coerce").fillna(0.0)
        pv = pv[(pv["val_eur"] > 0.0) & pv["current_club_id"].notna()].copy()
        pv["v_dt"] = pd.to_datetime(pv["date_str"], format="%Y-%m-%d", errors="coerce")
        pv = pv[pv["v_dt"].notna()].copy()
        pv["v_ord"] = pv["v_dt"].map(lambda d: d.toordinal()).astype(np.int64)
        pv["cid"] = pv["current_club_id"].astype(np.int64)
        pv = pv.sort_values("v_ord", kind="mergesort").reset_index(drop=True)

        v_ords = pv["v_ord"].to_numpy(dtype=np.int64)
        pids = pv["player_id"].to_numpy(dtype=np.int64)
        cids = pv["cid"].to_numpy(dtype=np.int64)
        vals = pv["val_eur"].to_numpy(dtype=np.float64)
        comps = pv["player_club_domestic_competition_id"].fillna("").astype(str).to_numpy()

        snap_ords_list: list[int] = []
        for yr in range(2004, 2027):
            for mo in (1, 3, 5, 7, 9, 11):
                if yr == 2004 and mo < 7:
                    continue
                d_iso = f"{yr:04d}-{mo:02d}-01"
                if max_date_exclusive is not None and d_iso > str(max_date_exclusive)[:10]:
                    continue
                snap_ords_list.append(datetime(yr, mo, 1).toordinal())

        latest_p: dict[int, tuple[int, int, float, str]] = {}
        ptr = 0
        n_v = len(v_ords)
        for s_ord in snap_ords_list:
            while ptr < n_v and v_ords[ptr] < s_ord:
                latest_p[int(pids[ptr])] = (int(v_ords[ptr]), int(cids[ptr]), float(vals[ptr]), str(comps[ptr]))
                ptr += 1

            min_vo = s_ord - 540
            club_buckets: dict[int, list[float]] = {}
            club_comp_cur: dict[int, str] = {}
            stale_p = []
            for pk, (vo, cid_k, ve, cp_s) in latest_p.items():
                if vo < min_vo:
                    if vo < s_ord - 1460:
                        stale_p.append(pk)
                    continue
                club_buckets.setdefault(cid_k, []).append(ve)
                if cp_s:
                    club_comp_cur[cid_k] = cp_s
            for sp in stale_p:
                latest_p.pop(sp, None)

            c_snap: dict[int, tuple[float, float]] = {}
            comp_vals: dict[str, list[float]] = {}
            for cid_k, v_list in club_buckets.items():
                if len(v_list) < 5:
                    continue
                v_list.sort(reverse=True)
                top22 = v_list[:22]
                log_v = math.log1p(sum(top22) / 1e6)
                xi_v = sum(top22[:11])
                bench_v = sum(top22[11:])
                depth_r = min(1.0, bench_v / max(1e4, xi_v))
                c_snap[cid_k] = (log_v, depth_r)
                cp_k = club_comp_cur.get(cid_k) or self._club_comp_map.get(cid_k, "")
                if cp_k:
                    comp_vals.setdefault(cp_k, []).append(log_v)

            med_snap = {cp_k: float(np.median(vl)) for cp_k, vl in comp_vals.items() if len(vl) >= 4}
            self._snap_ords.append(s_ord)
            self._club_val_snaps.append(c_snap)
            self._comp_median_snaps.append(med_snap)

        # 2. Línea temporal causal de entrenadores desde `tm_games.csv.gz`
        if gm is not None and not gm.empty:
            gm_valid = gm[gm["home_club_goals"].notna() & gm["away_club_goals"].notna()].copy()
            gm_valid["g_dt"] = pd.to_datetime(gm_valid["date_str"], format="%Y-%m-%d", errors="coerce")
            gm_valid = gm_valid[gm_valid["g_dt"].notna()].sort_values("g_dt", kind="mergesort")
            gm_valid["g_ord"] = gm_valid["g_dt"].map(lambda d: d.toordinal()).astype(np.int64)

            last_mgr_by_club: dict[int, str] = {}
            stint_len_by_club: dict[int, int] = {}
            mgr_pae_sum: dict[str, float] = {}
            mgr_games_cnt: dict[str, int] = {}
            timeline_acc: dict[int, tuple[list[int], list[float], list[float]]] = {}

            for r in gm_valid.itertuples(index=False):
                g_ord = int(r.g_ord)
                hg = float(r.home_club_goals)
                ag = float(r.away_club_goals)
                pts_h = 1.0 if hg == ag else (3.0 if hg > ag else 0.0)
                pts_a = 1.0 if hg == ag else (3.0 if ag > hg else 0.0)

                for cid_raw, mgr_raw, pts_obs, exp_pts in (
                    (r.home_club_id, r.home_club_manager_name, pts_h, 1.62),
                    (r.away_club_id, r.away_club_manager_name, pts_a, 1.12),
                ):
                    if pd.isna(cid_raw) or pd.isna(mgr_raw):
                        continue
                    cid_i = int(cid_raw)
                    mgr_s = str(mgr_raw).strip()
                    if not mgr_s:
                        continue
                    prev_mgr = last_mgr_by_club.get(cid_i)
                    if prev_mgr == mgr_s:
                        stint = stint_len_by_club.get(cid_i, 0) + 1
                    else:
                        stint = 1
                        last_mgr_by_club[cid_i] = mgr_s
                    stint_len_by_club[cid_i] = stint

                    # Actualizar estado conocido DESPUÉS de este partido (`g_ord`) para consultas en `match_ord > g_ord`
                    mgr_pae_sum[mgr_s] = mgr_pae_sum.get(mgr_s, 0.0) + (pts_obs - exp_pts)
                    mgr_games_cnt[mgr_s] = mgr_games_cnt.get(mgr_s, 0) + 1
                    shrunk_pae = mgr_pae_sum[mgr_s] / (float(mgr_games_cnt[mgr_s]) + 25.0)
                    new_flag = 1.0 if stint <= 4 else 0.0

                    acc = timeline_acc.get(cid_i)
                    if acc is None:
                        acc = ([], [], [])
                        timeline_acc[cid_i] = acc
                    acc[0].append(g_ord)
                    acc[1].append(new_flag)
                    acc[2].append(shrunk_pae)

            self._mgr_timeline = timeline_acc

    def resolve_club_id(self, div: str, team_name: str) -> int | None:
        key = (str(div), str(team_name))
        if key in self._resolved_cache:
            return self._resolved_cache[key]

        prefixes = DIV_TO_TM_COMP_PREFIX.get(str(div), ())
        slug = _slug_club(team_name)
        toks = _core_tokens(slug)

        best_cid: int | None = None
        best_score = 0.0
        for cid, comp, c_slug, c_toks in self._club_catalog:
            if prefixes and not any(comp.startswith(p) for p in prefixes):
                continue
            if c_slug == slug:
                best_cid = cid
                best_score = 10.0
                break
            inter = len(toks & c_toks)
            if inter == 0:
                continue
            union = len(toks | c_toks)
            score = inter / float(max(1, union))
            if slug in c_slug or c_slug in slug:
                score += 0.35
            if score > best_score:
                best_score = score
                best_cid = cid

        resolved = best_cid if best_score >= 0.50 else None
        self._resolved_cache[key] = resolved
        return resolved

    def lookup_prematch_club_tm(self, div: str, team_name: str, match_ord: int, current_elo: float) -> dict[str, float]:
        """Devuelve métricas Transfermarkt estrictamente `< match_ord`."""
        cid = self.resolve_club_id(div, team_name)
        elo_rel = (float(current_elo) - 1515.0) / 145.0
        res = {
            "tm_raw_log_val": 0.0,
            "tm_rel_log_val": elo_rel,
            "tm_depth_ratio": 0.30,
            "tm_val_vs_elo_gap": 0.0,
            "tm_has_val": 0.0,
            "tm_new_mgr_flag": 0.0,
            "tm_mgr_pae": 0.0,
        }
        if cid is None:
            return res

        if self._snap_ords:
            idx = bisect_left(self._snap_ords, int(match_ord)) - 1
            if idx >= 0:
                c_ent = self._club_val_snaps[idx].get(cid)
                if c_ent is not None:
                    log_v, depth_r = c_ent
                    comp_code = self._club_comp_map.get(cid, "")
                    med_v = self._comp_median_snaps[idx].get(comp_code, log_v)
                    rel_v = log_v - med_v
                    res["tm_raw_log_val"] = log_v
                    res["tm_rel_log_val"] = rel_v
                    res["tm_depth_ratio"] = depth_r
                    res["tm_val_vs_elo_gap"] = rel_v - elo_rel
                    res["tm_has_val"] = 1.0

        tl = self._mgr_timeline.get(cid)
        if tl is not None:
            m_idx = bisect_left(tl[0], int(match_ord)) - 1
            if m_idx >= 0 and (int(match_ord) - tl[0][m_idx]) <= 120:
                res["tm_new_mgr_flag"] = tl[1][m_idx]
                res["tm_mgr_pae"] = tl[2][m_idx]

        return res


def extract_matches_parquet_free_signals(matches_df: pd.DataFrame) -> pd.DataFrame:
    """Construye señales estrictamente causales `t' < t` sobre columnas gratuitas de `matches.parquet`
    que `Tachyon v3.0` no utilizaba (`reds`, `yellows`, `ht_goals`, `referee`)."""
    ordered = matches_df.sort_values(["match_date", "kickoff_time", "match_id"], kind="mergesort").reset_index(drop=True)
    n = len(ordered)

    prev_reds_diff = np.zeros(n, dtype=np.float64)
    rc_clean_gd_ewm8_diff = np.zeros(n, dtype=np.float64)
    ht_gd_ewm8_diff = np.zeros(n, dtype=np.float64)
    ht_lead_r10_diff = np.zeros(n, dtype=np.float64)
    disc_cards_ewm10_diff = np.zeros(n, dtype=np.float64)
    ref_home_bias = np.zeros(n, dtype=np.float64)
    ref_draw_bias = np.zeros(n, dtype=np.float64)

    # Estado por `(div_country_club)` o equipo
    last_reds: dict[tuple[str, str, str], tuple[int, float]] = {}  # (div, season, team) -> (ord, reds)
    rc_gd_ewm: dict[str, float] = {}
    ht_gd_ewm: dict[str, float] = {}
    ht_lead_hist: dict[str, deque[float]] = {}
    cards_ewm: dict[str, float] = {}

    # Estado causal por árbitro: ref_slug -> [n_games, sum_home_win, sum_draw]
    ref_stats: dict[str, list[float]] = {}
    alpha8 = 2.0 / (8.0 + 1.0)
    alpha10 = 2.0 / (10.0 + 1.0)

    dates_ord = pd.to_datetime(ordered["match_date"]).map(lambda d: d.toordinal()).to_numpy(dtype=np.int64)
    divs = ordered["div"].astype(str).to_numpy()
    seasons = ordered["season"].astype(str).to_numpy()
    hts = ordered["home_team"].astype(str).to_numpy()
    ats = ordered["away_team"].astype(str).to_numpy()
    hgs = pd.to_numeric(ordered["home_goals"], errors="coerce").to_numpy(dtype=np.float64)
    ags = pd.to_numeric(ordered["away_goals"], errors="coerce").to_numpy(dtype=np.float64)
    hthgs = pd.to_numeric(ordered.get("ht_home_goals", np.nan), errors="coerce").to_numpy(dtype=np.float64)
    htags = pd.to_numeric(ordered.get("ht_away_goals", np.nan), errors="coerce").to_numpy(dtype=np.float64)
    y_h = pd.to_numeric(ordered.get("yellows_home", np.nan), errors="coerce").to_numpy(dtype=np.float64)
    y_a = pd.to_numeric(ordered.get("yellows_away", np.nan), errors="coerce").to_numpy(dtype=np.float64)
    r_h = pd.to_numeric(ordered.get("reds_home", np.nan), errors="coerce").to_numpy(dtype=np.float64)
    r_a = pd.to_numeric(ordered.get("reds_away", np.nan), errors="coerce").to_numpy(dtype=np.float64)
    refs = ordered.get("referee", pd.Series([""] * n)).fillna("").astype(str).str.strip().str.lower().to_numpy()

    for i in range(n):
        d_ord = int(dates_ord[i])
        dv = divs[i]
        sn = seasons[i]
        ht = f"{dv}::{hts[i]}"
        at = f"{dv}::{ats[i]}"

        # 1. Emitir features estrictamente PRE-PARTIDO
        pr_h_tup = last_reds.get((dv, sn, hts[i]))
        pr_a_tup = last_reds.get((dv, sn, ats[i]))
        pr_h = pr_h_tup[1] if (pr_h_tup is not None and (d_ord - pr_h_tup[0]) <= 25) else 0.0
        pr_a = pr_a_tup[1] if (pr_a_tup is not None and (d_ord - pr_a_tup[0]) <= 25) else 0.0
        # Positivo si el visitante trae más expulsados sancionados que el local
        prev_reds_diff[i] = min(2.0, pr_a) - min(2.0, pr_h)

        rc_clean_gd_ewm8_diff[i] = rc_gd_ewm.get(ht, 0.0) - rc_gd_ewm.get(at, 0.0)
        ht_gd_ewm8_diff[i] = ht_gd_ewm.get(ht, 0.0) - ht_gd_ewm.get(at, 0.0)

        hl_h = float(np.mean(ht_lead_hist[ht])) if (ht in ht_lead_hist and len(ht_lead_hist[ht]) > 0) else 0.30
        hl_a = float(np.mean(ht_lead_hist[at])) if (at in ht_lead_hist and len(ht_lead_hist[at]) > 0) else 0.30
        ht_lead_r10_diff[i] = hl_h - hl_a

        disc_cards_ewm10_diff[i] = cards_ewm.get(at, 2.0) - cards_ewm.get(ht, 2.0)

        rf = refs[i]
        if rf and rf in ref_stats:
            cnt_r, shw_r, sdr_r = ref_stats[rf]
            ref_home_bias[i] = (shw_r - 0.45 * cnt_r) / (cnt_r + 30.0)
            ref_draw_bias[i] = (sdr_r - 0.26 * cnt_r) / (cnt_r + 30.0)

        # 2. Actualizar acumuladores POST-PARTIDO (solo si hay resultado válido)
        if not (math.isfinite(hgs[i]) and math.isfinite(ags[i])):
            continue

        obs_rh = float(r_h[i]) if math.isfinite(r_h[i]) else 0.0
        obs_ra = float(r_a[i]) if math.isfinite(r_a[i]) else 0.0
        last_reds[(dv, sn, hts[i])] = (d_ord, obs_rh)
        last_reds[(dv, sn, ats[i])] = (d_ord, obs_ra)

        gd = max(-5.0, min(5.0, hgs[i] - ags[i]))
        # Si hubo desequilibrio de expulsiones (`11v10`), amortiguar el GD para no contaminar la forma 11v11
        rc_weight = 0.40 if abs(obs_rh - obs_ra) >= 1.0 else 1.0
        adj_gd = gd * rc_weight
        rc_gd_ewm[ht] = (1.0 - alpha8) * rc_gd_ewm.get(ht, 0.0) + alpha8 * adj_gd
        rc_gd_ewm[at] = (1.0 - alpha8) * rc_gd_ewm.get(at, 0.0) - alpha8 * adj_gd

        if math.isfinite(hthgs[i]) and math.isfinite(htags[i]):
            ht_gd = max(-3.0, min(3.0, hthgs[i] - htags[i]))
            ht_gd_ewm[ht] = (1.0 - alpha8) * ht_gd_ewm.get(ht, 0.0) + alpha8 * ht_gd
            ht_gd_ewm[at] = (1.0 - alpha8) * ht_gd_ewm.get(at, 0.0) - ht_gd
            ht_lead_hist.setdefault(ht, deque(maxlen=10)).append(1.0 if hthgs[i] > htags[i] else 0.0)
            ht_lead_hist.setdefault(at, deque(maxlen=10)).append(1.0 if htags[i] > hthgs[i] else 0.0)

        if math.isfinite(y_h[i]) and math.isfinite(y_a[i]):
            ch_pts = y_h[i] + 2.5 * obs_rh
            ca_pts = y_a[i] + 2.5 * obs_ra
            cards_ewm[ht] = (1.0 - alpha10) * cards_ewm.get(ht, 2.0) + alpha10 * ch_pts
            cards_ewm[at] = (1.0 - alpha10) * cards_ewm.get(at, 2.0) + alpha10 * ca_pts

        if rf:
            st_r = ref_stats.get(rf)
            if st_r is None:
                st_r = [0.0, 0.0, 0.0]
                ref_stats[rf] = st_r
            st_r[0] += 1.0
            if hgs[i] > ags[i]:
                st_r[1] += 1.0
            elif hgs[i] == ags[i]:
                st_r[2] += 1.0

    return pd.DataFrame(
        {
            "match_id": ordered["match_id"].astype(str),
            "prev_reds_diff": prev_reds_diff,
            "rc_clean_gd_ewm8_diff": rc_clean_gd_ewm8_diff,
            "ht_gd_ewm8_diff": ht_gd_ewm8_diff,
            "ht_lead_r10_diff": ht_lead_r10_diff,
            "disc_cards_ewm10_diff": disc_cards_ewm10_diff,
            "ref_home_bias_prior": ref_home_bias,
            "ref_draw_bias_prior": ref_draw_bias,
        }
    )
