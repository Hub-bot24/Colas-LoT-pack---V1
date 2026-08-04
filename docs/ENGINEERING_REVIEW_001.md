# Engineering Review 001 — Colas Lot Pack Application Architecture

*Review only. No production code was modified to produce this report.*

---

## 1. Overall Architecture Score: 3.5 / 10

This scores the *architecture* — maintainability, separation of concerns, testability, safety-under-change — not whether the app works. Functionally, it works well in the field (that's a real achievement given the constraints). Structurally, it has accumulated years of "just add another patch block" development with no refactor discipline, no tests, and no build tooling, which is why the score is low despite the product being genuinely useful and reasonably reliable in production.

| Dimension | Notes |
|---|---|
| Functionality / field reliability | Strong |
| Separation of concerns (offline, cloud, print) | Weak-to-moderate |
| Testability | Effectively none |
| Change safety | Low — see Section 8 |
| Dependency hygiene | Minimal deps is a plus, but zero tooling is also a minus |
| Documentation | Was zero before this week; now has a baseline (the `protect-pdf-redraw` docs) |

---

## 2. Biggest Strengths

1. **Offline durability engineering is genuinely good.** `offline-core.js` implements IndexedDB drafts + a locked submission queue, exponential backoff retry, background sync registration, persistent-storage requests, and manual backup export/import. This is exactly the right design for a field crew that loses signal — better than most production apps of this size.
2. **Idempotent, secure backend design.** `supabase-setup.sql` uses row-level security scoped to `auth.uid() = user_id`, an `upsert` keyed on `client_submission_id` for dedupe, and a status-gated update policy. This is competent, defensive SQL for a system that must tolerate retried submissions.
3. **Zero build tooling, zero runtime dependencies (bar one CDN script).** The whole app is `index.html` + a few plain JS files. It is trivially deployable to static hosting (GitHub Pages) and has no toolchain to break, no `npm install` to rot, no bundler config to maintain.
4. **Config/secret hygiene is correct.** `app-config.js` only holds a Supabase *publishable* key; no privileged secrets are in the client bundle.
5. **The non-print parts of the app are properly modularized.** `offline-core.js`, `cloud-core.js`, and `service-worker.js` are each single-purpose, self-contained IIFEs with a clear public surface (`window.LotPackCloud`, `window.saveDraft`, etc.). The architectural rot is concentrated almost entirely in `index.html`'s print system, not spread evenly across the codebase.
6. **The team has clearly prioritized "never lose a completed field lot pack" over code cleanliness** — a defensible trade-off for a compliance-critical construction QA tool, and evidence the underlying engineering judgment is sound even where the code isn't.

---

## 3. Biggest Weaknesses

1. **`index.html` is a 5,776-line monolith** containing markup, ~28 `<style>` blocks, and ~24 `<script>` blocks, mixing the editable form, the print templates, and the sync logic that binds them — with no module boundaries.
2. **No automated tests of any kind.** No unit tests for the calculations, no integration tests for the sync functions, no visual regression tests for print output. Verification is entirely manual (which is why Engineering Review 001's predecessor task had to build a manual checklist from scratch).
3. **"Patch by appending a new versioned block" is the dominant development pattern**, rather than editing existing code. 63 distinct version-tagged blocks (`v19`…`V123`) exist in `index.html` alone, most never consolidated into what they replaced.
4. **1,263 occurrences of `!important`** in `index.html`'s CSS — a strong signal of specificity wars between successive style patches rather than a coherent stylesheet.
5. **The "last definition wins" override pattern is the architecture**, not an accident. Multiple critical functions (`previewPrint`, `generateLotPack`, `calcAvg`, `syncPrintBall`, etc.) are declared more than once in the same scope, and correctness depends entirely on script load order. This is invisible in code review and only shows up as a runtime behavior.
6. **No environment separation.** Production Supabase URL/key are committed directly and there's no visible dev/staging config split.
7. **Possible functional/architectural gap in the backend RLS design**: policies scope every `select`/`update` to `auth.uid() = user_id`. As written, a worker can only ever see their *own* submissions — there's no visible policy or role granting office/QA staff read access to all lot packs. Either this is handled outside the repo (Supabase dashboard, a service-role process) or there's a real gap in the "office receives the lot pack" workflow. Worth a direct check with whoever owns the Supabase project.

---

## 4. Technical Debt

- **63 versioned patch blocks** (`v19`, `v26`, `v33`–`v40`, `V46`–`V123`) layered into one file instead of edited in place.
- **Dead/no-op guarded calls**: `syncQaConfirmPrint` and `syncPrintDiagrams` are called via `typeof X === 'function'` guards in 6 places but are never defined anywhere — permanent silent no-ops.
- **Superseded-but-still-loaded code**: the `V103` `generateLotPack`/`syncAllBeforeOutput` definitions are functionally replaced by `V113`'s versions, but `V103`'s `beforeprint` listener registration is still load-bearing (see Section 8) — it can't be deleted without first replicating what it does.
- **Orphaned file**: `site-diagram-print.html` — a full standalone duplicate of the site-diagram print page, unreferenced by any live code path, only kept alive by `service-worker.js`'s cache manifest.
- **5 separate, conflicting `@page` declarations** across `app-config.js` and `index.html`; only the last one in document order is authoritative.
- **No linting or formatting configuration** — style varies block-to-block (`var` vs `let`/`const`, inconsistent IIFE wrapping, inconsistent quoting).
- **No CHANGELOG beyond commit messages and the informal `V###` naming baked into IDs** — versioning is done by grepping code, not by any doc.

---

## 5. Code Duplication

| Category | Instances |
|---|---|
| Functions redeclared in the same scope (later silently wins) | `calcAvg`, `updateWarning`, `syncPrintBall`, `calcCanvas`, `calcLoose`, `syncPrintCanvas`, `syncPrintLoose`, `setText` (global) |
| `window.*` handlers reassigned by later scripts | `previewPrint` (4 assignments), `generateLotPack` (2 assignments), `saveDraft` (overridden by `offline-core.js`) |
| Independent implementations of the same concept | North-arrow rotation lookup table (×2: `updateNorthArrowCompassFixed`, `forceNorthArrow`); diagram-into-print copy (×5 functions); signature-canvas drawing setup (×4 functions, each with its own dataset-flag guard) |
| Repeated/conflicting CSS declarations | `@page` size/margin declared 5×; print card/table styling re-declared and `!important`-overridden across `V113`, `V116`–`V120` |
| Duplicated print page markup | Two sets of similarly-titled sections ("Lot Conformance Report", "Surfacing Checklist", "Ball Penetration Test", "Site Memo", "Final Review / Sign Off") — one is the print-only `.print-report` block, the other is the live on-screen `.page` tabs — structurally distinct but visually/semantically overlapping enough to confuse a reader |
| Duplicate sync-field lists | `previewPrint()`, `generateLotPack()`, and `emailReport()` each maintain their own independent list of "which sync functions to call before output," with no shared source of truth |

---

## 6. Files That Should Eventually Be Split

Primarily `index.html` needs decomposition. Suggested seams (content, not code, being proposed):

- **Print templates** — the `.print-report` block and each `.v113-print-only` card → one file per printed section (cover, checklist, canvas mat, ball pen, site diagram, memos, sign-off).
- **Print CSS** — all ~28 `<style>` blocks with `@media print` rules → one consolidated print stylesheet, single `@page` rule.
- **Form section markup** — each `.page` tab (`#lot`, `#site`, `#qvc`, `#mix`, `#pen`, `#canvas`, `#memo`, `#sign`) → its own template/partial.
- **The form → print "sync" layer** — currently ~20 scattered functions → one explicit data-binding module.
- **Diagram capture/crop/clean pipeline** (the canvas image-processing IIFE, ~50 lines of pixel math) → its own module; it's self-contained and easiest to extract safely.
- **Signature capture** — the 4 overlapping canvas-drawing implementations → one signature-pad module.
- **Static reference data** — the `qvcItems` array (32 hardcoded QVC rows) → its own data file, separate from behavior.
- **Lot-number generation** — `updateLotNo`/`safeUpdateLotNo`/`safeLotNumber` (3 near-identical implementations) → one utility.

`offline-core.js` and `cloud-core.js` are reasonably sized and cohesive; they don't need splitting, only light cleanup (e.g., `ensureUi`'s injected CSS strings could move to a stylesheet).

---

## 7. Functions That Should Never Be Touched Without Regression Testing

These are the functions where a "safe-looking" edit has the highest chance of silently changing production output, per the baseline investigation:

- `previewPrint` (active definition, `index.html:4874`) and the three superseded definitions it shadows
- `generateLotPack` (active definition, `index.html:4894`) — depends on inherited `beforeprint` listeners it doesn't itself call
- `emailReport` (`index.html:3148`) — independent code path from the above two
- `syncV113` (`index.html:4842`) — current signature/memo/sign-off sync
- `syncPrintDiagramV101` / `fillV33SiteDiagramPrintPage` — diagram-into-print pipeline
- `calcAvg`, `calcCanvas`, `calcLoose` (active/second definitions) — the only compliance-relevant calculations in the app (ball penetration pass/fail threshold, spread rate)
- `updateLotNo` / `safeUpdateLotNo` / `safeLotNumber` — the generated Lot Number is a compliance identifier referenced across every page
- `repairSignatureBlock` — defensive re-fix run on every `beforeprint`
- **The set of 8 `window.addEventListener('beforeprint', …)` registrations as a group** — not individually removable without checking what the whole group collectively guarantees
- `offline-core.js`: `submitHandler`, `queueSubmission`, `syncPending` — the durability guarantees depend on this exact sequencing
- `cloud-core.js`: `uploadSubmission` — the upsert/idempotency contract with the SQL schema

---

## 8. Risks to the PDF Redraw System

(Full detail in `docs/PDF_REDRAW_BASELINE.md`; summarized here for the review.)

1. **`beforeprint` fan-out is load-bearing** — 8 independent listeners, registered by 8 different historical patches, collectively produce correct output; none can be safely assumed dead.
2. **Print and Email are separately-maintained code paths** that have already drifted out of sync twice in this repo's history (see commits `5beddf9`, `002db8f`).
3. **`generateLotPack`'s current definition is thinner than its predecessor** and only works because a "superseded" script block is still registered on `beforeprint`.
4. **Orphaned `site-diagram-print.html`** creates ambiguity about which file is authoritative for diagram printing, while still being cached by the service worker.
5. **5 conflicting `@page` declarations** — deleting the wrong `<style>` block silently changes page margins app-wide.
6. **Two permanently-dead guarded function references** (`syncQaConfirmPrint`, `syncPrintDiagrams`) that look actionable but aren't.
7. **PDF output is entirely dependent on the invoking browser's native print engine** — no deterministic, testable renderer exists, so "does the output match" can only ever be a manual/visual check (or a browser-automated screenshot diff, which doesn't currently exist).
8. **Structurally duplicated print-page markup** (print-only `.print-report` vs. the on-screen `.page` tabs sharing section titles) increases the chance a refactor edits the wrong copy.

