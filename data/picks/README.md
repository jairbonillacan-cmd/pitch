# Picks Quincenales de PitchLab (13–26 de noviembre de 2026)

Este directorio contiene la salida completa y reproducible de los motores de pronóstico de PitchLab para todos los partidos de **esta semana (`2026-11-13` al `2026-11-19`)** y **la próxima semana (`2026-11-20` al `2026-11-26`)**, cruzada con cuotas reales de mercados públicos autorizados, XI proyectado, bajas, lesiones, titulares de QB y clima horario.

## Archivos incluidos

| Archivo | Descripción |
| :--- | :--- |
| [`latest.json`](./latest.json) | Alias canónico listo para consumir desde `apps/web` (copia exacta del snapshot activo). |
| [`picks_2026-11-13_2026-11-26.json`](./picks_2026-11-13_2026-11-26.json) | Dataset estructurado completo (`schemaVersion: "pitchlab_biweekly_picks_v3.2.0"`, **128 partidos**, `incompatiblePickSets: 0`). |
| [`picks_2026-11-13_2026-11-26.csv`](./picks_2026-11-13_2026-11-26.csv) | Tabla plana CSV exportable con los 128 encuentros, probabilidades, cuotas justas, cuotas de mercado, picks por nivel de riesgo y bajas/notas. |
| [`REPORTE_PICKS_2026-11-13_2026-11-26.md`](./REPORTE_PICKS_2026-11-13_2026-11-26.md) | Reporte ejecutivo en Markdown legible directamente en GitHub (metodología, mercados disponibles, alineaciones/noticias, tabla Top EV paper-trading y desglose por liga). |

---

## Estructura del JSON (`data/picks/latest.json`)

```jsonc
{
  "schemaVersion": "pitchlab_biweekly_picks_v3.2.0",
  "generatedAtUtc": "2026-11-13T22:15:00Z",
  "window": {
    "estaSemana": { "start": "2026-11-13", "end": "2026-11-19" },
    "proximaSemana": { "start": "2026-11-20", "end": "2026-11-26" }
  },
  "governanceAndCompliance": { ... },
  "counts": {
    "totalMatchesAnalyzed": 128,
    "nflGames": 30,
    "coreFootballMatches": 58,
    "uclMatches": 18,
    "multisportMatches": 22,
    "estaSemanaCore": 15,
    "proximaSemanaCore": 91,
    "incompatiblePickSets": 0
  },
  "topValuePaperTrading": [ ... ], // Top selecciones con EV positivo (solo Paper-Trading / Informativo)
  "nfl": [ ... ],                  // 30 partidos (Weeks 10, 11 y 12 Thanksgiving)
  "football": [ ... ],             // 58 partidos (Liga MX Play-In, EPL, LaLiga, Bundesliga, Serie A, Ligue 1)
  "ucl": [ ... ],                  // 18 partidos (UEFA Champions League Jornada 5)
  "multisport": [ ... ]            // 22 partidos (NBA, NHL, NCAAF vía Spacetime Multi-Sport v3.0 + Kalshi)
}
```

### Campos clave por partido (`football`, `nfl`, `ucl`)

- **Identificación y calendario:** `matchId`, `windowBucket` (`"esta_semana"` | `"proxima_semana"`), `sport`, `league`, `leagueSlug`, `round`, `date`, `kickoffUtc`, `homeTeam`, `awayTeam`.
- **Mercados y cuotas reales:**
  - `availableMarkets`: mercados abiertos detectados para ese partido (ej. `1X2`, `Doble Oportunidad`, `Draw No Bet`, `Over/Under 2.5 / 3.5`, `BTTS`, `Hándicap Asiático`, `Moneyline`, `Spread`, `Totales`).
  - `marketSources`: fuentes públicas verificadas (`nflverse`, `kalshi`, `polymarket`, `fanduel_opener`).
  - `marketLines`: momios decimales/americanos, spreads y líneas de totales vigentes.
