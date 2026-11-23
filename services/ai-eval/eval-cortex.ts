import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  checkTeamConsistency,
  sanitizeCortexField,
  validateCortexText,
  type CortexFacts,
} from "../../packages/contracts/src/cortex";
import { asLeagueId } from "../../packages/contracts/src/ids";
import {
  sportHasDraw,
  sportScoringUnit,
  type PlatformSport,
} from "../../packages/contracts/src/view-models";
import {
  auditCortexNarrativeV5,
  deterministicVerifiedSummaryV5,
} from "../../apps/web/src/server/spacetime-v5";
import type { PlatformGame } from "../../packages/ui/src/platform/types";

interface GoldenGameSpec {
  readonly id: string;
  readonly league: string;
  readonly leagueLabel: string;
  readonly sport: PlatformSport;
  readonly homeName: string;
  readonly homeShortName: string;
  readonly homeCode: string;
  readonly awayName: string;
  readonly awayShortName: string;
  readonly awayCode: string;
  readonly x12: [number, number, number];
  readonly projection: { readonly home: number; readonly away: number; readonly total: number };
  readonly goalLine?: { readonly line: number; readonly pOver: number } | null;
  readonly market: {
    readonly bookLabel: string;
    readonly noVig: { readonly home: number; readonly draw: number; readonly away: number };
  } | null;
  readonly drivers: readonly { readonly label: string; readonly impactLogit: number }[];
  readonly absences: readonly string[];
  readonly stadium: string | null;
}

interface GoldenScenario {
  readonly id: string;
  readonly category: string;
  readonly expectedOutcome: "accept" | "reject";
  readonly expectedRejectBy?: readonly ("validateCortexText" | "auditCortexNarrativeV5")[];
  readonly sanitizationAssertions?: { readonly forbiddenSubstrings: readonly string[] };
  readonly extras?: Record<string, unknown>;
  readonly game: GoldenGameSpec;
  readonly candidateText: string;
}

interface GoldenDataset {
  readonly schemaVersion: string;
  readonly suite: string;
  readonly scenarios: readonly GoldenScenario[];
}

interface ScenarioReportRow {
  readonly id: string;
  readonly category: string;
  readonly expected: "accept" | "reject";
  readonly actual: "accept" | "reject";
  readonly textCheck: string;
  readonly v5Audit: string;
  readonly deterministicOk: boolean;
  readonly passed: boolean;
  readonly failureDetail: string | null;
}

function pctLabel(probability: number): string {
  return `${Math.round(probability * 100)} %`;
}

function clampProb(value: number): number {
  return Math.max(0.001, Math.min(0.999, value));
}

