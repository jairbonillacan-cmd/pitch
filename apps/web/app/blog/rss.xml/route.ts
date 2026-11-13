import { buildBlogRssXml, getPublishedPosts } from "../../../src/server/blog";
import { getSiteUrl } from "../../../src/server/site-url";

// Se regenera cada hora para que los artículos programados aparezcan sin un deploy nuevo.
export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const posts = await getPublishedPosts();
  return new Response(buildBlogRssXml(posts, getSiteUrl()), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
