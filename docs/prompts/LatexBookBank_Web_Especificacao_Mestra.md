# LatexBookBank Web — Especificação Mestra de Produto, Arquitetura e Backlog

> **Repositório de origem:** `ChicoFigueiredo/e-matematica-Banco-Questoes`  
> **Objetivo:** reconstruir a ideia do aplicativo WPF legado como uma aplicação web local-first em TypeScript/Next.js, preservando as melhores ideias do domínio existente e preparando a base para PostgreSQL, colaboração, automação agêntica e futuro SaaS.
>
> **Status deste documento:** proposta de implementação + prompt mestre + checklist de aceite + backlog Epic → Feature → Issue.
>
> **Regra de ouro:** o legado é uma especificação executável. Não portar WPF componente a componente. Reaproveitar conceitos, dados e regras úteis; reimplementar a experiência e as fronteiras arquiteturais de forma limpa.

---

# 1. Prompt mestre para o time

Construa uma aplicação chamada **LatexBookBank Web** com foco em autoria e organização de livros técnicos e bancos de questões matemáticas em LaTeX.

A aplicação deve rodar **localmente** com o menor atrito possível, usando **TypeScript + Next.js**, armazenar os dados inicialmente em **SQLite**, permitir migração futura para **PostgreSQL**, trabalhar com uma **árvore hierárquica arbitrária de conteúdo**, oferecer edição LaTeX profissional com **Monaco Editor**, preview rápido em HTML e preview autoritativo por compilação LaTeX, ingestão de imagens/crops para reconhecimento matemático, organização estruturada de questões e alternativas, geração reprodutível de variantes de provas e um **painel agêntico lateral** capaz de analisar, corrigir, enriquecer e futuramente operar em lote sobre o acervo.

O produto deve ter aparência premium, limpa e profissional, inspirado na linguagem visual do Admin do EduLingo: alta densidade de informação sem poluição, superfícies claras, tipografia consistente, ações importantes muito visíveis, bordas sutis, estados de processamento claros, layout redimensionável e sensação de IDE editorial.

## 1.1 Princípios inegociáveis

- TypeScript estrito em todo o código novo.
- Next.js App Router.
- Aplicação local-first.
- SQLite no primeiro momento.
- Persistência isolada atrás de uma camada que permita PostgreSQL futuramente.
- O legado WPF não deve ser alterado para implementar o produto novo.
- Conteúdo canônico deve ser separado de artefatos gerados.
- PDF/PNG/SVG renderizado é cache/artefato, não fonte da verdade.
- Alternativas devem ter identidade independente da letra exibida.
- Randomização deve ser determinística e reproduzível por `seed`.
- A árvore de conteúdo não deve ter profundidade fixa.
- O agente nunca deve alterar conteúdo silenciosamente: propor patch → mostrar diff → usuário aprova → aplicar.
- Provider de IA deve ser abstrato.
- Primeiros providers:
  - OpenAI.
  - IA local via endpoint compatível, preferencialmente Ollama.
- Toda operação agêntica deve gerar histórico/auditoria.
- Compilação LaTeX deve ser isolada do processo principal.
- Nenhum segredo pode ser salvo no repositório.
- Toda feature deve possuir critérios de aceite verificáveis.

---

# 2. O que foi identificado no legado e deve ser preservado conceitualmente

O aplicativo antigo já contém sementes importantes do produto futuro:

- `Publication` como conceito de livro/publicação.
- Importação de PDF como fonte de publicação.
- Metadados bibliográficos.
- Estrutura de questões hierárquica com relação pai/filho.
- Tipos de nó/questão como capítulo, seção, subseção, questão discursiva e múltipla escolha.
- Ordenação explícita.
- Questões com:
  - enunciado LaTeX;
  - resposta;
  - complemento;
  - origem;
  - dificuldade;
  - banca;
  - instituição;
  - cargo;
  - ano;
  - tags de conhecimento;
  - imagem original;
  - imagem gerada.
- Alternativas como entidades próprias.
- Campo `Correta` por alternativa.
- `Ordem` por alternativa.
- Preview PNG.
- Renderização usando `pdflatex` + `pdftocairo`.
- Banco separado de metadados LaTeX contendo:
  - símbolos;
  - grupos;
  - autocomplete;
  - snippets;
  - menus/atalhos.
- Editor AvalonEdit com:
  - syntax highlighting;
  - autocomplete;
  - atalhos;
  - placeholders em templates.
- Ctrl+V de imagem.
- Geração automática de bloco `figure/includegraphics`.
- Uso real de packages mais avançados:
  - AMS;
  - TikZ;
  - PGFPlots;
  - `siunitx`;
  - tabelas;
  - `xlop`;
  - `cancel`;
  - outros.
- Armazenamento do PDF original e assets relacionados à publicação.
- Conceito embrionário de fila/coalescência de renders.

Essas ideias não devem ser descartadas. Elas devem ser reorganizadas em módulos limpos.

---

# 3. Visão do produto

O LatexBookBank Web deve ser, ao mesmo tempo:

1. **biblioteca técnica**;
2. **editor estruturado de livros**;
3. **IDE LaTeX editorial**;
4. **banco de questões**;
5. **motor de geração de avaliações**;
6. **ambiente de ingestão de PDF/imagens**;
7. **plataforma agêntica assistida por IA**;
8. base para futuro **SaaS multiusuário**.

## 3.1 Diferencial central

A maioria dos bancos de questões trata cada pergunta como um blob estático.

O LatexBookBank deve tratar cada questão como **conteúdo estruturado, versionável, reutilizável e transformável**.

Exemplos:

- embaralhar alternativas mantendo o gabarito;
- gerar prova A/B/C/D;
- reconstruir a mesma prova usando uma seed;
- filtrar questões por dificuldade, assunto, fonte, banca, ano;
- trocar a ordem das questões;
- gerar versão aluno e professor;
- produzir PDF em templates diferentes;
- pedir ao agente para:
  - revisar LaTeX;
  - explicar erro de compilação;
  - enriquecer metadados;
  - propor tags;
  - sugerir resposta;
  - converter um texto em questão estruturada;
  - revisar alternativas;
  - futuramente operar em centenas de itens.

---

# 4. Experiência principal — layout em quatro painéis

A área editorial principal deve ser uma IDE de conteúdo.

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ LatexBookBank   Livro atual        Busca global / Ctrl+K          Salvo ✓     Render ▷     Agente ✦ │
├─────────────────────┬──────────────────────────────────┬──────────────────────────┬──────────────────┤
│ ÁRVORE              │ EDITOR                           │ PREVIEW                  │ AGENTE           │
│                     │                                  │                          │                  │
│ ▾ Capítulo I        │ [Enunciado] [Resposta] [Meta]   │ HTML | PDF | PNG | Log   │ Contexto atual   │
│   ▾ Funções         │                                  │                          │                  │
│     Q 001           │ Monaco Editor                    │ Preview rápido           │ Chat             │
│     Q 002 ●         │                                  │                          │                  │
│     Q 003           │ Alternativas estruturadas        │ Preview autoritativo     │ Tools executadas │
│   ▸ Exercícios      │                                  │                          │                  │
│                     │ Tags / dificuldade / origem      │ Diagnóstico LaTeX        │ Patch / Diff     │
│ + Novo nó           │                                  │                          │                  │
├─────────────────────┴──────────────────────────────────┴──────────────────────────┴──────────────────┤
│ SQLite ● | Saved | main.tex | TeX engine | UTF-8 | Ln 12 Col 31 | Render 184 ms | Agent: OpenAI    │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## 4.1 Painel esquerdo — árvore

Obrigatório:

- árvore com profundidade arbitrária;
- expand/collapse;
- virtualização;
- drag-and-drop;
- mover como filho;
- mover como irmão;
- reorder;
- renomear inline;
- criar nó filho;
- criar nó irmão;
- duplicar;
- excluir logicamente;
- restaurar;
- menu de contexto;
- busca/filtro;
- breadcrumb;
- destaque do nó atual;
- ícones por `NodeKind`;
- indicador de:
  - conteúdo não salvo;
  - erro de render;
  - questão incompleta;
  - questão validada;
  - modificações agênticas pendentes;
- atalhos de teclado.

## 4.2 Painel central — editor

Deve suportar edição por abas internas:

- Conteúdo.
- Resposta/solução.
- Complemento.
- Alternativas.
- Metadados.
- Origem.
- Histórico.

Para múltipla escolha:

- cada alternativa é uma entidade;
- checkbox/radio de correta;
- drag-and-drop das alternativas;
- botão “embaralhar visualização”;
- não persistir A/B/C/D como identidade;
- mostrar letra apenas como projeção da ordem atual.

