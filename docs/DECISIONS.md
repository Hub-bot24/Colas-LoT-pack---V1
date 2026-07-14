# Architecture Decisions

## ADR-001 — Platform name

**Decision:** The platform is named **COLAS QA**. The first module is **Lot Pack**.

## ADR-002 — Production protection

**Decision:** `main` remains the protected production baseline. Enterprise development occurs on `v2-enterprise-foundation`.

## ADR-003 — Offline-first

**Decision:** Offline durability and recoverability are core architecture constraints, not optional enhancements.

## ADR-004 — Idempotency

**Decision:** Every submission uses a device-generated client submission ID with a server-enforced unique constraint.

## ADR-005 — Trusted operations

**Decision:** PDF generation, email delivery, privileged transitions, and secrets remain server-side.

## ADR-006 — Incremental migration

**Decision:** Preserve existing working form behaviour while extracting modules and replacing infrastructure behind it. No untested big-bang rewrite.
