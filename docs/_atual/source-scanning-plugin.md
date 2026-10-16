# Scanner estrutural de publicações

## Objetivo

Digitalizar uma publicação com **proveniência visual verificável** e mínimo trabalho manual.

A saída do scanner não é apenas OCR. É uma proposta editorial hierárquica capaz de reconhecer:

- parte;
- capítulo;
- seção e subseção;
- conteúdo;
- exemplo;
- grupo de exercícios;
- exercício;
- item e subitem;
- figura e nota.

O primeiro perfil implementado é `book-v1`. Provas ficam para um perfil futuro (`exam-enem-v1`) porque têm heurísticas diferentes.

## Princípio central: nó semântico != recorte

Um nó pode ter **N regiões de origem**.

Exemplo: um exercício começa no rodapé da página 84 e continua no topo da página 85. Isso é **um único EXERCISE**, ligado a dois `SourceAnchor`s ordenados.

Esse desenho generaliza a solução já validada no repositório `Estacio-TCC-Estacio-Matematica`: a segmentação do ENEM trata a questão como tudo o que existe entre a âncora atual e a próxima na ordem de leitura. A continuação pode atravessar coluna ou página sem virar caso especial.

## Pipeline proposto

```text
SOURCE_PDF Asset
    |
    v
1. PDF geometry/text pass
   - texto extraível, spans e linhas
   - bbox normalizada
   - tamanho/peso de fonte
   - imagens e desenhos
   - ordem de leitura/colunas
    |
    v
2. deterministic structure pass
   - títulos explícitos (Capítulo, Seção, Exemplo, Exercícios...)
   - numeração 1 / 1.2 / 1.2.3
   - evidência tipográfica
   - continuidade entre páginas
    |
    v
3. semantic pass via existing AiProvider
   - Ollama/OpenAI-compatible local model permitido
   - recebe descrição compacta das páginas, não regra de negócio
   - propõe árvore + confiança + justificativas
    |
    +--> MathRecognitionProvider para regiões matemáticas difíceis
    |
    v
4. review proposal
   - árvore proposta à esquerda
   - PDF à direita
   - selecionar nó destaca TODAS as regiões de origem
   - editar tipo/título/hierarquia/recortes
   - merge/split entre nós
    |
    v
5. persist after approval
   - DocumentNode / Question / QuestionOption
   - SourceAnchor(s)
   - texto e LaTeX revisados
   - método/modelo/confiança preservados
```

## Plugin de perfil

Arquivo-base:

`apps/web/src/modules/source-scanning/domain/source-scan-profile.ts`

O perfil controla somente o vocabulário e a interpretação editorial:

```ts
interface SourceScanProfilePlugin {
  id: string;
  label: string;
  documentKind: "BOOK" | "EXAM";
  semanticKinds: ScanSemanticKind[];

  classifyHeading(evidence): HeadingClassification | null;
  canContain(parent, child): boolean;
  buildSemanticPrompt(input): string;
}
```

Ele **não** cria uma nova fronteira de infraestrutura. Storage, IA e reconhecimento matemático continuam passando pelas fronteiras existentes.

## Mudança de modelo necessária antes da persistência completa

Hoje `DocumentNode.sourceAnchorId` e `Question.sourceAnchorId` aceitam uma única origem.

O scanner estrutural precisa de cardinalidade N:N ordenada. Sugestão:

```text
DocumentNodeSource
- nodeId
- sourceAnchorId
- position
- role: PRIMARY | CONTINUATION | ILLUSTRATION | ANSWER

QuestionSource
- questionId
- sourceAnchorId
- position
- role
```

Durante a migração, `sourceAnchorId` atual pode permanecer como âncora primária para compatibilidade. Depois que todos os consumidores lerem as coleções, os campos singulares podem ser depreciados.

Não comprimir duas páginas em um único bounding box artificial: a região deve continuar sendo uma lista de retângulos reais sobre o PDF.

## UI recomendada

### Aba `Digitalizar`

Layout de três áreas:

```text
+----------------------+-----------------------------+------------------+
| Estrutura proposta   | PDF                         | Propriedades      |
|                      |                             |                  |
| Cap. 3               | [página 84]                | Tipo: EXERCISE   |
|  3.1 ...             |  [highlight 1]             | Confiança: 91%   |
|  Exemplo 7           |                             |                  |
|  Exercício 12  <---- | [página 85]                | Regiões: 2       |
|                      |  [highlight 2]              | [unir] [separar] |
+----------------------+-----------------------------+------------------+
```

Ao clicar no nó, todas as regiões aparecem destacadas no PDF. Cada região deve ser ajustável com as mesmas alças do crop existente.

A revisão precisa permitir:

- trocar o tipo do nó;
- promover/rebaixar hierarquia;
- arrastar na árvore;
- juntar duas propostas;
- separar uma proposta;
- adicionar/remover região;
- marcar região como continuação, ilustração ou resposta;
- revisar texto/LaTeX;
- aceitar em lote nós de alta confiança.

## Aprendizado do recortador ENEM

A implementação de referência em `Estacio-TCC-Estacio-Matematica/pipeline-notas/src/enem/recorte/segmentacao.py` tem quatro decisões que devem virar regras do motor genérico:

1. **Âncora por linha, não por bloco.** Blocos de PDF podem juntar texto semanticamente independente.
2. **Layout medido, não presumido.** Colunas e margens variam por página.
3. **Ordem de leitura explícita.** Página + coluna + coordenada vertical formam a sequência.
4. **Continuação é normal.** O conteúdo vai da âncora atual ao próximo limite e pode gerar vários segmentos.

Para livros, a noção de âncora se amplia: heading, marcador de exemplo/exercício, numeração, mudança tipográfica e sinais semânticos.

## Fórmulas matemáticas

Estratégia recomendada em camadas:

1. preservar texto/fórmula nativa do PDF quando disponível;
2. extrair bbox e imagem da expressão quando a camada textual for ruim;
3. passar somente a região difícil pelo `MathRecognitionProvider`;
4. usar `AiProvider` para contexto semântico, nunca para esconder baixa confiança;
5. mostrar lado a lado fonte e LaTeX antes da aprovação.

O sistema deve preferir `"não sei" + revisão` a fórmula inventada.

## Perfis futuros

### `exam-enem-v1`

Deve reaproveitar do projeto TRI:

- `QUESTÃO N` como âncora forte;
- detecção de alternativas A-E em sequência e alinhamento;
- medição de colunas página a página;
- recorte até a próxima âncora/marco de seção;
- diagnóstico de completude;
- suporte nativo a múltiplos segmentos.

A diferença é que o resultado entra no modelo do LatexBookBank (`Question`, opções e `SourceAnchor`s), não em PNGs isolados.

### outros perfis possíveis

- `exam-generic-v1`;
- `article-v1`;
- `worksheet-v1`;
- `answer-key-v1`.

## Critérios de aceite do MVP livro

1. PDF de livro pode ser selecionado a partir de `Publication.sourcePdfAssetId`.
2. Scanner propõe ao menos capítulo, seção, exemplo e exercício.
3. Exercício que atravessa página aparece como um único nó com duas regiões.
4. Selecionar qualquer proposta destaca todas as regiões no PDF.
5. Fórmula matemática tem trilha de reconhecimento e confiança.
6. Nada é persistido como conteúdo final sem revisão explícita.
7. Cada nó aprovado permite voltar visualmente a todos os trechos que o originaram.
8. Scanner funciona com IA local por endpoint OpenAI-compatible.
9. Um perfil novo não exige alterar o motor central por `switch` global.
10. Testes cobrem classificação, hierarquia e multi-região.
