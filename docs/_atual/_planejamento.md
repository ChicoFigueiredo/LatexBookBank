# LatexBookBank Web — Planejamento de Execução

> **Documento vivo.** Companheiro obrigatório de [`_checklist.md`](./_checklist.md).
> Origem: [`../prompts/260806-01.LatexBookBank_Web_Especificacao_Mestra.md`](../prompts/260806-01.LatexBookBank_Web_Especificacao_Mestra.md).
>
> **Levantamento:** 2026-08-07
> **Revisão 1:** 2026-08-07 — decisões de plataforma do CEO (§3.4).
> **Revisão 2:** 2026-08-07 — incorporada a
> [primeira auditoria](../prompts/260807-01.Auditoria-Planejamento.e.Checklist.md) (§3.5).
> **Revisão 3:** 2026-08-07 — incorporada a
> [segunda auditoria](../prompts/260807-02.Segunda.Auditoria.md): ajustes de fronteira (§3.6).
> **Parecer:** aprovado com ajustes · 9/10 · **autorizado iniciar a Fase 0** após esta revisão.
> **Escopo aprovado:** Waves A–F. M8/SaaS entra apenas como preparação arquitetural.
> **Modo de execução:** Claude executa fase a fase, com checkpoint humano ao fim de cada fase.
>
> **Direção arquitetural vigente:** **LOCAL-FIRST, CLOUD-READY**.

---

## 1. Sumário executivo

O LatexBookBank Web reconstrói, como aplicação web em TypeScript/Next.js, o produto hoje existente
como aplicativo WPF. O legado não é portado componente a componente: é tratado como especificação
executável e como acervo a ser preservado.

Quatro levantamentos e decisões mudaram materialmente o plano em relação ao que a especificação
mestra assumia:

1. **O acervo legado já é SQLite.** A spec §16 assume um banco SQLite genérico; o repositório
   legado ainda contém arquivos SQL Server. Na prática, a migração para SQLite já aconteceu no
   legado (branch `010-Migrando-SQLLite`), e os dados vivos estão em 13 bancos `.knowchico`
   organizados como bibliotecas estilo Calibre. O SQL Server é legado morto.
2. **O pipeline de render foi validado na máquina alvo, antes de escrever código.** O preâmbulo
   legado completo compila limpo.
3. **Existe um design system pronto e maduro** (Edulingo DS Admin v1), que já implementa a maior
   parte do chrome do workbench que a spec descreve — incluindo as superfícies de IA governável.
   Isso substitui a stack de UI proposta na spec §5.2.
4. **A direção arquitetural é local-first, cloud-ready.** O modo local é produto de primeira
   classe, não ambiente temporário: Next.js + SQLite + `LocalFileStorage` + renderer em Docker +
   IA local, capaz de operar com a internet desligada. O modo cloud futuro troca as
   implementações — PostgreSQL, object storage, mesma imagem do renderer hospedada — sem que as
   regras de negócio saibam qual dos dois está em uso. Isso é provado empiricamente numa fase
   curta (6.5), não presumido.
5. **O acervo real cabe em 109 MB.** O inventário em bytes (§2.10) mostrou que as 13 bibliotecas
   somam 109 MB em 409 arquivos, com menos de 1% recuperável por deduplicação. Isso remove a
   questão de custo de storage da lista de riscos.

O plano resultante tem **26 fases**, cada uma dimensionada para caber em uma sessão de trabalho,
com critérios de aceite verificáveis por comando. *(Eram 19; a Wave G — captura em volume —
acrescentou as Fases 18 e 19 em 2026-09-10, as 20 e 21 em 2026-09-16, e as 22, 23 e 24 em
2026-09-19, ver §3.7.)*

---

## 2. O que foi apurado

Esta seção registra evidências, não suposições. Cada item foi verificado na máquina.

### 2.1 Ambiente de execução

| Item | Estado | Consequência |
|---|---|---|
| Node.js | v24.16.0 | OK |
| pnpm | 10.34.1 | OK |
| TeX Live | 2023/Debian, `pdfTeX 3.141592653-2.6-1.40.25` | **Fallback opcional** — o caminho principal é o renderer em Docker (D27, §19 da 2ª auditoria) |
| `pdftocairo` | 24.02.0 | OK |
| Docker | disponível, ambiente muito povoado | **Dependência principal**: o renderer roda nele. Ver §2.9 (portas) |
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

> Esta estrutura — um banco por biblioteca mais uma pasta de assets — é conceitualmente a mesma
> coisa que o formato de intercâmbio `.lbb` definido em §7. O legado já resolveu portabilidade
> desse jeito; o produto novo formaliza a ideia num único arquivo zip.

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
001-Fazendo-API                        ← só no GitLab
002-Experimento-outras-interfaces      ← só no GitLab
003-Matando-Aplicação-Anterior         ← só no GitLab
004-publicacoes                        ← só no GitLab
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
  (Fase 15) é território genuinamente novo, não um port.
- O render legado (`LatexRender5`) usa exatamente `pdflatex` + `pdftocairo`, com uma fila
  (`Queue/LatexJob.cs`, `MonitorLoop.cs`) — a "coalescência embrionária" que a spec §2 menciona.

> **Correção de 2026-08-31**: a premissa abaixo estava errada. O repositório GitLab
> `bqcf/bqcf.windows` **não** exige autenticação — há um clone local funcional em
> `/mnt/p/e-Matematica/banco-questoes.windows`, com `remote gitlab` apontando exatamente para
> `git@gitlab.com:bqcf/bqcf.windows.git` e todo o histórico já baixado (`refs/remotes/gitlab/*`).
> As quatro branches `001`–`004` acima só existem lá, não no GitHub. Inspeção linha a linha do
> conteúdo (o app WPF precursor, `BancoQuestoes.sln`) fica fora de escopo por decisão do Chico —
> é a origem documentada do desejo do produto, não trabalho pendente. Não bloqueia nenhuma fase.

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

### 2.8 Restrição de plataforma — `pdflatex` não roda em função serverless

Verificação necessária porque a nuvem é alvo declarado, ainda que futuro.

**O fato.** Funções serverless da Vercel não permitem instalar pacotes de sistema. O TeX Live que
o acervo exige — `abntex2cite`, `iwona`, `pgfplots`, `siunitx`, `xlop`, `tikz` — tem footprint de
ordens de grandeza acima do limite de bundle de função. O filesystem gravável é apenas `/tmp`,
efêmero por invocação.

**Consequência.** Isso *não* afeta o MVP nem a produção, porque o render **não roda em função
serverless em nenhum dos dois**: roda num worker containerizado (D27). A restrição apenas descarta
a hipótese de compilar dentro da app.

| Opção para o render | Veredito |
|---|---|
| Worker/API em Docker — WSL local, droplet em produção | **Adotada** (D27); mesma imagem nos dois |
| Executor de processo direto na máquina (`execFile`) | Fallback opcional; TeX Live já está instalado |
| Função serverless comum | Impossível — ver acima |
| LaTeX em WASM no browser (SwiftLaTeX, texlive.js) | Rejeitada: não cobre o conjunto de pacotes do acervo |

O que o MVP precisa garantir é só isto: que a compilação esteja atrás de `RenderExecutor` (D27),
para que trocar o endereço do worker — `localhost` ou droplet — não toque no domínio.

### 2.9 Portas de desenvolvimento local

O ambiente Docker está muito povoado — 3 stacks Supabase, a stack local do EduLingo, workers do
ImobTotal, ComfyUI, Redis, Caddy nas portas 80/443.

Portas já publicadas por containers (incluindo parados, que podem voltar):
`80 · 443 · 5433 · 6379 · 8080 · 8091 · 8188 · 9003 · 9200 · 15482 · 54321–54327 ·
54421–54424 · 54521–54527 · 55321–55329`

**Achado relevante.** A faixa efêmera do kernel é `32768–60999`. Boa parte das portas ocupadas
que encontrei (54321+, 63144, 32967) está *dentro* dela — o que significa que serviços fixados
ali podem colidir com conexões de saída aleatórias. Para o LatexBookBank, escolhemos um bloco
**abaixo** de 32768, o que evita as duas classes de colisão de uma vez.

**Bloco reservado: `28xxx`** — verificado livre em containers e no host.

| Porta | Serviço | Mnemônico |
|---:|---|---|
| `28080` | Next.js (dev) | ecoa 8080 |
| `28900` | Worker/API de render LaTeX (Docker) | — |
| `28432` | PostgreSQL em Docker — **apenas Fase 6.5** | ecoa 5432 |
| `28001` | Prisma Studio | — |
| `28379` | Redis, se vier a ser necessário (reservado) | ecoa 6379 |
| `28025` | Mailpit, se vier a ser necessário (reservado) | ecoa 1025/8025 |

Todas verificadas livres em 2026-08-07, em containers e no host. As portas `28090`/`28091`, que
haviam sido reservadas para MinIO em D34, ficam liberadas com a suspensão daquela decisão.

### 2.10 Inventário de volume do acervo *(executado — auditoria §33–35)*

A auditoria exigiu medir bytes antes de qualquer conversa sobre custo de nuvem. Executado em
2026-08-07 sobre `/mnt/t/KnowChico`.

**Procedimento.** `du` por pasta de biblioteca; `find -printf "%s"` agregado por extensão;
`sha256sum` de cada arquivo das 13 bibliotecas; agrupamento por hash para achar duplicados.

**Resultado — separação entre acervo e material externo:**

| Conjunto | Tamanho | Arquivos |
|---|---:|---:|
| **13 bibliotecas KnowChico** (o acervo) | **109 MB** | **409** |
| `ITA/Material` (compactados, sem `.knowchico`) | 3,2 GB | — |
| `Listas/` (repos git de material de curso) | 327 MB | — |
| Total da árvore | 3,6 GB | — |

**Por extensão, dentro do acervo e no entorno:** 478 PDF (1.118 MB, majoritariamente em
`ITA/Material`), 350 PNG (88 MB), 211 EPS (14 MB), 127 SVG (6,6 MB), 227 `.tex` (3,9 MB),
169 PGF (0,74 MB), 48 GeoGebra (0,57 MB), 316 `.table` (0,31 MB).

**Deduplicação:**

| Métrica | Valor |
|---|---:|
| Arquivos com hash | 409 |
| Conteúdos distintos | 326 |
| Grupos duplicados | 9 |
| Bytes recuperáveis | 0,77 MB (< 1%) |

**Conclusões que mudam decisões:**

1. **Custo de storage em nuvem deixa de ser risco.** 109 MB cabem folgadamente em qualquer tier
   gratuito. A auditoria §35 pedia para não estimar custo antes deste número — o número tornou a
   estimativa desnecessária.
2. **Deduplicação não se justifica como economia.** O `sha256` permanece central (D29), mas por
   integridade, identidade e auditoria — não por espaço.
3. **`ITA/Material` e `Listas/` estão fora do escopo do importador.** Não têm `.knowchico`, são
   material de terceiros, e respondem por 97% dos bytes. O scanner deve ignorá-los explicitamente
   e dizer que ignorou.

---

## 3. Decisões

### 3.1 Travadas com o autor

