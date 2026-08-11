import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error -- `.mjs` sem tipos, de propósito: o `setup` roda antes de existir toolchain.
import { ensureEnvValue, readEnvValue } from "../../../scripts/env-file.mjs";

/**
 * O `setup` escrevendo no `.env` de outra pessoa.
 *
 * O worker exige que **o mesmo** segredo esteja em dois arquivos — o `.env` da raiz, que o
 * `docker compose` lê, e o `.env.local`, que manda o cabeçalho. Até a #168 isso era um comentário
 * no `.env.example`: quem clonava descobria lendo, e o sintoma de errar era 401 no worker, que a
 * app não tem como explicar.
 *
 * Este arquivo existe porque escrever em `.env` alheio é a única parte do `setup` cujo erro **não
 * dá erro** — dá um arquivo corrompido que só aparece na próxima subida.
 *
 * Ver issue #168 · planejamento §8 Fase 0.
 */

const arquivo = async (conteudo?: string): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "lbb-env-"));
  const file = join(dir, ".env");
  if (conteudo !== undefined) await writeFile(file, conteudo, "utf8");
  return file;
};

describe("ler valor de `.env`", () => {
  it("lê a chave", async () => {
    const file = await arquivo("RENDERER_SECRET=abc123\n");
    expect(await readEnvValue(file, "RENDERER_SECRET")).toBe("abc123");
  });

  it("tira as aspas — o compose **não** tira", async () => {
    // Um valor entre aspas no `.env` da raiz chegaria ao contêiner com as aspas, e o cabeçalho da
    // app não bateria. Comparar sem normalizar faria o `setup` achar que os dois arquivos
    // divergem e acrescentar um segredo novo a cada execução.
    const file = await arquivo('RENDERER_SECRET="abc123"\n');
    expect(await readEnvValue(file, "RENDERER_SECRET")).toBe("abc123");
  });

  it("**ignora linha comentada** — o `.env.example` documenta a chave vazia", async () => {
    // Sem isto, o `setup` leria `# RENDERER_SECRET=""` do exemplo, concluiria que já existe
    // segredo, e o worker recusaria subir com uma string vazia.
    const file = await arquivo('# RENDERER_SECRET=""\n');
    expect(await readEnvValue(file, "RENDERER_SECRET")).toBeNull();
  });

  it("valor vazio é ausência, não valor", async () => {
    const file = await arquivo('RENDERER_SECRET=""\n');
    expect(await readEnvValue(file, "RENDERER_SECRET")).toBeNull();
  });

  it("chave repetida: vale a **última**, como o compose e o Next.js leem", async () => {
    const file = await arquivo("RENDERER_SECRET=antigo\nRENDERER_SECRET=novo\n");
    expect(await readEnvValue(file, "RENDERER_SECRET")).toBe("novo");
  });

  it("arquivo ausente devolve `null`, não lança", async () => {
    // É o caso do primeiro `setup` num clone novo: não existe `.env` na raiz.
    expect(await readEnvValue(join(tmpdir(), "nao-existe-lbb", ".env"), "X")).toBeNull();
  });

  it("não confunde chave com prefixo de outra", async () => {
    const file = await arquivo("RENDERER_SECRET_ANTIGO=nao\nRENDERER_SECRET=sim\n");
    expect(await readEnvValue(file, "RENDERER_SECRET")).toBe("sim");
  });
});

describe("garantir valor no `.env`", () => {
  it("acrescenta quando falta, e o valor volta legível", async () => {
    const file = await arquivo("DATABASE_URL=file:./x.db\n");

    expect(await ensureEnvValue(file, "RENDERER_SECRET", "abc")).toBe(true);
    expect(await readEnvValue(file, "RENDERER_SECRET")).toBe("abc");
    // E o que já estava continua lá: acrescentar nunca reescreve.
    expect(await readEnvValue(file, "DATABASE_URL")).toBe("file:./x.db");
  });

  it("**não acrescenta de novo** quando o valor já é o mesmo", async () => {
    // Sem isto, cada `bun run setup` deixaria uma linha nova no arquivo — e em dez execuções o
    // `.env` teria dez segredos iguais, o que parece defeito para quem abrir.
    const file = await arquivo("RENDERER_SECRET=abc\n");

    expect(await ensureEnvValue(file, "RENDERER_SECRET", "abc")).toBe(false);
    expect((await readFile(file, "utf8")).match(/RENDERER_SECRET/g)).toHaveLength(1);
  });

  it("cria o arquivo quando ele não existe, sem quebra de linha sobrando na frente", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lbb-env-"));
    const file = join(dir, ".env");

    await ensureEnvValue(file, "RENDERER_SECRET", "abc");

    expect(await readFile(file, "utf8")).toBe("RENDERER_SECRET=abc\n");
  });

  it("arquivo sem quebra no fim não gruda a chave nova na última linha", async () => {
    // `.env` editado à mão costuma terminar sem `\n`, e sem o prefixo a linha sairia
    // `STORAGE_ROOT=./dataRENDERER_SECRET=abc` — um arquivo que nenhum parser lê de volta.
    const file = await arquivo("STORAGE_ROOT=./data");

    await ensureEnvValue(file, "RENDERER_SECRET", "abc");

    expect(await readEnvValue(file, "STORAGE_ROOT")).toBe("./data");
    expect(await readEnvValue(file, "RENDERER_SECRET")).toBe("abc");
  });

  it("o comentário entra junto, acima da chave", async () => {
    const file = await arquivo("X=1\n");

    await ensureEnvValue(file, "RENDERER_SECRET", "abc", { comment: "# vem do setup" });

    expect(await readFile(file, "utf8")).toContain("# vem do setup\nRENDERER_SECRET=abc\n");
  });

  it("com `quote`, escreve entre aspas — e **não** acrescenta de novo na segunda vez", async () => {
    // O defeito que os testes de valor cru não pegavam: passar o valor já entre aspas fazia a
    // comparação nunca dar igual, porque a leitura devolve **sem** aspas. Cada `bun run setup`
    // deixava uma linha nova no `.env.local` de quem só queria rodar as migrations.
    const file = await arquivo("X=1\n");

    expect(await ensureEnvValue(file, "RENDERER_SECRET", "abc", { quote: true })).toBe(true);
    expect(await readFile(file, "utf8")).toContain('RENDERER_SECRET="abc"');

    expect(await ensureEnvValue(file, "RENDERER_SECRET", "abc", { quote: true })).toBe(false);
    expect((await readFile(file, "utf8")).match(/RENDERER_SECRET/g)).toHaveLength(1);
  });

  it("o valor com aspas volta a ser lido cru — é o que sustenta a comparação", async () => {
    const file = await arquivo("");
    await ensureEnvValue(file, "K", "a b c", { quote: true });

    expect(await readEnvValue(file, "K")).toBe("a b c");
  });

  it("valor diferente acrescenta, e a leitura passa a devolver o novo", async () => {
    // É como o `setup` sincroniza os dois arquivos quando eles divergiram.
    const file = await arquivo("RENDERER_SECRET=antigo\n");

    expect(await ensureEnvValue(file, "RENDERER_SECRET", "novo")).toBe(true);
    expect(await readEnvValue(file, "RENDERER_SECRET")).toBe("novo");
  });
});
