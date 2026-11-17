#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Verificador Matemático y Auditor Empírico de Motores — Scout Picks (scoutpicks.app)
===================================================================================

Valida de forma determinista y reproducible todas las ecuaciones reconstruidas
del backend (`https://api.scoutpicks.aertech-labs.com`) y del cliente web SPA
(`index-BZ3_gLK3.js`, 3,361,584 bytes) contra los payloads reales capturados en:
  `Reportes/scoutpicks/evidence/live-payloads/`

Evidencia REA asociada:
  - ev_03f837b1e4aec03bcac8791498a5d2cbbd06e25f39474bde43e541baa4acff52 (HAR API)
  - ev_8d1fa2225983ff98a4c350ad528895985cc9cdd8f4efab6f7eceda9da4dc30cd (HAR completo)
  - ev_abdb3cf1dbd8a7aab2a952ca236449585bd2de775d8200297a3b94e836220fb3 (Bundle SPA)
  - ev_7aae1b8faebfaae85bd8513669e557fd705e9a7b85ff530e366823d93f7910d4 (Manifest API)

Uso desde la raíz del repositorio:
  python Reportes/scoutpicks/evidence/verify_scoutpicks_math.py

Higiene forense: CERO PII, CERO credenciales, rutas 100% relativas al repositorio.
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


# ============================================================================
# 1. PRIMITIVAS ARITMÉTICAS EXACTAS DE V8 / JAVASCRIPT (IEEE 754)
# ============================================================================

def v8_round(x: float) -> int:
    """Reproduce `Math.round(x)` de JavaScript V8 (`Math.floor(x + 0.5)`)."""
    return int(math.floor(x + 0.5))


def v8_round2(x: float) -> float:
    """Reproduce `Math.round(x * 100) / 100` en punto flotante IEEE 754."""
    return math.floor(x * 100.0 + 0.5) / 100.0


def clamp(x: float, lo: float, hi: float) -> float:
    """Reproduce `L1(e, t, r) = Math.min(r, Math.max(t, e))` en el bundle."""
    return min(hi, max(lo, x))


# ============================================================================
# 2. ECUACIONES RECONSTRUIDAS DEL CLIENTE (`index-BZ3_gLK3.js`)
# ============================================================================

def client_US_edge(hit_rate: Optional[float], odds_value: Optional[float]) -> Optional[float]:
    """
    [OBSERVADO] `function US(e)` en `index-BZ3_gLK3.js` (@2565062):
      const t = e.hitRate, r = e.oddsValue;
      return t == null || r == null || r <= 0 ? null : t - 100 / r;
    """
    if hit_rate is None or odds_value is None or odds_value <= 0:
        return None
    return hit_rate - (100.0 / odds_value)


def client_Yte_badge_edge(headline_hit_rate: Optional[float], odds_value: Optional[float]) -> Optional[int]:
    """
    [OBSERVADO] `function Yte(e)` con `const IAe = 1` en `index-BZ3_gLK3.js` (@1262723):
      const a = 100 / r, n = Math.round(t - a);
      return n >= 1 ? n : null;
    """
    if headline_hit_rate is None or odds_value is None or odds_value <= 0:
        return None
    n = v8_round(headline_hit_rate - (100.0 / odds_value))
    return n if n >= 1 else None


def client_Lz_lineup_rank(expected_lineup_status: Optional[str]) -> int:
    """
    [OBSERVADO] `Pfe = { starter: 0, doubt: 1, bench: 2 }; function Lz(e)` (@121163).
    """
    mapping = {"starter": 0, "doubt": 1, "bench": 2}
    if expected_lineup_status in mapping:
        return mapping[expected_lineup_status]
    return 0


def shared_Afe_odds_curve(odds_value: Optional[float]) -> float:
    """
    [OBSERVADO] `function Afe(e)` en `index-BZ3_gLK3.js` (@121163):
      Vk=1.35, Wk=2, XN=60, Cfe=35, Nfe=4
      - e <= 1: 0
      - 1 < e < 1.35: ((e - 1) / 0.35) * 35  [rampa lineal 0 -> 35, salto discontinuo a 100 en 1.35]
      - 1.35 <= e <= 2.0: 100 - ((e - 1.35) / 0.65) * 40  [100 -> 60]
      - 2.0 < e < 4.0: clamp(60 * (1 - (e - 2.0) / 2.0), 0, 60)  [60 -> 0]
      - e >= 4.0: 0
    """
    if odds_value is None or not isinstance(odds_value, (int, float)) or not math.isfinite(odds_value) or odds_value <= 1.0:
        return 0.0
    if odds_value < 1.35:
        return (odds_value - 1.0) / (1.35 - 1.0) * 35.0
    if odds_value <= 2.0:
        return 100.0 - (odds_value - 1.35) / (2.0 - 1.35) * (100.0 - 60.0)
    t = (odds_value - 2.0) / (4.0 - 2.0)
    return clamp(60.0 * (1.0 - t), 0.0, 60.0)


def client_Mfe_score(odds_value: Optional[float], edge_percentage: Optional[float], confidence: Optional[float]) -> float:
    """
    [OBSERVADO] `function Mfe(e)` en `index-BZ3_gLK3.js` (@121581):
      Gk = { odds: 0.4, relevance: 0.3, edge: 0.2, confidence: 0.1 }, Efe = 225, Tfe = 25
      En el bundle cliente `r = L1(0 / Efe, 0, 1) * 100` está plegado a 0, dejando techo = 70.0.
    """
    t = shared_Afe_odds_curve(odds_value)
    r = clamp(0.0 / 225.0, 0.0, 1.0) * 100.0
    a = clamp((edge_percentage or 0.0) / 25.0, 0.0, 1.0) * 100.0
    n = clamp(confidence or 0.0, 0.0, 100.0)
    return t * 0.4 + r * 0.3 + a * 0.2 + n * 0.1


def server_Mfe_score(odds_value: Optional[float], relevance_score: Optional[float], edge_percentage: Optional[float], confidence: Optional[float]) -> float:
    """
    [RECONSTRUIDO] Función homóloga de servidor `@scoutpicks/shared` donde `relevanceScore`
    sí se inyecta (`r = clamp(relevanceScore / 225, 0, 1) * 100`), con techo = 100.0.
    """
    t = shared_Afe_odds_curve(odds_value)
    r = clamp((relevance_score or 0.0) / 225.0, 0.0, 1.0) * 100.0
    a = clamp((edge_percentage or 0.0) / 25.0, 0.0, 1.0) * 100.0
    n = clamp(confidence or 0.0, 0.0, 100.0)
    return t * 0.4 + r * 0.3 + a * 0.2 + n * 0.1


def client_tbe_american(decimal_odds: float) -> str:
    """
    [OBSERVADO] `function tbe(e)` en `index-BZ3_gLK3.js` (@709085):
      return e >= 2 ? `+${Math.round((e - 1) * 100)}` : String(Math.round(-100 / (e - 1)));
    """
    if decimal_odds >= 2.0:
        return f"+{v8_round((decimal_odds - 1.0) * 100.0)}"
    return str(v8_round(-100.0 / (decimal_odds - 1.0)))


def client_hI_format_odds(decimal_odds: Optional[float], fmt: str = "decimal") -> Optional[str]:
    """
    [OBSERVADO] `function hI(e, t)` en `index-BZ3_gLK3.js` (@709172).
    """
    if decimal_odds is None:
        return None
    if fmt == "american":
        if not math.isfinite(decimal_odds) or decimal_odds <= 1.0:
            return f"{decimal_odds:.2f}"
        return client_tbe_american(decimal_odds)
    return f"{decimal_odds:.2f}"


# ============================================================================
# 3. ECUACIONES RECONSTRUIDAS DEL SERVIDOR (`api.scoutpicks.aertech-labs.com`)
# ============================================================================

PLAYER_TEAM_PROP_TYPES = {
    "value_player_prop",
    "safe_player_prop",
    "consistent_player_prop",
    "value_team_prop",
    "safe_team_prop",
    "consistent_team_prop",
}

TOTALS_INSIGHT_TYPES = {
    "value_match_totals",
    "safe_match_totals",
    "value_period_totals",
    "safe_period_totals",
    "value_period_side_totals",
    "safe_period_side_totals",
}


