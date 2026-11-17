import type { LeagueSnapshot } from "@pitchlab/contracts";
import {
  getBzzoiroTeamEmblemUrl,
  getOfficialEspnTeamLogoUrl,
} from "@pitchlab/sports-assets";
import type {
  LeagueNewsArticleSummary,
  LeagueNewsCategory,
  LeagueNewsItem,
} from "@pitchlab/ui";
import type { ProductLeague } from "./snapshots";

const ESPN_NEWS_SLUGS: Readonly<
  Record<ProductLeague, { sportPath: string; slug: string }>
> = {
  "liga-mx": { sportPath: "soccer", slug: "mex.1" },
  "premier-league": { sportPath: "soccer", slug: "eng.1" },
  laliga: { sportPath: "soccer", slug: "esp.1" },
  bundesliga: { sportPath: "soccer", slug: "ger.1" },
  "serie-a": { sportPath: "soccer", slug: "ita.1" },
  "ligue-1": { sportPath: "soccer", slug: "fra.1" },
  nfl: { sportPath: "football", slug: "nfl" },
  nba: { sportPath: "basketball", slug: "nba" },
  nhl: { sportPath: "hockey", slug: "nhl" },
  "concacaf-nations": { sportPath: "soccer", slug: "concacaf.nations.league" },
  "uefa-nations": { sportPath: "soccer", slug: "uefa.nations" },
  amistosos: { sportPath: "soccer", slug: "fifa.friendly" },
  "copa-del-mundo": { sportPath: "soccer", slug: "fifa.world" },
  eliminatorias: { sportPath: "soccer", slug: "fifa.world" },
  "copa-america": { sportPath: "soccer", slug: "conmebol.america" },
  eurocopa: { sportPath: "soccer", slug: "uefa.euro" },
  "copa-oro": { sportPath: "soccer", slug: "concacaf.gold" },
  "copa-africana": { sportPath: "soccer", slug: "caf.nations" },
  "copa-asiatica": { sportPath: "soccer", slug: "afc.asian.cup" },
};

const NEWS_CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 4_000;

export interface ParsedEspnArticle {
  id: string;
  type: string;
  headline: string;
  description: string;
  imageCaption?: string;
  publishedIso: string | undefined;
  byline: string | undefined;
  webUrl: string | undefined;
  teamTags: string[];
  athleteTags: string[];
  topicTags: string[];
  leagueTags: string[];
}

interface LeagueCacheEntry {
  fetchedAtMs: number;
  articles: ParsedEspnArticle[];
  articlesById: Map<string, ParsedEspnArticle>;
  urlsById: Map<string, string>;
}

interface SummaryCacheEntry {
  fetchedAtMs: number;
  summary: LeagueNewsArticleSummary;
}

const GLOBAL_CACHE_KEY = "__pitchlabEspnNewsCache_v2";

function getCacheStore(): {
  entries: Map<ProductLeague, LeagueCacheEntry>;
  inflight: Map<ProductLeague, Promise<LeagueCacheEntry | null>>;
  summaries: Map<string, SummaryCacheEntry>;
} {
  const g = globalThis as unknown as Record<
    string,
    {
      entries: Map<ProductLeague, LeagueCacheEntry>;
      inflight: Map<ProductLeague, Promise<LeagueCacheEntry | null>>;
      summaries: Map<string, SummaryCacheEntry>;
    }
  >;
  if (!g[GLOBAL_CACHE_KEY]) {
    g[GLOBAL_CACHE_KEY] = {
      entries: new Map(),
      inflight: new Map(),
      summaries: new Map(),
    };
  }
  return g[GLOBAL_CACHE_KEY];
}

const FORBIDDEN_COPY_RE =
  /\b(dixon-coles|poisson|lightgbm|platt|pitágoras|log5|nflverse|openfootball|api-football|polymarket|kalshi|understat|espn)\b/i;

function cleanText(text: string): string {
  return text.replace(/^VIDEO:\s*/i, "").replace(/\s{2,}/g, " ").trim();
}

/** Titular: si nombra al proveedor se omite esa mención (nunca se reatribuye a PitchLab). */
function sanitizeHeadline(text: string): string {
  return cleanText(text.replace(new RegExp(FORBIDDEN_COPY_RE.source, "gi"), ""))
    .replace(/\s+([,.:;])/g, "$1");
}

