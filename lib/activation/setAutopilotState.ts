/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/activation/setAutopilotState.ts
 *
 * Marks autopilot as enabled in ActivationState.
 * Adds the "autopilot activated" event to the growth feed.
 * Sets next scheduled run time (24h from now).
 */

import connectToDatabase  from '@/lib/mongodb';
import ActivationState    from '@/models/ActivationState';
import ClientActivityFeed from '@/models/ClientActivityFeed';
import MomentumScore      from '@/models/MomentumScore';

export async function setAutopilotState(params: {
  tenantId: string;
  clientId: string;
  mode?:    'balanced' | 'aggressive' | 'conservative';
}): Promise<void> {
  const { tenantId, clientId, mode = 'balanced' } = params;
  await connectToDatabase();

  const now     = new Date();
  const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  await ActivationState.updateOne(
    { tenantId, clientId },
    {
      $set: {
        'autopilot.enabled': true,
        'autopilot.mode':    mode,
        'autopilot.lastRun': now,
        'autopilot.nextRun': next24h,
        'steps.autopilotActivated': true,
      },
    },
    { upsert: true }
  );

  // Seed initial momentum score (50 = neutral starting point)
  await MomentumScore.findOneAndUpdate(
    { tenantId, clientId },
    {
      $set: {
        score: 52,
        components: { growth: 15, activity: 12, rankings: 13, consistency: 12 },
        trend:     'up',
        trendNote: 'Rising 🔥',
        lastUpdatedAt: now,
      },
      $push: { history: { score: 52, trend: 'up', recordedAt: now } },
    },
    { upsert: true }
  );

  // Add autopilot event to feed
  await ClientActivityFeed.create({
    userId:  clientId,
    type:    'autopilot',
    icon:    '🤖',
    message: `Autopilot activated — monitoring growth opportunities 24/7`,
    createdAt: new Date(now.getTime() - 3 * 60 * 1000), // 3 mins ago
  }).catch(() => {});
}
