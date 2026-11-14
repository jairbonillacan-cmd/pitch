# Prompt para Gemini · Puntos 7, 5 y 4 del plan de 7 puntos

Copia todo lo que va debajo de la línea.

---

Eres el agente de desarrollo de PitchLab. Vas a construir tres piezas independientes del plan de 7 puntos, en este orden: **7. `@usuario` sugerido al crear cuenta**, **5. Mercados nuevos derivados del motor v3.2** y **4. Parlay del día y generador personal**. Al mismo tiempo, otro agente (Claude) está construyendo el **punto 3 (Comunidad)** en la misma carpeta. Por eso trabajas en tu propia copia y en tu propia rama, y no tocas sus archivos.

## 0. Preparación (obligatoria, antes de leer o escribir código)

1. Crea una copia de trabajo aparte con su propia rama, a partir de `mi_record_backend_api`:
   ```
   cd "C:\Users\jairb\Desktop\Proyectos\Pitch Lab"
   git fetch origin
   git worktree add ..\pitchlab-gemini -b gemini/puntos-7-5-4 origin/mi_record_backend_api
   cd ..\pitchlab-gemini
   pnpm install
   ```
   **Todo tu trabajo ocurre en `..\pitchlab-gemini`.** Nunca cambies de rama, ni hagas commits, ni edites archivos en la carpeta `Pitch Lab` original: ahí trabaja Claude y ahí corre el servidor del fundador en `localhost:9999`.
2. Lee antes de tocar nada:
   - `AGENTS.md` y `docs/execution/PROJECT_STATE.md`, sobre todo **MI-RECORD-1**, **INSIGNIAS-1**, **INICIO-3** y **SIGNUP-2**.
   - `docs/execution/HANDOFF_PLAN_7_PUNTOS_2026_11_13.md`: las reglas cerradas de los puntos 4, 5 y 7 (preguntas Q14–Q19 y Q22–Q23) **mandan** sobre este prompt si algo no coincide.
   - `docs/design/UI_LIBRARIES.md` §1 y §5, `DESIGN_SYSTEM.md`, `INTERACTION_PATTERNS.md` y `RESPONSIVE_RULES.md`.

## 1. Reglas

- **Idioma:** todo en español de México, con palabras simples. Se dice **tipster**. Nada de jerga interna en la UI («Poisson», «Dixon-Coles», «sigma», «matriz»).
- **Archivos que NO puedes tocar** (son del punto 3 o recién hechos por Claude): `packages/ui/src/platform/club/CommunityClubView.tsx`, `community-ui.tsx`, `social-sync.ts`, `community-stats.ts`, `badges.ts`, todo `club/badges/`, todo `club/record/`, `record-stats.ts`, `packages/db/src/social.ts`, `votes.ts`, `badges.ts`, `apps/web/src/server/social.ts`, `badges.ts`, las rutas `apps/web/app/api/social/**` y `apps/web/app/api/me/badges/**`, y `MatchCommunityPoll.tsx`. Si de verdad necesitas cambiar uno, detente y explícalo en tu reporte en vez de editarlo.
- **`platform-provider.tsx` y `types.ts`:** solo cambios que **agregan** (campos o funciones nuevas). No renombres ni cambies lo existente: Claude también los va a tocar.
- **Sin migraciones.** Ninguna de tus tres tareas necesita tablas nuevas. Si crees que sí, detente y repórtalo; Claude va a usar los números `0019` en adelante.
- **Costo $0:** sin servicios de pago ni dependencias nuevas salvo que sea imprescindible (y entonces con versión exacta).
- **Producción no se toca:** nada de push, deploy ni bases remotas. Solo commits locales en `gemini/puntos-7-5-4`, uno por punto, con mensajes en español en formato convencional (`feat(signup): …`). Termina cada mensaje con la línea `Co-Authored-By: Gemini <noreply@google.com>`.
- **Diseño:** solo tokens de `@pitchlab/tokens` (el linter bloquea hex), tema oscuro y claro, sin scroll horizontal a 375 px, objetivos táctiles de 44 px, foco visible, estados vacío/cargando/error, `.num` en cifras. Cada componente nuevo o cambiado lleva **stories en oscuro y claro**. Antes de escribir UI, carga los skills que pide `AGENTS.md` (`modern-web-guidance` es obligatorio).
- **Seguridad:** toda ruta nueva usa el limitador de intentos (`checkEndpointRateLimit`) y, si cambia datos, `verifySameOriginMutation`. Nunca expongas correos ni ids de usuario en respuestas públicas.
- **Servidor propio:** si levantas Next para revisar, usa el puerto **9998** con `PITCHLAB_DIST_DIR=.next-9998` (`pnpm --filter @pitchlab/web exec next dev --port 9998`). Nunca uses el 9999. El PIN beta en desarrollo es `2026`.
- **Ignora** los cambios automáticos de `apps/web/next-env.d.ts` y `packages/tokens/src/tokens.generated.ts`: no los incluyas en los commits.

## 2. Punto 7 · `@usuario` sugerido en el paso 2 de `/signup`

