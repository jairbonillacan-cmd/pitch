# PitchLab — pre-MVP

Plataforma de inteligencia deportiva con bankroll virtual. **No acepta apuestas ni procesa dinero
de apuestas**: publica probabilidades estimadas, cuota justa y comparación de datos con fuente y hora.

Este repositorio contiene el pre-MVP para socios: landing, panel de partidos por liga, análisis por
partido y las páginas legales.

## Estructura

```
apps/web                 Next.js 15 (App Router) — landing, panel y API de beta
packages/contracts       Tipos y esquemas Zod compartidos (GameDTO, GameAnalysis, snapshots)
packages/engines-reference  Baseline 0: motores reconstruidos de referencia (paridad Δ=0)
packages/models          Modelos v2: Dixon-Coles estimado (fútbol) y ratings por rival (NFL)
packages/sports-assets   Registro de emblemas y mascotas
packages/tokens, ui      Design system y componentes
services/ingest          Descarga de fuentes, snapshots y backtest walk-forward
data/snapshots/<liga>/   Corte diario + latest.json (la app lee de aquí)
Reportes/modelos/        Reporte del backtest (métricas y bootstrap)
```

## Comandos

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # gate anti-demo + build de todos los paquetes + linter
pnpm test       # tests de todos los paquetes
pnpm snapshot   # descarga fuentes y regenera data/snapshots (modelo v2 por defecto)
pnpm backtest   # backtest walk-forward v2 vs Baseline 0 vs ingenuo
```

`MODEL_VERSION=v1` vuelve al Baseline 0 sin tocar código. El backtest es reproducible y escribe
`Reportes/modelos/BACKTEST-V2.md` y `backtest-v2.json`.

## Modelos

| Versión | Fútbol | NFL | Estado |
|---|---|---|---|
| **v1 — Baseline 0** | Pitágoras → Log5 → localía fija → Poisson/Dixon-Coles con parámetros heredados | Pitágoras → Log5 → normal con σ fija | Referencia de comparación |
| **v2 — candidato** | Dixon-Coles estimado por máxima verosimilitud: ataque/defensa ajustados por rival, decaimiento temporal, localía y ρ estimados, intervalos de confianza | Ratings de ofensiva/defensiva por mínimos cuadrados regularizados, σ de margen y total estimadas, intervalos | `candidate`: **no ha pasado el gate** |

Backtest walk-forward (solo datos previos a cada jornada/semana; 2 temporadas):

| Liga | Modelo | n | LogLoss | Brier | Acierto |
|---|---|---:|---:|---:|---:|
| Premier League | v2 | 327 | **1.0230** | **0.6139** | 51.1 % |
| Premier League | Baseline 0 | 327 | 1.0239 | 0.6145 | 48.3 % |
| Premier League | Ingenuo | 327 | 1.0741 | 0.6493 | 45.0 % |
| NFL | v2 | 307 | 0.6479 | 0.4579 | **63.8 %** |
| NFL | Baseline 0 | 307 | **0.6419** | **0.4519** | 60.3 % |
| NFL | Ingenuo | 307 | 0.6999 | 0.5066 | 48.5 % |

Lectura honesta: **v2 le gana al ingenuo en las dos ligas, pero está estadísticamente empatado con
el Baseline 0** (Δ log-loss −0.0009 en fútbol con IC95 % [−0.0225, +0.0207]; +0.0060 en NFL con
IC95 % [−0.0074, +0.0206]). Por eso se publica como `candidate` y con la etiqueta «en validación»:
el gate exige batir al Baseline 0 con un IC que excluya el 0 (`docs/architecture/PREDICTION_ARCHITECTURE.md` §5).

## Datos y licencias

| Fuente | Uso | Licencia |
|---|---|---|
| openfootball / football-data.org | Calendario y resultados de fútbol | CC0 / términos con atribución |
| nflverse | Calendario, resultados y stats NFL | CC-BY 4.0 (sin datasets FTN) |
| API-Football | Liga MX | Plan gratuito, licencia comercial por confirmar |
| The Odds API | Cuotas comparadas | Plan gratuito |

Sin scraping de casas de apuestas ni de APIs sin licencia. La atribución vive en `/legal/creditos`.

## Deploy

Variables (ver `.env.example`):

- `PITCHLAB_BETA_CODE` — PIN de 4 dígitos de la beta (acepta también `PREVIEW_ACCESS_CODE`).
- `PITCHLAB_COOKIE_SECRET` — secreto HMAC de 32+ caracteres (acepta `BETA_COOKIE_SECRET`).
- `API_FOOTBALL_KEY` — opcional; sin clave, Liga MX aparece como «Pronto».
- `FOOTBALL_DATA_API_KEY` — opcional; mejora la ingesta de la Premier League.

El build de producción incluye el gate `scripts/check-no-demo-prod.mjs`: datos demo no llegan a
producción. Los snapshots se versionan en `data/snapshots/` y el workflow `.github/workflows/pre-mvp-snapshot.yml`
los actualiza desde GitHub Actions.
