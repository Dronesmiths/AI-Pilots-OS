/**
 * lib/system/evaluateReplayWeightSafetyGate.ts
 * lib/system/evaluateAdaptiveWeightRollback.ts
 * lib/system/applyAdaptiveWeightProfile.ts
 *
 * Three pure/async functions, one file — all related to weight lifecycle safety.
 */
import connectToDatabase     from '@/lib/mongodb';
import AdaptiveWeightProfile from '@/models/system/AdaptiveWeightProfile';

// ── 1. Safety Gate ─────────────────────────────────────────────────────────
export type SafetyVerdict = 'shadow' | 'approval_required' | 'approved' | 'rejected';

export interface SafetyGateResult {
  verdict:  SafetyVerdict;
  rationale:string;
}

const PROTECTED_FIELDS = new Set([
  'constitutionalSafetyThreshold', 'emergencyPrivilegeGate', 'maxGlobalRiskCeiling',
]);

export function evaluateReplayWeightSafetyGate(input: {
  supportCount: number;
  confidence:   number;
  harmRisk:     number;
  targetField:  string;
}): SafetyGateResult {
  // Constitutional hard block
  if (PROTECTED_FIELDS.has(input.targetField)) {
    return { verdict: 'rejected', rationale: 'Protected constitutional field — cannot be replay-updated' };
  }

  // Minimum replay support required
  if (input.supportCount < 5) {
    return { verdict: 'rejected', rationale: `Insufficient replay support (${input.supportCount}/5)` };
  }

  // Elevated harm risk → human approval required
  if (input.harmRisk > 0.3) {
    return { verdict: 'approval_required', rationale: `Elevated harm risk ${(input.harmRisk * 100).toFixed(0)}% — requires operator approval` };
  }

  // Low confidence → shadow only
  if (input.confidence < 0.45) {
    return { verdict: 'shadow', rationale: `Low confidence ${(input.confidence * 100).toFixed(0)}% — shadow rollout until evidence improves` };
  }

  return { verdict: 'approved', rationale: 'Safe for governed shadow rollout (starts in shadow mode)' };
}

// ── 2. Rollback Evaluator ─────────────────────────────────────────────────
export interface RollbackEvaluation {
  rollbackScore: number;
  shouldRollback:boolean;
  dominantReason: string;
}

export function evaluateAdaptiveWeightRollback(input: {
  sampleCount: number;
  hitRate:     number;
  harmRate:    number;
  avgDelta:    number;
}): RollbackEvaluation {
  let rollbackScore = 0;
  const reasons: string[] = [];

  if (input.sampleCount >= 8 && input.hitRate < 0.45) { rollbackScore += 20; reasons.push('low_hit_rate'); }
  if (input.harmRate > 0.2)  { rollbackScore += 30; reasons.push('elevated_harm'); }
  if (input.avgDelta < 0)    { rollbackScore += 18; reasons.push('negative_delta'); }
  // Asymmetric: add extra penalty for very harmful patterns
  if (input.harmRate > 0.35) { rollbackScore += 15; reasons.push('critical_harm'); }

  return {
    rollbackScore,
    shouldRollback:  rollbackScore >= 35,
    dominantReason:  reasons[0] ?? 'stable',
  };
}

// ── 3. Apply Weight Profile ───────────────────────────────────────────────
export async function applyAdaptiveWeightProfile(input: {
  profileKey:  string;
  field:       string;
  value:       number;
  rolloutMode: 'shadow' | 'limited' | 'active';
}): Promise<any> {
  await connectToDatabase();
  const profile = await AdaptiveWeightProfile.findOne({ profileKey: input.profileKey });
  if (!profile) throw new Error(`AdaptiveWeightProfile not found: ${input.profileKey}`);

  profile[input.field] = input.value;
  profile.rolloutMode   = input.rolloutMode;
  profile.lastAppliedAt = new Date();
  profile.sampleCount   = (profile.sampleCount ?? 0) + 1;
  profile.status        = 'learning';

  await profile.save();
  return profile.toObject();
}
