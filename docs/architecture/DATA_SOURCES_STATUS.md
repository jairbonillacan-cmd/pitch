# Estado de las fuentes de datos

Fecha de la última comprobación: **2026-11-09**. Este documento cierra la fase de adquisición
de datos iniciada con el objetivo de mejorar los motores con datos gratuitos o scraping.

## Resumen

| Grupo | Datasets | Filas |
|---|---:|---:|
| Corpus canónico (7 ligas) | 7 | 34,168 |
| Research (cuotas, estadísticas, auxiliares) | 9 | 63,726 |
| xG (real + estimado) | 6 | 42,156 |
| Situacional (NFL y fútbol, otro pipeline) | 2 | 48,988 |
| **Total** | **24** | **189,038** |

- `pnpm verify:data`: 0 duplicados, 0 discrepancias de manifiesto.
- 189,038 filas, 164 MB en JSONL; la caché raw (~0.8 GB) está gitignored.

## Fuentes activas

| Fuente | Uso | Datos aportados | Licencia |
|---|---|---|---|
| openfootball | Corpus de fútbol | 26,761 partidos (5 grandes + Liga MX) | CC0 |
| nflverse | Corpus NFL + benchmark | 7,407 partidos; líneas de cierre | CC-BY 4.0 |
| football-data.co.uk | Research (cuotas/estadísticas) | ~60,553 partidos, cuotas 1X2 y O/U 2.5, tiros y córners; xG 2026-27 (`HxG`/`AxG`) | research-only |
| Understat vía Wayback | xG real 2014-2026 | Miles de partidos con xG por partido | research-only |
| ESPN | Estadísticas Liga MX | 1,492 partidos (tiros, córners, posesión, tarjetas); **sin xG** | research-only |
| API-Football | Fixtures/odds Liga MX | 10 partidos con estadísticas; `expected_goals = null` en Liga MX | research-only |
| Open-Meteo | Clima histórico (probado) | 4,691 partidos de PL; sin señal concluyente | uso libre con atribución |

## Fuentes caídas, bloqueadas o agotadas

| Fuente | Estado | Evidencia |
|---|---|---|
| Understat en vivo | Caída | «We will come back soon» en todas las páginas (varias comprobaciones) |
| ClubElo API | Caída | HTTP 502; HTTPS sin conexión |
| SofaScore | Bloqueada | `api.sofascore.com` 403; `api.sofascore.app` respuestas vacías |
| FotMob | Sin API | HTML renderizado en cliente; sin xG accesible |
| FiveThirtyEight SPI | Retirada | El endpoint devuelve HTML, no CSV |
| Wayback Machine | Agotada para 2024-25/2025-26 | Ligue 1 2024-25 máx. 171/306; LaLiga 2025-26 máx. 142; snapshots 2026 son mantenimiento |
| FBref / Sports-Reference | Prohibido | Sus términos prohíben el scraping |
| Casas de apuestas | Prohibido | Scraping de bookmakers descartado por política |

## Mejoras de motor atribuibles a estos datos

| Mejora | Antes | Después | Nota |
|---|---|---|---|
| Mezcla-xG (breadth research) | 0.9744 PL | **0.9721 PL** | Brecha vs mercado 0.0116–0.0171 |
| Liga MX con xG estimado | 1.0020 | **1.0011** | XG estimado por tiros, no observado |
| NFL blend ratings + GBM situacional | 0.6682 | **0.6428** (sin empates) | Peso 0.4 elegido en validación |
| Totales NFL calibrados | 0.7155 | **0.6949** | Platt walk-forward; pendiente 0.047 |

## Qué falta y por qué

- **xG real de Liga MX**: ninguna fuente gratuita probada lo ofrece; el estimado por tiros es una aproximación.
- **Understat 2025-26 completo**: depende de que el sitio vuelva; Wayback no tiene snapshots con datos.
- **Alineaciones/lesiones con xG**: sin fuente gratuita viable (API-Football solo da estadísticas de partido).
- **2025-26 de las cinco grandes**: parcial (100–142 partidos por liga) + estimado; no se puede completar sin Understat.

## Cómo verificar

```bash
pnpm verify:data                       # integridad y umbrales
pnpm data:catalog                      # tabla con SHA-256 y manifiestos
pnpm history:xg --offline              # reconstruye xG desde caché
pnpm --filter @pitchlab/ingest exec vitest run --pool=threads
```

## Siguiente paso

La línea de adquisición queda **cerrada** con las fuentes actuales. Si Understat vuelve:

1. `pnpm history:xg` (sin `--offline`) para completar 2024-25/2025-26.
2. Revisar cobertura y regenerar el reporte research.

Mientras tanto, el trabajo pendiente es de producto: integrar el blend NFL como job batch y
exponer los totales calibrados.
