# Code review do código inteiro — 2026-09-23

> Revisão do código inteiro do LatexBookBank na branch `feat/perfil-do-fundamentos` (`6ba3525`), em seis dimensões, com um plano de ação em issues. **Plano aprovado:** as tarefas P0 e P1 viraram issues sob o épico [#232](https://github.com/ChicoFigueiredo/LatexBookBank/issues/232); as P2 ficam aqui até serem puxadas. **As seis P0 foram feitas em 2026-09-29, e a B2 em 2026-09-30** (coluna Estado).

## Como foi feito

- **Escopo:** o código inteiro (cerca de 100 mil linhas em `apps/`, `packages/`, `services/` e `scripts/`), não um diff.
- **Dez revisores** independentes (Opus 5.5, esforço alto), cada um com uma fatia e uma dimensão: bugs em três fatias (captura, acervo e plataforma), Standards em duas (domínio e entrega), Spec em duas (Wave G e Waves A–F), arquitetura, testes e segurança.
- **Dez verificadores céticos**, um por relatório, com a tarefa de refutar cada achado relendo o código. Nenhum achado foi refutado; 11 tiveram a severidade rebaixada e 25 tiveram a linha citada corrigida. Quando o verificador não conseguiu fechar a prova, o achado aparece como *plausível*.
- **Provas executadas** pelos agentes, fora do repositório: scripts Bun sobre o domínio do scan, vitest com SQLite temporário (revert de `MULTIPLE_CORRECT`, P2003 na lixeira e na exclusão de livro, restauração da lixeira), ESLint contra os furos de fronteira, e um contêiner descartável da imagem do renderer lendo `/proc/1/environ`. Nenhum arquivo do repositório foi alterado.
- **Linha de base das ferramentas:** `eslint` e `tsc --noEmit` limpos; vitest com 154 arquivos e 1804 testes passando, 5 pulados (`scan-corpus`, que depende do corpus real). Nada do que essas ferramentas já garantem foi reportado.

**Resultado:** 147 achados (121 confirmados, 26 plausíveis), agrupados em 49 tarefas sob 9 frentes.

## Os dois riscos imediatos — fechados

A revisão achou dois riscos que valiam no dia, antes de qualquer tarefa. Os dois foram fechados em 2026-09-29:

1. **O E2E rodava contra o acervo** ([TST-01](#tst-01)): o Playwright reaproveitava o servidor da `28080`, que aponta para `data/latexbookbank.db`, e um spec esvaziava a lixeira real. Desde a A1 ([#241](https://github.com/ChicoFigueiredo/LatexBookBank/issues/241), D60) o E2E sobe o próprio servidor na `28081`, com banco e storage descartáveis, e recusa rodar se a instância não for `e2e`. A primeira execução inteira deixou o banco do acervo com o mesmo sha256.
2. **O dev server estava aberto na rede local** ([SEC-01](#sec-01)): desde a A2 ([#242](https://github.com/ChicoFigueiredo/LatexBookBank/issues/242), D59) `dev` e `start` escutam só em `127.0.0.1`, e o `proxy.ts` recusa `Host` estranho e escrita de outra origem.

## Números

| Dimensão | Achados | crítica | alta | média | baixa |
|---|--:|--:|--:|--:|--:|
| Standards | 38 | – | 2 | 10 | 26 |
| Spec | 23 | – | 6 | 10 | 7 |
| Bugs e corretude | 49 | 3 | 15 | 19 | 12 |
| Arquitetura | 14 | – | 1 | 9 | 4 |
| Testes | 15 | 1 | 2 | 7 | 5 |
| Segurança | 8 | 1 | 1 | 5 | 1 |
| **Total** | **147** | **5** | **27** | **60** | **55** |

A severidade é a do verificador. Régua: *crítica* = perda ou corrupção de dados do acervo, falha de segurança explorável, aprovação que grava errado; *alta* = bug que aparece no uso normal, ou regra inviolável violada; *média* = bug de borda, ou dívida que atrapalha a próxima fase; *baixa* = higiene, nome, smell leve.

## Plano de ação

Um épico, nove frentes (`[FEATURE]`) e tarefas (`task`), no formato que o repositório já usa. Cada tarefa é uma branch/PR e cita os achados que resolve; cada achado está em exatamente uma tarefa.

- **P0** — fazer antes de qualquer outra coisa: dado real em risco hoje, ou aprovação que grava errado no fluxo pedido.
- **P1** — bug que aparece no uso normal, ou uma promessa do checklist que o código não cumpre.
- **P2** — dívida de desenho, padrão e documentação.
- **Esforço:** S (menos de meio dia), M (1 a 2 dias), L (mais que isso).

São 6 tarefas P0, 27 P1 e 16 P2.

| Frente | Tarefas | P0 | P1 | P2 |
|---|--:|--:|--:|--:|
| **A** — Proteger o acervo agora | 4 | 4 | – | – |
| **B** — A aprovação do scan grava o que a proposta diz | 9 | 2 | 7 | – |
| **C** — Assets: uma linha por dono, e a figura chega ao PDF | 4 | – | 4 | – |
| **D** — Lixeira, exclusão e concorrência no acervo | 4 | – | 3 | 1 |
| **E** — Avaliações por biblioteca, e tipos de questão pelo registry | 4 | – | 3 | 1 |
| **F** — Agente e render | 5 | – | 4 | 1 |
| **G** — Backup e .lbb que restauram de verdade | 4 | – | 3 | 1 |
| **H** — Testes e CI que barram de verdade | 4 | – | 3 | 1 |
| **I** — Arquitetura e padrões: a documentação e o código voltam a concordar | 11 | – | – | 11 |

### A — Proteger o acervo agora

Quatro riscos que alcançam o acervo real hoje, sem esperar nenhum bug novo: o E2E apaga dados de verdade, a API está aberta na rede local, excluir um livro apaga arquivo de outro e o LaTeX lê qualquer arquivo do worker. Frente: [#233](https://github.com/ChicoFigueiredo/LatexBookBank/issues/233).

| Tarefa | Issue | Estado | Prioridade | Esforço | O que entrega | Achados |
|---|---|---|---|---|---|---|
| **A1** | [#241](https://github.com/ChicoFigueiredo/LatexBookBank/issues/241) | feita (`69bbfeb`) | P0 | M | O E2E roda num banco e num storage próprios, nunca no acervo | [TST-01](#tst-01) |
| **A2** | [#242](https://github.com/ChicoFigueiredo/LatexBookBank/issues/242) | feita (`515ea42`) | P0 | S | O app escuta só em localhost e recusa Host e Origin estranhos | [SEC-01](#sec-01) |
| **A3** | [#243](https://github.com/ChicoFigueiredo/LatexBookBank/issues/243) | feita (`c8ef7aa`) | P0 | S | Excluir um livro só apaga o arquivo que ninguém mais usa, e o storage grava de forma atômica | [ACV-01](#acv-01), [PLT-01](#plt-01), [PLT-10](#plt-10) |
| **A4** | [#244](https://github.com/ChicoFigueiredo/LatexBookBank/issues/244) | feita (`c204f56`) | P0 | S | O pdflatex do worker não lê arquivo fora do job | [SEC-02](#sec-02), [SEC-08](#sec-08) |

### B — A aprovação do scan grava o que a proposta diz

A aprovação é onde a proposta vira acervo. Ela acerta quando o livro é aprovado de uma vez e sem modelo de visão; erra nas rodadas parciais, no LaTeX reconhecido e nas figuras de questão. Frente: [#234](https://github.com/ChicoFigueiredo/LatexBookBank/issues/234).

| Tarefa | Issue | Estado | Prioridade | Esforço | O que entrega | Achados |
|---|---|---|---|---|---|---|
| **B1** | [#245](https://github.com/ChicoFigueiredo/LatexBookBank/issues/245) | feita (`4c7a567`) | P0 | M | As alternativas saem também do LaTeX reconhecido ou revisado | [CAP-03](#cap-03), [SPG-01](#spg-01), [CAP-10](#cap-10) |
| **B2** | [#246](https://github.com/ChicoFigueiredo/LatexBookBank/issues/246) | feita (`990cac7`) | P1 | M | A figura da questão vai para o enunciado, e não para o corpo do nó | [CAP-02](#cap-02), [SPG-02](#spg-02) |
| **B3** | [#247](https://github.com/ChicoFigueiredo/LatexBookBank/issues/247) | feita (`b1673ae`) | P0 | M | Aprovar em rodadas: 'já no acervo' só casa item compatível, e nó na lixeira não serve de pai | [CAP-01](#cap-01), [CAP-12](#cap-12), [SPG-04](#spg-04), [CAP-11](#cap-11), [TST-06](#tst-06) |
| **B4** | [#248](https://github.com/ChicoFigueiredo/LatexBookBank/issues/248) | — | P1 | M | Aprovar em rodadas mantém a ordem do livro, na árvore e no corpo | [CAP-04](#cap-04), [CAP-16](#cap-16) |
| **B5** | [#249](https://github.com/ChicoFigueiredo/LatexBookBank/issues/249) | — | P1 | M | Apagar a importação distingue aprovação posterior de edição à mão | [CAP-09](#cap-09), [SPG-05](#spg-05), [SPG-12](#spg-12) |
| **B6** | [#250](https://github.com/ChicoFigueiredo/LatexBookBank/issues/250) | — | P1 | M | A revisão da proposta não perde nem inventa trabalho | [CAP-06](#cap-06), [CAP-07](#cap-07), [CAP-17](#cap-17), [SPG-07](#spg-07) |
| **B7** | [#251](https://github.com/ChicoFigueiredo/LatexBookBank/issues/251) | — | P1 | S | Mudou a proposta, mudou a versão; e a aprovação usa o retrato do perfil | [STM-01](#stm-01), [STM-07](#stm-07), [SPG-10](#spg-10), [CAP-05](#cap-05), [TST-10](#tst-10) |
| **B8** | [#252](https://github.com/ChicoFigueiredo/LatexBookBank/issues/252) | — | P1 | M | Corpo e exemplo vindos do scan ficam 'a revisar', e duplicar leva o corpo | [SPG-06](#spg-06), [SPG-08](#spg-08) |
| **B9** | [#253](https://github.com/ChicoFigueiredo/LatexBookBank/issues/253) | — | P1 | S | A fila de captura não some depois de um scan, e a falha não apaga a transcrição | [CAP-08](#cap-08), [CAP-15](#cap-15) |

### C — Assets: uma linha por dono, e a figura chega ao PDF

A deduplicação por hash devolve a linha de outro livro ou de outra questão; com isso a figura enviada não compila, o recorte não entra no bundle e o upload aceita ids de outra biblioteca. Frente: [#235](https://github.com/ChicoFigueiredo/LatexBookBank/issues/235).

| Tarefa | Issue | Estado | Prioridade | Esforço | O que entrega | Achados |
|---|---|---|---|---|---|---|
| **C1** | [#254](https://github.com/ChicoFigueiredo/LatexBookBank/issues/254) | — | P1 | M | Deduplicar o arquivo, e não a linha do Asset | [ACV-06](#acv-06), [CAP-13](#cap-13), [CAP-14](#cap-14) |
| **C2** | [#255](https://github.com/ChicoFigueiredo/LatexBookBank/issues/255) | — | P1 | S | 'Inserir como figura' leva o recorte ao bundle de render | [ACV-05](#acv-05) |
| **C3** | [#256](https://github.com/ChicoFigueiredo/LatexBookBank/issues/256) | — | P1 | M | Upload, recorte e Calibre resolvem a biblioteca e a raiz no servidor | [SEC-06](#sec-06), [ACV-12](#acv-12), [SEC-05](#sec-05) |
| **C4** | [#257](https://github.com/ChicoFigueiredo/LatexBookBank/issues/257) | — | P1 | S | Conteúdo servido com nosniff, e SVG em sandbox | [SEC-04](#sec-04) |

### D — Lixeira, exclusão e concorrência no acervo

A lixeira trava inteira por causa de uma questão numa prova, e escritas que não são do usuário disparam 409 falso — no corpo do nó, o 'Recarregar' ainda descarta o que foi digitado. Frente: [#236](https://github.com/ChicoFigueiredo/LatexBookBank/issues/236).

| Tarefa | Issue | Estado | Prioridade | Esforço | O que entrega | Achados |
|---|---|---|---|---|---|---|
| **D1** | [#258](https://github.com/ChicoFigueiredo/LatexBookBank/issues/258) | — | P1 | M | Questão numa avaliação não trava a lixeira nem a exclusão do livro | [ACV-02](#acv-02), [STE-04](#ste-04), [TST-03](#tst-03) |
| **D2** | [#259](https://github.com/ChicoFigueiredo/LatexBookBank/issues/259) | — | P1 | M | Escrita derivada não gera 409 falso, e o conflito do corpo não descarta o rascunho | [ACV-03](#acv-03), [ACV-04](#acv-04) |
| **D3** | [#260](https://github.com/ChicoFigueiredo/LatexBookBank/issues/260) | — | P1 | S | Restaurar da lixeira não repete sortKey, e a regra dos filhos fica escrita | [ACV-09](#acv-09), [ACV-14](#acv-14), [TST-08](#tst-08) |
| **D4** | — | — | P2 | S | O texto da alternativa passa por use case, e toda escrita da questão revalida | [STE-15](#ste-15), [STE-05](#ste-05) |

### E — Avaliações por biblioteca, e tipos de questão pelo registry

A tela de avaliações só vê a primeira biblioteca, e o gabarito impresso sai errado para questão de várias corretas — o custo de o conhecimento por tipo estar espalhado fora do plugin. Frente: [#237](https://github.com/ChicoFigueiredo/LatexBookBank/issues/237).

| Tarefa | Issue | Estado | Prioridade | Esforço | O que entrega | Achados |
|---|---|---|---|---|---|---|
| **E1** | [#261](https://github.com/ChicoFigueiredo/LatexBookBank/issues/261) | — | P1 | S | /avaliacoes trabalha na biblioteca escolhida | [STE-01](#ste-01), [STE-14](#ste-14) |
| **E2** | [#262](https://github.com/ChicoFigueiredo/LatexBookBank/issues/262) | — | P1 | M | O gabarito marca todas as corretas, e a discursiva sai sem alternativas | [ACV-07](#acv-07), [SPA-02](#spa-02), [STM-08](#stm-08) |
| **E3** | [#263](https://github.com/ChicoFigueiredo/LatexBookBank/issues/263) | — | P1 | S | A prova não imprime questão da lixeira, e seed fora de Int32 é recusada | [ACV-10](#acv-10), [ACV-15](#acv-15) |
| **E4** | — | — | P2 | M | O plugin declara as capacidades do tipo, e o guarda enxerga além do switch | [STM-02](#stm-02), [SPA-04](#spa-04), [TST-11](#tst-11), [ARQ-05](#arq-05) |

### F — Agente e render

Com OpenAI ou OpenRouter o agente falha na segunda chamada; o candidato compila sem figuras; patch e revert não respeitam o tipo; e o cache de render guarda para sempre falhas que não são do documento. Frente: [#238](https://github.com/ChicoFigueiredo/LatexBookBank/issues/238).

| Tarefa | Issue | Estado | Prioridade | Esforço | O que entrega | Achados |
|---|---|---|---|---|---|---|
| **F1** | [#264](https://github.com/ChicoFigueiredo/LatexBookBank/issues/264) | — | P1 | S | Tool calling funciona com OpenAI e OpenRouter | [PLT-02](#plt-02), [PLT-17](#plt-17) |
| **F2** | [#265](https://github.com/ChicoFigueiredo/LatexBookBank/issues/265) | — | P1 | M | Um caso de uso de render, com assets, para questão, candidato e agente | [PLT-04](#plt-04), [ARQ-02](#arq-02), [STE-09](#ste-09) |
| **F3** | [#266](https://github.com/ChicoFigueiredo/LatexBookBank/issues/266) | — | P1 | M | Patch e revert fiéis ao tipo e ao estado da questão | [SPA-01](#spa-01), [TST-02](#tst-02), [PLT-06](#plt-06), [PLT-07](#plt-07), [PLT-08](#plt-08), [SPA-05](#spa-05) |
| **F4** | [#267](https://github.com/ChicoFigueiredo/LatexBookBank/issues/267) | — | P1 | M | O cache de render só guarda falha do documento | [PLT-03](#plt-03), [PLT-05](#plt-05), [PLT-09](#plt-09) |
| **F5** | — | — | P2 | S | Worker: jobId único, formato atômico e prazo por job | [SEC-07](#sec-07), [PLT-12](#plt-12), [PLT-11](#plt-11), [PLT-14](#plt-14), [PLT-15](#plt-15) |

### G — Backup e .lbb que restauram de verdade

O .lbb é também o backup declarado, e hoje uma restauração perde figuras, capas, avaliações, variantes e revisões — e o round-trip de aceite não enxerga isso. Frente: [#239](https://github.com/ChicoFigueiredo/LatexBookBank/issues/239).

| Tarefa | Issue | Estado | Prioridade | Esforço | O que entrega | Achados |
|---|---|---|---|---|---|---|
| **G1** | [#268](https://github.com/ChicoFigueiredo/LatexBookBank/issues/268) | — | P1 | M | .lbb v3: figuras, nome, tipo e capa atravessam o round-trip | [ACV-08](#acv-08), [SPG-03](#spg-03), [TST-13](#tst-13) |
| **G2** | [#269](https://github.com/ChicoFigueiredo/LatexBookBank/issues/269) | — | P1 | L | Decidir o que o backup leva: avaliações, variantes, revisões e legacyId | [SPA-03](#spa-03) |
| **G3** | [#270](https://github.com/ChicoFigueiredo/LatexBookBank/issues/270) | — | P1 | M | O import de .lbb tem teto, schema e colisão no escopo certo | [SEC-03](#sec-03), [ACV-11](#acv-11), [SPA-10](#spa-10) |
| **G4** | — | — | P2 | M | Legado, scripts e o indicador de backup dizem a verdade | [ACV-13](#acv-13), [SPA-08](#spa-08), [SPA-09](#spa-09), [PLT-16](#plt-16), [PLT-13](#plt-13) |

### H — Testes e CI que barram de verdade

A suíte é densa, mas o CI está vermelho desde agosto, os adaptadores Prisma de escrita só são testados por fakes, e os guardas de fronteira têm furos medidos. Frente: [#240](https://github.com/ChicoFigueiredo/LatexBookBank/issues/240).

| Tarefa | Issue | Estado | Prioridade | Esforço | O que entrega | Achados |
|---|---|---|---|---|---|---|
| **H1** | [#271](https://github.com/ChicoFigueiredo/LatexBookBank/issues/271) | — | P1 | S | O CI fica verde e volta a rodar o build | [TST-04](#tst-04) |
| **H2** | [#272](https://github.com/ChicoFigueiredo/LatexBookBank/issues/272) | — | P1 | L | Adaptadores Prisma de escrita testados contra SQLite | [TST-05](#tst-05) |
| **H3** | [#273](https://github.com/ChicoFigueiredo/LatexBookBank/issues/273) | — | P1 | S | Os guardas de fronteira fecham os furos medidos | [TST-07](#tst-07), [TST-12](#tst-12) |
| **H4** | — | — | P2 | S | Higiene: E2E do Calibre no schema 27, sem caminho de máquina, sem sleep | [TST-09](#tst-09), [TST-14](#tst-14), [TST-15](#tst-15) |

### I — Arquitetura e padrões: a documentação e o código voltam a concordar

A arquitetura macro está sã. A dívida está nas costuras entre módulos, em regras escritas que o repositório deixou de praticar e em conceitos com dois donos. Frente sem issue nesta rodada: todas as tarefas são P2.

| Tarefa | Issue | Estado | Prioridade | Esforço | O que entrega | Achados |
|---|---|---|---|---|---|---|
| **I1** | — | — | P2 | S | Registrar o fluxo que o repositório pratica: Zod, Server Components, estrutura, D23 e D43 | [STM-06](#stm-06), [STE-02](#ste-02), [STM-05](#stm-05), [STE-18](#ste-18), [STM-15](#stm-15), [STE-19](#ste-19), [STM-18](#stm-18), [SPG-09](#spg-09) |
| **I2** | — | — | P2 | L | Casos de uso onde a regra mora na rota ou no adaptador | [STM-04](#stm-04), [STE-03](#ste-03), [ARQ-09](#arq-09), [STE-11](#ste-11) |
| **I3** | — | — | P2 | M | Uma raiz de composição, e o ambiente lido uma vez | [STE-08](#ste-08), [ARQ-03](#arq-03), [STM-14](#stm-14), [STE-12](#ste-12) |
| **I4** | — | — | P2 | M | Um tradutor de erro de domínio para HTTP | [STE-06](#ste-06), [ARQ-11](#arq-11), [STE-20](#ste-20), [STE-10](#ste-10) |
| **I5** | — | — | P2 | L | Um escritor de questão, nó e âncora; e Revision com dono | [ARQ-01](#arq-01), [ARQ-04](#arq-04) |
| **I6** | — | — | P2 | M | Primitivas neutras, sem ciclo entre módulos e sem peso morto | [ARQ-12](#arq-12), [ARQ-13](#arq-13), [STM-16](#stm-16) |
| **I7** | — | — | P2 | M | Um modelo de camada de texto do PDF, e um cliente de IA | [ARQ-06](#arq-06), [ARQ-07](#arq-07) |
| **I8** | — | — | P2 | L | Telas gigantes viram hooks e clientes com contrato tipado | [ARQ-08](#arq-08), [STM-17](#stm-17), [ARQ-10](#arq-10), [STE-16](#ste-16) |
| **I9** | — | — | P2 | M | Os traços de cada ScanKind num lugar só, e as passadas com contrato | [STM-13](#stm-13), [ARQ-14](#arq-14) |
| **I10** | — | — | P2 | M | Glossário e idioma no texto de tela e nos identificadores | [STM-09](#stm-09), [STM-10](#stm-10), [STM-11](#stm-11), [STM-12](#stm-12), [STE-07](#ste-07), [STM-03](#stm-03), [STE-17](#ste-17), [STE-13](#ste-13) |
| **I11** | — | — | P2 | S | O checklist volta a dizer a verdade | [SPA-06](#spa-06), [SPA-07](#spa-07), [SPG-13](#spg-13), [SPG-11](#spg-11) |

### Ordem sugerida

1. **A2 e A1** primeiro: fecham os dois riscos que valem hoje. A2 é pequena; A1 é média, mas a trava mínima dela (o `globalSetup` que aborta no banco do acervo) sai em minutos.
2. **A3, A4, B1 e B3**: o resto do P0. A3 e C1 têm a mesma causa (a deduplicação de Asset por `storageKey`); vale desenhar as duas juntas, mesmo entregando A3 antes.
3. **B2 a B9**, antes de aprovar o próximo livro de verdade. A B7 é um bump de versão que precisa entrar antes do merge desta branch.
4. **C, D, E, F e G**, na ordem que o uso pedir. **H1** cedo, para o CI voltar a barrar alguma coisa.
5. **I** e os P2 restantes, em paralelo, quando a frente que tocam estiver quieta.

### Decisões que o plano pede a você

Estas tarefas não andam sem uma decisão sua; a issue vai registrar a pergunta.

- **A1** — Como isolar o E2E: `next build` + `next start` numa porta própria, com banco e storage temporários semeados (isolamento real), ou só um `globalSetup` que aborta se o servidor estiver no banco do acervo (trava, sem isolar).
- **D3** — Restaurar um capítulo traz de volta a subseção que foi excluída **antes** dele, à parte? Hoje traz, e o `trash-grouping` documenta isso como certo; o comentário do `restoreNode` e o teste dizem o contrário.
- **G2** — O `.lbb` passa a levar avaliações, variantes (o mapa de letras é o gabarito de prova já impressa), revisões e templates — ou continua sem eles, e a tela de backup passa a dizer o que não é salvo.
- **I1** — Zod em toda rota, ou o domínio como validador de `unknown` (a prática de hoje); Server Component pode ler read model da infraestrutura; a terceira coluna do *Ver fonte* fica (e a D43 é revista) ou volta a trocar o painel.
- **I10** — A aba de `solutionLatex` se chama *Resolução* (o glossário) ou *Resposta* (o checklist e as telas).
- **B7** — A regra de subir `version` do perfil e `ENGINE_VERSION` a cada mudança de proposta vira teste (hash da proposta do corpus por perfil@versão) ou fica como disciplina de commit.

### As issues no GitHub

Aprovadas as tarefas P0 e P1, com a label `code-review`:

- O épico [#232](https://github.com/ChicoFigueiredo/LatexBookBank/issues/232) lista as oito frentes que têm tarefa aprovada (A a H).
- Uma `[FEATURE] Revisão <frente>` por frente, com o porquê, as tarefas e as P2 que ficaram de fora.
- Uma `task` por tarefa, com `Parent:`, `bug` quando resolve algum bug e, no corpo, cada achado com local, evidência, cenário, correção sugerida e verificação, além da decisão pendente, quando houver.
- A frente I e as tarefas D4, E4, F5, G4 e H4 (todas P2) ficam só neste relatório até serem puxadas.

## Achados

Os eixos ficam separados de propósito: Standards (o código segue os padrões escritos do repo?) e Spec (o código faz o que o checklist, os ADRs e o planejamento pediram?) não se misturam nem se reordenam entre si, e o mesmo vale para as outras quatro dimensões. Onde dois revisores acharam o mesmo problema por eixos diferentes, os dois achados ficam, e apontam para a mesma tarefa.

## Standards

### Standards · Domínio e casos de uso (`src/modules`)

**Resumo do revisor.** A fatia modules/ segue bem a espinha documentada: domínio sem framework, registro explícito de perfis e tipos, ADRs citados no código. Os desvios estão em três lugares. (1) A regra de versionar o perfil e o motor, da qual depende a reabertura idempotente do scan (D53), não é praticada: o book-fme-v1 mudou a proposta três vezes hoje e continua em `version: 1`. (2) Várias regras escritas não descrevem mais o que o repositório faz: o fluxo UI→Route(Zod)→UseCase→Domain, a estrutura da §4.6, a checagem "abstração só com múltiplas implementações" e a precedência do retrato do perfil do ADR 0008. (3) Há violações difusas de idioma e de glossário: dezenas de identificadores em português, e textos de tela com termos que o glossário manda evitar, como "Resposta", "workspace", "Diagnóstico" sem qualificar e o `insufficient_evidence` exibido cru. Os smells mais caros são a regra "tipo tem alternativas" fora do registry, o escape de LaTeX duplicado com comportamento divergente e os conjuntos de ScanKind espalhados.

<details><summary>Cobertura declarada</summary>

Li por inteiro as fontes de padrão: README §Convenções, CONTEXT.md, _planejamento §4 e D23/D46/D53/D54, _checklist §14–§15 e os ADRs 0007/0008. Li por inteiro: scan/domain/capture-profile.ts, scan/application/{approve-scan,scan-store,start-scan (trecho principal),pdf-document}.ts, scan/infrastructure/{scan-deps,scan-passes,in-process-scan-runner}.ts, diagnostics/application/collect-diagnostics.ts, publications/infrastructure/prisma-book-overview.ts, publications/application/catalog-source.ts, agents/application/describe-ai-setup.ts e shared/config/env.ts. Li em boa parte: scan/domain/{approval-plan (215–290),proposal,workspace-view,regions (cabeçalho),text}.ts, os quatro perfis (book-fme-v1 quase inteiro; book-v1, exam-v1 e exam-enem-v1 por grep e trechos), assessments/infrastructure/prisma-assessment-repository.ts (1–260), assessments/domain/assessment-template.ts (trechos), questions/domain/{question-blueprint,question-type,question-type-plugin (60–123),herdar-metadados (1–60)}.ts, rendering/domain/saida-do-render.ts, recognition/domain/latex-escape.ts, portability/application/import-workspace.ts (trechos), DiagnosticsView.tsx (130–260) e assets/ui/pdf-text-layer.ts (100–134). Do resto dos módulos amostrei só por grep e pela estrutura: identificadores exportados, imports entre camadas e entre módulos, contagem de implementações por interface, process.env, literais de tipo de questão, textos de tela com termos evitados e rotas literais. Não li linha a linha: scan/domain/{structure,review,page,figures,furniture}.ts, scan/ui/* (salvo trechos), recognition/ui/IngestionPanel.tsx (só o esboço), rendering/ui/RenderPanel.tsx (só o esboço), preview/domain/parse-latex-preview.ts, legacy-import/*, latex-knowledge/*, document-tree/* e agents/* além do que o grep mostrou. Não executei testes; o histórico do git (log/show) serviu de evidência para o versionamento dos perfis.

</details>

#### STM-01

**Perfis e motor mudam a proposta sem subir a versão, e o scan reabre a execução velha** — alta · confirmado · `hard-violation` · tarefa **B7**

- **Local:** `apps/web/src/modules/scan/domain/profiles/book-fme-v1.ts:346` · também: `apps/web/src/modules/scan/domain/scan-run.ts:76`, `apps/web/src/modules/scan/domain/profiles/book-v1.ts:339`, `apps/web/src/modules/scan/application/start-scan.ts:62`, `apps/web/src/modules/scan/infrastructure/prisma-scan-approval.ts:68`
- **Regra ou spec:** scan/domain/scan-run.ts:70 ("Muda quando a mesma entrada passa a produzir outra proposta") · D53 · D46 ("perfil tem id e versão, e a execução do scan grava ambos") · CONTEXT.md, Perfil de captura ("com nome e versão")
- **Cenário:** A pessoa varreu o FME vol. 1 antes de 6ba3525 e atualiza o código. Na tela de scan, clica em Iniciar sem marcar "novo scan". A runKey é idêntica, então start-scan devolve a execução antiga, ainda sem os exercícios 188–193. A pessoa revisa e aprova a proposta desatualizada achando que tem a correção, e a proveniência grava `scan:book-fme-v1@1` nos dois casos, sem como distinguir depois.
- **Correção sugerida:** Subir `version` do perfil (ou ENGINE_VERSION, quando o motor mudar) em todo commit que altere proposta; os commits de hoje pedem book-fme-v1@2, book-v1@2 e scan-engine@3. Para a regra deixar de depender de disciplina, amarrar a validação do corpus (tests/scan-corpus.test.ts, SCAN_REPORT) a um hash da proposta por perfil@versão: se a proposta muda e a versão não, o teste falha.
- **Verificação:** Os quatro perfis estão em `version: 1` e ENGINE_VERSION segue `scan-engine@2` (scan-run.ts:76, único commit 9b382c2), mas 6ba3525 mudou a regex SPACED_EXERCISES do book-fme-v1 (a proposta ganha os exercícios 188–193) e 82da500/3b5409b mexeram em book-v1/structure.ts. A runKey de start-scan.ts:62-70 não muda, e sem forceNew a execução velha volta com reused:true (start-scan.ts:73-78). Atenuante: tudo está na branch não mesclada (main tem scan-engine@1), então um único bump antes do merge resolve, mas o banco local do autor já está sujeito ao cenário.

#### STM-02

**"Que tipo tem alternativas" é decidido fora do registry, em duas listas que discordam** — baixa (o revisor deu média) · plausível · `hard-violation` · tarefa **E4**

- **Local:** `apps/web/src/modules/scan/domain/approval-plan.ts:247` · também: `apps/web/src/modules/questions/domain/question-blueprint.ts:62`, `apps/web/src/modules/questions/infrastructure/prisma-question-repository.ts:44`, `apps/web/src/modules/questions/infrastructure/prisma-question-search.ts:109`, `apps/web/src/modules/document-tree/application/get-publication-tree.ts:188`
- **Regra ou spec:** _checklist.md §15: "Todo novo tipo de questão entra pelo registry"
- **Cenário:** Uma zona ou perfil carimba TRUE_FALSE ou CESPE, tipos que já estão no vocabulário e no INITIAL_OPTIONS. A aprovação monta o LaTeX com `withOptions=false`: a questão nasce do tipo certo, com zero alternativas e as letras coladas no enunciado, e a validação a reprova. No editor, criar à mão o mesmo tipo dá duas alternativas. Registrar um oitavo tipo objetivo exige lembrar deste arquivo, sem erro de compilação nem guarda.
- **Correção sugerida:** Levar ao plugin o que hoje está espalhado, por exemplo `readonly options: { initial: number; min: number } | null`, e fazer approval-plan e question-blueprint perguntarem a `pluginFor(type)`. Estender o guarda do §15 para comparações literais com QuestionType fora de questions/domain/plugins. Trocar o fallback silencioso para DISCURSIVE por um estado explícito de "tipo não suportado".
- **Verificação:** approval-plan.ts:247 decide alternativas por `===` com dois tipos, enquanto INITIAL_OPTIONS (question-blueprint.ts:62) usa quatro, e o guarda de question-type-plugin.test.ts:255 só pega `switch`. Mas hoje nenhuma zona nem perfil carimba TRUE_FALSE ou CESPE (book-fme-v1.ts:67 usa MULTIPLE_CHOICE, e os defaults são DISCURSIVE/MULTIPLE_CHOICE), então o cenário é latente. O fallback para DISCURSIVE trata string fora do vocabulário, que é outro caso que o do comentário de pluginFor (tipo sem plugin).

#### STM-03

**Dezenas de identificadores em português em domínio, aplicação e UI** — baixa (o revisor deu média) · confirmado · `hard-violation` · tarefa **I10**

- **Local:** `apps/web/src/modules/recognition/domain/segmentar-pagina.ts:120` · também: `apps/web/src/modules/recognition/domain/separar-alternativas.ts:51`, `apps/web/src/modules/rendering/domain/saida-do-render.ts:22`, `apps/web/src/modules/questions/domain/herdar-metadados.ts:29`, `apps/web/src/modules/publications/infrastructure/prisma-book-overview.ts:34`, `apps/web/src/modules/publications/domain/book-overview.ts:48`, `apps/web/src/modules/assets/ui/pdf-text-layer.ts:103`, `apps/web/src/modules/scan/domain/profiles/book-fme-v1.ts:80`, `apps/web/src/modules/portability/domain/import-conflicts.ts:84`, `apps/web/src/modules/recognition/ui/IngestionPanel.tsx:150`
- **Regra ou spec:** README §Convenções: "Idioma. Documentação em pt-BR; código, identificadores e mensagens de commit em inglês." · D54 ("Identificadores em inglês … ainda que a segmentação recente esteja em português")
- **Cenário:** O mesmo conceito passa a ter dois nomes no código (Variante/`Variant`, saída/`TemplateAudience`, estimativa/`QuestaoEstimada`), e quem procura por `includeSolution` não acha `incluiResolucao`. `FonteEditorial` ainda usa um termo que o glossário manda evitar ("PDF fonte — Avoid: fonte editorial"). A cada módulo novo cresce a mistura que a D54 mandou desfazer.
- **Correção sugerida:** Renomear por módulo, um PR por vez, começando pelos tipos exportados de domínio: `segmentPage`/`TextPage`/`EstimatedQuestion`, `splitAlternatives`, `RenderAudience`, `InheritedMetadata`, `SourcePdfSummary`, `BookIssue`. Deixar comentários e textos de tela em pt-BR. Acrescentar um lint `id-match`/`naming-convention` com lista de radicais portugueses comuns para barrar a volta.
- **Verificação:** README.md:95 exige identificadores em inglês, e o código tem segmentarPagina/largura/altura (segmentar-pagina.ts:27,120), SaidaDoRender/incluiResolucao (saida-do-render.ts:22,41), ehBanner (book-fme-v1.ts:80, código de hoje), formatarTamanho, FonteEditorial e PendenciaDoLivro. A D54 (_planejamento.md:1102-1103) reconhece o português legado, mas não o autoriza. É higiene de nome, sem bug, e as próprias mensagens de commit do repo também fogem da regra.

#### STM-04

**Avaliações (e outras escritas) pulam Use Case e Domain: regra de negócio mora na infraestrutura** — média · confirmado · `hard-violation` · tarefa **I2**

- **Local:** `apps/web/src/modules/assessments/infrastructure/prisma-assessment-repository.ts:131` · também: `apps/web/src/modules/document-tree/infrastructure/prisma-global-trash.ts:1`, `apps/web/src/modules/recognition/infrastructure/prisma-capture-queue.ts:1`, `apps/web/src/modules/portability/infrastructure/prisma-workspace-sink.ts:1`, `apps/web/src/modules/assessments/infrastructure/prisma-assessment-repository.ts:159`
- **Regra ou spec:** README §Convenções: "Fluxo obrigatório. Nada pula etapas: UI → Route Handler (Zod) → Use Case → Domain → Repository/Provider → Infraestrutura concreta" · _planejamento §4.4
- **Cenário:** A regra "uma prova só monta com questões da própria biblioteca" só pode ser testada contra Prisma. O próximo caminho de escrita, como duplicar uma avaliação ou o agente acrescentar uma questão, repete a consulta ou esquece o guarda. O bug #177 é exatamente esse esquecimento. Trocar SQLite por Postgres (D25) significa reescrever regra de negócio, e não só persistência.
- **Correção sugerida:** Criar assessments/application/{add-question,remove-question,delete-assessment,save-variant}.ts sobre uma `AssessmentRepository` (a fronteira primária Repository), com a regra de pertença no domínio, e deixar a infraestrutura só com as consultas. Fazer o mesmo com portability/application/import-workspace (orquestração inteira), document-tree/application/empty-trash e recognition/application/discard-capture.
- **Verificação:** A rota app/api/assessments/[assessmentId]/questions/route.ts:3-6 importa addQuestion/removeQuestion direto da infraestrutura, e a regra de pertença (#177) mora em prisma-assessment-repository.ts:131-159. O módulo não tem caso de uso de escrita (application tem só compose-assessment.ts). A linha 159 devolve `no_section` quando a avaliação não existe, e app/api/trash/route.ts:3 chama emptyGlobalTrash também direto. O padrão aparece em 63 route.ts, e o README:72-75 proíbe isso.

#### STM-05

**Read models na infraestrutura montam tela (href, ícone, CTA, texto) e são chamados direto pelas páginas** — baixa (o revisor deu média) · confirmado · `doc-drift` · tarefa **I1**

- **Local:** `apps/web/src/modules/publications/infrastructure/prisma-book-overview.ts:293` · também: `apps/web/src/modules/workspaces/infrastructure/prisma-home-overview.ts:209`, `apps/web/src/modules/recognition/application/create-question-from-recognition.ts:1`, `apps/web/src/modules/scan/ui/ScanWorkspace.tsx:428`
- **Regra ou spec:** README §Convenções (fluxo obrigatório) · _planejamento §4.4 ("objetos Prisma não são o contrato público até o React — criar DTOs e projeções")
- **Cenário:** Divergent Change: prisma-book-overview.ts muda quando muda o schema, uma rota (`/ingestao`), um ícone, um texto ou a regra do que é pendência. Renomear a rota de ingestão exige caçar literais em 5 arquivos de 4 camadas, inclusive recognition/application/create-question-from-recognition.ts. A regra de pendências da Home e a do livro já podem divergir sem que nenhum teste perceba.
- **Correção sugerida:** Registrar no README e no §4.4 a exceção que a prática já assumiu: Server Component pode ler um read model sem passar por Route Handler. Tirar do read model o que é tela: a infraestrutura devolve fatos (`invalidCount`, `firstInvalidId`, `queueSize`, `hasSource`), e um módulo de domínio ou UI compartilhado entre Home e livro monta as pendências. As rotas vão para um único `routes.ts`.
- **Verificação:** PendenciaDoLivro (prisma-book-overview.ts:24-31) carrega cta/href/icon, montados em 305-342 com a rota `/ingestao` literal, e prisma-home-overview.ts:246-275 repete as mesmas rotas. 18 page/layout importam infraestrutura direto. É um desvio de doc (README:72-75) que o próprio arquivo assume ('Read model e não repositório'), então conta como dívida organizacional, não como bug.

#### STM-06

**"Zod na entrada e na saída do Route Handler" não é a prática: o domínio faz o parse de `unknown` à mão** — baixa (o revisor deu média) · confirmado · `doc-drift` · tarefa **I1**

- **Local:** `apps/web/src/modules/publications/domain/publication-draft.ts:41` · também: `apps/web/src/modules/workspaces/domain/library.ts:53`, `apps/web/src/modules/document-tree/domain/node-body.ts:35`, `apps/web/src/modules/questions/domain/question-blueprint.ts:69`, `apps/web/src/modules/agents/domain/question-patch.ts:180`
- **Regra ou spec:** _planejamento §4.4 ("Route Handler · validação Zod na entrada e na saída") · README §Convenções ("Route Handler (Zod)")
- **Cenário:** Quem segue o README escreve schema Zod na rota e valida duas vezes; quem segue o repo valida no domínio. Hoje convivem três estilos: Zod no domínio (question-patch), parse manual no domínio (publications, workspaces, questions) e checagem `typeof` na rota (assessments/questions/route.ts). A saída não é validada em lugar nenhum, e o contrato da API não existe em forma consultável.
- **Correção sugerida:** Decidir e registrar num ADR. Opção A: o domínio aceita `unknown` e é o validador (a prática atual), e o §4.4 e o README passam a dizer isso, com Zod opcional. Opção B: schemas Zod por rota em `app/api/**/schema.ts`, e o domínio recebe tipos já estreitados. Nos dois casos, uniformizar o agents/domain/question-patch.ts.
- **Verificação:** Das 67 route.ts, só app/api/scans/[runId]/items/route.ts importa zod, contra o _planejamento.md:1219 ('validação Zod na entrada e na saída'), e o domínio faz parse de unknown (publication-draft.ts:41,155; library.ts:53; node-body.ts:35). Uma parte da sugestão não se sustenta: o Zod em agents/domain/question-patch.ts é intencional e documentado (_checklist.md:935 e 2250), então não há o que 'uniformizar' ali.

#### STM-07

**A aprovação prefere o perfil vivo ao retrato, ao contrário do que o ADR 0008 e a tela dizem** — média · confirmado · `doc-drift` · tarefa **B7**

- **Local:** `apps/web/src/modules/scan/application/approve-scan.ts:73` · também: `apps/web/src/modules/scan/ui/ScanWorkspace.tsx:397`, `apps/web/src/modules/scan/infrastructure/prisma-scan-approval.ts:68`
- **Regra ou spec:** docs/adr/0008-perfil-que-sai-do-registro.md · CONTEXT.md, Retrato do perfil ("É o que mantém a proposta legível e aprovável")
- **Cenário:** Um perfil troca `defaultQuestionType` (ou sobe de versão) entre a varredura e a aprovação. Uma proposta revisada ontem é aprovada com o tipo de hoje, e a proveniência grava `@<versão viva>` em vez da versão que de fato varreu. É o desalinho que o retrato existe para impedir.
- **Correção sugerida:** Inverter a precedência: `run.profileSnapshot ?? live`, com `version: run.profileVersion` sempre. Cobrir com um teste em que o perfil registrado difere do retrato.
- **Verificação:** approve-scan.ts:73-78 usa `live` primeiro e só cai no retrato quando o perfil saiu do registro, com `version: live.version`, que vai para extractionMethod (prisma-scan-approval.ts:68). O ADR 0008 (Consequences) diz que o vivo só responde por execuções com retrato NULL, e o próprio comentário em approve-scan.ts:66-71 e o texto de ScanWorkspace.tsx:397 prometem o retrato. Hoje o impacto é pequeno porque as versões nunca sobem (ver STD-SCAN-01).

#### STM-08

**Possível Duplicated Code: dois escapes de texto para LaTeX, e o da avaliação não trata a barra invertida** — média · confirmado · `judgement-call` · tarefa **E2**

- **Local:** `apps/web/src/modules/assessments/domain/assessment-template.ts:219` · também: `apps/web/src/modules/recognition/domain/latex-escape.ts:46`, `apps/web/src/modules/assessments/domain/assessment-template.ts:107`
- **Regra ou spec:** Baseline Fowler: Duplicated Code
- **Cenário:** Uma avaliação com título `Lista 1\2` ou com observação "use a\b" gera `\2`/`\b` no cabeçalho: erro de compilação, ou comando executado em vez de texto. `~` vira `\~{}`, acento til sobre o vazio, e não o caractere til. O escape certo já existe no repositório, num módulo que a avaliação não usa.
- **Correção sugerida:** Mover `escapeLatexText` para um lugar neutro (latex/domain ou shared) e usá-lo em assessment-template, apagando `escapeText`. Acrescentar ao teste da avaliação um caso com `\`, `~` e `^`.
- **Verificação:** assessment-template.ts:219-220 não escapa `\`, então título ou observação com `a\b` vira comando LaTeX nas linhas 105-110. recognition/domain/latex-escape.ts:31-46 já trata os dez reservados, com \textbackslash{}. A linha 107 imprime "Versão", e o CONTEXT.md:325 manda evitar esse termo para Variante. O `~` como `\~{}` sai como um til elevado, o que é menos grave do que o achado diz.

#### STM-09

**"Diagnóstico" sem qualificar na tela, e o diagnóstico do item exibido cru em inglês** — baixa · confirmado · `hard-violation` · tarefa **I10**

- **Local:** `apps/web/src/modules/scan/ui/ScanPropertiesPanel.tsx:253` · também: `apps/web/src/modules/scan/domain/workspace-view.ts:25`, `apps/web/src/modules/diagnostics/ui/DiagnosticsView.tsx:161`, `apps/web/src/modules/assets/ui/OriginPanel.tsx:167`
- **Regra ou spec:** CONTEXT.md: Diagnóstico do item ("Avoid: diagnóstico (sem qualificar)") e Diagnóstico do app ("Qualificar é obrigatório")
- **Cenário:** Quem revisa uma proposta lê `insufficient_evidence` num painel em português, e o "Diagnóstico" do item e o "Diagnóstico" do app aparecem no mesmo dia com o mesmo nome, que é a ambiguidade que o glossário proíbe. Com `status: string`, um status novo nunca vai ganhar rótulo por exigência do compilador.
- **Correção sugerida:** Criar `DIAGNOSTIC_LABELS: Record<DiagnosticStatus, string>` no domínio do scan, como o `KIND_LABELS` que já existe. Tipar `ViewItem` com `DiagnosticStatus`/`AnchorRole`. Rotular "Diagnóstico do item" e "Diagnóstico do app" nas três telas.
- **Verificação:** ScanPropertiesPanel.tsx:253-254 mostra 'Diagnóstico' sem qualificar e o status cru em inglês. workspace-view.ts:24-25 tipa status e role como string. CONTEXT.md:177 e 361-363 exigem qualificar 'do item'/'do app'. DiagnosticsView.tsx:161 e OriginPanel.tsx:167 também não qualificam.

#### STM-10

**Termos evitados em texto de tela: "workspace", "publicação(ões)", "acervo" para uma só biblioteca** — baixa · confirmado · `hard-violation` · tarefa **I10**

- **Local:** `apps/web/src/modules/diagnostics/ui/DiagnosticsView.tsx:191` · também: `apps/web/src/modules/diagnostics/ui/DiagnosticsView.tsx:238`, `apps/web/src/modules/diagnostics/ui/DiagnosticsView.tsx:254`, `apps/web/src/modules/diagnostics/application/collect-diagnostics.ts:249`, `apps/web/src/modules/legacy-import/application/map-legacy-library.ts:206`, `apps/web/src/modules/questions/application/create-question.ts:25`
- **Regra ou spec:** CONTEXT.md: Biblioteca ("Avoid: workspace (em texto de tela)… acervo (quando se refere a uma só)") · Livro ("Avoid: publicação (fora de identificadores)")
- **Cenário:** A tela de diagnóstico ensina ao usuário uma palavra ("workspace") que o produto inteiro chama de biblioteca, e promete "o acervo inteiro" num botão que exporta uma biblioteca só. Quem restaura um backup acha que tem tudo e tem um pedaço. O título "Publicação 12" fica gravado no acervo.
- **Correção sugerida:** Trocar os textos por biblioteca, livro(s) e "a biblioteca inteira". Corrigir o fallback do legado para "Livro N". Revisar as mensagens de erro de domínio que sobem para a UI.
- **Verificação:** DiagnosticsView.tsx:143,191,238,254 diz 'workspace novo', 'acervo inteiro' e 'publicação(ões)', embora cada botão exporte uma biblioteca (linha 214, ?workspaceId=). collect-diagnostics.ts:249 rotula 'Workspaces', map-legacy-library.ts:206 grava 'Publicação N' e create-question.ts:25 fala em 'nesta publicação'. Tudo isso contraria CONTEXT.md:12 e 21.

#### STM-11

**A aba da resolução se chama "Resposta", termo que o glossário manda evitar, e o checklist a confirma** — baixa · confirmado · `doc-drift` · tarefa **I10**

- **Local:** `apps/web/src/modules/latex/domain/latex-language.ts:119` · também: `apps/web/src/modules/rendering/ui/RenderPanel.tsx:122`, `apps/web/src/modules/preview/ui/PreviewPane.tsx:207`
- **Regra ou spec:** CONTEXT.md, Resolução ("Avoid: solução, resposta") vs _checklist.md:467
- **Cenário:** "Resposta" é exatamente a palavra que o glossário separa de gabarito. Quem lê "Resposta" na aba espera a letra certa e acha a resolução, e a saída de professor ("gabarito e resolução") passa a usar outro nome para o mesmo campo. Os três rótulos vivem em três mapas e podem divergir.
- **Correção sugerida:** Decidir entre "Resolução" (glossário) e "Resposta" (legado/checklist) e corrigir o perdedor. Fazer RenderPanel e PreviewPane lerem `QUESTION_FIELDS` em vez de redeclarar os rótulos.
- **Verificação:** latex-language.ts:119, RenderPanel.tsx:122 e PreviewPane.tsx:206 usam 'Resposta' para solutionLatex, e CONTEXT.md:69-71 manda evitar 'resposta' para a Resolução. O _checklist.md:467 registra 'Conteúdo, Resposta, Complemento', de modo que a doc se contradiz, e os rótulos estão declarados em três mapas.

#### STM-12

**Mesmo conceito com dois nomes: âncora é `ProposedRegion`, e "workspace" nomeia a tela de revisão** — baixa · plausível · `judgement-call` · tarefa **I10**

- **Local:** `apps/web/src/modules/scan/domain/capture-profile.ts:225` · também: `apps/web/src/modules/scan/domain/workspace-view.ts:24`, `apps/web/src/modules/scan/ui/ScanWorkspace.tsx:97`, `apps/web/src/modules/scan/domain/capture-profile.ts:243`
- **Regra ou spec:** CONTEXT.md: Âncora de origem e Zona (Avoid: região); Biblioteca (`Workspace`); Retrato do perfil (Avoid: snapshot) · Baseline: Mysterious Name
- **Cenário:** Mysterious Name: `ScanWorkspace` sugere "a biblioteca do scan", e `regions` sugere a zona ou um conceito diferente da âncora. Quem chega ao scan pelo glossário não acha âncora no código da proposta, e a revisão de código seguinte vai discutir se `regions` e `anchors` são coisas diferentes (não são).
- **Correção sugerida:** Renomear `ProposedRegion`→`ProposedAnchor` e `regions`→`anchors` no domínio (o JSON persistido pode manter a chave com um mapeamento na infraestrutura), e `ScanWorkspace`/`workspace-view`→`ScanReview`/`review-view`. Acrescentar ao CONTEXT.md o identificador canônico do Retrato do perfil (`CaptureProfileSnapshot`), ou mudar o _Avoid_ para "(em texto de tela)".
- **Verificação:** ProposedRegion existe (proposal.ts:53) e o comentário da linha 52 o chama de 'âncora proposta'. Mas os _Avoid_ do glossário (CONTEXT.md:132 e 201) listam termos em português ('região'), e o identificador em inglês é defensável. ScanWorkspace/profileSnapshot é questão de nome, não de comportamento. A localização do CaptureProfileSnapshot está errada: é capture-profile.ts:225, e a linha 243 é registerCaptureProfile.

#### STM-13

**Possível Shotgun Surgery / Repeated Switches: fatos de cada ScanKind espalhados em 9 conjuntos** — baixa · plausível · `judgement-call` · tarefa **I9**

- **Local:** `apps/web/src/modules/scan/domain/workspace-view.ts:108` · também: `apps/web/src/modules/scan/domain/proposal.ts:33`, `apps/web/src/modules/scan/domain/approval-plan.ts:115`, `apps/web/src/modules/scan/domain/structure.ts:530`, `apps/web/src/modules/scan/application/semantic-review.ts:35`, `apps/web/src/modules/scan/application/math-recognition.ts:23`
- **Regra ou spec:** Baseline Fowler: Repeated Switches / Shotgun Surgery
- **Cenário:** O próximo tipo de elemento, por exemplo um EXERCISE_ANSWER para a zona de gabarito, exige lembrar de 9 conjuntos em 6 arquivos. Esquecer um não quebra a compilação: o item só deixa de ser reconhecido pela IA, de aparecer no filtro "estrutura" ou de virar nó na aprovação.
- **Correção sugerida:** Um `SCAN_KIND_TRAITS: Record<ScanKind, { heading; nodeKind; approvesAs: 'node'|'question'|'body'|'folded'; recognizable; reclassifiable; label }>` em proposal.ts, e os conjuntos derivados dele. O `Record` completo obriga o compilador a cobrar cada tipo novo. Extrair `containsFrom(map)` para os perfis.
- **Verificação:** STRUCTURE (workspace-view.ts:108) repete os títulos de HEADING_KINDS (proposal.ts:33), e existem NODE_KIND/BODY_KINDS/QUESTION_KINDS/FOLDED_KINDS (approval-plan.ts:115-127), TOC_KINDS (structure.ts:530), RECLASSIFIABLE (semantic-review.ts:35) e RECOGNIZED_KINDS (math-recognition.ts:23). É um smell real de Shotgun Surgery, mas não há bug demonstrado, e vários conjuntos são deliberadamente diferentes, não cópias.

#### STM-14

**Configuração lida por fora do `env()` validado, e I/O concreto dentro da camada de aplicação** — baixa · confirmado · `judgement-call` · tarefa **I3**

- **Local:** `apps/web/src/modules/scan/infrastructure/scan-passes.ts:30` · também: `apps/web/src/modules/diagnostics/application/collect-diagnostics.ts:225`, `apps/web/src/modules/diagnostics/application/collect-diagnostics.ts:32`
- **Regra ou spec:** shared/config/env.ts (contrato "validada uma vez") · _planejamento §4.5 ("application depende de interfaces")
- **Cenário:** `AI_VISION_MODEL=" "` no .env.local liga a passada de matemática com modelo em branco, e cada chamada falha. As quatro leituras podem discordar sobre se a visão está configurada, com a tela oferecendo "Reconhecer matemática" e o laço dizendo que não há modelo. A página de diagnóstico não mostra AI_VISION_MODEL porque ele não passa pelo `env()`.
- **Correção sugerida:** Acrescentar `aiVisionModel` e `backupDestination` ao `AppEnv`/`loadEnv` e trocar as leituras soltas. Mover o probe do renderer e a leitura do backup-status para diagnostics/infrastructure, deixando a aplicação só compor, e corrigir o comentário do timeout.
- **Verificação:** scan-passes.ts:30, app/api/recognition/route.ts:35 e app/publications/[id]/scan/page.tsx:75 leem AI_VISION_MODEL por fora do env() (shared/config/env.ts:4, 'validada uma vez'), sem trim, e collect-diagnostics.ts:225 lê BACKUP_DESTINATION do mesmo jeito. A camada de aplicação faz fetch/readFile (collect-diagnostics.ts:3,147,235), e o comentário 'Um segundo' precede 2_000 (linha 31-32). A tese de que as leituras 'podem discordar' é fraca, porque todas usam a mesma expressão.

#### STM-15

**§4.6 Estrutura e D54 não descrevem mais o repositório, e há ciclos entre módulos** — baixa · confirmado · `doc-drift` · tarefa **I1**

- **Local:** `apps/web/src/modules/assets/ui/PdfCropViewerInner.tsx:20` · também: `apps/web/src/modules/scan/domain/profiles/exam-v1.ts:1`, `apps/web/src/modules/recognition/ui/IngestionPanel.tsx:1`, `apps/web/src/modules/latex-knowledge/ui/latex-completion.ts:1`, `apps/web/src/modules/workspaces/infrastructure/prisma-library-shelf.ts:1`
- **Regra ou spec:** _planejamento §4.6 Estrutura · D54 · _checklist §14 ("Nenhuma dependência circular intencional")
- **Cenário:** Quem segue a §4.6 cria código em `modules/ingestion` ou em `src/infrastructure/ai` e duplica o que já existe. Os ciclos tornam impossível extrair um módulo sozinho: o visualizador de PDF genérico de assets depende do domínio de recognition, que depende da UI de assets.
- **Correção sugerida:** Atualizar a §4.6 com a árvore real, apagar os `.gitkeep` mortos e registrar por que `src/infrastructure/agent` existe. Mover `segmentar-pagina` (renomeado) para scan/domain/profiles/exam-v1, como a D54 pediu, e fazer recognition e assets dependerem do scan. Quebrar os demais ciclos movendo o tipo compartilhado (ex.: `QuestionType` e `fractional-index` para um módulo neutro). Acrescentar uma regra `import/no-cycle` no nível de módulo.
- **Verificação:** src/modules/ingestion e revisions são só .gitkeep, e src/infrastructure/ai/openai-compatible e rendering/worker também. PdfCropViewerInner.tsx:18-22 (UI de assets) importa recognition/domain/segmentar-pagina, IngestionPanel importa @modules/assets, e isso fecha o ciclo assets↔recognition. exam-v1.ts:2-5 embrulha segmentarPagina, o inverso do que a D54 (_planejamento.md:1101) descreveu. O _checklist.md:2275 marca ✅ 'Nenhuma dependência circular intencional'.

#### STM-16

**Possível Primitive Obsession / Duplicated Code: ISBN normalizado em três lugares e tamanho de arquivo formatado de três jeitos** — baixa · confirmado · `judgement-call` · tarefa **I6**

- **Local:** `apps/web/src/modules/publications/domain/catalog-import.ts:102` · também: `apps/web/src/modules/portability/application/import-workspace.ts:71`, `apps/web/src/modules/publications/domain/publication-draft.ts:159`, `apps/web/src/modules/diagnostics/application/collect-diagnostics.ts:270`, `apps/web/src/modules/publications/domain/book-overview.ts:117`
- **Regra ou spec:** Baseline Fowler: Primitive Obsession / Duplicated Code
- **Cenário:** A detecção de duplicata por ISBN do Calibre e a colisão do `.lbb` dependem de a normalização ser idêntica nos dois módulos. Uma correção, como remover o prefixo "ISBN" ou tratar o ISBN-10 contra o 13, entra em uma cópia e não na outra, e o mesmo livro colide num caminho e não no outro. O mesmo PDF aparece como "12.3 kB" no diagnóstico e "12 KB" no livro.
- **Correção sugerida:** Criar publications/domain/isbn.ts com `normalizeIsbn` (e, se valer, um tipo `Isbn`), usado por catalog-import, publication-draft e portability, e um único `formatBytes` em shared/format.
- **Verificação:** normalizeIsbn aparece privada em catalog-import.ts:102 e exportada em portability/application/import-workspace.ts:71, e parseIsbn repete a normalização inline (publication-draft.ts:159). Os tamanhos saem de três jeitos: formatBytes (collect-diagnostics.ts:270, 'kB' com ponto), formatarTamanho (book-overview.ts:117, 'KB' inteiro) e megabytes em app/page.tsx:72. É duplicação real, sem divergência de ISBN observada hoje.

#### STM-17

**Possível Divergent Change: IngestionPanel com 918 linhas, 15+ estados, 5 fetches e regra de domínio** — baixa · plausível · `judgement-call` · tarefa **I8**

- **Local:** `apps/web/src/modules/recognition/ui/IngestionPanel.tsx:205` · também: `apps/web/src/modules/recognition/ui/IngestionPanel.tsx:134`, `apps/web/src/modules/recognition/ui/IngestionPanel.tsx:169`
- **Regra ou spec:** Baseline Fowler: Divergent Change · D47 (regra calculada fora do React)
- **Cenário:** Mudar o lote de reconhecimento, o upload, a divisão de alternativas ou o layout exige editar o mesmo arquivo de 900 linhas, sem teste de unidade possível para a lógica de lote e divisão, que só existe dentro de closures do React.
- **Correção sugerida:** Extrair para recognition/domain uma máquina de estado pura da sessão de captura (fonte → recorte → candidato → aceito) e o `aplicarDivisoes`. Criar um `capture-client.ts` com os fetches, como o `scan-client.ts` já faz no scan. O componente fica só com a composição.
- **Verificação:** IngestionPanel.tsx tem 918 linhas, 14 useState, cinco fetch (329, 383, 451, 466, 497), o bloco CSS (37) e MODO_DO_PROVIDER (169). Mas aplicarDivisoes (134) é função de módulo, não closure, e pode ser exportada e testada, então a afirmação de que a regra 'só existe dentro de closures do React' é exagerada. É um smell de tamanho defensável.

#### STM-18

**"Abstração só onde há múltiplas implementações reais ✅" não bate com a prática de interface por costura de teste** — baixa · plausível · `doc-drift` · tarefa **I1**

- **Local:** `docs/_atual/_checklist.md:2330` · também: `apps/web/src/modules/legacy-import/infrastructure/node-legacy-fs-probe.ts:1`, `apps/web/src/modules/scan/infrastructure/pdf-figure-cropper.ts:1`
- **Regra ou spec:** D23 (pergunta de controle; "Continua proibido: interface para classe que nunca terá outra implementação") · _checklist §15 (último item)
- **Cenário:** A regra, do jeito que está escrita, reprovaria metade das interfaces do repositório, e a marca ✅ no checklist é falsa. Um revisor ou agente que aplique a D23 ao pé da letra vai propor apagar costuras que sustentam a suíte de 1804 testes, e outro vai criar interface para tudo citando os precedentes. Sem critério escrito, cada caso vira debate.
- **Correção sugerida:** Reescrever a pergunta de controle na D23 e no README para incluir o critério que a prática usa: "… ou o caso de uso precisa rodar em teste sem I/O real (dublê em memória)". Desmarcar ou reformular o item do §15. Revisar as poucas interfaces sem nenhum uso em teste nem segunda implementação (LegacyFsProbe, FigureCropper) contra o novo critério.
- **Verificação:** _checklist.md:2330 marca ✅ 'Abstração criada apenas onde há múltiplas implementações reais', o que é mais estreito que a D23. A pergunta de controle da D23 (_planejamento.md:559) inclui 'ou uma fronteira arquitetural importante', e Persistence/Repository é fronteira primária (linha 543). Por isso ScanStore e similares já se justificam pela D23, e a tese de que a regra 'reprovaria metade das interfaces' não se sustenta. O desalinho real é só a redação do item do checklist.

### Standards · Entrega, infraestrutura e serviços (`app/`, `src/shared`, `src/infrastructure`, `services/`)

**Resumo do revisor.** A camada de entrega é disciplinada no varejo: params assíncronos, `force-dynamic` coerente com o Next 16.3 e DTOs projetados campo a campo na maioria das rotas. No atacado, porém, ela se afasta do fluxo documentado. 22 das 67 rotas não chamam nenhum use case; só 1 valida a entrada com Zod, embora README e planejamento o exijam; a regra de negócio vaza para rotas e adaptadores Prisma (avaliações, lixeira, revalidação após salvar). O tratamento de erro está espalhado em quatro mapeadores encadeados, com códigos diferentes para o mesmo caso. Há um bug de uso normal em /avaliacoes, que só enxerga a primeira biblioteca, e um provável 500 ao esvaziar a lixeira quando uma questão excluída está numa avaliação. O glossário é violado em textos de tela ("Publicações", "workspace", "Diagnóstico") e há identificadores em português, contra o README.

<details><summary>Cobertura declarada</summary>

Li por inteiro: as 67 route.ts de apps/web/app/api e os helpers tree-http.ts, scans/scan-http.ts, scans/scan-dto.ts, catalog/catalog-http.ts e libraries/library-http.ts. Li também, por inteiro, shared/config/env.ts, shared/authorization/question-scope.ts, shared/ports/repository.ts, infrastructure/database/sqlite/client.ts, app/avaliacoes/page.tsx, app/rail.ts (trecho dos módulos), scripts/delete-orphan-questions.ts, scripts/religar-acervo-legado.ts, services/backup/src/config.ts e scan/infrastructure/scan-deps.ts. Do CONTEXT.md, li os verbetes e as linhas _Avoid_; do planejamento, o §4 (1159–1330); do checklist, o §14 e o §15. Nas 17 page.tsx olhei imports e carga de dados (grep), e nas screens de app/ procurei controles crus, estados vazios e texto de tela. Do design-system, li Input, Badge, Banner e StatusDot, e cruzei as classes lbb-* definidas no DS com as de app/ e modules/. Dos demais scripts de apps/web/scripts, varri caminhos de máquina (só aparecem em comentários de uso, e desatualizados: /mnt/t em vez de /mnt/bak) e uso de Prisma. Na pasta de docs do Next 16.3, conferi route.md (segment config e RouteContext). Fora de módulo, olhei por grep prisma-global-trash, prisma-option-writer, prisma-assessment-repository, mutate-tree (restoreNode) e ValidationPane para confirmar consequências. Não li: services/renderer/src em detalhe, packages/render-contract (só os imports), apps/web/prisma além das regras onDelete, o resto dos componentes de DS e as screens client de app/ linha a linha. Não executei nada: o 500 da lixeira e o selo de validação desatualizado são inferências do código e do schema, sem reprodução.

</details>

#### STE-01

**/avaliacoes só enxerga e só cria avaliações na primeira biblioteca em ordem alfabética** — alta · confirmado · `bug` · tarefa **E1**

- **Local:** `apps/web/app/avaliacoes/page.tsx:22`
- **Regra ou spec:** CONTEXT.md, Biblioteca: 'Unidade de isolamento do acervo: um conjunto independente de livros, questões, tags e avaliações'
- **Cenário:** Acervo com 13 bibliotecas. A pessoa abre /avaliacoes e vê só as provas da biblioteca de nome alfabeticamente primeiro. Toda prova nova nasce nessa biblioteca. Ao acrescentar uma questão de qualquer outra biblioteca, `addQuestion` recusa com 400 `question_from_another_workspace` (assessments/[assessmentId]/questions/route.ts:35). Na prática não há como montar avaliação para 12 das 13 bibliotecas.
- **Correção sugerida:** Tornar a biblioteca explícita, por segmento (/bibliotecas/[slug]/avaliacoes) ou por searchParam com seletor, e passar o workspaceId escolhido para listAssessments e NewAssessment. Incluir um teste de página ou E2E com duas bibliotecas.
- **Verificação:** app/avaliacoes/page.tsx:21-22 pega `workspaces[0]` de listWorkspaces (orderBy name asc, prisma-workspace-list.ts) e ignora searchParams; não há seletor. Questão de outra biblioteca é recusada em assessments/[assessmentId]/questions/route.ts:35-45, e CONTEXT.md:10 diz que o legado tem treze bibliotecas, então o cenário acontece no uso normal.

#### STE-02

**Fluxo obrigatório exige Zod no Route Handler, mas só 1 de 67 rotas o usa, e os próprios docs se contradizem** — média · confirmado · `doc-drift` · tarefa **I1**

- **Local:** `README.md:75` · também: `docs/_atual/_planejamento.md:1219`, `docs/_atual/_checklist.md:935`, `apps/web/app/api/tree-http.ts:11`, `apps/web/src/shared/config/env.ts:10`, `apps/web/app/api/agents/patches/apply/route.ts:68`, `apps/web/app/api/agents/patches/revert/route.ts:62`, `apps/web/app/api/assets/crop/route.ts:107`, `apps/web/app/api/publications/[id]/questions/from-recognition/route.ts:101`
- **Regra ou spec:** README.md §Convenções (fluxo obrigatório) · planejamento §4.4
- **Cenário:** Cada rota reinventa parsing com `typeof`, e com critérios diferentes. `requireString` aparece duplicado em patches/apply e patches/revert; `requireText`, em crop e from-recognition; `readJson(request).catch(() => ({}))`, em 4 rotas. Os limites também divergem: statementLatex da questão tem teto de 200_000, o da alternativa não tem teto nenhum. Campos inválidos são coagidos em silêncio (`profileId: typeof ... ? ... : ""` em scans e switch-profile, `String(body["externalId"] ?? "")` em catalog). Quem lê o README e espera um schema por rota não o encontra.
- **Correção sugerida:** Decidir e registrar. Opção 1: adotar Zod na entrada de todas as rotas (um `parseBody(schema)` em tree-http) e remover os parsers ad hoc. Opção 2: corrigir README §Convenções e planejamento §4.4 para 'validação de entrada no Route Handler (Zod onde o schema é rico)'. Em qualquer caso, alinhar os comentários de tree-http.ts e env.ts, e criar um ADR curto.
- **Verificação:** README.md:75 e _planejamento.md:1219 exigem Zod na entrada e na saída, mas tree-http.ts:11 e env.ts:10 registram a decisão contrária, e Zod aparece só em scans/[runId]/items/route.ts entre as rotas. requireString está duplicado em patches/apply:68 e revert:62, requireText em crop:107 e from-recognition:101, e há coerção silenciosa em scans/route.ts:38 e switch-profile:23. A divergência é de documentação, e a decisão no código é consciente.

#### STE-03

**Rotas de escrita pulam o use case e deixam a regra de negócio na rota ou no adaptador Prisma (avaliações, recorte, reconhecimento, import, lixeira)** — média · confirmado · `hard-violation` · tarefa **I2**

- **Local:** `apps/web/app/api/assessments/[assessmentId]/route.ts:97` · também: `apps/web/app/api/assessments/[assessmentId]/variants/route.ts:65`, `apps/web/app/api/assessments/[assessmentId]/questions/route.ts:33`, `apps/web/app/api/assessments/route.ts:49`, `apps/web/app/api/assets/crop/route.ts:64`, `apps/web/app/api/recognition/route.ts:81`, `apps/web/app/api/workspaces/import/route.ts:54`, `apps/web/app/api/publications/[id]/capture-queue/[anchorId]/route.ts:25`, `apps/web/app/api/trash/route.ts:42`
- **Regra ou spec:** README.md §Convenções: 'Fluxo obrigatório. Nada pula etapas: UI → Route Handler → Use Case → Domain → Repository'
- **Cenário:** Regras de negócio sem teste de unidade: a trava de variantes, que protege o gabarito de prova já impressa, só existe na rota; um script ou uma segunda tela que chame deleteAssessment passa por fora dela. No crop, uma falha em `createAnchor` deixa um Asset(CROP) órfão no banco e no storage. A próxima fase que precisar dessas operações fora do HTTP (agente, backup, CLI) vai duplicar a orquestração.
- **Correção sugerida:** Criar use cases finos: assessments/application/manage-assessments.ts (create, addQuestion, removeQuestion, delete com confirmação, composeAndSaveVariant), assets/application/save-crop.ts (numa transação, via uma porta do writer), recognition/application/recognize-crop.ts e portability/application/import-workspace (dry-run e escrita). As rotas passam a só traduzir HTTP. Mover para o use case a decisão 'in-use' e o que 'esvaziar' apaga.
- **Verificação:** 22 das 67 route.ts não importam nada de /application/. A trava variants_would_be_lost só existe na rota (assessments/[assessmentId]/route.ts:97), porque deleteAssessment (prisma-assessment-repository.ts:214) apaga sem checar. O crop encadeia storeAsset, createAsset, createAnchor e attachAnchorToQuestion sem transação (assets/crop/route.ts:64-89).

#### STE-04

**Esvaziar a lixeira provavelmente estoura com 500 quando uma questão excluída está numa avaliação (FK Restrict ignorada)** — média · confirmado · `bug` · tarefa **D1**

- **Local:** `apps/web/app/api/trash/route.ts:42` · também: `apps/web/src/modules/document-tree/infrastructure/prisma-global-trash.ts:175`, `apps/web/prisma/schema.prisma:903`
- **Regra ou spec:** README.md §Convenções (fluxo obrigatório); checklist §14 DoD 'Erro tratado'
- **Cenário:** A pessoa põe a questão Q numa avaliação, depois exclui o nó de Q no editor (vai para a lixeira) e clica em 'Esvaziar' em /lixeira. O deleteMany de Question viola a FK e a transação inteira volta. A resposta é um 500 sem corpo JSON, a lixeira não esvazia nada e a tela não diz por quê.
- **Correção sugerida:** Levar a regra para um use case (emptyTrash) que detecta questões referenciadas por avaliações e as preserva, reportando quais (ou recusa com 409 e a lista, como a exclusão de avaliação com variantes). Mapear o conflito para um código semântico e cobrir com um teste de integração contra SQLite.
- **Verificação:** emptyGlobalTrash (prisma-global-trash.ts:175) faz question.deleteMany sem olhar AssessmentItem, cuja FK é onDelete: Restrict (schema.prisma:903). Os próprios autores registram em prisma-library-repository.ts:103 que isso trava a exclusão. Nada em document-tree impede mandar para a lixeira uma questão que está numa avaliação, e toErrorResponse (tree-http.ts:101) relança o erro, o que dá um 500 sem JSON. Não existe teste de emptyGlobalTrash.

#### STE-05

**Possível Feature Envy: a orquestração 'salvar e revalidar' mora na rota, e as outras escritas da questão não revalidam** — média · confirmado · `judgement-call` · tarefa **D4**

- **Local:** `apps/web/app/api/publications/[id]/questions/[questionId]/route.ts:258` · também: `apps/web/app/api/publications/[id]/questions/[questionId]/options/[optionId]/route.ts:60`, `apps/web/app/api/publications/[id]/questions/[questionId]/options/route.ts:75`, `apps/web/app/api/agents/patches/apply/route.ts:39`
- **Regra ou spec:** planejamento §4.4 (Route Handler → Use Case); baseline Fowler: Feature Envy / Shotgun Surgery
- **Cenário:** Questão de múltipla escolha marcada INVALID por `no_correct_option`. A pessoa marca a alternativa C como correta pela aba de alternativas, e o PATCH de alternativa não recalcula. A árvore continua vermelha até ela editar o enunciado ou apertar 'Validar'. O mesmo acontece depois de aplicar um patch do agente que corrige o gabarito.
- **Correção sugerida:** Mover a sequência salvar → revalidar (com keepVersion) para a camada de aplicação, num `afterQuestionChanged(questionId)` chamado por saveQuestion, mutate-options e apply-question-patch, e tirar essa lógica da rota.
- **Verificação:** validateAndPersist só é chamado em questions/[questionId]/route.ts:266, pela revalidação pós-save, e em validation/route.ts:51. As mutações de alternativa (options/[optionId]/route.ts:53-67) não revalidam, e mutate-options não toca em validação, embora no_correct_option e multiple_correct_options dependam das alternativas (multiple-correct.ts:39) e statusFor leia validationStatus gravado (node-status.ts).

#### STE-06

**Tratamento de erro inconsistente: quatro mapeadores encadeados, códigos diferentes para o mesmo caso e 500 sem JSON** — média · confirmado · `judgement-call` · tarefa **I4**

- **Local:** `apps/web/app/api/tree-http.ts:101` · também: `apps/web/app/api/scans/scan-http.ts:14`, `apps/web/app/api/catalog/catalog-http.ts:50`, `apps/web/app/api/libraries/library-http.ts:26`, `apps/web/app/api/publications/[id]/questions/[questionId]/validation/route.ts:38`, `apps/web/app/api/publications/[id]/tree/route.ts:24`, `apps/web/app/api/ai/test/route.ts:28`
- **Regra ou spec:** checklist §14 DoD 'Erro tratado'; library-http.ts:128 'Cada erro carrega um código semântico ... a UI escolhe a mensagem a partir dele'
- **Cenário:** O cliente que ramifica por `error` precisa conhecer três grafias de 'não encontrado'. Uma falha de banco (SQLite travado, FK) devolve um 500 cujo corpo não é JSON, e telas que fazem `response.json()` sem catch (ValidationPane.tsx:62, por exemplo) caem num 'Unexpected token' em vez de mostrar a mensagem. Cada rota nova precisa lembrar qual mapeador chamar, e em que ordem.
- **Correção sugerida:** Um único `toHttpError(error)` em app/api/http.ts, com uma tabela classe → {status, code}, que mapeia o desconhecido para 500 `{error:"internal", message}` e loga. Um `withErrors(handler)` que envolve o handler inteiro, incluindo o que hoje fica fora do try. Padronizar códigos por caso: `not_found` com `resource`, ou sempre `<recurso>_not_found`. Renomear tree-http.ts (ver STD-NAME-01).
- **Verificação:** toErrorResponse termina em `throw error` (tree-http.ts:101). 'Publicação não existe' sai como not_found em tree/route.ts:27 e nodes/route.ts:24, e como publication_not_found em questions/route.ts:32 e from-recognition:36. validation/route.ts:38 usa question_not_found, e tree/route.ts:24 consulta o banco sem try. Um detalhe do cenário está errado: ValidationPane.tsx:62 tem catch em volta de response.json(), então a tela mostra uma mensagem enganosa ('Não deu para falar com o servidor'), e não 'Unexpected token'.

#### STE-07

**Texto de tela usa termos que o glossário manda evitar: 'Publicações', 'publicação', 'workspace', 'Diagnóstico' sem qualificar, e 'ingestão' para a captura** — média · confirmado · `hard-violation` · tarefa **I10**

- **Local:** `apps/web/app/rail.ts:57` · também: `apps/web/app/publicacoes/publications-screen.tsx:57`, `apps/web/app/publications/[id]/editor/trash-dialog.tsx:96`, `apps/web/app/api/publications/[id]/nodes/route.ts:24`, `apps/web/app/avaliacoes/page.tsx:27`, `apps/web/app/api/workspaces/export/route.ts:36`, `apps/web/app/rail.ts:63`, `apps/web/app/publications/[id]/ingestao/page.tsx:15`
- **Regra ou spec:** CONTEXT.md, verbetes Livro, Estante, Biblioteca, Captura e Diagnóstico do app (linhas _Avoid_)
- **Cenário:** O vocabulário que o glossário fixou para a pessoa (livro, biblioteca, captura) convive com o que ele proíbe, às vezes na mesma tela: book-overview-screen mostra 'Livro criado agora' e 'Publicação · <biblioteca>'. O mesmo conceito ganha dois nomes, e a próxima tela copia o errado.
- **Correção sugerida:** Renomear textos: 'Livros' no rail e nos breadcrumbs, 'Livro não encontrado.', 'Nenhuma biblioteca ainda.', 'Diagnóstico do app'. Renomear rota e componente `ingestao/IngestionScreen` para `captura/CaptureScreen`, com redirect. Considerar um teste de guarda que procure termos _Avoid_ em strings de app/.
- **Verificação:** rail.ts:57 'Publicações', rail.ts:63 'Diagnóstico', os breadcrumbs em publications-screen.tsx:47/57 e nas telas de scan e ingestão, e avaliacoes/page.tsx:27 'Nenhum workspace ainda.' batem com os _Avoid_ de CONTEXT.md:12, :21, :25 e :363 (Diagnóstico do app: 'diagnóstico (sem qualificar)'). O glossário foi revisado depois das telas, mas é a regra vigente, e nenhum ADR isenta esses textos.

#### STE-08

**Possível Shotgun Surgery: o LocalFileStorageProvider concreto é instanciado em 12 lugares, o que desmente 'trocar para bucket é só variável'** — média · confirmado · `judgement-call` · tarefa **I3**

- **Local:** `apps/web/app/api/assets/route.ts:56` · também: `apps/web/app/api/assets/crop/route.ts:72`, `apps/web/app/api/assets/[assetId]/content/route.ts:40`, `apps/web/app/api/render-jobs/[jobId]/artifacts/[name]/route.ts:36`, `apps/web/app/api/libraries/[libraryId]/route.ts:70`, `apps/web/app/api/publications/[id]/route.ts:54`, `apps/web/app/api/publications/[id]/nodes/[nodeId]/render/route.ts:63`, `apps/web/app/api/publications/[id]/questions/[questionId]/render/route.ts:96`, `apps/web/app/api/workspaces/import/route.ts:72`, `apps/web/app/api/workspaces/export/route.ts:31`, `apps/web/src/modules/scan/infrastructure/scan-deps.ts:26`, `apps/web/src/modules/publications/infrastructure/prisma-catalog-import.ts`
- **Regra ou spec:** env.ts:6-8 (troca de infra por variável); planejamento §4.7 tabela Storage (Local / VercelBlob)
- **Cenário:** Na fase de cloud (6.5), trocar o storage exige editar 12 arquivos em quatro módulos, e basta esquecer um para ter uma rota gravando no disco local do Vercel, que é efêmero. Isso é perda silenciosa de assets do acervo.
- **Correção sugerida:** Uma função de composição `storageProvider(): StorageProvider` em src/infrastructure/storage (escolhe a implementação por env), e o mesmo para `renderExecutor(): RenderExecutor | null`. As rotas passam a depender da porta, e não da classe concreta. Não é DI framework nem service locator: é uma fábrica com dois usos reais previstos.
- **Verificação:** Há exatamente 12 `new LocalFileStorageProvider` fora de testes (10 rotas, scan-deps.ts e prisma-catalog-import.ts) e 4 `new RenderWorkerExecutor`. Isso contradiz a promessa de env.ts:6-8, 'troca de variáveis em vez de troca de código', diante do VercelBlobStorageProvider previsto em _planejamento.md:597/1309.

#### STE-09

**Possível Duplicated Code: a rota de render do nó copia a de render da questão, e a guarda de configuração do worker se repete em 4 rotas** — baixa · confirmado · `judgement-call` · tarefa **F2**

- **Local:** `apps/web/app/api/publications/[id]/nodes/[nodeId]/render/route.ts:37` · também: `apps/web/app/api/publications/[id]/questions/[questionId]/render/route.ts:51`, `apps/web/app/api/agents/candidate-render/route.ts:29`, `apps/web/app/api/agents/ask/route.ts:186`
- **Regra ou spec:** baseline Fowler: Duplicated Code
- **Cenário:** Um campo novo no artefato, ou uma mudança no cancelamento, precisa ser feito em dois lugares, e as mensagens já divergem ('Suba o worker com docker compose ...' contra 'O worker de render não está configurado'). O render do nó também não passa pela guarda de escopo da questão, e a divergência entre as duas rotas tende a crescer.
- **Correção sugerida:** Extrair um use case `renderDocument({ source, profileId, signal })` que monta o bundle, cancela no abort e devolve o DTO, junto com um `requireRenderer(env)` compartilhado. As duas rotas passam a só resolver a fonte (questão ou corpo do nó).
- **Verificação:** nodes/[nodeId]/render/route.ts:41,55,83,91,115 e questions/[questionId]/render/route.ts:57,72,113,126,158 repetem a guarda renderer_not_configured, profileById, o abort→cancel, RENDERER_VERSION e o RendererUnavailableError→503. candidate-render/route.ts:32-33 tem uma terceira mensagem, e ask/route.ts:186 tem candidateExecutor próprio.

#### STE-10

**Possível Duplicated Code: o bloco resolveQuestionScope → 404 está colado 8 vezes, com um código de erro divergente** — baixa · confirmado · `judgement-call` · tarefa **I4**

- **Local:** `apps/web/app/api/publications/[id]/questions/[questionId]/options/route.ts:32` · também: `apps/web/app/api/publications/[id]/questions/[questionId]/options/[optionId]/route.ts:32`, `apps/web/app/api/publications/[id]/questions/[questionId]/route.ts:83`, `apps/web/app/api/publications/[id]/questions/[questionId]/render/route.ts:38`, `apps/web/app/api/publications/[id]/questions/[questionId]/validation/route.ts:35`
- **Regra ou spec:** baseline Fowler: Duplicated Code
- **Cenário:** A decisão de segurança '404 e não 403' vive em 8 cópias. Uma rota nova sob /questions/[questionId] pode esquecer a guarda, e as rotas /api/questions/[questionId]/* (tags, anchors, origin, revisions) de fato não a têm.
- **Correção sugerida:** Um helper `requireQuestionScope(id, questionId)` que lança `QuestionOutOfScopeError`, mapeado uma vez no tradutor de erros (STD-ERR-01).
- **Verificação:** resolveQuestionScope aparece 8 vezes, seguido do mesmo bloco 404 (route.ts:83,129; options:32,59; options/[optionId]:32,86; render:38), e validation/route.ts:35-38 diverge com question_not_found e outra mensagem. A menção às rotas /api/questions/[questionId]/* é um exagero: elas não têm publicação na URL, então essa guarda não se aplica a elas.

#### STE-11

**Possível Duplicated Code: a regra 'restaurável' do restoreNode foi recopiada como if de negócio na rota da lixeira** — baixa · confirmado · `judgement-call` · tarefa **I2**

- **Local:** `apps/web/app/api/publications/[id]/trash/route.ts:35` · também: `apps/web/src/modules/document-tree/application/mutate-tree.ts:140`
- **Regra ou spec:** planejamento §4.4 (regra no domínio, rota traduz HTTP); baseline Fowler: Duplicated Code
- **Cenário:** Se a regra de restauração mudar (restaurar com o ancestral, por exemplo), o botão da lixeira passa a mentir: fica habilitado e o POST recusa, ou o contrário.
- **Correção sugerida:** Expor no domínio de document-tree um `isRestorable(node, deletedIds)` usado pelo restoreNode e por um use case `listTrash(publicationId)` que a rota chama.
- **Verificação:** publications/[id]/trash/route.ts:35 recalcula `restorable` a partir de listDeleted chamado direto no repositório. É a mesma regra de mutate-tree.ts:140 (DeletedAncestorError), e o comentário da rota admite a cópia, contra tree/route.ts:8-12 ('não é lugar de if de negócio').

#### STE-12

**AI_VISION_MODEL, RENDERER_VERSION e BACKUP_DESTINATION são lidos crus de process.env, fora do AppEnv validado** — baixa · confirmado · `judgement-call` · tarefa **I3**

- **Local:** `apps/web/app/api/recognition/route.ts:35` · também: `apps/web/app/publications/[id]/scan/page.tsx:75`, `apps/web/app/publications/[id]/scan/[runId]/page.tsx:59`, `apps/web/src/modules/scan/infrastructure/scan-passes.ts:30`, `apps/web/app/api/publications/[id]/questions/[questionId]/render/route.ts:126`, `apps/web/app/api/publications/[id]/nodes/[nodeId]/render/route.ts:91`, `apps/web/src/modules/diagnostics/application/collect-diagnostics.ts:225`
- **Regra ou spec:** apps/web/src/shared/config/env.ts:4-8 (ambiente lido e validado uma vez)
- **Cenário:** `AI_VISION_MODEL="  "` passa como configurado aqui (o `.trim()` de env.ts não roda), enquanto AI_MODEL com espaços vira null lá. O critério 'visão disponível' está em 4 cópias, e um ajuste (exigir também a chave, por exemplo) precisa acertar as quatro.
- **Correção sugerida:** Acrescentar `aiVisionModel`, `rendererVersion` e `backupDestination` ao AppEnv, com um derivado `visionConfigured`, e trocar as leituras cruas.
- **Verificação:** AI_VISION_MODEL é lido cru em recognition/route.ts:35, scan-passes.ts:30, scan/page.tsx:75 e scan/[runId]/page.tsx:59. RENDERER_VERSION é lido cru nas duas rotas de render, e BACKUP_DESTINATION em collect-diagnostics.ts:225. Nenhum passa pelo `.trim()` de env.ts:62, ao contrário de AI_MODEL (env.ts:107).

#### STE-13

**Classes CSS de app/ reimplementam e colidem com o design system (.lbb-dot, .lbb-banner-*, .lbb-pill, .lbb-search sem foco visível)** — baixa · confirmado · `judgement-call` · tarefa **I10**

- **Local:** `apps/web/app/acervo-styles.ts:39` · também: `apps/web/src/design-system/display/StatusDot.tsx:6`, `apps/web/src/design-system/feedback/Banner.tsx:9`, `apps/web/app/bibliotecas/[slug]/library-screen.tsx:187`, `apps/web/app/home-screen.tsx:388`
- **Regra ou spec:** checklist §14 DoD (Acessibilidade básica); pergunta de controle do README (não duplicar o que o DS já tem)
- **Cenário:** As duas folhas são injetadas globalmente. No dia em que uma tela de acervo usar `<StatusDot label=...>`, o rótulo vira um ponto de 3×3px com opacidade 0.6, porque as regras se somam. No filtro da estante, quem navega por teclado não vê onde está o foco, o que contraria o 'Acessibilidade básica' do DoD.
- **Correção sugerida:** Usar Badge e Input do DS (acrescentar um slot de ícone ao Input, se preciso). Renomear as classes locais com prefixo de tela (`lbb-acervo-dot`) ou removê-las. Dar à `.lbb-search` um `:focus-within` com `--focus-ring` enquanto ela existir.
- **Verificação:** acervo-styles.ts:39 define `.lbb-dot` como ponto de 3px, e StatusDot.tsx:6 usa o mesmo nome, que injectCss torna global. A colisão ainda é latente, porque StatusDot não é usado em app/. acervo-styles.ts:24-25 repete .lbb-banner-body e -title do Banner.tsx:9-10. `.lbb-search input{outline:none}` (acervo-styles.ts:76) não tem focus-within nem focus-visible e é usado em library-screen.tsx:187, então o foco do teclado fica de fato invisível.

#### STE-14

**/avaliacoes monta a tela com <main>, <h1> e <p> crus e estilo inline, fora do DS (PageHeader, EmptyState), o que contraria o DoD declarado** — baixa · confirmado · `hard-violation` · tarefa **E1**

- **Local:** `apps/web/app/avaliacoes/page.tsx:36`
- **Regra ou spec:** docs/_atual/_checklist.md §14 DoD 'Empty state tratado (EmptyState no DS ...)'
- **Cenário:** A única tela de Produção sem cabeçalho, breadcrumb e estado vazio do DS fica visualmente fora do produto, e a marcação ✅ do DoD deixa de ser verdade.
- **Correção sugerida:** Reescrever com PageHeader e EmptyState (com ação 'Nova avaliação'), junto com a correção de BUG-AVAL-01.
- **Verificação:** avaliacoes/page.tsx:26-41 usa <main>, <h1> e <p> crus com estilo inline, sem PageHeader nem EmptyState, embora o checklist §14 marque ✅ 'Empty state tratado (EmptyState no DS)'.

#### STE-15

**PATCH de alternativa chama writer.updateText direto: não dá 404, não tem teto de tamanho e aplica três operações sem atomicidade** — baixa · confirmado · `judgement-call` · tarefa **D4**

- **Local:** `apps/web/app/api/publications/[id]/questions/[questionId]/options/[optionId]/route.ts:67` · também: `apps/web/src/modules/questions/infrastructure/prisma-option-writer.ts:82`
- **Regra ou spec:** README.md §Convenções (Route Handler → Use Case); baseline Fowler: Middle Man invertido (a rota fala com o adaptador)
- **Cenário:** Um PATCH com `statementLatex` para um optionId inexistente (alternativa apagada em outra aba) responde 200 `{ok:true}` e o texto some, enquanto o DELETE da mesma alternativa responde 404. Um PATCH com `targetIndex` válido e `statementLatex` numérico move a alternativa e depois devolve 400: meia escrita.
- **Correção sugerida:** Criar `editOptionText` em mutate-options (lançando OptionNotFoundError, aplicando o limite e revalidando: ver STD-VALID-01), validar o corpo inteiro antes da primeira escrita e agrupar as operações numa transação do writer.
- **Verificação:** options/[optionId]/route.ts:67 chama writer.updateText, que usa updateMany (prisma-option-writer.ts:82) e não falha quando o id não casa, então responde 200. O texto não tem teto, e moveOption (l.53) roda antes da checagem de tipo de statementLatex (l.64-66) e sem transação, o que deixa uma meia escrita quando a requisição termina em 400.

#### STE-16

**scanRunDto espalha o ScanRun inteiro para o browser, e as páginas importam DTO da pasta app/api** — baixa · plausível · `judgement-call` · tarefa **I8**

- **Local:** `apps/web/app/api/scans/scan-dto.ts:6` · também: `apps/web/app/publications/[id]/scan/page.tsx:12`
- **Regra ou spec:** planejamento §4.4 'objetos Prisma não são o contrato público até o React — criar DTOs'; D26 (comentário em assets/route.ts:76)
- **Cenário:** Um GET de polling (`?items=0`, a cada batida) manda o retrato do perfil a cada chamada, e o próximo campo interno acrescentado a ScanRun chega ao cliente sem ninguém decidir. Página depender de arquivo de rota acopla duas camadas de entrega.
- **Correção sugerida:** Projetar campo a campo o que a tela lê e mover o DTO para scan/application (ou para um src/modules/scan/ui/dto.ts) compartilhado por rota e página.
- **Verificação:** scan-dto.ts:6 espalha `...run`, e ScanRun (scan-store.ts:12-42) inclui profileSnapshot, settings e runKey. As páginas scan/page.tsx:12 e scan/[runId]/page.tsx:13 importam de app/api. Porém ScanRun é um tipo de aplicação, não um objeto Prisma, e num app de um usuário não vaza segredo, então fica como julgamento de design.

#### STE-17

**Identificadores e nomes de script em português, contra a regra de idioma do README** — baixa · confirmado · `hard-violation` · tarefa **I10**

- **Local:** `apps/web/scripts/religar-acervo-legado.ts:24` · também: `apps/web/app/api/publications/[id]/trash/route.ts:27`, `apps/web/app/api/publications/[id]/route.ts:52`, `apps/web/app/api/workspaces/import/route.ts:59`, `apps/web/app/publications/[id]/ingestao/page.tsx:30`, `apps/web/scripts/delete-orphan-questions.ts:67`, `scripts/fechar-issues-mescladas.sh`
- **Regra ou spec:** README.md §Convenções 'Idioma. Documentação em pt-BR; código, identificadores e mensagens de commit em inglês.'
- **Cenário:** O código mistura dois idiomas no mesmo escopo (`escopo.workspaceId`, `const scope = ...` em validation/route.ts:35), e grep por conceito precisa das duas grafias.
- **Correção sugerida:** Renomear para inglês (scope, trashedIds, deleted, conflicts, withoutAssets, oldRoot/newRoot, relink-legacy-library.ts) numa passada mecânica; se quiser impedir recaídas, acrescentar ao lint uma lista curta de radicais proibidos.
- **Verificação:** README.md:95 exige identificadores em inglês. religar-acervo-legado.ts:24 usa raizAntiga/RAIZ_ANTIGA, e há exports de domínio em português: localidadeDaIa (ai-locality.ts:20), fraseDaLocalidade (:44) e deduplicarColisoes (import-conflicts.ts:37). Somam-se `escopo` em 7 rotas e scripts/fechar-issues-mescladas.sh.

#### STE-18

**O fluxo documentado não cobre Server Components, e na prática todas as páginas leem a infraestrutura direto** — baixa · confirmado · `doc-drift` · tarefa **I1**

- **Local:** `docs/_atual/_planejamento.md:1216` · também: `README.md:75`, `apps/web/app/publications/[id]/scan/page.tsx:40`, `apps/web/app/avaliacoes/[id]/page.tsx:23`, `apps/web/app/api/publications/[id]/scans/route.ts:23`
- **Regra ou spec:** README.md §Convenções 'Fluxo obrigatório. Nada pula etapas'
- **Cenário:** Sem regra escrita, cada tela nova escolhe: umas passam por use case, outras por read model de infra, outras pelo repositório de escrita. Revisores não têm critério para dizer se uma página pulou etapa, e a regra 'nada pula etapas' do README fica letra morta.
- **Correção sugerida:** Documentar no README e no §4.4 a divisão já praticada: leitura em Server Component pode chamar um read model de infra (`read*`/`list*` server-only, sem regra de negócio); escrita sempre por Route Handler → use case. Depois, conferir as exceções (scan/page.tsx usando store e sources).
- **Verificação:** Das 17 page.tsx, todas importam /infrastructure/, e 11 não importam nada de /application/. scan/page.tsx:39-41 usa store.listRuns e sources.rememberedProfile direto. O §4.4 (_planejamento.md:1216) só descreve UI (Client) → Route Handler, e nenhum doc registra a exceção para Server Components.

#### STE-19

**Estrutura de pastas do planejamento §4.6 desatualizada; src/infrastructure guarda pastas vazias de adaptadores que vivem em modules/** — baixa · confirmado · `doc-drift` · tarefa **I1**

- **Local:** `docs/_atual/_planejamento.md:1268` · também: `apps/web/src/infrastructure/rendering/worker/.gitkeep`, `apps/web/src/infrastructure/ai/openai-compatible/.gitkeep`, `apps/web/src/infrastructure/storage/vercel-blob/.gitkeep`, `apps/web/src/infrastructure/database/postgres/.gitkeep`
- **Regra ou spec:** planejamento §4.6 Estrutura; baseline Fowler: Speculative Generality
- **Cenário:** Quem segue o §4.6 para achar ou criar um adaptador procura no lugar errado ou cria um segundo (rendering/worker contra modules/rendering/infrastructure). As pastas vazias antecipam necessidades que não existem, o que é Speculative Generality.
- **Correção sugerida:** Atualizar o §4.6 com a convenção real (adaptador no `infrastructure/` do módulo dono; `src/infrastructure` só para o transversal: cliente do banco, storage local, porta do agente) e remover as pastas com só .gitkeep.
- **Verificação:** O §4.6 lista rendering/worker/RenderWorkerExecutor.ts e ai/openai-compatible, mas src/infrastructure/rendering/worker e ai/openai-compatible só têm .gitkeep, e os adaptadores vivem em modules/rendering/infrastructure/render-worker-executor.ts e modules/agents/infrastructure/openai-compatible-provider.ts. design-system/.gitkeep e shared/.gitkeep continuam em pastas povoadas. postgres/ e vercel-blob/ são placeholders de futuro defensáveis.

#### STE-20

**Possível Mysterious Name: tree-http.ts é o módulo HTTP de todo o app, mas tem nome e dependências da árvore** — baixa · confirmado · `judgement-call` · tarefa **I4**

- **Local:** `apps/web/app/api/tree-http.ts:8`
- **Regra ou spec:** baseline Fowler: Mysterious Name / Divergent Change; Next 16 docs route.md 'Route Context Helper'
- **Cenário:** Toda rota de qualquer módulo depende transitivamente dos erros do document-tree. Quem procura 'o helper HTTP' não o acha pelo nome. Renomear um segmento dinâmico ([id] para [publicationId]) não é pego pelo tsc, porque o tipo de params é escrito à mão.
- **Correção sugerida:** Renomear para app/api/http.ts (readJson, BadRequestError, toHttpError), deixar parsePlacement e parseNodeKind num tree-parsers.ts e registrar os erros de árvore na tabela única de STD-ERR-01. Adotar `RouteContext<'...'>` e `PageProps<'...'>` gerados.
- **Verificação:** O cabeçalho de tree-http.ts:8 diz 'para as rotas da árvore', e o arquivo importa erros de document-tree, mas 56 das 67 route.ts o importam diretamente (não 59). typedRoutes: true está ligado em next.config, com next ^16.3, cuja doc local route.md traz RouteContext, e mesmo assim os params são tipados à mão.

## Spec

### Spec · Wave G — Fases 18 a 25

**Resumo do revisor.** A Wave G está quase toda entregue, e o checklist é honesto na maior parte dos itens ◐ e [ ]. Mas vários itens marcados ✅ não se sustentam na aprovação, que é onde a proposta vira acervo. Os três casos mais graves são estes. (1) A questão de múltipla escolha perde as alternativas quando o LaTeX vem do reconhecimento ou da revisão. Provei rodando o plano: no ENEM e no exam-v1 ela nasce MULTIPLE_CHOICE com 5 alternativas vazias; no Fundamentos é rebaixada a discursiva. (2) A figura que está dentro de uma questão ou de um exercício vai para o `bodyLatex` do nó QUESTION, que não tem corpo, e nunca chega ao enunciado. (3) O `.lbb` v2 não leva os arquivos de figura. Também achei o reaproveitamento de nó por "rótulo OU título" contra o "rótulo e título" da D53, a remoção de importação que confunde aprovação parcial com edição à mão, o corpo e o exemplo que nunca ficam "a revisar", e o duplicar subárvore que perde o corpo. A D43 foi invertida no código sem registro.

<details><summary>Cobertura declarada</summary>

Li por inteiro: o checklist da Wave G (linhas 1604–1995), o planejamento §3.7 (D39–D58) e §8 Wave G, os ADRs 0001–0009, os verbetes de scan do CONTEXT.md e source-scanning-validation.md. No código, li por inteiro: scan/domain/approval-plan.ts, approval-latex.ts, scan-item.ts, scan-run.ts, inherit-review.ts e import-removal.ts; scan/application/approve-scan.ts, start-scan.ts, switch-profile.ts, remove-import.ts, semantic-review.ts, math-recognition.ts, figure-pass.ts, suggest-profile.ts, review-scan.ts (a partir da linha 60) e run-scan.ts (150–306); scan/infrastructure/prisma-scan-approval.ts e prisma-scan-import.ts; assets/infrastructure/prisma-node-anchors.ts (até a linha 80); questions/domain/to-review.ts; document-tree/domain/node-body.ts e node-kind.ts; portability (schema, migrations e os campos de nó/âncora do prisma-workspace-source); as rotas approve e import. Só amostrei: structure.ts (40–245, 595–618), os perfis (canContain, zones, defaultQuestionType), workspace-view.ts, pdf-figure-cropper.ts (por grep), o duplicar subárvore do prisma-document-tree-repository.ts, question-editor.tsx/editor-columns.ts (layout do Ver fonte), catalog-attach e attach-from-catalog, e os testes por grep. Não li: ScanWorkspace.tsx, ScanPropertiesPanel.tsx e SourcePdfViewerInner.tsx por inteiro, page.ts/layout.ts/furniture.ts/figures.ts/toc.ts, o corpo dos perfis book-v1/book-fme-v1/exam-enem-v1, recognition/**, o render do corpo do nó e os E2E. Rodei três testes descartáveis em /tmp/claude-1000/specrev (planApproval direto) para provar o que as linhas 1, 2 e 4 afirmam.

</details>

#### SPG-01

**Múltipla escolha perde as alternativas quando o LaTeX vem do reconhecimento ou da revisão** — alta · confirmado · `spec-wrong` · tarefa **B1** · **feita** (`4c7a567`)

- **Local:** `apps/web/src/modules/scan/domain/approval-latex.ts:183` · também: `apps/web/src/modules/scan/domain/approval-plan.ts:269`, `apps/web/src/modules/scan/infrastructure/prisma-scan-approval.ts:165`, `apps/web/src/modules/scan/domain/profiles/exam-v1.ts:98`
- **Regra ou spec:** docs/_atual/_checklist.md:1947 "✅ Os filhos `ITEM` de uma questão de múltipla escolha **são** as alternativas"; :1952 "✅ A resolução sai também do texto **reconhecido** ... neste livro quase todo enunciado passa pela visão"; :1965 "Múltipla escolha tem quatro ou cinco alternativas ... Só o tipo que veio da zona é rebaixado: ... a questão dele com alternativas em imagem não pode perder o tipo"
- **Cenário:** Um caderno do ENEM ou uma prova do ENA (exam-v1 marca `needsMath: true` em toda questão) varrido com AI_VISION_MODEL configurado e recognizeMath=auto: toda questão reconhecida vira MULTIPLE_CHOICE com 5 alternativas vazias, e as alternativas reais ficam coladas no enunciado. No Fundamentos (2028 itens precisam de matemática, segundo o relatório), as 361 questões de vestibular são rebaixadas a DISCURSIVE. A aprovação de ensaio mostrou 250 de múltipla escolha só porque rodou sem modelo. Corrigir o LaTeX de uma questão na tela de revisão também apaga as alternativas.
- **Correção sugerida:** No ramo `ready`, continuar extraindo as alternativas: dos filhos ITEM (texto, ou reviewedText/reviewedLatex do filho) quando existirem, ou das linhas do próprio `ready` com o ALTERNATIVE/INLINE_ALTERNATIVE, cortando-as do enunciado. Não rebaixar nem gravar MC sem alternativas por falta de texto quando o LaTeX veio de máquina. Pôr um teste em scan-approval.test.ts para MC com mathResult e com reviewedLatex.
- **Verificação:** Em approval-latex.ts:183-191, quando existe reviewedLatex ou mathResult.latex (approval-latex.ts:44-45), a função retorna `options: []` e não olha os filhos ITEM. Com isso, approval-plan.ts:270 rebaixa para DISCURSIVE o tipo que veio da zona, e o tipo padrão do perfil vira MC com alternativas vazias, criadas por planQuestion em prisma-scan-approval.ts:165-183. A passada de matemática reconhece QUESTION e EXERCISE (math-recognition.ts:23), exam-v1.ts:98 marca needsMath:true, e scan-approval.test.ts:188-191 só testa o caso com wantsOptions=false.

#### SPG-02

**Figura dentro de questão ou exercício vai para o corpo do nó QUESTION, e não para o enunciado** — alta · confirmado · `spec-wrong` · tarefa **B2**

- **Local:** `apps/web/src/modules/scan/domain/approval-plan.ts:290` · também: `apps/web/src/modules/scan/infrastructure/prisma-scan-approval.ts:219`, `apps/web/src/modules/document-tree/domain/node-body.ts:10`
- **Regra ou spec:** docs/_atual/_planejamento.md:1153 (D58) "Vale para todos os perfis: no `book-v1` a figura vai ao corpo, nos perfis de prova vai ao enunciado"; docs/_atual/_checklist.md:1875 "Destino por perfil: ... no `exam-enem-v1` ... o gráfico da questão do ENEM agora vira figura"
- **Cenário:** Aprovar um caderno do ENEM: o gráfico da questão é gravado no `DocumentNode.bodyLatex` do nó QUESTION. O editor de corpo não aparece para QUESTION, o render da questão só usa statementLatex, e a questão compila sem a figura. O mesmo vale para as figuras de exercício do Elon e do FME (470 figuras no FME). O texto fica escondido num campo que nenhuma tela mostra.
- **Correção sugerida:** No plano, quando o container resolvido for uma questão (criada ou já no acervo), emitir um passo que acrescente o `figureLatex` ao `statementLatex` da questão, na posição, e ligue o asset à questão (QuestionAsset ou âncora ILLUSTRATION), em vez de `appendBody`. Nunca escrever corpo em nó cujo kind não passa em `canHaveBody`. Pôr um teste com o exam-enem-v1.
- **Verificação:** BODY_KINDS inclui FIGURE (approval-plan.ts:125). O passo appendBody usa como alvo o container (approval-plan.ts:290-306), e esse container é o nó QUESTION quando a figura é filha da questão, o que exam-enem-v1.ts:58 e book-v1.ts:78-79 permitem. prisma-scan-approval.ts:245-248 grava bodyLatex no nó sem consultar canHaveBody, e node-body.ts:10-21 não inclui QUESTION entre os tipos com corpo. Isso contraria a D58 (_planejamento.md:1152-1153: 'nos perfis de prova vai ao enunciado').

#### SPG-03

**O .lbb v2 não leva os arquivos de figura nem o cropAssetId da âncora** — alta · confirmado · `spec-partial` · tarefa **G1**

- **Local:** `apps/web/src/modules/portability/infrastructure/prisma-workspace-source.ts:201` · também: `apps/web/src/modules/portability/domain/portable-schema.ts:134`, `apps/web/src/modules/portability/infrastructure/prisma-workspace-sink.ts:258`
- **Regra ou spec:** docs/_atual/_checklist.md:1783 "✅ Portable Schema **v2**, com o corpo, as âncoras do nó e o PDF fonte" e :1791 "✅ O round-trip de um `.lbb` v2 com corpo de nó dá identidade"; ADR 0005: a figura "vira **asset** e entra no LaTeX"
- **Cenário:** Exportar a biblioteca com o FME aprovado (centenas de `figure[H]` nos corpos) e importar noutra instalação, ou restaurar o backup: o corpo volta com os `\includegraphics`, mas nenhum arquivo de figura vem junto. O render do capítulo falha com `File not found`, e as âncoras de ilustração perdem o recorte. O round-trip que o checklist dá como 'identidade' deixa de ser identidade assim que existe figura.
- **Correção sugerida:** Acrescentar ao PortableAnchor um `cropAsset?: string` (o sha256) e incluir no zip os assets CROP citados pelo `bodyLatex` de cada nó, com `citedAssets` aplicado aos assets da publicação. No sink, recriar o asset e o `cropAssetId`. Como é aditivo e opcional, não muda a versão. Pôr no teste de round-trip um nó com figura.
- **Verificação:** prisma-workspace-source.ts:146-230 só põe em `wanted` o PDF fonte, o sourceAsset das âncoras e os assets da questão. Os assets CROP da publicação, gravados por figure-pass.ts:112-117 e resolvidos por publicationId em prisma-question-assets.ts:47-52, ficam de fora. PortableAnchor (portable-schema.ts:134-142) não tem campo de recorte, e não há `cropAsset` em lugar nenhum do módulo portability, então o corpo exportado cita \includegraphics sem o arquivo.

#### SPG-04

**Nó reaproveitado por rótulo OU título, e a D53 pede rótulo E título** — média · confirmado · `spec-wrong` · tarefa **B3** · **feita** (`b1673ae`)

- **Local:** `apps/web/src/modules/scan/domain/approval-plan.ts:193`
- **Regra ou spec:** docs/_atual/_planejamento.md:1091 (D53) "reaproveita o capítulo que já existe com mesmo rótulo e título"
- **Cenário:** Aprovação parcial em duas sessões, ou destino com capítulos que já existiam (o Curso de Análise já tinha 2 nós): todos os blocos EXERCISE_GROUP "Exercícios" de um capítulo se fundem no primeiro, e um capítulo de mesmo número e título diferente (outro volume no mesmo destino) recebe as seções do outro. A árvore aprovada fica estruturalmente errada, e isso é caro de desfazer.
- **Correção sugerida:** Seguir a D53: exigir rótulo E título quando o item tem os dois (título comparado por `foldText`), e aceitar só o título quando o item não tem número. Para EXERCISE_GROUP sem número, não reaproveitar por título. Usar sobreposição de âncora (DUPLICATE_OVERLAP) como desempate. Pôr um teste com dois blocos no mesmo capítulo existente.
- **Verificação:** approval-plan.ts:193-199 reaproveita o nó quando bate o rótulo OU o título. A D53 (_planejamento.md:1091-1092) pede 'mesmo rótulo e título'. Na mesma aprovação isso não morde, porque existingNodes só traz nós que já estão no acervo. Numa aprovação parcial em outra sessão, porém, um segundo 'Exercícios' sem número casa com o primeiro só pelo título, e nenhum teste cobre esse caso (scan-approval.test.ts:285 só confere reusedNodes>0).

#### SPG-05

**Aprovação parcial em outra sessão faz a remoção da importação tratar escrita da máquina como edição à mão** — média · confirmado · `spec-wrong` · tarefa **B5**

- **Local:** `apps/web/src/modules/scan/infrastructure/prisma-scan-import.ts:75` · também: `apps/web/src/modules/scan/infrastructure/prisma-scan-import.ts:304`, `apps/web/src/modules/scan/infrastructure/prisma-scan-approval.ts:247`
- **Regra ou spec:** docs/_atual/_checklist.md:1849 "✅ O editado à mão depois da aprovação é preservado"; docs/_atual/_planejamento.md:1095 (D53) "Aprovação parcial pode"; ADR 0006: "O que foi editado à mão depois da aprovação é preservado"
- **Cenário:** Aprovar hoje capítulos e questões aceitos e amanhã o resto (teoria, figuras de exercício). Toda seção que recebeu corpo, e toda questão que recebeu figura, passa a ser 'editado depois de aprovado', e os pais ficam como 'contém trabalho preservado'. Apagar a importação deixa meio livro de pé, com motivo falso. O aceite da Fase 23 ('devolve o livro ao estado de antes, sem resíduo') falha no fluxo normal de aprovação parcial.
- **Correção sugerida:** Registrar o instante de cada escrita da aprovação por nó (por exemplo `ScanItem.approvedAt` dos itens materializados no nó, ou uma coluna `lastScanWriteAt`) e medir a edição a partir da última escrita da execução, não da criação. Outra saída é descartar o sinal por `updatedAt` quando existir revisão SYSTEM 'corpo recebido do scan' posterior. Pôr um teste com duas aprovações separadas por mais de 5 minutos.
- **Verificação:** approvedAt vem de node.createdAt, e o arquivo tem 94 linhas, então a linha 304 citada está errada: o trecho fica na linha 75. import-removal.ts:66-73 conta como 'editado depois de aprovado' todo updatedAt posterior a criação+5min. Uma aprovação seguinte da mesma execução faz documentNode.update do bodyLatex (prisma-scan-approval.ts:245-248) e atualiza sourceAnchorId (prisma-node-anchors.ts:59-69). As duas escritas sobem o @updatedAt (schema.prisma, DocumentNode), e a revisão que acompanha é SYSTEM, que não é BY_HAND.

#### SPG-06

**Exemplo e teoria que vieram do scan nunca ficam 'a revisar'** — média · confirmado · `spec-partial` · tarefa **B8**

- **Local:** `apps/web/src/modules/document-tree/application/get-publication-tree.ts:206` · também: `apps/web/src/modules/questions/domain/to-review.ts:13`, `apps/web/src/modules/scan/domain/approval-plan.ts:220`
- **Regra ou spec:** docs/_atual/_planejamento.md:1819 (Fase 19) "o perfil de captura passa a saber onde a teoria acaba ... mandando o que vem antes para o corpo do nó, também a revisar"; docs/adr/0004-o-exemplo-vira-no.md:24 "O que falta ... é o exemplo existir como coisa para a árvore, para a busca e para o *a revisar*"
- **Cenário:** Aprovar o Curso de Análise: os 107 exemplos e os 162 trechos de teoria entram com o LaTeX que o modelo de visão devolveu. O relatório registra 677 itens que precisam de reconhecimento, e a própria validação registra `+` lido como `±`. O filtro 'a revisar' não mostra nenhum deles. O ADR 0004 justifica o nó EXAMPLE justamente para o exemplo ter 'estado', e o autor não tem como saber quais corpos ainda não leu.
- **Correção sugerida:** Derivar 'a revisar' também para o nó com corpo, sem coluna nova (D40): nó com âncora de máquina (`scan:`/`recognition:`) e sem revisão de origem USER/AGENT depois da aprovação. Dar ao nó o gesto 'Conferir', que grava uma revisão humana. Estender o filtro da árvore a esses nós.
- **Verificação:** get-publication-tree.ts:206-211 devolve toReview=false para todo nó sem questão, e isToReview (to-review.ts:13) só conhece questões. A Fase 19 (_planejamento.md:1818-1819) pede que o corpo vindo do scan fique 'também a revisar', e o ADR 0004:24 justifica o nó EXAMPLE pelo 'a revisar'. O checklist não documenta nenhuma exceção.

#### SPG-07

**O reconhecimento na varredura mantém o item 'sugerido', e o reprocessar o rebaixa** — média · confirmado · `spec-wrong` · tarefa **B6**

- **Local:** `apps/web/src/modules/scan/application/math-recognition.ts:87` · também: `apps/web/src/modules/scan/application/review-scan.ts:148`, `apps/web/src/modules/scan/domain/structure.ts:603`
- **Regra ou spec:** docs/_atual/_checklist.md:1819 (Fase 21) "a matriz e um `+` lido como `±` errados — por isso nada entra sem revisão"; CONTEXT.md verbete Reconhecimento: "Sempre passa por revisão humana; o resultado é candidato, não conteúdo"
- **Cenário:** No Curso de Análise, 890 itens são 'sugeridos' e 677 precisam de matemática. Com modelo de visão, 'Aprovar com sugeridos' (§37) leva para o acervo centenas de LaTeX de modelo que ninguém abriu na revisão. Somado ao SPEC-G-06, esse texto não fica marcado em lugar nenhum. O mesmo item, se reprocessado à mão, deixaria de ser sugerido: a mesma saída do modelo tem duas regras.
- **Correção sugerida:** Na passada de matemática da execução, aplicar a mesma regra do reprocessar: item com `mathResult` novo sai de AUTO_ACCEPTABLE para NEEDS_REVIEW, ou `mathResult.confidence` entra em `confidenceParts` antes de decidir o estado. Pôr um teste afirmando que nenhum item com mathResult fica AUTO_ACCEPTABLE.
- **Verificação:** Na execução, math-recognition.ts:87 salva `{...item, mathResult}` sem mexer em reviewState (run-scan.ts:264-275 repassa sem alterar), então o item AUTO_ACCEPTABLE continua sugerido. O reprocessar (review-scan.ts:147) e a passada semântica (semantic-review.ts:136) rebaixam para NEEDS_REVIEW. O `acceptable` de structure.ts:603-606 é decidido antes do reconhecimento e não leva em conta needsMath nem a confiança do modelo.

#### SPG-08

**Duplicar subárvore não copia o bodyLatex, e o exemplo duplicado sai vazio** — média · confirmado · `spec-partial` · tarefa **B8**

- **Local:** `apps/web/src/modules/document-tree/infrastructure/prisma-document-tree-repository.ts:262`
- **Regra ou spec:** docs/adr/0001-corpo-do-no.md:7 "Decidimos dar corpo ao nó estrutural, em LaTeX"; docs/adr/0004-o-exemplo-vira-no.md:36 "cada tela que os conhece precisa conhecer mais um"; docs/_atual/_checklist.md:1663 "✅ ... duplicar subárvore ... gravam a lista"
- **Cenário:** Duplicar um capítulo com teoria vinda do scan, ou um nó EXAMPLE: a cópia nasce com o corpo vazio. O exemplo, cujo conteúdo inteiro é o corpo (D56), vira um galho sem texto, e a seção perde a teoria em silêncio.
- **Correção sugerida:** Incluir `bodyLatex: true` no select e `bodyLatex: source.bodyLatex` no create. Pôr no teste de duplicar um nó com corpo.
- **Verificação:** duplicateSubtree (prisma-document-tree-repository.ts:176-280) não seleciona nem copia bodyLatex: a palavra não aparece no arquivo, e o create das linhas 262-277 só passa kind, title, sortKey, numberingStyle, originalLabel, sourceAnchorId, questão e âncoras. A cópia de um EXAMPLE ou de uma seção com teoria nasce sem corpo.

#### SPG-09

**'Ver fonte' virou terceira coluna, e a D43 recusa isso por medida** — média · confirmado · `spec-wrong` · tarefa **I1**

- **Local:** `apps/web/app/publications/[id]/editor/question-editor.tsx:862` · também: `apps/web/app/publications/[id]/editor/editor-columns.ts:10`
- **Regra ou spec:** docs/_atual/_planejamento.md:950–959 (D43) "'Ver fonte' **troca** o painel direito; não é aba nem terceira coluna ... Terceira coluna está fora por medida"; docs/_atual/_checklist.md:1748 "✅ Botão ao lado das abas, trocando o painel direito pelo PDF"
- **Cenário:** Em 1366×768, com LaTeX, preview e fonte abertos, o editor encolhe até EDITOR_HARD_MIN = 200 px. É exatamente o cenário que a D43 mediu (~240 px) para recusar a terceira coluna. Quem lê a D43 ou o checklist espera um comportamento, e o app entrega outro.
- **Correção sugerida:** Decidir com o autor. Se a terceira coluna fica, registrar uma D59 (ou uma revisão da D43) com a nova medida e corrigir a linha 1748 do checklist. Se não fica, voltar a trocar o preview pelo PDF quando a largura não couber.
- **Verificação:** question-editor.tsx:862-866 e editor-columns.ts:10 implementam a fonte como terceira coluna e citam a D43 como justificativa. A D43 (_planejamento.md:950-959) recusa exatamente a terceira coluna, e a D47 (:1043) reafirma que 'a D43 vale no editor'. O checklist:1748 ainda diz 'trocando o painel direito'. A mudança veio no commit 4c1e64b sem decisão nova registrada.

#### SPG-10

**Aprovação usa a versão do perfil vivo, e não a da execução, e grava proveniência errada** — baixa · confirmado · `spec-wrong` · tarefa **B7**

- **Local:** `apps/web/src/modules/scan/application/approve-scan.ts:73`
- **Regra ou spec:** docs/adr/0008-perfil-que-sai-do-registro.md:22–23 "aprovar nunca precisou do perfil vivo. O plano de aprovação lê três dados dele, e a execução passa a guardar os três no dia da varredura"
- **Cenário:** Varrer com book-fme-v1@1, subir o perfil para @2 (mudando defaultQuestionType, por exemplo) e depois aprovar: as âncoras dizem `scan:book-fme-v1@2`, uma versão que não produziu a proposta, e o tipo padrão aplicado é o de hoje. Isso contradiz o retrato 'do dia da varredura'.
- **Correção sugerida:** Quando existir `run.profileSnapshot`, usá-lo sempre (id, `run.profileVersion`, defaultQuestionType). O perfil vivo só entra para execuções anteriores ao retrato.
- **Verificação:** approve-scan.ts:73-77 prefere o perfil vivo ao retrato, que só entra quando o perfil sumiu do registro. A proveniência `scan:${profile.id}@${profile.version}` (prisma-scan-approval.ts:68) e o defaultQuestionType passam a ser os da versão atual, e não os da varredura. O ADR 0008:22-24 diz que o plano lê os três dados do retrato do dia da varredura.

#### SPG-11

**Checklist dá ✅ para 'PNG na resolução nativa', mas o código rasteriza a 300 DPI fixos** — baixa · confirmado · `spec-partial` · tarefa **I11**

- **Local:** `apps/web/src/modules/scan/infrastructure/pdf-figure-cropper.ts:33` · também: `apps/web/src/modules/scan/infrastructure/pdf-figure-cropper.ts:103`
- **Regra ou spec:** docs/_atual/_checklist.md:1869 "✅ Recorte vetorial em PDF (`pdf-lib`) e PNG na resolução nativa para bitmap"; ADR 0005: "Foto vira o bitmap embutido, no tamanho original"
- **Cenário:** Uma foto embutida em alta resolução sai reamostrada a 300 DPI e com o que estiver desenhado por cima. O ✅ leva quem lê o checklist a crer que o ADR 0005 ('Foto vira o bitmap embutido, no tamanho original') foi cumprido.
- **Correção sugerida:** Rebaixar a linha 1869 do checklist para ◐, apontando para o ⛔ dos 300 DPI, ou implementar a extração do XObject de imagem.
- **Verificação:** pdf-figure-cropper.ts:33 fixa RASTER_DPI=300 e a linha 103 rasteriza a região. O próprio comentário da linha 16 admite que o ideal seria a resolução nativa, e o checklist:1892 registra '⛔ Bitmap sai a 300 DPI fixos'. Isso contradiz o ✅ do checklist:1869 ('PNG na resolução nativa').

#### SPG-12

**A confirmação de apagar importação não consegue contar figuras** — baixa · confirmado · `spec-partial` · tarefa **B5**

- **Local:** `apps/web/src/modules/scan/domain/import-removal.ts:103` · também: `apps/web/src/modules/scan/ui/RemoveImportDialog.tsx:27`
- **Regra ou spec:** docs/adr/0006-a-importacao-e-apagavel.md:22 "A confirmação mostra os números antes: quantos capítulos, seções, questões e figuras"
- **Cenário:** Apagar a importação do FME: o diálogo lista capítulos, seções e questões e nunca menciona as 470 figuras que somem com os corpos. A pessoa decide sem o número que o ADR promete.
- **Correção sugerida:** Contar as âncoras ILLUSTRATION com `cropAssetId` dos nós que vão para a lixeira e devolver isso como `figures` no preview.
- **Verificação:** import-removal.ts:103 conta por NodeKind, mas a figura do scan entra no corpo via appendBody (approval-plan.ts:290-306) e não vira nó. Por isso o rótulo FIGURE de RemoveImportDialog.tsx:27 nunca aparece, e o ADR 0006:22 promete mostrar 'quantas ... figuras'.

#### SPG-13

**ADR 0007 e o aceite da Fase 25 ficaram com números e exceções antigos** — baixa · confirmado · `doc-drift` · tarefa **I11**

- **Local:** `docs/adr/0007-o-perfil-de-captura-e-codigo.md:60` · também: `docs/_atual/_checklist.md:1934`
- **Regra ou spec:** docs/_atual/_checklist.md:1934 e :1937
- **Cenário:** Quem escrever o próximo perfil lê no ADR que o FME é exceção e que o aceite mede 562/359, e compara com uma medição que já não é essa.
- **Correção sugerida:** Acrescentar ao ADR 0007 uma nota 'revisto pela Fase 25' e atualizar a linha 1934 do checklist para 568/361.
- **Verificação:** O ADR 0007:60 ainda diz que o Fundamentos fica fora da asserção do corpus, e o checklist:1937 marca ✅ que ele deixou de ser exceção. O checklist:1934 dá 562/359, enquanto scan-corpus.test.ts:231 e :235 afirmam 568 e 361.

### Spec · Waves A–F e checklists transversais (§8–§17)

**Resumo do revisor.** Nas Waves A–F o checklist está em boa parte bem amarrado à prova, e as fronteiras (§8, §9, §13) resistiram ao que conferi. Os defeitos reais têm uma origem só: o tipo `MULTIPLE_CORRECT` entrou no Beta, mas dois caminhos anteriores continuam com "uma correta" fixo no código. Um é o patch e a reversão do agente, que zeram o gabarito múltiplo. O outro são as avaliações, que imprimem gabarito errado e mostram as alternativas guardadas de discursivas. Isso contradiz os ✅ da §12 e da Fase 16. O `.lbb`, que também é o backup declarado, não leva avaliações, variantes (o gabarito impresso), revisões, templates nem `Workspace.legacyId`, e o round-trip não enxerga essa perda porque compara portables. Há também ✅ que dizem mais do que o código faz (logs de import, agente e persistência; "nada se perde" na Fase 11) e portões abertos cuja justificativa ("depende do acervo") venceu em 2026-08-31.

<details><summary>Cobertura declarada</summary>

Li por inteiro no checklist: §8, §9, §10, §11, §12, §13, §14, §15, §16 e §17 (linhas 1996–2395), a Fase 9 e a Fase 10 (932–1013), a Fase 11 (1016–1207), as Fases 12 e 13 (1209–1321) e as Fases 16 e 17 (1435–1603). No planejamento li §7 (.lbb) e as Fases 10, 11 e 13. Na spec mestra li §8.9 e a FEATURE 10.1.
Código que li por inteiro: prisma-legacy-import-writer.ts, prisma-patch-applier.ts, apply-question-patch.ts (a parte do revert), a rota de import de workspace (workspaces/import), a rota de artefatos de render (render-jobs/artifacts), local-file-storage-provider.ts, portable-schema.ts, question-type-plugin.ts, plugins/index.ts, question-blueprint.ts e assessment-template.ts (o corpo e o gabarito).
Código que só amostrei: map-legacy-library.ts, prisma-workspace-sink.ts, prisma-workspace-source.ts, compose-assessment.ts, prisma-assessment-repository.ts (a função contentFor), mutate-options.ts, option-mutations.ts, question-editor.tsx, approval-plan.ts, question-patch.ts, compile.ts do renderer, validate-bundle.ts, prisma-node-body.ts e prisma-scan-approval.ts (as revisões). Também o guarda do registry em tests/question-type-plugin.test.ts e o boundary-count.test.ts. Fiz ainda três varreduras por grep: portas e caminhos de máquina, BLOB e PostGIS, e escrita/origem de revisões e do logger.
O que NÃO conferi contra o código: as Fases 0–6.5 (fundação, design system, árvore, Monaco, preview e renderer, só o shell-escape), a Fase 7, a Fase 8, as Fases 14–15, o checklist visual da §11 (depende de olho e de E2E, que não rodei) e os itens de E2E da Fase 17. Não executei nenhum teste: os achados vêm da leitura do código. A Wave G ficou fora do escopo, e só cito approval-plan.ts como mais um lugar onde o mesmo problema do registry aparece.

</details>

#### SPA-01

**Aplicar patch e reverter revisão forçam uma única correta e apagam o gabarito de MULTIPLE_CORRECT** — alta · confirmado · `spec-wrong` · tarefa **F3**

- **Local:** `apps/web/src/infrastructure/agent/prisma-patch-applier.ts:132` · também: `apps/web/src/modules/agents/domain/question-patch.ts:141`, `apps/web/src/modules/agents/application/apply-question-patch.ts:155`, `apps/web/src/modules/agents/domain/patch-diff.ts:102`
- **Regra ou spec:** _checklist.md:2214 §12 'Revisão pode ser restaurada (devolve o estado exato — acento, `\\` e gabarito)'; :1009 Fase 10 'Restauração devolve o estado exato'; :2250 §13 'Todo patch do agente validado'
- **Cenário:** Cenário 1: uma questão MULTIPLE_CORRECT tem a) e c) corretas. O agente propõe marcar d) como correta, a tela mostra só 'd: incorreta → correta', e o humano aprova. O banco fica só com d) correta, e a) e c) são desmarcadas sem aparecer no diff. Cenário 2: restaurar uma revisão dessa mesma questão com a) e c) corretas deixa só a) marcada. A restauração que o checklist promete exata devolve um gabarito diferente, e a revisão gravada antes (a de USER) herda o mesmo defeito no próximo desfazer.
- **Correção sugerida:** Tirar a exclusividade do adaptador. A regra de 'desmarcar as outras' deve vir do tipo, pelo plugin (ou pelo `isExclusiveCorrect`, que já existe): só se aplica quando o tipo é exclusivo, e o revert grava o `isCorrect` do snapshot sem nenhuma regra, porque é restauração. A regra `<= 1` do schema deve ser condicionada ao tipo, conferido no servidor. Falta um teste de revert e outro de patch para MULTIPLE_CORRECT.
- **Verificação:** O `applyOptions` (prisma-patch-applier.ts:132-138) desmarca todas as outras alternativas assim que acha a primeira `isCorrect === true`, e não consulta o tipo nem o `isExclusiveCorrect`. O `revertQuestion` (apply-question-patch.ts:155-162) repassa o snapshot com todas as corretas, então uma MULTIPLE_CORRECT restaurada fica com uma correta só. Nem o caminho do agente nem o do revert tem guarda por tipo, e o diff (patch-diff.ts:102) só lista as alternativas que o patch cita.

#### SPA-02

**Avaliação ignora o tipo da questão: gabarito com uma letra só, alternativas de discursiva impressas e aviso falso** — alta · confirmado · `spec-wrong` · tarefa **E2**

- **Local:** `apps/web/src/modules/assessments/infrastructure/prisma-assessment-repository.ts:315` · também: `apps/web/src/modules/assessments/domain/assessment-template.ts:142`, `apps/web/src/modules/assessments/domain/assessment-template.ts:189`, `apps/web/app/api/assessments/[assessmentId]/route.ts:56`, `apps/web/src/modules/assessments/application/compose-assessment.ts:115`
- **Regra ou spec:** _checklist.md:1466-1467 Fase 16 'Export versão professor (resposta marcada no lugar da alternativa)' / 'Export gabarito'; :2303 §15 'Todo novo tipo de questão entra pelo registry'
- **Cenário:** Cenário 1: uma questão MULTIPLE_CORRECT (a e c corretas) entra na prova. A versão do professor marca só a) e a tabela do gabarito imprime 'a', ou seja, o gabarito impresso está errado. Cenário 2: uma questão trocada de escolha simples para discursiva ainda tem 5 alternativas guardadas. A prova do aluno imprime a)…e) debaixo da discursiva e o professor vê [X] numa delas, embora o render da própria questão (pelo plugin) não mostre alternativa nenhuma. Cenário 3: toda discursiva dispara o banner '1 questão(ões) sem alternativa correta — Marque a correta antes de imprimir', que manda fazer algo impossível.
- **Correção sugerida:** `contentFor` passa a ler `type` e a pedir ao plugin as alternativas visíveis e o conjunto de corretas, e `correctOptionIds` vira uma lista. O gabarito imprime todas as letras corretas. `hasCorrect` só vale para tipos com alternativas. O ideal é o template montar o corpo com `plugin.buildLatexBlocks` e deixar o embaralhamento com a variante.
- **Verificação:** O `contentFor` (prisma-assessment-repository.ts:315) grava um único `correctOptionId` via `find` e não lê `type`. O template (assessment-template.ts:142-155) imprime qualquer alternativa guardada e marca [X] só nessa correta, e o gabarito (:189) imprime uma letra. `hasCorrect` (route.ts:56) é consumido sem filtro de tipo em AssessmentBuilder.tsx:141, então toda discursiva dispara o aviso de 'sem correta'.

#### SPA-03

**O `.lbb` (export e backup) não leva avaliações, variantes, revisões, templates nem `Workspace.legacyId`** — alta · confirmado · `spec-partial` · tarefa **G2**

- **Local:** `apps/web/src/modules/portability/domain/portable-schema.ts:36` · também: `apps/web/src/modules/portability/infrastructure/prisma-workspace-sink.ts:43`, `apps/web/src/modules/portability/infrastructure/prisma-workspace-source.ts:41`
- **Regra ou spec:** _checklist.md:1267 Fase 13 'Exporta um workspace inteiro (artefato de render não atravessa)'; :2152 §10 'Backup recorrente produz .lbb restaurável'; _planejamento.md §7 'carrega um workspace inteiro — dados e assets'; _checklist.md:1459 'AssessmentVariantOptionMap — é o gabarito'
- **Cenário:** O banco se perde e o Chico restaura pelo backup automático. Os livros e as questões voltam, mas somem todas as avaliações e as variantes sorteadas. O mapa de letras, que o próprio checklist chama de 'o gabarito' de provas já impressas e que a seed não reconstrói, também some, junto com todo o histórico de revisões. O workspace restaurado volta sem `legacyId`, então `write-legacy-import.ts` deixa de reconhecer a biblioteca como 'já importada' e a reimporta em duplicata.
- **Correção sugerida:** Decidir e registrar o escopo. Uma opção é incluir no portable v3 as avaliações (seções, itens, variantes com mapa de letras), os templates, as revisões e `Workspace.legacyId`/`description`, com um migrador de v2. A outra é rebaixar o ✅ 'workspace inteiro' e o 'backup restaurável' para a lista do que atravessa, mostrando na tela de backup o aviso do que não é salvo. Em qualquer caso, o round-trip precisa de um teste que compare as contagens de runtime por entidade (avaliações, revisões).
- **Verificação:** `PortableWorkspace` (portable-schema.ts:52-57) só tem name, slug, publications e tags, e um grep por assessment, revision e template no módulo portability não acha nada. O sink cria o workspace só com `{ name, slug }` (prisma-workspace-sink.ts:43), sem `legacyId`. Nenhum doc ou ADR declara essas exclusões: o checklist (:1267, :2152) só exclui o artefato de render.

#### SPA-04

**A regra 'todo tipo pelo registry' só é guardada contra `switch`, e o conhecimento por tipo está espalhado em pelo menos sete tabelas e condicionais** — média · confirmado · `spec-partial` · tarefa **E4**

- **Local:** `apps/web/app/publications/[id]/editor/question-editor.tsx:122` · também: `apps/web/app/publications/[id]/editor/question-editor.tsx:689`, `apps/web/app/publications/[id]/editor/question-editor.tsx:722`, `apps/web/app/publications/[id]/editor/add-menu.tsx:47`, `apps/web/src/modules/questions/application/mutate-options.ts:25`, `apps/web/src/modules/questions/domain/question-blueprint.ts:62`, `apps/web/src/modules/questions/domain/question-blueprint.ts:45`, `apps/web/src/modules/scan/domain/approval-plan.ts:247`, `apps/web/tests/question-type-plugin.test.ts:255`
- **Regra ou spec:** _checklist.md:2303 §15 'Todo novo tipo de questão entra pelo registry (guard varre src/ e app/ atrás de switch sobre tipo de questão)'
- **Cenário:** Os achados SPEC-AGT-01 e SPEC-ASM-01 são exatamente esse custo. Ao registrar um quarto plugin (por exemplo TRUE_FALSE), a pessoa precisa achar à mão as tabelas e condicionais acima, e nenhum teste falha se esquecer uma: o tipo aparece sem rótulo no seletor, com a aba de alternativas errada ou com exclusividade errada. É o 'comportamento errado numa tela só' que o próprio `question-type-plugin.ts` diz evitar.
- **Correção sugerida:** Levar para o `QuestionTypePlugin` as capacidades declarativas: `hasOptions`, `exclusiveCorrect`, `initialOptionCount`, `creatable`, `label`. Derivar dali o seletor, o add-menu, `panesFor`, `EXCLUSIVE_CORRECT`, `INITIAL_OPTIONS` e o approval-plan. `parseQuestionType` na criação deve aceitar só `registeredTypes()`. O guarda passa a afirmar que nenhum literal de `QuestionType` aparece fora de `questions/domain/plugins` e do vocabulário.
- **Verificação:** O guarda (tests/question-type-plugin.test.ts:252-255) só pega `switch` e isenta `/questions/domain/`. Todas as condicionais e tabelas citadas existem: question-editor.tsx:122, :689 e :722, add-menu.tsx:47, question-blueprint.ts:32 e :62, approval-plan.ts:247. `parseQuestionType` (question-blueprint.ts:45) aceita os 7 tipos, e `CREATABLE_TYPES` só é usado na tela de ingestão, não na criação pelo servidor.

#### SPA-05

**Reverter não devolve o estado exato quando o tipo mudou ou quando alternativas foram criadas ou apagadas depois da revisão** — média · confirmado · `spec-partial` · tarefa **F3**

- **Local:** `apps/web/src/modules/agents/application/apply-question-patch.ts:129` · também: `apps/web/src/modules/agents/domain/patch-diff.ts:16`, `apps/web/src/infrastructure/agent/prisma-patch-applier.ts:140`
- **Regra ou spec:** _checklist.md:1009 Fase 10 'Restauração devolve o estado exato'; _planejamento.md Fase 10 'Aceite: restaurar uma revisão devolve o estado exato e fica auditado'
- **Cenário:** O agente aplica um patch e grava a revisão N. Depois o usuário apaga a alternativa e), acrescenta uma f) e troca o tipo para discursiva. Restaurar a revisão N devolve uma questão discursiva, sem e) e com f), nada parecido com o estado de N. A tela diz 'restaurado' e a Fase 10 afirma 'estado exato'.
- **Correção sugerida:** Incluir `type` e `sortKey` no snapshot (com versão do snapshot). No revert, recriar as alternativas ausentes (com o id original, se o schema permitir) e marcar ou remover as que sobraram, ou recusar a restauração com uma mensagem clara quando o conjunto de alternativas divergiu. Falta um teste com alternativa adicionada ou removida entre a revisão e o revert.
- **Verificação:** `QuestionState` (patch-diff.ts:16-28) não guarda `type` nem `sortKey`. O revert só faz `updateMany` nos ids do snapshot (prisma-patch-applier.ts:118, :146), então uma alternativa apagada não volta e uma nova fica. O PATCH da questão aceita `type` (app/api/publications/[id]/questions/[questionId]/route.ts:169-199), e `insertOption`/`deleteOption` (prisma-option-writer.ts:46-57) não gravam revisão.

#### SPA-06

**'Logs estruturados de render · import · agente · persistência' marcado ✅, mas só o render emite log** — média · confirmado · `spec-partial` · tarefa **I11**

- **Local:** `apps/web/src/modules/rendering/application/execute-render.ts:81` · também: `apps/web/src/shared/observability/logger.ts:20`
- **Regra ou spec:** _checklist.md:1514 Fase 17 'Logs estruturados de render · import · agente · persistência'; :1518 'Instrumentar os pontos de chamada com o logger'
- **Cenário:** O import de `.lbb` ou o apply de patch falha em produção local. O único rastro é a resposta HTTP e o stack no console do Next, sem evento JSON correlacionável. A página de diagnóstico e quem investiga não têm como dizer quando e quantas vezes o import falhou, e o domínio `import` existe só no tipo.
- **Correção sugerida:** Instrumentar um ponto por domínio: `writeImportedWorkspace` e `PrismaLegacyImportWriter.write` (started/finished/failed com contagens), `applyQuestionPatch` e `revertQuestion` (agent, com revisionNumber) e a rota do agente (turno, provider, duração, sem prompt). Ou então rebaixar o ✅ da linha 1514 para 'render', com o resto como item aberto.
- **Verificação:** O único importador do logger fora de shared/observability é execute-render.ts:5, e as únicas chamadas `log.*` são as de render (:81, :85 e o finished). O checklist :1514 marca ✅ render, import, agente e persistência, mas a justificativa em :1518 cobre só o `executeRender`.

#### SPA-07

**Portões abertos com justificativa vencida: 'depende do acervo/Fase 11', que foi importado em 2026-08-31** — média · confirmado · `doc-drift` · tarefa **I11**

- **Local:** `docs/_atual/_checklist.md:2311` · também: `docs/_atual/_checklist.md:1001`, `docs/_atual/_checklist.md:1003`, `docs/_atual/_checklist.md:1159`, `docs/_atual/_checklist.md:1204`, `docs/_atual/_checklist.md:1551`, `docs/_atual/_checklist.md:1561`
- **Regra ou spec:** §15 :2311 '[ ] legacyId nunca apagado após o import (afirmar exige o import da Fase 11, que depende do acervo)'; Fase 17 :1551 e :1561; Fase 10 :1001-1003; Fase 11 :1159 e :1204
- **Cenário:** Quem usa o checklist como fonte de verdade (a regra do projeto) não sabe se a regra inviolável do `legacyId` foi afirmada. Não sabe se falta uma revisão IMPORT, que a spec mestra §8.9 pede para o MVP ('revisão apenas antes de mudanças agênticas e importações'), nem se o writer de figuras já fechou o 'assets ausentes'. Esses itens ficam abertos para sempre sem dono nem issue.
- **Correção sugerida:** Reavaliar cada item contra o estado atual. §15: afirmar com um teste ou guarda (nenhum caminho de update grava `legacyId: null`; export/import preserva). Fase 10: gravar revisão IMPORT no import legado e no `.lbb`, ou registrar a decisão de não gravar, e fechar o ⛔ do SYSTEM citando o scan. Fase 17: medir contra as 225 questões reais ou fechar por decisão, como a Fase 12 fez. Fase 11: reescrever as notas.
- **Verificação:** Os itens citados continuam com justificativas vencidas: :1001 ⛔ IMPORT, :1003 ⛔ SYSTEM (prisma-scan-approval.ts:242 já grava `origin: "SYSTEM"`), :1162 ('não importa asset nenhum', embora import-legacy-figures.ts:171 grave figuras), :1551, :1561 e :2311 ('depende do acervo'). Isso contradiz a §10 (:2133), que diz o acervo acessível e importado. A nota de :1204 também diverge da §10, toda ✅.

#### SPA-08

**'Nada se perde: o originalLatex guarda a citação' é falso: a resposta e as alternativas de nó estrutural são descartadas sem campo nenhum** — baixa (o revisor deu média) · confirmado · `spec-wrong` · tarefa **G4**

- **Local:** `apps/web/src/modules/legacy-import/application/map-legacy-library.ts:182` · também: `apps/web/src/modules/legacy-import/application/map-legacy-library.ts:156`
- **Regra ou spec:** _checklist.md:1084-1091 Fase 11 'As 7 figuras órfãs ficam fora, por decisão… Nada se perde: o originalLatex guarda a citação'
- **Cenário:** Fundamentos 10 e 11 (nós estruturais com resolução e 5 figuras no legado) são importados como capítulos vazios. O texto da resolução e as citações das figuras não existem em nenhuma coluna do produto. O checklist assegura que 'nada se perde' e o Chico ratificou a exclusão com base nisso, mas o conteúdo só sobrevive no `.knowchico` original.
- **Correção sugerida:** Corrigir a nota do checklist para dizer o que realmente se perde. Melhor ainda: mapear o LaTeX do nó estrutural para `bodyLatex` (o `bodyLatex` e as âncoras que o `.lbb` v2 já carrega), resolvendo as figuras pelo mesmo `cite`. Assim a limitação some sem criar conceito novo, que era o que motivou a decisão.
- **Verificação:** Em map-legacy-library.ts:182-192 o nó estrutural só leva `title` e `question: null`, sem `bodyLatex` (que existe em portable-schema.ts:128), e o `originalLatex` da questão é `row.latexOrigin` (:156). A afirmação 'Nada se perde: o originalLatex guarda a citação' (_checklist.md:1091) é falsa. A exclusão em si foi decisão ratificada, e o próprio texto admite que o import descarta a resposta. Por isso é mais imprecisão de documento que bug, com severidade baixa.

#### SPA-09

**`ImportReport` estruturado da Fase 11 continua parcial: o relatório é texto de console, sem ignorados/órfãos/assets ausentes** — baixa · confirmado · `spec-partial` · tarefa **G4**

- **Local:** `apps/web/src/modules/legacy-import/infrastructure/prisma-legacy-import-writer.ts:31` · também: `apps/web/scripts/write-legacy-import.ts:30`
- **Regra ou spec:** _checklist.md:1159 Fase 11 '◐ ImportReport: importados, atualizados, ignorados, inconsistentes, órfãos, assets ausentes'; §10 :2144 'falta só o formato ImportReport estruturado, hoje é texto'; _planejamento.md Fase 11 '· ImportReport ·'
- **Cenário:** Reimportar uma biblioteca (ou rodar a Fase 23 no legado) não deixa um relatório comparável entre execuções. Para saber quantas questões ficaram de fora e por quê, é preciso reler a saída de três scripts.
- **Correção sugerida:** Tipar `ImportReport` com as seis contagens mais a lista (legacyId, motivo) de excluídos e ausentes, devolvido por `write` e pelo dry-run, e serializado em JSON pelo script. 'Atualizados' pode ficar explicitamente 0/N/A enquanto o import só cria.
- **Verificação:** `LegacyImportReport` (prisma-legacy-import-writer.ts:31-39) só tem workspaceId e contagens de publicações, nós, questões, alternativas e figuras. Faltam ignorados, órfãos e assets ausentes. O próprio checklist já marca o item ◐ (:1159) e 'hoje é texto' (:2144), então é pendência conhecida, não regressão.

#### SPA-10

**'Colisão de legacyId/uuid… exige decisão' não é exigida pelo servidor: o POST sem dryRun grava mesmo com colisões** — baixa · confirmado · `spec-partial` · tarefa **G3**

- **Local:** `apps/web/app/api/workspaces/import/route.ts:73` · também: `apps/web/src/modules/portability/infrastructure/prisma-workspace-sink.ts:10`
- **Regra ou spec:** _checklist.md:1284 Fase 13 'Colisão de legacyId/uuid gera relatório e exige decisão'; _planejamento.md §7 'colisão… gera relatório e exige decisão'
- **Cenário:** Um script, o backup restaurando ou um segundo cliente faz POST do mesmo `.lbb` duas vezes. Nascem dois workspaces com as mesmas publicações por `legacyId`/`legacyUuid`, e ninguém decidiu nada. O relatório de colisão vem na resposta, depois de gravado.
- **Correção sugerida:** Exigir `acceptCollisions=1` (ou um hash do relatório do dry-run) quando `plan.collisions.length > 0` e responder 409 com os conflitos caso contrário. A tela já faz o dry-run antes e só precisa repassar o aceite.
- **Verificação:** Em app/api/workspaces/import/route.ts:60-73, sem `dryRun=1` a rota chama `writeImportedWorkspace` direto, sem nenhum parâmetro de aceite das colisões. A decisão fica só no Modal do cliente, como o comentário do sink admite (prisma-workspace-sink.ts:10-12). O impacto é limitado: o sink sempre cria um workspace novo com slug sufixado e nunca sobrescreve, então o resultado é duplicata, não perda.

## Bugs e corretude

### Bugs e corretude · Captura (scan e reconhecimento)

**Resumo do revisor.** A captura funciona bem quando o livro é aprovado de uma vez só. Os bugs sérios aparecem em três caminhos. O primeiro é a aprovação parcial em mais de uma rodada. Nela, a detecção de "já no acervo" confunde exercício com a âncora gigante do grupo, e a ordem da árvore e do corpo sai trocada. O segundo é a figura de exercício ou questão, que vai parar no corpo do nó QUESTION, um lugar que nada exibe. O terceiro é o texto reconhecido por visão: nesse caminho a separação de alternativas não acontece, e linhas de LaTeX são coladas sem cuidado. Há ainda duas falhas na revisão: a herança de revisão na troca de perfil casa caixa pequena dentro de caixa grande, e unir itens descarta o LaTeX reconhecido. A execução que fica à espera do perfil nunca é retomada. Remover a importação apaga de menos, e a fila de captura some depois que um scan é aprovado. Todos os achados de domínio marcados CONFIRMED foram reproduzidos com scripts descartáveis em Bun no scratchpad.

<details><summary>Cobertura declarada</summary>

Li por inteiro: scan/application (approve-scan, run-scan, control-scan, start-scan, switch-profile, remove-import, review-scan, figure-pass, math-recognition, semantic-review, suggest-profile, scan-store), scan/infrastructure (prisma-scan-approval, prisma-scan-store, prisma-scan-import, prisma-figure-assets, pdf-figure-cropper, pdfjs-document-reader, in-process-scan-runner, scan-deps, scan-passes), scan/domain (approval-plan, approval-latex, inherit-review, import-removal, review, scan-run, scan-item, geometry, text, structure, regions, document, figures, partes de page.ts e capture-profile.ts), recognition (capture-queue, prisma-capture-queue, create-question-from-recognition, prisma-recognition-provenance, separar-alternativas, recognition-review) e todas as rotas de app/api/scans/**, app/api/publications/[id]/scans|capture-queue|capture-profile-suggestion e app/api/recognition. Também li as páginas scan/[runId]/page.tsx. Só amostrei: profiles/book-v1, book-fme-v1 e exam-enem-v1 (classify e extents), ScanWorkspace.tsx (controles e aprovação), SourcePdfViewerInner.tsx, workspace-view.ts (countsByState), furniture.ts (pageOffset), segmentar-pagina.ts (cabeçalho), IngestionPanel.tsx (grep). Não li: layout.ts, toc.ts, typography.ts, fonts.ts, proposal.ts, furniture.ts no resto, StructureTree/ScanPropertiesPanel/QuestionSourcePane/RemoveImportDialog, vision-math-recognizer.ts, recognition-candidate.ts e o resto de segmentar-pagina.ts. Provas executadas com Bun em /tmp/claude-1000/.../scratchpad: duplicateOf contra o grupo, figura dentro de exercício, questão de alternativas com mathResult, joinLines sobre LaTeX, merge com mathResult e inheritReview com caixas aninhadas.

</details>

#### CAP-01

**Aprovação parcial marca exercícios como 'já no acervo' apontando para o nó do grupo (âncora gigante)** — crítica · confirmado · `bug` · tarefa **B3** · **feita** (`b1673ae`)

- **Local:** `apps/web/src/modules/scan/domain/approval-plan.ts:164` · também: `apps/web/src/modules/scan/domain/approval-plan.ts:227`, `apps/web/src/modules/scan/infrastructure/prisma-scan-approval.ts:141`, `apps/web/src/modules/scan/domain/profiles/book-fme-v1.ts:212`
- **Regra ou spec:** D53: 'nada entra duas vezes' sem perder o que não entrou
- **Cenário:** Fundamentos: a primeira aprovação (com sugeridos) cria o grupo E X E R C Í C I O S e parte dos exercícios. Os exercícios que estavam NEEDS_REVIEW são aceitos e aprovados na segunda rodada. Cada um vira `alreadyInCollection` com nodeId = grupo: `mark` grava documentNodeId=grupo e reviewState=APPROVED, e nenhuma Question é criada. O mesmo acontece com FIGURE/CONTENT dentro de uma QUESTION do ENEM ou de um EXAMPLE aprovados antes. O resumo diz 'N já estavam no acervo', e o conteúdo some sem aviso, com o item travado para edição.
- **Correção sugerida:** Restringir o casamento a âncoras de nós do mesmo tipo (ou compatível) com o item, e usar IoU (interseção/união) em vez de interseção/menor. Outra opção é excluir as âncoras de nós contêineres (QUESTION_GROUP, EXAMPLE, QUESTION quando o item é filho dela). O teste deve cobrir duas aprovações sucessivas com grupo until-boundary.
- **Verificação:** `duplicateOf` (approval-plan.ts:164-173) compara com toda âncora de `readContext` (prisma-scan-approval.ts:32-49) usando `overlapRatio` = interseção/menor área (geometry.ts:43-50), e o EXERCISE_GROUP `until-boundary` recebe a faixa inteira até o próximo não-descendente (structure.ts:476-481). Na segunda aprovação, o exercício dentro da caixa do grupo vira `alreadyInCollection` e `mark` (prisma-scan-approval.ts:138-144) grava APPROVED apontando para o grupo, sem criar a Question.

#### CAP-02

**Figura filha de exercício/questão vai para o bodyLatex do nó QUESTION, que não tem corpo** — alta · confirmado · `bug` · tarefa **B2**

- **Local:** `apps/web/src/modules/scan/infrastructure/prisma-scan-approval.ts:247` · também: `apps/web/src/modules/scan/infrastructure/prisma-scan-approval.ts:328`, `apps/web/src/modules/document-tree/domain/node-body.ts:10`
- **Cenário:** Questão do ENEM com gráfico: a aprovação cria a Question com o enunciado sem a figura e anexa `\begin{figure}...` ao bodyLatex do nó QUESTION. O editor não mostra corpo para QUESTION, e a renderização da questão usa `statementLatex` e `loadQuestionAssets(questionId)`. A figura nunca aparece na questão, e o item fica marcado como aprovado.
- **Correção sugerida:** Quando o container resolvido é uma questão, não usar appendBody. Anexar o `figureLatex` ao `statementLatex` da questão planejada (no plano, antes do createNode, ou num passo `appendStatement`), ligar o asset à questão (questionId) e usar a âncora ILLUSTRATION.
- **Verificação:** A figura acha como pai o EXERCISE/QUESTION anterior que aceita FIGURE (structure.ts:188-195; book-fme-v1.ts:106-107, exam-enem-v1.ts:58). O ramo BODY_KINDS (approval-plan.ts:289-306) faz appendBody com target = nó QUESTION planejado, e prisma-scan-approval.ts:247-250 grava bodyLatex nele, embora node-body.ts:10-21 exclua QUESTION de WITH_BODY. A figura não entra no enunciado.

#### CAP-03

**Questão com LaTeX reconhecido/revisado nunca separa alternativas; na zona, múltipla escolha vira DISCURSIVE** — alta · confirmado · `bug` · tarefa **B1** · **feita** (`4c7a567`)

- **Local:** `apps/web/src/modules/scan/domain/approval-latex.ts:183` · também: `apps/web/src/modules/scan/domain/approval-plan.ts:269`
- **Regra ou spec:** ADR 0009
- **Cenário:** Fundamentos com AI_VISION_MODEL configurado: questões de vestibular com matemática (needsMath) passam pelo reconhecimento e nascem DISCURSIVE, com as alternativas coladas no enunciado. No ENEM (tipo do perfil, sem rebaixamento), nascem MULTIPLE_CHOICE com 5 alternativas vazias e as alternativas dentro do enunciado. É justamente o que o ADR 0009 queria evitar.
- **Correção sugerida:** No ramo `ready`, extrair as alternativas quando `wantsOptions`: tentar primeiro os filhos ITEM (o texto da camada é suficiente para os rótulos), depois o próprio LaTeX linha a linha com ALTERNATIVE/INLINE_ALTERNATIVE, cortando o enunciado no começo da primeira alternativa.
- **Verificação:** O ramo `ready` (approval-latex.ts:183-192) devolve `options: []` sem olhar os ITEMs. Exercícios e questões estão em RECOGNIZED_KINDS (math-recognition.ts:23), então com needsMath passam pelo reconhecimento e caem nesse ramo. Com tipo vindo da zona, approval-plan.ts:269-271 rebaixa para DISCURSIVE. Com o tipo do perfil, nasce MULTIPLE_CHOICE com alternativas vazias (planQuestion completa as opções com '').

#### CAP-04

**Aprovação parcial sempre anexa no fim: ordem dos nós e do corpo sai trocada** — alta · confirmado · `bug` · tarefa **B4**

- **Local:** `apps/web/src/modules/scan/infrastructure/prisma-scan-approval.ts:101` · também: `apps/web/src/modules/scan/infrastructure/prisma-scan-approval.ts:356`
- **Cenário:** Exercícios 1, 2 e 4 AUTO_ACCEPTABLE e o 3 NEEDS_REVIEW: a primeira aprovação cria 1, 2 e 4, e a segunda cria o 3 depois do 4, então a árvore e o PDF saem 1,2,4,3. O mesmo vale para o corpo: um parágrafo ou figura do meio da seção aprovado depois vai para o fim do bodyLatex, depois do texto que vem depois dele no livro. A aprovação parcial é o fluxo pedido (aceitar sugeridos e revisar o resto).
- **Correção sugerida:** Calcular o sortKey entre os vizinhos materializados pela ordem de `ScanItem.sortOrder`: achar o irmão aprovado imediatamente anterior e o posterior e usar `generateKeyBetween(prev, next)`. No corpo, ou gravar trechos com marcadores de posição, ou recusar appendBody fora de ordem e avisar em `skipped`.
- **Verificação:** `nextKey` (prisma-scan-approval.ts:92-104) sempre gera a chave depois do maior sortKey do pai, e `appendToBody` (node-body.ts:47-52) concatena no fim (prisma-scan-approval.ts:247-250). A aprovação parcial está prevista no planejamento (D53, _planejamento.md:1095), e nada consulta o sortOrder dos itens já materializados. Por isso o exercício 3 aprovado depois fica depois do 4.

#### CAP-05

**Execução AWAITING_PROFILE nunca é retomada: 'pedir de novo' devolve a mesma execução sem rodar o laço** — média (o revisor deu alta) · confirmado · `bug` · tarefa **B7**

- **Local:** `apps/web/src/modules/scan/application/start-scan.ts:75` · também: `apps/web/src/modules/scan/ui/ScanWorkspace.tsx:350`, `apps/web/tests/scan-profile-gone.test.ts:78`
- **Regra ou spec:** ADR 0008
- **Cenário:** O perfil some e a varredura para em AWAITING_PROFILE. O perfil volta com o mesmo id/versão e a pessoa pede o scan de novo: o POST responde 200 reused e a execução fica parada para sempre no mesmo estado, com o mesmo erro e sem botão de retomar. A única saída é forceNew, que relê tudo, exatamente o que o ADR 0008 queria evitar.
- **Correção sugerida:** Em startScan, chamar `ensure` também quando `isAwaitingProfile(existing.state)` (e limpar o `error`), ou mostrar o botão Retomar para AWAITING_PROFILE (resumeScan já aceita esse estado). Corrigir o teste para usar um runner que registre as chamadas a `ensure`.
- **Verificação:** start-scan.ts:75-77 devolve a execução AWAITING_PROFILE como reused sem chamar `ensure`, porque ela não está em IN_PROGRESS (scan-run.ts:29-37). O botão Retomar só aparece com interrupted/FAILED/CANCELLED (ScanWorkspace.tsx:350), e o banner da linha 405 promete que 'pedir de novo' continua a varredura. Rebaixei para medium porque o caminho (o perfil sai do registro) é raro.

#### CAP-06

**Herança de revisão casa caixa pequena dentro de caixa grande: título herda APPROVED e o LaTeX revisado de um bloco inteiro** — alta · confirmado · `bug` · tarefa **B6**

- **Local:** `apps/web/src/modules/scan/domain/inherit-review.ts:44` · também: `apps/web/src/modules/scan/domain/inherit-review.ts:268`, `apps/web/src/modules/scan/application/run-scan.ts:149`
- **Cenário:** Trocar de book-v1 para book-fme-v1 num trecho em que o perfil antigo juntou título + parágrafos num item revisado: o título (ou o primeiro parágrafo) herda APPROVED e o LaTeX do bloco todo. Se for CONTENT, contentLatex usa esse reviewedLatex, e o texto de P2 entra duas vezes no corpo (uma no P1 herdado, outra no P2 cru). Itens que ninguém aceitou entram aprovados.
- **Correção sugerida:** Casar pela sobreposição simétrica (IoU ≥ limiar) ou exigir também área comparável (razão de áreas ≥ ~0,5). Herdar reviewedText/reviewedLatex só entre itens do mesmo tipo, escolher o melhor casamento global (maior IoU) em vez do primeiro, e não herdar de itens já materializados (documentNodeId).
- **Verificação:** `sameSpot` usa `overlapRatio` sobre a menor área com limiar 0,6 (inherit-review.ts:44-51), e o laço dá o candidato ao primeiro item novo que casa, sem olhar tipo nem proporção (inherit-review.ts:71-81). Um título pequeno dentro do CONTENT revisado herda APPROVED e o reviewedLatex do bloco inteiro, e run-scan.ts:149-165 grava isso. O comentário da linha 23 mostra que a contenção foi pensada para o caso oposto (item novo maior).

#### CAP-07

**Unir itens descarta o LaTeX do reconhecimento matemático** — alta · confirmado · `bug` · tarefa **B6**

- **Local:** `apps/web/src/modules/scan/domain/review.ts:289` · também: `apps/web/src/modules/scan/domain/review.ts:285`
- **Cenário:** Um parágrafo que atravessa a página foi proposto como dois CONTENT. A pessoa corrige o LaTeX do primeiro e une os dois: a matemática reconhecida do segundo some do que vai para o acervo, sem aviso. Se nenhum dos dois foi revisado, `latex` vira null (needsMath) e o mathResult é zerado: a aprovação cai no texto cru da camada, jogando fora os reconhecimentos pagos.
- **Correção sugerida:** Montar o LaTeX unido com `effectiveLatex(i) ?? escapeLatexText(effectiveText(i))` para cada parte. Guardar em reviewedLatex quando alguma parte tiver reviewedLatex ou mathResult.
- **Verificação:** `merge` (review.ts:289-293) monta o reviewedLatex só com `reviewedLatex ?? latex ?? ''`, ignora `mathResult.latex` (que `effectiveLatex` considera, scan-item.ts:65-66) e zera o mathResult. Com needsMath, `latex` é null, então a matemática reconhecida some. Quando ninguém revisou, `contentLatex` cai no texto cru.

#### CAP-08

**Fila de captura lê as 200 âncoras mais recentes da publicação, e as do scan aprovado empurram as capturas pendentes para fora** — média · confirmado · `bug` · tarefa **B9**

- **Local:** `apps/web/src/modules/recognition/infrastructure/prisma-capture-queue.ts:14` · também: `apps/web/src/modules/scan/infrastructure/prisma-scan-approval.ts:223`
- **Cenário:** A pessoa recorta 10 questões na Ingestão e deixa na fila. Depois aprova um scan do mesmo livro (mais de 200 âncoras). As 200 âncoras mais novas são todas do scan (ligadas a nós, portanto 'approved' e filtradas), e a fila e a contagem do rail passam a mostrar zero: os recortes pendentes somem da tela.
- **Correção sugerida:** Filtrar no banco: `where: { publicationId, questions: { none: {} }, nodes: { none: {} } }` (e/ou `NOT extractionMethod startsWith 'scan:'`), aplicando o `take` depois desse filtro.
- **Verificação:** `readCaptureFacts` lê as 200 âncoras mais recentes da publicação sem filtrar as já usadas (prisma-capture-queue.ts:14-20). Só depois `pendingQueue` descarta as 'approved' (capture-queue.ts:82-86). A aprovação do scan cria uma âncora por região com o mesmo publicationId (prisma-scan-approval.ts:114-126), o que empurra as capturas pendentes para fora do teto.

#### CAP-09

**Remover importação apaga de menos: nós que só receberam corpo numa aprovação posterior ficam como 'editado à mão', e corpo anexado a nós reaproveitados nunca sai** — média · confirmado · `bug` · tarefa **B5**

- **Local:** `apps/web/src/modules/scan/domain/import-removal.ts:72` · também: `apps/web/src/modules/scan/infrastructure/prisma-scan-import.ts:254`, `apps/web/src/modules/scan/infrastructure/prisma-scan-approval.ts:346`
- **Cenário:** Aprovar a estrutura hoje e o conteúdo revisado amanhã, e depois 'Apagar importação' para reimportar: todas as seções que receberam teoria ficam de pé com o motivo 'editado depois de aprovado' (e os pais com 'contém trabalho preservado'), com o texto do scan dentro. Na reimportação, as âncoras antigas marcam o conteúdo novo como 'já no acervo', e o corpo velho fica.
- **Correção sugerida:** Medir edição humana só pela revisão USER/AGENT, ou comparar com a última escrita da própria aprovação: gravar `lastScanWriteAt` por nó ou usar a data da revisão SYSTEM 'corpo recebido do scan' como referência. Para nós reaproveitados, registrar os trechos anexados (revisão SYSTEM com o snapshot anterior já existe) e restaurar o snapshot pré-scan na remoção.
- **Verificação:** `approvedAt` é o createdAt do nó (prisma-scan-import.ts:75), e reasonToKeep marca 'editado depois de aprovado' quando updatedAt passa de createdAt + folga (import-removal.ts:66-72). Um appendBody numa aprovação posterior faz documentNode.update (prisma-scan-approval.ts:247-250) e dispara esse motivo. Manter o nó reaproveitado é intencional (ADR 0006), mas o corpo anexado a ele não é desfeito, e isso a ADR não cobre.

#### CAP-10

**joinLines aplicado a LaTeX revisado/reconhecido: '%' comenta o resto da questão e o '-' de fim de linha some** — média · confirmado · `bug` · tarefa **B1** · **feita** (`4c7a567`)

- **Local:** `apps/web/src/modules/scan/domain/approval-latex.ts:187` · também: `apps/web/src/modules/scan/domain/approval-latex.ts:189`, `apps/web/src/modules/scan/domain/approval-latex.ts:35`
- **Cenário:** Um revisor deixa um comentário `%` no LaTeX de um exercício, ou o modelo de visão quebra uma equação numa linha que termina em '-': depois da aprovação, a equação inteira fica comentada (compila sem erro e sai sem o conteúdo), ou o sinal de menos desaparece ('2x -' + 'x^2' → '2x x^2'). As quebras de parágrafo também se perdem. O mesmo acontece com a resolução (solutionLatex).
- **Correção sugerida:** No ramo de LaTeX pronto, não usar joinLines: fazer `cortado.statement.join("\n").trim()`. A junção e a desifenização valem só para o texto cru da camada do PDF.
- **Verificação:** No ramo `ready`, approval-latex.ts:187 e 189 aplicam `joinLines` (linhas 35-42) ao LaTeX revisado ou reconhecido. Isso junta tudo numa linha, e um `%` passa a comentar o resto. Um '-' no fim da linha seguido de minúscula também é removido. `contentLatex` e `exampleBody` (linhas 54-55, 67-68) devolvem o LaTeX pronto intacto, o que mostra a inconsistência.

#### CAP-11

**Duas aprovações concorrentes duplicam nós e questões: o plano sai de leitura fora da transação e o `mark` não confere documentNodeId** — média · plausível · `bug` · tarefa **B3** · **feita** (`b1673ae`)

- **Local:** `apps/web/src/modules/scan/infrastructure/prisma-scan-approval.ts:138` · também: `apps/web/src/modules/scan/infrastructure/prisma-scan-approval.ts:247`
- **Cenário:** Aprovar o livro em duas abas, ou reenviar depois que a primeira requisição (até 120 s) parece travada: o SQLite serializa as transações, mas a segunda executa o plano calculado antes da primeira terminar. Todos os capítulos, questões DRAFT e âncoras são criados em dobro, e os itens passam a apontar para a segunda cópia.
- **Correção sugerida:** Recalcular o plano dentro da transação (ler itens e contexto com o `tx`), ou fazer `mark` com `documentNodeId: null` e abortar quando `count !== itemIds.length`. Um lock otimista na ScanRun (coluna `approvingAt` ou versão) também resolve.
- **Verificação:** O plano é calculado fora da transação (approve-scan.ts:85-101), `mark` não filtra `documentNodeId: null` (prisma-scan-approval.ts:138-142), e nem a rota (app/api/scans/[runId]/approve/route.ts) nem a ScanRun têm lock. A duplicação depende do timing do SQLite: com a transação longa, o busy timeout pode fazer a segunda falhar em vez de duplicar. Não fechei a prova.

#### CAP-12

**Item materializado cujo nó foi para a lixeira continua servindo de pai: filhos aprovados depois nascem dentro de nó excluído** — média · confirmado · `bug` · tarefa **B3** · **feita** (`b1673ae`)

- **Local:** `apps/web/src/modules/scan/domain/approval-plan.ts:146`
- **Cenário:** A pessoa aprova a seção 2.3, apaga essa seção no editor (vai para a lixeira) e depois aprova os exercícios dela que estavam em revisão: as questões são criadas com parentId = seção excluída, ficam invisíveis na árvore e aparecem na aprovação como sucesso ('N nós criados').
- **Correção sugerida:** Só tratar como `existing` o documentNodeId presente em `existingNodes`. Caso contrário, tratar o pai como não aprovado (skip com motivo 'o item acima foi excluído no editor') ou limpar o vínculo do item.
- **Verificação:** approval-plan.ts:146-148 resolve como `existing` todo item com documentNodeId sem conferir `existingNodes`, que `readContext` filtra por `deletedAt: null` (prisma-scan-approval.ts:29). A exclusão lógica (prisma-document-tree-repository.ts:123) não mexe em ScanItem, então o filho aprovado depois nasce com parentId = nó da lixeira.

#### CAP-13

**Figura do scan idêntica à de outro livro do mesmo workspace reaproveita o Asset alheio e não compila neste livro** — média · plausível · `bug` · tarefa **C1**

- **Local:** `apps/web/src/modules/scan/infrastructure/prisma-figure-assets.ts:40` · também: `apps/web/src/modules/assets/infrastructure/prisma-asset-writer.ts:44`, `apps/web/src/modules/rendering/infrastructure/prisma-question-assets.ts:47`
- **Cenário:** O mesmo PDF anexado a dois livros do mesmo workspace (caso previsto em `findLatestByKey`): o scan do livro B recorta as mesmas figuras, recebe os assets do livro A e grava `\includegraphics{figura-...}` no corpo de B. Ao compilar B, o asset não é achado (publicationId = A) e o pdflatex falha com File not found. Se A for apagado, B perde as figuras.
- **Correção sugerida:** Na figura do scan, deduplicar por (storageKey, publicationId), ou resolver os assets citados do corpo pelo nome e storageKey dentro do workspace em vez de pelo publicationId. Outra saída é criar um vínculo explícito figura→publicação.
- **Verificação:** A storageKey é `<workspace>/<sha>` (local-file-storage-provider.ts:71), e `createAssetWith` devolve o asset existente só por storageKey (prisma-asset-writer.ts:51-55), sem publicationId. Já `loadPublicationAssets` filtra por publicationId (prisma-question-assets.ts:47-60). O código confirma o caminho, mas o cenário exige a mesma figura, byte a byte, em duas publicações do mesmo workspace, e não confirmei que isso acontece no uso.

#### CAP-14

**Descartar um recorte apaga o Asset de crop compartilhado (dedup por hash), e o outro recorte perde a imagem** — baixa (o revisor deu média) · confirmado · `bug` · tarefa **C1**

- **Local:** `apps/web/src/modules/recognition/infrastructure/prisma-capture-queue.ts:104` · também: `apps/web/app/api/assets/crop/route.ts:75`
- **Cenário:** A pessoa salva o mesmo recorte duas vezes (duplo clique, ou uma estimativa repetida) e descarta a cópia: o Asset é apagado, a âncora que ficou passa a ter cropAssetId = null e a fila e a origem da questão perdem a imagem. O arquivo continua órfão no storage.
- **Correção sugerida:** Apagar o Asset só quando nenhuma outra SourceAnchor (nem questão ou nó) o referencia: contar `sourceAnchor.count({ where: { cropAssetId, id: { not: anchorId } } })` dentro da transação.
- **Verificação:** `discardCapture` apaga o Asset CROP pelo id sem contar outras âncoras que o usam (prisma-capture-queue.ts:104-106). A rota de crop reaproveita o asset de conteúdo idêntico via createAsset (app/api/assets/crop/route.ts:75 → prisma-asset-writer.ts:51-55). Baixei para low: o cenário exige duas capturas com bytes idênticos, e recortar de novo recupera a imagem.

#### CAP-15

**Falha num novo reconhecimento apaga a transcrição anterior gravada na âncora** — baixa · confirmado · `bug` · tarefa **B9**

- **Local:** `apps/web/app/api/recognition/route.ts:111` · também: `apps/web/src/modules/recognition/infrastructure/prisma-capture-queue.ts:163`
- **Cenário:** O recorte já foi reconhecido (estado 'revisar'). A pessoa pede para reconhecer de novo, o modelo dá timeout, e o sourceText da âncora vira ''. Depois de recarregar, o item aparece como 'erro' e a transcrição anterior se perdeu.
- **Correção sugerida:** Na falha, gravar só extractionMethod e metadataJson (com o erro) e manter o sourceText. Outra opção é guardar o texto anterior em metadataJson e deixar o estado 'erro' mostrar os dois.
- **Verificação:** No catch de MathRecognitionError (app/api/recognition/route.ts:111-116), a rota chama `recordRecognition` com `latex: ''`, que sobrescreve sourceText sem condição (prisma-capture-queue.ts:67-74). A transcrição anterior da âncora se perde.

#### CAP-16

**Reparentar não reordena: filho posto sob um pai que vem depois é pulado na aprovação ('o item acima dele ainda não foi aprovado')** — baixa · confirmado · `bug` · tarefa **B4**

- **Local:** `apps/web/src/modules/scan/domain/review.ts:248` · também: `apps/web/src/modules/scan/domain/approval-plan.ts:180`
- **Cenário:** Uma figura no alto da página foi atribuída à seção anterior, e a pessoa a move para a seção que começa logo abaixo (sortOrder maior). Com as duas aprovadas juntas, a figura é pulada com um motivo que não é verdade. Numa segunda aprovação ela entra, mas no fim do corpo da seção.
- **Correção sugerida:** Em `reparent`/`addItem`, mover o item (e a subárvore) para logo depois do novo pai quando o sortOrder do pai for maior. Outra opção é o planApproval processar em ordem topológica (pais antes dos filhos) em vez de só por sortOrder.
- **Verificação:** `reparent` só troca parentKey e mantém sortOrder (review.ts:241-249). `planApproval` percorre em ordem de sortOrder (approval-plan.ts:180), e `containerFor` devolve null quando o pai ainda não está em `resolved` (approval-plan.ts:152-162). O item cai em skipped com o motivo 'o item acima dele ainda não foi aprovado'.

#### CAP-17

**Desempate por IA troca o tipo sem conferir os filhos: SECTION vira CONTENT com subseções embaixo** — baixa · confirmado · `bug` · tarefa **B6**

- **Local:** `apps/web/src/modules/scan/application/semantic-review.ts:127`
- **Cenário:** A IA reclassifica uma SECTION duvidosa como CONTENT. As SUBSECTION e CONTENT filhas ficam sob um CONTENT, que não pode contê-las, e na aprovação sobem para o avô sem aviso, desmontando a estrutura. Um CONTENT reclassificado como FIGURE depois da passada de figuras vira um '% figura sem arquivo' e perde o parágrafo.
- **Correção sugerida:** Reaproveitar a verificação de `setKind` (pai e filhos) antes de aceitar a decisão, e excluir FIGURE dos tipos que a IA pode escolher, já que a passada de figuras já rodou.
- **Verificação:** semantic-review.ts:125-127 só confere `profile.kinds` e `canContain(parentKind, decision.kind)`. Não repete a verificação dos filhos que `setKind` faz (review.ts:224-228), e SECTION/SUBSECTION estão em RECLASSIFIABLE (linha 35). A passada de IA roda depois da de figuras (run-scan.ts:209-242), então um FIGURE escolhido pela IA sai sem arquivo.

### Bugs e corretude · Acervo (árvore, questões, livros, avaliações, portabilidade, legado, assets)

**Resumo do revisor.** A regra de concorrência e o isolamento na entrada das rotas de questão estão bem cuidados. Os bugs sérios estão nas bordas entre módulos. (1) A deduplicação de Asset por storageKey devolve uma linha que pertence a outro livro ou a outra questão: excluir um livro apaga o arquivo físico de outro, e figuras não chegam ao render. (2) Várias escritas derivadas movem o `updatedAt` que serve de token de concorrência, o que gera 409 falsos no editor de questão e no de corpo de nó, e neste o "Recarregar" descarta o rascunho. (3) A aresta RESTRICT de AssessmentItem derruba o esvaziamento da lixeira e a exclusão de livro. (4) O gabarito de questões com várias corretas sai errado na prova. (5) O .lbb não faz round-trip dos metadados de asset (nome original, tipo, capa), e as figuras param de compilar depois de um restore.

<details><summary>Cobertura declarada</summary>

Li por inteiro: document-tree (application/mutate-tree, domain/tree-mutations, add-placement, trash-grouping, infrastructure/prisma-document-tree-repository, prisma-global-trash, prisma-node-body, save-node-body); assessments (prng, variant, compose-assessment, prisma-assessment-repository, prisma-candidate-where, cabeçalho do assessment-template); portability (import-workspace, prisma-workspace-source, prisma-workspace-sink, prisma-import-index, portable-migrations, trecho de leitura do portable-archive); assets (prisma-asset-writer, store-asset, register-uploaded-asset, asset-latex-name, asset-kind, edit-node-anchors, parte de prisma-node-anchors); publications (manage-publications, delete/listAssetKeys do repository, prisma-catalog-import, attach-from-catalog); workspaces/prisma-library-repository (delete); legacy-import (prisma-legacy-import-writer, legacy-schema, sqlite-legacy-library-reader, audit); questions (save-question, prisma-question-repository, prisma-validation-writer, prisma-tag-repository, tag-question, prisma-option-writer, parte de mutate-options, prisma-question-search-where, prisma-question-creator); shared/authorization/question-scope. Rotas lidas: nodes (POST, PATCH/DELETE, duplicate, restore, body, render), questions/[questionId] (GET/PATCH), validation, tags, assessments (POST/GET, questions, variants), assets (upload, crop, content), trash (global e por publicação), publications/[id] (PATCH/DELETE), workspaces import/export, search, catalog/attach, from-recognition (parcial). Na UI: node-body-editor (save/conflito), question-editor (save/conflito/insertFigure), QuestionSourcePane, ValidationPane. Schema: relações/onDelete de Asset, DocumentNode, AssessmentItem/Variant e migrations das FKs. Para provar a colisão de sortKey, rodei o fractional-index num script descartável em /tmp/claude-1000. Amostrei: calibre-catalog-provider (só o ISBN via identifiers), portable-schema, prisma-question-assets, prisma-scan-approval e prisma-figure-assets (só para confirmar como o crop e o asset são criados). Não li: map-legacy-library, legacy-mapping, legacy-asset-refs, import-legacy-figures, import-invariants, export-workspace, import-conflicts, build-tree, get-publication-tree, book-overview/prisma-book-overview, shelf-labels, catalog-import/import-from-catalog, as rotas de catalog/import(-batch), libraries/*, workspaces/[id]/tags, questions/[id]/origin e revisions, anchors/[anchorId], options/*, publications/[id]/contents|tree|questions (POST), as telas de bibliotecas/lixeira/avaliacoes/importar/publicacoes/questoes e os app/*.tsx soltos, os plugins de tipo de questão e os testes. Não confirmei no acervo real (proibido) se a coluna `Deleted` existe em `Questao` (achado BUG-ACV-13).

</details>

#### ACV-01

**Excluir um livro apaga do disco o PDF fonte (ou a figura) que outro livro compartilha** — crítica · confirmado · `bug` · tarefa **A3** · **feita** (`c8ef7aa`)

- **Local:** `apps/web/src/modules/publications/application/manage-publications.ts:105` · também: `apps/web/src/modules/publications/infrastructure/prisma-publication-repository.ts:132`, `apps/web/src/modules/assets/infrastructure/prisma-asset-writer.ts:51`, `apps/web/src/modules/publications/infrastructure/prisma-catalog-import.ts:88`
- **Cenário:** Na biblioteca X, o livro A recebe o PDF `fme1.pdf` (asset K, publicationId=A). O livro B (uma duplicata, ou outra edição com o mesmo arquivo) anexa o mesmo PDF pelo Calibre ou pela ingestão: `createAsset` devolve K e `B.sourcePdfAssetId = K`. O usuário exclui A digitando o título. `listAssetKeys(A)` inclui a chave de K, e o arquivo é apagado. B continua com `sourcePdfAssetId = K`, mas `/api/assets/K/content` responde `asset_evicted`. As âncoras e os recortes de B perdem a fonte, que a D29 trata como patrimônio imutável. O mesmo vale para figuras (CROP e QUESTION_IMAGE) compartilhadas entre livros.
- **Correção sugerida:** Antes de apagar do storage, filtrar as chaves que ainda são referenciadas por alguma linha de Asset fora do livro (`asset.count({ where: { storageKey, NOT: { publicationId: id } } })`) ou por `Publication.sourcePdfAssetId`/`coverAssetId` de outro livro. Apagar na mesma transação as linhas de Asset do livro que não são referenciadas por mais ninguém, em vez de deixá-las com `publicationId` nulo. Cobrir com teste: dois livros com o mesmo PDF; excluir um preserva o arquivo do outro.
- **Verificação:** manage-publications.ts:98-105 apaga do storage todas as chaves de listAssetKeys, que filtra só por publicationId (prisma-publication-repository.ts:132). createAssetWith devolve a linha existente pela storageKey (prisma-asset-writer.ts:51-55), e a chave é `${workspaceId}/…/${sha256}` (local-file-storage-provider.ts:71). attachSource aponta B para o asset de A e só avisa `ownedByBook:false` (attach-from-catalog.ts:197). Não há guarda que confira outra referência antes de apagar o arquivo.

#### ACV-02

**Esvaziar a lixeira e excluir livro falham inteiros (500) quando uma questão está numa avaliação** — alta · confirmado · `bug` · tarefa **D1**

- **Local:** `apps/web/src/modules/document-tree/infrastructure/prisma-global-trash.ts:176` · também: `apps/web/src/modules/publications/infrastructure/prisma-publication-repository.ts:164`, `apps/web/prisma/schema.prisma:903`
- **Cenário:** A questão Q está na prova P. O usuário manda Q (ou o capítulo dela) para a lixeira e depois clica em "Esvaziar lixeira". A transação toma P2003 (violação de FK), `toErrorResponse` devolve 500 e **nada** é apagado: nenhum dos outros itens da lixeira sai, e a mensagem não diz por quê. O mesmo acontece ao excluir um livro que tem qualquer questão usada numa prova: a exclusão com confirmação por título quebra com erro genérico.
- **Correção sugerida:** Antes da transação, buscar as questões-alvo que têm `assessmentItems`. Duas saídas: recusar com um erro de domínio que nomeia as provas (409 com lista) ou excluir essas questões do expurgo e informar. Aplicar a mesma regra em `PrismaPublicationRepository.delete` e em `contentsOf`, para o diálogo avisar antes. Corrigir o comentário e decidir o destino dos Assets da questão (apagar linha e arquivo não compartilhado).
- **Verificação:** prisma-global-trash.ts:176 e prisma-publication-repository.ts:164 fazem question.deleteMany sem tratar AssessmentItem, e a FK é ON DELETE RESTRICT (migração 20260810130046_assessments:31, schema.prisma:903). Nem document-tree nem publications consultam assessments. O comentário sobre o cascade dos assets também está errado: assets_questionId_fkey é SET NULL (migração render_job:41).

#### ACV-03

**Marcar âncora ou clicar em "Validar questão" move o updatedAt e o próximo autosave do editor leva 409 falso** — alta · confirmado · `bug` · tarefa **D2**

- **Local:** `apps/web/src/modules/assets/infrastructure/prisma-node-anchors.ts:66` · também: `apps/web/app/api/publications/[id]/questions/[questionId]/validation/route.ts:51`, `apps/web/src/modules/questions/infrastructure/prisma-validation-writer.ts:26`, `apps/web/src/modules/scan/ui/QuestionSourcePane.tsx:82`
- **Cenário:** Com o editor da questão aberto e "Ver fonte" ligado, o usuário desenha uma âncora de continuação no PDF (ou abre a aba Validação e clica em "Validar questão"). Depois digita uma letra no enunciado: o autosave manda o `expectedVersion` antigo, a rota responde 409 "Esta questão mudou desde que você abriu", e o editor trava em `conflict` até ele recarregar. Nenhuma outra pessoa ou processo editou nada.
- **Correção sugerida:** Tratar as duas escritas como estado derivado: gravar `updatedAt` com o valor atual (o mesmo truque do #166) em `writeNodeAnchors` e em `setValidationStatus` quando chamado pela rota de validação (ler o `updatedAt` e passá-lo como `keepVersion`). A outra saída é devolver a versão nova nas respostas e fazer o editor atualizar `version.current`. Teste: após POST de âncora ou de validação, um PATCH com a versão anterior é aceito.
- **Verificação:** writeNodeAnchors faz tx.question.update sem fixar updatedAt (prisma-node-anchors.ts:66-69), e Question.updatedAt é @updatedAt. A rota de validação chama validateAndPersist sem keepVersion (validation/route.ts:51), e com isso setValidationStatus deixa o @updatedAt avançar (prisma-validation-writer.ts:26-45). O editor só atualiza version.current com a resposta do próprio PATCH (question-editor.tsx:357-358), enquanto QuestionSourcePane e ValidationPane são montados dentro dele (question-editor.tsx:812 e 877).

#### ACV-04

**Corpo de nó: renomear ou mover o nó gera 409 no editor do corpo, e "Recarregar" descarta o texto digitado** — alta · confirmado · `bug` · tarefa **D2**

- **Local:** `apps/web/src/modules/document-tree/infrastructure/prisma-node-body.ts:83` · também: `apps/web/src/modules/document-tree/infrastructure/prisma-document-tree-repository.ts:105`, `apps/web/src/modules/document-tree/infrastructure/prisma-document-tree-repository.ts:109`, `apps/web/app/publications/[id]/editor/node-body-editor.tsx:202`
- **Cenário:** O usuário edita o corpo do Capítulo 2 e, com o corpo aberto, renomeia o capítulo na árvore (ou arrasta para reordenar). O próximo autosave recebe 409. O usuário continua digitando: `onChange` guarda o texto, mas não salva em `conflict`. Ao clicar em "Recarregar", tudo o que digitou desde o último salvamento é substituído pelo texto do banco, uma perda silenciosa. E se duas abas salvarem o mesmo corpo ao mesmo tempo, as duas passam na leitura e a segunda sobrescreve a primeira.
- **Correção sugerida:** (a) Condicionar a escrita: `updateMany({ where: { id, updatedAt: expected }, data })` com `count === 0` virando conflito, como na questão. (b) Não deixar operação estrutural (rename, move, âncoras) invalidar o corpo: fixar `updatedAt` nessas escritas ou usar uma coluna de versão própria do corpo. (c) No conflito, recarregar a versão sem descartar o rascunho local (mostrar os dois ou reaplicar o rascunho sobre a versão nova).
- **Verificação:** save-node-body.ts:54 compara com DocumentNode.updatedAt, que rename e move avançam (prisma-document-tree-repository.ts:105-110). A gravação em prisma-node-body.ts:83-87 é um update sem a versão no where, então duas abas podem sobrescrever uma à outra. Ao clicar em 'Recarregar', load() chama apply(), que sobrescreve draft e draftRef com o texto do servidor (node-body-editor.tsx:66-70 e 202).

#### ACV-05

**"Inserir como figura" cita um recorte que nunca vai no bundle de render (crop sem questionId nem publicationId)** — alta · confirmado · `bug` · tarefa **C2**

- **Local:** `apps/web/app/api/assets/crop/route.ts:75` · também: `apps/web/src/modules/rendering/infrastructure/prisma-question-assets.ts:36`, `apps/web/src/modules/assets/infrastructure/prisma-provenance-reader.ts:65`, `apps/web/app/publications/[id]/editor/question-editor.tsx:546`
- **Cenário:** Na ingestão, o usuário recorta a questão do PDF (POST /api/assets/crop) e cria a questão a partir do reconhecimento. No editor, aba Origem, clica em "Inserir como figura": o enunciado ganha `\includegraphics{crop-p12-ab12cd34.png}`. Ao compilar, o bundle vai sem o arquivo e o pdflatex responde `File not found`, a mensagem que a própria #173 diz mandar procurar defeito no texto.
- **Correção sugerida:** Fazer `loadQuestionAssets` incluir os crops das âncoras do nó e da questão (`DocumentNodeAnchor → SourceAnchor.cropAsset`, mais `Question.sourceAnchor.cropAsset`), ou gravar o crop com `publicationId` (e `questionId`, quando vier) na rota de recorte e ampliar o filtro para `OR: [{questionId}, {publicationId}]`. Teste: questão com âncora e crop, enunciado citando `cropLatexName` → o manifest do bundle contém o arquivo.
- **Verificação:** crop/route.ts:75 grava o CROP sem questionId e sem publicationId, e nenhum outro código atualiza essas colunas no Asset: o único asset.updateMany é o do attachSource. loadQuestionAssets filtra por questionId (prisma-question-assets.ts:36), mas o editor insere provenance.cropLatexName (prisma-provenance-reader.ts:65; question-editor.tsx:547-555). O recorte citado nunca entra no bundle.

#### ACV-06

**A deduplicação de Asset devolve a linha de outro dono ou de outro nome, e a figura enviada não compila** — alta · confirmado · `bug` · tarefa **C1**

- **Local:** `apps/web/src/modules/assets/infrastructure/prisma-asset-writer.ts:51` · também: `apps/web/app/api/assets/route.ts:85`, `apps/web/src/modules/scan/infrastructure/prisma-figure-assets.ts:43`
- **Cenário:** (a) A figura `grafico.png` é enviada para a questão Q1. A mesma imagem é enviada para Q2: o upload devolve a linha de Q1 (questionId=Q1), a tela insere `\includegraphics{grafico-1a2b3c4d.png}` em Q2, e `loadQuestionAssets(Q2)` não acha nada, o que dá File not found. (b) A mesma imagem é reenviada com outro nome (`fig.png`): a rota devolve `fig-1a2b3c4d.png`, mas a linha guarda `grafico.png`, e o nome citado nunca casa em `citedAssets`. O mesmo vale para as figuras do scan (`PrismaFigureAssets.put` calcula `latexName` a partir de `input.filename`).
- **Correção sugerida:** Deduplicar o **objeto** no storage, e não a **linha**: a coluna já não é `@unique` (#156). Procurar uma linha existente com o mesmo `storageKey` **e** o mesmo dono (`questionId`/`publicationId`) e o mesmo `originalFilename`, e criar uma linha nova caso contrário. Ou, no mínimo, calcular o `latexName` a partir da linha devolvida e ligar a questão pedida. Corrigir junto com BUG-ACV-01, que tem a mesma causa.
- **Verificação:** createAssetWith devolve a linha existente sem comparar questionId, publicationId nem originalFilename (prisma-asset-writer.ts:51-55). A rota calcula latexName com o record deste upload (assets/route.ts:85), e PrismaFigureAssets.put faz o mesmo com input.filename (prisma-figure-assets.ts:43-50). Já o render casa por assetLatexName(linha gravada), filtrando por questionId ou publicationId (cited-assets.ts; prisma-question-assets.ts:36/52).

#### ACV-07

**Gabarito e versão do professor marcam só a primeira correta em questões de várias corretas** — alta · confirmado · `bug` · tarefa **E2**

- **Local:** `apps/web/src/modules/assessments/infrastructure/prisma-assessment-repository.ts:315` · também: `apps/web/src/modules/assessments/domain/assessment-template.ts:150`, `apps/web/src/modules/assessments/domain/assessment-template.ts:191`, `apps/web/src/modules/assessments/domain/variant.ts:131`
- **Cenário:** A prova recebe uma questão MULTIPLE_CORRECT com as alternativas b e d corretas. Na variante A, depois do embaralhamento, elas viram `a` e `e`. O gabarito impresso diz só `a`, e a versão do professor marca só uma alternativa com [X]. A correção penaliza quem marcou `e`, e é o tipo de defeito que só aparece na sala.
- **Correção sugerida:** Trocar `correctOptionId` por `correctOptionIds: readonly string[]` no conteúdo e em `answerKey` (devolvendo a lista de letras). No template, marcar todas as corretas e, para SUM_OF_CORRECT, imprimir a soma. Até lá, recusar em `composeVariant` (409) uma questão de tipo que o template não sabe corrigir.
- **Verificação:** contentFor usa options.find(isCorrect), que devolve uma única alternativa (prisma-assessment-repository.ts:315). O template marca e rotula só item.correctOptionId (assessment-template.ts:150 e 191). O plugin multiple-correct existe, e candidatesWhere não filtra por tipo (prisma-candidate-where.ts), então essas questões entram na prova.

#### ACV-08

**O round-trip do .lbb perde nome original e tipo das figuras e a capa, e as figuras param de compilar depois do restore** — alta · confirmado · `bug` · tarefa **G1**

- **Local:** `apps/web/src/modules/portability/infrastructure/prisma-workspace-sink.ts:238` · também: `apps/web/src/modules/portability/infrastructure/prisma-workspace-source.ts:133`, `apps/web/src/modules/portability/infrastructure/prisma-workspace-source.ts:186`, `apps/web/src/modules/portability/domain/portable-schema.ts:166`
- **Cenário:** Exporta-se a biblioteca FME (questões do legado com `\includegraphics{fig3-9f8e7d6c.png}`) e importa-se o .lbb como backup em outra máquina. As linhas de Asset voltam sem `originalFilename`, então `assetLatexName` passa a dar `figura-9f8e7d6c.png`, `citedAssets` não casa com o enunciado e toda questão com figura dá File not found. As capas importadas do Calibre também somem. Mime fora da tabela (webp, eps, ggb) volta como `application/octet-stream`, o que também muda a extensão do nome.
- **Correção sugerida:** Subir o formato para v3: cada asset da questão viaja como `{ sha256, kind, mimeType, originalFilename }`, e a publicação leva `coverAsset`. Escrever o migrador v2→v3 (asset só com hash → `kind: ATTACHMENT`, `originalFilename: null`) e fazer o sink gravar kind, nome e capa. Estender o teste de round-trip para afirmar que o `assetLatexName` de cada figura é igual antes e depois.
- **Verificação:** O sink recria o asset da questão como kind ATTACHMENT sem originalFilename (prisma-workspace-sink.ts:234-243). O export fixa coverAssetSha256: null (prisma-workspace-source.ts:186), e o portable leva só o hash (portable-schema.ts:166). assetLatexName usa slug(originalFilename ?? 'figura') (asset-latex-name.ts), enquanto o legado grava o nome real (legacy-figures.ts:75; prisma-legacy-import-writer.ts:208). Depois do round-trip o nome citado deixa de casar.

#### ACV-09

**Restaurar da lixeira devolve a sortKey antiga, que pode colidir com um irmão novo, e a árvore passa a recusar inserções ali (500)** — média · confirmado · `bug` · tarefa **D3**

- **Local:** `apps/web/src/modules/document-tree/application/mutate-tree.ts:164` · também: `apps/web/src/modules/document-tree/infrastructure/prisma-document-tree-repository.ts:122`, `apps/web/src/modules/document-tree/domain/tree-mutations.ts:158`
- **Cenário:** Irmãos a0, a1(X), a2. O usuário exclui X, cria uma seção "depois de a0" (ela recebe a1) e restaura X pela lixeira. Agora dois irmãos têm sortKey a1, e a ordem entre eles depende do banco. Qualquer "inserir depois" do primeiro, mover para entre os dois ou duplicar para ali chama `generateKeyBetween(a1, a1)` e responde 500.
- **Correção sugerida:** Em `restoreNode`, ler os irmãos vivos do pai e, se a chave do nó raiz restaurado colidir, recalcular com `generateKeyBetween(chave, próximaChave)` (os descendentes mantêm as suas). Mapear `InvalidSortKeyError` para 409 em `toErrorResponse` e, como defesa, fazer `siblingsOf` desempatar por id.
- **Verificação:** restoreMany só zera deletedAt (prisma-document-tree-repository.ts:128-133), e restoreNode não recalcula a sortKey (mutate-tree.ts:164). generateKeyBetween lança InvalidSortKeyError quando before >= after (fractional-index.ts:205-206), e resolvePlacement usa as chaves dos irmãos (tree-mutations.ts:155-160). toErrorResponse não mapeia esse erro (tree-http.ts:92-98).

#### ACV-10

**Questão na lixeira continua sendo impressa na prova, e a API aceita acrescentá-la** — média · confirmado · `bug` · tarefa **E3**

- **Local:** `apps/web/src/modules/assessments/infrastructure/prisma-assessment-repository.ts:155` · também: `apps/web/src/modules/assessments/infrastructure/prisma-assessment-repository.ts:293`, `apps/web/app/api/assessments/[assessmentId]/variants/route.ts:66`
- **Cenário:** A questão Q está na prova P. O usuário exclui Q da árvore (vai para a lixeira) e gera a variante B de P: Q sai impressa, no gabarito e na versão do professor. Somado a BUG-ACV-02, a lixeira também não esvazia enquanto Q estiver em P. Por API (ou numa aba aberta antes da exclusão), POST /api/assessments/:id/questions com o id de Q devolve 201.
- **Correção sugerida:** Em `addQuestion`, usar `nodes: { some: { questionId, deletedAt: null } }`. Em `composeVariant`, recusar ou avisar (409, com a lista) quando algum item aponta para questão cujo nó está na lixeira, e mostrar esse estado na tela da avaliação.
- **Verificação:** addQuestion confere o escopo com `nodes: { some: { questionId } }`, sem deletedAt (prisma-assessment-repository.ts:155), e contentFor não filtra a lixeira (linhas 293-318). Em todo o módulo assessments, só candidatesWhere filtra deletedAt (prisma-candidate-where.ts:29).

#### ACV-11

**A simulação de import .lbb aponta colisões falsas: o índice de legacyId é global, não por biblioteca** — média · confirmado · `bug` · tarefa **G3**

- **Local:** `apps/web/src/modules/portability/infrastructure/prisma-import-index.ts:53` · também: `apps/web/src/modules/portability/application/import-workspace.ts:92`
- **Cenário:** Com 11 bibliotecas legadas no banco, o usuário faz o dry-run do .lbb de uma biblioteca nova, também de origem legada. As questões com IdQuestao 1..N colidem com questões de bibliotecas **sem relação nenhuma**, e a tela lista centenas de "conflitos" com títulos de outros livros. A decisão que o §7 pede ("colisão gera relatório e exige decisão") fica sem sentido, e a pessoa aprende a ignorar o relatório.
- **Correção sugerida:** Colidir questão por `legacyId` só dentro da publicação que colidiu (a chave natural é `(publicationId, legacyId)`), ou só quando a publicação de destino também colidiu por `legacyUuid`/ISBN. Publicação por `legacyId` só vale quando o `Workspace.legacyId` de origem é o mesmo. `legacyUuid` e ISBN continuam globais.
- **Verificação:** readExistingIndex monta questionsByLegacyId com todas as questões do banco (prisma-import-index.ts:35-56), e toRuntime colide só por legacyId (import-workspace.ts:150). O próprio prisma-legacy-import-writer.ts:58-61 registra que a numeração IdQuestao recomeça em 1 em cada biblioteca e que o ExistingIndex não tem escopo de workspace.

#### ACV-12

**Recorte e upload aceitam publicationId e questionId de outra biblioteca, sem conferir com o workspace do arquivo** — média · confirmado · `bug` · tarefa **C3**

- **Local:** `apps/web/app/api/assets/crop/route.ts:77` · também: `apps/web/app/api/assets/crop/route.ts:89`, `apps/web/app/api/assets/route.ts:71`
- **Cenário:** Uma aba antiga (ou um cliente de agente) manda `workspaceId=A` e `publicationId` de um livro da biblioteca B. O PDF vira a fonte do livro de B, mas o arquivo e a linha de Asset pertencem a A. Ao excluir a biblioteca A (`listAssetKeys` por workspace mais o cascade de Asset), o livro de B perde a fonte. No recorte, uma âncora da publicação de B aponta para um PDF de A, e a exportação de B leva um arquivo de outra biblioteca.
- **Correção sugerida:** Nas duas rotas, resolver o dono a partir do servidor: para o crop, exigir `publication.workspaceId === source.workspaceId` e usar `resolveQuestionScope(publicationId, questionId)` antes de `attachAnchorToQuestion`. Para o upload, derivar `workspaceId` da publicação quando ela vier, ou recusar a divergência com 400.
- **Verificação:** crop/route.ts:77-89 manda o publicationId e o questionId do formulário direto para createAnchor e attachAnchorToQuestion, sem conferir contra source.workspaceId nem usar resolveQuestionScope. Em assets/route.ts:37-71, workspaceId e publicationId vêm do form sem checagem cruzada, e PrismaAssetWriter.write faz updateMany só por id e sourcePdfAssetId (prisma-asset-writer.ts:97-100). Como o app é local, o gatilho exige um cliente divergente, por isso a severidade fica em medium.

#### ACV-13

**Import legado ignora a coluna `Deleted`: nós excluídos no legado entram vivos (a confirmar contra o schema real)** — baixa (o revisor deu média) · plausível · `bug` · tarefa **G4**

- **Local:** `apps/web/src/modules/legacy-import/domain/legacy-schema.ts:140` · também: `apps/web/src/modules/legacy-import/infrastructure/prisma-legacy-import-writer.ts:218`
- **Cenário:** Se `Questao.Deleted` existir e tiver linhas marcadas (o planejamento a lista como coluna real), as questões e capítulos que o autor apagou no KnowChico reaparecem vivos na árvore, na busca, nas contagens e nas candidatas de prova, sem nenhuma indicação no relatório do import.
- **Correção sugerida:** Confirmar com `PRAGMA table_info(Questao)` numa cópia do acervo. Se a coluna existir: selecioná-la de forma condicional (como `hasBanca`), levar `deletedAt` para o runtime e gravar `deletedAt` no writer. Se não existir: registrar a decisão em `DELIBERATELY_IGNORED_COLUMNS` e corrigir o §6.
- **Verificação:** A lacuna existe: `Deleted` está em Questao de todas as bibliotecas reais (PRAGMA table_info em /mnt/bak/KnowChico/*), mas não aparece em questionColumnsFor nem em DELIBERATELY_IGNORED_COLUMNS (legacy-schema.ts:95-153). Porém `SELECT Deleted, count(*)` dá 0 em todas as linhas de todas as bibliotecas legíveis, então o cenário de nós excluídos voltando vivos não acontece com o acervo real. O que sobra é registrar a decisão e corrigir o §6.

#### ACV-14

**Restaurar um capítulo ressuscita questões que o usuário tinha excluído antes, à parte** — baixa · plausível · `bug` · tarefa **D3**

- **Local:** `apps/web/src/modules/document-tree/application/mutate-tree.ts:147` · também: `apps/web/src/modules/document-tree/domain/trash-grouping.ts:61`
- **Cenário:** O usuário exclui a questão 7 do Capítulo 2 (erro de digitação) e, dias depois, exclui o Capítulo 2 inteiro. Ao restaurar o capítulo, a questão 7 também volta, e o diálogo disse que o capítulo "levou" a 7.
- **Correção sugerida:** Restaurar só a descendência com o mesmo `deletedAt` da raiz (a exclusão em lote grava um único `new Date()`), e deixar os filhos excluídos antes como atos próprios na lixeira. Ajustar `agruparLixeira` para o mesmo critério e corrigir o comentário.
- **Verificação:** restoreNode percorre toda a descendência que está na lixeira (mutate-tree.ts:147-162), e o comentário das linhas 145-146 não bate com isso. Só que trash-grouping.ts:49-57 documenta de propósito que o filho cujo pai foi excluído depois entra no ato do pai ('Está certo'), para não restaurá-lo sob um pai invisível. É uma escolha de UX defensável, com o comentário enganoso.

#### ACV-15

**Seed de variante fora de Int32 passa pela validação e estoura no Prisma (500)** — baixa · confirmado · `bug` · tarefa **E3**

- **Local:** `apps/web/app/api/assessments/[assessmentId]/variants/route.ts:44` · também: `apps/web/src/modules/assessments/ui/AssessmentBuilder.tsx:122`
- **Cenário:** O professor digita a seed 3000000000 (ou um número de matrícula longo). A variante é composta, e `saveVariant` falha na validação de Int do Prisma: a resposta é 500 genérico, e a prova não é gravada.
- **Correção sugerida:** Validar `0 <= seed <= 2147483647` na rota com 400 e mensagem clara, ou normalizar para `seed >>> 0` e guardar em coluna que caiba (BigInt), gravando a seed efetivamente usada.
- **Verificação:** variants/route.ts:44-48 só exige Number.isInteger, e AssessmentVariant.seed é Int no schema. O Prisma recusa um valor acima de 2^31-1 no saveVariant (linha 69) com erro de validação, que vira 500 genérico. A tela manda Number(seed) de um campo livre (AssessmentBuilder.tsx:122).

### Bugs e corretude · Plataforma (agente, render, preview, infraestrutura, serviços, scripts)

**Resumo do revisor.** A fatia tem proteções boas, como execFile com vetor de argumentos, -no-shell-escape, whitelist Zod no patch e revisão gravada na mesma transação. Mesmo assim achei bugs concretos. Um é crítico: excluir um livro apaga do storage arquivos que outros livros do mesmo workspace ainda usam, porque o storage deduplica pelo hash do conteúdo. Há dois bugs altos no agente: com OpenAI ou OpenRouter, a segunda chamada de todo turno com ferramentas falha, e o render de candidato dá "não compilou" em qualquer questão com figura. No render, o cache grava para sempre falhas que não vêm do documento (timeout, erro do worker) e usa como chave a versão do renderer lida do lado errado. Os demais são de concorrência e atomicidade: P2002 em dois renders iguais, escrita não atômica no storage e no cache de formato, colisão de jobId do candidato, revert e reorder que não restauram o que prometem, e aprovação de patch que sobrescreve uma edição concorrente.

<details><summary>Cobertura declarada</summary>

Li por inteiro: services/renderer/src/{compile,jobs,server,format-cache,diagnostics,auth}.ts; packages/render-contract/src/validate-bundle.ts e parte de render-bundle.ts; apps/web/src/modules/rendering/{application/execute-render, domain/render-job, domain/content-hash, domain/coalescer, domain/cited-assets, infrastructure/render-worker-executor, infrastructure/prisma-render-job-repository, infrastructure/prisma-question-assets, ui/use-render}.ts; shared/ports/{render-executor,storage-provider,ai-provider}.ts; infrastructure/storage/local/local-file-storage-provider.ts; infrastructure/agent/{prisma-patch-applier,prisma-revision-reader}.ts; modules/agents/{application/apply-question-patch, application/run-agent-turn, application/render-candidate (linhas 40-146), domain/apply-patch, domain/question-patch, domain/patch-diff (linhas 60-194), infrastructure/openai-compatible-provider}.ts; app/api/agents/{ask,patches/apply,patches/revert}/route.ts; app/api/render-jobs/[jobId]/artifacts/[name]/route.ts; app/api/infra/route.ts; as duas rotas de render de publications (questão e nó); modules/diagnostics/{application/collect-diagnostics, infrastructure/host-tex}.ts; shared/config/env.ts; infrastructure/database/sqlite/client.ts; services/backup/src/*; docker-compose.yml; scripts/env-file.mjs; apps/web/scripts/{backfill-legacy-assets,delete-orphan-questions,import-latex-knowledge}.ts. Também li, fora da fatia, o necessário para confirmar os achados: manage-publications.ts, prisma-publication-repository.ts (listAssetKeys/delete), schema.prisma (Asset, RenderJob, QuestionOption, Revision), asset-latex-name.ts e o trecho createNode de prisma-scan-approval.ts. Só amostrei: preview/domain/parse-latex-preview.ts (primeiras 200 linhas), preview/infrastructure/mathjax.ts, latex-profile.ts (perfis), ai-profile.ts (capacidades), app/api/ai/test/route.ts, os cabeçalhos dos outros scripts de apps/web/scripts e o grep de dry-run neles. Não li: módulos latex/ e latex-knowledge/ (UI, domínio e o leitor legado além do modo de abertura), preview/ui, rendering/ui/RenderPanel.tsx, agents/ui, build-agent-tools/build-propose-tools, prisma-agent-read-port, Dockerfile do renderer, scripts/setup.mjs e instalar-ambiente.sh, next.config.ts, mise.toml, layout.tsx, app-shell.tsx, infra-status.tsx e diagnostico/. Não executei nada: todos os cenários vêm de leitura do código, e o do OpenAI se apoia no contrato conhecido da API de chat completions.

</details>

#### PLT-01

**Excluir um livro apaga arquivos do storage que outros livros do mesmo workspace ainda usam** — crítica · confirmado · `bug` · tarefa **A3** · **feita** (`c8ef7aa`)

- **Local:** `apps/web/src/modules/publications/application/manage-publications.ts:105` · também: `apps/web/src/modules/publications/infrastructure/prisma-publication-repository.ts:132`, `apps/web/src/infrastructure/storage/local/local-file-storage-provider.ts:71`
- **Regra ou spec:** D29 (fonte imutável/preservada); dedup por hash declarada em local-file-storage-provider.ts
- **Cenário:** O usuário sobe o mesmo PDF do ENEM 2023 em dois livros do mesmo workspace: "ENEM 2023 (teste)", para ensaiar o scan, e "ENEM 2023". As figuras recortadas também saem idênticas nos dois. Ao excluir o livro de teste, `storage.delete` remove workspace/ab/abcd….pdf e os PNGs das figuras. O livro real continua com as linhas de Asset, mas os bytes somem: o PDF de origem não abre, e o render das questões e do corpo passa a falhar com "File not found". É perda silenciosa de dados do acervo.
- **Correção sugerida:** Antes de apagar cada chave, contar as referências restantes depois da exclusão (`prisma.asset.count({ where: { storageKey } })`) e só apagar quando der zero. O ideal é fazer isso num coletor de órfãos separado, por varredura, em vez de apagar inline. Incluir um teste com dois livros que compartilham o mesmo conteúdo.
- **Verificação:** O cenário é pior do que o achado descreve. createAssetWith (prisma-asset-writer.ts:51) procura só por storageKey e devolve a linha que já existe, então o livro B sobe o mesmo PDF e passa a apontar para o Asset cujo publicationId é o do livro A. deletePublication (manage-publications.ts:98-105) lista as chaves pelo publicationId de A e apaga os bytes; as linhas de Asset sobrevivem com SetNull e o livro B fica com sourcePdfAssetId apontando para um arquivo que não existe mais.

#### PLT-02

**O histórico do turno perde os `tool_calls` do assistente e a 2ª chamada com ferramentas falha no OpenAI e no OpenRouter** — alta · confirmado · `bug` · tarefa **F1**

- **Local:** `apps/web/src/modules/agents/application/run-agent-turn.ts:240` · também: `apps/web/src/modules/agents/infrastructure/openai-compatible-provider.ts:67`, `apps/web/src/shared/ports/ai-provider.ts:52`
- **Regra ou spec:** D3 (um provider OpenAI-compatible para OpenRouter/OpenAI/Ollama)
- **Cenário:** Com AI_BASE_URL=https://openrouter.ai/api/v1 (o padrão da D3) ou https://api.openai.com/v1, qualquer pergunta em que o modelo chame `read_question` recebe na 2ª iteração HTTP 400 ("messages with role 'tool' must be a response to a preceding message with 'tool_calls'"). O turno termina como FAILED e o usuário não recebe resposta. No Ollama passa, porque ele é tolerante, e por isso a verificação manual não pegou.
- **Correção sugerida:** Estender AiMessage do assistente com `toolCalls?: readonly AiToolCall[]`. Em run-agent-turn, empurrar `{ role: "assistant", content: result.text, toolCalls: result.toolCalls }`. Em toWire, emitir `tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(input) } }]` e `content: text || null`. Acrescentar um teste de contrato que confira a mensagem do assistente no corpo enviado.
- **Verificação:** run-agent-turn.ts:240 empurra só `{ role: "assistant", content }`, e o tipo AiMessage (ai-provider.ts:52) não tem onde guardar as chamadas. toWire (openai-compatible-provider.ts:67) nunca preenche `tool_calls`, apesar de o campo estar declarado em WireMessage. Assim, as mensagens `role: tool` vão sem a chamada correspondente, o que a API da OpenAI recusa com 400, e o perfil TEXT_ONLY (ai-profile.ts:52) liga toolCalling por padrão.

#### PLT-03

**Falha que não vem do documento (timeout, erro do worker, disco cheio) vira cache permanente por contentHash** — alta · confirmado · `bug` · tarefa **F4**

- **Local:** `apps/web/src/modules/rendering/application/execute-render.ts:78` · também: `apps/web/src/modules/rendering/infrastructure/render-worker-executor.ts:132`, `services/renderer/src/server.ts:189`, `apps/web/app/api/render-jobs/[jobId]/artifacts/[name]/route.ts:58`
- **Regra ou spec:** content-hash.ts: "Uma chave incompleta ... serve o PDF antigo silenciosamente"; critério §42 (erro nunca escondido)
- **Cenário:** (1) O worker acabou de subir e o 1º render de uma questão pesada em pgfplots coincide com a construção do formato (2,3 s) e com outros renders em paralelo, e passa de 30 s. O job FAILED é gravado, e toda compilação futura daquele mesmo LaTeX devolve "A compilação passou de 30000 ms" instantaneamente, com cacheHit, para sempre. (2) O /tmp de 512 MB do contêiner enche (ENOSPC no writeFile), o worker responde 422 e o erro fica cacheado. (3) Na rota de artefato, a mensagem "O artefato foi descartado do storage. Recompile para gerá-lo de novo" é impossível de seguir, porque recompilar dá cache hit no mesmo job.
- **Correção sugerida:** Só cachear FAILED quando a falha for do documento: pdflatex rodou até o fim, sem timeout e sem erro de worker. Para isso, marcar no RenderResult um `failureKind: "document" | "timeout" | "worker"`, ou não persistir o resultado de 422. Na busca por cache, ignorar job cujo artefato não existe mais no storage. Oferecer `force: true` na rota.
- **Verificação:** execute-render.ts:78 devolve qualquer job que achar em cache, inclusive FAILED. O timeout vira success:false com a mensagem "passou de N ms" (compile.ts:240), e o erro do worker vira 422 aceito como resposta válida (render-worker-executor.ts:132, server.ts:201-220). Nenhum código apaga RenderJob fora do cliente gerado, então a falha transitória fica permanente e o conselho "Recompile" da rota de artefato dá cache hit no mesmo job.

#### PLT-04

**`render_candidate_latex` compila sem as figuras e diz ao agente que toda questão com `\includegraphics` não compila** — alta · confirmado · `bug` · tarefa **F2**

- **Local:** `apps/web/src/modules/agents/application/render-candidate.ts:96` · também: `apps/web/app/api/agents/ask/route.ts:111`
- **Regra ou spec:** spec §35 (agente testa antes de propor); D58
- **Cenário:** No modo FIX_LATEX, numa questão do ENEM com figura, o agente testa o candidato e recebe "**Não** compilou ... File `figura-1-1-ab12cd34.png' not found". A reação natural do modelo é propor remover ou renomear o `\includegraphics`, ou gastar as 3 tentativas perseguindo um erro que não existe. O usuário vê a proposta de "correção" apagando a figura.
- **Correção sugerida:** Reusar `loadQuestionAssets(questionId, bundleSemAssets.sourceLatex, storage)` como as rotas de render fazem, e passar manifesto e bytes. Se o custo preocupar, cachear os bytes por turno, já que o limite é de 3 renders. Como alternativa mínima, compilar com `\usepackage[draft]{graphicx}` no candidato.
- **Verificação:** render-candidate.ts:96 chama `executor.render(bundle, new Map())` sem assets, e o worker compila com `-halt-on-error` (compile.ts:221). Nada no worker trata figura ausente, nem com modo draft nem com fallback. Por isso toda questão com `\includegraphics` volta como "Não compilou" no ciclo do FIX_LATEX, e o prompt desse modo (agent-mode.ts:108) manda o modelo confirmar e corrigir o erro.

#### PLT-05

**A versão do renderer no hash de cache vem do env da app, não da imagem que compilou** — média · plausível · `bug` · tarefa **F4**

- **Local:** `apps/web/app/api/publications/[id]/questions/[questionId]/render/route.ts:126` · também: `apps/web/app/api/publications/[id]/nodes/[nodeId]/render/route.ts:91`, `docker-compose.yml:41`, `apps/web/src/modules/rendering/application/execute-render.ts:207`
- **Cenário:** Uma questão falha com "File `tkz-euclide.sty' not found" e o usuário acrescenta o pacote no Dockerfile e roda `docker compose build`. Ninguém muda RENDERER_VERSION, o hash não muda, e a questão continua devolvendo a falha antiga do cache. O mesmo vale para PDFs velhos depois de trocar o TeX Live ou as fontes.
- **Correção sugerida:** Derivar a versão da imagem no build (ARG com o digest ou o hash do Dockerfile, exposto em /health) e usar no hash a versão que o worker reporta, lida de /health e cacheada por processo. Remover o fallback "0.0.0-dev" silencioso ou avisar no /diagnostico quando app e worker divergirem.
- **Verificação:** As duas rotas (questions/.../render/route.ts:126 e nodes/.../render/route.ts:91) leem RENDERER_VERSION do env da app, e o worker lê a sua (server.ts:236). O mecanismo documentado é subir a variável à mão (.env.example:51, "subir a imagem com um TeX Live novo precisa invalidar"), então o risco vem de depender de disciplina humana, e não de um defeito fechado. Esquecer o bump serve falha ou PDF antigo do cache.

#### PLT-06

**Aprovar um patch sobrescreve uma edição concorrente do mesmo campo sem marcar como `stale`** — média · confirmado · `bug` · tarefa **F3**

- **Local:** `apps/web/src/modules/agents/domain/apply-patch.ts:62` · também: `apps/web/src/modules/agents/domain/patch-diff.ts:70`, `apps/web/src/modules/agents/application/apply-question-patch.ts:85`
- **Regra ou spec:** spec §35 · issue #101 (aprovação explícita sobre o estado corrente)
- **Cenário:** O agente propõe o enunciado X sobre o estado S0. Com o painel de revisão aberto, o usuário corrige uma vírgula no editor e o autosave grava S1. Depois ele aprova `field:statementLatex`. Como diff(S1, X) ainda contém `field:statementLatex`, o servidor grava X, a correção de S1 some e a resposta traz `stale: []`. Dá para reverter pela Revision, mas ninguém é avisado.
- **Correção sugerida:** Incluir no id da mudança um hash curto do `before`, por exemplo `field:statementLatex:<sha8(before)>`, e o mesmo para as alternativas. Assim, qualquer mudança no estado entre a proposta e a aprovação torna o id stale.
- **Verificação:** O id da mudança é só `field:${entry.field}` (patch-diff.ts:70). planApply (apply-patch.ts:62-66) marca stale apenas os ids que sumiram do diff, e nem a rota de apply nem applyQuestionPatch conferem updatedAt ou a versão base. Uma edição feita entre a proposta e a aprovação é sobrescrita e a resposta vem com `stale: []`, ao contrário do que o docstring promete.

#### PLT-07

**O revert não restaura alternativas apagadas nem remove as criadas depois, e o gabarito pode sumir** — média · confirmado · `bug` · tarefa **F3**

- **Local:** `apps/web/src/modules/agents/application/apply-question-patch.ts:153` · também: `apps/web/src/infrastructure/agent/prisma-patch-applier.ts:114`
- **Cenário:** A revisão 3 tem as alternativas A–E, com C correta. Depois o usuário apaga C no editor e acrescenta F. Ao reverter para a 3, C não volta (o updateMany não acha nada), F continua, e a resposta diz `revertedTo: 3` com sucesso. A questão fica sem nenhuma alternativa correta e com uma alternativa que nunca existiu naquela revisão. Isso contradiz o docstring de snapshotOf: "Restaurar a partir de um 'antes' incompleto devolveria uma questão que nunca existiu".
- **Correção sugerida:** No revert, sincronizar o conjunto: apagar as alternativas cujo id não está no snapshot, recriar com o mesmo id as que faltam e só então reordenar. Outra opção é recusar o revert com 409 quando o conjunto de ids diverge.
- **Verificação:** revertQuestion (apply-question-patch.ts:153-164) só chama applyOptions e applyReorder, e os dois fazem updateMany por id (prisma-patch-applier.ts:114-151): uma alternativa apagada, cujo delete é físico em prisma-option-writer.ts:56, não volta, e uma criada depois continua. Quando a correta do snapshot foi apagada, o updateMany que desmarca as outras (linha 131) ainda roda e a questão fica sem gabarito.

#### PLT-08

**Um `reorder` parcial ou com ids velhos gera sortKey duplicada e a letra do gabarito fica indeterminada** — média · confirmado · `bug` · tarefa **F3**

- **Local:** `apps/web/src/modules/agents/domain/patch-diff.ts:114` · também: `apps/web/src/infrastructure/agent/prisma-patch-applier.ts:141`, `apps/web/src/modules/agents/domain/question-patch.ts:97`
- **Cenário:** As alternativas são A=a0, B=a1, C=a2, D=a3, E=a4. O agente propõe reorder [C, A] e esquece o resto. O usuário aprova "Ordem das alternativas". Ficam C=a0 e A=a1, mas B continua em a1: A e B empatam, e o ORDER BY sortKey fica indefinido. A letra de A e B (e do gabarito, se um deles for o correto) pode trocar entre leituras e na prova impressa.
- **Correção sugerida:** Validar em diffPatch ou planApply que `proposed` é exatamente uma permutação de `current`, com os mesmos ids e o mesmo tamanho. Se não for, omitir a mudança ou recusar com PatchRejectedError e uma mensagem para o modelo.
- **Verificação:** O schema (question-patch.ts:94-96 e 133-134) exige só min(2) e ids sem repetição, e diffPatch (patch-diff.ts:114) nunca confere se a proposta é uma permutação das alternativas atuais. applyReorder (prisma-patch-applier.ts:141-151) usa rebalanceKeys(n) = generateNKeysBetween(null,null,n) apenas nos ids enviados, o que gera a0, a1… e colide com as chaves que as outras alternativas mantêm. QuestionOption tem apenas um @@index, sem unique.

#### PLT-09

**Dois renders do mesmo conteúdo em paralelo dão violação de unique (P2002) e a tela mostra HTTP 500** — média · confirmado · `bug` · tarefa **F4**

- **Local:** `apps/web/src/modules/rendering/infrastructure/prisma-render-job-repository.ts:131` · também: `apps/web/src/modules/rendering/application/execute-render.ts:132`
- **Cenário:** O usuário aperta Ctrl+Enter duas vezes sem editar. O coalescer aborta o 1º fetch, mas o handler do servidor continua (o DELETE chega com 409, porque o worker já terminou em ~0,5 s) e grava o job. O 2º pedido não achou o cache, compilou e bate no unique: 500. Como o 2º é o pedido que vale, a tela mostra "Falha ao compilar (HTTP 500)" para um documento que compilou. Os arquivos do 2º ficam órfãos no storage. O mesmo acontece com duas abas abertas na mesma questão.
- **Correção sugerida:** No `create`, capturar P2002 e devolver `findByContentHash` (o vencedor da corrida), ou usar `upsert` pela chave única. Opcionalmente, deduplicar em memória por contentHash as compilações em voo.
- **Verificação:** executeRender faz check-then-act: findByContentHash na linha 77 e jobs.create na linha 132. PrismaRenderJobRepository.create (prisma-render-job-repository.ts:130) não trata P2002 contra @@unique([workspaceId, contentHash]) (schema.prisma:758), e não há tratamento de P2002 em nenhum lugar de src/app. toErrorResponse (tree-http.ts:101) relança o erro, e duas abas compilando o mesmo conteúdo dão 500.

#### PLT-10

**`put` grava o arquivo sem atomicidade e "já existe" pula a escrita, então um arquivo truncado fica permanente** — média · confirmado · `bug` · tarefa **A3** · **feita** (`c8ef7aa`)

- **Local:** `apps/web/src/infrastructure/storage/local/local-file-storage-provider.ts:79` · também: `apps/web/src/modules/rendering/application/execute-render.ts:113`
- **Cenário:** (1) O dev server é reiniciado ou o disco enche no meio da gravação de um PDF fonte de 40 MB: sobra um arquivo truncado. Toda gravação futura do mesmo conteúdo vê que ele existe e pula, e o Asset é criado com um sha256 correto apontando para bytes corrompidos, para sempre. (2) Dois `put` concorrentes do mesmo conteúdo: B vê o arquivo que A ainda está escrevendo, devolve a chave, e quem lê em seguida recebe os bytes pela metade.
- **Correção sugerida:** Gravar em `${absolute}.tmp-${uuid}`, fazer fsync e renomear para o caminho final (rename é atômico no mesmo FS). No caminho do "já existe", conferir pelo menos o tamanho (`stat.size === content.byteLength`) e regravar se divergir.
- **Verificação:** local-file-storage-provider.ts:79-81 grava direto no caminho final com writeFile, sem arquivo temporário e sem rename, e pula a escrita quando o arquivo já existe, sem conferir o tamanho. O sha256 devolvido vem da entrada e não do disco. Um arquivo truncado por crash ou por disco cheio fica permanente e é aceito como válido, e dois puts concorrentes podem expor bytes parciais.

#### PLT-11

**O cache de formato publica o `.fmt` sem atomicidade: um job concorrente pode usar o formato pela metade, e um formato corrompido envenena o perfil até o contêiner reiniciar** — média · plausível · `bug` · tarefa **F5**

- **Local:** `services/renderer/src/format-cache.ts:100` · também: `services/renderer/src/format-cache.ts:129`, `services/renderer/src/format-cache.ts:154`
- **Cenário:** (1) O job A está no \dump do formato (alguns MB). O job B do mesmo perfil chega nesse instante, vê o arquivo existir e compila com `-fmt` sobre um formato truncado: "Fatal format file error", sem PDF, e a falha fica cacheada no banco (ver BUG-RND-01). (2) O -ini é morto pelo timeout durante o dump, ou o preâmbulo tem erro e o nonstopmode faz o dump mesmo assim. O `.fmt` inválido fica em /tmp/lbb-formats e todo render daquele perfil falha até reiniciar o contêiner.
- **Correção sugerida:** Checar `building` antes do `exists`. Gerar o formato no diretório de trabalho (`-output-directory work`) e, com sucesso (código 0 e sem `!` no log), mover com `rename` para FORMATS_DIR. Se uma compilação com `-fmt` falhar com erro de formato, apagar o `.fmt` e cair para a compilação sem formato.
- **Verificação:** format-cache.ts:100 testa `exists(.fmt)` antes de olhar `building`, e buildFormat (linhas 129-154) roda `-ini` com `-output-directory FORMATS_DIR`, escrevendo direto no diretório compartilhado. A validação final é só a existência do arquivo. Os dois cenários (job concorrente dentro da janela do \dump, timeout no meio do dump) são reais pela estrutura do código, mas a janela é pequena e não foi reproduzida.

#### PLT-12

**O jobId `candidate-N` se repete entre turnos e colide no JobStore do worker** — baixa (o revisor deu média) · plausível · `bug` · tarefa **F5**

- **Local:** `apps/web/src/modules/agents/application/render-candidate.ts:86` · também: `services/renderer/src/jobs.ts:45`, `apps/web/src/modules/rendering/infrastructure/render-worker-executor.ts:70`
- **Cenário:** Dois turnos do agente em paralelo (duas abas, ou duas questões em FIX_LATEX) mandam `candidate-1`. O turno A recebe o status e começa a baixar main.pdf e page-1.png, mas nesse meio-tempo o POST de B termina e `complete` troca os artefatos da entrada. A baixa os bytes de B, o tamanho não bate com o descritor, `render` lança "Artefato veio com X bytes" e a tool devolve erro ao modelo. Se B chegar enquanto A compila, B sobrescreve o registro e o `register`, e um cancelamento de A passaria a matar B.
- **Correção sugerida:** Usar `candidate-${crypto.randomUUID()}`. Como o candidato só usa os diagnósticos, dá também para evitar baixar os artefatos (um flag no executor ou uma rota de status só).
- **Verificação:** render-candidate.ts:86 usa `candidate-${used}` com um contador por turno, e JobStore.enqueue (jobs.ts:45) sobrescreve a entrada com o mesmo jobId. O executor baixa os artefatos por jobId depois do POST (render-worker-executor.ts:70). O diretório de trabalho usa mkdtemp (compile.ts:170), então a colisão fica só no store, e ela exige dois turnos de agente simultâneos no mesmo índice, o que é raro num app de um usuário só.

#### PLT-13

**O indicador de backup fica verde para sempre depois do último sucesso, mesmo com o serviço parado** — média · confirmado · `bug` · tarefa **G4**

- **Local:** `apps/web/src/modules/diagnostics/application/collect-diagnostics.ts:242` · também: `services/backup/src/status.ts:305`
- **Cenário:** O serviço de backup morre (processo encerrado, máquina reiniciada sem autostart). O backup-status.json fica com `ok: true` de 20 dias atrás. A barra de status (/api/infra) e o /diagnostico continuam com "ok" verde e o texto "Último backup: 03/09", e ninguém repara até precisar restaurar.
- **Correção sugerida:** Marcar como "off" (ou "warn") quando `now - finishedAt > 2 × BACKUP_INTERVAL_HOURS`, que o app pode ler do ambiente ou o serviço pode gravar no próprio status.
- **Verificação:** collect-diagnostics.ts:242 decide a saúde só por `status.ok === true`, sem comparar finishedAt com o intervalo esperado, e /api/infra repassa essa saúde para a barra de status (route.ts:30). Um serviço parado com o último status ok continua verde indefinidamente, e só o texto com a data denuncia o atraso.

#### PLT-14

**O worker trata qualquer `page*.png` do diretório do job como página renderizada, inclusive figuras enviadas no bundle** — baixa · confirmado · `bug` · tarefa **F5**

- **Local:** `services/renderer/src/compile.ts:346`
- **Cenário:** O usuário sobe uma figura chamada "page-3.png", saída típica do pdftoppm ou de uma captura, e a cita no enunciado. O worker devolve essa figura como página de saída, a app grava um RENDER_PNG extra e o painel mostra a figura crua como mais uma página do documento, ordenada entre page-1 e page-10.
- **Correção sugerida:** Fazer o pdftocairo escrever num subdiretório `out/` ou com um prefixo reservado, e casar com `/^page-\d+\.png$/` só dentro dele.
- **Verificação:** compile.ts:347 filtra `startsWith("page") && endsWith(".png")` no mesmo `dir` onde os assets são gravados (linha 187). O slug de assetLatexName (asset-latex-name.ts:43-63) transforma "page-3.png" em "page-3-<hash>.png", que casa com o filtro e sai como página renderizada.

#### PLT-15

**`timeoutMs` vale por etapa, não por job, e o total pode passar do teto do cliente enquanto o pdflatex continua rodando** — baixa · plausível · `bug` · tarefa **F5**

- **Local:** `services/renderer/src/compile.ts:214` · também: `services/renderer/src/compile.ts:193`, `apps/web/src/modules/rendering/infrastructure/render-worker-executor.ts:24`
- **Cenário:** Com passes=3 e timeoutMs=30 s: 30 s de formato, 90 s de pdflatex e 30 s de pdftocairo dão 150 s. O fetch aborta aos 120 s com RendererUnavailableError ("worker não respondeu"), mas o worker segue compilando, e o usuário vê "fora do ar" com o worker ativo.
- **Correção sugerida:** Calcular um deadline único no início do `compile` e passar a cada etapa `deadline - now()`. Interromper o laço de passadas quando uma passada falhar (sem PDF) e parsear só o log da última passada.
- **Verificação:** O contrato promete um "Teto de tempo do job inteiro" (packages/render-contract/src/render-bundle.ts:72), mas compile.ts passa timeoutMs separado para ensureFormat (193), para cada passada (230) e para renderPngs (282), e o laço não para quando uma passada falha. Com o padrão passes=1 e timeout de 30 s (render-bundle.ts:100-101), o pior caso é 90 s, abaixo dos 120 s do cliente. Hoje nenhum caminho usa passes>1, então o cenário descrito não acontece.

#### PLT-16

**`backfill-legacy-assets` grava no banco e no storage sem dry-run e sem transação entre o Asset e o vínculo** — baixa · confirmado · `bug` · tarefa **G4**

- **Local:** `apps/web/scripts/backfill-legacy-assets.ts:74` · também: `apps/web/scripts/backfill-legacy-assets.ts:135`
- **Cenário:** O script cai entre o `asset.create` e o `publication.update`, por exemplo SQLITE_BUSY com o dev server gravando. O Asset fica criado sem vínculo, e a próxima execução, vendo `coverAssetId` nulo, cria outro Asset COVER duplicado. Rodado por engano, ele escreve direto no banco de dev sem mostrar antes o que faria.
- **Correção sugerida:** Envolver create e update num `prisma.$transaction` e adotar o mesmo padrão CONFIRM=yes/dry-run dos outros scripts.
- **Verificação:** backfill-legacy-assets.ts:74-87 e 123-137 fazem asset.create e publication.update como chamadas soltas, sem $transaction e sem CONFIRM=yes, enquanto backfill-legacy-figures.ts:59 e write-legacy-import.ts:39 exigem a confirmação. Uma falha entre as duas chamadas deixa um Asset órfão, e a próxima execução cria outro.

#### PLT-17

**O /diagnostico mostra "Tool calling: não" mesmo com `AI_TOOL_CALLING=true`** — baixa · confirmado · `bug` · tarefa **F1**

- **Local:** `apps/web/src/modules/diagnostics/application/collect-diagnostics.ts:204`
- **Cenário:** Com o Ollama e `qwen3-coder:30b` e AI_TOOL_CALLING=true, o agente usa ferramentas, mas a página de diagnóstico diz "não". Quem está investigando por que o agente respondeu sem consultar a questão vai atrás da configuração errada.
- **Correção sugerida:** Calcular `profile.assumedCapabilities.toolCalling || env.aiToolCalling`, ou instanciar o provider como a rota faz e ler `provider.capabilities`.
- **Verificação:** collect-diagnostics.ts:204 lê só `profile.assumedCapabilities.toolCalling`, enquanto /api/agents/ask (route.ts:88) aplica `env.aiToolCalling` (env.ts:108) por cima do perfil. Com Ollama e AI_TOOL_CALLING=true, o diagnóstico mostra "não" enquanto o agente usa tools.

## Arquitetura

### Arquitetura · Código inteiro

**Resumo do revisor.** A arquitetura macro está sã e melhor que a média. As camadas domain/application/infrastructure/ui são respeitadas. O módulo scan é o modelo a seguir: rotas finas de 17 a 70 linhas, `scanDeps()` como raiz de composição e aprovação planejada no domínio. Os perfis de captura são módulos profundos: um perfil novo exige um arquivo e uma linha em profiles/index.ts, sem Shotgun Surgery. A dívida está nas costuras entre módulos. (1) A escrita de "questão + nó + âncora" está reimplementada em 5 adaptadores Prisma, e o invariante de sincronia de `sourceAnchorId` só se mantém por convenção. (2) A orquestração de render está copiada nas rotas; dois caminhos do agente compilam sem os assets e falham em toda questão com figura. (3) Não há raiz de composição fora do scan: storage, render e IA são instanciados em 12, 4 e 3 lugares. (4) Conceitos sem dono ou duplicados: Revision (módulo vazio, 3 escritores), dois modelos de página de PDF com o 0.22 copiado, dois clientes HTTP OpenAI-compatible, dois previews, um deles morto. (5) Componentes de tela gigantes que carregam a orquestração do agente, e contratos HTTP duplicados com casts.

<details><summary>Cobertura declarada</summary>

Li por inteiro: capture-profile.ts, profiles/index.ts, semantic-prompt.ts, run-scan.ts, approve-scan.ts, prisma-scan-approval.ts, scan-deps.ts, scan-passes.ts, prisma-question-creator.ts, create-question-from-recognition.ts, a rota PATCH de questão, a rota de render de questão, candidate-render/route.ts, render-candidate.ts, build-preview-model.ts, tree-http.ts (quase todo), README (Convenções), shared/ports/index.ts e sqlite/client.ts. Amostrei com trechos e grep: structure.ts (esboço), page.ts (tipos e toTextSpan), exam-v1.ts, book-v1.ts/book-fme-v1.ts (CONTAINS, score, canContain), segmentar-pagina.ts (tipos), pdf-text-layer.ts, vision-math-recognizer.ts, openai-compatible-provider.ts, prisma-node-anchors.ts, prisma-node-body.ts, prisma-patch-applier.ts, prisma-workspace-sink.ts, prisma-legacy-import-writer.ts, prisma-document-tree-repository.ts (duplicateSubtree), agents/ask/route.ts, from-recognition/route.ts, publication-workbench.tsx (agente), question-editor.tsx (estado e PreviewPane), collect-diagnostics.ts, scan-client.ts, scan-dto.ts, trechos de _planejamento §4.6/4.7, CONTEXT.md (Revisão) e o checklist da Fase 10. Medi com grep/wc o grafo de imports entre módulos, os tamanhos de arquivo, as instanciações de adaptadores, os casts de JSON no cliente, as classes de erro e os exports sem consumidor (heurística por token). Não li: módulos assessments, latex-knowledge, workspaces e publications além dos imports; os demais arquivos de scan/domain (review, furniture, figures, layout, toc, approval-latex); a UI do design-system; services/renderer, exceto as flags do pdflatex. Não executei testes. A divergência cmex do exam-v1 e a do preview discursivo foram deduzidas do código, não reproduzidas.

</details>

#### ARQ-01

**Criar questão + nó + âncora está reimplementado em 5 adaptadores Prisma, e o invariante de sincronia de `sourceAnchorId` só se mantém por convenção** — média (o revisor deu alta) · plausível · `design` · tarefa **I5**

- **Local:** `apps/web/src/modules/scan/infrastructure/prisma-scan-approval.ts:165` · também: `apps/web/src/modules/questions/infrastructure/prisma-question-creator.ts:25`, `apps/web/src/modules/document-tree/infrastructure/prisma-document-tree-repository.ts:250`, `apps/web/src/modules/portability/infrastructure/prisma-workspace-sink.ts:169`, `apps/web/src/modules/legacy-import/infrastructure/prisma-legacy-import-writer.ts:145`, `apps/web/src/modules/assets/infrastructure/prisma-node-anchors.ts:40`, `apps/web/src/modules/assets/infrastructure/prisma-asset-writer.ts:147`
- **Cenário:** A próxima mudança plausível é uma coluna nova em Question, ou uma regra na criação (gravar Revision de origem IMPORT/SYSTEM, `validationStatus` inicial, herança de banca/ano, que hoje só a criação manual faz). Ela precisa ser replicada em 5 transações diferentes, e a que for esquecida grava questões diferentes conforme o caminho de entrada. O mesmo vale para a regra de âncora principal: se ela mudar em `planNodeAnchors`, o PrismaQuestionCreator continua gravando `role: "PRIMARY"` e `sortOrder: 0` fixos, e a aba Origem da questão passa a divergir da do nó. É o caminho da aprovação, o único que escreve do scan no acervo.
- **Correção sugerida:** Criar no módulo questions um escritor profundo que aceite transação: `materializeQuestionNode(tx, { publicationId, parentId, sortKey, kind, title, originalLabel, question?: { blueprint, statementLatex, solutionLatex, originalLatex, options, metadata }, anchors: NodeAnchorLink[], createdByScanRunId? }): Promise<{ nodeId, questionId }>`. Ele chama `writeNodeAnchors` internamente. PrismaQuestionCreator, PrismaScanApproval e duplicateSubtree passam a delegar a ele. O sink de portabilidade e o writer legado recebem `(client: PrismaClient | Tx)` e compartilham um só `writeImportPlan(client, plan, assetStrategy)`. O que difere entre eles (figuras legadas × assets do arquivo) vira a estratégia injetada.
- **Verificação:** A duplicação existe: prisma-scan-approval.ts:165-215 cria questão+nó inline, e prisma-question-creator.ts:57-75 grava `documentNodeAnchor` com `role: "PRIMARY"`/`sortOrder: 0` e as duas colunas à mão, sem `writeNodeAnchors`, mesmo com prisma-node-anchors.ts:40 dizendo que ela é exportada para os criadores. Hoje o resultado é equivalente (uma âncora só, principal), então não há divergência presente; é dívida que atrapalha a próxima mudança, não bug no uso normal.

#### ARQ-02

**Orquestração de render copiada nas rotas: os dois caminhos do agente compilam sem assets e falham em toda questão com figura** — alta · confirmado · `design` · tarefa **F2**

- **Local:** `apps/web/app/api/agents/candidate-render/route.ts:75` · também: `apps/web/src/modules/agents/application/render-candidate.ts:96`, `apps/web/app/api/publications/[id]/questions/[questionId]/render/route.ts:102`, `apps/web/app/api/publications/[id]/nodes/[nodeId]/render/route.ts:66`
- **Cenário:** Pegue uma questão cujo enunciado tem `\includegraphics{fig-abc.png}`, vinda de upload, recorte ou figura do scan. O agente propõe uma correção no gabarito, e o PatchReviewPanel pede o antes/depois a /api/agents/candidate-render. As duas compilações voltam `success:false` com "File not found", e o humano vê um diff que parece quebrar a questão. A tool `render_candidate_latex` diz ao modelo que o LaTeX dele não compila, e ele gasta as 3 tentativas "corrigindo" o que não está errado. Uma quinta rota de render (a da avaliação, por exemplo) copiaria a orquestração de novo.
- **Correção sugerida:** Levar ao módulo rendering um caso de uso profundo: `renderQuestion(deps, { questionId, overrides?: Partial<Record<LatexField,string>>, profile, includeSolution, persist: boolean, signal? }): Promise<{ result, artifacts?, job?, sourceMap }>`. Ele resolve a questão, faz as duas passadas de assets e decide entre gravar RenderJob e só devolver os diagnósticos. As rotas de questão e de candidato e a tool do agente passam a chamá-lo; `loadQuestion` da tool vira `renderQuestion({persist:false})`. Se ler o storage a cada tentativa custar caro, cachear os assets por turno dentro do caso de uso.
- **Verificação:** candidate-render/route.ts:75 e render-candidate.ts:96 chamam `executor.render(bundle, new Map())` sem assets, e o perfil carrega `graphicx` sem `draft` (latex-profile.ts:52), com o worker usando `-halt-on-error` (services/renderer/src/compile.ts:221). Por isso, uma questão com `\includegraphics` falha com File not found, que é exatamente o que prisma-question-assets.ts:14 documenta. O comentário em render-candidate.ts:93 justifica a escolha, mas a premissa dele ("não muda se compila") é falsa.

#### ARQ-03

**Sem raiz de composição fora do scan: storage, render e IA são instanciados à mão em 19 lugares, e a fábrica que existe não é usada** — média · plausível · `design` · tarefa **I3**

- **Local:** `apps/web/src/shared/ports/index.ts:21` · também: `apps/web/src/modules/scan/infrastructure/scan-deps.ts:26`, `apps/web/src/modules/publications/infrastructure/prisma-catalog-import.ts:37`, `apps/web/src/modules/scan/infrastructure/scan-passes.ts:30`, `apps/web/app/api/recognition/route.ts:35`, `apps/web/src/modules/agents/infrastructure/openai-compatible-provider.ts:190`, `apps/web/app/api/publications/[id]/questions/[questionId]/render/route.ts:126`
- **Cenário:** A próxima mudança plausível é a de infraestrutura prevista no próprio plano: trocar o storage para VercelBlob/S3 (o diretório infrastructure/storage/vercel-blob já existe, vazio) ou mudar a regra de "visão configurada" (aceitar um modelo por perfil, dar trim no valor). Hoje isso exige editar 12 ou 4 arquivos. O que ficar para trás grava assets num storage e lê de outro, e o sintoma é "asset não encontrado" só na rota esquecida. As pages também já divergem do env.ts: não fazem trim, então `AI_VISION_MODEL=" "` mostra visão disponível e a rota recusa.
- **Correção sugerida:** Um módulo de composição simples, sem container de DI, no espírito de `scanDeps()`: `src/infrastructure/composition.ts` exportando `storage(): StorageProvider`, `renderer(): RenderExecutor | null`, `aiProvider(opts?): AiProvider | null`, `visionRecognizer(): MathRecognitionProvider | null` e `rendererVersion()`, todos lendo de `env()` (com `aiVisionModel` e `rendererVersion` acrescentados ao env.ts). Rotas, `scanDeps` e prisma-catalog-import passam a chamar essas funções, e `providerFromEnv` é apagado ou absorvido. Um teste de fronteira que proíba `new LocalFileStorageProvider(` fora desse arquivo mantém o ganho.
- **Verificação:** As contagens batem: 12 arquivos com `new LocalFileStorageProvider(`, 4 rotas com `new RenderWorkerExecutor`, `providerFromEnv` (openai-compatible-provider.ts:190) sem chamador, `AI_VISION_MODEL` lido cru em scan-passes.ts:30, recognition/route.ts:35 e nas duas pages, e `RENDERER_VERSION` em 2 rotas. Um detalhe do cenário está errado: a rota (recognition/route.ts:35-36) só testa `=== null`, então com `" "` ela também aceita e não recusa. A divergência real é a inversa: com `""` a page diz indisponível e a rota aceita.

#### ARQ-04

**Revision não tem dono: o módulo `revisions/` está vazio e a numeração é gravada em 3 lugares, um deles fora de qualquer módulo** — média · plausível · `design` · tarefa **I5**

- **Local:** `apps/web/src/modules/document-tree/infrastructure/prisma-node-body.ts:73` · também: `apps/web/src/modules/scan/infrastructure/prisma-scan-approval.ts:237`, `apps/web/src/infrastructure/agent/prisma-patch-applier.ts:95`, `apps/web/src/infrastructure/agent/prisma-revision-reader.ts:1`, `apps/web/src/modules/revisions/.gitkeep:1`
- **Cenário:** A próxima mudança do histórico é plausível: restaurar a revisão de um nó (hoje só questão), mudar o formato de `snapshotJson`, gravar origem IMPORT (⛔ no checklist) ou tratar a corrida do `@@unique` com retry. Cada uma exige achar e editar três cópias em três módulos. A cópia do scan grava snapshot `{title, bodyLatex}` e a do corpo do nó grava `input.previous`: se os dois formatos divergirem, a aba Histórico de um nó passa a mostrar diff errado para as revisões vindas do scan.
- **Correção sugerida:** Preencher `modules/revisions` com domain (`RevisionOrigin`, `RevisionSnapshot` por entityType, diff) e infrastructure `appendRevision(tx, { entityType, entityId, origin, summary, snapshot, agentRunId? }): Promise<number>` e `listRevisions/findRevision(entityType, entityId)`. PrismaNodeBody, PrismaScanApproval e PrismaPatchApplier chamam `appendRevision(tx, ...)`, e o reader sai de src/infrastructure/agent. Ajustar o verbete Revisão do CONTEXT.md, que hoje fala só de questão, embora o código também versione DOCUMENT_NODE.
- **Verificação:** O padrão findFirst + `revisionNumber + 1` aparece em prisma-node-body.ts:67-80, prisma-scan-approval.ts:232-246 e prisma-patch-applier.ts:84-103, e src/modules/revisions tem só o .gitkeep de ef56adf. Hoje os dois snapshots de DOCUMENT_NODE têm o mesmo formato `{title, bodyLatex}` (save-node-body.ts:68 e prisma-scan-approval.ts:244), então o diff errado é risco futuro, não bug atual.

#### ARQ-05

**`buildFastPreview` é um método obrigatório do plugin que ninguém chama: dois modelos de preview, um morto, e o vivo ignora o tipo da questão** — média · confirmado · `design` · tarefa **E4**

- **Local:** `apps/web/src/modules/questions/domain/question-type-plugin.ts:89` · também: `apps/web/src/modules/preview/domain/build-preview-model.ts:40`, `apps/web/app/publications/[id]/editor/question-editor.tsx:827`, `apps/web/src/modules/questions/domain/plugins/discursive.ts:57`
- **Cenário:** A rota PATCH (questions/[questionId]/route.ts:163) documenta que a discursiva "esconde a aba de alternativas em vez de excluí-las". Uma questão que passou de múltipla escolha para discursiva mantém as 5 alternativas no banco: a pré-visualização rápida continua desenhando A–E, enquanto o pdflatex (via `buildLatexBlocks`, que respeita o tipo) não as mostra. Um tipo novo (TRUE_FALSE, CESPE) implementaria `buildFastPreview` achando que controla o preview, e não controlaria nada.
- **Correção sugerida:** Escolher um dos dois. (a) Tornar o plugin a fonte: `PreviewPane` recebe `type` e chama `plugin.buildFastPreview`, e `buildPreviewModel` vira o helper comum que os plugins usam, o que tira de preview a dependência em questions. (b) Apagar `buildFastPreview` do contrato e dos 3 plugins, e fazer `buildPreviewModel` receber `showOptions` de uma função de plugin barata (`plugin.hasOptions`), o que quebra o ciclo questions→preview. (a) é mais coerente com a regra "nenhum switch global sobre tipo".
- **Verificação:** `buildFastPreview` só tem chamador no stub de tests/plugin-builds-latex.test.ts:66. O preview real, `buildPreviewModel` (build-preview-model.ts:40), desenha todas as alternativas, e question-editor.tsx:827 passa `options` sem olhar o tipo. Já `discursive.buildLatexBlocks` (discursive.ts:33-54) não as emite, então uma questão que virou discursiva mostra A–E no preview rápido e não no PDF.

#### ARQ-06

**Dois modelos de página de PDF e dois leitores pdf.js; o `exam-v1` reconverte com um 0.22 literal que já diverge do motor em spans pendurados** — média · confirmado · `design` · tarefa **I7**

- **Local:** `apps/web/src/modules/scan/domain/profiles/exam-v1.ts:32` · também: `apps/web/src/modules/scan/domain/page.ts:79`, `apps/web/src/modules/assets/ui/pdf-text-layer.ts:102`, `apps/web/src/modules/recognition/domain/segmentar-pagina.ts:31`
- **Cenário:** Numa prova varrida com `exam-v1` que tenha ∑, ∫ ou parênteses grandes de display, a baseline recuperada fica em `baseline + 2,38·corpo`, e a palavra-glifo cai cerca de 24 pt abaixo do lugar (corpo 10). Com isso, `segmentarPagina` a agrupa numa linha falsa, e ela pode esticar a caixa da questão ou virar a sobra do pé da página. Não há erro, só um recorte torto. Toda mudança futura na métrica de page.ts (ASCENT/DESCENT) quebra o exam-v1 em silêncio, porque a constante está copiada.
- **Correção sugerida:** Preservar `baseline` em `TextSpan` e expor em page.ts `toTextLayerWords(page: PageModel): PalavraNaPagina[]` (ou mover `PaginaDeTexto` para um tipo comum, `shared/pdf-text`), para que exam-v1 e o adaptador do navegador usem a mesma conversão. A médio prazo, um único modelo de camada de texto (palavras com baseline, tamanho e fonte) serviria à captura manual e ao scan, com `segmentarPagina` consumindo `PageModel` diretamente.
- **Verificação:** exam-v1.ts:32 recupera a baseline com `span.y1 - span.size * 0.22`, mas page.ts:104 grava `y1 = baseline + size * 2.6` para spans da fonte de extensão (`hanging`). `TextSpan` (page.ts:42-49) descarta `baseline`, e o glifo cmex sai deslocado cerca de 2,38·corpo. O efeito exato no recorte não foi reproduzido, mas a conversão diverge do motor com certeza.

#### ARQ-07

**Dois clientes HTTP para o mesmo endpoint OpenAI-compatible; a implementação do port de IA mora dentro de `agents` e o scan a alcança por infrastructure** — média · plausível · `design` · tarefa **I7**

- **Local:** `apps/web/src/modules/recognition/infrastructure/vision-math-recognizer.ts:99` · também: `apps/web/src/modules/agents/infrastructure/openai-compatible-provider.ts:148`, `apps/web/src/modules/scan/infrastructure/scan-passes.ts:4`
- **Cenário:** Com AI_BASE_URL apontando para o OpenRouter sem AI_API_KEY, o agente e a passada semântica recusam com a mensagem instrutiva "defina AI_API_KEY". O reconhecimento de matemática (captura e scan) só descobre o problema depois, com "O endpoint recusou: HTTP 401" a cada item. A próxima mudança plausível (cabeçalhos exigidos pelo OpenRouter, retry com backoff, novo perfil de endpoint) tem de ser feita duas vezes, e a cópia esquecida volta a falhar só na visão.
- **Correção sugerida:** Mover `OpenAiCompatibleProvider` para `src/infrastructure/ai/openai-compatible/` (é o port primário `AiProvider`, não algo do agente) e estender `AiChatMessage` para aceitar partes de imagem. `VisionMathRecognizer` passa a compor um `AiProvider` (`new VisionMathRecognizer(provider, model)`) e fica só com prompt, limpeza e escape. Assim perfil, credencial, timeout e erro têm um único dono.
- **Verificação:** vision-math-recognizer.ts:99 faz o próprio `fetch` para `/chat/completions`, sem `profileForBaseUrl`/`requiresApiKey`, que só o OpenAiCompatibleProvider aplica (openai-compatible-provider.ts:77-84). scan-passes.ts:4-5 alcança as infrastructures de agents e recognition, e src/infrastructure/ai/openai-compatible tem só o .gitkeep. O cenário do 401 tardio é coerente com o código.

#### ARQ-08

**A sessão do agente e outras orquestrações vivem dentro de componentes de tela de 900 a 1.250 linhas** — média · plausível · `design` · tarefa **I8**

- **Local:** `apps/web/app/publications/[id]/editor/publication-workbench.tsx:399` · também: `apps/web/app/publications/[id]/editor/question-editor.tsx:175`, `apps/web/app/bibliotecas/[slug]/livros/calibre/calibre-screen.tsx:1`, `apps/web/src/modules/recognition/ui/IngestionPanel.tsx:223`
- **Cenário:** A próxima mudança plausível é abrir o agente em outra tela: na revisão do scan, na avaliação ou no próprio editor de questão isolado. Para isso seria preciso copiar ~200 linhas de estado e fetch do workbench. Qualquer mudança no contrato de /api/agents/ask (streaming, runId, múltiplas propostas) mexe num arquivo de 1.250 linhas que também cuida de árvore, filtros, busca, lixeira e atalhos, o que torna a revisão e o teste caros (não há teste unitário possível de `askAgent` sem montar a tela inteira).
- **Correção sugerida:** Criar em agents/ui um `agent-client.ts` (`ask`, `previewChange`, `applyPatch`, `revertPatch`, com os DTOs tipados) e um hook `useAgentSession({ questionId, onApplied }): { turns, busy, error, mode, setMode, context, attach, ask, proposal, preview, apply }`. O workbench só compõe. Aplicar o mesmo corte a question-editor: `useQuestionDraft` (rascunho, autosave e versão) e `useQuestionHistory` (revisões, diff e restaurar), em questions/ui.
- **Verificação:** publication-workbench.tsx tem 1.252 linhas, e `PublicationWorkbench` vai da :167 à :1087, com 16 useState e askAgent/previewChange/applyProposal nas :399/:469/:504. Os outros tamanhos também conferem: 923, 1.069 e 918 linhas. É julgamento de design defensável, sem bug.

#### ARQ-09

**Rota gorda: /api/agents/ask monta provider, tools, registro de execução e diff; o PATCH de questão orquestra salvar e revalidar** — média · plausível · `design` · tarefa **I2**

- **Local:** `apps/web/app/api/agents/ask/route.ts:83` · também: `apps/web/app/api/publications/[id]/questions/[questionId]/route.ts:258`
- **Cenário:** Ao expor o agente por outro canal (script de lote, job de revisão automática, rota de streaming), a montagem de tools, a política de auditoria e o diff teriam de ser copiados, e a cópia esquece o `@@unique`/workspace ou a regra de só oferecer render com questão em foco. Um script de import que salve questões pelo caso de uso `saveQuestion` não revalida o selo, porque essa regra está na rota.
- **Correção sugerida:** `askAgent(deps: { provider, readPort, executor|null, runLog, questionState }, { prompt, mode, questionId, context }): Promise<{ answer, proposals: {patch, changes}[], record, runId }>` em agents/application, com a rota reduzida a parse e mapeamento HTTP. Para questões, `saveQuestionAndRevalidate` (ou `saveQuestion` recebendo um `ValidationWriter` opcional) em questions/application.
- **Verificação:** ask/route.ts:82-160 monta o provider, escolhe as tools por modo, grava o AgentRun com política própria e calcula `diffPatch`, e agents/application não tem um caso de uso `askAgent`. A regra de revalidar mora na rota (questions/[questionId]/route.ts:211, :258). Smell de rota gorda confirmado no código, sem bug presente.

#### ARQ-10

**Contrato HTTP duplicado entre rota e cliente: 56 casts `(await response.json()) as {...}` em 30 arquivos** — média · plausível · `design` · tarefa **I8**

- **Local:** `apps/web/src/modules/scan/ui/scan-client.ts:10` · também: `apps/web/app/api/scans/scan-dto.ts:4`, `apps/web/app/publications/[id]/editor/publication-workbench.tsx:418`
- **Cenário:** Renomear ou remover um campo numa rota (por exemplo `revisionNumber` em /api/agents/patches/apply, ou `stateLabel` no DTO do scan) passa por `tsc --noEmit` e pelo lint limpos. A tela passa a mostrar "Revisão undefined guarda o estado anterior" ou um rótulo vazio, e só o E2E ou o usuário percebem.
- **Correção sugerida:** Por módulo, um `contract.ts` sem dependências de servidor, com os tipos de resposta (`export type ScanRunDto = {...}`, `AskAgentResponse`, `ApplyPatchResponse`). A rota anota o retorno (`NextResponse.json<AskAgentResponse>(...)` ou `satisfies`) e o cliente importa o mesmo tipo em um `*-client.ts` que concentra o fetch. `ScanRunView` passa a ser o próprio `ScanRunDto`.
- **Verificação:** scan-client.ts:10 redeclara `ScanRunView` à mão, enquanto scan-dto.ts:5 deriva o DTO de `scanRunDto`, e publication-workbench.tsx:418 usa um cast inline. Contei 47 casts `(await response.json()) as` em 26 arquivos com esse padrão exato; o número do achado pode incluir variantes. O tsc de fato não liga a rota ao cliente.

#### ARQ-11

**Erro de domínio → HTTP resolvido rota a rota: 63 classes de erro planas, 42 `instanceof` nas rotas e 4 `*-http.ts`** — baixa · plausível · `design` · tarefa **I4**

- **Local:** `apps/web/app/api/tree-http.ts:1` · também: `apps/web/app/api/publications/[id]/questions/from-recognition/route.ts:68`, `apps/web/app/api/scans/scan-http.ts:1`, `apps/web/app/api/catalog/catalog-http.ts:1`
- **Cenário:** Um erro novo de domínio (por exemplo `QuestionLockedError`) lançado por um caso de uso usado em 3 rotas vira 500 nas rotas que não receberam o `instanceof` novo. A tela mostra "erro interno" em vez de 409/422. O hub tree-http.ts acaba importando erros de módulos cada vez mais distantes.
- **Correção sugerida:** Uma base `DomainError` em src/shared com `readonly kind: "not_found" | "conflict" | "invalid" | "unavailable" | "forbidden_state"` e `code` estável. Um único `toHttpResponse(error)` em app/api/http.ts mapeia `kind` para status. Os erros existentes passam a estender a base, e as cadeias de `instanceof` somem. Para o escopo de questão, `withQuestionScope(handler)`.
- **Verificação:** tree-http.ts:3-5 importa erros de document-tree e é usado por 59 arquivos em app/. Existem os 4 `*-http.ts` e 63 `extends Error`, e from-recognition/route.ts tem 5 `instanceof`. É dívida de higiene, sem bug demonstrado.

#### ARQ-12

**Primitivas genéricas presas a módulos de feature geram ciclos entre módulos** — baixa · plausível · `design` · tarefa **I6**

- **Local:** `apps/web/src/modules/assets/domain/source-anchor.ts:15` · também: `apps/web/src/modules/document-tree/domain/fractional-index.ts:1`, `apps/web/src/modules/recognition/domain/latex-escape.ts:1`, `apps/web/src/modules/assets/ui/pdf-text-layer.ts:1`, `apps/web/src/modules/portability/domain/import-conflicts.ts:1`
- **Cenário:** Extrair um módulo (o scan para um worker, o renderer de preview para um pacote) ou mover assets obriga a arrastar dependências que não são dele. Um refactor em `source-anchor.ts` (por exemplo, trocar de `{x,y,width,height}` para `{x0,y0,x1,y1}`) recompila e quebra 12 arquivos de scan, porque o tipo é de outro módulo. Os ciclos impedem uma regra de lint de dependência acíclica entre módulos.
- **Correção sugerida:** Criar `src/shared/geometry` (`NormalizedBox`, `normalizeBox`, `toNormalized/fromNormalized`, unificando as conversões de scan/domain/geometry.ts, assets/source-anchor.ts e segmentar-pagina `caixaNormalizada`), `src/shared/ordering/fractional-index.ts` e `latex/domain/escape.ts`. Depois, acrescentar ao eslint.boundaries uma regra de módulos sem ciclo (por exemplo `import/no-cycle` restrito a `@modules/*`).
- **Verificação:** Os imports cruzados existem: questions/domain importa `fractional-index` de document-tree (option-mutations.ts:1), e document-tree importa `question-type` (get-publication-tree.ts:6). scan/domain/structure.ts:1 importa `escapeLatexText` de recognition, assets/ui/PdfCropViewerInner.tsx:22 importa segmentar-pagina, e portability/domain/import-conflicts.ts:1 importa de ../application. São 11 arquivos de scan importando source-anchor, não 12.

#### ARQ-13

**Peso morto: módulos e diretórios de infraestrutura vazios desde o bootstrap, adaptadores fora do módulo dono e exports sem consumidor** — baixa · confirmado · `design` · tarefa **I6**

- **Local:** `apps/web/src/modules/revisions/.gitkeep:1` · também: `apps/web/src/modules/ingestion/.gitkeep:1`, `apps/web/src/modules/settings/.gitkeep:1`, `apps/web/src/infrastructure/agent/prisma-agent-read-port.ts:1`, `apps/web/src/modules/agents/infrastructure/openai-compatible-provider.ts:190`, `apps/web/src/modules/scan/domain/scan-run.ts:48`
- **Cenário:** Quem chega (pessoa ou agente) confia na árvore do planejamento §4.6 e procura o executor de render em infrastructure/rendering/worker, a IA em infrastructure/ai e o histórico em modules/revisions, e acha diretórios vazios. A "ingestão" real está em recognition + assets. O código novo acaba no lugar errado, e a divergência entre plano e código cresce. As fábricas mortas (`providerFromEnv`) sugerem um caminho de montagem que ninguém usa.
- **Correção sugerida:** Apagar os diretórios vazios, ou preenchê-los ao executar ARQ-04 (revisions) e ARQ-07 (ai). Mover src/infrastructure/agent/* para modules/agents/infrastructure (e o revision-reader para modules/revisions). Remover os exports mortos. Atualizar a árvore do _planejamento §4.6 para o layout real, com recognition e scan no lugar de ingestion.
- **Verificação:** git log mostra os .gitkeep de revisions, ai/openai-compatible etc. adicionados em ef56adf e nunca preenchidos. src/infrastructure/agent guarda 5 adaptadores do módulo agents. O grep não acha nenhum uso de `providerFromEnv`, `isAwaitingProfile` (scan-run.ts:48) ou `comparePositions` (document.ts:158) fora da definição.

#### ARQ-14

**As passadas do `runScan` não têm contrato comum: uma etapa nova exige editar o laço em 5 pontos** — baixa · plausível · `design` · tarefa **I9**

- **Local:** `apps/web/src/modules/scan/application/run-scan.ts:209` · também: `apps/web/src/modules/scan/application/run-scan.ts:149`, `apps/web/src/modules/scan/application/run-scan.ts:252`
- **Cenário:** A próxima etapa plausível do scan (ler o gabarito das zonas `skip`, ou uma passada de OCR para páginas `scanned`) exige um estado novo, mais 20 linhas copiadas no meio do laço, um contador novo em `updateRun` e cuidado com a ordem de cancelamento. Os testes de runScan crescem de forma combinatória.
- **Correção sugerida:** `interface ScanPass { readonly state: ScanRunState; enabled(run: ScanRun): boolean; run(ctx: { run, items, pdf, bytes, save, cancelled, progress }): Promise<{ warnings: string[]; counters?: Partial<RunCounters> }> }`, com `runScan` percorrendo `deps.passes` em ordem. A herança de revisão e o aviso de perfil errado viram funções de domínio (`applyInheritedReview(prev, next)` e `profileMismatchWarning(pages, profile)`), chamadas numa linha cada.
- **Verificação:** run-scan.ts repete o ritual cancelled/updateRun/estado em cada passada (cerca de :209, :231, :252). `SemanticPass` devolve `changed`, que o laço grava, enquanto Figure e Math recebem um `save` por callback. É smell de extensibilidade, sem bug.

## Testes

### Testes · Suíte unitária, E2E e CI

**Resumo do revisor.** A suíte unitária é densa e, em geral, prova o comportamento. Os testes do scan rodam contra SQLite de verdade (createTempDatabase) e usam PDFs sintéticos. Os buracos graves ficam em outros quatro lugares. (1) Os adaptadores Prisma de escrita fora do scan só são exercitados por fakes em memória. Três deles escondem bugs que provei executando: o revert de MULTIPLE_CORRECT perde corretas; esvaziar a lixeira e apagar livro dão P2003 quando a questão está numa avaliação. (2) Os E2E rodam contra o dev server e o banco do acervo, e apagam e alteram dados reais. (3) O CI está vermelho há mais de um mês porque o renderer exige pdflatex, então o gate não barra nada. (4) Os guardas arquiteturais têm furos que consegui demonstrar: import de infraestrutura de outro módulo, import dinâmico, regex de interface e o switch sobre tipo.

<details><summary>Cobertura declarada</summary>

Li por inteiro: tests/scan-approval, scan-reimport (setup e casos), architecture-boundaries, boundary-count, o guard de switch em question-type-plugin, mutate-tree (fake e casos de restaurar), manage-libraries (guard de RESTRICT), apply-patch (describes e fakeApplier), portable-v2-roundtrip, scan-corpus, latex-profile (trecho do legado), crop-viewer-image, support/temp-database e support/scan-seed. Nos E2E: playwright.config, acervo.ts, lixeira-global, autosave-insiste (início), agente (fluxo de aplicar) e calibre (fixture). No código de produção: prisma-patch-applier, apply-question-patch (revert), prisma-document-tree-repository, prisma-global-trash, prisma-library-repository (delete), prisma-publication-repository (delete), approve-scan, parte de approval-plan, suggest-profile, o trecho do aviso em run-scan, eslint.boundaries.mjs, o client Prisma, ci.yml e a rota de revert. Mapeei por grep todos os use cases de application/ e todos os adaptadores prisma-* contra tests/. Só amostrei: hardening, workbench, render-panel, save-question (nomes e fake), legacy-import (nomes), portable-* (nomes), scan-switch-profile (nomes), atalhos, estante, importar, scan.spec e os testes do renderer (só os logs de falha do CI). Não li: a maioria dos testes de UI (*.tsx), os de latex/preview/snippets, os de recognition/capture, segmentar-pagina, scan-structure, scan-fme-profile por inteiro, e os demais E2E além do grep. Provei por execução isolada (vitest com config em /tmp e banco temporário, sem tocar no repo nem no acervo): o revert de MULTIPLE_CORRECT, o P2003 em publication.delete e emptyGlobalTrash, o restoreNode trazendo o filho excluído antes, os escapes do ESLint de fronteira e os escapes da regex do boundary-count. O CI vermelho foi lido com gh run list/view. O achado do E2E do Calibre é por leitura de código (não pude rodar Playwright).

</details>

#### TST-01

**E2E rodam contra o dev server e o banco do acervo: esvaziam a lixeira real, apagam complemento de questão real e editam questões reais** — crítica · confirmado · `test-quality` · tarefa **A1** · **feita** (`69bbfeb`)

- **Local:** `apps/web/playwright.config.ts:45` · também: `apps/web/e2e/lixeira-global.spec.ts:128`, `apps/web/e2e/agente.spec.ts:160`, `apps/web/e2e/atalhos.spec.ts:72`, `apps/web/e2e/acervo.ts:30`
- **Cenário:** O autor remove uma importação do scan (vai para a lixeira, que é a rede de segurança do ADR) e roda `bunx playwright test`: lixeira-global.spec esvazia a lixeira inteira e o que a importação levou some para sempre. agente.spec, sobre um livro cuja primeira questão tem complemento, apaga esse complemento (sobra só a Revision). atalhos.spec avança o updatedAt de questões aprovadas pelo scan, e planImportRemoval passa a tratá-las como 'editado depois de aprovado': a remoção da importação deixa de mandá-las para a lixeira. Cada execução deixa ainda dezenas de bibliotecas 'Acervo … 17…' na estante real.
- **Correção sugerida:** Isolar o banco do E2E: subir o servidor do E2E com DATABASE_URL e STORAGE_ROOT temporários, semeados por script (por exemplo `next build` com distDir próprio + `next start` em outra porta, já que um segundo `next dev` na pasta morre). Enquanto isso não existir: (a) um globalSetup que aborta se /api/diagnostics indicar o banco data/latexbookbank.db; (b) lixeira-global deixa de chamar DELETE /api/trash global e passa a checar a contagem só do que criou; (c) agente.spec e atalhos.spec criam a própria questão, como autosave-insiste já faz; (d) afterAll apagando as bibliotecas criadas.
- **Verificação:** playwright.config.ts:45 usa reuseExistingServer: true contra o dev server, e .env.local:11 aponta DATABASE_URL para data/latexbookbank.db, o acervo. lixeira-global.spec.ts:128 chama DELETE /api/trash, e emptyGlobalTrash (prisma-global-trash.ts:152) apaga todo nó com deletedAt != null. Já agente.spec.ts:160 grava complementLatex: "" numa questão real achada por acharQuestao (acervo.ts:30), e o próprio comentário do spec admite que isso já sujou a questão de demonstração por dias.

#### TST-02

**PrismaPatchApplier (a única escrita do agente) não tem teste contra banco, e o revert de MULTIPLE_CORRECT desmarca as outras corretas** — alta · confirmado · `test-gap` · tarefa **F3**

- **Local:** `apps/web/src/infrastructure/agent/prisma-patch-applier.ts:132` · também: `apps/web/tests/apply-patch.test.ts:297`, `apps/web/src/modules/agents/application/apply-question-patch.ts`, `apps/web/src/modules/questions/application/mutate-options.ts:25`
- **Cenário:** Numa questão MULTIPLE_CORRECT com a) e c) corretas, o autor aplica um patch do agente que só corrige o enunciado e depois clica em reverter para a revisão anterior: o gabarito volta com só a) correta, gravado no banco. O mesmo vale para aplicar um patch que marca uma alternativa correta: o applier desmarca todas as outras, também numa questão MULTIPLE_CORRECT. Outros pontos sem cobertura: applyTags retorna calado quando a questão não tem nó (tags do snapshot não voltam); alternativa apagada depois do snapshot não é recriada, e se era a correta a questão fica sem gabarito.
- **Correção sugerida:** Criar tests/patch-applier-db.test.ts com createTempDatabase (o padrão já existe) cobrindo applyQuestionPatch e revertQuestion contra o Prisma: MULTIPLE_CHOICE, MULTIPLE_CORRECT, snapshot com alternativa apagada ou acrescentada, tags e metadados. Corrigir applyOptions para só desmarcar as outras quando isExclusiveCorrect(type) for verdadeiro.
- **Verificação:** prisma-patch-applier.ts:132-137 desmarca todas as outras alternativas assim que acha uma com isCorrect true, sem olhar o tipo. O revertQuestion passa todas as alternativas do snapshot (apply-question-patch.ts, em torno da linha 153), então numa MULTIPLE_CORRECT sobra só a primeira correta. isExclusiveCorrect (mutate-options.ts:25) nunca é consultado, e nenhum teste importa o applier: só as rotas em app/api/agents/patches o importam. O teste de apply-patch.test.ts:297 só confere o log do fake.

#### TST-03

**Esvaziar a lixeira e apagar livro quebram com P2003 quando a questão está numa avaliação; o guard de arestas RESTRICT só protege a exclusão de biblioteca** — alta · confirmado · `test-gap` · tarefa **D1**

- **Local:** `apps/web/src/modules/document-tree/infrastructure/prisma-global-trash.ts:175` · também: `apps/web/src/modules/publications/infrastructure/prisma-publication-repository.ts:164`, `apps/web/tests/manage-libraries.test.ts:371`, `apps/web/app/api/tree-http.ts:91`
- **Cenário:** O autor põe uma questão numa prova e depois a exclui do livro (ela vai para a lixeira). A partir daí 'Esvaziar lixeira' devolve 500 para sempre, e nada mais sai da lixeira, porque é uma transação só. O mesmo acontece ao apagar um livro que tem uma questão em qualquer avaliação.
- **Correção sugerida:** Testes com createTempDatabase para emptyGlobalTrash e PrismaPublicationRepository.delete com questão referenciada por AssessmentItem, e decidir o comportamento: bloquear com mensagem (409, dizendo qual prova usa a questão) ou remover o item da prova. Estender o guard de RESTRICT para listar TODOS os caminhos de hard delete (lixeira, livro, biblioteca, remoção de importação), não só a biblioteca.
- **Verificação:** schema.prisma:903 declara AssessmentItem.question com onDelete: Restrict. Tanto emptyGlobalTrash (prisma-global-trash.ts:175) quanto PrismaPublicationRepository.delete (prisma-publication-repository.ts:164) fazem question.deleteMany sem tratar os itens de avaliação, e fora de modules/assessments nenhum arquivo cita assessmentItem. Com isso, a FK aborta a transação inteira.

#### TST-04

**CI vermelho em quase todo run desde agosto: os testes do renderer exigem pdflatex e o job não instala TeX, então o Build nunca roda** — média (o revisor deu alta) · confirmado · `test-quality` · tarefa **H1**

- **Local:** `.github/workflows/ci.yml:61` · também: `services/renderer/tests/compile.test.ts:9`, `services/renderer/tests/server.test.ts`
- **Cenário:** Um PR que quebra o `next build` ou a suíte web aparece tão vermelho quanto todos os outros, e ninguém distingue a falha real do ruído de sempre. O gate de CI não barra nada, e o passo Build não roda em nenhum PR.
- **Correção sugerida:** Separar: no job `verify`, rodar os testes do renderer sem pdflatex (buildDocument, diagnostics, dockerfile) e marcar os que compilam com `describe.runIf(hasPdflatex)` explícito e visível; rodar compile/server num job próprio que instala texlive-latex-base (ou dentro da imagem do job renderer-image). Deixar o CI verde e protegido por branch protection.
- **Verificação:** No gh run list, os 30 runs mais recentes falharam. O run 35445842448 mostra `spawn pdflatex ENOENT` em compile.test.ts. O job verify (.github/workflows/ci.yml:62) roda `bun run test` sem instalar TeX, e o passo Build vem depois. O fato está provado, mas pela régua isto é dívida que atrapalha a próxima fase, não um bug de uso normal, por isso baixei para medium.

#### TST-05

**Adaptadores Prisma de escrita testados só por fakes em memória: mover, restaurar e duplicar nó, concorrência da questão, alternativas, corpo da seção, import legado** — média · confirmado · `test-gap` · tarefa **H2**

- **Local:** `apps/web/src/modules/document-tree/infrastructure/prisma-document-tree-repository.ts:164` · também: `apps/web/src/modules/questions/infrastructure/prisma-question-repository.ts:72`, `apps/web/src/modules/questions/infrastructure/prisma-option-writer.ts`, `apps/web/src/modules/document-tree/infrastructure/prisma-node-body.ts:67`, `apps/web/src/modules/legacy-import/infrastructure/prisma-legacy-import-writer.ts:53`, `apps/web/tests/mutate-tree.test.ts:38`, `apps/web/tests/save-question.test.ts:22`
- **Cenário:** Uma mudança no schema (novo campo obrigatório em Question, nova FK RESTRICT, precisão de DateTime no libSQL) quebra duplicar seção, salvar questão (409 falso ou, pior, gravação sem conflito) ou restaurar nó. A suíte continua verde porque os fakes não reproduzem transação, cascata, FK nem o round-trip de DateTime. Foi assim que os dois P2003 de TEST-DEL-01 passaram.
- **Correção sugerida:** Uma bateria de 'contrato de adaptador' com createTempDatabase, por adaptador de escrita: move/softDelete/restore/duplicateSubtree (conferindo questões, tags e âncoras da cópia), save com expectedVersion certo e vencido, applyPatches de alternativas, save do corpo com Revision e o writer do import legado sobre um SQLite legado mínimo. Idealmente o mesmo `describe` roda contra o fake e contra o Prisma, para o fake não divergir.
- **Verificação:** Um grep em tests/ e e2e/ não acha import de nenhum dos adaptadores citados (prisma-document-tree-repository, prisma-global-trash, prisma-node-body, prisma-question-repository, prisma-option-writer etc.), nem de save-node-body e edit-node-anchors. mutate-tree.test.ts:38 usa InMemoryTree com deletedAt fixo (linha 92), e a guarda real de concorrência só existe no updateMany de prisma-question-repository.ts:72.

#### TST-06

**Aprovação do scan com destino escolhido nunca é testada: todos os testes passam destinationId: null** — média · confirmado · `test-gap` · tarefa **B3** · **feita** (`b1673ae`)

- **Local:** `apps/web/src/modules/scan/application/approve-scan.ts:90` · também: `apps/web/src/modules/scan/domain/approval-plan.ts:138`, `apps/web/tests/scan-approval.test.ts:231`
- **Cenário:** O autor aprova a proposta dentro de um capítulo que já existe. Se o reaproveitamento por parentId ou a criação sob o destino errarem (capítulos duplicados, nós na raiz, reaprovação que cria de novo em vez de reaproveitar), isso vai direto para o acervo sem teste que pegue. É a 'aprovação que grava errado'.
- **Correção sugerida:** Em scan-approval.test.ts: aprovar book-a com destino num CHAPTER pré-existente e conferir parentId dos nós criados, idempotência numa segunda aprovação com o mesmo destino, e destino de outro livro → DestinationNotInPublicationError. No domínio, um caso de planApproval com destinationId.
- **Verificação:** As chamadas de approveScan em tests/ passam todas destinationId: null (scan-approval.test.ts:231, 278, 283, 296, 321, 325 e outros arquivos), e nenhum teste cita DestinationNotInPublicationError. O ramo `{ type: "existing", id }` de approval-plan.ts:138 fica sem cobertura, embora a UI envie o destino (ScanWorkspace.tsx:220).

#### TST-07

**O guard de fronteira deixa passar: domínio importando infraestrutura de outro módulo, caminho relativo, import() dinâmico, driver de banco, e o agente alcançando o PatchApplier** — média · confirmado · `test-quality` · tarefa **H3**

- **Local:** `apps/web/eslint.boundaries.mjs:31` · também: `apps/web/eslint.boundaries.mjs:63`, `apps/web/tests/architecture-boundaries.test.ts:41`
- **Cenário:** Alguém faz o módulo do agente escrever direto pelo PrismaPatchApplier, ou um arquivo de domínio importar um repositório Prisma de outro módulo. O lint e o teste 'agente propõe, nunca escreve' ficam verdes, e a regra inviolável do fluxo agêntico cai sem aviso.
- **Correção sugerida:** Acrescentar aos padrões: `@modules/*/infrastructure/*` e `**/infrastructure/**` (cobre o relativo) no domínio, no agente e em ui/ (com exceção explícita para preview/infrastructure/mathjax, se desejado); `@infrastructure/agent/*` no agente; `@libsql/*` e `better-sqlite3` no domínio; e uma regra no-restricted-syntax para ImportExpression/require com esses alvos. Acrescentar cada escape acima como caso em architecture-boundaries.test.ts.
- **Verificação:** No domínio, eslint.boundaries.mjs:39 nega só `@infrastructure/*` e `@/infrastructure/*`, e no agente a linha 66 nega só `@infrastructure/database/*`. Assim passam caminho relativo, `@modules/*/infrastructure/*`, `@libsql/client` e `@infrastructure/agent/prisma-patch-applier`, que por sua vez importa o prisma. Há ainda um agravante: em flat config o bloco boundary/agents (linha 104) é o último a casar em src/modules/agents/domain e substitui DOMAIN_RESTRICTIONS por inteiro.

#### TST-08

**O teste 'um filho excluído à parte, antes, não volta de carona' não exercita o cenário do nome, e o código faz o contrário** — média · confirmado · `test-quality` · tarefa **D3**

- **Local:** `apps/web/tests/mutate-tree.test.ts:266` · também: `apps/web/src/modules/document-tree/application/mutate-tree.ts:145`, `apps/web/src/modules/document-tree/domain/trash-grouping.ts:53`
- **Cenário:** Quem lê o teste acredita numa garantia que não existe: o autor apaga uma subseção de propósito, depois apaga e restaura o capítulo, e a subseção descartada volta. (agruparLixeira conta o mesmo, então a tela é coerente; o que engana é o teste e o comentário.) Uma refatoração que implementasse o comportamento do nome também continuaria verde.
- **Correção sugerida:** Decidir a regra e fixá-la. Se o filho vem junto (coerente com trash-grouping), renomear o teste, corrigir o comentário de restoreNode e escrever o caso real (excluir o filho, depois o pai, restaurar o pai). Se não vem, restoreNode precisa comparar deletedAt, e o fake precisa de relógio injetável.
- **Verificação:** No seed, sec2 é irmã de sec1 e sub1 é filho de sec1 (mutate-tree.test.ts:144-146). O teste da linha 266 exclui sub1 e sec2 e restaura sec2, o que nunca traria sub1, então não exercita o cenário do nome. restoreNode (mutate-tree.ts:145-160) percorre toda a descendência na lixeira sem comparar deletedAt, e o fake grava deletedAt fixo (linha 92). O comportamento é coerente com trash-grouping.ts:53, mas o nome do teste e o comentário afirmam o contrário.

#### TST-09

**O E2E do Calibre usa o schema antigo (books.isbn, sem identifiers), que o provider já não aceita** — média · confirmado · `test-quality` · tarefa **H4**

- **Local:** `apps/web/e2e/calibre.spec.ts:28` · também: `apps/web/tests/calibre-catalog.test.ts:27`, `apps/web/src/modules/publications/infrastructure/calibre-catalog-provider.ts:280`
- **Cenário:** Rodar o E2E do Calibre dá `no such table: identifiers` ao listar o catálogo, e o fluxo 'do catálogo do Calibre a um livro do acervo' fica vermelho (ou já está, sem ninguém notar, porque os E2E não rodam no CI). A cobertura ponta a ponta do Calibre (cuja biblioteca real é schema 27) está, na prática, desligada.
- **Correção sugerida:** Trocar o SCHEMA do spec pelo mesmo do calibre-catalog.test.ts (schema 27: sem books.isbn, com identifiers) e extrair uma fixture compartilhada entre os dois, para não divergirem de novo.
- **Verificação:** O SCHEMA de e2e/calibre.spec.ts:26-40 cria books com isbn e não cria a tabela identifiers, e o spec não cita identifiers em lugar nenhum. Já CalibreCatalogProvider.isbns (calibre-catalog-provider.ts:280-287) consulta `from identifiers`, então listar falha com no such table. A asserção de ISBN fica na linha 162.

#### TST-10

**O aviso de 'perfil errado' pós-varredura e a amostra de páginas só são exercitados pelo corpus, que fica pulado** — média · confirmado · `test-gap` · tarefa **B7**

- **Local:** `apps/web/src/modules/scan/application/run-scan.ts:190` · também: `apps/web/src/modules/scan/application/suggest-profile.ts:44`, `apps/web/tests/scan-corpus.test.ts:163`
- **Cenário:** Alguém volta a ranquear sobre o livro inteiro, ou muda SAMPLE_PAGES só num dos lados. O aviso volta a dizer que o book-fme-v1 leu errado o próprio Fundamentos e sugere prova de concurso, com a suíte padrão verde.
- **Correção sugerida:** Teste unitário de samplePageNumbers (bordas: 0, 1, 16, 17, 420 páginas; crescente e sem repetição) e um teste em scan-run com PDF sintético: o aviso NÃO dispara quando o perfil é o que a sugestão escolheria e dispara quando a margem passa de PROFILE_MISMATCH_MARGIN. Corrigir o comentário 'oito páginas'.
- **Verificação:** samplePageNumbers só é importado em scan-corpus.test.ts:9, que fica sob describe.skipIf na linha 163. O aviso de perfil errado de run-scan.ts:190-194 não tem asserção em scan-run.test.ts, que só confere o aviso de modelo fora do ar. scan-profile-score.test.ts cobre rankProfiles, mas nem a amostra nem a margem. O comentário 'oito páginas' (scan-corpus.test.ts:184) diverge de SAMPLE_PAGES = 16 (suggest-profile.ts:32).

#### TST-11

**O guard de 'switch' sobre tipo de questão só vê `switch`, e só em arquivo que cita QuestionType; if e tabela por tipo fora do registry escapam** — baixa · confirmado · `test-quality` · tarefa **E4**

- **Local:** `apps/web/tests/question-type-plugin.test.ts:255` · também: `apps/web/app/publications/[id]/editor/question-editor.tsx:122`, `apps/web/src/modules/scan/domain/approval-plan.ts:247`, `apps/web/src/modules/questions/application/mutate-options.ts:25`
- **Cenário:** Um tipo novo (ex.: SUM_OF_CORRECT com alternativas) não aparece no painel de alternativas, ou vira questão sem alternativas na aprovação do scan, porque a decisão por tipo está num `===` espalhado que o guard não vê. É exatamente a falha que o guard diz impedir.
- **Correção sugerida:** Mover essas decisões para o plugin (hasOptions, exclusiveCorrect) e fazer o guard procurar também comparações `=== "<TIPO>"` com os literais de QUESTION_TYPES fora de questions/domain, e `Record<QuestionType` fora do registry.
- **Verificação:** O guard de question-type-plugin.test.ts:255-258 só casa `switch (...type...)` em arquivo que cita QuestionType. Ficam de fora question-editor.tsx:122 (`type === "DISCURSIVE" ? ...`), approval-plan.ts:247 (`wanted === "MULTIPLE_CHOICE" || ...`) e a tabela Record<QuestionType, boolean> de mutate-options.ts:25, esta dentro de questions/application, fora do registry do domínio.

#### TST-12

**boundary-count: a regex de interface deixa passar interface genérica, com extends, com objeto aninhado ou com método como propriedade** — baixa · confirmado · `test-quality` · tarefa **H3**

- **Local:** `apps/web/tests/boundary-count.test.ts:55`
- **Cenário:** Uma sexta porta cerimonial escrita como `export interface TransactionRunner<Tx> { … }`, com o mesmo nome da que o teste diz ter pego, ou com `run: () => …`, entra em src/shared/ports sem o teste reclamar.
- **Correção sugerida:** Trocar a regex pela API do TypeScript (ts.createSourceFile, percorrendo InterfaceDeclaration e TypeAliasDeclaration com TypeLiteral e contando MethodSignature e PropertySignature cujo tipo é FunctionType), e acrescentar os cinco casos acima como autoteste do guard.
- **Verificação:** boundary-count.test.ts:55 usa `/export interface (\w+) \{([^}]*)\}/gs`, que exige `{` logo após o nome e para no primeiro `}`. Por construção, interface genérica, com extends, com objeto aninhado antes do método, com método como propriedade (`run: () =>`) e type alias escapam do filtro de verbo da linha 58.

#### TST-13

**O round-trip do .lbb contra o banco só cobre um livro escaneado (questões discursivas, sem alternativas, tags nem metadados)** — baixa · confirmado · `test-gap` · tarefa **G1**

- **Local:** `apps/web/tests/portable-v2-roundtrip.test.ts:30` · também: `apps/web/tests/portable-projections.test.ts:248`, `apps/web/src/modules/portability/infrastructure/prisma-workspace-source.ts:36`
- **Cenário:** Alguém acrescenta uma coluna em Question (ou esquece `weight`/`legacyMarcacao` no select do source ou no create do sink). As projeções seguem idênticas nos testes, e o backup real sai sem o campo: a restauração perde dado em silêncio.
- **Correção sugerida:** Estender o teste de banco com uma questão MULTIPLE_CHOICE completa (alternativas com gabarito e weight, tags, todos os metadados, asset de figura, nickname) e comparar campo a campo o que volta do Prisma após exportar e importar.
- **Verificação:** portable-v2-roundtrip.test.ts é o único teste que importa prisma-workspace-source e prisma-workspace-sink (linhas 39-40), e ele monta o acervo só com book-c.pdf escaneado com book-v1 (linhas 31 e 48). Nenhum outro teste passa uma questão com alternativas, tags e metadados pelo select e pelo create reais.

#### TST-14

**latex-profile.test.ts embute caminho de máquina como padrão e se pula calado onde o arquivo não existe** — baixa · confirmado · `test-quality` · tarefa **H4**

- **Local:** `apps/web/tests/latex-profile.test.ts:65`
- **Cenário:** Ao mover o acervo legado (já aconteceu de /mnt/t para /mnt/bak), o teste de compatibilidade do preâmbulo passa a ser pulado para sempre, também nesta máquina, e o único sinal é um 'skipped' a mais no resumo. Um package esquecido no perfil legado só aparece meses depois, quando uma questão para de compilar.
- **Correção sugerida:** Ler o caminho de LEGACY_LATEX_PREAMBLE (via .env.local, como scan-corpus faz com SCAN_CORPUS), sem default literal, e fazer o skip dizer por que pulou (nome do teste com a variável ausente).
- **Verificação:** latex-profile.test.ts:65-67 usa como padrão literal o caminho de máquina /mnt/d/Chico/banco-questoes.windows/..., contra a convenção de deixar endereço de máquina só em .env.local, e o .env.local não define LEGACY_LATEX_PREAMBLE. O skip em ambiente sem o arquivo está documentado como intencional para o CI, mas é silencioso quando o caminho muda nesta máquina.

#### TST-15

**Asserções negativas depois de sleep fixo de 50 ms passam também quando o componente não renderiza nada** — baixa · plausível · `test-quality` · tarefa **H4**

- **Local:** `apps/web/tests/crop-viewer-image.test.tsx:41` · também: `apps/web/tests/crop-viewer-image.test.tsx:68`, `apps/web/e2e/layout.spec.ts:60`, `apps/web/e2e/questao.spec.ts:184`, `apps/web/e2e/hidratacao.spec.ts:63`
- **Cenário:** Se o erro do pdf.js aparecer depois de 50 ms (máquina carregada, CI), ou se o componente quebrar e não renderizar nada, os dois testes continuam verdes, sem provar o que dizem provar.
- **Correção sugerida:** Afirmar primeiro um estado positivo que prove que o componente montou e terminou de carregar (ex.: esperar o canvas ou a barra de páginas com waitFor), e só então a ausência. Nos E2E, trocar waitForTimeout por espera de estado observável.
- **Verificação:** O padrão existe: crop-viewer-image.test.tsx:41-43 e 68-69 esperam 50 ms e depois afirmam só uma ausência (queryByText(...).toBeNull()), sem antes provar que o componente montou. Não verifiquei um cenário concreto em que o teste passe com o defeito presente, então fica como smell defensável.

## Segurança

### Segurança · Código inteiro, com o modelo de ameaça local-first e cloud-ready

**Resumo do revisor.** A superfície de segurança do código está bem cuidada: `execFile` com vetor de argumentos, `-no-shell-escape`, nomes de asset por lista do que é permitido, storage preso ao `workspaceId`, nenhum `dangerouslySetInnerHTML`, MathJax sem o pacote `html`, nenhum SQL cru, a chave da IA fica no servidor. O ponto fraco é o perímetro. O app não tem autenticação, escuta em todas as interfaces e nenhuma rota confere Origin/Host, então qualquer máquina da rede local, ou uma página qualquer via DNS rebinding, lê e apaga o acervo. Dentro do renderer, `-no-shell-escape` não impede leitura de arquivo: provei num contêiner descartável que o LaTeX lê `/proc/1/environ`, com o `RENDERER_SECRET` dentro. O checklist §13/§15 marca "LaTeX nunca executado de forma insegura" como fechado sem cobrir esse vetor. O resto é de severidade média: zip bomb no `.lbb`, SVG servido inline, raiz do Calibre escolhida pelo cliente, IDOR no upload, jobId fixo no worker.

<details><summary>Cobertura declarada</summary>

LIDOS POR INTEIRO: docker-compose.yml; services/renderer/Dockerfile; services/renderer/src/{compile,auth,server,jobs,format-cache}.ts; packages/render-contract/src/validate-bundle.ts; apps/web/app/api/{tree-http.ts, trash/route.ts, libraries/[libraryId]/route.ts, workspaces/import/route.ts, assets/route.ts, assets/[assetId]/content/route.ts, render-jobs/[jobId]/artifacts/[name]/route.ts, catalog/*.ts, ai/test/route.ts, agents/candidate-render/route.ts, infra/route.ts}; src/modules/publications/infrastructure/calibre-catalog-provider.ts; src/infrastructure/storage/local/local-file-storage-provider.ts (parte principal); src/shared/config/env.ts; src/shared/authorization/question-scope.ts; src/modules/assets/domain/asset-ingestion.ts; src/modules/agents/application/render-candidate.ts; src/modules/rendering/infrastructure/render-worker-executor.ts; src/shared/css-mask.ts. Também li o next.config.ts e o código do Next 16.3 (start-server.js, block-cross-site-dev.js) para confirmar o bind e o escopo do bloqueio cross-site. AMOSTRADOS: portable-archive.ts (readArchive), prisma-workspace-sink.ts (gravação de asset e MIME), prisma-asset-writer.ts, register-uploaded-asset.ts, assets/crop/route.ts (entradas), build-agent-tools.ts (entradas das tools), publication-workbench.tsx (previewChange), checklist §13/§15, cloud-compatibility-report.md; grep por dangerouslySetInnerHTML/innerHTML/trust, $queryRaw*/$executeRaw*, NEXT_PUBLIC, .env versionado, child_process, searchParams e o uso de resolveQuestionScope. PROVA EXECUTADA: num contêiner descartável da imagem latexbookbank/renderer:dev (`--network none`, usuário renderer, segredo de teste), `kpsewhich` devolve openin_any=a, e um documento compilado com `pdflatex -no-shell-escape` leu /etc/passwd, /proc/1/cmdline e /proc/1/environ, imprimindo `RENDERER_SECRET=segredo-de-teste-...` no log. NÃO LIDOS: as rotas de scan, recognition, assessments e publications/* além de uma amostra; o módulo legacy-import (é só script de CLI); services/backup além de um grep; os componentes de UI além da busca por sinks. Também não auditei CVE de dependência além do pdfjs-dist 6.2.108, que não é afetado pela CVE-2024-4367.

</details>

#### SEC-01

**API sem autenticação escuta em todas as interfaces e não confere Origin/Host: a rede local e o DNS rebinding apagam o acervo** — crítica · confirmado · `security` · tarefa **A2** · **feita** (`515ea42`)

- **Local:** `apps/web/package.json:6` · também: `apps/web/package.json:9`, `app/api/trash/route.ts:40`, `app/api/libraries/[libraryId]/route.ts:60`, `app/api/publications/[id]/route.ts:47`, `app/api/tree-http.ts:26`, `app/api/workspaces/import/route.ts:40`, `app/api/workspaces/export/route.ts:23`
- **Regra ou spec:** checklist §13 'Nenhum path de usuário escapa do workspace' / modelo de ameaça local-first sem auth; spec §24
- **Cenário:** LOCAL (hoje): (a) Outra máquina no mesmo Wi-Fi faz `curl http://<ip-do-usuário>:28080/api/libraries`, depois `curl -X DELETE .../api/libraries/<id> -d '{"name":"<nome>"}'` para cada biblioteca e `curl -X DELETE .../api/trash`. O acervo e os arquivos do storage somem, e `GET /api/workspaces/export?workspaceId=` leva tudo antes. (b) Sem estar na rede: uma página maliciosa em evil.com:28080 faz rebinding de DNS para 127.0.0.1. O browser trata as chamadas como same-origin (Host: evil.com:28080 é aceito) e a página lê e apaga como no item (a). (c) CSRF cego: qualquer site visitado faz `fetch('http://localhost:28080/api/workspaces/import',{method:'POST',mode:'no-cors',body:blobDoLbb})` e planta uma biblioteca envenenada (ver SEC-02/SEC-03/SEC-04). CLOUD: o mesmo, só que exposto à internet, sem autenticação nenhuma.
- **Correção sugerida:** (1) Scripts `next dev -H 127.0.0.1 --port 28080` e `next start -H 127.0.0.1 ...`. (2) Criar `apps/web/proxy.ts` (o antigo middleware.ts no Next 16) com matcher `/api/:path*` que recuse com 403 quando o `Host` não estiver numa allowlist (`localhost:28080`, `127.0.0.1:28080` e, no modo cloud, o domínio vindo do env), e, em método não-GET, quando `Origin` existir e não for same-origin, ou quando `Sec-Fetch-Site` for `cross-site`. (3) Fazer o `readJson` exigir `content-type: application/json`, o que força preflight; o import de `.lbb` passa a exigir um Content-Type próprio ou um cabeçalho custom. (4) Um teste de guarda que varre `app/api/**/route.ts` e afirma que o proxy cobre todas. Antes do modo cloud, autenticação de verdade.
- **Verificação:** apps/web/package.json:6 e :8 sobem o `next dev`/`next start` sem `-H`, e o Next 16.3.0 chama `server.listen(port, hostname)` com hostname indefinido (start-server.js:446). Não existe proxy.ts nem middleware.ts, e nenhuma rota confere Origin, Host ou Sec-Fetch. A máquina está numa LAN real (enp7s0 192.168.1.14), então o `DELETE /api/trash` (trash/route.ts:40) e o DELETE de biblioteca, travado só pelo nome, ficam alcançáveis por outra máquina. Ressalva: pelo navegador, o CSRF cego só vale para POST simples, como o import com arrayBuffer (import/route.ts:40); o DELETE exige preflight.

#### SEC-02

**`-no-shell-escape` não impede leitura de arquivo: o LaTeX lê qualquer arquivo do worker, inclusive o RENDERER_SECRET em /proc/1/environ (provado)** — alta · confirmado · `security` · tarefa **A4** · **feita** (`c204f56`)

- **Local:** `services/renderer/src/compile.ts:84` · também: `services/renderer/src/format-cache.ts`, `services/renderer/Dockerfile`, `apps/web/src/modules/agents/application/render-candidate.ts:86`, `docs/_atual/_checklist.md`
- **Regra ou spec:** checklist §15 'LaTeX nunca executado de forma insegura'; §13 'Shell escape bloqueado no LaTeX'
- **Cenário:** LOCAL: uma questão vinda de um `.lbb` de terceiro, do acervo legado ou do scan traz `\verbatiminput{/proc/1/environ}` ou um `\PackageWarning` com o conteúdo lido. Ao compilar, o segredo do worker aparece no PDF e no log do painel. Pior, uma prompt injection no texto do PDF faz o agente chamar `render_candidate_latex` (sem aprovação humana, até 3 vezes por turno) com esse LaTeX, e os avisos com o conteúdo do arquivo vão para o provider externo (OpenRouter/OpenAI). CLOUD: o worker fica exposto pelo reverse proxy do droplet (comentário do docker-compose.yml). Qualquer usuário que compile uma questão obtém o `RENDERER_SECRET` e passa a usar o worker direto, e a baixar artefatos de outros jobs por id (ver SEC-07).
- **Correção sugerida:** Passar `openin_any: "p"` e `openout_any: "p"` no `env` do `execFile` em compile.ts e em format-cache.ts (o kpathsea aceita variável de ambiente por cima do texmf.cnf), e/ou fixar em `/etc/texmf/texmf.d` no Dockerfile. Tirar o segredo do ambiente do PID 1: ler de arquivo (docker secret) e rodar o pdflatex com outro uid, ou pelo menos não herdar o ambiente original, já que /proc/1/environ reflete o bloco inicial e `delete process.env.X` não o limpa. Acrescentar a compile.test.ts um caso que compila `\openin` de `/etc/passwd` e de `/proc/1/environ` e afirma que nada vaza. Corrigir as linhas do checklist §13/§15 para registrar o vetor de leitura.
- **Verificação:** Reproduzi na imagem latexbookbank/renderer:dev: `kpsewhich -var-value openin_any` devolve `a`, e um `\openin` de /proc/self/environ compilado com `pdflatex -no-shell-escape` pôs `RENDERER_SECRET=...` no log. O env de services/renderer/src/compile.ts:84-95 não define openin_any, e nenhum arquivo do repo menciona a variável. O PID 1 é o bun, com o mesmo uid (Dockerfile: `USER renderer`, CMD em forma exec).

#### SEC-03

**Import de `.lbb`: 512 MB bufferizados antes do teto, `unzipSync` sem limite de descompressão (zip bomb) e `data.json` sem schema** — média · confirmado · `security` · tarefa **G3**

- **Local:** `apps/web/src/modules/portability/domain/portable-archive.ts:105` · também: `app/api/workspaces/import/route.ts:40`, `src/modules/portability/domain/portable-archive.ts:158`, `app/api/assets/route.ts:31`
- **Regra ou spec:** checklist §13 'Upload limitado'; tarefa: zip bomb/zip slip no .lbb, 'toda entrada validada com Zod?'
- **Cenário:** LOCAL: a pessoa importa um `.lbb` recebido de alguém, ou um site o planta por CSRF (SEC-01), com 20 entradas de 1 GB de zeros comprimidas em cerca de 1 MB cada. O `unzipSync` aloca cerca de 20 GB e o processo do Next morre por OOM, derrubando o app e qualquer escrita em andamento. Um `data.json` com tipos errados chega ao Prisma e vira 500 opaco, sem mensagem de 'arquivo corrompido'. CLOUD: DoS trivial e repetível do servidor com um POST.
- **Correção sugerida:** Recusar pelo `Content-Length` antes de ler e ler o corpo em stream com contador. Trocar `unzipSync` por `unzip`/`Unzip` do fflate com `filter` que (a) aceite só `manifest.json`, `data.json` e `assets/<sha256>.<ext>` com ext na lista do `MIME`, (b) some `file.originalSize` e aborte acima de um teto (por exemplo 2 GB no total e 64 MB por asset) e (c) limite a quantidade de entradas. Validar manifesto e `data.json` com schema Zod versionado (o projeto já usa Zod no `QuestionPatch`) e mapear a falha para `CorruptArchiveError`, que já vira 422.
- **Verificação:** portable-archive.ts:105 chama `unzipSync(bytes)` sem filtro nem teto de descompressão. Nas linhas 113 e 158, manifesto e data.json entram por cast `as`, sem schema, e um JSON.parse inválido sai como SyntaxError, não como CorruptArchiveError. A rota lê o corpo inteiro com `request.arrayBuffer()` (import/route.ts:40) antes de comparar com MAX_BYTES, e assets/route.ts:31 faz `formData()` antes do limite.

#### SEC-04

**SVG enviado pelo usuário ou vindo de `.lbb` é servido inline, na origem do app, sem nosniff nem CSP sandbox (XSS armazenado)** — média · confirmado · `security` · tarefa **C4**

- **Local:** `apps/web/app/api/assets/[assetId]/content/route.ts:46` · também: `app/api/render-jobs/[jobId]/artifacts/[name]/route.ts`, `src/modules/assets/domain/asset-ingestion.ts:38`, `src/modules/portability/infrastructure/prisma-workspace-sink.ts:334`, `next.config.ts`
- **Regra ou spec:** tarefa: XSS — SVG injetado; checklist §13 'MIME e extensão validados'
- **Cenário:** LOCAL: um `.lbb` compartilhado, ou um upload, traz `figura.svg` com `<script>fetch('/api/libraries').then(...DELETE...)</script>`. Dentro de `<img>` não executa. Quando a pessoa abre a figura em nova aba ('abrir imagem em nova guia', link direto, pré-visualização do navegador), o script roda na origem http://localhost:28080 e tem acesso total à API sem auth: apaga bibliotecas, exporta o acervo. CLOUD: vira XSS armazenado entre usuários de uma biblioteca compartilhada.
- **Correção sugerida:** Nas duas rotas de conteúdo, enviar sempre `X-Content-Type-Options: nosniff`. Para `image/svg+xml` (e qualquer tipo que não seja PNG, JPEG, WebP ou PDF), acrescentar `Content-Security-Policy: sandbox; default-src 'none'; style-src 'unsafe-inline'`, ou servir como `attachment`. Globalmente, `headers()` no next.config.ts com nosniff e uma CSP básica para `/api/assets/*`. Opcional: sanitizar o SVG na ingestão.
- **Verificação:** assets/[assetId]/content/route.ts:44-50 serve o conteúdo com `content-type` vindo da extensão da chave e `content-disposition: inline`. O mimeTypeFromKey (local-file-storage-provider.ts:173) mapeia .svg para image/svg+xml, e o ACCEPTED (asset-ingestion.ts:38) e o MIME do sink (prisma-workspace-sink.ts:334) aceitam SVG sem sanitizar. No app, next.config.ts não tem headers() e não há nosniff nem CSP em lugar nenhum.

#### SEC-05

**A raiz do Calibre vem do corpo da requisição e aceita qualquer caminho absoluto do servidor; o CALIBRE_LIBRARY_ROOT é só um valor inicial da tela** — média · plausível · `security` · tarefa **C3**

- **Local:** `apps/web/app/api/catalog/catalog-http.ts:31` · também: `src/modules/publications/infrastructure/calibre-catalog-provider.ts:172`, `src/modules/publications/infrastructure/calibre-catalog-provider.ts:222`, `app/bibliotecas/[slug]/livros/calibre/page.tsx:65`
- **Regra ou spec:** checklist §13 'Nenhum path de usuário escapa do workspace'; §75 citado no próprio arquivo
- **Cenário:** CLOUD: `POST /api/catalog {path:"/qualquer/dir"}` faz o servidor abrir e copiar qualquer `metadata.db` a que o processo tenha acesso, listar e importar para o storage os arquivos que esse banco referencia dentro daquele diretório (e fora dele, por symlink), além de sondar a árvore de diretórios do servidor pela diferença entre as mensagens. LOCAL: combinado com SEC-01, uma máquina da rede lê livros de qualquer pasta Calibre do disco do usuário e os copia para o acervo.
- **Correção sugerida:** Tratar CALIBRE_LIBRARY_ROOT (ou uma lista CALIBRE_LIBRARY_ROOTS) como allowlist no servidor. O caminho do corpo precisa, depois de `realpath`, estar sob uma raiz permitida, e no modo cloud a rota inteira fica desligada sem configuração. Na leitura de cada arquivo, conferir `realpath(alvo)` contra `realpath(raiz)`. Trocar a mensagem com `error.message` do libSQL por uma genérica, com o detalhe só no log do servidor.
- **Verificação:** parseCatalogPath (catalog-http.ts:31) aceita qualquer caminho absoluto. `calibreLibraryRoot` só aparece como `configuredRoot` da página (calibre/page.tsx:65), e a contenção em calibre-catalog-provider.ts:172 usa path.resolve sem realpath, contendo contra a raiz que o próprio cliente mandou. Numa instalação local de um só usuário, escolher a pasta é o recurso. O risco real depende de SEC-01 ou de um modo cloud, então fica como julgamento de design defensável.

#### SEC-06

**IDOR entre bibliotecas no upload e no recorte: workspaceId, publicationId e questionId do formulário não são conferidos entre si** — média · confirmado · `security` · tarefa **C3**

- **Local:** `apps/web/app/api/assets/route.ts:63` · também: `src/modules/assets/infrastructure/prisma-asset-writer.ts:98`, `app/api/assets/crop/route.ts:43`, `app/api/assets/crop/route.ts:87`, `src/shared/authorization/question-scope.ts`
- **Regra ou spec:** checklist §13 'Chaves de storage prefixadas por workspaceId'; issue #175 (question-scope.ts)
- **Cenário:** LOCAL: um upload com `workspaceId=A` e `publicationId=<livro de B>` torna o PDF guardado sob o prefixo de A a fonte do livro de B. Quando a pessoa exclui a biblioteca A ('de vez', apagando o storage), o livro de B fica com `sourcePdfAssetId` apontando para bytes que não existem mais, e o scan e a origem de B quebram. `workspaceId` inventado deixa diretórios e arquivos órfãos no storage. CLOUD: um usuário anexa ou lê recursos de outra biblioteca por id, exatamente o furo que a #175 fechou só para as rotas de questão.
- **Correção sugerida:** Derivar o escopo no servidor em vez de aceitar três ids soltos: receber `publicationId`, resolver `workspaceId` pelo banco e exigir que `questionId`, quando vier, pertença àquela publicação (generalizar o `resolveQuestionScope` num `resolvePublicationScope`). Recusar com 404 antes de gravar bytes. Aplicar o guarda também no crop, em `/api/questions/[questionId]/*` e em `/api/agents/*`. Criar um teste de guarda que varre as rotas atrás de id vindo do corpo sem resolução de escopo.
- **Verificação:** assets/route.ts:48-72 repassa workspaceId, questionId e publicationId do formulário sem conferir pertinência, e registerUploadedAsset só projeta os campos. PrismaAssetWriter.write faz `publication.updateMany({ where: { id: asBookSourceOf, sourcePdfAssetId: null } })` (prisma-asset-writer.ts:98) sem filtrar por workspace. O crop (crop/route.ts:43 e :87) usa publicationId e questionId sem conferir com source.workspaceId, e o resolveQuestionScope só aparece nas 5 rotas sob publications/[id]/questions/[questionId].

#### SEC-07

**jobId fixo (`preview-${field}`, `candidate-${n}`) colide no JobStore do worker: o antes e o depois compilam em paralelo com o mesmo id** — média · confirmado · `security` · tarefa **F5**

- **Local:** `apps/web/app/api/agents/candidate-render/route.ts:64` · também: `app/publications/[id]/editor/publication-workbench.tsx:497`, `src/modules/agents/application/render-candidate.ts:86`, `services/renderer/src/jobs.ts:44`
- **Regra ou spec:** checklist §12 'Candidate render é isolado'
- **Cenário:** LOCAL: na revisão de patch, a compilação do 'depois' termina antes do GET de artefato do 'antes'. O 'antes' recebe os bytes do 'depois' e o executor lança 'Artefato veio com N bytes' (500 na tela). Quando os tamanhos batem, a pessoa vê a mesma imagem nos dois lados e aprova uma mudança sem diff visual real. CLOUD: dois usuários compilando prévia do mesmo campo ao mesmo tempo podem receber a imagem da questão do outro, um vazamento entre tenants. E, com o segredo vazado por SEC-02, `preview-statementLatex` é um id previsível para baixar a última prévia de qualquer um.
- **Correção sugerida:** Usar `crypto.randomUUID()` (com prefixo `preview-`/`candidate-` se útil para log) nas duas origens. No worker, `enqueue` recusa (409) um jobId que já existe em estado não final, em vez de sobrescrever. Acrescentar um teste com duas compilações paralelas do mesmo campo afirmando que cada uma recebe a própria imagem.
- **Verificação:** candidate-render/route.ts:64 usa `jobId: preview-${field}`, e o workbench (publication-workbench.tsx:497) compila antes e depois em paralelo com o mesmo field. No worker, `enqueue` faz `jobs.set` e sobrescreve a entrada (jobs.ts:44), e `complete` troca os artifacts da entrada compartilhada (jobs.ts:~84). O executor baixa os artefatos num GET posterior e só confere o tamanho (render-worker-executor.ts:70-84), então, conforme a intercalação, um lado recebe 404, 'veio com N bytes' ou os bytes do outro. A corrida depende de tempo e não foi reproduzida, mas o raciocínio fecha no código.

#### SEC-08

**A 'segunda camada' contra `\write18` é contornável e só olha o sourceLatex, mas o checklist a conta como defesa** — baixa · confirmado · `security` · tarefa **A4** · **feita** (`c204f56`)

- **Local:** `packages/render-contract/src/validate-bundle.ts:132` · também: `services/renderer/src/compile.ts:154`, `docs/_atual/_checklist.md`
- **Regra ou spec:** checklist §13 'Shell escape bloqueado no LaTeX (duas camadas)'
- **Cenário:** LOCAL e CLOUD: se alguém um dia remover ou trocar a flag `-no-shell-escape` (o cenário que o próprio comentário diz que a camada existe para cobrir), um documento com `\csname write18\endcsname{...}` passa pela checagem e executa comando no worker. O custo concreto é uma falsa sensação de defesa em profundidade, registrada como fato no checklist.
- **Correção sugerida:** Tratar a regex como heurística e dizer isso no checklist, ou torná-la útil: detectar também `write18` sem barra, `\input|`/`\openin|` e `^^`. Mais eficaz é um teste de contrato no worker que falha se o vetor de argumentos do pdflatex não contiver `-no-shell-escape`, mais o `openin_any=p` de SEC-02 como segunda camada real.
- **Verificação:** A regex de validate-bundle.ts:132 (a linha citada, 131, é a assinatura) só casa `\write18` literal, então `\csname write\endcsname18` ou `^^5c` passam. Ela é aplicada só ao sourceLatex (compile.ts:155), enquanto o preamble do perfil entra direto (compile.ts:128). O checklist §13 (docs/_atual/_checklist.md:2240) a registra como segunda camada, e ela é só uma heurística.

## Em uma linha por eixo

- **Standards:** 38 achados; o pior é [STM-01](#stm-01) (alta) — Perfis e motor mudam a proposta sem subir a versão, e o scan reabre a execução velha.
- **Spec:** 23 achados; o pior é [SPG-01](#spg-01) (alta) — Múltipla escolha perde as alternativas quando o LaTeX vem do reconhecimento ou da revisão.
- **Bugs e corretude:** 49 achados; o pior é [CAP-01](#cap-01) (crítica) — Aprovação parcial marca exercícios como 'já no acervo' apontando para o nó do grupo (âncora gigante).
- **Arquitetura:** 14 achados; o pior é [ARQ-02](#arq-02) (alta) — Orquestração de render copiada nas rotas: os dois caminhos do agente compilam sem assets e falham em toda questão com figura.
- **Testes:** 15 achados; o pior é [TST-01](#tst-01) (crítica) — E2E rodam contra o dev server e o banco do acervo: esvaziam a lixeira real, apagam complemento de questão real e editam questões reais.
- **Segurança:** 8 achados; o pior é [SEC-01](#sec-01) (crítica) — API sem autenticação escuta em todas as interfaces e não confere Origin/Host: a rede local e o DNS rebinding apagam o acervo.
