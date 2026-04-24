/**
 * lib/fleetAggregation.ts — CRM-side mirror of drone src/shared/fleetAggregation.ts
 *
 * Both the drone process and the CRM API routes read from the same MongoDB
 * collections (globalLearning, banditArms, users). This lib gives the CRM
 * direct query access without crossing the repo boundary.
 *
 * Keep in sync with: ai-pilots-drones/src/shared/fleetAggregation.ts
 */

import type { Db } from "mongodb";

const BANDIT_TYPE    = "REINFORCEMENT_STRATEGY";
const ARMS           = ["TITLE_REFRESH", "CONTENT_REFRESH", "INTERNAL_LINK_ONLY"];
const MIN_GLOBAL_PULLS = 20;

export interface FleetInsights {
  fleetSize:            number;
  topPerformingArm:     string | null;
  topSegment:           string | null;
  confidence:           number;
  clientRankPercentile: number | null;
  isUsingGlobalPrior:   boolean;
  blendWeights:         { localWeight: number; globalWeight: number };
  segmentPerformance:   { wins: number; trials: number; confidence: number };
  recommendation:       { arm: string | null; reason: string };
}

function getDynamicBlend(localPulls: number): { localWeight: number; globalWeight: number } {
  if (localPulls < 10) return { localWeight: 0.30, globalWeight: 0.70 };
  if (localPulls < 30) return { localWeight: 0.50, globalWeight: 0.50 };
  if (localPulls < 60) return { localWeight: 0.70, globalWeight: 0.30 };
  return               { localWeight: 0.90, globalWeight: 0.10 };
}

async function getClientAvgReward(db: Db, userId: string): Promise<number> {
  const arms = await db.collection("banditArms")
    .find({ userId, banditType: BANDIT_TYPE, pulls: { $gt: 0 } })
    .project({ avgReward: 1, pulls: 1 })
    .toArray();
  if (arms.length === 0) return 0;
  const totalPulls  = arms.reduce((s: number, a: any) => s + (a.pulls ?? 0), 0);
  const totalReward = arms.reduce((s: number, a: any) => s + (a.avgReward ?? 0) * (a.pulls ?? 0), 0);
  return totalPulls > 0 ? totalReward / totalPulls : 0;
}

async function getClientTotalPulls(db: Db, userId: string): Promise<number> {
  const arms = await db.collection("banditArms")
    .find({ userId, banditType: BANDIT_TYPE })
    .project({ pulls: 1 })
    .toArray();
  return arms.reduce((s: number, a: any) => s + (a.pulls ?? 0), 0);
}

export async function getFleetInsights(db: Db, userId: string, segmentKey?: string): Promise<FleetInsights> {
  const globalRecords = await db.collection("globalLearning")
    .find({ patternType: BANDIT_TYPE })
    .project({ segment: 1, stats: 1 })
    .toArray();

  const fleetSize = await db.collection("users")
    .countDocuments({ crossClientLearningEnabled: true });

  let topPerformingArm: string | null = null;
  let topSegmentKey:    string | null = null;
  let bestArmAvg = -Infinity;
  let totalFleetWins   = 0;
  let totalFleetTrials = 0;
  let totalGlobalPulls = 0;
  const segmentPerf = { wins: 0, trials: 0 };

  for (const record of globalRecords) {
    const stats        = record.stats ?? {};
    const segKey       = Object.values(record.segment ?? {}).join("|");
    const segmentTotal = ARMS.reduce((sum: number, arm) => sum + (stats[arm]?.pulls ?? 0), 0);
    totalGlobalPulls  += segmentTotal;
    if (segmentTotal < MIN_GLOBAL_PULLS) continue;

    for (const arm of ARMS) {
      const armStats = stats[arm];
      if (!armStats || armStats.pulls < 5) continue;
      const avg = armStats.avgReward ?? 0;
      totalFleetWins   += armStats.wins   ?? 0;
      totalFleetTrials += armStats.pulls;
      if (avg > bestArmAvg) {
        bestArmAvg       = avg;
        topPerformingArm = arm;
        topSegmentKey    = segKey;
      }
    }
    if (segmentKey && segKey === segmentKey) {
      for (const arm of ARMS) {
        segmentPerf.wins   += stats[arm]?.wins   ?? 0;
        segmentPerf.trials += stats[arm]?.pulls  ?? 0;
      }
    }
  }

  const fleetAvgReward = totalFleetTrials > 0 ? totalFleetWins / totalFleetTrials : 0;

  const [clientAvgReward, clientPulls] = await Promise.all([
    getClientAvgReward(db, userId),
    getClientTotalPulls(db, userId),
  ]);

  let clientRankPercentile: number | null = null;
  if (fleetAvgReward > 0 && clientPulls >= 5) {
    clientRankPercentile = Math.max(1, Math.min(99,
      Math.round((clientAvgReward / fleetAvgReward) * 50)
    ));
  }

  const confidence       = Math.min(100, Math.round((totalGlobalPulls / 100) * 100));
  const blend            = getDynamicBlend(clientPulls);
  const isUsingGlobal    = blend.globalWeight > 0.2;
  const segConfidence    = Math.min(100, Math.round((segmentPerf.trials / MIN_GLOBAL_PULLS) * 100));

  let reason = "Not enough fleet data yet to make a recommendation";
  if (topPerformingArm && totalFleetTrials >= MIN_GLOBAL_PULLS) {
    const armLabel = topPerformingArm.replace(/_/g, " ").toLowerCase();
    reason = `${armLabel} is outperforming other strategies across ${fleetSize > 0 ? fleetSize : "similar"} accounts`;
  }

  return {
    fleetSize,
    topPerformingArm,
    topSegment: topSegmentKey,
    confidence,
    clientRankPercentile,
    isUsingGlobalPrior: isUsingGlobal,
    blendWeights: blend,
    segmentPerformance: { wins: segmentPerf.wins, trials: segmentPerf.trials, confidence: segConfidence },
    recommendation: { arm: topPerformingArm, reason },
  };
}

export function buildInsightString(insights: FleetInsights): string {
  if (!insights.topPerformingArm) {
    return "Nova is still gathering fleet-wide data. Insights will appear after more outcomes are recorded.";
  }
  const arm  = insights.topPerformingArm.replace(/_/g, " ");
  const conf = insights.confidence;
  const size = insights.fleetSize;
  if (conf < 30) return `Early signals suggest ${arm} may outperform — more data needed to confirm.`;
  if (conf < 60) return `${arm} is showing consistent results across similar sites. Nova is beginning to apply this across your content.`;
  return `${arm} is the top-performing strategy across ${size > 0 ? `${size} accounts` : "the fleet"} with ${conf}% confidence. Nova applies this automatically.`;
}
