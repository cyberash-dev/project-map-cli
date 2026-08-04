# Changelog

Notable changes per release. Versions follow semver over the CLI's observable
behaviour; the three published surfaces carry their own versions, listed under
each release.

## 1.0.0

First stable release. The map document is unchanged for a repository that does
not opt in, and a second artifact joins it.

Surfaces: `project-map/cli` 1.3.0 · `project-map/map-document` 1.3.0 ·
`project-map/detection-facts` 1.1.0 (new) · `project-map/package` 1.0.0 (new).

### Added

- **Detection facts artifact.** `output.facts` emits `.project-map/facts.json`,
  a canonical (RFC 8785) document of inbound endpoints and outbound operations
  with byte anchors, provenance and a typed resolution. It carries no timestamp
  and compares byte for byte; the timestamp and build duration live in a
  `.meta.json` sidecar that check mode never opens.
- **Structural detection.** Routes and calls are recognised by import
  provenance, declared configuration and value identity rather than by
  identifier names. Inbound: an OpenAPI inventory, a Python declaration DSL, and
  Go router values (chi). Outbound: generated clients, HTTP transports, declared
  sinks, and both halves of a shared-library operation.
- **`analysis_unit`.** A content-addressed set of sources and configuration
  documents. Detection reads nothing else: no live filesystem, no absolute path,
  no compiler, no environment. Two builds of the same tree at different absolute
  paths produce identical bytes.
- **`openapi` configuration.** `serves[]` turns a served specification into
  inventory facts, reconciled with code registrations by semantic core;
  `consumes[]` marks a generated client module.
- **`detect` configuration.** `inbound.routers[]` declares a registration DSL
  and the members that propagate router identity. `outbound.sinks[]` declares a
  client base type, its sending members, and the selectors that reach the path,
  the method and the target. `outbound.registry[]` declares the container that
  hands clients to business code, and `outbound.module_ids[]` names the type a
  shared client library publishes.
- **Three opt-in sections**: `inbound_endpoints`, `outbound_operations` and
  `detection_coverage`. They belong to the accepted section set and to no
  default.
- **`project-map facts --unit-digest`** prints the analysis-unit digest and
  writes nothing.
- **`repository_identity`**, a logical name that enters every fact id, so two
  repositories exposing the same route produce different ids.
- **The installed package is a governed surface.** The command name, the
  published file allow-list and the `engines.node` range carry semver: renaming
  the command, dropping an entry from `files` or narrowing the range breaks an
  installation that worked, and each is now a major bump. The manifest's
  descriptive fields stay outside it.
- **`build --strict` and `detect.unclassified_baseline`.** A repository adopting
  detection can accept the diagnostics it starts with and refuse new ones. The
  baseline lists diagnostic cores, never source anchors, so it survives edits
  above the sites it covers; an entry that suppresses nothing fails too, so the
  list cannot rot into a blanket. Exit code 6 carries the verdict, and the flag
  changes no emitted byte.
- **Exit codes 3, 4 and 5.** 3: the committed facts artifact names another
  analyzer build or adapter registry. 4: the build raised a mandatory check
  diagnostic. 5: a config-time error, raised before any build runs.

### Changed

- **The detection sections render their cells as inline code.** A name, a value
  or a closed-enum member is a token the analyzer produced, not prose, and in
  prose the serializer escapes every underscore: one validation service carried
  3023 such escapes over 2.54% of its document. Suppressing the escapes is not
  an option — a Python member named `__init__` would be read as emphasis and
  lose the underscores it is named with — so the cells move to the node that
  carries them literally. The legacy sections are untouched.
- **An entity or enum whose bare name another declaration also claims is now
  headed by that name qualified with its package.** One validation service
  declares seventeen Go structs called `Config`, and its document carried six
  identical headings. Go methods were keyed on the bare receiver type across
  the whole repository, so each of those types was reported with the union of
  the methods of all of them — members it does not have. A method now stays
  with the package that declares its receiver. Field bullets render as inline
  code, and a multi-line field type is folded onto one line instead of reaching
  the document as an encoded tab.
- `build --check` additionally compares the facts artifact when `output.facts`
  is configured.
- A configuration carrying an unknown top-level key now exits 5 instead of
  crashing.
- The config hash covers the whole validated document.

### Unchanged on purpose

- The legacy `endpoints` and `interactions` sections keep rendering the prior
  extractors' output. Both outputs are available on one repository so a consumer
  can compare them on its own sources before switching. Rebinding the legacy ids
  to the reworked detectors is a later major version.
- A repository that names no `sections` key renders exactly the document it
  rendered before.

### Upgrading

- **Rebuild and commit `PROJECT_MAP.md`.** The `Tool version` row of the
  generation metadata is inside the bytes check mode compares, so a release
  reports every committed document as out of date until it is rebuilt.
- Nothing else is required: every new configuration key defaults to a value that
  reproduces the previous resolution.

## 0.2.x and earlier

See the git history. Those releases predate the specification in `spec/`.
