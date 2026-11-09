# Modelos, ligas y cobertura (estado del pre-MVP)

> **Propósito:** que cualquier sesión (o persona) entienda qué publica hoy el producto, con qué
> modelo, cómo se evalúa y qué falta, sin leer todo el código.
> **Última actualización:** 2026-11-09 · **Rama:** `feat/pre-mvp`

## 1. Ligas en la beta

| Liga | Fuente (licencia) | Emblemas | Temporada actual |
|---|---|---|---|
| Liga MX | API-Football Free | Sí (r1, 18 clubes) | Apertura 2026 |
| Premier League | football-data.org o openfootball (CC0) | Sí (r2, 20 clubes) | 2026/27 |
| LaLiga | openfootball (CC0) | Sí (r1, 20 clubes) | 2026/27 |
| Bundesliga | openfootball (CC0) | **Fallback neutro** (BL + iniciales) | 2026/27 |
| Serie A | openfootball (CC0) | **Fallback neutro** (SA + iniciales) | 2026/27 |
| Ligue 1 | openfootball (CC0) | **Fallback neutro** (L1 + iniciales) | 2026/27 |
| NFL | nflverse (CC-BY 4.0) | Sí (r1, 32 equipos) | 2026 |

NHL y MLB están en el catálogo como `enabled: false` («Pronto»): sus APIs públicas no son
comerciales y no hay licencia.

## 2. Qué publica cada partido

- **Fútbol (20 mercados):** resultado, doble oportunidad, totales 1.5/2.5/3.5, ambos anotan,
  goles por equipo (línea 1.5) y marcador exacto (tres más probables).
- **NFL (14 mercados):** ganador, spread al mejor medio punto, hándicap alternativo ±3.5 y ±7.5,
  total y puntos por equipo.
- **Tabla de posiciones** por liga de fútbol, calculada con los partidos ya jugados (PJ, G, E,
  P, GF, GC y puntos) y su líder visible en la landing.
- **Factores (ficha):** fuerza ajustada por rival, localía estimada, tamaño de muestra,
  intervalo del 90 % y **forma reciente** (últimos cinco: G/E/P, puntos y goles).

## 3. Modelos

| | Fútbol | NFL |
|---|---|---|
| Base | Dixon-Coles estimado por máxima verosimilitud (IPF con contracción) | Ratings de ofensiva/defensiva por mínimos cuadrados regularizados (ridge) |
| Entradas | Goles, rival, localía, antigüedad, temporada anterior (peso 0.45) | Puntos, rival, localía (prior de 1.5), temporada anterior (opcional, apagada) |
| Parámetros estimados | ataque/defensa por equipo, ventaja de local, ρ, nivel de liga | intercepto, media localía, σ de margen y total |
| Incertidumbre | 240 simulaciones deterministas de los parámetros | σ estimadas de los residuales |
| Versión | `pitchlab-statistical-<liga>` v2.0.0 (`candidate`) | `pitchlab-statistical-nfl` v2.0.0 (`candidate`) |

El **Baseline 0** (`packages/engines-reference`) sigue disponible con `MODEL_VERSION=v1` y es la
vara de comparación del backtest; no se modifica.

## 4. Evaluación (retro, walk-forward)

| Liga | Modelo | n | LogLoss | Brier | Acierto | ECE |
|---|---|---:|---:|---:|---:|---:|
| Premier League | v2 | 327 | **1.022** | **0.613** | 49.2 % | 4.9 % |
| Premier League | Baseline 0 | 327 | 1.024 | 0.614 | 48.3 % | 2.9 % |
| Premier League | Ingenuo | 327 | 1.074 | 0.649 | 45.0 % | 4.8 % |
| NFL | v2 | 310 | 0.645 | 0.455 | **64.5 %** | 5.0 % |
| NFL | Baseline 0 | 310 | **0.641** | **0.451** | 60.3 % | 3.3 % |
| NFL | Ingenuo | 310 | 0.700 | 0.507 | 48.4 % | 5.8 % |

Lectura honesta: v2 le gana al ingenuo en las dos ligas y está **empatado** con el Baseline 0
(IC 95 % incluye el 0 en ambas). Por eso sigue como `candidate` y con la etiqueta «en validación».
La calibración se publica tal cual (4.9 % y 5.0 %) y se probó una capa de temperatura que **no** se
aplicó porque empeoraba el ECE.

Regenerar: `pnpm backtest` → `Reportes/modelos/BACKTEST-V2.md` y `.json`.

## 5. Cómo agregar una liga (checklist)

1. `packages/contracts/src/ids.ts`: agregar el id a `VALID_LEAGUES` y al regex de `TeamId`.
2. `packages/contracts/src/sports/index.ts`: entrada en `LEAGUE_CATALOG` (`enabled: true`).
3. Si hay emblemas: `packages/sports-assets/scripts/sync-assets.mjs` + `pnpm --filter
   @pitchlab/sports-assets build`. Si no, no hace falta: la UI usa iniciales.
4. `services/ingest/src/adapters/openfootball.ts`: `OpenFootballLeagueConfig` + normalizador.
5. `services/ingest/src/mappings.ts`: mapa curado de equipos o liga genérica (slug compartido).
6. `services/ingest/src/cli.ts`: paso de snapshot y `prior-season.ts` si hay histórico.
7. `apps/web/src/server/snapshots.ts`: `PRODUCT_LEAGUES` + etiqueta + temporada. El panel, la
   landing y la tabla de cobertura se actualizan solos.
8. Snapshot (`pnpm snapshot`), E2E y revisar `/metodologia`.

## 6. Operación

- **Snapshots:** escritura atómica con reintentos (`writeSnapshotFiles`). Se preserva cualquier
  análisis publicado antes del inicio del partido; solo se recalculan los partidos sin publicar.
- **CI (`.github/workflows/ci.yml`):** instalación congelada, build con gate anti-demo, tests
  unitarios y Playwright (desktop y móvil) en cada push/PR.
- **Snapshots programados (`.github/workflows/pre-mvp-snapshot.yml`):** cada 3 h en días de
  jornada y diario; hace commit de `data/snapshots` y dispara el deploy hook si existe.
- **Datos pesados fuera de git:** `data/history/` y `tools/` (investigación). El pipeline tolera
  su ausencia: sin histórico simplemente no pondera la temporada anterior.

## 7. Limitaciones conocidas

- Sin lesiones, alineaciones, clima ni árbitros: la incertidumbre real es mayor que la declarada.
- El precio de mercado no entra al modelo; el benchmark de mercado es solo de investigación.
- Al inicio de temporada el modelo se apoya en el promedio de liga y en la temporada anterior.
- Los mercados derivados comparten la misma proyección de goles: un sesgo se propaga a todos.
