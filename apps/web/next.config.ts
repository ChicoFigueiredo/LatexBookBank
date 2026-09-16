import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // O scan lê o PDF no servidor (D49): o pdf.js carrega o próprio worker e as fontes padrão por
  // caminho, e o canvas é binário nativo — os dois ficam fora do bundle, resolvidos no runtime.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  // `serverExternalPackages` receberá o driver do Prisma na issue #6.
  // O lint é um passo próprio do CI (`bun run lint`); o Next 16 já não o roda no build.
};

export default nextConfig;
