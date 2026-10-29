import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * As rotas de asset chamadas como o browser as chama: `multipart/form-data` num `Request` de
 * verdade, contra o banco temporário e um storage temporário.
 *
 * Chamar `useTempStorage()` **depois** de `createTempDatabase()` e **antes** de importar a rota: o
 * `env()` lê `STORAGE_ROOT` uma vez e guarda.
 */
export async function useTempStorage(): Promise<string> {
  const root = mkdtempSync(path.join(tmpdir(), "lbb-test-storage-"));
  process.env["STORAGE_ROOT"] = root;
  const { resetEnvCache } = await import("@/shared/config/env");
  resetEnvCache();
  return root;
}

export function multipart(url: string, fields: Readonly<Record<string, string | File>>): Request {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return new Request(`http://127.0.0.1:28080${url}`, { method: "POST", body: form });
}

/** Bytes que viram arquivo — o conteúdo não importa, só que seja o mesmo quando precisa ser. */
export const pngFile = (name: string, content: string): File =>
  new File([new TextEncoder().encode(content)], name, { type: "image/png" });

/** Uma questão dentro de um livro, como a árvore a guarda: a questão e o nó que a põe no livro. */
export async function seedQuestion(publicationId: string, sortKey = "a0"): Promise<{ id: string }> {
  const { prisma } = await import("@infrastructure/database/sqlite/client");
  const question = await prisma.question.create({ data: { type: "OPEN" } });
  await prisma.documentNode.create({
    data: { publicationId, kind: "QUESTION", sortKey, questionId: question.id },
  });
  return { id: question.id };
}
