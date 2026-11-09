# A02 — Revisión científica del motor de predicción 1X2

**Agente:** SUBAGENTE 02 — SCIENTIFIC RESEARCHER · **Proyecto:** PitchLab Prediction Lab
**Fecha y consulta de fuentes:** 2026-11-09 (America/Mexico_City) · Sin código de producción ni cambios en `src/`, `tests/`, `docs/` o git.

---

## 0. Convenciones y método

Cada afirmación va marcada **HECHO** (leído en el PDF o DOI resuelto), **INFERENCIA** (deducción propia, con el razonamiento) o **HIPÓTESIS** (conjetura falsable aún no contrastada).

**Paper obligatorio.** Descargado con `curl` y User-Agent de navegador desde `mdpi-res.com` → **HTTP 200**, 445.026 bytes, `sha256 9dc0f201…c5e4f27`. Sin `pdftotext`, extraje el texto con Python + `zlib` (`FlateDecode`), operadores `Tj`/`TJ` y **mapas `ToUnicode` por página** (sin ellos se leía `Mor?s Sallis`). Las tablas se re-extraje con posicionamiento `Tm`/`Td` porque la extracción lineal desordenaba celdas. Contrastado con `/tmp/mdpi_norm.txt`: coinciden las cifras citadas.

**Literatura adicional.** DOI resuelto en Crossref y/o OpenAlex; abstract leído cuando el editor lo expone. Estados: **V** = identidad y contenido verificados; **V-m** = solo metadatos; **NV** = no verificado. Los DOI van en línea.

---

## 1. Cinco hallazgos que cambian decisiones

1. **El techo lo pone la información, no el algoritmo (HECHO).** Con el mismo espacio de features, seis clasificadores caben en 0,08 puntos de accuracy (47,96–48,04 %) sin cuotas y 0,27 puntos (51,70–51,97 %) con cuotas.
2. **Meter las cuotas como feature empeora el pronóstico frente a usarlas directamente (HECHO).** En tres clases, todos los modelos con cuotas son **significativamente peores** que el mercado de-vigged en log-loss, Brier y RPS: diferencias pareadas positivas con IC95 % que excluye el cero (GAM +0,0008 [0,0004; 0,0011] en log-loss; RBF +0,0037).
3. **La única ventaja distinguible es real pero operativamente irrelevante (HECHO).** GAM +0,086 pp de accuracy (IC95 % [0,005; 0,158]) ≈ 65 aciertos extra sobre 75.495, sin mejora en ninguna regla propia.
4. **El empate no se predice por argmax, ni por el mercado (HECHO).** Los empates son el 25,37 % del test; el mercado asigna la clase empate a 396 de 75.495 partidos (0,52 %). Sin cuotas, tres de seis modelos nunca predicen empate.
5. **El protocolo anti-leakage del paper debería ser el estándar de PitchLab (HECHO + INFERENCIA).** Point-in-time por día natural, ventana de 5 partidos por sede, imputación con medias anteriores de la competición y winsorización estimada solo en train.

---

## 2. El paper obligatorio

### 2.1 Ficha y corrección de extensión

Sallis, Georgoulas & Tsoulos, *Computation* **2026**, 14(9):195, DOI `10.3390/computation14090195`, publicado 24-ago-2026, CC BY 4.0, 25 páginas. Datos de OPAP, recuperación automatizada; **sin dataset ni código depositados**. Entorno: Python 3.12.10, scikit-learn 1.9.0, NumPy 2.5.0, pandas 2.3.3, semilla 42.

> **Corrección al orquestador (HECHO).** `MASTER.md` §1 registra «PDF obtenido (6 pp.)». Son **25 páginas**: el nodo raíz es `/Type/Pages /Count 25` y los pies dicen «N of 25». El «6» que reporta `file(1)` es el primer nodo `/Pages` del árbol, no el documento.

### 2.2 Dataset, features y anti-leakage

