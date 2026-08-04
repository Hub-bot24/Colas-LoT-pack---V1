# PDF Redraw Test Checklist

Use this checklist to verify that the printed/emailed Lot Pack output is
**unchanged** after any code change, however small. It is written for a
human tester comparing a freshly-generated PDF against the reference PDF in
`test-assets/pdf-baseline/`. See `docs/PDF_REDRAW_BASELINE.md` for the
technical explanation of how each item is produced.

## How to test
1. Open `index.html` (or the deployed app) in the **same browser/OS** used
   to create the baseline PDF, if at all possible (see baseline risk #7).
2. Fill in every field on every tab with realistic, non-blank sample data —
   or load the same sample data used for the stored baseline, if available.
3. Draw a signature in every signature box, and upload/crop/clean a sample
   site diagram.
4. Click **Preview / Print PDF**, and separately test **Generate Lot Pack**
   and **Email Report** — they are independent code paths and can diverge
   (see baseline risk #2).
5. Print to PDF (or use the generated file) and compare page-by-page against
   `test-assets/pdf-baseline/`.
6. Tick every box below. Any unchecked/failed box means the refactor is not
   safe to merge yet.

For every item: check it is (a) **present**, (b) showing the **correct
value** from the form, (c) in the **same position/format** as the baseline.

---

### General information
- [ ] Lot Conformance Report title and MSF28-6b form reference are present
- [ ] Client / Customer name
- [ ] Job No.
- [ ] Site Location
- [ ] Existing Surface
- [ ] QA Conducted By / Prepared By
- [ ] Work date, formatted DD/MM/YYYY
- [ ] Shift (Day/Night) shown correctly
- [ ] Notes / lot notes field
- [ ] Colas logo appears once per relevant page (not duplicated, not missing)

### Lot number
- [ ] Generated Lot No. matches the pattern `YYMMDD-Shift-Job-Product[-Count]`
- [ ] Lot No. is identical everywhere it appears (`lotNoTop`, `lotNoSite`,
      `lotNoFinal`, every `.printLotNo`, `v113_final_lot`, site diagram
      header, MSF19 memo headers)
- [ ] Lot Count for Day, if blank, correctly omits the trailing `-count`
      segment (per `updateLotNo`)
- [ ] Changing Job No./Product/Date/Shift on the form updates the printed
      Lot No. after re-running Preview/Print

### Seal design values
- [ ] Product / seal type
- [ ] Aggregate source, size, and volume
- [ ] Area (m²)
- [ ] Conformed By / Conformed Date

### QVC checkboxes
- [ ] All 32 QVC rows from the `qvcItems` list are present with correct
      item numbers and descriptions (Hold Points, Witness Points, Check
      Items)
- [ ] Each of the 3 QVC checkbox columns reflects the checked/unchecked
      state from the live form (☑ vs ☐)
- [ ] QVC header fields (date, client, contract/job no., site location)
      match the cover page values

### Aggregate details
- [ ] Aggregate source
- [ ] Aggregate size
- [ ] Aggregate volume
- [ ] "Included in this lot" checkboxes reflect live form state (✓ vs blank)

### Bitumen details
- [ ] Product
- [ ] Bitumen (litres)
- [ ] Kerosene (litres)
- [ ] Additive (litres)
- [ ] Total Litres = bitumen + kerosene + additive, rounded to nearest
      whole number, and matches both the on-screen calculated value and the
      printed value

### Spray sheet number
- [ ] Spray Sheet No. field is present and correct on the cover/lot page

### Canvas mat calculations
- [ ] All 3 canvas mat test rows present
- [ ] M1 (mass canvas mat + aggregate) correct per row
- [ ] M2 (mass canvas mat) correct per row
- [ ] A (area of canvas mat) correct per row
- [ ] R1 = (M1 − M2) / A, rounded to 3 decimals, correct per row
- [ ] DL (design/reference density) correct per row
- [ ] R2 = round(1000 × DL / R1), correct per row
- [ ] Rows with missing/zero M1, M2, or A correctly show blank R1/R2 (no
      `NaN`, no stale leftover value)
- [ ] Loose aggregate rows (M3, Volume, Loose DL = M3/Vol to 3 decimals) —
      all 3 rows correct, blank when inputs are blank/zero
- [ ] Canvas mat/ball pen header fields (customer, job no., site location,
      quarry source, aggregate size, tested by, test date) correct

### Ball penetration calculations
- [ ] All 12 rows present
- [ ] Chainage and Offset correct per row
- [ ] All 5 penetration readings correct per row
- [ ] Average = mean of non-zero numeric readings, to 1 decimal, correct
      per row
- [ ] Rows with no valid readings show a blank average (not 0, not NaN)
- [ ] Road temperature and penetration time (Pen T/S) correct per row
- [ ] Averages `>= 3.0` are visually flagged (red/fail styling) in print

### Warnings
- [ ] The ">=3.0mm ball penetration" warning banner is shown when at least
      one row's average is `>= 3.0`, and hidden when none are
- [ ] Warning banner text/wording matches the baseline exactly

### Site diagram
- [ ] Uploaded/cropped/cleaned diagram image appears on the full-page site
      diagram sheet (not a placeholder/blank message)
- [ ] Diagram header fields (customer, job, location, lot no., date,
      prepared by) match the cover page
- [ ] North arrow points in the direction selected on the compass dropdown,
      with correct rotation
- [ ] "No diagram" placeholder message shows correctly when no diagram has
      been added (test this explicitly with a blank diagram)
- [ ] Diagram page borders/print styling intact (per commit `02d9c83`)

### Memos
- [ ] MSF19-1B (Excessive Ball Penetration Result) memo text is present and
      unedited when the corresponding condition applies
- [ ] MSF19-1A (Client Instruction Not to Sweep) memo text is present
- [ ] Memo header fields (customer, job no., location) match the cover page
- [ ] Memo client representative name and date fields correct
- [ ] Memo signature images correct (see Signatures below)

### Signatures
- [ ] MSF19-1B (Ball Pen memo) client signature image renders correctly
- [ ] MSF19-1A (Sweep memo) client signature image renders correctly
- [ ] Final Sign Off: Colas signature image renders correctly
- [ ] Final Sign Off: Client signature image renders correctly
- [ ] Blank/uncaptured signature boxes render as empty, not broken image
      icons
- [ ] Signature images are not stretched, cropped, or misaligned compared
      to the baseline
- [ ] Signing on a touchscreen device produces the same printed result as
      signing with a mouse

### Dates
- [ ] Work date (cover, QVC, canvas/ball pen headers) formatted DD/MM/YYYY
- [ ] Conformed date formatted DD/MM/YYYY
- [ ] Memo dates default to work date when left blank, and show the
      user-entered date otherwise, formatted DD/MM/YYYY
- [ ] Final sign-off date behaves the same way
- [ ] Canvas/ball pen "tested by" dates correct

### Page breaks
- [ ] Cover page ends its own page (nothing from the next section bleeds
      onto it)
- [ ] Each checklist section (`.pdfchk-page`) starts on a new page
- [ ] MSF19 memo page and Final Review/Sign Off currently share **one**
      page together (per `V120_QVC_AND_COMBINED_SIGNOFF_FIX`) — confirm
      this is still true, not split apart or merged differently
- [ ] Canvas Mat section is on its own page, separate from Ball Penetration
      (per commit `c9bdb2e`/`31c7822`)
- [ ] No section is cut off mid-table across a page boundary
      (`page-break-inside: avoid` still effective on cards/tables)
- [ ] No unexpected blank pages appear

### Final print layout
- [ ] Page size is A4 portrait
- [ ] Page margins match the baseline (currently 5mm, per
      `index.html:5208` — see baseline risk #5 if this changes)
- [ ] Section header bands (dark blue background, white text) render with
      color in print (not stripped to plain text — `print-color-adjust`
      still effective)
- [ ] Table borders, column widths, and font sizes visually match the
      baseline on every page
- [ ] No editable-only UI (tabs, action buttons, offline status bar, login
      overlay) appears anywhere in the printed output
- [ ] Overall page count matches the baseline for the same sample data
- [ ] Output is visually identical whether produced via **Preview/Print
      PDF**, **Generate Lot Pack**, or (adjusted for the fact that it emits
      HTML instead of a PDF, per baseline risk #2) **Email Report**
