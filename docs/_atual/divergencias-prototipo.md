# Divergências entre o protótipo e o implementado

> **Protótipo:** `LatexBookBank Beta Editorial.dc.html` — projeto Claude Design
> `e62474e6-3359-40ba-b6fb-0fd57640d89d` (3.681 linhas, navegável por estado).
> **Brief:** `uploads/01_Claude_Design_Ajustes_Finais_LatexBookBank.md` no mesmo projeto.
> **Levantado em:** 11/08/2026, contra `main`.

O protótipo é **contrato visual e comportamental** do Beta Editorial (brief §36). O que ele *não* é,
por decisão explícita do próprio brief (§21 e §34): contrato de CSS, de largura exata, de HTML ou de
biblioteca de ícones. A implementação usa `apps/web/src/design-system/`, e é isso que se espera.

Este documento lista o que diverge em **conteúdo, estrutura e comportamento** — não em pixel.

---

## Estado

| # | Área | Severidade | Situação |
|---|------|-----------|----------|
| 1 | Criar biblioteca — descrição, duplicata, próximo passo | Alta | ✅ resolvido |
| 2 | Home · usuário recorrente | Alta | ✅ resolvido |
| 3 | Biblioteca — tabela de livros | Alta | ✅ resolvido |
| 4 | Livro · overview — tela inexistente | Alta | ✅ resolvido |
| 5 | Rail — três destinos ausentes e nenhuma contagem | Média | ✅ resolvido |
| 6 | Adicionar livro — origens sem explicação | Média | ✅ resolvido (capa e tags fora — ver nota) |
| 7 | Lixeira global | Média | ✅ resolvido |
| 8 | Importar/exportar — dry-run, conflitos, backup | Média | ✅ resolvido (`Comparar` fora — ver nota) |
| 9 | Statusbar — infraestrutura viva | Baixa | ✅ resolvido |
| 10 | Busca global — rodapé de atalhos | Baixa | ✅ resolvido |

---

## Achado fora da lista 2: metade do CSS de layout nunca valeu

`.lbb-acervo{padding:var(--space-6) var(--space-7) var(--space-8)}` parecia certa e **nunca
funcionou**: a escala é `05,1,2,3,4,5,6,8,10,12` e não tem `7`. Um `var()` indefinido invalida a
declaração inteira, então o `padding` sumia por completo — todas as telas de acervo renderizaram
coladas na borda desde que a linha foi escrita, disfarçado pelo recuo próprio do `PageHeader`.

A varredura achou mais quatro do mesmo tipo, todos anteriores a esta rodada: `--text-title`
(diagnóstico), `--surface-default` (render), além de `--text-body-lg` e `--font-serif`. Os cinco
estão corrigidos, `--font-serif` virou token de verdade (serifada do sistema, sem fonte remota), e
`tests/tokens-existem.test.ts` agora recusa qualquer `var(--x)` que não exista.

Efeito colateral honesto: com o recuo passando a valer, o editor caiu para 416px no 1366×768 —
abaixo do piso de 420px que o projeto declara. O painel do workbench voltou a encostar na borda,
agora **por decisão**: num workbench o recuo pertence ao editor por dentro, e é onde o protótipo
também o põe.

---

## Achado fora da lista 3: a outra metade do CSS de layout — as caixas estouravam o pai

O projeto **não tinha reset de `box-sizing`**. Quinze regras escreviam `width:100%` junto com recuo
horizontal ou borda — `.lbb-input`, `.lbb-select`, `.lbb-combo-input`, `.lbb-tree-row`,
`.lbb-pal-item`, `.lbb-wb-item`, `.lbb-row` da Home, todo campo de texto do produto — e sob
`content-box` cada uma media 100% **mais** os dois recuos, estourando o pai pelo tamanho do próprio
recuo.

O sintoma estava na Home desde sempre e ninguém apontou o dedo: as pendências relevantes têm
`CTA com seta` no protótipo, e a seta de `Revisar`, `Abrir a fila` e `Começar` **nunca apareceu** —
ficava fora da caixa, cortada rente à borda direita, com o rótulo colado nela. O código da seta
estava escrito e correto; o que faltava era largura para ela caber.

É irmão do `var(--space-7)` inexistente acima: decisão de layout que parecia escrita e nunca valeu.
A cura das duas é a mesma — parar de depender de acerto individual em quinze lugares. O reset
universal entrou em `tokens.css` (o único CSS da raiz) e `tests/caixa-nao-estoura.test.ts` recusa
tanto apagá-lo quanto desfazê-lo local com `content-box`, verificado removendo o reset de propósito.

