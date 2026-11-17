---
name: ship-landing
description: Load before framing a PR or MR delivery, when an MDD packet returns a candidate, when a ship reports a PR or ready branch, when deciding or monitoring landing, and before task cleanup.
user-invocable: false
metadata:
  internal: true
---

# Ship landing

## Prepare a reviewable delivery

A delivery is useful to review when its result, dependencies, evidence and risks can be understood together. Examine the proposed set of PRs before its first publication, then reassess unexpected growth, regrouping and changed dependencies. Use the existing brief and project conventions; MDD is optional.

For each PR, identify its result, exclusions, declared base and the distinct decision a reviewer can make. Compare keeping the work together with separating it. Keep the contract, interface and tests needed for the same behavior or invariant together. Separate a capability that has useful acceptance criteria of its own; a technical prerequisite can qualify when its risk and validation justify a distinct review. Counts of PRs, files or lines prompt examination and never decide it. Review the whole set for fragmented journeys, repeated changes and artificial dependencies.

Examine alignment with the request, impact, verification, rollback and error detection using actual changes and the project's existing reviews. Explain material risk and missing evidence individually; do not average away a destructive rollback or missing verification. These observations do not authorize extra scope, reviewers, pipelines or publication. Apply changelog and issue conventions only when the project requires them.

Before requesting final independent review, run the control owner's candidate delivery check on all proposed content, including untracked files. Correct mechanical failures first; this grants no acceptance or publication authority. Keep the final committed delivery check and examine later additions before readiness.

Retain one canonical observation with its command or protocol, content identity, outcome and limits. Reference unchanged evidence instead of copying dependency exports, sources or reports into every packet. Distinguish separate executions without routinely publishing full logs. Retain necessary original text output reversibly in JSON string fields, referenced from a readable summary; do not normalize historical archives or add per-mission whitespace exceptions. A hash cannot recover an uncommitted RED state: retain its actual source/test change and failing assertion when no existing revision preserves them.

Use the project's PR template and lead with the result. Choose the smallest explanation that makes the change understandable: pseudocode for a rule, a call tree for execution order, a component or file tree for responsibilities, a diagram for interactions, or observed media for a user journey. Retain relevant ownership and state boundaries; omit redundant illustrations. Use pr-demonstration when independently enabled and preserve its section and the surrounding PR content.

For tasks requiring a recorded delivery examination, ask the worker for its complete preparation report and supporting evidence through the existing status channel. Examine it as coordinator before recording the verdict through fm-control's delivery-review operation. Its CLI header owns the format. Report a correction to the worker through the existing steering path; request the user only for a substantive unresolved decision. A receipt records this examination, not independent acceptance or permission to publish. Read the published PR again after publication and after regrouping so its title, explanation, demonstration and limits describe that exact delivery.


When the task has a demonstration obligation or this home requires one, use `fm-control`'s demonstration operation to record its complete return, existing review and whole-presentation examination before delivery; its input contract is owned by `bin/fm-demonstration-lib.mjs --help`.

For a task bound to MDD, first load the frozen external skill referenced by its assignment. Record the complete terminal report through the control owner, examine the packet under MDD and prepare the next authorized packet in the same task. Do not ask for a routine new approval. A dedicated review uses a stopped implementer and a fresh reviewer; choose a changed authorized profile through the control owner's relaunch operation, preserving the frozen handoff. Legacy assignments keep their private transport report; portable assignments use their assigned canonical report without a second identical copy. Apply the delivery procedure below only after final independent acceptance and a current delivery grant. A candidate-return refusal from the completion owner is a coordinator examination step, never a reason to start a pipeline or ask the worker to publish.

Before presenting a ship as ready, run `fm-control <id> delivery-check --stage ready` and the project-required checks with immediate failure propagation. Use `--stage draft` for an authorized early draft and disclose its failed or unavailable checks; a draft is not a readiness signal. For an open v0.6 MDD PR mission, record and check its separately scoped `draft-delivery` authority before publishing an early draft; the ordinary delivery authority still requires final acceptance. MDD and demonstration apply only when independently enabled for the task.

