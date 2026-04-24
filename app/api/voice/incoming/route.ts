/**
 * app/api/voice/incoming/route.ts
 *
 * Twilio incoming call webhook.
 * Point your Twilio number to: POST https://yourdomain.com/api/voice/incoming
 *
 * This bridges the call directly into the Vapi voice AI agent,
 * which then invokes /api/nova/voice-command as a tool.
 *
 * No auth on this route (Twilio signs requests — add Twilio signature
 * validation via twilio.validateRequest() if you want production hardening).
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://api.vapi.ai/twilio" />
  </Connect>
</Response>`;

  return new NextResponse(twiml, {
    status:  200,
    headers: { 'Content-Type': 'text/xml' },
  });
}

// Twilio may also send GET for webhook validation
export async function GET() {
  return NextResponse.json({ ok: true, service: 'Nova Voice Endpoint' });
}
