/**
 * lib/system/scoreCausalContextMatch.ts
 *
 * Pure function — scores how similar a historical causal memory context
 * is to the current tenant context.
 *
 * Score is 0–100 (can slightly exceed via lifecycle overlap bonus).
 * Used by selectCausalChallengers() to weight challenger candidates.
 *
 * Weights:
 *   runtimeState match   30   (most important — cold/warming/warm/degraded are very different)
 *   queueDepth band      20   (high queue = different pressure from low queue)
 *   recentFailures band  15   (stability signal)
 *   milestoneCount delta 15   (trajectory maturity)
 *   lifecyclePattern     20   (pattern overlap, capped)
 */

export type ContextInput = {
  runtimeState:     string;
  queueDepth:       number;
  recentFailures:   number;
  milestoneCount:   number;
  lifecyclePattern: string[];
};

export function bandQueueDepth(v: number): 'low' | 'medium' | 'high' {
  return v > 20 ? 'high' : v > 5 ? 'medium' : 'low';
}

export function bandFailures(v: number): 'low' | 'medium' | 'high' {
  return v > 5 ? 'high' : v > 1 ? 'medium' : 'low';
}

export function scoreCausalContextMatch(
  current: ContextInput,
  memory:  ContextInput,
): number {
  let score = 0;

  // Runtime state — exact match only (states are categorically different)
  if (current.runtimeState === memory.runtimeState) score += 30;

  // Queue depth band — bucketed to avoid over-sensitivity to small differences
  if (bandQueueDepth(current.queueDepth) === bandQueueDepth(memory.queueDepth)) score += 20;

  // Recent failures band — stability signal
  if (bandFailures(current.recentFailures) === bandFailures(memory.recentFailures)) score += 15;

  // Milestone proximity — measures lifecycle maturity similarity
  const milestoneDelta = Math.abs((current.milestoneCount ?? 0) - (memory.milestoneCount ?? 0));
  if (milestoneDelta === 0)      score += 15;
  else if (milestoneDelta <= 2)  score += 8;
  else if (milestoneDelta <= 5)  score += 3;

  // Lifecycle pattern overlap — shared recent event types (capped at 20)
  const overlap = (current.lifecyclePattern ?? []).filter(x =>
    (memory.lifecyclePattern ?? []).includes(x)
  ).length;
  score += Math.min(overlap * 5, 20);

  return score;
}
