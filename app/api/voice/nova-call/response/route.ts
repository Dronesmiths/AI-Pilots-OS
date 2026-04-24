import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase             from '@/lib/mongodb';
import mongoose                      from 'mongoose';

/**
 * POST /api/voice/nova-call/response
 *
 * Twilio posts here after the operator presses a digit.
 * Digit 1 → trigger 3 more SEO page jobs
 * Digit 2 → skip, log decline
 *
 * Writes a call decision record to activityLogs so the War Room
 * can show "Operator approved via phone call."
 */
export async function POST(req: NextRequest) {
  let digit    = '';
  let tenantId = '';
  let keyword  = '';

  try {
    const form = await req.formData();
    digit    = (form.get('Digits')      as string) ?? '';
    tenantId = req.nextUrl.searchParams.get('tenantId') ?? '';
    keyword  = req.nextUrl.searchParams.get('keyword')  ?? '';
  } catch {
    // fallback — some Twilio payloads come as URL-encoded body
    const text = await req.text().catch(() => '');
    const p    = new URLSearchParams(text);
    digit      = p.get('Digits') ?? '';
  }

  const APP_URL = process.env.NEXTAUTH_URL ?? 'https://crm.aipilots.site';

  /* ── Log the decision ────────────────────────────────────────────── */
  try {
    await connectToDatabase();
    const db = mongoose.connection.db!;
    await db.collection('activityLogs').insertOne({
      userId:    tenantId,
      type:      'VOICE_DECISION',
      message:   digit === '1'
        ? `📞 Operator approved 3 more pages via phone (keyword: "${keyword}")`
        : `📞 Operator declined via phone (keyword: "${keyword}")`,
      level:     digit === '1' ? 'success' : 'info',
      metadata:  { digit, keyword, source: 'twilio_call' },
      timestamp: new Date().toISOString(),
    });
  } catch { /* non-fatal */ }

  /* ── Act on digit 1 — queue 3 related SEO jobs ──────────────────── */
  if (digit === '1' && tenantId) {
    try {
      // Trigger bulk create via the action engine (non-blocking)
      fetch(`${APP_URL}/api/admin/actions/propose`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          // Use a synthetic insight-style payload that wires into the existing engine
          tenantId,
          keyword,
          source: 'voice_approval',
          count:  3,
        }),
      }).catch(() => {});
    } catch { /* fire and forget */ }
  }

  /* ── TwiML response ──────────────────────────────────────────────── */
  const reply = digit === '1'
    ? `<Say voice="Polly.Joanna">Got it. I'm queuing 3 more pages now. You'll get an email when they're live. Talk soon.</Say>`
    : `<Say voice="Polly.Joanna">No problem. I'll keep watching for the next opportunity. Talk soon.</Say>`;

  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${reply}</Response>`,
    { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' } }
  );
}

/**
 * POST /api/voice/nova-call/amd  (same file — async machine detection callback)
 * Twilio posts here if it detects an answering machine.
 * We hang up so Nova doesn't ramble at voicemail.
 */
export async function GET() {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`,
    { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' } }
  );
}
