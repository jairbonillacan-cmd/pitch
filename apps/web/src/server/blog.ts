import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Marked } from "marked";
import type { BlogCategoryLink, BlogPostSummaryView, BlogPostView } from "@pitchlab/ui";

/**
 * Blog público de PitchLab (`/blog`).
 *
 * Los artículos viven en `apps/web/content/blog/<slug>.md` con un encabezado (frontmatter) entre `---`.
 * Este módulo los lee, valida el encabezado, convierte el Markdown a HTML y arma los datos de SEO
 * (JSON-LD, RSS y sitemap). La guía para escribir un artículo está en `docs/content/BLOG.md`.
 */

export const BLOG_CATEGORIES = [
  {
    slug: "momios",
    label: "Momios y probabilidad",
    description:
      "Cómo leer un momio, convertirlo en probabilidad y saber cuándo un precio está por debajo de lo justo.",
  },
  {
    slug: "parlays",
    label: "Parlays",
    description:
      "Cómo se calcula una combinada, por qué la probabilidad cae tan rápido y qué selecciones no deben ir juntas.",
  },
  {
    slug: "juego-responsable",
    label: "Juego responsable",
    description:
      "Hábitos, límites y señales de alerta para que el análisis deportivo siga siendo un pasatiempo.",
  },
  {
    slug: "guias",
    label: "Guías de PitchLab",
    description: "Cómo sacarle provecho a cada pantalla de PitchLab, paso a paso.",
  },
] as const;

export type BlogCategorySlug = (typeof BLOG_CATEGORIES)[number]["slug"];
export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

export interface BlogTocItem {
  id: string;
  text: string;
}

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  /** Fecha de publicación `YYYY-MM-DD` (día calendario en la Ciudad de México). */
  date: string;
  /** Última revisión de fondo `YYYY-MM-DD`, si la hubo. */
  updated: string | null;
  category: BlogCategory;
  tags: string[];
  author: string;
  draft: boolean;
  readingMinutes: number;
  html: string;
  toc: BlogTocItem[];
}

export const BLOG_DEFAULT_AUTHOR = "Equipo PitchLab";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WORDS_PER_MINUTE = 200;
const BLOG_TIME_ZONE = "America/Mexico_City";

type FrontmatterValue = string | boolean | string[];

/* ------------------------------------------------------------------ */
/* Encabezado (frontmatter)                                            */
/* ------------------------------------------------------------------ */

function unquote(raw: string): string {
  const v = raw.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  return v;
}

function parseScalar(raw: string): FrontmatterValue {
  const v = raw.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    return inner ? inner.split(",").map((item) => unquote(item)).filter(Boolean) : [];
  }
  return unquote(v);
}

/**
 * Lee el encabezado `---` de un archivo Markdown. Acepta el subconjunto de YAML que usa el blog:
 * `clave: valor`, cadenas con o sin comillas, `true`/`false`, listas `[a, b]` y listas con guiones.
 */
export function parseFrontmatter(source: string): { data: Record<string, FrontmatterValue>; body: string } {
  const text = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) {
    throw new Error("Falta el encabezado `---` al inicio del archivo.");
  }

  const data: Record<string, FrontmatterValue> = {};
  let listKey: string | null = null;

  for (const line of match[1]!.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const listItem = /^\s+-\s+(.*)$/.exec(line);
    if (listItem && listKey) {
      const current = data[listKey];
      const list = Array.isArray(current) ? current : [];
      list.push(unquote(listItem[1]!));
      data[listKey] = list;
      continue;
    }

    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) {
      throw new Error(`Línea no válida en el encabezado: «${line.trim()}».`);
    }
    const [, key, rawValue] = pair;
    if (rawValue!.trim() === "") {
      data[key!] = [];
      listKey = key!;
    } else {
      data[key!] = parseScalar(rawValue!);
      listKey = null;
    }
  }

  return { data, body: text.slice(match[0].length) };
}

function isValidCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function requireString(data: Record<string, FrontmatterValue>, key: string): string {
  const value = data[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`El campo «${key}» es obligatorio y debe ser texto.`);
  }
  return value.trim();
}

