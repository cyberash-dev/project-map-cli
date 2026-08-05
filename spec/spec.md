# `project-map-cli` — Specification

Single source of truth for the externally observable behavior of
`project-map-cli`. Authored against the existing implementation
(brownfield): the `Brownfield baseline` in §4 records the as-is state,
and as-is facts become normative only where §5–§13 reference them.

Status of this document: onboarding complete. The partition's
`unmodeled_budget` (§3) counts source modules whose externally
observable behavior is not claimed by an approved normative ID, and it
reached zero on 2026-08-04.

Accounting: 119 modules under `src/`, all of them claimed by an
`Implementation binding` in §16 whose `target_ids` are approved. The
count is derived from the §16 footprint rather than assessed by hand, so
it moves only when a binding gains or loses a path, or when a target is
approved. A module added from here is debt until a binding names it.

How it got there from 72. The detection rework claimed its own modules
as each phase landed. Phase G then did three things: it named fifteen
modules that had implemented approved behavior all along and were
unclaimed only because no binding listed them, taking the count from 52
to 37; project-map:BEH-015 governed the enums slice, 37 to 30;
project-map:DLT-019 deleted the twelve modules of the prior endpoints
and interactions extractors, 30 to 18; and project-map:BEH-016 governed
the four slices that remained.

---

## 1. Context

`project-map-cli` is a command-line tool that generates a deterministic
architecture map (`PROJECT_MAP.md`) from a source tree using tree-sitter
AST extraction. It is a local developer tool: it reads a project's
sources, extracts structural facts (bounded contexts, domain entities,
enums, HTTP endpoints, storage, external-service clients, workers) and
renders them into a committed markdown document plus an optional JSON
document.

The document is intended to be committed alongside the code it
describes. The `build --check` mode compares a freshly-built document
against the committed one and exits non-zero when they diverge, so a
git hook or CI job can keep the two in sync. That comparison is the
reason determinism is a first-class property of this tool rather than a
nicety: any run-to-run variation in the produced document turns
`--check` into a false alarm for every consumer.

The build path performs no network access and invokes no language
model. Extraction is a pure function of the selected source files and
the resolved configuration, with three declared exceptions that are
confined to generation metadata: the wall clock, the VCS revision
string, and the measured build duration.

Consumers of this tool are: developers reading `PROJECT_MAP.md`;
git hooks and CI running `build --check`; and coding agents that read
the committed map to orient in a repository before searching it.

---

## 2. Glossary

- **Map document** — the markdown artifact produced by `build`,
  by default `PROJECT_MAP.md`. Its structure is the tool's primary
  external contract.
- **Section** — one top-level unit of the map document, addressed by a
  stable `SectionId`. The set of section ids and their render order are
  external identifiers.
- **Slice** — an extraction unit that produces the content of one
  section. Internal decomposition; not an external identifier.
- **Extractor** — the component that produces one slice's facts for a
  given language.
- **Language adapter** — the per-language implementation an extractor
  dispatches to.
- **Resolved configuration** — the configuration after file discovery,
  schema validation, default merging, and path resolution; the value
  that extraction and rendering consume.
- **Config hash** — a digest over the validated configuration file
  content, emitted into generation metadata.
- **Generation metadata** — the map document's trailing section holding
  tool version, config hash, file counts, build duration, language,
  frameworks, and extraction errors.
- **Check mode** — `build --check`: build the document, normalize the
  parts declared non-reproducible, and compare against the committed
  file without writing.
- **Non-reproducible field** — a field whose value legitimately varies
  between two runs over an identical source tree: the generation
  timestamp, the VCS revision, and the build duration.
- **Extraction error** — a failure inside one extractor, recorded in
  generation metadata instead of aborting the build.
- **Discovery scope** — the set of git pathspecs whose tree state the
  baseline's `freshness_token` covers (§4).
- **Unmodeled unit** — one module under `src/` whose externally
  observable behavior is not yet claimed by an approved normative ID of
  this partition. The count is the partition's debt metric (§3).

---

## 3. Partition

```yaml
---
id: project-map
type: Partition
partition_id: project-map
owner_team: cyberash
gate_scope:
  - project-map
dependencies_on_other_partitions: []
default_policy_set:
  - project-map:POL-001
  - project-map:POL-002
id_namespace: project-map
unmodeled_budget:
  current: 0
  baseline_at: "2026-07-27"
  baseline_value: 72
  trend: monotonic_non_increasing
---
```

---

## 4. Brownfield baseline

