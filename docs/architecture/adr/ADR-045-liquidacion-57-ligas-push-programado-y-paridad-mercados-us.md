# ADR-045 · Liquidación y CLV en 57 ligas, despachador Web Push programado y paridad de mercados US/MLB

- **Estado:** Aceptada
- **Fecha:** 2026-11-19
- **Contexto:** Tras expandir PitchLab a 57 competencias (ADR-043), la captura de cuotas de cierre (`closing-odds.ts`), la liquidación automática (`settlement.ts`) y los mercados derivados (`outlook-derived-rows.ts`) seguían concentrados en las ligas núcleo. Además, faltaba el cron de despacho Web Push para avisos prepartido (60 min) y movimientos de línea ≥ 5 %.

## Decisión
1. **Liquidación y cierre multi-liga (`settlement.ts` + `closing-odds.ts`):**
   - `loadFinalMatchScores` incorpora `data/snapshots/<league>/season-results.json` para resolver miles de marcadores finales verificados en las 57 competencias.
   - `collectPreKickoffClosingOdds` captura cuotas de cierre reales desde `game.spacetime?.market`, `game.markets` (alimentado por `market-lines.json`) y `game.picks` con `capturedAt <= kickoffAt`, habilitando CLV real en toda la plataforma.
2. **Despachador Web Push programado (`/api/cron/push-alerts`):**
   - `apps/web/src/server/push-alerts.ts` evalúa partidos seguidos a 45–75 min del saque inicial y movimientos de línea ≥ 5 % respecto a apertura, filtrando por preferencias del socio (`favoriteLeagues`, `followedTeams`, `lineMoveAlerts`, `pushEnabled`) con deduplicación en `live_feed_cache`.
   - Se registra en `apps/web/vercel.json` (`*/30 * * * *`) y se invoca opcionalmente al final de `.github/workflows/odds-refresh.yml`.
3. **Paridad de mercados NBA, NHL y MLB + abridores probables MLB:**
   - `buildDerivedUsSportRows` genera hándicaps alternativos, totales alternativos, totales por equipo y 1.ª mitad / 1er periodo / Primeras 5 entradas (F5) a partir de las proyecciones calibradas del motor (`isDerived: true`).
   - `MatchPreGameContextSchema` añade `probablePitchers` (`home`/`away`: nombre, mano, ERA, WHIP, K/9, récord y retrato seguro), hidratado desde ESPN en `bzzoiro-expansion-cli.ts` y mostrado en `MatchContextPanel`.
   - `LIVE_LEAGUES` en `apps/web/src/server/live.ts` se deriva dinámicamente de `BZZOIRO_LEAGUE_IDS` cubriendo todas las competencias de fútbol con soporte en vivo.

## Consecuencias
- Los socios reciben liquidación y CLV verificado incluso en ligas de expansión y deportes US.
- NBA, NHL y MLB alcanzan paridad de tarjetas derivadas en Match Studio sin fabricar cuotas de casas ausentes.