/**
 * Descripción: se descartan las frases que nombran al proveedor o fuentes internas.
 * Reemplazar el nombre por «PitchLab» atribuiría a PitchLab un reporte ajeno.
 */
function sanitizeDescription(text: string): string {
  return cleanText(text)
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !FORBIDDEN_COPY_RE.test(sentence))
    .join(" ")
    .trim();
}

export function isValidEspnArticleUrl(rawUrl: string | undefined): rawUrl is string {
  if (!rawUrl) return false;
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.protocol === "https:" &&
      /^(?:[a-z0-9-]+\.)*espn\.com(?:\.[a-z]{2})?$/i.test(parsed.hostname)
    );
  } catch {
    return false;
  }
}

interface RawCategory {
  type?: unknown;
  description?: unknown;
  slug?: unknown;
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function parseEspnArticlesPayload(payload: unknown): ParsedEspnArticle[] {
  if (!isRecord(payload) || !Array.isArray(payload.articles)) return [];

  const parsed: ParsedEspnArticle[] = [];
  for (const raw of payload.articles as unknown[]) {
    if (!isRecord(raw)) continue;
    const idRaw = raw.id;
    const id =
      typeof idRaw === "number" && Number.isInteger(idRaw) && idRaw > 0
        ? String(idRaw)
        : typeof idRaw === "string" && /^\d{1,20}$/.test(idRaw)
          ? idRaw
          : null;
    const headline = asString(raw.headline);
    if (!id || !headline || headline.length < 4) continue;

    const cats: RawCategory[] = Array.isArray(raw.categories)
      ? (raw.categories as unknown[]).filter(isRecord)
      : [];
    const teamTags: string[] = [];
    const athleteTags: string[] = [];
    const topicTags: string[] = [];
    const leagueTags: string[] = [];
    for (const c of cats) {
      const description = asString(c.description);
      const slug = asString(c.slug);
      if (c.type === "team" && description) teamTags.push(description);
      else if (c.type === "athlete" && description) athleteTags.push(description);
      else if (c.type === "topic" && (description || slug)) {
        topicTags.push((description ?? slug ?? "").toLowerCase());
      } else if (c.type === "league" && description) leagueTags.push(description);
    }

    const images = Array.isArray(raw.images)
      ? (raw.images as unknown[]).filter(isRecord)
      : [];
    const rawCaption = asString(images[0]?.caption);
    const cleanedCaption = rawCaption
      ? sanitizeDescription(rawCaption.replace(/<[^>]+>/g, " "))
      : "";

    const links = isRecord(raw.links) ? raw.links : undefined;
    const web = links && isRecord(links.web) ? links.web : undefined;
    const webHref = asString(web?.href);

    parsed.push({
      id,
      type: asString(raw.type) ?? "dStory",
      headline: sanitizeHeadline(headline),
      description: sanitizeDescription(asString(raw.description) ?? ""),
      ...(cleanedCaption ? { imageCaption: cleanedCaption } : {}),
      publishedIso: asString(raw.published),
      byline: asString(raw.byline) ? sanitizeHeadline(asString(raw.byline)!) : undefined,
      webUrl: isValidEspnArticleUrl(webHref) ? webHref : undefined,
      teamTags,
      athleteTags,
      topicTags,
      leagueTags,
    });
  }
  return parsed;
}

export type NewsFetcher = (url: string) => Promise<unknown>;

const defaultFetcher: NewsFetcher = async (url) => {
  // Mismo patrón que los adaptadores de ESPN de `services/ingest` (solo `accept`): la API
  // pública rechaza con 403 los `user-agent` personalizados.
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`News feed HTTP ${res.status}`);
  }
  return res.json();
};

