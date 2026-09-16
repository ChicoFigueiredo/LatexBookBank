"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Icon, MenuButton } from "@/design-system";

/**
 * O card de uma biblioteca, com o menu de ações ao lado.
 *
 * O menu fica **fora** do `<Link>`, não dentro dele. Botão aninhado em âncora é HTML inválido, e o
 * navegador reage de forma que não dá para consertar depois: clicar nos três pontos navega para a
 * biblioteca antes de o menu abrir. Daí o `slot` — a âncora cobre o card inteiro, o menu flutua
 * acima dela num canto que a âncora não ocupa.
 */

export interface LibraryCardProps {
  readonly href: string;
  readonly name: string;
  readonly meta: ReactNode;
  readonly onDelete: () => void;
}

export function LibraryCard({ href, name, meta, onDelete }: LibraryCardProps) {
  return (
    <div className="lbb-card-slot">
      <Link className="lbb-card" href={href}>
        <span className="lbb-card-title">
          <Icon name="library" />
          {name}
        </span>
        <span className="lbb-card-meta">{meta}</span>
      </Link>

      <div className="lbb-card-actions">
        <MenuButton
          // O nome entra no rótulo porque a tela tem dezenas destes botões: "Ações" repetido
          // trinta vezes não diz a um leitor de tela qual biblioteca está sob o cursor.
          aria-label={`Ações da biblioteca ${name}`}
          groups={[[{ id: "delete", label: "Excluir", icon: "circle-x", tone: "danger", onSelect: onDelete }]]}
        />
      </div>
    </div>
  );
}
