# Índice de secciones (38 fichas)

> **Propósito:** cada sección responde las 8 preguntas de producto antes de recibir un prompt. Si una ficha no convence, la sección no se construye.
> **Consumidores:** autores de prompts (F5) y fundador.
> **Fecha:** 2026-11-08 · Rutas en `docs/architecture/ROUTE_MAP.md`. Entitlements en `INFORMATION_ARCHITECTURE.md` §4.
> **Formato:** Problema · Usuario · Datos · Acción · Valor (por qué pagaría) · Métrica · Depende de. **MVP:** ✅ sí · ◐ versión reducida · — no.

## Resumen

| ID | Sección | Ruta | Wave | MVP | Estado de la ID |
|---|---|---|:-:|:-:|---|
| 00 | Design System y App Shell | `packages/ui`, layout de `/app` | W0 | ✅ | — |
| 01 | Landing | `/` | W1 | ✅ | — |
| 02 | Pricing | `/pricing` | W1 | ✅ | — |
| 03 | Authentication | `/login`… | W1 | ✅ | — |
| 04 | Onboarding | `/app/onboarding` | W1 | ✅ | — |
| 05 | Home Dashboard | `/app` | W2 | ✅ | — |
| 06 | Sports Explorer (+ Archive) | `/app/explore` | W2 | ◐ | absorbe 19 |
| 07 | SportHub paramétrico | `/app/[league]` | W2 | ✅ | absorbe la estructura de 08–11 |
| 08 | Config NFL | `sport-config/american-football` | W2 | ✅ | prompt de configuración |
| 09 | Config NCAA Football | ídem (`ncaaf`) | W3+ | — | prompt de configuración |
| 10 | Config NHL | `sport-config/hockey` | W5+ | — | prompt de configuración |
| 11 | Config MLB | `sport-config/baseball` | W5+ | — | prompt de configuración |
| 11b | Config Fútbol (Liga MX y Premier League) | `sport-config/soccer` | W2 | ✅ | nueva (antes implícita en 07 Soccer Hub) |
| 12 | Game Center | `/app/[league]/games/[gameId]` | W2 | ✅ | — |
| 13 | Player Explorer | `/app/[league]/players` | W3 | ✅ | — |
| 14 | Player Profile | `/app/[league]/players/[playerId]` | W3 | ✅ | — |
| 15 | Player Prop Lab | `/app/[league]/props` | W3 | ✅ (NFL) | — |
| 16 | Team Explorer | `/app/[league]/teams` | W3 | ◐ | — |
| 17 | Odds / Market Explorer (+ histórico) | `/app/[league]/odds` | W4 | ✅ | absorbe 18 |
| 18 | → pestañas `history` y `movement` de 17 | — | W4 | ◐ | fusionada |
| 19 | → Archive de 06 | — | W2 | ◐ | fusionada |
| 20 | Historical Replay | `/app/replay/[gameId]` | W5 | — | — |
| 21 | Prediction Center | `/app/predictions` | W5 | ◐ (metodología) | — |
| 22 | Model Lab | `/app/models` | W5 | ◐ (Baseline 0) | — |
| 23 | Backtesting Studio | `/app/backtest` | W5 | — | — |
| 24 | PitchLab AI | `/app/ai` y panel | W5 | — | — |
| 25 | My Lab (+ rendimiento) | `/app/lab` | W4 | ✅ | absorbe 27 |
| 26 | Watchlists & Alerts | `/app/watchlists` | W6 | ◐ (watchlist sin alertas) | — |
| 27 | → pestaña `performance` de 25 | — | W4 | ✅ | fusionada |
| 28 | Account & Billing | `/app/account/*` | W1/W6 | ✅ | — |
| 29 | Admin Dashboard | `/admin` | W7 | ✅ | — |
| 30 | Admin Data Ops | `/admin/data` | W7 | ✅ | — |
| 31 | Admin Model Ops | `/admin/models` | W7 | — | — |
| 32 | Admin Billing, Users y Moderation | `/admin/users`… | W7 | ✅ | ampliada con moderación |
| 33 | Global Search | ⌘K y `/app/search` | W2 | ✅ | — |
| 34 | Notification Center | `/app/notifications` | W6 | ◐ | — |
| 35 | Help, Metodología y Legal | `/help`, `/metodologia`, `/legal/*` | W1 | ✅ | — |
| 36 | Public Profile & Pick Journal | `/u/[handle]`, `/p/[pickId]` | W4 | ✅ | nueva |
| 37 | Leaderboards | `/leaderboards` | W4 | ◐ (beta tras flag) | nueva |
| 38 | Referrals & Invites | `/r/[code]`, `/invite/[token]`, `/app/account/referrals` | W1 | ✅ | nueva |

