# Changelog

Notable changes per release. Versions follow semver over the CLI's observable
behaviour; the four published surfaces carry their own versions, listed under
each release.

## 3.0.0

Surfaces: `project-map/cli` 3.0.0 · `project-map/map-document` 3.1.0 ·
`project-map/detection-facts` 3.0.0 · `project-map/package` 1.0.0.

### Fixed

- **The two artifact fingerprints are two values.** `analyzer_build_digest` and
  `adapter_registry_digest` were one constant covering the detector tree and
  the fact IR, so a machine whose tree-sitter grammar or YAML parser was pinned
  at another version emitted other bytes under an identical fingerprint. The
  registry value now covers the detector modules specialized to a language or a
  framework; the analyzer value covers that set, the rest of the detector, the
  shared tree-sitter and YAML bindings, and the name, version and registry
  integrity of every pinned parser, read from the lockfile when the analyzer is
  built. The registry value is what the
  analysis unit folds in as its registry version, which is what `CTR-004` calls
  it. All three values change once, and `build --check` reports exit 3 until
  the artifact is rebuilt.
  The provenance declares the pinned dependency set; it is not a hash of the
  compiled grammars, which are built natively at install.
- **An artifact naming no fingerprint fails check mode with exit 3**, rather
  than being reported as ordinary drift. Bytes that are not a JSON object fail
  the same way. Exit 1 keeps an absent artifact and a byte difference under
  agreeing fingerprints.
- **A proof path that closes on itself is typed rather than fatal.** The Python
  declared-sink resolver followed a path argument back through local bindings
  and formatting calls with no record of where it had been and no bound on how
  far it went, so `url = url.format(x)` exhausted the stack and raised out of
  the build. It now carries a visited set and a three-edge budget, and returns
  a normalized value rather than a syntax node, so it can name why it stopped:
  `unknown(recursive)` for a cycle, `unknown(depth_exceeded)` for a fourth
  edge, and `unknown(dynamic)` only where a hop reached nothing. Following a
  name to its binding costs an edge; unwrapping a formatting call costs none.
- **An absolute code route is composed only from a declared entry point.** A
  router carrying no mount record was published at a bare path and graded
  `resolved`, which is right for a composition root and silently wrong for a
  sub-router mounted where the analysis cannot see — and the two are one
  syntactic form. `detect.inbound.serve_roots[]` now names the declaration a
  router reaches the outside through, its returned-value index, and the absolute
  prefix it is exposed under. A registration that reaches no declared entry
  point carries `path: unknown(unanchored_router)` and its source anchor, and no
  registration is published at a bare path under any condition. The partial
  chain the analysis proved is evidence and is not emitted: publishing it would
  push a suffix match onto the consumer, ambiguous wherever two mounts end in
  the same segments.
  The entry point's returned value is followed through up to three statically
  resolved call edges, so a service whose root is built two calls below the
  declared symbol still anchors. A symbol naming no declaration, several
  declarations, or a value that is not a router raises the mandatory
  `serve_root_unresolved` and fails check mode on the code alone.
- **`net/http.ServeMux` is a router the detector reads.** A repository
  declaring `net/http` under `detect.inbound.routers[]` has its
  `Handle`/`HandleFunc` registrations claimed, with the pattern read under the
  `[METHOD ][HOST]/[PATH]` grammar the multiplexer itself fixes. `GET /x` emits
  both a `GET` and a `HEAD` fact, because the multiplexer answers both. A
  pattern naming no method leaves the method typed rather than expanding into a
  verb set the source never wrote, and one naming a host types the path,
  because the route it names is not the path alone. A multiplexer handed to a
  pattern as its handler is a mount, which is how a sub-mux composes.
- **The specification cross-check is computed after the merge, per route.**
  `openapi_route_not_in_code` counted inventory facts whose handler stayed
  unknown, and every inventory fact carries an unknown handler, so it equalled
  the served-route count of each contract whatever the code half proved. It now
  names one route at a time and only fires where the merge left that route with
  the inventory as its only provenance. The other direction is new:
  `router_route_not_in_openapi` names a route the code proved and the inventory
  does not declare. A registration whose path is unknown raises neither, since
  it cannot merge and `unanchored_router` already says why.
  Neither code is mandatory for check mode, and no configuration suppresses
  either: a suppression flag that goes stale silently disables the cross-check.
- **A chi router now reaches its registrations across call edges.** The
  generated-server shape puts the registrations in a second method that
  receives the router as a field of a struct parameter, and the idiomatic
  layout puts the mount in a second file. Both lost the identity, so the route
  was published without its mount prefix, graded `resolved`, and never merged
  with the served route it belonged to. Router identity is now resolved over
  the whole unit and crosses up to three statically resolved call edges — the
  bound every other resolver already spends — carried in a record seeded from
  the composite literal at the call site. A struct field the literal never
  assigned reads as the zero value Go fixes for its declared type, and a branch
  guarded by comparing a proven router against `nil` contributes nothing. A
  fourth edge is refused as `unknown(depth_exceeded)` rather than followed.
  A mount prefix written as a package constant folds; it used to be a hole.
  A body reached along two paths is entered at the shorter one: the walk keys
  its de-duplication on the interprocedural distance as well as the seed, so a
  helper called both directly and through a chain resolves whichever way the
  two calls happen to be written, and its sites are reported once.
