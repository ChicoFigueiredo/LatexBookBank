"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";

import { Workbench, type BreadcrumbItem, type Command } from "@/design-system";
import type { SearchHit } from "@modules/questions/domain/search-query";

import { InfraStatusBar } from "./infra-status";
import { useRailCounts } from "./rail-counts";
import { railHref, railModules } from "./rail";

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
  /**
   * O livro corrente, quando a tela tem um.
   *
   * Sem ele, "Captura" e "Editor do livro" caem na lista de publicações para escolher um livro —
   * que é o certo na Home, e é desperdício no overview, onde o livro está na tela.
   */
  readonly publicationId?: string;
}

export function AppShell({
  activeModule,
  breadcrumb = [],
  actions,
  children,
  statusLeft,
  publicationId,
}: AppShellProps) {
  const router = useRouter();
  const counts = useRailCounts();
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
    // O mesmo destino nos dois caminhos: `⏎` navega no lugar, `⇧⏎` abre ao lado. Duas rotas
    // diferentes para a mesma linha seria a segunda envelhecer sozinha.
    href: `/questoes/${hit.id}`,
    onSelect: () => router.push(`/questoes/${hit.id}`),
  }));

  return (
    <Workbench
      modules={railModules(counts)}
      activeModule={activeModule}
      onModuleSelect={(id) => router.push(railHref(id, publicationId))}
      breadcrumb={breadcrumb}
      commands={commands}
      onCommandQueryChange={search}
      searchLabel="Buscar no acervo…"
      // O que é verdade, e não o que o protótipo desenha: a busca livre olha enunciado e apelido;
      // tag, banca e ano são **filtros**, não texto livre. Prometer o que ela não faz manda
      // procurar o defeito na busca quando o resultado vazio é o correto.
      searchScopeHint="busca no enunciado e no apelido · tag, banca e ano são filtros"
      {...(actions ? { actions } : {})}
      /**
       * `local-first` primeiro, e a infraestrutura viva depois (protótipo).
       *
       * A tela pode acrescentar o que é dela — a Home conta bibliotecas, o editor conta nós —, e o
       * que vale para o produto inteiro fica sempre aqui, no mesmo lugar de toda tela.
       */
      statusLeft={
        <>
          <span>local-first · SQLite</span>
          {statusLeft}
          <InfraStatusBar />
        </>
      }
    >
      {children}
    </Workbench>
  );
}
