# A zona do documento: um livro não é homogêneo

O motor tratava todo PDF como uma coisa só, com uma regra do começo ao fim. O *Fundamentos de
Matemática Elementar* mostrou que livro didático não é assim. O volume 1 tem quatro partes, cada
uma com regra própria:

| páginas | o que é | o que se quer dela |
|---|---|---|
| 9–277 | teoria e exercícios | estrutura, e questões discursivas |
| 278–320 | respostas dos exercícios | **nada** |
| 321–411 | questões de vestibulares | questões de **múltipla escolha** |
| 412–420 | respostas dos vestibulares | **nada** |

Varrer as quatro com a mesma regra produziu o que produziu: das 453 falsas seções que o `book-v1`
propôs, **300 vinham dos dois gabaritos** — linhas como "2. d" e "137. a)" lidas como títulos
numerados — e as ~351 questões de vestibular nasciam discursivas, porque o tipo era um só por
perfil.

**Decidimos dar ao perfil o conceito de zona**: um gancho recebe as páginas e devolve as zonas do
documento, cada uma com um rótulo, a página em que começa e o que o motor faz ali — ignorar, ou
criar questões de um tipo determinado. A zona também chega ao classificador, no `WalkContext`.

São duas perguntas que pareciam separadas e são a mesma: **o que ignorar** e **que tipo de questão
nasce aqui**. Quem responde a primeira já sabe responder a segunda, porque as duas dependem de
onde se está no livro.

## Considered options

**Ressuscitar o `isBoundary`**, apagado dois dias antes no [ADR 0007](0007-o-perfil-de-captura-e-codigo.md)
por não ter nenhum implementador. Rejeitada por ser pequena demais para o problema: ele só sabia
dizer "pare", e a seção de vestibulares não é para parar — é para ler com outra regra. Um gancho
que só interrompe resolveria os gabaritos e deixaria o tipo da questão sem resposta.

**Nenhum conceito novo: o perfil resolve tudo na classificação linha a linha**, olhando o cabeçalho
corrente da página. Rejeitada porque espalha a mesma decisão por todos os ramos do classificador —
cada regra teria de perguntar "estou no gabarito?" antes de responder — e porque a zona precisa
valer **antes** da caminhada: é ela que tira as páginas de gabarito do documento, e com isso tira
junto as figuras que nasceriam num gabarito de 43 páginas em duas colunas.

**O tipo da questão por item, sem zona.** Rejeitada porque o item não sabe sozinho: "1. (UF-RS)" é
questão de vestibular na página 330 e seria um exercício do corpo que cita a banca na página 100.
A informação que decide é a posição no livro, e posição no livro é exatamente o que a zona nomeia.

**Zona como dado declarativo** (uma lista de `{cabeçalho, tipo, ignorar}` casada pelo motor).
Rejeitada por prometer menos do que parece: cobre o livro cuja zona tem cabeçalho corrente próprio,
e não cobre a que começa no meio de uma página ou que se reconhece por outra coisa. O gancho
devolve a mesma lista quando isso basta — e o `book-fme-v1` faz exatamente isso.

## Consequences

`defaultQuestionType` deixa de ser o tipo do perfil e passa a ser o **padrão** dele: o que vale
quando ninguém disse nada. O tipo carimbado viaja em `metadata`, onde o perfil já fala com a
aprovação (`figureKind`, `widthFraction`), e não numa coluna nova para um enum que só a aprovação
lê.

O aviso da execução ganha uma linha por zona pulada, com o número da página. Sem isso, um livro
varrido pela metade pareceria um livro curto.

A zona é do perfil, não do motor. Um perfil que não a declara vê o documento como uma zona só, que
é o que sempre foi — nenhum comportamento muda para `book-v1`, `exam-v1` ou `exam-enem-v1`.

E ela abre, sem pagar nada agora, o caminho para ligar resposta e questão: quem sabe que a página
280 é "respostas dos exercícios" sabe onde procurar a resposta do exercício 137. Isso ficou de fora
por decisão — o gabarito é texto matemático em duas colunas, e casar os dois é outra fase.
