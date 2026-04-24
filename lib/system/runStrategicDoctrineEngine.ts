/**
 * lib/system/runStrategicDoctrineEngine.ts
 *
 * Strategic Doctrine Engine — 8 exports.
 *
 *   extractStrategicDoctrineCandidates  mines all 5 doctrine classes from evidence sources
 *   evaluateStrategicDoctrinePromotion  scores candidates → verdict + rationale
 *   applyStrategicDoctrine             injects doctrine into autopilot/blend/governance context
 *   evaluateDoctrineContradiction       contradiction rate → doctrineAtRisk flag
 *   evaluateStrategicDoctrineRollback   rollback score → shouldRollback flag
 *   recallActiveDoctrine               finds best-matching active rules for current conditions
 *   runStrategicDoctrineCycle          full orchestrator: extract → promote → persist → rollback
 *
 * DOCTRINE CLASSES (5):
 *   mode_doctrine          : prefer a specific mode under certain conditions
 *   transition_doctrine    : constraints on mode switches (friction, order)
 *   evidence_trust_doctrine: bias trust weights for specific sources under conditions
 *   governance_doctrine    : approval strictness + shadow requirements
 *   economic_doctrine      : bias optimizer toward lighter or higher-ROI actions
 *
 * DESIGN RULE: Doctrine guides strategy — it does NOT hard-code it.
 *              Doctrine yields to: constitutional safety, live critical signals, operator override.
 */
import connectToDatabase              from '@/lib/mongodb';
import { StrategicDoctrineCandidate, StrategicDoctrineRule } from '@/models/system/StrategicDoctrine';
import { conditionBand }              from './runStrategicMemoryEngine';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, +n.toFixed(4)));

