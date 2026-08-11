# LatexBookBank

Biblioteca técnica, IDE LaTeX editorial e banco de questões estruturado.

Aplicação **local-first, cloud-ready**: roda inteira na sua máquina, com a internet desligada, mas
sem que nenhuma regra de negócio saiba qual infraestrutura está por trás.

- [Beta Editorial](docs/_atual/beta-editorial.md) — a matriz Design → Código, o que ficou pronto e o que não
- [Planejamento de execução](docs/_atual/_planejamento.md) — decisões, arquitetura, as 19 fases
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

|   Porta | Serviço                                |
| ------: | -------------------------------------- |
| `28080` | Aplicação Next.js                      |
| `28900` | Worker de render LaTeX (Fase 6)        |
| `28432` | PostgreSQL em Docker (apenas Fase 6.5) |
| `28001` | Prisma Studio                          |

## Estrutura

```
apps/web/
├─ app/                       # App Router
└─ src/
   ├─ modules/                # domínio, por área de negócio
   │  └─ <módulo>/  domain/ · application/ · infrastructure/ · ui/
   ├─ design-system/          # tokens + componentes
   ├─ shared/
   └─ infrastructure/         # as quatro fronteiras primárias
      ├─ database/   sqlite/ · postgres/
      ├─ storage/    local/ · vercel-blob/
      ├─ rendering/  worker/
      └─ ai/         openai-compatible/
```

## Convenções

**Fluxo obrigatório.** Nada pula etapas:

```
UI → Route Handler (Zod) → Use Case → Domain → Repository/Provider → Infraestrutura concreta
```

**As quatro fronteiras primárias de infraestrutura.** São os pontos onde o produto toca o mundo:
`Repository` · `StorageProvider` · `RenderExecutor` · `AiProvider`. O domínio não conhece
implementação concreta de nenhuma.

"Primárias" não quer dizer "as únicas" — outros contratos (`QuestionTypePlugin`,
`MathRecognitionProvider`, `QuestionSearchService`, `PortableArchive`) são legítimos quando
representam comportamento real. Antes de criar qualquer interface, a pergunta de controle:

> Existe mais de uma implementação real, ou uma fronteira arquitetural importante?

Se não, provavelmente não precisa de interface. Sem factory sem uso, sem abstração de uma linha,
sem DI framework, sem service locator.

**Fronteiras verificadas por lint, não por disciplina.** `domain/**` não importa `prisma`, `next`,
`node:fs`, SDK de storage nem SDK de IA, e não executa `pdflatex`. Componente React não importa
Prisma. O renderer não conhece storage, banco, `Workspace` nem Prisma.

**Idioma.** Documentação em pt-BR; código, identificadores e mensagens de commit em inglês.

**Definition of Done.** Ver [checklist §14](docs/_atual/_checklist.md). Um item só é marcado
quando existe código, teste, relatório ou comando que prove.

## Legado

O aplicativo WPF original **não é alterado**. Ele é tratado como especificação executável e como
acervo a preservar: 13 bibliotecas `.knowchico`, 64 publicações, 297 nós, 1.247 alternativas.
`_antigo/` é um symlink read-only e não é versionado.
