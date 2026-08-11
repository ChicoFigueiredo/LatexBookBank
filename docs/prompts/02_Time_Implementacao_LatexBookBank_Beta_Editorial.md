# LatexBookBank — Prompt para o Time de Desenvolvimento
## Implementar o Beta Editorial a partir do Design Final aprovado

> **Use este documento somente depois da rodada final de ajustes no Claude Design.**
>
> **Repositório:** `https://github.com/ChicoFigueiredo/LatexBookBank`  
> **Branch de referência:** `main`  
> **Entrada principal:** design/protótipo final aprovado  
> **Objetivo:** transformar o design aprovado em software real, preservando a arquitetura existente e fechando a jornada editorial de ponta a ponta.

---

# 1. Contrato de trabalho

O design final passa a ser a **North Star visual e comportamental do Beta Editorial**.

Ele define:

- modelo mental;
- jornada;
- hierarquia;
- interações;
- estados;
- CTAs;
- comportamento esperado do usuário.

Ele **não define**:

- arquitetura interna;
- schema final;
- implementação HTML/CSS;
- biblioteca de ícones;
- dependências;
- nomes internos;
- detalhes do provider.

A regra é:

> **implementar a experiência aprovada usando e evoluindo a arquitetura já existente do LatexBookBank.**

Não copiar o protótipo literalmente.

Não criar um frontend paralelo.

Não trocar o design system.

Não recomeçar a arquitetura.

---

# 2. Objetivo do Beta Editorial

Ao final, o usuário deve conseguir:

```text
Abrir aplicação
→ criar biblioteca
→ cadastrar/importar livro
→ criar estrutura
→ criar questão manual
→ colar screenshot
→ recortar
→ reconhecer
→ revisar
→ criar questão
→ editar LaTeX
→ marcar gabarito
→ renderizar
→ validar
→ fechar
→ abrir novamente
→ continuar
```

Sem:

- seed obrigatório;
- Prisma Studio;
- alteração manual do banco;
- copiar LaTeX entre telas;
- scripts para criar Question;
- mocks de UI;
- workspace `demo` hardcoded.

---

# 3. Primeiro passo obrigatório

Antes de alterar código:

1. atualizar `main`;
2. rodar setup;
3. rodar testes existentes;
4. subir a aplicação;
5. navegar no browser;
6. revisar:
   - `README.md`;
   - planejamento;
   - checklist;
   - design system;
   - publications;
   - document-tree;
   - questions;
   - assets;
   - recognition;
   - latex;
   - rendering;
   - agents;
   - portability;
   - assessments;
7. comparar estado atual com o design aprovado.

Produzir rapidamente uma matriz:

```text
já existe
precisa integrar
precisa criar
fica para depois
```

Não iniciar outra auditoria longa.

---

# 4. Arquitetura a preservar

Preservar:

```text
UI
→ Route Handler
→ Use Case
→ Domain
→ Repository / Provider
→ Infra
```

Preservar boundaries existentes:

- Repository;
- StorageProvider;
- RenderExecutor;
- AiProvider.

Preservar princípios:

- local-first;
- SQLite;
- cloud-ready;
- derivação PostgreSQL;
- worker de render;
- storage abstrato;
- Monaco;
- revisão humana;
- IA governada.

---

# 5. PostgreSQL readiness

Qualquer evolução de schema deve continuar compatível com:

- SQLite local;
- derivação Postgres;
- domínio independente de engine.

Rodar validações de derivação após migrations relevantes.

Não reintroduzir problemas de ordenação já identificados no relatório de compatibilidade.

---

# 6. Design system

Implementar o design aprovado sobre:

```text
apps/web/src/design-system/
```

Reutilizar sempre que possível:

- Workbench;
- Tree;
- Button;
- IconButton;
- Input;
- Field;
- Select;
- Checkbox;
- Toggle;
- Combobox;
- Badge;
- StatusDot;
- Chip;
- ArtifactStatus;
- EmptyState;
- Callout;
- Banner;
- Modal;
- Toast;
- Tabs;
- Segmented;
- Breadcrumb;
- PageHeader;
- CommandPalette;
- Tooltip;
- Popover;
- ContextMenu.

Criar novos componentes apenas onde há um problema real.

---

# 7. O protótipo não é código de produção

Não copiar:

- inline styles;
- `contenteditable` como substituto do Monaco;
- Iconify remoto;
- Google Fonts remotas;
- arrays hardcoded;
- estado fake;
- rotas falsas;
- hacks específicos da demo.