async function loadOrRefreshFeed(
  league: ProductLeague,
  fetcher: NewsFetcher = defaultFetcher,
  nowMs: number = Date.now(),
): Promise<LeagueCacheEntry | null> {
  const store = getCacheStore();
  const cached = store.entries.get(league);
  if (cached && nowMs - cached.fetchedAtMs < NEWS_CACHE_TTL_MS) {
    return cached;
  }

  const pending = store.inflight.get(league);
  if (pending) return pending;

  const target = ESPN_NEWS_SLUGS[league];
  const url = `https://site.api.espn.com/apis/site/v2/sports/${target.sportPath}/${target.slug}/news?lang=es&region=mx&limit=18`;

  const promise = (async (): Promise<LeagueCacheEntry | null> => {
    try {
      const payload = await fetcher(url);
      const articles = parseEspnArticlesPayload(payload);
      const articlesById = new Map<string, ParsedEspnArticle>();
      const urlsById = new Map<string, string>();
      for (const art of articles) {
        articlesById.set(art.id, art);
        if (art.webUrl) urlsById.set(art.id, art.webUrl);
      }
      const next: LeagueCacheEntry = {
        fetchedAtMs: Date.now(),
        articles,
        articlesById,
        urlsById,
      };
      store.entries.set(league, next);
      return next;
    } catch (err) {
      console.warn(`[espn-news] fallo al consultar noticias reales de ${league}:`, err);
      return cached ?? null;
    } finally {
      store.inflight.delete(league);
    }
  })();

  store.inflight.set(league, promise);
  return promise;
}

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function classifyEspnArticle(article: ParsedEspnArticle): {
  category: LeagueNewsCategory;
  categoryLabel: string;
} {
  const text = `${article.headline} ${article.description}`;
  if (
    /\b(lesi[oó]n|baja|fractura|duda|fuera|conmoci[oó]n|operaci[oó]n|cirug[ií]a|tobillo|rodilla|desgarro|m[eé]dic|part[ea] m[eé]dico|temen)\b/i.test(
      text,
    )
  ) {
    return { category: "lesiones", categoryLabel: "Parte médico" };
  }
  if (
    /\b(fichaje|fichajes|refuerzo|traspaso|contrato|oferta|vacante|mira|busca a|descarta salir|dt\b|t[eé]cnico|firm[oó])\b/i.test(
      text,
    )
  ) {
    return { category: "mercado", categoryLabel: "Mercado y fichajes" };
  }
  if (
    /\b(victoria|triunfo|derrota|aplasta|gan[oó]|ganan|empat[oó]|empad?taron|racha|paliza|festej|gole[aó]|remont|rompe su racha)\b/i.test(
      text,
    ) ||
    /Recap/i.test(article.type)
  ) {
    return { category: "resultados", categoryLabel: "Crónica y resultados" };
  }
  if (
    /\b(crisis|panorama|liguilla|claves|r[eé]cord|hitos|explicada|retos|semifinales)\b/i.test(
      text,
    )
  ) {
    return { category: "analisis", categoryLabel: "Panorama y claves" };
  }
  return { category: "jornada", categoryLabel: "Actualidad" };
}

function matchTeamInSnapshot(
  league: ProductLeague,
  article: ParsedEspnArticle,
  snapshot: LeagueSnapshot | null,
): {
  slug: string;
  name: string;
  logoUrl?: string;
  gameId?: string;
} | null {
  if (!snapshot) return null;

  interface Candidate {
    slug: string;
    name: string;
    shortName: string;
    aliases: string[];
    gameId?: string;
  }

  const bySlug = new Map<string, Candidate>();
  const slugOf = (id: string) => (id.includes(".") ? id.split(".").slice(1).join(".") : id);

  const registerTeam = (id: string, name: string, shortName: string | undefined, gameId?: string) => {
    const slug = slugOf(id);
    const existing = bySlug.get(slug);
    const normFull = normalize(name);
    const normShort = normalize(shortName || name);
    const normSlug = normalize(slug.replace(/-/g, " "));
    const aliases = [...new Set([normFull, normShort, normSlug].filter((a) => a.length >= 4))];
    if (!existing) {
      bySlug.set(slug, { slug, name, shortName: shortName || name, aliases, gameId });
    } else if (!existing.gameId && gameId) {
      existing.gameId = gameId;
    }
  };

  for (const g of snapshot.games) {
    const preferredGame = g.status !== "final" ? g.id : undefined;
    registerTeam(g.home.id, g.home.name, g.home.shortName, preferredGame ?? g.id);
    registerTeam(g.away.id, g.away.name, g.away.shortName, preferredGame ?? g.id);
  }
  for (const row of snapshot.standings ?? []) {
    registerTeam(row.teamId, row.name, row.shortName);
  }

  const tagsNorm = article.teamTags.map(normalize);
  // Solo el titular: la descripción menciona sedes y rivales que no son el tema de la nota.
  const textNorm = normalize(article.headline);

  // 1) Coincidencia exacta/parcial contra teamTags de la nota
  for (const cand of bySlug.values()) {
    for (const tag of tagsNorm) {
      if (
        cand.aliases.some(
          (alias) => tag === alias || tag.includes(alias) || alias.includes(tag),
        )
      ) {
        return {
          slug: cand.slug,
          name: cand.name,
          logoUrl:
            getBzzoiroTeamEmblemUrl(league, cand.slug) ??
            getOfficialEspnTeamLogoUrl(league, cand.slug) ??
            undefined,
          gameId: cand.gameId,
        };
      }
    }
  }

  // 2) Coincidencia en titular / descripción (evitando palabras cortas ambiguas)
  for (const cand of bySlug.values()) {
    if (
      cand.aliases.some(
        (alias) => alias.length >= 5 && new RegExp(`\\b${alias}\\b`).test(textNorm),
      )
    ) {
      return {
        slug: cand.slug,
        name: cand.name,
        logoUrl:
          getBzzoiroTeamEmblemUrl(league, cand.slug) ??
          getOfficialEspnTeamLogoUrl(league, cand.slug) ??
          undefined,
        gameId: cand.gameId,
      };
    }
  }

  return null;
}

