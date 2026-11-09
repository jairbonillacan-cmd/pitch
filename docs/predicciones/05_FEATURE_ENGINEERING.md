# 05 — Feature engineering: catálogo, fórmulas, leakage y ablación

**Documento:** consolidación de A05 (auditoría de features causales del Motor A).
**Fecha:** 2026-11-09 · **Autor:** SUBAGENTE 11 — DOCUMENTATION & REPRODUCIBILITY.
**Fuente:** [`A05_features.md`](../../research/prediction-lab/reports/A05_features.md) · artefacto [`feature_audit.json`](../../research/prediction-lab/features/feature_audit.json) · código [`build_features.py`](../../research/prediction-lab/features/build_features.py).
**Datos de la auditoría:** `features.parquet` **181.268 × 198** (el encargo decía 192) · `matches.parquet`. Particiones: dev ≤ 2022/23, val 2023/24. **`test` no se usó en ninguna decisión.**

> **Aviso de versión.** La auditoría se ejecutó sobre el artefacto **anterior** al ETL v1.1 (181.268 filas). El `features.parquet` actual tiene **182.410 filas × 198 columnas** tras recuperar 1.142 partidos de G1 y corregir el join de priors. Las cifras de ablación de §6 corresponden al artefacto auditado y **no se han vuelto a medir por bloques** sobre v1.1; lo que sí se midió es el efecto en el modelo: hgb pasó de **1,00730 a 1,00974** al corregir el leakage ([`07`](07_EXPERIMENTOS_RESULTADOS.md) §3). A09b verificó además el fix: el cuádruple `(n,ppg,gf_pg,ga_pg)` coincide con la temporada anterior observada en el **100,0000 %** de 364.820 filas-equipo, y el viaje en el tiempo da **0 diferencias en 198 columnas**.

---

## 0. Resumen ejecutivo

Sí hay leakage, y no es marginal.

1. **Crítico — los 10 priors de equipo (`home_prev_*`, `away_prev_*`) contenían la temporada SIGUIENTE.** En las **166.615 filas** con prior no nulo, `home_prev_ppg` coincidía al **100,00 %** con el *points-per-game* de la temporada siguiente y solo un 2,2 % con la anterior que el nombre declara. El join estaba invertido. **Corregido** (§4).
2. **Crítico — 21 columnas post-partido y 5 de target viven en el mismo parquet que las features** (`elo_*_post`, `shots_*`, `sot_*`, `ht_*`, goles, `result`). `corr(Δelo local, diferencia de goles) = 0,879`.
3. **Medio — `season_progress` usaba la fecha del último partido de la temporada** (calendario futuro) como denominador. **Corregido** con calendario fijo jul–jun / ene–dic.
4. **Calidad — 59 columnas de forma con 76 pares |r| > 0,9**, `days_rest` sin acotar (máximo 8.477 días) y `prev_sot_pg = 0,0` en el 46,3 % de las filas porque suma una columna toda-NaN.

Lo que **sí** aguanta: Elo pre-partido (recálculo exacto, error 0,0), medias móviles de forma (verificadas a mano) y priors de liga.

---

## 1. Catálogo real: 198 columnas en 10 grupos

| Grupo | n | Rol | Fórmula / fuente |
|---|---:|---|---|
| `metadatos` | 18 | metadato | `match_id`, `div`, `season`, `match_date`, `source_row`, flags `has_*`. No son features. |
| `target` | 5 | target | `y = 0/1/2` desde `result`; `home_goals`, `away_goals`, `result`, `goals_total`. **Prohibido como feature.** |
| `post_partido` | 21 | post-partido | `elo_*_post` (6) + stats del propio partido: `ht_*`, `shots_*`, `sot_*`, `corners_*`, `fouls_*`, `yellows_*`, `reds_*`. **Prohibido como feature.** |
| `elo_pre` | 17 | feature | `R_pre` antes del partido; `exp = 1/(1+10^(−((R_h+65−R_a)/400)))`; `R_post = R_pre + K·MOV(gd)·(score−exp)`; `MOV = 1 / 1,5 / (11+abs(gd))/8`; regresión 33 % a 1500 entre temporadas; `K ∈ {10, 20, 40}`; `elo_diff = R_h+65−R_a`. |
| `forma` | 59 | feature | `X_r{w} = mean(X_{t−1..t−w})` por equipo con `.shift(1)`, `min_periods=1`, `w ∈ {5,10}`; `X_ewm5` halflife 5. `X ∈ {points, gf, ga, gd, shots, sot, corners, win, draw, loss, goals_per_shot, sot_rate}`. Diferenciales `form_*_diff_*`. |
| `descanso` | 6 | feature | `days_rest` (días desde el partido anterior), `matches_last_14d` (estrictamente anteriores), `rest_diff`, `congestion_diff`. |
| `contexto` | 8 | feature | `*_season_match_no` (cumcount), `round_no = max(local, visitante)`, `season_progress`, `div_change`, `season_break`. |
| `priors_equipo` | 10 | feature auditada | Agregados por (div, equipo, temporada): `prev_n`, `prev_ppg = pts/n`, `prev_gf_pg`, `prev_ga_pg`, `prev_sot_pg`. |
| `priors_liga` | 2 | feature | `lg_avg_total_prev`, `lg_home_win_prev`: goles y % victoria local de la **temporada anterior** de la división, con join correcto `(div, season)`. |
| `mercado` | 52 | mercado | Cuotas apertura/cierre (b365, ps, avg, max, bf, bfe) y totales 2.5. Fuera del Motor A; el cierre no es válido antes del partido (`CONTRACT_DATASET.md` §3.4). |