```yaml
---
id: project-map:BL-001
type: BrownfieldBaseline
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-27T15:38:18.752Z
    change_request: SDD onboarding of the existing implementation
    scope: first-time-approval
partition_id: project-map
discovery_scope:
  - src
  - tests
  - scripts
  - package.json
  - tsconfig.json
  - tsconfig.build.json
  - vitest.config.ts
coverage_evidence:
  - kind: git_tree_hash_v1
    reference: f8b0db9edcd5f2866fceedfc722374448dde23f7
    note: |
      Token covers the implementation, the test suite, and the build
      metadata that selects what is compiled and run.
      spec/spec.md and .sdd/config.json are deliberately outside
      Discovery scope: BL-001 stores the token inside spec/spec.md, so
      including that file would make the token self-referential.
      docs/ is outside scope because it holds planning prose that does
      not change observable behavior.
      Files under tests/ are inside scope so the token reacts to a
      change in the evidence, but they implement no normative ID and are
      therefore claimed by no Implementation binding footprint.
freshness_token: 7e415e7a7d6f80b6f1b270187ef8acae885e9581a90ce3263779375b90d54b5d
baseline_commit_sha: f8b0db9edcd5f2866fceedfc722374448dde23f7
mechanism: git_tree_hash_v1
notes: |
  The baseline carries no preserved as-is behavior by itself (SDD §6.3).
  As-is facts become normative only where a Behavior, Invariant, or
  Contract in §5-§13 references them as preserved.
  Refreshed from 6ceeabd4 to f8b0db9e. f8b0db9e makes the version
  refusal name the remedy: it opens with the instruction to update,
  spells the update command in full, and names lowering the floor as the
  deliberate alternative. It crosses two footprints, not one: BEH-017,
  authorized by project-map:DLT-031 and approved after the code in the
  order this record names, and the hook module of project-map:IMP-005,
  where the exit-7 arm was dropped once the tool itself carried the same
  text. No Delta could authorize the second: nothing normative governs
  the emitted script, which project-map:OQ-005 now records. It adds no
  module and the derived debt count stays 0.
  Refreshed from 2d6da9d8 to 6ceeabd4. 6ceeabd4 gives a repository a
  version floor and a build that ratchets it: a run below
  `min_tool_version` is refused with exit 7 before anything is read
  beyond the configuration, and a run that finishes at exit 0 raises the
  line to its own major and minor with patch zero, replacing the bytes
  of that value alone. It also narrows the analysis-unit digest to the
  three configuration sections project-map:CTR-004 declares, which is
  what keeps build a fixed point over a configuration it amends. Its
  crossings are the footprints of CTR-001, CTR-002, CTR-004 and POL-001,
  authorized by project-map:DLT-027 through project-map:DLT-030 and
  approved after the code in the order this record names. It adds two
  modules, both modeled by project-map:BEH-017 and project-map:INV-006,
  so the derived debt count stays 0. It also crosses the hook module of
  project-map:IMP-005, giving the emitted script one branch per exit
  code; that emission is unmodeled and project-map:OQ-005 records it. project-map:SUR-003 goes to 2.0.0
  because every `analysis_unit_digest` changes value once.
  Refreshed from fff1804b to 2d6da9d8. 2d6da9d8 carries the rule of
  project-map:DLT-015 to the whole document: a value read out of the
  source or the configuration is inline code wherever it appears, so
  the serializer stops escaping a name that carries an underscore. It
  also drops the count from the "Fields:" label, which reported the
  number of bullets printed directly beneath it. Its crossing is the
  footprint of CTR-003, authorized by project-map:DLT-025 and
  project-map:DLT-026 and approved after the code in the order this
  record names. The H1 changed text, which is why both pin
  project-map:SUR-002 at the unreleased 3.0.0.
  Refreshed from b50eadc8 to fff1804b. fff1804b drops the Resolution
  column from the two detection tables. In the document the column
  restated the cells beside it: the ladder of project-map:CTR-006 tests
  exactly the required fields of an HTTP variant, and every one of them
  is a rendered column, so `unresolved` and a visible `unknown(...)`
  coincide in both directions across all 776 rows the two live services
  render. The grade stays on every record of the artifact. Its crossing
  is the footprint of CTR-003, authorized by project-map:DLT-024 and
  approved after the code in the order this record names. It adds no
  module and the derived debt count stays 0.
  b50eadc8 takes the coverage
  measures out of the document: `detection_coverage` leaves the
  accepted SectionId set, project-map:DLT-023 authorizes it, and the
  measures stay in the artifact where project-map:BEH-013 already put
  them. With the id gone the accepted set equals the default list, so
  the two constants naming it collapse into one. It adds no module and
  the derived debt count stays 0.
  58b66554 shrinks the map
  document to what a rebuild does not change: the generated header, the
  coverage line, the file count of a context, the reference count of an
  entity, the line in every anchor, and the whole generation-metadata
  section, whose id leaves the accepted SectionId set. It adds no
  module, so the derived debt count stays 0. Its crossings are the
  footprints of CTR-003, INV-001, BEH-002 and BEH-004, authorized by
  project-map:DLT-020, project-map:DLT-021 and project-map:DLT-022 and
  approved after the code in the order this record names. The same three
  carry project-map:SUR-001 to 2.0.0 and project-map:SUR-002 to 3.0.0,
  and every surface_impact pin on both was rewritten to match.
  The refresh before it ran from e36dec17 to 6ba2d98f across the
  detection rework, the 1.0.0 release, and the whole of phase G.
  The first two phases added twenty-two modules, each claimed by project-map:IMP-006, project-map:IMP-007 or
  project-map:IMP-008, plus the configuration keys those phases add and
  one line in src/cli/commands.ts that threads `output.facts` through
  the option override.
  Every crossing in those two phases is closed. The code ran ahead of its
  attestation while the operator directed the work, and the fourteen IDs
  those bindings target were approved in one plan afterwards;
  project-map:DLT-004, project-map:DLT-005 and project-map:DLT-008
  authorize the configuration and write-set crossings, and
  project-map:DLT-009 and project-map:DLT-010 carry the surface versions
  the widened policy predicate requires. The debt count fell to 52.
  The third phase added six modules claimed by project-map:IMP-009, and
  its targets project-map:BEH-008 and project-map:INV-004 were approved
  in their own plan. That closed the debt at 52, but one of the six,
  src/features/detect/inbound/argument-selector.ts, landed after the
  closing commit and stayed unclaimed until now; the derived count was
  therefore 53, not 52.
  The fourth phase added five modules claimed by project-map:IMP-012,
  and its target project-map:BEH-009 was approved in its own plan, which
  took the debt count back to 52. Its crossings outside those five
  modules need no Delta: project-map:CTR-005 already declares the
  identity_preserving key the configuration surface now carries, and the
  resolution ladder of project-map:CTR-006 already calls any unknown in
  a required field unresolved, which the check now sees inside a
  template. Neither is observable on an artifact built before this
  phase, because nothing emitted a template.
  The fifth phase adds nine modules claimed by project-map:IMP-010,
  whose targets were approved before the code rather than after it, so
  the debt count never moved off 52. Its crossings outside those nine
  are the configuration surface project-map:CTR-005 already declared for
  sinks, the key project-map:DLT-012 adds to it, and two indexes that
  now hold nodes rather than folded strings because a class constant is
  not always a string. Approving before implementing left the gate red
  between the two commits; the earlier phases approved after, and that
  is the order to keep.
  Its Go half followed in df3b88d9 with six more modules on the same
  binding, and needed no approval of its own: project-map:BEH-010 and
  project-map:BEH-011 name no language.
  b9aefaaa closed the tail of phase B: the three opt-in section ids, the
  check-mode comparison of the artifact, the exit codes and the
  `facts --unit-digest` command. It crosses the footprint of
  project-map:CTR-001 and project-map:CTR-003, which
  project-map:DLT-006 and project-map:DLT-007 authorize; both amendments
  landed in 4618bc5d, together with the version corrections
  project-map:DLT-013 carries.
  This refresh waited for that approval. Taking it at b9aefaaa would
  have made four proposed records part of the baseline, after which no
  later refresh would surface their crossings and the new exit codes,
  command and SectionIds would have been merged without the human
  approval the gate exists to require.
  4c6b1d5 is the release. Inside Discovery scope it changes four fields
  of package.json: version moves from 0.2.2 to 1.0.0; description adds
  the detection-facts artifact; keywords gain static-analysis, openapi
  and spec-driven-development; and files gains CHANGELOG.md. The first
  three changes alter public npm metadata, and the last changes the
  contents of the published npm package. No normative ID names that
  publication surface, so project-map:OQ-004 classifies the crossing and
  preserves the released artifact pending a decision.
  The same commit applies to project-map:CTR-002 the four top-level keys
  project-map:DLT-004 and project-map:DLT-005 authorize and that were
  never written into the Contract: repository_identity, analysis_unit,
  openapi and detect, together with output.facts. The code accepted them
  from phase A onward, so the Contract text was behind its own approved
  Deltas rather than ahead of the code.
  b57b1d33 corrects what that amendment got wrong. The Delta phrases the
  requiredness rule as "a detection section is present", meaning the
  configuration blocks it introduced; once the three detection
  SectionIds existed the phrase read as the section list, and validation
  followed the paraphrase rather than project-map:ASM-002. The Contract
  now repeats the assumption's wording. The same commit adds the
  `detect` arms validation had been missing, and 13be01c6 reformats the
  one call it reflowed.
  b00c4d50, cd58ca4a and 7b34621f make the emitted binary executable and
  cover it. tsc emits 0644 and the `bin` entry is the emitted file, so a
  clean rebuild under an existing npm link left a binary the shell
  refused to run. Inside Discovery scope they add
  scripts/mark-bin-executable.mjs, change `scripts.build` in package.json
  and add one test. The package.json change alters the next npm tarball,
  because npm includes package.json unconditionally. project-map:OQ-004
  classifies this crossing of the unmodeled publication surface and its
  default forbids publishing version 1.0.0 until approved normative records
  govern the npm registry metadata and tarball contents; this baseline
  records but does not authorize the release. The test closes part of the
  obligation of project-map:CTR-001, which states every command over an
  invocation while the rest of the suite invokes the program in process.
  b601aa1a opens phase G by correcting its own accounting: fifteen modules
  counted as debt implemented behavior an approved ID already governed
  and were unclaimed only because no binding named them. The count moved
  from 52 to 37 with no code change, and project-map:BL-001's partition
  record moved with it.
  6ba2d98f closes phase G. Extraction walked and read the filesystem
  itself while detection read the materialized unit; both now go through
  one reader, each with its own selection, which project-map:CTR-004
  keeps apart on purpose. `absPath` leaves the parser port with it — no
  extractor read it, and it only carried the checkout's location into a
  layer that must not depend on it. A test builds one fixture from two
  absolute paths and compares the documents.
  It also closed the flake that had shadowed the suite: a test built the
  project in `beforeAll`, regenerating a source file while another test
  read it.
  25e84d37 governs the four extraction slices that remained, and takes
  the partition's unmodeled budget to zero: every module under src/ now
  sits behind an approved normative ID, where the onboarding started at
  seventy-two. project-map:BEH-016 states what the contexts, entities,
  storage and workers sections report; the tests that already exercised
  those shapes name it rather than new ones being written to repeat
  them.
  637aae77 rebinds the legacy section ids. `endpoints` renders the
  inbound facts and `interactions` the outbound operations, each under
  the heading it already had; `inbound_endpoints` and
  `outbound_operations` leave the accepted set, and the twelve modules
  of the prior extractors are deleted with the ids that reached them.
  project-map:DLT-019 carries project-map:SUR-002 to 2.0.0 and
  project-map:CON-001 is deprecated at that sunset. The debt fell 30 to
  18.
  The reworked detection carries no built-in adapter, so a repository
  configuring neither `openapi` nor `detect` renders both sections
  empty, and TypeScript, JavaScript and Java lose endpoint reporting
  until built-in adapters land. The owner accepted that knowingly; the
  Delta records it rather than the migration note softening it.
  ea16bea6 and 2b99053e close the enums slice. Its identity was keyed on the
  place values were written rather than on the type: a Go enum split
  across two `const` blocks was two entries carrying a fraction of its
  members each, and a Python enum nested in a class was reported by its
  simple name, so four exception classes each declaring a `ReasonCode`
  became four entries spelled alike. project-map:BEH-015 is the first
  normative statement about the section and project-map:DLT-018 carries
  project-map:SUR-002 to 1.4.0. The slice's seven modules left the debt
  with it, 37 to 30.
  5d262f32 adds the ratchet. project-map:BEH-014, project-map:CTR-010 and
  project-map:DLT-017 carry `--strict`, the baseline it reads, and exit
  code 6; project-map:SUR-001 moves to 1.3.0. The baseline is read after
  the fact set is canonical and reaches no emitted byte.
  3f1c6f6f and 4491aaa3 answer project-map:OQ-004 with its first option.
  project-map:SUR-004 and project-map:CTR-009 govern what a consumer
  installs: the command name in `bin`, the file allow-list, and the
  `engines.node` range. Inside Discovery scope they add one test; the
  manifest is unchanged, because the Contract was written against what
  the package already declares. The descriptive fields stay unmodeled.
  eca64c55, c596588e and e37b638c close a defect the map document
  carried since before this partition existed: an entity was reported by
  its bare name. One validation service declares seventeen Go structs
  called `Config`, so six of its headings were indistinguishable, and
  the Go adapter keyed its method map on the bare receiver type across
  every file, reporting each of those types with the members of all of
  them. project-map:DLT-016 authorizes the qualified heading, the
  package-scoped method key, the folded field type and the inline-code
  bullets, and carries project-map:SUR-002 to 1.3.0.
  a02a03c5 and 005929ee move the cells of the three detection sections
  from prose to inline code, which project-map:DLT-015 authorizes and
  which carries project-map:SUR-002 to 1.2.0. The change is not
  cosmetic: emitted as prose a cell went through the serializer's
  emphasis escaping, and suppressing that escaping would have read a
  Python member named `__init__` as strong emphasis and dropped the
  underscores from the name. The legacy sections keep prose cells.
  d2b04006 closed the sixth phase: the join key both halves of a
  shared-library operation carry, the container that proves a receiver's
  type, the narrowed candidate universe and the coverage denominators.
  It adds four modules claimed by project-map:IMP-011, whose targets
  project-map:BEH-012 and project-map:BEH-013 were approved after the
  code, in the order this record names. Its crossings outside those four
  are the two configuration keys project-map:CTR-005 already declares,
  the anchor project-map:DLT-014 authorizes on a consumer half, and two
  indexes that now hold a member's declaration anchor and a class's
  annotated attributes.
  The same commit claims src/cli/facts-check.ts and
  src/features/build/rendering/detection-sections.ts, which the tail of
  phase B added and no binding had named; the derived count was
  therefore 54, not 52, between 4618bc5d and this refresh.
  Refreshed from c82417cd to e36dec17 earlier. That refresh crossed the
  footprint of CTR-001, CTR-002, INV-001 and INV-002; every crossing was
  authored as project-map:DLT-001 or project-map:DLT-002, or was
  implementation work bringing the code to an already approved predicate.
---
```

