/**
 * lib/system/updateExplorationControlProfile.ts
 *
 * Updates the exploration control profile after each decision resolves.
 * Called when a PlannerFeedbackEvent is resolved for a decision that also
 * had an ExplorationDecisionEvent.
 *
 * Updates:
 *   - exploreCount / exploitCount (separate counters)
 *   - exploreWinRate / exploitWinRate (running averages)
 *   - explorationRate / exploitationRate (drift on win/harm)
 *   - championLockConfidence (rises on champion wins, falls on exploration wins)
 *   - avgTopActionDelta (running avg health delta)
 */
import connectToDatabase         from '@/lib/mongodb';
import ExplorationControlProfile from '@/models/ExplorationControlProfile';
import type { RecommendationQuality } from './evaluatePlannerOutcome';

type ControlMode = 'explore' | 'exploit' | 'shadow_explore' | 'approval_explore';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, parseFloat(v.toFixed(4))));
}

function runningAvg(current: number, n: number, value: number): number {
  return ((current * (n - 1)) + value) / n;
}

export async function updateExplorationControlProfile(input: {
  anomalyType:        string;
  lifecycleStage:     string;
  trustTier:          string;
  policyMode:         string;
  controlMode:        ControlMode;
  outcomeQuality:     RecommendationQuality;
  scoreGap:           number;
  usedChampion:       boolean;
}): Promise<void> {
  await connectToDatabase();

  const scopeKey = [input.anomalyType, input.lifecycleStage, input.trustTier, input.policyMode].join('::');
  let doc = await ExplorationControlProfile.findOne({ scopeKey }) as any;
  if (!doc) {
    doc = await ExplorationControlProfile.create({
      scopeKey,
      anomalyType:    input.anomalyType,
      lifecycleStage: input.lifecycleStage,
      trustTier:      input.trustTier,
      policyMode:     input.policyMode,
    });
  }

  const isWin  = ['strong_hit', 'partial_hit'].includes(input.outcomeQuality) ? 1 : 0;
  const isHarm = input.outcomeQuality === 'harmful' ? 1 : 0;

  // ── Update counters and win rates ──────────────────────────────────────────
  if (input.controlMode === 'explore') {
    doc.exploreCount  += 1;
    const n = doc.exploreCount;
    doc.exploreWinRate = runningAvg(doc.exploreWinRate, n, isWin);
    if (isWin)  doc.explorationRate = clamp01(doc.explorationRate + 0.02);
    if (isHarm) doc.explorationRate = clamp01(doc.explorationRate - 0.06);
  } else if (input.controlMode === 'exploit') {
    doc.exploitCount  += 1;
    const n = doc.exploitCount;
    doc.exploitWinRate = runningAvg(doc.exploitWinRate, n, isWin);
    if (isWin)  doc.exploitationRate = clamp01(doc.exploitationRate + 0.02);
    if (isHarm) doc.exploitationRate = clamp01(doc.exploitationRate - 0.05);
  }
  // shadow_explore and approval_explore do not update rates — no live outcome to attribute

  // ── avgTopActionDelta ─────────────────────────────────────────────────────
  const delta = input.usedChampion ? +input.scoreGap : -input.scoreGap;
  const total = doc.exploreCount + doc.exploitCount;
  if (total > 0) doc.avgTopActionDelta = runningAvg(doc.avgTopActionDelta, total, delta);

  // ── Champion lock confidence ──────────────────────────────────────────────
  if (input.usedChampion && isWin)   doc.championLockConfidence = clamp01(doc.championLockConfidence + 0.04);
  if (!input.usedChampion && isWin)  doc.championLockConfidence = clamp01(doc.championLockConfidence - 0.06);
  if (isHarm)                        doc.championLockConfidence = clamp01(doc.championLockConfidence - 0.08);

  await doc.save();
}
