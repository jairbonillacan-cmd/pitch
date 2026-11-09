# A04 — Auditoría de calidad del dataset canónico `matches.parquet`

**Fecha:** 2026-11-09 · **Autor:** A04 Data Engineer · **Alcance:** `data/processed/matches.parquet` (181.272 filas, 88 columnas, 23 divisiones, 42 etiquetas de temporada), contrastado contra los 465 CSV crudos de `data/raw/`.
**Entregables:** `etl/validators.py` (73 checks), `data/processed/validation_report.json`, `etl/tests/test_validators.py` (11 tests, OK).

## 1. Veredicto ejecutivo

El dataset es **apto para modelar 1X2 y goles después de aplicar exclusiones explícitas**, pero **no es una base uniforme de cuotas, tiros y totales**. Las invariantes estructurales pasan: 0 `match_id` duplicados, 0 resultados incoherentes con los goles, 0 cuotas ≤ 1 en el parquet final, 0 partidos duplicados y 0 equipos vacíos. El validador sale con código 0 y 26 avisos documentados.

El hallazgo más grave no es una fila corrupta sino una **pérdida silenciosa de ingesta**: 1.142 partidos de la Superliga griega (G1) de 2000/01 a 2004/05 nunca entraron porque esos CSV usan cabeceras `HT`/`AT` y `build_matches.py` solo lee `HomeTeam`/`AwayTeam`. Se documenta y se detecta con `season_history_gaps`; **no se reescribe el ETL** (fuera del alcance de A04). El resto son anomalías de fuente (cuotas placeholder, estadísticas imposibles, resultados ausentes) que se resuelven con exclusiones o nulos.

## 2. Método

Se leyó el contrato `coordination/CONTRACT_DATASET.md` y se perfiló el parquet con pandas 2.2.3 / numpy 2.0.2: nulos, cardinalidades, rangos, duplicados, ventanas, márgenes y distribuciones. Se reconciliaron 465 archivos y 182.415 filas crudas no vacías contra 181.272 canónicas usando `source_season_file` y `source_row`, y se barrieron 2,6 millones de celdas de cuotas. *Overround* = Σ(1/cuota) − 1 sobre el triplete 1X2 completo; libros coherentes B365, Pinnacle y Avg (se excluye `max`, que puede ser negativo por construcción). *Ventana*: jul–jun para `YYYY/YY`, año natural para `YYYY`. Todas las cifras salen de comandos ejecutados; no se descargaron datos.

## 3. Cobertura

| Campo | Cobertura | Lectura |
|---|---:|---|
| `result` / goles | 99,998 % (181.268) | 4 partidos sin resultado |
| Descanso | 82,58 % | ausente en ligas extra |
| Tiros / SOT | 50,92 % / 50,42 % | solo divisiones principales |
| Apertura B365 | 76,23 % | 0 % en 2000/01–2001/02 y en extra |
| Cierre B365 | 24,47 % | solo desde 2019/20 |
| Apertura Pinnacle | 42,01 % | desde 2012/13; 0 % en 2026/27 |
| Cierre Pinnacle | 58,55 % | 99 % hasta 2024/25; 41,5 % en 2025/26; 0 % en 2026/27 |
| Cierre Avg | 40,26 % | 100 % en extra; 5–12 % en principal antes de 2019/20 |
| Totales cierre B365 | 22,89 % | solo 2019/20+; 0 % en extra |

La cobertura agregada engaña: **2000/01 y 2001/02 (10.780 filas, 32 grupos división-temporada) no tienen ninguna cuota 1X2**; el universo útil empieza en 2002/03 (apertura B365) y 2019/20 (cierre B365). Pinnacle —referencia de Motor B— **desaparece en 2026/27** y queda al 41,5 % en 2025/26; ahí el cierre es B365 (99,4 % y 100 %).

