#!/usr/bin/env node
/**
 * Catálogo e integridad de los datasets de datos.
 *
 * Recorre corpus, research, xG y estadísticas auxiliares; cuenta filas, tamaño,
 * duplicados y rango de fechas, y escribe:
 *   Reportes/datos/DATA-CATALOG.md
 *   Reportes/datos/data-catalog.json
 *
 * No descarga nada ni modifica datasets: solo lee. Uso: `pnpm data:catalog`.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const ROOT = process.cwd();
const HISTORY = join(ROOT, "data", "history");
const RESEARCH = join(HISTORY, "research");
const XG = join(RESEARCH, "xg");
const OUT = join(ROOT, "Reportes", "datos");

const CORPUS_LEAGUES = ["premier-league", "la-liga", "bundesliga", "serie-a", "ligue-1", "liga-mx", "nfl"];
const RESEARCH_FILES = [
  ...CORPUS_LEAGUES.filter((league) => league !== "nfl").map((league) => `${league}.jsonl`),
  "liga-mx-enriched.jsonl",
  "liga-mx-espn-stats.jsonl",
  "liga-mx-stats.jsonl",
];

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Hashes y filas declarados por los manifests de corpus, research y xG. */
function readManifestExpected() {
  const expected = new Map();
  const add = (manifestPath, directory, fileName, source) => {
    if (!existsSync(manifestPath)) return;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const league of manifest.leagues ?? []) {
      if (!league.fileSha256) continue;
      const file = fileName(league);
      if (!file) continue;
      expected.set(join(directory, file), {
        sha256: league.fileSha256,
        rows: league.rows,
        source,
      });
    }
  };
  add(join(HISTORY, "manifest.json"), HISTORY, (league) => league.file, "corpus");
  add(join(RESEARCH, "manifest.json"), RESEARCH, (league) => league.file, "research");
  add(join(XG, "manifest.json"), XG, (league) => `${league.id}.jsonl`, "xg");
  const addAux = (manifestPath, file) => {
    if (!existsSync(manifestPath)) return;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!manifest.fileSha256) return;
    expected.set(join(RESEARCH, file), {
      sha256: manifest.fileSha256,
      rows: manifest.rows,
      source: "aux",
    });
  };
  addAux(join(RESEARCH, "liga-mx-espn-stats.manifest.json"), "liga-mx-espn-stats.jsonl");
  addAux(join(RESEARCH, "liga-mx-stats.manifest.json"), "liga-mx-stats.jsonl");
  return expected;
}

function summarizeFile(path, { license, builder, expected }) {
  if (!existsSync(path)) return null;
  const bytes = statSync(path).size;
  const sha256 = sha256File(path);
  const rows = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      rows.push({ __parseError: true });
    }
  }
  const ids = new Set();
  let duplicates = 0;
  let parseErrors = 0;
  let minDate = null;
  let maxDate = null;
  const seasons = new Set();
  for (const row of rows) {
    if (row.__parseError) {
      parseErrors++;
      continue;
    }
    if (row.id) {
      if (ids.has(row.id)) duplicates++;
      ids.add(row.id);
    }
    if (typeof row.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
      if (!minDate || row.date < minDate) minDate = row.date;
      if (!maxDate || row.date > maxDate) maxDate = row.date;
    }
    if (typeof row.season === "string") seasons.add(row.season);
  }
  const declared = expected?.get(path);
  let manifestStatus = "—";
  if (declared) {
    const hashOk = declared.sha256 === sha256;
    const rowsOk = declared.rows === rows.length;
    manifestStatus = hashOk && rowsOk ? "ok" : `${hashOk ? "" : "hash"}${rowsOk ? "" : " filas"}≠`;
  }
  return {
    file: path.slice(ROOT.length + 1).replace(/\\/g, "/"),
    sha256,
    rows: rows.length,
    bytes,
    duplicates,
    parseErrors,
    minDate,
    maxDate,
    seasons: seasons.size,
    license,
    builder,
    manifestStatus,
    manifestRows: declared?.rows ?? null,
    manifestSource: declared?.source ?? null,
  };
}

function corpusEntries() {
  return CORPUS_LEAGUES.map((league) => ({
    name: `Corpus ${league}`,
    path: join(HISTORY, `${league}.jsonl`),
    license: "CC0 / CC-BY 4.0 según fuente",
    builder: "pnpm history",
  }));
}

function researchEntries() {
  return RESEARCH_FILES.map((file) => ({
    name: `Research ${file.replace(".jsonl", "")}`,
    path: join(RESEARCH, file),
    license: "research-only",
    builder:
      file.startsWith("liga-mx-espn") || file.startsWith("liga-mx-enriched")
        ? "pnpm history:espn / tools/extract_espn_ligamx.py"
        : file.startsWith("liga-mx-stats")
          ? "pnpm history:api-stats"
          : "pnpm history:odds",
  }));
}