## 4.3 Painel direito — preview

Abas:

- **Fast Preview**: HTML + MathJax.
- **PDF**: resultado da compilação autoritativa.
- **PNG/SVG**: imagem derivada.
- **Log**: stdout/stderr do compilador.
- **Source**: `.tex` final montado pelo sistema.

Ações:

- Ctrl+Enter = render autoritativo.
- debounce opcional para preview rápido.
- copiar LaTeX final.
- baixar artefato.
- abrir em tela cheia.
- clicar em erro e navegar para a linha correspondente quando possível.

## 4.4 Quarto painel — Agente

O painel agêntico fica fechado por padrão.

Um botão flutuante `✦` deve abrir/fechar o painel.

O usuário deve conseguir dizer, por exemplo:

- “Corrija esta questão.”
- “O render está quebrando. Descubra por quê.”
- “Converta o texto selecionado em LaTeX.”
- “Melhore a solução sem mudar a resposta.”
- “Identifique qual alternativa é correta.”
- “Confira se existe mais de uma alternativa correta.”
- “Adicione tags.”
- “Complete banca, ano e assunto a partir do texto.”
- “Compare com a imagem original.”
- “Faça a questão usar `siunitx`.”
- “Troque a ordem das alternativas e mantenha o gabarito.”
- “Mostre um patch, não aplique.”
- Futuro: “Faça isso nas 200 questões deste capítulo.”

---

# 5. Stack proposta

## 5.1 Runtime e aplicação

- Node.js LTS.
- pnpm.
- Next.js com App Router.
- React.
- TypeScript strict.
- Route Handlers para APIs internas.
- Zod para validação de entrada/saída.
- Server Actions apenas onde forem realmente úteis; não substituir toda API por Server Actions.

## 5.2 UI

- Tailwind CSS.
- shadcn/ui.
- Radix primitives quando necessário.
- Lucide Icons.
- `react-resizable-panels` ou equivalente para painéis.
- `dnd-kit` para drag-and-drop.
- TanStack Query para estado remoto/cache quando trouxer benefício.
- Zustand para estado local de workbench/editor quando necessário.
- Sonner/toast equivalente.
- Command Palette via `cmdk`.

## 5.3 Editor

- Monaco Editor.
- linguagem customizada `latex`.
- completion provider próprio.
- snippets originados do banco legado de metadados LaTeX.
- hover provider.
- diagnostics.
- custom actions.
- atalhos.
- futura integração opcional com TexLab/LSP.

## 5.4 Banco

### Fase local

- SQLite.
- Prisma ORM.
- migrations versionadas.
- seeds.

### Fase SaaS

- PostgreSQL.
- manter contratos de repository/use-case independentes do provider.
- migrations PostgreSQL específicas quando necessário.

## 5.5 Preview

Fast Preview:

- React/HTML.
- MathJax para matemática.
- sanitizer para conteúdo HTML quando houver HTML gerado.

Authoritative Render:

- TeX Live.
- `pdflatex` inicialmente.
- `pdftocairo` para PNG.
- arquitetura preparada para engines adicionais:
  - XeLaTeX;
  - LuaLaTeX;
  - Tectonic, se desejado posteriormente.

## 5.6 IA

Contrato único:

```ts
export interface AiProvider {
  id: string;
  listModels(): Promise<AiModel[]>;
  run(request: AgentRequest): Promise<AgentResult>;
  stream?(request: AgentRequest): AsyncIterable<AgentEvent>;
}
```

Providers iniciais:

- `OpenAiProvider`.
- `OllamaProvider`.

Providers futuros:

- qualquer endpoint OpenAI-compatible;
- Gemini;
- Anthropic;
- modelos internos;
- providers especializados de OCR matemático.

---

# 6. Organização recomendada do repositório

Não alterar o legado por enquanto.

```text
/
├─ legacy/                         # opcional no futuro; inicialmente manter estrutura atual intacta
├─ apps/
│  └─ latexbookbank-web/
│     ├─ app/
│     ├─ src/
│     │  ├─ modules/
│     │  │  ├─ publications/
│     │  │  ├─ document-tree/
│     │  │  ├─ questions/
│     │  │  ├─ latex/
│     │  │  ├─ rendering/
│     │  │  ├─ assets/
│     │  │  ├─ ingestion/
│     │  │  ├─ assessments/
│     │  │  ├─ agents/
│     │  │  ├─ revisions/
│     │  │  └─ settings/
│     │  ├─ shared/
│     │  └─ infrastructure/
│     ├─ prisma/
│     ├─ data/
│     ├─ public/
│     ├─ tests/
│     └─ package.json
├─ packages/
│  ├─ latex-renderer/
│  ├─ legacy-importer/
│  └─ shared-types/
└─ docs/
```

Se o time preferir máxima velocidade inicial, `packages/*` pode começar dentro da própria app e ser extraído quando houver necessidade real.

Não criar microserviços prematuramente.

---

# 7. Arquitetura modular

Cada módulo deve preferencialmente possuir:

```text
module/
├─ domain/
├─ application/
├─ infrastructure/
├─ api/
├─ ui/
└─ index.ts
```

Não é necessário forçar DDD cerimonial. O objetivo é impedir que:

- componentes React acessem Prisma diretamente;
- agentes escrevam no banco diretamente;
- renderer conheça detalhes da UI;
- regras de domínio dependam de Next.js;
- mutations críticas aconteçam sem validação.

Fluxo ideal:

```text
UI
 ↓
Route Handler / Server boundary
 ↓
Application Use Case
 ↓
Domain
 ↓
Repository interface
 ↓
Prisma implementation
 ↓
SQLite/PostgreSQL
```

---

# 8. Modelo de domínio proposto

## 8.1 Workspace

Mesmo localmente, criar `Workspace`.

Isso evita retrabalho quando virar SaaS.

Campos:

- id UUID.
- name.
- slug.
- createdAt.
- updatedAt.

## 8.2 Publication

Representa livro/publicação/fonte.

Campos sugeridos:

- id.
- workspaceId.
- title.
- subtitle.
- nickname.
- isbn.
- issn/otherIdentifier.
- publisher.
- publicationDate.
- authors.
- tags.
- notes.
- coverAssetId.
- sourcePdfAssetId.
- legacyId.
- createdAt.
- updatedAt.

Autores podem começar normalizados ou como relação; preferir normalização se o importador legado já trouxer essa informação.

## 8.3 DocumentNode

Substitui a ideia de usar `Questao` também como capítulo/seção.

```ts
type NodeKind =
  | 'BOOK'
  | 'PART'
  | 'CHAPTER'
  | 'SECTION'
  | 'SUBSECTION'
  | 'CONTENT'
  | 'QUESTION_GROUP'
  | 'QUESTION'
  | 'FIGURE'
  | 'NOTE';
```

Campos:

- id.
- publicationId.
- parentId nullable.
- kind.
- title.
- slug.
- sortKey.
- questionId nullable.
- sourceAnchorId nullable.
- collapsed.
- deletedAt nullable.
- createdAt.
- updatedAt.

### Ordenação

Não usar simplesmente `1, 2, 3` como estratégia que exige atualizar milhares de linhas.

Opções aceitáveis:

- fractional indexing;
- LexoRank;
- rank string.

A implementação deve permitir reorder barato.

## 8.4 Question

Campos sugeridos:

- id UUID.
- legacyId nullable.
- type.
- nickname.
- statementLatex.
- solutionLatex.
- complementLatex.
- originalLatex.
- difficulty.
- year.
- board.
- institution.
- role.
- roleLevel.
- videoUrl.
- status.
- validationStatus.
- sourceAnchorId.
- createdAt.
- updatedAt.

Não armazenar imagem gerada em BLOB na tabela principal.

## 8.5 QuestionOption

- id UUID.
- questionId.
- sortKey.
- statementLatex.
- solutionLatex.
- originalLatex.
- isCorrect.
- weight nullable.
- createdAt.
- updatedAt.

A letra A/B/C/... é calculada no momento da projeção/renderização.

## 8.6 Tags

Separar inicialmente:

- `Tag`.
- `QuestionTag`.

Pode haver taxonomia futura:

- subject;
- topic;
- skill;
- source;
- curriculum;
- custom.

## 8.7 Asset

- id.
- workspaceId.
- publicationId nullable.
- questionId nullable.
- kind.
- storageKey.
- mimeType.
- originalFilename.
- sha256.
- sizeBytes.
- width.
- height.
- metadataJson.
- createdAt.

Tipos:

