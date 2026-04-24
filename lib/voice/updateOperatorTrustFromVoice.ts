/**
 * lib/voice/updateOperatorTrustFromVoice.ts
 *
 * Updates an operator's trust score based on a voice approval or rejection.
 * Uses the real OperatorTrustProfile schema from models/governance/:
 *   - overallTrust.score: 0–100 (not 0–1)
 *   - Keyed by operatorId + tenantId
 *
 * Voice deltas are deliberately small (+2 / -2 out of 100) since a single
 * spoken word should not swing trust significantly. The trust system is
 * designed to accumulate evidence across many interactions.
 *
 * Non-fatal: if no profile exists yet, returns a neutral score object
 * without throwing — the voice flow must never fail for a missing profile.
 */

import connectToDatabase from '@/lib/mongodb';

const VOICE_APPROVE_DELTA =  2;  // out of 100
const VOICE_REJECT_DELTA  = -2;

export interface VoiceTrustUpdate {
  operatorId: string;
  tenantId:   string;
  action:     'approve' | 'reject';
}

export interface VoiceTrustResult {
  score:      number;
  band:       string;
  updated:    boolean;
}

export async function updateOperatorTrustFromVoice(
  input: VoiceTrustUpdate,
): Promise<VoiceTrustResult> {
  await connectToDatabase();

  // Lazy-import to avoid circular deps at module load time
  const { OperatorTrustProfile } = await import('@/models/governance/OperatorTrustProfile');

  const profile = await OperatorTrustProfile.findOne({
    operatorId: input.operatorId,
    tenantId:   input.tenantId,
  });

  if (!profile) {
    return { score: 50, band: 'baseline', updated: false };
  }

  const delta = input.action === 'approve' ? VOICE_APPROVE_DELTA : VOICE_REJECT_DELTA;

  profile.overallTrust.score = Math.max(
    0,
    Math.min(100, (profile.overallTrust.score ?? 50) + delta),
  );

  // Re-derive band from score
  const s = profile.overallTrust.score;
  profile.overallTrust.band =
    s >= 90 ? 'elite'      :
    s >= 75 ? 'elevated'   :
    s >= 55 ? 'trusted'    :
    s >= 30 ? 'baseline'   :
    'restricted';

  await profile.save();

  return {
    score:   profile.overallTrust.score,
    band:    profile.overallTrust.band,
    updated: true,
  };
}
