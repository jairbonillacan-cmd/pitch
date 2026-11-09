# NOAA_WEATHER — Clima histórico de estadios NFL (NOAA NCEI GHCN-Daily)

**Fecha:** 2026-11-08 · **Fuente:** NOAA NCEI Global Historical Climatology Network–Daily
**Licencia:** Dominio público de EE.UU. (datos federales sin copyright); se solicita citar "NCEI GHCN-Daily"
**API:** NCEI Data Service v1 — gratuita, sin registro ni key
**Script:** `tools/nfl-data/scripts/download_noaa_weather.py`

## Qué se descargó

Variables diarias por estación (métrico): **TMAX, TMIN, PRCP, SNOW, SNWD, AWND** (viento medio diario),
rango 1999-01-01 → 2026-11-08 (coincide con games.csv).

| Métrica | Valor |
|---|---|
| Estaciones descargadas | 43 (todas con datos verificados; 0 errores) |
| Filas (días-estación) | 431,484 |
| Tamaño | 25.7 MB |
| Ubicación | `data/history/raw/noaa-ghcn/stations/<station>.csv` (gitignored) |
| Inventario oficial de estaciones | `data/history/raw/noaa-ghcn/ghcnd-stations.txt` (133,041 estaciones) |
| Mapping estadio→estación | `data/history/manifests/nfl-station-mapping.csv` (versionado) |
| Manifest de descarga | `data/history/manifests/noaa-downloads-manifest.jsonl` (checksums por archivo) |

## Metodología del mapeo (sin datos inventados)

1. Los venues (47 claves de estadio) provienen de `games.csv` (`stadium_id` + nombre).
2. Cada venue se asignó a candidatos de estación **explícitos**, verificados contra el inventario
   oficial `ghcnd-stations.txt` y **sondeados por datos** antes de adoptarse (el script valida que
   la respuesta contenga filas; estación sin filas ⇒ no_data y se descarta).
3. Estaciones usadas: aeropuertos principales de la ciudad sede (ASOS/WMO) — IDs reales del
   inventario NOAA; distancias estadio→aeropuerto típicas de 10–40 km.
4. Venues con techo (dome/retráctil) quedan marcados `isDomeVenue=yes` en el mapping (el clima
   exterior sigue siendo útil para análisis de viaje/calor, pero no afecta al juego).

## Cobertura por venue

| Estado | Venues | Juegos afectados |
|---|---|---|
| ✅ Con estación | 44 de 47 (109 nombres de estadio) | 7,537 de 7,548 |
| ❌ Sin estación GHCN-Daily | `BRG` (Tiger Stadium LSU), `BUF01` (Rogers Centre Toronto), `RIO` (Maracanã) | 11 |

Sin estación significa que GHCN-Daily no publica datos con filas para ninguna estación candidata
de esas ciudades en el rango (Toronto Pearson/ciudad: registros terminados; Río: escasos).

## Estaciones con menos días de lo esperado (~10,100 días en el rango)

Reporte detallado **por estación y por año** en `data/history/quality_reports/nfl/noaa_coverage.json`
(generado por `tools/nfl-data/scripts/noaa_coverage_report.py`; incluye días no nulos por variable
TMAX/TMIN/PRCP/SNOW/SNWD/AWND). Verificación contra los huecos anotados:

| Estación | Días/10,170 esperados | Huecos reales (del coverage JSON) |
|---|---|---|
| USW* (32 aeropuertos EE.UU.) | completos 1999–2025 | **ninguno** — el "2026 débil" (308/365) es truncamiento esperado del rango (termina 2026-11-08), NO un hueco |
| MXM00076680 (C. de México) | 6,479 | huecos severos **todos los años** (p. ej. 2001–2004 con 6–13 días); usar con cautela |
| UKM00003772 (Heathrow) | 9,720 | huecos 2007–2009; **casi sin datos 2016–2021** (26–99 días/año); 2025 parcial |
| BR00E3-0520 (São Paulo) | 9,713 | TMAX ausente 2016–2019 y 2023; cobertura parcial la mayoría de años (1 juego NFL: 2024) |
| USW00013810 (Jacksonville) | 9,557 | único hueco real EE.UU.: **año 2000 con solo 121 días de TMAX** |
| USW00023230 (Oakland) | 9,803 | sin huecos anuales relevantes (truncamiento 2026 + dispersión menor) |

Reglas: los nulos significan "no observado ese día" — nunca convertirlos a 0. Para features NFL,
las estaciones USW 1999–2025 son de grado analítico; las internacionales (MXM/UKM/BR) requieren
tolerancia a huecos o complemento con `temp`/`wind` de nflverse (gamebook).

## Validación cruzada nflverse ↔ NOAA (dos fuentes independientes)

`data/history/quality_reports/nfl/weather_cross_validation.json`
(generado por `tools/nfl-data/scripts/weather_cross_validation.py`):

| Métrica | Valor |
|---|---|
| Juegos unidos a estación+día | 7,365 / 7,548 (**97.6%**) |
| Juegos sin estación (venues sin GHCN) | 11 |
| Juegos cuyo día no tiene fila en estación | 172 (huecos MXM/UKM/BR documentados arriba) |
| Pares gamebook vs GHCN TMAX | 5,203 |
| **Pearson r (temp gamebook vs TMAX), open-air** | **0.909** (5,201 pares) |
| **Mediana \|gamebook − TMAX\|** | **2.24 °C** (P90: 6.7 °C) |

⚠️ **Unidades:** la columna `temp` de games.csv está en **Fahrenheit**; GHCN descargado en
**Celsius** (`units=metric`). La validación convierte F→C; cualquier consumo futuro debe
normalizar. La diferencia con TMAX es esperada: el gamebook mide al kickoff, TMAX es el máximo
del día (medianas vs TMIN: 7.2 °C, coherente con kickoffs vespertinos).

Conclusión: **las dos fuentes independientes concuerdan** — el clima de gamebook (nflverse) y el
clima de aeropuerto (NOAA) describen los mismos eventos con la discrepancia esperada por hora de
medición. GHCN aporta además lluvia/nieve/viento y cobertura completa de días (features
pre-partido de semana completa).

**Valor añadido concreto:** de los 5,356 juegos open-air/retráctil, 262 no traen `temp` en el
gamebook de nflverse; de esos, **162 quedan cubiertos con TMAX/TMIN de GHCN** (los otros 100
corresponden a los días-hueco de MXM/UKM/BR o venues sin estación).

## Uso previsto (features pre-partido futuros)

- Unir `games.csv` (`stadium_id` → mapping → `stationId`, `gameday` → `DATE`).
- Complementa `temp`/`wind` de nflverse (que vienen del gamebook y solo se reportan en estadios abiertos):
  GHCN da serie completa diaria, útil para backfill y para métricas previas a la semana (lluvia acumulada, etc.).
- Regla de integridad temporal: el registro de un día se considera disponible después de su
  publicación (~horas del día siguiente) — no usar para features intradía sin cuidado.
