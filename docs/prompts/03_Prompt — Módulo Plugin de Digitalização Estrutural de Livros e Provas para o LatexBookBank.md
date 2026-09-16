# Implementar módulo plugável de digitalização estrutural de livros e provas no LatexBookBank

## 1. Contexto

Você trabalhará no repositório:

```text
https://github.com/ChicoFigueiredo/LatexBookBank
```

Use também como referência técnica, principalmente para segmentação de provas:

```text
https://github.com/ChicoFigueiredo/Estacio-TCC-Estacio-Matematica
```

Em especial, estude no segundo repositório:

```text
pipeline-notas/src/enem/recorte/
├── segmentacao.py
├── servico.py
├── render.py
├── revisao.py
├── pareamento.py
└── cadernos.py
```

Existe também uma fundação inicial no LatexBookBank na branch:

```text
feat/source-scan-plugin
```

e no PR:

```text
#201 — feat: add pluggable structural scanner foundation for books
```

Antes de implementar qualquer coisa, faça uma auditoria do estado atual do código e confirme quais partes dessa fundação continuam válidas.

---

# 2. Objetivo

Criar no LatexBookBank um **sistema plugável de digitalização estrutural de publicações**.

O sistema não deve ser apenas um OCR.

Ele deve compreender uma publicação como um documento editorial hierárquico e transformar um PDF em uma proposta estruturada contendo:

```text
Publicação
└── Parte
    └── Capítulo
        └── Seção
            └── Subseção
                ├── Conteúdo
                ├── Exemplo
                ├── Grupo de exercícios
                │   └── Exercício
                │       ├── Item
                │       └── Subitem
                └── Questão
```

A estrutura final deve continuar compatível com o modelo editorial existente do LatexBookBank.

O usuário deve poder digitalizar diferentes famílias de documentos ativando diferentes plugins/perfis de interpretação.

Inicialmente implementar:

```text
book-v1
exam-enem-v1
```

Arquitetar de forma que futuramente sejam possíveis, sem reescrever o motor:

```text
exam-vestibular-v1
exam-concurso-v1
book-mathematics-v2
book-physics-v1
worksheet-v1
article-v1
```

---

# 3. Princípio central

Separar obrigatoriamente:

```text
MOTOR GENÉRICO
       +
PLUGIN/PERFIL DA PUBLICAÇÃO
       +
PROVEDORES DE RECONHECIMENTO
```

O motor genérico sabe:

- abrir PDF;
- extrair geometria;
- extrair texto;
- localizar linhas, spans, imagens e desenhos;
- analisar fontes;
- determinar ordem de leitura;
- armazenar regiões;
- montar propostas;
- persistir proveniência;
- apresentar revisão.

O plugin sabe:

- como reconhecer títulos;
- como reconhecer capítulos;
- como reconhecer questões;
- qual hierarquia é válida;
- quais âncoras procurar;
- quais padrões editoriais são importantes;
- quando um elemento termina;
- como interpretar semanticamente uma região.

Os provedores existentes devem cuidar de:

```text
AiProvider
MathRecognitionProvider
StorageProvider
```

Não criar nova fronteira de infraestrutura apenas para encapsular algo que já pode ser executado por essas fronteiras.

O LatexBookBank possui testes que deliberadamente controlam o número de boundaries arquiteturais. Respeite isso.

---

# 4. Não criar um segundo produto dentro do LatexBookBank

Não portar o pipeline Python do TRI literalmente.

Extraia dele os algoritmos, decisões e testes importantes.

O LatexBookBank continuará sendo a aplicação principal.

A lógica deve ser incorporada à arquitetura existente:

```text
UI
→ Route Handler
→ Application Use Case
→ Domain
→ Repository / Provider
→ Infrastructure
```

Não permitir:

```text
UI → Prisma
UI → filesystem
domain → Prisma
domain → SDK de IA
domain → PDF renderer externo
```

---

# 5. Princípio fundamental: estrutura ≠ página

Não assumir que um elemento editorial ocupa um único retângulo.

Um elemento pode possuir:

```text
1..N regiões
```

Exemplo:

