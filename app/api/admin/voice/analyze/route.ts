import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase             from '@/lib/mongodb';
import VoiceInsightModel             from '@/models/VoiceInsight';
import { analyzeVoicePatterns }      from '@/lib/voice/analyzeVoicePatterns';
import { buildVoiceInsights }        from '@/lib/voice/buildVoiceInsights';

/**
 * POST /api/admin/voice/analyze
 *   Body: { tenantId: string }
 *   Runs the 7-day pattern analysis and stores new VoiceInsight documents.
 *   Phase 2 — RECOMMENDATION MODE ONLY. No actions auto-executed.
 *
 * GET  /api/admin/voice/analyze?tenantId=xxx
 *   Returns stored insights for a tenant (newest first).
 */
export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    const body      = await req.json();
    const tenantId  = body?.tenantId as string | undefined;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'tenantId required' }, { status: 400 });
    }

    const analysis = await analyzeVoicePatterns(tenantId);
    const insights = await buildVoiceInsights(tenantId, analysis);

    return NextResponse.json({
      success:  true,
      analyzed: analysis.metrics.total,
      metrics:  analysis.metrics,
      insights,
    });
  } catch (err: any) {
    console.error('[VOICE ANALYZE ERROR]', err?.message);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const tenantId = req.nextUrl.searchParams.get('tenantId');
    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
    }

    const insights = await VoiceInsightModel.find({ tenantId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Unreviewed count for dashboard badge
    const unreviewedCount = await VoiceInsightModel.countDocuments({
      tenantId,
      reviewed: false,
    });

    return NextResponse.json({ insights, unreviewedCount });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
