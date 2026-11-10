"""Capa prospectiva Bayesiana en vivo para PitchLab Minkowski v3.0 (NFL).

Integra cuatro fuentes de contexto pre-partido en vivo sin contaminar el entrenamiento
histórico libre de fuga temporal:
  1. SumerSports EPA/play & Success % (diferencial neto ofensivo/defensivo con encogimiento Bayesiano).
  2. Ourlads Depth Charts + NFL Official Injuries (QB1 lesionado, bajas Out/IR y Questionable).
  3. NFLPenalties (interacción entre disciplina de castigos del equipo y rigor/sesgo de las 54 cuadrillas).
  4. Open-Meteo + Física de los 32 Estadios (compresión aerodinámica por viento >= 15 mph,
     precipitación en estadios abiertos y shock fisiológico de altitud >= 1500 m).

Mantiene paridad numérica exacta (|Δ| < 1e-12) con `src/domain/prediction/nfl_live.ts`.
"""
from __future__ import annotations

import math
from typing import Any, Mapping, Sequence

MINKOWSKI_V3_MODEL_ID = "pitchlab-minkowski-v3.0"

MINKOWSKI_V3_DEFAULT_PRIORS: dict[str, float] = {
    "epa_prior_games": 8.0,
    "default_sample_games": 9.0,
    "w_net_epa": 0.85,
    "w_net_success_pct": 0.012,
    "epa_total_pts_scale": 22.0,
    "w_qb_injured": 0.26,
    "w_injury_out_ir": 0.022,
    "w_injury_questionable": 0.008,
    "qb_injury_total_pts": -2.60,
    "league_flags_per_game": 15.60,
    "league_home_penalty_bias": 0.22,
    "w_penalty_discipline": 0.024,
    "w_crew_home_bias": 0.028,
    "wind_threshold_mph": 15.0,
    "wind_compression_per_mph": 0.0045,
    "wind_max_compression": 0.14,
    "wind_total_pts_per_mph": -0.24,
    "wind_tie_boost_per_mph": 0.015,
    "precip_threshold_mm": 1.0,
    "precip_compression_per_mm": 0.0030,
    "precip_max_compression": 0.08,
    "precip_total_pts_per_mm": -0.18,
    "precip_tie_boost_per_mm": 0.008,
    "altitude_threshold_m": 1500.0,
    "w_altitude_live_only": 0.068,
    "w_altitude_residual": 0.035,
    "default_expected_total_pts": 45.2,
}


def _clamp(val: float, lo: float, hi: float) -> float:
    if val < lo:
        return lo
    if val > hi:
        return hi
    return val


def _num(val: Any, fallback: float | None = None) -> float | None:
    if val is None or isinstance(val, bool):
        return fallback
    try:
        f = float(val)
        return f if math.isfinite(f) else fallback
    except (TypeError, ValueError):
        return fallback


def _norm_pct(val: float | None) -> float | None:
    if val is None:
        return None
    if -1.5 <= val <= 1.5 and val != 0.0:
        return val * 100.0
    return val


def _resolve_is_dome(
    context: Mapping[str, Any],
    stadium_info: Mapping[str, Any] | None,
) -> bool:
    explicit = context.get("is_dome", context.get("isDome"))
    if isinstance(explicit, bool):
        return explicit
    if explicit in (0, 1):
        return bool(explicit)

    roof_raw = context.get("roof_type", context.get("roofType"))
    if roof_raw is None and stadium_info is not None:
        if isinstance(stadium_info.get("is_dome"), bool) and stadium_info.get("roof_type") != "retractable":
            return bool(stadium_info["is_dome"])
        roof_raw = stadium_info.get("roof_type")

    roof = str(roof_raw or "open").strip().lower()
    if roof in ("dome", "indoor", "closed", "indoor_arena"):
        return True
    if roof == "retractable":
        roof_open = context.get("roof_open", context.get("roofOpen"))
        if isinstance(roof_open, bool):
            return not roof_open
        return True
    return False