---

## 5. Surfaces

```yaml
---
id: project-map:SUR-001
type: Surface
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-27T15:38:18.752Z
    change_request: SDD onboarding of the existing implementation
    scope: first-time-approval
partition_id: project-map
name: project-map/cli
version: "2.0.0"
boundary_type: cli
members:
  - project-map:CTR-001
  - project-map:CTR-002
  - project-map:CTR-004
  - project-map:CTR-005
consumer_compat_policy: semver_per_surface
notes: |
  The command set, each command's argv shape, its option names, and its
  process exit codes. Version tracks the implementation version at the
  time this Surface was first authored against the baseline.
  v2.0.0 — breaking: build gains a conditional write to the discovered
  configuration file, raising the `min_tool_version` it cleared; see
  project-map:DLT-027 and project-map:DLT-028. A release below that
  floor is refused with exit 7.
  v2.0.0 — breaking: `metadata` and `detection_coverage` leave the
  SectionId set that `sections` and `--only` accept, so a
  configuration naming either is rejected; see project-map:DLT-020 and
  project-map:DLT-023.
---
```

```yaml
---
id: project-map:SUR-002
type: Surface
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-27T15:38:18.752Z
    change_request: SDD onboarding of the existing implementation
    scope: first-time-approval
partition_id: project-map
name: project-map/map-document
version: "3.0.0"
boundary_type: generated_published_artifact
members:
  - project-map:CTR-003
  - project-map:GA-001
consumer_compat_policy: semver_per_surface
notes: |
  The map document is committed into consumer repositories and read by
  humans, by git hooks running check mode, and by coding agents. Its
  section identifiers, section order, and heading texts are external
  identifiers under SDD §8.
  v3.0.0 — breaking: the document stops reporting how it was generated,
  an anchor names the file without the line, and a ranked collection
  stops printing the count it is ranked on; `metadata` and
  `detection_coverage` leave the accepted SectionId set, the second
  because its measures are content of the facts artifact. See
  project-map:DLT-020, project-map:DLT-021, project-map:DLT-022 and
  project-map:DLT-023.
  v0.3.0 — additive: project-map:GA-001 joins as a member, naming the
  emission itself so a structural-breaking diff in the emission carries
  its own major bump per SDD §11.4-bis. No member was renamed or
  removed, and CTR-003 is unchanged; see project-map:DLT-003.
  v0.2.2 — original surface, CTR-003 only.
---
```

---

## 6. Requirements

```yaml
---
id: project-map:BEH-001
type: Behavior
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-27T15:38:18.752Z
    change_request: SDD onboarding of the existing implementation
    scope: first-time-approval
partition_id: project-map
title: build — render the map document from the configured source tree
given: |
  - cwd contains, or is nested under, a directory holding a
    configuration file discoverable per project-map:CTR-002
  - the configuration validates against project-map:CTR-002
when: user runs `project-map build` without --check
then: |
  process exit code is 0; the tool writes the rendered map document to
  path.resolve(<project_root>, <config.output.markdown>), where
  <project_root> = path.resolve(cwd, <config.root>); the document
  conforms to project-map:CTR-003.
  When <config.output.json> is a string, the tool additionally writes a
  JSON document to path.resolve(<project_root>, <config.output.json>).
  When <config.output.json> is null, the tool writes no JSON document.
negative_cases:
  - no configuration file is discoverable => see project-map:BEH-003
  - one extractor throws               => see project-map:BEH-004
out_of_scope:
  - watch mode
  - any write outside the two configured output paths (see POL-001)
applicability:
  invariant_to_all_axes: true
concurrency_model:
  actor_concurrency: single_per_process
  read_consistency: strong
  idempotency: none
  time_source: wall_clock:unbounded
data_scope: all_data
policy_refs:
  - project-map:POL-001
  - project-map:POL-002
test_obligation:
  predicate: |
    Running build over a fixture project writes the map document at the
    configured path, and the document parses as project-map:CTR-003.
  test_template: integration
  boundary_classes:
    - output.json null versus set
    - config.root equal to "." versus a nested directory
  failure_scenarios:
    - document written outside <project_root>
    - JSON document written when output.json is null
---
```

```yaml
---
id: project-map:BEH-002
type: Behavior
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-27T15:38:18.752Z
    change_request: SDD onboarding of the existing implementation
    scope: first-time-approval
partition_id: project-map
title: build --check — compare against the committed document without writing
given: |
  - the configuration validates against project-map:CTR-002
  - <md_path> = path.resolve(<project_root>, <config.output.markdown>)
when: user runs `project-map build --check`
then: |
  The tool renders the document in memory and reads the file at
  <md_path>, substituting the empty string when that file is absent.
  It compares the two strings for equality byte for byte, rewriting
  neither: project-map:INV-001 leaves no non-reproducible field in the
  document to normalize away.
  On equality: the tool writes no file and process exit code is 0.
  On inequality: the tool writes no file, emits
  "PROJECT_MAP.md is out of date." followed by U+000A to stderr, and
  process exit code is 1.
negative_cases:
  - no configuration file is discoverable => see project-map:BEH-003
out_of_scope:
  - comparison of the JSON document, which check mode does not read
applicability:
  invariant_to_all_axes: true
concurrency_model:
  actor_concurrency: single_per_process
  read_consistency: strong
  idempotency: none
  time_source: none
data_scope: all_data
policy_refs:
  - project-map:POL-001
  - project-map:POL-002
test_obligation:
  predicate: |
    Check mode over an up-to-date committed document exits 0 and writes
    no file; check mode over a modified document exits 1 and writes no
    file; check mode with the document absent exits 1.
  test_template: integration
  boundary_classes:
    - document identical
    - document differing in a rendered fact
    - document differing in whitespace alone
    - document absent
  failure_scenarios:
    - a file is written while --check is set
    - exit 0 on a document differing in a rendered fact
    - either side rewritten before the comparison
```

```yaml
---
id: project-map:BEH-003
type: Behavior
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-27T15:38:18.752Z
    change_request: SDD onboarding of the existing implementation
    scope: first-time-approval
partition_id: project-map
title: build — no discoverable configuration is a distinct exit code
given: no configuration file is discoverable from cwd per project-map:CTR-002
when: user runs `project-map build`, with or without --check
then: |
  The tool emits a diagnostic naming the missing configuration to the
  logger's error channel, writes no output file, and sets process exit
  code to 2.
negative_cases:
  - a configuration file exists but fails schema validation; the schema
    error propagates and the process terminates non-zero, which is a
    separate path from exit code 2
out_of_scope:
  - creating a configuration file, which is the init command's role
applicability:
  invariant_to_all_axes: true
concurrency_model:
  actor_concurrency: single_per_process
  read_consistency: strong
  idempotency: none
  time_source: none
data_scope: all_data
policy_refs:
  - project-map:POL-001
test_obligation:
  predicate: |
    Running build in a directory with no discoverable configuration
    yields exit code 2 and creates no file.
  test_template: integration
  boundary_classes:
    - build without --check
    - build with --check
  failure_scenarios:
    - exit code 1 conflated with the missing-configuration case
    - a file created when no configuration exists
---
```

