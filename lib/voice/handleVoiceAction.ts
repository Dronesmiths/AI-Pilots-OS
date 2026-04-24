/**
 * lib/voice/handleVoiceAction.ts
 *
 * Dispatches a voice intent to the appropriate system action and builds
 * a structured result context for voice response generation.
 *
 * Actions per intent type:
 *   approve  → update operator trust (+2), flag for governance reinforcement
 *   reject   → update operator trust (-2), flag strategy/proposal for review
 *   question → no state change; signals "pull narrative" for response
 *   command  → no state change yet; logged for future command routing
 *   general  → no state change
 *
 * operatorId default: falls back to userId so single-operator deployments
 * (where userId === operatorId) work without extra config.
 * tenantId: read from env or defaults to 'default' for single-tenant setups.
 */

import { updateOperatorTrustFromVoice } from './updateOperatorTrustFromVoice';
import type { VoiceIntent }             from './extractVoiceIntent';

export interface VoiceActionContext {
  intentType:       string;
  operatorTrust:    { score: number; band: string; updated: boolean } | null;
  recentMemories:   any[];
  flags: {
    shouldPullNarrative: boolean;
    flaggedForReview:    boolean;
    governanceTriggered: boolean;
  };
}

export async function handleVoiceAction(input: {
  intent:      VoiceIntent;
  transcript:  string;
  userId:      string;
  tenantId?:   string;
}): Promise<VoiceActionContext> {
  const tenantId   = input.tenantId   ?? process.env.DEFAULT_TENANT_ID ?? 'default';
  const operatorId = input.userId;

  let operatorTrust: VoiceActionContext['operatorTrust'] = null;

  if (input.intent.type === 'approve') {
    operatorTrust = await updateOperatorTrustFromVoice({
      operatorId,
      tenantId,
      action: 'approve',
    });
  }

  if (input.intent.type === 'reject') {
    operatorTrust = await updateOperatorTrustFromVoice({
      operatorId,
      tenantId,
      action: 'reject',
    });
  }

  return {
    intentType:    input.intent.type,
    operatorTrust,
    recentMemories: [],  // populated by the route when pre-fetching context
    flags: {
      shouldPullNarrative: input.intent.type === 'question',
      flaggedForReview:    input.intent.type === 'reject',
      governanceTriggered: false,  // reserved for future proposal-gating
    },
  };
}
