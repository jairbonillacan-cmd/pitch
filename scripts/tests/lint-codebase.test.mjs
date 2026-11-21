import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { runLint, scanSource } from "../lint-codebase.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
const LINT_SCRIPT = join(REPO_ROOT, "scripts", "lint-codebase.mjs");
const LINE_CMT = "/" + "/";
const BLOCK_OPEN = "/" + "*";
const BLOCK_CLOSE = "*" + "/";
const TRIPLE_SLASH = "/" + "/" + "/";
const DIAGNOSTIC_RE = /^\[([a-z0-9-]+)\] ([^:]+):(\d+) — (.+) \| (.+) \| USA EN SU LUGAR: (.+)$/;

function createTempWorkspace(files) {
  const rootDir = mkdtempSync(join(tmpdir(), "pitchlab-lint-test-"));
  for (const [relPath, content] of Object.entries(files)) {
    const full = join(rootDir, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  return rootDir;
}

function writeWorkspaceFile(rootDir, relPath, content) {
  const full = join(rootDir, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, "utf8");
}

function assertInstructiveDiagnostic(diagnostic, expectedRule, expectedFile, expectedLine) {
  const match = DIAGNOSTIC_RE.exec(diagnostic);
  assert.ok(match, `Formato instructivo inválido: ${diagnostic}`);
  assert.equal(match[1], expectedRule);
  assert.equal(match[2], expectedFile);
  if (expectedLine !== undefined) {
    assert.equal(match[3], String(expectedLine));
  }
  assert.ok(match[4].trim().length > 5, "La sección QUÉ debe ser descriptiva");
  assert.ok(match[5].trim().length > 5, "La sección POR QUÉ debe ser descriptiva");
  assert.ok(match[6].trim().length > 5, "La sección USA EN SU LUGAR debe indicar la primitiva");
}

function runCli(args) {
  try {
    const stdout = execFileSync(process.execPath, [LINT_SCRIPT, ...args], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    return {
      status: err.status ?? 1,
      stdout: String(err.stdout ?? ""),
      stderr: String(err.stderr ?? ""),
    };
  }
}

test("no-hex-outside-tokens falla con diagnóstico instructivo y respeta exclusiones", async () => {
  const rootDir = createTempWorkspace({
    "apps/web/app/panel.css": ".panel {\n  color: #ff00aa;\n}\n",
    "packages/tokens/src/palette.css": ":root {\n  --pl-accent: #ff00aa;\n}\n",
    "packages/emails/src/welcome.ts": 'export const html = "<span style=\\"color:#112233\\">ok</span>";\n',
    "packages/sports-assets/src/registry.generated.ts": 'export const color = "#abcdef";\n',
  });
  try {
    const result = await runLint({ rootDir });
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 1);
    assertInstructiveDiagnostic(result.errors[0], "no-hex-outside-tokens", "apps/web/app/panel.css", 2);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("no-empty-catch falla en bloques vacíos e ignora strings y manejos reales", async () => {
  const rootDir = createTempWorkspace({
    "apps/web/src/broken.ts": [
      'export const doc = "no escribas catch {}";',
      "export function run(fn: () => void) {",
      "  try {",
      "    fn();",
      "  } catch (err) {",
      "  }",
      "}",
    ].join("\n"),
    "apps/web/src/clean.ts": [
      "export function runSafe(fn: () => void) {",
      "  try {",
      "    fn();",
      "  } catch (err) {",
      "    return String(err);",
      "  }",
      "  return null;",
      "}",
    ].join("\n"),
  });
  try {
    const result = await runLint({ rootDir });
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 1);
    assertInstructiveDiagnostic(result.errors[0], "no-empty-catch", "apps/web/src/broken.ts", 5);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("no-cloud-sdk-lockin bloquea SDKs propietarios y permite avatar-storage.ts", async () => {
  const rootDir = createTempWorkspace({
    "apps/web/src/server/analytics.ts": 'import { track } from "@vercel/analytics";\nexport const fn = track;\n',
    "apps/web/src/server/db-bad.ts": 'import { neon } from "@neondatabase/serverless";\nexport const db = neon;\n',
    "apps/web/src/server/avatar-storage.ts": 'import { S3Client } from "@aws-sdk/client-s3";\nexport const client = S3Client;\n',
  });
  try {
    const result = await runLint({ rootDir });
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 2);
    assertInstructiveDiagnostic(result.errors[0], "no-cloud-sdk-lockin", "apps/web/src/server/analytics.ts", 1);
    assertInstructiveDiagnostic(result.errors[1], "no-cloud-sdk-lockin", "apps/web/src/server/db-bad.ts", 1);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("no-web-barrels bloquea @pitchlab/ui y @pitchlab/ui/platform en apps/web/", async () => {
  const rootDir = createTempWorkspace({
    "apps/web/src/bad-root.tsx": 'import { Button } from "@pitchlab/ui";\nexport const B = Button;\n',
    "apps/web/src/bad-platform.tsx": 'import { usePlatformCore } from "@pitchlab/ui/platform";\nexport const h = usePlatformCore;\n',
    "apps/web/src/good-subpath.tsx": 'import { AtomicMatchHeaderBar } from "@pitchlab/ui/atomic";\nexport const H = AtomicMatchHeaderBar;\n',
  });
  try {
    const result = await runLint({ rootDir });
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 2);
    assertInstructiveDiagnostic(result.errors[0], "no-web-barrels", "apps/web/src/bad-platform.tsx", 1);
    assertInstructiveDiagnostic(result.errors[1], "no-web-barrels", "apps/web/src/bad-root.tsx", 1);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("no-css-jank detecta backdrop-filter, transition-all y transition sobre box-shadow", async () => {
  const rootDir = createTempWorkspace({
    "apps/web/app/bad.css": [
      ".glass {",
      "  backdrop-filter: blur(8px);",
      "  transition: transform 150ms, box-shadow 200ms;",
      "}",
    ].join("\n"),
    "packages/ui/src/Button.tsx": 'export const Button = () => <button className="transition-all backdrop-blur-sm">OK</button>;\n',
    "apps/web/app/good.css": [
      ".surface {",
      "  box-shadow: var(--pl-card-shadow);",
      "  transition: transform 150ms, opacity 150ms;",
      "}",
    ].join("\n"),
    "packages/ui/src/Button.stories.tsx": 'export const Story = () => <div className="transition-all backdrop-blur-md" />;\n',
    "apps/web/app/legacy-d1-storybook.css": ".legacy { transition: box-shadow 150ms ease; }\n",
  });
  try {
    const result = await runLint({ rootDir });
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 4);
    assertInstructiveDiagnostic(result.errors[0], "no-css-jank", "apps/web/app/bad.css", 2);
    assertInstructiveDiagnostic(result.errors[1], "no-css-jank", "apps/web/app/bad.css", 3);
    assertInstructiveDiagnostic(result.errors[2], "no-css-jank", "packages/ui/src/Button.tsx", 1);
    assertInstructiveDiagnostic(result.errors[3], "no-css-jank", "packages/ui/src/Button.tsx", 1);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("no-forbidden-ui-copy bloquea Confianza N y Datos completos/parciales fuera de tests y stories", async () => {
  const rootDir = createTempWorkspace({
    "packages/ui/src/Badge.tsx": 'export const a = "Confianza 8";\nexport const b = "Datos parciales";\n',
    "apps/web/app/card.tsx": 'export const c = "Datos completos";\n',
    "packages/ui/src/Badge.test.tsx": 'export const t = "Confianza 9 y Datos parciales";\n',
    "packages/ui/src/Badge.stories.tsx": 'export const s = "Datos completos";\n',
  });
  try {
    const result = await runLint({ rootDir });
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 3);
    assertInstructiveDiagnostic(result.errors[0], "no-forbidden-ui-copy", "apps/web/app/card.tsx", 1);
    assertInstructiveDiagnostic(result.errors[1], "no-forbidden-ui-copy", "packages/ui/src/Badge.tsx", 1);
    assertInstructiveDiagnostic(result.errors[2], "no-forbidden-ui-copy", "packages/ui/src/Badge.tsx", 2);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("no-monolithic-use-platform bloquea usePlatform() fuera de platform-provider y stories", async () => {
  const rootDir = createTempWorkspace({
    "packages/ui/src/platform/club/BadClub.tsx": "export function BadClub() {\n  return usePlatform();\n}\n",
    "packages/ui/src/platform/platform-provider.tsx": "export function usePlatform() {\n  return {};\n}\n",
    "packages/ui/src/platform/club/GoodClub.tsx": "export function GoodClub() {\n  return usePlatformCore();\n}\n",
    "packages/ui/src/platform/club/Demo.stories.tsx": "export function Demo() {\n  return usePlatform();\n}\n",
  });
  try {
    const result = await runLint({ rootDir });
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 1);
    assertInstructiveDiagnostic(
      result.errors[0],
      "no-monolithic-use-platform",
      "packages/ui/src/platform/club/BadClub.tsx",
      2,
    );
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("no-prod-comments cuenta comentarios reales e ignora directivas, URLs, regex y apóstrofes JSX", async () => {
  const escapedRegex = ["/", "\\/", "\\*not-comment\\*", "\\/", "/g"].join("");
  const templateSample = `export const tpl = \`https://a.com/\${1} ${BLOCK_OPEN}no-cmt${BLOCK_CLOSE}\`;`;
  const sampleWithEdgeCases = [
    '"use client";',
    `${TRIPLE_SLASH} <reference types="next" />`,
    'export const url = "https://pitchlab.app/api";',
    `export const re = ${escapedRegex};`,
    templateSample,
    "export const Label = () => <span>90'</span>;",
    `${LINE_CMT} comentario en línea`,
    `${BLOCK_OPEN}`,
    " * bloque línea 1",
    ` ${BLOCK_CLOSE}`,
  ].join("\n");

  const scanned = scanSource(sampleWithEdgeCases, false);
  assert.deepEqual(scanned.commentLines, [7, 8, 9, 10]);

  const rootDir = createTempWorkspace({
    "apps/web/src/prod.ts": sampleWithEdgeCases,
    "apps/web/src/prod.test.ts": `${LINE_CMT} permitido en tests\nexport const ok = 1;\n`,
    "packages/ui/src/Card.stories.tsx": `${LINE_CMT} permitido en stories\nexport const s = 1;\n`,
    "packages/sports-assets/src/a.generated.ts": `${LINE_CMT} generado\nexport const g = 1;\n`,
  });
  try {
    const result = await runLint({ rootDir });
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 1);
    assertInstructiveDiagnostic(result.errors[0], "no-prod-comments", "apps/web/src/prod.ts", 7);
    assert.match(result.errors[0], /4 línea\(s\)/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("no-view-use-effect bloquea useEffect y useLayoutEffect en vistas y permite hooks auditados", async () => {
  const rootDir = createTempWorkspace({
    "packages/ui/src/platform/club/ClubView.tsx": "export function ClubView() {\n  useEffect(() => {}, []);\n  return null;\n}\n",
    "packages/ui/src/platform/public/PublicView.tsx": "export function PublicView() {\n  useLayoutEffect(() => {}, []);\n  return null;\n}\n",
    "apps/web/app/home/page.tsx": "export default function Page() {\n  React.useEffect(() => {}, []);\n  return null;\n}\n",
    "packages/ui/src/platform/hooks/use-sync.ts": "export function useSync() {\n  useEffect(() => {}, []);\n}\n",
    "packages/ui/src/platform/club/ClubView.stories.tsx": "export function Story() {\n  useEffect(() => {}, []);\n}\n",
  });
  try {
    const result = await runLint({ rootDir });
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 3);
    assertInstructiveDiagnostic(result.errors[0], "no-view-use-effect", "apps/web/app/home/page.tsx", 2);
    assertInstructiveDiagnostic(result.errors[1], "no-view-use-effect", "packages/ui/src/platform/club/ClubView.tsx", 2);
    assertInstructiveDiagnostic(result.errors[2], "no-view-use-effect", "packages/ui/src/platform/public/PublicView.tsx", 2);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("no-unsafe-number-cast bloquea Number() y permite métodos estáticos y contratos", async () => {
  const rootDir = createTempWorkspace({
    "apps/web/src/calc.ts": "export const bad = (raw: unknown) => Number(raw);\n",
    "apps/web/src/safe.ts": "export const good = (v: unknown) => Number.isFinite(v);\n",
    "apps/web/src/calc.test.ts": "export const testVal = Number('42');\n",
  });
  try {
    const result = await runLint({ rootDir });
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 1);
    assertInstructiveDiagnostic(result.errors[0], "no-unsafe-number-cast", "apps/web/src/calc.ts", 1);
    assert.match(result.errors[0], /parseStrictFiniteNumber/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("require-api-wrapper exige wrapper canónico y respeta excepciones explícitas", async () => {
  const rootDir = createTempWorkspace({
    "apps/web/app/api/picks/route.ts": "export async function GET() {\n  return new Response('ok');\n}\n",
    "apps/web/app/api/health/route.ts": "export const GET = withPublicRead(async () => new Response('ok'));\n",
    "apps/web/app/api/auth/[...all]/route.ts": "export async function GET() {\n  return new Response('auth');\n}\n",
    "apps/web/app/api/webhooks/stripe/route.ts": "export async function POST() {\n  return new Response('stripe');\n}\n",
    "apps/web/app/api/beta/unlock/route.ts": "export async function POST() {\n  return new Response('unlock');\n}\n",
    "apps/web/app/api/beta/logout/route.ts": "export async function POST() {\n  return new Response('logout');\n}\n",
  });
  try {
    const result = await runLint({ rootDir });
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 1);
    assertInstructiveDiagnostic(result.errors[0], "require-api-wrapper", "apps/web/app/api/picks/route.ts", 1);
    assert.match(result.errors[0], /withPublicRead/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("ratchet baseline, --files, --strict-files y --shrink-baseline funcionan extremo a extremo", async () => {
  const rootDir = createTempWorkspace({
    "apps/web/src/legacy.ts": [
      `${LINE_CMT} comentario legado 1`,
      `${LINE_CMT} comentario legado 2`,
      "export const a = Number('1');",
      "export const b = Number('2');",
    ].join("\n"),
    "apps/web/app/api/orders/route.ts": "export async function GET() {\n  return new Response('legacy');\n}\n",
  });
  const baselinePath = join(rootDir, "scripts", "lint-ratchet-baseline.json");

  try {
    mkdirSync(dirname(baselinePath), { recursive: true });

    const initRes = runCli(["--root", rootDir, "--init-baseline"]);
    assert.equal(initRes.status, 0, initRes.stderr);

    const baselineData = JSON.parse(readFileSync(baselinePath, "utf8"));
    assert.equal(baselineData.rules["no-prod-comments"]["apps/web/src/legacy.ts"], 2);
    assert.equal(baselineData.rules["no-unsafe-number-cast"]["apps/web/src/legacy.ts"], 2);
    assert.equal(baselineData.rules["require-api-wrapper"]["apps/web/app/api/orders/route.ts"], 1);

    const passRes = runCli(["--root", rootDir]);
    assert.equal(passRes.status, 0, passRes.stderr);

    const filesModeRes = runCli(["--root", rootDir, "--files", "apps/web/src/legacy.ts"]);
    assert.equal(filesModeRes.status, 1);
    assert.match(filesModeRes.stderr, /\[no-prod-comments\] apps\/web\/src\/legacy\.ts:1/);
    assert.doesNotMatch(filesModeRes.stderr, /\[no-unsafe-number-cast\]/);

    const strictModeRes = runCli(["--root", rootDir, "--strict-files", "apps/web/src/legacy.ts"]);
    assert.equal(strictModeRes.status, 1);
    assert.match(strictModeRes.stderr, /\[no-prod-comments\] apps\/web\/src\/legacy\.ts:1/);
    assert.match(strictModeRes.stderr, /\[no-unsafe-number-cast\] apps\/web\/src\/legacy\.ts:3/);

    writeWorkspaceFile(rootDir, "apps/web/src/brand-new.ts", "export const x = Number('9');\n");
    const newDebtRes = runCli(["--root", rootDir]);
    assert.equal(newDebtRes.status, 1);
    assert.match(newDebtRes.stderr, /\[no-unsafe-number-cast\] apps\/web\/src\/brand-new\.ts:1/);
    rmSync(join(rootDir, "apps/web/src/brand-new.ts"));

    writeWorkspaceFile(
      rootDir,
      "apps/web/src/legacy.ts",
      [
        `${LINE_CMT} comentario legado 1`,
        `${LINE_CMT} comentario legado 2`,
        `${LINE_CMT} comentario nuevo no permitido`,
        "export const a = Number('1');",
        "export const b = Number('2');",
      ].join("\n"),
    );
    const regressionShrinkRes = runCli(["--root", rootDir, "--shrink-baseline"]);
    assert.equal(regressionShrinkRes.status, 1);
    assert.match(regressionShrinkRes.stderr, /\[no-prod-comments\] apps\/web\/src\/legacy\.ts:1/);
    const afterRegressionBaseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    assert.equal(afterRegressionBaseline.rules["no-prod-comments"]["apps/web/src/legacy.ts"], 2);

    writeWorkspaceFile(
      rootDir,
      "apps/web/src/legacy.ts",
      ["export const a = Number('1');", "export const b = 2;"].join("\n"),
    );
    writeWorkspaceFile(
      rootDir,
      "apps/web/app/api/orders/route.ts",
      "export const GET = withSessionRead(async () => new Response('ok'));\n",
    );
    const shrinkRes = runCli(["--root", rootDir, "--shrink-baseline"]);
    assert.equal(shrinkRes.status, 0, shrinkRes.stderr);
    const shrunkBaseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    assert.equal(shrunkBaseline.rules["no-prod-comments"]["apps/web/src/legacy.ts"], undefined);
    assert.equal(shrunkBaseline.rules["no-unsafe-number-cast"]["apps/web/src/legacy.ts"], 1);
    assert.equal(shrunkBaseline.rules["require-api-wrapper"]["apps/web/app/api/orders/route.ts"], undefined);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("el propio scripts/lint-codebase.mjs pasa en modo --strict-files con cero deuda y los tests tienen cero comentarios", () => {
  const selfCheck = runCli(["--strict-files", "scripts/lint-codebase.mjs"]);
  assert.equal(selfCheck.status, 0, selfCheck.stderr);
  assert.match(selfCheck.stdout, /OK \[lint-codebase\]/);

  const testSource = readFileSync(join(REPO_ROOT, "scripts", "tests", "lint-codebase.test.mjs"), "utf8");
  assert.deepEqual(scanSource(testSource, false).commentLines, []);
});