| Grupo | Div | Partidos | % tiros | % apertura B365 | % cierre Pinnacle | % totales cierre B365 |
|---|---|---:|---:|---:|---:|---:|
| Élite con tiros completos | E0, E1, SC0 | 30.438 | 100,0 | 92,3–92,4 | 49,9–51,7 | 27,2–27,8 |
| Principal con tiros altos | D1, I1, SP1, F1 | 37.191 | 81,0–96,2 | 92,3–93,5 | 51,0–53,0 | 25,5–28,5 |
| Principal con tiros parciales | D2, I2, SP2, F2, N1, P1, T1, B1, SC1 | 76.947 | 31,6–44,7 | 90,8–92,3 | 48,4–50,8 | 24,4–27,7 |
| Griega | G1 | 5.223 | 42,3 | 98,0 | 60,7 | 33,1 |
| Extra sin tiros ni apertura | ARG, BRA, JPN, MEX, SWE, USA | 31.473 | 0,0 | 0,0 | 91,7–96,8 | 0,0 |
| **Total** | 23 divisiones | **181.272** | 50,9 | 76,2 | 58,5 | 22,9 |

Las seis ligas extra solo aportan resultado, goles y cierre: no tienen tiros, córners, faltas, tarjetas, descanso, apertura ni totales. Los modelos de "estilo de juego" quedan limitados a las 17 divisiones principales y a sus temporadas con tiros.

## 4. Identidad y duplicados

No hay duplicados: 0 `match_id` repetidos, 0 filas exactamente iguales (ignorando `match_id`, `source_row` e `ingested_at`), 0 partidos repetidos con misma fecha/equipos, 0 invertidos, 0 equipos jugando dos veces el mismo día y 0 entre divisiones. La reconstrucción de `match_id` (`div:YYYYMMDD:home_slug:away_slug`) coincide en el 100 % de las 181.272 filas; `source_row` es positivo y único por archivo.

### 4.1 El defecto de ingesta G1 (1.142 partidos)

La reconciliación completa da **182.415 filas crudas no vacías frente a 181.272 canónicas**. La diferencia (1.143) se descompone en:

- **1.142 partidos G1** en `data/raw/main/0001/G1.csv` … `0405/G1.csv`. Esos cinco ficheros usan cabeceras `HT`/`AT`; `build_matches.py` (líneas 184–185) solo mapea `HomeTeam`/`AwayTeam`, así que descarta todas las filas. Reparto: 240 + 182 + 240 + 240 + 240 (el fichero 2001/02 tiene 58 líneas en blanco). G1 pasa de 5.223 a 6.365 esperados: **falta el 17,9 % de la división y el 0,63 % del dataset**.
- **1 fila vacía** en `mmz4281/1314/T1.csv` (fila 307, todos los campos vacíos), que no es un partido.

`season_history_gaps` detecta los cinco años ausentes (2000–2004). La recuperación exige corregir el ETL y reingestionar; A04 no puede hacerlo.

## 5. Equipos y alias

Hay 845 nombres distintos, 1.058 pares división-equipo y 10.200 observaciones equipo-temporada; 213 nombres aparecen en más de una división por ascensos/descensos (normal). Los nombres por división van de 19 (SC0) a 88 (SP2). El validador encuentra **5 clusters de alias** y **1 colisión de slug intra-temporada**:

| Div | Variantes | ¿Fusionar? |
|---|---|---|
| ARG | `Colon Santa FE` / `Colon Santa Fe` (2022) | **Sí, obligatorio**: mismo club y slug; parte la identidad a mitad de temporada |
| SP2 | `Las Palmas` / `U.Las Palmas` | Sí, mismo club en eras distintas |
| B1 | `Lommel` / `Lommel SK` | Probable, entidad renombrada |
| SP2 | `Extremadura` / `Extremadura UD` | Probable, pero son clubes sucesores; decisión de negocio |
| F2 | `Bastia` / `CA Bastia` | **No**: son clubes distintos |

