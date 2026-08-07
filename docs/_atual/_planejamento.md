# LatexBookBank Web — Planejamento de Execução

> **Documento vivo.** Companheiro obrigatório de [`_checklist.md`](./_checklist.md).
> Origem: [`../prompts/LatexBookBank_Web_Especificacao_Mestra.md`](../prompts/LatexBookBank_Web_Especificacao_Mestra.md).
>
> **Data do levantamento:** 2026-08-07
> **Escopo aprovado:** Waves A–F. M8/SaaS entra apenas como preparação arquitetural.
> **Modo de execução:** Claude executa fase a fase, com checkpoint humano ao fim de cada fase.

---

## 1. Sumário executivo

O LatexBookBank Web reconstrói, como aplicação web local-first em TypeScript/Next.js, o produto
hoje existente como aplicativo WPF. O legado não é portado componente a componente: é tratado
como especificação executável e como acervo a ser preservado.

Três levantamentos feitos antes deste planejamento mudaram materialmente o plano em relação ao
que a especificação mestra assumia:

1. **O acervo legado já é SQLite.** A spec §16 assume um banco SQLite genérico; o repositório
   legado ainda contém arquivos SQL Server. Na prática, a migração para SQLite já aconteceu no
   legado (branch `010-Migrando-SQLLite`), e os dados vivos estão em 13 bancos `.knowchico`
   organizados como bibliotecas estilo Calibre. O SQL Server é legado morto.
2. **O pipeline de render foi validado na máquina alvo, antes de escrever código.** O preâmbulo
   legado completo compila limpo, e o maior risco técnico do projeto está retirado.
3. **Existe um design system pronto e maduro** (Edulingo DS Admin v1), que já implementa a maior
   parte do chrome do workbench que a spec descreve — incluindo as superfícies de IA governável.
   Isso substitui a stack de UI proposta na spec §5.2.

O plano resultante tem **17 fases**, cada uma dimensionada para caber em uma sessão de trabalho,
com critérios de aceite verificáveis por comando.

---

## 2. O que foi apurado

Esta seção registra evidências, não suposições. Cada item foi verificado na máquina.

### 2.1 Ambiente de execução

| Item | Estado | Consequência |
|---|---|---|
| Node.js | v24.16.0 | OK |
| pnpm | 10.34.1 | OK |
| TeX Live | 2023/Debian, `pdfTeX 3.141592653-2.6-1.40.25` | Render autoritativo viável no dia 1 |
| `pdftocairo` | 24.02.0 | OK |
| Docker | disponível | Disponível se precisarmos, não obrigatório |
| Ollama | rodando, 13 modelos | Desenvolvimento agêntico offline possível |
| Sistema de arquivos | `/mnt/d` é **ext4**, não DrvFs | Sem penalidade de I/O do WSL |

Pacotes LaTeX exigidos pelo legado, todos presentes: `tikz`, `pgfplots`, `siunitx`, `xlop`,
`cancel`, `amsmath`, `standalone`.

### 2.2 Validação empírica do pipeline de render

Compilação real do preâmbulo legado (`LatexRender5/latex-includes.tex`, 37 packages, incluindo
`abntex2cite`, `iwona`, `microtype`), com um documento exercitando `siunitx`, `xlop`, `cancel` e
`tikz`:

```
pdflatex   → exit 0, PDF de 63 KB   ·  2,1 s
pdftocairo → PNG de 21 KB a 150 DPI ·  0,26 s
```

**Interpretação.** O mockup da spec §4 exibe "Render 184 ms". O número real é ~2,4 s ponta a
ponta. Isso não invalida nada — ao contrário, confirma que fast preview, render assíncrono, cache
por content hash e coalescing são requisitos de usabilidade, não otimizações opcionais.

Abre também uma otimização que a spec não previu: **pré-compilar o preâmbulo** com
`mylatexformat`, gerando um `.fmt`. Preâmbulos pesados como este tipicamente caem para ~0,4 s.
Planejado na Fase 6 como tarefa medida, com número antes/depois registrado.

### 2.3 O acervo legado real

Localização: `/mnt/t/KnowChico/`. Organização estilo Calibre — cada pasta é uma **biblioteca**
com um banco SQLite próprio e pastas de assets por publicação.

```
<Biblioteca>/
├─ <nome>.knowchico              ← SQLite (WAL); nome varia por biblioteca
├─ pub0000000001/
│  ├─ cover.jpg
│  ├─ <Título>.detail.json
│  └─ idQuestion<N>/preview.png  ← CACHE de render, não conteúdo
└─ pub0000000002/…
```

O registro das bibliotecas fica em `padrao.knowchicoconfig` (tabela `BibliotecasKnowChicos`:
`IdBiblio`, `Name`, `PathFolder`, `MetadataFile`, `UltimoAcesso`).

**Volume total: 13 bibliotecas, 64 publicações, 297 nós, 1.247 alternativas.**

| Biblioteca | Pubs | Nós | Alternativas |
|---|---:|---:|---:|
| Cesgranrio CAIXA | 2 | 230 | 1.060 |
| Português | 1 | 20 | 48 |
| Fundamentos de Matemática Elementar | 3 | 13 | 7 |
| Matemática Financeira | 28 | 9 | 40 |
| ProfMat | 7 | 9 | 45 |
| Cálculo | 5 | 5 | 7 |
| Provas ENEM (antigo) | 2 | 5 | 20 |
| Livros Matemática (antigo) | 2 | 4 | 15 |
| Análise Elon | 13 | 2 | 5 |
| Pré-Cálculo | 1 | 0 | 0 |
| Inglês, Livros/Matemática, Provas/ENEM | 0 | 0 | 0 |

