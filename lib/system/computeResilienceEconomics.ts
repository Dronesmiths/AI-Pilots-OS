/**
 * lib/system/computeResilienceEconomics.ts
 *
 * Six economic computation functions + event generator for the resilience economics layer.
 *
 * Cost unit: 1 unit ≈ 1 minute of engineering time ($2 at default COST_UNIT_RATE=2)
 * All dollar conversions happen at the API or UI layer — never in the engine.
 *
 *   estimateIncidentCost               reactive incident baseline estimate
 *   estimatePreventiveCost             what the prevention actually cost
 *   computeResilienceSavings           savings + ROI
 *   computeGovernanceSavings           approvals + arbitrations avoided
 *   computeDowntimePrevented           actual vs predicted downtime delta
 *   generateResilienceEconomicEvent    links to existing system records
 *   generateDailyResilienceSummary     aggregate events into period summary
 */
import connectToDatabase              from '@/lib/mongodb';
import AutonomousResponseExecution    from '@/models/system/AutonomousResponseExecution';
import AutonomousResponsePlaybookRun  from '@/models/system/AutonomousResponsePlaybookRun';
import { RecoveryCampaign }           from '@/models/system/RecoveryCampaign';
import { PreventiveInterventionDecision } from '@/models/system/PreventiveIntervention';
import { ResilienceEconomicEvent, ResilienceEconomicSummary, ResilienceComparison } from '@/models/system/ResilienceEconomics';

// ── 1. Incident cost estimate ─────────────────────────────────────────────
export function estimateIncidentCost(input: {
  scopesAffected:    number;
  durationMinutes:   number;
  governanceActions: number;
}): number {
  return +(
    input.scopesAffected    * 120 +  // broad scope degradation is expensive
    input.durationMinutes   * 2   +  // each minute of degradation = 2 units
    input.governanceActions * 15     // each governance event = 15 units
  ).toFixed(2);
}

// ── 2. Preventive action cost ─────────────────────────────────────────────
export function estimatePreventiveCost(input: {
  computeCost:      number;
  governanceLoad:   number;
  disruptionCost:   number;
}): number {
  return +(input.computeCost + input.governanceLoad * 10 + input.disruptionCost).toFixed(2);
}

// ── 3. Savings + ROI ──────────────────────────────────────────────────────
export function computeResilienceSavings(input: {
  reactiveCost:  number;
  preventiveCost: number;
}): { savings: number; roi: number } {
  const savings = input.reactiveCost - input.preventiveCost;
  const roi     = input.preventiveCost > 0 ? savings / input.preventiveCost : 0;
  return { savings: +savings.toFixed(2), roi: +roi.toFixed(2) };
}

// ── 4. Governance savings ─────────────────────────────────────────────────
export function computeGovernanceSavings(input: {
  approvalsAvoided:    number;
  arbitrationsAvoided: number;
}): number {
  return +(input.approvalsAvoided * 20 + input.arbitrationsAvoided * 10).toFixed(2);
}

// ── 5. Downtime prevented ─────────────────────────────────────────────────
export function computeDowntimePrevented(input: {
  predictedDowntime: number;
  actualDowntime:    number;
}): number {
  return Math.max(0, input.predictedDowntime - input.actualDowntime);
}

// ── 6. Event generator ────────────────────────────────────────────────────
const todayPeriod = () => `daily::${new Date().toISOString().slice(0, 10)}`;