def reconstruct_raw_hit_rate(insight: Dict[str, Any]) -> float:
    """
    [RECONSTRUIDO] Recupera el `hitRate` exacto en coma flotante previo al redondeo a 2 decimales.
    """
    hr = float(insight["hitRate"])
    ss = insight.get("sampleSize")
    hs = insight.get("headlineScope") or {}

    if hs.get("homeSampleSize") and hs.get("awaySampleSize") and hs.get("homeHits") is not None and hs.get("awayHits") is not None:
        h_ss = hs["homeSampleSize"] - (hs.get("homePushes") or 0)
        a_ss = hs["awaySampleSize"] - (hs.get("awayPushes") or 0)
        if h_ss + a_ss > 0:
            if hs.get("evidence") == "real_matches":
                cand = (hs["homeHits"] + hs["awayHits"]) / (h_ss + a_ss) * 100.0
            else:
                cand = ((hs["homeHits"] / h_ss) + (hs["awayHits"] / a_ss)) * 50.0
            if abs(v8_round2(cand) - hr) <= 0.02:
                return cand

    if ss and ss > 0:
        hits = round(hr * ss / 100.0)
        cand = (hits / ss) * 100.0
        if abs(v8_round2(cand) - hr) <= 0.02:
            return cand

    return hr


def server_value_rating(edge_percentage: float) -> str:
    """
    [RECONSTRUIDO] Clasificador escalonado exacto de `valueRating` en función de `edgePercentage`:
      - edgePercentage <= 0   -> "none"
      - 0 < edgePercentage < 8 -> "marginal"
      - 8 <= edgePercentage < 15 -> "moderate"
      - edgePercentage >= 15  -> "strong"
    """
    if edge_percentage <= 0.0:
        return "none"
    if edge_percentage < 8.0:
        return "marginal"
    if edge_percentage < 15.0:
        return "moderate"
    return "strong"


def server_confidence_predict(insight: Dict[str, Any], odds_for_calc: float) -> float:
    """
    [RECONSTRUIDO] Ecuación exacta multi-familia de `confidence` en el servidor, incluyendo
    sus dos bugs de implementación verificados empíricamente:
      1) En `player_prop` y `team_prop`:
         - `marginScore = clamp((average - line) / line, 0, 1) * 15` SIN invertir el signo
           cuando `direction == "under"` (bug de signo).
         - `edgeScore = clamp(rawEdge, -40, 20) * 1.25`.
         - Redondeo entero `v8_round(...)`.
      2) En `match_totals`, `period_totals`, `period_side_totals`:
         - `marginScore = clamp(abs(average - line) * 5, 0, 15)` usando `Math.abs` incluso
           si `average` está del lado perdedor de la línea (bug de valor absoluto).
         - `edgeScore = clamp(rawEdge, -40, 10) * 2.5`.
         - Redondeo a 2 decimales `v8_round2(...)`.
      3) En `match_result`, `period_result`, `btts`:
         - Ajuste estructural: `-5` para Doble Oportunidad (`home_draw`, `draw_away`, `home_away`),
           `+10` para `value_btts` de partido completo, `0` para 1X2 directo y `period_both_score`.
         - `edgeScore = clamp(rawEdge, -40, 10) * 2.5`.
         - Redondeo a 2 decimales `v8_round2(...)`.
    """
    raw_hr = reconstruct_raw_hit_rate(insight)
    raw_edge = raw_hr - (100.0 / odds_for_calc)
    ss = int(insight["sampleSize"])
    itype = insight["type"]
    avg = insight.get("average")
    line = insight.get("line")

    base_hr_ss = 0.4 * raw_hr + min(ss, 10) * 2.0

    if itype in PLAYER_TEAM_PROP_TYPES:
        m_ratio = ((avg - line) / line) if (line is not None and line > 0 and avg is not None) else 0.0
        margin_score = clamp(m_ratio, 0.0, 1.0) * 15.0
        edge_score = clamp(raw_edge, -40.0, 20.0) * 1.25
        return float(v8_round(base_hr_ss + margin_score + edge_score))

    if itype in TOTALS_INSIGHT_TYPES:
        margin_score = clamp(abs((avg or 0.0) - (line or 0.0)) * 5.0, 0.0, 15.0)
        edge_score = clamp(raw_edge, -40.0, 10.0) * 2.5
        return v8_round2(base_hr_ss + margin_score + edge_score)

    double_chance = {"home_draw", "draw_away", "home_away"}
    is_dc = (insight.get("direction") in double_chance) or (insight.get("selection") in double_chance)
    structural_adj = -5.0 if is_dc else (10.0 if itype == "value_btts" else 0.0)
    edge_score = clamp(raw_edge, -40.0, 10.0) * 2.5
    return v8_round2(base_hr_ss + structural_adj + edge_score)


# ============================================================================
# 4. RECOLECCIÓN Y AUDITORÍA SOBRE PAYLOADS REALES
# ============================================================================

EXCLUDED_PII_FILES = {
    "GET_auth_get-session.json",
    "GET_users_settings.json",
    "GET_subscriptions_me.json",
}


def collect_insights_from_obj(obj: Any, source_file: str, out: List[Tuple[str, Dict[str, Any]]]) -> None:
    if isinstance(obj, dict):
        if "hitRate" in obj and "expectedValue" in obj and "id" in obj and "oddsValue" in obj:
            out.append((source_file, obj))
        for k, v in obj.items():
            if k != "variants":
                collect_insights_from_obj(v, source_file, out)
    elif isinstance(obj, list):
        for item in obj:
            collect_insights_from_obj(item, source_file, out)


