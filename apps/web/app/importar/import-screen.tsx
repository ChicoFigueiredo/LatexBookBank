"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Banner, Button, Callout, Field, Icon, Select } from "@/design-system";
import {
  type ConflitoDeImportacao,
  fraseDoConflito,
  numero,
} from "@modules/portability/domain/import-conflicts";
import { formatarTamanho } from "@modules/publications/domain/book-overview";

import { useAcervoStyles } from "../acervo-styles";
import { useInfraStatus } from "../infra-status";
import { AppShell } from "../app-shell";

/**
 * Importar e exportar (protótipo, 1829–1888) — tela de sistema, no rail.
 *
 * O ensaio (`dryRun`) vem **antes** e é obrigatório: o import cria uma biblioteca nova e nunca
 * sobrescreve, mas ver o que vem dentro antes de gravar é a diferença entre importar o arquivo
 * certo e descobrir o engano depois.
 *
 * O que mudou nesta rodada não foi a tela: era o dado. `toRuntime` era chamado sem o índice do
 * destino, então a simulação respondia **zero conflitos em qualquer cenário** — e a tela dizia
 * isso. Agora que os conflitos existem de verdade, eles ganham o painel que o protótipo desenha:
 * nome do livro, quantas questões ele já tem aqui, quantas o arquivo traz, e a garantia de que
 * nada é sobrescrito sem escolha.
 */

interface Manifest {
  readonly workspaceName?: string;
  readonly counts?: Record<string, number>;
}

interface DryRunResult {
  readonly manifest: Manifest;
  readonly conflicts: readonly ConflitoDeImportacao[];
  readonly wouldCreate: Record<string, number>;
  readonly sizeBytes?: number;
}

/** As quatro células do protótipo, nesta ordem. `conflitos` é a única em warn. */
const CELULAS: readonly { readonly key: string; readonly label: string }[] = [
  { key: "publications", label: "publicações" },
  { key: "questions", label: "questões" },
  { key: "assets", label: "arquivos" },
];

export interface ImportScreenProps {
  /** As bibliotecas do acervo — a exportação é por biblioteca, e escolher exige a lista. */
  readonly libraries: readonly { readonly id: string; readonly name: string }[];
}

