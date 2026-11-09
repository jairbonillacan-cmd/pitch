# A05 — Auditoría de features causales del Motor A

**Agente:** FEATURE ENGINEERING SPECIALIST · **Tarea:** A05 · **Fecha:** 2026-11-09
**Worktree:** `/Users/jairbonilla/PitchLab-Prediction-Lab` · **Lab:** `research/prediction-lab/`
**Artefactos:** `features/audit_features.py`, `features/feature_audit.json`, este informe.
**Datos:** `features.parquet` (181.268 × **198**), `matches.parquet`. **Particiones:** dev ≤ 2022/23, val 2023/24.
**`test` (2024/25–2025/26) no se usó en ninguna decisión.**

---

## 0. Resumen ejecutivo

Sí hay leakage, y no es marginal.

1. **Crítico — los 10 priors de equipo (`home_prev_*`, `away_prev_*`) contienen la temporada SIGUIENTE.**
   En las **166.615 filas** con prior no nulo, `home_prev_ppg` coincide al **100,00 %** con el *points-per-game*
   de la temporada siguiente y solo un 2,2 % con la anterior que el nombre declara. El join está invertido.
   Huella inequívoca: los nulos crecen hacia el presente (5,3 % dev → 14,3 % test → **100 % en 2026/27**).
2. **Crítico — 21 columnas post-partido y 5 de target viven en el mismo parquet que las features**
   (`elo_*_post`, `shots_*`, `sot_*`, `ht_*`, goles, `result`). `corr(Δelo local, diferencia de goles) = 0,879`.
3. **Medio — `season_progress` usa la fecha del último partido de la temporada** (calendario futuro) como
   denominador. No filtra el marcador, pero al truncar a mitad de temporada cambia.
4. **Calidad — 59 columnas de forma con 76 pares |r| > 0,9**, `days_rest` sin acotar (máximo 8.477 días) y
   `prev_sot_pg = 0,0` en el 46,3 % de las filas porque suma una columna toda-NaN.

Lo que **sí** aguanta: Elo pre-partido (recálculo exacto, error 0,0), medias móviles de forma (verificadas a
mano en 2 casos) y priors de liga. El test de viaje en el tiempo solo detecta diferencias en 12 columnas:
los 10 priors + `season_progress` + `elo_diff_x_progress`.

---

## 1. Alcance y método

**El dataset no coincide con el encargo:** dice "181.268 × 192"; el artefacto real tiene **198 columnas**
(2000-07-28 → 2026-11-06). Se auditan las 198 y se deja constancia. Particiones:
dev 153.592, val 8.152, test 16.126, live 3.398.

**Cómo se audita sin tocar el generador.** `build_features.py` no se modifica. Se escribió
`rebuild_features()`, réplica exacta de `main()` sin IO, y se **validó contra el parquet: 198/198 columnas
idénticas, 0 diferencias**. Sin ella el test de viaje en el tiempo mediría el arnés, no el pipeline. Se distingue leakage **duro** (depende de datos con fecha ≥
`match_date` o del resultado), **suave** (metadatos futuros, p. ej. calendario) y **de contrato** (columnas
que no existirían al predecir).

---

## 2. Diccionario real: 198 columnas en 10 grupos

| Grupo | n | Rol | Fórmula / fuente |
|---|---:|---|---|
| `metadatos` | 18 | metadato | `match_id`, `div`, `season`, `match_date`, `source_row`, flags `has_*`. No son features. |
| `target` | 5 | target | `y = 0/1/2` desde `result`; `home_goals`, `away_goals`, `result`, `goals_total`. Prohibido como feature. |
| `post_partido` | 21 | post-partido | `elo_*_post` (6) + stats del propio partido: `ht_*`, `shots_*`, `sot_*`, `corners_*`, `fouls_*`, `yellows_*`, `reds_*`. Prohibido como feature. |
| `elo_pre` | 17 | feature | `R_pre` antes del partido; `exp = 1/(1+10^(−((R_h+65−R_a)/400)))`; `R_post = R_pre + K·MOV(gd)·(score−exp)`, `MOV = 1 / 1,5 / (11+|gd|)/8`, regresión 33 % a 1500 entre temporadas, K ∈ {10, 20, 40}. `elo_diff = R_h+65−R_a`. |
| `forma` | 59 | feature | `X_r{w} = mean(X_{t−1..t−w})` por equipo con `.shift(1)`, `min_periods=1`, w ∈ {5,10}; `X_ewm5` halflife 5. X ∈ {points, gf, ga, gd, shots, sot, corners, win, draw, loss, goals_per_shot, sot_rate}. Diferenciales `form_*_diff_*`. |
| `descanso` | 6 | feature | `days_rest` (días desde el partido anterior), `matches_last_14d` (estrictamente anteriores), `rest_diff`, `congestion_diff`. |
| `contexto` | 8 | feature | `*_season_match_no` (cumcount), `round_no = max(local, visitante)`, `season_progress = (fecha−inicio)/(fin−inicio)`, `div_change`, `season_break`. |
| `priors_equipo` | 10 | feature **auditada** | Agregados por (div, equipo, temporada): `prev_n`, `prev_ppg = pts/n`, `prev_gf_pg`, `prev_ga_pg`, `prev_sot_pg`. **Implementación real: temporada siguiente (§3.2).** |
| `priors_liga` | 2 | feature | `lg_avg_total_prev`, `lg_home_win_prev`: goles y % victoria local de la temporada anterior de la división, con join correcto `(div, season)`. |
| `mercado` | 52 | mercado | Cuotas apertura/cierre (b365, ps, avg, max, bf, bfe) y totales 2.5. Fuera del Motor A; el cierre no es válido antes del partido (CONTRACT_DATASET §3.4). |