**225.474 partidos**, 20-oct-2018 a 28-feb-2026, **583 códigos de competición**, split **149.979 / 75.495** (suma exacta) con corte el **9-sep-2022** (pp. 3–4, 7). Test: 43,45 % local / 25,37 % empate / 31,18 % visitante.

**18 inputs** (15 sin cuotas): EloDiff, RankDifference, HistHome/HistAway, Imputed, AvgHs/AvgHc/AvgAs/AvgAc (medias de goles en los últimos 5 partidos **en la sede relevante**), AttackMinusDefense, DefenseMinusAttack, TotalScoringPotential, DefensiveWeaknessDiff, HomeCleanSheetRatio, AwayFTSRatio y ProbHome/Draw/Away. Elo con K = 20, rating inicial 1500, **sin término de localía**, esperado logístico de la diferencia/400, empate = medio punto, actualización zero-sum (p. 7).

**Cómo se evita el leakage (p. 6):** (i) para un partido en *t* solo se usan partidos con fecha **estrictamente anterior**; como la fuente no trae hora, se procesa **día a día** (el estado se actualiza tras calcular las features del día, así que partidos coetáneos no se informan entre sí); (ii) ventanas de 5 partidos por sede; (iii) el **22,4 %** con menos de 5 precedentes se imputa con media point-in-time de la competición → media global → prior fijo (0,30/1,00/0,00), conservando un indicador binario; (iv) winsorización al percentil 99,9 calculado **solo en train**; (v) sin remuestreo; (vi) controles de intersección nula y de *warm-up* del Elo (σ = 39 puntos).

**INFERENCIA.** Es el protocolo más replicable de esta literatura, con dos zonas grises: imputar con la media de la competición introduce información de otros equipos (puede explicar la relevancia de `HistHome`/`Imputed`) y no se reporta qué fracción del **test** depende de imputación, así que degradación por imputación y por cambio de régimen no se separan.

### 2.3 Clasificadores y configuración fija (Tabla 3, p. 9)

| Modelo | Implementación | Configuración |
|---|---|---|
| Logistic Regression | `LogisticRegression` | C = 1,0; max_iter = 3000 |
| GAM | `HistGradientBoostingClassifier` **depth = 1** | 300 iteraciones; lr = 0,05 |
| FastTree | `HistGradientBoostingClassifier` | 300 iter.; 31 hojas; lr = 0,05; min_leaf = 100 |
| Random Forest | `RandomForestClassifier` | 200 árboles; 127 hojas; min_leaf = 20; feature_fraction = 0,8 |
| RBF network | `RBFSampler` + `LogisticRegression` | 300 funciones base; gamma = 0,05; C = 1,0 |
| MLP | `MLPClassifier`, 1 capa oculta | 32 unidades; L2 = 1e-4; Adam; early stopping 10 %; max_iter = 300 |

**HECHO — matiz:** el «GAM» **no es un GAM de splines**, sino boosting de árboles de profundidad 1 (aditivo, sin interacciones); el paper lo admite en p. 7.

### 2.4 De-vig

Método **power**: los recíprocos de las tres cuotas decimales se elevan al exponente que los hace sumar uno, resuelto por **Newton–Raphson** desde 1, tolerancia 1×10⁻¹³, máximo 60 iteraciones (p. 3). Una sola cotización pre-partido y un solo proveedor.

**INFERENCIA.** El power method reparte el margen de forma proporcional a p^k, lo que sobreajusta al favorito frente a Shin (1993) o la normalización simple: con márgenes del 5–7 % apenas mueve el log-loss, pero puede decidir una apuesta de valor en los extremos.

### 2.5 Resultados

**Binario con cuotas** (Tablas 4–5, pp. 11–12; umbral 0,5, métricas macro). Error local: 34,52 % mercado, 34,50 % LogReg y MLP, 34,54 % GAM, 34,57 % FastTree, 34,60 % RF, 34,73 % RBF, frente a 43,45 % del trivial. Visitante: 27,86 % mercado, 27,83 % MLP, 27,85 % LogReg, 27,89 % FastTree, 27,90 % GAM, 27,98 % RBF, frente a 31,18 % trivial.

