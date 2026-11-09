"""Rosetta Stone & REA-Stats Evidence Integration for PitchLab.

This module unifies identifiers and taxonomies across:
1. Stats Perform / Opta SDAPI (25-char base-36 UUIDs for competitions, matches, teams, and persons)
2. API-Football / api-sports.io (numeric integer IDs for leagues, teams, logos, and photos)
3. PitchLab & football-data.co.uk division codes (e.g. E0, SP1, D1, I1, F1, MEX, ARG, BRA, USA)
4. Opta 177-attribute catalog (traits, Spanish/English labels, categories, and metric polarity)
5. REA-Stats structured evidence payloads (rolling xG series, manager stints, 7-axis team profiles)
"""

from __future__ import annotations

import json
import logging
import os
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default Division Codes Mapping (API-Football ID -> Division Code)
# ---------------------------------------------------------------------------
API_FOOTBALL_TO_DIV_CODE: Dict[int, str] = {
    # Core European & International Leagues
    39: "E0",       # Premier League (England Tier 1)
    40: "E1",       # Championship (England Tier 2)
    140: "SP1",     # Primera División / LaLiga (Spain Tier 1)
    141: "SP2",     # Segunda División (Spain Tier 2)
    135: "I1",      # Serie A (Italy Tier 1)
    136: "I2",      # Serie B (Italy Tier 2)
    78: "D1",       # Bundesliga (Germany Tier 1)
    79: "D2",       # 2. Bundesliga (Germany Tier 2)
    61: "F1",       # Ligue 1 (France Tier 1)
    62: "F2",       # Ligue 2 (France Tier 2)
    88: "N1",       # Eredivisie (Netherlands Tier 1)
    94: "P1",       # Primeira Liga (Portugal Tier 1)
    144: "B1",      # First Division A / Pro League (Belgium Tier 1)
    203: "T1",      # Süper Lig (Türkiye Tier 1)
    197: "G1",      # Super League 1 (Greece Tier 1)
    179: "SC0",     # Premiership (Scotland Tier 1)
    262: "MEX",     # Liga MX (Mexico Tier 1)
    128: "ARG",     # Liga Profesional Argentina (Argentina Tier 1)
    71: "BRA",      # Serie A (Brazil Tier 1)
    253: "USA",     # Major League Soccer (USA Tier 1)
    # Secondary / Additional Mappings
    119: "DNK",     # Superliga (Denmark)
    207: "SUI",     # Super League (Switzerland)
    210: "CRO",     # HNL (Croatia)
    235: "RUS",     # Premier League (Russia)
    242: "ECU",     # Liga Pro (Ecuador)
    250: "PAR",     # Division Profesional (Paraguay)
    254: "NWSL",    # National Women's Soccer League (USA)
    255: "USLC",    # USL Championship (USA Tier 2)
    263: "MEX2",    # Liga de Expansión MX (Mexico Tier 2)
    265: "CHL",     # Primera División (Chile)
    281: "PER",     # Liga 1 (Peru)
    299: "VEN",     # Primera División (Venezuela)
    305: "QAT",     # Stars League (Qatar)
    307: "SAU",     # Saudi League (Saudi Arabia)
    489: "USL1",    # USL League One (USA Tier 3)
    673: "MEX_F",   # Liga MX Femenil (Mexico)
    142: "SP_F",    # Primera División Femenina (Spain)
    44: "WSL",      # Women's Super League (England)
    72: "BRA2",     # Serie B (Brazil Tier 2)
    909: "MLS_NP",  # MLS Next Pro (USA)
}

# Inverted mapping
DIV_CODE_TO_API_FOOTBALL: Dict[str, int] = {
    code: api_id for api_id, code in API_FOOTBALL_TO_DIV_CODE.items()
}

# Known Active Tournament Calendar UUIDs (season_tmcl) -> Opta Competition UUID
KNOWN_TMCL_TO_OPTA_COMP: Dict[str, str] = {
    "9zum4nxferygj8bb0ldcavxn8": "2hsidwomhjsaaytdy9u5niyi4",  # Liga MX 2026/2027
    "aegyls91smdw9kipjgbsu8tn8": "2hsidwomhjsaaytdy9u5niyi4",  # Liga MX 2025/2026
    "6i6n0jkbh9zzij6s8htfjh2j8": "287tckirbfj9nb8ar2k9r60vn",  # MLS 2026
}

# Known Tournament Calendar Info
KNOWN_TMCL_DETAILS: Dict[str, Dict[str, str]] = {
    "9zum4nxferygj8bb0ldcavxn8": {
        "season": "2026/2027",
        "competition_uuid": "2hsidwomhjsaaytdy9u5niyi4",
        "league_name": "Liga MX",
        "division_code": "MEX",
    },
    "aegyls91smdw9kipjgbsu8tn8": {
        "season": "2025/2026",
        "competition_uuid": "2hsidwomhjsaaytdy9u5niyi4",
        "league_name": "Liga MX",
        "division_code": "MEX",
    },
    "6i6n0jkbh9zzij6s8htfjh2j8": {
        "season": "2026",
        "competition_uuid": "287tckirbfj9nb8ar2k9r60vn",
        "league_name": "MLS",
        "division_code": "USA",
    },
}

