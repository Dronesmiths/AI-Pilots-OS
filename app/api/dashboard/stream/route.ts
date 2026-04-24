/**
 * app/api/dashboard/stream/route.ts  (replay-aware upgrade)
 *
 * SSE endpoint: change streams + replay catch-up.
 *
 * Reconnect flow:
 *   1. Browser auto-reconnects with Last-Event-ID header (set by EventSource)
 *   2. Route reads Last-Event-ID → fetches events after that sequence
 *   3. Broadcaster sends replay events first (already-persisted, missed events)
 *   4. Then attaches to live event bus subscription
 *
 * This means reconnecting clients get exactly what they missed — no gap,
 * no duplicates (sequence ensures strict ordering and dedup on client side).
 *
 * Query params:
 *   after  — optional override for Last-Event-ID (used by bootstrap hand-off)
 *   domain — tenant. Falls back to portal_domain cookie.
 */
import { NextRequest }          from 'next/server';
import { cookies }              from 'next/headers';
import connectToDatabase        from '@/lib/mongodb';
import { startMongoWatcher }    from '@/lib/events/mongoWatcher';
import { createSSEStream }      from '@/lib/events/broadcaster';
import { getReplayEvents }      from '@/lib/events/getReplayEvents';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  await connectToDatabase();
  const cs = await cookies();

  const domain = req.nextUrl.searchParams.get('domain') ?? cs.get('portal_domain')?.value ?? 'default';

  // Determine replay cursor:
  // 1. Explicit ?after= param (from bootstrap hand-off on first load)
  // 2. Last-Event-ID header (from browser auto-reconnect)
  // 3. Default 0 (no replay needed — fresh session already has bootstrap)
  const afterParam  = req.nextUrl.searchParams.get('after');
  const lastEventId = req.headers.get('last-event-id');
  const afterSequence = afterParam != null
    ? Number(afterParam)
    : lastEventId != null
      ? Number(lastEventId)
      : 0;

  // Start change stream watcher (idempotent per process)
  const { changeStreams } = await startMongoWatcher();

  // Fetch any events missed since last cursor (empty array when afterSequence = 0)
  const replayEvents = afterSequence > 0
    ? await getReplayEvents({ tenantId: domain, afterSequence, limit: 50 })
    : [];

  const stream = createSSEStream({ changeStreamsLive: changeStreams, replayEvents });

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
