# Cloud Compatibility Report — parcial

> Entregável da Fase 6.5 (D30). **Parcial**: cobre o par `SQLite ↕ PostgreSQL`. O par
> `LocalFileStorage ↕ Vercel Blob` está bloqueado por decisão pendente e credencial ausente.
>
> Escrito em 2026-08-08, contra PostgreSQL 16.14 em Docker na porta `28432`. O ambiente principal
> permaneceu local e intocado.

## O achado que justifica a fase

**Sem `COLLATE "C"`, a ordem da árvore inverte no PostgreSQL — em silêncio.**

O `sortKey` é fractional index em base-62, e base-62 mistura caixa: na ordem de bytes, `Zz` vem
**antes** de `a0`. A colação padrão de um PostgreSQL glibc (`en_US.utf8`) ignora caixa e coloca
`a0` antes de `Zz`. Como as chaves com maiúscula são exatamente as que o gerador produz ao
**mover um nó para o topo**, o efeito prático é: tudo que foi movido para cima aparece no fim da
lista.

Medido na tabela `document_nodes` de verdade, com chaves geradas pelo próprio gerador da árvore:

```
ANTES   a0 a1 a2 a3 a4 Zv Zw Zx Zy ZyG ZyV Zz     ← invertido
DEPOIS  Zv Zw Zx Zy ZyG ZyV Zz a0 a1 a2 a3 a4     ← igual ao SQLite
```

O "depois" é a **mesma consulta**, sem mudar uma linha de aplicação — o que muda é a colação da
coluna:

```sql
ALTER TABLE "document_nodes"   ALTER COLUMN "sortKey" TYPE text COLLATE "C";
ALTER TABLE "question_options" ALTER COLUMN "sortKey" TYPE text COLLATE "C";
```

A colação vai **na coluna**, não em cada consulta, porque é assim que o `ORDER BY` gerado pelo
Prisma sai certo sem que nenhum caso de uso precise lembrar de pedir. O plano confirma:
`Sort Key: k COLLATE "C"`.

## O achado que quase escondeu o primeiro

**A primeira medição rodou em `postgres:16-alpine` e não acusou nada.**

Alpine usa **musl**, que não implementa colação por locale — `en_US.utf8` lá se comporta como `C`,
por bytes. O banco reportava `datcollate = en_US.utf8` e ordenava como se fosse `C`.

Trocar para `postgres:16` (Debian, glibc) foi o que revelou o problema. Se a validação da nuvem
tivesse sido feita contra a imagem Alpine, teria dado tudo verde e o defeito apareceria só em
produção, no Neon — que é glibc.

**Consequência prática:** qualquer teste de compatibilidade PostgreSQL deste projeto precisa rodar
contra imagem glibc. Está registrado aqui porque é o tipo de detalhe que ninguém lembra de
verificar duas vezes.

## Diferenças SQLite / PostgreSQL

| | resultado |
|---|---|
| Tradução do schema | **3 ajustes** — `provider`, e a marcação das duas colunas de ordenação |
| DDL gerado | 16 `CREATE TABLE`, sem erro, para os 16 modelos |
| `prisma validate` | verde no schema derivado |
| Domínio | **nenhuma mudança necessária** |
| Casos de uso | **nenhuma mudança necessária** |

O guard `tests/schema-portability.test.ts` já vinha impedindo o schema de acumular construção
específica de um motor — sem `enum`, sem `Json`, sem `@db.`, sem `Bytes`, sem `autoincrement()`.
É por isso que a tradução coube em três ajustes.

## Problemas do Prisma

1. **Não existe atributo de colação.** O Prisma não sabe expressar `COLLATE "C"`, então a
   exigência do D38 precisa ser aplicada por SQL depois do `migrate deploy`. Está em
   `apps/web/prisma/postgres-collation.sql` — num arquivo, e não num comentário, porque comentário
   não roda.
2. **`--schema` deixou de valer em `db push`** no Prisma 7; o schema vem do arquivo de config. Daí
   `prisma.postgres.config.ts`.
3. **`--to-schema-datamodel` foi removido** de `migrate diff` em favor de `--to-schema`.

## Como o schema PostgreSQL é mantido

**Derivado, não escrito à mão** (`bun run db:derive-postgres`). Dois schemas mantidos em paralelo
divergem — sempre, e no campo que ninguém olha; um vira a verdade e o outro vira uma mentira com
aparência de documentação. Aqui o de SQLite é a fonte e o de PostgreSQL é saída de build, marcada
como gerada no cabeçalho.

A derivação **falha** se um `sortKey` sumir do schema: renomear a coluna sem atualizar a derivação
produziria um PostgreSQL sem colação, e a árvore inverteria em produção sem nada acusar. Melhor
quebrar o build.

## O que ficou de fora, e por quê

- ⛔ **Vercel Blob.** Exige credencial, e a decisão sobre o destino dos assets na nuvem
  (Vercel Blob × DigitalOcean Spaces) continua sendo do Chico. O par
  `LocalFileStorage ↕ Vercel Blob` não foi exercitado.
- ⛔ **Neon.** Exige conta. O spike usou PostgreSQL 16.14 em Docker, que é o mesmo motor e a mesma
  família de colação, mas não é o mesmo provedor.
- ⛔ **`prisma db push` contra o banco do spike.** O CLI do Prisma 7 classifica a operação como
  destrutiva e exige consentimento explícito do usuário; a sessão rodava sem supervisão e a
  operação foi abortada, como manda a regra. O DDL foi obtido por `migrate diff` (não destrutivo)
  e aplicado por `psql` no contêiner descartável — o que prova a tradução do schema, mas **não**
  prova o caminho `prisma migrate` ponta a ponta.
- ⛔ **Suíte de integração nos dois motores.** Depende do item acima e da amostra mínima da
  auditoria §30.

## Mudanças necessárias

Uma, e está feita: **`COLLATE "C"` nas duas colunas de `sortKey`**, aplicada por
`prisma/postgres-collation.sql` depois do `migrate deploy`.

Nada mais. Nenhuma reescrita de domínio, nenhuma fronteira violada.