/* ------------------------------------------------------------------ */
/* Markdown → HTML                                                     */
/* ------------------------------------------------------------------ */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** `Momio justo (sin margen)` → `momio-justo-sin-margen`. */
export function slugifyHeading(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&[a-z]+;|&#\d+;/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-");
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function isSafeHref(href: string): boolean {
  return /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href);
}

/**
 * Convierte el cuerpo del artículo a HTML.
 * - Los `#` y `##` se publican como `<h2>` (el `<h1>` es el título del artículo) y alimentan el índice.
 * - El HTML crudo se escapa: el contenido es Markdown puro.
 * - Las tablas quedan dentro de una región desplazable y enfocable para pantallas angostas.
 */
export function renderBlogMarkdown(body: string): { html: string; toc: BlogTocItem[] } {
  const toc: BlogTocItem[] = [];
  const usedIds = new Map<string, number>();

  const uniqueId = (base: string): string => {
    const seed = base || "seccion";
    const seen = usedIds.get(seed) ?? 0;
    usedIds.set(seed, seen + 1);
    return seen === 0 ? seed : `${seed}-${seen + 1}`;
  };

  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens);
        const level = Math.min(Math.max(depth, 2), 4);
        const plain = stripTags(inner).trim();
        const id = uniqueId(slugifyHeading(plain));
        if (level === 2) toc.push({ id, text: plain });
        return `<h${level} id="${id}">${inner}</h${level}>\n`;
      },
      html({ text }) {
        return escapeHtml(text);
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        if (!isSafeHref(href)) return inner;
        const external = /^https?:\/\//i.test(href) && !/^https?:\/\/(www\.)?pitchlab\.mx(\/|$)/i.test(href);
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
        const relAttr = external ? ' rel="noopener noreferrer"' : "";
        return `<a href="${escapeHtml(href)}"${titleAttr}${relAttr}>${inner}</a>`;
      },
      image({ href, title, text }) {
        if (!isSafeHref(href)) return escapeHtml(text);
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
        return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"${titleAttr} loading="lazy" decoding="async">`;
      },
    },
  });

  const rendered = marked.parse(body, { async: false });
  const html = rendered
    .replace(/<table>/g, '<div class="pl-blog-table" role="region" tabindex="0" aria-label="Tabla desplazable"><table>')
    .replace(/<\/table>/g, "</table></div>");

  return { html, toc };
}

