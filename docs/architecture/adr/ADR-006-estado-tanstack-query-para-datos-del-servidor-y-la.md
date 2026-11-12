# ADR-006: Estado: TanStack Query para datos del servidor y la URL para el contexto

- **Estado:** Aceptada
- **Fecha:** 2026-11-08

## Contexto

El contexto (liga, partido, jugador, mercado, línea y ventana) debe sobrevivir a la navegación, a las recargas y a los enlaces compartidos.

## Decisión

El contexto vive en la URL (segmentos y query), gestionado con `nuqs` y un helper tipado `href(route, ctx)` en `packages/contracts`. TanStack Query para los datos del cliente y RSC para la carga inicial. Zustand solo con una ADR propia si aparece estado de UI complejo que no se pueda serializar.

## Alternativas descartadas

Store global (Redux o Zustand) para el contexto (se pierde al compartir); contexto de React (no persiste).

## Consecuencias

Las URLs son largas pero legibles y estables. Los nombres de los parámetros están congelados en `ROUTE_MAP.md` §1.
