# Guía de Despliegue del Pre-MVP — PitchLab

Esta guía describe los pasos exactos para publicar el pre-MVP de PitchLab en **Vercel (Hobby / Free)** con actualización automática de datos mediante **GitHub Actions** a costo **$0 USD/mes**.

---

## 1. Requisitos previos

1. Cuenta en [Vercel](https://vercel.com) conectada al repositorio de GitHub.
2. El repositorio debe tener la rama `feat/pre-mvp` (o fusionada a tu rama principal).

---

## 2. Importar el proyecto en Vercel

1. En Vercel, haz clic en **Add New… → Project** y selecciona el repositorio de **PitchLab**.
2. Configura los ajustes del proyecto:
   - **Framework Preset:** `Next.js`
   - **Root Directory:** `apps/web`
   - **Install Command:** `pnpm install`
   - **Build Command:** `cd ../.. && pnpm build`
3. Antes de desplegar, agrega las variables de entorno en **Environment Variables**:

| Variable | Requerida | Descripción |
| --- | --- | --- |
| `PREVIEW_ACCESS_CODE` | **Sí** | Código PIN numérico de 4 dígitos para tus socios (ej. `4829`). |
| `BETA_COOKIE_SECRET` | **Sí** | Secreto de al menos 32 caracteres para firmar la cookie `pl_beta`. Genéralo en tu terminal con `openssl rand -hex 32`. |
| `API_FOOTBALL_KEY` | Opcional | Clave de API-Football para activar Liga MX en vivo. Si no se define, Liga MX se muestra limpiamente como `"Pronto"` y el panel abre en Premier League y NFL. |
| `UPSTASH_REDIS_REST_URL` | Opcional | URL REST de Upstash Redis para rate-limit distribuido (si no se define, usa memoria en el runtime). |
| `UPSTASH_REDIS_REST_TOKEN` | Opcional | Token REST de Upstash Redis. |

4. Haz clic en **Deploy**.

---

## 3. Cómo rotar el código PIN de acceso

Cuando quieras cambiar el PIN de 4 dígitos o revocar todas las sesiones activas:

- **Para cambiar únicamente el PIN de nuevos ingresos:**
  1. Ve a **Vercel → Project Settings → Environment Variables**.
  2. Edita `PREVIEW_ACCESS_CODE` con el nuevo PIN de 4 dígitos.
  3. Ejecuta un **Redeploy** en Vercel.
- **Para cerrar todas las sesiones abiertas inmediatamente:**
  1. Genera un nuevo secreto con `openssl rand -hex 32`.
  2. Actualiza `BETA_COOKIE_SECRET` en Vercel y haz **Redeploy**. Todas las cookies `pl_beta` emitidas con el secreto anterior quedarán invalidadas al instante.

---

## 4. Configurar la actualización automática de snapshots (GitHub Actions)

El workflow `.github/workflows/pre-mvp-snapshot.yml` descarga los calendarios y marcadores oficiales de `nflverse` y `openfootball` (y `API-Football` si está configurada), recalcula los modelos estadísticos en `packages/engines-reference` y actualiza `data/snapshots/**`.

1. En tu repositorio de GitHub, ve a **Settings → Secrets and variables → Actions**.
2. (Opcional) En Vercel, crea un **Deploy Hook** en **Project Settings → Git → Deploy Hooks** (nombre: `snapshot-update`, rama: `feat/pre-mvp` o `main`) y copia la URL.
3. En GitHub Actions Secrets, agrega:
   - `VERCEL_DEPLOY_HOOK_URL`: la URL del Deploy Hook de Vercel.
   - `API_FOOTBALL_KEY` (opcional): tu clave de API-Football si deseas habilitar Liga MX.
4. Para ejecutar un corte manual en cualquier momento:
   - Ve a la pestaña **Actions → Pre-MVP Snapshot Pipeline → Run workflow** en GitHub, o ejecuta `pnpm snapshot` localmente.
