// Supabase Edge Function: notify-lot-pack-submission
//
// Fired by a Database Webhook on INSERT into public.lot_pack_submissions.
// Builds a branded PDF of the full submitted Lot Pack (every field plus
// signatures and the site diagram) and emails it via Resend to whoever is
// configured in the NOTIFY_EMAIL_TO secret, then marks the row as emailed
// so it's never sent twice.
//
// Required secrets (Project Settings -> Edge Functions -> Secrets):
//   RESEND_API_KEY   - API key from resend.com
//   NOTIFY_EMAIL_TO  - comma-separated recipient address(es)
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by
// Supabase to every Edge Function; nothing to configure for those.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'npm:pdf-lib@1.17.1';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const NOTIFY_EMAIL_TO = Deno.env.get('NOTIFY_EMAIL_TO') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const LOGO_URL = 'https://hub-bot24.github.io/Colas-LoT-pack---V1/colas_logo.png';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_BOTTOM = 64;
const BANNER_HEIGHT = 50;
const TABLE_WIDTH = PAGE_WIDTH - MARGIN * 2;
const NAVY = rgb(0, 0.19, 0.34);
const LIGHT_GREY = rgb(0.95, 0.96, 0.97);
const BORDER_GREY = rgb(0.8, 0.82, 0.86);
const LABEL_GREY = rgb(0.4, 0.45, 0.5);
const TEXT_DARK = rgb(0.08, 0.1, 0.14);

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

// Keys the app generates for unlabeled inputs (offline-core.js: 'field-' + index).
// These are unrelated positional placeholders, not repeated measurements, so they
// must never be grouped into a table even if they happen to end in a number.
function isFallbackKey(key: string): boolean {
  return /^field-\d+$/i.test(key);
}

// Defense in depth: never let a login credential reach an email or PDF, even if
// an older cached submission (from before the client-side fix) still has one.
function isSensitiveKey(key: string): boolean {
  return /password|passcode|lotpackauth/i.test(key);
}

// Detects "Base N" style labels (e.g. "A 1", "Vol 2") so repeated readings of the
// same measurement render as one table with a column per reading, not N separate rows.
function splitBaseIndex(label: string): { base: string; index: string } | null {
  const match = label.match(/^(.+?)\s+(\d+)$/);
  if (!match) return null;
  return { base: match[1].trim(), index: match[2] };
}

type RenderItem =
  | { type: 'single'; label: string; value: string }
  | { type: 'group'; base: string; columns: { index: string; value: string }[] };

