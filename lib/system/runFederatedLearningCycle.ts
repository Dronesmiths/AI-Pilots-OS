/**
 * lib/system/runFederatedLearningCycle.ts
 *
 * All federated policy learning — 7 exports.
 *
 *   buildFederatedAggregate        privacy-safe cohort aggregation (3-tenant minimum)
 *   computeFederatedConfidence     reliability score for an aggregate
 *   evaluateFederatedPromotion     should this become a candidate? (score >= 28)
 *   applyFederatedPrior            bounded blend: local=0.7, federated≤0.3
 *   evaluateFederatedRollback      should an active rule be rolled back?
 *   runFederatedLearningCycle      full orchestrator: query → aggregate → score → promote → rollback
 *   buildFederatedPayload          type-safe payload builder per artifact type
 *
 * RULE: Federated priors may influence autopilot, simulation, and preventive optimizer.
 *       They may NEVER bypass local governance, constitutional rules, or operator authority.
 *       Aggregation requires >= 3 unique tenants to preserve privacy.
 */
import connectToDatabase               from '@/lib/mongodb';
import { FederatedPolicyAggregate, FederatedPolicyCandidate, FederatedPolicyRule } from '@/models/system/FederatedLearning';
import { TenantModeOutcomeRecord, TenantIntelligenceProfile } from '@/models/system/CrossTenantIntelligence';
import { aggregateCohortModePerformance } from './crossTenantIntelligence';

const MODE_NAMES = ['conservative', 'balanced', 'aggressive', 'recovery', 'prevention_first'] as const;

// ── 1. Privacy-safe aggregator ────────────────────────────────────────────
export function buildFederatedAggregate(input: {
  cohortKey:    string;
  artifactType: string;
  targetKey:    string;
  records:      Array<{ tenantId: string; outcomeScore: number; costAvoided: number; downtimePrevented: number; governanceLoad: number; harmRate: number; rollbackRate: number }>;
}): { valid: boolean; reason?: string; aggregate?: any } {
  const uniqueTenants = [...new Set(input.records.map(r => r.tenantId))];
  if (uniqueTenants.length < 3) return { valid: false, reason: `Insufficient tenant diversity: ${uniqueTenants.length} tenants (minimum 3 required for privacy-safe aggregation)` };

  const avg = (vals: number[]) => vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  return {
    valid: true,
    aggregate: {
      cohortKey:    input.cohortKey,
      artifactType: input.artifactType,
      targetKey:    input.targetKey,
      memberCount:  uniqueTenants.length,
      supportCount: input.records.length,
      aggregatedMetrics: {
        avgOutcomeScore:      avg(input.records.map(r => r.outcomeScore)),
        avgCostAvoided:       avg(input.records.map(r => r.costAvoided)),
        avgDowntimePrevented: avg(input.records.map(r => r.downtimePrevented)),
        avgGovernanceLoad:    avg(input.records.map(r => r.governanceLoad)),
        avgHarmRate:          avg(input.records.map(r => r.harmRate)),
        avgRollbackRate:      avg(input.records.map(r => r.rollbackRate)),
      },
      privacySafe: true,
    },
  };
}

// ── 2. Confidence scorer ──────────────────────────────────────────────────
export function computeFederatedConfidence(input: {
  memberCount:      number;
  supportCount:     number;
  avgOutcomeScore:  number;
  avgHarmRate:      number;
  avgRollbackRate:  number;
}): number {
  let c = 0;
  c += Math.min(input.memberCount  / 10, 1) * 0.30;
  c += Math.min(input.supportCount / 25, 1) * 0.25;
  c += Math.max(0, Math.min(input.avgOutcomeScore / 100, 1)) * 0.25;
  c += Math.max(0, 1 - input.avgHarmRate)    * 0.10;
  c += Math.max(0, 1 - input.avgRollbackRate)* 0.10;
  return +(Math.max(0, Math.min(c, 1)).toFixed(3));
}

