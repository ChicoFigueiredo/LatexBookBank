/**
 * O que um `.lbb` leva, dito para quem vai depender dele (#269).
 *
 * A tela de importar e exportar é onde se decide guardar um backup, e onde se volta com ele. Ela
 * dizia "uma biblioteca inteira", e a v2 não levava figuras, avaliações nem revisões — a pessoa só
 * descobriria na hora de restaurar. A lista mora aqui, junto do formato, para que quem acrescentar
 * algo ao `PortableWorkspace` ache a frase que precisa mudar.
 */
export const LBB_CARRIES: readonly string[] = [
  "os livros, com a ficha catalográfica, a capa e o PDF fonte",
  "a árvore de cada livro, com o corpo das seções e a lixeira",
  "as questões, com alternativas, gabarito, metadados e tags",
  "as figuras, com o nome que o LaTeX cita, e as âncoras com os recortes",
  "as avaliações, com as variantes sorteadas e o mapa de letras de cada uma",
  "os templates e o histórico de revisões",
];

/** O que fica de fora, e por quê — não dizer seria deixar a pessoa supor que vai. */
export const LBB_LEAVES =
  "Fica de fora só o que se refaz: os PDFs e as imagens de compilação, as varreduras do scan " +
  "e as conversas com o agente.";
