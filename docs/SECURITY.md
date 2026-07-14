COLAS QA — Security Specification v1.0
Authentication
Supabase Auth
Email/password initially
Persistent sessions with secure refresh
Password reset
Optional Microsoft SSO later
Disabled users cannot sync or access cloud data
Roles
Worker
Supervisor
QA Manager
Administrator
Access model
Workers can create and view their own drafts/submissions.
Supervisors can view assigned teams/projects.
QA Managers can review and approve authorised business units.
Administrators manage users, roles, templates, and configuration.
Row Level Security
RLS must be enabled on every exposed table. No table is considered production-ready without explicit policies and tests.
Secrets
Never store in browser or GitHub:
Supabase secret/service-role key
SMTP/API mail secret
PDF service credentials
database password
Use Edge Function secrets for privileged operations.
Data integrity
Hash payloads and attachments.
Store immutable submission identifiers.
Append-only audit log.
Locked approved submissions require a new revision rather than silent editing.
File security
Private storage buckets
Signed download URLs
Allowed MIME types
File-size limits
Malware scanning pathway for enterprise rollout
Operational security
Rate limiting
Failed-login monitoring
Edge Function logs
Admin action auditing
Regular key rotation
Backup and restore tests
