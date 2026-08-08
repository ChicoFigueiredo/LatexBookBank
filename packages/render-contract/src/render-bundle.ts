/**
 * `RenderBundle` — tudo que o renderer recebe, e nada além.
 *
 * D35 é o ajuste que resolve a contradição do egress: o worker precisa dos assets para compilar,
 * mas **não pode ter credencial de storage**. A saída não foi dar acesso e confiar; foi mudar o
 * contrato. O renderer não busca nada — recebe um pacote fechado, compila, devolve.
 *
 * A consequência prática é o que este arquivo **não** menciona: não há `workspaceId`, não há
 * `storageKey`, não há URL de bucket, não há id de publicação nem de questão. Um `jobId` opaco e
 * bytes. Se algum dia alguém precisar de mais que isso do lado do worker, é sinal de que a
 * responsabilidade foi para o lado errado.
 *
 * ## Transporte
 *
 * O bundle viaja como **`multipart/form-data`**: uma parte `bundle` com este JSON, e uma parte por
 * asset com os bytes crus, nomeada pelo `name` do asset.
 *
 * Foi escolhido contra as duas alternativas óbvias:
 *
 * - **JSON com base64** seria mais simples e é o que a maioria faria. Custa 33% a mais de bytes
 *   num payload que já é imagem, força o worker a materializar o arquivo inteiro em memória antes
 *   de decodificar, e enche o log de requisição com megabytes ilegíveis.
 * - **tar/zip** resolve o tamanho, mas troca um formato que todo servidor HTTP já sabe ler por um
 *   que exige biblioteca dos dois lados — e adiciona descompactação, que é superfície de ataque
 *   com entrada de terceiro (zip slip não é hipótese, é CVE recorrente).
 *
 * Multipart não infla, é streamável, e o JSON continua legível sozinho.
 */

/**
 * Um arquivo que a compilação precisa.
 *
 * Só metadado: os bytes viajam na parte multipart de mesmo nome. Separar os dois é o que permite
 * validar o manifesto antes de tocar em um único byte.
 */
export interface RenderAsset {
  /**
   * Nome pelo qual o LaTeX referencia o arquivo — o que aparece em `\includegraphics{...}`.
   *
   * **Nunca um caminho.** Barra, `..` e nome absoluto são recusados na validação: o worker grava
   * cada asset no diretório temporário do job, e um nome que escapa desse diretório é o caminho
   * mais curto para escrever fora dele.
   */
  readonly name: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  /** Conferido contra os bytes recebidos: manifesto que não bate com o conteúdo é erro, não aviso. */
  readonly sha256: string;
}

/**
 * O perfil de compilação, **resolvido**.
 *
 * Vem com preâmbulo e classe já dentro, não com um nome para o worker procurar. Procurar exigiria
 * que o worker tivesse um catálogo — quer dizer, estado — e estado no worker é o que faz duas
 * réplicas produzirem PDFs diferentes para a mesma entrada.
 */
export interface RenderProfile {
  /** Identificador só para diagnóstico e cache; o worker não o usa para buscar nada. */
  readonly id: string;
  readonly documentClass: string;
  readonly documentClassOptions: readonly string[];
  /** Linhas do preâmbulo, na ordem. Já inclui `\usepackage` e macros. */
  readonly preamble: readonly string[];
  /** `pdflatex` é o único hoje; o campo existe para o dia em que não for. */
  readonly engine: "pdflatex";
}

export interface RenderOptions {
  /** Resolução do PNG derivado. */
  readonly dpi: number;
  /** Teto de tempo do job inteiro, em milissegundos. */
  readonly timeoutMs: number;
  /**
   * Quantas passadas do `pdflatex`.
   *
   * Referência cruzada e sumário precisam de duas; enunciado de questão quase nunca. O padrão é
   * uma, e quem precisa de mais pede — o contrário faria toda compilação pagar pelo caso raro.
   */
  readonly passes: 1 | 2 | 3;
}

export interface RenderBundle {
  /**
   * Identidade do job, opaca para o worker.
   *
   * Opaca de propósito: se fosse o id da questão, o worker passaria a saber o que está compilando,
   * e "o worker não conhece o domínio" viraria uma frase em vez de uma propriedade.
   */
  readonly jobId: string;
  /** O documento completo, do `\documentclass` ao `\end{document}`. */
  readonly sourceLatex: string;
  readonly profile: RenderProfile;
  readonly assets: readonly RenderAsset[];
  readonly options: RenderOptions;
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  dpi: 150,
  timeoutMs: 30_000,
  passes: 1,
};