```yaml
---
id: project-map:BEH-004
type: Behavior
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-27T15:38:18.752Z
    change_request: SDD onboarding of the existing implementation
    scope: first-time-approval
partition_id: project-map
title: build — an extractor failure is recorded, not fatal
given: the configuration validates and at least one extractor throws
when: user runs `project-map build`
then: |
  The build completes and writes the document. The section owned by the
  throwing extractor renders from that extractor's declared empty value.
  The document carries an H2 "Extraction errors" holding one bullet per
  throwing extractor, each naming the section and the error message. The
  heading sits immediately after the lead paragraph, ahead of every
  configured section, and it is not itself a SectionId: no configuration
  turns it off.
  The JSON companion carries the same entries under `metadata.errors`.
negative_cases:
  - every extractor succeeds; the document carries no "Extraction
    errors" heading
out_of_scope:
  - a failure in configuration loading, which precedes extraction
applicability:
  invariant_to_all_axes: true
concurrency_model:
  actor_concurrency: single_per_process
  read_consistency: strong
  idempotency: none
  time_source: none
data_scope: all_data
policy_refs:
  - project-map:POL-001
test_obligation:
  predicate: |
    A build whose extractor throws exits 0, writes the document, and
    renders exactly one extraction-error bullet naming that section.
  test_template: integration
  boundary_classes:
    - zero failing extractors
    - one failing extractor
    - more than one failing extractor
  failure_scenarios:
    - the build aborts on an extractor failure
    - the failure dropped from the document it writes
```

---

## 7. Data contracts

```yaml
---
id: project-map:CTR-001
type: Contract
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-27T15:38:18.752Z
    change_request: SDD onboarding of the existing implementation
    scope: first-time-approval
partition_id: project-map
title: command set, option names, and process exit codes
surface_ref: project-map:SUR-001
schema: |
  project-map init
      --lang <language>        default "python"
      --framework <framework>
      --force                  default false
  project-map build
      --config <path>
      --out <path>
      --only <sections>        comma-separated SectionId list
      --json [path]            bare flag resolves to "project-map.json"
      --check                  default false
      --strict                 default false
      --verbose                default false
  project-map facts
      --config <path>
      --unit-digest            default false
      --verbose                default false
  project-map version
  project-map install-git-hook
      --type <type>            "pre-push" | "pre-commit", default "pre-push"
      --force                  default false
  project-map claude install
      --scope <scope>          "project" | "user", default "project"
      --force                  default false
      --no-hook
      --no-skill
  project-map watch
  program-level: -V, --version-number
preconditions: |
  The process is launched with cwd inside the project the command acts
  on. Commands that read configuration additionally require a
  discoverable configuration file per project-map:CTR-002.
postconditions: |
  Each command's write set is bounded by project-map:POL-001. No command
  performs network access (project-map:POL-002).
external_identifiers: |
  Command names: init, build, facts, version, install-git-hook,
  claude install, watch. Option names as listed in schema, `--strict`
  included. Option values that are closed
  enumerations: --type ∈ {pre-push, pre-commit}; --scope ∈ {project, user}.
  Process exit codes as listed in error_taxonomy.
compatibility_rules: |
  Renaming or removing a command name, an option name, or an enumerated
  option value is a major bump of project-map:SUR-001. Adding a command
  or an option with a default that preserves prior behavior is a minor
  bump. Reassigning the meaning of an existing exit code is a major bump.
error_taxonomy: |
  0  success.
  1  the requested effect did not occur: check-mode mismatch (BEH-002);
     init did not write because the file exists and --force is absent;
     install-git-hook received a --type outside its enumeration;
     install-git-hook did not write; claude install received both
     --no-hook and --no-skill; claude install made no progress; watch was
     invoked.
  2  build or facts found no discoverable configuration file (BEH-003).
  3  the committed facts artifact names another analyzer build or
     another adapter registry than the running build (BEH-006). It
     outranks 1: a fingerprint difference accounts for every byte
     difference downstream of it.
  4  the build raised a mandatory check diagnostic, which is
     selector_unresolved or marker_invalid (BEH-006). It is independent
     of the committed bytes.
  5  a config-time error, raised before any build runs: a configuration
     that violates the schema of project-map:CTR-002, every code of
     project-map:CTR-004, and a declared unclassified baseline that is
     absent or will not parse.
  6  under --strict, detection emitted a diagnostic the baseline of
     project-map:CTR-010 does not list, or that baseline lists one no
     diagnostic matches (BEH-014). It is reachable only with the flag,
     and sits below 3 and 4: those name a fact about the artifact and
     about the configuration, while 6 names a verdict about a policy the
     repository set for itself.
  7  the running release is lower than the `min_tool_version` the
     configuration declares (BEH-017). It is raised before anything is
     built and writes no path. A release predating that key returns no
     code of this taxonomy for it: it rejects the key as unrecognized
     with whatever its own release carried, which for every published
     release is 1.
applicability:
  invariant_to_all_axes: true
concurrency_model:
  actor_concurrency: single_per_process
  read_consistency: strong
  idempotency: none
  time_source: none
data_scope: all_data
policy_refs:
  - project-map:POL-001
  - project-map:POL-002
test_obligation:
  predicate: |
    For each command, invoking it with the documented argv yields the
    documented exit code and the documented write set.
  test_template: integration
  boundary_classes:
    - each command name
    - each enumerated option value
    - each exit code in error_taxonomy
  failure_scenarios:
    - an exit code outside {0, 1, 2, 3, 4, 5, 6, 7}
    - --type or --scope accepting a value outside its enumeration
---
```

```yaml
---
id: project-map:CTR-002
type: Contract
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-27T15:38:18.752Z
    change_request: SDD onboarding of the existing implementation
    scope: first-time-approval
partition_id: project-map
title: configuration file discovery and schema
surface_ref: project-map:SUR-001
schema: |
  Discovery searches, in order: .project-map.yaml, .project-map.yml,
  .project-map.json, project-map.config.ts, project-map.config.js,
  package.json. Absence of all of them, or an empty result, yields no
  configuration.
  The document is validated against a schema that rejects unknown
  top-level keys. Keys use snake_case. Required: project.name (non-empty
  string), project.language (a supported language identifier).
  Every other key carries a default, so a document containing only the
  project block validates.
  Top-level keys: project, root, respect_gitignore, exclude, sections,
  overview, contexts, entities, enums, endpoints, storage, interactions,
  workers, output, repository_identity, analysis_unit, openapi, detect,
  min_tool_version.
  `min_tool_version` is the lowest release allowed to rebuild the
  repository, defaulting to absent. Its grammar is three dot-separated
  components, each "0" or a digit sequence with no leading zero; a value
  outside it, a value YAML reads as a number, and a prerelease are each
  rejected here. project-map:BEH-017 fixes what a run does with it.
  `output.facts` is a path defaulting to null. `repository_identity` is
  a logical string, required exactly when `output.facts` is non-null or
  an `openapi` or `detect` section is present, per project-map:ASM-002.
  Naming a detection SectionId requires it of nothing by itself: a
  section with no configured input renders empty.
  `analysis_unit` carries `sources.include`, `sources.exclude`, and
  `config_declarations`, whose semantics project-map:CTR-004 fixes.
  `openapi` and `detect` each default to empty, and their schema is
  project-map:CTR-005.
preconditions: the file is readable and parses as its declared format
postconditions: |
  Resolution yields a configuration whose root is expressed relative to
  cwd, whose section list is a subset of the declared SectionId set, and
  which carries a config hash over the validated document.
external_identifiers: |
  The file names searched, the top-level key names, the snake_case
  spelling of every key, the SectionId values accepted in sections, and
  the supported language identifiers.
compatibility_rules: |
  Renaming or removing a configuration key, or removing a SectionId from
  the accepted set, is a major bump of project-map:SUR-001. Adding a key
  with a default that preserves prior behavior is a minor bump.
  Rejection of unknown top-level keys is part of the contract: a
  document carrying an unrecognized top-level key is invalid, and
  accepting one silently would be a major bump.
error_taxonomy: |
  A document that fails schema validation terminates the process
  non-zero with the validation error. A document that is not
  discoverable is not a validation failure; build reports it as exit
  code 2 per project-map:BEH-003.
applicability:
  invariant_to_all_axes: true
concurrency_model:
  actor_concurrency: single_per_process
  read_consistency: strong
  idempotency: none
  time_source: none
data_scope: all_data
policy_refs:
  - project-map:POL-001
test_obligation:
  predicate: |
    A minimal document containing only the project block validates; a
    document carrying an unknown top-level key is rejected; discovery
    honors the declared search order.
  test_template: integration
  boundary_classes:
    - minimal document
    - document with every key populated
    - document with an unknown top-level key
    - no discoverable document
  failure_scenarios:
    - an unknown top-level key silently ignored
    - a default applied that contradicts the declared default
---
```

