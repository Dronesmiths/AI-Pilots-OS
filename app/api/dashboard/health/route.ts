/**
 * app/api/dashboard/health/route.ts
 *
 * GET /api/dashboard/health?tenantId=urban-design-remodel
 *
 * Lightweight health snapshot — Mongo only, no GSC call.
 * Target: < 200ms. Used per-card in the fleet grid.
 *
 * 200: { score, status, reasons, tenantId, recovering, lastRecoveryAt }
 *   recovering=true   → cooldownUntil is in the future (active recovery window)
 *   lastRecoveryAt    → ISO timestamp of most recent recovery run
 */
import { NextRequest, NextResponse }  from 'next/server';
import { getTenantHealth }            from '@/lib/health/getTenantHealth';
import connectToDatabase              from '@/lib/mongodb';
import TenantRecoveryState            from '@/models/TenantRecoveryState';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
  }

  try {
    await connectToDatabase();

    const [health, recoveryState] = await Promise.all([
      getTenantHealth(tenantId),
      TenantRecoveryState.findOne({ tenantId }).select('cooldownUntil lastRecoveryAt lastExecutedActions').lean(),
    ]);

    const now        = new Date();
    const recovering = !!(recoveryState as any)?.cooldownUntil &&
                       new Date((recoveryState as any).cooldownUntil).getTime() > now.getTime();

    return NextResponse.json(
      {
        ...health,
        recovering,
        lastRecoveryAt:      (recoveryState as any)?.lastRecoveryAt?.toISOString() ?? null,
        lastExecutedActions: (recoveryState as any)?.lastExecutedActions ?? [],
      },
      { headers: { 'Cache-Control': 'private, s-maxage=10, stale-while-revalidate=30' } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Health check failed' },
      { status: 500 }
    );
  }
}

