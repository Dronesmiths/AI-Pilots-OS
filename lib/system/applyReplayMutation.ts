/**
 * lib/system/applyReplayMutation.ts
 *
 * Pure function — applies a controlled change to a replay baseline state.
 * Uses structuredClone so the baseline is never mutated.
 *
 * Each variantType changes exactly one dimension of the decision context.
 * This is the "one variable at a time" principle for counterfactual analysis.
 */
import type { ReplayState } from './reconstructReplayState';

export function applyReplayMutation(
  baseline:     ReplayState,
  variantType:  string,
  mutationSpec: any,
): ReplayState {
  // structuredClone ensures deep isolation — baseline state is never modified
  const cloned: ReplayState = structuredClone(baseline);

  switch (variantType) {

    // Exact copy — used for reproducibility verification
    case 'exact_reconstruction':
      return cloned;

    // Remove one specific planner candidate, boosting the runner-up
    case 'planner_swap': {
      const removeAction = mutationSpec.removeAction ?? null;
      if (removeAction) {
        cloned.plannerCandidates = cloned.plannerCandidates.filter(
          (c: any) => c.actionType !== removeAction
        );
      }
      // Optionally inject a specific alternative candidate
      if (mutationSpec.injectCandidate) {
        cloned.plannerCandidates = [mutationSpec.injectCandidate, ...cloned.plannerCandidates];
      }
      return cloned;
    }

    // Remove a specific policy rule influence entirely
    case 'policy_disabled': {
      const ruleKey = mutationSpec.ruleKey ?? null;
      cloned.policyInfluences = cloned.policyInfluences.filter(
        (p: any) => p.ruleKey !== ruleKey
      );
      return cloned;
    }

    // Modify a policy rule's weight or rollout mode
    case 'policy_modified': {
      cloned.policyInfluences = cloned.policyInfluences.map((p: any) =>
        p.ruleKey === mutationSpec.ruleKey
          ? { ...p, ...(mutationSpec.overrides ?? {}) }
          : p
      );
      return cloned;
    }

    // Swap champion action to the runner-up (or a specified alternative)
    case 'champion_swap': {
      cloned.marketEvidence = cloned.marketEvidence.map((m: any) =>
        m.actionType === mutationSpec.fromAction
          ? { ...m, actionType: mutationSpec.toAction, swapped: true }
          : m
      );
      return cloned;
    }

    // Remove all inherited influences (topology weight removed)
    case 'inheritance_disabled':
      cloned.inheritedInfluences = [];
      return cloned;

    // Remove operator override (see what system would have done alone)
    case 'operator_removed':
      cloned.operatorGovernance = null;
      return cloned;

    // Shift confidence of a specific planner candidate
    case 'confidence_shift': {
      cloned.plannerCandidates = cloned.plannerCandidates.map((c: any) =>
        c.actionType === mutationSpec.actionType
          ? { ...c, confidence: mutationSpec.newConfidence, adjustedScore: mutationSpec.newScore ?? c.adjustedScore }
          : c
      );
      return cloned;
    }

    // Elevate or reduce anomaly severity / risk band (scenario simulation)
    case 'risk_shift':
      cloned.anomalySeverity = mutationSpec.newSeverity ?? cloned.anomalySeverity;
      cloned.contextSnapshot = {
        ...cloned.contextSnapshot,
        riskBand: mutationSpec.newRiskBand ?? cloned.contextSnapshot.riskBand,
      };
      return cloned;

    // Change trust tier context (raises/lowers what executes auto vs suggest)
    case 'trust_shift':
      cloned.contextSnapshot = {
        ...cloned.contextSnapshot,
        trustTier: mutationSpec.newTrustTier ?? cloned.contextSnapshot.trustTier,
      };
      return cloned;

    // Force the arbitration to have selected an alternate winner
    case 'arbitration_alt_winner':
      cloned.arbitration = {
        ...(cloned.arbitration ?? {}),
        forcedWinner:    mutationSpec.actionType,
        forcedSource:    mutationSpec.source ?? 'challenger',
        wasConflict:     true,
        conflictType:    'arbitration_alt_winner',
      };
      return cloned;

    default:
      // Unknown mutation type — return unmodified clone (safe fallback)
      console.warn(`[applyReplayMutation] Unknown variantType: ${variantType} — returning unmodified baseline`);
      return cloned;
  }
}
