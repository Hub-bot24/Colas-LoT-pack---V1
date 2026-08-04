# Lot Pack Business Workflow Map

*Workflow analysis only. No production code was modified to produce this document.*

This document maps the **current** business workflow implemented by the
Colas Lot Pack application, end to end, as evidenced by the code in
`index.html`, `offline-core.js`, `cloud-core.js`, and `supabase-setup.sql`,
then proposes a **Future HUG Workflow** describing how AI could safely
extend it. It is written for a workflow/automation decision-maker, not a
developer (see `docs/ENGINEERING_REVIEW_001.md` and
`docs/PDF_REDRAW_BASELINE.md` for the technical/code view).

The workflow exists to produce one artifact: **a completed, signed "Lot
Pack"** — the compliance record (MSF28-6b Conformance Report, MSF28-5 QVC
checklist, and supporting test/sign-off forms) for one sprayed bituminous
surfacing lot, per Colas's quality system referenced throughout the form
(MRTS05, MRTS11, TN186).

---

## Workflow at a glance

| # | Step | App tab / mechanism |
|---|---|---|
| 0 | Sign in / resume | Login overlay (`cloud-core.js`) + offline draft restore (`offline-core.js`) |
| 1 | Lot identification & cover details | Tab 1 — *Lot Report* (`#lot`) |
| 2 | Surfacing QVC checklist | Tab 2 — *QVC* (`#qvc`) |
| 3 | Site diagram capture | Tab 3 — *Site Diagram* (`#site`) |
| 4 | Canvas mat / loose density testing | Tab 4 — *Canvas / Embed* (`#canvas`) |
| 5 | Ball penetration testing | Tab 5 — *Ball Pen / Mat* (`#ball`) |
| 6 | Non-conformance memos | Tab 6 — *Memo* (`#memo`) |
| 7 | Final sign-off | Tab 7 — *Signatures* (`#sign`) |
| 8 | Output generation | Preview/Print, Email Report, Generate Lot Pack |
| 9 | Secure submission & sync | Submit Securely → offline queue → Supabase |

Each step below is scored against all 12 requested dimensions.

---

# Part 1 — Current Workflow

## Step 0 — Sign In / Resume Session

1. **Purpose of the step:** authenticate the worker and restore any
   in-progress offline draft so field data entry can begin or continue.
2. **User input required:** work email + password (sign in), or email +
   password (create test account).
3. **Data required:** Supabase auth credentials. No lot data yet.
4. **Validation rules:** browser `type="email"` format check;
   `minlength="8"` on password for account creation. No visible
   server-side rule beyond Supabase Auth's own defaults. This is the
   **only** place in the entire application with any format-validation
   attributes — every field in the actual Lot Pack form (Steps 1–7) has
   none.
5. **Outputs:** an authenticated Supabase session; `lotpack-auth-ready`
   event fired, triggering a sync attempt of any queued offline
   submissions; the last local draft restored from IndexedDB.
