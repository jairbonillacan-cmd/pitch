import React from "react";
import type { Metadata } from "next";
import { BlogIndexSurface } from "@pitchlab/ui/blog";
import {
  blogCategoryLinks,
  buildBlogJsonLd,
  getPublishedPosts,
  toPostSummaryView,
} from "../../src/server/blog";
import { JsonLd } from "../../src/server/json-ld";
import { getSiteUrl } from "../../src/server/site-url";

export const revalidate = 300;

const TITLE = "Blog · PitchLab";
const DESCRIPTION =
  "Guías para leer momios, calcular la probabilidad de un parlay y apostar con límites claros. Probabilidad deportiva explicada en claro.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: "/blog",
    types: { "application/rss+xml": [{ url: "/blog/rss.xml", title: "Blog de PitchLab" }] },
  },
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: "PitchLab",
    url: "/blog",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default async function BlogIndexPage(): Promise<React.JSX.Element> {
  const posts = await getPublishedPosts();
  return (
    <>
      <JsonLd data={buildBlogJsonLd(posts, getSiteUrl())} />
      <BlogIndexSurface
        posts={posts.map(toPostSummaryView)}
        categories={blogCategoryLinks()}
      />
    </>
  );
}
