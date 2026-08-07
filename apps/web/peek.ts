import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "./src/generated/prisma/client.ts";
const adapter = new PrismaLibSql({ url: process.env["DATABASE_URL"] ?? "file:./data/latexbookbank.db" });
const prisma = new PrismaClient({ adapter });
const q = await prisma.question.findFirst({ select: { id: true, updatedAt: true, statementLatex: true } });
console.log(JSON.stringify({ id: q?.id, updatedAt: q?.updatedAt.toISOString(), head: q?.statementLatex.slice(0, 24) }));
