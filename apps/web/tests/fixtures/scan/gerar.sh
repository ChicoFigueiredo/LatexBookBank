#!/usr/bin/env bash
# Gera os PDFs das fixtures do scan. Os PDFs são versionados: a suíte não depende de TeX.
set -euo pipefail
cd "$(dirname "$0")"
for tex in book-a book-b book-c colunas formulas enem-sintetico livro-sintetico; do
  [ -f "$tex.tex" ] || continue
  for _ in 1 2; do pdflatex -interaction=nonstopmode -halt-on-error "$tex.tex" >/dev/null; done
done
rm -f ./*.aux ./*.log ./*.toc ./*.out
