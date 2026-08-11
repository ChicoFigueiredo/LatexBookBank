import { registerQuestionType } from "../question-type-plugin";

import { discursivePlugin } from "./discursive";
import { multipleChoicePlugin } from "./multiple-choice";
import { multipleCorrectPlugin } from "./multiple-correct";

/**
 * Registro explícito, sem descoberta por convenção.
 *
 * Ler este arquivo responde "quais tipos o produto sabe tratar hoje" sem rodar nada. Carregamento
 * dinâmico daria a mesma coisa com um passo a mais de indireção — e com a chance de um plugin
 * existir no disco sem estar registrado, que é o pior dos dois mundos.
 *
 * Os três são os tipos mínimos do Beta Editorial (§12 do prompt do time): escolha simples
 * (`MULTIPLE_CHOICE`, uma correta), múltipla escolha (`MULTIPLE_CORRECT`, uma ou mais) e
 * discursiva. Os outros quatro do vocabulário legado têm zero linhas no acervo e entram quando
 * houver questão real para exercitá-los.
 */
registerQuestionType(discursivePlugin);
registerQuestionType(multipleChoicePlugin);
registerQuestionType(multipleCorrectPlugin);

export { discursivePlugin, multipleChoicePlugin, multipleCorrectPlugin };
