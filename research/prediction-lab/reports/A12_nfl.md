# A12 — Expansión a la NFL: dataset, motor propio y comparación con el mercado

**Agente:** A12 Expansion Researcher (NFL) · **Informe consolidado por el orquestador** a partir del
código y los artefactos que A12 dejó en `models/nfl/` y `data/nfl/` (A12 no llegó a redactar su
informe; el orquestador ejecutó su `run_eval.py` y verificó las cifras).
**Fecha:** 2026-11-09 · **Semilla:** 20261109 · **Commit base:** `2895324`.
**Fuente:** `https://github.com/nflverse/nfldata/raw/master/data/games.csv` — **CC BY 4.0**
(atribución a nflverse; verificado por el orquestador, HTTP 200, 2.189.031 bytes).

---

## 1. Resumen ejecutivo

| Sistema (sin cuotas) | val 2010–2019 (n=2.560) | test 2020–2025 (n=1.615) | global 2010–2025 (n=4.175) |
|---|---:|---:|---:|
| `base_freq` (frecuencia H/A/T) | 0,70376 | 0,71191 | 0,70691 |
| `logit_elo` (solo Elo) | 0,64917 | 0,66162 | 0,65399 |
| **`logit` (Elo + forma + descanso + contexto)** | **0,64503** | **0,65906** | **0,65045** |
| `hgb` (HistGradientBoosting) | 0,72681 | 0,72144 | 0,72473 |
| `blend` (50/50 logit+mercado) | 0,65901 | 0,67270 | 0,66431 |
| `market_prop` (de-vig proporcional) | 0,63000 | 0,62687 | 0,62879 |
| `market_power` (de-vig power) | 0,62979 | 0,62655 | 0,62854 |

- El modelo deportivo supera con claridad al baseline (**−0,053** de log-loss en test) y llega a
  **0,659** en test, pero **el mercado le gana por +0,032** [0,0262; 0,0382] (bootstrap pareado,
  1.615 partidos, 100 % de remuestras). Es el mismo patrón que en fútbol.
- HGB es **mucho peor** que la logística en NFL (−0,062 frente a `logit` en test): con 17 features y
  ~7.000 partidos, los árboles sobreajustan y las probabilidades quedan peor calibradas
  (ECE 0,0752 vs 0,0166).
- El blend con el mercado **tampoco aporta**: pierde +0,046 frente al mercado puro.
- `power` y `proporcional` son indistinguibles en NFL (−0,0003 [−0,0014; +0,0007]);

## 2. Datos y licencia

- Crudo: 7.548 filas (1999–2026), 46 columnas, `sha256 60b85712…a7f7` (`data/nfl/raw/manifest.json`).
- Procesado: **7.102 partidos** con resultado (`data/nfl/processed/nfl_games.parquet`, 44 columnas).
  Tipos de partido: REG 7.239, WC 120, DIV 108, CON 54, SB 27; 137 filas sin marcador (futuras).
- Resultados: **H 3.972, A 3.114, T 16** (empates = 0,23 %). Los empates son tan raros que el
  problema práctico es binario; se reporta además el log-loss de 2 vías sin empates.
- Cobertura de moneylines: 0 % hasta 2005, 72–100 % en 2006–2009, **100 % desde 2010**. El margen
  mediano (overround) de las moneylines es **2,47 %**, coherente con un mercado muy eficiente.
- `spread_line` positivo = local favorito (verificado: 67,5 % de victorias del favorito vs 34,9 %
  del underdog).

**Licencia:** nflverse publica bajo **CC BY 4.0**, que permite uso comercial con atribución. Es la
fuente multi-deporte con licencia más limpia del inventario de A03 (frente a football-data, sin
licencia, y CFBD, "all rights reserved").

## 3. Features causales (sin leakage)

`models/nfl/features.py` construye **63 columnas** para **7.015 partidos**. La regla es más estricta
que un `.shift(1)`: se recorre el calendario por `gameday` y solo se usa información de partidos con
**fecha estrictamente anterior**; todos los partidos de una misma fecha se predicen con el estado
previo a esa fecha (no se informan entre sí).

| Bloque | Variables |
|---|---|
| Elo | `elo_home_pre`, `elo_away_pre`, `elo_diff`, `elo_home_win_prob` (K=20, HFA=55, MOV logarítmico) |
| Descanso | `rest_home`, `rest_away`, `rest_diff` |
| Forma (últimos 5) | `f5_win_*`, `f5_pf_*`, `f5_pa_*`, `f5_diff_*`, `f5_diff_delta` |
| Contexto | `week`, `div_game`, `is_indoor`, `neutral_site`, `surface`, `n_prior_*` |

