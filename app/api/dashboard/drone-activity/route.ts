/**
 * app/api/dashboard/drone-activity/route.ts
 *
 * GET /api/dashboard/drone-activity?tenantId=urban-design-remodel&limit=20
 *
 * Returns recent drone activity from drone_logs as normalized UI feed items.
 * SEPARATE from /api/dashboard/activity (which is the governance bandit feed).
 *
 * Short cache (5s) — this is a live operational feed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getActivityFeed }           from '@/lib/dashboard/getActivityFeed';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  const limit    = parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10);

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
  }

  try {
    const items = await getActivityFeed(tenantId, Math.min(limit, 50));
    return NextResponse.json(items, {
      headers: { 'Cache-Control': 'private, s-maxage=5, stale-while-revalidate=15' },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load drone activity' },
      { status: 500 }
    );
  }
}