También es candidato manual `Oster`/`Osters` (SWE); **no deben fusionarse** `Reggiana`/`Reggina`, `Sociedad`/`Sociedad B`, `Villarreal`/`Villarreal B` ni `Atlético GO`/`Atlético-MG`: la distancia de edición es alta pero son clubes diferentes. La clave estable para features debería ser el slug canónico con mapa de alias, no el nombre crudo. **21 equipos-temporada tienen 1 o 2 partidos** (playoffs en JPN 8, SWE 12 y SC1 1): no son errores, pero deben marcarse como `is_playoff` o excluirse de la liga regular.

## 6. Fechas, ventanas y hora

181.272 fechas ISO parseables, sin fechas imposibles; rango 2000-07-28 a 2026-11-06. Las 23 divisiones son monótonas y el dataset está ordenado por `div`, fecha y hora. **1 fila fuera de la ventana ±1 año**: `ARG:20150129:boca_juniors:velez_sarsfield`, 2015-01-29, Boca 1-0 Vélez, etiquetada 2013/14 (temporada terminada en mayo de 2014); parece mal etiquetada o desplazada. **Excluir del modelado.**

Hay 693 filas fuera de la ventana mensual estricta: 554 de 2019/20 (extensión COVID a julio-agosto de 2020 en E0, E1, G1, I1, I2, P1, SP1, SP2 y T1), 26 de ARG 2020 (enero de 2021), 112 de BRA 2020 (enero-febrero de 2021) y la fila ARG anterior. Son extensiones de calendario, no errores.

**4 partidos sin resultado**: dos con descanso 0-3 y sin marcador final (`F2:20251205:bastia:red_star` y `G1:20190317:panathinaikos:olympiakos`; la fuente no registra resolución, no se imputa) y dos sin ningún marcador (`BRA:20161211:chapecoense_sc:atletico_mg` y `G1:20150510:niki_volos:ofi`). Quedan fuera de cualquier target.

`kickoff_time`: 73.006 valores no nulos (40,28 %), todos `HH:MM` válidos; 108.266 nulos (59,72 %). Está al 100 % nulo en 2000/01–2011/12, al 88–95 % en 2012/13–2018/19 y al 0 % desde 2019/20; las extra traen hora desde 2012. **La zona horaria no está documentada y no es uniforme**: MEX 2012-07-21 mezcla 18:00, 23:00, 01:30 y 03:30; ARG 2012-08-04 mezcla 01:10 con 18:10/20:10/22:15; JPN 2012-03-10 tiene 05:00, 08:00 y 10:00; USA 2012-03-10 tiene 23:00 y 2012-03-11 03:30; E0 usa 15:00/20:00. El patrón es compatible con UTC en extra y local en Europa, pero no se puede probar sin fuente externa. **No usar `kickoff_time` para ordenar ni para anti-leakage**; usar `match_date` con un día de holgura.

## 7. Cuotas

Además de la cobertura de la sección 3, el barrido detecta:

