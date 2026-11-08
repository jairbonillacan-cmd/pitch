# ADR-015: i18n con next-intl, es-MX por defecto

- **Estado:** Aceptada
- **Fecha:** 2026-11-08

## Contexto

Lanzamiento en México con expansión internacional.

## Decisión

`next-intl` con es-MX sin prefijo y `/en` en el futuro (`localePrefix: 'as-needed'`). Formatos con `Intl` (es-MX). Ningún texto de UI fijo en los componentes de `packages/ui`: se pasa por props o mensajes.

## Alternativas descartadas

Sin i18n hasta expandirse (una reescritura costosa).

## Consecuencias

Una leve sobrecarga inicial a cambio de no reescribir.
