/**
 * PitchLab Deterministic Anti-Hallucination & Governance Guardrail (`v4.0` · `EXP_V49`) —
 * Compilador de hoja de hechos verificados (`VerifiedMatchFactSheet`) y validador determinista
 * (`validateNarrativeAgainstFactSheet`) que erradica por construcción:
 *  1. Inversiones de favorito en resúmenes generados por LLM.
 *  2. Promesas de certeza prohibidas (`"100% seguro"`, `"garantizado"`, `"lock"`, `"sin riesgo"`).
 *  3. Recomendaciones de dimensionamiento o apuesta (`stake`, `kelly`, `unidades`, `bankroll`).
 *  4. Porcentajes numéricos alucinados que se desvíen `> 1.0 pp` de la probabilidad publicada.
 */

export type GuardrailViolationCode =
  | "favorite_inversion"
  | "forbidden_certainty_claim"
  | "forbidden_sizing_recommendation"
  | "probability_hallucination"
  | "mathematical_invariant_violation";

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

function parseLocalePct(raw: string): number {
  return Number.parseFloat(raw.replace(",", "."));
}

function checkTeamCitedPercentages(
  text: string,
  teamName: string,
  otherTeamName: string,
  trueProb: number,
  violations: GuardrailViolation[],
): void {
  const tEsc = escapeRegExp(teamName);
  const oRe = new RegExp(escapeRegExp(otherTeamName), "i");
  const truePct = trueProb * 100.0;
  // Patrón 1: "<Equipo> ... 62.5%" o "<Equipo> ... 62,5%" (sin cruzar cláusulas, `:` ni otro equipo/empate)
  const afterRe = new RegExp(`${tEsc}[^.\\n;:]{0,36}?(\\d{1,3}(?:[.,]\\d+)?)\\s*%`, "gi");
  // Patrón 2: "62.5% de <Equipo>" o "62,5% para <Equipo>"
  const beforeRe = new RegExp(`(\\d{1,3}(?:[.,]\\d+)?)\\s*%\\s*(?:de|para|a\\s+favor\\s+de)\\s+${tEsc}`, "gi");

  const checkedSpans = new Set<number>();
  for (const re of [beforeRe, afterRe]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (!m[1]) continue;
      // Evitar doble conteo si "frente a", "empate" o el rival aparecen entre el nombre y el porcentaje
      if (re === afterRe && (/\bfrente\s+a\b/i.test(m[0]) || /\bempate\b/i.test(m[0]) || oRe.test(m[0]))) {
        continue;
      }
      const pos = m.index;
      if (checkedSpans.has(pos)) continue;
      checkedSpans.add(pos);
      const citedPct = parseLocalePct(m[1]);
      if (Number.isFinite(citedPct) && Math.abs(citedPct - truePct) > 1.0) {
        violations.push({
          code: "probability_hallucination",
          detail: `Porcentaje citado para '${teamName}' (${citedPct.toFixed(1)}%) difiere > 1.0 pp del valor real (${truePct.toFixed(1)}%)`,
        });
      }
    }
  }
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

  // Bloqueo explícito de cualquier probabilidad espuria `100%` o `100.0%` / `100,0%` o `0%` (sin falso positivo en `52.0%`)
  const extremePctRe = /(?<![\d.,])(100(?:[.,]0+)?|0(?:[.,]0+)?)\s*%/g;
  if (extremePctRe.test(text)) {
    violations.push({
      code: "forbidden_certainty_claim",
      detail: "Probabilidad extrema prohibida (0% o 100%) detectada en el texto",
    });
  }

  for (const pat of FORBIDDEN_SIZING_PATTERNS) {
    if (pat.test(text)) {
      violations.push({
        code: "forbidden_sizing_recommendation",
        detail: `Término de dimensionamiento de apuesta prohibido detectado por patrón ${String(pat)}`,
      });
    }
  }

  // Detección determinista de inversión de favorito en narrativas LLM
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

  // Verificación integral de porcentajes (favorito, no-favorito, empate y Over, con `.` o `,` decimal)
  checkTeamCitedPercentages(text, facts.homeTeam, facts.awayTeam, facts.pHome, violations);
  checkTeamCitedPercentages(text, facts.awayTeam, facts.homeTeam, facts.pAway, violations);

  if (facts.pDraw !== null) {
    const drawRe = /\bempate[^.\n;)]{0,22}?(\d{1,3}(?:[.,]\d+)?)\s*%/gi;
    let md: RegExpExecArray | null;
    while ((md = drawRe.exec(text)) !== null) {
      if (!md[1]) continue;
      const citedDraw = parseLocalePct(md[1]);
      const trueDraw = facts.pDraw * 100.0;
      if (Number.isFinite(citedDraw) && Math.abs(citedDraw - trueDraw) > 1.0) {
        violations.push({
          code: "probability_hallucination",
          detail: `Porcentaje citado para empate (${citedDraw.toFixed(1)}%) difiere > 1.0 pp del valor real (${trueDraw.toFixed(1)}%)`,
        });
      }
    }
  }

  const overRe = /\b(?:m[aá]s\s+de|over)\s+\d+(?:[.,]\d+)?[^.\n;)]{0,16}?(\d{1,3}(?:[.,]\d+)?)\s*%/gi;
  let mo: RegExpExecArray | null;
  while ((mo = overRe.exec(text)) !== null) {
    if (!mo[1]) continue;
    const citedOver = parseLocalePct(mo[1]);
    const trueOver = facts.pOverCanonical * 100.0;
    if (Number.isFinite(citedOver) && Math.abs(citedOver - trueOver) > 1.0) {
      violations.push({
        code: "probability_hallucination",
        detail: `Porcentaje citado para Over (${citedOver.toFixed(1)}%) difiere > 1.0 pp del valor real (${trueOver.toFixed(1)}%)`,
      });
    }
  }

  return Object.freeze({
    passed: violations.length === 0,
    violations: Object.freeze(violations),
  });
}

