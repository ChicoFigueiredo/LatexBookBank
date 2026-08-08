import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import "@modules/questions/domain/plugins";
import {
  pluginFor,
  registeredTypes,
  type QuestionForPlugin,
} from "@modules/questions/domain/question-type-plugin";
import { optionLabelAt } from "@modules/questions/domain/question-type";

const question = (over: Partial<QuestionForPlugin> = {}): QuestionForPlugin => ({
  type: "MULTIPLE_CHOICE",
  statementLatex: "Quanto é $2+2$?",
  solutionLatex: "É $4$.",
  complementLatex: "",
  options: [
    { id: "o1", statementLatex: "3", isCorrect: false },
    { id: "o2", statementLatex: "4", isCorrect: true },
  ],
  ...over,
});

const codes = (issues: readonly { code: string }[]): string[] => issues.map((i) => i.code);

describe("registry", () => {
  it("conhece os dois tipos registrados", () => {
    expect([...registeredTypes()].sort()).toEqual(["DISCURSIVE", "MULTIPLE_CHOICE"]);
  });

  it("devolve `null` para tipo sem plugin, em vez de lançar", () => {
    // Um acervo importado pode ter tipo ainda sem plugin, e a interface precisa mostrar
    // "não suportado" em vez de quebrar a página inteira.
    expect(pluginFor("CESPE")).toBeNull();
  });
});