**18+5+21+17+59+6+8+10+2+52 = 198.** El clasificador es exhaustivo (el script falla si sobra una columna).
Features utilizables: **102**; de ellas, 10 contaminadas.

---

## 3. Auditoría de leakage

### 3.1 Test de viaje en el tiempo

Para un corte `T` se reconstruyen todas las features usando **solo** partidos con `match_date < T` y se
comparan las filas anteriores a `T` con las del dataset completo. Si el pipeline es causal, deben ser
idénticas. Dos cortes: frontera de temporada y mitad de temporada.

| Corte | Filas comparadas | Idénticas | Columnas que difieren |
|---|---:|---|---|
| 2020-07-01 | 129.203 | **186 / 198** | `home_prev_*` (5), `away_prev_*` (5), `season_progress`, `elo_diff_x_progress` |
| 2021-01-15 | 133.901 | **186 / 198** | ídem |

Por grupo: `priors_equipo` 10/10 fallan, `contexto` 1/8, `elo_pre` 1/17 (producto con `season_progress`).
**Forma, descanso, priors de liga y Elo puro: 0 diferencias.** Elo, rolling y descanso son causales byte a byte.

### 3.2 Los priors de equipo miran a la temporada siguiente

`team_season_priors` genera filas `(div, team, prev_of, prev_*)` con `prev_of = season.shift(1)` pero valores
agregados de **la temporada de esa misma fila**. Después `main()` hace
`merge(left_on=["div",team,"season"], right_on=["div","team","prev_of"])`: un partido de la temporada `S` se
empareja con la fila cuyo `prev_of == S`, que es la de **S+1** y contiene el agregado de **S+1**.

| Columna | = temporada propia | = temporada **siguiente** | = temporada anterior |
|---|---:|---:|---:|
| `home_prev_ppg` | 2,86 % | **100,00 %** | 2,22 % |
| `home_prev_gf_pg` | 2,51 % | **100,00 %** | 2,18 % |
| `home_prev_ga_pg` | 3,05 % | **100,00 %** | 2,45 % |
| `home_prev_n` | 79,18 % | **100,00 %** | 67,82 % |

Ejemplos verificables (Premier League 2018/19, PPG calculado desde `matches.parquet`):

| Partido | Local | `home_prev_ppg` | PPG 2018/19 | PPG 2019/20 |
|---|---|---:|---:|---:|
| `E0:20190421:arsenal:crystal_palace` | Arsenal | 1,4737 | 1,8421 | **1,4737** |
| `E0:20180819:brighton:man_united` | Brighton | 1,0789 | 0,9474 | **1,0789** |

Un partido del 21-abr-2019 lleva encima la temporada 2019/20 completa de Arsenal, con partidos hasta julio de
2020. Tres huellas independientes: (a) el test de viaje en el tiempo la detecta; (b) la atribución da 100 %
contra la temporada siguiente; (c) los nulos crecen hacia el presente. El efecto no es cosmético:
`corr(home_prev_ppg, y) = −0,176` frente a `−0,136` del prior honesto, y `corr(leaky, honesto) = 0,45`.

### 3.3 `season_progress`: calendario futuro (leak suave)

`season_end = groupby(div, season).match_date.transform("max")` usa la fecha del último partido de la
temporada, desconocida a mitad de curso. Al truncar, `season_progress` cambia hasta 0,60 (corte
2021-01-15) y arrastra `elo_diff_x_progress`. No filtra el marcador; sí el calendario. Severidad media.