**Binario sin cuotas** (Tabla 6, p. 13): error 38,09–38,34 % (local) y 30,03–30,11 % (visitante); el AUC cae de 0,7023–0,7051 a **0,6461–0,6477** y de 0,7108–0,7136 a **0,6510–0,6522**. Mercado: 0,7052 / 0,7139.

**Tres clases, sin cuotas** (Tabla 11, p. 17):

| Predictor | Accuracy | LogLoss | Brier | RPS |
|---|---|---|---|---|
| Trivial | 43,45 | 1,0738 | 0,6498 | 0,2302 |
| Bookmaker | 51,89 | 0,9836 | 0,5865 | 0,2003 |
| FastTree | 48,01 | 1,0301 | 0,6183 | 0,2149 |
| GAM | 48,00 | 1,0293 | 0,6178 | 0,2148 |
| LogReg | 48,02 | 1,0289 | 0,6176 | 0,2147 |
| RF | 48,04 | 1,0296 | 0,6180 | 0,2148 |
| MLP | 47,96 | 1,0302 | 0,6185 | 0,2150 |
| RBF | 48,01 | 1,0301 | 0,6183 | 0,2150 |

**Tres clases, con cuotas** (Tabla 12, p. 18): FastTree 51,92/0,9849/0,5872/0,2006 · **GAM 51,97**/0,9843/0,5868/0,2004 · LogReg 51,87/0,9845/0,5868/0,2004 · RF 51,88/0,9846/0,5871/0,2005 · MLP 51,86/0,9848/0,5872/0,2006 · RBF 51,70/0,9873/0,5887/0,2011.

**Diferencias pareadas modelo − mercado** (Tabla 13, p. 18; en las reglas propias, positivo = peor):

| Modelo | ΔAccuracy (pp) | ΔLogLoss | ΔBrier | ΔRPS |
|---|---|---|---|---|
| FastTree | +0,031 | +0,0013 | +0,0008 | +0,0003 |
| **GAM** | **+0,086 [0,005; 0,158]** | +0,0008 | +0,0004 | +0,0001 |
| LogReg | −0,025 | +0,0009 | +0,0003 | +0,0001 |
| RF | −0,013 | +0,0010 | +0,0006 | +0,0002 |
| MLP | −0,031 | +0,0012 | +0,0008 | +0,0003 |
| RBF | −0,192 | +0,0037 | +0,0022 | +0,0008 |

Cuatro de seis IC contienen el cero en accuracy; RBF lo excluye **en contra**. **Empates** (Tablas 10 y 14): en la tarea binaria el mercado nunca emite la clase X a umbral 0,5 (error 25,37 %, exactamente la tasa base) y su AUC para el empate es 0,584; en argmax predice 396 empates (0,52 %), los modelos con cuotas 211–728, y sin cuotas tres de seis predicen 0 y el resto 14–15. **Importancia por permutación** (Tabla 15): EloDiff domina con 0,1116 (local) y 0,1170 (visitante), ~24× y ~12× la siguiente; en empate cae a 0,0154. **Sensibilidad** (Tabla 7): 30 reajustes por modelo dan desviaciones de 0,012–0,066 pp; la mejor configuración de cada modelo cae en 0,7061–0,7098 de AUC y el mercado marca 0,7104.

### 2.6 Contraste de las cifras del encargo

| Afirmación | Veredicto | Evidencia |
|---|---|---|
| 225.474 partidos, oct-2018 a feb-2026 | **HECHO** | pp. 3–4 |
| 583 códigos; split 149.979/75.495 | **HECHO** | p. 4 |
| 48,0 % vs 43,4 % trivial vs 51,9 % bookmaker | **HECHO** | Tablas 11–12 |
| Con cuotas empatan al bookmaker, sin mejorar en log-loss/Brier/RPS | **HECHO, y más fuerte** | Tabla 13: todas las diferencias son positivas con IC que excluye 0 → significativamente peores |
| Única mejora distinguible: +0,086 pp del modelo aditivo | **HECHO** | Tabla 13; ≈65 aciertos |
| PDF de 6 páginas | **FALSO** | 25 páginas |

