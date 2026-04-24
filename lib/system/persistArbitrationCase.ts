/**
 * lib/system/persistArbitrationCase.ts
 *
 * Persists an ArbitrationCase record derived from a runArbitration() result.
 * Called from buildInterventionPlan after arbitration completes.
 *
 * Wrapped in try/catch — arbitration persistence failure must never block
 * the planner from returning a decision.
 *
 * outcome is null until resolved by runPlannerFeedbackLoop.
 */
import connectToDatabase  from '@/lib/mongodb';
import ArbitrationCase    from '@/models/ArbitrationCase';
import type { ArbitrationResult, ArbitrationInput } from './runArbitration';

export async function persistArbitrationCase(input: {
  tenantId:    string;
  scopeKey:    string;
  plannerDecisionId?: string;
  anomalyType:    string;
  lifecycleStage: string;
  arb:    ArbitrationResult;
  plannerIn:  ArbitrationInput['planner'];
  policyIn?:  ArbitrationInput['policy'];
  championIn?: ArbitrationInput['champion'];
  operatorIn?: ArbitrationInput['operator'];
}): Promise<void> {
  try {
    await connectToDatabase();

    const caseKey = `${input.tenantId}::${input.scopeKey}::${input.plannerDecisionId ?? Date.now()}`;

    await ArbitrationCase.create({
      caseKey,
      tenantId:  input.tenantId,
      scopeKey:  input.scopeKey,
      plannerDecisionId: input.plannerDecisionId ?? null,
      anomalyType:    input.anomalyType,
      lifecycleStage: input.lifecycleStage,

      plannerDecision: {
        actionType: input.plannerIn.actionType,
        score:      input.plannerIn.adjustedScore,
        confidence: input.plannerIn.confidence,
      },
      policyDecision: input.policyIn ? {
        actionType: input.policyIn.actionType,
        ruleKey:    input.policyIn.ruleKey,
        weight:     input.policyIn.ruleWeight,
        rolloutMode:input.policyIn.rolloutMode,
      } : {},
      championDecision: input.championIn ? {
        actionType:     input.championIn.actionType,
        successRate:    input.championIn.successRate,
        dominanceScore: input.championIn.lockConfidence,
      } : {},
      operatorConstraint: {
        blockedActions: input.operatorIn?.blockedActions ?? [],
        forcedActions:  input.operatorIn?.forcedActions  ?? [],
      },

      conflictType:     input.arb.conflictType,
      wasConflict:      input.arb.wasConflict,
      scoreMargin:      input.arb.scoreMargin,
      shadowTestTriggered: input.arb.shadowTestTriggered,

      finalDecision: {
        actionType: input.arb.actionType,
        source:     input.arb.source,
        reasoning:  input.arb.reasoning,
      },
      authorityScores: input.arb.authorityScores,
      resolved: false,
    });
  } catch (err: any) {
    // Log but never throw — arbitration persistence is advisory
    console.warn('[persistArbitrationCase] failed to persist:', err?.message);
  }
}
