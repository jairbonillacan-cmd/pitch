import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

function extractHttpsOrigins(rawValues) {
  const origins = new Set();
  for (const raw of rawValues) {
    if (!raw) continue;
    for (const part of String(raw).split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol === "https:") origins.add(parsed.origin);
      } catch (err) {
        void err;
      }
    }
  }
  return [...origins];
}

function buildSecurityHeaders(isDev) {
  const captchaDisabled = process.env.PITCHLAB_CAPTCHA_PROVIDER?.trim().toLowerCase() === "none";
  const turnstileOrigin = captchaDisabled ? "" : " https://challenges.cloudflare.com";

  const scriptSrc = isDev
    ? `script-src 'self' 'unsafe-inline' 'unsafe-eval'${turnstileOrigin}`
    : `script-src 'self' 'unsafe-inline'${turnstileOrigin}`;
  const connectSrc = isDev
    ? `connect-src 'self' ws: wss:${turnstileOrigin}`
    : `connect-src 'self'${turnstileOrigin}`;

  const extraMediaOrigins = extractHttpsOrigins([
    process.env.PITCHLAB_MEDIA_ORIGINS,
    process.env.AVATAR_PUBLIC_BASE_URL,
    process.env.S3_AVATAR_PUBLIC_BASE_URL,
    process.env.S3_AVATAR_ENDPOINT,
    process.env.GCS_AVATAR_PUBLIC_BASE_URL,
  ]);
  const baseImgSources = [
    "'self'",
    "data:",
    "blob:",
    "https://sports.bzzoiro.com",
    "https://a.espncdn.com",
    "https://*.blob.vercel-storage.com",
    "https://storage.googleapis.com",
    ...extraMediaOrigins,
  ];
  const imgSrc = `img-src ${[...new Set(baseImgSources)].join(" ")}`;
  const frameSrc = captchaDisabled ? "frame-src 'none'" : "frame-src https://challenges.cloudflare.com";

  const csp = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    imgSrc,
    "font-src 'self' data:",
    connectSrc,
    frameSrc,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  return [
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "X-Frame-Options",
      value: "DENY",
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    {
      key: "Content-Security-Policy",
      value: csp,
    },
  ];
}

/** @type {import('next').NextConfig} */
const baseConfig = {
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  transpilePackages: [
    "@pitchlab/tokens",
    "@pitchlab/contracts",
    "@pitchlab/db",
    "@pitchlab/emails",
    "@pitchlab/ingest",
    "@pitchlab/sports-assets",
    "@pitchlab/spacetime",
    "@pitchlab/ui",
  ],
  eslint: {
    ignoreDuringBuilds: true,
  },
  // El blog lee `content/blog/*.md` en tiempo de ejecución: estas rutas deben llevar los archivos.
  outputFileTracingIncludes: {
    "/blog": ["./content/blog/**/*"],
    "/blog/[slug]": ["./content/blog/**/*"],
    "/blog/[slug]/opengraph-image": ["./content/blog/**/*"],
    "/blog/categoria/[categoria]": ["./content/blog/**/*"],
    "/blog/rss.xml": ["./content/blog/**/*"],
    "/sitemap.xml": ["./content/blog/**/*"],
  },
  // Empaquetado autónomo estándar para cualquier contenedor OCI / Node / VPS (Docker, Fly.io, Railway,
  // Render, AWS ECS, Coolify, Cloud Run; activado con PITCHLAB_STANDALONE=1 sin alterar `next start` ni E2E).
  ...(process.env.PITCHLAB_STANDALONE === "1" ? { output: "standalone" } : {}),
  // Cada página importa solo lo que usa de estos paquetes (no el barril completo).
  experimental: {
    optimizePackageImports: ["@pitchlab/ui", "@heroui/react", "@base-ui/react", "@astryxdesign/core"],
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias || {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};

export default function config(phase) {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;
  const securityHeaders = buildSecurityHeaders(isDev);
  const nextConfig = {
    ...baseConfig,
    // En desarrollo, Next descarta las páginas compiladas tras 60 s sin visitas y las recompila al
    // volver (la «traba» al navegar). Se conservan 1 h y hasta 50 páginas en memoria.
    ...(isDev ? { onDemandEntries: { maxInactiveAge: 60 * 60 * 1000, pagesBufferLength: 50 } } : {}),
    async headers() {
      return [
        {
          source: "/:path*",
          headers: securityHeaders,
        },
        {
          source: "/sw.js",
          headers: [
            { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
            { key: "Service-Worker-Allowed", value: "/" },
          ],
        },
        {
          source: "/manifest.webmanifest",
          headers: [
            { key: "Content-Type", value: "application/manifest+json; charset=utf-8" },
            { key: "Cache-Control", value: "public, max-age=3600" },
          ],
        },
        {
          source: "/brand/:path*",
          headers: [
            { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
          ],
        },
        {
          source: "/icons/:path*",
          headers: [
            { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
          ],
        },
        // Caché HTTP estándar independiente de proveedor (ADR-050/ADR-053) para rutas públicas
        // sin datos de sesión ni cookies personalizadas. Nunca aplica a `/precio`, `/app/*` ni `/api/*`.
        ...(!isDev
          ? [
              {
                source: "/",
                headers: [
                  { key: "Cache-Control", value: "public, max-age=0, s-maxage=300, stale-while-revalidate=3600" },
                ],
              },
              {
                source: "/resultados",
                headers: [
                  { key: "Cache-Control", value: "public, max-age=0, s-maxage=300, stale-while-revalidate=3600" },
                ],
              },
              {
                source: "/blog",
                headers: [
                  { key: "Cache-Control", value: "public, max-age=0, s-maxage=300, stale-while-revalidate=3600" },
                ],
              },
              {
                source: "/blog/categoria/:categoria",
                headers: [
                  { key: "Cache-Control", value: "public, max-age=0, s-maxage=300, stale-while-revalidate=3600" },
                ],
              },
              {
                source: "/blog/:slug",
                headers: [
                  { key: "Cache-Control", value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" },
                ],
              },
              {
                source: "/motores",
                headers: [
                  { key: "Cache-Control", value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" },
                ],
              },
              {
                source: "/legal/:path*",
                headers: [
                  { key: "Cache-Control", value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" },
                ],
              },
              {
                source: "/offline",
                headers: [
                  { key: "Cache-Control", value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" },
                ],
              },
            ]
          : []),
      ];
    },
  };

  // Build y start de producción en otra carpeta, para medir sin pisar la de `next dev`.
  if (process.env.PITCHLAB_DIST_DIR) {
    return { ...nextConfig, distDir: process.env.PITCHLAB_DIST_DIR };
  }
  if (isDev && process.env.PITCHLAB_DEV_3232 === "1") {
    return {
      ...nextConfig,
      distDir: ".turbo/next-3232",
      typescript: { tsconfigPath: ".turbo/tsconfig-3232.json" },
    };
  }
  return nextConfig;
}
