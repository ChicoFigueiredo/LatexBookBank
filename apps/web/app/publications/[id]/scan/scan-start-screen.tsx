"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge, Banner, Button, Callout, Checkbox, EmptyState, Field, Input, PageHeader, Select, injectCss } from "@/design-system";
import { scanApi, type ProfileSuggestionView, type ScanRunView } from "@modules/scan/ui/scan-client";

import { AppShell } from "../../../app-shell";

/**
 * Pedir um scan e escolher a execução a revisar (D45, D49).
 *
 * O botão responde assim que a execução está gravada, e leva à tela de revisão, que acompanha o
 * laço. Pedir de novo a mesma coisa reabre a mesma execução — é o servidor quem diz.
 */

const CSS = `
.lbb-scan-start{display:grid;grid-template-columns:minmax(320px,420px) 1fr;gap:var(--space-6);padding:var(--space-6);align-items:start}
.lbb-scan-start-form{display:flex;flex-direction:column;gap:var(--space-3);padding:var(--space-4);border:1px solid var(--border-subtle);border-radius:var(--radius-md);background:var(--surface)}
.lbb-scan-start-row{display:flex;gap:var(--space-3)}
.lbb-scan-runs{display:flex;flex-direction:column;gap:var(--space-2)}
.lbb-scan-run{display:flex;gap:var(--space-3);align-items:center;padding:var(--space-3);border:1px solid var(--border-subtle);border-radius:var(--radius-md);background:var(--surface);text-decoration:none;color:inherit}
.lbb-scan-run:hover{border-color:var(--accent-border)}
.lbb-scan-run small{color:var(--text-muted)}
@media (max-width: 900px){.lbb-scan-start{grid-template-columns:1fr}}
`;

export interface ScanStartScreenProps {
  readonly publicationId: string;
  readonly title: string;
  readonly library?: { readonly name: string; readonly slug: string };
  readonly source: { readonly filename: string } | null;
  readonly profiles: readonly {
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly version: number;
    readonly documentKind: "BOOK" | "EXAM";
    readonly kinds: readonly string[];
  }[];
  readonly suggestedProfile: string;
  /** O perfil que o livro lembrava e não existe mais, se for o caso (ADR 0008). */
  readonly rememberedMissing?: string | null;
  /** O livro já foi varrido antes? Sem lembrança, um palpite confiante vale mais que `book-v1`. */
  readonly hasMemory?: boolean;
  readonly runs: readonly ScanRunView[];
  readonly aiConfigured: boolean;
  readonly visionConfigured: boolean;
  readonly aviso: string;
  /** Acabou de apagar uma importação: a tela diz onde o que foi apagado está (D57). */
  readonly importRemoved?: boolean;
}

/** Acima disto o palpite se aplica sozinho num livro sem lembrança: o perfil se reconheceu. */
const CONFIDENT = 0.35;
/** Abaixo disto não se diz nada: palpite fraco atrapalha mais do que o silêncio. */
const WORTH_OFFERING = 0.2;

const STATE_TONE: Record<string, "info" | "ok" | "danger" | "neutral" | "accent"> = {
  READY_FOR_REVIEW: "accent",
  APPROVED: "ok",
  FAILED: "danger",
  CANCELLED: "neutral",
};

