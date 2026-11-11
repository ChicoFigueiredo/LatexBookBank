import { appendNodeRevision } from "../src/modules/document-tree/infrastructure/prisma-node-body.ts";
import { BODY_FROM_SCAN } from "../src/modules/document-tree/domain/node-body.ts";
import { prisma } from "../src/infrastructure/database/sqlite/client.ts";
import { storage, visionRecognizer } from "../src/infrastructure/composition.ts";
import { recognizeItem } from "../src/modules/scan/application/math-recognition.ts";
import { buildLines } from "../src/modules/scan/domain/page.ts";
import { captureProfile } from "../src/modules/scan/domain/profiles/index.ts";
import { buildProposal } from "../src/modules/scan/domain/structure.ts";
import {
  alreadyRepaired,
  repairTheoryNode,
  theoryRepairTargets,
  type TheoryRepair,
} from "../src/modules/scan/domain/theory-item-repair.ts";
import type { ProposedRegion } from "../src/modules/scan/domain/proposal.ts";
import type { MathResult } from "../src/modules/scan/domain/scan-item.ts";
import { PdfjsDocumentReader } from "../src/modules/scan/infrastructure/pdfjs-document-reader.ts";
import { PrismaScanStore } from "../src/modules/scan/infrastructure/prisma-scan-store.ts";
import { asStorageKey } from "../src/shared/ports/index.ts";

/**
 * Conserta no lugar os itens de teoria que uma aprovação anterior ao `scan-engine@3` levou ao
 * acervo (D76): a subseção sem título ganha a primeira frase por título e o parágrafo inteiro no
 * começo do corpo, com o negrito; o título com nome que perdeu o símbolo é refeito do
 * reconhecimento.
 *
 * Relê as páginas que a execução guardou, monta a proposta com o motor de hoje e reconhece só o
 * trecho de cada nó afetado. Pula — e diz por quê — o nó que alguém editou depois da aprovação.
 * Idempotente: rodar de novo encontra o corpo já consertado e não muda nada.
 *
 *     bun --conditions=react-server run scripts/repair-theory-items.ts <publicationId>              # dry-run
 *     CONFIRM=yes bun --conditions=react-server run scripts/repair-theory-items.ts <publicationId>  # grava
 *
 * `--conditions=react-server` porque o banco, o storage e o modelo moram atrás de `server-only`.
 * Rode com o dev server parado: o `DATABASE_URL` vem do `.env.local`.
 */

