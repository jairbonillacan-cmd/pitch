# ADR-050: Arquitectura agnóstica de proveedor y portabilidad entre plataformas

- **Estado:** Aceptada
- **Fecha:** 2026-11-20
- **Contexto relacionado:** ADR-002 (Next.js App Router en un solo origen), ADR-007 (PostgreSQL + Drizzle), ADR-010 (Better Auth), ADR-032 (autenticación y Turnstile condicional), ADR-047 (auditoría de salida a producción)

## Contexto

Durante el avance hacia producción, el repositorio incorporó configuraciones y utilidades de conveniencia para Vercel (`apps/web/vercel.json`, `@vercel/blob`, `VERCEL_DEPLOY_HOOK_URL`), Google Cloud Run (`Dockerfile`, `GCS_AVATAR_BUCKET`, `K_SERVICE`, `deploy-cloud-run.yml`) y Cloudflare (`Turnstile`, `cf-connecting-ip`).

Sin embargo, PitchLab sigue en desarrollo activo y es una decisión estratégica del fundador **no depender de Vercel, Google Cloud ni Cloudflare** (ni de ningún otro proveedor específico). El producto debe poder migrarse en minutos a cualquier plataforma compatible con Node.js/contenedores OCI y PostgreSQL estándar (p. ej. AWS ECS/App Runner, Fly.io, Railway, Render, DigitalOcean App Platform, Azure Container Apps, Hetzner/VPS con Docker/Coolify, Google Cloud Run o Vercel) sin reescribir lógica de negocio ni modificar vistas.

## Decisión

1. **Estándares abiertos como contrato único de ejecución:**
   - **Cómputo:** Next.js sobre runtime estándar `nodejs` (`Dockerfile` OCI multi-etapa con `PITCHLAB_STANDALONE=1` + `GET /api/health`). Queda prohibido depender de Vercel Edge Runtime propietario, Cloudflare Workers/Pages bindings (`@cloudflare/next-on-pages`), Google Cloud Functions/App Engine o servicios internos de un solo proveedor para rutas de producto.
   - **Detección de entorno remoto (`apps/web/src/server/auth.ts`):** `isHostedRemote()` acepta la bandera neutra `PITCHLAB_HOSTED=1` (o `0` en local) y marcadores estándar de plataformas comunes (Docker/Coolify, Fly, Railway, Render, AWS, Azure, DigitalOcean, Cloud Run, Vercel). La app nunca asume que `VERCEL` o `K_SERVICE` sean las únicas formas de correr en producción.
   - **Base de datos (`packages/db/`):** PostgreSQL 15+ estándar vía `drizzle-orm/postgres-js` (`postgres` TCP/SSL) usando exclusivamente `DATABASE_URL` y migraciones SQL portables (`pnpm --filter @pitchlab/db migrate`). Prohibido importar `@neondatabase/serverless` u otros drivers acoplados a un proveedor.
   - **Almacenamiento de objetos / avatares (`apps/web/src/server/avatar-storage.ts`):** interfaz `AvatarBlobUploader` con prioridad al estándar abierto **S3-compatible (AWS Signature Version 4 sobre `node:crypto` + `fetch`, cero SDKs externos)** —compatible con AWS S3, Backblaze B2, MinIO (autoalojado), DigitalOcean Spaces, Hetzner Object Storage, Tigris, Scaleway y R2— mediante `S3_AVATAR_ENDPOINT`, `S3_AVATAR_BUCKET`, `S3_AVATAR_REGION`, `S3_AVATAR_ACCESS_KEY_ID`, `S3_AVATAR_SECRET_ACCESS_KEY` y `S3_AVATAR_PUBLIC_BASE_URL` (o `AVATAR_PUBLIC_BASE_URL`). Los adaptadores opcionales de GCS (`GCS_AVATAR_BUCKET`) y Vercel Blob (`BLOB_READ_WRITE_TOKEN`, cargado únicamente por `import()` diferido) permanecen aislados y seleccionables por `AVATAR_STORAGE_PROVIDER=s3|gcs|vercel-blob`.
   - **CSP dinámica de medios y anti-abuso (`apps/web/next.config.mjs`):** `img-src` incorpora automáticamente los orígenes HTTPS declarados en `PITCHLAB_MEDIA_ORIGINS`, `AVATAR_PUBLIC_BASE_URL`, `S3_AVATAR_PUBLIC_BASE_URL`, `S3_AVATAR_ENDPOINT` y `GCS_AVATAR_PUBLIC_BASE_URL` sin editar código. Con `PITCHLAB_CAPTCHA_PROVIDER=none`, `next.config.mjs` elimina por completo `https://challenges.cloudflare.com` de `script-src`, `connect-src` y `frame-src`.
   - **Crons y tareas programadas (`apps/web/app/api/cron/*`):** todo job es un endpoint HTTP `GET`/`POST` estándar protegido por `Authorization: Bearer <CRON_SECRET>`. Cualquier planificador externo funciona sin cambios (`crontab` + `curl`, GitHub Actions, AWS EventBridge, Cloud Scheduler, Render Cron, Fly Machines, Vercel Cron). Los manifiestos específicos (`apps/web/vercel.json`, `.github/workflows/deploy-cloud-run.yml`, `scripts/setup-google-cloud.sh`) son adaptadores opcionales, jamás dependencias de la aplicación.
   - **Proxy reverso, IP real y CSRF (`apps/web/src/server/request-security.ts`):** `trustedClientIp()` soporta cabeceras estándar de cualquier borde/proxy (`fly-client-ip`, `true-client-ip`, `x-real-ip`, RFC 7239 `Forwarded`, `x-forwarded-for`, además de `cf-connecting-ip` y `x-vercel-forwarded-for` si estuvieran presentes). `verifySameOriginMutation()` valida `Origin` frente a `Host` + `x-forwarded-proto` y `BETTER_AUTH_URL` detrás de cualquier balanceador TLS (Nginx, Caddy, Traefik, AWS ALB, Fly, Railway, Render, Cloud Run, Cloudflare, Vercel).
   - **Anti-abuso, correo, limitador de tasa y webhooks de despliegue:**
     - Anti-abuso desacoplable vía `PITCHLAB_CAPTCHA_PROVIDER=turnstile|none` (conservando compatibilidad con `PITCHLAB_ALLOW_NO_TURNSTILE_IN_PROD=1` y preparado para sumar otros proveedores como Altcha o hCaptcha tras una interfaz única).
     - Correo encapsulado tras la interfaz `Mailer` (`apps/web/src/server/mailer.ts`) vía HTTP estándar (`fetch`, sin SDK propietario).
     - Limitador de tasa con respaldo acotado en memoria (`checkEndpointRateLimit`) y REST estándar sin SDK.
     - Workflows de datos en GitHub Actions (`.github/workflows/pre-mvp-snapshot.yml` y `odds-refresh.yml`) aceptan el secreto neutro `DEPLOY_HOOK_URL` (con respaldo en `VERCEL_DEPLOY_HOOK_URL`).
