# Prompt para Claude Design — LatexBookBank
## Redesign e protótipo de alta fidelidade do fluxo editorial completo

> **Repositório obrigatório para análise:** `https://github.com/ChicoFigueiredo/LatexBookBank`  
> **Branch de referência:** `main`  
> **Produto:** LatexBookBank  
> **Objetivo deste trabalho:** desenhar, em alta fidelidade e com protótipo navegável, a experiência editorial completa que transforme o LatexBookBank em substituto real do aplicativo desktop legado para cadastro de livros técnicos e, principalmente, criação e manutenção de um banco estruturado de questões em LaTeX.

---

# 1. Seu papel

Atue simultaneamente como:

- **Principal Product Designer** de uma ferramenta profissional de autoria;
- **UX Architect** para aplicações de alta densidade informacional;
- especialista em **IDE-like interfaces**, editores técnicos, bibliotecas digitais, LaTeX e fluxo de revisão;
- especialista em **design systems desktop-first**;
- especialista em ferramentas de **captura, OCR/visão, revisão humana e estruturação de conteúdo**.

Não trate este projeto como um SaaS genérico, um painel administrativo comum, uma biblioteca de cards ou um CRUD.

O LatexBookBank é uma **ferramenta de trabalho editorial**. Pense em uma combinação coerente de:

- biblioteca técnica;
- Calibre;
- IDE;
- editor LaTeX;
- banco de questões;
- ferramenta de captura de documentos;
- mesa de revisão editorial;
- gerenciador de assets;
- montador de avaliações;
- assistente de IA sob supervisão humana.

A experiência precisa transmitir:

**maturidade, confiança, precisão, velocidade, densidade produtiva e domínio técnico.**

---

# 2. Primeira obrigação: analisar o produto existente

Antes de desenhar qualquer tela, analise cuidadosamente o repositório na branch `main`.

Não proponha uma interface ignorando o que já existe.

Leia, no mínimo:

```text
README.md
docs/_atual/_planejamento.md
docs/_atual/_checklist.md
docs/prompts/260806-01.LatexBookBank_Web_Especificacao_Mestra.md

apps/web/src/design-system/
apps/web/src/design-system/index.ts
apps/web/src/design-system/tokens.css
apps/web/src/design-system/shell/Workbench.tsx

apps/web/app/page.tsx
apps/web/app/publications/[id]/
apps/web/app/publications/[id]/publication-workbench.tsx
apps/web/app/publications/[id]/question-editor.tsx
apps/web/app/publications/[id]/ingestao/

apps/web/src/modules/questions/
apps/web/src/modules/document-tree/
apps/web/src/modules/assets/
apps/web/src/modules/recognition/
apps/web/src/modules/latex/
apps/web/src/modules/rendering/
apps/web/src/modules/agents/
apps/web/src/modules/assessments/
apps/web/src/modules/portability/
```

Investigue também as issues e commits recentes para compreender:

1. o que já foi implementado;
2. o que já foi validado em navegador;
3. decisões de UX tomadas durante o desenvolvimento;
4. problemas encontrados no uso real;
5. limites atuais;
6. funcionalidades que existem tecnicamente mas ainda não compõem uma jornada editorial fluida.

**Não redesenhe a arquitetura da aplicação.**

Seu foco é desenhar a melhor experiência de usuário sobre a arquitetura existente e identificar, visualmente, as lacunas de produto que precisam ser implementadas.

---

# 3. Contexto estratégico

O LatexBookBank nasceu da evolução de um aplicativo desktop antigo usado para organizar livros, materiais técnicos e questões.

O produto novo pretende substituir esse aplicativo.

O legado já possuía ideias importantes:

- organização em bibliotecas;
- livros/publicações;
- estrutura hierárquica em árvore;
- capítulos;
- seções;
- subseções;
- grupos de questões;
- questões;
- alternativas;
- editor LaTeX;
- captura de conteúdo;
- OCR;
- figuras;
- tags;
- renderização;
- banco SQLite;
- bibliotecas portáveis.

O novo LatexBookBank evoluiu muito além disso e já possui uma base técnica madura:

- aplicação web local-first;
- SQLite como banco local;
- preparação arquitetural para PostgreSQL;
- storage abstrato;
- árvore editorial;
- Monaco Editor;
- autosave;
- histórico;
- preview rápido;
- render LaTeX autoritativo em worker Docker;
- assets;
- busca;
- tags;
- avaliações;
- exportação/importação `.lbb`;
- IA governada;
- reconhecimento de imagens;
- reconhecimento de texto;
- reconhecimento de matemática;
- revisão humana antes da utilização do conteúdo reconhecido.

O problema atual não é falta de infraestrutura.

O problema é transformar tudo isso numa **jornada editorial evidente, rápida e agradável**.

Hoje existe uma grande diferença entre:

> “a aplicação possui os componentes técnicos”

e:

> “o usuário consegue abrir o sistema e produzir seu acervo do zero”.

Seu projeto deve resolver essa diferença.

---

# 4. North Star do produto

A experiência final deve permitir que uma pessoa abra o LatexBookBank e faça esta jornada sem conhecer banco de dados, Prisma, arquitetura, fases ou implementação:

```text
Abrir LatexBookBank
        ↓
Escolher/criar uma Biblioteca
        ↓
Adicionar um Livro
        ↓
Cadastrar manualmente OU importar do Calibre
        ↓
Abrir o Livro
        ↓
Criar Capítulo / Seção / Subseção / Grupo
        ↓
Criar uma Questão
        ↓
Digitar conteúdo
        OU
colar um screenshot / imagem
        OU
abrir PDF e recortar
        ↓
Reconhecer texto + matemática localmente
        ↓
Interpretar a estrutura da questão
        ↓
Revisar o que foi reconhecido
        ↓
Transformar em campos estruturados
        ↓
Editar o LaTeX
        ↓
Configurar alternativas / gabarito / metadados
        ↓
Validar
        ↓
Renderizar
        ↓
Salvar
        ↓
Fechar o sistema
        ↓
Abrir novamente
        ↓
Encontrar o livro e a questão exatamente como estavam
```

Essa jornada deve ser o eixo do protótipo.

**Não considere o projeto resolvido se apenas telas isoladas estiverem bonitas.**

---

# 5. Referência visual obrigatória: EduLingo DS Admin v1

O design system mais maduro disponível para este produto é o **EduLingo DS Admin v1**, que já foi portado para o repositório.

O LatexBookBank já retokeniza esse sistema com a identidade chamada **“Papel & Tinta”**.

Você deve preservar a linguagem visual e o contrato do design system existente.

Considere como fonte de verdade:

```text
apps/web/src/design-system/index.ts
apps/web/src/design-system/tokens.css
apps/web/src/design-system/shell/Workbench.tsx
```

## 5.1 Princípios visuais herdados do EduLingo

Preserve:

- aparência madura;
- interface limpa;
- confiança visual;
- tipografia forte;
- hierarquia evidente;
- bastante respiro onde o usuário precisa compreender contexto;
- densidade maior onde o usuário está produzindo;
- cards apenas quando semanticamente úteis;
- superfícies claras;
- bordas sutis;
- estados bem diferenciados;
- CTA principal inequívoco;
- componentes com aparência proprietária, não de template.

Evite:

- dashboard genérico;
- excesso de cards de mesmo peso;
- grandes heros;
- gradientes decorativos;
- glassmorphism;
- excesso de sombras;
- excesso de arredondamento;
- ícones sem rótulo em ações importantes;
- “cara de CRUD de 2014”;
- “cara de template React comprado”;
- estética infantil;
- UI excessivamente espaçada que sacrifique produtividade;
- usar roxo em ações comuns: o namespace lilás/roxo é reservado para **IA**.

