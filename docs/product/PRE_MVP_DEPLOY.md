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
| `PITCHLAB_BETA_CODE` | **Sí** | Código numérico de 4 dígitos que compartes con los socios. **Nunca lo escribas en el repo**, solo aquí. Sin esta variable, `/app` responde 500 (falla cerrado). Nombre anterior aceptado: `PREVIEW_ACCESS_CODE`. |
| `PITCHLAB_COOKIE_SECRET` | **Sí** | Secreto de al menos 32 caracteres para firmar la cookie `pl_beta`. Genéralo con `openssl rand -hex 32`. Nombre anterior aceptado: `BETA_COOKIE_SECRET`. |
| `UPSTASH_REDIS_REST_URL` | **Recomendada** | URL REST de Upstash Redis (plan gratis). Sin ella, el límite de 5 intentos por IP vive en la memoria de cada instancia de Vercel y un atacante puede probar más códigos repartiéndose entre instancias. Con 4 dígitos (10,000 combinaciones) esto importa. El servidor avisa en los logs si falta. |
| `UPSTASH_REDIS_REST_TOKEN` | **Recomendada** | Token REST de Upstash Redis. |
| `API_FOOTBALL_KEY` | Opcional | Clave de API-Football para Liga MX en vivo. |
| `FOOTBALL_DATA_API_KEY` | Opcional | Clave de football-data.org para Premier League. |

4. Haz clic en **Deploy**.

---

## 3. Cómo rotar el código de acceso

La firma de la cookie incluye el código vigente, así que **cambiar el código cierra todas las sesiones abiertas**:

1. Ve a **Vercel → Project Settings → Environment Variables**.
2. Edita `PITCHLAB_BETA_CODE` con el nuevo código y ejecuta **Redeploy**.
3. Comparte el nuevo código con los socios que deben seguir dentro.

Si sospechas que el secreto se filtró, rota también `PITCHLAB_COOKIE_SECRET` (`openssl rand -hex 32`) y haz **Redeploy**.

---

## 4. Configurar la actualización automática de snapshots (GitHub Actions)

El workflow `.github/workflows/pre-mvp-snapshot.yml` descarga los calendarios y marcadores oficiales de `nflverse` y `openfootball` (y `API-Football` si está configurada), recalcula el modelo (`packages/models`) y actualiza `data/snapshots/**`.

> **Importante:** GitHub solo ejecuta los `schedule` (cron) de workflows que están en la **rama por defecto** del repositorio (hoy `main`). Mientras el pre-MVP viva solo en `feat/pre-mvp`, el cron **no corre**; únicamente funciona el botón manual *Run workflow*. Para activarlo, fusiona `feat/pre-mvp` a `main` (vía PR) o cambia la rama por defecto en **Settings → General → Default branch**. El workflow hace commit de los snapshots en la misma rama donde corre, así que el proyecto de Vercel debe desplegar esa rama.

1. En tu repositorio de GitHub, ve a **Settings → Secrets and variables → Actions**.
2. (Opcional) En Vercel, crea un **Deploy Hook** en **Project Settings → Git → Deploy Hooks** (nombre: `snapshot-update`, rama: `feat/pre-mvp` o `main`) y copia la URL.
3. En GitHub Actions Secrets, agrega:
   - `VERCEL_DEPLOY_HOOK_URL`: la URL del Deploy Hook de Vercel.
   - `API_FOOTBALL_KEY` (opcional): tu clave de API-Football si deseas habilitar Liga MX.
   - `FOOTBALL_DATA_API_KEY` (opcional): tu clave de football-data.org para Premier League.
4. Para ejecutar un corte manual en cualquier momento:
   - Ve a la pestaña **Actions → Pre-MVP Snapshot Pipeline → Run workflow** en GitHub, o ejecuta `pnpm snapshot` localmente.
