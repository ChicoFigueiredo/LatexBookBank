import type { NextConfig } from "next";

// Com a extensão: o Node carrega este arquivo com o TypeScript nativo, e ESM não completa o nome.
import { MAX_ARCHIVE_BYTES } from "./src/modules/portability/domain/archive-size.ts";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // O scan lê o PDF no servidor (D49): o pdf.js carrega o próprio worker e as fontes padrão por
  // caminho, e o canvas é binário nativo — os dois ficam fora do bundle, resolvidos no runtime.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  experimental: {
    // Com `proxy.ts`, o Next guarda o corpo de toda requisição para o proxy e a rota lerem, e
    // corta em 10 MB sem avisar a rota: o `.lbb` de 109 MB chegava truncado ao import e voltava
    // "corrompido". O teto é o do `.lbb` (SEC-03); as outras rotas têm o próprio, menor.
    proxyClientMaxBodySize: MAX_ARCHIVE_BYTES,
  },
  // `serverExternalPackages` receberá o driver do Prisma na issue #6.
  // O lint é um passo próprio do CI (`bun run lint`); o Next 16 já não o roda no build.
};

export default nextConfig;