def audit_insights_corpus(payload_dir: Path) -> Dict[str, Any]:
    occurrences: List[Tuple[str, Dict[str, Any]]] = []
    per_file_counts: Dict[str, int] = {}

    for path in sorted(payload_dir.glob("*.json")):
        if path.name in EXCLUDED_PII_FILES:
            continue
        with path.open("r", encoding="utf-8") as fh:
            wrapped = json.load(fh)
        payload = wrapped.get("data", wrapped) if isinstance(wrapped, dict) else wrapped
        before = len(occurrences)
        collect_insights_from_obj(payload, path.name, occurrences)
        added = len(occurrences) - before
        if added > 0:
            per_file_counts[path.name] = added

    unique_by_id: Dict[str, Dict[str, Any]] = {}
    for _, ins in occurrences:
        unique_by_id.setdefault(ins["id"], ins)
    insights = list(unique_by_id.values())

    imp_deltas: List[float] = []
    edge_deltas_raw: List[float] = []
    edge_deltas_from_imp: List[float] = []
    ev_deltas_raw: List[float] = []
    variant_edge_deltas: List[float] = []
    avg_deltas: List[float] = []
    med_player_team_deltas: List[float] = []
    period_match_zero_median_anomalies = 0
    indiv_hit_rate_deltas: List[float] = []

    value_rating_matches = 0
    confidence_exact_primary = 0
    confidence_exact_with_bookmaker_freeze = 0
    confidence_unexplained: List[str] = []
    under_sign_bug_cases: List[Dict[str, Any]] = []
    abs_margin_bug_cases: List[Dict[str, Any]] = []

    legacy_fields = [
        "streak",
        "trend",
        "opponentRank",
        "opponentAvgConceded",
        "opponentLeagueAvg",
        "adjustedHitRate",
        "matchupScore",
        "matchupRating",
    ]
    legacy_non_null = {k: 0 for k in legacy_fields}
    v2_enrichment_counts = {
        "opponentMetricRank": 0,
        "substitutionPattern": 0,
        "stackedSnapshot": 0,
        "underdog": 0,
        "minMinutes_eq_45_on_players": 0,
        "player_insights_total": 0,
    }

    relevance_by_match: Dict[int, set] = defaultdict(set)
    client_vs_server_edge_badge_nulls = 0

    for ins in insights:
        hr = float(ins["hitRate"])
        raw_hr = reconstruct_raw_hit_rate(ins)
        odds = float(ins["oddsValue"])
        imp = float(ins["impliedProbability"])
        edge = float(ins["edgePercentage"])
        ev = float(ins["expectedValue"])

        # 1. impliedProbability, edgePercentage, expectedValue
        imp_pred = v8_round2(100.0 / odds)
        imp_deltas.append(abs(imp - imp_pred))

        edge_pred_raw = v8_round2(raw_hr - (100.0 / odds))
        edge_pred_imp = v8_round2(hr - imp)
        edge_deltas_raw.append(abs(edge - edge_pred_raw))
        edge_deltas_from_imp.append(abs(edge - edge_pred_imp))

        ev_pred = v8_round2((raw_hr / 100.0) * odds - 1.0)
        ev_deltas_raw.append(abs(ev - ev_pred))

        if client_Yte_badge_edge(hr, odds) is None:
            client_vs_server_edge_badge_nulls += 1

        # 2. variants[*].edge
        for var in ins.get("variants") or []:
            if var.get("edge") is not None and var.get("hitRate") is not None:
                v_edge_pred = v8_round2(float(var["hitRate"]) - imp)
                variant_edge_deltas.append(abs(float(var["edge"]) - v_edge_pred))

        # 3. valueRating
        if server_value_rating(edge) == ins["valueRating"]:
            value_rating_matches += 1

        # 4. recentValues / recentHits -> average, median, hitRate
        rv = ins.get("recentValues")
        rh = ins.get("recentHits")
        ss = int(ins["sampleSize"])
        if rv and len(rv) == ss and "result" not in ins["type"]:
            avg_pred = v8_round2(sum(rv) / len(rv))
            avg_deltas.append(abs(float(ins["average"]) - avg_pred))
            med_true = float(statistics.median(rv))
            if ins["type"] in PLAYER_TEAM_PROP_TYPES:
                med_player_team_deltas.append(abs(float(ins["median"]) - med_true))
            elif ins["median"] == 0 and med_true != 0.0:
                period_match_zero_median_anomalies += 1

        if rh and len(rh) == ss and "result" not in ins["type"]:
            hr_pred = v8_round2((sum(1 for h in rh if h) / len(rh)) * 100.0)
            indiv_hit_rate_deltas.append(abs(hr - hr_pred))

        # 5. Legacy fields vs v2 enrichments
        for lf in legacy_fields:
            if ins.get(lf) is not None:
                legacy_non_null[lf] += 1
        for vf in ("opponentMetricRank", "substitutionPattern", "stackedSnapshot", "underdog"):
            if ins.get(vf) is not None:
                v2_enrichment_counts[vf] += 1
        if ins.get("playerId") is not None:
            v2_enrichment_counts["player_insights_total"] += 1
            if ins.get("minMinutes") == 45:
                v2_enrichment_counts["minMinutes_eq_45_on_players"] += 1

        if ins.get("matchId") is not None and ins.get("relevanceScore") is not None:
            relevance_by_match[int(ins["matchId"])].add(float(ins["relevanceScore"]))

        # 6. Confidence exact check + bug detection
        tol = 0.0 if ins["type"] in PLAYER_TEAM_PROP_TYPES else 0.05
        pred_primary = server_confidence_predict(ins, odds)
        if abs(pred_primary - float(ins["confidence"])) <= tol:
            confidence_exact_primary += 1
            confidence_exact_with_bookmaker_freeze += 1
        else:
            book_quotes = [
                float(q["oddsValue"])
                for q in (ins.get("betting") or {}).get("bookmakerOdds") or []
                if q.get("oddsValue")
            ]
            if any(abs(server_confidence_predict(ins, bo) - float(ins["confidence"])) <= tol for bo in book_quotes):
                confidence_exact_with_bookmaker_freeze += 1
            else:
                confidence_unexplained.append(ins["id"])

        # Detect under-sign bug impact on player/team under props
        if ins["type"] in PLAYER_TEAM_PROP_TYPES and ins.get("direction") == "under" and ins.get("line") and ins.get("average") is not None:
            intended_margin = clamp((ins["line"] - ins["average"]) / ins["line"], 0.0, 1.0) * 15.0
            buggy_margin = clamp((ins["average"] - ins["line"]) / ins["line"], 0.0, 1.0) * 15.0
            if abs(intended_margin - buggy_margin) >= 1.0:
                under_sign_bug_cases.append({
                    "id": ins["id"],
                    "average": ins["average"],
                    "line": ins["line"],
                    "confidence_observed": ins["confidence"],
                    "buggy_margin_pts": round(buggy_margin, 2),
                    "intended_margin_pts": round(intended_margin, 2),
                })

        # Detect abs(avg - line) bug on totals where average is on the losing side of the line
        if ins["type"] in TOTALS_INSIGHT_TYPES and ins.get("line") is not None and ins.get("average") is not None:
            is_losing_avg = (ins.get("direction") == "over" and ins["average"] < ins["line"]) or (
                ins.get("direction") == "under" and ins["average"] > ins["line"]
            )
            if is_losing_avg and abs(ins["average"] - ins["line"]) > 0:
                abs_margin_bug_cases.append({
                    "id": ins["id"],
                    "direction": ins["direction"],
                    "average": ins["average"],
                    "line": ins["line"],
                    "confidence_observed": ins["confidence"],
                    "spurious_bonus_pts": round(clamp(abs(ins["average"] - ins["line"]) * 5.0, 0.0, 15.0), 2),
                })

    return {
        "files_with_insights": per_file_counts,
        "total_occurrences": len(occurrences),
        "unique_insights": len(insights),
        "total_variants_checked": len(variant_edge_deltas),
        "type_distribution": dict(sorted(Counter(i["type"] for i in insights).items())),
        "residuals": {
            "impliedProbability_vs_v8_round2_100_div_odds": {
                "n": len(imp_deltas),
                "max_abs_delta": max(imp_deltas) if imp_deltas else 0.0,
                "exact_zero_count": sum(1 for d in imp_deltas if d == 0.0),
            },
            "edgePercentage_vs_v8_round2_rawHitRate_minus_100_div_odds": {
                "n": len(edge_deltas_raw),
                "max_abs_delta": round(max(edge_deltas_raw), 6) if edge_deltas_raw else 0.0,
                "within_0_01_count": sum(1 for d in edge_deltas_raw if d <= 0.010001),
            },
            "edgePercentage_vs_v8_round2_hitRate_minus_impliedProb": {
                "n": len(edge_deltas_from_imp),
                "max_abs_delta": round(max(edge_deltas_from_imp), 6) if edge_deltas_from_imp else 0.0,
            },
            "variants_edge_vs_v8_round2_variantHitRate_minus_impliedProb": {
                "n": len(variant_edge_deltas),
                "max_abs_delta": round(max(variant_edge_deltas), 6) if variant_edge_deltas else 0.0,
                "within_0_01_count": sum(1 for d in variant_edge_deltas if d <= 0.010001),
            },
            "expectedValue_vs_v8_round2_rawHitRate_div_100_mul_odds_minus_1": {
                "n": len(ev_deltas_raw),
                "max_abs_delta": round(max(ev_deltas_raw), 6) if ev_deltas_raw else 0.0,
                "within_0_01_count": sum(1 for d in ev_deltas_raw if d <= 0.010001),
            },
            "average_vs_v8_round2_mean_recentValues": {
                "n": len(avg_deltas),
                "max_abs_delta": max(avg_deltas) if avg_deltas else 0.0,
            },
            "median_player_team_vs_median_recentValues": {
                "n": len(med_player_team_deltas),
                "max_abs_delta": max(med_player_team_deltas) if med_player_team_deltas else 0.0,
                "period_and_match_hardcoded_zero_median_count": period_match_zero_median_anomalies,
            },
            "hitRate_individual_vs_recentHits_ratio": {
                "n": len(indiv_hit_rate_deltas),
                "max_abs_delta": max(indiv_hit_rate_deltas) if indiv_hit_rate_deltas else 0.0,
            },
        },
        "classifications_and_scores": {
            "valueRating_exact_matches": value_rating_matches,
            "valueRating_total": len(insights),
            "confidence_exact_primary_odds": confidence_exact_primary,
            "confidence_exact_including_bookmaker_freeze": confidence_exact_with_bookmaker_freeze,
            "confidence_total": len(insights),
            "confidence_unexplained_ids": confidence_unexplained,
            "client_Yte_hidden_edge_badges_count": client_vs_server_edge_badge_nulls,
        },
        "legacy_v1_null_audit": {
            "total_checked": len(insights),
            "non_null_counts": legacy_non_null,
        },
        "v2_context_enrichment_counts": v2_enrichment_counts,
        "relevance_score_per_match": {
            str(mid): sorted(vals) for mid, vals in sorted(relevance_by_match.items())
        },
        "detected_confidence_bugs": {
            "player_team_under_unflipped_margin_count": len(under_sign_bug_cases),
            "player_team_under_samples": under_sign_bug_cases[:6],
            "totals_losing_side_abs_margin_bonus_count": len(abs_margin_bug_cases),
            "totals_losing_side_samples": abs_margin_bug_cases[:6],
        },
    }


