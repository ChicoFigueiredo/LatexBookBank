# LatexBookBank Web — Checklist de Execução

> Instrumento de controle de [`_planejamento.md`](./_planejamento.md).
> Origem: [`../prompts/LatexBookBank_Web_Especificacao_Mestra.md`](../prompts/LatexBookBank_Web_Especificacao_Mestra.md).
>
> **Como usar.** Marque só o que estiver demonstrável — um item marcado significa que existe
> comando, teste ou tela que prova. Ao fim de cada fase, o Definition of Done da §12 deste
> documento precisa passar inteiro antes do checkpoint humano.

**Progresso:** Fase 0 de 16 · 0/17 fases concluídas

| Wave | Fases | Estado |
|---|---|---|
| A — fundação e IDE editorial | 0 · 1 · 2 · 3 · 4 · 5 · 6 | ☐ não iniciada |
| B — banco de questões | 7 | ☐ não iniciada |
| C — agente | 8 · 9 · 10 | ☐ não iniciada |
| D — acervo legado | 11 · 12 | ☐ não iniciada |
| E — ingestão visual | 13 · 14 | ☐ não iniciada |
| F — diferencial de produto | 15 · 16 | ☐ não iniciada |

---

## 0. Pré-requisitos verificados

Levantados em 2026-08-07, antes do planejamento. Não precisam ser refeitos.

- [x] Node.js v24.16.0 disponível
- [x] pnpm 10.34.1 disponível
- [x] TeX Live 2023 com `tikz`, `pgfplots`, `siunitx`, `xlop`, `cancel`, `amsmath`, `standalone`
- [x] `pdftocairo` 24.02.0 disponível
- [x] Docker disponível
- [x] Ollama rodando com 13 modelos
- [x] `/mnt/d` é ext4 — sem penalidade de I/O do WSL
- [x] Preâmbulo legado compila limpo: `pdflatex` 2,1 s + `pdftocairo` 0,26 s
- [x] Acervo legado mapeado: 13 bibliotecas, 64 publicações, 297 nós, 1.247 alternativas
- [x] `LatexMetadata.db` mapeado: 653 autocompletes, 2.741 símbolos, 13 grupos
- [x] Design system inventariado e decisão de adoção registrada (D13)
- [ ] Repositório GitLab `bqcf/bqcf.windows` inspecionado *(bloqueado: exige autenticação)*

---

## Wave A — fundação e IDE editorial

### Fase 0 — Fundação

**Bootstrap**
- [ ] Workspace pnpm criado com `apps/web`
- [ ] Next.js com App Router
- [ ] TypeScript strict, sem `any` injustificado
- [ ] ESLint + Prettier configurados
- [ ] Aliases de import
- [ ] Scripts `dev`, `build`, `lint`, `typecheck`, `test`
- [ ] Estrutura modular criada (`modules/`, `shared/`, `infrastructure/`)
- [ ] Convenções documentadas no README

**Fronteiras arquiteturais (falham o lint quando violadas)**
- [ ] Nenhum componente React importa Prisma
- [ ] Nenhum módulo de domínio importa `next/*`
- [ ] O renderer não importa React
- [ ] Regras verificadas com violação proposital antes de marcar

**Persistência**
- [ ] Prisma + SQLite configurados
- [ ] Schema núcleo: `Workspace`, `Publication`, `DocumentNode`, `Question`, `QuestionOption`, `Tag`, `QuestionTag`
- [ ] Migration inicial versionada
- [ ] Client Prisma server-only
- [ ] Interfaces de repository definidas
- [ ] Implementação Prisma das interfaces
- [ ] Seed de demonstração (publicação com capítulo, seção e questões)

**Preparação PostgreSQL** *(spec §39)*
- [ ] UUIDs em todas as entidades
- [ ] `workspaceId` presente onde a spec exige
- [ ] Timestamps em UTC
- [ ] Nenhuma feature SQLite-only no domínio
- [ ] Estratégia de migrations futuras documentada

**Setup e CI**
- [ ] `pnpm setup` cria diretórios locais
- [ ] `pnpm setup` cria `.env.local` a partir de exemplo
- [ ] `pnpm setup` roda generate, migrations e seed
- [ ] `pnpm setup` verifica TeX, Poppler e provider de IA, e informa ausências sem instalar nada
- [ ] CI: install locked, lint, typecheck, unit, build

**Aceite da fase**
- [ ] `pnpm setup && pnpm dev` sobe a aplicação
- [ ] Publicação demo navegável
- [ ] CI verde

