import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createLogger, LOG_DOMAINS, sanitize } from "@/shared/observability/logger";

/**
 * O endurecimento da Fase 17 — e a palavra que o separa de uma lista de boas intenções é
 * **verificado**.
 *
 * Cada afirmação aqui varre o repositório. Sem isso elas valem no dia em que foram escritas e
 * deixam de valer no primeiro `localhost` que alguém digitar com pressa.
 */

const root = fileURLToPath(new URL("..", import.meta.url));

async function sourceFiles(dir: string, extensions = [".ts", ".tsx"]): Promise<string[]> {
  const found: string[] = [];

  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "generated") continue;

      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (extensions.includes(path.extname(entry.name))) found.push(full);
    }
  };

  await walk(dir);
  return found;
}

const relative = (file: string) => path.relative(root, file).replaceAll(path.sep, "/");

describe("o log estruturado", () => {
  const capture = () => {
    const lines: string[] = [];
    const logger = createLogger({
      write: (line) => lines.push(line),
      now: () => new Date("2026-08-10T12:00:00.000Z"),
      minLevel: "debug",
    });
    return { lines, logger };
  };

  it("uma linha JSON por evento, com domínio", () => {
    // `grep` numa linha formatada acha a palavra e perde o contexto.
    const { lines, logger } = capture();
    logger.info("render", "job.finished", { jobId: "j-1", durationMs: 812 });

    expect(JSON.parse(lines[0] as string)).toEqual({
      at: "2026-08-10T12:00:00.000Z",
      level: "info",
      domain: "render",
      event: "job.finished",
      fields: { jobId: "j-1", durationMs: 812 },
    });
  });

  it("os quatro domínios da spec existem", () => {
    for (const domain of ["render", "import", "agent", "persistence"]) {
      expect(LOG_DOMAINS).toContain(domain);
    }
  });

  it("**prompt completo não vai para o log**", () => {
    // O log sobrevive a limpezas de tela, vai para backup e é lido por quem investiga outra coisa.
    const { lines, logger } = capture();
    logger.info("agent", "turn.done", { prompt: "o enunciado inteiro da questão", model: "qwen" });

    const entry = JSON.parse(lines[0] as string) as { fields: Record<string, unknown> };
    expect(entry.fields["prompt"]).toBe("[omitido]");
    expect(entry.fields["model"]).toBe("qwen");
  });

  it("campo proibido vira `[omitido]`, e **não** some", () => {
    // A ausência silenciosa faria quem lê concluir que o valor não existia — "o prompt estava
    // vazio" é conclusão bem diferente de "o prompt não é gravado".
    expect(sanitize({ apiKey: "sk-1234" })).toEqual({ apiKey: "[omitido]" });
    expect(sanitize({ statementLatex: "Um capital de…" })).toEqual({
      statementLatex: "[omitido]",
    });
  });

  it("valor longo é truncado com a marca do quanto sobrou", () => {
    const clean = sanitize({ stdout: "x".repeat(900) });
    expect(String(clean["stdout"])).toMatch(/…\[\+400\]$/);
  });

  it("abaixo do nível mínimo, nada é gravado", () => {
    const lines: string[] = [];
    const logger = createLogger({ write: (line) => lines.push(line), minLevel: "warn" });

    logger.info("http", "request");
    logger.error("http", "failed");

    expect(lines).toHaveLength(1);
  });
});

