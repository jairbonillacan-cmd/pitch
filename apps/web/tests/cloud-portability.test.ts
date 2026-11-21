import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as healthGet } from "../app/api/health/route";
import nextConfigFactory from "../next.config.mjs";
import { getAuth, isHostedRemote, resetAuthForTests } from "../src/server/auth";
import {
  getAvatarUploader,
  isAvatarStorageEnabled,
  resolveAvatarStorageProvider,
  setAvatarUploaderForTests,
} from "../src/server/avatar-storage";
import { trustedClientIp, verifySameOriginMutation } from "../src/server/request-security";

describe("ADR-050 · Portabilidad e independencia de proveedor (sin lock-in Vercel / GCP / Cloudflare)", () => {
  afterEach(() => {
    setAvatarUploaderForTests(null);
    resetAuthForTests();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("avatar-storage soporta cualquier almacenamiento S3-compatible con firma AWS SigV4 (cero SDKs)", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("GCS_AVATAR_BUCKET", "");
    vi.stubEnv("AVATAR_STORAGE_PROVIDER", "");
    vi.stubEnv("S3_AVATAR_ENDPOINT", "https://s3.us-west-004.backblazeb2.com");
    vi.stubEnv("S3_AVATAR_BUCKET", "pitchlab-media");
    vi.stubEnv("S3_AVATAR_REGION", "us-west-004");
    vi.stubEnv("S3_AVATAR_ACCESS_KEY_ID", "AKIA_PORTABLE_KEY");
    vi.stubEnv("S3_AVATAR_SECRET_ACCESS_KEY", "secret-portable-key-do-not-leak");
    vi.stubEnv("S3_AVATAR_PUBLIC_BASE_URL", "https://media.pitchlab.mx");

    expect(resolveAvatarStorageProvider()).toBe("s3");
    expect(isAvatarStorageEnabled()).toBe(true);

    const calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, method, headers });
      if (method === "PUT") return new Response(null, { status: 200 });
      if (method === "DELETE") return new Response(null, { status: 204 });
      return new Response("unexpected", { status: 500 });
    });

    const uploader = getAvatarUploader();
    const { url } = await uploader.upload({
      userId: "socio_99",
      buffer: Buffer.from("webp-portable-bytes"),
      contentType: "image/webp",
    });

    expect(url).toMatch(/^https:\/\/media\.pitchlab\.mx\/avatars\/socio_99-\d+-[a-f0-9]{12}\.webp$/);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.url).toMatch(
      /^https:\/\/s3\.us-west-004\.backblazeb2\.com\/pitchlab-media\/avatars\/socio_99-\d+-[a-f0-9]{12}\.webp$/,
    );
    expect(calls[0]?.headers["Authorization"]).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIA_PORTABLE_KEY\/\d{8}\/us-west-004\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[a-f0-9]{64}$/,
    );
    expect(calls[0]?.headers["Cache-Control"]).toBe("public, max-age=31536000, immutable");
    expect(calls[0]?.headers["Content-Type"]).toBe("image/webp");

    // Borra objetos propios del bucket configurado
    await uploader.remove?.(url);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.method).toBe("DELETE");
    expect(calls[1]?.headers["Authorization"]).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIA_PORTABLE_KEY\//);

    // Ignora URLs externas ajenas al bucket
    await uploader.remove?.("https://cdn-ajeno.example/avatars/externo.webp");
    expect(calls).toHaveLength(2);
  });

  it("isHostedRemote reconoce PITCHLAB_HOSTED=1 y proveedores alternos sin depender de VERCEL ni K_SERVICE", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("K_SERVICE", "");
    vi.stubEnv("FLY_APP_NAME", "");
    vi.stubEnv("RAILWAY_ENVIRONMENT", "");
    vi.stubEnv("RAILWAY_PROJECT_ID", "");
    vi.stubEnv("RENDER", "");
    vi.stubEnv("AWS_EXECUTION_ENV", "");
    vi.stubEnv("ECS_CONTAINER_METADATA_URI", "");
    vi.stubEnv("ECS_CONTAINER_METADATA_URI_V4", "");
    vi.stubEnv("CONTAINER_APP_NAME", "");
    vi.stubEnv("WEBSITE_SITE_NAME", "");
    vi.stubEnv("DO_APP_PLATFORM", "");
    vi.stubEnv("COOLIFY_APP_ID", "");
    vi.stubEnv("PITCHLAB_HOSTED", "");
    expect(isHostedRemote()).toBe(false);

    vi.stubEnv("PITCHLAB_HOSTED", "1");
    expect(isHostedRemote()).toBe(true);

    vi.stubEnv("PITCHLAB_HOSTED", "");
    vi.stubEnv("FLY_APP_NAME", "pitchlab-mx");
    expect(isHostedRemote()).toBe(true);
  });

  it("getAuth permite operar en producción sin Cloudflare Turnstile cuando PITCHLAB_CAPTCHA_PROVIDER=none", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PITCHLAB_HOSTED", "1");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@pg.internal/pitchlab");
    vi.stubEnv("BETTER_AUTH_SECRET", "secreto-produccion-valido-de-al-menos-32-caracteres");
    vi.stubEnv("BETTER_AUTH_URL", "https://pitchlab.mx");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    vi.stubEnv("PITCHLAB_ALLOW_NO_TURNSTILE_IN_PROD", "");
    vi.stubEnv("PITCHLAB_CAPTCHA_PROVIDER", "");

    expect(() => getAuth()).toThrow(/TURNSTILE_SECRET_KEY/);

    resetAuthForTests();
    vi.stubEnv("PITCHLAB_CAPTCHA_PROVIDER", "none");
    expect(getAuth()).not.toBeNull();
  });

  it("trustedClientIp y verifySameOriginMutation operan detrás de proxies estándar (Nginx, Caddy, Fly, RFC 7239)", () => {
    expect(
      trustedClientIp(new Headers({ forwarded: 'for="198.51.100.42:54321";proto=https' })),
    ).toBe("198.51.100.42");
    expect(
      trustedClientIp(new Headers({ forwarded: 'for="[2001:db8::9]:4711";proto=https' })),
    ).toBe("2001:db8::9");
    expect(
      trustedClientIp(new Headers({ "fly-client-ip": "203.0.113.10", "x-forwarded-for": "1.1.1.1" })),
    ).toBe("203.0.113.10");
    expect(
      trustedClientIp(new Headers({ "true-client-ip": "203.0.113.11", "x-forwarded-for": "1.1.1.1" })),
    ).toBe("203.0.113.11");
    expect(
      trustedClientIp(new Headers({ "x-real-ip": "203.0.113.12", "x-forwarded-for": "1.1.1.1" })),
    ).toBe("203.0.113.12");

    vi.stubEnv("BETTER_AUTH_URL", "https://pitchlab.mx");
    const behindNginx = new Request("http://127.0.0.1:8080/api/me/preferences", {
      method: "POST",
      headers: {
        host: "pitchlab.mx",
        "x-forwarded-proto": "https",
        origin: "https://pitchlab.mx",
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(verifySameOriginMutation(behindNginx)).toBeNull();
  });

  it("GET /api/health responde runtime neutro 'node' o etiqueta configurable sin depender de Vercel/GCP", async () => {
    vi.stubEnv("K_SERVICE", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("FLY_APP_NAME", "");
    vi.stubEnv("RAILWAY_ENVIRONMENT", "");
    vi.stubEnv("RAILWAY_PROJECT_ID", "");
    vi.stubEnv("RENDER", "");
    vi.stubEnv("AWS_EXECUTION_ENV", "");
    vi.stubEnv("ECS_CONTAINER_METADATA_URI_V4", "");
    vi.stubEnv("CONTAINER_APP_NAME", "");
    vi.stubEnv("WEBSITE_SITE_NAME", "");
    vi.stubEnv("PITCHLAB_RUNTIME_LABEL", "");

    const neutralRes = await healthGet(new Request("http://localhost:3000/api/health"));
    const neutral = await neutralRes.json();
    expect(neutral).toEqual({ ok: true, service: "pitchlab-web", runtime: "node" });

    vi.stubEnv("PITCHLAB_RUNTIME_LABEL", "docker-vps");
    const customRes = await healthGet(new Request("http://localhost:3000/api/health"));
    const custom = await customRes.json();
    expect(custom).toEqual({ ok: true, service: "pitchlab-web", runtime: "docker-vps" });
  });

  it("next.config.mjs agrega orígenes de media dinámicos a CSP img-src y quita Cloudflare cuando PITCHLAB_CAPTCHA_PROVIDER=none", async () => {
    vi.stubEnv("PITCHLAB_MEDIA_ORIGINS", "https://cdn.mi-vps.mx, https://media.pitchlab.mx/avatars");
    vi.stubEnv("S3_AVATAR_PUBLIC_BASE_URL", "https://assets.example.org/bucket");
    vi.stubEnv("PITCHLAB_CAPTCHA_PROVIDER", "none");

    const cfg = nextConfigFactory("phase-production-server");
    const headerRules = await cfg.headers();
    const rootRule = headerRules.find((r: { source: string }) => r.source === "/:path*");
    const csp = rootRule?.headers.find((h: { key: string }) => h.key === "Content-Security-Policy")?.value ?? "";

    expect(csp).toContain("https://cdn.mi-vps.mx");
    expect(csp).toContain("https://media.pitchlab.mx");
    expect(csp).toContain("https://assets.example.org");
    expect(csp).not.toContain("challenges.cloudflare.com");
    expect(csp).toContain("frame-src 'none'");
  });
});
