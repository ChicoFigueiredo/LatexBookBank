# LatexBookBank — Ajustes Finais no Claude Design
## Revisar, completar e congelar o protótipo do Beta Editorial

> **Repositório:** `https://github.com/ChicoFigueiredo/LatexBookBank`  
> **Branch de referência:** `main`  
> **Entrada:** protótipo navegável já produzido para o LatexBookBank  
> **Objetivo:** fazer a última rodada de ajustes de UX/produto e preparar o design para handoff ao time de desenvolvimento.

---

# 1. Regra principal

**Não redesenhe o produto do zero.**

O protótipo atual está conceitualmente aprovado e deve ser tratado como a base oficial do **Beta Editorial**.

Seu trabalho agora é:

1. preservar o modelo mental criado;
2. preservar a identidade visual;
3. corrigir lacunas;
4. aprofundar fluxos incompletos;
5. melhorar consistência;
6. completar estados de erro, vazio e recuperação;
7. preparar um handoff implementável.

Não faça nova exploração estética.

Não troque o design system.

Não reinicie discovery.

Não proponha uma nova arquitetura de produto.

---

# 2. O que deve ser preservado

Preserve especialmente:

- identidade **Papel & Tinta**;
- herança do EduLingo DS Admin v1;
- densidade de IDE;
- rail + árvore + editor + preview + aside;
- Workbench como coração do produto;
- Biblioteca;
- Livros/Publicações;
- árvore editorial;
- criação explícita de questões;
- escolha simples;
- múltipla escolha;
- discursiva;
- Capture Studio;
- `Ctrl+V` para screenshot;
- PDF + crop;
- reconhecimento local;
- revisão lado a lado;
- correção humana;
- fila de captura;
- proveniência/origem;
- preview rápido;
- render autoritativo;
- IA governada;
- busca global;
- histórico;
- lixeira;
- import/export;
- fluxo Calibre.

Esse vocabulário agora é a base oficial do produto.

---

# 3. North Star

O protótipo final deve provar visualmente esta jornada:

```text
Home
→ Criar/abrir Biblioteca
→ Adicionar Livro
→ Manual ou Calibre
→ Abrir Livro
→ Criar Capítulo/Grupo
→ Criar ou Capturar Questão
→ Screenshot/PDF
→ Crop
→ Reconhecimento
→ Revisão
→ Estrutura da Questão
→ LaTeX
→ Gabarito
→ Render
→ Validação
→ Persistência
→ Fechar
→ Reabrir
→ Continuar
```

Se essa jornada ainda depender de inferência, complete o design.

---

# 4. Completar “Criar Biblioteca”

O protótipo atual praticamente salta para a biblioteca pronta.

Criar o fluxo real:

```text
Home vazia
→ Criar biblioteca
→ formulário enxuto
→ biblioteca criada
→ próxima ação
```

Campos:

- nome;
- descrição opcional.

Não criar um wizard longo.

Após salvar:

```text
Biblioteca criada

[ Adicionar primeiro livro ]
[ Importar do Calibre ]
[ Abrir biblioteca ]
```

Mostrar também:

- erro de nome inválido;
- nome duplicado, se fizer sentido;
- cancelar sem perder contexto.

---

# 5. Completar “Cadastrar Livro Manualmente”

O fluxo manual deve ficar tão claro quanto o Calibre.

## Entrada

```text
Adicionar livro
```

Opções:

- Cadastrar manualmente;
- Importar do Calibre;
- Importar arquivo;
- Importar `.lbb`.

## Cadastro manual

Campos principais:

- Título;
- Autor(es);
- Editora;
- Edição;
- Ano;
- ISBN;
- Idioma;
- Série/Coleção;
- Volume;
- Capa;
- Tags.

Origem opcional:

- PDF;
- EPUB;
- imagem;
- sem fonte por enquanto.

Não tornar tudo obrigatório.

O usuário deve conseguir começar com poucos dados e completar depois.

Após salvar:

