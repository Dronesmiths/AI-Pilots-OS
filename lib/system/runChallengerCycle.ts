/**
 * lib/system/runChallengerCycle.ts
 *
 * Orchestrator — runs one cycle of the challenger experiment engine.
 *
 * For each active challenger experiment:
 *   1. Fetch champion + active challengers for this anomaly type
 *   2. Run shadow simulation for each active challenger
 *   3. Update challenger rolling performance (EWMA — exponential weighted moving avg)
 *   4. Compare each challenger vs champion
 *   5. Promote if promotable
 *
 * Called by:
 *   - POST /api/mission-control/anomaly-action-performance (cron, after outcome sweep)
 *   - Manually triggerable via API
 *
 * SAFETY: No live mutations. Shadow runs are read-only from TenantAnomalyActionOutcome.
 */

import connectToDatabase               from '@/lib/mongodb';
import AnomalyActionChampion           from '@/models/AnomalyActionChampion';
import AnomalyActionChallenger         from '@/models/AnomalyActionChallenger';
import AnomalyActionPolicy             from '@/models/AnomalyActionPolicy';
import { runShadowAction }             from './runShadowAction';
import { compareChampionVsChallenger } from './compareChampionVsChallenger';
import { promoteChallengerIfNeeded }   from './promoteChallengerIfNeeded';
import { getAnomalyActionPerformance } from './getAnomalyActionPerformance';
import { selectChallengers }           from './selectChallengers';

// EWMA smoothing factor — higher = more weight to recent observations
const EWMA_ALPHA = parseFloat(process.env.CHALLENGER_EWMA_ALPHA ?? '0.3');

function ewmaUpdate(prev: number, next: number): number {
  return EWMA_ALPHA * next + (1 - EWMA_ALPHA) * prev;
}

export interface CycleResult {
  anomalyType:  string;
  challengers:  Array<{
    actionType:   string;
    shadowResult: any;
    verdict:      string;
    promoted:     boolean;
  }>;
}

export async function runChallengerCycle(): Promise<CycleResult[]> {
  await connectToDatabase();

  const results: CycleResult[] = [];

  // Get all active challenger experiments
  const activeChallengers = await AnomalyActionChallenger.find({ status: 'active' }).lean() as any[];
  if (!activeChallengers.length) return results;

  // Group by anomaly type
  const byAnomaly = activeChallengers.reduce((acc: Record<string, any[]>, c: any) => {
    (acc[c.anomalyType] ??= []).push(c);
    return acc;
  }, {});

  for (const [anomalyType, challengers] of Object.entries(byAnomaly)) {
    const champion = await AnomalyActionChampion.findOne({ anomalyType }).lean() as any;
    if (!champion) continue;

    const cycleResult: CycleResult = { anomalyType, challengers: [] };

    for (const challenger of challengers) {
      // ── Shadow run (no live mutations) ──────────────────────────────────────
      const shadow = await runShadowAction({
        tenantId:    'shadow_run',
        anomalyType,
        actionType:  challenger.actionType,
      });

      // ── Update challenger performance (EWMA) ────────────────────────────────
      const newSampleCount = (challenger.performance?.sampleCount ?? 0) + 1;
      const prevEff        = challenger.performance?.avgEffectiveness ?? 0;
      const prevWorsened   = challenger.performance?.worsenedRate     ?? 0;
      const prevResolved   = challenger.performance?.resolvedRate     ?? 0;

      const updatedPerf = {
        avgEffectiveness: ewmaUpdate(prevEff,      shadow.simulatedEffectiveness),
        worsenedRate:     ewmaUpdate(prevWorsened, shadow.worsened ? 1 : 0),
        resolvedRate:     ewmaUpdate(prevResolved, shadow.resolved ? 1 : 0),
        sampleCount:      newSampleCount,
      };

      await AnomalyActionChallenger.updateOne(
        { _id: challenger._id },
        { $set: { performance: updatedPerf, shadowRuns: newSampleCount } }
      );

      // ── Compare vs champion ──────────────────────────────────────────────────
      const comparison = compareChampionVsChallenger(
        { ...champion.performance, sampleCount: champion.performance?.sampleCount ?? 0 },
        { ...updatedPerf },
      );

      // ── Promote if outperforming ─────────────────────────────────────────────
      let promoted = false;
      if (comparison.promotable && shadow.confidence !== 'low') {
        const promotionResult = await promoteChallengerIfNeeded(String(challenger._id));
        promoted = promotionResult.promoted;
      }

      cycleResult.challengers.push({
        actionType:   challenger.actionType,
        shadowResult: shadow,
        verdict:      comparison.verdict,
        promoted,
      });
    }

    results.push(cycleResult);
  }

  return results;
}

/**
 * seedChampionsFromPolicy
 *
 * Bootstrap: creates Champion docs for anomaly types that have AnomalyActionPolicy
 * evidence but no Champion yet. Seeds the highest-evidence action as champion.
 *
 * Safe to call multiple times — $setOnInsert prevents overwriting real champions.
 */
export async function seedChampionsFromPolicy(): Promise<number> {
  await connectToDatabase();
  const performance = await getAnomalyActionPerformance();
  const allPolicies = await AnomalyActionPolicy.find().lean() as any[];

  // Group by anomaly type, take highest avgEffectiveness per type
  const bestByAnomaly: Record<string, any> = {};
  for (const row of performance) {
    const existing = bestByAnomaly[row.anomalyType];
    if (!existing || row.avgEffectiveness > existing.avgEffectiveness) {
      bestByAnomaly[row.anomalyType] = row;
    }
  }

  let seeded = 0;
  for (const [anomalyType, best] of Object.entries(bestByAnomaly)) {
    const res = await AnomalyActionChampion.findOneAndUpdate(
      { anomalyType },
      {
        $setOnInsert: {
          anomalyType,
          actionType:      best.actionType,
          promotionSource: 'seeded',
          assignedAt:      new Date(),
          performance: {
            avgEffectiveness: best.avgEffectiveness,
            resolvedRate:     best.resolvedRate   / 100,
            worsenedRate:     best.worsenedRate   / 100,
            sampleCount:      best.count,
          },
        },
      },
      { upsert: true, new: false }
    );
    if (!res) seeded++; // new doc was created
  }
  return seeded;
}
