# project-map

CLI that generates a deterministic `PROJECT_MAP.md` — a flat, AST-derived
architectural map of a single repository (bounded contexts, domain entities,
enums, HTTP endpoints, persistence schemas, external-service clients,
workers). Designed to be read by agents as the first step of any cross-cutting
question.

## Supported languages

| Language    | tree-sitter grammar                               |
| ----------- | ------------------------------------------------- |
| Python      | `tree-sitter-python`                              |
| TypeScript  | `tree-sitter-typescript` (includes `.tsx`)        |
| JavaScript  | `tree-sitter-javascript` (includes `.jsx/.mjs`)   |
| Go          | `tree-sitter-go`                                  |
| Java        | `tree-sitter-java`                                |
| Kotlin      | `@tree-sitter-grammars/tree-sitter-kotlin`        |

### Extractor coverage per language (MVP)

| Extractor      | Python | TS/JS          | Go  | Java       | Kotlin |
| -------------- | ------ | -------------- | --- | ---------- | ------ |
| contexts       | full   | full           | full| full       | full   |
| entities       | full   | full           | full| full       | full   |
| enums          | full   | full           | full| full       | full   |
| endpoints      | aiohttp, fastapi, flask | express/fastify member calls | gin/chi/echo member calls | Spring `@*Mapping` | — |
| storage (ORM)  | SQLAlchemy declarative | TypeORM `@Entity` | — | — | — |
| storage (migr) | Alembic | — | — | — | — |
| interactions   | `*/*Client` classes | `*/*Client` classes | — | — | — |
| workers        | `*Worker` classes + `@celery.task/@dramatiq.actor` | `*Worker/Processor/Handler` classes | — | — | — |

Slots that are "—" are implemented as ports — adding a new adapter is a
drop-in in the relevant slice.

## Architecture

Vertical Slice + Hexagonal.

```
src/
  core/                                # Domain + ports (no infra deps)
    domain/                            # ProjectMap, SourceLocation, Language, …
    ports/                             # ISourceParser, IFileWalker, IConfigLoader, …
  features/                            # One vertical slice per use-case
    init/
      init.use-case.ts
    build/
      build.use-case.ts                # Composition of all extractor slices
      extraction-context.ts
      extractor.port.ts
      symbol-index.ts                  # Shared preprocessor (import graph, inbound refs)
      slices/                          # One vertical slice per extractor kind
        contexts/                      #   extract.ts + render.ts (+ language adapters)
        entities/                      #     adapters/{python,typescript,go,java,kotlin}.ts
        enums/
        endpoints/
        storage/
        interactions/
        workers/
      rendering/
        markdown.ts                    # mdast → GFM
        json.ts
    version/
    watch/                             # planned (v2)
  infrastructure/                      # Adapter implementations for each port
    parser/
      tree-sitter.ts                   # ISourceParser implementation
      grammars.ts                      # per-language grammar loading
      ts-utils.ts                      # tree traversal helpers reused by adapters
    filesystem/
      globby-walker.ts
      node-fs.ts
    config/
      schema.ts                        # zod
      loader.ts                        # cosmiconfig
      defaults.ts
    revision/
      git.ts                           # git rev-parse HEAD
    clock/system.ts
    logger/console.ts
  cli/
    container.ts                       # Composition root (DI wiring)
    commands.ts                        # commander wiring
    index.ts                           # entry point
```

**Hexagonal rules this repo enforces:**
- `core/` has no imports from `features/`, `infrastructure/`, or `cli/`.
- `features/<slice>/*.extract.ts` depends only on `core/` ports and its own
  slice's language adapters. No direct infrastructure imports.
- Language adapters inside a slice are interchangeable; new languages land
  as new files under `adapters/` and registrations in the slice's
  `extract.ts`.
- `infrastructure/` implements `core/ports/*.port.ts`. Swappable without
  touching domain or use-cases.
- `cli/container.ts` is the only place where ports are bound to concrete
  implementations.

## Install

```sh
pnpm install                  # or npm install --legacy-peer-deps
pnpm build                    # tsc → dist/
pnpm test                     # vitest
```

Native `tree-sitter` grammars need a C/C++ toolchain and Python 3 at install
time (Xcode Command Line Tools on macOS; `build-essential` on Linux). If you
need to skip native builds locally, pass `--ignore-scripts` — the relevant
`.node` binaries are shipped as prebuilds.

## Usage

```sh
# Scaffold a default .project-map.yaml for your project.
project-map init --lang python --framework aiohttp

# Build PROJECT_MAP.md + project-map.json.
project-map build --json

# Only a subset of sections.
project-map build --only contexts,enums,endpoints

# Run in CI: exit 1 if the committed PROJECT_MAP.md is out of date.
project-map build --check

# Print version and which tree-sitter grammars loaded.
project-map version
```

## Configuration (`.project-map.yaml`)