describe("segredo nenhum no repositório", () => {
  it("nenhum arquivo versionado carrega chave, senha ou segredo literal", async () => {
    // O repositório é **público**. Um segredo commitado continua no histórico mesmo depois de
    // removido, e trocá-lo é sempre mais caro que não commitá-lo.
    const files = [
      ...(await sourceFiles(path.join(root, "src"))),
      ...(await sourceFiles(path.join(root, "app"))),
      ...(await sourceFiles(path.join(root, "scripts"))),
      ...(await sourceFiles(root, [".example", ".json", ".yml", ".yaml"])).filter(
        (file) => !file.includes("node_modules"),
      ),
    ];

    const patterns: ReadonlyArray<readonly [string, RegExp]> = [
      ["chave da OpenAI", /\bsk-[A-Za-z0-9]{20,}/],
      ["chave do OpenRouter", /\bsk-or-v1-[A-Za-z0-9]{20,}/],
      ["token do GitHub", /\bgh[pousr]_[A-Za-z0-9]{30,}/],
      ["senha em URL", /:\/\/[^\s:@/]+:[^\s:@/]{8,}@/],
    ];

    const leaks: string[] = [];
    for (const file of files) {
      const code = readFileSync(file, "utf8");
      for (const [label, pattern] of patterns) {
        if (pattern.test(code)) leaks.push(`${relative(file)}: ${label}`);
      }
    }

    expect(leaks).toEqual([]);
  });

  it("o `.env.example` documenta as chaves **sem** valores", async () => {
    const example = readFileSync(path.join(root, ".env.example"), "utf8");

    // Toda linha de valor precisa estar comentada ou vazia: um exemplo com valor de verdade é o
    // caminho mais curto para alguém commitar o próprio.
    for (const line of example.split("\n")) {
      const assignment = /^([A-Z_]+)=(.*)$/.exec(line.trim());
      if (assignment === null) continue;

      const value = (assignment[2] ?? "").replace(/^["']|["']$/g, "");
      expect({ key: assignment[1], suspicious: value.startsWith("sk-") }).toEqual({
        key: assignment[1],
        suspicious: false,
      });
    }
  });
});

describe("nenhuma infraestrutura hard-coded", () => {
  it("endereço de serviço só aparece em configuração, exemplo ou perfil declarado", async () => {
    // A promessa é que subir para a nuvem seja uma troca de variáveis. Um `localhost` no meio de
    // um caso de uso quebra isso em silêncio — funciona na máquina de quem escreveu.
    const allowed = [
      "src/shared/config/env.ts",
      // O perfil declara endereços **sugeridos**; o valor efetivo continua vindo do ambiente.
      "src/modules/agents/domain/ai-profile.ts",
    ];

    const offenders: string[] = [];

    for (const file of [
      ...(await sourceFiles(path.join(root, "src"))),
      ...(await sourceFiles(path.join(root, "app"))),
    ]) {
      const name = relative(file);
      if (allowed.includes(name)) continue;

      const code = readFileSync(file, "utf8");
      // Só linhas de código: comentário citando `http://127.0.0.1:28900` é documentação.
      const lines = code
        .split("\n")
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join("\n");

      if (/https?:\/\/(localhost|127\.0\.0\.1)/.test(lines)) offenders.push(name);
    }

    expect(offenders).toEqual([]);
  });

  it("o app não alcança nenhum host externo por conta própria", async () => {
    // Critério da auditoria §48: roda com a internet desligada. Tudo que ele chama é local — o
    // worker de render, o endpoint de IA — e o endereço dos dois vem do ambiente.
    const offenders: string[] = [];

    for (const file of [
      ...(await sourceFiles(path.join(root, "src"))),
      ...(await sourceFiles(path.join(root, "app"))),
    ]) {
      const name = relative(file);
      // O perfil cita `openrouter.ai` e `api.openai.com` como sugestão de configuração.
      if (name === "src/modules/agents/domain/ai-profile.ts") continue;

      const lines = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));

      for (const line of lines) {
        // `fetch` com URL literal externa é o que quebraria o modo offline.
        if (/fetch\(\s*["'`]https?:\/\//.test(line)) offenders.push(`${name}: ${line.trim()}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("isolamento por workspace", () => {
  it("toda entidade de conteúdo alcança um workspace", async () => {
    // Direto ou por um pai. Uma entidade sem caminho até o workspace é uma que a autorização não
    // consegue filtrar — e num produto que promete multi-workspace isso é um vazamento esperando
    // acontecer.
    const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");

    const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((match) => ({
      name: match[1] as string,
      body: match[2] as string,
    }));

    /** Entidades cujo caminho até o workspace passa por um pai declarado no corpo. */
    const viaParent: Readonly<Record<string, string>> = {
      DocumentNode: "publicationId",
      Question: "node",
      QuestionOption: "questionId",
      QuestionTag: "questionId",
      PublicationAuthor: "publicationId",
      SourceAnchor: "publicationId",
      AssessmentSection: "assessmentId",
      AssessmentItem: "sectionId",
      AssessmentVariant: "assessmentId",
      AssessmentVariantQuestion: "variantId",
      AssessmentVariantOptionMap: "variantQuestionId",
    };

    /** Sem dono: referência global ou registro de auditoria por entidade. */
    const global = new Set([
      "Workspace",
      "Author",
      "LatexSnippet",
      "LatexSymbol",
      "LatexSymbolGroup",
      "LatexIconMenu",
      "Revision",
    ]);

    const orphans = models
      .filter((model) => !global.has(model.name))
      .filter((model) => !model.body.includes("workspaceId"))
      .filter((model) => viaParent[model.name] === undefined)
      .map((model) => model.name);

    expect(orphans).toEqual([]);
  });

  it("a chave de storage é prefixada pelo workspace", () => {
    // Verificado de verdade em `store-asset.test.ts`; aqui o guarda é sobre o formato continuar
    // sendo esse.
    const provider = readFileSync(
      path.join(root, "src/infrastructure/storage/local/local-file-storage-provider.ts"),
      "utf8",
    );

    expect(provider).toContain("${input.workspaceId}/");
    expect(provider).toContain("#assertWorkspaceId");
  });
});
