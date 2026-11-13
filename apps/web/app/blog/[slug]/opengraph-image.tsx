import { getPostBySlug } from "../../../src/server/blog";
import { BLOG_OG_SIZE, renderBlogOgImage } from "../../../src/server/blog-og";

export const alt = "Artículo del blog de PitchLab";
export const size = BLOG_OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await getPostBySlug(slug);
  if (!found) {
    return renderBlogOgImage({ eyebrow: "Blog", title: "Probabilidad deportiva, explicada en claro." });
  }
  return renderBlogOgImage({ eyebrow: found.post.category.label, title: found.post.title });
}
