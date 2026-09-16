# Auditoria do scan estrutural

*Fase 0 do [prompt 03](../prompts/) · issue #205 · 2026-09-16.* O que existia antes do módulo de
scan estrutural, o que o PR #201 deixava, o que o segmentador do TRI ensina, e as decisões
tomadas quando o prompt e o repositório não concordavam. As decisões estão no
[planejamento §3.7](./_planejamento.md) (D45–D54) e nos ADRs [0002](../adr/0002-tipos-do-scan-no-acervo.md)
e [0003](../adr/0003-ancoras-do-no.md).

## 1. O repositório antes do scan

| Assunto | Estado encontrado |
|---|---|
| Camadas | `src/modules/<módulo>/{domain,application,infrastructure,ui}`; rotas em `app/api/**` instanciam adaptadores e passam `deps` ao caso de uso. Sem container de DI. |
| Fronteiras | `tests/boundary-count.test.ts` conta as interfaces com verbo em `src/shared/ports`: `StorageProvider`, `RenderExecutor`, `AiProvider`, `MathRecognitionProvider`, `LibraryCatalogProvider`. Interfaces dentro de um módulo não contam. |
| Lint | `eslint.boundaries.mjs`: domínio não importa Prisma, Next, fs, processo, SDK de storage ou de IA, nem `@infrastructure`; UI não importa Prisma. |
| `AiProvider` | `run(request)`, `listModels()`, `stream?()`; uma implementação OpenAI-compatible (OpenRouter, OpenAI, Ollama). |
| `MathRecognitionProvider` | `recognize({image, mimeType, mode})` → `{latex, confidence, alternatives, providerId, model, durationMs}`; implementado por `VisionMathRecognizer`, modelo em `AI_VISION_MODEL`. |
| Proveniência | `SourceAnchor` com página e caixa normalizada 0..1; `DocumentNode.sourceAnchorId` e `Question.sourceAnchorId`, **uma âncora cada**. |
| Schema | SQLite, sem `enum` e sem `Json` (vocabulário é `String` validado em TypeScript). Nenhuma tabela de fila, lote ou execução de scan. `DocumentNode` sem corpo (ADR 0001 ainda não implementado). |
| Segmentação | `recognition/domain/segmentar-pagina.ts`: função pura sobre as palavras de uma página, marcador `1.` / `Questão N` na margem esquerda, maior sequência crescente, rodapé por vão. **Uma coluna só.** 30 de 30 no ENA (`tests/fixtures/profmat-ena-2023-p1-p2.json`). |
| Leitura do PDF | Só no navegador (`assets/ui/pdf-text-layer.ts`, `pdfjs-dist` 6.2). |
| Lote de 02/09 | Laço no React, uma página por vez: recorta, grava `Asset(CROP)` + `SourceAnchor`, reconhece. Não cria questão, não é retomável nem idempotente. |
| Fila de captura | Derivada das âncoras (`capture-queue.ts`), sem tabela: aguardando · revisar · erro · aprovado. |
| Perfil de captura (D41) | Decidido, **não implementado**: nenhum `CaptureProfile`, nenhum `captureProfileId`. |

## 2. O PR #201 (`feat/source-scan-plugin`)

Cinco arquivos novos, nenhum alterado, 61 commits atrás da `main` e sem conflito. Entrega tipos
(`SourceScanProfilePlugin`, `ScanNodeProposal` com `regions[]`), um registro que se preenche ao
ser importado, e um `book-v1` de expressões regulares com quatro testes. **Nada o executa.**

Defeitos: a regex de grupo de exercícios casa "Exercício 12" antes da de exercício (o teste
falha); o teste omite `pageNumber`, obrigatório (o typecheck falha); `/^\d+(?:\.\d+){0}\s+\S+/`
faz de toda linha "número espaço palavra" um capítulo.

**O que se aproveita:** a ideia de várias regiões por nó e a tabela de quem contém quem. **O que
não:** a detecção por regex solta (o motor parte da geometria, como a `segmentar-pagina`), o
registro por efeito colateral de import (o repositório prefere registro explícito), e o
`HeadingEvidence` sem coordenadas. O trabalho segue em `feat/scan-estrutural`, a partir da
`main`; o #201 será fechado apontando para o PR novo, depois de o autor vê-lo.

