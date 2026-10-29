import type { PreviewBlock } from "@modules/preview/domain/preview-model";

import type { QuestionLatexBlock } from "./question-latex";
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
 * Há teste de fronteira (`tests/question-type-plugin.test.ts`) varrendo o código atrás de `switch`,
 * de comparação com o nome de um tipo e de tabela por tipo fora daqui — é o guard que impede a
 * regra de virar recomendação.
 *
 * Por isso o plugin também **declara** o que o resto do produto pergunta sobre o tipo: rótulo, dica,
 * se tem alternativas, quantas nascem, se só uma pode ser correta. Antes cada pergunta tinha uma
 * tabela própria — no editor, no menu, na criação, nas alternativas, no scan —, e elas discordavam.
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

/**
 * O que um tipo com alternativas declara sobre elas.
 *
 * Declarado no plugin, e não em tabelas por tipo espalhadas pelo código: a avaliação, o editor e a
 * criação perguntam aqui, e um tipo novo diz isto uma vez, no arquivo dele.
 */
export interface OptionsCapability {
  /** Quantas alternativas a questão ganha ao nascer. */
  readonly initial: number;
  /** Só uma pode ser correta: marcar uma desmarca as outras. */
  readonly exclusiveCorrect: boolean;
}

export interface QuestionTypePlugin {
  readonly type: QuestionType;
  /** Nome em português, para a interface. */
  readonly label: string;
  /** O que distingue o tipo, em poucas palavras: "uma correta", "sem alternativas". */
  readonly hint: string;

  /**
   * As alternativas do tipo, ou `null` quando ele não as tem.
   *
   * `null` não apaga nada: trocar uma escolha simples para discursiva deixa as alternativas no
   * banco. Quer dizer que elas **não aparecem** — nem na prova, nem no gabarito (#262).
   */
  readonly options: OptionsCapability | null;

  validate(question: QuestionForPlugin): readonly ValidationIssue[];

  /**
   * O corpo LaTeX, **em blocos**. O preâmbulo é do perfil de render, nunca do plugin.
   *
   * Blocos e não texto porque o diagnóstico do compilador é clicável desde a #161: o mapa de
   * "linha do corpo → campo da questão" sai daqui, da mesma passagem que monta o texto. Devolver
   * uma string obrigaria a adivinhar esse mapa por fora, e adivinhar posição de linha em texto
   * montado por outro funciona até o dia em que não funciona, sem avisar.
   *
   * Para quem só quer o texto, `latexFromBlocks` junta — e é a **única** junção que existe.
   */
  buildLatexBlocks(
    question: QuestionForPlugin,
    options?: BuildLatexOptions,
  ): readonly QuestionLatexBlock[];

  /**
   * @deprecated Ninguém chama, e nenhum plugin implementa. O preview rápido é o
   * `buildPreviewModel`, que pergunta ao tipo só o que muda nele — se as alternativas aparecem
   * (`visibleOptions`). Um tipo novo que implementasse isto acharia que controla o preview, e não
   * controlaria nada (revisão de 2026-09-23, ARQ-05). Opcional, e não removido, só para não
   * quebrar quem ainda declara o método; sai do contrato quando ninguém mais o declarar.
   */
  buildFastPreview?(question: QuestionForPlugin): readonly PreviewBlock[];

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

/** Os plugins, na ordem do registro — que é a ordem em que a criação os oferece. */
export const registeredPlugins = (): readonly QuestionTypePlugin[] => [...registry.values()];

/**
 * As alternativas do tipo, ou `null` quando ele não as tem **ou não tem plugin**.
 *
 * Tipo sem plugin responde `null`: sem plugin ninguém sabe montar, validar nem corrigir as
 * alternativas dele, e mostrá-las seria fingir que sabe.
 */
export const optionsOf = (type: QuestionType): OptionsCapability | null =>
  pluginFor(type)?.options ?? null;

/**
 * As alternativas que o tipo mostra: todas, ou nenhuma.
 *
 * Trocar o tipo não apaga alternativa — a discursiva que já foi escolha simples as guarda —, e
 * cada tela que as desenha precisa da mesma resposta para "aparecem ou não".
 */
export const visibleOptions = <T>(type: QuestionType, options: readonly T[]): readonly T[] =>
  optionsOf(type) === null ? [] : options;
