import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as healthGet } from "../app/api/health/route";
import { getAuth, resetAuthForTests } from "../src/server/auth";
import {
  getAvatarUploader,
  isAvatarStorageEnabled,
  setAvatarUploaderForTests,
} from "../src/server/avatar-storage";
import { verifySameOriginMutation } from "../src/server/request-security";

describe("preparación Google Cloud Run (/api/health, GCS avatares, K_SERVICE, TLS proxy)", () => {
  afterEach(() => {
    setAvatarUploaderForTests(null);
    resetAuthForTests();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("GET /api/health responde 200 sin tocar base de datos y con Cache-Control no-store", async () => {
    vi.stubEnv("K_SERVICE", "pitchlab-web");
    const res = healthGet();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.json()).toEqual({
      ok: true,
      service: "pitchlab-web",
      runtime: "cloud-run",
    });
  });

  it("avatar-storage usa Google Cloud Storage cuando GCS_AVATAR_BUCKET está configurado (sin Vercel Blob)", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("GCS_AVATAR_BUCKET", "pitchlab-demo-avatars");

    expect(isAvatarStorageEnabled()).toBe(true);

    const calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const rawHeaders = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, method, headers: rawHeaders });

      if (url.includes("metadata.google.internal")) {
        return new Response(JSON.stringify({ access_token: "tok-cloud-run", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (method === "POST" && url.includes("storage.googleapis.com/upload/storage/v1/b/pitchlab-demo-avatars/o")) {
        const bodyText = Buffer.from(init?.body as Uint8Array).toString("utf8");
        expect(bodyText).toContain("public, max-age=31536000, immutable");
        return new Response(JSON.stringify({ name: "avatars/u-1.webp" }), { status: 200 });
      }
      if (method === "DELETE" && url.includes("storage.googleapis.com/storage/v1/b/pitchlab-demo-avatars/o/")) {
        return new Response(null, { status: 204 });
      }
      return new Response("unexpected", { status: 500 });
    });

    const uploader = getAvatarUploader();
    const { url } = await uploader.upload({
      userId: "user_42",
      buffer: Buffer.from("webp-bytes"),
      contentType: "image/webp",
    });

    expect(url).toMatch(/^https:\/\/storage\.googleapis\.com\/pitchlab-demo-avatars\/avatars\/user_42-\d+-[a-f0-9]{12}\.webp$/);
    expect(calls[0]?.headers["Metadata-Flavor"]).toBe("Google");
    expect(calls[1]?.headers["Authorization"]).toBe("Bearer tok-cloud-run");

    // Borra avatar propio del bucket y reutiliza el token en caché
    await uploader.remove?.(url);
    expect(calls).toHaveLength(3);
    expect(calls[2]?.method).toBe("DELETE");

    // Ignora URLs ajenas (nunca intenta borrar objetos fuera del bucket configurado)
    await uploader.remove?.("https://otro-dominio.example/avatars/externo.webp");
    expect(calls).toHaveLength(3);
  });

  it("auth.ts bloquea BETTER_AUTH_URL apuntando a localhost en Google Cloud Run (K_SERVICE)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("K_SERVICE", "pitchlab-web");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@db.example/neondb");
    vi.stubEnv("BETTER_AUTH_SECRET", "secreto-produccion-valido-de-al-menos-32-caracteres");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:8080");

    expect(() => getAuth()).toThrow(/localhost/);
  });

  it("verifySameOriginMutation acepta Origin HTTPS detrás del balanceador TLS de Cloud Run y rechaza orígenes ajenos", () => {
    vi.stubEnv("BETTER_AUTH_URL", "");
    const okReq = new Request("http://0.0.0.0:8080/api/me/preferences", {
      method: "POST",
      headers: {
        host: "pitchlab-web-abc123-uk.a.run.app",
        "x-forwarded-proto": "https",
        origin: "https://pitchlab-web-abc123-uk.a.run.app",
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(verifySameOriginMutation(okReq)).toBeNull();

    const evilReq = new Request("http://0.0.0.0:8080/api/me/preferences", {
      method: "POST",
      headers: {
        host: "pitchlab-web-abc123-uk.a.run.app",
        "x-forwarded-proto": "https",
        origin: "https://sitio-malicioso.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(verifySameOriginMutation(evilReq)?.status).toBe(403);
  });
});
