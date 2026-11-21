import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETE, POST } from "../app/api/me/avatar/route";
import {
  AVATAR_MAX_BYTES,
  AVATAR_SIZE_PX,
  setAvatarUploaderForTests,
} from "../src/server/avatar-storage";
import { resetRateLimitsForTests } from "../src/server/request-security";

const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  setMemberAvatarUrl: vi.fn(),
}));

vi.mock("../src/server/session-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/session-user")>()),
  requireMember: mocks.requireMember,
}));
vi.mock("@pitchlab/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@pitchlab/db")>()),
  setMemberAvatarUrl: mocks.setMemberAvatarUrl,
}));

const fakeMember = {
  db: {},
  userId: "u-ana",
  email: "ana@example.com",
  emailVerified: true,
  authUserId: "auth_ana",
};

function buildUploadRequest(file: File): Request {
  const form = new FormData();
  form.append("file", file);
  return new Request("http://localhost:9990/api/me/avatar", {
    method: "POST",
    headers: { origin: "http://localhost:9990" },
    body: form,
  });
}

afterEach(() => {
  setAvatarUploaderForTests(null);
  resetRateLimitsForTests();
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe("foto de perfil (/api/me/avatar)", () => {
  it("responde 503 sin BLOB_READ_WRITE_TOKEN", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    mocks.requireMember.mockResolvedValue(fakeMember);

    const png = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 20, g: 80, b: 140 } },
    })
      .png()
      .toBuffer();
    const res = await POST(buildUploadRequest(new File([new Uint8Array(png)], "foto.png", { type: "image/png" })));

    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.json()).toEqual({ error: "almacenamiento_no_disponible" });
    expect(mocks.setMemberAvatarUrl).not.toHaveBeenCalled();
  });

  it("rechaza formatos no permitidos (SVG o firma falsa) y archivos mayores de 2 MB", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "stub-token-solo-prueba");
    mocks.requireMember.mockResolvedValue(fakeMember);

    const svgFile = new File(["<svg xmlns='http://www.w3.org/2000/svg'></svg>"], "icono.svg", {
      type: "image/svg+xml",
    });
    const svgRes = await POST(buildUploadRequest(svgFile));
    expect(svgRes.status).toBe(400);
    expect(await svgRes.json()).toEqual({ error: "formato_invalido" });

    const fakePng = new File(["no-es-png"], "trampa.png", { type: "image/png" });
    const fakeRes = await POST(buildUploadRequest(fakePng));
    expect(fakeRes.status).toBe(400);
    expect(await fakeRes.json()).toEqual({ error: "formato_invalido" });

    const bigBytes = new Uint8Array(AVATAR_MAX_BYTES + 1024);
    const bigFile = new File([bigBytes], "pesada.jpg", { type: "image/jpeg" });
    const bigRes = await POST(buildUploadRequest(bigFile));
    expect(bigRes.status).toBe(413);
    expect(await bigRes.json()).toEqual({ error: "archivo_muy_grande" });
  });

  it("reduce la imagen a un cuadrado de 256 px, usa el uploader inyectado y borra el avatar anterior", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "stub-token-solo-prueba");
    mocks.requireMember.mockResolvedValue(fakeMember);

    const uploadedBuffers: Buffer[] = [];
    const removedUrls: string[] = [];
    setAvatarUploaderForTests({
      async upload({ userId, buffer, contentType }) {
        expect(userId).toBe("u-ana");
        expect(contentType).toBe("image/webp");
        uploadedBuffers.push(buffer);
        return { url: "https://ejemplo.blob.vercel-storage.com/avatars/u-ana-nueva.webp" };
      },
      async remove(url) {
        removedUrls.push(url);
      },
    });

    mocks.setMemberAvatarUrl.mockResolvedValue({
      status: "saved",
      previousAvatarUrl: "https://ejemplo.blob.vercel-storage.com/avatars/u-ana-vieja.webp",
      avatarUrl: "https://ejemplo.blob.vercel-storage.com/avatars/u-ana-nueva.webp",
    });

    const rectangularJpeg = await sharp({
      create: { width: 640, height: 380, channels: 3, background: { r: 40, g: 120, b: 200 } },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    const res = await POST(
      buildUploadRequest(new File([new Uint8Array(rectangularJpeg)], "retrato.jpg", { type: "image/jpeg" })),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      avatarUrl: "https://ejemplo.blob.vercel-storage.com/avatars/u-ana-nueva.webp",
    });
    expect(uploadedBuffers).toHaveLength(1);
    const meta = await sharp(uploadedBuffers[0]!).metadata();
    expect(meta.width).toBe(AVATAR_SIZE_PX);
    expect(meta.height).toBe(AVATAR_SIZE_PX);
    expect(meta.format).toBe("webp");
    expect(removedUrls).toEqual(["https://ejemplo.blob.vercel-storage.com/avatars/u-ana-vieja.webp"]);
  });

  it("DELETE quita la foto en base y limpia el blob anterior", async () => {
    mocks.requireMember.mockResolvedValue(fakeMember);
    const removedUrls: string[] = [];
    setAvatarUploaderForTests({
      async upload() {
        throw new Error("no se debe llamar upload en DELETE");
      },
      async remove(url) {
        removedUrls.push(url);
      },
    });
    mocks.setMemberAvatarUrl.mockResolvedValue({
      status: "saved",
      previousAvatarUrl: "https://ejemplo.blob.vercel-storage.com/avatars/u-ana-actual.webp",
      avatarUrl: null,
    });

    const res = await DELETE(
      new Request("http://localhost:9990/api/me/avatar", {
        method: "DELETE",
        headers: { origin: "http://localhost:9990" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ avatarUrl: null });
    expect(mocks.setMemberAvatarUrl).toHaveBeenCalledWith({}, "u-ana", null);
    expect(removedUrls).toEqual(["https://ejemplo.blob.vercel-storage.com/avatars/u-ana-actual.webp"]);
  });

  it("rechaza POST y DELETE sin cabecera Origin válida con 403 (CSRF)", async () => {
    const form = new FormData();
    const postRes = await POST(
      new Request("http://localhost:9990/api/me/avatar", {
        method: "POST",
        body: form,
      }),
    );
    expect(postRes.status).toBe(403);
    expect(await postRes.json()).toEqual({ error: "origen_invalido" });

    const delRes = await DELETE(
      new Request("http://localhost:9990/api/me/avatar", {
        method: "DELETE",
        headers: { origin: "https://evil.example" },
      }),
    );
    expect(delRes.status).toBe(403);
    expect(await delRes.json()).toEqual({ error: "origen_invalido" });
    expect(mocks.requireMember).not.toHaveBeenCalled();
  });
});
