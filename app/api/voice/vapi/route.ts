/**
 * app/api/voice/vapi/route.ts
 *
 * VAPI webhook receiver — the bridge between voice and Nova's cognition stack.
 *
 * Vapi sends a POST on every message/call event. This route:
 *   1. Extracts intent from the transcript
 *   2. Loads recent conversation memory for context
 *   3. Executes the appropriate action (trust update, governance flag, etc.)
 *   4. Builds a personality-aware voice response
 *   5. Stores the interaction as conversation memory
 *   6. Returns the response text to Vapi for TTS
 *
 * VAPI setup:
 *   Server URL → https://yourdomain.com/api/voice/vapi
 *   Event:       message (function-call or end-of-turn)
 *
 * Authentication: VAPI_WEBHOOK_SECRET header check (optional, enabled via env).
 *
 * Response format: { response: string } — Vapi reads response as the next spoken turn.
 * If no response is needed (e.g. status update events), return { response: null }.
 */

import { NextRequest, NextResponse }         from 'next/server';
import connectToDatabase                      from '@/lib/mongodb';
import { extractVoiceIntent }                from '@/lib/voice/extractVoiceIntent';
import { handleVoiceAction }                 from '@/lib/voice/handleVoiceAction';
import { applyTone }                         from '@/lib/voice/applyTone';
import { storeConversationMemory }           from '@/lib/narrative/storeConversationMemory';
import { getRelevantConversationMemory }     from '@/lib/narrative/getRelevantConversationMemory';
import { selectPersonalityMode }             from '@/lib/narrative/selectPersonalityMode';
import { triggerInterrupt, clearInterrupt }  from '@/lib/runtime/interruptState';
import { setOverride }                       from '@/lib/runtime/overrideState';
import { updateOperatorTrustFromVoice }      from '@/lib/voice/updateOperatorTrustFromVoice';
import { parseDelegationCommand }            from '@/lib/voice/parseDelegationCommand';
import { runVoiceDelegation }               from '@/lib/agents/runVoiceDelegation';
import { parseMissionCommand }              from '@/lib/voice/parseMissionCommand';
import { createMission }                    from '@/lib/mission/createMission';

// ─── Response templates ────────────────────────────────────────────────────────

function buildVoiceResponse(input: {
  intentType:     string;
  trustScore?:    number;
  trustBand?:     string;
  recentSummary?: string;
  transcript?:    string;
}): string {
  const { intentType, trustScore, trustBand } = input;

  switch (intentType) {
    case 'approve':
      return `I've registered your approval. That strengthens this decision path going forward.` +
        (trustScore !== undefined ? ` Your trust standing is ${trustBand ?? 'active'}.` : '');

    case 'reject':
      return `Understood. I've flagged this for review and adjusted weighting accordingly.` +
        (trustScore !== undefined ? ` Your standing remains ${trustBand ?? 'on record'}.` : '');

    case 'question':
      return `My most recent reasoning: I evaluated available doctrine, trust signals, and recent outcomes. ` +
        `This path showed the best alignment with stable, low-regret growth. ` +
        `You can see the full breakdown in the narrative dashboard.`;

    case 'command':
      return `Noted. Command signals are logged and routed to the appropriate cycle for execution.`;

    case 'delegation':
      return `Executing now.`;

    default:
      return `I heard you. How can I help?`;
  }
}