| # | Decisão | Razão |
|---|---|---|
| D1 | Escopo = Waves A–F | M8/SaaS permanece como preparação arquitetural, não como fase executável |
| D2 | Legado importado como base viva | O acervo vira "memória" inicial a ser corrigida e enriquecida dentro do app, não uma fonte permanentemente acoplada. *Confirmada por D24: SQLite é o banco primário local, e o importador roda localmente (auditoria §43)* |
| D3 | Um `OpenAiCompatibleProvider` com `baseURL` configurável | OpenRouter como padrão, mais OpenAI, Ollama local, LM Studio e qualquer endpoint compatível. Um provider, não dois |
| D4 | Execução fase a fase com checkpoint humano | Fases de uma sessão, com aceite verificável por comando |
| D5 | Design system Edulingo DS Admin v1 como base | Ver §3.3 |

### 3.2 Tomadas no planejamento

| # | Decisão | Razão |
|---|---|---|
| D6 | pnpm workspace com `apps/web`; `packages/*` extraídos só quando houver necessidade real | Spec §6 permite explicitamente; evita cerimônia sem uso. *Confirmada: com D27 o renderer é um executor dentro da app, não um serviço à parte* |
| D7 | Documentação em pt-BR; código, identificadores e commits em inglês | A própria spec nomeia campos em inglês (`statementLatex`, `sortKey`) |
| D8 | Vitest (unit/integration) + Playwright (E2E) | Integração melhor com Next/TS do que Jest |
| D9 | Fractional indexing implementado e testado no projeto, não como dependência | ~60 linhas, é regra de domínio crítica (§8.3) e merece testes de propriedade próprios |
| D10 | Preâmbulo pré-compilado (`mylatexformat`) como otimização medida na Fase 6 | 2,1 s medidos; ganho esperado grande e verificável. Auditoria §21: medir antes × depois, nunca assumir ganho |
| D11 | **Biblioteca legada → `Workspace`** | O legado já organiza o acervo em 13 bibliotecas independentes. Mapear cada uma para um `Workspace` dá sentido real ao conceito que a spec §8.1 pedia para criar "mesmo localmente" |
| D12 | Ordem da árvore importada derivada de `IdQuestao`, nunca de `Ordem` | Ver §2.4, achado 2 |

### 3.3 Decisões que substituem a especificação mestra

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
shadcn.

#### D14 — Mapeamento das quatro zonas para o `AdminShell`

*Refina a spec §4.*

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
produto claramente precisa.

#### D15 — Identidade visual re-tokenizada

*Refina a spec §1.*

Manter o **contrato semântico** dos tokens (mesmos nomes de variável, portanto componentes
reaproveitáveis) e re-tokenizar os **valores** para a identidade do LatexBookBank; remover
`pedagogy.*`; manter o namespace `--ai` (lilás) para as superfícies do agente; substituir
`BrandMark`. O tema claro/papel permanece o default.

### 3.4 Decisões de plataforma do CEO

Decididas em 2026-08-07. **Revistas pela auditoria arquitetural (§3.5) no mesmo dia** — o que
sobreviveu, o que foi reinterpretado e o que mudou está marcado item a item.

#### D16 — PostgreSQL como banco de runtime · **REVISTA por D24/D25**

A leitura inicial da decisão do CEO ("PostgreSQL local via docker para o MVP") colocava Postgres
como banco de runtime desde a Fase 0. A auditoria §5 é explícita em sentido contrário: *"SQLite
continua sendo o banco principal nesta etapa"* e *"não migrar agora o ambiente principal para
Vercel/PostgreSQL"*.

**Reconciliação adotada.** O CEO nomeou os **alvos** de infraestrutura; a auditoria define o
**sequenciamento**. "Postgres local via Docker" é exatamente o que a Fase 6.5 precisa para rodar
a suíte de integração contra os dois motores. Prevalece: SQLite como banco primário local (D24),
PostgreSQL/Neon como candidato cloud provado no spike (D25).

#### D17 — Deploy na Vercel; storage da Vercel · **REVISTA por D21/D26**

Vercel permanece como alvo de deploy, validado na Fase 6.5 — não como runtime do MVP. O
`StorageProvider` continua nascendo na Fase 0 (essa parte da D17 se confirma), com
`LocalFileStorageProvider` como implementação inicial e `VercelBlobStorageProvider` como
candidato cloud, conforme D26.

#### D18 — Portabilidade por arquivo `.lbb` (zip com SQLite + assets) · **MANTIDA**

Não há conflito com a auditoria. Com SQLite de volta como banco primário local, o formato fica
ainda mais natural: o `.lbb` passa a ser essencialmente um snapshot do que já roda. Ver §7.

#### D19 — Portas não usuais, fora da faixa efêmera · **MANTIDA**

Bloco `28xxx`, conforme §2.9. Continua necessário para o Postgres em Docker da Fase 6.5 e para o
servidor de desenvolvimento.

#### D20 — Renderer como serviço containerizado · **REVISTA por D27**

A suposição original era um container hospedado fora da Vercel, porque Vercel era tratada como
runtime do MVP. A decisão final do CEO mantém o container — mas como **worker/API em Docker
rodando nos dois ambientes**, WSL localmente e droplet em produção. Isso é melhor do que ambas as
versões anteriores: preserva local-first (Docker no WSL funciona offline) e elimina a divisão
entre executor local e executor de nuvem. Ver **D27**.

---

### 3.5 Decisões arquiteturais pós-planejamento

Origem: [auditoria arquitetural](../prompts/260807-01.Auditoria-Planejamento.e.Checklist.md).
Estas são a direção vigente e prevalecem sobre leituras anteriores em caso de conflito.

#### D21 — Arquitetura LOCAL-FIRST, CLOUD-READY

*Direção principal. Revisa D16 e D17.*

O ambiente principal de desenvolvimento e autoria continua local: Next.js, TypeScript, SQLite,
filesystem, TeX Live, `pdflatex`, `pdftocairo`, Ollama quando desejado.

Simultaneamente, **nenhuma regra de domínio pode depender** de SQLite, filesystem local, TeX
instalado, Ollama, Vercel, Neon ou Vercel Blob. Todos são providers de infraestrutura, não partes
intrínsecas do produto.

Critério de sucesso (auditoria §47): este código conceitual não pode saber onde executa.

```ts
const publication = await publicationRepository.get(id);
const asset       = await storageProvider.get(assetId);
const result      = await renderExecutor.render(request);
```

Pergunta de controle a cada decisão arquitetural (auditoria §55):

> *"Se amanhã esse código rodar no Vercel usando PostgreSQL e object storage, eu precisaria
> reescrever o domínio?"* Se sim, rever a fronteira.

#### D22 — PostGIS explicitamente excluído

*Decisão definitiva.*

PostGIS não entra no projeto — nem no schema, nem como dependência, nem como possibilidade
futura. Não deve ser usado para bounding boxes, crops, posições em página ou layout de documento.

**Razão.** Os dados espaciais do LatexBookBank são coordenadas de documento, não dados
geográficos. Um recorte se representa com campos comuns e coordenadas normalizadas (D28).

#### D23 — Quatro fronteiras primárias de infraestrutura

*Redação revista pela segunda auditoria (§14–§16).*

São as quatro grandes fronteiras externas do runtime — os pontos onde o produto toca o mundo:

```text
Persistence / Repository
StorageProvider
RenderExecutor
AiProvider
```

O domínio não conhece implementação concreta de nenhuma delas.

**"Primárias" não significa "as únicas".** Outros contratos continuam legítimos quando
representam comportamento real, não cerimônia:

`QuestionTypePlugin` · `MathRecognitionProvider` · `QuestionSearchService` · `PortableArchive` ·
`QuestionPatch`

**Pergunta de controle antes de criar qualquer interface:**

> Existe mais de uma implementação real, ou uma fronteira arquitetural importante?

Se a resposta for não, provavelmente não precisa de interface.

**Continua proibido:** interface para classe que nunca terá outra implementação · factory sem
necessidade · abstração de uma linha · DI framework pesado · service locator · microserviço por
módulo.

#### D24 — SQLite é o banco primário local · **VIGENTE** (reconfirmada pela segunda auditoria §2.1)

```text
Prisma → SQLite
```

Razões: o acervo já é local; a importação é local; desenvolvimento mais simples; operação
offline; desempenho suficiente para 109 MB e ~1.250 alternativas; backup trivial; nenhuma
dependência de infraestrutura externa.

PostgreSQL permanece alvo futuro, validado na Fase 6.5 (D25). SQLite tem ainda dois papéis
auxiliares: ler os `.knowchico` legados (Fase 11) e ser o container de dados do `.lbb`
(Fase 13, D18/D32/D37).

> *Esta decisão foi brevemente substituída por D33 e restaurada pela segunda auditoria. Ver D33.*

#### D25 — PostgreSQL/Neon é o candidato cloud, provado no spike

Neon é o primeiro PostgreSQL cloud a testar, **nunca como dependência de domínio**: a aplicação
não pode usar funcionalidade exclusiva do Neon, e qualquer PostgreSQL deve poder substituí-lo. Migrations SQLite e PostgreSQL não precisam ser literalmente iguais;
estratégias específicas por motor são aceitáveis. O requisito real é que **domínio e use cases
não precisem ser reescritos**.

#### D26 — Storage sempre atrás de `StorageProvider`

*Revisa D17. Reconfirmada pela segunda auditoria §2.4.*

| Papel | Implementação |
|---|---|
| Inicial e principal | `LocalFileStorageProvider` |
| Candidato cloud | `VercelBlobStorageProvider` |
| Possibilidade futura | `S3StorageProvider` |

Nenhum SDK concreto de storage pode vazar para o domínio ou para os use cases. É proibido `import { put } from '@vercel/blob'`
espalhado por domínio ou use cases — só a infraestrutura correspondente pode depender do SDK
concreto. `S3StorageProvider` deve ser implementável depois sem tocar em regra de negócio.

**Upload de arquivos grandes na futura versão cloud** (auditoria §14): evitar
`Browser → Function → Storage` para PDFs. Preferir upload direto autorizado
`Browser → Object Storage`, com o servidor apenas autenticando, autorizando, emitindo o token e
registrando os metadados depois.

#### D27 — `RenderExecutor` obrigatório; render é um worker em Docker

*Revisa D20. Ajustada em 2026-08-07 por decisão do CEO.*

```ts
interface RenderExecutor {
  render(request: RenderRequest): Promise<RenderResult>;
}
```

O render autoritativo é um **worker/API containerizado**, com a **mesma imagem** nos dois
ambientes:

| Ambiente | Host | Endereço |
|---|---|---|
| Desenvolvimento | Docker no WSL | `localhost:28900` |
| Produção | Docker num droplet | endpoint configurado |

```text
services/renderer/          # Node + TeX Live + Poppler
├─ Dockerfile
├─ src/                     # HTTP: POST /render · GET /render/:id · GET /health
└─ tex/                     # profiles + preâmbulos pré-compilados (.fmt)
```

**Consequência boa: a divisão local × cloud desaparece.** Não há mais
`LocalLatexRenderExecutor` versus `CloudLatexRenderExecutor` — há um `RenderWorkerExecutor` cujo
`baseURL` muda. O que se testa em desenvolvimento é literalmente o que roda em produção, e a
Fase 6.5 não precisa mais estudar viabilidade de render em nuvem: já está respondida.

**Local-first preservado.** Docker no WSL é local e funciona com a internet desligada — a
premissa de D21 continua valendo. Um `LocalProcessRenderExecutor` que chama `pdflatex`
diretamente permanece possível como fallback de conveniência, já que o TeX Live está instalado na
máquina (§2.1), mas não é o caminho principal.