- **20 celdas ≤ 1 en crudo**, todas anuladas por el ETL: 19 ceros y un −0,25. Ejemplos: `B365H=0` en Morton-Alloa (2020-02-22), Blackpool-Derby (2013-04-27) e Inverness-Partick (2019-02-02); `P>2.5=0` en Bayern-M'gladbach (2025-05-10) y Barcelona-Girona (2025-10-18); `AvgC>2.5=0,42` en FC Koln-RB Leipzig (2020-06-01); `MaxCA=0` en Ascoli-Spal (2020-12-27). **En el parquet final no queda ninguna cuota ≤ 1.**
- **15 filas con margen anómalo en libros coherentes**: 1 apertura B365 (`F2:20070219:metz:caen`, 1,44/3,00/1,57, overround 66,5 %), 1 cierre Pinnacle (`E1:20251209:preston:coventry`, −6,65 %) y 13 cierres Avg negativos, concentrados en `SP2:20241221` y partidos sueltos de ARG/G1/SC0/MEX/SP1. En Sp Gijon-Málaga, AvgC marca 3,08/3,31/4,83 mientras PS marca 1,83/3,20/5,60: es corrupción de AvgC, no movimiento de mercado.
- **406 filas BFE con margen anómalo** (397 apertura y 9 cierre), casi todas por placeholders 1,01/1,04 del tipo `F2:20250510:paris_fc:ajaccio` (1,04/1,01/1,04). BFE solo existe desde 2024/25 y no es utilizable: **excluir BFE**.
- **54 celdas en 27 partidos con `max < avg`** (imposible si `max` incluye la media), sobre todo MEX/USA del 26–28/09/2026, N1 del 08/09/2026 y E1 del 10/12/2025. No usar `max` como verdad de mercado.
- **Saltos apertura→cierre > 100 %**: 34 celdas en B365/PS/Avg (0,007 % de los pares), 724 en BFE y 1 en BF; ninguno supera el 1000 % en libros coherentes. Ejemplos: Celtic-Hearts 2026-05-16 (Avg 5,01→20,28) y Real Sociedad-Granada 2020-11-08 (PS 5,31→20,34). Son movimientos extremos posibles; se documentan, no se eliminan.
- **2.192 cierres B365 idénticos a la apertura** (5,3 % de 41.407 pares): la fuente no actualizó el cierre; aviso de "cierre no informativo".
- **Totales**: 3 pares over/under incompletos, 14 casos con totales sin 1X2 de la misma fuente y 16 márgenes fuera de rango (11 apertura B365 negativos en E1 2002-11-30, 1 cierre B365, 3 cierre P y 1 cierre Avg); ninguno supera el 50 %. `max` vuelve a tener overround negativo estructural (6.562 filas), que no es error. La línea es 2,5 y **no hay metadato de línea**: la coherencia se limita al par over/under y al margen.

## 8. Goles y estadísticas

181.268 partidos con marcador: media 2,6212 (local 1,4892; visitante 1,1320), 45,06 % H, 26,82 % D y 28,12 % A. El 8,22 % son 0-0; el 12,89 % tiene 5 o más goles; 1.140 tienen 8 o más; 71 tienen 10 o más goles totales (0,039 %) y el máximo es 13 (VVV Venlo 0-13 Ajax, 2020-10-24). Seis partidos tienen un equipo con 10 o más goles (PSV 10-0 Feyenoord, Benfica 10-0 Nacional, Hamilton 10-2 Morton, Hearts 10-0 Cowdenbeath y Real Madrid 10-2 Rayo). Son reales; conviene pérdida robusta o tope visual.

Por división, el rango va de 2,229 goles/partido (ARG) a 3,068 (N1), con F2/SP2 en 2,34–2,35 y D1/USA en 2,92–2,96. 2026/27, con solo 1.868 partidos, muestra 2,956 y no es comparable. Las estadísticas tienen 13 filas con SOT > tiros (p. ej., `E0:20001014:coventry:tottenham` 0 tiros y 5 SOT; `E1:20241110:burnley:swansea` 2 tiros y 7 SOT), 1 con 145 faltas (`D2:20020422:bielefeld:hannover`) y 1 con 9 rojas visitantes (`SP2:20201113:zaragoza:oviedo`). Recomendación: anular esas celdas (no los partidos) o excluir esas filas de modelos de tiros/tarjetas.

## 9. Temporadas incompletas y exclusiones

| Temporada | Filas | Evidencia | Decisión |
|---|---:|---|---|
| 2026/27 | 1.868 (19 divisiones) | en curso; 24–42 % de una temporada completa; último partido 2026-11-01/04 | **Excluir de entrenamiento y evaluación**; solo monitorización |
| 2026 (ARG/BRA/SWE/USA) | 1.530 | en curso; 89–94 % de los partidos de 2025; sin Pinnacle | **Excluir de evaluación**; monitorización |
| ARG 2020 | 134 | 24 equipos, 11,2 partidos/equipo, 32,2 % de la mediana de ARG | **Excluir** |
| SC1 2020/21 | 135 | 10 equipos, 27 partidos/equipo vs 36; 75 % de una temporada normal | Excluir de evaluación comparada; entrenamiento opcional con bandera de formato |
| 2019/20 COVID | 554 filas fuera de jul–jun | extensión jul–ago 2020 en 9 divisiones | Válida para entrenar; **no usar como temporada "normal"** en benchmarks |
| Otras cortas (SC1/F1/F2/N1/SC0/MEX/B1 2019/20, USA 2020, B1 2009/10, ARG 2014/2016/2019/20) | 135–324 | menos partidos/equipo que el p90 de su división | Aviso; excluir de evaluación o modelar con efecto de temporada/formato |