Quatro caixas de tamanho fixo com recuo encolheram para o tamanho que a regra declara, que é o que
o protótipo desenha: as duas lombadas (`.lbb-cover`, `.lbb-book-cover`), a linha da árvore e o
`textarea` do montador de avaliação.

---

## Achado fora da lista 5: a simulação da importação nunca olhou para o destino

`toRuntime(portable, existing, newId)` detecta colisão contra o acervo desde a issue #115, tem
teste, e está correta. A rota de import a chamava assim:

```ts
const plan = toRuntime(workspace);   // ← `existing` cai no EMPTY_INDEX
```

Resultado: **a simulação respondia zero conflitos em qualquer cenário**, e a tela dizia isso com
todas as letras. É o pior formato de defeito — o que soa como boa notícia. Quem importasse um
`.lbb` sobre um acervo que já tem os mesmos livros veria “nenhum conflito” e ficaria com tudo
duplicado, sem aviso, na hora exata em que o aviso importava.

Nada disso era bug de domínio: a regra estava escrita, testada e certa. Faltava alguém perguntar ao
banco o que já existe — `readExistingIndex()`.

Duas coisas apareceram junto:

- **Uma colisão por chave, não por item.** Um livro que casa por `legacyId` **e** por `legacyUuid`
  produzia duas colisões. Correto para o domínio, mentira na tela: “2 conflitos” para um livro só
  faz procurar o segundo livro que não existe. `deduplicarColisoes` agrupa por item.
- **A frase não dizia nada.** “2 item(ns) já existem no acervo” não tem nome, não tem números e tem
  o plural de quem desistiu. A do protótipo tem três fatos e uma garantia, e cada um faz trabalho:
  o nome identifica, os dois números provam que não é o mesmo livro parado no tempo, e a garantia
  é o que permite clicar em “Importar” sem medo.

### E o que continua em aberto, que é maior: o `.lbb` do próprio app não tem identidade de origem

A idempotência do import se apoia em `legacyId` e `legacyUuid` — **identidade de origem**, vinda do
sistema legado. Nenhum fluxo do app carimba os dois: nem o cadastro manual, nem a importação do
Calibre. Só o `prisma-workspace-sink` os preserva, quando já vêm no arquivo.

Consequência: um livro criado no app hoje, exportado e reimportado, **duplica em silêncio** — e não
há chave por onde detectar. A detecção de conflito, que acaba de passar a funcionar, só enxerga o
acervo herdado do legado. Para o caso de uso que a tela anuncia (backup e restauração), isso é
metade da promessa.

O conserto não é técnico, é uma decisão: carimbar identidade estável na publicação nascida no app
muda o que um `.lbb` significa — de “um despejo” para “uma cópia identificável desta biblioteca”.
Fica para o CEO. 🤚

---

## Achado fora da lista 4: o apelido do livro existia inteiro e não aparecia em lugar nenhum

`Publication.nickname` está no schema, é normalizado por `parsePublicationDraft`, é validado com
teto de 120 caracteres, é persistido pelo `PrismaPublicationRepository` e atravessa o exportador
`.lbb` em `portable-schema.ts`. **Nenhuma tela do produto o escrevia ou o mostrava.**

O app guardava com cuidado um dado que o usuário não tinha como fornecer nem como ler — a §49 pelo
avesso: aqui não era só endpoint sem jornada, era o caminho inteiro do dado construído e sem as
duas pontas. Um `POST` com `nickname` funcionava perfeitamente desde sempre; só não havia de onde
mandá-lo.

Importa porque é assim que um professor chama o livro. Ninguém digita “Fundamentos de Matemática
Elementar 3” para se referir a ele — digita “FME 3”, e era exatamente essa busca que falhava.

O apelido agora tem as três pontas: campo no cadastro (ao lado do título, 2 para 1, como no
protótipo 2312–2322), etiqueta mono na estante e no resumo do livro, e entrada no filtro da estante
— cuja frase de lista vazia passou a nomeá-lo. `e2e/apelido.spec.ts` percorre o circuito fechado,
porque o defeito não era de nenhuma tela em particular: era de nenhuma delas ter fechado o circuito.

**O que continua sem jornada, pelo mesmo motivo**: `coverAssetId` — o schema guarda, a importação
do Calibre preenche, e não há como escolher uma capa nem vê-la fora da lombada desenhada.

---

## Achado fora da lista: a Home parava de responder

