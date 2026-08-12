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
| 5 | Rail — três destinos ausentes e nenhuma contagem | Média | 🟡 parcial (`Editor do livro` e `Lixeira` feitos; falta `Importar/exportar` e as contagens) |
| 6 | Adicionar livro — origens sem explicação | Média | 🟡 parcial (seletor feito; cadastro manual pendente) |
| 7 | Lixeira global | Média | ✅ resolvido |
| 8 | Importar/exportar — dry-run, conflitos, backup | Média | ⬜ aberto |
| 9 | Statusbar — infraestrutura viva | Baixa | ⬜ aberto |
| 10 | Busca global — rodapé de atalhos | Baixa | ⬜ aberto |

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
| Acervo: Início · Bibliotecas `3` · Publicações `24` · **Editor do livro** | Início · Bibliotecas · Publicações · **Editor do livro** ✅ |
| Produção: Captura `7` (badge warn) · Avaliações | Captura · Avaliações |
| Sistema: **Importar / exportar** · **Lixeira** | Diagnóstico |

`Editor do livro` entrou com a §4: até existir o resumo do livro, ele e `Publicações` apontavam
para o mesmo lugar, e o destino não tinha o que ser. Como `Captura`, depende de um livro corrente —
sem ele cai na lista de publicações, porque botão que não leva a lugar nenhum é pior que ausente
(§81). O `AppShell` passou a aceitar `publicationId` para isso.

Faltam dois destinos (`Importar / exportar`, `Lixeira`) e todas as contagens. `WorkbenchModule` já
aceita `badge`, então o que falta é a fonte de dados — um resumo único serviria todas as telas.

`Diagnóstico` não está no rail do protótipo mas é frame previsto (brief §31.28); fica.

---

## 6. Adicionar livro — origens

O protótipo (2431–2481) dá **quatro** origens, cada uma com uma frase que explica o que faz:

- *Importar do Calibre* — “Absorve metadados, capa e o arquivo-fonte de um livro já catalogado.”
- *Cadastrar manualmente* — “Título, autor e editora agora; ISBN, série e capa quando você quiser.”
- *A partir de um arquivo* — “PDF, imagem ou EPUB como fonte editorial de um livro novo.”
- *Importar acervo .lbb* — “Traz livros e questões já estruturados — não cria um livro novo.”

O app tem três botões sem descrição nenhuma, e não distingue “arquivo como fonte de um livro novo”
de “importar acervo”.

O cadastro manual do protótipo (2298–2430) também é mais completo: **apelido**, capa, idioma,
série, volume, e um progressive disclosure (`Mais detalhes`) — com “Só o título é obrigatório”
escrito na tela.

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

## 8. Importar / exportar

Protótipo (1829–1888): uma tela só, com **simulação da importação (dry-run)** — tamanho do arquivo,
quantas bibliotecas/publicações/questões, **conflitos detectados** (“‘FME 1’ já existe com 148
questões — o arquivo traz 152. Nada será sobrescrito sem sua escolha.”), ações `Comparar`,
`Importar (mantendo os dois)`, `Abortar`, exportação por biblioteca e **backup** (“Último backup
automático há 1 h · 3 cópias mantidas”, `Restaurar de um backup`).

App: `/importar` sem dry-run, sem resolução de conflito e sem backup.

---

## 9. Statusbar

Protótipo: `local-first` · `worker de render: pronto` · `gemma3:12b carregado` · `backup há 1 h`.

App: `SQLite · local` e uma contagem. A infraestrutura viva — render e modelo — não aparece, e é
justamente o que o usuário precisa saber antes de mandar renderizar.

---

## 10. Busca global

Protótipo: rodapé com `↑↓ navegar · ⏎ abrir no lugar certo · ⇧⏎ abrir ao lado` e a legenda “busca no
enunciado, tags, banca e ano”. O app não mostra os atalhos nem o escopo da busca.