**Ativos de figura** encontrados na árvore, muito além do que a spec previu: 503 PDF, 350 PNG,
318 `gnuplot`, 316 `.table` (séries de dados gnuplot), 227 `.tex`, 211 EPS, 169 PGF, 127 SVG,
81 MD, 48 GeoGebra (`.ggb`), 46 JPG, 32 Asymptote (`.asy`), 30 `.fig`, 25 TpX (`.tpx`),
12 `.knd` (fragmentos de configuração LaTeX).

Estes são **fontes de figura**, não imagens finais. O modelo de `Asset` precisa de tipos que a
spec §8.7 não listou.

### 2.4 Semântica do schema legado — achados que mudam o mapeamento

Sete descobertas concretas, cada uma com consequência direta no importador:

1. **Nós estruturais e questões compartilham a mesma tabela**, distinguidos por sinal do
   `TipoQuestao`: negativos são estrutura, positivos são questão.

   | `TipoQuestao` | Nome | Ocorrências | → `NodeKind` |
   |---:|---|---:|---|
   | -10 | Capítulo | 21 | `CHAPTER` |
   | -9 | Seção | 23 | `SECTION` |
   | -8 | SubSeção | 1 | `SUBSECTION` |
   | -7 | SubSubSeção | 0 | `SUBSECTION` (profundidade pela árvore) |
   | -1 | Grupo de Questões | 17 | `QUESTION_GROUP` |
   | 1 | Discursiva | 5 | `QUESTION` |
   | 2 | 5 Alternativas | 230 | `QUESTION` |
   | 3–7 | V/F, Resolva, CESPE, Múltipla, Somatório | 0 | `QUESTION` (tipos previstos, sem dados) |

   Ou seja: **62 nós estruturais e 235 questões reais**. Os tipos 3–7 existem no vocabulário mas
   nunca foram usados — confirmam a lista da spec §9 sem exigir implementação imediata.

2. **`Ordem` é inutilizável.** Vale `0` em praticamente todas as linhas — há um pai com 59 filhos
   todos em `Ordem = 0`. A ordem real da árvore é a ordem de `IdQuestao` (inserção).
   *Um importador que confiasse em `Ordem` embaralharia o acervo inteiro em silêncio.*
   → O mapper ordena por `IdQuestao` dentro de cada pai e gera `sortKey` fracionário a partir daí.

3. **`Questao_Itens.Marcacao` guarda a letra** (`a`–`e`), exatamente o antipadrão que a spec §8.5
   quer eliminar. → Descartada como identidade; a letra passa a ser projeção de `sortKey`.
   O valor original é preservado em `legacyMarcacao` apenas para auditoria do import.

4. **`Questao.Correta` é vestigial** — vale `0` nas 297 linhas. A fonte de verdade do gabarito é
   `Questao_Itens.Correta`. → O mapper ignora o campo do nível da questão.

5. **A qualidade do gabarito é perfeita.** 230 alternativas marcadas como corretas para
   exatamente 230 questões de múltipla escolha: nenhuma questão sem gabarito, nenhuma com duas
   corretas. → O validador de import deve *afirmar* essa invariante e falhar ruidosamente se ela
   quebrar, em vez de assumi-la silenciosamente.

6. **Escalas divergem da intuição.** `Dificuldade` usa `0, 2, 5, 7, 10`
   (Muito Fácil → Muito Difícil), não 1–5. `Questoes_Numeracao` usa `0` (indo-arábica),
   `13` (romana), `27` (letras). → Ambas viram enums explícitos; a numeração é um campo de
   `DocumentNode` que a spec §8.3 não previu.

7. **`Numeracao_Original` (TEXT) guarda o rótulo original do livro** — valores como `I`, `1`,
   `II`, `6`. É informação editorial insubstituível. → Preservado como
   `DocumentNode.originalLabel`.

**Deriva de schema entre bibliotecas.** As bibliotecas não estão todas na mesma versão:

| Migration | Bibliotecas |
|---|---|
| `20240317152417_add_LatexComplemento` | 10 |
| `20221124021733_Questao_Imagens_Completa` | 2 (sem `TagConhecimento`) |
| sem tabela `__EFMigrationsHistory` | 2 |

→ O `LegacyReader` detecta a geração do schema por biblioteca e degrada campos ausentes, em vez
de assumir uma forma única.

**Campos sem uso, que não serão migrados:** `IdQuestao_Original` (0 linhas em todas as
bibliotecas), `IsExpanded` e `IsSelected` (estado de UI dentro do banco — no produto novo isso
vive em `localStorage`, conforme as diretrizes de navegação do design system),
`imgOriginal`/`imgGerada` (0 BLOBs em todas as bibliotecas; as imagens estão no sistema de
arquivos).

### 2.5 Banco de metadados LaTeX

`_databases/SQLite/LatexMetadata.db` — SQLite, independente das bibliotecas, com dados ricos:

