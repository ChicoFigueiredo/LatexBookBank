/**
 * O que o `pdflatex` pode abrir (#244, SEC-02 da revisão de 2026-09-23).
 *
 * `-no-shell-escape` impede executar comando, e só. Com o `openin_any=a` padrão do TeX Live,
 * `\openin` lê qualquer caminho — `/etc/passwd`, `/proc/1/environ` com o `RENDERER_SECRET` —, e
 * o que ele lê volta no log, que a aplicação grava, mostra e manda ao modelo de IA.
 *
 * `p` é o modo paranoico do kpathsea: nada de arquivo oculto, nada de `../`, e caminho absoluto só
 * dentro de `TEXMFOUTPUT` (que não definimos). O documento lê o que está no diretório do job e o
 * que o kpathsea acha na árvore do TeX Live — pacotes, fontes, o formato —, e nada mais. As
 * variáveis de ambiente de mesmo nome valem por cima do `texmf.cnf`, então isto não depende de
 * como a imagem foi montada.
 */
export const PARANOID_FILES = {
  openin_any: "p",
  openout_any: "p",
} as const;
