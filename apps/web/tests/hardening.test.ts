import { readdirSync, readFileSync } from "node:fs";
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

describe("nenhum arquivo-fonte é binário", () => {
  it("nenhum `.ts`/`.tsx` carrega byte NUL", async () => {
    // Descoberto na auditoria #145: quatro arquivos usavam o **byte** NUL como separador de
    // chave. Funciona, compila, e custa caro: `grep` pula o arquivo em silêncio — foi assim que
    // uma varredura de módulos órfãos deu falso positivo — e o **git trata o arquivo como
    // binário**, então qualquer alteração nele aparece na revisão como
    // "1 file changed, 0 insertions(+), 0 deletions(-)".
    //
    // Num projeto que entrega em branch para revisão humana, um diff invisível é o pior lugar
    // possível para esconder uma mudança. O escape `\u0000` tem o mesmo valor e mantém o
    // arquivo legível por todo mundo — inclusive por este teste, que só o pega porque lê bytes.
    const files = [
      ...(await sourceFiles(path.join(root, "src"))),
      ...(await sourceFiles(path.join(root, "app"))),
      ...(await sourceFiles(path.join(root, "tests"))),
      ...(await sourceFiles(path.join(root, "scripts"))),
    ];

    const binary = files
      .filter((file) => readFileSync(file).includes(0))
      .map((file) => relative(file));

    expect(binary).toEqual([]);
  });
});

/**
 * A `storageKey` não sai do servidor (D26).
 *
 * Havia teste afirmando isso para a rota de origem, e **não** para a de upload — que a devolvia em
 * toda resposta, por um `...record` confortável. Este guarda varre as rotas atrás do padrão em vez
 * de conferir uma resposta: espalhar um registro do servidor num JSON de resposta vaza também o
 * campo que alguém acrescentar amanhã.
 *
 * Ver D26 · issue #173.
 */