- **Qué:** en el paso 2 de `SignupSurfaceV4.tsx`, debajo del campo de usuario, 3 chips con sugerencias libres sacadas del nombre o del correo. Al tocar uno se llena el campo; el campo sigue editable y conserva la verificación de disponibilidad que ya existe (`useHandleAvailability`).
- **Servidor:** `GET /api/handles/suggest?name=…` (el correo se toma de la sesión, no de la URL, para no exponerlo en registros). Devuelve `{ suggestions: string[] }` con 3 usuarios **disponibles y válidos** (`checkHandleFormat`, `isHandleAvailable`). Generaliza `suggestHandle` de `packages/db/src/signup.ts` en una función nueva `suggestHandles(db, bases, count)` que no repita y varíe (nombre, nombre+apellido, inicial+apellido, sufijo numérico), y deja `suggestHandle` funcionando igual. Limita a 20 consultas por minuto por usuario.
- **Sin cuentas (modo PIN o vista previa):** sugerencias calculadas en el navegador, sin verificar, y el texto lo dice.
- **Accesibilidad:** los chips son botones con texto «Usar @…», agrupados con etiqueta; al elegir uno, el foco vuelve al campo y el aviso de disponibilidad se anuncia como ya lo hace.
- **Pruebas:** unitarias de `suggestHandles` en `packages/db/tests` (PGlite, con usuarios ya tomados), de la ruta en `apps/web/tests`, y actualiza la prueba de navegador del registro si existe.

## 3. Punto 5 · Mercados derivados del motor v3.2

- **Fútbol** (con `buildDixonColesScoreMatrix` de `packages/spacetime/src/markets_2way.ts` y los parámetros del panorama v3.2):
  - Goles por equipo: local y visita, más/menos de 0.5, 1.5 y 2.5.
  - Primer tiempo: 1X2 al descanso y goles del 1.er tiempo, con la fracción de la tasa de goles de la primera mitad que defina el handoff (si no la define, usa una constante documentada y dilo en el reporte).
  - Marcador exacto: top 6.
- **NFL** (con `normalCdf` de `packages/spacetime/src/math.ts`, `DEFAULT_NFL_SIGMA_MARGIN = 13.5` y `DEFAULT_NFL_SIGMA_TOTAL = 10.5` de `outlook.ts`): hándicap y totales de puntos derivados cuando el panorama solo trae ganador.
- **Prueba de paridad obligatoria:** la matriz reproduce los mercados 1X2 y totales que ya publica v3.2 con `|Δ| < 1e-9`. Si no los reproduce, detente y repórtalo: no ajustes números para que pase.
- **UI** en la pestaña «Mercados» de la ficha del partido (`CoreMatchViews.tsx`): tarjetas agrupadas **Resultado · Goles · Hándicap · Marcador · 1er tiempo**, la opción más probable de cada tarjeta resaltada, momio justo en el formato del socio, y la etiqueta visible **«Derivado del motor»** en lo que sea nuevo. Respeta los picks bloqueados y la marca de agua que ya existen.
- **Pruebas:** unitarias en `packages/spacetime` (paridad, probabilidades que suman 1, simetría) y stories de las tarjetas en ambos temas.

## 4. Punto 4 · Parlay del día y generador personal

- **Parlay oficial del día**, determinista (mismo día y mismos datos → mismo parlay), uno por estilo:
  - Conservador: 2–3 selecciones con probabilidad ≥ 70 %.
  - Medio: 3–4 selecciones con ≥ 55 %.
  - Arriesgado: 4–6 selecciones.
  - Sin selecciones contradictorias ni dos del mismo partido. Probabilidad combinada y momio justo (`1 / p`).
  - Lógica pura con pruebas (reusa lo que sirva de `generateAutoParlay` sin cambiar su comportamiento actual en el Inicio).
- **Dónde se ve:** una tarjeta en el Inicio (`HomeClubView`) con selector de estilo, y su calificación automática en Resultados (`/app/historial`) cuando terminan los partidos, usando los resultados que ya trae el snapshot. Sin datos suficientes para un estilo, un estado vacío honesto.
- **Generador personal** arriba en `/app/parlays` (`ParlayBuilderClubView` en `ParlayAndQuantViews.tsx`): elegir de 2 a 6 picks, estilo de riesgo y filtro por liga, deporte o todo, en una barra rápida que funcione a 375 px.
- **Pruebas:** unitarias del generador (determinismo, umbrales, sin contradicciones), stories en ambos temas, y que `pnpm e2e` siga en verde.

## 5. Verificación antes de cada commit

En `..\pitchlab-gemini`:
- `node scripts/lint-codebase.mjs` y `node scripts/check-no-secrets.mjs`
- `pnpm lint` y `pnpm typecheck`
- `pnpm --filter @pitchlab/ui test`, `pnpm --filter @pitchlab/db test` y `pnpm --filter @pitchlab/web test`
- `pnpm --filter @pitchlab/web build`: ninguna ruta puede pasar de **326 kB** de First Load JS (anota el antes y el después de `/signup`, `/app`, `/app/parlays`, `/app/historial` y la ficha del partido).
- Al terminar los tres puntos: `pnpm --filter @pitchlab/web exec playwright test`.

## 6. Al terminar

1. Agrega una entrada por punto en `docs/execution/PROJECT_STATE.md` (formato de **INSIGNIAS-1**: Hecho · Verificado · No verificado · Pendiente) y marca los puntos como hechos en el handoff de 7 puntos.
2. No hagas push. Deja la rama `gemini/puntos-7-5-4` con sus commits.
3. Escribe un reporte final corto: qué hiciste por punto, qué pruebas corriste con su resultado real, qué decidiste tú donde el handoff no decía nada, y qué no pudiste verificar. Si algo falló, dilo con la salida, no lo maquilles.
