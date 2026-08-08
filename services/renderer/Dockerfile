# Worker de render autoritativo (Fase 6, D27/D35).
#
# **Esta é a imagem que vai para o droplet.** Não há variante "de desenvolvimento": uma segunda
# imagem seria uma segunda coisa para manter em sincronia, e é sempre a de produção que fica para
# trás. O que muda entre local e servidor são variáveis de ambiente, nunca o Dockerfile.
#
# A lista de pacotes TeX não foi copiada de um tutorial — saiu de `kpsewhich` contra os `.sty` que
# o acervo legado usa de fato:
#
#   tikz.sty, pgfplots.sty  -> texlive-pictures
#   siunitx.sty             -> texlive-science
#   xlop.sty                -> texlive-plain-generic
#   cancel.sty, standalone  -> texlive-latex-extra
#
# `texlive-full` traria tudo e resolveria o problema com 5 GB. Instalar o que se usa mantém a
# imagem no tamanho em que dá para inspecionar o que há dentro dela.

FROM oven/bun:1 AS bun

FROM debian:bookworm-slim

# `--no-install-recommends` é o que separa 1,5 GB de 4 GB: os recomendados do TeX Live puxam
# documentação e fontes de idiomas que ninguém compila aqui.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        texlive-latex-base \
        texlive-latex-recommended \
        texlive-latex-extra \
        texlive-pictures \
        texlive-science \
        texlive-plain-generic \
        texlive-fonts-recommended \
        texlive-lang-portuguese \
        poppler-utils \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

# Usuário sem privilégio. O worker compila LaTeX de terceiro; rodar isso como root é entregar a
# imagem inteira a quem descobrir a primeira falha do TeX.
RUN useradd --create-home --shell /usr/sbin/nologin renderer
WORKDIR /app

# O contrato entra como pacote, não copiado por dentro: é o mesmo arquivo que a aplicação importa,
# e duplicá-lo aqui seria criar a chance de os dois lados divergirem sem ninguém perceber.
COPY packages/render-contract ./packages/render-contract
COPY services/renderer ./services/renderer

USER renderer
ENV RENDERER_HOST=0.0.0.0 \
    RENDERER_PORT=28900 \
    NODE_ENV=production

EXPOSE 28900

# O healthcheck usa `/health`, que é a única rota sem autenticação — exatamente para isto.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD bun -e "const r = await fetch('http://127.0.0.1:28900/health'); process.exit(r.ok ? 0 : 1)"

CMD ["bun", "services/renderer/src/main.ts"]
