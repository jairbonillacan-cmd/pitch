# PitchLab · Plan Maestro v2: arquitectura primero, prompts después

## Contexto

El fundador entregó una directiva CTO (v1, 31 secciones) para planificar PitchLab, una superapp SaaS de inteligencia deportiva (pitchlab.mx, México primero), y generar 36 prompts de agentes. Al revisar el repo encontré activos y riesgos que la v1 no contempla. Además, el fundador pidió:

1. **Primero toda la arquitectura y después los prompts.**
2. Elegir el stack óptimo, incluido si conviene usar Storybook.
3. Integrar los **emblemas propios de ligas y equipos hechos por GPT**, con un icono predeterminado cuando no exista el emblema.
4. Un **ecosistema social y de crecimiento**: cuentas, perfiles, links de invitación, prueba gratis de 7 días, referidos que regalan trial y leaderboard de picks compartidos.
5. Integrar las redes oficiales de PitchLab.

Resultado esperado: una plataforma con una arquitectura cerrada y ejecutable (monorepo, contratos, design system en Storybook, registro de activos, ADRs) sobre la cual se generan prompts que citan **rutas y tipos reales**, no prosa.

---

## 1. Estado real del repo (verificado)

| Activo | Ubicación | Implicación |
|---|---|---|
| Marca oficial completa | `pitchlab-brand/` (handoff, `tokens/brand-tokens.css`, `design-tokens.json`, `contrast-audit.csv` con 68 pares, logos en 6 variantes × 5 tintas, 8 iconos, mockups) | Fuente de los tokens. Ya define el shell (sidebar de 232, header de 64, bottom bar con 4 destinos más «Más»), gráficas y tablas. No hay que rediseñar nada. |
| Emblemas Liga MX | `pitchlab-brand/football/liga-mx-apertura-2026/` (también en `pitchlab-liga-mx-apertura-2026.zip`): 19 entradas (liga y 18 clubes, con Atlante ≠ Atlas), `manifest.json` v1 con `id/code/shortName/colors/contrast/svg/png/symbolId`, sprite, catálogo y prueba de UI | Entran al **Sports Asset Registry** (§6). |
| Emblemas Premier League | `pitchlab-brand/football/premier-league-2026-27/` (también en `pitchlab-premier-league-2026-27.zip`): 21 entradas, `designRevision` 2 (edición 02, que sustituye a la 01) | Ídem. Hay que versionar las URLs para invalidar la caché. |
| Motores reconstruidos | `src/domain` (NFL, NCAA, fútbol Poisson y Dixon-Coles, EV, noVig, sizing) con 24 tests dorados y Δ=0 frente a los originales | Se migran a `packages/engines-reference` como **Baseline 0** del backtesting. No son el producto. |
| Investigación REA | `Reportes/` (canónica; `research/` es una copia parcial) | Se canonicaliza `Reportes/` y `research/` se marca como espejo. |
| Riesgo de marca | El handoff registra coincidencia de nombre con una app de béisbol y el IMPI está pendiente | Va al registro de decisiones del fundador. |

**Afirmaciones de los handoffs REA que NO se heredan como hechos.** Se clasifican como INFERIDO o se rechazan:

- Costos sin cotización (Sportradar, Sportmonks, «$149 MXN»).
- **Scraping de Caliente y Codere con proxies residenciales** → RECHAZADO (ToS y la directiva).
- Microservicios Go, K8s, LangGraph o ClickHouse → contradicen el monolito modular.
- Deep-link broker a casas, BetSync, alertas de arbitraje y escáner OCR de boletos → fuera de la postura «laboratorio, no casa».
- «100 % verificado» usado de forma laxa.

---

## 2. Principios no negociables (se conservan de la v1, ya condensados)

- **Anti-slop** visual, técnico, estadístico y de producto (§1 de la v1 íntegro) y la regla de 8 preguntas por funcionalidad.
- Evidencia etiquetada OBSERVADO, INFERIDO, RECONSTRUIDO o DESCONOCIDO.
- Integridad temporal: `eventTime / observedAt / sourceUpdatedAt / ingestedAt / predictedAt`. No hay leakage.
- Nada de dinero real: sin depósitos, sin apuestas, sin deep-links de apuesta en el MVP. Bankroll y unidades **simulados**.
- La autorización se verifica en el backend. No hay secretos en el cliente. No hay llamadas a proveedores desde el navegador.
- Datos demo siempre etiquetados y bloqueados en el build de producción.

