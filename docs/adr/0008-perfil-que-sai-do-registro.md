# Um perfil que sai do registro congela a proposta; não a destrói

Perfis de captura vivem no código, num registro explícito ([ADR 0007](0007-o-perfil-de-captura-e-codigo.md)),
e cada execução guarda `profileId@versão`. Código sai — renomeado, quase sempre. Quando saía,
cinco caminhos faziam três coisas diferentes, e nenhuma delas era boa:

- **Retomar destruía.** `runScan` marcava `FAILED`. Como `startScan` recusa reabrir execução que
  falhou, pedir de novo criava outra do zero: as páginas já lidas iam embora.
- **Revisar e aprovar davam 409.** Uma proposta revisada linha a linha nunca mais podia ser
  aprovada.
- **O passe de IA calava.** Devolvia `{ changed: [], calls: 0 }` — indistinguível de uma passada
  que rodou e não achou nada. A execução terminava dizendo que a IA trabalhou.
- **A tela mentia.** Abria normal, com `kinds` vazio, os seletores de tipo em branco e um 409 por
  clique, sem nada explicando.

**Decidimos uma política só: congela, avisa, e não destrói.**

A execução ganha o estado `AWAITING_PROFILE`. Não é falha — não há nada de errado com o PDF nem
com o que já foi lido. É espera: a `runKey` continua valendo, e devolver o perfil ao código faz a
varredura continuar da página seguinte à última lida.

A proposta pronta **continua aprovável**, porque aprovar nunca precisou do perfil vivo. O plano de
aprovação lê três dados dele, e a execução passa a guardar os três no dia da varredura, num retrato
congelado. Isso está no tipo agora: `ApprovalProfile`, com os três campos, no lugar do
`CaptureProfile` inteiro.

**Editar continua exigindo o perfil registrado**, e essa é a fronteira real. Mudar o tipo de um
item ou movê-lo pergunta "este pai pode conter este filho?", e `canContain` é código, não dado:
retrato nenhum o substitui. A tela diz isso antes do primeiro clique, em vez de deixar descobrir
pelo 409.

## Considered options

**Alias de id no registro.** Rejeitada como solução única: resolve renomear, que é o caso comum, e
não resolve perfil de fato removido. Continua disponível como conveniência futura — este ADR não a
impede, só não depende dela.

**Manter o 409 em tudo, tirando apenas o `FAILED` destrutivo e o silêncio.** Rejeitada pelo autor:
é o mínimo, e deixa de pé o pior caso concreto — a proposta revisada que não pode ser aprovada.

**Guardar o perfil inteiro serializado na execução.** Rejeitada: `classifyLine` e `canContain` são
funções, e serializar comportamento é como se inventa um segundo motor por acidente. O retrato
guarda dados, e a fronteira entre o que é dado e o que é código fica visível no tipo.

## Consequences

Uma migração pequena e aditiva: uma coluna. Execuções anteriores a ela ficam com `NULL`, e para
essas o perfil vivo continua respondendo, como sempre respondeu — só elas ainda dependem do
registro para serem aprovadas, e a mensagem de erro diz exatamente isso.

O retrato também conserta a tela pelo mesmo preço: rótulo e tipos voltam a aparecer numa proposta
cujo perfil saiu, em vez de seletores vazios.

E a lembrança do livro passa a ser conferida: se `captureProfileId` aponta para um perfil que não
existe mais, a tela de scan avisa em vez de cair no primeiro da lista em silêncio — cair calado
trocaria o perfil do livro pelas costas de quem o escolheu.