6. **Dependencies:** Supabase project reachability; `app-config.js`
   (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`). Offline: none — the app
   opens and restores the last local draft even with no connection and no
   session; login is only required to *submit*, not to fill in a lot.
7. **External systems involved:** Supabase (Auth + Postgres) only. No
   evidence of SSO/identity federation with any site-access system
   (Damstra or equivalent).
8. **Current manual work performed by the user:** typing credentials each
   time a new device is used; the confirm-to-sign-out action.
9. **Opportunities to reduce user interaction:** persistent session
   already minimizes repeat logins ("Sign in once while online"). Further
   reduction (device biometric/SSO) is a UX change, not an AI opportunity.
10. **Could this step be automated by AI:** no — authentication is a
    security control, not a data-processing task.
11. **Should this step always require human approval:** yes — the
    identity of the submitting worker underpins row-level security and the
    audit trail; this must remain a deliberate human action.
12. **Risk if automated incorrectly:** misattributing a submission to the
    wrong worker would corrupt the audit trail and break the Supabase RLS
    security model that assumes `auth.uid() = user_id`.

---

## Step 1 — Lot Identification & Cover Details (`#lot`)

1. **Purpose of the step:** establish the unique identity of this lot
   (job, customer, site, date, product/mix) and its aggregate/bitumen
   quantities — the header that every downstream page depends on.
2. **User input required:** Lot Count for Day, Job No., Customer, Site
   Location, Work Date, QA Conducted By (dropdown of 3 named staff), Shift
   (Day/Night), Existing Surface (dropdown), Spray Sheet No., Product, Agg
   Source (dropdown), Bitumen/Kerosene/Additive litres, Agg Size, Agg Vol,
   Area m², 10 "Included Items" checkboxes, Conformed By, Conformed Date,
   free-text Notes.
3. **Data required:** the job/contract identity, the day's product/mix
   design, aggregate source and quantities, and which supporting
   attachments exist for this lot.
4. **Validation rules:** **none enforced.** No field is marked `required`;
   `lotCount` has `min="1"` but is intentionally left blank when not
   needed. Total Litres is `readonly`/computed. Nothing prevents
   submitting with Customer, Job No., or Product blank or unchanged.
   - **Data-integrity risk found in the markup:** several fields ship
     with a *previous real job's data* hardcoded as the HTML default value
     (`Job No. = CQ01918S`, `Customer = NEXUS`,
     `Site Location = Toowoomba Bypass`, `Work Date = 2026-05-06`,
     `Product = S20E`, `Bitumen = 19063`, etc.). A fresh load of the app is
     not blank — it looks pre-filled with a plausible but stale lot. If a
     user doesn't deliberately overwrite every one of these, the generated
     Lot Pack can silently carry the wrong job's identity.
5. **Outputs:** the generated **Lot Number**
   (`YYMMDD-Shift-Job-Product[-Count]`), propagated to every other tab,
   the print report, QVC header, site diagram header, memo headers, and
   sign-off block; computed Total Litres; the Included Items manifest.
6. **Dependencies:** none upstream (entry point); everything downstream
   (Steps 2–7, print output) depends on this step's Job No., Customer,
   Site Location, and Work Date.
7. **External systems involved:** none integrated in code. This step is
   where, operationally, several named external systems would plausibly
   connect but currently don't: a **project/works-order system** (Job
   No./Customer/Site), a **Seal Design** record (Product, target
   application rates), and a **Bitumen supplier record** — e.g. **SAMI**
   or equivalent — for the "Bitumen Test Reports" Included Item. Today all
   of these are just typed values or a manual attachment checkbox, not a
   data connection.
8. **Current manual work performed by the user:** retyping/reselecting
   job identity, product, and aggregate data on every lot, even when
   unchanged from the previous lot on the same job/day.
9. **Opportunities to reduce user interaction:** pull Job No./Customer/
   Site/Product/Agg Source from a project or works-order master record;
   carry forward the previous lot's values within the same job with a
   one-tap confirm instead of full retyping.
10. **Could this step be automated by AI:** yes, in large part — header/
    identity fields are well-suited to AI-assisted autofill from a
    source-of-truth record, with the user *confirming* rather than typing.
11. **Should this step always require human approval:** yes for
    "Conformed By"/"Conformed Date" (the QA sign-off that the lot's
    paperwork is complete); the identity fields need accurate entry or
    confirmation, though not a formal "approval" in themselves.
12. **Risk if automated incorrectly:** wrong Job No./Customer/Site/Product
    on a Lot Pack is a severe risk — the document would be attributed to
    the wrong job/contract, potentially invalidating the compliance record
    or causing a contractual/payment dispute.

---

## Step 2 — Surfacing QVC Checklist (`#qvc`)

1. **Purpose of the step:** independently witness and record compliance
   with MRTS11/TN186 hold points, witness points, and check items during
   the physical sealing operation.
2. **User input required:** up to 3 checkboxes per row (Colas Rep / Client
   / NCR) for each of 32 predefined checklist rows.
3. **Data required:** real-time, on-site witness/verification against
   each specification clause as work physically proceeds.
4. **Validation rules:** **none.** All 32 rows are independently optional;
   the app does not require Hold Points to be ticked before Submit is
   enabled, and does not cross-check an "NCR" tick against a corresponding
   memo/explanation. Row text (`qvcItems`, `index.html:2881`) is static
   and not user-editable, which is good for consistency but the checklist
   has no completion gate.
5. **Outputs:** a per-item ☑/☐ record for Colas Rep / Client / NCR,
   reproduced verbatim on the printed Surfacing Checklist page.
6. **Dependencies:** row labels from the hardcoded `qvcItems` array;
   header fields (date, client, contract, site) from Step 1.
