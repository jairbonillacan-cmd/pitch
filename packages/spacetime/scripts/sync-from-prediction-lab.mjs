#!/usr/bin/env node
// Copia los motores Spacetime Suite desde la rama `prediction-lab` a este paquete.
// prediction-lab es donde se mejoran los motores; este paquete solo recibe copias.
//
// Uso: node packages/spacetime/scripts/sync-from-prediction-lab.mjs [ref]
//   ref por defecto: origin/prediction-lab (haz `git fetch` antes).
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ref = process.argv[2] ?? "origin/prediction-lab";
const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SOURCES = [
  { from: "src/domain/prediction", to: "src", ext: ".ts" },
  { from: "src/data/prediction", to: "data", ext: ".json" },
  { from: "tests/prediction", to: "tests", ext: ".test.ts" },
];

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: pkgDir }).toString("utf8").trim();

function git(...args) {
  return execFileSync("git", args, { cwd: repoRoot, maxBuffer: 256 * 1024 * 1024 }).toString("utf8");
}

// Correcciones mínimas a la copia mientras no estén en prediction-lab. Cada una falla
// en voz alta si el texto ya no existe, para borrarla cuando se corrija allá.
const PATCHES = [];

const commit = git("rev-parse", ref).trim();
const files = [];

for (const { from, to, ext } of SOURCES) {
  const names = git("ls-tree", "--name-only", `${commit}:${from}`)
    .split("\n")
    .filter((n) => n.endsWith(ext));
  if (names.length === 0) throw new Error(`No hay archivos ${ext} en ${ref}:${from}`);

  const outDir = join(pkgDir, to);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  for (const name of names) {
    let body = git("show", `${commit}:${from}/${name}`);
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
    writeFileSync(join(outDir, name), body);
    files.push(`${to}/${name}`);
  }
}

writeFileSync(
  join(pkgDir, "SOURCE.json"),
  `${JSON.stringify(
    { branch: ref, commit, files, patches: PATCHES.map(({ file, reason }) => ({ file, reason })) },
    null,
    2,
  )}\n`,
);
console.log(`Spacetime sincronizado desde ${ref} (${commit.slice(0, 7)}): ${files.length} archivos.`);
