# Datos históricos de PitchLab

> **Propósito:** describir el corpus histórico que ya vive en `data/history/`, cómo se genera, qué garantiza y para qué sirve.
> **Consumidores:** `services/ingest` (generación), `services/models` (entrenamiento), backtests y cualquier agente que necesite series largas.
> **Fecha:** 2026-11-09 · Fuentes en `FREE_DATA_STRATEGY.md`; decisiones en ADR-007 y ADR-009.

## 1. Qué hay

Un dataset local, reproducible y versionable con **34,168 partidos jugados** de **7 ligas** y **108 temporadas**:

| Liga | Partidos | Equipos | Temporadas | Primero | Último |
|---|---:|---:|---:|---|---|
| NFL | 7,407 | 32 | 28 (1999–2026) | 1999-09-12 | 2026-11-08 |
| Premier League | 6,098 | 42 | 17 (2010-11–2026-27) | 2010-08-14 | 2026-09-20 |
| LaLiga | 5,359 | 34 | 15 (2012-13–2026-27) | 2012-08-18 | 2026-09-20 |
| Bundesliga | 4,917 | 33 | 17 (2010-11–2026-27) | 2010-08-20 | 2026-09-20 |
| Serie A | 4,944 | 38 | 14 (2013-14–2026-27) | 2013-08-24 | 2026-09-20 |
| Ligue 1 | 4,254 | 35 | 13 (2014-15–2026-27) | 2014-08-08 | 2026-09-20 |
| Liga MX | 1,189 | 21 | 4 (2018-19, 2019-20, 2020-21, 2024-25) | 2018-07-20 | 2025-05-04 |

- `datasetId`: `35fea620…` (huella de los archivos normalizados más la configuración).
- Tamaño: 14.4 MB en JSONL (sin la caché de origen, que está en `.gitignore`).
- Calidad: **0 errores**, 1 advertencia (Ligue 1 2019-20: 279 partidos de 380, temporada cancelada por COVID).

Además, el **dataset de investigación** (`pnpm history:odds`) añade cuotas y estadísticas de partido de las cinco grandes ligas desde 1993-94, con **100 % de cobertura de cuotas sobre 25,572 partidos del corpus**. Es research-only y no se versiona (`data/history/research/`, en `.gitignore`).

```text
data/history/
  nfl.jsonl                 7,407 filas
  premier-league.jsonl      6,098
  la-liga.jsonl             5,359
  bundesliga.jsonl          4,917
  serie-a.jsonl             4,944
  ligue-1.jsonl             4,254
  liga-mx.jsonl             1,189
  manifest.json             procedencia, cobertura, calidad y digests
  raw/                      respuestas originales (ignorado por git)
```

El reporte legible se escribe en `Reportes/datos/HISTORICO-QUALITY.md`.

## 2. Fuentes y licencias

| Fuente | Datos | Licencia | Uso |
|---|---|---|---|
| **nflverse** (`nflverse-data`, `schedules/games.csv`) | NFL 1999–2026: temporada regular y playoffs, marcadores, líneas de cierre | **CC-BY 4.0** (atribución «Datos: nflverse») | ✅ Producto comercial con atribución |
| **openfootball/football.json** | Fútbol 2010-11–2026-27: calendario y resultados de 6 ligas | **CC0 1.0** | ✅ Sin restricciones |
| **football-data.co.uk** | Cinco grandes ligas 2010-11–2026-27: cuotas 1X2 y O/U 2.5, tiros, córners y tarjetas | Términos no localizados | ◐ **Research-only**: backtests y features internas; no se publica ni se redistribuye |

- Los datasets de **FTN** de nflverse son CC-BY-SA 4.0 y **no** se usan: `parseCsv` descarta la columna `ftn`.
- Las columnas `spread_line`, `total_line`, `*_moneyline` de nflverse se guardan con `odds.usage = "research-only"`: sirven para comparar el modelo contra el mercado en investigación interna, **no** se publican ni se redistribuyen.
- openfootball no publica cuotas. El histórico de cuotas propio empieza con los snapshots de The Odds API (día 1 del producto).