7. **External systems involved:** none integrated. Witness Point 5
   ("Spraybar nozzles comply with certificate") and other equipment/
   plant-certification points would plausibly reference a site safety or
   plant-certification system such as **Damstra** operationally, but there
   is no such connection anywhere in this codebase — it's a static
   checklist with no external data source.
8. **Current manual work performed by the user:** up to 96 individual
   checkbox taps (32 rows × 3 columns) performed entirely by hand, with no
   pre-fill, no defaulting, and no cross-check against other tabs.
9. **Opportunities to reduce user interaction:** auto-flag rows derivable
   from data already captured elsewhere (e.g., surface the ball-penetration
   Hold Point row automatically once Step 5's warning is active) instead
   of requiring a second, disconnected manual check; a running
   "outstanding Hold Points" summary before Submit.
10. **Could this step be automated by AI:** no, for the witnessing act
    itself — each row requires a human physically present to observe
    compliance. Yes, for administrative cross-checking/flagging of related
    rows once other data exists.
11. **Should this step always require human approval:** yes, for
    essentially every row — this is the least automatable step in the
    entire workflow, by design.
12. **Risk if automated incorrectly:** auto-ticking or inferring compliance
    without an actual physical witness would falsify a regulatory record.
    This is the **single highest-severity automation risk** in the whole
    application — it would produce a compliance document asserting an
    inspection that never happened.

---

## Step 3 — Site Diagram Capture (`#site`)

1. **Purpose of the step:** produce a clean, printable site diagram
   showing chainage, spray extent, and orientation for the compliance
   record.
2. **User input required:** upload a photo/scan of a hand-drawn site
   diagram; rotate 90° as needed; drag-adjust a crop rectangle; adjust 4
   image-cleanup sliders (Sensitivity, Background flatten, Ink darken,
   Noise removal); select a compass direction (9-option dropdown).
3. **Data required:** an accurate freehand or CAD site sketch produced in
   the field — the app only cleans and frames a diagram that already
   exists on paper/photo, it does not create one.
4. **Validation rules:** **none.** No requirement that a diagram be
   uploaded at all; nothing blocks submission without one, even though
   "Site Diagram" is one of the Included Items checkboxes and that
   checkbox is never cross-checked against whether an image actually
   exists.
5. **Outputs:** a cleaned, black-ink-on-white PNG (client-side box-blur +
   threshold image processing, not AI/ML today), embedded as the full-page
   Site Diagram Worksheet with a rotated north-arrow glyph and Step 1's
   header fields repeated.
6. **Dependencies:** consumes Job No./Customer/Site/Date/Prepared-By from
   Step 1; feeds only the print output.
7. **External systems involved:** none. No GIS/CAD import; the only input
   is an arbitrary image file.
8. **Current manual work performed by the user:** manual crop + 4-slider
   tuning per upload; manual compass-direction selection.
9. **Opportunities to reduce user interaction:** auto-crop/auto-clean via
   an image model instead of 4 hand-tuned sliders; enforce the Included
   Items "Site Diagram" checkbox against actual image presence.
10. **Could this step be automated by AI:** partially — the mechanical
    cleanup (crop/threshold/noise-removal, auto bounding-box detection) is
    a strong AI/ML candidate. The diagram's *content* (what's actually
    drawn) reflects a human surveyor's judgment and cannot be automated.
11. **Should this step always require human approval:** yes for the
    final result — a human should confirm the cleaned diagram still
    accurately represents the site before it's finalized, even if the
    cleanup itself is AI-assisted.
12. **Risk if automated incorrectly:** an AI cleanup step that distorts or
    mis-crops real site features (e.g. cutting off a spray-extent
    boundary) could misrepresent the physical site in a legal compliance
    document.

---

## Step 4 — Canvas Mat / Loose Unit Mass Testing (`#canvas`)

1. **Purpose of the step:** quantify the actual spread rate and loose
   unit mass of cover aggregate (Test Methods Q711A/Q221A) to verify
   aggregate application matches the seal design.
2. **User input required:** Quarry Source, Aggregate Size, Tested By, Test
   Date; per test (×3): M1 (mass canvas mat + aggregate), M2 (mass canvas
   mat), A (area of canvas mat), DL (reference density); and separately
   per test (×3): M3 (loose sample mass), Vol (measuring cylinder volume).
3. **Data required:** physical weighing/measurement results from a field
   or lab scale.