La lista de features no contiene `home_score`, `away_score` ni `result` (verificado por el
orquestador). El dataset incluye esas columnas solo como target de evaluación.

## 4. Protocolo de evaluación

- **VAL 2010–2019** para elegir `K`, `HFA` y la regularización `C` (búsqueda en
  `models/nfl/artifacts/sensitivity.json`). Configuración congelada: **K=20, HFA=55, C=0,003**.
- **TEST 2020–2025** no se usa para elegir.
- Walk-forward por temporada: para cada temporada se entrena con todos los partidos anteriores
  (desde 1999) y se predice esa temporada.
- Métricas: log-loss, Brier multiclase, RPS con orden **H < T < A** (definido explícitamente; el
  empate es la clase intermedia), accuracy, balanced accuracy, ECE y log-loss de 2 vías sin empates.
- Comparaciones pareadas con `eval.compare.paired_bootstrap_delta` (bloques = temporada, B=2.000),
  igual que en fútbol.

## 5. Comparación con el mercado

| Comparación (test 2020–2025) | n | Δlog-loss | IC95 % | frac Δ>0 |
|---|---:|---:|---|---:|
| `logit` vs `market_prop` | 1.615 | +0,03219 | [0,02616; 0,03815] | 1,000 |
| `logit` vs `market_power` | 1.615 | +0,03251 | [0,02571; 0,03922] | 1,000 |
| `blend` vs `market_prop` | 1.615 | +0,04584 | [0,03370; 0,05754] | 1,000 |
| `logit` vs `base_freq` | 1.615 | −0,05285 | [−0,06517; −0,04259] | 0,000 |
| `logit` vs `hgb` | 1.615 | −0,06238 | [−0,08593; −0,03868] | 0,000 |

Δ = pérdida(A) − pérdida(B); negativo ⇒ A mejor. El mercado gana en **las 16 temporadas** y en
todos los subconjuntos reportados. La conclusión de fútbol se replica en NFL: **la información
manda, no el algoritmo**.

## 6. Limitaciones

1. **Empates:** 16 en 7.102 partidos. El modelo de 3 clases apenas puede aprenderlos; se reporta el
   log-loss de 2 vías (sin empates) como métrica complementaria. Cualquier uso de la clase "T" debe
   tratarse con cautela.
2. **Moneylines:** solo desde 2006; la comparación con el mercado se restringe a 2010+.
3. **Features:** no se usaron EPA, DVOA, lesiones ni alineaciones; nflverse las ofrece, pero
   quedaron fuera del alcance del ciclo. El límite del motor deportivo (0,659) probablemente baje
   con EPA/DVOA; el del mercado es más difícil.
4. **HGB** se incluyó como contraste y resultó peor; no se recomienda en NFL.
5. No se modelaron spreads ni totales; solo 1X2 (H/A/T).

## 7. Reutilización y propuesta de integración

**Se reutiliza del laboratorio de fútbol:** `eval/metrics.py`, `eval/compare.py`, el esquema de
particiones walk-forward, la semilla y la disciplina de congelación pre-test. **No se reutiliza**
el modelo: NFL tiene empates casi nulos, descanso semanal, calendario de 18 semanas y un mercado
con margen ~2,5 %; aplicar el modelo de fútbol sería un error de diseño.

**Propuesta para PitchLab (siguiente ciclo):**
1. Contrato `Prediction` común (ya existe en `src/domain/prediction/types.ts`) con `sport: "nfl"`.
2. Servicio de features NFL propio (Elo + descanso + forma + contexto) y modelo logístico exportado
   a JSON, igual que `model_motor_a.json`.
3. Motor B NFL = de-vig de moneylines (power/proporcional); **no** un clasificador con cuotas.
4. Monitorización de calibración por temporada; el mercado sigue siendo el listón.

## 8. Reproducibilidad

```bash
cd research/prediction-lab
./.venv/bin/python models/nfl/download.py        # games.csv + manifest (sha256)
./.venv/bin/python models/nfl/build_dataset.py   # nfl_games.parquet + auditoría
./.venv/bin/python models/nfl/features.py        # nfl_features.parquet
./.venv/bin/python models/nfl/sensitivity.py     # elige K/HFA/C en VAL 2010-2019
./.venv/bin/python models/nfl/run_eval.py        # métricas + comparaciones + predicciones
```

Artefactos: `models/nfl/artifacts/{metrics.json, comparisons.json, predictions.csv,
config_used.json, sensitivity.json, summary_tables.md}`.