// ── 3. Promotion evaluator ────────────────────────────────────────────────
export function evaluateFederatedPromotion(input: {
  artifactType:    string;
  supportCount:    number;
  confidence:      number;
  avgOutcomeScore: number;
  avgHarmRate:     number;
  avgRollbackRate: number;
}): { verdict: 'approved' | 'approval_required' | 'rejected'; rolloutMode: 'shadow' | 'limited' | 'active'; promotionScore: number; rationale: string } {
  let score = 0;
  if (input.supportCount >= 20) score += 20;
  else if (input.supportCount >= 10) score += 10;
  score += input.confidence       * 35;
  score += Math.max(0, input.avgOutcomeScore / 5);
  score -= input.avgHarmRate      * 40;
  score -= input.avgRollbackRate  * 30;
  const ps = +score.toFixed(2);

  if (ps >= 45) return { verdict: 'approved',          rolloutMode: 'shadow', promotionScore: ps, rationale: 'Federated evidence is strong enough for governed shadow rollout' };
  if (ps >= 28) return { verdict: 'approval_required', rolloutMode: 'shadow', promotionScore: ps, rationale: 'Federated evidence is promising but requires operator review' };
  return           { verdict: 'rejected',          rolloutMode: 'shadow', promotionScore: ps, rationale: 'Federated evidence is too weak or too risky to promote' };
}

// ── 4. Federated-local blend ──────────────────────────────────────────────
export function applyFederatedPrior(input: { localSignal: number; federatedSignal: number; federatedConfidence: number; localTrustDominance?: number }): number {
  const localW     = input.localTrustDominance ?? 0.7;
  const fedW       = Math.min(0.3, input.federatedConfidence * 0.3);
  return +((input.localSignal * localW) + (input.federatedSignal * fedW)).toFixed(3);
}

// ── 5. Rollback evaluator ─────────────────────────────────────────────────
export function evaluateFederatedRollback(input: { sampleCount: number; hitRate: number; harmRate: number; rollbackRate: number; cohortDriftScore: number }): { rollbackScore: number; shouldRollback: boolean } {
  let s = 0;
  if (input.sampleCount >= 8 && input.hitRate < 0.45) s += 18;
  if (input.harmRate    > 0.20) s += 30;
  if (input.rollbackRate> 0.15) s += 20;
  if (input.cohortDriftScore > 0.5) s += 18;
  return { rollbackScore: s, shouldRollback: s >= 35 };
}

// ── 6. Payload builder ────────────────────────────────────────────────────
export function buildFederatedPayload(artifactType: string, mode: string, metrics: any): any {
  switch (artifactType) {
    case 'mode_prior':         return { recommendedMode: mode, cohortScore: +(metrics.avgOutcomeScore ?? 0).toFixed(1) };
    case 'preventive_prior':   return { preferredAction: 'trigger_replay_scan', avoidAction: 'rollback_weight_profile', expectedAdvantage: +(metrics.avgCostAvoided ?? 14).toFixed(1) };
    case 'policy_tuning_prior':return { targetField: 'policyWeight', suggestedMultiplier: +(1 - (metrics.avgHarmRate ?? 0.05) * 2).toFixed(3) };
    case 'recovery_prior':     return { enterRecoveryEarlier: (metrics.avgInstabilityScore ?? 50) < 50, thresholdShift: -8 };
    case 'governance_prior':   return { approvalStrictnessShift: +(metrics.avgHarmRate ?? 0.05) * 2, autoResponseAllowanceShift: -0.05 };
    default:                   return { raw: metrics };
  }
}