4. **Validation rules:** **none enforced** beyond implicit numeric parsing
   — non-numeric input silently becomes a blank calculated output rather
   than an error. Calculations only populate when inputs are `> 0`; there
   is no plausibility/range check on the resulting spread rate.
5. **Outputs:** computed spread rate `R1 = (M1 − M2) / A` (kg/m², 3
   decimals) and application rate `R2 = round(1000 × DL / R1)`, per test;
   computed loose density `= M3 / Vol` (3 decimals), per test.
6. **Dependencies:** header fields from Step 1; feeds the printed "Field
   Spread Rate of Cover Aggregate (Canvas Mat)" page.
7. **External systems involved:** none. DL (reference density) and A (mat
   area) are typed constants (defaulted to `0.85`, `0.97`, `1.45`) rather
   than pulled from a calibrated-equipment database or the **Seal Design**
   record this test is meant to verify against.
8. **Current manual work performed by the user:** hand-typing every mass/
   volume reading from a physical scale, six data points per test x2
   tests.
9. **Opportunities to reduce user interaction:** connected-scale
   (Bluetooth/USB) capture of M1/M2/M3 instead of manual typing; pull DL/A
   and the target application rate from the Seal Design record instead of
   a hardcoded default.
10. **Could this step be automated by AI:** the calculations are already
    fully automated (deterministic formulas, no AI needed and already
    reliable). Capturing the underlying measurements is a hardware/IoT
    integration opportunity, not an AI/ML one.
11. **Should this step always require human approval:** no explicit
    sign-off on this tab specifically; covered implicitly by the overall
    Conformed-By/Signatures steps.
12. **Risk if automated incorrectly:** a wrong or fabricated mass reading
    (e.g., from a faulty auto-capture sensor) would silently produce a
    wrong spread rate that *looks* calculated and trustworthy — worse than
    an obviously missing value, because it could pass review unnoticed.

---

## Step 5 — Ball Penetration Testing (`#ball`)

1. **Purpose of the step:** verify the sprayed bitumen's ball penetration
   depth stays within the 3.0mm specification threshold (MRTS11
   Cl.10.1.2 / MRTS05 Cl.8.2.5.1) at 12 points along the lot.
2. **User input required:** per row (×12): Chainage, Offset, up to 5
   penetration readings, Road Temperature, Pen T/S (test time); header
   Tested By/Date; plus an unused "Temperature Correction" block (Ts
   Standard Temp, K Value).
3. **Data required:** field ball-penetrometer readings at 12 chainage
   points.
4. **Validation rules:** **none.** Readings accept any numeric string;
   non-numeric/zero values are silently excluded from the average rather
   than flagged. Rows can be left completely blank with no warning.
5. **Outputs:** per-row average penetration (mean of non-zero readings, 1
   decimal); a global warning banner shown whenever any row's average
   `>= 3.0`.
   - **Finding:** the "Temperature Correction" (Ts Standard Temp / K
     Value) fields are captured in the UI but **never used anywhere** — not
     in any calculation, not in the printed output. Whatever a user types
     there is silently discarded.
6. **Dependencies:** header fields from Step 1; the `>= 3.0` warning is
   the trigger condition Step 6's MSF19-1B memo exists to address and
   Step 2's Hold Point 5 refers to, but **the three are not linked in
   code** — a user must notice the warning and manually act on it.
7. **External systems involved:** none.
8. **Current manual work performed by the user:** up to 12 rows × 8
   fields = up to 96 hand-typed values per lot from physical penetrometer
   readings; manually noticing the warning banner and manually deciding to
   act on it elsewhere in the form.
9. **Opportunities to reduce user interaction:** auto-surface/pre-flag the
   MSF19-1B memo and the QVC Hold Point row the moment any average crosses
   3.0mm; remove or wire up the dead Temperature Correction fields.
10. **Could this step be automated by AI:** the average calculation and
    warning are already automated and reliable. The physical readings
    require a person operating a penetrometer in the field — not
    automatable without connected test equipment.
11. **Should this step always require human approval:** yes — any average
    `>= 3.0` is a specification trigger requiring Administrator approval
    to proceed, an inherently human decision.
12. **Risk if automated incorrectly:** an automated system that suppressed
    or mis-averaged a failing reading (e.g. a parsing bug silently
    dropping a value) could let a non-conforming seal proceed to
    sign-off undetected — a direct safety/compliance failure.

