/**
 * lib/system/runStrategicSelfEvolutionCycle.ts
 *
 * Strategic Self-Evolution Engine — 7 exports.
 *
 *   assembleSelfEvolutionEvidence      gathers regret, contradiction, governance, failure signals from DB
 *   critiqueStrategicArchitecture      pure: maps evidence metrics → human-readable critique strings
 *   generateStrategicEvolutionProposals pure: maps critiques → typed proposal structs
 *   classifyEvolutionProposalSafety    pure: routes proposals to safety tier + constitutional check
 *   runConstitutionalCheck             applies SelfEvolutionConstitution gate to a proposal
 *   runStrategicEvolutionShadowExperiment simulates baseline vs proposed state
 *   runStrategicSelfEvolutionCycle     full orchestrated cycle: evidence → critique → generate →
 *                                      classify → constitutional check → shadow → persist
 *
 * GOVERNANCE RULE:
 *   low safety       → auto-shadow (no approval)
 *   medium safety    → shadow + approval_required
 *   high safety      → shadow + constitutional approval path
 *   constitutional   → blocked before shadow (constitution layer decides)
 */
import connectToDatabase from '@/lib/mongodb';
import { StrategicEvolutionProposal, StrategicEvolutionExperiment } from '@/models/system/StrategicEvolution';
import { StrategicRegretEvent } from '@/models/system/StrategicRegret';
import { StrategicDoctrineRule } from '@/models/system/StrategicDoctrine';
import { StrategicTrustProfile } from '@/models/system/StrategicInstinct';
import { runConstitutionalEvaluation } from '@/lib/governance/runSelfEvolutionConstitution';

// ── 1. Evidence assembler ─────────────────────────────────────────────────
export async function assembleSelfEvolutionEvidence(input: {
  scopeLevel: 'tenant' | 'cohort' | 'global';
  tenantId?:  string;
  cohortKey?: string;
}): Promise<{ avgRegret: number; contradictionRate: number; governanceLoad: number; harmRate: number; replayDisagreementRate: number; regretCount: number; atRiskDoctrines: number }> {
  await connectToDatabase();

  const regretQuery: any = {};
  if (input.tenantId)  regretQuery.tenantId  = input.tenantId;
  if (input.cohortKey) regretQuery.cohortKey = input.cohortKey;

  const [regretEvents, doctrineRules, trustProfiles] = await Promise.all([
    StrategicRegretEvent.find(regretQuery).sort({ createdAt: -1 }).limit(30).lean(),
    StrategicDoctrineRule.find({ status: { $in: ['shadow', 'active'] } }).lean(),
    (input.tenantId ? StrategicTrustProfile.find({ tenantId: input.tenantId }).lean() : Promise.resolve([])),
  ]);

  const re = regretEvents as any[];
  const dr = doctrineRules as any[];

  const avgRegret = re.length > 0 ? re.reduce((s: number, e: any) => s + (e.regret ?? 0), 0) / re.length : 0;
  const avgHarm   = re.length > 0 ? re.reduce((s: number, e: any) => s + (e.actualOutcomeScore < 0.4 ? 1 : 0), 0) / re.length : 0;
  const atRiskDoctrines = dr.filter(d => (d.contradictionRate ?? 0) >= 0.30 || (d.performance?.harmRate ?? 0) > 0.20).length;
  const contradictionRate = dr.length > 0 ? atRiskDoctrines / dr.length : 0;

  const tp = trustProfiles as any[];
  const governanceLoad = tp.length > 0 ? (tp[0]?.contextMultipliers?.highInstability?.liveSignals ?? 1) * 50 : 40;

  return {
    avgRegret:            +avgRegret.toFixed(4),
    contradictionRate:    +contradictionRate.toFixed(3),
    governanceLoad:       +governanceLoad.toFixed(1),
    harmRate:             +avgHarm.toFixed(3),
    replayDisagreementRate:0,   // will be populated when replay layer is available
    regretCount:          re.length,
    atRiskDoctrines,
  };
}