### 2.7 Limitaciones declaradas (pp. 22–23)

Ningún modelo mejora al mercado en reglas propias; **una sola instantánea de cuotas de un solo proveedor** (sin movimiento apertura→cierre ni dispersión entre casas, «las dos señales más asociadas a ineficiencia»); sin datos de jugadores; empate mal predicho (AUC 0,584); imputación en el 22,4 % (retirar los indicadores cuesta ≤0,22 pp); solo pool agregado, sin modelado por competición; **calibración y señales de apuesta fuera de alcance**; sin datos ni código.

### 2.8 Lectura crítica (INFERENCIA)

- **Un solo corte y un solo test**: mide incertidumbre de muestreo, no de régimen.
- **Bootstrap i.i.d.** sobre 75.495 partidos con 583 competiciones: los IC están probablemente **subestimados**, lo que refuerza el bootstrap por bloques de `MASTER.md` §4.
- **El mercado se trata como cuasi-verdad**: el de-vig corrige el margen, no el sesgo favorito-longshot ni la heterogeneidad entre casas.
- **El pool de 583 competiciones** con un solo juego de hiperparámetros promedia señales muy distintas.
- **No puede decir** si sus probabilidades sirven para apostar: sin calibración ni evaluación económica, «ordena como el mercado» no es «bate al mercado».

---

## 3. Literatura adicional verificada

### 3.1 Ratings y fuerzas latentes

| Referencia (DOI) | Qué mide | Resultado real | Limitación | Aplicabilidad |
|---|---|---|---|---|
| **Elo (1978)**, libro, Arco; `openlibrary.org/works/OL6807294W`. **V** | Rating por actualización secuencial | Logístico con escala 400; base de facto de los ratings deportivos | Sin empates ni goles; K y localía son decisiones del analista | `EloDiff` (EXP02), con K y HFA calibrados |
| **Bradley & Terry (1952)**, *Biometrika* 39:324–345, `10.2307/2334029`. **V** | Comparaciones pareadas con fuerzas aditivas logit | MLE de fuerzas relativas; fundamento de Elo/Glicko | Sin empates ni dinámica | Base formal; permite intervalos por equipo |
| **Glickman (1999)**, *JRSS-C* 48:377–394, `10.1111/1467-9876.00159`. **V** | Pares dinámicos (estado-espacio) | Fuerzas que evolucionan con varianza estimada (familia Glicko) | Supuestos de varianza fuertes | Alternativa a Elo con pocos partidos (ascendidos) |
| **Hvattum & Arntzen (2010)**, *IJF* 26:460–470, `10.1016/j.ijforecast.2009.10.002`. **V-m** | Valor predictivo de Elo en fútbol | **NO VERIFICADO en cifras** | — | Justifica Elo como input principal |
| **Constantinou & Fenton (2013)**, *JQAS* 9:37–50, `10.1515/jqas-2012-0036`. **V** | pi-ratings sobre margen de goles | Supera «considerablemente» a Elo y da **rentabilidad en 5 temporadas de EPL (2007/08–2011/12)** | Depende del margen de goles | EXP02 |
| **Wunderlich & Memmert (2018)**, *PLoS ONE* 13:e0198668, `10.1371/journal.pone.0198668`. **V** | Elo que incorpora cuotas | ~15.000 partidos (2007/08–2016/17), 4 ligas + UCL/UEL | Mejora no cuantificada en el abstract → **NO VERIFICADO** | Puente Motor A / Motor B |

### 3.2 Modelos de marcador y evaluación

