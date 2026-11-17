"""Catálogo geográfico, física barométrica ISA, Haversine y localía efectiva para selecciones (EXP_V33_intl_soccer).

Todas las funciones de este módulo son puras, deterministas y sin fuga temporal:
dependen exclusivamente de identidades de federación FIFA, ciudad/país sede del partido
y atmósfera estándar internacional (ISA). Su aritmética IEEE-754 se replica 1:1 en
`src/domain/prediction/intl_soccer.ts` con paridad `< 1e-12`.
"""

from __future__ import annotations

import math
import re
import unicodedata
from typing import Any

EARTH_RADIUS_KM: float = 6371.0088

CONFEDERATIONS: tuple[str, ...] = ("UEFA", "CONMEBOL", "CONCACAF", "CAF", "AFC", "OFC")

# Prior base estructural por confederación en escala Elo internacional (1500 = media global).
# Se usa únicamente como ancla fría en el arranque histórico (`1960`) o para selecciones debutantes.
CONFED_BASE_ELO: dict[str, float] = {
    "UEFA": 1575.0,
    "CONMEBOL": 1615.0,
    "CONCACAF": 1440.0,
    "CAF": 1465.0,
    "AFC": 1425.0,
    "OFC": 1320.0,
}

# Prior por defecto de ClubElo doméstico/exportador cuando una federación no aparece en `clubelo_ratings.parquet`
CONFED_DEFAULT_CLUB_ELO: dict[str, float] = {
    "UEFA": 1510.0,
    "CONMEBOL": 1520.0,
    "CONCACAF": 1410.0,
    "CAF": 1425.0,
    "AFC": 1400.0,
    "OFC": 1310.0,
}


