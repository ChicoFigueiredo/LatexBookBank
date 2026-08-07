import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // `serverExternalPackages` receberá o driver do Prisma na issue #6.
  // O lint é um passo próprio do CI (`pnpm lint`); o Next 16 já não o roda no build.
};

export default nextConfig;