## 5.2 Metáfora “Papel & Tinta”

O LatexBookBank não é simplesmente “EduLingo com outra logo”.

Use a metáfora que já existe no repositório:

- papel;
- tinta;
- documento;
- edição;
- anotação;
- revisão;
- material impresso.

O tema claro deve ser a referência principal para autoria.

O “papel” renderizado deve permanecer visualmente branco.

O azul-tinta é o accent principal.

O sépia deve ser usado com muita moderação como destaque editorial.

IA possui identidade visual separada, em lilás.

Estados de sucesso, alerta, erro e informação devem usar tokens semânticos próprios.

---

# 6. Densidade e geometria

Esta é uma aplicação **desktop-first de produtividade**.

Projetar prioritariamente para:

- 1366×768;
- 1440×900;
- 1920×1080.

A experiência não deve depender de mobile.

Considere o shell atual:

- rail de módulos;
- sidebar contextual;
- topbar;
- área central;
- preview;
- aside de IA;
- statusbar.

A geometria atual utiliza aproximadamente:

```text
rail:       216 px
sidebar:    280 px
aside IA:   380 px
main:       mínimo produtivo ~420 px
```

Esses valores não precisam ser tratados como dogma visual, mas o protótipo deve respeitar a lógica de uma IDE:

**a área de trabalho deve dominar o centro.**

Painéis devem poder:

- redimensionar;
- recolher;
- lembrar a largura;
- preservar o foco do editor.

O painel de IA deve nascer **fechado**.

IA é ferramenta auxiliar, não protagonista permanente da tela.

---

# 7. Arquitetura de informação desejada

A navegação principal deve deixar explícitos os grandes contextos do produto.

Considere pelo menos:

1. **Biblioteca**
2. **Publicações / Livros**
3. **Questões / Acervo**
4. **Avaliações**
5. **Importação**
6. **Diagnóstico / Sistema**

Investigue o rail atual e proponha a melhor taxonomia.

Não duplique conceitos sem necessidade.

O usuário precisa compreender rapidamente a diferença entre:

- Biblioteca;
- Livro/Publicação;
- estrutura do livro;
- questão;
- asset;
- origem;
- avaliação.

---

# 8. Conceito de Biblioteca

Uma **Biblioteca** é o grande contêiner editorial.

Ela pode conter vários livros/publicações.

A home do produto não deve ficar amarrada a um workspace técnico chamado `demo`.

Projete uma experiência real para:

- listar bibliotecas;
- criar biblioteca;
- renomear;
- abrir;
- visualizar quantidade de livros;
- visualizar quantidade de questões;
- mostrar última atividade;
- mostrar problemas pendentes;
- importar biblioteca;
- exportar/backup;
- acessar lixeira quando aplicável.

A tela deve funcionar bem com:

- 1 biblioteca;
- 13 bibliotecas;
- dezenas de bibliotecas.

Não transformar a home em uma grade enorme de cards decorativos.

Considere lista densa, tabela editorial ou combinação lista + detalhes.

---

# 9. Conceito de Livro / Publication

O usuário deve conseguir criar um livro de verdade.

Projete um fluxo **Adicionar livro** com pelo menos estas entradas:

### Opção A — Cadastrar manualmente

Campos possíveis:

- título;
- subtítulo;
- apelido;
- autor(es);
- editora;
- edição;
- ano;
- ISBN;
- idioma;
- série/coleção;
- volume;
- descrição;
- capa;
- tags;
- arquivo de origem, se houver.

Não exponha todo campo na primeira tela se isso prejudicar o fluxo.

Use progressive disclosure.

### Opção B — Importar do Calibre

Este é um fluxo essencial.

O usuário já possui livros organizados no Calibre.

O LatexBookBank deve permitir “absorver” um livro dessa biblioteca.

Projete a experiência para:

1. escolher/conectar uma biblioteca local do Calibre;
2. detectar o catálogo;
3. mostrar os livros encontrados;
4. permitir busca;
5. filtrar por formato;
6. mostrar capa;
7. mostrar título;
8. mostrar autor;
9. mostrar série;
10. mostrar edição/data quando disponível;
11. mostrar ISBN;
12. mostrar tags;
13. mostrar formatos encontrados, como PDF/EPUB;
14. escolher um livro;
15. revisar o mapeamento dos metadados;
16. escolher qual arquivo será a fonte editorial;
17. importar o conteúdo necessário para o storage gerenciado do LatexBookBank;
18. criar a `Publication`;
19. abrir imediatamente o livro no Workbench.

O protótipo deve mostrar essa jornada de maneira convincente.

Não faça um botão fictício “Importar Calibre” que pula diretamente para o final.

Quero ver o **wizard completo**.

### Opção C — Importar arquivo

Considere:

- PDF;
- imagem;
- EPUB quando tecnicamente viável como fonte;
- `.lbb`;
- legado quando aplicável.

O design deve distinguir:

**criar um livro novo a partir de uma fonte**

de:

**importar um acervo LatexBookBank já estruturado**.

São ações diferentes.

---

# 10. Tela de detalhes do livro antes do Workbench

Projete uma tela de overview do livro que seja útil sem virar dashboard.

Ela pode apresentar:

- capa;
- título;
- autor;
- editora;
- edição;
- ISBN;
- fonte;
- quantidade de capítulos;
- quantidade de questões;
- questões não validadas;
- renders com problema;
- progresso de captura;
- última edição;
- botão principal **Abrir no editor**;
- botão **Capturar questões**;
- acesso a metadados;
- acesso à fonte original.

Use os indicadores para orientar ação, não para preencher tela.

Exemplo de narrativa:

```text
Continuar editando
        ↓
Problemas que exigem atenção
        ↓
Próxima ação editorial
```

A lógica de prioridade visual deve lembrar a maturidade do EduLingo: primeiro o que o usuário precisa fazer, depois contexto e métricas.

---

# 11. Workbench editorial do livro

O Workbench é o coração do produto.

Ele deve combinar:

```text
RAIL
│
├── SIDEBAR: árvore do livro
│
├── CENTRO: editor
│
├── PREVIEW: resultado
│
└── ASIDE opcional: IA
```

## 11.1 Sidebar da árvore

A árvore deve permitir tipos estruturais como:

- Livro;
- Parte;
- Capítulo;
- Seção;
- Subseção;
- Conteúdo;
- Grupo de Questões;
- Questão;
- Figura;
- Nota.

O usuário deve conseguir:

- criar filho;
- criar irmão;
- renomear;
- duplicar;
- arrastar;
- reordenar;
- mover para outro pai;
- excluir;
- restaurar;
- filtrar;
- buscar;
- filtrar por tipo;
- filtrar por tag;
- mostrar somente itens com problema.

### Criação explícita

Não use apenas o comando genérico **Novo nó**.

Esse comportamento é poderoso para usuários avançados, mas é ruim como único caminho.

Projete uma affordance clara:

```text
+ Adicionar
```

abrindo algo como:

```text
Estrutura
- Capítulo
- Seção
- Subseção
- Grupo de questões

Conteúdo
- Texto
- Figura
- Nota

Questões
- Questão de escolha simples
- Questão de múltipla escolha
- Questão discursiva
```

Atalhos podem continuar existindo.

O fluxo visual precisa ensinar o modelo mental.

---

# 12. Caso de uso fundamental: criar uma questão

Este é um requisito P0.

O protótipo deve mostrar claramente como nasce uma questão do zero.

Uma questão nova deve ser criada como uma unidade editorial real, e não como um `DocumentNode` vazio que posteriormente talvez receba conteúdo.

Ao selecionar:

```text
Nova questão
```

o usuário deve escolher o tipo.

## 12.1 Tipos mínimos que o protótipo deve demonstrar

