/**
 * Descarga (bajo demanda) retratos de entrenadores/managers de ligas US (MLB, NBA, NFL, NHL)
 * desde Wikimedia Commons (vía MediaWiki API gratuita, verificando licencias abiertas CC/PD)
 * y los optimiza a WebP 160×160 en `apps/web/public/brand/official/coaches/<league>/<team-slug>.webp`.
 *
 * Genera además `apps/web/public/brand/official/coaches/LICENSE-wikimedia.txt` con la
 * atribución exacta de cada retrato.
 *
 * Uso:
 *   pnpm --filter @pitchlab/web exec node ../../packages/sports-assets/scripts/sync-us-coach-portraits.mjs --leagues=mlb,nba,nfl,nhl
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = resolve(SCRIPT_DIR, "..");
const ROOT_DIR = resolve(PKG_DIR, "..", "..");
const SNAPSHOTS_DIR = join(ROOT_DIR, "data", "snapshots");
const COACHES_ROOT = join(ROOT_DIR, "apps", "web", "public", "brand", "official", "coaches");
const LICENSE_FILE = join(COACHES_ROOT, "LICENSE-wikimedia.txt");
const MANIFEST_FILE = join(COACHES_ROOT, "manifest.json");

const WIKI_UA = "PitchLab-Assets/0.1 (https://pitchlab.mx; open-sports-research)";

const LEAGUE_SPORT_HINTS = {
  mlb: {
    searchTerm: "baseball manager",
    keywords: ["baseball", "mlb", "major league", "manager", "outfielder", "infielder", "pitcher", "catcher", "shortstop"],
  },
  nba: {
    searchTerm: "basketball coach",
    keywords: ["basketball", "nba", "head coach", "coach"],
  },
  nfl: {
    searchTerm: "American football coach",
    keywords: ["american football", "nfl", "head coach", "quarterback", "linebacker", "coach"],
  },
  nhl: {
    searchTerm: "ice hockey coach",
    keywords: ["ice hockey", "nhl", "hockey", "head coach", "coach"],
  },
};

function stripHtml(raw) {
  return String(raw || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(raw) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, init = {}, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 429 && attempt < retries) {
        const retrySec = Number(res.headers.get("retry-after") || "2");
        await sleep(Math.min(6000, Math.max(1200, retrySec * 1000)));
        continue;
      }
      return res;
    } catch (err) {
      void err;
      if (attempt < retries) await sleep(800);
    }
  }
  return null;
}

async function fetchJson(url) {
  const res = await fetchWithRetry(url, {
    headers: { "User-Agent": WIKI_UA, Accept: "application/json" },
  });
  if (!res || !res.ok) return null;
  try {
    return await res.json();
  } catch (err) {
    void err;
    return null;
  }
}

async function resolveWikiCoachPortrait(coachName, league) {
  const hint = LEAGUE_SPORT_HINTS[league];
  const normCoach = normalizeName(coachName);
  const lastName = normCoach.split(" ").at(-1) || "";

  const queries = [
    `${coachName} ${hint.searchTerm}`,
    coachName,
  ];

  const candidateTitles = [];
  for (const q of queries) {
    const searchUrl =
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=5&format=json`;
    const data = await fetchJson(searchUrl);
    for (const hit of data?.query?.search ?? []) {
      const title = String(hit.title || "").trim();
      if (!title || candidateTitles.includes(title)) continue;
      const normTitle = normalizeName(title);
      if (lastName && !normTitle.includes(lastName)) continue;
      candidateTitles.push(title);
    }
    if (candidateTitles.length >= 4) break;
  }

  for (const title of candidateTitles.slice(0, 5)) {
    const infoUrl =
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}` +
      `&prop=pageimages|extracts|info&piprop=thumbnail|name&pithumbsize=320&exintro=1&explaintext=1&exsentences=3&inprop=url&format=json`;
    const data = await fetchJson(infoUrl);
    const pages = Object.values(data?.query?.pages ?? {});
    const page = pages[0];
    if (!page || page.missing !== undefined) continue;

    const extract = normalizeName(`${page.title || ""} ${page.extract || ""}`);
    const matchesSport = hint.keywords.some((kw) => extract.includes(kw));
    if (!matchesSport) continue;

    const thumbUrl = page.thumbnail?.source;
    const imageFile = page.pageimage;
    if (!thumbUrl || !imageFile) continue;
    if (/\.(svg|gif)$/i.test(imageFile)) continue;

    // Verificar metadatos/licencia en Wikimedia Commons
    const metaUrl =
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(`File:${imageFile}`)}` +
      `&prop=imageinfo&iiprop=extmetadata|mime&format=json`;
    const metaData = await fetchJson(metaUrl);
    const imgPage = Object.values(metaData?.query?.pages ?? {})[0];
    const ii = imgPage?.imageinfo?.[0];
    const ext = ii?.extmetadata ?? {};
    const licenseShort = stripHtml(ext.LicenseShortName?.value || "Wikimedia Commons");
    const artist = stripHtml(ext.Artist?.value || "Autor en Wikimedia Commons").slice(0, 120);
    const isNonFree = /fair use|non-free|copyrighted/i.test(licenseShort);
    if (isNonFree) continue;

    return {
      title: page.title,
      pageUrl: page.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      thumbUrl,
      imageFile,
      licenseShort,
      artist,
    };
  }

  return null;
}

async function runPool(items, concurrency, worker) {
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const i = cursor++;
      await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => next()));
}

async function main() {
  const webRequire = createRequire(join(ROOT_DIR, "apps", "web", "package.json"));
  const sharp = webRequire("sharp");
  const arg = process.argv.find((a) => a.startsWith("--leagues="))?.slice(10);
  const force = process.argv.includes("--force");
  const leagues = (arg ? arg.split(",") : ["mlb", "nba", "nfl", "nhl"])
    .map((s) => s.trim())
    .filter((s) => s in LEAGUE_SPORT_HINTS);

  mkdirSync(COACHES_ROOT, { recursive: true });
  const manifest = existsSync(MANIFEST_FILE)
    ? JSON.parse(readFileSync(MANIFEST_FILE, "utf8"))
    : {};

  for (const league of leagues) {
    const squadsPath = join(SNAPSHOTS_DIR, league, "squads.json");
    if (!existsSync(squadsPath)) {
      console.warn(`[coaches:${league}] No existe squads.json; omitido.`);
      continue;
    }
    const squads = JSON.parse(readFileSync(squadsPath, "utf8"));
    const outDir = join(COACHES_ROOT, league);
    mkdirSync(outDir, { recursive: true });

    let found = 0;
    let total = 0;
    const missing = [];

    await runPool(squads.teams, 2, async (team) => {
      const coachName = (team.coach?.name || team.coachName || "").trim();
      if (!coachName) return;
      total += 1;
      const key = `${league}.${team.teamSlug}`;
      const destWebp = join(outDir, `${team.teamSlug}.webp`);
      const publicPath = `/brand/official/coaches/${league}/${team.teamSlug}.webp`;

      if (!force && existsSync(destWebp) && manifest[key]?.coachName === coachName) {
        found += 1;
        return;
      }

      await sleep(350);
      const resolved = await resolveWikiCoachPortrait(coachName, league);
      if (!resolved) {
        missing.push(`${team.teamSlug} (${coachName})`);
        return;
      }

      try {
        await sleep(300);
        const imgRes = await fetchWithRetry(resolved.thumbUrl, {
          headers: { "User-Agent": WIKI_UA },
        });
        if (!imgRes || !imgRes.ok) {
          missing.push(`${team.teamSlug} (${coachName} HTTP ${imgRes?.status ?? "err"})`);
          return;
        }
        const rawBuf = Buffer.from(await imgRes.arrayBuffer());
        if (rawBuf.length < 500) {
          missing.push(`${team.teamSlug} (${coachName} vacío)`);
          return;
        }
        const webpBuf = await sharp(rawBuf)
          .resize(160, 160, { fit: "cover", position: "top" })
          .webp({ quality: 82 })
          .toBuffer();
        writeFileSync(destWebp, webpBuf);
        manifest[key] = {
          league,
          teamSlug: team.teamSlug,
          coachName,
          publicPath,
          sourcePage: resolved.pageUrl,
          imageFile: resolved.imageFile,
          license: resolved.licenseShort,
          artist: resolved.artist,
        };
        found += 1;
      } catch (err) {
        void err;
        missing.push(`${team.teamSlug} (${coachName} error sharp)`);
      }
    });

    console.log(
      `[coaches:${league}] ${found}/${total} retratos descargados${missing.length ? ` · sin retrato abierto: ${missing.join(", ")}` : ""}`,
    );
  }

  writeFileSync(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const lines = [
    "# Atribución de retratos de entrenadores (Wikimedia Commons)",
    "",
    "Retratos de licencia abierta (CC / Dominio Público) optimizados a 160×160 WebP para uso informativo en perfiles de equipo.",
    "",
  ];
  for (const key of Object.keys(manifest).sort()) {
    const item = manifest[key];
    lines.push(
      `- ${item.publicPath} — ${item.coachName} (${item.league.toUpperCase()}): File:${item.imageFile} · ${item.license} · ${item.artist} · ${item.sourcePage}`,
    );
  }
  writeFileSync(LICENSE_FILE, `${lines.join("\n")}\n`, "utf8");
  console.log(`OK [coaches]: manifiesto (${Object.keys(manifest).length}) y atribución guardados.`);
}

main().catch((err) => {
  console.error("Error en sync-us-coach-portraits:", err);
  process.exit(1);
});
