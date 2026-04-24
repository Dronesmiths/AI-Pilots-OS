/**
 * app/api/dashboard/replay/route.ts
 *
 * Catch-up endpoint for clients that missed events.
 * Called when a client reconnects and needs to fill the gap since last seen sequence.
 *
 * Query params:
 *   after    — sequence number cursor (exclusive). Default 0 = all recent events.
 *   domain   — tenant identifier. Falls back to portal_domain cookie.
 *   limit    — max events to return, capped at 100. Default 50.
 *
 * Response:
 *   {
 *     events:       ReplayEvent[],  // ordered by sequence ASC
 *     lastSequence: number,         // last sequence in this batch (use as next cursor)
 *     hasMore:      boolean         // true if there may be more events after this batch
 *   }
 *
 * Client usage:
 *   const res = await fetch('/api/dashboard/replay?after=4821');
 *   events.forEach(ev => patchState(ev.type, ev.payload));
 *   setLastSeq(res.lastSequence);
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import { getReplayEvents }           from '@/lib/events/getReplayEvents';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const cs = await cookies();

  const domain   = searchParams.get('domain')  ?? cs.get('portal_domain')?.value ?? 'default';
  const after    = Math.max(0, Number(searchParams.get('after') ?? '0'));
  const limit    = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '50')));

  const events = await getReplayEvents({ tenantId: domain, afterSequence: after, limit });

  const lastSequence = events.length ? events[events.length - 1].sequence : after;
  const hasMore      = events.length === limit; // may be more if we hit the limit

  return NextResponse.json({ events, lastSequence, hasMore });
}
