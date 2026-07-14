Proposed Data Model
Core tables
profiles
user_id
display_name
employee_number
role
active
created_at
updated_at
projects
id
job_number
customer
site_location
active
metadata
lot_packs
id
client_submission_id (unique)
owner_user_id
project_id
lot_number
status
schema_version
payload
payload_checksum
submitted_at
received_at
validated_at
approved_at
locked_at
lot_pack_attachments
id
lot_pack_id
client_attachment_id
object_path
filename
mime_type
byte_size
checksum
upload_status
submission_attempts
id
client_submission_id
user_id
attempted_at
result
error_code
error_message
device_metadata
audit_events
id
entity_type
entity_id
actor_user_id
event_type
event_data
created_at
delivery_jobs
id
lot_pack_id
recipient
status
attempts
last_error
sent_at
Statuses
Draft and submission statuses must be enumerated and controlled. Free-text status values are forbidden.
Versioning
Every payload includes:
app version
form schema version
calculation version
source template revision