Los prompts 18, 19 y 27 no se generan: sus IDs se conservan para la trazabilidad.

---

## Fichas

### 00 · Design System y App Shell

- **Problema:** sin un sistema único, 35 secciones parecerían 35 apps.
- **Usuario:** todos los agentes; indirectamente, todos los usuarios.
- **Datos:** tokens de la marca y el registro de emblemas.
- **Acción:** proveer componentes con todos sus estados y el shell (sidebar, header, nav móvil y paneles).
- **Valor:** coherencia, accesibilidad y velocidad de construcción.
- **Métrica:** 100 % de componentes con stories de todos sus estados, axe sin violaciones y 0 hex fuera de los tokens.
- **Depende de:** `pitchlab-brand/`, `UX_FINDINGS.md` §4.

### 01 · Landing

- **Problema:** explicar en segundos qué es PitchLab y por qué es distinto.
- **Usuario:** visitantes de redes, búsqueda y referidos.
- **Datos:** capturas reales del producto, ligas disponibles y metodología (sin cifras inventadas).
- **Acción:** ir a Pricing o registrarse, y explorar un Game Center demo identificado como tal.
- **Valor:** conversión.
- **Métrica:** CTR a signup y bounce rate.
- **Depende de:** 00, 35, redes (§8 del plan).

### 02 · Pricing

- **Problema:** elegir un plan con claridad (precio final con IVA, trial y cancelación).
- **Usuario:** P1–P3.
- **Datos:** matriz de entitlements y precios (FD-03).
- **Acción:** iniciar el trial o comprar.
- **Valor:** confianza y conversión.
- **Métrica:** visita a Pricing → inicio de trial.
- **Depende de:** 00, 03, `AUTH_BILLING_GROWTH`.

### 03 · Authentication

- **Problema:** entrar y salir de forma segura y sin fricción.
- **Usuario:** todos.
- **Datos:** Better Auth (email, Google, magic link) y la fecha de nacimiento.
- **Acción:** registro con 18+ y consentimientos, login, recuperación y verificación.
- **Valor:** base del SaaS.
- **Métrica:** tasa de registro completado y tasa de error.
- **Depende de:** 00 y C-04/C-07.

### 04 · Onboarding

- **Problema:** un dashboard genérico no sirve.
- **Usuario:** usuarios nuevos.
- **Datos:** ligas, equipos (emblemas) e intereses.
- **Acción:** elegir ligas, equipos y nivel (casual o avanzado).
- **Valor:** personalización inmediata.
- **Métrica:** % que completa el onboarding y activación al día 1.
- **Depende de:** 00, 03 y el registro de emblemas.

### 05 · Home Dashboard

- **Problema:** «¿qué debo mirar hoy?».
- **Usuario:** P1 y P2.
- **Datos:** partidos de las ligas seguidas, watchlist, picks abiertos, movimientos de línea relevantes y frescura.
- **Acción:** saltar a un Game Center o Prop Lab con el contexto.
- **Valor:** ahorra tiempo cada día.
- **Métrica:** % de sesiones que pasan del Dashboard a una investigación.
- **Depende de:** 07, 12, 17, 25 y 26.

### 06 · Sports Explorer (+ Archive)

- **Problema:** descubrir ligas y temporadas, y consultar temporadas pasadas.
- **Usuario:** P2 y P4.
- **Datos:** catálogo de ligas y temporadas, resultados y standings históricos (según licencia).
- **Acción:** navegar al hub o a una temporada archivada.
- **Valor:** profundidad histórica visible.
- **Métrica:** uso del Archive por usuarios Pro.
- **Depende de:** 07 y la licencia histórica.

### 07 · SportHub paramétrico

- **Problema:** cada liga necesita su portada, pero no una app distinta.
- **Usuario:** todos.
- **Datos:** calendario, standings, equipos, jugadores y mercados destacados, con configuración por deporte.
- **Acción:** filtrar por jornada o semana y abrir partidos, equipos o jugadores.
- **Valor:** punto de entrada por liga.
- **Métrica:** CTR a un Game Center.
- **Depende de:** 00 y 08–11b.

### 08 · Configuración NFL

