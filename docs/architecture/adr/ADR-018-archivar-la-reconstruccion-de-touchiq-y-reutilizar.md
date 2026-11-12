# ADR-018: Archivar la reconstrucción de TouchIQ y reutilizar su dominio como Baseline 0

- **Estado:** Aceptada
- **Fecha:** 2026-11-08

## Contexto

El repo actual es un clon en Vite de TouchIQ con motores verificados (24 tests dorados, Δ=0).

## Decisión

En F4: crear la rama `archive/touchiq-reconstruction` con el estado actual. En la rama de trabajo, mover `src/domain` y sus tests a `packages/engines-reference` y eliminar la UI del clon, los HTML de referencia y los `public/assets` de terceros. `Reportes/` se queda. `research/` (el espejo) se elimina de main (FD-11).

## Alternativas descartadas

Mantener el clon como app (confunde el producto); borrarlo todo (se pierde el Baseline 0).

## Consecuencias

La historia queda preservada en la rama de archivo y el producto empieza limpio.
