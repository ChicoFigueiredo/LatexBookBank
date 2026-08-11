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

**Progresso:** 854 ✅ · 5 ◐ · 14 ⛔ · 126 `[ ]` — e **110 dos 126 abertos estão em quatro blocos que
não são trabalho de código**: a Fase 6.5 (42, parada na decisão de storage), a Fase 11 (41, parada
no acervo que não está nesta máquina), o §33 "Legado" (8, o mesmo motivo) e a conferência visual
(20, que é do Chico). **Fora deles sobram 16 itens.**
**Última atualização:** 2026-08-11 — **o erro que doze E2E não viam** (#183): o worker do Monaco
não carregava e a tela da questão estourava um `TypeError` não tratado a cada abertura. Nenhum teste
olhava o console. O painel de histórico, sondado na mesma volta, está correto — inclusive ao dizer
"idêntica ao estado atual" em vez de desenhar um diff vazio.
**Antes:** **a busca deixou de mostrar beco sem saída** (#181): ela não
filtrava o nó, e devolvia questão da lixeira e questão órfã — a mesma questão aparecia seis vezes na
paleta. Achado exercitando o `Ctrl+K` que a #179 destravou.
**Antes:** **os atalhos, medidos** (#179). O caminho do agente passou
limpo pela sonda de escopo (revisão de outra questão, questão inexistente e campo fora da whitelist
são todos recusados), então a iteração foi para o item aberto desde a Fase 2. A árvore não conflita
— seus atalhos vivem na linha. O conflito real era o oposto do esperado: o Monaco engolia o
`Ctrl+K` e a paleta não abria, com o botão do rail anunciando o atalho.
**Antes:** **escopo nas demais rotas** (#177). A árvore já conferia a
publicação; a montagem de prova **não conferia a biblioteca**, e uma questão de outro acervo entrava
com `201`. Verificado com duas bibliotecas de verdade e com controle positivo — sem o guarda, passa.
**Antes:** **o guarda central de autorização** (#175), e ele achou um
buraco de verdade: o `publicationId` da URL era decorativo nas rotas de questão, então dava para
gravar uma questão real por uma publicação inexistente — e o 200 confirmava.
**Antes:** **figura na questão, de ponta a ponta** (#173): o
`figureSnippet` existia desde a Fase 14 e nada o chamava, e inseri-lo teria produzido LaTeX que não
compila — nenhum asset chegava ao worker. Agora chega, e só o que o corpo cita. No caminho
apareceram mais dois: `!pdfTeX error:` (sem espaço) não virava diagnóstico, então uma figura
corrompida dava "falha ao compilar" **sem motivo na tela**; e a rota de upload devolvia a
`storageKey`, que a D26 diz nunca sair do servidor.
**Antes:** **apagar uma avaliação** (#171), achado exercitando o produto
em vez de ler a lista: dava para criar e nunca apagar. A correção não era só a rota — o mapa de
letras de uma variante é o gabarito de uma prova que pode já ter sido impressa, então com variante o
servidor recusa com 409 e a tela faz uma segunda pergunta.
**Antes:** **o registry passou a mandar na compilação** (#165): o
`buildLatex` do plugin existia desde a Fase 7 e nunca teve chamador, então acrescentar um tipo de
questão dava validação própria, preview próprio e um PDF igual ao da múltipla escolha. Era a última
dívida que o confronto com o planejamento tinha achado. O plugin passou a devolver **blocos**, para
que o mapa de linhas da #161 saia da mesma montagem que o texto.
**Antes:** **`bun run setup` deixou de mentir** (#168): ele agora constrói
a imagem do renderer, sobe o worker, espera o `/health` e sincroniza o segredo entre o `.env` da
raiz e o `.env.local` — as duas checagens que o planejamento marca como *obrigatórias* desde a Fase
0, e que estavam abertas desde então. A página de diagnóstico ganhou o cache de render (tamanho,
jobs, último erro) e o TeX do host marcado como fallback. Um clone novo vira produto rodando com
`bun run setup && bun run dev`, sem ler comentário de `.env.example`.
**Antes, no mesmo dia:** **os dois defeitos que impediam usar o produto** (#156, #166).
Salvar duas vezes seguidas dava 409 e o autosave parava, então valia um salvamento por carregamento
de página; e recompilar uma questão cuja saída não mudou dava 500 dizendo "falha ao compilar" sobre
uma compilação bem-sucedida. O segundo apareceu **ao consertar o primeiro**, e o E2E que estava
`fixme` desde a #155 voltou a valer — **7 de 7**.
**Antes, no mesmo dia:** confronto com o [`_planejamento.md`](./_planejamento.md), fase a fase
(ver §16). A revisão fechou duas linhas do critério de produto local que já tinham prova —
IA local e ferramentas TeX — e marcou como **decisão**, não esquecimento, a virtualização da árvore
e os migradores de formato do `.lbb`.
**Antes, no mesmo dia:** a interface de render fechada (#161): copiar o LaTeX, tela
cheia, diagnósticos sublinhados no Monaco e clicáveis. Fechar o quarto exigiu consertar a **linha**:
o contrato prometia a linha do `sourceLatex` e entregava a do `main.tex`, com o preâmbulo na frente.
Errava por um quando o formato pré-compilado funcionava e pelo preâmbulo inteiro quando não — e
apareceram mais dois buracos no caminho: a aba Log nunca teve log (o `stdout` era guardado e nunca
devolvido) e a aba Fonte mostrava o enunciado chamando-o de "o corpo enviado ao worker".
**Antes, no mesmo dia:** auditoria das seções finais. O §12 (painel agêntico), o §13
(segurança) e quase todo o §15 (regras invioláveis) estavam **inteiros abertos** contra fases
fechadas: 21, 19 e 14 linhas que já tinham guarda, teste ou verificação em alguma fase e nunca
foram cruzadas. Fechado também o bloco "Questão" e o "Agente" do §10, e os quatro itens de schema
da Fase 7 que já estavam no banco desde a Fase 0. Os dois health checks da Fase 0 deixaram de ser
⛔ e viraram `[ ]`: a Fase 6 chegou, então o impedimento acabou — o que falta é o `setup` verificar.
**Revisão anterior — 2026-08-07** — Fase 1 fechada em código (falta o aceite visual); Fase 2
fechada em mecânica. **Fase 3 com o Monaco de pé** (#43, #45): edição, autosave e conflito
visível. **Fase 4 fechada** (#47, #49, #51): o conhecimento LaTeX do legado está no banco — 652
autocompletes, 2.740 símbolos, 13 grupos, 28 menus, com as quatro contagens fechando contra o
levantamento —, os autocompletes sugerem dentro do Monaco e a palette de símbolos insere no
cursor. As miniaturas precisaram ser convertidas de SVG font para `<path>`: o formato do legado
não renderiza em navegador nenhum desde que Chrome, Firefox e Safari removeram suporte.
**Fase 5 fechada em código** (#53, #55): o `PreviewModel`, o leitor de LaTeX e o preview na tela,
com MathJax local. Falta só a conferência visual, que fica com o Chico.
**Fase 6 em andamento** (#57, #59, #61, #63, #65): contratos isolados por teste, worker
compilando e exposto por HTTP, imagem verificada dentro do contêiner, compose com **saída de rede
bloqueada comprovada nos dois sentidos**, e o `RenderWorkerExecutor` ligando a aplicação ao
worker, com `RenderJob` persistido, artefatos no `StorageProvider`, cache por content hash,
perfis de compilação, API de render e as abas PDF/PNG/Log. **Verificado ponta a ponta**: uma
questão real do acervo demo compila pela API, mostra `R$` e as alternativas a)–e), a segunda
chamada acerta o cache e o artefato baixa pela rota do app. O preâmbulo pré-compilado corta a
compilação de 1886 ms para 508 ms, e os renders são coalescidos. **Fase 6 fechada em código** —
restam os itens que dependem de infraestrutura futura (assets da Fase 11, `QuestionTypePlugin` da
Fase 7) e a conferência visual.
**Fase 8 iniciada** (#91): o `OpenAiCompatibleProvider` — **um** provider com `baseURL`
configurável, não quatro adaptadores — com os quatro perfis e a matriz de capacidades. A chave
vive só no servidor, e há teste percorrendo o grafo de imports de cada `"use client"` para provar
que nenhum caminho chega até ela. Verificado contra o Ollama real da máquina: 13 modelos listados
e uma resposta completa, com uso e razão de parada lidos corretamente.
O painel do agente veio junto (#93): contexto montado por gesto, nunca por dedução — nada entra
sem aparecer na barra, e o teste de fronteira da chave achou um vazamento real no caminho, um
Client Component importando tipo de módulo `server-only`.
As sete tools somente leitura vieram em seguida (#95), com o guarda que varre o módulo atrás de
escrita, SQL cru e processo externo — e o lint de boundary recusou a implementação Prisma dentro
de `modules/agents/`, que foi parar em `infrastructure/agent/` onde a composição fica visível.
O runner fechou a fase (#97): modo `ASK` com laço de tools, `ToolCallCard` na timeline e
`AgentRun` persistido. Verificado contra o Ollama real — e foi a verificação que corrigiu o
desenho duas vezes: o modelo inventava id de questão até o id deixar de ser parâmetro, e gastava
as três rodadas relendo a mesma coisa até a última volta passar a ir sem tools.
**Fase 9 iniciada** (#99): `QuestionPatch` em Zod com whitelist versionada, as cinco tools
`propose_*` e o diff por campo. Verificado contra o Ollama real — que revelou o modelo propondo o
**mesmo patch três vezes**, uma por rodada, mesmo instruído a não repetir; a bandeja passou a
descartar repetição comparando conteúdo, não a frase.
O bloco de aplicação veio em seguida (#101): `Revision`, aplicação transacional com a revisão
anterior gravada antes, aplicação seletiva e reversão. Verificado contra o acervo real — aplicar
uma linha entre duas propostas mexeu só nela, a revisão guardou o estado inteiro do antes, e
reverter devolveu a questão exata, com o gabarito intacto.
A tela de revisão fechou o fluxo (#103): diff por linha com Monaco no LaTeX, aprovação seletiva
com **nada marcado por padrão**, aplicar/rejeitar/pedir revisão e o modo `REVIEW`. Verificado
contra o Ollama real: o modelo leu a questão, propôs, a bandeja descartou a repetição — e o
próprio modelo reconheceu que já tinha proposto — e o servidor devolveu o diff calculado.
`render_candidate_latex` fechou a apresentação (#105): compilar para conferir, nunca para
guardar. Verificado contra o worker real — `Undefined control sequence` em `main.tex:2` chegou ao
agente em 181 ms, e a prévia antes/depois compilou a questão de verdade em 348 ms, com
`\SI{1000}{\real}` virando `1000 R$` e nada indo para o banco.
Os cinco modos fecharam a Fase 9 (#107): um modo é um conjunto de tools, um teto de iterações e
um relógio — não um prompt diferente. A verificação contra o Ollama real mostrou o ciclo do
`FIX_LATEX` funcionando (compilou o erro, corrigiu, compilou de novo) e revelou que o timeout do
provider matava o turno antes do orçamento do modo.
A aba Histórico fechou a Wave C (#109): timeline com origem, diff entre revisão e estado atual, e
restauração com confirmação. O teste que importa é o da ida e volta — restaurar devolve o estado
**exato**, com acento, `\\` e gabarito intactos; "parecido" seria pior que nada, porque ninguém
confere caractere a caractere um enunciado que já parece certo.
**Fase 11 iniciada** (#111), com uma ressalva importante: **o acervo legado não está nesta
máquina** — só o `LatexMetadata.db` da Fase 4. O domínio do importador foi construído a partir do
levantamento §2.4/§6, que é detalhado e feito contra dados reais; o que **não** dá para fazer é
rodar o import e conferir contra o acervo, e isso fica ⛔ até o acervo estar disponível.
**Fase 12 fechada** (#113), e a medição mudou o desenho: com `LIMIT 50` o `LIKE` responde em
0,2 ms mesmo em 200 mil linhas, mas o `COUNT(*)` que o acompanhava custava 85 ms. O caro nunca foi
buscar — era contar. O adaptador passou a pedir `limit + 1` linha e nenhuma contagem.
**Fase 13 iniciada** (#115): o formato `.lbb` com schema portável versionado, assets endereçados
por `sha256` e round-trip provando identidade. UI, serviço de backup e progresso ficam para a
próxima.
Export, import e o serviço de backup vieram em seguida (#117). Round-trip verificado **contra o
banco real**: exportar a biblioteca demo, importar num workspace novo e reexportar devolveu
`data.json` idêntico — e o mesmo vale para um arquivo produzido pelo backup automático.
A página de diagnóstico (#119) fechou pendências de três fases de uma vez: o "testar conexão" que
faltava da 8, a leitura do estado de backup e a UI de export/import da 13, e a §25 da 17. Ela
distingue **três** estados — no ar, fora do ar e não configurado —, porque os dois últimos mandam
procurar em lugares opostos.
**Fase 14 iniciada** (#121): âncora normalizada, ingestão e o snippet de figura. A prova do crop
foi feita com `pdftocairo` sobre um PDF real — a mesma bbox recortou o mesmo conteúdo em três
DPIs, que é exatamente o que a D28 promete. O visualizador de PDF com desenho de retângulo fica
para a próxima: é UI pesada e a conferência é visual.
Upload e recorte vieram em seguida (#123). O recorte é feito no cliente — o visualizador já
rasteriza a página para mostrá-la, e recortar o que está na tela custa uma chamada de canvas. O
que sobe é a **caixa normalizada** mais o PNG; a fonte nunca é tocada.
**Fase 15 verificada com modelo de visão real** (#125): o `gemma3:12b` leu
`M = C(1 + i)^n - \frac{\sqrt{x^2 + 1}}{2n}` de um recorte de
`M = C\left(1+i\right)^{n} - \frac{\sqrt{x^2+1}}{2n}` — equivalente —, o LaTeX lido compilou, e
o confronto visual entre o recorte e o resultado é idêntico.
**Fase 16 com o aceite provado** (#127): dois processos `bun` separados, mesma seed, 1695 bytes
idênticos. E a distribuição foi medida, não presumida — 2,57% de desvio máximo em 60 mil provas.
Os modelos e os três templates vieram em seguida (#129), com as três versões **compiladas** e
conferidas na imagem: aluno e professor com a mesma ordem e as mesmas letras, e o gabarito
(`— · a · d`) igual aos `[X]` do professor.
**Fase 17 com os guardas de verdade** (#131): as afirmações de endurecimento viraram testes que
varrem o repositório — e foram conferidos contra uma violação deliberada, que os três pegaram.
O visualizador de PDF com recorte veio em seguida (#133), com as regras de arrastar e
redimensionar num **módulo puro** — regra dentro de `onMouseMove` é regra que ninguém testa.
E a tela que amarra tudo (#135): os três gestos de upload num componente só, e a ingestão
completa em `/publications/[id]/ingestao`. O teste do teclado achou uma recursão de verdade — o
clique do `input` escondido subia até o `div`, que clicava o `input` de novo.
**"Voltar à origem" fechado** (#137): a aba Origem abre o PDF na página da âncora com a caixa
destacada. A âncora já guardava tudo desde a Fase 14 — faltava a porta, e proveniência que não se
navega é proveniência que ninguém confere.
**Painéis órfãos ligados** (#139): `MetadataPanel` e `OptionsEditor` existiam, tinham teste, e não
eram renderizados em lugar nenhum — este checklist os dava por prontos. Agora estão montados, e os
metadados ganharam o caminho de escrita que nunca tiveram.
**Tags saíram do domínio para a tela** (#141): adaptador Prisma, três rotas, painel na questão e
filtro na árvore. A promessa de #85 foi conferida contra o banco pela primeira vez — três grafias
de "Função Quadrática" continuaram sendo **uma linha**.
**A avaliação virou produto** (#143): persistência, quatro rotas e a tela de montagem. A cadeia
inteira foi conferida com dado real e prova compilada — o mapa gravado no banco diz `c`, a rota
responde `c`, e o `c)` impresso na prova do aluno é a alternativa correta. As três versões
compilaram (30 702 · 53 021 · 16 440 bytes) e o gabarito saiu `1) e · 2) c · 3) —`.
**Cancelamento de verdade** (#148): desistir do render passou a chegar ao worker — e apareceu que
a imagem do renderer estava **inbuildável desde a Fase 13**, porque o `Dockerfile` não conhecia o
serviço de backup. O contêiner que já rodava continuou rodando, e por isso o defeito não aparecia.
**Fase 6 auditada** (#159): o bloco de interface tinha a mesma exigência escrita **duas vezes** —
uma com a palavra da spec, outra com a do código —, e metade estava aberta contra a outra metade
fechada. E o item "tempo base medido" estava aberto **duas linhas abaixo** da medição que ele
pedia. Restaram quatro buracos de verdade: copiar o LaTeX, tela cheia, decorar o Monaco e clicar
no log.
**A §27 fechada, menos o render** (#158): a metade agêntica também está coberta — propor, revisar
linha a linha e aplicar, com o modelo dublê e a rota de aplicar de verdade. Achou o segundo bug do
dia: depois de aplicar um patch, o editor continuava mostrando o texto de antes.
**O E2E da §27 existe** (#155): abrir → selecionar → editar → autosave → recarregar → desfazer,
num Chromium de verdade, em 17 s. E na primeira execução ele achou um 500 no render (#156) que
1123 testes de unidade não pegavam — porque o defeito só aparece na **sequência**: editar,
compilar, e o produto colidir consigo mesmo.
**Derivado é descartável, agora afirmado** (#153): o artefato some e volta com a mesma chave, o
`preview.png` do legado continua fora, e o caminho do render ganhou as primeiras linhas de log —
o logger da Fase 17 não tinha um único ponto de chamada até aqui.
Fechado com guarda dos dois lados (#151): um teste rápido que compara `Dockerfile` × workspaces, e
um job de CI que **constrói a imagem** — porque nada a construía fora do terminal de quem mexia.
**Indicadores na árvore, e o bug que eles revelaram** (#147): o registro de plugins de tipo de
questão **não era importado por ninguém** em produção — só pelo próprio teste, que por isso
sempre passou. Toda questão do acervo respondia "tipo não suportado", em silêncio, desde a Fase 7.
Com o registro carregado e um produtor chamando a validação, o indicador acende: `VALID` e
`INVALID` conferidos contra o banco pelas rotas de verdade.
**Auditoria do checklist** (#145): dez itens estavam marcados `[ ]` e já estavam feitos — sete da
Fase 6, todos conferidos contra o contêiner rodando. E a auditoria achou o que não procurava:
quatro arquivos-fonte com **byte NUL** dentro, usados como separador de chave. O `grep` pula esses
arquivos em silêncio e o **git os trata como binários** — qualquer alteração neles aparecia na
revisão como "0 insertions, 0 deletions". Num projeto que entrega em branch para revisão humana,
esse é o pior lugar possível para uma mudança se esconder.
1268 testes (1204 no app + 64 no renderer) + **13 de E2E, todos passando** · 91 PRs abertos, nada mergeado.

| Wave | Fases | Estado |
|---|---|---|
| A — fundação e IDE editorial | ✅0 · **◐1** · **◐2** · ✅3 · ✅4 · **◐5** · **◐6** | 1 e 5 esperam só o olho; a 6 espera o preâmbulo embutido na imagem |
| — prova arquitetural | **◐6.5** | schema PostgreSQL provado; storage parado na decisão |
| B — banco de questões | ✅7 | domínio, telas e schema fechados |
| C — agente | ✅8 · ✅9 · ✅10 | fechada, e a §35 conferida linha a linha |
| D — acervo legado e portabilidade | **⛔11** · ✅12 · **◐13** | a 11 depende do acervo; a 13 só não mostra progresso |
| E — ingestão visual | **◐14** · ✅15 | falta a inserção assistida de figura |
| F — diferencial de produto | ✅16 · **◐17** | a 17 espera o guarda de autorização e o resto do diagnóstico |

**Fases fechadas: 10 de 19** — 0, 3, 4, 7, 8, 9, 10, 12, 15 e 16. *(Eram 2 no cabeçalho antigo, que
estava desatualizado desde a Fase 4; a conferência visual das Fases 1 e 5 continua sendo do Chico.)*

### Por épico *(rastreabilidade da §11 do planejamento)*

| Épico | Fases | ✅ | ◐ | ⛔ | `[ ]` | Estado |
|---|---|---:|---:|---:|---:|---|
| **01** fundação e providers | 0 | 70 | — | — | — | **fechado** — os dois health checks entraram no `setup` (#168) |
| **02** shell e árvore | 1 · 2 | 87 | — | 1 | 5 | 4 são a conferência visual; 1 é virtualização, adiada por decisão |
| **03** editor LaTeX | 3 · 4 | 49 | — | — | — | **fechado** |
| **04** preview e render | 5 · 6 | 159 | — | 3 | 1 | 1 é a conferência visual; os ⛔ são TeX Live 2022×2023, `iwona` e medições descartadas |
| **05** banco de questões | 7 | 48 | 1 | — | — | **fechado**; o ◐ é a conferência visual do §33 |
| **06** ingestão visual | 14 · 15 | 39 | 1 | — | 1 | falta o reconhecimento de **texto** |
| **07** agente | 8 · 9 · 10 | 97 | — | 3 | — | **fechado**; os ⛔ são vocabulário sem produtor (`IMPORT`, `SYSTEM`) e o fallback JSON |
| **08** legado | 11 | 17 | — | — | 41 | ⛔ de fato: **o acervo não está nesta máquina** |
| **09** avaliações | 16 | 24 | — | 1 | — | **fechado**; o ⛔ é `AssessmentRule`, sem caso de uso |
| **10** operação e busca | 10 · 12 · 17 | 58 | — | 3 | 3 | guarda de autorização, e 2 presos ao acervo |
| — portabilidade `.lbb` | 13 | 39 | — | — | 2 | progresso visível e migradores de formato (escopo futuro) |
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
- ⛔ Vercel Blob provisionado — *exige credencial **e** a decisão sobre o destino dos assets na nuvem (Vercel Blob × DO Spaces), que continua sendo do Chico*
- ✅ PostgreSQL em Docker `28432`
- ✅ Ambiente principal permaneceu local e intocado
- ✅ Tudo derrubado ao fim, mantendo só o relatório

**Os dois pares**
- ◐ `SQLite ↕ PostgreSQL` — *schema traduzido e o D38 provado na tabela real; falta a suíte de integração (ver bloqueio do `db push` abaixo)*
- ⛔ `LocalFileStorage ↕ Vercel Blob` — *bloqueado pela decisão e pela credencial*

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
- [ ] Detecta bibliotecas a partir de `padrao.knowchicoconfig`
- [ ] `ITA/Material` (3,2 GB) explicitamente ignorado
- [ ] `Listas/` (327 MB, repos git de terceiros) explicitamente ignorado
- [ ] O relatório declara o que foi ignorado e por quê
- [ ] Importador tem acesso direto ao filesystem — nenhum upload exigido para começar

**Leitura segura**
- [ ] Banco legado aberto estritamente read-only *(padrão já provado na Fase 4 com `immutable=1`)*
- [ ] Originais nunca modificados
- ✅ Detecção da geração de schema por biblioteca
- ✅ Geração `add_LatexComplemento` suportada (10 bibliotecas)
- ✅ Geração `Questao_Imagens_Completa` suportada (2 bibliotecas)
- ✅ Bibliotecas sem `__EFMigrationsHistory` suportadas (2)
- ✅ Campos ausentes degradam sem quebrar *(a **coluna** manda sobre o registro de migração)*

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
- [ ] `Questao` → `DocumentNode` *(classificação pronta; falta a escrita)*
- ✅ `TipoQuestao` negativo → `NodeKind` estrutural
- ✅ `TipoQuestao` positivo → `Question` *(tipo desconhecido **para** o import, não vira default)*
- ✅ **`Ordem` ignorada; ordem derivada de `IdQuestao`** — nem no `SELECT` ela entra
- ✅ `sortKey` fracionário gerado
- ✅ `Numeracao` → `numberingStyle`
- ✅ `Numeracao_Original` → `originalLabel`
- [ ] `Questao_Itens` → `QuestionOption`
- [ ] `Marcacao` → `legacyMarcacao`, nunca como identidade
- [ ] `Questao_Itens.Correta` → `isCorrect`
- [ ] `Questao.Correta` ignorado
- [ ] `IsExpanded`, `IsSelected`, `IdQuestao_Original` ignorados
- ✅ Dificuldade na escala 0/2/5/7/10 *(fora da escala vira o meio e **avisa** que coagiu)*
- [ ] Metadados de concurso (banca, instituição, cargo, nível, ano)
- [ ] LaTeX: enunciado, resposta, complemento, origem

**Assets**
- [ ] Gravados via `LocalFileStorageProvider`
- [ ] `sha256` calculado por arquivo
- [ ] `pub<N>/cover.jpg` → `Asset(COVER)`
- [ ] `<Título>.detail.json` → `metadataJson`
- ✅ `preview.png` **não** importado (é cache de render)
- ✅ Fontes de figura classificadas por tipo: gnuplot, pgf, asymptote, geogebra, tpx, tex, table, svg, eps
- ✅ PDFs → `Asset(SOURCE_PDF)`
- ✅ Relatório do que caiu em `ATTACHMENT` por falta de classificação
- ✅ Nenhum arquivo descartado silenciosamente

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
  paleta, a mesma questão aparecia seis vezes. O que fazer com o conteúdo órfão continua sendo
  decisão do Chico; aqui se decidiu só o que a busca mostra)*
- ✅ Avaliação do FTS5 do SQLite
- ⛔ Benchmark sobre o **acervo importado** — o acervo não está nesta máquina. Rodou sobre corpus
  sintético de 20 mil e 200 mil questões (670× o acervo real), que é o que responde a pergunta
  "qual motor"
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
- [ ] Progresso visível para acervos grandes
- ✅ UI de exportação *(um `<a download>` por workspace na página de diagnóstico)*

**Importação**
- ✅ Verifica `formatVersion` — **antes** do checksum
- ✅ Verifica checksums e recusa arquivo corrompido
- ✅ Religa assets ao `StorageProvider` de destino *(chaves novas — é o que o endereço por hash compra)*
- ✅ Colisão de `legacyId`/`uuid` gera relatório e exige decisão
- ✅ **Nada é sobrescrito em silêncio**
- ✅ Relatório de importação *(com `dryRun=1` para ver antes de gravar)*
- ✅ UI de importação *(com dry-run **antes** de gravar, sempre)*

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
- [ ] Reconhecer **texto** do recorte *(o de matemática existe; o de texto ainda não tem provider)*

**Aceite da fase**
- ◐ §33 "Assets" completo (§10 deste documento) *(quatro dos cinco fechados na auditoria de
  2026-08-10; falta a tela de inserção assistida de figura)*
- ✅ **"Voltar à origem" funciona a partir de uma questão** *(#137 — verificado com dado real:
  âncora criada pelas rotas, aba Origem devolvendo fonte → página → recorte, e os 30 942 bytes do
  PDF servidos por `assetId`. A `storageKey` não aparece na resposta.)*

---

### Fase 15 — Reconhecimento matemático

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
- [ ] Nenhuma abstração cerimonial acrescentada além dos quatro contratos

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
- [ ] Inserir imagem em LaTeX *(o snippet existe; falta a tela que o monta)*

### Legado — ⛔ *o bloco inteiro depende do acervo, que **não está nesta máquina**. O domínio do
importador existe e é testado (Fase 11); rodar o import é que não dá.*
- [ ] Dry-run
- [ ] Import Publication
- [ ] Import árvore
- [ ] Import questões
- [ ] Import alternativas e correta
- [ ] Import metadata
- [ ] Import snippets LaTeX
- [ ] Relatório

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
- [ ] Resize não quebra layout
- [ ] 1366×768 continua utilizável
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
- [ ] Empty states explicam a próxima ação

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
