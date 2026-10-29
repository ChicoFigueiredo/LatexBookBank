"use client";

import { useState } from "react";

import { Button, Icon, Popover, injectCss, type IconName } from "@/design-system";
import type { NodeKind } from "@modules/document-tree/domain/node-kind";
import type { QuestionType } from "@modules/questions/domain/question-type";

/**
 * O menu `+ Adicionar` do design (§7 dos ajustes finais).
 *
 * A UX que ele substitui era "Novo nó → transformar em questão", e o problema dela não era o
 * número de cliques: era que o modelo mental ficava errado. Uma questão não é um nó que virou
 * outra coisa — é uma questão, com tipo escolhido na hora de criar, e é isso que faz o
 * `CreateQuestion` atômico existir do outro lado.
 *
 * Dois grupos, rotulados: Estrutura e Questões. A separação é a do design e é o que faz o menu
 * ser lido sem precisar ler item por item.
 */

const CSS = `
.lbb-addmenu{display:flex;flex-direction:column;gap:1px;min-width:15rem;padding:4px}
.lbb-addmenu-group{font-family:var(--font-mono);font-size:var(--text-micro);font-weight:var(--weight-medium);letter-spacing:var(--tracking-wide);text-transform:uppercase;color:var(--text-muted);padding:8px 10px 4px}
.lbb-addmenu-item{display:flex;align-items:center;gap:8px;width:100%;height:var(--control-h-md);padding:0 10px;border:none;border-radius:var(--radius-md);background:transparent;color:var(--text-primary);font:inherit;font-size:var(--text-body);text-align:left;cursor:pointer}
.lbb-addmenu-item:hover{background:var(--hover-overlay)}
.lbb-addmenu-item:focus-visible{outline:2px solid var(--focus-ring);outline-offset:-2px}
.lbb-addmenu-item:disabled{opacity:var(--disabled-opacity);cursor:not-allowed}
.lbb-addmenu-sep{height:1px;margin:4px 6px;background:var(--border-subtle)}
.lbb-addmenu-foot{display:flex;align-items:center;gap:6px;margin:4px -4px -4px;padding:7px 10px;border-top:1px solid var(--border-subtle);background:var(--surface-raised);font-family:var(--font-mono);font-size:var(--text-micro);color:var(--text-muted)}
`;

const STRUCTURE: readonly { kind: NodeKind; label: string; icon: IconName }[] = [
  { kind: "CHAPTER", label: "Capítulo", icon: "book-open" },
  { kind: "SECTION", label: "Seção", icon: "list-tree" },
  { kind: "SUBSECTION", label: "Subseção", icon: "list-tree" },
  { kind: "QUESTION_GROUP", label: "Grupo de questões", icon: "inbox" },
  { kind: "EXAMPLE", label: "Exemplo", icon: "clipboard-list" },
];

/**
 * Os três tipos mínimos do Beta (§12), com o vocabulário do design.
 *
 * `MULTIPLE_CHOICE` é "Escolha simples" e `MULTIPLE_CORRECT` é "Múltipla escolha" — os nomes
 * internos vêm do mapa do import legado e não são o que o usuário lê.
 */
const QUESTIONS: readonly { type: QuestionType; label: string; hint: string }[] = [
  { type: "MULTIPLE_CHOICE", label: "Escolha simples", hint: "uma correta" },
  { type: "MULTIPLE_CORRECT", label: "Múltipla escolha", hint: "uma ou mais corretas" },
  { type: "DISCURSIVE", label: "Discursiva", hint: "sem alternativas" },
];

export interface AddMenuProps {
  readonly disabled?: boolean;
  readonly onCreateStructure: (kind: NodeKind) => void;
  readonly onCreateQuestion: (type: QuestionType) => void;
  /** Onde vai entrar, em texto — "em Capítulo 3 › Exercícios". Some quando é a raiz. */
  readonly destinationLabel?: string | null;
  /**
   * Abre de fora — é o que `Ctrl Q` usa.
   *
   * Controlado e opcional: sem estas duas props o menu continua dono do próprio estado, que é o
   * certo para quem só clica no botão. O atalho é a única razão de a abertura precisar vir de
   * fora, e não vale transformar todo consumidor num gerente de estado por causa dele.
   */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  /**
   * Banca e ano que a questão nova vai herdar — `"FUVEST · 2019"`, ou `null` quando não há.
   *
   * Só vale para as questões: capítulo e seção não têm banca. Ver `herdar-metadados`.
   */
  readonly inheritSource?: string | null;
}

export function AddMenu({
  disabled = false,
  onCreateStructure,
  onCreateQuestion,
  destinationLabel,
  open: openProp,
  onOpenChange,
  inheritSource = null,
}: AddMenuProps) {
  injectCss("lbb-addmenu-css", CSS);
  const [openInterno, setOpenInterno] = useState(false);

  const open = openProp ?? openInterno;
  const setOpen = (proximo: boolean) => {
    setOpenInterno(proximo);
    onOpenChange?.(proximo);
  };

  const pick = (run: () => void) => () => {
    // Fecha antes de disparar: a chamada recarrega a árvore, e um popover aberto sobre a árvore
    // que muda embaixo dele fica apontando para a linha errada.
    setOpen(false);
    run();
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="sm" variant="primary" icon="plus" disabled={disabled}>
          Adicionar
        </Button>
      }
    >
      <div className="lbb-addmenu" role="menu" aria-label="Adicionar à publicação">
        {destinationLabel && (
          <div className="lbb-addmenu-group" title={destinationLabel}>
            em {destinationLabel}
          </div>
        )}

        <div className="lbb-addmenu-group">Estrutura</div>
        {STRUCTURE.map((entry) => (
          <button
            key={entry.kind}
            type="button"
            role="menuitem"
            className="lbb-addmenu-item"
            onClick={pick(() => onCreateStructure(entry.kind))}
          >
            <Icon name={entry.icon} />
            <span style={{ flex: 1 }}>{entry.label}</span>
          </button>
        ))}

        <div className="lbb-addmenu-sep" />

        <div className="lbb-addmenu-group">Questões</div>
        {QUESTIONS.map((entry) => (
          <button
            key={entry.type}
            type="button"
            role="menuitem"
            className="lbb-addmenu-item"
            onClick={pick(() => onCreateQuestion(entry.type))}
          >
            <Icon name="circle-help" />
            <span style={{ flex: 1 }}>{entry.label}</span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-micro)",
                color: "var(--text-muted)",
              }}
            >
              {entry.hint}
            </span>
          </button>
        ))}

        {/*
          O rodapé do protótipo (2229): “Herda livro, capítulo e metadados da questão anterior.”

          Com os valores dentro, e não só a regra. “Herda metadados” manda fechar o menu e ir olhar
          qual é a anterior; “herda FUVEST · 2019” é a mesma frase respondida.
        */}
        {inheritSource !== null && (
          <div
            className="lbb-addmenu-foot"
            title="Banca e ano vêm preenchidos. Dá para trocar depois, na questão."
          >
            <Icon name="arrow-right" />
            <span>herda {inheritSource} da anterior</span>
          </div>
        )}
      </div>
    </Popover>
  );
}
