import type { PreviewBlock } from "@modules/preview/domain/preview-model";

import type { QuestionType } from "./question-type";

/**
 * O contrato de um tipo de questão.
 *
 * A regra que este arquivo existe para proteger é negativa: **nenhum `switch` global sobre tipo de
 * questão**. O acervo tem sete tipos e vai ganhar mais; com `switch`, cada novo tipo obriga a
 * caçar todos os lugares que decidem por tipo — e o esquecido não dá erro de compilação, dá
 * comportamento errado numa tela só.
 *
 * Com registry, acrescentar um tipo é acrescentar um arquivo. O que **não** existir no plugin
 * simplesmente não funciona para aquele tipo, de forma visível.
 *
 * Há teste de fronteira (`tests/question-type-plugin.test.ts`) varrendo o código atrás de `switch`
 * sobre tipo — é o guard que impede a regra de virar recomendação.
 */

/** A questão como o plugin a enxerga. Sem id, sem timestamps: nada disso muda a validação. */
export interface QuestionForPlugin {
  readonly type: QuestionType;
  readonly statementLatex: string;
  readonly solutionLatex: string;
  readonly complementLatex: string;
  readonly options: readonly QuestionOptionForPlugin[];
}

export interface QuestionOptionForPlugin {
  readonly id: string;
  readonly statementLatex: string;
  readonly isCorrect: boolean;
}

export type IssueSeverity = "error" | "warning";

/**
 * Um problema encontrado na questão.
 *
 * `error` e `warning` são coisas diferentes, e confundi-las esvazia as duas: erro é o que impede
 * a questão de ser usada; aviso é o que provavelmente está errado mas pode ser intencional. Um
 * acervo de vinte anos tem centenas de questões com aviso legítimo, e marcá-las todas como
 * inválidas faria ninguém mais olhar a lista.
 */
export interface ValidationIssue {
  readonly severity: IssueSeverity;
  /** Código estável, para a interface agrupar sem comparar texto. */
  readonly code: string;
  readonly message: string;
  /** Alternativa a que o problema se refere, quando é o caso. */
  readonly optionId?: string;
}

export interface BuildLatexOptions {
  /** Quando falso, o gabarito e a resolução ficam de fora — é o que se mostra ao aluno. */
  readonly includeSolution?: boolean;
}

export interface QuestionTypePlugin {
  readonly type: QuestionType;
  /** Nome em português, para a interface. */
  readonly label: string;

  validate(question: QuestionForPlugin): readonly ValidationIssue[];

  /** O corpo LaTeX. O preâmbulo é do perfil de render, nunca do plugin. */
  buildLatex(question: QuestionForPlugin, options?: BuildLatexOptions): string;

  /**
   * O preview rápido, em blocos.
   *
   * Depende do domínio de preview, e não da UI: `PreviewBlock` é vocabulário de "como isto se
   * desenha aproximadamente", que é exatamente o que o plugin tem a dizer. Fosse React aqui, cada
   * tipo de questão passaria a depender do framework.
   */
  buildFastPreview(question: QuestionForPlugin): readonly PreviewBlock[];

  /**
   * Embaralha o que puder ser embaralhado.
   *
   * Opcional porque nem todo tipo tem o que embaralhar — uma discursiva não tem. E devolve a
   * questão nova em vez de mutar: embaralhar é **visualização**, e o gabarito precisa continuar
   * apontando para a alternativa, não para a posição (D9).
   */
  randomize?(question: QuestionForPlugin, random: () => number): QuestionForPlugin;
}

/**
 * O registry.
 *
 * Um `Map` e três funções. Não há carregamento dinâmico nem descoberta por convenção: os plugins
 * são registrados explicitamente em `plugins/index.ts`, e ler aquele arquivo responde "quais tipos
 * o produto sabe tratar hoje" sem precisar rodar nada.
 */
const registry = new Map<QuestionType, QuestionTypePlugin>();

export function registerQuestionType(plugin: QuestionTypePlugin): void {
  registry.set(plugin.type, plugin);
}

/**
 * O plugin de um tipo, ou `null`.
 *
 * `null` e não exceção: um acervo importado pode ter tipo que ainda não tem plugin, e a interface
 * precisa mostrar a questão como "tipo não suportado" em vez de quebrar a página inteira.
 */
export const pluginFor = (type: QuestionType): QuestionTypePlugin | null =>
  registry.get(type) ?? null;

export const registeredTypes = (): readonly QuestionType[] => [...registry.keys()];
