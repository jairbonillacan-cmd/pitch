# ADR-002: Next.js App Router en un solo origen (pitchlab.mx)

- **Estado:** Aceptada
- **Fecha:** 2026-11-08

## Contexto

La directiva pedía comparar `pitchlab.mx/app` con `app.pitchlab.mx`. Los perfiles y picks públicos deben indexarse y poder compartirse, y la sesión debe valer en todas las rutas.

## Decisión

Next.js (App Router, React 19, TypeScript strict) desplegado en Vercel bajo `pitchlab.mx`. Rutas en `ROUTE_MAP.md`. RSC para las tablas pesadas, route handlers como BFF (`/api/v1`) y `next/og` para las share cards.

## Alternativas descartadas

Subdominio `app.` (cookies entre subdominios, dos deploys y SEO dividido); Vite SPA + API aparte (SEO y OG débiles, dos servicios); Remix / React Router 7 (válido, pero con menos ecosistema para OG e ISR en Vercel).

## Consecuencias

Una cookie first-party, sin CORS y un solo deploy. `/app` y `/admin` llevan `noindex`. El clon actual en Vite se archiva (ADR-018).
