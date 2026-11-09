# 11 — Limitaciones y riesgos

**Documento:** consolidación de A03 (fuentes y licencias), A04 (calidad de datos), A05 (features/leakage) y A09 (adversarial), más los hechos medidos en A06/A07/A08.
**Fecha:** 2026-11-09 · **Autor:** SUBAGENTE 11 — DOCUMENTATION & REPRODUCIBILITY.
**Fuentes:** [`A03`](../../research/prediction-lab/reports/A03_data_sources.md) · [`A04`](../../research/prediction-lab/reports/A04_data_quality.md) · [`A05`](../../research/prediction-lab/reports/A05_features.md) · [`A09`](../../research/prediction-lab/reports/A09_adversarial_preliminary.md) · [`A06`](../../research/prediction-lab/reports/A06_motor_a_experiments.md) · [`A07`](../../research/prediction-lab/reports/A07_market_intelligence.md).

> **Cómo leerlo.** Cada riesgo lleva severidad, evidencia con `n`, impacto y estado. `ABIERTO` = sin mitigar; `MITIGADO` = hay control documentado pero el riesgo persiste; `CORREGIDO` = el defecto concreto ya no existe; `PENDIENTE VERIFICACIÓN` = la corrección existe pero no se ha medido su efecto.
> Este registro **no promete** que el sistema sea rentable: documenta por qué podría no serlo.

---

## 1. Registro maestro

