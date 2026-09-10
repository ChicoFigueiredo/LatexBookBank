# A seção do livro ganha corpo, e o `.lbb` chega à v2

Até aqui o conteúdo do acervo morava exclusivamente na questão: capítulo e seção só ordenavam a
árvore, e o nó estrutural não tinha texto. Ao desenhar o scan de livro-texto (2026-09-10)
ficou claro que a teoria — definições, enunciados de teorema, exemplos resolvidos — não tem
onde ficar, e que ela é parte do que se quer capturar de um livro como o *Curso de Análise*.
**Decidimos dar corpo ao nó estrutural, em LaTeX**, editado no mesmo Monaco da questão e
compilado pelo mesmo worker.

## Considered options

**Forçar a teoria num tipo de questão.** Rejeitada: uma definição não tem enunciado, gabarito
nem alternativa, e um tipo que existe só para não mexer no schema contamina a validação, o
embaralhamento de variantes e as telas de todo o resto.

**Guardar só as imagens das páginas, ligadas à seção.** Rejeitada: não é buscável, não compõe
com o LaTeX das questões na hora de imprimir uma lista, e o produto inteiro é sobre ter o
conteúdo em LaTeX, não uma fotografia dele.

**Deixar a teoria fora, o PDF continua sendo a leitura.** Foi a decisão vigente até hoje, e
ainda é a certa para o produto atual — banco de **questões**. O que a muda é o scan de
livro-texto: uma vez que a máquina já está lendo a página inteira, jogar fora a metade que não
é exercício é perda deliberada de trabalho já feito.

## Consequences

**O Portable Schema vai para a v2.** O `.lbb` (D18, D37) carrega uma tabela de nós que não tem
o campo novo. Este é o primeiro motivo real para versionar o formato, e com ele nasce o
migrador `v1 → v2` que a D37 previu "quando fizer sentido" — até agora, com uma versão só, não
fazia. O importador continua recusando versão desconhecida em vez de adivinhar.

**O nó estrutural passa a ter render.** Um capítulo com corpo é compilável, o que significa
`RenderJob`, cache por hash e histórico de revisões também para o nó — caminhos que hoje só a
questão exercita.

**A pendência das 5 figuras órfãs de Fundamentos muda de natureza.** Elas estão em nós
`TipoQuestao = -1`, cujo `latexResposta` o import descarta hoje justamente porque não havia
onde pôr. Com corpo no nó, passa a haver. A decisão de 2026-09-09 de deixá-las fora vale
enquanto o corpo não existir; quando existir, cabe reimportá-las.