function buildRenderItems(fields: Record<string, unknown>): RenderItem[] {
  const items: RenderItem[] = [];
  const groupIndexByBase = new Map<string, number>();

  for (const [key, data] of Object.entries(fields)) {
    const value = fieldDisplayValue(data);
    if (!value || isSensitiveKey(key)) continue;

    if (isFallbackKey(key)) {
      items.push({ type: 'single', label: humanizeKey(key), value });
      continue;
    }

    const label = humanizeKey(key);
    const split = splitBaseIndex(label);
    if (!split) {
      items.push({ type: 'single', label, value });
      continue;
    }

    const existingIdx = groupIndexByBase.get(split.base);
    if (existingIdx === undefined) {
      groupIndexByBase.set(split.base, items.length);
      items.push({ type: 'group', base: split.base, columns: [{ index: split.index, value }] });
    } else {
      const existing = items[existingIdx];
      if (existing.type === 'group') existing.columns.push({ index: split.index, value });
    }
  }

  // A "group" of exactly one reading isn't a table, it's just a normal field.
  return items.map(item => {
    if (item.type === 'group' && item.columns.length === 1) {
      return { type: 'single', label: `${item.base} ${item.columns[0].index}`, value: item.columns[0].value } as RenderItem;
    }
    return item;
  });
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

let cachedLogoBytes: Uint8Array | null | undefined;
async function getLogoBytes(): Promise<Uint8Array | null> {
  if (cachedLogoBytes !== undefined) return cachedLogoBytes;
  try {
    const res = await fetch(LOGO_URL);
    cachedLogoBytes = res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch (_error) {
    cachedLogoBytes = null;
  }
  return cachedLogoBytes;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = String(text || '').split(' ');
  let line = '';
  const lines: string[] = [];
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

async function buildLotPackPdf(record: Record<string, unknown>): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let logoImage: PDFImage | null = null;
  const logoBytes = await getLogoBytes();
  if (logoBytes) {
    try { logoImage = await pdfDoc.embedPng(logoBytes); } catch (_error) { logoImage = null; }
  }

  let page: PDFPage;
  let y = 0;

  function drawBanner(target: PDFPage) {
    target.drawRectangle({ x: 0, y: PAGE_HEIGHT - BANNER_HEIGHT, width: PAGE_WIDTH, height: BANNER_HEIGHT, color: NAVY });
    let textX = MARGIN;
    if (logoImage) {
      const logoHeight = BANNER_HEIGHT - 18;
      const logoWidth = (logoImage.width / logoImage.height) * logoHeight;
      target.drawImage(logoImage, { x: MARGIN, y: PAGE_HEIGHT - BANNER_HEIGHT + 9, width: logoWidth, height: logoHeight });
      textX = MARGIN + logoWidth + 14;
    }
    target.drawText('COLAS', { x: textX, y: PAGE_HEIGHT - 22, size: 15, font: boldFont, color: rgb(1, 1, 1) });
    target.drawText('Lot Pack — Submission Record', { x: textX, y: PAGE_HEIGHT - 37, size: 9, font, color: rgb(0.82, 0.88, 0.94) });
  }

  function startPage(): PDFPage {
    const newPageRef = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawBanner(newPageRef);
    y = PAGE_HEIGHT - BANNER_HEIGHT - 26;
    return newPageRef;
  }

  page = startPage();

  function ensureSpace(needed: number) {
    if (y - needed < CONTENT_BOTTOM) page = startPage();
  }

  function sectionHeading(text: string) {
    ensureSpace(30);
    page.drawRectangle({ x: MARGIN, y: y - 20, width: TABLE_WIDTH, height: 22, color: LIGHT_GREY, borderColor: BORDER_GREY, borderWidth: 0.75 });
    page.drawText(text, { x: MARGIN + 8, y: y - 14, size: 11, font: boldFont, color: NAVY });
    y -= 32;
  }

  function drawKeyFactsCard(pairs: [string, string][]) {
    const boxPaddingX = 12;
    const boxPaddingY = 12;
    const colWidth = TABLE_WIDTH / 2;
    const rows = Math.ceil(pairs.length / 2);
    const rowHeight = 30;
    const boxHeight = rows * rowHeight + boxPaddingY * 2;
    ensureSpace(boxHeight + 10);
    const boxTop = y;
    page.drawRectangle({ x: MARGIN, y: boxTop - boxHeight, width: TABLE_WIDTH, height: boxHeight, color: LIGHT_GREY, borderColor: BORDER_GREY, borderWidth: 1 });
    pairs.forEach(([label, rawValue], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = MARGIN + boxPaddingX + col * colWidth;
      const rowY = boxTop - boxPaddingY - 12 - row * rowHeight;
      let value = rawValue || 'N/A';
      if (value.length > 42) value = `${value.slice(0, 41)}…`;
      page.drawText(label.toUpperCase(), { x, y: rowY, size: 7, font: boldFont, color: LABEL_GREY });
      page.drawText(value, { x, y: rowY - 13, size: 10.5, font, color: TEXT_DARK });
    });
    y = boxTop - boxHeight - 18;
  }

  const LABEL_COL_WIDTH = 170;
  const VALUE_COL_WIDTH = TABLE_WIDTH - LABEL_COL_WIDTH;
  const ROW_PADDING = 6;
  const ROW_LINE_HEIGHT = 11;

  function drawTableRow(label: string, value: string, shade: boolean) {
    const labelLines = wrapText(label, boldFont, 8.5, LABEL_COL_WIDTH - ROW_PADDING * 2);
    const valueLines = wrapText(value, font, 8.5, VALUE_COL_WIDTH - ROW_PADDING * 2);
    const lineCount = Math.max(labelLines.length, valueLines.length);
    const rowHeight = lineCount * ROW_LINE_HEIGHT + ROW_PADDING * 2;
    ensureSpace(rowHeight);
    const rowTop = y;
    page.drawRectangle({
      x: MARGIN, y: rowTop - rowHeight, width: TABLE_WIDTH, height: rowHeight,
      color: shade ? LIGHT_GREY : rgb(1, 1, 1), borderColor: BORDER_GREY, borderWidth: 0.75
    });
    page.drawLine({
      start: { x: MARGIN + LABEL_COL_WIDTH, y: rowTop }, end: { x: MARGIN + LABEL_COL_WIDTH, y: rowTop - rowHeight },
      thickness: 0.75, color: BORDER_GREY
    });
    labelLines.forEach((line, i) => page.drawText(line, {
      x: MARGIN + ROW_PADDING, y: rowTop - ROW_PADDING - 9 - i * ROW_LINE_HEIGHT, size: 8.5, font: boldFont, color: NAVY
    }));
    valueLines.forEach((line, i) => page.drawText(line, {
      x: MARGIN + LABEL_COL_WIDTH + ROW_PADDING, y: rowTop - ROW_PADDING - 9 - i * ROW_LINE_HEIGHT, size: 8.5, font, color: TEXT_DARK
    }));
    y = rowTop - rowHeight;
  }

  function drawGroupTable(base: string, columns: { index: string; value: string }[], shade: boolean) {
    const sorted = [...columns].sort((a, b) => Number(a.index) - Number(b.index));
    const groupLabelWidth = LABEL_COL_WIDTH;
    const colsWidth = TABLE_WIDTH - groupLabelWidth;
    const colWidth = colsWidth / sorted.length;
    const headerHeight = 14;
    const valueHeight = 20;
    const totalHeight = headerHeight + valueHeight;
    ensureSpace(totalHeight);
    const top = y;
    const bg = shade ? LIGHT_GREY : rgb(1, 1, 1);

    page.drawRectangle({ x: MARGIN, y: top - totalHeight, width: TABLE_WIDTH, height: totalHeight, color: bg, borderColor: BORDER_GREY, borderWidth: 0.75 });
    page.drawLine({ start: { x: MARGIN + groupLabelWidth, y: top }, end: { x: MARGIN + groupLabelWidth, y: top - totalHeight }, thickness: 0.75, color: BORDER_GREY });
    page.drawText(base, { x: MARGIN + ROW_PADDING, y: top - totalHeight / 2 - 4, size: 8.5, font: boldFont, color: NAVY });

    sorted.forEach((col, i) => {
      const x = MARGIN + groupLabelWidth + i * colWidth;
      if (i > 0) {
        page.drawLine({ start: { x, y: top }, end: { x, y: top - totalHeight }, thickness: 0.5, color: BORDER_GREY });
      }
      page.drawLine({ start: { x, y: top - headerHeight }, end: { x: x + colWidth, y: top - headerHeight }, thickness: 0.5, color: BORDER_GREY });
      page.drawText(`Test ${col.index}`, { x: x + 4, y: top - headerHeight + 3, size: 6.5, font: boldFont, color: LABEL_GREY });
      const valueLines = wrapText(col.value, font, 8, colWidth - 8);
      page.drawText(valueLines[0] || '', { x: x + 4, y: top - headerHeight - 13, size: 8, font, color: TEXT_DARK });
    });

    y = top - totalHeight;
  }

  const summary = (record.summary || {}) as Record<string, unknown>;
  const str = (v: unknown) => (v ? String(v) : '');
  drawKeyFactsCard([
    ['Lot No', str(summary.lotNo)],
    ['Customer', str(summary.customer)],
    ['Job No', str(summary.jobNo)],
    ['Site Location', str(summary.siteLocation)],
    ['Work Date', str(summary.workDate)],
    ['Submitted By', str(summary.worker)],
    ['Received At', str(record.received_at)],
    ['Submission ID', str(record.id)]
  ]);

  const payload = (record.payload || {}) as Record<string, unknown>;
  const snapshot = (payload.snapshot || {}) as Record<string, unknown>;
  const fields = (snapshot.fields || {}) as Record<string, unknown>;
  const renderItems = buildRenderItems(fields);

  if (renderItems.length) {
    sectionHeading('Full Form Details');
    renderItems.forEach((item, i) => {
      const shade = i % 2 === 1;
      if (item.type === 'group') drawGroupTable(item.base, item.columns, shade);
      else drawTableRow(item.label, item.value, shade);
    });
  }

  const canvases = (snapshot.canvases || {}) as Record<string, unknown>;
  const imageEntries = Object.entries(canvases).filter(
    ([, dataUrl]) => typeof dataUrl === 'string' && (dataUrl as string).startsWith('data:image')
  ) as [string, string][];

  if (imageEntries.length) {
    sectionHeading('Signatures & Site Diagram');
    for (const [key, dataUrl] of imageEntries) {
      let image;
      try {
        image = await pdfDoc.embedPng(dataUrlToBytes(dataUrl));
      } catch (_error) {
        continue;
      }
      const maxWidth = TABLE_WIDTH - 16;
      const scale = Math.min(1, maxWidth / image.width);
      const width = image.width * scale;
      const height = image.height * scale;
      const frameHeight = height + 34;
      ensureSpace(frameHeight);
      const frameTop = y;
      page.drawRectangle({ x: MARGIN, y: frameTop - frameHeight, width: TABLE_WIDTH, height: frameHeight, color: rgb(1, 1, 1), borderColor: BORDER_GREY, borderWidth: 0.75 });
      page.drawText(humanizeKey(key), { x: MARGIN + 8, y: frameTop - 16, size: 9.5, font: boldFont, color: NAVY });
      page.drawImage(image, { x: MARGIN + 8, y: frameTop - frameHeight + 10, width, height });
      y = frameTop - frameHeight - 14;
    }
  }

  const totalPages = pdfDoc.getPageCount();
  pdfDoc.getPages().forEach((p, idx) => {
    p.drawLine({ start: { x: MARGIN, y: CONTENT_BOTTOM - 20 }, end: { x: PAGE_WIDTH - MARGIN, y: CONTENT_BOTTOM - 20 }, thickness: 0.5, color: BORDER_GREY });
    p.drawText(`COLAS Lot Pack  |  Submission ID: ${String(record.id)}`, { x: MARGIN, y: CONTENT_BOTTOM - 32, size: 7, font, color: LABEL_GREY });
    const pageLabel = `Page ${idx + 1} of ${totalPages}`;
    const pageLabelWidth = font.widthOfTextAtSize(pageLabel, 7);
    p.drawText(pageLabel, { x: PAGE_WIDTH - MARGIN - pageLabelWidth, y: CONTENT_BOTTOM - 32, size: 7, font, color: LABEL_GREY });
  });

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
