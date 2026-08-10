import { ASK_SYSTEM_PROMPT, type AgentMode } from "./agent-run";

/**
 * O que cada modo **é** — não que prompt ele usa.
 *
 * Um modo é um conjunto de tools, um teto de iterações e um critério de parada. Tratá-lo como
 * variação de texto é como o `FIX_LATEX` vira um laço caro sem fim: sem teto próprio e sem
 * relógio, "tentar até compilar" e "ficar preso" são a mesma coisa vista de fora.
 *
 * Ver spec §35 · §36 · issue #107.
 */

export type ToolSet = "read" | "read+propose" | "read+propose+render";

export interface ModeProfile {
  readonly id: AgentMode;
  readonly label: string;
  readonly tools: ToolSet;
  /**
   * Idas e voltas com o modelo.
   *
   * `FIX_LATEX` ganha mais porque o ciclo dele é "compila, lê o erro, corrige" — três iterações
   * mal cobrem uma tentativa de correção com verificação.
   */
  readonly maxIterations: number;
  /**
   * O relógio de parede do turno inteiro.
   *
   * Existe porque o teto de iterações conta chamadas, não tempo: um modelo local de 30B pode levar
   * dois minutos por chamada, e cinco iterações viram dez minutos com a tela parada. O timeout é
   * o que garante que o usuário recebe **alguma** resposta.
   */
  readonly timeoutMs: number;
  readonly systemPrompt: string;
}

/**
 * Os seis critérios da §36.
 *
 * Ficam no prompt do `REVIEW` porque é o modo que revisa a questão inteira. Enumerá-los importa:
 * sem lista, o modelo revisa o que primeiro chama a atenção — quase sempre a redação — e passa por
 * cima do gabarito, que é o defeito que de fato inutiliza uma questão.
 */
const REVIEW_CRITERIA = [
  "1. **Sintaxe LaTeX** — o que não compila, e o que compila errado.",
  "2. **Formatação** — unidades com `siunitx`, matemática em modo matemático, listas coerentes.",
  "3. **Estrutura da questão** — enunciado que pergunta algo, alternativas comparáveis entre si.",
  "4. **Gabarito** — existe uma correta? há mais de uma marcada? a resolução contradiz a marcada?",
  "5. **Metadados** — banca, ano e instituição plausíveis e coerentes com o enunciado.",
  "6. **Origem** — quando houver texto extraído da fonte, confira o enunciado contra ele.",
].join("\n");

const SHARED_RULES = [
  "",
  "Use as ferramentas para ler antes de propor. Você **não** escreve no banco: as ferramentas",
  "`propose_*` registram uma proposta que o usuário revisa e aplica — ou descarta. Nunca diga",
  "que alterou ou salvou algo.",
  "",
  "Sobre alternativas: a letra (a, b, c…) é projeção da posição, não identidade. Enderece",
  "alternativa sempre pelo id que a ferramenta devolveu.",
].join("\n");

export const MODE_PROFILES: Readonly<Record<AgentMode, ModeProfile>> = {
  ASK: {
    id: "ASK",
    label: "Pergunta",
    tools: "read",
    maxIterations: 3,
    timeoutMs: 180_000,
    systemPrompt: ASK_SYSTEM_PROMPT,
  },

  REVIEW: {
    id: "REVIEW",
    label: "Revisão",
    tools: "read+propose",
    maxIterations: 4,
    timeoutMs: 240_000,
    systemPrompt: [
      "Você revisa questões de um banco em LaTeX, em português do Brasil.",
      "",
      "Percorra os seis critérios, nesta ordem:",
      "",
      REVIEW_CRITERIA,
      "",
      "Proponha **apenas** o que estiver errado. Uma proposta que reescreve o que já estava certo",
      "gasta a atenção de quem revisa no lugar errado, e treina a pessoa a aprovar sem olhar.",
      "Se a questão estiver correta, diga isso e não proponha nada.",
      SHARED_RULES,
    ].join("\n"),
  },

  FIX_LATEX: {
    id: "FIX_LATEX",
    label: "Corrigir LaTeX",
    tools: "read+propose+render",
    // Mais folga: o ciclo é "compila, lê o erro, corrige", e cada volta gasta duas.
    maxIterations: 6,
    // Dez minutos, e o número vem de medição, não de gosto: contra o `qwen3-coder:30b` local,
    // cada chamada custa cerca de cem segundos com a conversa já grande, e o ciclo mínimo —
    // compilar o erro, corrigir, compilar de novo, propor — são quatro. Com 300 s o turno
    // acabava depois de confirmar a correção e antes de propô-la, que é o pior lugar possível
    // para parar.
    timeoutMs: 600_000,
    systemPrompt: [
      "Você corrige LaTeX que não compila, num banco de questões em português do Brasil.",
      "",
      "O ciclo é: leia o campo, use `render_candidate_latex` para confirmar o erro, corrija,",
      "compile de novo para confirmar que passou, e só então proponha.",
      "",
      "**Não proponha correção que você não compilou.** Um LaTeX que parece certo e não compila",
      "custa ao usuário exatamente o que ele veio evitar.",
      "",
      "Corrija o **erro**, não o texto ao redor: reescrever o enunciado inteiro para consertar uma",
      "chave faltando transforma uma correção verificável numa que precisa ser lida por completo.",
      SHARED_RULES,
    ].join("\n"),
  },

  ENRICH: {
    id: "ENRICH",
    label: "Enriquecer",
    tools: "read+propose",
    maxIterations: 4,
    timeoutMs: 240_000,
    systemPrompt: [
      "Você completa metadados e tags de questões de um banco em português do Brasil.",
      "",
      "Deduza de dentro da questão: o assunto sai do enunciado; a banca e o ano, quando o próprio",
      "texto os cita. **Não invente banca, ano nem instituição** — metade do acervo é de livro, e",
      "um metadado inventado é pior que um campo vazio, porque some da lista de pendências.",
      "",
      "Para cada campo de que você não tem certeza, registre em `warnings` o que o levou a supor e",
      "o quanto confia. É por essa lista que o usuário decide o que conferir na fonte.",
      SHARED_RULES,
    ].join("\n"),
  },

  STRUCTURE: {
    id: "STRUCTURE",
    label: "Estruturar",
    tools: "read+propose",
    maxIterations: 4,
    timeoutMs: 300_000,
    systemPrompt: [
      "Você transforma texto bruto — colado de PDF, digitado, extraído por OCR — em uma questão",
      "estruturada, em português do Brasil.",
      "",
      "Separe enunciado, alternativas e resolução. Preserve o texto do original: corrigir a",
      "redação da banca ao estruturar mistura duas decisões que o usuário precisa tomar separado.",
      "",
      "Marque como correta apenas a alternativa que o texto **afirma** ser. Se o gabarito não",
      "estiver no texto, não marque nenhuma e diga isso em `warnings`.",
      "",
      "Traços, letras e números de lista do original não entram no texto da alternativa: a letra",
      "é projeção da posição, e trazê-la junto reintroduz o erro que a estrutura existe para",
      "evitar.",
      SHARED_RULES,
    ].join("\n"),
  },
};

export const isAgentMode = (value: string): value is AgentMode => value in MODE_PROFILES;

export const profileForMode = (mode: AgentMode): ModeProfile => MODE_PROFILES[mode];
