# Delivery Plan

## Milestone 0 — Protected baseline

- Keep `main` stable.
- Establish V2 branch and architecture contracts.

## Milestone 1 — Modular client foundation

- Extract auth, offline storage, queue, calculations, and UI status into modules.
- Add automated data round-trip tests.
- Preserve current form behaviour.

## Milestone 2 — Idempotent cloud receipt

- Implement versioned submission API.
- Add unique client submission ID and checksum rules.
- Add server-side validation and audit events.

## Milestone 3 — Attachments

- Chunk-safe attachment persistence and upload.
- Server confirmation and integrity checks.

## Milestone 4 — Controlled PDF and email

- Generate controlled PDF on the server.
- Store final PDF.
- Deliver through approved mail provider.
- Track delivery status and retries.

## Milestone 5 — Manager workflow

- Review, return, approve, lock, reopen with reason.
- Search and status dashboard.

## Milestone 6 — Pilot and hardening

- Controlled field pilot.
- Offline endurance tests.
- Security review.
- Recovery drills.
- Production release decision.