**18 + 5 + 21 + 17 + 59 + 6 + 8 + 10 + 2 + 52 = 198.** El clasificador es exhaustivo (el script falla si sobra una columna). Features utilizables: **102**; de ellas, 10 contaminadas antes de la corrección.

### 1.1 Elo (el esqueleto del modelo)

| Pieza | Implementación |
|---|---|
| Actualización | `R_post = R_pre + K·MOV(gd)·(score−exp)`, zero-sum entre los dos equipos |
| Multiplicador de margen | `MOV = 1` (empate), `1,5` (1 gol), `(11+abs(gd))/8` (≥2 goles) |
| Localía | constante `HFA=65` sumada al Elo local antes de la diferencia: `elo_diff = R_h + 65 − R_a` |
| Regresión entre temporadas | 33 % hacia 1500 al cambiar de temporada |
| Variantes para ablación | `elo_k10_*`, `elo_k40_*`, `elo_exp_home`, `elo_prob_home_nodraw`, `elo_diff_no_hfa`, `elo_diff_x_progress` |

**Verificación (OBSERVADO):** recálculo completo de la Premier League (**9.970 partidos**) con los parámetros del módulo → diferencia absoluta máxima contra el parquet **0,0** en `elo_home`, `elo_away`, `elo_exp_home`, `elo_home_post` y `elo_away_post`; la identidad `post = pre + 20·MOV·(score−exp)` se cumple con error máximo **0,0** en las 181.268 filas.

### 1.2 Forma (rolling causal)

Ventanas rodantes por equipo con `.shift(1)` (excluyen el partido objetivo), `min_periods=1`, sobre puntos, goles, diferencia, tiros, tiros a puerta, córners, resultados y tasas. Tres variantes por variable (`r5`, `r10`, `ewm5`) más diferenciales local−visitante. **Verificación manual de `h_points_r5` en 2 casos con fechas: coincidencia exacta (Δ = 0)** — Rio Ave 10/01→3, 19/01→3, 27/01→3, 31/01→1, 09/02→3 = 2,600000; Stoke 07/04→0, 10/04→1, 15/04→0, 18/04→0, 22/04→1 = 0,400000.

### 1.3 Priors

- **De equipo:** agregados por (div, equipo, temporada) de la temporada anterior: `prev_n`, `prev_ppg`, `prev_gf_pg`, `prev_ga_pg`, `prev_sot_pg`.
- **De liga:** `lg_avg_total_prev` (goles/partido de la división en la temporada anterior) y `lg_home_win_prev` (% de victoria local), unidos por `(div, season)` con join correcto.

---

## 2. Leakage L1: los priors miraban a la temporada siguiente

### 2.1 Mecanismo exacto

`team_season_priors` generaba filas `(div, team, prev_of, prev_*)` con `prev_of = season.shift(1)` **pero valores agregados de la temporada de esa misma fila**. Después `main()` hacía:

```python
merge(left_on=["div","team","season"], right_on=["div","team","prev_of"])
```

Un partido de la temporada `S` se emparejaba con la fila cuyo `prev_of == S`, que era la de **S+1** y contenía el agregado de **S+1**.

### 2.2 Atribución (OBSERVADO, 166.615 filas con prior no nulo)

