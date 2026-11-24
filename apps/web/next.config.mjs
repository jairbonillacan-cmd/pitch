import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const SPACETIME_RUNTIME_DATA_FILES = [
  "../../packages/spacetime/data/live_matchday_v3_snapshot.json",
  "../../packages/spacetime/data/model_motor_a.json",
  "../../packages/spacetime/data/model_multisport.json",
  "../../packages/spacetime/data/model_nfl.json",
  "../../packages/spacetime/data/candidate_registry_v6_0.json",
  "../../packages/spacetime/data/model_epistemic_conformal_v5_1_candidate.json",
  "../../packages/spacetime/data/model_inplay_early_payout_v5_0_candidate.json",
  "../../packages/spacetime/data/model_multisport_v6_0_candidate.json",
  "../../packages/spacetime/data/model_officials_freeze_v6_0_candidate.json",
  "../../packages/spacetime/data/model_props_v6_0_candidate.json",
  "../../packages/spacetime/data/model_soccer_57_v6_0_candidate.json",
  "../../packages/spacetime/data/model_soccer_micro_v5_0_candidate.json",
  "../../packages/spacetime/data/model_v5_2_live_feedback_candidate.json",
  "../../packages/spacetime/data/sgp_copula_v5_0_candidate.json",
];

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
    ...(!isDev
      ? [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ]
      : []),
    {
      key: "Cross-Origin-Opener-Policy",
      value: "same-origin-allow-popups",
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
  outputFileTracingIncludes: {
    "/blog": ["./content/blog/**/*"],
    "/blog/[slug]": ["./content/blog/**/*"],
    "/blog/[slug]/opengraph-image": ["./content/blog/**/*"],
    "/blog/categoria/[categoria]": ["./content/blog/**/*"],
    "/blog/rss.xml": ["./content/blog/**/*"],
    "/sitemap.xml": ["./content/blog/**/*"],
    "/": SPACETIME_RUNTIME_DATA_FILES,
    "/resultados": SPACETIME_RUNTIME_DATA_FILES,
    "/precio": SPACETIME_RUNTIME_DATA_FILES,
    "/motores": SPACETIME_RUNTIME_DATA_FILES,
    "/verificacion": SPACETIME_RUNTIME_DATA_FILES,
    "/canjear": SPACETIME_RUNTIME_DATA_FILES,
    "/login": SPACETIME_RUNTIME_DATA_FILES,
    "/onboarding": SPACETIME_RUNTIME_DATA_FILES,
    "/signup": SPACETIME_RUNTIME_DATA_FILES,
    "/p/**": SPACETIME_RUNTIME_DATA_FILES,
    "/u/**": SPACETIME_RUNTIME_DATA_FILES,
    "/app": SPACETIME_RUNTIME_DATA_FILES,
    "/app/**": SPACETIME_RUNTIME_DATA_FILES,
    "/api/**": SPACETIME_RUNTIME_DATA_FILES,
  },
  outputFileTracingExcludes: {
    "*": [
      "../../data/snapshots/**/20[0-9][0-9]-[0-9][0-9]-[0-9][0-9].json",
      "../../data/history/**",
      "./data/snapshots/**/20[0-9][0-9]-[0-9][0-9]-[0-9][0-9].json",
      "./data/history/**",
      "**/data/snapshots/**/20[0-9][0-9]-[0-9][0-9]-[0-9][0-9].json",
      "**/data/history/**",
    ],
  },
  ...(process.env.PITCHLAB_STANDALONE === "1" ? { output: "standalone" } : {}),
  experimental: {
    optimizePackageImports: ["@pitchlab/ui", "@heroui/react"],
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
        {
          source: "/icons-dark/:path*",
          headers: [
            { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
          ],
        },
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
                source: "/verificacion",
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
