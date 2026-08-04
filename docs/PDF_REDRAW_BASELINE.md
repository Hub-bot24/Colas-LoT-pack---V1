# PDF Redraw Baseline

Status: **Documentation only. No behaviour was changed to produce this document.**

This document is the protected baseline for how the Colas Lot Pack app currently
turns the digital on-screen form into the printable/emailable Lot Pack PDF
("the redraw system"). It exists so that any future refactor has a precise,
written description of current behaviour to preserve.

> **Rule for all future work:** Any refactor of the print/PDF system must
> produce byte-for-byte-equivalent *visual* output (same fields, same values,
> same layout, same page breaks) as described here, verified against the
> baseline PDF stored in `test-assets/pdf-baseline/`. If a change to this
> system is unavoidable, this document and the test checklist must be updated
> in the same change, and the baseline PDF must be regenerated and re-approved.

---

## 1. Plain-English explanation of how the redraw currently works

The whole application — the editable digital form, the printable report, and
every script that keeps them in sync — lives in **one file: `index.html`**
(~5,800 lines). There is no PDF-generation library. "Generating a PDF" means:

1. The user fills in the interactive form, which is organised into tabbed
   `.page` sections (`#lot`, `#site`, `#qvc`, `#mix`, `#pen`, `#canvas`,
   `#memo`, `#sign`, etc.).
2. Hidden in the same document is a second, print-only copy of the report —
   the `<div class="print-report">…</div>` block (starts around line 1802) —
   built from static HTML plus empty placeholder elements (ids/classes
   prefixed `p...`, `pQvc`, `pCanvas`, `pLoose`, `pChainage`, `v113_*`, etc.).
   This block is `display:none` on screen and `display:block` only inside
   `@media print`.
3. A family of **"sync" functions** read the live values out of the editable
   form fields and copy/format them into the matching print-only
   placeholders (text content, `<img src>` for signatures/diagrams,
   checkbox glyphs, computed averages, etc.).
4. When the user triggers output (see buttons below), the app calls these
   sync functions and then calls the browser's native `window.print()`.
   **The actual PDF is produced by the browser's own print-to-PDF engine**,
   not by any code in this app. The app's job is only to make sure the
   hidden `.print-report` DOM is fully populated and correctly styled with
   `@media print` CSS (page size, margins, page breaks, fonts, borders)
   before `window.print()` fires.
5. Separately, an "Email Report" path exists that does **not** use
   `window.print()`. It serializes the current `<style>` tags plus the
   `.print-report` DOM into a **standalone `.html` file** and shares/
   downloads it, then opens a `mailto:` link. This is a second, independent
   reimplementation of "collect the same data and render it the same way" —
   see Known Risks below.
6. The site diagram (hand-drawn/uploaded sketch) goes through its own
   image-processing pipeline (crop, "clean" via canvas thresholding into a
   black-and-white redraw, base64 PNG) before being copied as an `<img>`
   into the print-only diagram page.
7. Signatures are captured on `<canvas>` elements via pointer/touch drawing
   handlers, then converted with `canvas.toDataURL('image/png')` into
   `<img>` elements inside the print-only sign-off tables.
8. Offline durability (`offline-core.js`) autosaves the whole form to
   IndexedDB and is unrelated to the visual redraw, except that it
   **overrides `window.saveDraft` and `window.submitLotPack`** at runtime
   (see Section 4).

### The critical, easy-to-miss mechanism: `beforeprint` fan-out

Because the same logical function (e.g. "sync the site diagram into print",
"sync signatures into print") has been redefined multiple times by
successive patches, **the current correct output is produced by the
*combination* of the last-registered version of each button handler *and*
eight separate `window.addEventListener('beforeprint', ...)` listeners**,
each added by a different historical patch and never removed:

```
index.html:2534  forceDiagramIntoPrintFixed
index.html:3507  (anonymous) forceCompassDropdown + forceNorthArrow + copyDiagramToFullPrintReport
index.html:3642  fillV33SiteDiagramPrintPage
index.html:3864  putCleanDrawingOnWorksheet
index.html:4217  syncPrintDiagramV101
index.html:4250  syncAllBeforeOutput
index.html:4431  repairSignatureBlock
index.html:4905  syncV113
```

All eight fire, in this order, every time `window.print()` is invoked
(directly or via the browser's print UI), regardless of which button
triggered it. **Some of the visible print output today is populated by
these listeners, not by the body of the button's own onclick handler.**
A refactor that "cleans up" or removes any one of these listeners, believing
it to be dead/superseded code, can silently break part of the printed
report even though the function that logically superseded it still runs.

---

## 2. Relevant files and functions

### Files
| File | Role in the redraw system |
|---|---|
| `index.html` | Everything: digital form markup, print-only markup, all print CSS, all sync/print JS. |
| `site-diagram-print.html` | A **standalone, orphaned** page that duplicates the site-diagram print layout. Not linked from `index.html`, not opened by any code path. Only referenced by `service-worker.js`'s cache list. See Known Risks. |
| `app-config.js` | Supabase config **and** the first/base `@media print` CSS rules for `.app`, `.page`, `.print-report`, `.print-table`, etc. |
| `cloud-core.js` | Auth + Supabase upload plumbing. Not part of the visual redraw, but `submitLotPack` (wired to the "Submit Securely" button) ends up here indirectly via `offline-core.js`. |
| `offline-core.js` | IndexedDB autosave/durable queue. Overrides `window.saveDraft`, `window.submitLotPack`, `window.emailSubmitLotPack` at load time. |
| `service-worker.js` | PWA offline cache list; includes `site-diagram-print.html` for offline availability even though it's unused by the live UI. |

### Entry points (the four action buttons, `index.html:2836`)
```html
<button onclick="saveDraft()">Save Draft</button>
<button onclick="previewPrint()">Preview / Print PDF</button>
<button onclick="emailReport()">Email Report</button>
<button onclick="generateLotPack()">Generate Lot Pack</button>
<button onclick="submitLotPack()">Submit Securely</button>
```

- **`previewPrint()`** — redefined 4 times; the version that actually runs is
  the *last one loaded*, at `index.html:4874` (script id
  `V113_CLEAN_PRINT_JS`). It calls `updateLotNo`, `syncPrintDiagramV101`,
  `v33FillSiteDiagramPrintPage`, `syncIncludedPrint`, `syncMixPrint`,
  `syncQaConfirmPrint` (see risk below — undefined), `syncLotCoverPrint`,
  `syncCanvasFieldsPrint`, `syncPrintBall` ×12, `syncPrintCanvas`/
  `syncPrintLoose` ×3, `syncV113`, then `window.print()` after a 250 ms
  timeout (the 250 ms lets images/canvases finish rendering before print).
- **`emailReport()`** — defined once, `index.html:3148`. Independent sync
  list, then builds a standalone HTML document from all `<style>` tags plus
  `.print-report.outerHTML` and shares/downloads it as `LotPack-<lotno>.html`.
  **This is not a PDF** — it's an HTML file the user is expected to
  print-to-PDF themselves, or attach as HTML.
- **`generateLotPack()`** — redefined twice. `index.html:4252` (`V103`,
  fuller: calls `syncAllBeforeOutput` which covers lot cover, canvas fields,
  included checkboxes, mix). `index.html:4894` (`V113`, the one that
  actually runs) only calls `updateLotNo`, `syncPrintDiagramV101`, and
  `syncV113` directly — it relies entirely on the `beforeprint` fan-out
  (Section 1) to populate everything else. **This is intentional-looking but
  fragile**: it works today only because `syncAllBeforeOutput` is still
  attached as a `beforeprint` listener from the superseded `V103` script
  block.
- **`saveDraft()`** — inline version at `index.html:3111` writes to
  `localStorage`. Overridden at runtime by `offline-core.js:364`
  (`window.saveDraft = () => saveDraft(true)`) to use IndexedDB instead.
  The `localStorage` version never actually runs once `offline-core.js` has
  loaded.
- **`submitLotPack()`** — not defined in `index.html` at all; defined only
  in `offline-core.js:366`, queues into IndexedDB and syncs to Supabase.
  Not part of the visual redraw.

### Print-time "sync" functions (form → print-only DOM)
| Function | Purpose | Defined at |
|---|---|---|
| `syncLotCoverPrint` | Cover page fields (client, site, agg source/size/vol, area, conformed by/date, notes, QVC header fields, memo header fields) | `index.html:3056` |
| `syncCanvasFieldsPrint` | Ball pen / canvas mat header fields (customer, job, tested by, dates) | `index.html:3088` |
| `syncMixPrint` / `calcTotalLitres` | Bitumen/kerosene/additive/total litres | `index.html:2841`, `3027` |
| `syncIncludedPrint` | "Included in this lot" checkboxes | `index.html:3047` |
| `syncQvcPrint` | QVC checklist tick marks | `index.html:2941` (superseded copy also present, see duplication list) |
| `populatePrintQvc` | Populates the print QVC table row labels from the `qvcItems` array | `index.html:2883` |
| `calcAvg` / `syncPrintBall` | Ball penetration average + row sync (chainage, offset, 5 readings, avg, road temp, penetration time) | last-active copies at `index.html:2950`/`2974` |
| `updateWarning` | Shows/hides the ">=3.0mm ball penetration" warning banner | last-active copy at `index.html:2969` |
| `calcCanvas` / `syncPrintCanvas` | Canvas mat spread-rate calc + sync | last-active copies at `index.html:2986`/`3011` |
| `calcLoose` / `syncPrintLoose` | Loose aggregate density calc + sync | last-active copies at `index.html:3003`/`3017` |
| `syncSiteDiagramFromCover` | Pushes cover-page fields into the site-diagram worksheet header | `index.html:2456` |
| `getDiagramData` / `getDiagramDataV101` | Resolve the current diagram image (cleaned canvas, uploaded image, or `window.siteDiagrams[0]`) as a data URL | `index.html:3555`, `4129` |
| `fillV33SiteDiagramPrintPage` / `syncPrintDiagramV101` | Push the resolved diagram image + north-arrow rotation into the full-page print diagram | `index.html:3574`, `4147` |
| `updateLotNo` / `safeUpdateLotNo` / `safeLotNumber` | Compute and broadcast the generated Lot Number (`YYMMDD-Shift-Job-Product[-Count]`) to every place it's displayed | `index.html:2868`, `3248`, `3327` |
| `syncV113` | Signatures + memo name/date + final sign-off block (the current, most complete signature sync) | `index.html:4842` |
| `repairSignatureBlock` | Defensive re-fix of the signature canvases/table right before print | `index.html:4405` |

### Calculations that appear in the printed output
- **Ball penetration average** (`calcAvg`, `index.html:2950`): mean of up to
  5 numeric readings per row, rounded to 1 decimal; row/average styled red
  and the global warning banner shown if any average `>= 3.0`.
- **Canvas mat spread rate** (`calcCanvas`, `index.html:2986`):
  `r1 = (M1 - M2) / A` (kg/m², 3 decimals), `r2 = round(1000 * DL / r1)`
  (spread rate), only computed when `M1>0 && M2>0 && A>0`.
- **Loose density** (`calcLoose`, `index.html:3003`):
  `looseDL = M3 / Vol` (3 decimals), only when both `> 0`.
- **Total bitumen litres** (`calcTotalLitres`, `index.html:2841`):
  `bitumen + kerosene + additive`, rounded to nearest integer.

### Signature handling
Four separate historical implementations set up `<canvas class="signatureCanvas">`
drawing, each guarding itself with its own `dataset` flag so they don't
double-bind the same canvas, but all coexisting in the file:
- `fixCanvas` — `index.html:3760` (script `v40-signature-touch-fix-js`)
- `setupSignatureCanvas` — `index.html:3927` (script `V53_LOT_SIGNATURE_JS`)
- `setupCanvas` — `index.html:4573` (script `V105_SIGNATURE_POINTER_ALIGNMENT_FIX`)
- `installSignatureFix` — `index.html:4922` (script `V115_SIGNATURE_POINTER_FIX_JS`)

At print time, `syncV113` (`index.html:4842`) reads each signature canvas
with `canvas.toDataURL('image/png')` and writes it into an `<img>` in the
print-only sign-off/memo tables (`v113_b_sig`, `v113_a_sig`,
`v113_colas_sig`, `v113_client_sig`). `repairSignatureBlock`
(`index.html:4405`) runs on `beforeprint` as a defensive re-check.

### Diagram handling
- Upload/crop/clean pipeline: `index.html:2444-2490` (inside an IIFE) —
  loads the uploaded image, lets the user crop and rotate it, then runs a
  box-blur + threshold "clean" pass (`clean()`, `index.html:2488`) that
  produces a black-ink-on-white PNG, stored as
  `window.siteDiagrams = [{originalData, redrawnTemplateData, ...}]`.
- North-arrow compass: `updateNorthArrowCompassFixed` (`index.html:2492`)
  and duplicate `forceNorthArrow` (`index.html:3447`) both rotate the same
  arrow glyph based on a compass `<select>`.
- Copy into the full print report: `copyDiagramToFullPrintReport`
  (`index.html:3462`), `fillV33SiteDiagramPrintPage` (`index.html:3574`),
  `syncPrintDiagramV101` (`index.html:4147`), `putCleanDrawingOnWorksheet`
  (`index.html:3831`), `forceDiagramIntoPrintFixed` (`index.html:2520`) —
  five overlapping functions that each try to make sure *some* print
  diagram `<img>` ends up populated. All are still wired to `beforeprint`
  or click handlers.

### Print CSS and page-break rules
Print CSS is spread across **`app-config.js`** and **>25 separate
`<style>` blocks** in `index.html` (ids like `V113_CLEAN_PRINT_CSS`,
`V116_LOGO_AND_COMPACT_PRINT_FIX`, `V117_..._COMPACT_PRINT`,
`V118_..._QVC`, `V119_LARGER_FIRST_PAGE_TEXT`,
`V120_QVC_AND_COMBINED_SIGNOFF_FIX`, etc.), each layering more `!important`
overrides on top of earlier ones rather than editing them in place. Key
points:
- `@page` size/margin is declared **5 separate times**
  (`app-config.js:30` margin 10mm, `app-config.js:95` margin 8mm,
  `index.html:590` , `index.html:5051` margin 6mm,
  `index.html:5208` margin 5mm). The browser uses the **last one in
  document order**, currently `index.html:5208` (5mm margins, A4 portrait).
- Page breaks are implemented with `page-break-before/after: always` and
  `.pdfcov-page`/`.pdfchk-page` classes (`index.html:1730-1732`) — cover
  page always ends its own page; each `.pdfchk-page` (checklist sections)
  starts a new page; `#v113PrintMSF19` and `#v113PrintFinalSignoff` are
  forced onto their own page in `V113_CLEAN_PRINT_CSS`
  (`index.html:4722-4726`), but a later block,
  `V120_QVC_AND_COMBINED_SIGNOFF_FIX` (`index.html:5567-5620`), explicitly
  **collapses MSF19 + Final Review back onto one shared page** —
  i.e. a later patch intentionally reverses an earlier patch's page-break
  decision for that specific section. This is real, intended current
  behaviour, not a bug — but it means the "one section = one page" rule is
  **not** universal, and a refactor must check each section's *actual*
  resulting page-break behaviour, not just infer it from one CSS block.
- `page-break-inside: avoid` is used on `.v113-card` and similar wrapper
  elements to keep individual info boxes/signature blocks from splitting
  across a page boundary.

---

## 3. Known duplicated functions / overlapping implementations

The file has been extended by pasting in dozens of versioned patch blocks
(`v19`, `v26`, `v33`, `v34`, `v35`, `v38`, `v39`, `v40`, `V46`, `V48`, `V49`,
`V52`, `V53`, `V100`, `V101`, `V103`, `V104`, `V105`, `V113`, `V115`,
`V116`-`V120`, `V123`) rather than editing earlier code. In JavaScript,
`function foo(){}` declared twice in the same scope means **the second
declaration silently wins**; nothing errors, so this has been safe so far,
but it is fragile:

| Function | Defined at (first → last, last wins) |
|---|---|
| `calcAvg` | `index.html:2896` and `2950` |
| `updateWarning` | `index.html:2916` and `2969` |
| `syncPrintBall` | `index.html:2898` and `2974` |
| `calcCanvas` | `index.html:2938` and `2986` |
| `calcLoose` | `index.html:2939` and `3003` |
| `syncPrintCanvas` | `index.html:2921` and `3011` |
| `syncPrintLoose` | `index.html:2928` and `3017` |
| `setText` (global, unscoped) | `index.html:2920` and `3010` (also several IIFE-local `setText`s that don't collide because they're scoped) |
| `previewPrint` (as `window.previewPrint`) | `index.html:3127` (original), reassigned at `3620`, `4197`, `4874` — last wins |
| `generateLotPack` (as `window.generateLotPack`) | `index.html:4252` and `4894` — last wins, and the last version is *thinner* than the one it replaced (see Section 2) |
| `saveDraft` (as `window.saveDraft`) | inline `index.html:3111`, overridden by `offline-core.js:364` |
| North-arrow rotation logic | `updateNorthArrowCompassFixed` (`index.html:2492`) and `forceNorthArrow` (`index.html:3447`) — two independent implementations of the same rotation-degree lookup table, applied to different arrow elements (`northArrow` vs `sd_northArrow`) |
| Diagram-into-print copy | Five overlapping functions, see "Diagram handling" above |
| Signature canvas setup | Four overlapping implementations, see "Signature handling" above |
| `@page` size/margin | Declared 5 times across 2 files, see "Print CSS" above |

Two functions are **referenced but never defined** anywhere in `index.html`:
`syncQvcPrint`'s sibling `syncQaConfirmPrint` and the top-level
`syncPrintDiagrams` (both called only through `typeof X === 'function'`
guards, e.g. `index.html:3134`, `3157`, `3359`, `3623`, `4202`, `4880`).
These calls are permanently no-ops today. This is not currently causing a
visible bug (whatever they were meant to do is evidently handled elsewhere
now), but a refactor must not assume these names are safe to reuse/rely on,
and should not "fix" them by wiring them up without checking whether that
changes output.

`site-diagram-print.html` is a full standalone duplicate of the site-diagram
print layout that is **not part of the live redraw path** (see Known Risks).

---

## 4. Known risks

1. **`beforeprint` fan-out is load-bearing.** See Section 1. Removing,
   reordering, or "cleaning up" any of the 8 `beforeprint` listeners, or any
   script block that registers one, can silently change printed output even
   though a newer, seemingly-equivalent function exists elsewhere.

2. **Email output and Print output are two independent code paths that must
   be kept in sync by hand.** `emailReport()` (`index.html:3148`) has its
   own, shorter list of sync calls, separate from `previewPrint()`
   (`index.html:4874`) and `generateLotPack()` (`index.html:4894`). The
   commit history in this repo shows this has already broken production
   behaviour twice (`5beddf9 Fix print preview missing data - the real bug
   behind email/print mismatch`, `002db8f Fix emailed report always
   differing from print preview`). Any refactor that touches sync functions
   must update all three entry points (and the `beforeprint` listeners) or
   re-introduce this exact bug class.

3. **`generateLotPack()`'s active definition is thinner than its
   predecessor and depends on inherited `beforeprint` listeners to work.**
   If a future cleanup deletes the seemingly-superseded `V103` script block
   (which still registers `syncAllBeforeOutput` on `beforeprint`), the
   "Generate Lot Pack" button will stop populating lot-cover fields, canvas
   fields, included-items checkboxes, and mix/bitumen fields, even though
   nothing about `generateLotPack` itself changed.

4. **`site-diagram-print.html` is an orphaned duplicate.** It is not linked
   from `index.html`, not opened by any script, but is still listed in
   `service-worker.js`'s cache manifest. A refactor could reasonably delete
   it thinking it's dead, or could mistakenly treat it as *the* diagram
   print implementation because of its name — it is neither correct to
   assume it's safe to delete without checking service worker impact, nor
   is it part of the current redraw behaviour to preserve.

5. **`@page` margin/size is declared 5 times; only the last one in document
   order is authoritative** (currently `index.html:5208`, 5mm margins).
   Deleting or reordering any of the later `<style>` blocks changes the
   effective page margins for the whole PDF without touching any JS.

6. **Two dead function references (`syncQaConfirmPrint`, `syncPrintDiagrams`)
   look like they should do something but are guarded no-ops.** Do not
   assume they're safe to implement or that removing their guarded calls is
   a no-op cleanup — verify current output is unaffected either way before
   changing them.

7. **PDF generation depends entirely on the invoking browser's native
   "print to PDF" implementation.** There is no server-side or library-based
   PDF renderer. Output can vary slightly between browsers/OS print engines
   (font substitution, exact pagination) even with identical HTML/CSS. The
   baseline PDF in `test-assets/pdf-baseline/` should be regenerated with
   the same browser/OS combination used for comparison whenever possible.

8. **Duplicated print page markup exists in the DOM.** Around
   `index.html:1802-2270` is the current `.print-report`/`v113-print-only`
   set of print pages; around `index.html:2271-2836` similarly-titled
   sections ("Lot Conformance Report", "Surfacing Checklist", "Field Spread
   Rate of Cover Aggregate", "Ball Penetration Test", "Site Memo", "Final
   Review / Sign Off") reappear as part of the live, on-screen `.page` tabs
   (`#lot`, `#qvc`, `#canvas`, `#pen`, `#memo`, `#sign`). These are two
   different things (print-only output vs. the editable on-screen form) that
   happen to share section titles and field layouts — they must not be
   assumed to be simple duplicates safe to merge; the sync functions in
   Section 2 exist specifically to keep them separately-consistent.

---

## 5. Instructions for any future refactor

- Do not remove, merge, or reorder any `beforeprint` listener, `<style>`
  block, or "sync" function without first confirming — with the printed
  output, not just by reading the code — that nothing currently depends on
  its position or its specific (possibly superseded-looking) behaviour.
- Treat "last definition wins" duplicate functions as the *only* currently
  active version; do not assume an earlier same-named definition is dead
  code and delete it without checking whether removing it changes load
  order effects (e.g. `beforeprint` registration) elsewhere.
- Any refactor must be validated by generating a new PDF (via the same
  "Preview / Print PDF" flow used today) from a fully filled-out sample lot
  pack and visually comparing it, page by page, against the reference PDF
  in `test-assets/pdf-baseline/`, using the checklist in
  `docs/PDF_REDRAW_TEST_CHECKLIST.md`.
- If output differs in any way not explicitly requested by the task, the
  refactor is not done — fix it or revert, do not ship a "close enough" PDF.
- Update this document and the checklist in the same change if the redraw
  system's structure changes, so they never go stale.
