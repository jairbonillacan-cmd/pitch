# A29 · Fútbol con XI Confirmado en `T-60m` — Instrumentación Legal y Experimento `walk_forward_dev` (`EXP_V32_xi`)

- **Agente:** `B7` (`b7-xi`, Ola 3 de `PREDLAB-V3.2`)
- **Fecha UTC:** `2026-11-12T17:29:00Z` (`OBSERVADO`)
- **Rama / Commit base:** `prediction-lab` @ `19453fb` (`C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab`, `OBSERVADO`)
- **Partición evaluada:** Exclusivamente `walk_forward_dev` (`ts_event_start < 2025-02-02T17:30:00Z`; `holdout_sealed_untouched: true`, `unlock_holdout: false`, `OBSERVADO`)
- **Decisión de producción:** **`production_activated: false`** (`0/60` segmentos habilitados en `production_segments_v3_1.json`, `OBSERVADO`)
- **Veredicto sobre la hipótesis causal en `T-60m`:** **`HIPÓTESIS NO PROBADA`** (`DESCONOCIDO` empíricamente por `0/52,746` partidos históricos con `ts_xi_published` al segundo y `0/52,746` series multi-tick pre-2025-02-02; instrumentación contractual y colector legal listos para captura prospectiva).

---

## 0. Comandos Reproducibles

```powershell
Set-Location "C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab"

# 1. Colector legal T-60m en modo dry-run y ciclo único (sin evasión anti-bot)
.\research\prediction-lab\.venv\Scripts\python.exe research/prediction-lab/experiments/EXP_V32_xi/xi_collector.py --dry-run
.\research\prediction-lab\.venv\Scripts\python.exe research/prediction-lab/experiments/EXP_V32_xi/xi_collector.py --once --now-utc "2026-11-12T17:00:00Z"

# 2. Experimento offline walk_forward_dev (< 2025-02-02T17:30:00Z) + estudio de sensibilidad
.\research\prediction-lab\.venv\Scripts\python.exe research/prediction-lab/experiments/EXP_V32_xi/run_exp_v32_xi.py

# 3. Suite completa de pruebas (paridad TS↔Python < 1e-12, anti-fuga 2 min, fuentes legales y regresión global)
.\research\prediction-lab\.venv\Scripts\python.exe -m pytest research/prediction-lab/experiments/EXP_V32_xi services/models -v
```

---

## 1. Gobernanza, No-Colisión y Congelamiento `v3.1` (`OBSERVADO`)

1. **Artefactos `v3.1` y motor TS intactos en modo solo lectura (`OBSERVADO`):**
   - `src/data/prediction/production_segments_v3_1.json`: `0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc` (`0/60` segmentos con `production_enabled: true`).
   - `src/data/prediction/blend_weights_v3_1.json`: `b29d7a451f6011126997c122778b42ad3239c78337d17c5fa78d550f5c92739b`.
   - `src/data/prediction/pick_policy_v3_1.json`: `2359c8f8822ea394a380202c04e0bcd010d1a3fae7c5c25b8c11ebe810bfb7d1`.
   - `src/data/prediction/stale_lines_config.json`: `8bcb9c7be93270cde0cac2d58bc19f0381184dd2e769f358dd28334db2a05eac`.
   - `src/domain/prediction/engine.ts`: `9270125c49e81adf57e90c76db07eb95f53ab35a5051e49265b35b80ed0553bc`.
2. **Aislamiento total del `holdout_sealed` (`OBSERVADO`):**
   - `run_exp_v32_xi.py` aplica filtro pushdown PyArrow `("ts_event_start", "<", 2025-02-02T17:30:00Z)` al leer `odds_snapshots.parquet`, bloquea cualquier apertura con `enforce_walk_forward_dev_only` (`HoldoutSealedError`) y verifica `assert_no_holdout_events` en cada tabla intermedia.
