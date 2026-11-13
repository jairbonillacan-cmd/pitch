import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.BETTER_AUTH_URL ?? "https://pitchlab.mx").replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/api/", "/i/", "/onboarding", "/p/", "/baja", "/canjear"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
