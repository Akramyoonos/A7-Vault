import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: 'export',
    images: {
        unoptimized: true,
    },
    // Important for GitHub Pages repo deployment
    basePath: '/A7-Vault',
    assetPrefix: '/A7-Vault/',
};

export default nextConfig;
