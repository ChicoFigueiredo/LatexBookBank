import { access, readdir } from "node:fs/promises";

import type { LegacyFsProbe } from "../domain/legacy-config";

/** Único lado do probe que não precisa de `bun:sqlite` — roda em Node, então roda sob teste real. */
export class NodeLegacyFsProbe implements LegacyFsProbe {
  async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async listTopLevelDirectories(root: string): Promise<readonly string[]> {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  }
}
