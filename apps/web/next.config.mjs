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
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    connectSrc,
    "frame-src https://challenges.cloudflare.com",
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
  transpilePackages: [
    "@pitchlab/tokens",
    "@pitchlab/contracts",
    "@pitchlab/db",
    "@pitchlab/emails",
    "@pitchlab/sports-assets",
    "@pitchlab/spacetime",
    "@pitchlab/ui",
  ],
  eslint: {
    ignoreDuringBuilds: true,
  },
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
    async headers() {
      return [
        {
          source: "/:path*",
          headers: securityHeaders,
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
