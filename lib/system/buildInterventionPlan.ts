/**
 * lib/system/buildInterventionPlan.ts
 *
 * ONE BRAIN — the Intervention Planner.
 *
 * Unifies all intelligence signals into a single final decision:
 *   Graph suggestions → Trust tiers → Policy modes → Lifecycle state
 *   → ONE recommended action + execution mode + full reasoning
 *
 * Signal sources (all from existing models — no new state introduced):
 *   Graph:     getGraphDrivenInterventionSuggestions()  ← path evidence
 *   Context:   buildActionContextSnapshot()             ← current tenant state
 *   Trust:     AnomalyActionLeaderboardSnapshot         ← per-action trust tier
 *   Policy:    AnomalyActionPolicy                      ← per-action execution mode
 *   Lifecycle: TenantRuntimeState                       ← warm/cold/degraded/warming
 *
 * Hard rules (non-negotiable per system design):
 *   - 'disabled' policy → always rejected, never in candidates
 *   - Graph is an input signal, NOT the final authority
 *   - Policy mode is the final gate on executionMode
 *   - Trust tier modulates score but never overrides policy
 *
 * Score adjustment stack (applied to base graph score):
 *   +15  lifecycle-biased action match (e.g. stabilize in degraded)
 *   +10  elite trust tier
 *    −10 watch trust tier
 *    −20 risky/probation trust tier
 *    −20 worsenedRate > 0.2 in any non-auto context
 *    −15 worsenedRate > 0.4 (absolute penalty regardless of policy)
 */

import connectToDatabase                             from '@/lib/mongodb';
import TenantRuntimeState                            from '@/models/TenantRuntimeState';
import AnomalyActionLeaderboardSnapshot              from '@/models/AnomalyActionLeaderboardSnapshot';
import AnomalyActionPolicy                           from '@/models/AnomalyActionPolicy';
import { buildActionContextSnapshot }               from './buildActionContextSnapshot';
import { getGraphDrivenInterventionSuggestions }    from './getGraphDrivenInterventionSuggestions';
import { getInterventionStrategy }                  from './getInterventionStrategy';
import { getPlannerSignalCalibration }              from './getPlannerSignalCalibration';
import { getPlannerConfidenceCalibration }          from './getPlannerConfidenceCalibration';
import { applySelfDoubtAdjustment }                 from './applySelfDoubtAdjustment';
import { persistPlannerDecision }                   from './persistPlannerDecision';
import { persistArbitrationCase }                   from './persistArbitrationCase';
import { runArbitration }                           from './runArbitration';
import { findActiveGraphPolicyRules }               from './globalGraphQueries';
import ScopeActionMarket                            from '@/models/ScopeActionMarket';
import type { GraphInterventionSuggestion }         from './getGraphDrivenInterventionSuggestions';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InterventionCandidate {
  actionType:       string;
  baseScore:        number;
  adjustedScore:    number;
  source:           'graph' | 'causal_memory' | 'leaderboard';
  trustTier:        string;
  policyMode:       string;
  confidence:       'high' | 'medium' | 'low';
  reason:           string;
  metrics: {
    actionAvgEffectiveness: number;
    successRate:            number;
    worsenedRate:           number;
  };
}

export interface InterventionRejection {
  actionType: string;
  reason:     string;
}

export type ExecutionMode = 'auto' | 'suggest' | 'shadow';

export interface InterventionPlan {
  tenantId:          string;
  anomalyType:       string;
  recommendedAction: string | null;
  strategy:          string;
  confidence:        'high' | 'medium' | 'low';
  reason:            string;
  executionMode:     ExecutionMode;
  candidates:        InterventionCandidate[];
  rejected:          InterventionRejection[];
  supportingContext: {
    anomaly:        string;
    lifecycleStage: string;
    trustTier:      string;
    runtimeState:   string;
    queueDepth:     number;
    recoveryCount24h: number;
  };
  graphGrounded: boolean;
  builtAt:       Date;
}

// ── Lookups ───────────────────────────────────────────────────────────────────

async function fetchTrustTiers(anomalyType: string, actionTypes: string[]) {
  const docs = await AnomalyActionLeaderboardSnapshot
    .find({ anomalyType, actionType: { $in: actionTypes } })
    .select('actionType trustTier trustScore')
    .lean() as any[];
  const map = new Map<string, { tier: string; score: number }>();
  for (const d of docs) map.set(d.actionType, { tier: d.trustTier ?? 'watch', score: d.trustScore ?? 40 });
  return map;
}