- **Problema:** la NFL tiene semanas, bye weeks, posiciones (QB, RB, WR, TE) y props propios.
- **Usuario:** P1 y P2 de NFL.
- **Datos:** mercados de props NFL, posiciones, estructura de semanas y columnas del game log.
- **Acción:** proveer la `SportConfig` de NFL (columnas, mercados y tabs).
- **Valor:** profundidad específica sin código duplicado.
- **Métrica:** cobertura de mercados NFL disponibles en el proveedor.
- **Depende de:** 07 y el proveedor (FD-02).

### 09 · Configuración NCAA Football

- **Problema:** más de 130 equipos, conferencias y disparidad de nivel.
- **Usuario:** P2 de NCAA.
- **Datos:** conferencias, rankings y fallback de emblemas.
- **Acción:** `SportConfig` de NCAAF.
- **Valor:** un mercado poco atendido.
- **Métrica:** usuarios activos con NCAAF.
- **Depende de:** 07, 08 y la licencia NCAAF.

### 10 · Configuración NHL

- **Problema:** el portero domina el resultado y existen el OT y los shootouts.
- **Usuario:** P2 de NHL.
- **Datos:** porteros titulares, regulación frente a OT y props NHL.
- **Acción:** `SportConfig` de NHL.
- **Valor:** contexto clave que otros omiten.
- **Métrica:** uso semanal.
- **Depende de:** 07 y la licencia NHL.

### 11 · Configuración MLB

- **Problema:** pitchers abridores, bullpen y parque.
- **Usuario:** P2 de MLB.
- **Datos:** abridores probables, splits L/R y factores de parque.
- **Acción:** `SportConfig` de MLB.
- **Valor:** el matchup de pitcher es el dato central.
- **Métrica:** uso semanal.
- **Depende de:** 07 y la licencia MLB.

### 11b · Configuración Fútbol (Liga MX y Premier League)

- **Problema:** torneos cortos (Apertura y Clausura, liguilla), tabla de posiciones y mercados 1X2, BTTS y totales.
- **Usuario:** P1 (mercado mexicano).
- **Datos:** tablas, jornadas, fases y emblemas de Liga MX y Premier League.
- **Acción:** `SportConfig` de soccer y la configuración por liga.
- **Valor:** el deporte más seguido en México.
- **Métrica:** activos de Liga MX.
- **Depende de:** 07, el proveedor de fútbol y `ASSET_MANIFEST.md`.

### 12 · Game Center

- **Problema:** la información de un partido está dispersa.
- **Usuario:** todos (núcleo).
- **Datos:** partido, equipos, stats, jugadores, cuotas (actuales e históricas), lesiones, clima y predicción si existe.
- **Acción:** saltar con el contexto a Prop Lab, Cuotas, Replay o la IA, y registrar picks.
- **Valor:** **la investigación en un solo lugar**.
- **Métrica:** investigaciones completadas (métrica norte).
- **Depende de:** 07, 15, 17, 21 y 36.

### 13 · Player Explorer

- **Problema:** encontrar y comparar jugadores.
- **Usuario:** P2 y P4.
- **Datos:** jugadores por liga, equipo y posición con sus stats de temporada.
- **Acción:** filtrar, ordenar, comparar hasta 3 y abrir un perfil.
- **Valor:** búsqueda avanzada.
- **Métrica:** perfiles abiertos desde el Explorer.
- **Depende de:** 00 y 33.

### 14 · Player Profile

- **Problema:** entender el rendimiento real de un jugador.
- **Usuario:** P1, P2 y P4.
- **Datos:** game logs, promedios, distribuciones, splits, lesiones y mercados activos.
- **Acción:** ver los logs, ir a Prop Lab y seguir al jugador.
- **Valor:** profundidad por jugador.
- **Métrica:** tiempo en el perfil y paso a Prop Lab.
- **Depende de:** 13 y 15.

### 15 · Player Prop Lab

- **Problema:** evaluar un prop con honestidad.
- **Usuario:** P1 y P2.
- **Datos:** game logs, línea y cuotas de props, y proyección si existe.
- **Acción:** mover la línea (scrubber), cambiar la ventana o el split, comparar la cuota implícita y registrar un pick.
- **Valor:** **el diferenciador de honestidad** (n, IC, distribución y precio).
- **Métrica:** props analizados por usuario y paso a pick o watchlist.
- **Depende de:** 12, 14, 17 y 36.

### 16 · Team Explorer