```text
[ Abrir no editor ]
[ Associar PDF ]
[ Criar primeiro capítulo ]
[ Capturar primeira questão ]
```

---

# 6. Livro vazio

Criar um empty state forte.

Exemplo:

```text
Este livro ainda não possui estrutura.

[ Criar primeiro capítulo ]
[ Capturar primeira questão ]
[ Abrir PDF fonte ]
[ Importar estrutura ]
```

O usuário não deve precisar montar uma árvore complexa antes de começar.

Se escolher `Capturar primeira questão`, o produto pode perguntar o destino apenas na revisão final.

---

# 7. Nova questão como ação de primeira classe

Reforce que a UX não é:

```text
Novo nó → transformar em questão
```

Mas:

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

Atalhos avançados podem continuar existindo.

---

# 8. Escolha simples

Garanta no frame:

- apenas uma correta;
- semântica visual de radio;
- mudança de correta em um clique;
- validação quando nenhuma estiver marcada;
- letras derivadas da posição.

Mostrar a consequência da reordenação:

```text
Antes:
A ✓
B
C

Usuário move A para a terceira posição.

Depois:
A
B
C ✓
```

A alternativa permanece correta; a letra muda.

---

# 9. Múltipla escolha

A diferença deve ser inequívoca.

Usar semântica visual equivalente a checkbox.

Mostrar uma questão com múltiplas alternativas corretas.

Não usar exatamente a mesma UI de escolha simples trocando apenas o título.

---

# 10. Discursiva

Priorizar:

- enunciado;
- resposta esperada;
- resolução;
- complemento;
- origem;
- tags;
- metadados;
- preview;
- render.

Não mostrar área vazia de alternativas.

---

# 11. Capture Studio

Preservar e aprofundar.

Entradas:

- PDF do livro;
- upload de PDF;
- imagem;
- drag & drop;
- screenshot;
- `Ctrl+V`;
- imagem copiada do navegador;
- asset existente.

Modos:

- Questão completa;
- Texto;
- Texto + fórmulas;
- Fórmula;
- Figura.

---

# 12. Revisão estruturada

A tela de revisão deve continuar sendo um dos frames centrais.

Layout:

```text
ORIGINAL                     INTERPRETAÇÃO
────────────────────         ────────────────────
recorte                      tipo provável
página                       número original
zoom                         enunciado
                             alternativas
                             possível gabarito
                             warnings
                             figuras
                             confiança
```

Preserve um erro deliberado de OCR.

Exemplo:

```text
original: x²
reconhecido: x³
```

O usuário deve perceber e corrigir antes de salvar.

---

# 13. Diferenciar reconhecimento de persistência

Mostrar claramente:

```text
Imagem
→ Reconhecimento
→ Candidato estruturado
→ Revisão humana
→ Criar/atualizar questão
```

O reconhecimento nunca deve parecer que já modificou o acervo.

---

# 14. Destino após revisão

Quando a captura for iniciada dentro de um grupo:

```text
Criar questão em:
Capítulo 3 › Exercícios
```

CTA principal:

```text
Criar questão
```

CTA de produtividade:

```text
Criar e continuar capturando
```

Se a captura vier de uma questão existente, mostrar ações contextuais apenas quando necessárias:

- inserir no enunciado;
- adicionar alternativa;
- adicionar solução;
- salvar como figura.

---

# 15. Fila de captura

Preservar.

Estados:

- aguardando;
- reconhecendo;
- revisar;
- erro;
- aprovado.

Cada item deve mostrar:

- thumbnail;
- página;
- destino;
- tipo;
- status.

Ao revisar um item, a fila continua acessível.

---

# 16. Origem / Proveniência

Tornar a aba Origem particularmente forte.

Mostrar:

- livro;
- arquivo;
- página;
- número original;
- thumbnail do recorte;
- data;
- modelo;
- duração;
- confiança;
- origem da importação.

Ações:

```text
Abrir página original
Ver recorte
Ver reconhecimento original
```

