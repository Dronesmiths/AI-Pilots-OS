/**
 * lib/system/updateScopeActionMarket.ts
 *
 * Updates market standings after each resolved planner decision.
 * Called from runPlannerFeedbackLoop after feedback event is written.
 *
 * Creates the market if it doesn't exist. Creates action standing if new.
 * Updates win/harm/delta running averages for the selected action.
 * Shadow and counterfactual stats updated if flags provided.
 */
import connectToDatabase  from '@/lib/mongodb';
import ScopeActionMarket  from '@/models/ScopeActionMarket';
import type { RecommendationQuality } from './evaluatePlannerOutcome';

export async function updateScopeActionMarket(input: {
  scopeKey:        string;
  anomalyType:     string;
  lifecycleStage:  string;
  trustTier:       string;
  policyMode:      string;
  actionType:      string;
  outcomeQuality:  RecommendationQuality;
  outcomeDelta:    number;
  wasShadow?:      boolean;
  wonCounterfactual?: boolean;
}): Promise<void> {
  await connectToDatabase();

  // Upsert the market
  let market = await ScopeActionMarket.findOne({ scopeKey: input.scopeKey }) as any;
  if (!market) {
    market = await ScopeActionMarket.create({
      scopeKey:       input.scopeKey,
      anomalyType:    input.anomalyType,
      lifecycleStage: input.lifecycleStage,
      trustTier:      input.trustTier,
      policyMode:     input.policyMode,
    });
  }

  const isWin  = ['strong_hit', 'partial_hit'].includes(input.outcomeQuality) ? 1 : 0;
  const isHarm = input.outcomeQuality === 'harmful' ? 1 : 0;

  // Find or create the action standing
  let standingIdx = market.actions.findIndex((a: any) => a.actionType === input.actionType);
  if (standingIdx === -1) {
    market.actions.push({
      actionType: input.actionType,
      role:       market.currentChampionAction === input.actionType ? 'champion' : 'challenger',
    });
    // Set as champion automatically if no champion exists
    if (!market.currentChampionAction) {
      market.currentChampionAction = input.actionType;
      market.actions[market.actions.length - 1].role = 'champion';
    }
    standingIdx = market.actions.length - 1;
  }

  const s = market.actions[standingIdx];
  s.sampleCount += 1;
  const n = s.sampleCount;

  s.winRate         = ((s.winRate         * (n - 1)) + isWin)              / n;
  s.harmRate        = ((s.harmRate        * (n - 1)) + isHarm)             / n;
  s.avgOutcomeDelta = ((s.avgOutcomeDelta * (n - 1)) + input.outcomeDelta) / n;

  // Recent = historical until windowed metric system is added
  s.recentWinRate         = s.winRate;
  s.recentHarmRate        = s.harmRate;
  s.recentAvgOutcomeDelta = s.avgOutcomeDelta;

  if (input.wasShadow && isWin) {
    s.shadowWinRate = Math.min(1, (s.shadowWinRate ?? 0) + 0.05);
  }
  if (input.wonCounterfactual) {
    s.counterfactualWinRate = Math.min(1, (s.counterfactualWinRate ?? 0) + 0.05);
  }

  // Update promotionScore (positive → champion candidate)
  s.promotionScore = Math.round(s.winRate * 60 + s.shadowWinRate * 20 - s.harmRate * 40);
  s.stabilityScore = isWin ? Math.min(100, (s.stabilityScore ?? 0) + 3) : Math.max(0, (s.stabilityScore ?? 0) - 5);

  s.lastTriedAt = new Date();
  if (isWin)  s.lastWonAt  = new Date();
  if (!isWin) s.lastLostAt = new Date();

  market.totalSamples += 1;
  await market.save();
}
