# Prompt PREMVP-01 · Construir el pre-MVP de PitchLab (landing + acceso beta + panel de análisis)

> Para: Claude Opus 5.5 (Antigravity). Prompt **autocontenido**: no conoces la conversación donde se planeó; todo lo necesario está aquí y en los documentos del repo que se citan.
> Repo: `<REPO_ROOT>` · Rama base: `plan/architecture-v2` · Rama de trabajo: `feat/pre-mvp`
> Plantilla: `prompts/_TEMPLATE.md` (secciones A–R).

---

## A. Rol

Eres el **ingeniero full-stack principal** de PitchLab para el pre-MVP. Respondes por convertir los prototipos aprobados en una app Next.js real, con datos reales y gratuitos, acceso de beta validado en servidor y calidad de producción. No improvisas producto ni diseño: implementas contratos ya aprobados y, si algo no cuadra, lo reportas en el handoff en lugar de inventarlo.

## B. Contexto

**PitchLab** (https://pitchlab.mx) es un laboratorio de análisis deportivo por suscripción, México primero. Muestra probabilidades por partido calculadas por un modelo propio. **No acepta apuestas, no administra dinero y no recomienda apostar.**

El **pre-MVP** es una vitrina para los socios del fundador:

- una landing pública;
- un login con «Entrar a la beta» mediante código de socio;
- un panel deporte → liga → partidos → análisis (modal con traza de cálculo).

Sin cuentas reales, sin pagos, sin base de datos y sin IA.

**Lee en este orden antes de escribir código** (todos existen en la rama `plan/architecture-v2`):

1. `docs/execution/PROJECT_STATE.md` (estado actual)
2. `docs/product/PRE_MVP.md` (**especificación de este trabajo**, sobre todo §1–§9)
3. `docs/design/DESIGN_SYSTEM.md`, `docs/design/INTERACTION_PATTERNS.md` y `docs/design/RESPONSIVE_RULES.md` (diseño **aprobado**)
4. Los prototipos aprobados en `design/d1/` (`landing.html`, `login.html`, `signup.html`, `panel.html` y `assets/*`). Para verlos, desde la raíz ejecuta `python -m http.server 4173` y abre `http://localhost:4173/design/d1/landing.html`. El código de prueba del prototipo es el que te dé el fundador (no está en texto plano en el repo).
5. `docs/architecture/FREE_DATA_STRATEGY.md` (fuentes de datos permitidas)
6. `docs/architecture/SHARED_CONTRACTS.md` §1–§6 y §11 (tipos del pre-MVP)
7. `docs/architecture/ROUTE_MAP.md`, `docs/architecture/FRONTEND_ARCHITECTURE.md` y `docs/architecture/adr/` (ADR-001 a 007, 014, 015, 017, 018)
8. `docs/execution/FOUNDER_DECISIONS.md` (sobre todo FD-16 y FD-17)
9. `docs/execution/QUALITY_GATES.md`

## C. Marca

- Fuente oficial: `pitchlab-brand/`. Usa sus tokens (`tokens/brand-tokens.css`), logos (`logos/`), iconos (`visuals/icons/`), emblemas (`football/liga-mx-apertura-2026/`, `football/premier-league-2026-27/`, `american-football/nfl-2026/`, cada uno con su `manifest.json`) y la mascota Radar (`mascot/web/*.webp`).
- **Prohibido:** crear colores, tipografías o logos nuevos, o modificar archivos dentro de `pitchlab-brand/`.
- **Tema claro:** usa los tokens derivados de `DESIGN_SYSTEM.md` §1.1–1.2 (`--on-primary`, `--glow` y la paleta clara).
- **Antes de empezar:** ejecuta `git status`. Si `pitchlab-brand/` tiene archivos sin commit (`mascot/`, `american-football/`, `football/`…), **detente y pide al fundador que los versione**. El deploy los necesita y no debes commitear trabajo de marca ajeno sin autorización.

## D. Objetivo

Que un socio abra pitchlab.mx en su celular o computadora y pueda:

1. ver una landing que explica PitchLab, idéntica en estructura, copy y movimiento a `design/d1/landing.html`;
2. entrar con el código de socio;
3. elegir liga (Liga MX, Premier League o NFL), ver los partidos de la jornada o semana **con datos reales** y abrir el análisis de cualquier partido en un modal, con la traza de cálculo y las probabilidades del **Modelo PitchLab (en validación)**.

## E. Rutas (App Router, un solo origen)

| Ruta | Contenido | Acceso |
|---|---|---|
| `/` | Landing (prototipo `landing.html`) | Público |
| `/login` | Login bloqueado + «Entrar a la beta con código» que abre el PIN (`login.html`). `?next=` solo acepta rutas internas `/app…` | Público |
| `/signup` | Crear cuenta bloqueado (`signup.html`) | Público |
| `/app` | Redirige a `/app/<liga por defecto>` (`liga-mx` si hay datos; si no, `premier-league`) | Beta |
| `/app/[league]` | Panel: selector de liga, encabezado, filtro de día y tarjetas (`panel.html`). `[league]` ∈ `liga-mx`, `premier-league`, `nfl`; `nhl` y `mlb` aparecen como «Pronto» | Beta |
| `/app/[league]/games/[gameId]` | Mismo panel con el modal de análisis abierto (URL compartible). Al abrir y cerrar el modal desde el panel se actualiza la URL con `history.pushState` / `replaceState`, sin recargar | Beta |
| `/legal/privacidad`, `/legal/terminos`, `/legal/juego-responsable`, `/legal/creditos` | Textos mínimos marcados «Borrador · pendiente de revisión legal». **`/legal/creditos` incluye la atribución que exigen las licencias** (nflverse CC-BY 4.0 y openfootball CC0) | Público |
| `/api/beta/unlock` (POST) y `/api/beta/logout` (POST) | Validación del código y salida | — |

Todo el sitio lleva `noindex` (meta y `robots.txt` con `Disallow: /`).

## F. Diseño

**Reproduce los prototipos con fidelidad.** Estructura, copy, espaciados, animaciones, temas y comportamiento móvil ya están aprobados. Detalle normativo en `DESIGN_SYSTEM.md`, `INTERACTION_PATTERNS.md` y `RESPONSIVE_RULES.md`. Puntos que no pueden faltar:

- **Barra flotante** tipo píldora (se compacta al hacer scroll y marca la sección activa) y botón de tema sol/luna (claro y oscuro; preferencia guardada o la del sistema, aplicada en `<head>` sin parpadeo).
- **Landing:**
  - hero con Radar flotando, tarjeta flotante y trayectoria dibujada;
  - «Sin PitchLab / Con PitchLab» con una demo interactiva de 3 partidos **reales** de la semana;
  - «Un sábado cualquiera», «Escoge tu liga» (con la mascota de cada liga), «El modelo», «Nuestro compromiso» y cierre;
  - etiqueta «Beta cerrada».
- **Barras de probabilidad estilo PitchLab:**
  - marcas al 25/50/75 % y remate a 45°;
  - el **favorito de cada grupo** en Pulso con la etiqueta «Favorito»; el resto atenuado;
  - barra 1X2 que resalta solo el segmento líder.
- **Modal de análisis:**
  - `<dialog>` centrado de 960 px, pantalla completa en móvil;
  - traza de cálculo de 6 pasos con **valores reales** (230 ms por paso; 70 ms si ya se calculó en la sesión; «Saltar»; se omite con `prefers-reduced-motion` o en partidos finalizados);
  - resultado con tabla de mercados, marcador más probable, «Compara con tu cuota» (decimal o americana, no se guarda) y factores;
  - cierre con ×, clic fuera o Escape, devolviendo el foco.
- **PIN:** teclado 3×4 con Radar, casillas con rombo, teclado físico, sacudida en error, verde y redirección en éxito, y bloqueo tras 5 intentos.
- **Scrollbars** de marca y **sin scroll horizontal** en 375, 390, 768, 1024, 1280 y 1440 px.

**FD-16 (obligatorio):** la UI **no menciona proveedores de datos** (nflverse, openfootball, API-Football…) **ni nombres de algoritmos** (Poisson, Dixon-Coles, Pitágoras, Log5, Elo, «Baseline»…). Solo se muestran la hora de actualización y «Modelo PitchLab · en validación». **No digas «machine learning» ni «IA»**: el modelo actual es estadístico, y afirmarlo sería falso. Las licencias se atribuyen solo en `/legal/creditos`.

## G. Interacciones

| Control | Acción | URL o datos | Resultado visible |
|---|---|---|---|
| Tema (sol/luna) | Alterna claro y oscuro | `localStorage.pl-theme` | Colores y logos del tema |
| «Entrar a la beta» | Abre el PIN | — | Diálogo del PIN |
| Tecla del PIN o teclado físico | Agrega un dígito | — | Casilla con rombo y «N de 4 dígitos» |
| 4.º dígito | `POST /api/beta/unlock` | Cookie HttpOnly si es correcto | Éxito → `next`; error → sacudida |
| Selector de liga | Cambia de liga | `/app/[league]` | Encabezado, mascota y tarjetas |
| Chip de día | Filtra | Estado local | Tarjetas del día |
| Tarjeta de partido | Abre el modal | `pushState` a `/app/[league]/games/[id]` | Traza → análisis |
| Fila de mercado (clic, Enter o Espacio) | La selecciona | — | Actualiza «Compara con tu cuota» |
| Input de cuota | Calcula la implícita y la diferencia | — | Tres cifras |
| «Salir» | `POST /api/beta/logout` | Borra la cookie | Va a `/login` |

## H. Datos (US$0, solo fuentes de `FREE_DATA_STRATEGY.md` §1)

1. **NFL:** calendario y resultados de la temporada 2026 desde los **releases públicos de nflverse** (dataset de schedules/games). Localiza el asset oficial, documenta la URL exacta en el adaptador y **no uses datasets de FTN** (CC-BY-SA).
2. **Premier League:** `openfootball/football.json`, archivo `2026-27/en.1.json` (CC0).
3. **Liga MX:** API-Football plan Free, **solo si existe `API_FOOTBALL_KEY`**. Respeta el límite de 100 solicitudes al día y cachea. Sin clave, la liga aparece como «Pronto».

**Pipeline** (`services/ingest/` o `scripts/`, en TypeScript):

```
fetch (adaptador por fuente) → validación Zod → normalización a GameDTO (IDs canónicos)
→ tasas por equipo de la temporada en curso (a favor / en contra / partidos jugados)
→ análisis con packages/engines-reference → snapshot JSON
```

**Reglas del pipeline:**

- **IDs canónicos de equipo:** `<league>.<slug>`, con el `slug` igual al `id` del `manifest.json` de emblemas (por ejemplo, `liga-mx.atlante` ≠ `liga-mx.atlas`). Crea una **tabla de mapeo nombre de la fuente → slug** por liga, con tests. Si un nombre no mapea, el pipeline **falla con un error claro**: no adivina.
- **Motores:** migra `src/domain` (y `tests/domain`) a `packages/engines-reference` **sin cambiar su matemática**; los tests dorados deben seguir pasando.
  - Escribe adaptadores en `packages/engines-reference/src/adapters/` que conviertan las tasas canónicas en las entradas que esperan `NflEngine` (`src/domain/engine-nfl.ts`) y `FootballEngine` (`src/domain/aztecavet/football.ts`), o que reutilicen sus funciones puras.
  - Si un motor exige insumos que no tienes (por ejemplo, el baseline de la temporada anterior o lesiones), usa solo la temporada en curso con la regresión al promedio que el motor ya trae, y **documenta el supuesto** en el adaptador y en el handoff.
  - Lesiones vacías; sin cuotas de casas.
- **Snapshot:** `data/snapshots/<league>/<YYYY-MM-DD>.json` y `data/snapshots/<league>/latest.json`, validados con Zod contra `GameAnalysis` (`SHARED_CONTRACTS.md` §6). Cada análisis incluye `publishedAt` e `inputsAsOf`.
- **Historial íntegro:** si un partido ya tenía análisis publicado en un snapshot anterior **antes de su inicio**, el pipeline **lo conserva tal cual** y no lo recalcula. Agrega el resultado final cuando exista. Debe tener su test.
- **Traza de cálculo:** sus pasos salen de los valores reales del cálculo, con la redacción genérica de FD-16 (como el prototipo `design/d1/assets/proto.js`, campo `steps`).
- **Workflow** `.github/workflows/pre-mvp-snapshot.yml`:
  - cron diario y cada 3 h en días de partido;
  - genera el snapshot, hace commit y llama a `VERCEL_DEPLOY_HOOK_URL` si existe;
  - sin secretos en el código.

## I. Fixtures

- Graba respuestas reales (recortadas) de cada fuente en `services/ingest/fixtures/` para los tests offline.
- Los tests y Storybook usan esos fixtures.
- En producción **no puede cargarse ningún dato demo**: falla el build si un adaptador demo está registrado con `NODE_ENV=production`.

## J. Responsive

Sigue `RESPONSIVE_RULES.md` §2 al pie de la letra. Puntos críticos:

- **Hero móvil:** texto, Radar de 230 px y tarjeta encimada.
- Chips de la demo en una fila deslizable.
- Modal a pantalla completa.
- Formularios a 1 columna bajo 480 px, con `width: 100%; min-width: 0` en los inputs.
- Teclas del PIN de 64–72 px; sin texto de teclado físico en pantallas táctiles.
- Barra flotante de 54 px en móvil.

## K. Accesibilidad (WCAG 2.2 AA)

- Landmarks y skip link.
- Foco visible con el anillo Pulso.
- Diálogos con `aria-labelledby`, foco gestionado y Escape.
- Las filas de mercado son botones (`aria-pressed`).
- La barra 1X2 lleva `aria-label` con los tres valores.
- `role="status"` en la traza y en el PIN.
- El color nunca es la única señal (la etiqueta «Favorito» acompaña al color).
- `prefers-reduced-motion` respetado.
- axe sin violaciones.

## L. Dependencias técnicas

- **Monorepo:** pnpm (actívalo con `corepack enable`; el equipo tiene Node 26) y Turborepo, con:
  - `apps/web`: Next.js App Router, última versión estable, TypeScript strict;
  - `packages/tokens`: genera `@theme` de Tailwind v4 desde `brand-tokens.css` más los tokens derivados;
  - `packages/contracts`: Zod con los tipos de §11 de `SHARED_CONTRACTS.md`;
  - `packages/engines-reference`;
  - `packages/sports-assets`: valida los `manifest.json` y copia los emblemas y la mascota a `apps/web/public/brand/…` con la revisión en la ruta;
  - `packages/ui`: componentes semilla con Storybook.
- **Antes de reestructurar:** crea la rama `archive/touchiq-reconstruction` desde el estado actual (ADR-018). Fija versiones exactas y verifica que sean estables.
- **Fuente:** Inter Variable **local** (descarga el WOFF2 oficial de rsms.me/inter, SIL OFL 1.1).
- **Sin** librerías de UI con estética propia (shadcn tal cual, MUI…). Radix solo si lo necesitas para accesibilidad.

## M. Ownership (puedes crear o modificar)

```text
apps/web/**  packages/**  services/ingest/**  scripts/**  data/snapshots/**
.github/workflows/**  package.json  pnpm-workspace.yaml  turbo.json  tsconfig*.json
.gitignore  .env.example  docs/execution/PROJECT_STATE.md (solo tu handoff)
docs/product/PRE_MVP_DEPLOY.md (nuevo)
```

Para mover `src/`, `tests/`, `public/assets/`, `*.html` de la raíz, `vite`, `scripts/extract-data.mjs` y `package.json` del clon, sigue ADR-018: primero la rama de archivo y luego la migración.

## N. Restricciones (no modificar)

- `pitchlab-brand/**`, `Reportes/**`, `design/d1/**` (referencia aprobada), `docs/**` (salvo lo indicado en M) y `prompts/**`.
- **No** implementes cuentas reales, pagos, base de datos, IA, scraping de casas de apuestas ni uso de APIs sin licencia (por ejemplo, las APIs públicas de MLB, NHL o ESPN).
- **No** subas secretos. **No** pongas el código de socio en el repo: va en la variable `PREVIEW_ACCESS_CODE` (`.env.example` con un valor de ejemplo como `0000`).
- **No** hagas deploy ni configures DNS: prepáralo y documéntalo para el fundador.

### Seguridad del acceso (FD-17)

- `POST /api/beta/unlock` compara contra `PREVIEW_ACCESS_CODE` con comparación de tiempo constante.
- Límite de 5 intentos por IP cada 15 minutos (Upstash si existen `UPSTASH_*`; si no, un respaldo en memoria documentado como no apto para varias instancias).
- Responde con una cookie `HttpOnly; Secure; SameSite=Lax` firmada con HMAC (`BETA_COOKIE_SECRET`) y vigencia de 30 días.
- Middleware que protege `/app/**`.
- **Nunca** valides el código en el cliente.

## O. Pruebas

- **Unit (Vitest):**
  - tests dorados de los motores sin cambios;
  - adaptadores de fuentes con fixtures;
  - mapeo de nombres a slugs (un nombre desconocido debe fallar);
  - cálculo de tasas por equipo;
  - inmutabilidad del historial;
  - validación Zod de snapshots;
  - `parseOdds` y la probabilidad implícita;
  - firma y verificación de la cookie;
  - rate limit.
- **Storybook:** stories de los componentes semilla en sus estados y en los dos temas, con el addon a11y.
- **E2E (Playwright, 390×844 y 1440×900):**
  - la landing carga sin errores de consola y sin scroll horizontal;
  - `/app/liga-mx` sin cookie redirige a `/login?next=…`;
  - un PIN incorrecto muestra el error;
  - el PIN correcto (valor de prueba desde env) lleva a `next`;
  - cambiar de liga funciona;
  - abrir un partido, saltar la traza, ver el «Favorito», seleccionar una fila y escribir `+120` en la cuota actualiza la diferencia;
  - Escape cierra y devuelve el foco;
  - «Salir» borra el acceso.
- **Calidad:**
  - `tsc` strict sin errores;
  - lint sin hex fuera de `packages/tokens` y sin `catch {}`;
  - Lighthouse ≥ 90 en `/` y `/app/[league]`.

## P. Criterios de aceptación

1. `pnpm install && pnpm build && pnpm test && pnpm e2e` en verde desde un clon limpio.
2. Los snapshots reales de NFL y Premier League (y Liga MX si hay clave) se generan con `pnpm snapshot` y pasan la validación. **Ninguna cifra mostrada es inventada**: todas salen de `engines-reference` sobre datos reales de la temporada en curso.
3. La landing, el login, crear cuenta, el panel y el modal coinciden visualmente con `design/d1/` en los dos temas y en 390 y 1440 px (adjunta capturas lado a lado en el handoff).
4. **Cero menciones** a proveedores o algoritmos en el HTML renderizado de las rutas públicas y de `/app` (verificado con un test que busca esas palabras). La única excepción es `/legal/creditos`.
5. El acceso se valida solo en el servidor. Sin cookie no se ve nada de `/app`, ni siquiera el HTML de los análisis.
6. El historial queda íntegro: el análisis previo de un partido finalizado no cambia entre snapshots.
7. Sin scroll horizontal en 375, 390, 768, 1024, 1280 y 1440 px. axe sin violaciones.

## Q. Entregables

- Rama `feat/pre-mvp` con commits pequeños y descriptivos (en español), sin secretos.
- `docs/product/PRE_MVP_DEPLOY.md`: guía paso a paso para el fundador.
  - **Vercel:** proyecto, root `apps/web`, variables `PREVIEW_ACCESS_CODE`, `BETA_COOKIE_SECRET`, `API_FOOTBALL_KEY?` y `UPSTASH_*?`.
  - **Dominio** pitchlab.mx (DNS en Cloudflare).
  - **GitHub Actions:** secretos y deploy hook.
  - **Checklist** previo a mostrarlo a socios.
- Capturas en 390 y 1440 px de cada pantalla en los dos temas.

## R. Handoff

Al terminar, agrega tu entrada en `docs/execution/PROJECT_STATE.md` (sección «Handoffs») con este formato:

```markdown
### PREMVP-01 · Pre-MVP — YYYY-MM-DD — rama feat/pre-mvp
- Hecho: …
- No hecho / fuera de alcance: …
- Supuestos de datos y motores (adaptadores, regresión, ligas sin datos): …
- Decisiones tomadas y por qué: …
- Riesgos o deuda: …
- Cómo probarlo: comandos, URLs locales y PIN de prueba vía .env.local
```

Reporta con honestidad lo que no pudiste verificar (por ejemplo, la URL exacta de un dataset o un límite de API). **No declares terminado algo que no corriste.**