// ── 1. Extraction engine — mines all 5 doctrine classes ───────────────────
export function extractStrategicDoctrineCandidates(input: {
  memories:      any[];  // StrategicMemoryRecord[]
  trustProfiles: any[];  // StrategicTrustProfile[]
  regretEvents?: any[];  // StrategicRegretEvent[]
}): any[] {
  const candidates: any[] = [];

  for (const memory of input.memories) {
    const ctx = memory.triggerContext ?? {};
    const pat = memory.posturePattern ?? {};
    const out = memory.outcomes ?? {};

    // ── Mode doctrine: recurring pressure-conditioned success ──────────────
    if (memory.memoryType === 'pressure_conditioned_pattern' && (memory.confidence ?? 0) >= 0.65 && (memory.supportCount ?? 0) >= 6) {
      candidates.push({
        candidateKey:    `cand::mode::${memory.memoryKey}`,
        doctrineType:    'mode_doctrine',
        scopeLevel:      memory.scopeLevel ?? 'cohort',
        tenantId:        memory.tenantId  ?? null,
        cohortKey:       memory.cohortKey ?? null,
        conditionSelector: ctx,
        proposedDoctrine: {
          title:     `Prefer ${pat.winningMode?.replace(/_/g, '-')} under ${ctx.instabilityBand ?? '*'} instability + ${ctx.forecastPressureBand ?? '*'} forecast`,
          statement: `When conditions match this pattern, ${pat.winningMode?.replace(/_/g, '-')} historically outperforms alternatives with ${(memory.confidence * 100).toFixed(0)}% confidence across ${memory.supportCount} episodes.`,
          payload:   { preferredMode: pat.winningMode, conditionMatch: ctx },
        },
        evidence:   { supportCount: memory.supportCount, avgROI: out.avgROI ?? 0, avgStabilityGain: out.avgStabilityGain ?? 0, avgHarmRate: out.avgHarmRate ?? 0, avgRollbackRate: out.avgRollbackRate ?? 0, contradictionRate: 0, confidence: memory.confidence ?? 0 },
        sourceMemoryKey: memory.memoryKey,
      });
    }

    // ── Transition doctrine: recurring transition success/failure ──────────
    if (memory.memoryType === 'transition_pattern' && (memory.confidence ?? 0) >= 0.60 && (memory.supportCount ?? 0) >= 5) {
      const isFailure = memory.memoryType === 'failure_pattern' || (out.avgHarmRate ?? 0) > 0.15;
      candidates.push({
        candidateKey:    `cand::trans::${memory.memoryKey}`,
        doctrineType:    'transition_doctrine',
        scopeLevel:      memory.scopeLevel ?? 'cohort',
        tenantId:        memory.tenantId  ?? null,
        cohortKey:       memory.cohortKey ?? null,
        conditionSelector: ctx,
        proposedDoctrine: {
          title:     isFailure ? `Avoid ${pat.fromMode?.replace(/_/g, '-')} → ${pat.toMode?.replace(/_/g, '-')} direct switch` : `Prefer ${pat.fromMode?.replace(/_/g, '-')} → ${pat.toMode?.replace(/_/g, '-')} transition in these conditions`,
          statement: isFailure
            ? `Direct switch from ${pat.fromMode} to ${pat.toMode} has produced elevated harm (${((out.avgHarmRate ?? 0) * 100).toFixed(0)}% avg) across ${memory.supportCount} instances. Require an intermediate step.`
            : `Transition from ${pat.fromMode} to ${pat.toMode} succeeds in these conditions with ${(memory.confidence * 100).toFixed(0)}% confidence.`,
          payload:   { fromMode: pat.fromMode, toMode: pat.toMode, requiresIntermediate: isFailure, suggestedIntermediate: isFailure ? 'balanced' : null },
        },
        evidence: { supportCount: memory.supportCount, avgROI: out.avgROI ?? 0, avgStabilityGain: out.avgStabilityGain ?? 0, avgHarmRate: out.avgHarmRate ?? 0, avgRollbackRate: out.avgRollbackRate ?? 0, contradictionRate: 0, confidence: memory.confidence ?? 0 },
        sourceMemoryKey: memory.memoryKey,
      });
    }

    // ── Economic doctrine: high-ROI mode for specific cohort ──────────────
    if (memory.memoryType === 'economic_pattern' && (memory.confidence ?? 0) >= 0.70 && (out.avgROI ?? 0) > 3) {
      candidates.push({
        candidateKey:    `cand::econ::${memory.memoryKey}`,
        doctrineType:    'economic_doctrine',
        scopeLevel:      memory.scopeLevel ?? 'cohort',
        tenantId:        memory.tenantId  ?? null,
        cohortKey:       memory.cohortKey ?? null,
        conditionSelector: ctx,
        proposedDoctrine: {
          title:     `High-ROI posture: ${pat.winningMode?.replace(/_/g, '-')} (avg ROI ${(out.avgROI ?? 0).toFixed(1)}x)`,
          statement: `${pat.winningMode?.replace(/_/g, '-')} consistently produces ${(out.avgROI ?? 0).toFixed(1)}x ROI in this cohort under these conditions. Bias strategy toward modes that prioritize prevention efficiency.`,
          payload:   { preferredMode: pat.winningMode, minExpectedROI: out.avgROI },
        },
        evidence: { supportCount: memory.supportCount, avgROI: out.avgROI ?? 0, avgStabilityGain: out.avgStabilityGain ?? 0, avgHarmRate: out.avgHarmRate ?? 0, avgRollbackRate: out.avgRollbackRate ?? 0, contradictionRate: 0, confidence: memory.confidence ?? 0 },
        sourceMemoryKey: memory.memoryKey,
      });
    }
  }

  // ── Evidence-trust doctrine: from trust profile asymmetries ───────────
  for (const profile of input.trustProfiles) {
    const rel = profile.reliabilityScores ?? {};
    for (const [src, score] of Object.entries(rel)) {
      const s = Number(score);
      if (s >= 0.80 && (profile.supportCount ?? 0) >= 10) {
        candidates.push({
          candidateKey:    `cand::trust::${profile.profileKey}::${src}`,
          doctrineType:    'evidence_trust_doctrine',
          scopeLevel:      profile.scopeLevel ?? 'tenant',
          tenantId:        profile.tenantId ?? null,
          cohortKey:       profile.cohortKey ?? null,
          conditionSelector: { instabilityBand: '*', forecastPressureBand: '*', governanceLoadBand: '*', harmRateBand: '*', volatilityBand: '*' },
          proposedDoctrine: {
            title:     `Increase trust weight for ${src.replace(/([A-Z])/g, ' $1').trim()} (reliability ${(s * 100).toFixed(0)}%)`,
            statement: `${src.replace(/([A-Z])/g, ' $1').trim()} has shown ${(s * 100).toFixed(0)}% reliability across ${profile.supportCount} episodes. Doctrine: bias strategic blend toward this source.`,
            payload:   { boostSource: src, reliabilityScore: s, suggestedWeightIncrease: +(Math.min(0.10, (s - 0.70) * 0.40)).toFixed(3) },
          },
          evidence: { supportCount: profile.supportCount ?? 0, avgROI: 0, avgStabilityGain: s, avgHarmRate: 0, avgRollbackRate: 0, contradictionRate: 0, confidence: s },
          sourceTrustKey: profile.profileKey,
        });
      }
    }
  }

  // ── Governance doctrine: from regret events clustered on high-governance ─
  const regretEvents = input.regretEvents ?? [];
  const govRegretEps = regretEvents.filter(e => e.contextBands?.governanceLoadBand === 'high' && e.severity !== 'low');
  if (govRegretEps.length >= 4) {
    const avgRegret = govRegretEps.reduce((s: number, e: any) => s + (e.regret ?? 0), 0) / govRegretEps.length;
    candidates.push({
      candidateKey:    `cand::gov::high-governance-regret`,
      doctrineType:    'governance_doctrine',
      scopeLevel:      'cohort',
      tenantId:        null,
      cohortKey:       regretEvents[0]?.cohortKey ?? null,
      conditionSelector: { instabilityBand: '*', forecastPressureBand: '*', governanceLoadBand: 'high', harmRateBand: '*', volatilityBand: '*' },
      proposedDoctrine: {
        title:     'Require approval for posture shifts during high-governance conditions',
        statement: `During high governance load, posture shifts have repeatedly produced regret (avg ${(avgRegret * 100).toFixed(0)}%). Doctrine: require operator approval before non-conservative mode shifts.`,
        payload:   { requiresApproval: true, restrictedModes: ['aggressive'], approvalScope: 'high_governance_conditions' },
      },
      evidence: { supportCount: govRegretEps.length, avgROI: 0, avgStabilityGain: 0, avgHarmRate: 0.15, avgRollbackRate: 0, contradictionRate: 0, confidence: Math.min(0.75, govRegretEps.length / 10) },
    });
  }

  return candidates;
}