def audit_sorting_and_matchup(payload_dir: Path) -> Dict[str, Any]:
    # 1. Server sortBy=recommended monotonicity on sample15 and grouped
    s15_path = payload_dir / "GET_insights_matchIds_54091_limit_500_sample15.json"
    grp_path = payload_dir / "GET_insights_grouped_statusFilter_upcoming_sortBy_recommended_timezone.json"
    rnk_path = payload_dir / "GET_matches_54091_matchup_rankings.json"
    gl_path = payload_dir / "GET_matches_54091_odds_gamelines_oddsPeriod_full_match.json"

    s15 = json.loads(s15_path.read_text(encoding="utf-8"))["data"]["insights"]
    s15_scores = [
        server_Mfe_score(i["oddsValue"], i["relevanceScore"], i["edgePercentage"], i["confidence"])
        for i in s15
    ]
    s15_inversions = sum(1 for idx in range(len(s15_scores) - 1) if s15_scores[idx] < s15_scores[idx + 1] - 1e-9)

    grp = json.loads(grp_path.read_text(encoding="utf-8"))["data"]["groups"]
    grouped_inversions = 0
    grouped_pairs = 0
    for g in grp:
        g_scores = [
            server_Mfe_score(i["oddsValue"], i["relevanceScore"], i["edgePercentage"], i["confidence"])
            for i in g.get("insights", [])
        ]
        grouped_pairs += max(0, len(g_scores) - 1)
        grouped_inversions += sum(
            1 for idx in range(len(g_scores) - 1) if g_scores[idx] < g_scores[idx + 1] - 1e-9
        )

    # 2. Cross-check opponentMetricRank against GET /matches/54091/matchup/rankings
    rnk = json.loads(rnk_path.read_text(encoding="utf-8"))["data"]
    defense_lookup: Dict[Tuple[int, str], Dict[str, Any]] = {}
    for side_key in ("homeTeam", "awayTeam"):
        tid = int(rnk[side_key]["team"]["id"])
        for row in rnk[side_key].get("defense", []):
            defense_lookup[(tid, row["metric"])] = row

    rank_cross_checks = 0
    rank_exact_matches = 0
    for ins in s15 + [x for g in grp for x in g.get("insights", [])]:
        omr = ins.get("opponentMetricRank")
        if omr and ins.get("matchId") == 54091:
            key = (int(omr["opponentTeamId"]), omr["metric"])
            if key in defense_lookup:
                rank_cross_checks += 1
                ref = defense_lookup[key]
                if (
                    int(omr["rank"]) == int(ref["rank"])
                    and int(omr["totalTeams"]) == int(ref["totalTeams"])
                    and abs(float(omr["average"]) - float(ref["average"])) < 1e-9
                    and abs(v8_round2(float(omr["leagueAvg"])) - float(ref["leagueAvg"])) < 1e-9
                ):
                    rank_exact_matches += 1

    # 3. Bookmaker 1X2 Overround proof (zero de-vigging demonstration)
    gl = json.loads(gl_path.read_text(encoding="utf-8"))["data"]
    ml_market = next((m for m in gl["markets"] if m["marketName"] == "ML"), None)
    by_book: Dict[str, Dict[str, float]] = defaultdict(dict)
    if ml_market:
        for outcome in ml_market["outcomes"]:
            sel = outcome["selection"]
            for q in outcome.get("odds", []):
                by_book[q["bookmakerName"]][sel] = float(q["value"])

    overrounds = {}
    for book, prices in sorted(by_book.items()):
        if {"Home", "Draw", "Away"}.issubset(prices.keys()):
            raw_sum = sum(100.0 / prices[s] for s in ("Home", "Draw", "Away"))
            away_raw = v8_round2(100.0 / prices["Away"])
            away_devig = round((100.0 / prices["Away"]) / (raw_sum / 100.0), 2)
            overrounds[book] = {
                "odds_1x2": prices,
                "sum_implied_pct": round(raw_sum, 2),
                "overround_pct": round(raw_sum - 100.0, 2),
                "away_scoutpicks_implied_pct": away_raw,
                "away_fair_multiplicative_pct": away_devig,
                "vig_bias_pp_on_away": round(away_raw - away_devig, 2),
            }

    # 4. RelevanceScore IEEE 754 identity for match 54091 (Wales 69.68147512564133 + Portugal 91.61048557970126 + 25 = 186.2919607053426)
    wales_fifa_score = 69.68147512564133
    portugal_fifa_score = 91.61048557970126
    uefa_nations_league_bonus = 25.0
    observed_rel_54091 = float(s15[0]["relevanceScore"])
    rel_delta = abs(observed_rel_54091 - (wales_fifa_score + portugal_fifa_score + uefa_nations_league_bonus))

    return {
        "server_Mfe_recommended_sort": {
            "sample15_pairs_checked": len(s15_scores) - 1,
            "sample15_inversions": s15_inversions,
            "sample15_top5_scores": [round(x, 4) for x in s15_scores[:5]],
            "grouped_pairs_checked": grouped_pairs,
            "grouped_inversions": grouped_inversions,
        },
        "Afe_discontinuity_at_1_35": {
            "Afe_1_3499": round(shared_Afe_odds_curve(1.3499), 4),
            "Afe_1_3500": round(shared_Afe_odds_curve(1.35), 4),
            "jump_points": round(shared_Afe_odds_curve(1.35) - shared_Afe_odds_curve(1.3499), 4),
            "weighted_Mfe_jump_points": round((shared_Afe_odds_curve(1.35) - shared_Afe_odds_curve(1.3499)) * 0.4, 4),
        },
        "opponentMetricRank_vs_matchup_rankings": {
            "cross_checked": rank_cross_checks,
            "exact_matches": rank_exact_matches,
        },
        "relevanceScore_54091_decomposition": {
            "wales_score": wales_fifa_score,
            "portugal_score": portugal_fifa_score,
            "league_bonus": uefa_nations_league_bonus,
            "reconstructed": wales_fifa_score + portugal_fifa_score + uefa_nations_league_bonus,
            "observed": observed_rel_54091,
            "ieee754_abs_delta": rel_delta,
        },
        "bookmaker_1x2_overround_audit_match_54091": overrounds,
    }