- **A mount whose sub-router did not resolve is diagnosed.** It was abandoned
  in silence, so every route below it published at a bare path with nothing in
  the artifact saying a prefix was lost. The new `router_mount_unresolved` is
  not a mandatory check code: it names a shape of code, which the unclassified
  baseline suppresses and `build --strict` ratchets.
- **The Go sink-value fold says which of the two happened.** Reaching no
  further constant and refusing the next one both read as `unknown(dynamic)`.
  The next edge is now looked up before the budget is spent, so exhaustion is
  `unknown(depth_exceeded)`. The numeric bound is unchanged: three edges
  resolve, a fourth is refused.
- **A python route is anchored at the call that serves it.** The rule that an
  absolute route is composed only from an anchor was landed for the router-value
  form alone, so the declaration-DSL form kept composing a route for every
  registration in the unit — a route table no application collects was published
  as served and graded `resolved`. Python needs no configuration for this: a
  call resolving by import provenance to `aiohttp.web.run_app` is the anchor,
  every application class each branch of the binding constructs is resolved, and
  the route collections their class attributes hold are anchored at the root.
  The fold follows tuples and lists, a splat of either, `+` concatenation, a
  module constant in the same module or in an imported one, and an attribute of
  another class, with the first binding in method-resolution order winning, so
  an attribute a subclass rebinds no longer reaches the base value. A
  registration nothing serves carries `unknown(unanchored_router)`, and a
  serving call whose application resolves to no class raises the mandatory
  `serve_root_unresolved`.
- **A declaration index is keyed by name, not by node identity.** Every access
  to a tree-sitter node returns a fresh wrapper, so an index keyed on the node
  answered nothing and a directory fallback hid it: the anchor of a serve root
  and the parent of a mount compared unequal, and repositories whose mounts sat
  in another file of the package silently lost their prefix. Fixture coverage
  could not see it; a run against a thirteen-hundred-file repository could.

### Changed

- **The endpoints section renders only a route the analysis proved.** A
  generated server whose options type is build-generated outside the analysis
  unit folds the base-URL field to `unknown(dynamic)`, which is correct rather
  than a defect, and on a real service that is a third of the table naming a
  route nobody can read, look up, or compare against the served specification.
  `HTTP endpoints` now renders a fact whose path is a literal; a fact carrying a
  typed hole in its route stays in the facts artifact alone. Selection is on the
  value in the Route column and not on the derived resolution, so a proven route
  whose handler sits outside the unit keeps its row and pays only the method
  cell. Where no fact has a proven route the section renders no heading and no
  body. `External dependencies` is unchanged, and the facts artifact does not
  change by one byte.

## 2.0.0

The document shrinks to what a rebuild does not change. Every field removed
below moved without any extracted fact moving, which made `PROJECT_MAP.md`
conflict on merge for reasons no reader cared about.

Surfaces: `project-map/cli` 2.0.0 · `project-map/map-document` 3.0.0 ·
`project-map/detection-facts` 2.0.0 · `project-map/package` 1.0.0.

### Added

- **`min_tool_version`, a version floor with a ratchet.** A `build` or `facts`
  run below the declared floor is refused with exit 7 before anything is read
  beyond the configuration; a `build` that finishes at exit 0 raises the line to
  its own `<major>.<minor>.0`, replacing the bytes of that value alone.
  Adding the key to a repository is what stops installs that never receive this
  release: the schema has rejected unknown top-level keys since v0.1.0, so every
  published version refuses a configuration carrying it. See the README for the
  deliberate costs.
  The refusal names the remedy, not only the mismatch: it states that the tool
  has to be updated, spells `npm i -g project-map-cli@latest` in full, and names
  lowering the floor as the deliberate alternative.

### Removed

- **The generation-metadata section.** `## Generation metadata` and the
  `metadata` section id are gone. A configuration naming `metadata` under
  `sections`, or passing it to `--only`, now exits 5. Drop the line.
- **The detection-coverage section.** `## Detection coverage` and the
  `detection_coverage` section id are gone the same way. The measures and the
  aggregated diagnostics stay in the facts artifact under `coverage` and
  `diagnostics`, which is where a program already read them; `--strict` against
  the unclassified baseline remains the way to fail a build on a new
  unclassified site.
- **The generated header.** `Generated by project-map v<version> on <timestamp>
from revision <sha>` and `Coverage: <n> files scanned (<m> excluded).` are
  replaced by the constant `Generated by project-map. Do not edit by hand.`
