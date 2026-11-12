# A29 — Calibración Publicada por Liga y Mercado (`v3.2` · Agente `B4`)

> **Agente:** `B4` (`b4-calibration`, Ola 1 de `PREDLAB-V3.2`)  
> **Commit base sobre el que se calcula:** `48854e8d71ebf844b7cc533b479007f92a6ce5bd` (`48854e8`)  
> **Partición evaluada:** estrictamente `walk_forward_dev` (`ts_event_start < 2025-02-02T17:30:00Z`, `56,649` eventos: `52,746` fútbol + `3,903` NFL; `holdout_sealed` de `14,163` eventos 100% intacto y no leído) — **`OBSERVADO`**  
> **Comando exacto de reproducción:**  
> ```powershell
> Set-Location "C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab"
> .\research\prediction-lab\.venv\Scripts\python.exe services/models/outlook_calibration.py --record-trial
> ```
> **Comando exacto de verificación de tests y paridad SHA-256:**  
> ```powershell
> Set-Location "C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab"
> .\research\prediction-lab\.venv\Scripts\python.exe -m pytest services/models -v
> ```
> **Artefactos espejo generados (idéntico SHA-256 = `090cfaa23d35bdd569ea3a17d0084b6af7b2e99eeb8cdb00b15a8b588654194e`):**  
> - `services/models/artifacts/outlook_calibration_v3_2.json`  
> - `src/data/prediction/outlook_calibration_v3_2.json`

---

## 1. Resumen Ejecutivo y Auditoría de Gobernanza (`§0`)

1. **Jerarquía causal de probabilidad publicada (`PublishedProbSource` en `MatchOutlook`, `OBSERVADO`):**
   - Cuando existe cuota sharp real y fresca (`pinnacle` o `smarkets`, `ts_captured <= ts_decision` y antigüedad `<= 180.0 min`), la fuente publicada se elige por segmento `liga × mercado` según evaluación causal en `walk_forward_dev`:
     - **`blend_v3_1` seleccionada en `3 / 93` segmentos (`D2::1x2`, `G1::1x2`, `G1::totals`):** cumplen simultáneamente `w_effective > 0.05` en `blend_weights_v3_1.json` congelado, superan en `log-loss` a `market_sharp_novig` con el peso congelado y sostienen la mejora pliegue a pliegue en validación causal walk-forward (`< fold_cut_ts`). En los tres casos, el IC 95% bootstrap pareado de `ΔLL` frente a `market_sharp_novig` cruza `0` y queda etiquetado obligatoriamente como **`no significativa`** (`OBSERVADO`).
     - **`market_sharp_novig` seleccionada en `90 / 93` segmentos:** incluye todos los segmentos con `w_effective <= 0.05`, los segmentos donde la mezcla causal walk-forward no mejora la apertura sharp sin margen y los segmentos sin cuotas sharp pre-decisión históricas (donde si en producción en vivo llega una cuota sharp fresca `<= 180 min`, se publica `market_sharp_novig` pura sin margen al tener `w_effective <= 0.05`, salvo `MEX::1x2` que tampoco superó causalmente al cierre sharp en `v3.1`).
   - Cuando **no** existe cuota sharp fresca en ventana (`<= 180 min`), la prelación cae al escalón **`model`** (`Motor A` OOF / matriz única Dixon-Coles en fútbol; `NFL Minkowski` en NFL) y, en ausencia de variables mínimas del motor, a **`base_rate`** causal (`OBSERVADO`).
2. **Calibración empírica global (`walk_forward_dev`, bootstrap `mulberry32`, `1,000` remuestreos, semilla `20261111`, `OBSERVADO`):**
   - **Fútbol `1x2` (`market_sharp_novig`, `n = 37,490`):** `ECE = 0.0025` (`[0.0017, 0.0056]`), `log-loss = 0.9929` (`[0.9882, 0.9978]`), `Brier = 0.5928` (`[0.5896, 0.5962]`), `RPS = 0.2007` (`[0.1993, 0.2020]`). Escalón `model` (`n = 52,746` en las 23 ligas): `ECE = 0.0062` (`[0.0039, 0.0088]`), `log-loss = 1.0109`, superando a `base_rate` por `ΔLL = -0.0639` (`[-0.0666, -0.0611]`, `significativa`).
   - **Fútbol `totals` `2.5` (`market_sharp_novig`, `n = 31,845`):** `ECE = 0.0033` (`[0.0012, 0.0089]`), `log-loss = 0.6737` (`[0.6718, 0.6757]`), `Brier = 0.4809`, `RPS = 0.2405`. Escalón `model` Dixon-Coles (`n = 52,746`): `ECE = 0.0175`, `log-loss = 0.6811`, `ΔLL vs base_rate = -0.0063` (`[-0.0080, -0.0047]`, `significativa`).
   - **Fútbol `btts` (`0` cuotas históricas en `odds_snapshots.parquet` -> cuotas sharp `DESCONOCIDO`; escalón `model` evaluado sobre `n = 52,746` partidos reales `OBSERVADO`):** `ECE = 0.0223` (`[0.0180, 0.0266]`), `log-loss = 0.6891` (`[0.6879, 0.6904]`), `Brier = 0.4959`, `RPS = 0.2480`, superando a `base_rate` causal globalmente por `ΔLL = -0.0016` (`[-0.0028, -0.0004]`, `significativa`), aunque a nivel individual de liga la mayoría de los intervalos cruzan `0` (`no significativa`).
   - **Fútbol `ah` (`market_sharp_novig`, `n = 29,658` partidos sin push con ponderación Bayesiana exacta `0.5` en cuartos de línea):** `ECE = 0.0020` (`[0.0001, 0.0080]`), `log-loss = 0.6916` (`[0.6910, 0.6922]`), `Brier = 0.4985`, `RPS = 0.2492`. Bajo liquidación exacta de 5 estados (`full_win / half_win / push / half_loss / full_loss`), ningún segmento `ah` mantiene ventaja causal walk-forward de `blend_v3_1` sobre la apertura sharp de Pinnacle (`OBSERVADO`).
   - **NFL `moneyline` (**`sin cierre sharp`**, comparada contra la línea de consenso de `nflverse` en `n = 3,890` partidos sin empate):** el consenso `nflverse` sin margen (**`sin cierre sharp`**, `OBSERVADO`) obtiene `log-loss = 0.6091` (`[0.5975, 0.6209]`), `Brier = 0.4216`, `RPS = 0.2108` y `ECE = 0.0094` (`[0.0060, 0.0265]`), mientras el motor causal `NFL Minkowski` (`model`) obtiene `log-loss = 0.6244` (`[0.6141, 0.6346]`), `ECE = 0.0167` (`[0.0084, 0.0327]`), `ΔLL vs consenso nflverse (sin cierre sharp) = +0.0153` (`[+0.0098, +0.0210]`, `significativa` a favor del consenso; y `ΔLL vs base_rate = -0.0629`, `[-0.0723, -0.0528]`, `significativa` a favor del modelo frente a la tasa base).

### Verificación de Inmutabilidad de `v3.1` y Sello del Holdout (`OBSERVADO`)

| Artefacto / Invariante | Estado | Evidencia verificable (`SHA-256` / conteo) |
| :--- | :---: | :--- |
| `src/data/prediction/blend_weights_v3_1.json` | Congelado intacto (`OBSERVADO`) | `b29d7a451f6011126997c122778b42ad3239c78337d17c5fa78d550f5c92739b` |
| `src/data/prediction/pick_policy_v3_1.json` | Congelado intacto (`OBSERVADO`) | `2359c8f8822ea394a380202c04e0bcd010d1a3fae7c5c25b8c11ebe810bfb7d1` |
| `src/data/prediction/stale_lines_config.json` | Congelado intacto (`OBSERVADO`) | `8bcb9c7be93270cde0cac2d58bc19f0381184dd2e769f358dd28334db2a05eac` |
| `src/data/prediction/production_segments_v3_1.json` | Congelado intacto (`OBSERVADO`) | `0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc` |
| `production_enabled` global | `0 / 60` encendidos (`OBSERVADO`) | `n_segments_production_enabled = 0` |
| `holdout_sealed` (`>= 2025-02-02T17:30:00Z`) | `0` lecturas / evaluaciones (`OBSERVADO`) | `14,163` eventos excluidos mediante `enforce_walk_forward_dev_only` + `assert_no_holdout_events` |
| `holdout_trial_registry.jsonl` | Append-only línea `30` (`OBSERVADO`) | `phase="ola1_b4_outlook_calibration_v3_2"`, `eval_split="walk_forward_dev"`, `unlock_holdout=false` |
| Cero campos de apuesta en JSON público | Verificado (`OBSERVADO`) | `assert_no_forbidden_public_fields` bloquea `stake`, `kelly`, `ev`, `value`, `tier`, `"pick seguro"` |