- SOURCE_PDF.
- COVER.
- SOURCE_IMAGE.
- QUESTION_IMAGE.
- CROP.
- RENDER_PDF.
- RENDER_PNG.
- RENDER_SVG.
- ATTACHMENT.

Artefatos de render podem ficar em tabela específica; decidir no spike inicial.

## 8.8 SourceAnchor

Essencial para futura ingestão de livros.

Campos:

- id.
- publicationId.
- sourceAssetId.
- pageNumber.
- bboxX.
- bboxY.
- bboxWidth.
- bboxHeight.
- sourceText nullable.
- extractionMethod.
- extractionModel.
- metadataJson.

Permite “voltar à origem” de qualquer questão.

## 8.9 Revision

Toda mudança importante deve poder virar revisão.

- id.
- entityType.
- entityId.
- revisionNumber.
- snapshotJson.
- source:
  - USER;
  - IMPORT;
  - AGENT;
  - SYSTEM.
- actor.
- agentRunId nullable.
- createdAt.

MVP pode começar criando revisão apenas antes de mudanças agênticas e importações.

## 8.10 RenderJob

- id.
- questionId / documentNodeId.
- contentHash.
- engine.
- status.
- requestedAt.
- startedAt.
- finishedAt.
- exitCode.
- stdout.
- stderr.
- artifactPdfId.
- artifactPreviewId.
- cacheHit.
- durationMs.

## 8.11 AgentRun

- id.
- workspaceId.
- scopeType.
- scopeId.
- provider.
- model.
- prompt.
- status.
- toolCallsJson.
- proposalJson.
- appliedAt nullable.
- usageJson.
- errorJson.
- createdAt.

---

# 9. Sistema de tipos de questão

Evitar `switch` global que cresce indefinidamente.

Criar registry:

```ts
interface QuestionTypePlugin {
  type: QuestionType;
  label: string;
  validate(question: QuestionAggregate): ValidationResult;
  buildLatex(question: QuestionAggregate, options: RenderOptions): string;
  buildFastPreview(question: QuestionAggregate): PreviewModel;
  randomize?(
    question: QuestionAggregate,
    rng: SeededRandom
  ): RandomizedQuestion;
}
```

Tipos previstos desde o legado:

- Discursiva.
- 5 alternativas.
- Verdadeiro/Falso.
- CESPE/Certo-Errado.
- Múltiplas corretas.
- Somatório.
- Grupo de questões.
- Itens relacionados.

MVP obrigatório:

- Discursiva.
- Múltipla escolha genérica com quantidade arbitrária de alternativas.

Não fixar exatamente 5 alternativas no novo domínio.

---

# 10. Editor Monaco LaTeX

## 10.1 MVP

- syntax highlighting.
- theme claro e escuro.
- line numbers.
- bracket matching.
- word wrap.
- minimap opcional/desligado por padrão.
- completion após `\`.
- snippets.
- placeholder navigation.
- `Ctrl+Space`.
- `Ctrl+Enter` render.
- `Ctrl+S` salvar imediatamente.
- autosave com debounce.
- dirty state.
- error decorations.

## 10.2 Importar o conhecimento do editor antigo

Criar importador para o SQLite `LatexMetadata.db`.

Converter:

- `LatexAutoCompletes`.
- símbolos.
- grupos.
- templates.
- shortcuts.

Mapear para uma estrutura do novo produto:

```ts
type LatexSnippet = {
  trigger: string;
  label: string;
  insertText: string;
  documentation?: string;
  sortOrder?: number;
  category?: string;
  shortcut?: string;
}
```

Substituir o delimitador legado `§` por snippets nativos do Monaco.

## 10.3 Fase avançada

- TexLab via Language Server.
- references.
- labels.
- citations.
- hover.
- diagnostics semânticos.
- completion contextual.
- go-to-definition.
- workspace-aware package information.

Essa fase não deve bloquear o MVP.

---

# 11. Preview rápido em HTML

Objetivo: feedback em dezenas de milissegundos sem rodar TeX.

Pipeline:

```text
QuestionAggregate
  ↓
PreviewModel
  ↓
React HTML
  ↓
MathJax
```

Renderizar:

- parágrafos.
- alternativas.
- resposta.
- marcadores.
- matemática inline.
- matemática display.
- imagens.
- caixas simples.

Deixar visualmente explícito:

> “Preview rápido — pode diferir do PDF final.”

O HTML não é a fonte de verdade para compatibilidade completa de LaTeX.

---

# 12. Renderização autoritativa

## 12.1 Pipeline

```text
Dados estruturados
   ↓
QuestionTypePlugin.buildLatex()
   ↓
Template/Preamble
   ↓
arquivo .tex temporário
   ↓
pdflatex
   ↓
PDF
   ↓
pdftocairo
   ↓
PNG
```

## 12.2 Hash/cache

Calcular hash de:

- LaTeX final.
- template.
- preamble.
- lista/versão de assets.
- engine.
- parâmetros.
- versão lógica do renderer.

Se o hash já existir:

- retornar artefato anterior;
- marcar `cacheHit = true`.

## 12.3 Coalescing

Se o usuário pedir render A, depois B, depois C rapidamente:

- A pode ser cancelado se ainda não iniciou;
- B deve ser descartado;
- C é o estado desejado final.

Não deixar uma fila infinita de renders antigos.

## 12.4 Isolamento

Nunca concatenar comandos de shell inseguros.

Usar `spawn`/`execFile` com argumentos.

Diretório temporário por job.

Na evolução SaaS:

- container isolado;
- sem rede;
- CPU/memória/timeout;
- sem `shell-escape`;
- whitelist de comandos.

## 12.5 Preamble

Criar `LatexProfile`.

Exemplo:

- Default Math.
- ABNT.
- Concurso.
- Livro.
- Minimal.

Cada profile define:

- documentclass.
- packages.
- macros.
- engine.
- defaults.

Importar o antigo `latex-includes.tex` como um profile inicial de compatibilidade.

---

# 13. Imagens e recortes

## 13.1 Entrada

Aceitar:

- upload.
- drag-and-drop.
- Ctrl+V.
- recorte de página PDF.
- recorte de imagem existente.

## 13.2 Crop UI

O usuário deve:

1. abrir fonte;
2. desenhar retângulo;
3. ajustar;
4. salvar crop;
5. escolher:
   - inserir como imagem;
   - reconhecer matemática;
   - reconhecer texto;
   - anexar como referência.

Salvar a imagem original e a bounding box.

## 13.3 Reconhecimento matemático

Contrato:

```ts
interface MathRecognitionProvider {
  recognize(input: ImageInput): Promise<MathRecognitionResult>;
}
```

Resultado:

- latex.
- confidence nullable.
- alternatives.
- provider.
- model.
- processing metadata.

Implementações possíveis:

- local model/pix2tex.
- IA multimodal via provider genérico.
- serviço especializado futuramente.

Nunca descartar o crop original.

## 13.4 Fluxo de revisão

```text
Crop
 ↓
Reconhecer
 ↓
LaTeX candidato
 ↓
Fast Preview
 ↓
Editar
 ↓
Render autoritativo
 ↓
Aceitar
```

---

# 14. Painel agêntico — arquitetura

## 14.1 Filosofia

O agente não é um chat solto.

Ele é um **operador assistido sobre o domínio**.

Ele recebe um pacote explícito de contexto e possui tools limitadas.

## 14.2 Context envelope

```ts
type AgentContext = {
  workspaceId: string;
  publication?: PublicationSummary;
  selectedNode?: DocumentNodeSummary;
  question?: QuestionAggregate;
  selectedEditorText?: string;
  renderDiagnostics?: RenderDiagnostic[];
  recentRenderLog?: string;
  sourceAnchor?: SourceAnchor;
  userInstruction: string;
};
```

Não mandar o banco inteiro ao modelo.

## 14.3 Tools iniciais

Somente leitura:

- `get_current_question`
- `get_question_options`
- `get_question_metadata`
- `get_source_anchor`
- `get_render_diagnostics`
- `render_candidate_latex`
- `validate_question`
- `search_questions`

Proposição:

- `propose_question_patch`
- `propose_option_patch`
- `propose_metadata_patch`
- `propose_tags`
- `propose_reorder_options`

A escrita real não deve ser exposta diretamente ao LLM no MVP.

O servidor recebe a proposta e apresenta diff.

## 14.4 Patch format

Não pedir ao modelo “devolva a questão inteira” sempre.

Preferir JSON Patch conceitual ou uma estrutura própria:

```ts
type QuestionPatch = {
  questionId: string;
  changes: Array<
    | { op: 'replace'; field: 'statementLatex'; value: string }
    | { op: 'replace'; field: 'solutionLatex'; value: string }
    | { op: 'set-correct'; optionId: string; value: boolean }
    | { op: 'add-tag'; value: string }
    | { op: 'set-metadata'; field: string; value: unknown }
  >;
  rationale: string[];
  warnings: string[];
};
```

## 14.5 Ciclo de autocorreção LaTeX

Uma das capacidades mais valiosas.

```text
Pergunta atual
 ↓