```yaml
---
id: project-map:CTR-003
type: Contract
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-27T15:38:18.752Z
    change_request: SDD onboarding of the existing implementation
    scope: first-time-approval
partition_id: project-map
title: map document structure
surface_ref: project-map:SUR-002
schema: |
  The document is GitHub-flavored markdown with this structure:
    H1            "Project Map: " and <project.name> as inline code
    paragraph     "Generated by project-map. Do not edit by hand."
    H2            "Extraction errors" over one bullet per extraction
                  error, present when at least one error exists
    sections      one per entry of <config.sections>, in the order that
                  list carries, each rendered by its section renderer
  The lead paragraph is constant. The document carries no timestamp, no
  tool version, no revision, no config hash and no file count; the JSON
  companion of project-map:GA-001 carries every one of them.
  A section whose collection is empty renders no heading and no body.
  The accepted SectionId set is: overview, contexts, entities, enums,
  endpoints, storage, interactions, workers. It is exactly the default
  `sections` list: a configuration narrows that list and never widens
  it.
  The two detection ids render the facts of project-map:CTR-006:
  `endpoints` an H2 "HTTP endpoints" over method, route, provenance and
  contracts; `interactions` an H2 "External dependencies" over owner,
  method, route and destination. The derived resolution, the coverage
  measures and the aggregated diagnostics are content of the artifact
  project-map:GA-002 emits rather than of this document.
  A declaration whose bare name another declaration also claims is
  headed by that name qualified with the shortest suffix of its
  declaring directory that tells the two apart; a name nothing else
  claims is headed by itself. A field bullet and an enum member are
  inline code, and a field type is folded onto one line. The bullets are
  introduced by the bare label "Fields:", which carries no count: the
  bullets under it report how many there are.
  A value the tool read out of the source or out of the configuration
  is inline code wherever the document carries it: the project name, a
  path, a declaration name, a field type, a table name, a model name, a
  revision, a touched-table list, a migration summary, a topic, a route,
  a method, a destination, a closed-enum member. Prose is what the tool
  wrote itself: the role of a bounded context, a bullet label, a
  heading, an extraction message. The serializer escapes nothing inside
  code and parses no emphasis there, so a name carrying an underscore,
  leading and trailing ones included, renders as it was declared.
  A declaration's rendered anchor is the path of the file that declares
  it. The line it sits on is carried by the JSON companion.
  The bounded-contexts table carries Path and Role. An entity carries
  its anchor, the names it inherits and its methods. Neither carries the
  count it is ranked on: the order of the collection reports that.
preconditions: extraction completed, with or without extraction errors
postconditions: |
  The document satisfies project-map:INV-001 and project-map:INV-002.
external_identifiers: |
  The SectionId values; the H1 and H2 heading texts, "Extraction errors"
  included; the text of the lead paragraph, which is constant and
  carries no generated value.
compatibility_rules: |
  Renaming a SectionId or a heading text is a major bump of
  project-map:SUR-002, because check mode compares document text and
  coding agents parse these headings. Removing a SectionId from the
  accepted set is a major bump. Adding a SectionId is a minor bump.
applicability:
  invariant_to_all_axes: true
concurrency_model:
  actor_concurrency: single_per_process
  read_consistency: strong
  idempotency: none
  time_source: none
data_scope: all_data
policy_refs:
  - project-map:POL-001
test_obligation:
  predicate: |
    A rendered document carries the H1, the constant lead paragraph and
    the configured sections in the configured order, and carries no
    timestamp, no tool version and no generation-metadata heading.
  test_template: integration
  boundary_classes:
    - every section populated
    - one section empty
    - an extraction error present versus absent
  failure_scenarios:
    - a heading text differing from the declared text
    - an empty section rendering a bare heading
    - a clock, a revision or a tool version reaching the document
---
```

## 8. Invariants

```yaml
---
id: project-map:INV-001
type: Invariant
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-27T15:38:18.752Z
    change_request: SDD onboarding of the existing implementation
    scope: first-time-approval
partition_id: project-map
title: the map document is reproducible byte for byte
always: |
  Two builds over an identical source tree and an identical resolved
  configuration produce byte-identical map documents. No normalization
  is applied before the comparison, and none is available to apply: the
  document carries no non-reproducible field, so every rendered value is
  a pure function of the selected source files and the resolved
  configuration.
  The generation timestamp, the VCS revision and the build duration are
  carried by the JSON companion alone.
scope: the map document produced by build (project-map:CTR-003)
evidence: public_api
stability: contractual
data_scope: all_data
applicability:
  invariant_to_all_axes: true
concurrency_model:
  actor_concurrency: single_per_process
  read_consistency: strong
  idempotency: none
  time_source: none
negative_cases:
  - two builds under different tool versions, which differ in no
    rendered byte and are therefore no violation of this invariant
out_of_scope:
  - the JSON document, which check mode does not read and which carries
    the timestamp, the revision and the build duration unnormalized
test_obligation:
  predicate: |
    Building twice over one fixture yields equal strings with no
    normalization applied to either.
  test_template: integration
  boundary_classes:
    - fixture with a resolvable revision
    - fixture without a resolvable revision
  failure_scenarios:
    - a collection rendered in filesystem or hash-map iteration order
    - a clock, a revision or a duration value rendered into the document
---
```

```yaml
---
id: project-map:INV-002
type: Invariant
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-27T15:38:18.752Z
    change_request: SDD onboarding of the existing implementation
    scope: first-time-approval
partition_id: project-map
title: every rendered collection is totally ordered by a stable key
always: |
  Each collection rendered into the map document is emitted in an order
  determined by a total order over stable keys of its own elements. The
  order is independent of filesystem enumeration order, of hash-map
  iteration order, and of the order in which extractors complete.
  Where a declaration order is itself the contract, that order is the
  stable key; enum members are rendered in declaration order for this
  reason.
scope: every collection rendered by a section renderer
evidence: public_api
stability: contractual
data_scope: all_data
applicability:
  invariant_to_all_axes: true
concurrency_model:
  actor_concurrency: single_per_process
  read_consistency: strong
  idempotency: none
  time_source: none
negative_cases:
  - two elements sharing a sort key and ordered by their arrival order
out_of_scope:
  - the order of keys inside the JSON document
test_obligation:
  predicate: |
    For each rendered collection, the emitted order equals the order
    produced by applying the declared total order to a shuffled input.
  test_template: integration
  boundary_classes:
    - collection with a unique key per element
    - collection with a tie on the primary key
    - empty collection
  failure_scenarios:
    - an order that varies between two runs over one tree
    - a tie broken by arrival order rather than by a declared tie-breaker
---
```

---

## 9. External dependencies

none

---

## 10. Generated artifacts

```yaml
---
id: project-map:GA-001
type: GeneratedArtifact
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-27T16:45:38.331Z
    change_request: Close contract violations found during SDD onboarding
    scope: first-time-approval
partition_id: project-map
title: the map document and its optional JSON companion
source_ids:
  - project-map:CTR-003
version: 2
generator: project-map-cli
generator_version: "0.2.2"
command: project-map build
output_paths:
  - <config.output.markdown> resolved against <project_root>
  - <config.output.json> resolved against <project_root>, when non-null
regeneration_mode: clean
published_surface: yes
surface_ref: project-map:SUR-002
applicability:
  invariant_to_all_axes: true
notes: |
  The emission is regenerated whole on every build; the tool applies no
  patches to a previously written document, so `clean` is exact.
  A structural-breaking diff in the emission, which is a renamed
  section id or a renamed heading, is a major bump of
  project-map:SUR-002 regardless of the bump on project-map:CTR-003,
  per SDD §11.4-bis.
  Artifact version 2 is the structure project-map:DLT-020,
  project-map:DLT-021 and project-map:DLT-022 leave: no generation
  metadata, an anchor without a line, and no count the collection
  carrying it is ranked on. Version 1 is every emission before them.
test_obligation:
  predicate: |
    Two consecutive builds over one unchanged tree emit an identical
    document, and the emission carries the section ids and headings
    declared by project-map:CTR-003.
  test_template: integration
  boundary_classes:
    - JSON companion enabled versus disabled
    - a previously written document present versus absent
  failure_scenarios:
    - the emission preserves content from a previous document
    - a section id present in the emission but absent from CTR-003
---
```

---

## 11. Localization

none

---

## 12. Policies

```yaml
---
id: project-map:POL-001
type: Policy
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-27T15:38:18.752Z
    change_request: SDD onboarding of the existing implementation
    scope: first-time-approval
partition_id: project-map
title: bounded filesystem write set per command
policy_kind: io_scope
applicability:
  applies_to: every Behavior in §6 and every Contract in §7
predicate: |
  Each command's write set is bounded to the paths listed here, and the
  process opens no other path for writing:
    build           path.resolve(<project_root>, <config.output.markdown>);
                    when <config.output.json> is a string,
                    path.resolve(<project_root>, <config.output.json>);
                    when <config.output.facts> is a string,
                    path.resolve(<project_root>, <config.output.facts>) and
                    its sidecar, which is that path with a trailing
                    ".json" removed when present and ".meta.json" appended;
                    and <config.sourcePath>, the discovered configuration
                    file itself, admitted only under every condition
                    project-map:BEH-017 names for raising the floor. That
                    path is not resolved against <project_root>, because
                    --config accepts a path outside it and the raise
                    follows it there
    build --check   the empty set
    init            the configuration file at the resolved target path
    version         the empty set
    install-git-hook  <repo_root>/.git/hooks/<type>
    claude install    under <project_root> for --scope project, and
                      under the resolved home directory for --scope user
    watch           the empty set
  Reading is unrestricted within the configured source root and the
  configuration search paths. stdout and stderr are unrestricted.
negative_test_obligations:
  - run build --check over a fixture and assert no path under the
    fixture is opened for writing
  - run build with output.json null and assert no JSON document appears
  - run init against an existing configuration without --force and
    assert the existing file's bytes are unchanged
  - run build at or below the declared floor and assert the
    configuration file's bytes are unchanged
  - run claude install --scope project and assert no path outside
    <project_root> is opened for writing
test_obligation:
  predicate: |
    For each command, the set of paths opened for writing equals the set
    declared in predicate.
  test_template: integration
  boundary_classes:
    - each command name
    - output.json null versus set
    - scope project versus user
  failure_scenarios:
    - a write outside the declared set
    - a write while --check is set
---
```