Preservar local-first/offline.

---

# 8. Estratégia de implementação

Não dividir o projeto inicialmente em:

```text
frontend
backend
banco
```

Dividir por **fatias verticais demonstráveis**.

Cada slice deve entregar uma ação real que:

- funciona no browser;
- persiste;
- possui testes;
- possui aceite visível.

---

# 9. Slice 1 — Acervo do zero

## Jornada

```text
DB limpa
→ Home
→ Criar biblioteca
→ Criar livro manual
→ fechar
→ abrir
→ encontrar os dois
```

## Backend

Implementar casos de uso equivalentes a:

- CreateLibrary;
- RenameLibrary;
- CreatePublication;
- UpdatePublication.

Adaptar nomes ao domínio real.

## UI

Implementar:

- home vazia;
- create library;
- library;
- add book;
- manual publication form;
- livro vazio;
- overview.

## Aceite E2E

Reload não perde dados.

---

# 10. Slice 2 — Estrutura editorial

Jornada:

```text
Abrir livro
→ criar capítulo
→ criar seção/grupo
→ reordenar
→ reload
```

Preservar árvore genérica.

Adicionar affordance explícita:

```text
+ Adicionar

Estrutura
- Capítulo
- Seção
- Subseção
- Grupo de questões

Questões
- Escolha simples
- Múltipla escolha
- Discursiva
```

---

# 11. Slice 3 — CreateQuestion real

Este é P0 crítico.

Uma questão não deve nascer como apenas um `DocumentNode`.

Criar caso de uso atômico equivalente a:

```text
CreateQuestion
```

Ele deve criar consistentemente:

- Question;
- DocumentNode;
- posição;
- tipo;
- revisão inicial quando aplicável;
- alternativas iniciais quando necessário.

Usar transação.

Em falha:

- nenhum node órfão;
- nenhuma question órfã.

---

# 12. Tipos mínimos

Suportar:

### Escolha simples
Uma correta.

### Múltipla escolha
Uma ou mais corretas.

### Discursiva
Sem alternativas obrigatórias.

Manter extensibilidade para tipos futuros.

---

# 13. Alternativas

Invariantes:

- identidade independente da letra;
- letra deriva da posição;
- reorder preserva identidade;
- reorder preserva gabarito;
- escolha simples valida exatamente uma correta;
- múltipla permite múltiplas.

Adicionar testes específicos.

---

# 14. Slice 4 — Editor real

Fluxo:

```text
Nova questão
→ selecionar tipo
→ criar
→ abrir editor
→ editar
→ autosave
→ preview
→ render
→ reload
```

Preservar Monaco.

---

# 15. Autosave

Preservar estados:

- dirty;
- saving;
- saved;
- failed;
- conflict.

Testar:

- debounce;
- reload;
- concorrência;
- conflito.

---

# 16. Slice 5 — Validação

Implementar/ajustar validação para:

- enunciado vazio;
- alternativa vazia;
- ausência de correta;
- várias corretas em escolha simples;
- asset ausente;
- LaTeX inválido;
- render falho.

Mostrar problemas inline.

---

# 17. Slice 6 — Origem e proveniência

A proveniência deve ser tratada como dado de primeira classe.

Modelar adequadamente conceitos equivalentes a:

```text
SourceDocument
Page
Crop
Asset
```

Os nomes não são obrigatórios.

O que precisa ser preservado:

- arquivo;
- página;
- recorte;
- livro;
- asset;
- origem da importação.

## Aceite

Uma questão criada de PDF deve permitir:

```text
Origem
→ livro
→ arquivo
→ página
→ recorte
```

---

# 18. Não colocar tudo em Question

Evitar dezenas de campos ad hoc na tabela de Question.

A modelagem deve permitir:

- assets múltiplos;
- recortes;
- recognition runs;
- figuras;
- reprocessamento futuro.

---

# 19. Slice 7 — Capture Studio

Integrar o design aprovado ao que já existe.

Entradas:

- imagem;
- PDF;
- PDF associado ao livro;
- asset;
- drag/drop;
- `Ctrl+V`.

Reutilizar:

- upload;
- crop;
- recognition;
- storage.

Não reescrever capacidade já funcional.

---

# 20. RecognitionCandidate

Criar um contrato intermediário equivalente a:

```text
RecognitionCandidate
```

Conceitualmente pode carregar:

```text
source
mode
originalLabel
statement
blocks
options
answerCandidates
figures
confidence
warnings
rawRecognition
provider
model
duration
```

