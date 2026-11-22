import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runDataIntegrityAudit } from "../check-data-integrity.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function buildSyntheticFixture() {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "pitchlab-data-integrity-"));

  const leagueIds = Array.from({ length: 57 }, (_, idx) => `liga-${idx + 1}`);
  const capabilitiesLines = leagueIds.map((id) => `  tier1CoreFootball("${id}", ${idxSafe(id)}, {}),`);

  function idxSafe(id) {
    return id.replace("liga-", "");
  }

  mkdirSync(path.join(tmpDir, "packages/contracts/src"), { recursive: true });
  writeFileSync(
    path.join(tmpDir, "packages/contracts/src/league-capabilities.ts"),
    [
      "export const LEAGUE_CAPABILITY_LIST = Object.freeze([",
      ...capabilitiesLines,
      "]);",
    ].join("\n"),
    "utf8",
  );

  writeFileSync(
    path.join(tmpDir, "packages/contracts/src/branded.ts"),
    'export const BLOCKED_BOOK_IDS = new Set([\n  "betfair",\n  "caliente",\n]);\n',
    "utf8",
  );

  const shellLeagues = {};
  for (const id of leagueIds) {
    const dir = path.join(tmpDir, "data/snapshots", id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, "latest.json"),
      JSON.stringify({
        league: id,
        games: [
          {
            id: `${id}.g1`,
            startTime: "2026-11-22T18:00:00.000Z",
            home: { id: `${id}.home`, name: "Home" },
            away: { id: `${id}.away`, name: "Away" },
            result: { home: 2, away: 1 },
          },
        ],
      }),
      "utf8",
    );
    shellLeagues[id] = { state: "ok", generatedAt: "2026-11-22T18:00:00.000Z" };
  }

  writeFileSync(
    path.join(tmpDir, "data/snapshots/shell-index.json"),
    JSON.stringify({ schemaVersion: 1, leagueCount: 57, leagues: shellLeagues }),
    "utf8",
  );

  mkdirSync(path.join(tmpDir, "data/odds_timeseries"), { recursive: true });
  writeFileSync(
    path.join(tmpDir, "data/odds_timeseries/quotes_latest.json"),
    JSON.stringify({ ticks: [{ book: "pinnacle", price_decimal: 1.95 }] }),
    "utf8",
  );

  mkdirSync(path.join(tmpDir, "packages/ui/src/platform/components"), { recursive: true });
  writeFileSync(
    path.join(tmpDir, "packages/ui/src/platform/components/PackSportIcons.tsx"),
    [
      'export const MARKET_CATEGORY_ICON_NAMES = Object.freeze(["corners"]);',
      'export const PLAYER_META_ICON_NAMES = Object.freeze(["jersey"]);',
      'export const MATCH_CONTEXT_ICON_NAMES = Object.freeze(["pitch-field"]);',
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    path.join(tmpDir, "packages/ui/src/platform/components/SportEventIcons.tsx"),
    'export const SPORT_EVENT_PACK_ASSETS = Object.freeze(["goal"]);\n',
    "utf8",
  );
  writeFileSync(
    path.join(tmpDir, "packages/ui/src/platform/components/MaestroPrimitives.tsx"),
    'const MAESTRO_ICON_PACK_SLUGS = {\n  search: "search",\n};\n',
    "utf8",
  );

  const webpFiles = [
    "mercados/corners.webp",
    "jugador/jersey.webp",
    "contexto/pitch-field.webp",
    "eventos/goal.webp",
    "interfaz/search.webp",
  ];
  for (const base of ["icons/32", "icons/64", "icons-dark/32", "icons-dark/64"]) {
    for (const rel of webpFiles) {
      const target = path.join(tmpDir, "apps/web/public", base, rel);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, "RIFF");
    }
  }

  mkdirSync(path.join(tmpDir, "packages/sports-assets/src"), { recursive: true });
  writeFileSync(
    path.join(tmpDir, "packages/sports-assets/src/registry.generated.ts"),
    'export const SAMPLE = "/brand/app-icons/favicon.svg";\nexport const MASCOT_EDITIONS = ["radar"] as const;\n',
    "utf8",
  );
  writeFileSync(
    path.join(tmpDir, "packages/sports-assets/src/brand.ts"),
    'export function x() { return "/brand/app-icons/favicon.svg"; }\n',
    "utf8",
  );
  writeFileSync(
    path.join(tmpDir, "packages/sports-assets/src/national-assets.generated.ts"),
    'export const NATIONAL_COUNTRY_SLUGS = new Set(["mexico"]);\nexport const NATIONAL_COMPETITION_ASSETS = new Set(["copa-oro"]);\n',
    "utf8",
  );

  for (const rel of [
    "brand/app-icons/favicon.svg",
    "brand/mascot/r1/radar.webp",
    "brand/official/countries/mexico.png",
    "brand/official/competitions/copa-oro.png",
  ]) {
    const target = path.join(tmpDir, "apps/web/public", rel);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, "ASSET");
  }

  return tmpDir;
}

