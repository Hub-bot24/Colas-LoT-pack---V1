Target Architecture
Client application
Installable PWA
Modular TypeScript/JavaScript application
IndexedDB repository layer
Offline queue and sync coordinator
Form engine and calculation engine
Attachment manager
Auth/session manager
Submission status UI
Backend
Supabase provides:
Authentication
PostgreSQL database
Row Level Security
Object storage
Edge Functions for trusted server operations
Trusted server operations
The browser must not contain mail-provider secrets, service-role credentials, or privileged approval logic.
Server functions perform:
Submission validation
Idempotent receipt
Attachment finalisation
Controlled PDF generation
Email delivery
Delivery retry and error recording
Audit-event creation
Data flow
Worker edits a draft locally.
Client continuously writes structured data to IndexedDB.
Worker submits; client freezes a versioned queue payload.
If offline, the queue remains local.
When online, the authenticated client sends the same client submission ID.
Server validates and upserts idempotently.
Server stores attachments and generates the controlled PDF.
Server sends the delivery email.
Server returns durable status.
Client records the receipt and keeps local history.
Migration principle
The existing form and formulas are preserved while responsibilities are extracted incrementally. No big-bang rewrite may replace production before parity tests pass.
