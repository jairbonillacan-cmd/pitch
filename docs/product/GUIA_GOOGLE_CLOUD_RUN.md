# Guía de despliegue en Google Cloud Run (con candados anti-sobrecargo)

Esta guía documenta la arquitectura de producción de **PitchLab** en **Google Cloud Run + Cloud Scheduler + Cloud Storage**, manteniendo tu base de datos en **Neon** (`lively-cloud-08121218`, región `us-east-1`) y diseñada para operar dentro del nivel gratuito (*Always Free*) más tus créditos mensuales de **Google Developer Program / Google AI Pro** (\$10 USD / ~\$186 MXN al mes).

---

## 1. Candados anti-sobrecargo ya integrados en el código y deploy

Cada punto siguiente existe para evitar las trampas típicas de facturación en Google Cloud:

| Recurso | Configuración aplicada | Por qué evita cobros de más |
| :--- | :--- | :--- |
| **Cloud Run** (`us-east4`, Virginia) | `--min-instances=0`, `--max-instances=3`, `--cpu=1`, `--memory=1Gi`, `--concurrency=80`, `--timeout=120`, `--cpu-throttling`, `--cpu-boost` | Escala a **0** sin tráfico (**\$0 en reposo**); `max-instances=3` pone un **techo duro** ante bots o picos virales; `cpu-throttling` solo cobra CPU mientras atiende una petición; `us-east4` queda pegado a Neon `us-east-1` (latencia mínima). |
| **Sonda de salud** (`/api/health`) | Respuesta JSON ligera en `< 2 ms` sin tocar Neon | Evita despertar o saturar conexiones de Neon en revisiones de salud. |
| **Artifact Registry** (`us-east4`) | Política automática: **conservar solo 3 imágenes** y borrar versiones > 24 h | Evita la trampa #1 de GCP (acumular cientos de imágenes Docker que rebasan el nivel gratis de 0.5 GB). |
| **Builds Docker** | Construidos en **GitHub Actions** (`docker/build-push-action` con caché GHA) | **\$0 en Cloud Build** y deploys incrementales en ~2–4 min; si `pre-mvp-snapshot` u `odds-refresh` no cambiaron datos, `deploy-cloud-run.yml` se salta en 5 segundos. |
| **Cloud Storage** (avatares) | Bucket Standard en **`us-east1`** + `Cache-Control: public, max-age=31536000, immutable` | **`us-east1`** entra en los **5 GB Always Free** (multi-región `US` o `us-east4` NO son Always Free). El caché de 1 año reduce el tráfico de salida casi a cero. |
| **Cloud Scheduler** (5 crons) | `--max-retry-attempts=1`, `--attempt-deadline=120s` | 3 crons gratis + 2 extra = **\$0.20 USD/mes** fijos en total (incluyendo `push-alerts` cada 30 min y `settle-picks` cada 4 h). Limitar reintentos a 1 impide bucles ante errores. |
| **Variables de entorno** | Variables cifradas directo en Cloud Run (sin Secret Manager) | Ahorra ~\$1 USD/mes de versiones de Secret Manager sin comprometer seguridad (cifradas en reposo y nunca en Git). |
| **Base de datos** | **Neon** actual (NO Cloud SQL) | Cloud SQL cobra por hora incluso sin tráfico (~\$10–\$30 USD/mes); Neon sigue en tu plan actual. |
| **Presupuesto en Billing** | Alerta mensual configurada en **\$150 MXN** (50 %, 90 %, 100 %) con créditos promocionales desmarcados | Te avisa por correo antes de acercarte a tu crédito mensual de \$186.84 MXN. |

---

## 2. Qué se preparó en el repositorio (sin romper Vercel ni local)

