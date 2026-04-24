/**
 * lib/system/getActionExecutionPolicy.ts
 *
 * DB-backed policy resolver for the anomaly action engine.
 * Called before executing each pending action.
 *
 * Returns the governing mode:
 *   'disabled'        → skip, don't run
 *   'recommend_only'  → save as suggestion, don't auto-run
 *   'manual_approved' → block auto-run, wait for operator
 *   'auto'            → safe to auto-execute
 *
 * Falls back to 'recommend_only' if no policy doc exists yet.
 * This is the safe default: unknown actions are never auto-executed.
 */

import connectToDatabase  from '@/lib/mongodb';
import AnomalyActionPolicy from '@/models/AnomalyActionPolicy';

export type ActionMode = 'disabled' | 'recommend_only' | 'manual_approved' | 'auto';

export interface ExecutionPolicyResult {
  mode:         ActionMode;
  reviewStatus: string;
  fromPolicy:   boolean; // false = fallback default
}

export async function getActionExecutionPolicy(
  anomalyType: string,
  actionType:  string,
): Promise<ExecutionPolicyResult> {
  await connectToDatabase();

  const policy = await AnomalyActionPolicy
    .findOne({ anomalyType, actionType })
    .select('mode reviewStatus')
    .lean() as any;

  if (!policy) {
    return { mode: 'recommend_only', reviewStatus: 'pending', fromPolicy: false };
  }

  return {
    mode:         policy.mode as ActionMode,
    reviewStatus: policy.reviewStatus,
    fromPolicy:   true,
  };
}