Agente propõe correção
 ↓
render_candidate_latex
 ↓
compila?
 ├─ sim → apresentar diff
 └─ não → enviar diagnostics de volta ao agente
              ↓
          nova tentativa
```

Limites:

- máximo de iterações configurável, ex.: 3.
- timeout global.
- registrar cada tentativa.
- nunca aplicar automaticamente sem aprovação, por padrão.

## 14.6 Approval UI

O painel deve mostrar:

- resumo do que o agente entendeu;
- arquivos/campos afetados;
- before/after;
- diff;
- render antes;
- render depois;
- warnings;
- custo/uso quando disponível;
- botões:
  - Aplicar tudo.
  - Aplicar seleção.
  - Rejeitar.
  - Pedir revisão.
  - Reverter após aplicação.

## 14.7 Providers

### OpenAI

Variáveis:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_MODEL=
```

A chave deve existir apenas no servidor.

### Ollama/local

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=
```

O restante da aplicação fala com `AiProvider`.

## 14.8 Agent modes

MVP:

- `ASK` — responde sem propor alteração.
- `REVIEW` — revisa conteúdo.
- `FIX_LATEX` — tenta corrigir LaTeX.
- `ENRICH` — sugere metadados/tags.
- `STRUCTURE` — transforma texto bruto em questão estruturada.

Futuro:

- `BATCH_REVIEW`.
- `BATCH_FIX`.
- `BATCH_ENRICH`.
- `IMPORT_ASSIST`.
- `BOOK_STRUCTURE_EXTRACTION`.

---

# 15. Operações agênticas em lote — preparar agora, ativar depois

O modelo deve nascer com `AgentJob`.

```ts
type AgentJob = {
  id: string;
  scope: 'QUESTION' | 'NODE_DESCENDANTS' | 'PUBLICATION' | 'QUERY';
  scopeId?: string;
  query?: QuestionFilter;
  operation: AgentOperation;
  status: JobStatus;
  concurrency: number;
  requiresApproval: boolean;
}
```

MVP executa somente `scope = QUESTION`.

Depois habilitar:

- capítulo;
- publicação;
- resultado de filtro.

Fluxo batch futuro:

1. criar seleção;
2. dry-run;
3. processar amostra de 5;
4. usuário revisa;
5. aprova lote;
6. executar em chunks;
7. relatório;
8. rollback por revisão.

---

# 16. Importação do banco legado

Não migrar “in place”.

Criar importador idempotente.

```text
Legacy SQLite
 ↓
LegacyReader
 ↓
Mapping
 ↓
Validation
 ↓
New DB
 ↓
ImportReport
```

Guardar `legacyId`.

Importar:

- Publication.
- autores.
- editoras.
- tags.
- questões.
- relações pai/filho.
- alternativas.
- resposta correta.
- dificuldade.
- metadados de concurso.
- imagens/assets.
- LaTeX.
- metadados LaTeX/autocomplete.

## 16.1 Regras

- banco velho é read-only.
- nunca modificar o original.
- import pode ser repetido.
- relatório deve mostrar:
  - importados;
  - atualizados;
  - ignorados;
  - inconsistentes;
  - órfãos;
  - assets ausentes.
- permitir dry-run.

---

# 17. Motor de avaliação e randomização

## 17.1 Identidade

A alternativa correta é identificada por `optionId`, não pela letra.

## 17.2 Seed

Usar PRNG determinístico.

```ts
createVariant({
  assessmentId,
  seed: 'PROVA-A-2026',
})
```

Persistir:

- seed.
- ordem das questões.
- ordem das alternativas.
- map optionId → displayedLabel.

## 17.3 Assessment

Entidades:

- Assessment.
- AssessmentSection.
- AssessmentRule.
- AssessmentItem.
- AssessmentVariant.
- AssessmentVariantQuestion.
- AssessmentVariantOptionMap.

## 17.4 Blueprint

Exemplos:

- 10 questões de Funções.
- dificuldade 3–5.
- máximo 2 da mesma fonte.
- incluir pelo menos 1 discursiva.
- excluir já usadas.
- banco X.
- anos 2020–2026.

Essa fase pode ficar após o MVP editorial, mas o domínio de alternativas deve nascer correto agora.

---

# 18. Publicação e templates

Separar:

- conteúdo.
- apresentação.

`DocumentTemplate` define:

- preamble.
- layout.
- cabeçalho.
- rodapé.
- numbering.
- questão.
- resposta.
- gabarito.
- versão aluno/professor.

Uma mesma questão deve poder aparecer em templates diferentes sem duplicação.

---

# 19. API interna sugerida

Exemplos de Route Handlers:

```text
GET    /api/workspaces
GET    /api/publications
POST   /api/publications
GET    /api/publications/:id
GET    /api/publications/:id/tree

POST   /api/nodes
PATCH  /api/nodes/:id
POST   /api/nodes/:id/move
DELETE /api/nodes/:id

GET    /api/questions/:id
PATCH  /api/questions/:id
POST   /api/questions/:id/options
PATCH  /api/questions/:id/options/:optionId
POST   /api/questions/:id/validate

POST   /api/render
GET    /api/render/:id
DELETE /api/render/:id

POST   /api/assets
POST   /api/assets/crop
POST   /api/recognition/math

POST   /api/agent/runs
GET    /api/agent/runs/:id
POST   /api/agent/runs/:id/apply
POST   /api/agent/runs/:id/reject

POST   /api/import/legacy/scan
POST   /api/import/legacy/run
GET    /api/import/legacy/:id/report
```

Todas as mutations:

- Zod.
- authorization boundary preparada, mesmo em single-user.
- tratamento consistente de erros.
- correlation id.

---

# 20. Estado local e autosave

Evitar salvar a cada tecla diretamente no SQLite.

Fluxo:

```text
Monaco
 ↓
local editor state
 ↓ debounce
mutation
 ↓
revision/version check
 ↓
