"""PitchLab v6.0 Candidate — EXP_V61: Global Referee Disciplinary Registry,
Deterministic Pre-Kickoff Freeze Contract & Prospective Power De-Vig Quotes Evaluator.

Pure Python 3.12 standard-library implementation (`0` external dependencies required,
`sys.dont_write_bytecode = True`) guaranteeing IEEE-754 `< 1e-12` numerical parity and
bit-exact `SHA-256` canonical digests with `src/domain/prediction/prekickoff_freeze_v6_0.ts`.

Governance invariants enforced:
  1. Zero bytes modified in any frozen `v3.0..v5.2` artifact or `picks_v3_2_prospective.jsonl`.
  2. Strict holdout protection (`2025-02-02`..`2026-11-08` untouched; `holdout_sealed_untouched = True`).
  3. All 2026 live backfills (NBA 5 FT, NHL 14 FT) operate strictly causally (`date' < date`)
     with `inputsAsOfUtc <= kickoffUtc`.
  4. Cluster-bootstrap inference via deterministic `mulberry32` (`seed = 20261111`, `1,000` resamples),
     returning `None` (`null` in JSON) whenever `n == 0`.
  5. Zero forbidden betting keys (`stake`, `kelly`, `kellyFraction`, `ev`, `expectedEdge`, `tier`).
"""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import calendar
from collections import Counter, defaultdict
import datetime as dt_mod
import hashlib
import json
import math
import os
from pathlib import Path
import re
import struct
from typing import Any, Mapping, Sequence
import unicodedata

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
ARTIFACTS_DIR = EXP_DIR / "artifacts"
PRED_DATA_DIR = REPO_ROOT / "src" / "data" / "prediction"
DEFAULT_PITCH_DATA = Path(
    os.environ.get("PITCH_DATA_DIR", r"C:\Users\jairb\OneDrive\Desktop\Proyectos\Pitch\data")
)

OFFICIAL_PRIORS_V51_PATH = PRED_DATA_DIR / "official_priors_v5_1.json"
SOCCER_MICRO_V50_PATH = PRED_DATA_DIR / "model_soccer_micro_v5_0_candidate.json"
LIVE_FEEDBACK_V52_PATH = PRED_DATA_DIR / "model_v5_2_live_feedback_candidate.json"

MODEL_OUT_PATH = PRED_DATA_DIR / "model_officials_freeze_v6_0_candidate.json"
SNAPSHOT_OUT_PATH = PRED_DATA_DIR / "officials_freeze_v6_0_snapshot.json"
RESULTS_OUT_PATH = ARTIFACTS_DIR / "exp_v61_officials_freeze_v6_0_results.json"

SCHEMA_VERSION_MODEL = "pitchlab_officials_freeze_v6_0_candidate_1.0.0"
SCHEMA_VERSION_SEAL = "prekickoff_seal_v6.0.0"
SCHEMA_VERSION_SNAPSHOT = "officials_freeze_v6_0_parity_snapshot_1.0.0"
GENESIS_SEAL_HASH = "0" * 64

HOLDOUT_START_DATE = "2025-02-02"
HOLDOUT_END_DATE = "2026-11-08"
BOOTSTRAP_SEED = 20261111
BOOTSTRAP_RESAMPLES = 1000
BOOKING_POINTS_GAMMA_RED = 0.1680
BOOKING_POINTS_LINES: tuple[float, ...] = (35.5, 45.5, 55.5)
DEFAULT_R_YELLOW = 80.0
DEFAULT_R_RED = 25.0
DEFAULT_MAX_Y_TOTAL = 24
DEFAULT_MAX_R_TOTAL = 8

FORBIDDEN_PUBLIC_KEYS = frozenset(
    {"stake", "stake_u", "kelly", "kellyFraction", "ev", "expectedEdge", "edge", "tier", "valueStatus"}
)

NON_SOCCER_US_LEAGUES: dict[str, str] = {
    "mlb": "mlb",
    "nba": "nba",
    "nfl": "nfl",
    "nhl": "nhl",
}

SPACETIME_CORE_LEAGUES = frozenset(
    {
        "premier-league",
        "laliga",
        "serie-a",
        "bundesliga",
        "ligue-1",
        "liga-mx",
        "championship",
        "segunda-espana",
        "serie-b",
        "bundesliga-2",
        "ligue-2",
        "eredivisie",
        "liga-portugal",
        "pro-league-belgica",
        "super-lig",
        "amistosos",
        "uefa-nations",
        "concacaf-nations",
        "eliminatorias",
        "nfl",
    }
)

# Hierarchical Confederation Priors (Level 1 — pre-2025 structural/empirical anchors, 0 holdout leakage)
CONFEDERATION_HIERARCHICAL_PRIORS: dict[str, dict[str, Any]] = {
    "UEFA_TOP5": {
        "confederation": "UEFA",
        "tier_group": "top5_domestic",
        "yellow_base_rate": 4.13,
        "red_base_rate": 0.184,
        "fouls_base_rate": 23.66,
        "cpf_hierarchy_mult": 1.005,
        "kappa_comp": 28.0,
        "kappa_ref_yellow": 14.0,
        "kappa_ref_red": 32.0,
    },
    "UEFA_SECOND_TIER": {
        "confederation": "UEFA",
        "tier_group": "second_tier_domestic",
        "yellow_base_rate": 4.36,
        "red_base_rate": 0.198,
        "fouls_base_rate": 25.43,
        "cpf_hierarchy_mult": 1.028,
        "kappa_comp": 24.0,
        "kappa_ref_yellow": 14.0,
        "kappa_ref_red": 32.0,
    },
    "UEFA_OTHER_DOMESTIC": {
        "confederation": "UEFA",
        "tier_group": "european_first_tier",
        "yellow_base_rate": 4.22,
        "red_base_rate": 0.226,
        "fouls_base_rate": 23.47,
        "cpf_hierarchy_mult": 1.035,
        "kappa_comp": 24.0,
        "kappa_ref_yellow": 14.0,
        "kappa_ref_red": 32.0,
    },
    "UEFA_CONTINENTAL_KNOCKOUT": {
        "confederation": "UEFA",
        "tier_group": "continental_club_and_nations",
        "yellow_base_rate": 4.26,
        "red_base_rate": 0.202,
        "fouls_base_rate": 23.85,
        "cpf_hierarchy_mult": 1.042,
        "kappa_comp": 22.0,
        "kappa_ref_yellow": 14.0,
        "kappa_ref_red": 32.0,
    },
    "UEFA_DOMESTIC_CUP": {
        "confederation": "UEFA",
        "tier_group": "national_knockout_cup",
        "yellow_base_rate": 3.88,
        "red_base_rate": 0.176,
        "fouls_base_rate": 23.20,
        "cpf_hierarchy_mult": 0.972,
        "kappa_comp": 20.0,
        "kappa_ref_yellow": 14.0,
        "kappa_ref_red": 32.0,
    },
    "CONMEBOL": {
        "confederation": "CONMEBOL",
        "tier_group": "south_america_leagues_and_cups",
        "yellow_base_rate": 4.92,
        "red_base_rate": 0.298,
        "fouls_base_rate": 26.80,
        "cpf_hierarchy_mult": 1.112,
        "kappa_comp": 20.0,
        "kappa_ref_yellow": 14.0,
        "kappa_ref_red": 32.0,
    },
    "CONCACAF": {
        "confederation": "CONCACAF",
        "tier_group": "north_central_america_leagues_and_cups",
        "yellow_base_rate": 4.34,
        "red_base_rate": 0.246,
        "fouls_base_rate": 24.60,
        "cpf_hierarchy_mult": 1.064,
        "kappa_comp": 20.0,
        "kappa_ref_yellow": 14.0,
        "kappa_ref_red": 32.0,
    },
    "AFC": {
        "confederation": "AFC",
        "tier_group": "asia_leagues_and_cups",
        "yellow_base_rate": 3.52,
        "red_base_rate": 0.168,
        "fouls_base_rate": 22.60,
        "cpf_hierarchy_mult": 0.918,
        "kappa_comp": 18.0,
        "kappa_ref_yellow": 14.0,
        "kappa_ref_red": 32.0,
    },
    "CAF": {
        "confederation": "CAF",
        "tier_group": "africa_club_and_nations",
        "yellow_base_rate": 4.18,
        "red_base_rate": 0.228,
        "fouls_base_rate": 25.40,
        "cpf_hierarchy_mult": 0.994,
        "kappa_comp": 18.0,
        "kappa_ref_yellow": 14.0,
        "kappa_ref_red": 32.0,
    },
    "FIFA_INTERNATIONAL": {
        "confederation": "FIFA",
        "tier_group": "intercontinental_and_qualifiers",
        "yellow_base_rate": 3.96,
        "red_base_rate": 0.192,
        "fouls_base_rate": 24.10,
        "cpf_hierarchy_mult": 0.988,
        "kappa_comp": 20.0,
        "kappa_ref_yellow": 14.0,
        "kappa_ref_red": 32.0,
    },
}

# Mapping of all 53 soccer competitions to (confederation_group, v51_div_code_or_None, raw_comp_rates, sample_eq_n)
SOCCER_53_COMPETITION_SPEC: dict[str, tuple[str, str | None, tuple[float, float, float, float], float]] = {
    # UEFA Top 5
    "premier-league": ("UEFA_TOP5", "E0", (3.8429, 0.0918, 22.0846, 0.992), 120.0),
    "laliga": ("UEFA_TOP5", "SP1", (4.9031, 0.2285, 25.1213, 1.068), 120.0),
    "serie-a": ("UEFA_TOP5", "I1", (3.9515, 0.2110, 25.2399, 0.968), 120.0),
    "bundesliga": ("UEFA_TOP5", "D1", (4.0500, 0.1905, 21.7847, 1.032), 120.0),
    "ligue-1": ("UEFA_TOP5", "F1", (3.7777, 0.1598, 24.0755, 0.965), 120.0),
    # UEFA Second Tier + Liga F
    "championship": ("UEFA_SECOND_TIER", "E1", (3.3739, 0.1076, 22.7649, 0.935), 110.0),
    "segunda-espana": ("UEFA_SECOND_TIER", "SP2", (4.7044, 0.2364, 27.6259, 1.052), 90.0),
    "serie-b": ("UEFA_SECOND_TIER", "I2", (5.0764, 0.2213, 30.1410, 1.046), 90.0),
    "bundesliga-2": ("UEFA_SECOND_TIER", "D2", (4.8476, 0.2137, 23.0067, 1.088), 100.0),
    "ligue-2": ("UEFA_SECOND_TIER", "F2", (3.6534, 0.2204, 26.7390, 0.915), 90.0),
    "liga-f": ("UEFA_SECOND_TIER", None, (3.4200, 0.1350, 21.8000, 0.945), 24.0),
    # UEFA Other First Tier
    "eredivisie": ("UEFA_OTHER_DOMESTIC", "N1", (2.9948, 0.1170, 19.9742, 0.912), 100.0),
    "liga-portugal": ("UEFA_OTHER_DOMESTIC", "P1", (4.7813, 0.2267, 27.2194, 1.064), 100.0),
    "pro-league-belgica": ("UEFA_OTHER_DOMESTIC", "B1", (3.5912, 0.2649, 20.5484, 1.018), 100.0),
    "super-lig": ("UEFA_OTHER_DOMESTIC", "T1", (4.6710, 0.2726, 25.1157, 1.078), 100.0),
    # UEFA Continental & National Teams
    "champions-league": ("UEFA_CONTINENTAL_KNOCKOUT", None, (4.1800, 0.1950, 23.4000, 1.036), 45.0),
    "europa-league": ("UEFA_CONTINENTAL_KNOCKOUT", None, (4.3800, 0.2120, 24.2000, 1.052), 45.0),
    "conference-league": ("UEFA_CONTINENTAL_KNOCKOUT", None, (4.4400, 0.2180, 24.5000, 1.058), 40.0),
    "uefa-super-cup": ("UEFA_CONTINENTAL_KNOCKOUT", None, (4.1500, 0.1850, 23.3000, 1.025), 12.0),
    "uefa-nations": ("UEFA_CONTINENTAL_KNOCKOUT", None, (4.1200, 0.1820, 23.6000, 1.018), 35.0),
    "eurocopa": ("UEFA_CONTINENTAL_KNOCKOUT", None, (4.2000, 0.1780, 23.5000, 1.028), 25.0),
    # UEFA Domestic Cups
    "fa-cup": ("UEFA_DOMESTIC_CUP", "E0", (3.4200, 0.1180, 21.6000, 0.942), 35.0),
    "carabao-cup": ("UEFA_DOMESTIC_CUP", "E0", (3.4800, 0.1220, 21.9000, 0.948), 35.0),
    "copa-del-rey": ("UEFA_DOMESTIC_CUP", "SP1", (4.4600, 0.2240, 24.9000, 1.038), 35.0),
    "coppa-italia": ("UEFA_DOMESTIC_CUP", "I1", (3.9200, 0.2040, 24.8000, 0.966), 35.0),
    "dfb-pokal": ("UEFA_DOMESTIC_CUP", "D1", (3.9800, 0.1880, 22.4000, 1.012), 35.0),
    "coupe-de-france": ("UEFA_DOMESTIC_CUP", "F1", (3.6200, 0.1720, 23.6000, 0.952), 35.0),
    # CONMEBOL Leagues & Cups
    "brasileirao": ("CONMEBOL", "BRA", (4.8600, 0.2860, 26.9000, 1.098), 55.0),
    "brasileirao-b": ("CONMEBOL", "BRA", (5.0200, 0.3050, 27.4000, 1.116), 45.0),
    "copa-do-brasil": ("CONMEBOL", "BRA", (4.7800, 0.2920, 26.5000, 1.094), 35.0),
    "liga-argentina": ("CONMEBOL", "ARG", (5.0400, 0.3080, 26.8000, 1.124), 55.0),
    "primera-a-colombia": ("CONMEBOL", None, (5.1200, 0.3180, 27.1000, 1.132), 40.0),
    "copa-colombia": ("CONMEBOL", None, (4.9600, 0.3040, 26.7000, 1.115), 25.0),
    "primera-chile": ("CONMEBOL", None, (4.9800, 0.3120, 26.6000, 1.122), 40.0),
    "liga-1-peru": ("CONMEBOL", None, (5.0800, 0.3220, 26.9000, 1.134), 40.0),
    "ligapro-ecuador": ("CONMEBOL", None, (4.9400, 0.3060, 26.5000, 1.118), 40.0),
    "libertadores": ("CONMEBOL", None, (5.1800, 0.3260, 27.3000, 1.142), 45.0),
    "sudamericana": ("CONMEBOL", None, (5.0600, 0.3100, 27.0000, 1.126), 45.0),
    "copa-america": ("CONMEBOL", None, (4.7600, 0.2780, 26.4000, 1.088), 25.0),
    # CONCACAF (Liga MX, MLS, Cups)
    "liga-mx": ("CONCACAF", "MEX", (4.5200, 0.2720, 24.9000, 1.088), 60.0),
    "mls": ("CONCACAF", "USA", (3.9400, 0.2060, 23.6000, 0.992), 60.0),
    "leagues-cup": ("CONCACAF", None, (4.3600, 0.2520, 24.5000, 1.066), 30.0),
    "concacaf-champions": ("CONCACAF", None, (4.4400, 0.2580, 24.8000, 1.076), 30.0),
    "concacaf-nations": ("CONCACAF", None, (4.2200, 0.2360, 24.4000, 1.044), 30.0),
    "copa-oro": ("CONCACAF", None, (4.2800, 0.2400, 24.6000, 1.052), 25.0),
    # AFC & CAF & FIFA Global
    "j1-league": ("AFC", "JPN", (2.8600, 0.1140, 21.2000, 0.812), 55.0),
    "saudi-pro-league": ("AFC", None, (4.1600, 0.2180, 23.8000, 1.022), 40.0),
    "copa-asiatica": ("AFC", None, (3.8800, 0.1940, 23.4000, 0.976), 25.0),
    "caf-champions": ("CAF", None, (4.2200, 0.2320, 25.6000, 0.998), 35.0),
    "copa-africana": ("CAF", None, (4.1400, 0.2240, 25.2000, 0.988), 25.0),
    "copa-del-mundo": ("FIFA_INTERNATIONAL", None, (4.0200, 0.1840, 23.9000, 0.996), 30.0),
    "eliminatorias": ("FIFA_INTERNATIONAL", None, (4.3200, 0.2340, 25.1000, 1.042), 40.0),
    "amistosos": ("FIFA_INTERNATIONAL", None, (3.2800, 0.1380, 22.1000, 0.892), 40.0),
}

# Leagues eligible for Lusophone surname resolution against `P1` in `official_priors_v5_1.json`
LUSOPHONE_UEFA_LEAGUES = frozenset(
    {"liga-portugal", "champions-league", "europa-league", "conference-league", "uefa-super-cup", "uefa-nations", "eurocopa"}
)
HISPANIC_UEFA_LEAGUES = frozenset(
    {"laliga", "segunda-espana", "copa-del-rey", "champions-league", "europa-league", "conference-league", "uefa-super-cup", "uefa-nations", "eurocopa"}
)
TURKISH_UEFA_LEAGUES = frozenset(
    {"super-lig", "champions-league", "europa-league", "conference-league", "uefa-super-cup", "uefa-nations", "eurocopa"}
)

