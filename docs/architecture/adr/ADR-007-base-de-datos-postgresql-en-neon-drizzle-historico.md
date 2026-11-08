# ADR-007: Base de datos: PostgreSQL en Neon + Drizzle; histórico en Parquet sobre R2 con DuckDB

- **Estado:** Aceptada
- **Fecha:** 2026-11-08

## Contexto

Hacen falta datos relacionales (usuarios, partidos y picks), series de cuotas que crecen sin parar y backtests sobre años de histórico, todo con costo inicial de $0.

## Decisión

Neon Postgres (un branch por PR para previews y agentes) con Drizzle ORM y migraciones versionadas en `packages/db`. `odds_snapshot` particionada por mes (particionado nativo). Datos crudos y curados en Parquet en Cloudflare R2, y DuckDB para backtests e investigación (en Python y en jobs). Detalle en `DATA_ARCHITECTURE.md`.

## Alternativas descartadas

Supabase (bueno, pero no usaremos su Auth, y el branching de Neon encaja mejor con los agentes); TimescaleDB (no disponible en Neon); ClickHouse (excesivo); Prisma (más pesado en serverless; Drizzle es SQL-first).

## Consecuencias

Sin extensiones exóticas: todo es portable a cualquier Postgres 16+. El tamaño de Neon Free obliga a guardar en Postgres solo lo que consulta la app.
