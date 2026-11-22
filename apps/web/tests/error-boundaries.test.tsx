import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import BlogErrorPage from "../app/blog/error";
import ClubErrorPage from "../app/app/error";
import GlobalError from "../app/global-error";
import LeagueHubErrorPage from "../app/app/[league]/error";
import PublicErrorPage from "../app/error";
import { isChunkLoadError, sanitizeDevPreview } from "../src/client/error-boundary-card";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isChunkLoadError", () => {
  it("detecta fallos de chunks dinámicos por nombre, mensaje o cause", () => {
    const byName = new Error("unexpected");
    byName.name = "ChunkLoadError";
    expect(isChunkLoadError(byName)).toBe(true);
    expect(isChunkLoadError(new Error("Loading chunk 42 failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Failed to fetch dynamically imported module /_next/static/a.js"))).toBe(true);
    expect(isChunkLoadError(new Error("Importing a module script failed"))).toBe(true);

    const nested = new Error("wrapper", { cause: byName });
    expect(isChunkLoadError(nested)).toBe(true);
  });

  it("descarta errores comunes o nulos", () => {
    expect(isChunkLoadError(new Error("Database timeout"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe("sanitizeDevPreview", () => {
  it("oculta por completo cualquier detalle en producción", () => {
    const err = new Error("postgresql://user:pass@localhost:5432/db sk_live_abcdef123456");
    expect(sanitizeDevPreview(err, "production")).toBeNull();
  });

  it("redacta credenciales, rutas y trunca a 240 caracteres fuera de producción", () => {
    const longSuffix = "x".repeat(300);
    const err = new Error(
      `Boom postgres://u:s@host/db Bearer abc.def.ghi sk_live_secret1234 C:\\Users\\dev\\secret.ts ${longSuffix}`,
    );
    const preview = sanitizeDevPreview(err, "development");
    expect(preview).not.toBeNull();
    expect(preview ?? "").not.toContain("u:s@host");
    expect(preview ?? "").not.toContain("abc.def.ghi");
    expect(preview ?? "").not.toContain("sk_live_secret1234");
    expect(preview ?? "").not.toContain("secret.ts");
    expect(preview ?? "").toContain("[db-url]");
    expect(preview ?? "").toContain("[secret]");
    expect(preview ?? "").toContain("[ruta]");
    expect((preview ?? "").length).toBeLessThanOrEqual(240);
  });
});

describe("Error boundaries de PitchLab", () => {
  it("renderiza tarjeta editorial plana y sin fugas en producción para los 4 límites de segmento", () => {
    vi.stubEnv("NODE_ENV", "production");
    const err = Object.assign(
      new Error("postgresql://admin:topsecret@10.0.0.1/pitch sk_test_987654321 C:\\repo\\secret.ts"),
      { digest: "ERR-901" },
    );
    const reset = vi.fn();

    const cases = [
      { html: renderToStaticMarkup(<PublicErrorPage error={err} reset={reset} />), tag: "<main", home: 'href="/"' },
      { html: renderToStaticMarkup(<ClubErrorPage error={err} reset={reset} />), tag: "<section", home: 'href="/app"' },
      {
        html: renderToStaticMarkup(<LeagueHubErrorPage error={err} reset={reset} />),
        tag: "<section",
        home: 'href="/app"',
      },
      { html: renderToStaticMarkup(<BlogErrorPage error={err} reset={reset} />), tag: "<main", home: 'href="/blog"' },
    ];

    for (const item of cases) {
      expect(item.html).toContain(`${item.tag} class="pl-notfound"`);
      expect(item.html).toContain('role="alert"');
      expect(item.html).toContain("Ref. ERR-901");
      expect(item.html).toContain("Reintentar");
      expect(item.html).toContain(item.home);
      expect(item.html).not.toContain("glass-lens");
      expect(item.html).not.toContain("glass-ring");
      expect(item.html).not.toContain(["backdrop", "filter"].join("-"));
      expect(item.html).not.toContain("topsecret");
      expect(item.html).not.toContain("sk_test_987654321");
      expect(item.html).not.toContain("secret.ts");
    }
  });

  it("cambia el CTA a Recargar página ante ChunkLoadError", () => {
    vi.stubEnv("NODE_ENV", "production");
    const chunkErr = new Error("Loading chunk 99 failed");
    chunkErr.name = "ChunkLoadError";
    const reset = vi.fn();

    const html = renderToStaticMarkup(<LeagueHubErrorPage error={chunkErr} reset={reset} />);
    expect(html).toContain("Actualización");
    expect(html).toContain("Recargar página");
    expect(html).not.toContain(">Reintentar<");
  });

  it("renderiza global-error autónomo claro/oscuro, >=44 px y cero hex literales", () => {
    vi.stubEnv("NODE_ENV", "production");
    const err = Object.assign(new Error("fatal_secret_message_123"), { digest: "GLOB-77" });
    const html = renderToStaticMarkup(<GlobalError error={err} reset={vi.fn()} />);

    expect(html).toContain("<html lang=\"es-MX\"");
    expect(html).toContain("@media (prefers-color-scheme: light)");
    expect(html).toContain("min-height: 44px");
    expect(html).toContain("Ref. GLOB-77");
    expect(html).toContain("Reintentar");
    expect(html).not.toContain("fatal_secret_message_123");
    expect(html).not.toContain(["backdrop", "filter"].join("-"));
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);

    const chunkErr = new Error("Failed to fetch dynamically imported module /_next/static/x.js");
    const chunkHtml = renderToStaticMarkup(<GlobalError error={chunkErr} reset={vi.fn()} />);
    expect(chunkHtml).toContain("Recargar página");
  });
});
