/**
 * app/api/voice/make-call/route.ts
 *
 * POST /api/voice/make-call
 *
 * Auth:    Bearer VOICE_API_KEY
 * Limit:   10 calls/min per API key (tighter — calls cost real money)
 * Provider: VOICE_PROVIDER env (default: "vapi")
 *
 * Body:
 *   to:             string  — destination (E.164 or 10-digit US)
 *   agentId:        string  — Vapi assistant ID
 *   phoneNumberId?: string  — Vapi phone number ID (defaults to VAPI_DEFAULT_PHONE_NUMBER_ID)
 *   source?:        string  — "seo-page" | "crm" | "webhook"
 *   pageSlug?:      string  — e.g. "frameless-glass-shower-doors-draper"
 *   campaignId?:    string
 *   clientId?:      string
 *
 * Response (success): { success: true, id: callId, provider, timestamp, to }
 * Response (error):   { success: false, error, code }
 */

import { NextResponse }           from 'next/server';
import { guardVoiceRequest }      from '@/voice-system/auth';
import { rateLimit }              from '@/voice-system/rate-limit';
import { logSuccess, logFailure, logRateLimited } from '@/voice-system/logs/voice-log';
import type { VoiceCallMeta }     from '@/voice-system/types';

export const dynamic = 'force-dynamic';

const VAPI_API_KEY            = process.env.VAPI_API_KEY;
const DEFAULT_PHONE_NUMBER_ID = process.env.VAPI_DEFAULT_PHONE_NUMBER_ID
                                ?? 'b0364f78-767d-4fe2-8f9f-258db0085808';
const VOICE_PROVIDER          = process.env.VOICE_PROVIDER ?? 'vapi';

export async function POST(req: Request) {
  // 1. Auth
  const authError = guardVoiceRequest(req);
  if (authError) return authError;

  // 2. Rate limit — calls are expensive, tighter limit (10/min)
  const apiKey = (req.headers.get('Authorization') ?? '').slice(7);
  if (!rateLimit(apiKey, 10, 60_000)) {
    logRateLimited('call', 'unknown');
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded. Max 10 calls/min.', code: 'RATE_LIMIT' },
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
    const { to, agentId, phoneNumberId, source, pageSlug, campaignId, clientId } = await req.json();

    if (!to || !agentId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: to, agentId.', code: 'INVALID_PAYLOAD' },
        { status: 400 }
      );
    }

    // Normalise to E.164
    const clean  = to.replace(/\D/g, '');
    const e164To = clean.length === 10 ? `+1${clean}` : `+${clean}`;
    const numId  = phoneNumberId ?? DEFAULT_PHONE_NUMBER_ID;

    const meta: VoiceCallMeta = { source, pageSlug, campaignId, clientId };

    if (VOICE_PROVIDER === 'vapi' || VOICE_PROVIDER === 'twilio') {
      const res = await fetch('https://api.vapi.ai/call', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          assistantId:   agentId,
          phoneNumberId: numId,
          customer:      { number: e164To },
          // Forward source metadata to Vapi call tags if supported
          metadata:      { source, pageSlug, campaignId, clientId },
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Vapi ${res.status}: ${body.slice(0, 200)}`);
      }

      const data   = await res.json();
      const callId = data.id ?? null;

      logSuccess('call', e164To, 'vapi', meta, callId);
      return NextResponse.json({
        success:   true,
        id:        callId,
        provider:  'vapi',
        timestamp: Date.now(),
        to:        e164To,
      });
    }

    return NextResponse.json(
      { success: false, error: `Provider "${VOICE_PROVIDER}" not supported for calls.`, code: 'INVALID_PROVIDER' },
      { status: 501 }
    );

  } catch (err: any) {
    logFailure('call', 'unknown', VOICE_PROVIDER, err.message);
    return NextResponse.json(
      { success: false, error: err.message, code: 'VAPI_ERROR' },
      { status: 500 }
    );
  }
}
