import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

/** @type {import('next').NextConfig} */
const nextConfig = {
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
  // Build y start de producción en otra carpeta, para medir sin pisar la de `next dev`.
  if (process.env.PITCHLAB_DIST_DIR) {
    return { ...nextConfig, distDir: process.env.PITCHLAB_DIST_DIR };
  }
  if (phase === PHASE_DEVELOPMENT_SERVER && process.env.PITCHLAB_DEV_3232 === "1") {
    return {
      ...nextConfig,
      distDir: ".turbo/next-3232",
      typescript: { tsconfigPath: ".turbo/tsconfig-3232.json" },
    };
  }
  return nextConfig;
}
