# CLAUDE.md

Project-specific guidance for Claude Code. Your global `~/.claude/CLAUDE.md`
already covers naming conventions, hexagonal rules, and the
spec → implement → review workflow; this file adds only what's specific to
**project-map-cli**.

## What this repo is

A CLI that generates a deterministic `PROJECT_MAP.md` from a source tree
using tree-sitter AST extraction. No LLM calls in the build path. See
`README.md` for the full feature matrix and architecture diagram.

## Layout at a glance

```
src/
  core/                    # Domain + ports. No imports from features/infra/cli.
  features/<slice>/        # Vertical slices (init, build, version, install-hooks).
    build/slices/<kind>/   # One slice per extractor (contexts, entities, enums, …).
      extract.ts           # Orchestrates language adapters for this slice.
      adapters/<lang>.ts   # ILanguageAdapter<T> per language.
      render.ts
  infrastructure/          # Concrete port implementations (tree-sitter, globby, fs, git, …).
  cli/                     # container.ts (DI wiring) + commands.ts (commander).
tests/
  integration/             # vitest + fixture projects under tests/fixtures/.
```

**Invariants (enforced by code review, not tooling):**
- `core/` is pure — no `features/`, `infrastructure/`, or `cli/` imports.
- Slice code under `features/build/slices/<kind>/` imports only `core/` ports
  and its own `adapters/`. Never import from `infrastructure/` directly.
- `cli/container.ts` is the single composition root.

## Determinism is load-bearing

`project-map build --check` compares the committed `PROJECT_MAP.md` against
a freshly-built one, modulo metadata. Any non-determinism (Map iteration
order, unsorted collections, clock values leaking in) breaks `--check` for
every consumer. Rules:
- Sort everything by stable keys; tie-break on source location.
- Route timestamps through `IClock` and keep them in metadata only.
- Route revision strings through `IRevisionProvider` (currently git-only).
- Config hash uses canonicalised JSON — don't bypass it.

Running `build` twice on an unchanged tree must produce byte-identical
output (modulo the `Build duration` cell).

## TypeScript / tooling specifics

- **ESM-only**. Imports from local files MUST use the `.js` suffix
  (e.g. `import { Foo } from "./foo.js"`) even though the source is `.ts`.
  TS compiles to `dist/` and the suffix is required at runtime.
- **Node 22+** (see `engines.node`). Free to use modern Node APIs.
- **Biome** is the single formatter + linter. Config: space indent (2),
  line width 110, double quotes. Don't introduce Prettier or ESLint.
- **Vitest** for tests. No Jest.
- **Package manager**: `pnpm` preferred (`pnpm install`, `pnpm build`,
  `pnpm test`). `npm install --legacy-peer-deps` works as fallback.

## Key commands

```sh
pnpm build            # tsc → dist/
pnpm test             # vitest run
pnpm test:watch       # vitest (watch)
pnpm lint             # biome check .
pnpm lint:fix         # biome check --write .
pnpm start -- <args>  # run compiled CLI
```

For local iteration on the CLI itself: `node dist/cli/index.js <cmd>` after
`pnpm build`. There is no ts-node / tsx runner configured.

## Adding things — quick pointers

- **New language in an existing slice**: drop
  `src/features/build/slices/<slice>/adapters/<lang>.ts` implementing
  `ILanguageAdapter<T>`, register it in that slice's `extract.ts`. Tree-sitter
  grammar loading lives in `infrastructure/parser/grammars.ts`.
- **New slice**: create
  `src/features/build/slices/<slice>/{extract.ts,render.ts,adapters/}`,
  register the extractor in `features/build/build.use-case.ts`, call
  `renderSection(...)` from `features/build/rendering/markdown.ts`, and add
  the id to `core/domain/project-map.ts::SECTION_IDS` + the zod config schema.
- **New CLI command**: wire in `src/cli/commands.ts` and add its use case to
  `src/cli/container.ts`.

## Non-obvious gotchas

- **Tree-sitter native grammars** need a C/C++ toolchain at install time.
  If a fresh `pnpm install` fails on grammar compilation, Xcode CLT /
  build-essential is usually missing.
- **Test fixtures** under `tests/fixtures/` are parsed by the real
  tree-sitter pipeline — don't introduce syntax errors in them or integration
  tests will surface parse failures, not assertion failures.
- **Revision provider is git-only.** An older `ArcGitRevisionProvider` used
  to probe Yandex Arc first; it was removed. If `current()` returns `null`
  (no `.git/`, or outside a working copy), metadata renders without a
  revision — that's expected, not a bug.

## Exploration tips (repo-specific)

The global guide already tells you to prefer LSP / `code-skeleton` / Grep
over `Read`. For this repo specifically:
- For "what extractor produces field X in the output?" → read
  `features/build/rendering/markdown.ts` first — it's the single place that
  assembles the final document.
- For "why is this file excluded?" → `infrastructure/config/defaults.ts`
  holds the default exclude list; user config merges on top in
  `infrastructure/config/loader.ts`.
- For "what's the shape of the public JSON?" →
  `core/domain/project-map.ts` plus `features/build/rendering/json.ts`.
