/**
 * lib/system/getCausalActionRecommendations.ts
 *
 * Generates ranked action recommendations for a given anomaly + tenant context.
 * Used by the recommendations API and optionally by the action engine.
 *
 * Excludes current champion from candidates (already running live).
 * Returns up to 5 alternatives ranked by contextual fit + effectiveness.
 *
 * confidence:
 *   high    >= 5 samples in similar context
 *   medium  >= 3 samples
 *   low     < 3 samples (shown but labeled uncertain)
 */

import { selectCausalChallengers }  from './selectCausalChallengers';
import type { ContextInput }         from './scoreCausalContextMatch';

export interface CausalRecommendation {
  actionType:       string;
  weightedScore:    number;
  avgEffectiveness: number;
  avgContextScore:  number;
  samples:          number;
  confidence:       'high' | 'medium' | 'low';
  reason:           string;
}

export async function getCausalActionRecommendations(input: {
  anomalyType:      string;
  currentContext:   ContextInput;
  currentChampion?: string;
}): Promise<CausalRecommendation[]> {
  const candidates = await selectCausalChallengers({
    anomalyType:       input.anomalyType,
    currentContext:    input.currentContext,
    excludeActionType: input.currentChampion,
    limit:             5,
  });

  return candidates.map(c => ({
    actionType:       c.actionType,
    weightedScore:    Math.round(c.weightedScore),
    avgEffectiveness: Math.round(c.avgEffectiveness),
    avgContextScore:  Math.round(c.avgContextScore),
    samples:          c.samples,
    confidence:       c.samples >= 5 ? 'high' : c.samples >= 3 ? 'medium' : 'low',
    reason:           buildReason(c, input.currentContext),
  }));
}

function buildReason(
  c:       ReturnType<typeof selectCausalChallengers> extends Promise<infer T> ? T[number] : never,
  ctx:     ContextInput,
): string {
  const parts: string[] = [];
  if (c.avgContextScore >= 60)  parts.push(`strong context match (${Math.round(c.avgContextScore)}/100)`);
  if (c.avgEffectiveness > 10)  parts.push(`avg +${Math.round(c.avgEffectiveness)} effectiveness`);
  if (c.avgContextScore >= 40 && c.avgContextScore < 60) parts.push('moderate context match');
  if (ctx.runtimeState)         parts.push(`in ${ctx.runtimeState} state`);
  return parts.join(' · ') || `${c.samples} similar cases`;
}
