#!/usr/bin/env node
/**
 * Auditoría de solo lectura para salida a producción de PitchLab (ADR-047 y ADR-050).
 * Independiente del proveedor de hosting (Docker/VPS, Fly, Railway, Render, AWS, Cloud Run, Vercel).
 * Verifica:
 * 1) Migraciones SQL estándar PostgreSQL en `packages/db/migrations/`
 * 2) Endpoints HTTP de crons (`apps/web/app/api/cron/<job>/route.ts`) y sonda `/api/health`
 * 3) Frescura e integridad de `data/snapshots/shell-index.json`
 * 4) Artefacto portable de contenedor (`Dockerfile`)
 * 5) Presencia (sin imprimir valores) de variables requeridas en producción por capacidad
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

// 1) Migraciones SQL estándar PostgreSQL (compatibles con cualquier PostgreSQL 15+)
const migDir = checkFile("packages/db/migrations", "Directorio de migraciones SQL (PostgreSQL)");
if (migDir) {
  const sqlFiles = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
  if (sqlFiles.length >= 20) {
    okItems.push(`Migraciones SQL detectadas: ${sqlFiles.length} (${sqlFiles[0]} .. ${sqlFiles[sqlFiles.length - 1]})`);
  } else {
    warnings.push(`Solo ${sqlFiles.length} migraciones SQL encontradas.`);
  }
}

// 2) Endpoints HTTP portables de crons + sonda /api/health (fuente de verdad agnóstica de proveedor)
checkFile("apps/web/app/api/health/route.ts", "Sonda HTTP portable /api/health");
for (const slug of ["settle-picks", "push-alerts", "tipster-payouts", "weekly-digest", "monthly-record"]) {
  checkFile(`apps/web/app/api/cron/${slug}/route.ts`, `Endpoint HTTP cron /api/cron/${slug}`);
}

// Manifiesto opcional de Vercel Cron: si existe, validar consistencia sin exigirlo como dependencia obligatoria.
const vercelPath = path.join(ROOT, "apps/web/vercel.json");
if (existsSync(vercelPath)) {
  try {
    const parsed = JSON.parse(readFileSync(vercelPath, "utf8"));
    const paths = new Set((parsed.crons ?? []).map((c) => c.path));
    for (const required of ["/api/cron/settle-picks", "/api/cron/push-alerts", "/api/cron/tipster-payouts"]) {
      if (!paths.has(required)) {
        errors.push(`Falta cron requerido en el manifiesto opcional vercel.json: ${required}`);
      }
    }
    okItems.push("Manifiesto opcional vercel.json consistente con endpoints /api/cron/*");
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

// 4) Empaquetado portable estándar OCI (Docker)
checkFile("Dockerfile", "Contenedor OCI multi-etapa portable (ADR-050)");

// 5) Variables de entorno de producción por capacidad (solo presencia, JAMÁS valores)
const captchaDisabled =
  process.env.PITCHLAB_CAPTCHA_PROVIDER?.trim().toLowerCase() === "none" ||
  process.env.PITCHLAB_ALLOW_NO_TURNSTILE_IN_PROD === "1";

const hasS3Avatar = Boolean(
  process.env.S3_AVATAR_ENDPOINT?.trim() &&
    process.env.S3_AVATAR_BUCKET?.trim() &&
    process.env.S3_AVATAR_ACCESS_KEY_ID?.trim() &&
    process.env.S3_AVATAR_SECRET_ACCESS_KEY?.trim(),
);

const prodEnvGroups = [
  { group: "Base de datos y Auth", vars: ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"] },
  { group: "Crons y Anti-abuso", vars: ["CRON_SECRET", "CAPTCHA_OR_EXPLICIT_OPTOUT"] },
  { group: "Web Push (VAPID)", vars: ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"] },
  { group: "Correo y Media", vars: ["RESEND_API_KEY", "MEDIA_STORAGE_ANY_ADAPTER"] },
  { group: "Cobro SPEI / Admin", vars: ["PITCHLAB_ADMIN_EMAILS", "PITCHLAB_TRANSFER_CLABE"] },
];

for (const { group, vars } of prodEnvGroups) {
  const missing = vars.filter((name) => {
    if (name === "CAPTCHA_OR_EXPLICIT_OPTOUT") {
      if (captchaDisabled) return false;
      const hasSite = Boolean(
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || process.env.TURNSTILE_SITE_KEY?.trim(),
      );
      const hasSecret = Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());
      return !(hasSite && hasSecret);
    }
    if (name === "MEDIA_STORAGE_ANY_ADAPTER") {
      return !(hasS3Avatar || process.env.GCS_AVATAR_BUCKET?.trim() || process.env.BLOB_READ_WRITE_TOKEN?.trim());
    }
    return !process.env[name]?.trim();
  });
  if (missing.length === 0) {
    okItems.push(`Env [${group}]: completo en el entorno actual`);
  } else {
    warnings.push(`Env [${group}] faltante en entorno local (configurar en tu plataforma de producción): ${missing.join(", ")}`);
  }
}

console.log("=== PitchLab · Auditoría de salida a producción (agnóstica de proveedor · ADR-050) ===");
for (const item of okItems) console.log(`  [OK]   ${item}`);
for (const warn of warnings) console.log(`  [AVISO] ${warn}`);
for (const err of errors) console.error(`  [ERR]  ${err}`);

if (errors.length > 0) {
  process.exit(1);
}
console.log(`\nResumen: ${okItems.length} verificaciones OK, ${warnings.length} avisos de entorno local, 0 errores bloqueantes.`);
