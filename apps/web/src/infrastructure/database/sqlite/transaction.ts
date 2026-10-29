import type { Prisma } from "@/generated/prisma/client";

/**
 * O cliente dentro de uma transação: o que `prisma.$transaction(async (tx) => …)` entrega.
 *
 * Um tipo só, para os adaptadores que recebem a transação de quem a abriu. Estava redeclarado em
 * seis deles, com duas grafias (`Prisma.TransactionClient` e a extraída de `$transaction`) que só
 * por acaso davam o mesmo tipo.
 *
 * Só o tipo, sem `server-only`: quem o importa não carrega o cliente por isso.
 */
export type Tx = Prisma.TransactionClient;