async function main(): Promise<void> {
  const publicationId = process.argv[2];
  if (!publicationId) throw new Error("Uso: repair-theory-items.ts <publicationId>");
  const confirmed = process.env["CONFIRM"] === "yes";

  const vision = visionRecognizer();
  if (vision === null) throw new Error("Sem modelo de visão configurado: o título e o corpo saem do reconhecimento (D76).");

  const store = new PrismaScanStore();
  const runs = (await store.listRuns(publicationId)).filter((run) => run.state === "APPROVED");
  if (runs.length === 0) throw new Error("Nenhuma execução de scan aprovada neste livro.");

  const outcomes: { readonly runId: string; readonly label: string; readonly reason: string; readonly repair: TheoryRepair; readonly before: { title: string | null; bodyLatex: string } }[] = [];

  for (const run of runs) {
    const profile = captureProfile(run.profileId);
    if (!profile) {
      console.warn(`Execução ${run.id}: o perfil ${run.profileId} saiu do registro — pulada.`);
      continue;
    }
    const pages = (await store.loadPages(run.id, run.pageFrom, run.pageTo)).map(buildLines);
    const proposal = buildProposal(pages, profile);
    const targets = theoryRepairTargets(await store.listItems(run.id), proposal.items);
    console.log(`Execução ${run.id} (${run.profileId}, p. ${run.pageFrom}–${run.pageTo}): ${targets.length} nós a consertar.`);
    if (targets.length === 0) continue;

    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: run.sourceAssetId }, select: { storageKey: true } });
    const { content } = await storage().get(asStorageKey(asset.storageKey));
    const pdf = await new PdfjsDocumentReader().open(content);
    try {
      for (const [index, target] of targets.entries()) {
        const node = await prisma.documentNode.findUnique({
          where: { id: target.nodeId },
          select: { id: true, title: true, bodyLatex: true, deletedAt: true },
        });
        const label = `${target.heading.originalLabel ?? "?"} (p. ${target.heading.pageNumber})`;
        if (!node || node.deletedAt !== null) {
          outcomes.push({ runId: run.id, label, reason: target.reason, repair: { nodeId: target.nodeId, skipped: "o nó está na lixeira" }, before: { title: null, bodyLatex: "" } });
          continue;
        }

        const recognize = (regions: readonly ProposedRegion[]): Promise<MathResult> =>
          recognizeItem(vision.recognizer, pdf, { regions });
        if (alreadyRepaired(target, node)) {
          outcomes.push({ runId: run.id, label, reason: target.reason, repair: { nodeId: node.id, skipped: "já consertado" }, before: node });
          continue;
        }
        process.stdout.write(`  [${index + 1}/${targets.length}] ${label}… `);
        let repair: TheoryRepair;
        try {
          const recognized = {
            lead: target.reason === "untitled" && target.lead?.needsMath ? await recognize(target.lead.regions) : null,
            heading: target.reason === "symbol" ? await recognize(target.heading.regions) : null,
          };
          repair = repairTheoryNode(target, node, recognized);
        } catch (error) {
          // Como na varredura: um trecho que o modelo não leu não para o lote — rodar de novo o pega.
          repair = { nodeId: node.id, skipped: `o modelo não leu: ${error instanceof Error ? error.message : String(error)}` };
        }
        console.log("skipped" in repair ? `pulado: ${repair.skipped}` : `→ ${repair.title ?? "(sem título)"}`);
        outcomes.push({ runId: run.id, label, reason: target.reason, repair, before: { title: node.title, bodyLatex: node.bodyLatex } });
      }
    } finally {
      await pdf.close();
    }
  }

  const repairs = outcomes.filter((outcome) => !("skipped" in outcome.repair));
  const changed = repairs.filter(
    (outcome) =>
      "bodyLatex" in outcome.repair &&
      (outcome.repair.title !== outcome.before.title || outcome.repair.bodyLatex !== outcome.before.bodyLatex),
  );
  const done = outcomes.filter((outcome) => "skipped" in outcome.repair && outcome.repair.skipped === "já consertado").length;
  console.log(`\n${changed.length} nós mudam, ${done} já estavam consertados, ${outcomes.length - repairs.length - done} pulados.`);

  if (!confirmed) {
    for (const outcome of changed.slice(0, 5)) {
      if (!("bodyLatex" in outcome.repair)) continue;
      console.log(`\n— ${outcome.label} · ${outcome.reason}`);
      console.log(`  título: ${JSON.stringify(outcome.before.title)} → ${JSON.stringify(outcome.repair.title)}`);
      console.log(`  corpo:  ${outcome.repair.bodyLatex.slice(0, 160).replace(/\n/g, " / ")}…`);
    }
    console.log("\nNada gravado. CONFIRM=yes para gravar.");
    return;
  }

  for (const outcome of changed) {
    const repair = outcome.repair;
    if (!("bodyLatex" in repair)) continue;
    await prisma.$transaction(async (tx) => {
      // O resumo é o da aprovação: o corpo veio do scan e continua *a revisar* (isBodyToReview).
      await appendNodeRevision(tx, { nodeId: repair.nodeId, origin: "SYSTEM", summary: BODY_FROM_SCAN, snapshot: outcome.before });
      await tx.documentNode.update({ where: { id: repair.nodeId }, data: { title: repair.title, bodyLatex: repair.bodyLatex } });
    });
    if (repair.leadUpdate) await store.saveItemChanges(outcome.runId, { upserts: [repair.leadUpdate], deletedIds: [] });
  }
  console.log(`${changed.length} nós gravados, cada um com uma revisão "${BODY_FROM_SCAN}".`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
