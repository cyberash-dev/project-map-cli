# `project-map-cli` — Detection rework

Specification of the endpoints/interactions detection rework.
Requirements source of truth:
`~/Projects/intraservice-map/docs/project-map-detection-rework.md` v4.1;
implementation mapping: `docs/detection-rework-plan.md`.

This file is declared under `partitions["project-map"].sandbox_paths`.
That exemption is what lets a record of a phase nobody has started stay
`proposed` without failing `sdd ready`; it says nothing about the
records that have since been approved. A record is promoted in place
rather than moved: its phase writes the Red tests carrying
`@covers <id>`, then `sdd approve` and `sdd finalize` flip it here.

Read `lifecycle.status`, not the file name. An approved record in this
file governs the implementation exactly as one in `spec/spec.md` does.

Phase-to-record mapping, with the status each phase's records now hold:

| Phase                                               | Records                                                       | Status                |
| :-------------------------------------------------- | :------------------------------------------------------------ | :-------------------- |
| A — determinism core and the analysis-unit boundary | CTR-004, CTR-006, CTR-007, CTR-008, INV-003, POL-003, DLT-004 | approved, implemented |
| B — OpenAPI inbound and artifact emission           | CTR-005, BEH-005, BEH-007, GA-002, SUR-003, DLT-005, DLT-008  | approved, implemented |
| B — check mode and the opt-in sections              | BEH-006, DLT-006, DLT-007, CON-001                            | approved, implemented |
| C — indexes and the intraprocedural normalizer      | BEH-008, INV-004                                              | approved, implemented |
| D — router value identity                           | BEH-009                                                       | approved, implemented |
| E — declared sinks and the record lattice           | BEH-010, BEH-011, INV-005, DLT-012                            | approved, implemented |
| F — shared-library halves and coverage              | BEH-012, BEH-013, DLT-014                                     | approved, implemented |

The implementation bindings of the approved phases, project-map:IMP-006
through project-map:IMP-010 and project-map:IMP-012, live in
`spec/spec.md` so that the §16 footprint claims their modules.

Phase A, both halves of phase B, and phases C, D, E and F are approved
and implemented.

A Delta and the edit it authorizes travel together: the amendment to an
approved record in `spec/spec.md` is made in the commit that finalizes
its Delta, never earlier. Until then the approved record keeps
describing the code as it stands. `sdd finalize` applies a declared
`surface_impact` itself, so a Surface bump needs no hand edit.

---

## 5. Surfaces

```yaml
---
id: project-map:SUR-003
type: Surface
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-28T10:56:23.553Z
    change_request: detection rework phases A and B
    scope: first-time-approval
partition_id: project-map
name: project-map/detection-facts
version: "1.1.0"
boundary_type: generated_published_artifact
members:
  - project-map:CTR-006
  - project-map:CTR-007
  - project-map:CTR-008
  - project-map:GA-002
  - project-map:CTR-010
consumer_compat_policy: semver_per_surface
notes: |
  The facts artifact is committed into consumer repositories and read by
  the linker, a separate tool that joins per-repository facts across
  services. It is a Surface separate from project-map:SUR-002 because
  the two artifacts carry opposed comparison contracts: the map document
  carries a timestamp and compares modulo the normalization of
  project-map:INV-001, while the facts artifact carries no timestamp and
  compares byte for byte.
---
```

```yaml
---
id: project-map:SUR-004
type: Surface
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-08-04T08:31:26.285Z
    change_request: govern the installed package
    scope: first-time-approval
partition_id: project-map
name: project-map/package
version: "1.0.0"
boundary_type: generated_published_artifact
members:
  - project-map:CTR-009
consumer_compat_policy: semver_per_surface
notes: |
  The npm package as a consumer installs it. It is a Surface separate
  from project-map:SUR-001 because the two answer different questions: a
  consumer of the CLI Surface asks what a command does, and a consumer
  of this one asks whether the command exists after `npm install` and on
  which Node it runs.
  Its boundary type is the published-artifact one: the tarball is built
  by the release, not written by hand, and a consumer receives it rather
  than calls it.
  Version tracks the implementation version at the time this Surface was
  first authored, which is the 1.0.0 release that raised the question.
---
```

---

## 6. Requirements

```yaml
---
id: project-map:BEH-005
type: Behavior
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-28T10:56:23.356Z
    change_request: detection rework phases A and B
    scope: first-time-approval
partition_id: project-map
title: build — emit the detection facts artifact and its sidecar
given: |
  - a configuration that validates against project-map:CTR-002 and
    resolves an analysis unit per project-map:CTR-004
  - <config.output.facts> is a string
when: user runs `project-map build` without --check
then: |
  process exit code is 0; the tool writes the verifiable facts artifact
  to path.resolve(<project_root>, <config.output.facts>), and writes the
  sidecar beside it, at the artifact path with a trailing ".json"
  removed when present and ".meta.json" appended. The artifact conforms
  to project-map:CTR-006 and is serialized per project-map:CTR-008.
  The artifact carries no timestamp and no build duration; both live in
  the sidecar, which no comparison reads.
  When <config.output.facts> is null the tool writes neither file, and
  the map document of project-map:BEH-001 is unaffected either way.
negative_cases:
  - <config.output.facts> is null => neither artifact nor sidecar written
  - detection yields an empty fact set => the artifact is still written,
    carrying an empty facts array and its fingerprints
out_of_scope:
  - the markdown map document, which project-map:BEH-001 governs
  - the baseline suppression file, which no build path reads
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
  - project-map:POL-003
test_obligation:
  predicate: |
    Running build over a fixture whose configuration sets output.facts
    writes the artifact and the sidecar at the resolved paths; running
    build with output.facts null writes neither.
  test_template: integration
  boundary_classes:
    - output.facts null versus set
    - a fixture yielding facts versus a fixture yielding none
    - output.json null versus set alongside output.facts
  failure_scenarios:
    - a timestamp or duration rendered into the artifact
    - the sidecar written when output.facts is null
    - the artifact omitted when the fact set is empty
---
```

```yaml
---
id: project-map:BEH-006
type: Behavior
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-29T10:17:34.106Z
    change_request: detection rework phase B tail
    scope: first-time-approval
partition_id: project-map
title: build --check — compare the facts artifact byte for byte
given: |
  - a configuration whose <config.output.facts> is a string
  - an artifact committed at the resolved path
when: user runs `project-map build --check`
then: |
  the tool writes no path. It compares the freshly built artifact
  against the committed bytes with no normalization applied to either
  side, and the check report names the failure class. Process exit code:
    0  the committed bytes equal the built bytes
    1  the two differ in any byte
    3  the committed artifact's analyzer_build_digest or its adapter
       registry digest differs from the running build's
    4  the build raised a mandatory check diagnostic, which is
       selector_unresolved or marker_invalid
  Exit code 3 outranks exit code 1: a fingerprint difference accounts
  for every byte difference downstream of it, so the report names the
  fingerprint rather than the content.
  Exit code 4 is independent of the committed bytes and of any baseline.
  A config-time error exits 5 before any build runs, per
  project-map:CTR-001.
  When <config.output.facts> is null, check mode compares the map
  document alone, exactly as project-map:BEH-002 states.
negative_cases:
  - the committed artifact is absent => exit 1, reported as drift
  - only the sidecar differs => exit 0, because check mode never reads it
out_of_scope:
  - the unclassified ratchet, which no command in this specification runs
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
  - project-map:POL-003
test_obligation:
  predicate: |
    For each declared exit code, a fixture that triggers exactly that
    condition yields that code, and no path under the fixture is opened
    for writing.
  test_template: integration
  boundary_classes:
    - artifact equal, artifact drifted, artifact absent
    - fingerprint mismatch coincident with a byte difference
    - a mandatory check diagnostic over an otherwise equal artifact
    - output.facts null
  failure_scenarios:
    - exit 1 reported where the fingerprint is the cause
    - a sidecar difference reported as drift
    - a write performed while --check is set
---
```

```yaml
---
id: project-map:BEH-007
type: Behavior
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-28T10:56:23.422Z
    change_request: detection rework phases A and B
    scope: first-time-approval
partition_id: project-map
title: detection — a declared OpenAPI inventory emits facts independent of code
given: |
  - the `openapi.serves` list carries at least one entry whose spec locator
    resolves inside the analysis unit and whose contract_id is declared
when: detection runs over the analysis unit
then: |
  every (path, method) pair of every served specification emits one
  inbound endpoint fact. Its canonical path is
  canonicalize(mount + basePath + spec path) per project-map:CTR-007,
  with each component applied exactly once and no de-duplication of
  repeated segments. Its contract_refs carries
  {contract_id, operation_id}, where operation_id is the specification's
  operationId when that value is present and unique in the document, and
  otherwise the method joined to the canonical path. Its provenance
  carries "openapi".
  The inventory is emitted whether or not a code registration for the
  same route exists: inventory facts neither suppress nor are suppressed
  by a registration found in code. Where both exist for one semantic
  core they merge per project-map:CTR-006.
  A served route that no code registration reaches carries handler typed
  unknown and raises the diagnostic openapi_route_not_in_code. The
  handler value is never fabricated from a member name.
negative_cases:
  - a specification version outside OpenAPI 3.0 and 3.1 => the diagnostic
    openapi_spec_unreadable and no inventory fact from that entry
  - two different contract_ids on one canonical route => one fact
    carrying both contract_refs, which is not a conflict
out_of_scope:
  - the `openapi.consumes` entries and generated-client outbound operations
  - Swagger 2.0 ingest and its basePath composition branch
applicability:
  invariant_to_all_axes: true
concurrency_model:
  actor_concurrency: single_per_process
  read_consistency: strong
  idempotency: none
  time_source: none
data_scope: all_data
policy_refs:
  - project-map:POL-002
  - project-map:POL-003
test_obligation:
  predicate: |
    A fixture serving two specifications emits one fact per declared
    (path, method) pair with the declared contract_id, and emits them
    when the fixture contains no route registration at all.
  test_template: integration
  boundary_classes:
    - operationId present, absent, duplicated within one document
    - mount set versus empty
    - one route served under two contract_ids
    - a route present in the specification and absent from code
  failure_scenarios:
    - a repeated path prefix collapsed by a de-duplication heuristic
    - an inventory fact suppressed because code carries no registration
    - a handler value derived from a member name
---
```

```yaml
---
id: project-map:BEH-008
type: Behavior
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-28T15:15:57.726Z
    change_request: detection rework phase C
    scope: first-time-approval
partition_id: project-map
title: detection — a route is composed from a declared registration form
given: |
  - a registration expression whose callee resolves, by import
    provenance inside the analysis unit, to a built-in router adapter or
    to a `detect.inbound.routers` entry
when: detection runs over the analysis unit
then: |
  the canonical route is the ordered composition of the declared prefix
  source, the registration's path argument, and the segments the adapter
  contributes, folded by the value normalizer of project-map:CTR-007 and
  canonicalized by its path grammar.
  The HTTP method is taken from the adapter's declared verb source. When
  that source is the handler declaration's own members, the members
  inherited through the class hierarchy proven inside the analysis unit
  are included, so a handler that declares no verb member and inherits
  one resolves to the inherited verb.
  A prefix or path segment the normalizer cannot fold to a value becomes
  a typed hole, never a guessed literal.
negative_cases:
  - a member whose identifier matches a router member but whose callee
    does not resolve to the adapter's origin => no fact
  - a locally shadowed same-name symbol that does not originate from the
    adapter's module => no fact
  - a registration whose handler declaration lies outside the analysis
    unit => the fact is emitted with handler typed
    unknown(cross_boundary)
out_of_scope:
  - routers composed by value identity, which project-map:BEH-009 governs
applicability:
  invariant_to_all_axes: true
concurrency_model:
  actor_concurrency: single_per_process
  read_consistency: strong
  idempotency: none
  time_source: none
data_scope: all_data
policy_refs:
  - project-map:POL-002
  - project-map:POL-003
test_obligation:
  predicate: |
    Every registration in a fixture that mixes a prefixed form, an
    unprefixed form, an aliased import of the same form, and a spread of
    a route tuple resolves to its declared route and verb, and the verb
    of a handler that declares none is the inherited one.
  test_template: integration
  boundary_classes:
    - prefix declared as a class constant versus absent
    - verb declared on the handler versus inherited
    - path carrying a framework parameter syntax
    - an alias import and a re-export of the registration symbol
  failure_scenarios:
    - a fact produced by a member name alone
    - an inherited verb missed because the hierarchy crosses files
    - a runtime path segment rendered as a literal
---
```

```yaml
---
id: project-map:BEH-009
type: Behavior
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-28T16:37:52.995Z
    change_request: detection rework phase D
    scope: first-time-approval
partition_id: project-map
title: detection — a route is composed by router value identity
given: |
  - registrations whose receiver expression resolves, by intraprocedural
    def-use inside the analysis unit, to a router value constructed by a
    recognized router constructor
when: detection runs over the analysis unit
then: |
  each registration is attributed to the router VALUE its receiver
  resolves to, never to the receiver's declared type. Identity
  propagates through the adapter's built-in identity-preserving members
  and through every member declared in
  `detect.inbound.routers[].identity_preserving`, including the binding
  of the identity into the first parameter of a function literal passed
  as an argument, which attributes registrations written inside a
  grouping closure to the outer router.
  A router value that passes through a helper declared nowhere, and a
  router selected dynamically, each yield a fact typed unresolved. Their
  registrations are never merged into the registrations of every other
  router sharing the same type.
negative_cases:
  - the receiver is a field or a property of the router value rather than
    the router value itself => no fact
  - the receiver was never bound to a router construction => no fact
  - a middleware that short-circuits a request without registering a
    route => no fact
out_of_scope:
  - routers composed from a declared registration form, which
    project-map:BEH-008 governs
applicability:
  invariant_to_all_axes: true
concurrency_model:
  actor_concurrency: single_per_process
  read_consistency: strong
  idempotency: none
  time_source: none
data_scope: all_data
policy_refs:
  - project-map:POL-002
  - project-map:POL-003
test_obligation:
  predicate: |
    A fixture whose routers are mounted through a declared
    identity-preserving builder, and whose registrations sit inside a
    grouping closure that shadows the router identifier, yields exactly
    the mounted route set; a fixture calling a same-named member on a
    non-router receiver yields no fact.
  test_template: integration
  boundary_classes:
    - registration on the constructed value directly
    - registration after a declared identity-preserving member
    - registration inside a grouping closure that shadows the name
    - registration on a router reached through an undeclared helper
    - a same-named member on a receiver that is not a router
  failure_scenarios:
    - registrations of two distinct routers merged by shared type
    - a non-router receiver accepted because the member name matches
    - a route lost because the router passed through a declared helper
---
```