```text
Exercício 27

Página 84:
[x1,y1,x2,y2]

Página 85:
[x1,y1,x2,y2]
```

Essas duas regiões pertencem ao **mesmo exercício**.

Outro exemplo:

```text
Questão 176

segmento 1:
página 22, coluna esquerda

segmento 2:
página 22, coluna direita

segmento 3:
página 23, topo
```

Continua sendo uma única questão.

Esse requisito é obrigatório.

---

# 6. Proveniência é patrimônio

O LatexBookBank já possui:

```text
Publication
Asset
SourceAnchor
DocumentNode
Question
```

e coordenadas normalizadas entre:

```text
0..1
```

Preservar essa filosofia.

Qualquer item digitalizado precisa permitir responder:

> De que ponto exato da publicação original esse conteúdo veio?

Ao selecionar um:

- capítulo;
- seção;
- exemplo;
- exercício;
- questão;
- item;

a UI deve conseguir abrir o PDF original e destacar todas as regiões associadas àquele objeto.

---

# 7. Evoluir proveniência para multi-região

Atualmente partes do sistema trabalham com:

```text
sourceAnchorId
```

singular em `DocumentNode` e `Question`.

Isso é insuficiente.

Projetar relação ordenada de proveniência.

Uma solução aceitável seria equivalente a:

```text
DocumentNodeSource
- documentNodeId
- sourceAnchorId
- sortOrder
- role

QuestionSource
- questionId
- sourceAnchorId
- sortOrder
- role
```

Ou uma solução equivalente melhor, desde que:

1. suporte N anchors;
2. preserve ordem;
3. permita papéis diferentes;
4. não duplique desnecessariamente os dados de `SourceAnchor`.

Papéis sugeridos:

```text
PRIMARY
CONTINUATION
ILLUSTRATION
ANSWER
SOLUTION
FOOTNOTE
```

Durante migração, `sourceAnchorId` singular pode permanecer temporariamente como `primary anchor`, mas a arquitetura final não pode depender dele.

---

# 8. Não unir artificialmente regiões

Não criar um enorme bounding box atravessando:

- páginas;
- colunas;
- conteúdo vizinho.

O modelo deve preservar:

```text
Node
  ├── Region 1
  ├── Region 2
  └── Region 3
```

Cada região deve indicar:

```ts
{
  pageNumber,
  xNormalized,
  yNormalized,
  widthNormalized,
  heightNormalized,
  role,
  order
}
```

---

# 9. Aprendizados obrigatórios do segmentador ENEM

Estude profundamente o código existente em:

```text
pipeline-notas/src/enem/recorte/segmentacao.py
```

Preserve conceitualmente as seguintes decisões.

## 9.1 Âncora deve ser linha, não bloco

Não confiar cegamente em:

```text
PDF get_text("blocks")
```

como unidade semântica.

No material real do ENEM, o bloco pode juntar:

```text
Questão 176
```

com conteúdo da questão anterior.

O scanner precisa trabalhar com unidade mais fina:

```text
linha/span
```

com bounding box próprio.

---

# 10. Ordem de leitura real

Nunca assumir:

```text
top-to-bottom da página inteira
```

como ordem universal.

Construir ordem considerando:

```text
página
→ coluna
→ posição vertical
```

Um documento pode possuir:

```text
página 1: duas colunas
página 2: uma coluna
página 3: duas colunas
```

A geometria deve ser medida **por página**.

---

# 11. Não assumir coluna = metade da página

Não usar regras fixas como:

```text
width / 2
```

para detectar colunas.

Detectar layout usando evidências reais:

- margens de títulos;
- posição das linhas;
- cobertura horizontal;
- agrupamento de `x0`;
- calhas;
- elementos que atravessam coluna;
- quantidade mínima de conteúdo de cada lado.

Páginas especiais podem conter:

- tabela larga;
- gráfico;
- texto-base;
- figura;
- fórmula extensa;

e serem coluna única em documento majoritariamente de duas colunas.

---

# 12. Continuação não deve ser caso especial

Não escrever:

```text
if goes_to_next_column
if goes_to_next_page
```

como remendos específicos.

Usar conceito mais geral:

> Um elemento editorial ocupa tudo que existe entre sua âncora inicial e seu limite semântico seguinte na ordem de leitura.

Isso naturalmente permite:

```text
1 coluna
2 colunas
N colunas
próxima página
várias páginas
```

---

# 13. Diferenciar página visual de estrutura semântica

Pipeline recomendado:

```text
PDF
 ↓
Page Geometry
 ↓
Visual/Text Elements
 ↓
Candidate Anchors
 ↓
Segments
 ↓
Semantic Classification
 ↓
Hierarchy Proposal
 ↓
Human Review
 ↓
Persistence
```

Nunca tentar pedir para um LLM “ler o PDF inteiro e devolver JSON” como estratégia principal.

---

# 14. Estratégia híbrida

Priorizar:

```text
determinismo
→ heurística
→ IA
→ revisão humana
```

Não inverter essa ordem.

A IA não precisa decidir aquilo que pode ser inferido por:

- regex;
- fonte;
- tamanho;
- alinhamento;
- numeração;
- posição;
- sequência;
- estrutura anterior;
- estrutura posterior.

---

# 15. Plugin `book-v1`

Criar perfil inicial para livros.

Vocabulário intermediário sugerido:

```text
BOOK
PART
CHAPTER
SECTION
SUBSECTION
CONTENT
EXAMPLE
EXERCISE_GROUP
EXERCISE
QUESTION
ITEM
SUBITEM
FIGURE
NOTE
```

Esse vocabulário pode ser mais rico que `DocumentNode`.

Depois da revisão, mapear ao modelo persistente do LatexBookBank.

---

# 16. Reconhecimento determinístico de livro

Detectar inicialmente padrões como:

```text
PARTE I
Parte II

CAPÍTULO 4
Capítulo 4
Chapter 4

4 Funções

4.1 Funções lineares

4.1.1 Domínio

EXEMPLO 7
Exemplo 7

EXERCÍCIOS
Exercícios propostos

EXERCÍCIO 12
Exercício 12

1.
2.
3.

a)
b)
c)

(i)
(ii)
(iii)
```

Não limitar à língua portuguesa.

Preparar o plugin para reconhecimento configurável.

---

# 17. Evidências tipográficas

Considerar:

```text
font family
font size
relative font size
bold
italic
uppercase
centered
indentation
horizontal position
vertical whitespace before
vertical whitespace after
```

Em vez de valores absolutos, preferir medidas relativas ao padrão da publicação.

Exemplo:

```text
headingFontSize / medianBodyFontSize
```

---

# 18. Aprender o estilo do próprio livro

O scanner deve conseguir construir um pequeno perfil visual da publicação.

Exemplo:

```text
body = 10 pt

chapter = 22 pt bold
section = 14 pt bold
subsection = 11 pt bold
example = 10 pt italic + prefix
exercise = 10 pt bold + numbering
```

Esse perfil deve auxiliar páginas posteriores.

Não hardcodar exclusivamente tamanhos de fonte.

---

# 19. Table of Contents como pista

Quando disponível, usar o sumário como evidência importante.

Extrair possíveis:

```text
Part
Chapter
Section
Subsection
page
```

Não considerar o sumário verdade absoluta.

Usá-lo para gerar expectativas e conferir estrutura detectada.

Exemplo:

```text
Sumário diz:
Capítulo 7 ........ 132

Scanner encontra "Capítulo 7" na página PDF 145.

→ provável offset editorial de páginas.
```

Detectar automaticamente diferença entre:

```text
PDF page index
printed page number
```

---

# 20. Cabeçalho e rodapé

Detectar e classificar “mobília” repetitiva.

Exemplos:

```text
nome do livro
nome do capítulo
editora
número de página
ISBN
marca d'água
```

Usar repetição espacial em várias páginas.

Não misturar isso com conteúdo.

A lógica da TRI que identifica elementos repetidos deve ser aproveitada conceitualmente.

---

# 21. Figuras e desenhos

A leitura de página deve considerar:

```text
texto
imagem raster
desenho vetorial
fórmula
tabela
```

Não decidir os limites de um exercício olhando apenas texto.

Uma figura pertencente a uma questão precisa entrar na região mesmo que tenha pouco ou nenhum texto.