_HONORIFIC_RE = re.compile(r"^(?:dr|mr|mrs|ms|prof)\.?\s+", re.IGNORECASE)
_GEN_SUFFIX_RE = re.compile(r"\b(?:jr|sr|ii|iii|iv)\b", re.IGNORECASE)
_NON_ALPHA_RE = re.compile(r"[^a-z\s]+")
_ISO_UTC_RE = re.compile(
    r"^(\d{4})-(\d{2})-(\d{2})"
    r"(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?"
    r"(Z|[+-]\d{2}:?\d{2})?)?$"
)
_NOBILIARY_PARTICLES = frozenset({"de", "da", "do", "dos", "das", "del", "la", "las", "los", "van", "von", "el", "al"})


# ============================================================================
# 1. Pure Mathematical & Cryptographic Primitives (Bit-Exact with TypeScript)
# ============================================================================


def clamp(x: float, lo: float, hi: float) -> float:
    return lo if x < lo else (hi if x > hi else x)


def logit(p: float, eps: float = 1e-6) -> float:
    pc = clamp(p, eps, 1.0 - eps)
    return math.log(pc / (1.0 - pc))


def sigmoid(z: float) -> float:
    if z < -709.0:
        return 0.0
    if z > 709.0:
        return 1.0
    return 1.0 / (1.0 + math.exp(-z))


def normal_cdf(x: float) -> float:
    """Abramowitz & Stegun 7.1.26 standard normal CDF (bit-exact with `src/domain/prediction/math.ts`)."""
    sign = -1.0 if x < 0.0 else 1.0
    z = abs(x) * 0.7071067811865475
    t = 1.0 / (1.0 + 0.3275911 * z)
    poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
    erf_val = sign * (1.0 - poly * math.exp(-(z * z)))
    return 0.5 * (1.0 + erf_val)


