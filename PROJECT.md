# PROJECT.md — repository bindings

<!-- Copy this template to the consuming repository root as PROJECT.md.
Keep the preamble, remove uninstalled-skill sections, and replace or retain
each *not yet defined* value. -->

This file is the single home for repository-specific facts referenced
by the installed skills. Skills state form and conduct; this file binds
them to one repository. A skill or document that restates a binding is
defective; it references this file.

This file sits at the repository root and is mutable by design.
Bindings are decided facts, not proposals; they change only under the
authority the consuming repository's governance assigns. An unfilled
binding is stated plainly as *not yet defined*; agents stop rather than
infer it.

## Identity

| Binding | Value |
| :--- | :--- |
| Project name | *not yet defined* |

## Build authority

<!-- Applies when `bazel-discipline` is installed. -->

| Binding | Value |
| :--- | :--- |
| Build system | *not yet defined* (e.g. Bazel) |
| Dependency declaration | *not yet defined* (e.g. MODULE.bazel and per-module BUILD.bazel) |
| Linter | *not yet defined* (e.g. ruff, pylint, checkstyle) |

## Workspaces and package ownership

| Package or directory | Ownership |
| :--- | :--- |
| *not yet defined* | *not yet defined* |

## Import boundaries

*Not yet defined.* (Form: one line per module naming its permitted
project imports.)

## Heavy-dependency isolation

<!-- Applies when `python-standard` is installed. -->

| Binding | Value |
| :--- | :--- |
| Approved compute module | *not yet defined* |
| Permitted heavy imports | *not yet defined* (e.g. torch, cv2, onnxruntime) |

## Databases

<!-- Applies when `schema-design` is installed. -->

| Binding | Value |
| :--- | :--- |
| Database directories | *not yet defined* (e.g. db/<database>/init/) |
| Schema test directories | *not yet defined* (per database) |
| Foundational threshold | *not yet defined* (stratum number only; change authority comes from the accepted work and repository governance) |
| Strata in force | *not yet defined* (per database; stratum classes are defined in `schema-design`) |

## Deployment

<!-- Applies when `deploy-standard` is installed. -->

| Binding | Value |
| :--- | :--- |
| Environments | *not yet defined* (e.g. DEV, SIT, UAT, PRD) |
| Release architecture set | *not yet defined* |
| Registry naming contract | *not yet defined* |
| Local tag vocabulary home | *not yet defined* |

## Web

<!-- Applies when `web-standard` is installed. -->

| Binding | Value |
| :--- | :--- |
| Web module | *not yet defined* |
| Approved palette | *not yet defined* (tokens live only in the tokens stylesheet) |
| Approved logo asset | *not yet defined* |

## Workflow

<!-- Applies when `workflow-modeling` is installed. -->

| Binding | Value |
| :--- | :--- |
| Gate keys | *not yet defined* |
| Work-type namespace | *not yet defined* (form: gate.media.task.vN; may be bound with zero registrations) |

## Tickets

| Binding | Value |
| :--- | :--- |
| Reference format | *not yet defined* (e.g. TICKET-123) |

## API

<!-- Applies when `api-docs` is installed. -->

| Binding | Value |
| :--- | :--- |
| Route version prefix | *not yet defined* (form: /<version>/<system>/) |
| Surfaces | *not yet defined* |
| Cross-cutting transport headers | *not yet defined* |
| Vocabulary authority | *not yet defined* (canonical glossary location) |

## Lisp

<!-- Applies when `lisp-standard` is installed. -->

| Binding | Value |
| :--- | :--- |
| Lisp dialect | *not yet defined* |
| Lisp implementation | *not yet defined* |
| Language version or standard | *not yet defined* |
| Canonical syntax | `prefix-lisp` unless explicitly overridden |
| Namespace mechanism | *not yet defined* |
| Approved implementation extensions | *not yet defined* |
| Formatter | *not yet defined* |
| Compiler or interpreter | *not yet defined* |
| Linter | *not yet defined* |
| Test runner | *not yet defined* |

## Placement reference

| Work item | Home |
| :--- | :--- |
| System architecture and boundaries | *not yet defined* (e.g. docs/arch/) |