describe("plugin de múltipla escolha", () => {
  const plugin = pluginFor("MULTIPLE_CHOICE")!;

  it("aceita uma questão bem formada", () => {
    expect(plugin.validate(question()).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("exige pelo menos duas alternativas", () => {
    const issues = plugin.validate(
      question({ options: [{ id: "o1", statementLatex: "4", isCorrect: true }] }),
    );
    expect(codes(issues)).toContain("too_few_options");
  });

  it("exige gabarito", () => {
    const issues = plugin.validate(
      question({
        options: [
          { id: "o1", statementLatex: "3", isCorrect: false },
          { id: "o2", statementLatex: "4", isCorrect: false },
        ],
      }),
    );
    expect(codes(issues)).toContain("no_correct_option");
  });

  it("duas corretas é **erro**, não aviso", () => {
    // O tipo diz "escolha uma". Se são várias, o tipo está errado — `MULTIPLE_CORRECT` existe
    // para isso — e usar assim geraria gabarito ambíguo.
    const issues = plugin.validate(
      question({
        options: [
          { id: "o1", statementLatex: "3", isCorrect: true },
          { id: "o2", statementLatex: "4", isCorrect: true },
        ],
      }),
    );
    const issue = issues.find((i) => i.code === "multiple_correct_options");

    expect(issue?.severity).toBe("error");
  });

  it("alternativa repetida é **aviso**, não erro", () => {
    // Aparece em questão legítima e em erro de digitação, e só quem escreveu sabe qual dos dois.
    const issues = plugin.validate(
      question({
        options: [
          { id: "o1", statementLatex: "4", isCorrect: true },
          { id: "o2", statementLatex: "4", isCorrect: false },
        ],
      }),
    );
    expect(issues.find((i) => i.code === "duplicate_option")?.severity).toBe("warning");
  });

  it("aceita quantidade arbitrária de alternativas", () => {
    // O legado fixava cinco. O acervo tem verdadeiro/falso com duas e concurso com seis.
    const seis = Array.from({ length: 6 }, (_, i) => ({
      id: `o${i}`,
      statementLatex: String(i),
      isCorrect: i === 0,
    }));
    expect(
      plugin.validate(question({ options: seis })).filter((i) => i.severity === "error"),
    ).toEqual([]);
  });

  it("o gabarito no LaTeX vem do índice, calculado na hora", () => {
    const latex = plugin.buildLatex(question(), { includeSolution: true });
    expect(latex).toContain("\\textbf{Gabarito:} b.");
  });

  it("omite gabarito e resolução por padrão", () => {
    // É o que se mostra ao aluno; incluir por engano seria o pior defeito possível.
    const latex = plugin.buildLatex(question());

    expect(latex).not.toContain("Gabarito");
    expect(latex).not.toContain("Resolução");
  });

  it("**o gabarito sobrevive à reordenação** — o teste que a spec pede", () => {
    // É exatamente isto que o legado não passava: `Marcacao` vivia na linha, e embaralhar deixava
    // o gabarito apontando para a letra errada.
    const original = question({
      options: [
        { id: "a", statementLatex: "1", isCorrect: false },
        { id: "b", statementLatex: "2", isCorrect: false },
        { id: "c", statementLatex: "3", isCorrect: true },
        { id: "d", statementLatex: "4", isCorrect: false },
      ],
    });

    // Embaralha vinte vezes, com sementes diferentes; em todas, a correta continua sendo a "c".
    for (let seed = 0; seed < 20; seed += 1) {
      let state = seed + 1;
      const random = () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
      };

      const shuffled = plugin.randomize!(original, random);
      const correct = shuffled.options.filter((o) => o.isCorrect);

      expect(correct).toHaveLength(1);
      expect(correct[0]?.id).toBe("c");
      expect(shuffled.options).toHaveLength(4);
    }
  });

  it("embaralhar não muda a questão original", () => {
    const original = question();
    plugin.randomize!(original, () => 0.5);

    expect(original.options[0]?.id).toBe("o1");
  });
});

describe("plugin discursivo", () => {
  const plugin = pluginFor("DISCURSIVE")!;

  it("não tem `randomize` — e a ausência é legível", () => {
    // Não há o que embaralhar. Um método vazio herdado seria pior: alguém teria de lembrar de
    // não chamá-lo.
    expect(plugin.randomize).toBeUndefined();
  });

  it("avisa sobre alternativas órfãs", () => {
    // Acontece quando alguém converte uma múltipla escolha em discursiva.
    const issues = plugin.validate(question({ type: "DISCURSIVE" }));
    expect(codes(issues)).toContain("discursive_has_options");
  });
});

describe("validações comuns", () => {
  const plugin = pluginFor("DISCURSIVE")!;

  it("enunciado vazio é erro; resolução vazia é aviso", () => {
    // Confundir os dois esvazia os dois: o acervo tem centenas de questões sem resolução escrita.
    const issues = plugin.validate(
      question({ type: "DISCURSIVE", statementLatex: "  ", solutionLatex: "", options: [] }),
    );

    expect(issues.find((i) => i.code === "statement_empty")?.severity).toBe("error");
    expect(issues.find((i) => i.code === "solution_empty")?.severity).toBe("warning");
  });

  it("pega `$` sem par — o erro mais caro do acervo", () => {
    // O modo matemático vaza para o resto do documento e o PDF sai com metade da questão em
    // itálico.
    const issues = plugin.validate(
      question({ type: "DISCURSIVE", statementLatex: "Vale $x + 1", options: [] }),
    );
    expect(codes(issues)).toContain("unbalanced_math");
  });

  it("não confunde `\\$` com modo matemático", () => {
    // O acervo é de matemática financeira: `R\$ 10` aparece o tempo todo.
    const issues = plugin.validate(
      question({ type: "DISCURSIVE", statementLatex: "Custa R\\$ 10 hoje.", options: [] }),
    );
    expect(codes(issues)).not.toContain("unbalanced_math");
  });

  it("pega chave sem fechar, ignorando `\\{`", () => {
    const aberta = plugin.validate(
      question({ type: "DISCURSIVE", statementLatex: "\\textbf{sem fim", options: [] }),
    );
    const escapada = plugin.validate(
      question({
        type: "DISCURSIVE",
        statementLatex: "O conjunto \\{1,2\\} é finito.",
        options: [],
      }),
    );

    expect(codes(aberta)).toContain("unbalanced_braces");
    expect(codes(escapada)).not.toContain("unbalanced_braces");
  });
});

/**
 * O guard que dá sentido ao registry.
 *
 * Sem ele, "nenhum `switch` global sobre tipo de questão" é uma recomendação — e recomendação
 * some na terceira pressa. Com sete tipos e mais por vir, cada `switch` esquecido não dá erro de
 * compilação: dá comportamento errado numa tela só.
 */
describe("nenhum `switch` global sobre tipo de questão", () => {
  const roots = ["src", "app"].map((dir) => fileURLToPath(new URL(`../${dir}`, import.meta.url)));

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = `${dir}/${name}`;
      if (statSync(path).isDirectory()) return walk(path);
      return /\.tsx?$/.test(name) ? [path] : [];
    });
  }

  it("nenhum arquivo faz `switch` sobre o tipo", () => {
    const offenders: string[] = [];

    for (const root of roots) {
      for (const file of walk(root)) {
        // O próprio registry e os plugins podem falar de tipo — são eles que resolvem por tipo.
        if (file.includes("/questions/domain/")) continue;

        const code = readFileSync(file, "utf8");
        if (/switch\s*\(\s*[\w.]*\b(type|questionType|kind)\b[^)]*\)/.test(code)) {
          // `kind` entra na busca porque é como o discriminante costuma se chamar aqui; um
          // `switch` sobre `kind` de tipo de questão seria a mesma falha com outro nome.
          if (/QUESTION_TYPES|QuestionType/.test(code)) offenders.push(file);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("a letra da alternativa tem **uma** implementação", () => {
  it("o preview reexporta a do domínio de questões", async () => {
    // Eu tinha escrito uma segunda cópia no preview e quase uma terceira no plugin. Três
    // implementações da mesma regra é como uma delas passa a divergir sem ninguém descobrir.
    const preview = await import("@modules/preview/domain/build-preview-model");

    expect(preview.optionLetter).toBe(optionLabelAt);
  });
});