## 3. Contrato de una fila

```json
{
  "id": "premier-league:2010-11:aston-villa:west-ham-united",
  "sport": "soccer",
  "league": "premier-league",
  "season": "2010-11",
  "period": 1,
  "stage": null,
  "phase": "regular",
  "date": "2010-08-14",
  "kickoff": "15:00",
  "kickoffZone": null,
  "homeTeam": "premier-league.aston-villa",
  "awayTeam": "premier-league.west-ham-united",
  "homeScore": 3,
  "awayScore": 0,
  "neutralSite": false,
  "source": "openfootball",
  "sourceId": "2010-11/en.1#4",
  "availableAt": "2010-08-15T23:59:59.000Z"
}
```

| Campo | Regla |
|---|---|
| `id` | `<liga>:<temporada>:[<torneo>:]<local>:<visitante>`. Determinista y único dentro del corpus. |
| `season` | `2010-11` en fútbol europeo; `2025` en NFL. |
| `period` | Jornada (`Matchday 5`), fecha de la NFL o semana de playoffs. |
| `stage` | Torneo cuando la liga parte el año: `Apertura` / `Clausura` (Liga MX). `null` en el resto. |
| `phase` | `regular` o `postseason` (solo NFL y fases con número). |
| `homeTeam` / `awayTeam` | `<liga>.<slug>` del **registro histórico**, no del manifiesto de emblemas. |
| `sourceId` | Referencia al origen (`game_id` de nflverse o `<archivo>#<índice>`). |
| `availableAt` | Fin del día del partido **+ 24 h**: el lag conservador de `DATA_ARCHITECTURE.md` §6. |
| `odds` | Solo NFL: líneas de cierre, `usage: research-only`. |

## 4. Identidad de equipos

El histórico cubre 17 temporadas de fútbol y 28 de NFL: hay clubes relegados y franquicias que cambiaron de ciudad. Por eso **no** se usa el manifiesto de emblemas de la temporada en curso.

- **Fútbol:** se normaliza el nombre de la fuente (minúsculas, sin acentos, sin sufijos de club como `FC`, `AFC`, `CF`, `Calcio`, números de fundación) y se aplican alias explícitos por liga en `services/ingest/src/history/leagues.ts`:
  - `Deportivo Alavés` → `alaves`, `RC Celta de Vigo` → `celta`, `Rayo Vallecano de Madrid` → `rayo-vallecano`, `Real Betis Balompié` → `real-betis`.
  - `Atalanta BC` → `atalanta`, `Lazio Roma` → `lazio`, `UC Sampdoria` → `sampdoria`.
  - `Racing Club de Lens` → `lens`, `RC Strasbourg Alsace` → `strasbourg`.
- **NFL:** la identidad es la **franquicia**, no la ciudad: `STL` y `LA` → `nfl.los-angeles-rams`; `OAK` y `LV` → `nfl.las-vegas-raiders`; `SD` y `LAC` → `nfl.los-angeles-chargers`.
- **Clubes homónimos:** `distinctTeamPairs` evita sugerir como duplicados a clubes distintos que nunca coinciden en temporada (por ejemplo `AC Ajaccio` y `Gazélec Ajaccio`).

La auditoría avisa cuando dos claves comparten tokens y **no coinciden en ninguna temporada**: el síntoma de un club con dos nombres. Si coinciden, se asume que son clubes distintos (Barcelona y Espanyol Barcelona).

## 5. Controles de calidad

`pnpm history` falla (exit 1) si hay errores. Controles actuales:

1. Identificadores únicos por temporada, torneo y jornada.
2. Un equipo no aparece dos veces en la misma jornada de la misma temporada.
3. Marcadores dentro de rango (≤ 15 en fútbol, ≤ 90 en NFL) y sin equipos contra sí mismos.
4. Cobertura por temporada frente a la referencia (380 en ligas de 20; 306 en las de 18).
5. Temporadas anómalas **dentro de su grupo de número de equipos** (detecta la Ligue 1 de 2019-20 sin marcar los años en que la liga pasó de 20 a 18 clubes).
6. Posibles identidades duplicadas de equipos.
7. Tasas agregadas de cordura: victoria local 42.9–46.8 %, empate 23.9–25.2 %, goles por partido 2.67–3.04.

