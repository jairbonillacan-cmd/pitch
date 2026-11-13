# @pitchlab/db

Esquema PostgreSQL de PitchLab (Neon + Drizzle, ADR-007).

- `src/schema.ts`: tablas del socio (bitácora sellada, vigilancia, preferencias) y de crecimiento y cobro
  (suscripciones, días gratis, anti-abuso, referidos, tipsters, pick semanal, comunidad, CFDI 4.0), según
  `docs/product/VISION_REESTRUCTURA_CLAUDE_GROWTH.md` §4.2.
- `migrations/`: SQL generado por drizzle-kit. No se edita a mano.
- `tests/`: aplican las migraciones en Postgres en memoria (PGlite) y prueban las reglas de integridad.

```bash
pnpm --filter @pitchlab/db generate   # después de cambiar el esquema
pnpm --filter @pitchlab/db test
DATABASE_URL=postgres://... pnpm --filter @pitchlab/db migrate   # cuando exista la base en Neon
```

Pendiente para usarla en la app (F4): autenticación real (Better Auth, ADR-010) para tener un `user_id` y las
rutas de API que lean y escriban estas tablas. Mientras tanto la app guarda bitácora, vigilancia y
publicaciones propias en el navegador.