---

## 3. Stack seleccionado (cada elección lleva su ADR)

Criterio: startup autofinanciada, 1 fundador más agentes, de 0 a 10k usuarios, máximo aprovechamiento de TypeScript, mínimo de servicios siempre encendidos.

| Capa | Elección | Por qué / alternativa descartada |
|---|---|---|
| Repo | **pnpm workspaces + Turborepo** | Caché de builds y límites de paquete que hacen cumplir el ownership multiagente. Nx es más pesado. |
| Web | **Next.js (App Router) + React 19 + TypeScript strict** | SSR/ISR para el SEO público, RSC para tablas pesadas, route handlers como BFF y `next/og` para las share cards. Se descarta Vite SPA (SEO y OG débiles). |
| URLs | **Opción A, un solo origen: `pitchlab.mx/…`** (público) y `pitchlab.mx/app/…` (producto) | Una cookie first-party, sin CORS y con perfiles y picks públicos (`/u/:handle`, `/p/:id`) en el mismo dominio que suma SEO. Un solo deploy. `app.` aporta poco a esta escala. |
| Estilos | **Tailwind CSS v4** con `@theme` generado desde `brand-tokens.css` | Tokens como única fuente. Un lint prohíbe hex y colores fuera de los tokens. |
| Primitivas | **Radix UI** más componentes propios en `packages/ui` (patrón «own the code», no shadcn tal cual) | Accesibilidad resuelta y estilo 100 % PitchLab. React Aria es la alternativa si falla el combobox o la tabla. |
| Tablas | **TanStack Table + TanStack Virtual** | Game logs y odds grids densos con miles de filas. |
| Gráficas | **visx** (SVG, control total y accesibilidad) más **uPlot** para series de más de 5k puntos (line movement) | Nivo/Recharts imponen estética. ECharts pesa demasiado. |
| Estado | **TanStack Query** (servidor) más **contexto en la URL** (nuqs) para deporte, liga, temporada, partido y filtros. Zustand solo si se justifica. | «Contexto compartido» = la URL es la fuente. Deep-links y share gratis. |
| Formularios y validación | **React Hook Form + Zod**. Zod también en los contratos de API y en los manifiestos de activos. | Un solo lenguaje de esquemas. |
| i18n | **next-intl**, es-MX por defecto y en-US preparado | Expansión internacional sin reescribir. |
| **Design System** | **Storybook 9 (builder Vite)** con addon a11y, addon Vitest (interaction tests) y snapshots visuales con Playwright en CI | **Sí conviene**: es el *contrato visible* entre Wave 0 y los agentes de sección. Cada componente se considera listo cuando tiene stories de todos sus estados (default, loading, empty, error, stale, demo, disabled). Chromatic queda opcional más adelante; arrancamos con Playwright gratis. |
| DB | **PostgreSQL en Neon** + **Drizzle ORM** | Branch de DB por PR o agente (clave para trabajar en paralelo), serverless barato. Supabase descartado porque no usaremos su Auth. |
| Series de cuotas | Postgres con **particionado nativo mensual** y archivo en **Parquet en Cloudflare R2**, consultado con **DuckDB** para backtests | Timescale no está disponible en Neon. ClickHouse es excesivo para el MVP. |
| Caché y rate limit | **Upstash Redis** | Serverless y pago por uso. |
| Jobs e ingesta | **Fase $0: GitHub Actions programado.** Después, **Trigger.dev** (TS, reintentos, cron, idempotencia) para la ingesta de proveedores | Inngest es equivalente. BullMQ exige Redis y un worker propio. |
| Modelos | **Python** (pandas, NumPy, SciPy, scikit-learn, LightGBM, statsmodels) como **jobs batch** (GitHub Actions en la fase $0; contenedores programados si crecen, ADR-008/009). Escriben predicciones versionadas en Postgres. | No hay una API Python siempre encendida en el MVP. La web solo lee predicciones registradas. |
| Auth | **Better Auth** (self-hosted en la app): email+password, OAuth Google/Apple, magic link, 2FA/passkeys, plugins admin y organization (invitaciones) | Sin costo por MAU (frente a Clerk), datos propios y soporte nativo de invitaciones y roles. |
| Billing | **Proveedor detrás de una interfaz `BillingProvider`**. El candidato se decide en el spike legal (§9). | ⚠ La lista de negocios prohibidos de Stripe incluye *«sports forecasting or odds making»*, así que hay que obtener aprobación escrita o usar una alternativa (Mercado Pago Suscripciones, Conekta u Openpay). No se elige a ciegas. |
| Email | **Resend + React Email** desde `no-reply@pitchlab.mx` (SPF, DKIM y DMARC por configurar) | DX y costo bajo. |
| Analítica y flags | **PostHog** (funnels de trial y referidos, feature flags, experimentos) | Una herramienta en lugar de tres. Consentimiento conforme a la LFPDPPP. |
| Errores | **Sentry** (web, jobs y Python) | Estándar. |
| IA | **Claude API**: `claude-sonnet-5-5` para el asistente y `claude-haiku-5-5` para clasificar y resumir, con **tool use** contra una API interna de solo lectura y cuota por plan | Respuestas fundamentadas (§12). |
| Búsqueda | Postgres FTS + `pg_trgm` (jugadores, equipos y ligas). Meilisearch después si hace falta. | Sin infraestructura extra en el MVP. |
| Hosting | **Vercel** (web), Neon, Upstash, R2, GitHub Actions (jobs en la fase $0; Trigger.dev después) y Cloudflare DNS para pitchlab.mx | Todo con tier gratuito o barato y escalable. |
| Calidad | ESLint (con reglas de límites de paquete), Prettier, Vitest, Playwright, axe, Lighthouse CI, GitHub Actions, CODEOWNERS | Gates en §11. |