---

### Fase 1 — Design system e shell

**Tokens e temas**
- [ ] `tokens.css` portado e re-tokenizado para a identidade do LatexBookBank (D15)
- [ ] Contrato semântico dos tokens preservado (nomes de variável inalterados)
- [ ] Namespace `pedagogy.*` removido
- [ ] Namespace `--ai` preservado para as superfícies do agente
- [ ] Tema claro/papel como default
- [ ] Tema dark coerente
- [ ] Tema alto contraste (AAA)
- [ ] `_adherence.oxlintrc.json` incorporado ao lint
- [ ] Lint rejeita hex cru fora dos tokens (verificado com violação proposital)

**Componentes portados `.jsx` → `.tsx`**
- [ ] `Icon` (lucide, stroke 1.5, grid 16)
- [ ] `AdminShell`
- [ ] `Divider` (WAI-ARIA window splitter)
- [ ] `CommandPalette`
- [ ] forms: `Button`, `IconButton`, `Input`, `Select`, `Checkbox`, `Toggle`, `Field`, `Combobox`
- [ ] display: `Badge`, `Chip`, `StatusDot`, `MetricCard`, `ArtifactStatus`
- [ ] navigation: `Tabs`, `Segmented`, `Breadcrumb`, `PageHeader`, `Tree`
- [ ] feedback: `Banner`, `Callout`, `EmptyState`, `Modal`, `Toast`
- [ ] `BrandMark` substituído pela identidade do LatexBookBank
- [ ] Nenhum componente portado quebra sob SSR

**Primitivas complementares** *(D13 — lacuna do DS)*
- [ ] Radix headless para context menu
- [ ] Radix headless para tooltip
- [ ] Radix headless para popover
- [ ] Estilizadas apenas com tokens do DS; sem Tailwind, sem shadcn

**Zonas do workbench** *(D14)*
- [ ] Rail com módulos: Biblioteca, Publicações, Avaliações, Importação, Diagnóstico
- [ ] Sidebar contextual reservada para a árvore
- [ ] Main com divisão interna editor | preview
- [ ] Aside para o painel agêntico, com FAB `✦` quando fechado
- [ ] Topbar com breadcrumb, busca e ação primária
- [ ] Statusbar (mono 11px)
- [ ] Larguras das divisórias persistidas em `localStorage`
- [ ] Estado do aside (aberto/fechado) persistido
- [ ] Ctrl+K abre a paleta com comandos de navegação

**Aceite da fase**
- [ ] Utilizável em 1366×768
- [ ] Excelente em 1920×1080
- [ ] Redimensionar não quebra o layout
- [ ] Larguras sobrevivem a refresh
- [ ] Checklist visual (§9 deste documento) passa nos itens aplicáveis

---

### Fase 2 — Árvore de documento

**API e renderização**
- [ ] `GET /api/publications/:id/tree`
- [ ] Renderização recursiva com profundidade arbitrária
- [ ] Virtualização
- [ ] Ícones por `NodeKind`
- [ ] Estado selecionado destacado
- [ ] Breadcrumb refletindo o nó atual
- [ ] Expandidos e selecionado persistidos

**Indicadores de estado** *(spec §4.1)*
- [ ] Conteúdo não salvo
- [ ] Erro de render
- [ ] Questão incompleta
- [ ] Questão validada
- [ ] Modificações agênticas pendentes

**CRUD**
- [ ] Criar nó filho
- [ ] Criar nó irmão
- [ ] Renomear inline (F2)
- [ ] Duplicar
- [ ] Excluir logicamente
- [ ] Restaurar
- [ ] Menu de contexto

**Ordenação e movimento**
- [ ] Fractional indexing implementado
- [ ] Testes de propriedade do ranking
- [ ] Teste de rebalanceamento de rank
- [ ] Mover como filho
- [ ] Mover como irmão
- [ ] Reordenar
- [ ] Drag-and-drop via `dnd-kit`
- [ ] Ciclos rejeitados, com teste

**Busca e teclado**
- [ ] Busca e filtro por texto
- [ ] Filtro por tipo, erro e incompleta
- [ ] `Ctrl+N` novo irmão
- [ ] `Ctrl+Shift+N` novo filho
- [ ] `Alt+↑/↓` mover
- [ ] `Del` excluir com confirmação
- [ ] Atalhos não conflitam com o Monaco

**Aceite da fase**
- [ ] §33 "Árvore" completo (§8 deste documento)
- [ ] Estado da árvore persiste entre sessões