### 3.4 Columnas post-partido escondidas en el parquet

`corr(elo_home_post − elo_home, home_goals − away_goals) = 0,879`: la variación del Elo post **es** el
resultado. `sot_home` correlaciona 0,414 con la diferencia de goles. Son consecuencias, no features. Están en
el archivo porque el parquet es un join de `matches` con las features: cómodo para el ETL, peligroso para el
modelado.

### 3.5 Correlación con el target: ninguna feature "adivina" el partido

Sobre las 102 features usables: |r| máximo **0,307** con `y` (`elo_diff`), **0,355** con la diferencia de
goles, **0,120** con el total. **Cero features superan 0,95.** El orden es el esperado (Elo > k10/k40 >
priors > forma). Ninguna memoriza el marcador.

### 3.6 Verificación manual de `h_points_r5`

| Partido | Equipo | 5 partidos anteriores (fecha → puntos) | Manual | Dataset |
|---|---|---|---|---:|---:|
| `P1:20200215:rio_ave:sp_lisbon` | Rio Ave | 10/01→3, 19/01→3, 27/01→3, 31/01→1, 09/02→3 | 2,600000 | 2,600000 |
| `E1:20230429:stoke:qpr` | Stoke | 07/04→0, 10/04→1, 15/04→0, 18/04→0, 22/04→1 | 0,400000 | 0,400000 |

Coincidencia exacta (Δ = 0); el partido actual queda fuera por el filtro de fecha.

### 3.7 Elo: el pre no sabe el resultado; el post sí

Recálculo completo de la Premier League (9.970 partidos) con los parámetros del módulo: diferencia absoluta
máxima contra el parquet **0,0** en `elo_home`, `elo_away`, `elo_exp_home`, `elo_home_post` y
`elo_away_post`. La identidad `post = pre + 20·MOV·(score−exp)` se cumple con error máximo **0,0** en las
181.268 filas. Dos casos: `E0:20081018:bolton:blackburn` (empate) 1463,4356 → 1462,6074, Δ = −0,8282 =
20·1·(0,5−0,54141); `E0:20190504:newcastle:liverpool` (derrota) 1474,8865 → 1470,5759, Δ = −4,3106 =
20·1·(0−0,21553). El bloque Elo es causal; el post se excluye.

### 3.8 Otras comprobaciones y veredicto

Ningún equipo juega dos partidos el mismo día, `match_id` es único y `result` es coherente con los goles al 100 %. **Veredicto: hay leakage** — duro en 10 priors + 21 columnas post-partido;
suave en 2 columnas de progreso. El resto supera el test de causalidad sin una sola diferencia.

---

## 4. Calidad de las features

**Nulos por bloque.** Elo 0,0 %, contexto 0,0 %, descanso 0,14 %, priors de liga 4,2 %, priors de equipo
8,09 %, forma 16,8 %. Los de forma son estructurales: `shots/sot/corners` ≈ 49 % porque hay ligas de las que
football-data solo publica resultado y cuotas (las de año calendario llegan al 34 % de nulos medios y las
europeas al 2 %). Imputar con la mediana global mete un sesgo de liga.

**Constantes.** `source`, `has_result` (siempre `True`), `ingested_at`; cuasi-constantes `h_div_change` y
`a_div_change` (99,8 % ceros).

**Estabilidad.** `drift = (máx media temporal − mín media temporal)/std global`: mediana 0,33, p90 1,33. Las
más inestables son `home_prev_n`/`away_prev_n` (≈4,0, artefacto del leak), `lg_home_win_prev` (2,47) y
`*_sot_rate_*` (≈2,1, porque la tasa solo existe donde hay tiros).

**Distribuciones.**

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

`h_days_rest` engaña: media 11,8 y p95 18 parecen sanas, pero el **máximo es 8.477 días** (un equipo que
reaparece tras 23 años) y el 3,3 % supera 30 días. El escalado estándar comprime el 96,7 % de la distribución
en ~2σ y deja los outliers mandando en la cola. Acotar a 30–45 días es una corrección de dos líneas.

**Multicolinealidad.** 76 pares con |r| > 0,90 y el **43,1 % de las 102 features** en al menos un par:
`elo_exp_home ≡ elo_prob_home_nodraw` (r = 1,000), `elo_diff ≡ elo_diff_no_hfa` (r = 1,000, difieren en la
constante 65), las tres variantes K (r ≈ 0,98–0,99 entre sí), r5/r10/ewm5 de la misma variable (r ≈ 0,85–0,95)
y `win_r5+draw_r5+loss_r5 = 1`. Con L2 no rompe nada, pero triplica columnas sin añadir información.