Las versiones exactas se fijan en la ADR al hacer el scaffolding (se verifica la última estable).

---

## 4. Estructura del monorepo (contrato de ownership)

```text
apps/
  web/                    Next.js: rutas públicas, /app, /admin, route handlers (BFF)
packages/
  tokens/                 build de brand-tokens.css → @theme de Tailwind y TS (owner: Wave 0)
  ui/                     primitivas y componentes de DS + stories (owner: Wave 0)
  sports-ui/              TeamBadge, MatchCard, OddsCell, GameLogTable… + stories
  charts/                 visx/uPlot envueltos con tokens y accesibilidad
  contracts/              tipos y esquemas Zod: entidades canónicas, DataState, API DTOs, entitlements
  sports-assets/          registro de emblemas, manifiestos validados, fallback (§6)
  engines-reference/      motores migrados de src/domain + sus 24 tests (Baseline 0)
  db/                     esquema Drizzle, migraciones, seeds demo
  auth/  billing/         config de Better Auth, interfaz BillingProvider, entitlements
  social/                 dominio de picks, leaderboard, referidos (§7)
  config/                 eslint, tsconfig, vitest, playwright compartidos
services/
  ingest/                 tasks de Trigger.dev, adaptadores de proveedor
  models/                 Python: features, entrenamiento, backtest, registro
docs/                     ver §13
prompts/                  se generan en la Fase 5
```

El clon actual de TouchIQ (Vite, `src/`, `*.html` de referencia) se preserva en la rama `archive/touchiq-reconstruction` antes de reestructurar.

---

## 5. Contratos núcleo (se escriben en `packages/contracts` antes de cualquier prompt)

- **IDs canónicos**: `SportId`, `LeagueId`, `SeasonId`, `TeamId`, `PlayerId`, `GameId`, `MarketId`, `SelectionId`, `BookmakerId`, todos como slugs/ULIDs propios, más una tabla `provider_ref(entity, provider, external_id)` para la reconciliación.
- **`DataState<T>`**: `status` (idle, loading, success, empty, error o stale) más `provenance: 'provider' | 'derived' | 'demo'`, `source`, `observedAt`, `asOf`, `isDemo` y `error`. El build de producción falla si un adaptador `demo` está registrado.
- **`OddsQuote`**: `bookmaker, market, line, price(decimal), observedAt, source, status(open/suspended/closed)`. La UI marca como *stale* cualquier cuota que supere el umbral de frescura del mercado.
- **`Prediction`**: `modelId, modelVersion, gameId, market, p, projection?, inputsAsOf, predictedAt`, inmutable, más `Evaluation` posterior.
- **`Entitlement`**: un mapa `feature → plan` evaluado en el servidor (`can(user, 'props.history')`).
- **`SportContext`**: lo que se conserva entre módulos, serializado en la URL.
- **`Pick`** y **`Referral`**: ver §7.

---

## 6. Emblemas de ligas y equipos (Sports Asset Registry)

**Objetivo:** todos los equipos y ligas se muestran con un emblema editorial propio de PitchLab cuando existe, y con un **icono predeterminado** cuando no existe, sin romper el layout.

