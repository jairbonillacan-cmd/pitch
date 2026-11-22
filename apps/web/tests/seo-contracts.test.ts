import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GET as getBlogRss } from "../app/blog/rss.xml/route";
import { metadata as rootMetadata } from "../app/layout";
import { metadata as offlineMetadata } from "../app/offline/layout";
import { metadata as homeMetadata } from "../app/page";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import {
  buildHomePageJsonLd,
  buildPricingPageJsonLd,
  isCleanPublicCanonicalPath,
  JsonLd,
} from "../src/server/json-ld";

vi.mock("../app/precio-motion.css", () => ({}));
vi.mock("../app/account-v2.css", () => ({}));
vi.mock("../app/login-motion.css", () => ({}));
vi.mock("../app/editorial-verificacion.css", () => ({}));
vi.mock("../app/record-v2.css", () => ({}));

const NEW_BLOG_SLUGS = [
  "clv-como-medir-si-le-ganas-al-cierre",
  "parlays-y-correlacion-mismo-partido-sgp",
  "como-leer-xg-y-calibracion-sin-caer-en-trampas",
] as const;

describe("SEO técnico, sitemap, robots, JSON-LD y RSS", () => {
  it("sitemap incluye todas las rutas públicas + 3 artículos nuevos y excluye rutas privadas u obsoletas", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    const paths = urls.map((u) => new URL(u).pathname);

    for (const required of [
      "/",
      "/precio",
      "/resultados",
      "/verificacion",
      "/motores",
      "/blog",
      "/legal/terminos",
      "/legal/privacidad",
      "/legal/juego-responsable",
      "/legal/creditos",
      ...NEW_BLOG_SLUGS.map((slug) => `/blog/${slug}`),
    ]) {
      expect(paths).toContain(required);
    }

    for (const p of paths) {
      expect(isCleanPublicCanonicalPath(p)).toBe(true);
      expect(p).not.toMatch(
        /^\/(?:app|api|i|p|login|signup|onboarding|baja|canjear|offline|pricing|plans|estadisticas|partidos)\b/,
      );
    }
  });

  it("robots bloquea zonas privadas o de sesión y expone sitemap.xml", () => {
    const cfg = robots();
    const rules = Array.isArray(cfg.rules) ? cfg.rules[0] : cfg.rules;
    const disallow = Array.isArray(rules?.disallow) ? rules.disallow : [];
    for (const blocked of ["/app/", "/api/", "/i/", "/onboarding", "/p/", "/baja", "/canjear"]) {
      expect(disallow).toContain(blocked);
    }
    expect(cfg.sitemap).toMatch(/\/sitemap\.xml$/);
  });

  it("JSON-LD de portada y precio escapa HTML peligroso y evita términos heredados o FD-16", () => {
    const homeNodes = buildHomePageJsonLd("https://pitchlab.mx");
    expect(homeNodes.map((n) => n["@type"])).toEqual(["Organization", "WebSite"]);

    const pricingNodes = buildPricingPageJsonLd("https://pitchlab.mx", {
      name: "Pase PitchLab Ultra",
      monthlyMxn: 299,
      annualMxn: 2390,
    });
    const markup = renderToStaticMarkup(
      React.createElement(JsonLd, {
        data: [
          ...homeNodes,
          ...pricingNodes,
          { "@type": "Thing", name: "</script><script>alert(1)</script>" },
        ],
      }),
    );
    expect(markup).not.toContain("</script><script>");
    expect(markup).toContain("\\u003c/script>");
    expect(markup).toContain("récord verificable");
    expect(markup).not.toMatch(/bit[aá]cora/i);
  });

  it("metadatos públicos declaran canonical/openGraph y rutas de sesión declaran noindex", async () => {
    expect(homeMetadata.alternates?.canonical).toBe("/");
    expect(homeMetadata.openGraph).toBeDefined();
    expect(rootMetadata.openGraph).toBeDefined();
    expect(String(rootMetadata.description ?? "")).not.toMatch(/bit[aá]cora/i);
    expect(offlineMetadata.robots).toMatchObject({ index: false, follow: false });

    const { metadata: loginMeta } = await import("../app/login/page");
    const { metadata: signupMeta } = await import("../app/signup/page");
    const { metadata: precioMeta } = await import("../app/precio/page");
    const { metadata: resultadosMeta } = await import("../app/resultados/page");
    const { metadata: motoresMeta } = await import("../app/motores/page");
    const { metadata: verifMeta } = await import("../app/verificacion/page");
    const { metadata: blogMeta } = await import("../app/blog/page");

    expect(loginMeta.robots).toMatchObject({ index: false, follow: false });
    expect(signupMeta.robots).toMatchObject({ index: false, follow: false });
    expect(precioMeta.alternates?.canonical).toBe("/precio");
    expect(resultadosMeta.alternates?.canonical).toBe("/resultados");
    expect(motoresMeta.alternates?.canonical).toBe("/motores");
    expect(verifMeta.alternates?.canonical).toBe("/verificacion");
    expect(blogMeta.alternates?.canonical).toBe("/blog");
  });

  it("RSS del blog incluye los 3 artículos técnicos nuevos con Content-Type XML válido", async () => {
    const response = await getBlogRss();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/rss+xml");
    const xml = await response.text();
    for (const slug of NEW_BLOG_SLUGS) {
      expect(xml).toContain(`/blog/${slug}`);
    }
  });
});
