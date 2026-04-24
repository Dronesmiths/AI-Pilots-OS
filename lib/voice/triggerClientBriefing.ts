import axios                              from 'axios';
import mongoose                          from 'mongoose';
import connectToDatabase                 from '@/lib/mongodb';
import AgentDecision                     from '@/models/AgentDecision';
import User                              from '@/models/User';
import { readClientMemory, updateClientMemory, shouldSkipCall } from './clientMemory';
import { buildClientNarrative }          from './buildClientNarrative';
import { getToneProfile }                from './brandVoice';
import { updateMomentumScore }           from './getMomentumState';

const VAPI_BASE = 'https://api.vapi.ai';

/**
 * triggerClientBriefing
 * ─────────────────────
 * Places an outbound Vapi call to the end CLIENT.
 * Memory-aware: checks frequency guards, generates contextual
 * narrative, updates memory after call is placed.
 */
export async function triggerClientBriefing(params: {
  tenantId:  string;
  eventType: string;
  keyword?:  string;
}): Promise<{ callId: string | null; skipped?: boolean; reason?: string; message?: string }> {

  const { VAPI_API_KEY, VAPI_DEFAULT_PHONE_NUMBER_ID, NEXTAUTH_URL } = process.env;
  if (!VAPI_API_KEY) return { callId: null, skipped: true, reason: 'No VAPI_API_KEY' };

  await connectToDatabase();

  /* ── Load tenant ──────────────────────────────────────────────── */
  const tenant = await User.findById(params.tenantId)
    .select('name onboardingConfig targetDomain clientVoice')
    .lean() as any;

  const clientPhone  = tenant?.onboardingConfig?.clientPhone;
  const targetDomain = tenant?.targetDomain ?? tenant?.onboardingConfig?.targetDomain ?? '';
  const brandType    = tenant?.clientVoice?.brandVoiceProfile?.type ?? 'professional';
  const toneProfile  = getToneProfile(brandType);

  if (!clientPhone) return { callId: null, skipped: true, reason: 'No clientPhone on tenant' };

  /* ── Read memory + frequency check ──────────────────────────────── */
  const memory  = await readClientMemory(params.tenantId);
  const skipReason = shouldSkipCall(memory);

  if (skipReason) {
    console.log(`[CLIENT BRIEFING] Skipped — ${skipReason}`);
    const db = mongoose.connection.db!;
    await db.collection('activityLogs').insertOne({
      userId:    params.tenantId,
      type:      'CLIENT_BRIEFING_SKIPPED',
      message:   `⏭️ Client briefing skipped — ${skipReason}`,
      level:     'info',
      metadata:  { reason: skipReason, eventType: params.eventType },
      timestamp: new Date().toISOString(),
    });
    return { callId: null, skipped: true, reason: skipReason };
  }

  /* ── Load latest agent decision (last 24h) ───────────────────── */
  const recentDecision = await AgentDecision.findOne({
    tenantId: params.tenantId,
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  }).sort({ createdAt: -1 }).lean() as any;

  const decisionType = recentDecision?.decisionType;

  /* ── Refresh momentum score ───────────────────────────────── */
  const { state: momentumState } = await updateMomentumScore(params.tenantId);

  /* ── Build memory-aware narrative ────────────────────────────── */
  const clientMessage = buildClientNarrative({
    eventType:     params.eventType,
    decisionType,
    memory,
    targetDomain,
    brandType,
    momentumState,
  });

  /* ── System prompt: inform only ──────────────────────────────── */
  const agentName = tenant?.clientVoice?.agentName ?? 'Your Business Assistant';
  const systemPrompt = `
You are a professional assistant delivering a brief, warm progress update.
Deliver ONLY the following message naturally and conversationally:
"${clientMessage}"
After delivering the message, say "That's all for now — have a great day!" and end the call.
Do not add anything else. Do not ask questions. Keep it under 30 seconds.
`.trim();

  const webhookUrl = `${NEXTAUTH_URL ?? 'https://crm.aipilots.site'}/api/voice/client/context?tenantId=${params.tenantId}`;

  const payload = {
    name:          `Nova Client Briefing — ${targetDomain}`,
    type:          'outboundPhoneCall',
    phoneNumberId: VAPI_DEFAULT_PHONE_NUMBER_ID,
    customer:      { number: clientPhone },
    assistant: {
      name:  agentName,
      voice: { provider: 'openai', voiceId: toneProfile.vapiVoiceId },
      model: {
        provider: 'openai',
        model:    'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }],
      },
      firstMessage:           clientMessage,
      firstMessageMode:       'assistant-speaks-first',
      endCallMessage:         "That's all for now — have a great day!",
      endCallFunctionEnabled: true,
      maxDurationSeconds:     45,
      recordingEnabled:       true,
      serverUrl:              webhookUrl,
      metadata: {
        tenantId:     params.tenantId,
        callType:     'client_briefing',
        decisionType: decisionType ?? 'none',
        keyword:      params.keyword ?? '',
      },
    },
  };

  try {
    const res = await axios.post(`${VAPI_BASE}/call`, payload, {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}`, 'Content-Type': 'application/json' },
    });

    const callId = res.data?.id ?? null;
    console.log(`[CLIENT BRIEFING] Placed to ${clientPhone} — callId: ${callId} — "${clientMessage}"`);

    const db = mongoose.connection.db!;

    /* ── Log the call ─────────────────────────────────────────── */
    await db.collection('activityLogs').insertOne({
      userId:    params.tenantId,
      type:      'CLIENT_BRIEFING_PLACED',
      message:   `📞 Nova client briefing placed → ${targetDomain} (call #${memory.callCountThisWeek + 1} this week)`,
      level:     'info',
      metadata:  { callId, clientMessage, decisionType, keyword: params.keyword },
      timestamp: new Date().toISOString(),
    });

    /* ── Update memory AFTER successful call placement ──────────── */
    await updateClientMemory(
      params.tenantId,
      { type: params.eventType },
      clientMessage,
      memory
    );

    /* ── Mark agent decision as acted upon ─────────────────────── */
    if (recentDecision?._id) {
      await AgentDecision.findByIdAndUpdate(recentDecision._id, {
        $set: { acted: true, actedAt: new Date() },
      });
    }

    return { callId, message: clientMessage };
  } catch (err: any) {
    console.error('[CLIENT BRIEFING] Vapi call failed:', err?.response?.data ?? err?.message);
    return { callId: null };
  }
}