function buildSanitizedPlatformGame(spec: GoldenGameSpec): PlatformGame {
  const homeShort = sanitizeCortexField(spec.homeShortName, 32) || "Local";
  const awayShort = sanitizeCortexField(spec.awayShortName, 32) || "Visita";
  const homeName = sanitizeCortexField(spec.homeName, 60) || homeShort;
  const awayName = sanitizeCortexField(spec.awayName, 60) || awayShort;
  const leagueLabel = sanitizeCortexField(spec.leagueLabel, 48);
  const stadiumName = spec.stadium ? sanitizeCortexField(spec.stadium, 80) : null;

  return {
    id: spec.id,
    league: asLeagueId(spec.league),
    leagueLabel,
    sport: spec.sport,
    round: "Jornada Eval",
    dayId: "2026-11-21",
    dayLabel: "sábado, 21 de noviembre",
    kickoffUtc: "2026-11-21T20:00:00Z",
    kickoffLocal: "14:00",
    venue: stadiumName ?? "Estadio Local",
    status: "NS",
    home: {
      slug: spec.homeCode.toLowerCase(),
      name: homeName,
      shortName: homeShort,
      code: spec.homeCode,
      record: "10G-3E-2P",
    },
    away: {
      slug: spec.awayCode.toLowerCase(),
      name: awayName,
      shortName: awayShort,
      code: spec.awayCode,
      record: "7G-4E-4P",
    },
    hasForecast: true,
    x12: spec.x12,
    projection: {
      home: spec.projection.home,
      away: spec.projection.away,
      total: spec.projection.total,
    },
    goalLine: spec.goalLine ?? null,
    confidenceScore: null,
    confidenceLevel: null,
    picks: [],
    preGame: {
      cortexSynthesis: "",
      tacticalKeys: [],
      lineupStatusLabel: "Pendiente",
      lineupsConfirmed60m: false,
      absences: spec.absences.map((player) => ({
        teamSide: "away",
        player: sanitizeCortexField(player, 48),
        role: "Titular",
        status: "Baja",
        impactNote: "Ausencia confirmada",
      })),
      moneyFlow: null,
    },
    markets: [],
    factors: [],
    headToHead: [],
    updatedAtLabel: "2026-11-21",
    spacetime: {
      engineName: "PitchLab Singularity v5.1",
      sportsEngineName: "PitchLab Spacetime v5.1",
      probs: { home: spec.x12[0], draw: spec.x12[1], away: spec.x12[2] },
      market: spec.market
        ? {
            bookLabel: sanitizeCortexField(spec.market.bookLabel, 40),
            asOfUtc: "2026-11-21T18:00:00Z",
            overround: 1.04,
            noVig: spec.market.noVig,
            odds: { home: 2.0, draw: sportHasDraw(spec.sport) ? 3.4 : null, away: 3.5 },
          }
        : null,
      value: [],
      expectedTotal: spec.projection.total,
      expectedMargin: spec.projection.home - spec.projection.away,
      drivers: spec.drivers.map((d) => ({
        label: sanitizeCortexField(d.label, 64),
        impactLogit: d.impactLogit,
      })),
      availability: {
        homeInjured: 0,
        awayInjured: spec.absences.length,
        homeMissingValuePct: 0,
        awayMissingValuePct: 0,
      },
      stadium: { name: stadiumName, elevationM: null },
    },
  };
}

function buildFactsFromSpec(spec: GoldenGameSpec, extras?: Record<string, unknown>): CortexFacts {
  const hasDraw = sportHasDraw(spec.sport);
  const digits = sportScoringUnit(spec.sport).decimals;
  const homeShort = sanitizeCortexField(spec.homeShortName, 32) || "Local";
  const awayShort = sanitizeCortexField(spec.awayShortName, 32) || "Visita";
  const homeName = sanitizeCortexField(spec.homeName, 60) || homeShort;
  const awayName = sanitizeCortexField(spec.awayName, 60) || awayShort;
  const [ph, pd, pa] = spec.x12;

  const probabilidades: Record<string, string> = {};
  probabilidades[homeShort] = pctLabel(ph);
  if (hasDraw) probabilidades.Empate = pctLabel(pd);
  probabilidades[awayShort] = pctLabel(pa);

  const stadium = spec.stadium ? sanitizeCortexField(spec.stadium, 80) : "";

  return {
    partido: `${homeName} vs ${awayName}`,
    local: `${homeName} (juega en casa)`,
    visitante: `${awayName} (juega de visita)`,
    liga: sanitizeCortexField(spec.leagueLabel, 48),
    probabilidades,
    proyeccion: `${homeShort} ${spec.projection.home.toFixed(digits)} – ${spec.projection.away.toFixed(digits)} ${awayShort}`,
    mercado: spec.market
      ? {
          casa: sanitizeCortexField(spec.market.bookLabel, 40),
          probabilidades: Object.fromEntries(
            [
              [homeShort, pctLabel(spec.market.noVig.home)],
              ...(hasDraw ? [["Empate", pctLabel(spec.market.noVig.draw)]] : []),
              [awayShort, pctLabel(spec.market.noVig.away)],
            ] as Array<[string, string]>,
          ),
        }
      : null,
    factores: spec.drivers.slice(0, 3).map(
      (d) =>
        `${sanitizeCortexField(d.label, 64)} (${d.impactLogit >= 0 ? `a favor de ${homeShort}` : `a favor de ${awayShort}`})`,
    ),
    bajas: spec.absences
      .slice(0, 12)
      .map((name) => sanitizeCortexField(name, 48))
      .filter(Boolean),
    estadio: stadium || null,
    ...(extras ? { extras } : {}),
  };
}

