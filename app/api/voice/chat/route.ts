/**
 * app/api/voice/chat/route.ts
 *
 * POST /api/voice/chat
 *
 * Auth:    Bearer VOICE_API_KEY
 * Limit:   20 req/min per API key
 * Provider: VOICE_PROVIDER env (default: "vapi")
 *
 * Body:
 *   agentId:     string  — Vapi assistant ID
 *   message:     string  — user message text
 *   sessionId?:  string  — continue an existing conversation
 *   source?:     string  — "seo-page" | "crm" | "widget"
 *   pageSlug?:   string  — originating page slug
 *   campaignId?: string
 *   clientId?:   string
 *
 * Response (success): { success: true, id: sessionId, provider, timestamp, reply }
 * Response (error):   { success: false, error, code }
 */

import { NextResponse }           from 'next/server';
import { guardVoiceRequest }      from '@/voice-system/auth';
import { rateLimit }              from '@/voice-system/rate-limit';
import { logSuccess, logFailure, logRateLimited } from '@/voice-system/logs/voice-log';
import type { VoiceCallMeta }     from '@/voice-system/types';

export const dynamic = 'force-dynamic';

const VAPI_API_KEY   = process.env.VAPI_API_KEY;
const VOICE_PROVIDER = process.env.VOICE_PROVIDER ?? 'vapi';

export async function POST(req: Request) {
  // 1. Auth
  const authError = guardVoiceRequest(req);
  if (authError) return authError;

  // 2. Rate limit
  const apiKey = (req.headers.get('Authorization') ?? '').slice(7);
  if (!rateLimit(apiKey)) {
    logRateLimited('chat', 'agent');
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded. Max 20 chat/min.', code: 'RATE_LIMIT' },
      { status: 429 }
    );
  }

  if (!VAPI_API_KEY) {
    return NextResponse.json(
      { success: false, error: 'Voice system misconfigured: VAPI_API_KEY not set.', code: 'CONFIG_ERROR' },
      { status: 503 }
    );
  }

  try {
    const { agentId, message, sessionId, source, pageSlug, campaignId, clientId } = await req.json();

    if (!agentId || !message) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: agentId, message.', code: 'INVALID_PAYLOAD' },
        { status: 400 }
      );
    }

    const meta: VoiceCallMeta = { source, pageSlug, campaignId, clientId };

    if (VOICE_PROVIDER === 'vapi' || VOICE_PROVIDER === 'twilio') {
      const payload: Record<string, unknown> = {
        assistantId: agentId,
        input:       message,
        ...(sessionId ? { sessionId } : {}),
      };

      const res = await fetch('https://api.vapi.ai/chat', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`,
          'Content-Type':  'application/json',
        },
        body:   JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Vapi ${res.status}: ${body.slice(0, 200)}`);
      }

      const data       = await res.json();
      const reply      = data.output ?? data.message ?? data.reply ?? '';
      const newSessId  = data.sessionId ?? sessionId ?? null;

      logSuccess('chat', agentId, 'vapi', meta, newSessId ?? undefined);
      return NextResponse.json({
        success:   true,
        id:        newSessId,
        provider:  'vapi',
        timestamp: Date.now(),
        reply,
        sessionId: newSessId,
      });
    }

    return NextResponse.json(
      { success: false, error: `Provider "${VOICE_PROVIDER}" not supported for chat.`, code: 'INVALID_PROVIDER' },
      { status: 501 }
    );

  } catch (err: any) {
    logFailure('chat', 'unknown', VOICE_PROVIDER, err.message);
    return NextResponse.json(
      { success: false, error: err.message, code: 'VAPI_ERROR' },
      { status: 500 }
    );
  }
}
