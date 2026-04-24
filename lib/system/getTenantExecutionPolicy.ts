/**
 * lib/system/getTenantExecutionPolicy.ts
 *
 * Resolves the effective execution policy for a specific tenant
 * by combining global and tenant runtime states.
 *
 * Usage (in drone workers, queue dispatchers, recovery engine):
 *
 *   import { getEffectiveTenantPolicy } from '@/lib/system/getTenantExecutionPolicy';
 *
 *   const { effectiveState, policy } = await getEffectiveTenantPolicy(tenantId);
 *   const batchSize = policy.maxJobsPerCycle;
 *   if (!policy.allowReinforcement) return; // skip when tenant not ready
 *
 * The global state acts as a ceiling — a warm tenant on a cold platform
 * still gets cold behavior.
 */

import connectToDatabase             from '@/lib/mongodb';
import SystemRuntimeState            from '@/models/SystemRuntimeState';
import TenantRuntimeState            from '@/models/TenantRuntimeState';
import { getExecutionPolicyForState } from './getExecutionPolicyForState';
import { resolveEffectiveRuntimeState, type RuntimeState } from './resolveEffectiveRuntimeState';

export interface TenantExecutionPolicy {
  globalState:    RuntimeState;
  tenantState:    RuntimeState;
  effectiveState: RuntimeState;
  policy:         ReturnType<typeof getExecutionPolicyForState>;
}

/**
 * Pure resolver — no DB calls. Use when you already have the states.
 */
export function getTenantExecutionPolicy(params: {
  globalState: RuntimeState;
  tenantState: RuntimeState;
}): Omit<TenantExecutionPolicy, never> {
  const effectiveState = resolveEffectiveRuntimeState(params.globalState, params.tenantState);
  return {
    globalState:    params.globalState,
    tenantState:    params.tenantState,
    effectiveState,
    policy:         getExecutionPolicyForState(effectiveState),
  };
}

/**
 * DB-backed resolver — fetches both states and returns combined policy.
 * This is the primary entry point for drone workers.
 */
export async function getEffectiveTenantPolicy(tenantId: string): Promise<TenantExecutionPolicy> {
  await connectToDatabase();

  const [globalDoc, tenantDoc] = await Promise.all([
    SystemRuntimeState.findOne({ systemKey: 'primary' }).select('state').lean() as Promise<any>,
    TenantRuntimeState.findOne({ tenantId }).select('state').lean() as Promise<any>,
  ]);

  const globalState = (globalDoc?.state ?? 'cold') as RuntimeState;
  const tenantState = (tenantDoc?.state ?? 'cold') as RuntimeState;

  return getTenantExecutionPolicy({ globalState, tenantState });
}