---

## 2. Metodología Matemática y Regla de Selección Causal

- **Métricas estrictamente propias evaluadas sobre `walk_forward_dev`:**
  - **Log-loss categórico:** $-\ln(\text{clip}(p_{i, y_i}, 10^{-15}, 1))$.
  - **Brier multiclase / 2-vías:** $\sum_{k=0}^{K-1} (p_{i,k} - \mathbb{I}[y_i = k])^2$ (en $K=2$, equivale a $2(p_{i,0} - y_{i,0})^2$).
  - **RPS (*Ranked Probability Score*, Epstein 1969):** $\frac{1}{K-1} \sum_{r=0}^{K-2} \left(\sum_{j=0}^{r} p_{i,j} - \sum_{j=0}^{r} \mathbb{I}[y_i = j]\right)^2$ (en $K=3$ `1x2` respeta el orden ordinal `home -> draw -> away`; en $K=2$ coincide con $(p_{i,0} - \mathbb{I}[y_i = 0])^2 \in [0, 1]$).
  - **Curva de fiabilidad de `10` bins y `ECE`:** partición canónica $[0.0, 0.1), [0.1, 0.2), \dots, [0.9, 1.0]$ (`bin_index = min(9, floor(10 * p))`) sobre todos los pares `(partido, selección)` para cubrir el soporte completo $(0, 1)$ consumido por `MatchOutlook.calibrationBucket`, con bootstrap agrupado (*cluster bootstrap*) a nivel de partido (`mulberry32`, `1,000` remuestreos, semilla `20261111`) para preservar la dependencia intra-partido.
- **Corrección Bayesiana en cuartos de línea de Hándicap Asiático (`ah` `±0.25, ±0.75`, `OBSERVADO`):** en medias victorias / medias derrotas (`|diff| = 0.25`), la mitad del principal se liquida y la otra mitad hace *push*, por lo que el peso activo es `active_w = 0.5` (y `0.0` en *push* exacto `diff = 0`). Ponderar por `active_w` hace que el minimizador exacto de `log-loss`, `Brier`, `RPS` y `empirical_freq` coincida con `p_effective_win` de `markets_2way.py` / `markets_2way.ts`. Al eliminar el sesgo de tratar medias derrotas como derrotas completas, los `9` segmentos `ah` que aparentaban ganancia OOF en `v3.1-A4` pierden ventaja frente a `market_sharp_novig` (`OBSERVADO`, consistente con `A28` §A6).
- **Honestidad de cobertura (`OBSERVADO` vs `DESCONOCIDO`):**
  - **17 ligas europeas (`B1..T1`) en `1x2`, `totals` (`2.5`) y `ah`:** cuotas sharp pre-decisión (`open` `<= ts_decision`) y de cierre (`close`) de Pinnacle/Smarkets **`OBSERVADO`**.
  - **6 ligas extra (`ARG, BRA, JPN, MEX, SWE, USA`) en `1x2`:** `historical_fd` publicó cierre Pinnacle (`OBSERVADO`) pero no apertura `T-6h` (`DESCONOCIDO`). Para impedir cualquier fuga post-decisión (`ts_captured > ts_decision`), el nivel `T-6h` evalúa `model` contra el cierre sharp de Pinnacle como benchmark.
  - **Fútbol `btts` (23 ligas) y `totals`/`ah` en las 6 ligas extra:** `0` cuotas históricas en `odds_snapshots.parquet` (`DESCONOCIDO`). Jamás se inventan precios; se evalúa `model` (matriz única Dixon-Coles con `dc_lam_home`, `dc_lam_away` pre-partido y `dc_rho` causal `< fold_cut_ts`) frente a `base_rate` causal sobre marcadores reales en `matches.parquet` (`OBSERVADO`).
  - **`NFL::moneyline`:** `0` cierres de casas sharp (`pinnacle`/`smarkets`) en el histórico -> etiquetado explícitamente **`sin cierre sharp`**, comparando `model` (`NFL Minkowski`) y `blend_v3_1` (`w=0.05`) frente al consenso desvigorizado de `nflverse` (`OBSERVADO`).

---

## 3. Comparativa Global por Deporte, Mercado y Escalón (`walk_forward_dev`)

| Segmento Global | Escalón Evaluado | Estado Cobertura | `n` | `Log-Loss` (IC 95%) | `Brier` (IC 95%) | `RPS` (IC 95%) | `ECE` (IC 95%) | `ΔLL vs Benchmark` (IC 95%) | Significancia |
| :--- | :--- | :---: | ---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `GLOBAL::football::1x2` | `market_sharp_novig` | OBSERVADO (sharp open) | 37490 | `0.9929` `[0.9882, 0.9978]` | `0.5928` `[0.5896, 0.5962]` | `0.2007` `[0.1993, 0.2020]` | `0.0025` `[0.0017, 0.0056]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `GLOBAL::football::1x2` | `pinnacle_closing_novig` | OBSERVADO (sharp close) | 52659 | `0.9968` `[0.9931, 1.0006]` | `0.5956` `[0.5931, 0.5983]` | `0.2018` `[0.2007, 0.2029]` | `0.0019` `[0.0015, 0.0045]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `GLOBAL::football::1x2` | `model` | OBSERVADO (vs base_rate) | 52746 | `1.0109` `[1.0073, 1.0145]` | `0.6052` `[0.6027, 0.6077]` | `0.2062` `[0.2052, 0.2072]` | `0.0062` `[0.0039, 0.0088]` | `-0.0639` `[-0.0666, -0.0611]` | **significativa** |
| `GLOBAL::football::1x2` | `base_rate` | OBSERVADO | 52746 | `1.0748` `[1.0726, 1.0769]` | `0.6502` `[0.6487, 0.6518]` | `0.2275` `[0.2268, 0.2283]` | `0.0092` `[0.0065, 0.0119]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `GLOBAL::football::totals` | `market_sharp_novig` | OBSERVADO (sharp open 2.5) | 31845 | `0.6737` `[0.6718, 0.6757]` | `0.4809` `[0.4790, 0.4829]` | `0.2405` `[0.2395, 0.2414]` | `0.0033` `[0.0012, 0.0089]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `GLOBAL::football::totals` | `pinnacle_closing_novig` | OBSERVADO (sharp close 2.5) | 31841 | `0.6710` `[0.6686, 0.6732]` | `0.4783` `[0.4761, 0.4804]` | `0.2392` `[0.2380, 0.2402]` | `0.0027` `[0.0011, 0.0087]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `GLOBAL::football::totals` | `model` | OBSERVADO (vs base_rate) | 52746 | `0.6811` `[0.6793, 0.6830]` | `0.4879` `[0.4863, 0.4897]` | `0.2440` `[0.2431, 0.2449]` | `0.0175` `[0.0140, 0.0219]` | `-0.0063` `[-0.0080, -0.0047]` | **significativa** |
| `GLOBAL::football::totals` | `base_rate` | OBSERVADO | 52746 | `0.6874` `[0.6862, 0.6885]` | `0.4943` `[0.4931, 0.4953]` | `0.2471` `[0.2465, 0.2477]` | `0.0101` `[0.0057, 0.0141]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `GLOBAL::football::btts` | `model` | OBSERVADO (cuota sharp DESCONOCIDO) | 52746 | `0.6891` `[0.6879, 0.6904]` | `0.4959` `[0.4947, 0.4972]` | `0.2480` `[0.2474, 0.2486]` | `0.0223` `[0.0180, 0.0266]` | `-0.0016` `[-0.0028, -0.0004]` | **significativa** |
| `GLOBAL::football::btts` | `base_rate` | OBSERVADO | 52746 | `0.6906` `[0.6898, 0.6916]` | `0.4975` `[0.4966, 0.4984]` | `0.2487` `[0.2483, 0.2492]` | `0.0109` `[0.0068, 0.0151]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `GLOBAL::football::ah` | `market_sharp_novig` | OBSERVADO (sharp open) | 29658 | `0.6916` `[0.6910, 0.6922]` | `0.4985` `[0.4979, 0.4991]` | `0.2492` `[0.2489, 0.2495]` | `0.0020` `[0.0001, 0.0080]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `GLOBAL::football::ah` | `pinnacle_closing_novig` | OBSERVADO (misma línea) | 18454 | `0.6923` `[0.6915, 0.6930]` | `0.4991` `[0.4984, 0.4999]` | `0.2496` `[0.2492, 0.2499]` | `0.0054` `[0.0004, 0.0128]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `GLOBAL::football::ah` | `model` | OBSERVADO (vs base_rate) | 50491 | `0.6847` `[0.6827, 0.6868]` | `0.4919` `[0.4900, 0.4939]` | `0.2459` `[0.2450, 0.2469]` | `0.0403` `[0.0363, 0.0447]` | `-0.0074` `[-0.0095, -0.0052]` | **significativa** |
| `GLOBAL::football::ah` | `base_rate` | OBSERVADO | 50491 | `0.6921` `[0.6914, 0.6929]` | `0.4990` `[0.4983, 0.4997]` | `0.2495` `[0.2491, 0.2499]` | `0.0093` `[0.0049, 0.0137]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `NFL::moneyline` | `nflverse_consensus_novig_sin_cierre_sharp` | OBSERVADO (sin cierre sharp) | 3890 | `0.6091` `[0.5975, 0.6209]` | `0.4216` `[0.4115, 0.4324]` | `0.2108` `[0.2057, 0.2162]` | `0.0094` `[0.0060, 0.0265]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `NFL::moneyline` | `blend_v3_1_on_nflverse_sin_cierre_sharp` | OBSERVADO (w=0.05, sin cierre sharp) | 3890 | `0.6090` `[0.5975, 0.6204]` | `0.4216` `[0.4115, 0.4314]` | `0.2108` `[0.2057, 0.2157]` | `0.0064` `[0.0043, 0.0244]` | `-0.0000` `[-0.0003, +0.0002]` | **no significativa** |
| `NFL::moneyline` | `model` | OBSERVADO (vs consenso sin cierre sharp) | 3890 | `0.6244` `[0.6141, 0.6346]` | `0.4353` `[0.4262, 0.4448]` | `0.2176` `[0.2131, 0.2224]` | `0.0167` `[0.0084, 0.0327]` | `+0.0153` `[+0.0098, +0.0210]` | **significativa** |
| `NFL::moneyline` | `base_rate` | OBSERVADO | 3891 | `0.6872` `[0.6831, 0.6915]` | `0.4941` `[0.4900, 0.4983]` | `0.2470` `[0.2450, 0.2492]` | `0.0091` `[0.0005, 0.0254]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |

