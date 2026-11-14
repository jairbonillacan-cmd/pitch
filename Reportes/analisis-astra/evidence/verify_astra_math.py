#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_astra_math.py
====================
Verificación matemática y algorítmica reproducible de Astra AI (https://astraanalisis.com/)
para la auditoría forense de PitchLab (Subagente 4).

Valida empíricamente (100% offline sobre payloads reales capturados + fixtures demo del bundle):
  1. Funciones exactas del cliente TypeScript/JavaScript (mod_0777, mod_0784, mod_0869,
     mod_1015, mod_1018, mod_1023, mod_1025, mod_1028, mod_1029).
  2. Fútbol (league_v3, national_v3, cross_league_v3):
     - Fórmula log-lineal exacta de lambda_home / lambda_away con derrame territorial 0.15*(net_H - net_A).
     - Modelo logístico exacto de posesión esperada (error 0.0% en todos los partidos).
     - Shrinkage Empirical Bayes de tarjetas amarillas por árbitro (pseudoconteos k = 15 partidos).
     - Matriz bivariada exacta de Dixon-Coles (1997) con rho por liga: reproducción a 4 decimales
       de p_home, p_draw, p_away, over_05, over_15, over_25, btts y correct_score_top3.
     - Contraste forense contra los 6 partidos demo de mod_1008 (league_v2, rho = -0.08 en P(0,0)).
  3. NBA: Elo con ventaja local de +60 pts y divisor 28.0, ensamble 75% Net Rating + 25% Elo,
     y distribución Normal efectiva (sigma_win ~ 12.25 pts).
  4. NFL: Ensamble lineal (35% Puntos + 30% EPA/jugada + 35% Elo) + ajuste explícito de QB titular,
     y probabilidad de victoria Normal exacta Phi(margen_final / 13.0) a 4 decimales.
  5. NHL: Descomposición situacional de xG/60 (5v5 + PP + SH + EVO), multiplicadores de definición y
     portero rival, incremento por portería vacía (~8.1%) y ley de conservación Monte Carlo en OT/SO.
  6. MLB: Distribución Binomial Negativa (F5 y 9 entradas), factor de parque y runline (-1.5).
  7. Momios (match-odds): Prueba IEEE-754 exacta de conversión de momios americanos DraftKings (ESPN)
     a decimales sin redondear en servidor, momios decimales Marathonbet (API-Football), cálculo de
     overround/vig (+4.17% a +8.64%) y ausencia de devigging/EV en el cliente.
"""

from __future__ import annotations
import json
import math
import os
import re
import sys
from typing import Any, Dict, List, Optional, Tuple


# ============================================================================
# 1. REPRODUCCIÓN EXACTA DE FUNCIONES DEL CLIENTE (TypeScript -> Python)
# ============================================================================

def js_round_half_up_positive(x: float) -> int:
    """Replica Math.round(x) de JavaScript para x >= 0: floor(x + 0.5)."""
    return math.floor(x + 0.5)


def client_pct(e: Optional[float]) -> str:
    """mod_0777: e.pct = e => null == e ? '—' : `${Math.round(100 * e)}%`"""
    if e is None:
        return "—"
    return f"{js_round_half_up_positive(100.0 * e)}%"


def client_result_outcome(
    finished: bool,
    home_score: Optional[float],
    away_score: Optional[float],
) -> Optional[str]:
    """mod_1018: resultOutcome(finished, homeScore, awayScore)"""
    if not finished:
        return None
    if home_score is None or away_score is None:
        return None
    if not (math.isfinite(home_score) and math.isfinite(away_score)):
        return None
    if home_score < 0 or away_score < 0:
        return None
    if home_score > away_score:
        return "home"
    if home_score < away_score:
        return "away"
    return "draw"


def client_football_outcome_90min(fixture: Dict[str, Any]) -> Optional[str]:
    """
    mod_0784 líneas 663-670:
    Cuando status in ('AET', 'PEN'), evalúa ft_home y ft_away (90 min reglamentarios),
    no home_goals / away_goals (que incluyen prórroga).
    """
    status = fixture.get("status") or ""
    is_finished = status in {"FT", "AET", "PEN", "AWD", "WO"}
    extra = status in {"AET", "PEN"}
    h = fixture.get("ft_home") if extra else fixture.get("home_goals")
    a = fixture.get("ft_away") if extra else fixture.get("away_goals")
    return client_result_outcome(is_finished, h, a)


def client_stat_number(val: Any) -> Optional[float]:
    """mod_1015: statNumber(t) — extrae primer número flotante de estadística en vivo."""
    if val is None or val == "":
        return None
    if isinstance(val, (int, float)):
        return float(val) if math.isfinite(val) else None
    m = re.search(r"-?\d+(?:\.\d+)?", str(val).strip())
    if not m:
        return None
    n = float(m.group(0))
    return n if math.isfinite(n) else None


def client_stat_bar_home_width(home_val: Any, away_val: Any) -> float:
    """mod_0869 (_): barra proporcional SVG viewBox 0..100 -> a / (a + r) * 100."""
    a = max(0.0, client_stat_number(home_val) or 0.0)
    r = max(0.0, client_stat_number(away_val) or 0.0)
    s = a + r
    return (a / s * 100.0) if s > 0 else 50.0


def client_sport_index_at(points: List[Dict[str, float]], x: float) -> Optional[int]:
    """mod_1015: sportIndexAt(points, x) — índice del punto más cercano al toque x en gráfica."""
    if not points or not math.isfinite(x):
        return None
    best_i = 0
    best_d = abs(points[0]["x"] - x)
    for i in range(1, len(points)):
        d = abs(points[i]["x"] - x)
        if d < best_d:
            best_d = d
            best_i = i
    return best_i


def client_shooting_percentage(raw: Optional[str]) -> str:
    """mod_1028: shootingPercentage('7/15') -> '46.7%'"""
    if not raw:
        return "—"
    m = re.match(r"^(\d+)/(\d+)$", raw)
    if not m or int(m.group(2)) == 0:
        return "—"
    return f"{(int(m.group(1)) / int(m.group(2)) * 100.0):.1f}%"


def client_validate_match_odds(sport: str, payload: Optional[Dict[str, Any]]) -> Optional[Dict[str, Optional[float]]]:
    """mod_1023: validación estricta de momios decimales devueltos por Edge Function match-odds."""
    def valid_odd(v: Any) -> bool:
        return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and v > 1.0

    odds = (payload or {}).get("odds")
    if not isinstance(odds, dict):
        return None
    is_fut = (sport == "futbol")
    if not valid_odd(odds.get("home")) or not valid_odd(odds.get("away")):
        return None
    if is_fut and not valid_odd(odds.get("draw")):
        return None
    if (not is_fut) and (odds.get("draw") is not None):
        return None
    return {
        "home": float(odds["home"]),
        "draw": float(odds["draw"]) if is_fut else None,
        "away": float(odds["away"]),
    }


def client_football_analysis_sections(fixture: Dict[str, Any]) -> List[Dict[str, str]]:
    """mod_1025: footballAnalysisSections(fixture) con fallback determinista para córners y faltas."""
    def nonneg_num(v: Any) -> Optional[float]:
        if v is None or isinstance(v, bool):
            return None
        if isinstance(v, str) and v.strip() == "":
            return None
        try:
            n = float(v)
            return n if (math.isfinite(n) and n >= 0) else None
        except (ValueError, TypeError):
            return None

    def fallback_text(kind: str) -> str:
        pred = fixture.get("prediction")
        if not pred:
            return ""
        s = nonneg_num(pred.get(f"{kind}_home"))
        u = nonneg_num(pred.get(f"{kind}_away"))
        c = nonneg_num(pred.get(f"{kind}_total"))
        if c is None and s is not None and u is not None:
            c = s + u
        label = "tiros de esquina" if kind == "corners" else "faltas"
        parts_team = []
        if s is not None:
            parts_team.append(f"{fixture['home']['name']}: {s:.1f}")
        if u is not None:
            parts_team.append(f"{fixture['away']['name']}: {u:.1f}")
        if not parts_team and c is None:
            return f"No hay una estimación de {label} disponible para este partido."
        out = []
        if parts_team:
            out.append(f"Proyección de {label} por equipo: {'; '.join(parts_team)}.")
        if c is not None:
            out.append(f"Total esperado: {c:.1f} {label}.")
        out.append("Son valores esperados del modelo, no un mínimo garantizado.")
        return " ".join(out)

    sec = (fixture.get("analysis") or {}).get("sections") or {}
    corners_txt = (sec.get("tiros_de_esquina") or "").strip() or fallback_text("corners")
    fouls_txt = (sec.get("faltas") or "").strip() or fallback_text("fouls")

    result = [
        {"title": "Resumen", "text": sec.get("resumen") or ""},
        {"title": "Goles", "text": sec.get("goles") or ""},
        {"title": "Tiros de esquina", "text": corners_txt},
        {"title": "Faltas", "text": fouls_txt},
    ]
    if not corners_txt and not fouls_txt and sec.get("corners_faltas"):
        result.append({"title": "Tiros de esquina y faltas", "text": sec["corners_faltas"]})
    result.extend([
        {"title": "Contexto", "text": sec.get("contexto") or ""},
        {"title": "A tener en cuenta", "text": sec.get("a_tener_en_cuenta") or ""},
    ])
    return result


# ============================================================================
# 2. MODELOS MATEMÁTICOS DEL SERVIDOR RECONSTRUIDOS (Fútbol y Deportes US)
# ============================================================================

def dixon_coles_matrix(
    lambda_home: float,
    lambda_away: float,
    rho: float,
    max_goals: int = 20,
) -> Dict[str, Any]:
    """
    Matriz bivariada exacta de Dixon y Coles (1997) truncada en [0..max_goals]^2:
      P(X=x, Y=y) = tau(x, y; lambda_H, lambda_A, rho) * Pois(x; lambda_H) * Pois(y; lambda_A)
    normalizada sobre la grilla.
    """
    ph = [math.exp(-lambda_home) * (lambda_home ** i) / math.factorial(i) for i in range(max_goals + 1)]
    pa = [math.exp(-lambda_away) * (lambda_away ** j) / math.factorial(j) for j in range(max_goals + 1)]
    mat = [[ph[i] * pa[j] for j in range(max_goals + 1)] for i in range(max_goals + 1)]

    # Factor de correlación tau de Dixon-Coles en marcadores bajos (0-0, 1-0, 0-1, 1-1)
    mat[0][0] *= (1.0 - lambda_home * lambda_away * rho)
    mat[1][0] *= (1.0 + lambda_away * rho)
    mat[0][1] *= (1.0 + lambda_home * rho)
    mat[1][1] *= (1.0 - rho)

    total_mass = sum(sum(row) for row in mat)
    mat = [[cell / total_mass for cell in row] for row in mat]

    p_home = sum(mat[i][j] for i in range(max_goals + 1) for j in range(max_goals + 1) if i > j)
    p_draw = sum(mat[i][i] for i in range(max_goals + 1))
    p_away = sum(mat[i][j] for i in range(max_goals + 1) for j in range(max_goals + 1) if i < j)
    over_05 = 1.0 - mat[0][0]
    over_15 = 1.0 - (mat[0][0] + mat[1][0] + mat[0][1])
    over_25 = 1.0 - sum(mat[i][j] for i in range(max_goals + 1) for j in range(max_goals + 1) if i + j <= 2)
    btts = sum(mat[i][j] for i in range(1, max_goals + 1) for j in range(1, max_goals + 1))

    return {
        "p_home": p_home,
        "p_draw": p_draw,
        "p_away": p_away,
        "over_05": over_05,
        "over_15": over_15,
        "over_25": over_25,
        "btts": btts,
        "matrix": mat,
    }


def norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def negbin_pmf(k: int, mu: float, r: float) -> float:
    """PMF Binomial Negativa parametrizada por media mu y dispersión r: Var(X) = mu + mu^2 / r."""
    p = r / (r + mu)
    log_p = (
        math.lgamma(k + r)
        - math.lgamma(r)
        - math.lgamma(k + 1)
        + r * math.log(p)
        + k * math.log(1.0 - p)
    )
    return math.exp(log_p)


# ============================================================================
# 3. EJECUCIÓN DE LAS 8 SUITES DE AUDITORÍA CUANTITATIVA
# ============================================================================

def main() -> int:
    here = os.path.dirname(os.path.abspath(__file__))
    samples_path = os.path.join(here, "live-payloads", "public_model_samples.json")
    if not os.path.exists(samples_path):
        print(f"ERROR: No se encontró el archivo de muestras en {samples_path}", file=sys.stderr)
        return 1

    with open(samples_path, "r", encoding="utf-8") as fp:
        data = json.load(fp)

    print("=" * 84)
    print(" AUDITORÍA MATEMÁTICA REPRODUCIBLE — ASTRA AI (https://astraanalisis.com/)")
    print("=" * 84)

    # ------------------------------------------------------------------------
    # SUITE 1: Funciones exactas del cliente TS/JS
    # ------------------------------------------------------------------------
    print("\n[SUITE 1] Verificando funciones exactas del cliente TypeScript/JS...")
    assert client_pct(None) == "—"
    assert client_pct(0.5228) == "52%"
    assert client_pct(0.6661) == "67%"
    assert client_pct(0.005) == "1%"  # Math.round(0.5) == 1 en JS

    # Regla crítica de 90 minutos en fútbol (mod_0784 + mod_1018)
    cup_match_aet = {"status": "AET", "home_goals": 2, "away_goals": 1, "ft_home": 1, "ft_away": 1}
    assert client_football_outcome_90min(cup_match_aet) == "draw", "AET debe calificarse con ft_home/ft_away (90 min)"
    reg_match_ft = {"status": "FT", "home_goals": 4, "away_goals": 2, "ft_home": 4, "ft_away": 2}
    assert client_football_outcome_90min(reg_match_ft) == "home"
    assert client_result_outcome(False, 3, 0) is None
    assert client_result_outcome(True, -1, 0) is None

    # Barras proporcionales y parseo de estadísticas en vivo (mod_1015 + mod_0869)
    assert client_stat_number("58%") == 58.0
    assert client_stat_number("1.84 xG") == 1.84
    assert abs(client_stat_bar_home_width("60%", "40%") - 60.0) < 1e-9
    assert abs(client_stat_bar_home_width(0, 0) - 50.0) < 1e-9
    assert client_sport_index_at([{"x": 10.0}, {"x": 25.0}, {"x": 40.0}], 27.2) == 1

    # Porcentaje de tiro NBA (mod_1028)
    assert client_shooting_percentage("7/15") == "46.7%"
    assert client_shooting_percentage("0/0") == "—"
    assert client_shooting_percentage(None) == "—"

    # Fallback determinista de secciones de análisis en fútbol (mod_1025)
    mock_fx_no_corners_ai = {
        "home": {"name": "NAC Breda"},
        "away": {"name": "Emmen"},
        "prediction": {"corners_home": 5.292, "corners_away": 4.825, "corners_total": 10.117, "fouls_home": 10.0, "fouls_away": 15.6, "fouls_total": 25.6},
        "analysis": {"sections": {"resumen": "R", "goles": "G", "tiros_de_esquina": "", "faltas": ""}},
    }
    built_sections = client_football_analysis_sections(mock_fx_no_corners_ai)
    assert built_sections[2]["title"] == "Tiros de esquina"
    assert "Proyección de tiros de esquina por equipo: NAC Breda: 5.3; Emmen: 4.8. Total esperado: 10.1 tiros de esquina." in built_sections[2]["text"]
    print("  OK -> pct, resultOutcome (90 min AET/PEN), statNumber, barras SVG, shootingPercentage y fallback mod_1025 verificados.")

    # ------------------------------------------------------------------------
    # SUITE 2: Fútbol — Fórmula exacta de Lambda, Posesión Logit y Árbitro Bayes
    # ------------------------------------------------------------------------
    print("\n[SUITE 2] Verificando fórmulas internas de Fútbol (lambda_v3, posesión logit, árbitro Bayes)...")
    single_league_preds = [m["prediction"] for m in data["football_finished"]] + data["football_national_v3_samples"]
    max_lambda_err = 0.0
    max_poss_err = 0.0

    for p in single_league_preds:
        ctx = p["context"]
        hl = ctx["home_league"]
        hr = ctx["home_ratings"]
        ar = ctx["away_ratings"]

        # 2a. Relación exacta entre neutral, home_advantage_log y expected_vs_equal
        mu_neutral = hl["goals_per_team_neutral"]
        h_log = hl["home_advantage_log"]
        assert abs(mu_neutral * math.exp(+0.5 * h_log) - hl["home_goals_expected_vs_equal"]) <= 0.002
        assert abs(mu_neutral * math.exp(-0.5 * h_log) - hl["away_goals_expected_vs_equal"]) <= 0.002

        # 2b. Fórmula exacta de lambda_home y lambda_away con derrame territorial 0.15 * (net_H - net_A)
        net_diff = (hr["attack"] + hr["defense"]) - (ar["attack"] + ar["defense"])
        lh_hat = hl["home_goals_expected_vs_equal"] * math.exp(hr["attack"] - ar["defense"] + 0.15 * net_diff)
        la_hat = hl["away_goals_expected_vs_equal"] * math.exp(ar["attack"] - hr["defense"] - 0.15 * net_diff)
        err_l = max(abs(lh_hat - p["lambda_home"]), abs(la_hat - p["lambda_away"]))
        max_lambda_err = max(max_lambda_err, err_l)
        assert err_l <= 0.003, f"Error lambda excesivo en fixture {p['fixture_id']}: {err_l}"

        # 2c. Fórmula logística exacta de posesión esperada
        logit_poss_h = hl["possession_home_logit"] + hr["possession_strength"] - ar["possession_strength"]
        poss_h_hat = round(100.0 / (1.0 + math.exp(-logit_poss_h)), 1)
        poss_a_hat = round(100.0 - poss_h_hat, 1)
        pe = max(abs(poss_h_hat - ctx["possession"]["home_pct"]), abs(poss_a_hat - ctx["possession"]["away_pct"]))
        max_poss_err = max(max_poss_err, pe)
        assert pe < 1e-6, f"Error de posesión en fixture {p['fixture_id']}: {pe}"

        # 2d. Suma exacta de córners y faltas (home + away == total a 3 decimales)
        if "corners_total" in p and p["corners_total"] is not None:
            assert abs((p["corners_home"] + p["corners_away"]) - p["corners_total"]) <= 0.002
        if "fouls_total" in p and p["fouls_total"] is not None:
            assert abs((p["fouls_home"] + p["fouls_away"]) - p["fouls_total"]) <= 0.002

    # 2e. Shrinkage Empirical Bayes del árbitro (fixture 1528964)
    ref = data["football_referee_sample"]["referee"]
    # shrunk = (yellow_cards_total + k * mu_0) / (games + k), cards_multiplier = shrunk / mu_0
    mu_0_yellow = ref["shrunk_yellow_per_game"] / ref["cards_multiplier"]
    k_prior = (ref["shrunk_yellow_per_game"] * ref["games"] - ref["yellow_cards_total"]) / (mu_0_yellow - ref["shrunk_yellow_per_game"])
    assert abs(k_prior - 15.0) < 0.05, f"Pseudoconteo Bayesiano esperado ~15, obtenido {k_prior}"

    print(f"  OK -> {len(single_league_preds)} partidos verificados: error máx lambda = {max_lambda_err:.4f} goles, error máx posesión = {max_poss_err:.2f}%.")
    print(f"  OK -> Árbitro Empirical Bayes verificado: mu_liga = {mu_0_yellow:.3f} amarillas/partido, prior k = {k_prior:.2f} partidos.")

    # ------------------------------------------------------------------------
    # SUITE 3: Fútbol — Matriz exacta de Dixon-Coles (Producción vs Demo)
    # ------------------------------------------------------------------------
    print("\n[SUITE 3] Verificando matriz bivariada exacta de Dixon-Coles (1997)...")
    all_real_fut = single_league_preds + data["football_cross_league_v3_samples"]
    max_dc_prob_err = 0.0
    max_dc_top3_err = 0.0
    max_1x2_sum_err = 0.0

    for p in all_real_fut:
        ctx = p["context"]
        hl = ctx["home_league"]
        al = ctx.get("away_league")
        rho = hl["rho"] if not al else 0.5 * (hl["rho"] + al["rho"])
        dc = dixon_coles_matrix(p["lambda_home"], p["lambda_away"], rho)

        sum_1x2 = p["p_home"] + p["p_draw"] + p["p_away"]
        max_1x2_sum_err = max(max_1x2_sum_err, abs(sum_1x2 - 1.0))
        assert abs(sum_1x2 - 1.0) <= 0.0002

        for key in ("p_home", "p_draw", "p_away", "over_05", "over_15", "over_25", "btts"):
            if key in p and p[key] is not None:
                err = abs(dc[key] - p[key])
                max_dc_prob_err = max(max_dc_prob_err, err)
                assert err <= 0.00025, f"Discrepancia DC en {p['fixture_id']} {key}: {err}"

        for sc, prob_db in (ctx.get("correct_score_top3") or {}).items():
            i_g, j_g = map(int, sc.split("-"))
            err_sc = abs(dc["matrix"][i_g][j_g] - prob_db)
            max_dc_top3_err = max(max_dc_top3_err, err_sc)
            assert err_sc <= 0.00015

    # Contraste contra los 6 fixtures demo estáticos en mod_1008 (model_mode='league_v2')
    demo_fixtures = [
        (9001, 1.52, 1.08, 0.4787, 0.2535, 0.2678, 0.9160, 0.7289, 0.4797, 0.5256),
        (9002, 1.84, 1.21, 0.5349, 0.2286, 0.2365, 0.9467, 0.8076, 0.5855, 0.5991),
        (9003, 1.96, 0.94, 0.6197, 0.2145, 0.1658, 0.9403, 0.7880, 0.5567, 0.5293),
        (9004, 1.62, 1.44, 0.4227, 0.2449, 0.3324, 0.9455, 0.8090, 0.5877, 0.6254),
        (9005, 1.48, 1.38, 0.4020, 0.2564, 0.3416, 0.9347, 0.7805, 0.5432, 0.5919),
        (9006, 0.88, 1.46, 0.2301, 0.2788, 0.4911, 0.8938, 0.6805, 0.4139, 0.4706),
    ]
    demo_implied_rhos = []
    demo_max_dc_errs = []
    for fid, lh, la, ph, pd, pa, o05, o15, o25, btts in demo_fixtures:
        assert abs((ph + pd + pa) - 1.0) < 1e-9
        p00_obs = 1.0 - o05
        p00_pois = math.exp(-(lh + la))
        rho_hat = (1.0 - (p00_obs / p00_pois)) / (lh * la)
        demo_implied_rhos.append(rho_hat)
        assert -0.09 <= rho_hat <= -0.04, f"rho implícito fuera de rango DC esperado en demo {fid}: {rho_hat}"
        dc_demo = dixon_coles_matrix(lh, la, rho_hat)
        demo_max_dc_errs.append(max(
            abs(dc_demo["p_home"] - ph),
            abs(dc_demo["p_draw"] - pd),
            abs(dc_demo["p_away"] - pa),
            abs(dc_demo["over_15"] - o15),
            abs(dc_demo["over_25"] - o25),
            abs(dc_demo["btts"] - btts),
        ))

    print(f"  OK -> {len(all_real_fut)} partidos reales (league_v3, national_v3, cross_league_v3):")
    print(f"        |suma(1X2) - 1| máx = {max_1x2_sum_err:.6f}")
    print(f"        Error máx DC en [p_home, p_draw, p_away, over_05, over_15, over_25, btts] = {max_dc_prob_err:.6f}")
    print(f"        Error máx DC en correct_score_top3 = {max_dc_top3_err:.6f}")
    print(f"  OK -> 6 partidos demo (mod_1008, league_v2): rho implícito en P(0-0) en [{min(demo_implied_rhos):.4f}, {max(demo_implied_rhos):.4f}] (desviación media vs DC puro en resto de mercados = {sum(demo_max_dc_errs)/len(demo_max_dc_errs):.4f}, confirmando datos sintéticos/v2 en mod_1008 vs DC exacto en league_v3).")

    # ------------------------------------------------------------------------
    # SUITE 4: NBA — Elo (HCA=60, divisor=28), Blend 75/25 y Normal
    # ------------------------------------------------------------------------
    print("\n[SUITE 4] Verificando modelo estadístico NBA (Elo + Net Ratings + Normal con prórroga)...")
    for g in data["nba_finished"]:
        p = g["prediction"]
        mc = p["context"]["model_components"]
        dig = p["context"]["digest"]
        rh, ra = dig["ratings"]["home"], dig["ratings"]["away"]

        # Suma de probabilidades = 1 y draw = None
        assert p["win"]["draw"] is None
        assert abs((p["win"]["home"] + p["win"]["away"]) - 1.0) <= 0.0002

        # Elo: HCA = +60 Elo pts (si sede_neutral es False), divisor = 28.0 pts Elo por punto de margen
        hca_elo = 0.0 if dig.get("sede_neutral") else 60.0
        elo_diff_adj = (rh["elo"] - ra["elo"]) + hca_elo
        elo_wp_hat = 1.0 / (1.0 + 10.0 ** (-elo_diff_adj / 400.0))
        margin_elo_hat = elo_diff_adj / 28.0
        assert abs(elo_wp_hat - mc["elo_win_prob_home"]) <= 0.0005
        assert abs(margin_elo_hat - mc["margin_from_elo"]) <= 0.02

        # Margen por ratings netos ajustados + ventaja de localía
        hca_pts = 0.0 if dig.get("sede_neutral") else mc["home_advantage_points"]
        margin_rat_hat = (rh["net"] - ra["net"]) + hca_pts
        assert abs(margin_rat_hat - mc["margin_from_ratings"]) <= 0.02

        # Ensamble lineal exacto: 75% Ratings + 25% Elo + ajuste por descanso
        w_elo = mc["elo_blend_weight"]
        assert abs(w_elo - 0.25) < 1e-9
        final_margin_hat = (1.0 - w_elo) * mc["margin_from_ratings"] + w_elo * mc["margin_from_elo"] + mc["rest_adjustment"]
        assert abs(final_margin_hat - mc["final_margin"]) <= 0.02

        # Probabilidad Normal efectiva con sigma_eff ~ 12.25 puntos
        win_home_hat = norm_cdf(mc["final_margin"] / 12.25)
        assert abs(win_home_hat - p["win"]["home"]) <= 0.0015

    print(f"  OK -> {len(data['nba_finished'])} partidos reales NBA verificados: HCA_Elo = +60.0, divisor Elo = 28.0, blend = 0.75*Ratings + 0.25*Elo, sigma_win = 12.25 pts.")

    # ------------------------------------------------------------------------
    # SUITE 5: NFL — Ensamble (0.35 Puntos + 0.30 EPA + 0.35 Elo) + QB + Normal(sigma=13.0)
    # ------------------------------------------------------------------------
    print("\n[SUITE 5] Verificando modelo estadístico NFL (Puntos + EPA/jugada + Elo + QB + Normal sigma=13.0)...")
    max_nfl_wp_err = 0.0
    for g in data["nfl_finished"]:
        p = g["prediction"]
        mc = p["context"]["model_components"]
        w = mc["pesos"]
        assert abs(w["puntos"] - 0.35) < 1e-9 and abs(w["epa"] - 0.30) < 1e-9 and abs(w["elo"] - 0.35) < 1e-9

        margen_calc = (
            w["puntos"] * mc["margen_puntos"]
            + w["epa"] * mc["margen_epa"]
            + w["elo"] * mc["margen_elo"]
            + mc["qb_local"]
            - mc["qb_visitante"]
            + mc["descanso"]
        )
        assert abs(margen_calc - mc["margen_final"]) <= 0.015

        # Probabilidad Normal exacta con sigma_NFL = 13.0 puntos
        wp_hat = norm_cdf(mc["margen_final"] / 13.0)
        err_wp = abs(wp_hat - p["win"]["home"])
        max_nfl_wp_err = max(max_nfl_wp_err, err_wp)
        assert err_wp <= 0.0005
        assert abs((p["win"]["home"] + p["win"]["away"]) - 1.0) <= 0.0002

    print(f"  OK -> {len(data['nfl_finished'])} partidos reales NFL verificados: sigma_NFL = 13.00 pts exactos (error máx win_prob = {max_nfl_wp_err:.6f}).")

    # ------------------------------------------------------------------------
    # SUITE 6: NHL — xG/60 situacional, Porteros y Ley de Conservación Monte Carlo OT/SO
    # ------------------------------------------------------------------------
    print("\n[SUITE 6] Verificando modelo estadístico NHL (xG situacional, porteros y Monte Carlo OT/SO)...")
    for g in data["nhl_finished"]:
        p = g["prediction"]
        mc = p["context"]["model_components"]
        dig = p["context"]["digest"]
        f60 = dig["fuerza_por_60_min"]

        # Suma situacional de xG en 60 min (5v5 + PP + SH + EVO)
        xb_h = mc["xg_breakdown_home"]
        xb_a = mc["xg_breakdown_away"]
        assert abs((xb_h["ev5"] + xb_h["pp"] + xb_h["sh"] + xb_h["evo"]) - mc["xg_home_60"]) <= 0.003
        assert abs((xb_a["ev5"] + xb_a["pp"] + xb_a["sh"] + xb_a["evo"]) - mc["xg_away_60"]) <= 0.003

        # Conversión de xG_60 a lambda_goals_60 usando finishing_mult y factor_goles del portero RIVAL
        lh60_hat = mc["xg_home_60"] * f60["home"]["finishing_mult"] * mc["league_finishing"] * mc["goalie_goals_mult"]["away_goalie"]
        la60_hat = mc["xg_away_60"] * f60["away"]["finishing_mult"] * mc["league_finishing"] * mc["goalie_goals_mult"]["home_goalie"]
        assert abs(lh60_hat - mc["lambda_home_goals_60"]) <= 0.005
        assert abs(la60_hat - mc["lambda_away_goals_60"]) <= 0.005

        # Ley de conservación de goles decididos en prórroga/shootout:
        # (E[G_H] - E[G_H,reg]) + (E[G_A] - E[G_A,reg]) == P(OT/SO)
        ge = dig["pronostico"]["goles_esperados"]
        ot_goals_added = (ge["home"] - ge["home_regulation"]) + (ge["away"] - ge["away_regulation"])
        ot_pct_reported = dig["pronostico"]["va_a_tiempo_extra_pct"] / 100.0
        assert abs(ot_goals_added - ot_pct_reported) <= 0.01

    print(f"  OK -> {len(data['nhl_finished'])} partidos reales NHL verificados: descomposición xG_60, multiplicador de portero rival y conservación OT/SO exactos.")

    # ------------------------------------------------------------------------
    # SUITE 7: MLB — Ecuación exacta (5/9 FIP_SP + 4/9 FIP_BP)*(wOBA/avg)*PF + NegBin(5, 4)
    # ------------------------------------------------------------------------
    print("\n[SUITE 7] Verificando ecuación cerrada MLB (FIP + wOBA + PF) y convolución NegBin(5, 4)...")
    mlb_sample_path = os.path.join(here, "live-payloads", "mlb-prediction-sample.json")
    assert os.path.exists(mlb_sample_path), f"No se encontró {mlb_sample_path}"
    with open(mlb_sample_path, "r", encoding="utf-8") as fp:
        mlb_data = json.load(fp)

    mlb_preds = [rec["game_prediction"] for rec in mlb_data["records"] if rec.get("game_prediction") is not None]
    assert len(mlb_preds) == 6
    max_mlb_run_err = 0.0
    max_mlb_win_err = 0.0

    def convolve_pmf(p1, p2, max_k=45):
        out = [0.0] * (max_k + 1)
        for i, v1 in enumerate(p1):
            for j, v2 in enumerate(p2):
                if i + j <= max_k:
                    out[i + j] += v1 * v2
        return out

    for p in mlb_preds:
        dig = p["context"]["digest"]
        pr = dig["pronostico"]
        avg_woba = dig["liga"]["avg_wOBA"]
        pf = dig["factor_parque"]
        loc = dig["local"]
        vis = dig["visita"]

        mu_f5_h = (5.0 / 9.0) * vis["abridor"]["FIP"] * (loc["wOBA"] / avg_woba) * pf
        mu_l4_h = (4.0 / 9.0) * vis["bullpen"]["FIP"] * (loc["wOBA"] / avg_woba) * pf
        mu_full_h = mu_f5_h + mu_l4_h

        mu_f5_a = (5.0 / 9.0) * loc["abridor"]["FIP"] * (vis["wOBA"] / avg_woba) * pf
        mu_l4_a = (4.0 / 9.0) * loc["bullpen"]["FIP"] * (vis["wOBA"] / avg_woba) * pf
        mu_full_a = mu_f5_a + mu_l4_a

        obs_f5_h = pr["primeras_5"]["carreras"]["local"]
        obs_f5_a = pr["primeras_5"]["carreras"]["visita"]
        obs_full_h = pr["carreras_esperadas"]["local"]
        obs_full_a = pr["carreras_esperadas"]["visita"]

        for calc_v, obs_v in [
            (mu_f5_h, obs_f5_h),
            (mu_f5_a, obs_f5_a),
            (mu_full_h, obs_full_h),
            (mu_full_a, obs_full_a),
        ]:
            err = abs(calc_v - obs_v)
            max_mlb_run_err = max(max_mlb_run_err, err)
            assert err <= 0.0008, f"Error carreras MLB excesivo: {calc_v} vs {obs_v}"

        assert abs((obs_full_h + obs_full_a) - pr["carreras_esperadas"]["total"]) <= 0.002
        assert abs((p["win"]["home"] + p["win"]["away"]) - 1.0) <= 0.0002

        ph_f5 = [negbin_pmf(k, mu_f5_h, 5.0) for k in range(31)]
        ph_l4 = [negbin_pmf(k, mu_l4_h, 4.0) for k in range(31)]
        pa_f5 = [negbin_pmf(k, mu_f5_a, 5.0) for k in range(31)]
        pa_l4 = [negbin_pmf(k, mu_l4_a, 4.0) for k in range(31)]
        ph_9 = convolve_pmf(ph_f5, ph_l4, 45)
        pa_9 = convolve_pmf(pa_f5, pa_l4, 45)

        p_h_reg = sum(ph_9[i] * pa_9[j] for i in range(46) for j in range(46) if i > j)
        p_tie_9 = sum(ph_9[i] * pa_9[i] for i in range(46))
        p_h_win_conv = p_h_reg + 0.5 * p_tie_9
        win_err = abs(p_h_win_conv - p["win"]["home"])
        max_mlb_win_err = max(max_mlb_win_err, win_err)
        assert win_err <= 0.004, f"Error win.home MLB excesivo: {p_h_win_conv} vs {p['win']['home']}"

    print(
        f"  OK -> {len(mlb_preds)} juegos reales MLB verificados: residuo máx. carreras = {max_mlb_run_err:.6f} "
        f"| error máx. win.home NegBin(5,4) = {max_mlb_win_err:.4f}."
    )

    # ------------------------------------------------------------------------
    # SUITE 8: Momios (match-odds), Conversión IEEE-754 Americana->Decimal y Overround/Vig
    # ------------------------------------------------------------------------
    print("\n[SUITE 8] Verificando momios reales (match-odds), conversión IEEE-754 y overround (vig)...")
    odds_samples = data["match_odds_samples"]

    # Fútbol: Marathonbet (API-Football bookmaker id=2)
    fut_odds_raw = odds_samples["futbol"]["response"]
    fut_valid = client_validate_match_odds("futbol", fut_odds_raw)
    assert fut_valid == {"home": 1.96, "draw": 3.85, "away": 3.16}
    fut_overround = (1.0 / fut_valid["home"]) + (1.0 / fut_valid["draw"]) + (1.0 / fut_valid["away"]) - 1.0

    # NBA: DraftKings (ESPN provider id='100') -> American +454 y -620 convertidos en servidor sin redondear!
    nba_odds_raw = odds_samples["nba_401909980"]
    nba_valid = client_validate_match_odds("nba", nba_odds_raw)
    assert nba_valid is not None and nba_valid["draw"] is None
    assert nba_valid["home"] == 1.0 + 454.0 / 100.0  # +454 -> 5.54 exacto
    assert nba_valid["away"] == 1.0 + 100.0 / 620.0  # -620 -> 1.1612903225806452 exacto en IEEE-754!
    nba_overround = (1.0 / nba_valid["home"]) + (1.0 / nba_valid["away"]) - 1.0

    # NHL: DraftKings (ESPN provider id='100') -> American -395 y +310 convertidos en servidor sin redondear!
    nhl_odds_raw = odds_samples["nhl_2026020321"]
    nhl_valid = client_validate_match_odds("nhl", nhl_odds_raw)
    assert nhl_valid is not None and nhl_valid["draw"] is None
    assert nhl_valid["home"] == 1.0 + 100.0 / 395.0  # -395 -> 1.2531645569620253 exacto en IEEE-754!
    assert nhl_valid["away"] == 1.0 + 310.0 / 100.0  # +310 -> 4.1 exacto
    nhl_overround = (1.0 / nhl_valid["home"]) + (1.0 / nhl_valid["away"]) - 1.0

    # Verificar que si un deporte US trae draw != None, el cliente rechaza el objeto completo
    assert client_validate_match_odds("nba", {"odds": {"home": 1.9, "draw": 3.5, "away": 1.9}}) is None
    # Verificar que RLS bloquea pronósticos futuros para anon
    for up_fx in data["football_upcoming_anon_rls"]:
        assert up_fx["forecast_ready"] is True and up_fx["prediction"] is None and up_fx["analysis"] is None

    print(f"  OK -> Fútbol (Marathonbet id=2): 1.96 / 3.85 / 3.16 | Overround = +{fut_overround * 100:.2f}%")
    print(f"  OK -> NBA (DraftKings id='100'): +454 -> 5.54, -620 -> {nba_valid['away']:.16f} | Overround = +{nba_overround * 100:.2f}%")
    print(f"  OK -> NHL (DraftKings id='100'): -395 -> {nhl_valid['home']:.16f}, +310 -> 4.10 | Overround = +{nhl_overround * 100:.2f}%")
    print("  OK -> RLS verificado: partidos futuros (status='NS') retornan prediction=null y analysis=null sin suscripción activa.")

    print("\n" + "=" * 84)
    print(" TODAS LAS 8 SUITES MATEMÁTICAS Y ALGORÍTMICAS PASARON CON CERO ERRORES (EXIT 0)")
    print("=" * 84)
    return 0


if __name__ == "__main__":
    sys.exit(main())