async function fetchPolicyModes(anomalyType: string, actionTypes: string[]) {
  const docs = await AnomalyActionPolicy
    .find({ anomalyType, actionType: { $in: actionTypes } })
    .select('actionType mode')
    .lean() as any[];
  const map = new Map<string, string>();
  for (const d of docs) map.set(d.actionType, d.mode ?? 'recommend_only');
  // Default: any action without a policy record → recommend_only (safe-by-default rule)
  for (const a of actionTypes) if (!map.has(a)) map.set(a, 'recommend_only');
  return map;
}

// ── Score adjustment stack ────────────────────────────────────────────────────

const TRUST_BIAS: Record<string, number> = {
  elite:     +10,
  trusted:   +5,
  watch:     -10,
  risky:     -20,
  probation: -20,
};

const LIFECYCLE_ACTION_BOOST: Record<string, string[]> = {
  degraded: ['stabilize_system', 'throttle_system'],
  cold:     ['seed_jobs'],
  warming:  ['increase_throughput', 'inject_activity', 'force_publish'],
  warm:     ['inject_activity', 'force_publish'],
};

function applyScoreAdjustments(
  base:           number,
  trustTier:      string,
  worsenedRate:   number,
  policyMode:     string,
  lifecycleStage: string,
  actionType:     string,
): number {
  let score = base;

  // Trust tier bias
  score += TRUST_BIAS[trustTier] ?? 0;

  // Lifecycle-action alignment bonus
  const boostActions = LIFECYCLE_ACTION_BOOST[lifecycleStage] ?? [];
  if (boostActions.includes(actionType)) score += 15;

  // Worsened rate penalty in non-auto contexts
  if (policyMode !== 'auto' && worsenedRate > 0.2) score -= 20;

  // Absolute high worsened penalty
  if (worsenedRate > 0.4) score -= 15;

  return Math.round(score);
}

// ── Execution mode derivation ─────────────────────────────────────────────────

function deriveExecutionMode(
  policyMode: string,
  trustTier:  string,
): ExecutionMode {
  if (policyMode === 'disabled')        return 'suggest'; // never reached (disabled → rejected)
  if (policyMode === 'recommend_only')  return 'suggest';

  if (policyMode === 'auto') {
    if (trustTier === 'elite' || trustTier === 'trusted') return 'auto';
    return 'shadow'; // auto policy but tier doesn't support full auto → shadow test
  }

  if (policyMode === 'manual_approved') return 'shadow';

  return 'suggest';
}

// ── Main planner ──────────────────────────────────────────────────────────────

