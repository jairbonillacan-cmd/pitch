# Brief Ejecutivo de Arranque en Casa para Claude · Rama `gemini-reestructura`

> **Audiencia:** Claude + Fundador (sesión en casa)
> **Fecha de corte:** `2026-11-10` · **Rama activa:** `gemini-reestructura`
> **Objetivo de este documento:** que Claude retome el contexto completo en **60 segundos**, sin adivinar decisiones, rutas, credenciales ni reglas del repositorio.

---

## 1. Resumen de 30 segundos: ¿Dónde estamos?

En la rama `gemini-reestructura` acaba de aterrizar **`UI-MAESTRO-V4.1`**, la evolución 1:1 hacia el **`Prototipo Maestro PitchLab`** sobre la arquitectura **`PitchLab Spacetime Suite v2.1`**:

1. **Física *Smoked Glass* real sobre obsidiana (`@pitchlab/tokens` + `pitchlab-v4.css`):** cristal blanco translúcido (`--pl-glass-lens: rgba(255,255,255,0.068)`, `--pl-glass-card: rgba(255,255,255,0.052)`, `backdrop-filter: blur(18px)`), bisel especular único `.glass-ring` (sin bordes dobles), orbes radiales internos `<LensGlowOrbs>` alimentados por los colores oficiales de cada club/motor, CTAs blancos nítidos en modo oscuro y contraste AA/AAA dual (`dark` y `light`) con **0 literales hexadecimales fuera de `packages/tokens`**.
2. **Primitivas y Superficies Completas (`@pitchlab/ui` + `@pitchlab/web`):** módulo compartido `MaestroPrimitives.tsx` (`MaestroIcon` de 33 iconos vectoriales, `LensGlowOrbs`, `CrestPedestal`, `CalendarSquare`, `StackedAvatars`, `NoticeCard`, `GlassActionRow`, `RoleSwitcherPill`), modales `<TopLayerModalDialog>` sobre `<dialog>` nativo, **7 rutas públicas** con redacción `Cero-Fuga` desde servidor y **11 vistas del Club** navegables también desde la barra flotante colapsable `.pl-quick-jump-bar`.
3. **Punto exacto de pausa:** `pnpm lint`, `node scripts/lint-codebase.mjs`, `pnpm typecheck` y `pnpm test` pasan con **0 errores**, y todas las rutas responden `HTTP 200` en desarrollo. Las 3 corridas simultáneas en vivo de auditoría visual en Chromium se pausaron intencionalmente segundos antes de terminar para empacar esta entrega, subirla a GitHub y continuar directamente desde casa con Claude.

---

## 2. Mapa de Documentos Recién Creados (Leer en este orden)

### Estrella Polar Visual y Estado Operativo
- **[`design/prototipo-maestro/prototipo-maestro-pitchlab.html`](../../design/prototipo-maestro/prototipo-maestro-pitchlab.html)** (+ [`design/prototipo-maestro/README.md`](../../design/prototipo-maestro/README.md)): artefacto HTML interactivo canónico (~6,960 líneas). Es la **referencia visual y funcional 1:1** contra la cual comparar cada vista en navegador o Playwright.
- **[`docs/execution/PROJECT_STATE.md`](./PROJECT_STATE.md)**: estado global del proyecto, tabla maestra de entregables y bloque final `UI-MAESTRO-V4.1`.
- **[`AGENTS.md`](../../AGENTS.md)** y **[`GLOSSARY.md`](../../GLOSSARY.md)**: instrucciones permanentes para agentes y vocabulario canónico del dominio (*Spacetime Suite*, *Pase Total*, *Cero-Fuga*, *SGP*, *Tipstar Oficial*, *Referido Doble Vía*).

### Handoffs Técnicos Detallados de lo Construido Hoy
- **[`docs/execution/HANDOFF_MAESTRO_UI_TOKENS_PUBLIC.md`](./HANDOFF_MAESTRO_UI_TOKENS_PUBLIC.md)**: inventario exacto de tokens *Smoked Glass*, clases de `apps/web/app/pitchlab-v4.css`, API de `MaestroPrimitives.tsx` y anatomía de las 7 rutas públicas (`/`, `/tecnologia`, `/pricing`, `/signup`, `/login`, `/onboarding`, `/p/[pickId]`).
- **[`docs/execution/HANDOFF_MAESTRO_CLUB_QUANT_SOCIAL.md`](./HANDOFF_MAESTRO_CLUB_QUANT_SOCIAL.md)**: inventario exacto de `ShellChrome.tsx`, `MatchTicketCard.tsx`, `PlatformOverlays.tsx`, vistas de partidos/quant/parlays SGP (`/app`, `/app/picks`, `/app/[league]`, `/app/[league]/games/[gameId]`, `/app/parlays`, `/app/props`, `/app/momios`) y vistas sociales/negocio (`/app/social`, `/app/tipstar`, `/app/historial`, `/app/lab`, `/app/u/[handle]`, `/app/account`, `/app/admin`).