| Tabela | Linhas |
|---|---:|
| `LatexSimbols` | 2.741 |
| `LatexAutoCompletes` | 653 |
| `LatexIconMenus` | 29 |
| `LatexSimbolGroups` | 13 |
| `LatexIconMenu_SubGroups` | 5 |
| `LatexIconMenu_Groups` | 2 |

Este banco é **independente do acervo de questões** e pode ser importado muito cedo. É a razão
de a Fase 4 ter sido antecipada para dentro da Wave A.

### 2.6 História do legado (branches)

As branches do repositório `ChicoFigueiredo/e-matematica-Banco-Questoes` narram a evolução e
confirmam decisões deste plano:

```
005-atualizando-CSharp-Net      → modernização da plataforma
006-expandindo-quadro-questoes
007-refatorando-texteditex      → editor LaTeX
008-usando-treeview             → árvore hierárquica
009-Adicionando-Capacidade-Captura
010-Migrando-SQLLite            ← SQL Server → SQLite JÁ ACONTECEU
011-Refatoracao-KnowChico       → formato de biblioteca .knowchico
012-Adicionando-OCR             → Tesseract, Ctrl+V, figura, tags
013-MVP-Livro                   ← mesclada na main; latexComplemento, símbolos no ribbon
```

Dois pontos relevantes:

- O OCR legado é **Tesseract** — OCR de *texto*, nunca de matemática. O reconhecimento matemático
  (Fase 14) é território genuinamente novo, não um port.
- O render legado (`LatexRender5`) usa exatamente `pdflatex` + `pdftocairo`, com uma fila
  (`Queue/LatexJob.cs`, `MonitorLoop.cs`) — a "coalescência embrionária" que a spec §2 menciona.

> O repositório GitLab `bqcf/bqcf.windows` exige autenticação e não pôde ser lido. Se ele contiver
> branches que não estão no GitHub, é preciso um token ou um clone local para incorporá-lo ao
> estudo. Não bloqueia nenhuma fase.

### 2.7 Design system

Projeto **Edulingo DS Admin v1 — "Secretaria Acadêmica"**
(`https://claude.ai/design/p/6e402d80-f405-46c8-a79a-3efccf6d2297`), tipo *design system*.

Está muito mais completo do que "uma referência visual". Já implementa, testado e documentado:

| Peça | O que resolve na spec do LatexBookBank |
|---|---|
| `AdminShell` | Workbench multizona + topbar + rodapé de status + Ctrl+K (§4, §22) |
| `Divider` | Divisórias móveis WAI-ARIA com largura persistida (§4, Epic 02.1) |
| `CommandPalette` | Paleta de comandos com busca sem acentos e teclado completo (§22) |
| `Tree` | Treeview WAI-ARIA com roving tabindex, select ≠ activate, persistência (§4.1) |
| `ToolCallCard` | Timeline de tool calls com custo/tokens/duração e "nada se aplica sem confirmação" (§14.6, Epic 07.1) |
| `AIContextBar` | Contexto explícito e removível enviado ao modelo (§14.2) |
| `ChatMessage`, `ModelBadge`, `PromptChip` | Painel agêntico (§4.4) |
| `ArtifactStatus` | Ontologia de estados incl. `job_queued/processing/done/failed` → `RenderJob` (§8.10) |
| `DataTable` | Busca/ordenação/paginação com densidade persistida (§21) |
| forms, feedback | `Button`, `Input`, `Select`, `Combobox`, `Modal`, `Toast`, `EmptyState`, `Banner`… |
| `tokens.css` | 3 temas: claro/papel (default), dark, alto contraste AAA |
| `_adherence.oxlintrc.json` | Lint de aderência — proíbe hex cru fora dos tokens |

**Características técnicas.** React puro com CSS custom properties e injeção de CSS em runtime
(`injectCss`, com guarda `typeof document === "undefined"`, portanto seguro para SSR).
**Nenhuma dependência de Tailwind, shadcn, Radix ou CSS-in-JS.** Os arquivos são `.jsx`, mas cada
componente já tem seu `.d.ts` escrito — a conversão para `.tsx` é quase mecânica.

Densidade: controles 26/32/38 px, corpo 13 px, base 4 px. É exatamente a "densidade de IDE" que a
spec §34 exige.

---

## 3. Decisões

### 3.1 Travadas com o autor

| # | Decisão | Razão |
|---|---|---|
| D1 | Escopo = Waves A–F | M8/SaaS permanece como preparação arquitetural (UUIDs, `workspaceId`, storage abstraction, repository boundaries), não como fase executável |
| D2 | SQLite como banco único; legado importado como base viva | O legado vira "memória" inicial a ser corrigida e enriquecida dentro do app, não uma fonte permanentemente acoplada |
| D3 | Um `OpenAiCompatibleProvider` com `baseURL` configurável | OpenRouter como padrão, mais OpenAI, Ollama local, LM Studio e qualquer endpoint compatível. Um provider, não dois |
| D4 | Execução fase a fase com checkpoint humano | Fases de uma sessão, com aceite verificável por comando |
| D5 | Design system Edulingo DS Admin v1 como base | Ver §3.3 |

### 3.2 Tomadas no planejamento

