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

**Progresso:** ✅ Fase 0 · ◐ Fase 1 (só o aceite visual) · ◐ Fase 2 · ◐ Fase 3 · ◐ Fase 4 · 1/19 fases concluídas
**Última atualização:** 2026-08-07 — Fase 1 fechada em código (falta o aceite visual); Fase 2
fechada em mecânica. **Fase 3 com o Monaco de pé** (#43, #45): edição, autosave e conflito
visível. **Fase 4 com o importador e o autocomplete de pé** (#47, #49): o conhecimento LaTeX do legado
está no banco — 652 autocompletes, 2.740 símbolos, 13 grupos, 28 menus, com as quatro contagens
fechando contra o levantamento — e os autocompletes já sugerem dentro do Monaco. Falta a palette
de símbolos.
324 testes · 23 PRs abertos, nada mergeado.

| Wave | Fases | Estado |
|---|---|---|
| A — fundação e IDE editorial | ✅0 · **◐1** · **◐2** · **◐3** · **◐4** · 5 · 6 | Fases 1–4 em andamento |
| — prova arquitetural | **6.5** | ☐ não iniciada |
| B — banco de questões | 7 | ☐ não iniciada |
| C — agente | 8 · 9 · 10 | ☐ não iniciada |
| D — acervo legado e portabilidade | 11 · 12 · 13 | ☐ não iniciada |
| E — ingestão visual | 14 · 15 | ☐ não iniciada |
| F — diferencial de produto | 16 · 17 | ☐ não iniciada |

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
- ⛔ Repositório GitLab `bqcf/bqcf.windows` inspecionado *(exige autenticação; não bloqueia nenhuma fase)*
- [ ] Parecer específico sobre D33/D34 *(suspensas; o parecer não as menciona)*
- [ ] Destino cloud dos assets escolhido quando for a hora: Vercel Blob × DO Spaces

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
- ✅ `Repository` — convenção por agregado documentada; `ConcurrencyConflictError` e `TransactionRunner` definidos
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
- ⛔ **Imagem do renderer buildável** — obrigatório *(`services/renderer` só existe na Fase 6)*
- ⛔ **Renderer inicia e `GET /health` responde** — obrigatório *(idem)*
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
- [ ] Utilizável em 1366×768 *(a aritmética fecha — rail 216 + árvore 280 + editor ≥ 420 com o aside fechado — mas falta olhar na tela)*
- [ ] Excelente em 1920×1080
- [ ] Redimensionar não quebra o layout
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
- [ ] Virtualização *(o acervo tem 297 nós na maior publicação; medir antes de otimizar)*

**Indicadores de estado** *(spec §4.1)* — `TreeNode.status` já aceita um `ArtifactStatus`;
falta o que produz o estado
- [ ] Conteúdo não salvo
- [ ] Erro de render
- [ ] Questão incompleta
- [ ] Questão validada
- [ ] Modificações agênticas pendentes

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
- [ ] Filtro por erro e incompleta *(depende dos indicadores — Fases 3 e 6 é que produzem o estado)*
- [ ] Atalhos não conflitam com o Monaco *(verificável na Fase 3)*

**Aceite da fase**
- ✅ §33 "Árvore" completo (§10 deste documento)
- ✅ Estado da árvore persiste entre sessões *(expandidos e nó corrente; nó excluído entre sessões cai no primeiro em vez de abrir vazio)*

---

### Fase 3 — Monaco e autosave

- ✅ Monaco como client component isolado, com dynamic import *(#45 — `ssr: false` **não é otimização**: `monaco-editor` toca `window` no topo do módulo e quebraria no SSR)*
- ✅ **Monaco servido localmente, nunca de CDN** *(o default do `@monaco-editor/react` é `jsdelivr`, e quebraria o §48 "roda com a internet desligada" — em silêncio)*
- ✅ Sem erro de hidratação *(o `loading` é o mesmo antes e depois; build e app rodando sem aviso)*
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
- ✅ Abas internas: Conteúdo, Resposta, Complemento — [ ] Metadados e Origem *(dependem da Fase 7 e da 14)*
- ✅ Autosave com debounce *(1,2 s; timer limpo na desmontagem)*
- ✅ `Ctrl+S` salva imediatamente *(handler por ref — senão congelaria a questão aberta na montagem)*
- ✅ Dirty state visível *(não salvo · salvando · salvo · conflito · erro)*
- ✅ **Conflito pausa o autosave** *(sem isso ele voltaria em 1,2 s e insistiria até vencer)*
- ✅ Concorrência otimista por `updatedAt` *(#43 — `updateMany` com a versão **na cláusula**, não checagem em código: é o que fecha a janela entre ler e gravar)*
- ✅ Conflito detectado e apresentado *(409 com os dois lados — esperado × encontrado)*
- ✅ **Conflito nunca sobrescreve em silêncio, com teste** *(spec §42; duas edições concorrentes, a segunda recusada, nada gravado)*
- ✅ Autosave sem alteração não grava *(dez disparos não movem o `updatedAt` — senão fabricaria conflito nas outras abas)*

**Aceite da fase**
- [ ] Editar, sair e voltar encontra o conteúdo salvo *(o ciclo salvar/recarregar foi exercitado pela API; falta digitar na tela)*
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
- [ ] Palette de símbolos agrupada
- [ ] Busca na palette
- [ ] Inserção no cursor

**Aceite da fase**
- ✅ Contagens do relatório conferem com as do levantamento *(653 · 13 · 2.741 · 29 — as quatro fecham, com a diferença explicada linha a linha)*
- [ ] Autocomplete e snippets funcionam com o acervo legado real *(depende do completion provider acima)*

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

### Fase 6 — Worker de render autoritativo *(D27, D35)*

**Contratos** *(D35)*
- [ ] `RenderBundle` definido (`jobId`, `sourceLatex`, `profile`, `assets`, `options`)
- [ ] `RenderResult` definido (`success`, `pdf`, `png`, `diagnostics`, `stdout`, `stderr`, `durationMs`)
- [ ] Mecanismo de transporte dos assets decidido e documentado (multipart · tar/zip · stream)
- [ ] Renderer recebe **apenas** `RenderBundle`
- [ ] Renderer retorna **apenas** `RenderResult`

**Isolamento do renderer** *(D35 — o ajuste que resolve a contradição do egress)*
- [ ] Renderer **não** importa `StorageProvider`
- [ ] Renderer **não** conhece Vercel Blob
- [ ] Renderer **não** conhece S3
- [ ] Renderer **não** conhece Prisma
- [ ] Renderer **não** conhece `Workspace`
- [ ] Renderer **não** acessa o banco
- [ ] Worker funciona **sem credencial de storage**
- [ ] Worker funciona **sem credencial de banco**
- [ ] Worker funciona **sem API key de IA**
- [ ] **A aplicação é quem persiste os artefatos** via `StorageProvider`

**Worker containerizado**
- [ ] `services/renderer` criado
- [ ] Dockerfile com Node + TeX Live + Poppler
- [ ] Imagem compila `tikz`, `pgfplots`, `siunitx`, `xlop`, `cancel`
- [ ] `docker compose` expõe o worker em `28900`
- [ ] Porta confirmada livre antes de subir
- [ ] `POST /render`
- [ ] `GET /render/:id`
- [ ] `GET /health` retorna `status`, `rendererVersion`, `pdfLatexVersion`, `pdfToCairoVersion`, `profileCount`
- [ ] Autenticação por segredo compartilhado
- [ ] Segredo nunca no repositório
- [ ] **Sem rede de saída**
- [ ] Limite de CPU
- [ ] Limite de memória
- [ ] Timeout por job
- [ ] Filesystem efêmero
- [ ] **A imagem é a mesma que irá para o droplet** — sem variante "de desenvolvimento"

**Compilação**
- [ ] `pdflatex` via `execFile`/`spawn` com argumentos — nunca string de shell
- [ ] Diretório temporário por job
- [ ] `shell-escape` bloqueado
- [ ] stdout, stderr e exit code capturados
- [ ] `pdftocairo` gera PNG
- [ ] DPI configurável

**Profiles**
- [ ] `LatexProfile` com documentclass, packages, macros, engine e defaults
- [ ] Profile "Legacy Compatibility" a partir de `latex-includes.tex`
- [ ] `LatexBuilder` alimentado pelo `QuestionTypePlugin`
- [ ] Template e preamble aplicados
- [ ] Assets referenciados corretamente

**Lado da aplicação**
- [ ] `RenderExecutor` implementado como `RenderWorkerExecutor`
- [ ] `baseURL` configurável por ambiente — única diferença entre local e droplet
- [ ] Nenhum módulo editorial chama a compilação diretamente
- [ ] Aplicação grava `pdf` e `png` do `RenderResult` via `StorageProvider`
- [ ] `RenderJob` persistido
- [ ] API de criação, status e resultado
- [ ] Content hash cobre conteúdo, profile, template, preamble, assets, engine, parâmetros e versão do renderer
- [ ] Cache hit retorna artefato anterior e marca `cacheHit`
- [ ] Invalidação por versão do renderer
- [ ] Render pendente é cancelado quando ainda não iniciou
- [ ] Render intermediário é descartado
- [ ] Estado final converge para o último pedido, com teste
- [ ] Worker indisponível degrada com mensagem clara, sem perder edição
- [ ] `RenderArtifact` pode ser descartado e reconstruído *(auditoria §41)*
- [ ] `preview.png` nunca vira conteúdo canônico

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

**Otimização** *(auditoria §21 — medir, não assumir)*
- [ ] Tempo base medido e registrado
- [ ] Preâmbulo pré-compilado (`mylatexformat`) embutido na imagem
- [ ] Ganho registrado com número antes × depois

**Aceite da fase**
- [ ] `docker compose up` sobe o worker e a app conversa com ele
- [ ] Render autoritativo nunca trava a edição
- [ ] Cache hit demonstrado com medição
- [ ] **O worker roda sem nenhuma credencial e sem rede de saída**

---

### Fase 6.5 — Cloud Compatibility Spike *(D30)*

> Objetivo único: provar que **banco e storage** trocam de implementação sem reescrever domínio e
> use cases. **Render está fora do escopo** — já foi provado na Fase 6. Terminada a fase,
> **voltar ao desenvolvimento local**.

**Ambiente experimental (efêmero)**
- [ ] Neon PostgreSQL provisionado
- [ ] Vercel Blob provisionado
- [ ] PostgreSQL em Docker `28432` para rodar a suíte localmente
- [ ] Ambiente principal permaneceu local e intocado
- [ ] Tudo derrubado ao fim, mantendo só o relatório

**Os dois pares**
- [ ] `SQLite ↕ PostgreSQL` testado
- [ ] `LocalFileStorage ↕ Vercel Blob` testado

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

**Entregável: `Cloud Compatibility Report`** *(auditoria §32)*
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
- [ ] §33 "Questão" completo (§10 deste documento)

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
- [ ] §35 completo (§12 deste documento)
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

## Wave D — acervo legado e portabilidade

### Fase 11 — Importação do legado *(roda localmente — auditoria §43)*

**Escopo do scanner** *(§2.10)*
- [ ] Detecta bibliotecas a partir de `padrao.knowchicoconfig`
- [ ] `ITA/Material` (3,2 GB) explicitamente ignorado
- [ ] `Listas/` (327 MB, repos git de terceiros) explicitamente ignorado
- [ ] O relatório declara o que foi ignorado e por quê
- [ ] Importador tem acesso direto ao filesystem — nenhum upload exigido para começar

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
- [ ] Gravados via `LocalFileStorageProvider`
- [ ] `sha256` calculado por arquivo
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
- [ ] §33 "Legado" completo (§10 deste documento)

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
- [ ] Avaliação do FTS5 do SQLite
- [ ] Benchmark executado sobre o acervo importado
- [ ] Decisão documentada com números
- [ ] `QuestionSearchService` permanece agnóstico — o full-text do PostgreSQL pode substituir sem tocar em use case

---

### Fase 13 — Portabilidade `.lbb` *(D18, D32, D36, D37)*

**Portable Schema versionado** *(D37)*
- [ ] `PortableSchema` definido, **próprio e versionado**
- [ ] **Não depende diretamente da migration atual do Prisma**
- [ ] Export faz projeção **runtime → portable**
- [ ] Import faz projeção **portable → runtime**
- [ ] Migradores de formato previstos (`LBB v1 → v2 → runtime atual`)
- [ ] `formatVersion` declarado no `manifest.json`
- [ ] Versão desconhecida é recusada com mensagem clara — **nunca adivinhada**

**Formato**
- [ ] Módulo `portability` criado
- [ ] `PortableArchiveWriter` implementado
- [ ] `PortableArchiveReader` implementado
- [ ] `manifest.json` com `formatVersion`, workspace, contagens, data e checksums
- [ ] Assets em `assets/<sha256[0:2]>/<sha256>.<ext>`
- [ ] `data.sqlite` referencia assets por `sha256`, nunca por path
- [ ] Independência de path garantida

**Exportação**
- [ ] Exporta um workspace inteiro
- [ ] Assets duplicados aparecem uma única vez no zip
- [ ] Checksums calculados e gravados
- [ ] Progresso visível para acervos grandes
- [ ] UI de exportação

**Importação**
- [ ] Verifica `formatVersion`
- [ ] Verifica checksums e recusa arquivo corrompido
- [ ] Religa assets ao `StorageProvider` de destino
- [ ] Colisão de `legacyId`/`uuid` gera relatório e exige decisão
- [ ] **Nada é sobrescrito em silêncio**
- [ ] Relatório de importação
- [ ] UI de importação

**Backup recorrente** *(D32, corrigida por D36)*
- [ ] **Backup não roda dentro do processo do renderer**
- [ ] `services/backup` é processo/container próprio
- [ ] **Backup reutiliza o mesmo `PortableArchiveWriter`** da exportação
- [ ] Nenhum formato de restauração paralelo
- [ ] Frequência configurável
- [ ] Retenção configurável
- [ ] Destino configurável
- [ ] Falha de backup fica visível na página de diagnóstico, nunca em silêncio
- [ ] Último backup bem-sucedido registrado com data e tamanho

**Aceite da fase**
- [ ] **Round-trip exercitando as duas projeções:** exportar um workspace, importar num vazio e comparar dá identidade
- [ ] **Um arquivo produzido pelo backup automático passa pelo mesmo teste de round-trip**
- [ ] Arquivo de versão futura é recusado com mensagem clara
- [ ] Arquivo corrompido é recusado com mensagem clara
- [ ] Teste de round-trip incluído na suíte e ligado a qualquer mudança de schema

---

## Wave E — ingestão visual

### Fase 14 — Assets, PDF e crop

**Ingestão**
- [ ] Upload por file picker
- [ ] Drag-and-drop
- [ ] `Ctrl+V` de imagem
- [ ] sha256 do conteúdo
- [ ] MIME e extensão validados
- [ ] Limite de upload
- [ ] Metadata (tamanho, dimensões, filename original)
- [ ] Nenhuma chave de storage escapa do prefixo do workspace, com teste
- [ ] Inserção assistida de figura: width, height, caption, label
- [ ] Snippet `figure/includegraphics` gerado

**PDF e crop**
- [ ] Visualizador de PDF com páginas
- [ ] Zoom
- [ ] Navegação
- [ ] Desenhar retângulo de crop
- [ ] Ajustar o retângulo
- [ ] Salvar crop
- [ ] `SourceAnchor` criado com `pageNumber` e bbox **normalizada 0..1** *(D28)*
- [ ] Nenhuma coordenada absoluta persistida
- [ ] Crop reconstruível a partir de PDF + página + bbox, com teste
- [ ] `rotation` suportado quando aplicável
- [ ] `Asset(CROP)` criado
- [ ] Imagem original preservada
- [ ] `SOURCE_PDF` nunca substituído por OCR, PNG, crop ou texto extraído *(D29)*
- [ ] Asset fonte é imutável: arquivo alterado gera novo Asset
- [ ] Cadeia de proveniência navegável: Question → SourceAnchor → fonte → page+bbox → CROP
- [ ] Opções após o crop: inserir como imagem, reconhecer matemática, reconhecer texto, anexar como referência

**Aceite da fase**
- [ ] §33 "Assets" completo (§10 deste documento)
- [ ] "Voltar à origem" funciona a partir de uma questão

---

### Fase 15 — Reconhecimento matemático

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

### Fase 16 — Avaliações e variantes

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

### Fase 17 — Endurecimento

**Diagnóstico** *(spec §25)*
- [ ] Versão do app
- [ ] Path do SQLite
- [ ] Storage ativo e sanidade
- [ ] **Saúde do worker consultada via `GET /health`**
- [ ] `rendererVersion` exibida
- [ ] `pdfLatexVersion` exibida
- [ ] `pdfToCairoVersion` exibida
- [ ] `profileCount` exibido
- [ ] TeX do host exibido como **fallback opcional**, não como dependência
- [ ] Último backup: data, tamanho e resultado *(D32/D36)*
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

**Segurança e autorização**
- [ ] `workspaceId` em todas as entidades relevantes
- [ ] Guard central de autorização, mesmo em single-user
- [ ] Secrets apenas em `.env.local`

**Revisão arquitetural final**
- [ ] Regras de boundary da §4.5 revisadas e verdes
- [ ] Nenhuma abstração cerimonial acrescentada além dos quatro contratos

**Critério de sucesso do produto local** *(auditoria §48)*
- [ ] O app roda ponta a ponta com a internet desligada
- [ ] Nenhuma configuração de infraestrutura hard-coded
- [ ] Biblioteca local grande é utilizável
- [ ] IA local funciona
- [ ] Ferramentas TeX locais funcionam
- [ ] Fontes gráficas complexas são preservadas e editáveis

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

> Deploy em produção **não** faz parte deste plano. A prova de viabilidade é a Fase 6.5.

---

## 8. Fronteiras de provider *(auditoria §36)*

Checklist arquitetural. Verificar a cada fase, não só na Fase 0.

- ✅ Domain não importa Prisma
- ✅ Domain não importa Vercel
- ✅ Domain não importa SDK de storage
- ✅ Domain não importa Node filesystem
- ⛔ Renderer não conhece storage, banco, `Workspace` nem Prisma *(D35 — `services/renderer` chega na Fase 6)*
- ✅ Domain não executa `pdflatex`
- ✅ Domain não importa SDK de IA
- ✅ Components não conhecem implementação concreta de storage *(Server Components recebem DTO)*
- ✅ Storage usa `storageKey`
- ✅ Asset possui hash
- [ ] Source original é preservado *(comportamento; verificável a partir da Fase 11)*
- [ ] Crop guarda `SourceAnchor` *(Fase 14)*
- ✅ Bounding boxes são normalizadas *(schema)*
- ✅ **PostGIS não existe no projeto**

**Critério de sucesso arquitetural** *(auditoria §47)* — este código não pode saber onde executa:

```ts
const publication = await publicationRepository.get(id);
const asset       = await storageProvider.get(assetId);
const result      = await renderExecutor.render(request);
```

- [ ] Verdadeiro para SQLite + `LocalFileStorage` + renderer Docker local *(repositories prontos; falta o renderer, Fase 6)*
- [ ] Verdadeiro para PostgreSQL + object storage + mesmo renderer remoto *(provado na Fase 6.5)*

**Áreas que a versão cloud não pode exigir reescrever** *(auditoria §49)*

- [ ] `Question` · `QuestionOption` · `DocumentNode` · `Publication` · `Asset` · `SourceAnchor`
- [ ] `QuestionTypePlugin` · Validation · Randomization · Assessment · Agent Patch · Revision

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
- [ ] UI premium e estável *(Fase 1)*

### Árvore
- ✅ Cria filho
- ✅ Cria irmão
- ✅ Renomeia
- ✅ Move
- ✅ Reordena
- ✅ Não permite ciclos *(409, com teste em qualquer profundidade)*
- ✅ Estado persiste

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

### Portabilidade *(novo, D18/D32)*
- [ ] Exporta workspace em `.lbb`
- [ ] Importa `.lbb`
- [ ] Round-trip preserva identidade
- [ ] Backup recorrente produz `.lbb` restaurável

---

## 11. Checklist visual *(spec §34)*

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

## 12. Checklist do painel agêntico *(spec §35)*

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

## 13. Segurança *(spec §24, adaptada à nova topologia)*

- [ ] Secrets somente em `.env.local`
- [ ] API key nunca exposta ao browser
- [ ] Paths sanitizados
- [ ] Nenhum path de usuário escapa do workspace
- [ ] Chaves de storage prefixadas por `workspaceId`, sem escape
- [ ] MIME e extensão validados
- [ ] Upload limitado
- [ ] Hash de conteúdo usado
- [ ] Nenhum shell montado por concatenação de string
- [ ] Tempo de compilação limitado
- [ ] Shell escape bloqueado no LaTeX
- [ ] Filesystem efêmero nunca usado como storage persistente *(auditoria §23)*
- [ ] Container do worker sem rede de saída
- [ ] Segredo compartilhado do worker fora do repositório e rotacionável
- [ ] Ação agêntica registrada
- [ ] Nenhuma tool arbitrária vinda do modelo
- [ ] Todo patch do agente validado antes de apresentar e de aplicar
- [ ] Patch aplicado dentro de transação
- [ ] Revisão anterior criada antes de mudanças agênticas

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

---

## 15. Regras invioláveis *(spec §42)*

Verificar em toda revisão de fase:

- [ ] O agente não é um chat desacoplado do domínio
- [ ] O renderer não está dentro de componente React
- ✅ Prisma não é chamado no client
- ✅ Nenhum XAML foi portado
- [ ] Semântica e dados preservados, não a estrutura interna do código antigo
- [ ] Todo novo tipo de questão entra pelo registry
- [ ] Toda randomização é reproduzível
- [ ] Toda modificação agêntica é reversível
- [ ] Toda fonte original é preservada
- [ ] `legacyId` nunca apagado após o import
- [ ] PNG nunca usado como fonte da questão
- ✅ Letra de alternativa nunca tratada como identidade *(schema + teste de projeção)*
- [ ] LaTeX nunca executado de forma insegura
- [ ] Batch agent não implementado antes de aprovação e revisão funcionarem
- [ ] Erro de compilação nunca escondido
- [ ] Experiência de teclado nunca sacrificada
- ✅ PostGIS nunca entra no projeto
- ✅ Nenhum binário armazenado como BLOB no banco
- [ ] `SOURCE_PDF` nunca substituído por derivado
- [ ] Asset fonte tratado como imutável
- ✅ Bounding box sempre normalizada
- ✅ Abstração criada apenas onde há múltiplas implementações reais
