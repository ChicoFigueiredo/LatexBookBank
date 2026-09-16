import { NextResponse } from "next/server";

import { registeredCaptureProfiles } from "@modules/scan/domain/profiles";

/** Os perfis de captura registrados (D46) — para a tela escolher, sem editar. */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    profiles: registeredCaptureProfiles().map((profile) => ({
      id: profile.id,
      version: profile.version,
      label: profile.label,
      documentKind: profile.documentKind,
      description: profile.description,
      kinds: profile.kinds,
      defaultQuestionType: profile.settings.defaultQuestionType,
    })),
  });
}
