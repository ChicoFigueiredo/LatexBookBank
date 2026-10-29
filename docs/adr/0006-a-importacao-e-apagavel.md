# A importação é apagável, e o nó lembra de que varredura veio

Afinar um perfil de captura é um ciclo: varrer, olhar o resultado no acervo, mudar a regra, varrer
de novo. Hoje o ciclo tem ida e não tem volta — a tela já sabe refazer a **proposta** (`forceNew`),
mas o que foi aprovado fica, e o schema diz isso de propósito: "apagar uma execução não apaga nada
aprovado". Reimportar um livro de 447 páginas significava apagar centenas de nós à mão.

**Decidimos que uma importação é apagável de uma vez**, e que para isso o acervo guarda de onde
cada nó veio: uma coluna com o id da execução no `DocumentNode`, indexada.

A alternativa era ler `scanRunId` do `metadataJson` da âncora, que já existe. Ela não serve para
apagar: não tem índice, some se alguém retirar a âncora, e — o que decide — **não distingue o nó
que o scan criou do nó que ele apenas reaproveitou**. Apagar um capítulo que já existia antes do
scan, e que só recebeu corpo, seria apagar trabalho que a importação não fez.

Regras do gesto:

- **Vai para a lixeira**, não some. É o apagamento que o app já tem, e é reversível enquanto a
  lixeira não for esvaziada.
- **O que foi editado à mão depois da aprovação é preservado**, e o resumo diz quantos e quais.
- **A execução antiga sai junto** — páginas lidas e proposta. Um livro, uma importação.
- A confirmação mostra os números antes: quantos capítulos, seções, questões e figuras.

## Considered options

**Apagar de verdade, numa transação.** Rejeitada: inventa um segundo jeito de apagar coisa no app,
e é o caminho mais curto para perder trabalho sem recurso. A lixeira já existe e já é o lugar onde
apagar de verdade acontece, de propósito, num gesto separado.

**Apagar tudo, inclusive o editado à mão.** Rejeitada pelo autor: é mais previsível para
reimportar do zero, e custa caro no dia em que a correção manual era a parte boa.

**Guardar a execução antiga como histórico, para comparar varreduras.** Rejeitada por ora: a lista
de varreduras de um livro cresceria sem fim, e comparar duas propostas é uma tela que não existe.
Quando existir, o que ela precisa — a proposta ao lado do que a pessoa corrigiu — já está gravado.

## Consequences

Uma migração pequena, aditiva: uma coluna e um índice. Nós antigos ficam sem proveniência, e
tudo bem — eles não vieram de scan nenhum.

Apagar uma importação grande toca centenas de linhas numa transação. Se ficar lento com o livro
inteiro, otimiza-se depois sem mudar a promessa: o que o usuário vê é "isto vai para a lixeira".

A coluna também responde a uma pergunta que ninguém conseguia responder antes: **o que este livro
tem que veio de máquina?** É a mesma pergunta do filtro *a revisar*, agora por importação.
