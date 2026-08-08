import type { RenderAsset, RenderBundle } from "./render-bundle.ts";

/**
 * O renderer não confia no que recebe.
 *
 * Mesmo com segredo compartilhado e sem rede de saída, o conteúdo do bundle vem, no fim da linha,
 * de LaTeX que alguém escreveu ou importou de um acervo de vinte anos. A validação acontece
 * **antes de qualquer byte tocar o disco**, e é o que garante que a única coisa que o worker
 * escreve fica dentro do diretório temporário do job.
 *
 * Vive no contrato, e não dentro do worker, por um motivo: assim a aplicação valida antes de
 * enviar e o worker valida ao receber, com o mesmo código. Duas checagens escritas separadamente
 * divergem — e divergem justamente no caso esquisito, que é o que interessa.
 */

export class InvalidBundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBundleError";
  }
}

/** Um nome de arquivo simples: sem diretório, sem `..`, sem caractere de controle. */
const SAFE_ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const SHA256 = /^[a-f0-9]{64}$/;

/** 64 MB por asset. Figura de questão não chega perto; o teto existe para o caso patológico. */
export const MAX_ASSET_BYTES = 64 * 1024 * 1024;

/** 2 MB de LaTeX é uma apostila inteira. Acima disso, alguma coisa está errada na chamada. */
export const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

export const MAX_ASSETS = 200;

/** Acima disso o job deixa de ser interativo e vira fila; o limite é do contrato, não do worker. */
export const MAX_TIMEOUT_MS = 120_000;

/**
 * Nome de asset seguro.
 *
 * A regra é uma lista do que **pode**, não do que não pode. Tentativas conhecidas — `../x`,
 * `/etc/passwd`, `C:\x`, `a/b` — falham por não casarem, e as desconhecidas também. Uma lista de
 * proibidos só bloqueia o que alguém já pensou; foi assim que zip slip sobreviveu uma década.
 */
export function isSafeAssetName(name: string): boolean {
  return SAFE_ASSET_NAME.test(name);
}

function validateAsset(asset: RenderAsset, index: number): void {
  const where = `assets[${index}]`;

  if (!isSafeAssetName(asset.name)) {
    throw new InvalidBundleError(
      `${where}: \`${asset.name}\` não é um nome de arquivo simples. ` +
        "Diretório, `..` e caminho absoluto são recusados — o asset é gravado no diretório do job.",
    );
  }
  if (!Number.isInteger(asset.sizeBytes) || asset.sizeBytes < 0) {
    throw new InvalidBundleError(`${where}: \`sizeBytes\` precisa ser inteiro não negativo.`);
  }
  if (asset.sizeBytes > MAX_ASSET_BYTES) {
    throw new InvalidBundleError(`${where}: passa de ${MAX_ASSET_BYTES} bytes.`);
  }
  if (!SHA256.test(asset.sha256)) {
    throw new InvalidBundleError(`${where}: \`sha256\` precisa ser hexadecimal minúsculo de 64.`);
  }
  if (asset.mimeType.trim() === "") {
    throw new InvalidBundleError(`${where}: \`mimeType\` é obrigatório.`);
  }
}

/**
 * Valida o manifesto. Lança na primeira coisa errada.
 *
 * Lançar em vez de acumular é escolha: um bundle inválido não é para ser corrigido pelo humano
 * campo a campo — ele veio de código, e o primeiro erro já diz qual código consertar.
 */
export function validateRenderBundle(bundle: RenderBundle): void {
  if (bundle.jobId.trim() === "") {
    throw new InvalidBundleError("`jobId` é obrigatório.");
  }
  if (bundle.sourceLatex.trim() === "") {
    throw new InvalidBundleError("`sourceLatex` está vazio — não há o que compilar.");
  }
  if (bundle.sourceLatex.length > MAX_SOURCE_BYTES) {
    throw new InvalidBundleError(`\`sourceLatex\` passa de ${MAX_SOURCE_BYTES} caracteres.`);
  }
  if (bundle.assets.length > MAX_ASSETS) {
    throw new InvalidBundleError(`Mais de ${MAX_ASSETS} assets num job só.`);
  }

  const seen = new Set<string>();
  bundle.assets.forEach((asset, index) => {
    validateAsset(asset, index);
    if (seen.has(asset.name)) {
      // Dois assets de mesmo nome: o segundo sobrescreveria o primeiro no disco, e a compilação
      // usaria um arquivo que ninguém pediu. Silenciosamente.
      throw new InvalidBundleError(`assets[${index}]: \`${asset.name}\` está repetido.`);
    }
    seen.add(asset.name);
  });

  const { dpi, timeoutMs, passes } = bundle.options;
  if (!Number.isInteger(dpi) || dpi < 36 || dpi > 1200) {
    throw new InvalidBundleError("`dpi` precisa ser inteiro entre 36 e 1200.");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new InvalidBundleError(`\`timeoutMs\` precisa estar entre 1000 e ${MAX_TIMEOUT_MS}.`);
  }
  if (passes !== 1 && passes !== 2 && passes !== 3) {
    throw new InvalidBundleError("`passes` precisa ser 1, 2 ou 3.");
  }

  if (bundle.profile.engine !== "pdflatex") {
    throw new InvalidBundleError("`engine` só aceita `pdflatex` hoje.");
  }
  if (bundle.profile.documentClass.trim() === "") {
    throw new InvalidBundleError("`documentClass` é obrigatório.");
  }
}

/**
 * `\write18` no fonte.
 *
 * A defesa de verdade é o `pdflatex` rodar sem `-shell-escape`, e é lá que ela vive. Isto aqui é a
 * segunda camada, e existe porque a primeira é uma flag: basta alguém acrescentar um argumento
 * "para testar" e ela some sem deixar rastro. Um bundle que **pede** execução de shell é sinal de
 * que algo está muito errado, e recusar é mais barato que investigar depois.
 */
export function requestsShellEscape(sourceLatex: string): boolean {
  return /\\(write18|immediate\s*\\write18|ShellEscape)/.test(sourceLatex);
}
