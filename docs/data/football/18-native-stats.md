# 18 · Enriquecimiento desde native-stats.org (research-only)

> **Fecha:** 2026-11-09. **Estado:** dataset de investigación, no publicado, no consumido
> por el producto ni por los modelos. **Origen:** [native-stats.org](https://native-stats.org).
> **Licencia de la fuente:** no publicada.

## 1. Qué es la fuente y qué se puede leer

`native-stats.org` es un sitio comunitario (autor: Daniel) que presenta estadísticas de
fútbol sobre datos de **football-data.org**. Su valor no está en los resultados —esos ya
los tenemos— sino en **agregados derivados** que el sitio calcula con un histórico más
profundo que el nuestro y con el marcador al descanso.

Técnicamente es una app **Phoenix LiveView**: el HTML inicial viene renderizado en el
servidor y se puede leer sin ejecutar JavaScript, pero los filtros (fecha, temporada,
paginación, pestañas) son eventos de socket. Consecuencia práctica:

| Se puede leer estáticamente | No se puede leer estáticamente |
|---|---|
| `/competition/<código>`: tabla, temporadas, 20 partidos visibles | Temporadas anteriores a la actual |
| `/team/<id>`: resumen, agregados de carrera, rachas | Cambiar la competición de la página de equipo |
| `/match/<id>`: marcador final y **al descanso**, goles, tarjetas | Enumerar partidos históricos (la lista solo enlaza los visibles) |
| `/betting`: forma avanzada del día | Otra fecha que la de hoy |
| `/alltime-streaks`: top 50 de rachas de todas las competiciones | — |

No se implementó el protocolo del socket a propósito: multiplicaría las peticiones a un
sitio comunitario y ataría el scraper a una versión de LiveView. Lo que se lee alcanza
para lo que se busca (ver §3) y se mantiene frágil-solo-en-el-HTML.

`robots.txt` **no prohíbe** el rastreo (las dos líneas de `Disallow: /` están
comentadas). Aun así el capturador es secuencial, con pausa configurable (400 ms por
defecto), y cachea los bytes para no volver a pedirlos.

## 2. Por qué este dataset es research-only

La fuente no publica términos ni licencia, y sus datos derivan de football-data.org. Por
eso —y por coherencia con `05-licensing-and-commercial-use.md`— se aplican estas reglas:

1. Vive en `data/history/research/native-stats/`, que está en `.gitignore` y no se
   redistribuye.
2. **Nada del producto lo consume**: ni snapshots, ni API, ni páginas, ni modelos.
3. Es opt-in: no corre en `pnpm build`, ni en CI, ni en el workflow de snapshots.
4. Si el autor del sitio o el equipo pide retirarlo, se borra el módulo y la caché y no
   se pierde nada: ningún artefacto publicado depende de él.

Si algún día se quisiera usar en producción haría falta una licencia explícita; el
camino barato y limpio es football-data.org (la fuente original) con su propio acuerdo.

## 3. Qué agrega al proyecto

| Aporte | Por qué no se puede derivar del corpus | Dónde queda |
|---|---|---|
| **Marcador al descanso** | openfootball publica solo el resultado final; sin descanso no hay mercados de 1T ni HT/FT | `matches.jsonl` (campo `halfTime`) y `half-time-corpus.jsonl` (parche emparejado por id) |
| **Percentiles de gol en 1T y 2T** (`cFHG`, `cSHG`) | requieren la distribución por mitades, que no tenemos | `form/<fecha>.jsonl` |
| **Agregados de carrera por competición** | incluyen temporadas anteriores a 2010-11 | `teams.jsonl` (`aggregates`) |
| **Récords de racha y su poseedor** | contexto histórico que el corpus no cubre | `teams.jsonl` (`streaks[].leagueHistory`) |
| **Auditoría de completitud de la temporada** | la fuente declara partidos jugados por equipo; el corpus se mide contra eso | `manifest.json` → `leagues[].corpusCoverage` |

El valor más alto es el último: convierte una sospecha («¿estará al día el corpus?») en
una lista de equipos y partidos faltantes. Ver §6.

## 4. Contrato del dataset

Se escribe en `data/history/research/native-stats/`:

| Archivo | Grano | Campos clave |
|---|---|---|
| `competitions.jsonl` | competición | `league`, `competitionCode`, `seasonLabel`, `seasons[]`, `standings[]` (pos, equipo canónico, jugados, puntos, goles) |
| `teams.jsonl` | equipo | `teamId` canónico (`<liga>.<slug>` o `null`), `nativeId`, `scopeCode`, `overview`, `aggregates[]`, `streaks[]` |
| `matches.jsonl` | partido | `nativeMatchId`, `date`, `home`, `away`, `score`, `halfTime`, `goals[]`, `corpusGameId`, `corpusScoreMatches`, `addsHalfTime` |
| `half-time-corpus.jsonl` | partido del corpus | `corpusGameId`, `halfTimeHomeScore`, `halfTimeAwayScore`, `nativeMatchId`, `sourceUrl` |
| `form/<YYYY-MM-DD>.jsonl` | partido del día | `metrics` (avgP, avgG, cG, avgSG, cSG, avgCG, cFHG, cSHG, BTS, FTS, c>1,5, c>2,5, c>3,5), `odds`, `usage: research-only` |
| `streak-boards.jsonl` | tablero global | top 50 de rachas: `rank`, `nativeId`, `days`, `matches`, `periodStart`, `periodEnd` |
| `manifest.json` | corrida | procedencia, cobertura, cotejo y límites |

Cada fila lleva `source: { url, retrievedAt, sha256 }` del HTML del que salió: sin eso no
hay auditoría posible. Contrato de honestidad: **un dato que la fuente no publica es
`null`**, nunca cero ni media imputada.

### 4.1 Semántica de las métricas de forma

La página de forma publica dos tipos de número y **no** son intercambiables:

- **Promedios** (`avgP`, `avgG`, `cG`, `avgSG`, `cSG`, `avgCG`): media por partido de los
  últimos partidos que el sitio considere. `c*` es la versión «combinada» del par.
- **Percentiles** (`cFHG`, `cSHG`, `c>1,5`, `c>2,5`, `c>3,5`, `BTS`, `FTS`): porcentaje
  (0–100) de partidos que cumplen la condición, según el `title` de cada columna. Se
  guardan como porcentaje, no como probabilidad 0–1, para no falsear la magnitud.

## 5. Cómo se corre

```bash
pnpm history:native-stats                    # 6 ligas, descarga y reconstruye
pnpm history:native-stats --offline          # solo caché (reproducible, sin red)
pnpm history:native-stats --leagues=premier-league --max-teams=22 --max-matches=8
pnpm history:native-stats --no-form --no-matches --no-streaks --delay-ms=600
```

Salidas: `data/history/research/native-stats/` (dataset), `data/history/raw/native-stats/`
(bytes crudos, en `.gitignore`) y `Reportes/datos/NATIVE-STATS.md` (reporte legible).

Reglas de captura implementadas:

- Se lee `robots.txt` primero; si el grupo `*` prohíbe la raíz, **aborta**.
- Peticiones secuenciales con pausa; los bytes se cachean y `--offline` reprocesa sin red.
- Una página que responde 5xx se declara ausente y la corrida sigue (no se inventa nada).
- Los equipos se emparejan en cascada: alias curado → slug exacto → mismo conjunto de
  tokens → contención única por prefijo/sufijo. Sin candidato único, el nombre queda sin
  emparejar y se lista en el reporte para curación explícita.

## 6. Hallazgo de la primera corrida (2026-11-09)

La corrida completa sobre las seis ligas de fútbol arrojó:

| Métrica | Valor |
|---|---:|
| Equipos leídos / emparejados | 113 / 111 |
| Páginas leídas | 170 |
| Marcadores al descanso capturados | 24 |
| Partidos con forma avanzada del día | 2 |
| **Equipos con el corpus atrasado** | **111** |
| **Partidos faltantes en la temporada en curso (aprox.)** | **385** |

Traducido: **el corpus histórico está al día hasta 2026-09-20 y la temporada 2026-27 va
por la jornada 10-12 según la fuente**. Además, `liga-mx` no tiene **ninguna** fila de
2026-27 en el corpus (su última fecha es 2025-05-04). Esto no lo descubrió native-stats,
pero sí lo cuantificó equipo por equipo.

Consecuencia directa: el cotejo de rachas quedó en 0 comparables, porque comparar la
racha vigente de la fuente contra un corpus con 5-7 partidos menos por equipo no prueba
nada en ninguna dirección. El reporte lo dice explícitamente en vez de mostrar un
«0 discrepancias» engañoso.

### Siguiente paso (no incluido aquí)

Actualizar la temporada en curso en el corpus y volver a correr. El orden razonable:

1. Revisar por qué `openfootball/2026-27/*.json` se queda en septiembre (¿archivo parcial,
   caché vieja?) y, si hace falta, complementar con football-data.org —que ya está en el
   pipeline de snapshots y sí tiene la jornada 10.
2. Regenerar `data/history/*.jsonl` con `pnpm history`.
3. Volver a correr `pnpm history:native-stats`: las rachas pasan a ser comparables y el
   reporte dirá si el corpus reproduce la fuente o no.

## 7. Reglas anti-leakage

1. **La forma es una foto del día.** `form/<fecha>.jsonl` describe el estado en esa fecha;
   usarla como feature de un partido anterior es leakage puro. Solo vale hacia adelante,
   con `availableAt` = fecha de captura.
2. **El descanso es resultado, no pronóstico.** `halfTime` se conoce al terminar el
   partido; si algún día entra al corpus, `availableAt` debe seguir siendo el final del
   partido (misma regla que el marcador final).
3. **Nada de esto entra al entrenamiento hoy.** El dataset no está conectado a
   `services/models` ni a los engines; conectarlo exige pasar el gate de
   `13-validation-protocol.md`.
4. **Percentiles ≠ probabilidades.** Usar `cFHG` como si fuera P(gol en 1T) es un error de
   lectura: es un percentil del sitio, con su propia definición y su propia ventana.

## 8. Promoción del descanso al corpus (diseño, no ejecutado)

`half-time-corpus.jsonl` ya trae el parche listo (`corpusGameId` + los dos goles). Para
promoverlo haría falta:

1. Agregar `halfTimeHomeScore`/`halfTimeAwayScore` opcionales a `HistoricalGameSchema`
   (`history/schema.ts`).
2. Un paso de merge en `history/builder.ts` que aplique el parche **solo** si el partido
   existe y el marcador final coincide, y que lo declare en el manifiesto (un corpus
   parcheado no es el mismo dataset que uno crudo).
3. Actualizar `HISTORY_SCHEMA_VERSION` y regenerar; el `datasetId` cambiará.
4. Antes de usar el descanso en un modelo de 1T: gate de `13-validation-protocol.md`.

No se hizo ahora a propósito: tocar el corpus canónico por una fuente sin licencia es
exactamente lo que la doctrina del proyecto evita. El parche queda como insumo explícito.

## 9. Límites declarados

- **Sin enumeración histórica**: no se pueden bajar temporadas pasadas ni partidos que no
  estén enlazados hoy. El histórico de descansos se construye **hacia adelante**.
- **Cobertura del emparejamiento**: 2 nombres de Liga MX (`Atlante FC`, `Querétaro FC`) no
  existen en nuestro histórico y quedan sin emparejar; no se les inventa un id.
- **Frágil por construcción**: si el sitio cambia el HTML, los parsers fallan. Hay tests
  con fixtures que reproducen el marcado real y fallan ruidosamente cuando cambia.
- **Mojibake y entidades**: LiveView re-escapa texto dentro de atributos `phx-*`; el
  parser decodifica entidades dos veces y limpia sufijos como `(12)` de los encabezados.
- **Sin licencia**: ver §2. Cualquier uso fuera de investigación requiere acuerdo previo.
