# Enriquecimiento desde native-stats.org

> Fuente raspada solo para investigación. `native-stats.org` no publica licencia y sus
> datos derivan de football-data.org, así que este dataset **no se publica ni se
> redistribuye** y vive en `data/history/research/native-stats/` junto al resto de
> material research-only.

- **Generado:** 2026-11-09 04:53 UTC
- **datasetId:** `da1e6f20cdce13c9bba290a250a3118ca888b066391f050240f5406976fb079c`
- **Corpus de referencia:** 26761 partidos, datasetId `35fea620f15ca0aff9f976ef59c2bd1bfde26e9dad1d250823b44d5bd400018d`
- **Páginas:** 0 descargadas y 170 de caché (19.0 MB)
- **robots.txt:** permite el rastreo

## 1. Qué se agregó

| Aporte | Por qué no se podía derivar del corpus | Estado |
|---|---|---|
| Marcador al descanso | openfootball publica solo el resultado final; sin descanso no hay mercados de 1T ni HT/FT | 24 capturados, 0 ya emparejados con el corpus |
| Percentiles de gol en 1T y 2T (cFHG / cSHG) | requieren la distribución de goles por mitad, que no tenemos | 2 partidos del día |
| Agregados de carrera por competición | incluyen temporadas anteriores a 2010-11, fuera del corpus | 113 equipos leídos |
| Récords de racha de la competición | contexto histórico y poseedor del récord | 111 equipos emparejados |
| Auditoría de completitud de la temporada en curso | la fuente declara cuántos partidos jugó cada equipo y el corpus se puede medir contra eso | ver §3 |

## 2. Cobertura por liga

| Liga | Comp. | Equipos | Emparejados | Partidos leídos | Emparejados | Marcador OK | Descanso | Forma |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| premier-league | PL | 20 | 20 (100.0 %) | 8 | 0 | 0 | 0 | 0 |
| la-liga | PD | 20 | 20 (100.0 %) | 8 | 0 | 0 | 0 | 0 |
| bundesliga | BL1 | 18 | 18 (100.0 %) | 8 | 0 | 0 | 8 | 0 |
| serie-a | SA | 20 | 20 (100.0 %) | 8 | 0 | 0 | 8 | 0 |
| ligue-1 | FL1 | 17 | 17 (100.0 %) | 8 | 0 | 0 | 0 | 0 |
| liga-mx | LMX | 18 | 16 (88.9 %) | 8 | 0 | 0 | 8 | 2 |

## 3. Completitud del corpus frente a la fuente

La fuente publica cuántos partidos lleva jugados cada equipo en la temporada en curso. Comparado con lo que el corpus tiene para ese equipo sale un hueco medido, no una impresión: es la lista de trabajo para actualizar la base de datos.

| Liga | Temporada | Equipos medidos | Equipos atrás | Apariciones faltantes |
|---|---|---:|---:|---:|
| premier-league | 2026/27 | 20 | 20 | 110 |
| la-liga | 2026/27 | 20 | 20 | 98 |
| bundesliga | 2026/27 | 18 | 18 | 96 |
| serie-a | 2026/27 | 20 | 20 | 120 |
| ligue-1 | 2026/27 | 17 | 17 | 93 |
| liga-mx | 2026/27 | 16 | 16 | 251 |

**111 equipos tienen menos partidos que los que la fuente declara jugados**: 768 apariciones faltantes, aproximadamente 385 partidos (cada partido cuenta para dos equipos).