- **[Dockerfile](../../Dockerfile)** y **[.dockerignore](../../.dockerignore)**: imagen multi-etapa `node:22-slim` (usuario no-root `nextjs`), compila `@pitchlab/web` con `PITCHLAB_STANDALONE=1` y empaqueta `data/snapshots/`, `data/history/*.jsonl`, `data/health/`, `data/odds_timeseries/`, `packages/spacetime/data/live_matchday_v3_snapshot.json`, `apps/web/content/blog/` y `apps/web/public/`.
- **[apps/web/app/api/health/route.ts](../../apps/web/app/api/health/route.ts)**: endpoint `GET /api/health` (`200 OK`, `Cache-Control: no-store`).
- **[apps/web/src/server/avatar-storage.ts](../../apps/web/src/server/avatar-storage.ts)**: soporte nativo para **Google Cloud Storage** usando el servidor de metadatos interno de Cloud Run (cero paquetes npm extra, cero llaves JSON) cuando `GCS_AVATAR_BUCKET` está configurado; conserva `@vercel/blob` como respaldo.
- **[apps/web/next.config.mjs](../../apps/web/next.config.mjs)**: habilita `output: "standalone"` solo cuando `PITCHLAB_STANDALONE=1` y autoriza `https://storage.googleapis.com` en la CSP `img-src`.
- **[apps/web/src/server/auth.ts](../../apps/web/src/server/auth.ts)** y **[apps/web/src/server/request-security.ts](../../apps/web/src/server/request-security.ts)**: tratan Cloud Run (`K_SERVICE`) con las mismas guardias de producción que Vercel y reconocen `x-forwarded-proto: https` detrás del balanceador TLS de Cloud Run.
- **[.github/workflows/deploy-cloud-run.yml](../../.github/workflows/deploy-cloud-run.yml)**: despliegue automático en cada `push` a `main`, tras actualizaciones reales de `Pre-MVP Snapshot Pipeline` u `Odds Auto-Refresh Pipeline`, y botón manual (`workflow_dispatch`). Mientras no definas `vars.GCP_PROJECT_ID`, se omite limpiamente sin fallar.
- **[scripts/setup-google-cloud.sh](../../scripts/setup-google-cloud.sh)**: asistente interactivo paso a paso para ejecutar una sola vez.

---

## 3. Cómo activar Google Cloud Run (1 sola vez, ~15 minutos)

1. **Instala Google Cloud CLI en tu Mac** (si aún no la tienes):
   ```bash
   brew install --cask google-cloud-sdk
   ```
   *(Cierra y reabre tu Terminal si te lo pide para que `gcloud` quede en el `PATH`).*

2. **Corre el asistente guiado desde la raíz del proyecto:**
   ```bash
   cd /Users/jairbonilla/Desktop/Pitch
   ./scripts/setup-google-cloud.sh
   ```
   El asistente crea en orden: APIs → Artifact Registry con limpieza automática → bucket de avatares `us-east1` → Workload Identity Federation sin llaves JSON → variables `GCP_*` en GitHub Actions → primer deploy → los 5 crons en Cloud Scheduler.

3. **Carga tus variables de runtime en Cloud Run** (Consola de Google Cloud → Cloud Run → `pitchlab-web` → *Editar e implementar nueva revisión* → *Variables y secretos*):
   - **Obligatorias de arranque:** `DATABASE_URL` (de tu Neon `main`), `BETTER_AUTH_SECRET` (≥ 32 chars), `BETTER_AUTH_URL` (`https://tu-dominio` o la URL `.a.run.app`), `CRON_SECRET`, `RESEND_API_KEY`, `GCS_AVATAR_BUCKET` (el que creó el asistente).
   - **Seguridad y acceso:** `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (o `PITCHLAB_ALLOW_NO_TURNSTILE_IN_PROD=1` solo mientras conectas Turnstile), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
   - **Cobro SPEI y Admin:** `PITCHLAB_PAYMENTS_MODE=transfer`, `PITCHLAB_TRANSFER_BANK`, `PITCHLAB_TRANSFER_BENEFICIARY`, `PITCHLAB_TRANSFER_CLABE`, `PITCHLAB_ADMIN_EMAILS`, `EMAIL_NOREPLY_FROM=PitchLab <noreply@pitchlab.mx>`.
   - **Web Push y bajas de correo (opcional hasta generar llaves):** `VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:soporte@pitchlab.mx`, `UNSUBSCRIBE_SECRET`.

4. **Dominio personalizado (`pitchlab.mx`) + CDN gratis (recomendado al abrir al público):**
   - En Cloud Run → *Administrar dominios personalizados* (o mapeo de dominio de Cloud Run) conecta `pitchlab.mx`.
   - Si usas **Cloudflare Free** delante de tu dominio (proxy naranja encendido), Cloudflare sirve gratis los archivos estáticos (`/brand/*`, `/icons/*`, `/_next/static/*`) desde servidores en México/LatAm, bajando todavía más el tráfico y el costo de salida de Cloud Run.

---

## 4. Operación diaria después de migrar

- **Subir cambios:** `git push` a `main` → GitHub Actions construye y despliega en Cloud Run en 2–4 minutos y verifica `/api/health`.
- **Actualizar cuotas/partidos:** `pre-mvp-snapshot.yml` y `odds-refresh.yml` suben el corte a `main` y `deploy-cloud-run.yml` redespliega automáticamente solo cuando hubo cambios reales.
- **Revertir si algo falla:** Cloud Run → `pitchlab-web` → *Revisiones* → elegir la revisión anterior → *Administrar tráfico* → 100 % (instantáneo).