## 6. Cuotas y estadísticas de partido (research-only)

`pnpm history:odds` construye un dataset **separado** con resultados, cuotas y estadísticas de partido: las cinco grandes ligas desde **1993-94** (football-data.co.uk) y **Liga MX 2022-2024** (API-Football, plan Free).

| Métrica | Valor |
|---|---:|
| Filas | 60,553 |
| Ligas | 6 |
| Con cuotas | 43,754 |
| Con cuotas de cierre | 25,689 (desde 2020-21; antes son pre-partido o no hay) |
| Con estadísticas de partido | 41,596 |
| Emparejadas con el corpus | 25,884 |
| Cobertura de cuotas sobre el corpus con mercado | **100 %** |

Archivos: `data/history/research/<liga>.jsonl` (ignorado por git), `manifest.json` con digests, cobertura por temporada y nombres sin mapear. Reporte legible: `Reportes/datos/ODDS-QUALITY.md`.

- **Liga MX:** 1,022 partidos de las temporadas 2022-23, 2023-24 y 2024-25 (312 emparejados con el corpus, el resto son huecos que openfootball no publica). Sin cuotas: el endpoint de fixtures no las trae. El plan Free bloquea 2021, 2025 y 2026 («try from 2022 to 2024»).
- **Cinco grandes:** 59,531 filas con resultados desde 1993-94, cuotas y estadísticas.
- **Auditoría research (2026-11-09):** 60,553 filas, sin duplicados y con cuotas en rango; 6 avisos de tiros a puerta > tiros (Premier League 5, Serie A 1). alidateResearchGames bloquea errores estructurales (ids duplicados, cuotas incoherentes, fechas o marcadores imposibles) y registra los avisos de estadísticas. El pruning de archivos solo actúa en construcciones completas y únicamente sobre los JSONL de ligas que el constructor posee: nunca borra datasets auxiliares (ESPN, API-Football, enriquecidos).

### xG (Understat, research-only)

`pnpm history:xg` reconstruye el **xG por partido** desde snapshots de la Wayback Machine (el sitio en vivo respondió «We will come back soon» el 2026-11-09). Se elige el snapshot más reciente con al menos el 90 % de los partidos de la temporada y se cachea en `data/history/raw/understat/`.

| Liga | Filas | Emparejadas | Cobertura del corpus |
|---|---:|---:|---:|
| Premier League | 9,970 | 6,098 | 100 % |
| LaLiga | 8,089 | 5,359 | 100 % |
| Bundesliga | 6,804 | 4,917 | 100 % |
| Serie A | 8,065 | 4,944 | 100 % |
| Ligue 1 | 7,736 | 4,253 | 100 % |
| Liga MX | 1,492 | 851 | 71.6 % |

- Total: **42,156 filas**; 26,422 emparejadas con el corpus.
- La temporada **2026-27** se completa con el xG de football-data.co.uk (`HxG`/`AxG`), que solo se publica en esa temporada; el resto viene de Understat.
- **xG estimado:** donde no hay xG real (2010-2014, 2025-26 incompleto y toda Liga MX) se estima desde tiros y tiros a puerta con una regresión ajustada en 18,692 partidos de las cinco grandes (R² ≈ 0.51): `xG = 0.01047 + 0.05521·tiros + 0.16496·SOT` (local) y `-0.01954 + 0.05718·tiros + 0.15558·SOT` (visita). Se marca como `estimated-from-shots`.
- La cobertura de las cinco grandes llega al 100 % del corpus; Liga MX queda en 71.6 % porque ESPN cubre 2018-19, 2019-20, 2020-21 y 2022-25.
- **Research-only:** Understat no declara licencia de reutilización; no se publica ni se redistribuye.
- Se usa de dos formas: como **feature** (xG reciente) y para un **Elo-xG** que actualiza ratings con xG en lugar de goles.
- **Auditoría (2026-11-09):** 42,156 filas, **0 duplicados**, 0 valores negativos o mayores que 10, fechas y temporadas válidas. El **50 %** de las filas de las cinco grandes es xG estimado por tiros (5,600 en Premier League); el resto es real de Understat (2014+) o de football-data.co.uk (2026-27). El constructor valida estos invariantes (`validateXgGames`) y falla si se rompen.
- **Reproducibilidad:** `tests/xg-offline.test.ts` reconstruye el dataset desde la caché local dos veces y comprueba que el `datasetId` no cambia.