```yaml
---
id: project-map:POL-002
type: Policy
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-27T15:38:18.752Z
    change_request: SDD onboarding of the existing implementation
    scope: first-time-approval
partition_id: project-map
title: the build path performs no network access and no model inference
policy_kind: io_scope
applicability:
  applies_to: project-map:BEH-001, project-map:BEH-002, project-map:BEH-004
predicate: |
  Executing build, with or without --check, opens no network socket and
  issues no request to a language-model provider. Extraction derives
  every fact from the parsed source files and the resolved
  configuration. The single subprocess the build path invokes is the
  VCS revision lookup, which is local and whose failure resolves to a
  null revision.
negative_test_obligations:
  - run build with outbound network access denied and assert the build
    completes and writes the document
  - assert the dependency closure of the build path contains no
    language-model client
test_obligation:
  predicate: |
    A build executed with no network route available produces the same
    document as a build executed with one, modulo the fields normalized
    by project-map:INV-001.
  test_template: integration
  boundary_classes:
    - network available
    - network denied
    - VCS revision unavailable
  failure_scenarios:
    - a build that blocks on a network timeout
    - a build that fails when no network route exists
---
```

---

## 13. Constraints

none

---

## 14. Migrations

none

---

## 15. Deltas

```yaml
---
id: project-map:DLT-001
type: Delta
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-27T16:45:15.899Z
    change_request: Close contract violations found during SDD onboarding
    scope: first-time-approval
partition_id: project-map
title: the config hash covers the whole validated document
target_id: project-map:CTR-002
kind: replace
baseline_version: project-map:BL-001
compatibility_action: migrate
as_is: |
  The digest is computed over
  JSON.stringify(document, Object.keys(document).sort()).
  A replacer array filters keys at every nesting depth, so every nested
  object serializes as {} and only top-level scalar values reach the
  digest. Two documents differing in project.name, project.language and
  output.markdown produce the identical hash 9058c35603a635ba.
to_be: |
  The digest is computed over a canonical serialization of the entire
  validated document: object keys sorted at every depth, array order
  preserved, no key dropped. A change to any validated key changes the
  digest.
migration_note: |
  The Config hash row of every committed map document changes once.
  Each consumer's first `build --check` after upgrading reports the
  document out of date; rebuilding and committing resolves it. No
  configuration file needs editing.
tests_old_behavior: |
  A characterization test pinning the pre-change digest is not retained:
  the old value carries no contract, and CTR-002 already declares the
  post-change predicate. The old behavior is recorded in as_is.
tests_new_behavior: |
  Two documents differing only in a nested key produce different
  digests; two documents differing only in top-level key order produce
  the same digest.
---
```

```yaml
---
id: project-map:DLT-002
type: Delta
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-27T16:43:40.498Z
    change_request: Close contract violations found during SDD onboarding
    scope: first-time-approval
partition_id: project-map
title: claude install rejects an unrecognized --scope
target_id: project-map:CTR-001
kind: replace
baseline_version: project-map:BL-001
compatibility_action: reject
as_is: |
  The scope is resolved as (opts.scope === "user" ? "user" : "project"),
  so any value outside the enumeration silently resolves to "project"
  and the install proceeds against the current project.
to_be: |
  A --scope value outside {project, user} is reported on stderr and the
  process exits 1 without writing, matching how install-git-hook already
  treats a --type outside its enumeration.
migration_note: |
  An invocation carrying a misspelled --scope stops installing into the
  project and reports the error instead. An invocation carrying a
  spelled-correctly scope is unaffected.
tests_old_behavior: |
  The old behavior is not retained under compatibility_action=reject, so
  no test preserves it; as_is records it.
tests_new_behavior: |
  `claude install --scope typo` exits 1 and leaves the workspace
  unchanged; `--scope project` and `--scope user` keep their effects.
---
```

```yaml
---
id: project-map:DLT-003
type: Delta
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-27T17:29:59.985Z
    change_request: Name the emission as a member of the map-document Surface
    scope: first-time-approval
partition_id: project-map
title: the map-document Surface names its own emission as a member
target_id: project-map:SUR-002
kind: replace
baseline_version: project-map:BL-001
compatibility_action: ignore
as_is: |
  project-map:SUR-002 lists project-map:CTR-003 as its only member. The
  emission itself carries no member id, so a structural-breaking diff in
  the emitted bytes has no Surface of its own to bump.
to_be: |
  project-map:SUR-002 lists project-map:CTR-003 and project-map:GA-001,
  and its version moves from 0.2.2 to 0.3.0. The bump is minor because
  the change is additive: no member is renamed or removed and CTR-003 is
  untouched.
migration_note: |
  No consumer-visible change. The emitted document is byte-identical
  before and after; only the specification graph gains an edge, which is
  why compatibility_action is ignore.
tests_old_behavior: |
  The old member list carried no acceptance predicate of its own, so no
  test preserves it; as_is records it.
tests_new_behavior: |
  `sdd ready` reports no surface_member_drift for project-map:SUR-002,
  and project-map:GA-001 is closed by the regeneration and repeat-build
  obligations in tests/integration/document-contract.test.ts.
---
```

---

## 16. Implementation bindings

```yaml
---
id: project-map:IMP-001
type: ImplementationBinding
lifecycle:
  status: proposed
partition_id: project-map
target_ids:
  - project-map:CTR-001
  - project-map:BEH-001
  - project-map:BEH-002
  - project-map:BEH-003
binding:
  composition_root: src/cli/container.ts
  entrypoint: src/cli/index.ts
  command_surface: src/cli/commands.ts
  init_command: src/features/init/init.use-case.ts
  version_command: src/features/version/version.use-case.ts
authority: code_annotation
verification_method: |
  tests/integration/cli-contract.test.ts and
  tests/integration/build-check.test.ts drive the real command tree
  through createProgram() and assert the exit code and the write set.
---
```

```yaml
---
id: project-map:IMP-002
type: ImplementationBinding
lifecycle:
  status: proposed
partition_id: project-map
target_ids:
  - project-map:CTR-002
  - project-map:DLT-001
binding:
  discovery_and_resolution: src/infrastructure/config/loader.ts
  schema: src/infrastructure/config/schema.ts
  defaults: src/infrastructure/config/defaults.ts
  digest: src/infrastructure/config/canonical-json.ts
  language_identifiers: src/core/domain/language.ts
authority: code_annotation
verification_method: |
  tests/integration/config-hash.test.ts asserts the digest reacts to a
  nested key and ignores authored key order.
---
```

```yaml
---
id: project-map:IMP-003
type: ImplementationBinding
lifecycle:
  status: proposed
partition_id: project-map
target_ids:
  - project-map:BEH-015
  - project-map:CTR-003
  - project-map:DLT-018
  - project-map:DLT-007
  - project-map:GA-001
  - project-map:INV-001
binding:
  section_ids: src/core/domain/project-map.ts
  document_assembly: src/features/build/rendering/markdown.ts
  detection_sections: src/features/build/rendering/detection-sections.ts
  enums_extract: src/features/build/slices/enums/extract.ts
  enums_render: src/features/build/slices/enums/render.ts
  enums_go: src/features/build/slices/enums/adapters/go.ts
  enums_python: src/features/build/slices/enums/adapters/python.ts
  enums_typescript: src/features/build/slices/enums/adapters/typescript.ts
  enums_java: src/features/build/slices/enums/adapters/java.ts
  enums_kotlin: src/features/build/slices/enums/adapters/kotlin.ts
  qualified_names: src/features/build/rendering/qualified-name.ts
  json_emission: src/features/build/rendering/json.ts
  table_helpers: src/features/build/rendering/mdast-helpers.ts
  clock_port: src/core/ports/clock.port.ts
  clock: src/infrastructure/clock/system.ts
  revision_port: src/core/ports/revision.port.ts
  revision: src/infrastructure/revision/git.ts
authority: code_annotation
verification_method: |
  tests/integration/document-contract.test.ts asserts the heading set,
  the section order, and the generation-metadata row order; the
  determinism obligation is closed in tests/integration/build.test.ts.
---
```

