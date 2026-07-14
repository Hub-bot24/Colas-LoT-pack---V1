COLAS QA — Architecture Specification v1.0
Purpose
COLAS QA is an offline-first field quality platform. The Lot Pack is the first module. The architecture must support large-scale deployment, auditable records, secure user access, durable offline work, controlled PDF generation, and reliable office delivery.
Non-negotiable rules
A completed submission must never be deleted from the device until the server confirms durable receipt.
Every submission uses a globally unique immutable `submission_id`.
Retries must be idempotent: the same submission cannot create duplicates.
Every material change must be recorded in an append-only audit trail.
Browser code must never contain service-role keys, mail credentials, or other privileged secrets.
Final PDFs and emails are generated server-side.
Production changes are merged only after offline recovery, duplicate prevention, security, PDF, and email acceptance tests pass.
`main` remains production. Development continues on `v2-enterprise-foundation`.
Platform components
Worker application
Installable PWA
Authentication
Local IndexedDB database
Draft autosave
Durable submission queue
Attachment/signature/diagram storage
Sync engine
Status and recovery UI
Supabase backend
Authentication
PostgreSQL database
Row Level Security
Object storage
Edge Functions
Audit and operational telemetry
Manager portal
Search and review submissions
Approval/rejection workflow
PDF access
Exceptions and overdue items
User and role administration
Reporting
Delivery services
Server-side PDF generation
Email delivery
Delivery retry and status tracking
Immutable document references
Environments
Production: `main`
Development: `v2-enterprise-foundation`
Future: staging environment before production rollout
Core domains
Identity and access
Projects and jobs
Lot Pack drafts
Submissions
Attachments
Signatures
Audit events
PDFs
Email deliveries
Approvals
Sync telemetry