### Estadísticas de Liga MX (API-Football, research-only)

`pnpm history:api-stats` descarga `/fixtures/statistics` de forma **incremental y reanudable** (caché por fixture y presupuesto diario de 100 solicitudes). Devuelve tiros, tiros a puerta, córners, posesión y tarjetas por equipo.

- **No hay xG para Liga MX:** `expected_goals` viene `null` en la respuesta (verificado el 2026-11-09); el endpoint sí trae xG en otras competiciones.
- La cuota diaria se agotó durante la prueba y quedaron **10 partidos cacheados**; el descargador continuará en las siguientes corridas.
- Dataset: `data/history/research/liga-mx-stats.jsonl` + manifiesto con cobertura y temporadas.
- Los manifiestos de ESPN y API-Football incluyen `fileSha256`, así que `pnpm data:catalog` verifica sus hashes; `liga-mx-enriched.jsonl` lo genera otro tool y aún no tiene manifiesto (aparece con `—`).

### Estadísticas de Liga MX desde ESPN

`pnpm history:espn` recorre los calendarios de los 18 equipos en ESPN y descarga el `summary` de cada partido terminado (sin API key ni cuota). Extrae tiros, tiros a puerta, córners, posesión y tarjetas, y empareja con el corpus por equipos y fecha (±2 días).

- Dataset: **1,492 partidos** de seis temporadas: 2018-19 (210), 2019-20 (88), 2020-21 (275), 2022-23 (308), 2023-24 (305) y 2024-25 (306). Archivo: `data/history/research/liga-mx-espn-stats.jsonl` (research-only).
- Para las temporadas que no están en el corpus canónico se empareja contra los ids del dataset research; el adaptador es incremental y mergea con el dataset existente.
- **Caché compacta:** los summaries se guardan solo con nombres y estadísticas (~0.2 KB) en vez del JSON completo (~400 KB). La caché de ESPN pasó de **1.5 GB a 82 MB** y la reconstrucción offline sigue dando 1,492 partidos; `compactEspnSummaries()` convierte cachés antiguas in situ.
- Experimentos con esas features: Elo de tiros 1.0072 por sí solo; mezcla DC + Elo de tiros 1.0022 (igual que la mezcla actual DC + Elo de goles) y mezcla triple DC + Elo + Elo-tiros **1.0016**. La mejora es de 0.0006, demasiado pequeña para cambiar el candidato; el dataset se conserva para features y para más temporadas.

Además del `id`, la fecha, los equipos y el marcador, cada fila trae:

- `odds`: `{ source, bookmaker, timing, home, draw, away, over25, under25, usage: "research-only" }`. Prioridad Pinnacle > B365 > promedio; `timing: closing` desde 2020-21 y `pre-match` antes.
- `stats`: tiros, tiros a puerta, córners, amarillas y rojas por equipo.

Reglas:

- Solo se publica la **evaluación**, nunca las cuotas: `usage: research-only` es parte del contrato.
- Sin cuotas no se inventan precios: `odds: null`.
- Los clubes de temporadas antiguas que no existen en el corpus reciben un slug derivado (`Wimbledon` → `premier-league.wimbledon`) y se listan en `fallbackNames` (9–15 por liga). Nunca se adivina una identidad existente: los alias explícitos tienen prioridad.

Con esto el motor tiene un rival real: el mercado sin vig.

## 7. Semántica temporal (as-of)