---

## 9. Proposed Version 2 Folder Structure

This is a target shape for a phased migration — **not** something to execute now.

```
/
├── index.html                  # thin shell: mounts app, loads bundle
├── manifest.webmanifest
├── service-worker.js
├── version.txt
│
├── src/
│   ├── main.js                 # app bootstrap
│   │
│   ├── features/                # one folder per form tab
│   │   ├── lot-cover/
│   │   ├── qvc-checklist/
│   │   ├── aggregate-bitumen/
│   │   ├── canvas-mat/
│   │   ├── ball-penetration/
│   │   ├── site-diagram/
│   │   ├── signatures/
│   │   └── sign-off/
│   │
│   ├── print/
│   │   ├── templates/           # one file per printed page/section
│   │   ├── print.css            # single consolidated print stylesheet, one @page rule
│   │   └── print-engine.js      # ONE orchestrator: syncAllPrintFields(), replaces the 8-listener fan-out
│   │
│   ├── shared/
│   │   ├── calculations.js      # ball-pen avg, canvas mat rate, loose density, total litres (pure, unit-testable)
│   │   ├── lot-number.js        # single lot-number generator
│   │   └── dom-utils.js
│   │
│   ├── offline/                 # offline-core.js, split if it grows
│   ├── cloud/                   # cloud-core.js, split if it grows
│   └── config/
│       └── app-config.js
│
├── assets/
│   └── colas_logo.png
│
├── backend/
│   └── supabase-setup.sql
│
├── docs/
│   ├── PDF_REDRAW_BASELINE.md
│   ├── PDF_REDRAW_TEST_CHECKLIST.md
│   └── ENGINEERING_REVIEW_001.md
│
└── test-assets/
    └── pdf-baseline/            # reference PDFs + (future) automated screenshot diffs
```

