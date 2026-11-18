/**
 * PitchLab Deterministic Anti-Hallucination & Governance Guardrail (`v4.0` · `EXP_V49`) —
 * Compilador de hoja de hechos verificados (`VerifiedMatchFactSheet`) y validador determinista
 * (`validateNarrativeAgainstFactSheet`) que erradica por construcción:
 *  1. El `20.7%` de inversiones de favorito detectado en los resúmenes LLM de Astra AI.
 *  2. Promesas de certeza prohibidas (`"100% seguro"`, `"garantizado"`, `"lock"`, `"sin riesgo"`).
 *  3. Recomendaciones de dimensionamiento o apuesta (`stake`, `kelly`, `unidades`, `bankroll`).
 *  4. Porcentajes numéricos alucinados que se desvíen `> 1.0 pp` de la probabilidad publicada.
 */

export type GuardrailViolationCode =
  | "favorite_inversion"
  | "forbidden_certainty_claim"
  | "forbidden_sizing_recommendation"
  | "probability_hallucination";

export interface GuardrailViolation {
  readonly code: GuardrailViolationCode;
  readonly detail: string;
}

export interface GuardrailAuditResult {
  readonly passed: boolean;
  readonly violations: readonly GuardrailViolation[];
}

export interface VerifiedMatchFactSheet {
  readonly matchId: string;
  readonly sport: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly pHome: number;
  readonly pDraw: number | null;
  readonly pAway: number;
  readonly favoriteSide: "home" | "away" | "balanced";
  readonly favoriteTeam: string | null;
  readonly underdogTeam: string | null;
  readonly favoriteProbability: number;
  readonly expectedTotal: number;
  readonly canonicalTotalLine: number;
  readonly pOverCanonical: number;
}

const FORBIDDEN_CERTAINTY_PATTERNS: readonly RegExp[] = Object.freeze([
  /\b100\s*%\s*segur[oa]?\b/i,
  /\bgarantizad[oa]s?\b/i,
  /\bsin\s+riesgo\b/i,
  /\bapuesta\s+segura\b/i,
  /\bdinero\s+(gratis|seguro|f[aá]cil)\b/i,
  /\block\s+of\s+the\s+(day|week)\b/i,
  /\bsure\s+bet\b/i,
]);

const FORBIDDEN_SIZING_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bstake\b/i,
  /\bkelly\b/i,
  /\bbankroll\b/i,
  /\b\d+(\.\d+)?\s*unidades\b/i,
  /\bm[eé]tele\b/i,
  /\ball[\s-]in\b/i,
]);

export function buildVerifiedMatchFactSheet(params: {
  readonly matchId: string;
  readonly sport: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly pHome: number;
  readonly pDraw?: number | null;
  readonly pAway: number;
  readonly expectedTotal: number;
  readonly canonicalTotalLine: number;
  readonly pOverCanonical: number;
}): VerifiedMatchFactSheet {
  const diff = params.pHome - params.pAway;
  let favoriteSide: "home" | "away" | "balanced" = "balanced";
  let favoriteTeam: string | null = null;
  let underdogTeam: string | null = null;
  let favoriteProbability = Math.max(params.pHome, params.pAway);

  if (diff > 0.015) {
    favoriteSide = "home";
    favoriteTeam = params.homeTeam;
    underdogTeam = params.awayTeam;
    favoriteProbability = params.pHome;
  } else if (diff < -0.015) {
    favoriteSide = "away";
    favoriteTeam = params.awayTeam;
    underdogTeam = params.homeTeam;
    favoriteProbability = params.pAway;
  }

  return Object.freeze({
    matchId: params.matchId,
    sport: params.sport,
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    pHome: params.pHome,
    pDraw: params.pDraw ?? null,
    pAway: params.pAway,
    favoriteSide,
    favoriteTeam,
    underdogTeam,
    favoriteProbability,
    expectedTotal: params.expectedTotal,
    canonicalTotalLine: params.canonicalTotalLine,
    pOverCanonical: params.pOverCanonical,
  });
}

