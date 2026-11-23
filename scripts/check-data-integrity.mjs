import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_LEAGUE_COUNT = 57;
const BOOK_KEYS = new Set(["book", "bookId", "bookmaker", "sportsbook"]);
const ICON_PACK_BASES = ["icons/32", "icons/64", "icons-dark/32", "icons-dark/64"];
const STRICT_NO_EXTERNAL_FILES = new Set([
  "latest.json",
  "market-pulse.json",
  "market-lines.json",
  "injuries.json",
]);

function extractFrozenStringArray(sourceText, constName) {
  const escaped = constName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?:export\\s+)?const\\s+${escaped}[^=]*=\\s*Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\);`,
  );
  const match = sourceText.match(pattern);
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function extractInlineArrayStrings(sourceText, constName) {
  const escaped = constName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?:export\\s+)?const\\s+${escaped}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*(?:as const)?;`,
  );
  const match = sourceText.match(pattern);
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function extractSetStrings(sourceText, constName) {
  const escaped = constName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?:export\\s+)?const\\s+${escaped}[^=]*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\);`,
  );
  const match = sourceText.match(pattern);
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function extractRecordUniqueValues(sourceText, constName) {
  const escaped = constName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:export\\s+)?const\\s+${escaped}[^=]*=\\s*\\{([\\s\\S]*?)\\};`);
  const match = sourceText.match(pattern);
  if (!match) return [];
  const values = new Set();
  for (const line of match[1].split(/\r?\n/)) {
    const valMatch = line.match(/:\s*"([^"]+)"/);
    if (valMatch) {
      values.add(valMatch[1]);
    }
  }
  return [...values].sort();
}

function parseCapabilityLeagueIds(contractsSource) {
  const listMatch = contractsSource.match(
    /export const LEAGUE_CAPABILITY_LIST[\s\S]*?Object\.freeze\(\[([\s\S]*?)\]\);/,
  );
  if (!listMatch) {
    return [];
  }
  const ids = [];
  const callRegex =
    /(?:tier1CoreFootball|tier1BzzoiroMajorCup|tier2BzzoiroFootball|tier2NationalTeam)\(\s*"([^"]+)"|defineCapability\(\s*\{\s*id:\s*"([^"]+)"/g;
  for (const match of listMatch[1].matchAll(callRegex)) {
    const id = match[1] ?? match[2];
    if (id) {
      ids.push(id);
    }
  }
  return ids;
}

function scanBlockedBooks(node, blockedBooks, contextLabel, errors) {
  if (!node || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      scanBlockedBooks(item, blockedBooks, contextLabel, errors);
    }
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (BOOK_KEYS.has(key) && typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (blockedBooks.has(normalized)) {
        errors.push(`Bookmaker bloqueado "${value}" en ${contextLabel} (${key})`);
      }
    } else if (value && typeof value === "object") {
      scanBlockedBooks(value, blockedBooks, contextLabel, errors);
    }
  }
}

