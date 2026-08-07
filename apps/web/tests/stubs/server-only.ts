/**
 * Stub de `server-only` para os testes.
 *
 * O pacote real exporta um módulo vazio sob a condição `react-server` e um que lança sob as
 * demais. O pipeline SSR do Vitest não aplica essa condição, então importaria o que lança, e
 * nenhum módulo de servidor seria testável — a guarda passaria a proteger contra os testes em
 * vez de contra Client Components.
 *
 * Este stub reproduz o que o Next entrega no servidor: nada.
 */
export {};
