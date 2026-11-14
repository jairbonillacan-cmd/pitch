/**
 * `pnpm --filter @pitchlab/ingest providers:check`
 *
 * Comprueba que cada proveedor configurado responde con la clave cargada en `.env.local`.
 * Hace una sola llamada barata por proveedor y nunca imprime claves ni cuerpos de respuesta.
 */
import { resolve } from "node:path";
import { loadRootEnvFiles } from "../env.js";
import { describeProviders, readProviderConfigs } from "./config.js";

const ROOT_DIR = resolve(import.meta.dirname, "..", "..", "..", "..");

async function main(): Promise<void> {
  const loaded = loadRootEnvFiles(ROOT_DIR);
  console.log(`Archivos de entorno leídos: ${loaded.length ? loaded.join(", ") : "ninguno"}`);

  const summaries = describeProviders();
  const configs = readProviderConfigs();
  let failures = 0;

  for (const summary of summaries) {
    const cfg = configs[summary.id];
    if (!cfg.enabled) {
      console.log(`- ${summary.displayName}: apagado (clave ${summary.key})`);
      continue;
    }
    const url = `${cfg.baseUrl}${cfg.healthPath}`;
    try {
      const res = await fetch(url, { headers: cfg.headers, signal: AbortSignal.timeout(10_000) });
      const limit = res.headers.get("x-ratelimit-remaining") ?? res.headers.get("ratelimit");
      const status = res.ok ? "OK" : `ERROR HTTP ${res.status}`;
      if (!res.ok) failures += 1;
      console.log(
        `- ${summary.displayName}: ${status} · clave ${summary.key} · uso ${summary.commercialStatus}` +
          (limit ? ` · cuota restante ${limit}` : ""),
      );
    } catch (error) {
      failures += 1;
      const reason = error instanceof Error ? error.name : "desconocido";
      console.log(`- ${summary.displayName}: sin respuesta (${reason})`);
    }
  }

  if (failures > 0) process.exitCode = 1;
}

await main();