Essa estrutura é conceitual.

O time deve desenhar o contrato real após analisar o domínio.

A regra é:

> **OCR propõe; o domínio editorial só persiste após revisão.**

---

# 21. Modos de reconhecimento

Suportar conceitos equivalentes a:

- text;
- mixed;
- math/display;
- full-question;
- figure.

P0 continua sendo:

```text
crop manual
+
reconhecimento automático
```

Não bloquear o Beta esperando segmentação automática de páginas.

---

# 22. Reconhecimento de Questão Completa

Criar provider/use case capaz de retornar candidato estruturado com elementos como:

- enunciado;
- alternativas;
- número original;
- possível gabarito;
- warnings.

Se o modelo retornar estrutura imperfeita:

- validar;
- normalizar;
- manter raw;
- permitir correção humana.

---

# 23. Revisão humana

Fluxo obrigatório:

```text
OCR
→ candidate
→ review
→ approve
→ use case
→ persistence
```

Nunca:

```text
OCR → Question
```

sem aprovação.

---

# 24. Slice 8 — Candidate → Question

Implementar ação:

```text
Aceitar e criar questão
```

Caso de uso equivalente a:

```text
CreateQuestionFromRecognition
```

Responsabilidades:

- validar candidate;
- validar destino;
- criar Question;
- criar node;
- criar options;
- associar source;
- associar crop;
- associar assets;
- criar revisão inicial;
- retornar ID/rota navegável.

Em falha:

- crop não desaparece;
- candidate permanece recuperável.

---

# 25. Atualização de questão existente

Depois do fluxo de criação estar sólido, permitir ações contextuais:

- inserir no enunciado;
- inserir no cursor;
- adicionar alternativa;
- adicionar solução;
- salvar como figura.

Não implementar isso antes do caminho principal.

---

# 26. Slice 9 — Fila de captura

Depois do fluxo unitário:

```text
CaptureQueue
```

Estados:

- queued;
- recognizing;
- review;
- error;
- approved.

Persistir o suficiente para não perder trabalho.

Não criar infraestrutura distribuída desnecessária.

---

# 27. Calibre — spike primeiro

Antes de codificar o wizard inteiro, executar uma spike curta.

Responder:

1. como localizar biblioteca Calibre?
2. como ler `metadata.db`?
3. quais formatos?
4. Windows/Linux/WSL?
5. como app web local acessa diretório?
6. precisa helper local?
7. copiar ou referenciar arquivos?
8. como importar capa?
9. como preservar metadata?
10. como lidar com duplicidade?

Documentar decisão em Markdown curto.

---

# 28. Calibre deve ser adapter

Não contaminar domínio com:

- tabelas Calibre;
- IDs internos;
- paths específicos.

Criar boundary equivalente a:

```text
LibraryCatalogProvider
```

ou adapter específico.

Saída conceitual:

```text
PublicationDraft
```

---

# 29. Preferência de importação

Salvo impedimento técnico, preferir:

```text
Calibre
→ selecionar
→ copiar/importar asset para storage gerenciado
→ criar Publication
→ preservar metadata da origem
```

Vantagens:

- backup;
- `.lbb`;
- hash;
- portabilidade;
- consistência.

Se escolher referenciar arquivo externo, documentar tradeoff.

---

# 30. Slice 10 — Calibre funcional

Fluxo real:

```text
Selecionar biblioteca
→ catálogo
→ pesquisar
→ selecionar livro
→ revisar metadata
→ escolher fonte
→ importar
→ abrir Publication
```

Validar com biblioteca Calibre real pequena.

Mocks não bastam para aceite final.

---

# 31. Busca global

Qualquer resultado precisa navegar até o objeto real.

Questão:

```text
resultado
→ publication
→ node/question
→ editor
```

Eliminar resultados sem ação.

---

# 32. Semântica de exclusão

Resolver antes de acumular acervo real.

Problema a evitar:

```text
DocumentNode excluído
+
Question órfã
```

Definir semântica humana para:

```text
Excluir questão
```

Implementar integridade coerente:

- soft delete agregado;
- cascade controlado;
- ou equivalente.

Adicionar testes.

---

# 33. Lixeira

Restaurar deve restaurar:

- questão;
- node;
- posição;
- relações necessárias.

O usuário não deve conhecer a diferença interna.

---

# 34. IA

Preservar governança:

```text
proposta
→ diff
→ revisão
→ aprovação
```

IA não substitui caso de uso.

---

# 35. Local-first

Não introduzir dependência obrigatória em:

- CDN;
- fonte remota;
- ícones remotos;
- IA remota;
- storage SaaS.

O fluxo principal precisa funcionar localmente.

---

# 36. OCR local

Manter provider local como caminho principal.

Registrar quando disponível:

- provider;
- model;
- duration;
- raw output;
- confidence.

Providers remotos podem existir futuramente.

---

# 37. Assets

Todo asset deve atravessar StorageProvider.

Não espalhar `fs` pela aplicação.

Não expor path físico ao usuário.

---

# 38. Figuras

Fluxo:

```text
crop figura
→ asset
→ link question
→ inserir referência LaTeX
→ render
```

Não obrigar usuário a digitar nome de arquivo.

---

# 39. Render

Preservar:

### Fast preview
Resposta imediata.

### Authoritative render
Worker Docker.

Não confundir os dois.

---

# 40. Diagnóstico do render

Quando possível:

- mensagem;
- linha;
- arquivo;
- trecho;
- ação `Ir para erro`.

Logs completos devem ficar secundários.

---

# 41. E2E mestre do Beta

Criar um teste E2E central:

```text
DB limpa
→ criar biblioteca
→ criar livro
→ criar capítulo
→ criar grupo
→ criar escolha simples
→ editar
→ criar alternativas
→ marcar correta
→ salvar
→ render
→ reload
→ verificar persistência
```

Este teste deve virar o heartbeat do Beta Editorial.

---

# 42. E2E de captura

Criar:

```text
abrir livro
→ captura
→ fixture de imagem
→ crop
→ provider determinístico
→ review
→ corrigir
→ create question
→ editor
→ reload
→ origem continua ligada
```

Não usar modelo real em CI.

Testar provider real separadamente.

---

# 43. E2E Calibre

Criar fixture mínima de catálogo.

Testar:

```text
catalog
→ selection
→ metadata
→ import
→ publication
```

E fazer validação manual com biblioteca real.

---

# 44. Contract tests

Cobrir boundaries:

- RecognitionProvider;
- Calibre/catalog adapter;
- StorageProvider;
- RenderExecutor;
- repositories.

---

# 45. Migrations

Toda alteração Prisma relevante:

```text
SQLite
→ migration
→ derive Postgres
→ validate
```

Adicionar testes para tabelas/campos novos.

---

# 46. Organização do trabalho

Criar um EPIC único:

```text
Beta Editorial
```

Issues centradas em jornadas/slices.

Exemplo:

```text
1. Acervo do zero
2. CreateQuestion
3. Question types
4. Proveniência
5. RecognitionCandidate
6. Capture → Question
7. CaptureQueue
8. Calibre
9. Delete integrity
10. Master E2E
```

Evitar outra avalanche de issues lineares.

---

# 47. Critério de issue boa

Cada issue deve responder:

- qual ação do usuário passa a existir?
- quais componentes mudam?
- qual caso de uso?
- qual API?
- qual persistência?
- quais testes?
- como demonstrar?

---

# 48. Não criar issue vaga

Evitar:

```text
Refatorar recognition
```

Preferir:

```text
Permitir criar uma questão persistida a partir de um recorte revisado
```

Refatorações entram como trabalho técnico interno.

---

# 49. Definition of Done

Não considerar pronto se:

- endpoint existe mas UI não usa;
- teste unitário passa mas fluxo não existe;
- UI parece pronta mas usa mock;
- reload perde dados;
- OCR não persiste;
- Calibre é fake;
- render é imagem simulada;
- busca não navega.

---

# 50. Visual parity

Não perseguir pixel-perfect cego.

Perseguir:

- mesma hierarquia;
- mesma semântica;
- mesmos fluxos;
- mesmos CTAs;
- mesmos estados;
- mesma densidade;
- mesma linguagem visual.

---

# 51. Desktop

Validar:

- 1366×768;
- 1440×900;
- 1920×1080.

Em 1366:

- IA fechada;
- editor utilizável;
- painéis ajustáveis.

---

# 52. Performance percebida

Operações longas não devem congelar a aplicação.

OCR/render/import:

- status;
- progresso;
- retry.

Usuário deve poder continuar quando seguro.

---

# 53. Recovery

Não perder trabalho se:

- OCR falha;
- render falha;
- autosave falha;
- reload acontece;
- importação fica parcial.

---

# 54. Integridade de dados

O acervo é o ativo principal.

Priorizar:

- transação;
- integridade referencial;
- soft delete coerente;
- backup;
- hashes;
- validação;
- atomicidade.

