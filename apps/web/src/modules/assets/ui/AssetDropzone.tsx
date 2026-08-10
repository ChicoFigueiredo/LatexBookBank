"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { injectCss } from "@/design-system";

/**
 * Os três gestos de trazer um arquivo: escolher, arrastar e colar.
 *
 * Um componente só, e não três, porque os três produzem a mesma coisa — um `File`. Tratá-los
 * separado é como se ganha três caminhos de validação que divergem com o tempo, e o que falha é
 * sempre o menos usado.
 *
 * O `Ctrl+V` é o que mais importa no uso real: recortar da tela e colar é o gesto de quem está
 * digitalizando prova, e obrigá-lo a salvar em disco antes acrescenta um passo por questão.
 *
 * Ver spec §10 · issue #135.
 */

const CSS = `
.lbb-drop{position:relative;display:grid;place-items:center;gap:6px;padding:var(--space-6);border:2px dashed var(--border-default);border-radius:var(--radius-md);background:var(--surface-sunken);text-align:center;cursor:pointer;transition:border-color var(--motion-fast) var(--ease-standard),background var(--motion-fast) var(--ease-standard)}
.lbb-drop:hover{border-color:var(--border-strong)}
.lbb-drop[data-over="true"]{border-color:var(--accent);background:var(--accent-surface)}
.lbb-drop:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}
.lbb-drop-title{font-weight:var(--weight-medium)}
.lbb-drop-hint{font-family:var(--font-mono);font-size:var(--text-micro);color:var(--text-secondary)}
.lbb-drop-input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
`;

export interface AssetDropzoneProps {
  readonly onFile: (file: File) => void;
  readonly accept?: string;
  readonly disabled?: boolean;
  readonly label?: string;
  /**
   * Escuta `paste` na janela inteira.
   *
   * `true` só quando a área é o assunto da tela. Numa tela com editor de texto, colar deveria ir
   * para o editor — e um dropzone que sequestra o `Ctrl+V` global tornaria impossível colar
   * LaTeX.
   */
  readonly listenToPaste?: boolean;
}

export function AssetDropzone({
  onFile,
  accept = "image/*,application/pdf",
  disabled = false,
  label = "Arraste um arquivo, clique para escolher, ou cole com Ctrl+V",
  listenToPaste = false,
}: AssetDropzoneProps) {
  injectCss("lbb-drop-css", CSS);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);

  const take = useCallback(
    (file: File | null | undefined) => {
      if (!disabled && file) onFile(file);
    },
    [disabled, onFile],
  );

  useEffect(() => {
    if (!listenToPaste || disabled) return;

    const onPaste = (event: ClipboardEvent) => {
      const item = [...(event.clipboardData?.items ?? [])].find((entry) =>
        entry.type.startsWith("image/"),
      );
      if (item === undefined) return;

      // `preventDefault` só quando há imagem: sem isso, colar texto numa tela com dropzone
      // pararia de funcionar.
      event.preventDefault();
      take(item.getAsFile());
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [listenToPaste, disabled, take]);

  return (
    <div
      className="lbb-drop"
      data-over={String(over)}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-disabled={disabled}
      onClick={() => inputRef.current?.click()}
      // Teclado também abre o seletor: um `div` com `role="button"` que só responde a clique é
      // um botão que metade das pessoas não alcança.
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        // Sem `preventDefault` o navegador abre o arquivo numa aba nova, e o trabalho da tela se
        // perde. É o comportamento padrão, e ele é sempre errado aqui.
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        take(event.dataTransfer.files[0]);
      }}
    >
      <span className="lbb-drop-title">{over ? "Solte aqui" : "Trazer arquivo"}</span>
      <span className="lbb-drop-hint">{label}</span>

      <input
        ref={inputRef}
        type="file"
        className="lbb-drop-input"
        accept={accept}
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
        // O clique do próprio `input` **não** pode subir: ele borbulharia até o `div`, que chamaria
        // `click()` de novo. Os navegadores travam a reentrância e o efeito visível é só o seletor
        // abrindo duas vezes; sem a trava, é recursão infinita.
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          take(event.target.files?.[0]);
          // Zerar o valor permite escolher **o mesmo arquivo** de novo: sem isso, o segundo
          // `change` nunca dispara, e a tela parece travada.
          event.target.value = "";
        }}
      />
    </div>
  );
}