**Segurança** (spec §12.4): autenticação por segredo compartilhado; container sem rede de saída;
limites de CPU, memória e timeout; diretório temporário por job; sem `shell-escape`.

Módulos editoriais **nunca** chamam a compilação diretamente.

#### D28 — `SourceAnchor` com coordenadas normalizadas

*Consequência de D22.*

```ts
interface SourceAnchor {
  id: string;
  sourceAssetId: string;
  pageNumber: number;
  xNormalized: number;       // 0..1
  yNormalized: number;       // 0..1
  widthNormalized: number;   // 0..1
  heightNormalized: number;  // 0..1
  rotation?: number;
  cropAssetId?: string;
}
```

**Razão.** Coordenadas normalizadas entre 0 e 1 permitem reconstruir o recorte independentemente
de DPI, resolução, tamanho da imagem e tamanho do preview. Isso **substitui** os campos
`bboxX`/`bboxY`/`bboxWidth`/`bboxHeight` em unidades absolutas que a spec §8.8 propunha.

#### D29 — Asset fonte é preservado e imutável; `sha256` é central

- Fontes e originais são tratados como **imutáveis**. Arquivo mudou? Não sobrescrever o Asset —
  criar outro.
- `SOURCE_PDF` existe permanentemente e **nunca** é substituído por OCR, PNG, crops ou texto
  extraído. Esses são derivados.
- Guardar `SourceAnchor` **e** o `CROP`: o anchor é a fonte lógica, o crop é derivado útil
  (evidência visual, input exato do OCR, cache, comparação antes/depois). O sistema deve poder
  reconstruir o crop a partir de PDF + página + bbox.
- **Cadeia de proveniência** que o produto precisa saber responder:

```text
Question → SourceAnchor → SOURCE_PDF/SOURCE_IMAGE → page + bbox
        → CROP → recognition run → LaTeX candidato
```

- **Políticas de retenção distintas.** Fontes (`SOURCE_*`, `FIGURE_SOURCE_*`, `CROP`) são
  patrimônio. Derivados (`RENDER_PDF`, `RENDER_PNG`, `RENDER_SVG`) são reconstruíveis e podem ser
  descartados.
- **Nada de binário no banco.** PDFs, imagens, EPS, SVG, GeoGebra, PGF, gnuplot, Asymptote,
  `.tex` de figura, `.table`, crops e artefatos vão para o `StorageProvider`. O banco guarda
  metadados e relações.
- **Filesystem efêmero de function nunca é storage.** Serve para compilar, descompactar e
  transformar; depois persiste no `StorageProvider` ou descarta.

#### D30 — Fase 6.5 — Cloud Compatibility Spike

Prova arquitetural curta, executada logo após a Fase 6, antes de o projeto crescer. Não é
migração, não muda o ambiente principal. Detalhamento em §8.

**Guarda-corpo** (auditoria §46): se o time começar a gastar semanas fazendo infraestrutura cloud
na 6.5, o escopo está errado. Implementar o mínimo para provar ou reprovar a portabilidade.

#### D31 — Inventário de volume em bytes · **EXECUTADO**

Realizado em 2026-08-07. Resultado e conclusões em §2.10.

#### D32 — Backup recorrente do worker no formato de exportação

*Decisão do CEO, 2026-08-07.*

O host do worker executa **backup recorrente** dos workspaces, produzindo arquivos no **mesmo
formato `.lbb`** da exportação manual (D18) — não um dump paralelo, não um formato próprio.

**Por que isso importa mais do que parece.** Backup e exportação passam a compartilhar um único
caminho de código, o que traz três consequências:

1. **O teste de round-trip da Fase 13 passa a validar os backups.** Um backup que não restaura é
   a falha clássica de sistemas de backup; aqui ela é detectada pela suíte, não por um desastre.
2. **Um backup é imediatamente utilizável** — abre no app como qualquer `.lbb`, sem ferramenta de
   restauração dedicada.
3. **Nenhum formato novo para versionar.** O `formatVersion` do manifesto já cobre os dois usos.

Parâmetros (retenção, frequência, destino) são configuração de operação, não de domínio.

#### D33 — Paridade dev/prod (PostgreSQL + S3 locais) · **SUSPENSA**

*Proposta em 2026-08-07 após D32. Suspensa na mesma data pela segunda auditoria.*

A proposta era rodar a stack de produção inteira localmente — `vercel dev`, PostgreSQL em Docker,
storage S3-compatible (MinIO) e o worker — de modo que subir para a nuvem fosse trocar variáveis
de ambiente em vez de trocar tecnologia.

**Por que está suspensa.** A segunda auditoria aprovou explicitamente SQLite como banco principal
local (§2.1) e `LocalFileStorageProvider` como implementação inicial (§2.4), e estruturou a Fase
6.5 sobre os pares `SQLite ↕ PostgreSQL` e `LocalFileStorage ↕ Vercel Blob` (§31) — pares que
D33 esvaziaria, por não haver troca a provar.

**Observação para uma eventual retomada.** O parecer não menciona D33 nem D34 em nenhum ponto, o
que sugere que avaliou o estado anterior a elas. O mérito da proposta — eliminar a troca em vez
de prová-la — permanece em aberto e exigiria parecer específico. O custo que pesava contra era
tornar Docker pré-requisito para desenvolver.

#### D34 — Storage S3-compatible como adapter primário · **SUSPENSA**

Suspensa junto com D33, pelo mesmo motivo. `S3StorageProvider` volta ao papel que a auditoria
§2.4 lhe dá: **possibilidade futura**, atrás da mesma interface.

A observação sobre **DO Spaces** continua válida para quando o destino cloud dos assets for
decidido: sendo S3-compatible e ficando no mesmo datacenter do droplet, evita tráfego entre
nuvens a cada render. Comparar com Vercel Blob na ocasião.

---

### 3.6 Ajustes de fronteira — segunda auditoria

Origem: [segunda auditoria](../prompts/260807-02.Segunda.Auditoria.md). Parecer: aprovado com
ajustes, 9/10, com autorização para iniciar a Fase 0 depois de incorporados.

#### D35 — O renderer é storage-agnostic

*Ajuste obrigatório 1 (§3–§7). Resolve uma contradição real do plano anterior.*

**A contradição.** O plano exigia, ao mesmo tempo, que o container do renderer não tivesse rede
de saída **e** que ele gravasse artefatos via `StorageProvider` remoto. As duas coisas não podem
ser verdadeiras: sem egress, o renderer não alcança Vercel Blob nem qualquer object storage.

**A decisão.** O renderer não conhece storage, banco, workspace nem Prisma. Ele compila e
devolve bytes; **quem persiste é a aplicação**.

```text
Next.js  ──RenderBundle──▶  Renderer Docker  ──RenderResult──▶  Next.js  ──▶  StorageProvider
```

```ts
interface RenderBundle {
  jobId: string;
  sourceLatex: string;
  profile: string;
  assets: RenderAsset[];        // enviados junto: multipart, tar/zip ou stream
  options: RenderOptions;
}

interface RenderResult {
  success: boolean;
  pdf?: Uint8Array;
  png?: Uint8Array;
  diagnostics: RenderDiagnostic[];
  stdout?: string;
  stderr?: string;
  durationMs: number;
}
```

O mecanismo concreto de transporte dos assets (multipart, tar, zip, stream) fica para a Fase 6.

**Consequências, todas boas:** o container pode ficar sem rede de saída de verdade; funciona
igual com `LocalFileStorage` ou com Blob, sem alterar o renderer; a imagem Docker permanece
idêntica entre local e produção; e o worker não precisa de credencial de storage nem de banco —
portanto não pode vazá-las.

#### D36 — Backup é um processo separado do renderer

*Ajuste obrigatório 2 (§8–§10, §30). Corrige D32.*

D32 dizia "backup recorrente do worker". Isso empurrava responsabilidade demais para dentro de um
serviço cuja função é uma só: **compilar LaTeX**.

Rodar no mesmo host não significa pertencer ao mesmo serviço:

```text
Droplet
├── latex-renderer          (compila; sem estado, sem credenciais)
└── latexbookbank-backup    (usa PortableArchiveWriter, gera .lbb)
```

O backup reutiliza o **mesmo `PortableArchiveWriter`** da exportação manual:

```text
PortableArchiveWriter
       ├── Export manual
       └── Backup recorrente
```

Isso preserva o ganho central de D32 — um formato só, um caminho de código, coberto pelo mesmo
teste de round-trip — e remove o acoplamento indevido.

#### D37 — `.lbb` usa um schema portátil versionado, não o schema de runtime

*Ajuste obrigatório 3 (§11–§13).*

O plano anterior descrevia `data.sqlite` como "espelho do schema de runtime". Isso amarraria o
formato de arquivo à evolução interna da aplicação: qualquer migration do Prisma quebraria
compatibilidade dos arquivos antigos.

**A decisão.** Existe um **Portable Schema** próprio e versionado, e a exportação é uma
**projeção**:

```text
Runtime Domain          Runtime Domain v8
      ↓                       ↓
Export Projection       Export Projection
      ↓                       ↓
Portable Schema v1      Portable Schema v2
      ↓                       ↓
  data.sqlite             data.sqlite
```

Assim o Prisma pode mudar, as migrations podem mudar, SQLite pode virar PostgreSQL e nomes
internos podem mudar — **sem destruir a compatibilidade dos `.lbb` já gerados**.

O `manifest.json` declara `formatVersion`. O importador tem **migradores de formato**
(`LBB v1 → v2 → runtime atual`) quando fizer sentido, e **nunca adivinha** versão desconhecida:
recusa com mensagem clara.

**Consequência para a Fase 13:** o round-trip deixa de ser "exportei e reimportei o mesmo schema"
e passa a exercitar duas projeções — runtime → portable e portable → runtime. É mais trabalho, e
é o que faz o formato sobreviver ao produto.

---

#### D38 — `sortKey` exige `COLLATE "C"` no PostgreSQL

*Descoberta na Fase 2, ao implementar o fractional indexing.*

A chave de ordenação é base-62 e mistura maiúsculas e minúsculas por construção: `A`–`Z` codificam
a parte negativa, `a`–`z` a positiva. A ordem lógica é a **ordem de bytes**.

O SQLite compara `TEXT` em binário por padrão, então serve direto. **O PostgreSQL não.** Com a
colação usual (`en_US.UTF-8`), a comparação ignora caixa: `a0` viria antes de `Z0`, e todo item
inserido antes do primeiro apareceria depois dele — a lista inverteria em silêncio, sem erro
nenhum.

**A decisão.** Na migração do schema para PostgreSQL (Fase 6.5), a coluna `sortKey` é declarada
`COLLATE "C"`, e o índice que a usa também. Vale para `DocumentNode.sortKey` e para
`QuestionOption.sortKey`.

Registrado agora, e não quando a Fase 6.5 chegar, porque é o tipo de diferença que passa por
todos os testes de unidade e só aparece com dados reais no motor novo. O teste de portabilidade
da ordenação demonstra o cenário exato.

---

### 3.7 Captura em volume — decisões de 2026-09-10