Perseguindo um E2E que falhava **de vez em quando**, apareceu um defeito que não é de design e é
pior que qualquer item acima: as telas de acervo formatavam “há N min” com `new Date()` dentro de um
Client Component — que também roda no servidor. Na virada do minuto o servidor escrevia `há 51 min`
e a hidratação escrevia `há 52 min`; o React descartava a árvore e **a página inteira deixava de
reagir a clique**, com aparência de tela pronta.

Vinte e três testes de E2E passavam por cima disso porque nenhum olhava o console, e os que
clicavam falhavam só quando o run cruzava a virada.

O texto agora é formatado no servidor (tempo relativo não depende de fuso, então nunca houve motivo
para adiar a conta) e `e2e/hidratacao.spec.ts` vigia as três telas por `pageerror` **e** por console
— verificado reintroduzindo o defeito de propósito, para não ser um teste que passa por sorte.

---

## 1. Criar biblioteca

**Protótipo** (linhas 2230–2298)

- Eyebrow `Novo contêiner editorial`, título `Criar biblioteca`.
- Campo **Nome** com hint “Use pelo menos 3 caracteres — o nome aparece na busca e no arquivo
  exportado.” e erro “Dê um nome à biblioteca para continuar.”
- Campo **Descrição (opcional)**.
- Nome repetido é **aviso, não recusa**: “Já existe uma biblioteca com esse nome. Você pode criar
  assim mesmo.”
- Rodapé: “fica no seu computador · pode ser exportada como .lbb depois” e “Você pode renomear
  depois.”
- Depois de salvar, um **segundo passo** dentro do mesmo diálogo: “Biblioteca criada · Ela está
  vazia. O próximo passo é trazer um livro.” com `Adicionar primeiro livro`,
  `Importar do Calibre`, `Abrir biblioteca`.

**Implementado antes**: um campo (nome), duplicata recusada com 409, e navegação direta para a
biblioteca ao salvar.

**Nota sobre a duplicata.** O domínio recusava nome repetido por decisão registrada em
`manage-libraries.ts` — duas bibliotecas homônimas seriam indistinguíveis na tela. O protótipo
inverte isso deliberadamente. Seguimos o protótipo, que é mais novo e é o contrato: a proteção
contra o engano continua existindo, só mudou de forma — de bloqueio para aviso informado.

---

## 2. Home · usuário recorrente

**Protótipo** (288–392)

- Saudação: eyebrow `Continuar trabalhando` + `Boa tarde, Francisco.`
- **Cartão de retomada** rico: miniatura da capa (lombada com título e volume), linha mono
  “última sessão · há 2 h · tudo salvo”, título do livro, caminho completo
  (`Capítulo 1 · Conjuntos › Exercícios propostos › Questão 27`), três ações
  (`Continuar no editor` primária, `Capturar questões`, `Ver o livro`) e uma faixa de rodapé com
  `FME1.pdf · 412 pág.` · `capítulos 9` · `questões 148` · `não validadas 3` (em warn) ·
  `retomar: Ctrl+Shift+O`.
- **Pendências relevantes** — lista de *grupos* de pendência, cada linha com ladrilho colorido,
  contagem grande, título, meta e CTA com seta.
- **Bibliotecas** em **linhas** (não cards), com estatísticas mono, “há quanto tempo” e uma pílula
  de estado; cabeçalho com `ver todas` e `Nova biblioteca`.

**Implementado**: `PageHeader` genérico, faixa de retomada simples, um único banner de “questões
inválidas”, e grades de cards para bibliotecas e livros recentes.

Falta no backend: estatísticas por biblioteca, contagem de capítulos/questões do livro corrente,
nome e páginas do PDF fonte, e a tipagem das pendências em grupos.

---

## 3. Biblioteca

**Protótipo** (423–491)

- Cabeçalho com mono `24 livros · 1.247 questões · última atividade há 2 h`.
- Ação secundária: **exportar a biblioteca (.lbb)** como botão de ícone.
- Barra de filtro: busca por `título, autor, ISBN…`, filtros segmentados e contagem à direita.
- **Tabela**, não cards: capa | Título + subtítulo | Autor | Edição | Questões | Estado (pílula com
  ícone) | Última edição | menu `⋯`.
- Rodapé: “Clique num livro para ver o resumo; duplo clique abre direto no editor.”

**Implementado**: grade de cards com `editora · N nós`. Além da estrutura, `nós` é vocabulário
interno vazando para a interface — o produto fala em questões.

---

