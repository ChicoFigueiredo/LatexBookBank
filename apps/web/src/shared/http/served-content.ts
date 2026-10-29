/**
 * Os cabeçalhos de quem serve bytes do acervo na origem do app (#257, SEC-04).
 *
 * As duas rotas de conteúdo — asset e artefato de render — servem `inline`, com o tipo que a
 * extensão da chave diz. Para PNG, JPEG, WebP e PDF isso é o que a tela quer: a imagem no `<img>`,
 * o PDF no `<object>`. Para SVG é uma página: aberto numa aba, o `<script>` de dentro dele roda na
 * origem do app, com a API inteira ao alcance — e SVG entra pelo upload e pelo `.lbb`.
 *
 * Duas defesas, e as duas só em cabeçalho, sem mexer no arquivo:
 *
 * - **`nosniff` sempre**, para o navegador não tratar como página um arquivo que parece HTML;
 * - **CSP `sandbox`** para todo tipo fora da lista que a tela mostra direto. Sem `allow-scripts`, o
 *   documento não roda script e fica numa origem opaca. `<img>` não lê a CSP da resposta, então a
 *   figura continua aparecendo onde já aparecia.
 */

/** O que a tela mostra direto, e que não carrega script. */
const INERT_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);

/**
 * Para o que fica em sandbox: nada de fora, e só o que o próprio SVG traz embutido. O `dvisvgm`
 * do render embute as fontes como `data:`, e o estilo inline é o que dá cor ao traço.
 */
const SANDBOX_POLICY =
  "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";

export interface ServedContent {
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly filename: string;
}

export function servedContentHeaders(content: ServedContent): Record<string, string> {
  const inert = INERT_TYPES.has(content.mimeType.toLowerCase());

  return {
    "content-type": content.mimeType,
    "content-length": String(content.sizeBytes),
    // Imutável: a chave contém o hash, e conteúdo diferente é outro asset (D29). `private`,
    // porque o arquivo é de uma biblioteca e um proxy compartilhado não tem o que fazer com ele.
    "cache-control": "private, max-age=31536000, immutable",
    "content-disposition": `inline; filename="${encodeURIComponent(content.filename)}"`,
    "x-content-type-options": "nosniff",
    ...(inert ? {} : { "content-security-policy": SANDBOX_POLICY }),
  };
}
