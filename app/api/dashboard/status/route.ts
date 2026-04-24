/**
 * app/api/dashboard/status/route.ts
 *
 * GET /api/dashboard/status?tenantId=urban-design-remodel
 *
 * Returns a quick system health snapshot.
 * Polled by the SystemStatus UI component every 5s.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSystemStatus }           from '@/lib/dashboard/systemStatus';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
  }

  try {
    const status = await getSystemStatus(tenantId);
    return NextResponse.json(status);
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Status check failed', detail: e?.message },
      { status: 500 }
    );
  }
}
