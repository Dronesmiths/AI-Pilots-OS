/**
 * lib/system/updateRuntimeMetrics.ts
 *
 * Incremental metrics update for the SystemRuntimeState singleton.
 * Call this from:
 *   - supervisor loop (queueDepth, activeWorkers every tick)
 *   - successful drone completions (jobsProcessedDelta, successfulAction)
 *   - failed job handlers (failedJobsDelta)
 *
 * Non-blocking: all errors are caught and logged, never thrown.
 */

import connectToDatabase  from '@/lib/mongodb';
import SystemRuntimeState from '@/models/SystemRuntimeState';

export interface RuntimeMetricsDelta {
  jobsProcessedDelta?: number;
  failedJobsDelta?:    number;
  queueDepth?:         number;
  activeWorkers?:      number;
  successfulAction?:   boolean;
}

export async function updateRuntimeMetrics(input: RuntimeMetricsDelta): Promise<void> {
  try {
    await connectToDatabase();

    const $inc: Record<string, number> = {};
    const $set: Record<string, any>    = {};

    if (input.jobsProcessedDelta) $inc['metrics.jobsProcessedSinceBoot'] = input.jobsProcessedDelta;
    if (input.failedJobsDelta)    $inc['metrics.failedJobsSinceBoot']     = input.failedJobsDelta;
    if (typeof input.queueDepth   === 'number') $set['metrics.queueDepth']   = input.queueDepth;
    if (typeof input.activeWorkers === 'number') $set['metrics.activeWorkers'] = input.activeWorkers;
    if (input.successfulAction)   $set['metrics.lastSuccessfulActionAt']   = new Date();

    const update: Record<string, any> = {};
    if (Object.keys($inc).length) update.$inc = $inc;
    if (Object.keys($set).length) update.$set = $set;
    if (!Object.keys(update).length) return;

    await SystemRuntimeState.findOneAndUpdate(
      { systemKey: 'primary' },
      update,
      { upsert: true }
    );
  } catch (err) {
    // Non-blocking — metrics update failure never stops the system
    console.error('[updateRuntimeMetrics] error:', String(err));
  }
}
