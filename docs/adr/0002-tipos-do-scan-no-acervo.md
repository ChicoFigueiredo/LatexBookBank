# O scan fala mais tipos do que o acervo, e a aprovação traduz

O perfil de captura enxerga num livro mais do que a árvore guarda: exemplo, exercício, item,
subitem, figura, nota. `NodeKind` tem dez valores e já serve à importação do legado, às
avaliações e ao `.lbb`. **Decidimos não alargar `NodeKind`**: a proposta de scan usa o
vocabulário rico, e a aprovação o traduz para o que o acervo já sabe guardar.

| Proposta | Acervo |
|---|---|
| `PART` · `CHAPTER` · `SECTION` · `SUBSECTION` | o mesmo `NodeKind` |
| `EXERCISE_GROUP` | `QUESTION_GROUP` |
| `EXERCISE` · `QUESTION` | nó `QUESTION` + `Question` em `DRAFT`, tipo padrão do perfil |
| `ITEM` · `SUBITEM` | não viram nó: `enumerate` no LaTeX da questão, e as âncoras passam a ela |
| `FIGURE` | âncora de papel *ilustração* do elemento que a contém — **e asset, revisado pelo [ADR 0005](0005-figura-vetorial-quando-o-pdf-a-tem.md)** |
| `EXAMPLE` | ~~corpo do nó~~ — **revisado: vira nó, [ADR 0004](0004-o-exemplo-vira-no.md)** |
| `CONTENT` · `NOTE` | corpo do nó da seção que os contém (ADR 0001), em ordem de leitura |

## Considered options

**Um `NodeKind` por tipo proposto.** Rejeitada: cada valor novo precisa de tela, de regra de
render, de exportação e de migrador do `.lbb`, e *exemplo* e *exercício* não se comportam de modo
diferente de *conteúdo* e *questão* em nada que o acervo faça depois.

**Item como nó filho da questão.** Rejeitada: a questão não tem filhos na árvore, e o item só
tem sentido dentro do enunciado — é assim que ele compila e que ele se embaralha numa avaliação.

## Consequences

Duas linhas desta tabela foram revisadas depois, e o motivo está nos ADRs que as revisam: o
exemplo ganhou endereço próprio (0004) e a figura passou a ser arquivo, além de âncora (0005). O
resto continua valendo.

O rótulo original (`Exemplo 7`, `Exercício 12`) sobrevive em `originalLabel`, então a
distinção entre exemplo e conteúdo não se perde, só não vira tipo. A proposta aprovada guarda o
tipo rico, e é dela que um diff futuro entre scans parte.
