import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogIndexSurface } from "@pitchlab/ui";
import {
  blogCategoryLinks,
  blogCategoryPath,
  buildBreadcrumbJsonLd,
  getBlogCategory,
  getPublishedPosts,
  toPostSummaryView,
} from "../../../../src/server/blog";
import { JsonLd } from "../../../../src/server/json-ld";
import { hasPublicSessionCookie } from "../../../../src/server/public-session";
import { getSiteUrl } from "../../../../src/server/site-url";

export const dynamic = "force-dynamic";

type Params = Promise<{ categoria: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { categoria } = await params;
  const category = getBlogCategory(categoria);
  if (!category) return { title: "Categoría no encontrada · PitchLab", robots: { index: false } };

  const posts = (await getPublishedPosts()).filter((p) => p.category.slug === category.slug);
  const path = blogCategoryPath(category.slug);
  const title = `${category.label} · Blog de PitchLab`;
  return {
    title,
    description: category.description,
    alternates: { canonical: path },
    // Una categoría sin artículos no aporta nada al buscador: se muestra, pero no se indexa.
    robots: posts.length === 0 ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "website",
      locale: "es_MX",
      siteName: "PitchLab",
      url: path,
      title,
      description: category.description,
    },
    twitter: { card: "summary_large_image", title, description: category.description },
  };
}

export default async function BlogCategoryPage({ params }: { params: Params }): Promise<React.JSX.Element> {
  const { categoria } = await params;
  const category = getBlogCategory(categoria);
  if (!category) notFound();

  const [posts, hasSession] = await Promise.all([getPublishedPosts(), hasPublicSessionCookie()]);
  const inCategory = posts.filter((p) => p.category.slug === category.slug);
  const path = blogCategoryPath(category.slug);

  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd(
          [
            { name: "Blog", path: "/blog" },
            { name: category.label, path },
          ],
          getSiteUrl(),
        )}
      />
      <BlogIndexSurface
        posts={inCategory.map(toPostSummaryView)}
        categories={blogCategoryLinks()}
        activeCategory={{ slug: category.slug, label: category.label, href: path, description: category.description }}
        hasSession={hasSession}
      />
    </>
  );
}
