"use client";

import { useCallback, useState } from "react";

import { Banner, Input, Select } from "@/design-system";
import {
  MetadataError,
  metadataWarnings,
  MIN_YEAR,
  maxYear,
  normalizeMetadata,
  type QuestionMetadata,
} from "@modules/questions/domain/question-metadata";
import { DIFFICULTIES, DIFFICULTY_LABELS } from "@modules/questions/domain/question-type";

/**
 * A aba "Metadados" — de onde a questão veio.
 *
 * Quase tudo é texto livre, e é assim de propósito: o acervo tem vinte anos de bancas cujo nome
 * mudou ("CESPE" virou "CEBRASPE"), e um vocabulário fechado obrigaria a escolher qual nome está
 * certo antes de o dado existir.
 *
 * A validação vem do domínio, não daqui. A tela mostra o erro; quem decide o que é erro é
 * `normalizeMetadata`, que também roda no servidor — senão a regra existiria em dois lugares e um
 * deles ficaria para trás.
 */

export interface MetadataPanelProps {
  readonly metadata: QuestionMetadata;
  readonly onChange: (patch: Partial<QuestionMetadata>) => void;
  readonly disabled?: boolean;
}

export function MetadataPanel({ metadata, onChange, disabled = false }: MetadataPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [videoDraft, setVideoDraft] = useState(metadata.videoUrl ?? "");

  /**
   * Normaliza antes de subir.
   *
   * O erro fica **local** e o valor anterior permanece: um ano com erro de digitação não pode
   * virar um `PATCH` que o servidor recusa depois, deixando a tela mostrando um estado que o
   * banco não tem.
   */
  const commit = useCallback(
    (patch: Parameters<typeof normalizeMetadata>[0]) => {
      try {
        onChange(normalizeMetadata(patch));
        setError(null);
      } catch (problem) {
        setError(problem instanceof MetadataError ? problem.message : "Valor inválido.");
      }
    },
    [onChange],
  );

  const warnings = metadataWarnings(metadata);

  return (
    <div style={{ display: "grid", gap: "var(--space-3)", padding: "var(--space-4)" }}>
      {error !== null && (
        <Banner tone="danger" title="Valor recusado">
          {error}
        </Banner>
      )}

      {warnings.map((warning) => (
        // Aviso e não erro: a questão continua utilizável, e metade do acervo é de livro — sem
        // banca nem ano.
        <Banner key={warning.field} tone="warn" title="Metadado incompleto">
          {warning.message}
        </Banner>
      ))}

      <Field label="Dificuldade">
        <Select
          size="sm"
          value={String(metadata.difficulty)}
          disabled={disabled}
          aria-label="Dificuldade"
          onChange={(event) => commit({ difficulty: Number(event.target.value) })}
        >
          {DIFFICULTIES.map((value) => (
            <option key={value} value={value}>
              {DIFFICULTY_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "8rem 1fr", gap: "var(--space-3)" }}>
        <Field label="Ano">
          <Input
            size="sm"
            type="number"
            min={MIN_YEAR}
            max={maxYear(new Date())}
            value={metadata.year ?? ""}
            disabled={disabled}
            aria-label="Ano"
            onChange={(event) =>
              commit({ year: event.target.value === "" ? null : Number(event.target.value) })
            }
          />
        </Field>

        <Field label="Banca">
          <Input
            size="sm"
            value={metadata.board ?? ""}
            disabled={disabled}
            aria-label="Banca"
            placeholder="CESPE / CEBRASPE, FGV, VUNESP…"
            onChange={(event) => commit({ board: event.target.value })}
          />
        </Field>
      </div>

      <Field label="Instituição">
        <Input
          size="sm"
          value={metadata.institution ?? ""}
          disabled={disabled}
          aria-label="Instituição"
          onChange={(event) => commit({ institution: event.target.value })}
        />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 12rem", gap: "var(--space-3)" }}>
        <Field label="Cargo">
          <Input
            size="sm"
            value={metadata.role ?? ""}
            disabled={disabled}
            aria-label="Cargo"
            onChange={(event) => commit({ role: event.target.value })}
          />
        </Field>

        <Field label="Nível do cargo">
          <Input
            size="sm"
            value={metadata.roleLevel ?? ""}
            disabled={disabled}
            aria-label="Nível do cargo"
            placeholder="Médio, Superior…"
            onChange={(event) => commit({ roleLevel: event.target.value })}
          />
        </Field>
      </div>

      <Field label="Origem">
        <Input
          size="sm"
          value={metadata.publisher ?? ""}
          disabled={disabled}
          aria-label="Origem"
          placeholder="Editora, livro, apostila…"
          onChange={(event) => commit({ publisher: event.target.value })}
        />
      </Field>

      <Field label="Vídeo">
        <Input
          size="sm"
          type="url"
          // Rascunho local enquanto se digita, e só depois o valor de verdade.
          //
          // Sem ele, o campo ficaria controlado por `metadata.videoUrl` com um `onChange` que não
          // atualiza nada — quer dizer, um campo onde não dá para digitar. A primeira versão
          // deste arquivo tinha exatamente esse defeito.
          value={videoDraft}
          disabled={disabled}
          aria-label="Vídeo"
          placeholder="https://…"
          onChange={(event) => {
            setVideoDraft(event.target.value);
            setError(null);
          }}
          // `onBlur` e não `onChange`: validar URL a cada tecla acusaria erro em `h`, `ht`,
          // `htt` — quer dizer, o tempo todo enquanto se digita um endereço.
          onBlur={(event) => commit({ videoUrl: event.target.value })}
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-micro)",
          letterSpacing: "var(--tracking-wide)",
          textTransform: "uppercase",
          color: "var(--text-secondary)",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
