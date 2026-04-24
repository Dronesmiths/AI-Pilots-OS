/**
 * app/api/voice/send-sms/route.ts
 *
 * POST /api/voice/send-sms
 *
 * Auth:    Bearer VOICE_API_KEY
 * Limit:   20 req/min per API key
 * Provider: VOICE_PROVIDER env (default: "twilio")
 *
 * Body:
 *   to:          string  — destination (E.164 or 10-digit US)
 *   from:        string  — Twilio number (E.164)
 *   body:        string  — message text
 *   source?:     string  — "seo-page" | "crm" | "webhook"
 *   pageSlug?:   string  — e.g. "frameless-glass-shower-doors-draper"
 *   campaignId?: string  — future campaign tracking
 *   clientId?:   string  — CRM client ID
 *
 * Response (success): { success: true, id, provider, timestamp }
 * Response (error):   { success: false, error, code }
 */

import { NextResponse }           from 'next/server';
import { guardVoiceRequest }      from '@/voice-system/auth';
import { rateLimit }              from '@/voice-system/rate-limit';
import { logSuccess, logFailure, logRateLimited } from '@/voice-system/logs/voice-log';
import type { VoiceCallMeta }     from '@/voice-system/types';
import { TwilioService }          from '@/lib/twilio';

export const dynamic = 'force-dynamic';

const VOICE_PROVIDER = process.env.VOICE_PROVIDER ?? 'twilio';

export async function POST(req: Request) {
  // 1. Auth
  const authError = guardVoiceRequest(req);
  if (authError) return authError;

  // 2. Rate limit (keyed by Bearer token)
  const apiKey = (req.headers.get('Authorization') ?? '').slice(7);
  if (!rateLimit(apiKey)) {
    logRateLimited('sms', 'unknown');
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded. Max 20 SMS/min.', code: 'RATE_LIMIT' },
      { status: 429 }
    );
  }

  try {
    const { to, from, body, source, pageSlug, campaignId, clientId } = await req.json();

    if (!to || !from || !body) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: to, from, body.', code: 'INVALID_PAYLOAD' },
        { status: 400 }
      );
    }

    // Normalise to E.164
    const clean  = to.replace(/\D/g, '');
    const e164To = clean.length === 10 ? `+1${clean}` : `+${clean}`;

    const meta: VoiceCallMeta = { source, pageSlug, campaignId, clientId };

    if (VOICE_PROVIDER === 'twilio') {
      const twilio = new TwilioService();
      await twilio.sendSms(e164To, from, body);

      logSuccess('sms', e164To, 'twilio', meta);
      return NextResponse.json({
        success:   true,
        provider:  'twilio',
        timestamp: Date.now(),
        to:        e164To,
      });
    }

    // Future providers go here
    return NextResponse.json(
      { success: false, error: `Provider "${VOICE_PROVIDER}" not supported for SMS.`, code: 'INVALID_PROVIDER' },
      { status: 501 }
    );

  } catch (err: any) {
    logFailure('sms', 'unknown', VOICE_PROVIDER, err.message);
    return NextResponse.json(
      { success: false, error: err.message, code: 'TWILIO_ERROR' },
      { status: 500 }
    );
  }
}
