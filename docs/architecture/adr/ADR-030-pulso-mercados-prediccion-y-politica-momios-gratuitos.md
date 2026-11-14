---
status: accepted
date: 2026-11-13
updates:
  - ADR-014
  - ADR-027
---

# ADR-030: Pulso de mercado con mercados de predicción públicos (`Polymarket` y `Kalshi`) y política estricta de momios gratuitos

- **Estado:** Aceptada (`accepted`). Actualiza [ADR-014](ADR-014-fuentes-de-datos-gratuitas-en-la-fase-inicial.md) y complementa [ADR-027](ADR-027-spacetime-v3-datos-verificables-y-herramientas-de-preview.md).
- **Fecha:** 2026-11-13 (implementada en `services/ingest/src/adapters/market-pulse.ts` y ratificada por decisión del fundador del `2026-11-11`).

## Contexto

Dos necesidades de mercado chocaban con la regla de presupuesto `$0` y cumplimiento legal de PitchLab:

1. **«¿Dónde está el dinero?» (`FD-20`):** el producto necesita mostrar en qué resultado se concentra el volumen del mercado frente a la probabilidad del modelo. Las casas mexicanas no publican porcentajes de boletos/dinero y los *betting splits* de casas estadounidenses exigen APIs de pago (~US$229/mes) o scraping no autorizado.
2. **Fuente de momios al activar cobros (`DECISIONES_FUNDADOR_F4.md` §3.1):** originalmente [ADR-014](ADR-014-fuentes-de-datos-gratuitas-en-la-fase-inicial.md) planteaba pagar feeds comerciales al tener ingresos, mientras [ADR-027](ADR-027-spacetime-v3-datos-verificables-y-herramientas-de-preview.md) dependía temporalmente del snapshot generado en `prediction-lab`. El 2026-11-11 el fundador decidió mantener **exclusivamente fuentes gratuitas** también en Fase 4 (cero contratos de pago y cero scraping de casas desde la app).

## Decisión

1. **Pulso de liquidez vía APIs públicas sin clave (`services/ingest/src/adapters/market-pulse.ts`):**
   - **Fútbol (6 ligas, incluida Liga MX):** lectura del endpoint público documentado de **Polymarket Gamma API** (`gamma-api.polymarket.com/events`), conciliando eventos abiertos de 3 vías (`moneyline`) por similitud de nombre (`>= 0.5`) y ventana de inicio (`±36 h`), registrando volumen en USD y precio implícito por lado (`home`, `draw`, `away`).
   - **NFL:** lectura paginada de **Kalshi Trade API v2** (`serie KXNFLGAME`), conciliando por código oficial de franquicia (con tabla de alias como `JAC → JAX`) y ventana de `±36 h`, registrando volumen en contratos de US$1 y último precio.
   - **Retención pre-inicio (`mergeMarketPulse`):** cuando un encuentro inicia o cierra y deja de aparecer como mercado abierto, el snapshot conserva la última lectura previa al silbatazo para no vaciar la ficha del partido.
   - **Presentación honesta y cumplimiento `FD-16`:** la UI presenta el indicador como atención/actividad en mercados de predicción internacionales (nunca como dinero apostado en casas mexicanas ni nombrando a `Polymarket` o `Kalshi` en la interfaz), ocultándolo cuando el volumen es irrelevante.
2. **Política permanente de momios gratuitos y degradación limpia:**
   - PitchLab no contrata feeds de momios de pago ni ejecuta scrapers de casas de apuestas en `apps/web` o `services/ingest`.
   - Los momios pre-partido provienen únicamente de planes gratuitos cuyos términos admitan exhibición de valores individuales en la app (como `The Odds API Starter` de 500 créditos/mes y la evaluación priorizada en `docs/research/MOMIOS_ALTERNATIVAS_THE_ODDS_API.md`, encabezada por `PropLine Free` con 1,000 solicitudes/día) o de cortes vigentes sincronizados bajo la ventana máxima de `72 h` (`PITCHLAB_MAX_ODDS_AGE_HOURS`, [ADR-027](ADR-027-spacetime-v3-datos-verificables-y-herramientas-de-preview.md)).
   - Cuando un partido carece de momio gratuito vigente, la UI opera con **Momio Justo** del motor + comparador interactivo «Tu momio» ingresado por el usuario, mostrando «Sin momio» en lugar de estimar precios de casa.

## Alternativas descartadas

- **Pagar APIs de *betting splits* o feeds comerciales de momios antes de validar retención:** rompe la estructura de costos fijos mínimos de lanzamiento.
- **Usar la clave gratuita diferida de Betfair Exchange para volumen:** verificada sin datos de volumen en el nivel gratuito.
- **Raspar casas de apuestas desde jobs de la aplicación web:** vulnera términos de servicio y expone la infraestructura principal a bloqueos e incumplimiento.

## Consecuencias

- «¿Dónde está el dinero?» funciona a costo `$0` y sin secretos adicionales en NFL, Liga MX y las cinco ligas europeas, sujeto a revisar periódicamente los términos comerciales de cada API pública antes de escalar cobros.
- El valor central del producto («qué es lo más probable + momio justo contra tu momio») permanece 100 % operativo aun si se agota la cuota mensual de una API gratuita de cuotas.