```yaml
---
id: project-map:BEH-010
type: Behavior
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-29T07:46:48.049Z
    change_request: detection rework phase E
    scope: first-time-approval
partition_id: project-map
title: detection — the outbound classification ladder
given: a call site inside the candidate universe of project-map:BEH-013
when: detection runs over the analysis unit
then: |
  the first tier whose structural matcher claims the site wins, and the
  winning tier is recorded as the fact's provenance:
    1  a call into a declared generated_module          => "generated"
    2  a call whose callee resolves by import provenance
       to a built-in transport sending API              => "transport"
    3  a call to a member of a declared sink, factory,
       or registry, reached directly or through a
       subclass of the declared base type               => "declared"
    4  no tier claims the site                          => a diagnostic
  A claimed site emits a fact even when extraction leaves fields
  unresolved, and an unresolved extraction never falls through to a
  lower tier.
  Tier 2 anchors the fact at the SENDING call. A request that is
  constructed and reaches no sending call emits no fact; a construction
  paired with a reachable send emits exactly one fact, anchored at the
  send, with the construction contributing method and URL through
  def-use.
  Call sites inside the method spans listed in a sink's `call[]`, and
  inside declared generated-client bodies, emit no separate fact: their
  transport is the mechanism of the claiming sink, not an operation of
  its own. A transport call from a different member of the same type is
  not excluded.
  Emission happens once per maximal statically resolved root-to-sink
  proof path, keyed by its source anchor. Shared intermediate wrappers
  emit nothing.
negative_cases:
  - a request builder with no reachable send => no fact
  - a transitively reachable tracing exporter for another protocol =>
    no fact of that protocol
  - a member whose identifier matches a sink member but whose receiver
    type is not proven => no fact, and a diagnostic within the universe
out_of_scope:
  - queue producers and consumers
  - generated-client operations declared through `openapi.consumes`
applicability:
  invariant_to_all_axes: true
concurrency_model:
  actor_concurrency: single_per_process
  read_consistency: strong
  idempotency: none
  time_source: none
data_scope: all_data
policy_refs:
  - project-map:POL-002
  - project-map:POL-003
test_obligation:
  predicate: |
    For each tier, a fixture exercising that tier yields a fact carrying
    that provenance; a construct-without-send fixture yields none; a
    construct-and-send fixture yields exactly one.
  test_template: integration
  boundary_classes:
    - each ladder tier
    - construction without send, construction with send
    - a transport call inside a sink member versus in a sibling member
    - a wrapper chain of depth three versus depth four
  failure_scenarios:
    - two facts emitted for one construct-and-send pair
    - a sink's internal transport emitted as a second operation
    - an unresolved claim falling through to a lower tier
---
```

```yaml
---
id: project-map:BEH-011
type: Behavior
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-29T07:46:48.109Z
    change_request: detection rework phase E
    scope: first-time-approval
partition_id: project-map
title: detection — the destination of an HTTP outbound variant
given: an outbound call site claimed by project-map:BEH-010
when: the destination of an HTTP variant is resolved
then: |
  the destination is resolved by an ordered ladder. The first APPLICABLE
  step that yields a value wins, and the winning step is recorded in
  `destination.binding`:
    instance            the receiver resolves by def-use to a
                        construction inside the analysis unit; the
                        declared target selector is applied to that
                        construction
    owner_construction  applicable only when the receiver is the
                        enclosing declaration's own instance; every
                        construction of the enclosing type inside the
                        unit is collected and the results are combined
                        as correlated variants
    owner_declaration   applicable only when the previous step found no
                        construction or only unknown ones, and the
                        declaration anchor of the enclosing type, or of
                        an ancestor in its locally proven hierarchy, is
                        inside the unit; the most derived ancestor that
                        binds the selector wins
  A step that is inapplicable consumes no traversal budget. Two bindings
  of the selector in one declaration raise selector_unresolved.
  When no step yields a value the destination is typed unknown with a
  reason from the closed enum of project-map:CTR-007: cross_boundary
  when the enclosing type's declaration lies outside the unit,
  open_world_dispatch on a dynamically selected receiver, depth_exceeded
  on budget.
  `destination.binding` is evidence. It is excluded from the fact-id
  preimage of project-map:CTR-008 and from the semantic core of
  project-map:CTR-006, so it never splits a core and never blocks a
  merge.
negative_cases:
  - two instances of one client type constructed with different config
    keys => two facts carrying different destinations
  - one accessor returning one of several clients across branches => one
    fact whose variants differ in destination, resolution "ambiguous",
    never "conflicting"
  - a hard-coded absolute URL => destination kind "literal", not unknown
out_of_scope:
  - resolving a config key to its per-environment value, which the
    linker performs
applicability:
  invariant_to_all_axes: true
concurrency_model:
  actor_concurrency: single_per_process
  read_consistency: strong
  idempotency: none
  time_source: none
data_scope: all_data
policy_refs:
  - project-map:POL-002
  - project-map:POL-003
test_obligation:
  predicate: |
    For each ladder step, a fixture whose only applicable step is that
    one yields a destination carrying that binding; two instances of one
    type with different config keys yield two distinct destinations.
  test_template: integration
  boundary_classes:
    - each ladder step, and the exhausted ladder
    - two instances of one type with different keys
    - a finite branch set over several clients
    - a target declared on an ancestor inside the unit versus outside it
  failure_scenarios:
    - a finite branch set reported as conflicting
    - two instances collapsed to one destination
    - destination.binding included in the fact-id preimage
---
```

```yaml
---
id: project-map:BEH-012
type: Behavior
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-29T12:46:32.189Z
    change_request: detection rework phase F
    scope: first-time-approval
partition_id: project-map
title: detection — the two halves of a shared-library operation
given: |
  - a client type carrying a `module_id` declared in
    `detect.outbound.module_ids`
when: detection runs over the analysis unit
then: |
  the library's own run emits the library half: one outbound operation
  per operation member of that type, carrying module_id and
  callee_operation taken from the member declaration, and an HTTP
  destination typed unknown(operation_in_library_root) where the library
  binds no concrete target.
  A consumer's run emits the consumer half for each call whose local
  type identity carries a module_id: owner_operation is the enclosing
  consumer operation; the destination follows the ladder of
  project-map:BEH-011; operation.path is typed
  unknown(operation_in_library); module_id is set; callee_operation is
  the statically resolved called member.
  callee_operation is required when module_id is non-null and null
  otherwise. A dynamically selected member yields callee_operation typed
  unknown.
  A half whose only unresolved required fields carry reason
  operation_in_library or operation_in_library_root is locally
  unresolved, and is excluded from the coverage denominator of
  project-map:BEH-013.
  Joining the two halves is the linker's work. This tool crosses no
  repository boundary and reads no operation body outside the analysis
  unit.
negative_cases:
  - a call whose local type identity carries no module_id => an ordinary
    outbound fact, with no module_id and no callee_operation
  - a library type whose target declaration is outside the unit => the
    destination stays unknown(operation_in_library_root)
out_of_scope:
  - resolving the join across repositories
  - extracting the operation bodies of a library that is not in the unit
applicability:
  invariant_to_all_axes: true
concurrency_model:
  actor_concurrency: single_per_process
  read_consistency: strong
  idempotency: none
  time_source: none
data_scope: all_data
policy_refs:
  - project-map:POL-002
  - project-map:POL-003
test_obligation:
  predicate: |
    A library fixture and a consumer fixture over one declared module_id
    both emit halves carrying the same (module_id, callee_operation)
    pair, and the consumer half carries a resolved destination when its
    target is declared locally.
  test_template: integration
  boundary_classes:
    - library half, consumer half
    - target declared locally versus only in the library
    - a statically resolved member versus a dynamically selected one
  failure_scenarios:
    - a half missing the join key
    - callee_operation set where module_id is null
    - a library operation body read from outside the analysis unit
---
```

```yaml
---
id: project-map:BEH-013
type: Behavior
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-29T12:46:32.250Z
    change_request: detection rework phase F
    scope: first-time-approval
partition_id: project-map
title: detection — the candidate universe, diagnostics, and coverage
given: a call or registration site inside the analysis unit
when: detection runs and no classification tier claims the site
then: |
  the site is diagnosable only when it occurs inside a transport or
  router package resolved by import provenance, or when it crosses a
  declared sink, router, or module boundary. That set is the candidate
  universe and the coverage denominator.
  A diagnosable site emits external_call_unclassified or
  external_registration_unclassified. A site outside the universe emits
  nothing: an arbitrary member call is not classified and is not
  counted.
  Diagnostics merge by the core (code, canonical_callee,
  canonical_call_shape), where canonical_call_shape is the normalized
  pair of arity and receiver type. Equal cores union their source
  anchors, and `count` is the number of DISTINCT source anchors, never
  the number of traversal visits.
  Coverage is reported per mechanism against an honest denominator. The
  inbound denominator is the declared inventory where one exists; where
  no inventory exists the inbound coverage is reported "unmeasured" and
  never as a completed fraction.
  These diagnostics are content of the artifact and depend on no
  suppression file.
negative_cases:
  - a member call outside every transport, router, and declared boundary
    => no diagnostic and no contribution to the denominator
  - one unclassified callee reached from three call sites => one
    diagnostic with count 3
out_of_scope:
  - the unclassified ratchet and its suppression baseline
applicability:
  invariant_to_all_axes: true
concurrency_model:
  actor_concurrency: single_per_process
  read_consistency: strong
  idempotency: none
  time_source: none
data_scope: all_data
policy_refs:
  - project-map:POL-002
  - project-map:POL-003
test_obligation:
  predicate: |
    A fixture with one unclassified callee reached from three anchors
    emits one diagnostic with count 3; a fixture whose unknown calls sit
    outside every boundary emits none; a fixture with no served
    specification reports inbound coverage "unmeasured".
  test_template: integration
  boundary_classes:
    - inside the universe versus outside it
    - one anchor versus several anchors on one core
    - inventory present versus absent
  failure_scenarios:
    - inbound coverage reported as a full fraction with no inventory
    - count reporting traversal visits
    - an arbitrary member call classified as an outbound operation
---
```

```yaml
---
id: project-map:BEH-014
type: Behavior
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-08-04T10:58:27.005Z
    change_request: "phase G: the unclassified ratchet"
    scope: first-time-approval
partition_id: project-map
title: build --strict — ratchet on what the baseline does not cover
given: a configuration whose detection emits diagnostics
when: build runs with --strict
then: |
  The build proceeds exactly as it would without the flag: the same
  artifact, the same document, the same write set. The flag adds a
  verdict and nothing else.
  Every diagnostic whose core the baseline lists is suppressed. A
  diagnostic the baseline does not list is new, and the run exits 6. A
  baseline entry matching no diagnostic is stale, and the run exits 6
  for that alone, so a baseline cannot rot into a blanket suppression.
  On a non-zero verdict the run writes the cores it would have needed,
  canonically serialized, to stdout, so a reader can redirect them into
  the baseline file rather than transcribe them.
  With no baseline configured, --strict ratchets against the empty set:
  a repository with any diagnostic exits 6 until it records one.
  --strict never suppresses a mandatory check diagnostic. Those fail
  check mode on their own terms per project-map:BEH-006, and a baseline
  that lists one is stale by this rule.
negative_cases:
  - the same build without --strict, which exits on its own terms and
    reads no baseline
  - a baseline listing a mandatory check diagnostic, which is stale
    rather than effective
out_of_scope:
  - writing the baseline file, which no command does
  - suppressing a fact; the baseline reaches diagnostics alone
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
  - project-map:POL-003
test_obligation:
  predicate: |
    A fixture whose diagnostics the baseline covers exits 0 under
    --strict; the same fixture with one entry removed exits 6 and prints
    that core; a baseline carrying an entry no diagnostic matches exits
    6; and the artifact is byte-identical across all three.
  test_template: integration
  boundary_classes:
    - a covered diagnostic, a new one, and a stale entry
    - a baseline configured against none configured
    - a mandatory check diagnostic listed in the baseline
  failure_scenarios:
    - --strict altering a byte of the artifact or the document
    - a stale entry passing silently
    - a mandatory check diagnostic suppressed by the baseline
---
```