3. **No-colisión con `B9` (`OBSERVADO`):**
   - `services/models/artifacts/holdout_trial_registry.jsonl` no es abierto para escritura (`PermissionError` explícito en `register_xi_trial` si se intenta apuntar a la ruta compartida). Los `4` ensayos de `EXP_V32_xi` quedan registrados en `research/prediction-lab/experiments/EXP_V32_xi/trial_registry_xi.jsonl` con `eval_split = "walk_forward_dev"`, `unlock_holdout = false` y `production_activated = false`.
4. **Cero `stake` o `kelly` en artefactos (`OBSERVADO`):**
   - Verificado recursivamente mediante `assert_no_public_stake_fields` sobre `exp_v32_xi_results.json`.

---

## 2. Instrumentación del Contrato `ts_xi_published` y Auditoría Legal (`OBSERVADO`)

### 2.1 Contrato `CONTRACT_XI_PUBLISHED.md` y Colector `xi_collector.py`
- **Esquema JSONL append-only (`ConfirmedXIRecord`, 12 campos obligatorios):** `event_id` (`ws:football:<league>:<YYYYMMDD>:<home_slug>:<away_slug>`), `league`, `kickoff_utc`, `ts_xi_published`, `ts_captured`, `lead_minutes_to_kickoff`, `home_starting_xi` (`11` titulares únicos), `away_starting_xi` (`11` titulares únicos), `home_missing_key_starters`, `away_missing_key_starters`, `source` y `raw_sha256` (`[0-9a-f]{64}`). Deduplicación idempotente por `(event_id, source, raw_sha256)` y rechazo de contradicciones jugador titular $\cap$ ausente.
- **Guardia anti-fuga dura (`XILeakageError`):**
  $$\texttt{ts\_xi\_published} \;\le\; \texttt{ts\_captured} \;\le\; \texttt{ts\_decision} - 2.0\text{ min} \;<\; \texttt{kickoff\_utc}$$
  más llenado diferido en mercado multi-tick $\texttt{ts\_fill} \ge \texttt{ts\_decision} + 2.0\text{ min}$ y $\texttt{ts\_fill} \le \texttt{kickoff\_utc}$ (`resolve_xi_delayed_execution_tick`), ignorando todo tick intermedio en $(\texttt{ts\_decision}, \texttt{ts\_decision} + 2.0\text{ min})$.
- **Prohibición de fabricar `ts_xi_published`:** cuando un proveedor oficial (`api_football`) entrega `startXI` sin campo `published_at` nativo, `parse_api_football_lineups_payload` rechaza lecturas en frío (`XILeakageError`) y solo acepta `ts_xi_published = ts_captured` (`transition_poll_upper_bound`) si consta un sondeo previo vacío dentro de la ventana de cadencia (`<= 4.19 min`).
- **Cadencia acoplada a `stale_lines_config.json` (`OBSERVADO`):** régimen `closing_decision_window_t_minus_60m` con intervalo máximo recomendado de **`3.6858 min` (`221.15 s`)** e intervalo programado `0.92x` de **`203.46 s` (`3.39 min`)** en la ventana `[T-75m, T-4m]`.

### 2.2 Tabla de Auditoría Legal de Fuentes de XI (`OBSERVADO`, `2026-11-12`, cero evasión anti-bot)

Pruebas realizadas con `urllib.request` estándar (`User-Agent` transparente de auditoría, sin suplantación ni evasión):

