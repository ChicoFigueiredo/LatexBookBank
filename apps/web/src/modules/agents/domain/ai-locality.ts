/**
 * O recorte sai desta máquina, ou não?
 *
 * A pergunta aparece num momento específico e sensível: a tela de captura, quando alguém está
 * prestes a subir a página de um livro protegido para ser lida por um modelo. O protótipo responde
 * ali mesmo — *“O reconhecimento roda no seu computador. Nada é enviado para fora.”* — e o app não
 * dizia nada.
 *
 * **A verdade está no host, e não no rótulo do provider.** “Ollama local” é o nome de um perfil de
 * configuração, não uma garantia: nada impede apontar `AI_BASE_URL` para um Ollama noutra máquina,
 * e nesse caso o recorte sai. O contrário também vale — um “Endpoint compatível” em `localhost` é
 * tão local quanto o Ollama. Perguntar ao perfil daria a resposta errada nos dois casos.
 */

/** Os hosts que são, por definição, esta máquina. */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

export type LocalidadeDaIa = "local" | "remota" | "sem-ia";

export function localidadeDaIa(baseUrl: string | null | undefined): LocalidadeDaIa {
  if (!baseUrl) return "sem-ia";

  try {
    const { hostname } = new URL(baseUrl);
    // `hostname` já vem sem colchetes para IPv6 no Node, e com eles em alguns runtimes — os dois
    // formatos estão na lista, porque errar para "remota" assustaria sem motivo e errar para
    // "local" seria a mentira que este módulo existe para evitar.
    return LOOPBACK.has(hostname.toLowerCase()) ? "local" : "remota";
  } catch {
    // URL que não parseia: não dá para afirmar que é local, e **não afirmar** é a resposta segura.
    // Entre calar sobre uma garantia e prometer uma que não se pode conferir, cala-se.
    return "remota";
  }
}

/**
 * A frase que a tela de captura mostra.
 *
 * A de “remota” nomeia o provider de propósito: “sai do seu computador” sem dizer para onde é um
 * aviso que não dá para agir sobre. E ela **não** é um alerta em vermelho — mandar o recorte para
 * um serviço é uma escolha legítima de configuração, e pintar de perigo o que o próprio dono
 * configurou seria alarme falso. É informação, e informação no momento certo.
 */
export function fraseDaLocalidade(
  localidade: LocalidadeDaIa,
  providerLabel: string | null,
): string {
  switch (localidade) {
    case "local":
      return "O reconhecimento roda no seu computador. Nada é enviado para fora.";
    case "remota":
      return providerLabel
        ? `O reconhecimento é feito por ${providerLabel} — o recorte sai do seu computador.`
        : "O reconhecimento é feito por um serviço externo — o recorte sai do seu computador.";
    default:
      return "Nenhum modelo de visão configurado — dá para recortar e transcrever à mão.";
  }
}