Separar claramente:

- Origem;
- Histórico de edição;
- Histórico de reconhecimento.

---

# 17. Calibre

Preservar o fluxo atual:

```text
Selecionar biblioteca
→ catálogo
→ busca/filtros
→ selecionar livro
→ revisar metadados
→ escolher fonte
→ importar
→ abrir livro
```

Adicionar estados:

- biblioteca não encontrada;
- catálogo inválido;
- nenhum PDF;
- múltiplos formatos;
- possível duplicata;
- arquivo indisponível;
- importação concluída.

Depois de importado, o livro deve parecer um livro normal do LatexBookBank.

Calibre aparece apenas como origem.

---

# 18. Home — primeiro uso

Mostrar:

```text
Comece seu acervo

[ Criar biblioteca ]
[ Importar biblioteca ]
[ Conectar Calibre ]
```

Não criar dashboard vazio.

---

# 19. Home — usuário recorrente

Prioridade:

```text
Continuar trabalhando
Pendências de revisão
Bibliotecas
Livros recentes
```

Exemplo:

```text
Continuar

Fundamentos de Matemática Elementar
Capítulo 1 › Exercícios › Questão 27

Editado há 18 min
[ Continuar ]
```

---

# 20. Workbench e resoluções

Não congelar as larguras exatas do protótipo.

Indicar comportamento:

- rail recolhível;
- sidebar redimensionável;
- preview redimensionável;
- IA fechada por padrão;
- preferências persistidas.

Validar visualmente:

- 1366×768;
- 1440×900;
- 1920×1080.

Em 1366, o editor precisa continuar produtivo.

---

# 21. Design system

O handoff deve declarar que a implementação real deve usar:

```text
apps/web/src/design-system/
```

O protótipo é referência visual, não implementação CSS.

Marcar explicitamente:

> `Visual contract ≠ source-code contract`

Não considerar como decisão de produção:

- inline styles;
- Iconify CDN;
- Google Fonts remotas;
- qualquer biblioteca usada apenas para prototipagem.

---

# 22. Busca global

Demonstrar resultado real:

```text
Questão 27
Fundamentos de Matemática › Capítulo 1 › Exercícios
```

Ao clicar:

```text
abre o livro
→ seleciona a questão
→ foca o editor
```

---

# 23. Autosave

Mostrar estados:

- editando;
- salvando;
- salvo;
- falhou;
- conflito.

Não depender apenas de toast.

---

# 24. Preview e Render

Diferenciar:

### Preview rápido
Feedback durante edição.

### Render autoritativo
Worker LaTeX.

Estados:

- aguardando;
- renderizando;
- concluído;
- falhou.

Em falha:

- mensagem;
- linha;
- trecho;
- `Ir para erro`.

---

# 25. Validação

Adicionar/aprimorar estado de validação.

Exemplo:

```text
✓ Enunciado preenchido
✓ 5 alternativas
✓ 1 correta
✓ LaTeX válido
✓ Render concluído
```

Falha:

```text
! Nenhuma alternativa correta definida
```

Ação:

```text
Validar questão
```

---

# 26. IA

Preservar:

```text
proposta
→ diff
→ revisão
→ aceitar/rejeitar
```

Painel fechado por padrão.

IA nunca altera silenciosamente.

---

# 27. Estados que o protótipo final precisa conter

Garantir exemplos de:

- vazio;
- loading;
- salvando;
- salvo;
- erro;
- retry;
- conflito;
- OCR indisponível;
- renderer indisponível;
- importação parcial;
- asset ausente;
- questão inválida;
- reconhecimento de baixa confiança;
- item na lixeira;
- restore.

---

# 28. Marcação para o time

Para cada frame principal, classificar:

### A — já suportado
Capacidade já existe.

### B — integrar
Peças existem, falta fechar jornada.

### C — novo caso de uso
Exige backend/domínio.

### D — evolução
Não bloqueia Beta Editorial.

---