def isa_pressure_hpa(elev_m: float) -> float:
    """Presión barométrica estándar ISA (hPa) para una elevación `elev_m` en metros.
    Idéntica a `tactical_optaproxies.isa_pressure_hpa`."""
    e = max(-50.0, min(5500.0, float(elev_m)))
    return float(1013.25 * ((1.0 - 2.25577e-5 * e) ** 5.25588))


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distancia geodésica Haversine en kilómetros sobre esfera media WGS-84 (`R = 6371.0088 km`)."""
    phi1 = math.radians(float(lat1))
    phi2 = math.radians(float(lat2))
    dphi = math.radians(float(lat2) - float(lat1))
    dlon = math.radians(float(lon2) - float(lon1))
    sin_dphi = math.sin(0.5 * dphi)
    sin_dlon = math.sin(0.5 * dlon)
    a = sin_dphi * sin_dphi + math.cos(phi1) * math.cos(phi2) * sin_dlon * sin_dlon
    a_clamped = max(0.0, min(1.0, a))
    return float(2.0 * EARTH_RADIUS_KM * math.asin(math.sqrt(a_clamped)))


def slugify_name(raw: str) -> str:
    """Normaliza cadenas quitando diacríticos y signos para resolución determinista de alias."""
    norm = unicodedata.normalize("NFKD", str(raw or "")).encode("ascii", "ignore").decode("ascii")
    cleaned = re.sub(r"[^a-z0-9]+", " ", norm.lower()).strip()
    return re.sub(r"\s+", " ", cleaned)


# ---------------------------------------------------------------------------
# Catálogo de Federaciones Nacionales: (confed, lat, lon, base_elev_m, canonical_name)
# Nota sobre `base_elev_m`: representa la elevación habitual de localía/entrenamiento de la selección.
#   - Colombia juega Eliminatorias en Barranquilla (18 m), mientras su altitud de liga incluye Bogotá;
#     las sedes específicas (`Bogotá`, `El Alto`, `Quito`, `Toluca`, `San Pedro Sula`) se resuelven por ciudad.
# ---------------------------------------------------------------------------
FEDERATION_CATALOG: dict[str, tuple[str, float, float, float, str]] = {
    # CONMEBOL (10)
    "ARG": ("CONMEBOL", -34.5453, -58.4498, 25.0, "Argentina"),
    "BOL": ("CONMEBOL", -16.4955, -68.1336, 3640.0, "Bolivia"),
    "BRA": ("CONMEBOL", -23.5453, -46.4742, 760.0, "Brazil"),
    "CHI": ("CONMEBOL", -33.4645, -70.6106, 570.0, "Chile"),
    "COL": ("CONMEBOL", 10.9231, -74.8069, 18.0, "Colombia"),
    "ECU": ("CONMEBOL", -0.1774, -78.4766, 2850.0, "Ecuador"),
    "PAR": ("CONMEBOL", -25.2923, -57.6574, 43.0, "Paraguay"),
    "PER": ("CONMEBOL", -12.0673, -77.0337, 154.0, "Peru"),
    "URU": ("CONMEBOL", -34.8945, -56.1528, 43.0, "Uruguay"),
    "VEN": ("CONMEBOL", 9.7456, -63.1832, 65.0, "Venezuela"),
    # CONCACAF principales y Caribe/Centroamérica
    "MEX": ("CONCACAF", 19.3029, -99.1505, 2240.0, "Mexico"),
    "USA": ("CONCACAF", 39.9689, -83.0171, 240.0, "United States"),
    "CAN": ("CONCACAF", 43.6332, -79.4186, 76.0, "Canada"),
    "CRC": ("CONCACAF", 9.9366, -84.1077, 1172.0, "Costa Rica"),
    "PAN": ("CONCACAF", 9.0336, -79.4694, 30.0, "Panama"),
    "JAM": ("CONCACAF", 18.0019, -76.7720, 45.0, "Jamaica"),
    "HON": ("CONCACAF", 15.4922, -88.0195, 83.0, "Honduras"),
    "SLV": ("CONCACAF", 13.6929, -89.2182, 658.0, "El Salvador"),
    "GTM": ("CONCACAF", 14.6258, -90.5106, 1500.0, "Guatemala"),
    "HTI": ("CONCACAF", 18.5392, -72.3350, 40.0, "Haiti"),
    "TRI": ("CONCACAF", 10.6603, -61.5311, 15.0, "Trinidad and Tobago"),
    "CUW": ("CONCACAF", 12.1696, -68.9900, 20.0, "Curacao"),
    "SUR": ("CONCACAF", 5.8520, -55.2038, 10.0, "Suriname"),
    "NIC": ("CONCACAF", 12.1150, -86.2362, 83.0, "Nicaragua"),
    "CUB": ("CONCACAF", 23.1136, -82.3666, 60.0, "Cuba"),
    "DOM": ("CONCACAF", 18.4861, -69.9312, 50.0, "Dominican Republic"),
    "MTQ": ("CONCACAF", 14.6161, -61.0588, 25.0, "Martinique"),
    "GLP": ("CONCACAF", 16.2650, -61.5510, 20.0, "Guadeloupe"),
    "GUF": ("CONCACAF", 4.9224, -52.3135, 15.0, "French Guiana"),
    "GUY": ("CONCACAF", 6.8013, -58.1551, 5.0, "Guyana"),
    "ATG": ("CONCACAF", 17.1274, -61.8468, 20.0, "Antigua and Barbuda"),
    "SKN": ("CONCACAF", 17.3026, -62.7177, 25.0, "Saint Kitts and Nevis"),
    "LCA": ("CONCACAF", 13.9094, -60.9789, 30.0, "Saint Lucia"),
    "VIN": ("CONCACAF", 13.1587, -61.2248, 25.0, "Saint Vincent and the Grenadines"),
    "GRN": ("CONCACAF", 12.0561, -61.7488, 25.0, "Grenada"),
    "BRB": ("CONCACAF", 13.1132, -59.5988, 20.0, "Barbados"),
    "BER": ("CONCACAF", 32.2949, -64.7814, 15.0, "Bermuda"),
    "BLZ": ("CONCACAF", 17.2510, -88.7590, 65.0, "Belize"),
    "PUR": ("CONCACAF", 18.3965, -66.1558, 20.0, "Puerto Rico"),
    # UEFA (55)
    "ENG": ("UEFA", 51.5560, -0.2795, 35.0, "England"),
    "FRA": ("UEFA", 48.9245, 2.3602, 38.0, "France"),
    "ESP": ("UEFA", 40.4168, -3.7038, 657.0, "Spain"),
    "GER": ("UEFA", 52.5147, 13.2395, 55.0, "Germany"),
    "ITA": ("UEFA", 41.9341, 12.4547, 21.0, "Italy"),
    "POR": ("UEFA", 38.7527, -9.1847, 70.0, "Portugal"),
    "NED": ("UEFA", 52.3144, 4.9419, 2.0, "Netherlands"),
    "BEL": ("UEFA", 50.8957, 4.3341, 60.0, "Belgium"),
    "CRO": ("UEFA", 45.8186, 16.0181, 122.0, "Croatia"),
    "SUI": ("UEFA", 46.9631, 7.4648, 540.0, "Switzerland"),
    "DEN": ("UEFA", 55.7028, 12.5722, 14.0, "Denmark"),
    "AUT": ("UEFA", 48.2072, 16.4209, 160.0, "Austria"),
    "POL": ("UEFA", 52.2395, 21.0458, 100.0, "Poland"),
    "SWE": ("UEFA", 59.3727, 18.0002, 28.0, "Sweden"),
    "UKR": ("UEFA", 50.4334, 30.5219, 179.0, "Ukraine"),
    "SRB": ("UEFA", 44.7832, 20.4649, 117.0, " Serbia".strip()),
    "TUR": ("UEFA", 41.0744, 28.7656, 85.0, "Turkey"),
    "CZE": ("UEFA", 50.0674, 14.4716, 210.0, "Czechia"),
    "HUN": ("UEFA", 47.5031, 19.0981, 105.0, "Hungary"),
    "SCO": ("UEFA", 55.9258, -4.2520, 40.0, "Scotland"),
    "WAL": ("UEFA", 51.4728, -3.2030, 15.0, "Wales"),
    "NOR": ("UEFA", 59.9490, 10.7340, 115.0, "Norway"),
    "ROU": ("UEFA", 44.4372, 26.1525, 85.0, "Romania"),
    "SVK": ("UEFA", 48.1636, 17.1369, 140.0, "Slovakia"),
    "GRE": ("UEFA", 37.9467, 23.6644, 15.0, "Greece"),
    "SVN": ("UEFA", 46.0804, 14.5243, 295.0, "Slovenia"),
    "IRL": ("UEFA", 53.3352, -6.2285, 10.0, "Republic of Ireland"),
    "FIN": ("UEFA", 60.1870, 24.9272, 17.0, "Finland"),
    "ALB": ("UEFA", 41.3184, 19.8240, 110.0, "Albania"),
    "GEO": ("UEFA", 41.7231, 44.7897, 450.0, "Georgia"),
    "ISL": ("UEFA", 64.1400, -21.8789, 25.0, "Iceland"),
    "MKD": ("UEFA", 42.0057, 21.4257, 240.0, "North Macedonia"),
    "MNE": ("UEFA", 42.4449, 19.2644, 55.0, "Montenegro"),
    "BIH": ("UEFA", 43.8732, 18.4090, 518.0, "Bosnia and Herzegovina"),
    "NIR": ("UEFA", 54.5827, -5.9554, 12.0, "Northern Ireland"),
    "ISR": ("UEFA", 32.7831, 34.9652, 20.0, "Israel"),
    "BUL": ("UEFA", 42.6876, 23.3351, 550.0, "Bulgaria"),
    "LUX": ("UEFA", 49.6177, 6.1095, 300.0, "Luxembourg"),
    "ARM": ("UEFA", 40.1719, 44.5256, 990.0, "Armenia"),
    "BLR": ("UEFA", 53.8951, 27.5602, 210.0, "Belarus"),
    "KOS": ("UEFA", 42.6629, 21.1570, 600.0, "Kosovo"),
    "KAZ": ("UEFA", 51.1082, 71.4026, 347.0, "Kazakhstan"),
    "AZE": ("UEFA", 40.3983, 49.8517, 5.0, "Azerbaijan"),
    "EST": ("UEFA", 59.4214, 24.7322, 15.0, "Estonia"),
    "CYP": ("UEFA", 35.1467, 33.3090, 175.0, "Cyprus"),
    "LTU": ("UEFA", 54.8962, 23.9372, 75.0, "Lithuania"),
    "LVA": ("UEFA", 56.9613, 24.1419, 10.0, "Latvia"),
    "FRO": ("UEFA", 62.0192, -6.7797, 35.0, "Faroe Islands"),
    "MDA": ("UEFA", 46.9803, 28.8682, 85.0, "Moldova"),
    "AND": ("UEFA", 42.5047, 1.5174, 1023.0, "Andorra"),
    "MLT": ("UEFA", 35.8947, 14.4153, 105.0, "Malta"),
    "GIB": ("UEFA", 36.1481, -5.3444, 10.0, "Gibraltar"),
    "LIE": ("UEFA", 47.1402, 9.5122, 455.0, "Liechtenstein"),
    "SMR": ("UEFA", 43.9711, 12.4774, 240.0, "San Marino"),
    "RUS": ("UEFA", 55.7158, 37.5537, 156.0, "Russia"),
    # CAF principales (54)
    "MAR": ("CAF", 33.9598, -6.8891, 75.0, "Morocco"),
    "SEN": ("CAF", 14.7336, -17.2005, 25.0, "Senegal"),
    "EGY": ("CAF", 30.0691, 31.3123, 40.0, "Egypt"),
    "CIV": ("CAF", 5.4809, -4.0752, 50.0, "Ivory Coast"),
    "NGA": ("CAF", 9.0378, 7.4533, 460.0, "Nigeria"),
    "TUN": ("CAF", 36.7478, 10.2728, 15.0, "Tunisia"),
    "ALG": ("CAF", 36.7598, 3.0012, 60.0, "Algeria"),
    "CMR": ("CAF", 3.8861, 11.5406, 726.0, "Cameroon"),
    "MLI": ("CAF", 12.6493, -7.9929, 350.0, "Mali"),
    "RSA": ("CAF", -26.2349, 27.9826, 1753.0, "South Africa"),
    "COD": ("CAF", -4.3318, 15.3239, 310.0, "DR Congo"),
    "GHA": ("CAF", 5.5514, -0.1917, 60.0, "Ghana"),
    "BFA": ("CAF", 12.3569, -1.5352, 305.0, "Burkina Faso"),
    "CPV": ("CAF", 14.9517, -23.5167, 45.0, "Cape Verde"),
    "GIN": ("CAF", 9.5750, -13.6550, 25.0, "Guinea"),
    "GAB": ("CAF", 0.5256, 9.3924, 15.0, "Gabon"),
    "EQG": ("CAF", 3.7250, 8.7667, 30.0, "Equatorial Guinea"),
    "ZAM": ("CAF", -15.3708, 28.2719, 1279.0, "Zambia"),
    "ANG": ("CAF", -8.9698, 13.2836, 75.0, "Angola"),
    "BEN": ("CAF", 6.3864, 2.3881, 10.0, "Benin"),
    "UGA": ("CAF", 0.2206, 32.6581, 1190.0, "Uganda"),
    "MOZ": ("CAF", -25.8256, 32.5731, 45.0, "Mozambique"),
    "MAD": ("CAF", -18.9189, 47.5258, 1276.0, "Madagascar"),
    "KEN": ("CAF", -1.2297, 36.8906, 1795.0, "Kenya"),
    "MTN": ("CAF", 18.1069, -15.9553, 10.0, "Mauritania"),
    "NAM": ("CAF", -22.6083, 17.0872, 1655.0, "Namibia"),
    "GAM": ("CAF", 13.4167, -16.6833, 20.0, "Gambia"),
    "SLE": ("CAF", 8.4775, -13.2664, 30.0, "Sierra Leone"),
    "TOG": ("CAF", 6.1764, 1.2094, 25.0, "Togo"),
    "TAN": ("CAF", -6.8544, 39.2736, 30.0, "Tanzania"),
    "ZIM": ("CAF", -17.8216, 31.0067, 1490.0, "Zimbabwe"),
    "MWI": ("CAF", -13.9450, 33.7556, 1050.0, " Malawi".strip()),
    "COM": ("CAF", -11.6500, 43.2667, 30.0, "Comoros"),
    "SDN": ("CAF", 15.6500, 32.4833, 385.0, "Sudan"),
    "GNB": ("CAF", 11.8636, -15.5977, 20.0, "Guinea-Bissau"),
    "LBY": ("CAF", 32.8597, 13.1369, 25.0, "Libya"),
    "CGO": ("CAF", -4.2592, 15.2847, 320.0, "Congo"),
    "RWA": ("CAF", -1.9547, 30.1144, 1567.0, "Rwanda"),
    "BDI": ("CAF", -3.3761, 29.3600, 780.0, "Burundi"),
    "ETH": ("CAF", 9.0133, 38.7567, 2355.0, "Ethiopia"),
    "BOT": ("CAF", -24.6572, 25.9278, 1010.0, "Botswana"),
    "LES": ("CAF", -29.3167, 27.4833, 1600.0, "Lesotho"),
    "SWZ": ("CAF", -26.4465, 31.2064, 680.0, "Eswatini"),
    "LBR": ("CAF", 6.2656, -10.7031, 15.0, "Liberia"),
    "CTA": ("CAF", 4.3947, 18.5582, 350.0, "Central African Republic"),
    "NIG": ("CAF", 13.5328, 2.0886, 210.0, "Niger"),
    "CHA": ("CAF", 12.1348, 15.0557, 298.0, "Chad"),
    # AFC principales
    "JPN": ("AFC", 35.8869, 139.7175, 25.0, "Japan"),
    "IRN": ("AFC", 35.7244, 51.2756, 1190.0, "Iran"),
    "KOR": ("AFC", 37.5683, 126.8972, 38.0, "South Korea"),
    "AUS": ("AFC", -33.8471, 151.0634, 15.0, "Australia"),
    "QAT": ("AFC", 25.2636, 51.4483, 15.0, "Qatar"),
    "KSA": ("AFC", 24.7878, 46.8392, 612.0, "Saudi Arabia"),
    "IRQ": ("AFC", 30.4400, 47.7800, 10.0, "Iraq"),
    "UZB": ("AFC", 41.2858, 69.2108, 455.0, "Uzbekistan"),
    "UAE": ("AFC", 24.4167, 54.4556, 10.0, "United Arab Emirates"),
    "JOR": ("AFC", 31.9853, 35.9036, 780.0, "Jordan"),
    "OMA": ("AFC", 23.5758, 58.3958, 20.0, "Oman"),
    "BHR": ("AFC", 26.1569, 50.5436, 15.0, "Bahrain"),
    "CHN": ("AFC", 39.9289, 116.3883, 45.0, "China PR"),
    "SYR": ("AFC", 33.5138, 36.2765, 680.0, "Syria"),
    "PLE": ("AFC", 31.9038, 35.2034, 820.0, "Palestine"),
    "THA": ("AFC", 13.7556, 100.6222, 5.0, "Thailand"),
    "KGZ": ("AFC", 42.8797, 74.5950, 800.0, "Kyrgyzstan"),
    "TJK": ("AFC", 38.5836, 68.7819, 800.0, "Tajikistan"),
    "VIE": ("AFC", 21.0206, 105.7639, 12.0, "Vietnam"),
    "PRK": ("AFC", 39.0494, 125.7753, 35.0, "North Korea"),
    "LBN": ("AFC", 33.8722, 35.4972, 25.0, "Lebanon"),
    "IND": ("AFC", 22.5644, 88.4092, 10.0, "India"),
    "IDN": ("AFC", -6.2186, 106.8025, 15.0, "Indonesia"),
    "MAS": ("AFC", 3.0547, 101.6919, 45.0, "Malaysia"),
    "KUW": ("AFC", 29.2694, 47.9114, 25.0, "Kuwait"),
    "PHI": ("AFC", 14.5633, 120.9917, 10.0, "Philippines"),
    "TKM": ("AFC", 37.9014, 58.3778, 220.0, "Turkmenistan"),
    "HKG": ("AFC", 22.2731, 114.1886, 15.0, "Hong Kong"),
    "SIN": ("AFC", 1.3044, 103.8742, 10.0, "Singapore"),
    "YEM": ("AFC", 15.3694, 44.1910, 2250.0, "Yemen"),
    "AFG": ("AFC", 34.5553, 69.2075, 1790.0, "Afghanistan"),
    "MYA": ("AFC", 16.8211, 96.1856, 20.0, "Myanmar"),
    "NEP": ("AFC", 27.6950, 85.3147, 1400.0, "Nepal"),
    "BAN": ("AFC", 23.7281, 90.4133, 10.0, "Bangladesh"),
    "MDV": ("AFC", 4.1755, 73.5093, 2.0, "Maldives"),
    "TPE": ("AFC", 25.0494, 121.5514, 15.0, "Taiwan"),
    "CAM": ("AFC", 11.5586, 104.9169, 12.0, "Cambodia"),
    "SRI": ("AFC", 6.9061, 79.8697, 8.0, "Sri Lanka"),
    "PAK": ("AFC", 33.7042, 73.0928, 540.0, "Pakistan"),
    "BHU": ("AFC", 27.4712, 89.6339, 2334.0, "Bhutan"),
    # OFC
    "NZL": ("OFC", -36.8749, 174.7447, 25.0, "New Zealand"),
    "FIJ": ("OFC", -18.1416, 178.4419, 10.0, "Fiji"),
    "SOL": ("OFC", -9.4333, 159.9500, 15.0, "Solomon Islands"),
    "NCL": ("OFC", -22.2758, 166.4580, 15.0, "New Caledonia"),
    "PNG": ("OFC", -9.4438, 147.1803, 35.0, "Papua New Guinea"),
    "TAH": ("OFC", -17.5516, -149.5585, 15.0, "Tahiti"),
    "VAN": ("OFC", -17.7333, 168.3273, 20.0, "Vanuatu"),
    "SAM": ("OFC", -13.8333, -171.7500, 15.0, "Samoa"),
}

# Continuidad histórica FIFA + alias frecuentes en `martj42/international_results`, español e ISO-3
TEAM_NAME_TO_CODE: dict[str, str] = {}
for _code, (_conf, _lat, _lon, _elev, _cname) in FEDERATION_CATALOG.items():
    TEAM_NAME_TO_CODE[slugify_name(_code)] = _code
    TEAM_NAME_TO_CODE[slugify_name(_cname)] = _code

_EXTRA_TEAM_ALIASES: dict[str, str] = {
    # Continuidad histórica de sucesión FIFA (evita reset de Elo en cambios de nombre/estado)
    "west germany": "GER",
    "german dr": "GER",
    "germany fr": "GER",
    "soviet union": "RUS",
    "cis": "RUS",
    "yugoslavia": "SRB",
    "serbia and montenegro": "SRB",
    "fr yugoslavia": "SRB",
    "czechoslovakia": "CZE",
    "czech republic": "CZE",
    "chequia": "CZE",
    "republica checa": "CZE",
    "zaire": "COD",
    "congo dr": "COD",
    "democratic republic of the congo": "COD",
    "rd congo": "COD",
    "holland": "NED",
    "paises bajos": "NED",
    "holanda": "NED",
    "nld": "NED",
    "deu": "GER",
    "alemania": "GER",
    "espana": "ESP",
    "francia": "FRA",
    "inglaterra": "ENG",
    "italia": "ITA",
    "suiza": "SUI",
    "che": "SUI",
    "dinamarca": "DEN",
    "dnk": "DEN",
    "suecia": "SWE",
    "noruega": "NOR",
    "croacia": "CRO",
    "hrv": "CRO",
    "belgica": "BEL",
    "polonia": "POL",
    "escocia": "SCO",
    "gales": "WAL",
    "irlanda": "IRL",
    "irlanda del norte": "NIR",
    "grecia": "GRE",
    "grc": "GRE",
    "turquia": "TUR",
    "turkiye": "TUR",
    "ucrania": "UKR",
    "rumania": "ROU",
    "hungria": "HUN",
    "eslovaquia": "SVK",
    "eslovenia": "SVN",
    "estados unidos": "USA",
    "ee uu": "USA",
    "usmnt": "USA",
    "brasil": "BRA",
    "paraguay": "PAR",
    "pry": "PAR",
    "uruguay": "URU",
    "ury": "URU",
    "chile": "CHI",
    "chl": "CHI",
    "costa rica": "CRC",
    "cri": "CRC",
    "honduras": "HON",
    "hnd": "HON",
    "guatemala": "GTM",
    "gua": "GTM",
    "el salvador": "SLV",
    "esa": "SLV",
    "trinidad y tobago": "TRI",
    "tto": "TRI",
    "curazao": "CUW",
    "netherlands antilles": "CUW",
    "ivory coast": "CIV",
    "cote d ivoire": "CIV",
    "costa de marfil": "CIV",
    "marruecos": "MAR",
    "argelia": "ALG",
    "dza": "ALG",
    "tunez": "TUN",
    "egipto": "EGY",
    "nigeria": "NGA",
    "nga": "NGA",
    "camerun": "CMR",
    "sudafrica": "RSA",
    "zaf": "RSA",
    "cabo verde": "CPV",
    "cape verde islands": "CPV",
    "eswatini": "SWZ",
    "swaziland": "SWZ",
    "burkina faso": "BFA",
    "upper volta": "BFA",
    "corea del sur": "KOR",
    "korea republic": "KOR",
    "republic of korea": "KOR",
    "corea del norte": "PRK",
    "korea dpr": "PRK",
    "japon": "JPN",
    "ir iran": "IRN",
    "arabia saudita": "KSA",
    "saudi arabia": "KSA",
    "sau": "KSA",
    "emiratos arabes unidos": "UAE",
    "are": "UAE",
    "china": "CHN",
    "china pr": "CHN",
    "chinese taipei": "TPE",
    "kyrgyz republic": "KGZ",
    "burma": "MYA",
    "nueva zelanda": "NZL",
    "macedonia": "MKD",
    "fyr macedonia": "MKD",
}
for _alias, _target in _EXTRA_TEAM_ALIASES.items():
    TEAM_NAME_TO_CODE[slugify_name(_alias)] = _target


# ---------------------------------------------------------------------------
# Sedes Específicas Auditadas: slug(city) -> (lat, lon, elev_m, country_code, diaspora_favored_codes)
# Corrige desviaciones enormes entre sedes del mismo país:
#   - Bolivia: El Alto (4150 m) vs La Paz (3640 m) vs Santa Cruz (416 m)
#   - Ecuador: Quito (2850 m) vs Guayaquil (4 m)
#   - Colombia: Bogotá (2640 m) vs Barranquilla (18 m) vs Medellín (1495 m)
#   - México: Toluca (2660 m) vs CDMX (2240 m) vs Guadalajara/Zapopan (1566 m) vs Monterrey (540 m)
#   - EE.UU.: Denver/Commerce City (1609 m) + hubs de diáspora MEX/CONMEBOL/CA
# ---------------------------------------------------------------------------
CITY_VENUE_OVERRIDES: dict[str, tuple[float, float, float, str, tuple[str, ...]]] = {
    # Sudamérica
    "el alto": (-16.5047, -68.1633, 4150.0, "BOL", ()),
    "la paz": (-16.4955, -68.1336, 3640.0, "BOL", ()),
    "cochabamba": (-17.3895, -66.1568, 2558.0, "BOL", ()),
    "sucre": (-19.0196, -65.2619, 2810.0, "BOL", ()),
    "santa cruz": (-17.7833, -63.1821, 416.0, "BOL", ()),
    "quito": (-0.1774, -78.4766, 2850.0, "ECU", ()),
    "guayaquil": (-2.1894, -79.8891, 4.0, "ECU", ()),
    "cuenca": (-2.9001, -79.0059, 2560.0, "ECU", ()),
    "bogota": (4.6459, -74.0775, 2640.0, "COL", ()),
    "barranquilla": (10.9231, -74.8069, 18.0, "COL", ()),
    "medellin": (6.2569, -75.5902, 1495.0, "COL", ()),
    "cali": (3.4299, -76.5446, 1018.0, "COL", ()),
    "cusco": (-13.5320, -71.9675, 3399.0, "PER", ()),
    "arequipa": (-16.4090, -71.5375, 2335.0, "PER", ()),
    "lima": (-12.0673, -77.0337, 154.0, "PER", ()),
    "buenos aires": (-34.5453, -58.4498, 25.0, "ARG", ()),
    "cordoba": (-31.3690, -64.2462, 415.0, "ARG", ()),
    "mendoza": (-32.8895, -68.8800, 765.0, "ARG", ()),
    "santiago del estero": (-27.7664, -64.2736, 182.0, "ARG", ()),
    "montevideo": (-34.8945, -56.1528, 43.0, "URU", ()),
    "asuncion": (-25.2923, -57.6574, 43.0, "PAR", ()),
    "santiago": (-33.4645, -70.6106, 570.0, "CHI", ()),
    "sao paulo": (-23.5453, -46.4742, 760.0, "BRA", ()),
    "rio de janeiro": (-22.9121, -43.2302, 12.0, "BRA", ()),
    "belo horizonte": (-19.8659, -43.9711, 850.0, "BRA", ()),
    "brasilia": (-15.7835, -47.8992, 1172.0, "BRA", ()),
    "curitiba": (-25.4483, -49.2769, 935.0, "BRA", ()),
    "salvador": (-12.9788, -38.5044, 25.0, "BRA", ()),
    "maturin": (9.7456, -63.1832, 65.0, "VEN", ()),
    "caracas": (10.4910, -66.8906, 900.0, "VEN", ()),
    "merida": (8.5586, -71.2156, 1630.0, "VEN", ()),
    # México y Centroamérica
    "mexico city": (19.3029, -99.1505, 2240.0, "MEX", ()),
    "ciudad de mexico": (19.3029, -99.1505, 2240.0, "MEX", ()),
    "toluca": (19.2869, -99.6672, 2660.0, "MEX", ()),
    "puebla": (19.0772, -98.1644, 2135.0, "MEX", ()),
    "guadalajara": (20.6819, -103.4628, 1566.0, "MEX", ()),
    "zapopan": (20.6819, -103.4628, 1566.0, "MEX", ()),
    "monterrey": (25.6691, -100.2444, 540.0, "MEX", ()),
    "guadalupe": (25.6691, -100.2444, 540.0, "MEX", ()),
    "torreon": (25.6053, -103.4050, 1120.0, "MEX", ()),
    "queretaro": (20.5778, -100.3664, 1820.0, "MEX", ()),
    "san jose": (9.9366, -84.1077, 1172.0, "CRC", ()),
    "san pedro sula": (15.4922, -88.0195, 83.0, "HON", ()),
    "tegucigalpa": (14.0978, -87.2044, 990.0, "HON", ()),
    "guatemala city": (14.6258, -90.5106, 1500.0, "GTM", ()),
    "san salvador": (13.6929, -89.2182, 658.0, "SLV", ()),
    # EE.UU. y Canadá (incluye hubs de diáspora para neutralidad asimétrica)
    "arlington": (32.7473, -97.0945, 184.0, "USA", ("MEX", "SLV", "HON")),
    "dallas": (32.7791, -96.7603, 131.0, "USA", ("MEX", "SLV", "HON")),
    "frisco": (33.1544, -96.8353, 200.0, "USA", ("MEX",)),
    "houston": (29.6847, -95.4107, 15.0, "USA", ("MEX", "HON", "SLV", "COL")),
    "san antonio": (29.4169, -98.4789, 198.0, "USA", ("MEX",)),
    "austin": (30.3877, -97.7198, 165.0, "USA", ("MEX",)),
    "pasadena": (34.1613, -118.1676, 263.0, "USA", ("MEX", "SLV", "GTM")),
    "los angeles": (34.0141, -118.2879, 55.0, "USA", ("MEX", "SLV", "GTM")),
    "inglewood": (33.9535, -118.3390, 40.0, "USA", ("MEX", "SLV", "GTM")),
    "carson": (33.8644, -118.2611, 20.0, "USA", ("MEX",)),
    "san diego": (32.7844, -117.1228, 20.0, "USA", ("MEX",)),
    "santa clara": (37.4033, -121.9694, 14.0, "USA", ("MEX",)),
    "glendale": (33.5276, -112.2626, 348.0, "USA", ("MEX",)),
    "phoenix": (33.4455, -112.0667, 331.0, "USA", ("MEX",)),
    "las vegas": (36.0909, -115.1833, 610.0, "USA", ("MEX",)),
    "paradise": (36.0909, -115.1833, 610.0, "USA", ("MEX",)),
    "chicago": (41.8623, -87.6167, 180.0, "USA", ("MEX", "POL")),
    "denver": (39.7439, -105.0201, 1609.0, "USA", ("MEX",)),
    "commerce city": (39.8056, -104.8919, 1575.0, "USA", ("MEX",)),
    "charlotte": (35.2258, -80.8528, 229.0, "USA", ("MEX", "COL")),
    "atlanta": (33.7553, -84.4006, 320.0, "USA", ("MEX", "COL")),
    "miami": (25.9580, -80.2389, 3.0, "USA", ("COL", "ARG", "VEN", "PER", "BRA")),
    "miami gardens": (25.9580, -80.2389, 3.0, "USA", ("COL", "ARG", "VEN", "PER", "BRA")),
    "fort lauderdale": (26.1931, -80.1611, 3.0, "USA", ("COL", "ARG", "VEN")),
    "orlando": (28.5392, -81.4028, 30.0, "USA", ("COL", "BRA", "PUR")),
    "east rutherford": (40.8128, -74.0742, 3.0, "USA", ("COL", "ECU", "ARG", "MEX", "ITA")),
    "harrison": (40.7369, -74.1503, 8.0, "USA", ("COL", "ECU")),
    "philadelphia": (39.9008, -75.1675, 12.0, "USA", ("MEX", "COL")),
    "kansas city": (39.0489, -94.4839, 260.0, "USA", ()),
    "seattle": (47.5952, -122.3316, 5.0, "USA", ()),
    "foxborough": (42.0909, -71.2643, 80.0, "USA", ("BRA", "POR")),
    "toronto": (43.6332, -79.4186, 76.0, "CAN", ()),
    "vancouver": (49.2768, -123.1120, 10.0, "CAN", ()),
    "edmonton": (53.5597, -113.4761, 671.0, "CAN", ()),
    # Europa, África y Asia clave
    "london": (51.5560, -0.2795, 35.0, "ENG", ()),
    "paris": (48.8414, 2.2530, 35.0, "FRA", ("MAR", "ALG", "POR")),
    "saint denis": (48.9245, 2.3602, 38.0, "FRA", ("MAR", "ALG", "POR")),
    "berlin": (52.5147, 13.2395, 55.0, "GER", ("TUR",)),
    "munich": (48.2188, 11.6247, 519.0, "GER", ("TUR", "CRO")),
    "dortmund": (51.4926, 7.4519, 86.0, "GER", ("TUR",)),
    "madrid": (40.4531, -3.6883, 688.0, "ESP", ("COL", "ECU", "MAR", "ARG")),
    "seville": (37.4172, -6.0044, 12.0, "ESP", ()),
    "barcelona": (41.3809, 2.1228, 45.0, "ESP", ("MAR", "ARG")),
    "johannesburg": (-26.2349, 27.9826, 1753.0, "RSA", ()),
    "pretoria": (-25.7533, 28.2231, 1339.0, "RSA", ()),
    "cape town": (-33.9036, 18.4111, 15.0, "RSA", ()),
    "durban": (-29.8289, 31.0303, 10.0, "RSA", ()),
    "nairobi": (-1.2297, 36.8906, 1795.0, "KEN", ()),
    "addis ababa": (9.0133, 38.7567, 2355.0, "ETH", ()),
    "doha": (25.2636, 51.4483, 15.0, "QAT", ()),
    "al rayyan": (25.2636, 51.4483, 25.0, "QAT", ()),
    "lusail": (25.4208, 51.4904, 10.0, "QAT", ()),
    "riyadh": (24.7878, 46.8392, 612.0, "KSA", ()),
    "jeddah": (21.7625, 39.1636, 15.0, "KSA", ()),
    "tehran": (35.7244, 51.2756, 1190.0, "IRN", ()),
    "tokyo": (35.6779, 139.7145, 30.0, "JPN", ()),
    "saitama": (35.9031, 139.7175, 20.0, "JPN", ()),
    "seoul": (37.5683, 126.8972, 38.0, "KOR", ()),
    "sydney": (-33.8471, 151.0634, 15.0, "AUS", ()),
}


def resolve_team_code(raw_team: str) -> str:
    """Resuelve el nombre o alias de una selección nacional a su código canónico de 3 letras."""
    slug = slugify_name(raw_team)
    if not slug:
        return "UNK"
    mapped = TEAM_NAME_TO_CODE.get(slug)
    if mapped is not None:
        return mapped
    # Fallback determinista de 3 caracteres en mayúsculas para selecciones no FIFA (ej. islas menores)
    token = re.sub(r"[^a-zA-Z]", "", str(raw_team)).upper()
    return (token[:3] if len(token) >= 3 else token.ljust(3, "X")) or "UNK"


def get_federation_profile(team_code_or_name: str) -> dict[str, Any]:
    """Devuelve perfil geográfico y de confederación de una selección."""
    code = resolve_team_code(team_code_or_name)
    entry = FEDERATION_CATALOG.get(code)
    if entry is not None:
        confed, lat, lon, elev_m, cname = entry
        return {
            "code": code,
            "name": cname,
            "confed": confed,
            "lat": lat,
            "lon": lon,
            "base_elev_m": elev_m,
            "base_pressure_hpa": isa_pressure_hpa(elev_m),
            "confed_base_elo": CONFED_BASE_ELO.get(confed, 1400.0),
            "default_club_elo": CONFED_DEFAULT_CLUB_ELO.get(confed, 1380.0),
        }
    return {
        "code": code,
        "name": str(team_code_or_name).strip() or code,
        "confed": "OFC",
        "lat": 0.0,
        "lon": 0.0,
        "base_elev_m": 50.0,
        "base_pressure_hpa": isa_pressure_hpa(50.0),
        "confed_base_elo": 1300.0,
        "default_club_elo": 1320.0,
    }


def resolve_match_venue_physics(
    home_code: str,
    away_code: str,
    match_city: str | None,
    match_country: str | None,
    is_neutral_flag: bool | None,
    explicit_lat: float | None = None,
    explicit_lon: float | None = None,
    explicit_elev_m: float | None = None,
) -> dict[str, float]:
    """Resuelve coordenadas, altitud ISA y localía efectiva `effective_hfa` en `[-1.0, +1.0]`.

    Reglas deterministas:
    1. Si `match_country` corresponde al país anfitrión `home_code` (y `!= away_code`) o `is_neutral_flag` es False
       sin país anfitrión visitante: `effective_hfa = +1.0`.
    2. Si `match_country` corresponde a `away_code` (`!= home_code`, frecuente en Copas del Mundo / Eurocopas donde
       el anfitrión aparece en la columna visitante): `effective_hfa = -1.0`.
    3. En sede neutral (`match_country` distinto a ambos):
       - Si la ciudad figura como hub de diáspora asimétrica para `home_code` (y no para `away_code`), `effective_hfa = +0.35`
         (`+0.35` para `MEX` en EE.UU. vs no-`USA`; `+0.22` para otras diásporas documentadas).
       - Simétricamente `-0.35` / `-0.22` si favorece solo a `away_code`.
       - De lo contrario `effective_hfa = 0.0` y `is_neutral_pure = 1.0`.
    """
    h_prof = get_federation_profile(home_code)
    a_prof = get_federation_profile(away_code)

    city_slug = slugify_name(match_city or "")
    country_code = resolve_team_code(match_country) if (match_country and str(match_country).strip()) else ""

    diaspora_codes: tuple[str, ...] = ()
    if city_slug in CITY_VENUE_OVERRIDES:
        v_lat, v_lon, v_elev, v_country, diaspora_codes = CITY_VENUE_OVERRIDES[city_slug]
        if not country_code or country_code == "UNK":
            country_code = v_country
    elif country_code and country_code in FEDERATION_CATALOG:
        _, v_lat, v_lon, v_elev, _ = FEDERATION_CATALOG[country_code]
    elif is_neutral_flag:
        # Punto medio esférico aproximado y altitud de nivel medio cuando no se especifica ciudad neutral
        v_lat = 0.5 * (float(h_prof["lat"]) + float(a_prof["lat"]))
        v_lon = 0.5 * (float(h_prof["lon"]) + float(a_prof["lon"]))
        v_elev = 100.0
    else:
        v_lat = float(h_prof["lat"])
        v_lon = float(h_prof["lon"])
        v_elev = float(h_prof["base_elev_m"])
        country_code = h_prof["code"]

    if explicit_lat is not None and math.isfinite(float(explicit_lat)):
        v_lat = float(explicit_lat)
    if explicit_lon is not None and math.isfinite(float(explicit_lon)):
        v_lon = float(explicit_lon)
    if explicit_elev_m is not None and math.isfinite(float(explicit_elev_m)):
        v_elev = float(explicit_elev_m)

    # Si no hay ciudad explícita pero el partido es en EE.UU. y participa MEX contra un no-USA, aplicar hub US promedio
    if not diaspora_codes and country_code == "USA":
        diaspora_codes = ("MEX",)

    h_code = h_prof["code"]
    a_code = a_prof["code"]

    if country_code == h_code and country_code != a_code and not bool(is_neutral_flag is True and country_code != h_code):
        eff_hfa = 1.0
        neutral_pure = 0.0
    elif country_code == a_code and country_code != h_code:
        eff_hfa = -1.0
        neutral_pure = 0.0
    elif is_neutral_flag is False and (not country_code or country_code == h_code):
        eff_hfa = 1.0
        neutral_pure = 0.0
    else:
        h_diasp = h_code in diaspora_codes
        a_diasp = a_code in diaspora_codes
        if h_diasp and not a_diasp:
            eff_hfa = 0.35 if h_code == "MEX" else 0.22
            neutral_pure = 0.0
        elif a_diasp and not h_diasp:
            eff_hfa = -0.35 if a_code == "MEX" else -0.22
            neutral_pure = 0.0
        else:
            eff_hfa = 0.0
            neutral_pure = 1.0

    # Diferencial físico de altitud y presión ISA entre la sede y la elevación habitual de cada equipo.
    # Lo que importa competitivamente es cuánto más sufre el visitante respecto al local en esa sede:
    # Si Bolivia (3640 m) recibe en El Alto (4150 m) a Brasil (760 m):
    #   exposición visitante = max(0, 4150 - 760) = 3390 m; exposición local = max(0, 4150 - 3640) = 510 m
    #   ventaja neta de aclimatación local = 3390 - 510 = +2880 m.
    away_unacclimated_m = max(0.0, v_elev - float(a_prof["base_elev_m"]))
    home_unacclimated_m = max(0.0, v_elev - float(h_prof["base_elev_m"]))
    net_altitude_adv_m = away_unacclimated_m - home_unacclimated_m

    p_venue = isa_pressure_hpa(v_elev)
    away_p_drop = max(0.0, float(a_prof["base_pressure_hpa"]) - p_venue)
    home_p_drop = max(0.0, float(h_prof["base_pressure_hpa"]) - p_venue)
    net_pressure_adv_hpa = away_p_drop - home_p_drop

    shock_flag = 1.0 if (v_elev >= 2000.0 and net_altitude_adv_m >= 1400.0) else (
        -1.0 if (v_elev >= 2000.0 and net_altitude_adv_m <= -1400.0) else 0.0
    )

    return {
        "venue_lat": float(v_lat),
        "venue_lon": float(v_lon),
        "venue_elev_m": float(v_elev),
        "venue_pressure_hpa": float(p_venue),
        "effective_hfa": float(eff_hfa),
        "is_neutral_pure": float(neutral_pure),
        "altitude_diff_m": float(net_altitude_adv_m),
        "surface_pressure_diff": float(net_pressure_adv_hpa),
        "altitude_shock_flag": float(shock_flag),
    }
