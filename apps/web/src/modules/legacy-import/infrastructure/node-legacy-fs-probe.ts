import { access, readdir, readFile } from "node:fs/promises";

import type { LegacyFsProbe } from "../domain/legacy-config";
import type { LegacyFileReader } from "../domain/legacy-figures";

/** Único lado do probe que não precisa de `bun:sqlite` — roda em Node, então roda sob teste real. */
export class NodeLegacyFsProbe implements LegacyFsProbe, LegacyFileReader {
  async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async readFile(filePath: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(filePath));
  }

  async listTopLevelDirectories(root: string): Promise<readonly string[]> {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  }
}
