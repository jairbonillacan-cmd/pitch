import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  parseSpanishAlertPromptDeterministic,
  type MarketAlertRule,
} from "../../apps/web/src/server/market-alerts-engine";

interface GoldenAlertScenario {
  readonly id: string;
  readonly category: string;
  readonly promptEs: string;
  readonly expectedOutcome: "accept" | "reject";
  readonly expectedRule?: Readonly<Record<string, unknown>>;
  readonly expectedRejectCode?: string;
}

interface GoldenAlertsDataset {
  readonly schemaVersion: string;
  readonly suite: string;
  readonly allowedTriggers: readonly string[];
  readonly scenarios: readonly GoldenAlertScenario[];
}

interface ScenarioEvalRow {
  readonly id: string;
  readonly expected: "accept" | "reject";
  readonly actual: "accept" | "reject";
  readonly passed: boolean;
  readonly detail: string;
}

function compareRuleFields(
  expected: Readonly<Record<string, unknown>>,
  actual: MarketAlertRule,
): string[] {
  const actualRecord: Readonly<Record<string, unknown>> = {
    trigger: actual.trigger,
    sport: actual.sport,
    league: actual.league,
    marketFamily: actual.marketFamily,
    teamQuery: actual.teamQuery,
    playerQuery: actual.playerQuery,
    playerStatKey: actual.playerStatKey ?? null,
    direction: actual.direction,
    line: actual.line,
    minEvPct: actual.minEvPct,
    minDeltaNoVigPp: actual.minDeltaNoVigPp,
    preferredBook: actual.preferredBook,
    recurring: actual.recurring,
  };
  const diffs: string[] = [];
  for (const [key, expectedVal] of Object.entries(expected)) {
    const actualVal = actualRecord[key];
    if (actualVal !== expectedVal) {
      diffs.push(`${key}: esperado=${JSON.stringify(expectedVal)} obtenido=${JSON.stringify(actualVal)}`);
    }
  }
  if (!("playerStatKey" in expected) && actual.playerStatKey) {
    diffs.push(`playerStatKey inesperado=${JSON.stringify(actual.playerStatKey)}`);
  }
  return diffs;
}

function evaluateScenario(scenario: GoldenAlertScenario): ScenarioEvalRow {
  const res = parseSpanishAlertPromptDeterministic(scenario.promptEs);

  if (scenario.expectedOutcome === "accept") {
    if (res.outcome !== "accept") {
      return {
        id: scenario.id,
        expected: "accept",
        actual: "reject",
        passed: false,
        detail: `rechazado inesperadamente (${res.rejectCode}: ${res.message})`,
      };
    }
    const diffs = compareRuleFields(scenario.expectedRule ?? {}, res.rule);
    if (diffs.length > 0) {
      return {
        id: scenario.id,
        expected: "accept",
        actual: "accept",
        passed: false,
        detail: diffs.join("; "),
      };
    }
    return {
      id: scenario.id,
      expected: "accept",
      actual: "accept",
      passed: true,
      detail: `${res.rule.trigger} · ${res.rule.league} · ${res.rule.marketFamily ?? "calendario"}`,
    };
  }

  if (res.outcome !== "reject") {
    return {
      id: scenario.id,
      expected: "reject",
      actual: "accept",
      passed: false,
      detail: `aceptado inesperadamente (${res.rule.trigger}/${res.rule.league})`,
    };
  }
  if (scenario.expectedRejectCode && res.rejectCode !== scenario.expectedRejectCode) {
    return {
      id: scenario.id,
      expected: "reject",
      actual: "reject",
      passed: false,
      detail: `rejectCode esperado=${scenario.expectedRejectCode} obtenido=${res.rejectCode}`,
    };
  }
  return {
    id: scenario.id,
    expected: "reject",
    actual: "reject",
    passed: true,
    detail: `rejectCode=${res.rejectCode}`,
  };
}

function main(): void {
  const goldenPath = fileURLToPath(new URL("./alerts-golden.json", import.meta.url));
  const raw = readFileSync(goldenPath, "utf8");
  const dataset = JSON.parse(raw) as GoldenAlertsDataset;

  if (!Array.isArray(dataset.scenarios) || dataset.scenarios.length < 16) {
    console.error(
      `[eval:alerts] Se requieren 16 escenarios golden (encontrados: ${dataset.scenarios?.length ?? 0}).`,
    );
    process.exit(1);
  }

  const rows = dataset.scenarios.map(evaluateScenario);
  const acceptRows = rows.filter((r) => r.expected === "accept");
  const rejectRows = rows.filter((r) => r.expected === "reject");
  const passedCount = rows.filter((r) => r.passed).length;
  const acceptPassed = acceptRows.filter((r) => r.passed).length;
  const rejectPassed = rejectRows.filter((r) => r.passed).length;

  console.log("=== PitchLab Alertas de Mercado · Suite Golden ES (eval:alerts) ===");
  console.log(
    `${"ESCENARIO".padEnd(44)} ${"ESP".padEnd(7)} ${"ACT".padEnd(7)} ${"ESTADO".padEnd(6)} DETALLE`,
  );
  console.log("-".repeat(118));
  for (const row of rows) {
    const status = row.passed ? "PASS" : "FAIL";
    console.log(
      `${row.id.padEnd(44)} ${row.expected.padEnd(7)} ${row.actual.padEnd(7)} ${status.padEnd(6)} ${row.detail}`,
    );
  }
  console.log("-".repeat(118));
  console.log(
    `Resumen: ${passedCount}/${rows.length} aprobados (accept=${acceptPassed}/${acceptRows.length} | reject=${rejectPassed}/${rejectRows.length})`,
  );

  if (passedCount !== rows.length) {
    console.error(`[eval:alerts] FALLO: ${rows.length - passedCount} escenario(s) fallaron.`);
    process.exit(1);
  }

  console.log(`[eval:alerts] OK: ${passedCount}/${rows.length} escenarios golden aprobados.`);
  process.exit(0);
}

main();