### Auditoría de los 22 Segmentos con `frozen_w_effective > 0.05` en `blend_weights_v3_1.json`

| Segmento | `w_eff` congelado | `n` (sharp open) | `LL sharp_open` | `LL blend_frozen` | `LL blend_wf_causal` | Fuente Seleccionada | `ΔLL` Publicada (IC 95%) | Significancia | Motivo Causal |
| :--- | ---: | ---: | ---: | ---: | ---: | :---: | :---: | :---: | :--- |
| `D2::1x2` | `0.35` | 2010 | `1.050022` | `1.048412` | `1.049695` | **`blend_v3_1`** | `-0.001610` `[-0.003713, +0.000486]` | **no significativa** | `frozen_and_walk_forward_causal_blend_beats_or_ties_sharp_open` |
| `D2::ah` | `0.35` | 1604 | `0.691701` | `0.690640` | `0.692700` | **`market_sharp_novig`** | `+0.000000` `[+0.000000, +0.000000]` | **no significativa** | `walk_forward_causal_blend_does_not_beat_or_tie_sharp_open_in_dev` |
| `E0::ah` | `0.15` | 2002 | `0.691611` | `0.692280` | `0.691990` | **`market_sharp_novig`** | `+0.000000` `[+0.000000, +0.000000]` | **no significativa** | `frozen_blend_does_not_beat_or_tie_sharp_open_in_dev` |
| `E1::ah` | `0.20` | 2923 | `0.691087` | `0.691975` | `0.691661` | **`market_sharp_novig`** | `+0.000000` `[+0.000000, +0.000000]` | **no significativa** | `frozen_blend_does_not_beat_or_tie_sharp_open_in_dev` |
| `F1::ah` | `0.15` | 1773 | `0.690770` | `0.691428` | `0.691202` | **`market_sharp_novig`** | `+0.000000` `[+0.000000, +0.000000]` | **no significativa** | `frozen_blend_does_not_beat_or_tie_sharp_open_in_dev` |
| `F2::1x2` | `0.20` | 2356 | `1.046774` | `1.046505` | `1.046816` | **`market_sharp_novig`** | `+0.000000` `[+0.000000, +0.000000]` | **no significativa** | `walk_forward_causal_blend_does_not_beat_or_tie_sharp_open_in_dev` |
| `G1::1x2` | `0.15` | 1514 | `0.927015` | `0.926361` | `0.926985` | **`blend_v3_1`** | `-0.000654` `[-0.001862, +0.000588]` | **no significativa** | `frozen_and_walk_forward_causal_blend_beats_or_ties_sharp_open` |
| `G1::ah` | `0.35` | 1212 | `0.692213` | `0.693105` | `0.692344` | **`market_sharp_novig`** | `+0.000000` `[+0.000000, +0.000000]` | **no significativa** | `frozen_blend_does_not_beat_or_tie_sharp_open_in_dev` |
| `G1::totals` | `0.10` | 1306 | `0.673115` | `0.672982` | `0.673062` | **`blend_v3_1`** | `-0.000133` `[-0.000830, +0.000514]` | **no significativa** | `frozen_and_walk_forward_causal_blend_beats_or_ties_sharp_open` |
| `I1::ah` | `0.20` | 1986 | `0.692776` | `0.694049` | `0.692807` | **`market_sharp_novig`** | `+0.000000` `[+0.000000, +0.000000]` | **no significativa** | `frozen_blend_does_not_beat_or_tie_sharp_open_in_dev` |
| `I2::1x2` | `0.10` | 2442 | `1.050228` | `1.050146` | `1.050661` | **`market_sharp_novig`** | `+0.000000` `[+0.000000, +0.000000]` | **no significativa** | `walk_forward_causal_blend_does_not_beat_or_tie_sharp_open_in_dev` |
| `I2::ah` | `0.25` | 1939 | `0.690716` | `0.693021` | `0.691199` | **`market_sharp_novig`** | `+0.000000` `[+0.000000, +0.000000]` | **no significativa** | `frozen_blend_does_not_beat_or_tie_sharp_open_in_dev` |
| `MEX::1x2` | `0.10` | 2175 | `N/A` | `N/A` | `N/A` | **`market_sharp_novig`** | `+0.011171` `[+0.004310, +0.018183]` | **significativa** | `no_pre_decision_sharp_quotes_in_walk_forward_dev_default_sharp_novig` |
| `N1::ah` | `0.15` | 1545 | `0.690411` | `0.691466` | `0.690411` | **`market_sharp_novig`** | `+0.000000` `[+0.000000, +0.000000]` | **no significativa** | `frozen_blend_does_not_beat_or_tie_sharp_open_in_dev` |
| `P1::1x2` | `0.15` | 2001 | `0.922950` | `0.922587` | `0.922975` | **`market_sharp_novig`** | `+0.000000` `[+0.000000, +0.000000]` | **no significativa** | `walk_forward_causal_blend_does_not_beat_or_tie_sharp_open_in_dev` |
| `P1::ah` | `0.25` | 1570 | `0.690322` | `0.692039` | `0.690322` | **`market_sharp_novig`** | `+0.000000` `[+0.000000, +0.000000]` | **no significativa** | `frozen_blend_does_not_beat_or_tie_sharp_open_in_dev` |
| `SC0::ah` | `0.25` | 1132 | `0.691904` | `0.693317` | `0.692194` | **`market_sharp_novig`** | `+0.000000` `[+0.000000, +0.000000]` | **no significativa** | `frozen_blend_does_not_beat_or_tie_sharp_open_in_dev` |
| `SC1::ah` | `0.30` | 856 | `0.695285` | `0.696280` | `0.696359` | **`market_sharp_novig`** | `+0.000000` `[+0.000000, +0.000000]` | **no significativa** | `frozen_blend_does_not_beat_or_tie_sharp_open_in_dev` |
| `SP1::ah` | `0.15` | 1947 | `0.691133` | `0.691621` | `0.691642` | **`market_sharp_novig`** | `+0.000000` `[+0.000000, +0.000000]` | **no significativa** | `frozen_blend_does_not_beat_or_tie_sharp_open_in_dev` |
| `SP2::1x2` | `0.15` | 3014 | `1.044082` | `1.043870` | `1.044099` | **`market_sharp_novig`** | `+0.000000` `[+0.000000, +0.000000]` | **no significativa** | `walk_forward_causal_blend_does_not_beat_or_tie_sharp_open_in_dev` |
| `SP2::ah` | `0.30` | 2343 | `0.690824` | `0.691838` | `0.691876` | **`market_sharp_novig`** | `+0.000000` `[+0.000000, +0.000000]` | **no significativa** | `frozen_blend_does_not_beat_or_tie_sharp_open_in_dev` |
| `T1::ah` | `0.15` | 1858 | `0.694040` | `0.695231` | `0.694441` | **`market_sharp_novig`** | `+0.000000` `[+0.000000, +0.000000]` | **no significativa** | `frozen_blend_does_not_beat_or_tie_sharp_open_in_dev` |