---

### Fase 3 — Monaco e autosave

- [ ] Monaco como client component isolado, com dynamic import
- [ ] Sem erro de hidratação
- [ ] Estado de loading enquanto carrega
- [ ] Redimensiona junto com o painel
- [ ] Tema claro e escuro seguindo o tema do app
- [ ] Language configuration LaTeX: brackets, comments, tokens, auto-close
- [ ] Syntax highlighting
- [ ] Line numbers
- [ ] Bracket matching
- [ ] Word wrap
- [ ] Minimap desligado por padrão
- [ ] Model de editor por campo
- [ ] Abas internas: Conteúdo, Resposta, Complemento, Metadados, Origem
- [ ] Autosave com debounce
- [ ] `Ctrl+S` salva imediatamente
- [ ] Dirty state visível
- [ ] Concorrência otimista por `updatedAt`
- [ ] Conflito detectado e apresentado
- [ ] Conflito nunca sobrescreve em silêncio, com teste

**Aceite da fase**
- [ ] Editar, sair e voltar encontra o conteúdo salvo
- [ ] Teste de conflito passa

---

### Fase 4 — Conhecimento LaTeX do legado

**Importador**
- [ ] Leitura de `LatexMetadata.db` estritamente read-only
- [ ] Import idempotente
- [ ] Relatório com contagens
- [ ] 653 autocompletes importados
- [ ] 2.741 símbolos importados
- [ ] 13 grupos de símbolos importados
- [ ] 29 menus de ícones importados
- [ ] Categorias preservadas
- [ ] Delimitador legado `§` convertido em placeholders nativos do Monaco

