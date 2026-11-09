# Motor B — análisis de mercado (A07)

Inteligencia de mercado: métodos de de-vig, eficiencia/sesgos del mercado, movimiento
de cuotas y comparación con el Motor A. **No entrena el modelo de producción**
(`models/b/train_motor_b.py` es de otro owner) y **no toca `test`**.

## Scripts

| Script | Experimento | Qué responde |
|---|---|---|
| `market_common.py` | — | carga, métricas canónicas (`eval.metrics`), bootstrap por bloques (LL/Brier/RPS), fiabilidad, Wilson |
| `exp08a_devig.py` | EXP08a | proporcional vs power vs Shin: log-loss/Brier/RPS y calibración, por temporada y división |
| `exp07_market_efficiency.py` | EXP07 | curva de calibración, sesgo favorito-longshot, eficiencia por división/temporada, mercado vs Motor A |
| `exp08b_odds_classifier.py` | EXP08b | ¿de-vig + corrección calibrada o clasificador que consume cuotas? |
| `exp13_movement.py` | EXP13 | movimiento apertura→cierre (solo escenario *closing-line*) |
| `run_all.py` | — | ejecuta todo en orden y verifica artefactos |

## Reproducir

```bash
cd research/prediction-lab
./.venv/bin/python models/b/analysis/run_all.py          # ~95 s
./.venv/bin/python models/b/analysis/run_all.py exp13    # uno solo
```

Semilla única `SEED = 20261109`. Todo el remuestreo es un bootstrap **pareado por
bloques temporada×división** que reproduce exactamente `eval.compare.paired_bootstrap_delta`
(se comprueba en `market_common.self_check()`, que `run_all.py` ejecuta antes de empezar).

## Datos y particiones

* Entrada: `data/processed/features_market.parquet` (+ `matches.parquet` vía ese fichero)
  y `artifacts/EXP01_baselines_20261109/pred_{logit,hgb}.csv`.
* Solo `dev` (≤ 2022/23) y `val` (2023/24). `dev_val()` aborta si aparece `test`/`live`.
  Los CSV del Motor A contienen folds de test: se filtran por temporada antes de usarlos.
* Referencia de mercado: **cierre Pinnacle, de-vig power** (mejor método en EXP08a).

## Salidas

`artifacts/exp08a_*`, `exp07_*`, `exp08b_*`, `exp13_*` en JSON + CSV + tablas markdown
(`*_tables.md`, listas para pegar en el informe).

## Limitaciones que condicionan la lectura

1. **Sin timestamps**: apertura y cierre son escenarios distintos, no una secuencia
   operativa. El cierre no sirve para simular predicciones hechas con antelación.
2. Las celdas temporada×división de una liga de 20 equipos tienen ~380 partidos: por
   debajo de `MIN_CELL_N = 500` no se sostienen conclusiones. El veredicto se apoya en
   temporadas completas (~5.800 partidos) y divisiones agregadas (≥ 2.000).
3. `val` es **una sola temporada** (8.148 partidos con Pinnacle): los IC al 95 % reflejan
   esa incertidumbre, y cualquier ventaja de décimas de milésima debe leerse como provisional.
