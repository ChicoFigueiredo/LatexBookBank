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

const DB_DRIVER = ["@libsql/*", "better-sqlite3"];

const deny = (patterns, message) => ({ group: patterns, message });

/**
 * Infraestrutura de **qualquer** módulo, por **qualquer** caminho: `@modules/x/infrastructure/y`,
 * `@/modules/...` e o relativo `../../../infrastructure/...`. As formas com alias
 * (`@infrastructure/*`) continuam nos grupos; esta pega o que elas não pegam (TST-07, #273).
 *
 * **Exceção nomeada:** `@modules/preview/infrastructure/mathjax`. É o MathJax que a UI do preview
 * chama para desenhar a fórmula no navegador — infraestrutura sem banco, sem disco e sem rede, e
 * a única que um componente React legitimamente usa. Mover o arquivo para fora de
 * `infrastructure/` é assunto da frente I de arquitetura; até lá, a exceção fica escrita aqui.
 */
const denyInfrastructureAnywhere = (message) => ({
  regex: "^(?!@modules/preview/infrastructure/mathjax$).*(^|/)infrastructure(/|$)",
  message,
});

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
  deny(DB_DRIVER, "Domínio não conhece o driver do banco. Use a interface de Repository."),
  deny(
    ["@infrastructure/*", "@/infrastructure/*"],
    "Domínio não importa infraestrutura. A dependência aponta para dentro, nunca para fora.",
  ),
  denyInfrastructureAnywhere(
    "Domínio não importa infraestrutura, nem a de outro módulo, nem por caminho relativo.",
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

/**
 * Componente de módulo e do DS: além do banco, nenhuma infraestrutura. Fica de fora `app/`, que
 * é a raiz de composição — página de servidor e Route Handler montam os adaptadores ali.
 */
const COMPONENT_RESTRICTIONS = [
  ...UI_RESTRICTIONS,
  denyInfrastructureAnywhere(
    "Componente React não importa infraestrutura de módulo. Passe por Route Handler e use case.",
  ),
];

/** A mesma lista da UI, menos o Radix: é o que `overlays/` tem de especial, e só isso. */
const OVERLAY_RESTRICTIONS = [...COMPONENT_RESTRICTIONS];

UI_RESTRICTIONS.push(RADIX_DENY);
COMPONENT_RESTRICTIONS.push(RADIX_DENY);

/**
 * Agente: propõe patches, nunca escreve.
 * A escrita real acontece depois da aprovação humana, no use case (spec §14.3).
 */
const AGENT_RESTRICTIONS = [
  deny(PRISMA, "O agente não tem caminho de escrita no banco. Ele propõe um QuestionPatch."),
  deny(DB_DRIVER, "O agente não tem caminho de escrita no banco, nem pelo driver."),
  deny(
    ["@infrastructure/database/*", "@/infrastructure/database/*"],
    "O agente não acessa a camada de banco. Fluxo: propor → validar → diff → aprovar → aplicar.",
  ),
  deny(
    ["@infrastructure/agent/*", "@/infrastructure/agent/*"],
    "O agente não aplica patch: o PatchApplier é do use case, depois da aprovação humana.",
  ),
  denyInfrastructureAnywhere(
    "O agente não acessa infraestrutura de outro módulo: ela leva ao banco por fora do fluxo.",
  ),
  RADIX_DENY,
];

/**
 * `import()` e `require` carregam módulo sem passar por `no-restricted-imports`, que só enxerga o
 * import estático: `await import("node:fs")` no domínio passava (TST-07). Domínio e agente não
 * usam nenhum dos dois, então a regra os proíbe por inteiro, em vez de repetir a lista de alvos.
 */
const RUNTIME_LOAD = (who) => [
  {
    selector: "ImportExpression",
    message: `${who} não carrega módulo em tempo de execução: import() escapa do lint de fronteira.`,
  },
  {
    selector: "CallExpression[callee.name='require']",
    message: `${who} não carrega módulo em tempo de execução: require escapa do lint de fronteira.`,
  },
];

const RAW_SQL = {
  selector:
    "MemberExpression[property.name=/^\\$(queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe)$/]",
  message:
    "SQL cru fora de infrastructure/database/ amarra o domínio ao motor. " +
    "Use o repository, ou confine o raw na camada de infraestrutura.",
};

const restrict = (paths) => ({
  "no-restricted-imports": ["error", { patterns: paths }],
});

const restrictSyntax = (selectors) => ({ "no-restricted-syntax": ["error", ...selectors] });

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
    files: ["app/**/*.{ts,tsx}"],
    rules: restrict(UI_RESTRICTIONS),
  },
  {
    name: "boundary/components",
    files: ["src/modules/*/ui/**/*.{ts,tsx}", "src/design-system/**/*.{ts,tsx}"],
    rules: restrict(COMPONENT_RESTRICTIONS),
  },
  {
    name: "boundary/agents",
    files: ["src/modules/agents/**/*.{ts,tsx}"],
    rules: restrict(AGENT_RESTRICTIONS),
  },
  {
    /**
     * Depois do bloco do agente, que em `agents/domain` substituía `DOMAIN_RESTRICTIONS` inteiro:
     * o domínio do agente deixava passar filesystem, Next e SDK de storage (TST-07). Aqui ele é
     * as duas coisas, domínio e agente.
     */
    name: "boundary/agents-domain",
    files: ["src/modules/agents/domain/**/*.{ts,tsx}"],
    // O `Set` tira o `RADIX_DENY`, que está nas duas listas: o ESLint recusa padrão repetido.
    rules: restrict([...new Set([...DOMAIN_RESTRICTIONS, ...AGENT_RESTRICTIONS])]),
  },
  {
    /**
     * SQL cru é a rota mais fácil para dependência de motor: uma função que só existe no SQLite
     * passa despercebida até a Fase 6.5. Quando for mesmo necessário, ele fica confinado em
     * `infrastructure/database/`, onde a diferença entre motores é assunto legítimo.
     */
    name: "boundary/no-raw-sql",
    files: ["src/modules/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
    rules: restrictSyntax([RAW_SQL]),
  },
  {
    /**
     * Depois do SQL cru, e repetindo-o: as duas regras são `no-restricted-syntax`, e o bloco que
     * casa por último substitui a regra inteira.
     */
    name: "boundary/no-runtime-load-domain",
    files: ["src/modules/*/domain/**/*.{ts,tsx}"],
    rules: restrictSyntax([RAW_SQL, ...RUNTIME_LOAD("Domínio")]),
  },
  {
    name: "boundary/no-runtime-load-agents",
    files: ["src/modules/agents/**/*.{ts,tsx}"],
    rules: restrictSyntax([RAW_SQL, ...RUNTIME_LOAD("O agente")]),
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
