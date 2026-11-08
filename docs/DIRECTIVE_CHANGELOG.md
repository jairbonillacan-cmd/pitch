# Changelog de la directiva: v1 → v2

> **Propósito:** trazabilidad entre la directiva original del fundador (v1, 31 secciones) y `PITCHLAB_MASTER_PLAN.md` (v2).
> **Fecha:** 2026-11-08

## Cambios de fondo

| # | v1 | v2 | Motivo / evidencia |
|---|---|---|---|
| 1 | Pedía generar los 36 prompts en la etapa 5, antes de que hubiera código | Primero se cierra la arquitectura (F0–F3) y el walking skeleton (F4). Los prompts (F5) citan paquetes, tipos y stories reales y pasan un linter. | Instrucción del fundador. Un prompt escrito sobre APIs inexistentes produce contradicciones. |
| 2 | Stack «a evaluar» | Stack cerrado: Next.js, pnpm con Turborepo, Tailwind v4 desde los tokens, Radix, visx/uPlot, Storybook, Neon/Drizzle, Better Auth, Trigger.dev, Python batch, PostHog, Sentry y Claude API (§3) | Instrucción del fundador |
| 3 | Sin Storybook | **Storybook** como contrato visual del DS, con a11y, interaction tests y snapshots | Instrucción del fundador. Es el mecanismo de calidad multiagente. |
| 4 | Sin emblemas deportivos | Sports Asset Registry con los emblemas de GPT (Liga MX r1 y Premier League r2), fallback neutro e interruptor legal (§6) | `pitchlab-brand/football/*` y la instrucción del fundador |
| 5 | Sin ecosistema social | Cuentas, perfiles, invitaciones, trial de 7 días, referidos que regalan trial, Pick Journal inmutable y leaderboards por CLV (§7) | Instrucción del fundador |
| 6 | Sin redes sociales | 7 redes oficiales, JSON-LD `sameAs`, share intents, UTM y share cards (§8) | Instrucción del fundador |
| 7 | Hub por deporte (07–11) | Un SportHub paramétrico con configuración por deporte | Evita «5 apps distintas» (§1.4 de la v1) |
| 8 | 18, 19 y 27 como secciones propias | 18 pasa a ser pestaña de 17, 19 se integra en 06 y 27 en 25 | Solapamiento funcional |
| 9 | — | Secciones nuevas: 36 Profile y Pick Journal, 37 Leaderboards y 38 Referrals e Invites | Ecosistema |
| 10 | Licencias de datos en la etapa 6 | Spike de datos y licencias en F1, como bloqueante | Riesgo que define el producto |
| 11 | Billing «evaluar Stripe y Mercado Pago» | `BillingProvider` abstracto, con el proveedor decidido en el spike legal | Stripe lista «sports forecasting or odds making» entre los negocios restringidos y prohibidos |
| 12 | «No te bloquees» | `FOUNDER_DECISIONS.md` con defaults explícitos | Hay decisiones que son del fundador |
| 13 | ~45 documentos | ≈26 documentos, cada uno con propósito y consumidor | Evita el slop documental |
| 14 | Validación manual de prompts | `scripts/lint-prompts.mjs` en CI | Calidad verificable |
| 15 | Anti-slop como lista | Gates automáticos: detector, lint de solo tokens, contraste y snapshots (§11) | Calidad verificable |
| 16 | Handoffs REA como insumo | Triage: adoptar, rechazar o posponer, con etiqueta de evidencia (`docs/research/REA_REPORT_INVENTORY.md` §4) | Los handoffs contienen costos sin fuente, scraping y microservicios |
| 17 | Bankroll y Kelly | Bankroll y unidades solo simulados. Kelly solo como simulación educativa. | Postura «laboratorio, no casa» |
| 18 | Opción A o B de URLs | **Opción A** (un solo origen) | Cookies, SEO de perfiles públicos y un solo deploy |
| 19 | Registro de 18+ no mencionado | Declaración 18+ con fecha de nacimiento y autoexclusión del módulo social | Juego responsable |
| 20 | El repo actual no se consideraba | Se archiva el clon de TouchIQ y `src/domain` se migra a `packages/engines-reference` (Baseline 0) | `README.md`, `src/domain` |

## Cobertura de las 31 secciones de la v1

| v1 § | Destino en la v2 |
|---|---|
| 0 Misión, 1 Anti-slop | §2 (se conserva íntegro como principio) |
| 2 Dominio y URLs | §3 (Opción A) |
| 3 Identidad GPT | §1, §6 y `docs/brand/*` |
| 4 Draftea | F2 UX_FINDINGS («patrón, nunca pieza») |
| 5 REA | §1 y `docs/research/REA_REPORT_INVENTORY.md` |
| 6 Análisis competitivo | F2 (matriz) y el inventario §3–4 |
| 7 Superapp y contexto | §5 `SportContext` en la URL y §12 |
| 8 Arquitectura técnica | §3–4 y las ADRs en F3 |
| 9 Sports Data Platform | §9.1 y §10 |
| 10 Historical Vault y Replay | §10 (as-of) y F3 HISTORICAL_STORAGE |
| 11 Odds Intelligence | §5 `OddsQuote`, §10 y §12 (17 con pestañas) |
| 12 Prediction Engine | §10 (gate frente a Baseline 0 y CLV) |
| 13 Player Research | §12 (13–15) |
| 14 PitchLab AI | §3 y §10 |
| 15 Auth y Billing | §3, §7 y §9.2 |
| 16 Design System | §3 (Storybook), §11 y prompt 00 |
| 17 App Shell | Marca (handoff) y prompt 00 |
| 18 Mapa de 35 secciones | §12 (38 secciones con trazabilidad) |
| 19 Prompts | F5 |
| 20 Multiagente | F6 y §4 (ownership) |
| 21 Datos demo | §5 `DataState.provenance` y gate de build |
| 22 Calidad medible | §11 |
| 23 MVP y roadmap | §12 (MVP) y F2 |
| 24 Presupuesto | F1 (modelo de costos con supuestos) |
| 25 Seguridad y cumplimiento | §9.2 y §11, F3 SECURITY |
| 26 Documentación | §13 |
| 27 Biblioteca de prompts | F5 |
| 28 Ejecución incremental | §13 y `PROJECT_STATE.md` |
| 29 Criterios de aceptación | Gates por fase (§13) y Verificación |
| 30 Entregable CTO | Resumen al cierre de cada fase |
| 31 Instrucción definitiva | Prioridades reflejadas en el orden F0–F6 |