| # | Decisão | Razão |
|---|---|---|
| D6 | pnpm workspace com `apps/web`; `packages/*` extraídos só quando houver necessidade real | Spec §6 permite explicitamente; evita cerimônia sem uso |
| D7 | Documentação em pt-BR; código, identificadores e commits em inglês | A própria spec nomeia campos em inglês (`statementLatex`, `sortKey`) |
| D8 | Vitest (unit/integration) + Playwright (E2E) | Integração melhor com Next/TS do que Jest |
| D9 | Fractional indexing implementado e testado no projeto, não como dependência | ~60 linhas, é regra de domínio crítica (§8.3) e merece testes de propriedade próprios |
| D10 | Preâmbulo pré-compilado (`mylatexformat`) como otimização medida na Fase 6 | 2,1 s medidos; ganho esperado grande e verificável |
| D11 | **Biblioteca legada → `Workspace`** | O legado já organiza o acervo em 13 bibliotecas independentes. Mapear cada uma para um `Workspace` dá sentido real ao conceito que a spec §8.1 pedia para criar "mesmo localmente", em vez de um workspace artificial e único |
| D12 | Ordem da árvore importada derivada de `IdQuestao`, nunca de `Ordem` | Ver §2.4, achado 2 |

### 3.3 Decisões que substituem a especificação mestra

Estas contrariam o texto da spec. Cada uma é reversível e está registrada com sua razão.

#### D13 — Adotar o Edulingo DS em vez de Tailwind + shadcn/ui

*Substitui a spec §5.2.*

A spec propõe Tailwind CSS + shadcn/ui + Radix. O design system aprovado usa CSS custom
properties e componentes React sem framework de estilo.

**Razão.** Somar Tailwind e shadcn ao DS criaria dois sistemas de estilo competindo, e os
componentes shadcn precisariam ser reestilizados para o contrato de tokens de qualquer forma —
trabalho que produz apenas divergência. O DS já entrega, testado, cerca de 90% do chrome do
workbench, incluindo peças que a spec descreve mas ninguém escreveu ainda (`ToolCallCard`,
`ArtifactStatus`, `Divider` com persistência).

**O que fica.** `tokens.css` como fonte única da verdade visual; componentes portados de `.jsx`
para `.tsx` usando os `.d.ts` já existentes; `_adherence.oxlintrc.json` incorporado ao lint do
projeto para proibir hex cru.

**A lacuna, e como fechá-la.** O DS não tem *context menu*, *tooltip* nem *popover*, e a árvore
do LatexBookBank precisa dos três (spec §4.1: "menu de contexto"). → Usar **primitivas Radix
headless apenas para esses comportamentos**, estilizadas com os tokens do DS. Sem Tailwind, sem
shadcn. É a menor adição que fecha a lacuna sem introduzir um segundo sistema visual.

#### D14 — Mapeamento das quatro zonas para o `AdminShell`

*Refina a spec §4.*

A spec desenha quatro colunas: árvore | editor | preview | agente. O `AdminShell` oferece rail de
módulos + sidebar contextual + main + aside com FAB.

Mapeamento adotado:

```
rail        → módulos (Biblioteca · Publicações · Avaliações · Importação · Diagnóstico)
sidebar     → árvore do documento          [§4.1]
main        → editor Monaco | preview      [§4.2, §4.3]  ← divisão interna
aside       → painel agêntico, FAB ✦       [§4.4]
footer      → statusbar                    [§4]
```

**Razão.** Zero modificação no design system. O `asideFabIcon` já aceita `"sparkles"`, que é
literalmente o `✦` que a spec §4.4 pede. A divisão editor|preview dentro do main é o que produz a
sensação de IDE, e o rail adiciona a navegação de módulos que o mockup da spec não tem mas que o
produto claramente precisa (importação, diagnóstico, avaliações).

#### D15 — Identidade visual re-tokenizada

*Refina a spec §1.*

O DS é a identidade do EduLingo ("Anil & Areia", marca `E`, IA chamada "Kátia") e traz um
namespace `pedagogy.*` que não existe no domínio do LatexBookBank.

Adotado: manter o **contrato semântico** dos tokens (mesmos nomes de variável, portanto
componentes reaproveitáveis) e re-tokenizar os **valores** para a identidade do LatexBookBank;
remover `pedagogy.*`; manter o namespace `--ai` (lilás) para as superfícies do agente; substituir
`BrandMark`. O tema claro/papel permanece o default — coerente com uma ferramenta de autoria
editorial.

---

## 4. Arquitetura

### 4.1 Fluxo obrigatório

```
UI (Client)
  ↓
Route Handler  ·  validação Zod na entrada e na saída
  ↓
Application Use Case
  ↓
Domain
  ↓
Repository (interface)
  ↓
Prisma
  ↓
SQLite  →  (futuro) PostgreSQL
```

### 4.2 Fronteiras protegidas por lint, não por disciplina

Quatro regras verificadas no CI, porque convenções que dependem de memória humana falham:

1. Nenhum componente React importa Prisma.
2. Nenhum módulo de domínio importa `next/*`.
3. O renderer não importa React.
4. O agente não tem caminho de escrita no banco — apenas propõe.

### 4.3 Estrutura

```
/
├─ apps/web/
│  ├─ app/                          # App Router
│  ├─ src/
│  │  ├─ modules/
│  │  │  ├─ workspaces/  publications/  document-tree/  questions/
│  │  │  ├─ latex/  rendering/  assets/  ingestion/
│  │  │  ├─ assessments/  agents/  revisions/  settings/
│  │  ├─ design-system/             # tokens.css + componentes portados (.tsx)
│  │  ├─ shared/
│  │  └─ infrastructure/
│  ├─ prisma/
│  ├─ data/                         # SQLite + assets locais (fora do git)
│  └─ tests/
├─ docs/
└─ _antigo/                         # symlink read-only para o legado
```

