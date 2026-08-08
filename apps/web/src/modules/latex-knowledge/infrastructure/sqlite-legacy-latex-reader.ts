import { Database, constants } from "bun:sqlite";
import { pathToFileURL } from "node:url";

import type {
  LatexIconMenu,
  LatexSnippet,
  LatexSymbol,
  LatexSymbolGroup,
  LegacyLatexMetadataReader,
  LegacyReadResult,
} from "../domain/latex-knowledge";
import { hasPlaceholders, normalizeTrigger, toMonacoSnippet } from "../domain/monaco-snippet";

/**
 * Leitor do `LatexMetadata.db` legado.
 *
 * **Somente leitura não é convenção aqui — é o SQLite dizendo não.** Um `DELETE` disparado por
 * engano falha com "attempt to write a readonly database" em vez de mutilar o patrimônio.
 *
 * `SQLITE_OPEN_READONLY` sozinho não bastava, e isso só apareceu ao olhar a pasta do legado
 * depois de uma leitura: o banco está em modo WAL, e todo leitor de WAL cria `-shm` e `-wal` ao
 * lado do arquivo. Dados intactos, mas dois arquivos novos dentro do acervo — e, numa pasta
 * montada como somente-leitura, a abertura falharia. `immutable=1` resolve os dois de uma vez:
 * o SQLite passa a tratar o arquivo como imutável e **não toca em mais nada no disco**.
 *
 * Verificado contra o acervo real: a leitura funciona, a escrita é recusada, e a pasta fica
 * exatamente como estava.
 *
 * Este é o único arquivo do projeto que fala com o legado, e ele só é alcançado pelo script de
 * importação. O app nunca o importa.
 */

/**
 * `immutable=1` só é lido quando o SQLite aceita nome de arquivo em forma de URI — daí a flag
 * `SQLITE_OPEN_URI`. Sem ela, o caminho `file:...?immutable=1` é interpretado como nome literal
 * e a abertura falha com "unable to open database file".
 */
const READONLY_IMMUTABLE = constants.SQLITE_OPEN_READONLY | constants.SQLITE_OPEN_URI;

/** `pathToFileURL` e não concatenação: espaço e acento no caminho quebrariam a URI à mão. */
const immutableUri = (filePath: string): string => `${pathToFileURL(filePath).href}?immutable=1`;

/** Formato bruto das tabelas legadas — nomes em PascalCase, como o EF Core os criou. */
interface LegacyAutoCompleteRow {
  readonly idLatexAutoComplete: number;
  readonly Content: string | null;
  readonly Text: string | null;
  readonly AutoComplete: string | null;
  readonly PrimaryPriority: number;
  readonly Description: string | null;
}

interface LegacySymbolGroupRow {
  readonly IdSimbolGroup: number;
  readonly SimbolGroup: string;
  readonly Order: number;
}

interface LegacySymbolRow {
  readonly IdSimbol: number;
  readonly SimbolGroupId: number;
  readonly LatexCommand: string;
  readonly UnicodeSimbol: string | null;
  readonly Package: string | null;
  readonly MathMode: number;
  readonly PictureIndex: number;
  readonly SVGSimbolOriginal: string | null;
}

interface LegacyIconMenuRow {
  readonly idLatexIcon_Menu: number;
  readonly vNome: string | null;
  readonly vTemplateLatex: string | null;
  readonly vKeyShortcut: string | null;
  readonly iOrdem: number;
  readonly vGrupo: string | null;
  readonly vSubGrupo: string | null;
}

/** String vazia e string só de espaços viram `null`: no domínio, ausência é `null` e ponto. */
const blankToNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

export class SqliteLegacyLatexReader implements LegacyLatexMetadataReader {
  constructor(private readonly filePath: string) {}