El validador marca 17 temporadas con < 80 % de partidos por equipo respecto al p90 de su división; la lista completa está en `validation_report.json`.

## 10. Validadores y tests

`etl/validators.py` implementa 73 checks: 47 sin hallazgos, 26 con avisos y 0 críticas. Los críticos cubren esquema, unicidad/determinismo de `match_id`, duplicados, equipos vacíos, coherencia resultado-goles/descanso, rangos, cuotas > 1, overround, fechas, archivo/fila de origen y cobertura de resultado. Los avisos documentan alias, cobertura, BFE, `max < avg`, saltos, totales, temporadas cortas/en curso y el hueco G1.

Resultado real: **0 violaciones críticas, 26 avisos, código 0**, informe de 61 KB, ~22 s. Los 11 tests cubren dataset real aceptado, `match_id` duplicado, resultado incoherente, cuota 0,5, overround absurdo, fecha fuera de temporada, goles negativos, equipo vacío, HT > FT, totales absurdos y los dos códigos del CLI; pasan en ~40 s. `season_history_gaps` detecta los cinco años G1 ausentes.

## 11. Decisiones recomendadas

1. **Excluir del target** las 4 filas sin resultado y la fila ARG 2015-01-29 fuera de ventana; no imputar marcadores.
2. **Excluir de entrenamiento/evaluación** 2026/27, 2026 y ARG 2020; de evaluación comparada, SC1 2020/21 y las COVID cortas (si se entrenan, efecto fijo de temporada/formato).
3. **Paneles de cuotas separados**: apertura B365 2002/03+; cierre B365 2019/20+; cierre Pinnacle 2012/13–2024/25 y 2025/26 parcial; para 2026/27, cierre B365. No construir una serie de cierre única sin bandera de fuente.
4. **Excluir BFE** y no usar `max` para overround; `max` solo como cotización extrema, nunca como libro. **Anular celdas** de tiros/faltas/rojas corruptas (13 + 1 + 1) y marcar los 21 equipos-temporada con ≤ 2 partidos como playoff.
5. **Mapa de alias**: Colón obligatorio; Las Palmas, Lommel y Extremadura probables; no fusionar Bastia/CA Bastia, Reggiana/Reggina ni filiales.
6. **No usar `kickoff_time`** para ordenar ni para features temporales; fecha con holgura de un día en extra. **Shots** solo en divisiones principales y desde 2017/18 en la mayoría; **totales** solo 2019/20+.
7. **Corregir el ETL G1** (mapear `HT`/`AT`) y reingestionar 1.142 partidos; hasta entonces, documentar que G1 empieza en 2005/06.

## 12. Limitaciones

La auditoría es interna: no verifica contra una fuente oficial externa, no tiene ID oficial de partido, no conoce la hora de publicación de apertura/cierre ni la zona horaria, y no dispone de historial de líneas. Los defectos de fuente (AvgC corrupto, `max < avg`, BFE placeholder, estadísticas imposibles) se documentan y detectan, pero no se corrigen en el parquet; la corrección del ETL G1 queda fuera de A04. `match_date` está serializado como texto y los goles como float64 (por los 4 nulos), no como `date`/`int` del contrato: desviación de representación, no de contenido. El validador solo ve el canónico y detecta el hueco G1 por temporadas ausentes, no su causa sin leer el crudo. 2026/27 está en curso y sus cifras son provisionales.
