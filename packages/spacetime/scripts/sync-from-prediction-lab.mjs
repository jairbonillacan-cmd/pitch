#!/usr/bin/env node
// Copia los motores o los artefactos JSON de Spacetime Suite desde la rama `prediction-lab`.
//
// Uso:
//   node packages/spacetime/scripts/sync-from-prediction-lab.mjs [--data-only] [ref]
//   - `--data-only`: sincroniza únicamente artefactos `.json` validados (seguro para cron CI, SEC-10).
//   - Sin bandera: sincroniza código `.ts`, `.json` y `.test.ts` para revisión humana local.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const rawArgs = process.argv.slice(2);
const dataOnly = rawArgs.includes("--data-only");
const positional = rawArgs.filter((a) => !a.startsWith("--"));
const ref = positional[0] ?? "origin/prediction-lab";

if (!/^[A-Za-z0-9._/-]{1,128}$/.test(ref) || ref.startsWith("-") || ref.includes("..")) {
  throw new Error(`Referencia git inválida para sincronizar Spacetime: ${ref}`);
}

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ALL_SOURCES = [
  { from: "src/domain/prediction", to: "src", ext: ".ts" },
  { from: "src/data/prediction", to: "data", ext: ".json" },
  { from: "tests/prediction", to: "tests", ext: ".test.ts" },
];
const SOURCES = dataOnly ? ALL_SOURCES.filter((s) => s.ext === ".json") : ALL_SOURCES;

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: pkgDir }).toString("utf8").trim();

function git(...args) {
  return execFileSync("git", args, { cwd: repoRoot, maxBuffer: 256 * 1024 * 1024 }).toString("utf8");
}