### A. Escolha simples

Uma única alternativa correta.

Exemplo:

- A
- B
- C
- D
- E

A UI deve permitir marcar **uma e somente uma** correta.

### B. Múltipla escolha

Mais de uma alternativa pode estar correta.

A UI precisa comunicar claramente a diferença em relação à escolha simples.

Não reutilize o mesmo componente sem mudar a semântica.

### C. Discursiva

Sem alternativas obrigatórias.

Pode conter:

- enunciado;
- resposta esperada;
- solução;
- complemento.

### D. Extensibilidade

O legado possui ou previa outros tipos, como:

- verdadeiro/falso;
- resolva;
- CESPE;
- somatório.

Não é obrigatório prototipar todos profundamente, mas o design precisa permitir que novos tipos entrem sem redesenhar a tela inteira.

---

# 13. Anatomia da tela de questão

A questão precisa possuir uma experiência de autoria rica.

Considere tabs ou áreas equivalentes para:

### Conteúdo

- apelido;
- enunciado em LaTeX;
- editor Monaco;
- preview rápido;
- render autoritativo.

### Alternativas

Para cada alternativa:

- conteúdo LaTeX;
- drag handle;
- posição;
- gabarito;
- remover;
- duplicar;
- adicionar alternativa;
- preview.

A **letra é derivada da posição**.

Não trate A/B/C/D/E como identidade persistente do item.

Ao reordenar, a letra visual deve acompanhar a nova ordem.

### Resposta / Solução

- resposta;
- resolução detalhada;
- explicação;
- observações editoriais.

### Complemento

Para conteúdo LaTeX auxiliar.

### Metadados

Considere:

- dificuldade;
- ano;
- banca;
- instituição;
- cargo;
- nível;
- editora;
- origem;
- número original da questão;
- status;
- tipo.

### Tags

- autocomplete;
- criação rápida;
- remoção;
- normalização visual;
- mais usadas;
- filtro posterior.

### Origem

A proveniência é importantíssima.

Mostrar:

- livro;
- arquivo;
- página;
- recorte original;
- asset;
- imagem;
- data da captura;
- modelo de reconhecimento;
- confiança;
- histórico.

O usuário deve poder voltar ao recorte original e comparar com a questão a qualquer momento.

---

# 14. Editor LaTeX

O editor deve aproveitar o que já existe.

Não substitua Monaco por textarea.

O protótipo deve demonstrar:

- Monaco no centro;
- autocomplete;
- snippets;
- palette de símbolos;
- matemática;
- status de autosave;
- conflito;
- erro;
- conteúdo não salvo;
- atalhos;
- preview rápido;
- preview do PDF;
- logs;
- diagnósticos clicáveis;
- render em andamento;
- render concluído;
- render falhou.

## 14.1 Preview

Diferenciar claramente:

### Preview rápido

Imediato, para feedback durante digitação.

### Render autoritativo

PDF/PNG produzido pelo worker LaTeX.

O usuário deve entender que:

> preview rápido pode diferir do resultado final.

Não esconda essa diferença.

---

# 15. Fluxo de captura: o diferencial do produto

Este é um dos fluxos mais importantes do LatexBookBank.

O usuário deve conseguir criar questões a partir de material encontrado:

- em um PDF;
- em uma imagem;
- em uma captura de tela;
- na internet;
- em um livro escaneado;
- em uma prova;
- em um documento fotografado.

## 15.1 Entradas

Projete uma área de captura que aceite:

- arrastar PDF;
- arrastar imagem;
- clicar para escolher arquivo;
- **Ctrl+V** de screenshot;
- colar imagem copiada do navegador;
- reutilizar PDF já associado ao livro;
- abrir arquivo-fonte da Publication.

A frase operacional deve ser inequívoca, por exemplo:

> Arraste um PDF ou imagem, escolha um arquivo ou cole uma captura com Ctrl+V.

---

# 16. Visualizador e recorte

Após escolher a fonte:

- mostrar documento;
- navegação por páginas;
- zoom;
- fit width;
- miniaturas quando fizer sentido;
- seleção retangular;
- mover seleção;
- redimensionar;
- excluir seleção;
- refazer;
- salvar recorte.

O recorte deve permanecer visível durante toda a revisão.

Ele é a evidência da questão original.

Nunca mostrar apenas o texto reconhecido sem a fonte ao lado quando o usuário está revisando reconhecimento.

---

# 17. Modos de reconhecimento

Antes do reconhecimento, permita indicar o que há no recorte.

Mínimo:

```text
Questão completa
Texto
Texto + fórmulas
Fórmula
Figura
```

Hoje o produto já possui conceitos equivalentes a:

- fórmula;
- mixed;
- texto.

O protótipo deve evoluir isso para uma linguagem de produto mais útil.

## 17.1 “Questão completa”

Este modo é fundamental para a visão futura.

Ao recortar uma questão inteira, a aplicação deve tentar identificar:

- enunciado;
- alternativas;
- tipo provável;
- respostas marcadas, quando existirem e forem confiáveis;
- texto comum;
- fórmulas;
- figuras;
- numeração original.

O resultado não é gravado automaticamente.

Ele vira uma **proposta estruturada para revisão**.

---

# 18. Reconhecimento deve ser local-first

O fluxo de OCR/visão deve ser concebido como local e capaz de operar sem API externa.

Use a arquitetura existente de providers, mas a experiência padrão deve considerar:

- modelo local/open-source;
- indicador do modelo utilizado;
- estado do modelo;
- carregando modelo;
- reconhecimento em andamento;
- duração;
- confiança;
- falha;
- tentar novamente.

O usuário não deve precisar enviar screenshots de livros ou provas para serviços externos para utilizar o fluxo principal.

Se houver no futuro providers remotos opcionais, eles não podem ser requisito do protótipo principal.

---

# 19. Revisão do reconhecimento

Esta tela precisa ser excelente.

É uma “mesa de conferência”.

Considere layout lado a lado:

```text
ORIGINAL                         INTERPRETAÇÃO
─────────────────────            ─────────────────────
imagem/recorte                   tipo detectado

                                ENUNCIADO
                                [LaTeX editável]

                                ALTERNATIVAS
                                A [...]
                                B [...]
                                C [...]
                                D [...]
                                E [...]

                                GABARITO
                                [revisar]

                                METADADOS EXTRAÍDOS
                                [...]
```

Apresente:

- confiança geral;
- confiança por bloco quando disponível;
- alertas;
- caracteres duvidosos;
- fórmulas que exigem atenção;
- alternativas detectadas;
- possíveis imagens;
- numeração original.

Ações:

```text
Aceitar e criar questão
Aceitar e inserir na questão atual
Editar antes de aceitar
Recortar novamente
Reconhecer novamente
Descartar
```

Não faça o usuário copiar o LaTeX para clipboard e procurar outra tela.

O fluxo deve terminar numa questão persistida ou numa atualização explícita de questão.

---

# 20. Diferencie OCR de estruturação

O protótipo deve comunicar que existem duas etapas conceituais:

### Etapa 1 — reconhecer o conteúdo

Imagem → texto + matemática/LaTeX.

### Etapa 2 — estruturar editorialmente

Conteúdo → campos da questão.

Exemplo:

```text
Questão 27. Considere...

A) ...
B) ...
C) ...
D) ...
E) ...
```

deve poder virar:

```text
originalLabel = "27"

statementLatex = "Considere..."

options[0]
options[1]
options[2]
options[3]
options[4]
```

A IA pode **propor** essa separação.

A pessoa revisa.

A aplicação só grava depois da aprovação.

---

# 21. Captura rápida da internet

Projete explicitamente o caso:

1. usuário encontra uma questão em uma página web;
2. tira screenshot;
3. volta ao LatexBookBank;
4. pressiona `Ctrl+V`;
5. imagem aparece instantaneamente;
6. recorta;
7. escolhe “Questão completa”;
8. sistema reconhece;
9. estrutura;
10. mostra revisão;
11. usuário corrige um expoente;
12. marca a alternativa correta;
13. salva;
14. renderiza.

Esse fluxo deve ser rápido o suficiente para ser repetido dezenas de vezes.

A UX deve minimizar cliques.

---

# 22. Fila de captura / ingestão produtiva

Como evolução avançada, proponha uma experiência para captura sequencial.

Exemplo:

```text
PDF com 40 páginas
        ↓
usuário captura 15 questões
        ↓
cada recorte entra numa fila
        ↓
reconhecimento roda
        ↓
status:
  7 prontas para revisar
  3 reconhecendo
  1 com erro
  4 já aprovadas
```

Não transforme isso em sistema de batch obrigatório.

O fluxo unitário deve continuar simples.

A fila é importante para quem está digitalizando um livro ou prova inteira.

Mostre no protótipo como isso poderia funcionar sem perder a simplicidade.

---

# 23. Inserção de figuras

Questões frequentemente possuem:

- gráficos;
- tabelas;
- diagramas;
- figuras geométricas;
- circuitos;
- mapas;
- imagens.

Projete como:

1. selecionar uma figura no documento;
2. salvar como asset;
3. associar à questão;
4. inserir no LaTeX;
5. visualizar no preview;
6. manter vínculo com a origem.

A interface não deve exigir que o usuário saiba o nome físico do arquivo no storage.

Mostre um asset browser editorial.

---

# 24. Origem e rastreabilidade

Para conteúdo capturado, o usuário deve conseguir responder:

> De onde saiu esta questão?

A UI precisa preservar rastreabilidade.

Exemplo de painel:

```text
Origem

Livro:
Fundamentos de Matemática Elementar — Vol. 1

Arquivo:
FME1.pdf

Página:
143

Questão original:
27

Capturado:
11/08/2026 14:32

Recorte:
[thumbnail]

Reconhecimento:
gemma3:12b
1,5 s
confiança média

[ Abrir página original ]
[ Ver recorte ]
```

A proveniência não deve competir com o editor, mas deve estar disponível.

---

# 25. Fluxo de “continuar de onde parei”

Ao abrir o produto, a interface deve ajudar o usuário a retomar o trabalho.

Considere:

- último livro aberto;
- última questão;
- captura em andamento;
- itens aguardando revisão;
- renders com problema;
- questões não validadas.

Não transformar isso em feed.

Use o princípio:

```text
Continuar trabalhando
        ↓
Pendências relevantes
        ↓
Acervo
```

---

# 26. Busca global

O LatexBookBank precisa permitir encontrar rapidamente:

- livro;
- capítulo;
- questão;
- texto de enunciado;
- tag;
- banca;
- ano;
- instituição.

Preserve o conceito da command palette (`Ctrl+K`).

Projete:

- busca global;
- resultados agrupados;
- breadcrumb do resultado;
- destaque do termo;
- navegação real até a questão;
- ações rápidas.

Uma busca que mostra resultado mas não consegue navegar até ele é incompleta.

---

# 27. IA como copiloto governado

A interface já possui conceitos importantes de IA governada.

Preserve:

- painel fechado por padrão;
- contexto adicionado por gesto;
- o agente deixa claro o que está vendo;
- nenhuma alteração silenciosa;
- proposta;
- diff;
- revisão;
- aprovação seletiva;
- histórico.

A IA pode ajudar em tarefas como:

- corrigir LaTeX;
- sugerir tags;
- revisar ortografia;
- classificar dificuldade;
- estruturar um OCR;
- explicar erro de compilação;
- sugerir melhoria no enunciado.

Mas:

**IA nunca deve editar uma questão em silêncio.**

Use o lilás exclusivamente nas superfícies relacionadas à IA.

---

# 28. Estados editoriais

Projete um vocabulário visual consistente para:

- rascunho;
- não salvo;
- salvando;
- salvo;
- não validado;
- válido;
- inválido;
- renderizando;
- render pronto;
- render falhou;
- conflito;
- excluído;
- aguardando revisão de OCR;
- reconhecimento em andamento;
- reconhecimento falhou.

Não sobrecarregue a árvore com texto.

Use ícones, status dots, badges e tooltips de forma sistemática.

---

# 29. Validação

A questão deve possuir uma ação clara:

```text
Validar questão
```

A validação precisa verificar visualmente coisas como:

- enunciado vazio;
- alternativa vazia;
- ausência de gabarito;
- mais de uma correta em escolha simples;
- nenhuma correta em múltipla escolha quando isso não fizer sentido;
- LaTeX inválido;
- asset ausente;
- render quebrado;
- campos obrigatórios.

Mostrar problemas próximos do campo, não apenas num toast.

---

# 30. Histórico e revisão

Projete histórico editorial sem virar Git.

O usuário deve poder:

- ver revisões;
- comparar;
- entender quem/que ação mudou;
- restaurar revisão;
- comparar antes/depois;
- saber quando uma alteração veio de IA;
- saber quando veio de reconhecimento.

A revisão deve ser útil para recuperar trabalho, não apenas uma lista de timestamps.

---

# 31. Avaliações

Avaliações não são o foco primário deste protótipo, mas o design precisa mostrar que a questão criada entra naturalmente no acervo e pode depois ser usada para montar uma prova.

Considere:

- buscar questões;
- filtros;
- adicionar;
- ordenar;
- gerar variante;
- visualizar;
- gabarito.

Não desvie o projeto para essa área antes de fechar a jornada de cadastro.

---

# 32. Importação e exportação

Considere no módulo Importação:

- importar `.lbb`;
- exportar biblioteca;
- backup;
- restauração;
- importação legada;
- Calibre;
- arquivos.

A tela deve explicar claramente:

- o que será criado;
- o que será alterado;
- dry-run quando aplicável;
- conflitos;
- tamanho;
- progresso;
- resultado.

---

# 33. O que deve existir na home

Projete uma home real de produto.

Ela não pode continuar sendo apenas:

> Publicações do workspace `demo`.

A home deve fornecer um ponto de partida para duas pessoas imaginárias:

### Usuário novo

Ainda não possui acervo.

Deve enxergar algo como:

```text
Comece seu acervo

[ Criar biblioteca ]

ou

[ Importar biblioteca ]
[ Conectar Calibre ]
```

### Usuário recorrente

Já possui acervo.

Deve enxergar:

- continuar último trabalho;
- bibliotecas;
- livros recentes;
- itens aguardando revisão;
- acesso rápido à captura.

Sem virar um dashboard de métricas.

---

# 34. Empty states

Projete empty states úteis para:

- nenhuma biblioteca;
- biblioteca sem livro;
- livro sem estrutura;
- capítulo sem conteúdo;
- grupo sem questões;
- questão sem alternativas;
- nenhuma tag;
- nenhuma captura;
- nenhum render;
- nenhuma revisão;
- nenhuma avaliação;
- nenhum resultado de busca.

Cada empty state deve oferecer **próxima ação real**.

Evite frases internas como “essa feature chega na Fase X”.

O usuário não conhece o planejamento do repositório.

---

# 35. Estados de erro

Demonstre visualmente:

### OCR indisponível

```text
Modelo local não está disponível.
[ Ver configuração ]
[ Tentar novamente ]
```

### Renderer indisponível

```text
O editor continua funcionando.
O render autoritativo está temporariamente indisponível.
```

### Autosave falhou

Não perder conteúdo.

### Conflito

Mostrar claramente:

- meu conteúdo;
- conteúdo atual;
- opções de resolução.

### Importação problemática

Mostrar:

- item;
- razão;
- continuar;
- abortar;
- relatório.

---

# 36. Atalhos e produtividade

A ferramenta deve recompensar uso frequente.

Considere, sem depender deles:

- `Ctrl+K` — busca;
- `Ctrl+S` — salvar imediatamente;
- `Ctrl+V` — capturar imagem quando apropriado;
- atalhos da árvore;
- atalho para nova questão;
- atalho para abrir/fechar IA;
- navegação por teclado;
- foco no editor;
- confirmação rápida.

Mostre os atalhos nos menus e tooltips.

---

# 37. Componentes existentes que devem ser reaproveitados

Investigue antes de propor substitutos.

O design system já fornece conceitos como:

- `Button`;
- `IconButton`;
- `Input`;
- `Field`;
- `Select`;
- `Checkbox`;
- `Toggle`;
- `Combobox`;
- `Badge`;
- `StatusDot`;
- `Chip`;
- `MetricCard`;
- `ArtifactStatus`;
- `EmptyState`;
- `Callout`;
- `Banner`;
- `Modal`;
- `Toast`;
- `Tabs`;
- `Segmented`;
- `Breadcrumb`;
- `PageHeader`;
- `Tree`;
- `Workbench`;
- `Divider`;
- `CommandPalette`;
- `Tooltip`;
- `Popover`;
- `ContextMenu`.

Você pode propor componentes novos.

Porém, para cada novo componente importante, explique:

1. qual problema resolve;
2. por que os componentes existentes não resolvem;
3. como ele entra no mesmo sistema visual.

---

# 38. Novos componentes que provavelmente serão necessários

Investigue e considere algo semelhante a:

- `LibraryPicker`;
- `BookRow` / `PublicationRow`;
- `BookCover`;
- `ImportWizard`;
- `CalibreBrowser`;
- `SourceDocumentViewer`;
- `CaptureToolbar`;
- `CropSelection`;
- `RecognitionReview`;
- `StructuredQuestionReview`;
- `QuestionTypePicker`;
- `AlternativeEditor`;
- `AnswerKeyControl`;
- `OriginCard`;
- `AssetBrowser`;
- `CaptureQueue`;
- `ValidationSummary`;
- `RenderPane`;
- `RevisionTimeline`.

Não adote esses nomes cegamente.

São conceitos para orientar a análise.

---

# 39. Tela obrigatória: seletor do tipo de questão

Faça uma proposta visual de alta qualidade para:

```text
Nova questão

Escolha simples
Uma alternativa correta.

Múltipla escolha
Uma ou mais alternativas corretas.

Discursiva
Resposta aberta, sem alternativas obrigatórias.

Outros tipos
...
```

Não use cards gigantes.

A escolha deve ser rápida.

Pode ser modal, command menu ou popover.

Mostre a decisão de interação.

---

# 40. Tela obrigatória: editor de escolha simples

Demonstrar dados realistas.

Exemplo:

```text
Questão 27

Um capital de R$ 5.000,00 é aplicado a juros compostos...
```

Alternativas contendo fórmulas e valores.

Mostrar:

- enunciado;
- Monaco;
- alternativas;
- uma correta;
- tags;
- dificuldade;
- origem;
- preview;
- render;
- autosave.

---

# 41. Tela obrigatória: editor de múltipla escolha

Use um exemplo diferente.

A diferença visual do gabarito precisa ser clara.

Se escolha simples usa radio-like semantics, múltipla deve usar checkbox-like semantics.

A UI não pode permitir um estado semanticamente impossível sem avisar.

---

# 42. Tela obrigatória: captura por screenshot

Prototipe exatamente:

```text
Ctrl+V
```

e a transição para a área de captura.

Mostrar:

- imagem;
- seleção;
- modo “Questão completa”;
- botão reconhecer;
- status do modelo local.

---

# 43. Tela obrigatória: revisão estruturada do OCR

Este é um dos frames mais importantes.

Quero ver:

### esquerda

recorte original.

### direita

questão interpretada em campos.

Mostrar um erro deliberado para testar a UX.

Por exemplo:

A imagem possui:

```text
x²
```

e o OCR sugeriu:

```text
x^3
```

O usuário percebe comparando com a imagem e corrige antes de salvar.

Esse frame precisa tornar a revisão natural.

---

# 44. Tela obrigatória: importar do Calibre

Prototipe:

1. seleção da biblioteca;
2. catálogo;
3. busca;
4. filtros;
5. resultado com capa;
6. seleção do livro;
7. review de metadata;
8. escolha do PDF/EPUB fonte;
9. importar;
10. livro criado.

Use dados plausíveis.

Exemplo:

```text
Fundamentos de Matemática Elementar
Volume 1 — Conjuntos e Funções

Gelson Iezzi
```

Não dependa especificamente desse livro no design final; é apenas um exemplo realista.

---

# 45. Tela obrigatória: livro vazio

Ao criar/importar um livro que ainda não possui estrutura:

```text
Este livro ainda não possui capítulos ou questões.

[ Criar primeiro capítulo ]
[ Capturar primeira questão ]
[ Importar estrutura ]
```

A captura não deve exigir que a pessoa crie manualmente uma árvore complexa antes de começar.

Se necessário, permita que “Capturar primeira questão” crie uma estrutura mínima ou pergunte onde inserir.

---

# 46. Tela obrigatória: fila de captura

Mostre um fluxo avançado com vários recortes.

Estados visuais:

- pronto;
- reconhecendo;
- revisar;
- erro;
- aprovado.

A pessoa deve poder abrir cada item sem perder a fila.

---

# 47. Tela obrigatória: origem

Mostre a aba/painel `Origem` de uma questão já criada.

A imagem original deve ser acessível.

O objetivo é permitir auditoria editorial.

---

# 48. Tela obrigatória: render e diagnóstico

Mostrar:

- preview rápido;
- PDF;
- PNG;
- Log;
- Fonte quando aplicável;
- erro LaTeX;
- linha;
- clique levando ao editor.

Não faça logs dominarem a UI enquanto tudo está saudável.

---

# 49. Comportamento da criação da questão a partir da captura

Projete explicitamente o destino após a revisão.

Exemplo:

```text
Onde usar?

● Criar nova questão neste grupo
○ Substituir o enunciado da questão atual
○ Inserir no cursor
○ Adicionar como alternativa
○ Adicionar como solução
○ Salvar apenas como asset
```

Não precisa oferecer todas as opções simultaneamente em todos os contextos.

Use contexto para simplificar.

A ação mais comum deve ser óbvia.

---

# 50. Gabarito

O gabarito deve ser tratado como dado editorial crítico.

Para escolha simples:

- exatamente uma correta.

Para múltipla escolha:

- uma ou mais corretas, conforme regra do tipo.

Ao reordenar alternativas:

- o item correto continua correto;
- a letra exibida muda porque deriva da posição.

O protótipo deve tornar isso compreensível.

---

# 51. Metadados e taxonomia

Evite transformar todos os metadados em um formulário gigantesco.

Use agrupamentos como:

```text
Classificação
- dificuldade
- tags

Proveniência
- banca
- instituição
- ano
- número original

Publicação
- editora
- fonte

Contexto profissional
- cargo
- nível
```

Adapte após estudar o schema real.

Use progressive disclosure.

---

# 52. Lixeira

Exclusão não pode ser ambígua.

A árvore atual trabalha com exclusão lógica.

Projete:

- confirmação;
- informação de descendência;
- lixeira;
- restauração;
- impacto em questão associada.

O modelo mental `DocumentNode` versus `Question` é interno.

A pessoa não deve precisar entender essa diferença para saber se sua questão foi excluída.

No design, “Excluir questão” precisa ter uma semântica humana única e previsvisível.

---