```yaml
---
id: project-map:BEH-015
type: Behavior
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-08-04T13:18:20.213Z
    change_request: "phase G: the enums slice"
    scope: first-time-approval
partition_id: project-map
title: build — what the enums section reports
given: a source tree in a supported language
when: the enums section is rendered
then: |
  One entry is reported per enumerated TYPE, carrying its name, the
  source location of its declaration, and its member names in
  declaration order. A type declaring no member is not reported.
  What counts as an enumerated type is per language and is decided by
  the declaration, never by a name:
  Python — a class whose bases include one the configuration lists in
  `enums.base_classes`, compared on the last dotted segment so an
  aliased import matches. Members are the class-level assignments whose
  target is a plain identifier not starting with an underscore. A class
  nested in another is named by the chain that reaches it, because that
  chain is its name: four exception classes may each declare a
  `ReasonCode`, and they are four types.
  TypeScript and JavaScript — an `enum` declaration; members are its
  assignments and bare identifiers.
  Java and Kotlin — an `enum` declaration and its constants.
  Go — a `const` block whose specs carry a named type. The entry is
  keyed on that type within its package, so two blocks typing one
  enum report one entry carrying the members of both, in the order the
  blocks appear. A repository that splits an enum across blocks gets the
  enum, not one entry per block.
  Entries are ordered by name, and where a name has more than one
  claimant each is headed as project-map:DLT-016 fixes.
negative_cases:
  - a Python class whose base is not listed, which is not an enum
    however it is named
  - a Go const block whose specs carry no type, which names no enum
  - an enumerated type declaring no member
out_of_scope:
  - member values; the section reports names alone
  - an enum a language expresses as a union of literal types
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
    A Go fixture splitting one typed enum across two const blocks
    reports one entry carrying every member of both; two Python classes
    each nesting an enum of one name report two entries named by their
    owners; a class whose base is unlisted is not reported.
  test_template: integration
  boundary_classes:
    - one const block against two typing the same enum
    - a listed base reached directly and through an alias
    - a nested enum against a module-level one
    - a type declaring no member
  failure_scenarios:
    - two entries for one Go type split across blocks
    - two nested enums of different owners sharing one entry
    - a class recognized by its name rather than by its base
    - member order differing from declaration order
---
```

---

## 7. Data contracts

```yaml
---
id: project-map:CTR-004
type: Contract
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-28T10:56:22.908Z
    change_request: detection rework phases A and B
    scope: first-time-approval
partition_id: project-map
title: the analysis unit and the determinism boundary
surface_ref: project-map:SUR-001
schema: |
  The analysis unit is the finite, content-addressed input whose digest
  fixes detection output. The composition root materializes it at the
  CLI input boundary; detection is a pure function of it.
  It contains:
    sources          a finite map from normalized repository-relative
                     path to exact UTF-8 bytes, plus the inclusion
                     manifest that selected them. Selection is
                     materialized at the boundary and is never
                     re-derived from a live filesystem glob. Comments
                     are retained.
    config sections  the `detect`, `openapi`, and `analysis_unit`
                     sections of the resolved configuration
    spec files       every locator referenced by `openapi`, addressed as
                     `repo:<path>` or `monorepo:<path>`, plus the
                     transitive closure of their local file `$ref`s,
                     materialized as a map from normalized locator to
                     bytes
    config documents every file the config-key declaration resolver
                     reads, by normalized repository-relative locator
                     and bytes
    registry version the pinned adapter-registry version, whose digest
                     covers the declarative data adapters and the code
                     adapters
  `repo:` anchors to the directory holding the resolved configuration
  file. `monorepo:` anchors to a monorepo root supplied explicitly to
  the CLI. Root discovery by parent traversal, sentinel search,
  environment, or VCS state is forbidden.
  The `analysis_unit` configuration block carries its own
  `sources.include`, `sources.exclude`, and `config_declarations` list,
  independent of the top-level `exclude` that selects sources for the
  map document. A configuration document enters the unit without
  entering the scanned source set.
  Type identity is proven from syntax and import provenance inside the
  unit alone: explicit annotations, constructor assignments, locally
  declared return types, and configured factory or registry bindings. A
  configured fully qualified type is matched against an import symbol
  without loading that module. Zero proofs and several proofs both yield
  a typed unknown; member-name similarity is not evidence.
preconditions: |
  the configuration validates against project-map:CTR-002 and every
  declared locator resolves inside its anchored root
postconditions: |
  detection observes no absolute path, no live filesystem, no
  environment variable, no clock, no locale, no network, no type
  environment, and no VCS state. The unit digest is a function of the
  materialized bytes alone.
external_identifiers: |
  The `analysis_unit` key and its sub-keys; the `repo:` and `monorepo:`
  locator tags; the config-time error names spec_locator_outside_repo
  and monorepo_root_unresolved.
compatibility_rules: |
  Renaming a locator tag or an `analysis_unit` sub-key is a major bump
  of project-map:SUR-001. Adding a sub-key with a default that
  preserves the prior unit is a minor bump. Widening what enters the
  unit changes the digest of every consumer's artifact and is a major
  bump.
error_taxonomy: |
  A locator resolving outside its anchored root, a locator containing
  "..", and a symlink that escapes the root are the config-time error
  spec_locator_outside_repo. A `monorepo:` locator with no explicitly
  supplied root is the config-time error monorepo_root_unresolved.
  Both are raised before any build and exit 5; neither is an artifact
  diagnostic.
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
  - project-map:POL-003
test_obligation:
  predicate: |
    Materializing one fixture twice yields equal unit digests, and
    materializing a copy of that fixture placed at a different absolute
    path yields the same digest; a locator escaping its anchored root
    exits 5 before any build output is produced.
  test_template: integration
  boundary_classes:
    - identical tree at two absolute paths
    - a source file matching the include pattern but untracked
    - a locator with "..", a symlink escape, an unanchored monorepo root
    - a config document inside the unit and outside the scanned sources
  failure_scenarios:
    - a digest that changes with the absolute path of the checkout
    - a file entering detection through a live filesystem glob
    - a config-time error surfacing as an artifact diagnostic
---
```

```yaml
---
id: project-map:CTR-005
type: Contract
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-28T10:56:22.968Z
    change_request: detection rework phases A and B
    scope: first-time-approval
partition_id: project-map
title: the openapi and detect configuration sections
surface_ref: project-map:SUR-001
schema: |
  Both sections are optional. With neither present, only the built-in
  adapters run.
  `openapi.serves[]` carries `spec` (a tagged locator), `contract_id` (a
  required explicit logical identity), and an optional `mount` prefix.
  `openapi.consumes[]` carries `generated_module`, `spec`,
  `contract_id`, and `target`.
  `contract_id` names one logical contract and recurs on the server and
  on every consumer of that contract; the recurrence is the join.
  Neither info.title with info.version nor a content digest is the join
  identity.
  `detect.outbound` carries `sinks[]` (`base_type`, `call[]`,
  `path_arg`, `method`, `target`, `path_via`), `factories[]`,
  `registry[]`, and `module_ids[]`.
  `path_via` is optional and has the shape `{member, arg}`. Before the
  selected value is normalized, the AST node the `path_arg` selector
  reaches is examined; when it is a call to `member` on the sink's own
  instance, the path is argument `arg` of that call. The sink's
  `target` stays the separate destination and contributes no path
  segment. `detect.inbound.routers[]` carries `dsl`, `path_arg`,
  `prefix_from`, `verb_from`, and `identity_preserving[]`.
  `detect.queue[]` carries a producer or consumer shape and a `topic`
  selector.
  `detect.unclassified_baseline` is a path defaulting to null, whose
  document project-map:CTR-010 fixes. It names a suppression list read
  only under `--strict` and reaching no emitted byte.
  `call[]` entries are objects `{member, path_arg?, method?, target?}`;
  a per-member key overrides the sink-level binding of the same name for
  that member alone. A bare string is sugar for `{member: <name>}`.
  `method` is a selector or `{from: member}`; `{from: member}` takes the
  matched member's own identifier, uppercased, and is the default when
  `method` is omitted.
  `identity_preserving[]` entries are
  `{member, from: receiver|arg, index?, binds?}`. `from: receiver`
  propagates the receiver's identity to the call result; `from: arg`
  propagates argument `index`'s identity to the result;
  `binds: closure_arg0_param0` additionally propagates the identity into
  the first parameter of the function literal passed as argument 0.
  `module_ids[]` maps a client type to a canonical module_id. Within one
  registry version, one module_id identifies exactly one configured
  type.
  A Selector is one SelectorStep or an ordered list of them. Step kinds
  are the closed set: `arg` (positional index or keyword name), `field`,
  `class_const`, `receiver`, and dotted `property-path`. In a list, step
  i+1 applies to the normalized VALUE produced by step i, not to its
  syntax node. `config_ref` is a value kind, not a step kind.
preconditions: the configuration document parses and validates
postconditions: |
  every declared selector is syntactically valid, every module_id maps
  to exactly one type, and every declared anchor is available to
  detection through the analysis unit.
external_identifiers: |
  The `openapi` and `detect` key names and every sub-key spelled above;
  the selector step-kind names; the `from: member`, `from: receiver`,
  `from: arg`, and `closure_arg0_param0` literals; the `path_via` key
  with its `member` and `arg` sub-keys; the `contract_id` and
  `module_id` key names.
compatibility_rules: |
  Renaming a key, a step kind, or a declared literal is a major bump of
  project-map:SUR-001. Adding a step kind or an optional key with a
  default that preserves prior resolution is a minor bump.
error_taxonomy: |
  A selector carrying "*", "?", or character-class syntax, a
  `property-path` expressing a positional index, and a `method` bound to
  `not_applicable` are config-time errors raised before any build,
  exiting 5.
  Two module_ids mapping to one type, and one module_id mapping to two
  types, are config-time errors.
  A syntactically valid selector that resolves to no node or to several
  nodes at a claimed site emits the diagnostic selector_unresolved,
  leaves the artifact reproducible, and fails check mode with exit 4.
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
  - project-map:POL-003
test_obligation:
  predicate: |
    A document declaring every key validates; a glob or name-pattern
    selector is rejected before any build; a selector chain resolves
    left to right over normalized values; an omitted `method` defaults
    to the matched member's uppercased identifier.
  test_template: integration
  boundary_classes:
    - a bare-string call entry versus an object entry with an override
    - a one-step selector versus a chain
    - a glob selector, a duplicate module_id
    - a valid selector matching zero nodes and several nodes
  failure_scenarios:
    - a name pattern accepted in a selector
    - a chain step applied to a syntax node rather than a value
    - selector_unresolved raised as a config-time error rather than a
      diagnostic
---
```

```yaml
---
id: project-map:CTR-006
type: Contract
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-28T10:56:23.032Z
    change_request: detection rework phases A and B
    scope: first-time-approval
partition_id: project-map
title: the detection fact schema, identity, and merge
surface_ref: project-map:SUR-003
schema: |
  The artifact carries two record kinds and a diagnostic list.
  An endpoint fact carries: kind "endpoint"; mechanism; operation with
  its correlated variants; handler; contract_refs; provenance;
  resolution; evidence.
  An outbound_operation fact carries: kind "outbound_operation";
  mechanism; operation with its correlated variants; owner_operation;
  call_site; module_id; callee_operation; contract_ref; provenance;
  resolution; evidence.
  An HTTP variant is the correlated tuple (method, path, destination);
  destination lives inside each variant and its kind is one of
  config_ref, literal, unknown. Independent per-field alternatives are
  forbidden: a branch that varies two fields together emits two
  variants.
  A source anchor is {path, start_byte, end_byte} over the UTF-8 source
  bytes of the analysis unit. call_site and the identity of an
  unresolved fact use this anchor. `line` is display-only evidence,
  excluded from identity and from ordering.
  A symbol value is {kind: "symbol", declaration: <anchor>,
  display_name}. Symbol equality and handler-conflict detection use the
  declaration anchor, never display_name; an alias and a re-export
  resolve to the original declaration anchor. A concrete handler whose
  declaration lies outside the unit is typed unknown(cross_boundary).
  A symbol carries the declaration anchor where the declaration is
  inside the analysis unit and the anchor of the reference that names it
  where it is not. The second case has exactly one producer, the
  callee_operation of an outbound fact carrying a non-null module_id;
  cross-repository equality of that value is (module_id, display_name)
  and belongs to the linker.
  Identity is the semantic core, excluding provenance and evidence.
  mechanism belongs to every core. The inbound core is
  (mechanism, canonical route, method) for HTTP and
  (mechanism, canonical topic, action) for queue; handler and
  contract_refs are enrichment. When any inbound identity component is
  unknown, the source anchor of the registration or the inventory entry
  is added to the core, so unresolved registrations at distinct anchors
  do not merge because their unknown values are equal.
  The outbound core is (mechanism, owner_operation, canonical variant
  set, call_site anchor). Two call sites of one operation are two facts.
  Facts with equal cores merge their sorted-unioned evidence and
  provenance. The inbound merge table, for one core:
    OpenAPI contract_ref and a router handler       one enriched fact
    two contract_ids on one canonical route         one fact, both refs
    one (contract_id, method, path) declared twice  conflicting
    two distinct concrete handler declarations      conflicting
    a served route with no code handler             one fact, handler
                                                    unknown, plus the
                                                    diagnostic
  A generated interface symbol is reconciliation evidence, never the
  handler value; interface evidence together with one router handler is
  not a conflict.
  resolution is derived in order: merged incompatible extractions for
  one core yield "conflicting"; else any unknown in a required field
  yields "unresolved"; else more than one distinct variant yields
  "ambiguous"; else "resolved". Required fields are the method and the
  path or topic, and the destination for HTTP outbound alone. A
  config_ref, a parameter hole, and a canonical template are themselves
  resolved.
  A diagnostic is {code, canonical_callee, canonical_call_shape,
  evidence[], count}, merged by its core, with count equal to the number
  of distinct source anchors. The codes are:
  external_call_unclassified, external_registration_unclassified,
  recognized_sink_field_unresolved, dynamic_target, marker_invalid,
  selector_unresolved, openapi_spec_unreadable,
  openapi_route_not_in_code, generated_operation_unresolved.
preconditions: detection completed over the analysis unit
postconditions: |
  the artifact satisfies project-map:INV-003, project-map:INV-005, and
  the serialization of project-map:CTR-008.
external_identifiers: |
  Every field name spelled above; the record kind values "endpoint" and
  "outbound_operation"; the mechanism values; the provenance values
  "openapi", "router", "generated", "transport", "declared"; the
  resolution values "resolved", "ambiguous", "unresolved",
  "conflicting"; the queue action values "consume" and "produce"; every
  diagnostic code.
compatibility_rules: |
  Renaming a field, a record kind, a provenance value, a resolution
  value, or a diagnostic code is a major bump of project-map:SUR-003,
  because the linker reads them. Adding an optional field, or a
  diagnostic code, is a minor bump. Changing what belongs to a semantic
  core is a major bump, because it re-partitions every consumer's facts.
error_taxonomy: |
  A true duplicate fact id that is not a legal merge fails the build.
  Contradictory extractions for one core yield resolution "conflicting"
  rather than an error.
applicability:
  invariant_to_all_axes: true
concurrency_model:
  actor_concurrency: single_per_process
  read_consistency: strong
  idempotency: none
  time_source: none
data_scope: all_data
policy_refs:
  - project-map:POL-002
  - project-map:POL-003
test_obligation:
  predicate: |
    Each row of the inbound merge table and each step of the resolution
    ladder is exercised by a fixture that produces exactly the declared
    outcome, and a declaration reached through an alias compares equal
    to the same declaration reached directly.
  test_template: integration
  boundary_classes:
    - each merge-table row
    - each resolution-ladder step
    - two unresolved registrations at distinct anchors
    - an alias, a re-export, and two receiver spellings of one
      declaration
  failure_scenarios:
    - two unresolved registrations merged because their unknowns match
    - display_name used for handler equality
    - a finite variant set reported as conflicting
---
```

