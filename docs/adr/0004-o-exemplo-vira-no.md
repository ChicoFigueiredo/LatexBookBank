# O exemplo vira nó, e o ADR 0002 perde uma linha

O [ADR 0002](0002-tipos-do-scan-no-acervo.md) mandava o exemplo para o corpo da seção, em negrito,
com o argumento de que *exemplo* e *conteúdo* "não se comportam de modo diferente em nada que o
acervo faça depois". **O uso desmentiu isso.** Num livro como o *Curso de Análise*, com 107
exemplos, quem estuda procura "o Exemplo 12", navega até ele, manda o agente explicá-lo, quer
saber se já o conferiu. Dissolvido no corpo, o exemplo não tem endereço: não aparece na árvore,
não se liga a uma âncora própria, não tem estado.

**Decidimos alargar `NodeKind` com `EXAMPLE`** — o décimo primeiro valor. O exemplo passa a ser um
nó com corpo próprio, dentro do capítulo, da seção ou da subseção a que pertence, e sem filhos.
A linha `EXAMPLE` da tabela do ADR 0002 deixa de valer; `CONTENT` e `NOTE` continuam indo para o
corpo.

O scan passa a capturar o exemplo **até a próxima fronteira** — o próximo exemplo, o próximo
título ou o bloco de exercícios. Antes ele levava um parágrafo só, o que bastava para um rótulo em
negrito e não basta para um nó: um exemplo cuja resolução ficou de fora é pior que exemplo nenhum,
porque promete na árvore o que não entrega ao abrir.

## Considered options

**Manter o exemplo no corpo e marcá-lo melhor** — um ambiente LaTeX em vez de `\textbf`.
Rejeitada: resolve a aparência e não o endereço. O que falta não é formatação, é o exemplo existir
como coisa para a árvore, para a busca e para o *a revisar*.

**Exemplo como questão, de tipo discursivo.** Rejeitada: questão é o que se responde. Exemplo já
vem resolvido, não tem alternativa nem gabarito, e apareceria na montagem de avaliações, onde não
tem o que fazer.

**Nó e questão: o nó agrupa, a questão carrega o enunciado.** Rejeitada: dobra as entidades por um
exemplo que ninguém vai responder, e faria cada exemplo pagar o preço de uma questão — validação,
metadados, alternativas escondidas.

## Consequences

Onze tipos de nó, e cada tela que os conhece precisa conhecer mais um: o validador, o mapa de
ícones da árvore, o menu de criar, a lixeira e a lista de tipos com corpo. O `.lbb` não muda de
versão — o tipo é texto, e um arquivo antigo continua lendo.

Nada é migrado. No acervo de hoje não há um único exemplo aprovado, e os que existirem amanhã se
resolvem reimportando o livro, que é um gesto que passou a existir
([ADR 0006](0006-a-importacao-e-apagavel.md)). Um migrador que recortasse `\textbf{Exemplo N.}`
de corpos já editados à mão seria a esperteza que estraga trabalho.

O argumento do ADR 0002 continua valendo para os outros tipos: `ITEM`, `SUBITEM` e `FIGURE` seguem
sem virar nó, pelos motivos que ele dá. Alargar `NodeKind` uma vez não é licença para alargá-lo
sempre — a pergunta continua sendo se o tipo tem endereço próprio para quem usa.
