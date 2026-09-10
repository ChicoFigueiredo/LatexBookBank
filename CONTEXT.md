# LatexBookBank

Banco de questões de matemática em LaTeX, local-first, que substitui o aplicativo WPF legado e
preserva o seu acervo de vinte anos. Este arquivo é o glossário: o que cada palavra significa
neste projeto, e qual usar quando há mais de uma. Não é especificação nem plano.

## Acervo

**Biblioteca** (`Workspace`):
Unidade de isolamento do acervo: um conjunto independente de livros, questões, tags e
avaliações. O legado tem treze; cada uma virou uma biblioteca.
_Avoid_: workspace (em texto de tela), espaço de trabalho, acervo (quando se refere a uma só)

**Acervo**:
O conjunto de todas as bibliotecas, e o que o legado acumulou em vinte anos.
_Avoid_: banco (ambíguo com o banco de dados)

**Livro** (`Publication`):
A fonte de onde as questões vêm: livro, apostila ou prova. Tem título, apelido, ISBN, capa e,
quando existe, o PDF fonte. Uma biblioteca é uma coleção de livros, não um livro.
_Avoid_: publicação (fora de identificadores), obra, coleção

**Estante**:
A tela que lista os livros de uma biblioteca, com o que cada um tem e o que lhe falta.
_Avoid_: catálogo (é o do Calibre), lista de publicações

**Apelido** (`nickname`):
Nome curto pelo qual a pessoa se refere a um livro ou a uma questão no dia a dia.
_Avoid_: alias, nick

**Autor**:
Quem assina um livro. Um livro pode ter vários; a ordem é editorial.

## Conteúdo

**Nó** (`DocumentNode`):
Um elemento da árvore de conteúdo de um livro: capítulo, seção, grupo ou questão, em
profundidade arbitrária. A árvore é dos nós; o conteúdo da questão não é.
_Avoid_: item, pasta, capítulo (quando o tipo não importa)

**Questão** (`Question`):
O conteúdo que um nó de tipo questão carrega: enunciado, resolução, complemento, metadados e,
quando é objetiva, as alternativas. Tem tipo: escolha simples, múltipla escolha ou discursiva.
_Avoid_: exercício, problema, pergunta

**Alternativa** (`QuestionOption`):
Uma opção de resposta de uma questão objetiva. A letra (A, B, C) é projeção da ordem, nunca
identidade: reordenar muda a letra, não a alternativa.
_Avoid_: item, opção, letra

**Gabarito**:
O conjunto das alternativas corretas de uma questão, ou, numa avaliação, a versão do documento
que traz só as respostas.
_Avoid_: resposta certa, answer key (em texto de tela)

**Resolução** (`solutionLatex`):
O texto que explica como chegar à resposta. Diferente do gabarito, que só diz qual é.
_Avoid_: solução, resposta

**Tag**:
Rótulo livre que classifica uma questão dentro de uma biblioteca, para filtrar na árvore e na
busca.
_Avoid_: etiqueta, categoria, tema

**Metadados da questão**:
Banca, instituição, cargo, ano, editora, dificuldade e link de vídeo. A dificuldade usa a
escala legada de cinco degraus, não uma nota livre.

**Lixeira**:
Onde ficam nós e questões excluídos. Nada some do banco ao ser excluído; some das telas. A
lixeira é do acervo inteiro, e restaurar devolve o item ao lugar de origem.
_Avoid_: soft delete (em texto de tela), arquivo morto

## Origem e captura

**Asset**:
Um arquivo do acervo, identificado pelo seu `sha256`: PDF fonte, capa, figura, recorte, fonte
de figura ou saída de render. O banco guarda os metadados; o conteúdo vive no storage.
_Avoid_: arquivo, anexo, blob, mídia

**Asset fonte**:
Patrimônio: PDF de origem, imagem de origem, figura, fonte de figura e recorte. Imutável. Um
arquivo alterado é um asset novo, nunca uma sobrescrita.

**Asset derivado**:
Saída reconstruível: PDF, PNG ou SVG de render. Descartável; apagar e recompilar dá o mesmo
resultado.
_Avoid_: cache (é o mecanismo, não o asset)

**Fonte de figura**:
O arquivo editável de onde uma figura sai: gnuplot, pgf, Asymptote, GeoGebra, tpx, tex, tabela
de dados, svg ou eps. Guardada para que a figura possa ser reeditada na origem.

**Âncora de origem** (`SourceAnchor`):
O ponto de um asset fonte de onde uma questão veio: página e retângulo em coordenadas
normalizadas de 0 a 1, independentes de resolução. O recorte é derivado dela.
_Avoid_: bounding box, região, coordenadas

**Recorte** (`crop`):
A imagem extraída de uma âncora de origem. É o que se reconhece, insere como figura ou abre para
conferir.
_Avoid_: clip, snippet, corte

**Captura**:
O fluxo de tirar questões de um PDF: enquadrar a página, marcar ou estimar onde estão as
questões, recortar e reconhecer. A **fila de captura** é o que ainda não virou questão.
_Avoid_: ingestão (é o upload do arquivo, não o fluxo), digitalização, OCR (é uma etapa)