`availableAt` es deliberadamente conservador: el resultado se considera conocible al terminar el día del partido más 24 h. Cualquier *feature* o backtest debe filtrar `availableAt <= T` para no filtrar el futuro; el benchmark de §8 lo hace por construcción (ventana móvil de fechas anteriores a la jornada).

## 8. Benchmark walk-forward

`pnpm backtest:history` evalúa los modelos v2 sobre el corpus (por defecto Premier League y NFL; con `--leagues=` se añaden las demás). Cada jornada se predice con los partidos anteriores de una ventana móvil de 1,095 días (≈ 3 temporadas), y se compara contra una referencia ingenua de tasas base, contra un Elo incremental y contra el mercado sin vig (fútbol: cuotas de football-data.co.uk; NFL: moneylines de nflverse).

Resultado observado (2026-11-09, bootstrap 2,000, mercado sin vig):

| Liga | n | Dixon-Coles | Elo | Mezcla 50/50 | Ingenuo | Mercado | Δ DC−mercado | Δ mezcla−mercado |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Premier League | 5,898 | 0.9748 | 0.9754 | **0.9726** | 1.0653 | 0.9563 | +0.0185 [+0.0142, +0.0233] | **+0.0163** [+0.0122, +0.0206] |
| LaLiga | 5,159 | 0.9752 | 0.9750 | **0.9727** | 1.0637 | 0.9527 | +0.0224 [+0.0173, +0.0276] | **+0.0200** [+0.0152, +0.0250] |
| Bundesliga | 4,710 | 0.9951 | 0.9948 | **0.9928** | 1.0680 | 0.9776 | +0.0175 [+0.0124, +0.0228] | **+0.0152** [+0.0104, +0.0201] |
| Serie A | 4,744 | 0.9737 | 0.9765 | **0.9725** | 1.0768 | 0.9500 | +0.0237 [+0.0190, +0.0289] | **+0.0225** [+0.0181, +0.0276] |
| Ligue 1 | 4,054 | 1.0034 | 1.0034 | **1.0009** | 1.0704 | 0.9813 | +0.0221 [+0.0158, +0.0281] | **+0.0197** [+0.0140, +0.0251] |
| Liga MX | 781 | 1.0043 | 1.0068 | **1.0030** | 1.0542 | — | — | — |
| NFL (moneyline) | 7,204 | 0.6545 | — | — | 0.6860 | 0.6106 | +0.0421 [+0.0344, +0.0499] | — |

- **Elo** se calibró con validación temporal: hiperparámetros elegidos en 2010-11…2018-19 y evaluados en 2019-20…2026-27 (K=15, localía 65, regresión de temporada 0.10, empate 0.30 − 0.0005·|Δ|). Solo, queda **a la par** de Dixon-Coles (Δ entre −0.0003 y +0.0028, sin significancia).
- **Mezcla 50/50** (promedio de Dixon-Coles y Elo) mejora a Dixon-Coles en las 6 ligas: Δ de −0.0012 a −0.0025, con IC 95 % que excluye el 0 en Premier League, LaLiga, Bundesliga y Ligue 1.
- **Frente al mercado**, Dixon-Coles perdía 0.0175–0.0237 y la mezcla pierde 0.0152–0.0225: cierra entre 10 % y 15 % de la brecha, pero sigue por detrás. Es la primera mejora verificada del motor contra su propia referencia.
- **Totales NFL calibrados**: el modelo de totales está sobreconfiado (0.7155 en la línea de cierre frente a 0.693 de la tasa base). La calibración Platt walk-forward baja a **0.6949** con pendiente 0.047: el `pOver` del modelo apenas aporta información sobre la línea. Se reporta como candidato experimental; el moneyline no cambia.
- **Lesiones NFL**: probadas como feature (parquet de nflverse agregado con DuckDB: bajas, dudosos, QB y skill players). El GBM pasa de 0.6435 a 0.6431: sin mejora material, no se integran.
- Liga MX no tiene cuotas de mercado, así que solo se mide contra el ingenuo.
- **Stacking logístico** (Dixon-Coles + Elo + descanso, forma y tiros a puerta) probado con `--with-stack`: **no supera a la mezcla** salvo en Bundesliga (0.9941 vs 0.9957). Premier League 0.9748 vs 0.9744, LaLiga 0.9743 vs 0.9703, Ligue 1 1.0050 vs 0.9993. Queda como candidato experimental para cuando exista un GBM con más features.
- **GBM (LightGBM)** sobre las mismas features, entrenado por temporada y agrupado entre ligas (`services/models/train_gbm.py`): tampoco supera a la mezcla. Premier League 0.9710 vs 0.9695, LaLiga 0.9729 vs 0.9703, Bundesliga 0.9930 vs 0.9915; Δ de +0.0015 a +0.0027 con IC 95 % que incluye el 0. Reporte: `Reportes/modelos/BACKTEST-GBM.md`. Conclusión: la señal ya está en los motores base; el siguiente salto requiere **datos nuevos** (xG, alineaciones, cuotas), no otra clase de modelo.
- Totales O/U 2.5 frente al mercado: Dixon-Coles sigue por detrás (Premier League 0.6826 vs 0.6732; LaLiga 0.6902 vs 0.6672).
- Reportes: `Reportes/modelos/BACKTEST-HISTORICO.md` y `backtest-historico.json`.

