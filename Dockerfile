# syntax=docker/dockerfile:1.7
# Imagen OCI multi-etapa agnóstica de proveedor (Node 22 Debian slim, ADR-050).
# Portable a cualquier plataforma de contenedores o VPS (Docker, Coolify, Fly.io, Railway, Render,
# AWS ECS/App Runner, Azure Container Apps, DigitalOcean, Google Cloud Run) con paridad total con local.

FROM node:22-slim AS builder
WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1
ENV PITCHLAB_STANDALONE=1

RUN corepack enable && corepack prepare pnpm@12.11.2 --activate

# 1) Instalar dependencias aprovechando la caché de capas de Docker
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/emails/package.json packages/emails/package.json
COPY packages/engines-reference/package.json packages/engines-reference/package.json
COPY packages/models/package.json packages/models/package.json
COPY packages/spacetime/package.json packages/spacetime/package.json
COPY packages/sports-assets/package.json packages/sports-assets/package.json
COPY packages/tokens/package.json packages/tokens/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY services/ingest/package.json services/ingest/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts=false

# 2) Copiar código fuente, marca y datos necesarios para compilación y runtime
COPY apps/web apps/web
COPY packages packages
COPY services/ingest services/ingest
COPY pitchlab-brand pitchlab-brand
COPY data data
COPY scripts/check-no-demo-prod.mjs scripts/check-no-demo-prod.mjs

# Variables públicas inyectadas al bundle cliente durante `next build` (nunca secretos)
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=""
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
ARG NEXT_PUBLIC_TELEGRAM_URL=""
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_TELEGRAM_URL=$NEXT_PUBLIC_TELEGRAM_URL

# Compilar tokens, assets y @pitchlab/web en modo standalone (verificando gate anti-demo)
RUN node scripts/check-no-demo-prod.mjs \
 && pnpm --filter @pitchlab/web... build

# ── Etapa final mínima de ejecución ──────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME="0.0.0.0"
ENV PORT=8080

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# Artefacto standalone de Next.js + estáticos + activos públicos
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone /app
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static /app/apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public /app/apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/content/blog /app/apps/web/content/blog

# Datos operativos leídos desde disco por apps/web/src/server/*
COPY --from=builder --chown=nextjs:nodejs /app/data/snapshots /app/data/snapshots
COPY --from=builder --chown=nextjs:nodejs /app/data/history/*.jsonl /app/data/history/
COPY --from=builder --chown=nextjs:nodejs /app/data/health /app/data/health
COPY --from=builder --chown=nextjs:nodejs /app/data/odds_timeseries /app/data/odds_timeseries
COPY --from=builder --chown=nextjs:nodejs /app/packages/spacetime/data/live_matchday_v3_snapshot.json /app/packages/spacetime/data/live_matchday_v3_snapshot.json

USER nextjs
WORKDIR /app/apps/web

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