def compute_nfl_live_context_delta(
    context: Mapping[str, Any] | None = None,
    priors: Mapping[str, float] | None = None,
    referee_crews: Mapping[str, Mapping[str, Any]] | None = None,
    stadiums: Mapping[str, Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    """Calcula el vector determinista de ajustes en log-odds y puntos totales de Minkowski v3.0."""
    ctx = dict(context or {})
    p = {**MINKOWSKI_V3_DEFAULT_PRIORS, **(dict(priors) if priors else {})}

    home_team = str(ctx.get("home_team", ctx.get("homeTeam", "")) or "").strip().upper()
    away_team = str(ctx.get("away_team", ctx.get("awayTeam", "")) or "").strip().upper()

    home_stad = stadiums.get(home_team) if (stadiums and home_team) else None
    away_stad = stadiums.get(away_team) if (stadiums and away_team) else None

    is_dome = _resolve_is_dome(ctx, home_stad)
    neutral_raw = ctx.get("neutral_site", ctx.get("neutralSite", False))
    neutral_site = bool(neutral_raw)

    wind_mph = _num(
        ctx.get("max_wind_speed_mph", ctx.get("maxWindSpeedMph", ctx.get("wind_mph", ctx.get("windMph")))),
        0.0,
    ) or 0.0
    precip_mm = _num(
        ctx.get(
            "total_precipitation_mm",
            ctx.get("precipitation_mm", ctx.get("precipitationMm", ctx.get("precip_mm"))),
        ),
        0.0,
    ) or 0.0

    # 1. Open-Meteo & Física de Estadio (viento >= 15 mph, precipitación y altitud >= 1500 m)
    wind_thresh = float(p["wind_threshold_mph"])
    precip_thresh = float(p["precip_threshold_mm"])
    excess_wind = 0.0 if is_dome else _clamp(wind_mph - wind_thresh, 0.0, 30.0)
    excess_precip = 0.0 if is_dome else _clamp(precip_mm - precip_thresh, 0.0, 25.0)

    wind_comp = 1.0 - min(float(p["wind_max_compression"]), float(p["wind_compression_per_mph"]) * excess_wind)
    precip_comp = 1.0 - min(float(p["precip_max_compression"]), float(p["precip_compression_per_mm"]) * excess_precip)
    weather_compression = wind_comp * precip_comp

    wind_total_delta = float(p["wind_total_pts_per_mph"]) * excess_wind
    precip_total_delta = float(p["precip_total_pts_per_mm"]) * excess_precip
    tie_weather_boost = _clamp(
        float(p["wind_tie_boost_per_mph"]) * excess_wind + float(p["precip_tie_boost_per_mm"]) * excess_precip,
        0.0,
        0.65,
    )

    home_elev = _num(
        ctx.get("stadium_elevation_m", ctx.get("stadiumElevationM")),
        _num(home_stad.get("stadium_elevation_m") if home_stad else None, 100.0),
    ) or 100.0
    away_elev = _num(
        ctx.get("away_elevation_m", ctx.get("awayElevationM")),
        _num(away_stad.get("stadium_elevation_m") if away_stad else None, 100.0),
    ) or 100.0

    alt_thresh = float(p["altitude_threshold_m"])
    base_has_alt = bool(ctx.get("base_includes_venue_altitude", ctx.get("baseIncludesVenueAltitude", False)))
    if not neutral_site and home_elev >= alt_thresh:
        alt_diff_m = max(0.0, home_elev - away_elev)
        w_alt = float(p["w_altitude_residual"]) if base_has_alt else float(p["w_altitude_live_only"])
        altitude_logit_delta = _clamp(w_alt * (alt_diff_m / 1500.0), 0.0, 0.12)
        altitude_total_delta = 0.0 if is_dome else _clamp(0.75 * (home_elev / 1588.0), 0.0, 1.25)
    else:
        alt_diff_m = 0.0
        altitude_logit_delta = 0.0
        altitude_total_delta = 0.0

    weather_total_delta = _clamp(wind_total_delta + precip_total_delta + altitude_total_delta, -9.5, 1.5)

    # 2. SumerSports EPA/play & Success % (con encogimiento Bayesiano y amortiguación aerodinámica)
    h_off_epa = _num(ctx.get("home_off_epa_per_play", ctx.get("homeOffEpaPerPlay")))
    h_def_epa = _num(ctx.get("home_def_epa_per_play", ctx.get("homeDefEpaPerPlay")))
    a_off_epa = _num(ctx.get("away_off_epa_per_play", ctx.get("awayOffEpaPerPlay")))
    a_def_epa = _num(ctx.get("away_def_epa_per_play", ctx.get("awayDefEpaPerPlay")))
    explicit_epa_diff = _num(ctx.get("net_epa_diff", ctx.get("netEpaDiff")))

    # En SumerSports `def_epa_per_play` es EPA permitida por jugada (menor/negativo = mejor defensa).
    # El diferencial neto (home_off + away_def_allowed) - (away_off + home_def_allowed) equivale
    # exactamente a (home_off - home_def_allowed) - (away_off - away_def_allowed).
    if h_off_epa is not None and h_def_epa is not None and a_off_epa is not None and a_def_epa is not None:
        raw_net_epa_diff = (h_off_epa + a_def_epa) - (a_off_epa + h_def_epa)
        off_epa_sum = (h_off_epa + a_def_epa) + (a_off_epa + h_def_epa)
    elif explicit_epa_diff is not None:
        raw_net_epa_diff = explicit_epa_diff
        off_epa_sum = 0.0
    else:
        raw_net_epa_diff = 0.0
        off_epa_sum = 0.0

    h_off_succ = _norm_pct(_num(ctx.get("home_off_success_pct", ctx.get("homeOffSuccessPct"))))
    h_def_succ = _norm_pct(_num(ctx.get("home_def_success_pct", ctx.get("homeDefSuccessPct"))))
    a_off_succ = _norm_pct(_num(ctx.get("away_off_success_pct", ctx.get("awayOffSuccessPct"))))
    a_def_succ = _norm_pct(_num(ctx.get("away_def_success_pct", ctx.get("awayDefSuccessPct"))))
    explicit_succ_diff = _norm_pct(_num(ctx.get("net_success_pct_diff", ctx.get("netSuccessPctDiff"))))

    if h_off_succ is not None and h_def_succ is not None and a_off_succ is not None and a_def_succ is not None:
        raw_net_succ_diff = (h_off_succ + a_def_succ) - (a_off_succ + h_def_succ)
    elif explicit_succ_diff is not None:
        raw_net_succ_diff = explicit_succ_diff
    else:
        raw_net_succ_diff = 0.0

    sample_games = _clamp(
        _num(ctx.get("sample_games", ctx.get("sampleGames")), float(p["default_sample_games"]))
        or float(p["default_sample_games"]),
        0.0,
        20.0,
    )
    epa_shrink = sample_games / (sample_games + float(p["epa_prior_games"]))
    aero_pass_factor = 1.0 if is_dome else (1.0 - min(0.25, 0.010 * excess_wind))

    epa_logit_delta = _clamp(
        epa_shrink
        * aero_pass_factor
        * (float(p["w_net_epa"]) * raw_net_epa_diff + float(p["w_net_success_pct"]) * raw_net_succ_diff),
        -0.42,
        0.42,
    )
    epa_total_delta = _clamp(epa_shrink * float(p["epa_total_pts_scale"]) * off_epa_sum, -6.5, 6.5)

    # 3. Ourlads Depth Charts + NFL Official Injuries
    h_qb_inj = _clamp(_num(ctx.get("home_qb_injured", ctx.get("homeQbInjured")), 0.0) or 0.0, 0.0, 1.0)
    a_qb_inj = _clamp(_num(ctx.get("away_qb_injured", ctx.get("awayQbInjured")), 0.0) or 0.0, 0.0, 1.0)
    h_out_ir = _num(ctx.get("home_injuries_out_ir", ctx.get("homeInjuriesOutIr")), 0.0) or 0.0
    a_out_ir = _num(ctx.get("away_injuries_out_ir", ctx.get("awayInjuriesOutIr")), 0.0) or 0.0
    h_quest = _num(ctx.get("home_injuries_questionable", ctx.get("homeInjuriesQuestionable")), 0.0) or 0.0
    a_quest = _num(ctx.get("away_injuries_questionable", ctx.get("awayInjuriesQuestionable")), 0.0) or 0.0

    qb_logit_delta = float(p["w_qb_injured"]) * (a_qb_inj - h_qb_inj)
    out_diff = _clamp(a_out_ir - h_out_ir, -8.0, 8.0)
    quest_diff = _clamp(a_quest - h_quest, -10.0, 10.0)
    roster_logit_delta = float(p["w_injury_out_ir"]) * out_diff + float(p["w_injury_questionable"]) * quest_diff
    injury_logit_delta = _clamp(qb_logit_delta + roster_logit_delta, -0.50, 0.50)

    excess_combined_out = min(12.0, max(0.0, (h_out_ir + a_out_ir) - 8.0))
    injury_total_delta = _clamp(
        float(p["qb_injury_total_pts"]) * (h_qb_inj + a_qb_inj) - 0.15 * excess_combined_out,
        -6.5,
        0.0,
    )

    # 4. NFLPenalties: disciplina de equipo x rigor y sesgo local de cuadrilla arbitral
    crew_name_raw = ctx.get("referee_crew", ctx.get("refereeCrew"))
    crew_name = str(crew_name_raw).strip() if crew_name_raw else ""
    crew_info = referee_crews.get(crew_name) if (referee_crews and crew_name) else None

    lg_flags = float(p["league_flags_per_game"])
    lg_bias = float(p["league_home_penalty_bias"])

    explicit_flags = _num(ctx.get("crew_flags_per_game", ctx.get("crewFlagsPerGame")))
    explicit_bias = _num(ctx.get("crew_home_penalty_bias", ctx.get("crewHomePenaltyBias")))

    eff_flags = (
        explicit_flags
        if explicit_flags is not None
        else (_num(crew_info.get("total_flags_per_game")) if crew_info else None)
    )
    if eff_flags is None:
        eff_flags = lg_flags

    has_crew_bias = explicit_bias is not None or crew_info is not None
    eff_home_bias = (
        explicit_bias
        if explicit_bias is not None
        else (_num(crew_info.get("home_penalty_bias"), lg_bias) if crew_info else lg_bias)
    )
    if eff_home_bias is None:
        eff_home_bias = lg_bias

    rigor_ratio = _clamp(eff_flags / lg_flags, 0.70, 1.40)
    h_pen_pg = _num(ctx.get("home_penalties_per_game", ctx.get("homePenaltiesPerGame")))
    a_pen_pg = _num(ctx.get("away_penalties_per_game", ctx.get("awayPenaltiesPerGame")))
    pen_disc_diff = (
        _clamp(a_pen_pg - h_pen_pg, -4.5, 4.5) if (h_pen_pg is not None and a_pen_pg is not None) else 0.0
    )

    discipline_logit_delta = float(p["w_penalty_discipline"]) * rigor_ratio * pen_disc_diff
    crew_bias_logit_delta = (eff_home_bias - lg_bias) * float(p["w_crew_home_bias"]) if has_crew_bias else 0.0
    referee_logit_delta = _clamp(discipline_logit_delta + crew_bias_logit_delta, -0.18, 0.18)
    referee_total_delta = _clamp(0.14 * (eff_flags - lg_flags), -1.5, 1.5) if has_crew_bias else 0.0

    total_logit_delta = epa_logit_delta + injury_logit_delta + referee_logit_delta + altitude_logit_delta
    total_points_delta = epa_total_delta + injury_total_delta + referee_total_delta + weather_total_delta

    drivers = [
        {
            "factor": "sumersports_epa_success",
            "label": "SumerSports Net EPA/play & Success % (Bayesian shrunk)",
            "netValue": raw_net_epa_diff,
            "impactLogit": epa_logit_delta,
            "impactTotalPoints": epa_total_delta,
        },
        {
            "factor": "injuries_qb_depth",
            "label": "Ourlads + Official NFL Injuries (QB1 & Out/Questionable)",
            "netValue": (a_qb_inj - h_qb_inj) + 0.1 * out_diff,
            "impactLogit": injury_logit_delta,
            "impactTotalPoints": injury_total_delta,
        },
        {
            "factor": "referee_penalties",
            "label": "NFLPenalties Team Discipline x Crew Rigor/Bias",
            "netValue": pen_disc_diff,
            "impactLogit": referee_logit_delta,
            "impactTotalPoints": referee_total_delta,
        },
        {
            "factor": "weather_stadium_physics",
            "label": "Open-Meteo Wind/Precip & Stadium Altitude Physics",
            "netValue": alt_diff_m if alt_diff_m > 0.0 else -excess_wind,
            "impactLogit": altitude_logit_delta,
            "impactTotalPoints": weather_total_delta,
        },
    ]

    return {
        "epaLogitDelta": epa_logit_delta,
        "injuryLogitDelta": injury_logit_delta,
        "refereeLogitDelta": referee_logit_delta,
        "altitudeLogitDelta": altitude_logit_delta,
        "totalLogitDelta": total_logit_delta,
        "weatherCompression": weather_compression,
        "tieWeatherBoost": tie_weather_boost,
        "totalPointsDelta": total_points_delta,
        "isDome": is_dome,
        "drivers": drivers,
    }


def apply_minkowski_v3_live_context(
    base_probs: Mapping[str, float] | Sequence[float],
    context: Mapping[str, Any] | None = None,
    priors: Mapping[str, float] | None = None,
    referee_crews: Mapping[str, Mapping[str, Any]] | None = None,
    stadiums: Mapping[str, Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    """Actualiza una predicción 3-way NFL (H, T, A) con la capa prospectiva Minkowski v3.0."""
    p = {**MINKOWSKI_V3_DEFAULT_PRIORS, **(dict(priors) if priors else {})}
    if isinstance(base_probs, Mapping):
        ph_in = float(base_probs["pHome"])
        pd_in = float(base_probs.get("pDraw", base_probs.get("pTie", 0.005)))
        pa_in = float(base_probs["pAway"])
        base_tot = _num(base_probs.get("expectedTotal"), float(p["default_expected_total_pts"]))
    else:
        ph_in = float(base_probs[0])
        pd_in = float(base_probs[1])
        pa_in = float(base_probs[2])
        base_tot = float(p["default_expected_total_pts"])

    ctx = dict(context or {})
    if ctx.get("base_expected_total", ctx.get("baseExpectedTotal")) is not None:
        base_tot = _num(
            ctx.get("base_expected_total", ctx.get("baseExpectedTotal")),
            float(p["default_expected_total_pts"]),
        )
    if base_tot is None:
        base_tot = float(p["default_expected_total_pts"])

    ph0 = _clamp(ph_in, 1e-9, 1.0 - 2e-9)
    pd0 = _clamp(pd_in, 1e-6, 0.08)
    pa0 = _clamp(pa_in, 1e-9, 1.0 - 2e-9)
    s0 = ph0 + pd0 + pa0
    ph0 /= s0
    pd0 /= s0
    pa0 /= s0

    delta = compute_nfl_live_context_delta(
        context=ctx,
        priors=p,
        referee_crews=referee_crews,
        stadiums=stadiums,
    )

    # Identidad exacta cuando no hay contexto activo
    if (
        delta["totalLogitDelta"] == 0.0
        and delta["weatherCompression"] == 1.0
        and delta["tieWeatherBoost"] == 0.0
    ):
        expected_total = _clamp(base_tot + delta["totalPointsDelta"], 27.0, 66.0)
        p_away_id = 1.0 - ph0 - pd0
        return {
            "sport": "nfl",
            "modelId": MINKOWSKI_V3_MODEL_ID,
            "pHome": ph0,
            "pDraw": pd0,
            "pAway": p_away_id,
            "expectedTotalPoints": expected_total,
            "delta": delta,
        }

    z0 = math.log(ph0 / pa0)
    z1 = delta["weatherCompression"] * (z0 + delta["totalLogitDelta"])
    closeness_shift = _clamp(-0.08 * (z1 * z1 - z0 * z0), -0.35, 0.35)
    p_draw_new = _clamp(pd0 * math.exp(delta["tieWeatherBoost"] + closeness_shift), 0.0005, 0.035)
    rem = 1.0 - p_draw_new
    sig_z1 = 1.0 / (1.0 + math.exp(-z1))
    p_home_new = rem * sig_z1
    p_away_new = 1.0 - p_home_new - p_draw_new

    expected_total = _clamp(base_tot + delta["totalPointsDelta"], 27.0, 66.0)

    return {
        "sport": "nfl",
        "modelId": MINKOWSKI_V3_MODEL_ID,
        "pHome": p_home_new,
        "pDraw": p_draw_new,
        "pAway": p_away_new,
        "expectedTotalPoints": expected_total,
        "delta": delta,
    }