| Referencia (DOI) | Qué mide | Resultado real | Limitación | Aplicabilidad |
|---|---|---|---|---|
| **Maher (1982)**, *Stat. Neerlandica* 36:109–118, `10.1111/j.1467-9574.1982.tb00782.x`. **V** | Poisson con ataque/defensa | El Poisson independiente describe razonablemente; el **bivariado con correlación 0,2** mejora | Sin dinámica ni corrección de marcadores bajos | EXP03 |
| **Dixon & Coles (1997)**, *JRSS-C* 46:265–276, `10.1111/1467-9876.00065`. **V** | Poisson con dinámica y corrección τ en 0-0/1-0/0-1/1-1 | Ajuste a liga y copa inglesas 1992–1995; **retorno positivo** con cuotas 1995–1996 | Estático por temporada | EXP03: DC frente a Poisson simple |
| **Constantinou & Fenton (2012)**, *JQAS* 8, `10.1515/1559-0410.1418`. **V** | Elección de regla de puntuación | Las reglas previas son inadecuadas porque 1/X/2 es **ordinal**; propone RPS | No resuelve calibración | EXP06 |
| **Wheatcroft (2021)**, *JQAS* 17, `10.1515/jqas-2019-0089`. **V** | Crítica al RPS | Argumenta que la sensibilidad a la distancia «no aporta»; simula RPS vs Brier vs log-loss | Postura discutida | EXP06: reportar las tres |
| **Brier (1950)**, *MWR* 78:1–3, `10.1175/1520-0493(1950)078<0001:VOFEIT>2.0.CO;2`. **V** | Error cuadrático de probabilidades | Define el Brier score | No descompone | EXP06 |
| **Epstein (1969)**, *JAM* 8:985–987, `10.1175/1520-0450(1969)008<0985:ASSFPF>2.0.CO;2`. **V** | Regla para categorías ordenadas | Origen del RPS | No local | EXP06/EXP10 |
| **Murphy (1973)**, *JAM* 12:595–600, `10.1175/1520-0450(1973)012<0595:ANVPOT>2.0.CO;2`. **V** | Descomposición del Brier | Separa *reliability*, *resolution* y *uncertainty* | Requiere binning | EXP06 |
| **Gneiting & Raftery (2007)**, *JASA* 102:359–378, `10.1198/016214506000001437`. **V** | Teoría de reglas propias | Caracteriza las estrictamente propias; log-loss y Brier lo son | Marco teórico | EXP06: qué métricas son legítimas |

### 3.3 Mercado, calibración, combinación, drift y leakage

