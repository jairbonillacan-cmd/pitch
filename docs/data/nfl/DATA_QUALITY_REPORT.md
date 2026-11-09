# DATA_QUALITY_REPORT — Calidad de los datos NFL recopilados

**Fecha:** 2026-11-08 · **Herramienta:** `tools/nfl-data/scripts/quality_check_nflverse.py` (polars)
**Reporte máquina completo:** `data/history/quality_reports/nfl/quality_report.json` + `schemas.json`

## Resultado global

| Métrica | Valor |
|---|---|
| Archivos verificados | 597 (596 parquet + games.csv) |
| Archivos ilegibles / inválidos | **0** |
| Filas totales | 6,136,693 |
| Bytes | 630,939,215 |
| Estados | Complete: 597 · Partial: 0 (por archivo) · Invalid: 0 |

## Verificaciones aplicadas por archivo

1. **Legibilidad** (scan parquet completo) — 100% ok.
2. **Columnas y tipos** capturados en `schemas.json`.
3. **Rango de temporada** (`season` min/max) — coincide con lo publicado por nflverse.
4. **Nulos** — top-10 columnas con más nulos por archivo (reporte JSON); nulos preservados, nunca convertidos a 0.
5. **Duplicados** — doble chequeo:
   - Clave lógica por dataset (p. ej., `[season, week, player_id]`) — 0 duplicados reales.
     Los conteos aparentes iniciales eran artefactos de claves: los archivos semanales traen 1 fila por semana
     (`stats_team_week`), y los agregados season traen `season_type` REG/POST (`player_stats_season`,
     `kicking_season`). Verificados con claves correctas → **0 duplicados**.
   - Filas 100% idénticas (`duplicateFullRows`) — 26 archivos con repetidas tal como las publica el origen:
     - `contracts/historical_contracts.parquet`: 2,607 (OverTheCap repite contratos con reestructuraciones)
     - `depth_charts`: ~100–1,600 por año (repetición de slots idénticos en origen)
     - **Se preservan tal como fueron publicados** (regla de no destruir datos originales). Estado: *Pending Review* para
       deduplicación futura en capa normalizada, sin tocar `raw/`.
6. **Cobertura por temporada** — games.csv: 32 temporadas (1999–2026), ninguna con <250 juegos; 2026=272 (en curso).

## Cuotas (games.csv)

| Campo | No-nulos | Cobertura |
|---|---|---|
| spread_line | 7,426 / 7,548 | 98.4% |
| total_line | 7,426 / 7,548 | 98.4% |
| moneyline (home o away) | 5,445 / 7,548 | 72.1% (no se publicaba consistente pre-~2002) |

## Referencias cruzadas verificadas

- `games.csv` 1999–2026 (7,548) ≡ `nfl.jsonl` normalizado del repo (7,407 filas; la diferencia es
  por el filtro de juegos finalizados del pipeline existente — no se tocó).
- pbp por temporada ≈ 450–500 juegos × ~200 jugadas: consistente con el calendario NFL moderno.
