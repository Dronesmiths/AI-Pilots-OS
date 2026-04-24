/**
 * app/api/dashboard/first-results/route.ts
 *
 * GET /api/dashboard/first-results?tenantId=urban-design-remodel
 *
 * Returns: FirstResultsData (gsc + progress + trustSignals)
 * Cache: 30s stale, 120s revalidate — GSC is cached upstream at 15min anyway
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirstResults }           from '@/lib/dashboard/getFirstResults';
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
    const data = await getFirstResults(tenantId);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=120' },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load first results' },
      { status: 500 }
    );
  }
}