---

## 5. Ablación

**Protocolo.** `Pipeline(SimpleImputer(median) → StandardScaler → LogisticRegression multinomial)`,
`lbfgs`, `C=1.0`, `max_iter=300`; imputación y escalado ajustados **solo con el train de cada fold**.
Walk-forward expanding: para cada `S ∈ {2008/09…2023/24}`, train = temporadas anteriores, predice `S`.
16 folds, **n = 116.830** predicciones out-of-fold. `test` y `live` no se tocan.

| Bloque | n | Log-loss | Brier | Acc | RPS | Δ LL vs `d` [IC95] |
|---|---:|---:|---:|---:|---:|---:|
| `a_elo` | 3 | 1,01927 | 0,61086 | 0,4917 | 0,20835 | +0,00715 [+0,0061, +0,0081] |
| `b_elo_forma` | 62 | 1,01578 | 0,60848 | 0,4936 | 0,20733 | +0,00365 [+0,0031, +0,0042] |
| `c_…descanso_contexto` | 76 | 1,01581 | 0,60851 | 0,4933 | 0,20734 | +0,00368 [+0,0031, +0,0042] |
| `d_todo` | 88 | **1,01213** | **0,60604** | **0,4957** | **0,20618** | — |
| `e_todo_sin_tiros` | 66 | 1,01346 | 0,60699 | 0,4949 | 0,20664 | +0,00133 [+0,0008, +0,0019] |
| `f_todo_sin_priors` (= `c`) | 76 | 1,01581 | 0,60851 | 0,4933 | 0,20734 | +0,00368 [+0,0032, +0,0042] |
| `g_todo_priors_causales` | 86 | 1,01536 | 0,60824 | 0,4935 | 0,20725 | +0,00324 [+0,0028, +0,0037] |
| `h_todo_sin_progress` | 87 | 1,01213 | 0,60603 | 0,4957 | 0,20617 | −0,00000 [−0,0001, +0,0001] |

IC95 % = bootstrap pareado **por temporada** (B = 2.000, 16 temporadas, semilla 20261109). Δ > 0 = peor que `d`.
`f` tiene exactamente las mismas columnas que `c` (los priors son lo único que `d` añade): sus métricas
coinciden dígito a dígito: el arnés no introduce ruido.

**Descomposición marginal.**

| Paso | Δ log-loss | Lectura |
|---|---:|---|
| `a → b`: + forma | **−0,00349** | aporta, y en las 16 temporadas |
| `b → c`: + descanso/contexto | +0,00003 | **no aporta nada** (empeora 3·10⁻⁵) |
| `c → d`: + priors (como están) | **−0,00368** | "aporta" tanto como todo el bloque de forma |
| `c → g`: + priors causales | −0,00045 | el valor honesto es el 12 % de eso |
| `d → e`: − tiros | +0,00133 | los tiros sí aportan |
| `d → h`: − `season_progress` | 0,00000 | irrelevante para el rendimiento |

**Robustez.** `d` es mejor que `a` en **16/16** temporadas (ventaja entre +0,0019 y +0,0108) y mejor que `g`
en **16/16** (entre +0,0012 y +0,0044). La ventaja de los priors con fuga es sistemática, no de una liga o
temporada. `b` y `c` se cruzan sin patrón (c gana en 5, pierde en 11, ±0,001): la ausencia de señal de
descanso/contexto no es un artefacto puntual.

**Interpretación.**

- **Elo es el esqueleto:** 1,01927 con 3 columnas, 7,2 % mejor que la referencia uniforme (`ln 3 = 1,09861`).
- **La forma aporta poco pero de forma consistente:** −0,0035 (−0,34 % relativo), IC que excluye 0 y signo
  estable en 16/16 temporadas. Es la única familia que mejora a Elo de forma reproducible.
- **Descanso y contexto no aportan:** `c` es 0,00003 *peor* que `b`, y quitar `season_progress` deja el
  log-loss **exactamente igual** (Δ = −0,000004). `round_no`, `season_match_no`, `days_rest` y
  `congestion_diff` no añaden nada sobre un Elo que ya contiene la historia del equipo.
- **Los priors actuales son el mejor bloque después de Elo… y son falsos.** Su ganancia (−0,0037) es
  indistinguible de la del bloque de forma completo (−0,0035) y **8 veces** la de los priors causales
  (−0,00045). El **88 % de su valor aparente es información del futuro**. Si se hubiera hecho *feature
  selection* con este backtest, se habría concluido que los priors son la segunda fuente de señal del
  proyecto.
