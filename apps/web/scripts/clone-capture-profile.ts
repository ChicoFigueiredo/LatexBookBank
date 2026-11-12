import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Deriva um perfil de captura novo do `book-fme-v1`, o perfil de referência (D78).
 *
 * O perfil é código (ADR 0007), e o jeito de começar um livro novo é copiar o que já lê bem um
 * livro parecido: o arquivo vem com as zonas, os ganchos de resposta, a tabela de contenção e os
 * comentários que dizem de onde veio cada regra. O que muda é o que o livro novo tiver de
 * diferente — e quem diz o que é diferente é `measure-capture.ts`, rodado contra o PDF dele.
 *
 *     bun run scripts/clone-capture-profile.ts book-xyz-v1 "Coleção XYZ"
 *
 * Grava `src/modules/scan/domain/profiles/<id>.ts` e registra o perfil em `profiles/index.ts`.
 * Recusa um id que já existe: perfil é versionado, e sobrescrever um apagaria o que as execuções
 * antigas usaram.
 */

const BASE_ID = "book-fme-v1";
const BASE_EXPORT = "bookFmeV1";

/** `book-xyz-v1` → `bookXyzV1`: o nome do export, como o do perfil de referência. */
export function exportNameOf(id: string): string {
  return id.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
}

/** O arquivo do perfil novo, a partir do de referência: outro id, outro nome, versão 1. */
export function cloneProfileSource(source: string, options: { readonly id: string; readonly label: string; readonly today: string }): string {
  const exportName = exportNameOf(options.id);
  const header = [
    "/*",
    `  Derivado de \`${BASE_ID}\` em ${options.today} (scripts/clone-capture-profile.ts).`,
    "",
    "  As regras e os comentários abaixo são os do Fundamentos de Matemática Elementar: cada uma diz",
    "  de que página do vol. 1 veio. Meça este livro com `scripts/measure-capture.ts` e ajuste o que",
    "  ele tiver de diferente — e apague o que não servir, em vez de deixar regra sem livro.",
    "*/",
    "",
  ].join("\n");

  const body = source
    .replace(`export const ${BASE_EXPORT}: CaptureProfile = {`, `export const ${exportName}: CaptureProfile = {`)
    .replace(`id: "${BASE_ID}",`, `id: "${options.id}",`)
    .replace(/^ {2}version: \d+,$/m, "  version: 1,")
    .replace(/^ {2}label: "[^"]*",$/m, `  label: ${JSON.stringify(options.label)},`);
  if (!body.includes(`id: "${options.id}",`) || !body.includes(`export const ${exportName}`)) {
    throw new Error(`O arquivo de ${BASE_ID} mudou de forma: não achei o id ou o export para trocar.`);
  }
  return header + body;
}

/** O registro em `profiles/index.ts`: o import e o `registerCaptureProfile`, ao lado dos outros. */
export function registerProfileSource(index: string, id: string): string {
  const exportName = exportNameOf(id);
  const lastImport = [...index.matchAll(/^import \{ \w+ \} from "\.\/[\w-]+";$/gm)].at(-1);
  const lastRegister = [...index.matchAll(/^registerCaptureProfile\(\w+\);$/gm)].at(-1);
  if (!lastImport || !lastRegister) throw new Error("profiles/index.ts mudou de forma: não achei onde registrar.");
  const withImport =
    index.slice(0, lastImport.index! + lastImport[0].length) +
    `\nimport { ${exportName} } from "./${id}";` +
    index.slice(lastImport.index! + lastImport[0].length);
  const at = withImport.indexOf(lastRegister[0]) + lastRegister[0].length;
  return `${withImport.slice(0, at)}\nregisterCaptureProfile(${exportName});${withImport.slice(at)}`;
}

function main(): void {
  const [id, label] = process.argv.slice(2);
  if (!id || !label || !/^[a-z][a-z0-9-]*-v\d+$/.test(id)) {
    console.error('Uso: bun run scripts/clone-capture-profile.ts <id-v1> "<rótulo do livro>"');
    console.error("  o id é kebab-case e termina na versão: book-xyz-v1");
    process.exitCode = 1;
    return;
  }

  const dir = path.join(import.meta.dirname, "../src/modules/scan/domain/profiles");
  const target = path.join(dir, `${id}.ts`);
  if (existsSync(target)) {
    console.error(`${target} já existe. Perfil é versionado: suba a versão no id (…-v2) em vez de sobrescrever.`);
    process.exitCode = 1;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(target, cloneProfileSource(readFileSync(path.join(dir, `${BASE_ID}.ts`), "utf8"), { id, label, today }));
  const indexPath = path.join(dir, "index.ts");
  writeFileSync(indexPath, registerProfileSource(readFileSync(indexPath, "utf8"), id));

  console.log(`Perfil ${id} criado em ${path.relative(process.cwd(), target)} e registrado.`);
  console.log("Próximo passo: medir o livro novo com ele —");
  console.log(`  bun run scan:measure <arquivo.pdf> ${id}`);
}

if (import.meta.main) main();