function safeReadJson(filePath, label, errors) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    errors.push(
      `JSON invalido o ilegible en ${label}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

function hasValidTeamId(teamNode) {
  return Boolean(teamNode && typeof teamNode.id === "string" && teamNode.id.trim().length > 0);
}

export function runDataIntegrityAudit(rootDir = DEFAULT_ROOT) {
  const startedAt = Date.now();
  const errors = [];

  const capabilitiesPath = path.join(rootDir, "packages/contracts/src/league-capabilities.ts");
  const brandedPath = path.join(rootDir, "packages/contracts/src/branded.ts");
  const snapshotsRoot = path.join(rootDir, "data/snapshots");
  const shellIndexPath = path.join(snapshotsRoot, "shell-index.json");
  const quotesLatestPath = path.join(rootDir, "data/odds_timeseries/quotes_latest.json");

  if (!existsSync(capabilitiesPath)) {
    errors.push("No se encontro packages/contracts/src/league-capabilities.ts");
  }
  if (!existsSync(brandedPath)) {
    errors.push("No se encontro packages/contracts/src/branded.ts");
  }
  if (!existsSync(shellIndexPath)) {
    errors.push("No se encontro data/snapshots/shell-index.json");
  }

  const leagueIds = existsSync(capabilitiesPath)
    ? parseCapabilityLeagueIds(readFileSync(capabilitiesPath, "utf8"))
    : [];
  const uniqueLeagueIds = [...new Set(leagueIds)];

  if (leagueIds.length !== EXPECTED_LEAGUE_COUNT) {
    errors.push(
      `Se esperaban ${EXPECTED_LEAGUE_COUNT} ligas en LEAGUE_CAPABILITY_LIST y se encontraron ${leagueIds.length}`,
    );
  }
  if (uniqueLeagueIds.length !== leagueIds.length) {
    errors.push("Se detectaron IDs duplicados dentro de LEAGUE_CAPABILITY_LIST");
  }

  const blockedBooks = new Set(
    existsSync(brandedPath)
      ? extractSetStrings(readFileSync(brandedPath, "utf8"), "BLOCKED_BOOK_IDS").map((item) =>
          item.toLowerCase(),
        )
      : [],
  );
  if (blockedBooks.size === 0) {
    errors.push("No se pudieron cargar IDs de BLOCKED_BOOK_IDS en packages/contracts/src/branded.ts");
  }

  let shellRaw = "";
  let shellLeagueKeys = new Set();
  if (existsSync(shellIndexPath)) {
    shellRaw = readFileSync(shellIndexPath, "utf8");
    const shellParsed = safeReadJson(shellIndexPath, "data/snapshots/shell-index.json", errors);
    if (shellParsed && shellParsed.leagues && typeof shellParsed.leagues === "object") {
      shellLeagueKeys = new Set(Object.keys(shellParsed.leagues));
      scanBlockedBooks(
        shellParsed,
        blockedBooks,
        "data/snapshots/shell-index.json",
        errors,
      );
    } else if (shellParsed) {
      errors.push("data/snapshots/shell-index.json no contiene el objeto leagues");
    }
    if (/a\.espncdn\.com/i.test(shellRaw)) {
      errors.push("Referencia prohibida a.espncdn.com en data/snapshots/shell-index.json");
    }
    if (/mlbstatic\.com/i.test(shellRaw)) {
      errors.push("Referencia prohibida mlbstatic.com en data/snapshots/shell-index.json");
    }
    if (/sofascore/i.test(shellRaw)) {
      errors.push("Fuga FD-16 (sofascore) en data/snapshots/shell-index.json");
    }
  }

  const leagueIdSet = new Set(uniqueLeagueIds);
  for (const id of uniqueLeagueIds) {
    if (!shellLeagueKeys.has(id)) {
      errors.push(`Liga "${id}" ausente en data/snapshots/shell-index.json`);
    }
    const latestFile = path.join(snapshotsRoot, id, "latest.json");
    if (!existsSync(latestFile)) {
      errors.push(`Falta data/snapshots/${id}/latest.json`);
    }
  }
  for (const key of shellLeagueKeys) {
    if (!leagueIdSet.has(key)) {
      errors.push(`Liga extra "${key}" en shell-index.json fuera de LEAGUE_CAPABILITY_LIST`);
    }
  }

  if (existsSync(snapshotsRoot)) {
    for (const entry of readdirSync(snapshotsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!leagueIdSet.has(entry.name)) {
        errors.push(`Carpeta extra en data/snapshots/${entry.name} fuera de LEAGUE_CAPABILITY_LIST`);
      }
    }
  }

  const teamlogoRegex = new RegExp("a\\.espncdn\\.com/i/teamlogos", "i");
  const seenGameIds = new Map();
  let gamesChecked = 0;

  for (const id of uniqueLeagueIds) {
    const leagueDir = path.join(snapshotsRoot, id);
    if (!existsSync(leagueDir)) continue;

    const latestFile = path.join(leagueDir, "latest.json");
    if (existsSync(latestFile)) {
      const latestParsed = safeReadJson(latestFile, `data/snapshots/${id}/latest.json`, errors);
      if (latestParsed) {
        scanBlockedBooks(latestParsed, blockedBooks, `data/snapshots/${id}/latest.json`, errors);
        if (!Array.isArray(latestParsed.games)) {
          errors.push(`data/snapshots/${id}/latest.json no tiene arreglo games`);
        } else {
          for (const game of latestParsed.games) {
            gamesChecked += 1;
            if (!game || typeof game !== "object" || typeof game.id !== "string" || !game.id) {
              errors.push(`Partido sin id valido en data/snapshots/${id}/latest.json`);
              continue;
            }
            if (seenGameIds.has(game.id)) {
              errors.push(
                `ID de partido duplicado "${game.id}" en ${seenGameIds.get(game.id)} y ${id}`,
              );
            } else {
              seenGameIds.set(game.id, id);
            }
            const parsedStart =
              typeof game.startTime === "string" ? Date.parse(game.startTime) : Number.NaN;
            if (!Number.isFinite(parsedStart)) {
              errors.push(`startTime invalido en ${id} (${game.id})`);
            }
            if (
              hasValidTeamId(game.home) &&
              hasValidTeamId(game.away) &&
              game.home.id === game.away.id
            ) {
              errors.push(`Partido con mismo equipo local y visita en ${id} (${game.id})`);
            }
            if (game.result !== undefined && game.result !== null) {
              const homeScore = game.result.home;
              const awayScore = game.result.away;
              const validHome =
                typeof homeScore === "number" && Number.isFinite(homeScore) && homeScore >= 0;
              const validAway =
                typeof awayScore === "number" && Number.isFinite(awayScore) && awayScore >= 0;
              if (!validHome || !validAway) {
                errors.push(`Marcador invalido en ${id} (${game.id})`);
              }
            }
          }
        }
      }
    }

    for (const fileName of readdirSync(leagueDir)) {
      if (!fileName.endsWith(".json")) continue;
      const fullPath = path.join(leagueDir, fileName);
      const rawText = readFileSync(fullPath, "utf8");
      const relLabel = `data/snapshots/${id}/${fileName}`;

      if (/sofascore/i.test(rawText)) {
        errors.push(`Fuga FD-16 (sofascore) en ${relLabel}`);
      }
      if (STRICT_NO_EXTERNAL_FILES.has(fileName)) {
        if (/a\.espncdn\.com/i.test(rawText)) {
          errors.push(`URL externa prohibida a.espncdn.com en ${relLabel}`);
        }
        if (/mlbstatic\.com/i.test(rawText)) {
          errors.push(`URL externa prohibida mlbstatic.com en ${relLabel}`);
        }
      } else if (fileName === "squads.json") {
        if (/mlbstatic\.com/i.test(rawText) || teamlogoRegex.test(rawText)) {
          errors.push(`URL de logo externo prohibida en ${relLabel}`);
        }
      }

      if (fileName === "market-pulse.json") {
        const pulseParsed = safeReadJson(fullPath, relLabel, errors);
        if (pulseParsed) {
          scanBlockedBooks(pulseParsed, blockedBooks, relLabel, errors);
        }
      }
    }
  }

  if (existsSync(quotesLatestPath)) {
    const quotesParsed = safeReadJson(
      quotesLatestPath,
      "data/odds_timeseries/quotes_latest.json",
      errors,
    );
    if (quotesParsed && Array.isArray(quotesParsed.ticks)) {
      for (const tick of quotesParsed.ticks) {
        if (tick && typeof tick.book === "string") {
          const normalized = tick.book.trim().toLowerCase();
          if (blockedBooks.has(normalized)) {
            errors.push(
              `Bookmaker bloqueado "${tick.book}" en data/odds_timeseries/quotes_latest.json`,
            );
          }
        }
      }
    }
  }

  const publicRoot = path.join(rootDir, "apps/web/public");
  const packSportPath = path.join(rootDir, "packages/ui/src/platform/components/PackSportIcons.tsx");
  const sportEventPath = path.join(rootDir, "packages/ui/src/platform/components/SportEventIcons.tsx");
  const maestroPath = path.join(rootDir, "packages/ui/src/platform/components/MaestroPrimitives.tsx");

  const packRelAssets = [];
  if (existsSync(packSportPath) && existsSync(sportEventPath) && existsSync(maestroPath)) {
    const packText = readFileSync(packSportPath, "utf8");
    const eventText = readFileSync(sportEventPath, "utf8");
    const maestroText = readFileSync(maestroPath, "utf8");

    for (const slug of extractFrozenStringArray(packText, "MATCH_CONTEXT_ICON_NAMES")) {
      packRelAssets.push(`contexto/${slug}.webp`);
    }
    for (const slug of extractFrozenStringArray(eventText, "SPORT_EVENT_PACK_ASSETS")) {
      packRelAssets.push(`eventos/${slug}.webp`);
    }
    for (const slug of extractRecordUniqueValues(maestroText, "MAESTRO_ICON_PACK_SLUGS")) {
      packRelAssets.push(`interfaz/${slug}.webp`);
    }
    for (const slug of extractFrozenStringArray(packText, "PLAYER_META_ICON_NAMES")) {
      packRelAssets.push(`jugador/${slug}.webp`);
    }
    for (const slug of extractFrozenStringArray(packText, "MARKET_CATEGORY_ICON_NAMES")) {
      packRelAssets.push(`mercados/${slug}.webp`);
    }
  } else {
    errors.push("Faltan archivos fuente de manifiestos de iconos WebP en packages/ui");
  }

  if (packRelAssets.length === 0) {
    errors.push("No se pudieron extraer slugs WebP desde PACK_ICON_ASSET_MANIFEST");
  }

  let webpAssetsChecked = 0;
  for (const relAsset of packRelAssets) {
    for (const baseFolder of ICON_PACK_BASES) {
      webpAssetsChecked += 1;
      const diskPath = path.join(publicRoot, baseFolder, relAsset);
      if (!existsSync(diskPath)) {
        errors.push(`Falta asset WebP en disco: apps/web/public/${baseFolder}/${relAsset}`);
      }
    }
  }

  const brandRelAssets = new Set();
  const registryPath = path.join(rootDir, "packages/sports-assets/src/registry.generated.ts");
  const brandPath = path.join(rootDir, "packages/sports-assets/src/brand.ts");
  const nationalPath = path.join(rootDir, "packages/sports-assets/src/national-assets.generated.ts");

  if (existsSync(registryPath)) {
    const regText = readFileSync(registryPath, "utf8");
    for (const match of regText.matchAll(/"(\/brand\/[^"]+)"/g)) {
      brandRelAssets.add(match[1].slice(1));
    }
    for (const edition of extractInlineArrayStrings(regText, "MASCOT_EDITIONS")) {
      brandRelAssets.add(`brand/mascot/r1/${edition}.webp`);
    }
  }
  if (existsSync(brandPath)) {
    const brandText = readFileSync(brandPath, "utf8");
    for (const match of brandText.matchAll(/"(\/brand\/[^"]+)"/g)) {
      brandRelAssets.add(match[1].slice(1));
    }
  }
  if (existsSync(nationalPath)) {
    const natText = readFileSync(nationalPath, "utf8");
    for (const slug of extractSetStrings(natText, "NATIONAL_COUNTRY_SLUGS")) {
      brandRelAssets.add(`brand/official/countries/${slug}.png`);
    }
    for (const slug of extractSetStrings(natText, "NATIONAL_COMPETITION_ASSETS")) {
      brandRelAssets.add(`brand/official/competitions/${slug}.png`);
    }
  }

  if (brandRelAssets.size === 0) {
    errors.push("No se encontraron assets /brand registrados en packages/sports-assets");
  }

  for (const relAsset of brandRelAssets) {
    const diskPath = path.join(publicRoot, relAsset);
    if (!existsSync(diskPath)) {
      errors.push(`Falta asset de marca registrado en disco: apps/web/public/${relAsset}`);
    }
  }

  return {
    ok: errors.length === 0,
    summary: {
      leaguesChecked: uniqueLeagueIds.length,
      gamesChecked,
      webpAssetsChecked,
      brandAssetsChecked: brandRelAssets.size,
      durationMs: Date.now() - startedAt,
    },
    errors,
  };
}

const isMainModule =
  typeof process.argv[1] === "string" &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const result = runDataIntegrityAudit();
  if (result.ok) {
    console.log(
      `[data-integrity] OK · ${result.summary.leaguesChecked} ligas · ${result.summary.gamesChecked} partidos · ${result.summary.webpAssetsChecked} WebP · ${result.summary.brandAssetsChecked} brand assets · ${result.summary.durationMs} ms`,
    );
    process.exit(0);
  }
  console.error(`[data-integrity] FALLO (${result.errors.length} errores):`);
  for (const issue of result.errors.slice(0, 40)) {
    console.error(`  - ${issue}`);
  }
  if (result.errors.length > 40) {
    console.error(`  ... y ${result.errors.length - 40} errores adicionales.`);
  }
  process.exit(1);
}
