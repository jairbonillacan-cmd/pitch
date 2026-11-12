# 02 · Auditoría de los datos que existían antes

> Pregunta que responde: ¿qué datos históricos tenía PitchLab cuando empezó esta misión?
> **Fecha:** 2026-11-08 · Etiquetas: OBSERVADO (verificado en el repo) / INFERIDO.

## 1. Lo que había antes del corpus histórico

| Activo | Ubicación | Qué contiene | Límite principal |
|---|---|---|---|
| Snapshots del pre-MVP | `data/snapshots/{premier-league,nfl,liga-mx}/<fecha>.json` + `latest.json` | Partidos de la jornada en curso, cuotas y análisis del Baseline 0 | Ventana de 1 día; sin histórico |
| Motores de referencia | `packages/engines-reference` (Baseline 0) | Pitágoras → Log5 → HFA odds-ratio → normal (NFL) y Poisson/Dixon-Coles (fútbol), reconstruidos de TouchIQ/AztecaVet con 386 tests (Δ=0 en 46 juegos × 15 mercados) | Formulas sin datos propios: las tasas venían de constantes transcritas a mano |
| Datos congelados de AztecaVet | `packages/engines-reference/src/data/aztecavet-*.json` | Equipos, fixtures, lesiones y timeline transcritos a mano de la app original | Estáticos, sin licencia de redistribución, no sirven para entrenar |
| Reportes REA | `Reportes/{touchiq,aztecavet,analisis-linemate}/` + `docs/research/REA_REPORT_INVENTORY.md` | Ingeniería inversa de las 3 referencias | H4: «Ninguna de las dos tiene histórico real, histórico de cuotas ni actualización automática» — OBSERVADO |

**Conclusión del inventario REA (OBSERVADO):** TouchIQ, AztecaVet y LineMate son apps
100 % cliente con datos congelados; ninguna combina fuente con licencia que se actualice
sola, histórico as-of o modelos validados temporalmente. Ese es exactamente el hueco que
esta misión llena.

## 2. Lo que existe ahora (corpus construido en esta misión)

| Activo | Ubicación | Contenido verificado |
|---|---|---|
| Dataset histórico canónico | `data/history/<liga>.jsonl` (6 fútbol + NFL) | **34,168 partidos jugados**, 108 temporadas, 238 equipos, 0 errores de calidad, 1 advertencia legítima (Ligue 1 2019-20 cortada por COVID). `datasetId` SHA-256 `0ddb5936738a2b15…` |
| Manifiesto de procedencia | `data/history/manifest.json` | 103 registros de fuente con URL, licencia, atribución, SHA-256 y bytes de cada archivo descargado |
| Reporte de calidad legible | `Reportes/datos/HISTORICO-QUALITY.md` | Cobertura por liga y temporada, tasas de localía/empate, hallazgos |
| Contrato del histórico (arquitectura) | `docs/architecture/HISTORICAL_DATA.md` | El contrato lado-arquitectura escrito por HIST-01; esta carpeta (`docs/data/football/`) es la investigación y evidencia lado-datos |
| Caché de fuentes crudas | `data/history/raw/` (≈25 MB) | `nflverse/games.csv` + 1 JSON de openfootball por liga-temporada; reutilizable en modo `--offline` |
| Benchmark del corpus | `Reportes/modelos/BACKTEST-HISTORICO.{md,json}` | Walk-forward por jornada contra ingenuo y mercado sin vig |

## 3. Brechas detectadas (lo que falta o está a medias)

1. **Liga MX**: openfootball no publica `mx.1` para 2021-22, 2022-23 ni 2023-24 (6 torneos
   faltantes). La sonda del plan Free de API-Football (ver `03-provider-research.md`)
   confirma que las temporadas 2022 y 2023 son recuperables gratis; 2021 está bloqueada
   por plan (`errors=plan`).
2. **Estadísticas de equipo/jugador, alineaciones, lesiones y xG**: no existen en las
   fuentes gratuitas aprobadas para fútbol. Solo hay resultados, fechas, jornadas y
   (en NFL) cuotas de cierre. Cualquier feature Nivel B/C debe declararse «no
   disponible» en lugar de imputarse (ver `10-feature-engineering.md`).
3. **Cuotas históricas de fútbol**: no hay fuente gratuita licenciada integrada. Las de
   NFL provienen de nflverse con etiqueta `usage: research-only`.
4. **Postseason de fútbol en el entrenamiento**: las filas de liguilla ya se etiquetan
   `phase: "postseason"`, pero el benchmark aún las incluye; filtrarlas es una mejora
   pendiente (ver `12-model-improvement-plan.md`).