Key principle: **one authoritative place per concern** — one print stylesheet, one `@page` rule, one sync orchestrator, one lot-number function — replacing the current "append a new version block" pattern.

---

## 10. The Safest First Refactor With Almost Zero Risk

**Delete the orphaned `site-diagram-print.html` and its entry in `service-worker.js`'s `APP_SHELL` cache list.**

Why this is genuinely near-zero-risk:
- It is not linked, opened, `fetch`ed, or `iframe`d by any code path in `index.html`, `cloud-core.js`, or `offline-core.js` — confirmed by repo-wide search.
- Its only reference anywhere is the service worker's cache-warming list, which only affects offline availability of a page nothing ever navigates to.
- Removing it cannot change anything a user sees, because nothing currently renders it.

Second-safest candidate, slightly more involved: **removing the *first* (shadowed) definitions of functions that are redeclared later in the same scope** (`calcAvg`, `updateWarning`, `syncPrintBall`, `calcCanvas`, `calcLoose`, `syncPrintCanvas`, `syncPrintLoose`, the global `setText`). Because JavaScript's "last declaration wins" rule means the first copy of each never executes today, deleting it is a no-op at runtime — but this one still needs a full regression pass against the checklist afterward, since it touches the same script block as several `beforeprint`-registering IIFEs and a mistake in the edit boundary would be easy to make.

