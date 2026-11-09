# 14 · Cuotas históricas: qué existe, qué no, y las reglas

> Pregunta de la directiva: ¿qué cuotas ofrecía el mercado antes de comenzar y podemos
> usarlas legalmente? **Fecha:** 2026-11-08.

## 1. Inventario real

| Fuente | Cuota | Período | Derecho | Uso interno |
|---|---|---|---|---|
| nflverse `games.csv` (CC-BY 4.0) | Spread, total y moneylines de **cierre** (formato americano) por partido, 1999→2026 | ✅ ya en el corpus (`odds`, `usage: research-only`, n=5,426 con moneyline completa) | Investigación interna: benchmark modelo vs mercado | Nunca se publican como cuotas propias ni se redistribuyen |
| The Odds API Free (500 créditos/mes) | h2h, spreads, totals de casas por región, **hacia adelante** (snapshots propios) | Colección propia desde la activación del scheduler | Mostrar en producto con hora visible; almacenar indefinidamente; entrenar modelos permitido | «Apertura» = primer snapshot propio; «cierre» = último snapshot antes del inicio, **etiquetado como aproximado** |
| football-data.co.uk | Cierre histórico de fútbol | ⛔ no integrado | Términos no clasificados; máx. investigación offline manual | No entra al pipeline ni al producto |
| Cuotas de fútbol históricas con apertura/cierre | — | **No existen legalmente gratis** | — | Ninguna fuente aprobada; no se fabrican |

## 2. Reglas duras (derivadas de la directiva §16)

1. **Nada de vig inventado ni «cuotas reconstruidas»**: si no hubo snapshot, no hay dato.
2. Un modelo que corre 24 h antes **jamás** usa el cierre observado como input; el
   cierre es referencia de evaluación (CLV y benchmark), con la disponibilidad de cada
   instante declarada.
3. El de-vig del benchmark NFL usa normalización multiplicativa de las dos moneylines
   (`noVigPair`) — sin consenso multi-casa porque la fuente es una sola.
4. Pinnacle cerró su API pública (23-jul-2025): el benchmark de mercado de fútbol será
   el **consenso sin vig** de casas con licencia, cuando existan snapshots suficientes.
5. Toda cuota mostrada en la UI lleva hora del snapshot y badge *stale* cuando aplica.

## 3. Resultado del benchmark con las cuotas existentes (NFL)

Mercado sin vig: LogLoss **0.6106** vs modelo 0.6545 (Δ +0.0421 [+0.0344, +0.0499]).
Conclusión honesta: con datos $0, **el mercado es mejor predictor que el modelo** para
NFL. Implicaciones: (a) cualquier afirmación de «ventaja» sobre el mercado está
prohibida sin evidencia contraria; (b) la vía de mejora #6 del plan
(`12-model-improvement-plan.md`) es combinar señal estadística + mercado cuando haya
cuotas legales de fútbol, midiendo Δ vs mercado puro.

## 4. Qué habilitaría más (sin comprar todavía)

- Snapshots disciplinados de The Odds API (plan §3 de `FREE_DATA_STRATEGY.md`): con
  meses de colección propia se tendría apertura/cierre aproximado de fútbol propio —
  es lento pero legal y ya presupuestado en 500 créditos/mes.
- Histórico de cuotas de fútbol listo para usar → solo con proveedor comercial
  (`16-cost-comparison.md`, escenario C).
