# Busca: `LIKE` ou FTS5? — a decisão, com números

**Decisão: `LIKE` via Prisma, sem FTS5.** E a medição mudou o desenho da consulta pelo caminho.

Fase 12 · issue #113 · `apps/web/scripts/benchmark-search.ts`

---

## Como foi medido

Corpus **sintético** num banco SQLite descartável — o acervo real não está nesta máquina, e para
a pergunta "qual motor" a escala importa mais que a procedência: o que se quer saber é onde
`LIKE` deixa de servir, e isso depende do número de linhas.

Texto plausível: doze assuntos, seis bancas, cinco verbos de enunciado e um parágrafo de
preenchimento com `\SI{1000}{\real}`. Mediana de sete execuções por caso, para o primeiro acesso
— que paga o cache frio — não contaminar o número.

Para comparação: o acervo legado tem **297 linhas**. A medição de 200 mil é 670 vezes maior.

## Os números

### 20.000 questões

| caso | `LIKE` top-50 | FTS5 top-50 | `LIKE` COUNT | FTS5 COUNT | linhas que casam |
|---|---:|---:|---:|---:|---:|
| termo raro | 0,21 ms | 0,03 ms | **8,23 ms** | 0,14 ms | 1.666 |
| termo comum | 0,06 ms | 0,04 ms | **9,41 ms** | 1,41 ms | 20.000 |
| duas palavras | 0,17 ms | 0,09 ms | **10,34 ms** | 0,42 ms | 1.667 |
| prefixo | 0,34 ms | 0,14 ms | **15,50 ms** | 0,20 ms | 1.667 |

Índice FTS5: 264 ms para construir.

### 200.000 questões

| caso | `LIKE` top-50 | FTS5 top-50 | `LIKE` COUNT | FTS5 COUNT | linhas que casam |
|---|---:|---:|---:|---:|---:|
| termo raro | 0,20 ms | 0,03 ms | **81,52 ms** | 0,91 ms | 16.666 |
| termo comum | 0,03 ms | 0,03 ms | **70,18 ms** | 9,59 ms | 200.000 |
| duas palavras | 0,11 ms | 0,05 ms | **68,61 ms** | 3,11 ms | 16.667 |
| prefixo | 0,15 ms | 0,61 ms | **84,68 ms** | 2,06 ms | 16.667 |

Índice FTS5: 2.476 ms para construir.

## O que os números dizem

**A busca não é o problema.** Com `LIMIT 50`, o `LIKE` responde em **0,2 ms** mesmo em 200 mil
linhas — porque o banco para no quinquagésimo acerto e nunca varre o resto. Multiplicar o corpus
por dez não mudou esse número.

**A contagem é.** O `COUNT(*)` da mesma condição salta de 8 ms para 85 ms, porque não existe
"parar cedo" numa contagem. Foi a única coisa que escalou com o corpus, e escalou linearmente.

Ou seja: a diferença de 60× entre `LIKE` e FTS5 que aparece na tabela **não é sobre buscar** — é
sobre contar. A primeira versão do adaptador rodava as duas consultas em paralelo para a tela
poder dizer "50 de 312", e teria pago 85 ms por busca ao custo de um número que ninguém precisa.

## O que mudou por causa disso

O adaptador pede **`limit + 1` linhas e nenhum `COUNT`**. Se voltou mais que a página, existe
mais — que é a pergunta real de quem busca. O total exato só aparece quando é de graça: quando a
página não encheu, o total *é* o que veio.

O ganho: a busca custa 0,2 ms em qualquer escala testada, e a resposta "tem mais" custa uma
linha.

## Por que não FTS5

1. **Não é necessário.** No acervo real (297 questões) e em 670 vezes ele, `LIKE` com `LIMIT`
   responde em fração de milissegundo. Adotar FTS5 hoje seria pagar complexidade por um problema
   que a medição não encontrou.

2. **Custa portabilidade.** `MATCH` e `fts5` não existem no PostgreSQL, e usá-los exigiria
   `$queryRaw` — SQL cru amarrado ao motor, dentro da camada que a Fase 6.5 existiu para manter
   trocável. O `QuestionSearchService` continua agnóstico: quando o PostgreSQL entrar, um
   adaptador com `tsvector` substitui este sem que nenhum caso de uso saiba.

3. **Custa sincronização.** A tabela FTS5 é uma segunda cópia do texto, com gatilhos ou
   reindexação para não divergir. Um índice desatualizado some com a questão da busca — falha
   silenciosa e difícil de perceber, do tipo que este projeto vem evitando de propósito.

## Quando reabrir a decisão

- **Busca por relevância**, e não só por ocorrência. `LIKE` não ordena por pertinência; FTS5 tem
  BM25. Se ranquear virar requisito, o argumento muda inteiro.
- **Radical e acento.** `LIKE` não acha "funções" procurando "funcao". FTS5 com `unicode61`
  resolve; hoje o custo cai sobre quem digita.
- **`LIKE` acima de 200 ms na top-50**, que a medição não conseguiu produzir nem com 200 mil
  linhas.

O script fica versionado: `bun scripts/benchmark-search.ts [linhas]` reproduz a medição em
qualquer máquina, e o banco descartável é apagado no fim.
