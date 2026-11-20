import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

function buildSecurityHeaders(isDev) {
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com"
    : "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com";
  const connectSrc = isDev
    ? "connect-src 'self' ws: wss: https://challenges.cloudflare.com"
    : "connect-src 'self' https://challenges.cloudflare.com";

  const csp = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://sports.bzzoiro.com https://a.espncdn.com https://*.blob.vercel-storage.com https://storage.googleapis.com",
    "font-src 'self' data:",
    connectSrc,
    "frame-src https://challenges.cloudflare.com",
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
  // Empaquetado autónomo para Docker / Google Cloud Run (activado solo con PITCHLAB_STANDALONE=1
  // para no alterar `next start` local, E2E ni Vercel).
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
