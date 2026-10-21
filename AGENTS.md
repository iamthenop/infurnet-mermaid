# AGENTS.md

This repository develops independently maintained extensions, customizations, and plugins for Mermaid.

The repository uses `infurnet-skills` for agent governance. Human intent governs the work. Agents document, implement, and validate that intent within their assigned authority.

## Authority

The repository owner is the deciding authority for architecture, scope, interfaces, dependencies, and releases.

Agents must not infer authority from repository access, available tools, existing code, or apparent defects.

Repository governance, approved design documents, and accepted workorders define the authorized work. Conflicts and missing decisions must be reported rather than resolved by agent judgment.

An agent must not treat its own proposed changes as authority for further changes.

## Agent profiles

Every agent session has exactly one assigned profile. The assignment is fixed for the session and must not be inferred from task wording or changed during execution.

The default profile for general project design sessions is `designer`.

| Profile | Responsibility |
| --- | --- |
| `designer` | Documents intent, boundaries, contracts, and approved decisions |
| `builder` | Implements approved work under a bounded workorder |
| `tester` | Validates intended behavior and reports evidence |
| `operator` | Reserved for future deployment and runtime operations |

Builder and Tester sessions require an explicit profile assignment before execution. Operator has no active authority until its profile is adopted and assigned.

The authority chain is:

**Human owns intent. Designer documents intent. Builder implements intent. Tester validates intent.**

No profile may assume another profile's responsibilities.

## Installed skills

Infurnet Skills are adopted through `.agents/adoption.yml` at an immutable source revision.

Installed skills live under `.agents/skills/`.

The installer owns its marked section of this document. Agents must not modify that section outside an authorized installation operation.

Read the assigned profile before accepting work. Load only the deliverables and standards applicable under the adopted skill-loading contract.

Project-specific binding values belong in `PROJECT.md`. Do not duplicate those values in skill instructions or other governance text.

Installation, discovery, and availability of a skill do not grant authority to use it.

## Repository boundaries

`infurnet-mermaid` is a multi-package repository.

Each package owns a distinct extension or customization. Packages may share code only through explicit, approved interfaces.

Package ownership and repository paths are declared in `PROJECT.md`.

### Mermaid integration

Extensions integrate through supported Mermaid APIs.

Do not modify or fork Mermaid core unless explicitly authorized.

An extension's grammar, semantic model, renderer, and public registration contract belong to that extension.

Do not introduce a shared framework solely because multiple packages might eventually need one.

### Circuit diagrams

`mermaid-circuit` owns the external Mermaid diagram type `circuitDiagram`.

Its scope includes analog, transistor-level, gate-level digital, and mixed-signal circuit schematics.

The electrical connectivity model is shared across these representations. Symbol families and layout strategies remain separate concerns.

The package's established contracts are:

| Surface | Responsibility |
| --- | --- |
| `spec/notation.md` | Circuit notation and permitted syntax |
| `spec/style.md` | Drawing conventions, placement, and geometry |
| `src/` | Implemented parser, circuit model, layout, and rendering behavior |
| `shapes/` | SVG symbols and associated shape metadata |
| `tests/` | Verification of implemented behavior |

The specifications state approved intent. Source code establishes observed behavior. A difference between them is a finding, not permission to redefine either.

#### Electrical and visual boundaries

Circuit connectivity is defined by devices, nets, and named terminals.

The renderer consumes that connectivity and produces a visual representation. Rendering must not redefine electrical connections.

Placement coordinates, SVG shapes, labels, and wire routes do not establish electrical connectivity.

The notation and drawing specifications remain separate. A change to rendering must not silently change notation or the circuit model.

Do not introduce additional device types, terminal conventions, notation features, or layout policies without an approved design change.

## Design discipline

Design documents record decisions. They do not make decisions.

Each normative rule has one authoritative location. Other documents reference that location instead of restating the rule.

Keep design changes separate from implementation changes wherever possible.

An unresolved design question belongs in the issue or review record until the deciding authority resolves it.

Documentation must distinguish:

- Approved design.
- Verified implementation.
- Proposed changes.
- Known limitations.

Do not describe proposed or incomplete functionality as implemented.

## Change discipline

Repository changes require bounded authority.

Builder work must follow an approved workorder that identifies its scope, allowed files, dependencies, validation, and authorized mutations.

Work proceeds on a branch and is submitted through a pull request.

A pull request must identify its scope, changed surfaces, and validation evidence.

Do not:

- Expand scope to address unrelated findings.
- Refactor code during a migration without authorization.
- Change established public contracts silently.
- Introduce dependencies outside an approved grant.
- Modify specifications to make failing implementation appear compliant.
- Weaken validation to obtain passing results.
- Merge or publish without explicit human authorization.

A migration must preserve existing behavior unless a separate approved change authorizes a difference.

## Validation

Validation must address the behavior changed by the work.

Use the package's established build, lint, and test tooling. Do not replace tooling merely to standardize the repository.

For circuit-related changes, distinguish:

1. Notation parsing and validation.
2. Electrical connectivity.
3. Device and terminal definitions.
4. Layout and geometric placement.
5. SVG generation and visual output.
6. Mermaid integration.

Passing one category does not establish correctness in another.

Keep existing reference fixtures, including the NAND2 circuit, available for regression validation.

Report existing failures separately from failures introduced by the change.

## Stop conditions

Stop and report when:

- The assigned profile is missing or conflicts with the requested work.
- An accepted workorder is required but unavailable.
- A governing document or installed skill is missing.
- A required project binding is undecided.
- Two authoritative sources conflict.
- A public contract requires an unapproved change.
- Work crosses a package or repository boundary without authorization.
- A dependency or mutation is not explicitly permitted.
- Completion requires interpreting or inventing design intent.

Preserve authorized partial work and report the blocking condition.

Do not infer permission to continue.

## Final rule

Human intent remains authoritative.

Every implementation must be traceable to approved intent, and every validation claim must be supported by evidence.

<!-- BEGIN infurnet-skills -->
## Installed skills

Project-specific bindings used by installed skills are declared in root
`PROJECT.md`.

A consuming session loads skills in one authority-preserving order:

1. the profile assigned by repository governance;
2. a deliverable permitted by that profile, when the accepted work requires a
   library-defined deliverable;
3. the standards applicable to the accepted work.

Accepted work may use native model capability without loading a deliverable.
A deliverable must not be invented or loaded solely to introduce applicable
standards.

Applicable standards may come from:

* standards required by the assigned profile;
* standards required by a selected deliverable;
* standards explicitly required by the accepted commission, workorder, or
  consuming-repository governance.

Standards must not be inferred from file paths, directory names, surfaces,
available tools, or agent judgment.

An agent loads exactly one profile during a session. The assignment is
immutable for that session. Task wording, native description triggering,
available skills, and agent judgment cannot select a profile; a second profile
cannot supplement, compare with, or replace the assignment.

If the user asks to switch profiles, refuse the switch and instruct the user to
start a new session with the desired profile assigned. Do not continue under the
new profile in the current session.

The assigned profile defines which deliverables the agent is permitted to
produce or review. A request outside that set is a stop condition, not a reason
to change profiles. Deliverables and standards constrain authorized work but
cannot expand authority, authorize another deliverable, alter scope, or change
the assigned profile.

Native description triggering may discover an applicable deliverable or standard
after profile assignment. It must never select, load, or switch a profile, and
must not determine which standards govern accepted work.
<!-- END infurnet-skills -->
