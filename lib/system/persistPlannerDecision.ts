/**
 * lib/system/persistPlannerDecision.ts
 *
 * Creates a PlannerDecisionRecord from the output of buildInterventionPlan().
 * Called fire-and-forget immediately after plan is built.
 *
 * The record captures the full decision context at the moment of recommendation
 * so the feedback resolver can evaluate it later without reconstructing history.
 *
 * Never throws — all errors are logged and swallowed.
 * Void return — does not block plan delivery.
 */
import connectToDatabase      from '@/lib/mongodb';
import PlannerDecisionRecord  from '@/models/PlannerDecisionRecord';
import type { InterventionPlan, InterventionCandidate } from './buildInterventionPlan';

export async function persistPlannerDecision(
  plan:           InterventionPlan,
  contextSnapshot: {
    runtimeState:    string;
    healthScore:     number;
    queueDepth:      number;
    recentFailures:  number;
    milestoneCount:  number;
    lifecyclePattern:string[];
  },
): Promise<void> {
  try {
    await connectToDatabase();

    if (!plan.recommendedAction) return; // nothing to persist for empty plans

    await PlannerDecisionRecord.create({
      tenantId:    plan.tenantId,
      anomalyType: plan.anomalyType,

      lifecycleStage: plan.supportingContext.lifecycleStage,
      trustTier:      plan.supportingContext.trustTier,
      policyMode:     plan.candidates[0]?.policyMode ?? 'recommend_only',

      contextSnapshot,

      recommendedAction:     plan.recommendedAction,
      recommendedReason:     plan.reason,
      recommendedConfidence: plan.confidence,
      executionMode:         plan.executionMode,
      winningSource:         (plan.candidates[0]?.source ?? 'graph') as any,
      strategy:              plan.strategy,

      candidates: plan.candidates.map((c: InterventionCandidate) => ({
        actionType:    c.actionType,
        baseScore:     c.baseScore,
        adjustedScore: c.adjustedScore,
        confidence:    c.confidence,
        source:        c.source,
        trustTier:     c.trustTier,
        policyMode:    c.policyMode,
        successRate:   c.metrics.successRate,
        worsenedRate:  c.metrics.worsenedRate,
      })),

      rejected: plan.rejected,

      selectedAction: plan.recommendedAction,
      executed:       plan.executionMode === 'auto', // auto plans are pre-assumed executed
      feedbackStatus: 'pending',
      observationWindowMinutes: plan.executionMode === 'auto' ? 60 : 120,
    });
  } catch (err: any) {
    console.error('[persistPlannerDecision] failed:', err?.message);
  }
}
