import { NextRequest, NextResponse } from 'next/server';
import { buildClientVoiceContext }   from '@/lib/voice/buildClientVoiceContext';

/**
 * POST /api/voice/client/context
 *
 * Vapi serverUrl endpoint for the client voice assistant.
 * Handles tool-call events that need fresh CRM data mid-call.
 *
 * Currently supported tool: getRecentActivity
 * All tools are READ-ONLY. Nothing is written.
 *
 * Query params: tenantId (set when provisioning serverUrl)
 */
export async function POST(req: NextRequest) {
  try {
    const tenantId = req.nextUrl.searchParams.get('tenantId') ?? '';
    const body     = await req.json().catch(() => ({}));
    const msg      = body?.message ?? body;
    const msgType  = msg?.type ?? '';

    // Handle tool calls — only getRecentActivity allowed
    if (msgType === 'tool-calls') {
      const toolCall = msg?.toolCallList?.[0] ?? msg?.toolCalls?.[0];
      const toolName = toolCall?.function?.name ?? toolCall?.name ?? '';

      if (toolName === 'getRecentActivity' && tenantId) {
        const context = await buildClientVoiceContext(tenantId);
        return NextResponse.json({
          results: [{
            toolCallId: toolCall?.id ?? '',
            result:     context,
          }],
        });
      }

      // Any other tool call → refuse
      return NextResponse.json({
        results: [{
          toolCallId: toolCall?.id ?? '',
          result:     "I can't do that right now, but the team is on it.",
        }],
      });
    }

    // Log end-of-call (no action needed — client calls are inform/query only)
    if (msgType === 'end-of-call-report') {
      const callId     = msg?.call?.id ?? '';
      const transcript = msg?.transcript ?? '';
      const metadata   = msg?.call?.metadata ?? {};
      console.log(`[CLIENT VOICE] Call ended — tenantId: ${tenantId}, callId: ${callId}, chars: ${transcript.length}`);
      // Optionally store transcript for audit — no action taken
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[CLIENT VOICE CONTEXT]', err?.message);
    return NextResponse.json({ ok: true }); // Always 200 to Vapi
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'client-voice-context' });
}