---

## 4. Curvas de Fiabilidad de `10` Bins (`[0.0, 0.1), ..., [0.9, 1.0]`)

### 4.1 Fútbol `1x2` — `GLOBAL::football::1x2` (`market_sharp_novig`, `n = 37,490` partidos / `112,470` pares)
- **`ECE`:** `0.0025` (IC 95%: `[0.0017, 0.0056]`, `OBSERVADO`)

| Bin | Rango `[p_min, p_max)` | Pares `(evento, sel)` `n` | Predicción Media | Frecuencia Empírica | IC 95% Bootstrap Empírico |
| :---: | :---: | ---: | ---: | ---: | :---: |
| `0` | `[0.0, 0.1)` | 3649 | `0.0696` | `0.0685` | `[0.0606, 0.0765]` |
| `1` | `[0.1, 0.2)` | 13585 | `0.1579` | `0.1572` | `[0.1506, 0.1635]` |
| `2` | `[0.2, 0.3)` | 41385 | `0.2586` | `0.2601` | `[0.2560, 0.2641]` |
| `3` | `[0.3, 0.4)` | 24294 | `0.3392` | `0.3379` | `[0.3339, 0.3416]` |
| `4` | `[0.4, 0.5)` | 13309 | `0.4458` | `0.4389` | `[0.4304, 0.4475]` |
| `5` | `[0.5, 0.6)` | 8050 | `0.5462` | `0.5499` | `[0.5385, 0.5608]` |
| `6` | `[0.6, 0.7)` | 4340 | `0.6456` | `0.6502` | `[0.6363, 0.6635]` |
| `7` | `[0.7, 0.8)` | 2466 | `0.7440` | `0.7490` | `[0.7315, 0.7664]` |
| `8` | `[0.8, 0.9)` | 1247 | `0.8411` | `0.8532` | `[0.8331, 0.8722]` |
| `9` | `[0.9, 1.0)` | 145 | `0.9178` | `0.9034` | `[0.8527, 0.9496]` |

### 4.2 Fútbol `totals` (`2.5`) — `GLOBAL::football::totals` (`market_sharp_novig`, `n = 31,845` partidos / `63,690` pares)
- **`ECE`:** `0.0033` (IC 95%: `[0.0012, 0.0089]`, `OBSERVADO`)

| Bin | Rango `[p_min, p_max)` | Pares `(evento, sel)` `n` | Predicción Media | Frecuencia Empírica | IC 95% Bootstrap Empírico |
| :---: | :---: | ---: | ---: | ---: | :---: |
| `0` | `[0.0, 0.1)` | 0 | N/A | N/A | N/A |
| `1` | `[0.1, 0.2)` | 66 | `0.1741` | `0.1212` | `[0.0484, 0.2031]` |
| `2` | `[0.2, 0.3)` | 839 | `0.2721` | `0.2861` | `[0.2553, 0.3163]` |
| `3` | `[0.3, 0.4)` | 8766 | `0.3643` | `0.3623` | `[0.3524, 0.3721]` |
| `4` | `[0.4, 0.5)` | 21888 | `0.4510` | `0.4477` | `[0.4410, 0.4545]` |
| `5` | `[0.5, 0.6)` | 22460 | `0.5478` | `0.5510` | `[0.5443, 0.5574]` |
| `6` | `[0.6, 0.7)` | 8766 | `0.6357` | `0.6377` | `[0.6279, 0.6476]` |
| `7` | `[0.7, 0.8)` | 839 | `0.7279` | `0.7139` | `[0.6837, 0.7447]` |
| `8` | `[0.8, 0.9)` | 66 | `0.8259` | `0.8788` | `[0.7969, 0.9516]` |
| `9` | `[0.9, 1.0)` | 0 | N/A | N/A | N/A |

### 4.3 Fútbol `btts` — `GLOBAL::football::btts` (`model` Dixon-Coles, sin cuotas históricas, `n = 52,746` partidos / `105,492` pares)
- **`ECE`:** `0.0223` (IC 95%: `[0.0180, 0.0266]`, `OBSERVADO`)

| Bin | Rango `[p_min, p_max)` | Pares `(evento, sel)` `n` | Predicción Media | Frecuencia Empírica | IC 95% Bootstrap Empírico |
| :---: | :---: | ---: | ---: | ---: | :---: |
| `0` | `[0.0, 0.1)` | 0 | N/A | N/A | N/A |
| `1` | `[0.1, 0.2)` | 0 | N/A | N/A | N/A |
| `2` | `[0.2, 0.3)` | 348 | `0.2796` | `0.3448` | `[0.2958, 0.3923]` |
| `3` | `[0.3, 0.4)` | 9703 | `0.3694` | `0.4033` | `[0.3939, 0.4136]` |
| `4` | `[0.4, 0.5)` | 42695 | `0.4559` | `0.4752` | `[0.4706, 0.4800]` |
| `5` | `[0.5, 0.6)` | 42695 | `0.5441` | `0.5248` | `[0.5200, 0.5294]` |
| `6` | `[0.6, 0.7)` | 9703 | `0.6306` | `0.5967` | `[0.5864, 0.6061]` |
| `7` | `[0.7, 0.8)` | 348 | `0.7204` | `0.6552` | `[0.6077, 0.7042]` |
| `8` | `[0.8, 0.9)` | 0 | N/A | N/A | N/A |
| `9` | `[0.9, 1.0)` | 0 | N/A | N/A | N/A |

### 4.4 Fútbol `ah` — `GLOBAL::football::ah` (`market_sharp_novig`, ponderación exacta cuartos de línea, `n = 29,658` partidos / `59,316` pares)
- **`ECE`:** `0.0020` (IC 95%: `[0.0001, 0.0080]`, `OBSERVADO`)

| Bin | Rango `[p_min, p_max)` | Pares `(evento, sel)` `n` | Predicción Media | Frecuencia Empírica | IC 95% Bootstrap Empírico |
| :---: | :---: | ---: | ---: | ---: | :---: |
| `0` | `[0.0, 0.1)` | 0 | N/A | N/A | N/A |
| `1` | `[0.1, 0.2)` | 0 | N/A | N/A | N/A |
| `2` | `[0.2, 0.3)` | 3 | `0.2574` | `0.3333` | `[0.0000, 1.0000]` |
| `3` | `[0.3, 0.4)` | 2 | `0.3878` | `0.3333` | `[0.0000, 1.0000]` |
| `4` | `[0.4, 0.5)` | 28800 | `0.4778` | `0.4757` | `[0.4696, 0.4813]` |
| `5` | `[0.5, 0.6)` | 30506 | `0.5210` | `0.5229` | `[0.5177, 0.5287]` |
| `6` | `[0.6, 0.7)` | 2 | `0.6122` | `0.6667` | `[0.0000, 1.0000]` |
| `7` | `[0.7, 0.8)` | 3 | `0.7426` | `0.6667` | `[0.0000, 1.0000]` |
| `8` | `[0.8, 0.9)` | 0 | N/A | N/A | N/A |
| `9` | `[0.9, 1.0)` | 0 | N/A | N/A | N/A |

### 4.5 NFL `moneyline` — `NFL::moneyline` Escalón `model` (`NFL Minkowski`, comparada contra consenso `nflverse` **`sin cierre sharp`**, `n = 3,890` partidos / `7,780` pares)
- **`ECE`:** `0.0167` (IC 95%: `[0.0084, 0.0327]`, `OBSERVADO`)

