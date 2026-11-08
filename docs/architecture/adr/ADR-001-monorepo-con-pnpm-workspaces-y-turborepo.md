# ADR-001: Monorepo con pnpm workspaces y Turborepo

- **Estado:** Aceptada
- **Fecha:** 2026-11-08

## Contexto

Varios agentes trabajarán en paralelo sobre UI, dominio, datos y modelos. Hacen falta límites de paquete que obliguen a respetar el ownership y builds con caché.

## Decisión

Monorepo `pnpm` + `turbo` con la estructura de `PITCHLAB_MASTER_PLAN.md` §4. Las dependencias entre paquetes se declaran en `package.json` y se vigilan con la regla ESLint `boundaries`. `services/models` (Python) vive en el mismo repo con su propio `pyproject.toml` (uv).

## Alternativas descartadas

Nx (más potente, pero más pesado de configurar); repos separados (rompen los contratos compartidos); un solo paquete (sin límites de ownership).

## Consecuencias

Un PR puede cambiar a la vez el contrato y su consumidor. CI corre solo lo afectado (`turbo --filter`). Los agentes reciben globs de ownership por paquete.
