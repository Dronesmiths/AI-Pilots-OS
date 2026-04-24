/**
 * lib/system/estimateReplayOutcome.ts
 *
 * Evidence-based outcome estimator for replay variants.
 *
 * Looks up REAL win rates from ScopeActionMarket for both the original
 * and simulated actions, then computes a delta.
 *
 * Evidence hierarchy:
 *   1. ScopeActionMarket exact scope (highest credibility)
 *   2. Anomaly-level aggregated market  (medium credibility)
 *   3. Failed execution (no actionType) (fixed penalty)
 *   4. Same action as original          (neutral, high confidence)
 *
 * Returns: outcomeLabel, estimatedDelta, confidence, basis (audit trail)
 */
import connectToDatabase  from '@/lib/mongodb';
import ScopeActionMarket  from '@/models/ScopeActionMarket';
import type { ReplayState } from './reconstructReplayState';
import type { SimulatedEnvelope } from './simulateGovernedDecision';

export interface ReplayOutcome {
  outcomeLabel:    'improved' | 'neutral' | 'worsened' | 'failed_execution' | 'unknown';
  estimatedDelta:  number;
  confidence:      number;
  basis:           string;
}

async function getActionWinRate(
  scopeKey: string, actionType: string, anomalyType: string,
): Promise<{ winRate: number; harmRate: number; sampleCount: number; source: string }> {
  // Try exact scope first
  const market = await ScopeActionMarket.findOne({ scopeKey }).lean() as any;
  if (market?.actions?.length) {
    const entry = market.actions.find((a: any) => a.actionType === actionType);
    if (entry && (entry.sampleCount ?? 0) >= 3) {
      return { winRate: entry.winRate ?? 0, harmRate: entry.harmRate ?? 0, sampleCount: entry.sampleCount, source: `exact scope ${scopeKey}` };
    }
  }

  // Fallback: aggregate across scopes with same anomalyType
  const markets = await ScopeActionMarket.find({ anomalyType }).lean() as any[];
  const entries  = markets.flatMap((m: any) => (m.actions ?? []).filter((a: any) => a.actionType === actionType));
  if (entries.length >= 2) {
    const avgWin  = entries.reduce((s: number, e: any) => s + (e.winRate  ?? 0), 0) / entries.length;
    const avgHarm = entries.reduce((s: number, e: any) => s + (e.harmRate ?? 0), 0) / entries.length;
    return { winRate: avgWin, harmRate: avgHarm, sampleCount: entries.length * 5, source: `anomaly aggregate (${entries.length} scopes)` };
  }

  return { winRate: 0.5, harmRate: 0.1, sampleCount: 0, source: 'prior (no evidence)' };
}

export async function estimateReplayOutcome(input: {
  originalState:     ReplayState;
  simulatedEnvelope: SimulatedEnvelope;
}): Promise<ReplayOutcome> {
  await connectToDatabase();

  const originalAction  = input.originalState.finalDecision?.actionType   ?? null;
  const simulatedAction = input.simulatedEnvelope.finalDecision?.actionType ?? null;

  // Failed execution
  if (!simulatedAction) {
    return { outcomeLabel: 'failed_execution', estimatedDelta: -25, confidence: 0.85, basis: 'No actionType in simulated decision' };
  }

  // Same action — guarantee neutral (any difference is noise)
  if (simulatedAction === originalAction) {
    return { outcomeLabel: 'neutral', estimatedDelta: 0, confidence: 0.97, basis: 'Simulated and original actions identical' };
  }

  // Look up win rates for both actions
  const [origStats, simStats] = await Promise.all([
    originalAction
      ? getActionWinRate(input.originalState.scopeKey, originalAction, input.originalState.anomalyType)
      : Promise.resolve({ winRate: 0.5, harmRate: 0.1, sampleCount: 0, source: 'no original action' }),
    getActionWinRate(input.originalState.scopeKey, simulatedAction, input.originalState.anomalyType),
  ]);

  // Delta: simulated win rate vs original win rate, harm-adjusted
  const winDelta  = simStats.winRate  - origStats.winRate;
  const harmDelta = simStats.harmRate - origStats.harmRate;
  const estimatedDelta = parseFloat(((winDelta * 100) - (harmDelta * 50)).toFixed(2));

  // Confidence: based on sample counts
  const minSamples = Math.min(origStats.sampleCount, simStats.sampleCount);
  const confidence = minSamples >= 20 ? 0.85 : minSamples >= 8 ? 0.65 : minSamples >= 3 ? 0.45 : 0.25;

  const outcomeLabel: ReplayOutcome['outcomeLabel'] =
    estimatedDelta > 8  ? 'improved'  :
    estimatedDelta < -5 ? 'worsened'  : 'neutral';

  const basis = `orig '${originalAction}' winRate=${origStats.winRate.toFixed(2)} [${origStats.source}] vs sim '${simulatedAction}' winRate=${simStats.winRate.toFixed(2)} [${simStats.source}] → Δ${estimatedDelta}`;

  return { outcomeLabel, estimatedDelta, confidence, basis };
}