---

# 22. Reconhecimento matemático

O LatexBookBank já possui:

```text
MathRecognitionProvider
```

Reutilizá-lo.

Não criar outro mecanismo paralelo.

Quando uma região contiver matemática:

1. tentar extrair texto matemático nativo do PDF quando possível;
2. avaliar qualidade;
3. identificar regiões problemáticas;
4. enviar somente regiões necessárias ao reconhecedor matemático.

Resultado deve conter, quando possível:

```text
latex
confidence
alternatives
provider
model
duration
```

---

# 23. Não rasterizar tudo sem necessidade

Se o PDF tiver:

```text
text layer
font information
vectors
images
```

preservar essas informações.

Rasterizar deve ser fallback ou entrada específica para visão/OCR.

Não transformar PDF digital em pilha de JPEG antes da análise.

---

# 24. PDFs digitalizados

Também suportar PDFs cujo conteúdo é imagem.

Pipeline:

```text
page image
 ↓
layout analysis
 ↓
OCR
 ↓
math OCR
 ↓
semantic reconstruction
```

A arquitetura deve permitir substituir componentes sem alterar o plugin editorial.

---

# 25. IA local

O sistema deve trabalhar muito bem com IA local.

O LatexBookBank já possui abstração de IA OpenAI-compatible.

Permitir configuração de:

```text
Ollama
vLLM
OpenAI-compatible local endpoint
cloud provider
```

A aplicação não pode depender obrigatoriamente da internet.

---

# 26. Papel da IA

A IA serve principalmente para desambiguação semântica.

Exemplos:

> Esse bloco é uma explicação ou um exemplo?

> “Problemas propostos” inicia um grupo de exercícios?

> O texto da página seguinte continua o exercício anterior?

> Esta figura pertence ao exemplo 4 ou ao exercício 5?

> Esse número é uma enumeração estrutural ou parte de uma fórmula?

A IA deve receber contexto compacto e estruturado.

Evitar enviar o livro inteiro.

---

# 27. Contexto para IA

Preferir algo parecido com:

```json
{
  "previous_structure": [],
  "current_page": {},
  "next_page_summary": {},
  "visual_hints": {},
  "candidate_blocks": [],
  "publication_profile": {}
}
```

Forçar resposta estruturada validada.

Nunca aceitar texto livre do modelo diretamente no banco.

---

# 28. Confidence

Todo elemento proposto deve possuir confiança.

Exemplo:

```text
CHAPTER 0.99
SECTION 0.96
EXAMPLE 0.88
EXERCISE 0.74
CONTENT 0.62
```

A confiança pode combinar:

```text
pattern confidence
layout confidence
typography confidence
semantic confidence
continuity confidence
```

Não fingir precisão científica.

Ela serve para priorização de revisão.

---

# 29. Plugin `exam-enem-v1`

Depois de estabilizar o motor e `book-v1`, implementar:

```text
exam-enem-v1
```

Reutilizar profundamente os aprendizados do segmentador existente.

Reconhecer:

```text
QUESTÃO 136
QUESTÃO 137
...
```

e sequências de alternativas:

```text
A
B
C
D
E
```

Mas não considerar uma letra isolada prova suficiente.

A TRI já encontrou um padrão melhor:

> validar a sequência ordenada A,B,C,D,E alinhada aproximadamente na mesma margem.

Reproduzir esse princípio.

---

# 30. Diagnóstico de questão ENEM

Cada proposta deve poder informar:

```text
temCabecalho
alternativasEncontradas
alternativasFaltando
outraQuestaoDentro
possuiGrafico
atravessaColuna
atravessaPagina
```

Classificação sugerida:

```text
complete
incomplete
suspicious
insufficient_evidence
```

Automação pode aceitar automaticamente apenas quando houver critérios de qualidade explicitamente configurados.

Ainda assim, persistência editorial definitiva deve seguir política de revisão humana.

---

# 31. Língua estrangeira no ENEM

Preservar conhecimento do projeto TRI sobre:

```text
Inglês
Espanhol
```

Em determinados cadernos, a mesma numeração aparece duas vezes.

