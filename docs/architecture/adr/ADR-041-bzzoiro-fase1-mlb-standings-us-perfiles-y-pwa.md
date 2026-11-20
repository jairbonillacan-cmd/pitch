---
status: accepted
date: 2026-11-19
extends:
  - ADR-014
  - ADR-017
  - ADR-029
  - ADR-035
  - ADR-039
---

# ADR-041: Bzzoiro Fase 1, MLB y standings US por conferencia, retratos/estadísticas de jugadores, búsqueda global, comparador H2H y PWA/Push

- **Estado:** Aceptada (`accepted` e implementada en `gemini-dos`).
- **Fecha:** 2026-11-19.

## Contexto

Tras consolidar la alfa `0.0.1-alpha` (`ADR-039` y `ADR-040`), el producto requería cerrar la brecha multi-deporte y elevar la utilidad diaria para socios en escritorio y móvil:

1. **Integración Bzzoiro Fase 1 y cobertura MLB/US:** el Match Center en vivo, el prepartido y la tabla de cuotas necesitaban absorber las capacidades de Bzzoiro (modo ilimitado `BZZOIRO_UNLIMITED=1`, bajas nominales con fecha estimada, alineaciones estimadas/confirmadas, contexto de estadio/clima/árbitro/TV MX, mercados adicionales con apertura y dirección de línea, y NBA enriquecido), mientras que MLB faltaba como liga completa y las tablas US (`NBA`, `NHL`, `NFL`, `MLB`) carecían de selector por conferencia, `season-results.json` completos (`Últimas 5` reales) y bajas (`injuries.json`) automatizadas en crons.
2. **Logos oficiales MLB y retratos de entrenadores/jugadores US sin enlaces a `mlbstatic.com`:** según `PLAN_MOTORES_Y_FUENTES_2026_11.md` §4 está prohibido enlazar `mlbstatic.com` desde la app; además, `enrich-people-cli.ts` fabricaba URLs de retrato ESPN para prospectos sin foto (generando 404) y dejaba sin retrato a los entrenadores de MLB/NBA/NFL/NHL.
3. **Descubrimiento y profundidad analítica del socio:** los jugadores ya tenían ficha (`/app/[league]/teams/[teamId]/players/[playerSlug]`), pero no aparecían en `Ctrl+K`, carecían de estadísticas por deporte y últimos 5 juegos, no existía comparador rápido H2H ni gráfica de movimiento de línea / alertas de cambio de cuota, y la base PWA + Web Push de la migración `0024` aún no tenía interfaz de activación e instalación progresiva en `Mi cuenta`.

## Decisión

1. **Bzzoiro Fase 1 + MLB completo + automatización en GitHub Actions:**
   - Se integra Bzzoiro Fase 1 en `@pitchlab/contracts`, `@pitchlab/ingest`, `apps/web/src/server` y `@pitchlab/ui` (`bzzoiro-enrichment.ts`, `bzzoiro-benchmark-cli.ts`, `bzzoiro-nba-rich.ts`, `PreMatchModule.tsx`, `MatchContextPanel.tsx`, `MatchMarketsGrid.tsx`, `LiveMatchCenter.tsx`) con degradación segura cuando falta `BZZOIRO_API_KEY`.
   - Se incorpora MLB de punta a punta (`packages/models/src/mlb/`, `mlb-statsapi.ts`, `mlb-snapshot.ts`, `us-divisions.ts`, `us-standings-cli.ts`) y selector por conferencia (`Liga Americana / Liga Nacional`, `Este / Oeste`, `AFC / NFC`) en `CoreMatchViews.tsx`.
   - `us-standings-cli.ts` hidrata `season-results.json`, racha real de 5 juegos (`StandingRow.form`, 100 % en NBA 30/30, NHL 32/32 y MLB 30/30) y `injuries.json` reales vía ESPN público (corrigiendo el rechazo HTTP 403 por `User-Agent` en `injuries.ts` y mapeando listas IL de MLB).
   - `.github/workflows/pre-mvp-snapshot.yml` y `odds-refresh.yml` cablean `snapshot:us-standings`, `season-form-cli.ts` y `vars.BZZOIRO_UNLIMITED`.
