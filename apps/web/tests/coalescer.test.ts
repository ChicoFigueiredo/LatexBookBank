import { describe, expect, it } from "vitest";

import { createCoalescer } from "@modules/rendering/domain/coalescer";

/**
 * Um `run` controlado à mão.
 *
 * Sem temporizador: o teste decide **quando** cada execução termina, o que é o único jeito de
 * exercitar "chegou um pedido no meio da execução" de forma determinística.
 */
function controlled() {
  const resolvers: ((value: string) => void)[] = [];
  const rejecters: ((error: unknown) => void)[] = [];
  let started = 0;

  return {
    get started() {
      return started;
    },
    run: () =>
      new Promise<string>((resolve, reject) => {
        started += 1;
        resolvers.push(resolve);
        rejecters.push(reject);
      }),
    finish: (index: number, value: string) => resolvers[index]?.(value),
    fail: (index: number, error: unknown) => rejecters[index]?.(error),
  };
}

describe("createCoalescer", () => {
  it("executa na hora quando não há nada rodando", async () => {
    const control = controlled();
    const committed: string[] = [];
    const coalescer = createCoalescer({ run: control.run, commit: (v) => committed.push(v) });

    const done = coalescer.request();
    control.finish(0, "a");
    await done;

    expect(committed).toEqual(["a"]);
  });

  it("**o estado final é o do último pedido**", async () => {
    // É o critério da fase, e a razão de este arquivo existir: a versão anterior ignorava o
    // pedido concorrente, o que descartava justamente o último — e a pessoa ficava olhando o PDF
    // anterior concluindo que o produto não atualizou.
    const control = controlled();
    const committed: string[] = [];
    const coalescer = createCoalescer({ run: control.run, commit: (v) => committed.push(v) });

    const first = coalescer.request();
    await coalescer.request(); // chega no meio da primeira
    control.finish(0, "antigo");
    await Promise.resolve();
    control.finish(1, "novo");
    await first;

    expect(committed).toEqual(["novo"]);
  });

  it("descarta o resultado intermediário em vez de mostrá-lo", async () => {
    // Mostrar faria a tela piscar num estado que já se sabe obsoleto.
    const control = controlled();
    const committed: string[] = [];
    const coalescer = createCoalescer({ run: control.run, commit: (v) => committed.push(v) });

    const done = coalescer.request();
    await coalescer.request();
    control.finish(0, "intermediario");
    await Promise.resolve();
    control.finish(1, "final");
    await done;

    expect(committed).not.toContain("intermediario");
  });

  it("três pedidos durante uma execução geram **uma** reexecução, não três", async () => {
    // Os pedidos pendentes pedem todos a mesma coisa — "compile o estado atual". Enfileirá-los
    // faria o `pdflatex` rodar três vezes para a mesma entrada.
    const control = controlled();
    const coalescer = createCoalescer({ run: control.run, commit: () => {} });

    const done = coalescer.request();
    await coalescer.request();
    await coalescer.request();
    await coalescer.request();

    control.finish(0, "a");
    await Promise.resolve();
    control.finish(1, "b");
    await done;

    expect(control.started).toBe(2);
  });

  it("falha intermediária também é descartada", async () => {
    const control = controlled();
    const failures: unknown[] = [];
    const committed: string[] = [];
    const coalescer = createCoalescer({
      run: control.run,
      commit: (v) => committed.push(v),
      fail: (e) => failures.push(e),
    });

    const done = coalescer.request();
    await coalescer.request();
    control.fail(0, new Error("erro velho"));
    await Promise.resolve();
    control.finish(1, "ok");
    await done;

    expect(failures).toEqual([]);
    expect(committed).toEqual(["ok"]);
  });

  it("falha final é entregue", async () => {
    const control = controlled();
    const failures: unknown[] = [];
    const coalescer = createCoalescer({
      run: control.run,
      commit: () => {},
      fail: (e) => failures.push(e),
    });

    const done = coalescer.request();
    control.fail(0, new Error("caiu"));
    await done;

    expect(failures).toHaveLength(1);
  });

  it("volta ao repouso depois de drenar", async () => {
    const control = controlled();
    const coalescer = createCoalescer({ run: control.run, commit: () => {} });

    const done = coalescer.request();
    expect(coalescer.running).toBe(true);
    control.finish(0, "a");
    await done;

    expect(coalescer.running).toBe(false);
    expect(coalescer.pending).toBe(false);
  });

  it("uma sequência longa não empilha quadros", async () => {
    // Laço e não recursão: em digitação rápida com `Ctrl+Enter`, "longa" acontece.
    const control = controlled();
    const committed: string[] = [];
    const coalescer = createCoalescer({ run: control.run, commit: (v) => committed.push(v) });

    const done = coalescer.request();
    for (let i = 0; i < 200; i += 1) {
      await coalescer.request();
      control.finish(i, `v${i}`);
      await Promise.resolve();
    }
    control.finish(200, "ultimo");
    await done;

    expect(committed).toEqual(["ultimo"]);
  });
});