Não identificar questões apenas pelo número impresso.

Usar contexto da seção e língua.

---

# 32. Limites de seção em prova

A última questão de uma área não pode consumir o cabeçalho da próxima área.

Reconhecer marcos como:

```text
MATEMÁTICA E SUAS TECNOLOGIAS
LINGUAGENS...
CIÊNCIAS...
QUESTÕES DE X A Y
```

Esses elementos podem funcionar como limite semântico.

---

# 33. Página inteira para revisão

A interface deve permitir visualizar:

```text
PDF original
+
overlays
```

Não mostrar apenas o crop final.

O objetivo é o usuário poder responder visualmente:

> O sistema realmente associou o trecho certo?

---

# 34. UI desejada

Criar workspace de digitalização preferencialmente com três áreas:

```text
┌──────────────┬───────────────────────────────┬────────────────────┐
│ ESTRUTURA    │ PDF                           │ PROPRIEDADES        │
│              │                               │                    │
│ Parte I      │ página atual                  │ Tipo               │
│ └ Cap. 1     │                               │ Confiança          │
│   ├ 1.1      │ [overlays coloridos]          │ Texto              │
│   ├ Ex. 1    │                               │ LaTeX              │
│   └ Exerc.   │                               │ Regiões            │
└──────────────┴───────────────────────────────┴────────────────────┘
```

---

# 35. Sincronização árvore ↔ PDF

Ao selecionar um nó da árvore:

```text
→ abrir página correspondente
→ destacar todas as regiões
```

Se houver N regiões:

```text
Região 1
Região 2
Região 3
```

permitir navegar entre elas.

Ao clicar numa região do PDF:

```text
→ selecionar nó correspondente na árvore
```

---

# 36. Operações de revisão

Permitir no mínimo:

```text
alterar tipo
editar título
editar label original
reparentear
promover
rebaixar
unir propostas
separar proposta
adicionar região
remover região
redimensionar região
alterar ordem das regiões
marcar continuação
editar OCR
editar LaTeX
reprocessar com IA
reprocessar matemática
aceitar
rejeitar
```

---

# 37. Modo eficiente de digitalização

O fluxo deve permitir digitalizar um livro grande com pouco trabalho manual.

Evitar exigir confirmação individual de centenas de elementos de alta confiança.

Propor estados:

```text
AUTO_ACCEPTABLE
NEEDS_REVIEW
REJECTED
APPROVED
```

Mas nunca mascarar itens de baixa confiança.

---

# 38. Human-in-the-loop

Preservar a filosofia já existente no LatexBookBank:

> reconhecimento propõe; humano aprova.

Não permitir pipeline irreversível:

```text
OCR → Question
```

Preferir:

```text
OCR / Scanner
→ Proposal
→ Review
→ Approved Proposal
→ Domain
```

---

# 39. Proposal imutável/auditável

Criar entidade/conceito de execução que permita saber:

```text
profile
profileVersion
engineVersion
AI provider
AI model
math provider
math model
startedAt
finishedAt
source asset
configuration
```

Guardar o suficiente para reproduzir/auditar.

Não precisa necessariamente ser tudo tabela independente se não houver justificativa arquitetural, mas a execução precisa ser rastreável.

---

# 40. Estrutura de domínio sugerida

Algo próximo de:

```text
modules/
  source-scanning/
    domain/
      source-scan-profile.ts
      scan-proposal.ts
      scan-region.ts
      scan-confidence.ts
      reading-order.ts
      profiles/
        book.ts
        exam-enem.ts

    application/
      analyze-publication.ts
      build-structure-proposal.ts
      approve-scan-proposal.ts
      rescan-region.ts

    infrastructure/
      pdf/
      prisma/

    ui/
      ScannerWorkspace.tsx
      StructureTree.tsx
      SourcePdfViewer.tsx
      ScanPropertiesPanel.tsx
```

Ajustar aos padrões reais encontrados no repo.

Não impor essa árvore se a arquitetura atual indicar estrutura melhor.

---

# 41. Registro de plugins

Preferir registry explícito.

Exemplo conceitual:

```ts
registerSourceScanProfile(bookProfile);
registerSourceScanProfile(enemProfile);
```

