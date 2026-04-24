/**
 * app/api/prospects/track/route.ts
 *
 * Public tracking endpoint — no auth required (called from email/demo).
 *
 * GET /api/prospects/track?pid=[prospectId]&t=[type]&url=[url]&dur=[secs]
 *
 * Types: open | click | view | page | booking | activate
 *
 * For email opens: returns 1×1 transparent GIF.
 * For clicks: redirects to the target URL after logging.
 *
 * Updates prospect: lastActivityAt, intentScore, status if threshold crossed.
 */
import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase              from '@/lib/mongodb';
import { NovaProspectActivity, recomputeIntentScore } from '@/models/prospects/NovaProspectActivity';
import { NovaProspect }               from '@/models/prospects/NovaProspect';

// 1×1 transparent GIF payload
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');

const TYPE_MAP: Record<string, string> = {
  open: 'email_open', click: 'email_click', view: 'demo_view',
  page: 'demo_page', booking: 'booking_click', activate: 'activate_click',
};

export async function GET(req: NextRequest) {
  const pid      = req.nextUrl.searchParams.get('pid') ?? '';
  const rawType  = req.nextUrl.searchParams.get('t')   ?? 'open';
  const url      = req.nextUrl.searchParams.get('url') ?? '';
  const dur      = parseInt(req.nextUrl.searchParams.get('dur') ?? '0');
  const type     = TYPE_MAP[rawType] ?? 'email_open';

  // Fire-and-forget tracking (don't await in the response path)
  if (pid) {
    (async () => {
      try {
        await connectToDatabase();

        // Log activity (idempotent dedupe by key)
        const activityKey = `${pid}::${type}::${Date.now()}`;
        await NovaProspectActivity.create({
          activityKey, prospectId: pid, type,
          metadata: { url: url || undefined, durationSecs: dur || undefined },
        }).catch(() => {});

        // Recompute intent score
        const score = await recomputeIntentScore(pid);

        // Update prospect
        const newStatus = score >= 25 ? 'hot' : score >= 8 ? 'engaged' : undefined;
        const update: Record<string,unknown> = { intentScore: score, lastActivityAt: new Date() };
        if (newStatus) update.status = newStatus;
        await NovaProspect.updateOne({ $or:[{ prospectId:pid },{ demoTenantId:pid }] }, { $set: update });
      } catch { /* non-fatal — tracking must never crash delivery */ }
    })();
  }

  // Redirect for clicks, pixel for opens
  if (rawType === 'click' && url) {
    return NextResponse.redirect(url);
  }

  return new NextResponse(PIXEL, {
    headers: {
      'Content-Type':  'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma':        'no-cache',
    },
  });
}