---

## Step 6 — Non-Conformance Memos (`#memo`)

1. **Purpose of the step:** formally record a client representative's
   acknowledgement of a specific non-conformance (excessive ball
   penetration, or a client instruction not to sweep) and the liability
   implications of proceeding anyway.
2. **User input required:** for MSF19-1B and MSF19-1A: Client
   Representative Name, Date, and a hand-drawn signature, each against a
   fixed, non-editable memo text block.
3. **Data required:** the client representative's name and a physically
   captured signature.
4. **Validation rules:** **none.** Both memos are always present in the UI
   regardless of whether their triggering condition actually applies to
   this lot, and neither is required to be filled in even when Step 5's
   warning is active.
5. **Outputs:** two printed memo pages with fixed regulatory text, the
   client's typed name/date, and their signature image.
6. **Dependencies:** memo header (customer/job/location) from Step 1;
   date defaults to Step 1's work date if left blank; signature capture
   mechanism shared with Step 7.
7. **External systems involved:** none.
8. **Current manual work performed by the user:** recognizing (with no
   system prompt) whether a memo applies, then manually filling in and
   signing it.
9. **Opportunities to reduce user interaction:** show only the memo(s)
   actually relevant to this lot's conditions (linked to Step 5's warning
   state) rather than always presenting both.
10. **Could this step be automated by AI:** no — the decision to invoke a
    memo can be AI-*suggested* (see opportunity above), but the client's
    acknowledgement itself is a liability-shifting legal acknowledgement
    and must never be auto-filled or auto-signed.
11. **Should this step always require human approval:** yes, explicitly —
    this step exists entirely to produce a recorded human approval.
12. **Risk if automated incorrectly:** any automation that pre-filled,
    auto-signed, or defaulted this step would create a fraudulent
    liability waiver — this must never be automated under any
    circumstance.

---

## Step 7 — Final Sign-Off (`#sign`)

1. **Purpose of the step:** obtain the dual (Colas + Client) acceptance
   that the completed Lot Pack is accurate and the work is accepted.
2. **User input required:** Final Lot No. (read-only, auto-filled), Date,
   Colas Representative name, Client Representative name, two hand-drawn
   signatures.
3. **Data required:** confirmation from both parties that the completed
   lot pack is accurate and the work is accepted.
4. **Validation rules:** **none.** Signature canvases can be left blank;
   Submit is not gated on either signature being present.
5. **Outputs:** the printed Final Review / Sign Off block: Lot No., date,
   both representative names, both signature images.
6. **Dependencies:** Final Lot No. mirrors Step 1's generated Lot Number;
   last data-entry step before output generation (Step 8).
7. **External systems involved:** none. No e-signature platform (e.g.
   DocuSign) or identity verification; signatures are raw ink on a canvas.
8. **Current manual work performed by the user:** physically drawing two
   signatures on a touch/mouse canvas, typing both representative names.
9. **Opportunities to reduce user interaction:** none recommended — this
   step should stay high-friction, not low-friction.
10. **Could this step be automated by AI:** no.
11. **Should this step always require human approval:** yes — this is
    the single most important human-approval gate in the whole workflow.
12. **Risk if automated incorrectly:** catastrophic — an automated or
    defaulted signature here would mean the compliance record asserts
    client acceptance that never actually happened: both a fraud risk and
    a total loss of the document's legal value.

---

## Step 8 — Output Generation

1. **Purpose of the step:** assemble all captured data into the final
   printable/emailable Lot Pack document.
2. **User input required:** a single button press — Preview / Print PDF,
   Email Report, or Generate Lot Pack.
3. **Data required:** everything captured in Steps 1–7.
4. **Validation rules:** **none** — any of the three output buttons can be
   pressed at any time regardless of completeness; blank cover fields, no
   diagram, no ball-pen readings, no signatures, and no QVC ticks all
   produce a "valid"-looking PDF with blank sections rather than a
   blocked action.
5. **Outputs:** a browser-rendered print/PDF of the full Lot Pack, or a
   standalone downloadable/shareable `.html` report plus a pre-filled
   `mailto:` draft (Email Report — this produces HTML, not an actual PDF).
6. **Dependencies:** the entire "sync" layer described in
   `docs/PDF_REDRAW_BASELINE.md`; the browser's native print engine.