| Bin | Rango `[p_min, p_max)` | Pares `(evento, sel)` `n` | Predicción Media | Frecuencia Empírica | IC 95% Bootstrap Empírico |
| :---: | :---: | ---: | ---: | ---: | :---: |
| `0` | `[0.0, 0.1)` | 5 | `0.0916` | `0.0000` | `[0.0000, 0.0000]` |
| `1` | `[0.1, 0.2)` | 317 | `0.1671` | `0.1293` | `[0.0939, 0.1656]` |
| `2` | `[0.2, 0.3)` | 804 | `0.2522` | `0.2637` | `[0.2341, 0.2943]` |
| `3` | `[0.3, 0.4)` | 1225 | `0.3532` | `0.3478` | `[0.3226, 0.3722]` |
| `4` | `[0.4, 0.5)` | 1539 | `0.4507` | `0.4269` | `[0.4010, 0.4510]` |
| `5` | `[0.5, 0.6)` | 1539 | `0.5493` | `0.5731` | `[0.5490, 0.5990]` |
| `6` | `[0.6, 0.7)` | 1225 | `0.6468` | `0.6522` | `[0.6278, 0.6774]` |
| `7` | `[0.7, 0.8)` | 804 | `0.7478` | `0.7363` | `[0.7057, 0.7659]` |
| `8` | `[0.8, 0.9)` | 317 | `0.8329` | `0.8707` | `[0.8344, 0.9061]` |
| `9` | `[0.9, 1.0)` | 5 | `0.9084` | `1.0000` | `[1.0000, 1.0000]` |

### 4.6 NFL `moneyline` — Línea de Consenso `nflverse` Desvigorizada (**`sin cierre sharp`**, `n = 3,890` partidos / `7,780` pares)
- **`ECE`:** `0.0094` (IC 95%: `[0.0060, 0.0265]`, `OBSERVADO`)

| Bin | Rango `[p_min, p_max)` | Pares `(evento, sel)` `n` | Predicción Media | Frecuencia Empírica | IC 95% Bootstrap Empírico |
| :---: | :---: | ---: | ---: | ---: | :---: |
| `0` | `[0.0, 0.1)` | 74 | `0.0814` | `0.0676` | `[0.0141, 0.1286]` |
| `1` | `[0.1, 0.2)` | 398 | `0.1602` | `0.1658` | `[0.1315, 0.2038]` |
| `2` | `[0.2, 0.3)` | 981 | `0.2529` | `0.2416` | `[0.2144, 0.2703]` |
| `3` | `[0.3, 0.4)` | 1249 | `0.3513` | `0.3675` | `[0.3416, 0.3932]` |
| `4` | `[0.4, 0.5)` | 1168 | `0.4444` | `0.4461` | `[0.4174, 0.4745]` |
| `5` | `[0.5, 0.6)` | 1208 | `0.5538` | `0.5522` | `[0.5246, 0.5800]` |
| `6` | `[0.6, 0.7)` | 1249 | `0.6487` | `0.6325` | `[0.6068, 0.6584]` |
| `7` | `[0.7, 0.8)` | 981 | `0.7471` | `0.7584` | `[0.7297, 0.7856]` |
| `8` | `[0.8, 0.9)` | 398 | `0.8398` | `0.8342` | `[0.7962, 0.8685]` |
| `9` | `[0.9, 1.0)` | 74 | `0.9186` | `0.9324` | `[0.8714, 0.9859]` |

---

## 5. Tablas Completas por `Liga × Mercado` en `walk_forward_dev` (`93` Segmentos)

### 5.1 Mercado `1x2` — Fútbol 23 Ligas (`17` con apertura y cierre sharp `OBSERVADO`; `6` extra con apertura `DESCONOCIDO` y `model` evaluado frente a cierre sharp Pinnacle `OBSERVADO`)