Não usar:

- plugin discovery mágico;
- reflection;
- filesystem scanning em runtime;
- DI framework.

O LatexBookBank explicitamente favorece registro simples e legível.

---

# 42. Contrato do plugin

O contrato deve contemplar, conceitualmente:

```ts
interface SourceScanProfilePlugin {
  id: string;
  label: string;
  documentKind: string;

  classifyHeading(...): ...;

  canContain(parent, child): boolean;

  detectAnchors?(...): ...;

  detectSemanticBoundary?(...): ...;

  validateProposal?(...): ...;

  buildSemanticPrompt(...): string;
}
```

Não obrigar cada plugin a implementar comportamento que não possui.

---

# 43. Mapeamento de estrutura intermediária

Não aumentar desnecessariamente `NodeKind` persistente só porque o scanner tem maior riqueza.

Criar mapeamento.

Exemplo:

```text
EXAMPLE
→ CONTENT ou outro modelo editorial adequado

EXERCISE
→ QUESTION quando possuir conteúdo de questão
ou
→ QUESTION_GROUP / CONTENT conforme contexto

ITEM/SUBITEM
→ composição da questão ou nós estruturais conforme modelo
```

Antes de decidir, auditar o modelo atual e escrever ADR curta justificando o mapeamento escolhido.

---

# 44. Não destruir informação editorial

Preservar:

```text
originalLabel
printedPage
title
numbering
source regions
raw OCR
raw model output
corrected content
```

Quando houver correção humana, não apagar silenciosamente o original.

---

# 45. Conteúdo original versus revisado

Quando fizer sentido manter:

```text
rawText
rawLatex
reviewedText
reviewedLatex
```

ou equivalente auditável.

Não exigir colunas redundantes se o repo já possuir mecanismo para isso.

---

# 46. Uso eficiente de IA

Nunca enviar automaticamente cada linha do livro a um LLM.

Aplicar IA principalmente em:

```text
ambiguous candidate
low confidence
boundary ambiguity
continuation ambiguity
semantic classification
formula reconstruction
```

Criar batch contextual quando isso reduzir custo.

---

# 47. Processamento incremental

Digitalização de 600 páginas não pode depender de uma única request HTTP.

Construir processamento incremental/resumível.

Exemplo:

```text
QUEUED
ANALYZING_LAYOUT
EXTRACTING
STRUCTURING
SEMANTIC_REVIEW
READY_FOR_REVIEW
APPROVED
FAILED
```

Se o usuário fechar a aba, o trabalho concluído não deve desaparecer.

Reaproveitar princípios da fila persistente já existente no módulo de captura.

---

# 48. Idempotência

Rodar novamente o scanner sobre o mesmo:

```text
asset
+
profile
+
version
+
settings
```

não deve gerar bagunça silenciosa.

Ter chave/hash ou política clara de execução.

Nova versão do scanner pode gerar nova proposta.

Não sobrescrever automaticamente trabalho revisado.

---

# 49. Cancelamento

Uma execução longa deve poder ser:

```text
cancelada
retomada ou reiniciada
```

sem danificar:

```text
Publication
DocumentNode
Question
SourceAnchor
```

A proposta fica separada do conteúdo aprovado.

---

# 50. Scanner não altera o original

Assets de origem são patrimônio imutável.

Nunca modificar:

```text
source PDF
source image
```

Crops, thumbnails, OCR e renders são derivados.

---

# 51. Performance

Evitar reabrir/reprocessar o PDF para cada elemento.

Ter cache apropriado por execução para:

```text
page text
page lines
page geometry
page images
font statistics
layout
```

Não criar cache global impossível de invalidar.

---

# 52. Testes obrigatórios — Livro

Criar fixtures sintéticas e, quando possível, exemplos reais legalmente disponíveis.

Cobrir pelo menos:

### Livro A

```text
Capítulo
Seção
Texto
Exemplo
Exercício
```

### Livro B

```text
Parte
Capítulo
Subseção
Lista de exercícios
```

### Livro C

```text
exercício começa numa página
e termina na página seguinte
```

Resultado obrigatório:

```text
1 exercício
2 SourceAnchors/regiões
```