---

# 55. `.lbb` e backup

Novos objetos importantes devem ter:

- suporte de portabilidade;
- ou plano explícito documentado.

Especialmente:

- origem;
- crops;
- recognition metadata;
- novos assets.

---

# 56. Legado

Não rodar migração completa antes de fechar o fluxo novo.

Primeiro:

```text
1 biblioteca
1 livro
```

Comparar:

- árvore;
- questions;
- options;
- assets.

Depois ampliar.

---

# 57. Diagnóstico

Atualizar módulo de diagnóstico com dependências relevantes:

```text
SQLite          OK
Storage         OK
Renderer        OK
OCR local       OK
Calibre         Conectado/—
```

Não poluir UI editorial.

---

# 58. Progresso real

Manter uma tabela pequena:

| Slice | Código | Testes | E2E | Browser | Status |
|---|---|---|---|---|---|

Evitar medir progresso por centenas de checkboxes.

---

# 59. Demo por slice

Cada slice precisa ter roteiro reproduzível no browser.

Exemplo:

```text
bun run dev
→ /
→ Criar biblioteca
→ ...
```

Feature não está pronta apenas porque compila.

---

# 60. Browser acceptance

Validar manualmente:

- Ctrl+V;
- drag/drop;
- crop;
- Monaco;
- resize;
- autosave;
- render;
- reload;
- Calibre.

---

# 61. Acessibilidade

Preservar:

- keyboard;
- foco;
- ARIA;
- labels;
- tooltips;
- reduced motion;
- high contrast.

---

# 62. Atalhos

Preservar e evitar conflitos:

- Ctrl/Cmd+K;
- Ctrl/Cmd+S;
- Ctrl+V;
- Ctrl+Shift+A;
- atalhos novos quando necessários.

---

# 63. Home real

Remover dependência conceitual de `demo`.

Home deve suportar:

- zero bibliotecas;
- uma;
- várias;
- retomada do trabalho.

---

# 64. Publication overview

Implementar:

- metadata;
- source;
- questões;
- pendências;
- CTA abrir;
- CTA capturar.

Não criar dashboard pesado.

---

# 65. Persistência de contexto

Pode guardar em localStorage:

- última biblioteca;
- último livro;
- última questão;
- widths;
- preferências visuais.

Não usar localStorage como domínio.

---

# 66. Metadados

Usar progressive disclosure.

Não mostrar todos os campos sempre.

Preservar schema atual quando possível.

---

# 67. Tags

Reutilizar infraestrutura:

- autocomplete;
- criação;
- normalização;
- filtro.

---

# 68. Histórico

Preservar revisões.

Quando possível registrar origem:

- user;
- AI;
- recognition;
- import.

---

# 69. Recognition history

Manter pelo menos a execução que originou a versão aprovada.

Evitar perder completamente o contexto do reconhecimento.

---

# 70. API

Evitar endpoint monolítico “faz tudo”.

Também evitar roundtrips excessivos para uma transação única.

Operações de negócio atômicas merecem endpoints/use cases atômicos.

---

# 71. CreateQuestionFromRecognition

Provável caso de uso de primeira classe.

Responsabilidades:

- candidate aprovado;
- destination;
- question;
- node;
- options;
- provenance;
- assets;
- revision;
- retorno navegável.

---

# 72. Destino na árvore

Centralizar lógica.

Não espalhar cálculo de parent/sort position pela UI.

---

# 73. IDs e navegação

Depois de criar uma questão, retornar o necessário para:

```text
select
→ navigate
→ open editor
```

---

# 74. Erros semânticos

APIs devem permitir UX compreensível.

Exemplos:

- destination_not_found;
- invalid_question_type;
- answer_key_invalid;
- source_missing;
- render_unavailable.

Não mostrar stack trace na UI.

---

# 75. Calibre e segurança

Tratar catálogo/arquivos como dados.

Validar paths.

Evitar traversal.

Não executar conteúdo.

---

# 76. ZIP/import

Preservar proteção contra:

- zip slip;
- arquivos enormes;
- formatos inesperados;
- conflitos.

---

# 77. OCR inputs

Validar:

- mime;
- tamanho;
- dimensão;
- PDF inválido;
- imagem inválida.

---

# 78. Performance da biblioteca

Não carregar arquivo completo/capa full-res de todos os livros simultaneamente.

Usar thumbnail e lazy loading quando necessário.

---

# 79. Performance da árvore

Evitar reconstrução pesada em cada keypress.

