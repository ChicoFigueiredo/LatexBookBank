# Beta Editorial — matriz Design → Código

> Entrada: design aprovado `LatexBookBank Beta Editorial.dc.html`
> (projeto Claude Design `e62474e6-3359-40ba-b6fb-0fd57640d89d`) e
> `docs/prompts/02_Time_Implementacao_LatexBookBank_Beta_Editorial.md`.

O design é a **North Star visual e comportamental**. Ele não define arquitetura, schema nem
implementação — isso continua sendo o que já existe no repositório (`README.md` §Convenções).

---

## 1. Matriz de estado (auditoria curta, §3 do prompt)

| Capacidade                       | Estado         | Onde                                                             |
| -------------------------------- | -------------- | ---------------------------------------------------------------- |
| Workbench de seis zonas          | já existe      | `design-system/shell/Workbench.tsx`                              |
| Árvore, filtro, DnD, lixeira     | já existe      | `design-system/navigation/Tree.tsx`, `document-tree/`            |
| Editor Monaco + autosave         | já existe      | `modules/latex/ui`, `app/publications/[id]/question-editor.tsx`  |
| Alternativas e gabarito          | já existe      | `modules/questions/ui/OptionsEditor.tsx`, `option-mutations.ts`  |
| Validação por tipo               | já existe      | `questions/domain/plugins/`                                      |
| Preview rápido / render worker   | já existe      | `modules/preview/`, `modules/rendering/`                         |
| Recorte + reconhecimento         | já existe      | `modules/recognition/`, `modules/assets/`                        |
| Proveniência (SourceAnchor)      | já existe      | `schema.prisma:SourceAnchor`, `modules/assets/ui/OriginPanel`    |
| IA governada (proposta → diff)   | já existe      | `modules/agents/`                                                |
| Busca global                     | precisa integrar | `app/api/search` existe; a paleta não navega até a questão     |
| **Biblioteca (criar/abrir)**     | **precisa criar** | não havia caso de uso nem UI — só `listWorkspaces` para backup |
| **Publicação (cadastrar)**       | **precisa criar** | repositório era somente leitura                              |
| **Home real (sem `demo`)**       | **precisa criar** | `app/page.tsx` listava o workspace `demo` hardcoded          |
| **CreateQuestion atômico**       | **precisa criar** | questão só nascia por seed/import legado                     |
| Menu `+ Adicionar` (estrutura/questões) | precisa criar | a árvore só criava nó genérico "Novo nó"                  |
| Candidate → Question             | precisa criar  | o OCR devolve texto; ninguém persiste questão a partir dele      |
| Fila de captura                  | fica para depois | P1 — só depois do fluxo unitário                               |
| Calibre                          | fica para depois | P1 — spike documentada antes do wizard                         |

## 2. Progresso por slice (§58)

| Slice                       | Código | Testes | E2E | Browser | Status  |
| --------------------------- | ------ | ------ | --- | ------- | ------- |
| 1 · Acervo do zero          | —      | —      | —   | —       | a fazer |
| 2 · Estrutura editorial     | —      | —      | —   | —       | a fazer |
| 3 · CreateQuestion          | —      | —      | —   | —       | a fazer |
| 4 · Editor real             | —      | —      | —   | —       | a fazer |
| 5 · Validação               | —      | —      | —   | —       | a fazer |
| 6 · Origem e proveniência   | —      | —      | —   | —       | a fazer |
| 7 · Capture Studio          | —      | —      | —   | —       | a fazer |
| 8 · Candidate → Question    | —      | —      | —   | —       | a fazer |
| 9 · Fila de captura         | —      | —      | —   | —       | a fazer |
| 10 · Calibre                | —      | —      | —   | —       | a fazer |

## 3. Matriz Design → Código (§92)

| Frame/Fluxo        | Rota/Componente | Use Case | API | Persistência | Teste |
| ------------------ | --------------- | -------- | --- | ------------ | ----- |
| (preenchida por slice, conforme entra) |

## 4. Vocabulário

O produto diz **Biblioteca**; o schema diz `Workspace`. São a mesma coisa — o nome interno vem do
import legado (`IdBiblio`), e trocá-lo agora seria migração sem ganho. A UI nunca diz "workspace".
