import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getHealth } from "../app/api/health/route";
import manifest from "../app/manifest";
import { middleware } from "../middleware";
import buildNextConfig from "../next.config.mjs";

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(TESTS_DIR, "..");
const REPO_ROOT = resolve(WEB_ROOT, "../..");

function readPngDimensions(filePath: string): { width: number; height: number } {
  const bytes = readFileSync(filePath);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function expectBaselineHeaders(headers: Headers): void {
  expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(headers.get("X-Frame-Options")).toBe("DENY");
  expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  expect(headers.get("Permissions-Policy")).toBe(
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  expect(headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin-allow-popups");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Middleware security hardening", () => {
  it("bloquea POST cross-site en /api/* con 403, Vary de Fetch Metadata y headers base", async () => {
    const req = new NextRequest("http://127.0.0.1:6420/api/parlays/sgp", {
      method: "POST",
      headers: {
        "sec-fetch-site": "cross-site",
      },
    });
    const res = await middleware(req);
    expect(res.status).toBe(403);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Vary")).toContain("Sec-Fetch-Dest");
    expect(res.headers.get("Vary")).toContain("Sec-Fetch-Mode");
    expect(res.headers.get("Vary")).toContain("Sec-Fetch-Site");
    expectBaselineHeaders(res.headers);
  });

  it("marca GET /api/me/preferences con private, no-store, Vary y headers base", async () => {
    const req = new NextRequest("http://127.0.0.1:6420/api/me/preferences", {
      method: "GET",
      headers: {
        "sec-fetch-site": "same-origin",
      },
    });
    const res = await middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Vary")).toContain("Sec-Fetch-Dest");
    expect(res.headers.get("Vary")).toContain("Sec-Fetch-Mode");
    expect(res.headers.get("Vary")).toContain("Sec-Fetch-Site");
    expectBaselineHeaders(res.headers);
  });

  it("aplica X-Robots-Tag noindex y headers base en /i/:code", async () => {
    const req = new NextRequest("http://127.0.0.1:6420/i/SOFIA5", {
      method: "GET",
    });
    const res = await middleware(req);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expectBaselineHeaders(res.headers);
  });

  it("redirige /app sin sesión a /login?next=%2Fapp con headers base", async () => {
    const req = new NextRequest("http://127.0.0.1:6420/app", {
      method: "GET",
      headers: { host: "127.0.0.1:6420" },
    });
    const res = await middleware(req);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "http://invalid.local");
    expect(`${location.pathname}${location.search}`).toBe("/login?next=%2Fapp");
    expectBaselineHeaders(res.headers);
  });

  it("emite CSP dinámica con nonce y hash sha256 en /login", async () => {
    const req = new NextRequest("http://127.0.0.1:6420/login", {
      method: "GET",
    });
    const res = await middleware(req);
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("'nonce-");
    expect(csp).toContain("'sha256-");
    expect(csp).toContain("frame-ancestors 'none'");
    expectBaselineHeaders(res.headers);
  });

  it("emite HSTS solo en producción sobre HTTPS o PITCHLAB_HOSTED=1 y nunca en HTTP dev", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PITCHLAB_HOSTED", "0");
    const devRes = await middleware(
      new NextRequest("http://127.0.0.1:6420/login", { method: "GET" }),
    );
    expect(devRes.headers.get("Strict-Transport-Security")).toBeNull();

    vi.stubEnv("NODE_ENV", "production");
    const prodHttpsRes = await middleware(
      new NextRequest("https://pitchlab.mx/login", { method: "GET" }),
    );
    expect(prodHttpsRes.headers.get("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );

    vi.stubEnv("PITCHLAB_HOSTED", "1");
    const prodHostedRes = await middleware(
      new NextRequest("http://127.0.0.1:8080/login", {
        method: "GET",
        headers: { "x-forwarded-proto": "https" },
      }),
    );
    expect(prodHostedRes.headers.get("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
  });
});

describe("next.config.mjs headers, Dockerignore, PWA y /api/health", () => {
  it("next.config.mjs omite HSTS en dev, incluye COOP y configura Cache-Control para /verificacion en prod", async () => {
    const devCfg = buildNextConfig(PHASE_DEVELOPMENT_SERVER);
    const devHeaderRules = await devCfg.headers();
    const devRootHeaders = devHeaderRules.find((rule) => rule.source === "/:path*")?.headers ?? [];
    expect(devRootHeaders.some((h) => h.key === "Strict-Transport-Security")).toBe(false);
    expect(devRootHeaders.find((h) => h.key === "Cross-Origin-Opener-Policy")?.value).toBe(
      "same-origin-allow-popups",
    );

    const prodCfg = buildNextConfig("phase-production-server");
    const prodHeaderRules = await prodCfg.headers();
    const prodRootHeaders =
      prodHeaderRules.find((rule) => rule.source === "/:path*")?.headers ?? [];
    expect(prodRootHeaders.find((h) => h.key === "Strict-Transport-Security")?.value).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
    expect(prodRootHeaders.find((h) => h.key === "Cross-Origin-Opener-Policy")?.value).toBe(
      "same-origin-allow-popups",
    );
    const verifHeaders =
      prodHeaderRules.find((rule) => rule.source === "/verificacion")?.headers ?? [];
    expect(verifHeaders.find((h) => h.key === "Cache-Control")?.value).toBe(
      "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
    );
  });

  it("manifest usa copy récord sellado, PNGs reales 192/512, sw.js seguro y .dockerignore blinda .env*", () => {
    const m = manifest();
    expect(m.description).toContain("récord sellado");
    expect(m.description).not.toContain("bitácora");

    expect(
      readPngDimensions(join(WEB_ROOT, "public/brand/app-icons/icon-192.png")),
    ).toEqual({ width: 192, height: 192 });
    expect(
      readPngDimensions(join(WEB_ROOT, "public/brand/app-icons/icon-512.png")),
    ).toEqual({ width: 512, height: 512 });
    expect(
      readPngDimensions(join(WEB_ROOT, "public/brand/app-icons/icon-maskable-512.png")),
    ).toEqual({ width: 512, height: 512 });

    const swText = readFileSync(join(WEB_ROOT, "public/sw.js"), "utf8");
    expect(swText).toContain("self.registration.unregister()");
    expect(swText).toContain('"/offline"');

    const dockerignore = readFileSync(join(REPO_ROOT, ".dockerignore"), "utf8");
    expect(dockerignore).toMatch(/^\.env\*$/m);
    expect(dockerignore).toContain("!.env.example");
  });

  it("GET /api/health responde 200, no-store y cuerpo estándar portable", async () => {
    const res = await getHealth(
      new Request("http://127.0.0.1:6420/api/health", { method: "GET" }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    const json = (await res.json()) as { ok: boolean; service: string };
    expect(json.ok).toBe(true);
    expect(json.service).toBe("pitchlab-web");
  });
});