```yaml
---
id: project-map:IMP-004
type: ImplementationBinding
lifecycle:
  status: proposed
partition_id: project-map
target_ids:
  - project-map:BEH-004
  - project-map:BEH-016
  - project-map:INV-002
binding:
  orchestration: src/features/build/build.use-case.ts
  extractor_set: src/features/build/extractor-set.ts
  entity_ranking: src/features/build/slices/entities/extract.ts
  symbol_index: src/features/build/symbol-index.ts
  contexts_extract: src/features/build/slices/contexts/extract.ts
  contexts_render: src/features/build/slices/contexts/render.ts
  entities_render: src/features/build/slices/entities/render.ts
  entities_go: src/features/build/slices/entities/adapters/go.ts
  entities_python: src/features/build/slices/entities/adapters/python.ts
  entities_typescript: src/features/build/slices/entities/adapters/typescript.ts
  entities_java: src/features/build/slices/entities/adapters/java.ts
  entities_kotlin: src/features/build/slices/entities/adapters/kotlin.ts
  storage_extract: src/features/build/slices/storage/extract.ts
  storage_render: src/features/build/slices/storage/render.ts
  storage_alembic: src/features/build/slices/storage/adapters/python-alembic.ts
  storage_sqlalchemy: src/features/build/slices/storage/adapters/python-sqlalchemy.ts
  storage_orm: src/features/build/slices/storage/adapters/typescript-orm.ts
  workers_extract: src/features/build/slices/workers/extract.ts
  workers_render: src/features/build/slices/workers/render.ts
  workers_python: src/features/build/slices/workers/adapters/python.ts
  workers_typescript: src/features/build/slices/workers/adapters/typescript.ts
  file_discovery: src/infrastructure/filesystem/globby-walker.ts
  source_reader: src/infrastructure/analysis-unit/read-sources.ts
  extraction_context: src/features/build/extraction-context.ts
  extractor_port: src/features/build/extractor.port.ts
  parser_port: src/core/ports/parser.port.ts
  parser: src/infrastructure/parser/tree-sitter.ts
  grammars: src/infrastructure/parser/grammars.ts
  tree_helpers: src/infrastructure/parser/ts-utils.ts
  logger_port: src/core/ports/logger.port.ts
  logger: src/infrastructure/logger/console.ts
authority: code_annotation
verification_method: |
  tests/integration/determinism-conformance.test.ts injects failing
  extractors with opposed completion delays and asserts the recorded
  order is identical; the walker sorts discovered paths, and the entity
  comparator falls through to the source anchor.
---
```

```yaml
---
id: project-map:IMP-005
type: ImplementationBinding
lifecycle:
  status: proposed
partition_id: project-map
target_ids:
  - project-map:POL-001
  - project-map:POL-002
  - project-map:DLT-002
binding:
  writer: src/infrastructure/filesystem/node-fs.ts
  hook_install: src/features/install-hooks/install-git-hook.use-case.ts
  claude_hook_install: src/features/install-hooks/install-claude-hook.use-case.ts
  claude_skill_install: src/features/install-hooks/install-claude-skill.use-case.ts
  scope_validation: src/cli/commands.ts
  writer_port: src/core/ports/filesystem.port.ts
  claude_skill_body: src/features/install-hooks/claude-skill.template.ts
authority: code_annotation
verification_method: |
  Write-set assertions compare the workspace file listing before and
  after each command; the network obligation runs a build with
  globalThis.fetch replaced by a throwing stub.
---
```

```yaml
---
id: project-map:IMP-006
type: ImplementationBinding
lifecycle:
  status: proposed
partition_id: project-map
target_ids:
  - project-map:CTR-004
  - project-map:POL-003
  - project-map:DLT-004
binding:
  port: src/core/ports/analysis-unit.port.ts
  materializer: src/infrastructure/analysis-unit/materializer.ts
  config_time_error: src/core/domain/config-time-error.ts
  schema: src/infrastructure/config/schema.ts
  resolution: src/infrastructure/config/loader.ts
  config_port: src/core/ports/config.port.ts
authority: code_annotation
verification_method: |
  The materializer is the only module that reads the filesystem for
  detection, and it hands on a map carrying no absolute path.
  tests/integration/analysis-unit.test.ts materializes one fixture twice
  and materializes a copy of it placed at another absolute path, then
  compares the three digests; it also drives each config-time rejection.
  tests/integration/detect-config.test.ts drives the schema, including
  the conditional identity rule of project-map:ASM-002.
---
```

```yaml
---
id: project-map:IMP-007
type: ImplementationBinding
lifecycle:
  status: proposed
partition_id: project-map
target_ids:
  - project-map:CTR-006
  - project-map:CTR-007
  - project-map:CTR-008
  - project-map:INV-003
binding:
  anchor: src/core/domain/facts/anchor.ts
  value_ir: src/core/domain/facts/value-ir.ts
  fact_schema: src/core/domain/facts/fact.ts
  diagnostic_schema: src/core/domain/facts/diagnostic.ts
  canonicalizer: src/features/detect/canonical/jcs.ts
  array_order: src/features/detect/canonical/array-order.ts
  fact_id: src/features/detect/canonical/fact-id.ts
  semantic_core: src/features/detect/merge/core.ts
  byte_anchors: src/features/detect/index/anchors.ts
  build_digest: src/features/detect/registry/build-digest.generated.ts
  build_digest_generator: scripts/emit-build-digest.mjs
authority: code_annotation
verification_method: |
  tests/unit/jcs.test.ts drives the published RFC 8785 Appendix B vector,
  checked in as bytes under tests/fixtures/jcs/, plus the UTF-16 key
  ordering case that a code-point comparator would get wrong.
  tests/unit/fact-id.test.ts asserts the id is blind to provenance,
  evidence, resolution and the destination binding, and that two
  unresolved registrations at distinct anchors stay apart.
  tests/unit/anchors.test.ts round-trips a non-ASCII source through the
  code-unit and the byte view.
---
```

```yaml
---
id: project-map:IMP-008
type: ImplementationBinding
lifecycle:
  status: proposed
partition_id: project-map
target_ids:
  - project-map:BEH-005
  - project-map:BEH-006
  - project-map:BEH-007
  - project-map:GA-002
  - project-map:CTR-005
  - project-map:DLT-005
binding:
  openapi_port: src/core/ports/openapi.port.ts
  openapi_reader: src/infrastructure/openapi/yaml-openapi-reader.ts
  path_grammar: src/features/detect/openapi/path-grammar.ts
  ingest: src/features/detect/openapi/ingest.ts
  merge_table: src/features/detect/merge/merge-table.ts
  resolution: src/features/detect/merge/resolution.ts
  use_case: src/features/detect/detect.use-case.ts
  artifact: src/features/detect/render/artifact.ts
  composition_root: src/cli/container.ts
  command_surface: src/cli/commands.ts
  check_mode: src/cli/facts-check.ts
authority: code_annotation
verification_method: |
  tests/integration/facts-artifact.test.ts drives the real command tree
  and asserts the write set, the byte equality of two consecutive builds,
  the byte equality of a copy placed at another absolute path, and that
  the timestamp lives in the sidecar rather than in the compared bytes.
  tests/unit/openapi-ingest.test.ts covers the inventory itself, the two
  merge-table rows this phase can reach, and the identity ordering;
  tests/unit/path-grammar.test.ts covers each rule of the grammar.
---
```

```yaml
---
id: project-map:IMP-009
type: ImplementationBinding
lifecycle:
  status: proposed
partition_id: project-map
target_ids:
  - project-map:BEH-008
  - project-map:INV-004
binding:
  selector_schema: src/infrastructure/config/selector-schema.ts
  argument_selector: src/features/detect/inbound/argument-selector.ts
  import_index: src/features/detect/index/python/imports.ts
  declaration_index: src/features/detect/index/python/declarations.ts
  module_resolver: src/features/detect/index/module-resolver.ts
  handler_verbs: src/features/detect/inbound/handler-verbs.ts
  dsl_adapter: src/features/detect/inbound/python-dsl.ts
  use_case: src/features/detect/detect.use-case.ts
authority: code_annotation
verification_method: |
  tests/unit/python-imports.test.ts and
  tests/unit/python-declarations.test.ts drive the two indexes, including
  the aliased import and the name a local definition shadows.
  tests/integration/python-dsl-routes.test.ts drives the real command tree
  over a fixture carrying all three registration forms the validation
  service uses: a local subclass supplying the prefix, the unprefixed
  form of the same type, and a decoy class sharing the name while
  originating elsewhere. It also covers a verb inherited across two
  modules and a verb declared under a decorator.
---
```

```yaml
---
id: project-map:IMP-012
type: ImplementationBinding
lifecycle:
  status: proposed
partition_id: project-map
target_ids:
  - project-map:BEH-009
binding:
  import_index: src/features/detect/index/go/imports.ts
  value_folding: src/features/detect/value/go-value.ts
  template_assembly: src/features/detect/value/template.ts
  path_grammar: src/features/detect/openapi/path-grammar.ts
  argument_selector: src/features/detect/inbound/argument-selector.ts
  router_scope: src/features/detect/inbound/go/router-scope.ts
  chi_adapter: src/features/detect/inbound/go/chi.ts
  config_schema: src/infrastructure/config/schema.ts
  use_case: src/features/detect/detect.use-case.ts
authority: code_annotation
verification_method: |
  tests/integration/go-chi-routes.test.ts drives the real command tree over
  a fixture carrying each boundary class the behavior names: a registration
  on the constructed value, one after a declared identity-preserving member,
  one inside a grouping closure that shadows the router identifier, one on a
  router derived by the built-in routing member, one on a router reached
  through an undeclared helper, and a same-named member on a receiver that
  is not a router.
  tests/unit/go-imports.test.ts covers the qualifier a Go import binds,
  including the major-version segment that is never a package name, and the
  whole-segment origin match. tests/unit/canonical-path-ir.test.ts covers
  the path grammar over components that did not all fold to a value.
---
```