# Lower-is-better metrics (defense, errors, disciplinary, concessions, PPDA)
# These metrics indicate superior performance when numerical value is lower.
LOWER_IS_BETTER_KEYWORDS = {
    "conceded",
    "concedido",
    "concedidos",
    "concedidas",
    "recibido",
    "recibidos",
    "recibidas",
    "error",
    "errores",
    "foul",
    "fouls",
    "falta",
    "faltas",
    "yellow_card",
    "red_card",
    "tarjeta",
    "tarjetas",
    "loss",
    "losses",
    "perdida",
    "perdidas",
    "own goal",
    "autogol",
    "autogoles",
    "penalty_goals_conceded",
    "penalties_conceded",
    "ppda",
    "possession_loss_rate",
    "counter_exposure",
    "points_dropped_from_winning_positions",
    "times_tackled",
    "unsuccessfultouch",
    "dangerousplay",
    "offsides",
    "drops",
}

# Exact keys that are lower_is_better
EXACT_LOWER_IS_BETTER_KEYS = {
    "ppda",
    "fouls_per_match",
    "yellow_cards_per_match",
    "red_cards_per_match",
    "goals_conceded_per_match",
    "shots_conceded_per_match",
    "possession_loss_rate",
    "pressing_intensity",
    "counter_exposure",
    "total_big_chances_missed",
    "times_tackled",
    "unsuccessfultouch",
    "total_losses_of_possession",
    "goals_conceded",
    "goals_conceded_inside_box",
    "goals_conceded_outside_box",
    "penalty_goals_conceded",
    "total_shots_conceded",
    "attemptsconcededibox",
    "attemptsconcededobox",
    "number_of_opposition_passes",
    "expected_goals_conceded",
    "non_penalty_expected_goals_conceded",
    "open_play_expected_goals_conceded",
    "expected_goals_on_target_conceded",
    "non_penalty_expected_goals_on_target_conceded",
    "duels_lost",
    "ground_duels_lost",
    "lostcorners",
    "drops",
    "total_fouls_conceded",
    "penalties_conceded",
    "handballs_conceded",
    "dangerousplay",
    "offsides",
    "yellow_cards",
    "red_card_2nd_yellow",
    "straight_red_cards",
    "total_red_cards",
    "errorleadtogoal",
    "errorleadtoshot",
    "own_goals_conceded",
    "own_goal_scored",
    "tackles_lost",
    "points_dropped_from_winning_positions",
}

