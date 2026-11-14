import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogPostSurface } from "@pitchlab/ui";
import {
  blogDateToIso,
  blogPostPath,
  buildBlogPostingJsonLd,
  buildBreadcrumbJsonLd,
  blogCategoryPath,
  getPostBySlug,
  getPublishedPosts,
  pickRelatedPosts,
  toPostSummaryView,
  toPostView,
} from "../../../src/server/blog";
import { JsonLd } from "../../../src/server/json-ld";
import { hasPublicSessionCookie } from "../../../src/server/public-session";
import { getSiteUrl } from "../../../src/server/site-url";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const found = await getPostBySlug(slug);
  if (!found) return { title: "Artículo no encontrado · PitchLab", robots: { index: false } };

  const { post, isPreview } = found;
  const path = blogPostPath(post.slug);
  return {
    title: `${post.title} · PitchLab`,
    description: post.description,
    keywords: post.tags,
    authors: [{ name: post.author }],
    alternates: {
      canonical: path,
      types: { "application/rss+xml": [{ url: "/blog/rss.xml", title: "Blog de PitchLab" }] },
    },
    robots: isPreview ? { index: false, follow: false } : undefined,
    openGraph: {
      type: "article",
      locale: "es_MX",
      siteName: "PitchLab",
      url: path,
      title: post.title,
      description: post.description,
      publishedTime: blogDateToIso(post.date),
      modifiedTime: blogDateToIso(post.updated ?? post.date),
      section: post.category.label,
      tags: post.tags,
      authors: [post.author],
    },
    twitter: { card: "summary_large_image", title: post.title, description: post.description },
  };
}

export default async function BlogPostPage({ params }: { params: Params }): Promise<React.JSX.Element> {
  const { slug } = await params;
  const [found, published, hasSession] = await Promise.all([
    getPostBySlug(slug),
    getPublishedPosts(),
    hasPublicSessionCookie(),
  ]);
  if (!found) notFound();

  const { post, isPreview } = found;
  const siteUrl = getSiteUrl();

  return (
    <>
      <JsonLd
        data={[
          buildBlogPostingJsonLd(post, siteUrl),
          buildBreadcrumbJsonLd(
            [
              { name: "Blog", path: "/blog" },
              { name: post.category.label, path: blogCategoryPath(post.category.slug) },
              { name: post.title, path: blogPostPath(post.slug) },
            ],
            siteUrl,
          ),
        ]}
      />
      <BlogPostSurface
        post={toPostView(post)}
        related={pickRelatedPosts(post, published).map(toPostSummaryView)}
        isPreview={isPreview}
        hasSession={hasSession}
      />
    </>
  );
}
