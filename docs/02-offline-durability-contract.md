# Offline Durability Contract

This is a release-blocking contract.

## Local persistence

- Every meaningful field change is persisted to IndexedDB.
- Signatures, drawings, and attachments are persisted separately as binary blobs rather than embedded repeatedly in one giant record.
- Save operations are transactional where browser support permits.
- Drafts and queued submissions have schema versions and migration support.
- A completed submission is copied into an immutable local queue record before any upload attempt.

## Queue lifecycle

`draft -> locally_submitted -> uploading -> server_received -> server_validated -> delivered`

Failure states do not delete data. They retain the local record with retry metadata.

## Deletion rule

A queued local submission must not be deleted until all of the following are true:

1. The server returned a durable submission ID.
2. The server confirmed payload validation.
3. Required attachments were confirmed stored.
4. The server recorded the client submission ID and checksum.

Even after confirmation, the device retains a configurable local receipt/history record.

## Retry rules

- Retry on app start.
- Retry on browser `online` events.
- Retry while the app remains open using capped backoff.
- Permit explicit **Send now**.
- Never stop permanently after an arbitrary number of attempts.
- Reuse the same client submission ID on every attempt.

## Duplicate protection

- Each submission receives a UUID on the device.
- The server enforces a unique constraint on client submission ID.
- The payload checksum is stored and compared.
- Repeated retries return the existing server record rather than creating another submission.

## Storage risk controls

A browser/PWA cannot survive device loss, factory reset, physical failure, or deliberate clearing of site data. The product must therefore provide:

- Persistent-storage request where supported
- Visible unsent-count warning
- Storage-health checks
- Backup export and restore
- Clear operational warnings while submissions remain unsent
- Future native wrapper assessment if corporate risk requires stronger device-level guarantees