// ── 7. Full orchestrated cycle ────────────────────────────────────────────
export async function runFederatedLearningCycle(input?: { cohortKey?: string; forcePromotion?: boolean }): Promise<any> {
  await connectToDatabase();

  // Rollback check on active rules FIRST (before creating new ones)
  const activeRules = await FederatedPolicyRule.find({ status: { $in: ['shadow', 'active'] } }).lean() as any[];
  const rolledBack: string[] = [];
  for (const rule of activeRules) {
    const rb = evaluateFederatedRollback({
      sampleCount:     rule.performance?.sampleCount   ?? 0,
      hitRate:         rule.performance?.hitRate        ?? 1,
      harmRate:        rule.performance?.harmRate       ?? 0,
      rollbackRate:    rule.performance?.rollbackScore  ?? 0,
      cohortDriftScore:rule.performance?.rollbackScore ?? 0,
    });
    if (rb.shouldRollback) {
      await FederatedPolicyRule.findOneAndUpdate({ ruleKey: rule.ruleKey }, { status: 'rolled_back', 'performance.rollbackScore': rb.rollbackScore });
      rolledBack.push(rule.ruleKey);
    }
  }

  // Query cohorts — use filter if provided
  const profileQuery: any = {};
  if (input?.cohortKey) profileQuery.cohortKey = input.cohortKey;
  const profiles = await TenantIntelligenceProfile.find(profileQuery).lean() as any[];

  // Group profiles by cohortKey
  const byCohort: Record<string, any[]> = {};
  for (const p of profiles) {
    const key = p.cohortKey ?? 'unknown';
    if (!byCohort[key]) byCohort[key] = [];
    byCohort[key].push(p);
  }

  const aggregates: any[] = [];
  const candidates:  any[] = [];

  for (const [cohortKey, members] of Object.entries(byCohort)) {
    // Query mode outcome records for this cohort
    const records = await TenantModeOutcomeRecord.find({ cohortKey }).limit(100).lean() as any[];

    // Find best mode for this cohort
    const modePerf = aggregateCohortModePerformance(records);
    const bestMode = Object.entries(modePerf).sort(([, a], [, b]) => b - a)[0]?.[0];
    if (!bestMode) continue;

    // Build privacy-safe aggregate
    const aggInput = {
      cohortKey,
      artifactType: 'mode_prior',
      targetKey:    bestMode,
      records:      records.map(r => ({
        tenantId:         r.tenantId,
        outcomeScore:     r.score           ?? 0,
        costAvoided:      r.metrics?.costAvoided       ?? 0,
        downtimePrevented:r.metrics?.downtimePrevented ?? 0,
        governanceLoad:   r.metrics?.governanceLoad    ?? 0,
        harmRate:         r.metrics?.harmRate          ?? 0,
        rollbackRate:     r.metrics?.rollbackRate      ?? 0,
      })),
    };
    const built = buildFederatedAggregate(aggInput);
    if (!built.valid) continue;

    const conf = computeFederatedConfidence({
      memberCount:     built.aggregate.memberCount,
      supportCount:    built.aggregate.supportCount,
      avgOutcomeScore: built.aggregate.aggregatedMetrics.avgOutcomeScore,
      avgHarmRate:     built.aggregate.aggregatedMetrics.avgHarmRate,
      avgRollbackRate: built.aggregate.aggregatedMetrics.avgRollbackRate,
    });

    const aggregateKey = `federated::${cohortKey}::mode_prior::${bestMode}::${Date.now()}`;
    const agg = await FederatedPolicyAggregate.findOneAndUpdate(
      { cohortKey, artifactType: 'mode_prior', targetKey: bestMode },
      { ...built.aggregate, confidence: conf, aggregateKey },
      { upsert: true, new: true }
    );
    aggregates.push(agg);

    // Evaluate promotion
    const promo = evaluateFederatedPromotion({
      artifactType:    'mode_prior',
      supportCount:    built.aggregate.supportCount,
      confidence:      conf,
      avgOutcomeScore: built.aggregate.aggregatedMetrics.avgOutcomeScore,
      avgHarmRate:     built.aggregate.aggregatedMetrics.avgHarmRate,
      avgRollbackRate: built.aggregate.aggregatedMetrics.avgRollbackRate,
    });

    if (promo.verdict !== 'rejected' || input?.forcePromotion) {
      const candidateKey = `candidate::${cohortKey}::${bestMode}::${Date.now()}`;
      const payload = buildFederatedPayload('mode_prior', bestMode, built.aggregate.aggregatedMetrics);
      const candidate = await FederatedPolicyCandidate.create({
        candidateKey,
        cohortKey,
        aggregateKey:   agg.aggregateKey ?? aggregateKey,
        artifactType:   'mode_prior',
        targetKey:      bestMode,
        proposedPayload:payload,
        supportCount:   built.aggregate.supportCount,
        confidence:     conf,
        promotionScore: promo.promotionScore,
        harmRisk:       built.aggregate.aggregatedMetrics.avgHarmRate,
        verdict:        promo.verdict,
        rationale:      promo.rationale,
      });
      candidates.push(candidate.toObject?.() ?? candidate);

      // Auto-create shadow rule if approved
      if (promo.verdict === 'approved') {
        await FederatedPolicyRule.findOneAndUpdate(
          { cohortKey, artifactType: 'mode_prior', targetKey: bestMode, status: { $in: ['shadow', 'active'] } },
          { ruleKey: `rule::${cohortKey}::${bestMode}::${Date.now()}`, candidateKey, artifactType: 'mode_prior', cohortKey, targetKey: bestMode, payload, rolloutMode: 'shadow', status: 'shadow' },
          { upsert: true, new: true }
        );
      }
    }
  }

  return { processed: Object.keys(byCohort).length, aggregates: aggregates.length, candidates: candidates.length, rolledBack, candidateList: candidates.slice(0, 10) };
}
