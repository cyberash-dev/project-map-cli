import type { Framework, Language } from "../../core/domain/language.js";

const COMMON_EXCLUDE: readonly string[] = [
  "node_modules/**",
  "dist/**",
  "build/**",
  ".venv/**",
  "venv/**",
  "target/**",
  "vendor/**",
  ".git/**",
  "**/__pycache__/**",
  "**/*.pyc",
  "**/*.min.js",
  "**/*.d.ts",
];

const PYTHON_EXCLUDE: readonly string[] = ["tests/**", "**/tests/**"];
const JS_EXCLUDE: readonly string[] = ["**/__tests__/**", "**/*.test.ts", "**/*.spec.ts"];
const GO_EXCLUDE: readonly string[] = ["**/*_test.go"];
const JAVA_EXCLUDE: readonly string[] = ["src/test/**", "**/test/**"];

export function defaultExcludes(language: Language): readonly string[] {
  const base = [...COMMON_EXCLUDE];
  switch (language) {
    case "python":
      return [...base, ...PYTHON_EXCLUDE];
    case "typescript":
    case "javascript":
      return [...base, ...JS_EXCLUDE];
    case "go":
      return [...base, ...GO_EXCLUDE];
    case "java":
    case "kotlin":
      return [...base, ...JAVA_EXCLUDE];
  }
}

export const DEFAULT_KNOWN_ROLES: Readonly<Record<string, string>> = {
  actions: "Business actions / use-cases",
  usecases: "Business actions / use-cases",
  "use-cases": "Business actions / use-cases",
  features: "Vertical slice features",
  domain: "Domain layer",
  entities: "Domain entities",
  models: "Domain models",
  schemas: "API / serialization schemas",
  dto: "Data transfer objects",
  dtos: "Data transfer objects",
  handlers: "HTTP handlers",
  controllers: "HTTP handlers",
  routes: "HTTP route definitions",
  api: "API layer",
  rest: "REST API layer",
  storage: "Persistence layer",
  repository: "Persistence layer",
  repositories: "Persistence layer",
  db: "Persistence layer",
  infra: "Infrastructure adapters",
  infrastructure: "Infrastructure adapters",
  adapters: "Infrastructure adapters",
  ports: "Hexagonal ports",
  interactions: "External service clients",
  clients: "External service clients",
  integrations: "External service clients",
  fsm: "Finite state machines",
  workers: "Background jobs",
  taskq: "Background jobs",
  jobs: "Background jobs",
  tasks: "Background jobs",
  utils: "Utilities",
  lib: "Utilities",
  common: "Shared utilities",
  core: "Core domain",
};

export function defaultFrameworks(language: Language): readonly Framework[] {
  switch (language) {
    case "python":
      return ["sqlalchemy", "alembic"];
    case "typescript":
    case "javascript":
      return [];
    case "go":
      return [];
    case "java":
    case "kotlin":
      return [];
  }
}

export function defaultConfigYaml(
  projectName: string,
  language: Language,
  framework: Framework | null,
): string {
  const frameworksList: Framework[] = [];
  if (framework !== null) frameworksList.push(framework);
  for (const fw of defaultFrameworks(language)) {
    if (!frameworksList.includes(fw)) frameworksList.push(fw);
  }

  const excludeList = defaultExcludes(language)
    .map((p) => `  - "${p}"`)
    .join("\n");
  const knownRolesLines = Object.entries(DEFAULT_KNOWN_ROLES)
    .map(([k, v]) => `      ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join("\n");
  const frameworksStr =
    frameworksList.length === 0 ? "[]" : `[${frameworksList.join(", ")}]`;

  return `project:
  name: ${projectName}
  language: ${language}
  frameworks: ${frameworksStr}

root: .
respect_gitignore: true

exclude:
${excludeList}

sections:
  - overview
  - contexts
  - entities
  - enums
  - endpoints
  - storage
  - interactions
  - workers
  - metadata

overview:
  path: .project-map/overview.md

contexts:
  custom: []
  auto:
    min_files: 10
    depth: 2
    known_roles:
${knownRolesLines}

entities:
  top_n: 30
  include_fields: true
  include_private_methods: false
  importance:
    method_count: 0.5
    field_count: 0.3
    inbound_references: 1.0

enums:
  base_classes: [enum.Enum, Enum, IntEnum, StrEnum]

endpoints:
  framework: ${framework ?? "null"}
  routes_module: null
  app_var: null

storage:
  base_class: Base
  migrations_dir: null
  last_n: 10

interactions:
  dir: null

workers:
  patterns:
    - "class *Worker"
    - "@celery.task"
    - "@dramatiq.actor"

output:
  markdown: PROJECT_MAP.md
  json: null
`;
}