### Experimento: entrenar con 1993-2010 (`--include-research-history`)

El dataset research permite entrenar con 33,959 partidos anteriores al corpus (de los 59,531 totales, el resto ya está en el corpus). Al activarlo, la evaluación sigue sobre el corpus publicable, pero **n cambia**: las primeras jornadas de cada temporada ya superan el mínimo de 200 partidos de entrenamiento y entran al benchmark.

| Liga | n público → research | LogLoss público → research | Δ mercado público → research |
|---|---:|---:|---:|
| Premier League | 5,898 → 6,098 | 0.9748 → 0.9771 | +0.0185 → +0.0177 |
| LaLiga | 5,159 → 5,359 | 0.9752 → 0.9728 | +0.0224 → +0.0203 |
| Bundesliga | 4,710 → 4,917 | 0.9951 → 0.9982 | +0.0175 → +0.0170 |
| Serie A | 4,744 → 4,944 | 0.9737 → 0.9735 | +0.0237 → +0.0246 |
| Ligue 1 | 4,054 → 4,254 | 1.0034 → 1.0021 | +0.0221 → +0.0201 |
| Liga MX | 781 → 982 | 1.0043 → 1.0050 | — (sin cuotas) |

Conclusión honesta: **más volumen no cierra la brecha**. Mejora dos ligas, empeora dos y deja el resto igual; el orden de magnitud frente al mercado (0.017–0.025 de log loss) se mantiene. En Liga MX añade 710 partidos de entrenamiento y 201 predicciones más, con un Δ frente al ingenuo de −0.0522 (antes −0.0499). El siguiente salto tiene que venir de features (tiros/córners, descanso, Elo) y de un GBM, no de acumular temporadas. Reporte: `Reportes/modelos/BACKTEST-HISTORICO-RESEARCH.md`.

### xG en el benchmark research

Con `pnpm history:xg` y `--include-research-history`, el benchmark añade **Elo-xG** (ratings actualizadas con xG en lugar de goles) y su mezcla con Dixon-Coles:

| Liga | DC | Elo | Elo-xG | Mezcla | Mezcla-xG | Mercado | Δ mezcla-xG − mercado |
|---|---:|---:|---:|---:|---:|---:|---:|
| Premier League | 0.9771 | 0.9766 | 0.9866 | 0.9744 | **0.9721** | 0.9594 | **0.0127** |
| LaLiga | 0.9728 | 0.9721 | 0.9759 | 0.9703 | **0.9670** | 0.9525 | **0.0145** |
| Bundesliga | 0.9982 | 0.9970 | 1.0005 | 0.9957 | **0.9928** | 0.9812 | **0.0116** |
| Serie A | 0.9735 | 0.9730 | 0.9764 | 0.9707 | **0.9660** | 0.9489 | **0.0171** |
| Ligue 1 | 1.0021 | 1.0009 | 1.0099 | 0.9993 | **0.9987** | 0.9820 | **0.0167** |
| Liga MX | 1.0050 | 1.0030 | 1.0053 | 1.0020 | **1.0012** | — | — |

