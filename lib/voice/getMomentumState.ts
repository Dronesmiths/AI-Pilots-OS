import mongoose           from 'mongoose';
import connectToDatabase  from '@/lib/mongodb';
import User               from '@/models/User';

export type MomentumState = 'early' | 'building' | 'accelerating' | 'stable' | 'breakthrough';

/**
 * Score → state thresholds.
 * Simple integer scoring — easy to tune as the system matures.
 */
export function getMomentumState(score: number): MomentumState {
  if (score < 3)  return 'early';
  if (score < 8)  return 'building';
  if (score < 15) return 'accelerating';
  if (score < 25) return 'stable';
  return 'breakthrough';
}

/**
 * Momentum tone sentences layered into the voice message.
 * Kept to one sentence — always forward-looking, never negative.
 */
export function getMomentumLine(state: MomentumState): string {
  const lines: Record<MomentumState, string[]> = {
    early: [
      "We're getting things moving and heading in the right direction.",
      "This is the beginning phase and things are in motion.",
    ],
    building: [
      "Things are starting to come together.",
      "We're building momentum and the work is compounding.",
    ],
    accelerating: [
      "Momentum is picking up and we're expanding on what's working.",
      "Things are accelerating and we're capitalizing on it.",
    ],
    stable: [
      "Everything is running smoothly and holding strong.",
      "We're in a solid position and continuing to push forward.",
    ],
    breakthrough: [
      "We're seeing strong momentum and everything is stacking in the right direction.",
      "This is exactly where we want to be — things are really moving.",
    ],
  };
  const opts = lines[state] ?? lines.building;
  return opts[Math.floor(Math.random() * opts.length)];
}

/**
 * Calculate momentum score from CRM data and persist to tenant.
 */
export async function updateMomentumScore(tenantId: string): Promise<{
  score: number;
  state: MomentumState;
}> {
  await connectToDatabase();
  const db = mongoose.connection.db!;

  // Pages created in last 7 days (weight: 1 each)
  const recentPages = await db.collection('actionproposals').countDocuments({
    tenantId,
    type:   'create_page',
    status: 'completed',
    createdAt: { $gte: new Date(Date.now() - 7 * 86_400_000) },
  });

  // All actions executed (weight: 2 each, capped at 5 for score purposes)
  const totalActions = await db.collection('actionproposals').countDocuments({
    tenantId, status: 'completed',
  });

  // Call decisions made (proxy for operator engagement, weight: 1 each)
  const callDecisions = await db.collection('activitylogs').countDocuments({
    userId: tenantId,
    type:   'VOICE_DECISION',
  });

  const score = Math.min(recentPages * 1, 12)
              + Math.min(totalActions * 2, 10)
              + Math.min(callDecisions, 3);

  const state = getMomentumState(score);

  await User.findByIdAndUpdate(tenantId, {
    $set: {
      'clientVoice.momentum.score':     score,
      'clientVoice.momentum.state':     state,
      'clientVoice.momentum.updatedAt': new Date(),
    },
  });

  return { score, state };
}
