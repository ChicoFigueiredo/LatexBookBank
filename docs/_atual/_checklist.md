# LatexBookBank Web — Checklist de Execução

> Instrumento de controle de [`_planejamento.md`](./_planejamento.md).
> Origem: [`../prompts/260806-01.LatexBookBank_Web_Especificacao_Mestra.md`](../prompts/260806-01.LatexBookBank_Web_Especificacao_Mestra.md).
>
> **Como usar.** Marque só o que estiver demonstrável — um item marcado significa que existe
> comando, teste ou tela que prova. Ao fim de cada fase, o Definition of Done da §14 deste
> documento precisa passar inteiro antes do checkpoint humano.
>
> | Marcador | Significado |
> |---|---|
> | ✅ | Feito e demonstrável |
> | ⛔ | Impedido — a razão vem em itálico ao lado |
> | `[ ]` | Não feito |
>
> **Revisão 2026-08-07** — incorporada a
> [auditoria arquitetural](../prompts/260807-01.Auditoria-Planejamento.e.Checklist.md).
> **Revisão 3 · 2026-08-07** — incorporada a
> [segunda auditoria](../prompts/260807-02.Segunda.Auditoria.md): ajustes de fronteira.
> Parecer **aprovado com ajustes · 9/10 · autorizado iniciar a Fase 0**.
> Direção vigente: **LOCAL-FIRST, CLOUD-READY** (D21). Decisões D21–D37;
> D33 e D34 **suspensas**; D32 corrigida por D36.

**Progresso (2026-09-02, noite):** 933 ✅ · 7 ◐ · 12 ⛔ · 68 `[ ]`. O dia teve três rodadas.
**Manhã** (decisões): 7 sem gabarito importam como inconsistentes; 12 órfãs de seed apagadas;
benchmark da Fase 12 fechado; storage cloud adiado formalmente; UI de lote do Calibre entregue.
**Tarde** (orquestração): 1.311 bibliotecas de resíduo E2E apagadas (sobram 13); relatório de
assets ausentes (acervo 100% íntegro, 11 figuras conferidas 1:1, e ele achou pendência nova — as
figuras não entram no import); escolha de formatos no Calibre; "64 pubs" reconciliado exato.
**Noite** (dogfooding de verdade): o Chico usou a captura e achou o que nenhuma especulação
acharia — o leitor de PDF **não rolava** (bug de altura não herdada, valia também para a aba
Origem), faltavam controles de enquadramento, e a segmentação automática saiu do adiamento pela
porta da frente: 30 de 30 questões na prova real, porque medir a premissa mostrou que ela não era
visão computacional. Ver Fase 15.

| Wave | Fases | Estado |
|---|---|---|
| A — fundação e IDE editorial | ✅0 · **◐1** · **◐2** · ✅3 · ✅4 · **◐5** · **◐6** | 1 e 5 esperam só o olho; a 6 espera o preâmbulo embutido na imagem |
| — prova arquitetural | **◐6.5** | schema PostgreSQL provado; storage parado na decisão |
| B — banco de questões | ✅7 | domínio, telas e schema fechados |
| C — agente | ✅8 · ✅9 · ✅10 | fechada, e a §35 conferida linha a linha |
| D — acervo legado e portabilidade | **◐11** · ✅12 · **◐13** | a 11 tem as 11 bibliotecas escritas de verdade no banco de dev; falta Assets/Editoras/Tags; a 13 só não mostra progresso |
| E — ingestão visual | **◐14** · ✅15 | falta a inserção assistida de figura |
| F — diferencial de produto | ✅16 · **◐17** | a 17 espera o guarda de autorização e o resto do diagnóstico |

**Fases fechadas: 10 de 19** — 0, 3, 4, 7, 8, 9, 10, 12, 15 e 16. *(Eram 2 no cabeçalho antigo, que
estava desatualizado desde a Fase 4; a conferência visual das Fases 1 e 5 continua sendo do Chico.)*

### Por épico *(rastreabilidade da §11 do planejamento)*

