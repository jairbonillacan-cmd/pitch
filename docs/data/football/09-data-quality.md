# 09 · Data quality engine y quality gates

> Implementación: `services/ingest/src/history/quality.ts`; resultados vigentes en
> `data/history/manifest.json` y `Reportes/datos/HISTORICO-QUALITY.md`.
> **Fecha:** 2026-11-08 · Corpus auditado: 34,168 partidos, 7 ligas, 108 temporadas.

## 1. Los 7 checks implementados

| # | Check | Severidad | Por qué existe |
|---|---|---|---|
| 1 | Identificadores únicos | **error** (bloquea) | Un partido duplicado infla dos veces cualquier métrica |
| 2 | Un equipo por jornada y temporada (por `season\|stage\|period`) | **error** | Detecta torneos mezclados o jornadas colapsadas |
| 3 | Local ≠ visitante; marcadores dentro de rango (≤15 fútbol, ≤90 NFL) | error / warning | Marcadores imposibles o atípicos |
| 4 | Cobertura por temporada frente a `expectedGamesPerSeason` | info | La temporada en curso siempre sale «partial» — es honesto, no es error |
| 5 | Temporadas anómalas respecto de la mediana **de su grupo de tamaño de liga** | warning | Detecta cancelaciones (mediana por grupo: Ligue 1 cambió de 20 a 18 clubes) |
| 6 | Posibles identidades duplicadas de equipos (tokens compartidos sin coincidencia de temporada) | warning | «Celta» vs «Celta Vigo» siendo el mismo club; con whitelist `distinctTeamPairs` para pares realmente distintos (Ajaccio/Gazelec Ajaccio) |
| 7 | Tasas agregadas (localía, empate, goles medios) | sanity | Una liga con 75 % de locales o 6 goles de media delata un error de normalización |

Regla del pipeline: **errores → el CLI sale con código 1 y el dataset no se usa para
entrenar**; warnings → requieren revisión humana pero no invalidan el corpus; info →
contexto.

## 2. Estado de calidad verificado (datasetId `0ddb5936738a2b15…`)

- **Errores: 0. Advertencias: 1** — Ligue 1 2019-20 con 279 de ~380 partidos (la
  temporada que la pandemia cortó: dato real, no defecto de ingesta).
- Historia de la corrección: la build anterior tenía 2 errores (10 IDs duplicados y
  1,089 doble-ocupaciones en Liga MX) porque el torneo Apertura/Clausura no entraba ni
  al `id` ni al `stage`. Corregido en el normalizador (`parseStage` + prefijo de torneo
  + `phase: postseason`); la re-construcción completa quedó en 0 errores. Antes de esa
  corrección también existían warnings de identidad (`Celta`/`Celta Vigo`,
  `Lazio Roma`/`Lazio`), hoy resueltos con la tabla de alias por liga.
- Liga MX: 1,189 partidos en 4 temporadas openfootball; Clausura 2020 con 90 partidos
  (COVID, real); liguillas etiquetadas `postseason`.

## 3. Quality gates para decidir el uso de una temporada

| Gate | Criterio | Uso permitido |
|---|---|---|
| **Apta para entrenar** | errores=0 en la liga, temporada `complete`, fase `regular` | Entrenamiento y validación |
| **Apta para evaluar** | errores=0, temporada `partial` cerrada (p. ej. COVID) | Evaluación fuera de muestra; entrenar con ella solo si el feature lo tolera |
| **Solo visualización** | temporada en curso (`season_in_progress`) | UI y contexto, nunca training |
| **No utilizable** | algún error activo en la liga | Nada (bloqueado por el CLI) |

Regla específica de liguilla: los partidos `phase: "postseason"` no entran al
entrenamiento de jornada regular sin un modelo que los separe (la final no es una
jornada 18). Hoy ya están etiquetados; el filtro en el benchmark es el paso pendiente
(`12-model-improvement-plan.md`).

## 4. Cómo se audita una temporada nueva

```bash
pnpm history --leagues=liga-mx        # reconstruye y audita solo esa liga
# revisar Reportes/datos/HISTORICO-QUALITY.md y el exitCode
```

No se aceptan datasets silenciosamente incompletos: lo incompleto aparece en el
manifiesto (`status: partial/missing`) y en el reporte, no escondido.
