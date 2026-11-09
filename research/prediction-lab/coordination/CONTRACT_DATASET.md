# Contrato de datos canónico — `matches.parquet`

**Versión:** 1.0 (2026-11-09) · **Propietario:** A04 Data Engineer · **Aprobado por:** Orquestador

Toda la investigación (features, Motor A, Motor B, backtesting) consume **exclusivamente**
esta tabla. Si una fuente no encaja en el esquema, se documenta la carencia; no se inventan campos.

## 1. Gran granularidad y clave

Una fila = un partido. Clave primaria `match_id`:

```
match_id = f"{div}:{YYYYMMDD}:{home_slug}:{away_slug}"
```

`home_slug`/`away_slug` en minúsculas, sin acentos, con `_` (se conserva la identidad de equipo en
la columna cruda). Determinista: reingestar la misma fila produce el mismo `match_id`.

## 2. Columnas

| Columna | Tipo | Nulable | Descripción |
|---|---|---|---|
| `match_id` | str | no | Clave determinista (arriba) |
| `source` | str | no | `football-data.co.uk` |
| `div` | str | no | Código de división de la fuente (`E0`, `SP1`, `MEX`, …) |
| `league` | str | no | Nombre legible normalizado (`Premier League`, `Liga MX`, …) |
| `country` | str | sí | País de la competición |
| `season` | str | no | `YYYY/YY` (p. ej. `2024/25`) |
| `season_start` | int | no | Año de inicio de temporada (2024) |
| `match_date` | date | no | Fecha local del partido tal como la publica la fuente |
| `kickoff_time` | str | sí | `HH:MM` de la fuente; **zona horaria desconocida, no asumir** |
| `home_team` | str | no | Nombre canónico (mapa de equipos por división) |
| `away_team` | str | no | Nombre canónico |
| `home_goals` | int | no | Goles 90' |
| `away_goals` | int | no | Goles 90' |
| `result` | str | no | `H`/`D`/`A` |
| `ht_home_goals` | int | sí | Goles al descanso |
| `ht_away_goals` | int | sí | |
| `ht_result` | str | sí | `H`/`D`/`A` |
| `shots_home` / `shots_away` | int | sí | Tiros |
| `sot_home` / `sot_away` | int | sí | Tiros a puerta |
| `corners_home` / `corners_away` | int | sí | Córners |
| `fouls_home` / `fouls_away` | int | sí | Faltas |
| `yellows_home` / `yellows_away` | int | sí | Amarillas |
| `reds_home` / `reds_away` | int | sí | Rojas |
| `odds_open_b365_{h,d,a}` | float | sí | Cuota decimal de apertura Bet365 |
| `odds_open_ps_{h,d,a}` | float | sí | Apertura Pinnacle (desde 2012 aprox.) |
| `odds_open_avg_{h,d,a}` | float | sí | Apertura media de mercado |
| `odds_open_max_{h,d,a}` | float | sí | Apertura máxima de mercado |
| `odds_open_bf_{h,d,a}` | float | sí | Apertura Betfair Exchange |
| `odds_close_b365_{h,d,a}` | float | sí | Cierre Bet365 |
| `odds_close_ps_{h,d,a}` | float | sí | Cierre Pinnacle |
| `odds_close_avg_{h,d,a}` | float | sí | Cierre medio |
| `odds_close_max_{h,d,a}` | float | sí | Cierre máximo |
| `odds_close_bf_{h,d,a}` | float | sí | Cierre Betfair Exchange |
| `totals_open_{b365,p,avg,max}_{over,under}` | float | sí | Línea 2.5 (solo si la fuente la da) |
| `totals_close_{b365,p,avg,max}_{over,under}` | float | sí | Línea 2.5 de cierre |
| `source_season_file` | str | no | Archivo de origen (`mmz4281/2425/E0.csv` o `new/MEX.csv`) |
| `source_row` | int | no | Número de fila (1-based, sin cabecera) en el archivo |
| `ingested_at` | str | no | ISO-8601 UTC de ingesta |

## 3. Reglas de disponibilidad temporal (anti-leakage)

1. **Features deportivas:** para el partido `m` solo se usan partidos con
   `match_date < m.match_date`. Nunca misma fecha, nunca misma jornada.
2. **Elo/ratings:** actualización causal; el rating usado para predecir `m` es el previo al partido.
3. **Cuotas de apertura:** la fuente no publica timestamp. Suposición documentada:
   disponibles **antes del día del partido** (publicadas al abrir el mercado). Se usan como
   información pre-partido en Motor B, marcando la suposición.
4. **Cuotas de cierre:** **no** son válidas para simular predicciones hechas con antelación.
   Se usan (a) como benchmark de mercado y (b) para el escenario "predicción a pie de campo",
   declarado explícitamente en cada tabla de resultados.
5. **Movimiento de cuotas** (apertura→cierre): solo se evalúa como *closing-line model*; no se
   presenta como sistema operable con antelación.
6. **Sin fuga de target:** ninguna transformación puede calcular estadísticas usando el propio
   partido ni partidos posteriores (ni medias de temporada completa).
7. **Duplicados:** `match_id` único; si dos filas colisionan, se conserva la de mayor cobertura de
   campos y se registra el conflicto en el informe de calidad.

## 4. Cobertura y exclusiones

- Divisiones principales: `E0,E1,D1,D2,I1,I2,SP1,SP2,F1,F2,N1,P1,T1,G1,SC0,B1` (temporadas
  disponibles desde 2000/01 en la mayoría).
- Ligas extra: `MEX,ARG,BRA,USA,JPN,SWE` (desde 2012; solo cierre; sin tiros).
- Partidos sin resultado (`result` nulo) se excluyen del modelado y se cuentan en el informe.
- Temporada 2026/27: incluida solo para monitorización (incompleta).
- No se corrige ni imputa el marcador. Los campos ausentes quedan nulos y se documentan.

## 5. Validaciones mínimas que debe implementar A04

- `match_id` único y determinista (reingesta idempotente).
- `result` coherente con `home_goals`/`away_goals` al 100 %.
- `0 <= goles <= 15`; cuotas `> 1.0` cuando no son nulas.
- `match_date` dentro de la temporada declarada (±1 año) y monótona por división.
- Cobertura por división/temporada: nº partidos, % con cuotas de cierre, % con tiros.
- Ningún equipo con más de un `home_slug` por división (mapa de alias explícito).
- Informe de anomalías con filas concretas y % de pérdida por regla.

## 6. Salidas esperadas

- `lab/data/processed/matches.parquet` (canónico)
- `lab/data/processed/matches.csv` (espejo legible)
- `lab/data/processed/coverage.json` (cobertura por div/temporada/campo)
- `lab/data/processed/data_quality_report.md`
- `lab/data/processed/odds_availability.json` (qué es apertura/cierre y sus límites)
