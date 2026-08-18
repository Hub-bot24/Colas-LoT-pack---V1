# Set up automatic "Lot Pack submitted" emails

Today, submitting a Lot Pack saves it safely on the phone and uploads it to Supabase — but nothing emails you. This adds that: the moment a submission lands in Supabase, an email goes out automatically.

The function code is already in this repo at `supabase/functions/notify-lot-pack-submission/index.ts`. You just need to deploy it and connect it, all from the Supabase dashboard (no command line needed).

## 1. Get a Resend API key
1. Go to resend.com and sign up (use jdhugoaus@gmail.com for now).
2. In the Resend dashboard, go to **API Keys** → **Create API Key** → copy the key (starts with `re_`).
3. Note: until you verify your own domain in Resend, it can only deliver mail to the address you signed up with. That's fine for now since you're using your own inbox — later, verify your work domain in Resend and you can send to any address.

## 2. Deploy the Edge Function
1. In the Supabase dashboard for **COLAS Lot Pack**, open **Edge Functions** → **Open Editor** (or **Via Editor**).
2. Name the function `notify-lot-pack-submission`.
3. Paste in the full contents of `supabase/functions/notify-lot-pack-submission/index.ts` from this repo, replacing the boilerplate.
4. Click **Deploy**.

## 3. Add the two secrets
Still in **Edge Functions**, find **Secrets** (or **Project Settings → Edge Functions → Secrets**) and add:
- `RESEND_API_KEY` = the key you copied in step 1
- `NOTIFY_EMAIL_TO` = `jdhugoaus@gmail.com` (comma-separate multiple addresses later, e.g. `you@colas.com,manager@colas.com`)

You do **not** need to add `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` — Supabase injects those automatically into every Edge Function.

## 4. Wire it to fire on every submission
1. Go to **Database** → **Webhooks** → **Create a new webhook**.
2. Name: `notify-lot-pack-submission`.
3. Table: `lot_pack_submissions`.
4. Events: tick **Insert** only.
5. Type: **Supabase Edge Functions**.
6. Edge Function: pick `notify-lot-pack-submission` from the dropdown (Supabase auto-fills the auth header — you don't type anything).
7. Click **Create webhook**.

## 5. Test it
Submit a test Lot Pack from the app while online. Within a few seconds you should get an email at the address in `NOTIFY_EMAIL_TO`. If nothing arrives:
- Check **Edge Functions → notify-lot-pack-submission → Logs** in Supabase for the error.
- Check **Database → Webhooks → notify-lot-pack-submission → Logs** to confirm the webhook actually fired.
- Common cause: a typo in `RESEND_API_KEY`, or `NOTIFY_EMAIL_TO` not set.

## Changing the recipient later
Edit the `NOTIFY_EMAIL_TO` secret in Supabase (Edge Functions → Secrets) — no code change, no redeploy, no git commit needed. New submissions immediately use the new address.

## Important: this only fires when the phone is back online
A crew member's phone stores every completed Lot Pack safely offline and keeps retrying until it successfully reaches Supabase (see `README.md`). The email only sends at that point — "done" means "the office's server actually received it," not "the crew member tapped Submit." That's intentional: it's the same moment the data becomes safe outside the phone, so the email is a reliable signal that nothing was lost.