- **Line numbers in anchors.** An entity, enum, table or worker names the file
  that declares it, without `:<line>`.
- **Counts a collection is ranked on.** The `Files` column of the bounded
  contexts table and the `Referenced from N module(s)` bullet of an entity are
  gone; the row order still reports the same magnitude.
- **The field count on the `Fields:` label.** The bullets under it are the
  same list in full, so `Fields (8):` reported nothing the page did not, and it
  moved on every field added or removed. `project-map.json` still carries the
  array.
- **The count on the migrations heading.** `### Migrations (last 5)` becomes
  `### Recent migrations`. That the list is a tail is information the rows do
  not carry, so the heading keeps saying it; the number is the row count, which
  the table already gives, and it moved whenever a repository crossed below its
  own `storage.last_n`.
- **The `Resolution` column of both detection tables.** `## HTTP endpoints`
  heads Method, Route, Provenance, Contracts; `## External dependencies` heads
  Owner, Method, Route, Destination. In the document the column restated the
  cells beside it — a row the analyzer did not prove is the row whose method,
  route or destination reads `unknown(<reason>)`, and the reason names why.
  Every fact in the artifact still carries `resolution`.

Everything removed stays where a program reads it: `project-map.json`
(`output.json`) carries `metadata`, `source.line`, `fileCount` and
`referencedFrom` unchanged, and the facts artifact carries `coverage`,
`diagnostics` and `resolution`.

### Changed

- **`build --check` compares byte for byte.** With no non-reproducible field
  left in the document, nothing is normalized away first. A document differing
  only in whitespace is now out of date.
- **An extractor failure renders under `## Extraction errors`**, one bullet per
  failure, immediately after the lead paragraph. The heading is not a section
  id: no configuration turns it off, and it is absent when nothing failed.
- **`init` writes the section list without `metadata`.** No default list
  ever named `detection_coverage`, so nothing else changes there.
- **`analysis_unit_digest` covers what the analysis unit declares.** It folded
  a hash of the whole configuration document; it now covers the `detect`,
  `openapi` and `analysis_unit` sections alone, which is what the contract
  always said. Every value of it changes once, so `build --check` reports drift
  on `facts.json` until it is rebuilt and committed. No fact, diagnostic or
  coverage measure changes value. Editing a key only the document reads,
  `entities.top_n` or `sections`, no longer dirties the artifact.
- **`init` writes `min_tool_version` with the comment explaining it.**
- **A value read out of the source renders as inline code everywhere.**
  Previously only the two detection sections did, and every other position
  went through prose escaping: a project named `example_service` opened the
  document as `example\_service`, and the same happened to a bounded-context
  path, a table, a model, a revision, a migration summary and a worker topic.
  The H1 is now ``# Project Map: `<name>` ``. A consumer matching
  `^# Project Map: ` still matches; one that unescaped `\_` stops needing to.

### Migration

Drop `- metadata` and `- detection_coverage` from `sections` in
`.project-map.yaml`, then rebuild and commit `PROJECT_MAP.md`. A consumer that
parsed the tool version, the timestamp, `<file>:<line>`, a field count or a
resolution out of the markdown reads them from `project-map.json` and
`<output.facts>` instead, and one that matched a name against its escaped
spelling matches the declared spelling now.

## 1.0.0

First stable release. The map document is unchanged for a repository that does
not opt in, and a second artifact joins it.

Surfaces: `project-map/cli` 1.3.0 · `project-map/map-document` 2.0.0 ·
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
- **A Go enum split across `const` blocks is one entry, not one per block.** The
  adapter keyed entries on the block rather than on the declared type, so an
  enum that gained values over time was reported twice, each entry carrying a
  fraction of its members.
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

### Removed

- **The prior `endpoints` and `interactions` extractors.** Their ids now render
  the reworked detection: `endpoints` the inbound facts under "HTTP endpoints",
  `interactions` the outbound operations under "External dependencies". The
  opt-in ids `inbound_endpoints` and `outbound_operations` are gone with them; a
  configuration naming either exits 5.
  The reworked detection carries no built-in adapter — every fact comes from
  `openapi.serves`, `detect.inbound.routers` or `detect.outbound.sinks` — so a
  repository that configures none sees both sections empty, and TypeScript,
  JavaScript and Java lose endpoint reporting until built-in adapters land. The
  prior extractors reported decoys at a rate that had consumers disabling both
  sections; what is removed is output no one relied on.

### Upgrading

- **Rebuild and commit `PROJECT_MAP.md`.** The `Tool version` row of the
  generation metadata is inside the bytes check mode compares, so a release
  reports every committed document as out of date until it is rebuilt.
- Nothing else is required: every new configuration key defaults to a value that
  reproduces the previous resolution.

## 0.2.x and earlier

See the git history. Those releases predate the specification in `spec/`.
