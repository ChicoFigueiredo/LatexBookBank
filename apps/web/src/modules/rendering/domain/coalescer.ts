/**
 * Coalescência de pedidos.
 *
 * O critério da fase é preciso: **render intermediário é descartado e o estado final converge
 * para o último pedido**. São duas coisas, e a diferença entre elas é onde é fácil errar.
 *
 * A primeira versão do `useRender` simplesmente **ignorava** o pedido concorrente. Isso descarta o
 * intermediário, sim — mas descarta o *último*, que é o único que importa. Quem edita o texto e
 * aperta `Ctrl+Enter` de novo enquanto a primeira compilação roda fica olhando o PDF **anterior**
 * e concluindo que o produto não atualizou.
 *
 * A regra correta tem três partes:
 *
 * 1. sem nada rodando, o pedido começa na hora;
 * 2. com algo rodando, o pedido **vira pendente** — e um segundo pendente substitui o primeiro,
 *    porque só o último interessa;
 * 3. o resultado de uma execução que já tem sucessor é **descartado**: mostrá-lo faria a tela
 *    piscar num estado que já se sabe obsoleto.
 *
 * Fica fora do React de propósito. É uma máquina de estados de três casos, e testá-la aqui é mais
 * barato e mais completo do que exercitá-la através de um componente.
 */

export interface Coalescer {
  /** Pede uma execução. Devolve quando **esta cadeia** de execuções terminar. */
  request(): Promise<void>;
  /** `true` enquanto houver execução em curso. */
  readonly running: boolean;
  /** `true` quando há um pedido esperando o fim da execução atual. */
  readonly pending: boolean;
}

export interface CoalescerOptions<T> {
  /** O trabalho de verdade. */
  run: () => Promise<T>;
  /**
   * Recebe o resultado que **vale**.
   *
   * Só é chamado quando a execução terminou sem sucessor. É esta condição que implementa
   * "intermediário é descartado" — não há filtro depois, o resultado obsoleto simplesmente não
   * chega a ser entregue.
   */
  commit: (result: T) => void;
  /** Recebe a falha que vale, pela mesma regra. */
  fail?: (error: unknown) => void;
}

export function createCoalescer<T>(options: CoalescerOptions<T>): Coalescer {
  let running = false;
  let pending = false;

  async function drain(): Promise<void> {
    running = true;
    try {
      // Laço, e não recursão: uma sequência longa de pedidos não deve empilhar quadros. Em
      // digitação rápida com `Ctrl+Enter`, "longa" acontece.
      for (;;) {
        pending = false;
        try {
          const result = await options.run();
          // `pending` foi religado durante o `await`? Então este resultado já nasceu velho.
          if (!pending) options.commit(result);
        } catch (error) {
          if (!pending) options.fail?.(error);
        }
        if (!pending) return;
      }
    } finally {
      running = false;
      pending = false;
    }
  }

  return {
    async request(): Promise<void> {
      if (running) {
        // Um segundo pendente substitui o primeiro: os dois pedem "compile o estado atual", e
        // enfileirar os dois faria o `pdflatex` rodar duas vezes para a mesma entrada.
        pending = true;
        return;
      }
      await drain();
    },
    get running() {
      return running;
    },
    get pending() {
      return pending;
    },
  };
}
