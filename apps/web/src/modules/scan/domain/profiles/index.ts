import { registerCaptureProfile } from "../capture-profile";
import { bookV1 } from "./book-v1";
import { examEnemV1 } from "./exam-enem-v1";
import { examV1 } from "./exam-v1";

/**
 * Os perfis de captura que existem (D46). Registro explícito: acrescentar um perfil é escrever o
 * arquivo e acrescentar uma linha aqui — sem descoberta por pasta, sem reflexão.
 */
registerCaptureProfile(bookV1);
registerCaptureProfile(examV1);
registerCaptureProfile(examEnemV1);

export { captureProfile, registeredCaptureProfiles } from "../capture-profile";