| ID | Severidad | Riesgo | Evidencia (n) | Impacto | Estado |
|---|---|---|---|---|---|
| R-01 | **Crítico** | football-data.co.uk **no tiene licencia**; uso comercial NO CONFIRMADO | `terms/licence/about/legal` = 404; solo «My data is free»; `notes.txt` declara compilación desde Oddsportal/Flashscore/ESPN/BBC | no se puede redistribuir ni producir sin resolver derechos | **ABIERTO** (uso interno) |
| R-02 | **Crítico** | Cobertura de cuotas no uniforme y **Pinnacle desaparece en 2026/27** | cierre Pinnacle 58,55 % (0 % en 2026/27; 41,5 % en 2025/26; 99 % hasta 2024/25); cierre B365 24,47 %; apertura B365 76,23 %; en test la apertura cubre **11.295/16.126 (70,0 %)** | benchmark incomparable entre temporadas; 6 ligas sin apertura → fallback | **ABIERTO** (estructural) |
| R-03 | **Crítico** | **Sin timestamp de cuota**: no hay CLV ni movimiento intra-semana verificable | `notes.txt`: captura «Friday afternoons / Tuesday afternoons»; ninguna hora por cuota | apertura y cierre son **escenarios**, no una serie temporal; ningún backtest es operable | **ABIERTO** (estructural) |
| R-04 | **Crítico** | Leakage legacy en motores actuales: MX y NHL | MX 8/9→5/9 y 20/27→16/27; NHL 8/11→7/11 picks y 9/11→7/11 ML | cualquier calibración/EV de MX-NHL está contaminada | `CORREGIDO` solo en el lab nuevo; **legacy intacto** |
| R-05 | **Crítico** | Leakage de priors S+1 en `features.parquet` (100,00 % de 166.615 filas) | ablación: priors −0,00368 → causales −0,00045 (**88 % del valor era futuro**); efecto medido en el modelo: hgb **1,00730 → 1,00974** | modelos A06 de v1.0 sobreestimados ~0,0024 nats | `CORREGIDO` y **medido**; ablación por bloques no re-ejecutada en v1.1 |
| R-06 | Alto | Licencias de terceros: StatsBomb «research», NHL sin licencia, CFBD «All rights reserved», ESPN prohibido | §3 de [`03_FUENTES_DATOS_GRATUITOS.md`](03_FUENTES_DATOS_GRATUITOS.md) | bloquea producto comercial multi-deporte | `MITIGADO` (no se integraron) |
| R-07 | Alto | **xG ausente** con licencia clara | football-data `HxG/AxG` solo 2026/27 (E0 90/90, SP1 109/109); StatsBomb no cubre temporada actual; Understat caída; FBref 403 | el Motor A no puede usar la familia de features con más señal potencial | **ABIERTO** |
| R-08 | Alto | **Selección de modelo sobre una sola temporada de validación** | EXP02 elige 1 de **96** configuraciones; EXP06 1 de **5** métodos; val n = 8.152 | IC de val puede ser optimista; el «mejor» puede ser ruido | **ABIERTO** (documentado) |
| R-09 | Alto | **Sobreajuste al añadir complejidad** | HGB con cuotas: 0,98168 en dev vs 0,99035 en val (A07); M2 gana en val pero en walk-forward de dev: +0,00026/+0,00017/−0,00006/−0,00006 | el clasificador «con cuotas» pierde contra el de-vig | `MITIGADO` (se prohíbe el clasificador como camino principal) |
| R-10 | Alto | **Mercados no operables** | EXP13 usa cierre (no disponible antes del partido); margen 2,81 % (Pinnacle cierre) y 6,15 % (B365 cierre); el EV nunca se validó contra precio real | ninguna cifra de EXP13 es una estrategia; «batir al de-vig» ≠ batir al precio | **ABIERTO** |
| R-11 | Alto | **Test reservado** | `test` (16.126) evaluado **una sola vez** el 03:36 tras `FREEZE.md` (03:35, creado antes del test) | el test ya está usado: no puede volver a usarse para elegir | **CERRADO** (con ese coste) |
| R-12 | Alto | **Deriva de artefactos** | `validation_report.json` (182.414, 73 checks/0 críticos) y `features_market.parquet` (182.410×192) **regenerados**; `matches` 182.414; `features` 182.410×198 | los informes de A04/A05/A08 conservan cifras de v1.0 | `MITIGADO`; quedan artefactos antiguos con test en disco |
| R-13 | Medio | Suite ETL en rojo tras v1.1 | `etl/tests/test_validators.py:52` fijaba `rows == 181272` | falsa sensación de que la validación cubre el dataset actual | **CORREGIDO**: **11/11 OK** (7,5 s) |
| R-14 | Medio | Calidad de datos de origen | 4 partidos sin resultado; 1 fila fuera de ventana (`ARG:20150129`); 693 filas fuera de ventana mensual (554 COVID); 13 filas SOT>tiros; 1 con 145 faltas; 1 con 9 rojas | sesgos si no se excluyen | `MITIGADO` (exclusiones documentadas) |
| R-15 | Medio | Cuotas corruptas/placeholder | 20 celdas ≤1 anuladas; 15 filas con margen anómalo; **406 filas BFE** con 1,01/1,04; 54 celdas `max<avg`; 2.192 cierres B365 = apertura | agregados de mercado engañosos | `MITIGADO` (BFE excluido; `max` no se usa como libro) |
| R-16 | Medio | `kickoff_time` con zona horaria desconocida | 73.006 no nulos (40,28 %), 0 % antes de 2019/20; MEX mezcla 18:00/23:00/01:30/03:30 el mismo día | no sirve para ordenar ni para anti-leakage | `MITIGADO` (se usa `match_date` con holgura) |
| R-17 | Medio | Inferencia con bloques gruesos y sin corrección múltiple | 22 divisiones en val; >2 sistemas comparados; sin Holm | IC conservador/ruidoso; falsos positivos por multiplicidad | **ABIERTO** (fase 2) |
| R-18 | Medio | `days_rest` sin acotar | máximo **8.477 días**; 3,3 % > 30 días | outliers dominan la cola del escalado | **ABIERTO** (clip pendiente) |
| R-19 | Bajo | ECE depende del binning | 10 bins; predictor constante da ECE = 0 | métrica de calibración engañosa aislada | `MITIGADO` (curva + OvR siempre) |
| R-20 | Bajo | Documentación heredada con afirmaciones falsas | `docs/10-nhl-engine.md:19,54` (`SA` «sin la auditoría»); `docs/09:57-60` (paridad como validación) | un revisor confía en una garantía inexistente | **ABIERTO** (fuera del alcance de A11) |

