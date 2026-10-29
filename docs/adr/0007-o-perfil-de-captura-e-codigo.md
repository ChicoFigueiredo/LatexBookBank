# O perfil de captura é código com ganchos, não oito campos declarativos

A [D41](../_atual/_planejamento.md) decidiu que um perfil de captura declara oito coisas:
marcadores de início de questão · marcador de fim ou de solução · títulos de capítulo e de seção ·
marcador do bloco de exercícios · onde ficam as respostas · número de colunas · tipo padrão da
questão criada · modelo de visão. A D46 estendeu isso com ganchos opcionais, e o checklist marcou
"contrato com os oito campos da D41" como feito.

Conferidos um a um, um ano de uso depois: **sete dos oito nunca foram lidos por ninguém.** Os três
perfis preenchiam `markers`, `columns`, `visionModel` e `answersLocation`, e nenhum consumidor
existia — o `columns: 2` do `exam-enem-v1` não tinha efeito algum, porque quem mede coluna é o
gancho `columnHints`. Só `defaultQuestionType` era lido, na aprovação.

Pior que campo morto, havia **gancho** morto: `isBoundary` era declarado *e chamado* pelo motor, e
perfil nenhum o implementava. Um ramo que nunca executou, com a aparência de um recurso que existe.

**Decidimos que o perfil de captura é código com ganchos, e que o contrato declara só o que alguém
lê.** Os sete campos saem, o ramo morto sai, e um campo volta quando tiver consumidor — não antes.

No lugar entra **um** gancho, obrigatório: cada perfil pontua uma amostra do documento e devolve a
nota com a evidência por escrito. Ele responde as duas perguntas que sempre foram a mesma — antes
da varredura, qual perfil sugerir para este PDF; depois dela, se o perfil escolhido foi o errado.

## Considered options

**Implementar os consumidores dos quatro campos.** Rejeitada: seria escrever motor para satisfazer
um contrato, e não porque um livro real pediu. O `answersLocation` é o caso mais claro — ele
descreve um recurso que não existe, achar o gabarito no fim do volume, e que não está planejado.
Um contrato não é uma lista de desejos.

**Manter os marcadores como documentação legível do perfil.** Rejeitada na forma em que estavam:
um campo do contrato que o motor não lê é uma promessa falsa para quem escrever o próximo perfil.
As expressões continuam no arquivo de cada perfil, onde são usadas de verdade.

**Um detector central para a sugestão, em vez de um gancho por perfil.** Rejeitada: concentraria
num arquivo a heurística de reconhecer todo tipo de documento, e cada perfil novo exigiria editá-lo
também. Quem sabe reconhecer "QUESTÃO N em duas colunas" é o `exam-enem-v1`.

**Rodar os três perfis de verdade sobre uma amostra e comparar o resultado.** Rejeitada por preço:
são três varreduras curtas antes de a pessoa poder escolher, e a nota entrega quase a mesma
resposta por uma fração do custo.

## Consequences

A D41 do planejamento e a linha do checklist que a dava por cumprida ficam corrigidas junto: quem
ler o planejamento amanhã não vai escrever um perfil preenchendo campo que ninguém lê.

O corpus real ensinou três coisas que o PDF sintético não ensina, e todas viraram código:

- Num caderno do ENEM, `exam-v1` e `exam-enem-v1` saturavam em 1,00 — "QUESTÃO 45" casa com os
  dois — e o desempate virava ordem de registro. Faltava ao `exam-v1` pontuar o que o distingue:
  uma coluna só.
- O `book-v1` dava 0,95 na prova do ENA, contando "1. Considere a função" como título numerado. Era
  o defeito do PR #201 reproduzido dentro da nota, e a correção é a mesma: título de livro é título
  **e** tem corpo de título.
- Lendo as oito primeiras páginas, o `book-v1` pontuava **zero** no *Curso de Análise*: capa,
  créditos, prefácio e sumário, e o primeiro capítulo na página 13. A amostra passou a ser
  espalhada pelo documento.

O *Fundamentos* fica fora da asserção do corpus, e o motivo é o assunto de outra fase: o `book-v1`
pontua 0,05 nele, e está certo — é o livro em que ele acha 0 exemplos, 0 exercícios e 453 falsas
seções. A nota baixa é evidência a favor do perfil próprio que o checklist já pede; forçá-la a
subir seria ajustar heurística até o número mentir.

E `/api/capture-profiles` foi apagada pelo mesmo critério aplicado a um endpoint: não tinha um
consumidor sequer, porque a tela é componente de servidor e lê o registro direto.

**Revisto pela Fase 25.** O *Fundamentos* deixou de ser a exceção: ganhou perfil próprio
(`book-fme-v1`, com zonas — [ADR 0009](0009-a-zona-do-documento.md)), voltou à asserção do corpus
e é sugerido por ela. A medição de hoje é a do `scan-corpus.test.ts` — 568 exercícios e 361
questões de vestibular, sem buraco na numeração —, e não a nota de 0,05 do `book-v1` citada acima.
