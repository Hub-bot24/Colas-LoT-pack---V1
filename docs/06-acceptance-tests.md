Release Acceptance Tests
Offline survival
Complete a representative Lot Pack offline.
Close the browser/app.
Restart the phone.
Reopen while still offline.
Verify all fields, calculations, signatures, diagrams, and attachments are intact.
Repeat after an extended offline period.
Queue durability
Submit offline.
Verify immutable queued copy and visible pending count.
Force-close and restart.
Verify submission is still queued.
Reconnection
Restore connectivity.
Verify automatic retry.
Verify server receipt without user re-entry.
Verify local record is not removed before server acknowledgement.
Duplicate prevention
Interrupt upload repeatedly.
Press Send now multiple times.
Reopen the app during sync.
Confirm exactly one server submission exists for the client submission ID.
Attachment integrity
Upload photos, signature images, and site diagram.
Confirm byte size and checksum match server copies.
PDF
Confirm generated PDF matches approved form requirements.
Confirm formulas, values, signatures, page numbering, revision, and attachment register.
Email
Confirm email is sent only after server validation.
Confirm recipient, subject, metadata, PDF, and cloud link.
Simulate mail failure and verify retry without duplicate submission.
Security
Worker cannot read another worker's records.
Worker cannot approve a record.
Unauthenticated access is denied.
Approved records cannot be silently altered.
No production merge is allowed while any critical test fails.
