/**
 * lib/system/buildActionContextSnapshot.ts
 *
 * Captures the full causal context for a tenant at a given moment.
 * Uses Mongoose models — no raw DB calls.
 *
 * Called at action evaluation time (10min after execution) to build
 * the "before" context from stored before-metadata PLUS live data
 * that wasn't captured at action creation time:
 *   - lifecyclePattern (recent event types)
 *   - openAnomalyCount (how many anomalies were open)
 *   - milestoneCount (lifecycle milestone trajectory)
 *
 * The stored before-metadata (beforeRuntimeState, beforeQueueDepth, etc.)
 * covers the core state signals. This adds lifecycle richness.
 */

import connectToDatabase         from '@/lib/mongodb';
import TenantRuntimeState        from '@/models/TenantRuntimeState';
import TenantLifecycleAnomaly    from '@/models/TenantLifecycleAnomaly';
import TenantLifecycleEvent      from '@/models/TenantLifecycleEvent';

export interface ActionContextSnapshot {
  runtimeState:     string;
  healthScore:      number;
  queueDepth:       number;
  recoveryCount24h: number;
  recentFailures:   number;
  milestoneCount:   number;
  openAnomalyCount: number;
  lifecyclePattern: string[]; // last 5 event types, oldest-first
}

export async function buildActionContextSnapshot(tenantId: string): Promise<ActionContextSnapshot> {
  await connectToDatabase();

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [runtime, openAnomalyCount, recoveryCount24h, milestoneCount, recentEvents] = await Promise.all([
    TenantRuntimeState.findOne({ tenantId }).select('state metrics').lean() as Promise<any>,
    TenantLifecycleAnomaly.countDocuments({ tenantId, status: 'open' }),
    TenantLifecycleEvent.countDocuments({ tenantId, type: 'recovery_action', createdAt: { $gte: since24h } }),
    TenantLifecycleEvent.countDocuments({ tenantId, type: 'milestone' }),
    TenantLifecycleEvent.find({ tenantId }).sort({ createdAt: -1 }).limit(5).select('type').lean() as Promise<any[]>,
  ]);

  return {
    runtimeState:     (runtime as any)?.state              ?? 'cold',
    healthScore:      (runtime as any)?.metrics?.healthScore ?? 0,
    queueDepth:       (runtime as any)?.metrics?.queueDepth  ?? 0,
    recoveryCount24h,
    recentFailures:   0,  // populated from action.metadata.beforeRecoveryCount24h if available
    milestoneCount,
    openAnomalyCount,
    lifecyclePattern: recentEvents.map((e: any) => e.type).reverse(), // oldest-first
  };
}
