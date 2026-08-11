# Beta Editorial — matriz Design → Código

> Entrada: design aprovado `LatexBookBank Beta Editorial.dc.html`
> (projeto Claude Design `e62474e6-3359-40ba-b6fb-0fd57640d89d`) e
> `docs/prompts/02_Time_Implementacao_LatexBookBank_Beta_Editorial.md`.

O design é a **North Star visual e comportamental**. Ele não define arquitetura, schema nem
implementação — isso continua sendo o que já existe no repositório (`README.md` §Convenções).

---

## 1. A pergunta da §91

> **Qual ação real do usuário ficou possível depois deste trabalho?**

Abrir a aplicação com o banco limpo e sair dela com uma questão auditável no acervo:

```text
criar biblioteca → cadastrar livro → abrir → criar capítulo → criar grupo
→ criar questão (escolha simples · múltipla escolha · discursiva)
→ editar LaTeX → alternativas → gabarito → autosave → validar
→ fechar → reabrir pelo Início → continuar de onde parou
```

E o caminho da captura, no mesmo acervo:

```text
colar/subir imagem ou PDF → recortar → reconhecer → revisar e corrigir
→ escolher destino → criar questão → abrir no editor
→ recarregar → a origem continua ligada (arquivo, página, recorte, modelo, LaTeX cru)
```

Sem seed obrigatório, sem Prisma Studio, sem `curl`, sem copiar LaTeX entre telas.

## 2. Matriz de estado (a auditoria curta da §3)

| Capacidade                            | Estado ao começar   | Estado agora |
| ------------------------------------- | ------------------- | ------------ |
| Workbench de seis zonas               | já existia          | preservado, com rail navegando |
| Árvore, filtro, DnD, lixeira          | já existia          | preservado; nó selecionado agora **aparece** |
| Editor Monaco + autosave (5 estados)  | já existia          | preservado |
| Alternativas e gabarito               | já existia          | semântica por tipo (rádio/caixa) |
| Validação por tipo                    | já existia          | agora **diz o motivo** na tela |
| Preview rápido / render worker        | já existia          | preservado |
| Recorte + reconhecimento              | já existia          | agora vira questão |
| Proveniência (`SourceAnchor`)         | já existia          | agora registra a execução do OCR |
| IA governada (proposta → diff)        | já existia          | preservado |
| Busca global                          | endpoint sem destino | **navega** até a questão |
| Biblioteca (criar, abrir, renomear)   | não existia         | feito |
| Publicação (cadastrar, editar)        | só leitura          | feito |
| Home real (sem `demo`)                | não existia         | feito |
| `CreateQuestion` atômico              | não existia         | feito |
| Menu `+ Adicionar`                    | não existia         | feito |
| `Candidate → Question`                | não existia         | feito |
| Importar `.lbb`                       | endpoint sem tela   | tela feita |
| Fila de captura                       | —                   | feita, **sem tabela nova** — derivada dos recortes |
| Calibre                               | —                   | spike, adapter, wizard e E2E — feito |

## 3. Progresso por slice (§58)

| Slice                       | Código | Testes | E2E | Browser | Status |
| --------------------------- | ------ | ------ | --- | ------- | ------ |
| 1 · Acervo do zero          | ✓      | ✓ 26   | ✓   | ✓       | pronto |
| 2 · Estrutura editorial     | ✓      | ✓      | ✓   | ✓       | pronto |
| 3 · CreateQuestion          | ✓      | ✓ 12   | ✓   | ✓       | pronto |
| 4 · Editor real             | ✓      | ✓      | ✓   | ✓       | já existia |
| 5 · Validação               | ✓      | ✓ 8    | ✓   | ✓       | pronto |
| 6 · Origem e proveniência   | ✓      | ✓      | ✓   | ✓       | pronto |
| 7 · Capture Studio          | ✓      | ✓ 8    | ✓   | ✓       | pronto |
| 8 · Candidate → Question    | ✓      | ✓ 9    | ✓   | ✓       | pronto |
| 9 · Fila de captura         | ✓      | ✓ 8    | ✓   | ✓       | pronto |
| 10 · Calibre                | ✓      | ✓ 27   | ✓   | ✓       | pronto, validado contra biblioteca real |

## 4. Matriz Design → Código (§92)