| Columna | = temporada propia | = temporada **siguiente** | = temporada anterior |
|---|---:|---:|---:|
| `home_prev_ppg` | 2,86 % | **100,00 %** | 2,22 % |
| `home_prev_gf_pg` | 2,51 % | **100,00 %** | 2,18 % |
| `home_prev_ga_pg` | 3,05 % | **100,00 %** | 2,45 % |
| `home_prev_n` | 79,18 % | **100,00 %** | 67,82 % |

Huella inequívoca: los nulos crecen hacia el presente —**5,3 % dev → 14,3 % test → 100 % en 2026/27**— porque la temporada siguiente no existe para los partidos recientes.

### 2.3 Ejemplos verificables (Premier League)

| Partido | Local | `home_prev_ppg` | PPG 2018/19 | PPG 2019/20 |
|---|---|---:|---:|---:|
| `E0:20190421:arsenal:crystal_palace` | Arsenal | 1,4737 | 1,8421 | **1,4737** |
| `E0:20180819:brighton:man_united` | Brighton | 1,0789 | 0,9474 | **1,0789** |

Un partido del 21-abr-2019 llevaba encima la temporada 2019/20 completa de Arsenal, con partidos hasta julio de 2020. El rival honesto (2017/18) era **1,658**, no 1,4737.

### 2.4 Efecto medido

- `corr(home_prev_ppg, y) = −0,176` frente a `−0,136` del prior honesto; `corr(leaky, honesto) = 0,45`.
- Test de viaje en el tiempo: dos cortes (2020-07-01 → 129.203 filas; 2021-01-15 → 133.901) → **186/198 columnas idénticas**; las 12 que difieren son los 10 priors + `season_progress` + `elo_diff_x_progress`. `priors_equipo` falla 10/10; forma, descanso, priors de liga y Elo puro: **0 diferencias**.
- La ganancia aparente de los priors en ablación era **−0,00368** de log-loss; el valor honesto, **−0,00045**: **el 88 % del valor aparente era futuro** (§6).

---

## 3. Leakage L2 (suave) y L3 (columnas post-partido)

### 3.1 `season_progress` con calendario futuro (medio)

`season_end = groupby(div, season).match_date.transform("max")` usaba la fecha del último partido de la temporada, desconocida a mitad de curso. Al truncar el dataset, `season_progress` cambiaba **hasta 0,60** (corte 2021-01-15) y arrastraba `elo_diff_x_progress`. No filtra el marcador; sí el calendario. No aporta rendimiento (§6), así que eliminarlo no cuesta nada.

**Corregido** en `features/build_features.py:205-217` con límites fijos: `jul–jun` para etiquetas `YYYY/YY`, `ene–dic` para `YYYY`, y `clip(0,1)`.

### 3.2 Columnas post-partido escondidas en el parquet

`corr(elo_home_post − elo_home, home_goals − away_goals) = 0,879`: la variación del Elo post **es** el resultado. `sot_home` correlaciona 0,414 con la diferencia de goles. Están en el archivo porque el parquet es un join de `matches` con las features: cómodo para el ETL, **peligroso para el modelado**.

**Riesgo real:** cualquier `select_dtypes(include="number")` entrena con el resultado dentro. Mitigación obligatoria: lista blanca explícita (§7, R2).

### 3.3 Ninguna feature «adivina» el partido

Sobre las 102 features usables: **|r| máximo 0,307 con `y` (`elo_diff`), 0,355 con la diferencia de goles, 0,120 con el total. Cero features superan 0,95.** El orden es el esperado (Elo > k10/k40 > priors > forma).

---

## 4. La corrección aplicada (S+1 → S−1)

**Cambio de código (`features/build_features.py:163-186`):** antes del `rename`, se desplazan las estadísticas dentro de cada equipo:

```python
agg = agg.sort_values(["div", "team", "season"], kind="mergesort")
stat_cols = ["n","gf","ga","pts","shots","sot","ppg","gf_pg","ga_pg","sot_pg"]
agg[stat_cols] = agg.groupby(["div","team"])[stat_cols].shift(1)   # S-1
agg = agg.rename(columns={..., "season": "target_season"})
# join: left_on ["div","team","season"] == right_on ["div","team","target_season"]
```

**Verificación independiente sobre el `features.parquet` actual (182.410 × 198), recalculando el PPG desde `matches.parquet`:**