Cada módulo, quando a lógica não for trivial: `domain/ · application/ · infrastructure/ · api/ · ui/ · index.ts`.

### 4.4 Contratos que nascem cedo e não mudam depois

`QuestionTypePlugin` (§9) · `AiProvider` (§5.6) · `MathRecognitionProvider` (§13.3) ·
`QuestionPatch` (§14.4) · `Repository<T>` · `StorageProvider` · `QuestionSearchService` (§21).

---

## 5. Ajustes no modelo de domínio

A spec §8 permanece válida. O estudo do acervo real exige estas adições:

### `DocumentNode`

| Campo novo | Tipo | Razão |
|---|---|---|
| `numberingStyle` | `ARABIC \| ROMAN \| LETTER` | `Questoes_Numeracao` legado (0/13/27). A spec não previu |
| `originalLabel` | `string?` | `Numeracao_Original` — rótulo editorial do livro ("I", "6") |

> `collapsed` sai do banco e vai para `localStorage`, por coerência com as diretrizes de
> navegação do design system e porque estado de UI no banco foi um antipadrão do legado
> (`IsExpanded`/`IsSelected`).

### `Question`

`difficulty` é enum de escala legada — `0 · 2 · 5 · 7 · 10` — e não um inteiro livre de 1 a 5.

### `QuestionOption`

`legacyMarcacao: string?` — preserva a letra original apenas para auditoria do import.
**Nunca** usada como identidade nem para renderizar.

### `Asset` — tipos além da spec §8.7

Aos tipos previstos (`SOURCE_PDF`, `COVER`, `SOURCE_IMAGE`, `QUESTION_IMAGE`, `CROP`,
`RENDER_PDF`, `RENDER_PNG`, `RENDER_SVG`, `ATTACHMENT`) somam-se as **fontes de figura** achadas
no acervo:

`FIGURE_SOURCE_GNUPLOT` · `FIGURE_SOURCE_PGF` · `FIGURE_SOURCE_ASYMPTOTE` ·
`FIGURE_SOURCE_GEOGEBRA` · `FIGURE_SOURCE_TPX` · `FIGURE_SOURCE_TEX` · `FIGURE_DATA_TABLE` ·
`FIGURE_SOURCE_SVG` · `FIGURE_SOURCE_EPS`

Sem isso, 1.000+ arquivos do acervo entrariam como blobs anônimos e a capacidade de reeditar uma
figura na origem se perderia.

---

## 6. Mapeamento legado → novo

Referência do importador (Fase 11). Origem: `*.knowchico`.

### Biblioteca → `Workspace`

| Legado (`padrao.knowchicoconfig` › `BibliotecasKnowChicos`) | Novo |
|---|---|
| `Name` | `Workspace.name` |
| `PathFolder` + `MetadataFile` | `Workspace.legacySourcePath` (auditoria) |
| `IdBiblio` | `Workspace.legacyId` |

### `Publication` → `Publication`

| Legado | Novo | Nota |
|---|---|---|
| `idPublication` | `legacyId` | chave de idempotência |
| `UUID` | `legacyUuid` | o legado já tem UUID — reforça o upsert |
| `PublicationName` | `title` | |
| `PublicationNick` | `nickname` | |
| `ISBN`, `ICCN` | `isbn`, `otherIdentifier` | |
| `PublicationDate`, `IncludeDate`, `LastModified` | `publicationDate`, `importedAt`, `legacyUpdatedAt` | |
| `Notes` | `notes` | |
| `CoverPath` + `HasCover` | `coverAssetId` | arquivo `pub<N>/cover.jpg` |
| `Path` | resolve a pasta `pub<N>/` | base dos assets |
| `AuthorSort`, `SortPublicationName` | descartados | derivados, recalculáveis |
| `PublicationSeries`, `Flags` | `metadataJson` | semântica desconhecida; preservados |

### `Questao` → `DocumentNode` (+ `Question` quando `TipoQuestao > 0`)

| Legado | Novo | Nota |
|---|---|---|
| `IdQuestao` | `legacyId` | e **fonte da ordenação** |
| `IdQuestao_Pai` | `parentId` | |
| `TipoQuestao` | `NodeKind` + `QuestionType` | ver tabela de sinais em §2.4 |
| `Apelido` | `DocumentNode.title` / `Question.nickname` | título dos nós estruturais |
| `Ordem` | **ignorado** | sempre 0; ver achado 2 |
| — | `sortKey` | fracionário, derivado da ordem de `IdQuestao` |
| `Numeracao` | `numberingStyle` | 0/13/27 |
| `Numeracao_Original` | `originalLabel` | |
| `Nivel` | validação apenas | a profundidade real vem da árvore |
| `latexQuestao` | `statementLatex` | |
| `latexResposta` | `solutionLatex` | |
| `latexComplemento` | `complementLatex` | ausente nas 3 bibliotecas antigas |
| `latexOrigin` | `originalLatex` | |
| `Dificuldade` | `difficulty` | enum 0/2/5/7/10 |
| `Banca`, `Instituição`, `Cargo`, `Nivel_Cargo`, `Ano`, `Editora` | idem | |
| `VideoLink` | `videoUrl` | |
| `Deleted` | `deletedAt` | |
| `Correta` | **ignorado** | vestigial, sempre 0 |
| `IsExpanded`, `IsSelected` | **ignorados** | estado de UI |
| `IdQuestao_Original` | **ignorado** | 0 linhas em todas as bibliotecas |
| `imgOriginal`, `imgGerada` | **ignorados** | 0 BLOBs; imagens no filesystem |

