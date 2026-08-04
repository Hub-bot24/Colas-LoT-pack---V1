# PDF Baseline Reference

This folder holds the **visual reference PDF** for the current, working
Lot Pack print/PDF redraw system, described in
`docs/PDF_REDRAW_BASELINE.md` and verified using
`docs/PDF_REDRAW_TEST_CHECKLIST.md`.

## What needs to go here

A fully completed sample Lot Pack PDF must be added to this folder
**manually** — every field on every tab filled in with realistic sample
data, both signature boxes signed, and a real site diagram uploaded and
cleaned, then generated using the app's own **Preview / Print PDF** flow
and saved as a PDF from the browser's print dialog.

Suggested filename: `pdf-baseline/lot-pack-baseline-YYYY-MM-DD.pdf`
(date of capture), plus a short note in this README (or a sibling file)
recording which browser/OS produced it, since the PDF output comes from
the browser's native print engine and can vary slightly between browsers
(see `docs/PDF_REDRAW_BASELINE.md`, Known Risks #7).

## Why this exists

- It is the **ground truth** for what the printed Lot Pack currently looks
  like. Nothing in this repository generates a PDF programmatically — the
  browser's print-to-PDF feature does, so the only reliable way to know
  "did this refactor change the output" is to compare a newly generated PDF
  against this stored reference, page by page.
- It protects the team from a refactor that reads correctly in code review
  but subtly changes real output (a field goes missing, a page break moves,
  a calculation rounds differently, a signature stops rendering).

## Rule for future changes

**No refactor of the print/PDF redraw system may be merged unless its
output has been compared against the baseline PDF stored here**, using the
checklist in `docs/PDF_REDRAW_TEST_CHECKLIST.md`. If the refactor
intentionally changes the output, replace the baseline PDF with an
approved new one and note what changed and why, in the same change.
