import { defineConfig } from "drizzle-kit";

// `pnpm --filter @pitchlab/db generate`: nueva migración SQL en ./migrations desde src/schema.ts.
// `pnpm --filter @pitchlab/db migrate`: aplica las migraciones en Neon (requiere DATABASE_URL).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: process.env.DRIZZLE_OUT ?? "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