### `Questao_Itens` → `QuestionOption`

| Legado | Novo | Nota |
|---|---|---|
| `IdQuestao_Itens` | `legacyId` | |
| `Ordem` | `sortKey` | **aqui `Ordem` é confiável** (1..5, alinhado à `Marcacao`) |
| `Marcacao` | `legacyMarcacao` | auditoria apenas; a letra vira projeção |
| `Correta` | `isCorrect` | fonte de verdade do gabarito |
| `latexItem` | `statementLatex` | |
| `latexResposta` | `solutionLatex` | |
| `latexOrigin` | `originalLatex` | |

### Assets do filesystem

| Origem | Destino |
|---|---|
| `pub<N>/cover.jpg` | `Asset(COVER)` |
| `pub<N>/<Título>.detail.json` | `metadataJson` da publicação |
| `pub<N>/idQuestion<M>/preview.png` | **não importado** — é cache de render (spec §1.1) |
| `.gnuplot`, `.pgf`, `.asy`, `.ggb`, `.tpx`, `.table`, `.svg`, `.eps`, `.tex` | `Asset(FIGURE_SOURCE_*)` |
| `.pdf` | `Asset(SOURCE_PDF)` |

### Invariantes que o import deve afirmar e falhar se violadas

1. Todo nó com `TipoQuestao = 2` tem **exatamente uma** alternativa correta.
2. Todo `IdQuestao_Pai` não nulo aponta para um nó existente na mesma biblioteca.
3. Nenhum ciclo na árvore.
4. Rodar o import duas vezes não cria nada novo (idempotência por `legacyId` + `workspaceId`).

---

## 7. As 17 fases

Cada fase termina em estado verificável e em checkpoint humano. Os itens marcáveis estão em
[`_checklist.md`](./_checklist.md).

### Wave A — fundação e IDE editorial

#### Fase 0 — Fundação
Workspace pnpm · Next.js App Router · TypeScript strict · ESLint/Prettier + regras de fronteira ·
estrutura modular · Prisma + SQLite com o schema núcleo (`Workspace`, `Publication`,
`DocumentNode`, `Question`, `QuestionOption`, `Tag`, `QuestionTag`) · interfaces de repository +
implementação Prisma · seed de demonstração · `pnpm setup` com health checks (TeX, Poppler,
provider de IA) · CI (install locked, lint, typecheck, test, build).
**Aceite:** `pnpm setup && pnpm dev` sobe; seed cria publicação demo navegável; CI verde; as 4
regras de fronteira falham o lint quando violadas propositalmente.

#### Fase 1 — Design system e shell
Portar `tokens.css` re-tokenizado · portar componentes `.jsx` → `.tsx` (`Icon`, `AdminShell`,
`Divider`, `CommandPalette`, forms, feedback, display) · incorporar
`_adherence.oxlintrc.json` ao lint · 3 temas (claro/papel default, dark, alto contraste) ·
zonas conforme D14 · statusbar · Ctrl+K com comandos de navegação · Radix headless para context
menu/tooltip/popover.
**Aceite:** checklist visual §34; utilizável em 1366×768 e excelente em 1920×1080; larguras das
divisórias persistem entre sessões; lint de aderência rejeita hex cru.

#### Fase 2 — Árvore de documento
`GET /api/publications/:id/tree` · estender o `Tree` do DS com virtualização, ícones por
`NodeKind`, indicadores de estado (não salvo, erro de render, incompleta, validada, alteração
agêntica pendente) · CRUD de nós · rename inline (F2) · exclusão lógica e restauração ·
fractional indexing com testes de propriedade · mover como filho/irmão e reordenar via `dnd-kit`,
com validação de ciclo · busca e filtro · breadcrumb · menu de contexto · atalhos
(`Ctrl+N`, `Ctrl+Shift+N`, `Alt+↑/↓`, `Del`).
**Aceite:** §33 "Árvore" completo; testes de ordenação e de movimento passam, incluindo
rebalanceamento de rank.

#### Fase 3 — Monaco e autosave
Monaco como client component isolado com dynamic import · language configuration LaTeX
(brackets, comments, tokens, auto-close) · model por campo · abas internas (Conteúdo, Resposta,
Complemento, Metadados, Origem) · autosave com debounce · dirty state · `Ctrl+S` ·
concorrência otimista por `updatedAt` com detecção de conflito.
**Aceite:** edita e persiste; conflito é detectado e apresentado, nunca sobrescrito em silêncio;
sem erro de hidratação.

