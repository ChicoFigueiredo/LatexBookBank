# Spike do Calibre — decisão antes do wizard

> §27 do prompt do time: "antes de codificar o wizard inteiro, executar uma spike curta".
> Executada contra uma biblioteca **real** do acervo do Chico: 64 livros, 111 arquivos,
> `metadata.db` de 282 KB. Nada aqui é hipótese.

## As dez perguntas

### 1. Como localizar a biblioteca Calibre?

Pelo `metadata.db` na raiz da pasta. Não existe registro central confiável entre plataformas — o
Calibre guarda o caminho da última biblioteca na config do usuário, que muda de lugar em cada SO e
não existe quando o Calibre nunca rodou naquela máquina.

**Decisão:** o usuário aponta a pasta. É um passo a mais e é o único que funciona em Windows,
Linux e WSL sem heurística que erra em silêncio. Uma sugestão de caminho provável pode entrar
depois, como conveniência — nunca como requisito.

### 2. Como ler o `metadata.db`?

É SQLite puro, 24 tabelas, esquema estável há mais de uma década. O que interessa:

| Tabela                | Para quê                                             |
| --------------------- | ---------------------------------------------------- |
| `books`               | título, `sort`, `pubdate`, `isbn`, `path`, `uuid`, `has_cover` |
| `data`                | um registro por **formato**: `format`, `name`, `uncompressed_size` |
| `authors` + link      | autores, com ordem                                   |
| `publishers` + link   | editora                                              |
| `series` + link       | coleção e `series_index`                             |
| `identifiers`         | `isbn`, `mobi-asin`, `epubbud` — chave/valor          |
| `languages` + link    | `eng`, `por`, `spa`                                  |
| `comments`            | sinopse                                              |

Lê-se **somente leitura**, e por cópia: abrir o arquivo do usuário em modo escrita arriscaria
corromper a biblioteca dele se o Calibre estiver aberto ao mesmo tempo.

### 3. Quais formatos?

Na biblioteca real: EPUB 60, MOBI 36, **PDF 12**, CHM 2, AZW 1. Um livro tem vários formatos —
111 arquivos para 64 livros.

**O PDF é o que importa** para o LatexBookBank: é dele que sai recorte e reconhecimento. EPUB e
MOBI entram como origem registrada, sem servir de fonte de captura por enquanto.

### 4. Windows / Linux / WSL?

O caminho no `books.path` é **relativo** e usa `/` como separador em todas as plataformas —
`"Marcus du Sautoy/A Musica dos Numeros Primos (3)"`. O nome do arquivo vem de `data.name`, **sem
extensão**: o arquivo real é `<name>.<format em minúsculas>`.

Em WSL a biblioteca é alcançável por `/mnt/<letra>/...`. Confirmado nesta spike — a leitura acima
saiu de `/mnt/u/...`.

### 5. Como um app web local acessa o diretório?

Pelo **servidor**, não pelo navegador. O Next.js roda no mesmo computador (D24: local-first), e o
`fs` do servidor lê a pasta que o usuário apontou. O navegador nunca vê caminho de disco.

A alternativa — `showDirectoryPicker` da File System Access API — foi descartada: só existe no
Chromium, exige gesto por sessão, e não daria para ler o `metadata.db` como SQLite sem carregar o
arquivo inteiro na memória do navegador.

### 6. Precisa de helper local?

**Não.** A leitura é de arquivo e de SQLite, e o servidor já faz as duas. `calibredb` não está
instalado nesta máquina e depender dele criaria requisito que o produto não controla.

### 7. Copiar ou referenciar os arquivos?

**Copiar** para o storage gerenciado, como a §29 prefere. O que se ganha: backup, `.lbb`, hash,
portabilidade e consistência — um acervo que referencia arquivos externos vira um acervo quebrado
no dia em que a pasta do Calibre muda de lugar.

Custo medido: os 12 PDFs desta biblioteca somam **102 MB** no disco. É aceitável, e só os PDFs
dos livros efetivamente importados são copiados — não a biblioteca inteira.

### 8. Como importar a capa?

`has_cover = 1` significa `cover.jpg` na pasta do livro. Confirmado no livro 3. Vira `Asset` de
capa pelo mesmo `StorageProvider`.

### 9. Como preservar a metadata da origem?

`Publication.metadataJson` guarda o que não tem coluna — `uuid` do Calibre, `series_index`,
identificadores que não são ISBN. O `uuid` é a chave de idempotência: reimportar o mesmo livro
encontra o que já entrou em vez de duplicar.

### 10. Como lidar com duplicidade?

Três sinais, nesta ordem: `uuid` do Calibre (exato), ISBN normalizado (exato), título + autor
(sugestão). O primeiro e o segundo bloqueiam a importação com "este livro já está no acervo"; o
terceiro **avisa** e deixa decidir — dois volumes de uma coleção têm títulos parecidos de
propósito.

## Decisão

Adapter, nunca contaminação (§28). A fronteira é `LibraryCatalogProvider`, com uma implementação
`CalibreCatalogProvider` que lê o `metadata.db` e devolve `PublicationDraft` — o mesmo formato que
o cadastro manual já produz. Nenhuma tabela, id ou caminho do Calibre atravessa para o domínio.

```text
pasta apontada → metadata.db (somente leitura, por cópia)
  → CalibreCatalogProvider → PublicationDraft[]
  → revisão do usuário → createPublication (o mesmo caso de uso do cadastro manual)
  → cópia do PDF e da capa para o StorageProvider
```

## O que a implementação achou depois

O wizard foi implementado sobre este desenho (`CalibreCatalogProvider`, `importFromCatalog`,
`/bibliotecas/[slug]/livros/calibre`). Rodar contra a biblioteca real achou duas coisas que
nenhuma fixture teria achado:

- **`lower()` do SQLite só rebaixa ASCII.** "TRIBUTÁRIO" vira "tributÁrio", e procurar
  "tributário" devolvia zero num catálogo de 64 livros. O filtro passou a acontecer em memória,
  com `NFD` + `toLocaleLowerCase("pt-BR")` dos dois lados. Teste: `calibre-search.test.ts`.
- **`series_index` é `1.0` em todo livro**, com ou sem coleção. Importado literalmente, todo livro
  avulso do acervo viraria "volume 1". O volume só entra quando há série.

Importação real verificada: `CURSO DE DIREITO TRIBUTÁRIO COMPLETO — 4ª EDIÇÃO`, PDF de 2,7 MB e
capa de 178 KB copiados para o storage gerenciado, origem gravada em `metadataJson` com o `uuid`
do Calibre. Reimportar o mesmo livro é recusado com 409 e oferece abrir o que já existe.

Segurança (§75): o caminho apontado precisa ser absoluto e sem `\0`; cada arquivo lido é
resolvido e conferido contra a raiz, então um `books.path` com `../` — que o Calibre não produz,
mas um banco editado à mão produz — é recusado. Os arquivos são tratados como **dados** e nada é
executado. O `metadata.db` é aberto sobre uma **cópia**, nunca o arquivo do usuário.
