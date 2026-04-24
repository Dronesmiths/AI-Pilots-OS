/**
 * lib/system/getCausalActionHint.ts
 *
 * Decision-time hint: given a current tenant context, asks causal memory
 * "what action has worked in similar situations?"
 *
 * Returns the top-ranked action by avg effectiveness across similar memories,
 * or null if insufficient similar memories exist.
 *
 * This is advisory — it logs a hint alongside execution but does NOT
 * override the governance policy or execution mode decision.
 *
 * The hint becomes actionable when:
 *   a) The suggested action differs from the current champion
 *   b) There are enough similar memories (>= MIN_HINT_SAMPLES)
 *   c) The avg effectiveness is meaningfully better than alternatives
 */

import { findSimilarCausalMemories, toQueueBand, toFailureBand } from './findSimilarCausalMemories';

const MIN_HINT_SAMPLES = parseInt(process.env.CAUSAL_MIN_HINT_SAMPLES ?? '3', 10);

export interface CausalActionHint {
  suggestedAction:  string;
  avgEffectiveness: number;
  sampleCount:      number;
  confidence:       'high' | 'medium' | 'low';
  reason:           string;
}

export async function getCausalActionHint(input: {
  anomalyType:    string;
  runtimeState:   string;
  queueDepth:     number;
  recentFailures: number;
}): Promise<CausalActionHint | null> {
  const similar = await findSimilarCausalMemories({
    anomalyType:        input.anomalyType,
    runtimeState:       input.runtimeState,
    queueDepthBand:     toQueueBand(input.queueDepth),
    recentFailuresBand: toFailureBand(input.recentFailures),
  });

  if (similar.length === 0) return null;

  // Aggregate by action type: avg effectiveness + count
  const byAction = new Map<string, { total: number; count: number; improved: number }>();
  for (const mem of similar) {
    const entry = byAction.get(mem.actionType) ?? { total: 0, count: 0, improved: 0 };
    entry.total    += mem.outcome?.effectivenessScore ?? 0;
    entry.count    += 1;
    entry.improved += mem.outcome?.improved ? 1 : 0;
    byAction.set(mem.actionType, entry);
  }

  const ranked = [...byAction.entries()]
    .map(([actionType, s]) => ({
      actionType,
      avgEffectiveness: s.total / s.count,
      sampleCount:      s.count,
      improvedRate:     s.improved / s.count,
    }))
    .filter(r => r.sampleCount >= MIN_HINT_SAMPLES)
    .sort((a, b) => b.avgEffectiveness - a.avgEffectiveness);

  const top = ranked[0];
  if (!top) return null;

  return {
    suggestedAction:  top.actionType,
    avgEffectiveness: Math.round(top.avgEffectiveness),
    sampleCount:      top.sampleCount,
    confidence:       top.sampleCount >= 8 ? 'high' : top.sampleCount >= 4 ? 'medium' : 'low',
    reason: `${top.sampleCount} similar memories in ${input.runtimeState} / ${toQueueBand(input.queueDepth)}-queue context`,
  };
}