| Comparación | Filas | Coincidencia |
|---|---:|---:|
| `home_prev_ppg` vs PPG de la temporada **anterior** (S−1) | 163.905 | **99,634 %** |
| `home_prev_ppg` vs PPG de la temporada **siguiente** (S+1) | 151.335 | **2,473 %** |

El 0,37 % restante son equipos que cambian de división (el join agrupa por `div`), no fuga. **Comando reproducible en [`12_REPRODUCIBILIDAD.md`](12_REPRODUCIBILIDAD.md) §5.**

**Estado de la corrección:**

| Elemento | Estado | Evidencia |
|---|---|---|
| Join de priors | **corregido** | `build_features.py:174-186` |
| `season_progress` | **corregido** (calendario fijo) | `build_features.py:205-217` |
| Parquet regenerado | **sí** (182.410 × 198, 02:53) | hash en doc 12 |
| Ablación re-medida post-fix | **pendiente por bloques**; efecto en modelo medido (hgb 1,00730 → 1,00974) | `feature_audit.json` es de 02:43, previo al parquet de 02:53; A06 reentrenó sobre v1.1 |
| Lista blanca + test anti-post-partido | **parcial** (lista en `train_motor_a.py:41-60`; test pendiente) | A05 R2 |

---

## 5. Calidad de las features

**Nulos por bloque:** Elo 0,0 %, contexto 0,0 %, descanso 0,14 %, priors de liga 4,2 %, priors de equipo 8,09 %, forma 16,8 %. Los de forma son estructurales: `shots/sot/corners` ≈ 49 % porque hay ligas de las que football-data solo publica resultado y cuotas (las de año calendario llegan al 34 % de nulos medios y las europeas al 2 %). **Imputar con la mediana global mete un sesgo de liga.**

**Constantes:** `source`, `has_result` (siempre `True`), `ingested_at`; cuasi-constantes `h_div_change` y `a_div_change` (99,8 % ceros).

**Estabilidad:** `drift = (máx media temporal − mín media temporal)/std global`: mediana 0,33, p90 1,33. Las más inestables son `home_prev_n`/`away_prev_n` (≈4,0, artefacto del leak ya corregido), `lg_home_win_prev` (2,47) y `*_sot_rate_*` (≈2,1, porque la tasa solo existe donde hay tiros).

### 5.1 Distribuciones (selección)

| Feature | media | std | p05 | p50 | p95 | nulos |
|---|---:|---:|---:|---:|---:|---:|
| `elo_diff` | 64,86 | 105,96 | −110,9 | 64,7 | 242,0 | 0 % |
| `elo_home` | 1508,5 | 74,1 | 1402,0 | 1500,0 | 1647,9 | 0 % |
| `h_points_r5` | 1,341 | 0,647 | 0,2 | 1,4 | 2,4 | 0,2 % |
| `h_days_rest` | 11,79 | **75,82** | 3 | 7 | 18 | 0,2 % |
| `h_matches_last_14d` | 1,643 | 0,816 | 0 | 2 | 3 | 0 % |
| `season_progress` | 0,507 | 0,301 | 0,03 | 0,51 | 0,97 | 0 % |
| `home_prev_ppg` | 1,377 | 0,401 | 0,79 | 1,32 | 2,12 | 8,1 % |
| `lg_avg_total_prev` | 1,488 | 0,150 | 1,27 | 1,48 | 1,76 | 4,2 % |

`h_days_rest` engaña: media 11,8 y p95 18 parecen sanas, pero el **máximo es 8.477 días** (un equipo que reaparece tras 23 años) y el **3,3 % supera 30 días**. El escalado estándar comprime el 96,7 % de la distribución en ~2σ y deja los outliers mandando en la cola. Acotar a 30–45 días es una corrección de dos líneas.

### 5.2 Multicolinealidad y artefactos

- **76 pares con |r| > 0,90** y el **43,1 % de las 102 features** en al menos un par: `elo_exp_home ≡ elo_prob_home_nodraw` (r = 1,000), `elo_diff ≡ elo_diff_no_hfa` (r = 1,000, difieren en la constante 65), las tres variantes K (r ≈ 0,98–0,99), `r5/r10/ewm5` de la misma variable (r ≈ 0,85–0,95) y `win_r5+draw_r5+loss_r5 = 1`.
- `prev_sot_pg = 0,0` en el **46,3 %** de las filas: suma una columna toda-NaN y devuelve 0 en vez de `NaN`. Es un dato falso, no un cero real.

---

## 6. Ablación walk-forward

