# A borda traduz o erro numa tabela só, e a entrada se valida à mão

Duas regras escritas que o repositório deixou de praticar, e uma prática que nenhuma regra
descrevia.

A §4.4 do planejamento e o README pediam **"Zod na entrada e na saída do Route Handler"**. Das 67
rotas, uma importava Zod (STE-02, STM-06 da revisão de 2026-09-23). O resto lia o corpo com
`typeof`, e o domínio fazia o parse de `unknown` à mão — `publication-draft`, `library`,
`node-body`, `question-blueprint`. Os comentários de `tree-http.ts` e de `env.ts` registravam a
decisão contrária à da documentação.

E cada rota traduzia o erro do seu jeito. Havia cinco tradutores encadeados — o da árvore, o do
scan, o do acervo, o do catálogo, o do render — e mais `instanceof` soltos em vinte rotas. Uma rota
nova precisava saber quais chamar e em que ordem, e um erro de domínio novo virava 500 nas rotas
que não tinham recebido o `instanceof` dele (STE-06, ARQ-11).

**Decidimos duas coisas**:

1. **Uma tabela só traduz erro em HTTP**: `app/api/http.ts`, com `toErrorResponse` e `withErrors`.
   Cada linha é a classe do erro, o status e o código, e, quando a tela precisa, os campos a mais
   (a lista de provas, o campo a marcar, as versões do conflito). As convenções: **400** é pedido
   mal formado, a correção é de quem pede; **409** é pedido certo que o estado recusa; **404** não
   distingue "não existe" de "não é seu"; **422** é o arquivo ou o candidato que chegou e não
   serve; **503** é o serviço de fora que não está configurado ou não responde. O que a tabela não
   conhece sai **500 com JSON**, e o detalhe vai para o log, nunca para o corpo.
2. **A entrada se valida à mão**, na rota (`readJson`, `BadRequestError`, os leitores de
   `tree-parsers.ts`) e no domínio, quando é ele quem sabe se o dado serve — o domínio aceita
   `unknown` e é o validador. **Zod fica onde o schema é rico**: o `QuestionPatch` que o agente
   propõe, o `.lbb`, a resposta da IA no scan, o JSON gravado da proposta e as operações de revisão
   do scan. A saída não é validada em tempo de execução; é tipada pelo contrato
   ([ADR 0010](0010-o-contrato-da-rota-e-um-tipo.md)).

## Considered options

**Zod em toda rota, com um `parseBody(schema)` comum.** Rejeitada: a maioria das rotas lê dois ou
três campos de vocabulário fechado — um id, um tipo de nó, uma posição —, e a regra de verdade
(o título tem até 500 caracteres, a biblioteca não pode ter nome repetido) é do domínio, que
precisaria validar de novo de qualquer jeito, porque é chamado também por script e por teste.
Dois validadores para o mesmo dado divergem; um schema por rota seria o segundo.

**Erro como valor** (`Result<T, E>`) em vez de exceção. Rejeitada por mudar a assinatura de todo
caso de uso para resolver um problema que era só da borda: o domínio já lança erros com classe e
campos, e o que faltava era um lugar único que os conhecesse.

**Cada módulo exporta o seu tradutor, e a borda os encadeia.** Era o que existia, e foi o que
falhou: a ordem importava, e o tradutor esquecido não dava erro nenhum — dava 500.

## Consequences

A tabela importa as classes de erro de quase todos os módulos. É o preço de ser o único lugar que
as conhece, e ela fica em `app/`, que é raiz de composição e pode depender de tudo.

Um erro de domínio novo precisa de uma linha na tabela, ou vira 500 com log. É o comportamento
certo para o esquecimento: a tela mostra "erro interno" em vez de um stack trace, e o log diz qual
classe faltou.

Os códigos (`not_found`, `conflict`, `duplicate_library`…) são os que cada rota já devolvia,
porque há telas que ramificam por eles. Unificar os nomes seria quebrar telas sem ganho.

Validação à mão tende a repetir pequenas funções entre rotas; quando a mesma aparece duas vezes,
ela vai para `http.ts`. Foi o que aconteceu com `requireId` e `requireText`, que estavam copiadas
em quatro rotas.

Ver D70 no planejamento.