// ── 2. Promotion evaluator ─────────────────────────────────────────────────
export function evaluateStrategicDoctrinePromotion(input: {
  supportCount:     number;
  confidence:       number;
  avgROI:           number;
  avgStabilityGain: number;
  avgHarmRate:      number;
  avgRollbackRate:  number;
  contradictionRate:number;
}): { verdict: 'approved' | 'approval_required' | 'rejected'; rolloutMode: 'shadow' | 'limited'; promotionScore: number; rationale: string } {
  let score = 0;
  score += input.supportCount >= 12 ? 20 : input.supportCount >= 6 ? 10 : 0;
  score += clamp(input.confidence, 0, 1)          * 25;
  score += clamp(input.avgROI / 10, 0, 1)         * 20;
  score += clamp(input.avgStabilityGain, 0, 1)    * 20;
  score -= clamp(input.avgHarmRate, 0, 1)         * 35;
  score -= clamp(input.avgRollbackRate, 0, 1)     * 30;
  score -= clamp(input.contradictionRate, 0, 1)   * 25;

  const s = +score.toFixed(2);
  if (s >= 48) return { verdict: 'approved',          rolloutMode: 'shadow',  promotionScore: s, rationale: 'Strategic pattern is strong enough for governed doctrine rollout in shadow mode.' };
  if (s >= 30) return { verdict: 'approval_required', rolloutMode: 'shadow',  promotionScore: s, rationale: 'Doctrine is promising but evidence needs review before promotion to active.' };
  return          { verdict: 'rejected',              rolloutMode: 'shadow',  promotionScore: s, rationale: 'Strategic pattern is not yet durable enough for doctrine status.' };
}