- **Problema:** comparar equipos y su contexto.
- **Usuario:** P2 y P4.
- **Datos:** stats de equipo, ofensiva y defensiva (rankings ajustados si la licencia lo permite) y calendario.
- **Acción:** comparar 2 equipos y ver su perfil.
- **Valor:** contexto de matchups.
- **Métrica:** uso de la comparación.
- **Depende de:** 07.

### 17 · Odds / Market Explorer (+ histórico, ex-18)

- **Problema:** saber si una cuota es buena y cómo se movió.
- **Usuario:** P2 (también P1).
- **Datos:** `OddsQuote` por casa y hora, apertura y cierre, snapshots, probabilidad implícita y sin vig.
- **Acción:** comparar casas, ver el movimiento y registrar un pick.
- **Valor:** **histórico de cuotas y CLV** (nadie lo tiene).
- **Métrica:** uso de las pestañas de histórico (Pro).
- **Depende de:** el proveedor de odds y la captura de snapshots.

### 20 · Historical Replay

- **Problema:** «¿qué se sabía antes del partido?».
- **Usuario:** P2.
- **Datos:** consultas as-of de stats, cuotas y predicciones.
- **Acción:** elegir un instante, avanzar en el tiempo y comparar con el resultado.
- **Valor:** aprendizaje sin sesgo retrospectivo.
- **Métrica:** sesiones de Replay por usuario Elite.
- **Depende de:** `HISTORICAL_STORAGE` y 17.

### 21 · Prediction Center

- **Problema:** ver probabilidades confiables.
- **Usuario:** P1 y P2.
- **Datos:** `Prediction` de modelos que pasaron el gate y el mercado sin vig.
- **Acción:** filtrar por liga o mercado, ver la explicación e ir al modelo.
- **Valor:** probabilidades con calibración publicada.
- **Métrica:** usuarios que consultan la calibración.
- **Depende de:** 22 y el pipeline de modelos. **En el MVP:** solo la metodología y el estado «en validación».

### 22 · Model Lab

- **Problema:** confiar o desconfiar de un modelo con evidencia.
- **Usuario:** P2.
- **Datos:** registro de modelos, versiones, Brier, log loss, calibración, CLV y Baseline 0.
- **Acción:** comparar versiones y temporadas.
- **Valor:** transparencia radical.
- **Métrica:** visitas desde Prediction Center.
- **Depende de:** `services/models`. **En el MVP:** Baseline 0 documentado.

### 23 · Backtesting Studio

- **Problema:** probar estrategias o modelos sin leakage.
- **Usuario:** P2 (Elite).
- **Datos:** histórico as-of y predicciones registradas.
- **Acción:** configurar y ejecutar un backtest (job asíncrono) y ver los resultados con su IC.
- **Valor:** herramienta profesional.
- **Métrica:** backtests por usuario Elite.
- **Depende de:** 20, 22 y jobs Python.

### 24 · PitchLab AI

- **Problema:** responder preguntas sin navegar 6 pantallas.
- **Usuario:** P1 y P2.
- **Datos:** API interna vía herramientas tipadas.
- **Acción:** preguntar con el contexto actual y ver la respuesta con fuentes y hora.
- **Valor:** velocidad y explicaciones.
- **Métrica:** respuestas útiles (feedback) y costo por consulta.
- **Depende de:** API v1 estable y `AI_ARCHITECTURE`.

### 25 · My Lab (+ rendimiento, ex-27)

- **Problema:** «¿cómo me está yendo realmente?».
- **Usuario:** P1–P3.
- **Datos:** picks propios, calificaciones, CLV y simulador de bankroll (educativo).
- **Acción:** revisar el journal, filtrar, ver el rendimiento con IC y ocultar o compartir picks.
- **Valor:** autoconocimiento honesto.
- **Métrica:** usuarios con 10 o más picks.
- **Depende de:** 36 y el feed de resultados.

### 26 · Watchlists & Alerts

- **Problema:** no perder lo que importa.
- **Usuario:** P1 y P2.
- **Datos:** entidades seguidas y reglas de alerta.
- **Acción:** seguir, crear alertas y recibirlas.
- **Valor:** retención.
- **Métrica:** usuarios con 1 o más alertas activas y retención W4.
- **Depende de:** 34 y jobs.

### 28 · Account & Billing

- **Problema:** autogestión segura.
- **Usuario:** todos.
- **Datos:** perfil, sesiones, suscripción, facturas, CFDI, consentimientos y referidos.
- **Acción:** editar, cambiar de plan, cancelar, descargar datos y pausar el módulo social.
- **Valor:** cumplimiento y confianza.
- **Métrica:** tickets de soporte por cada 100 usuarios.
- **Depende de:** 03, 38 y `BillingProvider`.