DB
```

Usar optimistic concurrency simples:

- `updatedAt` ou `version`.

Se a entidade mudou desde a leitura:

- detectar conflito;
- não sobrescrever silenciosamente.

---

# 21. Busca

MVP:

- título/nickname.
- enunciado.
- tags.
- banca.
- instituição.
- ano.
- tipo.
- dificuldade.

SQLite:

- avaliar FTS5 em fase posterior.
- começar com consultas normais se o volume permitir.

PostgreSQL:

- futura busca full-text.

Manter `QuestionSearchService` abstrato se recursos específicos forem introduzidos.

---

# 22. Command Palette

`Ctrl+K`.

Comandos iniciais:

- nova questão.
- novo capítulo.
- render.
- abrir publicação.
- buscar questão.
- abrir agente.
- corrigir LaTeX com agente.
- duplicar questão.
- importar imagem.
- abrir fonte.
- marcar correta.
- mover nó.
- tema claro/escuro.

---

# 23. Atalhos

Sugestão:

- `Ctrl+S`: salvar.
- `Ctrl+Enter`: render.
- `Ctrl+K`: command palette.
- `Ctrl+Shift+A`: agente.
- `Ctrl+Space`: completion.
- `Ctrl+Shift+P`: comandos do editor.
- `Alt+↑/↓`: mover nó/alternativa.
- `Ctrl+D`: duplicar questão.
- `Ctrl+Shift+N`: novo filho.
- `Ctrl+N`: novo irmão.
- `F2`: renomear nó.
- `Del`: excluir com confirmação.

Permitir customização futura.

---

# 24. Segurança

Mesmo localmente:

- secrets somente em `.env.local`.
- nunca expor API key ao browser.
- sanitizar paths.
- nenhum path de usuário pode escapar do workspace.
- validar MIME/extensão.
- limitar upload.
- usar hash de conteúdo.
- não executar shell montando string.
- limitar tempo de compilação.
- bloquear shell escape no LaTeX.
- registrar ação agêntica.
- não permitir tool arbitrária vinda do modelo.
- validar todo patch do agente antes de apresentar/aplicar.
- aplicar patch dentro de transação.
- criar revisão anterior antes de mudanças agênticas.

---

# 25. Observabilidade local

Tela de diagnósticos:

- versão do app.
- path do SQLite.
- TeX disponível?
- `pdflatex --version`.
- `pdftocairo` disponível?
- provider IA.
- modelo.
- Ollama disponível?
- tamanho do cache.
- jobs.
- último erro.

Logs estruturados:

- render.
- import.
- agent.
- persistence.

Não colocar prompts completos em logs por padrão se puderem conter conteúdo sensível.

---

# 26. Setup local ideal

Meta:

```bash
pnpm install
pnpm setup
pnpm dev
```

`pnpm setup` deve:

- criar pastas locais;
- criar `.env.local` a partir de exemplo se necessário;
- executar Prisma generate;
- migrations;
- seed mínimo;
- verificar dependências externas;
- informar se TeX/Poppler/Ollama estão ausentes.

Não instalar silenciosamente software do sistema.

## 26.1 Docker opcional

Fornecer `docker-compose.local.yml` para:

- renderer;
- Ollama opcional;
- futuro PostgreSQL.

O app principal deve poder rodar sem Docker no modo mais simples.

---

# 27. Qualidade

Obrigatório em CI:

- install locked.
- lint.
- typecheck.
- unit tests.
- integration tests.
- build.

Testes prioritários:

- ordering tree.
- move node.
- question validation.
- option identity.
- seeded shuffle.
- LaTeX builder.
- render hash.
- patch validation.
- agent approval.
- legacy mapping.

E2E:

- Playwright.

Fluxo crítico E2E:

1. abrir publicação;
2. selecionar questão;
3. editar LaTeX;
4. autosave;
5. render;
6. preview aparece;
7. abrir agente;
8. pedir correção;
9. revisar diff;
10. aplicar;
11. render novamente.

---

# 28. Definition of Done global

Uma Issue só pode ser considerada concluída quando:

- [ ] requisitos funcionais implementados;
- [ ] TypeScript sem `any` injustificado;
- [ ] lint passa;
- [ ] typecheck passa;
- [ ] testes relevantes adicionados;
- [ ] erro tratado;
- [ ] loading state tratado;
- [ ] empty state tratado;
- [ ] acessibilidade básica;
- [ ] teclado testado quando aplicável;
- [ ] dark/light testado quando aplicável;
- [ ] nenhuma secret;
- [ ] nenhuma dependência circular intencional;
- [ ] documentação atualizada;
- [ ] critério de aceite demonstrável.

---

# 29. O primeiro vertical slice — prioridade absoluta

Antes de tentar construir tudo, entregar esta fatia ponta a ponta:

1. Next.js sobe local.
2. SQLite inicializado.
3. Uma publicação de demonstração.
4. Uma árvore com capítulo/seção/questão.
5. Seleção da questão.
6. Monaco no centro.
7. Editar `statementLatex`.
8. Autosave.
9. Fast Preview à direita.
10. `Ctrl+Enter`.
11. backend monta `.tex`.
12. `pdflatex`.
13. `pdftocairo`.
14. PNG aparece.
15. log aparece se der erro.
16. abrir painel agente.
17. enviar questão atual ao provider.
18. agente propõe patch.
19. diff aparece.
20. usuário aprova.
21. patch é aplicado.
22. novo render funciona.

Se essa vertical estiver impecável, a arquitetura principal está provada.

---

# 30. Roadmap recomendado

## Milestone M0 — Foundation

Resultado: projeto sobe e persiste dados.

## Milestone M1 — Editorial Vertical Slice

Resultado: árvore + Monaco + save + preview + render.

## Milestone M2 — Question Bank Core

Resultado: tipos de questão, alternativas, correta, tags, metadata.

## Milestone M3 — Agentic Assistant

Resultado: OpenAI/Ollama, review, fix, diff, approval, revision.

## Milestone M4 — Assets & Math Recognition

Resultado: clipboard/upload/crop/OCR matemática.

## Milestone M5 — Legacy Migration

Resultado: banco antigo importado de forma reproduzível.

## Milestone M6 — Assessment Variants

Resultado: avaliação + seed + shuffle + versões + gabarito.

## Milestone M7 — Book Ingestion

Resultado: PDF → crops/anchors → draft tree assistida.

## Milestone M8 — SaaS Readiness

Resultado: PostgreSQL, auth, workspace multiusuário, object storage.

---

# 31. Backlog GitHub — Epic → Feature → Issue

> Convenção de títulos:
>
> - `[EPIC] ...`
> - `[FEATURE] ...`
> - `[ISSUE] ...`
>
> Como a integração atual do GitHub não autorizou criação de Issues, este backlog está pronto para ser copiado para o repositório. Quando houver permissão de escrita, criar primeiro os Epics, depois Features e finalmente Issues, adicionando links `Parent: #NN`.

---

## EPIC 01 — Foundation Local-First

### [EPIC] Foundation local-first do LatexBookBank Web

**Objetivo:** estabelecer a nova aplicação TypeScript/Next.js sem tocar no WPF.

**Done quando:** app local executa, SQLite funciona, arquitetura modular está estabelecida e CI básica passa.

### FEATURE 01.1 — Bootstrap

#### [ISSUE] Bootstrap do Next.js + TypeScript

- [ ] App Router.
- [ ] TypeScript strict.
- [ ] pnpm.
- [ ] aliases.
- [ ] ESLint.
- [ ] Prettier.
- [ ] scripts `dev/build/lint/typecheck/test`.

#### [ISSUE] Instalar design system e shell visual

- [ ] Tailwind.
- [ ] shadcn/ui.
- [ ] ícones.
- [ ] light/dark.
- [ ] tokens visuais.
- [ ] shell responsivo.

#### [ISSUE] Criar estrutura modular

- [ ] modules.
- [ ] infrastructure.
- [ ] shared.
- [ ] convenções documentadas.

### FEATURE 01.2 — Persistência

#### [ISSUE] Configurar Prisma + SQLite

- [ ] schema.
- [ ] migration inicial.
- [ ] client server-only.
- [ ] seed.
- [ ] scripts.

#### [ISSUE] Criar camada de repository

- [ ] interfaces.
- [ ] implementação Prisma.
- [ ] nenhum componente React acessa Prisma diretamente.

#### [ISSUE] Preparar compatibilidade PostgreSQL

- [ ] listar diferenças relevantes.
- [ ] não usar features SQLite-only no domínio.
- [ ] documentar estratégia de migrations futuras.

### FEATURE 01.3 — Configuração local

#### [ISSUE] Criar `pnpm setup`

- [ ] env.
- [ ] diretórios.
- [ ] migrations.
- [ ] seed.
- [ ] health checks.

#### [ISSUE] Criar página Diagnostics

- [ ] SQLite.
- [ ] renderer.
- [ ] provider IA.
- [ ] versão.
- [ ] paths.

---

## EPIC 02 — Workbench Editorial Premium

### [EPIC] Workbench editorial de quatro painéis

### FEATURE 02.1 — Layout

#### [ISSUE] Implementar painéis redimensionáveis

- [ ] árvore.
- [ ] editor.
- [ ] preview.
- [ ] painel agêntico recolhível.
- [ ] persistir tamanhos localmente.

#### [ISSUE] Implementar topbar e statusbar

- [ ] publicação.
- [ ] salvar.
- [ ] render.
- [ ] agente.
- [ ] provider.
- [ ] tempo de render.
- [ ] status SQLite.

#### [ISSUE] Implementar command palette

- [ ] Ctrl+K.
- [ ] navegação.
- [ ] comandos editoriais.

### FEATURE 02.2 — Árvore

#### [ISSUE] Renderizar árvore recursiva

- [ ] profundidade arbitrária.
- [ ] lazy/virtualização quando necessário.
- [ ] ícones.
- [ ] estado selecionado.

#### [ISSUE] CRUD de nós

- [ ] novo filho.
- [ ] novo irmão.
- [ ] rename.
- [ ] delete lógico.
- [ ] restore.

#### [ISSUE] Drag-and-drop e reorder

- [ ] mover.
- [ ] reorder.
- [ ] validar ciclos.
- [ ] fractional rank.

#### [ISSUE] Busca e filtro da árvore

- [ ] texto.
- [ ] tipo.
- [ ] erro.
- [ ] incomplete.

---

## EPIC 03 — IDE LaTeX

### [EPIC] Monaco LaTeX IDE

### FEATURE 03.1 — Editor

#### [ISSUE] Integrar Monaco Editor

- [ ] client component isolado.
- [ ] loading.
- [ ] resize.
- [ ] theme.
- [ ] editor model por campo.

#### [ISSUE] Criar language configuration LaTeX

- [ ] brackets.
- [ ] comments.
- [ ] tokens.
- [ ] auto-close.

#### [ISSUE] Criar autocomplete provider