| `source_id` | Proveedor / Endpoint | Evidencia Técnica y Legal (`OBSERVADO`) | Credencial | Estado Legal |
| :--- | :--- | :--- | :--- | :--- |
| `api_football` | `v3.football.api-sports.io/fixtures/lineups` | `HTTP 200` JSON limpio (`cf-mitigated: ""`), API comercial documentada; cubre Liga MX (`262`), Top-5 y UCL con `startXI` 11v11. | `API_FOOTBALL_KEY` | `api_only` |
| `football_data_org` | `api.football-data.org/v4/matches/{id}` | `HTTP 200` en `/v4/competitions`; `robots.txt` permite `User-agent: *` (solo restringe `dotbot`); API REST v4 oficial. | `FOOTBALL_DATA_API_KEY` | `api_only` |
| `espn_site_api` | `site.api.espn.com/.../soccer/.../summary` | `HTTP 403 Access Denied` (`AkamaiGHost`) ante UA transparente; Disney Terms of Use (§2.B.x) prohíben bots, scripts y web scraping. | Licencia ESPN | `blocked_pending_owner_decision` |
| `sofascore` | `api.sofascore.com/api/v1/event/{id}/lineups` | `HTTP 403 Forbidden` (`Varnish`) sin navegador instrumentado; contraviene términos de uso. | Licencia B2B | `blocked_pending_owner_decision` |
| `fotmob` | `www.fotmob.com/api/matchDetails` | `robots.txt` (`HTTP 200`) declara `User-agent: * / Disallow: /api/*` y requiere cabecera anti-bot `x-mas`. | Acuerdo escrito | `blocked_pending_owner_decision` |
| `flashscore` | `www.flashscore.com` | `robots.txt` (`HTTP 200`) declara `Disallow: /live/`, `/scheduled/`, `/finished/`, `/draw/` y ToS prohíben scraping. | Feed Livesport | `blocked_pending_owner_decision` |
| `rotowire_web` | `www.rotowire.com/soccer/lineups.php` | `termsandconditions.php` (`HTTP 200`, Art. VI) prohíbe web scraping/bots sin contrato `/partner/`, y el HTML carece de `ts_xi_published` al segundo. | Contrato `/partner/` | `blocked_pending_owner_decision` |

- **Estado operativo hoy (`OBSERVADO`):** sin `API_FOOTBALL_KEY` ni `FOOTBALL_DATA_API_KEY` en el entorno actual, `xi_collector.py --once` finaliza con código `0`, `status = "idle_no_active_legal_credentials"`, `records_written = 0` y `fabricated_records = 0`.

---

## 3. Auditoría de Cobertura Histórica Local en `walk_forward_dev` (`OBSERVADO`)

| Fuente local inspeccionada | Alcance temporal | Registros `< 2025-02-02T17:30:00Z` con XI / `ts_xi_published` | Estado Epistémico |
| :--- | :--- | :---: | :---: |
| `research/prediction-lab/data/processed/matches.parquet` (`130` cols) | `2000–2026` (`52,746` eval dev `2018–2025`) | **`0 / 52,746`** (`0` columnas de XI o ausencias) | `OBSERVADO` |
| `research/prediction-lab/data/processed/features.parquet` | `2000–2026` | **`0 / 52,746`** (`0` columnas de XI o lesiones) | `OBSERVADO` |
| `data/history/*.jsonl` (`18` campos) | Histórico resultados | **`0`** (solo marcador y calendario) | `OBSERVADO` |
| `research/prediction-lab/data/processed/odds_snapshots.parquet` | `walk_forward_dev` fútbol `1x2` | `52,746` eventos **`100%` `historical_fd`** (`open`/`close` 2 puntos); **`0`** eventos `scraped_ws` multi-tick en `T-60m` | `OBSERVADO` |
| `../web-scraping/data/normalized/roster_availability.json` (`5,908` filas) | `2026-11-09T18:49:13Z` .. `2026-11-10T16:00:15Z` | **`0 / 5,908`** previos al corte `2025-02-02T17:30:00Z` (`100%` post-holdout prospectivo) | `OBSERVADO` |
| Snapshots `understat` / `fbref` / `opta` / `statiskicks` en `../web-scraping` | Agregados anuales de jugadores | **`0`** alineaciones partido a partido ni `ts_xi_published` (usar acumulados de temporada introduciría fuga post-partido) | `OBSERVADO` |

