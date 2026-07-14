# COLAS QA — Data Model v1.0

## profiles
- `id uuid` — references auth user
- `email text`
- `display_name text`
- `role text` — worker, supervisor, qa_manager, admin
- `business_unit text`
- `region text`
- `active boolean`
- `created_at timestamptz`
- `updated_at timestamptz`

## projects
- `id uuid`
- `job_number text`
- `customer text`
- `site_location text`
- `status text`
- `created_by uuid`
- `created_at timestamptz`
- `updated_at timestamptz`

## submissions
- `submission_id uuid` — generated on device and immutable
- `module_type text` — initially `lot_pack`
- `owner_user_id uuid`
- `project_id uuid nullable`
- `schema_version integer`
- `status text`
- `device_created_at timestamptz`
- `server_received_at timestamptz nullable`
- `payload jsonb`
- `payload_hash text`
- `revision integer`
- `locked_at timestamptz nullable`
- `approved_at timestamptz nullable`
- `approved_by uuid nullable`
- `created_at timestamptz`
- `updated_at timestamptz`

Unique constraint: `submission_id`.

## attachments
- `id uuid`
- `submission_id uuid`
- `type text` — photo, signature, diagram, spray_sheet, report, other
- `storage_path text`
- `file_name text`
- `mime_type text`
- `size_bytes bigint`
- `sha256 text`
- `uploaded_by uuid`
- `created_at timestamptz`

## audit_events
- `id bigint`
- `submission_id uuid`
- `actor_user_id uuid nullable`
- `event_type text`
- `event_version integer`
- `details jsonb`
- `device_id text nullable`
- `created_at timestamptz`

Audit events are append-only.

## documents
- `id uuid`
- `submission_id uuid`
- `document_type text` — final_pdf, interim_pdf
- `storage_path text`
- `sha256 text`
- `generated_at timestamptz`
- `generator_version text`

## email_deliveries
- `id uuid`
- `submission_id uuid`
- `document_id uuid`
- `recipient text`
- `status text` — queued, sending, sent, failed
- `provider_message_id text nullable`
- `attempt_count integer`
- `last_error text nullable`
- `sent_at timestamptz nullable`
- `created_at timestamptz`
- `updated_at timestamptz`

## approvals
- `id uuid`
- `submission_id uuid`
- `step text`
- `status text`
- `assigned_to uuid nullable`
- `acted_by uuid nullable`
- `comment text nullable`
- `acted_at timestamptz nullable`
- `created_at timestamptz`

## sync_receipts
- `submission_id uuid`
- `payload_hash text`
- `server_received_at timestamptz`
- `receipt_token text`
- `email_status text`
- `pdf_status text`

The device retains the local submission until it receives a valid server receipt for the same `submission_id` and `payload_hash`.
