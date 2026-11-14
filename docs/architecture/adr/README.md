# Architecture Decision Records

> Formato: Estado · Contexto · Decisión · Alternativas descartadas · Consecuencias. Una ADR aceptada solo cambia con otra ADR que la reemplace.

| ADR | Título | Estado |
|---|---|---|
| [ADR-001](ADR-001-monorepo-con-pnpm-workspaces-y-turborepo.md) | Monorepo con pnpm workspaces y Turborepo | Aceptada |
| [ADR-002](ADR-002-next-js-app-router-en-un-solo-origen-pitchlab-mx.md) | Next.js App Router en un solo origen (pitchlab.mx) | Aceptada |
| [ADR-003](ADR-003-estilos-tailwind-css-v4-generado-desde-los-tokens.md) | Estilos: Tailwind CSS v4 generado desde los tokens de marca, Radix UI y componentes propios | Aceptada (extendida por ADR-019 y ADR-028) |
| [ADR-004](ADR-004-storybook-como-contrato-del-design-system.md) | Storybook como contrato del Design System | Aceptada |
| [ADR-005](ADR-005-graficas-visx-como-base-y-uplot-para-series-largas.md) | Gráficas: visx como base y uPlot para series largas | Aceptada |
| [ADR-006](ADR-006-estado-tanstack-query-para-datos-del-servidor-y-la.md) | Estado: TanStack Query para datos del servidor y la URL para el contexto | Aceptada (actualizada en carga RSC y contextos por ADR-035) |
| [ADR-007](ADR-007-base-de-datos-postgresql-en-neon-drizzle-historico.md) | Base de datos: PostgreSQL en Neon + Drizzle; histórico en Parquet sobre R2 con DuckDB | Aceptada (extendida por ADR-029 y ADR-031) |
| [ADR-008](ADR-008-jobs-github-actions-programado-en-la-fase-0-trigge.md) | Jobs: GitHub Actions programado en la fase $0; Trigger.dev después | Aceptada |
| [ADR-009](ADR-009-modelos-en-python-por-lotes-la-tabla-de-prediccion.md) | Modelos en Python por lotes; la tabla de predicciones es el contrato | Aceptada (complementada por ADR-027 y ADR-029) |
| [ADR-010](ADR-010-autenticacion-con-better-auth.md) | Autenticación con Better Auth | Aceptada (actualizada por ADR-032) |
| [ADR-011](ADR-011-billing-desacoplado-y-entitlements-por-concesiones.md) | Billing desacoplado y entitlements por concesiones | Aceptada (concretada por ADR-031 y ADR-033) |
| [ADR-012](ADR-012-analitica-flags-y-errores-posthog-y-sentry.md) | Analítica, flags y errores: PostHog y Sentry | Aceptada |
| [ADR-013](ADR-013-pitchlab-ai-openrouter-modelo-barato-w5.md) | PitchLab AI vía OpenRouter con un modelo barato y herramientas tipadas (W5) | Aceptada (rev. 2; concretada para `Cortex IA` por ADR-034) |
| [ADR-014](ADR-014-fuentes-de-datos-gratuitas-en-la-fase-inicial.md) | Fuentes de datos gratuitas en la fase inicial | Aceptada (extendida por ADR-029 y ADR-030) |
| [ADR-015](ADR-015-i18n-con-next-intl-es-mx-por-defecto.md) | i18n con next-intl, es-MX por defecto | Aceptada |
| [ADR-016](ADR-016-iconografia-iconos-de-marca-lucide-para-los-generi.md) | Iconografía: iconos de marca + Lucide para los genéricos | Aceptada con cambio: set propio MaestroIcon (2026-11-11) |
| [ADR-017](ADR-017-registro-de-emblemas-deportivos-con-fallback.md) | Registro de emblemas deportivos con fallback | Aceptada |
| [ADR-018](ADR-018-archivar-la-reconstruccion-de-touchiq-y-reutilizar.md) | Archivar la reconstrucción de TouchIQ y reutilizar su dominio como Baseline 0 | Aceptada |
| [ADR-019](ADR-019-shadcn-ui-mira-base-ui-con-tokens-pitchlab.md) | Primitivas shadcn/ui (Mira, Base UI) con los tokens de PitchLab | Aceptada (extendida por ADR-028) |
| [ADR-020](ADR-020-sistema-visual-liquid-glass-v4-y-aislamiento-de-tokens.md) | Sistema visual Liquid Glass v4, aislamiento de tokens duales y diálogos nativos Top Layer | Aceptada (en parte reemplazada por ADR-023 y ADR-035) |
| [ADR-021](ADR-021-arquitectura-cero-fuga-pase-total-unico-y-crecimiento-tipster.md) | Arquitectura Cero-Fuga en servidor, Pase Total único y motor de crecimiento Tipster + Referidos | Aceptada (en parte actualizada por ADR-025 y ADR-036) |
| [ADR-022](ADR-022-spacetime-suite-multipicks-por-partido-y-parlays-correlacionados.md) | Abstracción propietaria Spacetime Suite v2.1, derivación de 5 picks por partido y parlays correlacionados | Aceptada (en parte reemplazada por ADR-027) |
| [ADR-023](ADR-023-smoked-glass-maestro-ui-physics.md) | Física Smoked-Glass del Prototipo Maestro, Primitivas Ópticas y Gobernanza Cero-Hex AA | Aceptada (en parte reemplazada en `backdrop-filter`/orbes por ADR-035) |
| [ADR-024](ADR-024-hybrid-snapshot-spacetime-quant-engine.md) | Puente híbrido entre snapshots reales por liga y el motor cuantitativo determinista Spacetime Suite v2.1 | Aceptada (en parte reemplazada por ADR-027) |
| [ADR-025](ADR-025-zero-leak-subscription-tipster-referrals.md) | Suscripción única Pase Total, frontera Cero-Fuga en servidor, lanzamiento Mes 1 sin tarjeta y motores duales de crecimiento | Aceptada (actualizada en puntos puntuales por ADR-032, ADR-033, ADR-036 y ADR-037) |
| [ADR-026](ADR-026-contrato-ejecutable-prototipo-maestro-y-simulacion-roles.md) | Contrato ejecutable del Prototipo Maestro, simulación de roles sin romper Cero-Fuga y paridad 1:1 | Aceptada (reemplazada en parte por ADR-027 y ADR-036) |
| [ADR-027](ADR-027-spacetime-v3-datos-verificables-y-herramientas-de-preview.md) | Spacetime Suite v3.0 desde prediction-lab, solo datos verificables y herramientas de preview fuera de producción | Aceptada (complementada por ADR-030) |
| [ADR-028](ADR-028-coexistencia-heroui-astryx-shadcn-sobre-tokens.md) | Coexistencia de HeroUI v3 (gratis), Astryx y shadcn/ui mediante cascada `@layer` y `<AstryxScope>` sobre `@pitchlab/tokens` | Aceptada |
| [ADR-029](ADR-029-frontera-corpus-historico-y-datasets-research-only.md) | Frontera entre corpus histórico canónico y datasets `research-only`, manifiestos SHA-256 y evaluación walk-forward sin fuga | Aceptada |
| [ADR-030](ADR-030-pulso-mercados-prediccion-y-politica-momios-gratuitos.md) | Pulso de mercado con mercados de predicción públicos (`Polymarket` y `Kalshi`) y política estricta de momios gratuitos | Aceptada |
| [ADR-031](ADR-031-esquema-f4-drizzle-pglite-y-persistencia-dual.md) | Esquema PostgreSQL de Fase 4 (`@pitchlab/db`), pruebas de migraciones sobre `PGlite` y persistencia dual navegador/servidor | Aceptada |
| [ADR-032](ADR-032-autenticacion-sin-contrasena-dos-pasos-y-coexistencia-pin.md) | Autenticación sin contraseña en dos pasos, coexistencia con PIN de beta (`getViewerAccess`) y Turnstile condicional | Aceptada |
| [ADR-033](ADR-033-cobro-stripe-rest-connect-express-y-cfdi-facturapi.md) | Cobro directo vía Stripe REST (sin SDK), liquidación diaria con Stripe Connect Express y timbrado CFDI 4.0 con Facturapi | Aceptada |
| [ADR-034](ADR-034-cortex-ia-hechos-cerrados-y-validador-determinista.md) | `Cortex IA` sobre hechos cerrados vía OpenRouter (`DeepSeek V4.1 Flash`) con validador determinista numérico y léxico | Aceptada |
| [ADR-035](ADR-035-vidrio-falso-cero-blur-shell-persistente-y-recorte-rsc.md) | Arquitectura de rendimiento «Vidrio Falso» (`0 backdrop-filter`), shell persistente (`ClubShellBridge`), contextos divididos y recorte de payload RSC | Aceptada |
| [ADR-036](ADR-036-flujo-canvas-first-pase-ultra-y-lenguaje-claro.md) | Flujo de diseño *Canvas-First* (`design/canvas/`), membresía `Pase PitchLab Ultra`, arquitectura de navegación simplificada y revisión de `FD-16` | Aceptada (en implementación para `Inicio` y `Mi cuenta`) |
| [ADR-037](ADR-037-reputacion-por-saldo-picks-adjuntos-y-umbrales-comunidad.md) | Reputación pública por `Saldo` en unidades, picks adjuntos verificables en Comunidad y umbrales mínimos de muestra | Aceptada |
| [ADR-038](ADR-038-tarjeta-invitacion-3d-webgl-sdf-y-enlaces-cortos-referido.md) | Tarjeta de invitación 3D en WebGL 1.0 por raymarching SDF (`ReferralCard3D`) y embudo de enlaces cortos `/i/[code]` con OpenGraph estático | Aceptada (en implementación para `/i/[code]` y `Mi cuenta`) |
