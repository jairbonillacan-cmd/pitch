import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GET as getBlogRss } from "../app/blog/rss.xml/route";
import { metadata as rootMetadata } from "../app/layout";
import { metadata as offlineMetadata } from "../app/offline/layout";
import { default as HomeOpenGraphImage, size as homeOgSize } from "../app/opengraph-image";
import {
  default as PublicPickOpenGraphImage,
  size as pickOgSize,
} from "../app/p/[pickId]/opengraph-image";
import { metadata as homeMetadata } from "../app/page";
import { default as PrecioOpenGraphImage, size as precioOgSize } from "../app/precio/opengraph-image";
import {
  default as ResultadosOpenGraphImage,
  size as resultadosOgSize,
} from "../app/resultados/opengraph-image";
import {
  default as VerificacionOpenGraphImage,
  size as verificacionOgSize,
} from "../app/verificacion/opengraph-image";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import {
  buildHomePageJsonLd,
  buildPricingPageJsonLd,
  isCleanPublicCanonicalPath,
  JsonLd,
} from "../src/server/json-ld";
import { buildServerRawPlatformDataset } from "../src/server/platform-data";

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

  it("generadores Open Graph producen PNGs válidos de 1200×630 y fallback Cero-Fuga en /p/[pickId]", async () => {
    for (const declared of [homeOgSize, resultadosOgSize, verificacionOgSize, precioOgSize, pickOgSize]) {
      expect(declared).toEqual({ width: 1200, height: 630 });
    }

    const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const assertPng1200x630 = async (res: Response): Promise<Buffer> => {
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("image/png");
      const buf = Buffer.from(await res.arrayBuffer());
      expect(buf.subarray(0, 8).equals(pngSig)).toBe(true);
      expect(buf.readUInt32BE(16)).toBe(1200);
      expect(buf.readUInt32BE(20)).toBe(630);
      return buf;
    };

    await assertPng1200x630(await HomeOpenGraphImage());
    await assertPng1200x630(await ResultadosOpenGraphImage());
    await assertPng1200x630(await VerificacionOpenGraphImage());
    await assertPng1200x630(await PrecioOpenGraphImage());
    await assertPng1200x630(await PublicPickOpenGraphImage({ params: Promise.resolve({ pickId: "carlos-sem" }) }));

    const fallbackBuf = await assertPng1200x630(
      await PublicPickOpenGraphImage({ params: Promise.resolve({ pickId: "no-existe-slug" }) }),
    );
    const rawDataset = buildServerRawPlatformDataset();
    const upcomingWithLocked = rawDataset.games.find(
      (g) => g.status !== "FT" && g.picks.some((p) => !p.isDailyOpenPromo && !p.isTipsterWeeklyOpen),
    );
    expect(upcomingWithLocked).toBeTruthy();
    const lockedPick = upcomingWithLocked!.picks.find(
      (p) => !p.isDailyOpenPromo && !p.isTipsterWeeklyOpen,
    )!;
    const lockedBuf = await assertPng1200x630(
      await PublicPickOpenGraphImage({ params: Promise.resolve({ pickId: lockedPick.id }) }),
    );
    expect(lockedBuf.equals(fallbackBuf)).toBe(true);
  });
});