// ── 2. Architecture critique engine (pure) ────────────────────────────────
export function critiqueStrategicArchitecture(input: {
  avgRegret:             number;
  contradictionRate:     number;
  governanceLoad:        number;
  harmRate:              number;
  replayDisagreementRate:number;
}): string[] {
  const critiques: string[] = [];
  if (input.avgRegret > 0.12)              critiques.push('Current strategic weighting appears suboptimal — repeated regret suggests trust weights need adjustment.');
  if (input.contradictionRate > 0.25)      critiques.push('Doctrine conflict or staleness is elevated — doctrines may need merging, narrowing, or retirement.');
  if (input.governanceLoad > 70)           critiques.push('Governance friction may be too high — approval burden appears disproportionate to safety value produced.');
  if (input.harmRate > 0.20)               critiques.push('Risk controls may be too weak or too slow — harm rate suggests thresholds need tightening.');
  if (input.replayDisagreementRate > 0.30) critiques.push('Simulation and live decision logic are diverging too often — architecture connection between replay and live system needs strengthening.');
  if (input.avgRegret < 0.03 && input.contradictionRate < 0.10 && input.harmRate < 0.05) critiques.push('System metrics are within healthy bounds — no structural changes required at this time.');
  return critiques;
}

// ── 3. Proposal generator (pure) ──────────────────────────────────────────
export function generateStrategicEvolutionProposals(input: {
  critiques:  string[];
  scopeLevel: 'tenant' | 'cohort' | 'global';
  tenantId?:  string;
  cohortKey?: string;
  evidence:   { avgRegret: number; contradictionRate: number; governanceLoad: number; harmRate: number; confidence?: number };
}): any[] {
  const proposals: any[] = [];

  for (const critique of input.critiques) {
    if (critique.includes('trust weights')) {
      proposals.push({ proposalType: 'weight_evolution', targetArea: 'strategic_trust_weights', scopeLevel: input.scopeLevel, tenantId: input.tenantId ?? null, cohortKey: input.cohortKey ?? null, currentState: {}, proposedState: { action: 'rebalance', nudge: 0.05 }, rationale: critique, evidence: input.evidence });
    }
    if (critique.includes('Doctrine conflict')) {
      proposals.push({ proposalType: 'doctrine_evolution', targetArea: 'strategic_doctrine_layer', scopeLevel: input.scopeLevel, tenantId: input.tenantId ?? null, cohortKey: input.cohortKey ?? null, currentState: {}, proposedState: { action: 'review_at_risk_doctrines', contradictionThreshold: 0.30 }, rationale: critique, evidence: input.evidence });
    }
    if (critique.includes('Governance friction')) {
      proposals.push({ proposalType: 'governance_tuning', targetArea: 'approval_thresholds', scopeLevel: input.scopeLevel, tenantId: input.tenantId ?? null, cohortKey: input.cohortKey ?? null, currentState: {}, proposedState: { action: 'reduce_approval_overhead', targetLoad: 55 }, rationale: critique, evidence: input.evidence });
    }
    if (critique.includes('risk controls') || critique.includes('harm rate')) {
      proposals.push({ proposalType: 'threshold_evolution', targetArea: 'rollback_and_recovery_thresholds', scopeLevel: input.scopeLevel, tenantId: input.tenantId ?? null, cohortKey: input.cohortKey ?? null, currentState: {}, proposedState: { action: 'tighten_harm_thresholds', delta: -0.05 }, rationale: critique, evidence: input.evidence });
    }
    if (critique.includes('Simulation and live')) {
      proposals.push({ proposalType: 'architecture_connection_change', targetArea: 'replay_live_signal_bridge', scopeLevel: input.scopeLevel, tenantId: input.tenantId ?? null, cohortKey: input.cohortKey ?? null, currentState: {}, proposedState: { action: 'strengthen_replay_connection', targetDisagreementRate: 0.15 }, rationale: critique, evidence: input.evidence });
    }
  }

  return proposals;
}

