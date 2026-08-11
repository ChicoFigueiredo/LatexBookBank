"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Estado persistido em `localStorage`, seguro para SSR e para hidratação.
 *
 * O DS de origem lia `window.localStorage` dentro do inicializador do `useState`. Sob o App
 * Router isso quebra duas vezes: `window` não existe no servidor, e mesmo com guarda o primeiro
 * render do cliente devolveria um valor diferente do HTML que veio do servidor — o clássico erro
 * de hidratação que aparece só quando alguém já mexeu nas divisórias.
 *
 * `useSyncExternalStore` resolve exatamente isso: o servidor renderiza com o default, o cliente
 * troca para o valor guardado logo após hidratar, e o React sabe que a diferença é esperada.
 *
 * O `storage` event também é escutado — dois separadores do mesmo workspace abertos em abas
 * diferentes não brigam pela largura.
 */

const listeners = new Map<string, Set<() => void>>();

/**
 * Cache do valor já parseado. `getSnapshot` precisa devolver a **mesma** referência enquanto nada
 * mudar, ou o React entra em loop de render. Ler e parsear a cada chamada devolveria um objeto
 * novo toda vez.
 */
const cache = new Map<string, unknown>();

function emit(key: string): void {
  const set = listeners.get(key);
  if (set) for (const listener of set) listener();
}

function subscribe(key: string, onChange: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(onChange);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== key) return;
    cache.delete(key);
    onChange();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    set.delete(onChange);
    if (set.size === 0) listeners.delete(key);
    window.removeEventListener("storage", onStorage);
  };
}

function read<T>(key: string, fallback: T): T {
  if (cache.has(key)) return cache.get(key) as T;

  let value = fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw != null) value = JSON.parse(raw) as T;
  } catch {
    // Modo privado, quota estourada, JSON corrompido: seguir com o default é sempre melhor do
    // que derrubar o workbench inteiro por causa de uma largura de painel.
  }
  cache.set(key, value);
  return value;
}

function write<T>(key: string, value: T): void {
  cache.set(key, value);
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* idem — o valor segue válido em memória nesta sessão */
  }
  emit(key);
}

export function useStoredState<T>(key: string, fallback: T): [T, (next: T) => void] {
  const value = useSyncExternalStore(
    useCallback((onChange: () => void) => subscribe(key, onChange), [key]),
    useCallback(() => read(key, fallback), [key, fallback]),
    useCallback(() => fallback, [fallback]),
  );

  const set = useCallback((next: T) => write(key, next), [key]);

  return [value, set];
}

/** Só para testes: o cache é módulo-global e sobreviveria entre casos. */
export function __resetStoredStateCache(): void {
  cache.clear();
}
