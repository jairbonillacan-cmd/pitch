# ADR-017: Registro de emblemas deportivos con fallback

- **Estado:** Aceptada
- **Fecha:** 2026-11-08

## Contexto

GPT entregó emblemas propios de Liga MX (r1) y de la Premier League (r2) en `pitchlab-brand/football/`. El resto de las ligas no tiene.

## Decisión

`packages/sports-assets` valida los manifiestos con Zod, copia los archivos a `apps/web/public/brand/sports/<league>/r<rev>/` y genera `registry.ts`. `TeamBadge` y `LeagueBadge` resuelven por `TeamId` canónico y, si no hay emblema, caen en 3 fallbacks neutros. Interruptor `assets.emblems.<league>`. Ver `PITCHLAB_MASTER_PLAN.md` §6 y `ASSET_MANIFEST.md`.

## Alternativas descartadas

Logos oficiales (licencias); solo códigos de texto (menos reconocibles).

## Consecuencias

El riesgo marcario se controla con el flag y la revisión legal (FD-08).