- [ ] trigger `\`.
- [ ] `Ctrl+Space`.
- [ ] prioridade.
- [ ] docs.

#### [ISSUE] Implementar snippets com placeholders

- [ ] snippets Monaco.
- [ ] navegação tab.
- [ ] seleção incorporada no snippet quando aplicável.

### FEATURE 03.2 — Metadados LaTeX legados

#### [ISSUE] Mapear `LatexMetadata.db`

- [ ] schema legado.
- [ ] autocomplete.
- [ ] símbolos.
- [ ] menus.
- [ ] shortcuts.

#### [ISSUE] Criar importador de snippets LaTeX

- [ ] idempotente.
- [ ] relatório.
- [ ] categorias.

#### [ISSUE] Criar palette de símbolos

- [ ] grupos.
- [ ] busca.
- [ ] inserir no cursor.
- [ ] favoritos futuro.

### FEATURE 03.3 — Diagnostics

#### [ISSUE] Mostrar diagnostics de render no Monaco

- [ ] mapear linha.
- [ ] decoration.
- [ ] hover.
- [ ] clique no log → linha.

#### [ISSUE] Spike TexLab/LSP

- [ ] prova de conceito.
- [ ] custo/benefício.
- [ ] decisão documentada.
- [ ] não bloquear MVP.

---

## EPIC 04 — Preview e Render LaTeX

### [EPIC] Preview rápido e compilação autoritativa

### FEATURE 04.1 — Fast Preview

#### [ISSUE] Implementar PreviewModel

- [ ] statement.
- [ ] options.
- [ ] solution.
- [ ] images.

#### [ISSUE] Implementar HTML + MathJax preview

- [ ] inline math.
- [ ] display math.
- [ ] refresh rápido.
- [ ] mensagem de divergência potencial.

### FEATURE 04.2 — Renderer

#### [ISSUE] Criar LatexBuilder

- [ ] plugin question type.
- [ ] preamble.
- [ ] template.
- [ ] assets.

#### [ISSUE] Executar `pdflatex` com segurança

- [ ] `spawn/execFile`.
- [ ] temp dir.
- [ ] timeout.
- [ ] stdout/stderr.
- [ ] exit code.

#### [ISSUE] Converter PDF em PNG

- [ ] `pdftocairo`.
- [ ] DPI.
- [ ] crop/standalone.
- [ ] salvar artifact.

#### [ISSUE] Render API + polling/stream

- [ ] create job.
- [ ] status.
- [ ] result.
- [ ] error.

#### [ISSUE] Cache por content hash

- [ ] sha.
- [ ] cache hit.
- [ ] invalidation.
- [ ] versão renderer.

#### [ISSUE] Coalescing de renders

- [ ] cancelar pendente.
- [ ] descartar intermediário.
- [ ] estado final correto.

### FEATURE 04.3 — Profiles

#### [ISSUE] Criar `LatexProfile`

- [ ] default.
- [ ] packages.
- [ ] macros.
- [ ] engine.

#### [ISSUE] Importar `latex-includes.tex` legado

- [ ] profile “Legacy Compatibility”.
- [ ] testar TikZ/PGFPlots/siunitx/xlop/cancel.

---

## EPIC 05 — Question Bank Core

### [EPIC] Banco de questões estruturado

### FEATURE 05.1 — Questão

#### [ISSUE] Implementar aggregate Question

- [ ] statement.
- [ ] solution.
- [ ] complement.
- [ ] metadata.
- [ ] validation.

#### [ISSUE] Implementar metadata editorial

- [ ] dificuldade.
- [ ] ano.
- [ ] banca.
- [ ] instituição.
- [ ] cargo.
- [ ] nível.
- [ ] origem.

#### [ISSUE] Implementar tags

- [ ] criar.
- [ ] remover.
- [ ] autocomplete.
- [ ] filtro.

### FEATURE 05.2 — Alternativas

#### [ISSUE] Implementar QuestionOption

- [ ] UUID.
- [ ] sortKey.
- [ ] statement.
- [ ] solution.
- [ ] correct.

#### [ISSUE] Editor de alternativas

- [ ] adicionar/remover.
- [ ] drag reorder.
- [ ] marcar correta.
- [ ] quantidade arbitrária.

#### [ISSUE] Corrigir identidade letra vs opção

- [ ] letras calculadas.
- [ ] nenhum vínculo de gabarito por A/B/C.

### FEATURE 05.3 — Tipos

#### [ISSUE] Criar QuestionType registry

- [ ] interface.
- [ ] validator.
- [ ] latex builder.
- [ ] preview.

#### [ISSUE] Tipo Discursiva

- [ ] editor.
- [ ] preview.
- [ ] render.

#### [ISSUE] Tipo Múltipla Escolha

- [ ] editor.
- [ ] opções.
- [ ] correta.
- [ ] render.

---

## EPIC 06 — Assets, PDF e Reconhecimento Matemático

### [EPIC] Pipeline de assets e ingestão visual

### FEATURE 06.1 — Assets

#### [ISSUE] Asset store local

- [ ] paths seguros.
- [ ] sha256.
- [ ] metadata.
- [ ] dedup opcional.

#### [ISSUE] Upload/drag/paste

- [ ] file picker.
- [ ] drag-drop.
- [ ] clipboard image.

#### [ISSUE] Inserção assistida de figura

- [ ] width/height.
- [ ] caption.
- [ ] label.
- [ ] gerar snippet LaTeX.

### FEATURE 06.2 — PDF e crop

#### [ISSUE] Visualizador de PDF

- [ ] páginas.
- [ ] zoom.
- [ ] navegação.

#### [ISSUE] Ferramenta de crop

- [ ] bbox.
- [ ] preview.
- [ ] salvar SourceAnchor.
- [ ] criar asset CROP.

### FEATURE 06.3 — Math OCR

#### [ISSUE] Criar `MathRecognitionProvider`

- [ ] interface.
- [ ] result schema.
- [ ] provider metadata.

#### [ISSUE] Implementar provider local inicial

- [ ] processo/endpoint local.
- [ ] timeout.
- [ ] erro.
- [ ] revisão humana.

#### [ISSUE] Fluxo crop → LaTeX → render → aceitar

- [ ] candidate.
- [ ] edit.
- [ ] fast preview.
- [ ] authoritative preview.

---

## EPIC 07 — Painel Agêntico

### [EPIC] Assistente agêntico editorial com aprovação

### FEATURE 07.1 — Agent UI

#### [ISSUE] Botão flutuante e quarto painel

- [ ] open/close.
- [ ] shortcut.
- [ ] resize.
- [ ] persist state.

#### [ISSUE] Chat contextual

- [ ] pergunta atual.
- [ ] seleção Monaco.
- [ ] diagnostics.
- [ ] source anchor.

#### [ISSUE] Timeline de tool calls

- [ ] tool.
- [ ] input resumido.
- [ ] output.
- [ ] duração.
- [ ] status.

### FEATURE 07.2 — Provider abstraction

#### [ISSUE] Criar `AiProvider`

- [ ] request.
- [ ] stream.
- [ ] model.
- [ ] errors.

#### [ISSUE] Implementar OpenAI provider

- [ ] server-only key.
- [ ] tools tipadas.
- [ ] structured result.
- [ ] streaming.

#### [ISSUE] Implementar Ollama provider

- [ ] base URL.
- [ ] model.
- [ ] health.
- [ ] fallback de capacidades.

#### [ISSUE] Settings de IA

- [ ] provider.
- [ ] modelo.
- [ ] endpoint local.
- [ ] testar conexão.

### FEATURE 07.3 — Agent tools

#### [ISSUE] Tools read-only

- [ ] current question.
- [ ] metadata.
- [ ] options.
- [ ] diagnostics.
- [ ] source.

#### [ISSUE] `render_candidate_latex`

- [ ] sandbox.
- [ ] diagnostics.
- [ ] nenhum write.

#### [ISSUE] `validate_question`

- [ ] regras.
- [ ] warnings.
- [ ] inconsistências.

### FEATURE 07.4 — Patch/approval

#### [ISSUE] Definir QuestionPatch schema

- [ ] Zod.
- [ ] whitelist.
- [ ] validação.

#### [ISSUE] Diff viewer agentic

- [ ] field diff.
- [ ] Monaco diff para LaTeX.
- [ ] before/after preview.

#### [ISSUE] Aplicar patch transacional

- [ ] revisão anterior.
- [ ] transação.
- [ ] audit.
- [ ] rollback.

#### [ISSUE] Rejeitar/revisar proposta

- [ ] feedback ao agente.
- [ ] nova tentativa.
- [ ] histórico.

### FEATURE 07.5 — Autocorreção

#### [ISSUE] Modo FIX_LATEX iterativo

- [ ] propose.
- [ ] candidate render.
- [ ] diagnostics.
- [ ] retry máximo.
- [ ] diff final.

#### [ISSUE] Modo ENRICH

- [ ] tags.
- [ ] banca.
- [ ] ano.
- [ ] assunto.
- [ ] confidence/warnings.

#### [ISSUE] Modo STRUCTURE

- [ ] texto bruto.
- [ ] statement.
- [ ] options.
- [ ] correct candidate.
- [ ] solution candidate.

---

## EPIC 08 — Migração Legada

### [EPIC] Importação segura do banco e assets existentes

### FEATURE 08.1 — Scanner

#### [ISSUE] Detectar banco legado

- [ ] read-only.
- [ ] schema version.
- [ ] tables.
- [ ] counts.

#### [ISSUE] Relatório de integridade

- [ ] orphan questions.
- [ ] missing parents.
- [ ] invalid options.
- [ ] missing assets.

### FEATURE 08.2 — Mapper

#### [ISSUE] Mapear Publication

- [ ] legacyId.
- [ ] metadata.
- [ ] authors.
- [ ] tags.

#### [ISSUE] Mapear árvore Questao → DocumentNode

- [ ] parent.
- [ ] level.
- [ ] order.
- [ ] chapter/section/question.

#### [ISSUE] Mapear Question e QuestionOption

- [ ] latex.
- [ ] correct.
- [ ] metadata.
- [ ] tags.

#### [ISSUE] Mapear assets

- [ ] source.
- [ ] preview.
- [ ] images.

### FEATURE 08.3 — Execução

#### [ISSUE] Dry-run

- [ ] sem escrita.
- [ ] counts.
- [ ] errors.

#### [ISSUE] Import idempotente

- [ ] retry.
- [ ] upsert por legacyId.
- [ ] report.

---

## EPIC 09 — Avaliações e Variantes

### [EPIC] Motor determinístico de avaliações

### FEATURE 09.1 — Randomização

#### [ISSUE] Criar seeded RNG

- [ ] deterministic.
- [ ] tests.

#### [ISSUE] Embaralhar alternativas

- [ ] optionId preservado.
- [ ] label calculada.
- [ ] map persistido.

#### [ISSUE] Embaralhar questões

- [ ] seed.
- [ ] order map.

### FEATURE 09.2 — Assessment

#### [ISSUE] Modelar Assessment

- [ ] title.
- [ ] items.
- [ ] rules.

#### [ISSUE] Gerar AssessmentVariant

- [ ] seed.
- [ ] question order.
- [ ] option map.

#### [ISSUE] Export aluno/professor

- [ ] sem resposta.
- [ ] com resposta.
- [ ] gabarito.

---

## EPIC 10 — Revisões, Busca e Qualidade

### [EPIC] Confiabilidade editorial e evolução para SaaS

### FEATURE 10.1 — Revisions

#### [ISSUE] Criar snapshot revision

- [ ] user.
- [ ] import.
- [ ] agent.

#### [ISSUE] Histórico da questão

- [ ] timeline.
- [ ] diff.
- [ ] restore.

### FEATURE 10.2 — Busca

#### [ISSUE] Busca global de questões

- [ ] text.
- [ ] tags.
- [ ] metadata.
- [ ] type.

#### [ISSUE] Avaliar SQLite FTS5

- [ ] benchmark.
- [ ] decisão documentada.

### FEATURE 10.3 — Testes

#### [ISSUE] Unit tests de domínio

- [ ] tree.
- [ ] rank.
- [ ] options.
- [ ] seed.
- [ ] validator.

#### [ISSUE] Integration tests SQLite

- [ ] repositories.
- [ ] transactions.
- [ ] revisions.

#### [ISSUE] Playwright vertical slice

- [ ] edit.
- [ ] save.
- [ ] render.
- [ ] agent diff.
- [ ] apply.

### FEATURE 10.4 — SaaS readiness

#### [ISSUE] Spike PostgreSQL

- [ ] schema migrate.
- [ ] tests.
- [ ] diferenças.
- [ ] relatório.

#### [ISSUE] Criar storage abstraction

- [ ] local filesystem.
- [ ] interface S3 futura.

#### [ISSUE] Preparar ownership/authorization

- [ ] workspaceId em entidades.
- [ ] guard central.
- [ ] single-user provider inicial.

---

# 32. Ordem de execução recomendada das Issues

Não executar o backlog em ordem numérica cega.

## Sprint / Wave A — provar a fundação

1. Bootstrap Next.
2. UI shell.
3. Prisma + SQLite.
4. modelo Publication/DocumentNode/Question.
5. árvore recursiva.
6. Monaco.
7. autosave.
8. Fast Preview.
9. LatexBuilder.
10. pdflatex.
11. pdftocairo.
12. preview autoritativo.

## Wave B — provar o banco de questões

13. QuestionOption.
14. correta por optionId.
15. editor de alternativas.
16. tags/metadata.
17. type registry.
18. discursiva.
19. múltipla escolha.

## Wave C — provar o agente

20. quarto painel.
21. AiProvider.
22. OpenAI.
23. Ollama.
24. read tools.
25. patch schema.
26. diff.
27. candidate render.
28. FIX_LATEX.
29. apply + revision.

## Wave D — trazer o patrimônio existente

30. scanner legado.
31. Publication mapper.
32. árvore mapper.
33. Question/Option mapper.
34. assets mapper.
35. import idempotente.
36. snippets/autocomplete legado.

## Wave E — ingestão visual

37. asset store.
38. clipboard.
39. PDF viewer.
40. crop.
41. SourceAnchor.
42. MathRecognitionProvider.
43. local OCR.
44. review pipeline.

## Wave F — diferencial de produto

45. seeded RNG.
46. assessment.
47. variants.
48. aluno/professor.
49. busca avançada.
50. batch agents.

---

# 33. Checklist de aceite do MVP editorial

## Aplicação

- [ ] Sobe com `pnpm dev`.
- [ ] Setup local documentado.
- [ ] SQLite criado automaticamente.
- [ ] Nenhuma dependência do WPF em runtime.
- [ ] UI premium e estável.

## Árvore

- [ ] Cria filho.
- [ ] Cria irmão.
- [ ] Renomeia.
- [ ] Move.
- [ ] Reordena.
- [ ] Não permite ciclos.
- [ ] Estado persiste.

## Questão

- [ ] Discursiva.
- [ ] Múltipla escolha.
- [ ] Alternativas arbitrárias.
- [ ] Correta por UUID.
- [ ] Tags.
- [ ] dificuldade.
- [ ] banca.
- [ ] instituição.
- [ ] cargo.
- [ ] ano.

## Monaco

- [ ] Highlight LaTeX.
- [ ] Autocomplete.
- [ ] Snippets.
- [ ] Atalhos.
- [ ] Autosave.
- [ ] Dirty state.
- [ ] Diagnostics.

## Preview

- [ ] HTML rápido.
- [ ] MathJax.
- [ ] Ctrl+Enter.
- [ ] PDF.
- [ ] PNG.
- [ ] Log.
- [ ] Cache.

## Agente

- [ ] Painel flutuante.
- [ ] OpenAI.
- [ ] Ollama.
- [ ] contexto da questão.
- [ ] diagnostics disponíveis como tool.
- [ ] propõe patch.
- [ ] diff.
- [ ] candidate render.
- [ ] aprovação explícita.
- [ ] revision.
- [ ] rollback.

## Assets

- [ ] Upload.
- [ ] paste.
- [ ] crop.
- [ ] source preservado.
- [ ] inserir imagem em LaTeX.

## Legado

- [ ] Dry-run.
- [ ] import Publication.
- [ ] import árvore.
- [ ] import questões.
- [ ] import alternativas/correta.
- [ ] import metadata.
- [ ] import snippets LaTeX.
- [ ] relatório.

---

# 34. Checklist visual

A interface deve passar estes testes:

- [ ] Nenhum painel parece “CRUD de sistema interno de 2014”.
- [ ] A árvore tem densidade próxima de IDE.
- [ ] Editor domina visualmente o centro.
- [ ] Preview é legível sem abrir modal.
- [ ] Agente não rouba espaço quando fechado.
- [ ] Botão do agente é reconhecível e discreto.
- [ ] Resize não quebra layout.
- [ ] 1366×768 continua utilizável.
- [ ] 1920×1080 fica excelente.
- [ ] Dark mode coerente.
- [ ] Focus ring correto.
- [ ] Atalhos não conflitam com Monaco.
- [ ] Loading nunca congela a UI.
- [ ] Render mostra progresso.
- [ ] Erro de TeX é apresentado como diagnóstico, não como stack trace cru.
- [ ] Empty states explicam próxima ação.

---

# 35. Checklist do painel agêntico

- [ ] O modelo sabe exatamente qual questão está aberta.
- [ ] Seleção do Monaco pode ser anexada.
- [ ] O usuário vê o provider/modelo.
- [ ] O modelo não recebe secrets.
- [ ] Tools são definidas pelo servidor.
- [ ] Tool inputs são validados.
- [ ] Tool outputs têm limite.
- [ ] O agente não possui tool de SQL arbitrário.
- [ ] O agente não possui tool de shell arbitrário.
- [ ] O agente não altera DB sem approval.
- [ ] Candidate render é isolado.
- [ ] Retry é limitado.
- [ ] Todas as tentativas são auditadas.
- [ ] Antes/depois pode ser comparado.
- [ ] Patch parcial pode ser aprovado.
- [ ] Patch pode ser rejeitado.
- [ ] Aplicação gera revisão.
- [ ] Revisão pode ser restaurada.
- [ ] Falha do provider não perde edição do usuário.
- [ ] Ollama offline não impede uso normal do app.
- [ ] OpenAI sem API key mostra instrução clara.

---

# 36. Critérios específicos para “corrigir questão”

Quando o usuário disser “corrija esta questão”, o agente deve analisar separadamente:

1. **Sintaxe LaTeX**
   - compilação;
   - braces;
   - environments;
   - comandos desconhecidos;
   - packages.

2. **Formatação**
   - matemática inline/display;
   - unidades;
   - imagens;
   - tabelas.

3. **Estrutura da questão**
   - enunciado;
   - alternativas;
   - respostas;
   - complemento.

4. **Gabarito**
   - existe alternativa marcada?
   - existem múltiplas corretas indevidas?
   - a solução contradiz o gabarito?

5. **Metadados**
   - tags;
   - assunto;
   - dificuldade;
   - banca;
   - ano;
   - instituição.

6. **Origem**
   - comparar crop/imagem original quando disponível.

Saída:

- diagnóstico.
- patch.
- confidence.
- warnings.
- candidate render.
- nenhuma aplicação automática.

---

# 37. Critérios para futuro batch agent

Antes de liberar lote:

- [ ] single-question agent está estável.
- [ ] patch schema versionado.
- [ ] revisions confiáveis.
- [ ] rollback testado.
- [ ] dry-run.
- [ ] sample mode.
- [ ] custo estimado.
- [ ] concurrency limit.
- [ ] retry.
- [ ] cancel.
- [ ] relatório.
- [ ] filtros explícitos.
- [ ] usuário vê quantidade afetada antes de executar.

---

# 38. Decisões que NÃO devem ser tomadas cedo demais

Não fazer agora:

- microserviços para cada módulo;
- Kubernetes;
- event sourcing;
- vector database por padrão;
- Redis obrigatório;
- CQRS cerimonial;
- multi-tenancy complexo;
- pagamentos;
- marketplace;
- colaboração em tempo real;
- CRDT;
- LSP obrigatório antes do editor funcionar;
- OCR de livro inteiro antes do crop unitário funcionar;
- agente batch antes do agente unitário ser confiável.

A prioridade é entregar valor editorial local.

---

# 39. Preparação para PostgreSQL

Manter desde o início:

- UUIDs.
- `workspaceId`.
- timestamps UTC.
- repository boundaries.
- sem SQL raw espalhado.
- sem paths locais dentro do domínio.
- assets por storage key.
- constraints explícitas.
- migrations versionadas.
- testes que não dependem de comportamento obscuro do SQLite.

Criar um spike PostgreSQL antes do SaaS e rodar a suíte de integração nos dois providers.

---

# 40. Preparação para SaaS

Quando chegar a hora:

```text
Next.js
  ↓
