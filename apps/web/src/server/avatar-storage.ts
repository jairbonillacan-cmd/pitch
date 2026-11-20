import { createHash, createHmac, randomBytes } from "node:crypto";
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

export type AvatarStorageProviderName = "s3" | "gcs" | "vercel-blob";

const VERCEL_BLOB_HOST_RE = /^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\//i;
const BUCKET_NAME_RE = /^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/;
const GCS_METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

let cachedMetadataToken: { token: string; expiresAtMs: number } | null = null;

interface S3AvatarConfig {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
}

function configuredS3Avatar(): S3AvatarConfig | null {
  const endpointRaw = process.env.S3_AVATAR_ENDPOINT?.trim() ?? "";
  const bucket = process.env.S3_AVATAR_BUCKET?.trim().toLowerCase() ?? "";
  const accessKeyId = process.env.S3_AVATAR_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = process.env.S3_AVATAR_SECRET_ACCESS_KEY?.trim() ?? "";
  if (!endpointRaw || !bucket || !accessKeyId || !secretAccessKey) return null;
  if (!BUCKET_NAME_RE.test(bucket)) return null;
  let endpoint: string;
  try {
    const parsed = new URL(endpointRaw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    endpoint = parsed.origin + parsed.pathname.replace(/\/+$/, "");
  } catch (err) {
    void err;
    return null;
  }
  const region = process.env.S3_AVATAR_REGION?.trim() || "us-east-1";
  const customBase = (
    process.env.S3_AVATAR_PUBLIC_BASE_URL?.trim() ||
    process.env.AVATAR_PUBLIC_BASE_URL?.trim() ||
    ""
  );
  const publicBaseUrl =
    customBase && /^https:\/\/[^\s]+$/i.test(customBase)
      ? customBase.replace(/\/+$/, "")
      : `${endpoint}/${bucket}`;
  return { endpoint, bucket, region, accessKeyId, secretAccessKey, publicBaseUrl };
}

function configuredGcsBucket(): string | null {
  const raw = process.env.GCS_AVATAR_BUCKET?.trim().toLowerCase() ?? "";
  if (!raw || !BUCKET_NAME_RE.test(raw)) return null;
  return raw;
}

function gcsPublicBaseUrl(bucket: string): string {
  const custom =
    process.env.GCS_AVATAR_PUBLIC_BASE_URL?.trim() || process.env.AVATAR_PUBLIC_BASE_URL?.trim();
  if (custom && /^https:\/\/[^\s]+$/i.test(custom)) {
    return custom.replace(/\/+$/, "");
  }
  return `https://storage.googleapis.com/${bucket}`;
}

function configuredVercelBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

/**
 * Resuelve el adaptador activo de almacenamiento de avatares sin acoplar la app a un solo proveedor (ADR-050).
 * Prioridad automática: S3-compatible (AWS S3 / Backblaze B2 / MinIO / DO Spaces / Hetzner / R2) → GCS → Vercel Blob.
 */
export function resolveAvatarStorageProvider(): AvatarStorageProviderName | null {
  const explicit = process.env.AVATAR_STORAGE_PROVIDER?.trim().toLowerCase();
  if (explicit === "s3") return configuredS3Avatar() ? "s3" : null;
  if (explicit === "gcs") return configuredGcsBucket() ? "gcs" : null;
  if (explicit === "vercel-blob") return configuredVercelBlob() ? "vercel-blob" : null;
  if (configuredS3Avatar()) return "s3";
  if (configuredGcsBucket()) return "gcs";
  if (configuredVercelBlob()) return "vercel-blob";
  return null;
}

export function isAvatarStorageEnabled(): boolean {
  return resolveAvatarStorageProvider() !== null;
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

function sha256Hex(input: Buffer | string): string {
  return createHash("sha256").update(input).digest("hex");
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function encodeS3PathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Firma estándar AWS Signature Version 4 (compatible con S3, MinIO, Backblaze B2, Spaces, Hetzner, Tigris, R2). */
function signS3Request(input: {
  method: "PUT" | "DELETE";
  endpoint: string;
  bucket: string;
  objectName: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  payload: Buffer;
  now?: Date;
}): { url: string; headers: Record<string, string> } {
  const now = input.now ?? new Date();
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const amzDate = iso.slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);
  const parsedEndpoint = new URL(input.endpoint);
  const basePath = parsedEndpoint.pathname.replace(/\/+$/, "");
  const encodedKey = input.objectName.split("/").map(encodeS3PathSegment).join("/");
  const canonicalUri = `${basePath}/${encodeS3PathSegment(input.bucket)}/${encodedKey}`;
  const payloadHash = sha256Hex(input.payload);
  const host = parsedEndpoint.host;

  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    input.method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${input.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmacSha256(`AWS4${input.secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, input.region);
  const kService = hmacSha256(kRegion, "s3");
  const kSigning = hmacSha256(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  return {
    url: `${parsedEndpoint.origin}${canonicalUri}`,
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
  };
}

function extractOwnedS3ObjectName(url: string, cfg: S3AvatarConfig): string | null {
  const prefixes = [`${cfg.publicBaseUrl}/`, `${cfg.endpoint}/${cfg.bucket}/`];
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

const s3AvatarUploader: AvatarBlobUploader = {
  async upload({ userId, buffer, contentType }) {
    const cfg = configuredS3Avatar();
    if (!cfg) {
      throw new Error("Almacenamiento S3-compatible de avatares no configurado.");
    }
    const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "member";
    const suffix = randomBytes(6).toString("hex");
    const objectName = `avatars/${safeUser}-${Date.now()}-${suffix}.webp`;
    const signed = signS3Request({
      method: "PUT",
      endpoint: cfg.endpoint,
      bucket: cfg.bucket,
      objectName,
      region: cfg.region,
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      payload: buffer,
    });
    const res = await fetch(signed.url, {
      method: "PUT",
      headers: {
        ...signed.headers,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
      body: new Uint8Array(buffer),
    });
    if (!res.ok) {
      throw new Error(`Error al subir avatar a almacenamiento S3 (${res.status}).`);
    }
    return { url: `${cfg.publicBaseUrl}/${objectName}` };
  },
  async remove(url) {
    const cfg = configuredS3Avatar();
    if (!cfg) return;
    const objectName = extractOwnedS3ObjectName(url, cfg);
    if (!objectName) return;
    try {
      const signed = signS3Request({
        method: "DELETE",
        endpoint: cfg.endpoint,
        bucket: cfg.bucket,
        objectName,
        region: cfg.region,
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
        payload: Buffer.alloc(0),
      });
      await fetch(signed.url, {
        method: "DELETE",
        headers: signed.headers,
      });
    } catch (err) {
      void err;
    }
  },
};

const vercelBlobUploader: AvatarBlobUploader = {
  async upload({ userId, buffer, contentType }) {
    const { put } = await import("@vercel/blob");
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
      const { del } = await import("@vercel/blob");
      await del(url);
    } catch (err) {
      void err;
    }
  },
};

let testUploaderOverride: AvatarBlobUploader | null = null;

/** Permite sustituir la subida real en pruebas sin tocar ningún proveedor externo. */
export function setAvatarUploaderForTests(uploader: AvatarBlobUploader | null): void {
  testUploaderOverride = uploader;
  cachedMetadataToken = null;
}

export function getAvatarUploader(): AvatarBlobUploader {
  if (testUploaderOverride) return testUploaderOverride;
  const provider = resolveAvatarStorageProvider();
  if (provider === "s3") return s3AvatarUploader;
  if (provider === "gcs") return gcsAvatarUploader;
  return vercelBlobUploader;
}