| Frame / fluxo            | Rota / componente                              | Caso de uso                       | API                                          | Persistência          | Teste |
| ------------------------ | ---------------------------------------------- | --------------------------------- | -------------------------------------------- | --------------------- | ----- |
| Home vazia / recorrente  | `app/page.tsx` · `home-screen.tsx`             | `readHomeOverview`                | —                                            | leitura               | `relative-time`, E2E |
| Criar biblioteca         | `create-library-dialog.tsx`                    | `createLibrary`                   | `POST /api/libraries`                        | `Workspace`           | `manage-libraries` |
| Biblioteca               | `app/bibliotecas/[slug]`                       | —                                 | —                                            | leitura               | E2E |
| Adicionar livro          | `library-screen.tsx` (modal)                   | —                                 | —                                            | —                     | E2E |
| Cadastro manual          | `bibliotecas/[slug]/livros/novo`               | `createPublication`               | `POST /api/libraries/[id]/publications`      | `Publication`+autores | `publication-draft` |
| Importar `.lbb`          | `app/importar`                                 | `toRuntime` + `writeImported…`    | `POST /api/workspaces/import`                | workspace inteiro     | `portable-archive` |
| Publicações (catálogo)   | `app/publicacoes`                              | `listPublicationCatalog`          | `GET /api/publications`                      | leitura               | E2E |
| Calibre — catálogo       | `bibliotecas/[slug]/livros/calibre`            | `browseCatalog`                   | `POST /api/catalog`                          | leitura               | `calibre-catalog`, `calibre-search` |
| Calibre — importar       | idem                                           | `importFromCatalog`               | `POST /api/catalog/import`                   | `Publication`+assets  | `import-from-catalog`, E2E |
| Fila de captura          | `CaptureQueuePanel`                            | `pendingQueue` · `stateOf`        | `GET/DELETE …/capture-queue`                 | derivada de `SourceAnchor` | `capture-queue`, E2E |
| Lixeira                  | `trash-dialog.tsx`                             | `restoreNode`                     | `GET …/trash` · `POST …/nodes/[id]/restore`  | `deletedAt`           | `mutate-tree`, E2E |
| Livro vazio              | `publication-workbench.tsx` (EmptyState)       | —                                 | —                                            | —                     | E2E |
| Menu `+ Adicionar`       | `add-menu.tsx`                                 | `placementForAdd`                 | —                                            | —                     | `create-question` |
| Criar estrutura          | árvore                                         | `createNode`                      | `POST …/nodes`                               | `DocumentNode`        | `mutate-tree` |
| Criar questão            | `add-menu.tsx` · `use-tree-editing`            | `createQuestion`                  | `POST …/questions`                           | `Question`+nó+opções  | `create-question` |
| Escolha simples          | `OptionsEditor` (rádio)                        | `patchesForCorrect(exclusive)`    | `PATCH …/options/[id]`                       | `QuestionOption`      | `question-type-plugin` |
| Múltipla escolha         | `OptionsEditor` (caixa)                        | `multipleCorrectPlugin`           | idem                                         | idem                  | `multiple-correct` |
| Discursiva               | editor sem aba de alternativas                 | `discursivePlugin`                | —                                            | —                     | `question-type-plugin` |
| Editor + autosave        | `question-editor.tsx`                          | `saveQuestion`                    | `PATCH …/questions/[id]`                     | `Question`            | `save-question`, E2E |
| Validação                | `ValidationPane`                               | `evaluateQuestion` + `buildChecklist` | `POST …/questions/[id]/validation`       | `validationStatus`    | `validation-checklist` |
| Capture Studio           | `IngestionPanel` · `PdfCropViewer`             | `storeAsset` · `normalizeAnchor`  | `POST /api/assets`, `/api/assets/crop`       | `Asset`+`SourceAnchor`| `ingestion-panel`, E2E |
| Reconhecimento           | `IngestionPanel`                               | `VisionMathRecognizer`            | `POST /api/recognition`                      | nada (candidato)      | `recognition` |
| Revisão estruturada      | `ingestion-screen.tsx`                         | `approveCandidate`                | —                                            | nada                  | `create-question-from-recognition` |
| Candidate → Question     | `ingestion-screen.tsx`                         | `createQuestionFromRecognition`   | `POST …/questions/from-recognition`          | questão + proveniência| idem, E2E |
| Origem                   | `OriginPanel`                                  | `readProvenance`                  | `GET /api/questions/[id]/origin`             | leitura               | `origin-panel`, E2E |
| Busca global             | `CommandPalette` · `app/questoes/[id]`         | `findQuestionLocation`            | `GET /api/search`                            | leitura               | `search-query` |
| Preview / render         | `PreviewPane` · `RenderPanel`                  | `executeRender`                   | `POST …/render`                              | `RenderJob`+artefatos | `execute-render` |
| IA governada             | `AgentPanel` · `PatchReviewPanel`              | `runAgentTurn` · `applyPatch`     | `/api/agents/*`                              | `AgentRun`+`Revision` | `run-agent-turn`, E2E |

