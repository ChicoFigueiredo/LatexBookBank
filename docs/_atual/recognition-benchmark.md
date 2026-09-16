# Reconhecimento matemático: onde o modelo erra, com exemplos reais

**Decisão: nenhuma ainda.** Este documento é o passo que faltava antes de decidir onde investir
na captura — medir antes de escolher entre melhorar o modelo/prompt ou melhorar a ferramenta de
correção (decisão do Chico, 2026-08-31).

Issue #125 · `apps/web/scripts/benchmark-recognition.ts`

---

## Como foi medido

Não havia gabarito real disponível em lugar nenhum acessível — o banco de dev só tem fixtures de
E2E ("quanto vale dois mais dois?"), e o acervo legado (Fase 11) nunca guardou a imagem original
da questão: `preview.png` é cache do próprio render do LaTeX, não uma foto da página, e usá-lo
como entrada validaria o modelo contra o que ele mesmo deveria produzir.

A fonte real foi um PDF de apostila de matemática do próprio Chico (`ITA/Material/FBMAT01.pdf`,
fora do escopo de importação da Fase 11 — é material de terceiros, não biblioteca KnowChico).
Uma página real (nível ITA/IME, polinômios, somas telescópicas, Fibonacci) foi renderizada a
150dpi e seis regiões foram recortadas à mão, cobrindo os tipos de fórmula que aparecem no
acervo: fração simples, fração com "..." repetido, função com subscrito, radical aninhado,
notação de conjunto.

O modelo é o mesmo que o produto usa: `gemma3:12b` via Ollama local, modo `mixed`, o mesmo prompt
de `vision-math-recognizer.ts`. O gabarito é a transcrição de quem está escrevendo este documento,
lendo a mesma imagem — não existe segunda fonte automática possível para este tipo de medição.

As imagens usadas não entram no repositório: são de material com direito autoral de terceiros
(a apostila), mesmo sendo posse do Chico. O que fica versionado é o script e este relatório.

## Os seis casos

| caso | conteúdo | resultado |
|---|---|---|
| fração simples + alternativas | $P(x)=\frac{x}{x+1}$, alternativas com $\frac{2013}{2014}$, $\frac{1006}{1007}$ | ❌ **dois erros** |
| função com subscrito e composição | $U_n(x)=\frac{\text{sen}[(n+1)(\arccos x)]}{\text{sen}(\arccos x)}$ | ✅ limpo (1 erro cosmético) |
| soma telescópica longa, com "..." | $1-\frac12+\frac13-\dots+\frac1{2013}-\frac1{2014}=\frac1{1008}+\dots+\frac1{2014}$ | ❌ **dois erros** |
| radical aninhado + conjunto | $\sqrt{x+a}=\sqrt{x}+\sqrt{b}$, $S=\left\{\frac{(a-b)^2}{4b}\right\}$ | ✅ limpo |
| subscritos em sequência (Fibonacci) | $F_1=F_2=1$, alternativas numéricas simples | ✅ limpo |
| polinômio + cadeia de desigualdades | $f(x)=ax^2+bx+c$, $50<f(7)<60$, ... | ⚠️ **recorte incompleto → o modelo inventou o resto** |

Taxa: 2 de 6 recortes completos saíram limpos de erro de conteúdo matemático; 2 de 6 tiveram erro
real de fórmula; 1 de 6 revelou um comportamento à parte (abaixo) quando o recorte veio cortado.

## Os erros, exatos

**Fabricação de conteúdo.** No caso da fração simples, o modelo devolveu
`P(x) = \frac{x}{x+1} p`, **inventando** um "p" que não existe na imagem, e completou com
"onde $p$ é um polinômio" — texto que a imagem não tem. Não é erro de leitura: é invenção.

**Truncamento de dígito.** Na mesma imagem, a alternativa `C) 1006/1007` saiu como
`C) \frac{1006}{1}` — o modelo leu os quatro primeiros dígitos do numerador correto, mas perdeu o
denominador inteiro.

**Troca de sinal.** Na soma telescópica, o último termo da imagem é `+ \frac{1}{2014}`; o modelo
devolveu `- \frac{1}{2014}` — um sinal trocado no fim de uma cadeia repetitiva, o tipo de erro que
ninguém pega relendo o LaTeX, só comparando com a imagem.

**Delimitador não fechado.** A mesma resposta abriu `$` antes da equação e nunca fechou — o
resultado não compila como fórmula isolada e vaza modo matemático para o que vier depois.

**Ruído em texto curto, fora de matemática.** "(Prof. MM)" saiu como "(Prof. MIMI)" numa resposta
e "(Prof. MIVVI)" noutra — mesma abreviação, dois erros diferentes. Baixo risco (é atribuição, não
conteúdo da questão), mas seria pego por quem revê só se comparasse letra a letra.