**Conclusión de datos (`OBSERVADO` / `DESCONOCIDO`):** La cobertura histórica real de alineaciones confirmadas con `ts_xi_published` en `walk_forward_dev` es exactamente **`0 / 52,746` (`0.00%`, `OBSERVADO`)**. Conforme a la Regla Rectora #4, no se fabrican alineaciones ni timestamps retrospectivos; el efecto causal real en `T-60m` permanece **`DESCONOCIDO`** hasta acumular captura prospectiva legal.

---

## 4. Paridad Python ↔ TypeScript (`< 1e-12`) y Propiedades Matemáticas (`OBSERVADO`)

1. **Paridad cruzada Python ↔ TypeScript invocando `src/domain/prediction/engine.ts` vía `npx vite-node` (`test_exp_v32_xi.py::test_ts_python_parity_under_1e12`):**
   - `computeLineupAvailabilityDelta` (`44` contextos cubriendo bordes `clip_abs = ±0.35`, `missing_market_value_ratio_max = 0.60`, `max_effective_absences_per_team = 8.0`, `effective_absences_diff_clip = 6.0`, `log_squad_value_ratio_clip = 2.0`, pesos RotoWire vs Transfermarkt, sancionados, nulos y `enabled = false`): **`max |Δ| < 1e-12`** (`OBSERVADO`).
   - `applyAvailabilityDeltaToProbs` (`26` vectores en el símplex `1X2`): **`max |Δ| < 1e-12`** (`OBSERVADO`).
   - `predictMotorA` y `predictMotorAWithAvailability` sobre `25` vectores reales de `features.parquet` en `walk_forward_dev` (incluyendo imputación de `null` por mediana y codificación `div_onehot`): **`max |Δ| < 1e-12`** (`OBSERVADO`).
2. **Propiedades matemáticas verificadas sobre los `52,659` partidos de `walk_forward_dev` pareados con cierre `Pinnacle` (`OBSERVADO`):**
   - **No-degradación exacta en `delta = 0`:** $\max |p_{\text{xi}}(0) - p_{\text{base}}| = \mathbf{0.0}$ (`0.000000e+00`).
   - **Conservación del símplex en saturación `|delta| = 0.35`:** $\max |\sum_k p_k - 1| = \mathbf{3.33 \times 10^{-16}}$.
   - **Invariancia exacta del log-odds ratio local/visitante:** $\max |(\ln(p_H'/p_A') - \ln(p_H/p_A)) - \delta| = \mathbf{9.99 \times 10^{-16}}$.
   - **Monotonía estricta y cota máxima de probabilidad:** `strict_monotonicity_home_and_away = true`, con desplazamiento máximo empírico $\max |\Delta p| = \mathbf{0.073133} \le \tanh(0.35/4) = 0.087277$.

---

## 5. Evaluación en `walk_forward_dev` (`< 2025-02-02T17:30:00Z`, Bootstrap `mulberry32`, `1,000` remuestreos, semilla `20261111`)

Universo evaluado: **`52,746`** partidos de fútbol walk-forward out-of-fold (`2018–2025` pre-corte), de los cuales **`52,659` (`99.835%`)** cuentan con línea de cierre sharp sin margen de `Pinnacle` (`historical_fd`, Power de-vig). Retraso de ejecución: `execution_delay = 2.0 min` (`historical_delay_alpha = 0.05` sobre apertura/cierre de la misma casa ejecutable, jamás apostando a `close`).

### 5.1 Calibración Probabilística (`LL` y `Brier` sobre `52,659` partidos pareados con cierre `Pinnacle`)