function gitRevParseOrNull(spec) {
  try {
    return execFileSync("git", ["rev-parse", "--verify", "--quiet", spec], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString("utf8")
      .trim();
  } catch {
    return null;
  }
}

function safeChildPath(parentDir, fileName) {
  if (!fileName || basename(fileName) !== fileName || fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
    throw new Error(`Nombre de archivo inválido en árbol remoto: ${fileName}`);
  }
  const resolvedParent = resolve(parentDir);
  const resolvedChild = resolve(resolvedParent, fileName);
  if (!resolvedChild.startsWith(resolvedParent + sep)) {
    throw new Error(`Ruta fuera del directorio destino bloqueada: ${fileName}`);
  }
  return resolvedChild;
}

// Pruebas que verifican el repo de investigación (Python en research/.venv, artefactos de
// services/models, ledger en data/ledger o el SHA de la copia CRLF de Windows). Pasan en
// prediction-lab; aquí esos archivos no existen, así que se omiten dejando el motivo registrado.
const TIMING_ONLY = "límite en milisegundos: depende de la máquina y de la carga; se mide en prediction-lab";
const RESEARCH_ONLY = "solo verificable en prediction-lab (Python, services/models o data/ledger)";
const CRLF_SHA_ONLY = "el SHA congelado se calculó sobre la copia CRLF de Windows; el blob de git (LF) es idéntico";
const APP_COMPAT_ODDS =
  "extensión retrocompatible de la app/ingesta (d00d2ff4): campos opcionales de movimiento de línea y mejor cuota en OddsSnapshotRow";
const APP_COMPAT_OUTLOOK =
  "extensión retrocompatible de la app/ingesta (3ac08e22): expone oddsBySelection en MarketQuoteContext para cuotas reales en UI";
const APP_COMPAT_SGP_FRECHET =
  "corrección cuantitativa retrocompatible (9178814d): impone cota inferior exacta de Fréchet-Hoeffding en evaluatePlayerLinkedSgpV5";
const CONSTRAINT_FIRST_NUMBER_CAST =
  "Constraint-First (ADR-056): reemplaza coerción laxa Number() por parseo estricto equivalente IEEE-754";
const LOCAL_PRESERVED_TESTS = new Set(["v5_1_production_invariants.test.ts"]);
const STRIP_COMMENTS_SRC_FILES = new Set([
  "src/v5_2_live_feedback.ts",
  "src/soccer_57_v6_0.ts",
  "src/props_v6_0.ts",
  "src/multisport_v6_0.ts",
  "src/prekickoff_freeze_v6_0.ts",
  "src/unified_outlook_v6.ts",
  "src/v6_index.ts",
]);
const skipTest = (file, title, reason = RESEARCH_ONLY) => ({
  file,
  find: `it(${JSON.stringify(title)}`,
  replace: `it.skip(${JSON.stringify(title)}`,
  reason,
});

function stripJsComments(source) {
  const regexKeywords = new Set([
    "return",
    "throw",
    "case",
    "in",
    "of",
    "instanceof",
    "typeof",
    "void",
    "delete",
    "yield",
    "await",
    "new",
    "else",
    "do",
  ]);
  const regexPuncts = new Set([
    "(",
    "[",
    "{",
    ",",
    ";",
    ":",
    "=",
    "!",
    "?",
    "&",
    "|",
    "^",
    "~",
    "+",
    "-",
    "*",
    "%",
    "=>",
  ]);
  const len = source.length;
  const out = [];
  const templateBraceStack = [];
  let inTemplateChunk = false;
  let prevTokenType = "start";
  let prevTokenValue = "";
  let i = 0;

  while (i < len) {
    if (inTemplateChunk) {
      const start = i;
      while (i < len) {
        const ch = source[i];
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === "$" && source[i + 1] === "{") {
          out.push(source.slice(start, i + 2));
          templateBraceStack.push(0);
          inTemplateChunk = false;
          prevTokenType = "punct";
          prevTokenValue = "{";
          i += 2;
          break;
        }
        if (ch === "`") {
          out.push(source.slice(start, i + 1));
          inTemplateChunk = false;
          prevTokenType = "string";
          prevTokenValue = "`";
          i += 1;
          break;
        }
        i += 1;
      }
      if (inTemplateChunk) {
        out.push(source.slice(start, i));
        inTemplateChunk = false;
      }
      continue;
    }

    const ch = source[i];
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      out.push(ch);
      i += 1;
      continue;
    }

    if (ch === "/") {
      const next = source[i + 1];
      if (next === "/") {
        const nlIdx = source.indexOf("\n", i + 2);
        i = nlIdx === -1 ? len : nlIdx;
        continue;
      }
      if (next === "*") {
        const closeIdx = source.indexOf("*/", i + 2);
        const end = closeIdx === -1 ? len : closeIdx + 2;
        const seg = source.slice(i, end);
        out.push(seg.includes("\n") ? "\n" : " ");
        i = end;
        continue;
      }
      const canRegex =
        prevTokenType === "start" ||
        (prevTokenType === "punct" && regexPuncts.has(prevTokenValue)) ||
        (prevTokenType === "word" && regexKeywords.has(prevTokenValue));
      if (canRegex) {
        const start = i;
        i += 1;
        let inClass = false;
        while (i < len) {
          const rc = source[i];
          if (rc === "\\") {
            i += 2;
            continue;
          }
          if (rc === "[") {
            inClass = true;
          } else if (rc === "]") {
            inClass = false;
          } else if (rc === "/" && !inClass) {
            i += 1;
            while (i < len && /[a-z]/i.test(source[i])) i += 1;
            break;
          } else if (rc === "\n") {
            break;
          }
          i += 1;
        }
        out.push(source.slice(start, i));
        prevTokenType = "regex";
        prevTokenValue = "/";
        continue;
      }
    }

    if (ch === "'" || ch === '"') {
      const start = i;
      const quote = ch;
      i += 1;
      while (i < len) {
        const sc = source[i];
        if (sc === "\\") {
          i += 2;
          continue;
        }
        if (sc === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      out.push(source.slice(start, i));
      prevTokenType = "string";
      prevTokenValue = quote;
      continue;
    }

    if (ch === "`") {
      out.push("`");
      inTemplateChunk = true;
      i += 1;
      continue;
    }

    if (ch === "{" && templateBraceStack.length > 0) {
      templateBraceStack[templateBraceStack.length - 1] += 1;
      out.push("{");
      prevTokenType = "punct";
      prevTokenValue = "{";
      i += 1;
      continue;
    }

    if (ch === "}" && templateBraceStack.length > 0) {
      if (templateBraceStack[templateBraceStack.length - 1] === 0) {
        templateBraceStack.pop();
        out.push("}");
        inTemplateChunk = true;
        i += 1;
        continue;
      }
      templateBraceStack[templateBraceStack.length - 1] -= 1;
      out.push("}");
      prevTokenType = "punct";
      prevTokenValue = "}";
      i += 1;
      continue;
    }

    if (/[A-Za-z_$]/.test(ch)) {
      const start = i;
      i += 1;
      while (i < len && /[A-Za-z0-9_$]/.test(source[i])) i += 1;
      const word = source.slice(start, i);
      out.push(word);
      prevTokenType = "word";
      prevTokenValue = word;
      continue;
    }

    if (/[0-9]/.test(ch)) {
      const start = i;
      i += 1;
      while (i < len && /[0-9A-Za-z._]/.test(source[i])) i += 1;
      out.push(source.slice(start, i));
      prevTokenType = "number";
      prevTokenValue = "";
      continue;
    }

    if (ch === "=" && source[i + 1] === ">") {
      out.push("=>");
      prevTokenType = "punct";
      prevTokenValue = "=>";
      i += 2;
      continue;
    }

    if ((ch === "+" && source[i + 1] === "+") || (ch === "-" && source[i + 1] === "-")) {
      const tok = source.slice(i, i + 2);
      out.push(tok);
      prevTokenType = "punct";
      prevTokenValue = tok;
      i += 2;
      continue;
    }

    out.push(ch);
    prevTokenType = "punct";
    prevTokenValue = ch;
    i += 1;
  }

  return `${out
    .join("")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimStart()
    .trimEnd()}\n`;
}

const PATCHES = [
  // Extensiones retrocompatibles consumidas por @pitchlab/web y @pitchlab/ingest (sin alterar cálculos congelados v3.2).
  {
    file: "src/odds.ts",
    find: [
      "/** Esquema exacto de una fila en `odds_snapshots.parquet` (+ `snapshot_stage` auxiliar opcional). */",
      "export interface OddsSnapshotRow {",
      "  readonly event_id: string;",
      "  readonly sport: string;",
      "  readonly league: string;",
      "  readonly market: string;",
      "  readonly line: number | null;",
      "  readonly selection: string;",
      "  readonly book: string;",
      "  readonly price_decimal: number;",
      "  readonly ts_captured: string;",
    ].join("\n"),
    replace: [
      'export type OddsLineMovement = "shortening" | "drifting" | "stable";',
      "",
      "/** Esquema exacto de una fila en `odds_snapshots.parquet` (+ auxiliares opcionales de apertura/movimiento). */",
      "export interface OddsSnapshotRow {",
      "  readonly event_id: string;",
      "  readonly sport: string;",
      "  readonly league: string;",
      "  readonly market: string;",
      "  readonly line: number | null;",
      "  readonly selection: string;",
      "  readonly book: string;",
      "  readonly price_decimal: number;",
      "  readonly opening_price?: number | null;",
      "  readonly movement_direction?: OddsLineMovement | null;",
      "  readonly is_best_odds?: boolean;",
      "  readonly ts_captured: string;",
    ].join("\n"),
    reason: APP_COMPAT_ODDS,
  },
  {
    file: "src/outlook.ts",
    find: [
      "export interface MarketQuoteContext {",
      "  readonly book: string;",
      "  readonly tsCaptured: string;",
      "  readonly overround: number;",
      "}",
    ].join("\n"),
    replace: [
      "export interface MarketQuoteContext {",
      "  readonly book: string;",
      "  readonly tsCaptured: string;",
      "  readonly overround: number;",
      "  readonly oddsBySelection?: Readonly<Record<string, number>>;",
      "}",
    ].join("\n"),
    reason: APP_COMPAT_OUTLOOK,
  },
  {
    file: "src/outlook.ts",
    find: [
      "          book: contextQuote.book,",
      "          tsCaptured: contextQuote.tsCaptured,",
      "          overround: contextQuote.overround,",
      "        })",
    ].join("\n"),
    replace: [
      "          book: contextQuote.book,",
      "          tsCaptured: contextQuote.tsCaptured,",
      "          overround: contextQuote.overround,",
      "          oddsBySelection: Object.freeze({ ...contextQuote.oddsBySelection }),",
      "        })",
    ].join("\n"),
    reason: APP_COMPAT_OUTLOOK,
  },
  {
    file: "src/sgp_copula.ts",
    find: [
      "  const upperBound = Math.min(",
      "    pPlayer,",
      '    params.teamOutcome === "any" ? 1.0 : pTeamMarg,',
      "    hasTot ? pTotMarg : 1.0,",
      "  );",
      "  const jointProb = clamp(jointProbRaw, 0.0005, Math.max(0.001, upperBound));",
    ].join("\n"),
    replace: [
      "  const legMarginals: number[] = [pPlayer];",
      '  if (params.teamOutcome !== "any") legMarginals.push(pTeamMarg);',
      "  if (hasTot) legMarginals.push(pTotMarg);",
      "  const upperBound = Math.max(0.0, Math.min(...legMarginals));",
      "  const frechetLo = Math.max(",
      "    0.0,",
      "    legMarginals.reduce((acc, prob) => acc + prob, 0.0) - (legMarginals.length - 1),",
      "  );",
      "  const lowerBound = Math.min(upperBound, frechetLo);",
      "  const jointProb = clamp(jointProbRaw, lowerBound, upperBound);",
    ].join("\n"),
    reason: APP_COMPAT_SGP_FRECHET,
  },
  {
    file: "src/props_v6_0.ts",
    find: [
      "    if (isBaseballIp) {",
      "      const sRepr = raw.toFixed(1);",
      "      if (Math.abs(raw - Number(sRepr)) < 1e-9) {",
      "        const mIp = BASEBALL_IP_RE_V6.exec(sRepr);",
      "        if (mIp) {",
      "          return Number(mIp[1]!) + Number(mIp[2]!) / 3.0;",
      "        }",
      "      }",
      "    }",
      "    return raw;",
      "  }",
      "",
      '  const s = String(raw).trim();',
      '  if (!s || s === "-" || s === "--" || s === "N/A" || s === "DNP") return null;',
      "",
      "  if (isBaseballIp) {",
      "    const mIp = BASEBALL_IP_RE_V6.exec(s);",
      "    if (mIp) {",
      "      return Number(mIp[1]!) + Number(mIp[2]!) / 3.0;",
      "    }",
      "  }",
      "",
      "  const mClk = CLOCK_RE_V6.exec(s);",
      "  if (mClk) {",
      "    return Number(mClk[1]!) + Number(mClk[2]!) / 60.0;",
      "  }",
      "",
      '  const sClean = s.replace(/%+$/, "").replace(/,/g, "");',
      "  const val = Number(sClean);",
      "  return Number.isFinite(val) ? val : null;",
      "}",
      "",
      "function parseMadeAttemptedV6(raw: string | number | null | undefined): readonly [number, number] | null {",
      '  if (typeof raw !== "string") return null;',
      "  const m = MADE_ATT_RE_V6.exec(raw.trim());",
      "  if (!m) return null;",
      "  return [Number(m[1]!), Number(m[2]!)];",
      "}",
    ].join("\n"),
    replace: [
      "    if (isBaseballIp) {",
      "      const sRepr = raw.toFixed(1);",
      "      if (Math.abs(raw - Number.parseFloat(sRepr)) < 1e-9) {",
      "        const mIp = BASEBALL_IP_RE_V6.exec(sRepr);",
      "        if (mIp) {",
      "          return Number.parseInt(mIp[1]!, 10) + Number.parseInt(mIp[2]!, 10) / 3.0;",
      "        }",
      "      }",
      "    }",
      "    return raw;",
      "  }",
      "",
      '  const s = String(raw).trim();',
      '  if (!s || s === "-" || s === "--" || s === "N/A" || s === "DNP") return null;',
      "",
      "  if (isBaseballIp) {",
      "    const mIp = BASEBALL_IP_RE_V6.exec(s);",
      "    if (mIp) {",
      "      return Number.parseInt(mIp[1]!, 10) + Number.parseInt(mIp[2]!, 10) / 3.0;",
      "    }",
      "  }",
      "",
      "  const mClk = CLOCK_RE_V6.exec(s);",
      "  if (mClk) {",
      "    return Number.parseInt(mClk[1]!, 10) + Number.parseInt(mClk[2]!, 10) / 60.0;",
      "  }",
      "",
      '  const sClean = s.replace(/%+$/, "").replace(/,/g, "");',
      "  const val = /^[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?$/.test(sClean)",
      "    ? Number.parseFloat(sClean)",
      "    : Number.NaN;",
      "  return Number.isFinite(val) ? val : null;",
      "}",
      "",
      "function parseMadeAttemptedV6(raw: string | number | null | undefined): readonly [number, number] | null {",
      '  if (typeof raw !== "string") return null;',
      "  const m = MADE_ATT_RE_V6.exec(raw.trim());",
      "  if (!m) return null;",
      "  return [Number.parseFloat(m[1]!), Number.parseFloat(m[2]!)];",
      "}",
    ].join("\n"),
    reason: CONSTRAINT_FIRST_NUMBER_CAST,
  },
  {
    file: "src/prekickoff_freeze_v6_0.ts",
    find: [
      "  const probsClean: Record<string, number | null> = {};",
      "  for (const k of Object.keys(params.analysis.probabilities).sort()) {",
      "    const v = params.analysis.probabilities[k];",
      "    probsClean[k] = v === null || v === undefined ? null : Number(v);",
      "  }",
      "",
      "  const projClean: Record<string, number | null> = {};",
      "  for (const k of Object.keys(params.analysis.projection).sort()) {",
      "    const v = params.analysis.projection[k];",
      "    projClean[k] = v === null || v === undefined ? null : Number(v);",
      "  }",
    ].join("\n"),
    replace: [
      "  const probsClean: Record<string, number | null> = {};",
      "  for (const k of Object.keys(params.analysis.probabilities).sort()) {",
      "    const v = params.analysis.probabilities[k];",
      '    probsClean[k] = v === null || v === undefined ? null : typeof v === "number" ? v : Number.parseFloat(String(v));',
      "  }",
      "",
      "  const projClean: Record<string, number | null> = {};",
      "  for (const k of Object.keys(params.analysis.projection).sort()) {",
      "    const v = params.analysis.projection[k];",
      '    projClean[k] = v === null || v === undefined ? null : typeof v === "number" ? v : Number.parseFloat(String(v));',
      "  }",
    ].join("\n"),
    reason: CONSTRAINT_FIRST_NUMBER_CAST,
  },
  {
    file: "tests/ledger_prospective.test.ts",
    find: 'describe("B5 — Ledger prospectivo',
    replace: 'describe.skip("B5 — Ledger prospectivo',
    reason: RESEARCH_ONLY,
  },
  skipTest("tests/blend.test.ts", "verifica espejo exacto byte a byte, esquema completo A4 y banderas de cierre/apagado"),
  skipTest("tests/markets_2way.test.ts", "coincide a < 1e-12 en matriz Dixon-Coles, 4 mercados, retargeting, EV, Kelly ¼ y liquidación"),
  {
    file: "tests/markets_2way.test.ts",
    find: 'it("valida integridad de `markets_2way_config.json`',
    replace: 'it.skip("valida integridad de `markets_2way_config.json`',
    reason: RESEARCH_ONLY,
  },
  skipTest("tests/picks.test.ts", "8. Artefacto congelado pick_policy_v3_1.json mantiene copia exacta byte-a-byte entre Python y TS"),
  skipTest(
    "tests/service_gate.test.ts",
    "mantiene intacto el SHA-256 de production_segments_v3_1.json y los 60 segmentos en false",
    CRLF_SHA_ONLY,
  ),
  skipTest(
    "tests/service_gate.test.ts",
    "acepta solo 'solido' y 'valor' al crear picks nuevos y restringe 'baseline_v3_0'/'especulativo' a lectura histórica con paridad < 1e-12 frente a clv_report.py",
  ),
  // Suites v3.3–v5.1 que invocan scripts Python de investigación, artefactos en research/prediction-lab o SHA CRLF.
  skipTest(
    "tests/club_v3_3.test.ts",
    "valida los 3 modelos candidatos sin alterar ni un byte de producción v3.1/v3.2",
    CRLF_SHA_ONLY,
  ),
  skipTest(
    "tests/club_v3_3.test.ts",
    "reproduce bit a bit (< 1e-12) el vector vivo de 14 features abiertas frente a Python y logra cobertura 100% ok en v3.4 Live-Complete",
  ),
  skipTest(
    "tests/horizon_goals.test.ts",
    "maintains < 1e-12 IEEE-754 parity between horizon_goals.ts and horizon_dc_solver.py",
  ),
  skipTest(
    "tests/intl_soccer.test.ts",
    "valida model_intl_soccer_v1.json con engine.ts::assertValidModel y preserva production_segments_v3_1.json",
    CRLF_SHA_ONLY,
  ),
  skipTest(
    "tests/intl_soccer.test.ts",
    "valida PitchLab Meridian v3.0 (53 features base: copas élite CC0 + Banco Mundial PDDL/CC-BY-4.0) con paridad < 1e-12",
  ),
  skipTest(
    "tests/intl_soccer.test.ts",
    "reproduce bit a bit (< 1e-12) las 38 features, lambdas y ajuste de convocatoria frente a Python",
  ),
  skipTest(
    "tests/intl_soccer.test.ts",
    "reproduce bit a bit (< 1e-12) las 49 features de Meridian v2.0 (Transfermarkt CC0 + Goalscorers + FIFA SUM + Clima) frente a Python",
  ),
  skipTest(
    "tests/v5_1_remediation.test.ts",
    "Axioma 4: 0 reportes falsos promoted_ece_ge_50pct === 0.0 cuando promoted_n_ge_50pct === 0",
  ),
  skipTest(
    "tests/v5_1_remediation.test.ts",
    "Axioma 5: NFL Real ATS posterior LL <= ln(2) + 0.002, ECE < 2.5% y Std(M | spread) condicional en [13.0, 13.8]",
  ),
  skipTest(
    "tests/v5_1_remediation.test.ts",
    "Axioma 6: Matriz 4-Param sin doble inflación (w_rho_blend == 0.0, |bias O2.5| < 0.7 pp, 0 inflación extra BTTS y mejora significativa)",
  ),
  skipTest(
    "tests/v5_1_remediation.test.ts",
    "Axioma 9: SGP QMC sesgo < 0.10 pp vs MVN exacto, Student-t quantile error < 1e-6 y Raikov+DC coherente",
  ),
  skipTest(
    "tests/v5_1_remediation.test.ts",
    "Axioma 10: Booking Points gamma_red > 0 con conservación exacta de E[Y] y cobertura arbitral Big-7 > 90%",
  ),
  skipTest(
    "tests/v5_1_remediation.test.ts",
    "Axioma 12: SHA-256 intacto (0 bytes modificados) en los 11 artefactos congelados v3.0 / v3.1 / v3.2 y registro v5.1 consistente",
  ),
  // Suites v5.2–v6.0: solo se omiten pruebas que leen research/prediction-lab, services/models, SHAs CRLF o límites de latencia.
  skipTest(
    "tests/v5_2_live_feedback.test.ts",
    "5. Evidencia OOS `EXP_V57` significativa, cero claves prohibidas e integridad SHA-256 `v5.2`",
  ),
  skipTest(
    "tests/exp_v58_soccer_57_v6_0.test.ts",
    "Evidencia empírica OOS walk-forward (`5,120` partidos) y pre-kickoff estricta (`n = 57`) significativa",
  ),
  skipTest(
    "tests/exp_v58_soccer_57_v6_0.test.ts",
    "Cero claves prohibidas (`stake`, `kelly`, `kellyFraction`, `expectedEdge`, `tier`) y hashes `SHA-256` registrados",
  ),
  skipTest(
    "tests/exp_v59_props_v6_0.test.ts",
    "4. Evidencia empírica OOS `EXP_V59`, gobernanza `holdout_sealed` intacta y cero claves prohibidas",
  ),
  skipTest(
    "tests/exp_v60_multisport_v6_0.test.ts",
    "5. Dominancia algebraica Early Payout (0 / 2,920 violaciones), inferencia live state y gobernanza Red-Team",
  ),
  skipTest(
    "tests/exp_v61_officials_freeze_v6_0.test.ts",
    "audita gobernanza Red-Team: 0 campos prohibidos, 57 ligas, remedios NBA/NHL/MLB e inmutabilidad v3..v5.2",
  ),
  skipTest(
    "tests/v6_0_suite.test.ts",
    "Axioma 4: 0 reportes falsos promoted_ece_ge_50pct === 0.0 cuando n === 0 (en v5.1 y en v6.0)",
  ),
  skipTest(
    "tests/v6_0_suite.test.ts",
    "Axioma 5: NFL Real ATS posterior LL <= ln(2) + 0.002, ECE < 2.5% y Std(M | 50/50) en [13.0, 13.8]",
  ),
  skipTest(
    "tests/v6_0_suite.test.ts",
    "Axioma 6: Matriz 4-Param sin doble inflación (w_rho_blend == 0.0, |bias O2.5| < 0.7 pp y cono < 1e-12)",
  ),
  skipTest(
    "tests/v6_0_suite.test.ts",
    "Axioma 9: SGP QMC sesgo < 0.10 pp vs MVN exacto, Student-t quantile error < 1e-6 y Raikov+DC coherente",
  ),
  skipTest(
    "tests/v6_0_suite.test.ts",
    "Axioma 10: Booking Points gamma_red > 0 con conservación exacta de E[Y] y cobertura arbitral Big-7 > 90%",
  ),
  skipTest(
    "tests/v6_0_suite.test.ts",
    "Axioma 12: SHA-256 intacto en los 11 artefactos congelados v3.0 / v3.1 / v3.2 y registro v5.1 consistente",
  ),
  skipTest(
    "tests/v6_0_suite.test.ts",
    "Axioma 13 (Cobertura Universal 57 Ligas y Cono < 1e-12): 57/57 ligas cubiertas, error de cono 1X2 < 1e-12 y Venn-Abers significativa en [1.55, 2.60]",
  ),
  skipTest(
    "tests/v6_0_suite.test.ts",
    "Axioma 15 (Walk-Forward Físico Juego-a-Juego US + Dominancia Early Payout): 4/4 ligas US walk-forward date' < date, Empty-Net NHL < 1e-12, Axioma 8 MLB y 0 violaciones EP",
  ),
  skipTest(
    "tests/v6_0_suite.test.ts",
    "Axioma 16 (Congelado Pre-Kickoff Inmutable, Guardrail Narrativo e Integridad SHA-256 25 + v6.0): 0 contaminados, paridad < 1e-12 + SHA-256 idénticos Python↔TS y 25+14 hashes intactos",
  ),
  // Límites en milisegundos: dependen de la máquina y de la carga (fallan si corren junto a
  // las e2e). Se siguen midiendo en prediction-lab; aquí solo cuenta el resultado (P0-09).
  skipTest(
    "tests/gbm.test.ts",
    "ejecuta inferencia completa por partido con latencia media < 0.1 ms y reporta media, p50 y p99",
    TIMING_ONLY,
  ),
  skipTest("tests/montecarlo.test.ts", "executes 10,000 iterations in < 25ms", TIMING_ONLY),
  {
    file: "tests/multisport_and_v3.test.ts",
    find: "expect(avgMsPerMatchup).toBeLessThan(1.0);",
    replace: "void avgMsPerMatchup; // límite de tiempo omitido en la app (se mide en prediction-lab)",
    reason: TIMING_ONLY,
  },
];

const commit = git("rev-parse", "--verify", `${ref}^{commit}`).trim();
const sourceJsonPath = join(pkgDir, "SOURCE.json");
const previousCommit = (() => {
  if (!existsSync(sourceJsonPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(sourceJsonPath, "utf8"));
    const candidate = typeof parsed?.commit === "string" ? parsed.commit : null;
    if (!candidate) return null;
    return gitRevParseOrNull(`${candidate}^{commit}`);
  } catch {
    return null;
  }
})();
const files = [];

function readLiveSnapshotGuard(outDir) {
  const path = safeChildPath(outDir, "live_matchday_v3_snapshot.json");
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw);
  const generatedAt = typeof parsed?.generated_at === "string" ? parsed.generated_at : null;
  const ms = generatedAt ? Date.parse(generatedAt) : Number.NaN;
  if (!generatedAt || Number.isNaN(ms)) return null;
  return { raw, generatedAt, ms };
}

