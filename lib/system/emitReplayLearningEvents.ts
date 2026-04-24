/**
 * lib/system/emitReplayLearningEvents.ts
 *
 * Converts winning replay variants into actionable learning events.
 * Only emits events for variants where comparison.beatsActual = true.
 *
 * Learning events are stored as applied=false — they're recommendations
 * for calibration cycles to process, not immediate mutations.
 *
 * Maps from variantType → learningType:
 *   policy_disabled         → policy_penalty
 *   policy_modified (better)→ policy_boost   (if modified version wins)
 *   planner_swap            → planner_weight_adjustment
 *   arbitration_alt_winner  → arbitration_weight_adjustment
 *   champion_swap           → champion_demotion_signal
 *   operator_removed        → operator_override_review
 *   confidence_shift        → confidence_recalibration
 */
import connectToDatabase             from '@/lib/mongodb';
import DecisionReplayLearningEvent   from '@/models/system/DecisionReplayLearningEvent';

const VARIANT_TO_LEARNING: Record<string, string> = {
  policy_disabled:        'policy_penalty',
  policy_modified:        'policy_boost',
  planner_swap:           'planner_weight_adjustment',
  arbitration_alt_winner: 'arbitration_weight_adjustment',
  champion_swap:          'champion_demotion_signal',
  operator_removed:       'operator_override_review',
  confidence_shift:       'confidence_recalibration',
  trust_shift:            'confidence_recalibration',
};

export async function emitReplayLearningEvents(input: {
  sourceTraceId: string;
  scopeKey:      string;
  sessionKey:    string;
  variants:      any[];
}): Promise<any[]> {
  await connectToDatabase();
  const emitted: any[] = [];

  for (const variant of input.variants) {
    if (!variant.comparison?.beatsActual) continue;

    const learningType = VARIANT_TO_LEARNING[variant.variantType] ?? null;
    if (!learningType) continue;

    const targetKey =
      variant.mutationSpec?.ruleKey        ??
      variant.mutationSpec?.actionType     ??
      variant.mutationSpec?.fromAction     ??
      variant.mutationSpec?.removeAction   ?? null;

    try {
      const event = await DecisionReplayLearningEvent.create({
        sourceTraceId: input.sourceTraceId,
        sessionKey:    input.sessionKey,
        variantKey:    variant.variantKey,
        learningType,
        scopeKey:      input.scopeKey,
        targetKey,
        recommendation: {
          variantType:      variant.variantType,
          deltaVsActual:    variant.comparison?.deltaVsActual   ?? 0,
          simulatedAction:  variant.simulatedFinalDecision?.actionType ?? null,
          simulatedSource:  variant.simulatedFinalDecision?.authoritySource ?? null,
          estimatedDelta:   variant.estimatedOutcome?.estimatedDelta ?? 0,
          confidence:       variant.estimatedOutcome?.confidence     ?? 0,
          basis:            variant.estimatedOutcome?.basis          ?? '',
          explanation:      variant.comparison?.explanation           ?? '',
        },
        applied: false,
      });
      emitted.push(event);
    } catch { /* ignore duplicate key on re-run */ }
  }

  return emitted;
}