| Segmento | Fuente c/ Sharp | Evaluada en Dev | Cobertura Sharp Open / Close | `n` | `Log-Loss` (IC 95%) | `Brier` (IC 95%) | `RPS` (IC 95%) | `ECE` (IC 95%) | `ΔLL vs Benchmark` (IC 95%) | Significancia |
| :--- | :---: | :---: | :---: | ---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `ARG::1x2` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `OBSERVADO` | 3005 | `1.0612` `[1.0487, 1.0742]` | `0.6411` `[0.6325, 0.6503]` | `0.2143` `[0.2102, 0.2185]` | `0.0156` `[0.0086, 0.0276]` | `+0.0159` `[+0.0094, +0.0225]` | **significativa** |
| `B1::1x2` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1886 | `0.9825` `[0.9620, 1.0031]` | `0.5845` `[0.5701, 0.5989]` | `0.2022` `[0.1963, 0.2081]` | `0.0051` `[0.0059, 0.0216]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `BRA::1x2` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `OBSERVADO` | 2660 | `1.0166` `[1.0011, 1.0320]` | `0.6088` `[0.5977, 0.6195]` | `0.2051` `[0.2002, 0.2100]` | `0.0085` `[0.0062, 0.0204]` | `+0.0238` `[+0.0163, +0.0316]` | **significativa** |
| `D1::1x2` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 2015 | `0.9716` `[0.9504, 0.9953]` | `0.5770` `[0.5623, 0.5929]` | `0.1974` `[0.1916, 0.2041]` | `0.0075` `[0.0061, 0.0234]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `D2::1x2` | `blend_v3_1` | `blend_v3_1` | `OBSERVADO` / `OBSERVADO` | 2010 | `1.0484` `[1.0335, 1.0626]` | `0.6316` `[0.6209, 0.6419]` | `0.2179` `[0.2130, 0.2228]` | `0.0098` `[0.0052, 0.0230]` | `-0.0016` `[-0.0037, +0.0005]` | **no significativa** |
| `E0::1x2` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 2518 | `0.9502` `[0.9295, 0.9698]` | `0.5617` `[0.5471, 0.5754]` | `0.1953` `[0.1896, 0.2011]` | `0.0092` `[0.0077, 0.0209]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `E1::1x2` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 3668 | `1.0367` `[1.0251, 1.0480]` | `0.6233` `[0.6152, 0.6311]` | `0.2144` `[0.2108, 0.2183]` | `0.0058` `[0.0040, 0.0152]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `F1::1x2` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 2281 | `0.9935` `[0.9750, 1.0128]` | `0.5933` `[0.5804, 0.6069]` | `0.2017` `[0.1968, 0.2074]` | `0.0101` `[0.0067, 0.0223]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `F2::1x2` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 2356 | `1.0468` `[1.0335, 1.0596]` | `0.6296` `[0.6204, 0.6384]` | `0.2133` `[0.2093, 0.2175]` | `0.0061` `[0.0045, 0.0188]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `G1::1x2` | `blend_v3_1` | `blend_v3_1` | `OBSERVADO` / `OBSERVADO` | 1514 | `0.9264` `[0.9009, 0.9515]` | `0.5490` `[0.5307, 0.5661]` | `0.1799` `[0.1729, 0.1872]` | `0.0221` `[0.0146, 0.0365]` | `-0.0007` `[-0.0019, +0.0006]` | **no significativa** |
| `I1::1x2` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 2503 | `0.9601` `[0.9406, 0.9787]` | `0.5698` `[0.5559, 0.5827]` | `0.1891` `[0.1836, 0.1941]` | `0.0079` `[0.0070, 0.0218]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `I2::1x2` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 2442 | `1.0502` `[1.0381, 1.0624]` | `0.6334` `[0.6252, 0.6420]` | `0.2088` `[0.2046, 0.2133]` | `0.0062` `[0.0039, 0.0175]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `JPN::1x2` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `OBSERVADO` | 2299 | `1.0536` `[1.0388, 1.0682]` | `0.6350` `[0.6247, 0.6452]` | `0.2231` `[0.2184, 0.2278]` | `0.0166` `[0.0085, 0.0292]` | `+0.0146` `[+0.0069, +0.0221]` | **significativa** |
| `MEX::1x2` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `OBSERVADO` | 2175 | `1.0219` `[1.0065, 1.0373]` | `0.6131` `[0.6019, 0.6235]` | `0.2096` `[0.2048, 0.2144]` | `0.0107` `[0.0071, 0.0230]` | `+0.0112` `[+0.0043, +0.0182]` | **significativa** |
| `N1::1x2` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1943 | `0.9231` `[0.8980, 0.9473]` | `0.5453` `[0.5278, 0.5622]` | `0.1863` `[0.1802, 0.1928]` | `0.0077` `[0.0069, 0.0239]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `P1::1x2` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 2001 | `0.9229` `[0.8996, 0.9458]` | `0.5443` `[0.5282, 0.5595]` | `0.1844` `[0.1785, 0.1904]` | `0.0138` `[0.0088, 0.0259]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `SC0::1x2` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1457 | `0.9232` `[0.8955, 0.9506]` | `0.5456` `[0.5268, 0.5642]` | `0.1849` `[0.1778, 0.1921]` | `0.0095` `[0.0088, 0.0258]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `SC1::1x2` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1093 | `1.0525` `[1.0304, 1.0722]` | `0.6342` `[0.6185, 0.6481]` | `0.2168` `[0.2101, 0.2229]` | `0.0121` `[0.0094, 0.0314]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `SP1::1x2` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 2494 | `0.9815` `[0.9641, 0.9996]` | `0.5845` `[0.5724, 0.5971]` | `0.1943` `[0.1892, 0.1994]` | `0.0073` `[0.0060, 0.0198]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `SP2::1x2` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 3014 | `1.0441` `[1.0330, 1.0556]` | `0.6292` `[0.6215, 0.6371]` | `0.2082` `[0.2044, 0.2121]` | `0.0093` `[0.0045, 0.0198]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `SWE::1x2` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `OBSERVADO` | 1692 | `1.0055` `[0.9837, 1.0271]` | `0.6009` `[0.5855, 0.6160]` | `0.2091` `[0.2029, 0.2160]` | `0.0109` `[0.0086, 0.0260]` | `+0.0291` `[+0.0198, +0.0384]` | **significativa** |
| `T1::1x2` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 2295 | `0.9897` `[0.9741, 1.0073]` | `0.5895` `[0.5785, 0.6020]` | `0.1997` `[0.1952, 0.2050]` | `0.0139` `[0.0085, 0.0255]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `USA::1x2` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `OBSERVADO` | 3156 | `1.0328` `[1.0183, 1.0473]` | `0.6201` `[0.6098, 0.6304]` | `0.2164` `[0.2116, 0.2208]` | `0.0153` `[0.0082, 0.0259]` | `+0.0180` `[+0.0117, +0.0245]` | **significativa** |

### 5.2 Mercado `totals` — Fútbol Línea `2.5` (`17` con apertura y cierre sharp `OBSERVADO`; `6` extra sin cuotas históricas `DESCONOCIDO` evaluadas en `model` vs `base_rate` causal `OBSERVADO`)

| Segmento | Fuente c/ Sharp | Evaluada en Dev | Cobertura Sharp Open / Close | `n` | `Log-Loss` (IC 95%) | `Brier` (IC 95%) | `RPS` (IC 95%) | `ECE` (IC 95%) | `ΔLL vs Benchmark` (IC 95%) | Significancia |
| :--- | :---: | :---: | :---: | ---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `ARG::totals` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 3012 | `0.6615` `[0.6521, 0.6713]` | `0.4687` `[0.4599, 0.4779]` | `0.2343` `[0.2299, 0.2390]` | `0.0121` `[0.0065, 0.0323]` | `-0.0106` `[-0.0176, -0.0033]` | **significativa** |
| `B1::totals` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1647 | `0.6761` `[0.6682, 0.6845]` | `0.4831` `[0.4754, 0.4912]` | `0.2415` `[0.2377, 0.2456]` | `0.0077` `[0.0042, 0.0356]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `BRA::totals` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 2660 | `0.6792` `[0.6703, 0.6875]` | `0.4860` `[0.4774, 0.4940]` | `0.2430` `[0.2387, 0.2470]` | `0.0209` `[0.0114, 0.0411]` | `-0.0095` `[-0.0167, -0.0033]` | **significativa** |
| `D1::totals` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1664 | `0.6497` `[0.6386, 0.6607]` | `0.4580` `[0.4473, 0.4684]` | `0.2290` `[0.2236, 0.2342]` | `0.0194` `[0.0095, 0.0435]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `D2::totals` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1704 | `0.6742` `[0.6665, 0.6820]` | `0.4813` `[0.4737, 0.4889]` | `0.2406` `[0.2368, 0.2444]` | `0.0172` `[0.0051, 0.0414]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `E0::totals` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 2127 | `0.6709` `[0.6625, 0.6787]` | `0.4782` `[0.4701, 0.4858]` | `0.2391` `[0.2351, 0.2429]` | `0.0110` `[0.0045, 0.0326]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `E1::totals` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 3116 | `0.6833` `[0.6787, 0.6879]` | `0.4903` `[0.4857, 0.4948]` | `0.2451` `[0.2428, 0.2474]` | `0.0060` `[0.0017, 0.0256]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `F1::totals` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1896 | `0.6775` `[0.6704, 0.6847]` | `0.4848` `[0.4779, 0.4918]` | `0.2424` `[0.2390, 0.2459]` | `0.0186` `[0.0064, 0.0414]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `F2::totals` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1979 | `0.6770` `[0.6688, 0.6851]` | `0.4841` `[0.4760, 0.4919]` | `0.2420` `[0.2380, 0.2460]` | `0.0046` `[0.0030, 0.0296]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `G1::totals` | `blend_v3_1` | `blend_v3_1` | `OBSERVADO` / `OBSERVADO` | 1306 | `0.6730` `[0.6633, 0.6822]` | `0.4802` `[0.4707, 0.4892]` | `0.2401` `[0.2353, 0.2446]` | `0.0269` `[0.0070, 0.0536]` | `-0.0001` `[-0.0008, +0.0005]` | **no significativa** |
| `I1::totals` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 2122 | `0.6772` `[0.6699, 0.6842]` | `0.4841` `[0.4769, 0.4909]` | `0.2421` `[0.2385, 0.2455]` | `0.0251` `[0.0084, 0.0470]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `I2::totals` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 2119 | `0.6839` `[0.6782, 0.6899]` | `0.4907` `[0.4851, 0.4967]` | `0.2454` `[0.2426, 0.2484]` | `0.0085` `[0.0025, 0.0306]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `JPN::totals` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 2301 | `0.6857` `[0.6766, 0.6942]` | `0.4923` `[0.4837, 0.5006]` | `0.2462` `[0.2418, 0.2503]` | `0.0317` `[0.0192, 0.0531]` | `-0.0078` `[-0.0166, +0.0011]` | **no significativa** |
| `MEX::totals` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 2187 | `0.6884` `[0.6816, 0.6957]` | `0.4952` `[0.4886, 0.5023]` | `0.2476` `[0.2443, 0.2511]` | `0.0268` `[0.0097, 0.0477]` | `-0.0064` `[-0.0136, +0.0011]` | **no significativa** |
| `N1::totals` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1636 | `0.6604` `[0.6485, 0.6739]` | `0.4687` `[0.4574, 0.4812]` | `0.2343` `[0.2287, 0.2406]` | `0.0211` `[0.0079, 0.0452]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `P1::totals` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1703 | `0.6782` `[0.6700, 0.6861]` | `0.4852` `[0.4773, 0.4929]` | `0.2426` `[0.2386, 0.2465]` | `0.0090` `[0.0035, 0.0337]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `SC0::totals` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1230 | `0.6762` `[0.6656, 0.6866]` | `0.4832` `[0.4728, 0.4933]` | `0.2416` `[0.2364, 0.2466]` | `0.0177` `[0.0050, 0.0465]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `SC1::totals` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 923 | `0.6883` `[0.6814, 0.6950]` | `0.4952` `[0.4884, 0.5018]` | `0.2476` `[0.2442, 0.2509]` | `0.0059` `[0.0027, 0.0401]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `SP1::totals` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 2110 | `0.6685` `[0.6593, 0.6767]` | `0.4756` `[0.4668, 0.4836]` | `0.2378` `[0.2334, 0.2418]` | `0.0174` `[0.0059, 0.0388]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `SP2::totals` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 2573 | `0.6602` `[0.6510, 0.6696]` | `0.4676` `[0.4586, 0.4768]` | `0.2338` `[0.2293, 0.2384]` | `0.0068` `[0.0030, 0.0262]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `SWE::totals` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 1692 | `0.6831` `[0.6740, 0.6921]` | `0.4900` `[0.4812, 0.4988]` | `0.2450` `[0.2406, 0.2494]` | `0.0283` `[0.0092, 0.0511]` | `-0.0094` `[-0.0188, +0.0001]` | **no significativa** |
| `T1::totals` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1990 | `0.6790` `[0.6725, 0.6855]` | `0.4864` `[0.4799, 0.4927]` | `0.2432` `[0.2399, 0.2464]` | `0.0239` `[0.0074, 0.0459]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `USA::totals` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 3157 | `0.6827` `[0.6759, 0.6898]` | `0.4896` `[0.4832, 0.4964]` | `0.2448` `[0.2416, 0.2482]` | `0.0179` `[0.0089, 0.0366]` | `-0.0024` `[-0.0091, +0.0045]` | **no significativa** |

### 5.3 Mercado `btts` — Fútbol Ambos Anotan (`0` cuotas históricas en `odds_snapshots.parquet` -> `DESCONOCIDO`; `23` ligas evaluadas en `model` Dixon-Coles vs `base_rate` causal sobre goles reales `OBSERVADO`)

| Segmento | Fuente c/ Sharp | Evaluada en Dev | Cobertura Sharp Open / Close | `n` | `Log-Loss` (IC 95%) | `Brier` (IC 95%) | `RPS` (IC 95%) | `ECE` (IC 95%) | `ΔLL vs Benchmark` (IC 95%) | Significancia |
| :--- | :---: | :---: | :---: | ---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `ARG::btts` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 3012 | `0.6845` `[0.6786, 0.6906]` | `0.4914` `[0.4856, 0.4974]` | `0.2457` `[0.2428, 0.2487]` | `0.0149` `[0.0040, 0.0338]` | `-0.0062` `[-0.0112, -0.0011]` | **significativa** |
| `B1::btts` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 1892 | `0.6870` `[0.6793, 0.6945]` | `0.4939` `[0.4865, 0.5012]` | `0.2469` `[0.2433, 0.2506]` | `0.0174` `[0.0047, 0.0404]` | `-0.0021` `[-0.0086, +0.0044]` | **no significativa** |
| `BRA::btts` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 2660 | `0.6969` `[0.6916, 0.7023]` | `0.5036` `[0.4984, 0.5089]` | `0.2518` `[0.2492, 0.2544]` | `0.0310` `[0.0140, 0.0504]` | `-0.0012` `[-0.0065, +0.0038]` | **no significativa** |
| `D1::btts` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 2016 | `0.6690` `[0.6595, 0.6788]` | `0.4762` `[0.4670, 0.4856]` | `0.2381` `[0.2335, 0.2428]` | `0.0079` `[0.0040, 0.0301]` | `-0.0062` `[-0.0115, -0.0001]` | **significativa** |
| `D2::btts` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 2016 | `0.6785` `[0.6707, 0.6860]` | `0.4855` `[0.4779, 0.4929]` | `0.2427` `[0.2390, 0.2464]` | `0.0009` `[0.0027, 0.0276]` | `-0.0015` `[-0.0067, +0.0031]` | **no significativa** |
| `E0::btts` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 2518 | `0.6886` `[0.6830, 0.6940]` | `0.4953` `[0.4899, 0.5007]` | `0.2477` `[0.2449, 0.2503]` | `0.0192` `[0.0058, 0.0379]` | `-0.0036` `[-0.0090, +0.0016]` | **no significativa** |
| `E1::btts` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 3671 | `0.6946` `[0.6908, 0.6986]` | `0.5014` `[0.4976, 0.5054]` | `0.2507` `[0.2488, 0.2527]` | `0.0266` `[0.0103, 0.0430]` | `+0.0007` `[-0.0037, +0.0049]` | **no significativa** |
| `F1::btts` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 2284 | `0.6955` `[0.6898, 0.7012]` | `0.5022` `[0.4966, 0.5077]` | `0.2511` `[0.2483, 0.2539]` | `0.0355` `[0.0151, 0.0561]` | `+0.0040` `[-0.0019, +0.0099]` | **no significativa** |
| `F2::btts` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 2368 | `0.6933` `[0.6877, 0.6987]` | `0.5000` `[0.4946, 0.5054]` | `0.2500` `[0.2473, 0.2527]` | `0.0230` `[0.0085, 0.0430]` | `-0.0020` `[-0.0073, +0.0030]` | **no significativa** |
| `G1::btts` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 1583 | `0.6814` `[0.6737, 0.6895]` | `0.4885` `[0.4809, 0.4963]` | `0.2442` `[0.2405, 0.2482]` | `0.0098` `[0.0044, 0.0354]` | `-0.0134` `[-0.0210, -0.0057]` | **significativa** |
| `I1::btts` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 2506 | `0.6873` `[0.6813, 0.6930]` | `0.4942` `[0.4883, 0.4998]` | `0.2471` `[0.2442, 0.2499]` | `0.0207` `[0.0054, 0.0403]` | `-0.0008` `[-0.0069, +0.0052]` | **no significativa** |
| `I2::btts` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 2482 | `0.6985` `[0.6940, 0.7035]` | `0.5052` `[0.5008, 0.5102]` | `0.2526` `[0.2504, 0.2551]` | `0.0440` `[0.0245, 0.0640]` | `+0.0054` `[-0.0000, +0.0112]` | **no significativa** |
| `JPN::btts` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 2301 | `0.6878` `[0.6819, 0.6942]` | `0.4946` `[0.4889, 0.5009]` | `0.2473` `[0.2445, 0.2505]` | `0.0166` `[0.0068, 0.0382]` | `-0.0058` `[-0.0122, +0.0007]` | **no significativa** |
| `MEX::btts` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 2187 | `0.6932` `[0.6878, 0.6983]` | `0.5001` `[0.4947, 0.5051]` | `0.2500` `[0.2474, 0.2525]` | `0.0336` `[0.0125, 0.0541]` | `+0.0014` `[-0.0042, +0.0066]` | **no significativa** |
| `N1::btts` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 1947 | `0.6885` `[0.6811, 0.6964]` | `0.4952` `[0.4881, 0.5029]` | `0.2476` `[0.2440, 0.2514]` | `0.0108` `[0.0046, 0.0354]` | `+0.0007` `[-0.0051, +0.0065]` | **no significativa** |
| `P1::btts` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 2012 | `0.6941` `[0.6886, 0.6998]` | `0.5008` `[0.4955, 0.5065]` | `0.2504` `[0.2477, 0.2532]` | `0.0326` `[0.0133, 0.0538]` | `-0.0007` `[-0.0059, +0.0047]` | **no significativa** |
| `SC0::btts` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 1468 | `0.6926` `[0.6856, 0.6991]` | `0.4994` `[0.4925, 0.5059]` | `0.2497` `[0.2463, 0.2529]` | `0.0255` `[0.0044, 0.0510]` | `-0.0042` `[-0.0108, +0.0025]` | **no significativa** |
| `SC1::btts` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 1104 | `0.6996` `[0.6926, 0.7063]` | `0.5063` `[0.4994, 0.5129]` | `0.2532` `[0.2497, 0.2565]` | `0.0620` `[0.0313, 0.0911]` | `+0.0049` `[-0.0026, +0.0117]` | **no significativa** |
| `SP1::btts` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 2497 | `0.6890` `[0.6833, 0.6944]` | `0.4959` `[0.4903, 0.5012]` | `0.2480` `[0.2452, 0.2506]` | `0.0298` `[0.0140, 0.0519]` | `-0.0043` `[-0.0104, +0.0014]` | **no significativa** |
| `SP2::btts` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 3042 | `0.6901` `[0.6845, 0.6958]` | `0.4969` `[0.4914, 0.5025]` | `0.2485` `[0.2457, 0.2513]` | `0.0253` `[0.0087, 0.0434]` | `-0.0042` `[-0.0093, +0.0010]` | **no significativa** |
| `SWE::btts` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 1692 | `0.6895` `[0.6826, 0.6967]` | `0.4963` `[0.4896, 0.5034]` | `0.2482` `[0.2448, 0.2517]` | `0.0127` `[0.0043, 0.0379]` | `-0.0034` `[-0.0100, +0.0035]` | **no significativa** |
| `T1::btts` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 2331 | `0.6946` `[0.6881, 0.7007]` | `0.5013` `[0.4949, 0.5073]` | `0.2506` `[0.2475, 0.2537]` | `0.0319` `[0.0138, 0.0529]` | `+0.0083` `[+0.0035, +0.0131]` | **significativa** |
| `USA::btts` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 3157 | `0.6765` `[0.6703, 0.6829]` | `0.4835` `[0.4775, 0.4897]` | `0.2418` `[0.2388, 0.2449]` | `0.0060` `[0.0027, 0.0267]` | `-0.0025` `[-0.0080, +0.0031]` | **no significativa** |

### 5.4 Mercado `ah` — Fútbol Hándicap Asiático (`17` con apertura sharp `OBSERVADO` bajo ponderación Bayesiana exacta en cuartos de línea; `6` extra sin cuotas históricas `DESCONOCIDO` evaluadas en línea canónica `-0.5` `OBSERVADO`)

| Segmento | Fuente c/ Sharp | Evaluada en Dev | Cobertura Sharp Open / Close | `n` | `Log-Loss` (IC 95%) | `Brier` (IC 95%) | `RPS` (IC 95%) | `ECE` (IC 95%) | `ΔLL vs Benchmark` (IC 95%) | Significancia |
| :--- | :---: | :---: | :---: | ---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `ARG::ah` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 3012 | `0.6720` `[0.6632, 0.6810]` | `0.4792` `[0.4709, 0.4878]` | `0.2396` `[0.2355, 0.2439]` | `0.0266` `[0.0129, 0.0444]` | `-0.0110` `[-0.0189, -0.0035]` | **significativa** |
| `B1::ah` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1552 | `0.6895` `[0.6870, 0.6920]` | `0.4964` `[0.4938, 0.4989]` | `0.2482` `[0.2469, 0.2494]` | `0.0201` `[0.0015, 0.0456]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `BRA::ah` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 2660 | `0.6613` `[0.6510, 0.6717]` | `0.4691` `[0.4594, 0.4785]` | `0.2345` `[0.2297, 0.2392]` | `0.0157` `[0.0062, 0.0345]` | `-0.0325` `[-0.0421, -0.0226]` | **significativa** |
| `D1::ah` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1627 | `0.6915` `[0.6891, 0.6936]` | `0.4983` `[0.4959, 0.5004]` | `0.2492` `[0.2480, 0.2502]` | `0.0043` `[0.0003, 0.0316]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `D2::ah` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1604 | `0.6917` `[0.6892, 0.6942]` | `0.4986` `[0.4961, 0.5011]` | `0.2493` `[0.2480, 0.2505]` | `0.0139` `[0.0009, 0.0372]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `E0::ah` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 2002 | `0.6916` `[0.6894, 0.6936]` | `0.4985` `[0.4963, 0.5004]` | `0.2492` `[0.2481, 0.2502]` | `0.0035` `[0.0005, 0.0248]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `E1::ah` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 2923 | `0.6911` `[0.6890, 0.6929]` | `0.4979` `[0.4959, 0.4997]` | `0.2490` `[0.2479, 0.2499]` | `0.0038` `[0.0004, 0.0221]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `F1::ah` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1773 | `0.6908` `[0.6885, 0.6930]` | `0.4976` `[0.4954, 0.4999]` | `0.2488` `[0.2477, 0.2499]` | `0.0116` `[0.0006, 0.0352]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `F2::ah` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1789 | `0.6938` `[0.6911, 0.6962]` | `0.5006` `[0.4979, 0.5031]` | `0.2503` `[0.2490, 0.2515]` | `0.0135` `[0.0010, 0.0372]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `G1::ah` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1212 | `0.6922` `[0.6889, 0.6953]` | `0.4991` `[0.4957, 0.5022]` | `0.2495` `[0.2479, 0.2511]` | `0.0041` `[0.0010, 0.0329]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `I1::ah` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1986 | `0.6928` `[0.6907, 0.6949]` | `0.4996` `[0.4975, 0.5017]` | `0.2498` `[0.2488, 0.2509]` | `0.0043` `[0.0007, 0.0258]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `I2::ah` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1939 | `0.6907` `[0.6883, 0.6931]` | `0.4976` `[0.4952, 0.5000]` | `0.2488` `[0.2476, 0.2500]` | `0.0066` `[0.0005, 0.0284]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `JPN::ah` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 2301 | `0.6559` `[0.6446, 0.6672]` | `0.4637` `[0.4532, 0.4742]` | `0.2318` `[0.2266, 0.2371]` | `0.0152` `[0.0067, 0.0358]` | `-0.0213` `[-0.0321, -0.0110]` | **significativa** |
| `MEX::ah` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 2187 | `0.6538` `[0.6421, 0.6653]` | `0.4619` `[0.4509, 0.4726]` | `0.2309` `[0.2255, 0.2363]` | `0.0182` `[0.0082, 0.0391]` | `-0.0351` `[-0.0462, -0.0240]` | **significativa** |
| `N1::ah` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1545 | `0.6904` `[0.6881, 0.6928]` | `0.4973` `[0.4950, 0.4997]` | `0.2486` `[0.2475, 0.2498]` | `0.0129` `[0.0006, 0.0371]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `P1::ah` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1570 | `0.6903` `[0.6875, 0.6930]` | `0.4972` `[0.4944, 0.4999]` | `0.2486` `[0.2472, 0.2499]` | `0.0152` `[0.0008, 0.0427]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `SC0::ah` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1132 | `0.6919` `[0.6890, 0.6948]` | `0.4988` `[0.4959, 0.5017]` | `0.2494` `[0.2479, 0.2508]` | `0.0031` `[0.0005, 0.0346]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `SC1::ah` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 856 | `0.6953` `[0.6920, 0.6989]` | `0.5021` `[0.4989, 0.5057]` | `0.2511` `[0.2494, 0.2529]` | `0.0323` `[0.0030, 0.0665]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `SP1::ah` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1947 | `0.6911` `[0.6888, 0.6935]` | `0.4980` `[0.4957, 0.5003]` | `0.2490` `[0.2478, 0.2502]` | `0.0105` `[0.0007, 0.0320]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `SP2::ah` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 2343 | `0.6908` `[0.6884, 0.6934]` | `0.4977` `[0.4953, 0.5002]` | `0.2488` `[0.2476, 0.2501]` | `0.0003` `[0.0003, 0.0236]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `SWE::ah` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 1692 | `0.6313` `[0.6150, 0.6467]` | `0.4409` `[0.4262, 0.4553]` | `0.2204` `[0.2131, 0.2276]` | `0.0218` `[0.0100, 0.0460]` | `-0.0550` `[-0.0719, -0.0402]` | **significativa** |
| `T1::ah` | `market_sharp_novig` | `market_sharp_novig` | `OBSERVADO` / `OBSERVADO` | 1858 | `0.6940` `[0.6918, 0.6963]` | `0.5009` `[0.4986, 0.5031]` | `0.2504` `[0.2493, 0.2516]` | `0.0205` `[0.0016, 0.0434]` | `+0.0000` `[+0.0000, +0.0000]` | **no significativa** |
| `USA::ah` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `DESCONOCIDO` | 3157 | `0.6838` `[0.6758, 0.6920]` | `0.4904` `[0.4830, 0.4983]` | `0.2452` `[0.2415, 0.2491]` | `0.0309` `[0.0164, 0.0485]` | `-0.0101` `[-0.0182, -0.0016]` | **significativa** |

### 5.5 Mercado `moneyline` — NFL Ganador Directo (comparado contra línea de consenso de `nflverse` con etiqueta explícita **`sin cierre sharp`**)

| Segmento | Fuente c/ Sharp | Evaluada en Dev | Cobertura Sharp Open / Close | `n` | `Log-Loss` (IC 95%) | `Brier` (IC 95%) | `RPS` (IC 95%) | `ECE` (IC 95%) | `ΔLL vs Benchmark` (IC 95%) | Significancia |
| :--- | :---: | :---: | :---: | ---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `NFL::moneyline` | `market_sharp_novig` | `model` | `DESCONOCIDO` / `sin cierre sharp` | 3890 | `0.6244` `[0.6141, 0.6346]` | `0.4353` `[0.4262, 0.4448]` | `0.2176` `[0.2131, 0.2224]` | `0.0167` `[0.0084, 0.0327]` | `+0.0153` `[+0.0098, +0.0210]` | **significativa** |

---

## 6. Conclusiones Operativas para `MatchOutlook` (`B1`) y Olas Posteriores

1. **Consumo directo en `MatchOutlook` (`OBSERVADO`):** `src/data/prediction/outlook_calibration_v3_2.json` cumple íntegramente `CONTRACT_OUTLOOK.md` §3 con paridad exacta SHA-256 frente a `services/models/artifacts/outlook_calibration_v3_2.json`. Para cualquier selección con probabilidad `p`, `B1` consulta `segments["<LIGA>::<mercado>"].reliability_bins[min(9, floor(10 * p))]` (con fallback garantizado a `GLOBAL::<sport>::<market>`).
2. **Superioridad de las cuotas sharp sin margen (`OBSERVADO`):** donde existen aperturas sharp reales (`pinnacle`/`smarkets`), `market_sharp_novig` alcanza `ECE` entre `0.0020` y `0.0033` globalmente, superando de manera consistente al motor deportivo puro (`ECE` `0.0062` en `1x2`, `0.0175` en `totals`, `0.0403` en `ah`). Solo `D2::1x2`, `G1::1x2` y `G1::totals` superan tanto con peso congelado como causalmente walk-forward a la apertura sharp, aunque con magnitud modesta (`no significativa`).
3. **Brecha pendiente en NFL y BTTS (`INFERIDO` / `DESCONOCIDO`):** la calibración sharp de `NFL::moneyline` permanece **`sin cierre sharp`** histórico (`DESCONOCIDO` para Pinnacle/Smarkets hasta que `B6` consolide el corpus prospectivo `>= 64` partidos) y `btts` carece de cuotas históricas en `odds_snapshots.parquet` (`DESCONOCIDO`), quedando honestamente documentado sobre el escalón `model` sin fabricar precios.