// ── 3. Doctrine application hook ──────────────────────────────────────────
export function applyStrategicDoctrine(input: {
  doctrine:  { doctrineType: string; doctrine?: any; payload?: any };
  current:   any;
}): any {
  const payload = input.doctrine.doctrine?.payload ?? input.doctrine.payload ?? {};
  switch (input.doctrine.doctrineType) {
    case 'mode_doctrine':
      return { ...input.current, doctrinePreferredMode: payload.preferredMode ?? null };
    case 'evidence_trust_doctrine':
      return { ...input.current, trustBias: payload };
    case 'governance_doctrine':
      return { ...input.current, requiresApproval: payload.requiresApproval ?? false, restrictedModes: payload.restrictedModes ?? [] };
    case 'transition_doctrine':
      return { ...input.current, transitionConstraint: payload };
    case 'economic_doctrine':
      return { ...input.current, economicBias: { preferredMode: payload.preferredMode, minROI: payload.minExpectedROI } };
    default:
      return input.current;
  }
}

// ── 4. Contradiction tracker ──────────────────────────────────────────────
export function evaluateDoctrineContradiction(input: {
  contradictionEvents:   number;
  totalMatchedEpisodes:  number;
}): { contradictionRate: number; doctrineAtRisk: boolean } {
  const rate = input.totalMatchedEpisodes > 0 ? clamp(input.contradictionEvents / input.totalMatchedEpisodes, 0, 1) : 0;
  return { contradictionRate: +rate.toFixed(3), doctrineAtRisk: rate >= 0.30 };
}

// ── 5. Rollback evaluator ─────────────────────────────────────────────────
export function evaluateStrategicDoctrineRollback(input: {
  sampleCount:       number;
  hitRate:           number;
  harmRate:          number;
  contradictionRate: number;
  cohortDriftScore:  number;
}): { rollbackScore: number; shouldRollback: boolean; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (input.sampleCount >= 8 && input.hitRate < 0.45) { score += 18; reasons.push(`low hit rate (${(input.hitRate * 100).toFixed(0)}%)`); }
  if (input.harmRate > 0.20)                           { score += 28; reasons.push(`high harm rate (${(input.harmRate * 100).toFixed(0)}%)`); }
  if (input.contradictionRate > 0.30)                  { score += 22; reasons.push(`high contradiction rate (${(input.contradictionRate * 100).toFixed(0)}%)`); }
  if (input.cohortDriftScore > 0.50)                   { score += 18; reasons.push('cohort drift exceeds threshold'); }
  return { rollbackScore: score, shouldRollback: score >= 35, reasons };
}