function xgEntries() {
  if (!existsSync(XG)) return [];
  return readdirSync(XG)
    .filter((name) => name.endsWith(".jsonl"))
    .sort()
    .map((name) => ({
      name: `xG ${name.replace(".jsonl", "")}`,
      path: join(XG, name),
      license: "research-only",
      builder: "pnpm history:xg",
    }));
}

const entries = [
  ...corpusEntries(),
  ...researchEntries(),
  ...xgEntries(),
  {
    name: "NFL situacional (otro pipeline)",
    path: join(HISTORY, "nfl-situational-features.jsonl"),
    license: "research-only",
    builder: "tools/nfl-data",
  },
  {
    name: "Soccer situacional (otro pipeline)",
    path: join(HISTORY, "soccer-situational-features.jsonl"),
    license: "research-only",
    builder: "tools/nfl-data",
  },
];
const expected = readManifestExpected();
const datasets = entries
  .map((entry) => ({ name: entry.name, ...summarizeFile(entry.path, { ...entry, expected }) }))
  .filter((entry) => entry !== null);

const totals = datasets.reduce(
  (acc, dataset) => ({
    rows: acc.rows + dataset.rows,
    bytes: acc.bytes + dataset.bytes,
    duplicates: acc.duplicates + dataset.duplicates,
    manifestMismatches: acc.manifestMismatches + (dataset.manifestStatus === "ok" || dataset.manifestStatus === "—" ? 0 : 1),
  }),
  { rows: 0, bytes: 0, duplicates: 0, manifestMismatches: 0 },
);

const generatedAt = new Date().toISOString();
const lines = [
  "# Catálogo de datos",
  "",
  `Generado: ${generatedAt}`,
  "",
  "| Dataset | Filas | MB | Duplicados | SHA-256 | Manifiesto | Fechas | Temporadas | Licencia | Builder |",
  "|---|---:|---:|---:|---|---:|---|---:|---|---|",
];
for (const dataset of datasets) {
  lines.push(
    `| ${dataset.name} | ${dataset.rows.toLocaleString("es-MX")} | ${(dataset.bytes / 1024 / 1024).toFixed(1)} | ${dataset.duplicates} | \`${dataset.sha256.slice(0, 12)}\` | ${dataset.manifestStatus} | ${dataset.minDate ?? "—"} → ${dataset.maxDate ?? "—"} | ${dataset.seasons || "—"} | ${dataset.license} | \`${dataset.builder}\` |`,
  );
}
lines.push(
  "",
  `**Total:** ${totals.rows.toLocaleString("es-MX")} filas, ${(totals.bytes / 1024 / 1024).toFixed(1)} MB, ${totals.duplicates} duplicados, ${totals.manifestMismatches} discrepancias de manifiesto.`,
  "",
  "> Los datasets research-only no se publican ni se redistribuyen; solo se usan en backtests.",
);

writeFileSync(join(OUT, "DATA-CATALOG.md"), lines.join("\n"), "utf8");
writeFileSync(join(OUT, "data-catalog.json"), JSON.stringify({ generatedAt, totals, datasets }, null, 2) + "\n", "utf8");

console.log(`[catalog] ${datasets.length} datasets, ${totals.rows} filas, ${totals.duplicates} duplicados, ${totals.manifestMismatches} discrepancias`);
for (const dataset of datasets) {
  if (dataset.duplicates > 0 || dataset.parseErrors > 0 || (dataset.manifestStatus !== "ok" && dataset.manifestStatus !== "—")) {
    console.log(`[catalog] AVISO ${dataset.file}: duplicados=${dataset.duplicates}, errores=${dataset.parseErrors}, manifiesto=${dataset.manifestStatus}`);
  }
}

// `--verify` convierte el catálogo en un chequeo de integridad con umbrales mínimos.
if (process.argv.includes("--verify")) {
  const failures = [];
  if (datasets.length < 20) failures.push(`datasets=${datasets.length} < 20`);
  if (totals.rows < 130_000) failures.push(`filas=${totals.rows} < 130000`);
  if (totals.duplicates > 0) failures.push(`duplicados=${totals.duplicates}`);
  if (totals.manifestMismatches > 0) failures.push(`discrepancias=${totals.manifestMismatches}`);
  const required = [
    ["xG premier-league", 9_000],
    ["Research premier-league", 10_000],
    ["Research liga-mx-espn-stats", 1_000],
    ["Corpus premier-league", 6_000],
  ];
  for (const [name, minimum] of required) {
    const dataset = datasets.find((entry) => entry.name === name);
    if (!dataset) failures.push(`falta ${name}`);
    else if (dataset.rows < minimum) failures.push(`${name}=${dataset.rows} < ${minimum}`);
  }
  if (failures.length > 0) {
    console.error(`[verify:data] FALLO: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log("[verify:data] OK: datasets, filas, duplicados y manifiestos dentro de los umbrales");
}
