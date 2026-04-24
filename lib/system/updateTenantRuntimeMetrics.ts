/**
 * lib/system/updateTenantRuntimeMetrics.ts
 *
 * Non-blocking incremental metrics update for a tenant's RuntimeState.
 * Upserts the tenant doc if it doesn't exist yet.
 *
 * Call this from:
 *   - successful drone completions for this tenant
 *   - failed job handlers
 *   - publish completions (pagesPublishedDelta)
 *   - internal link completions (internalLinksAddedDelta)
 *   - queue monitor updates (queueDepth)
 */

import connectToDatabase  from '@/lib/mongodb';
import TenantRuntimeState from '@/models/TenantRuntimeState';

export interface TenantMetricsDelta {
  tenantId:                string;
  jobsProcessedDelta?:     number;
  failedJobsDelta?:        number;
  queueDepth?:             number;
  successfulAction?:       boolean;
  pagesPublishedDelta?:    number;
  internalLinksAddedDelta?: number;
}

export async function updateTenantRuntimeMetrics(input: TenantMetricsDelta): Promise<void> {
  try {
    await connectToDatabase();

    const $inc: Record<string, number> = {};
    const $set: Record<string, any>    = {};

    if (input.jobsProcessedDelta)      $inc['metrics.jobsProcessedSinceActivation'] = input.jobsProcessedDelta;
    if (input.failedJobsDelta)         $inc['metrics.failedJobsSinceActivation']     = input.failedJobsDelta;
    if (input.pagesPublishedDelta)     $inc['metrics.pagesPublished']                = input.pagesPublishedDelta;
    if (input.internalLinksAddedDelta) $inc['metrics.internalLinksAdded']            = input.internalLinksAddedDelta;

    if (typeof input.queueDepth === 'number')    $set['metrics.queueDepth']             = input.queueDepth;
    if (input.successfulAction)                   $set['metrics.lastSuccessfulActionAt'] = new Date();

    const update: Record<string, any> = {
      $setOnInsert: { tenantId: input.tenantId, activatedAt: new Date() },
    };
    if (Object.keys($inc).length) update.$inc = $inc;
    if (Object.keys($set).length) update.$set = $set;

    await TenantRuntimeState.findOneAndUpdate(
      { tenantId: input.tenantId },
      update,
      { upsert: true }
    );
  } catch (err) {
    // Non-blocking — metrics failure never stops tenant work
    console.error('[updateTenantRuntimeMetrics] error:', input.tenantId, String(err));
  }
}