export async function generateResilienceEconomicEvent(input: {
  sourceType: 'preventive_decision' | 'playbook_run' | 'campaign' | 'forecast';
  sourceKey:  string;
  targetKey:  string;
}): Promise<any> {
  await connectToDatabase();

  const eventKey = `${input.sourceType}::${input.sourceKey}::econ`;

  // Idempotent — skip if already generated
  const existing = await ResilienceEconomicEvent.findOne({ eventKey }).lean();
  if (existing) return existing;

  let baselineCost = 0, actualCost = 0, governanceActions = 0, governanceSaved = 0;
  let downtimeMinutes = 0, downtimePrevented = 0, incidentType: string | null = null;
  let confidence = 0.6;

  if (input.sourceType === 'preventive_decision') {
    const decision = await PreventiveInterventionDecision.findOne({ decisionKey: input.sourceKey }).lean() as any;
    if (decision) {
      actualCost     = decision.optimizerSummary?.expectedCost ?? 5;
      baselineCost   = estimateIncidentCost({ scopesAffected: 3, durationMinutes: 60, governanceActions: 8 });
      governanceSaved= computeGovernanceSavings({ approvalsAvoided: 3, arbitrationsAvoided: 5 });
      downtimePrevented = 30;
      incidentType   = decision.forecastType;
      confidence     = decision.optimizerSummary?.confidence ?? 0.6;
    }
  }

  if (input.sourceType === 'campaign') {
    const campaign = await RecoveryCampaign.findOne({ campaignKey: input.sourceKey }).lean() as any;
    if (campaign) {
      const scopeCount = campaign.affectedScopes?.length ?? 1;
      actualCost       = estimatePreventiveCost({ computeCost: scopeCount * 3, governanceLoad: scopeCount * 2, disruptionCost: scopeCount });
      baselineCost     = estimateIncidentCost({ scopesAffected: scopeCount, durationMinutes: scopeCount * 20, governanceActions: scopeCount * 4 });
      downtimeMinutes  = scopeCount * 20;
      downtimePrevented= campaign.status === 'resolved' ? downtimeMinutes * 0.7 : 0;
      incidentType     = 'campaign';
      confidence       = campaign.status === 'resolved' ? 0.75 : 0.5;
    }
  }

  if (input.sourceType === 'playbook_run') {
    const run = await AutonomousResponsePlaybookRun.findOne({ runKey: input.sourceKey }).lean() as any;
    if (run) {
      const summary = run.completionSummary ?? {};
      actualCost    = (summary.stepsExecuted ?? 1) * 4;
      baselineCost  = estimateIncidentCost({ scopesAffected: 1, durationMinutes: 30, governanceActions: 4 });
      incidentType  = 'playbook_recovery';
      confidence    = run.status === 'completed' ? 0.7 : 0.45;
    }
  }

  const costAvoided = Math.max(0, baselineCost - actualCost);
  const { savings, roi } = computeResilienceSavings({ reactiveCost: baselineCost, preventiveCost: actualCost || 1 });

  const event = await ResilienceEconomicEvent.create({
    eventKey, targetKey: input.targetKey,
    sourceType: input.sourceType, sourceKey: input.sourceKey,
    eventType: input.sourceType === 'preventive_decision' ? 'avoided_incident' : 'reactive_action',
    baselineCost, actualCost, costAvoided,
    downtimeMinutes, downtimePrevented,
    governanceActions, governanceSaved,
    incidentType, confidence,
    period: todayPeriod(),
  });

  // Create comparison record
  await ResilienceComparison.create({ comparisonKey: `${input.sourceKey}::cmp`, decisionKey: input.sourceKey, forecastType: incidentType ?? 'unknown', preventiveCost: actualCost, reactiveCostEstimate: baselineCost, savings, roi, confidence }).catch(() => {});

  return event;
}

// ── 7. Daily summary generator ────────────────────────────────────────────
export async function generateDailyResilienceSummary(): Promise<any> {
  await connectToDatabase();
  const period     = todayPeriod();
  const summaryKey = `summary::${period}`;

  const events = await ResilienceEconomicEvent.find({ period }).lean() as any[];
  if (!events.length) return null;

  const totalCostAvoided      = events.reduce((s, e) => s + (e.costAvoided       ?? 0), 0);
  const totalDowntimePrevented= events.reduce((s, e) => s + (e.downtimePrevented ?? 0), 0);
  const totalGovernanceSaved  = events.reduce((s, e) => s + (e.governanceSaved   ?? 0), 0);
  const totalPreventiveCost   = events.filter(e => e.eventType === 'avoided_incident').reduce((s, e) => s + (e.actualCost ?? 0), 0);
  const estimatedReactiveCost = events.filter(e => e.eventType === 'avoided_incident').reduce((s, e) => s + (e.baselineCost ?? 0), 0);

  const { roi } = computeResilienceSavings({ reactiveCost: estimatedReactiveCost, preventiveCost: totalPreventiveCost || 1 });
  const avgConf  = events.reduce((s, e) => s + (e.confidence ?? 0.5), 0) / events.length;

  return ResilienceEconomicSummary.findOneAndUpdate(
    { summaryKey },
    {
      summaryKey, period, periodType: 'daily',
      totalCostAvoided, totalDowntimePrevented, totalGovernanceSaved,
      incidentsAvoided:     events.filter(e => e.eventType === 'avoided_incident').length,
      campaignsAvoided:     events.filter(e => e.incidentType === 'campaign').length,
      rollbacksAvoided:     events.filter(e => e.incidentType?.includes('rollback')).length,
      preventiveActions:    events.filter(e => e.eventType === 'avoided_incident' || e.eventType === 'preventive_action').length,
      reactiveActions:      events.filter(e => e.eventType === 'reactive_action').length,
      totalPreventiveCost, estimatedReactiveCost, roi,
      confidence: +avgConf.toFixed(3),
    },
    { upsert: true, new: true }
  );
}