1. **Fuente intacta:** `pitchlab-brand/football/<edición>/` (ya descomprimido y enlazado desde el handoff de marca). Nunca se edita. Las ediciones nuevas de GPT se agregan como carpetas nuevas en la misma ruta.
2. **Build de activos** (`packages/sports-assets/scripts/build.mjs`):
   - Valida cada `manifest.json` con Zod (`schemaVersion`, `designRevision`, `id`, `code`, `kind`, `svg`, `png`, `symbolId` y `colors`).
   - Verifica que existan los archivos, que el `viewBox` sea `0 0 80 80` y que no haya `<image>` ni fuentes embebidas.
   - Copia los archivos a `apps/web/public/brand/sports/<liga>/<rev>/` (la revisión en la ruta invalida la caché).
   - Genera un `registry.ts` tipado de `TeamId → { svg, png, sprite#symbolId, colors, name, shortName, code }`.
3. **Mapeo con el proveedor:** `team_asset_map(team_id, league_edition, asset_id)` en la DB. Se mapea por `TeamId` canónico, nunca por el ID del proveedor (Atlante ≠ Atlas).
4. **Componentes** en `packages/sports-ui`:
   - `<TeamBadge teamId size={16|20|24|32|48} decorative />` y `<LeagueBadge leagueId … />`.
   - Tamaños del README: 24 en tablas, 32 en listas, 48 en tarjetas, 20 compacto y 16 solo con el nombre visible.
   - `alt=""` si el nombre está al lado. Si va solo, se usa el nombre accesible.
5. **Fallback predeterminado.** Se diseñan 3 iconos neutros con la retícula de iconos de la marca (24×24, trazo de 1,75, `currentColor` Peltre sobre Pizarra): `default-club` (escudo genérico), `default-competition` (copa o marco) y `default-national` (bandera). Se pueden mostrar con el `code` del equipo en tipografía de la marca. Así se cubre de inicio NFL, NCAA, NHL, MLB, La Liga, la Champions, etc.
6. **Cobertura visible:** `docs/design/SPORTS_ASSET_COVERAGE.md` se autogenera y lista cada liga con N de M emblemas. En CI se emite un warning (no un error) si un equipo activo usa fallback.
7. **Interruptor legal:** el flag de PostHog `assets.emblems.<league>` permite volver al fallback por liga sin desplegar.
   > ⚠ Nota honesta: redibujar los emblemas reduce el riesgo de **derechos de autor** sobre el arte original, pero los nombres, colores y motivos reconocibles de los clubes pueden ser **marcas registradas**, así que el riesgo de marca no desaparece. Los README de GPT indican que la «comparación de semejanza fue visual y preliminar». Por eso hacen falta el flag, el texto «ilustraciones editoriales de PitchLab» en el footer y Ayuda, y una revisión legal antes del lanzamiento público (se agrega al registro de decisiones del fundador).
8. **Jugadores:** sin fotos con licencia. Se usan iniciales en un avatar neutro (como indica la marca).
9. **Storybook:** la story «Emblem matrix» muestra todos los emblemas a 16/20/24/32/48 sobre las 6 superficies oscuras más los fallbacks, con snapshot visual en CI.

---

## 7. Ecosistema de cuentas, crecimiento y social

### 7.1 Cuentas y perfiles

- Registro con email y contraseña, Google, Apple y magic link. Email verificado obligatorio. **Declaración de mayoría de edad (18+) con fecha de nacimiento** en el registro.
- Perfil: `handle` único, nombre visible, avatar (iniciales por defecto o subido a R2 con moderación básica), bio corta, deportes y equipos favoritos (con emblemas) y enlaces propios.
- **Privacidad por defecto: perfil privado.** Hacerlo público es opt-in explícito (`/u/:handle`).

### 7.2 Prueba gratis de 7 días

- Todos los planes de pago ofrecen 7 días de trial. **Un trial por persona**, controlado por email verificado y huella del método de pago si el proveedor la expone, más heurística de dispositivo.
- Estados: `trialing → active | expired | canceled`. Hay emails en el día 0, el 5 y el 7. El downgrade a Free es automático y no se pierden datos.
- Si el trial pide tarjeta o no es una decisión del fundador. Recomendación: **sin tarjeta para el trial por referido**, y medir la conversión en PostHog.

### 7.3 Links de invitación y referidos

