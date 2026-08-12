"use client";

import { useEffect, useState } from "react";

/**
 * A infraestrutura viva na barra de status (protótipo: `local-first · worker de render: pronto ·
 * gemma3:12b carregado · backup há 1 h`).
 *
 * A barra dizia `SQLite · local` e uma contagem. A §9 das divergências é curta e o argumento é
 * prático: **o worker de render e o modelo carregado são o que o usuário precisa saber antes de
 * mandar renderizar.** Descobrir que o worker está parado depois de clicar em "Renderizar" e
 * esperar o timeout é a versão cara da mesma informação.
 *
 * Chega depois da montagem, de propósito. `probeRenderer` bate na rede com timeout, e pendurar
 * isso no servidor faria toda navegação esperar antes do primeiro byte. Enquanto não chega, a
 * barra diz `verificando…` — que é verdade, e é diferente de dizer `pronto` por otimismo.
 */

type Health = "ok" | "off" | "unconfigured" | string;

interface InfraStatus {
  readonly renderer: { readonly health: Health; readonly summary: string };
  readonly ai: { readonly health: Health; readonly summary: string };
  readonly backup: { readonly health: Health; readonly summary: string };
}

export function useInfraStatus(): InfraStatus | null {
  const [status, setStatus] = useState<InfraStatus | null>(null);

  useEffect(() => {
    let atual = true;

    void fetch("/api/infra")
      .then((response) => (response.ok ? (response.json() as Promise<InfraStatus>) : null))
      .then((payload) => {
        if (atual && payload) setStatus(payload);
      })
      .catch(() => {
        // Barra de status não é lugar de erro: sem resposta, ela continua dizendo "verificando…",
        // que é o estado real de quem não conseguiu perguntar.
      });

    return () => {
      atual = false;
    };
  }, []);

  return status;
}

/**
 * Os três da infraestrutura, curtos o bastante para uma barra de 24px.
 *
 * O resumo completo do diagnóstico não cabe: "Worker respondeu HTTP 502 · endereço tal" é a frase
 * daquela página. Aqui é o suficiente para decidir se vale clicar em Renderizar, e um clique leva
 * ao Diagnóstico, onde a frase inteira mora.
 */
export function InfraStatusBar() {
  const status = useInfraStatus();

  if (!status) return <span>verificando…</span>;

  return (
    <>
      <span data-tone={tone(status.renderer.health)}>render: {curto(status.renderer)}</span>
      <span data-tone={tone(status.ai.health)}>ia: {curtoIa(status.ai)}</span>
      <span data-tone={tone(status.backup.health)}>backup: {curtoBackup(status.backup)}</span>
    </>
  );
}

const tone = (health: Health): "warn" | undefined => (health === "ok" ? undefined : "warn");

const curto = (secao: { health: Health; summary: string }): string =>
  secao.health === "ok" ? "pronto" : secao.health === "unconfigured" ? "não configurado" : "parado";

/** Da IA interessa **qual modelo**: é o que muda o resultado, e é o que o protótipo mostra. */
function curtoIa(secao: { health: Health; summary: string }): string {
  if (secao.health !== "ok") return secao.health === "unconfigured" ? "não configurada" : "fora";

  // O diagnóstico devolve algo como "Ollama local · qwen3-coder:30b". O modelo é a segunda parte.
  const partes = secao.summary.split("·").map((parte) => parte.trim());

  return partes[partes.length - 1] || "pronta";
}

/** "há 1 h" quando há; o motivo, quando não há. Nunca um silêncio que parece "tudo certo". */
function curtoBackup(secao: { health: Health; summary: string }): string {
  if (secao.health === "unconfigured") return "não configurado";
  if (secao.health !== "ok") return "falhou";

  // "Último backup: há 1 h · 214 MB" → "há 1 h".
  const depoisDoisPontos = secao.summary.split(":").slice(1).join(":");

  return depoisDoisPontos.split("·")[0]?.trim() || "ok";
}