for (const { from, to, ext } of SOURCES) {
  const names = git("ls-tree", "--name-only", `${commit}:${from}`)
    .split("\n")
    .map((n) => n.trim())
    .filter((n) => n.endsWith(ext));
  if (names.length === 0) throw new Error(`No hay archivos ${ext} en ${ref}:${from}`);

  const outDir = resolve(pkgDir, to);
  // Preserva `live_matchday_v3_snapshot.json` cuando la ingesta local/CI generó un corte más
  // reciente que el de `prediction-lab` (evita degradar cuotas reales y `oddsBySelection`).
  const existingLiveSnapshot = to === "data" ? readLiveSnapshotGuard(outDir) : null;
  // Preserva archivos `src/*.ts` endurecidos localmente (ADR-056/FD-16/9178814d) cuando su blob
  // aguas arriba en `prediction-lab` no cambió desde el último `SOURCE.json`.
  const preservedUnchangedSrc = new Map();
  if (to === "src" && previousCommit) {
    for (const name of names) {
      const prevOid = gitRevParseOrNull(`${previousCommit}:${from}/${name}`);
      const nextOid = gitRevParseOrNull(`${commit}:${from}/${name}`);
      const localPath = safeChildPath(outDir, name);
      if (prevOid && nextOid && prevOid === nextOid && existsSync(localPath)) {
        preservedUnchangedSrc.set(name, readFileSync(localPath, "utf8"));
      }
    }
  }
  const preservedLocalTests = new Map();
  if (to === "tests") {
    for (const localTest of LOCAL_PRESERVED_TESTS) {
      const localPath = safeChildPath(outDir, localTest);
      if (existsSync(localPath)) {
        preservedLocalTests.set(localTest, readFileSync(localPath, "utf8"));
      }
    }
  }
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  for (const name of names) {
    const targetFile = safeChildPath(outDir, name);
    let body = git("show", `${commit}:${from}/${name}`);
    if (ext === ".json") {
      // Garantiza que solo se escriban artefactos JSON válidos sin código ejecutable.
      const parsed = JSON.parse(body);
      if (to === "data" && name === "live_matchday_v3_snapshot.json" && existingLiveSnapshot) {
        const incomingAt = typeof parsed?.generated_at === "string" ? parsed.generated_at : null;
        const incomingMs = incomingAt ? Date.parse(incomingAt) : Number.NaN;
        if (Number.isNaN(incomingMs) || existingLiveSnapshot.ms > incomingMs) {
          body = existingLiveSnapshot.raw;
          console.log(
            `Conservado data/live_matchday_v3_snapshot.json local más reciente (${existingLiveSnapshot.generatedAt} > ${incomingAt ?? "sin fecha"}).`,
          );
        }
      }
    }
    if (to === "tests") {
      body = body
        .replaceAll("../../src/domain/prediction/", "../src/")
        .replaceAll("../../src/data/prediction/", "../data/")
        .replaceAll("../../packages/contracts/src/", "../../contracts/src/")
        // Stub para imports estáticos de artefactos exclusivos de `research/prediction-lab`
        // referenciados únicamente por pruebas omitidas con `it.skip(...)`.
        .replace(
          /^import\s+([A-Za-z_$][A-Za-z0-9_$]*)\s+from\s+["']\.\.\/\.\.\/research\/[^"']+["'];?/gm,
          "const $1: any = undefined;",
        )
        // Rutas armadas desde la raíz de prediction-lab → raíz de este paquete.
        .replace(/(path\.)?resolve\((__dirname|import\.meta\.dirname), "\.\.\/\.\."\)/g, (_m, p, dirExpr) => `${p ?? ""}resolve(${dirExpr}, "..")`)
        .replace(
          /const REPO_ROOT =\s*\(globalThis as \{ process\?: \{ cwd\(\): string \} \}\)\.process\?\.cwd\(\) \?\? "\.";/,
          'const REPO_ROOT = `${import.meta.dirname}/..`;',
        )
        .replaceAll('path.join(process.cwd(), "src", "data", "prediction")', 'path.join(process.cwd(), "data")')
        .replaceAll('"src/data/prediction/', '"data/')
        .replaceAll('"src/domain/prediction/', '"src/');
    }
    if (to === "src") {
      // En prediction-lab el código vive en src/domain/prediction y los datos en src/data/prediction.
      body = body.replaceAll("../../data/prediction/", "../data/");
    }
    for (const patch of PATCHES.filter((p) => p.file === `${to}/${name}`)) {
      if (!body.includes(patch.find)) {
        throw new Error(`El parche de ${patch.file} ya no aplica; revisa si se corrigió en prediction-lab.`);
      }
      body = body.replace(patch.find, patch.replace);
    }
    if (to === "src" && preservedUnchangedSrc.has(name)) {
      body = preservedUnchangedSrc.get(name);
    } else {
      if (to === "src" && STRIP_COMMENTS_SRC_FILES.has(`${to}/${name}`)) {
        body = stripJsComments(body);
      }
      if (name.endsWith(".ts")) {
        body = body.replace(
          /((?:from|import)\s*\(?\s*|export\s+\*\s+from\s+|vi\.mock\(\s*)(["'])(\.{1,2}\/[^"']*?)\.js\2/g,
          "$1$2$3$2",
        );
      }
    }
    writeFileSync(targetFile, body);
    files.push(`${to}/${name}`);
  }
  for (const [localTest, localBody] of preservedLocalTests) {
    writeFileSync(safeChildPath(outDir, localTest), localBody);
  }
}

if (!dataOnly) {
  writeFileSync(
    sourceJsonPath,
    `${JSON.stringify(
      { branch: ref, commit, files, patches: PATCHES.map(({ file, reason }) => ({ file, reason })) },
      null,
      2,
    )}\n`,
  );
}
console.log(
  `Spacetime sincronizado (${dataOnly ? "solo datos JSON" : "completo"}) desde ${ref} (${commit.slice(0, 7)}): ${files.length} archivos.`,
);