- Cada usuario tiene un **link de referido** `pitchlab.mx/r/:code`. Quien entra por él recibe **el trial de 7 días** (o uno extendido si el fundador lo decide).
- Quien refiere recibe una recompensa **solo cuando el referido convierte a pago** (por ejemplo, 1 mes gratis o un crédito). Hay un tope mensual.
- **Invitaciones directas** por email o link de un solo uso, con expiración. Esto incluye invitaciones administrativas (beta cerrada, creadores, prensa) con un plan o trial predefinido.
- Antifraude: se bloquea el autorreferido (mismo email normalizado, dispositivo o método de pago), hay rate limit por código y la recompensa se libera tras el periodo de reembolso.
- Entidades: `Referral(code, ownerId, campaign, utm)`, `ReferralRedemption(code, refereeId, status: signed_up | trial | converted | rewarded | rejected)` e `Invite(token, issuerId, grant, expiresAt, maxUses)`.
- Dashboard en Cuenta: link, QR, invitados, conversiones y recompensas.

### 7.4 Pick Journal y leaderboard (el núcleo social)

El diseño evita que se convierta en una vitrina de tipsters tramposos:

- **Registro de picks antes del evento.** El usuario registra una selección sobre un mercado real. El servidor sella `createdAt` y la **cuota observada** del proveedor (fuente y hora). Unidades simuladas de 0,5 a 5 u. **No hay montos en dinero.**
- **Inmutable al iniciar el evento.** No se puede editar ni borrar después del lock. «Ocultar» lo quita del perfil, pero **sigue contando** en las métricas. Así nadie puede limpiar su historial.
- **Calificación automática** con el feed de resultados (ganado, perdido, push o void), nunca manual.
- **Métricas del perfil**: registro W-L-P, ROI en unidades con **intervalo de confianza**, **CLV** promedio frente a la línea de cierre, calibración si declara probabilidad, tamaño de muestra y racha. Todo con su denominador.
- **Leaderboards** por deporte, temporada y periodo (30 días, temporada, histórico).
  - **Muestra mínima** para aparecer (por ejemplo, 30 picks).
  - Ranking por defecto según **CLV** o un ROI ajustado por muestra (límite inferior del IC), no por ROI bruto, para no premiar la suerte.
  - Solo aparecen perfiles públicos.
- **Compartir:** cada pick y cada perfil tiene una **share card** (`next/og`, con la marca y el emblema del equipo) y un link `pitchlab.mx/p/:id`. Hay botones para X, Facebook, Threads, LinkedIn y Web Share API o descarga de imagen para Instagram y TikTok (§8).
- **Seguir** a usuarios y un feed simple de picks de los seguidos (Wave posterior). Comentarios fuera del MVP por costo de moderación.
- **Seguridad del ecosistema:**
  - Reportar perfil o pick, moderación en el admin y sanciones.
  - Prohibido publicar links de afiliados, códigos de casas o grupos de pago (filtro y moderación).
  - Aviso persistente: «Unidades simuladas. Rendimiento pasado no garantiza resultados».
  - Enlace a ayuda de juego responsable y opción de **autoexclusión del módulo social**.
- ⚠ La viabilidad legal de los leaderboards de picks y de la publicidad relacionada con apuestas en México (Ley Federal de Juegos y Sorteos y su reglamento, lineamientos de publicidad, políticas de las plataformas sociales y de la pasarela) entra en el **spike legal (§9)** antes de abrirlos al público. El diseño técnico no depende de esa respuesta, porque todo queda tras flags.

### 7.5 Gamificación con propósito (solo lo que tiene sentido)

- Insignias de **método**, no de ganancias: «100 picks registrados», «CLV positivo en 3 meses», «perfil verificado».
- Nada de rachas que empujen a apostar más.

---

## 8. Redes oficiales e integración social

| Red | Handle | URL |
|---|---|---|
| X | @pitchlabmx | https://x.com/pitchlabmx |
| Facebook | pitchlabmx | https://facebook.com/pitchlabmx |
| Instagram | @pitchlab.mx | https://instagram.com/pitchlab.mx |
| Threads | @pitchlab.mx | https://threads.net/@pitchlab.mx |
| YouTube | @pitchlabmx | https://youtube.com/@pitchlabmx |
| TikTok | @pitchlabmx | https://tiktok.com/@pitchlabmx |
| LinkedIn | pitchlabmx | https://linkedin.com/company/pitchlabmx |