- El Elo-xG **solo** empeora cuando entra el xG estimado (más ruido), pero su **mezcla con Dixon-Coles** sigue ganando: Δ de −0.0034 a −0.0075 frente a la mezcla 50/50, con IC 95 % que excluye el 0 en cuatro de cinco ligas.
- La brecha contra el mercado baja a **0.0116–0.0171**.
- En **Liga MX**, el xG estimado por tiros mejora la mezcla de 1.0020 a **1.0012** con la cobertura completa de ESPN; con 1,274 partidos había llegado a 1.0003, así que más cobertura antigua no implica mejor modelo.
- La feature cruda de xG en el GBM apenas cambia el resultado (+0.001–0.002): el valor está en las **ratings xG**, no en el promedio móvil.
- **Peso de la mezcla DC + Elo-xG**: en la ventana 2020-2026, el peso elegido en 2010-2019 (0.7 DC / 0.3 Elo-xG) mejora 5 de 6 ligas; pero al evaluarlo sobre **toda** la historia del benchmark empeora: LaLiga 0.9678 vs 0.9670, Bundesliga 0.9936 vs 0.9928, Serie A 0.9672 vs 0.9660 y Liga MX 1.0017 vs 1.0011; solo Ligue 1 mejora (0.9984 vs 0.9987). Por eso **no se adopta** y se mantiene 0.5.
- **Peso de la mezcla DC + Elo de goles** (modelo público, sin xG): el óptimo global en validación es **0.5**, igual al actual; no hay cambio que hacer.
- **GBM con xG estimado y cobertura completa**: empata con la mezcla en Bundesliga (0.9917 vs 0.9915) y Serie A (0.9708 vs 0.9707), pero sigue perdiendo en Premier League (+0.0015), LaLiga (+0.0031), Ligue 1 (+0.0028) y Liga MX (+0.0030). No se adopta.
- **Mezcla con DC-xG** (promedio de DC-goles y DC-xG, con xG completo): mejora en LaLiga (0.9658 vs 0.9670), Bundesliga (0.9917 vs 0.9928) y Serie A (0.9655 vs 0.9660); neutral en Premier League y Ligue 1, y **empeora en Liga MX** (1.0025 vs 1.0011, porque allí el xG es estimado). No se adopta como candidato global; queda como columna de evaluación.
- **Dixon-Coles sobre xG** (probado en la Premier League, subconjunto con xG): la mezcla de DC-goles y DC-xG da 0.9682 frente a 0.9712 de DC-goles; al combinarla con Elo-xG la mejora es marginal (0.9651 vs 0.9654), así que **no se integra** como candidato.
- **Totales con xG**: resultados mixtos. Mejora Serie A (0.6870 vs 0.6915) y Ligue 1 (0.6875 vs 0.6916), empeora LaLiga (0.7077 vs 0.6904) y Premier League (0.6848 vs 0.6830). Se deja como **columna de evaluación** en el reporte, no como modelo.
- **Ajuste de hiperparámetros del Elo-xG** con validación temporal: el óptimo en validación (K=8) empeora en test (0.9783) frente a otros (0.9730); no hay ganancia estable, así que se mantienen los valores por defecto.

### Hallazgo corregido en el camino

`fitNflRatings` divergía cuando se entrenaba con más de ~240 partidos (intercepto ~1e38) porque centraba ofensiva y defensiva restando **medias distintas**. El ridge ya identifica el modelo, así que se eliminó ese centrado; hay una prueba de regresión con 320 partidos en `packages/models/tests/models.test.ts`. Sin esa corrección, el benchmark de NFL era inservible (log loss 4.64).

## 9. Reproducir

