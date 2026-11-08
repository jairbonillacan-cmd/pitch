# Matriz competitiva de funcionalidades

> **Propósito:** decidir qué construye PitchLab, qué mejora y qué evita, con evidencia.
> **Consumidores:** product blueprint (F2), `SECTION_INDEX.md` y autores de prompts.
> **Fecha:** 2026-11-08 · **Fuentes:** `Reportes/` (ver `REA_REPORT_INVENTORY.md`). Las etiquetas aplican a la columna de evidencia.
> **Leyenda:** ✅ presente · ◐ parcial o cosmético · — ausente. **Prioridad:** P0 MVP · P1 post-MVP · P2 posterior · ✗ no se construye.

## 1. Matriz

| ID | Funcionalidad | TouchIQ | AztecaVet | LineMate | Evidencia | Limitación observada | Oportunidad PitchLab | Datos requeridos | Complejidad | Prioridad |
|---|---|:-:|:-:|:-:|---|---|---|---|:-:|:-:|
| F01 | Calendario y partidos por deporte | ✅ NFL/NCAA | ✅ fútbol/NHL/MLB | ✅ | OBSERVADO: `touchiq/pages-and-navigation.md`, `aztecavet/pages-and-navigation.md`, `analisis-linemate/page-inventory.md` | TouchIQ y AztecaVet tienen datos congelados y semanales | Calendario vivo con estado y frescura visible | Schedules con licencia | M | P0 |
| F02 | Game Center (detalle de partido) | ◐ hoja de análisis | ◐ hoja de análisis | ✅ `/summary/:gameID` | OBSERVADO | Ninguna une stats, cuotas, histórico y modelo en un solo lugar con contexto | Hub que conserva contexto (equipo → jugador → mercado → histórico) | Stats, odds, predicciones | M | P0 |
| F03 | Probabilidades de partido (motor) | ✅ Pitágoras/Log5/Normal | ✅ Poisson con Dixon-Coles | — (solo frecuencias) | RECONSTRUIDO Δ=0: `Reportes/18-engine-nfl-report.md` | Parámetros fijos, sin validación temporal publicada | Modelos validados (walk-forward y CLV) con un gate de publicación | Histórico de resultados y cuotas de cierre | A | P1 (P0 = metodología y Baseline) |
| F04 | Player props: hit rate, game logs y splits | ◐ promedios | — | ✅ workstation | OBSERVADO: `analisis-linemate/player-props.md`, `hit-rate-engine.md` | Push contado como fallo; frecuencia presentada como probabilidad | Hit rate bruto y decisivo más push rate, n visible e IC; separado de la probabilidad | Game logs de jugador | M | P0 (NFL) |
| F05 | Line scrubber (recalcular a otra línea) | — | — | ✅ | OBSERVADO | Sin distribución ni incertidumbre | Scrubber con histograma de distribución y muestra | Game logs | B | P0 |
| F06 | With/without compañero | — | — | ✅ premium | OBSERVADO: `analisis-linemate/workstation.md` | Muestras de 1–2 juegos sin advertencia | Mostrar n y bloquear conclusiones con n < umbral | Participación por juego | M | P1 |
| F07 | Rankings defensivos por categoría | — | — | ✅ | OBSERVADO: `analisis-linemate/matchups.md` | Yardas crudas sin ajustar por calendario ni ritmo | Ajuste por oponente y ritmo (según la licencia de PBP) | Stats de equipo / PBP | M | P1 |
| F08 | Comparador de cuotas multi-casa | — | — (cuota manual) | ✅ 19 casas de EE. UU. y Canadá | OBSERVADO: `analisis-linemate/sportsbook-coverage.md` | Sin casas mexicanas | Comparador con las casas disponibles por licencia; cobertura MX según el proveedor | Odds feed con licencia | M | P0 |
| F09 | Histórico de cuotas, apertura y cierre, line movement | — | — | — (`opening: null`) | OBSERVADO: `analisis-linemate/historical-odds.md` | Nadie lo tiene | **Diferenciador núcleo**: snapshots propios desde el día 1 más el histórico del proveedor | Snapshots periódicos | M | P0 (captura) / P1 (UI completa) |
| F10 | EV, noVig y fair odds | ✅ | ✅ | ◐ | RECONSTRUIDO: `src/domain` | Cuota escrita a mano (T/A) | Calculado sobre cuotas observadas con hora, como **dato**, no como recomendación | Odds | B | P0 |
| F11 | Lesiones e impacto | ✅ manual | ✅ manual | ◐ injury impact | OBSERVADO | Transcritas a mano y sin hora | Feed con licencia, hora y fuente | Injuries feed | M | P1 |
| F12 | Boleto / betslip | ✅ | ✅ | ✅ (con afiliado) | OBSERVADO | Orientado a apostar | Se reemplaza por **Pick Journal** (registro inmutable, unidades simuladas) | Odds y resultados | M | P0 (como Pick Journal) |
| F13 | Historial y ROI | ✅ liquidación manual | ✅ manual | — | OBSERVADO | Liquidación manual, editable y sin CLV | Calificación automática, inmutable, CLV e IC | Resultados y cierre | M | P0 |
| F14 | Bankroll y sizing (5/10 %) | ✅ | ✅ | — | OBSERVADO | 10 % fijo, riesgo de ruina alto | Solo como simulador educativo de riesgo de ruina; sin recomendación | — | B | P2 |
| F15 | Asistente IA | ◐ regex sobre el DOM | ◐ regex sobre el DOM | ◐ beta | OBSERVADO: `aztecavet/ai-assistant.md` | Sin datos fundamentados | IA con herramientas tipadas, fuentes y hora, y cuota por plan | Toda la API interna | A | P1 |
| F16 | Parlays / SGP | ◐ independencia | ◐ alerta de correlación | ✅ heurístico | OBSERVADO | Asumen independencia | Pospuesto hasta tener un modelo de correlación validado | Covarianzas | A | P2 |
| F17 | Auth y suscripción | ◐ PIN 7779 | ◐ PIN | ✅ Firebase, Stripe y trial de 7 días **con tarjeta** | OBSERVADO: `analisis-linemate/auth-and-subscriptions.md` | — | Better Auth, trial de 7 días y referidos (plan §7) | — | M | P0 |
| F18 | Entitlements en el backend | — | — | ✅ (truncado a 5 filas) | OBSERVADO | — | `can(user, feature)` en el servidor y vistas previas honestas | — | M | P0 |
| F19 | Prediction markets (Kalshi, Polymarket) | — | — | ✅ (EE. UU.) | OBSERVADO | Fuera del mercado mexicano | No | — | — | ✗ |
| F20 | Bonos y afiliados de casas | — | — | ✅ `/bonuses` | OBSERVADO | Conflicto de interés | **No** en el MVP (postura «laboratorio») | — | — | ✗ |
| F21 | Escáner OCR de boletos | — | — | ✅ | OBSERVADO | Orientado a apostar | No | — | — | ✗ |
| F22 | Clima del estadio | — | — | ✅ | OBSERVADO | — | Contexto en Game Center (NFL y MLB) si el proveedor lo incluye | Weather | B | P1 |
| F23 | Perfiles públicos, leaderboard y social | — | — | — | — | Nadie lo tiene | **Ecosistema PitchLab** (plan §7) | Picks propios | M | P0 (beta tras flag) |
| F24 | Historical Replay (as-of) | — | — | — | — | Nadie lo tiene | Diferenciador | Snapshots as-of | A | P1 |
| F25 | Backtesting de modelos y estrategias | — | ◐ «auditoría» con leakage | — | OBSERVADO: `aztecavet/PITCHLAB_HANDOFF.md` §13 | Look-ahead | Walk-forward sin leakage | Histórico as-of | A | P1 |
| F26 | Audio, intros 3D y mascotas | ✅ | ✅ | — | OBSERVADO | Teatro que retrasa cálculos de 2 ms | No | — | — | ✗ |