```yaml
---
id: project-map:CTR-007
type: Contract
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-28T10:56:23.096Z
    change_request: detection rework phases A and B
    scope: first-time-approval
partition_id: project-map
title: the value IR, the resolution budget, and the canonical path grammar
surface_ref: project-map:SUR-003
schema: |
  A normalized value is one of six IR kinds:
    literal      a static string
    config_ref   a config-key locator
                 {declaration, path_segments[]} with the environment
                 axis held separate; a segment is itself a parameter, a
                 choice, or an unknown
    parameter    a formal parameter {owner_symbol, index}
    template     ordered parts: literal segments and typed holes
    choice       a finite set of correlated alternatives
    unknown      {reason}
  A normalized value is a scalar IR or a RECORD, a finite map from field
  to IR. A record is seeded from a composite literal or from a
  constructor summary. An assignment to a field is a strong update; a
  write through a field weakens that field alone. When a record escapes
  to a callee inside the unit within budget, only the fields that callee
  writes are weakened; an escape to an unmodeled callee sets every field
  to unknown(alias_mutation). A field never assigned retains the value
  the constructor summary gave it.
  Resolution is intraprocedural def-use by default, folding string
  literals, module constants, class constants, and concatenation.
  Interprocedural summaries apply to declared sinks alone. The depth
  bound is per proof path, not a consumable counter: the resolver
  explores normalized states by minimum interprocedural distance from
  the emission anchor and de-duplicates states reached by a longer path.
  Every contributing branch terminates within at most three statically
  resolved call edges on one proof path. Intraprocedural edges cost
  zero. At depth three, a contributing edge to a state not already
  proven within depth three yields unknown(depth_exceeded), whatever the
  worklist order and even where a shorter branch already resolved.
  The reason enum is closed: dynamic, recursive, correlation_lost,
  depth_exceeded, alias_mutation, cross_boundary, open_world_dispatch,
  loop_carried, non_finite_branch, operation_in_library,
  operation_in_library_root, operation_mapping_unresolved.
  The canonical path grammar:
    join segments with exactly one "/", collapse duplicates, start at "/"
    strip one trailing "/" except at the root
    remove the query string and the fragment
    percent-decode unreserved characters alone, and normalize the hex
      digits of every retained escape to upper case
    reduce a path parameter of any syntax to a positional hole, holding
      its name and type as metadata
    reduce a wildcard to a distinct wildcard hole
    expand a known optional segment into both concrete variants, and
      reduce an unknown one to a typed hole
    contribute no segment for an empty mount or an empty base
preconditions: the value originates inside the analysis unit
postconditions: |
  every emitted value is one of the six kinds, and every unknown carries
  a reason from the closed enum.
external_identifiers: |
  The six IR kind names and their field names; the twelve reason codes;
  the positional hole and wildcard hole spellings in a canonical path.
compatibility_rules: |
  Renaming an IR kind, a reason code, or a hole spelling is a major bump
  of project-map:SUR-003. Adding a reason code is a minor bump, because
  a consumer reading an unrecognized reason treats the value as
  unresolved. Changing a path-grammar rule re-writes canonical routes
  and is a major bump.
error_taxonomy: |
  A value the normalizer cannot fold is emitted as unknown with the
  matching reason. No stop condition raises a process error.
applicability:
  invariant_to_all_axes: true
concurrency_model:
  actor_concurrency: single_per_process
  read_consistency: strong
  idempotency: none
  time_source: none
data_scope: all_data
policy_refs:
  - project-map:POL-002
  - project-map:POL-003
test_obligation:
  predicate: |
    Each stop condition of the closed enum is reached by a fixture that
    triggers exactly it; a proof graph carrying a short branch and a
    depth-four contributing branch yields unknown(depth_exceeded)
    whatever the traversal order; each of the eight path-grammar rules
    is exercised by a case whose canonical form is asserted.
  test_template: unit
  boundary_classes:
    - each of the twelve reason codes
    - a diamond proof graph, a recursive call, a loop-carried value
    - each path-grammar rule, including mixed-case percent escapes
    - a record field written through an escape versus never written
  failure_scenarios:
    - a depth-four branch resolved because a shorter branch resolved
      first
    - a constructor default lost through a field-writing escape
    - two canonical routes differing only in escape letter case
---
```

```yaml
---
id: project-map:CTR-008
type: Contract
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-28T10:56:23.161Z
    change_request: detection rework phases A and B
    scope: first-time-approval
partition_id: project-map
title: canonical serialization, fact identity, and artifact fingerprints
surface_ref: project-map:SUR-003
schema: |
  Arrays are ordered by role before serialization. Sequence-valued
  arrays preserve their semantic order: template parts, config_ref path
  segments, and every ordered IR. Set-valued arrays are sorted by their
  declared key: contract_refs by (contract_id, operation_id); evidence
  by (path, start_byte, end_byte, role); provenance, variants, facts,
  and diagnostics by their canonical bytes.
  The whole artifact and every fact-id preimage are then serialized with
  RFC 8785 JSON Canonicalization Scheme, which fixes string escaping,
  number form, object-key order, and whitespace. Every numeric field is
  a non-negative integer inside the interoperable safe-integer range.
  Evidence is {path, start_byte, end_byte, role} with a
  repository-relative path using "/". An absolute path, a "..", and a
  symlink escape are forbidden in a path.
  The fact id is computed AFTER merge:
    id = "sha256:" + lowercase_hex(SHA-256(JCS([schema_version,
         repository_identity, kind, semantic_core])))
  The id field, provenance, evidence, resolution, destination.binding,
  and every enrichment field are excluded from the preimage. Total
  output order is by id.
  The artifact embeds schema_version, repository_identity, an
  analyzer_build_digest covering the detector source, the tree-sitter
  runtime and every language grammar, the specification and YAML
  parsers, and the canonicalizer, and the adapter-registry digest as a
  separate value.
  repository_identity is an explicit logical string. It is never
  inferred from a directory name, a VCS remote, package-manager state,
  or an absolute path. Its uniqueness across the link universe is the
  linker's concern.
preconditions: the fact set is merged per project-map:CTR-006
postconditions: |
  the serialized bytes are a function of the fact set alone, so two
  runs over one analysis unit with equal fingerprints emit equal bytes.
external_identifiers: |
  The `id` prefix "sha256:"; the field names schema_version,
  repository_identity, analyzer_build_digest, and the registry digest;
  the declared sort keys of every set-valued array.
compatibility_rules: |
  Changing the fact-id preimage, a sort key, or the canonicalization
  scheme re-writes every id and every byte, and is a major bump of
  project-map:SUR-003. Adding a field outside the preimage is a minor
  bump.
error_taxonomy: |
  A duplicate id that is not a legal merge fails the build fast. A
  non-finite number and a negative integer in a numeric field fail
  serialization rather than being coerced.
applicability:
  invariant_to_all_axes: true
concurrency_model:
  actor_concurrency: single_per_process
  read_consistency: strong
  idempotency: none
  time_source: none
data_scope: all_data
policy_refs:
  - project-map:POL-002
  - project-map:POL-003
test_obligation:
  predicate: |
    The published RFC 8785 test vectors serialize to their expected
    bytes; a fact whose provenance, evidence, resolution, and
    destination.binding differ carries an unchanged id; a sequence-valued
    array keeps its order while a set-valued array is sorted.
  test_template: unit
  boundary_classes:
    - each published JCS test vector
    - a fact differing only in excluded fields
    - a fact differing in one core component
    - a sequence array and a set array in one document
  failure_scenarios:
    - an id that changes with provenance or evidence
    - template parts reordered by the set-array rule
    - a number serialized in a form other than the JCS form
---
```

```yaml
---
id: project-map:CTR-009
type: Contract
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-08-04T08:31:26.221Z
    change_request: govern the installed package
    scope: first-time-approval
partition_id: project-map
title: the installed package — entry point, contents, and runtime
surface_ref: project-map:SUR-004
schema: |
  The published package declares three things a consumer depends on and
  cannot discover any other way.
  `bin` maps the command name `project-map` to the emitted entry point.
  The mapped file is executable and carries a Node shebang, so a shell
  runs it directly and a package manager can link it.
  `files` is the allow-list of what the tarball carries: `dist`, plus
  `README.md`, `CHANGELOG.md` and `LICENSE`. `package.json` is included
  by npm unconditionally and is not listed. Nothing outside the list
  ships, so a consumer receives no source, no test and no fixture.
  `engines.node` declares the runtime range the emitted code requires.
  Every other field of the manifest — the description, the keywords, the
  repository and homepage links — is descriptive. It carries no
  guarantee, and changing it is not a change to this Surface.
preconditions: the package was built by the declared build script
postconditions: |
  Installing the package puts a runnable `project-map` on the path and
  writes no file outside the declared allow-list.
external_identifiers: |
  The command name `project-map` in `bin`; the key names `bin`, `files`
  and `engines`; each entry of the `files` allow-list; the `engines.node`
  range expression.
compatibility_rules: |
  Renaming the command, removing an entry from `files`, or narrowing the
  `engines.node` range is a major bump of project-map:SUR-004: each
  breaks an installation that worked. Adding an entry to `files` or
  widening the range is a minor bump. A change to a descriptive field is
  neither.
error_taxonomy: |
  A package whose `bin` target is absent or not executable is a build
  defect, not a runtime error: it fails at install or on first
  invocation, before any command runs, so no exit code of
  project-map:CTR-001 describes it.
applicability:
  invariant_to_all_axes: true
concurrency_model:
  actor_concurrency: not_applicable
  read_consistency: not_applicable
  idempotency: not_applicable
  time_source: none
data_scope: all_data
policy_refs:
  - project-map:POL-001
  - project-map:POL-002
test_obligation:
  predicate: |
    The manifest declares the command name, the allow-list and the
    engines range spelled above; the emitted entry point runs directly;
    and a packing dry run carries every allow-listed path and nothing
    from src or tests.
  test_template: integration
  boundary_classes:
    - the entry point invoked directly rather than through node
    - an allow-listed path against one outside the list
    - the manifest read as published rather than as authored
  failure_scenarios:
    - a tarball carrying sources or fixtures
    - a bin target that is not executable
    - an engines range the emitted code does not satisfy
---
```

```yaml
---
id: project-map:CTR-010
type: Contract
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-08-04T10:58:26.943Z
    change_request: "phase G: the unclassified ratchet"
    scope: first-time-approval
partition_id: project-map
title: the unclassified baseline and what it suppresses
surface_ref: project-map:SUR-003
schema: |
  The baseline is a file the repository commits, named by
  `detect.unclassified_baseline`, a path defaulting to null.
  It is a JSON document `{schema_version, suppressed[]}` serialized by
  the canonicalization of project-map:CTR-008, so two authors of the
  same set write the same bytes.
  Each `suppressed[]` entry is the core of a diagnostic and nothing
  else: `{code, canonical_callee, canonical_call_shape}`. Source anchors
  are deliberately absent. An anchor moves whenever a line above it
  moves, and a baseline keyed on anchors would churn on every unrelated
  edit; a core survives until the site itself changes shape.
  An entry suppresses every diagnostic sharing its core, however many
  anchors that diagnostic aggregates.
  The baseline is not part of the analysis unit. It is read after the
  fact set is canonical and it never enters the artifact, so for one
  configuration the bytes of `facts.json` are identical whatever the
  file holds and whether or not it exists.
  Declaring the key is a configuration change like any other: it enters
  the configuration digest, and therefore the analysis-unit digest, once
  — the same as adding a sink or a served specification. What the rule
  forbids is the file's CONTENT reaching the artifact, which is where a
  suppression list could otherwise rewrite the facts it suppresses.
preconditions: detection produced a canonical fact set
postconditions: |
  For one configuration, the artifact of project-map:GA-002 is
  byte-identical across every content the baseline file may hold.
external_identifiers: |
  The configuration key `detect.unclassified_baseline`; the document
  keys `schema_version` and `suppressed`; the entry keys `code`,
  `canonical_callee` and `canonical_call_shape`.
compatibility_rules: |
  Renaming a key, or adding a component to the core an entry carries, is
  a major bump of project-map:SUR-003: an existing baseline stops
  matching. Adding an optional key that preserves matching is a minor
  bump.
error_taxonomy: |
  A baseline file that is absent, unreadable, or fails to parse is a
  config-time error raised before any build, exiting 5. An empty
  `suppressed[]` is valid and suppresses nothing.
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
  - project-map:POL-003
test_obligation:
  predicate: |
    Two builds of one configuration whose baseline files differ in
    content produce byte-identical artifacts; an entry matching a
    diagnostic core suppresses every anchor that diagnostic carries; an
    unreadable baseline exits 5.
  test_template: integration
  boundary_classes:
    - a baseline covering every core against one covering none
    - an entry matching one core against an entry matching none
    - a diagnostic carrying one anchor against several
  failure_scenarios:
    - the baseline's content changing a byte of the artifact
    - an entry keyed on an anchor rather than a core
    - a malformed baseline reported as a diagnostic rather than a
      config-time error
---
```

