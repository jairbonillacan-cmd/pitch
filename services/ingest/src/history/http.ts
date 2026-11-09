/**
 * Descarga con caché en disco y utilidades de concurrencia para los constructores
 * de datasets. La caché guarda los bytes originales para poder reprocesar sin red.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface FetchedText {
  text: string;
  sha256: string;
  bytes: number;
  status: "fetched" | "cached";
  retrievedAt: string | null;
}

export function sha256(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchTextCached(
  url: string,
  cachePath: string,
  options: { offline: boolean; retries: number; userAgent?: string },
): Promise<FetchedText | null> {
  if (existsSync(cachePath)) {
    const text = readFileSync(cachePath, "utf8");
    return {
      text,
      sha256: sha256(text),
      bytes: Buffer.byteLength(text, "utf8"),
      status: "cached",
      retrievedAt: null,
    };
  }

  // Una temporada no publicada deja un marcador: así el modo offline es reproducible
  // sin confundir "la fuente no lo publica" con "falta descargarlo".
  const missingMarker = `${cachePath}.missing`;
  if (existsSync(missingMarker)) return null;

  if (options.offline) {
    throw new Error(
      `Modo offline: falta el archivo en caché '${cachePath}' para ${url}. Ejecuta sin --offline para descargarlo.`,
    );
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= options.retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            options.userAgent ?? "PitchLab-Ingest/0.2 (+https://pitchlab.mx)",
        },
      });
      if (response.status === 404) {
        mkdirSync(dirname(cachePath), { recursive: true });
        writeFileSync(missingMarker, `${new Date().toISOString()} 404 ${url}\n`, "utf8");
        return null;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} en ${url}`);
      }
      const text = await response.text();
      mkdirSync(dirname(cachePath), { recursive: true });
      writeFileSync(cachePath, text, "utf8");
      if (existsSync(missingMarker)) unlinkSync(missingMarker);
      return {
        text,
        sha256: sha256(text),
        bytes: Buffer.byteLength(text, "utf8"),
        status: "fetched",
        retrievedAt: new Date().toISOString(),
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < options.retries) await sleep(500 * (attempt + 1));
    }
  }

  throw new Error(`No se pudo descargar ${url}: ${lastError?.message ?? "error desconocido"}`);
}

export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length || 1)) },
    async () => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        results[index] = await fn(items[index]!, index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
