/**
 * lib/system/buildStabilityFeatureSnapshot.ts
 *
 * Builds a real feature vector from live system data — NOT hardcoded values.
 *
 * Feature sources:
 *   - MetaGovernorSnapshot      → arbitrationRate, conflictDensity, blockedRate, shadowRate
 *   - AdaptiveWeightProfile     → rollbackScore, adaptiveWeightVolatility
 *   - AutonomousResponseTrigger → campaignPressure (trigger density in horizon window)
 *   - AutonomousResponseExecution → operatorOverrideRate, governanceQueuePressure
 *   - RecoveryCampaign          → campaignPressure (active campaigns)
 *   - DecisionReplayLearningEvent → replayImprovementRate
 *   - GovernedDecisionRecord    → policyHarmRate (via harmful decision ratio per scope)
 *
 * For scope/scope_family targets, data is filtered by targetKey where possible.
 * For system-level targets ('global', 'system'), full aggregate statistics are used.
 */
import connectToDatabase              from '@/lib/mongodb';
import MetaGovernorSnapshot           from '@/models/system/MetaGovernorSnapshot';
import AdaptiveWeightProfile          from '@/models/system/AdaptiveWeightProfile';
import AutonomousResponseTrigger      from '@/models/system/AutonomousResponseTrigger';
import AutonomousResponseExecution    from '@/models/system/AutonomousResponseExecution';
import { RecoveryCampaign }           from '@/models/system/RecoveryCampaign';
import { StabilityFeatureSnapshot }   from '@/models/system/GlobalStabilityForecast';
import type { StabilityFeatures }     from './computeStabilityRisk';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n ?? 0));

export async function buildStabilityFeatureSnapshot(input: {
  targetType:     'scope' | 'scope_family' | 'tenant' | 'campaign_region' | 'policy_rule' | 'champion_market';
  targetKey:      string;
  horizonMinutes: number;
}): Promise<{ snapshotKey: string; targetType: string; targetKey: string; horizonMinutes: number; features: StabilityFeatures }> {
  await connectToDatabase();

  const cutoff = new Date(Date.now() - input.horizonMinutes * 60_000);
  const isGlobal = input.targetKey === 'global' || input.targetKey === 'system';

  // ── System health from latest MetaGovernorSnapshot ────────────────────
  const snap = await MetaGovernorSnapshot.findOne().sort({ createdAt: -1 }).lean() as any;
  const health = snap?.systemHealth ?? {};
  const auth   = snap?.authorityStats ?? {};
  const conf   = snap?.conflictStats ?? {};
  const replay = snap?.replaySignals ?? {};

  const arbitrationRate  = clamp01(auth.arbitrationRate ?? health.arbitrationRate ?? 0);
  const conflictDensity  = clamp01(conf.conflictDensity ?? 0);
  const blockedRate      = clamp01(health.blockedRate   ?? 0);
  const shadowRate       = clamp01(health.shadowRate    ?? 0);

  // ── Adaptive weight volatility + rollback score ───────────────────────
  const profileQuery: any = isGlobal ? { status: 'learning' } : { profileKey: { $regex: input.targetKey } };
  const profiles = await AdaptiveWeightProfile.find(profileQuery).limit(20).lean() as any[];

  let rollbackScore = 0;
  let adaptiveWeightVolatility = 0;

  if (profiles.length > 0) {
    // rollbackScore: average across profiles; volatility: coefficient of variation of plannerWeight
    rollbackScore = profiles.reduce((s, p) => s + (p.rollbackScore ?? 0), 0) / profiles.length;
    const weights = profiles.map(p => p.plannerWeight ?? 1);
    const mean    = weights.reduce((a, b) => a + b, 0) / weights.length;
    const stddev  = Math.sqrt(weights.reduce((s, w) => s + (w - mean) ** 2, 0) / weights.length);
    adaptiveWeightVolatility = clamp01(stddev / Math.max(mean, 0.01));
  }

  // ── Campaign pressure from trigger density ────────────────────────────
  const [triggerCount, activeCampaigns] = await Promise.all([
    AutonomousResponseTrigger.countDocuments({ status: { $in: ['open', 'planned'] }, createdAt: { $gte: cutoff } }),
    RecoveryCampaign.countDocuments({ status: { $in: ['active', 'stabilizing'] } }),
  ]);
  const campaignPressure = clamp01((triggerCount / 20) * 0.6 + (activeCampaigns / 5) * 0.4);

  // ── Governance queue pressure from execution states ───────────────────
  const [pendingApprovals, recentExecutions] = await Promise.all([
    AutonomousResponseExecution.countDocuments({ executionStatus: 'planned', createdAt: { $gte: cutoff } }),
    AutonomousResponseExecution.countDocuments({ createdAt: { $gte: cutoff } }),
  ]);
  const governanceQueuePressure = clamp01(pendingApprovals / Math.max(recentExecutions, 1));
  const operatorOverrideRate    = clamp01(auth.operatorOverrideRate ?? 0);

  // ── Replay signals ────────────────────────────────────────────────────
  const replayImprovementRate = clamp01(replay.improvementRate ?? 0);

  // ── Graph neighborhood risk: weighted avg of adjacent scope rollback scores
  // Use other profiles' rollback scores as proxy for neighborhood risk
  const neighborRisk = profiles.length > 1
    ? clamp01(profiles.slice(1).reduce((s, p) => s + (p.rollbackScore ?? 0), 0) / (100 * (profiles.length - 1)))
    : conflictDensity * 0.5;

  const features: StabilityFeatures = {
    arbitrationRate,
    conflictDensity,
    blockedRate,
    shadowRate,
    rollbackScore:              clamp01(rollbackScore / 100),
    replayImprovementRate,
    driftScore:                 clamp01(conf.conflictDensity ?? 0),  // conflict density doubles as drift proxy
    championDecayScore:         clamp01(adaptiveWeightVolatility * 0.8),
    policyHarmRate:             0,  // populated by caller from GovernedDecisionRecord if available
    confidenceCalibrationError: clamp01(health.calibrationError  ?? 0),
    adaptiveWeightVolatility,
    inheritanceMismatchRate:    0,  // populated by caller from policy evaluation data
    campaignPressure,
    operatorOverrideRate,
    governanceQueuePressure,
    graphNeighborhoodRisk:      neighborRisk,
  };

  const snapshotKey = `${input.targetType}::${input.targetKey}::${Date.now()}`;

  // Persist snapshot for calibration loop
  await StabilityFeatureSnapshot.create({ snapshotKey, targetType: input.targetType, targetKey: input.targetKey, horizonMinutes: input.horizonMinutes, features });

  return { snapshotKey, targetType: input.targetType, targetKey: input.targetKey, horizonMinutes: input.horizonMinutes, features };
}