### Nuevas ADRs Aceptadas (Decisiones Arquitectónicas `2026-11-10`)
- **[`docs/architecture/adr/ADR-023-smoked-glass-maestro-ui-physics.md`](../architecture/adr/ADR-023-smoked-glass-maestro-ui-physics.md)**: física *Smoked Glass* sobre obsidiana, `<LensGlowOrbs>`, aislamiento de `.glass-ring`, `MaestroPrimitives`, `<dialog>` nativo y contraste AA dual.
- **[`docs/architecture/adr/ADR-024-hybrid-snapshot-spacetime-quant-engine.md`](../architecture/adr/ADR-024-hybrid-snapshot-spacetime-quant-engine.md)**: arquitectura cuantitativa híbrida (snapshots reales verificados de las 7 ligas + adaptadores determinísticos reproducibles `match-picks-engine.ts` y `parlay-engine.ts` mapeables 1:1 a tablas F4).
- **[`docs/architecture/adr/ADR-025-zero-leak-subscription-tipstar-referrals.md`](../architecture/adr/ADR-025-zero-leak-subscription-tipstar-referrals.md)**: membresía única `Pase Total` (`$299/mes` · `$2,390/año` con CFDI 4.0), prueba en dos fases (`$0` stack: Mes 1 sin tarjeta → Mes 2 SetupIntent `$0.00 MXN`), frontera `Cero-Fuga` SSR y motores duales de crecimiento (Tipstars `25 %` + Referidos `+15d`).

### Documentos de Visión y Hoja de Ruta hacia F4 (Para revisar con el Fundador)
- **[`docs/product/VISION_REESTRUCTURA_CLAUDE_DS_UX.md`](../product/VISION_REESTRUCTURA_CLAUDE_DS_UX.md)**: identidad visual *Apple-grade Quantitative Super-Tipster*, jerarquía de densidad progresiva en las 11 superficies, coreografía cromática por club y siguientes pasos UX (View Transitions, rasterización canvas de tickets, regresión visual en Storybook).
- **[`docs/product/VISION_REESTRUCTURA_CLAUDE_QUANT.md`](../product/VISION_REESTRUCTURA_CLAUDE_QUANT.md)**: transición de los 5 motores de `Spacetime Suite` hacia pipelines automatizados en producción (calibración walk-forward, ingesta de movimiento de línea consenso para `Geodesic v1.0`, feeds de Player Props y síntesis `Cortex IA` vía OpenRouter 60m antes del saque inicial con hash SHA-256).
- **[`docs/product/VISION_REESTRUCTURA_CLAUDE_GROWTH.md`](../product/VISION_REESTRUCTURA_CLAUDE_GROWTH.md)**: máquinas de estado y tablas PostgreSQL/Drizzle para F4 (`subscriptions`, `trial_fingerprints`, `referral_grants`, `tipstar_attributions`, `public_weekly_picks`, `social_posts`, `cfdi_invoices`), Stripe MX Billing/Connect, Facturapi CFDI 4.0 y embudos virales 4:5 / 9:16.

---

## 3. Cómo Levantar y Auditar el Entorno Local

### Sincronización y Variables de Entorno
```bash
git checkout gemini-reestructura
git pull origin gemini-reestructura
pnpm install
```

En desarrollo (`NODE_ENV !== "production"`), `apps/web/src/server/beta-auth.ts` acepta automáticamente el PIN **`2026`** y firma la cookie `pl_beta` (`httpOnly`, HMAC-SHA256). Si creas `.env.local` o corres en modo producción local (`next start`), define:
```bash
PREVIEW_ACCESS_CODE=2026
# (alias equivalente aceptado en servidor: PITCHLAB_BETA_CODE=2026)
PITCHLAB_COOKIE_SECRET=dev-only-pitchlab-beta-cookie-secret-32chars
```

### Comandos Clave de Desarrollo y Calidad
| Propósito | Comando | Notas clave |
|---|---|---|
| Levantar app web local | `PREVIEW_ACCESS_CODE=2026 pnpm dev` | Abre `http://localhost:3000` (o usa `pnpm --filter @pitchlab/web exec next dev --port 8787`) |
| Guardián de hex / catch vacíos | `node scripts/lint-codebase.mjs` | Falla si existe un solo `#hex` fuera de `packages/tokens` o un `catch {}` vacío |
| Lint completo del monorepo | `pnpm lint` | Ejecuta lint en paquetes + `lint-codebase.mjs` |
| Verificación de tipos | `pnpm typecheck` | `tsc --noEmit` en todos los paquetes del workspace |
| Pruebas unitarias y motores | `pnpm test` | Vitest en todos los paquetes (incluidos los 386 tests de `engines-reference`) |
| Compilación de producción + E2E | `pnpm build && pnpm e2e` | `playwright.config.ts` levanta `next start --port 3100` con `PREVIEW_ACCESS_CODE=2026` y corre `desktop` (`1440×900`) + `mobile` (`390×844`) con `@axe-core/playwright` |
| Storybook del Design System | `pnpm storybook` | Contrato visual de componentes en tema oscuro y claro |

