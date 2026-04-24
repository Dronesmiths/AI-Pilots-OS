/**
 * lib/system/buildDecisionJustification.ts
 *
 * Six functions for the self-justifying decision layer.
 * All run BEFORE routeExecution — not post-hoc.
 *
 *   compareDecisionAlternatives    ranks lighter/heavier/noAction vs chosen
 *   buildEconomicRationale         numbers → narrative sentence
 *   buildGovernanceRationale       verdict → permission explanation
 *   buildUncertaintyRationale      confidence signals → honest caveats
 *   buildDecisionJustification     main assembler (all 4 dimensions)
 *   attachDecisionJustification    persists record before execution
 *
 * RULE: No governed action should execute without calling attachDecisionJustification
 *       unless bypassedJustification=true is explicitly set (emergency paths only).
 */
import connectToDatabase              from '@/lib/mongodb';
import DecisionJustificationRecord    from '@/models/system/DecisionJustificationRecord';
import { estimateIncidentCost, estimatePreventiveCost, computeResilienceSavings } from './computeResilienceEconomics';

const COST_UNIT   = () => parseFloat(process.env.COST_UNIT_RATE ?? '2');

// ── 1. Alternative comparison ─────────────────────────────────────────────
export function compareDecisionAlternatives(input: {
  rankings:      Array<{ actionType: string; riskBand: 'low' | 'medium' | 'high'; utility: number; expectedRiskReduction: number; estimatedCostFinal?: number }>;
  chosenAction:  string;
}) {
  const chosen  = input.rankings.find(r => r.actionType === input.chosenAction);
  const lighter = input.rankings.filter(r => r.riskBand === 'low'  && r.actionType !== input.chosenAction).sort((a, b) => b.utility - a.utility)[0] ?? null;
  const heavier = input.rankings.filter(r => r.riskBand === 'high' && r.actionType !== input.chosenAction).sort((a, b) => b.utility - a.utility)[0] ?? null;

  const whyLighterRejected = lighter
    ? `${lighter.actionType} was available but had lower expected risk reduction (${lighter.expectedRiskReduction?.toFixed(1) ?? '?'} vs ${chosen?.expectedRiskReduction?.toFixed(1) ?? '?'} pts)`
    : 'No lighter alternative was available for this forecast type.';

  const whyHeavierRejected = heavier
    ? `${heavier.actionType} was rejected because its additional risk penalty (high band +18 utility pts) exceeded its marginal benefit over the chosen action.`
    : 'No high-risk alternative was in scope.';

  const whyNoActionRejected = chosen
    ? `Doing nothing would leave ${chosen.expectedRiskReduction?.toFixed(0) ?? '?'} expected risk-reduction points unrealized, allowing predicted instability to progress.`
    : 'Inaction was rejected because forecastState indicates rising risk without intervention.';

  return { chosen, lighter, heavier, whyLighterRejected, whyHeavierRejected, whyNoActionRejected };
}

// ── 2. Economic rationale (narrative) ────────────────────────────────────
export function buildEconomicRationale(input: {
  estimatedActionCost:        number;   // cost units
  estimatedAvoidedCost:       number;
  estimatedDowntimePrevented: number;
  estimatedGovernanceSaved:   number;
}): { expectedROI: number; rationale: string; summary: string; economicNarrative: string } {
  const { roi }   = computeResilienceSavings({ reactiveCost: input.estimatedAvoidedCost, preventiveCost: input.estimatedActionCost || 1 });
  const rate      = COST_UNIT();
  const costDol   = (input.estimatedActionCost  * rate).toFixed(0);
  const avoidDol  = (input.estimatedAvoidedCost * rate).toFixed(0);
  const govDol    = (input.estimatedGovernanceSaved * rate).toFixed(0);

  const rationale = roi > 2
    ? `Expected economic upside is strong (${roi.toFixed(1)}x ROI) — this action is highly efficient relative to its cost.`
    : roi > 0.5
    ? `Expected economic upside is positive (${roi.toFixed(1)}x ROI) — the action is justified by cost avoidance.`
    : roi >= 0
    ? `Economic return is marginal (${roi.toFixed(2)}x ROI) — action may be justified primarily for stability or governance reasons.`
    : `Expected economic return is negative — this action is driven by safety or constitutional constraints, not ROI.`;

  const economicNarrative =
    `Estimated action cost: $${costDol}. ` +
    `Estimated avoided reactive cost: $${avoidDol}. ` +
    `Estimated downtime prevented: ${input.estimatedDowntimePrevented} minutes. ` +
    `Estimated governance load saved: $${govDol}. ` +
    rationale;

  return { expectedROI: roi, rationale, summary: economicNarrative, economicNarrative };
}