---

## 2. Licencias y derechos

| Fuente | Licencia | Comercial | Consecuencia |
|---|---|---|---|
| football-data.co.uk | **ninguna publicada** | **NO CONFIRMADO** | uso interno de investigación; no redistribuir CSV ni exponer API |
| StatsBomb Open Data | *Public Data User Agreement* (research) | **NO CONFIRMADO** | solo offline para entrenar/validar xG |
| nflverse / nfl-data-py | **CC BY 4.0** / MIT | **SÍ** con atribución | única familia con vía comercial clara |
| openfootball / football.db | CC0 1.0 / dominio público | **SÍ** | bajo valor predictivo |
| OpenLigaDB | ODbL | **SÍ** con *share-alike* | cuidado con la base derivada |
| NHL API | no documentada | NO CONFIRMADO | caché y plan B |
| CollegeFootballData | «All rights reserved» | NO CONFIRMADO | free tier «for testing» |
| ESPN / Disney | ToS | **NO** | cero tolerancia |

**Riesgo jurídico específico:** aunque football-data no reclame derechos, `notes.txt` declara que compila resultados de XScores/BBC/Flashscore/ESPN y cuotas de Betbrain/Oddsportal/casas. La titularidad está **contaminada** y el derecho *sui generis* de la UE protege la inversión en recolección. Mitigación vigente: uso interno, atribución y **solo probabilidades derivadas propias** en cualquier artefacto.

**Pendiente:** la capa de licencias (`ok | no_confirmado | prohibido`) que rompa el build si un dataset `no_confirmado` entra en un artefacto público **no está implementada**; hoy la licencia vive en prosa.

---

## 3. Cobertura y calidad del dato

### 3.1 Cuotas: la cobertura agregada engaña

| Campo | Cobertura (A04, n = 181.272) | Recalculado sobre v1.1 (n = 182.410) | Lectura |
|---|---:|---:|---|
| `result` / goles | 99,998 % | 99,998 % (4 nulos) | 4 partidos sin resultado |
| Tiros / SOT | 50,92 % / 50,42 % | 50,61 % | solo divisiones principales |
| Apertura B365 | 76,23 % | 75,83 % | 0 % en 2000/01–2001/02 y en extra |
| Cierre B365 | 24,47 % | 24,32 % | solo desde 2019/20 |
| Apertura Pinnacle | 42,01 % | 41,75 % | desde 2012/13; 0 % en 2026/27 |
| **Cierre Pinnacle** | **58,55 %** | **58,18 %** | 99 % hasta 2024/25; **41,5 % en 2025/26; 0 % en 2026/27** |
| Cierre Avg | 40,26 % | — | 100 % en extra; 5–12 % antes de 2019/20 |
| Totales cierre B365 | 22,89 % | 22,74 % | solo 2019/20+; 0 % en extra |

**2000/01 y 2001/02 (10.780 filas, 32 grupos división-temporada) no tienen ninguna cuota 1X2.** El universo útil empieza en 2002/03 (apertura B365) y 2019/20 (cierre B365). Cualquier comparación de Motor B con «el mercado» cambia de libro según la temporada; **la serie de cierre no es única** y hay que declarar la fuente en cada tabla.

**Consecuencia para 2026/27:** sin Pinnacle, el cierre de referencia es B365 (99,4–100 %). `live` (3.398 partidos) sirve para monitorizar, **no** para comparar contra el mejor precio histórico.

### 3.2 Defectos de origen (documentados, no corregidos en el parquet)

