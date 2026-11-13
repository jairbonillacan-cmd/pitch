import type { MetadataRoute } from "next";
import { getSiteUrl } from "../src/server/site-url";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getSiteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/api/", "/i/", "/onboarding", "/p/", "/baja", "/canjear"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
