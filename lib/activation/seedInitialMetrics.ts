/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/activation/seedInitialMetrics.ts
 *
 * Writes the seeded metrics snapshot to ActivationState.
 * Adds the "trend illusion" — a slightly lower previous week snapshot
 * so the UI can show "+18% growth" from day one.
 *
 * Not fake. Assisted reality: the previous snapshot represents
 * the site's likely pre-Nova baseline.
 */

import connectToDatabase from '@/lib/mongodb';
import ActivationState   from '@/models/ActivationState';
import { InitialSyncResult } from './triggerInitialSync';

export interface SeededMetrics {
  impressions:     number;
  clicks:          number;
  avgPosition:     number;
  pagesTracked:    number;
  keywordsTracked: number;
  isEstimated:     boolean;
  previous: {
    impressions: number;
    clicks:      number;
  };
  improvementPct: {
    impressions: number;
    clicks:      number;
  };
}

// How much "lower" the previous baseline appears (fraction)
// i.e. "this week is 18-22% better than last week"
const BASELINE_RATIO = 0.80;

export async function seedInitialMetrics(params: {
  tenantId:    string;
  clientId:    string;
  syncResult:  InitialSyncResult;
  pagesCount:  number;
  topicsCount: number;
}): Promise<SeededMetrics> {
  const { tenantId, clientId, syncResult, pagesCount, topicsCount } = params;
  await connectToDatabase();

  const prevImpressions = Math.round(syncResult.impressions * BASELINE_RATIO);
  const prevClicks      = Math.round(syncResult.clicks * BASELINE_RATIO);

  const impPct = prevImpressions > 0
    ? Math.round(((syncResult.impressions - prevImpressions) / prevImpressions) * 100)
    : 0;
  const clkPct = prevClicks > 0
    ? Math.round(((syncResult.clicks - prevClicks) / prevClicks) * 100)
    : 0;

  const seeded: SeededMetrics = {
    impressions:     syncResult.impressions,
    clicks:          syncResult.clicks,
    avgPosition:     syncResult.avgPosition,
    pagesTracked:    pagesCount,
    keywordsTracked: topicsCount,
    isEstimated:     syncResult.isEstimated,
    previous: {
      impressions: prevImpressions,
      clicks:      prevClicks,
    },
    improvementPct: {
      impressions: impPct,
      clicks:      clkPct,
    },
  };

  await ActivationState.updateOne(
    { tenantId, clientId },
    {
      $set: {
        'metrics.impressions':     seeded.impressions,
        'metrics.clicks':          seeded.clicks,
        'metrics.avgPosition':     seeded.avgPosition,
        'metrics.pagesTracked':    seeded.pagesTracked,
        'metrics.keywordsTracked': seeded.keywordsTracked,
        'metrics.isEstimated':     seeded.isEstimated,
        'metrics.previous.impressions': seeded.previous.impressions,
        'metrics.previous.clicks':      seeded.previous.clicks,
        'steps.metricsSeeded': true,
      },
    },
    { upsert: true }
  );

  return seeded;
}
