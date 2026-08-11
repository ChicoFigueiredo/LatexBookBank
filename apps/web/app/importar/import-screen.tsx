"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Badge, Banner, Button, Callout, PageHeader } from "@/design-system";

import { AppShell } from "../app-shell";

/**
 * Restaurar um acervo de um arquivo `.lbb`.
 *
 * O ensaio (`dryRun`) vem **antes** e é obrigatório na tela: o import cria uma biblioteca nova e
 * nunca sobrescreve, mas ver quantos livros e questões vêm dentro antes de gravar é a diferença
 * entre importar o arquivo certo e descobrir o engano depois.
 */

interface Manifest {
  readonly workspaceName?: string;
  readonly counts?: Record<string, number>;
}

interface DryRunResult {
  readonly manifest: Manifest;
  readonly collisions: readonly string[];
  readonly wouldCreate: Record<string, number>;
}

const COUNT_LABELS: Readonly<Record<string, string>> = {
  publications: "livros",
  nodes: "nós",
  questions: "questões",
  options: "alternativas",
  assets: "arquivos",
  tags: "tags",
};

export function ImportScreen() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<DryRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const send = async (chosen: File, dryRun: boolean) => {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/workspaces/import${dryRun ? "?dryRun=1" : ""}`, {
        method: "POST",
        headers: { "content-type": "application/zip" },
        body: chosen,
      });
      const payload = (await response.json()) as DryRunResult & { message?: string };

      if (!response.ok) {
        setError(payload.message ?? "Não deu para ler o arquivo.");
        setPreview(null);
        return;
      }

      if (dryRun) setPreview(payload);
      else {
        setDone(true);
        // A Home é a tela que lista bibliotecas: sem o refresh, a nova não apareceria lá.
        router.refresh();
      }
    } catch {
      setError("Não deu para falar com o servidor.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell activeModule="bibliotecas" breadcrumb={[{ label: "Bibliotecas", href: "/bibliotecas" }, { label: "Importar" }]}>
      <div style={{ padding: "var(--space-6) var(--space-7)", maxWidth: "48rem" }}>
        <PageHeader
          eyebrow="PORTABILIDADE"
          title="Importar biblioteca"
          meta="Um arquivo .lbb traz livros, árvore, questões, alternativas e os arquivos de origem."
        />

        {error && (
          <Banner tone="danger" title="Importação recusada" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}

        {done ? (
          <Callout tone="ok" title="Importação concluída">
            A biblioteca foi criada. Ela aparece no Início e na lista de bibliotecas.
            <div style={{ marginTop: "var(--space-3)" }}>
              <Button variant="primary" size="sm" href="/bibliotecas">
                Ver bibliotecas
              </Button>
            </div>
          </Callout>
        ) : (
          <>
            <input
              ref={input}
              type="file"
              accept=".lbb,application/zip"
              style={{ display: "none" }}
              onChange={(event) => {
                const chosen = event.target.files?.[0] ?? null;
                setFile(chosen);
                setPreview(null);
                if (chosen) void send(chosen, true);
              }}
            />

            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
              <Button variant="secondary" icon="download-cloud" onClick={() => input.current?.click()}>
                Escolher arquivo .lbb
              </Button>
              {file && <span style={{ color: "var(--text-secondary)" }}>{file.name}</span>}
            </div>

            {preview && (
              <div style={{ marginTop: "var(--space-5)" }}>
                <Callout
                  tone="info"
                  title={`“${preview.manifest.workspaceName ?? "Biblioteca"}” — o que vem dentro`}
                >
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    {Object.entries(preview.wouldCreate ?? {}).map(([key, value]) => (
                      <Badge key={key} tone="neutral" mono>
                        {value} {COUNT_LABELS[key] ?? key}
                      </Badge>
                    ))}
                  </div>

                  {preview.collisions.length > 0 && (
                    <p style={{ marginBottom: 0 }}>
                      {preview.collisions.length} item(ns) já existem no acervo. Nada é
                      sobrescrito: a importação cria uma biblioteca nova.
                    </p>
                  )}
                </Callout>

                <div style={{ marginTop: "var(--space-4)" }}>
                  <Button
                    variant="primary"
                    loading={busy}
                    onClick={() => file && void send(file, false)}
                  >
                    Importar biblioteca
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
