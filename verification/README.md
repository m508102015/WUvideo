# KVideo strict verification

There is one complete validation entry point. Run it from the repository root:

```sh
./verification/run
```

The runner installs its pinned tools inside this directory, builds and starts
KVideo locally, exercises APIs and UI, and writes evidence under
`verification/artifacts/<run-id>/`. It does not edit application source.
The Docker stage creates a temporary sanitized context below
`verification/cache/`, excludes this verification tree and generated build
state, and removes that context after use. Root Docker configuration is not
modified by the verifier.

Primary outputs:

- `report.html`: browsable report with every finding and evidence link.
- `summary.md`: compact human-readable result and coverage gaps.
- `summary.json`: machine-readable run metadata and totals.
- `findings.json`: every pass, failure, warning, skip, and explanation.
- `junit.xml`: CI-compatible result file.
- `events.ndjson`: chronological structured event log.
- `run.log`: chronological plain-text log.
- `raw/`: complete command output and remote response evidence.
- `screenshots/`: viewport, action, and visual-difference images.
- `traces/`: browser traces for failed flows.

Test layout:

- `tests/regression/`: executable project regressions, including direct
  `GH-ISSUE` and `GH-PR` trace tags.
- `tests/harness/`: tests for the verification framework itself; these prove
  logging, redaction, history normalization, and policy enforcement work.
- `src/run-regression.mjs`: uses the verifier's pinned esbuild to bundle each
  TypeScript regression as isolated CommonJS, runs every bundle with Node's
  test runner, and removes normal temporary output. Coverage mode retains its
  bundle beside the coverage evidence so source-map remapping is auditable.

The regression subset is an internal stage, not a second validation command.
Only `./verification/run` executes the whole chain: harness self-tests, local
Issue/pull-request contracts, source policy, static analysis,
100% application coverage enforcement, verifier dependency/audit checks,
Android lint/tests/APK build, production builds, Docker, runtime APIs, proxies,
latency, UI actions, video, performance, visual comparison, and deployment
consistency.

Normal verification does not query GitHub. Known Issue and pull-request
requirements are stored in `history/catalog.json`, review contracts are stored
beside it, and executable `GH-ISSUE` / `GH-PR` tags point to local regression
tests or checks invoked by the runner. The harness fails when evidence is
missing, dead, unknown, or outside the one executable verification graph.
`history/pr-evidence-template.md` contains the self-owned pull-request fields;
the verifier does not require edits to the repository's `.github/` templates.

Remote history maintenance is explicit rather than a runtime dependency. Run
`./verification/run --audit-github` only when intentionally auditing new or
edited GitHub records. That mode paginates Issues, pull requests, comments,
reviews, and threads and compares them with `history/baseline.json`.

Useful options:

```sh
./verification/run --quick
./verification/run --offline
./verification/run --audit-github
./verification/run --candidate
./verification/run --reference-url https://kvideo.pages.dev
./verification/run --keep-server
./verification/run --max-actions 10000 --max-action-depth 10
```

`--candidate` is used by pre-merge/push CI. It runs the full candidate checks
but explicitly skips only the post-publication convergence check, because an
unpublished commit cannot already equal GitHub main, Cloudflare, and Docker.
After release, run the default command without this flag; public consistency is
then mandatory.

Full mode explores up to 5,000 control-state operations per route and eight
same-route transitions. Every admitted state's controls are executed. New URL
locations and new bounded control signatures enter the recursive frontier;
independent combinations made entirely from already-covered signatures are
recorded as subsumed instead of being expanded into a Cartesian product. The
triggering interaction, resulting state, reason, and subsumption decision stay
in `raw/ui-actions.json`. Within that frontier, the same location and exact
control key/state execute once; later identical instances are retained as
explicit deduplicated entries. Repeated controls preserve the distinction
between one instance and two-or-more instances. Sort order changes are proved
but permutations do not recursively create a factorial frontier. Changed
checked, expanded, pressed, value, and disabled states are separate signatures.
A successful action must
prove an observable DOM, state, storage, URL, media, network, dialog, download,
popup, or clipboard effect. Reaching either limit is a coverage failure, never
a pass.

Browser page, visual, video, and throttled performance checks cover mobile,
tablet, desktop, and TV viewports. Visual parity requires matching visible
semantic structure and no more than 2% changed pixels. Video checks exercise
MP4, HLS, stall detection, decoded dimensions, playback advance, and dropped
frames. Performance cases use 4x CPU throttling and enforce frame, long-task,
runtime-error, LCP, and CLS budgets.

Default mode is deliberately strict. Existing source files over 150 lines,
lint/type/build failures, uncaught browser errors, severe accessibility
violations, API contract failures, deployment drift, and threshold breaches
produce a non-zero exit code. Generated reports and third-party files are not
source code and are excluded from the 150-line source policy.

The suite cannot prove the absence of every defect. It reports exactly what it
enumerated, what it executed, what it skipped, and why. A green result means all
declared checks passed, not that arbitrary undiscovered states are impossible.