def audit_simulations_and_performance(payload_dir: Path) -> Dict[str, Any]:
    sim_files = [
        "POST_simulations_calculate_insight.json",
        "POST_simulations_calculate_player_l20.json",
        "POST_simulations_calculate_team_goals.json",
    ]
    sim_audits = []
    scale_bug_quotes = []

    # Ground truth H2H check for player 1113 vs opponent 17181 (Wales)
    h2h_p1113 = json.loads(
        (payload_dir / "GET_players_1113_performance_metric_tackles_opponentTeamId_17181_window_l20_mi.json").read_text(encoding="utf-8")
    )["data"]
    actual_p1113_vs_wales_matches = int(h2h_p1113["summary"]["sample"])

    for sf in sim_files:
        wrapped = json.loads((payload_dir / sf).read_text(encoding="utf-8"))
        req = wrapped.get("requestBody", {})
        data = wrapped["data"]
        vs_data = data["charts"]["vsOpponent"]["data"]
        vals = [float(d["value"]) for d in vs_data]
        meets = sum(1 for d in vs_data if d["meetsTarget"])
        total = len(vs_data)
        target_opp_id = int(data["match"]["opponent"]["id"])
        target_opp_name = data["match"]["opponent"]["name"]
        actual_vs_target_in_chart = sum(1 for d in vs_data if int(d["opponent"]["id"]) == target_opp_id)

        prob_pred = v8_round((meets / total) * 100.0)
        avg_pred = v8_round2(sum(vals) / total)
        med_pred = float(statistics.median(vals))

        # Home/Away sub-averages check
        home_vals = [float(d["value"]) for d in vs_data if d["result"]["isHome"]]
        away_vals = [float(d["value"]) for d in vs_data if not d["result"]["isHome"]]
        ha_chart = {row["label"]: float(row["value"]) for row in data["charts"]["homeAway"]["data"]}
        home_pred = v8_round2(sum(home_vals) / len(home_vals)) if home_vals else 0.0
        away_pred = v8_round2(sum(away_vals) / len(away_vals)) if away_vals else 0.0

        # Defense chart check
        def_block = data["defenseChart"]
        def_vals = [float(d["value"]) for d in def_block["data"]["data"]]
        def_meets = sum(1 for d in def_block["data"]["data"] if d["meetsTarget"])
        def_hr_pred = v8_round((def_meets / len(def_vals)) * 100.0)
        def_avg_pred = v8_round2(sum(def_vals) / len(def_vals))
        def_med_pred = float(statistics.median(def_vals))

        # Dimensional scale bug in odds.options[*]
        for opt in data.get("odds", {}).get("options", []):
            oval = float(opt["value"])
            imp_frac = v8_round2(1.0 / oval)
            buggy_edge = v8_round2(float(data["probability"]) - imp_frac)
            true_edge = v8_round2(float(data["probability"]) - (100.0 / oval))
            scale_bug_quotes.append({
                "file": sf,
                "bookmaker": opt["bookmaker"],
                "odds": oval,
                "probability_pct": data["probability"],
                "observed_impliedProbability_unit": opt["impliedProbability"],
                "reconstructed_impliedProbability_unit": imp_frac,
                "observed_edge": opt["edge"],
                "reconstructed_buggy_edge": buggy_edge,
                "true_edge_pct": true_edge,
                "inflation_error_pp": round(float(opt["edge"]) - true_edge, 2),
                "delta_vs_bug_formula": round(abs(float(opt["edge"]) - buggy_edge), 6),
            })

        summary_text = data["analysis"]["summary"]
        false_h2h_claim = f"Contra {target_opp_name}, ha cumplido en {meets} de {total} enfrentamientos." in summary_text

        sim_audits.append({
            "file": sf,
            "request": req,
            "entity": data["entity"]["name"],
            "target_opponent": target_opp_name,
            "sample_n": total,
            "probability_observed": data["probability"],
            "probability_reconstructed": prob_pred,
            "confidence_label": data["confidence"],
            "average_delta": round(abs(float(data["average"]) - avg_pred), 6),
            "median_delta": round(abs(float(data["median"]) - med_pred), 6),
            "home_avg_delta": round(abs(ha_chart.get("Local", 0.0) - home_pred), 6),
            "away_avg_delta": round(abs(ha_chart.get("Visitante", 0.0) - away_pred), 6),
            "defense_hr_delta": abs(int(def_block["hitRate"]) - def_hr_pred),
            "defense_avg_delta": round(abs(float(def_block["average"]) - def_avg_pred), 6),
            "defense_med_delta": round(abs(float(def_block["median"]) - def_med_pred), 6),
            "actual_matches_vs_target_opponent_in_series": actual_vs_target_in_chart,
            "contains_false_h2h_claim_in_summary": false_h2h_claim,
            "summary_excerpt": summary_text,
        })

    # HTTP 400 ZodError checks for combined markets without insightId
    zod_rejections = []
    for zf in ("POST_simulations_calculate_btts.json", "POST_simulations_calculate_match_totals.json"):
        zw = json.loads((payload_dir / zf).read_text(encoding="utf-8"))
        zod_rejections.append({
            "file": zf,
            "status": zw["status"],
            "error_name": zw["data"]["error"]["name"],
        })

    # Player & Team performance endpoint verification (scale [0, 1] for hitRate)
    perf_files = sorted(
        list(payload_dir.glob("GET_players_1113_performance_metric_*.json"))
        + list(payload_dir.glob("GET_teams_17181_performance_metric_*.json"))
    )
    perf_checks = []
    for pf in perf_files:
        pd = json.loads(pf.read_text(encoding="utf-8"))["data"]
        pts = [float(p["value"]) for p in pd.get("points", [])]
        summ = pd["summary"]
        th = pd["threshold"]
        if pts:
            avg_p = v8_round2(sum(pts) / len(pts))
            med_p = float(statistics.median(pts))
            # For integer threshold (e.g. 2) vs half-line (e.g. 0.5 / 1.5), >= vs >:
            # Verify exact hit definition: value >= threshold.value when integer or > threshold.value:
            hits_gt = sum(1 for v in pts if (v > th["value"] if th["direction"] == "over" else v < th["value"]))
            hits_ge = sum(1 for v in pts if (v >= th["value"] if th["direction"] == "over" else v <= th["value"]))
            hr_gt = v8_round2(hits_gt / len(pts))
            hr_ge = v8_round2(hits_ge / len(pts))
            uses_ge = abs(float(summ["hitRate"]) - hr_ge) == 0.0 and hr_ge != hr_gt
            hr_delta = min(abs(float(summ["hitRate"]) - hr_gt), abs(float(summ["hitRate"]) - hr_ge))
        else:
            avg_p, med_p, hr_delta, uses_ge = 0.0, 0.0, abs(float(summ["hitRate"])), False

        perf_checks.append({
            "file": pf.name,
            "sample": summ["sample"],
            "threshold": th,
            "summary_hitRate_unit_scale": summ["hitRate"],
            "uses_inclusive_ge_on_integer_line": uses_ge,
            "avg_delta": round(abs(float(summ["average"]) - avg_p), 6),
            "med_delta": round(abs(float(summ["median"]) - med_p), 6),
            "hitRate_delta": round(hr_delta, 6),
        })

    # Odds formatting & flat-stake accounting unit tests
    odds_tests = [
        {"decimal": 1.37, "american": client_hI_format_odds(1.37, "american"), "expected": "-270"},
        {"decimal": 1.40, "american": client_hI_format_odds(1.40, "american"), "expected": "-250"},
        {"decimal": 1.50, "american": client_hI_format_odds(1.50, "american"), "expected": "-200"},
        {"decimal": 2.00, "american": client_hI_format_odds(2.00, "american"), "expected": "+100"},
        {"decimal": 2.50, "american": client_hI_format_odds(2.50, "american"), "expected": "+150"},
        {"decimal": 1.00, "american": client_hI_format_odds(1.00, "american"), "expected": "1.00"},
    ]

    return {
        "ground_truth_antonio_silva_vs_wales_matches": actual_p1113_vs_wales_matches,
        "simulations_200_audit": sim_audits,
        "simulations_dimensional_edge_bug_audit": {
            "quotes_checked": len(scale_bug_quotes),
            "max_delta_vs_bug_formula": max(q["delta_vs_bug_formula"] for q in scale_bug_quotes),
            "mean_inflation_pp": round(statistics.mean(q["inflation_error_pp"] for q in scale_bug_quotes), 2),
            "max_inflation_pp": max(q["inflation_error_pp"] for q in scale_bug_quotes),
            "sign_flip_cases": [q for q in scale_bug_quotes if q["true_edge_pct"] < 0 and q["observed_edge"] > 0],
            "all_quotes": scale_bug_quotes,
        },
        "simulations_400_zod_rejections": zod_rejections,
        "performance_endpoints_audit": perf_checks,
        "client_odds_conversion_audit": odds_tests,
    }


def run_assertions(report: Dict[str, Any]) -> None:
    ins_res = report["repo_corpus_audit"]["residuals"]
    cls_res = report["repo_corpus_audit"]["classifications_and_scores"]
    leg_res = report["repo_corpus_audit"]["legacy_v1_null_audit"]
    srt_res = report["sorting_and_matchup_audit"]
    sim_res = report["simulations_and_performance_audit"]

    assert ins_res["impliedProbability_vs_v8_round2_100_div_odds"]["max_abs_delta"] == 0.0, "Fallo en impliedProbability"
    assert ins_res["edgePercentage_vs_v8_round2_rawHitRate_minus_100_div_odds"]["max_abs_delta"] <= 0.010001, "Fallo en edgePercentage"
    assert ins_res["variants_edge_vs_v8_round2_variantHitRate_minus_impliedProb"]["max_abs_delta"] <= 0.010001, "Fallo en variants.edge"
    assert ins_res["expectedValue_vs_v8_round2_rawHitRate_div_100_mul_odds_minus_1"]["max_abs_delta"] <= 0.010001, "Fallo en expectedValue"
    assert ins_res["average_vs_v8_round2_mean_recentValues"]["max_abs_delta"] == 0.0, "Fallo en average"
    assert ins_res["median_player_team_vs_median_recentValues"]["max_abs_delta"] == 0.0, "Fallo en median"
    assert ins_res["hitRate_individual_vs_recentHits_ratio"]["max_abs_delta"] == 0.0, "Fallo en hitRate individual"

    assert cls_res["valueRating_exact_matches"] == cls_res["valueRating_total"], "Fallo en valueRating"
    assert cls_res["confidence_exact_including_bookmaker_freeze"] == cls_res["confidence_total"], (
        f"Fallo en confidence: {cls_res['confidence_unexplained_ids']}"
    )
    assert all(v == 0 for v in leg_res["non_null_counts"].values()), "Campos legacy v1 inesperadamente no nulos"

    assert srt_res["server_Mfe_recommended_sort"]["sample15_inversions"] == 0, "Inversiones en Mfe sample15"
    assert srt_res["server_Mfe_recommended_sort"]["grouped_inversions"] == 0, "Inversiones en Mfe grouped"
    assert (
        srt_res["opponentMetricRank_vs_matchup_rankings"]["exact_matches"]
        == srt_res["opponentMetricRank_vs_matchup_rankings"]["cross_checked"]
    ), "Discrepancia en opponentMetricRank vs matchup/rankings"
    assert srt_res["relevanceScore_54091_decomposition"]["ieee754_abs_delta"] < 1e-12, "Fallo en identidad IEEE 754 relevanceScore"

    assert sim_res["ground_truth_antonio_silva_vs_wales_matches"] == 0, "António Silva debería tener 0 partidos vs Wales"
    for sa in sim_res["simulations_200_audit"]:
        assert sa["probability_observed"] == sa["probability_reconstructed"], f"Fallo prob en {sa['file']}"
        assert sa["average_delta"] == 0.0 and sa["median_delta"] == 0.0, f"Fallo avg/med en {sa['file']}"
        assert sa["home_avg_delta"] == 0.0 and sa["away_avg_delta"] == 0.0, f"Fallo home/away en {sa['file']}"
        assert sa["defense_hr_delta"] == 0 and sa["defense_avg_delta"] == 0.0 and sa["defense_med_delta"] == 0.0
        assert sa["actual_matches_vs_target_opponent_in_series"] == 0 and sa["contains_false_h2h_claim_in_summary"]

    assert sim_res["simulations_dimensional_edge_bug_audit"]["max_delta_vs_bug_formula"] == 0.0
    for pc in sim_res["performance_endpoints_audit"]:
        assert pc["avg_delta"] == 0.0 and pc["med_delta"] == 0.0 and pc["hitRate_delta"] == 0.0

    for ot in sim_res["client_odds_conversion_audit"]:
        assert ot["american"] == ot["expected"], f"Fallo en conversión de momios: {ot}"


