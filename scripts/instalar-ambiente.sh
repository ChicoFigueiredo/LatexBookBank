#!/usr/bin/env bash
#
# Instala as dependências de **sistema** do LatexBookBank. Rode com sudo:
#
#     sudo scripts/instalar-ambiente.sh
#
# ## O que este script instala, e o que ele deliberadamente não instala
#
# Só entra aqui o que precisa de `apt` — isto é, de root. `bun` e `node` vêm do `mise` (por
# usuário, sem sudo, e o `mise.toml` da raiz já fixa o Node em 24 porque o 20 mata a suíte no
# startup); `docker` e `ollama` têm instaladores próprios. Para esses, o script **confere e
# reporta**, em vez de tentar instalar por fora do gerenciador que os mantém — instalar o mesmo
# programa por dois caminhos é como se ganha duas versões e nenhuma atualizada.
#
# ## Por que TeX Live no host, se o render roda em contêiner
#
# O produto renderiza no worker Docker e não depende do TeX do host. Mas a suíte oficial
# (`bun test` na raiz, que roda todos os workspaces) inclui `services/renderer`, e lá
# `compile.test.ts` compila **contra o `pdflatex` de verdade** — sem ele são 9 testes falhando por
# ausência de ferramenta, o que é ruído indistinguível de regressão. A tela de Diagnóstico também
# sonda o host e mostra o que achou.
#
# A lista de pacotes é a mesma do `services/renderer/Dockerfile`, e ela não saiu de tutorial: veio
# de `kpsewhich` contra os `.sty` que o acervo legado usa de fato (tikz, pgfplots, siunitx, xlop).
# Manter as duas listas iguais é o que faz o teste local dizer a verdade sobre a imagem.
#
# `texlive-fonts-extra` fica **de fora de propósito**: são 1,41 GB por causa da `iwona`, uma fonte
# decorativa. A decisão está registrada no checklist — sem ela o documento cai na Latin Modern.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Este script precisa de root para usar o apt. Rode: sudo $0" >&2
  exit 1
fi

# Os pacotes de sistema, espelhando o Dockerfile do worker.
PACOTES=(
  texlive-latex-base
  texlive-latex-recommended
  texlive-latex-extra
  texlive-pictures
  texlive-science
  texlive-plain-generic
  texlive-fonts-recommended
  texlive-lang-portuguese
  texlive-publishers
  lmodern
  poppler-utils
  ca-certificates
)

faltantes=()
for pacote in "${PACOTES[@]}"; do
  # `dpkg-query` em vez de `dpkg -l | grep`: o grep casa nome parcial e daria por instalado um
  # pacote que só aparece como dependência sugerida de outro.
  if ! dpkg-query -W -f='${Status}' "${pacote}" 2>/dev/null | grep -q "^install ok installed$"; then
    faltantes+=("${pacote}")
  fi
done

if [[ ${#faltantes[@]} -eq 0 ]]; then
  echo "Pacotes de sistema: todos já instalados (${#PACOTES[@]})."
else
  echo "Faltam ${#faltantes[@]} de ${#PACOTES[@]} pacotes: ${faltantes[*]}"
  echo "Instalando (TeX Live completo passa de 2 GB; a primeira vez demora)…"
  apt-get update
  apt-get install -y --no-install-recommends "${faltantes[@]}"
fi

echo
echo "=== Conferência ==="

# Sonda igual à do `scripts/setup.mjs` e à do Diagnóstico: stdout **e** stderr, porque
# `pdftocairo -v` sai com código 0 escrevendo em stderr, e uma sonda que só lê stdout o dá por
# ausente.
conferir() {
  local rotulo="$1" comando="$2"
  shift 2
  if versao=$("${comando}" "$@" 2>&1 | head -1); then
    printf '  %-22s OK   %s\n' "${rotulo}" "${versao:0:52}"
  else
    printf '  %-22s FALTA\n' "${rotulo}"
    return 1
  fi
}

falhou=0
conferir "pdflatex (TeX Live)" pdflatex --version || falhou=1
conferir "pdftocairo (poppler)" pdftocairo -v || falhou=1

# Estes o script não instala — pertencem a outros gerenciadores. Conferir mesmo assim evita a
# situação de "instalei tudo" e o ambiente seguir sem subir.
for ferramenta in bun node docker ollama; do
  if command -v "${ferramenta}" >/dev/null 2>&1; then
    printf '  %-22s OK   %s\n' "${ferramenta} (externo)" "$("${ferramenta}" --version 2>&1 | head -1 | cut -c1-52)"
  else
    printf '  %-22s FALTA — instale por fora: %s\n' "${ferramenta} (externo)" \
      "$(case "${ferramenta}" in
           bun|node) echo "mise install (e 'mise trust' na raiz do repo)";;
           docker)   echo "https://docs.docker.com/engine/install/ubuntu/";;
           ollama)   echo "curl -fsSL https://ollama.com/install.sh | sh";;
         esac)"
    falhou=1
  fi
done

echo
if [[ ${falhou} -eq 0 ]]; then
  echo "Ambiente completo. Próximos passos (sem sudo, como seu usuário):"
  echo "  mise trust && bun install && bun run setup"
  echo "  ollama pull gemma3:12b       # modelo de visão da captura"
  echo "  docker compose up -d --build # worker de render"
else
  echo "Falta alguma coisa — veja as linhas marcadas acima."
  exit 1
fi
