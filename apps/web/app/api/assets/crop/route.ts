import { NextResponse } from "next/server";

import { saveCrop } from "@modules/assets/application/save-crop";
import { PrismaCropWriter } from "@modules/assets/infrastructure/prisma-asset-writer";
import { storage } from "@infrastructure/composition";

import { BadRequestError, toErrorResponse } from "../../http";

/**
 * Salva um recorte: cria a âncora e o `Asset(CROP)`, **sem tocar na fonte**.
 *
 * O recorte chega pronto do cliente. O visualizador já rasteriza a página com `pdf.js` para
 * mostrá-la, e recortar o que está na tela custa uma chamada de canvas — enquanto rasterizar de
 * novo no servidor custaria um processo por recorte, para produzir a mesma imagem que o usuário
 * está vendo.
 *
 * O que **não** vem do cliente é a coordenada em pixels: sobe a caixa normalizada (D28). A imagem
 * é conveniência; a âncora é o dado.
 *
 * O `SOURCE_PDF` nunca é substituído (D29): o crop é um asset **novo**, e a âncora aponta para os
 * dois. Voltar à origem continua possível porque a origem continua lá. A orquestração — dono,
 * caixa, arquivo e as três linhas numa transação — é do caso de uso `saveCrop`.
 *
 * Ver spec §18 · D28 · D29 · issue #123.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const form = await request.formData().catch(() => null);
    if (form === null) throw new BadRequestError("Envie como `multipart/form-data`.");

    const image = form.get("image");
    if (!(image instanceof File)) throw new BadRequestError("O campo `image` é obrigatório.");

    const saved = await saveCrop(
      { writer: new PrismaCropWriter(), storage: storage() },
      {
        sourceAssetId: requireText(form.get("sourceAssetId"), "sourceAssetId"),
        publicationId: requireText(form.get("publicationId"), "publicationId"),
        questionId: asOptionalText(form.get("questionId")),
        pageNumber: Number(form.get("pageNumber")),
        box: {
          x: Number(form.get("x")),
          y: Number(form.get("y")),
          width: Number(form.get("width")),
          height: Number(form.get("height")),
        },
        rotation: form.get("rotation") === null ? null : Number(form.get("rotation")),
        sourceText: asOptionalText(form.get("sourceText")),
        image: new Uint8Array(await image.arrayBuffer()),
      },
    );

    return NextResponse.json(saved, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

function requireText(value: FormDataEntryValue | null, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError(`O campo \`${field}\` é obrigatório.`);
  }
  return value;
}

const asOptionalText = (value: FormDataEntryValue | null): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.slice(0, 20_000) : null;
