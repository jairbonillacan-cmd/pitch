# ADR-016: Iconografía: iconos de marca + Lucide para los genéricos

- **Estado:** Aceptada con cambio (2026-11-11, fundador): los genéricos no usan Lucide sino el set propio `MaestroIcon` (`packages/ui/src/platform/components/MaestroPrimitives.tsx`), ya en uso en la UI v4.1.
- **Fecha:** 2026-11-08

## Contexto

La marca solo trae 8 iconos (`BRAND_AUDIT.md` B2).

## Decisión

Los iconos con identidad (asistente, juegos, histórico, tendencia, filtros, panel, info y cerrar) son los de la marca. Los genéricos salen de Lucide, configurado con trazo de 1.75 y uniones redondas para coincidir con la retícula de la marca. Los 3 fallbacks de emblemas se dibujan a mano (ADR-017).

## Alternativas descartadas

Dibujar todo a mano (lento); otra librería (Phosphor o Tabler: válidas, pero menos alineadas).

## Consecuencias

Un icono genérico nuevo no requiere diseño.

## Actualización 2026-11-11

El fundador aprobó cerrar esta ADR con `MaestroIcon`: 33 glifos propios con trazo de 1.8 y uniones redondas, sin dependencia externa. Un ícono genérico nuevo se agrega a ese set. Los emblemas siguen la ADR-017.