7. **External systems involved:** none — rendering is 100% client-side.
8. **Current manual work performed by the user:** pressing a button and
   visually eyeballing the result; no system-assisted review.
9. **Opportunities to reduce user interaction:** add a pre-output
   completeness check (missing signatures, no diagram, unticked Hold
   Points, blank cover fields) so the user is warned *before* generating a
   document that will otherwise look complete but isn't.
10. **Could this step be automated by AI:** assembly is already fully
    automated (mechanical, not AI). An AI-assisted completeness/consistency
    review before generation is a realistic near-term addition.
11. **Should this step always require human approval:** no new approval
    beyond Steps 1–7 — pressing the button is an action, not a decision.
12. **Risk if automated incorrectly:** the risk here isn't "automating
    the step" (already automated) — it's the documented print/email
    divergence (two independent code paths silently producing different
    outputs from the same data), which has already caused production bugs
    twice.

---

## Step 9 — Secure Submission & Sync

1. **Purpose of the step:** durably and securely deliver the completed,
   signed Lot Pack to the office/compliance system of record, tolerant of
   field connectivity loss.
2. **User input required:** a single button press — Submit Securely —
   followed by a confirm dialog.
3. **Data required:** the entire form snapshot (every input, checkbox,
   and signature canvas as a base64 PNG), serialized as one record.
4. **Validation rules:** **none at the app layer** beyond the confirm
   dialog. The Supabase layer enforces row-level security (a submission
   must be tied to the authenticated `user_id`) and a
   `client_submission_id` uniqueness constraint (idempotent upsert).
5. **Outputs:** a locked IndexedDB submission record; a row in
   `public.lot_pack_submissions` once uploaded, containing the full form
   snapshot as JSON plus a summary (lot no., customer, job no., site,
   date, worker).
6. **Dependencies:** `offline-core.js` (queue/retry/backoff),
   `cloud-core.js` (`uploadSubmission`), `supabase-setup.sql`
   (schema + RLS), network connectivity (deferred indefinitely if
   offline, with automatic retry).
7. **External systems involved:** Supabase (Postgres + Auth) is the only
   external system in the entire codebase. **No integration with Damstra,
   SAMI, or any aggregate-testing/quarry reporting system exists anywhere
   in this repository.** Also of note: the RLS policies as written scope
   every `select`/`update` to `auth.uid() = user_id` — meaning, as far as
   this repo shows, only the *submitting worker's own login* can read a
   submission back through this schema. There is no visible office/QA
   reviewer role or export path toward a document-management/compliance
   archive system; if office staff receive lot packs some other way today
   (Email Report, a Supabase dashboard, a service-role process outside
   this repo), that isn't represented in the code and should be confirmed
   directly with whoever owns the Supabase project.
8. **Current manual work performed by the user:** one tap plus one
   confirm; otherwise fully automated (queue/retry/backoff/checksum).
9. **Opportunities to reduce user interaction:** none needed on submission
   mechanics themselves (already minimal-friction and durable). The real
   opportunity is upstream, at Step 8's completeness check.
10. **Could this step be automated by AI:** the mechanics are already
    fully automated (durable local queueing, checksum, retry with
    exponential backoff, background-sync registration) — no AI
    opportunity remains here.
11. **Should this step always require human approval:** yes — the confirm
    dialog itself, appropriately, since this locks the record.
12. **Risk if automated incorrectly:** none specific to *further*
    automating this step (already minimal and durable). The real risk is
    the unconfirmed office-visibility gap in Section 7 above — a
    perfectly-submitted lot pack that nobody at the office can retrieve
    through this schema.

---

# Part 2 — Future HUG Workflow

This section describes how the workflow could evolve with AI assistance
**while maintaining 100% accuracy** — meaning no proposal below changes
what the document legally asserts (a witnessed inspection, a physical
measurement, a signed acceptance) without an equivalent human act behind
it. Steps 2 (QVC witnessing), 6 (memo acknowledgement), 7 (final
signatures), and the raw physical-measurement entry in Steps 4–5 remain
human-performed in this future state — not because the technology to
automate them is unavailable, but because automating them would silently
change what the document is legally attesting to. AI's role throughout is
to **prepare, cross-check, and flag** — never to silently decide, tick, or
sign on a human's behalf.

For each proposal: why it's safe, what information the AI needs, the
confidence level required before acting, and whether the user must approve
before continuing.

