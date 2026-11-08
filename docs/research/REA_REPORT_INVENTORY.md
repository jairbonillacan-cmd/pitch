# Inventario de investigaciones REA y triage de handoffs

> **Propósito:** saber qué investigación existe, cuál es canónica, qué tan confiable es cada handoff y qué falta.
> **Consumidores:** arquitecto (F1–F3), autores de prompts (F5) y cualquier sesión que retome el proyecto.
> **Fecha:** 2026-11-08 · **Fase:** F0 · **Etiquetas:** OBSERVADO / INFERIDO / RECONSTRUIDO / DESCONOCIDO

## 1. Ubicación canónica

| Carpeta | Estado | Regla |
|---|---|---|
| `Reportes/` | **Canónica** | Toda cita apunta aquí |
| `research/` | Espejo de una entrega anterior. `research/aztecavet` = `Reportes/aztecavet` (0 diferencias). `research/touchiq` difiere solo en el README. `research/linemate` es un subconjunto (18 diferencias: le faltan FINDINGS y los REPORT-EPL/GLOBAL/NBA/NFL/NHL) | No se cita. Archivar o eliminar lo decide el fundador. |

## 2. Inventario por referencia

| Referencia | Carpetas | Documentos clave | Estado |
|---|---|---|---|
| **TouchIQ** (NFL, NCAA, fútbol staged) | `Reportes/touchiq/` (22 md), `Reportes/analisis-touchiq/` (artefactos JS, harness `engine/`), `Reportes/docs/01–19`, `Reportes/00-REPORTE-COMPLETO.md`, `Reportes/18-engine-nfl-report.md`, `Reportes/19-engine-ncaa-report.md` | `PITCHLAB_HANDOFF.md`, `nfl-engine.md`, `ncaa-engine.md`, `soccer-engines.md`, `ticket-history-bankroll.md`, `evidence-register.md` | **Completo**. Motor reconstruido en `src/domain` con 24 tests dorados y verificación batch Δ=0 en 46 juegos × 15 mercados |
| **AztecaVet** (fútbol, NHL, MLB) | `Reportes/aztecavet/` (26 md), `Reportes/analisis-aztecavet/` (`INFORME.md`, `INFORME-PROFUNDO.md`, `data/`, `readable/`) | `PITCHLAB_HANDOFF.md`, `football-engine.md`, `nhl-engine.md`, `mlb-engine.md`, `probability-and-value.md`, `bankroll.md`, `ai-assistant.md` | **Completo** |
| **LineMate** (NFL, más NBA, NHL y EPL) | `Reportes/analisis-linemate/` (37 md, 572 archivos: `api/`, `api-snapshot2/`, `captures/`, `evidence/`) | `PITCHLAB_HANDOFF.md`, `hit-rate-engine.md`, `trends-engine.md`, `player-props.md`, `odds-and-markets.md`, `sportsbook-coverage.md`, `historical-odds.md`, `licensing-and-data-options.md`, `evidence/data-models/pitchlab_nfl_models.ts` | **Completo para NFL**. Los REPORT de NBA, NHL y EPL son complementarios |
| **Draftea** (referencia estética) | — | — | **No investigado.** En F2 (UX_FINDINGS) solo se revisan patrones públicos, con la regla «patrón, nunca pieza» |

## 3. Hallazgos transversales (base para el producto)

| # | Hallazgo | Etiqueta | Evidencia |
|---|---|---|---|
| H1 | TouchIQ y AztecaVet son apps 100 % cliente: HTML único en Netlify, **0 requests de red** en runtime y datos transcritos a mano y congelados | OBSERVADO | `Reportes/touchiq/evidence-register.md` (`ev_7d2fef6c`), `Reportes/aztecavet/PITCHLAB_HANDOFF.md` §10 |
| H2 | TouchIQ y AztecaVet **comparten base de código** (motor de fútbol y PIN 7779 en ambos) | OBSERVADO | `Reportes/touchiq/evidence-register.md` (`ev_44e130e7`) |
| H3 | Los motores son Pitágoras → Log5 → HFA odds-ratio → normal (NFL/NCAA/MLB) o Poisson con Dixon-Coles (fútbol/NHL), más EV, noVig y sizing del 5/10 % | OBSERVADO y RECONSTRUIDO (Δ=0) | `Reportes/18-engine-nfl-report.md`, `Reportes/19-engine-ncaa-report.md`, `src/domain` |
| H4 | Ninguna de las dos tiene histórico real, histórico de cuotas ni actualización automática | OBSERVADO | Handoffs §7–9 de TouchIQ y §9–10 de AztecaVet |
| H5 | Sus «asistentes IA» son regex sobre el texto del DOM en el navegador público | OBSERVADO | `Reportes/aztecavet/ai-assistant.md`, `Reportes/touchiq/ai-assistant.md` |
| H6 | Su control de acceso es un PIN en texto plano comparado en el cliente | OBSERVADO | Ambos handoffs |
| H7 | LineMate usa identificadores de Sportradar (`sr:player`, `sr:match`), Sleeper y Kalshi | OBSERVADO (IDs en payloads). Que exista un contrato comercial con Sportradar es INFERIDO. | `Reportes/analisis-linemate/data-provenance.md` |
| H8 | El hit rate de LineMate cuenta los push como fallos (en el denominador) | OBSERVADO (código cliente) | `Reportes/analisis-linemate/hit-rate-engine.md` |
| H9 | LineMate no guarda línea de apertura (`opening: null`), así que no tiene line movement ni CLV | OBSERVADO en el snapshot. La ausencia en servidor es INFERIDO. | `Reportes/analisis-linemate/historical-odds.md` |
| H10 | LineMate no cubre casas mexicanas | OBSERVADO en su lista de 19 casas | `Reportes/analisis-linemate/sportsbook-coverage.md` |

