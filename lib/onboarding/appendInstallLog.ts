/**
 * lib/onboarding/appendInstallLog.ts
 *
 * Append a single log entry to InstallJobLog.
 * Also updates the parent InstallJob's current step + percent.
 */

import connectToDatabase from '@/lib/mongodb';
import InstallJobLog     from '@/models/onboarding/InstallJobLog';
import InstallJob, { INSTALL_STEP_PERCENT, INSTALL_STEP_LABELS } from '@/models/onboarding/InstallJob';

export type LogStatus = 'started' | 'completed' | 'failed' | 'skipped' | 'warning';

export async function appendInstallLog(params: {
  installJobId: string;
  tenantId:     string;
  clientId:     string;
  step:         string;
  status:       LogStatus;
  message?:     string;
  duration?:    number;
  metadata?:    Record<string, unknown>;
}): Promise<void> {
  await connectToDatabase();

  const { installJobId, tenantId, clientId, step, status, message = '', duration = 0, metadata = {} } = params;

  // Parallel: write log + update job progress
  await Promise.all([
    InstallJobLog.create({
      installJobId,
      tenantId, clientId,
      step, status, message, duration, metadata,
    }),

    status === 'started'
      ? InstallJob.updateOne(
          { _id: installJobId },
          {
            $set: {
              'progress.currentStep': step,
              'progress.percent': INSTALL_STEP_PERCENT[step] ?? 0,
            },
          }
        )
      : status === 'completed'
      ? InstallJob.updateOne(
          { _id: installJobId },
          {
            $set:  { 'progress.currentStep': `${step}_done`, 'progress.percent': INSTALL_STEP_PERCENT[step] ?? 0 },
            $push: { 'progress.completedSteps': step },
          }
        )
      : status === 'failed'
      ? InstallJob.updateOne(
          { _id: installJobId },
          {
            $set: {
              status:                  'failed',
              'progress.failedStep':   step,
              'error.failedStep':      step,
              'error.message':         message,
              'error.humanNote':       `Install paused at step: ${INSTALL_STEP_LABELS[step] ?? step}. ${message}`,
              'progress.completedAt':  new Date(),
            },
          }
        )
      : null,
  ]);
}