---

## 8. Invariants

```yaml
---
id: project-map:INV-003
type: Invariant
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-28T10:56:23.226Z
    change_request: detection rework phases A and B
    scope: first-time-approval
partition_id: project-map
title: the facts artifact is a pure function of the analysis unit
always: |
  Two builds over one analysis unit, with equal analyzer_build_digest
  and equal adapter-registry digest, produce byte-identical facts
  artifacts with no normalization applied to either side. Equality holds
  across two runs in one directory, across a copy of that directory at a
  different absolute path, and across two machines.
  The artifact carries no timestamp, no build duration, no absolute
  path, no locale-dependent value, and no content derived from a
  suppression baseline. Every value in it is a function of the
  materialized bytes and the resolved configuration alone.
scope: the facts artifact produced by build (project-map:CTR-006)
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
  - the analyzer_build_digest is embedded in the compared bytes, so a
    detector release changes them; project-map:BEH-006 reports that as
    exit 3 rather than as drift
out_of_scope:
  - the sidecar, which carries the timestamp and the duration and which
    check mode never reads
  - the map document, which project-map:INV-001 governs
test_obligation:
  predicate: |
    Building one fixture twice, and building a copy of it placed at a
    different absolute path, yields three byte-identical artifacts.
  test_template: integration
  boundary_classes:
    - a fixture with a resolvable revision and one without
    - a fixture whose sources carry non-ASCII bytes
    - a copy at a longer absolute path
  failure_scenarios:
    - a collection emitted in filesystem or hash-map iteration order
    - an absolute path leaking into an evidence entry
    - a clock or duration value reaching the artifact
---
```

```yaml
---
id: project-map:INV-004
type: Invariant
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-28T15:15:57.795Z
    change_request: detection rework phase C
    scope: first-time-approval
partition_id: project-map
title: detection is structural, never nominal
always: |
  No fact is produced by the spelling of a class, method, function, or
  variable name, and no fact is produced by a name prefix or suffix.
  Every emitted fact terminates its proof path at one of three anchors:
  a symbol resolved through import provenance inside the analysis unit,
  an anchor declared in the `detect` or `openapi` configuration, or a
  binding to a declared generated module.
  The checkable form is rename-invariance: renaming every user-defined
  identifier that is not itself a declared anchor, consistently across
  the analysis unit, leaves the fact set unchanged except for source
  anchors and display_name values.
scope: every fact emitted by detection
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
  - a member call whose identifier matches a router or sink member but
    whose receiver was never bound to the corresponding value
  - a locally declared decorator sharing a name with a framework
    decorator and originating elsewhere
  - a member returning a metrics label rather than a wire topic
out_of_scope:
  - the legacy `endpoints` and `interactions` sections, which
    project-map:CON-001 keeps bound to the prior extractors
test_obligation:
  predicate: |
    A fixture and its consistently renamed twin yield equal fact sets
    modulo anchors and display names; each named decoy fixture yields no
    fact.
  test_template: integration
  boundary_classes:
    - a renamed twin of each adapter fixture
    - a header or query accessor sharing a router member name
    - a shadowed same-name decorator from another module
    - a member named for a topic that returns a label
  failure_scenarios:
    - a fact that disappears when an identifier is renamed
    - a decoy accessor emitted as an endpoint
    - a tracing exporter emitted as a protocol fact
---
```

```yaml
---
id: project-map:INV-005
type: Invariant
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-29T07:46:48.171Z
    change_request: detection rework phase E
    scope: first-time-approval
partition_id: project-map
title: an unproven value is typed, never guessed and never dropped
always: |
  For every emitted fact, each required field either holds a value the
  normalizer proved from the analysis unit or holds unknown carrying a
  reason from the closed enum of project-map:CTR-007. No required field
  is absent, and no unproven field is filled by inference from a name, a
  neighbouring value, or a default that the sources do not carry.
  A site claimed by a classification tier is emitted even when its
  extraction is unresolved; it is never silently discarded, and it never
  falls through to a lower tier.
  resolution is derived by the ladder of project-map:CTR-006 evaluated
  in order, so "conflicting" is a property of a merge and never of a
  single value's IR kind.
scope: every required field of every emitted fact
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
  - a finite runtime set of destinations yields "ambiguous"; reporting
    it as "conflicting" violates the ladder order
out_of_scope:
  - sites outside the candidate universe, which emit neither a fact nor
    a diagnostic
test_obligation:
  predicate: |
    For each stop condition, the fact carrying it is emitted with the
    field typed unknown and the matching reason, and the fact count is
    unchanged against the same fixture with the stop condition removed.
  test_template: integration
  boundary_classes:
    - each required field unresolved in turn
    - a claimed site whose extraction fails entirely
    - a finite variant set versus contradictory extractions
  failure_scenarios:
    - a claimed site dropped because extraction failed
    - a required field absent rather than typed unknown
    - a default value invented for an unproven method
---
```

---

## 10. Generated artifacts

```yaml
---
id: project-map:GA-002
type: GeneratedArtifact
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-28T10:56:23.486Z
    change_request: detection rework phases A and B
    scope: first-time-approval
partition_id: project-map
title: the detection facts artifact and its sidecar
source_ids:
  - project-map:CTR-006
  - project-map:CTR-007
  - project-map:CTR-008
version: 1
generator: project-map-cli
generator_version: "0.3.0"
command: project-map build
output_paths:
  - <config.output.facts> resolved against <project_root>, when non-null
  - the artifact path with a trailing ".json" removed when present and
    ".meta.json" appended
regeneration_mode: clean
published_surface: yes
surface_ref: project-map:SUR-003
applicability:
  invariant_to_all_axes: true
notes: |
  The artifact is regenerated whole on every build; no patch is applied
  to a previously written file, so `clean` is exact.
  The sidecar carries the generation timestamp and the build duration.
  Check mode reads the artifact and ignores the sidecar, which is why
  the two are separate files rather than two sections of one.
  A structural-breaking diff in the emission, which is a renamed field,
  a renamed record kind, a changed semantic core, or a changed fact-id
  preimage, is a major bump of project-map:SUR-003 whatever the bump on
  the source contracts.
  `generator_version` names the release that first emits this artifact.
  It is pinned to the released `package.json` version at the moment this
  record is promoted, not before.
test_obligation:
  predicate: |
    Two consecutive builds over one unchanged tree emit an identical
    artifact, the emission preserves no content from a previously
    written file, and the sidecar carries the timestamp that the
    artifact omits.
  test_template: integration
  boundary_classes:
    - a previously written artifact present versus absent
    - a previously written artifact carrying stale facts
    - the sidecar present versus absent
  failure_scenarios:
    - the emission merging content from a previous artifact
    - a timestamp present in the artifact
    - the sidecar written to a path outside the declared set
---
```

---

## 12. Policies

```yaml
---
id: project-map:POL-003
type: Policy
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-28T10:56:23.292Z
    change_request: detection rework phases A and B
    scope: first-time-approval
partition_id: project-map
title: detection observes only the materialized analysis unit
policy_kind: io_scope
applicability:
  applies_to: |
    project-map:BEH-005, project-map:BEH-006, project-map:BEH-007,
    project-map:BEH-008, project-map:BEH-009, project-map:BEH-010,
    project-map:BEH-011, project-map:BEH-012, project-map:BEH-013
predicate: |
  Detection reads the materialized analysis unit of project-map:CTR-004
  and nothing else. It opens no path for reading outside that unit,
  resolves no path by filesystem search, and observes no absolute path,
  no environment variable, no clock, no locale, and no VCS state.
  The build path invokes no compiler, type checker, language server,
  package loader, reflection facility, bytecode inspector, or
  dependency-source lookup. Type identity is proven from syntax and
  import provenance inside the unit alone.
  This policy narrows project-map:POL-002, which forbids network access
  and model inference across the whole build path.
negative_test_obligations:
  - run detection with the process working directory changed after
    materialization and assert the artifact is unchanged
  - assert the dependency closure of the detection path contains no type
    checker and no language-server client
  - place a file matching the include pattern outside the materialized
    map and assert it contributes no fact
test_obligation:
  predicate: |
    A build whose analysis unit is materialized from one fixture
    produces one artifact whatever the process working directory,
    environment, and locale are at the moment detection runs.
  test_template: integration
  boundary_classes:
    - working directory changed between materialization and detection
    - a locale-sensitive environment variable set to two values
    - a file present on disk and absent from the materialized map
  failure_scenarios:
    - a fact derived from a file outside the materialized map
    - an artifact that varies with the process locale
    - a type resolved by loading a dependency's sources
---
```

---

## 13. Constraints

```yaml
---
id: project-map:CON-001
type: Constraint
lifecycle:
  status: deprecated
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-29T10:17:34.313Z
    change_request: detection rework phase B tail
    scope: first-time-approval
sunset_version: project-map:SUR-002@2.0.0
replacement_id: project-map:DLT-019
partition_id: project-map
title: the legacy detection sections stay bound to the legacy extractors
rule: |
  For the current major version of project-map:SUR-002, the section ids
  `endpoints` and `interactions` render the output of the prior
  extractors, unchanged. The reworked detection renders under the
  section ids `inbound_endpoints`, `outbound_operations`, and
  `detection_coverage`, and a repository opts into them by listing them
  in `sections`.
  The accepted SectionId set and the default `sections` list are
  distinct: the three new ids belong to the accepted set and to no
  default, so a repository that does not name them sees the document it
  saw before.
  Rebinding the legacy ids to the reworked detectors, and deleting the
  legacy adapters, is a later major version.
  That version is project-map:SUR-002 2.0.0, which project-map:DLT-019
  carries. This Constraint held for the whole of major 1 and is retired
  with it: the comparison it existed to make possible was made on both
  validation services.
rationale: |
  Consumers disabled `endpoints` and `interactions` because the prior
  extractors emit false positives. Keeping both outputs available on one
  repository is what lets a consumer compare them on its own sources
  before switching, which is the acceptance evidence the rollout needs.
  Silently rebinding the ids would replace one unverified output with
  another inside a document that check mode compares byte for byte.
scope: the section ids of project-map:CTR-003 and their renderers
applicability:
  invariant_to_all_axes: true
data_scope: all_data
policy_refs:
  - project-map:POL-001
test_obligation:
  not_applicable: true
  reason: |
    The Constraint is deprecated at its own sunset, project-map:SUR-002
    2.0.0, which project-map:DLT-019 carries. Its predicate named a
    legacy id rendering the prior output beside its reworked
    counterpart; both halves of that pair are gone, so no test can hold
    it without asserting behavior the tool no longer has. The fixture
    that carried it now asserts the replacement, that a legacy id
    renders the reworked output, under project-map:DLT-019.
---
```

---

## 17. Open questions

```yaml
---
id: project-map:OQ-002
type: Open-Q
partition_id: project-map
question: |
  The requirements source makes `repository_identity` a required
  configuration key unconditionally. Applied unconditionally it
  invalidates this repository's own `.project-map.yaml` and all four
  fixtures under `tests/fixtures/` on the day the key lands, although
  none of them emits a facts artifact and none participates in a
  cross-repository join. Is the key required for every configuration, or
  for the configurations that emit facts?
options:
  - option: require the key unconditionally
    consequence: |
      Every existing configuration becomes invalid until it gains the
      key, including configurations that never emit a facts artifact.
      The rule is one line and carries no conditional branch.
  - option: require the key when facts are emitted or detection is
      configured
    consequence: |
      A configuration that emits no artifact keeps validating unchanged.
      The requiredness rule becomes conditional on `output.facts` being
      non-null or on the presence of an `openapi` or `detect` section,
      which is a branch the schema and its tests carry.
blocking: no
owner: cyberash
default_if_unresolved: |
  require the key when facts are emitted or detection is configured
notes: |
  Raised while mapping the requirements source onto this repository, not
  from a reported defect. The identity is meaningless for a
  configuration that emits no facts, since only the artifact and the
  linker read it.
---
```