Either way: **run the full `docs/PDF_REDRAW_TEST_CHECKLIST.md` against `test-assets/pdf-baseline/` before and after**, even for changes this low-risk, per the protection protocol already in place.

---

## 11. Priority List — Highest to Lowest Impact

1. **Stand up automated regression tooling first** (e.g., a headless-browser script that fills a sample form and screenshots/print-renders the output, diffed against the stored baseline PDF). Nothing else on this list is safe to do at scale without this — right now every check is manual.
2. **Remove genuinely dead code** with zero references (`site-diagram-print.html` + its service-worker entry; shadowed first-definitions of redeclared functions; decide and act on the two permanently-guarded dead references).
3. **Consolidate print CSS into one stylesheet with a single `@page` rule**, preserving today's *effective* (last-wins) values exactly.
4. **Replace the 8-listener `beforeprint` fan-out and the 3 divergent entry-point sync lists with one shared `syncAllPrintFields()` orchestrator**, called identically by `previewPrint`, `generateLotPack`, and `emailReport`. This directly closes the root cause of the print/email drift bug class that has already shipped twice.
5. **Extract the calculations into pure, unit-testable functions** (ball-pen average, canvas mat rate, loose density, total litres) — small, self-contained, high compliance value, easy first real unit-test win.
6. **Split `index.html`'s print templates and form sections into separate files**, per Section 9, once the above are stable and covered by regression tooling.
7. **Introduce a minimal build step** (even just concatenation/minification) only once modularization makes it worthwhile — don't add tooling complexity before there's something it's protecting.
8. **Resolve the Supabase RLS/office-visibility question** (Section 3, item 7) — not a PDF-redraw risk, but a real product-architecture question worth a direct answer.
9. **Formalize versioning** — replace the informal `V###` id convention with real changelog entries so future patches don't need to be reverse-engineered from code the way this review had to.