**Oportunidad que resulta de H1–H10:** ninguna referencia combina datos con licencia que se actualizan solos, histórico as-of, histórico de cuotas o CLV, modelos validados de forma temporal e IA fundamentada en herramientas. Ese es el espacio de PitchLab.

## 4. Triage de las recomendaciones de los handoffs

| Recomendación en el handoff | Origen | Veredicto | Motivo |
|---|---|---|---|
| Fórmulas Pitágoras, Log5, Poisson/DC, EV, noVig | TouchIQ y AztecaVet | **ADOPTAR como Baseline 0** | Son de dominio público, ya están verificadas y sirven como referencia que el modelo propio debe superar |
| Hit rate dual (bruto y decisivo) más push rate | LineMate | **ADOPTAR** | Es más honesto que el original |
| Rankings defensivos ajustados (EPA/pace) | LineMate | ADOPTAR sujeto a datos | Depende de la licencia play-by-play (spike F1) |
| Histórico de cuotas con apertura y cierre, y CLV | Los 3 | **ADOPTAR (núcleo)** | Es el diferenciador central y alimenta el leaderboard |
| Fractional Kelly y Markowitz como recomendación | AztecaVet y TouchIQ | **RECHAZAR como recomendación**. Solo cabe como simulación educativa | Evita la postura de asesor de apuestas |
| Scraping de Caliente.mx y Codere con Playwright y proxies residenciales | LineMate §7 | **RECHAZAR** | ToS, directiva y riesgo legal. Cuotas mexicanas solo vía un proveedor con licencia |
| Caliente/Codere deep-link broker, BetSync y OCR de boletos | LineMate y TouchIQ | **RECHAZAR para el MVP** | Postura «laboratorio, no casa» |
| Alertas push de arbitraje o EV>5 % | TouchIQ | RECHAZAR en esa forma | Se reformula como alertas de movimiento de línea o de datos, con contexto |
| Copula SGP engine | LineMate y AztecaVet | POSPONER (W5+) | Requiere datos de correlación y validación |
| Microservicios Go/FastAPI, K8s, ClickHouse, LangGraph | Los 3 | **RECHAZAR** | Monolito modular más jobs (ADR en F3) |
| Costos de proveedores (Sportmonks $150–300, Sportradar $3.5–8k, The Odds API $150–600, API-Football $39–199) | LineMate y AztecaVet | **INFERIDO, sin usar** hasta cotizar | Sin fuente ni fecha (spike F1) |
| «$149 MXN/mes vía OXXO y SPEI con Stripe» | LineMate | **DESCONOCIDO** | Ni precio ni elegibilidad verificados (Stripe restringe «sports forecasting») |
| Calidad de evidencia «100 % verificado» | TouchIQ | Matizar | Solo los motores tienen verificación reproducible (Δ=0). El resto es observación de UI |

## 5. Calidad de los propios reportes

- El `evidence-register.md` de TouchIQ no usa las etiquetas OBSERVADO/INFERIDO (0 apariciones) y una de sus filas declara SHA-256 con un hash de 32 hex. Se re-etiqueta al citarlo.
- El de AztecaVet tiene 12 OBSERVADO, 1 INFERIDO y 1 DESCONOCIDO. El de LineMate tiene 18, 4 y 3.
- Los handoffs están escritos en tono de venta («everything necessary», «institutional-grade»). Se usan los documentos técnicos, no las conclusiones de marketing.

## 6. Pendientes y cómo integrar reportes futuros

| Pendiente | Impacto | Fase |
|---|---|---|
| Revisión UX de Draftea (patrones públicos) | Interaction patterns del DS | F2 |
| Lectura detallada de `pitchlab_nfl_models.ts` (LineMate) frente a los contratos propios | Contratos de props y game logs | F3 |
| Matriz competitiva completa en formato de la directiva (Feature ID…) | SECTION_INDEX | F2 |

**Protocolo para un reporte REA nuevo:**

1. Se guarda en `Reportes/<referencia>/`.
2. Se añade su fila al §2.
3. Se aplica el triage del §4 a sus recomendaciones.
4. Se listan los documentos y prompts afectados en `PROJECT_STATE.md`.
5. Se actualizan solo esos documentos y prompts.