```yaml
---
id: project-map:OQ-003
type: Open-Q
partition_id: project-map
question: |
  Both validation services route the path of an outbound call through a
  helper the sink's base type declares, rather than passing it to the
  sending member directly. In `yandex_pay_plus` seventeen of the
  nineteen call sites in its own interactions tree read
  `url=self.endpoint_url('/webapi/Order')`, where `endpoint_url` joins
  the class constant the sink already declares as its target with its
  own argument. The base type is declared in a shared library outside
  the analysis unit, so the helper is not a statically resolved call
  edge and the value it returns is unknown(cross_boundary).
  A Selector cannot reach the literal: project-map:CTR-005 fixes that
  step i+1 of a chain applies to the normalized VALUE of step i, and the
  normalized value of a call to an unmodeled callee carries no
  arguments. Should the sink schema gain a way to declare such a helper,
  or should those seventeen paths stay typed holes?
options:
  - option: declare the helper on the sink
    consequence: |
      `detect.outbound.sinks[]` gains a key naming a path-composing
      member and the argument that carries the path, which is a content
      change to project-map:CTR-005 and a minor bump of
      project-map:SUR-001. Seventeen of the nineteen paths fold to
      literals and become joinable.
  - option: leave the paths as typed holes
    consequence: |
      The configuration surface stays as approved. Every call site is
      still emitted, its path typed unknown(cross_boundary) under
      project-map:INV-005, so the facts carry a destination and a method
      but no route the linker can join on.
  - option: widen the chain semantics instead
    consequence: |
      A chain step would navigate the syntax of an unresolved call
      rather than a normalized value, which contradicts the sentence
      project-map:CTR-005 states about chains and would reach every
      selector in the configuration, not this one form.
blocking: no
owner: cyberash
default_if_unresolved: |
  declare the helper on the sink
notes: |
  It does not block the spec: only the pay_plus half of the outbound
  ladder depends on the answer, and the phase proceeds on the default
  under project-map:ASM-003.
  Raised from reading the two validation services before implementing
  the outbound ladder, not from a reported defect. The form is not
  peculiar to one service: a base type that owns both the target and the
  path join is the ordinary shape of a hand-written HTTP client.
  `midas` does not hit it. Its sending members take a record whose
  fields the caller assigns, which the chain
  `[{arg: 0}, {field: APIMethod}]` already expresses against the record
  lattice of project-map:CTR-007.
---
```

---

## 18. Assumptions

```yaml
---
id: project-map:ASM-002
type: ASSUMPTION
partition_id: project-map
assumption: |
  `repository_identity` is required exactly when `output.facts` is
  non-null or an `openapi` or `detect` section is present, and is
  optional otherwise. Configurations that emit no facts artifact keep
  validating without the key.
source_open_q: project-map:OQ-002
blocking: no
review_by: "2026-12-31"
default_if_unresolved: |
  require the key when facts are emitted or detection is configured
tests:
  - the configuration obligation of project-map:CTR-002 exercises a
    document with no `repository_identity` and no `output.facts`, which
    validates, and a document with `output.facts` and no
    `repository_identity`, which is rejected
---
```

```yaml
---
id: project-map:ASM-003
type: ASSUMPTION
partition_id: project-map
assumption: |
  A `detect.outbound.sinks[]` entry may declare a member of its base type
  whose argument supplies the path. Before the value selected by
  `path_arg` is normalized, detection examines the selected AST node.
  When that node is a call to the declared member whose receiver is the
  sink's own instance, the declared argument carries only the path; the
  sink's own `target` remains the separate destination of the HTTP
  variant. Where no such member is declared, or the selector reaches
  something else, the path stays typed under project-map:INV-005.
source_open_q: project-map:OQ-003
blocking: no
review_by: "2026-12-31"
default_if_unresolved: |
  declare the helper on the sink
tests:
  - the configuration obligation of project-map:CTR-005 exercises a
    sink declaring the member, whose selected AST call folds the
    declared argument to a literal path while keeping `target` as the
    destination, and one omitting it, whose call site keeps a typed hole
    while still emitting the fact
---
```

---

## 15. Deltas

```yaml
---
id: project-map:DLT-004
type: Delta
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-28T10:56:23.618Z
    change_request: detection rework phases A and B
    scope: first-time-approval
partition_id: project-map
title: the configuration carries an identity, an analysis unit, a facts path
target_id: project-map:CTR-002
kind: extend
baseline_version: project-map:BL-001
compatibility_action: ignore
surface_impact:
  - id: project-map:SUR-001
    intended_version: "1.3.0"
as_is: |
  project-map:CTR-002 lists fourteen top-level configuration keys, none
  of which names a repository identity or bounds an analysis unit. The
  source selection that reaches extraction is the one the top-level
  `exclude` key produces, and it is derived from a live filesystem walk.
to_be: |
  project-map:CTR-002 additionally accepts `repository_identity`,
  `analysis_unit`, and `output.facts`. `repository_identity` is a
  logical string, required exactly when a facts artifact is emitted or a
  detection section is present, per project-map:ASM-002. `analysis_unit`
  carries `sources.include`, `sources.exclude`, and
  `config_declarations`, whose semantics project-map:CTR-004 fixes.
  `output.facts` is a path defaulting to null.
  The requiredness rule names the detection sections before
  project-map:DLT-005 admits them, so that arm stays unreachable until
  it does and the rule text is written once.
  project-map:SUR-001 gains project-map:CTR-004 as a member. The bump is
  minor: every key carries a default that reproduces the prior
  resolution, and no key is renamed or removed.
  This Delta and project-map:DLT-005 are approved in one plan, so the
  two minor bumps they carry are applied as one move. Per
  project-map:DLT-011 both declare 1.2.0, the version the Surface holds
  once project-map:DLT-009 adds the major bump the widened policy
  predicate requires and project-map:DLT-012 adds the sink key.
migration_note: |
  A configuration written before this change validates unchanged and
  resolves to the same source set, because `analysis_unit` defaults to
  the selection the top-level keys already produce and no facts artifact
  is emitted without `output.facts`.
tests_old_behavior: |
  The existing obligation of project-map:CTR-002 keeps a minimal
  document valid and keeps an unknown top-level key rejected; a document
  carrying neither new key still resolves to its prior source set.
tests_new_behavior: |
  A document carrying `analysis_unit` resolves the declared unit, a
  document that emits facts without `repository_identity` is rejected,
  and a document that emits none without it validates.
---
```

```yaml
---
id: project-map:DLT-005
type: Delta
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-28T10:56:23.683Z
    change_request: detection rework phases A and B
    scope: first-time-approval
partition_id: project-map
title: the configuration carries the detection sections
target_id: project-map:CTR-002
kind: extend
baseline_version: project-map:BL-001
compatibility_action: ignore
surface_impact:
  - id: project-map:SUR-001
    intended_version: "1.3.0"
as_is: |
  project-map:CTR-002 accepts no `openapi` and no `detect` section.
  Detection anchors cannot be declared, so an in-house wrapper is
  invisible to extraction and the identity requiredness rule that
  project-map:DLT-004 wrote has an arm no document can reach.
to_be: |
  project-map:CTR-002 additionally accepts `openapi` and `detect`, whose
  schema project-map:CTR-005 fixes. Declaring either section now
  requires `repository_identity`, which makes the second arm of the rule
  project-map:DLT-004 wrote reachable without restating it.
  project-map:SUR-001 gains project-map:CTR-005 as a member. The bump
  this Delta contributes is minor: both sections default to empty, which
  reproduces the prior behavior. Per project-map:DLT-011 it declares
  1.2.0, the version the Surface holds once project-map:DLT-009 adds the
  major bump the widened policy predicate requires and
  project-map:DLT-012 adds the sink key.
migration_note: |
  A configuration written before this change runs the built-in adapters
  alone, because both sections default to empty, and needs no identity,
  because declaring neither section leaves the rule's arm unreached.
tests_old_behavior: |
  A document carrying neither detection section validates and produces
  the document it produced before, with no identity declared.
tests_new_behavior: |
  A document declaring both sections validates, an invalid selector is
  rejected before any build, and a document declaring a section without
  `repository_identity` is rejected.
---
```

```yaml
---
id: project-map:DLT-006
type: Delta
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-29T10:17:34.172Z
    change_request: detection rework phase B tail
    scope: first-time-approval
partition_id: project-map
title: the command surface gains facts exit codes and a digest command
target_id: project-map:CTR-001
kind: extend
baseline_version: project-map:BL-001
compatibility_action: ignore
surface_impact:
  - id: project-map:SUR-001
    intended_version: "1.3.0"
as_is: |
  project-map:CTR-001 declares exit code 0 for success, 1 for a check
  drift, and 2 for no discoverable configuration. A configuration error
  inside a detection section, a fingerprint mismatch, and a mandatory
  check diagnostic have no code of their own, so a consumer's CI cannot
  tell an analyzer release from a change in its own sources.
to_be: |
  project-map:CTR-001 additionally declares exit code 3 for a
  fingerprint mismatch, 4 for a mandatory check diagnostic, and 5 for a
  config-time error raised before any build, with the precedence
  project-map:BEH-006 states. It additionally declares the command
  `project-map facts --unit-digest`, which prints the analysis-unit
  digest and writes no path.
  project-map:SUR-001 takes a minor bump above the 1.0.0 that
  project-map:DLT-009 established. No existing code is reassigned and no
  option is renamed.
migration_note: |
  A consumer that treats any non-zero code as failure keeps working. A
  consumer that branches on code 1 keeps seeing 1 for a content drift,
  because the new codes cover conditions that previously exited 0 or
  raised an unclassified error.
tests_old_behavior: |
  The existing obligation of project-map:CTR-001 keeps 0, 1, and 2
  bound to their conditions.
tests_new_behavior: |
  Each new code is produced by a fixture triggering exactly its
  condition, 3 outranks 1 where both apply, and `facts --unit-digest`
  writes no path.
---
```

```yaml
---
id: project-map:DLT-007
type: Delta
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-29T10:17:34.243Z
    change_request: detection rework phase B tail
    scope: first-time-approval
partition_id: project-map
title: the map document accepts three opt-in detection sections
target_id: project-map:CTR-003
kind: extend
baseline_version: project-map:BL-001
compatibility_action: ignore
surface_impact:
  - id: project-map:SUR-002
    intended_version: "2.0.0"
as_is: |
  project-map:CTR-003 fixes the SectionId set at nine values, and the
  configuration defaults `sections` to that whole set. Accepted set and
  default list are one list, so any added id renders in every
  consumer's document without a configuration change.
to_be: |
  project-map:CTR-003 accepts twelve SectionId values: the nine it
  already names plus `inbound_endpoints`, `outbound_operations`, and
  `detection_coverage`. The accepted set and the default `sections`
  list become distinct; the default stays the original nine.
  project-map:SUR-002 takes a minor bump above the 1.0.0 that
  project-map:DLT-009 established. Adding a SectionId is minor under the
  compatibility rules project-map:CTR-003 already declares, and no
  heading, no row label, and no existing id changes.
migration_note: |
  A consumer whose configuration names no `sections` key renders the
  same nine sections and the same bytes as before, so no committed
  document goes out of date. A consumer opts in by naming a new id.
tests_old_behavior: |
  A configuration with no `sections` key renders the nine legacy
  sections in their declared order and none of the new ones.
tests_new_behavior: |
  A configuration naming a new id renders that section, and the
  accepted-set check rejects an id outside the twelve.
---
```

```yaml
---
id: project-map:DLT-008
type: Delta
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-28T10:55:19.654Z
    change_request: detection rework phases A and B
    scope: first-time-approval
partition_id: project-map
title: the bounded write set covers the facts artifact and its sidecar
target_id: project-map:POL-001
kind: extend
baseline_version: project-map:BL-001
compatibility_action: ignore
as_is: |
  project-map:POL-001 bounds the write set of `build` to the resolved
  markdown path and, when configured, the resolved JSON path. A facts
  artifact written under that policy would be a write outside the
  declared set.
to_be: |
  project-map:POL-001 additionally admits, for `build`,
  path.resolve(<project_root>, <config.output.facts>) when that value is
  a string, and the sidecar path derived from it by removing a trailing
  ".json" when present and appending ".meta.json". The write set of
  `build --check` stays empty.
  The predicate change reaches project-map:CTR-001, project-map:CTR-002,
  and project-map:CTR-003 through their policy_refs, so it cascades to
  project-map:SUR-001 and project-map:SUR-002 as a content change. Both
  Surfaces take the minor bump that project-map:DLT-005,
  project-map:DLT-006, and project-map:DLT-007 already carry; this Delta
  adds no further bump of its own.
migration_note: |
  A configuration leaving `output.facts` null writes exactly the paths
  it wrote before, because the two added paths are admitted only when
  that key is a string.
tests_old_behavior: |
  The existing write-set obligation of project-map:POL-001 keeps every
  other command's declared set unchanged, and keeps the check-mode set
  empty.
tests_new_behavior: |
  A build with `output.facts` set opens exactly four paths for writing
  at most, and a build with it null opens neither of the two added
  paths.
---
```

```yaml
---
id: project-map:DLT-009
type: Delta
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-28T11:25:18.422Z
    change_request: detection rework phases A and B
    scope: corrective-bump
partition_id: project-map
title: the widened write set is a major bump of both surfaces
target_id: project-map:POL-001
kind: replace
baseline_version: project-map:BL-001
compatibility_action: ignore
surface_impact:
  - id: project-map:SUR-001
    intended_version: "1.3.0"
  - id: project-map:SUR-002
    intended_version: "2.0.0"
as_is: |
  project-map:DLT-008 widened the predicate of project-map:POL-001 to
  admit the facts artifact and its sidecar, and declared that the
  cascade adds no bump of its own because project-map:SUR-001 and
  project-map:SUR-002 were already moving for other reasons. That is
  wrong. SDD §11 makes a predicate change on a Policy a major bump of
  every referencing Surface, and both Surfaces reference
  project-map:POL-001 through their member Contracts. The declared
  moves were minor: 0.2.2 to 0.4.0 and 0.3.0 unchanged.
to_be: |
  project-map:SUR-001 moves to 1.2.0 and project-map:SUR-002 moves to
  1.0.0. Neither predicate of the two Surfaces changed; the bump records
  that a guarantee their consumers hold has been weakened.
  The weakened guarantee is specific. Before, `build` provably opened at
  most two paths for writing. It can now open four. A consumer that
  bounds the process write set, in a sandbox profile or a CI policy,
  fails against the new binary unless it admits the two added paths.
  Nothing else changes: the paths are admitted only when
  <config.output.facts> is a string, which defaults to null, so a
  configuration written before this change writes exactly what it wrote.
migration_note: |
  A consumer that does not bound the tool's write set needs no action. A
  consumer that does adds path.resolve(<project_root>,
  <config.output.facts>) and its sidecar to the permitted set, or leaves
  <config.output.facts> null and is unaffected.
tests_old_behavior: |
  The write-set obligation of project-map:POL-001 keeps the two-path
  bound for a configuration whose <config.output.facts> is null, which
  is every configuration written before this change.
tests_new_behavior: |
  tests/integration/facts-artifact.test.ts asserts the four-path bound
  where the key names a path and the two-path bound where it does not;
  the version of each Surface equals the value declared here.
---
```

