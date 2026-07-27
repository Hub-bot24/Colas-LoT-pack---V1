// Supabase Edge Function: notify-lot-pack-submission
//
// Fired by a Database Webhook on INSERT into public.lot_pack_submissions.
// Builds a PDF of the full submitted Lot Pack (every field plus signatures
// and the site diagram) and emails it via Resend to whoever is configured
// in the NOTIFY_EMAIL_TO secret, then marks the row as emailed so it's
// never sent twice.
//
// Required secrets (Project Settings -> Edge Functions -> Secrets):
//   RESEND_API_KEY   - API key from resend.com
//   NOTIFY_EMAIL_TO  - comma-separated recipient address(es)
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by
// Supabase to every Edge Function; nothing to configure for those.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'npm:pdf-lib@1.17.1';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const NOTIFY_EMAIL_TO = Deno.env.get('NOTIFY_EMAIL_TO') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>'"]/g, char => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' } as Record<string, string>
  )[char] as string);
}

function summaryRow(label: string, value: unknown): string {
  return `<tr><td style="padding:4px 10px;font-weight:700;border:1px solid #ddd">${escapeHtml(label)}</td><td style="padding:4px 10px;border:1px solid #ddd">${escapeHtml(value || 'N/A')}</td></tr>`;
}

function humanizeKey(key: string): string {
  return key
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, char => char.toUpperCase())
    .trim() || key;
}

function fieldDisplayValue(data: unknown): string {
  const entry = data as { kind?: string; value?: unknown; checked?: boolean } | null;
  if (!entry) return '';
  if (entry.kind === 'checkbox' || entry.kind === 'radio') {
    if (!entry.checked) return '';
    return entry.value && entry.value !== 'on' ? String(entry.value) : 'Checked';
  }
  if (entry.kind === 'contenteditable') {
    return String(entry.value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return String(entry.value ?? '').trim();
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function buildLotPackPdf(record: Record<string, unknown>): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function newPage() {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  }

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) newPage();
  }

  function drawLine(text: string, opts: { size?: number; bold?: boolean; gap?: number } = {}) {
    const size = opts.size || 11;
    const useFont: PDFFont = opts.bold ? boldFont : font;
    const maxWidth = PAGE_WIDTH - MARGIN * 2;
    const words = text.split(' ');
    let line = '';
    const lines: string[] = [];
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (useFont.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    for (const l of lines) {
      ensureSpace(size + 6);
      page.drawText(l, { x: MARGIN, y, size, font: useFont, color: rgb(0, 0, 0) });
      y -= size + 6;
    }
    y -= opts.gap || 0;
  }

  const summary = (record.summary || {}) as Record<string, unknown>;
  drawLine('COLAS Lot Pack Submission', { size: 18, bold: true, gap: 8 });
  drawLine(`Lot No: ${summary.lotNo || 'N/A'}`, { bold: true });
  drawLine(`Customer: ${summary.customer || 'N/A'}`);
  drawLine(`Job No: ${summary.jobNo || 'N/A'}`);
  drawLine(`Site Location: ${summary.siteLocation || 'N/A'}`);
  drawLine(`Work Date: ${summary.workDate || 'N/A'}`);
  drawLine(`Submitted By: ${summary.worker || 'N/A'}`);
  drawLine(`Received At: ${(record.received_at as string) || ''}`, { gap: 14 });

  drawLine('Full Form Details', { size: 14, bold: true, gap: 6 });
  const payload = (record.payload || {}) as Record<string, unknown>;
  const snapshot = (payload.snapshot || {}) as Record<string, unknown>;
  const fields = (snapshot.fields || {}) as Record<string, unknown>;
  for (const [key, data] of Object.entries(fields)) {
    const value = fieldDisplayValue(data);
    if (!value) continue;
    drawLine(`${humanizeKey(key)}: ${value}`);
  }

  const canvases = (snapshot.canvases || {}) as Record<string, unknown>;
  for (const [key, dataUrl] of Object.entries(canvases)) {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) continue;
    let image;
    try {
      image = await pdfDoc.embedPng(dataUrlToBytes(dataUrl));
    } catch (_error) {
      continue;
    }
    const maxWidth = PAGE_WIDTH - MARGIN * 2;
    const scale = Math.min(1, maxWidth / image.width);
    const width = image.width * scale;
    const height = image.height * scale;
    ensureSpace(height + 30);
    drawLine(humanizeKey(key), { bold: true, gap: 4 });
    ensureSpace(height);
    page.drawImage(image, { x: MARGIN, y: y - height, width, height });
    y -= height + 16;
  }

  return await pdfDoc.save();
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
  const lotOrJob = String(summary.lotNo || summary.jobNo || 'Lot Pack');
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
    <p style="margin-top:14px">The full Lot Pack (every field, signatures, and the site diagram) is attached as a PDF.</p>
    <p style="color:#666;font-size:12px;margin-top:14px">Submission ID: ${escapeHtml(record.id)}</p>
  `;

  const emailBody: Record<string, unknown> = {
    from: 'COLAS Lot Pack <onboarding@resend.dev>',
    to: NOTIFY_EMAIL_TO.split(',').map(address => address.trim()).filter(Boolean),
    subject,
    html
  };

  try {
    const pdfBytes = await buildLotPackPdf(record);
    emailBody.attachments = [{
      filename: `LotPack-${lotOrJob.replace(/[^a-z0-9-_]+/gi, '-')}.pdf`,
      content: bytesToBase64(pdfBytes)
    }];
  } catch (error) {
    console.error('notify-lot-pack-submission: PDF generation failed, sending without attachment', error);
  }

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(emailBody)
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