- **4 partidos sin resultado** (`F2:20251205:bastia:red_star`, `G1:20190317:panathinaikos:olympiakos`, `BRA:20161211:chapecoense_sc:atletico_mg`, `G1:20150510:niki_volos:ofi`): fuera de cualquier target, no se imputan.
- **1 fila fuera de ventana ±1 año** (`ARG:20150129:boca_juniors:velez_sarsfield`): excluir.
- **693 filas fuera de la ventana mensual estricta**: 554 de 2019/20 (extensión COVID), 26 de ARG 2020, 112 de BRA 2020 y la fila ARG. Son extensiones de calendario.
- **Estadísticas imposibles:** 13 filas con SOT > tiros, 1 con 145 faltas (`D2:20020422:bielefeld:hannover`), 1 con 9 rojas visitantes (`SP2:20201113:zaragoza:oviedo`). Anular celdas, no partidos.
- **Equipos:** 5 clusters de alias (Colón obligatorio; Las Palmas/Lommel/Extremadura probables; **no** fusionar Bastia/CA Bastia ni filiales), 1 colisión de slug intra-temporada (ARG 2022) y 21 equipos-temporada con ≤2 partidos (playoffs).
- **Representación:** `match_date` es texto y `home_goals/away_goals` son `float64` (por los 4 nulos), no `date`/`int` del contrato; 24.362 filas (13,4 %) usan etiqueta `YYYY` en vez de `YYYY/YY`.

### 3.3 El hueco G1: corregido en datos, no en la validación

La pérdida de 1.142 partidos de la Superliga griega 2000/01–2004/05 (cabeceras `HT`/`AT` que `build_matches.py:184-185` no mapeaba) se corrigió en el ETL v1.1: `matches.parquet` pasa de 181.272 a **182.414** filas. Sin embargo:

- `data/processed/validation_report.json` sigue describiendo **181.272** filas (no regenerado).
- `data/processed/features_market.parquet` sigue en **181.268 × 192** (generado antes del fix): un join por `match_id` pierde los 1.142.
- `features.parquet` sí se regeneró: **182.410 × 198**.

---

## 4. La limitación estructural: no hay cuotas con timestamp

Es la restricción que más condiciona el proyecto.

| Lo que se puede hacer | Lo que **no** se puede hacer |
|---|---|
| usar apertura como información pre-partido (suposición declarada) | simular CLV |
| usar cierre como **benchmark** de mercado | afirmar que una decisión tomada el viernes usó el cierre del domingo |
| evaluar el escenario *closing-line* declarándolo | presentar EXP13 como estrategia operable |
| comparar de-vig power vs proporcional vs Shin | estudiar dispersión entre casas o movimiento intra-semana |

**Evidencia del impacto:** el cierre mejora la apertura +0,00319 (dev) y +0,00431 (val) de log-loss, y **8×** más en el decil de mayor movimiento (0,01562 vs 0,00191); pero el movimiento **no aporta nada más allá del cierre** (Δ +0,00029 [+0,00001, +0,00059], empeora). Es un diagnóstico de eficiencia, **no una feature operable** (A07 §5).

**Salida:** *polling* propio con 2 capturas/día (apertura y ~60 min antes del kickoff) guardando `captured_at`, `source`, `market`, `line`. En seis meses habría un histórico de CLV que ningún proveedor gratuito vende. **No iniciado.**

---

## 5. xG: ausente donde importa

- football-data añadió `HxG`/`AxG` **solo en 2026/27** (E0 90/90, SP1 109/109) y **eliminó Pinnacle** en la misma temporada: se gana una feature y se pierde el mejor benchmark.
- StatsBomb Open Data tiene `statsbomb_xg` por disparo (80 pares competición-temporada) pero **no cubre la temporada actual** y su licencia es de investigación.
- Understat está caída y FBref devuelve 403: las dos fuentes de xG «de liga» no están disponibles.

**Impacto medido:** los tiros aportan −0,0013 de log-loss al quitarlos (ablation `d → e`), y solo el 51 % de las filas los tiene. No hay evidencia de que xG aporte más que los tiros; **es una hipótesis sin probar** (EXP04), no un hecho.

---

