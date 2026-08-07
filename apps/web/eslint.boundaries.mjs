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
];

/** Componentes React: nunca falam com o banco direto. */
const UI_RESTRICTIONS = [
  deny(PRISMA, "Componente React não acessa Prisma. Passe por Route Handler e use case."),
  deny(
    ["@infrastructure/database/*", "@/infrastructure/database/*"],
    "Componente React não acessa a camada de banco.",
  ),
];

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
];

const restrict = (paths) => ({
  "no-restricted-imports": ["error", { patterns: paths }],
});

const boundaries = [
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
];

export default boundaries;
export { AGENT_RESTRICTIONS, DOMAIN_RESTRICTIONS, UI_RESTRICTIONS };