- **Los tiros aportan** (−0,0013 al quitarlos), pero solo el 51 % de las filas los tiene; el modelo los usa
  donde existen.

**Conclusión explícita:** aportan Elo (base imprescindible), forma (−0,0035) y, dentro de ella, los tiros
(−0,0013). **No aportan** descanso, contexto ni `season_progress` (≈0,0000). Los priors de equipo, tal como
están, aparentan −0,0037 pero **no son utilizables**: su valor honesto es −0,0005.

---

## 6. Recomendaciones

**R1 (P0, bloqueante) — Cuarentena de los priors.** No usar `home_prev_*`/`away_prev_*`. Preferente:
sustituirlos por el prior causal (última temporada terminada antes del partido; coste medido +0,00045, casi
gratis). Alternativa: eliminarlos (coste +0,0037 *en backtest*, ficticio porque en producción no existen).
En ambos casos, **corregir el join** (`left.season == right.season` con los valores ya desplazados) y
renombrar: `prev_` describe algo que el código no hace.

**R2 (P0) — Lista blanca de features, no `select_dtypes`.** El parquet mezcla 5 columnas de target, 21
post-partido y 52 de mercado con 102 features; cualquier `select_dtypes(include="number")` entrena con el
resultado dentro. Definir `FEATURES_MOTOR_A` explícita y un **test** que falle si entra una columna de
`post_partido`, `target` o `mercado`. Diez líneas que eliminan la clase de error más cara del proyecto.

**R3 (P1) — Podar y arreglar.** (a) Quedarse con `points_r5`, `gd_r5`, `gf_r5`, `ga_r5`, `gd_ewm5` y los 3
diferenciales (~8 en vez de 59) y validarlo en EXP; (b) borrar `*_r10` (r ≈ 0,9 con r5); (c) una sola
variante de Elo (`elo_diff`, `elo_home`, `elo_away`) y fuera `elo_k10_*`/`elo_k40_*` (r ≈ 0,98) y
`elo_exp_home`/`elo_prob_home_nodraw` (deterministas de `elo_diff`); (d) `prev_sot_pg` debe ser `NaN`, no 0,0
(hoy suma todo-NaN en el 46,3 % de las filas); (e) acotar `days_rest` a 30–45 días.

**R4 (P1) — `season_progress` con calendario fijo** (`inicio + 300 días` o `round_no/38`). Quitarlo no
cuesta rendimiento (Δ = 0,00000) y elimina la dependencia de un calendario futuro; si se quita,
`elo_diff_x_progress` se va con él.

**R5 (P2) — Separar el parquet en tres** (`features`, `labels`, `market`) y actualizar el contrato a 198
columnas. La separación física es la única mitigación que no depende de la disciplina de quien escribe el
modelo.

**R6 (P2) — No presentar descanso/contexto como features que aportan.** Medido: +0,00003. Mantenerlos solo si
un GBM los rescata.

---

## 7. Limitaciones y reproducibilidad

Un solo modelo lineal y un solo `C`: un GBM podría extraer más de forma e interacciones (Elo × descanso, forma
× localía) y la atribución por bloques es válida para *este* modelo. La imputación por mediana es tosca para
nulos estructurales (49 % en tiros); un indicador de "liga sin tiros" o modelos por familia podrían cambiar
la conclusión sobre `e`. El test de viaje en el tiempo usa dos cortes: un bug que solo se manifieste en otras
fechas no se detectaría, aunque la comparación es columna a columna sobre 129k–134k filas con la réplica
validada contra el parquet completo. La reconstrucción causal usa "última temporada terminada por fecha", que
en ligas de año calendario puede ser una temporada que acabó 6–9 meses antes. Las diferencias de
0,001–0,004 son nítidas (n = 116.830, IC pareado) pero pequeñas en la práctica.

```bash
cd research/prediction-lab
./.venv/bin/python features/audit_features.py                  # todo (~25 min); escribe feature_audit.json
./.venv/bin/python features/audit_features.py --skip-ablation  # diccionario + leakage + calidad
```

El JSON tiene `dictionary`, `leakage` (réplica validada, viaje en el tiempo, atribución de priors, casos manuales, hallazgos L1–L5), `quality`, `causal_priors` y `ablation`.
**Archivos escritos:** `features/audit_features.py`, `features/feature_audit.json`,
`reports/A05_features.md`, `coordination/status/A05.json`. Nada más se modificó.