// ─── Webhook handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    const body = await req.json();

    // ── Extract call metadata ──────────────────────────────────────────────────
    // Vapi sends different shapes for different event types.
    // Primary transcript is in body.message.transcript or body.transcript.
    const transcript = body?.message?.transcript
      ?? body?.transcript
      ?? '';

    const userId     = body?.message?.metadata?.userId
      ?? body?.metadata?.userId
      ?? 'operator';
    const tenantId   = body?.message?.metadata?.tenantId
      ?? body?.metadata?.tenantId
      ?? process.env.DEFAULT_TENANT_ID
      ?? 'default';
    const sessionKey = body?.message?.call?.id ?? body?.call?.id;
    const topicKey   = body?.message?.metadata?.topicKey ?? body?.metadata?.topicKey;

    // Skip non-transcript events (status updates, function calls, etc.)
    if (!transcript.trim()) {
      return NextResponse.json({ response: null });
    }

    // ── BARGE-IN DETECTION (checked before any other processing) ─────────
    // If the operator says a stop/interrupt phrase, halt immediately.
    // triggerInterrupt() sets the in-process flag so any running cognition
    // loop iteration will throw InterruptError at its next checkInterrupt() call.
    const t = transcript.toLowerCase();
    const isBargein = /\b(stop|wait|hold on|no no|pause|abort|freeze)\b/.test(t);

    if (isBargein) {
      triggerInterrupt('voice_barge_in');

      storeConversationMemory({
        userId,
        sessionKey,
        conversationType: 'voice',
        topicKey:         'interrupt',
        userMessage:      transcript,
        novaResponse:     "Stopping. I'm listening.",
        inferredIntent:   'interrupt',
        emotionalTone:    'urgent',
        salienceScore:    0.90,
        retentionScore:   0.85,
        metadata:         { interrupt: true, bargein: true },
      }).catch(() => {}); // non-blocking

      return NextResponse.json({ response: "Stopping. I'm listening." });
    }

    // If the operator resumes after a barge-in, clear the interrupt flag
    clearInterrupt();

    // ── 1. Extract intent ──────────────────────────────────────────────────────
    const intent = extractVoiceIntent(transcript);

    // ── Delegation detection (checked after intent, before standard action flow) ─
    // parseDelegationCommand runs on every non-barge-in turn and returns
    // action='dispatch' when the transcript clearly calls for agent deployment.
    // If dispatch is detected, run the delegation flow and return early
    // — the standard approve/reject/question flow is skipped entirely.
    const delegation = parseDelegationCommand(transcript);

    if (delegation.action === 'dispatch') {
      const result = await runVoiceDelegation({
        parsed:      delegation,
        operatorId:  userId,
        transcript,
      });

      let delegationReply: string;
      if (result.status === 'no_agents') {
        delegationReply = `No ${delegation.targetType} agents are currently available. I'll note this request for manual review.`;
      } else if (result.status === 'failed') {
        delegationReply = `I tried dispatching ${delegation.targetType} agents but all encountered errors. Check the delegation log.`;
      } else {
        const loc = delegation.location ? ` to ${delegation.location}` : '';
        delegationReply = `Deployed ${result.agentCount} ${delegation.targetType} agent${result.agentCount !== 1 ? 's' : ''}${loc}. ${result.successCount} of ${result.agentCount} confirmed. I'll monitor results.`;
      }

      storeConversationMemory({
        userId,
        sessionKey,
        conversationType: 'voice',
        topicKey:         'delegation',
        userMessage:      transcript,
        novaResponse:     delegationReply,
        inferredIntent:   'delegation',
        emotionalTone:    'executive',
        salienceScore:    0.85,
        retentionScore:   0.80,
        metadata: {
          delegation:   true,
          executionKey: result.executionKey,
          agentKeys:    result.agentKeys,
          targetType:   delegation.targetType,
          location:     delegation.location,
        },
      }).catch(() => {});

      return NextResponse.json({ response: delegationReply });
    }

    // ── Mission detection (multi-step goal, checked after delegation) ───────
    // parseMissionCommand returns isMission=true for clear multi-step goal phrases.
    // Falls through to standard intent flow when isMission=false.
    const missionCommand = parseMissionCommand(transcript);

    if (missionCommand.isMission) {
      const missionResult = await createMission({
        title:         missionCommand.title,
        goal:          missionCommand.goal,
        objectiveType: missionCommand.objectiveType,
        targetMetric:  missionCommand.targetMetric,
        targetValue:   missionCommand.targetValue,
        scope:         missionCommand.scope,
        createdBy:     userId,
      });

      const stepCount  = missionResult.steps.length;
      const targetText = missionCommand.targetValue ? ` ${missionCommand.targetValue}%` : '';
      const scopeText  = missionCommand.scope ? ` for ${missionCommand.scope}` : '';
      const missionReply = `Mission created${scopeText}. I've planned ${stepCount} steps to achieve${targetText} ${missionCommand.objectiveType.replace('_', ' ')}. Execution begins next cycle.`;

      storeConversationMemory({
        userId,
        sessionKey,
        conversationType: 'voice',
        topicKey:         'mission',
        userMessage:      transcript,
        novaResponse:     missionReply,
        inferredIntent:   'mission_creation',
        emotionalTone:    'executive',
        salienceScore:    0.90,
        retentionScore:   0.90,
        metadata: {
          mission:     true,
          missionKey:  missionResult.mission.missionKey,
          stepCount,
          objectiveType: missionCommand.objectiveType,
          targetValue:   missionCommand.targetValue,
          scope:         missionCommand.scope,
        },
      }).catch(() => {});

      return NextResponse.json({ response: missionReply });
    }

    // ── 2. Load recent context ─────────────────────────────────────────────────
    const recentMemories = await getRelevantConversationMemory({
      userId,
      topicKey,
      limit: 4,
    });

    // ── 3. Execute action (trust, flags, etc.) ─────────────────────────────────
    const actionResult = await handleVoiceAction({
      intent,
      transcript,
      userId,
      tenantId,
    });
    actionResult.recentMemories = recentMemories;

    // ── Override mapping for command intents ─────────────────────────
    // Map specific spoken command patterns to override types.
    // setOverride() sets the in-process flag; the cognition loop reads it
    // at the next getOverride() call inside the bandit/strategy engine.
    if (intent.type === 'command') {
      if (/\b(use different|try another|safer strategy|fallback)\b/.test(t)) {
        setOverride({ type: 'strategy_override', strategyKey: 'safe_fallback', operatorId: userId });
      } else if (/\b(cancel that|cancel it|cancel execution|abort that)\b/.test(t)) {
        setOverride({ type: 'cancel_execution', operatorId: userId, reason: 'voice_command' });
      }
    }

    // ── Trust delta for decisive intervention ────────────────────────
    // Commands and overrides are high-signal — operator showing decisiveness
    // warrants a small positive trust adjustment (separate from approve/reject).
    if (intent.type === 'command' || intent.type === 'reject') {
      updateOperatorTrustFromVoice({
        operatorId: userId,
        tenantId,
        action: 'approve',   // decisive intervention treated as positive trust signal
      }).catch(() => {});
    }

    // ── 4. Select personality mode ─────────────────────────────────────────────
    const mode = selectPersonalityMode({
      hasOpenDecision:     actionResult.flags.shouldPullNarrative,
      reflectionRequested: intent.type === 'question',
    });

    // ── 5. Build response text ─────────────────────────────────────────────────
    const rawResponse = buildVoiceResponse({
      intentType:  intent.type,
      trustScore:  actionResult.operatorTrust?.score,
      trustBand:   actionResult.operatorTrust?.band,
      transcript,
    });

    const voiceReply = applyTone(rawResponse, mode.tone);

    // ── 6. Store memory (non-blocking) ─────────────────────────────────────────
    storeConversationMemory({
      userId,
      sessionKey,
      conversationType: 'voice',
      topicKey:         topicKey ?? intent.type,
      userMessage:      transcript,
      novaResponse:     voiceReply,
      inferredIntent:   intent.type,
      emotionalTone:    mode.tone,
      // Approval/rejection interactions are higher salience — more worth remembering
      salienceScore:    ['approve', 'reject'].includes(intent.type) ? 0.80 : 0.55,
      retentionScore:   ['approve', 'reject'].includes(intent.type) ? 0.80 : 0.50,
      metadata: {
        intentConfidence: intent.confidence,
        trustUpdated:     actionResult.operatorTrust?.updated ?? false,
        flaggedForReview: actionResult.flags.flaggedForReview,
        overrideSet:      intent.type === 'command',
      },
    }).catch(err => console.error('[Nova:voice] Memory store failed (non-fatal):', err));

    return NextResponse.json({ response: voiceReply });

  } catch (err: any) {
    console.error('[Nova:voice] Webhook error:', err?.message ?? err);
    // Return a safe spoken fallback — never leave Vapi hanging with an HTTP error
    return NextResponse.json({
      response: 'I encountered an issue. Please try again in a moment.',
    });
  }
}