- Una sola fuente: `packages/contracts/src/brand/social.ts`, que alimenta el footer, Ayuda, los emails, el JSON-LD y los botones de compartir.
- **SEO y metadatos:**
  - JSON-LD `Organization` con `sameAs` de las 7 URLs.
  - `twitter:site=@pitchlabmx`.
  - Open Graph usando `pitchlab-brand/social/open-graph.png` como default y cards dinámicas por pick, perfil o partido.
- **Compartir:**
  - Con intents web: X (`x.com/intent/post`), Facebook (`facebook.com/sharer`), Threads (`threads.net/intent/post`) y LinkedIn (`linkedin.com/sharing/share-offsite`).
  - Instagram y TikTok no tienen intent web: se usa Web Share API en móvil o la descarga de la card en 1080×1350 / 1080×1920.
- **UTM estándar** (`utm_source=x|facebook|instagram|threads|youtube|tiktok|linkedin`, `utm_medium=social|referral|invite`) y atribución en PostHog. Los links de referido llevan el UTM de la red donde se compartieron.
- **Plantillas de contenido** basadas en `pitchlab-brand/social/post-game|post-model|post-stat.svg`, generables desde datos reales (`/api/og/...`). En Admin habrá un botón «Generar card para redes» (Wave posterior).
- YouTube: embebidos lite (sin cookies hasta la interacción) en Ayuda y Metodología.

---

## 9. Spikes bloqueantes antes de cerrar la arquitectura de datos y billing

1. **Spike de datos y licencias.** Matriz por proveedor (SportsDataIO, Sportradar, Sportmonks, API-Football, The Odds API, APIs públicas de NHL y MLB, entre otros) con cobertura, años de histórico, props, latencia, **derecho a almacenar, mostrar, redistribuir y entrenar**, y costo. Si el costo no es público, se marca «cotización requerida». No se scrapea ninguna casa de apuestas.
2. **Spike de pagos y legal en México.**
   - Postura de Stripe ante «sports forecasting» (aprobación escrita).
   - Alternativas: Mercado Pago, Conekta y Openpay.
   - CFDI e IVA (¿PAC como Facturapi?).
   - Aviso de privacidad (LFPDPPP).
   - Términos de renovación y cancelación (PROFECO).
   - Publicidad y leaderboards relacionados con apuestas.
   - Marcas: el nombre PitchLab en el IMPI y los emblemas de los clubes.
   - Resultado: `docs/architecture/COMPLIANCE_REGISTER.md` con el estado de cada punto (verificado, pendiente o requiere abogado).
3. **Registro de decisiones del fundador** (`docs/execution/FOUNDER_DECISIONS.md`). Cada decisión trae una recomendación por defecto y se avanza con ella marcada como supuesto:
   - Deporte de lanzamiento. Por defecto: **NFL más Liga MX y Premier League**, porque el motor NFL está verificado, la investigación de LineMate es la más profunda y ya hay emblemas de las dos ligas.
   - Presupuesto mensual de datos.
   - Precios de Free, Pro y Elite.
   - Si el trial pide tarjeta.
   - Recompensa por referido.
   - Fecha de beta.

---

## 10. Arquitectura de datos, modelos e IA (resumen; el detalle va en los documentos)

- **Pipeline:** adaptadores de proveedor → validación Zod → normalización → resolución de entidades (`provider_ref`) → Postgres canónico → snapshots inmutables de cuotas (particionados) → archivo Parquet en R2.
- **Las consultas «as-of»** responden «¿qué se sabía antes de X?» y alimentan Historical Replay y el backtest.
- **Modelos:**
  - Baseline 0 (los motores de referencia), Elo, Poisson, Dixon-Coles y GBM.
  - Validación walk-forward, Brier, log loss, calibración y **CLV frente al cierre**.
  - Un modelo se publica solo si supera al Baseline 0 y al mercado en una ventana out-of-sample preregistrada.
  - Model registry en Postgres. Predicciones inmutables.
- **PitchLab AI:**
  - Orquestador con herramientas tipadas (`getGame`, `getPlayerLogs`, `getOdds`, `getPrediction`, `explainModel`).
  - Cada cifra de la respuesta viene de una herramienta, con fuente y hora.
  - Cuota por plan y log de uso.
  - No da recomendaciones de apuesta.

---

## 11. Gates de calidad (automatizados en CI)