#### Fase 4 — Conhecimento LaTeX do legado *(antecipada da Wave D)*
Importador idempotente de `LatexMetadata.db` (653 autocompletes, 2.741 símbolos, 13 grupos,
29 menus) · conversão do delimitador legado `§` para placeholders nativos do Monaco ·
completion provider com trigger `\` e `Ctrl+Space` · snippets com navegação por tab · palette de
símbolos por grupo, com busca e inserção no cursor.
**Aceite:** autocomplete e snippets funcionam com o acervo legado real; relatório de import
mostra contagens conferindo com as da §2.5.

**Por que antecipada:** é SQLite puro, independente do acervo de questões e do SQL Server. Entrega
o maior salto de qualidade do editor pelo menor custo, e não depende de nenhuma decisão pendente.

#### Fase 5 — Fast Preview
`PreviewModel` derivado do `QuestionAggregate` · renderização React + MathJax (inline e display) ·
parágrafos, alternativas, resposta, imagens, caixas · aviso permanente de divergência potencial ·
debounce.
**Aceite:** latência percebida como imediata; o aviso da §11 está visível.

#### Fase 6 — Render autoritativo
`LatexProfile` + importação do `latex-includes.tex` como profile "Legacy Compatibility" ·
`LatexBuilder` alimentado pelo `QuestionTypePlugin` · execução de `pdflatex` via `execFile`
(argumentos, nunca string de shell), diretório temporário por job, timeout, sem `shell-escape` ·
`pdftocairo` → PNG · `RenderJob` + API de criação/status/resultado · cache por content hash ·
coalescing (cancela pendente, descarta intermediário, converge no estado final) · abas
PDF/PNG/Log/Source · `Ctrl+Enter` · diagnósticos mapeados para linha, com clique no log navegando
para o editor · **medir e aplicar preâmbulo pré-compilado**.
**Aceite:** compila `tikz`, `pgfplots`, `siunitx`, `xlop` e `cancel`; cache hit medido e
reportado; erro de TeX aparece como diagnóstico, não como stack trace; ganho do preâmbulo
pré-compilado registrado com número antes/depois.

### Wave B — banco de questões

#### Fase 7 — Tipos, alternativas e metadados
Registry `QuestionTypePlugin` · plugins Discursiva e Múltipla Escolha com N alternativas
arbitrário · `QuestionOption` por UUID, com letra calculada na projeção · editor de alternativas
com reordenação por drag, marcação de correta e "embaralhar visualização" · metadados editoriais
(dificuldade na escala legada, ano, banca, instituição, cargo, nível, origem) · tags com
autocomplete · `validate_question`.
**Aceite:** §33 "Questão" completo; existe um teste que prova que o gabarito sobrevive à
reordenação das alternativas.

### Wave C — agente

#### Fase 8 — Provider e painel (somente leitura)
`AiProvider` + `OpenAiCompatibleProvider` · perfis de endpoint (OpenRouter, OpenAI, Ollama,
custom) · matriz de capacidades por perfil (tool calling nativo × fallback JSON) · settings com
"testar conexão" · chave apenas no servidor · painel no `aside` com FAB `✦` e `Ctrl+Shift+A` ·
`AgentContext` explícito via `AIContextBar` · tools somente leitura (`get_current_question`,
`get_question_options`, `get_question_metadata`, `get_source_anchor`, `get_render_diagnostics`,
`search_questions`, `validate_question`) · timeline com `ToolCallCard` · modo `ASK` ·
`AgentRun` persistido.
**Aceite:** o modelo sabe exatamente qual questão está aberta; nenhuma tool de escrita está
exposta; Ollama offline não impede o uso normal do app; ausência de chave mostra instrução clara.

#### Fase 9 — Patch, diff e aprovação
`QuestionPatch` em Zod com whitelist de campos · tools `propose_*` · diff por campo e diff Monaco
para LaTeX · `render_candidate_latex` isolado e sem escrita · aplicação transacional criando
revisão anterior · aplicar tudo / aplicar seleção / rejeitar / pedir revisão / reverter ·
modos `REVIEW`, `FIX_LATEX` (iterativo, máximo configurável de 3, com timeout global),
`ENRICH`, `STRUCTURE` · critérios da §36 para "corrigir questão".
**Aceite:** §35 inteiro; E2E da §27 passa ponta a ponta; toda tentativa fica auditada.

#### Fase 10 — Revisões e histórico
`Revision` com origem `USER`/`IMPORT`/`AGENT`/`SYSTEM` · aba Histórico com timeline, diff e
restauração.
**Aceite:** restaurar uma revisão devolve o estado exato e fica auditado.

### Wave D — acervo legado

#### Fase 11 — Importação
`LegacyReader` read-only com **detecção das 3 gerações de schema** · scanner e relatório de
integridade (órfãos, pais ausentes, alternativas inválidas, assets ausentes) · mappers da §6 ·
biblioteca → `Workspace` · assets do filesystem com classificação por tipo de fonte de figura ·
dry-run · import idempotente por `legacyId` · `ImportReport` (importados, atualizados, ignorados,
inconsistentes, órfãos, assets ausentes) · **afirmação das 4 invariantes da §6**.
**Aceite:** §33 "Legado" completo; as 13 bibliotecas importam; rodar duas vezes não duplica nada;
as contagens batem com as da §2.3 ou o relatório explica cada divergência.

#### Fase 12 — Busca
`QuestionSearchService` abstrato · busca por texto, tags, banca, instituição, ano, tipo e
dificuldade · integração com `Ctrl+K` · avaliação do FTS5 com benchmark e decisão documentada.
**Aceite:** encontra questão importada por qualquer um dos critérios; decisão sobre FTS5
registrada com números.

### Wave E — ingestão visual

#### Fase 13 — Assets, PDF e crop
Asset store local (sha256, paths sanitizados que não escapam do workspace, storage key, validação
de MIME, limite de upload) · upload, drag-and-drop e `Ctrl+V` · inserção assistida de figura
(width, caption, label → snippet `figure/includegraphics`) · visualizador de PDF com zoom e
navegação · ferramenta de crop com bounding box → `SourceAnchor` + `Asset(CROP)`.
**Aceite:** §33 "Assets" completo; a origem é sempre preservada; nenhum path escapa do workspace.

#### Fase 14 — Reconhecimento matemático
`MathRecognitionProvider` · implementação via modelo multimodal por endpoint OpenAI-compatible,
mais opção local · resultado com latex, confiança, alternativas e metadados de processamento ·
fluxo crop → LaTeX candidato → fast preview → editar → render autoritativo → aceitar.
**Aceite:** um crop vira LaTeX editável; o crop original nunca é descartado; falha do provider não
perde trabalho do usuário.

### Wave F — diferencial de produto

#### Fase 15 — Avaliações e variantes
PRNG determinístico com testes · `Assessment`, `AssessmentSection`, `AssessmentRule`,
`AssessmentItem`, `AssessmentVariant`, `AssessmentVariantQuestion`, `AssessmentVariantOptionMap` ·
embaralhamento de questões e de alternativas preservando `optionId` · persistência de seed, ordens
e mapa `optionId → displayedLabel` · `DocumentTemplate` · exportação aluno, professor e gabarito.
**Aceite:** a mesma seed reproduz a mesma prova byte a byte, em execuções e processos diferentes.

#### Fase 16 — Endurecimento e preparação SaaS
Página de diagnósticos completa (§25) · logs estruturados sem prompts completos por padrão ·
spike PostgreSQL rodando a suíte de integração nos dois providers · `StorageProvider` com
implementação local e interface pronta para S3 · guard central de `workspaceId` · E2E completo do
fluxo crítico da §27.
**Aceite:** Definition of Done global da §28 auditado item a item; relatório do spike PostgreSQL
com as diferenças encontradas.

---

## 8. Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Tool calling varia muito entre modelos e provedores | Alta | Matriz de capacidades por perfil, com fallback para JSON estruturado; testes de contrato com respostas gravadas |
| Deriva de schema entre as 13 bibliotecas quebra o import | Alta | Detecção de geração por biblioteca; campos ausentes degradam em vez de falhar; dry-run obrigatório antes de qualquer escrita |
| Monaco quebra sob SSR do App Router | Média | Client component isolado com dynamic import desde a Fase 3 |
| Render de 2,1 s degrada a sensação de edição | Média | Fast preview cobre o loop rápido; render assíncrono com cache e coalescing; preâmbulo pré-compilado medido |
| Fractional indexing sutilmente errado corrompe a ordenação | Média | Testes de propriedade na Fase 2, incluindo rebalanceamento |
| Portar o DS de `.jsx` para `.tsx` revela acoplamentos ao EduLingo | Média | Os `.d.ts` já existem; portar na Fase 1, cedo, quando corrigir é barato |
| Classificação errada dos 1.000+ arquivos de figura | Média | Classificação por extensão com relatório do que caiu em `ATTACHMENT`; nada é descartado |
| Árvore grande trava a UI | Baixa | Virtualização na Fase 2, antes de existir volume |
| GitLab inacessível esconde trabalho relevante | Baixa | Não bloqueia nenhuma fase; resolver com token se necessário |

---

## 9. Explicitamente fora de escopo

Da spec §38, mais o que este planejamento decidiu adiar:

Microserviços · Kubernetes · event sourcing · vector database · Redis · CQRS · multi-tenancy
complexo · pagamentos · marketplace · colaboração em tempo real · CRDT · TexLab/LSP obrigatório
(spike apenas, sem bloquear) · OCR de livro inteiro antes do crop unitário · agente em lote antes
do agente unitário ser confiável · tipos de questão 3–7 (V/F, Resolva, CESPE, Múltipla,
Somatório), que existem no vocabulário legado mas têm **zero linhas** no acervo — entram pelo
registry quando houver demanda real.

Migração do SQL Server: **descartada**. O legado já migrou para SQLite; os `.mdf` são legado morto.

---

## 10. Rastreabilidade

| Fase | Epic da spec | Seções da spec |
|---|---|---|
| 0 | EPIC 01 | §5.1, §6, §7, §26, §27, §39 |
| 1 | EPIC 02 | §4, §5.2, §22, §34 |
| 2 | EPIC 02 | §4.1, §8.3 |
| 3 | EPIC 03 | §5.3, §10.1, §20 |
| 4 | EPIC 03 | §10.2 |
| 5 | EPIC 04 | §5.5, §11 |
| 6 | EPIC 04 | §12 |
| 7 | EPIC 05 | §8.4, §8.5, §8.6, §9 |
| 8 | EPIC 07 | §5.6, §14.1–14.3, §14.7, §14.8 |
| 9 | EPIC 07 | §14.4–14.6, §36, §24 |
| 10 | EPIC 10 | §8.9 |
| 11 | EPIC 08 | §16, §8.2, §8.8 |
| 12 | EPIC 10 | §21 |
| 13 | EPIC 06 | §13.1, §13.2, §8.7, §24 |
| 14 | EPIC 06 | §13.3, §13.4 |
| 15 | EPIC 09 | §17, §18 |
| 16 | EPIC 10 | §25, §28, §39, §40 |
