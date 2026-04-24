/**
 * lib/dashboard/getMissionControl.ts
 *
 * Single aggregator for the Mission Control unified payload.
 * Called by /api/dashboard/mission-control (NOT the existing /api/dashboard/bootstrap).
 *
 * Bootstrap serves the client-facing SEO OS dashboard (with snapshotSequence + SSE).
 * mission-control serves the admin-facing "control room" view.
 */
import connectToDatabase    from '@/lib/mongodb';
import ActivationTimeline   from '@/models/ActivationTimeline';
import { getFirstResults }  from './getFirstResults';
import { getSystemStatus }  from './systemStatus';
import { getActivityFeed }  from './getActivityFeed';

export async function getMissionControl(tenantId: string) {
  await connectToDatabase();

  const [timeline, results, status, activity] = await Promise.all([
    ActivationTimeline.findOne({ tenantId }).sort({ createdAt: -1 }).lean(),
    getFirstResults(tenantId),
    getSystemStatus(tenantId),
    getActivityFeed(tenantId, 10),
  ]);

  return { timeline, results, status, activity };
}