**Achado à parte — recorte incompleto vira invenção, não aviso.** Um recorte cortado antes das
alternativas `C`/`D` de uma questão não fez o modelo dizer "não vejo o resto": ele completou com
`C) 204410` e `D) 160905` — números plausíveis, e **nenhum dos dois existe** na imagem nem no
original (`80418` e `16805`). O modelo não tem noção de "isto pode estar cortado"; ele sempre
termina o padrão que reconhece.

## O que os erros dizem

**Os erros não são aleatórios — concentram em dois padrões.** Fórmulas longas com termos
repetidos e "..." (somas telescópicas, sequências de frações) são onde o modelo perde dígito ou
sinal; fórmulas isoladas, mesmo compostas (subscrito dentro de função dentro de razão
trigonométrica), saem limpas. E um recorte incompleto não produz uma resposta incompleta — produz
uma resposta **completa e errada**, porque o modelo sempre fecha o padrão.

Isso muda a prioridade dentro da pergunta original ("economizar intervenções manuais de
fórmulas"): o ganho não está em pedir ao modelo para devolver estrutura (enunciado+alternativas
separados) — isso já é bem resolvido por `separar-alternativas.ts`, uma heurística de texto madura
que trata bloco de OCR colado com um gesto humano ("Dividir em duas"), em vez de adivinhar. O
ganho está em (a) desconfiar mais de fórmulas com repetição/reticências — um aviso na tela nesses
casos custa uma linha de código e é onde o erro de verdade mora — e (b) o recorte incompleto ser
tratado como um caso do produto, não do modelo: nada aqui pede ao modelo para reconhecer "isto
está cortado", e ele nunca vai fazer isso por conta própria.

## Por que não medir mais agora

Seis casos, de uma fonte só, não são uma amostra que sustente número de taxa de erro publicável —
o objetivo aqui não era esse. Era decidir **prompt/modelo vs. ferramenta de correção**, e a
resposta apareceu antes da métrica ficar mais precisa: não é nem um nem outro isoladamente — é um
terceiro alvo (avisar sobre reticências, tratar recorte incompleto como caso do produto) que nem
tinha sido cogitado antes de olhar exemplo real.

## O que mudou por causa disso

`vision-math-recognizer.ts` ganhou um aviso nos três modos matemáticos, pedindo exatamente as
duas coisas que os erros acima mostraram: conferir dígito e sinal em fórmula com "..." repetido, e
nunca completar um recorte que pareça cortado.

Retestado nos três casos que tinham erro, mesmo prompt novo, mesmas imagens:

| caso | antes | depois |
|---|---|---|
| recorte incompleto (Q50/51) | inventou `C) 204410`, `D) 160905` — nenhum existe | parou em "pode" — nada inventado |
| soma telescópica (Q57) | `+ \frac{1}{2014}` virou `-`; `$` sem fechar | sinal **continua** trocado; `$` fechou desta vez |
| fração simples (Q46) | fabricou "onde p é um polinômio"; truncou `1006/1007` → `1006/1` | fabricou "+ p" (diferente, ainda inventado); truncamento **persiste** |

**Metade funcionou, e é a metade honesta de relatar assim.** Pedir "não invente quando faltar
imagem" mudou o comportamento de verdade — o modelo passou a parar em vez de completar. Pedir
"confira dígito e sinal" não mudou nada nos dois casos que motivaram o pedido: um modelo pequeno
de visão local não parece "olhar de novo" só porque o prompt pede — se a leitura da imagem já saiu
errada, pedir conferência depois não conserta o que não foi visto direito. Fabricação por corte é
um comportamento de **completar padrão**, e um prompt consegue desligar isso; erro de dígito/sinal
em texto pequeno repetido é um comportamento de **percepção**, e um prompt não.

Isso aponta a próxima pergunta, não respondida aqui: se a fidelidade de dígito em fórmula repetida
importa mais do que a UI de correção resolve hoje, o caminho provável não é prompt — é resolução
de recorte (a imagem chega em DPI mais alto) ou destacar visualmente o próprio texto repetido antes
de mandar para o modelo. Nenhum dos dois foi testado aqui.

## Quando reabrir a medição

- Depois de qualquer mudança de prompt para os dois padrões achados aqui — para confirmar que
  melhorou e não só mudou o erro de lugar.
- Se o produto trocar de modelo de visão (`AI_VISION_MODEL`), os padrões de erro podem ser
  completamente diferentes — não presumir que a mesma fraqueza persiste.
- Com uma amostra maior, vinda de recortes reais feitos pelo Chico no próprio fluxo de captura
  (Fase 11 pode fornecer o texto correto; falta a imagem, que a Fase 11 não importa hoje).

O script fica versionado: `bun run scripts/benchmark-recognition.ts recorte.png [...]` roda contra
qualquer recorte real, usando o mesmo modelo e prompt do produto.