describe("nenhuma rota devolve `storageKey`", () => {
  const rotas = readdirSync(path.join(root, "app/api"), { recursive: true, encoding: "utf8" })
    .filter((file) => typeof file === "string" && file.endsWith("route.ts"))
    .map((file) => path.join(root, "app/api", String(file)));

  it("há rotas para varrer", () => {
    expect(rotas.length).toBeGreaterThan(20);
  });

  it("nenhuma monta a resposta espalhando um registro do servidor", () => {
    // `...record`/`...stored`/`...asset` dentro de `NextResponse.json` é o formato exato do
    // vazamento que existia: nada erra, e a chave viaja.
    const suspeitas = rotas.filter((file) => {
      const code = readFileSync(file, "utf8");
      return /NextResponse\.json\(\s*\{[^}]*\.\.\.(record|stored|asset|row)\b/s.test(code);
    });

    expect(suspeitas.map((f) => f.replace(root, ""))).toEqual([]);
  });

  it("nenhuma cita `storageKey` como campo de resposta", () => {
    const suspeitas = rotas.filter((file) => {
      const code = readFileSync(file, "utf8")
        // Comentários explicam **por que** a chave não sai; contá-los como violação faria a
        // documentação da regra derrubar a regra.
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      return /storageKey\s*[,:]/.test(code) && !/asStorageKey\(/.test(code);
    });

    expect(suspeitas.map((f) => f.replace(root, ""))).toEqual([]);
  });
});

/**
 * A URL precisa ser verdade (#175).
 *
 * As rotas de questão têm a forma `/publications/:id/questions/:questionId`, e o primeiro segmento
 * era **decorativo**: nenhuma delas o lia. Dava para gravar uma questão real através de uma
 * publicação inexistente, e a resposta era 200.
 *
 * O isolamento por `workspaceId` existe no schema e é afirmado por outro guarda. O que faltava era
 * a checagem na **entrada** — e com duas bibliotecas, uma questão da primeira seria alcançável por
 * uma publicação da segunda sem o produto perceber.
 *
 * Este teste varre as rotas em vez de exercitar uma: o defeito não era uma rota errada, era o
 * hábito de confiar no parâmetro. Uma rota nova nasceria com o mesmo hábito.
 */
describe("toda rota de questão confere a publicação da URL", () => {
  const dir = path.join(root, "app/api/publications/[id]/questions/[questionId]");

  const rotas = readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => typeof file === "string" && file.endsWith("route.ts"))
    .map((file) => path.join(dir, String(file)));

  it("há rotas para varrer", () => {
    expect(rotas.length).toBeGreaterThanOrEqual(4);
  });

  it("nenhuma resolve a questão sem passar pelo guarda", () => {
    const semGuarda = rotas.filter(
      (file) => !readFileSync(file, "utf8").includes("resolveQuestionScope("),
    );

    expect(semGuarda.map((f) => f.replace(root, ""))).toEqual([]);
  });

  it("cada handler exportado chama o guarda — um por handler, não um por arquivo", () => {
    // Uma rota com `GET` e `PATCH` precisa de dois: proteger só o primeiro deixaria a escrita
    // aberta, que é exatamente o caminho que mais importa.
    for (const file of rotas) {
      const code = readFileSync(file, "utf8");
      const handlers = code.match(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g) ?? [];
      const guardas = code.match(/resolveQuestionScope\(/g) ?? [];

      expect(guardas.length, `${file.replace(root, "")}`).toBeGreaterThanOrEqual(handlers.length);
    }
  });
});

/**
 * **Quem oferece download diz o tamanho** (#195).
 *
 * A rota de export devolvia o `.lbb` sem `content-length`, e a resposta saía `chunked`: o navegador
 * mostra "tamanho desconhecido", sem barra, sem estimativa e sem como distinguir um download lento
 * de um travado. Num acervo de 109 MB é a diferença entre esperar e desistir.
 *
 * O par é o que este guarda amarra: `content-disposition: attachment` sem `content-length` é uma
 * promessa de arquivo sem promessa de fim.
 */
describe("toda rota de download anuncia o tamanho", () => {
  const rotas = readdirSync(path.join(root, "app/api"), { recursive: true, encoding: "utf8" })
    .filter((file) => typeof file === "string" && file.endsWith("route.ts"))
    .map((file) => path.join(root, "app/api", String(file)));

  it("há rotas para varrer", () => {
    expect(rotas.length).toBeGreaterThan(20);
  });

  it("`content-disposition: attachment` vem sempre com `content-length`", () => {
    const semTamanho = rotas.filter((file) => {
      const code = readFileSync(file, "utf8");
      // Só as que **montam** o corpo aqui: quem repassa um `Response` pronto já herda o cabeçalho.
      if (!/content-disposition["']?\s*:\s*[`"']attachment/i.test(code)) return false;
      return !/content-length/i.test(code);
    });

    expect(semTamanho.map((f) => f.replace(root, ""))).toEqual([]);
  });
});

/**
 * **A tela não fala do planejamento** (#197).
 *
 * Um estado vazio dizia "Capítulos e seções ganham conteúdo próprio no editor, **na Fase 3**" —
 * número de fase na cara de quem usa, prometendo um futuro que chegou faz tempo. Quem lê não tem o
 * planejamento; para essa pessoa, "Fase 3" é um jargão que não explica nada e uma promessa que já
 * venceu.
 *
 * O guarda varre só **texto de interface** — `title`, `description`, `label`, `placeholder`. Os
 * comentários do código citam fases o tempo todo, e devem citar: é lá que a decisão mora.
 */
describe("nenhum texto de interface cita fase do planejamento", () => {
  const telas = [
    ...varrerTsx(path.join(root, "app")),
    ...varrerTsx(path.join(root, "src/modules")),
    ...varrerTsx(path.join(root, "src/design-system")),
  ];

  it("há telas para varrer", () => {
    expect(telas.length).toBeGreaterThan(20);
  });

  it("`Fase N` não aparece em título, descrição, rótulo nem placeholder", () => {
    const suspeitas: string[] = [];

    for (const file of telas) {
      const code = readFileSync(file, "utf8");
      for (const [, texto] of code.matchAll(
        /(?:title|description|label|placeholder)=\{?"([^"]*)"/g,
      )) {
        if (/\bFase \d/.test(texto ?? "")) suspeitas.push(`${file.replace(root, "")}: ${texto}`);
      }
    }

    expect(suspeitas).toEqual([]);
  });
});

function varrerTsx(dir: string): string[] {
  const encontrados: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== "generated") {
      encontrados.push(...varrerTsx(path.join(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      encontrados.push(path.join(dir, entry.name));
    }
  }

  return encontrados;
}