function escapeRegExp(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function validateNarrativeAgainstFactSheet(
  narrativeText: string,
  facts: VerifiedMatchFactSheet,
): GuardrailAuditResult {
  const violations: GuardrailViolation[] = [];
  const text = narrativeText.trim();

  for (const pat of FORBIDDEN_CERTAINTY_PATTERNS) {
    if (pat.test(text)) {
      violations.push({
        code: "forbidden_certainty_claim",
        detail: `Lenguaje de certeza prohibido detectado por patrón ${String(pat)}`,
      });
    }
  }

  for (const pat of FORBIDDEN_SIZING_PATTERNS) {
    if (pat.test(text)) {
      violations.push({
        code: "forbidden_sizing_recommendation",
        detail: `Término de dimensionamiento de apuesta prohibido detectado por patrón ${String(pat)}`,
      });
    }
  }

  // Detección determinista de inversión de favorito (falla del 20.7% en Astra AI)
  if (facts.favoriteSide !== "balanced" && facts.underdogTeam) {
    const uEsc = escapeRegExp(facts.underdogTeam);
    const invPatterns = [
      new RegExp(`${uEsc}\\s+(?:es|parte\\s+como|sale\\s+como|llega\\s+como)\\s+(?:el\\s+|claro\\s+)?favorito`, "i"),
      new RegExp(`favorito\\s+(?:es|claro\\s+es|:)\\s*${uEsc}`, "i"),
      new RegExp(`${uEsc}\\s+tiene\\s+mayor\\s+probabilidad\\s+de\\s+(?:ganar|victoria)`, "i"),
    ];
    for (const ip of invPatterns) {
      if (ip.test(text)) {
        violations.push({
          code: "favorite_inversion",
          detail: `El texto declara favorito al no-favorito matemático '${facts.underdogTeam}' frente a '${String(facts.favoriteTeam)}'`,
        });
        break;
      }
    }
  }

  // Verificación de consistencia numérica cuando se cita explícitamente la probabilidad del favorito
  if (facts.favoriteTeam) {
    const fEsc = escapeRegExp(facts.favoriteTeam);
    const pctAfterFav = new RegExp(`${fEsc}[^.\\n]{0,45}?(\\d{1,2}(?:\\.\\d+)?)\\s*%`, "i");
    const m = pctAfterFav.exec(text);
    if (m && m[1]) {
      const citedPct = Number.parseFloat(m[1]);
      const truePct = facts.favoriteProbability * 100.0;
      if (Number.isFinite(citedPct) && Math.abs(citedPct - truePct) > 1.0) {
        violations.push({
          code: "probability_hallucination",
          detail: `Porcentaje citado para '${facts.favoriteTeam}' (${citedPct.toFixed(1)}%) difiere > 1.0 pp del valor real (${truePct.toFixed(1)}%)`,
        });
      }
    }
  }

  return Object.freeze({
    passed: violations.length === 0,
    violations: Object.freeze(violations),
  });
}

export function compileDeterministicVerifiedSummaryEs(facts: VerifiedMatchFactSheet): string {
  const pHomePct = (facts.pHome * 100.0).toFixed(1);
  const pAwayPct = (facts.pAway * 100.0).toFixed(1);
  const pOverPct = (facts.pOverCanonical * 100.0).toFixed(1);

  const favClause =
    facts.favoriteSide === "home" && facts.favoriteTeam
      ? `${facts.favoriteTeam} parte como favorito con ${pHomePct}% frente a ${pAwayPct}% de ${facts.awayTeam}`
      : facts.favoriteSide === "away" && facts.favoriteTeam
        ? `${facts.favoriteTeam} parte como favorito visitante con ${pAwayPct}% frente a ${pHomePct}% de ${facts.homeTeam}`
        : `Duelo equilibrado entre ${facts.homeTeam} (${pHomePct}%) y ${facts.awayTeam} (${pAwayPct}%)`;

  const drawClause =
    facts.pDraw !== null && facts.pDraw > 0.01
      ? ` (empate ${(facts.pDraw * 100.0).toFixed(1)}%)`
      : "";

  return `${favClause}${drawClause}. Total proyectado: ${facts.expectedTotal.toFixed(2)} (Más de ${facts.canonicalTotalLine.toFixed(1)}: ${pOverPct}%).`;
}
