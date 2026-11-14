import type { MetadataRoute } from "next";
import { BLOG_CATEGORIES, blogCategoryPath, blogPostPath, getPublishedPosts } from "../src/server/blog";
import { getSiteUrl } from "../src/server/site-url";

// Se regenera cada hora para que los artículos programados entren sin un deploy nuevo.
export const revalidate = 3600;

/** Páginas públicas indexables (`docs/architecture/ROUTE_MAP.md` §2). */
const PUBLIC_PATHS = [
  "",
  "/como-funciona",
  "/parlays",
  "/resultados",
  "/motores",
  "/precio",
  "/comunidad",
  "/legal/privacidad",
  "/legal/terminos",
  "/legal/juego-responsable",
  "/legal/creditos",
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();
  const posts = await getPublishedPosts();

  const pages: MetadataRoute.Sitemap = PUBLIC_PATHS.map((path) => ({
    url: `${baseUrl}${path || "/"}`,
    changeFrequency: path.startsWith("/legal/") ? "monthly" : "daily",
    priority: path === "" ? 1 : path.startsWith("/legal/") ? 0.3 : 0.8,
  }));

  const latest = posts[0];
  const blogIndex: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/blog`,
      lastModified: latest ? (latest.updated ?? latest.date) : undefined,
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];

  // Solo categorías con al menos un artículo publicado (las vacías llevan noindex).
  const categories: MetadataRoute.Sitemap = BLOG_CATEGORIES.flatMap((category) => {
    const newest = posts.find((p) => p.category.slug === category.slug);
    if (!newest) return [];
    return [
      {
        url: `${baseUrl}${blogCategoryPath(category.slug)}`,
        lastModified: newest.updated ?? newest.date,
        changeFrequency: "weekly" as const,
        priority: 0.5,
      },
    ];
  });

  const articles: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${baseUrl}${blogPostPath(post.slug)}`,
    lastModified: post.updated ?? post.date,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...pages, ...blogIndex, ...categories, ...articles];
}