## 4. Livro · overview — ✅ resolvido

**Protótipo** (492–599) — tela que **não existia** no app: `/publications/[id]` abria direto o
workbench.

- Capa grande, eyebrow `Publicação · <biblioteca>`, título, subtítulo com autores.
- Grade de metadados em 4 colunas.
- Ações: `Abrir no editor`, `Capturar questões`, `Abrir fonte (PDF)`, `Metadados`.
- Seção **“Precisa da sua atenção”** em warn, com as pendências do livro e CTA por linha.
- **Estrutura**: capítulos com barra de progresso e contagem.
- **Fonte editorial**: arquivo, páginas, tamanho, origem da importação, `Abrir e recortar`, e
  **progresso de captura** (`148 / ~410`, “capítulos 1–4 revisados”).

O rail do protótipo separa `Publicações` de `Editor do livro` justamente porque existe essa parada
intermediária entre escolher um livro e editá-lo.

**O que foi feito.** O editor mudou para `/publications/[id]/editor` e a rota do livro passou a ser
o resumo. Os quatro blocos existem; a estrutura conta a **subárvore** de cada capítulo (a questão
mora dois ou três níveis abaixo dele, e contar filhos diretos daria zero em qualquer livro real), e
a barra tem três tons porque largura sozinha não distingue “quase pronto” de “quase todo errado”.
O rail ganhou `Editor do livro`, e o breadcrumb do editor ganhou o degrau `Editor` — sem ele o
título do livro seria o último item e o `Breadcrumb` não o transformaria em link, deixando o resumo
sem caminho de volta.

**A única coisa que o protótipo pede e o app não entrega: `148 / ~410`.** O `410` é uma estimativa
por página do PDF, e **a contagem de páginas não está guardada** — o `PdfCropViewer` a deriva no
cliente e descarta. A Home já tinha tomado essa decisão uma vez. O denominador virou o número real
de recortes feitos, e a linha de baixo diz até que página o trabalho chegou — que é verdade e é a
mesma pergunta respondida. Guardar `pageCount` no `Asset` na ingestão resolveria; é trabalho de
outra fatia.

---

## 5. Rail

| Protótipo | App |
|---|---|
| Acervo: Início · Bibliotecas `3` · Publicações `24` · **Editor do livro** | idem ✅ |
| Produção: Captura `7` (badge warn) · Avaliações | idem ✅ |
| Sistema: **Importar / exportar** · **Lixeira** | idem, mais Diagnóstico ✅ |

**As contagens vêm de um resumo só** (`readRailSummary`), lido uma vez por requisição no layout raiz
e distribuído por contexto. O rail é montado por **toda** tela: buscar a contagem onde ela é usada
seriam oito consultas e oito chances de um número discordar do outro na mesma sessão.

Por contexto e não por `fetch` no cliente, apesar de o segundo ser mais fácil: o número apareceria
depois da montagem, com o rail pulando de largura no primeiro frame de cada navegação.

Zero não vira badge — `Bibliotecas 0` gasta tinta para dizer que não há nada, e o rail paga esse
ruído em toda tela. E `Captura` é a única em warn, como no protótipo: as outras são tamanho do
acervo — informação —, e um número em âmbar que não pede ação nenhuma ensina a ignorar o âmbar.

**Armadilha registrada**: `rail-counts.tsx` é Client Component e importava o `EMPTY_RAIL_SUMMARY`
do módulo `server-only`. Importar um **valor** (não um tipo) de lá arrasta o Prisma para o bundle do
cliente, e o Next recusa a página inteira com um 500. O contrato mudou para
`domain/rail-summary.ts`, sem `server-only`; a consulta ficou na infraestrutura.

`Editor do livro` entrou com a §4: até existir o resumo do livro, ele e `Publicações` apontavam
para o mesmo lugar, e o destino não tinha o que ser. Como `Captura`, depende de um livro corrente —
sem ele cai na lista de publicações, porque botão que não leva a lugar nenhum é pior que ausente
(§81). O `AppShell` passou a aceitar `publicationId` para isso.

Faltam dois destinos (`Importar / exportar`, `Lixeira`) e todas as contagens. `WorkbenchModule` já
aceita `badge`, então o que falta é a fonte de dados — um resumo único serviria todas as telas.

`Diagnóstico` não está no rail do protótipo mas é frame previsto (brief §31.28); fica.

---

## 6. Adicionar livro — origens — ✅ resolvido

O protótipo (2431–2481) dá **quatro** origens, cada uma com uma frase que explica o que faz:

- *Importar do Calibre* — “Absorve metadados, capa e o arquivo-fonte de um livro já catalogado.”
- *Cadastrar manualmente* — “Título, autor e editora agora; ISBN, série e capa quando você quiser.”
- *A partir de um arquivo* — “PDF, imagem ou EPUB como fonte editorial de um livro novo.”
- *Importar acervo .lbb* — “Traz livros e questões já estruturados — não cria um livro novo.”

**A quarta origem** entrou, e não como tela própria: um livro que nasce de um PDF é um livro
cadastrado com uma fonte anexada, e o app já sabia fazer as duas coisas. O que faltava era **dizer**
que são duas e emendá-las — `?fonte=arquivo` avisa na entrada e, ao salvar, troca a ação primária
de “Abrir no editor” para “Anexar a fonte”. Oferecer o editor a quem está com o PDF na mão é mandar
guardar o arquivo e voltar depois.

Ela e “Importar acervo .lbb” pareciam a mesma operação com extensões diferentes enquanto nenhuma
das duas dizia o que fazia. São opostas: uma cria **um** livro, a outra despeja um acervo inteiro e
não cria livro nenhum.

**O que faltava no cadastro manual era só o apelido — e o apelido é o achado desta rodada. Ver
abaixo.** Progressive disclosure, “Só o título é obrigatório”, idioma, série e volume já estavam.

**O que deliberadamente não entrou, e por quê:**

- **Capa.** Exige a plumbing de upload de imagem no cadastro (o `AssetDropzone` existe, mas só na
  ingestão, e ligado a uma publicação que já existe). `coverAssetId` está no schema e continua sem
  jornada — é a mesma dívida do apelido, um degrau acima.
- **Tags no livro.** **Não têm suporte no schema**: `Tag` é por workspace e se liga a `Question`
  via `QuestionTag`. Não há `PublicationTag`. Pôr o campo na tela sem isso seria um campo que
  aceita texto e o descarta — pior que campo ausente.

---

## 7. Lixeira global — ✅ resolvido

Protótipo (1889–1921): tela de sistema listando o que foi excluído em **todo** o acervo, com o que
cada item levou junto (“levou 6 questões com ele”), `Restaurar (7 itens)`, contagem
`2 itens · 8 objetos` e `Esvaziar lixeira`.

**Antes**: diálogo de lixeira **por publicação**, sem visão global e sem esvaziar. Isso responde
"o que apaguei neste livro" e não responde a pergunta que faz alguém procurar a lixeira: "apaguei
alguma coisa e não lembro onde" — quem não lembra o livro precisaria abrir os vinte e quatro.

**O que foi feito.** `/lixeira` no rail, com uma linha por **ato de exclusão** e não por linha do
banco: excluir um grupo apaga sete nós e é uma decisão só. A conta que sustenta
`Restaurar (7 itens)` é a mesma que o `restoreNode` executa, e é pura e testada — o botão é uma
promessa numérica, e errá-la significa devolver menos do que se prometeu, com o usuário descobrindo
isso ao olhar uma árvore incompleta em vez de uma mensagem de erro.

**O defeito que a implementação da §7 obrigou a resolver: `Question` órfã.**
`DocumentNode.questionId` aponta para `Question` e **não há cascade nesse sentido**. Um "esvaziar"
ingênuo apagaria só o nó e deixaria a questão viva — invisível em toda tela e contando nos totais
para sempre. O sintoma seria um número que não fecha, meses depois; a causa, uma linha ausente.
`emptyGlobalTrash` apaga as duas numa transação e devolve as duas contagens, e é exatamente sobre
essas contagens que `e2e/lixeira-global.spec.ts` assere.

O `SourceAnchor` **fica**: não é conteúdo da questão, é a marca de onde no PDF ela foi recortada, e
D29 trata a fonte como imutável e compartilhável — apagá-la destruiria a proveniência de questões
que continuam vivas.

**Ambiguidade que a tela nova criou, e foi corrigida no produto e não só no teste**: o workbench
tinha um botão `Lixeira` (por publicação) e o rail passou a ter outro (global). Duas coisas
diferentes com o mesmo nome na mesma tela é o convite para clicar na errada. A do livro agora se
chama `Lixeira do livro`.

---

## 8. Importar / exportar — 🟡 parcial

