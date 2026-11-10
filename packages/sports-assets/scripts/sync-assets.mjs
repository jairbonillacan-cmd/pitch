import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PKG_DIR = resolve(import.meta.dirname, "..");
const ROOT_DIR = resolve(PKG_DIR, "..", "..");
const BRAND_DIR = join(ROOT_DIR, "pitchlab-brand");
const WEB_PUBLIC_BRAND = join(ROOT_DIR, "apps", "web", "public", "brand");
const SRC_DIR = join(PKG_DIR, "src");

mkdirSync(SRC_DIR, { recursive: true });
mkdirSync(WEB_PUBLIC_BRAND, { recursive: true });

const LEAGUE_SOURCES = [
  {
    league: "liga-mx",
    relDir: "football/liga-mx-apertura-2026",
  },
  {
    league: "premier-league",
    relDir: "football/premier-league-2026-27",
  },
  {
    league: "laliga",
    relDir: "football/laliga-2026-27",
  },
  {
    league: "bundesliga",
    relDir: "football/bundesliga-2026-27",
  },
  {
    league: "serie-a",
    relDir: "football/serie-a-2026-27",
  },
  {
    league: "ligue-1",
    relDir: "football/ligue-1-2026-27",
  },
  {
    league: "nfl",
    relDir: "american-football/nfl-2026",
  },
  {
    league: "mlb",
    relDir: "baseball/mlb-2026",
  },
  {
    league: "nhl",
    relDir: "hockey/nhl-2026-27",
  },
];

function validateManifest(manifest, sourcePath) {
  if (typeof manifest !== "object" || manifest === null) {
    throw new Error(`Manifiesto inválido en ${sourcePath}`);
  }
  if (typeof manifest.schemaVersion !== "number" || typeof manifest.designRevision !== "number") {
    throw new Error(`Falta schemaVersion o designRevision en ${sourcePath}`);
  }
  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    throw new Error(`entries vacío en ${sourcePath}`);
  }
  for (const entry of manifest.entries) {
    if (
      typeof entry.id !== "string" ||
      typeof entry.code !== "string" ||
      typeof entry.name !== "string" ||
      typeof entry.shortName !== "string" ||
      typeof entry.svg !== "string" ||
      typeof entry.png !== "string"
    ) {
      throw new Error(`Entrada incompleta (${entry?.id}) en ${sourcePath}`);
    }
  }
}

