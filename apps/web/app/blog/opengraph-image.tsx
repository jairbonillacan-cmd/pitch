import { BLOG_OG_SIZE, renderBlogOgImage } from "../../src/server/blog-og";

export const alt = "Blog de PitchLab: probabilidad deportiva, explicada en claro";
export const size = BLOG_OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderBlogOgImage({ eyebrow: "Blog", title: "Probabilidad deportiva, explicada en claro." });
}
