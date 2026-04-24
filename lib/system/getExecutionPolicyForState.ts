/**
 * lib/system/getExecutionPolicyForState.ts
 *
 * Maps system runtime state → execution constraints.
 * CRITICAL: supervisor and drones read this before every batch.
 *
 * Usage:
 *   const runtime = await SystemRuntimeState.findOne({ systemKey: 'primary' }).lean();
 *   const policy  = getExecutionPolicyForState(runtime?.state ?? 'cold');
 *   const batchSize = policy.maxJobsPerCycle;
 */

export type RuntimeState = 'cold' | 'warming' | 'warm' | 'degraded';

export interface ExecutionPolicy {
  maxJobsPerCycle:       number;
  allowReinforcement:    boolean;
  allowPolicyPromotion:  boolean;
  allowBanditPromotion:  boolean;
  allowFullSwarm:        boolean;
  allowRecoveryActions:  boolean;
  label:                 string;
}

const POLICIES: Record<RuntimeState, ExecutionPolicy> = {
  cold: {
    maxJobsPerCycle:      5,
    allowReinforcement:   false,
    allowPolicyPromotion: false,
    allowBanditPromotion: false,
    allowFullSwarm:       false,
    allowRecoveryActions: true,  // recovery is always allowed
    label:                'Cold — conservative execution',
  },
  warming: {
    maxJobsPerCycle:      12,
    allowReinforcement:   true,
    allowPolicyPromotion: false,
    allowBanditPromotion: false,
    allowFullSwarm:       false,
    allowRecoveryActions: true,
    label:                'Warming — core jobs only',
  },
  warm: {
    maxJobsPerCycle:      50,
    allowReinforcement:   true,
    allowPolicyPromotion: true,
    allowBanditPromotion: true,
    allowFullSwarm:       true,
    allowRecoveryActions: true,
    label:                'Warm — full autonomous execution',
  },
  degraded: {
    maxJobsPerCycle:      8,
    allowReinforcement:   false,
    allowPolicyPromotion: false,
    allowBanditPromotion: false,
    allowFullSwarm:       false,
    allowRecoveryActions: true,  // recovery takes priority
    label:                'Degraded — throttled, recovery prioritized',
  },
};

export function getExecutionPolicyForState(state: RuntimeState): ExecutionPolicy {
  return POLICIES[state] ?? POLICIES.cold;
}

// Convenience: fetch current state and return policy in one call
// (for use in drone workers that don't want to import the full model)
import connectToDatabase    from '@/lib/mongodb';
import SystemRuntimeState   from '@/models/SystemRuntimeState';

export async function getCurrentExecutionPolicy(): Promise<ExecutionPolicy & { state: RuntimeState }> {
  await connectToDatabase();
  const doc = await SystemRuntimeState.findOne({ systemKey: 'primary' })
    .select('state')
    .lean() as any;
  const state = (doc?.state ?? 'cold') as RuntimeState;
  return { ...getExecutionPolicyForState(state), state };
}