*Rodada de grilling sobre a distância entre o que o autor imaginava e o que a Fase 14/15
entregou. As três expectativas eram: um botão de scan que varre o livro; circular um trecho e o
LLM converter em LaTeX; e o livro aberto ao lado da questão. A segunda existe inteira desde a
Fase 15. A primeira existe pela metade — estimar, recortar em lote e transcrever, parando antes
de criar questão. A terceira quase não existe: é a aba Origem, entre outras quatro, que não
acompanha a troca de questão.*

#### D39 — O scan **cria** questões a revisar; não devolve sugestões

O lote de 02/09 para em "recorte salvo e transcrição guardada", e cada questão ainda nasce de um
gesto: escolher destino, escolher tipo, clicar em criar. Para uma página, é honesto. Para um
livro de trezentas questões, é o mesmo trabalho manual com um passo a menos.

A alternativa oposta — criar questões prontas — está descartada pelo
[benchmark de reconhecimento](./recognition-benchmark.md): 2 de 6 casos limpos, com erro de
dígito e de sinal que o modelo local **não** corrige por ajuste de prompt, porque é falha de
percepção. Aceitar isso em silêncio é envenenar o acervo.

**A decisão é o meio-termo:** o scan cria a questão no destino, com o recorte e a âncora ligados
e o LaTeX **como o modelo devolveu**, marcada como *a revisar*. A revisão deixa de ser um
pedágio na captura e vira trabalho de editor, no ritmo de quem edita, com o livro do lado (D43).

#### D40 — *A revisar* é derivado, não é coluna nova

`Question.status` já tem `DRAFT · READY · ARCHIVED`, e o import legado grava `READY` enquanto a
criação manual grava `DRAFT`. Uma questão em `DRAFT` **cuja âncora tem LaTeX cru ainda não
conferido** é exatamente "ninguém leu isto". É o que a fila de captura já faz com
`SourceAnchor`, pela mesma razão registrada em `capture-queue.ts`: o dado durável já existe, o
estado é uma pergunta sobre ele.

Nada de `TO_REVIEW` no enum, nada de tag automática. O filtro *a revisar* na árvore e na busca
deriva do par. Conferir e aceitar promove para `READY`, como já acontece hoje.

#### D41 — Perfil de captura é preset no código, e o livro lembra o seu

A segmentação atual conhece **um** padrão: prova de concurso, marcador `1.` ou `Questão 12` na
margem esquerda, sequência crescente. Provada com 30 de 30 na prova do ENA. Livro-texto é outro
mundo — teoria antes, bloco de exercícios depois, respostas no fim do volume.

Um perfil declara oito coisas: marcadores de início de questão · marcador de fim ou de solução ·
títulos de capítulo e de seção · marcador do bloco de exercícios · onde ficam as respostas (fim
do livro, fim do capítulo, logo abaixo, nenhuma) · número de colunas · tipo padrão da questão
criada · modelo de visão.

**Presets no código, não tela de edição.** Cada perfil nasce com um livro real na mão e um teste
com o PDF dele, como a segmentação nasceu com o ENA. Tela para editar expressão regular é
cerimônia antes de existirem cinco perfis — e regex editável por formulário é a classe de
recurso que parece poder e entrega frustração. A publicação guarda qual perfil usa.

#### D42 — A seção do livro ganha corpo, em LaTeX — [ADR 0001](../adr/0001-corpo-do-no.md)

Capítulo e seção passam a ter conteúdo próprio, editado no mesmo Monaco e compilado pelo mesmo
worker. É o que dá lugar à teoria que o scan de livro-texto lê junto com os exercícios.

**Consequência que importa:** o `.lbb` chega à `formatVersion` 2, e nasce o primeiro migrador
`v1 → v2` — o que a D37 previa "quando fizer sentido". Detalhes, alternativas rejeitadas e o
efeito sobre as 5 figuras órfãs de Fundamentos estão no ADR.

#### D43 — "Ver fonte" **troca** o painel direito; não é aba nem terceira coluna

O PDF ao lado do editor é o que torna a revisão em lote suportável: ler o recorte original e
corrigir o LaTeX sem trocar de tela.

