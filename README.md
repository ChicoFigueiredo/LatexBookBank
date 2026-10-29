# LatexBookBank

Biblioteca técnica, IDE LaTeX editorial e banco de questões estruturado.

Aplicação **local-first, cloud-ready**: roda inteira na sua máquina, com a internet desligada, mas
sem que nenhuma regra de negócio saiba qual infraestrutura está por trás.

- [Glossário](CONTEXT.md) — o que cada palavra significa neste projeto, e qual usar
- [Beta Editorial](docs/_atual/beta-editorial.md) — a matriz Design → Código, o que ficou pronto e o que não
- [Planejamento de execução](docs/_atual/_planejamento.md) — decisões, arquitetura, as 21 fases
- [Decisões arquiteturais](docs/adr/) — as que são caras de reverter, uma por arquivo
- [Checklist](docs/_atual/_checklist.md) — instrumento de controle, item a item
- [Especificação mestra](docs/prompts/260806-01.LatexBookBank_Web_Especificacao_Mestra.md)

## Começando

```bash
bun install
bun run setup       # .env.local, migrations, seed e verificação de dependências
bun run dev         # http://localhost:28080
```

Requisitos: **Bun ≥ 1.3** e Docker. Node **não** é necessário — o CLI do Prisma roda sob Bun.
TeX no host é **opcional**: o render roda no worker em Docker (Fase 6), e o `pdflatex` local
serve só como fallback.

## Scripts

| Comando             | O que faz                          |
| ------------------- | ---------------------------------- |
| `bun run setup`     | Prepara o ambiente local           |
| `bun run dev`       | Sobe o app em `28080`              |
| `bun run build`     | Build de produção                  |
| `bun run lint`      | ESLint em todos os pacotes         |
| `bun run typecheck` | `tsc --noEmit` em todos os pacotes |
| `bun run test`      | Vitest em todos os pacotes         |
| `bun run format`    | Prettier                           |
| `bun db:seed`       | Popula dados de demonstração       |
| `bun db:studio`     | Prisma Studio em `28001`           |

## Portas

Bloco `28xxx`, escolhido **abaixo de 32768** para ficar fora da faixa efêmera do kernel
(`32768–60999`) — serviços fixados ali colidem com conexões de saída aleatórias.

|   Porta | Serviço                                     |
| ------: | ------------------------------------------- |
| `28080` | Aplicação Next.js                           |
| `28081` | Aplicação do E2E (banco e storage próprios) |
| `28900` | Worker de render LaTeX (Fase 6)             |
| `28432` | PostgreSQL em Docker (apenas Fase 6.5)      |
| `28001` | Prisma Studio                               |

O app escuta **só em `127.0.0.1`**, e o `apps/web/proxy.ts` recusa `Host` que não seja desta
máquina e escrita vinda de outra origem. A API não tem autenticação: quem alcança a porta lê e
apaga o acervo, e a rede local, o DNS rebinding e o CSRF ficam de fora por essas duas camadas.

## Estrutura

```
apps/web/
├─ app/                       # App Router — a raiz de composição; api/http.ts traduz erro
└─ src/
   ├─ modules/                # domínio, por área de negócio
   │  └─ <módulo>/  domain/ · application/ · infrastructure/ · ui/
   ├─ design-system/          # tokens + componentes
   ├─ shared/                 # portas, env(), cliente HTTP da tela, camada de texto do PDF
   └─ infrastructure/         # só o transversal: composition.ts, banco, storage local, IA
packages/render-contract/     # o RenderBundle e o RenderResult
services/renderer/ · backup/
```

O adaptador de um módulo mora no `infrastructure/` dele; `src/infrastructure` guarda o que é de
todos. A árvore completa está na [§4.6 do planejamento](docs/_atual/_planejamento.md).

## Convenções

**Fluxo obrigatório.** A escrita não pula etapa:

```
UI (cliente tipado) → Route Handler → Use Case → Domain → Repository/Provider → Infraestrutura
```

- A **leitura** de tela é do Server Component, que lê o read model da infraestrutura do módulo
  direto, sem rota no meio. Página nunca escreve.
- A rota lê e recusa a entrada **à mão**, e o domínio aceita `unknown` quando é ele quem sabe se o
  dado serve; Zod só onde o schema é rico (o patch do agente, o `.lbb`, a resposta da IA).
- A resposta tem **contrato**: o tipo mora em `modules/<m>/application/*-contract.ts`, a rota o
  anota com `satisfies`, e a tela o lê pelo cliente `modules/<m>/ui/*-client.ts`
  ([ADR 0010](docs/adr/0010-o-contrato-da-rota-e-um-tipo.md)).
- O **erro** se traduz numa tabela só, `app/api/http.ts`
  ([ADR 0011](docs/adr/0011-a-borda-traduz-o-erro.md)).
- As portas transversais saem de `src/infrastructure/composition.ts`, que lê o ambiente por
  `env()`: funções, e não container.

O desenho inteiro está na [§4.4 do planejamento](docs/_atual/_planejamento.md).

**As quatro fronteiras primárias de infraestrutura.** São os pontos onde o produto toca o mundo:
`Repository` · `StorageProvider` · `RenderExecutor` · `AiProvider`. O domínio não conhece
implementação concreta de nenhuma.

"Primárias" não quer dizer "as únicas" — outros contratos (`QuestionTypePlugin`,
`MathRecognitionProvider`, `QuestionSearchService`, `PortableArchive`) são legítimos quando
representam comportamento real. Antes de criar qualquer interface, a pergunta de controle:

> Existe mais de uma implementação real, uma fronteira arquitetural importante, ou um caso de uso
> que precisa rodar em teste sem I/O real (um dublê em memória)?

Se não, provavelmente não precisa de interface — e a que se justifica pelo teste precisa ter o
dublê. Sem factory sem uso, sem abstração de uma linha, sem DI framework, sem service locator.

**Fronteiras verificadas por lint, não por disciplina.** `domain/**` não importa `prisma`, `next`,
`node:fs`, SDK de storage nem SDK de IA, e não executa `pdflatex`. Componente React não importa
Prisma nem infraestrutura de módulo. O renderer não conhece storage, banco, `Workspace` nem Prisma.
Ciclo entre módulos quebra a suíte, fora o único nomeado (`document-tree ↔ questions`).

**Idioma** (D74). Identificadores, nomes de arquivo de código, rotas de API e códigos de erro em
inglês; o termo do glossário entra pelo identificador que o [CONTEXT.md](CONTEXT.md) dá. Em pt-BR:
documentação, comentários, texto de tela — que segue o glossário —, mensagens de commit e o nome e
a descrição dos testes. Dado gravado não é identificador, e caminho de página é endereço: ficam
como estão. O português que sobrou no código é renomeado quando o arquivo for mexido.

**Definition of Done.** Ver [checklist §14](docs/_atual/_checklist.md). Um item só é marcado
quando existe código, teste, relatório ou comando que prove.

## Legado

O aplicativo WPF original **não é alterado**. Ele é tratado como especificação executável e como
acervo a preservar: 13 bibliotecas `.knowchico`, 64 publicações, 297 nós, 1.247 alternativas.
`_antigo/` é um symlink read-only e não é versionado.