**Protocolo:** `Pipeline(SimpleImputer(median) → StandardScaler → LogisticRegression multinomial)`, `lbfgs`, `C=1.0`, `max_iter=300`; imputación y escalado ajustados **solo con el train de cada fold**. Walk-forward expanding: para cada `S ∈ {2008/09…2023/24}`, train = temporadas anteriores, predice `S`. **16 folds, n = 116.830** predicciones out-of-fold. **`test` y `live` no se tocan.** IC95 % = bootstrap pareado **por temporada** (B = 2.000, 16 temporadas, semilla 20261109). Δ > 0 = peor que `d_todo`.

| Bloque | n | Log-loss | Brier | Acc | RPS | Δ LL vs `d` [IC95] |
|---|---:|---:|---:|---:|---:|---|
| `a_elo` | 3 | 1,01927 | 0,61086 | 0,4917 | 0,20835 | +0,00715 [+0,0061, +0,0081] |
| `b_elo_forma` | 62 | 1,01578 | 0,60848 | 0,4936 | 0,20733 | +0,00365 [+0,0031, +0,0042] |
| `c_…descanso_contexto` | 76 | 1,01581 | 0,60851 | 0,4933 | 0,20734 | +0,00368 [+0,0031, +0,0042] |
| `d_todo` | 88 | **1,01213** | **0,60604** | **0,4957** | **0,20618** | — |
| `e_todo_sin_tiros` | 66 | 1,01346 | 0,60699 | 0,4949 | 0,20664 | +0,00133 [+0,0008, +0,0019] |
| `f_todo_sin_priors` (= `c`) | 76 | 1,01581 | 0,60851 | 0,4933 | 0,20734 | +0,00368 [+0,0032, +0,0042] |
| `g_todo_priors_causales` | 86 | 1,01536 | 0,60824 | 0,4935 | 0,20725 | +0,00324 [+0,0028, +0,0037] |
| `h_todo_sin_progress` | 87 | 1,01213 | 0,60603 | 0,4957 | 0,20617 | −0,00000 [−0,0001, +0,0001] |

`f` tiene exactamente las mismas columnas que `c` (los priors son lo único que `d` añade): sus métricas coinciden dígito a dígito — **el arnés no introduce ruido**.

### 6.1 Descomposición marginal

| Paso | Δ log-loss | Lectura |
|---|---:|---|
| `a → b`: + forma | **−0,00349** | aporta, y en las 16 temporadas |
| `b → c`: + descanso/contexto | +0,00003 | **no aporta nada** (empeora 3·10⁻⁵) |
| `c → d`: + priors (como estaban) | **−0,00368** | «aporta» tanto como todo el bloque de forma |
| `c → g`: + priors causales | −0,00045 | el valor honesto es el 12 % de eso |
| `d → e`: − tiros | +0,00133 | los tiros sí aportan |
| `d → h`: − `season_progress` | 0,00000 | irrelevante para el rendimiento |

### 6.2 Robustez

- `d` es mejor que `a` en **16/16** temporadas (ventaja entre +0,0019 y +0,0108) y mejor que `g` en **16/16** (entre +0,0012 y +0,0044). La ventaja de los priors con fuga era sistemática, no de una liga o temporada.
- `b` y `c` se cruzan sin patrón (c gana en 5, pierde en 11, ±0,001): la ausencia de señal de descanso/contexto no es un artefacto puntual.

### 6.3 Interpretación

- **Elo es el esqueleto:** 1,01927 con 3 columnas, **7,2 % mejor** que la referencia uniforme (`ln 3 = 1,09861`).
- **La forma aporta poco pero de forma consistente:** −0,0035 (−0,34 % relativo), IC que excluye 0 y signo estable en 16/16 temporadas. Es la única familia que mejora a Elo de forma reproducible.
- **Descanso y contexto no aportan:** `c` es 0,00003 *peor* que `b`, y quitar `season_progress` deja el log-loss **exactamente igual** (Δ = −0,000004).
- **Los priors actuales eran el mejor bloque después de Elo… y eran falsos.** Su ganancia (−0,0037) era indistinguible de la del bloque de forma completo (−0,0035) y **8 veces** la de los priors causales (−0,00045). Si se hubiera hecho *feature selection* con este backtest, se habría concluido que los priors son la segunda fuente de señal del proyecto.
- **Los tiros aportan** (−0,0013 al quitarlos), pero solo el 51 % de las filas los tiene; el modelo los usa donde existen.