function enrichFactsForDeterministicSummary(facts: CortexFacts, game: PlatformGame): CortexFacts {
  const [rawH, rawD, rawA] = game.x12 ?? [0.5, 0, 0.5];
  const hasDraw = game.sport === "football";
  const sum = hasDraw ? rawH + rawD + rawA : rawH + rawA;
  const pHome = clampProb(rawH / sum);
  const pDraw = hasDraw ? clampProb(rawD / sum) : null;
  const pAway = clampProb(rawA / sum);
  const expectedTotal = game.projection?.total ?? (hasDraw ? 2.6 : 44.5);
  const canonicalTotalLine = game.goalLine?.line ?? (hasDraw ? 2.5 : 44.5);
  const pOverCanonical = game.goalLine?.pOver ?? 0.5;

  return {
    ...facts,
    extras: {
      ...(facts.extras ?? {}),
      pHomePct: (pHome * 100).toFixed(1),
      pDrawPct: pDraw !== null ? (pDraw * 100).toFixed(1) : null,
      pAwayPct: (pAway * 100).toFixed(1),
      expectedTotal: expectedTotal.toFixed(2),
      canonicalTotalLine: canonicalTotalLine.toFixed(1),
      pOverPct: (pOverCanonical * 100).toFixed(1),
    },
  };
}

function evaluateScenario(scenario: GoldenScenario): ScenarioReportRow {
  const failures: string[] = [];
  const sanitizedGame = buildSanitizedPlatformGame(scenario.game);
  const facts = buildFactsFromSpec(scenario.game, scenario.extras);

  if (scenario.sanitizationAssertions) {
    const combinedSanitized = [
      facts.partido,
      facts.local,
      facts.visitante,
      facts.liga,
      facts.estadio ?? "",
      ...facts.bajas,
    ]
      .join(" ")
      .toLowerCase();

    for (const forbidden of scenario.sanitizationAssertions.forbiddenSubstrings) {
      if (combinedSanitized.includes(forbidden.toLowerCase())) {
        failures.push(`sanitizeCortexField dejó pasar '${forbidden}'`);
      }
    }
  }

  const textValidation = validateCortexText(scenario.candidateText, facts);
  const consistencyIssue = checkTeamConsistency(scenario.candidateText, facts);
  const v5Audit = auditCortexNarrativeV5(sanitizedGame, scenario.candidateText);
  const actual: "accept" | "reject" = textValidation.ok && v5Audit.passed ? "accept" : "reject";

  if (actual !== scenario.expectedOutcome) {
    failures.push(
      `esperaba ${scenario.expectedOutcome}, obtuvo ${actual} (validateCortexText=${textValidation.ok ? "ok" : textValidation.reason}, v5=${v5Audit.passed ? "ok" : v5Audit.reasons.join(",")})`,
    );
  }

  if (scenario.expectedOutcome === "accept" && consistencyIssue !== null) {
    failures.push(`checkTeamConsistency reportó '${consistencyIssue}' en caso válido`);
  }

  if (scenario.expectedRejectBy) {
    for (const guard of scenario.expectedRejectBy) {
      if (guard === "validateCortexText" && textValidation.ok) {
        failures.push("validateCortexText debió rechazar este escenario adversarial");
      }
      if (guard === "auditCortexNarrativeV5" && v5Audit.passed) {
        failures.push("auditCortexNarrativeV5 debió rechazar este escenario adversarial");
      }
    }
  }

  const detSummary = deterministicVerifiedSummaryV5(sanitizedGame);
  let deterministicOk = true;
  if (!detSummary) {
    deterministicOk = false;
    failures.push("deterministicVerifiedSummaryV5 devolvió null");
  } else {
    const detV5 = auditCortexNarrativeV5(sanitizedGame, detSummary);
    const detText = validateCortexText(detSummary, enrichFactsForDeterministicSummary(facts, sanitizedGame));
    const detConsistency = checkTeamConsistency(detSummary, facts);
    if (!detV5.passed) {
      deterministicOk = false;
      failures.push(`fallback determinista falló auditCortexNarrativeV5: ${detV5.reasons.join("; ")}`);
    }
    if (!detText.ok) {
      deterministicOk = false;
      failures.push(`fallback determinista falló validateCortexText: ${detText.reason}`);
    }
    if (detConsistency !== null) {
      deterministicOk = false;
      failures.push(`fallback determinista falló checkTeamConsistency: ${detConsistency}`);
    }
  }

  return {
    id: scenario.id,
    category: scenario.category,
    expected: scenario.expectedOutcome,
    actual,
    textCheck: textValidation.ok ? "ok" : textValidation.reason,
    v5Audit: v5Audit.passed ? "ok" : v5Audit.reasons[0] ?? "fail",
    deterministicOk,
    passed: failures.length === 0,
    failureDetail: failures.length > 0 ? failures.join(" | ") : null,
  };
}

