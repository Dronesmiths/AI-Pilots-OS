/**
 * lib/system/promoteChallengerIfNeeded.ts
 *
 * DB-backed promotion engine.
 * Promotes a challenger to champion if it meets the comparison threshold.
 *
 * Promotion flow:
 *   1. Re-fetch latest champion + challenger from DB (don't trust stale refs)
 *   2. Compare using compareChampionVsChallenger
 *   3. If promotable: update Champion doc + mark Challenger as promoted
 *   4. Also update AnomalyActionPolicy to reflect new champion action
 *   5. Return { promoted: bool, reason }
 *
 * Promotion does NOT auto-change the execution mode — an operator can still
 * keep the governance policy at 'manual_approved' even if the new champion
 * is known to be the best action.
 */

import connectToDatabase                   from '@/lib/mongodb';
import AnomalyActionChampion               from '@/models/AnomalyActionChampion';
import AnomalyActionChallenger             from '@/models/AnomalyActionChallenger';
import AnomalyActionPolicy                 from '@/models/AnomalyActionPolicy';
import { compareChampionVsChallenger }     from './compareChampionVsChallenger';

export interface PromotionResult {
  promoted:       boolean;
  challengerId:   string;
  anomalyType:    string;
  oldAction:      string;
  newAction?:     string;
  verdict:        string;
  reason:         string;
}

export async function promoteChallengerIfNeeded(
  challengerId: string,
): Promise<PromotionResult> {
  await connectToDatabase();

  const challenger = await AnomalyActionChallenger.findById(challengerId) as any;
  if (!challenger || challenger.status !== 'active') {
    return { promoted: false, challengerId, anomalyType: '', oldAction: '', verdict: 'skip', reason: 'Challenger not active' };
  }

  const champion = await AnomalyActionChampion.findOne({ anomalyType: challenger.anomalyType }) as any;
  if (!champion) {
    return { promoted: false, challengerId, anomalyType: challenger.anomalyType, oldAction: '', verdict: 'skip', reason: 'No champion found' };
  }

  const comparison = compareChampionVsChallenger(
    champion.performance,
    challenger.performance,
  );

  if (!comparison.promotable) {
    return {
      promoted:     false,
      challengerId,
      anomalyType:  challenger.anomalyType,
      oldAction:    champion.actionType,
      verdict:      comparison.verdict,
      reason:       comparison.reason,
    };
  }

  // ── Promote challenger → new champion ─────────────────────────────────────
  await AnomalyActionChampion.findOneAndUpdate(
    { anomalyType: challenger.anomalyType },
    {
      $set: {
        previousActionType: champion.actionType,
        actionType:         challenger.actionType,
        performance:        challenger.performance,
        assignedAt:         new Date(),
        promotedAt:         new Date(),
        promotionSource:    'auto',
      },
    }
  );

  await AnomalyActionChallenger.updateOne(
    { _id: challengerId },
    { $set: { status: 'promoted', promotedAt: new Date() } }
  );

  // Also notify AnomalyActionPolicy of the new best action
  // (does NOT change execution mode — governance still controls that)
  await AnomalyActionPolicy.updateOne(
    { anomalyType: challenger.anomalyType, actionType: challenger.actionType },
    {
      $set: {
        notes: `Champion since ${new Date().toISOString()} — promoted from challenger experiment`,
      },
    }
  ).catch(() => {}); // non-critical

  console.log(JSON.stringify({
    ts: new Date(), action: 'challenger_promoted',
    anomalyType: challenger.anomalyType,
    from: champion.actionType,
    to:   challenger.actionType,
    delta: comparison.effectivenessDelta,
  }));

  return {
    promoted:    true,
    challengerId,
    anomalyType: challenger.anomalyType,
    oldAction:   champion.actionType,
    newAction:   challenger.actionType,
    verdict:     comparison.verdict,
    reason:      comparison.reason,
  };
}
