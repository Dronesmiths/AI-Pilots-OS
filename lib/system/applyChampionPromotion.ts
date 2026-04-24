/**
 * lib/system/applyChampionPromotion.ts
 *
 * Executes a promotion: new challenger becomes champion,
 * old champion is downgraded to challenger.
 * Updates market status to soft_locked after promotion.
 */
import connectToDatabase   from '@/lib/mongodb';
import ScopeActionMarket   from '@/models/ScopeActionMarket';

export async function applyChampionPromotion(input: {
  scopeKey:               string;
  newChampionAction:      string;
  previousChampionAction: string | null;
}): Promise<void> {
  await connectToDatabase();

  const market = await ScopeActionMarket.findOne({ scopeKey: input.scopeKey }) as any;
  if (!market) throw new Error(`ScopeActionMarket not found: ${input.scopeKey}`);

  for (const action of market.actions) {
    if (action.actionType === input.newChampionAction) {
      action.role            = 'champion';
      action.lastWonAt       = new Date();
      action.stabilityScore  = Math.min(100, (action.stabilityScore ?? 0) + 12);
    } else if (input.previousChampionAction && action.actionType === input.previousChampionAction) {
      action.role            = 'challenger';
      action.lastLostAt      = new Date();
      action.decayScore      = Math.min(100, (action.decayScore ?? 0) + 10);
    }
  }

  market.currentChampionAction  = input.newChampionAction;
  market.lastPromotionAt        = new Date();
  market.marketStatus           = 'soft_locked';
  market.championLockConfidence = Math.min(1, (market.championLockConfidence ?? 0) + 0.08);

  await market.save();
}
