/**
 * Carga de variables de entorno desde la raíz del monorepo.
 *
 * El CLI de ingesta corre con `tsx` y no con Next.js, así que `.env` y `.env.local`
 * no se cargan solos. Se respeta lo que ya exista en `process.env` (gana el entorno).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadRootEnvFiles(rootDir: string): string[] {
  const loaded: string[] = [];
  for (const fileName of [".env.local", ".env"]) {
    const filePath = resolve(rootDir, fileName);
    if (!existsSync(filePath)) continue;
    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx <= 0) continue;
      const key = line.slice(0, eqIdx).trim();
      const val = line
        .slice(eqIdx + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
    loaded.push(fileName);
  }
  return loaded;
}
