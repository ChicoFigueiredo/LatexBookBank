# A figura sai vetorial quando o PDF a tem vetorial

Medimos os dois livros que o acervo vai importar. No *Fundamentos de Matemática Elementar* vol. 1,
**55% das páginas têm figura**, e ~91% delas são vetoriais — diagramas de Venn, esquemas de
relações, gráficos. No *Curso de Análise* vol. 1 são ~4% das páginas, quase todas vetoriais; o
único raster é a capa. Os dois são PDF de texto com desenho vetorial, não digitalização.

Rasterizar essas figuras jogaria fora qualidade que **já está no arquivo**. Então: **a figura sai
no formato que o PDF tem.** Traço vira recorte em PDF, com `pdf-lib`, preservando o vetor exato e
as letras desenhadas sobre o diagrama. Foto vira o bitmap embutido, no tamanho original. Nos dois
casos grava-se também um PNG, só para a tela — miniatura e preview.

Isto revisa a linha `FIGURE` do [ADR 0002](0002-tipos-do-scan-no-acervo.md): a figura continua
**não sendo nó** e continua virando âncora de papel *ilustração*, mas agora também vira **asset** e
entra no LaTeX na posição, como `figure` com `\includegraphics` e `\caption`.

Tudo que estiver dentro da caixa da figura é absorvido por ela, inclusive o texto: as letras `A`,
`B`, `U` de um diagrama de Venn são spans de texto do PDF, e deixá-las no fluxo encheria o corpo do
capítulo de sopa de letras — e a figura sairia sem rótulo.

## Considered options

**Só PNG, em alta resolução.** Rejeitada: não custa dependência nenhuma, mas perde exatamente o
que os dois livros têm de bom. A 600 DPI imprime bem e ampliar mostra o pixel; o texto dentro do
desenho deixa de ser texto.

**Reconstruir SVG a partir dos operadores do PDF.** Rejeitada: dá o arquivo mais limpo dos três e
erra em fonte, recorte e transparência — e o pdf.js 6 removeu a saída em SVG, então seria código
nosso. Recortar não reconstrói nada: o resultado é o original.

**PNG agora, vetor depois.** Rejeitada: entregaria antes ao custo de reimportar os dois livros
quando o vetor chegasse. Como o recorte em PDF já sai com o PNG junto, a rede de proteção existe
sem adiar a decisão.

## Consequences

Uma dependência nova, `pdf-lib`: JavaScript puro, MIT, sem binário nativo. É a única no projeto
capaz de embutir e recortar página de PDF — não havia nada que fizesse isso.

Se ela falhar num livro, o PNG já está gravado e a figura aparece de qualquer jeito, com um aviso
no diagnóstico da execução. Nenhuma figura fica de fora por causa do formato.

O agrupamento é onde isto pode errar: um diagrama são dezenas de traços, e juntá-los demais engole
uma linha de texto, juntá-los de menos parte a figura ao meio. Por isso a revisão deixa
**redesenhar a caixa arrastando** — sem esse conserto, o único remédio seria rejeitar a figura e
refazê-la à mão.