| Escenario (`trial_registry_xi.jsonl`) | `provenance` | Estado Epistémico | `LL_base` (`Motor A`) | `LL_xi` | `LL_Pinnacle_close` | `ΔLL (xi - base)` [IC 95% `mulberry32`] | Sig. (`xi - base`) | `ΔLL (xi - Pinnacle_close)` [IC 95% `mulberry32`] | Sig. (`xi - close`) | `ΔBrier (xi - base)` [IC 95%] |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- | :---: | :--- | :---: | :--- |
| **1. Cobertura real local (`delta = 0` en `0/52,746` con XI)** | `"observed"` | `OBSERVADO` | `1.012012` | `1.012012` | `0.996804` | **`0.000000`** `[0.000000, 0.000000]` | **no significativa** | **`+0.015208`** `[+0.013595, +0.016700]` | significativa | **`0.000000`** `[0.000000, 0.000000]` (**no significativa**) |
| **2. Ruido estático no informativo (`N(0, 0.12²)` truncado a `±0.35`)** | `"synthetic_sensitivity"` | `INFERIDO` | `1.012012` | `1.013112` | `0.996804` | **`+0.001100`** `[+0.000705, +0.001494]` | significativa (empeora) | **`+0.016308`** `[+0.014813, +0.018025]` | significativa | **`+0.000722`** `[+0.000456, +0.000992]` (significativa) |
| **3. Estrés adversarial en cota (`\|delta\| = 0.35` opuesto)** | `"synthetic_sensitivity"` | `INFERIDO` | `1.012012` | `1.018329` | `0.996804` | **`+0.006317`** `[+0.005199, +0.007529]` | significativa (empeora) | **`+0.021525`** `[+0.019688, +0.023160]` | significativa | **`+0.004480`** `[+0.003675, +0.005310]` (significativa) |
| **4. Techo oráculo no-causal (`open -> close` Pinnacle en `[-0.35, +0.35]`)** | `"synthetic_sensitivity"` | `INFERIDO` | `1.012012` | `1.010710` | `0.996804` | **`-0.001302`** `[-0.001783, -0.000784]` | significativa (techo oráculo) | **`+0.013906`** `[+0.012432, +0.015323]` | significativa (sigue peor que cierre) | **`-0.000881`** `[-0.001202, -0.000560]` (significativa) |

### 5.2 Métricas Económicas Planas por Unidad (Cero `stake`/`kelly`, `alpha = 0.05` / `delay = 2.0 min`)

