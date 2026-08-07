/**
 * Fronteiras arquiteturais verificadas por lint, não por disciplina.
 *
 * Convenção que depende de memória humana falha. Estas regras fazem o CI recusar o import
 * errado no momento em que ele é escrito.
 *
 * Origem: `docs/_atual/_planejamento.md` §4.5 · 1ª auditoria §37 · D23 · D35.
 */

const PRISMA = ["prisma", "prisma/*", "@prisma/client", "@prisma/*", ".prisma/*"];
const NEXT = ["next", "next/*"];
const NODE_FS = ["fs", "fs/*", "node:fs", "node:fs/*"];
const NODE_PROC = ["child_process", "node:child_process", "execa", "cross-spawn"];
const STORAGE_SDK = ["@vercel/blob", "@aws-sdk/*", "minio", "@google-cloud/storage"];
const AI_SDK = ["openai", "@anthropic-ai/*", "ollama", "ai", "@ai-sdk/*", "@google/generative-ai"];

const deny = (patterns, message) => ({ group: patterns, message });

/**
 * Radix é a **única** dependência visual de terceiro no projeto (D13), e entrou para cobrir três
 * lacunas do DS: context menu, tooltip e popover. Confinar os imports a `overlays/` é o que
 * impede que ele se espalhe e vire, na prática, um segundo sistema de componentes ao lado do
 * portado — exatamente o que a decisão de adotar o Edulingo DS quis evitar.
 */
const RADIX_DENY = deny(
  ["@radix-ui/*"],
  "Radix só em src/design-system/overlays/. Fora dali, use o componente do DS que o embrulha.",
);

/** Camada de domínio: regras de negócio puras. Não conhece infraestrutura nenhuma. */
const DOMAIN_RESTRICTIONS = [
  deny(PRISMA, "Domínio não conhece Prisma. Use a interface de Repository."),
  deny(NEXT, "Domínio não conhece Next.js. Framework é detalhe de entrega."),
  deny(NODE_FS, "Domínio não toca o filesystem. Use StorageProvider."),
  deny(NODE_PROC, "Domínio não executa processo externo — nem pdflatex. Use RenderExecutor."),
  deny(STORAGE_SDK, "Domínio não conhece SDK de storage. Use StorageProvider."),
  deny(AI_SDK, "Domínio não conhece SDK de IA. Use AiProvider."),
  deny(
    ["@infrastructure/*", "@/infrastructure/*"],
    "Domínio não importa infraestrutura. A dependência aponta para dentro, nunca para fora.",
  ),
  RADIX_DENY,
];

/** Componentes React: nunca falam com o banco direto. */
const UI_RESTRICTIONS = [
  deny(PRISMA, "Componente React não acessa Prisma. Passe por Route Handler e use case."),
  deny(
    ["@infrastructure/database/*", "@/infrastructure/database/*"],
    "Componente React não acessa a camada de banco.",
  ),
];

/** A mesma lista da UI, menos o Radix: é o que `overlays/` tem de especial, e só isso. */
const OVERLAY_RESTRICTIONS = [...UI_RESTRICTIONS];

UI_RESTRICTIONS.push(RADIX_DENY);

/**
 * Agente: propõe patches, nunca escreve.
 * A escrita real acontece depois da aprovação humana, no use case (spec §14.3).
 */
const AGENT_RESTRICTIONS = [
  deny(PRISMA, "O agente não tem caminho de escrita no banco. Ele propõe um QuestionPatch."),
  deny(
    ["@infrastructure/database/*", "@/infrastructure/database/*"],
    "O agente não acessa a camada de banco. Fluxo: propor → validar → diff → aprovar → aplicar.",
  ),
  RADIX_DENY,
];

const restrict = (paths) => ({
  "no-restricted-imports": ["error", { patterns: paths }],
});

const boundaries = [
  {
    /**
     * Bloco largo, deliberadamente **primeiro**: os blocos seguintes casam com subconjuntos de
     * `src/modules/**` e, em flat config, o último que casa substitui `no-restricted-imports`
     * inteiro. Por isso `RADIX_DENY` também aparece nas listas de domínio, UI e agente — sem
     * isso, o bloco mais específico apagaria esta regra em silêncio. Foi exatamente o que os
     * testes de violação proposital pegaram quando ela entrou como bloco separado.
     */
    name: "boundary/radix-modules",
    files: ["src/modules/**/*.{ts,tsx}"],
    rules: restrict([RADIX_DENY]),
  },
  {
    name: "boundary/domain",
    files: ["src/modules/*/domain/**/*.{ts,tsx}"],
    rules: restrict(DOMAIN_RESTRICTIONS),
  },
  {
    name: "boundary/ui",
    files: [
      "app/**/*.{ts,tsx}",
      "src/modules/*/ui/**/*.{ts,tsx}",
      "src/design-system/**/*.{ts,tsx}",
    ],
    rules: restrict(UI_RESTRICTIONS),
  },
  {
    name: "boundary/agents",
    files: ["src/modules/agents/**/*.{ts,tsx}"],
    rules: restrict(AGENT_RESTRICTIONS),
  },
  {
    /**
     * SQL cru é a rota mais fácil para dependência de motor: uma função que só existe no SQLite
     * passa despercebida até a Fase 6.5. Quando for mesmo necessário, ele fica confinado em
     * `infrastructure/database/`, onde a diferença entre motores é assunto legítimo.
     */
    name: "boundary/no-raw-sql",
    files: ["src/modules/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[property.name=/^\\$(queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe)$/]",
          message:
            "SQL cru fora de infrastructure/database/ amarra o domínio ao motor. " +
            "Use o repository, ou confine o raw na camada de infraestrutura.",
        },
      ],
    },
  },
  {
    /** Último a casar, e portanto o que vale para `overlays/`: aqui o Radix é legítimo. */
    name: "boundary/overlays",
    files: ["src/design-system/overlays/**/*.{ts,tsx}"],
    rules: restrict(OVERLAY_RESTRICTIONS),
  },
];

export default boundaries;
export { AGENT_RESTRICTIONS, DOMAIN_RESTRICTIONS, UI_RESTRICTIONS };