// ── 4. Safety classifier (pure) ───────────────────────────────────────────
// CONSTITUTIONAL targets are hard-blocked before they reach the shadow lab.
const CONSTITUTIONAL_AREAS = ['constitutional', 'emergency', 'audit', 'operator_override', 'rollback_guarantee'];

export function classifyEvolutionProposalSafety(input: {
  proposalType: string;
  targetArea:   string;
}): 'low' | 'medium' | 'high' | 'constitutional' {
  if (CONSTITUTIONAL_AREAS.some(a => input.targetArea.toLowerCase().includes(a))) return 'constitutional';
  if (input.proposalType === 'governance_tuning')            return 'high';
  if (input.proposalType === 'architecture_connection_change')return 'high';
  if (input.proposalType === 'threshold_evolution')          return 'medium';
  if (input.proposalType === 'doctrine_evolution')           return 'medium';
  if (input.proposalType === 'weight_evolution')             return 'low';
  return 'medium';
}

// ── 5. Constitutional check wrapper ───────────────────────────────────────
export async function runConstitutionalCheck(input: {
  proposalKey: string;
  targetArea:  string;
  proposalType:string;
  magnitude:   number;
  hasShadowEvidence: boolean;
}): Promise<{ verdict: string; reason: string; blocked: boolean }> {
  // Map proposalType to a standard targetKey
  const targetKeyMap: Record<string, string> = {
    weight_evolution:             'strategic_trust_weights.liveSignals',
    doctrine_evolution:           'doctrine.confidenceWeight',
    threshold_evolution:          'transition_threshold.recovery_entry',
    governance_tuning:            'governance.approvalStrictness',
    architecture_connection_change:'autopilot.allowAutoSwitch',
  };
  const targetKey = targetKeyMap[input.proposalType] ?? `generic.${input.targetArea}`;
  try {
    const result = await runConstitutionalEvaluation({ proposalKey: input.proposalKey, targetKey, proposalType: input.proposalType, requestedChangeMagnitude: input.magnitude, hasShadowEvidence: input.hasShadowEvidence });
    return { verdict: result.verdict, reason: result.reason, blocked: result.verdict === 'block' };
  } catch {
    return { verdict: 'block', reason: 'Constitutional evaluation failed — defaulting to block.', blocked: true };
  }
}

// ── 6. Shadow experiment ───────────────────────────────────────────────────
export async function runStrategicEvolutionShadowExperiment(input: {
  proposalKey:    string;
  proposal:       any;
  baselineMetrics:{ avgROI: number; harmRate: number; governanceLoad: number; rollbackRisk: number };
}): Promise<any> {
  // Hypothetical improvement estimates per proposal type — replaced by replay engine when available
  const deltas: Record<string, { roi: number; harm: number; gov: number; rollback: number }> = {
    weight_evolution:             { roi: +0.8,  harm: -0.02, gov: -2,  rollback: -1 },
    doctrine_evolution:           { roi: +0.5,  harm: -0.03, gov: -3,  rollback: -2 },
    threshold_evolution:          { roi: +0.3,  harm: -0.04, gov: +1,  rollback: -4 },
    governance_tuning:            { roi: +0.4,  harm: +0.01, gov: -8,  rollback: +1 },
    architecture_connection_change:{ roi: +1.2, harm: -0.01, gov: -1,  rollback: -3 },
  };
  const d = deltas[input.proposal.proposalType] ?? { roi: 0, harm: 0, gov: 0, rollback: 0 };
  const sim = {
    avgROI:         +Math.max(0, input.baselineMetrics.avgROI + d.roi).toFixed(2),
    harmRate:       +Math.max(0, input.baselineMetrics.harmRate + d.harm).toFixed(3),
    governanceLoad: +Math.max(0, input.baselineMetrics.governanceLoad + d.gov).toFixed(1),
    rollbackRisk:   +Math.max(0, input.baselineMetrics.rollbackRisk + d.rollback).toFixed(2),
  };
  const rec = sim.avgROI > input.baselineMetrics.avgROI && sim.harmRate <= input.baselineMetrics.harmRate ? 'promote' : 'keep_shadow';

  const expKey = `exp::${input.proposalKey}`;
  await StrategicEvolutionExperiment.findOneAndUpdate(
    { experimentKey: expKey },
    { experimentKey: expKey, proposalKey: input.proposalKey, status: 'completed', baselineMetrics: input.baselineMetrics, simulatedMetrics: sim, comparison: { expectedGain: +(sim.avgROI - input.baselineMetrics.avgROI).toFixed(2), expectedHarm: +(sim.harmRate - input.baselineMetrics.harmRate).toFixed(3), expectedGovernanceLoadShift: +(sim.governanceLoad - input.baselineMetrics.governanceLoad).toFixed(1), expectedRollbackRiskShift: +(sim.rollbackRisk - input.baselineMetrics.rollbackRisk).toFixed(2) }, recommendation: rec },
    { upsert: true, new: true }
  );
  return { simulatedMetrics: sim, recommendation: rec };
}