| Referencia (DOI) | Qué mide | Resultado real | Limitación | Aplicabilidad |
|---|---|---|---|---|
| **Shin (1993)**, *Econ. J.* 103:1141–1153, `10.2307/2234240`. **V-m** | Margen con proporción de insider trading | Modelo alternativo al power | z no observable | EXP13 |
| **Forrest, Goddard & Simmons (2005)**, *IJF* 21:551–564, `10.1016/j.ijforecast.2005.03.003`. **V** | ¿Las cuotas baten a un modelo? | ~10.000 partidos ingleses: las cuotas **superan** al modelo y su ventaja **crece** en 5 años | Un mercado | EXP07 |
| **Levitt (2004)**, *Econ. J.* 114:223–246, `10.1111/j.1468-0297.2004.00207.x`. **V** | Organización del mercado | Los bookmakers fijan precio y toman posición; beneficio mayor y **explotan sesgos** | Industria concreta | EXP16 |
| **Angelini & De Angelis (2019)**, *IJF* 35, `10.1016/j.ijforecast.2018.07.008`. **V** | Eficiencia de 41 casas, 11 ligas, 11 años | **8 mercados eficientes y 3 ineficientes** con oportunidades al tomar la mejor cuota | Condicionado a esa cuota | EXP13: la dispersión es señal |
| **Štrumbelj (2014)**, *IJF* 30:934–943, `10.1016/j.ijforecast.2014.02.008`. **V-m** | Conversión cuotas→probabilidades | **NO VERIFICADO en cifras** | — | EXP13 |
| **Clarke, Kovalchik & Ingram (2017)**, *AJSS* 5:45–49, `10.11648/j.ajss.20170506.12`. **V-m** | Ajuste del overround | Compara métodos de eliminación del margen | Cifras no verificadas | EXP13 |
| **Hubáček, Šourek & Železný (2019)**, *IJF* 35:783–796, `10.1016/j.ijforecast.2019.01.001`. **V** | Optimizar beneficio, no accuracy; CNN + carteras | En **NBA 2007–2014**, minimizar la correlación con el mercado genera **beneficio acumulado positivo** | **Baloncesto**, no fútbol | EXP09: la métrica es económica |
| **Constantinou (2019)**, *Mach. Learn.* 108:49–75, `10.1007/s10994-018-5703-7`. **V-m** | Dolores: red bayesiana híbrida | **NO VERIFICADO en cifras** | — | Arquitectura para EXP05 |
| **Stübinger, Mangold & Knoll (2019)**, *Appl. Sci.* 10:46, `10.3390/app10010046`. **V** | ML con atributos de jugador, 2006–2018 | Halla estrategias con retorno positivo explotando cuotas sobrevaloradas; cifra **NO VERIFICADA** | Simulación sensible a costes | EXP04/EXP07 |
| **Guo et al. (2017)**, ICML, `arXiv:1706.04599`. **V** | Calibración de redes | Las redes modernas están **mal calibradas**; *temperature scaling* es simple y eficaz | Imagen/texto, no fútbol | EXP06 |
| **Timmermann (2006)**, *Handbook* 1:135–196, `10.1016/S1574-0706(05)01004-9`. **V** | Combinación de pronósticos | Combinar reduce error; el «combination puzzle» hace competitivas las medias simples | Teoría general | EXP09 |
| **Gama et al. (2014)**, *ACM CSUR* 46:1–37, `10.1145/2523813`. **V** | Concept drift | Taxonomía y métodos de detección/adaptación | Genérico | EXP14 |
| **Kapoor & Narayanan (2023)**, *Patterns* 4:100804, `10.1016/j.patter.2023.100804`. **V** | Leakage en ciencia con ML | **17 campos, 294 papers**, 8 tipos de fuga; en un caso los modelos complejos no superaban a la regresión logística | Revisión | EXP15/EXP16 |
| **Klein et al.** | — | **NO VERIFICADO**: no localicé ninguna referencia para «Klein et al.»; no la cito. Sustituto verificado: Stübinger et al. (2019) | — | — |

---

## 4. Decisiones que se derivan

| Hallazgo | Decisión |
|---|---|
| Convergencia de seis clasificadores | No invertir en arquitecturas; sí en features y calibración |
| Modelos con cuotas **peores** que el de-vig | Motor B = de-vig + corrección calibrada, no un clasificador que «ve» cuotas |
| +0,086 pp sin mejora en reglas propias | Aceptar por RPS/log-loss; accuracy solo diagnóstico |
| Empate al 0,52 % de predicciones del mercado | Reportar P(X) calibrada; prohibido decidir empate por argmax |
| Point-in-time replicable | Adoptarlo en EXP01 y auditarlo en EXP16 |
| Sin calibración en el paper | EXP06 es la oportunidad diferencial |
| Un solo split temporal | EXP12, con bootstrap por bloques |
| Sin datos ni código | EXP15: publicar `predictions.csv` + `config.json` |

---

## 5. Límites de esta revisión

El abstract de Hvattum & Arntzen (2010), Štrumbelj (2014), Constantinou (2019) y Shin (1993) no fue accesible: identidad verificada, cifras no, y **no se les atribuye ningún número**. «Klein et al.» no se pudo verificar. No he ejecutado experimentos. La extracción de texto se contrastó dos veces, pero un error sistemático de fuentes no se descarta al 100 %.

---

## 6. Experimentos recomendados para PitchLab

Cada fila mapea una metodología a una **hipótesis falsable** con criterio de muerte explícito. Métricas primarias: RPS y log-loss (reglas propias); accuracy solo como diagnóstico.

