/**
 * lib/system/detectDecisionConflict.ts
 *
 * Pure function — detects whether multiple decision sources disagree on the action.
 *
 * Returns null when all present sources agree.
 * operator_override is returned first regardless of action agreement.
 * multi_source_conflict when 3+ distinct actions present.
 */

export type ConflictType =
  | 'planner_vs_policy'
  | 'planner_vs_champion'
  | 'policy_vs_champion'
  | 'operator_override'
  | 'multi_source_conflict'
  | 'no_conflict';

export function detectDecisionConflict(input: {
  planner:   { actionType: string | null };
  policy?:   { actionType: string | null } | null;
  champion?: { actionType: string | null } | null;
  operator?: { forcedActions?: string[]; blockedActions?: string[] } | null;
}): ConflictType {
  // Operator override is always surfaced even when sources agree
  if (input.operator?.forcedActions?.length) return 'operator_override';

  const actions = [
    input.planner?.actionType,
    input.policy?.actionType,
    input.champion?.actionType,
  ].filter((a): a is string => !!a);

  const unique = [...new Set(actions)];

  if (unique.length <= 1) return 'no_conflict';

  if (unique.length > 2) return 'multi_source_conflict';

  // Exactly 2 distinct actions — identify which pair conflicts
  const pAction  = input.planner.actionType;
  const poAction = input.policy?.actionType;
  const chAction = input.champion?.actionType;

  if (pAction && poAction && pAction !== poAction) return 'planner_vs_policy';
  if (pAction && chAction && pAction !== chAction) return 'planner_vs_champion';
  if (poAction && chAction && poAction !== chAction) return 'policy_vs_champion';

  return 'no_conflict';
}