## 6. Selección de modelo y sobreajuste

| Fuente de sobreajuste | Magnitud | Contramedida |
|---|---|---|
| EXP02: 1 de 96 configuraciones sobre val (8.152) | mejor vs defecto −0,00210 IC [−0,00366, −0,00068]; el ranking de dev coincide | documentar; no reelegir con test |
| EXP06: 1 de 5 calibradores | mejor caso −0,00112 IC [−0,00270, +0,00047] (IC cruza 0) | adoptar solo con walk-forward |
| Calibración ajustada y evaluada en la misma temporada | «mejora» falsa de −0,0062 de log-loss y −0,0143 de ECE | todos los números reportados son walk-forward |
| HGB sobre cuotas | 0,98168 dev vs 0,99035 val (peor que de-vig 0,98984) | prohibido como camino principal |
| Capa de calibración M2 (12 parámetros) | gana −0,00054 en val pero +0,00026/+0,00017 en 2019/2020 | condicionada a walk-forward con signo estable |
| Bloques de bootstrap gruesos en val (22 divisiones) | IC ancho para diferencias < 0,001 | reportar `n_blocks` |

**Lectura honesta:** las diferencias que se defienden (Elo, forma, tiros) son de 0,001–0,004 nats con `n = 116.830` y signo estable 16/16; las que no se defienden (calibración, priors, descanso) tienen IC que cruza 0 o magnitud despreciable. **La brecha con el mercado (0,016–0,019) es varias veces mayor que cualquier mejora de modelado conseguida.**

### 6.1 Leakage: legacy vs corregido

| Ámbito | Defecto | Magnitud | Estado |
|---|---|---|---|
| Motores legacy (MX) | totales de la temporada en curso | 8/9→5/9 (J15); 20/27→16/27 | **sin corregir** (no se tocan) |
| Motores legacy (NHL) | 11 auditorías duplicadas | 8/11→7/11; 9/11→7/11 | **sin corregir** |
| Lab (priors) | join invertido S+1 | 100,00 % de 166.615 filas; 88 % del valor aparente | **corregido**, verificado (99,63 % S−1) |
| Lab (`season_progress`) | calendario futuro | hasta 0,60 de cambio al truncar | **corregido** |
| Lab (post-partido) | 21 columnas + 5 target en el parquet | `corr(Δelo, gd) = 0,879` | **mitigado** (lista blanca; test pendiente) |

**Riesgo residual:** la ablación que cuantificó el daño de los priors se ejecutó sobre el parquet **anterior**; el efecto de la corrección sobre las métricas de A06 **no se ha medido** (EXP01 se está reejecutando sobre v1.1). Hasta que ese run cierre, los números de A06 son **pre-corrección** y deben citarse como tales.

---

## 7. Mercados no operables y integridad de la decisión

1. **Cierre ≠ operable.** Toda tabla que use cierre es benchmark; el único escenario operable es apertura, con la suposición de disponibilidad pre-partido.
2. **Margen:** 2,81 % en Pinnacle cierre y 6,15 % en B365 cierre (poblaciones de A07). Batir al de-vig **no** es batir al precio.
3. **`NOB` roto** en fútbol/NHL/MLB: devuelve «SIN VALOR» con cualquier cuota válida aunque `bestOf` encuentre EV +19,6 % (A09 R09). En el lab nuevo no se replica, pero el defecto sigue en el legacy.
4. **Parlays correlacionados:** multiplican probabilidades de legs del mismo partido como si fueran independientes; el ejemplo de A09 da p = 0,3025 donde el resultado conjunto real es 0 y EV = −1.
5. **Stake fijo 5/10 %** sin relación con el edge y **`fairDefault`** que inventa un precio con 5–10 % de margen.
6. **EV no validado:** sin cuotas históricas con hora, no hay forma de saber si una señal de valor habría sido ejecutable.

---

## 8. Qué falsaría nuestras afirmaciones (kill switches)