- `tsc` strict, ESLint con `boundaries` (un paquete no importa internals de otro), Vitest y Playwright E2E en los flujos críticos (registro, trial, referido, pick y lock).
- **Storybook:** cada componente exportado tiene stories de todos sus estados. Las pruebas de interacción y axe pasan. Hay snapshot visual en 4 breakpoints (375, 768, 1200 y 1440).
- **Anti-slop:**
  - Detector `avoid-ai-design` (`detect.mjs`).
  - Lint de «solo tokens» (sin hex sueltos).
  - Contraste verificado contra `contrast-audit.csv`.
  - Números tabulares en celdas numéricas.
- **Datos:** el build falla con adaptadores demo en producción. Hay tests de leakage (ninguna feature con `observedAt > predictedAt`).
- **Seguridad:** entitlements probados en el servidor, webhooks con firma e idempotencia, rate limit en auth, referidos y picks, y secretos solo en el entorno.
- **Rendimiento:** Lighthouse CI en las rutas públicas y presupuesto de JS por ruta. Core Web Vitals en p75 (LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1) en producción.
- **Linter de prompts** (`scripts/lint-prompts.mjs`, Fase 5):
  - Exige las secciones A–R.
  - Las rutas citadas existen.
  - Los tipos citados existen en `packages/contracts`.
  - Los globs de ownership no se solapan entre prompts.
  - Sin frases vacías.

---

## 12. Mapa de producto (36 secciones conservadas y consolidadas)

Los 35 IDs de la v1 se mantienen para la trazabilidad. Se añaden y consolidan:

- **07–11 → un solo SportHub paramétrico** (07) más `sport-config` por deporte. Los prompts 08–11 cubren solo las particularidades de cada deporte: QB/drives en NFL, conferencias en NCAA, porteros en NHL y pitchers en MLB. Se añade **11b** (configuración de fútbol: Liga MX y Premier League).
- **18 → pestaña de 17** (Market Explorer: actual / histórico / movimiento).
- **27 → dentro de 25 My Lab** (bankroll simulado y rendimiento).
- **19 → Archive** dentro de 06 Sports Explorer.
- **Nuevas secciones del ecosistema:**
  - **36 Public Profile & Pick Journal** (`/u/:handle`, `/p/:id`).
  - **37 Leaderboards** (`/leaderboards`).
  - **38 Referrals & Invites** (`/r/:code`, `/invite/:token` y el panel en Cuenta).
- Admin 29–32 se mantienen. El MVP incluye 29, 30 y 32 más la moderación social.
- Cada sección lleva una **ficha corta** en `docs/product/SECTION_INDEX.md` (problema, usuario, datos, acción, valor, métrica, MVP sí/no, dependencias) antes de recibir su prompt.

**MVP recomendado (Lean+ con ecosistema):**

- Landing, Pricing, Auth, Onboarding, Dashboard, SportHub (NFL, Liga MX y Premier League), Game Center, Player Explorer, Profile y Prop Lab (NFL), Odds Comparison (proveedor con licencia), Pick Journal, perfiles públicos, leaderboard beta, referidos, invitaciones y trial de 7 días, Cuenta y Billing, Global Search, Help/Legal y Admin básico.
- Las predicciones solo se muestran cuando un modelo pasa su gate. Antes de eso, la sección Prediction Center muestra la metodología y el estado «en validación».

---

## 13. Fases de ejecución (arquitectura completa antes de cualquier prompt)

