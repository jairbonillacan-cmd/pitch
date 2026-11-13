import { getBlogCategory } from "../../../../src/server/blog";
import { BLOG_OG_SIZE, renderBlogOgImage } from "../../../../src/server/blog-og";

export const alt = "Categoría del blog de PitchLab";
export const size = BLOG_OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ categoria: string }> }) {
  const { categoria } = await params;
  const category = getBlogCategory(categoria);
  return renderBlogOgImage({
    eyebrow: "Blog",
    title: category ? category.label : "Probabilidad deportiva, explicada en claro.",
  });
}