# ============================================================================
# 5. SUITES FORENSES OLA 2: OPACIDAD, BACKTEST POINT-IN-TIME, XG Y RELEVANCIA
# ============================================================================

def recompute_backtest_slice_metrics(records: List[Dict[str, Any]], eps: float = 1e-4) -> Dict[str, Any]:
    """
    Recomputa de forma determinista desde los registros atómicos liquidados:
    Win Rate real, HitRate prometido, Winner's Curse, Brier Score, Log-Loss,
    ECE (10 bins), Unidades netas (flat 1u) y ROI (%).
    """
    settled = [r for r in records if r["status"] in ("won", "lost")]
    voids = [r for r in records if r["status"] == "void"]
    n_tot = len(records)
    n_void = len(voids)
    n_set = len(settled)
    if n_set == 0:
        return {"n_total": n_tot, "n_void": n_void, "n_settled": 0}

    won = sum(1 for r in settled if r["status"] == "won")
    lost = n_set - won
    win_rate = (won / n_set) * 100.0
    prom_hr = sum(float(r["raw_hr"]) for r in settled) / n_set
    wc_deg = prom_hr - win_rate

    brier = sum(((float(r["raw_hr"]) / 100.0) - (1.0 if r["status"] == "won" else 0.0)) ** 2 for r in settled) / n_set
    inf_ll = sum(
        1 for r in settled
        if (float(r["raw_hr"]) >= 100.0 and r["status"] == "lost")
        or (float(r["raw_hr"]) <= 0.0 and r["status"] == "won")
    )
    ll_sum = 0.0
    for r in settled:
        p = clamp(float(r["raw_hr"]) / 100.0, eps, 1.0 - eps)
        y = 1.0 if r["status"] == "won" else 0.0
        ll_sum += -(y * math.log(p) + (1.0 - y) * math.log(1.0 - p))

    bins: List[List[Tuple[float, float]]] = [[] for _ in range(10)]
    for r in settled:
        p = clamp(float(r["raw_hr"]) / 100.0, 0.0, 1.0)
        bins[min(int(p * 10.0), 9)].append((p, 1.0 if r["status"] == "won" else 0.0))
    ece = sum(
        (len(b) / n_set) * abs(sum(x[0] for x in b) / len(b) - sum(x[1] for x in b) / len(b))
        for b in bins if b
    )

    out: Dict[str, Any] = {
        "n_total": n_tot,
        "n_void": n_void,
        "n_settled": n_set,
        "won": won,
        "lost": lost,
        "promised_hit_rate_pct": round(prom_hr, 2),
        "real_win_rate_pct": round(win_rate, 2),
        "winners_curse_deg_pp": round(wc_deg, 2),
        "brier_score": round(brier, 4),
        "log_loss_eps1e4": round(ll_sum / n_set, 4),
        "unclipped_infinite_logloss_cases": inf_ll,
        "ece": round(ece, 4),
        "ece_pp": round(ece * 100.0, 2),
    }

    priced = [r for r in settled if r.get("odds") is not None]
    if priced:
        m = len(priced)
        net_u = sum((float(r["odds"]) - 1.0) if r["status"] == "won" else -1.0 for r in priced)
        out["net_units_1u"] = round(net_u, 2)
        out["roi_1u_pct"] = round((net_u / m) * 100.0, 2)
    return out


def assert_metrics_match(actual: Dict[str, Any], expected: Dict[str, Any], label: str) -> None:
    keys = [
        "n_total", "n_void", "n_settled", "won", "lost",
        "promised_hit_rate_pct", "real_win_rate_pct", "winners_curse_deg_pp",
        "brier_score", "log_loss_eps1e4", "unclipped_infinite_logloss_cases", "ece_pp",
    ]
    if "roi_1u_pct" in actual and "roi_1u_pct" in expected:
        keys.extend(["net_units_1u", "roi_1u_pct"])
    for k in keys:
        if k not in expected:
            continue
        assert abs(float(actual[k]) - float(expected[k])) <= 0.010001, (
            f"Discrepancia en {label}.{k}: recalculado={actual[k]} vs almacenado={expected[k]}"
        )