```yaml
---
id: project-map:DLT-010
type: Delta
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-28T11:28:53.627Z
    change_request: detection rework phases A and B
    scope: corrective-bump
partition_id: project-map
title: an earlier delta names a surface version that was superseded
target_id: project-map:DLT-004
kind: replace
baseline_version: project-map:BL-001
compatibility_action: ignore
surface_impact:
  - id: project-map:SUR-001
    intended_version: "1.3.0"
as_is: |
  project-map:DLT-004 declares `surface_impact`
  project-map:SUR-001@0.4.0. It was approved and its bump was applied,
  and project-map:DLT-009 then carried the same Surface to 1.0.0 within
  the same unreleased change set. The declaration now names a version
  the Surface passed through rather than the one it holds, and
  `sdd ready` reads that as a bump still waiting to be applied.
to_be: |
  The declaration names 1.2.0, the version project-map:SUR-001 reaches
  in this change set. No consumer saw 0.4.0: it existed between two
  commits on one branch and was never released, so recording the
  intermediate step buys nothing and misstates the outcome.
migration_note: |
  No consumer-visible change. The emitted artifacts and the code are
  untouched; only one declaration in the specification graph moves to
  the version its Surface actually holds.
  The churn is worth naming: it exists because the Surface was bumped
  twice inside one change set, once for the added members and once for
  the widened policy predicate. Folding the second into the first would
  have avoided it, and a later change set that touches a Policy
  predicate should declare the major bump from the start.
tests_old_behavior: |
  The intermediate declaration carried no acceptance predicate of its
  own, so no test preserves it; as_is records it.
tests_new_behavior: |
  `sdd ready` reports no surface_member_drift for project-map:SUR-001.
---
```

```yaml
---
id: project-map:DLT-011
type: Delta
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-29T07:50:09.552Z
    change_request: detection rework phase E
    scope: corrective-bump
partition_id: project-map
title: every superseded surface declaration names the version the surface holds
target_id: project-map:SUR-001
kind: replace
baseline_version: project-map:BL-001
compatibility_action: ignore
surface_impact:
  - id: project-map:SUR-001
    intended_version: "1.3.0"
as_is: |
  project-map:DLT-004, project-map:DLT-005, project-map:DLT-009 and
  project-map:DLT-010 each declare `surface_impact` on
  project-map:SUR-001 at 1.0.0 or below. Each was approved and its bump
  was applied, and a later Delta in the same unreleased change set then
  carried the Surface past that version. The declarations now name
  versions the Surface passed through rather than the one it holds, and
  `sdd ready` reads each as a bump still waiting to be applied.
to_be: |
  Every `surface_impact` declaration on project-map:SUR-001 belonging to
  a Delta that has already been finalized names 1.2.0, the version the
  Surface holds after project-map:DLT-012. No consumer saw the
  intermediate versions: each existed between two commits on one branch
  and none was released, so recording an intermediate step buys nothing
  and misstates the outcome.
  This Delta is written against the Surface rather than against one
  earlier Delta, so a later bump re-pins the same set by moving one
  version rather than by adding a record per superseded declaration.
migration_note: |
  No consumer-visible change. The emitted artifacts and the code are
  untouched; only declarations in the specification graph move to the
  version their Surface actually holds.
  The churn is worth naming. It exists because a finalized Delta keeps
  its `surface_impact` as a live intent, so every future bump of a
  Surface puts every past Delta on it into drift. Folding a change
  set's bumps into one declaration reduces how often this fires but does
  not remove it; the durable fix belongs in the verifier, which cannot
  tell an applied bump from a pending one.
tests_old_behavior: |
  The intermediate declarations carried no acceptance predicate of their
  own, so no test preserves them; as_is records them.
tests_new_behavior: |
  `sdd ready` reports no surface_member_drift for project-map:SUR-001.
---
```

```yaml
---
id: project-map:DLT-012
type: Delta
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-29T07:46:48.234Z
    change_request: detection rework phase E
    scope: first-time-approval
partition_id: project-map
title: a sink may declare the member that composes its path
target_id: project-map:CTR-005
kind: extend
baseline_version: project-map:BL-001
compatibility_action: ignore
surface_impact:
  - id: project-map:SUR-001
    intended_version: "1.3.0"
as_is: |
  project-map:CTR-005 declares `detect.outbound.sinks[]` with
  `base_type`, `call[]`, `path_arg`, `method`, and `target`, and fixes
  that step i+1 of a Selector chain applies to the normalized VALUE of
  step i. A base type that owns both the target and the join of the path
  onto it is therefore inexpressible: the value the `path_arg` selector
  reaches is a call to a member declared outside the analysis unit, so
  it normalizes to unknown(cross_boundary) and carries no argument a
  further step could name.
to_be: |
  A `detect.outbound.sinks[]` entry additionally carries an optional
  `path_via` of the shape `{member, arg}`. Before the selected value is
  normalized, detection examines the AST node a `path_arg` selector
  reaches. When that node is a call whose member name equals
  `path_via.member` and whose receiver is the sink's own instance, the
  path is the value of argument `path_via.arg` of that call, canonicalized
  by the path grammar of project-map:CTR-007. The sink's `target` remains
  the separate destination and is not included in path canonicalization.
  The key defaults to absent, and an absent key resolves exactly as before.
  `path_via` and the literal `member` and `arg` key names join the
  external identifiers of project-map:CTR-005. project-map:SUR-001 takes
  its own minor bump from the 1.1.0 that project-map:DLT-006 establishes
  to 1.2.0.
migration_note: |
  Every configuration written before this key keeps resolving to the
  same values, because the key is optional and is consulted only where
  the selector reaches a call to the named member.
tests_old_behavior: |
  The existing configuration obligation of project-map:CTR-005 keeps a
  document declaring every other key validating, and keeps a glob
  selector a config-time error.
tests_new_behavior: |
  A sink declaring `path_via` inspects the selected AST call before
  normalization and folds that member's declared argument to the literal
  path `/webapi/Register`, while preserving a config_ref `target` as the
  separate destination; the same fixture with the key removed emits the
  same fact count with the path typed unknown(cross_boundary); a call to
  the named member on a receiver that is not the sink's instance is not
  folded.
---
```

```yaml
---
id: project-map:DLT-013
type: Delta
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-29T10:21:01.495Z
    change_request: detection rework phase B tail
    scope: corrective-bump
partition_id: project-map
title: every superseded declaration on the map-document surface names its version
target_id: project-map:SUR-002
kind: replace
baseline_version: project-map:BL-001
compatibility_action: ignore
surface_impact:
  - id: project-map:SUR-002
    intended_version: "2.0.0"
as_is: |
  project-map:DLT-009 declares `surface_impact` on project-map:SUR-002
  at 1.0.0. It was approved and its bump was applied, and
  project-map:DLT-007 then carried the Surface to 1.1.0 within the same
  unreleased change set. The declaration now names a version the Surface
  passed through rather than the one it holds, and `sdd ready` reads it
  as a bump still waiting to be applied.
to_be: |
  Every `surface_impact` declaration on project-map:SUR-002 belonging to
  a Delta that has already been finalized names 1.1.0, the version the
  Surface holds after project-map:DLT-007. No consumer saw the
  intermediate version: it existed between two commits on one branch and
  was never released.
  This Delta is written against the Surface rather than against one
  earlier Delta, so a later bump re-pins the same set by moving one
  version rather than by adding a record per superseded declaration. It
  is the counterpart of project-map:DLT-011, which does the same for
  project-map:SUR-001.
migration_note: |
  No consumer-visible change. The emitted artifacts and the code are
  untouched; only declarations in the specification graph move to the
  version their Surface actually holds.
  The churn has one cause, named in project-map:DLT-011: a finalized
  Delta keeps its `surface_impact` as a live intent, so every future
  bump of a Surface puts every past Delta on it into drift. The durable
  fix belongs in the verifier, which cannot tell an applied bump from a
  pending one.
tests_old_behavior: |
  The intermediate declaration carried no acceptance predicate of its
  own, so no test preserves it; as_is records it.
tests_new_behavior: |
  `sdd ready` reports no surface_member_drift for project-map:SUR-002.
---
```

```yaml
---
id: project-map:DLT-014
type: Delta
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-29T12:46:32.311Z
    change_request: detection rework phase F
    scope: first-time-approval
partition_id: project-map
title: a consumer half anchors the callee it names at the reference site
target_id: project-map:CTR-006
kind: extend
baseline_version: project-map:BL-001
compatibility_action: ignore
surface_impact:
  - id: project-map:SUR-003
    intended_version: "1.1.0"
as_is: |
  project-map:CTR-006 fixes a symbol value as {kind: "symbol",
  declaration: <anchor>, display_name} and fixes that an alias and a
  re-export resolve to the original declaration anchor. It also fixes
  that a concrete handler whose declaration lies outside the unit is
  typed unknown(cross_boundary).
  project-map:BEH-012 requires the consumer half of a shared-library
  operation to carry callee_operation as the join key. On that half the
  member is declared inside the library, which is outside the analysis
  unit by construction: the consumer imports the type and calls the
  member, and never sees the body. Under the rule as written the only
  available typing is unknown(cross_boundary), which erases the join key
  the behavior exists to emit.
to_be: |
  A symbol value carries the declaration anchor where the declaration is
  inside the analysis unit, and the anchor of the reference that names
  the symbol where it is not. The two cases are distinguished by
  provenance, not by the field: an outbound fact carrying a non-null
  module_id names its callee from the reference site, and every other
  symbol value in the artifact keeps naming a declaration.
  Equality of a callee_operation across repositories is
  (module_id, display_name) and belongs to the linker; equality inside
  one unit stays the declaration anchor, so handler-conflict detection
  is untouched.
  project-map:SUR-003 takes a minor bump from 1.0.0 to 1.1.0: the rule
  constrains a field that previously had no non-null producer, and no
  emitted value changes shape.
migration_note: |
  No previously emitted fact changes. Before this Delta module_id was
  always null and callee_operation was therefore always null, so the
  case the rule governs had no producer.
tests_old_behavior: |
  The existing obligation of project-map:CTR-006 keeps handler equality
  and the alias case bound to the declaration anchor, and keeps a
  handler declared outside the unit typed unknown(cross_boundary).
tests_new_behavior: |
  A consumer fixture calling a member of a type whose declaration is
  outside the unit emits callee_operation as a symbol whose declaration
  anchor spans the member access in the consumer and whose display_name
  is the member identifier, while the same run keeps an endpoint whose
  handler lies outside the unit typed unknown.
---
```

```yaml
---
id: project-map:DLT-015
type: Delta
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-30T11:16:20.241Z
    change_request: detection section cell markup
    scope: first-time-approval
partition_id: project-map
title: the detection sections render their cells as code, not as prose
target_id: project-map:CTR-003
kind: extend
baseline_version: project-map:BL-001
compatibility_action: ignore
surface_impact:
  - id: project-map:SUR-002
    intended_version: "2.0.0"
as_is: |
  project-map:CTR-003 fixes which columns the three detection sections
  render but not the markup of a cell, and every cell is emitted as
  markdown prose. The serializer therefore escapes each underscore,
  because in prose an underscore can open emphasis: a document of one
  validation service carries 3023 such escapes across 2.54% of its
  bytes, and an identifier a reader greps for is spelled
  `\_maybe\_update\_split\_purchase` rather than as it appears in the
  source.
  The escapes are not removable by suppressing them. A Python member
  named `__init__` rendered without them is read as strong emphasis, and
  `_private_` as emphasis, so the document would silently drop the
  underscores from the names it exists to report.
to_be: |
  Every cell of `inbound_endpoints`, `outbound_operations` and
  `detection_coverage` that carries a name, a value or a closed-enum
  member is emitted as inline code. A cell carrying a count stays prose.
  Inline code is the honest node for these cells: each is a token the
  analyzer produced, never prose. It also removes the hazard rather than
  trading it, because emphasis is not parsed inside code, so
  `__init__` renders as itself.
  The legacy sections are untouched. Their bytes are committed in
  consumer repositories, project-map:CON-001 binds their ids to the
  prior extractors for this major version, and the same reasoning would
  make their change disruptive without making it more correct.
  project-map:SUR-002 takes a minor bump from 1.1.0 to 1.2.0: the
  document's structure, its section ids and its heading texts are
  unchanged, and only the markup of cells inside three sections moves.
  Every `surface_impact` declaration on project-map:SUR-002 belonging to
  a finalized Delta names 1.2.0 from here, superseding the pin
  project-map:DLT-013 set at 1.1.0. That record's own reasoning applies
  unchanged: re-pinning one version beats adding a record per superseded
  declaration.
migration_note: |
  A consumer that renders the three sections sees its committed document
  reported out of date once and rebuilds. No consumer that omits them is
  affected, and the three ids belong to no default section list.
  A consumer parsing the document keeps working: unescaping a value that
  carries no backslash is the identity.
tests_old_behavior: |
  The obligation of project-map:CON-001 keeps a configuration naming no
  section rendering the legacy nine unchanged, which is where the prose
  cells and their escaping remain observable.
tests_new_behavior: |
  A fixture whose declaration carries an underscore renders that name in
  a detection section as inline code with no escape, and a member named
  `__init__` survives a round trip through the document as the four
  underscores it was written with rather than as emphasis.
---
```