# 53. Portabilidade

O usuário precisa confiar que seu acervo é dele.

Inclua no produto sinais discretos de:

- local-first;
- backup;
- exportação;
- `.lbb`;
- funcionamento offline.

Não transforme “local-first” em banner de marketing permanente.

Ele deve aparecer onde é relevante:

- status;
- import/export;
- diagnóstico;
- configuração.

---

# 54. Não vaze conceitos técnicos na UX

Não mostre ao usuário comum:

- Prisma;
- Route Handler;
- provider;
- storageKey;
- workspaceId;
- sha256;
- migrations;
- fases;
- issue numbers;
- DTO;
- repository.

Esses conceitos podem existir em Diagnóstico quando necessários para suporte técnico, não na experiência editorial normal.

---

# 55. Acessibilidade

O protótipo deve considerar:

- navegação por teclado;
- foco visível;
- contraste;
- tooltips;
- labels;
- leitura por screen reader;
- não depender apenas de cor;
- reduced motion;
- alto contraste.

O design system já possui tema high-contrast.

Considere esse contrato.

---

# 56. Performance percebida

A ferramenta possui operações de durações diferentes.

Projete feedback adequado.

### Imediato

- selecionar item;
- editar;
- preview rápido.

### Curto

- salvar;
- filtro;
- busca.

### Mais lento

- render LaTeX;
- OCR;
- carregar modelo local;
- importação.

Nunca usar spinner genérico em toda a tela se a pessoa puder continuar trabalhando.

Mostre o que está acontecendo no contexto da ação.

---

# 57. Desktop profissional, não web page

Evite:

- páginas verticais enormes;
- scroll principal infinito;
- cards empilhados como landing page;
- seções de 700 px de altura;
- espaços vazios que desperdiçam viewport.

Prefira:

- painéis;
- split views;
- inspectors;
- tabs;
- drawers;
- command menus;
- dialogs;
- contextual sidebars;
- statusbar.

O produto precisa parecer uma **ferramenta de trabalho instalada**, mesmo sendo web.

---

# 58. Hierarquia visual

Em qualquer frame, deve ser evidente:

1. **qual é o objeto atual**;
2. **qual é a ação principal**;
3. **qual conteúdo está sendo editado**;
4. **qual é o estado desse conteúdo**;
5. **qual é a origem**;
6. **o que precisa de revisão**.

Não use vários botões primários na mesma região.

---

# 59. Design para repetição

O caso de uso real envolve cadastrar muitas questões.

Desenhe para a 100ª questão, não apenas para a primeira.

Reduza:

- modais desnecessários;
- navegação de ida e volta;
- preenchimento repetido;
- seleção redundante de livro;
- confirmação sem risco;
- passos que a aplicação já consegue inferir com segurança.

Preserve confirmação em:

- exclusão;
- aplicação de mudança de IA;
- importação destrutiva;
- ações que afetem gabaritos;
- conflitos.

---

# 60. Informações herdáveis

Ao criar várias questões dentro de um mesmo livro/grupo, considere UX para herdar:

- livro;
- capítulo;
- banca;
- ano;
- instituição;
- tags;
- origem;
- fonte.

O design pode oferecer:

> Usar os mesmos metadados da questão anterior

ou comportamento equivalente.

Não definir regra de negócio sem validar no repositório.

A ideia é reduzir trabalho repetitivo.

---

# 61. Cenário principal para o protótipo clicável

Monte uma história única e coerente.

## Cenário

Francisco abre o LatexBookBank.

Ainda não existe o livro que ele deseja trabalhar.

### Passo 1
Ele abre sua Biblioteca “Livros de Matemática”.

### Passo 2
Clica em **Adicionar livro**.

### Passo 3
Escolhe **Importar do Calibre**.

### Passo 4
Seleciona sua biblioteca local do Calibre.

### Passo 5
Busca por um livro de matemática.

### Passo 6
Visualiza capa e metadados.

### Passo 7
Seleciona o PDF como fonte.

### Passo 8
Confirma a importação.

### Passo 9
O livro aparece no LatexBookBank.

### Passo 10
Abre o Workbench.

### Passo 11
Cria:

```text
Capítulo 1
└── Questões
```

### Passo 12
Abre o PDF da origem.

### Passo 13
Vai até uma página.

### Passo 14
Recorta uma questão de escolha simples.

### Passo 15
Escolhe:

```text
Questão completa
```

### Passo 16
O modelo local reconhece:

- enunciado;
- fórmula;
- cinco alternativas.

### Passo 17
A tela mostra imagem e estrutura lado a lado.

### Passo 18
Francisco corrige um expoente.

### Passo 19
Marca a alternativa correta.

### Passo 20
Clica:

```text
Criar questão
```

### Passo 21
A questão passa a existir na árvore.

### Passo 22
O Monaco abre com o LaTeX.

### Passo 23
O preview rápido aparece.

### Passo 24
Ele executa o render autoritativo.

### Passo 25
O PDF final aparece.

### Passo 26
A questão é validada.

### Passo 27
Ele fecha o aplicativo.

### Passo 28
Ao voltar, o produto oferece:

```text
Continuar: Capítulo 1 · Questão 1
```

Este caminho deve ser clicável no protótipo.

---

# 62. Segundo cenário obrigatório: screenshot da internet

Demonstre também um fluxo curto.

Francisco já está dentro de um grupo de questões.

Ele copia uma imagem da internet.

No LatexBookBank:

```text
Ctrl+V
```

A captura abre.

Ele recorta.

Seleciona `Questão completa`.

O reconhecimento acontece localmente.

A questão é estruturada.

Ele revisa.

Clica:

```text
Criar e continuar capturando
```

A questão é salva e a captura fica pronta para receber a próxima.

Esse fluxo mostra a velocidade necessária para alimentar um banco de questões.

---

# 63. Terceiro cenário obrigatório: questão criada manualmente

Demonstre:

```text
Nova questão
→ Escolha simples
```

sem OCR.

O usuário:

- escreve o enunciado;
- cria alternativas;
- marca uma correta;
- adiciona tag;
- define dificuldade;
- renderiza;
- salva.

O produto não pode depender de IA para funcionar.

---

# 64. Quarto cenário obrigatório: múltipla escolha

Demonstre:

```text
Nova questão
→ Múltipla escolha
```

com três respostas corretas.

A UI deve tornar inequívoca a diferença para escolha simples.

---

# 65. Quinto cenário obrigatório: questão discursiva

Demonstre:

- enunciado;
- resposta esperada;
- solução;
- preview;
- metadados.

Sem alternativas vazias ocupando espaço.

---

# 66. Navegação esperada no protótipo

Não entregue apenas frames.

Crie links e interações suficientes para demonstrar:

```text
Home
→ Biblioteca
→ Adicionar livro
→ Calibre
→ Livro
→ Workbench
→ Nova questão
→ Captura
→ Revisão OCR
→ Editor
→ Render
```

Inclua também rotas alternativas:

```text
Nova questão manual
Questão de múltipla escolha
Questão discursiva
```

---

# 67. Fidelidade visual

O protótipo deve ser **high fidelity**.

Não entregar:

- wireframe cinza;
- caixas sem identidade;
- lorem ipsum;
- skeleton de ideia;
- telas conceituais sem dados.

Use:

- dados plausíveis;
- fórmulas;
- textos de questão;
- capas;
- breadcrumbs;
- status;
- tags;
- metadados;
- tooltips;
- menus;
- estados.

A intenção é conseguir olhar o protótipo e decidir:

> “É assim que quero trabalhar.”

---

# 68. O que pode mudar em relação à interface existente

Você pode propor mudanças fortes de UX quando elas resolvem a jornada.

Mas classifique cada alteração como:

### A. Reorganização visual
Nenhuma mudança relevante de domínio.

### B. Novo componente
Usa APIs existentes.

### C. Lacuna funcional
Exige novo caso de uso/backend.

### D. Evolução futura
Não bloqueia o Beta Editorial.

Isso é importante porque queremos separar:

**design que podemos implementar imediatamente**

de:

**design que exige desenvolvimento novo**.

---

# 69. Lacunas já identificadas que o protótipo deve resolver

Durante sua análise, verifique diretamente no código, mas parta destas hipóteses:

## 69.1 Criar Publication

A interface atual lista publicações, mas o fluxo editorial para cadastrar um livro novo precisa ser evidente.

Projete-o.

## 69.2 Criar Question

Hoje há excelente edição de questões existentes, mas precisamos de um fluxo de produto explícito para uma nova questão real.

Projete-o como P0.

## 69.3 OCR → persistência

O reconhecimento atual produz conteúdo para revisão, mas a jornada precisa terminar diretamente em:

- nova questão;
- ou atualização da questão atual.

Não aceite clipboard manual como solução final.

## 69.4 Navegação da busca

Resultado global deve navegar até o objeto real.

## 69.5 Calibre

Precisamos do fluxo de absorção de livros do Calibre.

---

# 70. Beta Editorial

Use este conceito para priorizar seu design:

> **Beta Editorial = Francisco consegue cadastrar um livro real e produzir questões reais sem depender de seed, banco manual, Prisma Studio ou dados previamente importados.**

O protótipo deve mostrar o produto atingindo esse estado.

Não priorize antes disso:

- refinamento decorativo periférico;
- dashboards avançados;
- recursos enterprise;
- colaboração;
- multiusuário;
- billing;
- SaaS;
- analytics genéricos.

---

# 71. Critérios de sucesso

O design será considerado bem sucedido se um usuário conseguir responder visualmente, sem documentação:

### Biblioteca
- Como crio uma?
- Como abro uma?

### Livro
- Como cadastro?
- Como importo do Calibre?
- Onde vejo a fonte?
- Como abro no editor?

### Estrutura
- Como crio capítulo?
- Como crio seção?
- Como crio grupo?
- Como crio questão?

### Questão
- Qual tipo estou criando?
- Onde escrevo?
- Onde estão alternativas?
- Onde marco o gabarito?
- Onde ficam tags?
- Onde vejo a origem?

### Captura
- Onde colo screenshot?
- Onde abro PDF?
- Como recorto?
- O que o modelo reconheceu?
- Como corrijo?
- Como transformo isso numa questão?

### LaTeX
- Onde edito?
- Onde vejo preview?
- Onde renderizo?
- Onde vejo erro?

### Continuidade
- Foi salvo?
- Está válido?
- Posso fechar?
- Como continuo amanhã?

---

# 72. Antiobjetivos

Não quero que o resultado seja:

### “um Notion de questões”
Genérico demais.

### “um dashboard escolar”
Não é um LMS.

### “um Overleaf simplificado”
A árvore editorial e a captura de questões são centrais.

### “um CRUD com sidebar”
Pouco produtivo.

### “um ChatGPT com editor ao lado”
IA é auxiliar.

### “uma galeria de livros”
O objetivo não é admirar capas; é produzir conteúdo.

### “um gerenciador de arquivos”
Publications e Questions são objetos editoriais estruturados.

---

# 73. Microinterações importantes

Inclua no protótipo ou especifique:

- hover da árvore;
- seleção;
- drag target;
- drop position;
- autosave;
- flash discreto de “salvo”;
- render progress;
- OCR progress;
- confiança baixa;
- revisão pendente;
- criação concluída;
- toast apenas quando apropriado;
- inline validation;
- confirmação de exclusão;
- abertura do painel IA;
- expansão de metadata.

Movimento deve ser discreto e funcional.

---

# 74. Visual da captura

A captura pode fugir um pouco da geometria tradicional do editor se isso melhorar a tarefa.

Considere um “Capture Studio” com:

```text
sidebar/fila
+
canvas central
+
painel de interpretação
```

ou uma variação coerente.

Mas ela precisa continuar pertencendo ao mesmo produto.

Não crie um segundo design system.

---

# 75. Modo foco

Considere modo foco para:

### Editor

maximizar Monaco.

### Captura

maximizar documento.

### Revisão OCR

maximizar comparação original × interpretação.

Use fullscreen interno do Workbench, não uma nova aplicação.

---

# 76. Livro como contexto persistente

Enquanto o usuário trabalha em um livro:

- nome do livro;
- caminho na árvore;
- página/fonte quando relevante

devem continuar reconhecíveis.

Não obrigue o usuário a reescolher o livro a cada captura.

---

# 77. Capturar diretamente para uma posição da árvore

Projete fluxo como:

```text
Capítulo 3
└── Exercícios
    └── [ Capturar nova questão aqui ]
```

Ao iniciar a captura a partir desse contexto, o destino já está escolhido.

Na revisão, o CTA pode ser simplesmente:

```text
Criar questão em “Exercícios”
```

Reduza decisões repetitivas.

---

# 78. Captura sem destino prévio

Se a pessoa inicia captura globalmente:

```text
Capturar questão
```

então, antes de salvar, a interface deve perguntar:

```text
Biblioteca
Livro
Destino na árvore
```

Use combobox/árvore de destino.

Não perca o recorte se a pessoa navegar para escolher o destino.

---

# 79. Livro e PDF fonte

Quando um livro possui PDF fonte, ofereça affordance clara:

```text
Abrir fonte
```

A pessoa deve poder:

- navegar;
- capturar;
- criar questão;
- voltar ao editor.

Idealmente o fluxo não abre várias abas do navegador sem necessidade.

---

# 80. Relação entre livro e questão

Uma publicação técnica pode conter:

- texto editorial;
- capítulos;
- notas;
- figuras;
- questões.

Não trate o livro apenas como uma pasta de questões.

A árvore precisa continuar genérica.

Ao mesmo tempo, o fluxo **Nova questão** deve ser de primeira classe.

---

# 81. Relação com o legado

O aplicativo desktop legado é uma especificação executável.

O novo produto não deve copiar sua aparência.

Ele deve preservar o que funcionava conceitualmente:

- biblioteca;
- árvore;
- captura;
- OCR;
- edição LaTeX;
- assets;
- tags;
- estrutura.

E remover fricções históricas.

Se encontrar código legado disponível no repositório/referências, use-o para compreender comportamento, não para copiar layout.

---

# 82. Calibre: experiência de catálogo

No browser do Calibre, considere uma lista densa com modo de detalhes.

Exemplo:

```text
[ busca __________________________________ ]

Formatos: Todos | PDF | EPUB
Série: Todas
Tags: ...

┌ capa ┐  Fundamentos de Matemática Elementar
│      │  Gelson Iezzi
└──────┘  Série FME · Volume 1
          PDF · EPUB
          [ Importar ]
```

Ao selecionar:

painel lateral ou página mostra metadados completos.

Não use grid de capas estilo streaming como única visualização.

Este é um catálogo técnico.

---

# 83. Matching de livros já importados

Como evolução de UX, considere mostrar:

```text
Já existe no LatexBookBank
```

quando ISBN/título/origem indicar possível duplicata.

Não bloquear automaticamente.

Permitir:

- abrir existente;
- comparar;
- importar mesmo assim quando necessário.

Classifique como evolução se backend ainda não suporta.

---

# 84. Revisão editorial de alternativas

Ao detectar cinco alternativas por OCR:

- separar visualmente cada uma;
- permitir merge/split;
- reordenar;
- marcar correta;
- editar LaTeX individualmente.

Uma falha comum do reconhecimento será:

```text
A alternativa B e C foram lidas como um único bloco.
```

