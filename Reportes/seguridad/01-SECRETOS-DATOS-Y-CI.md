# 01 — Secretos, Datos Sensibles, Variables de Entorno e Higiene CI/CD

Este documento detalla los hallazgos relacionados con exposición de credenciales, manejo de variables de entorno, flujos de GitHub Actions, almacenamiento local en navegador y limpieza de artefactos versionados.

---

## SEC-05 [Alta] — `.env.example` incluye secreto y PIN que pasan validación en producción

> *Complementado en [02-CERO-FUGA-AUTH-Y-APIS.md](02-CERO-FUGA-AUTH-Y-APIS.md#sec-05) respecto al alcance funcional de `pl_beta`.*

- **Ubicaciones:**
  - [`.env.example`](.env.example#L2-L5): `PITCHLAB_BETA_CODE=2026` (línea 2) y `PITCHLAB_COOKIE_SECRET=reemplazar-con-secreto-aleatorio-de-32-caracteres-minimo` (línea 5).
  - [`apps/web/src/server/beta-auth.ts`](apps/web/src/server/beta-auth.ts#L21-L41)
  - [`.claude/launch.json`](.claude/launch.json#L50-L51), [`scripts/local-9990.ps1`](scripts/local-9990.ps1#L40-L41), [`apps/web/playwright.config.ts`](apps/web/playwright.config.ts#L38-L39)
- **Evidencia y flujo:**
  - `getBetaCookieSecret()` en `beta-auth.ts` únicamente valida `envSecret.trim().length >= 32`.
  - La cadena de ejemplo `reemplazar-con-secreto-aleatorio-de-32-caracteres-minimo` tiene **56 caracteres**, por lo que supera la comprobación de longitud en `NODE_ENV === "production"` sin lanzar error. Lo mismo sucede con los secretos estáticos de pruebas locales en `.claude/launch.json:51` (`"e2e-test-pitchlab-beta-cookie-secret-32chars!"`) y `scripts/local-9990.ps1:41` (`"local-9990-pitchlab-beta-cookie-secret-32chars!"`).
  - Además, existe dualidad de nombres sin documentar en `.env.example`: el código acepta `PITCHLAB_BETA_CODE` / `PREVIEW_ACCESS_CODE` y `PITCHLAB_COOKIE_SECRET` / `BETA_COOKIE_SECRET`.
- **Impacto:** Cualquier despliegue inicializado copiando `.env.example` sin rotar ambos valores queda expuesto al PIN público `2026` y a falsificación offline de cookies HMAC `pl_beta` válidas por 30 días.
- **Remediación defensiva:** Dejar vacíos `PITCHLAB_BETA_CODE=` y `PITCHLAB_COOKIE_SECRET=` en `.env.example`, rechazar explícitamente cadenas conocidas de ejemplo/pruebas en `beta-auth.ts` y unificar el nombrado hacia `PITCHLAB_*`.

---

## SEC-09 [Media] — Omitir `BETTER_AUTH_URL` evade el bloqueo de producción y registra enlaces mágicos en `stdout`

- **Ubicaciones:**
  - [`apps/web/src/server/auth.ts`](apps/web/src/server/auth.ts#L52-L54) (`consoleSender`)
  - [`apps/web/src/server/auth.ts`](apps/web/src/server/auth.ts#L180-L210) (`isLocalBaseURL`, `getAuth`)
- **Evidencia y flujo:**
  - `getAuth()` asigna `const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";` (`auth.ts:197`) **antes** de verificar `!resendKey && process.env.NODE_ENV === "production" && !isLocalBaseURL(baseURL)` (`auth.ts:199-201`).
  - Si en un entorno de producción se omiten tanto `BETTER_AUTH_URL` como `RESEND_API_KEY`, `isLocalBaseURL("http://localhost:3000")` retorna `true`, evitando la excepción fatal de arranque y seleccionando `consoleSender` (`auth.ts:52-54, 210`).
  - Asimismo, `getAuth()` (`auth.ts:189-191`) acepta cualquier `BETTER_AUTH_SECRET` no vacío sin verificar longitud mínima de 32 caracteres.
- **Impacto:** Los enlaces mágicos de un solo uso (con su token de autenticación y correo del usuario, incluidas cuentas de `PITCHLAB_ADMIN_EMAILS`) se escriben en texto claro en `stdout`/drenajes de logs de producción.
- **Remediación defensiva:** Exigir `process.env.BETTER_AUTH_URL` explícitamente (y que no sea loopback) cuando `NODE_ENV === "production"` salvo bandera explícita de pruebas locales, validar `BETTER_AUTH_SECRET.trim().length >= 32` y prohibir `consoleSender` en producción.

---

## SEC-10 [Media] — Sincronización y ejecución de código `.ts` entre ramas con `contents: write` y secretos en CI

- **Ubicaciones:**
  - [`.github/workflows/pre-mvp-snapshot.yml`](.github/workflows/pre-mvp-snapshot.yml#L11-L85)
  - [`packages/spacetime/scripts/sync-from-prediction-lab.mjs`](packages/spacetime/scripts/sync-from-prediction-lab.mjs#L11-L70)
  - [`.github/workflows/ci.yml`](.github/workflows/ci.yml#L1-L42)
- **Evidencia y flujo:**
  - `pre-mvp-snapshot.yml` se ejecuta cada 6 horas o manualmente con permisos globales de job `permissions: contents: write` (`lines 11-12`) y acceso a `FOOTBALL_DATA_API_KEY` y `VERCEL_DEPLOY_HOOK_URL`.
  - Descarga código de `origin/prediction-lab`, copia archivos `.ts` y `.test.ts` en `packages/spacetime/src` (`sync-from-prediction-lab.mjs`), ejecuta `vitest run` sobre ese código no revisado (`line 54`), realiza `git push` directo sin revisión de PR (`lines 70-75`) y ejecuta `curl -fsSL -X POST "$VERCEL_DEPLOY_HOOK_URL"` (`line 84`, donde `-S` puede imprimir la URL completa con el token secreto en `stderr` si falla DNS/TLS/HTTP).
  - Usa acciones de terceros con etiqueta mutable (`@v4`) en lugar de SHA completo de 40 caracteres.
  - Por su parte, `ci.yml` no declara `permissions: contents: read` explícito y omite `gitleaks` y `pnpm audit --audit-level=high` comprometidos en `docs/architecture/SECURITY.md`.
- **Impacto:** Un compromiso o empuje indebido en `prediction-lab` ejecuta código arbitrario en el runner de CI con permisos de escritura y secretos productivos, inyectando cambios TypeScript directos en el despliegue sin revisión.
- **Remediación defensiva:** Sincronizar solo artefactos de datos JSON validados por esquema (o abrir un Pull Request automático en lugar de `git push` directo); reducir permisos del job a `contents: read`; fijar GitHub Actions por commit SHA; invocar `curl` pasando la URL vía stdin (`--config -`) sin `-S` ni eco de URL; añadir `gitleaks` y `pnpm audit --audit-level=high` en `ci.yml`.

---

## SEC-14 [Baja] — Clave de terceros, DSN Sentry, código `[REDACTED_PIN]` sin redactar, logs `.local/9990.log` e ID de Neon en Git

- **Ubicaciones:**
  - Clave Firebase/Google (`AIzaSyB2...`) y DSN de Sentry (`o4504614045024256.ingest.us.sentry.io`) de LineMate en [`Reportes/analisis-linemate/app/main.1f0201a8.js`](Reportes/analisis-linemate/app/main.1f0201a8.js#L2), [`Reportes/analisis-linemate/evidence/javascript/main.1f0201a8.js`](Reportes/analisis-linemate/evidence/javascript/main.1f0201a8.js#L2), [`research/linemate/evidence/javascript/main.1f0201a8.js`](research/linemate/evidence/javascript/main.1f0201a8.js#L2) e identificadores Firebase en `extracted_src/firebase.js:24-25`.
  - Redacción incompleta del código `[REDACTED_PIN]` (AztecaVet / TouchIQ): el commit histórico `9133809` (`9133809:scripts/redact_secrets.mjs`, borrado en `5938687`) solo limpió parte de `research/aztecavet/*.md`, dejando `[REDACTED_PIN]` visible en múltiples reportes y scripts JS (`Reportes/00-REPORTE-COMPLETO.md:21`, `Reportes/analisis-aztecavet/*`, `research/aztecavet/authentication-flow.md:44`, `research/aztecavet/evidence/javascript/*`, `research/touchiq/*`).
  - Escritura de magic links en texto claro a `.local/9990.log` y proyecto de Neon `<NEON_PROJECT_ID>` / `--database-name neondb` fijados en [`scripts/local-9990.ps1`](scripts/local-9990.ps1#L34-L67), [`scripts/migrate-9990.ps1`](scripts/migrate-9990.ps1#L6) y [`apps/web/src/server/auth.ts`](apps/web/src/server/auth.ts#L56-L62) (`local9990Sender` cuando `isLocalBaseURL(baseURL) && new URL(baseURL).port === "9990"`).
- **Impacto:** Dispara alertas en escáneres automáticos (`gitleaks`/Push Protection), expone identificadores de infraestructura Neon y deja enlaces de sesión activos en `.local/9990.log` legible por procesos locales.
- **Remediación defensiva:** Mover `NEON_PROJECT_ID` y `NEON_DATABASE_NAME` a `.env.local`; redactar todas las menciones restantes de `[REDACTED_PIN]`; sacar los bundles capturados de terceros del historial si el repo se compartirá con terceros (`git filter-repo`); acotar permisos de `.local/9990.log` (`0o600` / ACL de propietario).

---

## SEC-15 [Baja] — Persistencia de PII fiscal CFDI en `localStorage` del navegador

> *La validación fiscal y manejo de errores en servidor se detallan en [03-PAGOS-WEBHOOKS-Y-DB.md](03-PAGOS-WEBHOOKS-Y-DB.md#sec-15).*

- **Ubicaciones:**
  - [`packages/ui/src/platform/club/account/account-helpers.ts`](packages/ui/src/platform/club/account/account-helpers.ts#L8) (`CFDI_STORAGE_KEY = "pl-cfdi-v1"`)
  - [`packages/ui/src/platform/club/account/BillingTab.tsx`](packages/ui/src/platform/club/account/BillingTab.tsx#L62-L69) (`writeStoredCfdiDraft`)
- **Evidencia y flujo:** El formulario de facturación guarda en texto claro dentro de `window.localStorage` (`pl-cfdi-v1`) los campos `rfc`, `razonSocial`, `regimenFiscal`, `usoCfdi` y `cpFiscal`, sin cifrado ni limpieza automática al cerrar sesión.
- **Impacto:** Exposición de datos fiscales personales (PII) en equipos compartidos o ante cualquier futuro fallo XSS en el origen.
- **Remediación defensiva:** Eliminar el almacenamiento en `localStorage` de `rfc` y razón social una vez conectado el guardado en servidor sobre `cfdi_profiles`, o limitar el borrador a memoria de React.

---

## SEC-16 [Baja] — Interruptor de privacidad `publicProfile` solo persiste en navegador mientras `/api/u/[handle]` es público

- **Ubicaciones:**
  - [`packages/ui/src/platform/club/account/PrefsTab.tsx`](packages/ui/src/platform/club/account/PrefsTab.tsx#L96) (`key: "publicProfile"`, persistido solo en `localStorage` bajo `pl-prefs-v1`)
  - [`apps/web/app/api/u/[handle]/route.ts`](apps/web/app/api/u/[handle]/route.ts#L7-L10)
  - [`packages/db/src/profiles.ts`](packages/db/src/profiles.ts#L16-L25) (`publicProfileByHandle`)
- **Evidencia y flujo:** El usuario puede desactivar el toggle "Perfil público" en su panel de preferencias, creyendo ocultar su perfil, pero la preferencia jamás se envía ni almacena en PostgreSQL; `GET /api/u/[handle]` sirve cualquier perfil adulto registrado sin comprobar ninguna bandera de visibilidad.
- **Impacto:** Falsa expectativa de privacidad (brecha frente a principios LFPDPPP de control de visibilidad por el titular).
- **Remediación defensiva:** Persistir `is_public_profile` en la tabla `users` vía `PATCH /api/me/profile` / `/api/me/preferences` y verificarlo dentro de `publicProfileByHandle` (retornando `404` cuando esté desactivado).

---

## SEC-18 [Baja] — Código fuente de competidores (`extracted_src/`), rutas locales, `.gitignore` y `turbo.json` incompletos

- **Ubicaciones:**
  - **Rutas de estación de trabajo y correos personales en `docs/`, `prompts/`, `Reportes/` y Storybook:** `65+` archivos con rutas `<USER_HOME>/...`, `<REPO_ROOT>/...`, `<REPO_ROOT>` y correos `jair@pitchlab.mx` / `ejemplo+alias@gmail.com`. *(Nota: los RFC presentes en código, como `XAXX010101000` y `LOMA850101AB1`, son genéricos/sintéticos de prueba; no hay PII real de clientes.)*
  - **Artefactos de competidores (`756` archivos):** copias duplicadas de `extracted_src/` (378 + 378 archivos) y source maps `main.1f0201a8.js.map` (~15 MB) en `research/linemate/` y `Reportes/analisis-linemate/`, `packages/engines-reference/reference/aztecavet/`, y binario redundante `pitchlab-brand.zip` (1.22 MB).
  - **Cobertura incompleta de `.gitignore`:** [`.gitignore`](.gitignore#L18-L20) ignora `.env`, `.env.local` y `.env.*.local`, pero **no** `.env.production`, `.env.staging`, `.env.development` ni `.env.test`.
  - **Falta de declaración `env`/`globalEnv` en `turbo.json`:** [`turbo.json`](turbo.json#L1-L26) no declara variables de entorno para `turbo@^2.11.10`.
  - **Linting desactivado en build y alcance parcial:** [`apps/web/next.config.mjs`](apps/web/next.config.mjs#L14-L16) fija `eslint: { ignoreDuringBuilds: true }`, y `scripts/lint-codebase.mjs` excluye paquetes como `packages/db`, `packages/spacetime`, `packages/models` y `packages/emails`.
- **Remediación defensiva:** Sustituir `.env` específicos por `.env*` + `!.env.example` en `.gitignore`; declarar `globalEnv`/`env` en `turbo.json`; retirar `extracted_src/`, `*.js.map` y `pitchlab-brand.zip` fuera del repositorio productivo; normalizar rutas locales a `<REPO_ROOT>` y usar correos ficticios (`socio@ejemplo.mx`).

---

## Reconciliación completa de variables de entorno

| Categoría | Variables y ubicación verificada | Riesgo / Nota |
|---|---|---|
| **Única variable pública `NEXT_PUBLIC_*`** | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (`.env.example:47`, `auth.ts:216`) | **Limpio:** no hay secretos privados con prefijo `NEXT_PUBLIC_`. |
| **Nombres duales / heredados** | `PITCHLAB_BETA_CODE` vs `PREVIEW_ACCESS_CODE`; `PITCHLAB_COOKIE_SECRET` vs `BETA_COOKIE_SECRET` (`.env.example:2,5`, `scripts/local-9990.ps1:40-41`, `.claude/launch.json:50-51`, `beta-auth.ts:22,33`) | Riesgo de desalineación entre local, CI y producción. |
| **Leídas en código / CI pero ausentes de `.env.example`** | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (`beta-auth.ts:159-160`), `VERCEL_DEPLOY_HOOK_URL` (`pre-mvp-snapshot.yml`), `REGISTER_DEMO_ADAPTER`, `PITCHLAB_DIST_DIR`, `PITCHLAB_DEV_3232`, `DRIZZLE_OUT`, `SNAPSHOT_DATE`, `SNAPSHOT_TIMESTAMP`, `MODEL_VERSION`, `MODEL_NFL_PRIOR` | La ausencia de `UPSTASH_REDIS_*` en `.env.example` provoca degradación silenciosa a memoria por instancia en Vercel. |
| **Documentadas en `.env.example` sin consumidor activo actual** | `API_FOOTBALL_KEY` (`.env.example:8` — Liga MX migró a ESPN en `services/ingest/src/cli.ts`), `FACTURAPI_KEY` (`.env.example:71` — `cfdi.ts` aún no está montado en una ruta API) | Evitar aprovisionar claves innecesarias o documentar claramente su estado inactivo. |
| **Prometidas en `DEPLOYMENT.md` no implementadas o renombradas** | Validador Zod `packages/config/env.ts` inexistente; `AI_MODEL_DEFAULT` renombrado a `OPENROUTER_MODEL`; diferencia en `EMAIL_FROM` (`hola@pitchlab.mx` vs `acceso@pitchlab.mx` vs `no-reply@pitchlab.mx`) | Sin validador Zod al arranque ocurren silenciosamente `SEC-08`, `SEC-09` y degradación de Upstash. |