export function ImportScreen({ libraries }: ImportScreenProps) {
  useAcervoStyles();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<DryRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [alvo, setAlvo] = useState(libraries[0]?.id ?? "");

  const escolhida = libraries.find((library) => library.id === alvo) ?? libraries[0];
  const infra = useInfraStatus();

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
        router.refresh();
      }
    } catch {
      setError("Não deu para falar com o servidor.");
    } finally {
      setBusy(false);
    }
  };

  /** Abortar descarta a simulação, e não o arquivo escolhido: recomeçar é escolher de novo. */
  const abortar = () => {
    setPreview(null);
    setFile(null);
    if (input.current) input.current.value = "";
  };

  const conflitos = preview?.conflicts ?? [];

  return (
    <AppShell activeModule="importar" breadcrumb={[{ label: "Importar e exportar" }]}>
      <div className="lbb-acervo" style={{ maxWidth: "60rem" }}>
        <div className="lbb-greet">Sistema</div>
        <h1 className="lbb-greet-title">Importar e exportar</h1>

        {error && (
          <div style={{ marginTop: "var(--space-4)" }}>
            <Banner tone="danger" title="Importação recusada" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          </div>
        )}

        {done ? (
          <div style={{ marginTop: "var(--space-5)" }}>
            <Callout tone="ok" title="Importação concluída">
              A biblioteca foi criada. Ela aparece no Início e na lista de bibliotecas.
              <div style={{ marginTop: "var(--space-3)" }}>
                <Button variant="primary" size="sm" href="/bibliotecas">
                  Ver bibliotecas
                </Button>
              </div>
            </Callout>
          </div>
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

            {/* As duas origens do protótipo, lado a lado e cada uma dizendo o que faz. */}
            <div className="lbb-port-origins">
              <Origem
                icon="library"
                title="Absorver livro do Calibre"
                desc="Cria uma publicação nova a partir de um livro já catalogado."
                href="/bibliotecas"
              />
              <Origem
                icon="download-cloud"
                title="Importar acervo .lbb"
                desc="Traz bibliotecas, livros, questões e assets já estruturados."
                onClick={() => input.current?.click()}
              />
            </div>

            {preview && (
              <section className="lbb-dryrun">
                <header className="lbb-dryrun-head">
                  <Icon name="search" size={14} />
                  <strong>Simulação da importação (dry-run)</strong>
                  <span className="lbb-source-size">
                    {[file?.name, preview.sizeBytes ? formatarTamanho(preview.sizeBytes) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </header>

                <div className="lbb-dryrun-grid">
                  <Celula valor={1} rotulo="biblioteca" />
                  {CELULAS.map((celula) => (
                    <Celula
                      key={celula.key}
                      valor={preview.wouldCreate?.[celula.key] ?? 0}
                      rotulo={celula.label}
                    />
                  ))}
                  {/*
                    A quarta célula é a que decide, e é a única em warn. Zero conflitos também é
                    resposta — e agora é uma resposta verdadeira, o que não era o caso enquanto o
                    índice do destino não chegava ao `toRuntime`.
                  */}
                  <Celula valor={conflitos.length} rotulo="conflitos" tone="warn" />
                </div>

                {conflitos.map((conflito) => (
                  <div key={conflito.existingId} className="lbb-dryrun-conflict">
                    <Icon name="triangle-alert" size={14} />
                    <span style={{ flex: 1 }}>{fraseDoConflito(conflito)}</span>
                  </div>
                ))}

                <footer className="lbb-dryrun-foot">
                  <Button
                    variant="primary"
                    size="sm"
                    loading={busy}
                    onClick={() => file && void send(file, false)}
                  >
                    {/*
                      O rótulo diz a política, e não só a ação: o import **nunca** sobrescreve —
                      cria uma biblioteca nova ao lado. "Importar" sozinho deixaria a pessoa
                      supondo o contrário justamente quando há conflito na tela.
                    */}
                    {conflitos.length > 0 ? "Importar (mantendo os dois)" : "Importar biblioteca"}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={abortar}>
                    Abortar
                  </Button>
                </footer>
              </section>
            )}

            <div className="lbb-port-cards">
              <section className="lbb-source">
                <div className="lbb-acervo-eyebrow" style={{ marginBottom: 0 }}>
                  Exportar
                </div>
                <p className="lbb-book-sub" style={{ margin: "8px 0 12px" }}>
                  Uma biblioteca inteira num único <code>.lbb</code> — com assets e recortes de
                  origem.
                </p>

                {/*
                  Escolher e exportar, e não um botão por biblioteca.
                  
                  A primeira versão empilhava um botão para cada uma — com as 72 do banco real, o
                  cartão virou uma coluna de setenta e dois botões idênticos e o de backup ao lado
                  saiu da tela. Uma lista longa não é um menu de ações: é uma escolha, e escolha
                  tem controle próprio.
                */}
                {libraries.length === 0 ? (
                  <span className="lbb-source-size">Nenhuma biblioteca para exportar ainda.</span>
                ) : (
                  <>
                    <Field label="Biblioteca">
                      <Select
                        value={alvo}
                        onChange={(event) => setAlvo(event.target.value)}
                        aria-label="Biblioteca a exportar"
                      >
                        {libraries.map((library) => (
                          <option key={library.id} value={library.id}>
                            {library.name}
                          </option>
                        ))}
                      </Select>
                    </Field>

                    <div style={{ marginTop: "var(--space-3)" }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon="download-cloud"
                        // Download de arquivo, não navegação: a rota devolve `Content-Disposition`,
                        // e o roteador do Next não tem o que fazer com isso.
                        href={`/api/workspaces/export?workspaceId=${alvo}`}
                      >
                        Exportar “{escolhida?.name ?? "biblioteca"}”
                      </Button>
                    </div>
                  </>
                )}
              </section>

              <section className="lbb-source">
                <div className="lbb-acervo-eyebrow" style={{ marginBottom: 0 }}>
                  Backup
                </div>
                {/*
                  O estado real, e não uma frase fixa nem o desenho do protótipo.

                  O backup **roda fora do app** — um serviço externo escreve `backup-status.json`
                  no `BACKUP_DESTINATION`, e o `collectDiagnostics` já o lia; era o Diagnóstico o
                  único lugar que sabia. Sem destino configurado a tela diz isso e diz o caminho
                  que funciona hoje. Configurado, ela diz quando foi o último — que é a única
                  informação que importa na hora em que alguém procura backup.
                */}
                <p className="lbb-book-sub" style={{ margin: "8px 0 12px" }}>
                  {infra === null
                    ? "Lendo o estado do backup…"
                    : infra.backup.health === "unconfigured"
                      ? "Backup automático não configurado. O .lbb exportado é a cópia — guarde um por biblioteca, fora deste computador, e ele volta por esta mesma tela."
                      : infra.backup.summary}
                </p>
                <span className="lbb-source-size">
                  {infra === null
                    ? "backup · verificando"
                    : infra.backup.health === "ok"
                      ? "backup automático · em dia"
                      : infra.backup.health === "unconfigured"
                        ? "backup automático · não configurado"
                        : "backup automático · precisa de atenção"}
                </span>
              </section>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Celula({
  valor,
  rotulo,
  tone,
}: {
  readonly valor: number;
  readonly rotulo: string;
  readonly tone?: "warn";
}) {
  return (
    <div className="lbb-dryrun-cell">
      <div className="lbb-dryrun-n" data-tone={valor > 0 ? tone : undefined}>
        {numero(valor)}
      </div>
      <div className="lbb-dryrun-label">{rotulo}</div>
    </div>
  );
}

function Origem({
  icon,
  title,
  desc,
  href,
  onClick,
}: {
  readonly icon: "library" | "download-cloud";
  readonly title: string;
  readonly desc: string;
  readonly href?: string;
  readonly onClick?: () => void;
}) {
  const conteudo = (
    <>
      <Icon name={icon} size={18} />
      <span className="lbb-port-title">{title}</span>
      <span className="lbb-pick-desc">{desc}</span>
    </>
  );

  return href ? (
    <a className="lbb-port-origin" href={href}>
      {conteudo}
    </a>
  ) : (
    <button type="button" className="lbb-port-origin" onClick={onClick}>
      {conteudo}
    </button>
  );
}
