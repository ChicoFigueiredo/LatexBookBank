/**
 * Leitura e escrita de `.env`, do tamanho exato do problema.
 *
 * Não é um parser de `.env` — é o que o `setup` precisa para manter **um** segredo em dois
 * arquivos: o `.env` da raiz, que o `docker compose` lê, e o `.env.local` da app, que manda o
 * cabeçalho. Divergir entre os dois dá 401 no worker, e a app não tem como explicar isso.
 *
 * Mora num módulo próprio porque é a única parte do `setup` que **escreve no arquivo de outra
 * pessoa**. Errar aqui não dá erro: dá um `.env` corrompido que só aparece na próxima subida.
 *
 * Ver issue #168 · planejamento §8 Fase 0.
 */

import { access, appendFile, readFile } from "node:fs/promises";

const LINE = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/;

const exists = async (file) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};

/**
 * O valor de `key`, ou `null`.
 *
 * Linha comentada **não** conta: `# RENDERER_SECRET=""` está no `.env.example` como documentação,
 * e lê-la como valor faria o `setup` concluir que já existe segredo — vazio.
 *
 * Aspas saem: o compose não as remove, então um valor entre aspas no `.env` da raiz chegaria ao
 * contêiner **com** as aspas e o cabeçalho não bateria com o da app.
 */
export async function readEnvValue(file, key) {
  if (!(await exists(file))) return null;

  const content = await readFile(file, "utf8");

  // De baixo para cima: se a chave aparecer duas vezes, quem vale é a última — que é como o
  // compose e o Next.js leem. Devolver a primeira faria o `setup` concordar com um arquivo que a
  // aplicação lê de outro jeito.
  const lines = content.split("\n").reverse();

  for (const line of lines) {
    const match = LINE.exec(line);
    if (match?.[1] !== key) continue;

    const value = (match[2] ?? "").trim().replace(/^["']|["']$/g, "");
    return value === "" ? null : value;
  }
  return null;
}

/**
 * Garante `key=value` no arquivo, acrescentando ao fim quando o valor ainda não está lá.
 *
 * **Acrescenta, nunca reescreve.** Reescrever exigiria entender o arquivo inteiro — comentários,
 * aspas, continuações — para devolvê-lo igual, e o custo de errar é o `.env` de alguém. Como a
 * leitura vale a última ocorrência, acrescentar é suficiente e não perde nada do que já estava.
 *
 * `value` é sempre o valor **cru**, sem aspas; quem decide o formato do arquivo é a opção
 * `quote`. A primeira versão aceitava o valor já entre aspas e comparava com o que a leitura
 * devolve — que vem **sem** elas —, então nunca dava igual e cada `bun run setup` deixava uma
 * linha nova no arquivo. Passou pelos testes do módulo porque eles chamavam com valor cru: o
 * defeito não estava aqui nem lá, estava no contrato entre os dois.
 *
 * @param {{ comment?: string, quote?: boolean }} [options]
 */
export async function ensureEnvValue(file, key, value, options = {}) {
  if ((await readEnvValue(file, key)) === value) return false;

  const prefix = (await exists(file)) ? "\n" : "";
  const head = options.comment === undefined ? "" : `${options.comment}\n`;
  // Aspas no `.env.local`, que é o formato do resto do arquivo; **sem** aspas no `.env` da raiz,
  // porque o compose não as remove e elas entrariam no valor.
  const written = options.quote === true ? `"${value}"` : value;

  await appendFile(file, `${prefix}${head}${key}=${written}\n`);
  return true;
}
