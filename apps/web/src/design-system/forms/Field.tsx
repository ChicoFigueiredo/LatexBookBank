import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-field{display:flex;flex-direction:column;gap:4px}
.lbb-field-label{display:flex;align-items:baseline;gap:4px;font-size:var(--text-body-sm);font-weight:var(--weight-medium);color:var(--text-primary)}
.lbb-field-req{color:var(--danger-text)}
.lbb-field-opt{font-weight:var(--weight-regular);color:var(--text-muted);font-size:var(--text-meta)}
.lbb-field-hint{font-size:var(--text-meta);color:var(--text-secondary);line-height:var(--leading-normal)}
.lbb-field-error{display:flex;align-items:baseline;gap:4px;font-size:var(--text-meta);color:var(--danger-text);line-height:var(--leading-normal)}
`;

export interface FieldProps {
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  /** Erro que ensina: o que aconteceu → o que significa → próximo passo. */
  readonly error?: ReactNode;
  readonly required?: boolean;
  readonly optional?: boolean;
  readonly htmlFor?: string;
  readonly children: ReactNode;
}

/**
 * Rótulo, controle e hint/erro com a acessibilidade já ligada.
 *
 * O filho recebe `id`, `aria-describedby` e `invalid` automaticamente. Fazer isso à mão em cada
 * formulário é o tipo de trabalho que se esquece — e o resultado é um campo com erro visível
 * mas mudo para quem usa leitor de tela.
 */
export function Field({
  label,
  hint,
  error,
  required = false,
  optional = false,
  htmlFor,
  children,
}: FieldProps) {
  injectCss("lbb-field-css", CSS);

  const auto = useId();
  const id = htmlFor ?? auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        "aria-describedby": describedBy,
        ...(error ? { invalid: true } : {}),
        ...(required ? { "aria-required": true } : {}),
      })
    : children;

  return (
    <div className="lbb-field">
      <label className="lbb-field-label" htmlFor={id}>
        {label}
        {required && (
          <span className="lbb-field-req" aria-hidden="true">
            *
          </span>
        )}
        {optional && !required && <span className="lbb-field-opt">opcional</span>}
      </label>
      {control}
      {hint && !error && (
        <span className="lbb-field-hint" id={hintId}>
          {hint}
        </span>
      )}
      {/* `role="alert"` para o erro chegar a quem usa leitor sem precisar reencontrar o campo. */}
      {error && (
        <span className="lbb-field-error" id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