def audit_and_assert_wave2(evidence_dir: Path) -> Dict[str, Any]:
    """
    Ejecuta las 6 suites reproducibles de Ola 2 exclusivamente sobre archivos
    portátiles dentro de `Reportes/scoutpicks/evidence/`.
    """
    live_dir = evidence_dir / "live-payloads"
    wave2_live_dir = live_dir / "wave2"
    w2_json_path = evidence_dir / "wave2-empirical-backtest-audit.json"

    assert wave2_live_dir.is_dir(), f"Falta directorio portátil de Ola 2: {wave2_live_dir}"
    assert w2_json_path.is_file(), f"Falta archivo portátil de auditoría Ola 2: {w2_json_path}"

    w2_raw_text = w2_json_path.read_text(encoding="utf-8")
    w2 = json.loads(w2_raw_text)

    # Suite W2-1: Higiene CERO PII / CERO credenciales (comparación por digest SHA-256 sin exponer el literal)
    import hashlib
    import re
    forbidden_uid_sha256 = "f9b6e75f6c32e6e7d0f1df17817898214adc71e051379a598efcc9c3133adeb7"
    def assert_clean_text(txt: str, label: str) -> None:
        assert "Authorization: Bearer eyJ" not in txt, f"Bearer JWT detectado en {label}"
        for tok in set(re.findall(r"[A-Za-z0-9]{32}", txt)):
            assert hashlib.sha256(tok.encode("utf-8")).hexdigest() != forbidden_uid_sha256, (
                f"UID crudo no redactado detectado en {label}"
            )
    assert_clean_text(w2_raw_text, w2_json_path.name)
    rep14_path = evidence_dir.parent / "14-auditoria-empirica-backtest-liga-mx-xg-y-relevancia.md"
    if rep14_path.is_file():
        assert_clean_text(rep14_path.read_text(encoding="utf-8"), rep14_path.name)

    # Suite W2-2: Verificación de ecuaciones Insights v2 sobre payloads Liga MX / Ola 2 (80 insights, 398 variantes)
    w2_insights_audit = audit_insights_corpus(wave2_live_dir)
    w2_res = w2_insights_audit["residuals"]
    w2_cls = w2_insights_audit["classifications_and_scores"]
    assert w2_insights_audit["unique_insights"] >= 80, "Corpus Liga MX / Ola 2 incompleto"
    assert w2_res["impliedProbability_vs_v8_round2_100_div_odds"]["max_abs_delta"] == 0.0
    assert w2_res["edgePercentage_vs_v8_round2_rawHitRate_minus_100_div_odds"]["max_abs_delta"] <= 0.010001
    assert w2_res["variants_edge_vs_v8_round2_variantHitRate_minus_impliedProb"]["max_abs_delta"] == 0.0
    assert w2_res["expectedValue_vs_v8_round2_rawHitRate_div_100_mul_odds_minus_1"]["max_abs_delta"] <= 0.010001
    assert w2_cls["valueRating_exact_matches"] == w2_cls["valueRating_total"]
    assert w2_cls["confidence_exact_including_bookmaker_freeze"] == w2_cls["confidence_total"], (
        f"Confidence no explicado en Ola 2: {w2_cls['confidence_unexplained_ids']}"
    )

    # Suite W2-3: Opacidad Post-Partido (Zod 400 + Match 37222996 + 52/52 FT purgados)
    top_fin = json.loads((wave2_live_dir / "GET_insights_top_finished_recommended.json").read_text(encoding="utf-8"))
    grp_fin = json.loads((wave2_live_dir / "GET_insights_grouped_finished.json").read_text(encoding="utf-8"))
    assert top_fin["status"] == 400 and top_fin["data"]["error"]["name"] == "ZodError"
    assert '"live"' in top_fin["data"]["error"]["message"] and '"upcoming"' in top_fin["data"]["error"]["message"]
    assert grp_fin["status"] == 400 and grp_fin["data"]["error"]["name"] == "ZodError"

    m37_live = json.loads((live_dir / "GET_matches_37222996.json").read_text(encoding="utf-8"))["data"]
    assert m37_live["status"] == "2H" and m37_live["insightsGeneratedAt"] is not None
    op_block = w2["post_match_opacity_audit"]
    assert op_block["live_to_ft_purge_transition_match_37222996"]["wave2_finished_state"]["status"] == "FT"
    assert op_block["live_to_ft_purge_transition_match_37222996"]["wave2_finished_state"]["insights_returned_count"] == 0

    fin_purge = op_block["finished_5leagues_purge_summary"]
    assert fin_purge["total_ft_matches_tested"] == 52
    assert fin_purge["matches_with_insightsGeneratedAt_non_null"] == 52
    assert fin_purge["matches_with_lastSettlementAttemptAt_non_null"] == 52
    assert fin_purge["matches_returning_zero_insights"] == 52
    assert fin_purge["total_insights_returned_across_52_ft_matches"] == 0

    # Suite W2-4: Verificación de `xg`, `xgot` y `shootingPerformance` == null (100.00%)
    for sample_pf in ("GET_matches_10618059_players_epl.json", "GET_matches_32288897_ucl_players.json"):
        p_payload = json.loads((wave2_live_dir / sample_pf).read_text(encoding="utf-8"))
        p_data = p_payload.get("data", p_payload)
        rows = (p_data.get("home") or {}).get("players", []) + (p_data.get("away") or {}).get("players", [])
        assert len(rows) > 0
        for r in rows:
            assert r.get("xg") is None and r.get("xgot") is None and r.get("shootingPerformance") is None

    xg_block = w2["xg_5league_null_audit"]
    assert xg_block["total_finished_matches"] == 52
    assert xg_block["total_player_stat_rows"] == 2244
    assert xg_block["global_non_null_counts"]["xg"]["non_null"] == 0
    assert xg_block["global_non_null_counts"]["xgot"]["non_null"] == 0
    assert xg_block["global_non_null_counts"]["shootingPerformance"]["non_null"] == 0
    for lid_str, expected_rows in (("68", 501), ("2", 480), ("3", 548), ("1", 531), ("13", 184)):
        lg_xg = xg_block["per_league"][lid_str]
        assert lg_xg["player_stat_rows"] == expected_rows
        assert lg_xg["xg_non_null"] == 0 and lg_xg["xgot_non_null"] == 0 and lg_xg["shootingPerformance_non_null"] == 0
        assert lg_xg["teamStats_xg_non_null"] == 0

    # Suite W2-5: Re-verificación atómica del Backtest Empírico Point-in-Time (28 partidos, 5 ligas)
    bt_block = w2["point_in_time_backtest_28matches"]
    assert bt_block["dataset_scope"]["total_matches"] == 28
    assert bt_block["dataset_scope"]["unique_team_histories"] == 48
    assert bt_block["dataset_scope"]["unique_player_histories"] == 206

    atomic_cat = bt_block["atomic_promoted_catalog_picks"]
    atomic_unp = bt_block["atomic_unpriced_calibration_picks"]
    assert len(atomic_cat) == 721 and len(atomic_unp) == 283

    # Verificar ecuaciones Scout Picks en cada uno de los 721 picks atómicos
    for p in atomic_cat:
        raw_hr = float(p["hits"]) / float(p["sample_size"]) * 100.0
        odds = float(p["odds"])
        assert abs(raw_hr - float(p["raw_hr"])) <= 1e-4
        assert v8_round2(raw_hr) == float(p["hit_rate"])
        assert v8_round2(100.0 / odds) == float(p["implied_prob"])
        assert abs(v8_round2(raw_hr - 100.0 / odds) - float(p["edge_pct"])) <= 0.010001
        assert abs(v8_round2((raw_hr / 100.0) * odds - 1.0) - float(p["ev"])) <= 0.010001
        assert server_value_rating(float(p["edge_pct"])) == p["value_rating"]

    assert_metrics_match(
        recompute_backtest_slice_metrics(atomic_cat),
        bt_block["global_summaries"]["promoted_catalog_multilens"],
        "promoted_catalog_multilens",
    )
    for fam_key, prefix in (("value", "value_"), ("safe", "safe_"), ("consistent", "consistent_")):
        assert_metrics_match(
            recompute_backtest_slice_metrics([p for p in atomic_cat if p["catalog_type"].startswith(prefix)]),
            bt_block["by_catalog_family"][fam_key],
            f"family_{fam_key}",
        )
    for vr in ("strong", "moderate", "marginal", "none"):
        assert_metrics_match(
            recompute_backtest_slice_metrics([p for p in atomic_cat if p["value_rating"] == vr]),
            bt_block["by_value_rating_catalog"][vr],
            f"valueRating_{vr}",
        )

    hr100_block = bt_block["promised_100_pct_hit_rate_audit"]
    assert_metrics_match(
        recompute_backtest_slice_metrics([p for p in atomic_cat if float(p["hit_rate"]) == 100.0]),
        hr100_block["all_100_pct_catalog"],
        "hr100_all",
    )
    assert_metrics_match(
        recompute_backtest_slice_metrics([p for p in atomic_cat if float(p["hit_rate"]) == 100.0 and int(p["sample_size"]) == 5]),
        hr100_block["window_5_of_5"],
        "hr100_5of5",
    )
    assert_metrics_match(
        recompute_backtest_slice_metrics([p for p in atomic_cat if float(p["hit_rate"]) == 100.0 and int(p["sample_size"]) >= 10]),
        hr100_block["window_10_of_10_plus"],
        "hr100_10of10plus",
    )

    for lid_str in ("68", "2", "3", "1", "13"):
        assert_metrics_match(
            recompute_backtest_slice_metrics([p for p in atomic_cat if str(p["leagueId"]) == lid_str]),
            bt_block["by_league_promoted_catalog"][lid_str],
            f"league_{lid_str}",
        )

    assert_metrics_match(
        recompute_backtest_slice_metrics([p for p in atomic_cat if p["marketGroup"] == "player_props"]),
        bt_block["by_market_group"]["priced_catalog"]["player_props_gold_9metrics"],
        "player_props_gold",
    )
    assert_metrics_match(
        recompute_backtest_slice_metrics([p for p in atomic_cat if p["marketGroup"] == "gamelines_1x2"]),
        bt_block["by_market_group"]["priced_catalog"]["gamelines_1x2"],
        "gamelines_1x2",
    )
    assert_metrics_match(
        recompute_backtest_slice_metrics([p for p in atomic_cat if p["marketGroup"] == "gamelines_dc"]),
        bt_block["by_market_group"]["priced_catalog"]["gamelines_double_chance"],
        "gamelines_dc",
    )
    for unp_key, mgrp in (("totals_over_under_ft", "totals_ft"), ("btts_ft", "btts_ft"), ("period_1h_2h", "period_1h_2h")):
        assert_metrics_match(
            recompute_backtest_slice_metrics([p for p in atomic_unp if p["marketGroup"] == mgrp]),
            bt_block["by_market_group"]["unpriced_scoreline_calibration_hr_ge_55"][unp_key],
            f"unpriced_{unp_key}",
        )

    # Suite W2-6: Reconstrucción exacta de `relevanceScore` (denominador FIFA 57107 + sportmonks_club + powerPriority)
    rel_block = w2["relevance_score_reconstruction"]
    nat_info = rel_block["precision_dichotomy"]["national_teams"]
    club_info = rel_block["precision_dichotomy"]["club_teams"]
    assert len(rel_block["all_96_matches"]) == 96
    assert nat_info["matches_checked"] == 27 and club_info["matches_checked"] == 69

    # Verificar denominador racional exacto 57107 (rango FIFA 1142.14 puntos) en 27/27 partidos de selecciones
    fifa_span = 1142.14
    for nm in nat_info["verified_matches"]:
        bonus = 25.0 if int(nm["leagueId"]) in (116, 99) else 0.0
        obs_rel = float(nm["observed_relevanceScore"])
        cents = round((obs_rel - bonus) * fifa_span)
        reconstructed = (cents / 100.0) / fifa_span * 100.0 + bonus
        assert abs(obs_rel - reconstructed) < 1e-12, f"Fallo identidad FIFA 57107 en match {nm['matchId']}"

    # Verificar ancla club `sportmonks_club` (Match 32286323: 44.47 + 62.10 = 106.57)
    ud_club = club_info["observed_underdog_anchor_match_32286323"]
    assert abs((ud_club["backedScore"] + ud_club["opponentScore"]) - ud_club["observed_relevanceScore"]) < 1e-12

    # Verificar los 69 partidos de clubes <= 2 decimales
    for m_row in rel_block["all_96_matches"]:
        if not m_row["isNationalTeamMatch"]:
            assert abs(v8_round2(float(m_row["relevanceScore"])) - float(m_row["relevanceScore"])) < 1e-9

    # Cruzar directamente contra GET_leagues_all.json portátil
    leagues_all = json.loads((live_dir / "GET_leagues_all.json").read_text(encoding="utf-8"))["data"]["leagues"]
    pp_lookup = {
        int(lg["id"]): (float(lg["powerPriority"]["score"]), lg["powerPriority"]["matchAt"])
        for lg in leagues_all if lg.get("powerPriority")
    }
    for cc in rel_block["power_priority_vs_relevance_cross_checks"]:
        lid = int(cc["leagueId"])
        assert lid in pp_lookup
        pp_score, pp_at = pp_lookup[lid]
        assert pp_at == cc["matchAt"]
        expected_bonus = 25.0 if lid in (116, 99) else 0.0
        assert abs((float(cc["insights_relevanceScore"]) - pp_score) - expected_bonus) < 1e-9

    return {
        "wave2_repo_insights": w2_insights_audit["unique_insights"],
        "ft_purged_matches": fin_purge["matches_returning_zero_insights"],
        "xg_null_player_rows": xg_block["total_player_stat_rows"],
        "backtest_promoted_settled": bt_block["global_summaries"]["promoted_catalog_multilens"]["n_settled"],
        "backtest_promoted_roi_pct": bt_block["global_summaries"]["promoted_catalog_multilens"]["roi_1u_pct"],
        "hr100_real_wr_pct": hr100_block["all_100_pct_catalog"]["real_win_rate_pct"],
        "relevance_matches_verified": len(rel_block["all_96_matches"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Verificador matemático forense de Scout Picks.")
    parser.add_argument(
        "--extended-dir",
        type=Path,
        default=None,
        help="Directorio opcional con payloads extendidos para auditoría complementaria.",
    )
    args = parser.parse_args()

    evidence_dir = Path(__file__).resolve().parent
    live_payloads_dir = evidence_dir / "live-payloads"
    output_json_path = evidence_dir / "engine-empirical-audit.json"

    if not live_payloads_dir.is_dir():
        print(f"ERROR: No existe el directorio {live_payloads_dir}", file=sys.stderr)
        return 1

    repo_corpus = audit_insights_corpus(live_payloads_dir)
    sorting_and_matchup = audit_sorting_and_matchup(live_payloads_dir)
    simulations_and_perf = audit_simulations_and_performance(live_payloads_dir)

    report: Dict[str, Any] = {
        "metadata": {
            "target": "Scout Picks (https://scoutpicks.app | https://api.scoutpicks.aertech-labs.com)",
            "verifier": "Reportes/scoutpicks/evidence/verify_scoutpicks_math.py",
            "epistemic_basis": {
                "OBSERVADO": "Payloads HTTP reales y AST de index-BZ3_gLK3.js",
                "DERIVADO": "Identidades algebraicas exactas validadas con residuo 0",
                "RECONSTRUIDO": "Fórmulas servidor de confidence, valueRating, relevanceScore y Mfe",
            },
            "rea_evidence_ids": [
                "ev_03f837b1e4aec03bcac8791498a5d2cbbd06e25f39474bde43e541baa4acff52",
                "ev_8d1fa2225983ff98a4c350ad528895985cc9cdd8f4efab6f7eceda9da4dc30cd",
                "ev_abdb3cf1dbd8a7aab2a952ca236449585bd2de775d8200297a3b94e836220fb3",
                "ev_7aae1b8faebfaae85bd8513669e557fd705e9a7b85ff530e366823d93f7910d4",
            ],
            "pii_sanitized": True,
        },
        "engine_nature_verdict": {
            "classification": "Motor Empírico Frecuentista Multi-Ventana (Hit-Rate) sin De-Vigging ni Modelos Paramétricos",
            "uses_poisson_or_dixon_coles": False,
            "uses_elo_or_monte_carlo": False,
            "uses_expected_goals_xg": False,
            "removes_bookmaker_overround_vig": False,
            "uses_llm_for_simulation_narratives": False,
            "uses_llm_for_market_alerts_assistant": True,
        },
        "repo_corpus_audit": repo_corpus,
        "sorting_and_matchup_audit": sorting_and_matchup,
        "simulations_and_performance_audit": simulations_and_perf,
    }

    if args.extended_dir and args.extended_dir.is_dir():
        report["extended_corpus_audit"] = audit_insights_corpus(args.extended_dir)

    run_assertions(report)
    w2_summary = audit_and_assert_wave2(evidence_dir)

    serialized_w1 = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if not output_json_path.exists() or output_json_path.read_text(encoding="utf-8") != serialized_w1:
        output_json_path.write_text(serialized_w1, encoding="utf-8")

    print("=== VERIFICACIÓN MATEMÁTICA SCOUT PICKS OLA 1 + OLA 2 COMPLETADA (EXIT 0) ===")
    print(
        f"[Ola 1] Insights auditados (repo): {repo_corpus['unique_insights']} únicos "
        f"({repo_corpus['total_occurrences']} ocurrencias, {repo_corpus['total_variants_checked']} variantes)"
    )
    print(
        f"[Ola 1] impliedProb / edge / EV:   max |delta| = "
        f"{repo_corpus['residuals']['impliedProbability_vs_v8_round2_100_div_odds']['max_abs_delta']} / "
        f"{repo_corpus['residuals']['edgePercentage_vs_v8_round2_rawHitRate_minus_100_div_odds']['max_abs_delta']} / "
        f"{repo_corpus['residuals']['expectedValue_vs_v8_round2_rawHitRate_div_100_mul_odds_minus_1']['max_abs_delta']}"
    )
    print(
        f"[Ola 1] valueRating & confidence:  "
        f"{repo_corpus['classifications_and_scores']['valueRating_exact_matches']}/{repo_corpus['classifications_and_scores']['valueRating_total']} & "
        f"{repo_corpus['classifications_and_scores']['confidence_exact_including_bookmaker_freeze']}/{repo_corpus['classifications_and_scores']['confidence_total']}"
    )
    print(
        f"[Ola 1] Mfe_server inversiones:    "
        f"sample15={sorting_and_matchup['server_Mfe_recommended_sort']['sample15_inversions']}, "
        f"grouped={sorting_and_matchup['server_Mfe_recommended_sort']['grouped_inversions']}"
    )
    print(
        f"[Ola 2] Insights Liga MX/Wave2:    {w2_summary['wave2_repo_insights']}/{w2_summary['wave2_repo_insights']} exactos (0 no explicados)"
    )
    print(
        f"[Ola 2] Opacidad FT & xG Null:     {w2_summary['ft_purged_matches']}/52 partidos FT con 0 insights | "
        f"0/{w2_summary['xg_null_player_rows']} filas PlayerStat con xG/xGOT"
    )
    print(
        f"[Ola 2] Backtest 28 FT (5 ligas):  {w2_summary['backtest_promoted_settled']} picks catálogo liquidados -> "
        f"ROI = {w2_summary['backtest_promoted_roi_pct']}% | HitRate 100% real WR = {w2_summary['hr100_real_wr_pct']}%"
    )
    print(
        f"[Ola 2] RelevanceScore exactitud:  {w2_summary['relevance_matches_verified']} partidos verificados "
        f"(27/27 FIFA denom 57107 |delta|<1e-12, 69/69 clubes <=2 dec)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
