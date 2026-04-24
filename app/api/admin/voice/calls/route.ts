import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase             from '@/lib/mongodb';
import CallRecordModel               from '@/models/CallRecord';

/**
 * GET /api/admin/voice/calls?tenantId=xxx&limit=50&outcome=booked
 *
 * Read endpoint for the Mission Control / War Room dashboard.
 * Returns paginated call records for a given tenant.
 *
 * Query params:
 *   tenantId — required
 *   limit    — default 50, max 200
 *   outcome  — filter by outcome
 *   since    — ISO date string lower bound
 */
export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');
    const limit    = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
    const outcome  = searchParams.get('outcome') ?? undefined;
    const since    = searchParams.get('since')   ?? undefined;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = { tenantId };
    if (outcome) filter.outcome    = outcome;
    if (since)   filter.createdAt  = { $gte: new Date(since) };

    const records = await CallRecordModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Aggregate outcome distribution for dashboard widgets
    const distribution = await CallRecordModel.aggregate([
      { $match: { tenantId } },
      { $group: { _id: '$outcome', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    return NextResponse.json({
      calls: records,
      distribution,
      meta: { total: records.length },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