```bash
pnpm history                                  # descarga, normaliza, audita y escribe el corpus
pnpm history --offline                        # solo con data/history/raw
pnpm history --leagues=premier-league,nfl
pnpm history --soccer-seasons=2024-25,2025-26
pnpm history:odds                             # cuotas y estadísticas (research-only, 1993-2026)
pnpm history:xg                               # xG por partido desde Understat vía Wayback (research-only)
pnpm data:catalog                             # catálogo e integridad (SHA-256 y filas contra manifiestos)
pnpm verify:data                              # chequeo offline: umbrales de filas, duplicados y manifiestospnpm backtest:history                         # benchmark walk-forward con mercado
pnpm backtest:history --include-research-history   # experimento: entrena con 1993-2010
pnpm backtest:history --with-stack            # experimento: stacking logístico
pnpm test -- --pool=threads                   # si el entorno bloquea procesos hijo de Vitest
```

- `data/history/raw/` guarda la respuesta original y su digest; está en `.gitignore`.
- `data/history/research/` (cuotas) también está en `.gitignore`: es research-only y no se redistribuye.
- Los 404 quedan marcados con `<archivo>.missing` para que `--offline` sea reproducible.
- El manifiesto registra URL, licencia, atribución, SHA-256 y bytes de cada fuente, incluidas las no publicadas.

## 10. Límites conocidos y siguientes pasos

> Estado exhaustivo de cada fuente (activa, caída o agotada) y próximos pasos: [`DATA_SOURCES_STATUS.md`](DATA_SOURCES_STATUS.md).

- **Liga MX** solo tiene 4 temporadas en openfootball (2018-19, 2019-20, 2020-21 y 2024-25) y termina en 2024-25. El dataset research añade 2022-23 y 2023-24 (y completa 2024-25) vía API-Football; el plan Free bloquea 2021, 2025 y 2026. No hay cuotas de mercado para Liga MX. La temporada en curso se obtiene en vivo con API-Football detrás del flag de beta.
- **xG**: 42,156 filas (real 2014-2026 + estimado por tiros 2010-2014 y Liga MX). Cobertura del 100 % del corpus en las cinco grandes y 71.6 % en Liga MX (ESPN cubre 2018-19, 2019-20, 2020-21 y 2022-25). Understat/ESPN no declaran licencia, así que es research-only y no se publica.
- **Caché raw**: ~0.8 GB en `data/history/raw/` tras compactar ESPN (1.5 GB → 82 MB), con nflverse en 605 MB. Está gitignored y puede borrarse si no se reconstruyen datasets.
- **Clima**: prueba de señal con Open-Meteo en 4,691 partidos de Premier League: over 2.5 del 52.8 % en seco frente a 55.7–56.1 % con lluvia, sin controlar confusión (equipo/temporada). No se integra como feature; la API gratuita limita solicitudes por minuto.
- **LaLiga** empieza en 2012-13 y **Serie A** en 2013-14: openfootball no publica antes.
- La temporada en curso de openfootball llega a **2026-09-20**; para frescura del día se usan los adaptadores en vivo (`football-data.org` o `openfootball` en `pnpm snapshot`, y API-Football para Liga MX).
- Sin datos de jugadores, alineaciones ni lesiones. Prop Lab y CLV siguen bloqueados por sus fuentes.
- El corpus aún no está en Postgres ni en Parquet: es la entrada para `services/models` y para el histórico de R2 de `DATA_ARCHITECTURE.md` §4.
- El dataset research no se versiona: se regenera con `pnpm history:odds`. Sus cuotas no se pueden mostrar ni redistribuir.
- Siguientes pasos naturales: (1) usar xG también para afinar Dixon-Coles (Poisson sobre xG) y no solo Elo; (2) features de xG por periodo/tiro; (3) LightGBM con ratings xG; (4) histórico de Liga MX 2021/2025-26 si se confirma la licencia o se sube de plan.

## Referencias

- `docs/architecture/FREE_DATA_STRATEGY.md` — fuentes, licencias y presupuestos.
- `docs/architecture/DATA_ARCHITECTURE.md` — modelo canónico, ingesta y R2.
- `docs/architecture/PREDICTION_ARCHITECTURE.md` — live frente a retro y gate de publicación.
- `docs/architecture/adr/ADR-007…`, `ADR-009…` — Postgres/Neon y modelos Python por lotes.
