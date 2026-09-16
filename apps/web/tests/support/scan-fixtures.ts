import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildLines, type PageModel } from "@modules/scan/domain/page";
import { PdfjsDocumentReader } from "@modules/scan/infrastructure/pdfjs-document-reader";

/** Os PDFs sintéticos da D48 (`tests/fixtures/scan/`), lidos uma vez por arquivo de teste. */
export function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../fixtures/scan/${name}`, import.meta.url))),
  );
}

const cache = new Map<string, Promise<PageModel[]>>();

export function fixturePages(name: string): Promise<PageModel[]> {
  let pages = cache.get(name);
  if (!pages) {
    pages = (async () => {
      const pdf = await new PdfjsDocumentReader().open(fixtureBytes(name));
      try {
        const result: PageModel[] = [];
        for (let page = 1; page <= pdf.pageCount; page++) {
          result.push(buildLines(await pdf.readPage(page)));
        }
        return result;
      } finally {
        await pdf.close();
      }
    })();
    cache.set(name, pages);
  }
  return pages;
}