Preservar comportamento eficiente.

---

# 80. Queue e assets

Não manter blobs grandes como estado React principal.

Salvar asset e trabalhar por IDs.

---

# 81. Feature flags

Se funcionalidades chegarem incrementalmente:

- flag local;
- sem botão morto.

---

# 82. Setup

Qualquer dependência local nova deve entrar em:

```text
bun run setup
```

ou ser documentada claramente.

---

# 83. Fixtures

Criar fixtures redistribuíveis para:

- PDF;
- screenshot de questão;
- Calibre catalog;
- figuras.

Não commitar livros completos protegidos.

---

# 84. Copyright nos testes

Usar:

- conteúdo sintético;
- domínio público;
- trechos mínimos adequados.

---

# 85. Commits

Pequenos e semânticos por slice.

Evitar mega-commit final.

---

# 86. PRs

Integrar continuamente.

Não repetir o padrão de dezenas de PRs lineares desconectados da `main`.

A `main` deve permanecer demonstrável.

---

# 87. Sequência recomendada

```text
1. Library CRUD
2. Publication CRUD
3. Tree UX
4. CreateQuestion
5. Question types
6. Validation
7. Source/provenance
8. Capture Studio integration
9. RecognitionCandidate
10. Candidate → Question
11. CaptureQueue
12. Calibre
13. Delete integrity
14. Master E2E
15. Legacy small import
```

---

# 88. Paralelização possível

### Trilha A
Library/Publication/UI.

### Trilha B
Question/domain.

### Trilha C
Recognition/provenance.

### Trilha D
Calibre spike.

### Trilha E
E2E/design-system integration.

Integrar frequentemente.

---

# 89. Gates

## Gate 1

```text
criar livro manual
+
criar questão manual
```

funcionando do zero.

## Gate 2

```text
screenshot
→ recognition
→ review
→ question
```

## Gate 3

```text
Calibre
→ Publication real
```

## Gate 4

```text
produção em volume
```

---

# 90. Produto acima do checklist

Quando houver conflito entre:

- fechar um item histórico;
- permitir completar a jornada P0;

priorizar a jornada, salvo risco de segurança/integridade.

---

# 91. Pergunta diária

Todo desenvolvedor deveria responder:

> **Qual ação real do usuário ficou possível depois deste trabalho?**

Se a resposta for apenas:

> “refatoramos uma camada”

verificar se está conectado a um slice.

---

# 92. Matriz Design → Código

Manter:

| Frame/Fluxo | Rota/Componente | Use Case | API | Persistência | Teste |
|---|---|---|---|---|---|

Usar isso para garantir cobertura.

---

# 93. Não declarar pronto por aparência

Não está pronto se:

- botão não persiste;
- OCR é mock;
- reload perde;
- Calibre é mock;
- render não é real;
- busca não navega.

---

# 94. Não declarar pronto por backend

Também não está pronto se:

- endpoint existe;
- testes passam;
- usuário precisa de curl;
- precisa de Prisma Studio;
- UX não foi conectada.

---

# 95. Definition of Done absoluta

Demonstrar com banco limpo:

```text
1. criar biblioteca;
2. criar/importar livro;
3. abrir livro;
4. criar capítulo;
5. criar grupo;
6. capturar screenshot;
7. recortar;
8. reconhecer;
9. revisar;
10. criar questão;
11. editar LaTeX;
12. marcar gabarito;
13. renderizar;
14. validar;
15. fechar;
16. abrir;
17. encontrar questão;
18. abrir origem;
19. ver recorte;
20. continuar editando.
```

Sem intervenção no banco.

Sem mock.

Sem copiar e colar entre telas internas.

---

# 96. Entrega final

Ao concluir o Beta Editorial, entregar:

1. código;
2. migrations;
3. testes;
4. E2E;
5. documentação curta;
6. screenshots do produto real;
7. matriz Design → Código;
8. gaps P1/P2;
9. setup;
10. known limitations.

---

# 97. Resultado esperado

Ao final, o LatexBookBank deve deixar de ser:

> uma plataforma tecnicamente avançada com capacidades editoriais desconectadas

e passar a ser:

> **uma ferramenta que Francisco consegue usar diariamente para transformar seus livros, PDFs e capturas em um banco estruturado e auditável de questões LaTeX.**

---

# 98. Regra final

**Preserve a arquitetura que já ficou boa.**

**Implemente o produto mostrado no design aprovado.**

**Feche a última milha.**

**Toda issue deve aproximar o usuário da jornada real.**
