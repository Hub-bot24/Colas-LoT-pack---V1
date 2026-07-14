# COLAS QA — Offline and Sync Specification v1.0

## Local storage
Use IndexedDB, not localStorage, for all structured records and binary attachments.

Local stores:
- `drafts`
- `submissions`
- `attachments`
- `outbox`
- `sync_receipts`
- `audit_events`
- `settings`

## Draft lifecycle
1. Create draft with local UUID.
2. Save every meaningful field change.
3. Save before section changes.
4. Save when the app is backgrounded.
5. Save signatures, diagrams, and attachments immediately.
6. Display last successful local-save time.

## Submission lifecycle
States:
- `draft`
- `validating`
- `queued_offline`
- `uploading`
- `server_received`
- `processing_pdf`
- `email_queued`
- `completed`
- `needs_attention`

On Submit:
1. Validate required fields.
2. Freeze an immutable submission snapshot.
3. Generate `submission_id` and payload hash.
4. Write snapshot to `submissions`.
5. Write outbox job before any network attempt.
6. Attempt upload if online.
7. Retain local copy until receipt validation succeeds.

## Retry policy
Retry forever until confirmed or manually cancelled by an authorised user.

Retry triggers:
- application start
- sign-in/session refresh
- browser `online` event
- periodic retry while app is open
- manual Send Now
- supported background sync

Use exponential backoff with a cap, but never abandon the job.

## Idempotency
Every API request includes:
- `submission_id`
- `payload_hash`
- `schema_version`
- `client_attempt_id`

The server must upsert by `submission_id`, reject conflicting hashes, and return the existing receipt for duplicate retries.

## Local deletion rule
A local queued submission may be archived only after:
- server receipt matches `submission_id`
- server receipt matches `payload_hash`
- all required attachments are acknowledged
- receipt token is saved locally

Even then, keep a local read-only archive for a configurable retention period.

## Weeks without reception
The queue has no expiry. The UI must show:
- pending count
- oldest pending age
- last retry
- last error
- device storage warning
- export backup option

## Device-risk warning
No browser solution can survive device loss, factory reset, or deliberate clearing of website data. For long remote deployments, support encrypted backup export to Files and later import.
