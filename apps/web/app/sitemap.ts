import type { MetadataRoute } from "next";
import {
  BLOG_CATEGORIES,
  blogCategoryPath,
  blogDateToIso,
  blogPostPath,
  getPublishedPosts,
  type BlogPost,
} from "../src/server/blog";
import { sanitizeCanonicalPublicUrl } from "../src/server/json-ld";
import { getSiteUrl } from "../src/server/site-url";

// Se regenera cada hora para que los artículos programados entren sin un deploy nuevo.
export const revalidate = 3600;

/** Páginas públicas indexables (`docs/architecture/ROUTE_MAP.md` §2). */
const PUBLIC_PATHS = [
  "/",
  "/resultados",
  "/motores",
  "/precio",
  "/legal/privacidad",
  "/legal/terminos",
  "/legal/juego-responsable",
  "/legal/creditos",
] as const;

function latestModifiedIso(posts: readonly BlogPost[]): string | undefined {
  let latest: string | null = null;
  for (const post of posts) {
    const stamp = post.updated ?? post.date;
    if (!latest || stamp > latest) {
      latest = stamp;
    }
  }
  return latest ? blogDateToIso(latest) : undefined;
}

function buildCleanEntry(
  path: string,
  baseUrl: string,
  meta: Omit<MetadataRoute.Sitemap[number], "url">,
): MetadataRoute.Sitemap[number] | null {
  const url = sanitizeCanonicalPublicUrl(path, baseUrl);
  if (!url) return null;
  return { url, ...meta };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();
  const posts = await getPublishedPosts();

  const candidates: Array<MetadataRoute.Sitemap[number] | null> = [
    ...PUBLIC_PATHS.map((path) =>
      buildCleanEntry(path, baseUrl, {
        changeFrequency: path.startsWith("/legal/") ? "monthly" : "daily",
        priority: path === "/" ? 1 : path.startsWith("/legal/") ? 0.3 : 0.8,
      }),
    ),
    buildCleanEntry("/blog", baseUrl, {
      lastModified: latestModifiedIso(posts),
      changeFrequency: "weekly",
      priority: 0.7,
    }),
    // Solo categorías con al menos un artículo publicado (las vacías llevan noindex).
    ...BLOG_CATEGORIES.flatMap((category) => {
      const inCategory = posts.filter((p) => p.category.slug === category.slug);
      if (inCategory.length === 0) return [];
      return [
        buildCleanEntry(blogCategoryPath(category.slug), baseUrl, {
          lastModified: latestModifiedIso(inCategory),
          changeFrequency: "weekly" as const,
          priority: 0.5,
        }),
      ];
    }),
    ...posts.map((post) =>
      buildCleanEntry(blogPostPath(post.slug), baseUrl, {
        lastModified: blogDateToIso(post.updated ?? post.date),
        changeFrequency: "monthly",
        priority: 0.6,
      }),
    ),
  ];

  // Deduplica y descarta cualquier ruta que no pase el filtro canónico anti-fuga FD-16.
  const seen = new Set<string>();
  const entries: MetadataRoute.Sitemap = [];
  for (const entry of candidates) {
    if (!entry || seen.has(entry.url)) continue;
    seen.add(entry.url);
    entries.push(entry);
  }

  return entries;
}