```yaml
---
id: project-map:IMP-010
type: ImplementationBinding
lifecycle:
  status: proposed
partition_id: project-map
target_ids:
  - project-map:BEH-010
  - project-map:BEH-011
  - project-map:INV-005
  - project-map:DLT-012
binding:
  outbound_ladder: src/features/detect/outbound/ladder.ts
  sinks: src/features/detect/outbound/sinks.ts
  target_binding: src/features/detect/outbound/target-binding.ts
  transports: src/features/detect/outbound/transports.ts
  absolute_url: src/features/detect/outbound/absolute-url.ts
  python_adapter: src/features/detect/outbound/python.ts
  go_adapter: src/features/detect/outbound/go.ts
  go_scope: src/features/detect/outbound/go-scope.ts
  go_declarations: src/features/detect/index/go/declarations.ts
  go_packages: src/features/detect/index/go/packages.ts
  go_config_values: src/features/detect/value/go-config.ts
  record_lattice: src/features/detect/value/record.ts
  python_sites: src/features/detect/outbound/python-sites.ts
  python_values: src/features/detect/value/python-value.ts
  hierarchy_index: src/features/detect/index/python/hierarchy.ts
  config_schema: src/infrastructure/config/schema.ts
  use_case: src/features/detect/detect.use-case.ts
authority: code_annotation
verification_method: |
  tests/integration/python-outbound.test.ts drives the real command tree over
  a fixture carrying each tier of the classification ladder, each step of the
  destination ladder, a construction that reaches no send, a construction
  paired with one, an unclassified callee inside the candidate universe, and a
  member call outside it.
  The `path_via` key of project-map:DLT-012 is covered there too: the same
  fixture folds a path written through the declared helper and keeps the
  sink's target as the destination rather than a path segment.
  tests/integration/go-outbound.test.ts drives the second shape a sending
  member takes: a record the caller fills field by field. It covers the
  receiver that claims the sink by embedding, a field written after the
  record was bound, a field the constructor bound and no caller
  overwrote, a path that stayed unproven, and the destination the factory
  of the owning type supplies.
---
```

---

## 17. Open questions

```yaml
---
id: project-map:OQ-001
type: Open-Q
partition_id: project-map
question: |
  Check-mode normalization rewrites the "Generated by project-map v..."
  paragraph, which carries the tool version, but leaves the "Tool
  version" row of the generation-metadata table in the compared bytes.
  A tool version bump therefore reports every consumer's committed
  document as out of date even when no extracted fact changed. Is that
  the intended contract?
options:
  - option: preserve the current behavior
    consequence: |
      A release of the tool requires every consumer to rebuild and
      commit the document. The metadata table stays a faithful record of
      which version produced the committed bytes.
  - option: extend normalization to the Tool version row
    consequence: |
      A version bump alone stops failing check mode. The committed
      document no longer pins the producing version in a way check mode
      enforces. This changes the acceptance predicate of
      project-map:INV-001 and is a major bump of project-map:SUR-002.
blocking: no
owner: cyberash
default_if_unresolved: preserve the current behavior
notes: |
  Raised during brownfield recon, not from a reported defect. Recorded
  rather than silently corrected, per SDD §6.4: changing it is a Delta,
  not a fix.
  Closed by project-map:DLT-020, which takes neither option: the
  paragraph and the Tool version row both leave the document, so the
  question has no subject left. It is recorded closed rather than
  deleted, because the answer is why the rows are gone.
---
```

```yaml
---
id: project-map:OQ-004
type: Open-Q
partition_id: project-map
question: |
  The 1.0.0 release changes the npm artifact without a normative ID:
  the package version moves from 0.2.2 to 1.0.0, the description adds
  the detection-facts artifact, the keywords gain static-analysis,
  openapi and spec-driven-development, the published file allow-list
  gains CHANGELOG.md, and `scripts.build` gains the step that marks the
  emitted binary executable. Which normative records should govern the
  npm registry metadata and the tarball contents?
options:
  - option: model the npm package as a public Surface with Contracts
    consequence: |
      The registry fields and published file allow-list become explicit
      external identifiers of that Surface. Future changes require a
      Delta and the Surface semver change its compatibility rules demand.
  - option: model the tarball as a GeneratedArtifact
    consequence: |
      The emitted tarball contents and reproducibility rules become an
      approved GeneratedArtifact on a public Surface, while a Contract
      on that Surface governs the registry metadata.
  - option: leave the npm artifact unmodeled and do not publish it
    consequence: |
      Version 1.0.0 remains unpublished. Publishing stays unauthorized
      until approved normative records govern the npm registry metadata
      and tarball contents.
blocking: no
owner: cyberash
default_if_unresolved: model the npm package as a public Surface with Contracts
notes: |
  Raised while refreshing project-map:BL-001 through 4c6b1d5 and
  extended for the `scripts.build` change in cd58ca4a. Every listed
  change lands before 1.0.0 is published: the registry holds 0.2.2 and
  no v1.0.0 tag exists, so no migration is required. Absence of a shipped
  artifact does not authorize publishing an unmodeled public surface.
  The baseline records the state but does not authorize the release;
  making it normative requires owner approval of the selected records.
---
```

```yaml
---
id: project-map:OQ-005
type: Open-Q
partition_id: project-map
question: |
  The script `install-git-hook` writes is user-facing output of a
  published command, and nothing normative governs its text. It has
  already changed twice without a Delta, because no Delta could target
  it: project-map:CTR-001 fixes the command and its `--type` enum,
  project-map:POL-001 fixes where it writes, and
  project-map:IMP-005 binds the module to those two and to
  project-map:DLT-002, none of which reaches the emitted script.
  The two changes are the exit-code branches added with
  project-map:DLT-027 and the removal of the exit-7 arm with
  project-map:DLT-031, once the tool's own refusal carried the same
  text. Both are legitimate as internal decisions and both are
  invisible to every gate.
  What should govern the emitted hook: its exit-code branches, the text
  each prints, and the SKIP_PROJECT_MAP_HOOK escape?
options:
  - option: model the emitted hook as a GeneratedArtifact on the CLI Surface
    consequence: |
      The branch set and each message become declared emission, so a
      change to either needs a Delta and a test obligation. It also
      binds the hook's text to the exit codes of project-map:CTR-001,
      which is the coupling that made the last change necessary.
  - option: model only the branch-to-exit-code mapping, leaving the prose free
    consequence: |
      A new exit code that the hook does not handle becomes a gate
      failure, while wording stays an internal decision. Cheaper, and it
      covers the failure that actually matters: a code the hook
      misreports as stale output.
  - option: leave the emitted hook unmodeled
    consequence: |
      The script stays an internal decision and keeps changing without a
      Delta. Acceptable while the hook is a convenience, and wrong once
      a repository's CI depends on what it prints.
blocking: no
owner: cyberash
default_if_unresolved: model only the branch-to-exit-code mapping, leaving the prose free
---
```

---

## 18. Assumptions

```yaml
---
id: project-map:ASM-001
type: ASSUMPTION
partition_id: project-map
assumption: |
  The Tool version row of the generation-metadata table stays inside the
  bytes compared by check mode, so a tool version bump reports a
  committed document as out of date.
source_open_q: project-map:OQ-001
blocking: no
review_by: "2026-10-31"
default_if_unresolved: preserve the current behavior
tests:
  - the check-mode obligation of project-map:BEH-002 exercises a
    document differing only in non-reproducible fields; the Tool version
    row is outside that class by this assumption
---
```

---

## 19. Out of scope

- Adoption of this tool inside any consumer repository.
- Adoption of the reworked detection by any consumer repository, which
  needs an `openapi` or `detect` block written against that
  repository's own shapes. `spec/detection.md` is the sandbox the
  rework was authored in; its records are approved and govern the
  implementation, and it stays a sandbox only so that the next
  proposed record does not fail the gate before its code lands.
- Inside that rework, these items are deferred for want of an oracle in
  either validation service, and each keeps a reserved name so that
  adding it later is not a breaking change:
  - queue producers and consumers, and the topic topology they would
    carry; the closed `action` enum and the topic-decoy negative
    fixture ship without any queue fact;
  - Swagger 2.0 ingest and its `basePath` composition branch, which
    reports the document unreadable;
  - the per-call-site comment marker, whose `marker_invalid` code and
    exit-code slot are reserved;
  - cross-root `$ref` traversal through a `monorepo:` locator, whose
    tag parses and raises `monorepo_root_unresolved`;
  - expansion of an optional path segment, which stays a typed hole;
  - Java, Kotlin, gRPC, and GraphQL detection.
- Built-in adapters. Every fact the reworked detection emits comes from
  configuration, so a repository that declares none reports none, and
  TypeScript, JavaScript and Java have no endpoint detection at all
  since project-map:DLT-019 removed the prior extractors. Closing that
  is the work §11 phase 2 names.