For PR-based ship tasks, the ready signal depends on mode: `no-mistakes` reports `done [at=<epoch>]: PR <url> checks green` after CI is green, while `direct-PR` reports `done [at=<epoch>]: PR <url>` after opening the PR, each only for a non-draft PR; a lane that deliberately holds a draft declares a wait instead, and `bin/fm-pr-check.sh` refuses to arm merge monitoring on a draft.
Run `bin/fm-pr-check.sh <id> <PR url>` with the URL copied from that ready signal or the resolved checks-green `fm-crew-state.sh` line - it records `pr=` and the forge's `pr_head=` when available in the task's meta and arms the watcher's merge poll, which also wakes the supervisor if the ready PR/MR later degrades (failing check, failed head pipeline, merge-train drop) so the worker can be steered to fix it.
With `config/pr-register-scan` present, the watcher can record ready task PRs during its check sweep, including replacing a named PR; see [`docs/configuration.md`](../../../docs/configuration.md#pr-registration-scan-configpr-register-scan) for the full rule. Handle a `check: pr-register:` notification as you would the same result from a manual run.
`bin/fm-dod-lib.sh` owns the named-head gate on that ready signal: a ship `done:` whose named head exists only in the worker's disposable copy is not ready (`bin/fm-crew-state.sh` reports blocked, `bin/fm-pr-check.sh` refuses to register, and a secondmate does not publish that done upstream).
Of those readers only `bin/fm-pr-check.sh` fetches the copy's remotes before it decides, and a no-mistakes pipeline pushes from its own clone, so a no-mistakes ready signal can read blocked until that registration has run: register it before steering.
A refusal that says it could not refresh a remote decided on the last-known refs, so retry it once that remote is reachable.
Otherwise that blocked reading is the gate working, not a stuck worker, so steer the worker on the commit the refusal names rather than waiting.
A `forge=external` task reports `done [at=<epoch>]: review <url> uploaded for review` instead: run `bin/fm-review-check.sh <id> <review url>` rather than `bin/fm-pr-check.sh`, which arms no merge watch, then always escalate the review URL to the captain whatever the yolo setting, because firstmate can neither observe nor perform its approval or merge.
A direct-PR worker pushes that commit to its PR branch, and a local-only worker commits it on its ship branch.
When another No-Mistakes run is explicitly authorized, its worker follows `validation-supervision`; it never infers run permission from a named-head refusal.
An implementation return never authorizes a pipeline. For MDD tasks, the completion owner treats every packet return as a candidate until the recorded final independent acceptance and separate delivery authorization are current. Apply the external skill for packet examination, correction and final validation before returning to this delivery procedure.
Tell the captain the PR's full `https://...` URL copied from the worker's ready line, the resolved checks-green crew-state line, or the task's `pr=` metadata, a concise outcome summary, and the no-mistakes risk level when applicable.
A captain instruction to merge is explicit authority; `yolo` is the only standing routine merge authority.
For any custom `state/<id>.check.sh` you write yourself, keep it an ordinary single-link mode-`0700` file, print one line only when firstmate should wake, print nothing otherwise, finish before `FM_CHECK_TIMEOUT`, then bind its current bytes with `bin/fm-check-register.sh <id>` before the watcher may execute it.
Retire a custom check only through `bin/fm-check-unregister.sh <id>` (or `bin/fm-teardown.sh` for a spawned task); never hand-compose an `rm` with `$STATE`/`$ID`.

For a delivery-aware MDD task, follow the frozen delivery lifecycle on parent updates and merge wakes: reconcile authorized descendants in dependency order through `fm-control <id> reconcile-delivery`, renew affected evidence, and close an integrated mission through `fm-control <id> close-mission` before cleanup. Stop on missing authority, conflicts or stale evidence. The [fork design](../../../docs/design/fork-mdd.md#livraisons-et-pr-empilées) owns these command effects and qualification limits.

The watcher owns teardown of a merged lane whose merge poll is armed, including a PR merged through `bin/fm-pr-merge.sh`, when the lane is parked or its home has `config/auto-land` ([`docs/configuration.md`](../../../docs/configuration.md#park-on-review)). Otherwise, firstmate tears it down after landing is confirmed.
A lane parked on review (`bin/fm-park.sh`) has no agent and relaunches itself on review activity; `bin/fm-park.sh park <id>` parks one clean lane on request and `bin/fm-park.sh resume <id> --trigger <text>` relaunches one by hand.

Tear down any other ship task only after landing is confirmed.
A teardown refusal for uncommitted or unlanded work is a stop-and-investigate result, never an obstacle to bypass.
Never force teardown without explicit discard authority.
After successful teardown, record completion, retain only the configured recent Done history, and re-evaluate queued work whose blockers and time gates have cleared.

A secondmate is persistent and an empty queue is healthy.
Retire one only on an explicit captain or main-firstmate decision, after loading `secondmate-provisioning`; its home must contain no work under way, and forced discard still requires explicit captain authority.
