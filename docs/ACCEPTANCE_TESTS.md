# COLAS QA — Acceptance Tests v1.0

## Offline durability
- Complete a draft offline.
- Close browser.
- Restart phone.
- Reopen offline.
- Confirm all fields, signatures, diagrams, and attachments remain.

## Long-offline retention
- Queue a completed submission.
- Keep device offline for at least seven days during pilot testing.
- Reopen periodically.
- Confirm submission remains queued and unmodified.

## Automatic recovery
- Restore signal.
- Reopen app.
- Confirm upload starts without re-entering data.
- Confirm server receipt returns.

## Duplicate prevention
- Force ten upload retries for the same submission.
- Confirm exactly one server submission exists.
- Confirm retries return the same receipt.

## Attachment integrity
- Upload photos/signatures/diagram.
- Compare server hashes with device hashes.
- Confirm no missing or corrupted files.

## Authentication
- Session persists on the same device.
- Password reset works.
- Disabled user cannot sync.
- Worker cannot read another worker's private records.

## PDF
- Generated PDF matches submitted values.
- Includes document ID, revision, timestamps, user identity, and page numbers.
- PDF hash is stored.

## Email
- Email sends only after PDF creation succeeds.
- Failed delivery retries.
- Delivery status is visible.
- Duplicate upload does not send duplicate emails.

## Audit
- Create, edit, submit, upload, PDF, email, approval, rejection, and revision events are present.

## Production gate
No merge to `main` until all critical tests pass and evidence is recorded.