| Exp | Hipótesis falsable | Diseño mínimo | Criterio de falsación |
|---|---|---|---|
| **EXP01 Baselines** | H1: el baseline de frecuencias de train (43,45/25,37/31,18) da log-loss ≈1,07 y RPS ≈0,23 en 2024/25–25/26 | Reproducir Tablas 11–12 con frecuencias de train; añadir el Elo heurístico del repo | Si un modelo no bate a H1 con IC95 % pareado por bloques, se descarta |
| **EXP02 Elo** | H2: Elo causal (K = 20, HFA estimado en validación) reduce RPS ≥0,005 frente a H1 | Elo con rating previo al partido; K y HFA barridos solo en ≤2022/23 | ΔRPS con IC que excluya 0 |
| **EXP03 Poisson/DC** | H3: DC con τ mejora log-loss ≥0,003 frente a Poisson independiente | Ajuste por máxima verosimilitud; τ en 0-0/1-0/0-1/1-1 | Si Δlog-loss < 0,003, usar Poisson simple |
| **EXP04 Features avanzadas** | H4: tiros a puerta/xG aportan Δlog-loss ≥0,002 sobre Elo+goles | Ablación por bloques, misma partición | Si el bloque no aporta, se retira |
| **EXP05 ML** | H5: ningún clasificador supera al aditivo en >0,15 pp accuracy ni >0,002 RPS | LR, HistGB depth-1, HistGB, RF, MLP, RBF con la Tabla 3 como referencia | Si hay ganador estable en 3 folds temporales, se adopta |
| **EXP06 Calibración** | H6: temperature scaling reduce ECE ≥30 % sin empeorar log-loss | Temperatura en validación; comparar con Platt e isotonic | Si el log-loss empeora, no calibrar |
| **EXP07 Motor A vs mercado** | H7: Motor A (sin cuotas) **no** bate al mercado de-vig; la brecha es ≈0,014 RPS | Misma intersección de partidos para ambos | Si Motor A bate al mercado con IC, buscar leakage antes de celebrar |
| **EXP08 Motor B** | H8: con cuotas como feature se **iguala** al mercado (ΔRPS con IC que contiene 0) pero no se mejora | Replicar Tabla 13 sobre football-data.co.uk | Si ΔRPS > 0 con IC, Motor B no debe existir como modelo |
| **EXP09 Ensembles** | H9: la media de probabilidades mejora RPS ≥0,001 sobre el mejor individual | Combinar Motor A + DC + Elo; pesos fijos y aprendidos | Si no mejora, no hay ensemble |
| **EXP10 Empates** | H10: P(X) calibrada supera el AUC 0,584 del mercado | Modelo binario X vs no-X; curvas de calibración por clase | Si AUC ≤ 0,584, se reporta pero no se explota |
| **EXP11 Ablación** | H11: retirar EloDiff degrada AUC ≥0,10 (importancia 0,1116/0,1170) | Permutación por feature, 3 repeticiones, en validación | Si la caída es < 0,02, EloDiff es prescindible |
| **EXP12 Robustez temporal** | H12: el RPS no se degrada >0,005 entre 2024/25 y 2025/26 | Evaluación por temporada; bootstrap de bloques liga-temporada | Si la degradación es mayor, hay drift y toca reentrenar |
| **EXP13 Movimiento de cuotas** | H13: la pendiente apertura→cierre aporta Δlog-loss ≥0,002 sobre el cierre estático | Solo escenario *closing-line*, declarado | Si no aporta, no se usa; nunca como sistema operable |
| **EXP14 Drift** | H14: reentrenamiento anual bate al modelo congelado en ≥0,002 RPS | Ventana expansiva vs congelada | Si no hay diferencia, congelar |
| **EXP15 Reproducibilidad** | H15: dos ejecuciones producen métricas idénticas y `match_id` estables | Hash de `predictions.csv`; `config.json` versionado | Cualquier discrepancia invalida el resultado |
| **EXP16 Adversarial** | H16: existe al menos una fuga temporal en el pipeline actual | Test automático: ninguna feature puede usar partidos con fecha ≥ la del partido | Si aparece una fuga, se corrige antes de continuar |
| **EXP17 Final** | H17: el sistema final bate a H1 y **no** bate al mercado | Congelar candidatos y evaluar una sola vez en 2024/25–25/26 | Se publica el resultado, gane o pierda |
