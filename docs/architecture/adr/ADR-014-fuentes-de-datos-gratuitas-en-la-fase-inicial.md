# ADR-014: Fuentes de datos gratuitas en la fase inicial

- **Estado:** Aceptada
- **Fecha:** 2026-11-08

## Contexto

El fundador decidió no pagar APIs de datos por ahora (FD-02).

## Decisión

nflverse (CC-BY, sin los datasets de FTN), openfootball (CC0), The Odds API Starter y API-Football Free, según `FREE_DATA_STRATEGY.md`. Todo va detrás de `ProviderAdapter` y `provider_ref`.

## Alternativas descartadas

Pagar datos desde el día 1 (sin ingresos); scraping (ilegal o contra los ToS).

## Consecuencias

Limitaciones visibles en la UI (frescura diaria en NFL, cierre aproximado y sin cuotas de props). La migración se hace por disparadores.
