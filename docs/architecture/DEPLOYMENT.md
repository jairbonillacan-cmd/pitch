# Despliegue y entornos

> **Propósito:** cómo se construye, prueba y publica PitchLab en pitchlab.mx.
> **Consumidores:** el owner de F4, CI y los agentes (cada PR genera un preview).
> **Fecha:** 2026-11-08 · **Nada de esto está configurado aún**: DNS, correo y cuentas de servicio se crean en F4 y requieren acciones del fundador (§6).

## 1. Entornos

| Entorno | URL | DB | Datos | Uso |
|---|---|---|---|---|
| Local | `localhost:3000` | Branch Neon personal o Postgres local (Docker) | Seeds demo y fixtures de proveedores grabados | Desarrollo |
| Preview (por PR) | `*.vercel.app` (protegido) | **Branch Neon por PR** (creado y borrado en CI) | Seeds demo | Revisión de cada agente y Storybook |
| Staging | `staging.pitchlab.mx` | Neon branch `staging` | Ingestas reales (fuentes gratuitas) | QA, E2E y SLA de frescura (MVP §4) |
| Producción | `pitchlab.mx` | Neon `main` | Ingestas reales | Usuarios |

## 2. CI/CD (GitHub Actions)

| Workflow | Disparador | Pasos |
|---|---|---|
| `ci.yml` | PR y push | install (pnpm, caché) → lint (ESLint, boundaries, solo tokens, sin `catch {}`) → typecheck → Vitest → build → Storybook build y test (interacción y axe) → snapshots visuales de Playwright → E2E sobre el preview → gitleaks → `pnpm audit` |
| `db-migrate.yml` | Merge a `main` y a staging | Drizzle migrate. Si una migración es destructiva, requiere la etiqueta `migration-approved`. |
| `ingest-*.yml` | cron (`DATA_ARCHITECTURE.md` §2) | Jobs de ingesta con presupuesto y registro en `ingestion_run` |
| `models-*.yml` | cron / manual | Predicción, evaluación y backtests (Python con uv) |
| `backup.yml` | Diario | `pg_dump` a R2 |
| `lint-prompts.yml` | PR que toca `prompts/` | Linter de prompts (F5) |

**Producción:** se despliega con merge a `main`, siempre que la CI esté en verde. Vercel crea el deploy y el rollback es instantáneo (promover el deploy anterior).

## 3. Variables de entorno (nombres; los valores nunca van al repo)

| Variable | Dónde |
|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Vercel y Actions |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=https://pitchlab.mx` | Vercel |
| `GOOGLE_CLIENT_ID/SECRET`, `APPLE_*` | Vercel |
| `ODDS_API_KEY`, `API_FOOTBALL_KEY` | Actions (los jobs). **Nunca en Vercel cliente.** |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Actions y Vercel (servidor) |
| `UPSTASH_REDIS_REST_URL/TOKEN` | Vercel |
| `RESEND_API_KEY`, `EMAIL_FROM=no-reply@pitchlab.mx` | Vercel |
| `NEXT_PUBLIC_POSTHOG_KEY`, `POSTHOG_PERSONAL_API_KEY` (flags en el servidor) | Vercel |
| `SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | Vercel y Actions |
| `BILLING_PROVIDER`, `STRIPE_*` o `MERCADOPAGO_*` | Vercel (cuando se decida FD-06) |
| `OPENROUTER_API_KEY`, `AI_MODEL_DEFAULT`, `AI_MODEL_ESCALATION?` | Vercel (W5) |

`packages/config/env.ts` valida todas las variables con Zod al arrancar, y la app no inicia si falta una obligatoria.

## 4. Dominio y correo (pitchlab.mx)

- **DNS:** Cloudflare (gestión) con `pitchlab.mx` y `www` → Vercel. `www` redirige con un 301 al apex. `staging.pitchlab.mx` → Vercel (protegido).
- **Correo transaccional:** subdominio de envío (por ejemplo, `send.pitchlab.mx`) en Resend con SPF, DKIM y DMARC (`p=quarantine` tras 2 semanas en `p=none`).
- **Correo humano** (soporte@, privacidad@ y legal@): proveedor a elegir por el fundador. Las direcciones se publican en Legal y en el aviso de privacidad.
- **HTTPS** automático (Vercel) y HSTS tras validar.

## 5. Presupuestos de rendimiento (gate de CI y Lighthouse CI)

| Ruta | JS inicial (gzip) | LCP de laboratorio |
|---|---:|---:|
| `/`, `/pricing`, `/u/*`, `/p/*` | ≤ 120 KB | ≤ 2.0 s (móvil simulado) |
| `/app/*` | ≤ 220 KB por ruta | ≤ 2.5 s |

En producción: Core Web Vitals en p75 (LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1) vía Vercel Speed Insights o PostHog web vitals, separados de las métricas de laboratorio.

## Plan de hosting

Decisión del fundador (2026-11-11): el pre-MVP sin cobros puede seguir en Vercel Hobby, pero **antes de activar cobros reales se pasa a Vercel Pro** (Hobby es solo para uso no comercial). Ver `docs/product/DECISIONES_FUNDADOR_F4.md`.

## 6. Acciones del fundador para F4 (no las puede hacer un agente)

1. Crear las cuentas de servicio (con 2FA): Vercel, Neon, Cloudflare (DNS y R2), Upstash, PostHog, Sentry, Resend y GitHub (repo privado y Actions). Más adelante, The Odds API, API-Football, la pasarela y OpenRouter (W5, con límite de gasto mensual).
2. Apuntar los nameservers de pitchlab.mx a Cloudflare (o crear allí los registros que indique Vercel).
3. Cargar los secretos en Vercel y en GitHub Actions (ningún agente debe manejar claves en texto plano).
4. Elegir el proveedor de correo humano.
