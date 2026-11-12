# ADR-004: Storybook como contrato del Design System

- **Estado:** Aceptada
- **Fecha:** 2026-11-08

## Contexto

El fundador preguntó si conviene Storybook. Con ~38 secciones construidas por agentes distintos, el riesgo principal es la inconsistencia visual y los estados olvidados.

## Decisión

Storybook (builder Vite) en `packages/ui`, `packages/sports-ui` y `packages/charts`, con addon a11y, pruebas de interacción vía Vitest y snapshots visuales con Playwright en 375/768/1200/1440 px. **Regla:** un componente no está terminado sin stories de todos sus estados (default, hover/focus, loading, empty, error, stale, demo, disabled y bloqueado por plan). Storybook se publica en cada PR como artefacto de preview.

## Alternativas descartadas

Sin Storybook (los estados se prueban solo dentro de las páginas: lento y frágil); Chromatic desde el día 1 (es de pago; queda como opción cuando haya ingresos); Ladle (más ligero, con menos addons).

## Consecuencias

Los prompts de sección referencian stories existentes en lugar de describir componentes. El costo es mantener las stories al día, y CI lo hace cumplir.