## 3. O que o segmentador do TRI ensina

`Estacio-TCC-Estacio-Matematica/pipeline-notas/src/enem/recorte/`, 98,3% de 2.775 questões
completas em 30 cadernos (2011–2025), zero invasões.

1. **Âncora é linha, não bloco.** O bloco do PyMuPDF juntava "Questão 176" com as alternativas da
   175 e começava o recorte 87 pt acima.
2. **Divisor de colunas pelos cabeçalhos**, não por vale de espaço em branco: os x0 das âncoras
   agrupados (tolerância 10 pt, pelo menos 3 por grupo); a calha real mede 3–8 pt, e um diagrama
   de química já abriu um vão maior que ela.
3. **Layout por página**: duas colunas só com o divisor dentro da mancha, ≥ 3 linhas de cada lado
   e no máximo 5% das linhas cruzando a calha (um título centrado cruza).
4. **Ordem de leitura** = (página, coluna, y). Um elemento vai da sua âncora ao próximo limite
   semântico nessa ordem; atravessar coluna ou página não é caso especial.
5. **Ajuste ao conteúdo**: o segmento encolhe até o texto e as figuras (±3 pt), pode alargar para
   uma figura mais larga que a coluna, e para no texto da coluna vizinha. Fim a 1 pt da próxima
   âncora — com 4 pt, a alternativa E sumia.
6. **Alternativas A–E** como sequência na mesma margem (±4 pt), letra repetida ignorada (os
   cadernos de 2022 em diante trazem cada alternativa duas vezes).
7. **Mobília** por assinatura (posição em passos de 5 pt, texto sem acento, dígitos como `#`) em
   ≥ max(3, 40% das páginas); cabeçalhos de questão nunca contam, ou "Questão 94" e "Questão 108"
   seriam a mesma linha.
8. **Marcos de área** como limite; **inglês e espanhol** decididos pelo marco impresso que cobre o
   número, não pela ordem.
9. **Diagnóstico** com motivos: completo · suspeito · sem evidência · incompleto.
10. **Testes** sobre uma prova sintética gerada, com gabarito de leitura; o PDF real é pulado
    quando ausente.

O que muda em TypeScript: o pdf.js entrega trechos, não linhas — o motor as monta com a marca de
fim de linha (`hasEOL`) e a ordem do conteúdo; desenhos vêm da lista de operadores
(`constructPath` traz a caixa); e o texto precisa de NFC antes de qualquer expressão regular.

## 4. Onde o prompt e o repositório divergiam

| Prompt 03 | Repositório | Decisão |
|---|---|---|
| Scanner → proposta → revisão → domínio | D39: o scan cria questões *a revisar* | **D45**: proposta separada; aprovação em lote cria nós e questões `DRAFT` |
| Estados `AUTO_ACCEPTABLE`… no domínio | D40: *a revisar* é derivado, sem enum novo | Os estados vivem na **proposta**, não na questão; a D40 continua |
| Contrato de plugin com funções | D41: oito campos declarativos | **D46**: os oito campos + ganchos opcionais |
| Criar parte, capítulo e seção pelos títulos | Wave G: fora | Dentro, porque a aprovação protege o acervo (D45) |
| Workspace em três colunas | D43: sem terceira coluna no editor | **D47**: tela própria; no editor, *Ver fonte* com todas as âncoras |
| `DocumentNodeSource` + `QuestionSource` | `sourceAnchorId` singular nos dois | **D50 / ADR 0003**: uma tabela, do nó |
| Enriquecer `NodeKind` só se preciso | `NodeKind` com dez valores | **ADR 0002**: a proposta fala mais tipos; a aprovação traduz |
| Processar 600 páginas sem uma requisição | Leitura do PDF só no navegador | **D49**: servidor, página a página, com ponto de parada |
| "plugin", "digitalização", "região" | Glossário: perfil de captura, scan, âncora | Termos do glossário; "plugin" é o mecanismo |
| Pastas `source-scanning/` | Código novo em português | **D54**: `modules/scan`, identificadores em inglês, por decisão do autor |
