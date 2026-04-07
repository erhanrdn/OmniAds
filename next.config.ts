import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  webpack: (config) => {
    if (process.env.DISABLE_WEBPACK_CACHE === "1") {
      config.cache = false;
    }

    return config;
  },
};

export default nextConfig;