function isEvergreenOrNoise(league: ProductLeague, article: ParsedEspnArticle): boolean {
  if (/retro|sb xxiii|touchdown de jerry rice/i.test(article.headline)) return true;
  if (
    league === "liga-mx" &&
    (/liga femenil/i.test(article.headline) ||
      article.leagueTags.some((l) => /femenil/i.test(l)) ||
      article.topicTags.includes("espnw"))
  ) {
    return true;
  }
  return false;
}

const DATE_SHORT_MX = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  weekday: "short",
  day: "numeric",
  month: "short",
});

const TIME_SHORT_MX = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function formatNewsDateEs(iso: string | undefined): string {
  if (!iso) return "Reciente";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "Reciente";
  return `${DATE_SHORT_MX.format(ms)} · ${TIME_SHORT_MX.format(ms)}`;
}

export function buildNewsItemsFromEspn(
  league: ProductLeague,
  articles: readonly ParsedEspnArticle[],
  snapshot: LeagueSnapshot | null,
): LeagueNewsItem[] {
  const sorted = [...articles].sort((a, b) => {
    const storyRank = (x: ParsedEspnArticle) => (x.type === "Media" ? 1 : 0);
    if (storyRank(a) !== storyRank(b)) return storyRank(a) - storyRank(b);
    return (Date.parse(b.publishedIso ?? "") || 0) - (Date.parse(a.publishedIso ?? "") || 0);
  });

  const nonNoise = sorted.filter((a) => !isEvergreenOrNoise(league, a));
  const pool = nonNoise.length >= 4 ? nonNoise : sorted;

  const seenHeadlines = new Set<string>();
  const out: LeagueNewsItem[] = [];

  for (const art of pool) {
    const key = normalize(art.headline).slice(0, 56);
    if (!key || seenHeadlines.has(key)) continue;
    seenHeadlines.add(key);

    const { category, categoryLabel } = classifyEspnArticle(art);
    const matchedTeam = matchTeamInSnapshot(league, art, snapshot);

    const href = matchedTeam?.gameId
      ? `/app/${league}/games/${matchedTeam.gameId}`
      : matchedTeam?.slug
        ? `/app/${league}/teams/${matchedTeam.slug}`
        : undefined;
    const ctaLabel = matchedTeam?.gameId
      ? "Ver partido y picks"
      : matchedTeam?.slug
        ? `Ver ${matchedTeam.name}`
        : undefined;

    const summaryHighlights = [...new Set([...art.teamTags, ...art.athleteTags])]
      .map(sanitizeHeadline)
      .filter((tag) => tag.length > 0 && !FORBIDDEN_COPY_RE.test(tag))
      .slice(0, 4);

    out.push({
      id: `live-${league}-${art.id}`,
      category,
      categoryLabel,
      title: art.headline,
      summary:
        art.description ||
        art.imageCaption ||
        "Nota actualizada de la jornada y contexto de los equipos.",
      publishedAtLabel: formatNewsDateEs(art.publishedIso),
      badge: art.byline ? art.byline.slice(0, 26) : "Última hora",
      team: matchedTeam
        ? {
            slug: matchedTeam.slug,
            name: matchedTeam.name,
            logoUrl: matchedTeam.logoUrl,
          }
        : undefined,
      href,
      ctaLabel,
      summaryHref: `/api/news/article?league=${encodeURIComponent(league)}&id=${encodeURIComponent(art.id)}`,
      readMoreLabel: "Leer nota",
      ...(summaryHighlights.length > 0 ? { summaryHighlights } : {}),
    });

    if (out.length >= 10) break;
  }

  return out;
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  quot: "\"",
  apos: "'",
  lt: "<",
  gt: ">",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  ntilde: "ñ",
  uuml: "ü",
  Aacute: "Á",
  Eacute: "É",
  Iacute: "Í",
  Oacute: "Ó",
  Uacute: "Ú",
  Ntilde: "Ñ",
  Uuml: "Ü",
  ldquo: "«",
  rdquo: "»",
  lsquo: "'",
  rsquo: "'",
  ndash: "–",
  mdash: "—",
  iexcl: "¡",
  iquest: "¿",
};

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : "";
    })
    .replace(/&([a-zA-Z]+);/g, (full, name: string) => NAMED_ENTITIES[name] ?? full);
}