```yaml
---
id: project-map:DLT-016
type: Delta
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-07-30T12:26:55.673Z
    change_request: entity identity and legacy cell markup
    scope: first-time-approval
partition_id: project-map
title: an entity is reported as the declaration it is, not as its bare name
target_id: project-map:CTR-003
kind: replace
baseline_version: project-map:BL-001
compatibility_action: migrate
surface_impact:
  - id: project-map:SUR-002
    intended_version: "2.0.0"
as_is: |
  The entities and enums sections identify a declaration by its bare
  name. In a service-sized repository that name is not unique: one
  validation service declares seventeen Go structs called `Config`, so
  its document carries six identical `### ` + "`Config`" + ` headings
  that a reader can tell apart only by the source line beneath them, and
  seventeen names in total lose twenty-six entries that way.
  The Go adapter compounds it. Methods are collected into a map keyed on
  the bare receiver type across every file, so each of those `Config`
  types is reported with the union of the methods of all of them. The
  document names members the type does not have, and repeats a member
  two packages both declare. A method cannot be declared outside the
  package of its receiver, so the key was always wrong.
  A field type is emitted as written, so an anonymous struct spanning
  lines reaches the document with its indentation encoded as `&#x9;`,
  and a Go pointer type is escaped as `\*` because the field bullet is
  prose.
to_be: |
  A declaration whose bare name no other declaration claims is reported
  as that name. Where two or more claim it, each is qualified by the
  shortest suffix of its declaring directory that tells it apart, so
  `logic/bunker/config.go` reads `bunker.Config`. The qualifier is a
  pure function of the extracted set and adds nothing where nothing
  collides.
  A Go method is attributed to the receiver's package, so a type is
  reported with its own members and no others.
  A field type is folded onto one line, and a field bullet is inline
  code: a name and a type are tokens, and in prose the serializer
  escapes the pointer marker. An enum member is a token by the same
  reading and is inline code too; the sections this Delta already
  re-heads should not spell half their content one way and half the
  other.
  project-map:SUR-002 takes a minor bump from 1.2.0 to 1.3.0. Every
  `surface_impact` declaration on it belonging to a finalized Delta
  names 1.3.0 from here, superseding the pin project-map:DLT-015 set.
migration_note: |
  A consumer rebuilds once. A heading that was ambiguous changes; one
  that was not is untouched, so a document whose names never collided is
  unchanged apart from the field bullets.
  The method lists that change were wrong before: they reported members
  of types in other packages.
tests_old_behavior: |
  No test preserved the old behavior, because the old behavior was the
  defect: `as_is` records it. The existing obligations of
  project-map:CTR-003 keep the section headings, the metadata rows and
  the ordering of project-map:INV-002 unchanged.
tests_new_behavior: |
  A fixture declaring one type name in two packages renders two distinct
  headings, attributes each method only to the package declaring its
  receiver, renders a pointer field and an enum member without an
  escape, and folds an anonymous struct onto one line with no encoded
  tab.
---
```

```yaml
---
id: project-map:DLT-017
type: Delta
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-08-04T10:58:27.069Z
    change_request: "phase G: the unclassified ratchet"
    scope: first-time-approval
partition_id: project-map
title: the command surface gains the strict flag and its verdict code
target_id: project-map:CTR-001
kind: extend
baseline_version: project-map:BL-001
compatibility_action: ignore
surface_impact:
  - id: project-map:SUR-001
    intended_version: "1.3.0"
as_is: |
  project-map:CTR-001 declares `build` with `--config`, `--out`,
  `--only`, `--json`, `--check` and `--verbose`, and exit codes 0
  through 5. A repository adopting detection has no way to accept the
  diagnostics it starts with while refusing new ones: every code the
  taxonomy carries is either about the artifact's bytes or about a
  config-time error.
to_be: |
  `build` additionally accepts `--strict`, default false, and
  `.project-map.yaml` additionally accepts
  `detect.unclassified_baseline`, a path defaulting to null whose schema
  project-map:CTR-010 fixes.
  Exit code 6 joins the taxonomy: under `--strict`, detection emitted a
  diagnostic the baseline does not list, or the baseline lists one no
  diagnostic matches. It is reachable only with the flag, so no
  invocation that exits 0 through 5 today changes.
  6 sits below 3 and 4 in precedence. Those two name a fact about the
  artifact and about the configuration, which hold whether or not a
  baseline exists; 6 names a verdict about a policy the repository set
  for itself.
  project-map:SUR-001 takes a minor bump from 1.2.0 to 1.3.0: an added
  flag and an added key, each defaulting to the prior behavior. Every
  `surface_impact` declaration on it belonging to a finalized Delta
  names 1.3.0 from here, superseding the pin project-map:DLT-011 set.
migration_note: |
  Nothing changes for an invocation that does not pass `--strict`. A
  configuration that names no baseline validates as before.
tests_old_behavior: |
  The existing obligation of project-map:CTR-001 keeps each documented
  argv yielding its documented exit code, and keeps a build without the
  flag reading no baseline.
tests_new_behavior: |
  A build with `--strict` over a fixture whose baseline covers its
  diagnostics exits 0; removing one entry exits 6; an entry matching
  nothing exits 6; and a build without the flag over the same fixture
  exits on its own terms.
---
```

```yaml
---
id: project-map:DLT-018
type: Delta
lifecycle:
  status: approved
  approval_record:
    owner_role: tech-lead
    approver_identity: cyberash
    timestamp: 2026-08-04T13:18:20.276Z
    change_request: "phase G: the enums slice"
    scope: first-time-approval
partition_id: project-map
title: a Go enum split across const blocks is reported once
target_id: project-map:GA-001
kind: replace
baseline_version: project-map:BL-001
compatibility_action: migrate
surface_impact:
  - id: project-map:SUR-002
    intended_version: "2.0.0"
as_is: |
  The Go adapter reports one entry per `const` block rather than per
  enumerated type. A repository that splits an enum across two blocks —
  a common shape where a type gains values over time — is reported
  twice, each entry carrying a fraction of the members. One validation
  service reports `models.PollingPath` twice and another reports
  `core/exceptions.ReasonCode` four times; the qualified headings of
  project-map:DLT-016 cannot tell them apart, because they name one type
  in one package and differ only in which members they happened to see.
to_be: |
  The entry is keyed on the declared type within its package, as
  project-map:BEH-015 fixes. Two blocks typing one enum report one entry
  carrying the members of both in the order the blocks appear, and a
  Python enum nested in a class is named by the chain that reaches it.
  project-map:SUR-002 takes a minor bump from 1.3.0 to 1.4.0: the
  document's structure is unchanged and only the grouping of rows a Go
  repository already had moves. Every `surface_impact` declaration on it
  belonging to a finalized Delta names 1.4.0 from here, superseding the
  pin project-map:DLT-016 set.
migration_note: |
  A consumer rebuilds once. A repository whose every Go enum lives in a
  single block and whose every Python enum sits at module level is
  unchanged. One that splits an enum sees its entries become one; one
  that nests an enum sees it gain its owner's name.
tests_old_behavior: |
  No test preserved the old grouping, because it was the defect: `as_is`
  records it. The existing obligation of project-map:CTR-003 keeps the
  section heading and the ordering of project-map:INV-002 unchanged.
tests_new_behavior: |
  A fixture splitting one typed enum across two const blocks reports one
  entry carrying every member of both; a fixture whose blocks type two
  different enums still reports two; and two Python classes each nesting
  an enum of one name report two entries named by their owners.
---
```

```yaml
---
id: project-map:DLT-019
type: Delta
lifecycle:
  status: proposed
partition_id: project-map
title: the legacy section ids are rebound to the reworked detectors
target_id: project-map:CTR-003
kind: replace
baseline_version: project-map:BL-001
compatibility_action: reject
surface_impact:
  - id: project-map:SUR-002
    intended_version: "2.0.0"
as_is: |
  `endpoints` and `interactions` render the prior extractors, which
  recognize a route and a client by the shape of a name. Consumers
  disabled both: one validation service reported nineteen real routes
  beside thirty decoys, and the other reported fifty-six clients with no
  destination on any of them. The reworked detection renders beside them
  under `inbound_endpoints` and `outbound_operations`, so a repository
  that wants it carries two sections describing one thing.
  project-map:CON-001 held the pair to the prior extractors for the
  current major of project-map:SUR-002 precisely so a consumer could
  compare the two outputs on its own sources before switching. That
  comparison has been made on both validation services.
to_be: |
  `endpoints` renders the inbound facts of project-map:CTR-006 and
  `interactions` renders its outbound operations. Both keep the heading
  they had — "HTTP endpoints" and "External dependencies" — so a reader
  and an anchor into the document still land where they did.
  `inbound_endpoints` and `outbound_operations` leave the accepted
  SectionId set; a configuration naming either is rejected as an unknown
  id and exits 5. They existed for one release, as the opt-in through
  which the comparison was made. `detection_coverage` stays: it names a
  section the prior extractors never had.
  The prior adapters are deleted with the ids that reached them.
  project-map:SUR-002 takes a major bump from 1.4.0 to 2.0.0. Two
  section ids change what they render, two are removed, and a repository
  that configures no detection loses both sections rather than seeing
  the prior output — which is the change consumers asked for, and it is
  breaking however welcome.
  Every `surface_impact` declaration on the Surface belonging to a
  finalized Delta names 2.0.0 from here, superseding the pin
  project-map:DLT-018 set.
migration_note: |
  A repository that configured `openapi` or `detect` and listed
  `inbound_endpoints` or `outbound_operations` renames the id to
  `endpoints` or `interactions`. A repository that configured neither
  sees both sections empty and should drop them from `sections` or
  configure detection; its committed document changes on the first
  rebuild either way.
  There is no silent path: an unknown id exits 5 rather than being
  ignored, so no configuration keeps validating while rendering nothing
  a reader expected.
  The reworked detection carries no built-in adapter: every fact comes
  from `openapi.serves`, `detect.inbound.routers` or
  `detect.outbound.sinks`. The prior extractors recognized aiohttp,
  FastAPI, Flask, Express, Fastify, gin, chi, echo and Spring without
  configuration, so this Delta removes endpoint reporting outright for
  TypeScript, JavaScript and Java, which have no shape to configure
  against and no built-in adapter yet. Python and Go repositories
  recover the section by declaring their router. The owner accepted this
  knowingly: the prior extractors reported decoys at a rate that had
  consumers disabling both sections, so what is removed is output no one
  relied on. Built-in adapters for the uncovered languages are named in
  §19 and are the work that closes the gap.
tests_old_behavior: |
  The obligation project-map:CON-001 carried — a legacy id rendering the
  prior output beside its reworked counterpart — is retired with the
  constraint. Its test is replaced rather than dropped: the same fixture
  now asserts that the legacy id renders the reworked output.
tests_new_behavior: |
  A fixture configuring detection and listing `endpoints` renders the
  inbound facts under "HTTP endpoints"; one listing `interactions`
  renders the outbound operations under "External dependencies"; a
  configuration naming `inbound_endpoints` exits 5; and a repository
  configuring no detection renders neither section.
---
```

---

## 16. Implementation bindings

```yaml
---
id: project-map:IMP-011
type: ImplementationBinding
lifecycle:
  status: proposed
partition_id: project-map
target_ids:
  - project-map:BEH-012
  - project-map:BEH-013
  - project-map:BEH-014
  - project-map:CTR-010
  - project-map:DLT-014
  - project-map:DLT-017
binding:
  shared_library: src/features/detect/outbound/library.ts
  client_registry: src/features/detect/outbound/registry.ts
  diagnostics: src/features/detect/merge/diagnostics.ts
  coverage: src/features/detect/merge/coverage.ts
  ratchet: src/features/detect/merge/ratchet.ts
  baseline_reader: src/cli/unclassified-baseline.ts
  command_surface: src/cli/commands.ts
  sink_boundary: src/features/detect/outbound/sinks.ts
  transport_halves: src/features/detect/outbound/transports.ts
  hierarchy_index: src/features/detect/index/python/hierarchy.ts
  declaration_index: src/features/detect/index/python/declarations.ts
  python_adapter: src/features/detect/outbound/python.ts
  outbound_ladder: src/features/detect/outbound/ladder.ts
  router_scope: src/features/detect/inbound/go/router-scope.ts
  chi_adapter: src/features/detect/inbound/go/chi.ts
  config_schema: src/infrastructure/config/schema.ts
  config_resolution: src/infrastructure/config/loader.ts
  use_case: src/features/detect/detect.use-case.ts
authority: code_annotation
verification_method: |
  tests/integration/python-shared-library.test.ts drives the real command
  tree over two fixtures, a library that publishes a declared type and a
  consumer that reaches it through a declared container. It covers both
  halves of the join key, a target the consumer declares locally against
  one living only in the library, a statically resolved member against a
  dynamically selected one, a type carrying no module identity, and the
  anchor each half gives the callee it names.
  tests/integration/detection-coverage.test.ts drives the candidate
  universe and the denominators: one callee reached from three anchors,
  a member the sink subclass itself declares, the serving half of a
  transport package, an inventory present against absent, and a half
  deferred to the linker held out of the denominator.
  tests/integration/go-chi-routes.test.ts covers the router half of the
  universe: a member call on a proven router that names no route, merged
  across two anchors, against a receiver that is not a router.
  tests/integration/strict-ratchet.test.ts drives the verdict: a
  baseline covering every core, one covering all but one, one carrying
  an entry nothing matches, none configured at all, a file that will not
  parse, and the artifact compared across two baselines that differ in
  content.
---
```