## 2. Conclusiones

1. **Lo que nadie hace y PitchLab sí:** F09 histórico de cuotas y CLV, F13 historial inmutable con calificación automática, F23 ecosistema social verificable, F24 Replay y F25 backtest sin leakage. Esa es la propuesta de valor.
2. **Paridad necesaria (P0):** F01, F02, F04, F05, F08, F10, F17 y F18. Sin esto, no hay producto.
3. **No se construye (✗):** afiliados, OCR de boletos, prediction markets y teatralidad. Contradicen la postura y el anti-slop.
4. **Trampa a evitar:** la estructura de LineMate (feeds de «100 % hit rate») vende frecuencia como certeza. PitchLab muestra n, IC y la cuota implícita junto a cada frecuencia (ver `PREDICTION_ENGINE_FINDINGS.md`).

## 3. Benchmarks de superioridad (se miden desde la beta)

| Área | Métrica | Referencia | Objetivo PitchLab |
|---|---|---|---|
| Frescura | Edad de la cuota mostrada | TouchIQ y AztecaVet: semanal (manual) | ≤ intervalo de captura del plan (ADR de datos) y badge *stale* automático |
| Profundidad histórica | Temporadas consultables por deporte | TouchIQ: actual + baseline 2025 | Lo que permita la licencia (FD-02), declarado por liga |
| Calibración | Brier y log loss walk-forward | Baseline 0 (motores reconstruidos) | Mejor que el Baseline 0 y que el mercado de cierre sin vig |
| Tiempo de investigación | Tiempo de «abrir un partido» a «ver el hit rate del prop con su cuota» | LineMate: 3–4 navegaciones | ≤ 2 interacciones (contexto en la URL) |
| Transparencia | % de cifras con fuente, n y hora visibles | Las 3: bajo | 100 % (gate de diseño) |
| Rendimiento | LCP e INP en p75 | — | ≤ 2,5 s / ≤ 200 ms |