# Canonical team dictionary with rich aliases
CANONICAL_TEAM_ALIASES: Dict[str, Dict[str, Any]] = {
    "pumas-unam": {
        "slug": "pumas-unam",
        "opta_team_uuid": "ayabrorjqa1bj7jk1fdqu1t57",
        "api_football_team_id": 2286,
        "name": "Pumas UNAM",
        "aliases": ["pumas", "unam", "pumas unam", "club universidad nacional", "universidad nacional"],
    },
    "club-america": {
        "slug": "club-america",
        "opta_team_uuid": "eu8c408f59yx7egaqossbv25e",
        "api_football_team_id": 2287,
        "name": "Club América",
        "aliases": ["america", "cf america", "club america", "aguilas", "las aguilas", "las águilas"],
    },
    "toluca": {
        "slug": "toluca",
        "opta_team_uuid": "3390h9hdgoxzzofnrpyktanuz",
        "api_football_team_id": 2281,
        "name": "Deportivo Toluca",
        "aliases": ["toluca", "deportivo toluca", "diablos rojos", "diablos"],
    },
    "tijuana": {
        "slug": "tijuana",
        "opta_team_uuid": "c1wcescnsnfuyv06enhwaoqr6",
        "api_football_team_id": 2280,
        "name": "Club Tijuana",
        "aliases": ["tijuana", "xolos", "xolos de tijuana", "club tijuana"],
    },
    "pachuca": {
        "slug": "pachuca",
        "opta_team_uuid": "cynfvfb31rml7xrlsnejf8r6j",
        "api_football_team_id": 2292,
        "name": "CF Pachuca",
        "aliases": ["pachuca", "tuzos", "cf pachuca", "tuzos del pachuca"],
    },
    "atlas": {
        "slug": "atlas",
        "opta_team_uuid": "8jjxbd5vr23vhu1v5r21rzkrn",
        "api_football_team_id": 2283,
        "name": "Atlas FC",
        "aliases": ["atlas", "atlas fc", "rojinegros", "zorros"],
    },
    "leon": {
        "slug": "leon",
        "opta_team_uuid": "2ei66pjfsrr6uxqp1bywq31lo",
        "api_football_team_id": 2289,
        "name": "Club León",
        "aliases": ["leon", "león", "club leon", "club león", "panzas verdes", "la fiera"],
    },
    "monterrey": {
        "slug": "monterrey",
        "opta_team_uuid": "233335xtoe3e3phg3hp91xguq",
        "api_football_team_id": 2282,
        "name": "CF Monterrey",
        "aliases": ["monterrey", "rayados", "rayados de monterrey", "cf monterrey"],
    },
    "necaxa": {
        "slug": "necaxa",
        "opta_team_uuid": "b7hn6knkuxbpj1i8rmzapns7b",
        "api_football_team_id": 2288,
        "name": "Club Necaxa",
        "aliases": ["necaxa", "club necaxa", "rayos", "rayos del necaxa"],
    },
    "guadalajara": {
        "slug": "guadalajara",
        "opta_team_uuid": "e603sojy77s4u0ypqds2v2a1g",
        "api_football_team_id": 2278,
        "name": "CD Guadalajara",
        "aliases": ["chivas", "chivas guadalajara", "guadalajara", "cd guadalajara", "rebaño sagrado"],
    },
    "cruz-azul": {
        "slug": "cruz-azul",
        "opta_team_uuid": "1aw67co8uut64yckd3wbhy9t2",
        "api_football_team_id": 2295,
        "name": "Cruz Azul",
        "aliases": ["cruz azul", "la maquina", "la máquina", "cementeros", "la maquina celeste"],
    },
    "puebla": {
        "slug": "puebla",
        "opta_team_uuid": "4kw25nmgmacpbvo24ttr994k5",
        "api_football_team_id": 2291,
        "name": "Club Puebla",
        "aliases": ["puebla", "club puebla", "la franja", "franja", "camoteros"],
    },
    "juarez": {
        "slug": "juarez",
        "opta_team_uuid": "ecphe4bqgmin2tzsohf50egvd",
        "api_football_team_id": 2298,
        "name": "FC Juárez",
        "aliases": ["juarez", "juárez", "fc juarez", "fc juárez", "bravos", "bravos de juarez"],
    },
    "atletico-san-luis": {
        "slug": "atletico-san-luis",
        "opta_team_uuid": "54ph1k82y99hhjsf7m2usns8u",
        "api_football_team_id": 2314,
        "name": "Atlético de San Luis",
        "aliases": ["atletico san luis", "atlético san luis", "san luis", "atletico de san luis", "atlético de san luis"],
    },
    "santos-laguna": {
        "slug": "santos-laguna",
        "opta_team_uuid": "8yn3l36qkq1fxbw4ufmwyfyt9",
        "api_football_team_id": 2285,
        "name": "Club Santos Laguna",
        "aliases": ["santos", "santos laguna", "club santos laguna", "guerreros"],
    },
    "atlante": {
        "slug": "atlante",
        "opta_team_uuid": "evyhlelybkbj2vry2xhct08pb",
        "api_football_team_id": 2312,
        "name": "CF Atlante",
        "aliases": ["atlante", "cf atlante", "potros de hierro", "los potros"],
    },
    "queretaro": {
        "slug": "queretaro",
        "opta_team_uuid": "ccye1b5fvtq8tzlz0gosyw10b",
        "api_football_team_id": 2290,
        "name": "Querétaro FC",
        "aliases": ["queretaro", "querétaro", "gallos blancos", "queretaro fc", "gallos"],
    },
    "inter-miami": {
        "slug": "inter-miami",
        "opta_team_uuid": "7a7uyvix8axi28h7d3bwl4tbe",
        "api_football_team_id": 9568,
        "name": "Inter Miami CF",
        "aliases": ["inter miami", "miami", "inter miami cf", "las garzas"],
    },
    "tigres-uanl": {
        "slug": "tigres-uanl",
        "opta_team_uuid": "6hmo9mrlz73nwxkshwuu5vsfm",
        "api_football_team_id": 2279,
        "name": "Tigres UANL",
        "aliases": ["tigres", "uanl", "tigres uanl", "felinos", "los tigres"],
    },
}


def normalize_string(val: Any) -> str:
    """Normalize string by removing diacritics, lowercase, and stripping."""
    if val is None:
        return ""
    text = str(val).strip()
    norm = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return norm.lower()


def slugify(val: Any, delimiter: str = "-") -> str:
    """Generate clean slug from string using specified delimiter."""
    norm = normalize_string(val)
    slug = re.sub(r"[^a-zA-Z0-9]+", delimiter, norm).strip(delimiter)
    return slug