Protótipo (1829–1888): uma tela só, com **simulação da importação (dry-run)** — tamanho do arquivo,
quantas bibliotecas/publicações/questões, **conflitos detectados** (“‘FME 1’ já existe com 148
questões — o arquivo traz 152. Nada será sobrescrito sem sua escolha.”), ações `Comparar`,
`Importar (mantendo os dois)`, `Abortar`, exportação por biblioteca e **backup** (“Último backup
automático há 1 h · 3 cópias mantidas”, `Restaurar de um backup`).

**Feito**: a tela entrou no rail como “Importar / exportar” — o último destino que faltava (§5). O
painel do dry-run tem o cabeçalho com nome e tamanho do arquivo, a grade de quatro células com
`conflitos` em warn, as linhas de conflito com a frase inteira, `Importar (mantendo os dois)` e
`Abortar`. A exportação por biblioteca passou a morar aqui também — quem chega em “importar e
exportar” veio pensando em portabilidade, não numa biblioteca específica.

**O defeito que estava por baixo do painel: a simulação nunca olhou o destino.** Ver o achado 5.

**`Comparar` não entrou.** Comparar duas versões de um livro — 148 questões aqui, 152 no arquivo —
é uma tela de diff que não existe e que não é um botão: é a mesma máquina do `patch-diff` do
agente apontada para outro alvo. Um botão que abre um “em breve” é pior que botão ausente (§81).

**Backup não existe, e a tela diz isso.** Não há job, não há rotação, não há onde as cópias
morariam. “Último backup automático há 1 h · 3 cópias mantidas” é a única frase do protótipo que
este app não pode escrever sem mentir — e uma tela que afirma existir uma rede de segurança
inexistente é descoberta no dia em que se precisa dela. O cartão diz o que é verdade (`backup
automático · não implementado`) e qual é o caminho que funciona hoje: exportar `.lbb` e guardar
fora do computador. `e2e/importar.spec.ts` **falha se alguém colar a frase do protótipo**.

**Correção de percurso da própria rodada**: a primeira versão do cartão de exportar empilhava um
botão por biblioteca. Com as 72 do banco real, virou uma coluna de setenta e dois botões idênticos
que empurrou o cartão de backup para fora da tela. Lista longa não é menu de ações — é escolha, e
escolha tem controle próprio. Virou um `Select` e um botão.

---

## 9. Statusbar — ✅ resolvido

Protótipo: `local-first` · `worker de render: pronto` · `gemma3:12b carregado` · `backup há 1 h`.

**Antes**: `SQLite · local` e uma contagem. O `collectDiagnostics` já media worker, modelo e backup
— e a página de Diagnóstico era o **único** lugar que via. O terceiro caso da rodada em que o
produto sabia e não dizia.

Agora a barra diz `local-first · SQLite · render: pronto · ia: qwen3-coder:30b · backup: …`, e o que
não está `ok` sai em warn. `local-first` vem do servidor e está lá desde o primeiro byte; o resto
chega por `/api/infra` depois da montagem, porque `probeRenderer` bate na rede com timeout e
pendurar isso no layout faria **toda** navegação esperar antes do primeiro byte. Enquanto não
chega, a barra diz `verificando…` — que é verdade, e é diferente de dizer `pronto` por otimismo.

Correção de percurso: a primeira versão pôs `local-first · SQLite` no `AppShell` sem tirar das
telas, e a barra saiu com “local-first · SQLite   SQLite · local”. O e2e conta quantas vezes
`SQLite` aparece.

---

## 10. Busca global — ✅ resolvido

Protótipo: rodapé com `↑↓ navegar · ⏎ abrir no lugar certo · ⇧⏎ abrir ao lado` e a legenda “busca no
enunciado, tags, banca e ano”.

Os atalhos entraram, e `⇧⏎` **funciona** — não era só rótulo: `Command` ganhou `href`, porque abrir
ao lado exige uma URL e `onSelect` é uma função, com a qual o navegador não tem o que fazer. Diz
`abrir em nova aba` e não `abrir ao lado` porque é isso que ele faz: não há painel lateral neste
app, e prometer um seria inventar a tela.

**A legenda diz o que a busca faz, e não o que o protótipo desenha.** A busca livre olha
`statementLatex` e `nickname`; tag, banca e ano são **filtros estruturados**, não texto livre.
Prometer “busca em tags, banca e ano” manda procurar defeito na busca quando o resultado vazio é o
correto. A frase é `busca no enunciado e no apelido · tag, banca e ano são filtros`.

Sem a legenda, uma busca que não acha nada é indistinguível de um acervo que não tem nada — e as
duas pedem coisas opostas de quem está na frente da tela.