### 1. AI-assisted job/lot header autofill (Step 1)
- **Why it is safe:** the AI only *proposes* values pulled from an
  existing, already-trusted source record (a project/works-order system);
  it never invents data, and every proposed field remains editable.
- **Information needed:** access to a project/works-order register keyed
  by Job No. or site; today's date/shift to select the correct active job.
- **Confidence level required:** effectively 100% — this is a database
  lookup, not a prediction, so "confidence" means an exact, unambiguous
  match to one job record. Any ambiguity (multiple candidate jobs) must
  fall back to a manual selection, never a guess.
- **User approval before continuing:** yes — the pre-filled header must be
  shown for explicit confirmation before the user moves past Step 1,
  specifically to close the current "stale hardcoded default" risk rather
  than reintroduce a new version of it.

### 2. AI pre-submission completeness & consistency checker (before Step 8/9)
- **Why it is safe:** it only reads already-entered data and produces
  warnings; it cannot alter, submit, or complete anything on the user's
  behalf.
- **Information needed:** the full current form state (all tabs) at the
  moment output is requested.
- **Confidence level required:** deterministic rule-checking (blank
  required-in-practice fields, unticked Hold Points, missing signatures,
  Step 5 warning active with no Step 6 memo filled in, Included Items
  checked with no matching data present) — this doesn't need a
  probabilistic confidence threshold at all, since every check is a
  simple presence/consistency rule, not a judgment call.
- **User approval before continuing:** yes — the check should present a
  clear list of issues and require the user to either fix them or
  explicitly acknowledge and proceed anyway (never silently block or
  silently pass).

### 3. AI-assisted site diagram cleanup (Step 3)
- **Why it is safe:** it replaces manual slider-tuning with an equivalent
  mechanical image-processing outcome (crop + threshold), and the cleaned
  result is always shown to the user before it's finalized — identical
  human-in-the-loop point to today's manual sliders, just with a better
  starting point.
- **Information needed:** the uploaded source image only.
- **Confidence level required:** high (e.g. >90% bounding-box/threshold
  confidence) before auto-applying; below that, fall back to the existing
  manual slider controls rather than guessing.
- **User approval before continuing:** yes — the cleaned diagram must be
  shown for confirmation, exactly as the current preview already requires,
  before it is copied into the print report.

### 4. AI anomaly flagging on physical measurements (Steps 4–5)
- **Why it is safe:** it only flags a reading as "unusual" for human
  re-check; it never edits, discards, or averages differently based on the
  flag — the underlying calculation logic is untouched.
- **Information needed:** the entered value plus a reasonable historical/
  expected range for that test type (e.g. typical canvas mat spread rates
  for the specified product).
- **Confidence level required:** deliberately low threshold for
  *flagging* (better to over-flag and let a human dismiss it) but zero
  authority to act — this is a warning system, not a correction system.
- **User approval before continuing:** yes — a flagged reading requires
  the user to confirm ("yes, that's correct") or correct it; it must never
  silently pass through unexamined.