export interface MathematicalInvariantCheckInput {
  readonly pHome: number;
  readonly pDraw?: number | null;
  readonly pAway: number;
  readonly pHomeEarlyPayoutWin?: number | null;
  readonly pAwayEarlyPayoutWin?: number | null;
  readonly epistemicBands?: readonly {
    readonly label: string;
    readonly pLower90: number;
    readonly pPoint: number;
    readonly pUpper90: number;
  }[];
  readonly sgpChecks?: readonly {
    readonly label: string;
    readonly legProbs: readonly number[];
    readonly jointProbability: number;
  }[];
}

/**
 * Audita invariantes algebraicos inviolables antes de publicar cualquier payload:
 *  1. Suma de probabilidades `1X2` / `ML` == 1.0 (`< 1e-6`),
 *  2. Dominancia estocástica `P(Early Payout Win) >= P(Regular Win)`,
 *  3. Anidamiento epistémico `0 < pLower90 <= pPoint <= pUpper90 < 1`,
 *  4. Cotas de Fréchet-Hoeffding en cualquier SGP.
 */
export function validateMatchMathematicalInvariants(
  input: MathematicalInvariantCheckInput,
): GuardrailAuditResult {
  const violations: GuardrailViolation[] = [];
  const sum1x2 = input.pHome + (input.pDraw ?? 0.0) + input.pAway;
  if (!Number.isFinite(sum1x2) || Math.abs(sum1x2 - 1.0) > 5e-6) {
    violations.push({
      code: "mathematical_invariant_violation",
      detail: `Suma de probabilidades core inválida: ${sum1x2.toFixed(8)} != 1.0`,
    });
  }
  if (
    typeof input.pHomeEarlyPayoutWin === "number" &&
    input.pHomeEarlyPayoutWin + 1e-12 < input.pHome
  ) {
    violations.push({
      code: "mathematical_invariant_violation",
      detail: `Violación P(A U B) < P(A) local: pHomeEarlyPayout (${input.pHomeEarlyPayoutWin.toFixed(6)}) < corePHome (${input.pHome.toFixed(6)})`,
    });
  }
  if (
    typeof input.pAwayEarlyPayoutWin === "number" &&
    input.pAwayEarlyPayoutWin + 1e-12 < input.pAway
  ) {
    violations.push({
      code: "mathematical_invariant_violation",
      detail: `Violación P(A U B) < P(A) visita: pAwayEarlyPayout (${input.pAwayEarlyPayoutWin.toFixed(6)}) < corePAway (${input.pAway.toFixed(6)})`,
    });
  }
  for (const b of input.epistemicBands ?? []) {
    if (
      b.pLower90 <= 0.0 ||
      b.pUpper90 >= 1.0 ||
      b.pLower90 > b.pPoint + 1e-12 ||
      b.pPoint > b.pUpper90 + 1e-12
    ) {
      violations.push({
        code: "mathematical_invariant_violation",
        detail: `Banda epistémica inválida en '${b.label}': [${b.pLower90}, ${b.pPoint}, ${b.pUpper90}]`,
      });
    }
  }
  for (const sgp of input.sgpChecks ?? []) {
    const k = sgp.legProbs.length;
    if (k >= 2) {
      const fLo = Math.max(0.0, sgp.legProbs.reduce((a, b) => a + b, 0.0) - (k - 1));
      const fHi = Math.min(...sgp.legProbs);
      if (sgp.jointProbability + 1e-6 < fLo || sgp.jointProbability - 1e-6 > fHi) {
        violations.push({
          code: "mathematical_invariant_violation",
          detail: `Violación Fréchet-Hoeffding en SGP '${sgp.label}': ${sgp.jointProbability.toFixed(5)} fuera de [${fLo.toFixed(5)}, ${fHi.toFixed(5)}]`,
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
