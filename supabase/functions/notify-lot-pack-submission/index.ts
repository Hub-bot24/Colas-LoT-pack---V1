// Supabase Edge Function: notify-lot-pack-submission
//
// Fired by a Database Webhook on INSERT into public.lot_pack_submissions.
// Sends an email (via Resend) to whoever is configured in the NOTIFY_EMAIL_TO
// secret, then marks the row as emailed so it's never sent twice.
//
// Required secrets (Project Settings -> Edge Functions -> Secrets):
//   RESEND_API_KEY   - API key from resend.com
//   NOTIFY_EMAIL_TO  - comma-separated recipient address(es)
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by
// Supabase to every Edge Function; nothing to configure for those.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const NOTIFY_EMAIL_TO = Deno.env.get('NOTIFY_EMAIL_TO') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>'"]/g, char => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' } as Record<string, string>
  )[char] as string);
}

function summaryRow(label: string, value: unknown): string {
  return `<tr><td style="padding:4px 10px;font-weight:700;border:1px solid #ddd">${escapeHtml(label)}</td><td style="padding:4px 10px;border:1px solid #ddd">${escapeHtml(value || 'N/A')}</td></tr>`;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  let record: Record<string, unknown> | null = null;
  try {
    const payload = await req.json();
    record = payload?.record ?? payload?.new ?? null;
  } catch (_error) {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), { status: 400 });
  }

  if (!record || !record.id) {
    return new Response(JSON.stringify({ error: 'Webhook payload did not include a submission record' }), { status: 400 });
  }

  if (!RESEND_API_KEY || !NOTIFY_EMAIL_TO) {
    console.error('notify-lot-pack-submission: missing RESEND_API_KEY or NOTIFY_EMAIL_TO secret');
    return new Response(JSON.stringify({ error: 'Email notification is not configured' }), { status: 500 });
  }

  const summary = (record.summary || {}) as Record<string, unknown>;
  const lotOrJob = summary.lotNo || summary.jobNo || 'Lot Pack';
  const subject = `Lot Pack submitted — ${lotOrJob}`;
  const html = `
    <h2 style="margin:0 0 12px">A Lot Pack has been submitted</h2>
    <table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">
      ${summaryRow('Lot No', summary.lotNo)}
      ${summaryRow('Customer', summary.customer)}
      ${summaryRow('Job No', summary.jobNo)}
      ${summaryRow('Site Location', summary.siteLocation)}
      ${summaryRow('Work Date', summary.workDate)}
      ${summaryRow('Submitted By', summary.worker)}
      ${summaryRow('Received At', record.received_at as string)}
    </table>
    <p style="color:#666;font-size:12px;margin-top:14px">Submission ID: ${escapeHtml(record.id)}</p>
  `;

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'COLAS Lot Pack <onboarding@resend.dev>',
      to: NOTIFY_EMAIL_TO.split(',').map(address => address.trim()).filter(Boolean),
      subject,
      html
    })
  });

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    console.error('notify-lot-pack-submission: Resend API error', resendResponse.status, errorText);
    return new Response(JSON.stringify({ error: `Resend API error: ${resendResponse.status}` }), { status: 502 });
  }

  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase
      .from('lot_pack_submissions')
      .update({ status: 'emailed', emailed_at: new Date().toISOString() })
      .eq('id', record.id);
    if (error) console.error('notify-lot-pack-submission: failed to mark row as emailed', error);
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
