import { registerQuestionType } from "../question-type-plugin";

import { discursivePlugin } from "./discursive";
import { multipleChoicePlugin } from "./multiple-choice";

/**
 * Registro explícito, sem descoberta por convenção.
 *
 * Ler este arquivo responde "quais tipos o produto sabe tratar hoje" sem rodar nada. Carregamento
 * dinâmico daria a mesma coisa com um passo a mais de indireção — e com a chance de um plugin
 * existir no disco sem estar registrado, que é o pior dos dois mundos.
 */
registerQuestionType(discursivePlugin);
registerQuestionType(multipleChoicePlugin);

export { discursivePlugin, multipleChoicePlugin };