// ── 7. Full self-evolution cycle ─────────────────────────────────────────
export async function runStrategicSelfEvolutionCycle(input: {
  scopeLevel: 'tenant' | 'cohort' | 'global';
  tenantId?:  string;
  cohortKey?: string;
  baselineMetrics?: { avgROI: number; harmRate: number; governanceLoad: number; rollbackRisk: number };
}): Promise<{ evidence: any; critiques: string[]; proposalsGenerated: number; blocked: number; pendingShadow: number }> {
  await connectToDatabase();

  const evidence   = await assembleSelfEvolutionEvidence(input);
  const critiques  = critiqueStrategicArchitecture(evidence);
  const rawProps   = generateStrategicEvolutionProposals({ critiques, scopeLevel: input.scopeLevel, tenantId: input.tenantId, cohortKey: input.cohortKey, evidence });

  let blocked = 0, pendingShadow = 0;

  for (const prop of rawProps) {
    const safetyClass = classifyEvolutionProposalSafety(prop);
    const proposalKey = `evol::${prop.proposalType}::${prop.targetArea}::${input.tenantId ?? input.cohortKey ?? 'global'}`;

    // Skip proposals already resolved
    const existing = await StrategicEvolutionProposal.findOne({ proposalKey }).lean() as any;
    if (existing && ['approved', 'applied', 'rejected', 'rolled_back'].includes(existing.verdict)) continue;

    // Constitutional check
    const constCheck = await runConstitutionalCheck({ proposalKey, targetArea: prop.targetArea, proposalType: prop.proposalType, magnitude: 0.10, hasShadowEvidence: false });
    if (constCheck.blocked) { blocked++; await StrategicEvolutionProposal.findOneAndUpdate({ proposalKey }, { ...prop, proposalKey, safetyClass, verdict: 'rejected', constitutionalVerdict: constCheck.verdict, constitutionalReason: constCheck.reason }, { upsert: true }); continue; }

    // Safety-based verdict
    const verdict = safetyClass === 'low' ? 'shadow' : 'approval_required';

    await StrategicEvolutionProposal.findOneAndUpdate({ proposalKey }, { ...prop, proposalKey, safetyClass, verdict, constitutionalVerdict: constCheck.verdict, constitutionalReason: constCheck.reason }, { upsert: true });

    // Run shadow experiment for all non-constitutional proposals
    if (verdict === 'shadow' || verdict === 'approval_required') {
      await runStrategicEvolutionShadowExperiment({ proposalKey, proposal: prop, baselineMetrics: input.baselineMetrics ?? { avgROI: 3.5, harmRate: 0.08, governanceLoad: 45, rollbackRisk: 12 } });
      pendingShadow++;
    }
  }

  return { evidence, critiques, proposalsGenerated: rawProps.length, blocked, pendingShadow };
}
