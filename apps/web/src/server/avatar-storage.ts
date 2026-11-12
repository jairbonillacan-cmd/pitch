import { del, put } from "@vercel/blob";
import sharp from "sharp";

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_SIZE_PX = 256;
export const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AllowedAvatarMime = (typeof ALLOWED_AVATAR_TYPES)[number];

export type AvatarProcessError =
  | "archivo_requerido"
  | "archivo_vacio"
  | "archivo_muy_grande"
  | "formato_invalido"
  | "imagen_invalida";

export interface AvatarBlobUploader {
  upload(input: { userId: string; buffer: Buffer; contentType: string }): Promise<{ url: string }>;
  remove?(url: string): Promise<void>;
}

const VERCEL_BLOB_HOST_RE = /^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\//i;

export function isAvatarStorageEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

/** Detecta el formato real por firma binaria (evita archivos renombrados o SVG). */
export function detectAvatarMime(bytes: Uint8Array): AllowedAvatarMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/** Valida tipo (`jpeg`, `png`, `webp`), tamaño (<= 2 MB) y reduce a un cuadrado de 256 px. */
export async function prepareAvatarImage(
  file: File | null,
): Promise<{ ok: true; buffer: Buffer; contentType: "image/webp" } | { ok: false; error: AvatarProcessError }> {
  if (!file || typeof file.arrayBuffer !== "function") {
    return { ok: false, error: "archivo_requerido" };
  }
  if (file.size <= 0) {
    return { ok: false, error: "archivo_vacio" };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return { ok: false, error: "archivo_muy_grande" };
  }
  const declaredType = file.type.trim().toLowerCase();
  if (declaredType && !(ALLOWED_AVATAR_TYPES as readonly string[]).includes(declaredType)) {
    return { ok: false, error: "formato_invalido" };
  }

  const rawBuffer = Buffer.from(await file.arrayBuffer());
  if (rawBuffer.byteLength <= 0) {
    return { ok: false, error: "archivo_vacio" };
  }
  if (rawBuffer.byteLength > AVATAR_MAX_BYTES) {
    return { ok: false, error: "archivo_muy_grande" };
  }
  if (!detectAvatarMime(rawBuffer)) {
    return { ok: false, error: "formato_invalido" };
  }

  try {
    const resized = await sharp(rawBuffer, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(AVATAR_SIZE_PX, AVATAR_SIZE_PX, { fit: "cover", position: "centre" })
      .webp({ quality: 84 })
      .toBuffer();
    return { ok: true, buffer: resized, contentType: "image/webp" };
  } catch (err) {
    void err;
    return { ok: false, error: "imagen_invalida" };
  }
}

const vercelBlobUploader: AvatarBlobUploader = {
  async upload({ userId, buffer, contentType }) {
    const blob = await put(`avatars/${userId}-${Date.now()}.webp`, buffer, {
      access: "public",
      addRandomSuffix: true,
      contentType,
    });
    return { url: blob.url };
  },
  async remove(url) {
    if (!isAvatarStorageEnabled() || !VERCEL_BLOB_HOST_RE.test(url)) return;
    try {
      await del(url);
    } catch (err) {
      void err;
    }
  },
};

let activeUploader: AvatarBlobUploader = vercelBlobUploader;

/** Permite sustituir la subida real en pruebas sin tocar Vercel Blob. */
export function setAvatarUploaderForTests(uploader: AvatarBlobUploader | null): void {
  activeUploader = uploader ?? vercelBlobUploader;
}

export function getAvatarUploader(): AvatarBlobUploader {
  return activeUploader;
}
