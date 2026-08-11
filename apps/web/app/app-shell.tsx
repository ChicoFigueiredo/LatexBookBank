"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";

import { Workbench, type BreadcrumbItem, type Command } from "@/design-system";
import type { SearchHit } from "@modules/questions/domain/search-query";

import { RAIL_MODULES, railHref } from "./rail";

/**
 * O shell das telas de acervo — Home, biblioteca, cadastro de livro.
 *
 * Usa o mesmo `Workbench` da tela de edição, sem sidebar nem aside: a árvore pertence a uma
 * publicação aberta, e o agente também. O que fica é o rail, o breadcrumb e a busca — que é
 * exatamente o que essas telas precisam para não serem becos sem saída.
 */

export interface AppShellProps {
  readonly activeModule: string;
  readonly breadcrumb?: readonly BreadcrumbItem[];
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly statusLeft?: ReactNode;
}

export function AppShell({
  activeModule,
  breadcrumb = [],
  actions,
  children,
  statusLeft,
}: AppShellProps) {
  const router = useRouter();
  const [found, setFound] = useState<readonly SearchHit[]>([]);

  /**
   * A busca da paleta vai ao servidor a cada tecla, com um piso de três letras.
   *
   * Menos de três casaria com o acervo inteiro, e a resposta seria uma lista que não ajuda a
   * escolher. O resultado **navega** — §31 do prompt do time: resultado sem ação é resultado que
   * não deveria estar na lista.
   */
  const search = useCallback((text: string) => {
    if (text.trim().length < 3) {
      setFound([]);
      return;
    }

    void fetch(`/api/search?q=${encodeURIComponent(text.trim())}&limit=8`)
      .then((response) => response.json() as Promise<{ hits?: SearchHit[] }>)
      .then((payload) => setFound(payload.hits ?? []))
      .catch(() => setFound([]));
  }, []);

  const commands: readonly Command[] = found.map((hit) => ({
    id: hit.id,
    label: hit.title === "(sem apelido)" ? hit.excerpt.slice(0, 60) : hit.title,
    icon: "circle-help",
    hint: [hit.board, hit.year].filter(Boolean).join(" · ") || hit.type,
    group: "No acervo",
    onSelect: () => router.push(`/questoes/${hit.id}`),
  }));

  return (
    <Workbench
      modules={RAIL_MODULES}
      activeModule={activeModule}
      onModuleSelect={(id) => router.push(railHref(id))}
      breadcrumb={breadcrumb}
      commands={commands}
      onCommandQueryChange={search}
      searchLabel="Buscar no acervo…"
      {...(actions ? { actions } : {})}
      statusLeft={statusLeft ?? <span>SQLite · local</span>}
    >
      {children}
    </Workbench>
  );
}