> **Nota importante sobre `.next`:** no ejecutes `pnpm build` ni `pnpm e2e` al mismo tiempo que una instancia de `next dev` esté corriendo sobre el mismo directorio `.next`, ya que `next build` sobrescribe artefactos de compilación en caliente. Detén `next dev` antes de `pnpm build && pnpm e2e`, o ábrelos secuencialmente.

### Credenciales, Códigos Demo y Rutas de Prueba Rápida
- **PIN de acceso socio (`/login`, `/signup`, barra rápida de 11 vistas y `<RoleSwitcherPill>`):** `2026`
  - *Ojo:* `/api/beta/unlock` tiene rate-limit de **5 intentos fallidos cada 15 minutos (`HTTP 429`)** por IP.
- **Códigos promocionales de Tipstar Oficial (`5 días gratis` + atribución `25 %`):**
  - `SOFIA5` (boleto semanal abierto: `/p/sofia-sem` · perfil: `/app/u/sofia_nfl`)
  - `CARLOS5` (boleto semanal abierto: `/p/carlos-sem` · perfil: `/app/u/carlos_quant`)
  - `DIEGO5` (boleto semanal abierto: `/p/diego-sem` · perfil: `/app/u/diego_tactico`)
- **Códigos de Referido Doble Vía (`7 días gratis` + `30 %` dto. Mes 1; `+15 días` para ambos al 1.er cobro):**
  - `JAIR` y `SOCIO-8842` (perfiles de socio: `/app/u/jair`, `/app/u/socio_pl`)
- **Recorrido rápido de 11 vistas:** usa la barra inferior flotante colapsable **`.pl-quick-jump-bar`** o el selector **`<RoleSwitcherPill>`** en la cabecera; si navegas como visitante redactado desde servidor, desbloquea automáticamente la cookie `pl_beta` con el PIN `2026`.

---

## 4. Reglas Inquebrantables del Repositorio

1. **`0` colores hexadecimales fuera de `packages/tokens`:**
   - Prohibido escribir `#fff`, `#000000` o cualquier literal `#hex` en `.ts`, `.tsx`, `.css` o `.mjs` de `apps/` o `packages/ui` (`node scripts/lint-codebase.mjs` rompe el build de inmediato).
   - Usa siempre tokens semánticos `var(--pl-*)`, `var(--engine-*)` o colores dinámicos de club vía `getTeamColors(league, slug)` de `@pitchlab/sports-assets`. Si falta un token, agrégalo en `packages/tokens/scripts/generate.mjs` y ejecuta `pnpm --filter @pitchlab/tokens build`.
2. **`FD-16` — Cero jerga interna ni nombres de proveedores en UI o DOM:**
   - Jamás exponer en textos visibles ni atributos del DOM términos crudos de modelado o terceros (`Dixon-Coles`, `Platt`, `Elo`, `Poisson`, `nflverse`, `openfootball`, `The Odds API`, `API-Football`, `OpenRouter`, etc.).
   - Toda explicación al usuario usa la nomenclatura propietaria de **`PitchLab Spacetime Suite v2.1`** (`Tachyon v2.1`, `Singularity v2.1`, `Minkowski v2.1`, `Geodesic v1.0`, `Cortex IA`, `Horizon`).
3. **Frontera `Cero-Fuga` estricta desde el servidor (`apps/web/src/server/platform-data.ts`):**
   - Nunca confíes en `blur` CSS para ocultar pronósticos a visitantes sin sesión. `loadPublicPlatformState()` aplica `redactDatasetForVisitor()` en el servidor antes de serializar props RSC: un visitante anónimo solo recibe partidos liquidados (`FT`), **1 Pick Abierto del Día** en `/` y **1 Pick Semanal de Tipstar** en `/p/[pickId]` (manteniendo los otros 4 picks de ese partido redactados con `[data-locked-pick]`).
   - Se mantiene marca de agua dinámica por sesión (`PL-XXXX`), bloqueo anti-enlaces externos en `Comunidad VIP` / `Debate de Suscriptores` y **cero premios monetarios o materiales** en rankings (requisito estricto de Stripe).