class RosettaStatiskicks:
    """Rosetta Stone service for Statiskicks, Opta SDAPI, API-Football and PitchLab."""

    def __init__(self, data_dir: Optional[Union[str, Path]] = None) -> None:
        """Initialize the Rosetta stone with the directory containing JSON datasets.

        If data_dir is not provided, it looks in standard relative paths:
        1. research/prediction-lab/data/rosetta
        2. ../data/rosetta
        3. ./data/rosetta
        """
        self.data_dir = self._resolve_data_dir(data_dir)
        self._leagues_data: Dict[str, Any] = {}
        self._teams_data: Dict[str, Any] = {}
        self._catalog_data: Dict[str, Any] = {}
        self._rolling_xg_data: Optional[Dict[str, Any]] = None
        self._percentiles_data: Optional[Dict[str, Any]] = None
        self._attribute_charts_data: Optional[Dict[str, Any]] = None

        # Lookups
        self._leagues_by_opta: Dict[str, Dict[str, Any]] = {}
        self._leagues_by_api: Dict[int, Dict[str, Any]] = {}
        self._leagues_by_div: Dict[str, Dict[str, Any]] = {}
        self._leagues_by_slug: Dict[str, Dict[str, Any]] = {}

        self._teams_by_opta: Dict[str, Dict[str, Any]] = {}
        self._teams_by_api: Dict[int, Dict[str, Any]] = {}
        self._teams_by_slug: Dict[str, Dict[str, Any]] = {}
        self._teams_by_alias: Dict[str, Dict[str, Any]] = {}

        self._attributes_by_key: Dict[str, Dict[str, Any]] = {}
        self._attributes_by_norm: Dict[str, Dict[str, Any]] = {}
        self._attributes_by_category: Dict[str, List[Dict[str, Any]]] = {}

        self._load_datasets()

    @staticmethod
    def _resolve_data_dir(custom_path: Optional[Union[str, Path]]) -> Path:
        """Find the rosetta data directory."""
        if custom_path:
            p = Path(custom_path)
            if p.exists():
                return p.resolve()

        # Potential default search locations relative to this file
        current_dir = Path(__file__).resolve().parent
        candidates = [
            current_dir.parent / "data" / "rosetta",
            current_dir / "data" / "rosetta",
            Path.cwd() / "research" / "prediction-lab" / "data" / "rosetta",
            Path.cwd() / "data" / "rosetta",
        ]
        for candidate in candidates:
            if candidate.exists() and candidate.is_dir():
                return candidate.resolve()

        # Fallback to current_dir.parent / 'data' / 'rosetta'
        return (current_dir.parent / "data" / "rosetta").resolve()

    def _load_json_file(self, filename: str) -> Optional[Dict[str, Any]]:
        """Load a JSON dataset from data_dir."""
        file_path = self.data_dir / filename
        if not file_path.exists():
            logger.warning(f"Rosetta file not found: {file_path}")
            return None
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _load_datasets(self) -> None:
        """Load all core JSON files and construct indexing tables."""
        # 1. 40 Leagues
        leagues_json = self._load_json_file("rosetta-40-leagues-opta-apifootball.json")
        if leagues_json:
            self._leagues_data = leagues_json
            for lg in leagues_json.get("leagues", []):
                opta_id = lg.get("opta_competition_uuid")
                api_id = lg.get("api_football_league_id")
                name = lg.get("name", "")

                # Assign division code if mapped
                div_code = API_FOOTBALL_TO_DIV_CODE.get(api_id)
                lg_record = dict(lg)
                lg_record["division_code"] = div_code

                if opta_id:
                    self._leagues_by_opta[opta_id.lower()] = lg_record
                if api_id is not None:
                    self._leagues_by_api[int(api_id)] = lg_record
                if div_code:
                    self._leagues_by_div[div_code.upper()] = lg_record

                slug = slugify(name)
                self._leagues_by_slug[slug] = lg_record
                # Country-specific slug if multiple leagues have same name (e.g. Serie A)
                country = lg.get("country", "")
                if country:
                    country_slug = f"{slug}-{slugify(country)}"
                    self._leagues_by_slug[country_slug] = lg_record

        # 2. Teams
        teams_json = self._load_json_file("rosetta-teams-opta-apifootball.json")
        if teams_json:
            self._teams_data = teams_json
            for tm in teams_json.get("teams", []):
                slug = tm.get("slug")
                opta_id = tm.get("opta_team_uuid")
                api_id = tm.get("api_football_team_id")

                # Merge with canonical info if available
                canonical_info = CANONICAL_TEAM_ALIASES.get(slug, {})
                team_record = {
                    "slug": slug,
                    "opta_team_uuid": opta_id,
                    "api_football_team_id": api_id,
                    "name": canonical_info.get("name", slug.replace("-", " ").title()),
                    "aliases": canonical_info.get("aliases", []),
                }

                if opta_id:
                    self._teams_by_opta[opta_id.lower()] = team_record
                if api_id is not None:
                    self._teams_by_api[int(api_id)] = team_record
                if slug:
                    self._teams_by_slug[slug] = team_record
                    self._teams_by_slug[slug.replace("-", "_")] = team_record

                # Index aliases
                for alias in team_record["aliases"]:
                    norm_alias = normalize_string(alias)
                    self._teams_by_alias[norm_alias] = team_record

        # 3. 177 Opta Attributes Catalog
        catalog_json = self._load_json_file("rosetta-177-opta-attributes-catalog.json")
        if catalog_json:
            self._catalog_data = catalog_json
            for cat in catalog_json.get("categories", []):
                cat_name = cat.get("category", "")
                self._attributes_by_category[cat_name] = []
                for attr in cat.get("attributes", []):
                    attr_rec = dict(attr)
                    attr_rec["category"] = cat_name

                    # Determine polarity
                    key_str = attr_rec.get("key", "")
                    label_str = attr_rec.get("label", "")
                    is_lower = self.is_lower_better(key_str) or self.is_lower_better(label_str)
                    attr_rec["lower_is_better"] = is_lower
                    attr_rec["higher_is_better"] = not is_lower

                    self._attributes_by_key[key_str] = attr_rec
                    self._attributes_by_norm[normalize_string(key_str)] = attr_rec
                    self._attributes_by_norm[normalize_string(label_str)] = attr_rec
                    self._attributes_by_norm[slugify(key_str, "_")] = attr_rec
                    self._attributes_by_norm[slugify(label_str, "_")] = attr_rec
                    self._attributes_by_category[cat_name].append(attr_rec)

    # -----------------------------------------------------------------------
    # League Resolution
    # -----------------------------------------------------------------------
    def resolve_league(self, identifier: Union[str, int]) -> Optional[Dict[str, Any]]:
        """Resolve a league by any valid identifier.

        Accepts:
        - Opta 25-char base-36 competition UUID (e.g. '2hsidwomhjsaaytdy9u5niyi4')
        - Opta tournamentCalendar UUID (e.g. '9zum4nxferygj8bb0ldcavxn8')
        - API-Football numeric league ID (e.g. 262, '262')
        - Division code (e.g. 'MEX', 'E0', 'SP1', 'D1')
        - League name or slug (e.g. 'Liga MX', 'liga-mx', 'Bundesliga')
        """
        if identifier is None:
            return None

        # 1. Check numeric API-Football ID
        if isinstance(identifier, int):
            if identifier in self._leagues_by_api:
                return self._leagues_by_api[identifier]
            if identifier in API_FOOTBALL_TO_DIV_CODE:
                return {
                    "opta_competition_uuid": None,
                    "api_football_league_id": identifier,
                    "name": "Ligue 2" if identifier == 62 else f"League {identifier}",
                    "division_code": API_FOOTBALL_TO_DIV_CODE[identifier],
                }
            return None

        ident_str = str(identifier).strip()
        if not ident_str:
            return None

        if ident_str.isdigit():
            api_id = int(ident_str)
            if api_id in self._leagues_by_api:
                return self._leagues_by_api[api_id]
            if api_id in API_FOOTBALL_TO_DIV_CODE:
                return {
                    "opta_competition_uuid": None,
                    "api_football_league_id": api_id,
                    "name": "Ligue 2" if api_id == 62 else f"League {api_id}",
                    "division_code": API_FOOTBALL_TO_DIV_CODE[api_id],
                }
            return None

        ident_lower = ident_str.lower()
        ident_upper = ident_str.upper()

        # 2. Check Opta Competition UUID
        if ident_lower in self._leagues_by_opta:
            return self._leagues_by_opta[ident_lower]

        # 3. Check Tournament Calendar UUID (season_tmcl)
        if ident_lower in KNOWN_TMCL_TO_OPTA_COMP:
            comp_uuid = KNOWN_TMCL_TO_OPTA_COMP[ident_lower]
            return self._leagues_by_opta.get(comp_uuid)

        # 4. Check Division Code
        if ident_upper in self._leagues_by_div:
            return self._leagues_by_div[ident_upper]

        # Check if division code maps to API-Football
        if ident_upper in DIV_CODE_TO_API_FOOTBALL:
            api_id = DIV_CODE_TO_API_FOOTBALL[ident_upper]
            if api_id in self._leagues_by_api:
                return self._leagues_by_api[api_id]
            return {
                "opta_competition_uuid": None,
                "api_football_league_id": api_id,
                "name": "Ligue 2" if ident_upper == "F2" else ident_upper,
                "division_code": ident_upper,
            }

        # 5. Check League Slug / Name
        slug = slugify(ident_str)
        if slug in self._leagues_by_slug:
            return self._leagues_by_slug[slug]

        # Check substring match against league names
        norm = normalize_string(ident_str)
        for lg in self._leagues_by_opta.values():
            if norm == normalize_string(lg.get("name")):
                return lg

        return None

    def get_division_code(self, identifier: Union[str, int]) -> Optional[str]:
        """Get the football-data / PitchLab division code for a league."""
        if identifier is None:
            return None

        # Check numeric API ID directly
        if isinstance(identifier, int) and identifier in API_FOOTBALL_TO_DIV_CODE:
            return API_FOOTBALL_TO_DIV_CODE[identifier]

        ident_str = str(identifier).strip()
        if not ident_str:
            return None

        if ident_str.isdigit():
            api_id = int(ident_str)
            if api_id in API_FOOTBALL_TO_DIV_CODE:
                return API_FOOTBALL_TO_DIV_CODE[api_id]

        ident_upper = ident_str.upper()
        if ident_upper in DIV_CODE_TO_API_FOOTBALL or ident_upper in self._leagues_by_div:
            return ident_upper

        lg = self.resolve_league(identifier)
        if lg:
            return lg.get("division_code")
        return None

    def get_opta_competition_uuid(self, identifier: Union[str, int]) -> Optional[str]:
        """Get the Opta 25-char base-36 competition UUID for a league."""
        lg = self.resolve_league(identifier)
        if lg:
            return lg.get("opta_competition_uuid")
        return None

    def get_api_football_league_id(self, identifier: Union[str, int]) -> Optional[int]:
        """Get the API-Football numeric ID for a league."""
        lg = self.resolve_league(identifier)
        if lg:
            return lg.get("api_football_league_id")
        return None

    def get_active_tmcl(self, identifier: Union[str, int]) -> Optional[str]:
        """Get known active tournamentCalendar (season_tmcl) UUID for a league."""
        lg = self.resolve_league(identifier)
        if not lg:
            return None
        opta_id = lg.get("opta_competition_uuid")
        for tmcl, comp_uuid in KNOWN_TMCL_TO_OPTA_COMP.items():
            if comp_uuid == opta_id:
                return tmcl
        return None

    def list_leagues(self) -> List[Dict[str, Any]]:
        """Return list of all 40 leagues with resolved attributes."""
        return list(self._leagues_by_opta.values())

    # -----------------------------------------------------------------------
    # Team Entity Resolution
    # -----------------------------------------------------------------------
    def resolve_team(self, identifier: Union[str, int]) -> Optional[Dict[str, Any]]:
        """Resolve a team across Opta UUIDs, API-Football IDs, slugs, and aliases.

        Accepts:
        - Opta contestant UUID (e.g. 'eu8c408f59yx7egaqossbv25e')
        - API-Football numeric team ID (e.g. 2287, '2287')
        - Canonical team slug (e.g. 'club-america')
        - Common team name or alias (e.g. 'Club América', 'América', 'Chivas', 'Pumas')
        """
        if identifier is None:
            return None

        # 1. Numeric API-Football ID
        if isinstance(identifier, int):
            return self._teams_by_api.get(identifier)

        ident_str = str(identifier).strip()
        if not ident_str:
            return None

        if ident_str.isdigit():
            return self._teams_by_api.get(int(ident_str))

        ident_lower = ident_str.lower()

        # 2. Opta Contestant UUID
        if ident_lower in self._teams_by_opta:
            return self._teams_by_opta[ident_lower]

        # 3. Direct Slug
        slug = slugify(ident_str)
        if slug in self._teams_by_slug:
            return self._teams_by_slug[slug]

        # 4. Normalized Alias
        norm = normalize_string(ident_str)
        if norm in self._teams_by_alias:
            return self._teams_by_alias[norm]

        # Fuzzy check: starts with or contained in alias
        for alias, team in self._teams_by_alias.items():
            if norm == alias or (len(norm) >= 4 and norm in alias):
                return team

        return None

    def normalize_team_name(self, name: str) -> str:
        """Normalize team name to canonical slug or normalized string."""
        team = self.resolve_team(name)
        if team:
            return team["slug"]
        return slugify(name)

    def list_teams(self) -> List[Dict[str, Any]]:
        """Return list of unique registered teams."""
        unique_teams: Dict[str, Dict[str, Any]] = {}
        for tm in self._teams_by_opta.values():
            unique_teams[tm["slug"]] = tm
        return list(unique_teams.values())

    # -----------------------------------------------------------------------
    # Opta 177 Attributes Catalog
    # -----------------------------------------------------------------------
    def get_opta_attribute(self, code_or_label: str) -> Optional[Dict[str, Any]]:
        """Lookup an Opta attribute by key, label, or normalized identifier."""
        if not code_or_label:
            return None

        key_str = str(code_or_label).strip()

        # Direct exact match
        if key_str in self._attributes_by_key:
            return self._attributes_by_key[key_str]

        # Normalized match
        norm = normalize_string(key_str)
        if norm in self._attributes_by_norm:
            return self._attributes_by_norm[norm]

        # Slug match
        slug = slugify(key_str, "_")
        if slug in self._attributes_by_norm:
            return self._attributes_by_norm[slug]

        return None

    def list_attributes_by_category(self, category: str) -> List[Dict[str, Any]]:
        """List all Opta attributes in a specific category."""
        norm_cat = normalize_string(category)
        for cat_name, attrs in self._attributes_by_category.items():
            if normalize_string(cat_name) == norm_cat:
                return attrs
        return []

    def list_categories(self) -> List[str]:
        """Return all catalog category names."""
        return list(self._attributes_by_category.keys())

    @staticmethod
    def is_lower_better(metric: Union[str, Dict[str, Any]]) -> bool:
        """Classify metric polarity: returns True if lower numerical value is better."""
        if isinstance(metric, dict):
            if "lower_is_better" in metric:
                return bool(metric["lower_is_better"])
            if "lowerIsBetter" in metric:
                return bool(metric["lowerIsBetter"])
            metric_str = metric.get("key") or metric.get("raw_name") or metric.get("label", "")
        else:
            metric_str = str(metric)

        norm_slug = slugify(metric_str, "_")
        if norm_slug in EXACT_LOWER_IS_BETTER_KEYS:
            return True

        norm_text = normalize_string(metric_str)
        for kw in LOWER_IS_BETTER_KEYWORDS:
            if kw in norm_text or kw in norm_slug:
                # Exceptions: e.g. "fouls won" is positive
                if "foul" in kw and ("won" in norm_text or "recibida" in norm_text or "ganado" in norm_text):
                    continue
                return True
        return False

    @staticmethod
    def is_higher_better(metric: Union[str, Dict[str, Any]]) -> bool:
        """Classify metric polarity: returns True if higher value is better."""
        return not RosettaStatiskicks.is_lower_better(metric)

    # -----------------------------------------------------------------------
    # Rolling xG & Manager Changes Extraction
    # -----------------------------------------------------------------------
    def extract_rolling_xg_series(
        self, data_or_path: Optional[Union[dict, str, Path]] = None
    ) -> Dict[str, Any]:
        """Extract rolling xG series and manager-change series.

        Loads data from `team-america-54matches-xg-rolling.json` or provided dict/path.
        Returns match-level metrics, rolling averages, coach change points,
        and manager stint comparisons.
        """
        if data_or_path is None:
            if self._rolling_xg_data is None:
                self._rolling_xg_data = self._load_json_file("team-america-54matches-xg-rolling.json")
            data = self._rolling_xg_data
        elif isinstance(data_or_path, (str, Path)):
            with open(data_or_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        else:
            data = data_or_path

        if not data:
            return {}

        points = data.get("points", [])
        coach_changes = data.get("coach_changes", [])
        season_starts = data.get("season_starts", [])
        window = data.get("window", 5)

        # Compute manager stints
        stints: Dict[str, Dict[str, Any]] = {}
        for idx, pt in enumerate(points):
            manager = pt.get("manager", "Unknown")
            if manager not in stints:
                stints[manager] = {
                    "manager": manager,
                    "first_index": idx,
                    "last_index": idx,
                    "matches": 0,
                    "total_xg": 0.0,
                    "total_xga": 0.0,
                    "goals_for": 0,
                    "goals_against": 0,
                }
            stint = stints[manager]
            stint["last_index"] = idx
            stint["matches"] += 1
            stint["total_xg"] += float(pt.get("xg", 0.0) or 0.0)
            stint["total_xga"] += float(pt.get("xga", 0.0) or 0.0)

            score = pt.get("score", "")
            if "-" in score:
                try:
                    gf, ga = map(int, score.split("-"))
                    stint["goals_for"] += gf
                    stint["goals_against"] += ga
                except ValueError:
                    pass

        # Calculate averages for stints
        stint_summaries = []
        for stint in stints.values():
            n = max(1, stint["matches"])
            stint_summaries.append({
                "manager": stint["manager"],
                "matches": stint["matches"],
                "first_index": stint["first_index"],
                "last_index": stint["last_index"],
                "mean_xg": round(stint["total_xg"] / n, 4),
                "mean_xga": round(stint["total_xga"] / n, 4),
                "xg_diff": round((stint["total_xg"] - stint["total_xga"]) / n, 4),
                "goals_for": stint["goals_for"],
                "goals_against": stint["goals_against"],
            })

        return {
            "status": data.get("status", "ready"),
            "window": window,
            "matches_count": len(points),
            "first_season": data.get("first_season", ""),
            "last_values": data.get("last", {}),
            "coach_changes": coach_changes,
            "season_starts": season_starts,
            "points": points,
            "stints": stint_summaries,
        }

    # -----------------------------------------------------------------------
    # 7-Axis Profile Percentiles Extraction
    # -----------------------------------------------------------------------
    def extract_profile_percentiles(
        self, data_or_path: Optional[Union[dict, str, Path]] = None
    ) -> Dict[str, Any]:
        """Extract 7-axis team performance percentiles and tactical identity.

        Loads `team-america-profile-percentiles.json` and complements it with
        the 7 default visible radar traits from `team-america-attribute-charts.json`.
        """
        if data_or_path is None:
            if self._percentiles_data is None:
                self._percentiles_data = self._load_json_file("team-america-profile-percentiles.json")
            data = self._percentiles_data
        elif isinstance(data_or_path, (str, Path)):
            with open(data_or_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        else:
            data = data_or_path

        if not data:
            return {}

        metrics = data.get("metrics", [])
        identity = data.get("identity", {})
        phases = identity.get("phases", [])

        # Group metrics by category group
        groups: Dict[str, List[Dict[str, Any]]] = {}
        for m in metrics:
            g = m.get("group", "General")
            groups.setdefault(g, []).append(m)

        # 7 Core Tactical Performance Axes
        # 1. Finalización, 2. Generación, 3. Progresión, 4. Circulación,
        # 5. Solidez defensiva, 6. Duelos, 7. Recuperación
        core_axis_names = [
            ("finalizacion", "Finalización"),
            ("generacion", "Generación"),
            ("progresion", "Progresión"),
            ("circulacion", "Circulación"),
            ("solidez_defensiva", "Solidez defensiva"),
            ("duelos", "Duelos"),
            ("recuperacion", "Recuperación"),
        ]

        core_7_axes: Dict[str, Dict[str, Any]] = {}
        for axis_key, group_name in core_axis_names:
            group_metrics = groups.get(group_name, [])
            if group_metrics:
                pcts = [m.get("percentile", 50.0) for m in group_metrics if m.get("percentile") is not None]
                mean_pct = round(sum(pcts) / max(1, len(pcts)), 2)
            else:
                mean_pct = 50.0
            core_7_axes[axis_key] = {
                "key": axis_key,
                "label": group_name,
                "mean_percentile": mean_pct,
                "metrics_count": len(group_metrics),
                "metrics": group_metrics,
            }

        # Check default visible traits from charts
        if self._attribute_charts_data is None:
            self._attribute_charts_data = self._load_json_file("team-america-attribute-charts.json")

        default_7_traits: Dict[str, Dict[str, Any]] = {}
        if self._attribute_charts_data:
            traits = self._attribute_charts_data.get("traits", [])
            for t in traits:
                if t.get("defaultVisible"):
                    trait_key = t.get("key")
                    default_7_traits[trait_key] = {
                        "key": trait_key,
                        "raw_name": t.get("raw_name"),
                        "label": t.get("label"),
                        "val": t.get("val"),
                        "percentile": t.get("percentile"),
                        "category": t.get("category"),
                        "lower_is_better": t.get("lowerIsBetter", False),
                    }

        return {
            "status": identity.get("status", "ready"),
            "available": identity.get("available", True),
            "sample": identity.get("sample", {}),
            "core_7_axes": core_7_axes,
            "default_7_traits": default_7_traits,
            "groups": groups,
            "phases": phases,
            "total_metrics_count": len(metrics),
            "raw_metrics": metrics,
        }


# Global singleton instance for module-level convenience
_DEFAULT_ROSETTA: Optional[RosettaStatiskicks] = None


def get_rosetta() -> RosettaStatiskicks:
    """Return the global default RosettaStatiskicks singleton."""
    global _DEFAULT_ROSETTA
    if _DEFAULT_ROSETTA is None:
        _DEFAULT_ROSETTA = RosettaStatiskicks()
    return _DEFAULT_ROSETTA


# ---------------------------------------------------------------------------
# Module-level convenience functions
# ---------------------------------------------------------------------------
def resolve_league(identifier: Union[str, int]) -> Optional[Dict[str, Any]]:
    return get_rosetta().resolve_league(identifier)


def get_division_code(identifier: Union[str, int]) -> Optional[str]:
    return get_rosetta().get_division_code(identifier)


def get_opta_competition_uuid(identifier: Union[str, int]) -> Optional[str]:
    return get_rosetta().get_opta_competition_uuid(identifier)


def get_api_football_league_id(identifier: Union[str, int]) -> Optional[int]:
    return get_rosetta().get_api_football_league_id(identifier)


def get_active_tmcl(identifier: Union[str, int]) -> Optional[str]:
    return get_rosetta().get_active_tmcl(identifier)


def resolve_team(identifier: Union[str, int]) -> Optional[Dict[str, Any]]:
    return get_rosetta().resolve_team(identifier)


def normalize_team_name(name: str) -> str:
    return get_rosetta().normalize_team_name(name)


def get_opta_attribute(code_or_label: str) -> Optional[Dict[str, Any]]:
    return get_rosetta().get_opta_attribute(code_or_label)


def list_attributes_by_category(category: str) -> List[Dict[str, Any]]:
    return get_rosetta().list_attributes_by_category(category)


def is_lower_better(metric: Union[str, Dict[str, Any]]) -> bool:
    return RosettaStatiskicks.is_lower_better(metric)


def is_higher_better(metric: Union[str, Dict[str, Any]]) -> bool:
    return RosettaStatiskicks.is_higher_better(metric)


def extract_rolling_xg_series(data_or_path: Optional[Union[dict, str, Path]] = None) -> Dict[str, Any]:
    return get_rosetta().extract_rolling_xg_series(data_or_path)


def extract_profile_percentiles(data_or_path: Optional[Union[dict, str, Path]] = None) -> Dict[str, Any]:
    return get_rosetta().extract_profile_percentiles(data_or_path)
