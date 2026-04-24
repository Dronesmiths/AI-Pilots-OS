/**
 * lib/system/applyChampionDemotion.ts
 *
 * Demotes the current champion, reopens the market.
 * Moves champion to probation/challenger/retired based on severity.
 * Resets lock confidence and champion fields.
 */
import connectToDatabase  from '@/lib/mongodb';
import ScopeActionMarket  from '@/models/ScopeActionMarket';
import type { ReopenReason } from './evaluateScopeReopen';

export async function applyChampionDemotion(input: {
  scopeKey:        string;
  championAction:  string;
  moveTo?:         'challenger' | 'probation' | 'retired';
  reopenReason?:   ReopenReason;
}): Promise<void> {
  await connectToDatabase();

  const market = await ScopeActionMarket.findOne({ scopeKey: input.scopeKey }) as any;
  if (!market) throw new Error(`ScopeActionMarket not found: ${input.scopeKey}`);

  const targetRole = input.moveTo ?? 'probation';

  for (const action of market.actions) {
    if (action.actionType === input.championAction) {
      action.role       = targetRole;
      action.lastLostAt = new Date();
      action.decayScore = Math.min(100, (action.decayScore ?? 0) + 18);
    }
  }

  market.currentChampionAction  = null;
  market.marketStatus           = input.reopenReason === 'harm_spike' ? 'degraded' : 'reopened';
  market.reopenReason           = input.reopenReason ?? 'none';
  market.lastDemotionAt         = new Date();
  market.lastReopenedAt         = new Date();
  market.championLocked         = false;
  market.championLockConfidence = 0;

  await market.save();
}