Terceira coluna está fora por medida, não por gosto: em 1366×768 o editor já cai para ~240 px
com o painel do agente aberto (#197). Sexta aba também está fora — a aba Origem, que já faz
quase isto, é precisamente o que o autor não encontrou em um mês de uso.

**A decisão:** um botão *Ver fonte* ao lado de "Preview rápido" troca o painel inteiro pelo PDF,
aberto na página da âncora com a caixa marcada, acompanhando a troca de questão. A escolha fica
lembrada por livro. Em questão sem âncora — o acervo legado inteiro — o botão não aparece.

---

#### D44 — A fonte do livro se anexa, e o Calibre é uma origem, não um dono

*Decidida em 2026-09-10, ao perguntar como associar uma publicação existente a um livro do
Calibre. A resposta era: não dá — e o caminho que promete fazer isso mente.*

`Publication.sourcePdfAssetId` tem dois escritores no repositório inteiro: `attachOrigin`, da
importação do Calibre, que **só sabe criar publicação nova**; e o script
`backfill-legacy-assets.ts`. **Nenhuma tela escreve.** Enquanto isso, o resumo do livro sem fonte
mostra a pendência `sem-fonte` com um botão **Anexar** que leva à ingestão — onde o upload cria
um `Asset` com `publicationId` nulo e vai embora. A pessoa anexa, a tela responde, e nada fica.

Está no banco de dev como evidência: um `SOURCE_PDF` chamado "Curso de Analise Vol. 1 - Elon
Lages Lima.pdf" com `publicationId` nulo, ao lado da publicação de mesmo nome com
`sourcePdfAssetId` nulo. A tentativa aconteceu e o app a perdeu em silêncio.

**A decisão, em cinco partes.**

1. **Anexar existe, e é do livro.** O gesto mora no resumo do livro, que é onde a falta já é
   dita. Duas origens: do computador e do catálogo do Calibre — e o catálogo é a tela que já
   existe, aberta em modo "escolher para este livro", não um diálogo novo.
2. **Anexar traz arquivo e capa, e nada mais obrigatoriamente.** Os metadados que o Calibre tem e
   o livro não — editora, ano, ISBN — são **oferecidos** para preencher só os campos vazios, com
   a lista à vista antes de confirmar. Sobrescrever, nunca: o que a pessoa digitou vale mais que
   o que o Calibre adivinhou.
3. **O vínculo não persiste.** Anexado o arquivo, o Calibre não importa mais — sem sincronia, sem
   releitura, sem campo de ligação viva. É a D2 aplicada ao catálogo: origem é registro, não
   acoplamento. *Consequência aceita: a deteção de duplicata do catálogo deixa de reconhecer esses
   livros por identificador e cai para ISBN ou título parecido. Como nenhuma das 12 publicações
   tem esse registro hoje, nada piora na prática.*
4. **Sempre cópia para o `StorageProvider`.** Apontar para o arquivo onde ele está é o que o
   legado fazia com caminho absoluto, e é o que quebrou duas vezes num mês quando os discos
   mudaram de letra (D26).
5. **Trocar não apaga.** O livro aponta para um PDF fonte de cada vez, mas os anteriores
   continuam listados: os recortes já feitos apontam para eles, e sumir da tela faria a aba
   Origem de uma questão antiga referenciar algo que a interface nega.

**Vocabulário.** O mesmo objeto se chamava "Fonte editorial" no resumo do livro, "fonte do livro"
na ingestão e caía no guarda-chuva "Asset fonte" do glossário, que inclui figura e recorte. É
**PDF fonte**, e está no [`CONTEXT.md`](../../CONTEXT.md).

---

#### D45 — O scan devolve uma **proposta**; a aprovação é em lote — *revisa a D39*

*Decidida em 2026-09-16, ao avaliar o [prompt 03](../prompts/) do módulo de scan estrutural.*

A D39 foi pensada para questões num nó que já existe. O scan estrutural propõe também a
**árvore** — partes, capítulos, seções, exemplos — e criar essa árvore direto no acervo é caro de
desfazer: um perfil mal calibrado espalha centenas de nós pela biblioteca.

**A decisão:** o scan grava uma *proposta de scan*, separada do acervo. Na revisão da proposta a
pessoa corrige a **estrutura** (tipo, pai, âncoras) e aprova em lote o que tem confiança alta;
nada de baixa confiança fica escondido. Aprovar materializa nós e questões em `DRAFT`, com o
LaTeX como o modelo ou a camada de texto devolveram — e a partir daí vale a D40: o LaTeX se
revisa no editor, com o *Ver fonte* da D43. O que a D39 queria evitar — o pedágio por item —
continua evitado; o que ela não previa — errar a árvore — deixa de contaminar o acervo.

A proposta guarda o que o scan propôs **e** o que a pessoa corrigiu, lado a lado, para que um
dia se possa medir perfil contra revisão. Um novo scan gera uma nova proposta; nunca sobrescreve
nem apaga conteúdo aprovado.

#### D46 — Perfil de captura é código com ganchos opcionais — *estende a D41*

Os oito campos da D41 continuam, como configuração. O que dado não expressa — validar a sequência
A–E do ENEM, dizer que hierarquia é válida, reconhecer um marco de área — vira **gancho
opcional** do perfil. Registro explícito, sem descoberta automática; perfil tem `id` e versão,
e a execução do scan grava ambos. Continua sem tela de edição.

Três perfis de saída: **`exam-v1`** (a segmentação de hoje extraída sem mudar resultado — os 30 de
30 do ENA são o teste de regressão), **`exam-enem-v1`** (o conhecimento do segmentador do TRI:
linha como âncora, divisor de colunas pelos cabeçalhos, sequência A–E na mesma margem, marcos de
área e de língua) e **`book-v1`**.

O motor genérico não é fronteira nova: vive dentro do módulo, fora de `shared/ports`, e usa
`AiProvider`, `MathRecognitionProvider` e `StorageProvider` como já existem.

#### D47 — A revisão da proposta tem tela própria, em três áreas — *a D43 vale no editor*

A D43 recusou a terceira coluna **no editor**, por medida. A revisão de uma proposta é outra
tela, de largura inteira: estrutura à esquerda, PDF com as âncoras marcadas ao centro,
propriedades à direita. Não disputa espaço com o editor nem com o painel do agente.

Selecionar um elemento abre a página e marca **todas** as suas âncoras, navegáveis; clicar numa
marca seleciona o elemento. Depois de aprovada, a questão continua ligada às marcas no PDF — o
*Ver fonte* do editor mostra todas as âncoras dela e permite acrescentar ou retirar uma.

#### D48 — Fixtures sintéticas no repositório, corpus real fora dele

Como no segmentador do TRI: os testes usam PDFs gerados (livro com capítulos, seções, exemplos e
exercícios; exercício que vira a página; páginas de 2, 1 e 2 colunas; fórmulas; prova no formato
ENEM), versionados. O corpus real — *Curso de Análise*, cadernos do ENEM, ENA — é de consumo
pessoal e fica fora do git, com caminho em `.env.local`; o teste que depende dele é pulado quando
ele não existe, e os números do corpus vão para `source-scanning-validation.md`.

#### D49 — O scan roda no servidor, página a página, e retoma de onde parou

O texto do PDF só era lido no navegador, e o lote era um laço de React: fechar a aba perdia o
que faltava. O scan lê o PDF **no servidor**, com o pdf.js para Node, num laço dentro do próprio
processo que grava um ponto de parada a cada página. Fechar a aba não interrompe; reiniciar o
servidor deixa a execução *interrompida*, e *Retomar* continua da última página gravada.
Cancelar é um estado, não uma exceção: o que já foi lido fica. Um worker separado, como o
renderer, fica para quando houver motivo — o domínio não muda com isso.

#### D50 — As âncoras são do nó, em ordem e com papel — [ADR 0003](../adr/0003-ancoras-do-no.md)

Uma tabela de ligação nó ↔ âncora, com ordem e papel. A questão acha as suas pelo nó.
`sourceAnchorId` continua como âncora principal, escrito na mesma transação, até a aba Origem e a
fila de captura migrarem.

#### D51 — A proposta vive em três tabelas, e as âncoras nascem na aprovação

`ScanRun` (a execução: perfil e versão, motor, modelos, configuração e sua chave, estado,
ponto de parada, métricas), `ScanPage` (o cache da página dentro da execução) e `ScanItem` (cada
elemento proposto, com o que o scan propôs congelado ao lado do que a pessoa corrigiu). Nenhuma
`SourceAnchor` nasce antes da aprovação: proposta descartada não deixa âncora órfã.

#### D52 — Determinismo primeiro; a IA só desempata, e a transcrição é sob medida

Sem modelo configurado, o scan faz tudo o que é determinístico. Com modelo, a IA recebe só os
itens ambíguos ou de baixa confiança, em lote, e a resposta passa por Zod antes de tocar a
proposta. O texto vem da camada do PDF; o reconhecimento matemático entra só quando a região tem
matemática que o texto nativo não representa, ou quando a pessoa pede *reprocessar*.
Parear respostas do fim do livro continua fora (Wave G).

#### D53 — Aprovar escreve sob um destino, e nada é criado duas vezes

A aprovação escreve sob um nó de destino (a raiz do livro, por padrão) e reaproveita o capítulo
que já existe com mesmo rótulo e título. A mesma combinação de PDF, perfil, versão e
configuração abre a execução existente; *novo scan* cria outra. Um item cujas âncoras coincidem
com as de um nó já aprovado (mesma página, sobreposição ≥ 80%) aparece como *já no acervo* e não
é recriado. Aprovação parcial pode; o filho só é aprovado com o pai aprovado ou já no acervo.
O mapeamento de tipos está no [ADR 0002](../adr/0002-tipos-do-scan-no-acervo.md).

#### D54 — O módulo `scan`, em inglês, e a Wave G com épico próprio

O código mora em `modules/scan/`, com as quatro camadas; a leitura de página (linhas, colunas,
mobília) é do motor, e a segmentação de hoje vira o perfil `exam-v1`, chamado pelo
`recognition`. Identificadores em **inglês**, como o schema e a maior parte do código — por
decisão do autor, ainda que a segmentação recente esteja em português. A Wave G ganha épico no
GitHub; a Fase 18 é reescrita pela D45, a 19 continua, e nascem a **20** (revisão e aprovação da
proposta) e a **21** (IA, matemática e validação), cada uma com as suas issues de trabalho.

#### D55 — O preview sabe de onde cada bloco veio, e as duas metades se apontam

Cada bloco do `PreviewModel` carrega a **origem** — o intervalo, em caracteres do LaTeX
original, que o gerou. Com ela, o cursor no editor acende o bloco correspondente no preview
rápido, e clicar num bloco leva o cursor de volta ao trecho. Vale nos dois editores, o da questão
e o do corpo do nó.

Três limites, escolhidos:

- **Granularidade de bloco** — parágrafo, fórmula, item, caixa. Para acender palavra a palavra o
  modelo teria de carregar posição em cada trecho inline, o que é muito mais invasivo do que o
  ganho justifica.
- **Só o preview rápido.** No PDF compilado o mapa fonte→página é outro problema (SyncTeX), que o
  projeto não tem.
- **Quem não sabe, não afirma.** Tirar comentários encurta o texto, então o analisador guarda o
  mapa de volta ao original; e um `\item[rótulo]` costura o rótulo ao texto do item, caso em que o
  item sai **sem** origem e quem responde pelo clique é a lista inteira. Apontar para o lugar
  errado seria pior que não apontar.

#### D56 — O exemplo é um nó, não um negrito no corpo

`NodeKind` ganha o décimo primeiro valor, `EXAMPLE`: nó com corpo próprio, dentro do capítulo, da
seção ou da subseção, sem filhos. O scan passa a capturá-lo **até a próxima fronteira** — próximo
exemplo, próximo título ou bloco de exercícios —, com a resolução junto; antes levava um parágrafo
só. Na árvore aparece o rótulo do livro e o começo do texto ("Exemplo 3 — Sejam A e B conjuntos
finitos…"). Nada é migrado: no acervo não há exemplo aprovado, e o que houver se resolve
reimportando (D57). O porquê, e o que isto revisa do ADR 0002, está no
[ADR 0004](../adr/0004-o-exemplo-vira-no.md).

#### D57 — Reimportar: a importação é apagável, e o nó lembra de onde veio

`DocumentNode` ganha a coluna com o id da execução que o criou, indexada — é ela que distingue o
nó **criado** pelo scan do nó apenas **reaproveitado**, distinção que o `metadataJson` da âncora
não faz. O gesto oferece duas coisas: apagar só a proposta, ou a proposta e o que ela criou. O que
foi criado vai para a **lixeira**; o que foi editado à mão depois da aprovação é **preservado**, e
a confirmação diz os números antes. A execução antiga sai junto. Detalhes e alternativas
rejeitadas no [ADR 0006](../adr/0006-a-importacao-e-apagavel.md).

#### D58 — A figura sai no formato que o PDF tem

Medido: o FME vol. 1 tem figura em 55% das páginas, o Curso de Análise em 4%, e nos dois ~90% são
vetoriais. Então traço vira **recorte em PDF** (`pdf-lib`, dependência nova, JS puro), foto vira o
**bitmap embutido**, e sempre sai um PNG para a tela. A figura vira asset e âncora de ilustração, e
entra no LaTeX na posição como `figure` com `\includegraphics[width=…]` e `\caption` — a legenda
do livro reconhecida e tirada do corpo. Tudo que está dentro da caixa é absorvido, inclusive as
letras desenhadas sobre o diagrama. Vale para todos os perfis: no `book-v1` a figura vai ao corpo,
nos perfis de prova vai ao enunciado. Na revisão dá para **redesenhar a caixa arrastando**, que é
o único conserto possível quando o agrupamento erra. Ver
[ADR 0005](../adr/0005-figura-vetorial-quando-o-pdf-a-tem.md).

---

## 4. Arquitetura

### 4.1 Topologia — modo local (o MVP)

```
┌── Máquina do autor ─────────────────────────────────────────────────┐
│                                                                     │
│   Next.js  ·  localhost:28080                                       │
│   Route Handlers · Use Cases · Domain                               │
│        │              │               │              │             │
│        ▼              ▼               ▼              ▼             │
│   Repository     StorageProvider  RenderExecutor  AiProvider        │
│        │              │               │              │             │
│        ▼              ▼               │              ▼             │
│    SQLite      LocalFileStorage       │           Ollama            │
│                 (filesystem)          │           :11434            │
│                       ▲               ▼ RenderBundle                │
│                       │      ┌──────────────────────┐               │
│                       └──────│ Renderer Docker      │               │
│                RenderResult  │ :28900 · sem egress  │               │
│                              │ pdflatex + pdftocairo│               │
│                              └──────────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
        Sem internet, tudo continua funcionando.
```

**Note a direção das setas do renderer (D35).** Ele recebe um `RenderBundle` e devolve um
`RenderResult`. Não toca no storage, no banco nem no workspace — quem persiste é a aplicação. É
isso que permite ao container ficar realmente sem rede de saída.

### 4.2 Topologia — modo cloud (futuro, provado na Fase 6.5)

```
    ┌─────────────┐                    ┌──────────────────────┐
    │   Vercel    │  ──RenderBundle──▶ │  Droplet · Docker    │
    │  Next.js    │  ◀─RenderResult─── │  ├─ latex-renderer   │
    └──────┬──────┘                    │  └─ backup job (D36) │
           │                           └──────────────────────┘
   ┌───────┼────────┐
   ▼       ▼        ▼
PostgreSQL Object  AI Provider
  (Neon)  Storage  OpenAI-compat
```

**Mesma imagem do renderer nos dois modos** (D27), e a aplicação continua sendo quem grava os
artefatos (D35). Renderer e backup são serviços distintos, ainda que no mesmo host (D36).

Topologia **candidata**. Marcas específicas não viram requisito de domínio.

### 4.3 Terceiro modo, apenas registrado (auditoria §27)

Um futuro *LatexBookBank Local Companion* — processo local com acesso autorizado ao filesystem,
scan de diretórios, hash, render local e Ollama — servindo uma interface hospedada na web.
**Não implementar.** A única obrigação hoje é não tomar decisão que torne isso impossível.

### 4.4 Fluxo obrigatório

```
UI (Client)
  ↓
Route Handler  ·  validação Zod na entrada e na saída
  ↓
Application Use Case
  ↓
Domain
  ↓
Repository / StorageProvider / RenderExecutor / AiProvider   ← interfaces
  ↓
Infraestrutura concreta
  ↓
SQLite | PostgreSQL   ·   filesystem | Blob   ·   local | sandbox
```

**Prisma não é o domínio** (auditoria §40). As entidades do Prisma não determinam a modelagem, e
objetos Prisma não são o contrato público até o React — criar DTOs e projeções onde necessário.

### 4.5 Fronteiras protegidas por lint, não por disciplina

Testes/regras de boundary que falham o CI quando violadas (auditoria §37):

```text
domain/**  NÃO pode importar  prisma
domain/**  NÃO pode importar  next
domain/**  NÃO pode importar  @vercel/blob
domain/**  NÃO pode importar  node:fs
domain/**  NÃO pode importar  openai  (nem SDK de IA)
domain/**  NÃO pode executar  pdflatex
```

Mais as regras de camada: infraestrutura pode; application depende de interfaces; UI depende de
use cases e API. Nenhum componente React importa Prisma. O agente não tem caminho de escrita.

### 4.6 Estrutura

```
/
├─ apps/web/
│  ├─ app/                          # App Router
│  ├─ src/
│  │  ├─ modules/
│  │  │  ├─ questions/  publications/  document-tree/  workspaces/
│  │  │  │     └─ domain/ · application/ · infrastructure/ · ui/
│  │  │  ├─ latex/  rendering/  assets/  ingestion/  portability/
│  │  │  ├─ assessments/  agents/  revisions/  settings/
│  │  ├─ design-system/             # tokens.css + componentes portados (.tsx)
│  │  ├─ shared/
│  │  └─ infrastructure/
│  │     ├─ database/   sqlite/  ·  postgres/
│  │     ├─ storage/    local/   ·  vercel-blob/
│  │     ├─ rendering/  worker/RenderWorkerExecutor.ts
│  │     └─ ai/         openai-compatible/
│  ├─ prisma/
│  ├─ data/                         # SQLite + assets locais (fora do git)
│  └─ tests/
├─ docs/
└─ _antigo/                         # symlink read-only para o legado
```

### 4.7 As quatro fronteiras primárias (D23)

```ts
// 1 — Persistência
interface QuestionRepository { get(id): Promise<QuestionAggregate | null>; /* … */ }
// idem PublicationRepository, DocumentNodeRepository, AssetRepository, RevisionRepository

// 2 — Storage
interface StorageProvider {
  put(input: PutAssetInput): Promise<StoredAsset>;   // devolve storageKey + sha256 + sizeBytes
  get(key: string): Promise<AssetStream>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

// 3 — Render  (D35: recebe bundle, devolve bytes; NÃO persiste)
interface RenderExecutor {
  render(bundle: RenderBundle): Promise<RenderResult>;
}

// 4 — IA
interface AiProvider {
  id: string;
  listModels(): Promise<AiModel[]>;
  run(request: AgentRequest): Promise<AgentResult>;
  stream?(request: AgentRequest): AsyncIterable<AgentEvent>;
}
```

| Fronteira | Implementação inicial | Candidato cloud |
|---|---|---|
| Persistence | `PrismaSqliteRepository` | `PrismaPostgresRepository` (Neon) |
| Storage | `LocalFileStorageProvider` | `VercelBlobStorageProvider` · futuro `S3StorageProvider` |
| Render | `RenderWorkerExecutor` → Docker `28900` | mesma imagem, outro `baseURL` |
| IA | `OpenAiCompatibleProvider` | mesmo provider, outro `baseURL` |

### 4.8 Outros contratos de domínio

Legítimos por representarem comportamento real, não por cerimônia (D23):

`QuestionTypePlugin` (§9) · `MathRecognitionProvider` (§13.3) · `QuestionPatch` (§14.4) ·
`QuestionSearchService` (§21) · `PortableArchive` / `PortableArchiveWriter` (§7).

---

## 5. Ajustes no modelo de domínio

A spec §8 permanece válida. O estudo do acervo real e as decisões de plataforma exigem estas
adições:

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

`storageKey` nunca contém path local — é chave opaca resolvida pelo `StorageProvider`. O domínio
conhece `storageKey`, jamais `D:\KnowChico\...`, `/mnt/t/KnowChico/...` ou
`https://algum-storage/...` (D26).

**Fonte × derivado — políticas de retenção distintas (D29):**

| Categoria | Tipos | Política |
|---|---|---|
| **Fonte** (patrimônio) | `SOURCE_PDF` · `SOURCE_IMAGE` · `FIGURE_SOURCE_*` · `FIGURE_DATA_TABLE` · `CROP` | Imutável, preservado permanentemente |
| **Derivado** (reconstruível) | `RENDER_PDF` · `RENDER_PNG` · `RENDER_SVG` | Descartável e regenerável |

Arquivo de origem alterado gera **novo** Asset, nunca sobrescrita do anterior. `sha256` é o eixo
de deduplicação, auditoria, cache, identidade, integridade e histórico.

### `SourceAnchor` — coordenadas normalizadas (D28)

Substitui os campos absolutos que a spec §8.8 propunha.

```ts
interface SourceAnchor {
  id: string;
  publicationId: string;
  sourceAssetId: string;

  pageNumber: number;

  xNormalized: number;       // 0..1
  yNormalized: number;       // 0..1
  widthNormalized: number;   // 0..1
  heightNormalized: number;  // 0..1

  rotation?: number;

  cropAssetId?: string;      // derivado; o anchor é a fonte lógica

  sourceText?: string;
  extractionMethod?: string;
  extractionModel?: string;
  metadataJson?: Record<string, unknown>;
}
```

Exemplo de valores: `x = 0.18342 · y = 0.31527 · width = 0.51431 · height = 0.08791`.

**Por que normalizadas.** Permitem reconstruir o recorte independentemente de DPI, resolução,
tamanho da imagem e tamanho do preview. E tornam desnecessário qualquer tipo espacial de banco —
ver D22: **PostGIS não entra no projeto**.

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

## 7. Formato de intercâmbio `.lbb` (D18)

Arquivo único, zip, que carrega um workspace inteiro — dados e assets — de forma autocontida.

```
biblioteca.lbb                      # zip
├─ manifest.json                    # versão do formato, workspace, contagens, criado em, checksums
├─ data.sqlite                      # Portable Schema versionado — NÃO é o schema de runtime
└─ assets/
   └─ <sha256[0:2]>/<sha256>.<ext>  # conteúdo endereçado por hash
```

**Regras.**

- `manifest.json` declara `formatVersion`. O importador recusa versão que não conhece, com
  mensagem clara — nunca tenta adivinhar.
- Assets endereçados por `sha256` do conteúdo: deduplicação natural e verificação de integridade
  na importação.
- `data.sqlite` referencia assets pelo `sha256`, nunca por path — é o que permite ao importador
  religá-los ao `StorageProvider` de destino, seja local ou Blob.
- Exportação e importação são **simétricas e testadas por round-trip**: exportar, importar num
  workspace vazio e comparar deve dar identidade.
- Importar não sobrescreve em silêncio: colisão de `legacyId`/`uuid` gera relatório e exige
  decisão, como o import legado.

**Por que SQLite dentro do zip, e não JSON.** O consumidor natural desse arquivo é um banco de
questões; SQLite dá consulta, integridade referencial e compacidade sem parser próprio. É também
continuidade direta do `.knowchico` legado, que o autor já usa há anos.

**Portable Schema versionado (D37).** `data.sqlite` **não** é cópia do schema Prisma: é um schema
próprio, versionado, alimentado por projeção. O importador possui migradores de formato
(`LBB v1 → v2 → runtime atual`) e recusa versão desconhecida em vez de adivinhar.

**Duplo papel: exportação e backup (D32, corrigida por D36).** O mesmo `PortableArchiveWriter`
serve à exportação manual e ao backup recorrente — que roda como **processo próprio**, nunca
dentro do renderer. Um caminho de código, um `formatVersion`, e o teste de round-trip da Fase 13
cobrindo os dois usos.

**Por que a projeção é indispensável.** Mesmo com SQLite dos dois lados, `data.sqlite` é gerado
por projeção, não por cópia de arquivo — é o que desacopla o formato da migration atual. O teste
de round-trip exercita as duas direções e está ligado a qualquer mudança de schema (Fase 13).

---

## 8. As 26 fases

Cada fase termina em estado verificável e em checkpoint humano. Os itens marcáveis estão em
[`_checklist.md`](./_checklist.md).

### Wave A — fundação e IDE editorial

#### Fase 0 — Fundação e providers
Workspace pnpm · Next.js App Router em `28080` · TypeScript strict · ESLint/Prettier + **as
regras de boundary da §4.5** · estrutura modular da §4.6 · **Prisma + SQLite** com o schema
núcleo (`Workspace`, `Publication`, `DocumentNode`, `Question`, `QuestionOption`, `Tag`,
`QuestionTag`, `Asset`, `SourceAnchor`) · repositories + implementação Prisma · DTOs de saída,
sem vazar objeto Prisma para o React · **as quatro fronteiras da §4.7 definidas** ·
`LocalFileStorageProvider` implementado · toda configuração de infraestrutura por variável de
ambiente · seed de demonstração · `pnpm setup` · CI.

**`pnpm setup` verifica, nesta ordem de importância** (2ª auditoria §19, §21):

| Verificação | Natureza |
|---|---|
| Docker disponível | **obrigatória** |
| Imagem do renderer buildável | **obrigatória** |
| Renderer inicia e `GET /health` responde | **obrigatória** |
| Provider de IA alcançável | informativa |
| `pdflatex`/`pdftocairo` no host | **fallback opcional**, nunca bloqueia |

**Aceite:** `pnpm setup && pnpm dev` sobe em `28080` sem colidir com nenhum container existente;
seed cria publicação demo navegável; upload e leitura funcionam pelo `LocalFileStorageProvider`
com `sha256` calculado; ausência de TeX no host **não** impede o setup; CI verde; as regras de
boundary falham o lint quando violadas propositalmente.

#### Fase 1 — Design system e shell
Portar `tokens.css` re-tokenizado · portar componentes `.jsx` → `.tsx` · incorporar
`_adherence.oxlintrc.json` ao lint · 3 temas · zonas conforme D14 · statusbar · Ctrl+K ·
Radix headless para context menu/tooltip/popover.
**Aceite:** checklist visual §34; utilizável em 1366×768 e excelente em 1920×1080; larguras das
divisórias persistem entre sessões; lint de aderência rejeita hex cru.

#### Fase 2 — Árvore de documento
`GET /api/publications/:id/tree` · estender o `Tree` do DS com virtualização, ícones por
`NodeKind` e indicadores de estado · CRUD de nós · rename inline (F2) · exclusão lógica e
restauração · fractional indexing com testes de propriedade · mover e reordenar via `dnd-kit`
com validação de ciclo · busca e filtro · breadcrumb · menu de contexto · atalhos.
**Aceite:** §33 "Árvore" completo; testes de ordenação e de movimento passam, incluindo
rebalanceamento de rank.

#### Fase 3 — Monaco e autosave
Monaco como client component isolado com dynamic import · language configuration LaTeX ·
model por campo · abas internas · autosave com debounce · dirty state · `Ctrl+S` ·
concorrência otimista por `updatedAt` com detecção de conflito.
**Aceite:** edita e persiste; conflito é detectado e apresentado, nunca sobrescrito em silêncio;
sem erro de hidratação.

#### Fase 4 — Conhecimento LaTeX do legado *(antecipada da Wave D)*
Importador idempotente de `LatexMetadata.db` (653 autocompletes, 2.741 símbolos, 13 grupos,
29 menus) · conversão do delimitador legado `§` para placeholders nativos do Monaco ·
completion provider · snippets com navegação por tab · palette de símbolos.
**Aceite:** autocomplete e snippets funcionam com o acervo legado real; relatório de import
mostra contagens conferindo com as da §2.5.

**Por que antecipada:** é SQLite de leitura, independente do acervo de questões. Entrega o maior
salto de qualidade do editor pelo menor custo, e não depende de nenhuma decisão pendente.

#### Fase 5 — Fast Preview
`PreviewModel` · renderização React + MathJax · aviso permanente de divergência · debounce.
**Aceite:** latência percebida como imediata; o aviso da §11 está visível.

#### Fase 6 — Worker de render autoritativo *(D27, D35)*
`services/renderer` com Dockerfile (Node + TeX Live + Poppler) · **contratos `RenderBundle` e
`RenderResult`** · decisão do transporte dos assets (multipart, tar/zip ou stream) · contrato
HTTP `POST /render`, `GET /render/:id`, `GET /health` · autenticação por segredo compartilhado ·
container **sem rede de saída**, sem credencial de storage, sem credencial de banco, com limites
de CPU, memória e timeout · `pdflatex` via `execFile` com argumentos, diretório temporário por
job, sem `shell-escape` · `pdftocairo` → PNG · **o renderer devolve bytes; a aplicação é quem
chama `StorageProvider.put`** · `docker compose` expondo `28900` · `RenderWorkerExecutor` no lado
da app · `LatexProfile` + profile "Legacy Compatibility" · `LatexBuilder` alimentado pelo
`QuestionTypePlugin` · `RenderJob` persistido · cache por content hash · coalescing · abas
PDF/PNG/Log/Source · `Ctrl+Enter` · diagnósticos mapeados para linha · **preâmbulo pré-compilado
(`mylatexformat`) com ganho medido antes/depois**.

`GET /health` responde algo como:

```json
{ "status": "ok", "rendererVersion": "1.0.0",
  "pdfLatexVersion": "...", "pdfToCairoVersion": "...", "profileCount": 3 }
```

**Aceite:** `docker compose up` sobe o worker em `28900` e a app conversa com ele; compila
`tikz`, `pgfplots`, `siunitx`, `xlop` e `cancel`; **o worker roda sem nenhuma credencial e sem
rede de saída**; cache hit medido; erro de TeX aparece como diagnóstico, não como stack trace;
worker indisponível degrada com mensagem clara, sem perder edição; ganho do preâmbulo registrado
com número; a imagem é a mesma que irá para o droplet.

#### Fase 6.5 — Cloud Compatibility Spike *(D30)*

**Objetivo único:**

> provar que **banco e storage** podem trocar de implementação sem reescrever domínio e use cases.

Não é migração. Não é produção. Não muda o ambiente principal. Terminada a fase, **volta-se ao
desenvolvimento local**.

**Os dois pares a testar:**

```text
SQLite            LocalFileStorage
   ↕ teste            ↕ teste
PostgreSQL        Vercel Blob
```

**Render está fora do escopo** (2ª auditoria §32). Ele já foi provado na Fase 6, e a mesma imagem
Docker roda nos dois ambientes. Os arquivos `render.pdf` e `render.png` que aparecem na amostra
são **artefatos pré-gerados na Fase 6**, usados apenas como carga de teste do `StorageProvider` —
provar upload, leitura, persistência e referência de `Asset`. Nenhuma compilação acontece aqui.

**Amostra mínima:** 1 workspace · 1 publication · 1 chapter · 1 section · 10 questions ·
alternatives · tags · 1 PDF original · 3–5 assets · 1 crop · 1 SourceAnchor · 1 `render.pdf` e
1 `render.png` pré-gerados.

**Verificar que continuam funcionando sem mudança de domínio:** `Question` · `Publication` ·
`DocumentNode` · `QuestionOption` · `Asset` · `SourceAnchor` · `Revision` — mais save, optimistic
concurrency, upload, download, hashes, relations, timestamps e UUIDs.

A suíte de integração pertinente precisa rodar contra **SQLite** e contra **PostgreSQL**.

**Entregável: `Cloud Compatibility Report`** — diferenças SQLite/PostgreSQL, problemas de
migrations, problemas do Prisma, diferenças de constraints e índices, problemas de storage, de
paths, de uploads, de assets, mudanças necessárias. Ou "nenhum problema encontrado".

**Aceite:** relatório escrito; suíte verde nos dois motores, ou lista explícita do que falhou e
por quê; **nenhuma reescrita de domínio foi necessária** — ou a fronteira violada está
identificada; desenvolvimento voltou ao modo local.

**Guarda-corpo.** Semanas gastas em infraestrutura cloud aqui significam escopo errado. O spike
implementa o mínimo para provar ou reprovar a portabilidade.

### Wave B — banco de questões

#### Fase 7 — Tipos, alternativas e metadados
Registry `QuestionTypePlugin` · plugins Discursiva e Múltipla Escolha com N alternativas ·
`QuestionOption` por UUID com letra calculada na projeção · editor de alternativas com
reordenação por drag, marcação de correta e "embaralhar visualização" · metadados editoriais ·
tags com autocomplete · `validate_question`.
**Aceite:** §33 "Questão" completo; existe um teste que prova que o gabarito sobrevive à
reordenação das alternativas.

### Wave C — agente

#### Fase 8 — Provider e painel (somente leitura)
`AiProvider` + `OpenAiCompatibleProvider` · perfis (OpenRouter, OpenAI, Ollama, custom) ·
matriz de capacidades · settings com "testar conexão" · chave apenas no servidor · painel no
`aside` com FAB `✦` · `AgentContext` via `AIContextBar` · tools somente leitura · timeline com
`ToolCallCard` · modo `ASK` · `AgentRun` persistido.
**Aceite:** o modelo sabe exatamente qual questão está aberta; nenhuma tool de escrita está
exposta; Ollama offline não impede o uso normal do app; ausência de chave mostra instrução clara.

#### Fase 9 — Patch, diff e aprovação
`QuestionPatch` em Zod com whitelist · tools `propose_*` · diff por campo e diff Monaco ·
`render_candidate_latex` isolado e sem escrita · aplicação transacional criando revisão anterior ·
aplicar tudo / aplicar seleção / rejeitar / pedir revisão / reverter · modos `REVIEW`,
`FIX_LATEX` (iterativo, máximo 3, com timeout global), `ENRICH`, `STRUCTURE` · critérios da §36.
**Aceite:** §35 inteiro; E2E da §27 passa ponta a ponta; toda tentativa fica auditada.

#### Fase 10 — Revisões e histórico
`Revision` com origem `USER`/`IMPORT`/`AGENT`/`SYSTEM` · aba Histórico com timeline, diff e
restauração.
**Aceite:** restaurar uma revisão devolve o estado exato e fica auditado.

### Wave D — acervo legado e portabilidade

#### Fase 11 — Importação do legado *(roda localmente — auditoria §43)*
`LegacyReader` read-only com **detecção das 3 gerações de schema** · scanner e relatório de
integridade · mappers da §6 · biblioteca → `Workspace` · assets do filesystem gravados via
`LocalFileStorageProvider`, com classificação por tipo de fonte de figura · **`ITA/Material` e
`Listas/` explicitamente ignorados, e o relatório diz que ignorou** (§2.10) · dry-run · import
idempotente · `ImportReport` · **afirmação das 4 invariantes da §6**.

O importador precisa de acesso direto às bibliotecas e aos arquivos. Não obrigar o autor a subir
109 MB de patrimônio para simplesmente começar. Sincronizar workspace com a nuvem depois é um
problema **distinto** de importar o legado na nuvem — e não entra no MVP (auditoria §44).

```text
Legacy filesystem → scanner local → LegacyReader → mapper → SQLite novo → LocalFileStorage
```

**Aceite:** §33 "Legado" completo; as 13 bibliotecas importam; rodar duas vezes não duplica nada;
as contagens batem com as da §2.3 ou o relatório explica cada divergência.

#### Fase 12 — Busca
`QuestionSearchService` abstrato · busca por texto, tags, banca, instituição, ano, tipo e
dificuldade · integração com `Ctrl+K` · avaliação do **FTS5 do SQLite** com benchmark sobre o
acervo importado, e decisão documentada.
**Aceite:** encontra questão importada por qualquer um dos critérios; decisão sobre FTS5
registrada com números; a interface permanece agnóstica, de modo que o full-text do PostgreSQL
possa substituí-la sem tocar em use case.

#### Fase 13 — Portabilidade `.lbb` *(D18, D32, D36, D37)*
Módulo `portability` · **`PortableSchema` versionado**, independente da migration atual do Prisma ·
`PortableArchiveWriter` e `PortableArchiveReader` · **projeção runtime → portable** na exportação
e **portable → runtime** na importação · escrita do zip com `manifest.json`, `data.sqlite` e
assets endereçados por `sha256` · verificação de `formatVersion` e checksums · **migradores de
formato** (`LBB v1 → v2 → runtime atual`) quando fizer sentido · recusa explícita de versão
desconhecida, sem adivinhar · religação dos assets ao `StorageProvider` de destino · relatório de
colisões, sem sobrescrever em silêncio · UI de exportar e importar workspace · **job de backup
recorrente como processo próprio** (`services/backup`), reutilizando o mesmo
`PortableArchiveWriter` — nunca dentro do renderer.

**Aceite:** round-trip completo exercitando **as duas projeções** — exportar um workspace,
importar num vazio e comparar dá identidade; arquivo corrompido ou de versão futura é recusado
com mensagem clara; assets duplicados aparecem uma vez só no zip; **um arquivo produzido pelo
backup automático abre e restaura como um export manual**, provado pelo mesmo teste; o teste está
ligado a qualquer mudança de schema.

### Wave E — ingestão visual

#### Fase 14 — Assets, PDF e crop
Ingestão via `StorageProvider` (sha256, validação de MIME, limite de upload) · upload,
drag-and-drop e `Ctrl+V` · inserção assistida de figura · visualizador de PDF com zoom e
navegação · ferramenta de crop com bounding box → `SourceAnchor` + `Asset(CROP)`.
**Aceite:** §33 "Assets" completo; a origem é sempre preservada; nenhuma chave de storage escapa
do prefixo do workspace.

#### Fase 15 — Reconhecimento matemático
`MathRecognitionProvider` · implementação via modelo multimodal por endpoint OpenAI-compatible,
mais opção local · fluxo crop → LaTeX candidato → fast preview → editar → render → aceitar.
**Aceite:** um crop vira LaTeX editável; o crop original nunca é descartado; falha do provider não
perde trabalho do usuário.

### Wave F — diferencial de produto

#### Fase 16 — Avaliações e variantes
PRNG determinístico com testes · entidades de `Assessment` · embaralhamento preservando
`optionId` · persistência de seed, ordens e mapa `optionId → displayedLabel` ·
`DocumentTemplate` · exportação aluno, professor e gabarito.
**Aceite:** a mesma seed reproduz a mesma prova byte a byte, em execuções e processos diferentes.

#### Fase 17 — Endurecimento
Página de diagnósticos (§25) **consultando `GET /health` do worker**: versão do app, path do
SQLite, storage ativo e sanidade, saúde do renderer com `rendererVersion`, `pdfLatexVersion`,
`pdfToCairoVersion` e `profileCount`, TeX do host (informativo, marcado como fallback opcional),
último backup `.lbb` com data e resultado, provider de IA e modelo, Ollama disponível, tamanho do
cache, jobs, último erro · logs estruturados de render, import, agente e persistência, sem prompts completos
por padrão · guard central de `workspaceId` · secrets apenas em `.env.local` · E2E completo do
fluxo crítico da §27 · revisão final das regras de boundary da §4.5.
**Aceite:** Definition of Done global da §28 auditado item a item; o app roda ponta a ponta com a
internet desligada; a página de diagnóstico reflete o estado real do worker; nenhuma secret no
repositório; nenhuma configuração de infraestrutura hard-coded.

> O deploy em produção **não** faz parte deste plano. A prova de que ele é viável é a Fase 6.5;
> a execução dele é decisão posterior de negócio.

### Wave G — captura em volume

*Decidida em 2026-09-10 (§3.7). A Wave E entregou o gesto unitário: circular um trecho e receber
LaTeX. Esta wave é o que falta para digitalizar um livro inteiro sem repetir esse gesto trezentas
vezes.*

#### Fase 18 — Scan estrutural: motor, perfis e proposta *(revista em 2026-09-16 pela D45)*
**Anexar a fonte do livro** (D44): o gesto no resumo do livro, com as duas origens — computador e
catálogo do Calibre em modo "escolher para este livro" —, cópia sempre para o `StorageProvider`,
oferta de preencher só os metadados vazios, PDF anterior listado ao trocar, e o conserto do
`Anexar` que não anexava · **várias âncoras por nó**, em ordem e com papel (D50, ADR 0003) · o
PDF lido **no servidor**, por linha, com fonte, imagem e desenho (D49) · mobília, colunas por
evidência e ordem de leitura · perfil de captura como código, com os oito campos da D41 e ganchos
(D46), registrado explicitamente, e `Publication.captureProfileId` · `exam-v1` (a segmentação de
hoje, sem mudança — ENA 30 de 30), `exam-enem-v1` (o conhecimento do segmentador do TRI) e
`book-v1` (com o *Curso de Análise* como livro real) · a **execução** persistida, retomável,
cancelável e idempotente, que devolve uma **proposta de scan** separada do acervo (D45, D51) ·
*a revisar* derivado de `DRAFT` + âncora de máquina (D40), com filtro na árvore e na busca, e o
gesto de conferir · **Ver fonte** no editor, com todas as âncoras da questão (D43, D47).
**Aceite:** um intervalo de páginas do ProfMat vira questões *a revisar* no nó escolhido, cada
uma com recorte e âncora; o filtro *a revisar* mostra exatamente essas; abrir uma delas mostra o
PDF ao lado, na página certa; conferir promove para `READY` e some do filtro; o mesmo scan rodado
duas vezes não duplica questão; o exercício que vira a página é um item com duas âncoras.

#### Fase 19 — Corpo do nó
`DocumentNode.bodyLatex` · edição no mesmo Monaco, com preview rápido, render autoritativo e
revisão em histórico · gesto manual "mandar para o corpo da seção" a partir de um recorte
reconhecido · **Portable Schema v2** e o migrador `v1 → v2` (D37, D42) · o perfil de captura
passa a saber onde a teoria acaba e os exercícios começam, mandando o que vem antes para o corpo
do nó, também a revisar.
**Aceite:** uma seção com teoria compila junto com as questões que ela contém; um `.lbb` v1
gerado antes desta fase importa sem perda; o round-trip de um `.lbb` v2 com corpo de nó dá
identidade; o *Curso de Análise* tem uma seção com teoria e exercícios, ambos vindos do PDF.

#### Fase 20 — Revisão e aprovação da proposta *(D45, D47, D53)*
Tela própria em três áreas — estrutura, PDF com todas as âncoras, propriedades — com árvore e
PDF sincronizados · as operações de revisão da §36 do prompt 03 · aprovação em lote sem esconder
baixa confiança · aprovação transacional sob um destino, com o mapeamento do ADR 0002, capítulo
existente reaproveitado e *já no acervo* por sobreposição de âncora.
**Aceite:** um scan do livro sintético é revisado e aprovado; os nós aparecem na árvore; o
exercício de duas páginas abre com as duas âncoras; aprovar de novo não duplica. E2E do caminho.

#### Fase 21 — IA, matemática e validação *(D52)*
Desempate pelo `AiProvider` só nos itens duvidosos, com resposta validada · reconhecimento pelo
`MathRecognitionProvider` só onde o texto do PDF não basta, uma imagem por âncora · o scan
funciona sem modelo · `source-scanning-validation.md` medido no corpus real (D48).
**Aceite:** nenhuma saída de modelo chega ao acervo sem aprovação; o relatório traz os números
medidos e diz o que não mediu.

#### Fase 22 — O exemplo como galho *(D56, ADR 0004)*
`EXAMPLE` no `NodeKind` e nas telas que conhecem tipo — validador, ícones da árvore, menu de
criar, lixeira, lista de tipos com corpo · o `book-v1` captura o exemplo até a próxima fronteira ·
a aprovação cria o nó em vez de anexar ao corpo · a árvore mostra rótulo e começo do texto.
**Aceite:** varrer o *Curso de Análise* propõe os 107 exemplos como nós; aprovar cria 107 galhos
com a resolução dentro, e nenhum texto de exemplo sobra no corpo da seção.

#### Fase 23 — Reimportar *(D57, ADR 0006)*
Coluna de proveniência no nó, com índice · apagar a importação: nós, questões, corpos e âncoras
que a execução criou vão para a lixeira · o editado à mão é preservado e contado · a execução
antiga sai junto · confirmação com os números · as duas opções na tela (só a proposta, ou
proposta e acervo).
**Aceite:** importar o FME, apagar a importação e importar de novo devolve o livro ao estado de
antes, sem resíduo e sem perder o que foi editado à mão no meio.

#### Fase 24 — Figuras *(D58, ADR 0005)*
Agrupar traços e imagens em figura, absorvendo o texto de dentro da caixa · recorte vetorial em
PDF (`pdf-lib`) e bitmap embutido para foto, com PNG de tela · asset, âncora de ilustração e
`figure` com `\caption` na posição · legenda do livro reconhecida e tirada do corpo · destino por
perfil (corpo no `book-v1`, enunciado nos de prova) · redesenhar a caixa arrastando na revisão.
**Aceite:** nas páginas medidas do FME as figuras saem vetoriais e na posição, com a legenda
junto; nenhuma letra de diagrama sobra solta no corpo; o relatório do corpus traz a contagem de
figuras por livro.

> **Fora desta wave, por decisão:** parear resposta com questão automaticamente (a resposta é um
> segundo gesto — recortar e apontar); tela para editar perfis; a tela de diff entre dois scans
> (o retrato congelado de cada item já guarda o necessário). *Criar capítulos e seções a partir
> dos títulos*, que estava aqui, entrou pela D45: a aprovação protege o acervo do erro estrutural.

---

## 9. Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| **Fase 6.5 vira projeto de infraestrutura e consome semanas** | Alta | Escopo fechado e amostra mínima definidos em §8; guarda-corpo explícito de D30; entregável é um relatório, não um ambiente de produção |
| Tool calling varia muito entre modelos e provedores | Alta | Matriz de capacidades por perfil, com fallback para JSON estruturado; testes de contrato com respostas gravadas |
| Deriva de schema entre as 13 bibliotecas quebra o import | Alta | Detecção de geração por biblioteca; campos ausentes degradam; dry-run obrigatório antes de qualquer escrita |
| **As fronteiras de provider viram cerimônia** | Média | D23 limita a exatamente quatro interfaces; regra explícita contra factories e DI framework; revisão a cada fase |
| **Uma dependência de SQLite vazar para o domínio sem ninguém notar** | Média | Regras de boundary no CI (§4.5); testes de domínio independentes de provider; a Fase 6.5 existe para detectar o que escapar |
| **`PortableSchema` divergir do domínio sem ninguém notar** | Média | Round-trip nas duas projeções, ligado a qualquer mudança de schema (D37, Fase 13) |
| **Divergência entre o schema de runtime e o `data.sqlite` do `.lbb`** | Média | Schema do pacote gerado a partir do Prisma, não escrito à mão; teste de round-trip ligado a qualquer mudança de schema |
| Monaco quebra sob SSR do App Router | Média | Client component isolado com dynamic import desde a Fase 3 |
| Fractional indexing sutilmente errado corrompe a ordenação | Média | Testes de propriedade na Fase 2, incluindo rebalanceamento |
| Portar o DS de `.jsx` para `.tsx` revela acoplamentos ao EduLingo | Média | Os `.d.ts` já existem; portar na Fase 1, cedo, quando corrigir é barato |
| Classificação errada dos 1.000+ arquivos de figura | Média | Classificação por extensão com relatório do que caiu em `ATTACHMENT`; nada é descartado |
| **Docker de pé vira pré-requisito para renderizar** | Média | `pnpm setup` valida Docker, build e `/health` antes de tudo; TeX do host permanece como fallback opcional; o app degrada com mensagem clara quando o worker não responde |
| **Operar o droplet vira custo e trabalho recorrente** | Média | Mesma imagem em WSL e em produção, então o modo local nunca depende do droplet; `RenderExecutor` permite trocar de host sem tocar na app |
| **Backup recorrente falhar em silêncio** | Média | D32: backup usa o mesmo escritor da exportação e é coberto pelo teste de round-trip; falha de backup aparece na página de diagnóstico |
| Árvore grande trava a UI | Baixa | Virtualização na Fase 2, antes de existir volume |
| ~~Custo de storage em nuvem~~ | **Eliminado** | §2.10: o acervo tem 109 MB |
| ~~GitLab inacessível esconde trabalho relevante~~ | **Eliminado** | §2.6: era premissa errada — clone local acessível desde sempre, sem token |

---

## 10. Explicitamente fora de escopo

Da spec §38 e da auditoria §53:

**PostGIS** (D22 — decisão definitiva) · migração definitiva para PostgreSQL · produção no Vercel ·
render em função serverless · LaTeX em WASM ·
multiusuário · auth complexa · billing · sincronização distribuída · Local Companion ·
microserviços · Kubernetes · Redis · vector database · event sourcing · CQRS · multi-tenancy
complexo · pagamentos · marketplace · colaboração em tempo real · CRDT · TexLab/LSP obrigatório
(spike apenas, sem bloquear) · agente em lote antes
do agente unitário ser confiável · tipos de questão 3–7 (V/F, Resolva, CESPE, Múltipla,
Somatório), que existem no vocabulário legado mas têm **zero linhas** no acervo.

**Eliminados por descoberta ou decisão:**

- **Migração do SQL Server** — o legado já migrou para SQLite; os `.mdf` são legado morto.
- **`ITA/Material` e `Listas/`** — 97% dos bytes da árvore, sem `.knowchico`, material de
  terceiros. O scanner ignora e reporta que ignorou.
- **Estimativa de custo de storage em nuvem** — respondida pelo inventário: 109 MB.

- **Deduplicação como estratégia de economia** — 0,77 MB recuperáveis.
- **"OCR de livro inteiro antes do crop unitário"** — a condição foi satisfeita, não violada. O
  crop unitário existe e funciona desde a Fase 15, com revisão obrigatória; o scan da Fase 18 é o
  passo que a exclusão contemplava para depois dele. Continua fora: OCR de livro inteiro **sem**
  destino escolhido, sem perfil e sem revisão.

Também fora, por decisão da segunda auditoria §35: Redis obrigatório · filas distribuídas
complexas · autenticação SaaS completa.

**Preparar a interface, não construir a infraestrutura futura inteira** (auditoria §53).

---

## 11. Rastreabilidade

| Fase | Epic da spec | Seções da spec | Decisões que a alteram |
|---|---|---|---|
| 0 | EPIC 01 | §5.1, §6, §7, §26, §27, §39 | D21, D23, D24, D26, D29 |
| 1 | EPIC 02 | §4, §5.2, §22, §34 | D13, D14, D15 |
| 2 | EPIC 02 | §4.1, §8.3 | — |
| 3 | EPIC 03 | §5.3, §10.1, §20 | — |
| 4 | EPIC 03 | §10.2 | — |
| 5 | EPIC 04 | §5.5, §11 | — |
| 6 | EPIC 04 | §12, §40 | D27, **D35** |
| **6.5** | — | §39, §40 | **D30** |
| 7 | EPIC 05 | §8.4, §8.5, §8.6, §9 | — |
| 8 | EPIC 07 | §5.6, §14.1–14.3, §14.7, §14.8 | D3 |
| 9 | EPIC 07 | §14.4–14.6, §36, §24 | — |
| 10 | EPIC 10 | §8.9 | — |
| 11 | EPIC 08 | §16, §8.2, §8.8 | D11, D12, D29, D31 |
| 12 | EPIC 10 | §21 | D24 |
| 13 | — | — | D18, D32, **D36**, **D37** |
| 14 | EPIC 06 | §13.1, §13.2, §8.7, §24 | D22, D28, D29 |
| 15 | EPIC 06 | §13.3, §13.4 | D29 |
| 16 | EPIC 09 | §17, §18 | — |
| 17 | EPIC 10 | §25, §28 | D21 |
| **18** | — | §13.1–13.4 (estende), §16 | **D39, D40, D41, D43, D44** |
| **19** | — | §8.3 (estende) | **D42** ([ADR 0001](../adr/0001-corpo-do-no.md)), D37 |