**Editor**
- [ ] Completion provider com trigger `\`
- [ ] `Ctrl+Space` dispara completion
- [ ] Prioridade e documentação nos itens
- [ ] Snippets com navegação por tab
- [ ] Seleção incorporada ao snippet quando aplicável
- [ ] Palette de símbolos agrupada
- [ ] Busca na palette
- [ ] Inserção no cursor

**Aceite da fase**
- [ ] Contagens do relatório conferem com as do levantamento
- [ ] Autocomplete e snippets funcionam com o acervo legado real

---

### Fase 5 — Fast Preview

- [ ] `PreviewModel` derivado do `QuestionAggregate`
- [ ] Enunciado
- [ ] Alternativas
- [ ] Resposta
- [ ] Parágrafos e marcadores
- [ ] Matemática inline
- [ ] Matemática display
- [ ] Imagens
- [ ] Caixas simples
- [ ] MathJax integrado
- [ ] Sanitizer aplicado a qualquer HTML gerado
- [ ] Debounce configurável
- [ ] Aviso visível: "Preview rápido — pode diferir do PDF final"

**Aceite da fase**
- [ ] Latência entre editar e ver o preview parece imediata
- [ ] Preview nunca congela a UI

---

### Fase 6 — Render autoritativo

**Profiles**
- [ ] `LatexProfile` com documentclass, packages, macros, engine e defaults
- [ ] Profile "Legacy Compatibility" a partir de `latex-includes.tex`
- [ ] `tikz` compila
- [ ] `pgfplots` compila
- [ ] `siunitx` compila
- [ ] `xlop` compila
- [ ] `cancel` compila

**Pipeline**
- [ ] `LatexBuilder` alimentado pelo `QuestionTypePlugin`
- [ ] Template e preamble aplicados
- [ ] Assets referenciados corretamente
- [ ] `pdflatex` via `execFile` com argumentos — nunca string de shell
- [ ] Diretório temporário por job
- [ ] Timeout de compilação
- [ ] `shell-escape` bloqueado
- [ ] stdout, stderr e exit code capturados
- [ ] `pdftocairo` gera PNG
- [ ] DPI configurável
- [ ] Artifact salvo

**Job, cache e coalescing**
- [ ] `RenderJob` persistido
- [ ] API de criação, status e resultado
- [ ] Content hash cobre LaTeX final, template, preamble, assets, engine, parâmetros e versão do renderer
- [ ] Cache hit retorna artefato anterior e marca `cacheHit`
- [ ] Invalidação por versão do renderer
- [ ] Render pendente é cancelado quando ainda não iniciou
- [ ] Render intermediário é descartado
- [ ] Estado final converge para o último pedido, com teste

**Interface**
- [ ] Aba PDF
- [ ] Aba PNG
- [ ] Aba Log
- [ ] Aba Source (`.tex` montado)
- [ ] `Ctrl+Enter` dispara render
- [ ] Copiar LaTeX final
- [ ] Baixar artefato
- [ ] Abrir em tela cheia
- [ ] Progresso visível durante o render
- [ ] Erro apresentado como diagnóstico, não como stack trace
- [ ] Diagnósticos decorados no Monaco
- [ ] Clique no log navega para a linha

**Otimização**
- [ ] Tempo base medido e registrado
- [ ] Preâmbulo pré-compilado (`mylatexformat`) implementado
- [ ] Ganho registrado com número antes/depois

**Aceite da fase**
- [ ] Render autoritativo nunca trava a edição
- [ ] Cache hit demonstrado com medição

---

## Wave B — banco de questões

### Fase 7 — Tipos, alternativas e metadados

**Registry**
- [ ] `QuestionTypePlugin` com `validate`, `buildLatex`, `buildFastPreview` e `randomize` opcional
- [ ] Plugin Discursiva
- [ ] Plugin Múltipla Escolha com quantidade arbitrária de alternativas
- [ ] Nenhum `switch` global sobre tipo de questão

**Alternativas**
- [ ] `QuestionOption` com UUID
- [ ] `sortKey` fracionário
- [ ] `isCorrect` por alternativa
- [ ] Letra A/B/C calculada apenas na projeção
- [ ] Nenhum vínculo de gabarito por letra
- [ ] `legacyMarcacao` guardado apenas para auditoria
- [ ] Adicionar e remover alternativa
- [ ] Reordenar por drag
- [ ] Marcar correta
- [ ] Botão "embaralhar visualização"
- [ ] **Teste: o gabarito sobrevive à reordenação das alternativas**

**Metadados e tags**
- [ ] Dificuldade na escala legada (0, 2, 5, 7, 10)
- [ ] Ano
- [ ] Banca
- [ ] Instituição
- [ ] Cargo
- [ ] Nível do cargo
- [ ] Origem
- [ ] Video URL
- [ ] Criar e remover tag
- [ ] Autocomplete de tags
- [ ] Filtro por tag
- [ ] `validate_question` com regras, warnings e inconsistências

**Aceite da fase**
- [ ] §33 "Questão" completo (§8 deste documento)

---

## Wave C — agente

### Fase 8 — Provider e painel (somente leitura)

**Provider**
- [ ] Interface `AiProvider` com `listModels`, `run` e `stream` opcional
- [ ] `OpenAiCompatibleProvider` com `baseURL` configurável
- [ ] Perfil OpenRouter (padrão)
- [ ] Perfil OpenAI
- [ ] Perfil Ollama local
- [ ] Perfil custom
- [ ] Matriz de capacidades por perfil (tool calling nativo × fallback JSON)
- [ ] Settings: provider, modelo, endpoint
- [ ] Botão "testar conexão"
- [ ] Chave existe apenas no servidor
- [ ] Chave nunca chega ao browser, verificado
- [ ] Testes de contrato com respostas gravadas

**Painel**
- [ ] Painel no `aside`, fechado por padrão
- [ ] FAB `✦` abre e fecha
- [ ] `Ctrl+Shift+A`
- [ ] Redimensionável
- [ ] Estado persistido
- [ ] `AgentContext` montado e exibido no `AIContextBar`
- [ ] Contexto é explícito e removível
- [ ] Seleção do Monaco pode ser anexada
- [ ] Provider e modelo visíveis

**Tools somente leitura**
- [ ] `get_current_question`
- [ ] `get_question_options`
- [ ] `get_question_metadata`
- [ ] `get_source_anchor`
- [ ] `get_render_diagnostics`
- [ ] `search_questions`
- [ ] `validate_question`
- [ ] Tools definidas pelo servidor, nunca pelo modelo
- [ ] Inputs de tool validados
- [ ] Outputs de tool com limite de tamanho
- [ ] Nenhuma tool de SQL arbitrário
- [ ] Nenhuma tool de shell arbitrário
- [ ] Nenhuma tool de escrita exposta

**Execução e auditoria**
- [ ] Modo `ASK`
- [ ] Timeline de tool calls com `ToolCallCard`
- [ ] Tool, input resumido, output, duração e status visíveis
- [ ] Custo e tokens exibidos quando disponíveis
- [ ] `AgentRun` persistido
- [ ] Prompts completos não vão para o log por padrão

**Aceite da fase**
- [ ] O modelo sabe exatamente qual questão está aberta
- [ ] Ollama offline não impede o uso normal do app
- [ ] Ausência de chave mostra instrução clara
- [ ] Falha do provider não perde edição do usuário

---

### Fase 9 — Patch, diff e aprovação

**Patch**
- [ ] `QuestionPatch` definido em Zod
- [ ] Whitelist de campos alteráveis
- [ ] Todo patch validado antes de ser apresentado
- [ ] `propose_question_patch`
- [ ] `propose_option_patch`
- [ ] `propose_metadata_patch`
- [ ] `propose_tags`
- [ ] `propose_reorder_options`
- [ ] Schema do patch versionado

**Apresentação**
- [ ] Resumo do que o agente entendeu
- [ ] Campos afetados listados
- [ ] Diff por campo
- [ ] Diff Monaco para LaTeX
- [ ] Render antes
- [ ] Render depois
- [ ] Warnings
- [ ] Custo e uso quando disponíveis

**Candidate render**
- [ ] `render_candidate_latex` isolado
- [ ] Nenhuma escrita no banco
- [ ] Diagnostics devolvidos ao agente

**Aplicação**
- [ ] Aplicar tudo
- [ ] Aplicar seleção
- [ ] Rejeitar
- [ ] Pedir revisão, com feedback ao agente
- [ ] Revisão anterior criada antes de aplicar
- [ ] Aplicação dentro de transação
- [ ] Reverter após aplicação
- [ ] Nada é aplicado sem aprovação explícita

**Modos**
- [ ] `REVIEW`
- [ ] `FIX_LATEX` iterativo
- [ ] Máximo de iterações configurável (default 3)
- [ ] Timeout global
- [ ] Cada tentativa registrada
- [ ] `ENRICH` com confidence e warnings
- [ ] `STRUCTURE` a partir de texto bruto

**Critérios de "corrigir questão"** *(spec §36)*
- [ ] Sintaxe LaTeX
- [ ] Formatação
- [ ] Estrutura da questão
- [ ] Gabarito (existe correta? há múltiplas indevidas? a solução contradiz?)
- [ ] Metadados
- [ ] Origem (compara com o crop quando disponível)

**Aceite da fase**
- [ ] §35 completo (§10 deste documento)
- [ ] E2E do fluxo crítico passa ponta a ponta

---

### Fase 10 — Revisões e histórico

- [ ] `Revision` com `entityType`, `entityId`, `revisionNumber` e `snapshotJson`
- [ ] Origem `USER`
- [ ] Origem `IMPORT`
- [ ] Origem `AGENT`
- [ ] Origem `SYSTEM`
- [ ] `agentRunId` vinculado quando aplicável
- [ ] Aba Histórico com timeline
- [ ] Diff entre revisões
- [ ] Restaurar revisão
- [ ] Restauração devolve o estado exato, com teste
- [ ] Restauração é auditada

---

## Wave D — acervo legado

### Fase 11 — Importação

**Leitura segura**
- [ ] Banco legado aberto estritamente read-only
- [ ] Originais nunca modificados
- [ ] Detecção da geração de schema por biblioteca
- [ ] Geração `add_LatexComplemento` suportada (10 bibliotecas)
- [ ] Geração `Questao_Imagens_Completa` suportada (2 bibliotecas)
- [ ] Bibliotecas sem `__EFMigrationsHistory` suportadas (2)
- [ ] Campos ausentes degradam sem quebrar

**Scanner**
- [ ] Detecta bibliotecas a partir de `padrao.knowchicoconfig`
- [ ] Conta tabelas e linhas
- [ ] Relatório de integridade: questões órfãs
- [ ] Relatório: pais ausentes
- [ ] Relatório: alternativas inválidas
- [ ] Relatório: assets ausentes

**Mapeamento**
- [ ] Biblioteca → `Workspace` (D11)
- [ ] `Publication` com `legacyId` e `legacyUuid`
- [ ] Autores
- [ ] Editoras
- [ ] Tags e tags de conhecimento
- [ ] `Questao` → `DocumentNode`
- [ ] `TipoQuestao` negativo → `NodeKind` estrutural
- [ ] `TipoQuestao` positivo → `Question`
- [ ] **`Ordem` ignorada; ordem derivada de `IdQuestao`**
- [ ] `sortKey` fracionário gerado
- [ ] `Numeracao` → `numberingStyle`
- [ ] `Numeracao_Original` → `originalLabel`
- [ ] `Questao_Itens` → `QuestionOption`
- [ ] `Marcacao` → `legacyMarcacao`, nunca como identidade
- [ ] `Questao_Itens.Correta` → `isCorrect`
- [ ] `Questao.Correta` ignorado
- [ ] `IsExpanded`, `IsSelected`, `IdQuestao_Original` ignorados
- [ ] Dificuldade na escala 0/2/5/7/10
- [ ] Metadados de concurso (banca, instituição, cargo, nível, ano)
- [ ] LaTeX: enunciado, resposta, complemento, origem

**Assets**
- [ ] `pub<N>/cover.jpg` → `Asset(COVER)`
- [ ] `<Título>.detail.json` → `metadataJson`
- [ ] `preview.png` **não** importado (é cache de render)
- [ ] Fontes de figura classificadas por tipo: gnuplot, pgf, asymptote, geogebra, tpx, tex, table, svg, eps
- [ ] PDFs → `Asset(SOURCE_PDF)`
- [ ] Relatório do que caiu em `ATTACHMENT` por falta de classificação
- [ ] Nenhum arquivo descartado silenciosamente

**Execução**
- [ ] Dry-run sem nenhuma escrita
- [ ] Import idempotente por `legacyId` + `workspaceId`
- [ ] `ImportReport`: importados, atualizados, ignorados, inconsistentes, órfãos, assets ausentes
- [ ] `legacyId` preservado após o import

**Invariantes afirmadas** *(falham ruidosamente se violadas)*
- [ ] Toda questão de múltipla escolha tem exatamente uma alternativa correta
- [ ] Todo `IdQuestao_Pai` não nulo aponta para nó existente na mesma biblioteca
- [ ] Nenhum ciclo na árvore
- [ ] Rodar o import duas vezes não cria nada novo

**Aceite da fase**
- [ ] As 13 bibliotecas importam
- [ ] Contagens batem com o levantamento (64 pubs, 297 nós, 1.247 alternativas) ou cada divergência está explicada no relatório
- [ ] §33 "Legado" completo (§8 deste documento)

---

### Fase 12 — Busca

- [ ] `QuestionSearchService` abstrato
- [ ] Busca por título e apelido
- [ ] Busca por enunciado
- [ ] Filtro por tags
- [ ] Filtro por banca
- [ ] Filtro por instituição
- [ ] Filtro por ano
- [ ] Filtro por tipo
- [ ] Filtro por dificuldade
- [ ] Integração com `Ctrl+K`
- [ ] Benchmark do FTS5 executado
- [ ] Decisão sobre FTS5 documentada com números

---

## Wave E — ingestão visual

### Fase 13 — Assets, PDF e crop

**Asset store**
- [ ] Paths sanitizados
- [ ] Nenhum path escapa do workspace, com teste
- [ ] sha256 do conteúdo
- [ ] MIME e extensão validados
- [ ] Limite de upload
- [ ] Metadata (tamanho, dimensões, filename original)
- [ ] Storage key, sem path local no domínio

**Entrada**
- [ ] Upload por file picker
- [ ] Drag-and-drop
- [ ] `Ctrl+V` de imagem
- [ ] Inserção assistida de figura: width, height, caption, label
- [ ] Snippet `figure/includegraphics` gerado

**PDF e crop**
- [ ] Visualizador de PDF com páginas
- [ ] Zoom
- [ ] Navegação
- [ ] Desenhar retângulo de crop
- [ ] Ajustar o retângulo
- [ ] Salvar crop
- [ ] `SourceAnchor` criado com página e bounding box
- [ ] `Asset(CROP)` criado
- [ ] Imagem original preservada
- [ ] Opções após o crop: inserir como imagem, reconhecer matemática, reconhecer texto, anexar como referência

**Aceite da fase**
- [ ] §33 "Assets" completo (§8 deste documento)
- [ ] "Voltar à origem" funciona a partir de uma questão

---

### Fase 14 — Reconhecimento matemático

- [ ] `MathRecognitionProvider` definido
- [ ] Resultado com latex, confidence, alternatives, provider, model e metadados
- [ ] Implementação via modelo multimodal por endpoint OpenAI-compatible
- [ ] Opção de provider local
- [ ] Timeout
- [ ] Erro tratado
- [ ] Fluxo: crop → reconhecer → LaTeX candidato → fast preview → editar → render autoritativo → aceitar
- [ ] Crop original nunca descartado
- [ ] Revisão humana obrigatória antes de aceitar
- [ ] Falha do provider não perde trabalho

---

## Wave F — diferencial de produto

### Fase 15 — Avaliações e variantes

**Randomização**
- [ ] PRNG determinístico
- [ ] Testes de determinismo
- [ ] Embaralhar alternativas preservando `optionId`
- [ ] Letra recalculada como projeção
- [ ] Mapa `optionId → displayedLabel` persistido
- [ ] Embaralhar questões
- [ ] Ordem das questões persistida
- [ ] Seed persistida

**Assessment**
- [ ] `Assessment`
- [ ] `AssessmentSection`
- [ ] `AssessmentRule`
- [ ] `AssessmentItem`
- [ ] `AssessmentVariant`
- [ ] `AssessmentVariantQuestion`
- [ ] `AssessmentVariantOptionMap`
- [ ] `DocumentTemplate` separando conteúdo de apresentação
- [ ] Export versão aluno (sem resposta)
- [ ] Export versão professor (com resposta)
- [ ] Export gabarito
- [ ] Mesma questão aparece em templates diferentes sem duplicação

**Aceite da fase**
- [ ] A mesma seed reproduz a mesma prova byte a byte, em processos diferentes

---

### Fase 16 — Endurecimento e preparação SaaS

**Diagnóstico** *(spec §25)*
- [ ] Versão do app
- [ ] Path do SQLite
- [ ] TeX disponível e versão do `pdflatex`
- [ ] `pdftocairo` disponível
- [ ] Provider de IA e modelo
- [ ] Ollama disponível
- [ ] Tamanho do cache
- [ ] Jobs
- [ ] Último erro

**Logs**
- [ ] Logs estruturados de render
- [ ] Logs estruturados de import
- [ ] Logs estruturados de agente
- [ ] Logs estruturados de persistência
- [ ] Prompts completos fora do log por padrão

**Preparação SaaS**
- [ ] Spike PostgreSQL: schema migrado
- [ ] Suíte de integração roda nos dois providers
- [ ] Diferenças documentadas em relatório
- [ ] `StorageProvider` com implementação local e interface pronta para S3
- [ ] `workspaceId` em todas as entidades relevantes
- [ ] Guard central de autorização, mesmo em single-user

**E2E** *(spec §27)*
- [ ] Abrir publicação
- [ ] Selecionar questão
- [ ] Editar LaTeX
- [ ] Autosave
- [ ] Render
- [ ] Preview aparece
- [ ] Abrir agente
- [ ] Pedir correção
- [ ] Revisar diff
- [ ] Aplicar
- [ ] Render novamente

---

## 8. Checklist de aceite do MVP *(spec §33)*

### Aplicação
- [ ] Sobe com `pnpm dev`
- [ ] Setup local documentado
- [ ] SQLite criado automaticamente
- [ ] Nenhuma dependência do WPF em runtime
- [ ] UI premium e estável

### Árvore
- [ ] Cria filho
- [ ] Cria irmão
- [ ] Renomeia
- [ ] Move
- [ ] Reordena
- [ ] Não permite ciclos
- [ ] Estado persiste

### Questão
- [ ] Discursiva
- [ ] Múltipla escolha
- [ ] Alternativas arbitrárias
- [ ] Correta por UUID
- [ ] Tags
- [ ] Dificuldade
- [ ] Banca
- [ ] Instituição
- [ ] Cargo
- [ ] Ano

### Monaco
- [ ] Highlight LaTeX
- [ ] Autocomplete
- [ ] Snippets
- [ ] Atalhos
- [ ] Autosave
- [ ] Dirty state
- [ ] Diagnostics

### Preview
- [ ] HTML rápido
- [ ] MathJax
- [ ] `Ctrl+Enter`
- [ ] PDF
- [ ] PNG
- [ ] Log
- [ ] Cache

### Agente
- [ ] Painel flutuante
- [ ] Endpoint OpenAI-compatible (OpenRouter/OpenAI) *(adaptado por D3)*
- [ ] Ollama
- [ ] Contexto da questão
- [ ] Diagnostics disponíveis como tool
- [ ] Propõe patch
- [ ] Diff
- [ ] Candidate render
- [ ] Aprovação explícita
- [ ] Revision
- [ ] Rollback

### Assets
- [ ] Upload
- [ ] Paste
- [ ] Crop
- [ ] Source preservado
- [ ] Inserir imagem em LaTeX

### Legado
- [ ] Dry-run
- [ ] Import Publication
- [ ] Import árvore
- [ ] Import questões
- [ ] Import alternativas e correta
- [ ] Import metadata
- [ ] Import snippets LaTeX
- [ ] Relatório

---

## 9. Checklist visual *(spec §34)*

- [ ] Nenhum painel parece "CRUD de sistema interno de 2014"
- [ ] A árvore tem densidade próxima de IDE
- [ ] Editor domina visualmente o centro
- [ ] Preview é legível sem abrir modal
- [ ] Agente não rouba espaço quando fechado
- [ ] Botão do agente é reconhecível e discreto
- [ ] Resize não quebra layout
- [ ] 1366×768 continua utilizável
- [ ] 1920×1080 fica excelente
- [ ] Dark mode coerente
- [ ] Focus ring correto
- [ ] Atalhos não conflitam com Monaco
- [ ] Loading nunca congela a UI
- [ ] Render mostra progresso
- [ ] Erro de TeX é apresentado como diagnóstico, não como stack trace cru
- [ ] Empty states explicam a próxima ação

---

## 10. Checklist do painel agêntico *(spec §35)*

- [ ] O modelo sabe exatamente qual questão está aberta
- [ ] Seleção do Monaco pode ser anexada
- [ ] O usuário vê o provider e o modelo
- [ ] O modelo não recebe secrets
- [ ] Tools são definidas pelo servidor
- [ ] Tool inputs são validados
- [ ] Tool outputs têm limite
- [ ] O agente não possui tool de SQL arbitrário
- [ ] O agente não possui tool de shell arbitrário
- [ ] O agente não altera o banco sem aprovação
- [ ] Candidate render é isolado
- [ ] Retry é limitado
- [ ] Todas as tentativas são auditadas
- [ ] Antes e depois podem ser comparados
- [ ] Patch parcial pode ser aprovado
- [ ] Patch pode ser rejeitado
- [ ] Aplicação gera revisão
- [ ] Revisão pode ser restaurada
- [ ] Falha do provider não perde edição do usuário
- [ ] Ollama offline não impede o uso normal do app
- [ ] Provider sem API key mostra instrução clara

---

## 11. Segurança *(spec §24)*

- [ ] Secrets somente em `.env.local`
- [ ] API key nunca exposta ao browser
- [ ] Paths sanitizados
- [ ] Nenhum path de usuário escapa do workspace
- [ ] MIME e extensão validados
- [ ] Upload limitado
- [ ] Hash de conteúdo usado
- [ ] Nenhum shell montado por concatenação de string
- [ ] Tempo de compilação limitado
- [ ] Shell escape bloqueado no LaTeX
- [ ] Ação agêntica registrada
- [ ] Nenhuma tool arbitrária vinda do modelo
- [ ] Todo patch do agente validado antes de apresentar e de aplicar
- [ ] Patch aplicado dentro de transação
- [ ] Revisão anterior criada antes de mudanças agênticas

---

## 12. Definition of Done — por fase *(spec §28)*

Aplicar integralmente ao fim de **cada** fase, antes do checkpoint humano.

- [ ] Requisitos funcionais implementados
- [ ] TypeScript sem `any` injustificado
- [ ] Lint passa
- [ ] Typecheck passa
- [ ] Testes relevantes adicionados
- [ ] Erro tratado
- [ ] Loading state tratado
- [ ] Empty state tratado
- [ ] Acessibilidade básica
- [ ] Teclado testado quando aplicável
- [ ] Dark e light testados quando aplicável
- [ ] Nenhuma secret no repositório
- [ ] Nenhuma dependência circular intencional
- [ ] Documentação atualizada
- [ ] Critério de aceite demonstrável

---

## 13. Regras invioláveis *(spec §42)*

Verificar em toda revisão de fase:

- [ ] O agente não é um chat desacoplado do domínio
- [ ] O renderer não está dentro de componente React
- [ ] Prisma não é chamado no client
- [ ] Nenhum XAML foi portado
- [ ] Semântica e dados preservados, não a estrutura interna do código antigo
- [ ] Todo novo tipo de questão entra pelo registry
- [ ] Toda randomização é reproduzível
- [ ] Toda modificação agêntica é reversível
- [ ] Toda fonte original é preservada
- [ ] `legacyId` nunca apagado após o import
- [ ] PNG nunca usado como fonte da questão
- [ ] Letra de alternativa nunca tratada como identidade
- [ ] LaTeX nunca executado de forma insegura
- [ ] Batch agent não implementado antes de aprovação e revisão funcionarem
- [ ] Erro de compilação nunca escondido
- [ ] Experiência de teclado nunca sacrificada