### 29 · Admin Dashboard

- **Problema:** ver la salud del negocio y del sistema.
- **Usuario:** P5.
- **Datos:** usuarios, trials, conversiones, MRR, ingestas y errores.
- **Acción:** detectar problemas y entrar al detalle.
- **Valor:** operación de un fundador solo.
- **Métrica:** tiempo de detección de incidentes.
- **Depende de:** PostHog, Sentry y DB.

### 30 · Admin Data Ops

- **Problema:** pipelines que fallan en silencio.
- **Usuario:** P5.
- **Datos:** jobs, frescura por liga, diferencias entre proveedores y `provider_ref` pendientes.
- **Acción:** reintentar, reconciliar entidades y mapear emblemas.
- **Valor:** confiabilidad de los datos.
- **Métrica:** % de ligas dentro de su SLA de frescura.
- **Depende de:** `services/ingest`.

### 31 · Admin Model Ops

- **Problema:** gobernar qué modelo se publica.
- **Usuario:** P5.
- **Datos:** model registry, evaluaciones y drift.
- **Acción:** promover o retirar una versión (con auditoría).
- **Valor:** el gate de publicación.
- **Métrica:** modelos activos dentro del umbral de calibración.
- **Depende de:** 22.

### 32 · Admin Billing, Users y Moderation

- **Problema:** soporte, abuso y moderación.
- **Usuario:** P5.
- **Datos:** usuarios, roles, suscripciones, invitaciones, referidos y reportes.
- **Acción:** conceder planes, crear invitaciones, resolver reportes y sancionar.
- **Valor:** seguridad del ecosistema.
- **Métrica:** tiempo de resolución de reportes.
- **Depende de:** 28, 36 y 38.

### 33 · Global Search

- **Problema:** llegar a cualquier entidad rápido.
- **Usuario:** todos.
- **Datos:** índice FTS/trigram de ligas, equipos, jugadores y partidos.
- **Acción:** buscar con ⌘K y navegar.
- **Valor:** velocidad.
- **Métrica:** búsquedas con clic en un resultado.
- **Depende de:** DB.

### 34 · Notification Center

- **Problema:** centralizar alertas y avisos.
- **Usuario:** todos.
- **Datos:** notificaciones (alertas, referidos, billing, sistema).
- **Acción:** leer, marcar como leídas y abrir con el contexto.
- **Valor:** retención.
- **Métrica:** CTR de notificaciones.
- **Depende de:** 26.

### 35 · Help, Metodología y Legal

- **Problema:** confianza y cumplimiento.
- **Usuario:** todos y SEO.
- **Datos:** contenido MDX, glosario y textos legales.
- **Acción:** leer y enlazar desde cada métrica («¿qué es esto?»).
- **Valor:** transparencia y SEO.
- **Métrica:** visitas a Metodología desde la app.
- **Depende de:** `COMPLIANCE_REGISTER.md` y redes.

### 36 · Public Profile & Pick Journal

- **Problema:** demostrar criterio sin capturas editables.
- **Usuario:** P3 (y P1).
- **Datos:** `Pick`, calificación, CLV y perfil.
- **Acción:** registrar, bloquear, compartir y ver el perfil de otros.
- **Valor:** **reputación verificable** y crecimiento por redes.
- **Métrica:** picks registrados a la semana y share cards compartidas.
- **Depende de:** 17, el feed de resultados y `SOCIAL_ARCHITECTURE`.

### 37 · Leaderboards

- **Problema:** descubrir analistas con historial real.
- **Usuario:** P1–P3.
- **Datos:** agregados por deporte y periodo, muestra mínima y CLV.
- **Acción:** filtrar, ver perfiles y seguir.
- **Valor:** comunidad y aspiración, **sin premios** (C-01).
- **Métrica:** visitas a perfiles desde el leaderboard.
- **Depende de:** 36 y el flag legal (FD-07).

### 38 · Referrals & Invites

- **Problema:** crecer sin pagar adquisición.
- **Usuario:** P3 y admin.
- **Datos:** `Referral`, `ReferralRedemption` e `Invite`.
- **Acción:** compartir el link o QR, canjear y ver las recompensas.
- **Valor:** el trial gratis atrae usuarios y la recompensa motiva a los creadores.
- **Métrica:** % de registros por referido, conversión de referidos y K-factor.
- **Depende de:** 03, 28 y `AUTH_BILLING_GROWTH`.