export async function buildInterventionPlan(input: {
  tenantId:    string;
  anomalyType: string;
}): Promise<InterventionPlan> {
  await connectToDatabase();

  // ── Gather all signals in parallel ───────────────────────────────────────
  const [context, runtimeDoc] = await Promise.all([
    buildActionContextSnapshot(input.tenantId),
    TenantRuntimeState.findOne({ tenantId: input.tenantId }).select('state metrics').lean() as Promise<any>,
  ]);

  const lifecycleStage = (runtimeDoc as any)?.state ?? context.runtimeState ?? 'cold';

  // Graph suggestions (already ranked by path quality)
  const graphSuggestions = await getGraphDrivenInterventionSuggestions({
    anomalyType:    input.anomalyType,
    currentContext: context,
    limit:          8, // fetch more than needed to ensure we have candidates after filtering
  });

  const graphGrounded = graphSuggestions.length > 0;
  const actionTypes   = graphSuggestions.map(s => s.actionType);

  if (!actionTypes.length) {
    // No graph suggestions available — return a minimal plan
    return {
      tenantId:          input.tenantId,
      anomalyType:       input.anomalyType,
      recommendedAction: null,
      strategy:          'observation',
      confidence:        'low',
      reason:            'Intervention memory graph is sparse — run more action cycles to build path evidence',
      executionMode:     'suggest',
      candidates:        [],
      rejected:          [],
      supportingContext: {
        anomaly:        input.anomalyType,
        lifecycleStage,
        trustTier:      'unknown',
        runtimeState:   context.runtimeState,
        queueDepth:     context.queueDepth,
        recoveryCount24h: context.recoveryCount24h,
      },
      graphGrounded: false,
      builtAt:       new Date(),
    };
  }

  // ── Bulk fetch trust tiers + policy modes ─────────────────────────────────
  const [trustMap, policyMap] = await Promise.all([
    fetchTrustTiers(input.anomalyType, actionTypes),
    fetchPolicyModes(input.anomalyType, actionTypes),
  ]);

  // ── Enrich and score each candidate ──────────────────────────────────────
  const candidates:  InterventionCandidate[]  = [];
  const rejected:    InterventionRejection[]  = [];

  for (const s of graphSuggestions) {
    const trust      = trustMap.get(s.actionType)  ?? { tier: 'watch', score: 40 };
    const policyMode = policyMap.get(s.actionType) ?? 'recommend_only';

    // Hard reject: disabled policy
    if (policyMode === 'disabled') {
      rejected.push({ actionType: s.actionType, reason: 'blocked_by_policy' });
      continue;
    }

    // Hard reject: extremely high worsened rate
    if ((s.metrics.worsenedRate ?? 0) > 0.6) {
      rejected.push({ actionType: s.actionType, reason: 'high_worsened_rate' });
      continue;
    }

    const adjustedScore = applyScoreAdjustments(
      s.score,
      trust.tier,
      s.metrics.worsenedRate ?? 0,
      policyMode,
      lifecycleStage,
      s.actionType,
    );

    // Soft reject: adjusted score too low to be useful
    if (adjustedScore <= 0) {
      rejected.push({ actionType: s.actionType, reason: 'insufficient_adjusted_score' });
      continue;
    }

    candidates.push({
      actionType:    s.actionType,
      baseScore:     s.score,
      adjustedScore,
      source:        'graph',
      trustTier:     trust.tier,
      policyMode,
      confidence:    s.confidence,
      reason:        s.reason,
      metrics: {
        actionAvgEffectiveness: s.metrics.actionAvgEffectiveness,
        successRate:            s.metrics.successRate,
        worsenedRate:           s.metrics.worsenedRate,
      },
    });
  }

  // ── Fetch learned calibration weights for this scope ─────────────────────
  // Returns neutral (all 1.0) until MIN_SAMPLES threshold is met — safe cold start.
  const calibration = await getPlannerSignalCalibration({
    anomalyType:    input.anomalyType,
    lifecycleStage,
    trustTier:      candidates[0]?.trustTier  ?? 'watch',
    policyMode:     candidates[0]?.policyMode ?? 'recommend_only',
  });

  // Apply source weight multiplier to adjustedScore
  for (const c of candidates) {
    let multiplier = 1.0;
    if      (c.source === 'graph')         multiplier = calibration.graphWeight;
    else if (c.source === 'causal_memory') multiplier = calibration.causalMemoryWeight;
    else if (c.source === 'leaderboard')   multiplier = calibration.leaderboardWeight;
    c.adjustedScore = Math.round(c.adjustedScore * multiplier);
  }

  candidates.sort((a, b) => b.adjustedScore - a.adjustedScore);

  // ── Apply self-doubt adjustment (confidence calibration history) ──────────────
  // Fetched after signal calibration to avoid adding extra scope to the first fetch.
  const confCalibration = await getPlannerConfidenceCalibration({
    anomalyType:    input.anomalyType,
    lifecycleStage,
    trustTier:      candidates[0]?.trustTier  ?? 'watch',
    policyMode:     candidates[0]?.policyMode ?? 'recommend_only',
  });

  for (const c of candidates) {
    const selfDoubt = applySelfDoubtAdjustment({
      baseConfidence: c.confidence,
      score:          c.adjustedScore,
      calibration:    confCalibration,
    });
    c.adjustedScore = selfDoubt.adjustedScore;
    c.confidence    = selfDoubt.adjustedConfidence;
    (c as any).uncertaintyLevel = selfDoubt.uncertaintyLevel;
  }

  // Re-sort after self-doubt may have changed adjusted scores
  candidates.sort((a, b) => b.adjustedScore - a.adjustedScore);
  const winner = candidates[0] ?? null;

  // ── Derive final plan ─────────────────────────────────────────────────────
  const strategy      = getInterventionStrategy(input.anomalyType, lifecycleStage, winner?.actionType ?? null);
  let   executionMode = winner ? deriveExecutionMode(winner.policyMode, winner.trustTier) : 'suggest';

  // ── Overconfidence override: planner has been confidently wrong in this scope ───
  // If overconfidenceScore > 0.4, force suggest regardless of policy/trust.
  // This is the key safety behavior of the self-doubt layer.
  if (confCalibration.overconfidenceScore > 0.4 && executionMode === 'auto') {
    executionMode = 'suggest';
  }

  // Candidate slice size driven by winner's uncertainty level
  const candidateLimit = (winner as any)?.uncertaintyLevel === 'high' ? 5
    : (winner as any)?.uncertaintyLevel === 'medium'                   ? 4
    : 3;

  // ── Constitutional Arbitration ─────────────────────────────────────────────
  // Fetches graph policy rules and champion market standings in parallel,
  // then arbitrates between planner, policy, and champion to form final decision.
  const scopeKey = [input.anomalyType, lifecycleStage, winner?.trustTier ?? 'watch', winner?.policyMode ?? 'recommend_only'].join('::');

  const [activeRules, scopeMarket] = await Promise.all([
    findActiveGraphPolicyRules({ anomalyType: input.anomalyType, lifecycleStage, trustTier: winner?.trustTier ?? 'watch', policyMode: winner?.policyMode ?? 'recommend_only' }).catch(() => [] as any[]),
    ScopeActionMarket.findOne({ scopeKey }).lean().catch(() => null) as Promise<any>,
  ]);

  const topPolicyRule = (activeRules as any[]).find(r => r.targetAction && r.policyType === 'action_boost' && r.rolloutMode !== 'shadow') ?? null;
  const champStanding = (scopeMarket as any)?.actions?.find((a: any) => a.role === 'champion') ?? null;

  const arbResult = runArbitration({
    planner: {
      actionType:    winner?.actionType    ?? null,
      adjustedScore: winner?.adjustedScore ?? 0,
      confidence:    winner?.confidence    ?? 'low',
    },
    policy: topPolicyRule ? {
      actionType:  topPolicyRule.targetAction,
      ruleKey:     topPolicyRule.ruleKey,
      ruleWeight:  topPolicyRule.value ?? 0,
      rolloutMode: topPolicyRule.rolloutMode,
    } : null,
    champion: champStanding ? {
      actionType:     champStanding.actionType,
      successRate:    champStanding.winRate        ?? 0,
      lockConfidence: scopeMarket?.championLockConfidence ?? 0,
    } : null,
    operator: null,   // operator constraints wired via AnomalyActionPolicy separately
    calibrationError: confCalibration.calibrationError,
  });

  // Override winner if arbitration selected a different source
  let finalActionType = winner?.actionType ?? null;
  let arbitrationSource: string | null = null;
  if (arbResult.wasConflict && arbResult.actionType && arbResult.actionType !== winner?.actionType) {
    finalActionType    = arbResult.actionType;
    arbitrationSource  = arbResult.source;
    // Safety: any arbitration override forces suggest mode
    if (executionMode === 'auto') executionMode = 'suggest';
  }
  // Shadow test: when arbitration is uncertain, widen candidate window
  if (arbResult.shadowTestTriggered) {
    executionMode = 'suggest';
  }

  // Fire-and-forget arbitration case persistence
  persistArbitrationCase({
    tenantId:           input.tenantId,
    scopeKey,
    anomalyType:        input.anomalyType,
    lifecycleStage,
    arb:                arbResult,
    plannerIn:          { actionType: winner?.actionType ?? null, adjustedScore: winner?.adjustedScore ?? 0, confidence: winner?.confidence ?? 'low' },
    policyIn:           topPolicyRule ? { actionType: topPolicyRule.targetAction, ruleKey: topPolicyRule.ruleKey, ruleWeight: topPolicyRule.value, rolloutMode: topPolicyRule.rolloutMode } : null,
    championIn:         champStanding ? { actionType: champStanding.actionType, successRate: champStanding.winRate ?? 0, lockConfidence: scopeMarket?.championLockConfidence ?? 0 } : null,
  }).catch(() => {});

  const reason = finalActionType
    ? `${arbitrationSource ? `[${arbResult.source.toUpperCase()} WINS] ` : ''}Score ${winner?.adjustedScore ?? 0} · conflict: ${arbResult.conflictType} · margin: ${arbResult.scoreMargin} · ${strategy} strategy`
    : 'All graph candidates rejected by policy or evidence filters';


  const plan: InterventionPlan = {
    tenantId:          input.tenantId,
    anomalyType:       input.anomalyType,
    recommendedAction: finalActionType,
    strategy,
    confidence:        winner?.confidence ?? 'low',
    reason,
    executionMode,
    candidates:        candidates.slice(0, candidateLimit),
    rejected,
    supportingContext: {
      anomaly:          input.anomalyType,
      lifecycleStage,
      trustTier:        winner?.trustTier ?? 'unknown',
      runtimeState:     context.runtimeState,
      queueDepth:       context.queueDepth,
      recoveryCount24h: context.recoveryCount24h,
    },
    graphGrounded,
    builtAt: new Date(),
  };

  // ── Persist decision record (fire-and-forget) ──────────────────────────────
  persistPlannerDecision(plan, {
    runtimeState:    context.runtimeState,
    healthScore:     (context as any).healthScore ?? 50,
    queueDepth:      context.queueDepth,
    recentFailures:  (context as any).recentFailures ?? 0,
    milestoneCount:  context.milestoneCount,
    lifecyclePattern:(context as any).lifecyclePattern ?? [],
  }).catch(() => {});

  return plan;
}
