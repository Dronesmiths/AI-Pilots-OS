/**
 * lib/system/saveAnomalyActions.ts
 *
 * Persists recommended actions for a set of detected anomalies.
 * Deduplicates: only creates a new doc if no pending action exists for that
 * (tenantId, anomalyType) pair — so repeated sweeps don't create duplicates.
 *
 * Returns the list of actions that were newly created (not deduplicated).
 */

import connectToDatabase    from '@/lib/mongodb';
import TenantAnomalyAction  from '@/models/TenantAnomalyAction';
import { generateAnomalyActions } from './generateAnomalyActions';
import { type TenantAnomaly }     from './detectTenantAnomalies';

export async function saveAnomalyActions(tenantId: string, anomalies: TenantAnomaly[]) {
  await connectToDatabase();

  const created = [];

  for (const anomaly of anomalies) {
    // Skip if a pending action for this anomaly type already exists
    const existing = await TenantAnomalyAction.findOne({
      tenantId,
      anomalyType: anomaly.type,
      status:      'pending',
    }).lean();
    if (existing) continue;

    const plan = generateAnomalyActions(anomaly);
    if (!plan) continue;

    const doc = await TenantAnomalyAction.create({
      tenantId,
      anomalyType:    anomaly.type,
      actionType:     plan.actionType,
      recommendation: plan.recommendation,
      autoExecutable: plan.autoExecutable,
      metadata: {
        // Anomaly-specific data
        ...anomaly.data,
        // Before-baseline for effectiveness scoring (read by evaluateAnomalyActionOutcome)
        beforeRuntimeState:     anomaly.data?.runtimeState     ?? 'cold',
        beforeQueueDepth:       anomaly.data?.queueDepth       ?? 0,
        beforeRecoveryCount24h: anomaly.data?.recoveryCount    ?? 0,
        beforeHealthScore:      anomaly.data?.healthScore      ?? 0,
      },
    });

    created.push(doc);
  }

  return created;
}