### 5. AI cross-linking of related compliance signals (Steps 2, 5, 6)
- **Why it is safe:** it only *surfaces* a suggestion (e.g. "Ball
  penetration exceeded 3.0mm — MSF19-1B memo may be required, and QVC Hold
  Point 5 may need review") based on data already entered; it cannot tick
  a checkbox, fill a memo, or capture a signature itself.
- **Information needed:** Step 5's computed averages, Step 2's checklist
  state, Step 6's memo completion state — all already in the form.
- **Confidence level required:** deterministic (the 3.0mm threshold is a
  fixed specification value, not a prediction) — this is rule-based
  linkage, not machine-learned inference.
- **User approval before continuing:** yes — the suggestion must be
  dismissible; the human retains full control over whether the memo/Hold
  Point actually applies to this specific lot's circumstances.

### 6. AI print/email output-consistency verification (Step 8, quality-assurance tooling)
- **Why it is safe:** this runs against the app itself (comparing the
  Preview/Print output to the Email Report output for the same data), not
  against a real lot pack in the field — it's a regression check, not a
  field-facing automation.
- **Information needed:** the rendered output of both code paths for an
  identical test dataset.
- **Confidence level required:** exact-match comparison (byte/field-level
  diff), not a probabilistic score — any difference is a defect by
  definition.
- **User approval before continuing:** not applicable to a live
  submission (this runs in testing/CI, addressed further in
  `docs/PDF_REDRAW_BASELINE.md`), but any detected divergence should block
  a release until a human reviews and resolves it.

---

## Estimated Percentage of Today's Workflow Automatable at 100% Accuracy

**Approximately 30–35% of current user interactions**, and this ceiling
does not move meaningfully even with the Future HUG Workflow proposals
above, because those proposals are mostly about **making the existing
30–35% faster and safer** (autofill, completeness checks, cross-linking)
rather than expanding what's automatable. The remaining ~65–70% is
structurally bound to:
- physically witnessing 32 regulatory checklist points (Step 2),
- taking physical measurements with field equipment (Steps 4–5),
- and producing legally binding human signatures (Steps 6–7).

None of these can be automated without changing what the Lot Pack
legally asserts, so — by the explicit "100% accuracy" constraint — they
stay outside the automatable percentage regardless of how capable the AI
becomes.

---

## Top 10 Opportunities for Automation, Ranked by Impact

1. **Pre-submission completeness/consistency checker** (Step 8/9) — highest
   impact because it directly prevents defective or inconsistent lot
   packs from being generated at all, closing the biggest gap identified
   in this review (zero validation anywhere in the form today).
2. **Auto-link Step 5's >=3.0mm warning → Step 6's MSF19-1B memo → Step
   2's QVC Hold Point 5** — closes a real, currently-silent compliance gap
   where three related signals exist but nothing connects them.
3. **Header/job data autofill from a project/works-order master record**
   (Step 1) — removes both the repetitive retyping and the stale
   hardcoded-default risk in one change.
4. **Fix or remove the dead Temperature Correction fields** (Step 5) — low
   effort, closes a data-integrity gap where users believe a correction is
   applied when it is silently discarded.
5. **Enforce "Included Items" checkboxes against actual attached data**
   (Steps 1, 3) — e.g. "Site Diagram" checked but no diagram image
   present.
6. **AI-assisted site diagram auto-crop/clean** (Step 3) — removes manual
   4-slider tuning per upload.
7. **Connected-scale/telemetry capture for canvas mat and loose density
   masses** (Step 4) — removes hand-transcription risk on the values with
   the least existing validation; a hardware integration, highest-value
   long-term item.
8. **Automated print vs. email output-consistency check** (quality
   tooling around Step 8) — directly protects against the historical bug
   class already documented in `docs/PDF_REDRAW_BASELINE.md`.
9. **Carry forward previous lot's Agg Source/Size/DL constants within the
   same job**, with a one-tap confirm rather than full retyping (Step 1,
   4).
10. **Resolve the Supabase RLS office-visibility question** (Step 9) — not
    an AI/automation item per se, but the highest-impact *process* fix
    available, since it determines whether completed lot packs are
    actually reaching anyone downstream today.

## Top 10 Risks That Could Cause Incorrect Lot Packs

1. **Stale hardcoded default values** (Job No./Customer/Site/Date/
   Product) submitted unchanged because nothing forces the user to
   overwrite them.
2. **Zero field validation anywhere in the form** — blank Job/Customer/
   Site, unsigned sign-off, or an empty diagram can all be "successfully"
   submitted as if complete.
3. **QVC Hold Points left unticked with no gate** — a lot pack can be
   generated and submitted with none of the 32 checklist rows completed.
4. **Ball penetration warning is only a visual banner** — nothing forces
   the required memo or approval when an average reaches 3.0mm.
5. **Dead Temperature Correction fields** create false confidence that a
   correction is being applied when the entered values are discarded.
6. **Print vs. Email divergence** — two independently-maintained sync code
   paths can produce different documents from identical underlying data.
7. **An AI image-cleanup step (if introduced) auto-cropping or distorting
   real site detail** without a mandatory human preview/confirm step.
8. **An AI autofill step (if introduced) pulling the wrong job/lot** from
   a project record without requiring explicit user confirmation.
9. **A sensor/telemetry auto-capture malfunction** (if introduced)
   inserting a plausible-looking but wrong mass/temperature/reading with
   no human check — more dangerous than a missing value because it looks
   trustworthy.
10. **The unresolved Supabase RLS office-visibility gap** — a lot pack
    could be durably and correctly submitted by the field worker yet be
    unreachable by whoever is supposed to review or file it, with no
    error surfaced anywhere in the process.

---

*No production code was modified to produce this document.*
