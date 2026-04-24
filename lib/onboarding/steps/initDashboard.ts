/**
 * lib/onboarding/steps/initDashboard.ts
 *
 * Step 2: Initialize dashboard state for the new tenant.
 *
 * Uses the existing models/client/DashboardClientState (domain-keyed)
 * for the client portal, plus upserts the activation-level status fields.
 *
 * $setOnInsert ensures re-runs are idempotent and don't overwrite live state.
 */
import connectToDatabase     from '@/lib/mongodb';
import DashboardClientState  from '@/models/client/DashboardClientState';

export async function initDashboard(tenantId: string, domain: string) {
  await connectToDatabase();

  return DashboardClientState.findOneAndUpdate(
    { domain },
    {
      $setOnInsert: {
        domain,
        'onboarding.step':          1,
        'onboarding.gscConnected':  false,
        'onboarding.engineLaunched':false,
        autopilotOn:   true,
        autopilotMode: 'balanced',
        lastSeenAt:    new Date(),
      },
      // Always stamp tenantId for cross-reference (field added via $set so it
      // updates even on existing records that pre-date the activation pipeline)
      $set: { tenantId, lastSeenAt: new Date() },
    },
    { upsert: true, new: true }
  );
}
