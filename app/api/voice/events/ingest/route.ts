import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase             from '@/lib/mongodb';
import { ingestVoiceEvent }          from '@/lib/voice/ingestVoiceEvent';

/**
 * POST /api/voice/events/ingest
 *
 * Universal voice event ingestion endpoint.
 * Accepts Vapi, Twilio, or manual payloads and routes them through
 * the Phase 1 voice intelligence pipeline:
 *   normalize → classify → CallRecord → NovaMemory → activityLog
 *
 * Body shape (all providers):
 *   {
 *     source:      "vapi" | "twilio" | "manual"
 *     tenantId:    string   (required — MongoDB User _id)
 *     transcript:  string
 *     // ... provider-specific fields (callId / callSid etc.)
 *   }
 *
 * Phase 1: ingest + memory only — NO autonomous actions triggered.
 */
export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    const body = await req.json();

    if (!body?.tenantId) {
      return NextResponse.json(
        { success: false, error: 'tenantId is required' },
        { status: 400 }
      );
    }

    if (!body?.source || !['vapi', 'twilio', 'manual'].includes(body.source)) {
      return NextResponse.json(
        { success: false, error: 'source must be "vapi", "twilio", or "manual"' },
        { status: 400 }
      );
    }

    const result = await ingestVoiceEvent(body);

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[VOICE INGEST ERROR]', error?.message);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to ingest voice event' },
      { status: 500 }
    );
  }
}
