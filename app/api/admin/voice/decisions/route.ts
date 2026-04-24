import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase             from '@/lib/mongodb';
import mongoose                      from 'mongoose';

/**
 * GET /api/admin/voice/decisions
 *
 * Returns recent VOICE_DECISION + NOVA_CALL_PLACED activityLog entries
 * for the War Room Voice Decisions panel.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const tenantId = searchParams.get('tenantId');
    const limit    = parseInt(searchParams.get('limit') ?? '10');

    if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });

    await connectToDatabase();
    const db = mongoose.connection.db!;

    const decisions = await db.collection('activityLogs')
      .find({
        userId: tenantId,
        type:   { $in: ['VOICE_DECISION', 'NOVA_CALL_PLACED', 'VOICE_REVIEW_REQUIRED'] },
      })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json({ success: true, decisions });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