```yaml
project:
  name: my-service
  language: python                       # python|typescript|javascript|go|java|kotlin
  frameworks: [aiohttp, sqlalchemy, alembic]

root: .
exclude:
  - "tests/**"
  - "**/__pycache__/**"

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
  path: .project-map/overview.md         # optional prose preamble

contexts:
  custom: []                             # [{path, role}] overrides
  auto:
    min_files: 10                        # contexts under this file count are dropped
    known_roles:
      actions: Business actions / use-cases
      handlers: HTTP handlers
      storage: Persistence layer

entities:
  top_n: 30
  include_fields: true
  include_private_methods: false
  importance:
    method_count: 0.5
    field_count: 0.3
    inbound_references: 1.0

enums:
  base_classes: [Enum, IntEnum, StrEnum] # Python: recognised enum bases

endpoints:
  framework: aiohttp                     # aiohttp|fastapi|flask|express|fastify|gin|spring|…
  routes_module: null                    # aiohttp: best-effort discovery when null
  app_var: null                          # FastAPI/Express: name of the app instance

storage:
  base_class: Base                       # SQLAlchemy declarative base name
  migrations_dir: src/storage/migrations # relative to root; null to skip
  last_n: 10

interactions:
  dir: src/interactions                  # one depth-1 subdir per external service

workers:
  patterns:
    - "class *Worker"
    - "@celery.task"
    - "@dramatiq.actor"

output:
  markdown: PROJECT_MAP.md
  json: project-map.json                 # omit or `null` to skip
```

## Output determinism

- Alphabetical sort everywhere (secondary by source location).
- Timestamps are in `## Generation metadata`, which `--check` strips before
  comparison.
- Config hash is deterministic (`sha256` of canonicalized config JSON).
- Running `build` twice on an unchanged tree → byte-identical output (modulo
  the build-duration cell).

## Adding a new language adapter to an existing slice

1. Create `src/features/build/slices/<slice>/adapters/<lang>.ts` implementing
   `ILanguageAdapter<T>`.
2. Register it in that slice's `extract.ts` constructor.
3. That's it — tests and rendering work unchanged.

## Adding a new slice

1. Create `src/features/build/slices/<slice>/{extract.ts,render.ts,adapters/}`.
2. Register the extractor in `features/build/build.use-case.ts`.
3. Call `renderSection(...)` on it from `features/build/rendering/markdown.ts`.
4. Add a section id to `core/domain/project-map.ts::SECTION_IDS` and zod
   schema.

## Agent integration

The point of `PROJECT_MAP.md` is that an agent reads it **instead of** firing
Explore/Grep across the repo for a cross-cutting question. Three layers of
enforcement, in order of subtlety → aggressiveness.

### 1. CLAUDE.md directive (soft, always-on)

Drop this into the project's `CLAUDE.md` so every Claude Code session loads it
automatically:

```markdown
## Cross-cutting questions

PROJECT_MAP.md at the repo root is the authoritative structural reference.
Before running Explore, Grep, or Glob for "how does X work across services /
modules", read PROJECT_MAP.md first. It lists contexts, domain entities with
inheritance, enums with members, HTTP endpoints, storage tables, migrations,
external-service clients, and workers — deterministic, AST-derived, no LLM
guesses. Fall back to Explore/LSP only if the map does not answer.
```

### 2. Claude Code integration — hook + `/project-map` skill

A single command installs both a `UserPromptSubmit` hook **and** a
`/project-map` slash-command skill that walks a fresh repo through
install → init → first build → optional git hooks:

```sh
project-map claude install                     # project scope, hook + skill
project-map claude install --scope user        # write to ~/.claude/
project-map claude install --force             # reinstall / update both
project-map claude install --no-skill          # hook only
project-map claude install --no-hook           # skill only
```

Targets per scope:

| Component | `--scope project`                               | `--scope user`                                   |
| --------- | ----------------------------------------------- | ------------------------------------------------ |
| Hook      | `.claude/settings.json`                         | `~/.claude/settings.json`                        |
| Skill     | `.claude/skills/project-map/SKILL.md`           | `~/.claude/skills/project-map/SKILL.md`          |

The command **writes directly** into those files, merging with any existing
hooks and preserving the rest of `settings.json`. Idempotent: a second run
without `--force` detects the existing hook/skill and exits without
duplicating. The skill is refused (without `--force`) if the existing
`SKILL.md` was hand-edited — no silent overwrites of user changes.

Effects:

- **Hook** — every turn the agent sees "PROJECT_MAP.md exists — read it
  before broad searches", gated only on the file being present.
- **Skill** — typing `/project-map` in any repo triggers the onboarding
  flow: preflight, language/framework detection, CLI install via the
  detected package manager, `init`, first `build --json`, and a
  multi-select prompt for git hooks.

### 3. Git hook (hardest, gates commits or pushes)

A hook runs `project-map build --check` and fails with a friendly message if
`PROJECT_MAP.md` is stale. Install with:

```sh
project-map install-git-hook --type pre-push      # recommended
project-map install-git-hook --type pre-commit    # slower, stricter
```

The installer drops a script into `.git/hooks/`. Hook properties:

- **Opt-in per repo**: no `.project-map.yaml` present → hook exits 0
  silently, so it's safe to install in user-wide hook directories.
- **Resolves binary**: prefers `node_modules/.bin/project-map`, falls back to
  PATH, exits 0 if neither is found (so fresh clones don't fail pushes).
- **Emergency bypass**: `SKIP_PROJECT_MAP_HOOK=1 git push` lets a one-off
  through without touching the hook.

Typical developer workflow with the hook:

```
git commit -m "…"
git push
# fails: "PROJECT_MAP.md is out of date"
project-map build
git add PROJECT_MAP.md
git commit --amend          # or new commit
git push
```

## Non-goals

- Not an index for find-definition / find-references — that's LSP.
- Not a graph — Graphify does that.
- No LLM calls in the build path. Ever.
- Not a linter.