**Conclusión explícita:** aportan **Elo** (base imprescindible), **forma** (−0,0035) y, dentro de ella, **tiros** (−0,0013). **No aportan** descanso, contexto ni `season_progress` (≈0,0000). Los priors de equipo, tal como estaban, aparentaban −0,0037 pero **no eran utilizables**: su valor honesto es −0,0005.

---

## 7. Recomendaciones y criterios de aceptación

| ID | Prioridad | Acción | Criterio verificable |
|---|---|---|---|
| **R1** | **P0** | Cuarentena de priors: usar el prior causal (última temporada terminada) con coste +0,00045, o eliminarlos; **corregir el join** y renombrar (`prev_` describe algo que el código no hacía) | `home_prev_ppg` coincide ≥99 % con S−1 y <3 % con S+1 (§4) |
| **R2** | **P0** | Lista blanca `FEATURES_MOTOR_A`, **no** `select_dtypes`; test que falle si entra una columna de `post_partido`, `target` o `mercado` | el test falla al añadir `elo_home_post` a la lista |
| **R3** | P1 | Podar: `points_r5`, `gd_r5`, `gf_r5`, `ga_r5`, `gd_ewm5` + 3 diferenciales (~8 de 59); borrar `*_r10` (r≈0,9 con r5); una sola variante de Elo; `prev_sot_pg = NaN`; `days_rest` clip 30–45 | nº de features ≤ 30 sin perder log-loss > 0,001 |
| **R4** | P1 | `season_progress` con calendario fijo (hecho) o eliminarlo; si se elimina, `elo_diff_x_progress` se va con él | Δ log-loss = 0,00000 |
| **R5** | P2 | Separar el parquet en tres (`features`, `labels`, `market`) y actualizar el contrato a 198 columnas | ningún artefacto de features contiene `y` |
| **R6** | P2 | No presentar descanso/contexto como features que aportan (medido: +0,00003) | informe sin esa afirmación |

**Regla de oro vigente** (`features/build_features.py:1-8`): para predecir el partido `m` solo se usa información de partidos con `match_date < m.match_date`; todas las ventanas usan `.shift(1)` por equipo y el Elo se actualiza después de cada partido.

---

## 8. Límites de la auditoría

Un solo modelo lineal y un solo `C`: un GBM podría extraer más de forma e interacciones y la atribución por bloques es válida para *este* modelo. La imputación por mediana es tosca para nulos estructurales (49 % en tiros). El test de viaje en el tiempo usa dos cortes: un bug que solo se manifestara en otras fechas no se detectaría, aunque la comparación es columna a columna sobre 129k–134k filas con la réplica validada contra el parquet completo. La reconstrucción causal usa «última temporada terminada por fecha», que en ligas de año calendario puede ser una temporada que acabó 6–9 meses antes. Las diferencias de 0,001–0,004 son nítidas (n = 116.830, IC pareado) pero **pequeñas en la práctica**.

**Reproducir:** `./.venv/bin/python features/audit_features.py --skip-ablation` (diccionario + leakage + calidad) o sin flag para la ablación completa (~25 min). Ver [`12_REPRODUCIBILIDAD.md`](12_REPRODUCIBILIDAD.md).

---

## Addendum ciclo 3 — el 11,5 % de priors no exactos no importa (resultado negativo)

A09b midió que solo el 88,5 % de los priors S−1 son exactos (el resto usa una temporada ≥2 atrás o
queda NaN por cambios de división, porque el join agrupa por `(div, team)`). Se probó una **v1.2**
que reconstruye los priors con clave `team` (cruzando divisiones) y usa la última temporada
completada del equipo. Experimento acotado a **val 2023/24** (sin tocar test):

| Variante | Cobertura del prior (null) | Log-loss val | Accuracy |
|---|---:|---:|---:|
| v1.1 `(div, team)` (actual) | 3,14 % null | **1,011036** | 0,4935 |
| v1.2 `team` (cruzando divisiones) | 2,70 % null | 1,011179 | 0,4942 |

Δ (v1.2 − v1.1) = **+0,00014** [−0,00014; +0,00040], 84 % de remuestras en contra. Es decir:
mejorar la cobertura del prior **no mejora el modelo**; la información añadida es ruido. Se cierra
el ítem como **resultado negativo documentado** y no se regenera el dataset (evita invalidar el
cierre). Script: `pipeline/experiment_priors_v12.py`; artefacto: `artifacts/experiment_priors_v12.json`.