  async read(): Promise<LegacyReadResult> {
    const db = new Database(immutableUri(this.filePath), READONLY_IMMUTABLE);

    try {
      const groupRows = db
        .query(`SELECT IdSimbolGroup, SimbolGroup, "Order" FROM LatexSimbolGroups`)
        .all() as LegacySymbolGroupRow[];

      // O grupo é identificado pelo nome no domínio; o mapa traduz a chave numérica do legado.
      const groupNameById = new Map(groupRows.map((row) => [row.IdSimbolGroup, row.SimbolGroup]));

      const symbolGroups: LatexSymbolGroup[] = groupRows.map((row, index) => ({
        name: row.SimbolGroup,
        // O legado gravou `Order` = 0 em todos os 13. Cair na ordem alfabética do SELECT é
        // melhor do que treze zeros: pelo menos a palette fica estável entre execuções.
        sortOrder: row.Order || index,
        legacyId: row.IdSimbolGroup,
      }));

      const symbolRows = db
        .query(
          `SELECT IdSimbol, SimbolGroupId, LatexCommand, UnicodeSimbol, Package, MathMode,
                  PictureIndex, SVGSimbolOriginal
             FROM LatexSimbols
            ORDER BY SimbolGroupId, PictureIndex, IdSimbol`,
        )
        .all() as LegacySymbolRow[];

      let skippedSymbols = 0;
      const symbols: LatexSymbol[] = symbolRows.flatMap((row) => {
        const groupName = groupNameById.get(row.SimbolGroupId);
        // Símbolo órfão de grupo não tem onde aparecer na palette. Descartar em silêncio seria
        // esconder um dado torto — por isso o descarte é contado e vai para o relatório.
        if (groupName === undefined) {
          skippedSymbols += 1;
          return [];
        }
        return [
          {
            groupName,
            command: row.LatexCommand,
            unicode: blankToNull(row.UnicodeSimbol),
            requiredPackage: blankToNull(row.Package),
            mathMode: row.MathMode !== 0,
            previewSvg: blankToNull(row.SVGSimbolOriginal),
            sortOrder: row.PictureIndex,
            legacyId: row.IdSimbol,
          },
        ];
      });

      const snippetRows = db
        .query(
          `SELECT idLatexAutoComplete, Content, Text, AutoComplete, PrimaryPriority, Description
             FROM LatexAutoCompletes
            ORDER BY idLatexAutoComplete`,
        )
        .all() as LegacyAutoCompleteRow[];

      let skippedSnippets = 0;
      const snippets: LatexSnippet[] = snippetRows.flatMap((row) => {
        const template = row.AutoComplete ?? row.Content ?? "";
        const trigger = normalizeTrigger(row.Text ?? "");
        if (trigger === "" || template.trim() === "") {
          skippedSnippets += 1;
          return [];
        }
        return [
          {
            trigger,
            // O rótulo é o `Content`: a forma legível, com os nomes dos argumentos à mostra.
            // O `AutoComplete` traria os `§` para dentro da lista de sugestões.
            label: (blankToNull(row.Content) ?? template).replace(/\r\n/g, " "),
            body: toMonacoSnippet(template),
            documentation: blankToNull(row.Description),
            priority: row.PrimaryPriority,
            hasPlaceholders: hasPlaceholders(template),
            legacyId: row.idLatexAutoComplete,
          },
        ];
      });

      const iconRows = db
        .query(
          `SELECT m.idLatexIcon_Menu, m.vNome, m.vTemplateLatex, m.vKeyShortcut, m.iOrdem,
                  g.vGrupo, s.vSubGrupo
             FROM LatexIconMenus m
             LEFT JOIN LatexIconMenu_SubGroups s
                    ON s.idLatexIconMenu_SubGroup = m.idLatexIconMenu_SubGroup
             LEFT JOIN LatexIconMenu_Groups g
                    ON g.idLatexIconMenu_Group = s.idLatexIconMenu_Group
            ORDER BY m.iOrdem, m.idLatexIcon_Menu`,
        )
        .all() as LegacyIconMenuRow[];

      // `vImagemBase64` fica de fora da consulta de propósito: binário não entra no banco
      // (auditoria §8). Quando a palette precisar do ícone, ele vira Asset no StorageProvider.
      let skippedIconMenus = 0;
      const iconMenus: LatexIconMenu[] = iconRows.flatMap((row) => {
        const template = blankToNull(row.vTemplateLatex);
        // `Asteristic` (id 8) é assim no legado: nome preenchido, template nulo. Um botão que
        // não insere nada não é botão — mas o relatório precisa dizer que ele existia.
        if (template === null) {
          skippedIconMenus += 1;
          return [];
        }
        return [
          {
            groupName: blankToNull(row.vGrupo) ?? "Geral",
            subGroupName: blankToNull(row.vSubGrupo) ?? "Geral",
            name: blankToNull(row.vNome) ?? template,
            // `\textbf{§und§}` também é template com ponto de parada — o botão do ribbon insere
            // um snippet, não texto morto. Mesma tradução dos autocompletes.
            template: toMonacoSnippet(template),
            shortcut: blankToNull(row.vKeyShortcut),
            sortOrder: row.iOrdem,
            legacyId: row.idLatexIcon_Menu,
          },
        ];
      });

      return {
        knowledge: { snippets, symbolGroups, symbols, iconMenus },
        sourceCounts: {
          snippets: snippetRows.length,
          symbolGroups: groupRows.length,
          symbols: symbolRows.length,
          iconMenus: iconRows.length,
        },
        skipped: {
          snippets: skippedSnippets,
          symbols: skippedSymbols,
          iconMenus: skippedIconMenus,
        },
      };
    } finally {
      db.close();
    }
  }
}
