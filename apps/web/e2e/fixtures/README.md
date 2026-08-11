# Fixtures dos E2E

Conteúdo **sintético**, gerado por código, e redistribuível (§83 e §84 do prompt do time).
Nenhum trecho de livro protegido entra aqui: um E2E que dependesse de página escaneada de obra
com direitos não poderia ser versionado nem rodado por quem clonasse o repositório.

| Arquivo                 | O que é                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `questao-sintetica.png` | 480×180, preto sobre branco: três barras de "enunciado" e três de "alternativa". Geometria suficiente para recortar; nenhum texto real. |

O reconhecimento não roda contra modelo nenhum nos E2E — `POST /api/recognition` é interceptado e
responde um candidato fixo. É a exigência da §42: **não usar modelo real em CI**. O provider de
verdade é exercitado à parte, com o Ollama de pé.
