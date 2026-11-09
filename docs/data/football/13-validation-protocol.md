# 13 · Protocolo de validación estadística

> Implementación: `services/ingest/src/history-backtest.ts` + métricas en
> `packages/models/src/backtest/metrics.ts`. **Fecha:** 2026-11-08.

## 1. Diseño de evaluación (obligatorio para cualquier modelo)

1. **Walk-forward por jornada**: los bloques son `temporada | torneo | jornada`, ordenados
   por fecha. Para predecir el bloque R solo se usan partidos anteriores a la fecha de R.
2. **Ventana móvil de entrenamiento** (por defecto 1,095 días) con mínimo de 200
   partidos; los bloques sin ventana suficiente se saltan (n se reporta).
3. **Split temporal siempre**. Queda prohibida la división aleatoria de partidos: un
   modelo entrenado con mayo no predice abril.
4. **Referencias obligatorias**: ingenuo (tasas base de la ventana) siempre; Baseline 0
   cuando se comparan modelos propios; **mercado sin vig** cuando existan cuotas
   legales del período.
5. **Métricas**: LogLoss (multinomial para 1X2, binario para O/U y ML), Brier
   multinomial, accuracy, y para goles: calidad de distribución (O/U en la línea de
   cierre) — proper scoring rules, nunca solo accuracy.
6. **Incertidumbre**: bootstrap pareado (2,000 iteraciones, LCG sembrado 12345) sobre
   las pérdidas unitarias; un Δ solo se declara si el IC95 no cruza 0. Por temporada y
   por liga cuando se promueva un cambio.
7. **Calibración**: curvas por decil + error de calibración; los parámetros de
   calibración se ajustan sin tocar el holdout final (regla de la directiva).

## 2. Resultados del protocolo aplicado (datasetId `0ddb5936738a2b15…`)

Ver tabla completa en `11-model-audit.md` §4. Resumen: 7/7 ligas con mejora
significativa sobre el ingenuo; NFL por debajo del mercado sin vig (+0.0421 de LogLoss).

## 3. Reglas de reporte

- Menor es mejor; Δ negativo = el modelo pierde menos que la referencia.
- Toda cifra pública cita: liga, n, ventana, `datasetId` y fecha del corpus.
- La evaluación retro **no** es track record: se publica con esa etiqueta hasta tener
  registro en vivo (`PREDICTION_ARCHITECTURE.md` §2, gate de publicación).
- Si una corrida no puede reproducir su Δ (cambió el corpus debajo), el resultado se
  descarta y se re-corre con el `datasetId` anclado (incidente documentado en
  `11-model-audit.md` §5).

## 4. Invariantes que deben seguirse probando

1. *Temporal*: ninguna predicción del harness puede usar una fila con `date ≥` la fecha
   del bloque — se cumple por construcción y debe tener test que falle si se rompe.
2. *As-of*: los features futuros solo pueden usar filas con `availableAt ≤ instante`.
3. *Reproducibilidad*: mismos bytes de origen + misma configuración → mismo `datasetId`
   y mismas métricas (bootstrap sembrado).
4. *Calibración sin fuga*: los parámetros de calibración entrenan fuera del holdout.

## 5. Qué falta en el harness (honestidad)

- Tests automatizados de los invariantes 1-4 como parte de `pnpm test` (hoy son diseño
  del código, no tests ejecutados por línea).
- Evaluación separada de liguilla/playoffs vs regular.
- Calibración medida (curvas) aún no generada por el CLI.