# 29. Não transformar hipótese de UX em decisão arquitetural

Quando o protótipo sugerir algo como:

- `RecognitionCandidate`;
- cópia de arquivo do Calibre;
- confiança por bloco;
- estrutura de proveniência;

marcar:

```text
Decisão de implementação
```

O protótipo define a experiência, não necessariamente o schema.

---

# 30. Fluxos P0 que precisam ficar inequívocos

```text
P0.1 Criar biblioteca
P0.2 Criar livro manual
P0.3 Importar livro do Calibre
P0.4 Criar estrutura
P0.5 Criar questão simples
P0.6 Criar múltipla escolha
P0.7 Criar discursiva
P0.8 Colar screenshot
P0.9 Recortar
P0.10 Reconhecer
P0.11 Revisar
P0.12 Persistir questão
P0.13 Editar LaTeX
P0.14 Renderizar
P0.15 Validar
P0.16 Fechar e continuar depois
```

---

# 31. Frames mínimos finais

Validar ou completar pelo menos:

1. Home vazia;
2. Criar biblioteca;
3. Home recorrente;
4. Biblioteca;
5. Adicionar livro;
6. Cadastro manual;
7. Calibre catálogo;
8. Calibre review;
9. Livro overview;
10. Livro vazio;
11. Workbench;
12. Menu Adicionar;
13. Seletor de questão;
14. Escolha simples;
15. Múltipla escolha;
16. Discursiva;
17. Capture Studio screenshot;
18. Capture Studio PDF;
19. Crop;
20. Reconhecimento;
21. Revisão estruturada;
22. Baixa confiança;
23. Fila;
24. Origem;
25. Figura/asset;
26. Preview;
27. Render;
28. Diagnóstico;
29. Validação;
30. Histórico;
31. IA;
32. Busca;
33. Lixeira;
34. Import/export.

---

# 32. Handoff final

Criar uma página/frame de handoff chamada:

```text
LatexBookBank — Beta Editorial
```

Ela deve conter:

- sitemap;
- fluxo principal;
- fluxos alternativos;
- componentes novos;
- componentes existentes;
- estados;
- shortcuts;
- comportamento em 1366/1440/1920;
- matriz UI × backend;
- gaps;
- classificação A/B/C/D;
- prioridades P0/P1/P2.

---

# 33. O que congelar

Congelar:

### Modelo mental

```text
Biblioteca
Livro
Estrutura
Questão
Captura
Reconhecimento
Revisão
Origem
LaTeX
Render
```

### Jornada principal

A jornada aprovada.

### Design language

EduLingo DS Admin → Papel & Tinta.

### Capture Studio

Conceito.

### IA

Governada.

### Proveniência

Obrigatória.

---

# 34. O que não congelar pixel a pixel

Não tratar como contrato:

- largura exata;
- HTML do protótipo;
- inline styles;
- biblioteca de ícones da demo;
- fonte externa;
- nome interno de componente;
- animação decorativa.

---

# 35. Critérios finais

Antes de encerrar:

> Um desenvolvedor consegue implementar sem inventar a UX?

Se não, complete.

> Um usuário novo consegue criar biblioteca, livro e primeira questão sem documentação?

Se não, complete.

> É possível produzir 100 questões sem a interface se tornar cansativa?

Se não, refine.

> A origem de uma questão continua auditável depois?

Se não, refine.

> OCR exige revisão humana explícita?

Se não, corrija.

---

# 36. Resultado esperado

O resultado desta rodada será o:

# **Design Final do Beta Editorial do LatexBookBank**

Ele será passado diretamente ao time.

Portanto:

- preserve o que funcionou;
- feche as lacunas;
- refine estados;
- complete Biblioteca e Livro Manual;
- mantenha Calibre;
- preserve Capture Studio;
- prepare o handoff;
- não reinicie o projeto.

O design final deve funcionar como:

> **contrato visual e comportamental da primeira versão realmente utilizável do LatexBookBank.**