2. **Logos oficiales MLB locales y retratos abiertos verificados para entrenadores US:**
   - `packages/sports-assets/scripts/sync-mlb-assets.mjs` descarga los 30 escudos oficiales de MLB y el emblema oficial de la liga (`128×128` PNG transparente vía ESPN combiner) a `apps/web/public/brand/official/mlb/`, registrados en `getOfficialEspnTeamLogoUrl` / `getOfficialEspnLeagueLogoUrl` (cero enlaces a `mlbstatic.com`).
   - `packages/sports-assets/scripts/sync-us-coach-portraits.mjs` descarga retratos con licencia abierta verificada (CC / Dominio Público) desde Wikimedia Commons, los optimiza a `160×160` WebP en `apps/web/public/brand/official/coaches/<league>/<team-slug>.webp` (110 entrenadores cubiertos: 27/30 MLB, 25/30 NBA, 30/32 NFL, 28/32 NHL) con atribución en `LICENSE-wikimedia.txt`, validados con regex estricto en `resolvePersonPhotoUrl()`.
   - `enrich-people-cli.ts` solo asigna `photoKey` de ESPN cuando `athlete.headshot.href` viene explícitamente en la nómina (eliminando 404 en prospectos) y pre-hidrata `seasonMetrics` + `recentGames` (últimos 5 juegos) complementados bajo demanda en SSR con caché de 6 h (`player-live-stats.ts`).
3. **Búsqueda global de jugadores (`Ctrl+K`), movimiento de línea, Comparador H2H y PWA/Push:**
   - **Búsqueda ligera `/api/search/players`:** índice en memoria sobre `data/snapshots/*/squads.json` (TTL 5 min) consumido con debounce (`150 ms`) y `AbortController` en `CommandPaletteModal`, sin engordar el payload SSR (`ADR-035`) y con envío seguro para IME (`isComposing || keyCode === 229`).
   - **Perfil de jugador y tabla responsiva `@container`:** `PlayerProfileClubView` muestra métricas de temporada específicas del deporte y una tabla «Últimos 5 partidos» que colapsa a tarjetas con etiquetas `::before` en contenedores estrechos (`< 520 px`).
   - **Movimiento de línea y alertas:** `MatchMoneyPanel` incorpora `OddsMovementSparkline` (`<figure>`/`<figcaption>` + `<svg role="img">`, cuota justa visible solo con `fullAccess`) y `notifications.ts` emite alertas `line-move:` para partidos vigilados respetando `isRedacted`.
   - **Comparador rápido H2H (`/app/comparar` y `/api/compare`):** nueva ruta aislada (`@pitchlab/ui/compare`) con pestañas WAI-ARIA `Equipos H2H` (barras proporcionales + historial directo real) y `Jugadores` (bio + métricas de temporada), accesible desde perfiles de equipo/jugador y `Ctrl+K`.
   - **PWA instalable y Web Push (`PwaAndPushSection` en `PrefsTab`):** conecta los interruptores y temas push (`picks`, `live`, `social`) con `GET/POST/DELETE /api/me/push` y la migración `0024`, e implementa instalación progresiva con `navigator.install()` y respaldo `beforeinstallprompt` ocultando el control cuando el navegador no soporta ninguno.

## Alternativas descartadas

- **Enlazar `img.mlbstatic.com` o `www.mlbstatic.com` para escudos y retratos MLB:** descartado por la política explícita de `PLAN_MOTORES_Y_FUENTES_2026_11.md` §4.
- **Incluir los ~6,000 jugadores en `PlatformDataset` SSR para `Ctrl+K`:** descartado porque dispararía el peso serializado de todas las rutas `/app/*` por encima del presupuesto de `320 kB` (`ADR-035`).
- **Mostrar un botón fijo de «Instalar app» con instrucciones manuales en navegadores sin soporte:** descartado para evitar controles muertos y seguir las guías de `install-web-app`.

## Consecuencias

- Las 10 ligas de clubes (6 fútbol + NFL, NBA, NHL y MLB) cuentan con tablas reales, `season-results.json`, `Últimas 5`, `injuries.json`, plantillas verificadas, retratos de entrenadores y automatización en GitHub Actions.
- El presupuesto de First Load JS se mantiene protegido gracias al endpoint `/api/search/players` y al sub-export `@pitchlab/ui/compare`.
- Al activar `BZZOIRO_API_KEY`, `BZZOIRO_UNLIMITED=1` y las claves VAPID en producción (y aplicar `0023`/`0024` en Neon producción), tanto la ingesta enriquecida como Web Push operan sin cambios adicionales de código.
