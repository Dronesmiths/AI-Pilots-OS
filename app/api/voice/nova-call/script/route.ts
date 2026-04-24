import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/voice/nova-call/script
 *
 * TwiML endpoint — Twilio fetches this when the call connects.
 * Nova introduces herself, mentions what she built, and asks
 * the operator to press 1 for more pages or 2 to skip.
 *
 * Query params (all URL-encoded by triggerNovaCall):
 *   keyword    — the SEO keyword that was targeted
 *   tenantId   — for the action callback
 *   actionType — what Nova did (publish, reinforce, etc.)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const keyword    = searchParams.get('keyword')    ?? 'a new page';
  const tenantId   = searchParams.get('tenantId')   ?? '';
  const actionType = searchParams.get('actionType') ?? 'publish';

  const APP_URL = process.env.NEXTAUTH_URL ?? 'https://crm.aipilots.site';

  const actionVerb =
    actionType === 'rebuild'   ? 'rebuilt a page' :
    actionType === 'reinforce' ? 'reinforced a page' :
    actionType === 'boost'     ? 'boosted a page' :
                                 'created a new page';

  const responseUrl = `${APP_URL}/api/voice/nova-call/response?` +
    `tenantId=${encodeURIComponent(tenantId)}` +
    `&keyword=${encodeURIComponent(keyword)}`;

  // TwiML — Gather waits up to 8 seconds for a digit
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${responseUrl}" method="POST" timeout="8">
    <Say voice="Polly.Joanna" language="en-US">
      Hey — Nova here.

      I just ${actionVerb} targeting ${keyword}.

      I chose this because it shows strong search demand and low competition in your market.

      The page is queued and will be live shortly.

      Want me to create 3 more pages in this category?

      Press 1 for yes. Press 2 to skip. Or just hang up if you're busy.
    </Say>
  </Gather>

  <Say voice="Polly.Joanna">
    No input received. Talk soon — Nova out.
  </Say>
</Response>`;

  return new NextResponse(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}
