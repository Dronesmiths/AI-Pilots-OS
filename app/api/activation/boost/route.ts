/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/api/activation/boost/route.ts
 * POST { industry?, city?, clientId? }
 * → "Grow My Site" button handler (client-facing, no auth required).
 *
 * For real clients: adds events to ClientActivityFeed + bumps ActivationState metrics.
 * For demo mode (no clientId): returns static grow events only.
 */
import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase              from '@/lib/mongodb';
import ClientActivityFeed             from '@/models/ClientActivityFeed';
import ActivationState                from '@/models/ActivationState';

export const dynamic = 'force-dynamic';

const GROW_EVENTS = [
  { icon: '🚀', type: 'publish',   message: '3 new keyword-targeted pages queued for publishing' },
  { icon: '📈', type: 'ranking',   message: 'Ranking boost activated for your top 6 priority keywords' },
  { icon: '🔗', type: 'link',      message: 'Internal link audit initiated across your entire site' },
  { icon: '🧠', type: 'discovery', message: '5 new high-intent keyword opportunities discovered' },
  { icon: '✅', type: 'optimize',  message: 'Meta titles and descriptions updated on high-impression pages' },
];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { clientId, tenantId = 'default' } = body;

  const events = GROW_EVENTS.map(ev => ({ ...ev, timestamp: new Date().toISOString() }));

  // Real client — persist events + bump metrics
  if (clientId) {
    try {
      await connectToDatabase();

      await ClientActivityFeed.insertMany(
        events.map(ev => ({
          userId:  clientId,
          type:    ev.type,
          icon:    ev.icon,
          message: ev.message,
        }))
      );

      // Small metrics bump to make count-up feel real
      await ActivationState.updateOne(
        { tenantId, clientId },
        {
          $inc: {
            'metrics.impressions': Math.round(Math.random() * 40 + 20),
            'metrics.clicks':      Math.round(Math.random() * 4  + 2),
            'metrics.pagesTracked': 3,
          },
        }
      );
    } catch { /* non-fatal — client still sees events */ }
  }

  return NextResponse.json({
    ok:     true,
    events: events.map(ev => `${ev.icon} ${ev.message}`),
    message: 'Growth tasks activated successfully',
  });
}