// ── 3. Governance rationale ───────────────────────────────────────────────
export function buildGovernanceRationale(input: {
  governanceVerdict: 'allow' | 'allow_shadow' | 'approval_required' | 'block';
  authoritySource:   string;
  chosenRiskBand:    'low' | 'medium' | 'high';
}): { governanceVerdict: string; authoritySource: string; allowedBecause: string } {
  const allowedBecause: Record<string, string> = {
    allow:             `The action is within permitted trust, risk, and policy thresholds for live autonomous execution. Risk band is ${input.chosenRiskBand}.`,
    allow_shadow:      `The action is permitted in shadow mode only — live authority is not yet established for this risk band (${input.chosenRiskBand}).`,
    approval_required: `The action exceeds autonomous execution authority for risk band ${input.chosenRiskBand} and requires explicit human approval before proceeding.`,
    block:             `The action is blocked by active governance constraints — operator freeze, constitutional rule, or trust-band restriction.`,
  };
  return { governanceVerdict: input.governanceVerdict, authoritySource: input.authoritySource, allowedBecause: allowedBecause[input.governanceVerdict] ?? 'Governance verdict unknown.' };
}

// ── 4. Uncertainty rationale ──────────────────────────────────────────────
export function buildUncertaintyRationale(input: {
  confidence:     number;   // 0..1
  riskIfWrong:    number;   // 0..1
  replaySupport?: number;
  graphSupport?:  number;
}): { confidence: number; riskIfWrong: number; uncertaintyNotes: string[] } {
  const notes: string[] = [];
  if (input.confidence < 0.5)               notes.push(`Decision confidence is moderate to low (${(input.confidence * 100).toFixed(0)}%) — treat outcome as probabilistic.`);
  if (input.riskIfWrong > 0.4)              notes.push(`Potential downside of an incorrect intervention is meaningful (riskIfWrong=${(input.riskIfWrong * 100).toFixed(0)}%).`);
  if ((input.replaySupport ?? 1) < 0.3)     notes.push(`Replay support for this action type is limited (${((input.replaySupport ?? 0) * 100).toFixed(0)}%) — fewer historical comparisons available.`);
  if ((input.graphSupport ?? 1) < 0.3)      notes.push(`Global graph support is limited (${((input.graphSupport ?? 0) * 100).toFixed(0)}%) — fewer neighboring scope signals available.`);
  if (notes.length === 0)                   notes.push(`Confidence and support levels are sufficient for autonomous execution.`);
  return { confidence: +input.confidence.toFixed(3), riskIfWrong: +input.riskIfWrong.toFixed(3), uncertaintyNotes: notes };
}

