/**
 * lib/system/runDecisionReplaySession.ts
 *
 * Orchestrates the full replay session lifecycle:
 *   1. Reconstruct baseline from GovernedDecisionRecord
 *   2. Create session record
 *   3. For each variant: mutate → simulate → estimate → store
 *   4. Find best variant, update session summary
 *   5. Return session + variants for learning event emission
 */
import connectToDatabase          from '@/lib/mongodb';
import DecisionReplaySession      from '@/models/system/DecisionReplaySession';
import DecisionReplayVariant      from '@/models/system/DecisionReplayVariant';
import { reconstructReplayState } from './reconstructReplayState';
import { applyReplayMutation }    from './applyReplayMutation';
import { runReplaySimulation }    from './runReplaySimulation';

export interface ReplaySessionInput {
  traceId:      string;
  replayType:   'exact' | 'counterfactual' | 'scenario';
  initiatedBy?: 'system' | 'operator' | 'policy_review' | 'drift_review';
  variants:     Array<{ variantType: string; mutationSpec?: any }>;
  notes?:       string;
}

export interface ReplaySessionResult {
  sessionKey: string;
  variants:   any[];
  summary:    any;
}

export async function runDecisionReplaySession(input: ReplaySessionInput): Promise<ReplaySessionResult> {
  await connectToDatabase();

  // 1. Reconstruct baseline
  const baseline    = await reconstructReplayState(input.traceId);
  const sessionKey  = `${input.traceId}::${Date.now()}`;

  await DecisionReplaySession.create({
    sessionKey,
    sourceTraceId:    input.traceId,
    sourceDecisionId: baseline._id,
    replayType:       input.replayType,
    initiatedBy:      input.initiatedBy ?? 'system',
    status:           'running',
    baselineSnapshot: {
      finalDecision:  baseline.finalDecision,
      authorityPath:  baseline.authorityPath,
      anomalyType:    baseline.anomalyType,
      scopeKey:       baseline.scopeKey,
      outcome:        baseline.outcome,
    },
    notes: input.notes ?? '',
  });

  const savedVariants: any[] = [];
  const actualDelta = baseline.outcome?.delta ?? 0;

  // 2. Run each variant
  for (let i = 0; i < input.variants.length; i++) {
    const v = input.variants[i];
    try {
      const mutated   = applyReplayMutation(baseline, v.variantType, v.mutationSpec ?? {});
      const simResult = await runReplaySimulation({ replayState: mutated, variantType: v.variantType });

      const estimatedDelta = simResult.estimatedOutcome.estimatedDelta;
      const beatsActual    = estimatedDelta > actualDelta;
      const variantKey     = `${sessionKey}::${v.variantType}::${i + 1}`;

      const saved = await DecisionReplayVariant.create({
        sessionKey,
        variantKey,
        variantType:  v.variantType,
        mutationSpec: v.mutationSpec ?? {},
        simulatedEnvelope: {
          traceId:       simResult.simulatedEnvelope.traceId,
          finalDecision: simResult.simulatedEnvelope.finalDecision,
          authorityPath: simResult.simulatedEnvelope.authorityPath,
          authoritySource: simResult.simulatedEnvelope.authoritySource,
          isSimulation:  true,
        },
        simulatedFinalDecision: {
          actionType:     simResult.simulatedEnvelope.finalDecision?.actionType,
          authoritySource:simResult.simulatedEnvelope.finalDecision?.source,
          executionMode:  simResult.simulatedEnvelope.finalDecision?.executionMode,
          reasoning:      simResult.simulatedEnvelope.finalDecision?.reasoning,
        },
        estimatedOutcome: {
          outcomeLabel:   simResult.estimatedOutcome.outcomeLabel,
          estimatedDelta: simResult.estimatedOutcome.estimatedDelta,
          confidence:     simResult.estimatedOutcome.confidence,
          basis:          simResult.estimatedOutcome.basis,
        },
        comparison: {
          beatsActual,
          deltaVsActual: estimatedDelta - actualDelta,
          explanation: beatsActual
            ? `Variant '${v.variantType}' likely outperforms original (Δ${(estimatedDelta - actualDelta).toFixed(1)})`
            : `Variant '${v.variantType}' does not outperform original (Δ${(estimatedDelta - actualDelta).toFixed(1)})`,
        },
      });

      savedVariants.push(saved);
    } catch (err: any) {
      console.error(`[runDecisionReplaySession] variant ${v.variantType} failed:`, err?.message);
    }
  }

  // 3. Find best variant + build summary
  const sorted  = savedVariants
    .filter((v: any)  => v.comparison?.beatsActual)
    .sort((a: any, b: any) => (b.comparison?.deltaVsActual ?? 0) - (a.comparison?.deltaVsActual ?? 0));
  const best    = sorted[0] ?? null;

  const summary = {
    variantCount:         savedVariants.length,
    bestVariantKey:       best?.variantKey ?? null,
    actualVsBestDelta:    best?.comparison?.deltaVsActual ?? 0,
    plannerWouldLose:     savedVariants.some((v: any) => v.variantType === 'planner_swap'           && v.comparison?.beatsActual),
    arbitrationWouldLose: savedVariants.some((v: any) => v.variantType === 'arbitration_alt_winner' && v.comparison?.beatsActual),
    policyWouldLose:      savedVariants.some((v: any) => v.variantType === 'policy_disabled'        && v.comparison?.beatsActual),
  };

  await DecisionReplaySession.updateOne({ sessionKey }, {
    $set: {
      status: 'completed',
      summary,
    },
  });

  return { sessionKey, variants: savedVariants, summary };
}
