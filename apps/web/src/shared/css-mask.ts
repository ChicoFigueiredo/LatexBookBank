/**
 * SVG como **máscara CSS**, e não como HTML injetado.
 *
 * Usado pela palette de símbolos e pelo preview rápido, que enfrentam o mesmo problema: desenhar
 * um SVG vindo de fora — do acervo legado num caso, do MathJax no outro — sem abrir a porta que
 * `dangerouslySetInnerHTML` abre.
 *
 * Máscara resolve as duas exigências de uma vez. Um SVG usado como imagem **não executa script**,
 * o que é estritamente mais forte do que sanitizar: sanitizer é uma lista do que se conhece hoje;
 * não interpretar é uma propriedade. E, diferente de `<img>`, a cor vem do `background` do
 * elemento — então `currentColor` funciona e o desenho segue o tema.
 *
 * Fica em `shared/` porque é dos dois módulos e de nenhum: pendurá-lo em qualquer um faria o
 * outro depender de um domínio que não é o seu.
 */

/**
 * `encodeURIComponent` e não base64: o SVG é texto, a URI resultante é legível no DevTools, e
 * base64 ainda cresceria 33% sobre um conteúdo que já é o gargalo de uma tela cheia de fórmulas.
 */
export const maskUrlFor = (svg: string): string =>
  `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