test("runDataIntegrityAudit passes cleanly on the real PitchLab repository", () => {
  const report = runDataIntegrityAudit(REPO_ROOT);
  assert.equal(report.ok, true, report.errors.join("\n"));
  assert.equal(report.summary.leaguesChecked, 57);
  assert.ok(report.summary.gamesChecked > 1000);
  assert.ok(report.summary.webpAssetsChecked >= 616);
  assert.ok(report.summary.brandAssetsChecked >= 400);
  assert.deepEqual(report.errors, []);
});

test("runDataIntegrityAudit fails on missing league parity and extra directories (Check 1)", () => {
  const fixture = buildSyntheticFixture();
  try {
    rmSync(path.join(fixture, "data/snapshots/liga-57/latest.json"));
    const report = runDataIntegrityAudit(fixture);
    assert.equal(report.ok, false);
    assert.ok(report.errors.some((e) => e.includes("Falta data/snapshots/liga-57/latest.json")));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("runDataIntegrityAudit fails on invalid startTime, self-match, duplicate game ID, and negative score (Check 2)", () => {
  const fixture = buildSyntheticFixture();
  try {
    writeFileSync(
      path.join(fixture, "data/snapshots/liga-2/latest.json"),
      JSON.stringify({
        league: "liga-2",
        games: [
          {
            id: "liga-1.g1",
            startTime: "fecha-invalida",
            home: { id: "liga-2.same", name: "Same" },
            away: { id: "liga-2.same", name: "Same" },
            result: { home: -1, away: 0 },
          },
        ],
      }),
      "utf8",
    );
    const report = runDataIntegrityAudit(fixture);
    assert.equal(report.ok, false);
    assert.ok(report.errors.some((e) => e.includes("duplicado")));
    assert.ok(report.errors.some((e) => e.includes("startTime invalido")));
    assert.ok(report.errors.some((e) => e.includes("mismo equipo")));
    assert.ok(report.errors.some((e) => e.includes("Marcador invalido")));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("runDataIntegrityAudit fails on blocked bookmaker, external logoUrl, and FD-16 leak (Check 3)", () => {
  const fixture = buildSyntheticFixture();
  try {
    const latestFile = path.join(fixture, "data/snapshots/liga-3/latest.json");
    const parsed = JSON.parse(readFileSync(latestFile, "utf8"));
    parsed.games[0].home.logoUrl = "https:" + "//a.espncdn.com/i/teamlogos/soccer/500/223.png";
    parsed.games[0].providerTag = "sofascore";
    parsed.games[0].quote = { book: "Betfair", decimal: 2.05 };
    writeFileSync(latestFile, JSON.stringify(parsed), "utf8");

    const report = runDataIntegrityAudit(fixture);
    assert.equal(report.ok, false);
    assert.ok(report.errors.some((e) => e.includes("Bookmaker bloqueado")));
    assert.ok(report.errors.some((e) => e.includes("a.espncdn.com")));
    assert.ok(report.errors.some((e) => e.includes("Fuga FD-16")));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("runDataIntegrityAudit fails on missing WebP icon across theme variants (Check 4)", () => {
  const fixture = buildSyntheticFixture();
  try {
    const dark64Path = path.join(fixture, "apps/web/public/icons-dark/64/interfaz/search.webp");
    rmSync(dark64Path);
    const report = runDataIntegrityAudit(fixture);
    assert.equal(report.ok, false);
    assert.ok(report.errors.some((e) => e.includes("icons-dark/64/interfaz/search.webp")));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
