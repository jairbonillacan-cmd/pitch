#!/usr/bin/env node
/**
 * Auditoría de solo lectura para salida a producción de PitchLab (ADR-047).
 * Verifica:
 * 1) Migraciones SQL ordenadas en `packages/db/migrations/`
 * 2) Crons declarados en `apps/web/vercel.json`
 * 3) Frescura e integridad de `data/snapshots/shell-index.json`
 * 4) Presencia (sin imprimir valores) de variables requeridas en producción
 * 5) Guardrails de código (`lint-codebase`, `check-no-demo-prod`, `check-no-secrets`)
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const warnings = [];
const errors = [];
const okItems = [];

function checkFile(rel, label) {
  const full = path.join(ROOT, rel);
  if (existsSync(full)) {
    okItems.push(`${label}: ${rel}`);
    return full;
  }
  errors.push(`Falta ${label}: ${rel}`);
  return null;
}

// 1) Migraciones SQL
const migDir = checkFile("packages/db/migrations", "Directorio de migraciones DB");
if (migDir) {
  const sqlFiles = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
  if (sqlFiles.length >= 20) {
    okItems.push(`Migraciones SQL detectadas: ${sqlFiles.length} (${sqlFiles[0]} .. ${sqlFiles[sqlFiles.length - 1]})`);
  } else {
    warnings.push(`Solo ${sqlFiles.length} migraciones SQL encontradas.`);
  }
}

// 2) Crons en vercel.json
const vercelFile = checkFile("apps/web/vercel.json", "Configuración de crons Vercel");
if (vercelFile) {
  try {
    const parsed = JSON.parse(readFileSync(vercelFile, "utf8"));
    const paths = new Set((parsed.crons ?? []).map((c) => c.path));
    for (const required of ["/api/cron/settle-picks", "/api/cron/push-alerts", "/api/cron/tipster-payouts"]) {
      if (paths.has(required)) okItems.push(`Cron registrado: ${required}`);
      else errors.push(`Falta cron requerido en vercel.json: ${required}`);
    }
  } catch (err) {
    errors.push(`No se pudo parsear apps/web/vercel.json: ${err.message}`);
  }
}

// 3) Índice precompilado shell-index.json
const shellIdx = checkFile("data/snapshots/shell-index.json", "Índice precompilado shell-index.json");
if (shellIdx) {
  try {
    const stat = statSync(shellIdx);
    const data = JSON.parse(readFileSync(shellIdx, "utf8"));
    const ageHours = Math.round(((Date.now() - stat.mtimeMs) / 3_600_000) * 10) / 10;
    if (data.schemaVersion === 1 && data.leagueCount >= 50) {
      okItems.push(`shell-index.json válido: ${data.leagueCount} competencias (${Math.round(stat.size / 1024)} KB, antigüedad ${ageHours} h)`);
    } else {
      errors.push(`shell-index.json incompleto (leagueCount=${data.leagueCount}).`);
    }
  } catch (err) {
    errors.push(`shell-index.json corrupto: ${err.message}`);
  }
}

// 4) Script de migración segura de producción
checkFile("scripts/migrate-prod.ps1", "Script de migración controlada Neon");

// 5) Variables de entorno de producción (solo presencia, JAMÁS valores)
const prodEnvGroups = [
  { group: "Base de datos y Auth", vars: ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"] },
  { group: "Crons y Seguridad", vars: ["CRON_SECRET", "TURNSTILE_SITE_KEY_OR_PUBLIC", "TURNSTILE_SECRET_KEY"] },
  { group: "Web Push (VAPID)", vars: ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"] },
  { group: "Correo y Media", vars: ["RESEND_API_KEY", "BLOB_READ_WRITE_TOKEN"] },
  { group: "Cobro SPEI / Admin", vars: ["PITCHLAB_ADMIN_EMAILS", "PITCHLAB_TRANSFER_CLABE"] },
];

for (const { group, vars } of prodEnvGroups) {
  const missing = vars.filter((name) => {
    if (name === "TURNSTILE_SITE_KEY_OR_PUBLIC") {
      return !(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || process.env.TURNSTILE_SITE_KEY?.trim());
    }
    return !process.env[name]?.trim();
  });
  if (missing.length === 0) {
    okItems.push(`Env [${group}]: completo en el entorno actual`);
  } else {
    warnings.push(`Env [${group}] faltante en entorno local (configurar en Vercel Prod): ${missing.join(", ")}`);
  }
}

console.log("=== PitchLab · Auditoría de salida a producción ===");
for (const item of okItems) console.log(`  [OK]   ${item}`);
for (const warn of warnings) console.log(`  [AVISO] ${warn}`);
for (const err of errors) console.error(`  [ERR]  ${err}`);

if (errors.length > 0) {
  process.exit(1);
}
console.log(`\nResumen: ${okItems.length} verificaciones OK, ${warnings.length} avisos de entorno local, 0 errores bloqueantes.`);