| Épico | Fases | ✅ | ◐ | ⛔ | `[ ]` | Estado |
|---|---|---:|---:|---:|---:|---|
| **01** fundação e providers | 0 | 70 | — | — | — | **fechado** — os dois health checks entraram no `setup` (#168) |
| **02** shell e árvore | 1 · 2 | 90 | — | 1 | 2 | 1 é a conferência visual; 1 é virtualização, adiada por decisão |
| **03** editor LaTeX | 3 · 4 | 49 | — | — | — | **fechado** |
| **04** preview e render | 5 · 6 | 159 | — | 3 | 1 | 1 é a conferência visual; os ⛔ são TeX Live 2022×2023, `iwona` e medições descartadas |
| **05** banco de questões | 7 | 48 | 1 | — | — | **fechado**; o ◐ é a conferência visual do §33 |
| **06** ingestão visual | 14 · 15 | 41 | 1 | — | — | falta o reconhecimento de **texto** |
| **07** agente | 8 · 9 · 10 | 97 | — | 3 | — | **fechado**; os ⛔ são vocabulário sem produtor (`IMPORT`, `SYSTEM`) e o fallback JSON |
| **08** legado | 11 | 56 | 2 | 2 | 1 | fechada: 11 bibliotecas, 8 publicações com capa e PDF fonte quando existe; só falta relatório formal de assets ausentes |
| **09** avaliações | 16 | 25 | — | 1 | — | **fechado**; o ⛔ é `AssessmentRule`, sem caso de uso |
| **10** operação e busca | 10 · 12 · 17 | 58 | — | 3 | 3 | guarda de autorização, e 2 presos ao acervo |
| — portabilidade `.lbb` | 13 | 40 | — | — | 1 | migradores de formato (escopo futuro) |
| — prova arquitetural | 6.5 | 8 | 1 | 4 | 42 | **parado na decisão de storage**, que é do Chico |
| — seções cruzadas | §8–§15 | 173 | — | 1 | 31 | 12 são o checklist visual; 8 são o §33 "Legado" |

*As seções cruzadas repetem, por tema, o que as fases já afirmam — elas não são trabalho novo, são
a verificação de que o trabalho das fases fecha contra a spec.*

---

## 0. Pré-requisitos verificados

Levantados em 2026-08-07, antes do planejamento. Não precisam ser refeitos.

- ✅ Node.js v24.16.0 disponível
- ✅ Bun 1.3.14 disponível *(substituiu o pnpm em #21)*
- ✅ TeX Live 2023 com `tikz`, `pgfplots`, `siunitx`, `xlop`, `cancel`, `amsmath`, `standalone`
- ✅ `pdftocairo` 24.02.0 disponível
- ✅ Docker disponível
- ✅ Ollama rodando com 13 modelos
- ✅ `/mnt/d` é ext4 — sem penalidade de I/O do WSL
- ✅ Preâmbulo legado compila limpo: `pdflatex` 2,1 s + `pdftocairo` 0,26 s
- ✅ Acervo legado mapeado: 13 bibliotecas, 64 publicações, 297 nós, 1.247 alternativas
- ✅ `LatexMetadata.db` mapeado: 653 autocompletes, 2.741 símbolos, 13 grupos
- ✅ Design system inventariado e decisão de adoção registrada (D13)
- ✅ Portas Docker varridas; bloco `28xxx` verificado livre e fora da faixa efêmera (D19)
- ✅ Restrição confirmada: `pdflatex` não roda em função serverless (§2.8 do planejamento)
- ✅ Auditoria arquitetural cruzada e incorporada (D21–D31)
- ✅ **Inventário de volume executado (D31):** acervo = 109 MB em 409 arquivos; 326 conteúdos
      distintos; 9 grupos duplicados; 0,77 MB recuperáveis; `ITA/Material` (3,2 GB) e `Listas/`
      (327 MB) identificados como material externo, fora do escopo
- ✅ Arquitetura do render decidida: worker/API em Docker — WSL local, droplet em produção (D27)
- ✅ Contrato do renderer definido como storage-agnostic: `RenderBundle` → `RenderResult` (D35)
- ✅ Backup separado do processo do renderer (D36)
- ✅ `.lbb` definido com Portable Schema versionado (D37)
- ✅ Repositório GitLab `bqcf/bqcf.windows` acessível *(correção de 2026-08-31: a premissa de que exige
  autenticação estava errada — há um clone local em `/mnt/p/e-Matematica/banco-questoes.windows` com
  o histórico completo, incluindo 4 branches que nunca foram para o GitHub. Inspeção linha a linha
  fica fora de escopo por decisão do Chico; é material histórico do desejo original do produto, não
  trabalho pendente)*
- [ ] Parecer específico sobre D33/D34 *(suspensas; o parecer não as menciona)*
- [ ] Destino cloud dos assets escolhido quando for a hora: Vercel Blob × DO Spaces *(**adiada
  formalmente em 2026-09-02**, por decisão do Chico: o projeto é local-first sem meta de venda, e
  escolher provedor hoje seria decidir no vácuo, sem requisito de custo nem de volume. Deixa de
  contar como "esperando o Chico" — volta à mesa quando existir necessidade cloud real)*

---

## Wave A — fundação e IDE editorial

### Fase 0 — Fundação e providers

> **✅ Fase concluída.** 11 issues (#3–#11, #21, #23), PRs #12–#24 abertos, nenhum mergeado.
> CI verde · 94 testes · lint, typecheck e build passando.
> Único item impedido: os dois health checks do renderer, que dependem da Fase 6.

**Bootstrap** — #3
- ✅ Workspace criado com `apps/web` *(Bun workspaces desde #21)*
- ✅ Next.js com App Router em `28080`
- ✅ TypeScript strict, sem `any` injustificado
- ✅ ESLint + Prettier configurados
- ✅ Aliases de import
- ✅ Scripts `dev`, `build`, `lint`, `typecheck`, `test`
- ✅ Estrutura modular da §4.6 do planejamento criada
- ✅ `infrastructure/` com `database/`, `storage/`, `rendering/worker/`, `ai/`
- ✅ **Nenhum diretório `rendering/local` ou `rendering/cloud`**
- ✅ `rendering/local-process/` só existe se o fallback for realmente implementado *(não existe)*
- ✅ Convenções documentadas no README

**Regras de boundary (falham o CI quando violadas)** — #4 *(auditoria §37)*
- ✅ `domain/**` não importa `prisma`
- ✅ `domain/**` não importa `next`
- ✅ `domain/**` não importa SDK de storage
- ✅ `domain/**` não importa `node:fs`
- ✅ `domain/**` não importa SDK de IA
- ✅ `domain/**` não executa `pdflatex` *(via bloqueio de `child_process`)*
- ✅ Nenhum componente React importa Prisma
- ✅ O agente não tem caminho de escrita no banco
- ✅ Todas as regras verificadas com violação proposital antes de marcar

**As quatro fronteiras primárias** — #5 *(D23)*
- ✅ `Repository` — convenção por agregado documentada; `ConcurrencyConflictError` definido *(o `TransactionRunner` que existia aqui foi removido na #191: nunca teve implementação nem chamador)*
- ✅ `StorageProvider` definido (`put`/`get`/`exists`/`delete`)
- ✅ `RenderExecutor` definido — recebe `RenderBundle`, devolve `RenderResult`
- ✅ `AiProvider` definido
- ✅ Outros contratos de domínio criados só quando representam comportamento real
- ✅ Pergunta de controle aplicada antes de cada interface nova
- ✅ Sem factories desnecessárias, sem DI framework, sem service locator

**Persistência — SQLite** — #6 *(D24)*
- ✅ Prisma com `provider = "sqlite"`
- ✅ Schema núcleo: `Workspace`, `Publication`, `DocumentNode`, `Question`, `QuestionOption`, `Tag`, `QuestionTag`, `Asset`, `SourceAnchor`
- ✅ Migration inicial versionada
- ✅ Client Prisma server-only *(lint + import `server-only`)*
- ✅ Repositories concretos: `PrismaPublicationRepository`, `PrismaDocumentTreeRepository` *(#23)*
- ✅ DTOs de saída — objeto Prisma não vaza para o React *(auditoria §40; teste afirma a ausência de `parentId`, `sortKey`, timestamps e `legacyId`)*
- ✅ Seed de demonstração *(1 workspace · 1 publicação · 4 nós · 2 questões · 5 alternativas)*
- ✅ **PostGIS não existe no projeto** *(D22 — afirmado por teste)*

**Portabilidade SQLite → PostgreSQL desde a Fase 0** — #7 *(auditoria §7)*
- ✅ UUID para IDs novos *(afirmado por teste)*
- ✅ `workspaceId` onde faz sentido *(afirmado por teste)*
- ✅ Timestamps UTC *(afirmado por teste)*
- ✅ Constraints explícitas
- ✅ Índices documentados *(afirmados por teste)*
- ✅ Sem SQL raw espalhado *(regra de lint com violação proposital)*
- ✅ Nenhuma regra de negócio dependente de comportamento particular do SQLite
- ✅ Testes de domínio independentes do provider

**Storage** — #8 *(D26)*
- ✅ `LocalFileStorageProvider` implementado
- ✅ `sha256` calculado em toda escrita
- ✅ `storageKey` opaca — nenhum path nem URL no domínio
- ✅ Chaves prefixadas por `workspaceId`
- ✅ Paths sanitizados; nada escapa da raiz do workspace *(4 formatos de escape testados)*
- ✅ Validação de MIME e tamanho
- ✅ **Nenhum binário no banco** *(auditoria §8 — afirmado por teste)*
- ✅ Nenhum SDK concreto de storage fora de `infrastructure/storage/`

**Configuração** — #9
- ✅ Toda infraestrutura configurada por variável de ambiente
- ✅ Nenhum endereço hard-coded
- ✅ `.env.example` documenta as variáveis, sem valores

**`bun run setup`** — #10 *(2ª auditoria §19, §21)*
- ✅ **Docker disponível** — obrigatório
- ✅ **Imagem do renderer buildável** — obrigatório *(#168 — o `setup` constrói quando a imagem não
  existe e diz que vai levar minutos, porque leva: é TeX Live inteiro. Quando já existe, não
  reconstrói — cobrar minutos de quem só queria rodar as migrations seria pior que não checar)*
- ✅ **Renderer inicia e `GET /health` responde** — obrigatório *(#168 — o `setup` sobe o worker e
  espera o `/health`, com espera ativa curta em vez de `sleep` fixo. E resolve o que faltava para
  isso funcionar num clone novo: o **mesmo** segredo em dois arquivos — o `.env` da raiz, que o
  compose lê, e o `.env.local`, que manda o cabeçalho. Era um comentário no `.env.example`, e o
  sintoma de errar era 401 que a app não tinha como explicar)*
- ✅ Provider de IA alcançável — informativo
- ✅ **TeX no host detectado, marcado como fallback opcional — nunca bloqueia** *(verificado com PATH reduzido)*
- ✅ Cria diretórios locais e `.env.local` a partir de exemplo
- ✅ Roda generate, migrations e seed *(seed idempotente — provado em banco limpo: 0 → 2 → 2)*
- ✅ Reporta claramente qual verificação falhou
- ✅ Não instala software de sistema silenciosamente

> Com Bun não há a armadilha do pnpm, onde `setup` era comando reservado e pulava o script
> imprimindo sucesso (#21).

**CI** — #11
- ✅ Install locked, lint, typecheck, unit, build

**Aceite da fase**
- ✅ `bun run setup && bun run dev` sobe a aplicação em `28080`
- ✅ Nenhuma colisão com os containers já existentes na máquina
- ✅ Publicação demo navegável *(lista → árvore → questões com alternativas; verificado no app rodando)*
- ✅ Upload e leitura funcionam pelo `LocalFileStorageProvider` com `sha256` calculado
- ✅ **Ausência de TeX no host não impede o setup**
- ✅ CI verde

> **Fase 0 fechada**, salvo os dois health checks do renderer, impedidos até a Fase 6 por
> dependerem de código que ainda não existe. Todo o resto é demonstrável.
>
> **Toolchain:** Bun 1.3.14 substituiu o pnpm (#21). Node não é mais necessário. O adapter do
> Prisma passou de `better-sqlite3` para **libSQL**, porque o primeiro recusa o runtime do Bun.

---

### Fase 1 — Design system e shell

**Tokens e temas** — #26 · identidade **Papel & Tinta**
- ✅ `tokens.css` portado e re-tokenizado para a identidade do LatexBookBank (D15)
- ✅ Contrato semântico dos tokens preservado *(nomes inalterados — afirmado por teste)*
- ✅ Namespace `pedagogy.*` removido *(afirmado por teste)*
- ✅ Namespace `--ai` preservado para as superfícies do agente
- ✅ Tema claro/papel como default
- ✅ Tema dark coerente *(teste: cobre todo token de cor do claro)*
- ✅ Tema alto contraste (AAA) *(idem)*
- ✅ Regra de aderência incorporada ao lint *(adaptada do `_adherence.oxlintrc.json`)*
- ✅ Lint rejeita hex cru fora dos tokens *(violação proposital recusada; pegou as páginas da Fase 0)*

**Componentes portados `.jsx` → `.tsx`** — #27 *(3 levas)*
- ✅ `Icon` *(set recortado para este domínio: biblioteca, publicação, árvore, render, agente)*
- ✅ forms: `Button`, `IconButton`, `Input`, `Field`
- ✅ forms: `Select`, `Checkbox`, `Toggle`
- ✅ forms: `Combobox` *(busca sem acento afirmada por teste — "matematica" acha "Matemática")*
- ✅ display: `Badge`, `StatusDot`
- ✅ display: `Chip`, `MetricCard`, `ArtifactStatus` *(ontologia remapeada; `proposto ≠ aplicado` afirmado por teste)*
- ✅ feedback: `EmptyState`
- ✅ feedback: `Callout`
- ✅ feedback: `Banner`, `Modal`, `Toast` *(`role=alert` × `role=status`, foco preso e `closeOnScrim` desligável, afirmados por teste)*
- ✅ navigation: `Tabs`, `Segmented`, `Breadcrumb`, `PageHeader`
- ✅ navigation: `Tree` *(#28 — treeview ARIA; clique seleciona, caret expande: aqui um capítulo é conteúdo, não pasta)*
- ✅ `AdminShell` portado como **`Workbench`** *(#28 — o produto é um workbench, não um admin; as zonas são as da D14)*
- ✅ `Divider` *(window splitter WAI-ARIA: ←/→, Home/End, Enter restaura; pointer capture no lugar de listeners globais)*
- ✅ `CommandPalette` *(só monta quando abre — cada abertura nasce zerada, sem efeito de reset)*
- ✅ `BrandMark` substituído pela identidade do LatexBookBank *(chave de grupo `{` + linhas compostas)*
- ✅ Nenhum componente portado quebra sob SSR *(afirmado com `renderToStaticMarkup`)*

**Primitivas complementares** *(D13 — lacuna do DS)* — #29
- ✅ Radix headless para context menu *(grupos derivam os separadores; ação destrutiva isolada no último)*
- ✅ Radix headless para tooltip *(aparece no foco, não só no hover; nunca é o único portador da informação)*
- ✅ Radix headless para popover *(não bloqueia a tela — o que exige atenção exclusiva vai para `Modal`)*
- ✅ Estilizadas apenas com tokens do DS; sem Tailwind, sem shadcn *(lint de aderência verde)*
- ✅ **Radix confinado a `design-system/overlays/`** *(regra de lint com violação proposital em 4 caminhos)*

**Zonas do workbench** *(D14)* — #28, verificadas em `/publications/[id]` com o app rodando
- ✅ Rail com módulos: Biblioteca, Publicações, Avaliações, Importação, Diagnóstico
- ✅ Sidebar contextual reservada para a árvore
- ✅ Main com divisão interna editor | preview *(estrutura e divisória prontas; o preview real é a Fase 5)*
- ✅ Aside para o painel agêntico, com FAB `✦` quando fechado *(nasce fechado — spec §14.6)*
- ✅ Topbar com breadcrumb, busca e ação primária *(slot `actions`)*
- ✅ Statusbar (mono 11px)
- ✅ Larguras das divisórias persistidas em `localStorage` *(via `useSyncExternalStore`, sem quebrar SSR nem hidratação)*
- ✅ Estado do aside (aberto/fechado) persistido *(afirmado por teste de remontagem)*
- ✅ Ctrl+K abre a paleta com comandos de navegação *(⌘K no macOS; afirmado por teste)*

**Primitivas de teclado do shell** *(#28)*
- ✅ Divisória operável só pelo teclado: ←/→ ±16 px, Home/End, Enter restaura
- ✅ Módulo ativo marcado com `aria-current`, não só com cor
- ✅ Toggle do aside mantém o nome e conta o estado por `aria-pressed`

**Aceite da fase**
- ✅ Utilizável em 1366×768 *(#197 — **a aritmética foi conferida numa tela de verdade**: rail 217
  + árvore 281 + editor 432, sem transbordo horizontal. Com o painel do agente aberto o editor cai
  para ~240 px: apertado e **ajustável**, porque as divisórias existem e as larguras persistem. O
  E2E afirma o que é objetivo — cabe —, não o que é confortável, que continua com o Chico)*
- ✅ Cabe em 1920×1080 *(#197 — medido, sem transbordo, editor com 709 px. "Excelente" é juízo e
  continua com o Chico; o que a máquina afirma é que a janela comporta o layout)*
- ✅ Redimensionar não quebra o layout *(#197 — e o teste **encolhe a janela sem recarregar**, que
  é o caso que só o redimensionamento pega: as larguras das divisórias são pixels guardados em
  `localStorage`, e uma divisória arrastada num monitor grande pode não caber no pequeno)*
- ✅ Larguras sobrevivem a refresh
- [ ] Checklist visual (§11 deste documento) passa nos itens aplicáveis

---

### Fase 2 — Árvore de documento

**API e renderização** — #36, #37
- ✅ `GET /api/publications/:id/tree` *(200 com a árvore, 404 explicado, `Cache-Control: no-store`; verificado no app rodando)*
- ✅ Renderização recursiva com profundidade arbitrária *(`nest()` reconstrói do `depth`, sem `parentId` vazar do DTO)*
- ✅ Ícones por `NodeKind`
- ✅ Estado selecionado destacado *(fundo + filete; `aria-selected` no `treeitem`)*
- ✅ Breadcrumb refletindo o nó atual
- ✅ Expandidos e selecionado persistidos *(expandidos pela `Tree`; seleção pelo workbench, que é quem depende dela — via `useStoredState`, sem quebrar hidratação)*
- [ ] Virtualização *(**divergência deliberada do planejamento**, que a pedia "antes de existir
      volume". A maior publicação do acervo tem 297 nós, e o próprio plano classifica o risco
      "árvore grande trava a UI" como **baixo**: otimizar antes de medir custaria complexidade de
      rolagem, foco e teclado por um problema que talvez não exista. Fica aberto como decisão, não
      como esquecimento)*

**Indicadores de estado** *(spec §4.1 · #147)*
- ✅ Conteúdo não salvo *(estado da **sessão**, não da linha: sobe do editor para a árvore, e some ao trocar de nó — por isso vence os outros na precedência)*
- ✅ Erro de render *(o último job da questão; só o estado, não a lista — a árvore quer saber se quebrou, não quantas vezes)*
- ✅ Questão incompleta *(`INVALID`: múltipla escolha sem gabarito é o caso comum)*
- ✅ Questão validada
- ✅ **A precedência é decisão de produto, e está num módulo puro** *(a `Tree` tem um slot só; o mais **recuperável** vem primeiro — não o mais grave, mas o que se perde ao clicar em outro nó)*
- ⛔ Modificações agênticas pendentes — a proposta **não é persistida**: ela vive na sessão até
  ser aprovada. Mostrá-la na árvore exigiria uma tabela nova, e isso é decisão de schema, não
  um indicador a mais
- ✅ **A validação passou a ter produtor** *(#147 — `validateAndPersist` estava escrito e testado desde a Fase 7 e **nunca era chamado**; agora roda depois de todo salvamento que gravou)*
- ✅ O registro de plugins é carregado **pelo caso de uso** *(#147 — `plugins/index.ts` não era importado por ninguém em produção: só pelo próprio teste. `pluginFor` devolvia `null` para tudo, as 16 questões ficaram `UNVALIDATED` desde a Fase 7, e a tool `validate_question` do agente respondia "tipo não suportado" para o acervo inteiro. Guarda novo importa **só** o caso de uso, como a rota faz)*

**CRUD** — #36 *(use cases + rotas; exercitadas contra o banco real)*
- ✅ Criar nó filho *(`POST /nodes`, 201)*
- ✅ Criar nó irmão *(mesmo endpoint, `placement: before|after`)*
- ✅ Renomear inline (F2) *(#37 — nome antigo marcado inteiro; Enter aplica, Esc cancela, sair do campo aplica)*
- ✅ Excluir logicamente *(leva a descendência junto e devolve a lista — o cliente precisa poder avisar)*
- ✅ Restaurar *(recusa com 409 se o ancestral continuar excluído, em vez de devolver nó invisível)*
- ✅ Duplicar *(subárvore inteira numa transação: nós, questão, alternativas e tags; `Ctrl+D`)*
- ✅ A cópia não herda `legacyId` nem `validationStatus` *(não é a linha do legado, e ninguém revisou a variante)*
- ✅ Menu de contexto *(#37 — via `wrapItem`, sem a árvore conhecer menus)*
- ✅ Exclusão confirmada em `Modal`, sem descarte por clique fora *(o "não" precisa ser explícito)*

**Ordenação e movimento** — #35
- ✅ Fractional indexing implementado *(domínio puro, sem dependência; base-62 à la Figma)*
- ✅ Testes de propriedade do ranking *(mil inserções no mesmo ponto e 500 aleatórias: ordem estrita, total, sem colisão)*
- ✅ Teste de rebalanceamento de rank *(300 inserções degeneram a chave; `rebalanceKeys` devolve a < 8 caracteres)*
- ✅ **Colação registrada como D38** *(no PostgreSQL, `sortKey` exige `COLLATE "C"` — a colação padrão inverteria a lista em silêncio)*
- ✅ **Álgebra de posicionamento** *(#36 — `firstChild`/`lastChild`/`before`/`after` cobrem criar, mover e reordenar)*
- ✅ **Ciclos rejeitados, com teste** *(mover para dentro do próprio ramo, em qualquer profundidade; ciclo já gravado no banco não trava a coleta)*
- ✅ Plano de duplicação de subárvore em pré-ordem *(pai sempre antes dos filhos)*
- ✅ Mover como filho *(`PATCH` com `placement`; ciclo devolve 409, não 400 — o pedido é válido, o estado é que recusa)*
- ✅ Mover como irmão
- ✅ Reordenar
- ✅ Drag-and-drop via `dnd-kit` *(três zonas por linha: antes · virar filho · depois; ciclo recusado **durante** o arraste, com a linha em vermelho)*

**Busca e teclado** — #37
- ✅ `Ctrl+N` novo irmão *(com `preventDefault` — no navegador abriria janela nova)*
- ✅ `Ctrl+Shift+N` novo filho
- ✅ `Alt+↑/↓` mover *(seta sozinha só anda o foco; sem o Alt, percorrer reordenaria o acervo)*
- ✅ `Del` excluir com confirmação
- ✅ Teclas dentro do campo de renomeação não viram comando da árvore *(afirmado por teste)*
- ✅ Busca e filtro por texto *(#37 — ignora acento; o resultado arrasta os ancestrais e vem com eles abertos)*
- ✅ Filtro por tipo *(`NodeKind` presentes na publicação; combina com a busca por E)*
- ✅ Filtro "com problema" *(#147 — render quebrado **ou** validação falhando, num botão só: são as duas coisas que impedem a prova de sair. O filtro sai do DTO e **não** do selo escolhido, senão a questão inválida que está sendo editada apareceria como "não salva" e sumiria do filtro que a procura)*
- ✅ Atalhos não conflitam com o Monaco *(#179 — **medido no navegador**, que é o que faltava: os
  atalhos da árvore vivem no `onKeyDown` de cada linha, então com o editor focado `Ctrl+N`,
  `Ctrl+D` e `Alt+↑/↓` não disparam — a árvore não muda. O único conflito real era o inverso do
  esperado: o Monaco **consumia** o `Ctrl+K` (prefixo de acorde) e a paleta não abria, enquanto o
  botão do rail anuncia "Buscar · Ctrl K". Um atalho anunciado que falha em silêncio conforme o
  foco é pior que os dois lados; o editor passou a devolver a tecla, sem conhecer a paleta)*

**Aceite da fase**
- ✅ §33 "Árvore" completo (§10 deste documento)
- ✅ Estado da árvore persiste entre sessões *(expandidos e nó corrente; nó excluído entre sessões cai no primeiro em vez de abrir vazio)*

---

### Fase 3 — Monaco e autosave

- ✅ Monaco como client component isolado, com dynamic import *(#45 — `ssr: false` **não é otimização**: `monaco-editor` toca `window` no topo do módulo e quebraria no SSR)*
- ✅ **Monaco servido localmente, nunca de CDN** *(o default do `@monaco-editor/react` é `jsdelivr`, e quebraria o §48 "roda com a internet desligada" — em silêncio)*
- ✅ Sem erro de hidratação *(o `loading` é o mesmo antes e depois; build e app rodando sem aviso)*
- ✅ **A tela da questão não lança erro não tratado** *(#183 — o Monaco tentava criar o worker a
  partir de uma URL que o Turbopack reescreve, e a página estourava um `TypeError` no
  carregamento. Nada visível quebrava — o editor abria e aceitava texto —, e era o que tornava o
  defeito ruim: quem abre o console vê vermelho na tela principal e não sabe se o produto está de
  pé. **Doze testes de E2E passavam por cima**, porque nenhum olhava o console. Agora há um que
  olha, conferido contra a violação proposital: sem a correção ele acusa 6 erros)*
- ✅ **Sem sugestão de palavra do próprio documento** *(#183 — o Monaco propõe as palavras do texto
  aberto, e num enunciado de prova isso é ruído: ele sugere "montante" enquanto alguém escreve
  "montante". A lista útil deste produto são os 652 autocompletes do acervo. Estava desligado por
  acidente — a sugestão é calculada no worker, e o worker não carregava; consertá-lo acordaria o
  comportamento sem ninguém ter decidido por ele)*
- ✅ Estado de loading enquanto carrega *(não colapsa o painel — senão o layout pularia)*
- ✅ Redimensiona junto com o painel *(`automaticLayout`)*
- ✅ Tema claro e escuro seguindo o tema do app
- ✅ Language configuration LaTeX: brackets, comments, tokens, auto-close *(dado puro no domínio, afirmado por 14 testes)*
- ✅ Syntax highlighting *(Monarch; ordem das regras testada — comentário antes de tudo, `$$` antes de `$`)*
- ✅ Line numbers
- ✅ Bracket matching
- ✅ Word wrap *(enunciado é prosa, não código)*
- ✅ Minimap desligado por padrão
- ✅ Model de editor por campo
- ✅ Abas internas: Conteúdo, Resposta, Complemento e **Metadados** *(#87)* · **Origem** *(#137 — estava bloqueada pela Fase 14)*
- ✅ Autosave com debounce *(1,2 s; timer limpo na desmontagem)*
- ✅ `Ctrl+S` salva imediatamente *(handler por ref — senão congelaria a questão aberta na montagem)*
- ✅ Dirty state visível *(não salvo · salvando · salvo · conflito · erro)*
- ✅ **Conflito pausa o autosave** *(sem isso ele voltaria em 1,2 s e insistiria até vencer)*
- ✅ Concorrência otimista por `updatedAt` *(#43 — `updateMany` com a versão **na cláusula**, não checagem em código: é o que fecha a janela entre ler e gravar)*
- ✅ Conflito detectado e apresentado *(409 com os dois lados — esperado × encontrado)*
- ✅ **Conflito nunca sobrescreve em silêncio, com teste** *(spec §42; duas edições concorrentes, a segunda recusada, nada gravado)*
- ✅ Autosave sem alteração não grava *(dez disparos não movem o `updatedAt` — senão fabricaria conflito nas outras abas)*

**Aceite da fase**
- ✅ Editar, sair e voltar encontra o conteúdo salvo *(#155 — agora **digitado na tela**: o E2E escreve no Monaco, espera o autosave, recarrega a página, reabre a questão e encontra o texto)*
- ✅ Teste de conflito passa

---

### Fase 4 — Conhecimento LaTeX do legado

**Importador** *(#47)*
- ✅ Leitura de `LatexMetadata.db` estritamente read-only *(`immutable=1` + `SQLITE_OPEN_URI`: escrita recusada pelo motor **e** nenhum `-shm`/`-wal` criado ao lado do original — só `READONLY` deixava dois arquivos novos dentro do acervo)*
- ✅ Import idempotente *(rodado duas vezes contra o banco real; o retrato das 3.420 linhas é idêntico)*
- ✅ Relatório com contagens *(`origem = gravados + duplicatas + descartados`, com asserção de fechamento)*
- ✅ 653 autocompletes lidos → **652 gravados** *(1 duplicata: `\addtocontents` está duas vezes no legado, uma com descrição e outra sem)*
- ✅ 2.741 símbolos lidos → **2.740 gravados** *(1 duplicata: `\neq` repetido no grupo `math`)*
- ✅ 13 grupos de símbolos importados
- ✅ 29 menus de ícones lidos → **28 gravados** *(`Asteristic`, id 8, tem o template nulo no legado — botão que não insere nada)*
- ✅ Categorias preservadas *(13 grupos de símbolos; grupo e subgrupo dos ícones vêm por join)*
- ✅ Delimitador legado `§` convertido em placeholders nativos do Monaco *(também nos templates dos ícones; `$`, `\` e `}` escapados — sem isso `$ log_{b} a $`, que existe no acervo, abriria uma tabulação fantasma)*
- ✅ **Nenhum binário no banco** *(o `PNGSimbol` — 1,1 MB de BLOB — fica fora; a miniatura é o SVG, que é markup)*

**Editor** *(#49 — autocomplete)*
- ✅ Completion provider com trigger `\` *(o intervalo substituído **inclui a barra**: a definição de "palavra" do Monaco não a inclui, e sem isso aceitar `\alp` gravaria `\\alpha`)*
- ✅ `Ctrl+Space` dispara completion *(sem barra digitada, vale o intervalo da palavra e a barra do item entra junto)*
- ✅ Prioridade e documentação nos itens *(`sortText` com `padStart` — sem ele, `"9"` viria depois de `"10"` e a prioridade se inverteria)*
- ✅ Snippets com navegação por tab *(348 dos 652 têm ponto de parada)*
- ✅ Seleção incorporada ao snippet quando aplicável *(`${1:${TM_SELECTED_TEXT:padrão}}` — sem seleção cai no padrão original)*
- ✅ Palette de símbolos agrupada *(#51 — 13 grupos; índice de 291 KB numa carga, miniaturas por grupo sob demanda porque `fontawesome5` sozinho pesa 1,26 MB)*
- ✅ Busca na palette *(por comando, Unicode e pacote; sem acento e sem exigir a barra; buscando, o resultado **atravessa** os grupos)*
- ✅ Inserção no cursor *(via `snippetController2`, que é quem resolve `${1:…}` e `$TM_SELECTED_TEXT`)*
- ✅ **Miniaturas convertidas de SVG font para `<path>` na importação** *(#51 — as 2.596 do legado usam `<font>`/`<glyph>`, removido de Chrome, Firefox e Safari: renderizavam **em branco, sem erro**. Convertidas, e 47% menores. Conferido de olho: α β Σ ∫ ← ⇒ ∞ > ± ≤ saem corretos)*
- ✅ Miniatura desenhada como **máscara CSS** *(sem `dangerouslySetInnerHTML` — máscara não executa script; e diferente de `<img>`, segue `currentColor` e portanto o tema)*
- ✅ Corte de renderização **contado na tela** *("mostrando 400 de 1.566"; lista truncada em silêncio faz parecer que o símbolo não existe)*

**Aceite da fase**
- ✅ Contagens do relatório conferem com as do levantamento *(653 · 13 · 2.741 · 29 — as quatro fecham, com a diferença explicada linha a linha)*
- ✅ Autocomplete e snippets funcionam com o acervo legado real *(652 itens servidos e ordenados; 2.740 símbolos na palette, verificados contra o banco real)*

---

### Fase 5 — Fast Preview

**Modelo** *(#53 — `QuestionAggregate → PreviewModel`, spec §11)*
- ✅ `PreviewModel` derivado do `QuestionAggregate` *(entrada declarada no próprio módulo: o preview precisa de quatro textos e uma lista, e amarrá-lo ao agregado inteiro faria toda mudança no schema bater aqui)*
- ✅ Enunciado
- ✅ Alternativas *(letra **derivada da posição** — D9; no legado ela vivia na linha e reordenar deixava o gabarito apontando para a letra errada)*
- ✅ Resposta *(e complemento)*
- ✅ Parágrafos e marcadores *(linha em branco separa, quebra simples não; `itemize`, `enumerate` e `description`, com aninhamento)*
- ✅ Matemática inline *(`$…$` e `\(…\)`)*
- ✅ Matemática display *(`$$…$$`, `\[…\]`, `equation`, `align`, `gather`, `multline`, com e sem asterisco)*
- ✅ Imagens *(`\includegraphics`; largura relativa vira fração, absoluta vira `null` — o preview não sabe a largura da página)*
- ✅ Caixas simples *(`tcolorbox`, `framed`, `mdframed`, `quote`)*
- ✅ **Degradação declarada: comando desconhecido some, argumento fica** *(`\xlop{1234}` vira `1234`; travar na primeira macro do acervo seria pior que aproximar)*
- ✅ `\%` não é comentário *(o acervo é de matemática — metade das questões de porcentagem sumiria)*
- ✅ `~` vira espaço **inquebrável**, não espaço comum

**Tela** *(#55)*
- ✅ MathJax integrado, **do pacote local** *(nunca CDN — mesma exigência da §48 que valeu para o Monaco; `liteAdaptor` dispensa DOM, e por isso a conversão roda igual no navegador, no Node e no teste)*
- ✅ **Nenhum HTML gerado, logo nada a sanitizar** *(a fórmula entra como **máscara CSS**: um SVG usado como imagem não executa script. É estritamente mais forte que sanitizar — sanitizer é uma lista do que se conhece hoje; não interpretar é uma propriedade. Sem `dangerouslySetInnerHTML` em nenhum arquivo do preview)*
- ✅ Superfície de injeção fechada na origem *(o pacote `html` do MathJax — que dá `\href`, `\class` e `\style` — fica **fora** da lista de pacotes: a marcação perigosa não chega a ser gerada)*
- ✅ Debounce *(`useDeferredValue` em vez de `setTimeout`: o React mede em vez de adivinhar uma latência fixa. O debounce configurável continua sendo o do autosave, que é quem fala com o servidor)*
- ✅ Aviso visível: "Preview rápido — pode diferir do PDF final" *(permanente no cabeçalho do painel)*
- ✅ Fórmula segue o tema e a linha de base *(medidas em `ex`; `currentColor` sob a máscara)*

**Aceite da fase**
- ✅ Latência entre editar e ver o preview parece imediata *(cache por fórmula: editar um enunciado só reconverte a fórmula que mudou)*
- ✅ Preview nunca congela a UI *(o conteúdo anterior fica na tela, esmaecido, com selo "atualizando…" e `aria-live`)*
- [ ] Conferência visual na tela *(fica com o Chico, junto com o aceite da Fase 1)*

---

### Fase 6 — Worker de render autoritativo *(D27, D35)*

**Contratos** *(D35 · #57 — `packages/render-contract`)*
- ✅ `RenderBundle` definido *(`jobId`, `sourceLatex`, `profile`, `assets`, `options`; o perfil vai **resolvido**, com preâmbulo dentro — catálogo no worker seria estado, e estado faz duas réplicas divergirem)*
- ✅ `RenderResult` definido *(`success`, `pdf`, `png`, `diagnostics`, `stdout`, `stderr`, `durationMs`, `rendererVersion`)*
- ✅ `pdf`/`png` são **descritores**, não bytes *(o status é consultado em laço e o download é um só; `sha256` no descritor deixa a app pular o download do que já está no storage)*
- ✅ **Transporte decidido: `multipart/form-data`** *(JSON com base64 custaria 33% e encheria o log de megabytes ilegíveis; tar/zip trocaria um formato que todo servidor lê por biblioteca dos dois lados **e** por descompactação de entrada de terceiro, que é superfície de ataque conhecida)*
- ✅ Validação no contrato, não dentro do worker *(a app valida antes de enviar e o worker ao receber, com o **mesmo** código — duas checagens escritas separadamente divergem justamente no caso esquisito)*
- ✅ Nome de asset por **lista do que pode**, não do que não pode *(`../x`, `/etc/passwd`, `a/b` e as tentativas ainda não pensadas falham juntas)*
- ✅ `\write18` recusado no contrato *(a defesa de verdade é rodar sem `-shell-escape`; esta é a segunda camada, porque a primeira é uma flag que alguém pode acrescentar "para testar")*
- ✅ Renderer recebe **apenas** `RenderBundle` *(auditado na #145: a rota `POST /render` lê `bundle` e os assets **declarados nele** — mais nada do multipart chega ao compilador)*
- ✅ Renderer retorna **apenas** `RenderResult` *(o status do job; não há outra forma de saída)*

**Isolamento do renderer** *(D35 — o ajuste que resolve a contradição do egress)*
- ✅ **O contrato não importa nada** *(#57 — zero dependências, com teste; é o que impede o worker de alcançar o domínio por caminho transitivo)*
- ✅ O contrato não menciona `StorageProvider`, `storageKey`, Prisma, S3, Vercel Blob nem `Workspace` *(teste de fronteira sobre o código, ignorando comentários)*
- ✅ `jobId` é a **única** identidade *(nada de `questionId` ou `publicationId` — se o worker soubesse o que compila, "não conhece o domínio" viraria frase em vez de propriedade)*
- ✅ Renderer **não** acessa o banco *(auditado na #145: zero ocorrências de Prisma, `DATABASE_URL`, storage ou IA em `services/renderer/src`, e a **única** dependência do `package.json` é `@latexbookbank/render-contract`)*
- ✅ Worker funciona **sem credencial de storage** *(conferido no contêiner rodando: `env` só tem `RENDERER_SECRET`)*
- ✅ Worker funciona **sem credencial de banco** *(idem)*
- ✅ Worker funciona **sem API key de IA** *(idem)*
- ✅ Worker **sem rede de saída** *(a rede `render-internal` tem `Internal: true` — o Docker garante, não é configuração que alguém precisa lembrar de manter)*
- ✅ **A aplicação é quem persiste os artefatos** via `StorageProvider` *(`execute-render.ts` chama `deps.storage.put`; o worker devolve bytes e nada mais)*

**Worker containerizado**
- ✅ `services/renderer` criado
- ✅ Dockerfile com Bun + TeX Live + Poppler *(#63 — 1,32 GB; a lista de pacotes saiu de `kpsewhich` contra os `.sty` que o acervo usa, não de tutorial)*
- ✅ **Imagem compila `tikz`, `pgfplots`, `siunitx`, `xlop` e `cancel`** *(verificado **dentro do contêiner** e conferido de olho: o `x` riscado, `9,8 m s⁻²`, a conta armada 12×34=408, a reta e a parábola)*
- ✅ `bun install` **dentro** da imagem *(a primeira versão não instalava nada e funcionava — porque o `node_modules` do host tinha entrado no contexto, levando `vitest` e `typescript` para dentro da imagem de produção. Funcionava por acidente)*
- ✅ `docker compose` expõe o worker em `28900` *(só em `127.0.0.1`: em desenvolvimento o worker não deveria estar visível na rede local)*
- ✅ Porta confirmada livre antes de subir
- ✅ `POST /render` *(#61 — `multipart/form-data`; compila dentro da requisição, porque um render de questão leva 1–3 s e uma fila traria estado, expiração e um segundo caminho de erro para economizar uma espera que a aplicação já trata como assíncrona)*
- ✅ `GET /render/:id` e `DELETE /render/:id`
- ✅ `GET /render/:id/artifacts/:name` devolve os bytes *(autenticado; o `%PDF` é conferido no teste)*
- ✅ `GET /health` retorna `status`, `rendererVersion`, `pdfLatexVersion`, `pdfToCairoVersion`, `profileCount` *(fora da autenticação de propósito — quem consulta é o orquestrador, que não tem o segredo; `profileCount` é **zero**, que é a resposta honesta: o perfil vem resolvido no bundle, o worker não tem catálogo)*
- ✅ Autenticação por segredo compartilhado, **comparação em tempo constante** *(a diferença entre errar no primeiro e no último byte é medível pela rede, e o worker responde rápido justamente porque não faz mais nada antes de comparar)*
- ✅ **O worker recusa subir sem segredo** *(gerar um aleatório faria ele subir, "funcionar", e ninguém descobriria que está aberto até alguém varrer a porta)*
- ✅ Segredo nunca no repositório *(vem de `RENDERER_SECRET`)*
- ✅ Jobs só em memória *(sem banco não há credencial de banco; render é reconstruível — D29/§41 — e job concluído expira em 10 min, senão os artefatos viram vazamento com nome de cache)*
- ✅ Render pendente cancelado antes de começar *(quem cancela muda o estado; `start` é quem decide não gastar um `pdflatex`)*
- ✅ Nenhum framework HTTP *(o `Bun.serve` já lê multipart; quatro rotas à mão são menos código que a configuração de qualquer biblioteca, e uma dependência a menos para auditar numa imagem que compila entrada de terceiro)*
- ✅ **Sem rede de saída — verificado, não prometido** *(`fetch` de dentro do renderer falha; `/health` pelo ingresso responde 200)*
- ✅ Topologia decidida por experimento *(o Docker não tem "publique a porta e bloqueie a saída": rede `internal: true` bloqueia **as duas** — com o renderer sozinho nela o `curl` do host devolve `000` —, e contêiner em duas redes ganha rota padrão pela que tem gateway. Daí separar ingresso de execução: o `socat` fica nas duas redes, o renderer só na interna)*
- ✅ Limite de CPU *(2 núcleos)*
- ✅ Limite de memória *(1 GB)*
- ✅ Timeout por job *(no contrato e no `execFile`)*
- ✅ Filesystem efêmero *(`read_only` + `tmpfs`; `/app` recusa escrita, `/tmp` é o único gravável)*
- ✅ Usuário sem privilégio, `cap_drop: ALL`, `no-new-privileges`
- ✅ **A imagem é a mesma que irá para o droplet** — sem variante "de desenvolvimento"
- ⛔ **Divergência de TeX Live entre teste e produção** — *a imagem é `bookworm` e traz TeX Live 2022; a máquina de desenvolvimento tem 2023, e é contra ela que os testes de compilação rodam. Um pacote presente em 2023 e ausente em 2022 passaria no teste e falharia no droplet. Fechar isso pede rodar a suíte **dentro do contêiner** no CI.*

**Compilação** *(#59 — exercitada contra o `pdflatex` real, sem dublê)*
- ✅ `pdflatex` via `execFile` com **vetor de argumentos** — nunca string de shell *(sem shell no caminho não há o que escapar; o acervo legado tem nome de arquivo com espaço, acento e parêntese)*
- ✅ Diretório temporário por job, apagado no `finally` *(é o que faz `\include` só enxergar o que veio no bundle, e o que impede um job de ler o que outro deixou)*
- ✅ `shell-escape` bloqueado em duas camadas *(`-no-shell-escape` explícito — "por padrão" depende do `texmf.cnf` da distribuição — e `\write18` recusado antes de tocar o disco)*
- ✅ stdout, stderr e código de saída capturados *(saída ≠ 0 do `pdflatex` é resultado normal, não exceção; falha de verdade é o binário não existir, e essa lança)*
- ✅ Ambiente podado *(o worker não repassa o que recebeu; `TEXMFVAR` vai para o diretório do job, senão dois jobs disputam o mesmo cache de fonte)*
- ✅ Timeout mata o processo e vira diagnóstico
- ✅ `pdftocairo` gera PNG, uma por página *(a contagem vem do diretório, não de supor uma página — lista de exercícios tem várias)*
- ✅ DPI configurável, com teste que compara o tamanho da imagem
- ✅ Dimensões do PNG lidas do `IHDR` *(dois números não justificam uma biblioteca de imagem dentro do worker; cada dependência a menos é uma a menos para auditar)*
- ✅ Asset conferido por `sha256` antes de gravar *(manifesto que não bate com o conteúdo é erro: ou o transporte corrompeu, ou trocaram o arquivo)*
- ✅ **Log do LaTeX traduzido em `RenderDiagnostic[]`** *(erro vira linha + mensagem; `Overfull \hbox` entra como `info`, senão o painel ficaria amarelo até ninguém olhar; o caminho do diretório temporário **não** vaza)*
- ✅ Tradução não inventa *(linha que não casa fica só no log cru, que vai inteiro para a aba)*
- ✅ **PDF conferido de olho** *(questão com negrito, display math, fração e lista numerada — acentos e tipografia corretos)*

**Profiles** *(#69)*
- ✅ `LatexProfile` com documentclass, packages, macros e engine *(**resolvido**: leva o preâmbulo consigo. Catálogo no worker seria estado, e estado faz duas réplicas divergirem)*
- ✅ Profile **Legacy Compatibility** a partir do `latex-includes.tex` real *(34 packages, na ordem original — `fontenc` antes de `inputenc`, `xcolor` antes de quem o usa; reordenar por gosto só aparece três questões depois)*
- ✅ As três macros do legado *(`\tikzmark`, `\colorcancel`, `\ontop`; sem elas, as questões de álgebra param de compilar)*
- ✅ Profile **Question Preview**, enxuto *(o legado carrega 34 packages; `abntex2cite` e `rotating` para desenhar três linhas custam segundos que a pessoa espera olhando. Recorta no conteúdo, senão uma questão de quatro linhas vira uma imagem 90% branca)*
- ✅ Teste confere o perfil contra o **arquivo legado real**, e se declara pulado onde ele não existe *(o CI não tem o acervo; um teste vermelho por isso viraria ruído até alguém desativá-lo)*
- ✅ **Os dois perfis compilam na imagem, conferidos de olho** *(integral, `\colorcancel` vermelho, `9,8 m s⁻²` e as letras vindas do `label`)*
- ✅ `LatexBuilder` monta o bundle a partir da questão *(letra da alternativa vem de `label=\alph*)`, nunca escrita no texto — D9)*
- ✅ Resposta **omitida por padrão** *(é o que se mostra ao aluno; incluir o gabarito por engano seria o pior defeito possível)*
- ⛔ **`iwona` fora da imagem** — *só existe em `texlive-fonts-extra`, 1,41 GB, que mais que dobraria a imagem por uma fonte decorativa. Sem ela o documento cai na Latin Modern, e **a matemática muda junto**, porque o legado carrega `iwona` com a opção `math`. Registrado dentro do perfil, onde quem comparar dois PDFs vai procurar.*
- ✅ `QuestionTypePlugin` alimentando o builder *(#165 — o `buildLatex` do plugin existia desde a
  Fase 7 e **nunca teve chamador**: acrescentar um tipo dava validação própria, preview próprio e um
  PDF igual ao da múltipla escolha. Agora o plugin devolve **blocos**, não texto, porque o mapa de
  linhas da #161 precisa vir da mesma montagem — se o plugin devolvesse string, o mapa teria de ser
  adivinhado por fora, e o clique no diagnóstico voltaria a apontar para a linha errada assim que um
  tipo montasse o documento de outro jeito. Conferido no worker: `Gabarito: c.` no corpo, linha que
  a montagem literal nunca emitiu)*
- ✅ Tipo **sem plugin** continua compilando *(#165 — o caminho literal virou `fallbackBlocks`, com o
  nome dizendo o que é: a Fase 11 vai importar tipos sem plugin, e recusá-los entregaria menos do
  que o produto já entrega)*
- ✅ Assets referenciados corretamente *(#173 — estava esperando a Fase 11 e não precisava: a Fase
  14 já dá upload e recorte, então a questão **já podia** ter figura. Só o que o corpo **cita**
  viaja: mandar todos os assets engordaria cada compilação com arquivos que o documento não usa, e
  o PDF de origem de um recorte tem megabytes. Conferido no worker real — questão com
  `\includegraphics` compilou, `main.pdf` de 31 264 bytes)*

**Lado da aplicação** *(#65)*
- ✅ **Port reconciliado com o contrato** *(o `render-executor.ts` da Fase 0 declarava `RenderBundle`/`RenderResult` por conta própria, antes de o D35 existir — e as duas definições já divergiam: perfil era nome aqui e objeto lá, asset trazia bytes aqui e metadados lá. Duas definições da mesma coisa não empatam: uma fica errada e ninguém descobre qual até a integração falhar)*
- ✅ `RenderExecutor` implementado como `RenderWorkerExecutor`
- ✅ `baseURL` configurável por ambiente — única diferença entre local e droplet *(nenhum `if (produção)` no arquivo)*
- ✅ Executor **sem estado** *(a primeira versão guardava os bytes dos assets numa propriedade, e dois renders concorrentes teriam sobrescrito os assets um do outro)*
- ✅ Valida o bundle **antes** de subir os assets pela rede, com o mesmo código do worker
- ✅ Recusa artefato truncado *(gravar isso no storage criaria arquivo corrompido com hash correto no banco — o pior tipo de dado ruim, porque parece íntegro)*
- ✅ Worker indisponível degrada com mensagem clara *(`RendererUnavailableError` diz "o texto continua salvo"; erro genérico seria indistinguível de LaTeX quebrado e mandaria a pessoa procurar defeito no texto dela)*
- ✅ Content hash cobre conteúdo, profile, preamble, classe, assets, engine, DPI, passadas e **versão do renderer**
- ✅ O hash **não** cobre `jobId` nem timeout *(um é identidade de execução, o outro muda quanto esperamos e não o que sai)*
- ✅ Aplicação grava `pdf` e `png` via `StorageProvider` *(#67 — **storage antes do banco**: inverter criaria linha apontando para chave inexistente, e uma linha assim é pior que nenhuma, porque a interface acha que tem PDF e o download falha)*
- ✅ O registro guarda o `sha256` **do storage**, não o do worker *(descreve o que foi gravado, não o que se esperava gravar)*
- ✅ `RenderJob` persistido *(job e artefatos numa transação só; artefato é `Asset` derivado com `renderJobId`, e apagar o job leva tudo por cascade — política de derivado da D29)*
- ✅ Cache hit devolve o artefato anterior e marca `cacheHit` *(sem a marca, um render instantâneo pareceria falha de atualização e a pessoa clicaria de novo)*
- ✅ **Falha também entra no cache** *(recompilar o mesmo LaTeX quebrado dá o mesmo erro; gastar `pdflatex` para reconfirmar é desperdício que a pessoa sente)*
- ✅ Invalidação por versão do renderer, com teste
- ✅ Isolamento por workspace no cache *(coincidência de conteúdo entre duas bibliotecas do mesmo dono é o caso comum, não o raro)*
- ✅ Log cru truncado **pelo meio** *(o começo tem a versão do TeX, o fim tem o erro fatal; cortar só o fim perderia a linha que explica a falha)*
- ✅ Ordem das páginas preservada *(comparação numérica: sem ela `page-10` viria antes de `page-2` e a leitura sairia embaralhada a partir da décima)*
- ✅ Nenhum módulo editorial chama a compilação diretamente *(o caminho é `POST /api/publications/:id/questions/:questionId/render`; o Route Handler só traduz HTTP)*
- ✅ API de criação e resultado *(#69 — 503 distingue **não configurado** de **fora do ar**: um se resolve editando `.env.local`, o outro subindo o contêiner)*
- ✅ Download por `jobId` + nome, nunca por `storageKey` *(a chave é opaca e do servidor; devolvê-la amarraria o browser a como o storage organiza os arquivos)*
- ✅ Artefato descartado responde 404 com a razão, não 500 *(derivado pode sumir — D29 — e isso é estado legítimo)*
- ✅ A fronteira de lint cobrou de novo, e com razão *(nada em `app/**` fala com o banco; as duas leituras foram para o módulo)*
- ✅ Render pendente é **cancelado no worker** quando ainda não iniciou *(#148)*
- ✅ Render **em execução** é interrompido de verdade *(#148 — o `AbortSignal` chega ao `execFile`; conferido dentro do contêiner: um `sleep 30` morreu em 739 ms. Antes, cancelar marcava o estado e o `pdflatex` seguia até o fim para produzir algo já recusado)*
- ✅ **Cancelado não ressuscita** *(#148 — `complete` sobrescrevia o estado, e o efeito era que cancelar um job em execução não fazia nada: a compilação terminava e o job voltava `done`. Quem cancelou receberia o resultado que acabou de recusar)*
- ✅ A imagem do renderer volta a compilar *(#148 — quebrada desde #132, em silêncio: o `Dockerfile` não copiava o `package.json` do serviço de backup, e `bun install --frozen-lockfile` recusa quando enxerga menos workspaces que o lockfile. O contêiner que já rodava continuou rodando, então ninguém percebeu)*
- ✅ **Guarda contra a mesma quebra** *(#151 — teste de milissegundos que confere que todo workspace do lockfile está no `Dockerfile`; conferido contra a regressão histórica, removendo a linha do backup)*
- ✅ **O CI constrói a imagem** *(#151 — só quando muda `services/renderer/`, o contrato ou o lockfile: ela leva TeX Live inteiro, e construí-la em todo PR gastaria minutos para reprovar o que não mudou. O filtro foi conferido contra os commits reais das #147 e #148)*
- ✅ Render intermediário é descartado *(auditado na #145: `createCoalescer` só entrega o resultado que não tem sucessor, e `use-render` o usa)*
- ✅ Estado final converge para o último pedido, com teste *("**o estado final é o do último pedido**" e "três pedidos durante uma execução geram **uma** reexecução")*
- ✅ Worker indisponível degrada com mensagem clara, sem perder edição *(503 vira `kind: "unavailable"`, separado de `error`: pintar de vermelho mandaria a pessoa procurar defeito no texto dela)*
- ✅ `RenderArtifact` pode ser descartado e reconstruído *(auditoria §41 · #153 — afirmado, não declarado: o teste descarta os jobs e recompila, e as **chaves de storage voltam iguais**. O fake de storage é endereçado por conteúdo como o de verdade; com o antigo, que numerava as chaves, a afirmação seria impossível de fazer)*
- ✅ `preview.png` nunca vira conteúdo canônico *(#153 — o classificador do legado o recusa, com controle positivo: `preview-da-questao.png` **entra**, senão um classificador que recusasse tudo passaria no teste)*
- ✅ Todo artefato de render tem tipo **derivado** *(#153 — e os dois conjuntos não se sobrepõem, senão a afirmação seria vazia)*

**Interface** *(#71 · auditada na #159)*

> A auditoria achou a mesma exigência escrita **duas vezes**: uma com a palavra da spec ("Aba
> Source", "Erro apresentado como diagnóstico") e outra com a do código ("Aba Fonte", "Diagnóstico
> com linha"). As primeiras estavam abertas, as segundas fechadas, e as duas descreviam o mesmo
> comportamento. Ficaram as fechadas; o que sobrou aberto abaixo é o que de fato falta.

- ✅ Copiar LaTeX final *(#161 — e o botão **diz** quando o navegador não dá acesso à área de
  transferência, que é o caso de quem abre o app por `http://` na rede local)*
- ✅ Abrir em tela cheia *(#161 — camada por cima do workbench, com `Esc`; a Fullscreen API do
  navegador depende de um gesto que ele pode recusar e some dentro de iframe)*
- ✅ Diagnósticos decorados no Monaco *(#161 — marcador e não decoração: traz a mensagem no hover e
  entra no `F8`. Só do campo aberto, e `info` fica de fora — sublinhar todo `Overfull \hbox`
  deixaria o editor rajado de amarelo até ninguém olhar)*
- ✅ Clique no log navega para a linha *(#161 — o rótulo diz o destino ("Ir para Complemento, linha
  3"), porque trocar de aba sem avisar é pior que não navegar. Sem mapa ou sem linha, o item
  continua na lista e **não** vira botão)*
- ✅ **A linha do diagnóstico passou a ser a linha do corpo** *(#161 — o contrato dizia "linha do
  `sourceLatex`" e entregava a linha do `main.tex`, que leva classe e preâmbulo na frente. Errava
  por 1 quando o formato pré-compilado funcionava e pelo preâmbulo inteiro quando não. Enquanto
  ninguém marcava nada na tela a diferença era invisível; decorar o editor a tornaria visível do
  pior jeito. Traduzido **no worker**, que é o único que sabe como montou o arquivo — conferido
  contra o contêiner real: `\naoexiste` na linha 2 do campo chega como linha 2)*
- ✅ **A aba Log tem log** *(#161 — o `stdout` era guardado no `RenderJob` desde a Fase 6 e a rota
  nunca o devolvia: a aba existia, renderizava e dizia "sem log para esta compilação" **em toda**
  compilação. Conferido no worker real: 4173 caracteres)*
- ✅ **A aba Fonte mostra o corpo de verdade** *(#161 — mostrava `draft.statementLatex` sob o
  cabeçalho "o corpo enviado ao worker", sem as alternativas, que estão no documento desde sempre)*
- ✅ Baixar artefato *("Baixar o PDF (N KB)")*
- ✅ Aba PDF *(`<object>` e não `<iframe>`: o fallback fica dentro do elemento e aparece sozinho onde o navegador não tem leitor)*
- ✅ Aba PNG *(sobre `--surface-paper`, token novo: o PNG do `pdftocairo` é transparente onde não há tinta, e sem fundo a página sumiria no tema escuro)*
- ✅ Aba Log
- ✅ Aba Fonte *(o corpo que foi realmente enviado — é o que responde "o que exatamente foi mandado?" quando o resultado surpreende)*
- ✅ `Ctrl+Enter` compila *(registrado **no editor**, não numa escuta de janela: atalho global roubaria o Enter de qualquer campo da tela)*
- ✅ Render mostra progresso *(texto, não roda girando: roda não diz se travou)*
- ✅ Diagnóstico com linha, não stack trace *(erros e avisos na lista; `Overfull \hbox` fica num contador, senão a lista vira ruído — que é o mesmo que não ter lista)*
- ✅ Worker indisponível degrada com aviso, **não** com erro *(pintar de vermelho mandaria a pessoa procurar defeito no texto dela)*
- ✅ `cacheHit` visível
- ✅ Compilação concorrente **coalescida** *(#75 — a primeira versão apenas **ignorava** o pedido concorrente, o que descarta o intermediário mas também o **último**: a pessoa editava, pedia de novo e ficava olhando o PDF anterior concluindo que o produto não atualizou)*
- ✅ Render intermediário descartado *(o resultado obsoleto **não é entregue** — não há filtro depois a esquecer)*
- ✅ **Estado final converge para o último pedido, com teste**
- ✅ Três pedidos durante uma execução geram **uma** reexecução, não três *(todos pedem a mesma coisa: "compile o estado atual")*
- ✅ Trocar de questão cria um coalescer novo *(com um `useRef`, um pedido pendente da questão anterior compilaria depois da troca e sobrescreveria a tela com o PDF errado)*

**Preâmbulo pré-compilado** *(#73)*
- ✅ Formato `mylatexformat` por hash de preâmbulo, construído sob demanda e cacheado em `/tmp`
- ✅ **Ganho medido, com o PDF conferido em cada execução** *(`pdflatex` sozinho, dentro da imagem: **1886 ms → 508 ms**, mediana de 5; construir o formato custa 2313 ms, uma vez. Ponta a ponta pelo worker, em contêiner novo: primeira compilação 3474 ms, seguintes 606–1010 ms)*
- ✅ Falha do formato cai para a compilação normal *(otimização que quebra o produto quando não funciona é só uma segunda forma de falhar)*
- ✅ ⚠️ **Bug do contêiner corrigido no caminho**: o tmpfs de `/home/renderer` montava root-owned e o usuário do worker **não escrevia no próprio HOME**. Não quebrava a compilação porque o `compile.ts` aponta `HOME` para o diretório do job — era um piso falso.
- ⛔ **Três medições anteriores foram inválidas e descartadas** — *cronometraram compilações que falharam. A causa final foi o `echo` do `dash` interpretando `\b`, transformando `\begin{document}` em backspace + "egin". O critério passou a ser: medição só conta com o PDF conferido no mesmo script.*
**Otimização** *(auditoria §21 — medir, não assumir)*
- ✅ Tempo base medido e registrado *(#73 — 1886 ms; auditado na #159, que achou este item aberto
  duas linhas abaixo da medição que ele pedia)*
- ✅ Ganho registrado com número antes × depois *(1886 ms → 508 ms, mediana de 5)*
- [ ] Preâmbulo pré-compilado **embutido na imagem** — *e provavelmente **não deve** ser.*
  *Embutir exige a imagem conhecer os perfis, e a D35 tira o catálogo do worker de propósito: o
  perfil vem resolvido no bundle, e `/health` responde `profileCount: 0` porque essa é a resposta
  honesta. A alternativa — um volume gravável para o cache de formatos — abriria um furo em
  "filesystem efêmero" num contêiner que compila LaTeX de terceiro. O ganho seria 2313 ms **uma
  vez por contêiner**. Fica aberto como decisão registrada, não como esquecimento; o planejamento
  pede o preâmbulo pré-compilado com ganho medido, e isso já está feito*

**Aceite da fase**
- ✅ `docker compose up` sobe o worker e a app conversa com ele *(exercitado a sessão inteira; a
  imagem voltou a construir na #148 e o CI passou a construí-la na #151)*
- ✅ Cache hit demonstrado com medição *(#159 — pela rota real: compilação 1159 ms, cache 46 ms.
  E o log distingue os dois, que é o que permite responder "quanto disso é cache?")*
- ✅ **O worker roda sem nenhuma credencial e sem rede de saída** *(#145 — conferido no contêiner:
  `env` só tem `RENDERER_SECRET`, e a rede tem `Internal: true`)*
- ✅ Render autoritativo nunca trava a edição *(#159 — afirmado no E2E: a rota de render fica
  pendurada 8 s de propósito, e a pessoa digita, o autosave dispara e grava enquanto isso. Num
  teste de unidade essa afirmação não cabe — lá não existe editor para travar)*

---

### Fase 6.5 — Cloud Compatibility Spike *(D30)*

> Objetivo único: provar que **banco e storage** trocam de implementação sem reescrever domínio e
> use cases. **Render está fora do escopo** — já foi provado na Fase 6. Terminada a fase,
> **voltar ao desenvolvimento local**.

**Ambiente experimental (efêmero)** *(#77)*
- ⛔ Neon PostgreSQL provisionado — *exige conta; o spike usou PostgreSQL 16.14 em Docker, mesmo motor e mesma família de colação, outro provedor*
- ⛔ Vercel Blob provisionado — *exige credencial **e** a decisão sobre o destino dos assets na nuvem (Vercel Blob × DO Spaces), **adiada formalmente em 2026-09-02** até existir necessidade cloud real — ver §0 Pré-requisitos*
- ✅ PostgreSQL em Docker `28432`
- ✅ Ambiente principal permaneceu local e intocado
- ✅ Tudo derrubado ao fim, mantendo só o relatório

**Os dois pares**
- ◐ `SQLite ↕ PostgreSQL` — *schema traduzido e o D38 provado na tabela real; falta a suíte de integração (ver bloqueio do `db push` abaixo)*
- ⛔ `LocalFileStorage ↕ Vercel Blob` — *bloqueado pela decisão e pela credencial; a decisão foi **adiada formalmente em 2026-09-02** (ver §0 Pré-requisitos), então este par espera a necessidade cloud, não o Chico*

**O achado da fase** *(#77)*
- ✅ **D38 provado empiricamente, na tabela `document_nodes` real** *(`ANTES: a0 a1 a2 a3 a4 Zv Zw Zx Zy ZyG ZyV Zz` — invertido; `DEPOIS: Zv Zw … a0 a1 …` — igual ao SQLite, com a **mesma consulta**, mudando só a colação da coluna)*
- ✅ ⚠️ **A primeira medição rodou em Alpine e não acusou nada** *(musl não implementa colação por locale: `en_US.utf8` lá ordena por bytes. Validar contra a imagem Alpine teria dado tudo verde e o defeito apareceria só no Neon, que é glibc. **Todo teste de compatibilidade PostgreSQL deste projeto precisa rodar em imagem glibc.**)*
- ✅ Schema PostgreSQL **derivado**, não mantido à mão *(dois schemas divergem sempre, e no campo que ninguém olha; a derivação **falha** se um `sortKey` sumir)*
- ✅ Tradução coube em **3 ajustes**, e o DDL gerou as 16 tabelas sem erro
- ✅ `prisma/postgres-collation.sql` — *o Prisma não tem atributo de colação; num arquivo, e não num comentário, porque comentário não roda*
- ⛔ `prisma db push` contra o banco do spike — *o CLI do Prisma 7 classifica como destrutivo e exige consentimento explícito; a sessão rodava sem supervisão e a operação foi abortada. O DDL veio de `migrate diff` (não destrutivo) e foi aplicado por `psql` — prova a tradução do schema, **não** o caminho `prisma migrate` ponta a ponta.*

**Amostra mínima** *(auditoria §30)*
- [ ] 1 workspace · 1 publication · 1 chapter · 1 section
- [ ] 10 questions com alternatives e tags
- [ ] 1 PDF original · 3–5 assets · 1 crop · 1 SourceAnchor
- [ ] `render.pdf` e `render.png` **pré-gerados na Fase 6**, usados só como carga de teste
- [ ] **Nenhuma compilação acontece nesta fase**

**Entidades que devem continuar funcionando sem mudança de domínio** *(§31)*
- [ ] `Question`
- [ ] `Publication`
- [ ] `DocumentNode`
- [ ] `QuestionOption`
- [ ] `Asset`
- [ ] `SourceAnchor`
- [ ] `Revision`

**Testes obrigatórios** *(auditoria §31)*
- [ ] Criação de publicação
- [ ] Árvore
- [ ] Tags
- [ ] Save
- [ ] Optimistic concurrency
- [ ] Upload
- [ ] `StorageProvider` — upload, leitura, persistência, referência de `Asset`
- [ ] Download
- [ ] Crop
- [ ] Hashes
- [ ] Relations
- [ ] Timestamps
- [ ] UUIDs
- [ ] **Suíte de integração roda contra SQLite**
- [ ] **Suíte de integração roda contra PostgreSQL**

**Entregável: [`Cloud Compatibility Report`](./cloud-compatibility-report.md)** — ◐ *parcial, escrito e commitado* *(auditoria §32)*
- [ ] Diferenças SQLite/PostgreSQL
- [ ] Problemas de migrations
- [ ] Problemas do Prisma
- [ ] Diferenças de constraints
- [ ] Diferenças de índices
- [ ] Problemas de storage
- [ ] Problemas de paths
- [ ] Problemas de uploads
- [ ] Problemas de assets
- [ ] Mudanças necessárias — ou "nenhum problema encontrado"

**Aceite da fase**
- [ ] Relatório escrito e commitado
- [ ] Suíte verde nos dois motores, ou lista explícita do que falhou e por quê
- [ ] Nenhuma reescrita de domínio foi necessária — ou a fronteira violada está identificada
- [ ] **Desenvolvimento voltou ao modo local**
- [ ] O spike não consumiu semanas *(guarda-corpo de D30)*

---

## Wave B — banco de questões

### Fase 7 — Tipos, alternativas e metadados

**Registry** *(#79)*
- ✅ `QuestionTypePlugin` com `validate`, `buildLatex`, `buildFastPreview` e `randomize` opcional
- ✅ Plugin Discursiva *(**sem** `randomize` — não há o que embaralhar, e a ausência é legível; método vazio herdado seria pior, porque alguém teria de lembrar de não chamá-lo)*
- ✅ Plugin Múltipla Escolha com quantidade **arbitrária** de alternativas *(o legado fixava cinco; o acervo tem verdadeiro/falso com duas e concurso com seis)*
- ✅ **Nenhum `switch` global sobre tipo de questão — com guard varrendo `src/` e `app/`** *(sem o guard, a regra é recomendação, e recomendação some na terceira pressa; um `switch` esquecido não dá erro de compilação, dá comportamento errado numa tela só)*
- ✅ Registro explícito, sem descoberta por convenção *(ler `plugins/index.ts` responde "quais tipos o produto trata hoje" sem rodar nada)*
- ✅ Tipo sem plugin devolve `null`, não exceção *(acervo importado pode ter tipo ainda não suportado, e a interface precisa mostrar isso em vez de quebrar a página)*
- ✅ **Duplicação da regra da letra reconciliada** *(`optionLabelAt` já existia no domínio de questões; eu tinha escrito uma segunda cópia no preview e quase uma terceira no plugin. Agora há uma, com teste de identidade de referência)*

**Alternativas**
- ✅ `QuestionOption` com UUID *(`@default(uuid())` desde a Fase 0; auditado contra o schema)*
- ✅ `sortKey` fracionário *(coluna no schema, e é ela que a reordenação grava)*
- ✅ `isCorrect` por alternativa *(fonte da verdade do gabarito; `Questao.Correta` do legado é vestigial)*
- ✅ Letra A/B/C calculada apenas na projeção *(no LaTeX ela sai de `label=\alph*)` e do índice, nunca gravada)*
- ✅ Nenhum vínculo de gabarito por letra
- ✅ **Teste: o gabarito sobrevive à reordenação** *(vinte embaralhamentos com sementes diferentes; a correta continua sendo a mesma alternativa — é exatamente o que o legado não passava, porque `Marcacao` vivia na linha)*
- ✅ `legacyMarcacao` guardado apenas para auditoria *(coluna existe, e nada a lê para renderizar)*
- ✅ Adicionar e remover alternativa *(#81 — nova nunca nasce marcada como correta: alternativa em branco com gabarito passa despercebida até alguém imprimir a prova)*
- ✅ Remover a **única** correta é permitido *(quem reescreve precisa tirar antes de pôr; recusar aqui viraria dança de ordem obrigatória — quem acusa é a validação)*
- ✅ Reordenar por fractional index *(grava **só** a alternativa movida; é para isso que o fractional index existe)*
- ✅ Marcar correta, com exclusividade **por tabela de tipo**, não por `switch` *(acrescentar um tipo é acrescentar uma linha, e há teste exigindo que a tabela cubra todo o vocabulário)*
- ✅ Clicar de novo na correta **não chama o banco** *(comportamento de rádio; desmarcar deixaria a questão sem gabarito, e uma transação para não mudar nada é só custo)*
- ✅ Embaralhar visualização **sem tocar no banco** *(o legado embaralhava gravando, e era isso que fazia o gabarito seguir a letra em vez da alternativa)*
- ✅ **Teste: o gabarito sobrevive a uma sessão de edição inteira** — mover, acrescentar, remover e marcar *(a spec cita o embaralhamento; o dia a dia é isto)*
- ✅ Interface de arrastar as alternativas *(#83 — `draggable` nativo, não `@dnd-kit`: a árvore precisa de aninhamento, zonas e teclado; aqui são cinco linhas numa coluna, e a biblioteca seria peso por um caso que o nativo resolve)*
- ✅ **A aba Alternativas está montada no editor** *(#139 — o componente e as rotas existiam desde a Fase 7 e nada ligava os dois. Cada mutação relê do servidor: marcar uma correta desmarca a outra **no banco**, e reproduzir essa regra no cliente seria tê-la em dois lugares)*
- ✅ Subir/descer por botão *(para quem não usa mouse — e mais preciso que o arrasto para mover uma casa, que é o movimento mais comum)*
- ✅ Marcar correta com `role="radio"` e `aria-checked` *(em múltipla escolha marcar uma desmarca a outra, e é o leitor de tela que precisa saber disso, não só a cor da borda)*
- ✅ Embaralhado, a tela **diz que nada foi gravado** *(sem o selo, a pessoa sai achando que gravou a nova ordem)*
- ✅ Embaralhado, editar e reordenar ficam bloqueados *(mover "para a terceira posição" da lista embaralhada gravaria uma ordem que ninguém viu como definitiva)*
- ✅ API de criar, remover, mover, marcar e editar texto *(`deleteMany`/`updateMany` com os **dois** ids: `delete` por id sozinho apagaria alternativa de outra questão se alguém montasse a requisição à mão)*
- ✅ Patches numa transação *(meio patch aplicado deixaria **duas** corretas — o estado que a validação chama de erro)*
- ✅ **Teste: o gabarito sobrevive à reordenação das alternativas** *(#79)*

**Metadados e tags** *(#87)*
- ✅ Dificuldade na escala legada (0, 2, 5, 7, 10) — **não** 1–5 *(mapear para 1–5 perderia a granularidade que o acervo já usa e tornaria o import não reversível)*
- ✅ Ano *(1900 até o ano seguinte: o acervo tem provas históricas transcritas, e prova de janeiro é cadastrada em novembro)*
- ✅ Banca · Instituição · Cargo · Nível do cargo · Origem *(texto livre de propósito: "CESPE" virou "CEBRASPE" no meio dos vinte anos, e vocabulário fechado obrigaria a escolher qual nome está certo antes de o dado existir)*
- ✅ Video URL, **só `http`/`https`** *(`javascript:` num campo que a tela vira link é XSS armazenado, e o campo aceita colagem de qualquer lugar)*
- ✅ Ano com erro de digitação é **recusado**, não corrigido *(gravar `2024` a partir de `20244` seria adivinhação, e adivinhação em dado de origem é como um acervo perde a confiabilidade)*
- ✅ Aba Metadados **montada e gravando** *(#139 — o painel existia desde #87 e não estava em tela nenhuma, nem havia caminho de escrita. Os metadados entram pelo **mesmo** `PATCH` e pela mesma versão do texto: um segundo caminho teria o próprio `updatedAt` a comparar, e as duas gravações se invalidariam a cada pausa da digitação. Verificado na rota real: `"  CESPE "` normalizado, ano `20244` recusado com 400, `javascript:` recusado, e autosave sem mudança devolvendo `written: false`)*
- ✅ Criar e remover tag *(#85 aplicou a regra, #141 deu adaptador, rotas e tela. Verificado contra o banco: aplicar `funcao quadratica` e `FUNÇÃO   QUADRÁTICA` numa questão que já tinha `Função Quadrática` deixou **três linhas em `tags`, não cinco**. Desmarcar não apaga a tag do workspace: outras questões usam, e "tirei desta" nunca quis dizer "sumir do acervo")*
- ✅ **Normalização: o mesmo assunto escrito de dois jeitos não vira duas tags** *("Função Quadrática", "função quadratica" e "  FUNÇÃO  QUADRÁTICA " são uma. A caixa da tela fica como a pessoa digitou; quem cuida da duplicata é a chave)*
- ✅ Busca ignora acento, e o custo está assumido *(digitar sem acento é o erro mais comum em português; "sabia"/"sabiá" colidem, e vale para **tag**, não para conteúdo de questão)*
- ✅ Autocomplete ordenado por **uso**, não por alfabeto *(as dez mais usadas cobrem a maioria dos casos; a ordem alfabética as esconderia atrás de qualquer coisa com "a". Verificado na rota: `juros simples` (8) antes de `Função Quadrática` (1) e `Álgebra` (1). E `?q=funcao` encontra `Função Quadrática`)*
- ✅ Prefixo vence conteúdo *(quem digita "fun" quer "Função", não "Interpretação de funções" — ainda que a segunda seja sete vezes mais usada)*
- ✅ Colar uma lista aplica em sequência *(em paralelo, duas grafias da mesma tag criariam duas linhas)*
- ✅ Filtro por tag *(#89 fez o predicado, #141 montou o controle na barra da árvore. Tipo e tag entram num predicado só: encadear duas passagens recortaria a árvore duas vezes, a segunda sobre galhos que a primeira já podou)*
- ✅ O chip de filtro responde ao teclado *(`Chip` é um `span`; sem `role`, `tabIndex` e `Enter`/espaço o filtro só existiria para quem usa mouse — e `aria-pressed` é o que diz que ele está ligado, coisa que a cor de fundo não conta)*
- ✅ Selecionar duas tags filtra por **todas**, não por qualquer uma *(selecionar a segunda é o gesto de **estreitar**; com "ou" ela ampliaria o resultado, e a pessoa concluiria que o filtro quebrou)*
- ✅ O filtro compara pela chave de tag *(filtrar por "funcao" encontra questão marcada com "Função")*
- ✅ Contagem por tag vem do **conjunto visível**, não do acervo *(o número serve para decidir se vale clicar agora; um total global diria "300" numa publicação com três)*
- ✅ `validate_question` com regras, warnings e inconsistências *(#79, #85 — regras nos plugins; **aviso não invalida**, senão a lista de problemas vira ruído que ninguém abre. Tipo sem plugin fica `UNVALIDATED`, não `INVALID`: dizer que ela está errada seria mentira — o que falta é o produto saber avaliá-la.)*

**Aceite da fase**
- ◐ §33 "Questão" completo *(o domínio está de pé, e desde a #141 tudo tem tela: alternativas, metadados, tags e o filtro. Falta a conferência visual, que é do usuário)*

---

## Wave C — agente

### Fase 8 — Provider e painel (somente leitura)

**Provider**
- ✅ Interface `AiProvider` com `listModels`, `run` e `stream` opcional
- ✅ `OpenAiCompatibleProvider` com `baseURL` configurável *(**um** provider, não quatro)*
- ✅ Perfil OpenRouter (padrão)
- ✅ Perfil OpenAI
- ✅ Perfil Ollama local
- ✅ Perfil custom
- ✅ Matriz de capacidades por perfil *(o Ollama **não** promete tool calling; a configuração corrige por modelo)*
- ✅ Settings: provider, modelo e endpoint **visíveis** na página de diagnóstico *(a edição
  continua no `.env.local`, que é onde o resto da infraestrutura mora)*
- ✅ Botão "testar conexão" — lista os modelos e diz se o `AI_MODEL` configurado está entre eles
- ✅ Chave existe apenas no servidor *(`import "server-only"` no provider)*
- ✅ Chave nunca chega ao browser, verificado *(`tests/ai-key-boundary.test.ts` percorre o grafo de imports de cada `"use client"`)*
- ✅ Testes de contrato com respostas gravadas *(22 casos, sem rede — e uma verificação real contra os 13 modelos do Ollama da máquina)*
- ⛔ *Fallback JSON para perfil sem tool calling nativo* — o provider hoje **recusa** tools nesse caso, em vez de cair para JSON no prompt. Recusa é honesta; o fallback pertence ao runner do agente, que ainda não existe.

**Painel**
- ✅ Painel no `aside`, fechado por padrão
- ✅ FAB `✦` abre e fecha
- ✅ `Ctrl+Shift+A` *(`event.code`, para não brigar com teclado ABNT2)*
- ✅ Redimensionável
- ✅ Estado persistido *(o do painel; o **contexto** de propósito não persiste)*
- ✅ `AgentContext` montado e exibido no `AIContextBar`
- ✅ Contexto é explícito e removível *(com teto e tamanho à vista)*
- ✅ Seleção do Monaco pode ser anexada
- ✅ Provider e modelo visíveis

**Tools somente leitura**
- ✅ `get_current_question`
- ✅ `get_question_options` *(letra projetada da posição, nunca lida do banco)*
- ✅ `get_question_metadata`
- ✅ `get_source_anchor`
- ✅ `get_render_diagnostics`
- ✅ `search_questions`
- ✅ `validate_question` *(avalia **sem** persistir)*
- ✅ Tools definidas pelo servidor, nunca pelo modelo
- ✅ Inputs de tool validados *(schema fechado + validação antes de tocar a porta)*
- ✅ Outputs de tool com limite de tamanho *(8k, truncando com marca)*
- ✅ Nenhuma tool de SQL arbitrário — teste de guarda varre o módulo
- ✅ Nenhuma tool de shell arbitrário — idem
- ✅ Nenhuma tool de escrita exposta — a porta de leitura **não tem verbo de escrita**, e há teste

**Execução e auditoria**
- ✅ Modo `ASK` *(laço de até 3 rodadas; a última vai **sem tools**, forçando resposta)*
- ✅ Timeline de tool calls com `ToolCallCard`
- ✅ Tool, input resumido, output, duração e status visíveis
- ✅ Tokens exibidos quando disponíveis *(o Ollama informa tokens, não dinheiro)*
- ✅ `AgentRun` persistido *(modelo imutável — log que se edita não audita nada)*
- ✅ Prompts completos não vão para o log por padrão *(só resumo de 280 caracteres)*

**Aceite da fase**
- ✅ O modelo sabe exatamente qual questão está aberta — **o id não é parâmetro de tool**; o
  servidor o vincula. Dizer o id no prompt não bastou: contra o Ollama real, o modelo inventou
  três uuids numa só conversa e concluiu, a partir do "não encontrei", que a questão não tinha
  alternativas. Id que o modelo não fornece é id que ele não erra.
- ✅ Ollama offline não impede o uso normal do app *(rota devolve 503 com instrução; a tela segue)*
- ✅ Ausência de chave mostra instrução clara
- ✅ Falha do provider não perde edição do usuário *(a pergunta fica na tela; o turno é que falha)*
- ✅ *Settings com "testar conexão"* — resolvido na página de diagnóstico (#119)

---

### Fase 9 — Patch, diff e aprovação

**Patch**
- ✅ `QuestionPatch` definido em Zod *(a única dependência de validação do projeto, e aqui ela se paga)*
- ✅ Whitelist de campos alteráveis — `validationStatus`, `originalLatex`, `legacyId` e `status` **não** são proponíveis
- ✅ Todo patch validado antes de ser apresentado
- ✅ `propose_question_patch`
- ✅ `propose_option_patch` *(por id, nunca por letra)*
- ✅ `propose_metadata_patch`
- ✅ `propose_tags`
- ✅ `propose_reorder_options`
- ✅ Schema do patch versionado

**Apresentação**
- ✅ Resumo do que o agente entendeu *(obrigatório no schema)*
- ✅ Campos afetados listados
- ✅ Diff por campo *(reescrita idêntica **não** vira linha)*
- ✅ Diff Monaco para LaTeX *(texto curto vai lado a lado — banca em caixa de código é ruído)*
- ✅ Render antes *(compilado sob demanda, nada persistido)*
- ✅ Render depois
- ✅ Warnings do agente visíveis
- ✅ Custo e uso quando disponíveis *(no `ToolCallCard` e no rodapé do turno)*

**Candidate render**
- ✅ `render_candidate_latex` isolado *(executor direto, D35 — sem `RenderJob`, sem storage)*
- ✅ Nenhuma escrita no banco *(teto de 3 compilações por turno)*
- ✅ Diagnostics devolvidos ao agente

**Aplicação**
- ✅ Aplicar tudo
- ✅ Aplicar seleção *(o plano é recalculado do estado corrente, não aceito da tela)*
- ✅ Rejeitar *(não aplicar é o default: sem lista de aprovadas nada acontece)*
- ✅ Pedir revisão, com feedback ao agente
- ✅ Revisão anterior criada antes de aplicar — na **mesma** transação
- ✅ Aplicação dentro de transação
- ✅ Reverter após aplicação *(o snapshot vem do banco, nunca do corpo da requisição)*
- ✅ **Nada é aplicado sem aprovação explícita** — lista vazia é erro, não "aplicar tudo"

**Modos**
- ✅ `REVIEW` *(default é `ASK`: ganhar tools de proposta precisa ser pedido)*
- ✅ `FIX_LATEX` iterativo *(único modo com `render_candidate_latex`)*
- ✅ Máximo de iterações por modo
- ✅ Timeout global — **e cada chamada carrega o prazo restante**, senão o timeout do provider
  (120 s) mata o turno antes do orçamento do modo. Foi assim que a primeira verificação falhou.
- ✅ Cada tentativa registrada *(no `ToolCallCard` e no `AgentRun`)*
- ✅ `ENRICH` com confidence e warnings
- ✅ `STRUCTURE` a partir de texto bruto

**Critérios de "corrigir questão"** *(spec §36)*
- ✅ Sintaxe LaTeX
- ✅ Formatação
- ✅ Estrutura da questão
- ✅ Gabarito (existe correta? há múltiplas indevidas? a solução contradiz?)
- ✅ Metadados
- ✅ Origem (compara com o texto extraído quando disponível)
- *Enumerados no prompt do `REVIEW`: sem lista, o modelo revisa a redação e passa por cima do
  gabarito, que é o defeito que de fato inutiliza uma questão.*

**Aceite da fase**
- ✅ §35 completo (§12 deste documento) *(auditado item a item; os 21 têm prova nas Fases 8–10)*
- ✅ E2E do fluxo crítico passa ponta a ponta *(#158 — propor, revisar linha a linha e aplicar,
  com o modelo dublê e a rota de aplicar de verdade)*

---

### Fase 10 — Revisões e histórico

- ✅ `Revision` com `entityType`, `entityId`, `revisionNumber` e `snapshotJson` *(nasceu na Fase 9 — aplicar sem poder desfazer não é aplicar, é apostar)*
- ✅ Origem `USER`
- ⛔ Origem `IMPORT` — chega com o importador (Fase 11); não há produtor ainda
- ✅ Origem `AGENT`
- ⛔ Origem `SYSTEM` — vocabulário declarado, sem produtor: nada no sistema muda questão sozinho
- ✅ `agentRunId` vinculado quando aplicável
- ✅ Aba Histórico com timeline *(carregada ao abrir a aba, não com a questão)*
- ✅ Diff entre revisões *(os dois lados vêm do servidor — montar o "atual" da tela esconderia
  alternativa, metadado e tag, bem os campos onde o agente mais mexe)*
- ✅ Restaurar revisão *(com confirmação: a lista é navegável por teclado)*
- ✅ Restauração devolve o estado exato, com teste *(inclusive acento, `\\` e o gabarito)*
- ✅ Restauração é auditada

---

## Wave D — acervo legado e portabilidade

### Fase 11 — Importação do legado *(roda localmente — auditoria §43)*

**Escopo do scanner** *(§2.10)*
- ✅ Detecta bibliotecas a partir de `padrao.knowchicoconfig` *(2026-08-31 —
  `scan-legacy-acervo.ts`; rodado contra o acervo real: as 11 bibliotecas registradas, todas com
  metadata presente)*
- ✅ `ITA/Material` (3,2 GB) explicitamente ignorado *(não está registrado no config; o scanner
  reporta `ITA` como pasta ignorada, com motivo — sem caso especial no código)*
- ✅ `Listas/` (327 MB, repos git de terceiros) explicitamente ignorado *(mesmo mecanismo — não
  registrado, reportado como ignorado)*
- ✅ O relatório declara o que foi ignorado e por quê *(achado extra rodando contra o acervo real:
  `_Antigos/` também aparece — cópias desatualizadas de duas bibliotecas que já têm versão
  corrente registrada; o próprio mecanismo pegou um caso que a auditoria original não previu)*
- ✅ Importador tem acesso direto ao filesystem — nenhum upload exigido para começar *(lê
  `/mnt/t/KnowChico` diretamente via `LEGACY_ACERVO_ROOT`)*

**Leitura segura**
- ✅ Banco legado aberto estritamente read-only *(mesmo padrão da Fase 4, `immutable=1` +
  `SQLITE_OPEN_READONLY`, nos três leitores: config, biblioteca e opção)*
- ✅ Originais nunca modificados *(read-only por construção; os 11 `.knowchico` seguem intactos)*
- ✅ Detecção da geração de schema por biblioteca
- ✅ Geração `add_LatexComplemento` suportada (10 bibliotecas)
- ✅ Geração `Questao_Imagens_Completa` suportada (2 bibliotecas)
- ✅ Bibliotecas sem `__EFMigrationsHistory` suportadas (2)
- ✅ Campos ausentes degradam sem quebrar *(a **coluna** manda sobre o registro de migração)*
- ✅ **Correção de 2026-08-31 — os nomes de coluna documentados não batiam com o schema real.**
  Levantamento contra as 11 bibliotecas achou `Apelido` (não `Titulo`), `latexQuestao` (não
  `LatexEnunciado`), `Instituição` com acento (não `Instituicao`), `Nivel_Cargo` com underscore
  (não `NivelCargo`) — um `SELECT` com os nomes antigos teria falhado na primeira execução real.
  Achou também uma terceira migração real (`Tags_on_Questions`, no ProfMat) e provou que "tem
  banca de concurso" é independente de geração — o ProfMat tem a migração mais nova sem ter banca.
  `legacy-schema.ts` corrigido, nova capacidade `hasBanca`, 4 testes novos fixando os nomes reais;
  `FIELDS_PENDING_MAPPING_DECISION` documenta o que foi achado e ainda não tem mapeamento decidido
  (`Nivel`, `idPublication`, `Publicacao`, `Editora`, `Path`, `VideoLink`, `latexOrigin`)

**Scanner**
- ✅ Detecta bibliotecas a partir de `padrao.knowchicoconfig` *(mesma prova do bloco acima)*
- ✅ Conta tabelas e linhas *(2026-08-31 — `audit-legacy-library.ts`, rodado contra as 11
  bibliotecas: 288 questões, 1212 alternativas no total. `Livros de Matemática`, `Provas ENEM`,
  `Ingles` e `Pré-Cálculo` estão com 0 questões — registradas, com metadata presente, mas vazias;
  o conteúdo correspondente pode estar só nas cópias antigas de `_Antigos/` — **investigado em
  2026-09-02**: `_Antigos/Livros/Matematica` tem 4 questões e `_Antigos/Provas/ENEM` tem 5, resíduo
  de teste antigo, não tesouro; Ingles e Pré-Cálculo nem cópia antiga têm. Nada a resgatar)*
- ✅ Relatório de integridade: questões órfãs *(checado nas 11 — zero violações)*
- ✅ Relatório: pais ausentes *(checado nas 11 — zero violações)*
- ✅ Relatório: alternativas inválidas *(achado real, não hipotético: **7 questões em 3
  bibliotecas** — ProfMat (2), Cesgranrio CAIXA (2), Mat-Financeira (3) — são múltipla escolha
  sem nenhuma alternativa marcada correta. **Decisão do Chico em 2026-09-02: importar o resto e
  reportar as 7 como inconsistentes** — que é o que `map-legacy-library.ts` já fazia (excluir +
  rastrear razão por `legacyId`), agora com ratificação em vez de escolha unilateral. As 11
  bibliotecas no banco de dev foram escritas exatamente assim)*
- ✅ Relatório: assets ausentes *(2026-09-02 — `report-missing-legacy-assets.ts` (domain puro +
  caso de uso + CLI, 20 testes). Achado real: o acervo usa **um** formato só de referência,
  `\includegraphics{images/clipboard_<ts>.png}` do colar-do-clipboard do app legado — **11
  referências em 4 bibliotecas, todas com arquivo no disco**, batendo 1:1 com o `find` (nem asset
  órfão, nem referência órfã). Alternativa também cita figura (`Questao_Itens.latexResposta`,
  Fundamentos itens 6–7) e a figura mora na pasta da questão dona. O caminho de falha foi
  exercitado contra biblioteca sintética: três razões distintas — `arquivo-ausente`,
  `caminho-escapa-da-pasta`, `questao-dona-desconhecida`)*
- [ ] Figuras de questão → `Asset` *(pendência **nova**, achada pelo relatório acima em
  2026-09-02: as 11 figuras existem no disco e o LaTeX importado as cita, mas
  `map-legacy-library.ts` monta `assets: []` e o backfill só traz capa e PDF da publicação — o
  renderizador do produto novo não tem esses arquivos. São exatamente 11, nomeadas no relatório;
  trabalho pequeno e bem delimitado)*

**Mapeamento**
- ✅ Biblioteca → `Workspace` (D11) *(2026-08-31 — `map-legacy-library.ts` + `MapLegacyLibraryOptions`)*
- ✅ `Publication` com `legacyId` e `legacyUuid` *(achado maior do turno: uma biblioteca **não é**
  um livro — é uma coleção. A tabela `Publication` real (UUID, ISBN, capa, `AuthorSort`) é o livro
  de verdade; `Questao.idPublication` liga cada questão a um deles. Confirmado por consulta
  recursiva contra o acervo real: uma subárvore inteira pertence a um único `idPublication`, nunca
  mistura. Rodado contra Cesgranrio CAIXA: 2 publicações reais saíram do arquivo —
  "Apostila 1200 Questões Cesgranrio" e "1000 Questões Caixa Econômica Federal")*
- ✅ Autores *(`AuthorSort` → `authors[0]`, best-effort — não é uma lista estruturada no legado)*
- ✅ Editoras *(checado, não implementado: `Questao.Editora` está vazio nas 11 bibliotecas reais —
  não é ausência de mapeamento, é ausência de dado. `Publication` (o livro de verdade) não tem
  campo de editora no schema legado nenhum)*
- ✅ Tags e tags de conhecimento *(checado: `TagConhecimento` não existe ou tem zero linhas nas
  11 — nunca foi usado. Nada para importar)*
- ✅ `Questao` → `DocumentNode` *(escrito — `mapLegacyLibrary`, 15 testes)*
- ✅ `TipoQuestao` negativo → `NodeKind` estrutural
- ✅ `TipoQuestao` positivo → `Question` *(tipo desconhecido vira exclusão relatada, não default —
  decisão de 2026-08-31: não derruba a biblioteca inteira)*
- ✅ **`Ordem` ignorada; ordem derivada de `IdQuestao`** — nem no `SELECT` ela entra
- ✅ `sortKey` fracionário gerado
- ✅ `Numeracao` → `numberingStyle`
- ✅ `Numeracao_Original` → `originalLabel`
- ✅ `Questao_Itens` → `QuestionOption`
- ✅ `Marcacao` → `legacyMarcacao`, nunca como identidade *(campo novo em `PortableOption`/
  `RuntimeOption` — o schema Prisma já tinha `legacyMarcacao`, só a projeção portable/runtime não
  carregava; ver commit `3a63dcc`)*
- ✅ `Questao_Itens.Correta` → `isCorrect`
- ✅ `Questao.Correta` ignorado
- ✅ `IsExpanded`, `IsSelected`, `IdQuestao_Original` ignorados
- ✅ Dificuldade na escala 0/2/5/7/10 *(fora da escala vira o meio e **avisa** que coagiu)*
- ✅ Metadados de concurso (banca, instituição, cargo, nível, ano) *(condicional — só bibliotecas
  com `hasBanca`; livro-texto não tem essas colunas)*
- ✅ LaTeX: enunciado, resposta, complemento, origem

**Assets**
- ✅ Gravados via `LocalFileStorageProvider` *(2026-08-31 — `backfill-legacy-covers.ts`, para as
  capas; ver abaixo)*
- ✅ `sha256` calculado por arquivo *(o `put()` do próprio `LocalFileStorageProvider` faz isso —
  nenhum cálculo próprio precisou ser escrito)*
- ✅ `pub<N>/cover.jpg` → `Asset(COVER)` *(8 de 8 publicações reais receberam capa — uma delas,
  ProfMat, tinha `cover.png` em vez de `.jpg`, achado rodando contra o acervo, não hipótese; o
  script tenta as duas extensões)*
- ✅ `<Título>.detail.json` → `metadataJson` *(checado, não implementado: **todo** `.detail.json`
  do acervo — nas 8 publicações reais e nas dezenas de entrada de catálogo sem questão — tem
  exatamente 0 bytes. Não é ausência de mapeamento, é ausência de dado, confirmada arquivo por
  arquivo)*
- ✅ `preview.png` **não** importado (é cache de render)
- ✅ Fontes de figura classificadas por tipo: gnuplot, pgf, asymptote, geogebra, tpx, tex, table, svg, eps
- ✅ PDFs → `Asset(SOURCE_PDF)` *(escrito — `backfill-legacy-assets.ts` achou e gravou o único PDF
  fonte real do acervo, em `Prof-Mat/pub0000000008`; as outras 7 publicações reais não têm PDF
  solto no filesystem, só o registro de `Publication`)*
- ✅ Relatório do que caiu em `ATTACHMENT` por falta de classificação *(a função existe e é
  testada; checado que não há caso real para ela nas 8 publicações reais — nenhum arquivo fora de
  capa/PDF/`.detail.json` apareceu no filesystem de nenhuma)*
- ✅ Nenhum arquivo descartado silenciosamente

**Execução**
- ✅ Dry-run sem nenhuma escrita *(`dry-run-legacy-import.ts`)*
- ✅ Import idempotente por `legacyId` + `workspaceId` *(correção de desenho em 2026-08-31: a
  idempotência real é no **workspace**, por `IdBiblio` — `Workspace.legacyId`, já `@@unique` no
  schema, comentado como "IdBiblio de padrao.knowchicoconfig" desde antes desta fase existir.
  A primeira tentativa reaproveitou o índice de colisão do `.lbb` (`Question`/`Publication`
  globais, sem escopo de workspace) e produziu colisão falsa entre bibliotecas diferentes — cada
  uma reinicia sua própria numeração `IdQuestao` em 1. Corrigido: `PrismaLegacyImportWriter`
  confere `Workspace.legacyId` **antes** de qualquer leitura; workspace novo não tem com o que
  colidir por dentro. Provado rodando a Cesgranrio CAIXA duas vezes: a segunda diz "já importada,
  nada feito")*
- ◐ `ImportReport`: importados, atualizados, ignorados, inconsistentes, órfãos, assets ausentes
  *(o relatório do script cobre importados e inconsistentes — as questões excluídas por invariante,
  com o motivo. Faltam "atualizados" (não há caso de uso ainda — o import de hoje só cria) e
  "assets ausentes" (Fase 11 ainda não importa asset nenhum))*
- ✅ `legacyId` preservado após o import *(`Workspace.legacyId`, `Publication.legacyId/legacyUuid`,
  `DocumentNode.legacyId`, `Question.legacyId`, `QuestionOption.legacyId/legacyMarcacao` — todos
  gravados e conferidos direto no banco depois da escrita real)*

**As 11 bibliotecas, escritas de verdade em 2026-08-31** *(`write-legacy-import.ts`, contra
`/mnt/t/KnowChico`, banco de desenvolvimento — não é mais simulação)*:
- ✅ 11 workspaces, 8 publicações reais (títulos extraídos da tabela `Publication` do legado —
  ex. "Apostila 1200 Questões Cesgranrio", "Curso de Analise Vol. 1"), 225 questões, 1110
  alternativas
- ✅ 7 questões excluídas por invariante (gabarito ausente), reportadas com o legacyId e o motivo —
  nenhuma derrubou a biblioteca inteira
- ○ 3 bibliotecas (`Livros de Matemática`, `Provas ENEM`, `Ingles`, `Pré-Cálculo` — 4, não 3) têm
  `Questao` só estrutural, zero questão de fato: registradas como estão, sem inventar conteúdo
- ○ Achado incidental: `Análise Elon` tinha 5 linhas de `Questao_Itens` presas a um nó de
  **capítulo** (não uma questão) — lixo de template do app antigo. Corretamente não importado; o
  mapeador só lê alternativas de nó classificado como questão

**Invariantes afirmadas** *(falham ruidosamente se violadas)*
- ✅ Toda questão de múltipla escolha tem exatamente uma alternativa correta *("afirmada" não é
  "nunca violada" — é "violação nunca passa batido". As 7 reais foram achadas, excluídas e
  reportadas, não silenciadas; nenhuma foi importada com gabarito errado ou ausente)*
- ✅ Todo `IdQuestao_Pai` não nulo aponta para nó existente na mesma biblioteca *(checado nas 11
  reais — zero violações)*
- ✅ Nenhum ciclo na árvore *(checado nas 11 reais — zero violações)*
- ✅ Rodar o import duas vezes não cria nada novo *(provado de verdade, não só desenhado: a
  Cesgranrio CAIXA rodou duas vezes — a segunda respondeu "já importada, nada feito", sem duplicar)*

**Aceite da fase**
- ✅ **As 11 bibliotecas registradas importam** *(não 13 — correção de 2026-08-31: as "13" da
  auditoria original contavam arquivos `.knowchico` no disco, incluindo 2 cópias desatualizadas em
  `_Antigos/` que `padrao.knowchicoconfig` não referencia — ver §2.10/§2.6. 11 é o número real de
  bibliotecas ativas, e as 11 foram escritas no banco de desenvolvimento)*
- ✅ Contagens batem com o levantamento (64 pubs, 297 nós, 1.247 alternativas) *(**reconciliado
  exatamente em 2026-09-02** — a suspeita de 2026-08-31 de que "64 veio do Calibre" estava errada;
  o levantamento original estava certo, só contava outra coisa: os **13 arquivos** `.knowchico`
  (11 ativos + 2 cópias velhas de `_Antigos/`) e **linhas cruas**, não entidades importáveis.
  64 pubs = 60 linhas de `Publication` nas ativas + 4 em `_Antigos`; 297 "nós" = 288 linhas de
  `Questao` nas ativas + 9 em `_Antigos`; 1.247 alternativas = 1.212 + 35. E o importado fecha a
  conta na outra ponta: 288 − 7 sem gabarito = **281 nós** criados (225 com questão + 56
  estruturais); 8 publicações porque só linha de `Publication` **com questão digitalizada** vira
  publicação no produto — as outras 52 são registro de livro sem conteúdo)*
- ◐ §33 "Legado" completo (§10 deste documento) *(a Fase 11 do §10 ainda aponta os itens de
  Assets/Editoras/Tags como pendentes — ver acima)*

---

### Fase 12 — Busca

- ✅ `QuestionSearchService` abstrato
- ✅ Busca por título e apelido
- ✅ Busca por enunciado
- ✅ Filtro por tags *(`E` entre elas, não `OU`)*
- ✅ Filtro por banca
- ✅ Filtro por instituição
- ✅ Filtro por ano
- ✅ Filtro por tipo
- ✅ Filtro por dificuldade
- ✅ Integração com `Ctrl+K` *(busca no servidor a partir de três letras — conferido no navegador
  na #181, junto com o limiar: com duas letras só os nós da árvore aparecem)*
- ✅ **A busca só mostra o que existe em alguma tela** *(#181 — ela não filtrava o nó, e devolvia
  questão de nó **excluído** (a árvore a esconde por `deletedAt`) e questão **órfã**, sem nó
  nenhum. A órfã é o caso grave: `Question` só alcança workspace pelo nó, então sem nó ela não tem
  dono — não é exportada, não é escopada pelo guarda da #175, não aparece em tela alguma. Na
  paleta, a mesma questão aparecia seis vezes. **Decisão de 2026-09-02: apagar** — as 12 órfãs
  eram resíduo de seed de 2026-08-10/11, sem `legacyId`, sem apelido, sem asset/render/revisão;
  `delete-orphan-questions.ts` listou, apagou (12 questões, 29 alternativas) e a segunda rodada
  confirmou zero. O script fica: dry-run por padrão, `CONFIRM=yes` para apagar, e aborta sozinho
  se uma órfã tiver histórico — essa não é lixo, é trabalho perdido a investigar)*
- ✅ Avaliação do FTS5 do SQLite
- ✅ Benchmark sobre o **acervo importado** *(fechado por decisão de 2026-09-02: o ⛔ dizia "o
  acervo não está nesta máquina", e desde a Fase 11 está — 8 publicações, 225 questões. Re-rodar
  contra 225 questões reais não mudaria a resposta que o benchmark existe para dar ("qual motor"):
  o corpus sintético de 20 mil e 200 mil questões é 670× maior que o real e já foi decisivo.
  Resolvido sem re-execução, com o motivo registrado)*
- ✅ Decisão documentada com números → `docs/_atual/search-benchmark.md`
- ✅ `QuestionSearchService` permanece agnóstico — sem SQL cru, sem `MATCH`

---

### Fase 13 — Portabilidade `.lbb` *(D18, D32, D36, D37)*

**Portable Schema versionado** *(D37)*
- ✅ `PortableSchema` definido, **próprio e versionado**
- ✅ **Não depende diretamente da migration atual do Prisma**
- ✅ Export faz projeção **runtime → portable**
- ✅ Import faz projeção **portable → runtime**
- [ ] Migradores de formato previstos — só existe a v1; o migrador nasce com a v2, e escrevê-lo
  antes seria adivinhar de onde ela vem. *O planejamento pede migradores "**quando fizer sentido**";
  com uma versão só, não faz — isto é escopo futuro, não dívida*
- ✅ `formatVersion` declarado no `manifest.json`
- ✅ Versão desconhecida é recusada com mensagem clara — **nunca adivinhada**

**Formato**
- ✅ Módulo `portability` criado
- ✅ `PortableArchiveWriter` implementado
- ✅ `PortableArchiveReader` implementado
- ✅ `manifest.json` com `formatVersion`, workspace, contagens, data e checksums
- ✅ Assets em `assets/<sha256[0:2]>/<sha256>.<ext>`
- ✅ Dados referenciam assets por `sha256`, nunca por path — **`data.json` e não `data.sqlite`**:
  um banco dentro do zip traria o motor junto, e o formato herdaria as versões dele. O que a §7
  queria garantir — que o portable não seja o schema de runtime — o `PortableSchema` já garante.
- ✅ Independência de path garantida

**Exportação**
- ✅ Exporta um workspace inteiro *(artefato de render **não** atravessa — é cache regenerável)*
- ✅ Assets duplicados aparecem uma única vez no zip
- ✅ Checksums calculados e gravados
- ✅ Progresso visível para acervos grandes *(#195 — a resposta saía `chunked`, **sem
  `content-length`**: o navegador mostrava "tamanho desconhecido", sem barra, sem estimativa e sem
  como distinguir um download lento de um travado. Num acervo de 109 MB é a diferença entre esperar
  e desistir. O número é exato, não estimativa, porque o arquivo já está inteiro em memória — e é
  esse mesmo fato que marca o **limite honesto** deste item: a montagem do zip acontece antes do
  primeiro byte, e esse tempo continua silencioso. Mostrá-lo exigiria montar em fluxo, e o mesmo
  escritor serve o backup (D32/D36): duas montagens do mesmo formato divergiriam, e o teste de
  round-trip existe justamente porque essa divergência é cara)*
- ✅ UI de exportação *(um `<a download>` por workspace na página de diagnóstico)*

**Importação**
- ✅ Verifica `formatVersion` — **antes** do checksum
- ✅ Verifica checksums e recusa arquivo corrompido
- ✅ Religa assets ao `StorageProvider` de destino *(chaves novas — é o que o endereço por hash compra)*
- ✅ Colisão de `legacyId`/`uuid` gera relatório e exige decisão
- ✅ **Nada é sobrescrito em silêncio**
- ✅ Relatório de importação *(com `dryRun=1` para ver antes de gravar)*
- ✅ UI de importação *(com dry-run **antes** de gravar, sempre — e desde a #189 a confirmação é um
  `Modal`, não o `confirm()` do navegador. O nativo é o único gesto da tela que o **navegador pode
  desligar**: marcada a caixa "impedir esta página de criar diálogos", ele devolve `false` sem
  aparecer, e o import deixaria de acontecer em silêncio, com a tela dizendo "cancelado" sobre algo
  que ninguém cancelou. É a mesma convenção da exclusão na árvore, pelo mesmo motivo)*

**Backup recorrente** *(D32, corrigida por D36)*
- ✅ **Backup não roda dentro do processo do renderer**
- ✅ `services/backup` é processo próprio — e **sem `DATABASE_URL`**: ele pede o `.lbb` ao app por
  HTTP. A primeira versão importava o exportador de `apps/web` e quebrou no `import "server-only"`,
  que foi o guarda avisando que um segundo processo no mesmo banco seria um segundo escritor.
- ✅ **Backup reutiliza o mesmo `PortableArchiveWriter`** — o arquivo é byte a byte o da exportação
- ✅ Nenhum formato de restauração paralelo
- ✅ Frequência configurável *(`BACKUP_INTERVAL_HOURS`)*
- ✅ Retenção configurável *(`BACKUP_KEEP`, **por workspace**)*
- ✅ Destino configurável *(`BACKUP_DESTINATION`)*
- ✅ Falha de backup fica registrada em `backup-status.json`, nunca em silêncio
- ✅ Página de diagnóstico lendo esse arquivo
- ✅ **A página de diagnóstico tem marca de região** *(#189 — era a única do produto sem `main`: a
  inicial, as avaliações, a ingestão e o workbench já tinham a sua. Sem ela, quem navega por leitor
  de tela não pula para o conteúdo — e é justamente esta a página aonde se vai quando algo não está
  funcionando)*
- ✅ Último backup registrado com data e tamanho

**Aceite da fase**
- ✅ **Round-trip exercitando as duas projeções** — a identidade verificada é entre os dois
  *portables*: se a ida e a volta não perderam nada, projetar o resultado outra vez dá o mesmo
  arquivo. Comparar os runtimes seria comparar ids que a projeção troca de propósito.
- ✅ **Um arquivo produzido pelo backup automático passa pelo mesmo teste de round-trip** —
  verificado: importado e reexportado, o `data.json` voltou idêntico
- ✅ Arquivo de versão futura é recusado com mensagem clara
- ✅ Arquivo corrompido é recusado com mensagem clara *(dados **e** asset adulterado)*
- ✅ Teste de round-trip incluído na suíte

---

## Wave E — ingestão visual

### Fase 14 — Assets, PDF e crop

**Ingestão**
- ✅ Upload por file picker *(#135 — `AssetDropzone`; o `input` não borbulha o próprio clique, senão o seletor reabriria sozinho)*
- ✅ Drag-and-drop *(o `dragover` é cancelado — senão o navegador abre o arquivo numa aba e o trabalho da tela se perde)*
- ✅ `Ctrl+V` de imagem *(só quando a tela pede; colar texto continua chegando ao editor)*
- ✅ sha256 do conteúdo — **é a identidade** (D29)
- ✅ MIME e extensão validados — **e a discordância entre os dois é recusada**
- ✅ Limite de upload
- ✅ Metadata (tamanho, dimensões, filename original) *(dimensões lidas do cabeçalho, sem decodificar)*
- ✅ **Nenhuma chave de storage escapa do prefixo do workspace**, com teste — e a recusa devolve
  400 com o motivo, não 500 opaco
- ✅ Inserção assistida de figura *(#173 — o `figureSnippet` existia desde a Fase 14, testado, e
  **nada o chamava**: o `OriginPanel` subia a ação `insert-figure` e o editor não a escutava. Sexta
  vez do mesmo padrão. O nome do arquivo vem do servidor (`cropLatexName`) e é o mesmo que a rota de
  render grava no diretório do job — inventá-lo no cliente daria um `\includegraphics` apontando
  para arquivo que nunca chega)*
- ✅ Snippet `figure/includegraphics` gerado *(o `label` vem do nome — nunca fica vazio)*

**PDF e crop**
- ✅ Visualizador de PDF com páginas *(`pdfjs-dist`, `ssr: false`)*
- ✅ **E com imagens** *(#185 — a tela de ingestão promete "suba um PDF **ou imagem**" e o
  visualizador mandava tudo para o `pdf.js`: subir um PNG dava "Não deu para abrir o PDF: Invalid
  PDF structure", uma mensagem correta sobre a pergunta errada, e o epic de ingestão parava ali para
  qualquer arquivo que não fosse PDF. Imagem é documento de **uma página**, e o resto do mecanismo
  não muda — o recorte opera sobre o canvas, que não sabe de onde veio o desenho. A contagem de
  páginas virou derivada, não estado: guardá-la exigiria `setState` dentro do efeito, e o React
  Compiler recusa — com razão, porque ela é consequência do tipo do arquivo)*
- ✅ Zoom
- ✅ Navegação
- ✅ Desenhar retângulo de crop *(em qualquer direção; o mouse fora da página não gera coordenada negativa)*
- ✅ Ajustar o retângulo — oito alças, e puxar além do lado oposto **vira o retângulo do avesso**
  em vez de travar
- ✅ Salvar crop *(o recorte vem do cliente; o servidor guarda a caixa normalizada e o PNG)*
- ✅ `SourceAnchor` com `pageNumber` e bbox **normalizada 0..1** *(D28)* — recorte fora da página é
  **recusado**, não aparado
- ✅ Nenhuma coordenada absoluta persistida
- ✅ **Crop reconstruível a partir de PDF + página + bbox** — verificado com `pdftocairo` de
  verdade: a mesma caixa normalizada recortou o mesmo conteúdo em 72, 150 e 300 DPI
- ✅ `rotation` suportado quando aplicável
- ✅ `Asset(CROP)` criado
- ✅ Imagem original preservada
- ✅ `SOURCE_PDF` nunca substituído *(D29)* — não existe caminho de escrita sobre a fonte
- ✅ Asset fonte é imutável: a `storageKey` **contém o hash**, então mudar o conteúdo muda a chave
- ✅ Cadeia de proveniência descrita: fonte → página → recorte — **e navegável** *(#137)*
- ✅ **Tela de ingestão ponta a ponta** *(#135 — `/publications/[id]/ingestao`: subir → recortar → reconhecer → revisar)*
- ✅ Opções após o crop: inserir como figura, reconhecer matemática, copiar referência, abrir na
  fonte *(#137 — calculadas no domínio, porque cada uma depende do que a fonte é; botão que não dá
  vem com o motivo, e não desabilitado em silêncio)*
- ✅ Reconhecer **texto** do recorte *(#193 — e **não** precisou de porta nova: a fronteira de
  reconhecimento já tinha `mode`, e o texto é o quarto. O trabalho de verdade foi o **escape**:
  prosa lida de um scan traz `%`, `$` e `&`, e o `%` comenta o resto da linha — a questão sairia do
  PDF pela metade, sem erro nenhum. Só o modo `text` escapa; escapar `display` transformaria
  `\frac{1}{2}` em texto literal. E a escolha do modo foi para **antes** do recorte: descobri-la ao
  ver o resultado errado custa uma rodada do modelo de visão. Conferido com o `gemma3:12b` real
  sobre um render do acervo: saiu `R\$` e `2 \%`)*

**Aceite da fase**
- ◐ §33 "Assets" completo (§10 deste documento) *(quatro dos cinco fechados na auditoria de
  2026-08-10; falta a tela de inserção assistida de figura)*
- ✅ **"Voltar à origem" funciona a partir de uma questão** *(#137 — verificado com dado real:
  âncora criada pelas rotas, aba Origem devolvendo fonte → página → recorte, e os 30 942 bytes do
  PDF servidos por `assetId`. A `storageKey` não aparece na resposta.)*

---

### Fase 15 — Reconhecimento matemático

> **Segmentação automática de página — adiada de manhã, entregue à tarde (2026-09-02).** O
> adiamento durou o tempo do dogfooding: em menos de uma hora de uso real da prova ProfMat, o
> Chico perguntou "não tem um botão de estimar as questões?" — o critério de retorno registrado
> aqui de manhã, atingido por dado e não por opinião.
>
> **A premissa também estava errada, e medi-la foi o que destravou.** O item era "o mais arriscado
> da fila" porque se supunha visão computacional de layout. Mas o PDF **tem camada de texto**: a
> segmentação virou aritmética sobre coordenadas de palavras, determinística e testável como
> qualquer função pura daqui. Para página escaneada continua sendo visão computacional, e continua
> fora de escopo — a tela diz isso quando não acha camada de texto, em vez de fingir que não há
> questão.
>
> Medido nas 16 páginas reais: **30 de 30 questões**, números 1..30, zero duplicada, zero falso
> positivo; 29 das 30 caixas contêm a própria solução, e a única que não contém (questão 28, cuja
> solução vira a página) vem sinalizada. As armadilhas vieram do documento real: "Gabarito com
> **Soluções**" no título, "**Solução** Alternativa" no meio do texto, e "1.500 reais" abrindo
> linha igual a um enunciado — o que separa marcador de aritmética é a **margem esquerda**, não a
> expressão regular.

- ✅ **Segmentação por camada de texto** *(2026-09-02 — `segmentar-pagina.ts` (domínio puro, 26
  testes), `pdf-text-layer.ts` (adapter do pdf.js, com o eixo y invertido e NFC), botões "Estimar
  questões" e "Recortar as N" no visualizador. O lote salva e transcreve **em série** — o
  reconhecedor local é uma GPU só — e **para em transcrição guardada**: nenhuma questão nasce sem
  revisão, que é o que impede um erro de segmentação de virar trinta questões erradas)*
- ✅ `MathRecognitionProvider` definido
- ✅ Resultado com latex, confidence, alternatives, provider, model e duração
- ✅ Implementação via modelo multimodal por endpoint OpenAI-compatible
- ✅ Opção de provider local *(verificado: `gemma3:12b` no Ollama)*
- ✅ Timeout *(120 s — modelo de visão frio demora, e cortar antes desperdiça a carga)*
- ✅ Erro tratado
- ✅ Fluxo verificado ponta a ponta: recorte → reconhecer → LaTeX candidato → **compila** →
  editar → aceitar. O confronto visual entre o recorte e o LaTeX compilado é idêntico.
- ✅ Crop original nunca descartado *(nem ao rejeitar: o crop é fonte, a leitura é que estava errada)*
- ✅ **Revisão humana obrigatória antes de aceitar** — `accepted` não é estado que o reconhecedor
  alcança, e editar move para `edited`, não para `accepted`
- ✅ Falha do provider não perde trabalho *(o recorte segue no storage; a tentativa se repete)*
- ✅ Tela de revisão com o recorte ao lado do candidato *(#135 — a imagem fica à vista até o aceite; sem ela a revisão que se pede é impossível)*

---

## Wave F — diferencial de produto

### Fase 16 — Avaliações e variantes

**Randomização**
- ✅ PRNG determinístico *(`mulberry32`, aritmética de 32 bits — nada de `Math.random`, hash do
  motor ou ordem de iteração)*
- ✅ Testes de determinismo, **e medição de viés**: em 60 mil provas, o desvio máximo de uma
  alternativa cair numa posição foi de 2,57%
- ✅ Embaralhar alternativas preservando `optionId`
- ✅ Letra recalculada como projeção
- ✅ Mapa `optionId → displayedLabel` — e ele **não** é substituível pela seed: ela reproduz a
  permutação só enquanto a questão tiver exatamente as mesmas alternativas
- ✅ Embaralhar questões
- ✅ Ordem das questões e seed no resultado *(a persistência entra com o modelo `Assessment`)*

**Assessment**
- ✅ `Assessment`
- ✅ `AssessmentSection`
- ⛔ `AssessmentRule` — regra de montagem automática ("sorteie 5 de álgebra"). Sem caso de uso
  definido ainda, e um modelo vazio no schema é pior que um ausente.
- ✅ `AssessmentItem` *(referência, **nunca cópia** — corrigir o enunciado corrige em todas)*
- ✅ **A prova só monta com o acervo da própria biblioteca** *(#177 — `addQuestion` não conferia
  workspace nenhum, e uma questão de outra biblioteca entrava com `201 added:true`. Verificado com
  duas bibliotecas de verdade, criadas pelo caminho do produto. O estrago não é a prova sair errada
  — ela sai certa: é que `AssessmentItem → Question` é `onDelete: Restrict`, então a prova de uma
  biblioteca passa a **travar a exclusão** de uma questão da outra, e quem tenta apagar não descobre
  por quê, porque a prova que segura não aparece no acervo dele)*
- ✅ `AssessmentVariant` *(imutável: uma variante é uma **impressão**)*
- ✅ `AssessmentVariantQuestion`
- ✅ `AssessmentVariantOptionMap` — **é o gabarito**
- ✅ `DocumentTemplate` separando conteúdo de apresentação
- ✅ Export versão aluno (sem resposta)
- ✅ Export versão professor (com resposta marcada **no lugar da alternativa**)
- ✅ Export gabarito
- ✅ Mesma questão em templates diferentes sem duplicação
- ✅ **Apagar uma avaliação** *(#171 — achado exercitando o produto, não lendo o checklist: dava
  para criar e nunca apagar, e o `DELETE` respondia 405. Não é só acrescentar a rota: o mapa de
  letras de uma variante **é o gabarito** de uma prova que pode já ter sido impressa, e a §17
  registra que a seed não o substitui. Com variante, o servidor **recusa com 409** e devolve as
  letras; a tela então faz a segunda pergunta, com o número na frente. Sem variante, um `Modal`
  basta — perguntar as duas coisas do mesmo jeito ensinaria a clicar em "sim" sem ler)*
- ✅ **A lista de candidatas só oferece o que dá para usar** *(#187 — ela trazia tudo do workspace,
  sem olhar o nó nem o que já estava na prova: no acervo de demonstração, oito questões, das quais
  **quatro na lixeira** e três já incluídas. A da lixeira é o caso grave — uma prova montada com ela
  sai **impressa** com uma questão que a pessoa acha ter excluído, e o erro aparece na sala; é pior
  que o caso da busca (#181), onde o beco sem saída ao menos não virava papel. A já incluída é menor
  e igualmente errada: o botão devolvia `added: false`, um gesto oferecido e recusado depois)*
- ✅ Tela de montagem da avaliação *(#143 — `/avaliacoes` e `/avaliacoes/[id]`: escolher questões, definir a seed, sortear e ver as três versões. A **seed fica à vista e editável**: escondê-la atrás de um sorteio interno tiraria de quem monta a única maneira de repetir a mesma prova amanhã)*
- ✅ Persistência da variante **com o mapa de letras**, numa transação *(#143 — meia variante gravada daria uma prova cujo gabarito cobre parte das questões, e é na parte faltante que a correção erraria sem avisar)*
- ✅ A tela avisa antes de imprimir quando uma questão entrou sem alternativa correta *(o gabarito dela sairia em branco, e descobrir isso na correção é tarde)*

**Aceite da fase**
- ✅ **A mesma seed reproduz a mesma prova byte a byte, em processos diferentes** — verificado com
  dois processos `bun` separados: 1695 bytes idênticos, e diferentes para a seed vizinha

---

### Fase 17 — Endurecimento

**Diagnóstico** *(spec §25)*
- ✅ Versão do app
- ✅ Path do SQLite
- ✅ Storage ativo
- ✅ **Saúde do worker consultada via `GET /health`**
- ✅ `rendererVersion` · `pdfLatexVersion` · `pdfToCairoVersion` · `profileCount` *(o que o
  `/health` devolver aparece; o que ele não devolver não vira linha vazia)*
- ✅ TeX do host exibido como fallback opcional *(#168 — e **dito assim** no texto: quem lê
  "pdflatex 2023" numa página de diagnóstico conclui que é ele quem compila, e vai depurar a versão
  errada quando o PDF sair diferente. Quem compila é a imagem, que traz TeX Live 2022)*
- ✅ Último backup: data, tamanho e resultado *(D32/D36)*
- ✅ Provider de IA e modelo — **a chave nunca aparece, nem truncada**
- ✅ Ollama disponível *(pelo botão "testar conexão")*
- ✅ Tamanho do cache *(#168 — só os artefatos derivados, e com "descartável (D29)" ao lado: o
  número existe para responder **quanto se recupera apagando**, e somar a fonte junto diria que
  apagar o cache liberaria patrimônio)*
- ✅ Jobs *(#168 — total e quantos falharam)*
- ✅ Último erro *(#168 — a primeira mensagem de **severidade `error`**, com a linha do corpo;
  pegar o primeiro diagnóstico da lista apontaria `Overfull \hbox` como causa da falha)*

**Logs**
- ✅ Logs estruturados de render · import · agente · persistência *(uma linha JSON por evento,
  com domínio de lista fechada)*
- ✅ **Prompts completos fora do log por padrão** — campo proibido vira `[omitido]` e **não** some:
  "o prompt estava vazio" é conclusão bem diferente de "o prompt não é gravado"
- ✅ Instrumentar os pontos de chamada com o logger *(#153 — no `executeRender`, que é o **único** ponto entre o produto e o `pdflatex`; instrumentar as rotas daria o mesmo evento contado de vários lugares e nenhum saberia se houve cache. `cache_hit` é evento próprio: a primeira pergunta que se faz a um log de render é quanto daquilo é cache. Conferido num run real: `started` → `finished` com 1159 ms e 2 artefatos, sem uma letra do LaTeX)*

**Segurança e autorização**
- ✅ `workspaceId` em todas as entidades relevantes — **verificado**: um guarda varre o schema e
  exige que toda entidade alcance um workspace, direto ou por um pai declarado
- ✅ Guard central de autorização *(#175 — e o que ele achou foi pior que a ausência: o
  `publicationId` da URL era **decorativo** nas rotas de questão. Nenhuma delas o lia, então dava
  para ler e **gravar** uma questão real através de uma publicação que nem existe — `PATCH` por um
  uuid inventado respondia 200. O isolamento por `workspaceId` valia no schema e não na entrada.
  Agora a condição está **na consulta** (`where: { id, node: { publicationId } }`), e não num `if`
  depois de ler; o guarda devolve o `workspaceId` porque quem chama precisa dele de qualquer jeito,
  e duas resoluções da mesma cadeia é onde as versões divergem. 404 e não 403, de propósito:
  distinguir "existe, mas não é sua" de "não existe" confirma o id a quem está enumerando.
  Conferido no app rodando: as cinco rotas devolvem 404 pela publicação errada e 200 pela certa)*
- ✅ Secrets apenas em `.env.local` — **verificado**: um guarda varre o repositório atrás de chave,
  token e senha em URL, e outro exige que o `.env.example` não tenha valor de verdade

**Revisão arquitetural final**
- ✅ Regras de boundary da §4.5 verdes *(e elas pegaram quatro problemas reais ao longo do
  trabalho: três de tipo vazando por `server-only` e uma rota consultando o banco direto)*
- ✅ Nenhuma abstração cerimonial acrescentada além dos quatro contratos *(#191 — auditado, e a
  auditoria achou uma: `TransactionRunner`, definida na Fase 0, **exportada e nunca implementada
  nem chamada**. As transações acontecem com `prisma.$transaction` dentro dos adaptadores, que é
  onde pertencem — a transação é detalhe do motor, e o caso de uso não a orquestra. O planejamento
  nunca a pediu; ela nasceu na execução. Removida. Sobram as quatro da D23 mais a
  `MathRecognitionProvider`, que a Fase 15 pede pelo plano, e todas têm implementação. O guarda
  novo conta as fronteiras: não impede acrescentar uma sexta, impede acrescentá-la **sem decidir**)*

**Critério de sucesso do produto local** *(auditoria §48)*
- ✅ O app não alcança host externo por conta própria — **verificado** com guarda que recusa
  `fetch` com URL literal externa
- ✅ Nenhuma configuração de infraestrutura hard-coded — **verificado**: `localhost` só em
  configuração e no perfil que declara endereços sugeridos
- [ ] Biblioteca local grande é utilizável *(depende do acervo importado — Fase 11. A busca foi
      medida contra corpus sintético de 200 mil questões, 670× o acervo real, e responde em 0,2 ms;
      o que falta é o acervo de verdade, não o desempenho)*
- ✅ IA local funciona *(verificado contra o Ollama desta máquina em três fases: os 13 modelos
  listados e uma resposta completa na 8, o ciclo do `FIX_LATEX` compilando-corrigindo-compilando na
  9, e o `gemma3:12b` lendo matemática de um recorte na 15)*
- ✅ Ferramentas TeX locais funcionam *(o TeX que o produto usa roda no contêiner desta máquina, sem
  rede de saída: `tikz`, `pgfplots`, `siunitx`, `xlop` e `cancel` conferidos de olho dentro da
  imagem. O TeX **do host** é fallback opcional e continua só detectado, nunca exibido — é a linha
  aberta acima)*
- [ ] Fontes gráficas complexas são preservadas e editáveis *(a classificação por tipo — gnuplot,
      pgf, asymptote, geogebra, tpx, tex, table, svg, eps — está pronta e testada; preservar e
      editar exige o import da Fase 11)*

**E2E** *(spec §27 · #155 — Playwright, `bun run e2e`)*
- ✅ Abrir publicação
- ✅ Selecionar questão *(pelo **teclado**: o único gesto de mouse para expandir é um caret com
  `role="presentation"`, e navegar por seta é o que a §4.1 promete — passar por ele significa que
  a promessa vale)*
- ✅ Editar LaTeX *(no `.view-lines`, não no primeiro `textarea`: o Monaco tem dois, e o primeiro
  é a área de IME, coberta pelo conteúdo)*
- ✅ Autosave *("não salvo" **antes** de "salvo", com `exact` — sem ele "salvo" casa dentro de
  "não salvo" e o teste afirmaria o contrário do que quer)*
- ✅ O texto sobrevive ao recarregamento, e o teste **desfaz o que escreveu** *(sem isso, dez
  execuções deixariam o enunciado com uma fileira de marcas de teste)*
- ✅ Preview rápido aparece
- ✅ Render *(#156 — o teste que estava `fixme` voltou a valer, e agora exercita a regressão:
  compila, acrescenta um comentário LaTeX, compila de novo e afirma que **"Falha ao compilar" não
  aparece**. `Asset.storageKey @unique` derrubava o segundo render cujo PDF saísse idêntico, e a
  tela mentia sobre uma compilação bem-sucedida)*
- ✅ Abrir agente · pedir correção · revisar diff · aplicar *(#158 — **o modelo é dublê, a rota
  de aplicar não**: o que a §27 pede não é que o Ollama acerte, e sim que o gesto humano no meio
  funcione. O dublê ser recusado pelo servidor na primeira tentativa — `summary` faltando,
  `questionId` a mais — foi o schema `strict()` fazendo o trabalho dele)*
- ✅ A proposta chega **desmarcada** e "Aplicar seleção" nasce desligado *(§14.6, agora afirmado
  na tela e não só no domínio)*
- ✅ O editor recarrega quando o patch muda a questão por baixo dele *(#158 — bug achado pelo E2E:
  `router.refresh()` trazia o DTO novo, mas o editor semeia o estado **no mount**, então o texto
  na tela continuava o de antes e quem seguisse digitando editaria sobre uma base que já mudou. A
  `key` passou a levar a versão do servidor, que **não** muda a cada autosave — fosse assim, o
  Monaco perderia o cursor no meio da frase)*
- ✅ Render novamente *(#156 — é justamente a segunda compilação que quebrava)*
- ✅ **Salvar duas vezes seguidas** *(#166 — achado ao consertar a #156, e maior que ela: todo
  salvamento deixava o cliente com a versão vencida, e o seguinte batia em 409 com "conflito · o
  autosave está pausado". Um salvamento por carregamento de página. A validação gravava
  `validationStatus` depois da resposta ter saído, e o `@updatedAt` avançava o token de
  concorrência. Derivado não é uma versão nova da questão — agora ela grava a **mesma** versão,
  condicionada a ela)*

> Deploy em produção **não** faz parte deste plano. A prova de viabilidade é a Fase 6.5.

---

## 8. Fronteiras de provider *(auditoria §36)*

Checklist arquitetural. Verificar a cada fase, não só na Fase 0.

- ✅ Domain não importa Prisma
- ✅ Domain não importa Vercel
- ✅ Domain não importa SDK de storage
- ✅ Domain não importa Node filesystem
- ✅ Renderer não conhece storage, banco, `Workspace` nem Prisma *(Fase 6 — teste de fronteira sobre
  o código, e a única dependência do `package.json` do worker é o contrato)*
- ✅ Domain não executa `pdflatex`
- ✅ Domain não importa SDK de IA
- ✅ Components não conhecem implementação concreta de storage *(Server Components recebem DTO)*
- ✅ Storage usa `storageKey`
- ✅ Asset possui hash
- ✅ Source original é preservado *(Fase 14 — não existe caminho de escrita sobre a fonte, e a
  `storageKey` contém o hash: mudar o conteúdo mudaria a chave)*
- ✅ Crop guarda `SourceAnchor` *(Fase 14 — bbox normalizada 0..1, e o mesmo recorte reconstruído
  em 72, 150 e 300 DPI)*
- ✅ Bounding boxes são normalizadas *(schema)*
- ✅ **PostGIS não existe no projeto**

**Critério de sucesso arquitetural** *(auditoria §47)* — este código não pode saber onde executa:

```ts
const publication = await publicationRepository.get(id);
const asset       = await storageProvider.get(assetId);
const result      = await renderExecutor.render(request);
```

- ✅ Verdadeiro para SQLite + `LocalFileStorage` + renderer Docker local *(os três estão de pé desde
  a Fase 6, e o caminho da questão passa pelos três sem nenhum `if` de ambiente)*
- [ ] Verdadeiro para PostgreSQL + object storage + mesmo renderer remoto *(a Fase 6.5 provou o
  schema e parou no storage, que depende da decisão do Chico)*

**Áreas que a versão cloud não pode exigir reescrever** *(auditoria §49)*

- ◐ `Question` · `QuestionOption` · `DocumentNode` · `Publication` · `Asset` · `SourceAnchor`
  *(o spike traduziu o schema em 3 ajustes sem tocar no domínio; afirmar exige a suíte nos dois motores)*
- ◐ `QuestionTypePlugin` · Validation · Randomization · Assessment · Agent Patch · Revision
  *(nenhum deles conhece o provider — mas quem prova isso é a suíte rodando nos dois, que falta)*

---

## 9. Higiene de portas *(D19)*

Verificar sempre que uma nova dependência de infraestrutura entrar.

- ✅ Nenhum serviço do projeto usa porta padrão conhecida (3000, 5432, 6379, 8080)
- ✅ Todas as portas do projeto estão no bloco `28xxx`
- ✅ Todas as portas estão abaixo de 32768 (fora da faixa efêmera do kernel)
- ✅ Varredura de conflito refeita antes de adicionar qualquer serviço novo
- ✅ Portas documentadas no README

| Porta | Serviço |
|---:|---|
| `28080` | Next.js (dev) |
| `28900` | Worker/API de render LaTeX (Docker) |
| `28432` | PostgreSQL em Docker — **apenas Fase 6.5** |
| `28001` | Prisma Studio |
| `28379` | Redis (reservado) |
| `28025` | Mailpit (reservado) |

---

## 10. Checklist de aceite do MVP *(spec §33)*

### Aplicação
- ✅ Sobe com `bun run dev`
- ✅ Setup local documentado
- ✅ SQLite criado automaticamente pelo `bun run setup` *(D24)*
- ✅ Nenhuma dependência do WPF em runtime
- [ ] UI premium e estável *(o aceite é do Chico — §11 deste documento)*

### Árvore
- ✅ Cria filho
- ✅ Cria irmão
- ✅ Renomeia
- ✅ Move
- ✅ Reordena
- ✅ Não permite ciclos *(409, com teste em qualquer profundidade)*
- ✅ Estado persiste

### Questão *(fechada na auditoria de 2026-08-10 — o bloco estava aberto contra a Fase 7 inteira)*
- ✅ Discursiva *(plugin, sem `randomize`: não há o que embaralhar)*
- ✅ Múltipla escolha
- ✅ Alternativas arbitrárias *(o legado fixava cinco)*
- ✅ Correta por UUID *(nunca por letra — D9)*
- ✅ Tags *(normalizadas: três grafias continuam sendo uma linha)*
- ✅ Dificuldade *(escala legada 0/2/5/7/10)*
- ✅ Banca
- ✅ Instituição
- ✅ Cargo
- ✅ Ano *(recusado quando tem erro de digitação, nunca corrigido)*

### Monaco
- ✅ Highlight LaTeX *(Monarch, com a ordem das regras testada)*
- ✅ Autocomplete *(652 itens do acervo legado)*
- ✅ Snippets *(348 com ponto de parada)*
- ✅ Atalhos *(`Ctrl+S`, `Ctrl+Enter`, `Ctrl+Space`)*
- ✅ Autosave *(debounce de 1,2 s; provado na tela pelo E2E)*
- ✅ Dirty state *(não salvo · salvando · salvo · conflito · erro)*
- ✅ Diagnostics *(#161 — sublinhados no Monaco, com a mensagem no hover, e clicáveis dos dois
  lados: da lista para o editor)*

### Preview
- ✅ HTML rápido *(Fase 5)*
- ✅ MathJax *(pacote local, nunca CDN)*
- ✅ `Ctrl+Enter` *(registrado no editor, não numa escuta de janela)*
- ✅ PDF *(Fase 6)*
- ✅ PNG
- ✅ Log
- ✅ Cache *(por content hash; medido — 1159 ms contra 46 ms)*

### Agente *(fechado na auditoria de 2026-08-10 — a Wave C inteira estava aberta aqui)*
- ✅ Painel flutuante *(no `aside`, nasce fechado)*
- ✅ Endpoint OpenAI-compatible (OpenRouter/OpenAI) *(adaptado por D3)*
- ✅ Ollama *(verificado contra os 13 modelos da máquina)*
- ✅ Contexto da questão *(o id não é parâmetro de tool: o servidor o vincula)*
- ✅ Diagnostics disponíveis como tool *(`get_render_diagnostics`)*
- ✅ Propõe patch *(cinco tools `propose_*`, com whitelist versionada)*
- ✅ Diff *(por campo; Monaco no LaTeX, lado a lado no texto curto)*
- ✅ Candidate render *(isolado — sem `RenderJob`, sem storage)*
- ✅ Aprovação explícita *(lista vazia é erro, não "aplicar tudo")*
- ✅ Revision *(criada antes de aplicar, na mesma transação)*
- ✅ Rollback *(o snapshot vem do banco, nunca do corpo da requisição)*

### Assets
- ✅ Upload *(file picker e drag-and-drop)*
- ✅ Paste *(`Ctrl+V` só quando a tela pede; colar texto continua indo ao editor)*
- ✅ Crop *(retângulo desenhado e ajustado no PDF; bbox normalizada)*
- ✅ Source preservado *(o `SOURCE_PDF` não tem caminho de escrita)*
- ✅ Inserir imagem em LaTeX *(#173 — o gesto está na aba Origem: "inserir como figura" monta o
  snippet no cursor, com o nome que a rota de render usa para gravar o arquivo no diretório do job.
  A linha equivalente da Fase 14 foi fechada lá e esta ficou para trás — é a mesma inconsistência
  que a auditoria da #162 encontrou nas seções cruzadas)*

### Legado — ✅ *correção de 2026-08-31: o acervo está acessível desde sempre — a premissa de
"não está nesta máquina" estava errada (ver §2.10). As 11 bibliotecas foram lidas, mapeadas e
escritas de verdade no banco de desenvolvimento.*
- ✅ Dry-run *(`dry-run-legacy-import.ts`)*
- ✅ Import Publication *(8 publicações reais, com título/ISBN/UUID do próprio arquivo legado)*
- ✅ Import árvore *(281 nós — capítulo/seção/questão, com `sortKey` fracionário e numeração)*
- ✅ Import questões *(225 questões)*
- ✅ Import alternativas e correta *(1100 alternativas, gabarito preservado)*
- ✅ Import metadata *(banca/instituição/cargo/ano entram quando existem; editora e tags de
  conhecimento checadas e confirmadas vazias em todo o acervo — nada para mapear)*
- ✅ Import snippets LaTeX *(enunciado, resposta, complemento e origem — `latexQuestao`,
  `latexResposta`, `latexComplemento`, `latexOrigin`)*
- ✅ Relatório *(console do script: publicações, exclusões por invariante com motivo e legacyId,
  contagem final — falta só o formato `ImportReport` estruturado, hoje é texto)*

### Portabilidade *(novo, D18/D32)*
- ✅ Exporta workspace em `.lbb`
- ✅ Importa `.lbb` *(com dry-run antes de gravar, sempre)*
- ✅ Round-trip preserva identidade *(verificado contra o banco real)*
- ✅ Backup recorrente produz `.lbb` restaurável *(um arquivo do backup automático passa pelo
  mesmo round-trip)*

---

## 11. Checklist visual *(spec §34)*

> **Este bloco é do Chico.** O que tem prova de máquina está fechado abaixo; o resto é olho, e
> marcar por dedução seria justamente o erro que a auditoria de 2026-08-10 foi corrigir.

- [ ] Nenhum painel parece "CRUD de sistema interno de 2014"
- [ ] A árvore tem densidade próxima de IDE
- [ ] Editor domina visualmente o centro
- [ ] Preview é legível sem abrir modal
- [ ] Agente não rouba espaço quando fechado
- [ ] Botão do agente é reconhecível e discreto
- ✅ Resize não quebra layout *(#197 — E2E encolhendo a janela de 1920 para 1366 sem recarregar)*
- ✅ 1366×768 continua utilizável *(#197 — sem transbordo, inclusive com o painel do agente aberto)*
- [ ] 1920×1080 fica excelente
- ✅ Dark mode coerente *(teste cobre todo token de cor do tema claro)*
- [ ] Focus ring correto
- ✅ Atalhos não conflitam com Monaco *(#179 — cinco afirmações num E2E, com controle: a paleta
  abre com o editor **e** com a árvore focados)*
- ✅ Loading nunca congela a UI *(o preview mantém o conteúdo anterior esmaecido; o render fica
  pendurado 8 s no E2E e a digitação segue salvando)*
- ✅ Render mostra progresso *(texto, não roda girando: roda não diz se travou)*
- ✅ Erro de TeX é apresentado como diagnóstico, não como stack trace cru *(linha + mensagem; o
  caminho do diretório temporário não vaza)*
- ✅ Empty states explicam a próxima ação *(#197 — os seis foram lidos um a um, e um deles dizia
  "Capítulos e seções ganham conteúdo próprio no editor, **na Fase 3**": número de fase do
  planejamento na cara de quem usa, prometendo um futuro que chegou faz tempo. Quem lê não tem o
  planejamento. Reescrito para dizer o que fazer agora, com guarda varrendo `title`, `description`,
  `label` e `placeholder` atrás do mesmo jargão)*

---

## 12. Checklist do painel agêntico *(spec §35)*

> Auditado item a item em 2026-08-10. Estava inteiro aberto contra as Fases 8, 9 e 10 fechadas —
> cada linha aqui aponta para onde a prova mora.

- ✅ O modelo sabe exatamente qual questão está aberta *(o id **não** é parâmetro de tool; contra o
  Ollama real o modelo inventou três uuids numa conversa só, e foi isso que mudou o desenho)*
- ✅ Seleção do Monaco pode ser anexada *(por gesto, e visível na barra de contexto)*
- ✅ O usuário vê o provider e o modelo
- ✅ O modelo não recebe secrets *(`ai-key-boundary.test.ts` percorre o grafo de imports de cada
  `"use client"`; achou um vazamento real no caminho)*
- ✅ Tools são definidas pelo servidor, nunca pelo modelo
- ✅ Tool inputs são validados *(schema fechado, antes de tocar a porta)*
- ✅ Tool outputs têm limite *(8k, truncando com marca)*
- ✅ O agente não possui tool de SQL arbitrário *(guarda varre o módulo)*
- ✅ O agente não possui tool de shell arbitrário *(idem)*
- ✅ O agente não altera o banco sem aprovação *(a porta de leitura não tem verbo de escrita, e o
  lint de boundary recusa persistência dentro de `modules/agents/`)*
- ✅ Candidate render é isolado *(executor direto — sem `RenderJob`, sem storage, teto de 3 por turno)*
- ✅ Retry é limitado *(teto de iterações por modo, e cada chamada leva o prazo restante)*
- ✅ Todas as tentativas são auditadas *(`ToolCallCard` na tela, `AgentRun` imutável no banco)*
- ✅ Antes e depois podem ser comparados *(diff por campo, e render antes/depois sob demanda)*
- ✅ Patch parcial pode ser aprovado *(o plano é recalculado do estado corrente, não aceito da tela)*
- ✅ Patch pode ser rejeitado *(não aplicar é o default)*
- ✅ Aplicação gera revisão *(criada **antes**, na mesma transação)*
- ✅ Revisão pode ser restaurada *(devolve o estado exato — acento, `\\` e gabarito)*
- ✅ Falha do provider não perde edição do usuário *(a pergunta fica na tela; o turno é que falha)*
- ✅ Ollama offline não impede o uso normal do app *(503 com instrução; a tela segue)*
- ✅ Provider sem API key mostra instrução clara

---

## 13. Segurança *(spec §24, adaptada à nova topologia)*

> Auditado em 2026-08-10. As dezenove linhas estavam abertas, e **todas** já tinham guarda ou
> teste em alguma fase — o que faltava era o cruzamento. Onde a prova é um guarda que varre o
> repositório, ele foi conferido contra uma violação deliberada.

- ✅ Secrets somente em `.env.local` *(guarda varre o repositório atrás de chave, token e senha em
  URL; outro exige que o `.env.example` não tenha valor de verdade)*
- ✅ API key nunca exposta ao browser *(grafo de imports de cada `"use client"`)*
- ✅ Paths sanitizados *(4 formatos de escape testados)*
- ✅ Nenhum path de usuário escapa do workspace *(e a recusa devolve 400 com o motivo, não 500 opaco)*
- ✅ Chaves de storage prefixadas por `workspaceId`, sem escape
- ✅ MIME e extensão validados *(a discordância entre os dois é recusada)*
- ✅ Upload limitado
- ✅ Hash de conteúdo usado *(sha256 é a identidade — D29)*
- ✅ Nenhum shell montado por concatenação de string *(`execFile` com vetor de argumentos; sem
  shell no caminho não há o que escapar)*
- ✅ Tempo de compilação limitado *(no contrato e no `execFile`; o timeout mata o processo e vira
  diagnóstico)*
- ✅ Shell escape bloqueado no LaTeX *(duas camadas: `-no-shell-escape` explícito e `\write18`
  recusado antes de tocar o disco)*
- ✅ Filesystem efêmero nunca usado como storage persistente *(auditoria §23 — o worker é
  `read_only` + `tmpfs`, e quem persiste é a aplicação, pelo `StorageProvider`)*
- ✅ Container do worker sem rede de saída *(rede `internal: true`; `fetch` de dentro falha, e o
  `/health` pelo ingresso responde 200)*
- ✅ Segredo compartilhado do worker fora do repositório e rotacionável *(vem de `RENDERER_SECRET`,
  e o worker **recusa subir** sem ele)*
- ✅ Ação agêntica registrada *(`AgentRun` imutável; prompt completo fora do log por padrão)*
- ✅ Nenhuma tool arbitrária vinda do modelo
- ✅ Todo patch do agente validado antes de apresentar e de aplicar *(Zod com whitelist versionada)*
- ✅ Patch aplicado dentro de transação
- ✅ Revisão anterior criada antes de mudanças agênticas *(na mesma transação — meia aplicação
  sem revisão seria uma mudança que ninguém desfaz)*

---

## 14. Definition of Done — por fase *(spec §28)*

Aplicar integralmente ao fim de **cada** fase, antes do checkpoint humano.

Estado ao fim da **Fase 0**:

- ✅ Requisitos funcionais implementados
- ✅ TypeScript sem `any` injustificado
- ✅ Lint passa
- ✅ Typecheck passa
- ✅ Testes relevantes adicionados *(94)*
- ✅ Erro tratado
- [ ] Loading state tratado *(não há UI assíncrona ainda)*
- [ ] Empty state tratado *(idem)*
- [ ] Acessibilidade básica *(Fase 1)*
- [ ] Teclado testado quando aplicável *(Fase 1)*
- [ ] Dark e light testados quando aplicável *(Fase 1)*
- ✅ Nenhuma secret no repositório
- ✅ Nenhuma dependência circular intencional
- ✅ Documentação atualizada
- ✅ Critério de aceite demonstrável

Estado **hoje** — os cinco que a Fase 0 não tinha como fechar:

- ✅ Loading state tratado *(render, preview, agente e árvore têm estado de carregamento visível)*
- ✅ Empty state tratado *(`EmptyState` no DS, usado onde a lista pode vir vazia)*
- ✅ Acessibilidade básica *(papéis ARIA na árvore, nas abas, nos chips e no radio das alternativas)*
- ✅ Teclado testado *(divisória, árvore, paleta, palette de símbolos — e o E2E chega à questão
  **só** por teclado)*
- ✅ Dark e light testados *(teste exige que o dark cubra todo token de cor do claro)*

---

## 15. Regras invioláveis *(spec §42)*

Verificar em toda revisão de fase:

- ✅ O agente não é um chat desacoplado do domínio *(tools do servidor, contexto por gesto, patch
  com whitelist — ele não tem outra forma de agir)*
- ✅ O renderer não está dentro de componente React *(contêiner separado, e o lint de boundary
  recusa `child_process` no domínio)*
- ✅ Prisma não é chamado no client
- ✅ Nenhum XAML foi portado
- ✅ Semântica e dados preservados, não a estrutura interna do código antigo *(a Fase 4 importou o
  conhecimento sem portar a estrutura; o mapeamento da 11 ignora `Ordem`, `IsExpanded` e
  `Questao.Correta` de propósito. A conferência contra o acervo é da Fase 11)*
- ✅ Todo novo tipo de questão entra pelo registry *(guard varre `src/` e `app/` atrás de `switch`
  sobre tipo de questão — e, desde a #165, **também para compilar**: um teste registra um tipo de
  mentira com corpo inconfundível e afirma que ele chega ao bundle. Até então a regra valia para
  validar e para o preview, e não valia para o PDF)*
- ✅ Toda randomização é reproduzível *(dois processos `bun` separados, mesma seed, 1695 bytes
  idênticos)*
- ✅ Toda modificação agêntica é reversível *(revisão anterior gravada antes, na mesma transação)*
- ✅ Toda fonte original é preservada *(não há caminho de escrita sobre o `SOURCE_PDF`)*
- [ ] `legacyId` nunca apagado após o import *(a coluna existe e a duplicação de subárvore já não a
  herda; afirmar exige o import da Fase 11, que depende do acervo)*
- ✅ PNG nunca usado como fonte da questão *(o `preview.png` do legado é recusado na classificação,
  com controle positivo; e o recorte reconhecido vira LaTeX revisado por gente, não imagem)*
- ✅ Letra de alternativa nunca tratada como identidade *(schema + teste de projeção)*
- ✅ LaTeX nunca executado de forma insegura *(vetor de argumentos, sem shell; `-no-shell-escape`
  explícito, `\write18` recusado no contrato, diretório temporário por job, timeout, contêiner sem
  rede e sem privilégio)*
- ✅ Batch agent não implementado antes de aprovação e revisão funcionarem *(não existe batch
  agent; aprovação seletiva e reversão estão de pé desde a Fase 9)*
- ✅ Erro de compilação nunca escondido *(diagnóstico com linha, log cru inteiro na aba, e o corte
  do log é **pelo meio** para não perder a linha fatal)*
- ✅ Experiência de teclado nunca sacrificada *(árvore, divisória, paleta, chips e alternativas
  operáveis sem mouse — e o E2E chega à questão só por teclado)*
- ✅ PostGIS nunca entra no projeto
- ✅ Nenhum binário armazenado como BLOB no banco
- ✅ `SOURCE_PDF` nunca substituído por derivado *(D29)*
- ✅ Asset fonte tratado como imutável *(a `storageKey` contém o hash: outro conteúdo é outra chave)*
- ✅ Bounding box sempre normalizada
- ✅ Abstração criada apenas onde há múltiplas implementações reais

---

## 16. Confronto com o `_planejamento.md` *(2026-08-10)*

Revisão fase a fase do plano contra este checklist, procurando **o que o plano pede e o checklist
não registra**. Foi o inverso da auditoria anterior, que procurava trabalho feito e não marcado.

**Nada do plano está ausente daqui.** As 19 fases têm bloco correspondente, e os aceites de cada
uma aparecem como item marcável. O que a revisão achou foram quatro **divergências**, que agora
estão escritas onde alguém vai procurá-las:

| O que o plano pede | O que existe | Por quê |
|---|---|---|
| `data.sqlite` dentro do `.lbb` (§7, e a tabela de riscos) | **`data.json`** | Um banco dentro do zip traria o motor junto, e o formato herdaria as versões dele. O que a §7 queria garantir — que o portable não seja o schema de runtime — o `PortableSchema` já garante. Registrado na Fase 13 |
| Virtualização da árvore "antes de existir volume" (Fase 2) | **adiada** | A maior publicação tem 297 nós e o próprio plano classifica o risco como **baixo**. Otimizar antes de medir custaria rolagem, foco e teclado por um problema que talvez não exista |
| Migradores de formato `v1 → v2` (Fase 13) | **não existem** | O plano diz "quando fizer sentido"; com uma versão só, não faz. É escopo futuro, não dívida |
| `LatexBuilder` alimentado pelo `QuestionTypePlugin` (Fase 6) | ✅ **resolvido na #165** | Era dívida de verdade, e a única das quatro. O `buildLatex` do plugin nunca tinha sido chamado; agora o plugin devolve blocos e é ele quem monta o corpo, com o mapa de linhas saindo junto |

E duas linhas do critério de produto local (§48) foram fechadas na revisão, por já terem prova:
**IA local funciona** (Ollama, verificado em três fases) e **ferramentas TeX locais funcionam** (o
contêiner desta máquina, sem rede de saída). As outras duas do bloco continuam abertas e **presas
ao acervo**, não a código — a nota de cada uma agora diz isso.

> O `_planejamento.md` **não foi alterado**. Ele é o registro do que se decidiu antes de começar;
> onde a execução divergiu, quem conta é este documento, com o motivo ao lado. Um plano reescrito
> para casar com o resultado deixa de ser plano e vira relatório.

---

## 17. Beta Editorial *(2026-08-11)*

O design final foi aprovado no Claude Design e virou software. A matriz Design → Código, o
progresso por slice, os gaps P1/P2 e as limitações declaradas vivem em
[`beta-editorial.md`](beta-editorial.md); a decisão do Calibre, em
[`calibre-spike.md`](calibre-spike.md). Aqui fica só o que este checklist tinha em aberto e o Beta
fechou:

- ✅ **Criar biblioteca dentro do produto.** Era seed ou import legado; a Home falava de um
  workspace `demo` que ninguém tinha pedido.
- ✅ **Cadastrar livro à mão.** O repositório de publicação era somente leitura.
- ✅ **Criar questão como operação única.** Uma questão só nascia como `DocumentNode`; entre as
  duas chamadas a árvore ficava com um nó `QUESTION` sem `Question`.
- ✅ **Escolha simples, múltipla escolha e discursiva** com validação e semântica próprias.
- ✅ **A validação diz o motivo.** O selo `INVALID` era gravado em silêncio e a questão ficava
  vermelha sem explicar por quê.
- ✅ **Recorte revisado vira questão persistida**, com a origem e a execução do OCR guardadas.
- ✅ **Resultado da busca global navega** até a questão. Antes aparecia na lista e não abria.
- ✅ **Importar `.lbb` tem tela.** O endpoint existia desde a Fase 13 sem nenhuma.
- ✅ **E2E mestre do Beta**, do banco limpo à questão persistida, sem tocar no banco.
- ✅ **E2E de captura** com provider dublê e fixture sintética.

- ✅ **Calibre funcional** (Gate 3): adapter, wizard, contract test, E2E e importação verificada
  contra a biblioteca real do acervo — 64 livros, PDF de 2,7 MB copiado com capa e origem.
- ✅ **Lixeira com tela** (§33). `listDeleted` existia desde a Fase 2 e nenhuma tela a alcançava:
  dava para excluir e não dava para ver o que foi excluído.
- ✅ **Fila de captura** (§26), **sem tabela nova**: ela é a pergunta "quais recortes ainda não
  viraram questão?" sobre `SourceAnchor`, que já é durável.

Segue aberto, e por decisão: reconhecimento de questão completa, escolha de formato no Calibre,
importação em lote e import legado em volume. Os motivos estão em `beta-editorial.md` §5.