- **Bajo compuerta congelada `v3.1` (`blend_weights_v3_1.json`: solo `D2::1x2` y `G1::1x2` habilitados con encogimiento hacia mercado y umbral `EV >= 3.5%`):**
  - Tanto `Motor A` base como `Motor A + XI` emiten **`0` señales** en los 4 escenarios (`CLV% = null [0.0, 0.0]`, **`no significativa`**; `ROI unitario = 0.00% [0.0, 0.0]`, **`no significativa`**; `OBSERVADO` en corrida #1, `INFERIDO` en #2–#4). Esto confirma que la política congelada `v3.1` protege el capital frente a perturbaciones de `Motor A` no ancladas en divergencia sharp vs recreativa.
- **Señal directa `Motor A` sin ancla sharp (`EV_open >= 5.0%` contra apertura ejecutable con fill `alpha = 0.05`):**

| Escenario | `provenance` | Señales (`n`) | `CLV%` medio [IC 95% `mulberry32`] | `CLV_prob` medio [IC 95%] | `% CLV > 0` | Retorno plano por unidad (`%`) [IC 95%] | `MaxDD` plano (u) |
| :--- | :---: | :---: | :--- | :--- | :---: | :--- | :---: |
| **1. Observado (`delta = 0`, igual a `Motor A` base)** | `"observed"` | `20,705` | **`-4.31%`** `[-4.45%, -4.18%]` (significativa) | **`-1.28 pp`** `[-1.32, -1.24]` (significativa) | `29.25%` | **`-5.59%`** `[-7.62%, -3.49%]` (significativa) | `1,198.07` |
| **2. Ruido estático (`σ_δ = 0.12`)** | `"synthetic_sensitivity"` | `21,403` | **`-4.45%`** `[-4.57%, -4.32%]` (significativa) | **`-1.33 pp`** `[-1.36, -1.29]` (significativa) | `28.85%` | **`-5.57%`** `[-7.76%, -3.43%]` (significativa) | `1,264.15` |
| **3. Estrés adversarial (`\|delta\| = 0.35`)** | `"synthetic_sensitivity"` | `26,653` | **`-6.24%`** `[-6.37%, -6.10%]` (significativa) | **`-1.45 pp`** `[-1.48, -1.42]` (significativa) | `25.67%` | **`-6.61%`** `[-8.63%, -4.65%]` (significativa) | `1,850.48` |
| **4. Techo oráculo (`open -> close` Pinnacle)** | `"synthetic_sensitivity"` | `22,839` | **`-0.86%`** `[-0.99%, -0.75%]` (significativa) | **`-0.16 pp`** `[-0.20, -0.13]` (significativa) | `43.56%` | **`-2.16%`** `[-4.19%, -0.27%]` (significativa) | `549.87` |

### 5.3 Hallazgos Estructurales Clave (`OBSERVADO` + `INFERIDO`)
1. **No-degradación garantizada ante ausencia de datos (`OBSERVADO`):** Con `0` capturas históricas de XI pre-holdout, `predictMotorAWithAvailability` reduce idénticamente a `predictMotorA` (`ΔLL = 0.000000 [0.000000, 0.000000]`, **`no significativa`**).
2. **Penalización por ruido de bajas estáticas o ya descontadas (`INFERIDO`):** Inyectar conteos ruidosos de lesionados sin conocer qué titulares entran efectivamente al XI ni cuándo reaccionó el mercado degrada `log-loss` en **`+0.001100` nats** (`[+0.000705, +0.001494]`) y empeora `CLV%` de `-4.31%` a `-4.45%`.
3. **Insuficiencia estructural de `Motor A + delta` sin ancla sharp en `T-60m` (`INFERIDO`):** Incluso bajo el **techo oráculo no-causal** (escenario #4, que proyecta el `100%` del movimiento direccional `open -> close` de `Pinnacle` sobre `delta ∈ [-0.35, +0.35]`), la mejora máxima sobre `Motor A` es de **`-0.001302` nats** (`8.56%` de la brecha de `+0.015208` nats frente al cierre sharp), dejando aún `ΔLL (xi - Pinnacle_close) = +0.013906 [+0.012432, +0.015323]` y `CLV% = -0.86%`. Por tanto, el ajuste de XI confirmado **no puede usarse jamás como generador autónomo de picks desde `Motor A` puro**, sino únicamente como confirmación direccional acoplada a precios sharp multi-tick (`<= 3.69 min`) frente a casas recreativas rezagadas en `[T-60m, T-45m]`.

---

## 6. Estado de Activación y Requisitos de Desbloqueo Prospectivo (`v4.0`)

- **`production_activated`: `false`** (`production_enabled` permanece en `0/60`).
- **Requisitos obligatorios antes de cualquier re-evaluación causal para producción:**
  1. Proveer credencial legal activa (`API_FOOTBALL_KEY` y/o `FOOTBALL_DATA_API_KEY` para XI en `xi_collector.py`, junto con `THE_ODDS_API_KEY` / `BETFAIR_APP_KEY` en `cadence_scheduler.py` de `B3`).
  2. Acumular prospectivamente `>= 500` partidos con registro validado en `xi_snapshots.jsonl` cumpliendo `ts_xi_published <= ts_captured <= ts_decision - 2.0 min < kickoff_utc` y serie de cuotas sincronizada cada `<= 3.69 min` con fill real en `>= ts_decision + 2.0 min`.
  3. Demostrar `ΔLL < 0` y límite inferior del IC 95% (`mulberry32`, `1,000` réplicas) de `CLV% > 0` sobre un nuevo conjunto de validación prospectivo fresco.
