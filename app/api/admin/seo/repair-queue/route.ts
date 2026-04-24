/**
 * GET /api/admin/seo/repair-queue?tenantId=xxx
 *
 * Returns all clusters where repairStatus = 'needs_fix'
 * Used by the 41-repair-drone to fetch its work queue.
 */

import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const tenantId = req.nextUrl.searchParams.get('tenantId');
    if (!tenantId) return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });

    const client = await User.findById(tenantId).select('seoClusters').lean() as any;
    if (!client) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const clusters = (client.seoClusters || []).filter(
      (c: any) =>
        c.repairStatus === 'needs_fix' &&
        ['published', 'Live', 'completed'].includes(c.status)
    );

    return NextResponse.json({ clusters, count: clusters.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
