/**
 * app/api/dashboard/mission-control/route.ts
 *
 * GET /api/dashboard/mission-control?tenantId=urban-design-remodel
 *
 * Unified payload for the Mission Control panel (admin-facing control room).
 * Returns: { timeline, results, status, activity }
 *
 * SEPARATE from /api/dashboard/bootstrap which serves the client-facing
 * SEO OS portal (with snapshotSequence, SSE cursors, keyword wins, etc.)
 *
 * Cache: 10s stale / 30s revalidate — short enough to feel live,
 * long enough to not hammer GSC/Mongo on every render.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getMissionControl }         from '@/lib/dashboard/getMissionControl';
import { getTenantById }             from '@/lib/tenant/getTenantById';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
  }

  const tenant = await getTenantById(tenantId);
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  try {
    const data = await getMissionControl(tenantId);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, s-maxage=10, stale-while-revalidate=30' },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Mission Control load failed' },
      { status: 500 }
    );
  }
}