export function estimateReadingMinutes(body: string): number {
  const words = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`|[\]()-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/* ------------------------------------------------------------------ */
/* Carga                                                               */
/* ------------------------------------------------------------------ */

/** Construye un artículo a partir del texto del archivo. Lanza un error claro si algo no cuadra. */
export function parseBlogPost(slug: string, source: string): BlogPost {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`El nombre del archivo «${slug}» debe ir en minúsculas, sin acentos y con guiones.`);
  }
  const { data, body } = parseFrontmatter(source);

  const title = requireString(data, "title");
  const description = requireString(data, "description");
  const date = requireString(data, "date");
  if (!isValidCalendarDate(date)) {
    throw new Error(`«date» debe tener el formato AAAA-MM-DD (recibido: «${date}»).`);
  }

  const updatedRaw = data.updated;
  let updated: string | null = null;
  if (updatedRaw !== undefined) {
    if (typeof updatedRaw !== "string" || !isValidCalendarDate(updatedRaw)) {
      throw new Error("«updated» debe tener el formato AAAA-MM-DD.");
    }
    if (updatedRaw < date) {
      throw new Error("«updated» no puede ser anterior a «date».");
    }
    updated = updatedRaw === date ? null : updatedRaw;
  }

  const categorySlug = requireString(data, "category");
  const category = BLOG_CATEGORIES.find((c) => c.slug === categorySlug);
  if (!category) {
    throw new Error(
      `La categoría «${categorySlug}» no existe. Usa una de: ${BLOG_CATEGORIES.map((c) => c.slug).join(", ")}.`,
    );
  }

  const tagsRaw = data.tags ?? [];
  if (!Array.isArray(tagsRaw)) {
    throw new Error("«tags» debe ser una lista, por ejemplo: [momios, probabilidad].");
  }

  const authorRaw = data.author;
  const author = typeof authorRaw === "string" && authorRaw.trim() ? authorRaw.trim() : BLOG_DEFAULT_AUTHOR;

  const draftRaw = data.draft ?? false;
  if (typeof draftRaw !== "boolean") {
    throw new Error("«draft» debe ser true o false.");
  }

  if (!body.trim()) {
    throw new Error("El artículo no tiene contenido.");
  }

  const { html, toc } = renderBlogMarkdown(body);

  return {
    slug,
    title,
    description,
    date,
    updated,
    category,
    tags: tagsRaw.map((t) => t.trim()).filter(Boolean),
    author,
    draft: draftRaw,
    readingMinutes: estimateReadingMinutes(body),
    html,
    toc,
  };
}

export function blogContentDir(): string {
  return path.join(process.cwd(), "content", "blog");
}

/** Lee y valida todos los archivos `.md` de una carpeta (incluye borradores y programados). */
export async function readBlogDirectory(dir: string = blogContentDir()): Promise<BlogPost[]> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const posts = await Promise.all(
    files
      .filter((file) => file.endsWith(".md") && !file.startsWith("_"))
      .map(async (file) => {
        const slug = file.slice(0, -3);
        const source = await readFile(path.join(dir, file), "utf8");
        try {
          return parseBlogPost(slug, source);
        } catch (err) {
          throw new Error(`content/blog/${file}: ${(err as Error).message}`);
        }
      }),
  );

  return posts.sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title, "es") : b.date.localeCompare(a.date)));
}

let cachedPosts: Promise<BlogPost[]> | null = null;

/** En producción los archivos no cambian entre deploys: se leen una vez por proceso. */
async function allPosts(): Promise<BlogPost[]> {
  if (process.env.NODE_ENV !== "production") return readBlogDirectory();
  cachedPosts ??= readBlogDirectory().catch((err: unknown) => {
    cachedPosts = null;
    throw err;
  });
  return cachedPosts;
}

/** Hoy (`YYYY-MM-DD`) en la Ciudad de México. */
export function blogToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BLOG_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Publicado = no es borrador y su fecha ya llegó (las fechas futuras funcionan como programación). */
export function isPublished(post: BlogPost, today: string = blogToday()): boolean {
  return !post.draft && post.date <= today;
}

export async function getPublishedPosts(): Promise<BlogPost[]> {
  const today = blogToday();
  return (await allPosts()).filter((post) => isPublished(post, today));
}

/**
 * Busca un artículo por slug. Los borradores y programados solo se pueden previsualizar fuera de
 * producción (`isPreview: true`, la página los marca `noindex`).
 */
export async function getPostBySlug(slug: string): Promise<{ post: BlogPost; isPreview: boolean } | null> {
  if (!SLUG_RE.test(slug)) return null;
  const post = (await allPosts()).find((p) => p.slug === slug);
  if (!post) return null;
  if (isPublished(post)) return { post, isPreview: false };
  if (process.env.NODE_ENV !== "production") return { post, isPreview: true };
  return null;
}

export function getBlogCategory(slug: string): BlogCategory | null {
  return BLOG_CATEGORIES.find((c) => c.slug === slug) ?? null;
}

/** Relacionados: misma categoría primero, luego etiquetas en común, luego lo más reciente. */
export function pickRelatedPosts(post: BlogPost, pool: readonly BlogPost[], limit = 3): BlogPost[] {
  const tags = new Set(post.tags.map((t) => t.toLowerCase()));
  return pool
    .filter((p) => p.slug !== post.slug)
    .map((p) => ({
      p,
      score:
        (p.category.slug === post.category.slug ? 10 : 0) +
        p.tags.filter((t) => tags.has(t.toLowerCase())).length,
    }))
    .sort((a, b) => b.score - a.score || b.p.date.localeCompare(a.p.date))
    .slice(0, limit)
    .map(({ p }) => p);
}

/* ------------------------------------------------------------------ */
/* Presentación y SEO                                                  */
/* ------------------------------------------------------------------ */

/** `2026-11-12` → `12 de noviembre de 2026` (día calendario, sin corrimiento por zona horaria). */
export function formatBlogDate(date: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** Fecha con hora a mediodía en la Ciudad de México, para JSON-LD, Open Graph y RSS. */
export function blogDateToIso(date: string): string {
  return `${date}T12:00:00-06:00`;
}

export function blogPostPath(slug: string): string {
  return `/blog/${slug}`;
}

export function blogCategoryPath(slug: string): string {
  return `/blog/categoria/${slug}`;
}

export function toPostSummaryView(post: BlogPost): BlogPostSummaryView {
  return {
    slug: post.slug,
    href: blogPostPath(post.slug),
    title: post.title,
    description: post.description,
    category: { slug: post.category.slug, label: post.category.label, href: blogCategoryPath(post.category.slug) },
    date: post.date,
    dateLabel: formatBlogDate(post.date),
    readingMinutes: post.readingMinutes,
  };
}

export function toPostView(post: BlogPost): BlogPostView {
  return {
    ...toPostSummaryView(post),
    author: post.author,
    updated: post.updated,
    updatedLabel: post.updated ? formatBlogDate(post.updated) : null,
    tags: post.tags,
    html: post.html,
    toc: post.toc,
  };
}

export function blogCategoryLinks(): BlogCategoryLink[] {
  return BLOG_CATEGORIES.map((c) => ({ slug: c.slug, label: c.label, href: blogCategoryPath(c.slug) }));
}

export function buildBlogPostingJsonLd(post: BlogPost, siteUrl: string): Record<string, unknown> {
  const url = `${siteUrl}${blogPostPath(post.slug)}`;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    image: `${url}/opengraph-image`,
    datePublished: blogDateToIso(post.date),
    dateModified: blogDateToIso(post.updated ?? post.date),
    inLanguage: "es-MX",
    articleSection: post.category.label,
    keywords: post.tags.join(", "),
    author:
      post.author === BLOG_DEFAULT_AUTHOR
        ? { "@type": "Organization", name: "PitchLab", url: siteUrl }
        : { "@type": "Person", name: post.author },
    publisher: {
      "@type": "Organization",
      name: "PitchLab",
      url: siteUrl,
      logo: { "@type": "ImageObject", url: `${siteUrl}/brand/app-icons/favicon.svg` },
    },
  };
}

export function buildBreadcrumbJsonLd(
  items: ReadonlyArray<{ name: string; path: string }>,
  siteUrl: string,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${siteUrl}${item.path}`,
    })),
  };
}