// ── 6. Active doctrine recall ─────────────────────────────────────────────
export async function recallActiveDoctrine(input: {
  tenantId?:          string;
  cohortKey?:         string;
  instabilityScore?:  number;
  forecastPressure?:  number;
  governanceLoad?:    number;
  doctrineType?:      string;
}): Promise<any[]> {
  await connectToDatabase();
  const instBand = conditionBand(input.instabilityScore ?? 0);
  const fpBand   = conditionBand(input.forecastPressure ?? 0);
  const govBand  = conditionBand(input.governanceLoad   ?? 0);

  const query: any = { status: { $in: ['shadow', 'active'] } };
  if (input.doctrineType)  query.doctrineType = input.doctrineType;
  if (input.tenantId)      query.$or = [{ tenantId: input.tenantId }, { scopeLevel: { $in: ['cohort', 'global'] } }];
  else if (input.cohortKey)query.$or = [{ cohortKey: input.cohortKey }, { scopeLevel: 'global' }];

  const rules = await StrategicDoctrineRule.find(query).sort({ rolloutMode: 1 }).lean() as any[];

  // Score each rule by how well conditions match
  return rules
    .map(r => {
      const ctx = r.conditionSelector ?? {};
      let match = 0;
      if (ctx.instabilityBand      === instBand || ctx.instabilityBand      === '*') match += 0.30;
      if (ctx.forecastPressureBand === fpBand   || ctx.forecastPressureBand === '*') match += 0.25;
      if (ctx.governanceLoadBand   === govBand  || ctx.governanceLoadBand   === '*') match += 0.20;
      if (r.tenantId && r.tenantId === input.tenantId)   match += 0.25;
      else if (r.cohortKey && r.cohortKey === input.cohortKey) match += 0.15;
      return { ...r, matchScore: +match.toFixed(3) };
    })
    .filter(r => r.matchScore >= 0.25)
    .sort((a, b) => b.matchScore - a.matchScore);
}

// ── 7. Full doctrine cycle ─────────────────────────────────────────────────
export async function runStrategicDoctrineCycle(input: {
  memories:      any[];
  trustProfiles: any[];
  regretEvents?: any[];
  forcePromotion?:boolean;
}): Promise<{ candidatesCreated: number; updatedToApproved: number; rolled_back: number; activeRules: number }> {
  await connectToDatabase();

  const candidates = extractStrategicDoctrineCandidates(input);
  let candidatesCreated = 0, updatedToApproved = 0, rolledBack = 0;

  for (const cand of candidates) {
    const promo = evaluateStrategicDoctrinePromotion(cand.evidence);
    const verdict = input.forcePromotion && promo.verdict === 'approval_required' ? 'approved' : promo.verdict;

    await StrategicDoctrineCandidate.findOneAndUpdate(
      { candidateKey: cand.candidateKey },
      { ...cand, promotionScore: promo.promotionScore, verdict, rationale: promo.rationale },
      { upsert: true, new: true }
    );
    candidatesCreated++;

    // Auto-create shadow rule for approved candidates
    if (verdict === 'approved') {
      const ruleKey = `rule::${cand.candidateKey}`;
      const existing = await StrategicDoctrineRule.findOne({ ruleKey }).lean();
      if (!existing) {
        await StrategicDoctrineRule.create({
          ruleKey,
          candidateKey:      cand.candidateKey,
          doctrineType:      cand.doctrineType,
          scopeLevel:        cand.scopeLevel,
          tenantId:          cand.tenantId,
          cohortKey:         cand.cohortKey,
          conditionSelector: cand.conditionSelector,
          doctrine:          cand.proposedDoctrine,
          rolloutMode:       'shadow',
          trustGate:         { minTrustTier: 'high', approvalRequired: cand.doctrineType === 'governance_doctrine' },
          status:            'shadow',
        });
      } else {
        updatedToApproved++;
      }
    }
  }

  // Rollback evaluation on active rules
  const activeRules = await StrategicDoctrineRule.find({ status: { $in: ['shadow', 'active'] } }).lean() as any[];
  for (const rule of activeRules) {
    const rb = evaluateStrategicDoctrineRollback({ sampleCount: rule.performance?.sampleCount ?? 0, hitRate: rule.performance?.hitRate ?? 1, harmRate: rule.performance?.harmRate ?? 0, contradictionRate: rule.contradictionRate ?? 0, cohortDriftScore: rule.cohortDriftScore ?? 0 });
    if (rb.shouldRollback) {
      await StrategicDoctrineRule.findOneAndUpdate({ ruleKey: rule.ruleKey }, { status: 'rolled_back', rollbackScore: rb.rollbackScore });
      rolledBack++;
    }
  }

  return { candidatesCreated, updatedToApproved, rolled_back: rolledBack, activeRules: activeRules.length };
}
