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
#   abntex2cite.sty         -> texlive-publishers   (61 MB)
#   lmodern                 -> lmodern              (33 MB)
#
# Do preâmbulo legado (`latex-includes.tex`, 37 packages) falta exatamente **um**: `iwona`, que
# só existe em `texlive-fonts-extra` — 1,41 GB, mais que dobraria a imagem por uma fonte
# decorativa. A divergência está registrada no perfil, com o que ela muda na aparência.
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
        texlive-publishers \
        lmodern \
        poppler-utils \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

# Usuário sem privilégio. O worker compila LaTeX de terceiro; rodar isso como root é entregar a
# imagem inteira a quem descobrir a primeira falha do TeX.
RUN useradd --create-home --shell /usr/sbin/nologin renderer
WORKDIR /app

# Manifestos primeiro, e só eles: assim a camada de dependências só é refeita quando uma
# dependência muda, e não a cada alteração de código.
#
# `bun install` roda **dentro** da imagem, e não é detalhe de gosto. A primeira versão deste
# arquivo não instalava nada e mesmo assim funcionava — porque o `node_modules` do host tinha
# entrado junto no contexto. Quer dizer: a imagem carregava `vitest`, `typescript` e os links
# simbólicos da máquina de quem construiu. Funcionava por acidente, e por acidente é como voltaria
# a quebrar.
#
# O manifesto do `apps/web` vem junto mesmo sem nada dele ser instalado: o lockfile descreve o
# workspace inteiro, e com um membro faltando o `bun install` conclui que o lockfile mudou e
# recusa (`--frozen-lockfile`). Copiar o manifesto — não o código — é o que mantém a instalação
# reprodutível sem trazer o app para dentro da imagem do worker.
COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/
COPY packages/render-contract/package.json ./packages/render-contract/
COPY services/renderer/package.json ./services/renderer/
# **Todo** workspace do lockfile precisa estar aqui, mesmo o que a imagem não usa: `bun install
# --frozen-lockfile` compara o lockfile com os workspaces que enxerga, e um `package.json`
# faltando é "lockfile had changes". Foi assim que a imagem parou de compilar quando o serviço de
# backup nasceu (#132) — em silêncio, porque o contêiner que já estava rodando continuou rodando.
COPY services/backup/package.json ./services/backup/
RUN bun install --frozen-lockfile --production --filter @latexbookbank/renderer

# O contrato entra como pacote, não copiado por dentro: é o mesmo arquivo que a aplicação importa,
# e duplicá-lo aqui seria criar a chance de os dois lados divergirem sem ninguém perceber.
COPY packages/render-contract/src ./packages/render-contract/src
COPY services/renderer/src ./services/renderer/src

RUN chown -R renderer:renderer /app
USER renderer
ENV RENDERER_HOST=0.0.0.0 \
    RENDERER_PORT=28900 \
    NODE_ENV=production

EXPOSE 28900

# O healthcheck usa `/health`, que é a única rota sem autenticação — exatamente para isto.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD bun -e "const r = await fetch('http://127.0.0.1:28900/health'); process.exit(r.ok ? 0 : 1)"

CMD ["bun", "services/renderer/src/main.ts"]
