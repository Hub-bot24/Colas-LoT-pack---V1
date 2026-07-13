# COLAS Lot Pack v125 — Login + Cloud Foundation

This version adds:

- Supabase email/password login
- Persistent login sessions on the phone
- Offline IndexedDB draft saving
- Offline submission queue
- Automatic upload to Supabase after reception returns
- Worker ownership recorded against each submission
- Row Level Security setup SQL

## Required one-time setup

1. In Supabase open **SQL Editor**.
2. Create a new query.
3. Paste the complete contents of `supabase-setup.sql`.
4. Click **Run**.
5. In **Authentication → Providers → Email**, confirm email/password login is enabled.
6. Upload every file in this package to the GitHub repository root.

## Testing

1. Open the deployed site online.
2. Create a test account or sign in.
3. Complete a small test pack.
4. Turn off reception and make another change.
5. Submit while offline.
6. Restore reception and reopen the app.
7. In Supabase open **Table Editor → lot_pack_submissions** and confirm the row appears.

## Not included yet

- PDF generation on the server
- Automatic email delivery
- Admin/manager roles
- Attachments in Supabase Storage
- Approval dashboard

The browser contains only the publishable key. Never put a Supabase secret key, database password, or email password in this repository.
