# 11 · Auditoría de los motores (Baseline 0 y v2)

> Qué existe, cómo funciona, qué tan bueno es y qué limita. Todo lo numérico de este
> doc proviene de corridas reproducibles citadas al final. **Fecha:** 2026-11-08.

## 1. Baseline 0 — `@pitchlab/engines-reference`

- Origen: reconstrucción REA de los motores de TouchIQ/AztecaVet (Pitágoras → Log5 →
  HFA odds-ratio → normal para NFL; Poisson con ajuste Dixon-Coles para fútbol),
  verificada con Δ=0 en 46 juegos × 15 mercados y 386 tests (`REA_REPORT_INVENTORY.md` H3).
- Rol: **referencia pública y explicable** (factores en español, sin jerga interna, FD-16).
  Cualquier modelo propio debe superar su LogLoss para justificar su complejidad.
- Limitación: sus tasas de fondo eran constantes transcritas a mano; no aprende del corpus.

## 2. v2 — `@pitchlab/models`

- Fútbol: **Dixon-Coles estimado** (IPF con contracción, decaimiento temporal ξ=0.0019,
  localía y ρ estimados, incertidumbre por información de Fisher propagada con
  simulación determinista de 240 escenarios). Determinista: mismos datos → mismos números.
- NFL: **ratings ridge** ofensivo/defensivo ajustados por rival, con σ de margen y total
  derivados de residuales.
- Métricas propias en `packages/models/src/backtest/metrics.ts`: LogLoss, Brier,
  accuracy, bootstrap pareado (LCG sembrado — reproducible).

## 3. Resultado 1: v2 vs Baseline 0 (temporadas 2025-26/2026 en curso, `pnpm backtest`)

| Competición | n | v2 LogLoss | Baseline 0 | Δ (IC 95 %) | Veredicto |
|---|---:|---:|---:|---|---|
| Premier League 1X2 | 327 | 1.0230 | 1.0239 | −0.0009 [−0.0225, +0.0207] | Empate estadístico |
| NFL moneyline | 307 | 0.6479 | 0.6419 | +0.0060 [−0.0074, +0.0206] | Empate estadístico (ligera ventaja del Baseline) |

**Lectura honesta:** con pocas jornadas de la temporada en curso, v2 **no** demuestra
superioridad sobre el Baseline 0. Ninguna de las dos diferencias es significativa. No se
declara mejora donde no la hay (regla §15 de la directiva).

## 4. Resultado 2: benchmark del corpus (walk-forward por jornada, `pnpm backtest:history`)

Ventana móvil de entrenamiento de 1,095 días, mínimo 200 partidos, cada jornada
predicha solo con lo anterior. Contra la referencia ingenua (tasas base de la ventana):

| Liga | n | Modelo (LogLoss) | Ingenuo | Δ (IC 95 %) | Concluyente |
|---|---:|---:|---:|---|:--:|
| Premier League | 5,898 | **0.9748** | 1.0653 | −0.0905 [−0.1002, −0.0799] | ✅ |
| LaLiga | 5,159 | **0.9752** | 1.0637 | −0.0885 [−0.1001, −0.0782] | ✅ |
| Bundesliga | 4,710 | **0.9953** | 1.0680 | −0.0727 [−0.0835, −0.0609] | ✅ |
| Serie A | 4,744 | **0.9739** | 1.0768 | −0.1029 [−0.1140, −0.0914] | ✅ |
| Ligue 1 | 4,054 | **1.0034** | 1.0704 | −0.0670 [−0.0782, −0.0553] | ✅ |
| Liga MX | 781 | **1.0043** | 1.0542 | −0.0499 [−0.0735, −0.0271] | ✅ |
| NFL ML | 7,204 | **0.6545** | 0.6860 | −0.0315 [−0.0389, −0.0237] | ✅ |

**Y el benchmark que más duele (NFL, mercado sin vig de las moneylines de cierre de
nflverse, n=5,426):** mercado **0.6106** vs modelo 0.6545 → Δ modelo−mercado **+0.0421
[+0.0344, +0.0499]**. El mercado es significativamente mejor que el modelo. Es el
hallazgo más importante de la auditoría: el histórico sirve para entrenar (gana al
ingenuo en las 7 ligas con IC concluyente), pero **no** para pretender que ya vencimos
al mercado.

## 5. Limitaciones detectadas en la auditoría

1. **Incidente de divergencia NFL (resuelto y con causa raíz):** una corrida del
   benchmark reportó LogLoss 4.64 y otra con el mismo comando dio 0.6545. Causa raíz
   (documentada en HIST-01 de `PROJECT_STATE.md`): el centrado por medias del solver
   ridge de `packages/models/src/nfl/ratings.ts` hacía divergir el modelo con muestras
   > ~240 partidos (intercepto ~1e38); se eliminó el centrado (el ridge ya identifica
   el modelo) y se añadió prueba de regresión con 320 partidos. Lecciones: (a) toda
   corrida de benchmark debe anclar el `datasetId` y la versión del modelo; (b) una
   métrica imposible (LogLoss > 3 en ML) es señal de bug, no de "mercado eficiente".
2. La liguilla (postseason) aún entra al entrenamiento de fútbol; su distribución es
   distinta (aunque en Liga MX solo son ~10-20 filas por temporada).
3. Los números del Baseline 0 vs v2 usan pocas jornadas; el corpus benchmark (§4) es la
   evaluación de referencia.
4. El corpus de fútbol no tiene estadísticas de equipo ni alineaciones — el techo del
   modelo con datos $0 es el de un DC bien ajustado + calibración.