export function ScanStartScreen({
  publicationId,
  title,
  library,
  source,
  profiles,
  suggestedProfile,
  rememberedMissing = null,
  hasMemory = false,
  runs,
  aiConfigured,
  visionConfigured,
  aviso,
  importRemoved = false,
}: ScanStartScreenProps) {
  injectCss("lbb-scan-start", CSS);
  const router = useRouter();
  const [profileId, setProfileId] = useState(
    profiles.some((p) => p.id === suggestedProfile) ? suggestedProfile : (profiles[0]?.id ?? ""),
  );
  const [pageFrom, setPageFrom] = useState("1");
  const [pageTo, setPageTo] = useState("");
  const [useAi, setUseAi] = useState(false);
  const [math, setMath] = useState<"never" | "auto" | "always">(visionConfigured ? "auto" : "never");
  const [forceNew, setForceNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profile = profiles.find((p) => p.id === profileId);

  /*
    O palpite lido do PDF (ADR 0007).

    Vem por rota, depois da tela: abrir o PDF custa perto de um segundo, e a escolha não precisa
    esperar por ele. Sem lembrança e com palpite confiante, ele se aplica sozinho — a alternativa
    era o literal `book-v1` num caderno do ENEM. Com lembrança, ele só se oferece: quem varreu
    este livro antes sabe mais do que oito páginas sabem.
  */
  const [suggestion, setSuggestion] = useState<ProfileSuggestionView | null>(null);
  const [suggestionApplied, setSuggestionApplied] = useState(false);

  useEffect(() => {
    if (source === null) return;
    let alive = true;
    scanApi
      .suggestProfile(publicationId)
      .then((result) => {
        if (!alive) return;
        setSuggestion(result);
        const best = result.ranking[0];
        if (!hasMemory && best && best.score >= CONFIDENT && profiles.some((p) => p.id === best.id)) {
          setProfileId(best.id);
          setSuggestionApplied(true);
        }
      })
      // Palpite é conveniência: se a rota falhar, a tela continua inteira e a escolha é sua.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [publicationId, source, hasMemory, profiles]);

  const best = suggestion?.ranking[0];
  const offerBest = best !== undefined && best.score >= WORTH_OFFERING && best.id !== profileId;

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const { run } = await scanApi.start(publicationId, {
        profileId,
        pageFrom: Number(pageFrom) || 1,
        pageTo: pageTo.trim() === "" ? null : Number(pageTo),
        useAi,
        recognizeMath: math,
        forceNew,
      });
      router.push(`/publications/${publicationId}/scan/${run.id}`);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
      setBusy(false);
    }
  };

  return (
    <AppShell
      activeModule="captura"
      publicationId={publicationId}
      breadcrumb={[
        ...(library
          ? [
              { label: "Bibliotecas", href: "/bibliotecas" },
              { label: library.name, href: `/bibliotecas/${library.slug}` },
            ]
          : [{ label: "Publicações", href: "/publicacoes" }]),
        { label: title, href: `/publications/${publicationId}` },
        { label: "Scan" },
      ]}
    >
      <PageHeader eyebrow="SCAN ESTRUTURAL" title={title} meta={source ? `PDF fonte: ${source.filename}` : undefined} />

      {importRemoved && (
        <div style={{ padding: "0 var(--space-4)" }}>
          <Banner
            tone="ok"
            title="Importação apagada"
            actions={
              <Button size="sm" variant="secondary" href="/lixeira">
                Abrir a lixeira
              </Button>
            }
          >
            O que a varredura criou foi para a lixeira, e de lá dá para restaurar. O que você
            editou à mão depois de aprovar ficou onde estava. Pode varrer o livro de novo.
          </Banner>
        </div>
      )}

      {!source ? (
        <div style={{ padding: 24 }}>
          <EmptyState
            icon="file-text"
            title="Este livro não tem PDF fonte"
            description="O scan varre o PDF que o livro tem anexado. Anexe um no resumo do livro — do computador ou do Calibre."
            action={
              <Button variant="primary" href={`/publications/${publicationId}`}>
                Ir para o resumo
              </Button>
            }
          />
        </div>
      ) : (
        <div className="lbb-scan-start">
          <div className="lbb-scan-start-form">
            <Callout tone="info">
              O scan lê o PDF e propõe a estrutura — capítulos, seções, exemplos, exercícios — com as âncoras de cada
              um. Nada entra no livro antes de você revisar e aprovar.
            </Callout>
            {rememberedMissing !== null && (
              <Banner tone="warn" title="O perfil que este livro usava saiu">
                A última varredura deste livro usou <strong>{rememberedMissing}</strong>, que não está
                mais no código. Escolha o perfil abaixo com atenção: não dá para repetir a de antes.
              </Banner>
            )}
            <Field label="Perfil de captura" hint={profile?.description}>
              <Select value={profileId} onChange={(event) => setProfileId(event.target.value)}>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} ({p.id})
                  </option>
                ))}
              </Select>
            </Field>
            {suggestionApplied && best && (
              <Callout tone="ok">
                Escolhido pelo PDF: as primeiras {suggestion?.sampledPages} páginas parecem
                <strong> {best.label}</strong> ({best.evidence}). Troque se não for.
              </Callout>
            )}
            {offerBest && best && (
              <Callout tone="warn">
                As primeiras {suggestion?.sampledPages} páginas parecem mais
                <strong> {best.label}</strong> ({best.evidence}).{" "}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setProfileId(best.id);
                    setSuggestionApplied(false);
                  }}
                >
                  Usar {best.label}
                </Button>
              </Callout>
            )}
            {profile && (
              /*
                De que tipo é o perfil, e o que ele sabe achar.

                O contrato tem estes dois campos desde sempre e a tela os descartava, então nada
                impedia rodar "Prova do ENEM" num livro-texto e esperar capítulos.
              */
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
                <Badge tone={profile.documentKind === "EXAM" ? "accent" : "info"}>
                  {profile.documentKind === "EXAM" ? "para prova" : "para livro"}
                </Badge>
                <small style={{ color: "var(--text-muted)" }}>acha: {profile.kinds.join(" · ").toLowerCase()}</small>
              </div>
            )}
            <div className="lbb-scan-start-row">
              <Field label="Da página">
                <Input type="number" min={1} value={pageFrom} onChange={(event) => setPageFrom(event.target.value)} />
              </Field>
              <Field label="Até a página" hint="vazio = até o fim">
                <Input type="number" min={1} value={pageTo} onChange={(event) => setPageTo(event.target.value)} />
              </Field>
            </div>
            <Checkbox
              label={aiConfigured ? "Pedir desempate à IA nos itens duvidosos" : "IA não configurada (AI_BASE_URL, AI_MODEL)"}
              checked={useAi && aiConfigured}
              disabled={!aiConfigured}
              onChange={(event) => setUseAi(event.target.checked)}
            />
            <Field
              label="Reconhecimento matemático"
              hint={visionConfigured ? aviso : "Sem AI_VISION_MODEL, a matemática fica para a revisão."}
            >
              <Select value={math} disabled={!visionConfigured} onChange={(event) => setMath(event.target.value as typeof math)}>
                <option value="never">Não reconhecer agora</option>
                <option value="auto">Só onde o texto do PDF não basta</option>
                <option value="always">Todos os exercícios e textos</option>
              </Select>
            </Field>
            <Checkbox
              label="Novo scan, mesmo que já exista um igual"
              checked={forceNew}
              onChange={(event) => setForceNew(event.target.checked)}
            />
            {error && <Banner tone="danger">{error}</Banner>}
            <Button variant="primary" icon="sparkles" loading={busy} disabled={!profileId} onClick={() => void start()}>
              Escanear
            </Button>
          </div>

          <div className="lbb-scan-runs">
            <h3 style={{ margin: 0 }}>Execuções</h3>
            {runs.length === 0 && <span style={{ color: "var(--text-muted)" }}>Nenhum scan ainda.</span>}
            {runs.map((run) => (
              <a key={run.id} className="lbb-scan-run" href={`/publications/${publicationId}/scan/${run.id}`}>
                <Badge tone={STATE_TONE[run.state] ?? "info"}>{run.interrupted ? "interrompida" : run.stateLabel}</Badge>
                <div style={{ flex: 1 }}>
                  <div>
                    {run.profileId}@{run.profileVersion} · páginas {run.pageFrom}–{run.pageTo || "?"}
                    {run.settings.useAi ? " · IA" : ""}
                    {/* Perfil que saiu do código: a proposta continua legível e aprovável, não editável. */}
                    {!profiles.some((p) => p.id === run.profileId) && (
                      <>
                        {" "}
                        <Badge tone="neutral">perfil fora do código</Badge>
                      </>
                    )}
                  </div>
                  <small>
                    {new Date(run.createdAt).toLocaleString("pt-BR")}
                    {run.metrics ? ` · ${run.metrics.items} itens, ${run.metrics.lowConfidence} de baixa confiança` : ""}
                    {run.aiModel ? ` · ${run.aiModel}` : ""}
                  </small>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}
