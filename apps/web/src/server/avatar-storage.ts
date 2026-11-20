import { randomBytes } from "node:crypto";
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
const GCS_BUCKET_RE = /^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/;
const GCS_METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

let cachedMetadataToken: { token: string; expiresAtMs: number } | null = null;

function configuredGcsBucket(): string | null {
  const raw = process.env.GCS_AVATAR_BUCKET?.trim().toLowerCase() ?? "";
  if (!raw || !GCS_BUCKET_RE.test(raw)) return null;
  return raw;
}

function gcsPublicBaseUrl(bucket: string): string {
  const custom = process.env.GCS_AVATAR_PUBLIC_BASE_URL?.trim();
  if (custom && /^https:\/\/[^\s]+$/i.test(custom)) {
    return custom.replace(/\/+$/, "");
  }
  return `https://storage.googleapis.com/${bucket}`;
}

export function isAvatarStorageEnabled(): boolean {
  return Boolean(configuredGcsBucket() || process.env.BLOB_READ_WRITE_TOKEN?.trim());
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

async function resolveGcsAccessToken(): Promise<string> {
  const explicit = process.env.GCS_ACCESS_TOKEN?.trim();
  if (explicit) return explicit;

  const now = Date.now();
  if (cachedMetadataToken && cachedMetadataToken.expiresAtMs > now + 60_000) {
    return cachedMetadataToken.token;
  }

  const res = await fetch(GCS_METADATA_TOKEN_URL, {
    headers: { "Metadata-Flavor": "Google" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`No se pudo obtener token de Google Cloud Storage (${res.status}).`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("Respuesta inválida del servidor de metadatos de Google Cloud.");
  }
  const ttlSec = Math.max(120, Number(data.expires_in ?? 3000));
  cachedMetadataToken = {
    token: data.access_token,
    expiresAtMs: now + ttlSec * 1000,
  };
  return data.access_token;
}

function extractOwnedGcsObjectName(url: string, bucket: string): string | null {
  const prefixes = [
    `${gcsPublicBaseUrl(bucket)}/`,
    `https://storage.googleapis.com/${bucket}/`,
  ];
  for (const prefix of prefixes) {
    if (url.startsWith(prefix)) {
      const rest = url.slice(prefix.length).split(/[?#]/)[0] ?? "";
      if (rest.startsWith("avatars/") && !rest.includes("..")) {
        return decodeURIComponent(rest);
      }
    }
  }
  return null;
}

const gcsAvatarUploader: AvatarBlobUploader = {
  async upload({ userId, buffer, contentType }) {
    const bucket = configuredGcsBucket();
    if (!bucket) {
      throw new Error("GCS_AVATAR_BUCKET no configurado.");
    }
    const token = await resolveGcsAccessToken();
    const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "member";
    const suffix = randomBytes(6).toString("hex");
    const objectName = `avatars/${safeUser}-${Date.now()}-${suffix}.webp`;

    const boundary = `pitchlab_${randomBytes(12).toString("hex")}`;
    const metadataJson = JSON.stringify({
      name: objectName,
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    });

    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataJson}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
        "utf8",
      ),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
    ]);

    const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=multipart`;
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.byteLength),
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`Error al subir avatar a Google Cloud Storage (${res.status}).`);
    }

    return { url: `${gcsPublicBaseUrl(bucket)}/${objectName}` };
  },
  async remove(url) {
    const bucket = configuredGcsBucket();
    if (!bucket) return;
    const objectName = extractOwnedGcsObjectName(url, bucket);
    if (!objectName) return;
    try {
      const token = await resolveGcsAccessToken();
      const deleteUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`;
      await fetch(deleteUrl, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      void err;
    }
  },
};

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
    if (!process.env.BLOB_READ_WRITE_TOKEN?.trim() || !VERCEL_BLOB_HOST_RE.test(url)) return;
    try {
      await del(url);
    } catch (err) {
      void err;
    }
  },
};

let testUploaderOverride: AvatarBlobUploader | null = null;

/** Permite sustituir la subida real en pruebas sin tocar Vercel Blob ni Google Cloud Storage. */
export function setAvatarUploaderForTests(uploader: AvatarBlobUploader | null): void {
  testUploaderOverride = uploader;
  cachedMetadataToken = null;
}

export function getAvatarUploader(): AvatarBlobUploader {
  if (testUploaderOverride) return testUploaderOverride;
  return configuredGcsBucket() ? gcsAvatarUploader : vercelBlobUploader;
}