- **Proyección del motor (`engineProjection`):**
  - Fútbol (`MatchOutlook v3.2` + `Tachyon v3.0` + `Singularity v3.0`): `pHome`, `pDraw`, `pAway`, `fairOdds1X2`, `lambdaHome`, `lambdaAway`, `expectedTotalGoals`, `coherentScore`, `pOver15`, `pOver25`, `pOver35`, `pBttsYes`.
  - NFL (`MatchOutlook NFL v3.2` + `Minkowski v3.0`): `pHome`, `pAway`, `fairHomeDec`, `fairAwayDec`, `expectedTotal`, `projectedScore`, `spreadCoverHomeProb`, `totalOverProb`.
- **Picks compatibles (`picks`):**
  - Generados con `generateMatchPicks` / `arePicksCompatible` (`compatible: true`, `0` contradicciones lógicas en los 128 partidos):
    - `featured`: pick principal destacado para tarjetas resumidas en UI (`market`, `rawMarketKey`, `selection`, `p`, `fairOdds`, `label`, `profile`).
    - `conservadora`: opción de menor varianza compatible con la tesis principal (o `null` si ninguna supera el umbral conservador).
    - `intermedia`: selección balanceada compatible con la tesis principal.
    - `arriesgada`: selección de mayor cuota coherente con el mismo guion de partido.
- **Valor de mercado (`marketValuePaperTrading`):** `bestValue`, `allPositiveEdges` y `allComparisons` sin vig (`pEngine` vs `pMarketNovig`, `edgeProbPct`, `evPct`).
- **Alineaciones, bajas y contexto (`predictedXI`, `lineupsAndNews`):**
  - En ligas core de fútbol: `predictedXI` completo local/visitante + lista de lesionados/suspendidos y notas de fecha FIFA / Play-In.
  - En NFL: QBs titulares proyectados (`homeQb`, `awayQb`), reporte de bajas clave y pronóstico horario de viento/precipitación en estadios abiertos (`Open-Meteo`).

---

## Guía rápida para integrarlo en `apps/web`

1. **Traer los archivos a tu rama de trabajo (`gemini-reestructura` o `main`):**
   ```bash
   git fetch origin generate_match_picks_engine
   git checkout origin/generate_match_picks_engine -- data/picks scripts/generate-biweekly-picks.mjs
   ```
2. **Compatibilidad directa de `leagueSlug`:**
   Los objetos dentro de `football` utilizan exactamente los mismos slugs de `PRODUCT_LEAGUES` que consumen `apps/web/src/server/outlook.ts` y `apps/web/src/server/snapshots.ts`:
   - `"liga-mx"`, `"premier-league"`, `"laliga"`, `"bundesliga"`, `"serie-a"`, `"ligue-1"` (más `"champions-league"` en `ucl` y `"nfl"` en `nfl`).
   - Nota útil para NFL: el snapshot habitual `data/snapshots/nfl/latest.json` solo guarda la semana activa, mientras que `data/picks/latest.json` ya trae consolidadas **Weeks 10, 11 y 12 (Thanksgiving)** completas (`30` juegos).
3. **Gobernanza `v3.1` / `v3.2`:**
   - Ningún artefacto congelado (`packages/models/weights/production_segments_v3_1.json`) fue modificado.
   - Con `0/60` segmentos habilitados en producción real, los campos `marketValuePaperTrading` y `topValuePaperTrading` deben mostrarse en la web con etiqueta **Informativa / Paper-Trading** (sin sugerir stake Kelly de dinero real).

## Cómo regenerar el dataset

Desde la raíz del repositorio:

```bash
node scripts/generate-biweekly-picks.mjs
```

El script recompila en memoria los motores TypeScript reales del monorepo, actualiza automáticamente `data/picks/picks_2026-11-13_2026-11-26.json`, `data/picks/latest.json` y `data/picks/picks_2026-11-13_2026-11-26.csv`, y valida que `incompatiblePickSets === 0`.