A interface precisa permitir corrigir isso sem voltar ao OCR do zero.

---

# 85. Ambiguidade de reconhecimento

Quando algo for incerto, mostre isso no lugar certo.

Exemplo:

```text
x²
```

com baixa confiança.

O sistema pode destacar o trecho.

Evite apenas um score geral:

```text
confiança 82%
```

sem indicar onde está o problema.

Se o provider atual não fornece confiança granular, classifique essa UI como evolução futura.

---

# 86. Reconhecimento de gabarito

Nunca assuma silenciosamente que um item visualmente marcado é o gabarito.

Se o sistema suspeitar:

```text
Possível resposta correta: C
```

a interface deve exigir confirmação.

Especialmente em material de aluno, uma marca pode ser resposta dada, não gabarito oficial.

---

# 87. Questão e número original

Preserve a identificação editorial do livro:

```text
Questão 27
Questão II
Exercício 6
```

A UI deve distinguir:

- posição atual na árvore;
- rótulo original da fonte.

Reordenar internamente não pode destruir o número original.

---

# 88. Indicadores da árvore

Uma linha de questão pode mostrar discretamente:

- tipo;
- número de alternativas;
- status;
- problema.

Exemplo conceitual:

```text
▸ 27. Juros compostos        5   ✓
```

Não coloque seis badges.

Use prioridade e tooltips.

---

# 89. Conflito entre densidade e legibilidade

O EduLingo DS Admin possui controles compactos e corpo pequeno porque esta é uma IDE.

Preserve isso na área de trabalho.

Mas telas de onboarding/importação podem respirar um pouco mais.

Regra:

```text
compreender → mais espaço
produzir → mais densidade
```

---

# 90. Entrega esperada

Sua resposta precisa conter quatro artefatos conceituais.

## Entrega 1 — Auditoria UX do estado atual

Breve e objetiva.

Separar:

- o que manter;
- o que reorganizar;
- o que falta;
- o que está tecnicamente pronto mas mal conectado na jornada.

Não gastar a maior parte do trabalho aqui.

## Entrega 2 — Arquitetura da experiência

Mapa das telas e fluxos.

## Entrega 3 — Protótipo high fidelity navegável

Esta é a entrega principal.

## Entrega 4 — Handoff

Para cada frame/tela importante, informar:

- objetivo;
- ação principal;
- componentes existentes reutilizados;
- componentes novos;
- APIs/casos de uso que já parecem existir;
- lacunas de backend;
- estados importantes.

---

# 91. Frames mínimos

Crie, no mínimo, frames de alta fidelidade para:

1. Home — usuário recorrente;
2. Home — primeira utilização;
3. Biblioteca;
4. Criar biblioteca;
5. Adicionar livro — seletor da origem;
6. Importar do Calibre — catálogo;
7. Importar do Calibre — revisão de metadados;
8. Livro — overview;
9. Livro vazio;
10. Workbench com árvore;
11. Menu `Adicionar`;
12. Seletor de tipo de questão;
13. Questão de escolha simples;
14. Questão de múltipla escolha;
15. Questão discursiva;
16. Capture Studio — screenshot colado;
17. Capture Studio — PDF;
18. Capture Studio — recorte;
19. Reconhecimento em andamento;
20. Revisão OCR simples;
21. Revisão estruturada de questão completa;
22. Erro/baixa confiança no OCR;
23. Fila de captura;
24. Aba Origem;
25. Asset/figura;
26. Preview rápido;
27. Render PDF;
28. Diagnóstico LaTeX;
29. Histórico/revisão;
30. IA fechada;
31. IA aberta com proposta;
32. Busca global;
33. Lixeira;
34. Import/export.

Você pode combinar frames quando a interação for suficientemente clara.

---

# 92. Não produza apenas uma nova skin

O objetivo não é trocar cores e arredondamentos.

O principal trabalho é **interaction design**.

Pergunte para cada frame:

- O que a pessoa está tentando fazer?
- O que ela já sabe?
- O que o sistema já sabe?
- Qual decisão é realmente necessária?
- Qual trabalho pode ser eliminado?
- Como o usuário percebe que deu certo?
- Como recupera quando dá errado?

---

# 93. Faça o design revelar implementação necessária

Ao final, entregue uma tabela semelhante a:

| Fluxo | UI | Backend atual | Gap | Prioridade |
|---|---|---|---|---|
| Criar biblioteca | novo | verificar | ... | P0 |
| Criar livro manual | novo | parcial | ... | P0 |
| Importar Calibre | novo | não existe/parcial | ... | P0/P1 |
| Criar questão | novo | lacuna | ... | P0 |
| Captura imagem | existente | existe | integrar | P0 |
| OCR → questão | redesenhar | parcial | persistência estruturada | P0 |
| Editor LaTeX | manter/evoluir | maduro | pequenos ajustes | P0 |
| Render | manter | maduro | UX | P0 |

Não aceite minhas hipóteses como verdade sem conferir o repositório.

---

# 94. Regra de prioridade

Quando houver conflito entre:

- fazer uma tela mais bonita;
- reduzir um passo da jornada principal;

priorize **reduzir o passo da jornada principal**.

Quando houver conflito entre:

- adicionar recurso;
- tornar explícita uma ação crítica existente;

priorize **tornar explícita a ação crítica**.

---

# 95. Definição de “rebuscado”

“Rebuscado” aqui não significa decorado.

Significa:

- muitos estados previstos;
- fluxo profundo;
- microinterações;
- dados realistas;
- hierarquia;
- consistência;
- produtividade;
- navegação;
- atalhos;
- revisões;
- erros;
- recovery;
- empty states;
- diferenças semânticas entre tipos;
- componentes bem pensados;
- excelente uso de espaço;
- sensação de produto maduro.

Visualmente, continue sóbrio.

---

# 96. Pergunta que o protótipo deve responder

Ao terminar, eu quero conseguir olhar o protótipo e responder:

> “Se eu sentar amanhã com um livro de matemática, consigo cadastrar esse livro, navegar pelo PDF, recortar as questões, deixar a máquina reconhecer texto e matemática, revisar, salvar em LaTeX, organizar por capítulo, marcar gabarito, adicionar solução, renderizar e continuar trabalhando depois?”

Se a resposta visual não for inequivocamente **sim**, o protótipo ainda não está pronto.

---

# 97. Regra final: não entrar no loop anterior

Não gaste este trabalho criando outra auditoria gigantesca do checklist.

Não continue refinando infraestrutura invisível.

Não proponha novas waves arquiteturais.

Não transforme o protótipo em documentação.

**Desenhe o produto que a pessoa vai usar.**

A infraestrutura já avançou muito.

Agora precisamos fechar a experiência.

---

# 98. Comece assim

Antes de criar os frames:

1. leia o repositório;
2. resuma em no máximo 10 bullets o modelo atual da interface;
3. liste as 5 maiores lacunas da jornada;
4. defina a arquitetura de informação proposta;
5. então construa o protótipo.

Não pare pedindo aprovação entre esses passos.

Prossiga até conseguir apresentar o fluxo high fidelity completo.

---

# 99. Resultado final esperado

Quero receber um protótipo que possa servir como **fonte visual da próxima etapa de implementação do LatexBookBank**.

Ele deve ser suficientemente específico para que, depois de aprovado, um time de desenvolvimento consiga transformar cada fluxo em issues implementáveis.

A prioridade absoluta é:

```text
BIBLIOTECA
→ LIVRO
→ ESTRUTURA
→ QUESTÃO
→ CAPTURA
→ RECONHECIMENTO
→ REVISÃO
→ LATEX
→ RENDER
→ ACERVO PERSISTIDO
```

Esse é o LatexBookBank que precisamos desenhar.
