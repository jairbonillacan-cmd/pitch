# PitchLab — pre-MVP

Plataforma de inteligencia deportiva con bankroll virtual. **No acepta apuestas ni procesa dinero
de apuestas**: publica probabilidades estimadas, cuota justa y comparación de datos con fuente y hora.

Este repositorio contiene el pre-MVP para socios: landing, panel de partidos por liga, análisis por
partido, metodología pública y las páginas legales.

**Ligas en la beta:** Liga MX, Premier League, LaLiga, Bundesliga, Serie A, Ligue 1 y NFL.
NHL y MLB aparecen como «Pronto».

Las ligas sin paquete de emblemas propio (Bundesliga, Serie A, Ligue 1) usan el **fallback
neutro** del sistema de diseño: iniciales por equipo y código de liga, nunca una imagen rota.

Cada partido publica hasta 20 mercados (resultado, doble oportunidad, totales, ambos anotan, goles
por equipo y marcador exacto), su cuota justa, el intervalo del 90 % del modelo, la forma reciente
de cada equipo y una tabla de posiciones calculada con los partidos ya jugados.

## Estructura

```
apps/web                 Next.js 15 (App Router) — landing, panel, metodología y API de beta
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

### Cómo verificar antes de empujar

```bash
pnpm install --frozen-lockfile
pnpm --filter @pitchlab/web exec playwright install --with-deps chromium   # solo la primera vez
pnpm build          # gate anti-demo + typecheck + linter
pnpm test           # 472 pruebas unitarias
pnpm --filter @pitchlab/web e2e   # 12 pruebas E2E (desktop y móvil), requiere el build
```

CI (`.github/workflows/ci.yml`) corre exactamente eso en cada push y PR.

## Modelos

| Versión | Fútbol | NFL | Estado |
|---|---|---|---|
| **v1 — Baseline 0** | Pitágoras → Log5 → localía fija → Poisson/Dixon-Coles con parámetros heredados | Pitágoras → Log5 → normal con σ fija | Referencia de comparación |
| **v2 — candidato** | Dixon-Coles estimado por máxima verosimilitud: ataque/defensa ajustados por rival, decaimiento temporal, localía y ρ estimados, intervalos de confianza | Ratings de ofensiva/defensiva por mínimos cuadrados regularizados, σ de margen y total estimadas, intervalos | `candidate`: **no ha pasado el gate** |

Backtest walk-forward (solo datos previos a cada jornada/semana; 2 temporadas):

| Liga | Modelo | n | LogLoss | Brier | Acierto | ECE |
|---|---|---:|---:|---:|---:|---:|
| Premier League | v2 | 327 | **1.0217** | **0.6130** | 49.2 % | 4.9 % |
| Premier League | Baseline 0 | 327 | 1.0239 | 0.6145 | 48.3 % | 2.9 % |
| Premier League | Ingenuo | 327 | 1.0741 | 0.6493 | 45.0 % | 4.8 % |
| NFL | v2 | 310 | 0.6451 | 0.4554 | **64.5 %** | 5.0 % |
| NFL | Baseline 0 | 310 | **0.6413** | **0.4513** | 60.3 % | 3.3 % |
| NFL | Ingenuo | 310 | 0.6998 | 0.5066 | 48.4 % | 5.8 % |

Lectura honesta: **v2 le gana al ingenuo en las dos ligas, pero está estadísticamente empatado con
el Baseline 0** (Δ log-loss −0.0022 en fútbol con IC95 % [−0.0190, +0.0150]; +0.0038 en NFL con
IC95 % [−0.0079, +0.0202]). Por eso se publica como `candidate` y con la etiqueta «en validación»:
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
- `FOOTBALL_DATA_API_KEY` — recomendada; resultados, estados y horarios al día de Premier League, LaLiga, Bundesliga, Serie A y Ligue 1 (5 solicitudes por corrida, caché de 90 min).

El build de producción incluye el gate `scripts/check-no-demo-prod.mjs`: datos demo no llegan a
producción. Los snapshots se versionan en `data/snapshots/` y el workflow `.github/workflows/pre-mvp-snapshot.yml`
los actualiza desde GitHub Actions.

---

## AZTECA VET (aztecavet.com) — motores reconstruidos con paridad exacta

Segundo sitio del mismo autor analizado con REA. **362/362 tests** — paridad Δ=0 contra el
oráculo verbatim en **242 partidos de fútbol (5 torneos) + 61 NHL + 17 MLB + simuladores**.

- **Reporte completo:** `Reportes/20-REPORTE-COMPLETO-AZTECAVET.md`
- **Informes por deporte:** `Reportes/docs/20-engine-futbol-aztecavet.md`, `21-engine-nhl-aztecavet.md`, `22-engine-mlb-aztecavet.md`
- **Análisis crudo:** `Reportes/analisis-aztecavet/` (bundle decodificado, evidencia REA de sesión, herramientas)
- **Motores:** `packages/engines-reference/src/domain/aztecavet/` · **Oráculos verbatim:** `packages/engines-reference/reference/aztecavet/` · **Datos:** `packages/engines-reference/src/data/aztecavet-*.json`
- **Tests:** `packages/engines-reference/tests/domain/aztecavet-{parity,math,experiments}.test.ts`
- **Fórmulas:** fútbol Pitágoras 1.7→Log5→localía .54→tilt→Poisson+Dixon-Coles (ρ −.14 MX); NHL 2.15 con forma
  reciente 30%; MLB 1.83 con curvas normales σ=3√2 y regresión de ERA del abridor. Valor EV≥+4%, sizing 5%/10%.
- **Estado:** motores 100% verificados. Son referencia de investigación (Baseline 0), no el modelo publicado.