Não:

```text
2 exercícios
```

---

# 53. Testes obrigatórios — Colunas

Criar caso:

```text
página 1 → duas colunas
página 2 → uma coluna
página 3 → duas colunas
```

O reading order deve permanecer correto.

---

# 54. Testes obrigatórios — Fórmula

Fixture contendo:

```text
texto
fórmula inline
fórmula display
fração
radical
matriz
```

O conteúdo final deve preservar LaTeX semanticamente equivalente.

Não exigir equality textual de LaTeX quando duas expressões representam o mesmo conteúdo.

---

# 55. Testes obrigatórios — ENEM

Usar conhecimento e, quando permitido, fixtures do repositório TRI.

Cobrir:

```text
questão normal
questão com gráfico
questão atravessando coluna
questão atravessando página
alternativas como imagem/fórmula
última questão de área
bloco Inglês/Espanhol
```

---

# 56. Diagnóstico de segmentação

Não devolver apenas:

```text
success/failure
```

Gerar diagnóstico explicável.

Exemplo:

```json
{
  "status": "suspicious",
  "reasons": [
    "missing alternative E",
    "another question header found inside region"
  ]
}
```

A UI deve apresentar esses motivos.

---

# 57. Critério de aceite do scanner de ENEM

Usar corpus de referência e medir pelo menos:

```text
questões localizadas
questões completas
questões suspeitas
questões com invasão
questões com alternativa faltante
questões multi-coluna
questões multi-página
```

Não declarar “funciona” baseado apenas em screenshots.

---

# 58. Métricas do livro

Criar relatório de execução:

```text
páginas analisadas
elementos encontrados
capítulos
seções
exemplos
exercícios
questões
regiões
baixa confiança
erros
tempo
chamadas IA
chamadas math recognition
```

---

# 59. Correções humanas como aprendizado

Projetar desde o início para que futuramente possamos comparar:

```text
proposta automática
versus
resultado aprovado
```

Exemplos:

```text
SECTION → corrigido para EXAMPLE

região proposta:
page 44 y=.31-.70

região aprovada:
page 44 y=.31-.92
```

Não implementar treinamento automático agora.

Mas não jogar esses dados fora.

---

# 60. Segurança editorial

Nunca apagar ou substituir conteúdo aprovado ao executar novo scan.

Uma nova digitalização deve gerar:

```text
nova proposta
```

e eventualmente:

```text
diff
```

contra a estrutura aprovada.

---

# 61. Diff estrutural futuro

Arquitetar para possibilitar depois:

```text
+ chapter
- section
~ exercise
~ region
~ latex
```

entre scanner antigo e scanner novo.

Não precisa implementar UI completa de diff nesta fase se extrapolar o MVP.

---

# 62. Fases de implementação

Executar incrementalmente.

## Fase 0 — Auditoria

- revisar LatexBookBank;
- revisar PR #201;
- revisar segmentador TRI;
- mapear contratos existentes;
- documentar decisões.

Saída:

```text
docs/_atual/source-scanning-audit.md
```

---

## Fase 1 — Modelo multi-região

Implementar proveniência N:N ordenada.

Critério:

```text
um DocumentNode consegue apontar para duas regiões de duas páginas diferentes
```

com teste.

---

## Fase 2 — Page analysis

Extrair:

```text
lines
spans
fonts
images
drawings
geometry
repeated furniture
```

Criar modelo de página independente da UI.

---

## Fase 3 — Reading order

Implementar:

```text
single column
multi-column
mixed layout
```

com testes.

---

## Fase 4 — book-v1 determinístico

Detectar:

```text
parts
chapters
sections
subsections
examples
exercise groups
exercises
items
```

sem IA.

---

## Fase 5 — IA semântica

Integrar `AiProvider`.

IA deve atuar somente na proposta.

Nunca persistir diretamente.

---

## Fase 6 — Matemática

Integrar `MathRecognitionProvider`.

Detectar regiões que necessitam reconhecimento matemático.

---

## Fase 7 — Scanner Workspace

Criar UI de revisão.

Obrigatório:

```text
tree
PDF
overlays
properties
multi-region navigation
```