PostgreSQL
  ↓
Object Storage S3
  ↓
Renderer Workers
  ↓
Agent Workers
```

Adicionar:

- auth.
- users.
- memberships.
- workspace roles.
- quotas.
- storage quotas.
- rate limits.
- billing.
- audit trail.
- background jobs distribuídos.

Nada disso deve contaminar o MVP local agora.

---

# 41. Indicadores de sucesso do MVP

O MVP é bem-sucedido se o usuário conseguir, sozinho:

1. abrir a aplicação;
2. selecionar um livro;
3. navegar pela árvore;
4. criar uma questão;
5. editar LaTeX com autocomplete;
6. adicionar alternativas;
7. marcar a correta;
8. ver preview rápido;
9. gerar preview LaTeX real;
10. colar uma imagem;
11. recortar/associar a origem;
12. pedir ao agente uma correção;
13. comparar o patch;
14. aceitar;
15. gerar novamente;
16. fechar/reabrir e encontrar tudo salvo.

Tempo entre editar uma questão e ver o fast preview deve parecer imediato.

Render autoritativo deve ser assíncrono e nunca travar a edição.

---

# 42. Regras para o time não fugir do escopo

1. Toda nova ideia deve ser classificada como:
   - MVP;
   - Pós-MVP;
   - SaaS.
2. Se não bloquear o vertical slice, não entra antes dele.
3. O agente não deve ser implementado como um componente de chat desacoplado do domínio.
4. O renderer não deve ficar dentro do componente React.
5. Prisma não deve ser chamado no client.
6. Não portar XAML.
7. Não copiar bugs/conveniências arquiteturais do legado.
8. Preservar semântica e dados, não estrutura interna do código antigo.
9. Todo novo tipo de questão entra pelo registry/plugin.
10. Toda randomização deve ser reproduzível.
11. Toda modificação agêntica deve ser reversível.
12. Toda fonte original deve ser preservada.
13. Não apagar legacy IDs após import.
14. Não usar PNG como fonte da questão.
15. Não tratar letra de alternativa como identidade.
16. Não executar LaTeX arbitrário de forma insegura.
17. Não implementar batch agent antes de aprovação/revision funcionar.
18. Não escolher Postgres-only features antes do spike.
19. Não esconder erro de compilação.
20. Não sacrificar experiência de teclado.

---

# 43. Entregável recomendado para a primeira PR do produto novo

Título sugerido:

`feat(web): bootstrap LatexBookBank local-first`

Conteúdo:

- app Next.
- TypeScript.
- design tokens.
- shell.
- Prisma SQLite.
- Workspace.
- Publication.
- DocumentNode.
- Question mínimo.
- seed demo.
- README.
- CI.

Não incluir renderer ainda se isso tornar a PR enorme.

Segunda PR:

`feat(editor): tree, Monaco and fast preview`

Terceira:

`feat(render): authoritative LaTeX render pipeline`

Quarta:

`feat(agent): contextual AI panel with patch approval`

---

# 44. Prompt de implementação para agentes de código

Use este bloco ao delegar uma Feature para um agente de código:

```text
Você está implementando uma Feature do LatexBookBank Web.

