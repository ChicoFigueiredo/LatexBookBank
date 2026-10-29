# O contrato da rota é um tipo, e a tela o lê pelo mesmo tipo

Cada tela fazia `(await response.json()) as {...}`, com a forma da resposta escrita à mão ao lado
do `fetch`. O `tsc` não ligava essa forma à rota: renomear um campo no servidor passava limpo, e a
tela mostrava `undefined` no lugar do dado (ARQ-10 da revisão de 2026-09-23). As telas maiores
tinham cinco, dez `fetch` assim, cada um com a sua cópia da forma.

**Decidimos que a resposta de toda rota que uma tela lê é um tipo exportado, e que os dois lados o
importam**:

- O tipo mora em `modules/<m>/application/*-contract.ts` — só tipos, sem nada de servidor —, ou no
  DTO que o módulo já tinha (o scan).
- A rota anota o que devolve com `satisfies`: `NextResponse.json(result satisfies
  QuestionDetailResponse)`. Um campo a mais, a menos ou com outro tipo é erro de compilação na
  rota, e não `undefined` na tela.
- A tela não chama `fetch`: chama o cliente do módulo, `modules/<m>/ui/*-client.ts`, que importa o
  mesmo tipo e passa por `src/shared/http/api-client.ts` (`requestJson`, `sendJson`, `readReply`,
  e o `ApiError` com o status e o corpo da recusa).
- O teste de contrato roda o cliente contra a rota de verdade, sem servidor:
  `tests/support/route-fetch.ts` é um `fetch` que entrega a requisição ao Route Handler, com o
  banco temporário. Cliente e rota que divergem no caminho ou no corpo quebram ali, e não no E2E.

## Considered options

**Validar a saída com Zod em tempo de execução**, como a §4.4 do planejamento pedia ("Zod na
entrada e na saída"). Rejeitada: o servidor validaria contra um schema o objeto que ele mesmo
acabou de montar, a cada resposta, para pegar um erro que o compilador pega antes. E o schema
seria uma segunda descrição da forma, que pode divergir do tipo do mesmo jeito que a cópia na tela
divergia da rota.

**Gerar o cliente a partir das rotas** (OpenAPI, tRPC, um gerador próprio). Rejeitada por pesar
mais do que resolve num app de uma pessoa com rotas do App Router: entra um passo de geração, um
formato intermediário e, no tRPC, um segundo jeito de expor o servidor ao lado das rotas que já
existem. O `satisfies` dá a mesma garantia de compilação com o que a linguagem já tem.

**Deixar o tipo na rota e importá-lo da tela.** Rejeitada porque a tela passaria a importar um
arquivo de `app/api`, que traz junto o Next do servidor, os adaptadores e o Prisma. O contrato
fica em `application/`, que a tela pode importar e que não puxa nada de servidor.

## Consequences

Uma rota nova que alguma tela lê nasce com três coisas: o tipo no contrato, o `satisfies` na rota
e a função no cliente. É cerimônia, e é a que faz o renomear de um campo aparecer no `tsc`.

O tipo descreve o que **a rota promete**, não o que o domínio tem: quando os dois diferem — a
dificuldade gravada é qualquer inteiro, e o domínio só conhece cinco degraus —, o contrato diz o
que chega, e quem estreita é o cliente, num lugar só.

A entrada não está coberta: o corpo que a tela manda é montado pelo cliente com os tipos do
contrato, mas a rota continua lendo `unknown` e recusando o que não serve, como o
[ADR 0011](0011-a-borda-traduz-o-erro.md) descreve. Um cliente de fora do app não é confiável só
porque compila.

Ver D70 no planejamento.
