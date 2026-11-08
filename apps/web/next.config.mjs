/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@pitchlab/tokens",
    "@pitchlab/contracts",
    "@pitchlab/sports-assets",
    "@pitchlab/ui",
  ],
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias || {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
