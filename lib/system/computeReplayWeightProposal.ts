/**
 * lib/system/computeReplayWeightProposal.ts
 *
 * Pure function — computes a safe, bounded weight update proposal.
 *
 * Core rules:
 *   1. Minimum 5 replay variants before any proposal (insufficient data → rejected)
 *   2. Step size capped at ±0.08 per cycle (small nudges, not rewrites)
 *   3. All weights clamped to [0.4, 1.8] (safe operating range)
 *   4. Harm risk estimate based on policy/operator variants (higher caution)
 *   5. Proposal confidence escalates with sample count, capped at 0.95
 *
 * variantType → targetField mapping:
 *   planner_swap / arbitration_alt_winner → plannerWeight / arbitrationPlannerWeight
 *   policy_disabled / policy_modified     → policyWeight
 *   operator_removed                      → all arbitration weights (slight reduction)
 *   champion_swap                         → championWeight
 *   confidence_shift                      → confidenceDoubtMultiplier
 *   inheritance_disabled                  → inheritedWeight
 */

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, parseFloat(n.toFixed(4))));
}

export interface WeightProposal {
  targetField:   string;
  updateType:    string;
  proposedValue: number;
  delta:         number;
  confidence:    number;
  harmRisk:      number;
  rationale:     string;
}

const VARIANT_TARGET: Record<string, { field: string; updateType: string }> = {
  planner_swap:           { field: 'plannerWeight',             updateType: 'planner_weight_shift'       },
  arbitration_alt_winner: { field: 'arbitrationPlannerWeight',  updateType: 'arbitration_weight_shift'   },
  policy_disabled:        { field: 'policyWeight',              updateType: 'policy_weight_shift'        },
  policy_modified:        { field: 'policyWeight',              updateType: 'policy_weight_shift'        },
  operator_removed:       { field: 'arbitrationChampionWeight', updateType: 'arbitration_weight_shift'   },
  champion_swap:          { field: 'championWeight',            updateType: 'champion_weight_shift'      },
  confidence_shift:       { field: 'confidenceDoubtMultiplier', updateType: 'confidence_doubt_shift'     },
  trust_shift:            { field: 'confidenceDoubtMultiplier', updateType: 'confidence_doubt_shift'     },
  inheritance_disabled:   { field: 'inheritedWeight',           updateType: 'inherited_weight_shift'     },
};

// Higher harm risk for policy and operator variants (they affect more scopes)
const HARM_RISK_BY_TYPE: Record<string, number> = {
  policy_disabled: 0.25, policy_modified: 0.15, operator_removed: 0.20,
  champion_swap: 0.12, planner_swap: 0.10, arbitration_alt_winner: 0.18,
  confidence_shift: 0.08, trust_shift: 0.08, inheritance_disabled: 0.05,
};

export function computeReplayWeightProposal(input: {
  currentValue:       number;
  variantType:        string;
  winRate:            number;
  avgReplayAdvantage: number;
  supportCount:       number;
  avgConfidence?:     number;
}): WeightProposal | null {
  const mapping = VARIANT_TARGET[input.variantType];
  if (!mapping) return null;

  if (input.supportCount < 5) {
    return {
      targetField: mapping.field, updateType: mapping.updateType,
      proposedValue: input.currentValue, delta: 0, confidence: 0.15,
      harmRisk: HARM_RISK_BY_TYPE[input.variantType] ?? 0.1,
      rationale: `Insufficient replay support (${input.supportCount}/5 required)`,
    };
  }

  // Advantage factor: clamp replay advantage contribution to ±15% of a step
  const advantageFactor = clamp(input.avgReplayAdvantage / 100, -0.15, 0.15);

  let delta = 0;
  switch (input.variantType) {
    case 'planner_swap':
    case 'arbitration_alt_winner':
      // planner wins more often when swapped → boost planner weight
      delta = (input.winRate - 0.5) * 0.12 + advantageFactor;
      break;
    case 'policy_disabled':
    case 'policy_modified':
      // disabling/modifying policy wins → reduce policy influence
      delta = (0.45 - input.winRate) * 0.14 + advantageFactor;
      break;
    case 'operator_removed':
      // operator removed wins → system is better without override → slight reduction in operator-path weights
      delta = (0.45 - input.winRate) * 0.12 + advantageFactor;
      break;
    case 'champion_swap':
      // challenger swap wins → current champion is overvalued → reduce champion weight
      delta = (0.45 - input.winRate) * 0.10 + advantageFactor;
      break;
    case 'confidence_shift':
    case 'trust_shift':
      // confidence shift wins → current doubt multiplier is wrong direction
      delta = (input.winRate - 0.5) * 0.08 + advantageFactor;
      break;
    case 'inheritance_disabled':
      // removing inheritance wins → inherited evidence is overweighted
      delta = (0.45 - input.winRate) * 0.09 + advantageFactor;
      break;
  }

  // Hard cap: max ±0.08 per cycle
  delta = clamp(delta, -0.08, 0.08);

  const confidence = clamp(
    (input.supportCount / 20) * 0.5 +
    (input.avgConfidence ?? 0.5) * 0.3 +
    Math.abs(input.avgReplayAdvantage) / 60,
    0, 0.95
  );

  const harmRisk = clamp(
    (HARM_RISK_BY_TYPE[input.variantType] ?? 0.1) + (Math.abs(delta) * 0.5),
    0, 1
  );

  return {
    targetField:   mapping.field,
    updateType:    mapping.updateType,
    proposedValue: clamp(input.currentValue + delta, 0.4, 1.8),
    delta,
    confidence,
    harmRisk,
    rationale: `Replay evidence (n=${input.supportCount}, winRate=${(input.winRate * 100).toFixed(0)}%, avgΔ=${input.avgReplayAdvantage.toFixed(1)}) supports bounded weight shift`,
  };
}