| Liga | Equipo | Partidos en la fuente | En el corpus | Faltan |
|---|---|---:|---:|---:|
| premier-league | premier-league.tottenham-hotspur | 10 | 3 | 7 |
| premier-league | premier-league.aston-villa | 10 | 4 | 6 |
| premier-league | premier-league.crystal-palace | 10 | 4 | 6 |
| premier-league | premier-league.everton | 10 | 4 | 6 |
| premier-league | premier-league.fulham | 10 | 4 | 6 |
| la-liga | la-liga.celta | 12 | 5 | 7 |
| la-liga | la-liga.levante | 11 | 4 | 7 |
| la-liga | la-liga.osasuna | 12 | 6 | 6 |
| la-liga | la-liga.real-sociedad | 12 | 6 | 6 |
| la-liga | la-liga.alaves | 11 | 6 | 5 |
| bundesliga | bundesliga.schalke | 9 | 2 | 7 |
| bundesliga | bundesliga.bayern-munchen | 9 | 3 | 6 |
| bundesliga | bundesliga.elversberg | 9 | 3 | 6 |
| bundesliga | bundesliga.mainz | 9 | 3 | 6 |
| bundesliga | bundesliga.paderborn | 9 | 3 | 6 |
| serie-a | serie-a.atalanta | 11 | 5 | 6 |
| serie-a | serie-a.bologna | 11 | 5 | 6 |
| serie-a | serie-a.cagliari | 11 | 5 | 6 |
| serie-a | serie-a.como | 11 | 5 | 6 |
| serie-a | serie-a.fiorentina | 11 | 5 | 6 |
| ligue-1 | ligue-1.paris | 10 | 3 | 7 |
| ligue-1 | ligue-1.angers-sco | 10 | 4 | 6 |
| ligue-1 | ligue-1.estac-troyes | 10 | 4 | 6 |
| ligue-1 | ligue-1.le-havre | 10 | 4 | 6 |
| ligue-1 | ligue-1.lorient | 10 | 4 | 6 |
| liga-mx | liga-mx.america | 16 | 0 | 16 |
| liga-mx | liga-mx.atlas-guadalajara | 16 | 0 | 16 |
| liga-mx | liga-mx.atletico-san-luis | 16 | 0 | 16 |
| liga-mx | liga-mx.cruz-azul | 16 | 0 | 16 |
| liga-mx | liga-mx.deportivo-guadalajara | 16 | 0 | 16 |

Causa habitual: el archivo de la temporada en curso todavía no incluye las últimas jornadas. La actualización se hace en el pipeline de ingesta, no aquí.

## 4. Cotejo de rachas contra el corpus

Se recalcula desde nuestros resultados la misma racha vigente que publica la fuente. Solo se compara cuando el corpus tiene la misma cantidad de partidos de la temporada: si va por detrás, la diferencia no es un error de definición.

| Liga | Comparadas | Coinciden | No coinciden | No comparables |
|---|---:|---:|---:|---:|
| premier-league | 0 | 0 (—) | 0 | 560 |
| la-liga | 0 | 0 (—) | 0 | 560 |
| bundesliga | 0 | 0 (—) | 0 | 504 |
| serie-a | 0 | 0 (—) | 0 | 560 |
| ligue-1 | 0 | 0 (—) | 0 | 476 |
| liga-mx | 0 | 0 (—) | 0 | 448 |

En esta corrida no hubo rachas comparables: el corpus va por detrás de la fuente en todos los equipos medidos (§3), así que la comparación no puede concluir nada — ni a favor ni en contra.

## 5. Nombres sin emparejar (curación pendiente)

- **liga-mx:** `Atlante FC`, `Querétaro FC`

Se agregan a `NATIVE_STATS_ALIASES` en `services/ingest/src/history/native-stats/resolve.ts`. No se adivina un id: un emparejamiento silencioso y equivocado contamina el dataset.

## 6. Límites declarados

- Dataset de investigación: native-stats.org no publica licencia y sus datos derivan de football-data.org. No se publica ni se redistribuye.
- Los bytes originales de cada página quedan en data/history/raw/native-stats/ para reprocesar con --offline sin volver a pedirlos.
- El marcador al descanso es el único campo que el corpus no puede derivar por sí solo: half-time-corpus.jsonl lo entrega emparejado por id de partido.
- Las rachas se comparan con la misma definición sobre el corpus; una discrepancia señala un hueco de datos o una definición distinta, no se corrige sola.
- La forma avanzada es una foto del día de captura: sirve como referencia as-of, nunca como dato previo al partido de días anteriores.

### Cómo se regenera

```bash
pnpm history:native-stats                 # descarga y reconstruye
pnpm history:native-stats --offline       # solo caché local (reproducible)
pnpm history:native-stats --leagues=premier-league --max-matches=5
```

La captura es secuencial con pausa (`--delay-ms`, 400 ms por defecto) para no castigar un sitio comunitario. Los bytes crudos quedan en `data/history/raw/native-stats/`.

## 7. Resumen

| Métrica | Valor |
|---|---:|
| Ligas | 6 |
| Equipos leídos | 113 |
| Equipos emparejados | 111 |
| Partidos leídos | 48 |
| Descansos capturados | 24 |
| Descansos nuevos para el corpus | 0 |
| Partidos con forma avanzada | 2 |
| Equipos con el corpus atrasado | 111 |
| Partidos faltantes en la temporada (aprox.) | 385 |
| Rachas comparadas | 0 |
| Rachas que no coinciden | 0 |
