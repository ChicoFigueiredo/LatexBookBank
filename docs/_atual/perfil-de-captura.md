# Perfil de captura: o de referência e como derivar outro

O perfil de captura diz ao scan como um livro é organizado ([ADR 0007](../adr/0007-o-perfil-de-captura-e-codigo.md): perfil é código, com nome e versão). O **`book-fme-v1`** — *Fundamentos de Matemática Elementar* — é o perfil de referência: foi afiado contra o vol. 1 inteiro, página por página, e é o ponto de partida para um livro novo (D78).

## O que o `book-fme-v1` sabe

Cada regra mora em `apps/web/src/modules/scan/domain/profiles/book-fme-v1.ts`, com o comentário da página que a motivou.

| O livro imprime | O perfil reconhece | Vira |
|---|---|---|
| `CAPÍTULO I` + o nome em corpo maior | capítulo, com o nome das linhas de baixo | `CHAPTER` numerado |
| `APÊNDICE I` | capítulo sem número, rótulo "Apêndice I" | `CHAPTER` |
| "Apresentação", na fonte do capítulo | capítulo sem número | `CHAPTER` com o prefácio no corpo |
| `IV. Conjunto universo` (título pode ter duas linhas) | seção em romano | `SECTION` |
| "Apêndice" / "LEITURA" + título | seção sem número dentro do capítulo | `SECTION` com rótulo |
| `40.` em 13 pt (item de teoria) | subseção; sem nome, a 1ª frase é o título e o parágrafo vai ao corpo (D76) | `SUBSECTION` |
| `E X E R C Í C I O S` | o bloco de exercícios | `EXERCISE_GROUP` |
| `135.` em 10 pt dentro do bloco | exercício, com itens `a)` | `EXERCISE` + `ITEM` |
| `1. (UF-RS) …` na zona de vestibulares | questão de múltipla escolha | `QUESTION` |
| as páginas de respostas | zonas com `answersTo`: cada `135.` vira uma Resposta da questão do mesmo número (D77) | `ANSWER` |
| a lista de siglas, em duas colunas | zona com `columns`; cada sigla é uma nota | `CHAPTER` + `NOTE` |
| a contracapa | zona não varrida | — |

O que **não** é do perfil, e vale para qualquer livro: o motor acha as figuras, separa a letra desenhada como traço (o ∧ do Fundamentos) de um desenho, lê a tabela na moldura como `tabular` com as células da camada de texto, mascara a figura no recorte do texto em volta, e reconhece em pedaços de poucas linhas, conferindo número e V/F contra o PDF (D78).

## Derivar um perfil para um livro novo

1. **Clonar** o de referência:

   ```bash
   bun run scan:clone-profile book-xyz-v1 "Coleção XYZ"
   ```

   Grava `profiles/book-xyz-v1.ts`, com o comentário de origem no topo, e o registra em `profiles/index.ts`.

2. **Medir** o livro novo com ele, sem banco e sem modelo:

   ```bash
   bun run scan:measure /caminho/do/livro.pdf book-xyz-v1
   ```

   O que importa na saída é **"Linhas fora de qualquer item"**: é texto do livro que não chegaria ao acervo. Folha de rosto, créditos e contracapa ficam de fora com razão; todo o resto é regra que falta. Depois, as zonas, os itens por tipo, e as respostas sem questão do mesmo número.

3. **Ajustar** o que o livro novo tem de diferente — e apagar a regra que não serve, em vez de deixar regra sem livro (ADR 0007). Os ajustes mais comuns:
   - **Zonas** (`ZONE_MARKERS`): o cabeçalho corrente que anuncia cada parte; o gabarito com `answersTo`, a parte em colunas com `columns`, o que não é conteúdo com `skip`.
   - **Títulos**: fonte e corpo de capítulo e seção, medidos com `relativeSize` contra o corpo do texto.
   - **Exercício e item de teoria**: no Fundamentos, os dois são "número e ponto"; o que separa é o corpo do primeiro trecho (10 pt contra 13 pt).
   - **Respostas**: `answerStart` (o que abre uma resposta) e `answerBoundary` (o que a fecha).

4. **Prender a medida** no corpus: uma entrada em `data/scan-corpus.json` e as contagens no aceite de `tests/scan-corpus.test.ts`, como o Fundamentos tem. Se a estrutura mudar sem querer, o teste diz quanto.

5. **Escanear de verdade, em lotes.** Pela tela do livro, ou pela API (`POST /api/publications/:id/scans`), com o reconhecimento por lote de 10 a 25 páginas: reconhecer, olhar os itens *suspeitos* — o diagnóstico diz se o modelo mudou número ("falta 4; sobra —") —, conferir uma ou duas páginas contra o PDF, aprovar, compilar. O que for padrão vira regra no perfil; o que for do modelo, corrige-se na revisão.

## A versão

Mudou a proposta, muda a versão: do perfil, quando a regra é dele; do motor (`ENGINE_VERSION`), quando é do motor. Sem isso, um scan novo reabre a execução velha (B7, #251). Perfil derivado começa em `-v1` e não sobrescreve outro: o clone recusa um id que já existe.

## O que o vol. 1 do Fundamentos ensinou

- Contar linha fora de item pegou o prefácio, os dois apêndices, as seis LEITURAS e a lista de siglas — nada disso aparecia nas contagens de capítulos e exercícios.
- As colunas de uma página de respostas saem das próprias respostas: a detecção genérica pede texto dos dois lados, e a coluna de gráficos tem quatro linhas.
- O modelo de visão de 12B erra o detalhe num recorte grande ("3/2 = 6" no lugar de "6/4") e acerta num recorte de três linhas; a resolução não ajuda. Também inventa: uma tabela-verdade inteira que o livro não tem. A camada de texto não lê o símbolo, mas lê cada dígito — é ela a conferência.
- A figura é de quem começou antes dela, ou de quem começa ao lado — o gráfico à direita do "80." —, e não de quem começa logo abaixo: o diagrama da resposta 21 ia para a 22. Conferir o dono das figuras é comparar a proposta antes e depois de mexer no motor, figura a figura.
- O fundo impresso atrás do texto (o rosa da LEITURA, o cinza da solução) não é figura. Quando virava, a máscara apagava o texto do reconhecimento — e a conferência não reclamava, porque a camada de texto também ficava atrás da máscara.
- O modelo escreve negrito em Markdown (`**…**`) mesmo instruído a escrever LaTeX, e a linha de conta sem `$`; a aprovação converte.
- A fonte pode entregar um símbolo como NUL, e o banco corta o texto nele: o motor troca o NUL por um caractere da área privada.
- A última conferência é compilar cada documento do livro com o pdflatex. A medida de cobertura e a conferência por palavras não pegam LaTeX que não compila.