4. **Modales nativos en Top Layer (`<TopLayerModalDialog>`):**
   - Todo modal o drawer usa `<TopLayerModalDialog>` (`packages/ui/src/platform/components/PlatformOverlays.tsx`) montado sobre el elemento `<dialog>` nativo con `.showModal()`, foco atrapado y cierre con `Escape`. No crear overlays manuales con `div` fijos.
5. **Accesibilidad WCAG 2.1 AA en oscuro y claro + Responsive sin desborde:**
   - `@axe-core/playwright` (`wcag2a`, `wcag2aa`) debe reportar **0 violaciones** tanto en `data-theme="dark"` como en `data-theme="light"`, y **0 px de overflow horizontal** en `375, 390, 768, 1024, 1280 y 1440 px`.
6. **Higiene de Git con archivos locales del fundador:**
   - **Nunca ejecutes `git add .` ni `git add -A`.** Añade siempre rutas explícitas para no tocar los archivos sin seguimiento del fundador (`pitchlab-brand.zip`, `pitchlab-brand/football/`, `pitchlab-brand/social/`, `pitchlab-brand/PITCHLAB_BRAND_HANDOFF.md`, `pitchlab-brand/README.md`, `test-results/`).

---

## 5. Orden Recomendado de Trabajo para Claude Hoy en Casa

### Paso 1 · Correr Playwright + Axe AA y comparar visualmente contra el Prototipo Maestro
1. Ejecuta `pnpm build && pnpm e2e` y confirma que toda la suite E2E y las auditorías `@axe-core/playwright` pasen al 100 % en `desktop` (`1440×900`) y `mobile` (`390×844`), en tema oscuro y claro.
2. Abre o captura en paralelo `design/prototipo-maestro/prototipo-maestro-pitchlab.html` frente a la app Next.js en vivo (`/`, `/tecnologia`, `/pricing`, `/signup`, `/onboarding`, `/p/sofia-sem`, `/app`, `/app/picks`, `/app/parlays`, `/app/props`, `/app/momios`, `/app/social`, `/app/tipstar`, `/app/historial`, `/app/lab`, `/app/u/sofia_nfl`, `/app/account`, `/app/admin` y `/app/[league]/games/[gameId]`).

### Paso 2 · Pulir micro-detalles visuales/responsive y exportación raster de boletos
1. Ajusta cualquier detalle fino de espaciado, jerarquía tipográfica, estados hover/focus o quiebres móviles detectado en la inspección lado a lado (apoyándote en `HANDOFF_MAESTRO_UI_TOKENS_PUBLIC.md` y `HANDOFF_MAESTRO_CLUB_QUANT_SOCIAL.md`).
2. Implementa la descarga raster real en cliente (PNG/WebP vía `<canvas>` / serialización SVG de alta densidad) para los boletos compartibles **4:5** y **9:16** en `ShareTicketModal` y `/app/tipstar`.

### Paso 3 · Revisar ADRs `023`–`025` y los 3 documentos de Visión con el Fundador
1. Revisa con el fundador las decisiones registradas en `ADR-023`, `ADR-024` y `ADR-025` junto con las propuestas abiertas en `VISION_REESTRUCTURA_CLAUDE_{DS_UX,QUANT,GROWTH}.md`.
2. Confirma cualquier ajuste de reglas de negocio (ventanas de prueba Mes 1 sin tarjeta vs Mes 2 `$0.00 MXN`, topes de comisión Tipstar, campos obligatorios CFDI 4.0 o priorización de ligas) antes de generar migraciones SQL.

### Paso 4 · Arrancar F4 (Persistencia, Auth, Stripe MX y CFDI 4.0)
1. **Base de datos (`packages/db` · PostgreSQL/Neon + Drizzle):** crear las tablas transaccionales definidas en `VISION_REESTRUCTURA_CLAUDE_GROWTH.md` y `VISION_REESTRUCTURA_CLAUDE_QUANT.md`, migrando el estado efímero de `localStorage` en `PlatformProvider` a endpoints autenticados.
2. **Autenticación y Escudo Anti-Abuso `$0`:** conectar Better Auth / Auth.js (Google + Apple OAuth), canonicalización de correo y verificación servidor de Cloudflare Turnstile, ocultando `<RoleSwitcherPill>` y `.pl-quick-jump-bar` en producción salvo flag explícito de preview.
3. **Pagos e Impuestos MX:** integrar Stripe MX Billing (`$299 MXN/mes` · `$2,390 MXN/año`), Promotion Codes (`SOFIA5`, `JAIR`), ledger de comisiones Tipstar (`25 %`), concesiones automáticas `+15 días` por webhook `invoice.paid` y timbrado automático CFDI 4.0 vía Facturapi.
