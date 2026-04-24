/**
 * lib/system/buildMetaGovernorSnapshot.ts
 *
 * Queries all governance models and produces a comprehensive system snapshot.
 * All analysis functions query real data — no stubs.
 *
 * healthScore formula:
 *   executionRate × 40 + (1 - blockedRate) × 30 + (1 - conflictDensity) × 30
 */
import connectToDatabase             from '@/lib/mongodb';
import GovernedDecisionRecord        from '@/models/GovernedDecisionRecord';
import AdaptiveWeightProfile         from '@/models/system/AdaptiveWeightProfile';
import DecisionReplaySession         from '@/models/system/DecisionReplaySession';
import ReplayWeightUpdateCandidate   from '@/models/system/ReplayWeightUpdateCandidate';
import DecisionReplayLearningEvent   from '@/models/system/DecisionReplayLearningEvent';
import MetaGovernorSnapshot          from '@/models/system/MetaGovernorSnapshot';
import { evaluateAdaptiveWeightRollback } from './evaluateReplayWeightSafetyGate';

// ── Helpers ───────────────────────────────────────────────────────────────

function analyzeAuthority(decisions: any[]) {
  const stats = { planner: 0, policy: 0, champion: 0, operator: 0, arbitration: 0 };
  for (const d of decisions) {
    const src = d.authoritySource ?? '';
    if (src === 'planner')   stats.planner++;
    else if (src === 'policy')  stats.policy++;
    else if (src === 'champion')stats.champion++;
    else if (src === 'operator')stats.operator++;
    if (d.arbitration?.wasConflict) stats.arbitration++;
  }
  const total = decisions.length || 1;
  return {
    plannerDominance:     parseFloat((stats.planner    / total).toFixed(3)),
    policyDominance:      parseFloat((stats.policy     / total).toFixed(3)),
    championDominance:    parseFloat((stats.champion   / total).toFixed(3)),
    operatorOverrideRate: parseFloat((stats.operator   / total).toFixed(3)),
    arbitrationRate:      parseFloat((stats.arbitration/ total).toFixed(3)),
  };
}

function analyzeConflicts(decisions: any[]) {
  let totalConflicts = 0;
  const highConflictScopes = new Set<string>();

  for (const d of decisions) {
    if (d.arbitration?.wasConflict) {
      totalConflicts++;
      if ((d.arbitration?.scoreMargin ?? 999) < 10) {
        highConflictScopes.add(d.scopeKey);
      }
    }
  }

  const conflictDensity = decisions.length ? parseFloat((totalConflicts / decisions.length).toFixed(3)) : 0;
  return { totalConflicts, highConflictScopes: [...highConflictScopes], conflictDensity };
}

function analyzeRollback(weights: any[], decisions: any[]) {
  return weights.map(w => {
    // Compute from evaluation events if available; otherwise use execution data
    const decisionSubset = decisions.filter(d => d.scopeKey?.startsWith(w.scopeSelector?.anomalyType ?? ''));
    const sampleCount    = decisionSubset.length;
    const hitCount       = decisionSubset.filter(d => d.execution?.status === 'completed').length;
    const harmCount      = decisionSubset.filter(d => d.outcome?.harmful).length;
    const avgDelta       = sampleCount > 0
      ? decisionSubset.reduce((s, d) => s + (d.outcome?.delta ?? 0), 0) / sampleCount : 0;

    const eval_ = evaluateAdaptiveWeightRollback({
      sampleCount, hitRate: sampleCount ? hitCount / sampleCount : 0.7,
      harmRate: sampleCount ? harmCount / sampleCount : 0,
      avgDelta,
    });

    return {
      profileKey:     w.profileKey,
      rolloutMode:    w.rolloutMode,
      status:         w.status,
      rollbackScore:  eval_.rollbackScore,
      shouldRollback: eval_.shouldRollback,
      dominantReason: eval_.dominantReason,
      riskLevel:      eval_.rollbackScore > 70 ? 'critical' : eval_.rollbackScore > 35 ? 'watch' : 'stable',
    };
  });
}

async function analyzeReplay(sessions: any[]) {
  const improved = sessions.filter(s => (s.summary?.actualVsBestDelta ?? 0) > 0).length;
  const pendingUpdates = await ReplayWeightUpdateCandidate.countDocuments({ verdict: { $in: ['pending', 'shadow', 'approved'] } });

  // Top signals from actual learning events
  const topEventGroups = await DecisionReplayLearningEvent.aggregate([
    { $match: { applied: false } },
    { $group: { _id: '$learningType', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 4 },
  ]);

  return {
    activeSessions:  sessions.length,
    improvementRate: sessions.length ? parseFloat((improved / sessions.length).toFixed(3)) : 0,
    topSignals:      topEventGroups.map((g: any) => g._id),
    pendingUpdates,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────

export async function buildMetaGovernorSnapshot(): Promise<any> {
  await connectToDatabase();

  const cutoff48h = new Date(Date.now() - 48 * 3_600_000);

  const [decisions, weights, replaySessions] = await Promise.all([
    GovernedDecisionRecord.find({ createdAt: { $gte: cutoff48h } })
      .select('traceId tenantId scopeKey authoritySource authorityPath arbitration execution outcome')
      .sort({ createdAt: -1 }).limit(200).lean() as Promise<any[]>,
    AdaptiveWeightProfile.find({ status: { $ne: 'rolled_back' } }).lean() as Promise<any[]>,
    DecisionReplaySession.find({ status: 'completed', createdAt: { $gte: cutoff48h } }).lean() as Promise<any[]>,
  ]);

  const total      = decisions.length || 1;
  const execRate   = parseFloat((decisions.filter(d => d.execution?.status === 'completed').length / total).toFixed(3));
  const blockedRate= parseFloat((decisions.filter(d => d.execution?.status === 'blocked').length   / total).toFixed(3));
  const shadowRate = parseFloat((decisions.filter(d => d.execution?.status === 'shadow').length    / total).toFixed(3));

  const conflictStats  = analyzeConflicts(decisions);
  const healthScore    = Math.round(execRate * 40 + (1 - blockedRate) * 30 + (1 - conflictStats.conflictDensity) * 30);

  const snapshot = {
    snapshotKey: `meta::${Date.now()}`,
    systemHealth: { activeDecisions: decisions.length, executionRate: execRate, blockedRate, shadowRate, healthScore },
    authorityStats: analyzeAuthority(decisions),
    conflictStats,
    weightProfiles: weights.map(w => ({
      profileKey:     w.profileKey,
      plannerWeight:  w.plannerWeight,
      policyWeight:   w.policyWeight,
      championWeight: w.championWeight,
      inheritedWeight:w.inheritedWeight,
      rolloutMode:    w.rolloutMode,
      status:         w.status,
    })),
    rollbackRisks:  analyzeRollback(weights, decisions),
    replaySignals:  await analyzeReplay(replaySessions),
  };

  await MetaGovernorSnapshot.create(snapshot);
  return snapshot;
}