export function buildBlogJsonLd(posts: readonly BlogPost[], siteUrl: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Blog de PitchLab",
    url: `${siteUrl}/blog`,
    inLanguage: "es-MX",
    publisher: { "@type": "Organization", name: "PitchLab", url: siteUrl },
    blogPost: posts.slice(0, 20).map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      url: `${siteUrl}${blogPostPath(post.slug)}`,
      datePublished: blogDateToIso(post.date),
    })),
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildBlogRssXml(posts: readonly BlogPost[], siteUrl: string): string {
  const items = posts
    .slice(0, 50)
    .map((post) => {
      const url = `${siteUrl}${blogPostPath(post.slug)}`;
      return [
        "    <item>",
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        `      <description>${escapeXml(post.description)}</description>`,
        `      <category>${escapeXml(post.category.label)}</category>`,
        `      <pubDate>${new Date(blogDateToIso(post.date)).toUTCString()}</pubDate>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const lastBuild = posts[0] ? new Date(blogDateToIso(posts[0].updated ?? posts[0].date)).toUTCString() : new Date().toUTCString();

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    "    <title>Blog de PitchLab</title>",
    `    <link>${siteUrl}/blog</link>`,
    "    <description>Probabilidad, momios, parlays y juego responsable, explicados en claro.</description>",
    "    <language>es-MX</language>",
    `    <lastBuildDate>${lastBuild}</lastBuildDate>`,
    `    <atom:link href="${siteUrl}/blog/rss.xml" rel="self" type="application/rss+xml"/>`,
    items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
