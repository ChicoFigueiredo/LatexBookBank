import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Higiene de portabilidade, verificada em vez de prometida.
 *
 * A Fase 6.5 vai trocar SQLite por PostgreSQL e provar que o domínio não precisa de cirurgia.
 * Esse spike só é barato se o schema não tiver acumulado, no caminho, construções que só
 * existem num dos motores. Este teste é o que impede o acúmulo: ele falha **agora**, quando
 * corrigir custa uma linha, e não na Fase 6.5, quando custaria uma migração.
 *
 * Ver `docs/_atual/_planejamento.md` §3.5 (D24, D25) e 1ª auditoria §7.
 */

const schema = readFileSync(
  fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url)),
  "utf8",
);

/** Remove comentários para que uma menção em prosa não dispare falso positivo. */
const code = schema
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("//"))
  .join("\n");

const models = [...code.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map(([, name, body]) => ({
  name: name as string,
  body: body as string,
}));

/** Tabelas de junção: identidade composta, sem `id` nem timestamps próprios. */
const JOIN_TABLES = new Set(["PublicationAuthor", "QuestionTag"]);

/**
 * Imutáveis por design (D29): registram `createdAt` e nunca `updatedAt`.
 *
 * Arquivo de origem alterado gera um Asset novo; um anchor descreve um recorte que já aconteceu;
 * e um `RenderJob` é uma compilação que ocorreu — mudar entrada não edita o job, cria outro, que
 * é justamente o que faz o `contentHash` servir de cache.
 */
// `AgentRun` entra aqui pelo mesmo motivo dos outros três: é registro do que aconteceu. Um log
// de auditoria que se edita depois não serve para auditar coisa nenhuma.
const IMMUTABLE_MODELS = new Set(["Asset", "SourceAnchor", "RenderJob", "AgentRun"]);

/**
 * Sem mutação relevante a rastrear.
 *
 * Os três modelos de conhecimento LaTeX entram aqui porque são **dado de referência reposto por
 * inteiro** a cada importação (#47): um `updatedAt` neles diria quando o importador rodou pela
 * última vez, que é justamente o que o relatório do import já informa. `LatexSnippet` fica de
 * fora da lista porque um dia vai receber itens criados dentro do produto — daí o `legacyId`
 * anulável — e aí a data de criação passa a significar alguma coisa.
 */
const NO_TIMESTAMPS = new Set([
  "Author",
  "Tag",
  "LatexSymbolGroup",
  "LatexSymbol",
  "LatexIconMenu",
]);

describe("o schema tem os 17 modelos esperados", () => {
  it("nenhum foi perdido nem acrescentado sem passar por aqui", () => {
    expect(models.map((m) => m.name).sort()).toEqual([
      "AgentRun",
      "Asset",
      "Author",
      "DocumentNode",
      "LatexIconMenu",
      "LatexSnippet",
      "LatexSymbol",
      "LatexSymbolGroup",
      "Publication",
      "PublicationAuthor",
      "Question",
      "QuestionOption",
      "QuestionTag",
      "RenderJob",
      "SourceAnchor",
      "Tag",
      "Workspace",
    ]);
  });
});

describe("nada exclusivo de um motor", () => {
  it("não usa `enum` — o conector SQLite não suporta", () => {
    expect(code).not.toMatch(/^enum\s+\w+/m);
  });

  it("não usa o tipo `Json` — idem", () => {
    // Campos de metadados são `String` com JSON serializado.
    for (const model of models) {
      expect(model.body, `${model.name} usa Json`).not.toMatch(/^\s+\w+\s+Json\b/m);
    }
  });

  it("não usa atributos nativos `@db.` — são específicos de provider", () => {
    expect(code).not.toMatch(/@db\.\w+/);
  });

  it("não usa `Bytes` — binário não entra no banco (auditoria §8)", () => {
    for (const model of models) {
      expect(model.body, `${model.name} guarda binário`).not.toMatch(/^\s+\w+\s+Bytes\b/m);
    }
  });

  it("não usa `autoincrement()` — IDs novos são UUID", () => {
    // `autoincrement` amarra a identidade à sequência do motor e quebra merge entre bases.
    expect(code).not.toMatch(/autoincrement\(\)/);
  });
});

describe("identidade", () => {
  it("todo modelo de entidade tem `id String @id @default(uuid())`", () => {
    for (const model of models) {
      if (JOIN_TABLES.has(model.name)) continue;
      expect(model.body, `${model.name} sem id UUID`).toMatch(
        /^\s+id\s+String\s+@id\s+@default\(uuid\(\)\)/m,
      );
    }
  });

  it("tabelas de junção usam identidade composta", () => {
    for (const name of JOIN_TABLES) {
      const model = models.find((m) => m.name === name);
      expect(model?.body, `${name} sem @@id composto`).toMatch(/@@id\(\[/);
    }
  });
});

describe("timestamps", () => {
  it("entidades mutáveis registram criação e atualização em UTC", () => {
    for (const model of models) {
      if (JOIN_TABLES.has(model.name) || NO_TIMESTAMPS.has(model.name)) continue;

      expect(model.body, `${model.name} sem createdAt`).toMatch(
        /createdAt\s+DateTime\s+@default\(now\(\)\)/,
      );

      if (IMMUTABLE_MODELS.has(model.name)) {
        // A ausência aqui é a decisão, não um esquecimento: fonte é imutável (D29).
        expect(model.body, `${model.name} deveria ser imutável`).not.toMatch(/@updatedAt/);
      } else {
        expect(model.body, `${model.name} sem updatedAt`).toMatch(
          /updatedAt\s+DateTime\s+@updatedAt/,
        );
      }
    }
  });
});

describe("nomes de tabela são explícitos", () => {
  it("todo modelo declara `@@map`", () => {
    // Sem @@map, o nome da tabela vira detalhe do gerador e muda com o provider.
    for (const model of models) {
      expect(model.body, `${model.name} sem @@map`).toMatch(/@@map\("[a-z_]+"\)/);
    }
  });
});

describe("isolamento por workspace", () => {
  it("entidades de topo carregam `workspaceId`", () => {
    for (const name of ["Publication", "Asset", "Tag"]) {
      const model = models.find((m) => m.name === name);
      expect(model?.body, `${name} sem workspaceId`).toMatch(/workspaceId\s+String/);
    }
  });
});

describe("índices declarados", () => {
  it("a árvore é indexada pelo caminho de leitura mais quente", () => {
    // Carregar a árvore de uma publicação é a consulta mais frequente do workbench.
    const node = models.find((m) => m.name === "DocumentNode");
    expect(node?.body).toMatch(/@@index\(\[publicationId,\s*parentId,\s*sortKey\]\)/);
  });

  it("assets são buscáveis por hash — dedup e integridade dependem disso", () => {
    const asset = models.find((m) => m.name === "Asset");
    expect(asset?.body).toMatch(/@@index\(\[sha256\]\)/);
  });

  it("a idempotência do import é garantida por unique, não por convenção", () => {
    const publication = models.find((m) => m.name === "Publication");
    expect(publication?.body).toMatch(/@@unique\(\[workspaceId,\s*legacyId\]\)/);

    const node = models.find((m) => m.name === "DocumentNode");
    expect(node?.body).toMatch(/@@unique\(\[publicationId,\s*legacyId\]\)/);

    // O conhecimento LaTeX é global (não pende de Workspace), então `legacyId` sozinho é a
    // identidade — e é por ele que o importador sabe o que é dele e pode repor sem apagar o
    // que for criado dentro do produto (#47).
    for (const name of ["LatexSnippet", "LatexSymbolGroup", "LatexSymbol", "LatexIconMenu"]) {
      const model = models.find((m) => m.name === name);
      expect(model?.body, `${name} sem legacyId único`).toMatch(/legacyId\s+Int\?\s+@unique/);
    }
  });

  it("o cache de render é garantido por unique, não por convenção", () => {
    // Sem o unique, duas compilações simultâneas da mesma entrada criariam dois jobs e o cache
    // passaria a depender de qual o `findFirst` devolvesse — não determinístico, e por isso pior
    // que não ter cache.
    const job = models.find((m) => m.name === "RenderJob");
    expect(job?.body).toMatch(/@@unique\(\[workspaceId,\s*contentHash\]\)/);
  });

  it("o conhecimento LaTeX guarda a miniatura como SVG, nunca como binário", () => {
    // A auditoria §8 proíbe BLOB no banco. O legado tem `PNGSimbol` (1,1 MB); ele não entra.
    const symbol = models.find((m) => m.name === "LatexSymbol");
    expect(symbol?.body).toMatch(/previewSvg\s+String\?/);
    expect(symbol?.body).not.toMatch(/Bytes/);
  });
});
