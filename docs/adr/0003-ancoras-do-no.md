# Um nó tem várias âncoras, e elas são dele — não da questão

Um exercício que vira a página, ou uma questão do ENEM que desce a coluna esquerda e termina no
topo da direita, é **um** elemento com duas ou três âncoras. `DocumentNode` e `Question` tinham,
cada um, um `sourceAnchorId`. **Decidimos ligar as âncoras ao nó**, numa tabela com ordem e
papel (principal, continuação, ilustração, resposta, resolução, nota de rodapé), e a questão as
encontra pelo nó a que pertence — `DocumentNode.questionId` já é único.

## Considered options

**Uma tabela para o nó e outra para a questão.** Rejeitada: como todo nó de questão tem
exatamente uma questão, seriam duas verdades para o mesmo elemento, e cedo ou tarde divergiriam.

**A lista de âncoras em JSON no nó.** Rejeitada: a âncora é uma linha com recorte, texto e
modelo registrados, apontada por outras; JSON perde a integridade referencial e a consulta
"que nós usam esta página".

**Um retângulo único que cubra todas as partes.** Rejeitada pelo próprio problema: atravessaria
colunas e páginas e englobaria conteúdo vizinho.

## Consequences

`sourceAnchorId` fica, por ora, como âncora principal, escrita na mesma transação que a
tabela nova, porque a aba Origem, a fila de captura e o `.lbb` v1 o leem. A arquitetura nova não
depende dele; quando os leitores migrarem, ele sai. O `.lbb` v2 (ADR 0001) carrega a tabela.
