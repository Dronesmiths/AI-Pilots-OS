import axios              from 'axios';
import connectToDatabase  from '@/lib/mongodb';
import mongoose           from 'mongoose';
import { buildNovaBriefing, NovaBriefingInput } from './buildNovaBriefing';

const VAPI_BASE = 'https://api.vapi.ai';

export type VapiOutboundParams = NovaBriefingInput & {
  tenantId:    string;
  toPhone:     string;
  actionId?:   string;   // optional link back to ActionProposal
  summaryId?:  string;   // optional link to NovaVoiceSummary
};

/**
 * triggerVapiOutboundCall
 * ────────────────────────
 * Places an outbound Vapi conversational call.
 * Nova briefs the operator on what just happened and asks
 * a single safe approval question.
 *
 * The call ends → Vapi fires end-of-call-report webhook →
 * /api/voice/nova-call/vapi-webhook processes transcript + intent.
 */
export async function triggerVapiOutboundCall(
  params: VapiOutboundParams
): Promise<{ callId: string | null; skipped?: boolean }> {

  const { VAPI_API_KEY, VAPI_DEFAULT_PHONE_NUMBER_ID, NEXTAUTH_URL } = process.env;

  if (!VAPI_API_KEY) {
    console.warn('[NOVA CALL] VAPI_API_KEY not set — skipping outbound call.');
    return { callId: null, skipped: true };
  }
  if (!params.toPhone) {
    console.warn('[NOVA CALL] No operator phone on tenant — skipping.');
    return { callId: null, skipped: true };
  }

  const { systemPrompt, firstMessage } = buildNovaBriefing(params);

  const webhookUrl = `${NEXTAUTH_URL ?? 'https://crm.aipilots.site'}/api/voice/nova-call/vapi-webhook`;

  const payload = {
    name:            `Nova Briefing — ${params.keyword}`,
    type:            'outboundPhoneCall',
    phoneNumberId:   VAPI_DEFAULT_PHONE_NUMBER_ID,
    customer: {
      number: params.toPhone,
    },
    assistant: {
      name:          'Nova',
      voice: {
        provider: 'openai',
        voiceId:  'nova',    // OpenAI nova voice — matches TTS clips
      },
      model: {
        provider: 'openai',
        model:    'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }],
      },
      firstMessage,
      firstMessageMode:  'assistant-speaks-first',
      endCallMessage:    'Talk soon.',
      endCallFunctionEnabled: true,
      maxDurationSeconds: 120,
      recordingEnabled: true,
      // Send end-of-call report to our webhook
      serverUrl:     webhookUrl,
      serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET ?? '',
      // Inject metadata so webhook knows which tenant/action
      metadata: {
        tenantId:   params.tenantId,
        keyword:    params.keyword,
        actionType: params.actionType,
        actionId:   params.actionId ?? '',
        summaryId:  params.summaryId ?? '',
      },
    },
  };

  try {
    const res = await axios.post(`${VAPI_BASE}/call`, payload, {
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    const callId = res.data?.id ?? null;
    console.log(`[NOVA CALL] Vapi outbound call placed — callId: ${callId}`);

    // Log to activityLogs immediately
    try {
      await connectToDatabase();
      const db = mongoose.connection.db!;
      await db.collection('activityLogs').insertOne({
        userId:    params.tenantId,
        type:      'NOVA_CALL_PLACED',
        message:   `📞 Nova placed outbound call (keyword: "${params.keyword}")`,
        level:     'info',
        metadata:  { callId, keyword: params.keyword, actionType: params.actionType, actionId: params.actionId },
        timestamp: new Date().toISOString(),
      });
    } catch { /* non-fatal */ }

    return { callId };
  } catch (err: any) {
    console.error('[NOVA CALL] Vapi call failed:', err?.response?.data ?? err?.message);
    return { callId: null };
  }
}
