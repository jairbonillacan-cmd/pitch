#!/usr/bin/env node
// Copia los motores o los artefactos JSON de Spacetime Suite desde la rama `prediction-lab`.
//
// Uso:
//   node packages/spacetime/scripts/sync-from-prediction-lab.mjs [--data-only] [ref]
//   - `--data-only`: sincroniza únicamente artefactos `.json` validados (seguro para cron CI, SEC-10).
//   - Sin bandera: sincroniza código `.ts`, `.json` y `.test.ts` para revisión humana local.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
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

const PATCHES = [];

const commit = git("rev-parse", "--verify", `${ref}^{commit}`).trim();
const files = [];

for (const { from, to, ext } of SOURCES) {
  const names = git("ls-tree", "--name-only", `${commit}:${from}`)
    .split("\n")
    .map((n) => n.trim())
    .filter((n) => n.endsWith(ext));
  if (names.length === 0) throw new Error(`No hay archivos ${ext} en ${ref}:${from}`);

  const outDir = resolve(pkgDir, to);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  for (const name of names) {
    const targetFile = safeChildPath(outDir, name);
    let body = git("show", `${commit}:${from}/${name}`);
    if (ext === ".json") {
      // Garantiza que solo se escriban artefactos JSON válidos sin código ejecutable.
      JSON.parse(body);
    }
    if (to === "tests") {
      body = body
        .replaceAll("../../src/domain/prediction/", "../src/")
        .replaceAll("../../src/data/prediction/", "../data/");
    }
    for (const patch of PATCHES.filter((p) => p.file === `${to}/${name}`)) {
      if (!body.includes(patch.find)) {
        throw new Error(`El parche de ${patch.file} ya no aplica; revisa si se corrigió en prediction-lab.`);
      }
      body = body.replace(patch.find, patch.replace);
    }
    if (name.endsWith(".ts")) {
      body = body.replace(
        /((?:from|import)\s*\(?\s*|export\s+\*\s+from\s+|vi\.mock\(\s*)(["'])(\.{1,2}\/[^"']*?)\.js\2/g,
        "$1$2$3$2",
      );
    }
    writeFileSync(targetFile, body);
    files.push(`${to}/${name}`);
  }
}

if (!dataOnly) {
  writeFileSync(
    join(pkgDir, "SOURCE.json"),
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
