import type { CSSProperties } from "react";

/**
 * Marca do LatexBookBank — substitui o monograma "E" do EduLingo (D13, D15).
 *
 * O desenho é a chave de grupo do LaTeX (`{`) ao lado de duas linhas de texto composto: à
 * esquerda a estrutura, à direita o conteúdo tipografado. É literalmente o que o produto faz —
 * marcação estruturada virando página — e sobrevive a 16 px, que é o tamanho em que ela mais
 * aparece (rail recolhido, favicon, topbar).
 *
 * Não é ícone: mora fora de `Icon.tsx` porque não participa do set lucide, não segue stroke 1.5 e
 * nunca deve ser substituível por outro glifo. Um `Icon name="brand"` convidaria exatamente isso.
 */

export type BrandTone = "ink" | "paper" | "sepia";

const TONES: Record<BrandTone, CSSProperties> = {
  ink: { background: "var(--accent)", color: "var(--on-accent)" },
  paper: {
    background: "var(--surface)",
    color: "var(--accent)",
    border: "1px solid var(--border-default)",
  },
  sepia: { background: "var(--accent-warm)", color: "var(--text-inverse)" },
};

export interface BrandMarkProps {
  readonly size?: number;
  readonly tone?: BrandTone;
  readonly style?: CSSProperties;
  /** Rótulo alternativo — só quando a marca aparece sem o nome escrito ao lado. */
  readonly label?: string;
}

export function BrandMark({
  size = 28,
  tone = "ink",
  style,
  label = "LatexBookBank",
}: BrandMarkProps) {
  return (
    <div
      role="img"
      aria-label={label}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        ...TONES[tone],
        ...style,
      }}
    >
      <svg
        width={size * 0.62}
        height={size * 0.62}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        // Traço mais grosso que o dos ícones: a marca precisa manter peso quando reduzida ao
        // tamanho do favicon, onde o stroke 1.5 do set lucide desaparece.
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9.5 4.5c-1.6 0-2.2.8-2.2 2.1v2.6c0 1.2-.6 1.9-1.5 1.9.9 0 1.5.7 1.5 1.9v2.6c0 1.3.6 2.1 2.2 2.1" />
        <path d="M13 9h5.5" />
        <path d="M13 15h3.5" />
      </svg>
    </div>
  );
}