## 5. Gaps declarados

### P1 — não bloqueiam o Beta

- **Ações contextuais sobre questão existente** (§25 do prompt): inserir no cursor, adicionar
  alternativa a partir de recorte, salvar como figura. "Salvar como figura" já funciona pela aba
  Origem; os outros dependem da fila para valerem a pena.
- **Reconhecimento de questão completa** (§22): o modo `full-question` que devolve enunciado e
  alternativas separados. Hoje o recorte vira enunciado, e as alternativas se preenchem à mão.
  O contrato (`ApprovedCandidate.options`) já aceita — falta o provider produzir.

### P1 — o que o Calibre ainda não faz

- Só o **PDF** é copiado como fonte. EPUB e MOBI aparecem na lista e ficam no Calibre — o contrato
  aceita outros formatos (`formats` no comando), e falta a tela oferecer a escolha.
- Não há **importação em lote**. Um livro por vez, que é o ritmo de quem revisa metadados.

### P2 — evolução

- Import legado em volume (§56). O caminho existe desde a Fase 11 e não foi exercitado contra as
  13 bibliotecas.
- "Excluir a questão preservando o nó" não existe (§32). A semântica escolhida é **soft delete do
  agregado**: excluir o nó leva a descendência e a questão, e restaurar traz tudo de volta na
  mesma posição — com teste E2E. Separar as duas exclusões seria oferecer um nó de questão sem
  questão, que é justamente o estado que a §32 quer evitar. Ninguém pediu o contrário.

## 6. Known limitations

- **A validação não roda sozinha na tela.** Ela roda a cada salvamento e grava o selo; a lista de
  verificação aparece quando se pede. É deliberado (§25): uma tela que se autoavalia a cada visita
  transforma conferir em ruído de fundo.
- **O `%` do reconhecimento de texto** continua sendo o risco mais caro do OCR — ele comenta o
  resto da linha. O escape existe (`latex-escape`) e tem teste; o que não existe é aviso na tela
  quando o modelo devolve um `%` não escapado.
- **`Ctrl+V` de imagem** funciona na tela de captura (`AssetDropzone` com `listenToPaste`), não no
  editor. Colar screenshot direto no Monaco não foi implementado.
- **A fila não guarda o `recognizing`.** Ele dura segundos e vive no cliente. Persistir um estado
  transitório traria o problema que ele resolve — uma linha travada em "reconhecendo" para sempre
  porque o servidor caiu no meio.
- **O arquivo aberto no Capture Studio não sobrevive ao recarregamento** — só o **recorte**. É a
  promessa certa: o que o produto guarda é o pedaço de página que virou trabalho, não a sessão de
  upload.
- **O E2E de captura usa provider dublê**, por exigência da §42. O provider real (`gemma3:12b` via
  Ollama) é exercitado à mão e pelos testes de unidade do `VisionMathRecognizer`.
- **A árvore revela o caminho do nó selecionado sem gravar essa abertura.** Fechar o ramo à mão
  fecha; selecionar outro nó zera a decisão. É o comportamento que os testes fixam.

## 7. Vocabulário

O produto diz **Biblioteca**; o schema diz `Workspace`. São a mesma coisa — o nome interno vem do
import legado (`IdBiblio`), e trocá-lo agora seria migração sem ganho. A UI nunca diz "workspace".

O mesmo vale para os tipos de questão: `MULTIPLE_CHOICE` é **Escolha simples** (uma correta) e
`MULTIPLE_CORRECT` é **Múltipla escolha** (uma ou mais). Os nomes internos vêm do mapa do import
legado; os rótulos são os do design.