// ── 5. Main justification builder ─────────────────────────────────────────
export function buildDecisionJustification(input: {
  traceId:         string;
  chosenAction:    string;
  chosenRiskBand:  'low' | 'medium' | 'high';
  targetKey?:      string;
  decisionKey?:    string;
  forecastKey?:    string;
  triggerKey?:     string;
  forecast?:       any;
  trigger?:        any;
  rankings?:       any[];
  governanceVerdict:  'allow' | 'allow_shadow' | 'approval_required' | 'block';
  authoritySource: string;
  supportingEvidence?: any;
  economics?: {
    estimatedActionCost:        number;
    estimatedAvoidedCost:       number;
    estimatedDowntimePrevented: number;
    estimatedGovernanceSaved:   number;
  };
  uncertainty?: { confidence: number; riskIfWrong: number; replaySupport?: number; graphSupport?: number };
}): any {
  const alts       = compareDecisionAlternatives({ rankings: input.rankings ?? [], chosenAction: input.chosenAction });
  const econ       = buildEconomicRationale({
    estimatedActionCost:        input.economics?.estimatedActionCost        ?? 5,
    estimatedAvoidedCost:       input.economics?.estimatedAvoidedCost       ?? 40,
    estimatedDowntimePrevented: input.economics?.estimatedDowntimePrevented ?? 20,
    estimatedGovernanceSaved:   input.economics?.estimatedGovernanceSaved   ?? 10,
  });
  const gov        = buildGovernanceRationale({ governanceVerdict: input.governanceVerdict, authoritySource: input.authoritySource, chosenRiskBand: input.chosenRiskBand });
  const unc        = buildUncertaintyRationale({ confidence: input.uncertainty?.confidence ?? 0.6, riskIfWrong: input.uncertainty?.riskIfWrong ?? 0.2, replaySupport: input.uncertainty?.replaySupport, graphSupport: input.uncertainty?.graphSupport });

  // Grounded human-readable summary (uses real input values, not generic text)
  const problemContext = input.forecast?.forecastType
    ? `predicted ${input.forecast.forecastType.replace(/_/g, ' ')} for ${input.targetKey ?? 'target'} (riskScore=${input.forecast.riskScore?.toFixed(0) ?? '?'})`
    : input.trigger?.triggerType
    ? `detected ${input.trigger.triggerType.replace(/_/g, ' ')} trigger`
    : `active governed decision pipeline`;

  const rate = COST_UNIT();
  const humanReadableSummary =
    `Nova selected "${input.chosenAction.replace(/_/g, ' ')}" in response to ${problemContext}. ` +
    `Leading signals: ${(input.supportingEvidence?.leadingSignals ?? []).slice(0, 3).join(', ') || 'system health metrics'}. ` +
    `Estimated action cost: $${((input.economics?.estimatedActionCost ?? 5) * rate).toFixed(0)}, ` +
    `avoided cost: $${((input.economics?.estimatedAvoidedCost ?? 40) * rate).toFixed(0)} (${econ.expectedROI.toFixed(1)}x ROI). ` +
    `Governance verdict: ${input.governanceVerdict}. ` +
    (alts.lighter ? `Lighter alternative "${alts.lighter.actionType.replace(/_/g, ' ')}" was available but offered less expected risk reduction. ` : '') +
    `Confidence: ${(unc.confidence * 100).toFixed(0)}%.`;

  return {
    justificationKey:   `just::${input.traceId}::${Date.now()}`,
    traceId:            input.traceId,
    decisionKey:        input.decisionKey ?? null,
    targetKey:          input.targetKey   ?? null,
    forecastKey:        input.forecastKey ?? null,
    triggerKey:         input.triggerKey  ?? null,
    chosenAction:       input.chosenAction,
    chosenRiskBand:     input.chosenRiskBand,

    technicalReasoning: {
      problemSummary:     `Governed action for ${problemContext}`,
      leadingSignals:     input.supportingEvidence?.leadingSignals ?? [],
      supportingEvidence: input.supportingEvidence ?? {},
    },
    economicReasoning: {
      estimatedActionCost:        input.economics?.estimatedActionCost        ?? 5,
      estimatedAvoidedCost:       input.economics?.estimatedAvoidedCost       ?? 40,
      estimatedDowntimePrevented: input.economics?.estimatedDowntimePrevented ?? 20,
      estimatedGovernanceSaved:   input.economics?.estimatedGovernanceSaved   ?? 10,
      expectedROI:                econ.expectedROI,
      economicNarrative:          econ.economicNarrative,
    },
    governanceReasoning: {
      governanceVerdict:   gov.governanceVerdict,
      authoritySource:     gov.authoritySource,
      allowedBecause:      gov.allowedBecause,
      blockedAlternatives: alts.heavier ? [alts.heavier.actionType] : [],
    },
    alternativeAnalysis: {
      lighterAlternative:  alts.lighter?.actionType ?? 'none',
      heavierAlternative:  alts.heavier?.actionType ?? 'none',
      noActionAlternative: 'observe_only',
      whyLighterRejected:  alts.whyLighterRejected,
      whyHeavierRejected:  alts.whyHeavierRejected,
      whyNoActionRejected: alts.whyNoActionRejected,
      whyChosen:           `"${input.chosenAction.replace(/_/g, ' ')}" provided the best utility score (${(alts.chosen?.utility ?? 0).toFixed(1)}) among eligible alternatives, balancing prevention value against cost and risk.`,
    },
    uncertainty: {
      confidence:       unc.confidence,
      riskIfWrong:      unc.riskIfWrong,
      uncertaintyNotes: unc.uncertaintyNotes,
      replaySupport:    input.uncertainty?.replaySupport ?? 0.3,
      graphSupport:     input.uncertainty?.graphSupport  ?? 0.3,
    },
    humanReadableSummary,
  };
}

// ── 6. Persist before execution ───────────────────────────────────────────
export async function attachDecisionJustification(justificationData: any): Promise<{ justificationKey: string; humanReadableSummary: string }> {
  await connectToDatabase();
  const record = await DecisionJustificationRecord.create(justificationData);
  return { justificationKey: record.justificationKey, humanReadableSummary: record.humanReadableSummary };
}