2. **Guardrails automáticos permanentes:**
   - `scripts/lint-codebase.mjs` prohíbe importar SDKs de nube propietarios (`@vercel/*`, `@google-cloud/*`, `@cloudflare/*`, `@neondatabase/*`, `@aws-sdk/*`, `aws-sdk`) en `apps/`, `packages/` y `services/` fuera de la lista explícita de adaptadores aislados (`apps/web/src/server/avatar-storage.ts`).
   - `scripts/check-prod-readiness.mjs` audita **capacidades portables** (migraciones SQL, rutas `/api/cron/*`, `/api/health`, `Dockerfile`, `shell-index.json` y variables por capacidad) sin exigir archivos ni variables exclusivas de Vercel, Google Cloud ni Neon.
   - `AGENTS.md` incluye la regla obligatoria de portabilidad para toda sesión futura.

## Matriz de portabilidad (cambio en < 15 min solo con variables de entorno)

| Capacidad | Estándar en el código | Alternativas compatibles sin tocar código |
|---|---|---|
| Cómputo web | Contenedor OCI (`Dockerfile`) o Node.js 22 (`next start`) | VPS/Docker/Coolify, Fly.io, Railway, Render, AWS ECS/App Runner, Azure Container Apps, DigitalOcean, Cloud Run, Vercel |
| Base de datos | PostgreSQL 15+ (`postgres.js` + Drizzle SQL) | PostgreSQL autoalojado, Neon, Supabase, AWS RDS, Cloud SQL, Railway/Render/DO Managed Postgres |
| Almacenamiento media | HTTP S3 SigV4 (`node:crypto`) + adaptadores opcionales | AWS S3, Backblaze B2, MinIO (VPS), DO Spaces, Hetzner Object Storage, Tigris, Scaleway, R2, GCS, Vercel Blob |
| Crons | HTTP `GET`/`POST` + `Authorization: Bearer $CRON_SECRET` | Linux `crontab`, GitHub Actions, AWS EventBridge, Cloud Scheduler, Render Cron, Fly, Vercel Cron |
| TLS / Proxy / CDN | `Host` + `x-forwarded-proto` + `BETTER_AUTH_URL` + `Forwarded`/`X-Real-IP` | Caddy, Nginx, Traefik, AWS ALB/CloudFront, Fastly, Fly Proxy, Cloud Run LB, Cloudflare, Vercel |
| Anti-abuso | `PITCHLAB_CAPTCHA_PROVIDER=turnstile|none` | Turnstile opcional, desactivable sin fugas CSP, extensible a Altcha/hCaptcha |
| Despliegue tras datos | `DEPLOY_HOOK_URL` (HTTP `POST`) o webhook OCI | Cualquier plataforma con deploy hook o registro de contenedores |

## Alternativas descartadas

- **Usar SDKs nativos de una sola nube (`@google-cloud/storage`, `@aws-sdk/client-s3`, `@neondatabase/serverless`, `@cloudflare/next-on-pages`):** descartado por inflar el árbol de dependencias, introducir acoplamiento de runtime y encarecer migraciones.
- **Eliminar archivos opcionales de Vercel o Google Cloud ya escritos (`vercel.json`, `deploy-cloud-run.yml`, `setup-google-cloud.sh`):** descartado; conservarlos como adaptadores opt-in inactivos mientras no se configuren sus variables mantiene flexibilidad sin crear dependencia.

## Consecuencias

- Migrar PitchLab de un hosting a otro consiste en desplegar la imagen `Dockerfile` (o Node 22), apuntar `DATABASE_URL` y variables de entorno estándar, y registrar los 5 endpoints HTTP `/api/cron/*` en el planificador elegido.
- Ningún cambio futuro puede introducir lock-in accidental sin fallar `node scripts/lint-codebase.mjs` en local y CI.