const BOILERPLATE_PARA_RE =
  /^(?:informaci[oó]n de .+ fue utilizada|con informaci[oó]n de |lee tambi[eé]n\b|ver m[aá]s\b|nota relacionada\b|suscr[ií]bete\b|descarga la app\b)/i;

/**
 * Extrae párrafos limpios y concisos en texto plano para mostrar un resumen editorial
 * dentro de PitchLab sin HTML crudo, anuncios ni menciones a proveedores externos.
 */
export function extractSummaryParagraphsFromStoryHtml(
  storyHtml: string,
  existingLead?: string,
): string[] {
  if (!storyHtml || typeof storyHtml !== "string") return [];
  const plain = decodeHtmlEntities(
    storyHtml
      .replace(/<(script|style|blockquote|figure|figcaption|aside)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(?:inline|photo|video|related)\d*[^>]*\/?>/gi, " ")
      .replace(/<\/?(?:a|b|strong|i|em|span|u|small|sup|sub)\b[^>]*>/gi, "")
      .replace(/<\/?(?:p|h[1-6]|li|div|section|br)\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );

  const leadNorm = existingLead ? normalize(existingLead) : "";
  const paragraphs: string[] = [];
  let totalChars = 0;

  for (const rawLine of plain.split(/\n+/)) {
    const clean = sanitizeDescription(
      rawLine
        .replace(/\s+/g, " ")
        .replace(/\s+([,.;:!?])/g, "$1")
        .trim(),
    );
    if (!clean || clean.length < 24 || BOILERPLATE_PARA_RE.test(clean)) continue;

    const lineNorm = normalize(clean);
    if (leadNorm && lineNorm === leadNorm) continue;

    if (paragraphs.length > 0 && totalChars + clean.length > 1100) break;
    paragraphs.push(clean);
    totalChars += clean.length;
    if (paragraphs.length >= 4) break;
  }

  return paragraphs;
}

/**
 * Descarga (con caché de 10 min) noticias reales en español desde la API pública de ESPN
 * y las enriquece con escudos y enlaces directos a partidos o clubes dentro de PitchLab.
 */
export async function fetchEspnLeagueNews(
  league: ProductLeague,
  snapshot: LeagueSnapshot | null,
  fetcher?: NewsFetcher,
): Promise<LeagueNewsItem[]> {
  const entry = await loadOrRefreshFeed(league, fetcher);
  if (!entry || entry.articles.length === 0) return [];
  return buildNewsItemsFromEspn(league, entry.articles, snapshot);
}

/**
 * Construye en el servidor un resumen legible dentro de PitchLab para una nota verificada
 * del feed de la liga. Nunca redirige ni expone URLs del proveedor original.
 */
export async function resolveVerifiedNewsArticleSummary(
  league: ProductLeague,
  articleId: string,
  options?: {
    feedFetcher?: NewsFetcher;
    storyFetcher?: NewsFetcher;
    nowMs?: number;
  },
): Promise<LeagueNewsArticleSummary | null> {
  if (!/^\d{1,20}$/.test(articleId)) return null;

  const nowMs = options?.nowMs ?? Date.now();
  const store = getCacheStore();
  const cacheKey = `${league}:${articleId}`;
  const cachedSummary = store.summaries.get(cacheKey);
  if (cachedSummary && nowMs - cachedSummary.fetchedAtMs < NEWS_CACHE_TTL_MS) {
    return cachedSummary.summary;
  }

  let entry: LeagueCacheEntry | null | undefined = store.entries.get(league);
  if (!entry || !entry.articlesById.has(articleId)) {
    entry = await loadOrRefreshFeed(league, options?.feedFetcher, nowMs);
  }
  const baseArticle = entry?.articlesById.get(articleId);
  if (!baseArticle) return null;

  const storyUrl = `https://now.core.api.espn.com/v1/sports/news/${encodeURIComponent(articleId)}?lang=es&region=mx`;
  let storyHtml = "";
  let storyDescription = baseArticle.description;
  let storyHeadline = baseArticle.headline;
  let storyCaption = baseArticle.imageCaption ?? "";
  let storyByline = baseArticle.byline;
  const tagPool = [...baseArticle.teamTags, ...baseArticle.athleteTags];

  try {
    const fetcher = options?.storyFetcher ?? defaultFetcher;
    const rawPayload = await fetcher(storyUrl);
    if (isRecord(rawPayload)) {
      const container = Array.isArray(rawPayload.headlines)
        ? (rawPayload.headlines[0] as unknown)
        : Array.isArray(rawPayload.articles)
          ? (rawPayload.articles[0] as unknown)
          : rawPayload;
      if (isRecord(container)) {
        const hl = asString(container.headline);
        if (hl) storyHeadline = sanitizeHeadline(hl);
        const desc = asString(container.description);
        if (desc) storyDescription = sanitizeDescription(desc);
        const by = asString(container.byline);
        if (by) {
          const cleanBy = sanitizeHeadline(by);
          if (cleanBy) storyByline = cleanBy;
        }
        const storyStr = asString(container.story);
        if (storyStr) storyHtml = storyStr;
        if (Array.isArray(container.images) && isRecord(container.images[0])) {
          const cap = asString(container.images[0].caption);
          if (cap) {
            storyCaption = sanitizeDescription(cap.replace(/<[^>]+>/g, " "));
          }
        }
        if (Array.isArray(container.categories)) {
          for (const c of container.categories) {
            if (
              isRecord(c) &&
              (c.type === "team" || c.type === "athlete") &&
              typeof c.description === "string" &&
              c.description.trim()
            ) {
              tagPool.push(c.description.trim());
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[espn-news] no se pudo ampliar resumen ${league}/${articleId}:`, err);
  }

  const lead =
    storyDescription ||
    storyCaption ||
    "Resumen de la jornada y contexto de los protagonistas.";
  const paragraphs = extractSummaryParagraphsFromStoryHtml(storyHtml, lead);
  if (paragraphs.length === 0 && storyCaption && normalize(storyCaption) !== normalize(lead)) {
    paragraphs.push(storyCaption);
  }

  const { categoryLabel } = classifyEspnArticle(baseArticle);
  const keyPoints = [...new Set(tagPool)]
    .map(sanitizeHeadline)
    .filter((tag) => tag.length > 0 && !FORBIDDEN_COPY_RE.test(tag))
    .slice(0, 5);

  const summary: LeagueNewsArticleSummary = {
    id: articleId,
    title: storyHeadline,
    lead,
    paragraphs,
    keyPoints,
    publishedAtLabel: formatNewsDateEs(baseArticle.publishedIso),
    ...(storyByline ? { byline: storyByline } : {}),
    categoryLabel,
  };

  store.summaries.set(cacheKey, { fetchedAtMs: nowMs, summary });
  return summary;
}

/**
 * Resuelve en el servidor el URL real de una nota verificada de la caché/API de noticias.
 */
export async function resolveVerifiedNewsArticleUrl(
  league: ProductLeague,
  articleId: string,
  fetcher?: NewsFetcher,
): Promise<string | null> {
  if (!/^\d{1,20}$/.test(articleId)) return null;
  const store = getCacheStore();
  let entry: LeagueCacheEntry | null | undefined = store.entries.get(league);
  if (!entry || !entry.urlsById.has(articleId)) {
    entry = await loadOrRefreshFeed(league, fetcher);
  }
  const url = entry?.urlsById.get(articleId);
  return isValidEspnArticleUrl(url) ? url : null;
}

/** Utilidad para limpiar caché en pruebas unitarias. */
export function clearEspnNewsCacheForTest(): void {
  const store = getCacheStore();
  store.entries.clear();
  store.inflight.clear();
  store.summaries.clear();
}
