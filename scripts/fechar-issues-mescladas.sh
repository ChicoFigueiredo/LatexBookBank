#!/usr/bin/env bash
# Fecha em lote as issues do GitHub cujo trabalho já está na `main`.
#
# Contexto (2026-09-09): 100 das 101 issues estavam abertas, mas cada issue de tarefa tem uma
# branch `<n>-<slug>` mesclada na main — inclusive as 23 auditorias de 10-11/08. Ninguém fechou
# as issues depois do merge. A fonte de verdade do progresso é docs/_atual/_checklist.md.
#
# Uso: bash scripts/fechar-issues-mescladas.sh           # fecha de verdade
#      DRY_RUN=1 bash scripts/fechar-issues-mescladas.sh # só mostra o que faria
#
# Requer `gh` autenticado. Idempotente: fechar issue já fechada só devolve erro inofensivo.
set -u
cd "$(dirname "$0")/.."
DRY_RUN="${DRY_RUN:-0}"
FONTE='Fonte de verdade do progresso: `docs/_atual/_checklist.md`.'
ok=0; falhas=0

close() { # numero mensagem
  if [ "$DRY_RUN" = "1" ]; then echo "[dry-run] fecharia #$1"; return; fi
  if gh issue close "$1" -c "$2" >/dev/null 2>&1; then ok=$((ok+1)); echo "ok #$1"; else falhas=$((falhas+1)); echo "FALHOU #$1"; fi
}

# 1. Toda branch `<n>-<slug>` mesclada na main fecha a issue n apontando o commit de ponta.
for branch in $(git branch --merged main | sed 's/^[* ]*//' | grep -E '^[0-9]+-'); do
  n="${branch%%-*}"
  hash="$(git rev-parse --short "$branch")"
  close "$n" "Fechada em lote em 2026-09-09: o trabalho está na \`main\` desde \`$hash\` (branch \`$branch\`, mesclada). A issue ficou aberta só por falta de fechamento. $FONTE"
done

# 2. As que não têm branch própria, mas têm o trabalho na main.
close 26  "Fechada em lote em 2026-09-09: entregue direto na \`main\` em \`6a3dc28\` (tokens e os três temas). $FONTE"
close 166 "Fechada em lote em 2026-09-09: corrigida junto com #156, na branch \`156-asset-storagekey\` (\`905d669\`). $FONTE"

# 3. As FEATURE de fase, fechadas pelo estado do checklist.
close 2   "Fechada em lote em 2026-09-09: a Fase 0 está fechada no checklist (70 itens; os dois health checks entraram no \`setup\` via #168). $FONTE"
close 25  "Fechada em lote em 2026-09-09: a Fase 1 foi aceita por decisão do Chico, sem conferência visual, depois de um mês de uso sem reclamação registrada. $FONTE"
close 34  "Fechada em lote em 2026-09-09: a Fase 2 está entregue; o único item aberto é a virtualização da árvore, adiada por decisão (a maior publicação tem 297 nós). $FONTE"
close 42  "Fechada em lote em 2026-09-09: a Fase 3 está fechada no checklist. $FONTE"

# 4. O épico #1 fica aberto: a Wave A ainda tem dois itens de verdade.
if [ "$DRY_RUN" != "1" ]; then
  gh issue comment 1 -b "Situação em 2026-09-09: todas as issues de tarefa e de fase da Wave A foram fechadas em lote, porque o trabalho já estava na \`main\`. O épico fica aberto porque a Wave A ainda tem dois itens de verdade: o preâmbulo pré-compilado embutido na imagem do renderer (Fase 6) e a suíte de integração contra PostgreSQL (Fase 6.5). $FONTE" >/dev/null 2>&1 && echo "comentado #1"
fi

echo "fechadas: $ok · falhas: $falhas"
echo "ainda abertas:"; gh issue list --state open --limit 50 --json number,title --jq '.[] | "  #\(.number) \(.title)"'