function main(): void {
  const goldenPath = fileURLToPath(new URL("./cortex-golden.json", import.meta.url));
  const raw = readFileSync(goldenPath, "utf8");
  const dataset = JSON.parse(raw) as GoldenDataset;

  if (!Array.isArray(dataset.scenarios) || dataset.scenarios.length < 20) {
    console.error(`[eval:cortex] Se requieren al menos 20 escenarios golden (encontrados: ${dataset.scenarios?.length ?? 0}).`);
    process.exit(1);
  }

  const rows = dataset.scenarios.map(evaluateScenario);
  const validRows = rows.filter((r) => r.expected === "accept");
  const adversarialRows = rows.filter((r) => r.expected === "reject");
  const validPassed = validRows.filter((r) => r.passed).length;
  const adversarialRejected = adversarialRows.filter((r) => r.actual === "reject" && r.passed).length;
  const deterministicPassed = rows.filter((r) => r.deterministicOk).length;
  const failedRows = rows.filter((r) => !r.passed);

  console.log("=== PitchLab Cortex IA · Suite Formal de Evaluación (eval:cortex) ===");
  console.log(
    `${"ESCENARIO".padEnd(40)} ${"ESP".padEnd(7)} ${"ACT".padEnd(7)} ${"DET".padEnd(5)} ${"ESTADO".padEnd(6)} DETALLE`,
  );
  console.log("-".repeat(118));
  for (const row of rows) {
    const status = row.passed ? "PASS" : "FAIL";
    const det = row.deterministicOk ? "OK" : "ERR";
    const detail = row.failureDetail ?? `text=${row.textCheck} · v5=${row.v5Audit}`;
    console.log(
      `${row.id.padEnd(40)} ${row.expected.padEnd(7)} ${row.actual.padEnd(7)} ${det.padEnd(5)} ${status.padEnd(6)} ${detail}`,
    );
  }
  console.log("-".repeat(118));
  console.log(
    `Resumen: total=${rows.length} | válidos=${validPassed}/${validRows.length} | adversariales rechazados=${adversarialRejected}/${adversarialRows.length} | fallback determinista=${deterministicPassed}/${rows.length}`,
  );

  if (failedRows.length > 0) {
    console.error(`[eval:cortex] FALLO: ${failedRows.length} escenario(s) no cumplieron los guardrails.`);
    process.exit(1);
  }

  console.log("[eval:cortex] OK: 100 % de escenarios válidos, adversariales y respaldos deterministas aprobados.");
}

main();