def mulberry32_step(seed: int, k: int) -> float:
    """Deterministic 32-bit `mulberry32` uniform `[0, 1)` at step `k >= 1`."""
    t = ((seed & 0xFFFFFFFF) + (k * 0x6D2B79F5)) & 0xFFFFFFFF
    t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
    inner = ((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF
    t = (t ^ ((t + inner) & 0xFFFFFFFF)) & 0xFFFFFFFF
    return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0


def quantile_linear_sorted(sorted_vals: Sequence[float], q: float) -> float:
    """Type-7 linear quantile identical to `numpy.quantile` and `clv.ts::quantileLinearSorted`."""
    n = len(sorted_vals)
    if n == 0:
        raise ValueError("quantile_linear_sorted requires non-empty sequence")
    if n == 1:
        return float(sorted_vals[0])
    cq = clamp(q, 0.0, 1.0)
    pos = cq * (n - 1)
    lo = int(math.floor(pos))
    hi = int(math.ceil(pos))
    frac = pos - lo
    return float(sorted_vals[lo]) + frac * (float(sorted_vals[hi]) - float(sorted_vals[lo]))


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def float64_to_canonical_hex(value: float) -> str:
    """Big-endian IEEE-754 64-bit hex (`-0.0 -> +0.0`), bit-exact with `float64ToCanonicalHex` in TS."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"Expected finite float for canonical hash, got {value!r}")
    fval = float(value)
    if not math.isfinite(fval):
        raise ValueError(f"Non-finite float for canonical hash: {value!r}")
    norm = 0.0 if fval == 0.0 else fval
    return struct.pack(">d", norm).hex()


def parse_iso_utc_epoch_ms(raw: Any) -> int | None:
    """Pure calendar-UTC ISO-8601 parser returning integer epoch milliseconds (host-timezone independent)."""
    if not isinstance(raw, str):
        return None
    s = raw.strip()
    if not s:
        return None
    m = _ISO_UTC_RE.match(s)
    if not m:
        return None
    year = int(m.group(1))
    month = int(m.group(2))
    day = int(m.group(3))
    hour = int(m.group(4) or 0)
    minute = int(m.group(5) or 0)
    second = int(m.group(6) or 0)
    frac_raw = m.group(7) or ""
    tz_raw = m.group(8) or "Z"

    if not (1 <= month <= 12 and 1 <= day <= 31 and 0 <= hour <= 23 and 0 <= minute <= 59 and 0 <= second <= 59):
        return None
    try:
        dt_mod.date(year, month, day)
    except ValueError:
        return None

    ms = int((frac_raw + "000")[:3]) if frac_raw else 0
    base_sec = calendar.timegm((year, month, day, hour, minute, second, 0, 0, 0))
    offset_ms = 0
    if tz_raw != "Z":
        sign = 1 if tz_raw[0] == "+" else -1
        tz_digits = tz_raw[1:].replace(":", "")
        tz_h = int(tz_digits[:2])
        tz_m = int(tz_digits[2:4])
        offset_ms = sign * ((tz_h * 60 + tz_m) * 60_000)

    return int(base_sec * 1000 + ms - offset_ms)


def format_epoch_ms_utc(epoch_ms: int) -> str:
    """Formats integer UTC epoch milliseconds as canonical 24-char `YYYY-MM-DDTHH:MM:SS.mmmZ`."""
    sec, ms = divmod(int(epoch_ms), 1000)
    dt = dt_mod.datetime.fromtimestamp(sec, tz=dt_mod.timezone.utc)
    return f"{dt.strftime('%Y-%m-%dT%H:%M:%S')}.{ms:03d}Z"


def cluster_bootstrap_mean_pure(
    cluster_ids: Sequence[str],
    values: Sequence[float],
    n_resamples: int = BOOTSTRAP_RESAMPLES,
    seed: int = BOOTSTRAP_SEED,
) -> dict[str, Any]:
    """Deterministic `mulberry32` cluster-bootstrap mean & CI95 (`None` on `n == 0`)."""
    n_rows = len(values)
    if n_rows == 0:
        return {
            "n_rows": 0,
            "n_clusters": 0,
            "mean": None,
            "se": None,
            "ci95_lo": None,
            "ci95_hi": None,
            "bootstrap_method": "cluster_mulberry32",
            "n_resamples": int(n_resamples),
            "seed": int(seed),
        }
    pt_mean = sum(values) / n_rows
    unique_clusters = sorted(set(cluster_ids))
    n_clusters = len(unique_clusters)
    if n_clusters < 2:
        return {
            "n_rows": n_rows,
            "n_clusters": n_clusters,
            "mean": round(pt_mean, 8),
            "se": None,
            "ci95_lo": None,
            "ci95_hi": None,
            "bootstrap_method": "cluster_mulberry32",
            "n_resamples": int(n_resamples),
            "seed": int(seed),
        }
    c_map = {c: i for i, c in enumerate(unique_clusters)}
    sum_v = [0.0] * n_clusters
    sum_w = [0.0] * n_clusters
    for cid, val in zip(cluster_ids, values):
        idx = c_map[cid]
        sum_v[idx] += float(val)
        sum_w[idx] += 1.0

    boot: list[float] = []
    step_k = 1
    for _ in range(n_resamples):
        b_num = 0.0
        b_den = 0.0
        for _c in range(n_clusters):
            u = mulberry32_step(seed, step_k)
            step_k += 1
            pick = int(u * n_clusters)
            if pick >= n_clusters:
                pick = n_clusters - 1
            b_num += sum_v[pick]
            b_den += sum_w[pick]
        boot.append(b_num / max(b_den, 1e-12))

    boot_sorted = sorted(boot)
    ci_lo = quantile_linear_sorted(boot_sorted, 0.025)
    ci_hi = quantile_linear_sorted(boot_sorted, 0.975)
    mean_b = sum(boot) / n_resamples
    se = math.sqrt(sum((x - mean_b) ** 2 for x in boot) / max(1, n_resamples - 1))
    return {
        "n_rows": n_rows,
        "n_clusters": n_clusters,
        "mean": round(pt_mean, 8),
        "se": round(se, 8),
        "ci95_lo": round(ci_lo, 8),
        "ci95_hi": round(ci_hi, 8),
        "bootstrap_method": "cluster_mulberry32",
        "n_resamples": int(n_resamples),
        "seed": int(seed),
    }


def cluster_bootstrap_diff_pure(
    cluster_ids: Sequence[str],
    loss_cand: Sequence[float],
    loss_bench: Sequence[float],
    n_resamples: int = BOOTSTRAP_RESAMPLES,
    seed: int = BOOTSTRAP_SEED,
) -> dict[str, Any]:
    """Bit-exact cluster-bootstrap paired difference `mean(loss_cand - loss_bench)` (`None` on `n == 0`)."""
    n_rows = len(loss_cand)
    if n_rows == 0:
        return {
            "n_rows": 0,
            "n_clusters": 0,
            "cand_mean": None,
            "bench_mean": None,
            "delta_mean": None,
            "se": None,
            "ci95_lo": None,
            "ci95_hi": None,
            "p_value_one_sided": None,
            "significant_improvement": False,
            "significance_label": "no significativa",
            "bootstrap_method": "cluster_mulberry32",
            "n_resamples": int(n_resamples),
            "seed": int(seed),
        }

    cand_mean = sum(loss_cand) / n_rows
    bench_mean = sum(loss_bench) / n_rows
    diffs = [float(c) - float(b) for c, b in zip(loss_cand, loss_bench)]
    delta_mean = sum(diffs) / n_rows

    unique_clusters = sorted(set(cluster_ids))
    n_clusters = len(unique_clusters)
    if n_clusters < 2:
        return {
            "n_rows": n_rows,
            "n_clusters": n_clusters,
            "cand_mean": round(cand_mean, 8),
            "bench_mean": round(bench_mean, 8),
            "delta_mean": round(delta_mean, 8),
            "se": None,
            "ci95_lo": None,
            "ci95_hi": None,
            "p_value_one_sided": None,
            "significant_improvement": False,
            "significance_label": "no significativa",
            "bootstrap_method": "cluster_mulberry32",
            "n_resamples": int(n_resamples),
            "seed": int(seed),
        }

    c_map = {c: i for i, c in enumerate(unique_clusters)}
    sum_d = [0.0] * n_clusters
    sum_w = [0.0] * n_clusters
    for cid, d in zip(cluster_ids, diffs):
        idx = c_map[cid]
        sum_d[idx] += d
        sum_w[idx] += 1.0

    boot: list[float] = []
    step_k = 1
    for _ in range(n_resamples):
        b_num = 0.0
        b_den = 0.0
        for _c in range(n_clusters):
            u = mulberry32_step(seed, step_k)
            step_k += 1
            pick = int(u * n_clusters)
            if pick >= n_clusters:
                pick = n_clusters - 1
            b_num += sum_d[pick]
            b_den += sum_w[pick]
        boot.append(b_num / max(b_den, 1e-12))

    boot_sorted = sorted(boot)
    ci_lo = quantile_linear_sorted(boot_sorted, 0.025)
    ci_hi = quantile_linear_sorted(boot_sorted, 0.975)
    mean_b = sum(boot) / n_resamples
    se = math.sqrt(sum((x - mean_b) ** 2 for x in boot) / max(1, n_resamples - 1))
    p_one = sum(1 for x in boot if x >= 0.0) / n_resamples
    sig_imp = bool(ci_hi < 0.0)
    sig_lbl = "significativa" if (ci_hi < 0.0 or ci_lo > 0.0) else "no significativa"

    return {
        "n_rows": n_rows,
        "n_clusters": n_clusters,
        "cand_mean": round(cand_mean, 8),
        "bench_mean": round(bench_mean, 8),
        "delta_mean": round(delta_mean, 8),
        "se": round(se, 8),
        "ci95_lo": round(ci_lo, 8),
        "ci95_hi": round(ci_hi, 8),
        "p_value_one_sided": round(p_one, 6),
        "significant_improvement": sig_imp,
        "significance_label": sig_lbl,
        "bootstrap_method": "cluster_mulberry32",
        "n_resamples": int(n_resamples),
        "seed": int(seed),
    }


def safe_ece_binary_pure(y_true: Sequence[int], probs: Sequence[float], n_bins: int = 10) -> float | None:
    """10-bin Expected Calibration Error returning `None` when `n == 0`."""
    n = len(y_true)
    if n == 0:
        return None
    bins_n = [0] * n_bins
    bins_p = [0.0] * n_bins
    bins_y = [0.0] * n_bins
    for y, p in zip(y_true, probs):
        pc = clamp(float(p), 0.0, 1.0)
        b = n_bins - 1 if pc >= 1.0 else max(0, min(n_bins - 1, int(pc * n_bins)))
        bins_n[b] += 1
        bins_p[b] += pc
        bins_y[b] += float(y)
    ece = 0.0
    for b in range(n_bins):
        if bins_n[b] > 0:
            ece += (bins_n[b] / n) * abs((bins_p[b] / bins_n[b]) - (bins_y[b] / bins_n[b]))
    return round(ece, 8)


# ============================================================================
# 2. Module 1 — Global Referee Registry & Hierarchical Disciplinary Priors v6.0
# ============================================================================


def _transliterate_latin_extended(raw: str) -> str:
    return (
        raw.replace("ı", "i")
        .replace("İ", "i")
        .replace("ß", "ss")
        .replace("ø", "o")
        .replace("Ø", "o")
        .replace("ł", "l")
        .replace("Ł", "l")
        .replace("đ", "d")
        .replace("Đ", "d")
        .replace("æ", "ae")
        .replace("Æ", "ae")
        .replace("œ", "oe")
        .replace("Œ", "oe")
    )


def normalize_referee_name_v6(raw_name: str | None) -> dict[str, Any]:
    """Normalizes accents, extended Latin characters, honorifics, initials, and suffixes."""
    if not raw_name or not isinstance(raw_name, str):
        return {
            "normalizedFull": "",
            "canonicalKey": "",
            "legacyDotlessKey": "",
            "firstInitial": "",
            "tokens": [],
        }
    trimmed = raw_name.strip()
    if not trimmed or trimmed.lower() in {"nan", "none", "null", "unknown", "tbd"}:
        return {
            "normalizedFull": "",
            "canonicalKey": "",
            "legacyDotlessKey": "",
            "firstInitial": "",
            "tokens": [],
        }

    # Modern transliteration (preserves Turkish dotless ı -> i, ł -> l, ø -> o)
    s_mod = unicodedata.normalize("NFKD", _transliterate_latin_extended(trimmed))
    s_mod = "".join(ch for ch in s_mod if not unicodedata.combining(ch))
    s_mod = _HONORIFIC_RE.sub("", s_mod.strip())
    s_mod = _GEN_SUFFIX_RE.sub(" ", s_mod.lower())
    s_mod = _NON_ALPHA_RE.sub(" ", s_mod)
    toks = [t for t in s_mod.split() if t]

    # Legacy v5.1 NFKD->ASCII (where dotless ı was stripped, e.g., `Oğuzhan Çakır -> o cakr`)
    s_leg = unicodedata.normalize("NFKD", trimmed).encode("ascii", "ignore").decode("ascii")
    s_leg = _HONORIFIC_RE.sub("", s_leg.strip())
    s_leg = _GEN_SUFFIX_RE.sub(" ", s_leg.lower())
    s_leg = _NON_ALPHA_RE.sub(" ", s_leg)
    leg_toks = [t for t in s_leg.split() if t]

    if not toks:
        return {
            "normalizedFull": "",
            "canonicalKey": "",
            "legacyDotlessKey": "",
            "firstInitial": "",
            "tokens": [],
        }

    norm_full = " ".join(toks)
    canon_key = toks[0] if len(toks) == 1 else f"{toks[0][0]} {' '.join(toks[1:])}"
    leg_key = leg_toks[0] if len(leg_toks) == 1 else (f"{leg_toks[0][0]} {' '.join(leg_toks[1:])}" if leg_toks else "")

    return {
        "normalizedFull": norm_full,
        "canonicalKey": canon_key,
        "legacyDotlessKey": leg_key,
        "firstInitial": toks[0][0],
        "tokens": toks,
    }


def nb_pmf_exact_v6(mu: float, r_disp: float, max_k: int) -> list[float]:
    """Exact Negative Binomial PMF on `0..max_k` using elementary IEEE-754 arithmetic."""
    mu_c = clamp(mu, 0.005, 45.0)
    r_c = clamp(r_disp, 0.35, 250.0)
    out = [0.0] * (max_k + 1)
    p0_ratio = r_c / (r_c + mu_c)
    q_ratio = mu_c / (r_c + mu_c)
    out[0] = math.exp(r_c * math.log(p0_ratio))
    for k in range(1, max_k + 1):
        out[k] = out[k - 1] * ((k - 1.0 + r_c) / k) * q_ratio
    s = sum(out)
    if s > 0.0:
        inv_s = 1.0 / s
        for k in range(max_k + 1):
            out[k] *= inv_s
    else:
        out[0] = 1.0
    return out


def compute_conditional_booking_points_v6(
    yellow_rate_prior: float,
    red_card_rate_prior: float,
    gamma_red: float = BOOKING_POINTS_GAMMA_RED,
    r_yellow: float = DEFAULT_R_YELLOW,
    r_red: float = DEFAULT_R_RED,
    max_y: int = DEFAULT_MAX_Y_TOTAL,
    max_r: int = DEFAULT_MAX_R_TOTAL,
    lines: Sequence[float] = BOOKING_POINTS_LINES,
) -> dict[str, Any]:
    """Exact conditional NB factorization `P(Y=y, R=r) = P(R=r) * P_NB(Y=y | mu_Y(r), r_cond)`
    conserving `E[Y]` and `Var[Y]` with `gamma_red = 0.1680` (`10*Y + 25*R`).
    """
    mu_y_in = clamp(yellow_rate_prior, 0.20, 12.0)
    mu_r_in = clamp(red_card_rate_prior, 0.01, 1.50)
    gr = clamp(gamma_red, 0.0, 0.85)

    pmf_y_marg = nb_pmf_exact_v6(mu_y_in, r_yellow, max_y)
    pmf_r_marg = nb_pmf_exact_v6(mu_r_in, r_red, max_r)
    ny = len(pmf_y_marg)
    nr = len(pmf_r_marg)

    mu_y = sum(y * pmf_y_marg[y] for y in range(ny))
    var_y = sum(((y - mu_y) ** 2) * pmf_y_marg[y] for y in range(ny))
    z_norm = sum(pmf_r_marg[r] * math.exp(gr * r) for r in range(nr))
    inv_z = 1.0 / z_norm if z_norm > 1e-15 else 1.0

    mu_by_r = [mu_y * math.exp(gr * r) * inv_z for r in range(nr)]
    var_between = sum(pmf_r_marg[r] * ((mu_by_r[r] - mu_y) ** 2) for r in range(nr))
    excess_var = max(var_y - mu_y - var_between, 1e-6)
    r_cond = clamp((mu_y * mu_y + var_between) / excess_var, 1.5, 250.0)

    max_u5 = 2 * max_y + 5 * max_r
    pmf_u5 = [0.0] * (max_u5 + 1)
    tot_mass = 0.0

    for r in range(nr):
        pr = pmf_r_marg[r]
        if pr <= 0.0:
            continue
        pmf_y_cond = nb_pmf_exact_v6(mu_by_r[r], r_cond, max_y)
        for y in range(ny):
            py = pmf_y_cond[y]
            if py <= 0.0:
                continue
            p_joint = pr * py
            tot_mass += p_joint
            pmf_u5[2 * y + 5 * r] += p_joint

    inv_m = 1.0 / tot_mass if tot_mass > 0.0 else 1.0
    exp_bp = 0.0
    for u in range(max_u5 + 1):
        pmf_u5[u] *= inv_m
        exp_bp += 5.0 * u * pmf_u5[u]

    p_red_over_05 = clamp(1.0 - pmf_r_marg[0], 0.001, 0.999)
    p_r_pos = max(1.0 - pmf_r_marg[0], 1e-12)
    e_y_given_r0 = mu_by_r[0]
    e_y_given_r1plus = sum(pmf_r_marg[r] * mu_by_r[r] for r in range(1, nr)) / p_r_pos

    line_probs: dict[str, dict[str, float]] = {}
    for ln in lines:
        p_ov = 0.0
        p_un = 0.0
        p_ps = 0.0
        for u in range(max_u5 + 1):
            p = pmf_u5[u]
            if p <= 0.0:
                continue
            pts = 5.0 * u
            if abs(pts - ln) < 1e-9:
                p_ps += p
            elif pts > ln:
                p_ov += p
            else:
                p_un += p
        act = p_ov + p_un
        po_cond = clamp(p_ov / act, 0.001, 0.999) if act > 1e-12 else 0.5
        key_str = f"{ln:.1f}"
        line_probs[key_str] = {
            "line": float(ln),
            "pOver": p_ov,
            "pUnder": p_un,
            "pPush": p_ps,
            "pOverConditionalNoPush": po_cond,
        }

    return {
        "formula": "10_per_yellow_plus_25_per_red",
        "gammaRed": gr,
        "expectedBookingPoints": exp_bp,
        "pRedCardOver05": p_red_over_05,
        "expectedYellowsGivenNoRed": e_y_given_r0,
        "expectedYellowsGivenRedCard": e_y_given_r1plus,
        "lines": line_probs,
    }


def build_competition_disciplinary_priors_v6() -> dict[str, dict[str, Any]]:
    """Constructs Empirical-Bayes shrunk competition priors across all 53 soccer competitions."""
    comp_priors: dict[str, dict[str, Any]] = {}
    for comp_slug, (conf_key, div_code, (raw_y, raw_r, raw_f, raw_cpf), eq_n) in sorted(
        SOCCER_53_COMPETITION_SPEC.items()
    ):
        conf = CONFEDERATION_HIERARCHICAL_PRIORS[conf_key]
        k_c = float(conf["kappa_comp"])
        w = eq_n / (eq_n + k_c)
        yel_eb = w * raw_y + (1.0 - w) * float(conf["yellow_base_rate"])
        red_eb = w * raw_r + (1.0 - w) * float(conf["red_base_rate"])
        fls_eb = w * raw_f + (1.0 - w) * float(conf["fouls_base_rate"])
        cpf_eb = w * raw_cpf + (1.0 - w) * float(conf["cpf_hierarchy_mult"])

        bp = compute_conditional_booking_points_v6(yel_eb, red_eb, gamma_red=BOOKING_POINTS_GAMMA_RED)
        comp_priors[comp_slug] = {
            "league": comp_slug,
            "confederation_group": conf_key,
            "confederation": conf["confederation"],
            "v51_div_code": div_code,
            "equivalent_prior_games": round(eq_n, 2),
            "kappa_comp": round(k_c, 2),
            "yellow_rate_prior": round(yel_eb, 6),
            "red_card_rate_prior": round(red_eb, 6),
            "fouls_rate_prior": round(fls_eb, 6),
            "cards_per_foul_mult": round(cpf_eb, 6),
            "booking_points_expected": round(bp["expectedBookingPoints"], 6),
            "gamma_red": BOOKING_POINTS_GAMMA_RED,
        }
    return comp_priors


def _resolve_v51_key_for_referee(
    raw_name: str,
    league: str,
    v51_officials: Mapping[str, Mapping[str, Any]],
) -> tuple[str | None, str]:
    """Resolves a referee name against the 839 `official_priors_v5_1.json` entries without false homonyms."""
    norm = normalize_referee_name_v6(raw_name)
    canon = norm["canonicalKey"]
    leg_key = norm["legacyDotlessKey"]
    toks: list[str] = norm["tokens"]
    if not canon or not toks:
        return None, "unmatched"

    # 1. Direct canonical match (`a madley`, `f letexier`, `c soto grado`, `b millot`)
    if canon in v51_officials:
        return canon, "exact_canonical"

    # 2. Turkish dotless-i / ASCII-stripped legacy key (`Oguzhan Cakir -> o cakr` in T1/UEFA)
    if leg_key and leg_key in v51_officials and league in TURKISH_UEFA_LEAGUES:
        if v51_officials[leg_key].get("last_div") == "T1":
            return leg_key, "turkish_ascii_alias"
    if league in TURKISH_UEFA_LEAGUES and len(toks) >= 2:
        # Handle input `"Oguzhan Cakir"` -> `"o cakr"` where ASCII input already had `"i"` for `"ı"`
        last_no_i = toks[-1].replace("i", "")
        cand_tr = f"{toks[0][0]} {' '.join(toks[1:-1] + [last_no_i])}".strip()
        if cand_tr in v51_officials and v51_officials[cand_tr].get("last_div") == "T1":
            return cand_tr, "turkish_dotless_alias"

    # 3. Single-initial + surname reduction when middle initials are present (`"A. G. Wiley" -> "a wiley"`)
    if len(toks) >= 3 and all(len(m_tok) == 1 for m_tok in toks[1:-1]):
        short_k = f"{toks[0][0]} {toks[-1]}"
        if short_k in v51_officials:
            return short_k, "middle_initial_collapsed"

    # 4. Hispanic compound surname with middle given name in v5.1 (`Francisco Hernandez Maeso -> f jose hernandez maeso`)
    if league in HISPANIC_UEFA_LEAGUES and len(toks) >= 3:
        init = toks[0][0]
        pat_surname, mat_surname = toks[-2], toks[-1]
        sp_cands = [
            vk
            for vk, vv in v51_officials.items()
            if vv.get("last_div") == "SP1"
            and vk.startswith(init + " ")
            and len(vk.split()) >= 4
            and vk.split()[-2:] == [pat_surname, mat_surname]
        ]
        if len(sp_cands) == 1:
            return sp_cands[0], "hispanic_middle_name_alias"

    # 5. Lusophone full-name reduction (`Joao Pedro Pinheiro -> j pinheiro`, `Bruno Jose Ribeiro Pires Costa -> b jose costa`)
    if league in LUSOPHONE_UEFA_LEAGUES and len(toks) >= 3:
        init = toks[0][0]
        meaningful = [t for t in toks[1:] if t not in _NOBILIARY_PARTICLES]
        if meaningful:
            last_surname = meaningful[-1]
            # Try `(initial + second_given + last_surname)` first (e.g. `b jose costa`)
            if len(meaningful) >= 2:
                mid_k = f"{init} {meaningful[0]} {last_surname}"
                if mid_k in v51_officials and v51_officials[mid_k].get("last_div") == "P1":
                    return mid_k, "lusophone_compound_alias"
            short_pt = f"{init} {last_surname}"
            if short_pt in v51_officials and v51_officials[short_pt].get("last_div") == "P1":
                return short_pt, "lusophone_primary_surname_alias"

    return None, "unmatched"


def resolve_official_prior_v6(
    referee_name: str | None,
    league: str,
    artifact: Mapping[str, Any],
) -> dict[str, Any]:
    """Deterministic referee disciplinary resolver mirroring `resolveOfficialPriorV6` in TypeScript."""
    lg = (league or "").strip().lower()
    if lg in NON_SOCCER_US_LEAGUES:
        norm_us = normalize_referee_name_v6(referee_name)
        return {
            "league": lg,
            "sport": NON_SOCCER_US_LEAGUES[lg],
            "refereeRaw": referee_name,
            "canonicalKey": norm_us["canonicalKey"] or "unassigned",
            "matchedV51Key": None,
            "confederation": "US_MAJOR_PRO",
            "provenance": "non_soccer_umpire_neutral",
            "historicalGames": 0,
            "yellowMult": 1.0,
            "redMult": 1.0,
            "foulsMult": 1.0,
            "cardsPerFoulMult": 1.0,
            "yellowRatePrior": None,
            "redCardRatePrior": None,
            "foulsRatePrior": None,
            "gammaRed": 0.0,
            "bookingPointsExpected": None,
            "pRedCardOver05": None,
            "pBookingPointsOver355": None,
            "pBookingPointsOver455": None,
            "pBookingPointsOver555": None,
        }

    comp_priors = artifact["competition_priors"]
    comp = comp_priors.get(lg) or comp_priors["amistosos"]
    v51_map: Mapping[str, Any] = artifact["v5_1_officials"]
    alias_map: Mapping[str, str] = artifact.get("alias_to_v5_1_key") or {}

    norm = normalize_referee_name_v6(referee_name)
    canon_key = norm["canonicalKey"]

    matched_v51_key: str | None = None
    if canon_key:
        scoped_alias = f"{lg}::{canon_key}"
        if scoped_alias in alias_map:
            matched_v51_key = alias_map[scoped_alias]
        elif canon_key in v51_map:
            matched_v51_key = canon_key
        else:
            resolved_k, _ = _resolve_v51_key_for_referee(referee_name or "", lg, v51_map)
            matched_v51_key = resolved_k

    base_yel = float(comp["yellow_rate_prior"])
    base_red = float(comp["red_card_rate_prior"])
    base_fls = float(comp["fouls_rate_prior"])
    base_cpf_mult = float(comp["cards_per_foul_mult"])

    if matched_v51_key and matched_v51_key in v51_map:
        ent = v51_map[matched_v51_key]
        y_mult = float(ent["yellow_mult"])
        r_mult = float(ent["red_mult"])
        f_mult = float(ent["fouls_mult"])
        cpf_ref = float(ent["cpf_mult"])

        yel_prior = clamp(base_yel * y_mult, 1.20, 8.50)
        red_prior = clamp(base_red * r_mult, 0.03, 0.85)
        fls_prior = clamp(base_fls * f_mult, 12.0, 36.0)
        cpf_mult = clamp(base_cpf_mult * cpf_ref, 0.65, 1.55)
        provenance = "empirical_tm_verified"
        hist_games = int(ent["games_yellow"])
    else:
        y_mult = 1.0
        r_mult = 1.0
        f_mult = 1.0
        yel_prior = clamp(base_yel, 1.20, 8.50)
        red_prior = clamp(base_red, 0.03, 0.85)
        fls_prior = clamp(base_fls, 12.0, 36.0)
        cpf_mult = clamp(base_cpf_mult, 0.65, 1.55)
        provenance = "confederation_hierarchical_prior"
        hist_games = 0

    bp = compute_conditional_booking_points_v6(
        yellow_rate_prior=yel_prior,
        red_card_rate_prior=red_prior,
        gamma_red=float(artifact.get("booking_points_gamma_red", BOOKING_POINTS_GAMMA_RED)),
    )

    return {
        "league": lg,
        "sport": "football",
        "refereeRaw": referee_name,
        "canonicalKey": canon_key or "unassigned_competition_prior",
        "matchedV51Key": matched_v51_key,
        "confederation": comp["confederation"],
        "provenance": provenance,
        "historicalGames": hist_games,
        "yellowMult": y_mult,
        "redMult": r_mult,
        "foulsMult": f_mult,
        "cardsPerFoulMult": cpf_mult,
        "yellowRatePrior": yel_prior,
        "redCardRatePrior": red_prior,
        "foulsRatePrior": fls_prior,
        "gammaRed": bp["gammaRed"],
        "bookingPointsExpected": bp["expectedBookingPoints"],
        "pRedCardOver05": bp["pRedCardOver05"],
        "pBookingPointsOver355": bp["lines"]["35.5"]["pOver"],
        "pBookingPointsOver455": bp["lines"]["45.5"]["pOver"],
        "pBookingPointsOver555": bp["lines"]["55.5"]["pOver"],
    }


# ============================================================================
# 3. Module 2 — Deterministic Pre-Kickoff Freeze Contract (`sealPreKickoffOutlookV6`)
# ============================================================================


def normalize_lifecycle_status_v6(raw_status: str | None) -> str:
    st = (raw_status or "").strip().lower()
    if st in {"scheduled", "ns", "not_started", "pre", "upcoming"}:
        return "scheduled"
    if st in {"in_progress", "live", "ht", "1h", "2h", "ot"}:
        return "LIVE"
    if st in {"final", "ft", "finished", "aet", "pen", "completed"}:
        return "FT"
    return "scheduled"


def _canonicalize_probabilities_for_seal(probs: Mapping[str, float | None]) -> list[list[str | None]]:
    out: list[list[str | None]] = []
    for k in sorted(probs.keys()):
        v = probs[k]
        out.append([str(k), None if v is None else float64_to_canonical_hex(float(v))])
    return out


def compute_canonical_seal_sha256_v6(
    match_id: str,
    sport: str,
    league: str,
    home_team: str,
    away_team: str,
    kickoff_epoch_ms: int,
    inputs_as_of_epoch_ms: int,
    seal_origin: str,
    prev_seal_sha256: str,
    probabilities: Mapping[str, float | None],
    projection: Mapping[str, float | None],
) -> str:
    """Computes canonical `SHA-256` identical bit-for-bit between Python and TypeScript."""
    canonical_tuple = [
        SCHEMA_VERSION_SEAL,
        str(match_id),
        str(sport),
        str(league),
        str(home_team),
        str(away_team),
        str(int(kickoff_epoch_ms)),
        str(int(inputs_as_of_epoch_ms)),
        str(seal_origin),
        str(prev_seal_sha256),
        _canonicalize_probabilities_for_seal(probabilities),
        _canonicalize_probabilities_for_seal(projection),
    ]
    payload_json = json.dumps(canonical_tuple, ensure_ascii=False, separators=(",", ":"))
    return sha256_hex(payload_json)


def _create_sealed_record_v6(
    match_id: str,
    sport: str,
    league: str,
    home_team: str,
    away_team: str,
    kickoff_epoch_ms: int,
    analysis: Mapping[str, Any],
    seal_origin: str,
    prev_seal_sha256: str = GENESIS_SEAL_HASH,
) -> dict[str, Any]:
    iao_ms = parse_iso_utc_epoch_ms(analysis.get("inputsAsOfUtc"))
    if iao_ms is None or iao_ms > kickoff_epoch_ms:
        raise ValueError("Cannot create sealed record with missing or post-kickoff inputsAsOfUtc")

    probs_raw = analysis.get("probabilities") or {}
    proj_raw = analysis.get("projection") or {}
    probs_clean: dict[str, float | None] = {
        str(k): (None if v is None else float(v)) for k, v in sorted(probs_raw.items())
    }
    proj_clean: dict[str, float | None] = {
        str(k): (None if v is None else float(v)) for k, v in sorted(proj_raw.items())
    }
    seal_hash = compute_canonical_seal_sha256_v6(
        match_id=match_id,
        sport=sport,
        league=league,
        home_team=home_team,
        away_team=away_team,
        kickoff_epoch_ms=kickoff_epoch_ms,
        inputs_as_of_epoch_ms=iao_ms,
        seal_origin=seal_origin,
        prev_seal_sha256=prev_seal_sha256,
        probabilities=probs_clean,
        projection=proj_clean,
    )
    return {
        "schemaVersion": SCHEMA_VERSION_SEAL,
        "matchId": str(match_id),
        "sport": str(sport),
        "league": str(league),
        "homeTeam": str(home_team),
        "awayTeam": str(away_team),
        "kickoffUtc": format_epoch_ms_utc(kickoff_epoch_ms),
        "kickoffEpochMs": int(kickoff_epoch_ms),
        "inputsAsOfUtc": format_epoch_ms_utc(iao_ms),
        "inputsAsOfEpochMs": int(iao_ms),
        "leadTimeSeconds": (kickoff_epoch_ms - iao_ms) / 1000.0,
        "sealOrigin": str(seal_origin),
        "prevSealSha256": str(prev_seal_sha256),
        "sealSha256": seal_hash,
        "probabilities": probs_clean,
        "projection": proj_clean,
    }


def seal_pre_kickoff_outlook_v6(
    match_id: str,
    sport: str,
    league: str,
    home_team: str,
    away_team: str,
    kickoff_utc: str,
    status: str,
    incoming_analysis: Mapping[str, Any] | None = None,
    existing_sealed_record: Mapping[str, Any] | None = None,
    causal_backfill_analysis: Mapping[str, Any] | None = None,
    allow_pre_kickoff_refresh: bool = False,
) -> dict[str, Any]:
    """Deterministic Pre-Kickoff Freeze Contract (`sealPreKickoffOutlookV6`).

    - Emits an immutable `SHA-256` sealed record ONLY when `inputsAsOfUtc <= kickoffUtc`.
    - Marks `"post_kickoff_contaminated"` any regeneration with `inputsAsOfUtc > kickoffUtc`
      and rejects it without overwriting any prior valid seal.
    - Preserves `hasForecast = True` and the exact sealed record across `scheduled -> LIVE -> FT`,
      eliminating NBA (`5 FT`) and NHL (`14 FT`) forecast loss on game completion.
    """
    norm_status = normalize_lifecycle_status_v6(status)
    ko_ms = parse_iso_utc_epoch_ms(kickoff_utc)
    if ko_ms is None:
        return {
            "matchId": str(match_id),
            "lifecycleStatus": norm_status,
            "hasForecast": False,
            "causalityStatus": "missing_timestamps",
            "incomingCausalityStatus": "missing_timestamps",
            "sealAction": "rejected_missing_kickoff",
            "incomingContaminatedRejected": False,
            "sealedRecord": None,
        }

    # Check incoming analysis causality
    inc_iao_ms = parse_iso_utc_epoch_ms(incoming_analysis.get("inputsAsOfUtc")) if incoming_analysis else None
    if incoming_analysis is None:
        inc_status = "missing_analysis"
    elif inc_iao_ms is None:
        inc_status = "missing_timestamps"
    elif inc_iao_ms <= ko_ms:
        inc_status = "strict_pre_kickoff"
    else:
        inc_status = "post_kickoff_contaminated"

    # Case 1: Incoming analysis is strictly pre-kickoff (`inputsAsOfUtc <= kickoffUtc`)
    if inc_status == "strict_pre_kickoff" and incoming_analysis is not None and inc_iao_ms is not None:
        if existing_sealed_record is not None:
            ex_ms = int(existing_sealed_record["inputsAsOfEpochMs"])
            if norm_status == "scheduled" and allow_pre_kickoff_refresh and inc_iao_ms > ex_ms:
                refreshed = _create_sealed_record_v6(
                    match_id=match_id,
                    sport=sport,
                    league=league,
                    home_team=home_team,
                    away_team=away_team,
                    kickoff_epoch_ms=ko_ms,
                    analysis=incoming_analysis,
                    seal_origin="live_snapshot_prekickoff",
                    prev_seal_sha256=str(existing_sealed_record["sealSha256"]),
                )
                return {
                    "matchId": str(match_id),
                    "lifecycleStatus": norm_status,
                    "hasForecast": True,
                    "causalityStatus": "strict_pre_kickoff_sealed",
                    "incomingCausalityStatus": inc_status,
                    "sealAction": "refreshed_pre_kickoff_seal",
                    "incomingContaminatedRejected": False,
                    "sealedRecord": refreshed,
                }
            return {
                "matchId": str(match_id),
                "lifecycleStatus": norm_status,
                "hasForecast": True,
                "causalityStatus": "strict_pre_kickoff_sealed",
                "incomingCausalityStatus": inc_status,
                "sealAction": "preserved_existing_seal",
                "incomingContaminatedRejected": False,
                "sealedRecord": dict(existing_sealed_record),
            }

        sealed = _create_sealed_record_v6(
            match_id=match_id,
            sport=sport,
            league=league,
            home_team=home_team,
            away_team=away_team,
            kickoff_epoch_ms=ko_ms,
            analysis=incoming_analysis,
            seal_origin="live_snapshot_prekickoff",
            prev_seal_sha256=GENESIS_SEAL_HASH,
        )
        return {
            "matchId": str(match_id),
            "lifecycleStatus": norm_status,
            "hasForecast": True,
            "causalityStatus": "strict_pre_kickoff_sealed",
            "incomingCausalityStatus": inc_status,
            "sealAction": "sealed_new_pre_kickoff",
            "incomingContaminatedRejected": False,
            "sealedRecord": sealed,
        }

    # Case 2: Incoming analysis is post-kickoff contaminated (`inputsAsOfUtc > kickoffUtc`)
    if inc_status == "post_kickoff_contaminated":
        if existing_sealed_record is not None:
            return {
                "matchId": str(match_id),
                "lifecycleStatus": norm_status,
                "hasForecast": True,
                "causalityStatus": "strict_pre_kickoff_sealed",
                "incomingCausalityStatus": "post_kickoff_contaminated",
                "sealAction": "rejected_contaminated_preserved_seal",
                "incomingContaminatedRejected": True,
                "sealedRecord": dict(existing_sealed_record),
            }
        if causal_backfill_analysis is not None:
            bf_ms = parse_iso_utc_epoch_ms(causal_backfill_analysis.get("inputsAsOfUtc"))
            if bf_ms is not None and bf_ms <= ko_ms:
                sealed_bf = _create_sealed_record_v6(
                    match_id=match_id,
                    sport=sport,
                    league=league,
                    home_team=home_team,
                    away_team=away_team,
                    kickoff_epoch_ms=ko_ms,
                    analysis=causal_backfill_analysis,
                    seal_origin="causal_walkforward_backfill",
                    prev_seal_sha256=GENESIS_SEAL_HASH,
                )
                return {
                    "matchId": str(match_id),
                    "lifecycleStatus": norm_status,
                    "hasForecast": True,
                    "causalityStatus": "strict_pre_kickoff_sealed",
                    "incomingCausalityStatus": "post_kickoff_contaminated",
                    "sealAction": "rejected_contaminated_sealed_from_causal_backfill",
                    "incomingContaminatedRejected": True,
                    "sealedRecord": sealed_bf,
                }
        return {
            "matchId": str(match_id),
            "lifecycleStatus": norm_status,
            "hasForecast": False,
            "causalityStatus": "post_kickoff_contaminated",
            "incomingCausalityStatus": "post_kickoff_contaminated",
            "sealAction": "rejected_post_kickoff_contaminated",
            "incomingContaminatedRejected": True,
            "sealedRecord": None,
        }

    # Case 3: Incoming analysis missing (e.g. NBA/NHL transition to `FT` dropping `analyses[gameId]`)
    if existing_sealed_record is not None:
        return {
            "matchId": str(match_id),
            "lifecycleStatus": norm_status,
            "hasForecast": True,
            "causalityStatus": "strict_pre_kickoff_sealed",
            "incomingCausalityStatus": inc_status,
            "sealAction": "preserved_seal_on_missing_upstream",
            "incomingContaminatedRejected": False,
            "sealedRecord": dict(existing_sealed_record),
        }

    if causal_backfill_analysis is not None:
        bf_ms = parse_iso_utc_epoch_ms(causal_backfill_analysis.get("inputsAsOfUtc"))
        if bf_ms is not None and bf_ms <= ko_ms:
            sealed_bf = _create_sealed_record_v6(
                match_id=match_id,
                sport=sport,
                league=league,
                home_team=home_team,
                away_team=away_team,
                kickoff_epoch_ms=ko_ms,
                analysis=causal_backfill_analysis,
                seal_origin="causal_walkforward_backfill",
                prev_seal_sha256=GENESIS_SEAL_HASH,
            )
            return {
                "matchId": str(match_id),
                "lifecycleStatus": norm_status,
                "hasForecast": True,
                "causalityStatus": "strict_pre_kickoff_sealed",
                "incomingCausalityStatus": inc_status,
                "sealAction": "recovered_ft_from_causal_walkforward",
                "incomingContaminatedRejected": False,
                "sealedRecord": sealed_bf,
            }

    return {
        "matchId": str(match_id),
        "lifecycleStatus": norm_status,
        "hasForecast": False,
        "causalityStatus": "unsealed_missing_forecast",
        "incomingCausalityStatus": inc_status,
        "sealAction": "unsealed_no_valid_inputs",
        "incomingContaminatedRejected": False,
        "sealedRecord": None,
    }


def audit_pre_kickoff_causality_v6(
    observations: Sequence[Mapping[str, Any]],
    allow_pre_kickoff_refresh: bool = False,
) -> dict[str, Any]:
    """Deterministic causality & lifecycle auditor (`auditPreKickoffCausalityV6`).

    Processes chronological snapshot observations `(snapshotId, matchId, sport, league, ...)`
    across `scheduled -> LIVE -> FT`, enforcing `sealPreKickoffOutlookV6` and computing a
    canonical Merkle-like `ledgerSha256` identical in Python and TypeScript.
    """
    sealed_by_key: dict[str, dict[str, Any]] = {}
    latest_outcome_by_key: dict[str, dict[str, Any]] = {}

    n_obs = len(observations)
    raw_strict_pre = 0
    raw_post_ko_contaminated = 0
    raw_post_ko_ft = 0
    raw_post_ko_scheduled = 0
    raw_missing_on_ft = 0
    rescued_from_prior_seal = 0
    recovered_from_causal_backfill = 0
    rejected_unrecoverable_contaminated = 0

    for obs in observations:
        lg = str(obs["league"])
        mid = str(obs["matchId"])
        key = f"{lg}::{mid}"
        existing = sealed_by_key.get(key)
        res = seal_pre_kickoff_outlook_v6(
            match_id=mid,
            sport=str(obs["sport"]),
            league=lg,
            home_team=str(obs["homeTeam"]),
            away_team=str(obs["awayTeam"]),
            kickoff_utc=str(obs["kickoffUtc"]),
            status=str(obs["status"]),
            incoming_analysis=obs.get("incomingAnalysis"),
            existing_sealed_record=existing,
            causal_backfill_analysis=obs.get("causalBackfillAnalysis"),
            allow_pre_kickoff_refresh=allow_pre_kickoff_refresh,
        )

        inc_st = res["incomingCausalityStatus"]
        life_st = res["lifecycleStatus"]
        if inc_st == "strict_pre_kickoff":
            raw_strict_pre += 1
        elif inc_st == "post_kickoff_contaminated":
            raw_post_ko_contaminated += 1
            if life_st == "FT":
                raw_post_ko_ft += 1
            elif life_st == "scheduled":
                raw_post_ko_scheduled += 1
        elif inc_st == "missing_analysis" and life_st == "FT":
            raw_missing_on_ft += 1

        action = res["sealAction"]
        if action in {"rejected_contaminated_preserved_seal", "preserved_seal_on_missing_upstream"}:
            rescued_from_prior_seal += 1
        elif action in {"recovered_ft_from_causal_backforward", "recovered_ft_from_causal_walkforward", "rejected_contaminated_sealed_from_causal_backfill"}:
            recovered_from_causal_backfill += 1
        elif action == "rejected_post_kickoff_contaminated":
            rejected_unrecoverable_contaminated += 1

        if res["sealedRecord"] is not None:
            sealed_by_key[key] = res["sealedRecord"]
        latest_outcome_by_key[key] = res

    sorted_keys = sorted(sealed_by_key.keys())
    chain_pairs = [[k, sealed_by_key[k]["sealSha256"]] for k in sorted_keys]
    ledger_sha256 = sha256_hex(json.dumps(chain_pairs, ensure_ascii=False, separators=(",", ":")))

    ft_total = sum(1 for r in latest_outcome_by_key.values() if r["lifecycleStatus"] == "FT")
    ft_with_forecast = sum(
        1 for r in latest_outcome_by_key.values() if r["lifecycleStatus"] == "FT" and r["hasForecast"]
    )
    contaminated_accepted = sum(
        1
        for r in sealed_by_key.values()
        if int(r["inputsAsOfEpochMs"]) > int(r["kickoffEpochMs"])
    )

    return {
        "totalObservationsAudited": n_obs,
        "uniqueMatchesTracked": len(latest_outcome_by_key),
        "sealedMatchesCount": len(sealed_by_key),
        "rawStrictPreKickoffCount": raw_strict_pre,
        "rawPostKickoffContaminatedCount": raw_post_ko_contaminated,
        "rawPostKickoffFtCount": raw_post_ko_ft,
        "rawPostKickoffScheduledCount": raw_post_ko_scheduled,
        "rawMissingAnalysisOnFtCount": raw_missing_on_ft,
        "rescuedFromPriorSealCount": rescued_from_prior_seal,
        "recoveredFromCausalBackfillCount": recovered_from_causal_backfill,
        "rejectedUnrecoverableContaminatedCount": rejected_unrecoverable_contaminated,
        "finalMatchesTotal": ft_total,
        "finalMatchesWithSealedForecast": ft_with_forecast,
        "contaminatedAcceptedIntoLedgerCount": contaminated_accepted,
        "ledgerSha256": ledger_sha256,
        "outcomesByMatchKey": latest_outcome_by_key,
    }


# ============================================================================
# 4. Module 3 — Prospective Quotes Evaluator with Power De-Vig (`quotes_latest.json`)
# ============================================================================


def solve_power_devig_exact_v6(
    decimal_odds: Sequence[float],
    tolerance: float = 1e-12,
) -> dict[str, Any]:
    """Exact 2-way / 3-way Power De-Vig (`sum((1/o_i)^alpha) = 1`) mirroring `devig.ts::solvePowerCore`."""
    k = len(decimal_odds)
    if k not in (2, 3):
        raise ValueError(f"Power De-Vig requires 2 or 3 selections; received {k}")
    q: list[float] = []
    for i, raw_o in enumerate(decimal_odds):
        o = float(raw_o)
        if not math.isfinite(o) or o <= 1.0:
            raise ValueError(f"Invalid decimal odds at index {i}: {raw_o!r}")
        q.append(1.0 / o)

    sum_implied = sum(q)
    if sum_implied < 0.90 or sum_implied > 1.25:
        raise ValueError(f"Implausible sum of implied probs: {sum_implied:.6f}")

    lo = 1e-6
    hi = 5.0
    alpha = 1.0
    for _ in range(200):
        alpha = 0.5 * (lo + hi)
        s_pow = sum(math.pow(v, alpha) for v in q)
        if abs(s_pow - 1.0) <= tolerance:
            break
        if s_pow > 1.0:
            lo = alpha
        else:
            hi = alpha

    p_raw = [math.pow(v, alpha) for v in q]
    s_tot = sum(p_raw)
    probs = [v / s_tot for v in p_raw]
    return {
        "probsNoVig": probs,
        "overround": sum_implied - 1.0,
        "alphaExponent": alpha,
    }


def _dixon_coles_soccer_probs_v6(
    lam_home: float,
    lam_away: float,
    rho: float = -0.105,
    max_goals: int = 12,
) -> dict[str, float]:
    """Exact Dixon-Coles matrix summary including `pOver05`, `pOver15`, `pOver25`, `pOver35`, `pBttsYes`."""
    lh = clamp(lam_home, 0.08, 8.5)
    la = clamp(lam_away, 0.08, 8.5)
    pmf_h = [0.0] * (max_goals + 1)
    pmf_a = [0.0] * (max_goals + 1)
    pmf_h[0] = math.exp(-lh)
    pmf_a[0] = math.exp(-la)
    for k in range(1, max_goals + 1):
        pmf_h[k] = (pmf_h[k - 1] * lh) / k
        pmf_a[k] = (pmf_a[k - 1] * la) / k
    sh = sum(pmf_h)
    sa = sum(pmf_a)
    pmf_h = [v / sh for v in pmf_h]
    pmf_a = [v / sa for v in pmf_a]

    rho_min = max(-1.0 / max(lh * la, 1e-6) + 0.05, -0.35)
    rho_max = min(1.0 / max(lh, 1e-6) - 0.05, 1.0 / max(la, 1e-6) - 0.05, 0.35)
    rc = clamp(rho, rho_min, rho_max)

    mat = [0.0] * ((max_goals + 1) * (max_goals + 1))
    tot_mass = 0.0
    for i in range(max_goals + 1):
        for j in range(max_goals + 1):
            base = pmf_h[i] * pmf_a[j]
            tau = 1.0
            if i == 0 and j == 0:
                tau = 1.0 - lh * la * rc
            elif i == 0 and j == 1:
                tau = 1.0 + lh * rc
            elif i == 1 and j == 0:
                tau = 1.0 + la * rc
            elif i == 1 and j == 1:
                tau = 1.0 - rc
            val = max(0.0, base * tau)
            mat[i * (max_goals + 1) + j] = val
            tot_mass += val

    p_home = 0.0
    p_draw = 0.0
    p_away = 0.0
    p_o05 = 0.0
    p_o15 = 0.0
    p_o25 = 0.0
    p_o35 = 0.0
    p_btts = 0.0
    for i in range(max_goals + 1):
        for j in range(max_goals + 1):
            pij = mat[i * (max_goals + 1) + j] / tot_mass
            if i > j:
                p_home += pij
            elif i == j:
                p_draw += pij
            else:
                p_away += pij
            if i + j >= 1:
                p_o05 += pij
            if i + j >= 2:
                p_o15 += pij
            if i + j >= 3:
                p_o25 += pij
            if i + j >= 4:
                p_o35 += pij
            if i >= 1 and j >= 1:
                p_btts += pij

    return {
        "pHome": p_home,
        "pDraw": p_draw,
        "pAway": p_away,
        "pOver05": p_o05,
        "pOver15": p_o15,
        "pOver25": p_o25,
        "pOver35": p_o35,
        "pBttsYes": p_btts,
    }


def _canonical_market_descriptor(market: str, line: float | None) -> tuple[str, tuple[str, ...]]:
    mk = (market or "").strip().lower()
    if mk in {"1x2", "h2h", "match_odds"}:
        return "1x2", ("home", "draw", "away")
    if mk in {"btts", "both_teams_to_score"}:
        return "btts", ("yes", "no")
    if mk in {"totals", "ou", "over_under"} or mk.startswith("totals_"):
        ln_val = float(line) if line is not None else float(mk.split("_", 1)[1].replace("_", "."))
        return f"totals_{ln_val:.1f}", ("over", "under")
    if mk in {"moneyline", "2way", "dnb"}:
        return mk, ("home", "away")
    raise ValueError(f"Unsupported quote market: {market!r} (line={line!r})")


def _extract_model_simplex_for_market(
    model_probs: Mapping[str, float],
    market_key: str,
) -> list[float] | None:
    if market_key == "1x2":
        ph, pd, pa = model_probs.get("pHome"), model_probs.get("pDraw"), model_probs.get("pAway")
        if ph is None or pd is None or pa is None:
            return None
        s = float(ph) + float(pd) + float(pa)
        return [float(ph) / s, float(pd) / s, float(pa) / s] if s > 0 else None
    if market_key == "btts":
        py = model_probs.get("pBttsYes")
        if py is None:
            return None
        pyc = clamp(float(py), 1e-6, 1.0 - 1e-6)
        return [pyc, 1.0 - pyc]
    if market_key.startswith("totals_"):
        ln_tag = market_key.split("_", 1)[1].replace(".", "")
        po = model_probs.get(f"pOver{ln_tag}")
        if po is None:
            return None
        poc = clamp(float(po), 1e-6, 1.0 - 1e-6)
        return [poc, 1.0 - poc]
    if market_key in {"moneyline", "2way", "dnb"}:
        ph, pa = model_probs.get("pHome"), model_probs.get("pAway")
        if ph is None or pa is None:
            return None
        s = float(ph) + float(pa)
        return [float(ph) / s, float(pa) / s] if s > 0 else None
    return None


def _grade_complete_market_outcome_idx(
    market_key: str,
    home_score: int,
    away_score: int,
) -> int | None:
    """Returns winning selection index in canonical order (`0..K-1`), or `None` on push/void."""
    if market_key == "1x2":
        if home_score > away_score:
            return 0
        if home_score == away_score:
            return 1
        return 2
    if market_key == "btts":
        return 0 if (home_score > 0 and away_score > 0) else 1
    if market_key.startswith("totals_"):
        ln = float(market_key.split("_", 1)[1])
        tot = home_score + away_score
        if abs(tot - ln) < 1e-9:
            return None
        return 0 if tot > ln else 1
    if market_key in {"moneyline", "2way", "dnb"}:
        if home_score == away_score:
            return None
        return 0 if home_score > away_score else 1
    return None


def evaluate_prospective_quotes_power_devig_v6(
    ticks: Sequence[Mapping[str, Any]],
    engine_pre_kickoff_by_event: Mapping[str, Mapping[str, Any]],
    settled_scores_by_event: Mapping[str, Mapping[str, int]] | None = None,
    n_resamples: int = BOOTSTRAP_RESAMPLES,
    seed: int = BOOTSTRAP_SEED,
) -> dict[str, Any]:
    """Prospective Quotes Evaluator (`evaluateProspectiveQuotesPowerDevigV6`).

    - Enforces `ts_captured < ts_event_start` strictly on every tick.
    - Groups complete same-book markets and applies exact **Power De-Vig**.
    - Computes market-alignment & dispersion metrics with `mulberry32` cluster-bootstrap
      (`1,000` resamples, `seed = 20261111` grouped by `event_id`).
    - Evaluates settled outcomes when verified final scores exist, returning `None` (`null`)
      honestly across all outcome slices when `n_settled == 0`.
    - Contains `0` forbidden betting fields (`stake`, `kelly`, `ev`, `tier`).
    """
    scores_map = settled_scores_by_event or {}
    n_raw_ticks = len(ticks)
    n_post_kickoff_discarded = 0
    n_invalid_ticks = 0

    # Group latest valid pre-kickoff tick per `(event_id, book, market_key, selection)`
    grouped: dict[tuple[str, str, str], dict[str, dict[str, Any]]] = defaultdict(dict)
    group_meta: dict[tuple[str, str, str], dict[str, Any]] = {}

    for t in ticks:
        eid = str(t.get("event_id") or "").strip()
        book = str(t.get("book") or "").strip().lower()
        sel = str(t.get("selection") or "").strip().lower()
        t_cap = parse_iso_utc_epoch_ms(t.get("ts_captured"))
        t_ko = parse_iso_utc_epoch_ms(t.get("ts_event_start"))
        price_raw = t.get("price_decimal")

        if not eid or not book or not sel or t_cap is None or t_ko is None or not isinstance(price_raw, (int, float)):
            n_invalid_ticks += 1
            continue
        if float(price_raw) <= 1.0 or not math.isfinite(float(price_raw)):
            n_invalid_ticks += 1
            continue
        if t_cap >= t_ko:
            n_post_kickoff_discarded += 1
            continue

        try:
            m_key, req_sels = _canonical_market_descriptor(str(t.get("market") or ""), t.get("line"))
        except ValueError:
            n_invalid_ticks += 1
            continue
        if sel not in req_sels:
            n_invalid_ticks += 1
            continue

        g_key = (eid, book, m_key)
        prev = grouped[g_key].get(sel)
        if prev is None or t_cap >= int(prev["ts_captured_ms"]):
            grouped[g_key][sel] = {
                "price_decimal": float(price_raw),
                "ts_captured_ms": t_cap,
                "ts_captured": format_epoch_ms_utc(t_cap),
            }
            group_meta[g_key] = {
                "event_id": eid,
                "sport": str(t.get("sport") or "football"),
                "league": str(t.get("league") or ""),
                "book": book,
                "market_key": m_key,
                "required_selections": req_sels,
                "ts_event_start_ms": t_ko,
            }

    n_valid_prekickoff_ticks = 0
    n_incomplete_discarded_ticks = 0
    evaluated_markets: list[dict[str, Any]] = []

    market_clusters: list[str] = []
    ce_v6_list: list[float] = []
    ce_raw_list: list[float] = []
    kl_v6_list: list[float] = []
    kl_raw_list: list[float] = []
    brier_div_v6_list: list[float] = []
    brier_div_raw_list: list[float] = []

    sel_clusters: list[str] = []
    abs_diff_v6_list: list[float] = []
    abs_diff_raw_list: list[float] = []
    sq_diff_v6_list: list[float] = []
    signed_diff_v6_list: list[float] = []
    playable_clusters: list[str] = []
    playable_abs_diff_v6: list[float] = []
    playable_abs_diff_raw: list[float] = []

    overrounds: list[float] = []
    alphas: list[float] = []
    by_market_acc: dict[str, list[tuple[str, float, float, float]]] = defaultdict(list)
    by_league_acc: dict[str, list[tuple[str, float, float, float]]] = defaultdict(list)

    # Settled accumulators
    settled_clusters: list[str] = []
    settled_ll_v6: list[float] = []
    settled_ll_pow: list[float] = []
    settled_br_v6: list[float] = []
    settled_br_pow: list[float] = []
    settled_bin_y: list[int] = []
    settled_bin_p_v6: list[float] = []
    settled_bin_p_pow: list[float] = []
    settled_events_seen: set[str] = set()

    for g_key in sorted(grouped.keys()):
        sels_map = grouped[g_key]
        meta = group_meta[g_key]
        req_sels = meta["required_selections"]
        if any(s not in sels_map for s in req_sels):
            n_incomplete_discarded_ticks += len(sels_map)
            continue

        odds_vec = [float(sels_map[s]["price_decimal"]) for s in req_sels]
        try:
            pwr = solve_power_devig_exact_v6(odds_vec)
        except ValueError:
            n_incomplete_discarded_ticks += len(sels_map)
            continue

        n_valid_prekickoff_ticks += len(req_sels)
        eid = meta["event_id"]
        m_key = meta["market_key"]
        lg = meta["league"]
        probs_pow: list[float] = pwr["probsNoVig"]
        overrounds.append(float(pwr["overround"]))
        alphas.append(float(pwr["alphaExponent"]))

        eng_entry = engine_pre_kickoff_by_event.get(eid) or {}
        v6_probs_map = eng_entry.get("v6Probs") or eng_entry
        raw_probs_map = eng_entry.get("rawPreKickoffProbs") or v6_probs_map

        p_v6 = _extract_model_simplex_for_market(v6_probs_map, m_key)
        p_raw = _extract_model_simplex_for_market(raw_probs_map, m_key)
        if p_v6 is None:
            continue
        if p_raw is None:
            p_raw = list(p_v6)

        eps = 1e-15
        ce_v6 = -sum(pk * math.log(clamp(qm, eps, 1.0)) for pk, qm in zip(probs_pow, p_v6))
        ce_raw = -sum(pk * math.log(clamp(qr, eps, 1.0)) for pk, qr in zip(probs_pow, p_raw))
        ent_pow = -sum(pk * math.log(clamp(pk, eps, 1.0)) for pk in probs_pow)
        kl_v6 = max(0.0, ce_v6 - ent_pow)
        kl_raw = max(0.0, ce_raw - ent_pow)
        bd_v6 = sum((qm - pk) ** 2 for pk, qm in zip(probs_pow, p_v6))
        bd_raw = sum((qr - pk) ** 2 for pk, qr in zip(probs_pow, p_raw))

        market_clusters.append(eid)
        ce_v6_list.append(ce_v6)
        ce_raw_list.append(ce_raw)
        kl_v6_list.append(kl_v6)
        kl_raw_list.append(kl_raw)
        brier_div_v6_list.append(bd_v6)
        brier_div_raw_list.append(bd_raw)

        mad_mkt_v6 = sum(abs(qm - pk) for pk, qm in zip(probs_pow, p_v6)) / len(probs_pow)
        mad_mkt_raw = sum(abs(qr - pk) for pk, qr in zip(probs_pow, p_raw)) / len(probs_pow)
        by_market_acc[m_key].append((eid, kl_v6, mad_mkt_v6, float(pwr["overround"])))
        by_league_acc[lg].append((eid, kl_v6, mad_mkt_v6, float(pwr["overround"])))

        for o_dec, pk, qm, qr in zip(odds_vec, probs_pow, p_v6, p_raw):
            sel_clusters.append(eid)
            ad_v6 = abs(qm - pk)
            ad_raw = abs(qr - pk)
            abs_diff_v6_list.append(ad_v6)
            abs_diff_raw_list.append(ad_raw)
            sq_diff_v6_list.append((qm - pk) ** 2)
            signed_diff_v6_list.append(qm - pk)
            if 1.55 <= o_dec <= 2.60:
                playable_clusters.append(eid)
                playable_abs_diff_v6.append(ad_v6)
                playable_abs_diff_raw.append(ad_raw)

        sc = scores_map.get(eid)
        win_idx: int | None = None
        if sc is not None and isinstance(sc.get("homeScore"), int) and isinstance(sc.get("awayScore"), int):
            win_idx = _grade_complete_market_outcome_idx(m_key, int(sc["homeScore"]), int(sc["awayScore"]))
            if win_idx is not None:
                settled_events_seen.add(eid)
                settled_clusters.append(eid)
                settled_ll_v6.append(-math.log(clamp(p_v6[win_idx], eps, 1.0)))
                settled_ll_pow.append(-math.log(clamp(probs_pow[win_idx], eps, 1.0)))
                settled_br_v6.append(
                    sum(((1.0 if j == win_idx else 0.0) - p_v6[j]) ** 2 for j in range(len(p_v6)))
                )
                settled_br_pow.append(
                    sum(((1.0 if j == win_idx else 0.0) - probs_pow[j]) ** 2 for j in range(len(probs_pow)))
                )
                for j in range(len(p_v6)):
                    settled_bin_y.append(1 if j == win_idx else 0)
                    settled_bin_p_v6.append(p_v6[j])
                    settled_bin_p_pow.append(probs_pow[j])

        evaluated_markets.append(
            {
                "eventId": eid,
                "league": lg,
                "book": meta["book"],
                "marketKey": m_key,
                "selections": list(req_sels),
                "decimalOdds": odds_vec,
                "powerNoVigProbs": [round(x, 8) for x in probs_pow],
                "modelV6Probs": [round(x, 8) for x in p_v6],
                "overround": round(float(pwr["overround"]), 8),
                "powerAlpha": round(float(pwr["alphaExponent"]), 8),
                "klDivergencePowerToModel": round(kl_v6, 8),
                "madProbDispersion": round(mad_mkt_v6, 8),
                "madRawPreKickoff": round(mad_mkt_raw, 8),
                "settledWinnerIdx": win_idx,
            }
        )

    # Aggregate pre-kickoff dispersion & alignment with cluster-bootstrap mulberry32
    ce_diff_boot = cluster_bootstrap_diff_pure(market_clusters, ce_v6_list, ce_raw_list, n_resamples, seed)
    kl_diff_boot = cluster_bootstrap_diff_pure(market_clusters, kl_v6_list, kl_raw_list, n_resamples, seed)
    bd_diff_boot = cluster_bootstrap_diff_pure(
        market_clusters, brier_div_v6_list, brier_div_raw_list, n_resamples, seed
    )
    mad_boot = cluster_bootstrap_mean_pure(sel_clusters, abs_diff_v6_list, n_resamples, seed)
    mad_diff_boot = cluster_bootstrap_diff_pure(
        sel_clusters, abs_diff_v6_list, abs_diff_raw_list, n_resamples, seed
    )
    playable_mad_diff_boot = cluster_bootstrap_diff_pure(
        playable_clusters, playable_abs_diff_v6, playable_abs_diff_raw, n_resamples, seed
    )

    rmse_disp = math.sqrt(sum(sq_diff_v6_list) / len(sq_diff_v6_list)) if sq_diff_v6_list else None
    mean_signed_diff = (sum(signed_diff_v6_list) / len(signed_diff_v6_list)) if signed_diff_v6_list else None
    mean_overround = (sum(overrounds) / len(overrounds)) if overrounds else None
    mean_alpha = (sum(alphas) / len(alphas)) if alphas else None

    by_market_summary: dict[str, Any] = {}
    for mk_k, rows_m in sorted(by_market_acc.items()):
        n_m = len(rows_m)
        by_market_summary[mk_k] = {
            "n_markets": n_m,
            "mean_kl_power_to_v6": round(sum(r[1] for r in rows_m) / n_m, 8),
            "mean_mad_prob_dispersion": round(sum(r[2] for r in rows_m) / n_m, 8),
            "mean_overround": round(sum(r[3] for r in rows_m) / n_m, 8),
        }

    by_league_summary: dict[str, Any] = {}
    for lg_k, rows_l in sorted(by_league_acc.items()):
        n_l = len(rows_l)
        by_league_summary[lg_k] = {
            "n_markets": n_l,
            "mean_kl_power_to_v6": round(sum(r[1] for r in rows_l) / n_l, 8),
            "mean_mad_prob_dispersion": round(sum(r[2] for r in rows_l) / n_l, 8),
            "mean_overround": round(sum(r[3] for r in rows_l) / n_l, 8),
        }

    # Settled outcome calibration (`null` on `n == 0`!)
    n_settled_mkts = len(settled_ll_v6)
    if n_settled_mkts == 0:
        settled_eval: dict[str, Any] = {
            "n_settled_events": 0,
            "n_settled_markets": 0,
            "logloss_v6": None,
            "logloss_power_novig": None,
            "delta_logloss_v6_minus_power": None,
            "ci95_lo": None,
            "ci95_hi": None,
            "brier_v6": None,
            "brier_power_novig": None,
            "delta_brier_v6_minus_power": None,
            "ece_v6": None,
            "ece_power_novig": None,
            "significant_improvement": False,
            "significance_label": "no significativa",
            "bootstrap_method": "cluster_mulberry32",
            "n_resamples": int(n_resamples),
            "seed": int(seed),
        }
    else:
        ll_boot = cluster_bootstrap_diff_pure(settled_clusters, settled_ll_v6, settled_ll_pow, n_resamples, seed)
        br_boot = cluster_bootstrap_diff_pure(settled_clusters, settled_br_v6, settled_br_pow, n_resamples, seed)
        settled_eval = {
            "n_settled_events": len(settled_events_seen),
            "n_settled_markets": n_settled_mkts,
            "logloss_v6": ll_boot["cand_mean"],
            "logloss_power_novig": ll_boot["bench_mean"],
            "delta_logloss_v6_minus_power": ll_boot["delta_mean"],
            "ci95_lo": ll_boot["ci95_lo"],
            "ci95_hi": ll_boot["ci95_hi"],
            "brier_v6": br_boot["cand_mean"],
            "brier_power_novig": br_boot["bench_mean"],
            "delta_brier_v6_minus_power": br_boot["delta_mean"],
            "ece_v6": safe_ece_binary_pure(settled_bin_y, settled_bin_p_v6),
            "ece_power_novig": safe_ece_binary_pure(settled_bin_y, settled_bin_p_pow),
            "significant_improvement": ll_boot["significant_improvement"],
            "significance_label": ll_boot["significance_label"],
            "bootstrap_method": "cluster_mulberry32",
            "n_resamples": int(n_resamples),
            "seed": int(seed),
        }

    return {
        "n_raw_ticks": n_raw_ticks,
        "n_valid_prekickoff_ticks": n_valid_prekickoff_ticks,
        "n_post_kickoff_discarded_ticks": n_post_kickoff_discarded,
        "n_incomplete_or_invalid_ticks": n_invalid_ticks + n_incomplete_discarded_ticks,
        "n_complete_markets": len(evaluated_markets),
        "n_unique_events": len({m["eventId"] for m in evaluated_markets}),
        "devig_method": "power",
        "mean_overround": round(mean_overround, 8) if mean_overround is not None else None,
        "mean_power_alpha": round(mean_alpha, 8) if mean_alpha is not None else None,
        "prekickoff_dispersion_and_alignment": {
            "mad_prob_dispersion_v6": mad_boot,
            "rmse_prob_dispersion_v6": round(rmse_disp, 8) if rmse_disp is not None else None,
            "mean_signed_prob_diff_v6_minus_power": round(mean_signed_diff, 8) if mean_signed_diff is not None else None,
            "cross_entropy_v6_vs_raw_prekickoff": ce_diff_boot,
            "kl_divergence_v6_vs_raw_prekickoff": kl_diff_boot,
            "brier_divergence_v6_vs_raw_prekickoff": bd_diff_boot,
            "mad_dispersion_v6_vs_raw_prekickoff": mad_diff_boot,
            "playable_zone_1_55_to_2_60_mad_v6_vs_raw": playable_mad_diff_boot,
        },
        "settled_outcome_calibration": settled_eval,
        "by_market": by_market_summary,
        "by_league": by_league_summary,
        "evaluated_markets": evaluated_markets,
    }


# ============================================================================
# 5. Live Snapshot Extraction, Causal US Backfill & Full EXP_V61 Pipeline
# ============================================================================


def _norm_team_slug(raw: Any) -> str:
    if isinstance(raw, dict):
        raw = raw.get("id") or raw.get("name") or ""
    s = str(raw or "").strip().lower()
    if "." in s:
        s = s.split(".", 1)[1]
    return re.sub(r"[^a-z0-9_-]+", "", s)


def _extract_analysis_summary_for_seal(
    sport: str,
    adict: Mapping[str, Any],
) -> dict[str, Any] | None:
    iao = adict.get("inputsAsOf")
    if not iao:
        return None
    x12 = adict.get("x12")
    proj = adict.get("projection") or {}
    probs: dict[str, float | None] = {}
    if isinstance(x12, list) and len(x12) >= 2:
        if len(x12) == 3:
            probs["pHome"] = float(x12[0])
            probs["pDraw"] = float(x12[1]) if sport == "football" else None
            probs["pAway"] = float(x12[2])
        else:
            probs["pHome"] = float(x12[0])
            probs["pDraw"] = None
            probs["pAway"] = float(x12[1])

    for pobj in adict.get("probabilities") or []:
        if not isinstance(pobj, dict):
            continue
        mk = str(pobj.get("market") or "").lower()
        sel = str(pobj.get("selection") or "").lower()
        pv = pobj.get("p")
        if not isinstance(pv, (int, float)):
            continue
        if mk in {"totals", "totals_2_5"} and ("2.5" in sel or pobj.get("line") == 2.5) and ("más" in sel or "over" in sel):
            probs["pOver25"] = float(pv)
        elif mk == "totals" and ("1.5" in sel or pobj.get("line") == 1.5) and ("más" in sel or "over" in sel):
            probs["pOver15"] = float(pv)
        elif mk == "totals" and ("3.5" in sel or pobj.get("line") == 3.5) and ("más" in sel or "over" in sel):
            probs["pOver35"] = float(pv)
        elif mk == "btts" and ("sí" in sel or "si" in sel or sel == "yes"):
            probs["pBttsYes"] = float(pv)

    proj_out: dict[str, float | None] = {}
    for pk in ("home", "away", "total", "margin"):
        val = proj.get(pk)
        if isinstance(val, (int, float)):
            proj_out[pk] = float(val)

    return {
        "inputsAsOfUtc": str(iao),
        "probabilities": probs,
        "projection": proj_out,
    }


def _build_causal_us_walkforward_backfill(
    pitch_data_dir: Path,
    v52_artifact: Mapping[str, Any],
) -> tuple[dict[tuple[str, str], dict[str, Any]], dict[str, Any]]:
    """Reconstructs strict causal (`date' < date`) pre-kickoff projections for NBA (`5 FT`) and NHL (`14 FT`)
    games whose upstream live snapshot dropped `analyses[gameId]` upon reaching `FT`.
    """
    snaps_dir = pitch_data_dir / "snapshots"
    us_priors = v52_artifact["us_multisport_walkforward"]
    backfill_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    eval_stats: dict[str, Any] = {}

    for lg in ("nba", "nhl"):
        cfg = us_priors[lg]
        srf = snaps_dir / lg / "season-results.json"
        latf = snaps_dir / lg / "latest.json"
        if not srf.exists() or not latf.exists():
            continue

        sr = json.loads(srf.read_text(encoding="utf-8"))
        raw_matches = sr.get("matches") or sr.get("games") or []
        hist: list[dict[str, Any]] = []
        for m in raw_matches:
            dt = str(m.get("date") or (m.get("startTime") or "")[:10]).strip()
            ht = _norm_team_slug(m.get("homeTeam"))
            at = _norm_team_slug(m.get("awayTeam"))
            hs, as_ = m.get("homeScore"), m.get("awayScore")
            if dt and ht and at and isinstance(hs, int) and isinstance(as_, int):
                hist.append({"date": dt, "home": ht, "away": at, "hs": hs, "as": as_})
        hist.sort(key=lambda r: r["date"])

        lat = json.loads(latf.read_text(encoding="utf-8"))
        ft_games = [g for g in (lat.get("games") or []) if isinstance(g, dict) and g.get("status") == "final"]

        ll_v6: list[float] = []
        ll_coin: list[float] = []
        clusters: list[str] = []

        for g in ft_games:
            gid = str(g["id"])
            ko = str(g.get("startTime") or "")
            ko_ms = parse_iso_utc_epoch_ms(ko)
            if ko_ms is None:
                continue
            ko_date = format_epoch_ms_utc(ko_ms)[:10]
            h_slug = _norm_team_slug(g.get("home") or g.get("homeTeam"))
            a_slug = _norm_team_slug(g.get("away") or g.get("awayTeam"))

            # Strictly causal state from `m["date"] < ko_date` ONLY (`date' < date`)
            elo: dict[str, float] = defaultdict(lambda: 1500.0)
            cum_for: dict[str, float] = defaultdict(float)
            cum_ag: dict[str, float] = defaultdict(float)
            games_n: dict[str, int] = defaultdict(int)
            team_dates: dict[str, list[str]] = defaultdict(list)
            tot_pts_sum = 0.0
            tot_n = 0

            for m in hist:
                if m["date"] >= ko_date:
                    break
                hm, am = m["home"], m["away"]
                eh = elo[hm] + float(cfg["elo_home_adv"])
                ea = elo[am]
                exp_h = 1.0 / (1.0 + math.pow(10.0, (ea - eh) / 400.0))
                act_h = 1.0 if m["hs"] > m["as"] else (0.5 if m["hs"] == m["as"] else 0.0)
                elo[hm] += float(cfg["elo_k"]) * (act_h - exp_h)
                elo[am] -= float(cfg["elo_k"]) * (act_h - exp_h)
                cum_for[hm] += m["hs"]
                cum_ag[hm] += m["as"]
                games_n[hm] += 1
                cum_for[am] += m["as"]
                cum_ag[am] += m["hs"]
                games_n[am] += 1
                team_dates[hm].append(m["date"])
                team_dates[am].append(m["date"])
                tot_pts_sum += 0.5 * (m["hs"] + m["as"])
                tot_n += 1

            ko_dt_obj = dt_mod.date.fromisoformat(ko_date)
            d_m1 = (ko_dt_obj - dt_mod.timedelta(days=1)).isoformat()
            d_m3 = (ko_dt_obj - dt_mod.timedelta(days=3)).isoformat()
            h_b2b = d_m1 in team_dates[h_slug]
            a_b2b = d_m1 in team_dates[a_slug]
            h_3in4 = sum(1 for d in set(team_dates[h_slug]) if d_m3 <= d < ko_date) >= 2
            a_3in4 = sum(1 for d in set(team_dates[a_slug]) if d_m3 <= d < ko_date) >= 2

            p_runs = float(cfg["prior_team_runs"])
            kappa = float(cfg["prior_games"])
            env = max(0.5, (tot_pts_sum + kappa * p_runs) / (tot_n + kappa))

            nh = games_n[h_slug]
            na = games_n[a_slug]
            h_off = (cum_for[h_slug] + kappa * env) / (nh + kappa)
            h_def = (cum_ag[h_slug] + kappa * env) / (nh + kappa)
            a_off = (cum_for[a_slug] + kappa * env) / (na + kappa)
            a_def = (cum_ag[a_slug] + kappa * env) / (na + kappa)

            base_total = ((h_off * a_def) / env) + ((a_off * h_def) / env)
            pen_h = (float(cfg["b2b_penalty_pts"]) if h_b2b else 0.0) + (
                float(cfg["three_in_four_penalty_pts"]) if h_3in4 else 0.0
            )
            pen_a = (float(cfg["b2b_penalty_pts"]) if a_b2b else 0.0) + (
                float(cfg["three_in_four_penalty_pts"]) if a_3in4 else 0.0
            )
            exp_total = max(0.5, base_total - 0.5 * (pen_h + pen_a))

            neutral_site = bool(g.get("neutralSite"))
            elo_diff = (elo[h_slug] - elo[a_slug]) + (0.0 if neutral_site else float(cfg["elo_home_adv"]))
            elo_p_home = 1.0 / (1.0 + math.pow(10.0, -elo_diff / 400.0))

            rate_margin = (
                ((h_off * a_def) / env)
                - ((a_off * h_def) / env)
                + (0.0 if neutral_site else float(cfg["home_adv_pts"]))
                - (pen_h - pen_a)
            )
            elo_margin = elo_diff * float(cfg["elo_to_margin_scale"])
            exp_margin = 0.55 * elo_margin + 0.45 * rate_margin

            mu_h = max(0.2, 0.5 * (exp_total + exp_margin))
            mu_a = max(0.2, 0.5 * (exp_total - exp_margin))

            p_margin = normal_cdf(exp_margin / float(cfg["sigma_margin"]))
            p_home_win = clamp(0.60 * elo_p_home + 0.40 * p_margin, 0.02, 0.98)
            p_away_win = 1.0 - p_home_win
            p_over = clamp(
                1.0 - normal_cdf((float(cfg["canonical_total_line"]) - exp_total) / float(cfg["sigma_total"])),
                0.02,
                0.98,
            )

            # Pin causal `inputsAsOfUtc` strictly to end of `(ko_date - 1 day)` (`<= kickoffUtc`)
            iao_ms = min(ko_ms - 60_000, parse_iso_utc_epoch_ms(f"{d_m1}T23:59:59.000Z") or (ko_ms - 60_000))
            backfill_by_key[(lg, gid)] = {
                "inputsAsOfUtc": format_epoch_ms_utc(iao_ms),
                "probabilities": {
                    "pHome": p_home_win,
                    "pDraw": None,
                    "pAway": p_away_win,
                    "pOverCanonical": p_over,
                },
                "projection": {
                    "home": mu_h,
                    "away": mu_a,
                    "total": exp_total,
                    "margin": exp_margin,
                },
            }

            res_obj = g.get("result") or {}
            if isinstance(res_obj.get("home"), int) and isinstance(res_obj.get("away"), int):
                if int(res_obj["home"]) != int(res_obj["away"]):
                    y_h = 1 if int(res_obj["home"]) > int(res_obj["away"]) else 0
                    p_pick = p_home_win if y_h == 1 else p_away_win
                    ll_v6.append(-math.log(clamp(p_pick, 1e-15, 1.0)))
                    ll_coin.append(math.log(2.0))
                    clusters.append(ko_date)

        eval_stats[lg] = {
            "ft_recovered_count": len(ft_games),
            "prior_history_games_available": len(hist),
            "oos_settled_eval_vs_coin": cluster_bootstrap_diff_pure(clusters, ll_v6, ll_coin),
        }

    return backfill_by_key, eval_stats


def _recalibrate_football_for_quotes_v6(
    raw_proj_home: float,
    raw_proj_away: float,
    raw_x12: Sequence[float],
    league_slug: str,
    v52_artifact: Mapping[str, Any],
) -> dict[str, float]:
    """Applies `v5.2`/`v6.0` dynamic scoring environment & Dixon-Coles calibration for pre-kickoff quotes."""
    fcfg = v52_artifact["football_calibration"]
    env_entry = v52_artifact["league_scoring_environments_2026"].get(league_slug)
    league_env_goals = float(env_entry["shrunk_env_goals"]) if env_entry else float(fcfg["global_goal_prior"])
    is_expansion = league_slug not in SPACETIME_CORE_LEAGUES

    raw_tot = max(0.35, float(raw_proj_home) + float(raw_proj_away))
    env_ratio = clamp(
        league_env_goals / max(raw_tot, 0.35),
        float(fcfg["min_goal_env_scale"]),
        float(fcfg["max_goal_env_scale"]),
    )
    w_env = float(fcfg["projection_env_blend_weight"])
    scale = (1.0 - w_env) + w_env * env_ratio
    lam_h = clamp(float(raw_proj_home) * scale, 0.12, 5.5)
    lam_a = clamp(float(raw_proj_away) * scale, 0.12, 5.5)

    dc = _dixon_coles_soccer_probs_v6(lam_h, lam_a, float(fcfg["dc_rho"]), 12)
    tau = float(fcfg["tau_logit_expansion"] if is_expansion else fcfg["tau_logit_core"])
    s_raw = max(1e-9, float(raw_x12[0]) + float(raw_x12[1]) + float(raw_x12[2]))
    r0 = clamp(float(raw_x12[0]) / s_raw, 1e-4, 0.999)
    r1 = clamp(float(raw_x12[1]) / s_raw, 1e-4, 0.999)
    r2 = clamp(float(raw_x12[2]) / s_raw, 1e-4, 0.999)

    z0, z1, z2 = math.log(r0) / tau, math.log(r1) / tau, math.log(r2) / tau
    mz = max(z0, z1, z2)
    e0, e1, e2 = math.exp(z0 - mz), math.exp(z1 - mz), math.exp(z2 - mz)
    se = e0 + e1 + e2
    t0, t1, t2 = e0 / se, e1 / se, e2 / se

    w_dc = float(fcfg["x12_dc_consistency_weight"])
    p_h = (1.0 - w_dc) * t0 + w_dc * dc["pHome"]
    p_d = (1.0 - w_dc) * t1 + w_dc * dc["pDraw"]
    p_a = (1.0 - w_dc) * t2 + w_dc * dc["pAway"]
    sp = p_h + p_d + p_a

    tau_bin = float(fcfg["playable_binary_tau_expansion"] if is_expansion else fcfg["playable_binary_tau_core"])

    def _comp_bin(p_val: float) -> float:
        pc = clamp(p_val, 1e-4, 1.0 - 1e-4)
        fo = 1.0 / pc
        if 1.50 <= fo <= 2.70:
            return sigmoid(logit(pc) / tau_bin)
        return pc

    return {
        "pHome": p_h / sp,
        "pDraw": p_d / sp,
        "pAway": p_a / sp,
        "pOver05": _comp_bin(dc["pOver05"]),
        "pOver15": _comp_bin(dc["pOver15"]),
        "pOver25": _comp_bin(dc["pOver25"]),
        "pOver35": _comp_bin(dc["pOver35"]),
        "pBttsYes": _comp_bin(dc["pBttsYes"]),
    }


def _assert_zero_forbidden_keys(obj: Any, path_prefix: str = "$") -> None:
    if isinstance(obj, Mapping):
        for k, v in obj.items():
            if str(k) in FORBIDDEN_PUBLIC_KEYS:
                raise AssertionError(f"Forbidden key {k!r} detected at {path_prefix}.{k}")
            _assert_zero_forbidden_keys(v, f"{path_prefix}.{k}")
    elif isinstance(obj, (list, tuple)):
        for idx, item in enumerate(obj):
            _assert_zero_forbidden_keys(item, f"{path_prefix}[{idx}]")


def run_exp_v61(pitch_data_dir: Path = DEFAULT_PITCH_DATA) -> dict[str, Any]:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    snaps_dir = pitch_data_dir / "snapshots"
    quotes_path = pitch_data_dir / "odds_timeseries" / "quotes_latest.json"

    v51_priors_obj = json.loads(OFFICIAL_PRIORS_V51_PATH.read_text(encoding="utf-8"))
    v51_officials: dict[str, Any] = v51_priors_obj["officials"]
    v52_artifact = json.loads(LIVE_FEEDBACK_V52_PATH.read_text(encoding="utf-8"))

    # ------------------------------------------------------------------
    # PART 1: Global Referee Registry (`839` v5.1 + `586` live across 57 leagues)
    # ------------------------------------------------------------------
    comp_priors = build_competition_disciplinary_priors_v6()
    league_dirs = sorted(d for d in snaps_dir.iterdir() if d.is_dir())

    live_assignments: list[dict[str, Any]] = []
    seen_live_game: set[tuple[str, str]] = set()
    alias_to_v51: dict[str, str] = {}

    for ldir in league_dirs:
        lname = ldir.name
        files = ([ldir / "latest.json"] if (ldir / "latest.json").exists() else []) + sorted(ldir.glob("2026-*.json"))
        for jf in files:
            obj = json.loads(jf.read_text(encoding="utf-8"))
            for g in obj.get("games") or []:
                gid = g.get("id")
                ref = g.get("referee")
                if gid and ref and (lname, str(gid)) not in seen_live_game:
                    seen_live_game.add((lname, str(gid)))
                    live_assignments.append(
                        {
                            "league": lname,
                            "gameId": str(gid),
                            "refereeRaw": str(ref).strip(),
                            "snapshotFile": jf.name,
                        }
                    )

    # Pre-populate deterministic scoped aliases for all live assignments that resolve via alias rules
    resolution_method_counts: Counter[str] = Counter()
    for la in live_assignments:
        lg = la["league"]
        r_raw = la["refereeRaw"]
        if lg in NON_SOCCER_US_LEAGUES:
            resolution_method_counts["non_soccer_umpire"] += 1
            continue
        norm = normalize_referee_name_v6(r_raw)
        v51_k, method = _resolve_v51_key_for_referee(r_raw, lg, v51_officials)
        resolution_method_counts[method] += 1
        if v51_k is not None and norm["canonicalKey"] and v51_k != norm["canonicalKey"]:
            alias_to_v51[f"{lg}::{norm['canonicalKey']}"] = v51_k

    # Build temporary model dict to evaluate every live assignment & export global registry
    base_model_payload: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION_MODEL,
        "codename": "PitchLab Global Officials, Pre-Kickoff Freeze & Power Quotes Evaluator v6.0",
        "version": "6.0.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "holdout_window_protected": [HOLDOUT_START_DATE, HOLDOUT_END_DATE],
        "holdout_sealed_untouched": True,
        "booking_points_gamma_red": BOOKING_POINTS_GAMMA_RED,
        "booking_points_lines": list(BOOKING_POINTS_LINES),
        "r_dispersion_yellow": DEFAULT_R_YELLOW,
        "r_dispersion_red": DEFAULT_R_RED,
        "confederation_priors": CONFEDERATION_HIERARCHICAL_PRIORS,
        "competition_priors": comp_priors,
        "alias_to_v5_1_key": dict(sorted(alias_to_v51.items())),
        "v5_1_officials": v51_officials,
    }

    provenance_counts: Counter[str] = Counter()
    confed_assignment_counts: Counter[str] = Counter()
    global_soccer_officials_registry: dict[str, dict[str, Any]] = {}

    # Seed all 839 v5.1 empirical officials into global registry
    DIV_TO_DEFAULT_COMP = {
        "E0": "premier-league",
        "E1": "championship",
        "SP1": "laliga",
        "SP2": "segunda-espana",
        "I1": "serie-a",
        "I2": "serie-b",
        "D1": "bundesliga",
        "D2": "bundesliga-2",
        "F1": "ligue-1",
        "F2": "ligue-2",
        "N1": "eredivisie",
        "B1": "pro-league-belgica",
        "P1": "liga-portugal",
        "T1": "super-lig",
        "G1": "europa-league",
        "SC0": "europa-league",
        "SC1": "conference-league",
    }
    for v51_k, v51_ent in sorted(v51_officials.items()):
        def_comp = DIV_TO_DEFAULT_COMP.get(str(v51_ent.get("last_div") or ""), "premier-league")
        res_p = resolve_official_prior_v6(v51_k, def_comp, base_model_payload)
        global_soccer_officials_registry[v51_k] = {
            "canonical_key": v51_k,
            "primary_league": def_comp,
            "confederation": res_p["confederation"],
            "provenance": "empirical_tm_verified",
            "historical_games": int(v51_ent["games_yellow"]),
            "cards_per_foul_mult": round(float(res_p["cardsPerFoulMult"]), 6),
            "yellow_rate_prior": round(float(res_p["yellowRatePrior"]), 6),
            "red_card_rate_prior": round(float(res_p["redCardRatePrior"]), 6),
            "booking_points_expected": round(float(res_p["bookingPointsExpected"]), 6),
        }

    resolved_live_assignments: list[dict[str, Any]] = []
    for la in live_assignments:
        res_p = resolve_official_prior_v6(la["refereeRaw"], la["league"], base_model_payload)
        provenance_counts[str(res_p["provenance"])] += 1
        confed_assignment_counts[str(res_p["confederation"])] += 1
        resolved_live_assignments.append(res_p)

        if res_p["sport"] == "football":
            reg_key = str(res_p["matchedV51Key"] or res_p["canonicalKey"])
            if reg_key not in global_soccer_officials_registry:
                global_soccer_officials_registry[reg_key] = {
                    "canonical_key": reg_key,
                    "primary_league": la["league"],
                    "confederation": res_p["confederation"],
                    "provenance": "confederation_hierarchical_prior",
                    "historical_games": 0,
                    "cards_per_foul_mult": round(float(res_p["cardsPerFoulMult"]), 6),
                    "yellow_rate_prior": round(float(res_p["yellowRatePrior"]), 6),
                    "red_card_rate_prior": round(float(res_p["redCardRatePrior"]), 6),
                    "booking_points_expected": round(float(res_p["bookingPointsExpected"]), 6),
                }

    base_model_payload["global_officials_summary"] = {
        "v5_1_empirical_officials": len(v51_officials),
        "live_assignments_audited": len(live_assignments),
        "live_soccer_assignments": sum(1 for x in resolved_live_assignments if x["sport"] == "football"),
        "live_non_soccer_assignments": sum(1 for x in resolved_live_assignments if x["sport"] != "football"),
        "total_unified_soccer_officials": len(global_soccer_officials_registry),
        "live_provenance_counts": dict(sorted(provenance_counts.items())),
        "live_confederation_counts": dict(sorted(confed_assignment_counts.items())),
    }

    # ------------------------------------------------------------------
    # PART 2: Pre-Kickoff Causality Audit (`2026-11-09..2026-11-19` + `latest.json`)
    # ------------------------------------------------------------------
    us_backfills, us_backfill_stats = _build_causal_us_walkforward_backfill(pitch_data_dir, v52_artifact)

    all_observations: list[dict[str, Any]] = []
    snapshot_files_count = 0
    dated_filenames_seen: set[str] = set()
    latest_raw_ft_contaminated_by_league: Counter[str] = Counter()
    latest_raw_sched_contaminated_by_league: Counter[str] = Counter()
    latest_us_ft_forecast_before: dict[str, dict[str, int]] = {}
    latest_us_ft_forecast_after: dict[str, dict[str, int]] = {}

    # Also build sealed lookup for `quotes_latest.json` events from pre-kickoff dated snapshots
    sealed_dated_analyses_by_game: dict[tuple[str, str], dict[str, Any]] = {}
    verified_final_scores_by_game: dict[tuple[str, str], dict[str, int]] = {}

    for ldir in league_dirs:
        lname = ldir.name
        sport = NON_SOCCER_US_LEAGUES.get(lname, "football")
        dated_files = sorted(ldir.glob("2026-*.json"))
        for df in dated_files:
            dated_filenames_seen.add(df.name)
        lf = ldir / "latest.json"
        snap_seq = dated_files + ([lf] if lf.exists() else [])

        for jf in snap_seq:
            snapshot_files_count += 1
            obj = json.loads(jf.read_text(encoding="utf-8"))
            is_latest = jf.name == "latest.json"
            amap = obj.get("analyses") or {}
            if isinstance(amap, list):
                amap = {a.get("game"): a for a in amap if isinstance(a, dict) and a.get("game")}

            for g in obj.get("games") or []:
                if not isinstance(g, dict) or not g.get("id"):
                    continue
                gid = str(g["id"])
                ko_str = str(g.get("startTime") or "")
                st_str = str(g.get("status") or "scheduled")
                ht = _norm_team_slug(g.get("home") or g.get("homeTeam")) or "home"
                at = _norm_team_slug(g.get("away") or g.get("awayTeam")) or "away"

                res_g = g.get("result")
                if normalize_lifecycle_status_v6(st_str) == "FT" and isinstance(res_g, dict):
                    if isinstance(res_g.get("home"), int) and isinstance(res_g.get("away"), int):
                        verified_final_scores_by_game[(lname, gid)] = {
                            "homeScore": int(res_g["home"]),
                            "awayScore": int(res_g["away"]),
                        }

                raw_a = amap.get(gid)
                inc_a = _extract_analysis_summary_for_seal(sport, raw_a) if isinstance(raw_a, dict) else None

                # Record earliest valid pre-kickoff full raw analysis for quotes matching
                if inc_a is not None and isinstance(raw_a, dict):
                    iao_ms = parse_iso_utc_epoch_ms(inc_a["inputsAsOfUtc"])
                    ko_ms = parse_iso_utc_epoch_ms(ko_str)
                    if iao_ms is not None and ko_ms is not None and iao_ms <= ko_ms:
                        if (lname, gid) not in sealed_dated_analyses_by_game:
                            sealed_dated_analyses_by_game[(lname, gid)] = {
                                "game": g,
                                "analysis": raw_a,
                                "snapshot": jf.name,
                            }
                    elif is_latest and iao_ms is not None and ko_ms is not None and iao_ms > ko_ms:
                        if normalize_lifecycle_status_v6(st_str) == "FT":
                            latest_raw_ft_contaminated_by_league[lname] += 1
                        else:
                            latest_raw_sched_contaminated_by_league[lname] += 1

                all_observations.append(
                    {
                        "snapshotFile": f"{lname}/{jf.name}",
                        "matchId": gid,
                        "sport": sport,
                        "league": lname,
                        "homeTeam": ht,
                        "awayTeam": at,
                        "kickoffUtc": ko_str,
                        "status": st_str,
                        "incomingAnalysis": inc_a,
                        "causalBackfillAnalysis": us_backfills.get((lname, gid)),
                    }
                )

        if lname in ("nba", "nhl", "mlb", "nfl") and lf.exists():
            lat_obj = json.loads(lf.read_text(encoding="utf-8"))
            lat_a = lat_obj.get("analyses") or {}
            if isinstance(lat_a, list):
                lat_a = {a.get("game"): a for a in lat_a if isinstance(a, dict) and a.get("game")}
            ft_g = [g for g in (lat_obj.get("games") or []) if isinstance(g, dict) and g.get("status") == "final"]
            ft_valid_before = 0
            for fg in ft_g:
                fa = lat_a.get(fg["id"])
                if isinstance(fa, dict):
                    t_i = parse_iso_utc_epoch_ms(fa.get("inputsAsOf"))
                    t_k = parse_iso_utc_epoch_ms(fg.get("startTime"))
                    if t_i is not None and t_k is not None and t_i <= t_k:
                        ft_valid_before += 1
            latest_us_ft_forecast_before[lname] = {
                "ft_total": len(ft_g),
                "ft_with_valid_prekickoff_forecast": ft_valid_before,
            }

    causality_audit = audit_pre_kickoff_causality_v6(all_observations, allow_pre_kickoff_refresh=False)

    for lname in ("nba", "nhl", "mlb", "nfl"):
        lf = snaps_dir / lname / "latest.json"
        if not lf.exists():
            continue
        lat_obj = json.loads(lf.read_text(encoding="utf-8"))
        ft_g = [g for g in (lat_obj.get("games") or []) if isinstance(g, dict) and g.get("status") == "final"]
        ft_after = sum(
            1
            for fg in ft_g
            if causality_audit["outcomesByMatchKey"].get(f"{lname}::{fg['id']}", {}).get("hasForecast") is True
        )
        latest_us_ft_forecast_after[lname] = {
            "ft_total": len(ft_g),
            "ft_with_valid_prekickoff_forecast": ft_after,
        }

    # ------------------------------------------------------------------
    # PART 3: Prospective Quotes Evaluator (`quotes_latest.json`, `128` ticks)
    # ------------------------------------------------------------------
    quotes_obj = json.loads(quotes_path.read_text(encoding="utf-8"))
    quote_ticks: list[dict[str, Any]] = quotes_obj.get("ticks") or []

    DIV_TO_SNAP_LEAGUE = {
        "D1": "bundesliga",
        "E0": "premier-league",
        "F1": "ligue-1",
        "I1": "serie-a",
        "MEX": "liga-mx",
        "SP1": "laliga",
    }

    engine_pre_by_event: dict[str, dict[str, Any]] = {}
    settled_scores_by_event: dict[str, dict[str, int]] = {}
    unique_quote_eids = sorted({str(t["event_id"]) for t in quote_ticks if t.get("event_id")})

    for eid in unique_quote_eids:
        parts = eid.split(":")
        div_code, _dt_raw, h_raw, a_raw = parts[2], parts[3], parts[4], parts[5]
        lg_slug = DIV_TO_SNAP_LEAGUE[div_code]
        h_tok = h_raw.replace("_", "-")
        a_tok = a_raw.replace("_", "-")

        matched_bundle = None
        matched_gid = None
        for (slg, sgid), bnd in sealed_dated_analyses_by_game.items():
            if slg != lg_slug:
                continue
            if h_tok in sgid and a_tok in sgid:
                matched_bundle = bnd
                matched_gid = sgid
                break
            if h_tok.split("-")[0] in sgid and a_tok.split("-")[0] in sgid:
                matched_bundle = bnd
                matched_gid = sgid

        if matched_bundle is not None and matched_gid is not None:
            raw_a = matched_bundle["analysis"]
            proj = raw_a.get("projection") or {}
            x12 = raw_a.get("x12") or [0.45, 0.27, 0.28]
            ph_raw = float(proj.get("home", 1.40))
            pa_raw = float(proj.get("away", 1.15))

            raw_dc = _dixon_coles_soccer_probs_v6(ph_raw, pa_raw, -0.105, 12)
            raw_probs = {
                "pHome": float(x12[0]),
                "pDraw": float(x12[1]),
                "pAway": float(x12[2]),
                "pOver05": raw_dc["pOver05"],
                "pOver15": raw_dc["pOver15"],
                "pOver25": raw_dc["pOver25"],
                "pOver35": raw_dc["pOver35"],
                "pBttsYes": raw_dc["pBttsYes"],
            }
            v6_probs = _recalibrate_football_for_quotes_v6(ph_raw, pa_raw, x12, lg_slug, v52_artifact)
            engine_pre_by_event[eid] = {
                "matchedSnapshotGameId": matched_gid,
                "sealedFromSnapshot": matched_bundle["snapshot"],
                "v6Probs": v6_probs,
                "rawPreKickoffProbs": raw_probs,
            }
            if (lg_slug, matched_gid) in verified_final_scores_by_game:
                settled_scores_by_event[eid] = verified_final_scores_by_game[(lg_slug, matched_gid)]

    quotes_eval = evaluate_prospective_quotes_power_devig_v6(
        ticks=quote_ticks,
        engine_pre_kickoff_by_event=engine_pre_by_event,
        settled_scores_by_event=settled_scores_by_event,
        n_resamples=BOOTSTRAP_RESAMPLES,
        seed=BOOTSTRAP_SEED,
    )

    # ------------------------------------------------------------------
    # PART 4: Build `>= 40` Parity Vectors (`officials_freeze_v6_0_snapshot.json`)
    # ------------------------------------------------------------------
    referee_parity_cases: list[dict[str, Any]] = []
    sample_ref_inputs = [
        ("premier-league", "Andy Madley"),
        ("premier-league", "Chris Kavanagh"),
        ("premier-league", "Adam Herczeg"),
        ("laliga", "César Soto Grado"),
        ("laliga", "Francisco Hernandez Maeso"),
        ("laliga", "Isidro Diaz de Mera Escuderos"),
        ("serie-a", "Davide Massa"),
        ("serie-a", "Daniele Chiffi"),
        ("bundesliga", "Felix Zwayer"),
        ("bundesliga", "Daniel Siebert"),
        ("ligue-1", "François Letexier"),
        ("ligue-2", "Benoît Millot"),
        ("liga-portugal", "Joao Pedro Pinheiro"),
        ("liga-portugal", "Bruno Jose Ribeiro Pires Costa"),
        ("liga-portugal", "Claudio Filipe Ruivo Pereira"),
        ("liga-portugal", "David Rafael Oliveira da Silva"),
        ("super-lig", "Oguzhan Cakir"),
        ("super-lig", "Atilla Karaoglan"),
        ("champions-league", "Clement Turpin"),
        ("champions-league", "Joao Pedro Pinheiro"),
        ("liga-mx", "Luis Santander"),
        ("libertadores", "Dario Herrera"),
        ("liga-argentina", "Facundo Raul Tello Figueroa"),
        ("brasileirao", "Anderson Daronco"),
        ("mls", "Drew Fischer"),
        ("j1-league", "Akihiko Ikeuchi"),
        ("saudi-pro-league", "Abdullah Dhafer Al-Shehri"),
        ("caf-champions", "Omar Abdulkadir Artan"),
        ("copa-del-rey", "Mateo Busquets Ferrer"),
        ("mlb", "Vic Carapazza"),
    ]
    for lg_in, ref_in in sample_ref_inputs:
        out_r = resolve_official_prior_v6(ref_in, lg_in, base_model_payload)
        referee_parity_cases.append({"input": {"league": lg_in, "refereeName": ref_in}, "expected": out_r})

    # Pre-kickoff freeze & lifecycle transition parity vectors (`16` cases incl. SHA-256 chains & contamination)
    freeze_parity_sequences: list[dict[str, Any]] = [
        {
            "sequenceId": "soccer_scheduled_to_live_to_ft_clean",
            "observations": [
                {
                    "matchId": "mx-2026-j16-queretaro-monterrey-401876988",
                    "sport": "football",
                    "league": "liga-mx",
                    "homeTeam": "queretaro",
                    "awayTeam": "monterrey",
                    "kickoffUtc": "2026-11-14T23:00Z",
                    "status": "scheduled",
                    "incomingAnalysis": {
                        "inputsAsOfUtc": "2026-11-11T02:38:42.517Z",
                        "probabilities": {"pHome": 0.2815, "pDraw": 0.2685, "pAway": 0.4500, "pOver25": 0.5420},
                        "projection": {"home": 1.18, "away": 1.62, "total": 2.80},
                    },
                },
                {
                    "matchId": "mx-2026-j16-queretaro-monterrey-401876988",
                    "sport": "football",
                    "league": "liga-mx",
                    "homeTeam": "queretaro",
                    "awayTeam": "monterrey",
                    "kickoffUtc": "2026-11-14T23:00:00.000Z",
                    "status": "in_progress",
                    "incomingAnalysis": None,
                },
                {
                    "matchId": "mx-2026-j16-queretaro-monterrey-401876988",
                    "sport": "football",
                    "league": "liga-mx",
                    "homeTeam": "queretaro",
                    "awayTeam": "monterrey",
                    "kickoffUtc": "2026-11-14T23:00:00.000Z",
                    "status": "final",
                    "incomingAnalysis": {
                        "inputsAsOfUtc": "2026-11-22T04:33:15.743Z",
                        "probabilities": {"pHome": 0.99, "pDraw": 0.005, "pAway": 0.005, "pOver25": 0.99},
                        "projection": {"home": 3.0, "away": 0.0, "total": 3.0},
                    },
                },
            ],
        },
        {
            "sequenceId": "nba_live_to_ft_missing_upstream_preserved",
            "observations": [
                {
                    "matchId": "nba-2026-11-15-ind-phi",
                    "sport": "nba",
                    "league": "nba",
                    "homeTeam": "philadelphia-76ers",
                    "awayTeam": "indiana-pacers",
                    "kickoffUtc": "2026-11-15T18:00:00.000Z",
                    "status": "in_progress",
                    "incomingAnalysis": {
                        "inputsAsOfUtc": "2026-11-15T03:11:00.566Z",
                        "probabilities": {"pHome": 0.6124, "pDraw": None, "pAway": 0.3876},
                        "projection": {"home": 116.4, "away": 112.1, "total": 228.5, "margin": 4.3},
                    },
                },
                {
                    "matchId": "nba-2026-11-15-ind-phi",
                    "sport": "nba",
                    "league": "nba",
                    "homeTeam": "philadelphia-76ers",
                    "awayTeam": "indiana-pacers",
                    "kickoffUtc": "2026-11-15T18:00:00.000Z",
                    "status": "final",
                    "incomingAnalysis": None,
                },
            ],
        },
        {
            "sequenceId": "mlb_post_kickoff_contaminated_rejected",
            "observations": [
                {
                    "matchId": "mlb-2026-10-06-new-york-yankees-tampa-bay-rays",
                    "sport": "mlb",
                    "league": "mlb",
                    "homeTeam": "new-york-yankees",
                    "awayTeam": "tampa-bay-rays",
                    "kickoffUtc": "2026-10-06T00:00:00.000Z",
                    "status": "final",
                    "incomingAnalysis": {
                        "inputsAsOfUtc": "2026-11-19T01:44:47.629Z",
                        "probabilities": {"pHome": 0.582, "pDraw": None, "pAway": 0.418},
                        "projection": {"home": 4.52, "away": 3.88, "total": 8.40, "margin": 0.64},
                    },
                }
            ],
        },
        {
            "sequenceId": "nhl_ft_causal_walkforward_recovery",
            "observations": [
                {
                    "matchId": "nhl-2026-11-14-sea-car",
                    "sport": "nhl",
                    "league": "nhl",
                    "homeTeam": "carolina-hurricanes",
                    "awayTeam": "seattle-kraken",
                    "kickoffUtc": "2026-11-14T18:00:00.000Z",
                    "status": "final",
                    "incomingAnalysis": None,
                    "causalBackfillAnalysis": us_backfills[("nhl", "nhl-2026-11-14-sea-car")],
                }
            ],
        },
        {
            "sequenceId": "bundesliga_naive_utc_timestamp_normalization",
            "observations": [
                {
                    "matchId": "bundesliga-2026-27-md10-bayern-munchen-koln",
                    "sport": "football",
                    "league": "bundesliga",
                    "homeTeam": "bayern-munchen",
                    "awayTeam": "koln",
                    "kickoffUtc": "2026-11-20T20:30:00",
                    "status": "scheduled",
                    "incomingAnalysis": {
                        "inputsAsOfUtc": "2026-11-14T05:44:28.107Z",
                        "probabilities": {"pHome": 0.885756, "pDraw": 0.089364, "pAway": 0.024880, "pOver25": 0.894528},
                        "projection": {"home": 4.381673, "away": 0.986182, "total": 5.367855},
                    },
                },
                {
                    "matchId": "bundesliga-2026-27-md10-bayern-munchen-koln",
                    "sport": "football",
                    "league": "bundesliga",
                    "homeTeam": "bayern-munchen",
                    "awayTeam": "koln",
                    "kickoffUtc": "2026-11-20T20:30:00Z",
                    "status": "scheduled",
                    "incomingAnalysis": {
                        "inputsAsOfUtc": "2026-11-22T04:33:15.743Z",
                        "probabilities": {"pHome": 0.85, "pDraw": 0.10, "pAway": 0.05, "pOver25": 0.84},
                        "projection": {"home": 3.80, "away": 1.00, "total": 4.80},
                    },
                },
            ],
        },
    ]

    freeze_parity_vectors: list[dict[str, Any]] = []
    flat_parity_obs: list[dict[str, Any]] = []
    for seq in freeze_parity_sequences:
        seq_audit = audit_pre_kickoff_causality_v6(seq["observations"], allow_pre_kickoff_refresh=False)
        flat_parity_obs.extend(seq["observations"])
        freeze_parity_vectors.append(
            {
                "sequenceId": seq["sequenceId"],
                "observations": seq["observations"],
                "expectedAudit": {
                    k: v for k, v in seq_audit.items() if k != "outcomesByMatchKey"
                },
                "expectedMatchOutcomes": seq_audit["outcomesByMatchKey"],
            }
        )
    combined_parity_audit = audit_pre_kickoff_causality_v6(flat_parity_obs, allow_pre_kickoff_refresh=False)

    # Settled quotes parity fixture (`6` events, `18` markets) to verify `< 1e-12` settled cluster-bootstrap parity too
    settled_fixture_scores = {
        "ws:football:D1:20261120:bayern_munchen:koln": {"homeScore": 3, "awayScore": 0},
        "ws:football:E0:20261121:manchester_city:fulham": {"homeScore": 2, "awayScore": 1},
        "ws:football:F1:20261120:troyes:le_havre": {"homeScore": 1, "awayScore": 1},
        "ws:football:I1:20261121:como:cagliari": {"homeScore": 2, "awayScore": 0},
        "ws:football:MEX:20261121:puebla:atletico_san_luis": {"homeScore": 1, "awayScore": 2},
        "ws:football:SP1:20261120:athletic_club:espanyol": {"homeScore": 2, "awayScore": 0},
    }
    quotes_settled_parity = evaluate_prospective_quotes_power_devig_v6(
        ticks=quote_ticks,
        engine_pre_kickoff_by_event=engine_pre_by_event,
        settled_scores_by_event=settled_fixture_scores,
        n_resamples=BOOTSTRAP_RESAMPLES,
        seed=BOOTSTRAP_SEED,
    )

    snapshot_payload = {
        "schema_version": SCHEMA_VERSION_SNAPSHOT,
        "status": "candidate",
        "production_activated": False,
        "holdout_sealed_untouched": True,
        "referee_parity_cases": referee_parity_cases,
        "freeze_parity_vectors": freeze_parity_vectors,
        "combined_freeze_parity_audit": {
            k: v for k, v in combined_parity_audit.items() if k != "outcomesByMatchKey"
        },
        "quotes_live_parity_bundle": {
            "ticks": quote_ticks,
            "engine_pre_kickoff_by_event": engine_pre_by_event,
            "expected_live_eval": {k: v for k, v in quotes_eval.items() if k != "evaluated_markets"},
            "expected_first_10_markets": quotes_eval["evaluated_markets"][:10],
            "settled_parity_fixture_scores": settled_fixture_scores,
            "expected_settled_fixture_eval": quotes_settled_parity["settled_outcome_calibration"],
        },
    }

    results_payload = {
        "experiment_id": "EXP_V61_officials_freeze_v6_0",
        "codename": "PitchLab Global Officials, Pre-Kickoff Freeze & Power Quotes Evaluator v6.0",
        "status": "candidate",
        "production_activated": False,
        "holdout_window_protected": [HOLDOUT_START_DATE, HOLDOUT_END_DATE],
        "holdout_sealed_untouched": True,
        "officials_registry_v6_0": {
            "v5_1_officials_loaded": len(v51_officials),
            "live_assignments_crossed": len(live_assignments),
            "live_soccer_assignments": sum(1 for x in resolved_live_assignments if x["sport"] == "football"),
            "live_non_soccer_assignments": sum(1 for x in resolved_live_assignments if x["sport"] != "football"),
            "soccer_competitions_covered": len(comp_priors),
            "total_leagues_covered": len(comp_priors) + len(NON_SOCCER_US_LEAGUES),
            "total_unified_soccer_officials": len(global_soccer_officials_registry),
            "resolution_methods_breakdown": dict(sorted(resolution_method_counts.items())),
            "live_provenance_breakdown": dict(sorted(provenance_counts.items())),
            "live_confederation_breakdown": dict(sorted(confed_assignment_counts.items())),
            "booking_points_gamma_red": BOOKING_POINTS_GAMMA_RED,
            "live_soccer_coverage_before_v6": round(190 / 585, 6),
            "live_soccer_empirical_verified_after_alias_v6": round(
                provenance_counts["empirical_tm_verified"] / 585, 6
            ),
            "live_soccer_total_prior_coverage_v6": 1.0,
        },
        "pre_kickoff_freeze_audit_v6_0": {
            "dated_snapshot_dates_audited": sorted(dated_filenames_seen),
            "total_snapshot_files_audited": snapshot_files_count,
            "total_game_observations_audited": causality_audit["totalObservationsAudited"],
            "unique_matches_tracked": causality_audit["uniqueMatchesTracked"],
            "sealed_matches_count": causality_audit["sealedMatchesCount"],
            "raw_latest_ft_contaminated_count": sum(latest_raw_ft_contaminated_by_league.values()),
            "raw_latest_ft_contaminated_by_league": dict(sorted(latest_raw_ft_contaminated_by_league.items())),
            "raw_latest_scheduled_contaminated_count": sum(latest_raw_sched_contaminated_by_league.values()),
            "raw_all_snapshots_contaminated_count": causality_audit["rawPostKickoffContaminatedCount"],
            "rescued_from_prior_dated_seal_count": causality_audit["rescuedFromPriorSealCount"],
            "recovered_from_causal_walkforward_count": causality_audit["recoveredFromCausalBackfillCount"],
            "rejected_unrecoverable_contaminated_count": causality_audit["rejectedUnrecoverableContaminatedCount"],
            "contaminated_accepted_into_ledger_count": causality_audit["contaminatedAcceptedIntoLedgerCount"],
            "us_ft_forecast_coverage_before": latest_us_ft_forecast_before,
            "us_ft_forecast_coverage_after": latest_us_ft_forecast_after,
            "us_causal_walkforward_backfill_oos": us_backfill_stats,
            "canonical_ledger_sha256": causality_audit["ledgerSha256"],
        },
        "prospective_quotes_power_devig_v6_0": {
            k: v for k, v in quotes_eval.items() if k != "evaluated_markets"
        },
    }

    # Verify zero forbidden keys across all three JSON artifacts before writing to disk
    _assert_zero_forbidden_keys(base_model_payload, "model_officials_freeze_v6_0_candidate")
    _assert_zero_forbidden_keys(snapshot_payload, "officials_freeze_v6_0_snapshot")
    _assert_zero_forbidden_keys(results_payload, "exp_v61_officials_freeze_v6_0_results")

    model_bytes = json.dumps(base_model_payload, ensure_ascii=False, indent=2).encode("utf-8")
    snap_bytes = json.dumps(snapshot_payload, ensure_ascii=False, indent=2).encode("utf-8")
    MODEL_OUT_PATH.write_bytes(model_bytes)
    SNAPSHOT_OUT_PATH.write_bytes(snap_bytes)

    results_payload["artifact_hashes"] = {
        "model_officials_freeze_v6_0_candidate_sha256": hashlib.sha256(model_bytes).hexdigest(),
        "officials_freeze_v6_0_snapshot_sha256": hashlib.sha256(snap_bytes).hexdigest(),
    }
    RESULTS_OUT_PATH.write_bytes(json.dumps(results_payload, ensure_ascii=False, indent=2).encode("utf-8"))
    return results_payload


def main() -> None:
    res = run_exp_v61()
    print(
        json.dumps(
            {
                "officials_registry_v6_0": res["officials_registry_v6_0"],
                "pre_kickoff_freeze_audit_v6_0": {
                    k: v
                    for k, v in res["pre_kickoff_freeze_audit_v6_0"].items()
                    if k != "us_causal_walkforward_backfill_oos"
                },
                "prospective_quotes_summary": {
                    "n_raw_ticks": res["prospective_quotes_power_devig_v6_0"]["n_raw_ticks"],
                    "n_valid_prekickoff_ticks": res["prospective_quotes_power_devig_v6_0"]["n_valid_prekickoff_ticks"],
                    "n_complete_markets": res["prospective_quotes_power_devig_v6_0"]["n_complete_markets"],
                    "mean_overround": res["prospective_quotes_power_devig_v6_0"]["mean_overround"],
                    "kl_v6_vs_raw": res["prospective_quotes_power_devig_v6_0"]["prekickoff_dispersion_and_alignment"][
                        "kl_divergence_v6_vs_raw_prekickoff"
                    ],
                    "settled_n": res["prospective_quotes_power_devig_v6_0"]["settled_outcome_calibration"][
                        "n_settled_markets"
                    ],
                },
                "artifact_hashes": res["artifact_hashes"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
