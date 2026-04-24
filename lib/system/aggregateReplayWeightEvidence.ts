/**
 * lib/system/aggregateReplayWeightEvidence.ts
 *
 * Pure function — groups replay variants by type and computes win stats.
 * Output feeds into computeReplayWeightProposal for each variantType.
 */

export interface EvidenceBucket {
  variantType:         string;
  supportCount:        number;
  winRate:             number;
  avgReplayAdvantage:  number;
  avgConfidence:       number;
}

export function aggregateReplayWeightEvidence(input: {
  variants: Array<{
    variantType:       string;
    comparison?:       { beatsActual?: boolean; deltaVsActual?: number };
    estimatedOutcome?: { confidence?: number; estimatedDelta?: number };
    mutationSpec?:     any;
  }>;
}): EvidenceBucket[] {
  const buckets: Record<string, { wins: number; total: number; deltaSum: number; confSum: number }> = {};

  for (const v of input.variants) {
    const key = v.variantType;
    if (!buckets[key]) buckets[key] = { wins: 0, total: 0, deltaSum: 0, confSum: 0 };

    buckets[key].total   += 1;
    buckets[key].deltaSum+= v.comparison?.deltaVsActual    ?? 0;
    buckets[key].confSum += v.estimatedOutcome?.confidence ?? 0;
    if (v.comparison?.beatsActual) buckets[key].wins += 1;
  }

  return Object.entries(buckets).map(([variantType, stats]) => ({
    variantType,
    supportCount:       stats.total,
    winRate:            stats.total ? stats.wins / stats.total : 0,
    avgReplayAdvantage: stats.total ? stats.deltaSum / stats.total : 0,
    avgConfidence:      stats.total ? stats.confSum  / stats.total : 0,
  }));
}