---

## Fase 8 — Aprovação

Converter proposta revisada em:

```text
DocumentNode
Question
SourceAnchor relations
```

de forma transacional.

---

## Fase 9 — exam-enem-v1

Portar conceitualmente o conhecimento do projeto TRI.

Não copiar cegamente Python.

Criar implementação adequada à arquitetura do LatexBookBank.

---

## Fase 10 — Auditoria e benchmark

Rodar corpus de testes e produzir:

```text
docs/_atual/source-scanning-validation.md
```

---

# 63. Definition of Done

Não considerar concluído enquanto não houver evidência dos itens seguintes.

### Arquitetura

- [ ] motor genérico separado de plugins;
- [ ] `book-v1`;
- [ ] `exam-enem-v1`;
- [ ] sem nova boundary injustificada;
- [ ] sem acesso Prisma em UI/domain.

### Proveniência

- [ ] N regiões por objeto;
- [ ] regiões ordenadas;
- [ ] coordenadas normalizadas;
- [ ] PDF original preservado;
- [ ] navegação objeto → origem.

### Livro

- [ ] parte;
- [ ] capítulo;
- [ ] seção;
- [ ] subseção;
- [ ] exemplo;
- [ ] exercício;
- [ ] item/subitem;
- [ ] exercício multi-página.

### Prova

- [ ] questão;
- [ ] alternativas;
- [ ] multi-coluna;
- [ ] multi-página;
- [ ] gráfico;
- [ ] limites de área;
- [ ] Inglês/Espanhol.

### Matemática

- [ ] fórmula inline;
- [ ] fórmula display;
- [ ] provider configurável;
- [ ] confiança registrada.

### IA

- [ ] funciona sem IA para casos determinísticos;
- [ ] aceita IA local;
- [ ] provider/model registrados;
- [ ] nenhum output de IA entra no acervo sem revisão.

### UX

- [ ] árvore + PDF + propriedades;
- [ ] highlight das regiões;
- [ ] correção manual;
- [ ] edição de OCR/LaTeX;
- [ ] aprovação/rejeição.

### Robustez

- [ ] processamento resumível;
- [ ] falha não destrói trabalho;
- [ ] idempotência;
- [ ] testes;
- [ ] lint;
- [ ] typecheck;
- [ ] build.

---

# 64. Critérios de qualidade

Não aceite solução baseada em:

```text
regex gigantes
hardcodes por página
if year == ...
coordenadas fixas
width / 2
LLM como parser universal
OCR integral obrigatório
uma região por item
```

Prefira:

```text
geometria real
ordem de leitura
âncoras
plugins
evidência
diagnóstico
confidence
proveniência
human-in-the-loop
```

---

# 65. Princípio final

O objetivo não é:

> transformar PDF em texto.

O objetivo é:

> reconstruir a estrutura editorial e matemática de uma publicação mantendo uma ligação auditável entre cada elemento estruturado e a região exata do documento original de onde ele foi derivado.

O scanner deve conseguir responder, para qualquer elemento:

```text
O que é?
Onde está?
De que ele faz parte?
Quais regiões físicas o compõem?
O que o sistema entendeu?
Qual foi a confiança?
Qual modelo ajudou?
O que o humano corrigiu?
Qual é o conteúdo LaTeX final?
```

Esse é o produto.

---

# 66. Forma de trabalho esperada do agente

Antes de codificar cada fase:

1. leia a implementação relacionada;
2. encontre os testes existentes;
3. proponha a menor alteração coerente;
4. implemente;
5. escreva testes;
6. rode:

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

7. só então avance.

Não marque etapa como pronta sem evidência.

Ao encontrar diferença entre este prompt e a arquitetura real do repositório:

- preserve a intenção funcional;
- respeite a arquitetura existente;
- documente a decisão;
- não faça refatoração ampla sem necessidade.

Produza commits pequenos, semanticamente claros e revisáveis.

O resultado final deve ser um módulo de digitalização estrutural que permita digitalizar um livro ou uma prova com o **mínimo possível de trabalho humano**, mas sem sacrificar rastreabilidade, estrutura editorial, matemática ou fidelidade à publicação original.