| Fase | Entregable | Gate de salida |
|---|---|---|
| **F0 Auditoría y canonicalización** | `docs/research/` (inventario REA, evidence register unificado, triage de handoffs, matriz competitiva, hallazgos UX con Draftea como «patrón, nunca pieza») y `docs/brand/BRAND_AUDIT.md` + `ASSET_MANIFEST.md` (incluye emblemas) | Toda afirmación lleva etiqueta y ruta. |
| **F1 Spikes y decisiones** | Matriz de datos y licencias, `COMPLIANCE_REGISTER.md`, `FOUNDER_DECISIONS.md` y modelo de costos para 100, 1k y 10k usuarios (registrados, activos y de pago) con supuestos explícitos | El fundador revisa las decisiones por defecto. |
| **F2 Product blueprint** | Visión, personas, journeys (incluidos referido→trial→pago y pick→share→seguidor), arquitectura de información, `ROUTE_MAP.md`, `SECTION_INDEX.md` (38 fichas), MVP y roadmap | Cada sección pasa la regla de 8 preguntas. |
| **F3 Arquitectura y ADRs** | ADR-001…0xx (§3), `SYSTEM_ARCHITECTURE` (Mermaid), `DATA_ARCHITECTURE`/`HISTORICAL_STORAGE`, `PREDICTION_ARCHITECTURE`, `AUTH_BILLING_GROWTH` (trial, referidos, invitaciones y entitlements), `SOCIAL_ARCHITECTURE` (picks, lock, grading, leaderboard y moderación), `AI_ARCHITECTURE`, `SECURITY`, `DEPLOYMENT` (DNS de pitchlab.mx, entornos, previews por PR con branch de Neon) | Sin contradicciones entre documentos (revisión cruzada). |
| **F4 Walking skeleton (arquitectura ejecutable)** | Rama `archive/…`, monorepo pnpm/Turbo, `packages/tokens` (desde la marca), `packages/contracts` con los tipos de §5 y §7, `packages/sports-assets` con Liga MX y Premier League más los fallbacks, Storybook funcionando con 3 o 4 componentes de muestra (Button, TeamBadge, DataFreshnessIndicator y OddsCell), esquema Drizzle inicial, CI con todos los gates de §11 en verde, `engines-reference` con los 24 tests pasando | `pnpm build && pnpm test && pnpm storybook:test` en verde. El skeleton no incluye UI de secciones. |
| **F5 Prompts** | Prompt 00 (Design System y Shell, completo), luego los prompts por wave, todos citando paquetes, tipos y stories reales. Linter de prompts en verde. `prompts/INDEX.md` con orden y dependencias | Linter en verde y revisión de no-contradicción. |
| **F6 Ejecución multiagente** | `AGENT_EXECUTION_PLAN`, `AGENT_OWNERSHIP` (CODEOWNERS por glob), worktree y branch por prompt, PR con preview, integración por wave y `PROJECT_STATE.md` vivo | Cada wave se integra con los gates en verde. |

**Waves para F6:**

- W0: DS y Shell.
- W1: público, auth, trial, referidos y cuenta/billing básico.
- W2: Dashboard, SportHub y Game Center.
- W3: research de jugadores y equipos más Prop Lab.
- W4: Odds, Pick Journal, My Lab, perfiles y leaderboard (fin del MVP).
- W5: Intelligence (Prediction, Model Lab, Backtest, Replay e IA).
- W6: Watchlists, alertas y notificaciones.
- W7: Admin completo (con versiones mínimas desde W1–W4). Detalle en `docs/execution/ROADMAP.md`.

Se paraleliza dentro de cada wave sin tocar `packages/ui`, `contracts` ni `tokens`: esos paquetes solo los modifica su owner mediante una solicitud explícita.

**Documentos** (≈26, ninguno vacío, cada uno declara su propósito y su consumidor):

- `docs/brand` (2)
- `docs/research` (6)
- `docs/product` (6)
- `docs/design` (4, incluido `SPORTS_ASSET_COVERAGE`)
- `docs/architecture` (10 + ADRs + `COMPLIANCE_REGISTER`)
- `docs/execution` (5, incluidos `FOUNDER_DECISIONS` y `PROJECT_STATE`)
- `docs/PITCHLAB_MASTER_PLAN.md`

---

## 14. Qué hago al aprobar este plan

1. Guardo este plan como `docs/PITCHLAB_MASTER_PLAN.md` (v2) más `docs/DIRECTIVE_CHANGELOG.md` (v1→v2, con el motivo y la evidencia de cada cambio).
2. Ejecuto **F0 → F3** en orden, con un commit por fase en una rama `plan/architecture-v2`, y actualizo `PROJECT_STATE.md` al cerrar cada una.
3. Me detengo antes de F4 (reestructurar el repo) para que el fundador confirme las decisiones de F1. F4 mueve el código existente.

No se tocan los archivos de `pitchlab-brand/` ni los ZIP de emblemas. Los ZIP solo se leen.

## Verificación

- Cada afirmación sobre el repo o los activos cita una ruta existente (comprobación con Glob y `unzip -l`).
- Ninguna cifra de costo aparece sin la etiqueta «público con fuente», «estimado (supuesto)» o «cotización requerida».
- La tabla del changelog cubre las 31 secciones de la v1 (conservada, fusionada o modificada).
- Al cerrar F3, la revisión cruzada confirma que los nombres de paquetes, tipos y rutas son idénticos en todos los documentos.
- Al cerrar F4: CI en verde, Storybook con la «Emblem matrix» (Liga MX, Premier League y fallbacks) renderizada y los 24 tests de `engines-reference` pasando.
