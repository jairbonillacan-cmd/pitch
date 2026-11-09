# services/models — GBM sobre features as-of

Modelo de boosting (LightGBM) que apila las señales del motor: probabilidades de
Dixon-Coles y Elo, descanso, forma y tiros a puerta. Sigue la decisión de ADR-009 de
modelos **por lotes**: entrena, evalúa y escribe reportes; la web no lo llama en línea.

## Flujo

1. El benchmark de TypeScript exporta las features as-of:

   ```bash
   pnpm backtest:history --include-research-history \
     --export-features=Reportes/modelos/features-asof.jsonl
   ```

   Cada línea: `id, league, season, date, features[12], dc[3], elo[3], blend[3], outcome, market[3]|null`.
   Las features incluyen Elo, Dixon-Coles, descanso, forma y diferencia de tiros a puerta.

2. Entrena el GBM (walk-forward por temporada; pooled entre ligas con one-hot):

   ```bash
   python services/models/train_gbm.py
   ```

   Escribe `Reportes/modelos/BACKTEST-GBM.md` y `backtest-gbm.json`.

## Dependencias

`requirements.txt` fija LightGBM 4.7.0. En un entorno normal:

```bash
python -m pip install -r services/models/requirements.txt
```

Si el sandbox bloquea la instalación global, se puede usar un directorio local:

```bash
python -m pip install --target services/models/.deps lightgbm
PYTHONPATH=services/models/.deps python services/models/train_gbm.py
```

En Windows con este repo se usó `services/models/.deps` (ignorado por git).

## Resultado

Con las features actuales el GBM **no supera a la mezcla 50/50** de Dixon-Coles y Elo
(Δ +0.0015 a +0.0027 de log loss, IC 95 % incluye el 0). La señal ya está en los motores
base; el siguiente salto requiere datos nuevos (xG, alineaciones, cuotas) más que otra
clase de modelo. El detalle está en `Reportes/modelos/BACKTEST-GBM.md`.

## NFL: blend ratings + GBM situacional

services/models/nfl_blend.py mezcla las predicciones del motor NFL (ratings) con un LightGBM entrenado sobre las features pre-partido del pipeline situacional (descanso, bye, clima, EPA de QB). Requiere exportar las predicciones del benchmark:

`ash
pnpm backtest:history --leagues=nfl --export-nfl=Reportes/modelos/nfl-ratings-predictions.jsonl
PYTHONPATH=services/models/.deps python services/models/nfl_blend.py
`

Resultado (test 2020-2026): moneyline ratings 0.6691 → **blend 0.6433** (sin empates 0.6682 → 0.6428); mercado 0.6091. El peso (0.4) se elige en validación (temporadas < 2020). Reporte: Reportes/modelos/NFL-BLEND.md. Es un experimento research-only: el GBM no está integrado en el producto.

## Artefacto NFL y inferencia

El GBM del blend se versiona en services/models/artifacts/nfl_blend/ (model.txt + metadata.json con features, parámetros, métricas y peso de mezcla). Se regenera con:

`ash
PYTHONPATH=services/models/.deps python services/models/nfl_blend.py --save-artifact
`

Para inferir sobre un JSONL de features pre-partido:

`ash
python services/models/nfl_predict.py --features partidos.jsonl --out predicciones.jsonl
`

Salida por partido: pHome, pDraw, pAway y pHomeBinary (para mezclar con el motor de ratings usando weightRatings).