| Afirmación actual | La falsaría | Dónde se comprueba |
|---|---|---|
| «El prior causal aporta −0,00045» | ablación post-fix con IC que cruce 0 | `features/audit_features.py` sobre v1.1 |
| «El modelo sin cuotas no bate al mercado» | Δlog-loss < 0 con IC que excluya 0 en `test` | `eval/report.py` con candidatos congelados |
| «El de-vig power es el mejor método» | pérdida mayor que proporcional en una población nueva con IC | `models/b/analysis/exp08a_devig.py` |
| «El cierre es más afilado que la apertura» | Δ ≤ 0 en una temporada independiente | `exp13_movement.py` |
| «No hay leakage en features» | cualquier columna con fecha ≥ `match_date` en el test de viaje en el tiempo | `audit_features.py --skip-ablation` |
| «El canónico es íntegro» | `validators.py` con check crítico > 0 | `etl/validators.py` (tras actualizar el test) |

---

## 9. Bloqueantes antes de cualquier afirmación pública

| # | Bloqueante | Estado al cierre |
|---|---|---|
| 1 | Cerrar `test` una sola vez con candidatos congelados y `metrics.json` reproducible (R-11) | **CERRADO** (03:36; `FREEZE.md` creado a las 03:35:07, antes del test) |
| 2 | Regenerar `features_market.parquet`, `validation_report.json` y arreglar `test_validators.py:52` (R-12, R-13) | **CERRADO** (182.410×192; 73 checks/0 críticos; 11/11) |
| 3 | Re-medir el efecto de los priors y las métricas de A06 sobre v1.1 (R-05) | **CERRADO a nivel de modelo** (hgb 1,00730 → 1,00974); ablación por bloques pendiente |
| 4 | Resolver la licencia de football-data (R-01) | **ABIERTO** — uso interno documentado |
| 5 | No afirmar CLV/ROI sin cuotas con timestamp (R-03, R-10) | **VIGENTE** (regla permanente) |
| 6 | No usar 8/9, 8/11 ni 9/17 como evidencia (R-04) | **VIGENTE** (prohibición documental) |

**Lo que se puede afirmar hoy con evidencia:** existe un dataset canónico de 182.414 partidos × 88 columnas con invariantes verificadas (0 duplicados, 0 resultados incoherentes, 0 cuotas ≤1); hay features causales auditadas, con el leakage de priors corregido y verificado (99,63 % S−1; 100 % del cuádruple `(n,ppg,gf_pg,ga_pg)` con la temporada anterior observada); hay un marco de evaluación con 83 tests, walk-forward con corte por fecha y un cierre único de test; el Motor A desplegado tiene paridad TS 4,997×10⁻¹³; y **el mercado gana por 0,0188–0,0203**. Los motores legacy son paridad fiel, no predicción validada.

**Lo que no se puede afirmar:** que el sistema tenga *edge*, que bata al mercado, que sea rentable, ni que sus probabilidades sean mejores que el precio de cierre. Cualquier afirmación de ese tipo requiere un test nuevo y cuotas con `captured_at`.

## Anexo ciclo 2 — riesgos nuevos

| ID | Severidad | Riesgo | Evidencia | Estado |
|---|---|---|---|---|
| R-21 | Medio | El feed de cuotas (`fixtures.csv`) es **semanal** y puede llegar con 70,8 h de staleness; una captura tardía es post-kickoff y no sirve para CLV | `data/snapshots/manifest.json`: Last-Modified 2026-11-06 vs captura 2026-11-09; 159/160 post-kickoff | **ABIERTO** (capturar antes del kickoff) |
| R-22 | Bajo | Outliers de Betfair Exchange en el feed (overround 2,13 y 1,95) | 2 filas SP2 del snapshot | **MITIGADO** (regla 0,9–1,2 por casa) |
| R-23 | Bajo | La licencia de nflverse exige atribución (CC BY 4.0) | `data/nfl/raw/manifest.json` | **MITIGADO** (atribución en docs y código) |