function extractClubColors(svgRaw) {
  const fills = [...svgRaw.matchAll(/fill="(#[0-9a-fA-F]{6})"/g)].map((m) =>
    m[1].toUpperCase(),
  );
  const counts = new Map();
  for (const hex of fills) {
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  const scored = [];
  for (const [hex, count] of counts.entries()) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (l < 0.14 || l > 0.86 || s < 0.16) continue;
    const midWeight = l >= 0.23 && l <= 0.77 ? 1.35 : 0.65;
    const score = s * midWeight * (1 + Math.min(count, 6) * 0.12);
    scored.push({ hex, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const primary = scored[0]?.hex ?? "#5940B2";
  const secondary = scored[1]?.hex ?? scored[0]?.hex ?? "#1F6F99";
  return [primary, secondary];
}

const registryLeagues = {};
const registryTeams = {};

for (const { league, relDir } of LEAGUE_SOURCES) {
  const srcFolder = join(BRAND_DIR, relDir);
  const manifestPath = join(srcFolder, "manifest.json");
  const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  validateManifest(raw, manifestPath);

  const rev = raw.designRevision;
  const destFolder = join(WEB_PUBLIC_BRAND, "sports", league, `r${rev}`);
  mkdirSync(join(destFolder, "svg"), { recursive: true });
  mkdirSync(join(destFolder, "png"), { recursive: true });

  for (const entry of raw.entries) {
    const svgSrc = join(srcFolder, entry.svg);
    const pngSrc = join(srcFolder, entry.png);
    if (!existsSync(svgSrc)) {
      throw new Error(`No existe SVG requerido: ${svgSrc}`);
    }
    if (!existsSync(pngSrc)) {
      throw new Error(`No existe PNG requerido: ${pngSrc}`);
    }
    cpSync(svgSrc, join(destFolder, entry.svg));
    cpSync(pngSrc, join(destFolder, entry.png));

    const webSvg = `/brand/sports/${league}/r${rev}/${entry.svg}`;
    const webPng = `/brand/sports/${league}/r${rev}/${entry.png}`;

    if (entry.kind === "competition") {
      registryLeagues[league] = {
        id: league,
        code: entry.code,
        name: entry.name,
        shortName: entry.shortName,
        revision: rev,
        svgPath: webSvg,
        pngPath: webPng,
      };
    } else {
      const canonicalId = `${league}.${entry.id}`;
      const svgRaw = readFileSync(svgSrc, "utf8");
      registryTeams[canonicalId] = {
        id: canonicalId,
        slug: entry.id,
        league,
        code: entry.code,
        name: entry.name,
        shortName: entry.shortName,
        revision: rev,
        svgPath: webSvg,
        pngPath: webPng,
        colors: extractClubColors(svgRaw),
      };
    }
  }
}

// Copiar mascota Radar (pitchlab-brand/mascot/web/*.webp -> /brand/mascot/r1/*.webp)
const mascotSrc = join(BRAND_DIR, "mascot", "web");
const mascotDest = join(WEB_PUBLIC_BRAND, "mascot", "r1");
mkdirSync(mascotDest, { recursive: true });
const mascots = [];
for (const file of readdirSync(mascotSrc)) {
  if (file.endsWith(".webp")) {
    cpSync(join(mascotSrc, file), join(mascotDest, file));
    mascots.push(file.replace(/\.webp$/, ""));
  }
}

// Copiar logos oficiales (pitchlab-brand/logos/*.svg -> /brand/logos/r1/*.svg)
const logosSrc = join(BRAND_DIR, "logos");
const logosDest = join(WEB_PUBLIC_BRAND, "logos", "r1");
mkdirSync(logosDest, { recursive: true });
for (const file of readdirSync(logosSrc)) {
  if (file.endsWith(".svg")) {
    cpSync(join(logosSrc, file), join(logosDest, file));
  }
}

// Copiar favicon (pitchlab-brand/app-icons/favicon.svg -> /brand/app-icons/favicon.svg)
const appIconsDest = join(WEB_PUBLIC_BRAND, "app-icons");
mkdirSync(appIconsDest, { recursive: true });
cpSync(join(BRAND_DIR, "app-icons", "favicon.svg"), join(appIconsDest, "favicon.svg"));

const generatedTs = `// Generado automáticamente por packages/sports-assets/scripts/sync-assets.mjs — NO EDITAR MANUALMENTE
export interface RegisteredLeagueAsset {
  id: string;
  code: string;
  name: string;
  shortName: string;
  revision: number;
  svgPath: string;
  pngPath: string;
}

export interface RegisteredTeamAsset {
  id: string;
  slug: string;
  league: string;
  code: string;
  name: string;
  shortName: string;
  revision: number;
  svgPath: string;
  pngPath: string;
  colors: readonly [string, string];
}

export const LEAGUE_ASSETS: Record<string, RegisteredLeagueAsset> = ${JSON.stringify(registryLeagues, null, 2)};

export const TEAM_ASSETS: Record<string, RegisteredTeamAsset> = ${JSON.stringify(registryTeams, null, 2)};

export const MASCOT_EDITIONS = ${JSON.stringify(mascots)} as const;
export type MascotEdition = (typeof MASCOT_EDITIONS)[number];
`;

const registryOutPath = join(SRC_DIR, "registry.generated.ts");
const existingRegistry = existsSync(registryOutPath)
  ? readFileSync(registryOutPath, "utf8")
  : "";
if (existingRegistry !== generatedTs) {
  writeFileSync(registryOutPath, generatedTs, "utf8");
}
console.log(
  `OK [@pitchlab/sports-assets]: ${Object.keys(registryTeams).length} equipos y ${Object.keys(registryLeagues).length} ligas sincronizados a apps/web/public/brand/`,
);
