# Revisión del stack recomendado (datos, backend y modelos)

> **Pregunta del fundador:** «prepara datos históricos, ve si ya usamos ese backend».
> **Respuesta corta:** el stack recomendado coincide en 4 de 5 piezas con lo ya decidido; la única divergencia real es **FastAPI**, y no hace falta. Los datos históricos ya existen y están auditados (`HISTORICAL_DATA.md`).
> **Fecha:** 2026-11-09 · Decisiones vigentes: ADR-007 (Postgres/Neon), ADR-009 (modelos Python por lotes), ADR-013 (IA solo para narrativa).

## 1. Recomendación frente al estado real

| Recomendación | Estado en PitchLab | Evidencia |
|---|---|---|
| API confiable de resultados, estadísticas, calendarios, alineaciones e histórico | **Parcial y suficiente para empezar.** nflverse (NFL 1999–2026) y openfootball (fútbol 2010-11–2026-27) ya alimentan un corpus de 34,168 partidos. API-Football cubre Liga MX; The Odds API, cuotas. **No hay** alineaciones ni lesiones. | `data/history/manifest.json`, `services/ingest/src/adapters/` |
| football-data.org (12 competiciones, 10 req/min) | **Cierto, con matices:** el plan Free no incluye **Liga MX** ni histórico profundo (las 10 temporadas de historia son del plan de €29/mes), y los marcadores llegan con retraso. Ya hay un adaptador opcional. | Adaptador `services/ingest/src/adapters/football-data.ts`; [pricing](https://www.football-data.org/pricing) y [coverage](https://www.football-data.org/coverage) |
| Empezar por Elo, Poisson y regresión; después XGBoost/LightGBM | **Poisson ya está**: Dixon-Coles con MLE, decaimiento temporal y ρ. NFL: ratings ridge. **Falta Elo** explícito, una regresión propia y los GBMs. | `packages/models/src/football/dixon-coles.ts`, `packages/models/src/nfl/ratings.ts` |
| Python + FastAPI | **Python sí, FastAPI no.** ADR-009: modelos por lotes que escriben en tablas; la web solo lee. Un servicio siempre encendido agrega costo y latencia sin necesidad. Hoy los modelos están en TypeScript. | `docs/architecture/adr/ADR-009…`, `services/` (solo `ingest`) |
| PostgreSQL | **Decidido, aún no implementado.** ADR-007: Neon + Drizzle + migraciones en `packages/db`. `packages/db` todavía no existe; el pre-MVP lee snapshots JSON. | `docs/architecture/adr/ADR-007…` |
| Redis | **Ya se usa, de forma opcional.** El rate limit de la beta usa Upstash REST si hay credenciales y cae a memoria si no. No se usa como caché de datos. | `apps/web/src/server/beta-auth.ts` |
| Next.js + TypeScript + Tailwind | **Ya es el stack.** App Router, Tailwind v4 desde tokens, Storybook como contrato. | `apps/web/`, `packages/tokens/`, `packages/ui/` |
| «No necesitas un LLM para probabilidades» | **De acuerdo.** La IA es solo narrativa y explicación (ADR-013); las probabilidades salen de modelos estadísticos. | `docs/architecture/AI_ARCHITECTURE.md` |

## 2. Lo que sí importa de la recomendación

1. **Datos primero.** Ya está hecho: corpus reproducible, con digest por archivo, controles de identidad de equipos y reporte de calidad. Sin esto, cualquier modelo es decorativo.
2. **Motor estadístico antes que ML.** El benchmark walk-forward muestra que Dixon-Coles le gana a la referencia ingenua en la Premier League con 5,898 predicciones (Δ log loss −0.0905, IC 95 % que excluye el 0). En NFL los ratings le ganan al ingenuo (−0.0315) pero **todavía pierden contra el mercado** (+0.0421).
3. **Honestidad sobre el mercado.** Con solo cuotas propias desde el día 1, el gate de publicación de `PREDICTION_ARCHITECTURE.md` §5 aún no se puede cumplir; el histórico de nflverse permite investigar, no publicar.

## 3. Brechas reales, en orden

| # | Brecha | Por qué ahora | Entregable |
|---|---|---|---|
| 1 | Base de datos transaccional | Todo lo demás (picks, predicciones, cuotas) depende de ella; hoy no hay `packages/db` | Esquema Drizzle + migraciones + carga de la temporada en curso |
| 2 | Modelo Elo | Es el candidato 1 del plan, barato, interpretable y buen *baseline* frente al mercado | `packages/models/src/football/elo.ts` + evaluación en el benchmark |
| 3 | Features as-of | El corpus ya trae `availableAt`; falta la tabla de features y el test de *leakage* | Constructor de features + prueba de fuga en CI |
| 4 | GBM (LightGBM) | Solo tiene sentido después de (2) y (3) | `services/models` en Python (ADR-009) |
| 5 | Redis como caché | Hasta que haya endpoints públicos que lo necesiten | Upstash + TTL por recurso |

## 4. Lo que no haría (y por qué)

- **FastAPI como API de modelos ahora:** las predicciones se calculan por adelantado. Si más adelante hace falta inferencia en línea, el ADR-009 ya deja la puerta abierta sin reescribir la web.
- **Redis como cola de trabajos:** en la fase $0 los jobs son GitHub Actions; BullMQ obligaría a mantener un worker propio.
- **Empezar por IA/LLM:** no produce probabilidades defendibles y cuesta más que el ingreso de Pro (hallazgo de F3).
- **Scraping de casas o de FBref:** prohibido por `COMPLIANCE_REGISTER.md`.
- **Pagar datos antes de tener ingresos:** el corpus actual cubre NFL, Premier League, LaLiga, Bundesliga, Serie A, Ligue 1 y Liga MX con costo US$0.

## 5. Cómo verificarlo

```bash
pnpm history            # reconstruye/valida el corpus (0 errores de calidad)
pnpm backtest:history   # benchmark walk-forward sobre 34,168 partidos
pnpm test               # incluye la regresión del solver de ratings NFL
```

- Reporte de calidad: `Reportes/datos/HISTORICO-QUALITY.md`.
- Benchmark: `Reportes/modelos/BACKTEST-HISTORICO.md`.
- Contrato del histórico: `docs/architecture/HISTORICAL_DATA.md`.

## 6. Fuentes externas consultadas

- football-data.org — [pricing](https://www.football-data.org/pricing) (plan Free: 12 competiciones, 10 llamadas/minuto, marcadores con retraso) y [coverage](https://www.football-data.org/coverage) (sin Liga MX en el plan Free).
- openfootball/football.json — [repositorio](https://github.com/openfootball/football.json) (CC0).
- nflverse — [nflverse-data](https://github.com/nflverse/nflverse-data) (CC-BY 4.0).