Regras:
- TypeScript strict.
- Next.js App Router.
- Não alterar o legado WPF.
- Não acessar Prisma em Client Components.
- Validar inputs com Zod.
- Separar domínio/use-case/infra quando a lógica não for trivial.
- Não adicionar dependência sem justificar.
- Não introduzir microserviço.
- Não adicionar `any` sem justificativa explícita.
- Toda mutation deve tratar erro.
- Toda UI assíncrona precisa de loading/error/empty state.
- Preservar atalhos do Monaco.
- Testar as regras de domínio.
- Atualizar documentação.
- Rodar lint, typecheck, testes e build.
- Não “resolver” requisitos removendo comportamento.
- Se uma decisão arquitetural tiver impacto futuro SQLite→PostgreSQL, documentá-la.

Antes de codificar:
1. leia esta especificação;
2. localize o módulo correspondente;
3. identifique entidades/use-cases envolvidos;
4. liste riscos;
5. implemente a menor mudança coerente;
6. adicione testes;
7. demonstre critérios de aceite.
```

---

# 45. Conclusão

O LatexBookBank Web não deve ser tratado como uma simples reescrita do aplicativo desktop.

A estratégia correta é:

```text
patrimônio do legado
      +
modelo estruturado moderno
      +
IDE LaTeX
      +
render autoritativo
      +
ingestão visual
      +
agente com tools e aprovação
      +
randomização determinística
      =
plataforma editorial técnica
```

O primeiro objetivo não é “fazer um SaaS”.

O primeiro objetivo é criar uma ferramenta local tão boa que o próprio autor queira usá-la todos os dias.

Quando esse núcleo estiver sólido, PostgreSQL, usuários, cloud storage, workers e SaaS tornam-se uma evolução de infraestrutura — não uma reescrita do produto.