**Ingestão**:
Subir um asset fonte (PDF ou imagem) para um livro. Termina quando o arquivo está no storage;
a captura começa depois.
_Avoid_: upload (em texto de tela), importação

**Estimativa de questões**:
A segmentação automática de uma página: caixas onde o app acha que há questões, a partir do
texto do PDF. Sugestão, nunca questão criada sem confirmação.
_Avoid_: segmentação (em texto de tela), detecção

**Reconhecimento**:
Transformar um recorte em LaTeX por um modelo de visão. Sempre passa por revisão humana; o
resultado é candidato, não conteúdo. Há reconhecimento matemático e reconhecimento de texto.
_Avoid_: OCR, transcrição (o modelo transcreve, mas o fluxo é reconhecimento)

**Questão completa**:
Reconhecimento que devolve, além do enunciado, o tipo da questão e as alternativas.

**Origem** (aba):
A tela que mostra de onde uma questão veio: asset fonte, página, âncora e recorte.
_Avoid_: proveniência (só em documentação)

## Edição e render

**Editor**:
O editor de LaTeX da questão, com autocomplete, paleta de símbolos e autosave. Salvar usa
concorrência otimista: quem salva sobre uma versão velha vê o conflito, não perde o texto.

**Preview rápido**:
A visualização imediata do LaTeX na tela, por fórmula, sem compilar. Aproximação, não prova.
_Avoid_: preview (sem qualificar), render

**Render**:
A compilação autoritativa da questão em PDF pelo worker. O que o render mostra é o que sai
impresso. Um **render job** é uma compilação registrada, com cache por hash do conteúdo.
_Avoid_: compilação (fora de documentação técnica), preview

**Perfil LaTeX**:
Um preâmbulo e opções de compilação nomeados. O perfil de compatibilidade com o legado é o que
compila o acervo antigo sem alteração.
_Avoid_: template (é outra coisa), preâmbulo (é uma parte do perfil)

**Tipo de questão**:
Escolha simples, múltipla escolha ou discursiva. Cada tipo sabe montar o seu próprio LaTeX e
validar o seu próprio gabarito. O tipo pode mudar sem perder conteúdo.
_Avoid_: formato, categoria, modalidade

**Saída de professor**:
O render de uma questão com gabarito e resolução, em contraste com a saída de aluno.

## Agente e histórico

**Agente**:
O assistente de IA do painel lateral. Só age sobre o contexto que a pessoa colocou lá, e só
propõe: nada muda sem aprovação.
_Avoid_: assistente, copiloto, IA (genérico)

**Modo do agente**:
O que o agente está fazendo: perguntar (ASK), revisar (REVIEW), corrigir LaTeX (FIX_LATEX),
enriquecer metadados (ENRICH) ou estruturar (STRUCTURE).

**Patch**:
Uma proposta de mudança do agente sobre campos permitidos de uma questão, mostrada como diff e
aprovada linha a linha. Aplicar um patch grava uma revisão na mesma transação.
_Avoid_: sugestão, edição automática

**Execução do agente** (`AgentRun`):
O registro de um turno do agente, guardado para auditoria: o que foi pedido, o que ele
respondeu, o que foi aplicado.

**Revisão** (`Revision`):
O estado de uma questão antes de uma mudança. O **Histórico** é a linha do tempo das revisões,
com diff e restauração.
_Avoid_: versão, snapshot, backup

## Avaliações

**Avaliação** (`Assessment`):
Uma prova montada a partir das questões de uma biblioteca, organizada em seções.
_Avoid_: prova (em identificadores), exame, lista

**Variante**:
Uma versão embaralhada de uma avaliação, gerada por uma semente. A mesma semente reproduz a
mesma variante, byte a byte.
_Avoid_: versão, tipo de prova

**Mapa de letras**:
A correspondência, por variante, entre cada alternativa e a letra com que ela apareceu. É o que
permite corrigir uma variante sabendo o gabarito original.

**Modelo de documento** (`DocumentTemplate`):
A aparência de uma avaliação exportada, para um público: aluno, professor ou gabarito.
_Avoid_: template (em texto de tela), layout

## Legado e portabilidade

**Legado**:
O aplicativo WPF anterior e o seu acervo em arquivos `.knowchico`. É especificação executável e
patrimônio a preservar, não dependência.
_Avoid_: sistema antigo, KnowChico (nome do produto, não do conceito)

**Importação do legado**:
Ler uma biblioteca `.knowchico` e escrevê-la como biblioteca do novo produto, guardando os
identificadores originais para auditoria e idempotência. Roda quantas vezes for preciso sem
duplicar.
_Avoid_: migração, conversão

**Arquivo portátil** (`.lbb`):
Um zip com uma biblioteca inteira, dados e assets, autocontido e versionado. Serve à exportação
manual e ao backup, pelo mesmo caminho.
_Avoid_: export, dump, backup (quando se refere ao formato)

**Catálogo do Calibre**:
A biblioteca de livros do Calibre na máquina da pessoa, lida como fonte de livros para o acervo.
Importar dali cria livros com capa e PDF; nunca escreve de volta no Calibre.

**Diagnóstico**:
A tela que diz se o app está inteiro: banco, storage, worker de render, modelo de IA, TeX do
host, último backup.
_Avoid_: health check (em texto de tela), status
